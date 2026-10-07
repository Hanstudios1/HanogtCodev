import "server-only";

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { memberKey } from "@/lib/server/group-keys";
import { RULES_NOT_ACCEPTED_MESSAGE, rulesAcceptedField, rulesBlock } from "@/lib/server/group-rules";
import { deleteGroupVoice, removeFromVoice } from "@/lib/server/group-voice";
import {
    commitServerMutations,
    commitServerPatches,
    createServerDocument,
    deleteServerDocument,
    getServerDocument,
    listServerCollection,
    patchServerDocument,
    queryServerCollection,
} from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { forgetMemberStars, forgetPlaceStars } from "@/lib/server/social-stars";
import { deleteContainerFiles } from "@/lib/server/message-files";
import { deleteVoiceRecording } from "@/lib/server/social-voice";
import { GROUP_FEATURES_MAX } from "@/lib/plans";
import { effectiveStatus, type PresenceStatus } from "@/lib/presence";
import {
    GROUP_LIMITS,
    GROUP_SYSTEM_EVENT_COPY,
    SYSTEM_SENDER,
    WELCOME_MESSAGE_MAX,
    acceptanceVersion,
    acceptedRulesVersion,
    cleanMultiLine,
    fillVars,
    groupColor,
    groupEmoji,
    hasAcceptedRules,
    isGroupId,
    isGroupTemplateId,
    isInviteToken,
    isManagerRole,
    isMemberKey,
    nextRulesVersions,
    normalizeGroupEmail,
    normalizeRulesInput,
    outranks,
    parseLegacyRules,
    readGroupRules,
    readRulesVersion,
    readSlowmode,
    rulesGateActive,
    rulesText,
    safeGroupVoicePath,
    sanitizeCustomCommands,
    toMillis,
    type GroupErrorCode,
    type GroupInfo,
    type GroupMemberInfo,
    type GroupRole,
    type GroupRule,
    type GroupSystemEvent,
} from "@/lib/groups";
import { RESERVED_COMMAND_NAMES } from "@/lib/social/commands";

/* -------------------------------------------------------------------------- */
/* Errors and responses                                                       */
/* -------------------------------------------------------------------------- */

/** Expected failures: the message is Turkish (primary language), the code is translated by the UI. */
export class GroupApiError extends Error {
    readonly status: number;
    readonly code: GroupErrorCode;
    /** Machine-readable fields next to the code (e.g. the plan and limit of group_limit). */
    readonly extra: Record<string, unknown>;
    readonly headers: Record<string, string>;
    constructor(status: number, code: GroupErrorCode, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
        super(message);
        this.name = "GroupApiError";
        this.status = status;
        this.code = code;
        this.extra = extra;
        this.headers = headers;
    }
}

export function groupJson(data: Record<string, unknown>, status = 200) {
    return NextResponse.json(data, { status, headers: jsonSecurityHeaders() });
}

function errorStatus(error: unknown) {
    return typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) || 0 : 0;
}

/** Firestore answers a failed `currentDocument` precondition with 400/409/412. */
function isPreconditionFailure(error: unknown) {
    return [400, 409, 412].includes(errorStatus(error));
}

export function groupErrorResponse(error: unknown) {
    if (error instanceof GroupApiError) {
        return NextResponse.json({ ...error.extra, error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders(error.headers) });
    }
    if (errorStatus(error) === 409 || errorStatus(error) === 412) {
        return NextResponse.json({ error: "Grup başka bir cihazda güncellendi; tekrar deneyin.", code: "conflict" }, { status: 409, headers: jsonSecurityHeaders() });
    }
    // Only the message is logged: request bodies and member data stay out of the logs.
    console.error("[groups] request failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Grup işlemi tamamlanamadı.", code: "server_error" }, { status: 500, headers: jsonSecurityHeaders() });
}

/**
 * Runs a read-validate-write operation and repeats it when another request
 * changed the same document in between (optimistic concurrency).
 */
export async function retryOnConflict<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (error instanceof GroupApiError || !isPreconditionFailure(error)) throw error;
            if (attempt >= attempts) throw new GroupApiError(409, "conflict", "Grup başka bir cihazda güncellendi; tekrar deneyin.");
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Request guards                                                             */
/* -------------------------------------------------------------------------- */

export type GroupUser = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>;

