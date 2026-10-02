import "server-only";

import {
    AI_BONUS_MAX,
    DEFAULT_PLAN_CATALOG,
    DEFAULT_PLAN_PRICE,
    FREE_SUBSCRIPTION,
    PAID_PLAN_IDS,
    PRICE_MAX,
    aiLimitsFor,
    effectivePlan,
    isPlanId,
    type PaidPlanId,
    type PlanCatalog,
    type PlanPrice,
    type UserSubscription,
} from "@/lib/plans";
import { isPaddleId, normalizePaddleState } from "@/lib/paddle";
import { getServerDocument } from "./firebase-rest";
import { readRateLimit, resetRateLimit } from "./rate-limit";

export const CATALOG_PATH = "site_config/plans";
export const subscriptionPath = (email: string) => `subscriptions/${email}`;

/** Rate-limit keys of Hanogt AI (src/app/api/ai/route.ts). */
export const AI_LIMIT_KEYS = (email: string) => ({ minute: `ai:${email}`, day: `ai-day:${email}` });
export const AI_DAY_MS = 24 * 60 * 60_000;

function isoOf(value: unknown): string | null {
    if (typeof value === "string") return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === "object" && "seconds" in value && typeof (value as { seconds: unknown }).seconds === "number") {
        return new Date((value as { seconds: number }).seconds * 1000).toISOString();
    }
    return null;
}

function priceOf(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= PRICE_MAX ? Math.round(value * 100) / 100 : null;
}

export function normalizePlanPrice(value: unknown): PlanPrice {
    if (!value || typeof value !== "object") return DEFAULT_PLAN_PRICE;
    const record = value as Record<string, unknown>;
    const discount = typeof record.discountPercent === "number" && Number.isFinite(record.discountPercent) ? Math.min(90, Math.max(0, Math.round(record.discountPercent))) : 0;
    return { monthly: priceOf(record.monthly), yearly: priceOf(record.yearly), discountPercent: discount, visible: record.visible === true };
}

export function normalizeCatalog(record: Record<string, unknown> | null): PlanCatalog {
    if (!record) return DEFAULT_PLAN_CATALOG;
    const plans = record.plans && typeof record.plans === "object" ? record.plans as Record<string, unknown> : {};
    return {
        currency: "TRY",
        plans: Object.fromEntries(PAID_PLAN_IDS.map((id) => [id, normalizePlanPrice(plans[id])])) as Record<PaidPlanId, PlanPrice>,
        updatedAt: isoOf(record.updatedAt),
    };
}

let catalogCache: { at: number; catalog: PlanCatalog } | null = null;

/** The plan catalog (prices, discounts); cached for a minute per instance. */
export async function getPlanCatalog(fresh = false): Promise<PlanCatalog> {
    if (!fresh && catalogCache && Date.now() - catalogCache.at < 60_000) return catalogCache.catalog;
    const catalog = normalizeCatalog(await getServerDocument<Record<string, unknown>>(CATALOG_PATH));
    catalogCache = { at: Date.now(), catalog };
    return catalog;
}

export function forgetCatalogCache() {
    catalogCache = null;
}

export function normalizeSubscription(record: Record<string, unknown> | null): UserSubscription {
    if (!record) return FREE_SUBSCRIPTION;
    const bonus = typeof record.aiBonusDaily === "number" && Number.isFinite(record.aiBonusDaily) ? Math.min(AI_BONUS_MAX, Math.max(0, Math.round(record.aiBonusDaily))) : 0;
    return {
        plan: isPlanId(record.plan) ? record.plan : "free",
        status: record.status === "blocked" ? "blocked" : "active",
        expiresAt: isoOf(record.expiresAt),
        note: typeof record.note === "string" ? record.note.slice(0, 300) : "",
        grantedBy: typeof record.grantedBy === "string" ? record.grantedBy.slice(0, 254) : null,
        grantedAt: isoOf(record.grantedAt),
        aiBonusDaily: bonus,
        aiBonusUntil: isoOf(record.aiBonusUntil),
        paddle: normalizePaddleState(record.paddle),
        paddleCustomerId: isPaddleId("customer", record.paddleCustomerId) ? record.paddleCustomerId : null,
    };
}

export async function getSubscription(email: string): Promise<UserSubscription> {
    return normalizeSubscription(await getServerDocument<Record<string, unknown>>(subscriptionPath(email)));
}

/** Hanogt AI limits for an account; Free limits when the record can't be read. */
export async function aiLimitsForEmail(email: string) {
    const subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    return { ...aiLimitsFor(subscription), plan: effectivePlan(subscription) };
}

/** Messages used in the current minute and day windows (for staff). */
export async function aiUsage(email: string) {
    const keys = AI_LIMIT_KEYS(email);
    const [minute, day] = await Promise.all([readRateLimit(keys.minute, 60_000).catch(() => null), readRateLimit(keys.day, AI_DAY_MS).catch(() => null)]);
    return { minute, day };
}

export async function resetAiLimits(email: string) {
    const keys = AI_LIMIT_KEYS(email);
    await Promise.all([resetRateLimit(keys.minute), resetRateLimit(keys.day)]);
}
