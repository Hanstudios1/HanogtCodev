import "server-only";

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import * as Y from "yjs";
import { effectiveStatus } from "@/lib/presence";
import { getActiveSession } from "@/lib/server/active-session";
import {
    commitServerMutations,
    deleteServerDocument,
    getServerDocument,
    isWriteConflict,
    listServerCollection,
    patchServerDocument,
    runServerQuery,
} from "@/lib/server/firebase-rest";
import { collabLimitsFor, freeCollabLimits } from "@/lib/server/plans";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { normalizeEmail } from "@/lib/server/validate";
import { compactUpdates, createSessionDoc, docFileMeta } from "./doc";
import {
    COLLAB_LIMITS,
    assembleSnapshot,
    cleanTitle,
    fromBase64,
    invitableEmails,
    isExpired,
    joinDecision,
    newParticipantKey,
    newSessionId,
    nextColorIndex,
    presenceDocId,
    publicMeta,
    randomId,
    readChatMessage,
    readPresenceItem,
    readSessionRecord,
    readSignal,
    readUpdateItem,
    roleOf,
    snapshotPartId,
    splitParts,
    timeOrderedId,
    toBase64,
    updateDocId,
    validateInitialFiles,
    type CollabChatMessage,
    type CollabEndReason,
    type CollabErrorCode,
    type CollabFriend,
    type CollabInfoResponse,
    type CollabInvitee,
    type CollabMeta,
    type CollabPollResponse,
    type CollabSessionView,
    type CollabSignalKind,
    type CollabSnapshot,
    type CollabUpdateItem,
} from "./protocol";
import { deletableUpdates, nextSequence } from "./sequence";

/*
 * Server side of live collaboration (/api/collab/**). Everything runs with
 * the service account, so every entry point checks the session (NextAuth +
 * users/{email} not banned), the origin for writes, rate limits and
 * membership itself. Participants' browsers may read the live documents with
 * the client SDK (firestore.rules: collab_sessions); nobody writes them
 * directly.
 */

const MESSAGES: Record<CollabErrorCode, string> = {
    unauthorized: "Etkin oturum gerekli.",
    bad_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    invalid_request: "Geçersiz istek.",
    payload_too_large: "İstek çok büyük.",
    not_found: "Canlı oturum bulunamadı.",
    not_friend: "Yalnızca oturum sahibinin arkadaşları davet edilebilir.",
    full: "Oturum dolu: oturum sahibinin planındaki kişi sınırına ulaşıldı.",
    invite_limit: "Planınız bu kadar davete izin vermiyor.",
    ended: "Canlı oturum sona erdi.",
    read_only: "Oturum sahibi düzenlemeyi kapattı.",
    frozen: "Oturum boyut sınırını aştı; yeni değişiklikler kaydedilemiyor.",
    forbidden: "Bu işlem için yetkiniz yok.",
    invalid_file: "Geçersiz dosya.",
    too_many_files: "Bir oturumda en fazla 20 dosya olabilir.",
    file_too_large: "Bir dosya en fazla 500.000 karakter olabilir.",
    content_too_large: "Oturumdaki kod toplam 1.000.000 karakteri aşamaz.",
    invalid_update: "Geçersiz değişiklik verisi.",
    conflict: "Oturum aynı anda güncellendi; tekrar deneyin.",
    unavailable: "Canlı oturum hizmeti şu anda kullanılamıyor.",
    network: "Bağlantı kurulamadı.",
};

/** Expected failures: a Turkish message (primary language) and a code the interface translates. */
export class CollabApiError extends Error {
    readonly status: number;
    readonly code: CollabErrorCode;
    readonly headers: Record<string, string>;

    constructor(status: number, code: CollabErrorCode, headers: Record<string, string> = {}) {
        super(MESSAGES[code]);
        this.name = "CollabApiError";
        this.status = status;
        this.code = code;
        this.headers = headers;
    }
}

export function collabJson(data: unknown, status = 200) {
    return NextResponse.json(data, { status, headers: jsonSecurityHeaders() });
}

export function collabErrorResponse(error: unknown, scope: string) {
    if (error instanceof CollabApiError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders(error.headers) });
    }
    if (isWriteConflict(error)) {
        return NextResponse.json({ error: MESSAGES.conflict, code: "conflict" }, { status: 409, headers: jsonSecurityHeaders() });
    }
    // Only the message is logged: code, chat texts and addresses stay out of the logs.
    console.error(`[collab:${scope}]`, error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: MESSAGES.unavailable, code: "unavailable" }, { status: 503, headers: jsonSecurityHeaders() });
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export type CollabUser = { email: string; friends: string[] };

/** The signed-in, active account; writes must also come from this site. */
export async function requireCollabUser(request: NextRequest, write: boolean): Promise<CollabUser> {
    if (write && !isSameOrigin(request)) throw new CollabApiError(403, "bad_origin");
    const active = await getActiveSession();
    if (!active) throw new CollabApiError(401, "unauthorized");
    const friends = Array.isArray(active.user.friends) ? active.user.friends.map(normalizeEmail).filter(Boolean) : [];
    return { email: active.email, friends };
}

/** Rate limit shared by all server instances (one Firestore document per key). */
export async function sharedLimit(key: string, limit: number, windowMs: number) {
    const result = await enforceRateLimitWithFallback(key, limit, windowMs);
    if (!result.allowed) throw new CollabApiError(429, "rate_limited", { "Retry-After": String(result.retryAfterSeconds) });
}

