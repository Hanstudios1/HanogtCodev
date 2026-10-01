import type { NextRequest } from "next/server";
import {
    MODERATOR_NOTE_MAX,
    type AdminReport,
    type AdminReportActionResponse,
    type AdminReportPost,
    type AdminReportsResponse,
    type ReportCategory,
    type ReportStatus,
} from "@/components/Admin/types";
import {
    AdminHttpError,
    adminFailure,
    adminJson,
    auditLogMutation,
    authorizeAdminRequest,
    deleteDocumentsInChunks,
    numberOr,
    readAdminBody,
    readText,
    requireDocId,
    requireEnum,
    stringOr,
    toIso,
    withConflictRetry,
    writeAuditLog,
} from "@/lib/server/admin";
import {
    commitServerMutations,
    getServerDocument,
    listServerCollection,
    queryServerCollection,
    runServerQuery,
} from "@/lib/server/firebase-rest";
import { isDocId } from "@/lib/server/validate";

export const runtime = "nodejs";

const CATEGORIES: readonly ReportCategory[] = ["malware", "copyright", "personal_data", "spam", "other"];
const ACTIONS = ["resolve", "dismiss", "removeContent"] as const;
const RESOLUTION_FIELDS = ["status", "resolution", "resolvedAt", "resolvedBy", "moderatorNote"];

type ReportRecord = {
    postId?: unknown;
    reporterEmail?: unknown;
    category?: unknown;
    reason?: unknown;
    status?: unknown;
    createdAt?: unknown;
    resolution?: unknown;
    resolvedAt?: unknown;
    resolvedBy?: unknown;
    moderatorNote?: unknown;
};

type PostRecord = {
    title?: unknown;
    description?: unknown;
    ownerEmail?: unknown;
    ownerName?: unknown;
    language?: unknown;
    fileCount?: unknown;
    likeCount?: unknown;
    commentCount?: unknown;
    createdAt?: unknown;
};

function reportStatus(value: unknown): ReportStatus {
    return value === "resolved" || value === "dismissed" ? value : "open";
}

function toReportPost(post: PostRecord): AdminReportPost {
    return {
        title: stringOr(post.title, "", 120),
        description: stringOr(post.description, "", 400),
        ownerEmail: stringOr(post.ownerEmail, "", 254),
        ownerName: stringOr(post.ownerName, "", 80),
        language: stringOr(post.language, "text", 30),
        fileCount: numberOr(post.fileCount, 1),
        likeCount: numberOr(post.likeCount),
        commentCount: numberOr(post.commentCount),
        createdAt: toIso(post.createdAt),
    };
}

function toAdminReport(record: ReportRecord & { _id: string }, post: PostRecord | null, postReportCount: number): AdminReport {
    return {
        id: record._id,
        postId: stringOr(record.postId, "", 100),
        category: (CATEGORIES as readonly unknown[]).includes(record.category) ? record.category as ReportCategory : "other",
        reason: stringOr(record.reason, "", 1_200),
        status: reportStatus(record.status),
        reporterEmail: stringOr(record.reporterEmail, "", 254),
        createdAt: toIso(record.createdAt),
        resolution: typeof record.resolution === "string" ? record.resolution.slice(0, 40) : null,
        resolvedAt: toIso(record.resolvedAt),
        resolvedBy: typeof record.resolvedBy === "string" ? record.resolvedBy.slice(0, 254) : null,
        moderatorNote: typeof record.moderatorNote === "string" ? record.moderatorNote.slice(0, MODERATOR_NOTE_MAX) : null,
        postReportCount,
        post: post ? toReportPost(post) : null,
    };
}

/** Open reports (default) or closed ones (`?status=closed`), newest first, with the reported post. */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const closed = request.nextUrl.searchParams.get("status") === "closed";
        const records = await runServerQuery<ReportRecord>({
            collectionId: "media_reports",
            where: [closed
                ? { field: "status", op: "IN", value: ["resolved", "dismissed"] }
                : { field: "status", op: "EQUAL", value: "open" }],
            limit: 300,
        });
        const sorted = records
            .sort((a, b) => String(toIso(closed ? b.resolvedAt : b.createdAt) ?? "").localeCompare(String(toIso(closed ? a.resolvedAt : a.createdAt) ?? "")))
            .slice(0, 200);
        const postIds = [...new Set(sorted.map((record) => record.postId).filter((id): id is string => isDocId(id, 100)))];
        const posts = new Map(await Promise.all(postIds.map(async (id) => [
            id,
            await getServerDocument<PostRecord>(`media_posts/${id}`).catch(() => null),
        ] as const)));
        const perPost = new Map<string, number>();
        for (const record of sorted) {
            const postId = String(record.postId ?? "");
            perPost.set(postId, (perPost.get(postId) ?? 0) + 1);
        }
        const payload: AdminReportsResponse = {
            reports: sorted.map((record) => {
                const postId = String(record.postId ?? "");
                return toAdminReport(record, posts.get(postId) ?? null, perPost.get(postId) ?? 1);
            }),
        };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "reports:get");
    }
}

