import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { MEDIA_LIMITS, cleanMediaTags, isValidMediaTag, normalizeMediaTag } from "@/components/Editor/media-publish";
import { foldSearchText } from "@/lib/search-fold";
import { ensureBackfill, fillMissingFields } from "./backfill";
import { decodeFeedCursor, feedPage, type FeedCursor, type FeedOrder } from "./feed-pages";
import { commitServerMutations, getServerDocument, getServerDocuments, isMissingDocument, isWriteConflict, runServerQuery } from "./firebase-rest";
import { moderateText, type ModerationReason } from "./moderation";

/*
 * Hanogt Media's server side shared by /api/media and its tests: the paged
 * gallery (indexed queries, 24 posts at a time, sorted by newest, likes or
 * downloads, filtered by a language or a tag), the viewer's likes of the
 * posts on a page only, and comments (moderated, capped, deletable by their
 * author and by the post's owner).
 */

export type MediaPost = {
    title?: string;
    description?: string;
    language?: string;
    languages?: string[];
    tags?: string[];
    ownerEmail?: string;
    ownerName?: string;
    ownerAvatar?: string | null;
    showAuthor?: boolean;
    sourceProjectId?: string | null;
    fileCount?: number;
    createdAt?: string;
    updatedAt?: string;
    status?: string;
    contributedToSecurity?: boolean;
    license?: string;
    likeCount?: number;
    commentCount?: number;
    downloadCount?: number;
};

export type MediaComment = { postId?: string; authorEmail?: string; authorName?: string; authorAvatar?: string | null; text?: string; createdAt?: string };

type Stored<T> = T & { _id: string; _path?: string; _updateTime?: string };

/** Short, unsalted id of an address used in like and report document ids (unchanged since the first Media version). */
export const emailId = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 40);

export const MEDIA_SORTS = ["likes", "newest", "downloads"] as const;
export type MediaSort = (typeof MEDIA_SORTS)[number];
export const MEDIA_PAGE_SIZE = 24;

/** Each sort and the composite indexes behind it (firestore.indexes.json); the path breaks ties. */
const ORDERS: Record<MediaSort, FeedOrder[]> = {
    newest: [{ field: "createdAt", type: "timestamp" }],
    likes: [{ field: "likeCount", type: "number" }, { field: "createdAt", type: "timestamp" }],
    downloads: [{ field: "downloadCount", type: "number" }, { field: "createdAt", type: "timestamp" }],
};

/** What a gallery card needs (no files; the owner's address only to mark the viewer's own posts). */
const LIST_FIELDS = [
    "title", "description", "language", "languages", "tags", "ownerEmail", "ownerName", "ownerAvatar", "showAuthor", "fileCount",
    "createdAt", "updatedAt", "status", "contributedToSecurity", "license", "likeCount", "commentCount", "downloadCount",
];

