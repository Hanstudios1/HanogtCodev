import { NextResponse, after, type NextRequest } from "next/server";
import { billingView, paddleEntitles, type PaddleCheckoutConfig } from "@/lib/paddle";
import { PAID_PLAN_IDS, effectivePlan, isPaidPlanId, isRecentCheckout, planSource, type PaidPlanId, type PlanCatalog, type PlansResponse } from "@/lib/plans";
import { getActiveSession } from "@/lib/server/active-session";
import { engineAllowances } from "@/lib/server/ai-engine";
import { getStaffSession } from "@/lib/server/admin";
import { planUsageFor } from "@/lib/server/ai-usage";
import { featureAllowed } from "@/lib/server/features";
import { commitServerMutations, getServerDocument, isFirebaseServerConfigured, isMissingDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { checkoutConfigFor, getPaddleConfig, isBillingTester, isPaddleConfigured } from "@/lib/server/paddle";
import { refreshSubscriptionFromPaddle } from "@/lib/server/paddle-sync";
import { planBadgeStateFor, syncPlanBadge, syncPlanBadgeThrottled } from "@/lib/server/plan-badge";
import { getPlanCatalog, getSubscription } from "@/lib/server/plans";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders, visitorCountryFromHeaders } from "@/lib/server/request-security";
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
        return await checkoutConfigFor(catalog, visitorCountryFromHeaders(request.headers), { tester: isBillingTester(email, staff) });
    } catch (error) {
        console.error("[plans:paddle]", error instanceof Error ? error.message : error);
        return null;
    }
}

/** GET /api/plans: the catalog (with Paddle prices once plans are on sale) and, when signed in, your plan and Hanogt AI usage. */
export async function GET(request: NextRequest) {
    if (!isFirebaseServerConfigured()) return json({ error: "unavailable" }, 503);
    try {
        const [catalog, active, daily] = await Promise.all([getPlanCatalog(), getActiveSession(), engineAllowances()]);
        const staff = active ? Boolean(await getStaffSession().catch(() => null)) : false;
        const checkout = await checkoutOf(catalog, request, active?.email ?? null, staff);
        // The advanced code engine's answers a day on each plan card, when the server has the engine and it is on.
        const engine = daily ? { daily } : null;
        if (!active) return json({ catalog: publicCatalog(catalog), checkout, engine, me: null } satisfies PlansResponse);
        const [stored, waitlist] = await Promise.all([getSubscription(active.email), waitlistOf(active.email)]);
        // What Paddle knows but no notification told us (selfHealReason), asked once every ten minutes at most;
        // a slow Paddle finishes after the answer and counts next time.
        const subscription = await refreshSubscriptionFromPaddle(active.email, stored, { onLate: (work) => after(() => work.then(() => undefined, () => undefined)) });
        // Every benefit with a number, used out of the plan's limit (Hanogt AI today, projects, games, groups, connections).
        // The developer API's requests and keys are listed once the team opened it for the account.
        // The advanced code engine's answers too, when the server has it and the team keeps it on.
        const api = await featureAllowed("ai_api", { staff, plan: effectivePlan(subscription) }).catch(() => false);
        const [usage, badge] = await Promise.all([planUsageFor(active.email, subscription, { api, engine: daily }), planBadgeStateFor(active.email, subscription, staff)]);
        // The profile's Plus / Pro badge catches up with the plan now and then (a lost notification, an ended grant).
        after(() => syncPlanBadgeThrottled(active.email, { subscription, staff }).then(() => undefined));
        return json({
            catalog: publicCatalog(catalog),
            checkout,
            engine,
            me: {
                plan: effectivePlan(subscription),
                source: planSource(subscription),
                assignedPlan: subscription.plan,
                blocked: subscription.status === "blocked",
                expiresAt: subscription.expiresAt,
                billing: billingView(subscription.paddle),
                // The portal is for someone with a subscription (any status), whenever the server can reach Paddle.
                canManageBilling: Boolean(subscription.paddle && (subscription.paddleCustomerId ?? subscription.paddle.customerId) && isPaddleConfigured(getPaddleConfig())),
                paddleCustomerId: subscription.paddleCustomerId ?? subscription.paddle?.customerId ?? null,
                checkoutPending: Boolean(subscription.paddleCustomerId) && !paddleEntitles(subscription.paddle) && isRecentCheckout(subscription.paddleCheckout),
                aiLimits: { perMinute: usage.hanogt.minute.limit, perDay: usage.hanogt.day.limit },
                aiUsedToday: usage.hanogt.day.used,
                usage,
                badge,
                waitlist,
                isStaff: staff,
            },
        } satisfies PlansResponse);
    } catch {
        return json({ error: "unavailable" }, 503);
    }
}

/**
 * POST /api/plans
 *   { action: "waitlist", plan: "plus" | "pro", join: boolean }  "Let me know when it opens"
 *   { action: "badge", hidden: boolean }                          hide or show the Plus / Pro badge on the profile
 */
export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ error: "forbidden_origin" }, 403);
    if (!isFirebaseServerConfigured()) return json({ error: "unavailable" }, 503);
    const active = await getActiveSession();
    if (!active) return json({ error: "unauthorized" }, 401);
    const rate = await enforceRateLimitWithFallback(`plans-waitlist:${active.email}`, 20, 60_000);
    if (!rate.allowed) return json({ error: "rate_limited" }, 429);
    const body = await readJsonBody<{ action?: unknown; plan?: unknown; join?: unknown; hidden?: unknown }>(request, 1_000);
    if (body?.action === "badge") return setBadgeHidden(active.email, body.hidden);
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

/** Hides or shows the subscriber's badge: subscriptions/{email}.planBadgeHidden, then the profile follows. */
async function setBadgeHidden(email: string, hidden: unknown) {
    if (typeof hidden !== "boolean") return json({ error: "invalid_request" }, 400);
    try {
        const subscription = await getSubscription(email);
        const plan = effectivePlan(subscription);
        if (plan === "free") return json({ error: "no_plan" }, 409);
        // Only these fields, only while the record exists (an account deleted meanwhile stays deleted).
        await patchServerDocument(`subscriptions/${email}`, { planBadgeHidden: hidden, updatedAt: new Date() }, { updateFields: ["planBadgeHidden", "updatedAt"], exists: true });
        const next = { ...subscription, planBadgeHidden: hidden };
        const staff = Boolean(await getStaffSession().catch(() => null));
        await syncPlanBadge(email, { subscription: next, staff });
        return json({ badge: await planBadgeStateFor(email, next, staff) });
    } catch (error) {
        if (isMissingDocument(error)) return json({ error: "no_plan" }, 409);
        return json({ error: "unavailable" }, 503);
    }
}
