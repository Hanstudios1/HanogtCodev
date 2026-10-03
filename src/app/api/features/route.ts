import { NextResponse } from "next/server";
import { allowedFeatures, rolloutFeatures, type FeaturesResponse } from "@/lib/features";
import { FREE_SUBSCRIPTION, effectivePlan } from "@/lib/plans";
import { getActiveSession } from "@/lib/server/active-session";
import { getStaffSession } from "@/lib/server/admin";
import { getFeatureFlags } from "@/lib/server/features";
import { getSubscription } from "@/lib/server/plans";
import { memoryRateLimit } from "@/lib/server/rate-limit";
import { jsonSecurityHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders({ "Cache-Control": "no-store" }) });
}

/**
 * GET /api/features → { features: { ai_api, plan_badge, ai_voice }, rollout }:
 * `features` is true when open to the caller (the team's audiences: off,
 * staff, early access for Pro and staff, everyone, applied to the signed-in
 * person's role and plan); `rollout` lists the features still opened step by
 * step (staff or early access), for the early access list. The routes behind
 * a feature check it again themselves.
 */
export async function GET() {
    const active = await getActiveSession();
    if (active && !memoryRateLimit(`features:${active.email}`, 60, 60_000).allowed) return json({ error: "rate_limited" }, 429);
    const [flags, staff, subscription] = await Promise.all([
        getFeatureFlags(),
        active ? getStaffSession().then(Boolean, () => false) : Promise.resolve(false),
        active ? getSubscription(active.email).catch(() => FREE_SUBSCRIPTION) : Promise.resolve(null),
    ]);
    const viewer = active && subscription ? { staff, plan: effectivePlan(subscription) } : null;
    return json({ features: allowedFeatures(flags, viewer), rollout: rolloutFeatures(flags) } satisfies FeaturesResponse);
}
