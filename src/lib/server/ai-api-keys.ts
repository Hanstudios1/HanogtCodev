import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { API_KEYS_MAX_STORED, API_KEY_NAME_MAX, API_KEY_PATTERN, type ApiKeyView, type ApiKeysState } from "@/lib/ai/api-keys";
import { PLAN_AI_FEATURES, aiLimitsFor, effectivePlan, type PlanId } from "@/lib/plans";
import { hanogtUsageFor } from "./ai-usage";
import { featureAllowed } from "./features";
import { commitServerMutations, getServerDocument, isMissingDocument, isWriteConflict, patchServerDocument, runServerQuery } from "./firebase-rest";
import { getSubscription } from "./plans";

/*
 * Hanogt AI developer API keys. The key itself ("hnk_" + 32 random bytes) is
 * shown once, when it is made; only its SHA-256 is kept:
 *   ai_api_keys/{email}         { items: [{ id, name, hash, start, last4, createdAt }] }
 *   ai_api_key_index/{sha256}   { email, id, createdAt, lastUsedAt }
 * Both are written in one commit (making and revoking), the list with an
 * update-time precondition, so two tabs can't go past the plan's allowance.
 * A request finds its account through the index; after a downgrade the
 * oldest keys within the plan's allowance keep working. Both collections are
 * closed to browsers (firestore.rules). Kept free of next/server so the
 * plain-Node tests can load it.
 */

export const API_KEYS_COLLECTION = "ai_api_keys";
export const API_KEY_INDEX = "ai_api_key_index";
const LAST_USED_EVERY_MS = 10 * 60_000;

export const apiKeysPath = (email: string) => `${API_KEYS_COLLECTION}/${email}`;
export const apiKeyIndexPath = (hash: string) => `${API_KEY_INDEX}/${hash}`;

export type StoredApiKey = { id: string; name: string; hash: string; start: string; last4: string; createdAt: string | null };
export type ApiKeyIndex = { email: string; id: string; lastUsedAt: string | null };

export type ApiKeyErrorCode = "plan_required" | "limit_reached" | "not_found" | "conflict";

export class ApiKeyError extends Error {
    readonly code: ApiKeyErrorCode;
    constructor(code: ApiKeyErrorCode) {
        super(code);
        this.name = "ApiKeyError";
        this.code = code;
    }
}

export function hashApiKey(key: string) {
    return createHash("sha256").update(key, "utf8").digest("hex");
}

/** A new key and what is kept of it. */
export function generateApiKey() {
    const key = `hnk_${randomBytes(32).toString("base64url")}`;
    return { key, hash: hashApiKey(key), start: key.slice(0, 8), last4: key.slice(-4) };
}

/** Keys the plan allows: Free 0, Plus 2, Pro 5. */
export function apiKeyAllowance(plan: PlanId) {
    return PLAN_AI_FEATURES[plan].api?.keys ?? 0;
}

const isHash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const isKeyId = (value: unknown): value is string => typeof value === "string" && /^key_[0-9a-f]{16}$/.test(value);
const isoOrNull = (value: unknown) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null);

/** A key name as stored: printable, trimmed, at most API_KEY_NAME_MAX characters. */
export function cleanKeyName(value: unknown, fallback: string) {
    const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
    return [...(text || fallback)].slice(0, API_KEY_NAME_MAX).join("");
}

/** The stored list, checked (anything malformed is left out). */
export function readStoredKeys(value: unknown): StoredApiKey[] {
    const items = value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : [];
    const keys: StoredApiKey[] = [];
    for (const entry of items) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        if (!isKeyId(item.id) || !isHash(item.hash) || keys.some((key) => key.id === item.id)) continue;
        keys.push({
            id: item.id,
            name: cleanKeyName(item.name, "API"),
            hash: item.hash,
            start: typeof item.start === "string" ? item.start.slice(0, 8) : "hnk_",
            last4: typeof item.last4 === "string" ? item.last4.slice(-4) : "",
            createdAt: isoOrNull(item.createdAt),
        });
    }
    return keys.slice(0, API_KEYS_MAX_STORED);
}

