import { after, type NextRequest } from "next/server";
import { isReactionKey } from "@/lib/groups";
import { commitServerPatches, getServerDocument, patchServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { deleteMessageFiles } from "@/lib/server/message-files";
import { clearMessageTraces, refreshMessageTraces } from "@/lib/server/message-traces";
import { clearDirectMessageNotification } from "@/lib/server/social-notify";
import { deleteVoiceRecording } from "@/lib/server/social-voice";
import { isDocId, isOwnedStoragePath } from "@/lib/server/validate";
import {
    SOCIAL_LIMITS,
    cleanMessageText,
    dmMessageFromData,
    messagePreview,
    readDmReactions,
    readPinnedIds,
    timeOf,
    type DmConversationResponse,
    type DmMessage,
} from "@/lib/social/model";
import {
    SocialApiError,
    assertRateLimit,
    assertSameOrigin,
    readBody,
    readCursor,
    readPartner,
    requireSocialUser,
    socialErrorResponse,
    socialJson,
    type SocialUser,
} from "@/lib/social/server";
import { chatPath, loadChat, messagePath, sendDirect, type StoredMessage } from "../_dm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Direct messages: every write goes through here (the browser only reads,
 * live through the client SDK or by polling GET with a `since` cursor), so
 * friendship, blocks, limits and text cleaning apply to every message.
 * Documents: chats/{a_b} and chats/{a_b}/messages.
 */

const PAGE_DEFAULT = SOCIAL_LIMITS.dmPage;
const PAGE_MAX = 100;
const TYPING_FRESH_MS = 8_000;
const READ_BATCH = 200;
const PINNED_MAX = 25;
function readMessageId(value: unknown) {
    if (!isDocId(value)) throw new SocialApiError(400, "invalid_id", "Geçersiz mesaj.");
    return value;
}

function wire(record: StoredMessage & { _id: string }): DmMessage {
    return dmMessageFromData(record._id, record);
}

async function conversation(user: SocialUser, request: NextRequest): Promise<DmConversationResponse> {
    const params = request.nextUrl.searchParams;
    const partner = readPartner(params.get("with"), user.email);
    const { chatId, chat } = await loadChat(user.email, partner);
    const isFriend = user.friends.includes(partner);
    const blocked = user.blockedUsers.includes(partner);
    if (!chat && !isFriend) throw new SocialApiError(404, "not_found", "Sohbet bulunamadı.");
    const since = readCursor(params.get("since"));
    const before = since ? 0 : readCursor(params.get("before"));
    const limit = Math.min(Math.max(Math.floor(Number(params.get("limit"))) || PAGE_DEFAULT, 1), PAGE_MAX);
    const records = chat ? await runServerQuery<StoredMessage>({
        collectionId: "messages",
        parentPath: chatPath(chatId),
        where: since
            ? [{ field: "createdAt", op: "GREATER_THAN_OR_EQUAL", value: new Date(since) }]
            : before ? [{ field: "createdAt", op: "LESS_THAN", value: new Date(before) }] : [],
        orderBy: [{ field: "createdAt", direction: since ? "ASCENDING" : "DESCENDING" }],
        limit,
    }) : [];
    const now = Date.now();
    return {
        exists: Boolean(chat),
        messages: records.map(wire).sort((a, b) => a.createdAt - b.createdAt),
        hasMore: !since && records.length >= limit,
        typing: Boolean(chat) && chat?.typingUser === partner && now - timeOf(chat?.updatedAt) < TYPING_FRESH_MS,
        canSend: isFriend && !blocked,
        isFriend,
        blocked,
        pinnedMessageIds: readPinnedIds(chat?.pinnedMessageIds, PINNED_MAX),
        now,
    };
}

/** The caller's own message in the conversation (edits and deletions). */
async function ownMessage(user: SocialUser, partner: string, value: unknown) {
    const { chatId, chat } = await loadChat(user.email, partner);
    if (!chat) throw new SocialApiError(404, "message_not_found", "Mesaj bulunamadı.");
    const id = readMessageId(value);
    const message = await getServerDocument<StoredMessage>(messagePath(chatId, id));
    if (!message) throw new SocialApiError(404, "message_not_found", "Mesaj bulunamadı.");
    if (message.fromEmail !== user.email) throw new SocialApiError(403, "forbidden", "Yalnızca kendi mesajlarınızı değiştirebilirsiniz.");
    // The chat preview follows the change when this is the newest message.
    const [latest] = await runServerQuery<{ createdAt?: unknown }>({
        collectionId: "messages",
        parentPath: chatPath(chatId),
        orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
        select: ["createdAt"],
        limit: 1,
    }).catch(() => []);
    return { chatId, chat, id, message, newest: latest?._id === id };
}

