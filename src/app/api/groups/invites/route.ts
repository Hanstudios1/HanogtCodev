import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { commitServerMutations, deleteServerDocument, getServerDocument, queryServerCollection } from "@/lib/server/firebase-rest";
import { groupLimitsFor } from "@/lib/server/group-limits";
import {
    GROUP_LIMITS,
    INVITE_LINK_EXPIRY_MS,
    isInviteLinkExpiry,
    isInviteLinkMaxUses,
    isManagerRole,
    normalizeGroupEmail,
    type GroupFriendCandidate,
    type GroupInviteLinkInfo,
    type GroupInvitesResponse,
    type GroupPendingInvite,
} from "@/lib/groups";
import {
    GroupApiError,
    assertRateLimit,
    assertSameOrigin,
    groupErrorResponse,
    groupJson,
    groupMembers,
    isInvitePending,
    isLinkActive,
    loadProfiles,
    profileAvatar,
    profileName,
    profileOnline,
    readId,
    readJsonBody,
    readToken,
    requireGroupMember,
    requireGroupUser,
    requireManager,
    strings,
    type BanRecord,
    type InviteLinkRecord,
    type InviteRecord,
} from "../_shared";

type LinkDocument = InviteLinkRecord & { _id: string; _path: string };

function linkInfo(link: LinkDocument, email: string, names: Map<string, string>): GroupInviteLinkInfo {
    const createdBy = link.createdBy || "";
    return {
        token: link._id,
        createdByName: names.get(createdBy) || createdBy.split("@")[0] || "Hanogt",
        createdByMe: createdBy === email,
        createdAt: link.createdAt || null,
        expiresAt: link.expiresAt || null,
        maxUses: Number(link.maxUses || 0),
        uses: Number(link.uses || 0),
    };
}

/** Removes links that can no longer be used so the collection does not grow forever. */
async function pruneLinks(links: LinkDocument[], now: number) {
    const dead = links.filter((link) => !isLinkActive(link, now)).slice(0, 25);
    await Promise.allSettled(dead.map((link) => deleteServerDocument(link._path)));
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireGroupUser();
        const { email } = user;
        await assertRateLimit(`groups:read:${email}`, 90, 60_000);
        const groupId = readId(request.nextUrl.searchParams.get("groupId"), "Grup kimliği");
        const { group, role } = await requireGroupMember(groupId, email);
        const manager = isManagerRole(role);
        const members = new Set(groupMembers(group));
        const friendEmails = strings(user.user.friends).map((friend) => normalizeGroupEmail(friend)).filter((friend): friend is string => Boolean(friend)).slice(0, 200);
        const [inviteRecords, linkRecords, bans] = await Promise.all([
            queryServerCollection<InviteRecord>("group_invites", "groupId", "EQUAL", groupId, { limit: 300 }),
            manager ? queryServerCollection<InviteLinkRecord>("group_invite_links", "groupId", "EQUAL", groupId, { limit: 100 }) : Promise.resolve([]),
            queryServerCollection<BanRecord>("group_bans", "groupId", "EQUAL", groupId, { limit: 300 }),
        ]);
        const now = Date.now();
        const pending = inviteRecords.filter((invite) => isInvitePending(invite, now) && typeof invite.toEmail === "string" && !members.has(invite.toEmail));
        const invited = new Set(pending.map((invite) => invite.toEmail));
        const banned = new Set(bans.map((ban) => ban.email));
        const visiblePending = manager ? pending : pending.filter((invite) => invite.fromEmail === email);
        const activeLinks = linkRecords.filter((link) => isLinkActive(link, now));
        const profiles = await loadProfiles([
            ...friendEmails.slice(0, 100),
            ...visiblePending.flatMap((invite) => [invite.toEmail || "", invite.fromEmail || ""]),
            ...activeLinks.map((link) => link.createdBy || ""),
        ], 200);
        const names = new Map([...profiles.entries()].map(([profileEmail, profile]) => [profileEmail, profileName(profileEmail, profile)]));

        const friends: GroupFriendCandidate[] = friendEmails.map((friend) => {
            const profile = profiles.get(friend);
            return {
                email: friend,
                username: profileName(friend, profile),
                avatarUrl: profileAvatar(profile),
                online: profileOnline(profile, now),
                status: members.has(friend) ? "member" : banned.has(friend) ? "banned" : invited.has(friend) ? "invited" : "available",
            };
        });
        const order = { available: 0, invited: 1, member: 2, banned: 3 } as const;
        friends.sort((a, b) => order[a.status] - order[b.status] || Number(b.online) - Number(a.online) || a.username.localeCompare(b.username, "tr"));

        const pendingInfo: GroupPendingInvite[] = visiblePending.map((invite) => {
            const to = invite.toEmail || "";
            const from = invite.fromEmail || "";
            return {
                email: to,
                username: profileName(to, profiles.get(to)),
                avatarUrl: profileAvatar(profiles.get(to)),
                invitedByName: profileName(from, profiles.get(from)),
                invitedByMe: from === email,
                expiresAt: invite.expiresAt || null,
            };
        });

        if (manager) await pruneLinks(linkRecords, now);
        const response: GroupInvitesResponse = {
            canInviteFriends: manager || group.allowMemberInvites !== false,
            canManageLinks: manager,
            canCreatePermanentLinks: role === "owner",
            friends,
            pending: pendingInfo,
            links: activeLinks
                .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
                .map((link) => linkInfo(link, email, names)),
        };
        return groupJson(response);
    } catch (error) {
        return groupErrorResponse(error);
    }
}

