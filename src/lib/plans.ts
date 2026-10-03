/**
 * Hanogt Codev plans. Plus and Pro are sold through Paddle (src/lib/paddle.ts)
 * once the owner connects it; until then the catalog shows "coming soon".
 * Staff can also assign plans by hand (gifts, testers). A person gets the
 * higher of the two: the staff-assigned plan or the paid one.
 * Client-safe; the server copies live in src/lib/server/plans.ts.
 */
import type { PlanUsage } from "@/lib/ai/usage";
import type { Copy } from "@/lib/i18n";
import { paddleEntitles, type BillingView, type PaddleCheckoutConfig, type PaddleSubscriptionState } from "@/lib/paddle";
import type { PlanBadgeState } from "@/lib/plan-badge";

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

/** Hanogt Social groups a person can create and own; null means unlimited. */
export const PLAN_GROUP_LIMITS: Record<PlanId, number | null> = { free: 3, plus: 10, pro: null };

/**
 * Team editing ("Ekiple düzenle"): people in one session, the owner included,
 * and the invitations it may hold, by the session owner's plan. Voice in a
 * session stays a five-person mesh whatever the plan (src/lib/collab/mesh-call.ts).
 */
export const PLAN_COLLAB_LIMITS: Record<PlanId, { people: number; invites: number }> = {
    free: { people: 2, invites: 4 },
    plus: { people: 5, invites: 12 },
    pro: { people: 30, invites: 60 },
};

/**
 * How many AI providers a person can connect to Hanogt AI with their own API
 * keys (src/lib/ai/connections.ts). Connections above the limit are kept but
 * switched off, e.g. after moving from Pro to Plus.
 */
export const PLAN_AI_CONNECTIONS: Record<PlanId, number> = { free: 0, plus: 2, pro: 5 };

export type PlanAiFeatures = {
    /** The longest answer of Hanogt AI's own model (max_tokens). */
    maxTokens: number;
    /** Characters of the open editor file (or attached file) the model reads. */
    contextChars: number;
    /** Characters of each personal instruction in the Hanogt AI settings. */
    instructionsChars: number;
    /** Messages through the person's own connections; null when the plan has none. */
    ownKey: { perMinute: number; perDay: number } | null;
    /** The developer Hanogt AI API: keys and requests; null when the plan has none. */
    api: { keys: number; perMinute: number; perDay: number } | null;
};

/** Hanogt AI features that grow with the plan (the chat route, the settings, own connections and the API). */
export const PLAN_AI_FEATURES: Record<PlanId, PlanAiFeatures> = {
    free: { maxTokens: 1_800, contextChars: 12_000, instructionsChars: 500, ownKey: null, api: null },
    plus: { maxTokens: 3_000, contextChars: 24_000, instructionsChars: 1_500, ownKey: { perMinute: 30, perDay: 3_000 }, api: { keys: 2, perMinute: 10, perDay: 250 } },
    pro: { maxTokens: 4_000, contextChars: 40_000, instructionsChars: 3_000, ownKey: { perMinute: 60, perDay: 10_000 }, api: { keys: 5, perMinute: 30, perDay: 1_000 } },
};

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
    /** The last checkout the Plans page opened for them in this environment (its transaction and when). */
    paddleCheckout: { transactionId: string; at: string } | null;
    /** The subscriber chose not to show the Plus / Pro badge on their profile (src/lib/plan-badge.ts). */
    planBadgeHidden: boolean;
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
    paddleCheckout: null,
    planBadgeHidden: false,
};

/**
 * How long after opening a checkout the account is followed up with Paddle
 * (Plans page, GET /api/plans, a second checkout): long enough for a slow
 * payment method, short enough not to ask Paddle about abandoned ones forever.
 */
export const CHECKOUT_FOLLOW_UP_MS = 7 * 24 * 60 * 60_000;

/** A checkout opened within CHECKOUT_FOLLOW_UP_MS. */
export function isRecentCheckout(checkout: UserSubscription["paddleCheckout"], now = Date.now()) {
    if (!checkout) return false;
    const at = Date.parse(checkout.at);
    return Number.isFinite(at) && at <= now + 60_000 && now - at <= CHECKOUT_FOLLOW_UP_MS;
}

function future(iso: string | null, now: number) {
    if (!iso) return true;
    const time = Date.parse(iso);
    return Number.isFinite(time) && time > now;
}

const PLAN_RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2 };

/** Free 0, Plus 1, Pro 2: whether one plan is higher than another. */
export function planRank(plan: PlanId) {
    return PLAN_RANK[plan];
}

/** The plan to suggest when a limit is reached: Plus after Free, Pro after Plus, none after Pro. */
export function nextPlanUp(plan: PlanId): PaidPlanId | null {
    return plan === "free" ? "plus" : plan === "plus" ? "pro" : null;
}

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
    /** Each plan's advanced code engine answers a day, when the server has the engine and it is on (src/lib/ai/engine.ts). */
    engine?: { daily: Record<PlanId, number> } | null;
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
        /** A checkout was opened lately and no subscription unlocks a plan yet: the page offers "check my payment". */
        checkoutPending: boolean;
        aiLimits: { perMinute: number; perDay: number };
        aiUsedToday: number;
        /** Every benefit with a number: used out of the plan's limit (src/lib/ai/usage.ts). */
        usage: PlanUsage;
        /** The Plus / Pro profile badge: the plan it shows (null on Free), hidden by choice, opened by the team for this account. */
        badge: PlanBadgeState;
        waitlist: PaidPlanId[];
        /** Hanogt team (any role): the Plans page also shows them why a checkout failed. */
        isStaff: boolean;
    } | null;
};

