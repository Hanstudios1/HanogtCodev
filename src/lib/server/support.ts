import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type {
    AdminTicketDetail,
    AdminTicketListItem,
} from "@/components/Admin/tickets-types";
import {
    RECORD_LOOKBACK_DAYS,
    STAFF_TICKET_NOTIFICATION_TITLES,
    TEAM_AUTHOR_NAME,
    TICKET_LIMITS,
    accountAgeDays,
    evaluateUserRecord,
    isBanScope,
    isComplaintSubject,
    isStoredTicketCategory,
    isTicketPriority,
    isTicketSeverity,
    isTicketStatus,
    messagePreview,
    normalizePageUrl,
    normalizeUserAgent,
    staffTicketLink,
    staffTicketNotificationId,
    ticketReference,
    type StaffTicketEvent,
    type StoredTicketCategory,
    type SupportErrorBody,
    type SupportErrorCode,
    type SupportTicketMessage,
    type SupportTicketMeta,
    type SupportTicketSummary,
    type SupportTicketView,
    type TicketCategory,
    type TicketField,
    type TicketMessageFrom,
    type TicketPriority,
    type TicketStatus,
    type UserRecordFacts,
    type UserRecordSummary,
} from "@/lib/support";
import { firestoreStatus, getOwnerEmails, httpsUrlOrNull, stringOr, toIso } from "./admin";
import { commitServerMutations, getServerDocument, isWriteConflict, runServerQuery } from "./firebase-rest";
import { enforceRateLimitWithFallback } from "./rate-limit";
import { jsonSecurityHeaders } from "./request-security";
import { isDocId, normalizeEmail } from "./validate";

export const TICKETS_COLLECTION = "support_tickets";

// ---------------------------------------------------------------------------
// Errors and responses (shared by /api/support and /api/feedback)
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<SupportErrorCode, string> = {
    auth_required: "Bu işlem için giriş yapın.",
    bad_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    invalid_body: "Geçersiz istek gövdesi.",
    invalid_action: "Geçersiz işlem.",
    invalid_id: "Geçersiz kayıt kimliği.",
    not_found: "Kayıt bulunamadı.",
    forbidden: "Bu işlem için yetkiniz yok.",
    invalid_category: "Geçersiz kategori.",
    title_required: "Başlık gerekli.",
    title_too_short: "Başlık çok kısa.",
    title_too_long: "Başlık çok uzun.",
    description_required: "Açıklama gerekli.",
    description_too_short: "Açıklama çok kısa.",
    description_too_long: "Açıklama çok uzun.",
    invalid_severity: "Geçersiz önem derecesi.",
    invalid_complaint_subject: "Geçersiz şikayet konusu.",
    reported_user_too_long: "Kullanıcı adı çok uzun.",
    invalid_content_url: "İçerik bağlantısı geçersiz.",
    invalid_ban_scope: "Neyden yasaklandığı seçilmeli.",
    ban_reference_required: "Grup adı gerekli.",
    ban_reference_too_long: "Bu alan çok uzun.",
    message_required: "Mesaj boş olamaz.",
    message_too_long: "Mesaj çok uzun.",
    ticket_closed: "Talep kapalı; önce yeniden açın.",
    already_closed: "Talep zaten kapalı.",
    not_reopenable: "Bu talep yeniden açılamaz.",
    thread_full: "Konuşma mesaj sınırına ulaştı.",
    conflict: "Kayıt aynı anda değişti; tekrar deneyin.",
    unavailable: "Hizmet şu anda kullanılamıyor.",
    content_required: "İçerik boş olamaz.",
    content_too_long: "İçerik çok uzun.",
    comment_required: "Yorum boş olamaz.",
    comment_too_long: "Yorum çok uzun.",
    comment_not_found: "Yorum bulunamadı.",
    too_many_comments: "Yorum sınırına ulaşıldı.",
    profanity: "Metin topluluk kurallarına aykırı ifadeler içeriyor.",
    personal_data: "Herkese açık metinlerde kişisel veri paylaşmayın.",
    links: "Metinde çok fazla bağlantı var.",
    spam: "Metin spam gibi görünüyor.",
};

