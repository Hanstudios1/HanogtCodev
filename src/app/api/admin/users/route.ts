import type { NextRequest } from "next/server";
import {
    ASSIGNABLE_ROLES,
    SUSPEND_REASON_MAX,
    type AdminUser,
    type AdminUserActionResponse,
    type AdminUsersResponse,
} from "@/components/Admin/types";
import {
    AdminHttpError,
    adminError,
    adminFailure,
    adminJson,
    adminPermissions,
    auditLogPatch,
    authorizeAdminRequest,
    httpsUrlOrNull,
    parseStoredRole,
    readAdminBody,
    readText,
    requireEmail,
    requireEnum,
    resolveUserRole,
    staffBadgeFor,
    stringOr,
    syncStaffRoleBadge,
    toIso,
    userManagementPolicy,
    writeAuditLog,
    type AdminQueryFilter,
    type AdminSession,
} from "@/lib/server/admin";
import {
    DELETION_SCOPES,
    deleteAccountData,
    deletionTotal,
    largestCounts,
    type AccountDeletionResult,
} from "@/lib/server/account-deletion";
import { decodeCursor, newestPage } from "@/lib/server/admin-pages";
import { commitServerPatches, deleteFirebaseAuthUser, getServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { TWO_FACTOR_FIELDS } from "@/lib/server/two-factor";
import { normalizeEmail } from "@/lib/server/validate";

export const runtime = "nodejs";
// Deleting a large account's data takes many Firestore round trips.
export const maxDuration = 60;

const PAGE_SIZE = 25;
const ONLINE_WINDOW_MS = 2 * 60_000;
// Never select credentials, friend lists or settings: only what the panel shows.
const USER_FIELDS = [
    "email", "username", "nickname", "nicknameTag", "avatarUrl", "provider", "createdAt", "lastLoginAt", "lastSeenAt",
    "isOnline", "suspended", "banned", "suspendedAt", "suspendedBy", "suspendReason", "unsuspendedAt", "role", "twoFactorEnabled",
    // A flag, not the credential: the "Remove password" action needs it in lists too.
    "hasPassword",
];
const ACTIONS = ["suspend", "unsuspend", "setRole", "reset2fa", "removePassword", "deleteData"] as const;
const DELETE_DATA_PER_HOUR = 10;
const UNSAFE_QUERY = /[\u0000-\u001f\u007f]/;

type UserRecord = Record<string, unknown> & { _id: string };
/** AdminUser plus when an earlier suspension was lifted (shown as "suspended before"). */
type AdminUserRow = AdminUser & { unsuspendedAt: string | null };

function toAdminUser(record: Record<string, unknown>, email: string, actor: AdminSession): AdminUserRow {
    const role = resolveUserRole(email, record.role);
    const policy = userManagementPolicy(actor, { email, role });
    const lastSeenAt = toIso(record.lastSeenAt);
    return {
        email,
        username: stringOr(record.username, "", 100),
        nickname: stringOr(record.nickname, "", 100),
        nicknameTag: stringOr(record.nicknameTag, "", 10),
        avatarUrl: httpsUrlOrNull(record.avatarUrl),
        provider: typeof record.provider === "string" ? record.provider.slice(0, 30) : null,
        createdAt: toIso(record.createdAt),
        lastLoginAt: toIso(record.lastLoginAt),
        lastSeenAt,
        // Presence can stay "online" after a crashed tab; trust it only while fresh.
        isOnline: record.isOnline === true && Boolean(lastSeenAt) && Date.now() - Date.parse(lastSeenAt ?? "") < ONLINE_WINDOW_MS,
        role,
        isOwner: role === "owner",
        suspended: record.suspended === true || record.banned === true,
        suspendedAt: toIso(record.suspendedAt),
        suspendedBy: typeof record.suspendedBy === "string" ? record.suspendedBy.slice(0, 254) : null,
        suspendReason: typeof record.suspendReason === "string" ? record.suspendReason.slice(0, SUSPEND_REASON_MAX) : null,
        unsuspendedAt: toIso(record.unsuspendedAt),
        twoFactorEnabled: record.twoFactorEnabled === true,
        hasPassword: record.hasPassword === true || typeof record.password === "string",
        canSuspend: policy.canSuspend,
        assignableRoles: policy.assignableRoles,
    };
}

function compareCodeUnits(a: string, b: string) {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** Usernames are case-sensitive in Firestore: try the typed, lower-case and capitalized forms. */
function prefixVariants(query: string) {
    const capitalize = (value: string, locale: string) => value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
    const lowerTr = query.toLocaleLowerCase("tr");
    const lowerEn = query.toLowerCase();
    return [...new Set([query, lowerTr, lowerEn, capitalize(lowerTr, "tr"), capitalize(lowerEn, "en")])];
}

async function searchByUsername(query: string, cursor: string | null) {
    const variants = prefixVariants(query);
    const results = await Promise.all(variants.map((variant) => {
        // Results are merged in code point order, so each range continues after the cursor.
        const lowerBound: AdminQueryFilter = cursor && cursor >= variant
            ? { field: "username", op: "GREATER_THAN", value: cursor }
            : { field: "username", op: "GREATER_THAN_OR_EQUAL", value: variant };
        return runServerQuery<Record<string, unknown>>({
            collectionId: "users",
            where: [lowerBound, { field: "username", op: "LESS_THAN", value: `${variant}` }],
            orderBy: [{ field: "username", direction: "ASCENDING" }],
            select: USER_FIELDS,
            limit: PAGE_SIZE + 1,
        });
    }));
    const unique = new Map<string, UserRecord>();
    for (const record of results.flat()) unique.set(record._id, record);
    const name = (record: UserRecord) => String(record.username ?? "");
    const sorted = [...unique.values()].sort((a, b) => compareCodeUnits(name(a), name(b)) || compareCodeUnits(a._id, b._id));
    const hasMore = sorted.length > PAGE_SIZE || results.some((list) => list.length > PAGE_SIZE);
    if (!hasMore || !sorted.length) return { records: sorted, nextCursor: null };
    const lastName = name(sorted[Math.min(PAGE_SIZE, sorted.length) - 1]);
    // The cursor is a username, so users sharing the last name stay on this page.
    const page = sorted.filter((record, index) => index < PAGE_SIZE || name(record) === lastName);
    return { records: page, nextCursor: lastName };
}

/** Newest accounts first; the cursor holds the time and the document, so equal times never skip anyone. */
async function listRecent(rawCursor: string | null) {
    const cursor = rawCursor ? decodeCursor(rawCursor, "users") : null;
    if (rawCursor && !cursor) throw new AdminHttpError(400, "invalid_cursor");
    const { items, nextCursor } = await newestPage<Record<string, unknown>>({ collectionId: "users", field: "createdAt", select: USER_FIELDS, limit: PAGE_SIZE, cursor });
    return { records: items, nextCursor };
}

/** Users by exact e-mail, username prefix, or newest first (no query). */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin" });
    if (!guard.ok) return guard.response;
    try {
        const params = request.nextUrl.searchParams;
        const query = (params.get("query") ?? "").trim();
        const cursor = params.get("cursor") || null;
        if (query.length > 120 || UNSAFE_QUERY.test(query)) throw new AdminHttpError(400, "invalid_query");
        if (cursor && (cursor.length > 200 || UNSAFE_QUERY.test(cursor))) throw new AdminHttpError(400, "invalid_cursor");

        let payload: AdminUsersResponse;
        if (query.includes("@")) {
            const email = normalizeEmail(query);
            // An "@" means an e-mail search: say when it isn't one rather than "no matching users".
            if (!email) throw new AdminHttpError(400, "invalid_email");
            const record = await getServerDocument<Record<string, unknown>>(`users/${email}`);
            payload = { items: record ? [toAdminUser(record, email, guard.admin)] : [], nextCursor: null, mode: "email" };
        } else if (query) {
            const { records, nextCursor } = await searchByUsername(query, cursor);
            payload = { items: records.map((record) => toAdminUser(record, record._id, guard.admin)), nextCursor, mode: "username" };
        } else {
            const { records, nextCursor } = await listRecent(cursor);
            payload = { items: records.map((record) => toAdminUser(record, record._id, guard.admin)), nextCursor, mode: "recent" };
        }
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "users:get");
    }
}

