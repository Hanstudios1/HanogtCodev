import "server-only";

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import {
    commitServerMutations,
    createServerDocument,
    deleteServerDocument,
    deleteServerStorageObject,
    getServerDocument,
    listServerCollection,
    queryServerCollection,
} from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { effectiveStatus, type PresenceStatus } from "@/lib/presence";
import {
    GROUP_LIMITS,
    GROUP_SYSTEM_EVENT_COPY,
    SYSTEM_SENDER,
    fillVars,
    groupColor,
    groupEmoji,
    isGroupId,
    isGroupTemplateId,
    isInviteToken,
    isMemberKey,
    normalizeGroupEmail,
    safeGroupVoicePath,
    toMillis,
    type GroupErrorCode,
    type GroupInfo,
    type GroupMemberInfo,
    type GroupRole,
    type GroupSystemEvent,
} from "@/lib/groups";

/* -------------------------------------------------------------------------- */
/* Errors and responses                                                       */
/* -------------------------------------------------------------------------- */

/** Expected failures: the message is Turkish (primary language), the code is translated by the UI. */
export class GroupApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: GroupErrorCode,
        message: string,
        public readonly headers: Record<string, string> = {},
    ) {
        super(message);
        this.name = "GroupApiError";
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
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders(error.headers) });
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
        throw new GroupApiError(429, "rate_limited", "Çok fazla grup işlemi. Biraz sonra tekrar deneyin.", { "Retry-After": String(result.retryAfterSeconds) });
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
    rules?: string;
    topics?: unknown;
    template?: string;
    contentLanguage?: string;
    pinnedMessageIds?: unknown;
    allowMemberInvites?: boolean;
    onboarding?: { dismissed?: boolean; callStarted?: boolean };
    typing?: Record<string, unknown>;
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

export function roleOf(group: StoredGroup, email: string): GroupRole | null {
    if (!email || !groupMembers(group).includes(email)) return null;
    if (group.ownerEmail === email) return "owner";
    if (groupAdmins(group).includes(email)) return "admin";
    return "member";
}

/** Owner first, then admins, then members in join order. */
export function orderedMembers(group: StoredGroup) {
    const members = groupMembers(group);
    const admins = new Set(groupAdmins(group));
    const rank = (email: string) => (email === group.ownerEmail ? 0 : admins.has(email) ? 1 : 2);
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

export function requireOwner(role: GroupRole) {
    if (role !== "owner") throw new GroupApiError(403, "forbidden", "Bu işlemi yalnızca grup sahibi yapabilir.");
}

export function groupLanguage(group: StoredGroup) {
    return group.contentLanguage === "en" ? "en" : "tr";
}

/** The client-facing view of a group document (internal fields such as typing state stay out). */
export function publicGroup(groupId: string, group: StoredGroup): GroupInfo {
    return {
        id: groupId,
        name: group.name || "Hanogt",
        description: group.description || "",
        emoji: groupEmoji(group.emoji),
        color: groupColor(group.color),
        rules: group.rules || "",
        topics: strings(group.topics).slice(0, GROUP_LIMITS.topicsMax),
        template: isGroupTemplateId(group.template) ? group.template : null,
        contentLanguage: groupLanguage(group),
        ownerEmail: group.ownerEmail || "",
        admins: groupAdmins(group),
        members: groupMembers(group),
        projectName: group.projectName || "",
        createdAt: group.createdAt || null,
        updatedAt: group.updatedAt || group.createdAt || null,
        pinnedMessageIds: strings(group.pinnedMessageIds).filter(isGroupId).slice(0, GROUP_LIMITS.pinnedMax),
        allowMemberInvites: group.allowMemberInvites !== false,
        // Groups created before the checklist existed start with it hidden (it can be reopened in settings).
        onboarding: group.onboarding ? { dismissed: Boolean(group.onboarding.dismissed), callStarted: Boolean(group.onboarding.callStarted) } : { dismissed: true, callStarted: false },
    };
}

/**
 * Pseudonymous, per-group member key used for reactions and typing state, so
 * message documents never store e-mail addresses of the people who reacted.
 */
export function memberKey(groupId: string, email: string) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || "hanogt";
    return `k${createHash("sha256").update(`${salt}:group-member:${groupId}:${email}`).digest("hex").slice(0, 20)}`;
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
    statusEmoji?: string;
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

/** Deletes files and messages (with their voice recordings) of a group. */
async function deleteGroupContent(groupId: string) {
    const [files, messages] = await Promise.all([
        listServerCollection(`groups/${groupId}/files`, 300),
        listServerCollection<{ voicePath?: unknown }>(`groups/${groupId}/messages`, 1000),
    ]);
    // Voice paths are written by clients: only objects inside this group's own folder are deleted.
    await mapLimit(messages, 8, async (message) => {
        const path = safeGroupVoicePath(message.voicePath, groupId);
        if (path) await deleteServerStorageObject(path).catch(() => undefined);
    });
    await deleteInBatches([...files, ...messages].map((document) => document._path));
}

/**
 * Deletes a group with everything that belongs to it. The group document goes
 * last, so a run that fails half-way leaves a working group the owner can
 * delete again; a second sweep removes anything members wrote meanwhile.
 */
export async function deleteGroupCascade(groupId: string) {
    await deleteGroupContent(groupId);
    const [invites, links, bans] = await Promise.all([
        queryServerCollection("group_invites", "groupId", "EQUAL", groupId, { limit: 1000 }),
        queryServerCollection("group_invite_links", "groupId", "EQUAL", groupId, { limit: 1000 }),
        queryServerCollection("group_bans", "groupId", "EQUAL", groupId, { limit: 1000 }),
    ]);
    await deleteInBatches([...invites, ...links, ...bans].map((document) => document._path));
    await deleteServerDocument(`groups/${groupId}`);
    // Members could still write until the group document disappeared (the rules check it).
    await deleteGroupContent(groupId).catch(() => undefined);
}
