import type { NextRequest } from "next/server";
import type { AdminNewsComment, AdminNewsCommentsResponse } from "@/components/Admin/types";
import {
    AdminHttpError,
    adminFailure,
    adminJson,
    auditLogMutation,
    authorizeAdminRequest,
    readAdminBody,
    requireDocId,
    requireEnum,
    stringOr,
    toIso,
    withConflictRetry,
} from "@/lib/server/admin";
import { matchesSearch, newestPage, readPageCursor, readSearch } from "@/lib/server/admin-pages";
import { commitServerMutations, getServerDocument } from "@/lib/server/firebase-rest";

export const runtime = "nodejs";

type CommentRecord = {
    newsId?: unknown;
    newsTitle?: unknown;
    newsLink?: unknown;
    authorEmail?: unknown;
    authorName?: unknown;
    text?: unknown;
    createdAt?: unknown;
};

const NEWS_ID = /^[a-f0-9]{20}$/;
const PAGE_SIZE = 40;

function articleLink(value: unknown) {
    return typeof value === "string" && value.length <= 2_048 && /^https?:\/\/[^\s"'<>`]+$/.test(value) ? value : null;
}

function toAdminComment(record: CommentRecord & { _id: string }): AdminNewsComment {
    return {
        id: record._id,
        newsId: stringOr(record.newsId, "", 40),
        newsTitle: stringOr(record.newsTitle, "", 200),
        newsLink: articleLink(record.newsLink),
        authorEmail: stringOr(record.authorEmail, "", 254),
        authorName: stringOr(record.authorName, "", 60),
        text: stringOr(record.text, "", 1_000),
        createdAt: toIso(record.createdAt),
    };
}

/**
 * Hanogt News comments, newest first, a page at a time (`?cursor=`); `?q=`
 * searches the text, the author and the headline. Their times are ISO text.
 */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const params = request.nextUrl.searchParams;
        const cursor = readPageCursor(params, "news_comments");
        const needle = readSearch(params);
        const page = await newestPage<CommentRecord>({
            collectionId: "news_comments",
            field: "createdAt",
            text: true,
            limit: PAGE_SIZE,
            cursor,
            ...(needle ? {
                keep: (record: CommentRecord) => matchesSearch(needle, [record.text, record.authorName, record.authorEmail, record.newsTitle].map((value) => (typeof value === "string" ? value : null))),
            } : {}),
        });
        const payload: AdminNewsCommentsResponse = { items: page.items.map(toAdminComment), nextCursor: page.nextCursor };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "news-comments:get");
    }
}

/**
 * Deletes a comment and decrements news_meta/{newsId}.commentCount in the same
 * commit (like the author's own delete). The delete is conditional on the
 * version that was read, so a concurrent delete cannot decrement twice.
 */
export async function POST(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator", mutation: true });
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    try {
        const body = await readAdminBody(request, ["action", "id"]);
        requireEnum(body.action, ["delete"] as const, "invalid_action");
        const id = requireDocId(body.id, 100);
        const path = `news_comments/${id}`;
        await withConflictRetry(async () => {
            const record = await getServerDocument<CommentRecord>(path);
            if (!record) throw new AdminHttpError(404, "not_found");
            const newsId = typeof record.newsId === "string" && NEWS_ID.test(record.newsId) ? record.newsId : null;
            await commitServerMutations([
                { type: "delete", path, ...(record._updateTime ? { updateTime: record._updateTime } : {}) },
                ...(newsId ? [{ type: "increment" as const, path: `news_meta/${newsId}`, fields: { commentCount: -1 } }] : []),
                auditLogMutation(actor, "news_comment.delete", path, {
                    newsId,
                    authorEmail: stringOr(record.authorEmail, "", 254),
                    excerpt: stringOr(record.text, "", 120),
                }),
            ]);
        });
        return adminJson({ id, deleted: true });
    } catch (error) {
        return adminFailure(error, "news-comments:post");
    }
}
