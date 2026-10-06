import { NextResponse } from "next/server";
import { effectivePlan, type PlanId } from "@/lib/plans";
import { getSignedInSession } from "@/lib/server/active-session";
import { isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { getSubscription } from "@/lib/server/plans";
import { jsonSecurityHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/plans/me: the plan whose benefits apply to the signed-in person now (the editor's run limit). */
export type MyPlanResponse = { signedIn: boolean; plan: PlanId };

function json(payload: MyPlanResponse) {
    return NextResponse.json(payload, { headers: jsonSecurityHeaders({ "Cache-Control": "no-store" }) });
}

export async function GET() {
    const session = await getSignedInSession();
    const email = session?.user?.email?.toLowerCase();
    if (!email) return json({ signedIn: false, plan: "free" });
    // Without the database (local development) and when the plan can't be read, Free's limits apply.
    if (!isFirebaseServerConfigured()) return json({ signedIn: true, plan: "free" });
    const subscription = await getSubscription(email).catch(() => null);
    return json({ signedIn: true, plan: subscription ? effectivePlan(subscription) : "free" });
}
