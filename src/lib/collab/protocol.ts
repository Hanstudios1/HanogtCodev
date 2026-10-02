/**
 * Live collaboration in the code editor ("Ekiple düzenle"): limits, ids, wire
 * types, validation and permission checks shared by the browser, the
 * /api/collab routes and the plain-Node tests (scripts/tests/collab-*.test.mjs).
 * Dependency-free apart from the language registry.
 *
 * Firestore layout (written by /api/collab/** with the service account only)
 * - collab_sessions/{id}: owner, participant e-mails (for the security rules),
 *   e-mail → participant key map, invitees, status. Server-only.
 * - collab_sessions/{id}/live/meta: what every participant may read (people
 *   by key, name and avatar — never e-mail addresses — files, status).
 * - collab_sessions/{id}/snapshots/p{n}: the compacted Yjs state in base64
 *   parts (server-only; served by GET /api/collab/[id]).
 * - collab_sessions/{id}/updates/u{seq}: Yjs updates after the snapshot,
 *   numbered 1, 2, 3… by the server.
 * - collab_sessions/{id}/presence/{key}_{client}: y-protocols awareness of one
 *   browser tab (cursor, file, voice state).
 * - collab_sessions/{id}/chat/{id}: chat messages, deleted with the session.
 * - collab_sessions/{id}/inbox/{key}/signals/{id}: WebRTC signalling for one
 *   participant, deleted once read.
 */
import { normalizeLanguageId } from "@/lib/runtimes/languages";

export const COLLAB_LIMITS = {
    /** People in one session, the owner included. */
    maxParticipants: 5,
    /** Pending and accepted invitations of one session. */
    maxInvites: 12,
    maxFiles: 20,
    /** Same limits as the editor and the cloud projects. */
    maxFileChars: 500_000,
    maxTotalChars: 1_000_000,
    maxFileName: 120,
    maxTitle: 80,
    maxLanguageId: 30,
    /** Base64 characters of one Yjs update (≈ 750 KB of binary data). */
    maxUpdateChars: 1_000_000,
    maxAwarenessChars: 6_000,
    maxChatChars: 1_000,
    /** Chat messages kept per session (older ones are pruned). */
    chatKeep: 200,
    chatPage: 100,
    maxSignalChars: 16_000,
    maxSignalsPerRequest: 12,
    maxAcksPerRequest: 60,
    /** A Firestore document holds at most 1 MiB; snapshots are split into parts. */
    snapshotPartChars: 700_000,
    maxSnapshotParts: 6,
    /** Updates after the snapshot that trigger a compaction. */
    compactEvery: 120,
    /** Updates after the snapshot at which new updates are refused until a compaction succeeds. */
    maxPendingUpdates: 600,
    updatesPage: 100,
    /** Base64 characters of updates in one poll answer (more are fetched right after). */
    updatesPageChars: 3_000_000,
    /** Base64 characters of updates one compaction folds in (the rest waits for the next one). */
    compactBatchChars: 6_000_000,
    /** An active session ends by itself after this long. */
    sessionMs: 12 * 60 * 60_000,
    /** An ended session's final state stays readable this long ("Kopyayı sakla"). */
    keepEndedMs: 24 * 60 * 60_000,
    /** Updates younger than this are never deleted by a compaction (live listeners still deliver them). */
    updateGraceMs: 2 * 60_000,
} as const;

export const COLLAB_TIMING = {
    pollVisibleMs: 700,
    pollHiddenMs: 4_000,
    /** Local edits are sent together after this pause. */
    updateBatchMs: 150,
    awarenessThrottleMs: 250,
    retryMs: [1_000, 2_000, 4_000, 8_000, 15_000] as readonly number[],
    /** An update that arrived early waits this long for the missing ones before a repair fetch. */
    gapRepairMs: 2_500,
} as const;

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