/**
 * POST /api/paddle/sync: what Paddle says about the account's purchase.
 * "active": a subscription unlocks a plan; "pending": the payment went
 * through and Paddle is still creating the subscription; "none": nothing paid.
 */
export type PaddleSyncState = "active" | "pending" | "none";
export type PaddleSyncResponse = { state: PaddleSyncState; plan: PlanId; billing: BillingView | null };

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

/** How many payments of a subscription a coupon discounts: the first, every one, or the first 2–24. */
export type CouponRecur = "first" | "all" | number;
export const COUPON_RECUR_MAX = 24;

/** A stored or submitted recur setting; anything unknown is "first" (what coupons did before the setting existed). */
export function normalizeCouponRecur(value: unknown): CouponRecur {
    if (value === "all") return "all";
    const count = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    return typeof count === "number" && Number.isInteger(count) && count >= 2 && count <= COUPON_RECUR_MAX ? count : "first";
}

/** A coupon as the Plans page shows it once its code is accepted. */
export type CouponView = {
    code: string;
    percentOff: number;
    plan: PaidPlanId | "any";
    recur: CouponRecur;
    expiresAt: string | null;
};

/** A plan's price with a coupon's percentage off, in the price's lowest currency unit. */
export function couponAmount(amount: string, percentOff: number) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) return "0";
    return String(Math.round((value * (100 - Math.min(100, Math.max(0, percentOff)))) / 100));
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
            { text: { TR: "3 Hanogt Social grubu açma", EN: "Create up to 3 Hanogt Social groups" } },
            { text: { TR: "2 kişiyle ekiple düzenleme ve sesli görüşme", EN: "Team editing for 2 people, with voice calls" } },
        ],
    },
    plus: {
        name: { TR: "Plus", EN: "Plus" },
        tagline: { TR: "Daha çok yapay zekâ ve öncelik isteyenler için.", EN: "For people who want more AI and priority." },
        features: [
            { text: { TR: "Ücretsiz plandaki her şey", EN: "Everything in Free" } },
            { text: { TR: "Hanogt AI ile günde 750 mesaj", EN: "750 Hanogt AI messages a day" } },
            { text: { TR: "40 kod projesi ve 40 oyun projesi", EN: "40 code projects and 40 game projects" } },
            { text: { TR: "10 Hanogt Social grubu açma", EN: "Create up to 10 Hanogt Social groups" } },
            { text: { TR: "5 kişiye kadar ekiple düzenleme", EN: "Team editing with up to 5 people" } },
            { text: { TR: "Daha uzun yapay zekâ yanıtları; açık dosyanın 24.000 karakteri okunur", EN: "Longer AI answers; 24,000 characters of your open file are read" } },
            { text: { TR: "Kendi API anahtarınla 2 yapay zekâ bağlantısı (OpenAI, Claude, Gemini ve daha fazlası), günde 3.000 mesaj", EN: "Connect 2 AI providers with your own API keys (OpenAI, Claude, Gemini and more), 3,000 messages a day" } },
            { text: { TR: "Geliştirici API'si: 2 anahtar, dakikada 10 ve günde 250 istek", EN: "Developer API: 2 keys, 10 requests a minute and 250 a day" } },
            { text: { TR: "Destek taleplerinde öncelik", EN: "Priority on support tickets" } },
            { text: { TR: "Profilinde Plus rozeti", EN: "A Plus badge on your profile" } },
        ],
    },
    pro: {
        name: { TR: "Pro", EN: "Pro" },
        tagline: { TR: "Her gün yoğun çalışan geliştiriciler ve ekipler için.", EN: "For developers and teams who work hard every day." },
        features: [
            { text: { TR: "Plus plandaki her şey", EN: "Everything in Plus" } },
            { text: { TR: "Hanogt AI ile günde 2.000 mesaj", EN: "2,000 Hanogt AI messages a day" } },
            { text: { TR: "Sınırsız kod ve oyun projesi", EN: "Unlimited code and game projects" } },
            { text: { TR: "Sınırsız Hanogt Social grubu", EN: "Unlimited Hanogt Social groups" } },
            { text: { TR: "30 kişiye kadar ekiple düzenleme", EN: "Team editing with up to 30 people" } },
            { text: { TR: "En uzun yapay zekâ yanıtları; açık dosyanın 40.000 karakteri okunur", EN: "The longest AI answers; 40,000 characters of your open file are read" } },
            { text: { TR: "Kendi API anahtarınla 5 yapay zekâ bağlantısı, günde 10.000 mesaj", EN: "Connect 5 AI providers with your own API keys, 10,000 messages a day" } },
            { text: { TR: "Geliştirici API'si: 5 anahtar, dakikada 30 ve günde 1.000 istek", EN: "Developer API: 5 keys, 30 requests a minute and 1,000 a day" } },
            { text: { TR: "Destek taleplerinde en yüksek öncelik: talebin Plus taleplerinden önce ele alınır", EN: "Top priority on support tickets: yours are handled before Plus tickets" } },
            { text: { TR: "Profilinde Pro rozeti", EN: "A Pro badge on your profile" } },
            { text: { TR: "Yeni özelliklere erken erişim: ilk olarak sesle yazma ve yanıtları sesli dinleme", EN: "Early access to new features, starting with dictation and answers read aloud" } },
        ],
    },
};
