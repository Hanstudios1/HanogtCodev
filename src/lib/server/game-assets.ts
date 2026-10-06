import "server-only";

import { createHash } from "node:crypto";
import { effectivePlan, FREE_SUBSCRIPTION, GAME_AUDIO_MAX_BYTES, PLAN_GAME_AUDIO_LIMITS, type PlanGameAudioLimits, type PlanId } from "@/lib/plans";
import { healBeforeRefusing, type HealOptions } from "./entitlements";
import { commitServerMutations, getServerDocument, isWriteConflict, runServerQuery } from "./firebase-rest";
import { getSubscription } from "./plans";

/*
 * Audio files of Hanogt Engine games (V4).
 *
 * Files are stored once, by the SHA-256 of their bytes, in game_assets/<hash>
 * (immutable; at most 300 KB, so one Firestore document holds one file).
 * Who keeps a file is recorded in game_asset_owners: an account (which counts
 * the file against its plan's audio storage) or a published Arcade game (so a
 * game keeps working after its author removes the file from their library or
 * deletes their account). A file without owners is deleted. Reading a file
 * needs its hash only: hashes are unguessable, and published games must load
 * their sounds for anyone.
 */

const ASSETS = "game_assets";
const OWNERS = "game_asset_owners";
const USAGE = "game_asset_usage";
const HASH = /^[0-9a-f]{64}$/;

export type GameAudioType = "audio/wav" | "audio/mpeg" | "audio/ogg";

export type GameAssetErrorCode = "not_found" | "unsupported_audio" | "too_large" | "empty" | "audio_quota" | "invalid_hash";