const SESSION_ID = /^[A-Za-z0-9]{20}$/;
const PARTICIPANT_KEY = /^[a-z0-9]{12}$/;
const FILE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SIGNAL_ID = /^[A-Za-z0-9_-]{8,64}$/;
const CHAT_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Session ids are 20 random letters and digits (also the invite link). */
export function isCollabSessionId(value: unknown): value is string {
    return typeof value === "string" && SESSION_ID.test(value);
}

/** Random per-session id of a participant; shown to the others instead of the e-mail address. */
export function isParticipantKey(value: unknown): value is string {
    return typeof value === "string" && PARTICIPANT_KEY.test(value);
}

export function isCollabFileId(value: unknown): value is string {
    return typeof value === "string" && FILE_ID.test(value);
}

export function isSignalId(value: unknown): value is string {
    return typeof value === "string" && SIGNAL_ID.test(value);
}

export function isChatId(value: unknown): value is string {
    return typeof value === "string" && CHAT_ID.test(value);
}

/** A Yjs client id (one browser tab): an unsigned 32-bit integer. */
export function isClientId(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

/** Update documents sort by id in sequence order. */
export function updateDocId(seq: number) {
    return `u${String(Math.max(0, Math.floor(seq))).padStart(12, "0")}`;
}

export function seqFromUpdateDocId(id: string): number | null {
    const match = /^u(\d{12})$/.exec(id);
    return match ? Number(match[1]) : null;
}

export function presenceDocId(key: string, client: number) {
    return `${key}_${client}`;
}

export function parsePresenceDocId(id: string): { key: string; client: number } | null {
    const [key, raw, extra] = id.split("_");
    const client = Number(raw);
    return extra === undefined && isParticipantKey(key) && /^\d{1,10}$/.test(raw ?? "") && isClientId(client) ? { key, client } : null;
}

export function snapshotPartId(index: number) {
    return `p${index}`;
}

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LOWER_ALPHANUMERIC = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Unbiased random string from `alphabet` (Web Crypto: browsers and Node 20+). */
export function randomId(length: number, alphabet = ALPHANUMERIC): string {
    const limit = 256 - (256 % alphabet.length);
    let result = "";
    while (result.length < length) {
        const bytes = new Uint8Array(length * 2);
        globalThis.crypto.getRandomValues(bytes);
        for (const byte of bytes) {
            if (byte < limit) result += alphabet[byte % alphabet.length];
            if (result.length === length) break;
        }
    }
    return result;
}

export const newSessionId = () => randomId(20);
export const newParticipantKey = () => randomId(12, LOWER_ALPHANUMERIC);

/** Time-ordered document id (chat messages, signals): sorts by creation time. */
export function timeOrderedId(now = Date.now()) {
    return `${Math.max(0, Math.floor(now)).toString(36).padStart(9, "0")}-${randomId(8)}`;
}

// ---------------------------------------------------------------------------
// Base64 (Yjs updates travel as text: JSON bodies and Firestore strings)
// ---------------------------------------------------------------------------

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function isBase64(value: unknown, maxLength = Number.POSITIVE_INFINITY): value is string {
    return typeof value === "string" && value.length <= maxLength && value.length % 4 === 0 && BASE64.test(value);
}

export function toBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
}