async function edit(user: SocialUser, partner: string, body: Record<string, unknown>) {
    await assertRateLimit(`social:dm-write:${user.email}`, 60);
    const { chatId, id, message, newest } = await ownMessage(user, partner, body.messageId);
    if (message.deleted === true || message.type !== "text") throw new SocialApiError(400, "invalid_request", "Bu mesaj düzenlenemez.");
    const text = cleanMessageText(body.text, SOCIAL_LIMITS.messageMax * 2);
    if (!text) throw new SocialApiError(400, "empty_message", "Mesaj boş olamaz.");
    if (text.length > SOCIAL_LIMITS.messageMax) throw new SocialApiError(413, "message_too_long", "Mesaj en fazla 4000 karakter olabilir.");
    await commitServerPatches([
        { path: messagePath(chatId, id), data: { text, edited: true }, updateFields: ["text", "edited"], updateTime: message._updateTime },
        ...(newest ? [{ path: chatPath(chatId), data: { lastMessage: messagePreview(text) }, updateFields: ["lastMessage"], exists: true }] : []),
    ]);
    // Replies quote the new words and stars show them.
    after(() => refreshMessageTraces({ scope: "dm", place: chatId, parentPath: chatPath(chatId) }, id, { ...message, text }, messagePreview(text, SOCIAL_LIMITS.replyExcerptMax)));
    return { success: true };
}

async function remove(user: SocialUser, partner: string, body: Record<string, unknown>) {
    await assertRateLimit(`social:dm-write:${user.email}`, 60);
    const { chatId, chat, id, message, newest } = await ownMessage(user, partner, body.messageId);
    if (message.deleted === true) return { success: true };
    // Voice paths are written by clients: only recordings inside this chat's folder are removed.
    if (isOwnedStoragePath(message.voicePath, "voice-messages", chatId)) await deleteVoiceRecording(message.voicePath);
    // A file goes with its message (and frees its sender's space).
    if (message.file && typeof message.file === "object") await deleteMessageFiles([(message.file as { id?: unknown }).id]);
    const pinned = readPinnedIds(chat.pinnedMessageIds, PINNED_MAX);
    const chatFields: Record<string, unknown> = {};
    if (newest) chatFields.lastMessage = "";
    if (pinned.includes(id)) chatFields.pinnedMessageIds = pinned.filter((entry) => entry !== id);
    // Fields named in the mask without a value are removed: the text is gone, not only hidden.
    await commitServerPatches([
        { path: messagePath(chatId, id), data: { deleted: true, text: "" }, updateFields: ["deleted", "text", "voicePath", "voiceDuration", "replyTo", "gif", "file", "reactions"], updateTime: message._updateTime },
        ...(Object.keys(chatFields).length ? [{ path: chatPath(chatId), data: chatFields, updateFields: Object.keys(chatFields), exists: true }] : []),
    ]);
    // Replies stop quoting it and stars on it go.
    after(() => clearMessageTraces({ scope: "dm", place: chatId, parentPath: chatPath(chatId) }, [id]));
    return { success: true };
}

/** A message of the conversation either participant may act on (reactions, pins). */
async function anyMessage(user: SocialUser, partner: string, value: unknown) {
    const { chatId, chat } = await loadChat(user.email, partner);
    if (!chat) throw new SocialApiError(404, "message_not_found", "Mesaj bulunamadı.");
    const id = readMessageId(value);
    const message = await getServerDocument<StoredMessage>(messagePath(chatId, id));
    if (!message || message.deleted === true) throw new SocialApiError(404, "message_not_found", "Mesaj bulunamadı.");
    return { chatId, chat, id, message };
}

/** Adds or takes back the caller's reaction (one of the group reactions). */
async function react(user: SocialUser, partner: string, body: Record<string, unknown>) {
    await assertRateLimit(`social:dm-react:${user.email}`, 90);
    if (!isReactionKey(body.reaction)) throw new SocialApiError(400, "invalid_request", "Geçersiz tepki.");
    const reaction = body.reaction;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { chatId, id, message } = await anyMessage(user, partner, body.messageId);
        const people = readDmReactions(message.reactions)[reaction] ?? [];
        const next = people.includes(user.email) ? people.filter((person) => person !== user.email) : [...people, user.email];
        try {
            await commitServerPatches([{ path: messagePath(chatId, id), data: next.length ? { reactions: { [reaction]: next } } : {}, updateFields: [`reactions.${reaction}`], updateTime: message._updateTime }]);
            return { success: true, reaction, reacted: next.includes(user.email), count: next.length };
        } catch (error) {
            if (attempt === 2 || ![400, 409, 412].includes(Number((error as { status?: unknown }).status))) throw error;
        }
    }
    throw new SocialApiError(409, "conflict", "Tekrar deneyin.");
}