/**
 * Deletes the reported post the way its owner would (post, files, likes,
 * comments, training contribution) but keeps the reports as a record: every
 * open report of the post is closed as "content_removed" in the same commit
 * as the deletion and the audit entry.
 */
async function removeReportedContent(actor: string, reportId: string, note: string): Promise<AdminReportActionResponse> {
    const { postId, postPath, closedReportIds } = await withConflictRetry(async () => {
        const report = await getServerDocument<ReportRecord>(`media_reports/${reportId}`);
        if (!report) throw new AdminHttpError(404, "not_found");
        if (report.status !== "open") throw new AdminHttpError(409, "already_handled");
        if (!isDocId(report.postId, 100)) throw new AdminHttpError(400, "invalid_id");
        const reportedPostId = report.postId;
        const path = `media_posts/${reportedPostId}`;
        const [post, reports] = await Promise.all([
            getServerDocument<PostRecord>(path),
            queryServerCollection<ReportRecord>("media_reports", "postId", "EQUAL", reportedPostId, { limit: 450 }),
        ]);
        const open = reports.filter((item) => item.status === "open");
        if (!open.some((item) => item._id === reportId)) {
            open.push({ ...report, _id: reportId, _path: `media_reports/${reportId}`, _updateTime: report._updateTime });
        }
        const now = new Date();
        await commitServerMutations([
            { type: "delete", path },
            { type: "delete", path: `security_training_contributions/${reportedPostId}` },
            ...open.map((item) => ({
                type: "update" as const,
                path: `media_reports/${item._id}`,
                data: { status: "resolved", resolution: "content_removed", resolvedAt: now, resolvedBy: actor, moderatorNote: note || undefined },
                updateFields: RESOLUTION_FIELDS,
                // A report handled by someone else in the meantime aborts the whole commit.
                ...(item._updateTime ? { updateTime: item._updateTime } : {}),
            })),
            auditLogMutation(actor, "report.remove_content", path, {
                reportId,
                postId: reportedPostId,
                title: post ? stringOr(post.title, "", 120) : null,
                ownerEmail: post ? stringOr(post.ownerEmail, "", 254) : null,
                category: stringOr(report.category, "other", 30),
                reportsClosed: open.length,
                postMissing: !post,
                note: note || null,
            }),
        ]);
        return { postId: reportedPostId, postPath: path, closedReportIds: open.map((item) => item._id) };
    });

    // The post is gone, so its files, likes and comments are unreachable; remove them too.
    let cleanup: "complete" | "partial" = "complete";
    try {
        const [files, likes, comments] = await Promise.all([
            listServerCollection(`${postPath}/files`, 300),
            queryServerCollection("media_likes", "postId", "EQUAL", postId, { limit: 1_000 }),
            queryServerCollection("media_comments", "postId", "EQUAL", postId, { limit: 1_000 }),
        ]);
        await deleteDocumentsInChunks([...files, ...likes, ...comments].map((item) => item._path));
        if (likes.length >= 1_000 || comments.length >= 1_000) cleanup = "partial";
    } catch (error) {
        cleanup = "partial";
        console.warn("[admin:reports] media cleanup failed:", error instanceof Error ? error.message : error);
    }
    if (cleanup === "partial") {
        await writeAuditLog(actor, "media.cleanup_incomplete", postPath, { postId }).catch(() => undefined);
    }
    return { reportId, status: "resolved", closedReportIds, cleanup };
}

export async function POST(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator", mutation: true });
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    try {
        const body = await readAdminBody(request, ["action", "reportId", "note"]);
        const action = requireEnum(body.action, ACTIONS, "invalid_action");
        const reportId = requireDocId(body.reportId, 200);
        const note = readText(body.note, { max: MODERATOR_NOTE_MAX, multiline: true });

        if (action === "removeContent") return adminJson(await removeReportedContent(actor, reportId, note));

        const status: ReportStatus = action === "resolve" ? "resolved" : "dismissed";
        const path = `media_reports/${reportId}`;
        await withConflictRetry(async () => {
            const report = await getServerDocument<ReportRecord>(path);
            if (!report) throw new AdminHttpError(404, "not_found");
            if (report.status !== "open") throw new AdminHttpError(409, "already_handled");
            await commitServerMutations([
                {
                    type: "update",
                    path,
                    data: { status, resolution: status, resolvedAt: new Date(), resolvedBy: actor, moderatorNote: note || undefined },
                    updateFields: RESOLUTION_FIELDS,
                    ...(report._updateTime ? { updateTime: report._updateTime } : {}),
                },
                auditLogMutation(actor, action === "resolve" ? "report.resolve" : "report.dismiss", path, {
                    postId: stringOr(report.postId, "", 100),
                    category: stringOr(report.category, "other", 30),
                    note: note || null,
                }),
            ]);
        });
        const response: AdminReportActionResponse = { reportId, status, closedReportIds: [reportId] };
        return adminJson(response);
    } catch (error) {
        return adminFailure(error, "reports:post");
    }
}
