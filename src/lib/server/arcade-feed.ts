import "server-only";

import { isArcadeGenre, type ArcadeGenre } from "@/lib/arcade-genres";
import { ratingFields, readRatingTotals } from "@/lib/arcade-ratings";
import { foldSearchText } from "@/lib/search-fold";
import { ARCADE_LIST_FIELDS, arcadeSummary, creatorIdOf, isCreatorId, type ArcadeRecord } from "./arcade";
import { ensureBackfill, fillMissingFields } from "./backfill";
import { decodeFeedCursor, feedPage, type FeedCursor, type FeedOrder } from "./feed-pages";
import { countServerQuery, getServerDocument, runServerQuery } from "./firebase-rest";

/*
 * The Arcade gallery (/api/arcade): published games a page at a time through
 * indexed queries, sorted by newest, most played or top rated, optionally of
 * one genre or one creator; the featured row; and the public facts of a
 * creator page. Game content (the `game` field) is never read here.
 */

export const ARCADE_SORTS = ["new", "popular", "rated"] as const;
export type ArcadeSort = (typeof ARCADE_SORTS)[number];
export const ARCADE_PAGE_SIZE = 24;
const FEATURED_LIMIT = 8;

/** Each sort and the composite indexes behind it (firestore.indexes.json); the path breaks ties. */
const ORDERS: Record<ArcadeSort, FeedOrder[]> = {
    new: [{ field: "createdAt", type: "text" }],
    popular: [{ field: "plays", type: "number" }, { field: "createdAt", type: "text" }],
    rated: [{ field: "ratingScore", type: "number" }, { field: "createdAt", type: "text" }],
};

export class ArcadeListError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = "ArcadeListError";
        this.status = status;
        this.code = code;
    }
}

export type ArcadeListQuery = {
    sort: ArcadeSort;
    genre: ArcadeGenre | null;
    dimension: "2d" | "3d" | null;
    q: string | null;
    creator: string | null;
    cursor: FeedCursor | null;
};

/**
 * ?sort=new|popular|rated, ?genre=<genre>, ?dimension=2d|3d, ?q=<text>,
 * ?creator=<creator id> (always newest first), ?cursor=<from the previous
 * page>. Throws ArcadeListError for values that can't be ours.
 */
export function readArcadeListQuery(params: URLSearchParams): ArcadeListQuery {
    const rawCreator = params.get("creator");
    const creator = rawCreator ? rawCreator.toLowerCase() : null;
    if (creator && !isCreatorId(creator)) throw new ArcadeListError(400, "invalid_filter", "Geçersiz yapımcı.");
    const rawSort = params.get("sort");
    // Older links: "liked" sorted by likes, which ratings replaced.
    const requested: ArcadeSort = rawSort === "popular" ? "popular" : rawSort === "rated" || rawSort === "liked" ? "rated" : "new";
    const sort: ArcadeSort = creator ? "new" : requested;
    const rawGenre = params.get("genre");
    if (rawGenre && rawGenre !== "all" && !isArcadeGenre(rawGenre)) throw new ArcadeListError(400, "invalid_filter", "Geçersiz oyun türü.");
    const genre = !creator && isArcadeGenre(rawGenre) ? rawGenre : null;
    const rawDimension = params.get("dimension");
    const dimension = rawDimension === "2d" || rawDimension === "3d" ? rawDimension : null;
    const q = (params.get("q") ?? "").trim().replace(/\s+/g, " ");
    if (q.length > 60) throw new ArcadeListError(400, "invalid_filter", "Arama metni çok uzun.");
    let cursor: FeedCursor | null;
    try {
        cursor = decodeFeedCursor(params.get("cursor"), "arcade_games", ORDERS[sort]);
    } catch {
        throw new ArcadeListError(400, "invalid_cursor", "Liste bağlantısı geçersiz; sayfayı yenileyin.");
    }
    return { sort, genre, dimension, q: q ? foldSearchText(q) : null, creator, cursor };
}

/**
 * Games published before genres, creator pages and ratings get those
 * fields once ("other", their creator id, no ratings): queries filtered or
 * ordered by them would leave the games out otherwise. Never throws.
 */