const buckets = new Map<string, { tokens: number; at: number }>();
const samples = new Map<string, { checkedAt: number; blockedUntil: number }>();
const SAMPLE_EVERY_MS = 5_000;

function pruneMaps(now: number) {
    if (buckets.size > 10_000) for (const [key, bucket] of buckets) if (now - bucket.at > 60_000) buckets.delete(key);
    if (samples.size > 10_000) for (const [key, sample] of samples) if (now - sample.checkedAt > 3_600_000 && sample.blockedUntil < now) samples.delete(key);
}

/**
 * Rate limit for the sync endpoints, which a browser calls several times a
 * second while people type. The shared limiter writes one Firestore document
 * per call, which a single document can't sustain at that rate, so each
 * instance keeps a token bucket and consults the shared limiter at most once
 * every five seconds per key: spreading requests over many instances still
 * runs into `sampledPerHour`. Large requests cost more tokens (`cost`).
 */
export async function hotLimit(key: string, perSecond: number, burst: number, sampledPerHour: number, cost = 1) {
    const now = Date.now();
    pruneMaps(now);
    const bucket = buckets.get(key) ?? { tokens: burst, at: now };
    bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * perSecond);
    bucket.at = now;
    buckets.set(key, bucket);
    const price = Math.min(Math.max(1, cost), burst);
    if (bucket.tokens < price) throw new CollabApiError(429, "rate_limited", { "Retry-After": String(Math.max(1, Math.ceil((price - bucket.tokens) / perSecond))) });
    bucket.tokens -= price;
    const sample = samples.get(key);
    if (sample && sample.blockedUntil > now) throw new CollabApiError(429, "rate_limited", { "Retry-After": String(Math.ceil((sample.blockedUntil - now) / 1000)) });
    if (!sample || now - sample.checkedAt >= SAMPLE_EVERY_MS) {
        samples.set(key, { checkedAt: now, blockedUntil: 0 });
        const result = await enforceRateLimitWithFallback(`${key}:sampled`, sampledPerHour, 3_600_000).catch(() => null);
        if (result && !result.allowed) {
            samples.set(key, { checkedAt: now, blockedUntil: now + result.retryAfterSeconds * 1000 });
            throw new CollabApiError(429, "rate_limited", { "Retry-After": String(result.retryAfterSeconds) });
        }
    }
}

/** A small JSON object body; anything else is rejected before it reaches the handlers. */
export async function readCollabBody(request: NextRequest, maxBytes: number): Promise<Record<string, unknown>> {
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > maxBytes) throw new CollabApiError(413, "payload_too_large");
    const text = await request.text().catch(() => "");
    if (text.length > maxBytes) throw new CollabApiError(413, "payload_too_large");
    try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
        // Falls through to the error below.
    }
    throw new CollabApiError(400, "invalid_request");
}

export function onlyKeys(body: Record<string, unknown>, allowed: readonly string[]) {
    if (Object.keys(body).some((key) => !allowed.includes(key))) throw new CollabApiError(400, "invalid_request");
}

// ---------------------------------------------------------------------------
// Paths and stored shapes
// ---------------------------------------------------------------------------

const sessionPath = (id: string) => `collab_sessions/${id}`;
const metaPath = (id: string) => `collab_sessions/${id}/live/meta`;
const snapshotsPath = (id: string) => `collab_sessions/${id}/snapshots`;
const updatesPath = (id: string) => `collab_sessions/${id}/updates`;
const presencePath = (id: string) => `collab_sessions/${id}/presence`;
const chatPath = (id: string) => `collab_sessions/${id}/chat`;
const inboxPath = (id: string, key: string) => `collab_sessions/${id}/inbox/${key}/signals`;

/** One notification per session and invitee: inviting again refreshes it. */
export function inviteNotificationId(id: string) {
    return `collab_${createHash("sha256").update(id).digest("hex").slice(0, 24)}`;
}

/**
 * Every collab document carries `purgeAt` (a timestamp), so a Firestore TTL
 * policy on that field removes leftovers of sessions nobody ended.
 */
function purgeAt(view: Pick<CollabSessionView, "status" | "expiresAt" | "endedAt">) {
    const end = view.status === "ended" && view.endedAt ? view.endedAt : view.expiresAt;
    return new Date((end || Date.now()) + COLLAB_LIMITS.keepEndedMs);
}

function sessionData(view: CollabSessionView): Record<string, unknown> {
    return {
        owner: view.owner,
        title: view.title,
        status: view.status,
        readOnly: view.readOnly,
        frozen: view.frozen,
        participants: view.participants,
        keys: view.keys,
        people: view.people,
        invited: view.invited,
        inviteProfiles: view.inviteProfiles,
        files: view.files,
        contentChars: view.contentChars,
        snapshotSeq: view.snapshotSeq,
        chatAt: view.chatAt,
        compactingUntil: view.compactingUntil,
        createdAt: view.createdAt,
        expiresAt: new Date(view.expiresAt),
        endedAt: view.endedAt,
        endReason: view.endReason,
        maxPeople: view.maxPeople,
        maxInvites: view.maxInvites,
        purgeAt: purgeAt(view),
    };
}