/** Decodes base64; null for anything that isn't strict, padded base64. */
export function fromBase64(value: unknown, maxLength = Number.POSITIVE_INFINITY): Uint8Array | null {
    if (!isBase64(value, maxLength)) return null;
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
    try {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// y-protocols awareness updates (validated on the server, read by clients)
// ---------------------------------------------------------------------------

export type AwarenessEntry = { client: number; clock: number; state: unknown };

/**
 * Decodes an awareness update (lib0 encoding: varuint count, then per client
 * varuint id, varuint clock and a JSON varstring). Null when malformed.
 */
export function decodeAwarenessUpdate(bytes: Uint8Array, maxEntries = 8): AwarenessEntry[] | null {
    let position = 0;
    const readVarUint = () => {
        let value = 0;
        let multiplier = 1;
        while (position < bytes.length) {
            const byte = bytes[position++];
            value += (byte & 0x7f) * multiplier;
            if (byte < 0x80) return value;
            multiplier *= 128;
            if (multiplier > 2 ** 53) throw new Error("varuint");
        }
        throw new Error("eof");
    };
    try {
        const count = readVarUint();
        if (count > maxEntries) return null;
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const entries: AwarenessEntry[] = [];
        for (let index = 0; index < count; index += 1) {
            const client = readVarUint();
            const clock = readVarUint();
            const length = readVarUint();
            if (position + length > bytes.length) return null;
            const text = decoder.decode(bytes.subarray(position, position + length));
            position += length;
            entries.push({ client, clock, state: JSON.parse(text) as unknown });
        }
        return position === bytes.length ? entries : null;
    } catch {
        return null;
    }
}

/**
 * An awareness update a browser may publish: exactly its own client, a state
 * that is null (leaving) or a plain object.
 */
export function isOwnAwarenessUpdate(bytes: Uint8Array, client: number): boolean {
    const entries = decodeAwarenessUpdate(bytes, 1);
    if (!entries || entries.length !== 1) return false;
    const [entry] = entries;
    const state = entry.state;
    return entry.client === client && (state === null || (typeof state === "object" && !Array.isArray(state)));
}

/** A relative position as JSON (Y.relativePositionToJSON / awareness states). */
export type RelativePositionJson = { type?: unknown; tname?: unknown; item?: unknown; assoc?: unknown };

export type CollabCallState = { on: boolean; muted: boolean; deafened: boolean };

/** What a browser tab tells the others (y-protocols awareness state). */
export type CollabAwarenessState = {
    /** The file open in the editor. */
    file: string | null;
    selection: { anchor: RelativePositionJson; head: RelativePositionJson } | null;
    /** Line of the cursor (1-based), for "editing main.py:12" without decoding positions. */
    line: number | null;
    /** The tab is in the background. */
    away: boolean;
    call: CollabCallState | null;
};

function relativePosition(value: unknown): RelativePositionJson | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as RelativePositionJson : null;
}

/** Reads a remote awareness state defensively; anything unexpected becomes null/false. */
export function readAwarenessState(value: unknown): CollabAwarenessState {
    const state = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const selection = state.selection && typeof state.selection === "object" ? state.selection as Record<string, unknown> : null;
    const anchor = relativePosition(selection?.anchor);
    const head = relativePosition(selection?.head);
    const call = state.call && typeof state.call === "object" ? state.call as Record<string, unknown> : null;
    const line = typeof state.line === "number" && Number.isInteger(state.line) && state.line > 0 && state.line < 10_000_000 ? state.line : null;
    return {
        file: isCollabFileId(state.file) ? state.file : null,
        selection: anchor && head ? { anchor, head } : null,
        line,
        away: state.away === true,
        call: call && call.on === true ? { on: true, muted: call.muted === true, deafened: call.deafened === true } : null,
    };
}

// ---------------------------------------------------------------------------
// Text and files
// ---------------------------------------------------------------------------

/** Line endings are always "\n" inside a session, so offsets match on every platform. */
export function normalizeNewlines(code: string) {
    return code.includes("\r") ? code.replace(/\r\n?/g, "\n") : code;
}

/** A file name as the editor accepts it (no paths or control characters, at most 120 characters). */
export function cleanFileName(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const name = value.trim().replace(/\s+/g, " ");
    if (!name || name === "." || name === ".." || name.length > COLLAB_LIMITS.maxFileName) return null;
    if (/[\\/\u0000-\u001f\u007f]/.test(name)) return null;
    return name;
}

/** A registry language id (unknown ids fall back to plain text). */
export function cleanLanguage(value: unknown): string {
    const id = typeof value === "string" ? normalizeLanguageId(value.slice(0, COLLAB_LIMITS.maxLanguageId)) : null;
    return id ?? "plaintext";
}

export function cleanTitle(value: unknown, fallback = "") {
    const title = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, COLLAB_LIMITS.maxTitle) : "";
    return title || fallback;
}

