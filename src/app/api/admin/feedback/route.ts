import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import {
    FEEDBACK_REPLY_MAX,
    FEEDBACK_STATUSES,
    OFFICIAL_AUTHOR,
    type AdminFeedbackActionResponse,
    type AdminFeedbackComment,
    type AdminFeedbackItem,
    type AdminFeedbackResponse,
    type FeedbackCounts,
    type FeedbackStatus,
} from "@/components/Admin/types";
import {
    AdminHttpError,
    adminFailure,
    adminJson,
    auditLogMutation,
    auditLogPatch,
    authorizeAdminRequest,
    httpsUrlOrNull,
    roleAtLeast,
    readAdminBody,
    readText,
    requireDocId,
    requireEnum,
    stringOr,
    toIso,
    withConflictRetry,
} from "@/lib/server/admin";
import { matchesSearch, newestPage, readPageCursor, readSearch } from "@/lib/server/admin-pages";
import { commitServerMutations, commitServerPatches, countServerQuery, getServerDocument } from "@/lib/server/firebase-rest";
import { BOARD_LIMITS } from "@/lib/support";

export const runtime = "nodejs";

type FeedbackRecord = {
    type?: unknown;
    content?: unknown;
    description?: unknown;
    author?: unknown;
    authorEmail?: unknown;
    authorPhoto?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    likes?: unknown;
    comments?: unknown;
    status?: unknown;
    statusUpdatedAt?: unknown;
    pinned?: unknown;
    pinnedAt?: unknown;
};

const ACTIONS = ["setStatus", "reply", "delete", "pin", "unpin", "pinComment", "unpinComment"] as const;
/** Pinning is for admins and owners; moderators keep every other action. */
const PIN_ACTIONS: ReadonlySet<string> = new Set(["pin", "unpin", "pinComment", "unpinComment"]);
const PAGE_SIZE = 40;
const TYPES = ["feedback", "question"] as const;

/** Items created before the admin panel have no status and count as open. */
function feedbackStatus(value: unknown): FeedbackStatus {
    return (FEEDBACK_STATUSES as readonly unknown[]).includes(value) ? value as FeedbackStatus : "open";
}

function toAdminComment(value: unknown, index: number): AdminFeedbackComment | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const comment = value as Record<string, unknown>;
    return {
        id: stringOr(comment.id, `comment_${index}`, 100),
        author: stringOr(comment.author, "", 80),
        content: stringOr(comment.content, "", FEEDBACK_REPLY_MAX),
        createdAt: toIso(comment.createdAt),
        official: comment.official === true,
        replyToContent: typeof comment.replyToContent === "string" ? comment.replyToContent.slice(0, 200) : null,
        pinned: comment.pinned === true,
    };
}

function toAdminFeedback(record: FeedbackRecord & { _id: string }): AdminFeedbackItem {
    const comments = Array.isArray(record.comments) ? record.comments : [];
    return {
        id: record._id,
        type: record.type === "question" ? "question" : "feedback",
        content: stringOr(record.content, "", 2_000),
        description: typeof record.description === "string" && record.description ? record.description.slice(0, 5_000) : null,
        author: stringOr(record.author, "", 80),
        authorEmail: stringOr(record.authorEmail, "", 254),
        authorPhoto: httpsUrlOrNull(record.authorPhoto),
        createdAt: toIso(record.createdAt),
        updatedAt: toIso(record.updatedAt),
        likeCount: Array.isArray(record.likes) ? record.likes.length : 0,
        comments: comments.map(toAdminComment).filter((comment): comment is AdminFeedbackComment => Boolean(comment)),
        status: feedbackStatus(record.status),
        statusUpdatedAt: toIso(record.statusUpdatedAt),
        pinned: record.pinned === true,
        pinnedAt: record.pinned === true ? toIso(record.pinnedAt) : null,
    };
}

