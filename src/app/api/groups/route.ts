import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
    commitServerPatches,
    deleteServerDocument,
    getServerDocument,
    listServerCollection,
    patchServerDocument,
    queryServerCollection,
    runServerQuery,
} from "@/lib/server/firebase-rest";
import { groupLimitFor } from "@/lib/server/plans";
import {
    GROUP_LIMITS,
    SYSTEM_SENDER,
    WELCOME_MESSAGE_ID,
    buildGroupSeed,
    cleanFileName,
    cleanMultiLine,
    cleanSingleLine,
    getGroupTemplate,
    groupColor,
    groupEmoji,
    isGroupColor,
    isGroupEmoji,
    isGroupId,
    isGroupTemplateId,
    isManagerRole,
    languageFromFileName,
    normalizeTopics,
    seedLanguageFor,
    toMillis,
    type GroupDetailResponse,
    type GroupListResponse,
} from "@/lib/groups";
import {
    GroupApiError,
    assertRateLimit,
    assertSameOrigin,
    banDocumentId,
    deleteGroupCascade,
    groupAdmins,
    groupErrorResponse,
    groupJson,
    groupLanguage,
    groupMembers,
    inviteDocumentId,
    isBanned,
    isInvitePending,
    isLinkActive,
    loadGroup,
    loadProfiles,
    mapLimit,
    memberKey,
    orderedMembers,
    ownDisplayName,
    postSystemMessage,
    profileAvatar,
    profileStaffRole,
    profileName,
    profileStatus,
    profileTag,
    publicGroup,
    readEmail,
    readId,
    readJsonBody,
    requireGroupMember,
    requireGroupUser,
    requireManager,
    requireOwner,
    retryOnConflict,
    roleOf,
    strings,
    type BanRecord,
    type GroupUser,
    type InviteLinkRecord,
    type InviteRecord,
    type StoredGroup,
} from "./_shared";

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const COMMIT_BYTES_BUDGET = 7 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

async function latestMessage(groupId: string) {
    try {
        const [latest] = await runServerQuery<{ createdAt?: string; fromEmail?: string }>({
            collectionId: "messages",
            parentPath: `groups/${groupId}`,
            orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
            select: ["createdAt", "fromEmail"],
            limit: 1,
        });
        return latest ? { createdAt: latest.createdAt || null, fromEmail: latest.fromEmail || "" } : null;
    } catch {
        return null;
    }
}

async function groupList(email: string): Promise<GroupListResponse> {
    const [groups, inviteRecords] = await Promise.all([
        queryServerCollection<StoredGroup>("groups", "members", "ARRAY_CONTAINS", email, { limit: 100 }),
        queryServerCollection<InviteRecord>("group_invites", "toEmail", "EQUAL", email, { limit: 100 }),
    ]);
    const visible = groups
        .filter((group) => isGroupId(group._id))
        .sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
    const memberOf = new Set(visible.map((group) => group._id));
    const now = Date.now();
    const pending = inviteRecords
        .filter((invite) => isInvitePending(invite, now) && isGroupId(invite.groupId) && !memberOf.has(invite.groupId))
        .slice(0, 30);
    const [lastMessages, inviteGroups] = await Promise.all([
        mapLimit(visible.slice(0, 60), 8, (group) => latestMessage(group._id)),
        mapLimit(pending, 6, (invite) => loadGroup(String(invite.groupId)).catch(() => null)),
    ]);
    const previewEmails = visible.flatMap((group) => orderedMembers(group).slice(0, 4));
    const profiles = await loadProfiles([...previewEmails, ...pending.map((invite) => invite.fromEmail || "")], 160);

    return {
        groups: visible.map((group, index) => {
            const latest = lastMessages[index] ?? null;
            return {
                id: group._id,
                name: group.name || "Hanogt",
                description: group.description || "",
                emoji: groupEmoji(group.emoji),
                color: groupColor(group.color),
                template: isGroupTemplateId(group.template) ? group.template : null,
                role: roleOf(group, email) || "member",
                memberCount: groupMembers(group).length,
                projectName: group.projectName || "",
                createdAt: group.createdAt || null,
                updatedAt: group.updatedAt || group.createdAt || null,
                lastMessageAt: latest?.createdAt || null,
                lastMessageFromMe: latest?.fromEmail === email,
                members: orderedMembers(group).slice(0, 4).map((memberEmail) => ({
                    username: profileName(memberEmail, profiles.get(memberEmail)),
                    avatarUrl: profileAvatar(profiles.get(memberEmail)),
                })),
            };
        }),
        invites: pending.flatMap((invite, index) => {
            const group = inviteGroups[index];
            if (!group || !invite.groupId) return [];
            const from = invite.fromEmail || "";
            return [{
                id: invite._id,
                groupId: invite.groupId,
                groupName: group.name || invite.groupName || "Hanogt",
                groupEmoji: groupEmoji(group.emoji),
                groupColor: groupColor(group.color),
                memberCount: groupMembers(group).length,
                fromEmail: from,
                fromName: profileName(from, profiles.get(from)),
                fromAvatar: profileAvatar(profiles.get(from)),
                expiresAt: invite.expiresAt || null,
            }];
        }),
    };
}