/** Chat text: control characters (except line breaks and tabs) removed, at most 1000 characters. */
export function cleanChatText(value: unknown) {
    if (typeof value !== "string") return "";
    return normalizeNewlines(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, COLLAB_LIMITS.maxChatChars);
}

export type CollabInitialFile = { id: string; name: string; lang: string; code: string };

export type CollabFileError = "invalid_file" | "too_many_files" | "file_too_large" | "content_too_large";

/** The files a session starts with: ids unique, names valid, sizes within the editor's limits. */
export function validateInitialFiles(value: unknown): { ok: true; files: CollabInitialFile[] } | { ok: false; code: CollabFileError } {
    if (!Array.isArray(value) || value.length === 0) return { ok: false, code: "invalid_file" };
    if (value.length > COLLAB_LIMITS.maxFiles) return { ok: false, code: "too_many_files" };
    const files: CollabInitialFile[] = [];
    const ids = new Set<string>();
    let total = 0;
    for (const entry of value) {
        if (!entry || typeof entry !== "object") return { ok: false, code: "invalid_file" };
        const record = entry as Record<string, unknown>;
        const name = cleanFileName(record.name);
        if (!isCollabFileId(record.id) || ids.has(record.id) || !name || typeof record.code !== "string") return { ok: false, code: "invalid_file" };
        const code = normalizeNewlines(record.code);
        if (code.length > COLLAB_LIMITS.maxFileChars) return { ok: false, code: "file_too_large" };
        total += code.length;
        if (total > COLLAB_LIMITS.maxTotalChars) return { ok: false, code: "content_too_large" };
        ids.add(record.id);
        files.push({ id: record.id, name, lang: cleanLanguage(record.lang), code });
    }
    return { ok: true, files };
}

/** CSS string literal for `content:` (remote cursor labels); quotes, backslashes and controls escaped. */
export function cssString(text: string) {
    const escaped = text
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/</g, "\\3c ")
        .replace(/>/g, "\\3e ");
    return `"${escaped}"`;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** Cursor and avatar ring colours, readable on light and dark editor themes. */
export const COLLAB_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#d946ef", "#84cc16", "#f97316"] as const;

export function collabColor(index: number) {
    const size = COLLAB_COLORS.length;
    const safe = Number.isInteger(index) ? index : 0;
    return COLLAB_COLORS[((safe % size) + size) % size];
}

/** The lowest colour index nobody in the session uses. */
export function nextColorIndex(used: readonly number[]) {
    for (let index = 0; index < COLLAB_COLORS.length; index += 1) if (!used.includes(index)) return index;
    return used.length % COLLAB_COLORS.length;
}

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

/** Milliseconds of a stored time: number, ISO string, Date or a Firestore Timestamp; 0 when unusable. */
export function timeOf(value: unknown): number {
    let time = Number.NaN;
    if (typeof value === "number") time = value;
    else if (typeof value === "string") time = Date.parse(value);
    else if (value instanceof Date) time = value.getTime();
    else if (value && typeof value === "object") {
        const stamp = value as { toMillis?: unknown; seconds?: unknown };
        if (typeof stamp.toMillis === "function") time = Number((stamp.toMillis as () => unknown).call(value));
        else if (typeof stamp.seconds === "number") time = stamp.seconds * 1000;
    }
    return Number.isFinite(time) && time > 0 ? time : 0;
}

// ---------------------------------------------------------------------------
// Snapshots split into parts
// ---------------------------------------------------------------------------

export function splitParts(text: string, size: number = COLLAB_LIMITS.snapshotPartChars): string[] {
    if (!text) return [""];
    const parts: string[] = [];
    for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size));
    return parts;
}

export type SnapshotPart = { gen: string; seq: number; index: number; count: number; data: string };

function snapshotPart(value: unknown): SnapshotPart | null {
    if (!value || typeof value !== "object") return null;
    const part = value as Record<string, unknown>;
    const { gen, seq, index, count, data } = part;
    if (typeof gen !== "string" || !gen || typeof data !== "string") return null;
    if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return null;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > COLLAB_LIMITS.maxSnapshotParts) return null;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= count) return null;
    return { gen, seq, index, count, data };
}

