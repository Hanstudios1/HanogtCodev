import { after, type NextRequest } from "next/server";
import { deleteServerDocument, getServerDocument, patchServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { clearMessageTraces } from "@/lib/server/message-traces";
import { deleteVoiceRecording } from "@/lib/server/social-voice";
import { GROUP_LIMITS, SYSTEM_SENDER, botOfSender, canModerate, isGroupId, isManagerRole, isMemberKey, isReactionKey, outranks, safeGroupVoicePath } from "@/lib/groups";
import { editGroupMessage, sendGroupMessage } from "../_messages";
import {
    GroupApiError,
    assertRateLimit,
    assertSameOrigin,
    groupErrorResponse,
    groupJson,
    memberKey,
    readId,
    readJsonBody,
    requireGroupMember,
    requireGroupUser,
    retryOnConflict,
    roleOf,
    staleTypingFields,
    strings,
} from "../_shared";

export const runtime = "nodejs";
// Hanogt AI's answer to /ai is written after the response, within this time.
export const maxDuration = 60;

type StoredMessage = { fromEmail?: string; type?: string; text?: unknown; voicePath?: unknown; reactions?: Record<string, unknown> };

const messagePath = (groupId: string, messageId: string) => `groups/${groupId}/messages/${messageId}`;

/** Message fields a member may read; everything else on the document stays on the server. */
const WIRE_FIELDS = ["fromEmail", "author", "authorAvatar", "type", "text", "voicePath", "voiceDuration", "createdAt", "event", "vars", "template", "reactions", "replyTo", "edited", "gif", "bot", "botEvent", "botState", "forwarded"] as const;
const PAGE_DEFAULT = 120;
const PAGE_MAX = 200;
/** Typing entries older than this are not reported (the live view uses 7 s as well). */
const TYPING_FRESH_MS = 7_000;

/** Pins live on the group document (`pinnedMessageIds`, newest first); moderators and up. */
async function setPinned(groupId: string, messageId: string, email: string, pinned: boolean) {
    await retryOnConflict(async () => {
        const { group, role } = await requireGroupMember(groupId, email);
        if (!canModerate(role)) throw new GroupApiError(403, "forbidden", "Mesajları moderatörler sabitler.");
        const current = strings(group.pinnedMessageIds).filter(isGroupId);
        if (current.includes(messageId) === pinned) return;
        if (pinned) {
            if (current.length >= GROUP_LIMITS.pinnedMax) throw new GroupApiError(409, "pin_limit", "En fazla 25 mesaj sabitlenebilir; önce bir mesajın sabitlemesini kaldırın.");
            const message = await getServerDocument<StoredMessage>(messagePath(groupId, messageId));
            if (!message) throw new GroupApiError(404, "message_not_found", "Mesaj bulunamadı.");
        }
        const next = pinned ? [messageId, ...current] : current.filter((id) => id !== messageId);
        await patchServerDocument(`groups/${groupId}`, { pinnedMessageIds: next }, { updateFields: ["pinnedMessageIds"], updateTime: group._updateTime });
    });
    return { success: true };
}

/**
 * Toggles the caller's reaction. Messages are read-only for clients, so the
 * server stores pseudonymous member keys (never e-mails) per reaction.
 */
async function toggleReaction(groupId: string, messageId: string, reaction: string, email: string) {
    await requireGroupMember(groupId, email);
    const key = memberKey(groupId, email);
    const path = messagePath(groupId, messageId);
    const reactions = await retryOnConflict(async () => {
        const message = await getServerDocument<StoredMessage>(path);
        if (!message) throw new GroupApiError(404, "message_not_found", "Mesaj bulunamadı.");
        const current = strings(message.reactions?.[reaction]).filter(isMemberKey);
        const next = current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key].slice(-GROUP_LIMITS.membersMax * 2);
        await patchServerDocument(path, next.length ? { reactions: { [reaction]: next } } : {}, { updateFields: [`reactions.${reaction}`], updateTime: message._updateTime });
        return next;
    });
    return { success: true, reaction, count: reactions.length, reacted: reactions.includes(key) };
}

/**
 * Authors delete their own messages; moderators delete the messages of
 * people below them and the bots'; owners and admins any (system notices too).
 */
async function deleteMessage(groupId: string, messageId: string, email: string) {
    const { group, role } = await requireGroupMember(groupId, email);
    const path = messagePath(groupId, messageId);
    const message = await getServerDocument<StoredMessage>(path);
    if (!message) return { success: true };
    const own = message.fromEmail === email && message.fromEmail !== SYSTEM_SENDER;
    const authorRole = typeof message.fromEmail === "string" ? roleOf(group, message.fromEmail) : null;
    const moderated = role === "moderator" && (botOfSender(message.fromEmail) !== null || (message.fromEmail !== SYSTEM_SENDER && (!authorRole || outranks(role, authorRole))));
    if (!own && !isManagerRole(role) && !moderated) throw new GroupApiError(403, "forbidden", "Bu mesajı silme yetkiniz yok.");
    // Voice paths are written by clients: only recordings inside this group's folder are removed.
    const voicePath = safeGroupVoicePath(message.voicePath, groupId);
    if (voicePath) await deleteVoiceRecording(voicePath);
    await deleteServerDocument(path);
    // Replies stop quoting it and stars on it go.
    after(() => clearMessageTraces({ scope: "group", place: groupId, parentPath: `groups/${groupId}` }, [messageId]));
    await retryOnConflict(async () => {
        const { group } = await requireGroupMember(groupId, email);
        const pinned = strings(group.pinnedMessageIds);
        if (!pinned.includes(messageId)) return;
        await patchServerDocument(`groups/${groupId}`, { pinnedMessageIds: pinned.filter((id) => id !== messageId) }, { updateFields: ["pinnedMessageIds"], updateTime: group._updateTime });
    }).catch(() => undefined);
    return { success: true };
}