/** How many items there are in all and by status; items without a status count as open. */
async function feedbackCounts(): Promise<FeedbackCounts> {
    const [all, ...explicit] = await Promise.all([
        countServerQuery({ collectionId: "feedback" }),
        ...FEEDBACK_STATUSES.filter((status) => status !== "open").map((status) => countServerQuery({
            collectionId: "feedback",
            where: [{ field: "status", op: "EQUAL", value: status }],
        }).then((count) => [status, count] as const)),
    ]);
    const counts = { all, open: all, planned: 0, "in-progress": 0, done: 0, closed: 0 } as FeedbackCounts;
    for (const [status, count] of explicit) {
        counts[status] = count;
        counts.open -= count;
    }
    counts.open = Math.max(0, counts.open);
    return counts;
}

/**
 * Feedback items and questions with their comments, newest first, a page at
 * a time (`?cursor=`). `?status=` and `?type=` filter them and `?q=` searches
 * the text and the author; an item without a status (from before the admin
 * panel) is open, which a query can't ask for, so the filters are applied
 * while reading. The counts come with the first page.
 */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const params = request.nextUrl.searchParams;
        const cursor = readPageCursor(params, "feedback");
        const needle = readSearch(params);
        const rawStatus = params.get("status");
        const status = rawStatus && rawStatus !== "all" ? requireEnum(rawStatus, FEEDBACK_STATUSES, "invalid_status") : null;
        const rawType = params.get("type");
        const type = rawType && rawType !== "all" ? requireEnum(rawType, TYPES, "invalid_query") : null;
        const [page, counts] = await Promise.all([
            newestPage<FeedbackRecord>({
                collectionId: "feedback",
                field: "createdAt",
                limit: PAGE_SIZE,
                cursor,
                ...(status || type || needle ? {
                    keep: (record: FeedbackRecord) => (!status || feedbackStatus(record.status) === status)
                        && (!type || (record.type === "question" ? "question" : "feedback") === type)
                        && (!needle || matchesSearch(needle, [record.content, record.description, record.author, record.authorEmail].map((value) => (typeof value === "string" ? value : null)))),
                } : {}),
            }),
            cursor ? Promise.resolve(null) : feedbackCounts().catch(() => null),
        ]);
        const payload: AdminFeedbackResponse = { items: page.items.map(toAdminFeedback), nextCursor: page.nextCursor, counts };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "feedback:get");
    }
}

