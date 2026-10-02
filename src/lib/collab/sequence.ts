/**
 * Which Yjs updates of a live session a browser has applied.
 *
 * The server numbers updates 1, 2, 3… (collab_sessions/{id}/updates) and a
 * compacted snapshot covers every update up to its `seq`. The watermark is
 * the highest number up to which nothing is missing: polls ask for the
 * updates after it. An update that arrives early (a gap below it) is applied
 * at once — Yjs keeps changes with missing dependencies pending until the gap
 * is filled — but the watermark only moves once the gap closes, so the
 * missing ones are fetched again. Duplicates (realtime listener and repair
 * poll overlapping, own updates echoed back) are recognised and skipped.
 */
export class SequenceTracker {
    private mark: number;
    private readonly ahead = new Set<number>();

    constructor(start = 0) {
        this.mark = Number.isFinite(start) && start > 0 ? Math.floor(start) : 0;
    }

    /** Every update up to this number is applied (or covered by a snapshot). */
    get watermark() {
        return this.mark;
    }

    /** The highest number seen, gaps included. */
    get highest() {
        let highest = this.mark;
        for (const seq of this.ahead) if (seq > highest) highest = seq;
        return highest;
    }

    /** Updates beyond a missing one were applied. */
    get hasGap() {
        return this.ahead.size > 0;
    }

    /** The first missing number, or null without a gap. */
    get missing(): number | null {
        return this.ahead.size ? this.mark + 1 : null;
    }

    /**
     * True when the update is new and must be applied; false for duplicates,
     * invalid numbers and updates the watermark already covers.
     */
    accept(seq: number): boolean {
        if (!Number.isSafeInteger(seq) || seq <= this.mark || this.ahead.has(seq)) return false;
        this.ahead.add(seq);
        this.advance();
        return true;
    }

    /**
     * A snapshot that contains every update up to `seq` was applied. Returns
     * false when it adds nothing (older than the watermark).
     */
    coverUpTo(seq: number): boolean {
        if (!Number.isSafeInteger(seq) || seq <= this.mark) return false;
        this.mark = seq;
        for (const pending of this.ahead) if (pending <= seq) this.ahead.delete(pending);
        this.advance();
        return true;
    }

    private advance() {
        while (this.ahead.has(this.mark + 1)) {
            this.mark += 1;
            this.ahead.delete(this.mark);
        }
    }
}

/** Updates in sequence order without duplicate numbers (the first copy wins). */
export function orderUpdates<T extends { seq: number }>(items: readonly T[]): T[] {
    const seen = new Set<number>();
    return [...items]
        .filter((item) => Number.isSafeInteger(item.seq) && item.seq > 0)
        .sort((a, b) => a.seq - b.seq)
        .filter((item) => {
            if (seen.has(item.seq)) return false;
            seen.add(item.seq);
            return true;
        });
}

/**
 * The number the server gives the next update: one more than the highest
 * stored update, never below the snapshot (compaction keeps the newest update
 * document, so a number is never handed out twice).
 */
export function nextSequence(latestStored: number | null | undefined, snapshotSeq: number) {
    const latest = typeof latestStored === "number" && Number.isSafeInteger(latestStored) && latestStored > 0 ? latestStored : 0;
    return Math.max(latest, Number.isSafeInteger(snapshotSeq) && snapshotSeq > 0 ? snapshotSeq : 0) + 1;
}

/**
 * Update documents a compaction up to `snapshotSeq` may delete: covered by
 * the snapshot, not the newest one (it keeps the sequence going) and older
 * than the grace period, so realtime listeners have delivered them.
 */
export function deletableUpdates<T extends { seq: number; at: number }>(items: readonly T[], snapshotSeq: number, now: number, graceMs: number): T[] {
    let newest = 0;
    for (const item of items) if (item.seq > newest) newest = item.seq;
    return items.filter((item) => item.seq <= snapshotSeq && item.seq < newest && item.at > 0 && now - item.at >= graceMs);
}
