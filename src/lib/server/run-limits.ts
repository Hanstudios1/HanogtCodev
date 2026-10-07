import "server-only";

import { FREE_SUBSCRIPTION, PLAN_RUN_LIMITS, PLAN_RUN_SIZES, effectivePlan, firstPlanUpWhere, nextPlanUp, type PaidPlanId, type PlanId, type PlanRunSizes, type UserSubscription } from "@/lib/plans";
import { healBeforeRefusing, type HealOptions } from "./entitlements";
import { getSubscription } from "./plans";
import { enforceRateLimitWithFallback } from "./rate-limit";

/*
 * Code the server runs (src/app/api/execute/route.ts): every request counts
 * its files in a minute whose size is the plan's (PLAN_RUN_LIMITS: Free 40,
 * Plus 150, Pro 400 files a minute). Before refusing, Paddle is asked once,
 * so a purchase no notification reported counts at once. Kept free of
 * next/server so the plain-Node tests can load it; the route passes after()
 * as `onLate`.
 */

const MINUTE_MS = 60_000;

/** The rate-limit key of the files a person runs on the server in a minute. */
export const RUN_LIMIT_KEY = (email: string) => `execute-files:${email}`;

export type RunQuota =
    | { allowed: true; plan: PlanId; limit: number; remaining: number }
    | { allowed: false; plan: PlanId; limit: number; retryAfterSeconds: number; upgrade: PaidPlanId | null };

/** What a run is too big in for `sizes`: one file, all the files together or the program's input; null when it fits. */
export function runSizeProblem(sizes: PlanRunSizes, fileChars: number[], stdinChars: number): "file" | "request" | "stdin" | null {
    if (fileChars.some((chars) => chars > sizes.fileChars)) return "file";
    if (fileChars.reduce((total, chars) => total + chars, 0) > sizes.requestChars) return "request";
    if (stdinChars > sizes.stdinChars) return "stdin";
    return null;
}

export type RunSizeCheck =
    | { ok: true; subscription: UserSubscription; plan: PlanId; sizes: PlanRunSizes }
    | { ok: false; plan: PlanId; sizes: PlanRunSizes; problem: "file" | "request" | "stdin"; upgrade: PaidPlanId | null };

/**
 * Checks a run's size against the person's plan (PLAN_RUN_SIZES: Free 50,000
 * characters a file, Plus 100,000, Pro 200,000…). Before refusing, Paddle is
 * asked once, so a purchase no notification reported counts at once.
 */
export async function checkRunSize(email: string, fileChars: number[], stdinChars: number, options: HealOptions = {}): Promise<RunSizeCheck> {
    let subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    let problem = runSizeProblem(PLAN_RUN_SIZES[effectivePlan(subscription)], fileChars, stdinChars);
    if (problem && effectivePlan(subscription) !== "pro") {
        const healed = await healBeforeRefusing(email, subscription, options).catch(() => null);
        if (healed?.upgraded) {
            subscription = healed.subscription;
            problem = runSizeProblem(PLAN_RUN_SIZES[effectivePlan(subscription)], fileChars, stdinChars);
        }
    }
    const plan = effectivePlan(subscription);
    if (problem) return { ok: false, plan, sizes: PLAN_RUN_SIZES[plan], problem, upgrade: firstPlanUpWhere(plan, (id) => !runSizeProblem(PLAN_RUN_SIZES[id], fileChars, stdinChars)) };
    return { ok: true, subscription, plan, sizes: PLAN_RUN_SIZES[plan] };
}

/** Counts `files` files of one run request against the plan's minute (`subscription` when the caller already read it). */
export async function enforceRunQuota(email: string, files: number, options: HealOptions & { subscription?: UserSubscription } = {}): Promise<RunQuota> {
    let subscription = options.subscription ?? await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    const key = RUN_LIMIT_KEY(email);
    const limitOf = () => PLAN_RUN_LIMITS[effectivePlan(subscription)].perMinute;
    let result = await enforceRateLimitWithFallback(key, limitOf(), MINUTE_MS, files);
    if (!result.allowed) {
        const healed = await healBeforeRefusing(email, subscription, options).catch(() => null);
        if (healed?.upgraded) {
            subscription = healed.subscription;
            result = await enforceRateLimitWithFallback(key, limitOf(), MINUTE_MS, files);
        }
    }
    const plan = effectivePlan(subscription);
    if (!result.allowed) return { allowed: false, plan, limit: limitOf(), retryAfterSeconds: result.retryAfterSeconds, upgrade: nextPlanUp(plan) };
    return { allowed: true, plan, limit: limitOf(), remaining: result.remaining };
}