export class GameAssetError extends Error {
    readonly status: number;
    readonly code: GameAssetErrorCode;
    readonly extra: Record<string, unknown>;
    constructor(status: number, code: GameAssetErrorCode, message: string, extra: Record<string, unknown> = {}) {
        super(message);
        this.name = "GameAssetError";
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

type AssetRecord = { hash?: string; contentType?: string; size?: number; data?: unknown; createdAt?: string; _path?: string };
type OwnerRecord = { owner?: string; hash?: string; size?: number; name?: string; contentType?: string; createdAt?: string; _id?: string; _path?: string };
type UsageRecord = { owner?: string; bytes?: number; files?: number };

/** WAV, MP3 or Ogg by their first bytes; anything else is refused, so only audio is stored and served. */
export function sniffGameAudio(bytes: Uint8Array): GameAudioType | null {
    if (bytes.length < 12) return null;
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "audio/wav";
    if (ascii(0, 4) === "OggS") return "audio/ogg";
    if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
    return null;
}

export function assertAudioHash(value: unknown): string {
    if (typeof value !== "string" || !HASH.test(value)) throw new GameAssetError(400, "invalid_hash", "Geçersiz ses dosyası kimliği.");
    return value;
}

/** Owner key: a short hash of the owner (an e-mail or "arcade:<gameId>"), so ids never contain e-mails. */
function ownerKey(owner: string) {
    return createHash("sha256").update(owner.toLowerCase()).digest("hex").slice(0, 32);
}

const ownerPath = (owner: string, hash: string) => `${OWNERS}/${ownerKey(owner)}_${hash}`;
const usagePath = (owner: string) => `${USAGE}/${ownerKey(owner)}`;
const arcadeOwner = (gameId: string) => `arcade:${gameId}`;

function cleanName(value: unknown) {
    const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
    return (text || "Sound").slice(0, 80);
}

export type GameAudioUsage = { plan: PlanId; bytes: number; files: number; limit: PlanGameAudioLimits; maxFileBytes: number };

async function usageOf(email: string, plan?: PlanId): Promise<GameAudioUsage> {
    const record = await getServerDocument<UsageRecord>(usagePath(email));
    const resolved = plan ?? effectivePlan(await getSubscription(email).catch(() => FREE_SUBSCRIPTION));
    return {
        plan: resolved,
        bytes: Math.max(0, Number(record?.bytes || 0)),
        files: Math.max(0, Number(record?.files || 0)),
        limit: PLAN_GAME_AUDIO_LIMITS[resolved],
        maxFileBytes: GAME_AUDIO_MAX_BYTES,
    };
}

/** The account's audio storage against its plan (the Plans page's usage list). */
export function gameAudioUsageFor(email: string, plan: PlanId): Promise<GameAudioUsage> {
    return usageOf(email.toLowerCase(), plan);
}

export type UploadedGameAudio = { hash: string; contentType: GameAudioType; size: number; name: string; duplicate: boolean; usage: GameAudioUsage };

/** Stores an audio file for an account (or finds the one it already has) within the plan's audio storage. */
export async function uploadGameAudio(email: string, bytes: Uint8Array, name: unknown, options: HealOptions = {}): Promise<UploadedGameAudio> {
    if (!bytes.byteLength) throw new GameAssetError(400, "empty", "Ses dosyası boş.");
    if (bytes.byteLength > GAME_AUDIO_MAX_BYTES) throw new GameAssetError(413, "too_large", `Ses dosyası en fazla ${Math.round(GAME_AUDIO_MAX_BYTES / 1024)} KB olabilir.`);
    const contentType = sniffGameAudio(bytes);
    if (!contentType) throw new GameAssetError(415, "unsupported_audio", "Yalnızca WAV, MP3 ve OGG ses dosyaları yüklenebilir.");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const owner = email.toLowerCase();
    const label = cleanName(name);
    const existing = await getServerDocument<OwnerRecord>(ownerPath(owner, hash));
    if (existing) return { hash, contentType, size: bytes.byteLength, name: existing.name || label, duplicate: true, usage: await usageOf(owner) };

    let usage = await usageOf(owner);
    const fits = (current: GameAudioUsage) => current.bytes + bytes.byteLength <= current.limit.bytes && current.files + 1 <= current.limit.files;
    if (!fits(usage)) {
        const healed = await healBeforeRefusing(owner, null, options);
        if (healed.upgraded) usage = await usageOf(owner, healed.plan);
        if (!fits(usage)) {
            throw new GameAssetError(409, "audio_quota", "Planının ses depolama alanı doldu. Kullanmadığın sesleri sil ya da planını yükselt: /plans", {
                plan: usage.plan, limitBytes: usage.limit.bytes, limitFiles: usage.limit.files, usedBytes: usage.bytes, usedFiles: usage.files,
            });
        }
    }

    const now = new Date().toISOString();
    try {
        await commitServerMutations([{ type: "create", path: `${ASSETS}/${hash}`, data: { hash, contentType, size: bytes.byteLength, data: bytes, createdAt: now } }]);
    } catch (error) {
        // Someone stored the same file already: it is immutable, so theirs is the same bytes.
        if (!isWriteConflict(error)) throw error;
    }
    try {
        await commitServerMutations([
            { type: "create", path: ownerPath(owner, hash), data: { owner, hash, size: bytes.byteLength, name: label, contentType, createdAt: now } },
            { type: "increment", path: usagePath(owner), fields: { bytes: bytes.byteLength, files: 1 } },
        ]);
    } catch (error) {
        // A second upload of the same file at the same moment: one of them counts it.
        if (!isWriteConflict(error)) throw error;
        return { hash, contentType, size: bytes.byteLength, name: label, duplicate: true, usage: await usageOf(owner) };
    }
    return { hash, contentType, size: bytes.byteLength, name: label, duplicate: false, usage: { ...usage, bytes: usage.bytes + bytes.byteLength, files: usage.files + 1 } };
}

/** The bytes of a stored file. */
export async function readGameAudio(hashValue: unknown): Promise<{ bytes: Uint8Array; contentType: GameAudioType }> {
    const hash = assertAudioHash(hashValue);
    const record = await getServerDocument<AssetRecord>(`${ASSETS}/${hash}`);
    if (!record || !(record.data instanceof Uint8Array) || !record.data.byteLength) throw new GameAssetError(404, "not_found", "Ses dosyası bulunamadı.");
    const contentType = sniffGameAudio(record.data);
    if (!contentType) throw new GameAssetError(404, "not_found", "Ses dosyası bulunamadı.");
    return { bytes: record.data, contentType };
}

/** Commits deletes in batches (a commit holds at most 500 writes). */
async function deleteAll(paths: string[]) {
    for (let start = 0; start < paths.length; start += 400) {
        await commitServerMutations(paths.slice(start, start + 400).map((path) => ({ type: "delete" as const, path })));
    }
}

/** Deletes files nobody keeps any more. */
async function collect(hashes: Iterable<string>) {
    for (const hash of new Set(hashes)) {
        const owners = await runServerQuery<OwnerRecord>({ collectionId: OWNERS, where: [{ field: "hash", op: "EQUAL", value: hash }], select: ["hash"], limit: 1 });
        if (!owners.length) await commitServerMutations([{ type: "delete", path: `${ASSETS}/${hash}` }]);
    }
}

/** Removes a file from an account's library (and from the store when nothing else keeps it). */
export async function releaseGameAudio(email: string, hashValue: unknown): Promise<{ removed: boolean; usage: GameAudioUsage }> {
    const hash = assertAudioHash(hashValue);
    const owner = email.toLowerCase();
    const record = await getServerDocument<OwnerRecord>(ownerPath(owner, hash));
    if (!record) return { removed: false, usage: await usageOf(owner) };
    const size = Math.max(0, Number(record.size || 0));
    await commitServerMutations([
        { type: "delete", path: ownerPath(owner, hash), updateTime: (record as { _updateTime?: string })._updateTime },
        { type: "increment", path: usagePath(owner), fields: { bytes: -size, files: -1 } },
    ]);
    await collect([hash]);
    return { removed: true, usage: await usageOf(owner) };
}

export type GameAudioListItem = { hash: string; name: string; size: number; contentType: string; createdAt: string | null };

/** An account's uploaded files and how much of its plan's audio storage they use. */
export async function listGameAudio(email: string): Promise<{ files: GameAudioListItem[]; usage: GameAudioUsage }> {
    const owner = email.toLowerCase();
    const records = await runServerQuery<OwnerRecord>({
        collectionId: OWNERS,
        where: [{ field: "owner", op: "EQUAL", value: owner }],
        select: ["hash", "name", "size", "contentType", "createdAt"],
        limit: 1000,
    });
    const files = records
        .filter((record) => typeof record.hash === "string" && HASH.test(record.hash))
        .map((record) => ({ hash: record.hash as string, name: cleanName(record.name), size: Number(record.size || 0), contentType: String(record.contentType || ""), createdAt: record.createdAt ?? null }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { files, usage: await usageOf(owner) };
}

/** Whether every file exists in the store (published games may only use stored files). */
export async function missingGameAudio(hashes: string[]): Promise<string[]> {
    const missing: string[] = [];
    for (const hash of new Set(hashes)) {
        const found = await runServerQuery<AssetRecord>({ collectionId: ASSETS, where: [{ field: "hash", op: "EQUAL", value: hash }], select: ["hash"], limit: 1 });
        if (!found.length) missing.push(hash);
    }
    return missing;
}

/**
 * Makes a published Arcade game keep exactly these files (its own copies, so
 * the game plays on after the author removes them or deletes the account).
 */
export async function syncArcadeAudio(gameId: string, hashes: string[]) {
    const owner = arcadeOwner(gameId);
    const wanted = new Set(hashes.filter((hash) => HASH.test(hash)));
    const held = await runServerQuery<OwnerRecord>({ collectionId: OWNERS, where: [{ field: "owner", op: "EQUAL", value: owner }], select: ["hash"], limit: 1000 });
    const heldHashes = new Set(held.map((record) => record.hash).filter((hash): hash is string => typeof hash === "string"));
    const now = new Date().toISOString();
    const adds = [...wanted].filter((hash) => !heldHashes.has(hash));
    for (const hash of adds) {
        try {
            await commitServerMutations([{ type: "create", path: ownerPath(owner, hash), data: { owner, hash, createdAt: now } }]);
        } catch (error) {
            if (!isWriteConflict(error)) throw error;
        }
    }
    const drops = held.filter((record) => typeof record.hash === "string" && !wanted.has(record.hash));
    if (drops.length) {
        await deleteAll(drops.map((record) => record._path as string));
        await collect(drops.map((record) => record.hash as string));
    }
}

/** A remixed copy keeps the files too, counted against the remixer's storage when it fits. */
export async function claimGameAudio(email: string, files: Array<{ hash: string; name: string; size: number; contentType: string }>) {
    const owner = email.toLowerCase();
    let usage = await usageOf(owner);
    const now = new Date().toISOString();
    for (const file of files) {
        if (!HASH.test(file.hash)) continue;
        if (await getServerDocument<OwnerRecord>(ownerPath(owner, file.hash))) continue;
        if (usage.bytes + file.size > usage.limit.bytes || usage.files + 1 > usage.limit.files) break;
        try {
            await commitServerMutations([
                { type: "create", path: ownerPath(owner, file.hash), data: { owner, hash: file.hash, size: file.size, name: cleanName(file.name), contentType: file.contentType, createdAt: now } },
                { type: "increment", path: usagePath(owner), fields: { bytes: file.size, files: 1 } },
            ]);
            usage = { ...usage, bytes: usage.bytes + file.size, files: usage.files + 1 };
        } catch (error) {
            if (!isWriteConflict(error)) throw error;
        }
    }
}

/** Every file an owner keeps is released (account deletion, unpublishing). */
async function releaseAll(owner: string) {
    const records = await runServerQuery<OwnerRecord>({ collectionId: OWNERS, where: [{ field: "owner", op: "EQUAL", value: owner }], select: ["hash"], limit: 1000 });
    await deleteAll([...records.map((record) => record._path as string), usagePath(owner)]);
    await collect(records.map((record) => record.hash).filter((hash): hash is string => typeof hash === "string"));
    return records.length;
}

export const releaseArcadeAudio = (gameId: string) => releaseAll(arcadeOwner(gameId));
export const deleteAccountGameAudio = (email: string) => releaseAll(email.toLowerCase());