export async function requireGroupUser(): Promise<GroupUser> {
    const active = await getActiveSession();
    if (!active) throw new GroupApiError(401, "unauthorized", "Etkin oturum gerekli.");
    return active;
}

export function assertSameOrigin(request: NextRequest) {
    if (!isSameOrigin(request)) throw new GroupApiError(403, "forbidden_origin", "Geçersiz istek kaynağı.");
}

export async function assertRateLimit(key: string, limit: number, windowMs: number) {
    const result = await enforceRateLimitWithFallback(key, limit, windowMs);
    if (!result.allowed) {
        throw new GroupApiError(429, "rate_limited", "Çok fazla grup işlemi. Biraz sonra tekrar deneyin.", {}, { "Retry-After": String(result.retryAfterSeconds) });
    }
}

/** Parses a small JSON object body; anything else is rejected before it reaches the handlers. */
export async function readJsonBody(request: NextRequest, maxBytes = 32_768): Promise<Record<string, unknown>> {
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > maxBytes) throw new GroupApiError(413, "payload_too_large", "İstek çok büyük.");
    const text = await request.text().catch(() => "");
    if (text.length > maxBytes) throw new GroupApiError(413, "payload_too_large", "İstek çok büyük.");
    let parsed: unknown = {};
    if (text.trim()) {
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new GroupApiError(400, "invalid_request", "Geçersiz istek gövdesi.");
        }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new GroupApiError(400, "invalid_request", "Geçersiz istek gövdesi.");
    return parsed as Record<string, unknown>;
}

/** Every id is checked against a strict pattern before it is used in a document path. */
export function readId(value: unknown, label = "Kimlik"): string {
    if (!isGroupId(value)) throw new GroupApiError(400, "invalid_id", `${label} geçersiz.`);
    return value;
}

export function readToken(value: unknown): string {
    if (!isInviteToken(value)) throw new GroupApiError(404, "link_not_found", "Davet bağlantısı bulunamadı.");
    return value;
}

export function readEmail(value: unknown): string {
    const email = normalizeGroupEmail(value);
    if (!email) throw new GroupApiError(400, "invalid_email", "Geçersiz kullanıcı.");
    return email;
}

/* -------------------------------------------------------------------------- */
/* Group documents                                                            */
/* -------------------------------------------------------------------------- */

export type StoredGroup = {
    name?: string;
    description?: string;
    ownerEmail?: string;
    admins?: unknown;
    members?: unknown;
    createdAt?: string;
    updatedAt?: string;
    projectName?: string;
    schemaVersion?: number;
    emoji?: string;
    color?: string;
    /** Plain-text rules (older groups only have these; newer ones keep them in step with rulesList). */
    rules?: string;
    /** The Rules section (lib/groups.ts readGroupRules reads all of the rule fields). */
    rulesList?: unknown;
    rulesVersion?: unknown;
    rulesUpdatedAt?: unknown;
    rulesScreening?: unknown;
    rulesAcceptVersion?: unknown;
    /** Accepted rule versions by pseudonymous member key (lib/server/group-rules.ts). */
    rulesAccepted?: unknown;
    topics?: unknown;
    template?: string;
    contentLanguage?: string;
    pinnedMessageIds?: unknown;
    allowMemberInvites?: boolean;
    onboarding?: { dismissed?: boolean; callStarted?: boolean };
    typing?: Record<string, unknown>;
    moderators?: unknown;
    slowmode?: unknown;
    aiBot?: boolean;
    welcomeMessage?: string;
    customCommands?: unknown;
};

export type GroupDocument = StoredGroup & { _updateTime?: string };

export type InviteRecord = { groupId?: string; groupName?: string; fromEmail?: string; toEmail?: string; status?: string; createdAt?: string; expiresAt?: string };
export type InviteLinkRecord = { groupId?: string; createdBy?: string; createdAt?: string; expiresAt?: string | null; maxUses?: number; uses?: number };
export type BanRecord = { groupId?: string; email?: string; bannedBy?: string; createdAt?: string };

export function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function groupMembers(group: StoredGroup) {
    return strings(group.members);
}

export function groupAdmins(group: StoredGroup) {
    return strings(group.admins);
}

export function groupModerators(group: StoredGroup) {
    return strings(group.moderators);
}

