import { after, type NextRequest } from "next/server";
import { billingView, isBillingInterval, paddleEntitles } from "@/lib/paddle";
import { effectivePlan, isPaidPlanId } from "@/lib/plans";
import { PaddleApiError, applyPlanChange, billingStep, customerSubscriptions, getPaddleSettings, keepSubscription, paddleStatusOf, portalLinks, previewPlanChange, resumeSubscription, syncSubscription } from "@/lib/server/paddle";
import { getPlanCatalog, getSubscription } from "@/lib/server/plans";
import { readJsonBody } from "@/lib/server/validate";
import { billingError, billingFailure, billingGuard, billingJson } from "../_shared";

export const runtime = "nodejs";
// A plan change waits for Paddle and then for the stored subscription.
export const maxDuration = 60;

const ACTIONS = ["preview", "change", "portal", "keep", "resume"] as const;
type Action = (typeof ACTIONS)[number];

/** Paddle refused because what we stored is out of date (e.g. cancelled meanwhile): refresh it after answering. */
function refreshAfterRefusal(error: unknown, subscriptionId: string) {
    const cause = error && typeof error === "object" && "original" in error ? (error as { original: unknown }).original : error;
    if (cause instanceof PaddleApiError && cause.status >= 400 && cause.status < 500) {
        after(() => syncSubscription(subscriptionId).then(() => undefined, () => undefined));
    }
}

/**
 * POST /api/paddle/subscription
 *   { action: "preview", plan, interval } → what switching costs now (prorated; nothing in a free trial)
 *   { action: "change", plan, interval }  → switches the plan right away
 *   { action: "portal" }                  → links to Paddle's customer portal
 *   { action: "keep" }                    → undoes a scheduled cancellation
 *   { action: "resume" }                  → resumes the account's paused subscription now
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const guard = await billingGuard(request, "subscription", 20);
    if (!guard.ok) return guard.response;
    const body = await readJsonBody<{ action?: unknown; plan?: unknown; interval?: unknown }>(request, 1_000);
    const action = body && (ACTIONS as readonly unknown[]).includes(body.action) ? body.action as Action : null;
    if (!body || !action) return billingError(400, "invalid_request");

    let current: string | null = null;
    try {
        const subscription = await billingStep("subscription", () => getSubscription(guard.email));
        const state = subscription.paddle;
        current = state?.subscriptionId ?? null;

        if (action === "portal") {
            // The portal belongs to someone who has (or had) a subscription, not to anyone who opened a checkout.
            const customerId = subscription.paddleCustomerId ?? state?.customerId ?? null;
            if (!customerId || !state) return billingError(404, "no_subscription");
            return billingJson(await billingStep("portal", () => portalLinks(customerId, state.subscriptionId)));
        }

        if (action === "resume") {
            if (subscription.status === "blocked") return billingError(403, "plan_blocked");
            const customerId = subscription.paddleCustomerId ?? state?.customerId ?? null;
            if (!customerId) return billingError(404, "no_subscription");
            // The paused one is the stored one, or one Paddle lists for the account's customer; never an id from the browser.
            const paused = state?.status === "paused" && state.customerId === customerId
                ? state
                : null;
            const pausedId = paused?.subscriptionId
                ?? (await billingStep("resume", () => customerSubscriptions(customerId))).find((entity) => paddleStatusOf(entity.status) === "paused")?.id
                ?? null;
            if (!pausedId) return billingError(409, "no_change");
            current = pausedId;
            // A paid period that hasn't ended carries on without a charge; otherwise Paddle bills a new one now.
            const periodEnd = paused?.currentPeriodEnd ? Date.parse(paused.currentPeriodEnd) : Number.NaN;
            const continuePeriod = Number.isFinite(periodEnd) && periodEnd > Date.now();
            const result = await billingStep("resume", () => resumeSubscription(pausedId, continuePeriod));
            const updated = await billingStep("subscription", () => getSubscription(guard.email));
            return billingJson({ ok: true, plan: effectivePlan(updated), billing: billingView("state" in result ? result.state : updated.paddle) });
        }

        if (!state) return billingError(404, "no_subscription");

        if (action === "keep") {
            if (state.scheduledChange?.action !== "cancel" || state.status === "canceled") return billingError(409, "no_change");
            const result = await billingStep("keep", () => keepSubscription(state.subscriptionId));
            return billingJson({ ok: true, billing: "state" in result ? billingView(result.state) : billingView(state) });
        }

        // preview / change
        if (!isPaidPlanId(body.plan) || !isBillingInterval(body.interval)) return billingError(400, "invalid_request");
        if (subscription.status === "blocked") return billingError(403, "plan_blocked");
        if (!paddleEntitles(state) || state.status === "past_due") return billingError(409, "no_subscription");
        // Only monthly or yearly subscriptions can be moved between the plans we sell.
        if (!state.interval) return billingError(409, "no_change");
        const [catalog, settings] = await Promise.all([billingStep("catalog", () => getPlanCatalog()), billingStep("settings", () => getPaddleSettings())]);
        const priceId = settings.prices[body.plan][body.interval];
        if (!catalog.plans[body.plan].visible || !priceId) return billingError(409, "plan_unavailable");
        if (priceId === state.priceId) return billingError(409, "no_change");
        // In a free trial Paddle bills nothing yet: the change applies and the first payment is the new price.
        const trialing = state.status === "trialing";

        if (action === "preview") return billingJson({ preview: await billingStep("preview", () => previewPlanChange(state.subscriptionId, priceId, trialing)) });

        const result = await billingStep("change", () => applyPlanChange(state.subscriptionId, priceId, trialing));
        const updated = await billingStep("subscription", () => getSubscription(guard.email));
        return billingJson({ ok: true, plan: effectivePlan(updated), billing: billingView("state" in result ? result.state : updated.paddle) });
    } catch (error) {
        if (current && action !== "portal") refreshAfterRefusal(error, current);
        return billingFailure(error, { route: `subscription:${action}`, email: guard.email, startedAt });
    }
}
