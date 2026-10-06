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

export const DAY_MS = 24 * 60 * 60_000;

/**
 * Hanogt AI messages: a short guard a minute, and an allowance for a window
 * of `windowDays` days that opens with the first message (Free 50 in 7 days,
 * Plus 750 in 14 days, Pro 2,000 in 7 days). The chat, messages through the
 * person's own connections, the developer API and Hanogt AI in Social groups
 * all count in the same window.
 */
export type AiPlanLimits = { perMinute: number; perWindow: number; windowDays: number };
export const PLAN_AI_LIMITS: Record<PlanId, AiPlanLimits> = {
    free: { perMinute: 5, perWindow: 50, windowDays: 7 },
    plus: { perMinute: 20, perWindow: 750, windowDays: 14 },
    pro: { perMinute: 30, perWindow: 2000, windowDays: 7 },
};

/** A window of `days` days in milliseconds. */
export const aiWindowMs = (days: number) => Math.max(1, days) * DAY_MS;

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
 * Audio files uploaded for Hanogt Engine games (V4): total size and number of
 * files an account may store. Each file is at most GAME_AUDIO_MAX_BYTES; a
 * file used by several projects counts once.
 */
export type PlanGameAudioLimits = { bytes: number; files: number };
export const PLAN_GAME_AUDIO_LIMITS: Record<PlanId, PlanGameAudioLimits> = {
    free: { bytes: 5 * 1024 * 1024, files: 30 },
    plus: { bytes: 25 * 1024 * 1024, files: 150 },
    pro: { bytes: 100 * 1024 * 1024, files: 600 },
};
export const GAME_AUDIO_MAX_BYTES = 300 * 1024;

/**
 * Running code in the editor: how many files one run may start at once
 * (browser and server languages together) and how many files a minute the
 * server compiles and runs (C, C++, Java, Go…; browser languages never reach
 * it). The editor sends server files eight at a time (RUN_FILES_PER_REQUEST),
 * so a big run is several requests that each count their files.
 */
export type PlanRunLimits = { files: number; perMinute: number };
export const PLAN_RUN_LIMITS: Record<PlanId, PlanRunLimits> = {
    free: { files: 8, perMinute: 40 },
    plus: { files: 25, perMinute: 150 },
    pro: { files: 75, perMinute: 400 },
};
/** Files one /api/execute request runs; a bigger run is split into several requests. */
export const RUN_FILES_PER_REQUEST = 8;

/** Hanogt Social groups a person can create and own; null means unlimited. */
export const PLAN_GROUP_LIMITS: Record<PlanId, number | null> = { free: 3, plus: 10, pro: null };

/**
 * How much a Hanogt Social group holds, by its owner's plan: members, pinned
 * messages, the Security Bot's custom commands and AutoMod's own banned
 * words. When the owner's plan goes down nothing is removed: the group keeps
 * what it has and can't add more until it is under the new limit.
 */
export type GroupPlanLimits = { members: number; pinned: number; commands: number; bannedWords: number };
export const PLAN_GROUP_FEATURES: Record<PlanId, GroupPlanLimits> = {
    free: { members: 25, pinned: 25, commands: 20, bannedWords: 100 },
    plus: { members: 100, pinned: 50, commands: 50, bannedWords: 300 },
    pro: { members: 250, pinned: 100, commands: 100, bannedWords: 1_000 },
};
/** The most of each any plan allows: what stored lists are read up to. */
export const GROUP_FEATURES_MAX: GroupPlanLimits = PLAN_GROUP_FEATURES.pro;

/** Messages a person can star in Hanogt Social (a private bookmark list). Stars above the limit stay; new ones wait. */
export const PLAN_STAR_LIMITS: Record<PlanId, number> = { free: 200, plus: 500, pro: 1_000 };

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
 * keys (src/lib/ai/connections.ts). Messages through them count in the plan's
 * Hanogt AI window like any other (PLAN_AI_LIMITS). Connections above the
 * limit are kept but switched off, e.g. after moving from Pro to Plus.
 */
export const PLAN_AI_CONNECTIONS: Record<PlanId, number> = { free: 0, plus: 2, pro: 5 };

