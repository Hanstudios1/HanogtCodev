import "server-only";

import { NEWS_RETENTION_MS } from "@/lib/news/retention";
import { commitServerMutations, deleteServerDocument, listServerCollection, runServerQuery } from "./firebase-rest";

/**
 * Hanogt News keeps nothing older than a day (NEWS_RETENTION_MS). This deletes
 * what is left over in Firestore, a page at a time:
 * - the old archive of every headline (news_items) and its high-water mark,
 *   which are no longer written at all;
 * - comments written more than a day ago (a comment is never older than its
 *   story, so their stories have left the feed);
 * - comment counters (news_meta) no comment has touched for a day.
 * Deletes are spread out (Firestore's free tier allows 20,000 a day).
 */

/** Firestore takes up to 500 writes per commit. */
const COMMIT_SIZE = 400;
/** The automatic cleanup runs at most this often per server instance… */
const AUTO_INTERVAL_MS = 10 * 60_000;
/** …and deletes at most this many documents per run. */
export const AUTO_PURGE_BUDGET = 400;
/** The owner's "clean up now" button deletes at most this many per click. */
export const MANUAL_PURGE_BUDGET = 2_000;

export type NewsPurgeResult = {
    /** Documents of the old unlimited archive deleted in this run. */
    archive: number;
    /** Comments older than a day deleted in this run. */
    comments: number;
    /** Comment counters deleted in this run. */
    counters: number;
    /** True when this run found nothing more to delete. */
    done: boolean;
};

let lastAutoRun = 0;
let running: Promise<NewsPurgeResult> | null = null;
/** Once a run finds the archive empty this instance stops asking for it. */
let archiveEmpty = false;

async function deletePaths(paths: string[]) {
    for (let index = 0; index < paths.length; index += COMMIT_SIZE) {
        await commitServerMutations(paths.slice(index, index + COMMIT_SIZE).map((path) => ({ type: "delete" as const, path })));
    }
}

async function purge(now: number, budget: number): Promise<NewsPurgeResult> {
    const result: NewsPurgeResult = { archive: 0, comments: 0, counters: 0, done: false };
    let left = Math.max(1, Math.floor(budget));
    let archiveDone = archiveEmpty;
    let commentsDone = false;

    if (!archiveEmpty) {
        const limit = Math.min(left, 1000);
        const page = await runServerQuery<Record<string, unknown>>({ collectionId: "news_items", select: ["__name__"], limit });
        await deletePaths(page.map((doc) => doc._path));
        result.archive = page.length;
        left -= page.length;
        if (page.length < limit) {
            await deleteServerDocument("news_cache/archive_state");
            archiveEmpty = true;
            archiveDone = true;
        }
    }

    const cutoff = now - NEWS_RETENTION_MS;
    if (left > 0) {
        const limit = Math.min(left, 1000);
        const old = await runServerQuery<Record<string, unknown>>({
            collectionId: "news_comments",
            where: [{ field: "createdAt", op: "LESS_THAN", value: new Date(cutoff).toISOString() }],
            orderBy: [{ field: "createdAt", direction: "ASCENDING" }],
            select: ["__name__"],
            limit,
        });
        await deletePaths(old.map((doc) => doc._path));
        result.comments = old.length;
        left -= old.length;
        commentsDone = old.length < limit;
    }

    let countersDone = false;
    if (left > 0) {
        const counters = await listServerCollection<Record<string, unknown>>("news_meta", 300);
        const stale = counters.filter((doc) => {
            const touched = Date.parse(doc._updateTime || "");
            return Number.isFinite(touched) && touched < cutoff;
        });
        const batch = stale.slice(0, left);
        await deletePaths(batch.map((doc) => doc._path));
        result.counters = batch.length;
        countersDone = batch.length === stale.length;
    }

    result.done = archiveDone && commentsDone && countersDone;
    return result;
}

/** One cleanup run; parallel callers on this instance share it. */
export function purgeOldNews(options: { now?: number; budget?: number } = {}): Promise<NewsPurgeResult> {
    if (running) return running;
    running = purge(options.now ?? Date.now(), options.budget ?? AUTO_PURGE_BUDGET).finally(() => {
        running = null;
    });
    return running;
}

/** Called after each successful feed refresh: a small run at most every ten minutes per instance. */
export function maybePurgeOldNews(now = Date.now()) {
    if (now - lastAutoRun < AUTO_INTERVAL_MS) return;
    lastAutoRun = now;
    void purgeOldNews({ now }).catch((error: unknown) => {
        // Best effort (e.g. no credentials in local development); the next run tries again.
        console.warn("[news:retention]", error instanceof Error ? error.message : error);
    });
}
