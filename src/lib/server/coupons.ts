import "server-only";

import { isPaddleId } from "@/lib/paddle";
import { normalizeCouponCode, normalizeCouponRecur, type CouponView, type PaidPlanId } from "@/lib/plans";
import { commitServerMutations, getServerDocument, isWriteConflict } from "./firebase-rest";
import { getPaddleConfig, getPaddleSettings } from "./paddle";
import {
    couponDiscountId,
    createPaddleDiscount,
    discountRestriction,
    getPaddleDiscount,
    isPaddleDiscountCode,
    setPaddleDiscountActive,
    setPaddleDiscountPrices,
} from "./paddle-admin";

/*
 * Coupons on the Plans page. The team creates them under Admin ›
 * Subscriptions (plan_coupons/{CODE}); each one is mirrored as a Paddle
 * discount with the same code. The Plans page checks a code here and the
 * checkout puts the discount on the transaction (discount_id), so it applies
 * without typing the code again in Paddle's checkout (which still works too).
 */

export type CouponErrorCode = "coupon_invalid" | "coupon_expired" | "coupon_used_up" | "coupon_plan";

export class CouponError extends Error {
    readonly code: CouponErrorCode;
    // No parameter properties: the plain-Node tests strip types and can't run them.
    constructor(code: CouponErrorCode) {
        super(code);
        this.name = "CouponError";
        this.code = code;
    }
}

export const couponPath = (code: string) => `plan_coupons/${code}`;

type CouponRecord = Record<string, unknown> & { _updateTime?: string };

function iso(value: unknown) {
    const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/**
 * The coupon behind a code, if the Plans page may use it now (for `plan`, when
 * given). Throws CouponError: coupon_invalid (unknown, switched off or
 * malformed), coupon_expired, coupon_used_up or coupon_plan.
 */
export async function findCoupon(input: unknown, plan: PaidPlanId | null, now = new Date()): Promise<{ view: CouponView; record: CouponRecord }> {
    const code = normalizeCouponCode(input);
    if (!code) throw new CouponError("coupon_invalid");
    const record = await getServerDocument<Record<string, unknown>>(couponPath(code));
    if (!record || record.active !== true) throw new CouponError("coupon_invalid");
    const percentOff = typeof record.percentOff === "number" && Number.isInteger(record.percentOff) && record.percentOff >= 1 && record.percentOff <= 100 ? record.percentOff : null;
    if (percentOff === null) throw new CouponError("coupon_invalid");
    const expiresAt = iso(record.expiresAt);
    if (expiresAt && Date.parse(expiresAt) <= now.getTime()) throw new CouponError("coupon_expired");
    const maxUses = typeof record.maxUses === "number" && Number.isInteger(record.maxUses) && record.maxUses > 0 ? record.maxUses : null;
    const used = typeof record.used === "number" && Number.isFinite(record.used) ? record.used : 0;
    if (maxUses !== null && used >= maxUses) throw new CouponError("coupon_used_up");
    const couponPlan = record.plan === "plus" || record.plan === "pro" ? record.plan : "any";
    if (plan && couponPlan !== "any" && couponPlan !== plan) throw new CouponError("coupon_plan");
    return {
        view: { code, percentOff, plan: couponPlan, recur: normalizeCouponRecur(record.recur), expiresAt },
        record,
    };
}

/**
 * The Paddle discount (dsc_…) to put on a checkout for `priceId`, in the
 * environment the keys belong to. A coupon without one there (made before
 * Paddle was connected, or for the other environment) gets it now; an
 * archived one is switched back on (the coupon itself is active), and one that
 * doesn't cover the price yet (the mapping changed since) is extended to the
 * prices now mapped for the coupon's plan. Paddle's own count decides whether
 * uses are left.
 */
export async function couponDiscount(view: CouponView, record: CouponRecord, priceId: string): Promise<string> {
    const environment = getPaddleConfig().environment;
    const known = couponDiscountId(record, environment);
    if (!known) {
        if (!isPaddleDiscountCode(view.code)) throw new CouponError("coupon_invalid");
        const created = await createPaddleDiscount({
            code: view.code,
            percentOff: view.percentOff,
            plan: view.plan,
            maxUses: typeof record.maxUses === "number" && Number.isInteger(record.maxUses) && record.maxUses > 0 ? record.maxUses : null,
            expiresAt: view.expiresAt,
            recur: view.recur,
        });
        try {
            await commitServerMutations([{
                type: "update",
                path: couponPath(view.code),
                data: { paddleDiscountId: created, paddleEnvironment: environment, updatedAt: new Date() },
                updateFields: ["paddleDiscountId", "paddleEnvironment", "updatedAt"],
                ...(record._updateTime ? { updateTime: record._updateTime } : {}),
            }]);
        } catch (error) {
            // Someone else gave it one meanwhile (or the write failed): ours goes, theirs stays.
            await setPaddleDiscountActive(created, false).catch(() => undefined);
            if (!isWriteConflict(error)) throw error;
            const fresh = await getServerDocument<Record<string, unknown>>(couponPath(view.code));
            const theirs = couponDiscountId(fresh, environment);
            if (!theirs) throw error;
            return couponDiscount(view, fresh ?? record, priceId);
        }
        return created;
    }
    const discount = await getPaddleDiscount(known);
    if (typeof discount.usage_limit === "number" && typeof discount.times_used === "number" && discount.times_used >= discount.usage_limit) {
        throw new CouponError("coupon_used_up");
    }
    if (discount.expires_at && Date.parse(discount.expires_at) <= Date.now()) throw new CouponError("coupon_expired");
    if (discount.status && discount.status !== "active") {
        if (discount.status === "expired") throw new CouponError("coupon_expired");
        await setPaddleDiscountActive(known, true);
    }
    if (Array.isArray(discount.restrict_to) && !discount.restrict_to.includes(priceId)) {
        const settings = await getPaddleSettings();
        const prices = new Set([...(discountRestriction(view.plan, settings.prices) ?? []), priceId].filter((id) => isPaddleId("price", id)));
        await setPaddleDiscountPrices(known, [...prices]);
    }
    return known;
}