function metaData(id: string, view: CollabSessionView): Record<string, unknown> {
    return { ...publicMeta(id, view), purgeAt: purgeAt(view) };
}

export type LoadedSession = { id: string; view: CollabSessionView; updateTime?: string };

export async function loadSession(id: string): Promise<LoadedSession | null> {
    const raw = await getServerDocument<Record<string, unknown>>(sessionPath(id));
    if (!raw) return null;
    return { id, view: readSessionRecord(raw), updateTime: raw._updateTime };
}

/** Writes the session document (version-checked) and its public meta in one commit. */
async function commitSession(loaded: LoadedSession, view: CollabSessionView, extra: Parameters<typeof commitServerMutations>[0] = []) {
    await commitServerMutations([
        { type: "update", path: sessionPath(loaded.id), data: sessionData(view), updateTime: loaded.updateTime },
        { type: "update", path: metaPath(loaded.id), data: metaData(loaded.id, view) },
        ...extra,
    ]);
}

/**
 * Read-modify-write of a session with retries on concurrent changes. `change`
 * gets a copy it may modify; returning null leaves the session as it is.
 */
async function mutateSession(id: string, change: (view: CollabSessionView, loaded: LoadedSession) => CollabSessionView | null): Promise<CollabSessionView> {
    for (let attempt = 0; ; attempt += 1) {
        const loaded = await loadSession(id);
        if (!loaded) throw new CollabApiError(404, "not_found");
        const next = change(structuredClone(loaded.view), loaded);
        if (!next) return loaded.view;
        try {
            await commitSession(loaded, next);
            return next;
        } catch (error) {
            if (attempt < 3 && isWriteConflict(error)) continue;
            throw error;
        }
    }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

type ProfileRecord = { username?: unknown; avatarUrl?: unknown } & Record<string, unknown>;

const httpsUrl = (value: unknown) => (typeof value === "string" && value.length <= 2048 && /^https:\/\/[^\s"'<>`]+$/.test(value) ? value : null);
const displayName = (profile: ProfileRecord | null, email: string) => (typeof profile?.username === "string" ? profile.username.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) : "") || email.split("@")[0] || "Hanogt";

async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const run = async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await worker(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
}

async function loadProfile(email: string) {
    return getServerDocument<ProfileRecord>(`public_profiles/${email}`).catch(() => null);
}

async function personCard(email: string) {
    const profile = await loadProfile(email);
    return { name: displayName(profile, email), avatar: httpsUrl(profile?.avatarUrl) };
}

/** The caller's friends with presence for the invite picker (friends see each other's status anyway). */
export async function listFriendCards(friends: readonly string[]): Promise<CollabFriend[]> {
    const now = Date.now();
    const unique = [...new Set(friends)].slice(0, 300);
    const cards = await mapLimit(unique, 12, async (email): Promise<CollabFriend> => {
        const profile = await loadProfile(email);
        return { email, name: displayName(profile, email), avatar: httpsUrl(profile?.avatarUrl), status: effectiveStatus(profile, now) };
    });
    const rank = { online: 0, idle: 1, dnd: 2, offline: 3 } as const;
    return cards.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, "tr"));
}

async function ownerFriends(owner: string) {
    const record = await getServerDocument<{ friends?: unknown }>(`users/${owner}`).catch(() => null);
    return Array.isArray(record?.friends) ? record.friends.map(normalizeEmail).filter(Boolean) : [];
}

// ---------------------------------------------------------------------------
// Snapshots and updates
// ---------------------------------------------------------------------------

export async function readSnapshot(id: string): Promise<CollabSnapshot | null> {
    const parts = await listServerCollection<Record<string, unknown>>(snapshotsPath(id), 20);
    const snapshot = assembleSnapshot(parts);
    return snapshot ? { seq: snapshot.seq, data: snapshot.data } : null;
}

function snapshotWrites(id: string, view: CollabSessionView, encoded: string, seq: number) {
    const parts = splitParts(encoded);
    const gen = randomId(10);
    const expire = purgeAt(view);
    const writes: Parameters<typeof commitServerMutations>[0] = parts.map((data, index) => ({
        type: "update" as const,
        path: `${snapshotsPath(id)}/${snapshotPartId(index)}`,
        data: { gen, seq, index, count: parts.length, data, purgeAt: expire },
    }));
    for (let index = parts.length; index < COLLAB_LIMITS.maxSnapshotParts; index += 1) {
        writes.push({ type: "delete", path: `${snapshotsPath(id)}/${snapshotPartId(index)}` });
    }
    return { writes, parts: parts.length };
}

async function latestStoredSeq(id: string) {
    const [latest] = await runServerQuery<{ seq?: unknown }>({
        collectionId: "updates",
        parentPath: sessionPath(id),
        orderBy: [{ field: "seq", direction: "DESCENDING" }],
        select: ["seq"],
        limit: 1,
    });
    return typeof latest?.seq === "number" ? latest.seq : null;
}

/**
 * Stores a Yjs update under the next free number. Numbers come from the
 * newest stored update (compaction always keeps it), and the create fails if
 * someone took the number meanwhile, so the sequence has no duplicates and no
 * gaps; a session document written several times a second isn't needed.
 */
