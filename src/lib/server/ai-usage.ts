import "server-only";

import { QUOTA_HEADERS, type AiUsage, type CountedLimit, type DayQuota, type PlanUsage, type QuotaKind, type UsageWindow } from "@/lib/ai/usage";
import { FREE_SUBSCRIPTION, PLAN_AI_CONNECTIONS, PLAN_AI_FEATURES, PLAN_AI_LIMITS, PLAN_GROUP_LIMITS, PLAN_PROJECT_LIMITS, aiLimitsFor, effectivePlan, nextPlanUp, type PaidPlanId, type PlanId, type UserSubscription } from "@/lib/plans";
import { healBeforeRefusing, type HealOptions } from "./entitlements";
import { countServerQuery, getServerDocument } from "./firebase-rest";
import { AI_API_LIMIT_KEYS, AI_DAY_MS, AI_ENGINE_LIMIT_KEY, AI_LIMIT_KEYS, OWN_KEY_LIMIT_KEYS, getSubscription } from "./plans";
import { enforceRateLimitWithFallback, readRateLimit, type RateLimitResult } from "./rate-limit";

/*
 * Hanogt AI usage: what the chat route counts (a minute and a 24-hour window
 * that starts with the first message), what the usage meter shows, and the
 * headers every answer carries so the meter stays right without asking again.
 * Kept free of next/server so the plain-Node tests can load it; routes pass
 * after() as `onLate`.
 */

const MINUTE_MS = 60_000;

type Limits = { perMinute: number; perDay: number };

/** Messages a plan allows through the person's own connections (Plus 3,000, Pro 10,000 a day); null when the plan has none. */
export function ownKeyLimitsFor(plan: PlanId): Limits | null {
    const own = PLAN_AI_FEATURES[plan].ownKey;
    return own && PLAN_AI_CONNECTIONS[plan] > 0 ? { perMinute: own.perMinute, perDay: own.perDay } : null;
}

/** Developer API requests a plan allows (Plus 250, Pro 1,000 a day); null when the plan has none. */
export function apiLimitsFor(plan: PlanId): Limits | null {
    const api = PLAN_AI_FEATURES[plan].api;
    return api ? { perMinute: api.perMinute, perDay: api.perDay } : null;
}

/** What each kind counts with: its keys and the plan's limits (null: the plan has none). */
function countedBy(kind: QuotaKind, email: string, subscription: UserSubscription): { keys: { minute: string; day: string }; limits: Limits | null } {
    if (kind === "hanogt") return { keys: AI_LIMIT_KEYS(email), limits: aiLimitsFor(subscription) };
    const plan = effectivePlan(subscription);
    if (kind === "own") return { keys: OWN_KEY_LIMIT_KEYS(email), limits: ownKeyLimitsFor(plan) };
    return { keys: AI_API_LIMIT_KEYS(email), limits: apiLimitsFor(plan) };
}

/** A stored window as the meter shows it; no open window is an unused one. */
export function usageWindow(state: { count: number; resetsAt: string } | null, limit: number): UsageWindow {
    const used = Math.max(0, Math.floor(state?.count ?? 0));
    return { limit, used, remaining: Math.max(0, limit - used), resetsAt: state ? state.resetsAt : null };
}

const readWindow = (key: string, windowMs: number) => readRateLimit(key, windowMs).catch(() => null);

export type UsageOptions = {
    /** The developer API is open to the account (the ai_api feature): its windows are read too. */
    api?: boolean;
    /** Each plan's advanced engine answers a day, when the server has the engine and it is on (src/lib/server/ai-engine.ts). */
    engine?: Record<PlanId, number> | null;
};

/** A kind's minute and day windows as the meter shows them; null when the plan has none of it. */
async function windowsOf(kind: QuotaKind, email: string, subscription: UserSubscription) {
    const { keys, limits } = countedBy(kind, email, subscription);
    if (!limits) return null;
    const [minute, day] = await Promise.all([readWindow(keys.minute, MINUTE_MS), readWindow(keys.day, AI_DAY_MS)]);
    return { day: usageWindow(day, limits.perDay), minute: usageWindow(minute, limits.perMinute) };
}

/** Only the developer API's windows (its page, /api/v1/usage); null when the plan has no API. */
export function apiUsageFor(email: string, subscription: UserSubscription) {
    return windowsOf("api", email, subscription);
}

