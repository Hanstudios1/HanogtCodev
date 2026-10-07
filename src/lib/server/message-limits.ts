import "server-only";

import { FREE_SUBSCRIPTION, MESSAGE_CHARS_MAX, PLAN_MESSAGE_CHARS, effectivePlan, firstPlanUpWhere, type PaidPlanId, type PlanId } from "@/lib/plans";
import { healBeforeRefusing, type HealOptions } from "./entitlements";
import { getSubscription } from "./plans";

/*
 * How long a Hanogt Social message (direct messages and groups, sent or
 * edited) may be: the sender's plan (PLAN_MESSAGE_CHARS: Free 4,000, Plus
 * 6,000, Pro 8,000 characters). A text within Free's limit needs no read.
 * Kept free of next/server so the plain-Node tests can load it.
 */

export type MessageLengthCheck = { allowed: true } | { allowed: false; plan: PlanId; limit: number; upgrade: PaidPlanId | null };

/** Whether `length` characters fit `email`'s plan; before refusing, Paddle is asked once (a purchase no notification reported). */
export async function checkMessageLength(email: string, length: number, options: HealOptions = {}): Promise<MessageLengthCheck> {
    if (length <= PLAN_MESSAGE_CHARS.free) return { allowed: true };
    let subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    const fits = () => length <= PLAN_MESSAGE_CHARS[effectivePlan(subscription)];
    if (!fits() && length <= MESSAGE_CHARS_MAX && effectivePlan(subscription) !== "pro") {
        const healed = await healBeforeRefusing(email, subscription, options).catch(() => null);
        if (healed?.upgraded) subscription = healed.subscription;
    }
    if (fits()) return { allowed: true };
    const plan = effectivePlan(subscription);
    return { allowed: false, plan, limit: PLAN_MESSAGE_CHARS[plan], upgrade: firstPlanUpWhere(plan, (id) => length <= PLAN_MESSAGE_CHARS[id]) };
}
