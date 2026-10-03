import type { NextRequest } from "next/server";
import { isBillingInterval, paddleEntitles } from "@/lib/paddle";
import { isPaidPlanId } from "@/lib/plans";
import { getStaffSession } from "@/lib/server/admin";
import { billingStep, createCheckoutTransaction, ensureCustomer, getPaddleSettings, isBillingTester } from "@/lib/server/paddle";
import { getPlanCatalog, getSubscription } from "@/lib/server/plans";
import { readJsonBody } from "@/lib/server/validate";
import { billingError, billingFailure, billingGuard, billingJson } from "../_shared";

export const runtime = "nodejs";
// Up to three Paddle calls in a row (8 s each at most) plus the database:
// more than the platform's default limit when Paddle is slow.
export const maxDuration = 60;

/**
 * POST /api/paddle/checkout { plan: "plus" | "pro", interval: "month" | "year" }
 * → { transactionId }: the Plans page opens it with Paddle.js. The checkout
 * belongs to the signed-in account's own Paddle customer.
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    // Ten a minute: the Plans page retries a failed attempt once, so that's five clicks.
    const guard = await billingGuard(request, "checkout", 10);
    if (!guard.ok) return guard.response;
    const body = await readJsonBody<{ plan?: unknown; interval?: unknown }>(request, 1_000);
    if (!body || !isPaidPlanId(body.plan) || !isBillingInterval(body.interval)) return billingError(400, "invalid_request");
    const { plan, interval } = body;
    try {
        const [catalog, settings, subscription] = await Promise.all([
            billingStep("catalog", () => getPlanCatalog()),
            billingStep("settings", () => getPaddleSettings()),
            billingStep("subscription", () => getSubscription(guard.email)),
        ]);
        const priceId = settings.prices[plan][interval];
        if (!catalog.plans[plan].visible || !priceId) return billingError(409, "plan_unavailable");
        if (!settings.salesOpen && !isBillingTester(guard.email, Boolean(await getStaffSession().catch(() => null)))) return billingError(409, "plan_unavailable");
        if (subscription.status === "blocked") return billingError(403, "plan_blocked");
        // A second subscription would bill twice; changing plans goes through /api/paddle/subscription.
        if (paddleEntitles(subscription.paddle)) return billingError(409, "already_subscribed");
        const customerId = await billingStep("customer", () => ensureCustomer(guard.email, subscription.paddleCustomerId));
        const { transactionId } = await billingStep("transaction", () => createCheckoutTransaction({ email: guard.email, plan, priceId, customerId }));
        return billingJson({ transactionId });
    } catch (error) {
        return billingFailure(error, { route: "checkout", email: guard.email, startedAt });
    }
}