/**
 * Joins the stored parts of a snapshot. Parts of different compactions
 * (generations) are never mixed; the newest complete generation wins.
 */
export function assembleSnapshot(values: readonly unknown[]): { gen: string; seq: number; data: string } | null {
    const generations = new Map<string, SnapshotPart[]>();
    for (const value of values) {
        const part = snapshotPart(value);
        if (!part) continue;
        const list = generations.get(part.gen) ?? [];
        list.push(part);
        generations.set(part.gen, list);
    }
    let best: { gen: string; seq: number; data: string } | null = null;
    for (const [gen, parts] of generations) {
        const count = parts[0].count;
        if (parts.length !== count || parts.some((part) => part.count !== count || part.seq !== parts[0].seq)) continue;
        const ordered = [...parts].sort((a, b) => a.index - b.index);
        if (ordered.some((part, position) => part.index !== position)) continue;
        if (!best || parts[0].seq > best.seq) best = { gen, seq: parts[0].seq, data: ordered.map((part) => part.data).join("") };
    }
    return best;
}

// ---------------------------------------------------------------------------
// Sessions: stored record, public view and permissions
// ---------------------------------------------------------------------------

export type CollabRole = "owner" | "editor";
export type CollabStatus = "active" | "ended";
export type CollabEndReason = "owner" | "expired" | "replaced";

export type CollabPerson = { name: string; avatar: string | null; color: number; joinedAt: number };

/** The server-only session document, normalised. */
export type CollabSessionView = {
    owner: string;
    title: string;
    status: CollabStatus;
    readOnly: boolean;
    /** The stored state outgrew the limits; nobody can change it any more. */
    frozen: boolean;
    participants: string[];
    /** E-mail → participant key. */
    keys: Record<string, string>;
    /** Participant key → public card. */
    people: Record<string, CollabPerson>;
    invited: string[];
    /** Invitee e-mail → name and avatar (owner's invite list). */
    inviteProfiles: Record<string, { name: string; avatar: string | null }>;
    files: CollabFileMeta[];
    contentChars: number;
    snapshotSeq: number;
    chatAt: number;
    compactingUntil: number;
    createdAt: number;
    expiresAt: number;
    endedAt: number;
    endReason: CollabEndReason | null;
};

export type CollabFileMeta = { id: string; name: string; lang: string; chars: number };

const emailLike = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && /^[^\s@/]+@[^\s@/]+$/.test(value);

function emailList(value: unknown, max: number) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(emailLike).map((email) => email.toLowerCase()))].slice(0, max);
}

function objectOf(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const safeAvatar = (value: unknown) => (typeof value === "string" && value.length <= 2048 && /^https:\/\/[^\s"'<>`]+$/.test(value) ? value : null);
const safeName = (value: unknown, fallback: string) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) : "") || fallback;

function fileMetaList(value: unknown): CollabFileMeta[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, COLLAB_LIMITS.maxFiles * 2).flatMap((entry) => {
        const record = objectOf(entry);
        const name = cleanFileName(record.name);
        if (!isCollabFileId(record.id) || !name) return [];
        return [{ id: record.id, name, lang: cleanLanguage(record.lang), chars: typeof record.chars === "number" && record.chars >= 0 ? Math.floor(record.chars) : 0 }];
    });
}

