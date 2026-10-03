import type { NextRequest } from "next/server";
import { isPaidPlanId } from "@/lib/plans";
import { CouponError, findCoupon } from "@/lib/server/coupons";
import { readJsonBody } from "@/lib/server/validate";
import { billingError, billingFailure, billingGuard, billingJson } from "../_shared";

export const runtime = "nodejs";

/**
 * POST /api/paddle/coupon { code, plan? } → { coupon } when the code can be
 * used now (for that plan, when given): what the Plans page shows before the
 * checkout puts it on the transaction. Ten checks a minute per account, so
 * codes can't be guessed by trying.
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const guard = await billingGuard(request, "coupon", 10);
    if (!guard.ok) return guard.response;
    const body = await readJsonBody<{ code?: unknown; plan?: unknown }>(request, 500);
    if (!body || typeof body.code !== "string") return billingError(400, "invalid_request");
    try {
        const { view } = await findCoupon(body.code, isPaidPlanId(body.plan) ? body.plan : null);
        return billingJson({ coupon: view });
    } catch (error) {
        if (error instanceof CouponError) return billingError(409, error.code);
        return billingFailure(error, { route: "coupon", email: guard.email, startedAt });
    }
}