export async function appendUpdate(loaded: LoadedSession, key: string, client: number, data: string): Promise<number> {
    const { id, view } = loaded;
    for (let attempt = 0; ; attempt += 1) {
        const seq = nextSequence(await latestStoredSeq(id), view.snapshotSeq);
        if (seq - view.snapshotSeq > COLLAB_LIMITS.maxPendingUpdates) throw new CollabApiError(503, "unavailable");
        try {
            await patchServerDocument(`${updatesPath(id)}/${updateDocId(seq)}`, { seq, data, client, by: key, at: Date.now(), purgeAt: purgeAt(view) }, { exists: false });
            return seq;
        } catch (error) {
            if (attempt < 6 && isWriteConflict(error)) continue;
            throw error;
        }
    }
}

type StoredUpdate = { seq: number; bytes: Uint8Array; at: number; path: string };

/**
 * Stored updates after `after` in sequence order, read in small pages until
 * `maxChars` of base64 data are collected (so one compaction's memory stays
 * bounded even if someone sent many large updates).
 */
async function storedUpdatesAfter(id: string, after: number, maxChars: number): Promise<StoredUpdate[]> {
    const result: StoredUpdate[] = [];
    let cursor = after;
    let chars = 0;
    for (let page = 0; page < 40 && chars < maxChars; page += 1) {
        const records = await runServerQuery<Record<string, unknown>>({
            collectionId: "updates",
            parentPath: sessionPath(id),
            where: [{ field: "seq", op: "GREATER_THAN", value: cursor }],
            orderBy: [{ field: "seq", direction: "ASCENDING" }],
            limit: 25,
        });
        for (const record of records) {
            const item = readUpdateItem(record);
            if (typeof record.seq === "number" && record.seq > cursor) cursor = record.seq;
            const bytes = item ? fromBase64(item.data) : null;
            if (!item || !bytes) continue;
            result.push({ seq: item.seq, bytes, at: typeof record.at === "number" ? record.at : 0, path: record._path });
            chars += item.data.length;
        }
        if (records.length < 25) break;
    }
    return result;
}

async function deletePaths(paths: readonly string[]) {
    for (let index = 0; index < paths.length; index += 250) {
        await commitServerMutations(paths.slice(index, index + 250).map((path) => ({ type: "delete" as const, path })));
    }
}

async function deleteCollection(path: string, filter?: (record: Record<string, unknown> & { _id: string }) => boolean) {
    const records = await listServerCollection<Record<string, unknown>>(path, 300);
    await deletePaths(records.filter((record) => !filter || filter(record)).map((record) => record._path));
}

/**
 * Folds the stored updates into a new snapshot (Yjs state, garbage-collected)
 * and deletes the updates it covers. One compaction runs at a time per
 * session (a 30-second lease on the session document). `final` folds
 * everything and deletes every update (the session has ended).
 */