/**
 * Thrown inside the routes; turned into `{ error, code }` by supportFailure.
 * The HTTP status is `httpStatus`, not `status`: the Firestore helpers read a
 * `status` of 409 as a write conflict and would retry it.
 */
export class SupportError extends Error {
    httpStatus: number;
    code: SupportErrorCode;
    field?: TicketField;
    retryAfter?: number;

    constructor(httpStatus: number, code: SupportErrorCode, options: { field?: TicketField; retryAfter?: number } = {}) {
        super(ERROR_MESSAGES[code]);
        this.name = "SupportError";
        this.httpStatus = httpStatus;
        this.code = code;
        this.field = options.field;
        this.retryAfter = options.retryAfter;
    }
}

export function supportJson(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders(headers) });
}

export function supportError(status: number, code: SupportErrorCode, options: { field?: TicketField; retryAfter?: number } = {}) {
    const body: SupportErrorBody = { error: ERROR_MESSAGES[code], code };
    if (options.field) body.field = options.field;
    if (options.retryAfter) body.retryAfter = options.retryAfter;
    return supportJson(body, status, options.retryAfter ? { "Retry-After": String(options.retryAfter) } : {});
}

export function supportFailure(error: unknown, context: string) {
    if (error instanceof SupportError) return supportError(error.httpStatus, error.code, { field: error.field, retryAfter: error.retryAfter });
    console.error(`[support:${context}]`, error instanceof Error ? error.message : error);
    return supportError(503, "unavailable");
}

/** Throws a 429 SupportError when the window is used up (falls back to memory when Firestore is down). */
export async function requireRateLimit(key: string, limit: number, windowMs: number) {
    const rate = await enforceRateLimitWithFallback(key, limit, windowMs);
    if (!rate.allowed) throw new SupportError(429, "rate_limited", { retryAfter: rate.retryAfterSeconds });
    return rate;
}

/** Re-runs a read-check-write operation whose version precondition failed. */
export async function withWriteRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (error instanceof SupportError || !isWriteConflict(error)) throw error;
            if (attempt >= attempts) throw new SupportError(409, "conflict");
        }
    }
}

/** A composite index that isn't deployed yet makes Firestore answer 400 FAILED_PRECONDITION. */
export function isMissingIndex(error: unknown) {
    return firestoreStatus(error) === 400;
}

// ---------------------------------------------------------------------------
// Ticket documents (support_tickets/{id}, server-only)
// ---------------------------------------------------------------------------

export type TicketRecord = {
    category?: unknown;
    title?: unknown;
    description?: unknown;
    status?: unknown;
    priority?: unknown;
    authorEmail?: unknown;
    authorName?: unknown;
    authorAvatar?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    lastMessageAt?: unknown;
    lastMessageFrom?: unknown;
    lastMessagePreview?: unknown;
    messageCount?: unknown;
    messages?: unknown;
    unreadForUser?: unknown;
    unreadForStaff?: unknown;
    meta?: unknown;
};

export type StoredTicket = TicketRecord & { _id: string; _updateTime?: string };

/** Fields list views read (the conversation is left out). */
export const TICKET_LIST_FIELDS = [
    "category", "title", "status", "priority", "authorEmail", "authorName", "authorAvatar", "createdAt", "updatedAt",
    "lastMessageAt", "lastMessageFrom", "lastMessagePreview", "messageCount", "unreadForUser", "unreadForStaff", "meta",
];

/** 20 hex characters: unguessable, path-safe and easy to quote by its first eight. */
export function newTicketId() {
    return randomBytes(10).toString("hex");
}