export async function POST(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator", mutation: true });
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    try {
        const body = await readAdminBody(request, ["action", "id", "status", "text", "commentId"], 24_576);
        const action = requireEnum(body.action, ACTIONS, "invalid_action");
        const id = requireDocId(body.id, 64);
        const commentAction = action === "pinComment" || action === "unpinComment";
        if ((action !== "setStatus" && body.status !== undefined) || (action !== "reply" && body.text !== undefined) || (!commentAction && body.commentId !== undefined)) {
            throw new AdminHttpError(400, "unknown_field");
        }
        if (PIN_ACTIONS.has(action) && !roleAtLeast(guard.admin.role, "admin")) throw new AdminHttpError(403, "admins_only");
        const path = `feedback/${id}`;

        if (action === "pin" || action === "unpin") {
            const pin = action === "pin";
            const record = await getServerDocument<FeedbackRecord>(path);
            if (!record) throw new AdminHttpError(404, "not_found");
            if ((record.pinned === true) === pin) {
                const unchanged: AdminFeedbackActionResponse = { id, pinned: pin, changed: false };
                return adminJson(unchanged);
            }
            if (pin) {
                const pinnedNow = await countServerQuery({ collectionId: "feedback", where: [{ field: "pinned", op: "EQUAL", value: true }], upTo: BOARD_LIMITS.pinned });
                if (pinnedNow >= BOARD_LIMITS.pinned) throw new AdminHttpError(409, "pin_limit");
            }
            await commitServerPatches([
                { path, data: { pinned: pin, pinnedAt: pin ? new Date() : null }, updateFields: ["pinned", "pinnedAt"], exists: true },
                auditLogPatch(actor, pin ? "feedback.pin" : "feedback.unpin", path, { excerpt: stringOr(record.content, "", 120) }),
            ]);
            const response: AdminFeedbackActionResponse = { id, pinned: pin, changed: true };
            return adminJson(response);
        }

        if (commentAction) {
            const commentId = requireDocId(body.commentId, 100);
            const pin = action === "pinComment";
            // One pinned comment per post: pinning one unpins the others.
            const pinnedCommentId = await withConflictRetry(async () => {
                const record = await getServerDocument<FeedbackRecord>(path);
                if (!record) throw new AdminHttpError(404, "not_found");
                const comments = Array.isArray(record.comments) ? record.comments as Array<Record<string, unknown>> : [];
                const target = comments.find((comment) => comment && comment.id === commentId);
                if (!target) throw new AdminHttpError(404, "comment_not_found");
                const updated = comments.map((comment) => {
                    if (!comment || typeof comment !== "object") return comment;
                    const next = { ...comment };
                    if (comment.id === commentId) next.pinned = pin;
                    else if (pin) delete next.pinned;
                    return next;
                });
                await commitServerMutations([
                    { type: "update", path, data: { comments: updated }, updateFields: ["comments"], ...(record._updateTime ? { updateTime: record._updateTime } : {}) },
                    auditLogMutation(actor, pin ? "feedback.pin" : "feedback.unpin", path, { commentId, excerpt: stringOr(target.content, "", 120) }),
                ]);
                return pin ? commentId : null;
            });
            const response: AdminFeedbackActionResponse = { id, pinnedCommentId, changed: true };
            return adminJson(response);
        }

        if (action === "setStatus") {
            const status = requireEnum(body.status, FEEDBACK_STATUSES, "invalid_status");
            const record = await getServerDocument<FeedbackRecord>(path);
            if (!record) throw new AdminHttpError(404, "not_found");
            const current = feedbackStatus(record.status);
            if (current === status) {
                const unchanged: AdminFeedbackActionResponse = { id, status, changed: false };
                return adminJson(unchanged);
            }
            await commitServerPatches([
                { path, data: { status, statusUpdatedAt: new Date() }, updateFields: ["status", "statusUpdatedAt"], exists: true },
                auditLogPatch(actor, "feedback.set_status", path, { from: current, to: status }),
            ]);
            const response: AdminFeedbackActionResponse = { id, status, changed: true };
            return adminJson(response);
        }

        if (action === "reply") {
            const text = readText(body.text, { max: FEEDBACK_REPLY_MAX, required: true, multiline: true });
            // The feedback document is readable by every signed-in user, so the
            // official reply carries the team name only, never the staff e-mail.
            const comment = {
                id: randomUUID(),
                author: OFFICIAL_AUTHOR,
                authorEmail: "",
                authorPhoto: null,
                content: text,
                replyTo: null,
                replyToContent: null,
                createdAt: new Date().toISOString(),
                official: true,
            };
            await withConflictRetry(async () => {
                const record = await getServerDocument<FeedbackRecord>(path);
                if (!record) throw new AdminHttpError(404, "not_found");
                const comments = Array.isArray(record.comments) ? record.comments : [];
                await commitServerMutations([
                    {
                        type: "update",
                        path,
                        data: { comments: [...comments, comment] },
                        updateFields: ["comments"],
                        ...(record._updateTime ? { updateTime: record._updateTime } : {}),
                    },
                    auditLogMutation(actor, "feedback.reply", path, { commentId: comment.id, excerpt: text.slice(0, 120) }),
                ]);
            });
            const response: AdminFeedbackActionResponse = { id, comment: toAdminComment(comment, 0) ?? undefined, changed: true };
            return adminJson(response);
        }

        const record = await getServerDocument<FeedbackRecord>(path);
        if (!record) throw new AdminHttpError(404, "not_found");
        await commitServerMutations([
            { type: "delete", path },
            auditLogMutation(actor, "feedback.delete", path, {
                type: record.type === "question" ? "question" : "feedback",
                authorEmail: stringOr(record.authorEmail, "", 254),
                excerpt: stringOr(record.content, "", 120),
            }),
        ]);
        const response: AdminFeedbackActionResponse = { id, deleted: true, changed: true };
        return adminJson(response);
    } catch (error) {
        return adminFailure(error, "feedback:post");
    }
}
