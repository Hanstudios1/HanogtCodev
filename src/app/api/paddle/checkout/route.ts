import type { NextRequest } from "next/server";
import { isBillingInterval, paddleEntitles } from "@/lib/paddle";
import { isPaidPlanId } from "@/lib/plans";
import { hasVerifiedEmail } from "@/lib/server/active-session";
import { getStaffSession } from "@/lib/server/admin";
import { CouponError, couponDiscount, findCoupon } from "@/lib/server/coupons";
import { BillingStepError, billingStep, createCheckoutTransaction, ensureCustomer, getPaddleSettings, isBillingTester } from "@/lib/server/paddle";
import { purchaseCheck, rememberCheckout } from "@/lib/server/paddle-sync";
import { getPlanCatalog, getSubscription } from "@/lib/server/plans";
import { readJsonBody } from "@/lib/server/validate";
import { billingError, billingFailure, billingGuard, billingJson } from "../_shared";

export const runtime = "nodejs";
// Up to five Paddle calls in a row (8 s each at most) plus the database:
// more than the platform's default limit when Paddle is slow.
export const maxDuration = 60;

/**
 * POST /api/paddle/checkout { plan: "plus" | "pro", interval: "month" | "year", coupon?: "CODE" }
 * → { transactionId }: the Plans page opens it with Paddle.js. The checkout
 * belongs to the signed-in account's own Paddle customer; an accepted coupon
 * is on it as a Paddle discount.
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    // Ten a minute: the Plans page retries a failed attempt once, so that's five clicks.
    const guard = await billingGuard(request, "checkout", 10);
    if (!guard.ok) return guard.response;
    const body = await readJsonBody<{ plan?: unknown; interval?: unknown; coupon?: unknown }>(request, 1_000);
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
        // The customer first: a customer Paddle already had may pay for a subscription we never heard of.
        const { customerId, created } = await billingStep("customer", () => ensureCustomer(guard.email, subscription.paddleCustomerId, { verified: hasVerifiedEmail(guard.user) }));
        if (!created) {
            // Whatever we have stored: a lost notification must not lead to a second subscription.
            // If Paddle can't be asked, nothing is sold (the page retries).
            const block = await billingStep("check", () => purchaseCheck(guard.email, customerId, subscription));
            if (block) return billingError(409, block);
        }
        let discountId: string | null = null;
        if (body.coupon !== undefined && body.coupon !== null && body.coupon !== "") {
            const coupon = await billingStep("coupon", () => findCoupon(body.coupon, plan));
            discountId = await billingStep("discount", () => couponDiscount(coupon.view, coupon.record, priceId));
        }
        const { transactionId } = await billingStep("transaction", () => createCheckoutTransaction({ email: guard.email, plan, priceId, customerId, discountId }));
        // So /api/paddle/sync can follow this checkout up with Paddle (best effort: the checkout works without it).
        await rememberCheckout(guard.email, transactionId).catch((error: unknown) => console.warn("[paddle:checkout] remember", error instanceof Error ? error.message : error));
        return billingJson({ transactionId });
    } catch (error) {
        // A code that can't be used is an answer, not a failure.
        const cause = error instanceof BillingStepError ? error.original : error;
        if (cause instanceof CouponError) return billingError(409, cause.code);
        return billingFailure(error, { route: "checkout", email: guard.email, startedAt });
    }
}