/**
 * Typing state is a map of member key → server time on the group document
 * (clients may not write it). Entries older than 30 s are pruned on the way.
 */
async function setTyping(groupId: string, email: string, active: boolean) {
    const { group } = await requireGroupMember(groupId, email);
    const key = memberKey(groupId, email);
    const now = Date.now();
    const current = group.typing && typeof group.typing === "object" ? group.typing[key] : undefined;
    const stale = staleTypingFields(group, now, [key]);
    if (active && typeof current === "number" && now - current < 2500 && !stale.length) return { success: true };
    if (!active && current === undefined && !stale.length) return { success: true };
    await patchServerDocument(`groups/${groupId}`, active ? { typing: { [key]: now } } : {}, { updateFields: [`typing.${key}`, ...stale], exists: true });
    return { success: true };
}

function wireMessage(record: Record<string, unknown> & { _id: string }) {
    const data: Record<string, unknown> = { id: record._id };
    for (const field of WIRE_FIELDS) if (record[field] !== undefined) data[field] = record[field];
    return data;
}

/** Milliseconds from a query parameter; anything else (or a time far in the future) is ignored. */
function readCursor(value: string | null) {
    if (!value || !/^[0-9]{1,15}$/.test(value)) return 0;
    const time = Number(value);
    return time > 0 && time < Date.now() + 86_400_000 ? time : 0;
}

/**
 * Members-only message list: the newest page (`before` for older pages) or
 * everything from `since` on, with the typing state and pins. Hanogt Social
 * polls this while the browser cannot use Firestore directly.
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireGroupUser();
        await assertRateLimit(`groups:chat-read:${user.email}`, 240, 60_000);
        const params = request.nextUrl.searchParams;
        const groupId = readId(params.get("groupId"), "Grup kimliği");
        const { group } = await requireGroupMember(groupId, user.email);
        const since = readCursor(params.get("since"));
        const before = since ? 0 : readCursor(params.get("before"));
        const limit = Math.min(Math.max(Math.floor(Number(params.get("limit"))) || PAGE_DEFAULT, 1), PAGE_MAX);
        const records = await runServerQuery<Record<string, unknown>>({
            collectionId: "messages",
            parentPath: `groups/${groupId}`,
            where: since
                ? [{ field: "createdAt", op: "GREATER_THAN_OR_EQUAL", value: new Date(since) }]
                : before ? [{ field: "createdAt", op: "LESS_THAN", value: new Date(before) }] : [],
            orderBy: [{ field: "createdAt", direction: since ? "ASCENDING" : "DESCENDING" }],
            limit,
        });
        const now = Date.now();
        const typingMap = group.typing && typeof group.typing === "object" ? group.typing : {};
        const typing = Object.fromEntries(Object.entries(typingMap).filter((entry): entry is [string, number] => isMemberKey(entry[0]) && typeof entry[1] === "number" && now - entry[1] < TYPING_FRESH_MS));
        return groupJson({
            messages: records.map(wireMessage),
            hasMore: !since && records.length >= limit,
            typing,
            pinnedMessageIds: strings(group.pinnedMessageIds).filter(isGroupId).slice(0, GROUP_LIMITS.pinnedMax),
            now,
        });
    } catch (error) {
        return groupErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireGroupUser();
        const body = await readJsonBody(request, 24_576);
        const action = typeof body.action === "string" ? body.action : "";
        const groupId = readId(body.groupId, "Grup kimliği");
        if (action === "typing") {
            await assertRateLimit(`groups:typing:${user.email}`, 40, 60_000);
            return groupJson(await setTyping(groupId, user.email, body.active === true));
        }
        if (action === "react") {
            await assertRateLimit(`groups:react:${user.email}`, 90, 60_000);
            if (!isReactionKey(body.reaction)) throw new GroupApiError(400, "invalid_reaction", "Geçersiz tepki.");
            return groupJson(await toggleReaction(groupId, readId(body.messageId, "Mesaj kimliği"), body.reaction, user.email));
        }
        if (action === "send") {
            await assertRateLimit(`groups:send:${user.email}`, 40, 60_000);
            return groupJson(await sendGroupMessage(user, groupId, body), 201);
        }
        if (action === "edit") {
            await assertRateLimit(`groups:edit:${user.email}`, 40, 60_000);
            return groupJson(await editGroupMessage(user, groupId, readId(body.messageId, "Mesaj kimliği"), body.text));
        }
        await assertRateLimit(`groups:${user.email}`, 40, 60_000);
        if (action === "pin" || action === "unpin") return groupJson(await setPinned(groupId, readId(body.messageId, "Mesaj kimliği"), user.email, action === "pin"));
        if (action === "delete-message") return groupJson(await deleteMessage(groupId, readId(body.messageId, "Mesaj kimliği"), user.email));
        throw new GroupApiError(400, "invalid_request", "Geçersiz işlem.");
    } catch (error) {
        return groupErrorResponse(error);
    }
}
