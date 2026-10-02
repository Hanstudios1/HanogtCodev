import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { isGroupId, safeGroupVoicePath } from "@/lib/groups";
import { dmChatId, dmMessageFromData, previewText, type DmMessage } from "@/lib/social/model";
import {
    commitServerMutations,
    deleteServerStorageObject,
    downloadServerStorageObject,
    getServerDocument,
    serverStorageBucket,
    uploadServerStorageObject,
} from "./firebase-rest";
import { isDocId, isOwnedStoragePath, normalizeEmail } from "./validate";

/*
 * Voice messages of Hanogt Social (direct messages and group chats) through
 * the server: the browser sends the recording to /api/social/voice, which
 * checks the friendship or membership, stores the file in Firebase Storage
 * with the service account and writes the message document; playback streams
 * the file back after the same check. Neither the Firebase bridge nor the
 * Storage security rules (whose cross-service Firestore lookups need an extra
 * project permission) are involved. Paths keep the existing layout
 * (voice-messages/<chatId>/…, group-voice-messages/<groupId>/…), so deleting
 * messages, chats, groups and accounts removes the files as before.
 */

export const VOICE_LIMITS = {
    maxBytes: 3 * 1024 * 1024,
    maxSeconds: 300,
    labelMax: 120,
} as const;

export type VoiceErrorCode =
    | "invalid_request" | "invalid_email" | "invalid_id" | "self_action" | "not_found" | "not_friend" | "blocked"
    | "voice_too_large" | "voice_format" | "voice_unavailable" | "voice_storage";

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

function emails(value: unknown) {
    return Array.isArray(value) ? value.map(normalizeEmail).filter(Boolean) : [];
}

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
    if (!serverStorageBucket()) throw new VoiceApiError(503, "voice_storage", "Sesli mesajlar için depolama yapılandırılmamış.");

    if (target.kind === "dm") {
        const partner = target.partner;
        await requireFriendship(user, partner);
        const { chatId } = await loadChat(user.email, partner);
        const label = previewText(input.label, VOICE_LIMITS.labelMax) || `🎤 Sesli mesaj (${clockLabel(seconds)})`;
        const voicePath = `voice-messages/${chatId}/${randomUUID()}.${format.extension}`;
        await uploadServerStorageObject(voicePath, input.bytes, format.contentType, { sender: user.email, recipient: partner });
        const createdAt = new Date(now);
        const id = newMessageId();
        const message = { fromEmail: user.email, text: label, type: "voice", voicePath, voiceDuration: seconds, createdAt, read: false };
        try {
            // One commit: the chat document (created by a first message) and the message appear together.
            await commitServerMutations([
                {
                    type: "update",
                    path: `chats/${chatId}`,
                    data: { participants: [user.email, partner].sort(), updatedAt: createdAt, lastMessage: previewText(label), lastMessageAt: createdAt, lastSender: user.email, typingUser: null },
                    updateFields: ["participants", "updatedAt", "lastMessage", "lastMessageAt", "lastSender", "typingUser"],
                },
                { type: "create", path: `chats/${chatId}/messages/${id}`, data: message },
            ]);
        } catch (error) {
            await deleteServerStorageObject(voicePath).catch(() => undefined);
            throw error;
        }
        return { kind: "dm", message: dmMessageFromData(id, { ...message, createdAt: now }) };
    }

    const groupId = target.groupId;
    await requireGroupMember(groupId, user.email);
    const profile = await getServerDocument<StoredProfile>(`public_profiles/${user.email}`).catch(() => null);
    const username = typeof profile?.username === "string" ? profile.username.trim() : "";
    const author = (username || user.sessionName?.trim() || user.email.split("@")[0]).slice(0, 80);
    const authorAvatar = typeof profile?.avatarUrl === "string" && profile.avatarUrl.length <= 2048 && /^https:\/\/[^\s"'<>`]+$/.test(profile.avatarUrl) ? profile.avatarUrl : null;
    const label = previewText(input.label, VOICE_LIMITS.labelMax) || `Sesli mesaj (${seconds} sn)`;
    const voicePath = `group-voice-messages/${groupId}/${randomUUID()}.${format.extension}`;
    await uploadServerStorageObject(voicePath, input.bytes, format.contentType, { sender: user.email, groupId });
    const createdAt = new Date(now);
    const id = newMessageId();
    const message = { fromEmail: user.email, author, authorAvatar, type: "voice", text: label, voicePath, voiceDuration: seconds, createdAt };
    try {
        await commitServerMutations([{ type: "create", path: `groups/${groupId}/messages/${id}`, data: message }]);
    } catch (error) {
        await deleteServerStorageObject(voicePath).catch(() => undefined);
        throw error;
    }
    return { kind: "group", message: { ...message, id, createdAt: createdAt.toISOString() } };
}

/**
 * The stored recording of one voice message for someone in the conversation
 * or group (former friends keep their history). `range` is passed on, so
 * players that ask for byte ranges get them.
 */
export async function openVoiceMessage(user: VoiceUser, target: VoiceTarget, messageId: unknown, range?: string | null) {
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
    if (!voicePath) throw new VoiceApiError(404, "voice_unavailable", "Sesli mesaj bulunamadı veya silinmiş.");
    if (!serverStorageBucket()) throw new VoiceApiError(503, "voice_storage", "Sesli mesajlar için depolama yapılandırılmamış.");
    const response = await downloadServerStorageObject(voicePath, range);
    if (!response) throw new VoiceApiError(404, "voice_unavailable", "Sesli mesaj bulunamadı veya silinmiş.");
    const stored = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const contentType = /^audio\/[a-z0-9.+-]{1,40}$/.test(stored) ? stored : "application/octet-stream";
    return { response, contentType };
}