export type PlanAiFeatures = {
    /** The longest answer of Hanogt AI's own model (max_tokens). */
    maxTokens: number;
    /** Characters of the open editor file (or attached file) the model reads. */
    contextChars: number;
    /** Characters of each personal instruction in the Hanogt AI settings. */
    instructionsChars: number;
    /** Extra tokens the model may spend thinking before it answers, on top of maxTokens. */
    thinkingTokens: number;
    /** The developer Hanogt AI API keys; null when the plan has none. Requests count in the plan's Hanogt AI window (PLAN_AI_LIMITS). */
    api: { keys: number } | null;
};

/** Hanogt AI features that grow with the plan (the chat route, the settings, own connections and the API). */
export const PLAN_AI_FEATURES: Record<PlanId, PlanAiFeatures> = {
    free: { maxTokens: 1_800, contextChars: 12_000, instructionsChars: 500, thinkingTokens: 1_000, api: null },
    plus: { maxTokens: 3_000, contextChars: 24_000, instructionsChars: 1_500, thinkingTokens: 2_000, api: { keys: 2 } },
    pro: { maxTokens: 4_000, contextChars: 40_000, instructionsChars: 3_000, thinkingTokens: 3_000, api: { keys: 5 } },
};

/** Extra Hanogt AI messages a window staff can grant on top of the plan (stored as aiBonusDaily, its name from when windows were a day). */
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

/** A staff grant's extra messages a window while it hasn't run out (0 otherwise). */
export function aiBonusOf(subscription: UserSubscription, now = Date.now()) {
    const active = subscription.aiBonusDaily > 0 && subscription.status !== "blocked" && Boolean(subscription.aiBonusUntil) && future(subscription.aiBonusUntil, now);
    return active ? subscription.aiBonusDaily : 0;
}

/** Hanogt AI limits including a staff grant that hasn't run out. */
export function aiLimitsFor(subscription: UserSubscription, now = Date.now()): AiPlanLimits {
    const base = PLAN_AI_LIMITS[effectivePlan(subscription, now)];
    return { ...base, perWindow: base.perWindow + aiBonusOf(subscription, now) };
}