/** The keys that work on `plan`: the oldest ones within its allowance. */
export function activeKeyIds(keys: readonly StoredApiKey[], plan: PlanId): Set<string> {
    const ordered = [...keys].sort((a, b) => (Date.parse(a.createdAt ?? "") || 0) - (Date.parse(b.createdAt ?? "") || 0) || a.id.localeCompare(b.id));
    return new Set(ordered.slice(0, apiKeyAllowance(plan)).map((key) => key.id));
}

function toView(key: StoredApiKey, active: Set<string>, lastUsedAt: string | null): ApiKeyView {
    return { id: key.id, name: key.name, start: key.start, last4: key.last4, createdAt: key.createdAt, lastUsedAt, active: active.has(key.id) };
}

async function readKeys(email: string) {
    const record = await getServerDocument<Record<string, unknown>>(apiKeysPath(email));
    return { keys: readStoredKeys(record), updateTime: record?._updateTime ?? null, exists: Boolean(record) };
}

/** The account's keys with when each was last used (from the index). */
export async function listApiKeys(email: string, plan: PlanId): Promise<ApiKeyView[]> {
    const { keys } = await readKeys(email);
    const active = activeKeyIds(keys, plan);
    const used = await Promise.all(keys.map((key) => getServerDocument<Record<string, unknown>>(apiKeyIndexPath(key.hash)).then((index) => isoOrNull(index?.lastUsedAt), () => null)));
    return keys.map((key, index) => toView(key, active, used[index]));
}

/**
 * Makes a key on `plan` and returns it once with its view. Refused on Free
 * and when the account already keeps as many keys as the plan allows (keys
 * kept from a bigger plan count too: revoke one first).
 */
export async function createApiKey(email: string, plan: PlanId, name: unknown, now = new Date()): Promise<{ key: string; item: ApiKeyView }> {
    const allowance = apiKeyAllowance(plan);
    if (allowance === 0) throw new ApiKeyError("plan_required");
    for (let attempt = 0; ; attempt += 1) {
        const { keys, updateTime, exists } = await readKeys(email);
        if (keys.length >= allowance) throw new ApiKeyError("limit_reached");
        const generated = generateApiKey();
        const stored: StoredApiKey = {
            id: `key_${randomBytes(8).toString("hex")}`,
            name: cleanKeyName(name, `API ${keys.length + 1}`),
            hash: generated.hash,
            start: generated.start,
            last4: generated.last4,
            createdAt: now.toISOString(),
        };
        const items = [...keys, stored].map((key) => ({ ...key, createdAt: key.createdAt ? new Date(key.createdAt) : now }));
        try {
            await commitServerMutations([
                exists
                    ? { type: "update", path: apiKeysPath(email), data: { items, email, updatedAt: now }, ...(updateTime ? { updateTime } : {}) }
                    : { type: "create", path: apiKeysPath(email), data: { items, email, updatedAt: now } },
                { type: "create", path: apiKeyIndexPath(generated.hash), data: { email, id: stored.id, createdAt: now, lastUsedAt: null } },
            ]);
        } catch (error) {
            if (isWriteConflict(error) && attempt < 2) continue;
            if (isWriteConflict(error)) throw new ApiKeyError("conflict");
            throw error;
        }
        return { key: generated.key, item: toView(stored, activeKeyIds([...keys, stored], plan), null) };
    }
}

/** Revokes one key: it leaves the list and the index in the same commit, so it stops working at once. */
export async function revokeApiKey(email: string, id: unknown, now = new Date()) {
    if (!isKeyId(id)) throw new ApiKeyError("not_found");
    for (let attempt = 0; ; attempt += 1) {
        const { keys, updateTime } = await readKeys(email);
        const target = keys.find((key) => key.id === id);
        if (!target) throw new ApiKeyError("not_found");
        const items = keys.filter((key) => key.id !== id).map((key) => ({ ...key, createdAt: key.createdAt ? new Date(key.createdAt) : now }));
        try {
            await commitServerMutations([
                { type: "update", path: apiKeysPath(email), data: { items, updatedAt: now }, updateFields: ["items", "updatedAt"], ...(updateTime ? { updateTime } : {}) },
                { type: "delete", path: apiKeyIndexPath(target.hash) },
            ]);
            return target;
        } catch (error) {
            if (isWriteConflict(error) && attempt < 2) continue;
            if (isWriteConflict(error)) throw new ApiKeyError("conflict");
            throw error;
        }
    }
}

