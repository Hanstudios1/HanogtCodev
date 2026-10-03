import "server-only";

import { audienceAllows } from "@/lib/features";
import { planBadgeOf, readStoredPlanBadge, sameStoredBadge, type PlanBadgeState } from "@/lib/plan-badge";
import { effectivePlan, type UserSubscription } from "@/lib/plans";
import { getFeatureFlags } from "./features";
import { getServerDocument, isMissingDocument, patchServerDocument } from "./firebase-rest";
import { getSubscription } from "./plans";
import { resolveUserRole } from "./roles";

/*
 * public_profiles/{email}.planBadge follows the account's plan
 * (src/lib/plan-badge.ts): written after Paddle stores a subscription, after
 * staff change a plan, when the subscriber hides or shows it, and (throttled)
 * when they open Pricing or Account Settings. The team's plan_badge audience
 * decides whose badges exist: staff accounts only, early access (Pro and
 * staff) or every subscriber. Kept free of next/server so the plain-Node
 * tests can load it.
 */

export type PlanBadgeOptions = {
    /** The subscription when the caller has just read it. */
    subscription?: UserSubscription;
    /** Whether the account is staff, when the caller knows. */
    staff?: boolean;
    now?: number;
};

/** Whether the team opened plan badges for this account (as the profile's owner). */
export async function planBadgeAllowed(email: string, subscription: UserSubscription, staff?: boolean, now = Date.now()) {
    const isStaff = staff ?? resolveUserRole(email, (await getServerDocument<{ role?: unknown }>(`users/${email}`).catch(() => null))?.role) !== "user";
    return audienceAllows((await getFeatureFlags()).plan_badge, { staff: isStaff, plan: effectivePlan(subscription, now) });
}

/** The subscriber's own view: the plan's badge, hidden or not, opened for them or not (an unreadable flag: not). */
export async function planBadgeStateFor(email: string, subscription: UserSubscription, staff?: boolean, now = Date.now()): Promise<PlanBadgeState> {
    const plan = effectivePlan(subscription, now);
    return {
        plan: plan === "free" ? null : plan,
        hidden: subscription.planBadgeHidden,
        allowed: await planBadgeAllowed(email, subscription, staff, now).catch(() => false),
    };
}

/** Brings the profile's badge in line with the plan; true when it wrote something. */
export async function syncPlanBadge(email: string, options: PlanBadgeOptions = {}): Promise<boolean> {
    const now = options.now ?? Date.now();
    const subscription = options.subscription ?? await getSubscription(email);
    const desired = (await planBadgeAllowed(email, subscription, options.staff, now)) ? planBadgeOf(subscription, now) : null;
    const profile = await getServerDocument<{ planBadge?: unknown }>(`public_profiles/${email}`);
    // No public profile yet (sign-up creates it): nothing to label.
    if (!profile || sameStoredBadge(readStoredPlanBadge(profile.planBadge), desired)) return false;
    try {
        // Only this field, only on an existing profile (a deleted account's profile never comes back).
        await patchServerDocument(`public_profiles/${email}`, desired ? { planBadge: desired } : {}, { updateFields: ["planBadge"], exists: true });
    } catch (error) {
        if (isMissingDocument(error)) return false;
        throw error;
    }
    return true;
}

/** syncPlanBadge after a plan changed: a failure is logged, never passed on. */
export async function syncPlanBadgeQuietly(email: string, options: PlanBadgeOptions = {}) {
    return syncPlanBadge(email, options).catch((error: unknown) => {
        console.warn("[plan-badge]", error instanceof Error ? error.message : error);
        return false;
    });
}

const SYNC_INTERVAL_MS = 10 * 60_000;
const synced = new Map<string, { at: number; audience: string | null }>();

/**
 * For page loads (Pricing, Account Settings): at most every ten minutes per
 * account and server instance, and again as soon as the team changes whose
 * badges exist (the audience is cached in memory, so asking is free).
 */
export async function syncPlanBadgeThrottled(email: string, options: PlanBadgeOptions = {}) {
    const audience = await getFeatureFlags().then((flags) => flags.plan_badge, () => null);
    const last = synced.get(email);
    if (last && last.audience === audience && Date.now() - last.at < SYNC_INTERVAL_MS) return false;
    if (synced.size >= 2_000) synced.clear();
    synced.set(email, { at: Date.now(), audience });
    return syncPlanBadgeQuietly(email, options);
}
