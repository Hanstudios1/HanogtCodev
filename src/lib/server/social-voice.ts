import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { isGroupId, safeGroupVoicePath } from "@/lib/groups";
import { dmChatId, dmMessageFromData, previewText, type DmMessage } from "@/lib/social/model";
import {
    commitServerMutations,
    deleteServerStorageObject,
    downloadServerStorageObject,
    getServerDocument,
    runServerQuery,
    serverStorageBucket,
} from "./firebase-rest";
import { isDocId, isOwnedStoragePath, normalizeEmail } from "./validate";

/*
 * Voice messages of Hanogt Social (direct messages and group chats) through
 * the server: the browser sends the recording to /api/social/voice, which
 * checks the friendship or membership and writes the recording into the
 * server-only Firestore collection voice_clips together with the message, in
 * one commit; playback reads it back after the same check. Cloud Storage for
 * Firebase needs the Blaze plan since 2024, so it is not needed any more:
 * recordings stored there before keep playing (and are deleted) while a bucket
 * is configured. Paths keep the existing layout
 * (voice-messages/<chatId>/<id>.<ext>, group-voice-messages/<groupId>/<id>.<ext>),
 * so the message documents, the path checks and every deletion flow are
 * unchanged. <id> is the clip document's id; the clip repeats the full path,
 * so a message can only reach the recording written for exactly that path.
 */

export const VOICE_LIMITS = {
    maxBytes: 3 * 1024 * 1024,
    maxSeconds: 300,
    labelMax: 120,
} as const;

export type VoiceErrorCode =
    | "invalid_request" | "invalid_email" | "invalid_id" | "self_action" | "not_found" | "not_friend" | "blocked"
    | "voice_too_large" | "voice_format" | "voice_unavailable" | "voice_failed";

/** Expected failures: the message is Turkish (primary language), the interface translates the code. */
export class VoiceApiError extends Error {
    readonly status: number;
    readonly code: VoiceErrorCode;

    constructor(status: number, code: VoiceErrorCode, message: string) {
        super(message);
        this.name = "VoiceApiError";
        this.status = status;
        this.code = code;
    }
}

export type VoiceUser = { email: string; friends: readonly string[]; blockedUsers: readonly string[]; sessionName?: string };
export type VoiceTarget = { kind: "dm"; partner: string } | { kind: "group"; groupId: string };

type StoredUser = { friends?: unknown; blockedUsers?: unknown; banned?: unknown; suspended?: unknown };
type StoredChat = { participants?: unknown };
type StoredMessage = { fromEmail?: unknown; type?: unknown; voicePath?: unknown; deleted?: unknown };
type StoredGroup = { members?: unknown };
type StoredProfile = { username?: unknown; avatarUrl?: unknown };
type StoredClip = { path?: unknown; contentType?: unknown; size?: unknown; parts?: unknown; data?: unknown };
type Mutations = Parameters<typeof commitServerMutations>[0];

function emails(value: unknown) {
    return Array.isArray(value) ? value.map(normalizeEmail).filter(Boolean) : [];
}

/* -------------------------------------------------------------------------- */
/* Clips: recordings in Firestore                                             */
/* -------------------------------------------------------------------------- */

const CLIPS = "voice_clips";
/** Bytes kept in one document (Firestore allows 1 MiB per document); longer recordings are split into parts. */
const CLIP_PART_BYTES = 700_000;
const CLIP_MAX_PARTS = Math.ceil(VOICE_LIMITS.maxBytes / CLIP_PART_BYTES);
/** `<uuid>.<ext>`: the clip's document id is the uuid. */
const CLIP_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]{1,8}$/;

const unavailable = () => new VoiceApiError(404, "voice_unavailable", "Sesli mesaj bulunamadı veya silinmiş.");

/** A voice message path: `voice-messages/<chatId>/<file>` or `group-voice-messages/<groupId>/<file>`. */
function isVoicePath(path: unknown): path is string {
    if (typeof path !== "string") return false;
    const [folder, containerId = ""] = path.split("/");
    return (folder === "voice-messages" || folder === "group-voice-messages")
        && containerId.length > 0 && containerId !== "." && containerId !== ".."
        && isOwnedStoragePath(path, folder, containerId);
}

function clipIdOf(path: string) {
    return CLIP_FILE.exec(path.split("/")[2] ?? "")?.[1] ?? null;
}

/** The stored number of parts (0: the bytes are inline); null when it isn't a valid count. */
function clipParts(value: unknown) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= CLIP_MAX_PARTS ? value : null;
}

