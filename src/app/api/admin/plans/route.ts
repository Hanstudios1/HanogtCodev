import type { NextRequest } from "next/server";
import type { AdminCoupon, AdminPlansResponse, AdminPriceChange, AdminUserPlanResponse } from "@/components/Admin/types";
import {
    AI_BONUS_MAX,
    GRANT_DAYS_MAX,
    PAID_PLAN_IDS,
    PLAN_IDS,
    PRICE_MAX,
    aiLimitsFor,
    effectivePlan,
    normalizeCouponCode,
    type PaidPlanId,
    type PlanPrice,
} from "@/lib/plans";
import {
    AdminHttpError,
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
import {
    CATALOG_PATH,
    aiUsage,
    forgetCatalogCache,
    normalizeCatalog,
    normalizePlanPrice,
    normalizeSubscription,
    resetAiLimits,
    subscriptionPath,
} from "@/lib/server/plans";

export const runtime = "nodejs";

const ACTIONS = ["setPrice", "createCoupon", "setCouponActive", "deleteCoupon", "setPlan", "setBlocked", "removePlan", "resetAi", "grantAi"] as const;
const BODY_KEYS = ["action", "plan", "monthly", "yearly", "discountPercent", "visible", "code", "percentOff", "maxUses", "expiresAt", "note", "active", "email", "days", "blocked", "extraDaily"];
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

function couponOf(record: Record<string, unknown> & { _id: string }): AdminCoupon {
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
    };
}

function historyOf(value: unknown): AdminPriceChange[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): AdminPriceChange[] => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        if (record.plan !== "plus" && record.plan !== "pro") return [];
        return [{ plan: record.plan, by: typeof record.by === "string" ? record.by : "", at: toIso(record.at), from: normalizePlanPrice(record.from), to: normalizePlanPrice(record.to) }];
    });
}

async function overview(): Promise<AdminPlansResponse> {
    const [catalogRecord, coupons, plus, pro] = await Promise.all([
        getServerDocument<Record<string, unknown>>(CATALOG_PATH),
        runServerQuery<Record<string, unknown>>({ collectionId: "plan_coupons", orderBy: [{ field: "createdAt", direction: "DESCENDING" }], limit: COUPONS_MAX }).catch(() => []),
        countServerQuery({ collectionId: "plan_waitlist", where: [{ field: "plans", op: "ARRAY_CONTAINS", value: "plus" }], upTo: 100_000 }).catch(() => null),
        countServerQuery({ collectionId: "plan_waitlist", where: [{ field: "plans", op: "ARRAY_CONTAINS", value: "pro" }], upTo: 100_000 }).catch(() => null),
    ]);
    return {
        catalog: normalizeCatalog(catalogRecord),
        history: historyOf(catalogRecord?.history).slice(0, HISTORY_MAX),
        coupons: coupons.map((record) => couponOf(record as Record<string, unknown> & { _id: string })),
        waitlist: { plus, pro },
    };
}

async function userPlan(email: string): Promise<AdminUserPlanResponse> {
    const [user, record, usage] = await Promise.all([
        getServerDocument<Record<string, unknown>>(`users/${email}`),
        getServerDocument<Record<string, unknown>>(subscriptionPath(email)),
        aiUsage(email),
    ]);
    const subscription = normalizeSubscription(record);
    return { email, exists: Boolean(user), subscription, effectivePlan: effectivePlan(subscription), aiLimits: aiLimitsFor(subscription), aiUsage: usage };
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
        if (emailParam !== null) return adminJson(await userPlan(requireEmail(emailParam)));
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
            const history = [{ plan, by: actor, at: now, from: previous, to: next }, ...(Array.isArray(record?.history) ? record.history : [])].slice(0, HISTORY_MAX);
            await commitServerMutations([
                { type: "update", path: CATALOG_PATH, data: { plans, history, updatedAt: now, updatedBy: actor }, updateFields: ["plans", "history", "updatedAt", "updatedBy"], ...(record?._updateTime ? { updateTime: record._updateTime } : {}) },
                auditLogMutation(actor, "plan.set_price", CATALOG_PATH, { plan, monthly: next.monthly, yearly: next.yearly, discountPercent: next.discountPercent, visible: next.visible }),
            ]);
            forgetCatalogCache();
            return adminJson(await overview());
        }

        if (action === "createCoupon" || action === "setCouponActive" || action === "deleteCoupon") {
            const code = normalizeCouponCode(body.code);
            if (!code) throw new AdminHttpError(400, "invalid_coupon");
            const path = `plan_coupons/${code}`;
            if (action === "createCoupon") {
                const data = {
                    code,
                    percentOff: readInteger(body.percentOff, 1, 100)!,
                    plan: requireEnum(body.plan ?? "any", ["plus", "pro", "any"] as const, "invalid_plan"),
                    maxUses: readInteger(body.maxUses, 1, 100_000, true),
                    used: 0,
                    expiresAt: readFutureDate(body.expiresAt),
                    active: true,
                    note: readText(body.note, { max: 300 }),
                    createdBy: actor,
                    createdAt: now,
                };
                if (await getServerDocument(path)) throw new AdminHttpError(409, "coupon_exists");
                await commitServerMutations([
                    { type: "create", path, data },
                    auditLogMutation(actor, "coupon.create", path, { code, percentOff: data.percentOff, plan: data.plan, maxUses: data.maxUses, expiresAt: data.expiresAt?.toISOString() ?? null }),
                ]);
                return adminJson(await overview(), 201);
            }
            const record = await getServerDocument<Record<string, unknown>>(path);
            if (!record) throw new AdminHttpError(404, "not_found");
            if (action === "setCouponActive") {
                const active = requireBoolean(body.active);
                if ((record.active === true) === active) throw new AdminHttpError(409, "no_change");
                await commitServerMutations([
                    { type: "update", path, data: { active, updatedAt: now, updatedBy: actor }, updateFields: ["active", "updatedAt", "updatedBy"], ...(record._updateTime ? { updateTime: record._updateTime } : {}) },
                    auditLogMutation(actor, "coupon.set_active", path, { code, active }),
                ]);
            } else {
                await commitServerMutations([
                    { type: "delete", path },
                    auditLogMutation(actor, "coupon.delete", path, { code }),
                ]);
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
            return adminJson(await userPlan(email));
        }

        if (action === "removePlan") {
            if (!record) throw new AdminHttpError(409, "no_change");
            await commitServerMutations([
                { type: "delete", path, ...precondition },
                auditLogMutation(actor, "subscription.remove", path, { email, plan: current.plan }),
            ]);
            return adminJson(await userPlan(email));
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
        return adminJson(await userPlan(email));
    } catch (error) {
        if (isFirestoreConflict(error)) return adminFailure(new AdminHttpError(409, "conflict"), "plans:post");
        return adminFailure(error, "plans:post");
    }
}