/** Stored category; tickets from before the current categories keep theirs, anything unknown counts as legacy "other". */
export function ticketCategory(value: unknown): StoredTicketCategory {
    return isStoredTicketCategory(value) ? value : "other";
}

export function ticketStatus(value: unknown): TicketStatus {
    return isTicketStatus(value) ? value : "open";
}

export function ticketPriority(value: unknown): TicketPriority {
    return isTicketPriority(value) ? value : "normal";
}

/** Title of the appeal a suspended account files from the login page (/api/support/appeal). */
export const APPEAL_TICKET_TITLE = "Askıya alma itirazı";

/** Appeals are unban requests about the account itself. */
export const APPEAL_TICKET_META = { appeal: true, banScope: "account" } as const;

/** Appeals against a suspension carry `meta.appeal: true`; staff see an "İtiraz" badge. */
export function isAppealTicket(record: TicketRecord) {
    const meta = record.meta && typeof record.meta === "object" && !Array.isArray(record.meta) ? record.meta as Record<string, unknown> : null;
    return meta?.appeal === true;
}

export type NewTicketInput = {
    category: TicketCategory;
    title: string;
    description: string;
    priority: TicketPriority;
    authorEmail: string;
    authorName: string;
    authorAvatar: string | null;
    /** Undefined entries are left out of the stored map. */
    meta?: Record<string, unknown>;
};

/**
 * A new support_tickets document: open, unread for the team, the description
 * as the opening text and no conversation yet. Every way of filing a ticket
 * uses this shape, so the admin inbox and the author's "Taleplerim" list
 * (matched by authorEmail) show them all alike.
 */
export function newTicketDocument(input: NewTicketInput, now = new Date()) {
    return {
        category: input.category,
        title: input.title,
        description: input.description,
        status: "open",
        priority: input.priority,
        authorEmail: input.authorEmail,
        authorName: input.authorName.slice(0, 80),
        authorAvatar: input.authorAvatar,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        lastMessageFrom: "user",
        lastMessagePreview: messagePreview(input.description),
        messageCount: 0,
        messages: [],
        unreadForUser: false,
        unreadForStaff: true,
        meta: input.meta ?? {},
    };
}

/** Stores a new ticket under a fresh id; the write fails rather than overwrite an existing document. */
export async function createSupportTicket(input: NewTicketInput, now = new Date()) {
    const id = newTicketId();
    const data = newTicketDocument(input, now);
    await commitServerMutations([{ type: "create", path: `${TICKETS_COLLECTION}/${id}`, data }]);
    return { id, data };
}

function messageFrom(value: unknown): TicketMessageFrom | null {
    return value === "user" || value === "staff" ? value : null;
}

/** Stored messages, re-validated (oldest first, at most TICKET_LIMITS.messages). */
export function readTicketMessages(record: TicketRecord): SupportTicketMessage[] {
    const list = Array.isArray(record.messages) ? record.messages : [];
    const messages: SupportTicketMessage[] = [];
    list.forEach((value, index) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        const message = value as Record<string, unknown>;
        const from = messageFrom(message.from);
        const text = stringOr(message.text, "", TICKET_LIMITS.message);
        if (!from || !text) return;
        messages.push({
            id: isDocId(message.id, 64) ? message.id : `message_${index}`,
            from,
            authorName: from === "staff" ? TEAM_AUTHOR_NAME : stringOr(message.authorName, "", 80),
            text,
            createdAt: toIso(message.createdAt),
        });
    });
    return messages.slice(-TICKET_LIMITS.messages);
}