export async function compactSession(id: string, final = false): Promise<void> {
    const loaded = await loadSession(id);
    if (!loaded) return;
    const now = Date.now();
    if (!final && (loaded.view.compactingUntil > now || loaded.view.status !== "active")) return;
    try {
        await commitServerMutations([{ type: "update", path: sessionPath(id), data: { compactingUntil: now + 30_000 }, updateFields: ["compactingUntil"], updateTime: loaded.updateTime }]);
    } catch (error) {
        if (isWriteConflict(error)) return;
        throw error;
    }
    const base = await readSnapshot(id);
    const updates = await storedUpdatesAfter(id, base?.seq ?? 0, COLLAB_LIMITS.compactBatchChars);
    if (!updates.length) {
        await patchServerDocument(sessionPath(id), { compactingUntil: 0 }, { updateFields: ["compactingUntil"], exists: true }).catch(() => undefined);
        return;
    }
    const baseBytes = base ? fromBase64(base.data) : null;
    const result = compactUpdates(baseBytes, updates.map((update) => update.bytes));
    const encoded = toBase64(result.state);
    const snapshotSeq = updates[updates.length - 1].seq;
    const tooLarge = splitParts(encoded).length > COLLAB_LIMITS.maxSnapshotParts;

    for (let attempt = 0; ; attempt += 1) {
        const fresh = await loadSession(id);
        if (!fresh) return;
        const view: CollabSessionView = tooLarge
            ? { ...fresh.view, frozen: true, compactingUntil: 0 }
            : { ...fresh.view, snapshotSeq: Math.max(fresh.view.snapshotSeq, snapshotSeq), files: result.files, contentChars: result.totalChars, compactingUntil: 0 };
        const extra = tooLarge || snapshotSeq <= fresh.view.snapshotSeq ? [] : snapshotWrites(id, view, encoded, snapshotSeq).writes;
        try {
            await commitSession(fresh, view, extra);
            break;
        } catch (error) {
            if (attempt < 3 && isWriteConflict(error)) continue;
            throw error;
        }
    }
    if (tooLarge) return;
    const removable = final ? updates : deletableUpdates(updates, snapshotSeq, Date.now(), COLLAB_LIMITS.updateGraceMs);
    await deletePaths(removable.map((update) => update.path));
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export type CreateInput = { title: unknown; files: unknown; invite: unknown };

/** Starts a session from the owner's files; their earlier active sessions end ("replaced"). */
export async function createSession(user: CollabUser, input: CreateInput): Promise<{ id: string; meta: CollabMeta }> {
    const validated = validateInitialFiles(input.files);
    if (!validated.ok) throw new CollabApiError(validated.code === "invalid_file" ? 400 : 413, validated.code);
    const requested = Array.isArray(input.invite) ? input.invite.map(normalizeEmail).filter(Boolean) : [];
    if (requested.length > COLLAB_LIMITS.maxInvites) throw new CollabApiError(400, "invalid_request");
    // The owner's plan: Free 2 people (4 invitations), Plus 5 (12), Pro 30 (60).
    const limits = await collabLimitsFor(user.email).catch(freeCollabLimits);
    if (requested.length > limits.invites) throw new CollabApiError(409, "invite_limit");
    if (requested.some((email) => email === user.email || !user.friends.includes(email))) throw new CollabApiError(403, "not_friend");

    void sweepExpiredSessions().catch(() => undefined);
    // One active session per owner.
    const previous = await runServerQuery<{ status?: unknown; endedAt?: unknown }>({
        collectionId: "collab_sessions",
        where: [{ field: "owner", op: "EQUAL", value: user.email }],
        select: ["status", "endedAt"],
        limit: 20,
    }).catch(() => []);
    for (const record of previous) {
        if (record.status === "active") await finalizeSession(record._id, "replaced").catch(() => undefined);
        else if (typeof record.endedAt === "number" && Date.now() - record.endedAt > COLLAB_LIMITS.keepEndedMs) await purgeSession(record._id).catch(() => undefined);
    }

    const doc = createSessionDoc(validated.files);
    const encoded = toBase64(Y.encodeStateAsUpdate(doc));
    const files = docFileMeta(doc);
    doc.destroy();
    if (splitParts(encoded).length > COLLAB_LIMITS.maxSnapshotParts) throw new CollabApiError(413, "content_too_large");

    const now = Date.now();
    const id = newSessionId();
    const key = newParticipantKey();
    const [owner, ...invitees] = await Promise.all([personCard(user.email), ...requested.map(personCard)]);
    const view: CollabSessionView = {
        owner: user.email,
        title: cleanTitle(input.title, validated.files[0]?.name ?? "Hanogt"),
        status: "active",
        readOnly: false,
        frozen: false,
        participants: [user.email],
        keys: { [user.email]: key },
        people: { [key]: { name: owner.name, avatar: owner.avatar, color: 0, joinedAt: now } },
        invited: requested,
        inviteProfiles: Object.fromEntries(requested.map((email, index) => [email, invitees[index]])),
        files,
        contentChars: files.reduce((total, file) => total + file.chars, 0),
        snapshotSeq: 0,
        chatAt: 0,
        compactingUntil: 0,
        createdAt: now,
        expiresAt: now + COLLAB_LIMITS.sessionMs,
        endedAt: 0,
        endReason: null,
        maxPeople: limits.people,
        maxInvites: limits.invites,
    };
    await commitServerMutations([
        { type: "create", path: sessionPath(id), data: sessionData(view) },
        { type: "update", path: metaPath(id), data: metaData(id, view) },
        ...snapshotWrites(id, view, encoded, 0).writes.filter((write) => write.type !== "delete"),
    ]);
    if (requested.length) await notifyInvitees(id, view, requested, owner);
    return { id, meta: publicMeta(id, view) };
}

async function notifyInvitees(id: string, view: CollabSessionView, emails: readonly string[], owner: { name: string; avatar: string | null }) {
    await Promise.all(emails.map((email) => patchServerDocument(`notifications/${email}/items/${inviteNotificationId(id)}`, {
        type: "collab_invite",
        title: "Canlı kod oturumuna davet",
        body: `${owner.name} · ${view.title}`.slice(0, 300),
        actionUrl: `/editor?collab=${id}`,
        fromAvatar: owner.avatar,
        read: false,
        createdAt: new Date(),
    }).catch(() => undefined)));
}

async function removeInviteNotifications(id: string, emails: readonly string[]) {
    await Promise.all(emails.map((email) => deleteServerDocument(`notifications/${email}/items/${inviteNotificationId(id)}`).catch(() => undefined)));
}

/** Removes one person's live documents (presence of every tab, signalling inbox). */
async function clearPersonData(id: string, key: string) {
    await Promise.all([
        deleteCollection(presencePath(id), (record) => record.by === key),
        deleteCollection(inboxPath(id, key)),
    ]);
}

/**
 * Ends a session: no more changes are accepted, the remaining updates are
 * folded into the final snapshot (kept for 24 hours so everyone can keep a
 * copy), and the update log, chat, presence, signalling and invitations are
 * deleted.
 */
export async function finalizeSession(id: string, reason: CollabEndReason): Promise<CollabSessionView | null> {
    const now = Date.now();
    let ended: CollabSessionView;
    try {
        ended = await mutateSession(id, (view) => (view.status === "active" ? { ...view, status: "ended", readOnly: true, endedAt: now, endReason: reason } : null));
    } catch (error) {
        if (error instanceof CollabApiError && error.code === "not_found") return null;
        throw error;
    }
    await compactSession(id, true).catch((error) => console.error("[collab:finalize] compaction failed:", error instanceof Error ? error.message : error));
    const final = await loadSession(id).catch(() => null);
    const keys = Object.values(ended.keys);
    await Promise.all([
        // Updates the final snapshot covers (all of them unless the state outgrew the limits).
        final && !final.view.frozen ? deleteCollection(updatesPath(id), (record) => typeof record.seq === "number" && record.seq <= final.view.snapshotSeq) : Promise.resolve(),
        deleteCollection(presencePath(id)),
        deleteCollection(chatPath(id)),
        ...keys.map((key) => deleteCollection(inboxPath(id, key))),
        removeInviteNotifications(id, ended.invited.filter((email) => !ended.participants.includes(email))),
    ]).catch((error) => console.error("[collab:finalize] cleanup failed:", error instanceof Error ? error.message : error));
    return ended;
}

const SWEEP_INTERVAL_MS = 10 * 60_000;
let lastSweep = 0;

/**
 * Deletes sessions whose `purgeAt` has passed, a few at a time and at most
 * every ten minutes per server instance, so leftovers of sessions nobody
 * reopened disappear even without a Firestore TTL policy (with one, this
 * usually finds nothing).
 */
export async function sweepExpiredSessions(now = Date.now()) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return 0;
    lastSweep = now;
    const stale = await runServerQuery<{ purgeAt?: unknown }>({
        collectionId: "collab_sessions",
        where: [{ field: "purgeAt", op: "LESS_THAN", value: new Date(now) }],
        select: ["purgeAt"],
        limit: 10,
    }).catch(() => []);
    for (const record of stale) await purgeSession(record._id).catch(() => undefined);
    return stale.length;
}