/**
 * Permanently deletes a user's data: "all" removes the account too, "content"
 * only what other people can see (see lib/server/account-deletion.ts). Same
 * targets as suspending; the reason and a typed confirmation are required.
 */
async function deleteUserData(actor: AdminSession, email: string, body: Record<string, unknown>, reason: string) {
    if (!adminPermissions(actor.role).deleteUserData) throw new AdminHttpError(403, "forbidden");
    const scope = requireEnum(body.scope, DELETION_SCOPES, "invalid_action");
    if (typeof body.confirm !== "string" || body.confirm.trim().toLowerCase() !== email) throw new AdminHttpError(400, "confirmation_mismatch");
    if (!reason) throw new AdminHttpError(400, "text_required");
    // No user document is fine: an earlier run may have deleted the account but left other data behind.
    const record = await getServerDocument<Record<string, unknown>>(`users/${email}`);
    const role = resolveUserRole(email, record?.role);
    const policy = userManagementPolicy(actor, { email, role });
    if (policy.denial) throw new AdminHttpError(403, policy.denial);

    const rate = await enforceRateLimitWithFallback(`admin:delete-data:${actor.email}`, DELETE_DATA_PER_HOUR, 60 * 60_000);
    if (!rate.allowed) return adminError(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });

    const target = `users/${email}`;
    // Logged before anything is deleted, so a run that is cut short still shows who started it.
    await writeAuditLog(actor.email, "user.delete_data", target, { email, scope, role, reason, status: "started", accountExists: Boolean(record) });
    const summary = await deleteAccountData(email, { scope });
    try {
        await writeAuditLog(actor.email, "user.delete_data", target, {
            email,
            scope,
            reason,
            status: summary.errors.length ? "partial" : "complete",
            accountDeleted: summary.accountDeleted,
            total: deletionTotal(summary.deleted),
            errors: summary.errors.length,
            // An audit entry keeps at most 16 fields: the largest counts fill the rest.
            ...largestCounts(summary.deleted, 9),
        });
    } catch (error) {
        console.error("[admin:users] delete_data result was not logged:", error instanceof Error ? error.message : error);
    }
    const response: AccountDeletionResult = { email, scope, ...summary };
    return adminJson(response);
}

