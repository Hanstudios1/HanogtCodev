import type { NextRequest } from "next/server";
import type { AdminCoupon, AdminPlansResponse, AdminPriceChange } from "@/components/Admin/types";
import type { PaddleEnvironment } from "@/lib/paddle";
import {
    AI_BONUS_MAX,
    DEFAULT_PLAN_CATALOG,
    GRANT_DAYS_MAX,
    PAID_PLAN_IDS,
    PLAN_IDS,
    PRICE_MAX,
    normalizeCouponCode,
    normalizeCouponRecur,
    type PaidPlanId,
    type PlanPrice,
} from "@/lib/plans";
import {
    AdminHttpError,
    adminError,
    adminFailure,
    adminJson,
    auditLogMutation,
    authorizeAdminRequest,
    isFirestoreConflict,
    readAdminBody,
    readText,
    requireBoolean,
    requireEmail,
    requireEnum,
    toIso,
    writeAuditLog,
} from "@/lib/server/admin";
import { commitServerMutations, countServerQuery, getServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import { PaddleApiError, getPaddleConfig, isPaddleConfigured } from "@/lib/server/paddle";
import {
    adminPersonPlan,
    couponDiscountId,
    createPaddleDiscount,
    isPaddleDiscountCode,
    paddleAdminFailure,
    paddleDiscountUsage,
    setPaddleDiscountActive,
} from "@/lib/server/paddle-admin";
import {
    CATALOG_PATH,
    forgetCatalogCache,
    normalizeCatalog,
    normalizePlanPrice,
    normalizeSubscription,
    resetAiLimits,
    subscriptionPath,
} from "@/lib/server/plans";

export const runtime = "nodejs";

const ACTIONS = ["setPrice", "createCoupon", "setCouponActive", "deleteCoupon", "setPlan", "setBlocked", "removePlan", "resetAi", "grantAi"] as const;
const BODY_KEYS = ["action", "plan", "monthly", "yearly", "discountPercent", "visible", "code", "percentOff", "maxUses", "expiresAt", "recur", "note", "active", "email", "days", "blocked", "extraDaily"];
const HISTORY_MAX = 30;
const COUPONS_MAX = 200;
const DAY_MS = 24 * 60 * 60_000;

function readPrice(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > PRICE_MAX) throw new AdminHttpError(400, "invalid_price");
    return Math.round(value * 100) / 100;
}

function readInteger(value: unknown, min: number, max: number, optional = false): number | null {
    if (optional && (value === null || value === undefined || value === "")) return null;
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new AdminHttpError(400, "invalid_number");
    return value;
}

function readFutureDate(value: unknown): Date | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" || value.length > 40) throw new AdminHttpError(400, "invalid_dates");
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time <= Date.now() || time > Date.now() + 5 * 365 * DAY_MS) throw new AdminHttpError(400, "invalid_dates");
    return new Date(time);
}

function couponOf(record: Record<string, unknown> & { _id: string }, environment: PaddleEnvironment): AdminCoupon {
    const plan = record.plan === "plus" || record.plan === "pro" ? record.plan : "any";
    return {
        code: record._id,
        percentOff: typeof record.percentOff === "number" ? record.percentOff : 0,
        plan,
        maxUses: typeof record.maxUses === "number" ? record.maxUses : null,
        used: typeof record.used === "number" ? record.used : 0,
        expiresAt: toIso(record.expiresAt),
        active: record.active === true,
        note: typeof record.note === "string" ? record.note.slice(0, 300) : "",
        createdBy: typeof record.createdBy === "string" ? record.createdBy : "",
        createdAt: toIso(record.createdAt),
        paddleDiscountId: couponDiscountId(record, environment),
        paddleTimesUsed: null,
        recur: normalizeCouponRecur(record.recur),
    };
}

function historyOf(value: unknown): AdminPriceChange[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): AdminPriceChange[] => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        if (record.plan !== "plus" && record.plan !== "pro") return [];
        // Entries from before prices moved to US dollars carry no currency: they were Turkish lira.
        const currency = typeof record.currency === "string" && /^[A-Z]{3}$/.test(record.currency) ? record.currency : "TRY";
        return [{ plan: record.plan, currency, by: typeof record.by === "string" ? record.by : "", at: toIso(record.at), from: normalizePlanPrice(record.from), to: normalizePlanPrice(record.to) }];
    });
}