async function groupStats(groupId: string) {
    const [invites, links] = await Promise.all([
        queryServerCollection<InviteRecord>("group_invites", "groupId", "EQUAL", groupId, { limit: 300 }).catch(() => []),
        queryServerCollection<InviteLinkRecord>("group_invite_links", "groupId", "EQUAL", groupId, { limit: 100 }).catch(() => []),
    ]);
    const now = Date.now();
    return {
        pendingInvites: invites.filter((invite) => isInvitePending(invite, now)).length,
        activeLinks: links.filter((link) => isLinkActive(link, now)).length,
    };
}

async function bannedMembers(groupId: string) {
    const bans = await queryServerCollection<BanRecord>("group_bans", "groupId", "EQUAL", groupId, { limit: 200 }).catch(() => []);
    const emails = bans.map((ban) => ban.email).filter((email): email is string => typeof email === "string");
    const profiles = await loadProfiles(emails, 60);
    return emails.map((email) => ({ email, username: profileName(email, profiles.get(email)) }));
}

async function groupDetail(groupId: string, user: GroupUser): Promise<GroupDetailResponse> {
    const { email } = user;
    const { group, role } = await requireGroupMember(groupId, email);
    const memberEmails = orderedMembers(group);
    const manager = isManagerRole(role);
    const friends = new Set(strings(user.user.friends));
    const [profiles, stats, banned] = await Promise.all([
        loadProfiles(memberEmails),
        manager ? groupStats(groupId) : Promise.resolve(null),
        manager ? bannedMembers(groupId) : Promise.resolve([]),
    ]);
    const now = Date.now();
    return {
        group: publicGroup(groupId, group),
        members: memberEmails.map((memberEmail) => {
            const profile = profiles.get(memberEmail);
            const status = profileStatus(profile, now);
            return {
                email: memberEmail,
                username: profileName(memberEmail, profile),
                avatarUrl: profileAvatar(profile),
                ...profileTag(profile),
                staffRole: profileStaffRole(profile),
                customStatus: typeof profile?.customStatus === "string" ? profile.customStatus.slice(0, 120) : "",
                statusEmoji: typeof profile?.statusEmoji === "string" ? profile.statusEmoji.slice(0, 16) : "",
                status,
                online: status !== "offline",
                lastSeenAt: profile?.lastSeenAt || null,
                role: roleOf(group, memberEmail) || "member",
                key: memberKey(groupId, memberEmail),
                isFriend: friends.has(memberEmail),
            };
        }),
        me: { email, role, key: memberKey(groupId, email) },
        stats,
        banned,
    };
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireGroupUser();
        await assertRateLimit(`groups:read:${user.email}`, 90, 60_000);
        const id = request.nextUrl.searchParams.get("id");
        if (id !== null) return groupJson(await groupDetail(readId(id, "Grup kimliği"), user));
        return groupJson(await groupList(user.email));
    } catch (error) {
        return groupErrorResponse(error);
    }
}