/** What is served as the recording's type: audio types only, anything else as plain bytes. */
function audioType(value: unknown) {
    const type = typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : "";
    return /^audio\/[a-z0-9.+-]{1,40}$/.test(type) ? type : "application/octet-stream";
}

/**
 * The clip document of a new recording (with the bytes inline up to 700 kB,
 * otherwise in voice_clips/<id>/parts/<0…n-1>), created with its message.
 */
function clipWrites(clipId: string, voicePath: string, bytes: Uint8Array, contentType: string, owner: { sender: string; scope: "dm" | "group"; scopeId: string }, createdAt: Date): Mutations {
    const size = bytes.byteLength;
    const parts = size <= CLIP_PART_BYTES ? 0 : Math.ceil(size / CLIP_PART_BYTES);
    const clip: Record<string, unknown> = { path: voicePath, contentType, size, parts, createdAt, sender: owner.sender, scope: owner.scope, scopeId: owner.scopeId };
    if (!parts) clip.data = bytes;
    return [
        { type: "create", path: `${CLIPS}/${clipId}`, data: clip },
        ...Array.from({ length: parts }, (_, index) => ({
            type: "create" as const,
            path: `${CLIPS}/${clipId}/parts/${index}`,
            data: { data: bytes.subarray(index * CLIP_PART_BYTES, (index + 1) * CLIP_PART_BYTES) },
        })),
    ];
}

/**
 * The recording stored for exactly `path`; null when there is no clip for it
 * (recordings from before voice_clips are in Storage).
 */
async function readVoiceClip(path: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string } | null> {
    const clipId = clipIdOf(path);
    if (!clipId) return null;
    const clip = await getServerDocument<StoredClip>(`${CLIPS}/${clipId}`);
    if (!clip || clip.path !== path) return null;
    const size = typeof clip.size === "number" && Number.isInteger(clip.size) && clip.size > 0 && clip.size <= VOICE_LIMITS.maxBytes ? clip.size : 0;
    const parts = clipParts(clip.parts);
    if (!size || parts === null) throw unavailable();
    const chunks = parts === 0
        ? [clip.data]
        : (await Promise.all(Array.from({ length: parts }, (_, index) => getServerDocument<{ data?: unknown }>(`${CLIPS}/${clipId}/parts/${index}`)))).map((part) => part?.data);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        // A missing or mismatched part (e.g. while the clip is being deleted): never serve a cut recording.
        if (!(chunk instanceof Uint8Array) || offset + chunk.byteLength > size) throw unavailable();
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    if (offset !== size) throw unavailable();
    return { bytes, contentType: audioType(clip.contentType) };
}

/** Deletes the clip written for exactly `path` (with its parts); false when there is none. */
async function deleteVoiceClip(path: string) {
    const clipId = clipIdOf(path);
    if (!clipId) return false;
    // A projection, so the recording itself isn't downloaded just to be deleted.
    const [clip] = (await runServerQuery<StoredClip>({ collectionId: CLIPS, where: [{ field: "path", op: "EQUAL", value: path }], select: ["parts"], limit: 5 }))
        .filter((record) => record._id === clipId);
    if (!clip) return false;
    // An unreadable count removes every part a recording can have (deleting a missing document is fine).
    const parts = clipParts(clip.parts) ?? CLIP_MAX_PARTS;
    await commitServerMutations([
        ...Array.from({ length: parts }, (_, index) => ({ type: "delete" as const, path: `${CLIPS}/${clipId}/parts/${index}` })),
        { type: "delete", path: `${CLIPS}/${clipId}` },
    ]);
    return true;
}

/**
 * HTTP status of a failed Storage call, read from the helper's message
 * ("… (403)."); 0 for network errors.
 */
function storageStatus(error: unknown) {
    return Number(/\((\d{3})\)\.?$/.exec(error instanceof Error ? error.message : "")?.[1] ?? 0);
}

/**
 * Storage refuses for good (no Blaze plan, missing permission or bucket):
 * every 4xx except timeouts and rate limits. Retrying won't help.
 */
