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
    readAdminBody,
    readText,
    requireDocId,
    requireEnum,
    stringOr,
    toIso,
    withConflictRetry,
} from "@/lib/server/admin";
import { commitServerMutations, commitServerPatches, getServerDocument, runServerQuery } from "@/lib/server/firebase-rest";

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
};

const ACTIONS = ["setStatus", "reply", "delete"] as const;

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
    };
}

/** The 300 newest feedback items and questions with their comments. */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const records = await runServerQuery<FeedbackRecord>({
            collectionId: "feedback",
            orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
            limit: 300,
        });
        const payload: AdminFeedbackResponse = { items: records.map(toAdminFeedback) };
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
        const body = await readAdminBody(request, ["action", "id", "status", "text"], 24_576);
        const action = requireEnum(body.action, ACTIONS, "invalid_action");
        const id = requireDocId(body.id, 64);
        if ((action !== "setStatus" && body.status !== undefined) || (action !== "reply" && body.text !== undefined)) {
            throw new AdminHttpError(400, "unknown_field");
        }
        const path = `feedback/${id}`;

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
