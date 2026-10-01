import { NextRequest } from "next/server";
import { deleteServerDocument, deleteServerStorageObject, getServerDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { GROUP_LIMITS, SYSTEM_SENDER, isGroupId, isManagerRole, isMemberKey, isReactionKey, safeGroupVoicePath } from "@/lib/groups";
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
    requireManager,
    retryOnConflict,
    staleTypingFields,
    strings,
} from "../_shared";

type StoredMessage = { fromEmail?: string; type?: string; voicePath?: unknown; reactions?: Record<string, unknown> };

const messagePath = (groupId: string, messageId: string) => `groups/${groupId}/messages/${messageId}`;

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

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireGroupUser();
        const body = await readJsonBody(request, 4096);
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
        await assertRateLimit(`groups:${user.email}`, 40, 60_000);
        if (action === "pin" || action === "unpin") return groupJson(await setPinned(groupId, readId(body.messageId, "Mesaj kimliği"), user.email, action === "pin"));
        if (action === "delete-message") return groupJson(await deleteMessage(groupId, readId(body.messageId, "Mesaj kimliği"), user.email));
        throw new GroupApiError(400, "invalid_request", "Geçersiz işlem.");
    } catch (error) {
        return groupErrorResponse(error);
    }
}