/**
 * Every key of the account goes (staff's "revoke all", account deletion):
 * the list and every index entry naming the account, also ones a failed
 * write may have left behind. Returns how many keys there were.
 */
export async function revokeAllApiKeys(email: string): Promise<number> {
    const [{ keys }, strays] = await Promise.all([
        readKeys(email),
        runServerQuery<Record<string, unknown>>({ collectionId: API_KEY_INDEX, where: [{ field: "email", op: "EQUAL", value: email }], limit: 100 }),
    ]);
    const hashes = new Set([...keys.map((key) => key.hash), ...strays.map((entry) => entry._id).filter(isHash)]);
    await commitServerMutations([
        { type: "delete", path: apiKeysPath(email) },
        ...[...hashes].map((hash) => ({ type: "delete" as const, path: apiKeyIndexPath(hash) })),
    ]);
    return keys.length;
}

/** For the data export: names, the visible parts and dates; never a key or its hash. */
export async function exportApiKeys(email: string) {
    const { keys } = await readKeys(email);
    const used = await Promise.all(keys.map((key) => getServerDocument<Record<string, unknown>>(apiKeyIndexPath(key.hash)).then((index) => isoOrNull(index?.lastUsedAt), () => null)));
    return keys.map((key, index) => ({ name: key.name, start: key.start, last4: key.last4, createdAt: key.createdAt, lastUsedAt: used[index] }));
}

/** How many keys the account keeps (staff view); null when it can't be read. */
export async function apiKeyCount(email: string): Promise<number | null> {
    return readKeys(email).then(({ keys }) => keys.length, () => null);
}

/** The account a well-formed key belongs to; null for an unknown (or revoked) key. */
export async function findApiKey(key: string): Promise<(ApiKeyIndex & { hash: string }) | null> {
    if (!API_KEY_PATTERN.test(key)) return null;
    const hash = hashApiKey(key);
    const index = await getServerDocument<Record<string, unknown>>(apiKeyIndexPath(hash));
    if (!index || typeof index.email !== "string" || !isKeyId(index.id)) return null;
    return { email: index.email, id: index.id, lastUsedAt: isoOrNull(index.lastUsedAt), hash };
}

/** The account's stored keys (for the plan's allowance check on a request). */
export async function storedApiKeys(email: string) {
    return (await readKeys(email)).keys;
}

/**
 * Notes when the key was used, at most every ten minutes, and only while
 * the key still exists (a revoked key's index entry never comes back).
 */
export async function touchApiKey(found: { hash: string; lastUsedAt: string | null }, now = new Date()) {
    const last = found.lastUsedAt ? Date.parse(found.lastUsedAt) : 0;
    if (Number.isFinite(last) && now.getTime() - last < LAST_USED_EVERY_MS) return false;
    try {
        await patchServerDocument(apiKeyIndexPath(found.hash), { lastUsedAt: now }, { updateFields: ["lastUsedAt"], exists: true });
        return true;
    } catch (error) {
        if (isMissingDocument(error)) return false;
        throw error;
    }
}

/**
 * GET /api/ai/keys: the account's keys, what the plan allows and the Hanogt AI
 * messages used (the API shares them with the chat). `allowed` says whether
 * the team opened the API for the account (keys can be made only then).
 */
export async function apiKeysStateFor(email: string, staff: boolean): Promise<ApiKeysState> {
    const subscription = await getSubscription(email);
    const plan = effectivePlan(subscription);
    const api = PLAN_AI_FEATURES[plan].api;
    const [keys, allowed, usage] = await Promise.all([
        listApiKeys(email, plan),
        featureAllowed("ai_api", { staff, plan }),
        api ? hanogtUsageFor(email, subscription) : null,
    ]);
    return {
        plan,
        limit: apiKeyAllowance(plan),
        limits: api ? aiLimitsFor(subscription) : null,
        keys,
        usage,
        allowed,
    };
}
