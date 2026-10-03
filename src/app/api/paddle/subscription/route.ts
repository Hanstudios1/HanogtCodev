import type { NextRequest } from "next/server";
import { billingView, isBillingInterval, paddleEntitles } from "@/lib/paddle";
import { effectivePlan, isPaidPlanId } from "@/lib/plans";
import { applyPlanChange, billingStep, getPaddleSettings, keepSubscription, portalLinks, previewPlanChange } from "@/lib/server/paddle";
import { getPlanCatalog, getSubscription } from "@/lib/server/plans";
import { readJsonBody } from "@/lib/server/validate";
import { billingError, billingFailure, billingGuard, billingJson } from "../_shared";

export const runtime = "nodejs";
// A plan change waits for Paddle and then for the stored subscription.
export const maxDuration = 60;

const ACTIONS = ["preview", "change", "portal", "keep"] as const;
type Action = (typeof ACTIONS)[number];

/**
 * POST /api/paddle/subscription
 *   { action: "preview", plan, interval } → what switching costs now (prorated)
 *   { action: "change", plan, interval }  → switches the plan right away
 *   { action: "portal" }                  → links to Paddle's customer portal
 *   { action: "keep" }                    → undoes a scheduled cancellation
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const guard = await billingGuard(request, "subscription", 20);
    if (!guard.ok) return guard.response;
    const body = await readJsonBody<{ action?: unknown; plan?: unknown; interval?: unknown }>(request, 1_000);
    const action = body && (ACTIONS as readonly unknown[]).includes(body.action) ? body.action as Action : null;
    if (!body || !action) return billingError(400, "invalid_request");

    try {
        const subscription = await billingStep("subscription", () => getSubscription(guard.email));
        const state = subscription.paddle;

        if (action === "portal") {
            const customerId = subscription.paddleCustomerId ?? state?.customerId ?? null;
            if (!customerId) return billingError(404, "no_subscription");
            return billingJson(await billingStep("portal", () => portalLinks(customerId, state?.subscriptionId ?? null)));
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
        const [catalog, settings] = await Promise.all([billingStep("catalog", () => getPlanCatalog()), billingStep("settings", () => getPaddleSettings())]);
        const priceId = settings.prices[body.plan][body.interval];
        if (!catalog.plans[body.plan].visible || !priceId) return billingError(409, "plan_unavailable");
        if (priceId === state.priceId) return billingError(409, "no_change");

        if (action === "preview") return billingJson({ preview: await billingStep("preview", () => previewPlanChange(state.subscriptionId, priceId)) });

        const result = await billingStep("change", () => applyPlanChange(state.subscriptionId, priceId));
        const updated = await billingStep("subscription", () => getSubscription(guard.email));
        return billingJson({ ok: true, plan: effectivePlan(updated), billing: billingView("state" in result ? result.state : updated.paddle) });
    } catch (error) {
        return billingFailure(error, { route: `subscription:${action}`, email: guard.email, startedAt });
    }
}
