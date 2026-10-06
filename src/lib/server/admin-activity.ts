import "server-only";

import type { ActivityBucket, ActivityRange, ActivitySeriesKey, AdminActivityResponse } from "@/components/Admin/types";
import { dayKeyStart, readAiUsageDays, turkeyDayStart, usageDayKey } from "./ai-usage-stats";
import { countServerQuery } from "./firebase-rest";

/*
 * The overview's charts: sign-ups, Hanogt AI messages, risky requests the
 * security scanner blocked and messages AutoMod stopped, day by day (week by
 * week for 90 days). Every number is a count query or a stored daily total,
 * so the cost doesn't grow with the data: one aggregation per bucket and
 * series (single-field indexes only), and one read of the AI day totals.
 */

export const ACTIVITY_RANGES: readonly ActivityRange[] = [7, 30, 90];
const DAY_MS = 86_400_000;

/** The series counted from a collection's createdAt. */
const COUNTED = {
    signups: { collectionId: "users", field: "createdAt" },
    securityEvents: { collectionId: "security_events", field: "createdAt" },
    automodStops: { collectionId: "automod_events", field: "createdAt" },
} as const;
type CountedKey = keyof typeof COUNTED;
const COUNTED_KEYS = Object.keys(COUNTED) as CountedKey[];

export function isActivityRange(value: unknown): value is ActivityRange {
    return value === 7 || value === 30 || value === 90;
}

/** The buckets of a range, oldest first: days (7, 30) or weeks (90); the last one ends tonight. */
export function activityBuckets(range: ActivityRange, now = Date.now()) {
    const size = range === 90 ? 7 : 1;
    const count = range === 90 ? 13 : range;
    const end = turkeyDayStart(now) + DAY_MS;
    return Array.from({ length: count }, (_, index) => {
        const bucketEnd = end - (count - 1 - index) * size * DAY_MS;
        return { start: bucketEnd - size * DAY_MS, end: bucketEnd };
    });
}

/** Runs `task` over `items`, at most `limit` at a time, keeping the order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await task(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

async function countBetween(key: CountedKey, start: number, end: number): Promise<number | null> {
    const { collectionId, field } = COUNTED[key];
    const query = () => countServerQuery({
        collectionId,
        where: [
            { field, op: "GREATER_THAN_OR_EQUAL", value: new Date(start) },
            { field, op: "LESS_THAN", value: new Date(end) },
        ],
    });
    // One more try: a single failed bucket would otherwise hide the whole series.
    return query().catch(() => query()).catch(() => null);
}

type Job = { key: CountedKey; index: number; start: number; end: number };

export async function buildActivity(range: ActivityRange, now = Date.now()): Promise<AdminActivityResponse> {
    const buckets = activityBuckets(range, now);
    const rangeStart = buckets[0].start;
    const rangeEnd = buckets[buckets.length - 1].end;
    const span = rangeEnd - rangeStart;

    // Every bucket of every counted series, and each series over the period before.
    const jobs: Job[] = [
        ...COUNTED_KEYS.flatMap((key) => buckets.map((bucket, index) => ({ key, index, start: bucket.start, end: bucket.end }))),
        ...COUNTED_KEYS.map((key) => ({ key, index: -1, start: rangeStart - span, end: rangeStart })),
    ];
    const [counts, days] = await Promise.all([
        mapLimit(jobs, 12, (job) => countBetween(job.key, job.start, job.end)),
        readAiUsageDays(usageDayKey(rangeStart - span), usageDayKey(rangeEnd - 1)).catch(() => null),
    ]);

    const perBucket = new Map<CountedKey, Array<number | null>>(COUNTED_KEYS.map((key) => [key, buckets.map(() => null)]));
    const previous: Record<ActivitySeriesKey, number | null> = { signups: null, aiMessages: null, securityEvents: null, automodStops: null };
    jobs.forEach((job, position) => {
        if (job.index === -1) previous[job.key] = counts[position];
        else perBucket.get(job.key)![job.index] = counts[position];
    });
    // A series with a bucket that couldn't be counted is shown as unavailable rather than wrong.
    for (const key of COUNTED_KEYS) {
        const values = perBucket.get(key)!;
        if (values.some((value) => value === null)) perBucket.set(key, buckets.map(() => null));
    }

    // Hanogt AI from the daily totals; a day without a document had no messages.
    const aiBuckets: Array<number | null> = buckets.map(() => (days ? 0 : null));
    if (days) {
        let before = 0;
        for (const day of days) {
            const start = dayKeyStart(day.day);
            if (start < rangeStart) before += day.messages;
            else {
                const index = buckets.findIndex((bucket) => start >= bucket.start && start < bucket.end);
                if (index !== -1) aiBuckets[index] = (aiBuckets[index] ?? 0) + day.messages;
            }
        }
        previous.aiMessages = before;
    }

    const valuesAt = (index: number): Record<ActivitySeriesKey, number | null> => ({
        signups: perBucket.get("signups")![index],
        aiMessages: aiBuckets[index],
        securityEvents: perBucket.get("securityEvents")![index],
        automodStops: perBucket.get("automodStops")![index],
    });
    const list: ActivityBucket[] = buckets.map((bucket, index) => ({
        start: new Date(bucket.start).toISOString(),
        end: new Date(bucket.end).toISOString(),
        values: valuesAt(index),
    }));
    const total = (key: ActivitySeriesKey) => {
        let sum = 0;
        for (const bucket of list) {
            const value = bucket.values[key];
            if (value === null) return null;
            sum += value;
        }
        return sum;
    };
    return {
        range,
        unit: range === 90 ? "week" : "day",
        buckets: list,
        totals: { signups: total("signups"), aiMessages: total("aiMessages"), securityEvents: total("securityEvents"), automodStops: total("automodStops") },
        previous,
        generatedAt: new Date(now).toISOString(),
    };
}