async function overview(): Promise<AdminPlansResponse> {
    const [catalogRecord, coupons, plus, pro] = await Promise.all([
        getServerDocument<Record<string, unknown>>(CATALOG_PATH),
        runServerQuery<Record<string, unknown>>({ collectionId: "plan_coupons", orderBy: [{ field: "createdAt", direction: "DESCENDING" }], limit: COUPONS_MAX }).catch(() => []),
        countServerQuery({ collectionId: "plan_waitlist", where: [{ field: "plans", op: "ARRAY_CONTAINS", value: "plus" }], upTo: 100_000 }).catch(() => null),
        countServerQuery({ collectionId: "plan_waitlist", where: [{ field: "plans", op: "ARRAY_CONTAINS", value: "pro" }], upTo: 100_000 }).catch(() => null),
    ]);
    const config = getPaddleConfig();
    const list = coupons.map((record) => couponOf(record as Record<string, unknown> & { _id: string }, config.environment));
    const discounts = list.flatMap((coupon) => (coupon.paddleDiscountId ? [coupon.paddleDiscountId] : []));
    if (discounts.length && config.apiKey) {
        // Redemptions happen at Paddle's checkout; the panel shows Paddle's count when it can get it.
        const usage = await paddleDiscountUsage(discounts).catch(() => null);
        for (const coupon of list) coupon.paddleTimesUsed = coupon.paddleDiscountId ? usage?.get(coupon.paddleDiscountId) ?? null : null;
    }
    return {
        catalog: normalizeCatalog(catalogRecord),
        history: historyOf(catalogRecord?.history).slice(0, HISTORY_MAX),
        coupons: list,
        waitlist: { plus, pro },
    };
}

/** Paddle refused or couldn't be reached: the action fails as a whole (its own `status` isn't a Firestore one). */
function paddleFailure(error: unknown) {
    const paddle = paddleAdminFailure(error);
    if (!paddle) return null;
    if (error instanceof PaddleApiError) console.error("[admin:plans:paddle]", error.status || "network", error.code);
    return adminError(paddle.status, paddle.code);
}

/**
 * GET /api/admin/plans            prices, price history, coupons and waitlist counts
 * GET /api/admin/plans?email=x    one person's plan, Hanogt AI limits and usage
 */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin" });
    if (!guard.ok) return guard.response;
    try {
        const emailParam = request.nextUrl.searchParams.get("email");
        if (emailParam !== null) return adminJson(await adminPersonPlan(requireEmail(emailParam)));
        return adminJson(await overview());
    } catch (error) {
        return adminFailure(error, "plans:get");
    }
}

