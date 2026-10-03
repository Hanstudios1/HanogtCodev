import "server-only";

import {
    AI_BONUS_MAX,
    DEFAULT_PLAN_CATALOG,
    DEFAULT_PLAN_PRICE,
    FREE_SUBSCRIPTION,
    PAID_PLAN_IDS,
    PLAN_COLLAB_LIMITS,
    PLAN_GROUP_LIMITS,
    PLAN_PROJECT_LIMITS,
    PRICE_MAX,
    effectivePlan,
    isPlanId,
    type PaidPlanId,
    type PlanCatalog,
    type PlanId,
    type PlanPrice,
    type UserSubscription,
} from "@/lib/plans";
import { isPaddleId, normalizePaddleState } from "@/lib/paddle";
import { getServerDocument } from "./firebase-rest";
import { currentPaddleEnvironment } from "./paddle-config";
import { readRateLimit, resetRateLimit } from "./rate-limit";

export const CATALOG_PATH = "site_config/plans";
export const subscriptionPath = (email: string) => `subscriptions/${email}`;

/** Rate-limit keys of Hanogt AI (src/lib/server/ai-usage.ts, src/app/api/ai/route.ts). */
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
    // Prices saved before the move to US dollars were Turkish lira: only "Visible" carries over.
    const dollars = record.currency === "USD";
    return {
        currency: "USD",
        plans: Object.fromEntries(PAID_PLAN_IDS.map((id) => {
            const stored = normalizePlanPrice(plans[id]);
            return [id, dollars ? stored : { ...DEFAULT_PLAN_CATALOG.plans[id], visible: stored.visible }];
        })) as Record<PaidPlanId, PlanPrice>,
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

/**
 * Paddle data from the other environment is ignored: after moving from the
 * sandbox to live keys, test purchases unlock nothing and live checkouts get
 * a live customer.
 */
export function normalizeSubscription(record: Record<string, unknown> | null, environment = currentPaddleEnvironment()): UserSubscription {
    if (!record) return FREE_SUBSCRIPTION;
    const paddle = normalizePaddleState(record.paddle);
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
        paddle: paddle?.environment === environment ? paddle : null,
        paddleCustomerId: isPaddleId("customer", record.paddleCustomerId) && record.paddleEnvironment === environment ? record.paddleCustomerId : null,
        paddleCheckout: checkoutOf(record.paddleCheckout, environment),
    };
}

/** subscriptions/{email}.paddleCheckout of this environment ({ transactionId, environment, at }). */
function checkoutOf(value: unknown, environment: string): UserSubscription["paddleCheckout"] {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const at = isoOf(record.at);
    return isPaddleId("transaction", record.transactionId) && record.environment === environment && at ? { transactionId: record.transactionId, at } : null;
}

export async function getSubscription(email: string): Promise<UserSubscription> {
    return normalizeSubscription(await getServerDocument<Record<string, unknown>>(subscriptionPath(email)));
}

/** Messages used in the current minute and day windows (for staff). */
export async function aiUsage(email: string) {
    const keys = AI_LIMIT_KEYS(email);
    const [minute, day] = await Promise.all([readRateLimit(keys.minute, 60_000).catch(() => null), readRateLimit(keys.day, AI_DAY_MS).catch(() => null)]);
    return { minute, day };
}

/** Rate-limit keys of messages sent through the person's own AI connections (src/app/api/ai/route.ts). */
export const OWN_KEY_LIMIT_KEYS = (email: string) => ({ minute: `ai-own:${email}`, day: `ai-own-day:${email}` });

/** Staff "reset Hanogt AI limit": Hanogt AI's counters and the own-key ones. */
export async function resetAiLimits(email: string) {
    const keys = AI_LIMIT_KEYS(email);
    const own = OWN_KEY_LIMIT_KEYS(email);
    await Promise.all([resetRateLimit(keys.minute), resetRateLimit(keys.day), resetRateLimit(own.minute), resetRateLimit(own.day)]);
}

/**
 * How many code ("code") or game ("game") projects the account may own;
 * null is unlimited. Free limits when the plan can't be read.
 */
export async function projectLimitFor(email: string, kind: "code" | "game"): Promise<{ plan: PlanId; limit: number | null }> {
    const subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    const plan = effectivePlan(subscription);
    return { plan, limit: PLAN_PROJECT_LIMITS[plan][kind] };
}

/** How many Hanogt Social groups the account may own (create); null is unlimited. */
export async function groupLimitFor(email: string): Promise<{ plan: PlanId; limit: number | null }> {
    const subscription = await getSubscription(email).catch(() => FREE_SUBSCRIPTION);
    const plan = effectivePlan(subscription);
    return { plan, limit: PLAN_GROUP_LIMITS[plan] };
}

/**
 * Team editing for sessions the account starts: people (owner included) and
 * invitations (src/lib/plans.ts PLAN_COLLAB_LIMITS). Throws when the plan
 * can't be read, so a running session keeps the limits it has instead of
 * dropping to Free over a database hiccup.
 */
export async function collabLimitsFor(email: string): Promise<{ plan: PlanId; people: number; invites: number }> {
    const plan = effectivePlan(await getSubscription(email));
    return { plan, ...PLAN_COLLAB_LIMITS[plan] };
}

/** Free's team-editing limits: what a new session gets when the plan can't be read. */
export function freeCollabLimits(): { plan: PlanId; people: number; invites: number } {
    return { plan: "free", ...PLAN_COLLAB_LIMITS.free };
}
