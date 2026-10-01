import { NextRequest } from "next/server";
import { commitServerMutations, deleteServerDocument, getServerDocument } from "@/lib/server/firebase-rest";
import { getClientKey } from "@/lib/server/request-security";
import { GROUP_LIMITS, groupColor, groupEmoji, isGroupId, isGroupTemplateId, type GroupJoinPreview } from "@/lib/groups";
import {
    GroupApiError,
    assertRateLimit,
    assertSameOrigin,
    groupErrorResponse,
    groupJson,
    groupMembers,
    inviteDocumentId,
    isBanned,
    isLinkActive,
    loadGroup,
    loadProfiles,
    ownDisplayName,
    postSystemMessage,
    profileAvatar,
    profileName,
    readJsonBody,
    readToken,
    requireGroupUser,
    retryOnConflict,
    roleOf,
    type InviteLinkRecord,
} from "../_shared";

/**
 * Loads an invite link and its group. Members always get through (opening an
 * old link simply leads back to the group); for everyone else the link must
 * not be expired or used up, and its creator must still be an owner/admin.
 */
async function resolveLink(token: string, email: string) {
    const link = await getServerDocument<InviteLinkRecord>(`group_invite_links/${token}`);
    if (!link || !isGroupId(link.groupId)) throw new GroupApiError(404, "link_not_found", "Davet bağlantısı bulunamadı veya iptal edildi.");
    const group = await loadGroup(link.groupId);
    if (!group) throw new GroupApiError(404, "link_not_found", "Bu davet bağlantısı artık geçerli değil.");
    const member = groupMembers(group).includes(email);
    if (!member) {
        if (!isLinkActive(link)) {
            const exhausted = Number(link.maxUses || 0) > 0 && Number(link.uses || 0) >= Number(link.maxUses);
            throw exhausted
                ? new GroupApiError(410, "link_exhausted", "Bu davet bağlantısının kullanım hakkı doldu.")
                : new GroupApiError(410, "link_expired", "Bu davet bağlantısının süresi doldu.");
        }
        const creatorRole = roleOf(group, link.createdBy || "");
        if (creatorRole !== "owner" && creatorRole !== "admin") throw new GroupApiError(404, "link_not_found", "Bu davet bağlantısı artık geçerli değil.");
    }
    return { link, group, groupId: link.groupId, member };
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireGroupUser();
        await assertRateLimit(`groups:join-preview:${user.email}`, 30, 60_000);
        await assertRateLimit(`groups:join-preview-ip:${getClientKey(request)}`, 90, 60_000);
        const token = readToken(request.nextUrl.searchParams.get("token"));
        const { link, group, groupId, member } = await resolveLink(token, user.email);
        const members = groupMembers(group);
        const inviterEmail = link.createdBy || "";
        const inviter = (await loadProfiles([inviterEmail])).get(inviterEmail) ?? null;
        const preview: GroupJoinPreview = {
            groupId,
            name: group.name || "Hanogt",
            description: group.description || "",
            emoji: groupEmoji(group.emoji),
            color: groupColor(group.color),
            template: isGroupTemplateId(group.template) ? group.template : null,
            memberCount: members.length,
            membersMax: GROUP_LIMITS.membersMax,
            inviter: { username: profileName(inviterEmail, inviter), avatarUrl: profileAvatar(inviter) },
            expiresAt: link.expiresAt || null,
            alreadyMember: member,
            full: members.length >= GROUP_LIMITS.membersMax,
            banned: await isBanned(groupId, user.email),
        };
        return groupJson({ preview });
    } catch (error) {
        return groupErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireGroupUser();
        const { email } = user;
        await assertRateLimit(`groups:join:${email}`, 10, 10 * 60_000);
        await assertRateLimit(`groups:join-ip:${getClientKey(request)}`, 40, 10 * 60_000);
        const body = await readJsonBody(request, 2048);
        const token = readToken(body.token);
        const outcome = await retryOnConflict(async () => {
            const { link, group, groupId, member } = await resolveLink(token, email);
            if (member) return { groupId, group, joined: false };
            const members = groupMembers(group);
            if (await isBanned(groupId, email)) throw new GroupApiError(403, "banned", "Bu gruba katılmanız engellenmiş.");
            if (members.length >= GROUP_LIMITS.membersMax) throw new GroupApiError(409, "group_full", "Grup 25 üye sınırına ulaştı.");
            const now = new Date();
            // Membership and the use counter change atomically, so a link can never be used more often than allowed.
            await commitServerMutations([
                { type: "update", path: `groups/${groupId}`, data: { members: [...members, email], updatedAt: now }, updateFields: ["members", "updatedAt"], updateTime: group._updateTime },
                { type: "update", path: `group_invite_links/${token}`, data: { uses: Number(link.uses || 0) + 1, lastUsedAt: now }, updateFields: ["uses", "lastUsedAt"], updateTime: link._updateTime },
            ]);
            return { groupId, group, joined: true };
        });
        if (outcome.joined) {
            // A friend invitation to the same group is obsolete now.
            await deleteServerDocument(`group_invites/${inviteDocumentId(outcome.groupId, email)}`).catch(() => undefined);
            await postSystemMessage(outcome.groupId, outcome.group, "member_joined", { name: await ownDisplayName(user) });
        }
        return groupJson({ success: true, groupId: outcome.groupId, alreadyMember: !outcome.joined });
    } catch (error) {
        return groupErrorResponse(error);
    }
}
