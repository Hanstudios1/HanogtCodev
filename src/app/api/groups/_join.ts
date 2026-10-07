import "server-only";

import { commitServerMutations, commitServerPatches, deleteServerDocument, getServerDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { groupLimitsFor } from "@/lib/server/group-limits";
import { groupColor, groupEmoji, isGroupId, isGroupTemplateId, readGroupRules, type GroupJoinPreview } from "@/lib/groups";
import { postWelcomeMessage } from "./_messages";
import {
    GroupApiError,
    groupMembers,
    inviteDocumentId,
    isBanned,
    isInvitePending,
    isLinkActive,
    joinRulesAcceptance,
    loadGroup,
    loadProfiles,
    ownDisplayName,
    postSystemMessage,
    profileAvatar,
    profileName,
    retryOnConflict,
    roleOf,
    type GroupUser,
    type InviteLinkRecord,
    type InviteRecord,
} from "./_shared";

/*
 * Joining a group: with an invite link (/api/groups/join) or by accepting a
 * friend's invitation (POST /api/groups { action: "accept-invite" }). Both
 * may accept the group's rules on the way ({ acceptRules: true, rulesVersion }),
 * written together with the membership.
 */

/** "I've read and accept the rules" sent with a join, and the rules version the person was shown. */
export type JoinOptions = { acceptRules?: unknown; rulesVersion?: unknown };

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

/** What the invitation page shows before joining, the group's rules included. */
export async function joinLinkPreview(user: GroupUser, token: string): Promise<GroupJoinPreview> {
    const { link, group, groupId, member } = await resolveLink(token, user.email);
    const members = groupMembers(group);
    const inviterEmail = link.createdBy || "";
    const [inviter, { limits }] = await Promise.all([
        loadProfiles([inviterEmail]).then((profiles) => profiles.get(inviterEmail) ?? null),
        groupLimitsFor(group.ownerEmail),
    ]);
    const rules = readGroupRules(group);
    return {
        groupId,
        name: group.name || "Hanogt",
        description: group.description || "",
        emoji: groupEmoji(group.emoji),
        color: groupColor(group.color),
        template: isGroupTemplateId(group.template) ? group.template : null,
        memberCount: members.length,
        // The group's size is its owner's plan's (Free 25, Plus 100, Pro 250 members).
        membersMax: limits.members,
        inviter: { username: profileName(inviterEmail, inviter), avatarUrl: profileAvatar(inviter) },
        expiresAt: link.expiresAt || null,
        alreadyMember: member,
        full: members.length >= limits.members,
        banned: await isBanned(groupId, user.email),
        rules: rules.list.map(({ title, description }) => ({ title, description })),
        rulesScreening: rules.screening && rules.list.length > 0,
        rulesVersion: rules.version,
    };
}

/** The notice and the group's welcome message after someone joined (best effort). */
async function announceJoin(user: GroupUser, groupId: string, group: Awaited<ReturnType<typeof loadGroup>>) {
    if (!group) return;
    const name = await ownDisplayName(user);
    await postSystemMessage(groupId, group, "member_joined", { name });
    await postWelcomeMessage(groupId, group, name);
}

/** Joins with an invite link; the membership and the link's use counter change atomically. */
export async function joinWithLink(user: GroupUser, token: string, options: JoinOptions = {}) {
    const { email } = user;
    const outcome = await retryOnConflict(async () => {
        const { link, group, groupId, member } = await resolveLink(token, email);
        if (member) return { groupId, group, joined: false };
        const members = groupMembers(group);
        if (await isBanned(groupId, email)) throw new GroupApiError(403, "banned", "Bu gruba katılmanız engellenmiş.");
        const { limits } = await groupLimitsFor(group.ownerEmail);
        if (members.length >= limits.members) throw new GroupApiError(409, "group_full", `Grup ${limits.members} üye sınırına ulaştı.`, { limit: limits.members });
        const now = new Date();
        const accepted = joinRulesAcceptance(groupId, group, email, options);
        // Membership and the use counter change atomically, so a link can never be used more often than allowed.
        await commitServerMutations([
            {
                type: "update",
                path: `groups/${groupId}`,
                data: { members: [...members, email], updatedAt: now, ...accepted?.data },
                updateFields: ["members", "updatedAt", ...(accepted ? [accepted.field] : [])],
                updateTime: group._updateTime,
            },
            { type: "update", path: `group_invite_links/${token}`, data: { uses: Number(link.uses || 0) + 1, lastUsedAt: now }, updateFields: ["uses", "lastUsedAt"], updateTime: link._updateTime },
        ]);
        return { groupId, group, joined: true };
    });
    if (outcome.joined) {
        // A friend invitation to the same group is obsolete now.
        await deleteServerDocument(`group_invites/${inviteDocumentId(outcome.groupId, email)}`).catch(() => undefined);
        await announceJoin(user, outcome.groupId, outcome.group);
    }
    return { success: true as const, groupId: outcome.groupId, alreadyMember: !outcome.joined };
}

/** Accepts a friend's invitation to a group. */
export async function acceptFriendInvite(user: GroupUser, groupId: string, options: JoinOptions = {}) {
    const { email } = user;
    const inviteId = inviteDocumentId(groupId, email);
    const outcome = await retryOnConflict(async () => {
        const [invite, group] = await Promise.all([getServerDocument<InviteRecord>(`group_invites/${inviteId}`), loadGroup(groupId)]);
        if (!invite || invite.toEmail !== email || invite.groupId !== groupId || !isInvitePending(invite)) {
            throw new GroupApiError(404, "invite_not_found", "Geçerli grup daveti bulunamadı.");
        }
        const members = group ? groupMembers(group) : [];
        // A group that is gone, or an inviter who is no longer a member, voids the invitation.
        if (!group || !members.includes(invite.fromEmail || "")) {
            await deleteServerDocument(`group_invites/${inviteId}`).catch(() => undefined);
            throw new GroupApiError(404, "invite_not_found", "Bu davet artık geçerli değil.");
        }
        if (await isBanned(groupId, email)) throw new GroupApiError(403, "banned", "Bu gruba katılmanız engellenmiş.");
        if (members.includes(email)) {
            await patchServerDocument(`group_invites/${inviteId}`, { status: "accepted", resolvedAt: new Date() }, { updateFields: ["status", "resolvedAt"], exists: true }).catch(() => undefined);
            return { group, joined: false };
        }
        // The group's size is its owner's plan's (Free 25, Plus 100, Pro 250 members).
        const { limits } = await groupLimitsFor(group.ownerEmail);
        if (members.length >= limits.members) throw new GroupApiError(409, "group_full", `Grup ${limits.members} üye sınırına ulaştı.`, { limit: limits.members });
        const now = new Date();
        const accepted = joinRulesAcceptance(groupId, group, email, options);
        await commitServerPatches([
            {
                path: `groups/${groupId}`,
                data: { members: [...members, email], updatedAt: now, ...accepted?.data },
                updateFields: ["members", "updatedAt", ...(accepted ? [accepted.field] : [])],
                updateTime: group._updateTime,
            },
            { path: `group_invites/${inviteId}`, data: { status: "accepted", resolvedAt: now }, updateFields: ["status", "resolvedAt"], updateTime: invite._updateTime },
        ]);
        return { group, joined: true };
    });
    if (outcome.joined) await announceJoin(user, groupId, outcome.group);
    return { success: true as const, groupId };
}
