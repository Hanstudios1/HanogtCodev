/**
 * The Plus or Pro badge on a subscriber's profile. The server keeps it in
 * public_profiles/{email}.planBadge = { plan, until } (a field browsers can't
 * write, firestore.rules); readers check `until`, so a badge whose plan ended
 * disappears without anyone deleting it. Subscribers can hide theirs
 * (subscriptions/{email}.planBadgeHidden). Client-safe.
 */
import { PERIOD_GRACE_MS } from "@/lib/paddle";
import { effectivePlan, planSource, type PaidPlanId, type UserSubscription } from "@/lib/plans";

export type PlanBadge = PaidPlanId;
export type StoredPlanBadge = { plan: PlanBadge; until: string | null };

/** The subscriber's own view of the badge (Pricing, Account Settings). */
export type PlanBadgeState = {
    /** The paid plan whose badge the account has; null on Free. */
    plan: PlanBadge | null;
    /** The subscriber chose to hide it. */
    hidden: boolean;
    /** The team opened plan badges for this account (the plan_badge audience). */
    allowed: boolean;
};

/** How long a badge lasts when Paddle didn't say when the paid period ends. */
const UNKNOWN_PERIOD_MS = 35 * 24 * 60 * 60_000;

const isBadge = (value: unknown): value is PlanBadge => value === "plus" || value === "pro";

/** A stored badge, checked; null when missing or broken. */
export function readStoredPlanBadge(value: unknown): StoredPlanBadge | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (!isBadge(record.plan)) return null;
    const until = typeof record.until === "string" && Number.isFinite(Date.parse(record.until)) ? new Date(Date.parse(record.until)).toISOString() : null;
    if (record.until !== null && record.until !== undefined && !until) return null;
    return { plan: record.plan, until };
}

/** The badge to show now: the plan while `until` hasn't passed; null otherwise. */
export function readPlanBadge(value: unknown, now = Date.now()): PlanBadge | null {
    const badge = readStoredPlanBadge(value);
    if (!badge) return null;
    return badge.until === null || Date.parse(badge.until) > now ? badge.plan : null;
}

/**
 * The badge a subscription earns: its plan (blocked or hidden: none) until
 * the end of the paid period plus the payment grace, or until a staff
 * grant ends (a grant without an end gives a badge without one).
 */
export function planBadgeOf(subscription: UserSubscription, now = Date.now()): StoredPlanBadge | null {
    if (subscription.status === "blocked" || subscription.planBadgeHidden) return null;
    const plan = effectivePlan(subscription, now);
    if (plan === "free") return null;
    if (planSource(subscription, now) === "staff") return { plan, until: subscription.expiresAt };
    const ends = [subscription.paddle?.currentPeriodEnd, subscription.paddle?.nextBilledAt]
        .map((iso) => (iso ? Date.parse(iso) : Number.NaN))
        .filter((time) => Number.isFinite(time));
    const end = ends.length ? Math.max(...ends) + PERIOD_GRACE_MS : now + UNKNOWN_PERIOD_MS;
    return { plan, until: new Date(end).toISOString() };
}

/** The badge others see for this state, once the server has caught up. */
export function visiblePlanBadge(state: PlanBadgeState | null | undefined): PlanBadge | null {
    return state && state.allowed && !state.hidden ? state.plan : null;
}

export function sameStoredBadge(a: StoredPlanBadge | null, b: StoredPlanBadge | null) {
    return a === b || (a !== null && b !== null && a.plan === b.plan && a.until === b.until);
}
