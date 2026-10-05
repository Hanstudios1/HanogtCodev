import "server-only";

import { randomUUID } from "node:crypto";
import {
    AI_PROVIDERS,
    ANTHROPIC_MODELS_URL,
    ANTHROPIC_VERSION,
    MAX_STORED_AI_CONNECTIONS,
    MODEL_LIST_MAX,
    PLAN_AI_CONNECTIONS,
    aiProvider,
    isAiProviderId,
    isRetiredProviderId,
    isStoredProviderId,
    providerName,
    isConnectionError,
    isConnectionId,
    isLikelyChatModel,
    isPlausibleApiKey,
    keyHintOf,
    normalizeConnectionLabel,
    normalizeModelId,
    providerInfo,
    type AiConnectionError,
    type AiConnectionView,
    type AiConnectionsState,
    type AiKeyTestFailure,
    type AiKeyTestResult,
    type AiProviderId,
    type StoredProviderId,
} from "@/lib/ai/connections";
import { FREE_SUBSCRIPTION, effectivePlan, type PlanId } from "@/lib/plans";
import { commitServerMutations, getServerDocument, isWriteConflict } from "./firebase-rest";
import { getSubscription } from "./plans";
import { aiKeyAssociatedData, isSecretBoxConfigured, openSecret, sealSecret } from "./secret-box";

/**
 * Hanogt AI connections of one account (src/lib/ai/connections.ts): the
 * person's own provider accounts, each with an API key sealed by
 * secret-box.ts. Everything lives in one server-only document,
 * ai_connections/{email} = { items: [...] }, changed with updateTime
 * preconditions. A plan allows the oldest N connections (PLAN_AI_CONNECTIONS);
 * the rest are kept but switched off, e.g. after moving from Pro to Plus.
 * Keys are never returned, logged or put in error messages; the browser only
 * ever sees their last four characters.
 */

/** One stored connection; `keySealed` never leaves the server. */
export type StoredConnection = {
    id: string;
    /** A retired provider (RETIRED_PROVIDER_IDS) is kept so the person can delete the connection; it is never used. */
    provider: StoredProviderId;
    label: string;
    model: string;
    keySealed: string;
    keyHint: string;
    createdAt: string;
    lastUsedAt: string | null;
    lastError: AiConnectionError | null;
    /** When the person consented to their messages going to this provider abroad (KVKK m.9/6-a). */
    consentAt: string | null;
};

type StoredRecord = { items: StoredConnection[]; exists: boolean; updateTime: string | null };

export const AI_CONNECTIONS_COLLECTION = "ai_connections";
export const aiConnectionsPath = (email: string) => `${AI_CONNECTIONS_COLLECTION}/${email}`;

/** Rate-limit keys of messages sent through the person's own connections (defined in ./plans next to Hanogt AI's). */
export { OWN_KEY_LIMIT_KEYS } from "./plans";

export const KEY_TEST_TIMEOUT_MS = 10_000;
/** OpenRouter's public model list is the largest (a few MB with descriptions). */
const MODEL_LIST_BYTES = 8_000_000;
const ERROR_BODY_BYTES = 4_000;
const WRITE_ATTEMPTS = 4;
/** lastUsedAt is written at most once a minute per connection (unless the outcome changes). */
const USE_RECORD_INTERVAL_MS = 60_000;

export type ConnectionFailureCode = "plan_required" | "limit_reached" | "invalid_key" | "provider_error" | "unreachable" | "not_found" | "invalid_request" | "encryption_unavailable" | "consent_required";
export type ConnectionResult = { ok: true; state: AiConnectionsState } | { ok: false; code: ConnectionFailureCode };
export type AddConnectionResult = { ok: true; state: AiConnectionsState; id: string } | { ok: false; code: ConnectionFailureCode };

// ---------------------------------------------------------------------------
// Stored record
// ---------------------------------------------------------------------------

function isoOf(value: unknown): string | null {
    if (typeof value === "string") {
        const time = Date.parse(value);
        return Number.isFinite(time) ? new Date(time).toISOString() : null;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
    return null;
}

function storedConnectionOf(value: unknown): StoredConnection | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (!isConnectionId(record.id) || !isStoredProviderId(record.provider) || typeof record.keySealed !== "string" || !record.keySealed) return null;
    const provider = record.provider;
    return {
        id: record.id,
        provider,
        label: normalizeConnectionLabel(record.label, providerName(provider)),
        model: normalizeModelId(provider, record.model),
        keySealed: record.keySealed,
        keyHint: typeof record.keyHint === "string" ? record.keyHint.slice(0, 8) : "",
        createdAt: isoOf(record.createdAt) ?? new Date(0).toISOString(),
        lastUsedAt: isoOf(record.lastUsedAt),
        lastError: isConnectionError(record.lastError) ? record.lastError : null,
        consentAt: isoOf(record.consentAt),
    };
}