/** The account's Hanogt AI windows now; nothing is counted. */
export async function aiUsageFor(email: string, subscription: UserSubscription | null = null, options: UsageOptions = {}): Promise<AiUsage> {
    const record = subscription ?? (await getSubscription(email).catch(() => FREE_SUBSCRIPTION));
    const plan = effectivePlan(record);
    const engineLimit = options.engine ? options.engine[plan] : null;
    const [hanogt, own, api, engine] = await Promise.all([
        windowsOf("hanogt", email, record),
        windowsOf("own", email, record),
        options.api ? windowsOf("api", email, record) : null,
        engineLimit === null ? null : readWindow(AI_ENGINE_LIMIT_KEY(email), AI_DAY_MS).then((state) => usageWindow(state, engineLimit)),
    ]);
    const limits = aiLimitsFor(record);
    return {
        plan,
        // Hanogt AI has limits on every plan.
        hanogt: { ...hanogt!, bonus: Math.max(0, limits.perDay - PLAN_AI_LIMITS[plan].perDay) },
        own,
        api,
        engine,
    };
}

/**
 * Counts an advanced engine answer in the account's 24-hour window. Refused
 * when the plan's allowance is used up (or is 0); the standard engine answers
 * then.
 */
export async function enforceEngineQuota(email: string, limit: number): Promise<{ ok: true; window: UsageWindow } | { ok: false; reason: "quota" }> {
    if (limit <= 0) return { ok: false, reason: "quota" };
    const result = await enforceRateLimitWithFallback(AI_ENGINE_LIMIT_KEY(email), limit, AI_DAY_MS);
    if (!result.allowed) return { ok: false, reason: "quota" };
    return {
        ok: true,
        window: { limit, used: limit - result.remaining, remaining: result.remaining, resetsAt: new Date(Date.now() + result.retryAfterSeconds * 1000).toISOString() },
    };
}

/** A count for the usage list (up to a thousand); null when it can't be taken (the list still shows the limit). */
async function countOf(collectionId: string, field: string, email: string, limit: number | null): Promise<CountedLimit> {
    const used = await countServerQuery({ collectionId, where: [{ field, op: "EQUAL", value: email }], upTo: 1_000 }).catch(() => null);
    return { used, limit };
}

/** Items stored in a list document (connections, API keys) against the plan's allowance. */
function listCount(path: string, limit: number): Promise<CountedLimit> {
    return getServerDocument<{ items?: unknown }>(path)
        .then((stored): CountedLimit => ({ used: Array.isArray(stored?.items) ? stored.items.length : 0, limit }))
        .catch((): CountedLimit => ({ used: null, limit }));
}

/** aiUsageFor plus everything else the plan counts (projects, games, groups, connections, API keys). */
export async function planUsageFor(email: string, subscription: UserSubscription | null = null, options: UsageOptions = {}): Promise<PlanUsage> {
    const record = subscription ?? (await getSubscription(email).catch(() => FREE_SUBSCRIPTION));
    const plan = effectivePlan(record);
    const [usage, codeProjects, gameProjects, groups, connections, apiKeys] = await Promise.all([
        aiUsageFor(email, record, options),
        countOf("projects", "email", email, PLAN_PROJECT_LIMITS[plan].code),
        countOf("game_projects", "ownerEmail", email, PLAN_PROJECT_LIMITS[plan].game),
        countOf("groups", "ownerEmail", email, PLAN_GROUP_LIMITS[plan]),
        listCount(`ai_connections/${email}`, PLAN_AI_CONNECTIONS[plan]),
        options.api ? listCount(`ai_api_keys/${email}`, PLAN_AI_FEATURES[plan].api?.keys ?? 0) : null,
    ]);
    return { ...usage, counts: { codeProjects, gameProjects, groups, connections, apiKeys } };
}

export type QuotaPass = {
    ok: true;
    plan: PlanId;
    /** The day window this request counted in. */
    quota: DayQuota;
    /** The minute window it counted in (the developer API reports it as x-ratelimit-*). */
    minute: { limit: number; remaining: number; resetsAt: string };
};

export type QuotaRefusal = {
    ok: false;
    /** "rate_limited": the minute window · "daily_limit" / "connection_daily_limit" / "api_daily_limit": the day window. */
    code: "rate_limited" | "daily_limit" | "connection_daily_limit" | "api_daily_limit";
    retryAfterSeconds: number;
    quota: QuotaKind;
    plan: PlanId;
    limit: number;
    used: number;
    resetsAt: string;
    upgrade: PaidPlanId | null;
};

/** The plan doesn't include own connections or the developer API (Free), even after asking Paddle. */
export type QuotaNoPlan = { ok: false; code: "connection_unavailable"; plan: PlanId };

const resetsAtOf = (result: RateLimitResult) => new Date(Date.now() + result.retryAfterSeconds * 1000).toISOString();