/** Normalises the stored session document (unknown or malformed fields get safe defaults). */
export function readSessionRecord(raw: Record<string, unknown>): CollabSessionView {
    const owner = emailLike(raw.owner) ? raw.owner.toLowerCase() : "";
    const keysRaw = objectOf(raw.keys);
    const keys: Record<string, string> = {};
    for (const [email, key] of Object.entries(keysRaw)) if (emailLike(email) && isParticipantKey(key)) keys[email.toLowerCase()] = key;
    const people: Record<string, CollabPerson> = {};
    for (const [key, value] of Object.entries(objectOf(raw.people))) {
        if (!isParticipantKey(key)) continue;
        const person = objectOf(value);
        people[key] = {
            name: safeName(person.name, "Hanogt"),
            avatar: safeAvatar(person.avatar),
            color: typeof person.color === "number" && Number.isInteger(person.color) ? person.color : 0,
            joinedAt: timeOf(person.joinedAt),
        };
    }
    const inviteProfiles: CollabSessionView["inviteProfiles"] = {};
    for (const [email, value] of Object.entries(objectOf(raw.inviteProfiles))) {
        if (!emailLike(email)) continue;
        const profile = objectOf(value);
        inviteProfiles[email.toLowerCase()] = { name: safeName(profile.name, email.split("@")[0]), avatar: safeAvatar(profile.avatar) };
    }
    const endReason = raw.endReason === "owner" || raw.endReason === "expired" || raw.endReason === "replaced" ? raw.endReason : null;
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
    return {
        owner,
        title: cleanTitle(raw.title, "Hanogt"),
        status: raw.status === "active" ? "active" : "ended",
        readOnly: raw.readOnly === true,
        frozen: raw.frozen === true,
        participants: emailList(raw.participants, COLLAB_LIMITS.maxParticipants),
        keys,
        people,
        invited: emailList(raw.invited, COLLAB_LIMITS.maxInvites),
        inviteProfiles,
        files: fileMetaList(raw.files),
        contentChars: number(raw.contentChars),
        snapshotSeq: number(raw.snapshotSeq),
        chatAt: number(raw.chatAt),
        compactingUntil: timeOf(raw.compactingUntil),
        createdAt: timeOf(raw.createdAt),
        expiresAt: timeOf(raw.expiresAt),
        endedAt: timeOf(raw.endedAt),
        endReason,
    };
}

export function roleOf(session: CollabSessionView, email: string): CollabRole | null {
    if (!email || !session.participants.includes(email) || !session.keys[email]) return null;
    return email === session.owner ? "owner" : "editor";
}

/** An active session past its end time counts as ended (it is finalised on the next request). */
export function isExpired(session: CollabSessionView, now = Date.now()) {
    return session.status === "active" && session.expiresAt > 0 && now >= session.expiresAt;
}

export type CollabAccess = "ok" | "not_found" | "ended" | "read_only" | "frozen";

/** Reading the session (poll, awareness, chat, signalling): participants only. Others get "not_found". */
export function readAccess(session: CollabSessionView, email: string, now = Date.now()): CollabAccess {
    if (!roleOf(session, email)) return "not_found";
    if (session.status !== "active" || isExpired(session, now)) return "ended";
    return "ok";
}

/** Changing the code: participants, not while the owner made the session read-only (the owner always can). */
export function writeAccess(session: CollabSessionView, email: string, now = Date.now()): CollabAccess {
    const access = readAccess(session, email, now);
    if (access !== "ok") return access;
    if (session.frozen) return "frozen";
    if (session.readOnly && email !== session.owner) return "read_only";
    return "ok";
}

export type CollabJoinDecision = "member" | "ok" | "not_found" | "ended" | "full" | "not_friend";

/**
 * Whether `email` may join: invited by the owner and still the owner's
 * friend (the friend graph is users/{email}.friends), the session active and
 * not full. People who aren't invited get "not_found" (the link reveals nothing).
 */
export function joinDecision(session: CollabSessionView, email: string, ownerFriends: readonly string[], now = Date.now()): CollabJoinDecision {
    if (roleOf(session, email)) return session.status === "active" && !isExpired(session, now) ? "member" : "ended";
    if (!email || email === session.owner || !session.invited.includes(email)) return "not_found";
    if (session.status !== "active" || isExpired(session, now)) return "ended";
    if (!ownerFriends.includes(email)) return "not_friend";
    if (session.participants.length >= COLLAB_LIMITS.maxParticipants) return "full";
    return "ok";
}

