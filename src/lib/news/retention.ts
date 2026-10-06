/**
 * How long Hanogt News keeps a story. The live feed, its stored fallback and
 * the comments only cover the last day; anything older is deleted. Shared by
 * the server (feed and cleanup) and the browser (open tabs drop old stories).
 */

export const NEWS_RETENTION_MS = 24 * 3600 * 1000;

/** Undated stories nobody has seen in any feed for this long are forgotten. */
export const UNDATED_FORGET_MS = 2 * NEWS_RETENTION_MS;

/** At most this many undated stories are remembered. */
export const UNDATED_MEMORY_MAX = 1500;

/** The oldest publication time (ms) a story may have at `now`. */
export function newsCutoff(now: number) {
    return now - NEWS_RETENTION_MS;
}

export function isWithinRetention(publishedAt: string, now: number) {
    const time = Date.parse(publishedAt);
    return Number.isFinite(time) && time >= newsCutoff(now);
}

/** Stories younger than a day, in their original order. */
export function dropExpiredStories<T extends { publishedAt: string }>(items: readonly T[], now: number): T[] {
    return items.filter((item) => isWithinRetention(item.publishedAt, now));
}

/** When an undated story was first and last seen in a feed (ISO times). */
export type UndatedSighting = { first: string; last: string };

/**
 * Gives every story without a date the time it was first seen, so it ages like
 * the others instead of looking new on every refresh. `memory` is updated in
 * place: sightings are refreshed, stories missing from every feed for
 * UNDATED_FORGET_MS are dropped and the newest UNDATED_MEMORY_MAX are kept.
 */
export function resolveUndated<T extends { id: string; publishedAt: string | null }>(
    items: readonly T[],
    memory: Map<string, UndatedSighting>,
    now: number,
): Array<T & { publishedAt: string }> {
    const nowIso = new Date(now).toISOString();
    const resolved = items.map((item) => {
        if (item.publishedAt) return item as T & { publishedAt: string };
        const known = memory.get(item.id);
        if (known) {
            known.last = nowIso;
            return { ...item, publishedAt: known.first };
        }
        memory.set(item.id, { first: nowIso, last: nowIso });
        return { ...item, publishedAt: nowIso };
    });
    for (const [id, sighting] of memory) {
        const last = Date.parse(sighting.last);
        if (!Number.isFinite(last) || now - last > UNDATED_FORGET_MS) memory.delete(id);
    }
    if (memory.size > UNDATED_MEMORY_MAX) {
        const newest = [...memory.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, UNDATED_MEMORY_MAX);
        memory.clear();
        for (const [id, sighting] of newest) memory.set(id, sighting);
    }
    return resolved;
}

/** Compact form stored with the shared snapshot: [[id, first, last], ...]. */
export function serializeUndated(memory: ReadonlyMap<string, UndatedSighting>) {
    return JSON.stringify([...memory.entries()].map(([id, sighting]) => [id, sighting.first, sighting.last]));
}

export function parseUndated(text: unknown): Map<string, UndatedSighting> {
    const memory = new Map<string, UndatedSighting>();
    if (typeof text !== "string" || !text) return memory;
    try {
        const rows = JSON.parse(text) as unknown;
        if (!Array.isArray(rows)) return memory;
        for (const row of rows) {
            if (!Array.isArray(row) || row.length !== 3) continue;
            const [id, first, last] = row as unknown[];
            if (typeof id !== "string" || typeof first !== "string" || typeof last !== "string") continue;
            if (!/^[a-f0-9]{20}$/.test(id) || !Number.isFinite(Date.parse(first)) || !Number.isFinite(Date.parse(last))) continue;
            memory.set(id, { first, last });
            if (memory.size >= UNDATED_MEMORY_MAX) break;
        }
    } catch {
        // A damaged value only loses the sightings.
    }
    return memory;
}
