/**
 * Paddle Billing: what the server and the Plans page share. Paddle.com is the
 * merchant of record; Hanogt Codev only keeps the state of a person's
 * subscription (subscriptions/{email}.paddle) and never sees card details.
 * Client-safe; the API client lives in src/lib/server/paddle.ts.
 */
import type { Language } from "@/lib/i18n";

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export function isBillingInterval(value: unknown): value is BillingInterval {
    return value === "month" || value === "year";
}

export type PaddleEnvironment = "sandbox" | "production";

export const PADDLE_STATUSES = ["active", "trialing", "past_due", "paused", "canceled"] as const;
export type PaddleStatus = (typeof PADDLE_STATUSES)[number];

/** Statuses that keep the plan's benefits; past_due while Paddle retries the payment. */
export const ENTITLED_STATUSES: readonly PaddleStatus[] = ["active", "trialing", "past_due"];

/**
 * If a renewal is never reported (a lost webhook), benefits end this long
 * after the paid period; the Plans page re-syncs with Paddle before that.
 */
export const PERIOD_GRACE_MS = 3 * 24 * 60 * 60_000;

/** Paddle ids: a prefix and lowercase letters/digits (ctm_01h…, sub_01h…). */
const ID_PATTERNS = {
    customer: /^ctm_[a-z0-9]{10,64}$/,
    subscription: /^sub_[a-z0-9]{10,64}$/,
    price: /^pri_[a-z0-9]{10,64}$/,
    product: /^pro_[a-z0-9]{10,64}$/,
    transaction: /^txn_[a-z0-9]{10,64}$/,
    discount: /^dsc_[a-z0-9]{10,64}$/,
} as const;
export type PaddleIdKind = keyof typeof ID_PATTERNS;

export function isPaddleId(kind: PaddleIdKind, value: unknown): value is string {
    return typeof value === "string" && ID_PATTERNS[kind].test(value);
}

/** What subscriptions/{email}.paddle holds. */
export type PaddleSubscriptionState = {
    /** Sandbox and live are separate Paddle accounts; only the configured one counts. */
    environment: PaddleEnvironment;
    subscriptionId: string;
    customerId: string;
    status: PaddleStatus;
    /** null when the price belongs to no plan (then nothing is unlocked). */
    plan: "plus" | "pro" | null;
    interval: BillingInterval | null;
    priceId: string;
    productId: string;
    currentPeriodEnd: string | null;
    nextBilledAt: string | null;
    scheduledChange: { action: "cancel" | "pause" | "resume"; effectiveAt: string } | null;
    canceledAt: string | null;
    /** Paddle's updated_at: orders the copies we receive. */
    paddleUpdatedAt: string | null;
    syncedAt: string | null;
};

function isoOrNull(value: unknown): string | null {
    if (typeof value === "string") {
        const time = Date.parse(value);
        return Number.isFinite(time) ? new Date(time).toISOString() : null;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
    return null;
}

/** Reads a stored state back; anything malformed counts as "no subscription". */
export function normalizePaddleState(value: unknown): PaddleSubscriptionState | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (!isPaddleId("subscription", record.subscriptionId) || !isPaddleId("customer", record.customerId)) return null;
    const environment = record.environment === "sandbox" || record.environment === "production" ? record.environment : null;
    if (!environment) return null;
    const status = (PADDLE_STATUSES as readonly unknown[]).includes(record.status) ? record.status as PaddleStatus : null;
    if (!status) return null;
    const change = record.scheduledChange && typeof record.scheduledChange === "object" ? record.scheduledChange as Record<string, unknown> : null;
    const changeAction = change && (change.action === "cancel" || change.action === "pause" || change.action === "resume") ? change.action : null;
    const changeAt = change ? isoOrNull(change.effectiveAt) : null;
    return {
        environment,
        subscriptionId: record.subscriptionId,
        customerId: record.customerId,
        status,
        plan: record.plan === "plus" || record.plan === "pro" ? record.plan : null,
        interval: isBillingInterval(record.interval) ? record.interval : null,
        priceId: typeof record.priceId === "string" ? record.priceId.slice(0, 80) : "",
        productId: typeof record.productId === "string" ? record.productId.slice(0, 80) : "",
        currentPeriodEnd: isoOrNull(record.currentPeriodEnd),
        nextBilledAt: isoOrNull(record.nextBilledAt),
        scheduledChange: changeAction && changeAt ? { action: changeAction, effectiveAt: changeAt } : null,
        canceledAt: isoOrNull(record.canceledAt),
        paddleUpdatedAt: isoOrNull(record.paddleUpdatedAt),
        syncedAt: isoOrNull(record.syncedAt),
    };
}

