import type { NextRequest } from "next/server";
import { FREE_SUBSCRIPTION, effectivePlan } from "@/lib/plans";
import { getSubscription } from "@/lib/server/plans";
import { getActiveSession } from "@/lib/server/active-session";
import { httpsUrlOrNull, stringOr } from "@/lib/server/admin";
import { commitServerMutations, getServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { isSameOrigin } from "@/lib/server/request-security";
import {
    SupportError,
    TICKETS_COLLECTION,
    TICKET_LIST_FIELDS,
    createSupportTicket,
    isMissingIndex,
    lastMessageFields,
    newTicketMessage,
    notifyStaffAboutTicket,
    readTicketMessages,
    requireRateLimit,
    supportError,
    supportFailure,
    supportJson,
    ticketStatus,
    toTicketSummary,
    toTicketView,
    withWriteRetry,
    type StoredTicket,
    type TicketRecord,
} from "@/lib/server/support";
import { readJsonBody } from "@/lib/server/validate";
import {
    TICKET_LIMITS,
    TICKET_RATE_LIMITS,
    canUserClose,
    canUserReopen,
    defaultTicketPriority,
    isTicketId,
    normalizePageUrl,
    normalizeUserAgent,
    statusAfterUserReply,
    validateTicketDraft,
    validateTicketMessage,
    type SupportListResponse,
    type SupportTicketResponse,
    type SupportTicketView,
} from "@/lib/support";

export const runtime = "nodejs";

const LIST_LIMIT = 50;
const HOUR = 60 * 60_000;

type ActiveUser = NonNullable<Awaited<ReturnType<typeof getActiveSession>>>;

async function requireUser() {
    const active = await getActiveSession();
    if (!active) throw new SupportError(401, "auth_required");
    return active;
}

function displayName(active: ActiveUser, profile: Record<string, unknown> | null) {
    const user = active.user as Record<string, unknown>;
    const name = [profile?.username, user.username, active.session?.user?.name]
        .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
    return (name ?? active.email.split("@")[0]).trim().slice(0, 80);
}

function lastMessageTime(record: TicketRecord) {
    return Date.parse(String(record.lastMessageAt ?? record.createdAt ?? "")) || 0;
}

/** The caller's tickets, most recent activity first. */
async function listOwnTickets(email: string) {
    const where = [{ field: "authorEmail", op: "EQUAL" as const, value: email }];
    try {
        return await runServerQuery<TicketRecord>({
            collectionId: TICKETS_COLLECTION,
            where,
            orderBy: [{ field: "lastMessageAt", direction: "DESCENDING" }],
            select: TICKET_LIST_FIELDS,
            limit: LIST_LIMIT,
        });
    } catch (error) {
        if (!isMissingIndex(error)) throw error;
        // The (authorEmail, lastMessageAt) index isn't deployed yet: sort here.
        const records = await runServerQuery<TicketRecord>({ collectionId: TICKETS_COLLECTION, where, select: TICKET_LIST_FIELDS, limit: 300 });
        return records.sort((a, b) => lastMessageTime(b) - lastMessageTime(a)).slice(0, LIST_LIMIT);
    }
}

/** Another person's ticket answers exactly like a missing one. */
async function loadOwnTicket(id: string, email: string): Promise<StoredTicket> {
    const record = await getServerDocument<TicketRecord>(`${TICKETS_COLLECTION}/${id}`);
    if (!record || record.authorEmail !== email) throw new SupportError(404, "not_found");
    return { ...record, _id: id };
}

/** Applies `update` with a version check, so concurrent replies are never lost. */
async function updateTicket(record: StoredTicket, update: Record<string, unknown>) {
    await commitServerMutations([{
        type: "update",
        path: `${TICKETS_COLLECTION}/${record._id}`,
        data: update,
        updateFields: Object.keys(update),
        ...(record._updateTime ? { updateTime: record._updateTime } : {}),
    }]);
    return toTicketView({ ...record, ...update });
}

export async function GET(request: NextRequest) {
    try {
        const { email } = await requireUser();
        await requireRateLimit(`support:read:${email}`, 120, 60_000);
        const id = request.nextUrl.searchParams.get("id");
        if (id !== null) {
            if (!isTicketId(id)) throw new SupportError(400, "invalid_id");
            const payload: SupportTicketResponse = { ticket: toTicketView(await loadOwnTicket(id, email)) };
            return supportJson(payload);
        }
        const records = await listOwnTickets(email);
        const payload: SupportListResponse = { tickets: records.map((record) => toTicketSummary(record)) };
        return supportJson(payload);
    } catch (error) {
        return supportFailure(error, "get");
    }
}

/** Plus and Pro accounts' new tickets start one step higher than "normal". */
async function planPriority(email: string, priority: ReturnType<typeof defaultTicketPriority>) {
    if (priority !== "low" && priority !== "normal") return priority;
    const plan = effectivePlan(await getSubscription(email).catch(() => FREE_SUBSCRIPTION));
    return plan === "free" ? priority : "high";
}

async function createTicket(request: NextRequest, active: ActiveUser, body: Record<string, unknown>) {
    const result = validateTicketDraft(body);
    if (!result.ok) {
        const [first] = result.errors;
        throw new SupportError(400, first.code, { field: first.field });
    }
    const { draft } = result;
    const { email } = active;
    // Invalid drafts don't use up the quota; valid ones count against both windows.
    await requireRateLimit(`support:create:hour:${email}`, TICKET_RATE_LIMITS.createPerHour, HOUR);
    await requireRateLimit(`support:create:day:${email}`, TICKET_RATE_LIMITS.createPerDay, 24 * HOUR);

    // "Add technical details": the browser sent by the request itself and the page the form was opened from.
    const technical = body.technical === true;
    const pageUrl = technical ? normalizePageUrl(body.technicalPage) ?? null : null;
    const userAgent = technical ? normalizeUserAgent(request.headers.get("user-agent")) : null;

    const profile = await getServerDocument<Record<string, unknown>>(`public_profiles/${email}`).catch(() => null);
    const user = active.user as Record<string, unknown>;
    const { id, data } = await createSupportTicket({
        category: draft.category,
        title: draft.title,
        description: draft.description,
        priority: await planPriority(email, defaultTicketPriority(draft.category, draft.severity)),
        authorEmail: email,
        authorName: displayName(active, profile),
        authorAvatar: httpsUrlOrNull(profile?.avatarUrl) ?? httpsUrlOrNull(user.avatarUrl) ?? httpsUrlOrNull(active.session?.user?.image),
        meta: {
            pageUrl: pageUrl ?? undefined,
            userAgent: userAgent ?? undefined,
            severity: draft.severity ?? undefined,
            complaintSubject: draft.complaintSubject ?? undefined,
            reportedUser: draft.reportedUser ?? undefined,
            contentUrl: draft.contentUrl ?? undefined,
            banScope: draft.banScope ?? undefined,
            banReference: draft.banReference ?? undefined,
        },
    });
    await notifyStaffAboutTicket({ ticketId: id, title: draft.title, authorEmail: email, event: "created" });
    const payload: SupportTicketResponse = { ticket: toTicketView({ ...data, _id: id }) };
    return supportJson(payload, 201);
}

async function reply(active: ActiveUser, id: string, text: unknown): Promise<SupportTicketView> {
    const message = validateTicketMessage(text);
    if (!message.ok) throw new SupportError(400, message.code);
    await requireRateLimit(`support:reply:${active.email}`, TICKET_RATE_LIMITS.repliesPerHour, HOUR);
    const ticket = await withWriteRetry(async () => {
        const record = await loadOwnTicket(id, active.email);
        const status = ticketStatus(record.status);
        const next = statusAfterUserReply(status);
        if (!next) throw new SupportError(409, "ticket_closed");
        const messages = readTicketMessages(record);
        if (messages.length >= TICKET_LIMITS.messages) throw new SupportError(409, "thread_full");
        const name = stringOr(record.authorName, "", 80) || displayName(active, null);
        const thread = [...messages, newTicketMessage("user", name, message.text)];
        const now = new Date();
        return updateTicket(record, {
            messages: thread,
            ...lastMessageFields(thread, now),
            status: next,
            ...(next !== status ? { statusUpdatedAt: now } : {}),
            unreadForStaff: true,
            unreadForUser: false,
        });
    });
    await notifyStaffAboutTicket({ ticketId: id, title: ticket.title, authorEmail: active.email, event: "reply" });
    return ticket;
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return supportError(403, "bad_origin");
    try {
        const active = await requireUser();
        await requireRateLimit(`support:write:${active.email}`, 60, 10 * 60_000);
        const body = await readJsonBody(request, 48_000);
        if (!body) throw new SupportError(400, "invalid_body");
        if (body.action === "create") return await createTicket(request, active, body);

        if (!isTicketId(body.id)) throw new SupportError(400, "invalid_id");
        const id = body.id;
        let ticket: SupportTicketView;
        if (body.action === "reply") {
            ticket = await reply(active, id, body.text);
        } else if (body.action === "close" || body.action === "reopen") {
            const closing = body.action === "close";
            ticket = await withWriteRetry(async () => {
                const record = await loadOwnTicket(id, active.email);
                const status = ticketStatus(record.status);
                if (closing && !canUserClose(status)) throw new SupportError(409, "already_closed");
                if (!closing && !canUserReopen(status)) throw new SupportError(409, "not_reopenable");
                const now = new Date();
                return updateTicket(record, closing
                    ? { status: "closed", statusUpdatedAt: now, closedAt: now, updatedAt: now, unreadForUser: false }
                    : { status: "open", statusUpdatedAt: now, reopenedAt: now, updatedAt: now, unreadForStaff: true });
            });
        } else if (body.action === "markRead") {
            ticket = await withWriteRetry(async () => {
                const record = await loadOwnTicket(id, active.email);
                return record.unreadForUser === true ? updateTicket(record, { unreadForUser: false }) : toTicketView(record);
            });
        } else {
            throw new SupportError(400, "invalid_action");
        }
        const payload: SupportTicketResponse = { ticket };
        return supportJson(payload);
    } catch (error) {
        return supportFailure(error, "post");
    }
}
