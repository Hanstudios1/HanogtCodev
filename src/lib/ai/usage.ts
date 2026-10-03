/**
 * Hanogt AI usage as the browser sees it: GET /api/ai/usage, the
 * X-Hanogt-AI-* headers of every /api/ai answer and the details of a 429.
 * Client-safe; the server side is src/lib/server/ai-usage.ts.
 */
import { isPlanId, type PaidPlanId, type PlanId } from "@/lib/plans";

/** One counting window (a day or a minute). */
export type UsageWindow = {
    limit: number;
    used: number;
    remaining: number;
    /** When the window starts afresh (ISO); null while nothing was sent in it. */
    resetsAt: string | null;
};

export type AiUsage = {
    plan: PlanId;
    /** Hanogt AI's own model: messages a day (staff grant included) and a minute. */
    hanogt: { day: UsageWindow; minute: UsageWindow; bonus: number };
    /** Messages through the person's own provider connections; null when the plan has none. */
    own: { day: UsageWindow; minute: UsageWindow } | null;
    /** Requests through the developer API (/api/v1); null when the plan has none or the API isn't open to the account. */
    api: { day: UsageWindow; minute: UsageWindow } | null;
    /** Answers of the advanced code engine in 24 hours; null when the server has no advanced engine or the team switched it off. */
    engine: UsageWindow | null;
};

/** Something the plan counts: how many there are (null: couldn't be counted) out of the limit (null: unlimited). */
export type CountedLimit = { used: number | null; limit: number | null };

/** Every benefit with a number, for the Plans page and the AI settings. */
export type PlanUsage = AiUsage & {
    counts: {
        codeProjects: CountedLimit;
        gameProjects: CountedLimit;
        groups: CountedLimit;
        connections: CountedLimit;
        /** Developer API keys; null while the API isn't open to the account. */
        apiKeys: CountedLimit | null;
    };
};

export const QUOTA_HEADERS = {
    /** "hanogt" (Hanogt AI's daily messages) or "own" (the person's own connections). */
    quota: "X-Hanogt-AI-Quota",
    limit: "X-Hanogt-AI-Day-Limit",
    remaining: "X-Hanogt-AI-Day-Remaining",
    /** ISO time the day window starts afresh. */
    reset: "X-Hanogt-AI-Day-Reset",
} as const;

/** "hanogt": Hanogt AI's own model in the chat · "own": the person's own connections · "api": the developer API. */
export type QuotaKind = "hanogt" | "own" | "api";

/** A day window as an answer reports it. */
export type DayQuota = { quota: QuotaKind; limit: number; remaining: number; resetsAt: string | null };

/** A daily limit that refused a message (the 429 body of /api/ai). */
export type LimitDetails = { quota: QuotaKind; plan: PlanId; limit: number; used: number; resetsAt: string | null; upgrade: PaidPlanId | null };

const count = (value: unknown, max = 10_000_000) => (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null);
const isoOrNull = (value: unknown) => (typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : null);

function readWindow(value: unknown): UsageWindow | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const limit = count(record.limit);
    const used = count(record.used);
    const remaining = count(record.remaining);
    if (limit === null || used === null || remaining === null) return null;
    return { limit, used, remaining, resetsAt: isoOrNull(record.resetsAt) };
}

/** A day and a minute window together; null unless both are valid. */
function readPair(value: unknown): { day: UsageWindow; minute: UsageWindow } | null {
    if (!value || typeof value !== "object") return null;
    const day = readWindow((value as Record<string, unknown>).day);
    const minute = readWindow((value as Record<string, unknown>).minute);
    return day && minute ? { day, minute } : null;
}

/** A GET /api/ai/usage answer, checked before the browser trusts it. */
export function readAiUsage(value: unknown): AiUsage | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (!isPlanId(record.plan) || !record.hanogt || typeof record.hanogt !== "object") return null;
    const hanogt = record.hanogt as Record<string, unknown>;
    const day = readWindow(hanogt.day);
    const minute = readWindow(hanogt.minute);
    if (!day || !minute) return null;
    return { plan: record.plan, hanogt: { day, minute, bonus: count(hanogt.bonus) ?? 0 }, own: readPair(record.own), api: readPair(record.api), engine: readWindow(record.engine) };
}

/** The day window an /api/ai answer reports in its headers; null when it sent none. */
export function quotaFromHeaders(headers: { get(name: string): string | null }): DayQuota | null {
    const quota = headers.get(QUOTA_HEADERS.quota);
    if (quota !== "hanogt" && quota !== "own") return null;
    const limit = count(Number(headers.get(QUOTA_HEADERS.limit) ?? "x"));
    const remaining = count(Number(headers.get(QUOTA_HEADERS.remaining) ?? "x"));
    if (limit === null || remaining === null) return null;
    return { quota, limit, remaining, resetsAt: isoOrNull(headers.get(QUOTA_HEADERS.reset)) };
}

/** The daily-limit details of a refused message; null for any other answer. */
export function limitDetailsOf(payload: unknown): LimitDetails | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    const quota = record.code === "daily_limit" ? "hanogt" : record.code === "connection_daily_limit" ? "own" : null;
    const limit = count(record.limit);
    if (!quota || !isPlanId(record.plan) || limit === null) return null;
    const upgrade = record.upgrade === "plus" || record.upgrade === "pro" ? record.upgrade : null;
    return { quota, plan: record.plan, limit, used: count(record.used) ?? limit, resetsAt: isoOrNull(record.resetsAt), upgrade };
}

/** "ok", "high" from 80 %, "full" when nothing is left. */
export function usageLevel(window: Pick<UsageWindow, "limit" | "remaining" | "used">): "ok" | "high" | "full" {
    if (window.remaining <= 0) return "full";
    return window.limit > 0 && window.used / window.limit >= 0.8 ? "high" : "ok";
}

/** A window after one more message was answered (`remaining` from the answer's headers). */
export function windowAfter(window: UsageWindow, quota: DayQuota): UsageWindow {
    const remaining = Math.min(quota.remaining, quota.limit);
    return { limit: quota.limit, used: Math.max(0, quota.limit - remaining), remaining, resetsAt: quota.resetsAt ?? window.resetsAt };
}

/** A window as it is at `now`: once its reset time has passed it starts afresh. */
export function currentWindow(window: UsageWindow, now = Date.now()): UsageWindow {
    if (!window.resetsAt || Date.parse(window.resetsAt) > now) return window;
    return { limit: window.limit, used: 0, remaining: window.limit, resetsAt: null };
}

/** When a window resets, in the reader's locale: "21:14", or with the weekday when it isn't today ("Sun 09:14"). */
export function formatResetTime(iso: string, locale: string, now = Date.now()) {
    const at = new Date(iso);
    if (!Number.isFinite(at.getTime())) return "";
    const today = new Date(now).toDateString() === at.toDateString();
    try {
        return new Intl.DateTimeFormat(locale, today ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(at);
    } catch {
        return at.toISOString().slice(11, 16);
    }
}
