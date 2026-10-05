/**
 * Hanogt AI usage as the browser sees it: GET /api/ai/usage, the
 * X-Hanogt-AI-Window-* headers of every /api/ai answer and the details of a 429.
 * Client-safe; the server side is src/lib/server/ai-usage.ts.
 */
import { isPlanId, type PaidPlanId, type PlanId } from "@/lib/plans";

/** One counting window (the plan's window, a day or a minute). */
export type UsageWindow = {
    limit: number;
    used: number;
    remaining: number;
    /** When the window starts afresh (ISO); null while nothing was sent in it. */
    resetsAt: string | null;
};

export type AiUsage = {
    plan: PlanId;
    /**
     * Hanogt AI's own model: messages in the plan's window (Free 50 in 7 days,
     * Plus 750 in 14, Pro 2,000 in 7; a staff grant included) and a minute.
     * The chat, the developer API and Hanogt AI in Social groups share it.
     */
    hanogt: { window: UsageWindow; minute: UsageWindow; windowDays: number; bonus: number };
    /** Messages through the person's own provider connections (a day); null when the plan has none. */
    own: { day: UsageWindow; minute: UsageWindow } | null;
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
    /** "hanogt" (Hanogt AI's window) or "own" (the person's own connections, a day). */
    quota: "X-Hanogt-AI-Quota",
    limit: "X-Hanogt-AI-Window-Limit",
    remaining: "X-Hanogt-AI-Window-Remaining",
    /** ISO time the window starts afresh. */
    reset: "X-Hanogt-AI-Window-Reset",
    /** How many days the window lasts. */
    days: "X-Hanogt-AI-Window-Days",
} as const;

/** "hanogt": Hanogt AI's own model (chat, developer API, Social bots) · "own": the person's own connections. */
export type QuotaKind = "hanogt" | "own";

/** A window as an answer reports it. */
export type WindowQuota = { quota: QuotaKind; limit: number; remaining: number; resetsAt: string | null; windowDays: number };

/** A limit that refused a message (the 429 body of /api/ai). */
export type LimitDetails = { quota: QuotaKind; plan: PlanId; limit: number; used: number; resetsAt: string | null; upgrade: PaidPlanId | null; windowDays: number };

const count = (value: unknown, max = 10_000_000) => (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null);
const isoOrNull = (value: unknown) => (typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : null);
const daysOf = (value: unknown, fallback: number) => {
    const days = count(value, 366);
    return days && days >= 1 ? days : fallback;
};

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
    const window = readWindow(hanogt.window);
    const minute = readWindow(hanogt.minute);
    if (!window || !minute) return null;
    return { plan: record.plan, hanogt: { window, minute, windowDays: daysOf(hanogt.windowDays, 7), bonus: count(hanogt.bonus) ?? 0 }, own: readPair(record.own) };
}

/** The window an /api/ai answer reports in its headers; null when it sent none. */
export function quotaFromHeaders(headers: { get(name: string): string | null }): WindowQuota | null {
    const quota = headers.get(QUOTA_HEADERS.quota);
    if (quota !== "hanogt" && quota !== "own") return null;
    const limit = count(Number(headers.get(QUOTA_HEADERS.limit) ?? "x"));
    const remaining = count(Number(headers.get(QUOTA_HEADERS.remaining) ?? "x"));
    if (limit === null || remaining === null) return null;
    return { quota, limit, remaining, resetsAt: isoOrNull(headers.get(QUOTA_HEADERS.reset)), windowDays: daysOf(Number(headers.get(QUOTA_HEADERS.days) ?? "x"), quota === "own" ? 1 : 7) };
}

/** The limit details of a refused message; null for any other answer. */
export function limitDetailsOf(payload: unknown): LimitDetails | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    // "daily_limit" is what servers before the weekly windows sent.
    const quota = record.code === "usage_limit" || record.code === "daily_limit" ? "hanogt" : record.code === "connection_daily_limit" ? "own" : null;
    const limit = count(record.limit);
    if (!quota || !isPlanId(record.plan) || limit === null) return null;
    const upgrade = record.upgrade === "plus" || record.upgrade === "pro" ? record.upgrade : null;
    // Without windowDays: Hanogt AI's window is a week; the own connections' and an older server's "daily_limit" a day.
    return { quota, plan: record.plan, limit, used: count(record.used) ?? limit, resetsAt: isoOrNull(record.resetsAt), upgrade, windowDays: daysOf(record.windowDays, record.code === "usage_limit" ? 7 : 1) };
}

/** "ok", "high" from 80 %, "full" when nothing is left. */
export function usageLevel(window: Pick<UsageWindow, "limit" | "remaining" | "used">): "ok" | "high" | "full" {
    if (window.remaining <= 0) return "full";
    return window.limit > 0 && window.used / window.limit >= 0.8 ? "high" : "ok";
}

/** A window after one more message was answered (`remaining` from the answer's headers). */
export function windowAfter(window: UsageWindow, quota: WindowQuota): UsageWindow {
    const remaining = Math.min(quota.remaining, quota.limit);
    return { limit: quota.limit, used: Math.max(0, quota.limit - remaining), remaining, resetsAt: quota.resetsAt ?? window.resetsAt };
}

/** A window as it is at `now`: once its reset time has passed it starts afresh. */
export function currentWindow(window: UsageWindow, now = Date.now()): UsageWindow {
    if (!window.resetsAt || Date.parse(window.resetsAt) > now) return window;
    return { limit: window.limit, used: 0, remaining: window.limit, resetsAt: null };
}

/**
 * When a window resets, in the reader's locale: "21:14" today, with the
 * weekday within six days ("Sun 09:14"), with the date after that ("9 Oct 14:05").
 */
export function formatResetTime(iso: string, locale: string, now = Date.now()) {
    const at = new Date(iso);
    if (!Number.isFinite(at.getTime())) return "";
    const today = new Date(now).toDateString() === at.toDateString();
    const soon = at.getTime() - now < 6 * 24 * 60 * 60_000;
    const options: Intl.DateTimeFormatOptions = today
        ? { hour: "2-digit", minute: "2-digit" }
        : soon ? { weekday: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
    try {
        return new Intl.DateTimeFormat(locale, options).format(at);
    } catch {
        return at.toISOString().slice(0, 16).replace("T", " ");
    }
}
