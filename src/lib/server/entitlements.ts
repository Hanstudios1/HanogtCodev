import "server-only";

import { FREE_SUBSCRIPTION, PLAN_GROUP_LIMITS, PLAN_PROJECT_LIMITS, effectivePlan, planRank, type PlanId, type UserSubscription } from "@/lib/plans";
import { refreshSubscriptionFromPaddle } from "./paddle-sync";
import { getSubscription } from "./plans";

/*
 * Plan benefits everywhere, right after paying. Every limit reads the plan
 * fresh, so a stored subscription counts at once; what can lag is a purchase
 * Paddle hasn't reported yet (a late or lost notification). Before a limit
 * refuses someone, these helpers ask Paddle once (throttled to every ten
 * minutes per account, and only when selfHealReason says it may help), so a
 * person who just paid isn't held to the Free limits in the editor, the game
 * engine, groups or Hanogt AI. Kept free of next/server so the plain-Node
 * tests can load it; routes pass after() as `onLate`.
 */

export type HealOptions = {
    /** Paddle answering later than this is left running (routes pass Next's after()). */
    deadlineMs?: number;
    onLate?: (work: Promise<unknown>) => void;
    now?: number;
};

/**
 * Asks Paddle about the account when a limit is about to refuse it.
 * `upgraded`: the plan is higher afterwards, so the caller checks again with
 * the new limit (only the check that refused; one that let the request through
 * has counted it already).
 */
export async function healBeforeRefusing(email: string, subscription: UserSubscription | null = null, options: HealOptions = {}) {
    const before = subscription ?? (await getSubscription(email).catch(() => FREE_SUBSCRIPTION));
    const now = options.now ?? Date.now();
    const after = await refreshSubscriptionFromPaddle(email, before, { deadlineMs: options.deadlineMs ?? 6_000, onLate: options.onLate, now });
    const was = effectivePlan(before, now);
    const plan = effectivePlan(after, now);
    return { upgraded: planRank(plan) > planRank(was), plan, subscription: after };
}

export type QuotaKind = "code" | "game" | "group";

/** How many of `kind` the plan allows; null is unlimited. */
export function quotaLimit(kind: QuotaKind, plan: PlanId): number | null {
    return kind === "group" ? PLAN_GROUP_LIMITS[plan] : PLAN_PROJECT_LIMITS[plan][kind];
}

export type QuotaAnswer = { allowed: boolean; plan: PlanId; limit: number | null };

/**
 * Whether the account may create one more code project, game project or
 * group. `count(upTo)` counts what it has, capped at `upTo` (the queries stop
 * there), so after a heal the count is taken again with the new limit: a count
 * capped at the old limit says nothing about a higher one.
 */
export async function planQuota(email: string, kind: QuotaKind, count: (upTo: number) => Promise<number>, options: HealOptions = {}): Promise<QuotaAnswer> {
    const subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    const plan = effectivePlan(subscription, options.now);
    const limit = quotaLimit(kind, plan);
    if (limit === null || (await count(limit + 1)) < limit) return { allowed: true, plan, limit };
    const healed = await healBeforeRefusing(email, subscription, options);
    if (!healed.upgraded) return { allowed: false, plan, limit };
    const next = quotaLimit(kind, healed.plan);
    if (next === null || (await count(next + 1)) < next) return { allowed: true, plan: healed.plan, limit: next };
    return { allowed: false, plan: healed.plan, limit: next };
}
