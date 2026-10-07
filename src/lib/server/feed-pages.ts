import "server-only";

import { runServerQuery } from "./firebase-rest";

/*
 * Public lists read a page at a time ("Load more") through an indexed query
 * instead of reading a whole collection: ordered by one or more fields,
 * highest or newest first, then by the document path, so rows with equal
 * values are never skipped or shown twice across pages. The cursor the
 * browser gets back is opaque (base64url JSON of the last row's ordered
 * values and its path) and is checked again before it reaches a query.
 * Media (/api/media) and the Arcade (/api/arcade) use it.
 */

/** How an ordered field is stored: a number, text (e.g. ISO times kept as strings) or a Firestore timestamp. */
export type FeedOrderType = "number" | "text" | "timestamp";
export type FeedOrder = { field: string; type: FeedOrderType };
export type FeedFilter = NonNullable<Parameters<typeof runServerQuery>[0]["where"]>[number];
export type FeedCursor = { values: Array<number | string>; path: string };
export type FeedRow<T> = T & { _id: string; _path: string; _updateTime?: string };

/** A cursor that wasn't made by this server (or no longer fits the list it is sent with). */
export class FeedCursorError extends Error {
    constructor() {
        super("invalid_cursor");
        this.name = "FeedCursorError";
    }
}

const MAX_CURSOR_CHARS = 800;
const SAFE_PATH = /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,160}$/;

function valueOf(value: unknown, type: FeedOrderType): number | string | null {
    if (type === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
    if (type === "text") return typeof value === "string" && value.length <= 200 ? value : null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

export function encodeFeedCursor(cursor: FeedCursor) {
    return Buffer.from(JSON.stringify([...cursor.values, cursor.path]), "utf8").toString("base64url");
}

/**
 * The cursor a browser sent back for a list of `collectionId` ordered by
 * `order`, or null when there is none; anything else throws FeedCursorError.
 */
export function decodeFeedCursor(raw: string | null | undefined, collectionId: string, order: readonly FeedOrder[]): FeedCursor | null {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw !== "string" || raw.length > MAX_CURSOR_CHARS || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new FeedCursorError();
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
        throw new FeedCursorError();
    }
    if (!Array.isArray(parsed) || parsed.length !== order.length + 1) throw new FeedCursorError();
    const path = parsed[order.length];
    if (typeof path !== "string" || !SAFE_PATH.test(path) || !path.startsWith(`${collectionId}/`)) throw new FeedCursorError();
    const values = order.map((item, index) => valueOf(parsed[index], item.type));
    if (values.some((value) => value === null)) throw new FeedCursorError();
    return { values: values as Array<number | string>, path };
}

/** The position just after `row` in a list ordered by `order`, or null when one of its ordered values is unusable. */
export function feedCursorOf(row: Record<string, unknown> & { _path: string }, order: readonly FeedOrder[]): FeedCursor | null {
    const values = order.map((item) => valueOf(row[item.field], item.type));
    if (values.some((value) => value === null)) return null;
    return { values: values as Array<number | string>, path: row._path };
}

/**
 * One page of `collectionId`, every `order` field descending, then the path.
 *
 * With `keep`, rows are also filtered here (for a filter a query can't
 * express next to the indexed ones, like a text search): the collection is
 * read in batches until the page is full or `maxScan` rows were read, and the
 * cursor marks how far the reading got, so the next page continues from there
 * even when this one came back short.
 */
export async function feedPage<T extends Record<string, unknown>>(options: {
    collectionId: string;
    where?: FeedFilter[];
    order: readonly FeedOrder[];
    select?: string[];
    limit: number;
    cursor: FeedCursor | null;
    keep?: (row: FeedRow<T>) => boolean;
    /** Rows read at most for one filtered page (default 200). */
    maxScan?: number;
}): Promise<{ items: Array<FeedRow<T>>; nextCursor: string | null }> {
    const { order } = options;
    const select = options.select ? [...new Set([...options.select, ...order.map((item) => item.field)])] : undefined;
    const read = (cursor: FeedCursor | null, limit: number) => runServerQuery<T>({
        collectionId: options.collectionId,
        ...(options.where?.length ? { where: options.where } : {}),
        orderBy: [...order.map((item) => ({ field: item.field, direction: "DESCENDING" as const })), { field: "__name__", direction: "DESCENDING" as const }],
        ...(select ? { select } : {}),
        ...(cursor ? { startAfter: [...cursor.values.map((value, index) => (order[index].type === "timestamp" ? new Date(value) : value)), cursor.path] } : {}),
        limit,
    }) as Promise<Array<FeedRow<T>>>;

    if (!options.keep) {
        const rows = await read(options.cursor, options.limit + 1);
        const items = rows.slice(0, options.limit);
        const last = items[items.length - 1];
        const next = rows.length > options.limit && last ? feedCursorOf(last, order) : null;
        return { items, nextCursor: next ? encodeFeedCursor(next) : null };
    }

    const items: Array<FeedRow<T>> = [];
    const maxScan = Math.max(options.limit, options.maxScan ?? 200);
    let position = options.cursor;
    let scanned = 0;
    let exhausted = false;
    // Reads are billed per document: the first batch is just enough for a page
    // that loses nothing to the filter, later ones grow.
    let want = options.limit + 1;
    while (items.length < options.limit && scanned < maxScan && !exhausted) {
        const batch = Math.min(100, maxScan - scanned, want);
        want = Math.min(100, want * 2);
        const rows = await read(position, batch);
        exhausted = rows.length < batch;
        for (const row of rows) {
            if (items.length >= options.limit) {
                // The page filled up before this batch ended: the rest is read again next time.
                exhausted = false;
                break;
            }
            scanned += 1;
            const next = feedCursorOf(row, order);
            if (!next) continue;
            position = next;
            if (options.keep(row)) items.push(row);
        }
    }
    return { items, nextCursor: !exhausted && position && position !== options.cursor ? encodeFeedCursor(position) : null };
}
