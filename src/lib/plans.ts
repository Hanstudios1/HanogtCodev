/**
 * Hanogt Codev plans. Plus and Pro are sold through Paddle (src/lib/paddle.ts)
 * once the owner connects it; until then the catalog shows "coming soon".
 * Staff can also assign plans by hand (gifts, testers). A person gets the
 * higher of the two: the staff-assigned plan or the paid one.
 * Client-safe; the server copies live in src/lib/server/plans.ts.
 */
import type { Copy } from "@/lib/i18n";
import { paddleEntitles, type BillingView, type PaddleCheckoutConfig, type PaddleSubscriptionState } from "@/lib/paddle";

export const PLAN_IDS = ["free", "plus", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const PAID_PLAN_IDS = ["plus", "pro"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export function isPlanId(value: unknown): value is PlanId {
    return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function isPaidPlanId(value: unknown): value is PaidPlanId {
    return typeof value === "string" && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

/** Prices are in US dollars; null means "not announced yet". */
export type PlanPrice = { monthly: number | null; yearly: number | null; discountPercent: number; visible: boolean };
export type PlanCatalog = { currency: "USD"; plans: Record<PaidPlanId, PlanPrice>; updatedAt: string | null };

/** The list prices (USD): a year costs ten months. Paddle's catalog must carry the same amounts. */
export const LIST_PRICES: Record<PaidPlanId, { monthly: number; yearly: number }> = {
    plus: { monthly: 20, yearly: 200 },
    pro: { monthly: 100, yearly: 1000 },
};

export const DEFAULT_PLAN_PRICE: PlanPrice = { monthly: null, yearly: null, discountPercent: 0, visible: false };
export const DEFAULT_PLAN_CATALOG: PlanCatalog = {
    currency: "USD",
    plans: { plus: { ...DEFAULT_PLAN_PRICE, ...LIST_PRICES.plus }, pro: { ...DEFAULT_PLAN_PRICE, ...LIST_PRICES.pro } },
    updatedAt: null,
};

export const PRICE_MAX = 100_000;

/** Hanogt AI messages per minute and per day for each plan. */
export const PLAN_AI_LIMITS: Record<PlanId, { perMinute: number; perDay: number }> = {
    free: { perMinute: 12, perDay: 250 },
    plus: { perMinute: 20, perDay: 750 },
    pro: { perMinute: 30, perDay: 2000 },
};

/**
 * Cloud code projects (editor) and game projects (Hanogt Engine) a person
 * can create; null means unlimited. Nothing is deleted when someone is over
 * the limit (e.g. after leaving Pro): they just can't create new ones.
 */
export const PLAN_PROJECT_LIMITS: Record<PlanId, { code: number | null; game: number | null }> = {
    free: { code: 10, game: 10 },
    plus: { code: 40, game: 40 },
    pro: { code: null, game: null },
};

/**
 * How many AI providers a person can connect to Hanogt AI with their own API
 * keys (src/lib/ai/connections.ts). Connections above the limit are kept but
 * switched off, e.g. after moving from Pro to Plus.
 */
export const PLAN_AI_CONNECTIONS: Record<PlanId, number> = { free: 0, plus: 2, pro: 5 };

/** Extra daily Hanogt AI messages staff can grant on top of the plan. */
export const AI_BONUS_MAX = 5000;
export const GRANT_DAYS_MAX = 365;

export type SubscriptionStatus = "active" | "blocked";

/** What the server keeps in subscriptions/{email}. */
export type UserSubscription = {
    /** Staff-assigned plan (gifts, testers); a paid plan lives in `paddle`. */
    plan: PlanId;
    /** "blocked" switches off every plan benefit, paid ones included. */
    status: SubscriptionStatus;
    expiresAt: string | null;
    note: string;
    grantedBy: string | null;
    grantedAt: string | null;
    aiBonusDaily: number;
    aiBonusUntil: string | null;
    /** The person's Paddle subscription, kept in sync by the webhook. */
    paddle: PaddleSubscriptionState | null;
    /** Their Paddle customer (exists from the first checkout on). */
    paddleCustomerId: string | null;
};

export const FREE_SUBSCRIPTION: UserSubscription = {
    plan: "free",
    status: "active",
    expiresAt: null,
    note: "",
    grantedBy: null,
    grantedAt: null,
    aiBonusDaily: 0,
    aiBonusUntil: null,
    paddle: null,
    paddleCustomerId: null,
};

function future(iso: string | null, now: number) {
    if (!iso) return true;
    const time = Date.parse(iso);
    return Number.isFinite(time) && time > now;
}

const PLAN_RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2 };

type PlanSources = Pick<UserSubscription, "plan" | "status" | "expiresAt"> & { paddle?: PaddleSubscriptionState | null };

/** The staff-assigned plan while it hasn't expired. */
export function staffPlan(subscription: Pick<UserSubscription, "plan" | "expiresAt">, now = Date.now()): PlanId {
    if (subscription.plan === "free") return "free";
    return future(subscription.expiresAt, now) ? subscription.plan : "free";
}

/** The plan a Paddle subscription pays for while it is active (or retrying a payment). */
export function paidPlan(subscription: { paddle?: PaddleSubscriptionState | null }, now = Date.now()): PlanId {
    return paddleEntitles(subscription.paddle, now) ? subscription.paddle.plan : "free";
}

/** The plan whose benefits apply now: the higher of the staff and paid plans; Free when blocked. */
export function effectivePlan(subscription: PlanSources, now = Date.now()): PlanId {
    if (subscription.status === "blocked") return "free";
    const staff = staffPlan(subscription, now);
    const paid = paidPlan(subscription, now);
    return PLAN_RANK[paid] > PLAN_RANK[staff] ? paid : staff;
}

/** Where the effective plan comes from (null for Free). */
export function planSource(subscription: PlanSources, now = Date.now()): "paddle" | "staff" | null {
    const plan = effectivePlan(subscription, now);
    if (plan === "free") return null;
    return paidPlan(subscription, now) === plan ? "paddle" : "staff";
}

/** Hanogt AI limits including a staff grant that hasn't run out. */
export function aiLimitsFor(subscription: UserSubscription, now = Date.now()) {
    const base = PLAN_AI_LIMITS[effectivePlan(subscription, now)];
    const bonusActive = subscription.aiBonusDaily > 0 && subscription.status !== "blocked" && Boolean(subscription.aiBonusUntil) && future(subscription.aiBonusUntil, now);
    return { perMinute: base.perMinute, perDay: base.perDay + (bonusActive ? subscription.aiBonusDaily : 0) };
}

/** GET /api/plans. */
export type PlansResponse = {
    catalog: PlanCatalog;
    /** Set when plans can be bought (Paddle connected and prices published). */
    checkout: PaddleCheckoutConfig | null;
    me: {
        /** The plan whose benefits apply now. */
        plan: PlanId;
        /** Where `plan` comes from: a Paddle subscription or the Hanogt team. */
        source: "paddle" | "staff" | null;
        assignedPlan: PlanId;
        blocked: boolean;
        /** End of the staff-assigned plan. */
        expiresAt: string | null;
        /** The Paddle subscription, if there is one (also when it has ended). */
        billing: BillingView | null;
        /** A Paddle customer exists, so the billing portal can be opened. */
        canManageBilling: boolean;
        /** The person's own Paddle customer id (Paddle Retain's pwCustomer), or null. */
        paddleCustomerId: string | null;
        aiLimits: { perMinute: number; perDay: number };
        aiUsedToday: number;
        waitlist: PaidPlanId[];
    } | null;
};

/** Price after the discount, rounded to cents. */
export function discountedPrice(price: number | null, discountPercent: number) {
    if (price === null) return null;
    const percent = Math.min(100, Math.max(0, discountPercent));
    return Math.round(price * (100 - percent)) / 100;
}

/** Coupon codes: 3–24 capital letters, digits, "-" or "_". */
export function normalizeCouponCode(value: unknown) {
    if (typeof value !== "string") return "";
    const code = value.trim().toUpperCase();
    return /^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code) ? code : "";
}

export type PlanFeature = { text: Copy; /** Not live yet; shown as "planned". */ planned?: boolean };
export type PlanCopy = { name: Copy; tagline: Copy; features: PlanFeature[] };

export const PLAN_COPY: Record<PlanId, PlanCopy> = {
    free: {
        name: { TR: "Ücretsiz", EN: "Free" },
        tagline: { TR: "Hanogt Codev'in tamamı, her zaman ücretsiz.", EN: "All of Hanogt Codev, free forever." },
        features: [
            { text: { TR: "Kod editörü, Hanogt Engine V3, Arcade, Media ve Hanogt Social", EN: "The code editor, Hanogt Engine V3, the Arcade, Media and Hanogt Social" } },
            { text: { TR: "Hanogt AI ile günde 250 mesaj", EN: "250 Hanogt AI messages a day" } },
            { text: { TR: "10 kod projesi ve 10 oyun projesi", EN: "10 code projects and 10 game projects" } },
            { text: { TR: "Ekiple düzenleme ve sesli görüşme", EN: "Team editing and voice calls" } },
        ],
    },
    plus: {
        name: { TR: "Plus", EN: "Plus" },
        tagline: { TR: "Daha çok yapay zekâ ve öncelik isteyenler için.", EN: "For people who want more AI and priority." },
        features: [
            { text: { TR: "Ücretsiz plandaki her şey", EN: "Everything in Free" } },
            { text: { TR: "Hanogt AI ile günde 750 mesaj", EN: "750 Hanogt AI messages a day" } },
            { text: { TR: "40 kod projesi ve 40 oyun projesi", EN: "40 code projects and 40 game projects" } },
            { text: { TR: "Kendi API anahtarınla 2 yapay zekâ bağlantısı (OpenAI, Claude, Gemini ve daha fazlası)", EN: "Connect 2 AI providers with your own API keys (OpenAI, Claude, Gemini and more)" } },
            { text: { TR: "Destek taleplerinde öncelik", EN: "Priority on support tickets" } },
            { text: { TR: "Profilinde Plus rozeti", EN: "A Plus badge on your profile" }, planned: true },
        ],
    },
    pro: {
        name: { TR: "Pro", EN: "Pro" },
        tagline: { TR: "Her gün yoğun çalışan geliştiriciler ve ekipler için.", EN: "For developers and teams who work hard every day." },
        features: [
            { text: { TR: "Plus plandaki her şey", EN: "Everything in Plus" } },
            { text: { TR: "Hanogt AI ile günde 2.000 mesaj", EN: "2,000 Hanogt AI messages a day" } },
            { text: { TR: "Sınırsız kod ve oyun projesi", EN: "Unlimited code and game projects" } },
            { text: { TR: "Kendi API anahtarınla 5 yapay zekâ bağlantısı", EN: "Connect 5 AI providers with your own API keys" } },
            { text: { TR: "Destek taleplerinde öncelik", EN: "Priority on support tickets" } },
            { text: { TR: "Yeni özelliklere erken erişim", EN: "Early access to new features" }, planned: true },
        ],
    },
};
