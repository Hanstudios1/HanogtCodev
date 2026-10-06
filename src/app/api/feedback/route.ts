import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/components/Admin/types";
import { getActiveSession } from "@/lib/server/active-session";
import { isOwnerEmail, resolveUserRole, toIso } from "@/lib/server/admin";
import { createServerDocument, deleteServerDocument, getServerDocument, patchServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { moderateText } from "@/lib/server/moderation";
import { getClientKey, isSameOrigin } from "@/lib/server/request-security";
import { SupportError, requireRateLimit, supportError, supportFailure, supportJson, withWriteRetry } from "@/lib/server/support";
import { isDocId, normalizeEmail, readJsonBody } from "@/lib/server/validate";
import {
    BOARD_LIMITS,
    type BoardAuthor,
    type BoardAuthorProfile,
    type BoardComment,
    type BoardItem,
    type BoardResponse,
    type BoardStaffRole,
    type SupportErrorCode,
    canPinFeedback,
    sortBoardItems,
} from "@/lib/support";

export const runtime = "nodejs";

type StoredComment = {
    id?: unknown;
    author?: unknown;
    authorEmail?: unknown;
    authorPhoto?: unknown;
    content?: unknown;
    replyTo?: unknown;
    replyToContent?: unknown;
    replyToAuthor?: unknown;
    createdAt?: unknown;
    editedAt?: unknown;
    official?: unknown;
    pinned?: unknown;
};

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
    pinned?: unknown;
    pinnedAt?: unknown;
};

type CommentEntry = StoredComment & { id: string };

const PROFILE_FIELDS = [
    "email", "username", "nickname", "nicknameTag", "avatarUrl", "staffRole", "publicProfile", "bio", "bannerUrl", "accentColor",
    "customStatus", "favoriteLangs", "socialGithub", "socialLinkedin", "socialTwitter", "socialWebsite", "badges", "dndMode",
];
const STAFF_ROLES: readonly BoardStaffRole[] = ["owner", "admin", "moderator"];
/** Anonymous visitors all see the same board, so it is shared for a few seconds per instance. */
const ANONYMOUS_CACHE_MS = 15_000;
let anonymousCache: { at: number; payload: BoardResponse } | null = null;

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.slice(0, max) : "";
}

function httpsOrNull(value: unknown) {
    return typeof value === "string" && value.length <= 2_048 && /^https:\/\/[^\s"'<>`]+$/.test(value) ? value : null;
}

function optional(value: unknown, max: number) {
    return typeof value === "string" && value.trim() ? value.slice(0, max) : undefined;
}

/** Opaque, salted id of an author: equal for the same person, never reversible to the e-mail. */
function authorKey(email: string) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || "hanogt";
    return createHash("sha256").update(`${salt}:feedback-author:${email}`).digest("hex").slice(0, 20);
}

/** Stored comments with stable ids (old comments had none and were addressed by position). */
function commentEntries(record: FeedbackRecord): CommentEntry[] {
    const list = Array.isArray(record.comments) ? record.comments : [];
    return list
        .map((value) => (value && typeof value === "object" && !Array.isArray(value) ? value as StoredComment : null))
        .map((comment, index) => (comment ? { ...comment, id: isDocId(comment.id, 100) ? comment.id : `comment_${index}` } : null))
        .filter((comment): comment is CommentEntry => Boolean(comment));
}

function likesOf(record: FeedbackRecord) {
    return Array.isArray(record.likes) ? record.likes.filter((value): value is string => typeof value === "string") : [];
}

function feedbackStatus(value: unknown): FeedbackStatus {
    return (FEEDBACK_STATUSES as readonly unknown[]).includes(value) ? value as FeedbackStatus : "open";
}

// ---------------------------------------------------------------------------
// Public board (GET)
// ---------------------------------------------------------------------------

async function loadProfiles(emails: string[]) {
    const profiles = new Map<string, Record<string, unknown>>();
    const chunks: string[][] = [];
    for (let index = 0; index < Math.min(emails.length, 300); index += 30) chunks.push(emails.slice(index, index + 30));
    const results = await Promise.all(chunks.map((chunk) => runServerQuery<Record<string, unknown>>({
        collectionId: "public_profiles",
        where: [{ field: "email", op: "IN", value: chunk }],
        select: PROFILE_FIELDS,
        limit: 60,
    }).catch(() => [])));
    for (const profile of results.flat()) {
        const email = normalizeEmail(profile.email) || normalizeEmail(profile._id);
        if (email) profiles.set(email, profile);
    }
    return profiles;
}