export function readTicketMeta(record: TicketRecord): SupportTicketMeta {
    const meta = record.meta && typeof record.meta === "object" && !Array.isArray(record.meta) ? record.meta as Record<string, unknown> : {};
    return {
        pageUrl: normalizePageUrl(meta.pageUrl) ?? null,
        userAgent: normalizeUserAgent(meta.userAgent),
        severity: isTicketSeverity(meta.severity) ? meta.severity : null,
        steps: typeof meta.steps === "string" && meta.steps ? meta.steps.slice(0, TICKET_LIMITS.steps) : null,
        complaintSubject: isComplaintSubject(meta.complaintSubject) ? meta.complaintSubject : null,
        reportedUser: typeof meta.reportedUser === "string" && meta.reportedUser ? meta.reportedUser.slice(0, TICKET_LIMITS.reportedUser) : null,
        contentUrl: normalizePageUrl(meta.contentUrl) ?? null,
        banScope: isBanScope(meta.banScope) ? meta.banScope : null,
        banReference: typeof meta.banReference === "string" && meta.banReference ? meta.banReference.slice(0, TICKET_LIMITS.banReference) : null,
        appeal: meta.appeal === true,
    };
}

function messageCount(record: TicketRecord) {
    const stored = Number(record.messageCount);
    if (Number.isInteger(stored) && stored >= 0) return Math.min(stored, TICKET_LIMITS.messages);
    return Array.isArray(record.messages) ? Math.min(record.messages.length, TICKET_LIMITS.messages) : 0;
}

export function toTicketSummary(record: StoredTicket): SupportTicketSummary {
    const createdAt = toIso(record.createdAt);
    return {
        id: record._id,
        reference: ticketReference(record._id),
        category: ticketCategory(record.category),
        title: stringOr(record.title, "", TICKET_LIMITS.title),
        status: ticketStatus(record.status),
        createdAt,
        updatedAt: toIso(record.updatedAt) ?? createdAt,
        lastMessageAt: toIso(record.lastMessageAt) ?? createdAt,
        lastMessageFrom: messageFrom(record.lastMessageFrom),
        messageCount: messageCount(record),
        unread: record.unreadForUser === true,
    };
}

/** What the author of the ticket may see: never the priority or staff identities. */
export function toTicketView(record: StoredTicket): SupportTicketView {
    return {
        ...toTicketSummary(record),
        description: stringOr(record.description, "", TICKET_LIMITS.description),
        meta: readTicketMeta(record),
        messages: readTicketMessages(record),
    };
}

export function toAdminListItem(record: StoredTicket): AdminTicketListItem {
    const summary = toTicketSummary(record);
    return {
        id: summary.id,
        reference: summary.reference,
        category: summary.category,
        title: summary.title,
        status: summary.status,
        priority: ticketPriority(record.priority),
        severity: readTicketMeta(record).severity,
        authorEmail: stringOr(record.authorEmail, "", 254),
        authorName: stringOr(record.authorName, "", 80),
        authorAvatar: httpsUrlOrNull(record.authorAvatar),
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        lastMessageAt: summary.lastMessageAt,
        lastMessageFrom: summary.lastMessageFrom,
        lastMessagePreview: stringOr(record.lastMessagePreview, "", TICKET_LIMITS.preview + 1),
        messageCount: summary.messageCount,
        unreadForStaff: record.unreadForStaff === true,
        unreadForUser: record.unreadForUser === true,
        appeal: isAppealTicket(record),
    };
}

export function toAdminDetail(record: StoredTicket): AdminTicketDetail {
    return {
        ...toAdminListItem(record),
        description: stringOr(record.description, "", TICKET_LIMITS.description),
        meta: readTicketMeta(record),
        messages: readTicketMessages(record),
    };
}

/** A new conversation entry as stored (createdAt as an ISO string, like feedback comments). */
export function newTicketMessage(from: TicketMessageFrom, authorName: string, text: string) {
    return {
        id: randomUUID(),
        from,
        authorName: from === "staff" ? TEAM_AUTHOR_NAME : authorName.slice(0, 80),
        text,
        createdAt: new Date().toISOString(),
    };
}

/** Fields written together with a new message (list views read these instead of the thread). */
export function lastMessageFields(messages: Array<{ from: TicketMessageFrom; text: string }>, now: Date) {
    const last = messages[messages.length - 1];
    return {
        lastMessageAt: now,
        lastMessageFrom: last?.from ?? null,
        lastMessagePreview: last ? messagePreview(last.text) : "",
        messageCount: messages.length,
        updatedAt: now,
    };
}

