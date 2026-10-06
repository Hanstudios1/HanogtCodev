import { after } from "next/server";
import { autoDocumentId, commitServerMutations, getServerDocument } from "@/lib/server/firebase-rest";
import { attachmentField, commitWithFile, fileWrites, type PreparedFile } from "@/lib/server/message-files";
import { notifyDirectMessage } from "@/lib/server/social-notify";
import { isDocId } from "@/lib/server/validate";
import { ATTACHMENT_LIMITS, attachmentPreview, readMessageAttachment, type MessageAttachment } from "@/lib/social/attachments";
import { readMessageGif } from "@/lib/social/gif";
import { SOCIAL_LIMITS, cleanMessageText, dmChatId, dmMessageFromData, isSticker, messagePreview, previewText, type DmReply } from "@/lib/social/model";
import { SocialApiError, assertRateLimit, emailList, type SocialUser } from "@/lib/social/server";

/*
 * Sending direct messages, shared by /api/social/dm (text, stickers, GIFs)
 * and /api/social/files (a file with an optional caption): friendship and
 * blocks, the quoted message, the chat list's preview and the notification
 * are the same for every kind of message.
 */

export type StoredChat = { participants?: unknown; lastMessage?: unknown; lastMessageAt?: unknown; lastSender?: unknown; typingUser?: unknown; updatedAt?: unknown; pinnedMessageIds?: unknown };
export type StoredMessage = Record<string, unknown> & { fromEmail?: unknown; text?: unknown; type?: unknown; voicePath?: unknown; file?: unknown; createdAt?: unknown; deleted?: unknown; reactions?: unknown };
type PartnerRecord = { friends?: unknown; blockedUsers?: unknown; banned?: unknown; suspended?: unknown };

export const chatPath = (chatId: string) => `chats/${chatId}`;
export const messagePath = (chatId: string, messageId: string) => `chats/${chatId}/messages/${messageId}`;

/** The conversation of the caller and `partner`; a document with other participants is never used. */
export async function loadChat(email: string, partner: string) {
    const chatId = dmChatId(email, partner);
    const chat = await getServerDocument<StoredChat>(chatPath(chatId));
    if (chat) {
        const participants = emailList(chat.participants, 3);
        if (participants.length !== 2 || !participants.includes(email) || !participants.includes(partner)) {
            throw new SocialApiError(404, "not_found", "Sohbet bulunamadı.");
        }
    }
    return { chatId, chat };
}

/** Sending needs a friendship in both directions and no block on either side. */
export async function requireFriendship(user: SocialUser, partner: string) {
    if (user.blockedUsers.includes(partner)) throw new SocialApiError(403, "blocked", "Bu kullanıcıyı engellediniz.");
    if (!user.friends.includes(partner)) throw new SocialApiError(403, "not_friend", "Yalnızca arkadaşlarınıza mesaj gönderebilirsiniz.");
    const record = await getServerDocument<PartnerRecord>(`users/${partner}`);
    if (!record || record.banned === true || record.suspended === true || !emailList(record.friends).includes(user.email) || emailList(record.blockedUsers).includes(user.email)) {
        throw new SocialApiError(403, "not_friend", "Bu kullanıcıya mesaj gönderilemiyor.");
    }
}

/** A file and its caption in a preview: "📎 name · caption". */
function withFile(attachment: MessageAttachment | null, text: string, max: number) {
    if (!attachment) return text;
    return previewText(text ? `${attachmentPreview(attachment)} · ${text}` : attachmentPreview(attachment), max);
}

/**
 * The quoted message is read from the conversation itself, so a reply can't
 * put words in the other person's mouth.
 */
