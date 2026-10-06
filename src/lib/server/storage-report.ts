import "server-only";

import { commitServerMutations, countServerQuery, runServerQuery, sumServerQuery } from "./firebase-rest";

/**
 * The owner's storage view: how many documents the collections that grow the
 * most hold (and how many bytes, where a size is stored), plus a cleanup of
 * records that have already expired. Firestore deletes those by itself only
 * when the TTL policies in firestore.indexes.json are deployed; until then
 * they keep taking space.
 */

export type StorageGroup = "news" | "files" | "content" | "expiring";

type CollectionInfo = { id: string; group: StorageGroup; sizeField?: string };

export const STORAGE_COLLECTIONS: readonly CollectionInfo[] = [
    { id: "news_items", group: "news" },
    { id: "news_comments", group: "news" },
    { id: "news_meta", group: "news" },
    { id: "message_files", group: "files", sizeField: "size" },
    { id: "voice_clips", group: "files", sizeField: "size" },
    { id: "game_assets", group: "files", sizeField: "size" },
    { id: "projects", group: "content" },
    { id: "game_projects", group: "content" },
    { id: "arcade_games", group: "content" },
    { id: "media_posts", group: "content" },
    { id: "security_rate_limits", group: "expiring" },
    { id: "calls", group: "expiring" },
    { id: "ai_usage_daily", group: "expiring" },
    { id: "automod_events", group: "expiring" },
    { id: "group_reports", group: "expiring" },
    { id: "group_warnings", group: "expiring" },
    { id: "group_mutes", group: "expiring" },
    { id: "group_invites", group: "expiring" },
    { id: "group_invite_links", group: "expiring" },
];

/** Top-level collections whose documents carry an `expiresAt` time (the TTL list of firestore.indexes.json). */
export const EXPIRING_COLLECTIONS = STORAGE_COLLECTIONS.filter((item) => item.group === "expiring").map((item) => item.id);

/** Counting stops here, so a huge collection costs a bounded number of reads. */
const COUNT_CAP = 200_000;
const COMMIT_SIZE = 400;
export const EXPIRED_PURGE_BUDGET = 2_000;

export type StorageRow = {
    id: string;
    group: StorageGroup;
    /** Documents (at most COUNT_CAP); null when the count failed. */
    count: number | null;
    /** True when the count stopped at COUNT_CAP. */
    capped: boolean;
    /** Stored bytes of the files, for collections that record a size. */
    bytes: number | null;
    /**
     * Expired documents still stored; null when they can't be counted, e.g.
     * because the TTL policy is deployed and Firestore handles them itself.
     */
    expired: number | null;
};

export type StorageReport = { rows: StorageRow[]; generatedAt: string };

async function settle<T>(promise: Promise<T>): Promise<T | null> {
    try {
        return await promise;
    } catch {
        return null;
    }
}

export async function buildStorageReport(now = Date.now()): Promise<StorageReport> {
    const expiredFilter = [{ field: "expiresAt", op: "LESS_THAN" as const, value: new Date(now) }];
    const rows = await Promise.all(STORAGE_COLLECTIONS.map(async (item): Promise<StorageRow> => {
        const [count, bytes, expired] = await Promise.all([
            settle(countServerQuery({ collectionId: item.id, upTo: COUNT_CAP })),
            item.sizeField ? settle(sumServerQuery({ collectionId: item.id, field: item.sizeField })) : Promise.resolve(null),
            item.group === "expiring" ? settle(countServerQuery({ collectionId: item.id, where: expiredFilter, upTo: COUNT_CAP })) : Promise.resolve(null),
        ]);
        return { id: item.id, group: item.group, count, capped: count !== null && count >= COUNT_CAP, bytes, expired };
    }));
    return { rows, generatedAt: new Date(now).toISOString() };
}

export type ExpiredPurgeResult = {
    /** Deleted documents per collection. */
    deleted: Record<string, number>;
    /** Collections that couldn't be queried (e.g. their TTL policy is deployed, so the field isn't indexed). */
    skipped: string[];
    /** True when this run found nothing more to delete. */
    done: boolean;
};

/** Deletes records whose `expiresAt` has passed, oldest first, up to `budget` documents in all. */
export async function purgeExpiredRecords(now = Date.now(), budget = EXPIRED_PURGE_BUDGET): Promise<ExpiredPurgeResult> {
    const result: ExpiredPurgeResult = { deleted: {}, skipped: [], done: true };
    let left = Math.max(1, Math.floor(budget));
    for (const collectionId of EXPIRING_COLLECTIONS) {
        if (left <= 0) {
            result.done = false;
            break;
        }
        const limit = Math.min(left, 1000);
        let expired: Array<{ _path: string }>;
        try {
            expired = await runServerQuery<Record<string, unknown>>({
                collectionId,
                where: [{ field: "expiresAt", op: "LESS_THAN", value: new Date(now) }],
                orderBy: [{ field: "expiresAt", direction: "ASCENDING" }],
                select: ["__name__"],
                limit,
            });
        } catch {
            result.skipped.push(collectionId);
            continue;
        }
        for (let index = 0; index < expired.length; index += COMMIT_SIZE) {
            await commitServerMutations(expired.slice(index, index + COMMIT_SIZE).map((doc) => ({ type: "delete" as const, path: doc._path })));
        }
        if (expired.length) result.deleted[collectionId] = expired.length;
        left -= expired.length;
        if (expired.length >= limit) result.done = false;
    }
    return result;
}