export function roleOf(group: StoredGroup, email: string): GroupRole | null {
    if (!email || !groupMembers(group).includes(email)) return null;
    if (group.ownerEmail === email) return "owner";
    if (groupAdmins(group).includes(email)) return "admin";
    if (groupModerators(group).includes(email)) return "moderator";
    return "member";
}

/** Owner first, then admins, moderators and members in join order. */
export function orderedMembers(group: StoredGroup) {
    const members = groupMembers(group);
    const admins = new Set(groupAdmins(group));
    const moderators = new Set(groupModerators(group));
    const rank = (email: string) => (email === group.ownerEmail ? 0 : admins.has(email) ? 1 : moderators.has(email) ? 2 : 3);
    return members.map((email, index) => ({ email, index })).sort((a, b) => rank(a.email) - rank(b.email) || a.index - b.index).map((entry) => entry.email);
}

export async function loadGroup(groupId: string) {
    if (!isGroupId(groupId)) return null;
    return getServerDocument<StoredGroup>(`groups/${groupId}`) as Promise<GroupDocument | null>;
}

/** Members only: missing groups and foreign groups look the same to the caller. */
export async function requireGroupMember(groupId: string, email: string) {
    const group = await loadGroup(groupId);
    const role = group ? roleOf(group, email) : null;
    if (!group || !role) throw new GroupApiError(404, "not_found", "Grup bulunamadı veya erişiminiz yok.");
    return { group, role };
}

export function requireManager(role: GroupRole) {
    if (role !== "owner" && role !== "admin") throw new GroupApiError(403, "forbidden", "Bu işlem için yönetici yetkisi gerekiyor.");
}

export function requireModerator(role: GroupRole) {
    if (role !== "owner" && role !== "admin" && role !== "moderator") throw new GroupApiError(403, "forbidden", "Bu işlem için moderatör yetkisi gerekiyor.");
}

export function requireOwner(role: GroupRole) {
    if (role !== "owner") throw new GroupApiError(403, "forbidden", "Bu işlemi yalnızca grup sahibi yapabilir.");
}

export function groupLanguage(group: StoredGroup) {
    return group.contentLanguage === "en" ? "en" : "tr";
}

/** The client-facing view of a group document (internal fields such as typing state and rule acceptances stay out). */
export function publicGroup(groupId: string, group: StoredGroup): GroupInfo {
    const rules = readGroupRules(group);
    return {
        id: groupId,
        name: group.name || "Hanogt",
        description: group.description || "",
        emoji: groupEmoji(group.emoji),
        color: groupColor(group.color),
        rules: typeof group.rules === "string" && group.rules ? group.rules : rulesText(rules.list),
        rulesList: rules.list,
        rulesVersion: rules.version,
        rulesUpdatedAt: rules.updatedAt,
        rulesScreening: rules.screening,
        rulesAcceptVersion: rules.acceptVersion,
        topics: strings(group.topics).slice(0, GROUP_LIMITS.topicsMax),
        template: isGroupTemplateId(group.template) ? group.template : null,
        contentLanguage: groupLanguage(group),
        ownerEmail: group.ownerEmail || "",
        admins: groupAdmins(group),
        members: groupMembers(group),
        projectName: group.projectName || "",
        createdAt: group.createdAt || null,
        updatedAt: group.updatedAt || group.createdAt || null,
        pinnedMessageIds: strings(group.pinnedMessageIds).filter(isGroupId).slice(0, GROUP_FEATURES_MAX.pinned),
        allowMemberInvites: group.allowMemberInvites !== false,
        // Groups created before the checklist existed start with it hidden (it can be reopened in settings).
        onboarding: group.onboarding ? { dismissed: Boolean(group.onboarding.dismissed), callStarted: Boolean(group.onboarding.callStarted) } : { dismissed: true, callStarted: false },
        moderators: groupModerators(group),
        slowmode: readSlowmode(group.slowmode),
        aiBot: group.aiBot !== false,
        welcomeMessage: cleanMultiLine(group.welcomeMessage, WELCOME_MESSAGE_MAX).slice(0, WELCOME_MESSAGE_MAX),
        customCommands: sanitizeCustomCommands(group.customCommands, RESERVED_COMMAND_NAMES),
    };
}