/* -------------------------------------------------------------------------- */
/* Creation                                                                   */
/* -------------------------------------------------------------------------- */

const LANGUAGE_EXTENSIONS: Record<string, string> = {
    javascript: "js", typescript: "ts", python: "py", csharp: "cs", cpp: "cpp", c: "c", java: "java", html: "html",
    css: "css", php: "php", go: "go", swift: "swift", ruby: "rb", rust: "rs", kotlin: "kt", sql: "sql", lua: "lua",
};

const isLanguageId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9#+-]{1,30}$/i.test(value);
const isDocumentFile = (name: string) => /\.(md|txt)$/i.test(name) || name === "LICENSE";

function withSuffix(name: string, suffix: number) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)}-${suffix}${name.slice(dot)}` : `${name}-${suffix}`;
}

type SeedFileWithLanguage = { name: string; lang: string; code: string };

async function importProjectFiles(projectId: string, email: string) {
    const project = await getServerDocument<{ email?: string; name?: string; lang?: string; code?: string }>(`projects/${projectId}`);
    if (!project || project.email !== email) throw new GroupApiError(404, "project_not_found", "Başlangıç projesi bulunamadı.");
    const stored = await listServerCollection<{ name?: string; lang?: string; code?: string; order?: number }>(`projects/${projectId}/files`, 100);
    const files: SeedFileWithLanguage[] = stored
        .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
        .slice(0, GROUP_LIMITS.filesMax)
        .map((file, index) => {
            const name = cleanFileName(file.name, `file-${index + 1}.txt`);
            const detected = languageFromFileName(name);
            return {
                name,
                lang: detected !== "plaintext" ? detected : isLanguageId(file.lang) ? file.lang.toLowerCase() : "plaintext",
                code: typeof file.code === "string" ? file.code.slice(0, GROUP_LIMITS.fileContentMax) : "",
            };
        });
    // Older single-file projects keep their code on the project document.
    if (!files.length && typeof project.code === "string") {
        const lang = isLanguageId(project.lang) ? project.lang.toLowerCase() : "plaintext";
        files.push({ name: `main.${LANGUAGE_EXTENSIONS[lang] || "txt"}`, lang, code: project.code.slice(0, GROUP_LIMITS.fileContentMax) });
    }
    const seen = new Set<string>();
    const unique = files.map((file) => {
        let name = file.name;
        for (let suffix = 2; seen.has(name.toLowerCase()); suffix += 1) name = withSuffix(file.name, suffix);
        seen.add(name.toLowerCase());
        return { ...file, name };
    });
    return { name: cleanSingleLine(project.name, 80), files: unique };
}

async function createGroup(body: Record<string, unknown>, user: GroupUser) {
    const { email } = user;
    await assertRateLimit(`groups:create:${email}`, 10, 60 * 60_000);
    const name = cleanSingleLine(body.name, 200);
    if (name.length < GROUP_LIMITS.nameMin) throw new GroupApiError(400, "name_too_short", "Grup adı en az 2 karakter olmalıdır.");
    if (name.length > GROUP_LIMITS.nameMax) throw new GroupApiError(400, "name_too_long", "Grup adı en fazla 60 karakter olabilir.");
    const description = cleanMultiLine(body.description, 2000);
    if (description.length > GROUP_LIMITS.descriptionMax) throw new GroupApiError(400, "description_too_long", "Açıklama en fazla 500 karakter olabilir.");
    if (body.template !== undefined && !isGroupTemplateId(body.template)) throw new GroupApiError(400, "invalid_template", "Geçersiz şablon.");
    if (body.emoji !== undefined && !isGroupEmoji(body.emoji)) throw new GroupApiError(400, "invalid_emoji", "Geçersiz grup simgesi.");
    if (body.color !== undefined && !isGroupColor(body.color)) throw new GroupApiError(400, "invalid_color", "Geçersiz grup rengi.");
    const template = getGroupTemplate(body.template);
    const emoji = isGroupEmoji(body.emoji) ? body.emoji : template.emoji;
    const color = isGroupColor(body.color) ? body.color : template.color;
    const lang = seedLanguageFor(body.language);
    const projectId = body.projectId === undefined || body.projectId === null || body.projectId === "" ? "" : readId(body.projectId, "Proje kimliği");

    // Free 3, Plus 10, Pro unlimited (src/lib/plans.ts PLAN_GROUP_LIMITS).
    const { limit } = await groupLimitFor(email);
    if (limit !== null) {
        const owned = await queryServerCollection<StoredGroup>("groups", "ownerEmail", "EQUAL", email, { limit: limit + 1 });
        if (owned.length >= limit) {
            throw new GroupApiError(409, "group_limit", `Planınla en fazla ${limit} grup açabilirsin. Yeni grup için bir grubu silebilir, sahipliğini devredebilir ya da planını yükseltebilirsin (/plans).`);
        }
    }

    const now = new Date();
    const ownerName = cleanSingleLine(await ownDisplayName(user), 60) || email.split("@")[0];
    const seed = buildGroupSeed(template.id, lang, { groupName: name, ownerName, date: now.toISOString().slice(0, 10), year: now.getUTCFullYear() });
    let files: SeedFileWithLanguage[] = seed.files.map((file) => ({ ...file, lang: languageFromFileName(file.name) }));
    let projectName = seed.projectName;
    if (projectId) {
        const imported = await importProjectFiles(projectId, email);
        const taken = new Set(imported.files.map((file) => file.name.toLowerCase()));
        // The project's own files come first; the template only adds its documents (README, rules, tasks).
        files = [...imported.files, ...files.filter((file) => isDocumentFile(file.name) && !taken.has(file.name.toLowerCase()))];
        projectName = imported.name || projectName;
    }
    files = files.slice(0, GROUP_LIMITS.filesMax);

    const groupId = randomUUID();
    const groupWrite = {
        path: `groups/${groupId}`,
        data: {
            name,
            description,
            emoji,
            color,
            template: template.id,
            rules: seed.rules,
            topics: seed.topics,
            contentLanguage: lang,
            ownerEmail: email,
            admins: [email],
            members: [email],
            projectName,
            pinnedMessageIds: [WELCOME_MESSAGE_ID],
            allowMemberInvites: true,
            onboarding: { dismissed: false, callStarted: false },
            createdAt: now,
            updatedAt: now,
            schemaVersion: 2,
        },
        exists: false,
    };
    const welcomeWrite = {
        path: `groups/${groupId}/messages/${WELCOME_MESSAGE_ID}`,
        data: { fromEmail: SYSTEM_SENDER, author: "Hanogt", authorAvatar: null, type: "system", event: "welcome", template: template.id, text: seed.welcomeText, createdAt: now },
        exists: false,
    };
    // Firestore commits are capped at 10 MiB, so large imported projects are written in several batches.
    const batches: Array<Array<{ path: string; data: Record<string, unknown>; exists: boolean }>> = [[]];
    let batchBytes = 0;
    files.forEach((file, index) => {
        const bytes = Buffer.byteLength(file.code, "utf8") + Buffer.byteLength(file.name, "utf8") + 512;
        const current = batches[batches.length - 1];
        if (current.length && (batchBytes + bytes > COMMIT_BYTES_BUDGET || current.length >= 400)) {
            batches.push([]);
            batchBytes = 0;
        }
        batches[batches.length - 1].push({
            path: `groups/${groupId}/files/${String(index).padStart(3, "0")}`,
            data: { name: file.name, lang: file.lang, code: file.code, order: index, updatedBy: email, updatedAt: now },
            exists: false,
        });
        batchBytes += bytes;
    });
    await commitServerPatches([groupWrite, welcomeWrite, ...batches[0]]);
    try {
        for (const batch of batches.slice(1)) await commitServerPatches(batch);
    } catch (error) {
        // A half-imported group is worse than none: remove it and report the failure.
        await deleteGroupCascade(groupId).catch(() => undefined);
        throw error;
    }
    return { success: true, id: groupId };
}

/* -------------------------------------------------------------------------- */
/* Friend invitations                                                         */
/* -------------------------------------------------------------------------- */

async function acceptInvite(body: Record<string, unknown>, user: GroupUser) {
    const { email } = user;
    const groupId = readId(body.groupId, "Grup kimliği");
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
        if (members.length >= GROUP_LIMITS.membersMax) throw new GroupApiError(409, "group_full", "Grup 25 üye sınırına ulaştı.");
        const now = new Date();
        await commitServerPatches([
            { path: `groups/${groupId}`, data: { members: [...members, email], updatedAt: now }, updateFields: ["members", "updatedAt"], updateTime: group._updateTime },
            { path: `group_invites/${inviteId}`, data: { status: "accepted", resolvedAt: now }, updateFields: ["status", "resolvedAt"], updateTime: invite._updateTime },
        ]);
        return { group, joined: true };
    });
    if (outcome.joined) await postSystemMessage(groupId, outcome.group, "member_joined", { name: await ownDisplayName(user) });
    return { success: true, groupId };
}

async function rejectInvite(body: Record<string, unknown>, user: GroupUser) {
    const groupId = readId(body.groupId, "Grup kimliği");
    const inviteId = inviteDocumentId(groupId, user.email);
    const invite = await getServerDocument<InviteRecord>(`group_invites/${inviteId}`);
    if (!invite || invite.toEmail !== user.email || invite.groupId !== groupId || invite.status !== "pending") {
        throw new GroupApiError(404, "invite_not_found", "Geçerli grup daveti bulunamadı.");
    }
    await patchServerDocument(`group_invites/${inviteId}`, { status: "rejected", resolvedAt: new Date() }, { updateFields: ["status", "resolvedAt"], updateTime: invite._updateTime });
    return { success: true };
}

async function inviteFriend(body: Record<string, unknown>, user: GroupUser) {
    const { email } = user;
    const groupId = readId(body.groupId, "Grup kimliği");
    const targetEmail = readEmail(body.targetEmail);
    if (targetEmail === email) throw new GroupApiError(400, "self_action", "Kendinizi davet edemezsiniz.");
    const { group, role } = await requireGroupMember(groupId, email);
    if (group.allowMemberInvites === false && !isManagerRole(role)) {
        throw new GroupApiError(403, "invites_disabled", "Bu grupta yalnızca yöneticiler davet gönderebilir.");
    }
    if (!strings(user.user.friends).includes(targetEmail)) throw new GroupApiError(403, "not_friend", "Yalnızca arkadaşlarınızı gruba davet edebilirsiniz.");
    const members = groupMembers(group);
    if (members.includes(targetEmail)) return { success: true, alreadyMember: true };
    if (members.length >= GROUP_LIMITS.membersMax) throw new GroupApiError(409, "group_full", "Grup 25 üye sınırına ulaştı.");
    if (await isBanned(groupId, targetEmail)) throw new GroupApiError(403, "target_banned", "Bu kullanıcının gruba katılması engellenmiş.");
    const target = await getServerDocument(`users/${targetEmail}`);
    if (!target) throw new GroupApiError(404, "user_not_found", "Kullanıcı bulunamadı.");
    const now = Date.now();
    await patchServerDocument(`group_invites/${inviteDocumentId(groupId, targetEmail)}`, {
        groupId,
        groupName: group.name || "Hanogt",
        fromEmail: email,
        toEmail: targetEmail,
        status: "pending",
        createdAt: new Date(now),
        expiresAt: new Date(now + INVITE_TTL_MS),
    });
    return { success: true, invited: true };
}

async function cancelInvite(body: Record<string, unknown>, user: GroupUser) {
    const groupId = readId(body.groupId, "Grup kimliği");
    const targetEmail = readEmail(body.targetEmail);
    const { role } = await requireGroupMember(groupId, user.email);
    const inviteId = inviteDocumentId(groupId, targetEmail);
    const invite = await getServerDocument<InviteRecord>(`group_invites/${inviteId}`);
    if (!invite || invite.groupId !== groupId || invite.status !== "pending") throw new GroupApiError(404, "invite_not_found", "Bekleyen davet bulunamadı.");
    if (!isManagerRole(role) && invite.fromEmail !== user.email) {
        throw new GroupApiError(403, "forbidden", "Bu daveti yalnızca gönderen kişi veya yöneticiler iptal edebilir.");
    }
    await deleteServerDocument(`group_invites/${inviteId}`);
    return { success: true };
}

/* -------------------------------------------------------------------------- */
/* Members and roles                                                          */
/* -------------------------------------------------------------------------- */

async function removeMember(body: Record<string, unknown>, user: GroupUser) {
    const { email } = user;
    const groupId = readId(body.groupId, "Grup kimliği");
    const targetEmail = readEmail(body.targetEmail);
    const ban = body.ban === true;
    if (targetEmail === email) throw new GroupApiError(400, "self_action", "Kendinizi çıkaramazsınız; bunun yerine gruptan ayrılın.");
    await retryOnConflict(async () => {
        const { group, role } = await requireGroupMember(groupId, email);
        requireManager(role);
        if (targetEmail === group.ownerEmail) throw new GroupApiError(403, "cannot_remove_owner", "Grup sahibi gruptan çıkarılamaz.");
        const targetRole = roleOf(group, targetEmail);
        if (!targetRole) throw new GroupApiError(404, "target_not_member", "Bu kullanıcı grubun üyesi değil.");
        if (targetRole === "admin" && role !== "owner") throw new GroupApiError(403, "cannot_remove_admin", "Yöneticileri yalnızca grup sahibi çıkarabilir.");
        const now = new Date();
        await commitServerPatches([
            {
                path: `groups/${groupId}`,
                data: { members: groupMembers(group).filter((entry) => entry !== targetEmail), admins: groupAdmins(group).filter((entry) => entry !== targetEmail), updatedAt: now },
                updateFields: ["members", "admins", "updatedAt", `typing.${memberKey(groupId, targetEmail)}`],
                updateTime: group._updateTime,
            },
            ...(ban ? [{ path: `group_bans/${banDocumentId(groupId, targetEmail)}`, data: { groupId, email: targetEmail, bannedBy: email, createdAt: now } }] : []),
        ]);
    });
    await deleteServerDocument(`group_invites/${inviteDocumentId(groupId, targetEmail)}`).catch(() => undefined);
    return { success: true };
}

async function unbanMember(body: Record<string, unknown>, user: GroupUser) {
    const groupId = readId(body.groupId, "Grup kimliği");
    const targetEmail = readEmail(body.targetEmail);
    const { role } = await requireGroupMember(groupId, user.email);
    requireManager(role);
    await deleteServerDocument(`group_bans/${banDocumentId(groupId, targetEmail)}`);
    return { success: true };
}

async function setAdmin(body: Record<string, unknown>, user: GroupUser) {
    const groupId = readId(body.groupId, "Grup kimliği");
    const targetEmail = readEmail(body.targetEmail);
    const enabled = body.enabled === true;
    await retryOnConflict(async () => {
        const { group, role } = await requireGroupMember(groupId, user.email);
        requireOwner(role);
        if (targetEmail === group.ownerEmail) throw new GroupApiError(400, "self_action", "Grup sahibinin rolü değiştirilemez.");
        if (!roleOf(group, targetEmail)) throw new GroupApiError(404, "target_not_member", "Bu kullanıcı grubun üyesi değil.");
        const admins = groupAdmins(group);
        if (admins.includes(targetEmail) === enabled) return;
        const next = enabled ? [...admins, targetEmail] : admins.filter((entry) => entry !== targetEmail);
        await patchServerDocument(`groups/${groupId}`, { admins: next, updatedAt: new Date() }, { updateFields: ["admins", "updatedAt"], updateTime: group._updateTime });
    });
    return { success: true };
}

async function transferOwnership(body: Record<string, unknown>, user: GroupUser) {
    const groupId = readId(body.groupId, "Grup kimliği");
    const targetEmail = readEmail(body.targetEmail);
    if (targetEmail === user.email) throw new GroupApiError(400, "self_action", "Grup zaten sizin.");
    const group = await retryOnConflict(async () => {
        const { group: current, role } = await requireGroupMember(groupId, user.email);
        requireOwner(role);
        if (!roleOf(current, targetEmail)) throw new GroupApiError(404, "target_not_member", "Bu kullanıcı grubun üyesi değil.");
        // The previous owner stays an admin so the hand-over never locks them out.
        const admins = [...new Set([...groupAdmins(current), targetEmail, user.email])];
        await patchServerDocument(`groups/${groupId}`, { ownerEmail: targetEmail, admins, updatedAt: new Date() }, { updateFields: ["ownerEmail", "admins", "updatedAt"], updateTime: current._updateTime });
        return current;
    });
    const profiles = await loadProfiles([targetEmail]);
    await postSystemMessage(groupId, group, "owner_changed", { name: profileName(targetEmail, profiles.get(targetEmail)) });
    return { success: true };
}

async function leaveGroup(body: Record<string, unknown>, user: GroupUser) {
    const { email } = user;
    const groupId = readId(body.groupId, "Grup kimliği");
    const group = await retryOnConflict(async () => {
        const { group: current, role } = await requireGroupMember(groupId, email);
        if (role === "owner") throw new GroupApiError(409, "owner_cannot_leave", "Grup sahibi ayrılmadan önce sahipliği devretmeli veya grubu silmelidir.");
        await patchServerDocument(`groups/${groupId}`, {
            members: groupMembers(current).filter((entry) => entry !== email),
            admins: groupAdmins(current).filter((entry) => entry !== email),
            updatedAt: new Date(),
        }, { updateFields: ["members", "admins", "updatedAt", `typing.${memberKey(groupId, email)}`], updateTime: current._updateTime });
        return current;
    });
    await postSystemMessage(groupId, group, "member_left", { name: await ownDisplayName(user) });
    return { success: true };
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

async function updateSettings(body: Record<string, unknown>, user: GroupUser) {
    const groupId = readId(body.groupId, "Grup kimliği");
    await retryOnConflict(async () => {
        const { group, role } = await requireGroupMember(groupId, user.email);
        requireManager(role);
        const data: Record<string, unknown> = {};
        if (body.name !== undefined) {
            const name = cleanSingleLine(body.name, 200);
            if (name.length < GROUP_LIMITS.nameMin) throw new GroupApiError(400, "name_too_short", "Grup adı en az 2 karakter olmalıdır.");
            // Names created before the 60-character limit may be kept as they are.
            if (name.length > GROUP_LIMITS.nameMax && name !== group.name) throw new GroupApiError(400, "name_too_long", "Grup adı en fazla 60 karakter olabilir.");
            data.name = name;
        }
        if (body.description !== undefined) {
            const description = cleanMultiLine(body.description, 2000);
            if (description.length > GROUP_LIMITS.descriptionMax) throw new GroupApiError(400, "description_too_long", "Açıklama en fazla 500 karakter olabilir.");
            data.description = description;
        }
        if (body.emoji !== undefined) {
            if (!isGroupEmoji(body.emoji)) throw new GroupApiError(400, "invalid_emoji", "Geçersiz grup simgesi.");
            data.emoji = body.emoji;
        }
        if (body.color !== undefined) {
            if (!isGroupColor(body.color)) throw new GroupApiError(400, "invalid_color", "Geçersiz grup rengi.");
            data.color = body.color;
        }
        if (body.rules !== undefined) {
            const rules = cleanMultiLine(body.rules, GROUP_LIMITS.rulesMax * 2);
            if (rules.length > GROUP_LIMITS.rulesMax) throw new GroupApiError(400, "rules_too_long", "Kurallar en fazla 4000 karakter olabilir.");
            data.rules = rules;
        }
        if (body.topics !== undefined) {
            const topics = normalizeTopics(body.topics, groupLanguage(group));
            if (!topics) throw new GroupApiError(400, "invalid_topics", "Konular yalnızca harf, rakam, - ve _ içerebilir (en fazla 12 konu, 24 karakter).");
            data.topics = topics;
        }
        if (body.allowMemberInvites !== undefined) {
            if (typeof body.allowMemberInvites !== "boolean") throw new GroupApiError(400, "invalid_request", "Geçersiz davet ayarı.");
            data.allowMemberInvites = body.allowMemberInvites;
        }
        const fields = Object.keys(data);
        if (!fields.length) return;
        await patchServerDocument(`groups/${groupId}`, { ...data, updatedAt: new Date() }, { updateFields: [...fields, "updatedAt"], updateTime: group._updateTime });
    });
    return { success: true };
}

async function updateOnboarding(body: Record<string, unknown>, user: GroupUser) {
    const groupId = readId(body.groupId, "Grup kimliği");
    const step = body.step;
    if (step !== "dismiss" && step !== "restore" && step !== "call") throw new GroupApiError(400, "invalid_request", "Geçersiz adım.");
    const { group, role } = await requireGroupMember(groupId, user.email);
    requireManager(role);
    const field = step === "call" ? "callStarted" : "dismissed";
    const value = step !== "restore";
    if (publicGroup(groupId, group).onboarding[field] === value) return { success: true };
    await patchServerDocument(`groups/${groupId}`, { onboarding: { [field]: value } }, { updateFields: [`onboarding.${field}`], exists: true });
    return { success: true };
}

async function deleteGroup(body: Record<string, unknown>, user: GroupUser) {
    const groupId = readId(body.groupId, "Grup kimliği");
    const { group, role } = await requireGroupMember(groupId, user.email);
    requireOwner(role);
    if (cleanSingleLine(body.confirmName, 200) !== cleanSingleLine(group.name, 200)) {
        throw new GroupApiError(400, "confirm_mismatch", "Onaylamak için grup adını aynen yazın.");
    }
    await assertRateLimit(`groups:delete:${user.email}`, 10, 60 * 60_000);
    await deleteGroupCascade(groupId);
    return { success: true };
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireGroupUser();
        await assertRateLimit(`groups:${user.email}`, 40, 60_000);
        const body = await readJsonBody(request);
        const action = typeof body.action === "string" ? body.action : "";
        switch (action) {
            case "create": return groupJson(await createGroup(body, user), 201);
            case "accept-invite": return groupJson(await acceptInvite(body, user));
            case "reject-invite": return groupJson(await rejectInvite(body, user));
            case "add-member":
            case "invite-friend": return groupJson(await inviteFriend(body, user));
            case "cancel-invite": return groupJson(await cancelInvite(body, user));
            case "remove-member": return groupJson(await removeMember(body, user));
            case "unban": return groupJson(await unbanMember(body, user));
            case "set-admin": return groupJson(await setAdmin(body, user));
            case "rename":
            case "update-settings": return groupJson(await updateSettings(body, user));
            case "transfer-ownership": return groupJson(await transferOwnership(body, user));
            case "leave": return groupJson(await leaveGroup(body, user));
            case "delete": return groupJson(await deleteGroup(body, user));
            case "onboarding": return groupJson(await updateOnboarding(body, user));
            default: throw new GroupApiError(400, "invalid_request", "Geçersiz işlem.");
        }
    } catch (error) {
        return groupErrorResponse(error);
    }
}