async function createLink(groupId: string, email: string, body: Record<string, unknown>) {
    await assertRateLimit(`groups:links:${email}`, 20, 60 * 60_000);
    const { group, role } = await requireGroupMember(groupId, email);
    requireManager(role);
    if (!isInviteLinkExpiry(body.expiry)) throw new GroupApiError(400, "invalid_expiry", "Geçersiz geçerlilik süresi.");
    if (body.expiry === "never" && role !== "owner") throw new GroupApiError(403, "forbidden", "Süresiz bağlantıyı yalnızca grup sahibi oluşturabilir.");
    if (!isInviteLinkMaxUses(body.maxUses)) throw new GroupApiError(400, "invalid_max_uses", "Geçersiz kullanım sınırı.");
    const { limits } = await groupLimitsFor(group.ownerEmail);
    if (groupMembers(group).length >= limits.members) throw new GroupApiError(409, "group_full", `Grup ${limits.members} üye sınırına ulaştı.`, { limit: limits.members });
    const existing = await queryServerCollection<InviteLinkRecord>("group_invite_links", "groupId", "EQUAL", groupId, { limit: 100 });
    const now = Date.now();
    if (existing.filter((link) => isLinkActive(link, now)).length >= GROUP_LIMITS.activeLinksMax) {
        throw new GroupApiError(409, "link_limit", "En fazla 20 etkin davet bağlantısı olabilir; önce birini iptal edin.");
    }
    // 128 random bits; the token is the document id of a server-only collection.
    const token = randomBytes(16).toString("base64url");
    const lifetime = INVITE_LINK_EXPIRY_MS[body.expiry];
    const data: Record<string, unknown> = { groupId, createdBy: email, createdAt: new Date(now), maxUses: body.maxUses, uses: 0 };
    if (lifetime) data.expiresAt = new Date(now + lifetime);
    await commitServerMutations([{ type: "create", path: `group_invite_links/${token}`, data }]);
    const names = new Map<string, string>();
    return {
        success: true,
        link: linkInfo({ ...(data as InviteLinkRecord), createdAt: new Date(now).toISOString(), expiresAt: lifetime ? new Date(now + lifetime).toISOString() : null, _id: token, _path: `group_invite_links/${token}` }, email, names),
    };
}

async function revokeLink(groupId: string, email: string, body: Record<string, unknown>) {
    const { role } = await requireGroupMember(groupId, email);
    requireManager(role);
    const token = readToken(body.token);
    const link = await getServerDocument<InviteLinkRecord>(`group_invite_links/${token}`);
    if (!link || link.groupId !== groupId) throw new GroupApiError(404, "link_not_found", "Davet bağlantısı bulunamadı.");
    await deleteServerDocument(`group_invite_links/${token}`);
    return { success: true };
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireGroupUser();
        await assertRateLimit(`groups:${user.email}`, 40, 60_000);
        const body = await readJsonBody(request, 4096);
        const groupId = readId(body.groupId, "Grup kimliği");
        if (body.action === "create-link") return groupJson(await createLink(groupId, user.email, body), 201);
        if (body.action === "revoke-link") return groupJson(await revokeLink(groupId, user.email, body));
        throw new GroupApiError(400, "invalid_request", "Geçersiz işlem.");
    } catch (error) {
        return groupErrorResponse(error);
    }
}
