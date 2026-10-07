/**
 * Arcade star ratings (1–5, one per signed-in player and game). A game keeps
 * the total: ratingCount, ratingSum and ratingScore, the sort key of "Top
 * rated". The score is a weighted average that starts from a neutral 3 stars
 * as if RATING_PRIOR_WEIGHT people had given 3 stars, so a single 5-star
 * rating doesn't put a game above one rated 4.6 by fifty players.
 * Shared by the server (src/lib/server/arcade-ratings.ts) and the player page.
 */

export const RATING_PRIOR = 3;
export const RATING_PRIOR_WEIGHT = 3;

export type RatingStars = 1 | 2 | 3 | 4 | 5;
export type RatingTotals = { count: number; sum: number };

export function isRatingStars(value: unknown): value is RatingStars {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

/** Stored totals read defensively (missing or broken values count as no ratings). */
export function readRatingTotals(record: { ratingCount?: unknown; ratingSum?: unknown }): RatingTotals {
    const count = typeof record.ratingCount === "number" && Number.isFinite(record.ratingCount) ? Math.max(0, Math.trunc(record.ratingCount)) : 0;
    const sum = typeof record.ratingSum === "number" && Number.isFinite(record.ratingSum) ? Math.max(0, Math.trunc(record.ratingSum)) : 0;
    // A sum that can't belong to the count (a broken record) is clamped into range.
    return count ? { count, sum: Math.min(Math.max(sum, count), count * 5) } : { count: 0, sum: 0 };
}

/** The weighted average that orders "Top rated" (3 for a game nobody rated). */
export function ratingScore(totals: RatingTotals): number {
    return Math.round(((totals.sum + RATING_PRIOR * RATING_PRIOR_WEIGHT) / (totals.count + RATING_PRIOR_WEIGHT)) * 10_000) / 10_000;
}

/** The plain average shown next to the stars, one decimal; null without ratings. */
export function ratingAverage(totals: RatingTotals): number | null {
    return totals.count ? Math.round((totals.sum / totals.count) * 10) / 10 : null;
}

/** Totals after a player's rating changes from `previous` to `next` (null: none). */
export function applyRatingChange(totals: RatingTotals, previous: RatingStars | null, next: RatingStars | null): RatingTotals {
    const count = Math.max(0, totals.count - (previous ? 1 : 0) + (next ? 1 : 0));
    const sum = Math.max(0, totals.sum - (previous ?? 0) + (next ?? 0));
    return count ? { count, sum } : { count: 0, sum: 0 };
}

/** The fields a game document keeps for its ratings. */
export function ratingFields(totals: RatingTotals) {
    return { ratingCount: totals.count, ratingSum: totals.sum, ratingScore: ratingScore(totals) };
}