/**
 * In-app notification for the ticket's author (NotificationCenter reads
 * notifications/{email}/items). One item per ticket: each reply refreshes it
 * instead of stacking up.
 */
export function ticketReplyNotification(email: string, ticketId: string, title: string) {
    return {
        type: "update" as const,
        path: `notifications/${email}/items/ticket_${ticketId}`,
        data: {
            type: "ticket_reply",
            title: "Destek talebinize yanıt geldi",
            body: title.slice(0, 120),
            ticketId,
            actionUrl: `/feedback?ticket=${ticketId}`,
            read: false,
            createdAt: new Date(),
        },
    };
}

// ---------------------------------------------------------------------------
// Staff notifications: new tickets and new messages from their authors
// ---------------------------------------------------------------------------

const STAFF_CACHE_MS = 60_000;
/** Admins and moderators read per lookup (owners come from configuration). */
const STAFF_QUERY_LIMIT = 100;
const NOTIFICATION_COMMIT_CHUNK = 400;
let staffCache: { at: number; emails: string[] } | null = null;

/**
 * Who hears about ticket activity: every owner (built-in and ADMIN_EMAILS)
 * and every admin or moderator whose account isn't suspended. Cached for a
 * minute per server instance; if the users query fails, owners still hear.
 */
export async function staffNotificationRecipients(): Promise<string[]> {
    if (staffCache && Date.now() - staffCache.at < STAFF_CACHE_MS) return staffCache.emails;
    const emails = new Set(getOwnerEmails());
    try {
        const staff = await runServerQuery<{ role?: unknown; suspended?: unknown; banned?: unknown }>({
            collectionId: "users",
            where: [{ field: "role", op: "IN", value: ["admin", "moderator"] }],
            select: ["role", "suspended", "banned"],
            limit: STAFF_QUERY_LIMIT,
        });
        for (const record of staff) {
            const email = normalizeEmail(record._id);
            if (email && record.suspended !== true && record.banned !== true) emails.add(email);
        }
    } catch (error) {
        console.warn("[support:staff] staff lookup failed, notifying owners only:", error instanceof Error ? error.message : error);
        return [...emails];
    }
    staffCache = { at: Date.now(), emails: [...emails] };
    return staffCache.emails;
}

/** notifications/{staffEmail}/items/ticket_new_<ticketId>: one per ticket, refreshed (and unread again) on every event. */
export function staffTicketNotification(staffEmail: string, ticketId: string, title: string, event: StaffTicketEvent, now = new Date()) {
    return {
        type: "update" as const,
        path: `notifications/${staffEmail}/items/${staffTicketNotificationId(ticketId)}`,
        data: {
            type: "ticket_new",
            title: STAFF_TICKET_NOTIFICATION_TITLES[event],
            body: title.slice(0, 120),
            ticketId,
            actionUrl: staffTicketLink(ticketId),
            read: false,
            createdAt: now,
        },
    };
}

/**
 * Tells the team about a new ticket or a new message from its author (the
 * author is left out when they are staff themselves). Best effort: a failure
 * is logged and never fails the request, so a ticket is never lost over a
 * notification. Returns the number of people notified.
 */
export async function notifyStaffAboutTicket(input: { ticketId: string; title: string; authorEmail: string; event: StaffTicketEvent }) {
    try {
        const recipients = (await staffNotificationRecipients()).filter((email) => email !== input.authorEmail);
        const now = new Date();
        const writes = recipients.map((email) => staffTicketNotification(email, input.ticketId, input.title, input.event, now));
        for (let index = 0; index < writes.length; index += NOTIFICATION_COMMIT_CHUNK) {
            await commitServerMutations(writes.slice(index, index + NOTIFICATION_COMMIT_CHUNK));
        }
        return recipients.length;
    } catch (error) {
        console.warn("[support:notify-staff]", error instanceof Error ? error.message : error);
        return 0;
    }
}

