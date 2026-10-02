import { NextRequest } from "next/server";
import { createServerDocument, deleteServerDocument, deleteServerStorageObject, getServerDocument, patchServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { GROUP_LIMITS, SYSTEM_SENDER, cleanMultiLine, isGroupId, isManagerRole, isMemberKey, isReactionKey, safeGroupVoicePath } from "@/lib/groups";
import {
    GroupApiError,
    assertRateLimit,
    assertSameOrigin,
    groupErrorResponse,
    groupJson,
    loadProfiles,
    memberKey,
    ownDisplayName,
    profileAvatar,
    readId,
    readJsonBody,
    requireGroupMember,
    requireGroupUser,
    requireManager,
    retryOnConflict,
    staleTypingFields,
    strings,
} from "../_shared";

type StoredMessage = { fromEmail?: string; type?: string; voicePath?: unknown; reactions?: Record<string, unknown> };

const messagePath = (groupId: string, messageId: string) => `groups/${groupId}/messages/${messageId}`;

/** Message fields a member may read; everything else on the document stays on the server. */
const WIRE_FIELDS = ["fromEmail", "author", "authorAvatar", "type", "text", "voicePath", "voiceDuration", "createdAt", "event", "vars", "template", "reactions"] as const;
const PAGE_DEFAULT = 120;
const PAGE_MAX = 200;
/** Typing entries older than this are not reported (the live view uses 7 s as well). */
const TYPING_FRESH_MS = 7_000;

/** Pins live on the group document (`pinnedMessageIds`, newest first); owners and admins only. */
async function setPinned(groupId: string, messageId: string, email: string, pinned: boolean) {
    await retryOnConflict(async () => {
        const { group, role } = await requireGroupMember(groupId, email);
        requireManager(role);
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

/** Authors can delete their own messages; owners and admins can delete any (including system notices). */
async function deleteMessage(groupId: string, messageId: string, email: string) {
    const { role } = await requireGroupMember(groupId, email);
    const path = messagePath(groupId, messageId);
    const message = await getServerDocument<StoredMessage>(path);
    if (!message) return { success: true };
    const own = message.fromEmail === email && message.fromEmail !== SYSTEM_SENDER;
    if (!own && !isManagerRole(role)) throw new GroupApiError(403, "forbidden", "Bu mesajı silme yetkiniz yok.");
    // Voice paths are written by clients: only objects inside this group's folder are removed.
    const voicePath = safeGroupVoicePath(message.voicePath, groupId);
    if (voicePath) await deleteServerStorageObject(voicePath).catch(() => undefined);
    await deleteServerDocument(path);
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

/**
 * Text messages written through the server, for browsers whose Firebase
 * connection is unavailable (Hanogt Social falls back to polling). The
 * document has exactly the fields a direct client write may have.
 */
async function sendMessage(groupId: string, text: unknown, user: Awaited<ReturnType<typeof requireGroupUser>>) {
    const body = cleanMultiLine(text, GROUP_LIMITS.messageMax * 2);
    if (!body) throw new GroupApiError(400, "invalid_request", "Mesaj boş olamaz.");
    if (body.length > GROUP_LIMITS.messageMax) throw new GroupApiError(413, "payload_too_large", "Mesaj en fazla 4000 karakter olabilir.");
    await requireGroupMember(groupId, user.email);
    const [author, profiles] = await Promise.all([ownDisplayName(user), loadProfiles([user.email])]);
    const createdAt = new Date();
    const data = {
        fromEmail: user.email,
        author: author.slice(0, 80),
        authorAvatar: profileAvatar(profiles.get(user.email)),
        type: "text",
        text: body,
        createdAt,
    };
    const created = await createServerDocument(`groups/${groupId}/messages`, data);
    const id = created.name.split("/").pop() || "";
    return { success: true, message: { ...data, id, createdAt: createdAt.toISOString() } };
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
            return groupJson(await sendMessage(groupId, body.text, user), 201);
        }
        await assertRateLimit(`groups:${user.email}`, 40, 60_000);
        if (action === "pin" || action === "unpin") return groupJson(await setPinned(groupId, readId(body.messageId, "Mesaj kimliği"), user.email, action === "pin"));
        if (action === "delete-message") return groupJson(await deleteMessage(groupId, readId(body.messageId, "Mesaj kimliği"), user.email));
        throw new GroupApiError(400, "invalid_request", "Geçersiz işlem.");
    } catch (error) {
        return groupErrorResponse(error);
    }
}