/** Suspend / unsuspend an account, change its staff role, reset its two-step verification or delete its data. */
export async function POST(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin", mutation: true });
    if (!guard.ok) return guard.response;
    const actor = guard.admin;
    try {
        const body = await readAdminBody(request, ["action", "email", "reason", "role", "scope", "confirm"]);
        const action = requireEnum(body.action, ACTIONS, "invalid_action");
        const email = requireEmail(body.email);
        if (action !== "setRole" && body.role !== undefined) throw new AdminHttpError(400, "unknown_field");
        if (action !== "deleteData" && (body.scope !== undefined || body.confirm !== undefined)) throw new AdminHttpError(400, "unknown_field");
        const reason = readText(body.reason, { max: SUSPEND_REASON_MAX, multiline: true });
        if (action === "deleteData") return await deleteUserData(actor, email, body, reason);

        const record = await getServerDocument<Record<string, unknown>>(`users/${email}`);
        if (!record) throw new AdminHttpError(404, "user_not_found");
        const currentRole = resolveUserRole(email, record.role);
        const policy = userManagementPolicy(actor, { email, role: currentRole });
        const target = `users/${email}`;
        const now = new Date();

        if (action === "suspend" || action === "unsuspend") {
            if (!policy.canSuspend) throw new AdminHttpError(403, policy.denial ?? "forbidden");
            const suspended = record.suspended === true || record.banned === true;

            if (action === "suspend") {
                if (suspended) throw new AdminHttpError(409, "already_suspended");
                const update = { suspended: true, suspendedAt: now, suspendedBy: actor.email, suspendReason: reason || null };
                await commitServerPatches([
                    { path: target, data: update, updateFields: Object.keys(update), exists: true },
                    auditLogPatch(actor.email, "user.suspend", target, { email, role: currentRole, reason: reason || null }),
                ]);
                // getActiveSession and sign-in already refuse the account; deleting its
                // Firebase Auth record also stops client-side Firestore access once the
                // current ID token expires (the record is recreated on the next sign-in).
                let sessionsRevoked = false;
                try {
                    await deleteFirebaseAuthUser(email);
                    sessionsRevoked = true;
                } catch (error) {
                    console.warn("[admin:users] Firebase session revocation failed:", error instanceof Error ? error.message : error);
                }
                const response: AdminUserActionResponse = {
                    user: toAdminUser({ ...record, ...update, suspendedAt: now.toISOString() }, email, actor),
                    sessionsRevoked,
                };
                return adminJson(response);
            }

            if (!suspended) throw new AdminHttpError(409, "not_suspended");
            await commitServerPatches([
                {
                    path: target,
                    // Fields listed in updateFields but missing from data are removed.
                    data: { suspended: false, banned: false, unsuspendedAt: now },
                    updateFields: ["suspended", "banned", "unsuspendedAt", "suspendedAt", "suspendedBy", "suspendReason"],
                    exists: true,
                },
                auditLogPatch(actor.email, "user.unsuspend", target, { email, reason: reason || null, clearedLegacyBan: record.banned === true }),
            ]);
            const response: AdminUserActionResponse = {
                user: toAdminUser({ ...record, suspended: false, banned: false, suspendedAt: null, suspendedBy: null, suspendReason: null, unsuspendedAt: now.toISOString() }, email, actor),
            };
            return adminJson(response);
        }

        if (action === "reset2fa") {
            // For people who lost both their authenticator and their recovery codes.
            // Same authority as suspending, and the reason is mandatory.
            if (!policy.canSuspend) throw new AdminHttpError(403, policy.denial ?? "forbidden");
            if (record.twoFactorEnabled !== true) throw new AdminHttpError(409, "no_change");
            if (!reason) throw new AdminHttpError(400, "text_required");
            await commitServerPatches([
                // Every 2FA field is in the mask and none in the data: all are removed.
                { path: `credentials/${email}`, data: {}, updateFields: TWO_FACTOR_FIELDS },
                { path: target, data: { twoFactorEnabled: false, twoFactorUpdatedAt: now }, updateFields: ["twoFactorEnabled", "twoFactorUpdatedAt"], exists: true },
                auditLogPatch(actor.email, "user.reset_2fa", target, { email, reason }),
            ]);
            const response: AdminUserActionResponse = { user: toAdminUser({ ...record, twoFactorEnabled: false }, email, actor) };
            return adminJson(response);
        }

        if (action === "removePassword") {
            // For someone signed in with Google who forgot the password the account also has
            // (a "password recovery" ticket from /login/verify): a Google sign-in is enough again.
            // Two-step verification goes with it (it protects password sign-ins).
            if (!policy.canSuspend) throw new AdminHttpError(403, policy.denial ?? "forbidden");
            const credential = await getServerDocument<{ passwordHash?: unknown }>(`credentials/${email}`);
            if (!credential?.passwordHash && typeof record.password !== "string") throw new AdminHttpError(409, "no_change");
            if (!reason) throw new AdminHttpError(400, "text_required");
            await commitServerPatches([
                { path: `credentials/${email}`, data: {}, updateFields: ["passwordHash", ...TWO_FACTOR_FIELDS] },
                {
                    path: target,
                    data: { hasPassword: false, twoFactorEnabled: false, passwordRemovedAt: now },
                    updateFields: ["hasPassword", "twoFactorEnabled", "passwordRemovedAt", "password", "passwordHash"],
                    exists: true,
                },
                auditLogPatch(actor.email, "user.remove_password", target, { email, reason }),
            ]);
            const response: AdminUserActionResponse = { user: toAdminUser({ ...record, hasPassword: false, twoFactorEnabled: false, password: undefined }, email, actor) };
            return adminJson(response);
        }

        const role = requireEnum(body.role, ASSIGNABLE_ROLES, "invalid_role");
        if (policy.denial) throw new AdminHttpError(403, policy.denial);
        if (!policy.assignableRoles.includes(role)) throw new AdminHttpError(403, "insufficient_role");
        const storedRole = parseStoredRole(record.role) ?? "user";
        if (storedRole === role) throw new AdminHttpError(409, "no_change");
        const stored = role === "user" ? undefined : role;
        await commitServerPatches([
            { path: target, data: { role: stored, roleUpdatedAt: now }, updateFields: ["role", "roleUpdatedAt"], exists: true },
            auditLogPatch(actor.email, "user.set_role", target, { email, from: storedRole, to: role, reason: reason || null }),
        ]);
        // The public staff badge follows the role. Best effort: staff get it
        // repaired by GET /api/admin/me, everyone by their next Google sign-in.
        await syncStaffRoleBadge(email, staffBadgeFor(email, stored)).catch((error: unknown) => {
            console.warn("[admin:users] staff badge sync failed:", error instanceof Error ? error.message : error);
        });
        const response: AdminUserActionResponse = { user: toAdminUser({ ...record, role: stored }, email, actor) };
        return adminJson(response);
    } catch (error) {
        return adminFailure(error, "users:post");
    }
}