function extendedProfile(profile: Record<string, unknown>, name: string): BoardAuthorProfile {
    const list = (value: unknown, size: number) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, size).map((item) => item.slice(0, 40)) : undefined);
    return {
        username: name,
        nickname: optional(profile.nickname, 100),
        nicknameTag: typeof profile.nicknameTag === "string" && /^\d{4}$/.test(profile.nicknameTag) ? profile.nicknameTag : undefined,
        avatarUrl: httpsOrNull(profile.avatarUrl) ?? undefined,
        bannerUrl: httpsOrNull(profile.bannerUrl) ?? undefined,
        bio: optional(profile.bio, 2_000),
        customStatus: optional(profile.customStatus, 300),
        accentColor: typeof profile.accentColor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(profile.accentColor) ? profile.accentColor : undefined,
        favoriteLangs: list(profile.favoriteLangs, 20),
        socialGithub: optional(profile.socialGithub, 200),
        socialLinkedin: optional(profile.socialLinkedin, 200),
        socialTwitter: optional(profile.socialTwitter, 200),
        socialWebsite: optional(profile.socialWebsite, 200),
        badges: list(profile.badges, 30),
        dndMode: profile.dndMode === true,
    };
}

function boardAuthor(id: string, email: string | null, profile: Record<string, unknown> | null, fallbackName: unknown, fallbackPhoto: unknown, withProfile: boolean): BoardAuthor {
    const name = text(profile?.username, 100).trim() || text(fallbackName, 80).trim();
    const tag = typeof profile?.nicknameTag === "string" && /^\d{4}$/.test(profile.nicknameTag) ? profile.nicknameTag : null;
    const storedRole = STAFF_ROLES.find((role) => role === profile?.staffRole) ?? null;
    return {
        id,
        name,
        avatarUrl: httpsOrNull(profile?.avatarUrl) ?? httpsOrNull(fallbackPhoto),
        nickname: tag ? optional(profile?.nickname, 100) ?? null : null,
        nicknameTag: tag,
        staffRole: email && isOwnerEmail(email) ? "owner" : storedRole,
        // Profile cards are for signed-in viewers, and only when the profile is public.
        profile: withProfile && profile && profile.publicProfile !== false ? extendedProfile(profile, name) : null,
    };
}

function buildBoard(records: Array<FeedbackRecord & { _id: string }>, profiles: Map<string, Record<string, unknown>>, viewer: string | null, canPin = false): BoardResponse {
    const authors: Record<string, BoardAuthor> = {};
    const authorFor = (rawEmail: unknown, fallbackName: unknown, fallbackPhoto: unknown, fallbackKey: string) => {
        const email = normalizeEmail(rawEmail) || null;
        const id = authorKey(email ?? `unknown:${fallbackKey}`);
        authors[id] ??= boardAuthor(id, email, email ? profiles.get(email) ?? null : null, fallbackName, fallbackPhoto, Boolean(viewer));
        return id;
    };

    const items: BoardItem[] = records.map((record) => {
        const likes = likesOf(record);
        const entries = commentEntries(record).slice(-BOARD_LIMITS.comments);
        const comments: BoardComment[] = entries.map((comment) => {
            const official = comment.official === true;
            const replied = typeof comment.replyTo === "string" ? entries.find((entry) => entry.id === comment.replyTo) : undefined;
            return {
                id: comment.id,
                authorId: official ? null : authorFor(comment.authorEmail, comment.author, comment.authorPhoto, `${record._id}:${comment.id}`),
                official,
                content: text(comment.content, BOARD_LIMITS.comment),
                replyTo: typeof comment.replyTo === "string" ? comment.replyTo.slice(0, 100) : null,
                replyToAuthor: replied ? (replied.official === true ? null : text(replied.author, 80) || null) : text(comment.replyToAuthor, 80) || null,
                replyToContent: replied ? text(replied.content, 200) : text(comment.replyToContent, 200) || null,
                createdAt: toIso(comment.createdAt),
                editedAt: toIso(comment.editedAt),
                own: Boolean(viewer && !official && comment.authorEmail === viewer),
                pinned: comment.pinned === true,
            };
        });
        return {
            id: record._id,
            type: record.type === "question" ? "question" : "feedback",
            content: text(record.content, BOARD_LIMITS.content),
            description: typeof record.description === "string" && record.description ? record.description.slice(0, BOARD_LIMITS.description) : null,
            authorId: authorFor(record.authorEmail, record.author, record.authorPhoto, record._id),
            createdAt: toIso(record.createdAt),
            editedAt: toIso(record.updatedAt),
            likeCount: likes.length,
            likedByMe: Boolean(viewer && likes.includes(viewer)),
            own: Boolean(viewer && record.authorEmail === viewer),
            status: feedbackStatus(record.status),
            comments,
            pinned: record.pinned === true,
            pinnedAt: record.pinned === true ? toIso(record.pinnedAt) : null,
        };
    });
    return { items: sortBoardItems(items), authors, viewer: { signedIn: Boolean(viewer), canPin: Boolean(viewer) && canPin } };
}