/** The per-group member key (reactions, typing, voice channels): see lib/server/group-keys.ts. */
export { memberKey };

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Refuses a write (message, edit, file, reaction) from a member who hasn't
 * accepted the group's rules while the group asks for it (lib/server/group-rules.ts).
 */
export function assertRulesAccepted(groupId: string, group: StoredGroup, email: string) {
    if (rulesBlock(groupId, group, email)) throw new GroupApiError(409, "rules_not_accepted", RULES_NOT_ACCEPTED_MESSAGE);
}

/** The rules version the browser showed (sent with an acceptance); undefined when none (or nothing usable) was sent. */
export function readSeenRulesVersion(value: unknown) {
    const version = readRulesVersion(value);
    return version >= 1 ? version : undefined;
}

/**
 * Records that a member accepted the group's rules: the version they were
 * shown (`seen`), on the group document under their pseudonymous key. When
 * the rules changed since and must be accepted again, nothing is recorded.
 */
export async function acceptGroupRules(groupId: string, email: string, seen?: number) {
    const { group } = await requireGroupMember(groupId, email);
    const state = readGroupRules(group);
    const version = acceptanceVersion(state, seen);
    if (rulesGateActive(state) && !hasAcceptedRules(state, version)) {
        throw new GroupApiError(409, "rules_changed", "Kurallar az önce güncellendi; güncel kuralları okuyup yeniden kabul edin.");
    }
    const key = memberKey(groupId, email);
    if (acceptedRulesVersion(group.rulesAccepted, key) >= version) return { version };
    await patchServerDocument(`groups/${groupId}`, { rulesAccepted: { [key]: version } }, { updateFields: [`rulesAccepted.${key}`], exists: true });
    return { version };
}

/** A save of the Rules section: the new list (null: unchanged), screening (null: unchanged) and "everyone accepts again". */
export type RulesChange = { list: GroupRule[] | null; screening: boolean | null; reaccept: boolean };

/**
 * The Rules section fields of a settings save: `rulesList` (the rules),
 * `rulesScreening` (members accept before talking) and `rulesReaccept`
 * (everyone accepts again); older clients send `rules` as plain text, which
 * is read into rules. Null when the request doesn't touch the rules.
 */
export function readRulesChange(body: Record<string, unknown>): RulesChange | null {
    if (body.rulesList === undefined && body.rules === undefined && body.rulesScreening === undefined && body.rulesReaccept === undefined) return null;
    let list: GroupRule[] | null = null;
    if (body.rulesList !== undefined) {
        const result = normalizeRulesInput(body.rulesList);
        if (!result.ok) {
            throw result.problem === "rules_limit"
                ? new GroupApiError(400, "rules_limit", `En fazla ${GROUP_LIMITS.rulesCount} kural eklenebilir.`, { limit: GROUP_LIMITS.rulesCount })
                : result.problem === "rules_too_long"
                    ? new GroupApiError(400, "rules_too_long", `Bir kuralın başlığı en fazla ${GROUP_LIMITS.ruleTitleMax}, açıklaması en fazla ${GROUP_LIMITS.ruleDescriptionMax} karakter olabilir.`)
                    : new GroupApiError(400, "invalid_rules", "Her kuralın bir başlığı olmalı.");
        }
        list = result.rules;
    } else if (body.rules !== undefined) {
        const text = cleanMultiLine(body.rules, GROUP_LIMITS.rulesMax * 2);
        if (text.length > GROUP_LIMITS.rulesMax) throw new GroupApiError(400, "rules_too_long", "Kurallar en fazla 4000 karakter olabilir.");
        list = parseLegacyRules(text);
    }
    if (body.rulesScreening !== undefined && typeof body.rulesScreening !== "boolean") throw new GroupApiError(400, "invalid_request", "Geçersiz kural onayı ayarı.");
    if (body.rulesReaccept !== undefined && typeof body.rulesReaccept !== "boolean") throw new GroupApiError(400, "invalid_request", "Geçersiz kural onayı ayarı.");
    return { list, screening: typeof body.rulesScreening === "boolean" ? body.rulesScreening : null, reaccept: body.rulesReaccept === true };
}

const sameRules = (a: readonly GroupRule[], b: readonly GroupRule[]) => a.length === b.length && a.every((rule, index) => rule.title === b[index].title && rule.description === b[index].description);

/**
 * The fields a save of the rules writes: the list with its plain-text copy
 * (older readers), the new versions and screening. "Last updated" moves only
 * when the rules themselves change.
 */