function storageUnavailable(error: unknown) {
    const status = storageStatus(error);
    return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Deletes the recording of a voice message: its clip in voice_clips (only the
 * one written for exactly this path) or, for messages from before, the
 * Storage object. Callers check first that the path belongs to the chat or
 * group. Storage is best effort: without the Blaze plan every Storage call
 * fails, which must never keep a message, group or account from being
 * deleted. With `retryStorage` (account deletion) a temporary Storage failure
 * (rate limit, server error, network) is still thrown, so the message is kept
 * and a later run deletes the file. Failures to delete a clip are thrown.
 */
export async function deleteVoiceRecording(path: string, options: { retryStorage?: boolean } = {}) {
    if (!isVoicePath(path)) return;
    if (await deleteVoiceClip(path)) return;
    try {
        await deleteServerStorageObject(path);
    } catch (error) {
        if (options.retryStorage && !storageUnavailable(error)) throw error;
    }
}

/**
 * Writes the recording and its message in one commit: at most 3 MB, about
 * 4 MB as base64, well within Firestore's 10 MiB per request. A commit is
 * atomic, so a failed one wrote nothing; after an unclear failure (e.g. the
 * connection dropped after Firestore applied it) the clip is removed unless
 * its message is there, so no recording is ever left without a message.
 */
async function commitVoiceMessage(voicePath: string, messagePath: string, writes: Mutations) {
    try {
        await commitServerMutations(writes);
    } catch (error) {
        const message = await getServerDocument(messagePath).catch(() => undefined);
        if (message === null) await deleteVoiceClip(voicePath).catch(() => undefined);
        throw error;
    }
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

/** `with=<e-mail>` (a direct conversation) or `group=<id>`; exactly one of them. */
export function readVoiceTarget(params: { get(name: string): string | null }, me: string): VoiceTarget {
    const partnerParam = params.get("with");
    const groupParam = params.get("group");
    if (partnerParam && groupParam) throw new VoiceApiError(400, "invalid_request", "Geçersiz hedef.");
    if (groupParam) {
        if (!isGroupId(groupParam)) throw new VoiceApiError(400, "invalid_id", "Geçersiz grup.");
        return { kind: "group", groupId: groupParam };
    }
    const partner = normalizeEmail(partnerParam);
    if (!partner) throw new VoiceApiError(400, partnerParam ? "invalid_email" : "invalid_request", "Geçersiz kullanıcı.");
    if (partner === me) throw new VoiceApiError(400, "self_action", "Bu işlemi kendi hesabınıza uygulayamazsınız.");
    return { kind: "dm", partner };
}

/**
 * The audio format from the file's first bytes (what MediaRecorder produces:
 * WebM/Opus, Ogg, MP4/AAC on Safari; MP3 and WAV for good measure). Anything
 * else is refused, so nothing but audio is ever stored or served back.
 */
export function sniffAudio(bytes: Uint8Array): { contentType: string; extension: string } | null {
    if (bytes.length < 12) return null;
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { contentType: "audio/webm", extension: "webm" };
    if (ascii(0, 4) === "OggS") return { contentType: "audio/ogg", extension: "ogg" };
    if (ascii(4, 4) === "ftyp") return { contentType: "audio/mp4", extension: "m4a" };
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return { contentType: "audio/wav", extension: "wav" };
    if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return { contentType: "audio/mpeg", extension: "mp3" };
    return null;
}

/** Reads a request body up to `max` bytes; a longer one is refused without reading it all. */
export async function readLimitedBody(body: ReadableStream<Uint8Array> | null, max: number, declaredLength = 0): Promise<Uint8Array> {
    if (declaredLength > max) throw new VoiceApiError(413, "voice_too_large", "Sesli mesaj en fazla 3 MB olabilir.");
    if (!body) return new Uint8Array();
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
            await reader.cancel().catch(() => undefined);
            throw new VoiceApiError(413, "voice_too_large", "Sesli mesaj en fazla 3 MB olabilir.");
        }
        chunks.push(value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 20 random characters, like the client SDK's automatic document ids. */
function newMessageId() {
    return Array.from(randomBytes(20), (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join("");
}

function clockLabel(seconds: number) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Sending needs a friendship in both directions and no block on either side (as for text messages). */
async function requireFriendship(user: VoiceUser, partner: string) {
    if (user.blockedUsers.includes(partner)) throw new VoiceApiError(403, "blocked", "Bu kullanıcıyı engellediniz.");
    if (!user.friends.includes(partner)) throw new VoiceApiError(403, "not_friend", "Yalnızca arkadaşlarınıza mesaj gönderebilirsiniz.");
    const record = await getServerDocument<StoredUser>(`users/${partner}`);
    if (!record || record.banned === true || record.suspended === true || !emails(record.friends).includes(user.email) || emails(record.blockedUsers).includes(user.email)) {
        throw new VoiceApiError(403, "not_friend", "Bu kullanıcıya mesaj gönderilemiyor.");
    }
}

/** The conversation document of the two people; a document with other participants is never used. */
async function loadChat(email: string, partner: string) {
    const chatId = dmChatId(email, partner);
    const chat = await getServerDocument<StoredChat>(`chats/${chatId}`);
    if (chat) {
        const participants = emails(chat.participants);
        if (participants.length !== 2 || !participants.includes(email) || !participants.includes(partner)) throw new VoiceApiError(404, "not_found", "Sohbet bulunamadı.");
    }
    return { chatId, chat };
}

async function requireGroupMember(groupId: string, email: string) {
    const group = await getServerDocument<StoredGroup>(`groups/${groupId}`);
    if (!group || !emails(group.members).includes(email)) throw new VoiceApiError(404, "not_found", "Grup bulunamadı veya erişiminiz yok.");
    return group;
}

export type SentVoiceMessage =
    | { kind: "dm"; message: DmMessage }
    | { kind: "group"; message: Record<string, unknown> & { id: string } };

/**
 * Stores a recording and writes its message. `label` is the text shown in
 * previews and notifications (the sender's language); `seconds` its length.
 */
export async function sendVoiceMessage(
    user: VoiceUser,
    target: VoiceTarget,
    input: { bytes: Uint8Array; seconds: unknown; label?: unknown },
    now = Date.now(),
): Promise<SentVoiceMessage> {
    if (!input.bytes.byteLength) throw new VoiceApiError(400, "invalid_request", "Sesli mesaj boş.");
    if (input.bytes.byteLength > VOICE_LIMITS.maxBytes) throw new VoiceApiError(413, "voice_too_large", "Sesli mesaj en fazla 3 MB olabilir.");
    const format = sniffAudio(input.bytes);
    if (!format) throw new VoiceApiError(415, "voice_format", "Bu ses biçimi desteklenmiyor.");
    const seconds = Math.max(1, Math.min(VOICE_LIMITS.maxSeconds, Math.round(Number(input.seconds)) || 1));
    const clipId = randomUUID();
    const createdAt = new Date(now);
    const id = newMessageId();

    if (target.kind === "dm") {
        const partner = target.partner;
        await requireFriendship(user, partner);
        const { chatId } = await loadChat(user.email, partner);
        const label = previewText(input.label, VOICE_LIMITS.labelMax) || `🎤 Sesli mesaj (${clockLabel(seconds)})`;
        const voicePath = `voice-messages/${chatId}/${clipId}.${format.extension}`;
        const messagePath = `chats/${chatId}/messages/${id}`;
        const message = { fromEmail: user.email, text: label, type: "voice", voicePath, voiceDuration: seconds, createdAt, read: false };
        // One commit: the recording, the chat document (created by a first message) and the message appear together.
        await commitVoiceMessage(voicePath, messagePath, [
            ...clipWrites(clipId, voicePath, input.bytes, format.contentType, { sender: user.email, scope: "dm", scopeId: chatId }, createdAt),
            {
                type: "update",
                path: `chats/${chatId}`,
                data: { participants: [user.email, partner].sort(), updatedAt: createdAt, lastMessage: previewText(label), lastMessageAt: createdAt, lastSender: user.email, typingUser: null },
                updateFields: ["participants", "updatedAt", "lastMessage", "lastMessageAt", "lastSender", "typingUser"],
            },
            { type: "create", path: messagePath, data: message },
        ]);
        return { kind: "dm", message: dmMessageFromData(id, { ...message, createdAt: now }) };
    }

    const groupId = target.groupId;
    await requireGroupMember(groupId, user.email);
    const profile = await getServerDocument<StoredProfile>(`public_profiles/${user.email}`).catch(() => null);
    const username = typeof profile?.username === "string" ? profile.username.trim() : "";
    const author = (username || user.sessionName?.trim() || user.email.split("@")[0]).slice(0, 80);
    const authorAvatar = typeof profile?.avatarUrl === "string" && profile.avatarUrl.length <= 2048 && /^https:\/\/[^\s"'<>`]+$/.test(profile.avatarUrl) ? profile.avatarUrl : null;
    const label = previewText(input.label, VOICE_LIMITS.labelMax) || `Sesli mesaj (${seconds} sn)`;
    const voicePath = `group-voice-messages/${groupId}/${clipId}.${format.extension}`;
    const messagePath = `groups/${groupId}/messages/${id}`;
    const message = { fromEmail: user.email, author, authorAvatar, type: "voice", text: label, voicePath, voiceDuration: seconds, createdAt };
    await commitVoiceMessage(voicePath, messagePath, [
        ...clipWrites(clipId, voicePath, input.bytes, format.contentType, { sender: user.email, scope: "group", scopeId: groupId }, createdAt),
        { type: "create", path: messagePath, data: message },
    ]);
    return { kind: "group", message: { ...message, id, createdAt: createdAt.toISOString() } };
}

/**
 * One byte range (`bytes=a-b`, `bytes=a-` or the last n bytes, `bytes=-n`) of
 * a recording of `size` bytes; null serves all of it (no or an invalid header,
 * several ranges), "unsatisfiable" when the range starts past the end.
 */
function byteRange(header: string | null | undefined, size: number): { start: number; end: number } | "unsatisfiable" | null {
    const match = /^bytes=(\d{0,12})-(\d{0,12})$/.exec(header?.trim() ?? "");
    if (!match || (!match[1] && !match[2])) return null;
    if (!match[1]) {
        const length = Number(match[2]);
        return length > 0 ? { start: Math.max(0, size - length), end: size - 1 } : "unsatisfiable";
    }
    const start = Number(match[1]);
    // A last byte before the first makes the header invalid, which means it is ignored (RFC 9110).
    if (match[2] && Number(match[2]) < start) return null;
    if (start >= size) return "unsatisfiable";
    return { start, end: match[2] ? Math.min(Number(match[2]), size - 1) : size - 1 };
}

/** A recording ready to be served. */
export type VoicePlayback =
    /** From voice_clips: all of it (200), the asked byte range (206) or none for a range past the end (416). */
    | { source: "clip"; status: 200 | 206 | 416; body: Uint8Array<ArrayBuffer>; contentType: string; contentRange: string | null }
    /** From Storage (recordings from before voice_clips): the download, streamed on. */
    | { source: "storage"; status: 200 | 206; response: Response; contentType: string };

/**
 * The stored recording of one voice message for someone in the conversation
 * or group (former friends keep their history). `range` (one byte range) is
 * honoured, so players that ask for byte ranges get them.
 */
export async function openVoiceMessage(user: VoiceUser, target: VoiceTarget, messageId: unknown, range?: string | null): Promise<VoicePlayback> {
    if (!isDocId(messageId)) throw new VoiceApiError(400, "invalid_id", "Geçersiz mesaj.");
    let voicePath: string | null = null;
    if (target.kind === "dm") {
        const { chatId, chat } = await loadChat(user.email, target.partner);
        if (!chat) throw new VoiceApiError(404, "not_found", "Sohbet bulunamadı.");
        const message = await getServerDocument<StoredMessage>(`chats/${chatId}/messages/${messageId}`);
        if (message && message.deleted !== true && isOwnedStoragePath(message.voicePath, "voice-messages", chatId)) voicePath = message.voicePath;
    } else {
        await requireGroupMember(target.groupId, user.email);
        const message = await getServerDocument<StoredMessage>(`groups/${target.groupId}/messages/${messageId}`);
        voicePath = message ? safeGroupVoicePath(message.voicePath, target.groupId) : null;
    }
    if (!voicePath) throw unavailable();

    const clip = await readVoiceClip(voicePath);
    if (clip) {
        const size = clip.bytes.byteLength;
        const wanted = byteRange(range, size);
        if (wanted === "unsatisfiable") return { source: "clip", status: 416, body: new Uint8Array(0), contentType: clip.contentType, contentRange: `bytes */${size}` };
        if (wanted) return { source: "clip", status: 206, body: clip.bytes.subarray(wanted.start, wanted.end + 1), contentType: clip.contentType, contentRange: `bytes ${wanted.start}-${wanted.end}/${size}` };
        return { source: "clip", status: 200, body: clip.bytes, contentType: clip.contentType, contentRange: null };
    }

    // Recordings from before voice_clips are in Storage, which only exists with a configured bucket (Blaze plan).
    if (!serverStorageBucket()) throw unavailable();
    let response: Response | null;
    try {
        response = await downloadServerStorageObject(voicePath, range);
    } catch (error) {
        // Storage refusing for good (e.g. back on the Spark plan): the recording can't be opened.
        if (storageUnavailable(error)) throw unavailable();
        throw error;
    }
    if (!response) throw unavailable();
    return { source: "storage", status: response.status === 206 ? 206 : 200, response, contentType: audioType(response.headers.get("content-type")) };
}
