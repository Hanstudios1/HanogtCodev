import "server-only";

import { FREE_SUBSCRIPTION, PLAN_GROUP_FEATURES, effectivePlan, type GroupPlanLimits, type PlanId } from "@/lib/plans";
import { getSubscription } from "./plans";

/*
 * What a Hanogt Social group holds is set by its owner's plan
 * (PLAN_GROUP_FEATURES): members, pinned messages, custom commands and
 * AutoMod's own banned words. The plan is read fresh, so a new owner or a new
 * plan counts at once. Kept free of next/server so the plain-Node tests can
 * load it.
 */

/** The group's limits by its owner's plan; Free when the owner or the plan can't be read. */
export async function groupLimitsFor(ownerEmail: string | null | undefined): Promise<{ plan: PlanId; limits: GroupPlanLimits }> {
    if (!ownerEmail) return { plan: "free", limits: PLAN_GROUP_FEATURES.free };
    const subscription = await getSubscription(ownerEmail).catch(() => FREE_SUBSCRIPTION);
    const plan = effectivePlan(subscription);
    return { plan, limits: PLAN_GROUP_FEATURES[plan] };
}

/**
 * Whether a list may go from `previous` to `next` items under `limit`: always
 * when it doesn't grow, so a group above its limit (its owner's plan went
 * down) can still edit and remove what it has.
 */
export function fitsGroupLimit(next: number, previous: number, limit: number) {
    return next <= limit || next <= previous;
}