/** Oldest first (ties keep their stored order): the plan's allowance covers the earliest connections. */
function oldestFirst(items: StoredConnection[]) {
    return items
        .map((item, index) => ({ item, index, time: Date.parse(item.createdAt) || 0 }))
        .sort((a, b) => a.time - b.time || a.index - b.index)
        .map(({ item }) => item);
}

/** Valid, distinct connections of a stored `items` value, oldest first. */
export function readStoredConnections(value: unknown): StoredConnection[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const items: StoredConnection[] = [];
    for (const entry of value) {
        const item = storedConnectionOf(entry);
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
    }
    return oldestFirst(items).slice(0, MAX_STORED_AI_CONNECTIONS);
}

async function readRecord(email: string): Promise<StoredRecord> {
    const record = await getServerDocument<{ items?: unknown }>(aiConnectionsPath(email));
    return { items: readStoredConnections(record?.items), exists: Boolean(record), updateTime: record?._updateTime ?? null };
}

/** Writes the items as a version-checked change of `record` (an empty list deletes the document). */
async function writeRecord(email: string, record: StoredRecord, items: StoredConnection[]) {
    const path = aiConnectionsPath(email);
    const condition = record.updateTime ? { updateTime: record.updateTime } : {};
    if (!items.length) {
        if (record.exists) await commitServerMutations([{ type: "delete", path, ...condition }]);
        return;
    }
    const data = { items, updatedAt: new Date().toISOString() };
    await commitServerMutations([record.exists ? { type: "update", path, data, ...condition } : { type: "create", path, data }]);
}

/**
 * Reads the record, applies `change` and writes the result with a
 * precondition, starting over when another request wrote first. `change`
 * returns no `items` when there is nothing to write.
 */
async function mutateRecord<T>(email: string, change: (record: StoredRecord) => { items?: StoredConnection[]; result: T }, first?: StoredRecord): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
        const record = attempt === 1 && first ? first : await readRecord(email);
        const outcome = change(record);
        if (!outcome.items) return outcome.result;
        try {
            await writeRecord(email, record, outcome.items);
            return outcome.result;
        } catch (error) {
            if (!isWriteConflict(error) || attempt >= WRITE_ATTEMPTS) throw error;
        }
    }
}

// ---------------------------------------------------------------------------
// Plan allowance and the browser's view
// ---------------------------------------------------------------------------

export type ConnectionAllowance = { plan: PlanId; limit: number };

/** Connections the person's plan allows; none (Free) when the subscription can't be read. */
export async function connectionAllowance(email: string): Promise<ConnectionAllowance> {
    const subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    return allowanceOf(effectivePlan(subscription));
}

/** Connections of providers that are still supported: the ones the plan's allowance counts. */
const usable = (items: StoredConnection[]) => items.filter((item) => !isRetiredProviderId(item.provider));

function viewOf(item: StoredConnection, active: boolean): AiConnectionView {
    return {
        id: item.id,
        provider: item.provider,
        label: item.label,
        model: item.model,
        keyHint: item.keyHint,
        createdAt: item.createdAt,
        lastUsedAt: item.lastUsedAt,
        lastError: item.lastError,
        consentAt: item.consentAt,
        active,
        retired: isRetiredProviderId(item.provider),
    };
}

function stateOf(allowance: ConnectionAllowance, items: StoredConnection[]): AiConnectionsState {
    // The allowance covers the oldest connections of supported providers; retired ones are never active.
    let slot = 0;
    return {
        plan: allowance.plan,
        limit: allowance.limit,
        canStore: isSecretBoxConfigured(),
        providers: AI_PROVIDERS.map(providerInfo),
        items: oldestFirst(items).map((item) => viewOf(item, !isRetiredProviderId(item.provider) && slot++ < allowance.limit)),
    };
}

/** The person's connections without keys; `active` marks the ones their plan covers. */
export async function listConnections(email: string): Promise<AiConnectionsState> {
    const [record, allowance] = await Promise.all([readRecord(email), connectionAllowance(email)]);
    return stateOf(allowance, record.items);
}

// ---------------------------------------------------------------------------
// Key checks
// ---------------------------------------------------------------------------

/** Reads at most `maxBytes` of a body as text; null when it is longer or breaks off. */
async function readLimited(response: Response, maxBytes: number): Promise<string | null> {
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) {
                await reader.cancel().catch(() => undefined);
                return null;
            }
            chunks.push(value);
        }
    } catch {
        return null;
    }
    return Buffer.concat(chunks).toString("utf8");
}