/**
 * Counts one message in the minute and then the day window of `kind`. The
 * day is counted only once the minute let the message through, so a refused
 * burst never uses up the day. Before refusing, Paddle is asked once (only
 * when selfHealReason says it may help): a purchase no notification reported
 * raises the limit, and only the window that refused is checked again.
 */
async function enforceWindows(email: string, kind: QuotaKind, initial: UserSubscription, options: HealOptions): Promise<QuotaPass | QuotaRefusal | QuotaNoPlan> {
    let subscription = initial;
    let asked = false;
    const { keys } = countedBy(kind, email, subscription);
    const covered = () => countedBy(kind, email, subscription).limits !== null;
    const limitsOf = (): Limits => countedBy(kind, email, subscription).limits ?? { perMinute: 0, perDay: 0 };
    const heal = async () => {
        if (asked) return false;
        asked = true;
        const healed = await healBeforeRefusing(email, subscription, options).catch(() => null);
        if (!healed?.upgraded) return false;
        subscription = healed.subscription;
        return true;
    };

    if (!covered() && !((await heal()) && covered())) return { ok: false, code: "connection_unavailable", plan: effectivePlan(subscription) };
    const refuse = (code: QuotaRefusal["code"], result: RateLimitResult, limit: number): QuotaRefusal => {
        const plan = effectivePlan(subscription);
        return { ok: false, code, retryAfterSeconds: result.retryAfterSeconds, quota: kind, plan, limit, used: limit, resetsAt: resetsAtOf(result), upgrade: nextPlanUp(plan) };
    };

    let minute = await enforceRateLimitWithFallback(keys.minute, limitsOf().perMinute, MINUTE_MS);
    if (!minute.allowed && (await heal())) minute = await enforceRateLimitWithFallback(keys.minute, limitsOf().perMinute, MINUTE_MS);
    if (!minute.allowed) return refuse("rate_limited", minute, limitsOf().perMinute);

    let day = await enforceRateLimitWithFallback(keys.day, limitsOf().perDay, AI_DAY_MS);
    if (!day.allowed && (await heal())) day = await enforceRateLimitWithFallback(keys.day, limitsOf().perDay, AI_DAY_MS);
    if (!day.allowed) return refuse(kind === "hanogt" ? "daily_limit" : kind === "own" ? "connection_daily_limit" : "api_daily_limit", day, limitsOf().perDay);

    return {
        ok: true,
        plan: effectivePlan(subscription),
        quota: { quota: kind, limit: limitsOf().perDay, remaining: day.remaining, resetsAt: resetsAtOf(day) },
        minute: { limit: limitsOf().perMinute, remaining: minute.remaining, resetsAt: resetsAtOf(minute) },
    };
}

/** One message to Hanogt AI's own model. */
export async function enforceHanogtAi(email: string, options: HealOptions = {}): Promise<QuotaPass | QuotaRefusal> {
    const subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    // Hanogt AI has limits on every plan, so "connection_unavailable" can't come back here.
    return await enforceWindows(email, "hanogt", subscription, options) as QuotaPass | QuotaRefusal;
}

/** One message through the person's own connection (Plus and Pro). */
export async function enforceOwnKeys(email: string, options: HealOptions = {}): Promise<QuotaPass | QuotaRefusal | QuotaNoPlan> {
    const subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    return enforceWindows(email, "own", subscription, options);
}

/** One developer API request (Plus and Pro), with the subscription the key check has read. */
export async function enforceApiRequests(email: string, subscription: UserSubscription, options: HealOptions = {}): Promise<QuotaPass | QuotaRefusal | QuotaNoPlan> {
    return enforceWindows(email, "api", subscription, options);
}

/** The headers an answer reports its day window with (src/lib/ai/usage.ts QUOTA_HEADERS). */
export function quotaHeaders(quota: DayQuota): Record<string, string> {
    return {
        [QUOTA_HEADERS.quota]: quota.quota,
        [QUOTA_HEADERS.limit]: String(quota.limit),
        [QUOTA_HEADERS.remaining]: String(quota.remaining),
        ...(quota.resetsAt ? { [QUOTA_HEADERS.reset]: quota.resetsAt } : {}),
    };
}

/** The body fields of a 429 (besides `error` and `code`): what the limit is, when it resets, which plan raises it. */
export function refusalDetails(refusal: QuotaRefusal) {
    return { plan: refusal.plan, limit: refusal.limit, used: refusal.used, resetsAt: refusal.resetsAt, upgrade: refusal.upgrade };
}