export async function POST(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin", mutation: true });
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    try {
        const body = await readAdminBody(request, BODY_KEYS, 4_096);
        const action = requireEnum(body.action, ACTIONS, "invalid_action");
        const now = new Date();

        if (action === "setPrice") {
            const plan = requireEnum(body.plan, PAID_PLAN_IDS, "invalid_plan");
            const next: PlanPrice = {
                monthly: readPrice(body.monthly),
                yearly: readPrice(body.yearly),
                discountPercent: readInteger(body.discountPercent, 0, 90) ?? 0,
                visible: requireBoolean(body.visible),
            };
            const record = await getServerDocument<Record<string, unknown>>(CATALOG_PATH);
            const catalog = normalizeCatalog(record);
            const previous = catalog.plans[plan];
            if (JSON.stringify(previous) === JSON.stringify(next)) throw new AdminHttpError(409, "no_change");
            const plans = { ...catalog.plans, [plan]: next } as Record<PaidPlanId, PlanPrice>;
            // The catalog only counts prices stored with the current currency, so it is written with them.
            const currency = DEFAULT_PLAN_CATALOG.currency;
            const history = [{ plan, currency, by: actor, at: now, from: previous, to: next }, ...(Array.isArray(record?.history) ? record.history : [])].slice(0, HISTORY_MAX);
            await commitServerMutations([
                { type: "update", path: CATALOG_PATH, data: { currency, plans, history, updatedAt: now, updatedBy: actor }, updateFields: ["currency", "plans", "history", "updatedAt", "updatedBy"], ...(record?._updateTime ? { updateTime: record._updateTime } : {}) },
                auditLogMutation(actor, "plan.set_price", CATALOG_PATH, { plan, currency, monthly: next.monthly, yearly: next.yearly, discountPercent: next.discountPercent, visible: next.visible }),
            ]);
            forgetCatalogCache();
            return adminJson(await overview());
        }

        if (action === "createCoupon" || action === "setCouponActive" || action === "deleteCoupon") {
            const code = normalizeCouponCode(body.code);
            if (!code) throw new AdminHttpError(400, "invalid_coupon");
            const path = `plan_coupons/${code}`;
            const config = getPaddleConfig();
            if (action === "createCoupon") {
                const data = {
                    code,
                    percentOff: readInteger(body.percentOff, 1, 100)!,
                    plan: requireEnum(body.plan ?? "any", ["plus", "pro", "any"] as const, "invalid_plan"),
                    maxUses: readInteger(body.maxUses, 1, 100_000, true),
                    used: 0,
                    expiresAt: readFutureDate(body.expiresAt),
                    // How many payments it discounts: the first, every one, or the first 2–24.
                    recur: normalizeCouponRecur(body.recur),
                    active: true,
                    note: readText(body.note, { max: 300 }),
                    createdBy: actor,
                    createdAt: now,
                };
                if (await getServerDocument(path)) throw new AdminHttpError(409, "coupon_exists");
                // With Paddle connected the code must work at checkout: no Paddle discount, no coupon.
                let paddle: { paddleDiscountId: string; paddleEnvironment: PaddleEnvironment } | null = null;
                if (isPaddleConfigured(config)) {
                    if (!isPaddleDiscountCode(code)) throw new AdminHttpError(400, "paddle_coupon_code");
                    paddle = { paddleDiscountId: await createPaddleDiscount(data), paddleEnvironment: config.environment };
                }
                try {
                    await commitServerMutations([
                        { type: "create", path, data: { ...data, paddleDiscountId: null, ...paddle } },
                        auditLogMutation(actor, "coupon.create", path, {
                            code,
                            percentOff: data.percentOff,
                            plan: data.plan,
                            maxUses: data.maxUses,
                            expiresAt: data.expiresAt?.toISOString() ?? null,
                            recur: String(data.recur),
                            paddleDiscountId: paddle?.paddleDiscountId ?? null,
                        }),
                    ]);
                } catch (error) {
                    // No live discount the panel doesn't know about.
                    if (paddle) await setPaddleDiscountActive(paddle.paddleDiscountId, false).catch(() => undefined);
                    throw error;
                }
                return adminJson(await overview(), 201);
            }
            const record = await getServerDocument<Record<string, unknown>>(path);
            if (!record) throw new AdminHttpError(404, "not_found");
            // Mirrored to Paddle first: if Paddle refuses, nothing changes here either.
            const discount = couponDiscountId(record, config.environment);
            if (action === "setCouponActive") {
                const active = requireBoolean(body.active);
                if ((record.active === true) === active) throw new AdminHttpError(409, "no_change");
                if (discount) await setPaddleDiscountActive(discount, active);
                try {
                    await commitServerMutations([
                        { type: "update", path, data: { active, updatedAt: now, updatedBy: actor }, updateFields: ["active", "updatedAt", "updatedBy"], ...(record._updateTime ? { updateTime: record._updateTime } : {}) },
                        auditLogMutation(actor, "coupon.set_active", path, { code, active, paddleDiscountId: discount }),
                    ]);
                } catch (error) {
                    if (discount) await setPaddleDiscountActive(discount, !active).catch(() => undefined);
                    throw error;
                }
            } else {
                if (discount) {
                    try {
                        await setPaddleDiscountActive(discount, false);
                    } catch (error) {
                        // Gone at Paddle, or already off there: nothing left to archive.
                        const gone = error instanceof PaddleApiError && error.status === 404;
                        if (!gone && record.active === true) throw error;
                    }
                }
                try {
                    await commitServerMutations([
                        { type: "delete", path, ...(record._updateTime ? { updateTime: record._updateTime } : {}) },
                        auditLogMutation(actor, "coupon.delete", path, { code, paddleDiscountId: discount }),
                    ]);
                } catch (error) {
                    if (discount && record.active === true) await setPaddleDiscountActive(discount, true).catch(() => undefined);
                    throw error;
                }
            }
            return adminJson(await overview());
        }

        // Per-person actions.
        const email = requireEmail(body.email);
        if (!(await getServerDocument(`users/${email}`))) throw new AdminHttpError(404, "user_not_found");
        const path = subscriptionPath(email);
        const record = await getServerDocument<Record<string, unknown>>(path);
        const current = normalizeSubscription(record);
        const precondition = record?._updateTime ? { updateTime: record._updateTime } : {};

        if (action === "resetAi") {
            await resetAiLimits(email);
            await writeAuditLog(actor, "subscription.reset_ai", `users/${email}`, { email });
            return adminJson(await adminPersonPlan(email));
        }

        if (action === "removePlan") {
            if (!record) throw new AdminHttpError(409, "no_change");
            // The record also links the Paddle customer and subscription (of either environment): keep those.
            const keptBilling = (record.paddle !== undefined && record.paddle !== null) || (record.paddleCustomerId !== undefined && record.paddleCustomerId !== null);
            if (keptBilling) {
                const staffDefaults = current.plan === "free" && !current.expiresAt && !current.note && !current.grantedBy && !current.grantedAt && current.aiBonusDaily === 0 && !current.aiBonusUntil;
                if (staffDefaults) throw new AdminHttpError(409, "no_change");
                const staff = { plan: "free", expiresAt: null, note: "", grantedBy: null, grantedAt: null, aiBonusDaily: 0, aiBonusUntil: null, updatedAt: now };
                await commitServerMutations([
                    { type: "update", path, data: staff, updateFields: Object.keys(staff), ...precondition },
                    auditLogMutation(actor, "subscription.remove", path, { email, plan: current.plan, keptBilling }),
                ]);
            } else {
                await commitServerMutations([
                    { type: "delete", path, ...precondition },
                    auditLogMutation(actor, "subscription.remove", path, { email, plan: current.plan }),
                ]);
            }
            return adminJson(await adminPersonPlan(email));
        }

        let data: Record<string, unknown>;
        let audit: Parameters<typeof auditLogMutation>[1];
        let details: Record<string, string | number | boolean | null>;
        if (action === "setPlan") {
            const plan = requireEnum(body.plan, PLAN_IDS, "invalid_plan");
            const days = readInteger(body.days, 0, GRANT_DAYS_MAX) ?? 0;
            const expiresAt = days > 0 ? new Date(now.getTime() + days * DAY_MS) : null;
            const note = readText(body.note, { max: 300 });
            data = { plan, status: current.status, expiresAt, note, grantedBy: actor, grantedAt: now, updatedAt: now };
            audit = "subscription.set_plan";
            details = { email, from: current.plan, to: plan, days, note: note.slice(0, 120) };
        } else if (action === "setBlocked") {
            const blocked = requireBoolean(body.blocked);
            if ((current.status === "blocked") === blocked) throw new AdminHttpError(409, "no_change");
            const note = readText(body.note, { max: 300 });
            data = { status: blocked ? "blocked" : "active", note: note || current.note, updatedAt: now, blockedBy: blocked ? actor : null };
            audit = blocked ? "subscription.block" : "subscription.unblock";
            details = { email, plan: current.plan, note: note.slice(0, 120) };
        } else {
            const extraDaily = readInteger(body.extraDaily, 0, AI_BONUS_MAX)!;
            const days = readInteger(body.days, 1, GRANT_DAYS_MAX)!;
            data = { aiBonusDaily: extraDaily, aiBonusUntil: extraDaily > 0 ? new Date(now.getTime() + days * DAY_MS) : null, updatedAt: now };
            audit = "subscription.grant_ai";
            details = { email, extraDaily, days };
        }
        await commitServerMutations([
            record
                ? { type: "update", path, data, updateFields: Object.keys(data), ...precondition }
                : { type: "create", path, data: { plan: "free", status: "active", aiBonusDaily: 0, aiBonusUntil: null, ...data, email, createdAt: now } },
            auditLogMutation(actor, audit, path, details),
        ]);
        return adminJson(await adminPersonPlan(email));
    } catch (error) {
        const paddle = paddleFailure(error);
        if (paddle) return paddle;
        if (isFirestoreConflict(error)) return adminFailure(new AdminHttpError(409, "conflict"), "plans:post");
        return adminFailure(error, "plans:post");
    }
}
