import { NextResponse, type NextRequest } from "next/server";
import type {
    NotificationActionResponse,
    NotificationCountResponse,
    NotificationItem,
    NotificationType,
    NotificationsErrorCode,
    NotificationsResponse,
} from "@/components/NotificationCenter";
import { getActiveSession } from "@/lib/server/active-session";
import { firestoreStatus, httpsUrlOrNull, toIso } from "@/lib/server/admin";
import { commitServerMutations, commitServerPatches, deleteServerDocument, isWriteConflict, patchServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { isDocId, readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * The signed-in user's in-app notifications (notifications/{email}/items),
 * read and changed with the service account. NotificationCenter and the
 * header bell use this instead of the Firestore client SDK, so they keep
 * working when the browser's Firebase connection is unavailable. Items are
 * written by the server only (e.g. ticket replies from /api/admin/tickets,
 * for staff new tickets and messages from /api/support, and invitations to a
 * live coding session from /api/collab).
 */

const LIST_LIMIT = 50;
/** Unread items counted at most; the badge shows "9+" long before. */
const UNREAD_CAP = 100;
/** Items one "mark all read" or "clear" request changes. */
const BULK_LIMIT = 300;
/** Writes per commit (Firestore allows 500). */
const COMMIT_CHUNK = 250;
const READS_PER_MINUTE = 120;
const WRITES_PER_MINUTE = 60;
const ID_MAX = 128;

const TYPES: readonly NotificationType[] = ["friend_request", "message", "call", "like", "system", "ticket_reply", "ticket_new", "collab_invite"];
const ACTIONS = ["markRead", "delete", "clear"] as const;

const MESSAGES: Record<NotificationsErrorCode, string> = {
    unauthorized: "Etkin oturum gerekli.",
    bad_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    invalid_request: "Geçersiz istek.",
    invalid_action: "Geçersiz işlem.",
    invalid_id: "Geçersiz bildirim kimliği.",
    not_found: "Bildirim bulunamadı.",
    unavailable: "Bildirim hizmeti şu anda kullanılamıyor.",
};

type StoredNotification = {
    type?: unknown;
    title?: unknown;
    body?: unknown;
    read?: unknown;
    createdAt?: unknown;
    actionUrl?: unknown;
    fromAvatar?: unknown;
};

function json(payload: NotificationsResponse | NotificationCountResponse | NotificationActionResponse) {
    return NextResponse.json(payload, { headers: jsonSecurityHeaders() });
}

function errorResponse(status: number, code: NotificationsErrorCode, headers: Record<string, string> = {}) {
    return NextResponse.json({ error: MESSAGES[code], code }, { status, headers: jsonSecurityHeaders(headers) });
}

async function rateLimited(key: string, limit: number) {
    const rate = await enforceRateLimitWithFallback(key, limit, 60_000);
    return rate.allowed ? null : errorResponse(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });
}

const parentPath = (email: string) => `notifications/${email}`;
const itemPath = (email: string, id: string) => `notifications/${email}/items/${id}`;

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

/** In-site paths only: "//host", "/\host", whitespace or control characters could lead off the site. */
function inSitePath(value: unknown) {
    return typeof value === "string" && value.length <= 500 && /^\/(?![/\\])[^\s\u0000-\u001f\u007f\\]*$/.test(value) ? value : null;
}

function toItem(record: StoredNotification & { _id: string }): NotificationItem | null {
    // Only ids the actions below accept are listed, so every item can be read and deleted.
    if (!isDocId(record._id, ID_MAX)) return null;
    return {
        id: record._id,
        type: TYPES.find((type) => type === record.type) ?? "system",
        title: text(record.title, 200),
        body: text(record.body, 500),
        read: record.read === true,
        createdAt: toIso(record.createdAt),
        actionUrl: inSitePath(record.actionUrl),
        fromAvatar: httpsUrlOrNull(record.fromAvatar),
    };
}

async function newestItems(email: string) {
    const records = await runServerQuery<StoredNotification>({
        collectionId: "items",
        parentPath: parentPath(email),
        orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
        limit: LIST_LIMIT,
    });
    return records.map(toItem).filter((item): item is NotificationItem => item !== null);
}

/** Ids of the items whose `read` flag equals `read` (projection only: no content is read). */
async function idsWhereRead(email: string, read: boolean, limit: number) {
    const records = await runServerQuery<{ read?: unknown }>({
        collectionId: "items",
        parentPath: parentPath(email),
        where: [{ field: "read", op: "EQUAL", value: read }],
        select: ["read"],
        limit,
    });
    return records.map((record) => record._id).filter((id) => isDocId(id, ID_MAX));
}

async function unreadCount(email: string) {
    return (await idsWhereRead(email, false, UNREAD_CAP)).length;
}

function chunks<T>(items: T[], size: number) {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
}

/** Marks every unread item read. `exists` keeps an item deleted meanwhile from coming back as an empty document. */
async function markAllRead(email: string) {
    for (let attempt = 1; ; attempt += 1) {
        const ids = await idsWhereRead(email, false, BULK_LIMIT);
        try {
            for (const group of chunks(ids, COMMIT_CHUNK)) {
                await commitServerPatches(group.map((id) => ({ path: itemPath(email, id), data: { read: true }, updateFields: ["read"], exists: true })));
            }
            return ids.length;
        } catch (error) {
            // An item was deleted between the query and the commit (another tab): read the list again.
            if (attempt >= 2 || !(firestoreStatus(error) === 404 || isWriteConflict(error))) throw error;
        }
    }
}

async function markOneRead(email: string, id: string) {
    try {
        await patchServerDocument(itemPath(email, id), { read: true }, { updateFields: ["read"], exists: true });
        return true;
    } catch (error) {
        if (firestoreStatus(error) === 404) return false;
        throw error;
    }
}

async function clearRead(email: string) {
    const ids = await idsWhereRead(email, true, BULK_LIMIT);
    for (const group of chunks(ids, COMMIT_CHUNK)) {
        await commitServerMutations(group.map((id) => ({ type: "delete" as const, path: itemPath(email, id) })));
    }
    return ids.length;
}

/** `?view=count` returns only the unread count (the header bell); otherwise the newest items as well. */
export async function GET(request: NextRequest) {
    const active = await getActiveSession();
    if (!active) return errorResponse(401, "unauthorized");
    const { email } = active;
    const view = request.nextUrl.searchParams.get("view");
    if (view !== null && view !== "count") return errorResponse(400, "invalid_request");
    try {
        const limited = await rateLimited(`notifications:read:${email}`, READS_PER_MINUTE);
        if (limited) return limited;
        if (view === "count") return json({ unread: await unreadCount(email) });
        const [items, unread] = await Promise.all([newestItems(email), unreadCount(email)]);
        return json({ items, unread });
    } catch (error) {
        console.error("[notifications:get]", error instanceof Error ? error.message : error);
        return errorResponse(503, "unavailable");
    }
}

/**
 * Actions: `{ action: "markRead", id }` or `{ action: "markRead", all: true }`,
 * `{ action: "delete", id }` and `{ action: "clear" }` (deletes the read items).
 * Answers with the number of changed items and the fresh unread count.
 */
export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return errorResponse(403, "bad_origin");
    const active = await getActiveSession();
    if (!active) return errorResponse(401, "unauthorized");
    const { email } = active;
    try {
        const limited = await rateLimited(`notifications:write:${email}`, WRITES_PER_MINUTE);
        if (limited) return limited;
        const body = await readJsonBody(request, 2_048);
        if (!body || Object.keys(body).some((key) => key !== "action" && key !== "id" && key !== "all")) return errorResponse(400, "invalid_request");
        const action = ACTIONS.find((value) => value === body.action);
        if (!action) return errorResponse(400, "invalid_action");

        let changed: number;
        if (action === "clear") {
            if (body.id !== undefined || body.all !== undefined) return errorResponse(400, "invalid_request");
            changed = await clearRead(email);
        } else if (action === "markRead" && body.all === true) {
            if (body.id !== undefined) return errorResponse(400, "invalid_request");
            changed = await markAllRead(email);
        } else {
            if (body.all !== undefined) return errorResponse(400, "invalid_request");
            if (!isDocId(body.id, ID_MAX)) return errorResponse(400, "invalid_id");
            if (action === "markRead") {
                if (!await markOneRead(email, body.id)) return errorResponse(404, "not_found");
                changed = 1;
            } else {
                // Deleting an item that is already gone (another tab) counts as done.
                await deleteServerDocument(itemPath(email, body.id));
                changed = 1;
            }
        }
        return json({ ok: true, changed, unread: await unreadCount(email) });
    } catch (error) {
        console.error("[notifications:post]", error instanceof Error ? error.message : error);
        return errorResponse(503, "unavailable");
    }
}