async function readJsonLimited(response: Response, maxBytes: number): Promise<unknown> {
    const text = await readLimited(response, maxBytes);
    if (text === null) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}

function discard(response: Response) {
    void response.body?.cancel().catch(() => undefined);
}

// Model types of lists that mix chat models with others (Together AI).
const NON_CHAT_TYPES = new Set(["image", "embedding", "embeddings", "moderation", "rerank", "audio", "transcribe", "video", "tts"]);

/** Chat model ids of a provider's model list ({ data: [...] } or a bare array): deduplicated, sorted, at most MODEL_LIST_MAX. */
export function modelIdsOf(payload: unknown, provider: AiProviderId): string[] {
    const list = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : [];
    const ids = new Set<string>();
    for (const entry of list.slice(0, 20_000)) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as { id?: unknown; type?: unknown };
        if (typeof record.type === "string" && NON_CHAT_TYPES.has(record.type.toLowerCase())) continue;
        const id = normalizeModelId(provider, record.id);
        if (id && isLikelyChatModel(id)) ids.add(id);
    }
    return [...ids].sort().slice(0, MODEL_LIST_MAX);
}

/** A plain GET with only the key fails with 400 (Gemini, xAI), 401 or 403 when the key itself is wrong. */
function keyCheckFailure(status: number): AiKeyTestFailure | null {
    if (status >= 200 && status < 300) return null;
    return status === 400 || status === 401 || status === 403 ? "invalid_key" : "provider_error";
}

async function modelsResult(response: Response, provider: AiProviderId): Promise<AiKeyTestResult> {
    const failure = keyCheckFailure(response.status);
    if (failure) {
        discard(response);
        return { ok: false, reason: failure };
    }
    return { ok: true, models: modelIdsOf(await readJsonLimited(response, MODEL_LIST_BYTES), provider) };
}

/**
 * Checks an API key with the provider (10 s in total) and returns the chat
 * models it can use. The provider's own response text is never passed on.
 */