/** Pins live on the chat document (newest first, at most 25); either participant may pin. */
async function setPinned(user: SocialUser, partner: string, body: Record<string, unknown>, pinned: boolean) {
    await assertRateLimit(`social:dm-write:${user.email}`, 60);
    const { chatId, chat, id } = await anyMessage(user, partner, body.messageId);
    const current = readPinnedIds(chat.pinnedMessageIds, PINNED_MAX);
    if (current.includes(id) === pinned) return { success: true, pinnedMessageIds: current };
    if (pinned && current.length >= PINNED_MAX) throw new SocialApiError(409, "conflict", "En fazla 25 mesaj sabitlenebilir.");
    const next = pinned ? [id, ...current] : current.filter((entry) => entry !== id);
    await patchServerDocument(chatPath(chatId), { pinnedMessageIds: next }, { updateFields: ["pinnedMessageIds"], exists: true });
    return { success: true, pinnedMessageIds: next };
}

/**
 * Marks the partner's messages read and clears the conversation's bell item.
 * With read receipts turned off (Account Settings › Messaging) nothing is
 * marked, so the partner doesn't see "Seen".
 */
async function markRead(user: SocialUser, partner: string) {
    await assertRateLimit(`social:dm-read-receipt:${user.email}`, 120);
    const { chatId, chat } = await loadChat(user.email, partner);
    if (!chat) return { success: true, changed: 0 };
    await clearDirectMessageNotification(user.email, chatId);
    if (user.record.readReceipts === false) return { success: true, changed: 0 };
    const unread = await runServerQuery<{ fromEmail?: unknown }>({
        collectionId: "messages",
        parentPath: chatPath(chatId),
        where: [{ field: "read", op: "EQUAL", value: false }],
        select: ["fromEmail"],
        limit: READ_BATCH,
    });
    const ids = unread.filter((record) => record.fromEmail === partner).map((record) => record._id).filter((id) => isDocId(id));
    if (!ids.length) return { success: true, changed: 0 };
    // `exists` keeps a message deleted meanwhile from coming back as an empty document.
    await commitServerPatches(ids.map((id) => ({ path: messagePath(chatId, id), data: { read: true }, updateFields: ["read"], exists: true }))).catch(() => undefined);
    return { success: true, changed: ids.length };
}

async function typing(user: SocialUser, partner: string, active: boolean) {
    await assertRateLimit(`social:dm-typing:${user.email}`, 40);
    const { chatId, chat } = await loadChat(user.email, partner);
    if (!chat) return { success: true };
    const mine = chat.typingUser === user.email;
    if (active) {
        // "Typing indicator" off in the messaging settings: the partner never sees it.
        if (!user.friends.includes(partner) || user.record.typingIndicator === false) return { success: true };
        if (mine && Date.now() - timeOf(chat.updatedAt) < 2_500) return { success: true };
        await patchServerDocument(chatPath(chatId), { typingUser: user.email, updatedAt: new Date() }, { updateFields: ["typingUser", "updatedAt"], exists: true });
    } else if (mine) {
        await patchServerDocument(chatPath(chatId), { typingUser: null }, { updateFields: ["typingUser"], exists: true });
    }
    return { success: true };
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireSocialUser();
        await assertRateLimit(`social:dm-read:${user.email}`, 240);
        return socialJson(await conversation(user, request));
    } catch (error) {
        return socialErrorResponse(error, "social/dm");
    }
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireSocialUser();
        const body = await readBody(request, 24_576);
        const partner = readPartner(body.with, user.email);
        switch (body.action) {
            case "send": return socialJson(await sendDirect(user, partner, body), 201);
            case "edit": return socialJson(await edit(user, partner, body));
            case "delete": return socialJson(await remove(user, partner, body));
            case "read": return socialJson(await markRead(user, partner));
            case "typing": return socialJson(await typing(user, partner, body.active === true));
            case "react": return socialJson(await react(user, partner, body));
            case "pin": return socialJson(await setPinned(user, partner, body, true));
            case "unpin": return socialJson(await setPinned(user, partner, body, false));
            default: throw new SocialApiError(400, "invalid_request", "Geçersiz işlem.");
        }
    } catch (error) {
        return socialErrorResponse(error, "social/dm");
    }
}
