import "server-only";

import { QUOTA_HEADERS, type AiUsage, type CountedLimit, type PlanUsage, type QuotaKind, type UsageWindow, type WindowQuota } from "@/lib/ai/usage";
import { FREE_SUBSCRIPTION, PLAN_AI_CONNECTIONS, PLAN_AI_FEATURES, PLAN_GROUP_LIMITS, PLAN_PROJECT_LIMITS, PLAN_STAR_LIMITS, aiBonusOf, aiLimitsFor, aiWindowMs, effectivePlan, nextPlanUp, type PaidPlanId, type PlanId, type UserSubscription } from "@/lib/plans";
import { RETIRED_PROVIDER_IDS } from "@/lib/ai/connections";
import { healBeforeRefusing, type HealOptions } from "./entitlements";
import { countServerQuery, getServerDocument } from "./firebase-rest";
import { AI_LIMIT_KEYS, getSubscription } from "./plans";
import { enforceRateLimitWithFallback, readRateLimit, releaseFromWindow, type RateLimitResult } from "./rate-limit";

/*
 * Hanogt AI usage: what is counted (a minute guard and the plan's window,
 * which opens with the first message: Free 50 in 7 days, Plus 750 in 14,
 * Pro 2,000 in 7), what the usage meter shows, and the headers every answer
 * carries so the meter stays right without asking again. The chat, the
 * person's own connections (Plus and Pro), the developer API and Hanogt AI in
 * Social groups all count in the same window. Kept free of next/server so the
 * plain-Node tests can load it; routes pass after() as `onLate`.
 */

const MINUTE_MS = 60_000;

/** A stored window as the meter shows it; no open window is an unused one. */
export function usageWindow(state: { count: number; resetsAt: string } | null, limit: number): UsageWindow {
    const used = Math.max(0, Math.floor(state?.count ?? 0));
    return { limit, used, remaining: Math.max(0, limit - used), resetsAt: state ? state.resetsAt : null };
}

const readWindow = (key: string, windowMs: number) => readRateLimit(key, windowMs).catch(() => null);

export type UsageOptions = {
    /** The developer API is open to the account (the ai_api feature): its keys are counted too. */
    api?: boolean;
};

/** Hanogt AI's minute and plan windows as the meter shows them (the developer API's page and /api/v1/usage show the same ones). */
export async function hanogtUsageFor(email: string, subscription: UserSubscription) {
    const keys = AI_LIMIT_KEYS(email);
    const limits = aiLimitsFor(subscription);
    const [minute, window] = await Promise.all([readWindow(keys.minute, MINUTE_MS), readWindow(keys.window, aiWindowMs(limits.windowDays))]);
    return { window: usageWindow(window, limits.perWindow), minute: usageWindow(minute, limits.perMinute), windowDays: limits.windowDays };
}

/** The account's Hanogt AI windows now; nothing is counted. */
export async function aiUsageFor(email: string, subscription: UserSubscription | null = null): Promise<AiUsage> {
    const record = subscription ?? (await getSubscription(email).catch(() => FREE_SUBSCRIPTION));
    // Hanogt AI has a window on every plan; own connections count in it too.
    return { plan: effectivePlan(record), hanogt: { ...(await hanogtUsageFor(email, record)), bonus: aiBonusOf(record) } };
}

/** A count for the usage list (up to a thousand); null when it can't be taken (the list still shows the limit). */
async function countOf(collectionId: string, field: string, email: string, limit: number | null): Promise<CountedLimit> {
    const used = await countServerQuery({ collectionId, where: [{ field, op: "EQUAL", value: email }], upTo: 1_000 }).catch(() => null);
    return { used, limit };
}

/** Items stored in a list document (connections, API keys) against the plan's allowance; `counts` leaves some out. */
function listCount(path: string, limit: number, counts: (item: unknown) => boolean = () => true): Promise<CountedLimit> {
    return getServerDocument<{ items?: unknown }>(path)
        .then((stored): CountedLimit => ({ used: Array.isArray(stored?.items) ? stored.items.filter(counts).length : 0, limit }))
        .catch((): CountedLimit => ({ used: null, limit }));
}

