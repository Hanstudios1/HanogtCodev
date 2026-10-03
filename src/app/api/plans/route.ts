import { NextResponse, type NextRequest } from "next/server";
import { billingView, paddleEntitles, type PaddleCheckoutConfig } from "@/lib/paddle";
import { PAID_PLAN_IDS, aiLimitsFor, effectivePlan, isPaidPlanId, isRecentCheckout, planSource, type PaidPlanId, type PlanCatalog, type PlansResponse, type UserSubscription } from "@/lib/plans";
import { getActiveSession } from "@/lib/server/active-session";
import { getStaffSession } from "@/lib/server/admin";
import { commitServerMutations, getServerDocument, isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { checkoutConfigFor, getPaddleConfig, isBillingTester, syncSubscription } from "@/lib/server/paddle";
import { selfHealReason, syncAccountFromPaddle, withDeadline } from "@/lib/server/paddle-sync";
import { AI_DAY_MS, AI_LIMIT_KEYS, getPlanCatalog, getSubscription } from "@/lib/server/plans";
import { enforceRateLimitWithFallback, readRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";
// Paddle's localized prices (and, now and then, a subscription re-sync) on top of the database.
export const maxDuration = 60;

function json(payload: unknown, status = 200) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders({ "Cache-Control": "no-store" }) });
}

/** Prices the team hasn't published yet stay hidden. */
function publicCatalog(catalog: PlanCatalog): PlanCatalog {
    return {
        ...catalog,
        plans: Object.fromEntries(PAID_PLAN_IDS.map((id) => {
            const price = catalog.plans[id];
            return [id, price.visible ? price : { ...price, monthly: null, yearly: null, discountPercent: 0 }];
        })) as PlanCatalog["plans"],
    };
}

async function waitlistOf(email: string): Promise<PaidPlanId[]> {
    const record = await getServerDocument<{ plans?: unknown }>(`plan_waitlist/${email}`).catch(() => null);
    return Array.isArray(record?.plans) ? record.plans.filter(isPaidPlanId) : [];
}

/** Paddle prices for the visitor's country; null keeps the "coming soon" page. */
async function checkoutOf(catalog: PlanCatalog, request: NextRequest, email: string | null, staff: boolean): Promise<PaddleCheckoutConfig | null> {
    try {
        return await checkoutConfigFor(catalog, request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? null, { tester: isBillingTester(email, staff) });
    } catch (error) {
        console.error("[plans:paddle]", error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * What Paddle knows but no notification told us, asked once every ten
 * minutes at most (selfHealReason): a paid period that ended without a
 * renewal, or a Paddle customer without a subscription that unlocks a plan
 * (a purchase whose notification never arrived). Answers with what Paddle says.
 */
async function refreshedSubscription(email: string, subscription: UserSubscription): Promise<UserSubscription> {
    const reason = selfHealReason(subscription);
    if (!reason || !getPaddleConfig().apiKey) return subscription;
    const rate = await enforceRateLimitWithFallback(`paddle-resync:${email}`, 1, 10 * 60_000).catch(() => ({ allowed: false }));
    if (!rate.allowed) return subscription;
    try {
        if (reason === "lapsed" && subscription.paddle) {
            const result = await syncSubscription(subscription.paddle.subscriptionId);
            return result.status === "stored" ? await getSubscription(email) : subscription;
        }
        // At most a few seconds on top of the page load; a slow Paddle finishes in the background.
        return (await withDeadline(syncAccountFromPaddle(email), 6_000, "none")) === "active" ? await getSubscription(email) : subscription;
    } catch (error) {
        console.warn("[plans:paddle-sync]", reason, error instanceof Error ? error.message : error);
        return subscription;
    }
}

/** GET /api/plans: the catalog (with Paddle prices once plans are on sale) and, when signed in, your plan and Hanogt AI usage. */
export async function GET(request: NextRequest) {
    if (!isFirebaseServerConfigured()) return json({ error: "unavailable" }, 503);
    try {
        const [catalog, active] = await Promise.all([getPlanCatalog(), getActiveSession()]);
        const staff = active ? Boolean(await getStaffSession().catch(() => null)) : false;
        const checkout = await checkoutOf(catalog, request, active?.email ?? null, staff);
        if (!active) return json({ catalog: publicCatalog(catalog), checkout, me: null } satisfies PlansResponse);
        const [stored, used, waitlist] = await Promise.all([
            getSubscription(active.email),
            readRateLimit(AI_LIMIT_KEYS(active.email).day, AI_DAY_MS).catch(() => null),
            waitlistOf(active.email),
        ]);
        const subscription = await refreshedSubscription(active.email, stored);
        return json({
            catalog: publicCatalog(catalog),
            checkout,
            me: {
                plan: effectivePlan(subscription),
                source: planSource(subscription),
                assignedPlan: subscription.plan,
                blocked: subscription.status === "blocked",
                expiresAt: subscription.expiresAt,
                billing: billingView(subscription.paddle),
                canManageBilling: Boolean(subscription.paddleCustomerId ?? subscription.paddle?.customerId),
                paddleCustomerId: subscription.paddleCustomerId ?? subscription.paddle?.customerId ?? null,
                checkoutPending: Boolean(subscription.paddleCustomerId) && !paddleEntitles(subscription.paddle) && isRecentCheckout(subscription.paddleCheckout),
                aiLimits: aiLimitsFor(subscription),
                aiUsedToday: used?.count ?? 0,
                waitlist,
                isStaff: staff,
            },
        } satisfies PlansResponse);
    } catch {
        return json({ error: "unavailable" }, 503);
    }
}

/** POST /api/plans { action: "waitlist", plan: "plus" | "pro", join: boolean }: "Let me know when it opens". */
export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ error: "forbidden_origin" }, 403);
    if (!isFirebaseServerConfigured()) return json({ error: "unavailable" }, 503);
    const active = await getActiveSession();
    if (!active) return json({ error: "unauthorized" }, 401);
    const rate = await enforceRateLimitWithFallback(`plans-waitlist:${active.email}`, 20, 60_000);
    if (!rate.allowed) return json({ error: "rate_limited" }, 429);
    const body = await readJsonBody<{ action?: unknown; plan?: unknown; join?: unknown }>(request, 1_000);
    if (!body || body.action !== "waitlist" || !isPaidPlanId(body.plan) || typeof body.join !== "boolean") return json({ error: "invalid_request" }, 400);
    try {
        const current = await waitlistOf(active.email);
        const plans = body.join ? [...new Set([...current, body.plan])] : current.filter((plan) => plan !== body.plan);
        const path = `plan_waitlist/${active.email}`;
        await commitServerMutations([
            plans.length
                ? { type: "update", path, data: { plans, updatedAt: new Date() }, updateFields: ["plans", "updatedAt"] }
                : { type: "delete", path },
        ]);
        return json({ waitlist: plans });
    } catch {
        return json({ error: "unavailable" }, 503);
    }
}
