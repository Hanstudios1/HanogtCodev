import "server-only";

import { commitServerPatches, getServerDocument, isWriteConflict, patchServerDocument, runServerQuery } from "./firebase-rest";

/*
 * One-time upgrades of documents written before a field existed. A query
 * that orders or filters by a field leaves out every document without it, so
 * when a list starts sorting by a new counter (Media downloads, Arcade
 * ratings) or filtering by a new field (Arcade genres), the older documents
 * get the field once. site_config/backfills keeps the version of each
 * upgrade that finished: every database runs it once, and each server
 * instance checks it with a single read. Only missing fields are written,
 * each against the version that was read, so nothing newer is overwritten.
 */

const BACKFILLS_PATH = "site_config/backfills";
const CONCURRENCY = 6;
const PAGE_SIZE = 300;

const tasks = new Map<string, Promise<boolean>>();

/**
 * Runs `run` once per database for `key` at `version` (later calls in this
 * instance share the first one). Resolves to false when it failed; it is
 * then tried again by a later call. Never throws.
 */
export function ensureBackfill(key: string, version: number, run: () => Promise<void>): Promise<boolean> {
    const memo = `${key}@${version}`;
    let task = tasks.get(memo);
    if (!task) {
        task = (async () => {
            const marker = await getServerDocument<Record<string, unknown>>(BACKFILLS_PATH, { fields: [key] });
            if (Number(marker?.[key]) >= version) return true;
            await run();
            await patchServerDocument(BACKFILLS_PATH, { [key]: version, [`${key}At`]: new Date().toISOString() }, { updateFields: [key, `${key}At`] });
            return true;
        })().catch((error: unknown) => {
            tasks.delete(memo);
            console.warn(`[backfill:${key}]`, error instanceof Error ? error.message : error);
            return false;
        });
        tasks.set(memo, task);
    }
    return task;
}

/** Forgets which upgrades this instance already checked (tests start every case with a new database). */
export function forgetBackfills() {
    tasks.clear();
}

type Row = Record<string, unknown> & { _id: string; _path: string; _updateTime?: string };

/**
 * Gives every document of `collectionId` the fields `fill` returns for it
 * (null or {} when it needs nothing). Reads only the `select` fields, a page
 * at a time; a document changed between the read and the write is read again
 * (up to three times), a deleted one is skipped. Returns how many were written.
 */
export async function fillMissingFields(collectionId: string, select: string[], fill: (row: Row) => Record<string, unknown> | null): Promise<number> {
    let written = 0;
    let after: string | null = null;
    for (;;) {
        const rows: Row[] = await runServerQuery<Record<string, unknown>>({
            collectionId,
            select,
            orderBy: [{ field: "__name__", direction: "ASCENDING" }],
            ...(after ? { startAfter: [after] } : {}),
            limit: PAGE_SIZE,
        });
        const todo = rows.filter((row) => Object.keys(fill(row) ?? {}).length > 0);
        let next = 0;
        const worker = async () => {
            while (next < todo.length) {
                const row = todo[next];
                next += 1;
                if (await fillOne(row, select, fill)) written += 1;
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
        if (rows.length < PAGE_SIZE) return written;
        after = rows[rows.length - 1]._path;
    }
}

async function fillOne(first: Row, select: string[], fill: (row: Row) => Record<string, unknown> | null) {
    let row: Row | null = first;
    for (let attempt = 0; row && attempt < 3; attempt += 1) {
        const data = fill(row) ?? {};
        if (!Object.keys(data).length) return false;
        try {
            await commitServerPatches([{ path: row._path, data, updateFields: Object.keys(data), ...(row._updateTime ? { updateTime: row._updateTime } : { exists: true }) }]);
            return true;
        } catch (error) {
            if (!isWriteConflict(error) && (error as { status?: number }).status !== 404) throw error;
        }
        const fresh: Record<string, unknown> | null = await getServerDocument<Record<string, unknown>>(row._path, { fields: select });
        row = fresh ? { ...fresh, _id: row._id, _path: row._path } : null;
    }
    return false;
}