export async function testKey(provider: AiProviderId, apiKey: string, options: { timeoutMs?: number } = {}): Promise<AiKeyTestResult> {
    const key = typeof apiKey === "string" ? apiKey.trim() : "";
    if (!isAiProviderId(provider) || !isPlausibleApiKey(key)) return { ok: false, reason: "invalid_key" };
    const info = aiProvider(provider);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? KEY_TEST_TIMEOUT_MS);
    // Fixed hosts only; a redirect would take the key elsewhere, so it is an error.
    const get = (url: string, headers: Record<string, string>) => fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...headers },
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
    });
    try {
        if (info.check === "anthropic") {
            return await modelsResult(await get(`${ANTHROPIC_MODELS_URL}?limit=1000`, { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION }), provider);
        }
        const auth = { Authorization: `Bearer ${key}` };
        if (info.check === "openrouter") {
            let response = await get(`${info.baseUrl}/key`, auth);
            if (response.status === 404) {
                discard(response);
                response = await get(`${info.baseUrl}/auth/key`, auth);
            }
            const failure = keyCheckFailure(response.status);
            discard(response);
            if (failure) return { ok: false, reason: failure };
            // The key works; the model list only fills the picker.
            const models = await get(`${info.baseUrl}/models`, auth)
                .then((list) => modelsResult(list, provider))
                .then((result) => (result.ok ? result.models : []), () => []);
            return { ok: true, models };
        }
        return await modelsResult(await get(`${info.baseUrl}/models`, auth), provider);
    } catch {
        // Network failure, a redirect or the time limit.
        return { ok: false, reason: "unreachable" };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Whether the person may check a key now: their plan allows connections and
 * one more fits. Keeps the key check from being used for anything but adding.
 */
export async function canAddConnection(email: string): Promise<{ ok: true } | { ok: false; code: "plan_required" | "limit_reached" | "encryption_unavailable" }> {
    if (!isSecretBoxConfigured()) return { ok: false, code: "encryption_unavailable" };
    const [allowance, record] = await Promise.all([connectionAllowance(email), readRecord(email)]);
    if (allowance.limit <= 0) return { ok: false, code: "plan_required" };
    if (usable(record.items).length >= allowance.limit) return { ok: false, code: "limit_reached" };
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

export type AddConnectionInput = { provider: unknown; apiKey: unknown; model: unknown; label?: unknown; consent?: unknown };

/**
 * Adds a connection when the person gave explicit consent to sending their
 * messages to the provider abroad (KVKK m.9/6-a; recorded as consentAt) and
 * the plan has room (connections already stored count, active or not). The
 * key is checked with the provider again here, whatever the browser's own
 * check said, then sealed to this account and id.
 */
export async function addConnection(email: string, input: AddConnectionInput, options: { timeoutMs?: number } = {}): Promise<AddConnectionResult> {
    if (!isAiProviderId(input.provider)) return { ok: false, code: "invalid_request" };
    const provider = input.provider;
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    const model = normalizeModelId(provider, input.model);
    if (!isPlausibleApiKey(apiKey) || !model) return { ok: false, code: "invalid_request" };
    if (input.consent !== true) return { ok: false, code: "consent_required" };
    const label = normalizeConnectionLabel(input.label, aiProvider(provider).name);
    if (!isSecretBoxConfigured()) return { ok: false, code: "encryption_unavailable" };

    const [allowance, before] = await Promise.all([connectionAllowance(email), readRecord(email)]);
    if (allowance.limit <= 0) return { ok: false, code: "plan_required" };
    if (usable(before.items).length >= allowance.limit) return { ok: false, code: "limit_reached" };

    const check = await testKey(provider, apiKey, options);
    if (!check.ok) return { ok: false, code: check.reason };

    const id = randomUUID();
    let keySealed: string;
    try {
        keySealed = sealSecret(apiKey, aiKeyAssociatedData(email, id));
    } catch {
        return { ok: false, code: "encryption_unavailable" };
    }
    const now = new Date().toISOString();
    const item: StoredConnection = { id, provider, label, model, keySealed, keyHint: keyHintOf(apiKey), createdAt: now, lastUsedAt: null, lastError: null, consentAt: now };
    return mutateRecord<AddConnectionResult>(email, (record) => {
        if (usable(record.items).length >= allowance.limit) return { result: { ok: false, code: "limit_reached" } };
        const items = [...record.items, item];
        return { items, result: { ok: true, state: stateOf(allowance, items), id } };
    }, before);
}

/** Renames a connection or changes its model (the key can't be changed: delete and add again). */
export async function updateConnection(email: string, id: unknown, patch: { label?: unknown; model?: unknown }): Promise<ConnectionResult> {
    if (!isConnectionId(id)) return { ok: false, code: "not_found" };
    const changesLabel = patch.label !== undefined;
    const changesModel = patch.model !== undefined;
    if (!changesLabel && !changesModel) return { ok: false, code: "invalid_request" };
    const allowance = await connectionAllowance(email);
    return mutateRecord<ConnectionResult>(email, (record) => {
        const current = record.items.find((item) => item.id === id);
        if (!current) return { result: { ok: false, code: "not_found" } };
        // A retired provider's connection can only be deleted.
        if (isRetiredProviderId(current.provider)) return { result: { ok: false, code: "invalid_request" } };
        const model = changesModel ? normalizeModelId(current.provider, patch.model) : current.model;
        if (!model) return { result: { ok: false, code: "invalid_request" } };
        const label = changesLabel ? normalizeConnectionLabel(patch.label, providerName(current.provider)) : current.label;
        if (label === current.label && model === current.model) return { result: { ok: true, state: stateOf(allowance, record.items) } };
        // A new model starts afresh: an old "model not found" no longer applies.
        const next: StoredConnection = { ...current, label, model, lastError: model === current.model ? current.lastError : null };
        const items = record.items.map((item) => (item.id === id ? next : item));
        return { items, result: { ok: true, state: stateOf(allowance, items) } };
    });
}

/** Deletes a connection with its encrypted key (the last one takes the document with it). */
export async function deleteConnection(email: string, id: unknown): Promise<ConnectionResult> {
    if (!isConnectionId(id)) return { ok: false, code: "not_found" };
    const allowance = await connectionAllowance(email);
    return mutateRecord<ConnectionResult>(email, (record) => {
        if (!record.items.some((item) => item.id === id)) return { result: { ok: false, code: "not_found" } };
        const items = record.items.filter((item) => item.id !== id);
        return { items, result: { ok: true, state: stateOf(allowance, items) } };
    });
}

/** Account deletion: removes every connection and encrypted key of the account. Returns how many there were. */
export async function deleteAllConnections(email: string): Promise<number> {
    const path = aiConnectionsPath(email);
    const record = await getServerDocument<{ items?: unknown }>(path).catch(() => null);
    await commitServerMutations([{ type: "delete", path }]);
    return Array.isArray(record?.items) ? record.items.length : 0;
}

/** The person's connections for their data export (KVKK): never the encrypted key, only its last four characters. */
export async function exportAiConnections(email: string) {
    const record = await readRecord(email);
    return record.items.map((item) => ({
        provider: item.provider,
        providerName: providerName(item.provider),
        label: item.label,
        model: item.model,
        keyHint: item.keyHint,
        createdAt: item.createdAt,
        consentAt: item.consentAt,
        lastUsedAt: item.lastUsedAt,
        lastError: item.lastError,
    }));
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/** What /api/ai needs to call the person's provider. Server memory only. */
export type ResolvedConnection = {
    id: string;
    provider: AiProviderId;
    baseUrl: string;
    model: string;
    apiKey: string;
    label: string;
    lastUsedAt: string | null;
    lastError: AiConnectionError | null;
};

/** Connections a plan allows (PLAN_AI_CONNECTIONS, never more than are ever stored). */
function allowanceOf(plan: PlanId): ConnectionAllowance {
    return { plan, limit: Math.max(0, Math.min(PLAN_AI_CONNECTIONS[plan] ?? 0, MAX_STORED_AI_CONNECTIONS)) };
}

/**
 * The connection with its key, only while the person's plan covers it; null
 * otherwise. `plan`: the plan the chat route already read (no second read).
 */
export async function resolveConnectionForChat(email: string, id: unknown, plan?: PlanId): Promise<ResolvedConnection | null> {
    if (!isConnectionId(id)) return null;
    const [record, allowance] = await Promise.all([readRecord(email), plan ? allowanceOf(plan) : connectionAllowance(email)]);
    const supported = usable(record.items);
    const position = supported.findIndex((item) => item.id === id);
    if (position < 0 || position >= allowance.limit) return null;
    const item = supported[position];
    if (!item.model || isRetiredProviderId(item.provider)) return null;
    let apiKey: string;
    try {
        apiKey = openSecret(item.keySealed, aiKeyAssociatedData(email, item.id));
    } catch {
        // Tampered with, copied from another record, or sealed under a server secret that has changed.
        await markUsed(email, item.id, "key_unreadable");
        return null;
    }
    return {
        id: item.id,
        provider: item.provider,
        baseUrl: aiProvider(item.provider).baseUrl,
        model: item.model,
        apiKey,
        label: item.label,
        lastUsedAt: item.lastUsedAt,
        lastError: item.lastError,
    };
}

/** Whether a use is worth writing: the outcome changed, or the last record is a minute old. */
export function shouldRecordUse(previous: { lastUsedAt: string | null; lastError: AiConnectionError | null }, error: AiConnectionError | null, now = Date.now()) {
    if (previous.lastError !== error) return true;
    const last = previous.lastUsedAt ? Date.parse(previous.lastUsedAt) : Number.NaN;
    return !Number.isFinite(last) || now - last >= USE_RECORD_INTERVAL_MS;
}

/** Records when a connection was last used and whether that failed (null clears the error). Best effort: never throws. */
export async function markUsed(email: string, id: string, error: AiConnectionError | null = null, now = Date.now()): Promise<boolean> {
    try {
        return await mutateRecord<boolean>(email, (record) => {
            const current = record.items.find((item) => item.id === id);
            if (!current || !shouldRecordUse(current, error, now)) return { result: false };
            const items = record.items.map((item) => (item.id === id ? { ...item, lastUsedAt: new Date(now).toISOString(), lastError: error } : item));
            return { items, result: true };
        });
    } catch {
        return false;
    }
}

const KEY_ERROR = /api[\s_-]?key|unauthori[sz]ed|authenticat/i;
const MODEL_ERROR = /model_not_found|(?:invalid|unknown|unsupported)[\s_-]?model|not a valid model|model[^\n]{0,120}?(?:does not exist|not found|decommissioned|no longer supported|is not supported)/i;
const QUOTA_ERROR = /insufficient_quota|quota|billing|credit/i;

/**
 * Why a chat request through a connection failed, from the provider's status
 * and, for 400/422/429, a look at its error body (read here, never passed on).
 */
export async function classifyProviderFailure(response: Response): Promise<AiConnectionError> {
    const { status } = response;
    if (status === 400 || status === 422 || status === 429) {
        const text = (await readLimited(response, ERROR_BODY_BYTES)) ?? "";
        // OpenAI answers 429 "insufficient_quota" when the account has no credit left.
        if (status === 429) return QUOTA_ERROR.test(text) ? "quota" : "rate_limited";
        if (KEY_ERROR.test(text)) return "invalid_key";
        return MODEL_ERROR.test(text) ? "model_not_found" : "provider_error";
    }
    discard(response);
    if (status === 401 || status === 403) return "invalid_key";
    if (status === 402) return "quota";
    if (status === 404) return "model_not_found";
    return "provider_error";
}