const retired = new Set<string>(RETIRED_PROVIDER_IDS);
/** A connection of a provider Hanogt no longer supports doesn't take up the plan's allowance. */
const countsAsConnection = (item: unknown) => !(item && typeof item === "object" && retired.has(String((item as { provider?: unknown }).provider)));

/** aiUsageFor plus everything else the plan counts (projects, games, groups, starred messages, connections, API keys). */
export async function planUsageFor(email: string, subscription: UserSubscription | null = null, options: UsageOptions = {}): Promise<PlanUsage> {
    const record = subscription ?? (await getSubscription(email).catch(() => FREE_SUBSCRIPTION));
    const plan = effectivePlan(record);
    const [usage, codeProjects, gameProjects, groups, stars, connections, apiKeys] = await Promise.all([
        aiUsageFor(email, record),
        countOf("projects", "email", email, PLAN_PROJECT_LIMITS[plan].code),
        countOf("game_projects", "ownerEmail", email, PLAN_PROJECT_LIMITS[plan].game),
        countOf("groups", "ownerEmail", email, PLAN_GROUP_LIMITS[plan]),
        countOf("message_stars", "owner", email, PLAN_STAR_LIMITS[plan]),
        listCount(`ai_connections/${email}`, PLAN_AI_CONNECTIONS[plan], countsAsConnection),
        options.api ? listCount(`ai_api_keys/${email}`, PLAN_AI_FEATURES[plan].api?.keys ?? 0) : null,
    ]);
    return { ...usage, counts: { codeProjects, gameProjects, groups, stars, connections, apiKeys } };
}

/** Where a Hanogt AI message came from: the chat, the person's own connection, the developer API or a Social group's bot. */
export type HanogtAiSource = "chat" | "own" | "api" | "group";

export type QuotaPass = {
    ok: true;
    plan: PlanId;
    /** The window this request counted in. */
    quota: WindowQuota;
    /** The minute window it counted in (the developer API reports it as x-ratelimit-*). */
    minute: { limit: number; remaining: number; resetsAt: string };
    /** What refundHanogtAi needs to give the message back to the same window. */
    counted: { key: string; windowMs: number; startedAt: number; memory: boolean };
};

export type QuotaRefusal = {
    ok: false;
    /** "rate_limited": the minute guard · "usage_limit": Hanogt AI's window. */
    code: "rate_limited" | "usage_limit";
    retryAfterSeconds: number;
    quota: QuotaKind;
    plan: PlanId;
    limit: number;
    used: number;
    resetsAt: string;
    windowDays: number;
    upgrade: PaidPlanId | null;
};

/** The plan doesn't include own connections (Free), even after asking Paddle. */
export type QuotaNoPlan = { ok: false; code: "connection_unavailable"; plan: PlanId };

const resetsAtOf = (result: RateLimitResult) => new Date(Date.now() + result.retryAfterSeconds * 1000).toISOString();

/**
 * Counts one message in the minute guard and then the plan's window. The
 * window is counted only once the minute let the message through, so a
 * refused burst never uses it up. Before refusing, Paddle is asked once
 * (only when selfHealReason says it may help, and not when the caller has
 * already asked): a purchase no notification reported raises the limit, and
 * only the check that refused is made again.
 */