export function ensureArcadeBackfill() {
    return ensureBackfill("arcadeGames", 1, async () => {
        await fillMissingFields("arcade_games", ["ownerEmail", "genre", "creatorId", "ratingCount", "ratingSum", "ratingScore"], (row) => {
            const patch: Record<string, unknown> = {};
            if (!isArcadeGenre(row.genre)) patch.genre = "other";
            if (!isCreatorId(row.creatorId) && typeof row.ownerEmail === "string" && row.ownerEmail) patch.creatorId = creatorIdOf(row.ownerEmail);
            if (typeof row.ratingCount !== "number" || typeof row.ratingSum !== "number" || typeof row.ratingScore !== "number") Object.assign(patch, ratingFields(readRatingTotals({ ratingCount: row.ratingCount, ratingSum: row.ratingSum })));
            return patch;
        });
    });
}

/** One page of the gallery; a dimension and a text search are filtered while reading. */
export async function listArcadePage(query: ArcadeListQuery) {
    const where = query.creator
        ? [{ field: "creatorId", op: "EQUAL" as const, value: query.creator }]
        : query.genre ? [{ field: "genre", op: "EQUAL" as const, value: query.genre }] : [];
    const { dimension, q } = query;
    const page = await feedPage<ArcadeRecord>({
        collectionId: "arcade_games",
        where,
        order: ORDERS[query.sort],
        select: ARCADE_LIST_FIELDS,
        limit: ARCADE_PAGE_SIZE,
        cursor: query.cursor,
        ...(dimension || q ? {
            keep: (record: ArcadeRecord) => {
                const summary = arcadeSummary(record, "");
                return (!dimension || summary.dimension === dimension)
                    && (!q || foldSearchText(`${summary.title} ${summary.description} ${summary.authorName}`).includes(q));
            },
            maxScan: 240,
        } : {}),
    });
    return { games: page.items.map((record) => arcadeSummary(record, record._id)), nextCursor: page.nextCursor };
}

/** Games staff featured, most recently featured first (a handful, so no ordered index is needed). */
export async function listFeaturedArcadeGames() {
    const records = await runServerQuery<ArcadeRecord>({
        collectionId: "arcade_games",
        where: [{ field: "featured", op: "EQUAL", value: true }],
        select: [...ARCADE_LIST_FIELDS, "featuredAt"],
        limit: 24,
    });
    return records
        .sort((a, b) => String(b.featuredAt || "").localeCompare(String(a.featuredAt || "")))
        .slice(0, FEATURED_LIMIT)
        .map((record) => arcadeSummary(record, record._id));
}

type PublicProfile = { nickname?: unknown; username?: unknown; avatarUrl?: unknown };

const httpsImage = (value: unknown) => (typeof value === "string" && /^https:\/\/[^\s"'<>`]+$/.test(value) && value.length <= 2048 ? value : null);

/**
 * The public facts of a creator page: the name and picture from the public
 * profile (the published games' author name when there is none) and how many
 * games are published. Null when the id has no published games. The address
 * is only used to read the profile and never leaves this function.
 */
export async function arcadeCreator(creatorId: string) {
    if (!isCreatorId(creatorId)) return null;
    const [first] = await runServerQuery<ArcadeRecord>({
        collectionId: "arcade_games",
        where: [{ field: "creatorId", op: "EQUAL", value: creatorId }],
        select: ["ownerEmail", "authorName", "authorImage"],
        limit: 1,
    });
    if (!first) return null;
    const email = typeof first.ownerEmail === "string" ? first.ownerEmail : "";
    const [profile, games] = await Promise.all([
        email ? getServerDocument<PublicProfile>(`public_profiles/${email}`, { fields: ["nickname", "username", "avatarUrl"] }).catch(() => null) : Promise.resolve(null),
        countServerQuery({ collectionId: "arcade_games", where: [{ field: "creatorId", op: "EQUAL", value: creatorId }], upTo: 1000 }).catch(() => null),
    ]);
    const text = (value: unknown) => (typeof value === "string" ? value.replace(/[<>]/g, "").trim().slice(0, 60) : "");
    return {
        id: creatorId,
        name: text(profile?.nickname) || text(profile?.username) || text(first.authorName) || "Hanogt geliştiricisi",
        avatar: httpsImage(profile?.avatarUrl) ?? httpsImage(first.authorImage),
        games,
    };
}

export type ArcadeCreator = NonNullable<Awaited<ReturnType<typeof arcadeCreator>>>;