/** True while the subscription unlocks its plan. */
export function paddleEntitles(state: PaddleSubscriptionState | null | undefined, now = Date.now()): state is PaddleSubscriptionState & { plan: "plus" | "pro" } {
    if (!state || !state.plan || !ENTITLED_STATUSES.includes(state.status)) return false;
    if (!state.currentPeriodEnd) return true;
    const end = Date.parse(state.currentPeriodEnd);
    return !Number.isFinite(end) || now <= end + PERIOD_GRACE_MS;
}

/** The paid period is over but no renewal has been seen: worth asking Paddle. */
export function paddleNeedsResync(state: PaddleSubscriptionState | null | undefined, now = Date.now()) {
    if (!state || !ENTITLED_STATUSES.includes(state.status) || !state.currentPeriodEnd) return false;
    const end = Date.parse(state.currentPeriodEnd);
    return Number.isFinite(end) && now > end;
}

/** Subscription details the Plans page shows (no Paddle ids). */
export type BillingView = {
    status: PaddleStatus;
    plan: "plus" | "pro" | null;
    interval: BillingInterval | null;
    /** Next charge, when the subscription renews. */
    renewsAt: string | null;
    /** A cancellation the person scheduled; benefits last until then. */
    endsAt: string | null;
    pastDue: boolean;
    paused: boolean;
    canceled: boolean;
};

export function billingView(state: PaddleSubscriptionState | null): BillingView | null {
    if (!state) return null;
    const endsAt = state.scheduledChange?.action === "cancel" ? state.scheduledChange.effectiveAt : null;
    return {
        status: state.status,
        plan: state.plan,
        interval: state.interval,
        renewsAt: endsAt || state.status === "canceled" || state.status === "paused" ? null : state.nextBilledAt,
        endsAt,
        pastDue: state.status === "past_due",
        paused: state.status === "paused",
        canceled: state.status === "canceled",
    };
}

/** A price as the Plans page shows it, localised by Paddle for the visitor's country. */
export type PaddlePriceView = {
    priceId: string;
    /** Formatted by Paddle, taxes included where they apply (e.g. "₺199,00"). */
    total: string;
    /** Lowest currency unit, as Paddle sends it (e.g. "19900"). */
    amount: string;
    currency: string;
    interval: BillingInterval;
    trialDays: number | null;
};

/** Present on GET /api/plans whenever Paddle is set up (also when nothing is on sale yet). */
export type PaddleCheckoutConfig = {
    environment: PaddleEnvironment;
    clientToken: string;
    /** Billing periods each plan can be bought for: published ("Visible") and priced in Paddle. */
    onSale: { plus: BillingInterval[]; pro: BillingInterval[] };
    /** Localised prices; may miss entries when Paddle couldn't be asked (checkout still works). */
    prices: { plus: Partial<Record<BillingInterval, PaddlePriceView>>; pro: Partial<Record<BillingInterval, PaddlePriceView>> };
    pricesUnavailable: boolean;
    /** The owner opened sales to everyone (Admin Panel > Subscriptions > Paddle). */
    salesOpen: boolean;
    /** Sales are closed but this viewer is staff or a listed tester. */
    testMode: boolean;
};

/** Languages Paddle Checkout is translated into; others use the browser's language. */
const CHECKOUT_LOCALES: Partial<Record<Language, string>> = {
    TR: "tr", EN: "en", DE: "de", FR: "fr", ES: "es", IT: "it", PT: "pt", RU: "ru", AR: "ar",
    JP: "ja", KR: "ko", CN: "zh-Hans", NL: "nl", PL: "pl", SV: "sv", DA: "da", NO: "no",
};

export function checkoutLocale(language: Language): string | undefined {
    return CHECKOUT_LOCALES[language];
}

/** Digits after the decimal point for a currency (JPY 0, TRY 2…). */
export function currencyDigits(currency: string) {
    try {
        return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
        return 2;
    }
}

/** Paddle amounts are strings in the lowest unit ("19900" → 199). */
export function minorToMajor(amount: string | number, currency: string) {
    const value = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(value)) return 0;
    return value / 10 ** currencyDigits(currency);
}

export function formatMoney(amount: string | number, currency: string, locale: string) {
    const value = minorToMajor(amount, currency);
    try {
        return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
    } catch {
        return `${value} ${currency}`;
    }
}

