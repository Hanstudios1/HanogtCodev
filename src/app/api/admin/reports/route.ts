import type { NextRequest } from "next/server";
import {
    MODERATOR_NOTE_MAX,
    type AdminReport,
    type AdminReportActionResponse,
    type AdminReportGame,
    type AdminReportPost,
    type AdminReportPostFiles,
    type AdminReportsResponse,
    type ReportStatus,
} from "@/components/Admin/types";
import { normalizeArcadeGenre } from "@/lib/arcade-genres";
import { ratingAverage, readRatingTotals } from "@/lib/arcade-ratings";
import { normalizeReportCategory, reportKindOf } from "@/lib/reports";
import {
    AdminHttpError,
    adminError,
    adminFailure,
    adminJson,
    auditLogMutation,
    authorizeAdminRequest,
    countDocuments,
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
import { decodeCursor, newestPage } from "@/lib/server/admin-pages";
import { assertGameId, type ArcadeRecord } from "@/lib/server/arcade";
import { removeArcadeGame } from "@/lib/server/arcade-scores";
import {
    commitServerMutations,
    countServerQuery,
    getServerDocument,
    listServerCollection,
    queryServerCollection,
} from "@/lib/server/firebase-rest";
import { isDocId } from "@/lib/server/validate";

export const runtime = "nodejs";

const ACTIONS = ["resolve", "dismiss", "removeContent", "reopen"] as const;
const PAGE_SIZE = 40;
const CLOSED: ReportStatus[] = ["resolved", "dismissed"];
/** Characters of one file the viewer shows (Media files are far smaller; this is a guard). */
const VIEW_CHARS = 200_000;
const RESOLUTION_FIELDS = ["status", "resolution", "resolvedAt", "resolvedBy", "moderatorNote"];

type ReportRecord = {
    /** "arcade" for reports of Arcade games (gameId); missing or "media" for Media posts (postId). */
    kind?: unknown;
    postId?: unknown;
    gameId?: unknown;
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

/** The fields of a reported game the queue shows (never the game's content). */
const GAME_FIELDS = ["title", "description", "ownerEmail", "authorName", "dimension", "genre", "plays", "likes", "ratingCount", "ratingSum", "createdAt"];

function toReportGame(game: ArcadeRecord): AdminReportGame {
    const totals = readRatingTotals(game);
    return {
        title: stringOr(game.title, "", 120),
        description: stringOr(game.description, "", 400),
        ownerEmail: stringOr(game.ownerEmail, "", 254),
        authorName: stringOr(game.authorName, "", 80),
        dimension: game.dimension === "2d" ? "2d" : "3d",
        genre: normalizeArcadeGenre(game.genre),
        plays: numberOr(game.plays),
        likes: numberOr(game.likes),
        ratingCount: totals.count,
        ratingAverage: ratingAverage(totals),
        createdAt: toIso(game.createdAt),
    };
}

function toAdminReport(record: ReportRecord & { _id: string }, post: PostRecord | null, game: ArcadeRecord | null, postReportCount: number): AdminReport {
    const kind = reportKindOf(record);
    return {
        id: record._id,
        kind,
        postId: kind === "media" ? stringOr(record.postId, "", 100) : "",
        gameId: kind === "arcade" ? stringOr(record.gameId, "", 100) : "",
        category: normalizeReportCategory(record.category),
        reason: stringOr(record.reason, "", 1_200),
        status: reportStatus(record.status),
        reporterEmail: stringOr(record.reporterEmail, "", 254),
        createdAt: toIso(record.createdAt),
        resolution: typeof record.resolution === "string" ? record.resolution.slice(0, 40) : null,
        resolvedAt: toIso(record.resolvedAt),
        resolvedBy: typeof record.resolvedBy === "string" ? record.resolvedBy.slice(0, 254) : null,
        moderatorNote: typeof record.moderatorNote === "string" ? record.moderatorNote.slice(0, MODERATOR_NOTE_MAX) : null,
        postReportCount,
        post: kind === "media" && post ? toReportPost(post) : null,
        game: kind === "arcade" && game ? toReportGame(game) : null,
    };
}

/** The reported post's files for the viewer, whatever its status (the public Media page only shows published posts). */
async function postFiles(postId: string): Promise<AdminReportPostFiles> {
    const [post, files] = await Promise.all([
        getServerDocument<PostRecord & { status?: unknown }>(`media_posts/${postId}`),
        listServerCollection<{ name?: unknown; lang?: unknown; code?: unknown; order?: unknown }>(`media_posts/${postId}/files`, 50),
    ]);
    if (!post) throw new AdminHttpError(404, "not_found");
    return {
        postId,
        title: stringOr(post.title, "", 120),
        status: stringOr(post.status, "published", 30),
        files: files
            .sort((a, b) => numberOr(a.order) - numberOr(b.order))
            .map((file) => {
                const code = typeof file.code === "string" ? file.code : "";
                return { name: stringOr(file.name, "", 200), language: stringOr(file.lang, "text", 30), code: code.slice(0, VIEW_CHARS), truncated: code.length > VIEW_CHARS };
            }),
    };
}

/**
 * Open reports (default; newest first) or closed ones (`?status=closed`; last
 * closed first), a page at a time (`&cursor=`), with the reported post and how
 * many reports of the same kind the post has. `?post=<id>` returns a reported
 * post's files for the viewer instead.
 */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const params = request.nextUrl.searchParams;
        const viewed = params.get("post");
        if (viewed !== null) {
            if (!isDocId(viewed, 100)) return adminError(400, "invalid_id");
            return adminJson(await postFiles(viewed));
        }
        const closed = params.get("status") === "closed";
        const rawCursor = params.get("cursor");
        const cursor = rawCursor ? decodeCursor(rawCursor, "media_reports") : null;
        if (rawCursor && !cursor) return adminError(400, "invalid_cursor");

        const statusFilter = closed
            ? { field: "status", op: "IN" as const, value: CLOSED }
            : { field: "status", op: "EQUAL" as const, value: "open" };
        const [page, openCount, closedCount] = await Promise.all([
            newestPage<ReportRecord>({ collectionId: "media_reports", field: closed ? "resolvedAt" : "createdAt", where: [statusFilter], limit: PAGE_SIZE, cursor }),
            // The tab counts come with the first page only.
            cursor ? Promise.resolve(null) : countDocuments("media_reports", [{ field: "status", op: "EQUAL", value: "open" }]).then((value) => value.count, () => null),
            cursor ? Promise.resolve(null) : countDocuments("media_reports", [{ field: "status", op: "IN", value: CLOSED }]).then((value) => value.count, () => null),
        ]);

        const postIds = [...new Set(page.items.filter((record) => reportKindOf(record) === "media").map((record) => record.postId).filter((id): id is string => isDocId(id, 100)))];
        const gameIds = [...new Set(page.items.filter((record) => reportKindOf(record) === "arcade").map((record) => assertGameId(record.gameId)).filter((id): id is string => Boolean(id)))];
        // Every open report of each post or game (closed tab: every report), not just those on this page.
        const countFor = (field: "postId" | "gameId", id: string) => countServerQuery({
            collectionId: "media_reports",
            where: [{ field, op: "EQUAL", value: id }, ...(closed ? [] : [{ field: "status", op: "EQUAL" as const, value: "open" }])],
        }).catch(() => 1);
        const [posts, games, perPost, perGame] = await Promise.all([
            Promise.all(postIds.map(async (id) => [id, await getServerDocument<PostRecord>(`media_posts/${id}`).catch(() => null)] as const)).then((entries) => new Map(entries)),
            Promise.all(gameIds.map(async (id) => [id, await getServerDocument<ArcadeRecord>(`arcade_games/${id}`, { fields: GAME_FIELDS }).catch(() => null)] as const)).then((entries) => new Map(entries)),
            Promise.all(postIds.map(async (id) => [id, await countFor("postId", id)] as const)).then((entries) => new Map(entries)),
            Promise.all(gameIds.map(async (id) => [id, await countFor("gameId", id)] as const)).then((entries) => new Map(entries)),
        ]);
        const payload: AdminReportsResponse = {
            items: page.items.map((record) => {
                if (reportKindOf(record) === "arcade") {
                    const gameId = String(record.gameId ?? "");
                    return toAdminReport(record, null, games.get(gameId) ?? null, Math.max(1, perGame.get(gameId) ?? 1));
                }
                const postId = String(record.postId ?? "");
                return toAdminReport(record, posts.get(postId) ?? null, null, Math.max(1, perPost.get(postId) ?? 1));
            }),
            nextCursor: page.nextCursor,
            counts: { open: openCount, closed: closedCount },
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
    const first = await getServerDocument<ReportRecord>(`media_reports/${reportId}`);
    if (first && reportKindOf(first) === "arcade") return removeReportedGame(actor, reportId, note);
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

/**
 * Takes a reported Arcade game off the Arcade the way staff unpublish one
 * (likes, ratings, scores, unlocks and its own copies of files go too); every
 * open report of the game is closed as "content_removed" in the same commit
 * as the removal and the audit entry. A game that is already gone only has
 * its reports closed.
 */
async function removeReportedGame(actor: string, reportId: string, note: string): Promise<AdminReportActionResponse> {
    const closedReportIds = await withConflictRetry(async () => {
        const report = await getServerDocument<ReportRecord>(`media_reports/${reportId}`);
        if (!report) throw new AdminHttpError(404, "not_found");
        if (report.status !== "open") throw new AdminHttpError(409, "already_handled");
        const gameId = assertGameId(report.gameId);
        if (!gameId) throw new AdminHttpError(400, "invalid_id");
        const path = `arcade_games/${gameId}`;
        const [game, reports] = await Promise.all([
            getServerDocument<ArcadeRecord>(path, { fields: ["title", "ownerEmail", "plays", "likes"] }),
            queryServerCollection<ReportRecord>("media_reports", "gameId", "EQUAL", gameId, { limit: 450 }),
        ]);
        const open = reports.filter((item) => item.status === "open");
        if (!open.some((item) => item._id === reportId)) {
            open.push({ ...report, _id: reportId, _path: `media_reports/${reportId}`, _updateTime: report._updateTime });
        }
        const now = new Date();
        const writes = [
            ...open.map((item) => ({
                type: "update" as const,
                path: `media_reports/${item._id}`,
                data: { status: "resolved", resolution: "content_removed", resolvedAt: now, resolvedBy: actor, moderatorNote: note || undefined },
                updateFields: RESOLUTION_FIELDS,
                // A report handled by someone else in the meantime aborts the whole commit.
                ...(item._updateTime ? { updateTime: item._updateTime } : {}),
            })),
            auditLogMutation(actor, "report.remove_game", path, {
                reportId,
                gameId,
                title: game ? stringOr(game.title, "", 120) : null,
                ownerEmail: game ? stringOr(game.ownerEmail, "", 254) : null,
                plays: game ? numberOr(game.plays) : null,
                category: stringOr(report.category, "other", 30),
                reportsClosed: open.length,
                gameMissing: !game,
                note: note || null,
            }),
        ];
        if (game) await removeArcadeGame(gameId, writes);
        else await commitServerMutations(writes);
        return open.map((item) => item._id);
    });
    return { reportId, status: "resolved", closedReportIds, cleanup: "complete" };
}

/** Puts a resolved or dismissed report back in the queue (not one whose post was removed: it is gone). */
async function reopenReport(actor: string, reportId: string): Promise<AdminReportActionResponse> {
    const path = `media_reports/${reportId}`;
    await withConflictRetry(async () => {
        const report = await getServerDocument<ReportRecord>(path);
        if (!report) throw new AdminHttpError(404, "not_found");
        if (report.status === "open") throw new AdminHttpError(409, "already_handled");
        if (report.resolution === "content_removed") throw new AdminHttpError(409, "no_change");
        await commitServerMutations([
            {
                type: "update",
                path,
                data: { status: "open" },
                // Deleting the closing fields (listed in the mask, absent from the data).
                updateFields: RESOLUTION_FIELDS,
                ...(report._updateTime ? { updateTime: report._updateTime } : {}),
            },
            auditLogMutation(actor, "report.reopen", path, {
                ...(reportKindOf(report) === "arcade" ? { gameId: stringOr(report.gameId, "", 100) } : { postId: stringOr(report.postId, "", 100) }),
                previous: stringOr(report.resolution, stringOr(report.status, "", 30), 30),
            }),
        ]);
    });
    return { reportId, status: "open", closedReportIds: [] };
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
        if (action === "reopen") return adminJson(await reopenReport(actor, reportId));

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
                    ...(reportKindOf(report) === "arcade" ? { gameId: stringOr(report.gameId, "", 100) } : { postId: stringOr(report.postId, "", 100) }),
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