/** "every 7 days" style wording of a window, for the plan lines and the usage meter. */
export function aiWindowCopy(days: number): Copy {
    if (days === 7) return { TR: "haftada", EN: "a week" };
    if (days === 14) return { TR: "2 haftada", EN: "every 2 weeks" };
    if (days === 1) return { TR: "günde", EN: "a day" };
    return { TR: `${days} günde`, EN: `every ${days} days` };
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
        /** A checkout was opened lately and no subscription unlocks a plan yet: the page offers "check my payment". */
        checkoutPending: boolean;
        aiLimits: AiPlanLimits;
        /** Hanogt AI messages used in the current window. */
        aiUsed: number;
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
            { text: { TR: "Kod editörü, Hanogt Engine V4, Arcade, Media ve Hanogt Social", EN: "The code editor, Hanogt Engine V4, the Arcade, Media and Hanogt Social" } },
            { text: { TR: "Hanogt AI ile haftada 50 mesaj", EN: "50 Hanogt AI messages a week" } },
            { text: { TR: "10 kod projesi ve 10 oyun projesi", EN: "10 code projects and 10 game projects" } },
            { text: { TR: "Tek seferde 8 dosya çalıştırma", EN: "Run 8 files at once" } },
            { text: { TR: "3 Hanogt Social grubu açma", EN: "Create up to 3 Hanogt Social groups" } },
            { text: { TR: "Gruplarında 25 üye ve 25 sabitlenmiş mesaj", EN: "25 members and 25 pinned messages in your groups" } },
            { text: { TR: "200 yıldızlı mesaj", EN: "200 starred messages" } },
            { text: { TR: "Oyunların için 5 MB ses depolaması", EN: "5 MB of audio storage for your games" } },
            { text: { TR: "2 kişiyle ekiple düzenleme ve sesli görüşme", EN: "Team editing for 2 people, with voice calls" } },
        ],
    },
    plus: {
        name: { TR: "Plus", EN: "Plus" },
        tagline: { TR: "Daha çok yapay zekâ ve öncelik isteyenler için.", EN: "For people who want more AI and priority." },
        features: [
            { text: { TR: "Ücretsiz plandaki her şey", EN: "Everything in Free" } },
            { text: { TR: "Hanogt AI ile 2 haftada 750 mesaj", EN: "750 Hanogt AI messages every 2 weeks" } },
            { text: { TR: "40 kod projesi ve 40 oyun projesi", EN: "40 code projects and 40 game projects" } },
            { text: { TR: "Tek seferde 25 dosya çalıştırma; derlenen dillerde dakikada 150 dosya", EN: "Run 25 files at once; 150 files a minute for compiled languages" } },
            { text: { TR: "10 Hanogt Social grubu açma", EN: "Create up to 10 Hanogt Social groups" } },
            { text: { TR: "Gruplarında 100 üye, 50 sabitlenmiş mesaj, 50 özel bot komutu ve 300 yasaklı kelime", EN: "100 members, 50 pinned messages, 50 custom bot commands and 300 banned words in your groups" } },
            { text: { TR: "500 yıldızlı mesaj", EN: "500 starred messages" } },
            { text: { TR: "Oyunların için 25 MB ses depolaması", EN: "25 MB of audio storage for your games" } },
            { text: { TR: "5 kişiye kadar ekiple düzenleme", EN: "Team editing with up to 5 people" } },
            { text: { TR: "Daha uzun yapay zekâ yanıtları; açık dosyanın 24.000 karakteri okunur", EN: "Longer AI answers; 24,000 characters of your open file are read" } },
            { text: { TR: "Kendi API anahtarınla 2 yapay zekâ bağlantısı (OpenAI, Claude, Gemini ve daha fazlası); mesajlar Hanogt AI hakkından düşer", EN: "Connect 2 AI providers with your own API keys (OpenAI, Claude, Gemini and more); messages use your Hanogt AI allowance" } },
            { text: { TR: "Geliştirici API'si: 2 anahtar; istekler mesaj hakkından düşer", EN: "Developer API: 2 keys; requests use your message allowance" } },
            { text: { TR: "Destek taleplerinde öncelik", EN: "Priority on support tickets" } },
            { text: { TR: "Profilinde Plus rozeti", EN: "A Plus badge on your profile" } },
        ],
    },
    pro: {
        name: { TR: "Pro", EN: "Pro" },
        tagline: { TR: "Her gün yoğun çalışan geliştiriciler ve ekipler için.", EN: "For developers and teams who work hard every day." },
        features: [
            { text: { TR: "Plus plandaki her şey", EN: "Everything in Plus" } },
            { text: { TR: "Hanogt AI ile haftada 2.000 mesaj", EN: "2,000 Hanogt AI messages a week" } },
            { text: { TR: "Sınırsız kod ve oyun projesi", EN: "Unlimited code and game projects" } },
            { text: { TR: "Tek seferde 75 dosya çalıştırma; derlenen dillerde dakikada 400 dosya", EN: "Run 75 files at once; 400 files a minute for compiled languages" } },
            { text: { TR: "Sınırsız Hanogt Social grubu", EN: "Unlimited Hanogt Social groups" } },
            { text: { TR: "Gruplarında 250 üye, 100 sabitlenmiş mesaj, 100 özel bot komutu ve 1.000 yasaklı kelime", EN: "250 members, 100 pinned messages, 100 custom bot commands and 1,000 banned words in your groups" } },
            { text: { TR: "1.000 yıldızlı mesaj", EN: "1,000 starred messages" } },
            { text: { TR: "Oyunların için 100 MB ses depolaması", EN: "100 MB of audio storage for your games" } },
            { text: { TR: "30 kişiye kadar ekiple düzenleme", EN: "Team editing with up to 30 people" } },
            { text: { TR: "En uzun yapay zekâ yanıtları; açık dosyanın 40.000 karakteri okunur", EN: "The longest AI answers; 40,000 characters of your open file are read" } },
            { text: { TR: "Kendi API anahtarınla 5 yapay zekâ bağlantısı; mesajlar Hanogt AI hakkından düşer", EN: "Connect 5 AI providers with your own API keys; messages use your Hanogt AI allowance" } },
            { text: { TR: "Geliştirici API'si: 5 anahtar; istekler mesaj hakkından düşer", EN: "Developer API: 5 keys; requests use your message allowance" } },
            { text: { TR: "Destek taleplerinde en yüksek öncelik: talebin Plus taleplerinden önce ele alınır", EN: "Top priority on support tickets: yours are handled before Plus tickets" } },
            { text: { TR: "Profilinde Pro rozeti", EN: "A Pro badge on your profile" } },
            { text: { TR: "Yeni özelliklere erken erişim: ilk olarak sesle yazma ve yanıtları sesli dinleme", EN: "Early access to new features, starting with dictation and answers read aloud" } },
        ],
    },
};