/** Invitees the owner may add: friends only, not themselves, not already invited, within the limit. */
export function invitableEmails(session: CollabSessionView, requested: readonly string[], ownerFriends: readonly string[]) {
    const room = Math.max(0, COLLAB_LIMITS.maxInvites - session.invited.length);
    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const email of new Set(requested)) {
        if (email === session.owner || !ownerFriends.includes(email)) rejected.push(email);
        else if (!session.invited.includes(email) && accepted.length < room) accepted.push(email);
    }
    return { accepted, rejected };
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export type CollabParticipant = { key: string; name: string; avatar: string | null; role: CollabRole; color: number; joinedAt: number };

/** collab_sessions/{id}/live/meta and the `meta` of every poll: no e-mail addresses. */
export type CollabMeta = {
    id: string;
    title: string;
    status: CollabStatus;
    readOnly: boolean;
    frozen: boolean;
    participants: CollabParticipant[];
    files: CollabFileMeta[];
    snapshotSeq: number;
    createdAt: number;
    expiresAt: number;
    endedAt: number;
    endReason: CollabEndReason | null;
};

export function publicMeta(id: string, session: CollabSessionView): CollabMeta {
    const participants = session.participants.flatMap((email): CollabParticipant[] => {
        const key = session.keys[email];
        const person = key ? session.people[key] : undefined;
        if (!key || !person) return [];
        return [{ key, name: person.name, avatar: person.avatar, role: email === session.owner ? "owner" : "editor", color: person.color, joinedAt: person.joinedAt }];
    });
    return {
        id,
        title: session.title,
        status: session.status,
        readOnly: session.readOnly,
        frozen: session.frozen,
        participants,
        files: session.files,
        snapshotSeq: session.snapshotSeq,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        endedAt: session.endedAt,
        endReason: session.endReason,
    };
}

/** Reads a meta document (client SDK or API); null when it isn't one. */
export function readMeta(value: unknown): CollabMeta | null {
    const record = objectOf(value);
    if (!isCollabSessionId(record.id)) return null;
    const participants = Array.isArray(record.participants) ? record.participants.slice(0, COLLAB_LIMITS.maxParticipants).flatMap((entry): CollabParticipant[] => {
        const person = objectOf(entry);
        if (!isParticipantKey(person.key)) return [];
        return [{
            key: person.key,
            name: safeName(person.name, "Hanogt"),
            avatar: safeAvatar(person.avatar),
            role: person.role === "owner" ? "owner" : "editor",
            color: typeof person.color === "number" && Number.isInteger(person.color) ? person.color : 0,
            joinedAt: timeOf(person.joinedAt),
        }];
    }) : [];
    const number = (input: unknown) => (typeof input === "number" && Number.isFinite(input) && input >= 0 ? Math.floor(input) : 0);
    return {
        id: record.id,
        title: cleanTitle(record.title, "Hanogt"),
        status: record.status === "active" ? "active" : "ended",
        readOnly: record.readOnly === true,
        frozen: record.frozen === true,
        participants,
        files: fileMetaList(record.files),
        snapshotSeq: number(record.snapshotSeq),
        createdAt: timeOf(record.createdAt),
        expiresAt: timeOf(record.expiresAt),
        endedAt: timeOf(record.endedAt),
        endReason: record.endReason === "owner" || record.endReason === "expired" || record.endReason === "replaced" ? record.endReason : null,
    };
}

export type CollabUpdateItem = { seq: number; data: string; client: number; by: string };
export type CollabSnapshot = { seq: number; data: string };
export type CollabPresenceItem = { id: string; by: string; client: number; data: string; at: number };
export type CollabChatMessage = { id: string; by: string; name: string; text: string; at: number };
export type CollabSignalKind = "offer" | "answer" | "candidates" | "bye";
export type CollabSignal = { id: string; from: string; fromClient: number; toClient: number; kind: CollabSignalKind; data: string; at: number };
/** The owner's view of an invitation; `key` is the participant key once they joined. */
export type CollabInvitee = { email: string; name: string; avatar: string | null; joined: boolean; key: string | null };

export const SIGNAL_KINDS: readonly CollabSignalKind[] = ["offer", "answer", "candidates", "bye"];