/**
 * Removes the team's notifications about deleted tickets, so nobody opens a
 * link to a ticket that is gone. Best effort, like the notifications
 * themselves; a missing item is no error.
 */
export async function removeStaffTicketNotifications(ticketIds: string[]) {
    if (!ticketIds.length) return;
    try {
        const recipients = await staffNotificationRecipients();
        const deletes = recipients.flatMap((email) => ticketIds.map((id) => ({ type: "delete" as const, path: `notifications/${email}/items/${staffTicketNotificationId(id)}` })));
        for (let index = 0; index < deletes.length; index += NOTIFICATION_COMMIT_CHUNK) {
            await commitServerMutations(deletes.slice(index, index + NOTIFICATION_COMMIT_CHUNK));
        }
    } catch (error) {
        console.warn("[support:notify-staff] cleanup failed:", error instanceof Error ? error.message : error);
    }
}

// ---------------------------------------------------------------------------
// Sender record ("sicil")
// ---------------------------------------------------------------------------

const RECORD_POST_LIMIT = 60;
const REMOVAL_ACTIONS = new Set(["report.remove_content", "arcade.unpublish"]);
const DELETION_ACTIONS = new Set(["news_comment.delete", "feedback.delete"]);

type Settled<T> = { ok: true; value: T } | { ok: false };

async function settle<T>(task: Promise<T>, label: string): Promise<Settled<T>> {
    try {
        return { ok: true, value: await task };
    } catch (error) {
        console.warn(`[support:record] ${label} lookup failed:`, error instanceof Error ? error.message : error);
        return { ok: false };
    }
}

async function securityEventsSince(email: string, since: Date) {
    try {
        return await runServerQuery<{ risk?: unknown; createdAt?: unknown }>({
            collectionId: "security_events",
            where: [
                { field: "actor", op: "EQUAL", value: email },
                { field: "createdAt", op: "GREATER_THAN_OR_EQUAL", value: since },
            ],
            // Matches the (actor ASC, createdAt DESC) index in firestore.indexes.json.
            orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
            select: ["risk", "createdAt"],
            limit: 300,
        });
    } catch (error) {
        if (!isMissingIndex(error)) throw error;
        // Without the (actor, createdAt) index: equality only, filtered here.
        const events = await runServerQuery<{ risk?: unknown; createdAt?: unknown }>({
            collectionId: "security_events",
            where: [{ field: "actor", op: "EQUAL", value: email }],
            select: ["risk", "createdAt"],
            limit: 500,
        });
        return events.filter((event) => (Date.parse(toIso(event.createdAt) ?? "") || 0) >= since.getTime());
    }
}

function auditActions(field: string, value: string) {
    return runServerQuery<{ action?: unknown }>({
        collectionId: "admin_audit_log",
        where: [{ field, op: "EQUAL", value }],
        select: ["action"],
        limit: 200,
    }).then((entries) => entries.map((entry) => (typeof entry.action === "string" ? entry.action : "")));
}

async function reportsOnPosts(postIds: string[]) {
    const counts = { open: 0, upheld: 0, dismissed: 0 };
    for (let index = 0; index < postIds.length; index += 30) {
        const reports = await runServerQuery<{ status?: unknown }>({
            collectionId: "media_reports",
            where: [{ field: "postId", op: "IN", value: postIds.slice(index, index + 30) }],
            select: ["status"],
            limit: 300,
        });
        for (const report of reports) {
            if (report.status === "resolved") counts.upheld += 1;
            else if (report.status === "dismissed") counts.dismissed += 1;
            else counts.open += 1;
        }
    }
    return counts;
}

type UserDocument = Record<string, unknown> | null;

