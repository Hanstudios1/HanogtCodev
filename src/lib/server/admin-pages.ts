import "server-only";

import { AdminHttpError, type AdminQueryFilter } from "./admin";
import { runServerQuery } from "./firebase-rest";

/*
 * Pages of an admin list, newest first: ordered by a time field and then by
 * the document's path, so rows with the same time are never skipped or shown
 * twice across pages. The cursor (opaque to the browser) holds both. Some
 * collections keep their times as ISO text (News comments, Arcade games):
 * those are read with `text: true`, since a query only orders and compares
 * values of the same type.
 */

export type PageCursor = { at: string; path: string };

const SAFE_PATH = /^[A-Za-z0-9_-]{1,64}\/[^/\s]{1,300}$/;

export function encodeCursor(cursor: PageCursor) {
    return Buffer.from(JSON.stringify([cursor.at, cursor.path]), "utf8").toString("base64url");
}

/** The cursor a browser sent back, or null when it isn't one of ours. */
export function decodeCursor(value: unknown, collectionId: string): PageCursor | null {
    if (typeof value !== "string" || !value || value.length > 600) return null;
    try {
        const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
        if (!Array.isArray(parsed) || parsed.length !== 2) return null;
        const [at, path] = parsed;
        if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) return null;
        if (typeof path !== "string" || !SAFE_PATH.test(path) || !path.startsWith(`${collectionId}/`)) return null;
        return { at, path };
    } catch {
        return null;
    }
}

/** The `cursor` parameter of a page request: null for the first page; a cursor that isn't ours is refused. */
export function readPageCursor(params: URLSearchParams, collectionId: string) {
    const raw = params.get("cursor");
    if (!raw) return null;
    const cursor = decodeCursor(raw, collectionId);
    if (!cursor) throw new AdminHttpError(400, "invalid_cursor");
    return cursor;
}

/** Lower case without accents or the dotless i, so "sikayet" finds "Şikâyet" and "ivan" finds "IVAN". */
export function foldText(value: string) {
    return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
}

/** The `q` parameter (a text search) folded for matching, or null when there is none. */
export function readSearch(params: URLSearchParams) {
    const value = (params.get("q") ?? "").trim();
    if (!value) return null;
    if (value.length > 100) throw new AdminHttpError(400, "invalid_query");
    return foldText(value);
}

/** Whether any of `fields` contains the folded `needle`. */
export function matchesSearch(needle: string, fields: Array<string | null | undefined>) {
    return fields.some((field) => typeof field === "string" && field && foldText(field).includes(needle));
}

const isoOf = (value: unknown) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
    return null;
};

/** The query position just after `row`, or null when its time isn't readable. */
function positionOf(row: Record<string, unknown> & { _path: string }, field: string, text: boolean): PageCursor | null {
    const value = row[field];
    const at = text ? (typeof value === "string" && value ? value : null) : isoOf(value);
    return at ? { at, path: row._path } : null;
}

/**
 * One page of `collectionId` (newest `field` first). Documents whose `field`
 * isn't a time of the expected type aren't listed. A cursor that doesn't
 * decode is refused by the caller (decodeCursor) before this runs.
 *
 * With `keep`, rows are filtered here instead of by the query (for a filter a
 * query can't express, like "no status yet counts as open", or a text
 * search): the collection is read in batches until the page is full or
 * `maxScan` rows were read, and the cursor marks how far the reading got, so
 * the next page continues from there even when this one came back short.
 */
export async function newestPage<T extends Record<string, unknown>>(options: {
    collectionId: string;
    /** A time field every listed document has: a timestamp, or ISO text with `text`. */
    field: string;
    text?: boolean;
    where?: AdminQueryFilter[];
    select?: string[];
    limit: number;
    cursor: PageCursor | null;
    keep?: (row: T & { _id: string; _path: string }) => boolean;
    /** Rows read at most for one filtered page (default 400). */
    maxScan?: number;
}) {
    const text = options.text === true;
    const read = (cursor: PageCursor | null, limit: number) => runServerQuery<T>({
        collectionId: options.collectionId,
        where: [...(options.where ?? []), { field: options.field, op: "GREATER_THAN", value: text ? "" : new Date(0) }],
        orderBy: [{ field: options.field, direction: "DESCENDING" }, { field: "__name__", direction: "DESCENDING" }],
        ...(options.select ? { select: [...new Set([...options.select, options.field])] } : {}),
        ...(cursor ? { startAfter: [text ? cursor.at : new Date(cursor.at), cursor.path] } : {}),
        limit,
    });

    if (!options.keep) {
        const rows = await read(options.cursor, options.limit + 1);
        const items = rows.slice(0, options.limit);
        const last = items[items.length - 1];
        const next = rows.length > options.limit && last ? positionOf(last, options.field, text) : null;
        return { items, nextCursor: next ? encodeCursor(next) : null };
    }

    const items: Array<T & { _id: string; _path: string }> = [];
    const maxScan = Math.max(options.limit, options.maxScan ?? 400);
    let position = options.cursor;
    let scanned = 0;
    let exhausted = false;
    while (items.length < options.limit && scanned < maxScan && !exhausted) {
        const batch = Math.min(100, maxScan - scanned);
        const rows = await read(position, batch);
        exhausted = rows.length < batch;
        for (const row of rows) {
            if (items.length >= options.limit) {
                // The page filled up before this batch ended: the rest is read again next time.
                exhausted = false;
                break;
            }
            scanned += 1;
            const next = positionOf(row, options.field, text);
            if (!next) continue;
            position = next;
            if (options.keep(row)) items.push(row);
        }
    }
    return { items, nextCursor: !exhausted && position && position !== options.cursor ? encodeCursor(position) : null };
}