export function isSignalKind(value: unknown): value is CollabSignalKind {
    return typeof value === "string" && (SIGNAL_KINDS as readonly string[]).includes(value);
}

export function readUpdateItem(value: unknown): CollabUpdateItem | null {
    const record = objectOf(value);
    const seq = record.seq;
    if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1 || !isBase64(record.data, COLLAB_LIMITS.maxUpdateChars)) return null;
    return { seq, data: record.data, client: isClientId(record.client) ? record.client : -1, by: isParticipantKey(record.by) ? record.by : "" };
}

export function readPresenceItem(id: string, value: unknown): CollabPresenceItem | null {
    const record = objectOf(value);
    const parsed = parsePresenceDocId(id);
    if (!parsed || record.by !== parsed.key || record.client !== parsed.client || !isBase64(record.data, COLLAB_LIMITS.maxAwarenessChars)) return null;
    return { id, by: parsed.key, client: parsed.client, data: record.data, at: timeOf(record.at) };
}

export function readChatMessage(id: string, value: unknown): CollabChatMessage | null {
    const record = objectOf(value);
    const text = typeof record.text === "string" ? record.text.slice(0, COLLAB_LIMITS.maxChatChars) : "";
    if (!isChatId(id) || !isParticipantKey(record.by) || !text) return null;
    return { id, by: record.by, name: safeName(record.name, "Hanogt"), text, at: timeOf(record.at) };
}

export function readSignal(id: string, value: unknown): CollabSignal | null {
    const record = objectOf(value);
    if (!isSignalId(id) || !isParticipantKey(record.from) || !isClientId(record.fromClient) || !isClientId(record.toClient) || !isSignalKind(record.kind)) return null;
    if (typeof record.data !== "string" || record.data.length > COLLAB_LIMITS.maxSignalChars) return null;
    return { id, from: record.from, fromClient: record.fromClient, toClient: record.toClient, kind: record.kind, data: record.data, at: timeOf(record.at) };
}

/** GET /api/collab/[id] (participants). */
export type CollabPollResponse = {
    meta: CollabMeta;
    me: { key: string; role: CollabRole };
    /** The owner's invitations (owner only). */
    invited: CollabInvitee[] | null;
    /** The compacted state, sent when `after` is older than it. */
    snapshot: CollabSnapshot | null;
    updates: CollabUpdateItem[];
    /** More updates are waiting (ask again right away). */
    more: boolean;
    presence: CollabPresenceItem[];
    /** New chat messages, or null when nothing changed since `chat`. */
    chat: CollabChatMessage[] | null;
    signals: CollabSignal[];
};

/** GET /api/collab/[id]?view=info: what an invitee sees before joining. */
export type CollabInfoResponse = {
    id: string;
    title: string;
    status: CollabStatus;
    owner: { name: string; avatar: string | null };
    participants: Array<{ name: string; avatar: string | null }>;
    joined: boolean;
    role: CollabRole | null;
    full: boolean;
    readOnly: boolean;
};

export type CollabFriend = { email: string; name: string; avatar: string | null; status: "online" | "idle" | "dnd" | "offline" };

export type CollabErrorCode =
    | "unauthorized" | "bad_origin" | "rate_limited" | "invalid_request" | "payload_too_large"
    | "not_found" | "not_friend" | "full" | "ended" | "read_only" | "frozen" | "forbidden"
    | "invalid_file" | "too_many_files" | "file_too_large" | "content_too_large" | "invalid_update"
    | "conflict" | "unavailable" | "network";

export const COLLAB_ERROR_CODES: readonly CollabErrorCode[] = [
    "unauthorized", "bad_origin", "rate_limited", "invalid_request", "payload_too_large",
    "not_found", "not_friend", "full", "ended", "read_only", "frozen", "forbidden",
    "invalid_file", "too_many_files", "file_too_large", "content_too_large", "invalid_update",
    "conflict", "unavailable", "network",
];

export function isCollabErrorCode(value: unknown): value is CollabErrorCode {
    return typeof value === "string" && (COLLAB_ERROR_CODES as readonly string[]).includes(value);
}
