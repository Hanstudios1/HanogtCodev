import { NextResponse, type NextRequest } from "next/server";
import { PAID_PLAN_IDS, aiLimitsFor, effectivePlan, isPaidPlanId, type PaidPlanId, type PlanCatalog, type PlansResponse } from "@/lib/plans";
import { getActiveSession } from "@/lib/server/active-session";
import { commitServerMutations, getServerDocument, isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { AI_DAY_MS, AI_LIMIT_KEYS, getPlanCatalog, getSubscription } from "@/lib/server/plans";
import { enforceRateLimitWithFallback, readRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";

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

/** GET /api/plans: the "coming soon" catalog and, when signed in, your plan and Hanogt AI usage. */
export async function GET() {
    if (!isFirebaseServerConfigured()) return json({ error: "unavailable" }, 503);
    try {
        const [catalog, active] = await Promise.all([getPlanCatalog(), getActiveSession()]);
        if (!active) return json({ catalog: publicCatalog(catalog), me: null } satisfies PlansResponse);
        const [subscription, used, waitlist] = await Promise.all([
            getSubscription(active.email),
            readRateLimit(AI_LIMIT_KEYS(active.email).day, AI_DAY_MS).catch(() => null),
            waitlistOf(active.email),
        ]);
        return json({
            catalog: publicCatalog(catalog),
            me: {
                plan: effectivePlan(subscription),
                assignedPlan: subscription.plan,
                blocked: subscription.status === "blocked",
                expiresAt: subscription.expiresAt,
                aiLimits: aiLimitsFor(subscription),
                aiUsedToday: used?.count ?? 0,
                waitlist,
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