async function enforceWindows(email: string, initial: UserSubscription, options: HealOptions, alreadyAsked = false): Promise<QuotaPass | QuotaRefusal> {
    let subscription = initial;
    let asked = alreadyAsked;
    const keys = AI_LIMIT_KEYS(email);
    const current = () => aiLimitsFor(subscription);
    const heal = async () => {
        if (asked) return false;
        asked = true;
        const healed = await healBeforeRefusing(email, subscription, options).catch(() => null);
        if (!healed?.upgraded) return false;
        subscription = healed.subscription;
        return true;
    };
    const refuse = (code: QuotaRefusal["code"], result: RateLimitResult, limit: number): QuotaRefusal => {
        const plan = effectivePlan(subscription);
        return { ok: false, code, retryAfterSeconds: result.retryAfterSeconds, quota: "hanogt", plan, limit, used: limit, resetsAt: resetsAtOf(result), windowDays: current().windowDays, upgrade: nextPlanUp(plan) };
    };

    let minute = await enforceRateLimitWithFallback(keys.minute, current().perMinute, MINUTE_MS);
    if (!minute.allowed && (await heal())) minute = await enforceRateLimitWithFallback(keys.minute, current().perMinute, MINUTE_MS);
    if (!minute.allowed) return refuse("rate_limited", minute, current().perMinute);

    const windowMs = () => aiWindowMs(current().windowDays);
    let window = await enforceRateLimitWithFallback(keys.window, current().perWindow, windowMs());
    if (!window.allowed && (await heal())) window = await enforceRateLimitWithFallback(keys.window, current().perWindow, windowMs());
    if (!window.allowed) return refuse("usage_limit", window, current().perWindow);

    return {
        ok: true,
        plan: effectivePlan(subscription),
        quota: { quota: "hanogt", limit: current().perWindow, remaining: window.remaining, resetsAt: resetsAtOf(window), windowDays: current().windowDays },
        minute: { limit: current().perMinute, remaining: minute.remaining, resetsAt: resetsAtOf(minute) },
        counted: { key: keys.window, windowMs: windowMs(), startedAt: window.windowStartedAt, memory: window.memory === true },
    };
}

export type HanogtAiOptions = HealOptions & {
    /** The chat, the person's own connection, the developer API or a Social group's bot: all count in the same window. */
    source?: HanogtAiSource;
    /** The subscription a caller has already read (the developer API's key check). */
    subscription?: UserSubscription;
};

/** One message to Hanogt AI's own model, from the chat, the developer API or a Social group. */
export async function enforceHanogtAi(email: string, options: HanogtAiOptions = {}): Promise<QuotaPass | QuotaRefusal> {
    const { subscription: known, ...heal } = options;
    const subscription = known ?? (await getSubscription(email).catch(() => FREE_SUBSCRIPTION));
    return enforceWindows(email, subscription, heal);
}

/**
 * Gives a counted message back when the model answered nothing (it failed,
 * timed out or sent an empty answer). Best effort and never throws: only the
 * window that counted it is changed, and only while it is still open.
 */
export async function refundHanogtAi(pass: QuotaPass): Promise<boolean> {
    return releaseFromWindow(pass.counted.key, pass.counted.windowMs, pass.counted.startedAt, 1, pass.counted.memory).catch(() => false);
}

/**
 * One message through the person's own connection. The plan has to include
 * connections (Plus and Pro; Paddle is asked once before refusing), and the
 * message counts in Hanogt AI's window like any other: there is no separate
 * allowance for own keys. The caller gives it back with refundHanogtAi when
 * the provider answered nothing.
 */
export async function enforceOwnKeys(email: string, options: HealOptions = {}): Promise<QuotaPass | QuotaRefusal | QuotaNoPlan> {
    let subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    let asked = false;
    if (PLAN_AI_CONNECTIONS[effectivePlan(subscription)] <= 0) {
        asked = true;
        const healed = await healBeforeRefusing(email, subscription, options).catch(() => null);
        if (healed?.upgraded) subscription = healed.subscription;
        if (PLAN_AI_CONNECTIONS[effectivePlan(subscription)] <= 0) return { ok: false, code: "connection_unavailable", plan: effectivePlan(subscription) };
    }
    return enforceWindows(email, subscription, options, asked);
}

/** The headers an answer reports its window with (src/lib/ai/usage.ts QUOTA_HEADERS). */
export function quotaHeaders(quota: WindowQuota): Record<string, string> {
    return {
        [QUOTA_HEADERS.quota]: quota.quota,
        [QUOTA_HEADERS.limit]: String(quota.limit),
        [QUOTA_HEADERS.remaining]: String(quota.remaining),
        [QUOTA_HEADERS.days]: String(quota.windowDays),
        ...(quota.resetsAt ? { [QUOTA_HEADERS.reset]: quota.resetsAt } : {}),
    };
}

/** The body fields of a 429 (besides `error` and `code`): what the limit is, when it resets, which plan raises it. */
export function refusalDetails(refusal: QuotaRefusal) {
    return { quota: refusal.quota, plan: refusal.plan, limit: refusal.limit, used: refusal.used, resetsAt: refusal.resetsAt, windowDays: refusal.windowDays, upgrade: refusal.upgrade };
}