/** The public board: anyone may read it; likes, ownership and profile cards depend on the viewer. */
export async function GET(request: NextRequest) {
    try {
        await requireRateLimit(`feedback:read:${getClientKey(request)}`, 90, 60_000);
        const active = await getActiveSession();
        const viewer = active?.email ?? null;
        if (!viewer && anonymousCache && Date.now() - anonymousCache.at < ANONYMOUS_CACHE_MS) return supportJson(anonymousCache.payload);
        const [newest, pinned] = await Promise.all([
            runServerQuery<FeedbackRecord>({
                collectionId: "feedback",
                orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
                limit: BOARD_LIMITS.items,
            }),
            // Pinned posts stay on the board even when they are older than the newest page.
            runServerQuery<FeedbackRecord>({
                collectionId: "feedback",
                where: [{ field: "pinned", op: "EQUAL", value: true }],
                limit: BOARD_LIMITS.pinned * 2,
            }).catch(() => []),
        ]);
        const seen = new Set(newest.map((record) => record._id));
        const records = [...newest, ...pinned.filter((record) => !seen.has(record._id))];
        const emails = new Set<string>();
        for (const record of records) {
            const author = normalizeEmail(record.authorEmail);
            if (author) emails.add(author);
            for (const comment of commentEntries(record)) {
                const commenter = comment.official === true ? "" : normalizeEmail(comment.authorEmail);
                if (commenter) emails.add(commenter);
            }
        }
        const role = active ? resolveUserRole(active.email, (active.user as Record<string, unknown>).role) : "user";
        const payload = buildBoard(records, await loadProfiles([...emails]), viewer, canPinFeedback(role));
        if (!viewer) anonymousCache = { at: Date.now(), payload };
        return supportJson(payload);
    } catch (error) {
        return supportFailure(error, "feedback:get");
    }
}

// ---------------------------------------------------------------------------
// Mutations (POST)
// ---------------------------------------------------------------------------

const MODERATION_CODES: Record<string, SupportErrorCode> = { profanity: "profanity", "personal-data": "personal_data", links: "links", spam: "spam" };

/** Public text: trimmed, length-checked and screened for profanity, personal data and spam. */
function publicText(value: unknown, max: number, kind: "content" | "comment", required: boolean) {
    if (value !== undefined && value !== null && typeof value !== "string") throw new SupportError(400, "invalid_body");
    const raw = typeof value === "string" ? value : "";
    if (!raw.trim()) {
        if (required) throw new SupportError(400, kind === "comment" ? "comment_required" : "content_required");
        return "";
    }
    const result = moderateText(raw, { minLength: 1, maxLength: max, maxLinks: 3 });
    if (result.ok) return result.text;
    if (result.reason === "too-long") throw new SupportError(400, kind === "comment" ? "comment_too_long" : "content_too_long");
    if (result.reason === "empty") throw new SupportError(400, kind === "comment" ? "comment_required" : "content_required");
    throw new SupportError(400, MODERATION_CODES[result.reason ?? ""] ?? "spam");
}

async function loadItem(itemId: string) {
    const item = await getServerDocument<FeedbackRecord>(`feedback/${itemId}`);
    if (!item) throw new SupportError(404, "not_found");
    return item;
}