export async function readReply(value: unknown, chatId: string): Promise<DmReply | null> {
    if (!value || typeof value !== "object") return null;
    const id = (value as { id?: unknown }).id;
    if (!isDocId(id)) return null;
    const quoted = await getServerDocument<StoredMessage>(messagePath(chatId, id));
    if (!quoted || quoted.deleted === true || typeof quoted.fromEmail !== "string") return null;
    const attachment = quoted.type === "file" ? readMessageAttachment(quoted.file) : null;
    return { id, text: withFile(attachment, messagePreview(quoted.text, SOCIAL_LIMITS.replyExcerptMax), SOCIAL_LIMITS.replyExcerptMax), fromEmail: quoted.fromEmail };
}

/** What the chat list and the notification show for a message. */
export function previewOf(type: string, text: string, attachment: MessageAttachment | null = null) {
    if (type === "gif") return text ? `GIF · ${previewText(text, 80)}` : "GIF";
    if (type === "file") return withFile(attachment, messagePreview(text, 80), SOCIAL_LIMITS.previewMax);
    return messagePreview(text);
}

/**
 * Sends a direct message: text, a sticker, a GIF or (with `file`) a file and
 * its caption. A file is written in the same commit as its message.
 */
export async function sendDirect(user: SocialUser, partner: string, body: Record<string, unknown>, file: PreparedFile | null = null) {
    await assertRateLimit(`social:dm-send:${user.email}`, 40);
    await requireFriendship(user, partner);
    const type = file ? "file" : body.type === "sticker" ? "sticker" : body.type === "gif" ? "gif" : "text";
    let text: string;
    const gif = type === "gif" ? readMessageGif(body.gif) : null;
    if (type === "file") {
        // The caption may be empty.
        text = cleanMessageText(body.text, ATTACHMENT_LIMITS.captionMax * 2);
        if (text.length > ATTACHMENT_LIMITS.captionMax) throw new SocialApiError(413, "message_too_long", "Açıklama en fazla 2000 karakter olabilir.");
    } else if (type === "sticker") {
        if (!isSticker(body.text)) throw new SocialApiError(400, "invalid_request", "Geçersiz çıkartma.");
        text = body.text;
    } else if (type === "gif") {
        if (!gif) throw new SocialApiError(400, "invalid_request", "Geçersiz GIF.");
        text = gif.title;
    } else {
        const full = cleanMessageText(body.text, SOCIAL_LIMITS.messageMax * 2);
        if (!full) throw new SocialApiError(400, "empty_message", "Mesaj boş olamaz.");
        if (full.length > SOCIAL_LIMITS.messageMax) throw new SocialApiError(413, "message_too_long", "Mesaj en fazla 4000 karakter olabilir.");
        text = full;
    }
    const chatId = dmChatId(user.email, partner);
    const replyTo = await readReply(body.replyTo, chatId);
    const now = new Date();
    const id = autoDocumentId();
    const message: Record<string, unknown> = { fromEmail: user.email, text, type, createdAt: now, read: false };
    if (replyTo) message.replyTo = replyTo;
    if (gif) message.gif = gif;
    if (file) message.file = attachmentField(file);
    if (body.forwarded === true && !file) message.forwarded = true;
    const preview = previewOf(type, text, file?.attachment ?? null);
    // One commit: the chat document (created on the first message), the message and its file appear together.
    const writes: Parameters<typeof commitServerMutations>[0] = [
        {
            type: "update",
            path: chatPath(chatId),
            data: { participants: [user.email, partner].sort(), updatedAt: now, lastMessage: preview, lastMessageAt: now, lastSender: user.email, typingUser: null },
            updateFields: ["participants", "updatedAt", "lastMessage", "lastMessageAt", "lastSender", "typingUser"],
        },
        { type: "create", path: messagePath(chatId, id), data: message },
    ];
    if (file) await commitWithFile(file, messagePath(chatId, id), [...fileWrites(file, { sender: user.email, container: `dm:${chatId}`, messagePath: messagePath(chatId, id) }, now), ...writes]);
    else await commitServerMutations(writes);
    // The bell, after the answer (the sender doesn't wait for it).
    after(() => notifyDirectMessage(partner, user.email, chatId, preview));
    return { success: true, message: dmMessageFromData(id, { ...message, createdAt: now.getTime() }) };
}
