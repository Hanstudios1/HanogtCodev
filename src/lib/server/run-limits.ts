import "server-only";

import { FREE_SUBSCRIPTION, PLAN_RUN_LIMITS, effectivePlan, nextPlanUp, type PaidPlanId, type PlanId } from "@/lib/plans";
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

/** Counts `files` files of one run request against the plan's minute. */
export async function enforceRunQuota(email: string, files: number, options: HealOptions = {}): Promise<RunQuota> {
    let subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
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