export function rulesWrite(group: StoredGroup, change: RulesChange, now = new Date()) {
    const current = readGroupRules(group);
    const list = change.list ?? current.list;
    const screening = change.screening ?? current.screening;
    const { version, acceptVersion } = nextRulesVersions(current, { screening, reaccept: change.reaccept });
    return {
        rulesList: list,
        rules: rulesText(list),
        rulesVersion: version,
        rulesAcceptVersion: acceptVersion,
        rulesScreening: screening,
        ...(!sameRules(list, current.list) || !current.updatedAt ? { rulesUpdatedAt: now } : {}),
    };
}

/**
 * The acceptance a join writes with the membership when the person ticked
 * "I've read and accept the rules" (`acceptRules: true`, with the version
 * they were shown). Null when they didn't, when the group has no rules, or
 * when the rules changed since (they accept inside the group then).
 */
export function joinRulesAcceptance(groupId: string, group: StoredGroup, email: string, options: { acceptRules?: unknown; rulesVersion?: unknown }) {
    if (options.acceptRules !== true) return null;
    const state = readGroupRules(group);
    if (!state.list.length) return null;
    const version = acceptanceVersion(state, readSeenRulesVersion(options.rulesVersion));
    if (rulesGateActive(state) && !hasAcceptedRules(state, version)) return null;
    return { field: rulesAcceptedField(groupId, email), data: { rulesAccepted: { [memberKey(groupId, email)]: version } }, version };
}

/** Field paths of typing entries that are older than `maxAgeMs` (or malformed), for clean-up. */
export function staleTypingFields(group: StoredGroup, now: number, keep: string[] = [], maxAgeMs = 30_000) {
    const typing = group.typing && typeof group.typing === "object" ? group.typing : {};
    return Object.entries(typing)
        .filter(([key, value]) => !keep.includes(key) && isMemberKey(key) && (typeof value !== "number" || now - value > maxAgeMs))
        .map(([key]) => `typing.${key}`)
        .slice(0, 30);
}