/** Account deletion: every session the person owns, whatever its state. Returns how many were removed. */
export async function purgeOwnedSessions(email: string) {
    const owned = await runServerQuery<{ owner?: unknown }>({
        collectionId: "collab_sessions",
        where: [{ field: "owner", op: "EQUAL", value: email }],
        select: ["owner"],
        limit: 100,
    });
    for (const record of owned) await purgeSession(record._id);
    return owned.length;
}

/** Deletes everything of a session (after the 24 hours an ended session stays readable). */
export async function purgeSession(id: string) {
    const loaded = await loadSession(id);
    const keys = loaded ? Object.values(loaded.view.keys) : [];
    await Promise.all([
        deleteCollection(updatesPath(id)),
        deleteCollection(presencePath(id)),
        deleteCollection(chatPath(id)),
        deleteCollection(snapshotsPath(id)),
        ...keys.map((key) => deleteCollection(inboxPath(id, key))),
    ]);
    if (loaded) await removeInviteNotifications(id, loaded.view.invited);
    await deletePaths([metaPath(id), sessionPath(id)]);
}

/**
 * The session for a request: finalised when its time ran out, purged (and
 * reported missing) when an ended session's 24 hours are over.
 */
export async function loadLiveSession(id: string): Promise<LoadedSession> {
    void sweepExpiredSessions().catch(() => undefined);
    const loaded = await loadSession(id);
    if (!loaded) throw new CollabApiError(404, "not_found");
    if (isExpired(loaded.view)) {
        await finalizeSession(id, "expired");
        const ended = await loadSession(id);
        if (!ended) throw new CollabApiError(404, "not_found");
        return ended;
    }
    if (loaded.view.status === "ended" && loaded.view.endedAt && Date.now() - loaded.view.endedAt > COLLAB_LIMITS.keepEndedMs) {
        await purgeSession(id).catch(() => undefined);
        throw new CollabApiError(404, "not_found");
    }
    return loaded;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * What an invitee sees before joining; people who aren't invited get "not_found".
 * `ownerLimits`: the owner's plan as it is now (joining applies it too), else the session's stored limit.
 */
export function sessionInfo(id: string, view: CollabSessionView, email: string, ownerLimits: { people: number } | null = null): CollabInfoResponse {
    const role = roleOf(view, email);
    if (!role && !view.invited.includes(email)) throw new CollabApiError(404, "not_found");
    const maxPeople = ownerLimits?.people ?? view.maxPeople;
    const ownerKey = view.keys[view.owner];
    const owner = ownerKey ? view.people[ownerKey] : undefined;
    return {
        id,
        title: view.title,
        status: view.status,
        owner: { name: owner?.name ?? view.inviteProfiles[view.owner]?.name ?? "Hanogt", avatar: owner?.avatar ?? null },
        participants: view.participants.flatMap((member) => {
            const person = view.people[view.keys[member] ?? ""];
            return person ? [{ name: person.name, avatar: person.avatar }] : [];
        }),
        joined: Boolean(role),
        role,
        full: view.participants.length >= maxPeople,
        maxPeople,
        readOnly: view.readOnly,
    };
}

export type PollParams = { after: number; chat: number; signals: boolean; client: number | null };

/** Everything a polling browser needs since its last request (participants only). */
export async function pollSession(loaded: LoadedSession, email: string, params: PollParams): Promise<CollabPollResponse> {
    const { id, view } = loaded;
    const role = roleOf(view, email);
    const key = view.keys[email];
    if (!role || !key) throw new CollabApiError(404, "not_found");
    const meta = publicMeta(id, view);
    const invited = role === "owner" ? ownerInvites(view) : null;
    const snapshot = params.after < view.snapshotSeq || params.after < 0 ? await readSnapshot(id) : null;
    const active = view.status === "active";
    const fromSeq = Math.max(params.after, snapshot?.seq ?? 0);
    const now = Date.now();
    // An ended session only serves its final state (snapshot and any updates it doesn't cover).
    const wantChat = active && (params.chat < view.chatAt || (view.chatAt > 0 && now - view.chatAt < 30_000));
    const [updateRecords, presenceRecords, chatRecords, signalRecords] = await Promise.all([
        runServerQuery<Record<string, unknown>>({
            collectionId: "updates",
            parentPath: sessionPath(id),
            where: [{ field: "seq", op: "GREATER_THAN", value: fromSeq }],
            orderBy: [{ field: "seq", direction: "ASCENDING" }],
            limit: COLLAB_LIMITS.updatesPage + 1,
        }),
        active ? listServerCollection<Record<string, unknown>>(presencePath(id), 50) : Promise.resolve([]),
        wantChat
            ? runServerQuery<Record<string, unknown>>({
                collectionId: "chat",
                parentPath: sessionPath(id),
                where: params.chat > 0 ? [{ field: "at", op: "GREATER_THAN", value: params.chat }] : [],
                orderBy: [{ field: "at", direction: "DESCENDING" }],
                limit: COLLAB_LIMITS.chatPage,
            })
            : Promise.resolve(null),
        active && params.signals && params.client !== null ? listServerCollection<Record<string, unknown>>(inboxPath(id, key), 100) : Promise.resolve([]),
    ]);
    // A page ends after updatesPage updates or updatesPageChars of data; the client asks again at once.
    const updates: CollabUpdateItem[] = [];
    let chars = 0;
    let cut = false;
    for (const record of updateRecords) {
        const item = readUpdateItem(record);
        if (!item) continue;
        if (updates.length >= COLLAB_LIMITS.updatesPage || (updates.length && chars + item.data.length > COLLAB_LIMITS.updatesPageChars)) {
            cut = true;
            break;
        }
        updates.push(item);
        chars += item.data.length;
    }
    const presence = presenceRecords.flatMap((record) => {
        const item = readPresenceItem(record._id, record);
        return item && now - item.at < 120_000 ? [item] : [];
    });
    const chat = chatRecords
        ? chatRecords.flatMap((record): CollabChatMessage[] => {
            const message = readChatMessage(record._id, record);
            return message ? [message] : [];
        }).reverse()
        : null;
    const signals = signalRecords.flatMap((record) => {
        const signal = readSignal(record._id, record);
        return signal && signal.toClient === params.client ? [signal] : [];
    });
    return {
        meta,
        me: { key, role },
        invited,
        snapshot,
        updates,
        more: cut,
        presence,
        chat,
        signals,
    };
}

/** Deletes presence documents of tabs that stopped reporting (crashed or closed without a goodbye). */
export async function pruneStalePresence(id: string) {
    const now = Date.now();
    await deleteCollection(presencePath(id), (record) => typeof record.at !== "number" || now - record.at > 10 * 60_000);
}

// ---------------------------------------------------------------------------
// Membership actions
// ---------------------------------------------------------------------------

export async function joinSession(id: string, user: CollabUser): Promise<CollabSessionView> {
    const loaded = await loadLiveSession(id);
    // The owner's plan as it is now: an upgrade during the session makes room at once
    // (unreadable: the session keeps the limits it has).
    const [friends, card, limits] = await Promise.all([ownerFriends(loaded.view.owner), personCard(user.email), collabLimitsFor(loaded.view.owner).catch(() => null)]);
    let decision: ReturnType<typeof joinDecision> = "not_found";
    const view = await mutateSession(id, (current) => {
        if (limits) {
            current.maxPeople = limits.people;
            current.maxInvites = limits.invites;
        }
        decision = joinDecision(current, user.email, friends);
        if (decision !== "ok") return null;
        const key = current.keys[user.email] ?? newParticipantKey();
        const used = current.participants.map((email) => current.people[current.keys[email] ?? ""]?.color ?? -1);
        const previous = current.people[key];
        current.keys[user.email] = key;
        current.people[key] = { name: card.name, avatar: card.avatar, color: previous && !used.includes(previous.color) ? previous.color : nextColorIndex(used), joinedAt: Date.now() };
        current.participants = [...current.participants, user.email];
        return current;
    });
    const result = decision as ReturnType<typeof joinDecision>;
    if (result === "member" || result === "ok") return view;
    if (result === "full") throw new CollabApiError(409, "full");
    if (result === "ended") throw new CollabApiError(410, "ended");
    if (result === "not_friend") throw new CollabApiError(403, "not_friend");
    throw new CollabApiError(404, "not_found");
}

export async function leaveSession(id: string, email: string) {
    const left: { key?: string } = {};
    await mutateSession(id, (view) => {
        if (email === view.owner) throw new CollabApiError(403, "forbidden");
        if (!view.participants.includes(email)) return null;
        left.key = view.keys[email];
        view.participants = view.participants.filter((member) => member !== email);
        return view;
    });
    if (left.key) await clearPersonData(id, left.key).catch(() => undefined);
}

export async function inviteToSession(id: string, user: CollabUser, emails: readonly string[]) {
    const cards = new Map<string, { name: string; avatar: string | null }>();
    await Promise.all(emails.map(async (email) => cards.set(email, await personCard(email))));
    const limits = await collabLimitsFor(user.email).catch(() => null);
    const result: { added: string[] } = { added: [] };
    const view = await mutateSession(id, (current) => {
        if (current.owner !== user.email) throw new CollabApiError(403, "forbidden");
        if (current.status !== "active") throw new CollabApiError(410, "ended");
        if (limits) {
            current.maxPeople = limits.people;
            current.maxInvites = limits.invites;
        }
        const { accepted, rejected } = invitableEmails(current, emails, user.friends);
        if (rejected.length) throw new CollabApiError(403, "not_friend");
        // Every requested invitation is new and none fits: the plan's invitation limit.
        if (!accepted.length && emails.some((email) => !current.invited.includes(email))) throw new CollabApiError(409, "invite_limit");
        result.added = accepted;
        if (!accepted.length) return null;
        current.invited = [...current.invited, ...accepted];
        for (const email of accepted) current.inviteProfiles[email] = cards.get(email) ?? { name: email.split("@")[0], avatar: null };
        return current;
    });
    if (result.added.length) {
        const ownerKey = view.keys[view.owner];
        const owner = ownerKey ? view.people[ownerKey] : undefined;
        await notifyInvitees(id, view, result.added, { name: owner?.name ?? "Hanogt", avatar: owner?.avatar ?? null });
    }
    return view;
}

/** The owner removes an invitation or a participant (who can't come back unless invited again). */
export async function removeFromSession(id: string, user: CollabUser, target: string) {
    const removed: { key?: string } = {};
    const view = await mutateSession(id, (current) => {
        if (current.owner !== user.email) throw new CollabApiError(403, "forbidden");
        if (target === current.owner) throw new CollabApiError(400, "invalid_request");
        if (!current.invited.includes(target) && !current.participants.includes(target)) return null;
        removed.key = current.participants.includes(target) ? current.keys[target] : undefined;
        current.invited = current.invited.filter((email) => email !== target);
        current.participants = current.participants.filter((email) => email !== target);
        delete current.inviteProfiles[target];
        return current;
    });
    await removeInviteNotifications(id, [target]);
    if (removed.key) await clearPersonData(id, removed.key).catch(() => undefined);
    return view;
}

export async function setReadOnly(id: string, user: CollabUser, readOnly: boolean) {
    return mutateSession(id, (current) => {
        if (current.owner !== user.email) throw new CollabApiError(403, "forbidden");
        if (current.status !== "active") throw new CollabApiError(410, "ended");
        if (current.readOnly === readOnly) return null;
        current.readOnly = readOnly;
        return current;
    });
}

/** The owner's invitation list (their friends' addresses, which the owner knows anyway). */
export function ownerInvites(view: CollabSessionView): CollabInvitee[] {
    return view.invited.map((email) => {
        const joined = view.participants.includes(email);
        return { email, name: view.inviteProfiles[email]?.name ?? email.split("@")[0], avatar: view.inviteProfiles[email]?.avatar ?? null, joined, key: joined ? view.keys[email] ?? null : null };
    });
}

// ---------------------------------------------------------------------------
// Live data: presence, chat, signalling
// ---------------------------------------------------------------------------

export async function writePresence(loaded: LoadedSession, key: string, client: number, data: string) {
    await patchServerDocument(`${presencePath(loaded.id)}/${presenceDocId(key, client)}`, { by: key, client, data, at: Date.now(), purgeAt: purgeAt(loaded.view) });
}

export async function deletePresence(id: string, key: string, client: number) {
    await deleteServerDocument(`${presencePath(id)}/${presenceDocId(key, client)}`);
}

export async function postChat(loaded: LoadedSession, key: string, text: string): Promise<CollabChatMessage> {
    const { id, view } = loaded;
    const now = Date.now();
    const messageId = timeOrderedId(now);
    const name = view.people[key]?.name ?? "Hanogt";
    await patchServerDocument(`${chatPath(id)}/${messageId}`, { by: key, name, text, at: now, purgeAt: purgeAt(view) }, { exists: false });
    await patchServerDocument(sessionPath(id), { chatAt: now }, { updateFields: ["chatAt"], exists: true });
    return { id: messageId, by: key, name, text, at: now };
}

/** Keeps the newest 200 chat messages. */
export async function pruneChat(id: string) {
    const records = await runServerQuery<{ at?: unknown }>({
        collectionId: "chat",
        parentPath: sessionPath(id),
        orderBy: [{ field: "at", direction: "DESCENDING" }],
        select: ["at"],
        limit: COLLAB_LIMITS.chatKeep + 200,
    });
    await deletePaths(records.slice(COLLAB_LIMITS.chatKeep).map((record) => record._path));
}

export type OutgoingSignal = { to: string; toClient: number; kind: CollabSignalKind; data: string };

export async function sendSignals(loaded: LoadedSession, from: string, fromClient: number, signals: readonly OutgoingSignal[]) {
    const now = Date.now();
    const expire = purgeAt(loaded.view);
    await commitServerMutations(signals.map((signal) => ({
        type: "create" as const,
        path: `${inboxPath(loaded.id, signal.to)}/${timeOrderedId(now)}`,
        data: { from, fromClient, toClient: signal.toClient, kind: signal.kind, data: signal.data, at: now, purgeAt: expire },
    })));
}

/** Deletes signals the caller read (only from the caller's own inbox) and ones older than two minutes. */
export async function acknowledgeSignals(id: string, key: string, ids: readonly string[]) {
    if (ids.length) await deletePaths(ids.map((signalId) => `${inboxPath(id, key)}/${signalId}`));
}

export async function pruneSignals(id: string, key: string) {
    const now = Date.now();
    await deleteCollection(inboxPath(id, key), (record) => typeof record.at !== "number" || now - record.at > 120_000);
}
