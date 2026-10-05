import type { NextRequest } from "next/server";
import {
    ADMIN_TICKET_PAGE_SIZE,
    ADMIN_TICKET_QUERY_MAX,
    TICKET_STATUS_FILTERS,
    type AdminTicketActionResponse,
    type AdminTicketDetail,
    type AdminTicketDetailResponse,
    type AdminTicketErrorCode,
    type AdminTicketListItem,
    type AdminTicketSender,
    type AdminTicketViewer,
    type AdminTicketsResponse,
    type TicketSenderProfile,
    type TicketStatusFilter,
} from "@/components/Admin/tickets-types";
import {
    AdminHttpError,
    adminFailure,
    adminJson,
    adminPermissions,
    auditLogMutation,
    authorizeAdminRequest,
    readAdminBody,
    requireDocId,
    requireEnum,
    resolveUserRole,
    stringOr,
    toIso,
    withConflictRetry,
    type AdminQueryFilter,
    type AdminSession,
} from "@/lib/server/admin";
import { commitServerMutations, getServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import {
    TICKETS_COLLECTION,
    TICKET_LIST_FIELDS,
    getUserRecord,
    isMissingIndex,
    lastMessageFields,
    newTicketMessage,
    readTicketMessages,
    removeStaffTicketNotifications,
    ticketPriority,
    ticketReplyNotification,
    ticketStatus,
    toAdminDetail as baseAdminDetail,
    toAdminListItem as baseAdminListItem,
    type StoredTicket,
    type TicketRecord,
} from "@/lib/server/support";
import { normalizeEmail } from "@/lib/server/validate";
import {
    ACTIVE_TICKET_STATUSES,
    TEAM_AUTHOR_NAME,
    TICKET_LIMITS,
    TICKET_STATUSES,
    accountAgeDays,
    evaluateUserRecord,
    isStoredTicketCategory,
    isTicketPriority,
    matchesSearch,
    statusAfterStaffReply,
    validateTicketMessage,
    type TicketStatus,
    type UserRecordFacts,
} from "@/lib/support";

export const runtime = "nodejs";

const ACTIONS = ["reply", "setStatus", "setPriority", "delete", "markRead"] as const;
/** Records scanned per request while searching (the search runs on top of the filters). */
const SEARCH_SCAN_LIMIT = 400;
const UNSAFE_QUERY = /[\u0000-\u001f\u007f]/;

const TICKET_ERROR_MESSAGES: Record<AdminTicketErrorCode, string> = {
    invalid_priority: "Geçersiz öncelik.",
    invalid_category: "Geçersiz kategori.",
    thread_full: "Konuşma mesaj sınırına ulaştı.",
};

/**
 * Errors whose codes are specific to tickets (not part of AdminErrorCode).
 * `httpStatus` rather than `status`: withConflictRetry reads a `status` of 409
 * as a Firestore write conflict and would retry it.
 */
class TicketRouteError extends Error {
    httpStatus: number;
    code: AdminTicketErrorCode;

    constructor(httpStatus: number, code: AdminTicketErrorCode) {
        super(TICKET_ERROR_MESSAGES[code]);
        this.name = "TicketRouteError";
        this.httpStatus = httpStatus;
        this.code = code;
    }
}

function failure(error: unknown, context: string) {
    if (error instanceof TicketRouteError) return adminJson({ error: error.message, code: error.code }, error.httpStatus);
    return adminFailure(error, context);
}

function viewerFor(admin: AdminSession): AdminTicketViewer {
    return { manageUsers: adminPermissions(admin.role).manageUsers };
}

/** 2FA recovery requests from the login page (/api/support/two-factor-recovery) carry meta.twoFactorRecovery. */
function isTwoFactorRecovery(record: TicketRecord) {
    const meta = record.meta && typeof record.meta === "object" && !Array.isArray(record.meta) ? record.meta as Record<string, unknown> : null;
    return meta?.twoFactorRecovery === true;
}

/** Forgotten-password requests from /login/verify (/api/support/password-recovery) carry meta.passwordRecovery. */
function isPasswordRecovery(record: TicketRecord) {
    const meta = record.meta && typeof record.meta === "object" && !Array.isArray(record.meta) ? record.meta as Record<string, unknown> : null;
    return meta?.passwordRecovery === true;
}

// Every list item and detail this route returns carries the recovery flags for the badges.
function toAdminListItem(record: StoredTicket): AdminTicketListItem {
    return { ...baseAdminListItem(record), twoFactorRecovery: isTwoFactorRecovery(record), passwordRecovery: isPasswordRecovery(record) };
}

function toAdminDetail(record: StoredTicket): AdminTicketDetail {
    return { ...baseAdminDetail(record), twoFactorRecovery: isTwoFactorRecovery(record), passwordRecovery: isPasswordRecovery(record) };
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

type Cursor = { time: number; id: string };

function readCursor(value: string | null): Cursor | null {
    if (!value) return null;
    const match = /^(\d{1,15})_([A-Za-z0-9_-]{1,64})$/.exec(value);
    if (!match) throw new AdminHttpError(400, "invalid_cursor");
    return { time: Number(match[1]), id: match[2] };
}

function lastMessageTime(record: TicketRecord) {
    return Date.parse(toIso(record.lastMessageAt) ?? toIso(record.createdAt) ?? "") || 0;
}

function cursorOf(record: StoredTicket) {
    return `${lastMessageTime(record)}_${record._id}`;
}

/** Newest activity first; ties by id, descending, the order Firestore uses for a descending sort. */
function compareRecords(a: StoredTicket, b: StoredTicket) {
    return lastMessageTime(b) - lastMessageTime(a) || (a._id < b._id ? 1 : a._id > b._id ? -1 : 0);
}

/** Records strictly after the cursor (the cursor record itself was on the previous page). */
function afterCursor(records: StoredTicket[], cursor: Cursor | null) {
    if (!cursor) return records;
    return records.filter((record) => {
        const time = lastMessageTime(record);
        return time < cursor.time || (time === cursor.time && record._id < cursor.id);
    });
}

async function queryInbox(filters: AdminQueryFilter[], cursor: Cursor | null, limit: number): Promise<StoredTicket[]> {
    try {
        const records = await runServerQuery<TicketRecord>({
            collectionId: TICKETS_COLLECTION,
            where: cursor ? [...filters, { field: "lastMessageAt", op: "LESS_THAN_OR_EQUAL", value: new Date(cursor.time) }] : filters,
            orderBy: [{ field: "lastMessageAt", direction: "DESCENDING" }],
            select: TICKET_LIST_FIELDS,
            // Extra room for records that share the cursor's timestamp.
            limit: limit + (cursor ? 10 : 0),
        });
        return afterCursor(records, cursor).slice(0, limit);
    } catch (error) {
        if (!isMissingIndex(error)) throw error;
        // A composite index isn't deployed yet: equality filters only, ordered here.
        const records = await runServerQuery<TicketRecord>({ collectionId: TICKETS_COLLECTION, where: filters, select: TICKET_LIST_FIELDS, limit: 1_000 });
        return afterCursor(records.sort(compareRecords), cursor).slice(0, limit);
    }
}

function inboxFilters(params: URLSearchParams) {
    const status = (params.get("status") || "active") as TicketStatusFilter;
    if (!TICKET_STATUS_FILTERS.includes(status)) throw new AdminHttpError(400, "invalid_status");
    // Legacy categories (bug, account, other) stay filterable; "all" includes them.
    const category = params.get("category") || "all";
    if (category !== "all" && !isStoredTicketCategory(category)) throw new TicketRouteError(400, "invalid_category");
    const priority = params.get("priority") || "all";
    if (priority !== "all" && !isTicketPriority(priority)) throw new TicketRouteError(400, "invalid_priority");

    const filters: AdminQueryFilter[] = [];
    if (status === "active") filters.push({ field: "status", op: "IN", value: [...ACTIVE_TICKET_STATUSES] });
    else if (status !== "all") filters.push({ field: "status", op: "EQUAL", value: status });
    if (category !== "all") filters.push({ field: "category", op: "EQUAL", value: category });
    if (priority !== "all") filters.push({ field: "priority", op: "EQUAL", value: priority });
    if (params.get("unread") === "1") filters.push({ field: "unreadForStaff", op: "EQUAL", value: true });
    return filters;
}

async function listInbox(params: URLSearchParams, admin: AdminSession): Promise<AdminTicketsResponse> {
    const filters = inboxFilters(params);
    const cursor = readCursor(params.get("cursor"));
    const query = (params.get("q") ?? "").trim();
    if (query.length > ADMIN_TICKET_QUERY_MAX || UNSAFE_QUERY.test(query)) throw new AdminHttpError(400, "invalid_query");

    if (!query) {
        const records = await queryInbox(filters, cursor, ADMIN_TICKET_PAGE_SIZE + 1);
        const page = records.slice(0, ADMIN_TICKET_PAGE_SIZE);
        return {
            tickets: page.map(toAdminListItem),
            nextCursor: records.length > ADMIN_TICKET_PAGE_SIZE ? cursorOf(page[page.length - 1]) : null,
            viewer: viewerFor(admin),
        };
    }

    // Firestore has no substring search: scan a bounded window in inbox order
    // and match title, reference, name and e-mail (Turkish-insensitive). The
    // cursor continues the scan, so "load more" never skips a record.
    const scanned = await queryInbox(filters, cursor, SEARCH_SCAN_LIMIT);
    const matches: StoredTicket[] = [];
    let last: StoredTicket | null = null;
    for (const record of scanned) {
        last = record;
        const item = toAdminListItem(record);
        if (matchesSearch(`${item.title} ${item.reference} ${item.authorName} ${item.authorEmail}`, query)) matches.push(record);
        if (matches.length === ADMIN_TICKET_PAGE_SIZE) break;
    }
    const exhausted = scanned.length < SEARCH_SCAN_LIMIT && last === scanned[scanned.length - 1];
    return {
        tickets: matches.map(toAdminListItem),
        nextCursor: last && !exhausted ? cursorOf(last) : null,
        viewer: viewerFor(admin),
    };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/** https image URLs only; anything else is dropped. */
function httpsOrUndefined(value: unknown) {
    return typeof value === "string" && value.length <= 2_048 && /^https:\/\/[^\s"'<>`]+$/.test(value) ? value : undefined;
}

function textOrUndefined(value: unknown, max: number) {
    return typeof value === "string" && value.trim() ? value.slice(0, max) : undefined;
}

function senderProfile(profile: Record<string, unknown> | null, email: string, fallbackName: string): TicketSenderProfile | null {
    if (!profile) return null;
    return {
        username: stringOr(profile.username, "", 100) || fallbackName,
        nickname: textOrUndefined(profile.nickname, 100),
        nicknameTag: typeof profile.nicknameTag === "string" && /^\d{4}$/.test(profile.nicknameTag) ? profile.nicknameTag : undefined,
        avatarUrl: httpsOrUndefined(profile.avatarUrl),
        bannerUrl: httpsOrUndefined(profile.bannerUrl),
        bio: textOrUndefined(profile.bio, 2_000),
        customStatus: textOrUndefined(profile.customStatus, 300),
        accentColor: typeof profile.accentColor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(profile.accentColor) ? profile.accentColor : undefined,
        favoriteLangs: Array.isArray(profile.favoriteLangs) ? profile.favoriteLangs.filter((item): item is string => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 40)) : undefined,
        socialGithub: textOrUndefined(profile.socialGithub, 200),
        socialLinkedin: textOrUndefined(profile.socialLinkedin, 200),
        socialTwitter: textOrUndefined(profile.socialTwitter, 200),
        socialWebsite: textOrUndefined(profile.socialWebsite, 200),
        badges: Array.isArray(profile.badges) ? profile.badges.filter((item): item is string => typeof item === "string").slice(0, 30) : undefined,
        dndMode: profile.dndMode === true,
        publicProfile: profile.publicProfile !== false,
        publicProjects: profile.publicProjects === true,
        email,
    };
}

async function loadSender(email: string, fallbackName: string, fallbackAvatar: string | null): Promise<AdminTicketSender> {
    const [userResult, profileResult] = await Promise.allSettled([
        getServerDocument<Record<string, unknown>>(`users/${email}`),
        getServerDocument<Record<string, unknown>>(`public_profiles/${email}`),
    ]);
    const user = userResult.status === "fulfilled" ? userResult.value : null;
    const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
    const record = await getUserRecord(email, userResult.status === "fulfilled" ? { user } : { userFailed: true });
    const createdAt = toIso(user?.createdAt);
    const name = stringOr(profile?.username, "", 100) || stringOr(user?.username, "", 100) || fallbackName || email.split("@")[0];
    return {
        email,
        exists: userResult.status === "fulfilled" ? Boolean(user) : true,
        username: name,
        nickname: stringOr(profile?.nickname ?? user?.nickname, "", 100),
        nicknameTag: stringOr(profile?.nicknameTag ?? user?.nicknameTag, "", 10),
        avatarUrl: httpsOrUndefined(profile?.avatarUrl) ?? httpsOrUndefined(user?.avatarUrl) ?? fallbackAvatar,
        role: resolveUserRole(email, user?.role),
        provider: typeof user?.provider === "string" ? user.provider.slice(0, 30) : null,
        createdAt,
        accountAgeDays: accountAgeDays(createdAt),
        suspended: user?.suspended === true || user?.banned === true,
        twoFactorEnabled: user?.twoFactorEnabled === true,
        profile: senderProfile(profile, email, name),
        record,
    };
}

/** A ticket whose author address is unusable still opens (and can be answered or deleted). */
function unknownSender(name: string, avatar: string | null): AdminTicketSender {
    const facts: UserRecordFacts = {
        accountExists: false, accountAgeDays: null, suspendedNow: false, previousSuspensions: 0, contentRemovals: 0, staffDeletions: 0,
        reportsUpheld: 0, reportsOpen: 0, reportsDismissed: 0, securityEvents: 0, securityEventsCritical: 0, groupBans: 0, incomplete: true,
    };
    return {
        email: "",
        exists: false,
        username: name,
        nickname: "",
        nicknameTag: "",
        avatarUrl: avatar,
        role: "user",
        provider: null,
        createdAt: null,
        accountAgeDays: null,
        suspended: false,
        twoFactorEnabled: false,
        profile: null,
        record: { ...evaluateUserRecord(facts), facts, checkedAt: new Date().toISOString() },
    };
}

async function loadTicket(id: string): Promise<StoredTicket> {
    const record = await getServerDocument<TicketRecord>(`${TICKETS_COLLECTION}/${id}`);
    if (!record) throw new AdminHttpError(404, "not_found");
    return { ...record, _id: id };
}

/** `?id=` returns one ticket with its sender; otherwise the filtered inbox. */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const params = request.nextUrl.searchParams;
        const id = params.get("id");
        if (id !== null) {
            const record = await loadTicket(requireDocId(id, 64));
            const ticket = toAdminDetail(record);
            const email = normalizeEmail(record.authorEmail);
            const payload: AdminTicketDetailResponse = {
                ticket,
                sender: email ? await loadSender(email, ticket.authorName, ticket.authorAvatar) : unknownSender(ticket.authorName, ticket.authorAvatar),
                viewer: viewerFor(guard.admin),
            };
            return adminJson(payload);
        }
        return adminJson(await listInbox(params, guard.admin));
    } catch (error) {
        return failure(error, "tickets:get");
    }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function ticketPath(id: string) {
    return `${TICKETS_COLLECTION}/${id}`;
}

function versioned(record: StoredTicket) {
    return record._updateTime ? { updateTime: record._updateTime } : {};
}

export async function POST(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator", mutation: true });
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    try {
        const body = await readAdminBody(request, ["action", "id", "text", "status", "priority"], 24_576);
        const action = requireEnum(body.action, ACTIONS, "invalid_action");
        const id = requireDocId(body.id, 64);
        if ((action !== "reply" && body.text !== undefined)
            || (action !== "reply" && action !== "setStatus" && body.status !== undefined)
            || (action !== "setPriority" && body.priority !== undefined)) {
            throw new AdminHttpError(400, "unknown_field");
        }
        const path = ticketPath(id);

        if (action === "reply") {
            const message = validateTicketMessage(body.text);
            if (!message.ok) throw new AdminHttpError(400, message.code === "message_too_long" ? "too_long" : message.code === "message_required" ? "text_required" : "invalid_text");
            // Optional status in the same step ("reply and resolve").
            const requested = body.status === undefined ? null : requireEnum<TicketStatus>(body.status, TICKET_STATUSES, "invalid_status");
            const ticket = await withConflictRetry(async () => {
                const record = await loadTicket(id);
                const messages = readTicketMessages(record);
                if (messages.length >= TICKET_LIMITS.messages) throw new TicketRouteError(409, "thread_full");
                const authorEmail = normalizeEmail(record.authorEmail);
                const thread = [...messages, newTicketMessage("staff", TEAM_AUTHOR_NAME, message.text)];
                const now = new Date();
                const from = ticketStatus(record.status);
                const status = requested ?? statusAfterStaffReply(from);
                const update = {
                    messages: thread,
                    ...lastMessageFields(thread, now),
                    status,
                    ...(status !== from ? { statusUpdatedAt: now } : {}),
                    unreadForUser: true,
                    unreadForStaff: false,
                };
                await commitServerMutations([
                    { type: "update", path, data: update, updateFields: Object.keys(update), ...versioned(record) },
                    auditLogMutation(actor, "ticket.reply", path, {
                        ticketId: id,
                        category: stringOr(record.category, "other", 30),
                        from,
                        to: status,
                        excerpt: message.text.slice(0, 120),
                    }),
                    ...(authorEmail ? [ticketReplyNotification(authorEmail, id, stringOr(record.title, "", TICKET_LIMITS.title))] : []),
                ]);
                return toAdminDetail({ ...record, ...update });
            });
            const response: AdminTicketActionResponse = { id, ticket, changed: true };
            return adminJson(response);
        }

        if (action === "setStatus" || action === "setPriority") {
            if (action === "setPriority" && !isTicketPriority(body.priority)) throw new TicketRouteError(400, "invalid_priority");
            const setting = action === "setStatus"
                ? { field: "status" as const, value: requireEnum<TicketStatus>(body.status, TICKET_STATUSES, "invalid_status") }
                : { field: "priority" as const, value: ticketPriority(body.priority) };
            const result = await withConflictRetry(async () => {
                const record = await loadTicket(id);
                const current = setting.field === "status" ? ticketStatus(record.status) : ticketPriority(record.priority);
                if (current === setting.value) return { ticket: toAdminDetail(record), changed: false };
                const now = new Date();
                const update = setting.field === "status"
                    ? { status: setting.value, statusUpdatedAt: now, updatedAt: now }
                    : { priority: setting.value, updatedAt: now };
                await commitServerMutations([
                    { type: "update", path, data: update, updateFields: Object.keys(update), ...versioned(record) },
                    auditLogMutation(actor, setting.field === "status" ? "ticket.set_status" : "ticket.set_priority", path, {
                        ticketId: id,
                        from: current,
                        to: setting.value,
                    }),
                ]);
                return { ticket: toAdminDetail({ ...record, ...update }), changed: true };
            });
            const response: AdminTicketActionResponse = { id, ...result };
            return adminJson(response);
        }

        if (action === "markRead") {
            const ticket = await withConflictRetry(async () => {
                const record = await loadTicket(id);
                if (record.unreadForStaff !== true) return toAdminDetail(record);
                await commitServerMutations([{ type: "update", path, data: { unreadForStaff: false }, updateFields: ["unreadForStaff"], ...versioned(record) }]);
                return toAdminDetail({ ...record, unreadForStaff: false });
            });
            const response: AdminTicketActionResponse = { id, ticket, changed: true };
            return adminJson(response);
        }

        const record = await loadTicket(id);
        await commitServerMutations([
            { type: "delete", path },
            auditLogMutation(actor, "ticket.delete", path, {
                ticketId: id,
                category: stringOr(record.category, "other", 30),
                title: stringOr(record.title, "", 120),
                authorEmail: stringOr(record.authorEmail, "", 254),
                messages: Array.isArray(record.messages) ? record.messages.length : 0,
            }),
        ]);
        await removeStaffTicketNotifications([id]);
        const response: AdminTicketActionResponse = { id, deleted: true, changed: true };
        return adminJson(response);
    } catch (error) {
        return failure(error, "tickets:post");
    }
}