export function inviteDocumentId(groupId: string, email: string) {
    return `${groupId}_${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
}

export function banDocumentId(groupId: string, email: string) {
    return `${groupId}_${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
}

export async function isBanned(groupId: string, email: string) {
    return Boolean(await getServerDocument<BanRecord>(`group_bans/${banDocumentId(groupId, email)}`));
}

export function isInvitePending(invite: InviteRecord, now = Date.now()) {
    return invite.status === "pending" && (!invite.expiresAt || toMillis(invite.expiresAt) > now);
}

export function isLinkActive(link: InviteLinkRecord, now = Date.now()) {
    const expired = Boolean(link.expiresAt) && toMillis(link.expiresAt) <= now;
    const exhausted = Number(link.maxUses || 0) > 0 && Number(link.uses || 0) >= Number(link.maxUses);
    return !expired && !exhausted;
}

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

export type PublicProfile = {
    username?: string;
    avatarUrl?: string;
    nickname?: string;
    nicknameTag?: string;
    customStatus?: string;
    /** Written by POST /api/presence (lib/presence.ts); read with effectiveStatus(). */
    presence?: unknown;
    isOnline?: boolean;
    lastSeenAt?: string;
    dndMode?: boolean;
    /** Written by the server only (lib/server/admin.ts syncStaffRoleBadge). */
    staffRole?: unknown;
};

export async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const run = async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await worker(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
}

/** Public profiles of the given e-mails (unknown or unreadable ones map to null). */
export async function loadProfiles(emails: readonly string[], max = 120) {
    const unique = [...new Set(emails)].filter((email) => email && !email.includes("/")).slice(0, max);
    const entries = await mapLimit(unique, 10, async (email) => [email, await getServerDocument<PublicProfile>(`public_profiles/${email}`).catch(() => null)] as const);
    return new Map<string, PublicProfile | null>(entries);
}

export function profileName(email: string, profile: PublicProfile | null | undefined) {
    const name = typeof profile?.username === "string" ? profile.username.trim() : "";
    return (name || email.split("@")[0] || "Hanogt").slice(0, 60);
}

export function profileAvatar(profile: PublicProfile | null | undefined) {
    return typeof profile?.avatarUrl === "string" && profile.avatarUrl ? profile.avatarUrl : null;
}

/** Online, idle or do-not-disturb: anything but offline (Discord-style presence, lib/presence.ts). */
export function profileOnline(profile: PublicProfile | null | undefined, now = Date.now()) {
    return profileStatus(profile, now) !== "offline";
}

export function profileStatus(profile: PublicProfile | null | undefined, now = Date.now()): PresenceStatus {
    return effectiveStatus(profile, now);
}

/** `nickname#tag` parts of a profile ("" when the profile has none). */
export function profileTag(profile: PublicProfile | null | undefined) {
    const nickname = typeof profile?.nickname === "string" ? profile.nickname.trim().slice(0, 100) : "";
    const nicknameTag = typeof profile?.nicknameTag === "string" && /^[0-9]{4}$/.test(profile.nicknameTag) ? profile.nicknameTag : "";
    return nickname && nicknameTag ? { nickname, nicknameTag } : { nickname: "", nicknameTag: "" };
}

const STAFF_ROLES = ["owner", "admin", "moderator"] as const;

/** Hanogt team badge of a member (GroupMemberInfo.staffRole); any other stored value means none. */
export function profileStaffRole(profile: PublicProfile | null | undefined): GroupMemberInfo["staffRole"] {
    return STAFF_ROLES.find((role) => role === profile?.staffRole) ?? null;
}

/** Display name of the signed-in user for system messages. */
export async function ownDisplayName(user: GroupUser) {
    const profile = await getServerDocument<PublicProfile>(`public_profiles/${user.email}`).catch(() => null);
    const sessionName = typeof user.session?.user?.name === "string" ? user.session.user.name.trim() : "";
    return profile?.username?.trim() || sessionName || user.email.split("@")[0];
}

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Removes a member (and with `ban` keeps them from rejoining): moderators
 * remove people below them, only owners and admins block, nobody touches
 * the owner. Used by Members › Remove and the Security Bot's /at, /yasakla.
 */
export async function removeGroupMember(groupId: string, actorEmail: string, targetEmail: string, ban: boolean) {
    if (targetEmail === actorEmail) throw new GroupApiError(400, "self_action", "Kendinizi çıkaramazsınız; bunun yerine gruptan ayrılın.");
    const result = await retryOnConflict(async () => {
        const { group, role } = await requireGroupMember(groupId, actorEmail);
        if (ban && !isManagerRole(role)) throw new GroupApiError(403, "forbidden", "Engellemeyi yalnızca grup sahibi ve yöneticiler yapabilir.");
        requireModerator(role);
        if (targetEmail === group.ownerEmail) throw new GroupApiError(403, "cannot_remove_owner", "Grup sahibi gruptan çıkarılamaz.");
        const targetRole = roleOf(group, targetEmail);
        if (!targetRole) throw new GroupApiError(404, "target_not_member", "Bu kullanıcı grubun üyesi değil.");
        if (!outranks(role, targetRole)) {
            throw targetRole === "admin"
                ? new GroupApiError(403, "cannot_remove_admin", "Yöneticileri yalnızca grup sahibi çıkarabilir.")
                : new GroupApiError(403, "cannot_moderate", "Bu kişiye bu işlemi uygulayamazsınız.");
        }
        const now = new Date();
        await commitServerPatches([
            {
                path: `groups/${groupId}`,
                data: {
                    members: groupMembers(group).filter((entry) => entry !== targetEmail),
                    admins: groupAdmins(group).filter((entry) => entry !== targetEmail),
                    moderators: groupModerators(group).filter((entry) => entry !== targetEmail),
                    updatedAt: now,
                },
                // Their typing state and rules acceptance go with them.
                updateFields: ["members", "admins", "moderators", "updatedAt", `typing.${memberKey(groupId, targetEmail)}`, rulesAcceptedField(groupId, targetEmail)],
                updateTime: group._updateTime,
            },
            ...(ban ? [{ path: `group_bans/${banDocumentId(groupId, targetEmail)}`, data: { groupId, email: targetEmail, bannedBy: actorEmail, createdAt: now } }] : []),
        ]);
        return { group, targetRole };
    });
    await deleteServerDocument(`group_invites/${inviteDocumentId(groupId, targetEmail)}`).catch(() => undefined);
    // Their stars here kept a few words of messages they can no longer open.
    await forgetMemberStars(targetEmail, groupId).catch(() => undefined);
    await removeFromVoice(groupId, targetEmail).catch(() => undefined);
    return result;
}

/**
 * Takes a member out of the group on their own (owners can't leave): roles,
 * typing state and rules acceptance go with the membership. Returns the
 * group as it was, for the notice in its language.
 */
export async function leaveGroupMembership(groupId: string, email: string) {
    return retryOnConflict(async () => {
        const { group, role } = await requireGroupMember(groupId, email);
        if (role === "owner") throw new GroupApiError(409, "owner_cannot_leave", "Grup sahibi ayrılmadan önce sahipliği devretmeli veya grubu silmelidir.");
        await patchServerDocument(`groups/${groupId}`, {
            members: groupMembers(group).filter((entry) => entry !== email),
            admins: groupAdmins(group).filter((entry) => entry !== email),
            moderators: groupModerators(group).filter((entry) => entry !== email),
            updatedAt: new Date(),
        }, { updateFields: ["members", "admins", "moderators", "updatedAt", `typing.${memberKey(groupId, email)}`, rulesAcceptedField(groupId, email)], updateTime: group._updateTime });
        return group;
    });
}

/* -------------------------------------------------------------------------- */
/* Side effects                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Posts a platform message ("X joined"). The stored text is a fallback in the
 * group's language; clients render `event` + `vars` in the reader's language.
 * Best effort: a failed notice must not fail the action that triggered it.
 */
export async function postSystemMessage(groupId: string, group: StoredGroup, event: Exclude<GroupSystemEvent, "welcome">, vars: Record<string, string>) {
    const copy = GROUP_SYSTEM_EVENT_COPY[event];
    const text = fillVars(groupLanguage(group) === "en" ? copy.EN : copy.TR, vars).slice(0, GROUP_LIMITS.messageMax);
    await createServerDocument(`groups/${groupId}/messages`, {
        fromEmail: SYSTEM_SENDER,
        author: "Hanogt",
        authorAvatar: null,
        type: "system",
        event,
        vars,
        text,
        createdAt: new Date(),
    }).catch((error: unknown) => console.warn("[groups] system message failed:", error instanceof Error ? error.message : "unknown error"));
}

async function deleteInBatches(paths: string[]) {
    for (let index = 0; index < paths.length; index += 400) {
        await commitServerMutations(paths.slice(index, index + 400).map((path) => ({ type: "delete" as const, path })));
    }
}

/** Deletes files and messages (with their voice recordings and message files) of a group. */
async function deleteGroupContent(groupId: string) {
    const [files, messages] = await Promise.all([
        listServerCollection(`groups/${groupId}/files`, 300),
        listServerCollection<{ voicePath?: unknown }>(`groups/${groupId}/messages`, 1000),
    ]);
    // Voice paths are written by clients: only recordings inside this group's own folder are deleted.
    // A recording that can't be deleted keeps its message (and the group) for the next attempt.
    await mapLimit(messages, 8, async (message) => {
        const path = safeGroupVoicePath(message.voicePath, groupId);
        if (path) await deleteVoiceRecording(path);
    });
    // Files sent in the group's messages (they free their senders' space).
    await deleteContainerFiles(`group:${groupId}`);
    await deleteInBatches([...files, ...messages].map((document) => document._path));
}

/**
 * Deletes a group with everything that belongs to it. The group document goes
 * last, so a run that fails half-way leaves a working group the owner can
 * delete again; a second sweep removes anything members wrote meanwhile.
 */
export async function deleteGroupCascade(groupId: string) {
    await deleteGroupContent(groupId);
    const records = await Promise.all(["group_invites", "group_invite_links", "group_bans", "group_mutes", "group_warnings", "group_reports", "automod_events"]
        .map((collectionId) => queryServerCollection(collectionId, "groupId", "EQUAL", groupId, { limit: 1000 })));
    await deleteInBatches([...records.flat().map((document) => document._path), `group_automod/${groupId}`]);
    await deleteGroupVoice(groupId);
    // Members' stars here kept a few words of the group's messages.
    await forgetPlaceStars("group", groupId);
    await deleteServerDocument(`groups/${groupId}`);
    // Members could still write until the group document disappeared (the rules check it).
    await deleteGroupContent(groupId).catch(() => undefined);
}