const LANGUAGE_FILTER = /^[a-z0-9][a-z0-9.+#-]{0,29}$/;

export class MediaRequestError extends Error {
    readonly status: number;
    readonly code: string;
    readonly reason?: string;

    constructor(status: number, code: string, message: string, reason?: string) {
        super(message);
        this.name = "MediaRequestError";
        this.status = status;
        this.code = code;
        this.reason = reason;
    }
}

export type MediaListQuery = { sort: MediaSort; language: string | null; tag: string | null; q: string | null; cursor: FeedCursor | null };

/**
 * The gallery's query string: ?sort=likes|newest|downloads (likes when left
 * out), ?language=<registry id>, ?tag=<tag>, ?q=<text>, ?cursor=<from the
 * previous page>. Throws MediaRequestError for values that can't be ours.
 */
export function readMediaListQuery(params: URLSearchParams): MediaListQuery {
    const rawSort = params.get("sort");
    const sort = (MEDIA_SORTS as readonly string[]).includes(rawSort ?? "") ? rawSort as MediaSort : "likes";
    const rawLanguage = (params.get("language") ?? "").trim().toLowerCase();
    const language = rawLanguage && rawLanguage !== "all" ? rawLanguage : null;
    if (language && !LANGUAGE_FILTER.test(language)) throw new MediaRequestError(400, "invalid_filter", "Geçersiz dil filtresi.");
    const rawTag = params.get("tag");
    const tag = rawTag ? normalizeMediaTag(rawTag) : null;
    if (rawTag && !isValidMediaTag(tag)) throw new MediaRequestError(400, "invalid_filter", "Geçersiz etiket filtresi.");
    const q = (params.get("q") ?? "").trim().replace(/\s+/g, " ");
    if (q.length > 80) throw new MediaRequestError(400, "invalid_filter", "Arama metni çok uzun.");
    let cursor: FeedCursor | null;
    try {
        cursor = decodeFeedCursor(params.get("cursor"), "media_posts", ORDERS[sort]);
    } catch {
        throw new MediaRequestError(400, "invalid_cursor", "Liste bağlantısı geçersiz; sayfayı yenileyin.");
    }
    return { sort, language, tag: tag || null, q: q ? foldSearchText(q) : null, cursor };
}

function languagesOf(post: MediaPost) {
    return Array.isArray(post.languages) && post.languages.length ? post.languages : [post.language || "text"];
}

/** The card a visitor sees; never the owner's address. */
export function publicMediaPost(post: Stored<MediaPost>, liked: boolean, viewerEmail = "") {
    return {
        id: post._id,
        title: post.title || "İsimsiz proje",
        description: post.description || "",
        language: post.language || "text",
        languages: languagesOf(post),
        // Older posts may carry tags from before the tag rules; only valid ones are shown (and filterable).
        tags: cleanMediaTags(post.tags ?? []),
        author: post.showAuthor ? (post.ownerName || "Hanogt geliştiricisi") : "Anonim geliştirici",
        authorAvatar: post.showAuthor ? (post.ownerAvatar || null) : null,
        showAuthor: Boolean(post.showAuthor),
        fileCount: post.fileCount || 1,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        likeCount: Math.max(0, Number(post.likeCount || 0)),
        commentCount: Math.max(0, Number(post.commentCount || 0)),
        downloadCount: Math.max(0, Number(post.downloadCount || 0)),
        liked,
        owned: Boolean(viewerEmail && post.ownerEmail === viewerEmail),
        contributedToSecurity: Boolean(post.contributedToSecurity),
        license: post.license || "all-rights-reserved",
    };
}

export type PublicMediaPost = ReturnType<typeof publicMediaPost>;

function matchesSearch(post: MediaPost, needle: string) {
    const author = post.showAuthor ? post.ownerName || "" : "";
    return foldSearchText(`${post.title || ""} ${post.description || ""} ${author} ${(post.tags ?? []).join(" ")}`).includes(needle);
}

/** Which of `postIds` the viewer liked: one batch read of their like records for those posts only. */
export async function viewerLikedPosts(email: string, postIds: readonly string[]): Promise<Set<string>> {
    if (!email || !postIds.length) return new Set();
    const ids = [...new Set(postIds)];
    const likes = await getServerDocuments<{ postId?: string }>(ids.map((id) => `media_likes/${id}_${emailId(email)}`), { fields: ["postId"] });
    return new Set(ids.filter((_, index) => likes[index] !== null));
}

/**
 * Older posts have no download counter: a query ordered by it would leave
 * them out, so they get 0 once (see backfill.ts). Never throws.
 */
export function ensureMediaBackfill() {
    return ensureBackfill("mediaPosts", 1, async () => {
        await fillMissingFields("media_posts", ["downloadCount", "likeCount"], (row) => ({
            ...(typeof row.downloadCount === "number" ? {} : { downloadCount: 0 }),
            ...(typeof row.likeCount === "number" ? {} : { likeCount: 0 }),
        }));
    });
}

/**
 * One page of the gallery. A tag or a language narrows the indexed query
 * (with both, the tag does and the language is checked here); unpublished
 * posts and a text search are filtered while reading, with the cursor
 * marking how far it got.
 */
export async function listMediaPage(query: MediaListQuery, viewerEmail = "") {
    const { sort, language, tag, q } = query;
    const where = tag
        ? [{ field: "tags", op: "ARRAY_CONTAINS" as const, value: tag }]
        : language ? [{ field: "languages", op: "ARRAY_CONTAINS" as const, value: language }] : [];
    const page = await feedPage<MediaPost>({
        collectionId: "media_posts",
        where,
        order: ORDERS[sort],
        select: LIST_FIELDS,
        limit: MEDIA_PAGE_SIZE,
        cursor: query.cursor,
        keep: (post) => post.status === "published"
            && (!tag || !language || languagesOf(post).includes(language))
            && (!q || matchesSearch(post, q)),
        maxScan: q ? 300 : 120,
    });
    // The most liked posts lead the first page of the unfiltered gallery.
    const first = !query.cursor && !language && !tag && !q;
    const top = first
        ? (await runServerQuery<MediaPost>({
            collectionId: "media_posts",
            orderBy: [{ field: "likeCount", direction: "DESCENDING" }, { field: "createdAt", direction: "DESCENDING" }],
            select: LIST_FIELDS,
            limit: 6,
        }).catch(() => [])).filter((post) => post.status === "published" && Number(post.likeCount || 0) > 0).slice(0, 3)
        : [];
    const liked = await viewerLikedPosts(viewerEmail, [...page.items, ...top].map((post) => post._id)).catch(() => new Set<string>());
    return {
        posts: page.items.map((post) => publicMediaPost(post, liked.has(post._id), viewerEmail)),
        nextCursor: page.nextCursor,
        ...(first ? { top: top.map((post) => publicMediaPost(post, liked.has(post._id), viewerEmail)) } : {}),
    };
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

/** Counts a download on the post (a deleted post is not brought back). */
export async function countMediaDownload(postId: string) {
    await commitServerMutations([{ type: "increment", path: `media_posts/${postId}`, fields: { downloadCount: 1 }, mustExist: true }]);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** The comment's author and the post's owner may delete a comment. */
export function canDeleteMediaComment(comment: Pick<MediaComment, "authorEmail">, post: Pick<MediaPost, "ownerEmail"> | null, email: string) {
    if (!email) return false;
    return comment.authorEmail === email || Boolean(post && post.ownerEmail === email);
}

export function publicMediaComment(comment: Stored<MediaComment>, post: Pick<MediaPost, "ownerEmail"> | null, viewerEmail = "") {
    return {
        id: comment._id,
        author: comment.authorName || "Kullanıcı",
        authorAvatar: typeof comment.authorAvatar === "string" && comment.authorAvatar.startsWith("https://") ? comment.authorAvatar : null,
        text: comment.text || "",
        createdAt: comment.createdAt,
        mine: Boolean(viewerEmail && comment.authorEmail === viewerEmail),
        canDelete: canDeleteMediaComment(comment, post, viewerEmail),
    };
}

/** A post's comments, oldest first. */
export async function listMediaComments(post: Stored<MediaPost>, viewerEmail = "") {
    const comments = await runServerQuery<MediaComment>({
        collectionId: "media_comments",
        where: [{ field: "postId", op: "EQUAL", value: post._id }],
        limit: MEDIA_LIMITS.commentsPerPost + 50,
    });
    return comments
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
        .map((comment) => publicMediaComment(comment, post, viewerEmail));
}

const REJECTION_STATUS: Partial<Record<ModerationReason, number>> = { "too-long": 413 };

/**
 * Adds a comment after the moderation check (no profanity, personal data,
 * spam or more than two links; 2–500 characters), while the post has fewer
 * than MEDIA_LIMITS.commentsPerPost. The comment and the post's counter
 * change in one commit, which fails if the post was deleted meanwhile.
 */
export async function addMediaComment(input: {
    post: Stored<MediaPost>;
    email: string;
    authorName: string;
    authorAvatar: string | null;
    text: unknown;
    now?: Date;
}) {
    if (typeof input.text !== "string") throw new MediaRequestError(400, "empty_comment", "Yorum boş olamaz.");
    const moderation = moderateText(input.text, { minLength: 2, maxLength: MEDIA_LIMITS.comment, maxLinks: 2 });
    if (!moderation.ok) {
        const reason = moderation.reason ?? "spam";
        throw new MediaRequestError(REJECTION_STATUS[reason] ?? 400, reason === "empty" ? "empty_comment" : "comment_rejected", moderation.message ?? "Yorum gönderilemedi.", reason);
    }
    if (Number(input.post.commentCount || 0) >= MEDIA_LIMITS.commentsPerPost) {
        throw new MediaRequestError(409, "comment_limit", `Bu yayın ${MEDIA_LIMITS.commentsPerPost} yorum sınırına ulaştı.`);
    }
    const id = randomUUID();
    const createdAt = input.now ?? new Date();
    const data = {
        postId: input.post._id,
        authorEmail: input.email,
        authorName: input.authorName.slice(0, 60),
        authorAvatar: input.authorAvatar && /^https:\/\//.test(input.authorAvatar) ? input.authorAvatar.slice(0, 2048) : null,
        text: moderation.text,
        createdAt,
    };
    try {
        await commitServerMutations([
            { type: "create", path: `media_comments/${id}`, data },
            { type: "increment", path: `media_posts/${input.post._id}`, fields: { commentCount: 1 }, mustExist: true },
        ]);
    } catch (error) {
        if (isMissingDocument(error)) throw new MediaRequestError(404, "not_found", "Proje bulunamadı.");
        throw error;
    }
    return publicMediaComment({ ...data, createdAt: createdAt.toISOString(), _id: id }, input.post, input.email);
}

/**
 * Deletes a comment of `postId` for its author or the post's owner (the
 * post's counter goes down with it). A comment of another post, or one that
 * is gone, is "not found"; anyone else gets "forbidden".
 */
export async function deleteMediaComment(input: { postId: string; commentId: string; email: string }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const [comment, post] = await Promise.all([
            getServerDocument<MediaComment>(`media_comments/${input.commentId}`),
            getServerDocument<MediaPost>(`media_posts/${input.postId}`, { fields: ["ownerEmail", "commentCount"] }),
        ]);
        if (!comment || comment.postId !== input.postId) throw new MediaRequestError(404, "comment_not_found", "Yorum bulunamadı.");
        if (!canDeleteMediaComment(comment, post, input.email)) throw new MediaRequestError(403, "comment_forbidden", "Bu yorumu yalnızca yazarı veya yayının sahibi silebilir.");
        try {
            await commitServerMutations([
                { type: "delete", path: `media_comments/${input.commentId}`, ...(comment._updateTime ? { updateTime: comment._updateTime } : {}) },
                ...(post && Number(post.commentCount || 0) > 0
                    ? [{ type: "increment" as const, path: `media_posts/${input.postId}`, fields: { commentCount: -1 }, mustExist: true }]
                    : []),
            ]);
            return;
        } catch (error) {
            // Deleted twice at once, or the post went away meanwhile: read both again.
            if ((isWriteConflict(error) || isMissingDocument(error)) && attempt < 2) continue;
            throw error;
        }
    }
}
