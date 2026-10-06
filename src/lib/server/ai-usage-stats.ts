import "server-only";

import type { PlanId } from "@/lib/plans";
import { commitServerMutations, runServerQuery } from "./firebase-rest";

/*
 * Daily totals of Hanogt AI messages for the admin panel: how many messages
 * were counted on a day (Türkiye time), from which source and on which plan,
 * and how many were given back because the model answered nothing. Only the
 * numbers are kept: never who sent a message or what it said. One document a
 * day (ai_usage_daily/{YYYY-MM-DD}), server-only, kept for about 13 months.
 */

export const AI_USAGE_COLLECTION = "ai_usage_daily";
export const AI_USAGE_SOURCES = ["chat", "own", "api", "group"] as const;
export const AI_USAGE_PLANS = ["free", "plus", "pro"] as const satisfies readonly PlanId[];
export type AiUsageSource = (typeof AI_USAGE_SOURCES)[number];

const DAY_MS = 86_400_000;
/** Türkiye has kept UTC+3 all year since 2016: days start at 21:00 UTC. */
const TURKEY_OFFSET_MS = 3 * 3_600_000;
const KEEP_DAYS = 400;

/** The Türkiye calendar day a moment falls on ("2026-10-06"). */
export function usageDayKey(at: number) {
    return new Date(at + TURKEY_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight in Türkiye (ms) of the day a moment falls on. */
export function turkeyDayStart(at: number) {
    return Math.floor((at + TURKEY_OFFSET_MS) / DAY_MS) * DAY_MS - TURKEY_OFFSET_MS;
}

/** When a day key ("2026-10-06") starts (midnight in Türkiye, ms). */
export function dayKeyStart(day: string) {
    return Date.parse(`${day}T00:00:00Z`) - TURKEY_OFFSET_MS;
}

/**
 * Counts one message (or one given back) in today's totals. Flat field names
 * ("source_chat"), so the stored document and every reader agree on them.
 */
export async function recordAiUsage(entry: { source: AiUsageSource; plan: PlanId; refund?: boolean }, now = Date.now()) {
    const day = usageDayKey(now);
    const path = `${AI_USAGE_COLLECTION}/${day}`;
    const fields: Record<string, number> = entry.refund
        ? { refunds: 1, [`refund_${entry.source}`]: 1 }
        : { messages: 1, [`source_${entry.source}`]: 1, [`plan_${entry.plan}`]: 1 };
    await commitServerMutations([
        // Creates the day's document the first time; the expiry lets the TTL policy remove old days.
        { type: "update", path, data: { day, expiresAt: new Date(turkeyDayStart(now) + KEEP_DAYS * DAY_MS) }, updateFields: ["day", "expiresAt"] },
        { type: "increment", path, fields },
    ]);
}

export type AiUsageDay = {
    day: string;
    messages: number;
    refunds: number;
    sources: Record<AiUsageSource, number>;
    plans: Record<(typeof AI_USAGE_PLANS)[number], number>;
};

const whole = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

/** A stored day as numbers (missing fields are zero). */
export function readAiUsageDay(record: Record<string, unknown>, day: string): AiUsageDay {
    return {
        day,
        messages: whole(record.messages),
        refunds: whole(record.refunds),
        sources: Object.fromEntries(AI_USAGE_SOURCES.map((source) => [source, whole(record[`source_${source}`])])) as AiUsageDay["sources"],
        plans: Object.fromEntries(AI_USAGE_PLANS.map((plan) => [plan, whole(record[`plan_${plan}`])])) as AiUsageDay["plans"],
    };
}

/** The stored days from `from` to `to` (inclusive, "YYYY-MM-DD"), oldest first; days without messages are missing. */
export async function readAiUsageDays(from: string, to: string): Promise<AiUsageDay[]> {
    const records = await runServerQuery<Record<string, unknown>>({
        collectionId: AI_USAGE_COLLECTION,
        where: [
            { field: "day", op: "GREATER_THAN_OR_EQUAL", value: from },
            { field: "day", op: "LESS_THAN_OR_EQUAL", value: to },
        ],
        orderBy: [{ field: "day", direction: "ASCENDING" }],
        limit: 500,
    });
    return records
        .map((record) => ({ record, day: typeof record.day === "string" ? record.day : record._id }))
        .filter(({ day }) => /^\d{4}-\d{2}-\d{2}$/.test(day))
        .map(({ record, day }) => readAiUsageDay(record, day));
}