/** Yearly price compared with twelve months, as a whole percentage (0 when not cheaper). */
export function yearlySavingsPercent(monthly: PaddlePriceView | undefined, yearly: PaddlePriceView | undefined) {
    if (!monthly || !yearly || monthly.currency !== yearly.currency) return 0;
    const twelve = Number(monthly.amount) * 12;
    const year = Number(yearly.amount);
    if (!Number.isFinite(twelve) || !Number.isFinite(year) || twelve <= 0 || year >= twelve) return 0;
    return Math.floor(((twelve - year) / twelve) * 100);
}

/** POST /api/paddle/subscription { action: "preview" } answer. */
export type PlanChangePreview = {
    /** What is charged (or credited) right away, in the lowest currency unit. */
    amount: string;
    currency: string;
    result: "charge" | "credit" | "none";
    nextBilledAt: string | null;
    nextAmount: string | null;
};

/**
 * Why the Plans page couldn't take someone through a checkout, as browsers
 * report it (POST /api/paddle/client-error): Paddle.js never arrived
 * (blocked), ran without its instance (missing), failed to start (init) or to
 * open the checkout (open), or Paddle's checkout itself reported an error
 * (checkout.error, checkout.failed, checkout.payment.error). "request": the
 * page's own call to a billing route got no answer from our code (the network
 * or an extension stopped it, or Vercel answered instead, e.g. a 504 timeout).
 */
export const PADDLE_CLIENT_ERROR_STAGES = ["blocked", "missing", "init", "open", "checkout_error", "checkout_failed", "payment_error", "request"] as const;
export type PaddleClientErrorStage = (typeof PADDLE_CLIENT_ERROR_STAGES)[number];

export function isPaddleClientErrorStage(value: unknown): value is PaddleClientErrorStage {
    return typeof value === "string" && (PADDLE_CLIENT_ERROR_STAGES as readonly string[]).includes(value);
}

/** The newest reports kept in site_config/paddle_status.clientErrors. */
export const PADDLE_CLIENT_ERRORS_MAX = 10;

/** One of those reports. Nothing in it says who sent it. */
export type PaddleClientError = {
    at: string;
    stage: PaddleClientErrorStage;
    message: string;
    /** A Paddle or Retain address the browser refused to load (https, without its query). */
    blockedUrl: string | null;
    /** Paddle's error code from a checkout event. */
    code: string | null;
    /** Browser and major version from the User-Agent, e.g. "Chrome 141". */
    browser: string;
    environment: PaddleEnvironment;
};

/**
 * What a billing route (POST /api/paddle/checkout, /api/paddle/subscription)
 * was doing when it failed: reading the plan catalog, the Paddle settings or
 * the account's subscription record, finding the Paddle customer, creating
 * the checkout's transaction, or one of the subscription actions.
 */
export const BILLING_STEPS = ["catalog", "settings", "subscription", "customer", "transaction", "portal", "preview", "change", "keep"] as const;
export type BillingStep = (typeof BILLING_STEPS)[number];

export function isBillingStep(value: unknown): value is BillingStep {
    return typeof value === "string" && (BILLING_STEPS as readonly string[]).includes(value);
}

/** The newest failures kept in site_config/paddle_status.serverErrors. */
export const PADDLE_SERVER_ERRORS_MAX = 10;

/** One failed billing request as the server saw it (nothing in it says whose it was). */
export type PaddleServerError = {
    at: string;
    /** "checkout" or "subscription:<action>". */
    route: string;
    step: BillingStep | null;
    /** What the route answered: 424 when Paddle failed, 500 for our side (502/503 in older entries). */
    status: number;
    /** Paddle's HTTP status (0: Paddle wasn't reached); null when Paddle wasn't the problem. */
    paddleStatus: number | null;
    /** Paddle's error code ("timeout", "network_error" and "unexpected_response" included), "database_error" or "internal_error". */
    code: string;
    /** Paddle's explanation or our error message, on one line without e-mail addresses. */
    detail: string;
    /** How long the request had been running. */
    ms: number;
    environment: PaddleEnvironment;
};

/** In-app notifications about a subscription (NotificationCenter shows them translated). */
export const BILLING_NOTIFICATION_KINDS = ["active", "changed", "cancel", "pastdue", "ended"] as const;
export type BillingNotificationKind = (typeof BILLING_NOTIFICATION_KINDS)[number];

/** Error codes of the /api/paddle routes. */
export type BillingErrorCode =
    | "unauthorized"
    | "forbidden_origin"
    | "rate_limited"
    | "invalid_request"
    | "billing_unavailable"
    | "plan_unavailable"
    | "plan_blocked"
    | "already_subscribed"
    | "no_subscription"
    | "no_change"
    | "paddle_error"
    | "unavailable";