/**
 * The sender record staff see next to a ticket: suspensions (now and
 * before), staff removals of their content, reports against their Media
 * posts, blocked risky code runs in the last 90 days and group bans. Every
 * lookup is bounded; failed lookups mark the record incomplete instead of
 * failing the request. Pass `user` when users/{email} was already read, and
 * a `cache` to share results within one request.
 */
export function getUserRecord(email: string, options: { user?: UserDocument; userFailed?: boolean; cache?: Map<string, Promise<UserRecordSummary>> } = {}): Promise<UserRecordSummary> {
    const cached = options.cache?.get(email);
    if (cached) return cached;
    const task = computeUserRecord(email, options.user, options.userFailed === true);
    options.cache?.set(email, task);
    return task;
}

async function computeUserRecord(email: string, preloaded: UserDocument | undefined, userFailed: boolean): Promise<UserRecordSummary> {
    const since = new Date(Date.now() - RECORD_LOOKBACK_DAYS * 86_400_000);
    const [user, posts, events, targeted, owned, authored, bans] = await Promise.all([
        preloaded !== undefined || userFailed
            ? Promise.resolve<Settled<UserDocument>>(userFailed ? { ok: false } : { ok: true, value: preloaded ?? null })
            : settle(getServerDocument<Record<string, unknown>>(`users/${email}`), "user"),
        settle(runServerQuery<{ ownerEmail?: unknown }>({
            collectionId: "media_posts",
            where: [{ field: "ownerEmail", op: "EQUAL", value: email }],
            select: ["ownerEmail"],
            limit: RECORD_POST_LIMIT,
        }), "media posts"),
        settle(securityEventsSince(email, since), "security events"),
        settle(auditActions("target", `users/${email}`), "audit (account)"),
        settle(auditActions("details.ownerEmail", email), "audit (owned content)"),
        settle(auditActions("details.authorEmail", email), "audit (authored content)"),
        settle(runServerQuery({ collectionId: "group_bans", where: [{ field: "email", op: "EQUAL", value: email }], select: ["groupId"], limit: 100 }), "group bans"),
    ]);
    const postIds = posts.ok ? posts.value.map((post) => post._id).filter((id) => isDocId(id, 100)) : [];
    const reports = postIds.length ? await settle(reportsOnPosts(postIds), "reports") : { ok: true as const, value: { open: 0, upheld: 0, dismissed: 0 } };

    const account = user.ok ? user.value : null;
    const suspendedNow = account?.suspended === true || account?.banned === true;
    const suspensions = targeted.ok ? targeted.value.filter((action) => action === "user.suspend").length : 0;
    const facts: UserRecordFacts = {
        // An unreadable account counts as existing; `incomplete` says the rest.
        accountExists: user.ok ? Boolean(account) : true,
        accountAgeDays: accountAgeDays(toIso(account?.createdAt)),
        suspendedNow,
        previousSuspensions: Math.max(suspensions - (suspendedNow ? 1 : 0), account?.unsuspendedAt ? 1 : 0),
        contentRemovals: owned.ok ? owned.value.filter((action) => REMOVAL_ACTIONS.has(action)).length : 0,
        staffDeletions: authored.ok ? authored.value.filter((action) => DELETION_ACTIONS.has(action)).length : 0,
        reportsUpheld: reports.ok ? reports.value.upheld : 0,
        reportsOpen: reports.ok ? reports.value.open : 0,
        reportsDismissed: reports.ok ? reports.value.dismissed : 0,
        securityEvents: events.ok ? events.value.length : 0,
        securityEventsCritical: events.ok ? events.value.filter((event) => event.risk === "critical").length : 0,
        groupBans: bans.ok ? bans.value.length : 0,
        incomplete: [user, posts, events, targeted, owned, authored, bans, reports].some((result) => !result.ok),
    };
    const { verdict, reasons } = evaluateUserRecord(facts);
    return { verdict, reasons, facts, checkedAt: new Date().toISOString() };
}