function versioned(item: { _updateTime?: string }) {
    return item._updateTime ? { updateTime: item._updateTime } : {};
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return supportError(403, "bad_origin");
    try {
        const active = await getActiveSession();
        if (!active) throw new SupportError(401, "auth_required");
        const { email, session } = active;
        await requireRateLimit(`feedback:${email}`, 30, 60_000);
        const body = await readJsonBody(request, 64_000);
        if (!body) throw new SupportError(400, "invalid_body");
        const action = typeof body.action === "string" ? body.action : "";

        const authorInfo = async () => {
            const profile = await getServerDocument<{ username?: unknown; avatarUrl?: unknown }>(`public_profiles/${email}`).catch(() => null);
            return {
                name: (text(profile?.username, 80) || session?.user?.name || email.split("@")[0]).slice(0, 80),
                photo: httpsOrNull(profile?.avatarUrl) ?? httpsOrNull(session?.user?.image),
            };
        };

        if (action === "create") {
            const content = publicText(body.content, BOARD_LIMITS.content, "content", true);
            const description = publicText(body.description, BOARD_LIMITS.description, "content", false);
            await requireRateLimit(`feedback:create:${email}`, 10, 60 * 60_000);
            const author = await authorInfo();
            await createServerDocument("feedback", {
                type: body.type === "question" ? "question" : "feedback",
                content,
                description: description || null,
                author: author.name,
                authorEmail: email,
                authorPhoto: author.photo,
                createdAt: new Date(),
                likes: [],
                comments: [],
                status: "open",
            });
            anonymousCache = null;
            return supportJson({ success: true }, 201);
        }

        // Feedback ids are Firestore auto ids; anything else (e.g. "../credentials/x")
        // would let the path escape the collection.
        const itemId = body.itemId;
        if (!isDocId(itemId, 64)) throw new SupportError(400, "invalid_id");
        const path = `feedback/${itemId}`;

        if (action === "like") {
            await withWriteRetry(async () => {
                const item = await loadItem(itemId);
                const likes = likesOf(item);
                await patchServerDocument(path, { likes: likes.includes(email) ? likes.filter((value) => value !== email) : [...likes, email] }, versioned(item));
            });
        } else if (action === "edit") {
            const content = publicText(body.content, BOARD_LIMITS.content, "content", true);
            const description = publicText(body.description, BOARD_LIMITS.description, "content", false);
            await withWriteRetry(async () => {
                const item = await loadItem(itemId);
                if (item.authorEmail !== email) throw new SupportError(403, "forbidden");
                await patchServerDocument(path, { content, description: description || null, updatedAt: new Date() }, versioned(item));
            });
        } else if (action === "delete") {
            const item = await loadItem(itemId);
            if (item.authorEmail !== email) throw new SupportError(403, "forbidden");
            await deleteServerDocument(path);
        } else if (action === "comment") {
            const content = publicText(body.content, BOARD_LIMITS.comment, "comment", true);
            const replyTo = body.replyTo === undefined || body.replyTo === null || body.replyTo === "" ? null : body.replyTo;
            if (replyTo !== null && !isDocId(replyTo, 100)) throw new SupportError(400, "invalid_id");
            await requireRateLimit(`feedback:comment:${email}`, 20, 10 * 60_000);
            const author = await authorInfo();
            await withWriteRetry(async () => {
                const item = await loadItem(itemId);
                const comments = commentEntries(item);
                if (comments.length >= BOARD_LIMITS.comments) throw new SupportError(409, "too_many_comments");
                // The quoted text comes from the stored comment, never from the client.
                const replied = replyTo ? comments.find((comment) => comment.id === replyTo) : null;
                if (replyTo && !replied) throw new SupportError(404, "comment_not_found");
                comments.push({
                    id: randomUUID(),
                    author: author.name,
                    authorEmail: email,
                    authorPhoto: author.photo,
                    content,
                    replyTo: replied ? replied.id : null,
                    replyToAuthor: replied ? (replied.official === true ? null : text(replied.author, 80) || null) : null,
                    replyToContent: replied ? text(replied.content, 200) : null,
                    createdAt: new Date().toISOString(),
                });
                await patchServerDocument(path, { comments }, versioned(item));
            });
        } else if (action === "edit-comment" || action === "delete-comment") {
            const commentId = body.commentId;
            if (!isDocId(commentId, 100)) throw new SupportError(400, "invalid_id");
            const content = action === "edit-comment" ? publicText(body.content, BOARD_LIMITS.comment, "comment", true) : "";
            await withWriteRetry(async () => {
                const item = await loadItem(itemId);
                const comments = commentEntries(item);
                const comment = comments.find((value) => value.id === commentId);
                if (!comment) throw new SupportError(404, "comment_not_found");
                if (comment.official === true || comment.authorEmail !== email) throw new SupportError(403, "forbidden");
                const updated = action === "delete-comment"
                    ? comments.filter((value) => value.id !== commentId)
                    : comments.map((value) => (value.id === commentId ? { ...value, content, editedAt: new Date().toISOString() } : value));
                await patchServerDocument(path, { comments: updated }, versioned(item));
            });
        } else {
            throw new SupportError(400, "invalid_action");
        }

        anonymousCache = null;
        return supportJson({ success: true });
    } catch (error) {
        return supportFailure(error, "feedback:post");
    }
}
