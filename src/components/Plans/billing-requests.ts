import type { Copy } from "@/lib/i18n";
import type { BillingErrorCode, PaddleClientErrorStage } from "@/lib/paddle";
import type { PlansResponse } from "@/lib/plans";
import { C } from "./plans-copy";

/**
 * The Pricing page's billing requests and how their failures are told: the
 * notice for the person, the detail for the team, and when to try once more.
 */

export type Notice = {
    tone: "info" | "success" | "error";
    copy: Copy;
    vars?: Record<string, string | number>;
    /** For the team and testers only: what to check. */
    hint?: Copy;
    /** For the team and testers only: the stage that failed and Paddle's own words. */
    technical?: { stage: string; message: string };
    /** Under every failed request: what failed, how and where ("unavailable/database_error · HTTP 500 · subscription · 2.1 s"). */
    reference?: string;
    /** A button under the message: ask Paddle about the payment now, resume a paused subscription, update the payment method or reload. */
    action?: "checkPayment" | "resume" | "updatePayment" | "reload";
} | null;

/** Paddle checkout events the page reports, as stages of POST /api/paddle/client-error. */
export const EVENT_STAGES: Partial<Record<string, PaddleClientErrorStage>> = {
    "checkout.error": "checkout_error",
    "checkout.failed": "checkout_failed",
    // A declined card: Paddle explains it inside its own frame and lets the person try again.
    "checkout.payment.failed": "payment_error",
    // No usable payment method (e.g. none offered for the country): the page says so too.
    "checkout.payment.error": "payment_error",
};

export type ClientErrorReport = { stage: PaddleClientErrorStage; message: string; blockedUrl?: string | null; code?: string | null };

/** Fire and forget: the team sees it under Admin › Subscriptions › Paddle. */
export function postClientError(report: ClientErrorReport) {
    void fetch("/api/paddle/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify(report),
    }).catch(() => undefined);
}

const ERROR_COPY: Partial<Record<BillingErrorCode, Copy>> = {
    already_subscribed: C.alreadySubscribed,
    subscription_paused: C.subscriptionPaused,
    customer_unverified: C.customerUnverified,
    customer_conflict: C.customerConflict,
    payment_declined: C.paymentDeclined,
    payment_pending: C.paymentPending,
    plan_unavailable: C.planUnavailable,
    plan_blocked: C.blocked,
    billing_unavailable: C.billingUnavailable,
    rate_limited: C.rateLimited,
    unauthorized: C.signedOut,
    forbidden_origin: C.reloadPage,
    invalid_request: C.reloadPage,
    no_subscription: C.noSubscription,
    no_change: C.noChange,
    coupon_invalid: C.couponInvalid,
    coupon_expired: C.couponExpired,
    coupon_used_up: C.couponUsedUp,
    coupon_plan: C.couponPlan,
};

export async function fetchPlans(): Promise<PlansResponse | null> {
    try {
        const response = await fetch("/api/plans", { cache: "no-store", credentials: "same-origin" });
        return response.ok ? await response.json() as PlansResponse : null;
    } catch {
        return null;
    }
}

/** A billing request that failed, with everything the page and the team need to tell why. */
export type RequestFailure = {
    ok: false;
    /** Our error code; "network": no answer at all; "timeout": the server (504) or the page gave up waiting. */
    error: BillingErrorCode | "network" | "timeout";
    /** HTTP status; null when no answer came. */
    status: number | null;
    /** False when the answer wasn't ours (no answer, or an error page such as Vercel's 504). */
    json: boolean;
    /** The route's code: Paddle's error code, "database_error" or "internal_error". */
    code?: string;
    /** What the route was doing (catalog, subscription, customer, transaction…). */
    step?: string;
    /** Paddle's HTTP status (0: Paddle wasn't reached). */
    paddleStatus?: number;
    /** Only for the team, testers and the sandbox. */
    detail?: string;
    /** How long the request took. */
    ms: number;
};

export type RequestResult<T> = { ok: true; data: T } | RequestFailure;

/** Longer than the billing routes may run (60 s), so the server's own answer comes first. */
const REQUEST_TIMEOUT_MS = 70_000;
export const RETRY_DELAY_MS = 1_500;
/** After a checkout: how long and how often the page asks the server to check the payment with Paddle. */
export const SYNC_WINDOW_MS = 120_000;
export const SYNC_DELAYS_MS = [1_500, 2_500, 4_000, 6_000] as const;

export async function postJson<T>(url: string, body: unknown): Promise<RequestResult<T>> {
    const started = Date.now();
    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(body),
            signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
        });
    } catch (error) {
        const timedOut = error instanceof DOMException && error.name === "TimeoutError";
        return { ok: false, error: timedOut ? "timeout" : "network", status: null, json: false, ms: Date.now() - started };
    }
    const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
    const payload = isJson ? await response.json().catch(() => null) as unknown : null;
    const fields = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
    if (response.ok && fields) return { ok: true, data: fields as T };
    const text = (value: unknown, max: number) => (typeof value === "string" && value ? value.slice(0, max) : undefined);
    return {
        ok: false,
        error: (text(fields?.error, 40) as BillingErrorCode | undefined) ?? (response.status === 504 ? "timeout" : "unavailable"),
        status: response.status,
        json: Boolean(fields),
        code: text(fields?.code, 80),
        step: text(fields?.step, 40),
        paddleStatus: typeof fields?.paddleStatus === "number" ? fields.paddleStatus : undefined,
        detail: text(fields?.detail, 300),
        ms: Date.now() - started,
    };
}

/** Worth one more try: no answer, a timeout, or a failure on the way (ours or Paddle's) rather than a refusal. */
export function retryable(result: RequestFailure) {
    if (result.error === "network") return true;
    // The server's 504, not the page's own 70 seconds.
    if (result.error === "timeout") return result.status !== null;
    if (!result.json) return (result.status ?? 0) >= 500;
    if (result.error === "unavailable") return true;
    if (result.error === "paddle_error") return result.paddleStatus === undefined || result.paddleStatus === 0 || result.paddleStatus === 429 || result.paddleStatus >= 500;
    return false;
}

/** One line that tells the team what failed: "unavailable/database_error · HTTP 500 · subscription · 2.1 s". */
function failureReference(result: RequestFailure) {
    return [
        result.code && result.code !== result.error ? `${result.error}/${result.code}` : result.error,
        result.status ? `HTTP ${result.status}` : null,
        result.paddleStatus !== undefined ? `Paddle ${result.paddleStatus || "-"}` : null,
        result.step ?? null,
        `${(result.ms / 1000).toFixed(1)} s`,
    ].filter(Boolean).join(" · ");
}

/** For the team: what to fix in Paddle when it names a setup problem. */
const PADDLE_SETUP_HINTS: Record<string, Copy> = {
    transaction_default_checkout_url_not_set: { TR: "Ekip için: Paddle'da varsayılan ödeme bağlantısı tanımlı değil. Paddle › Checkout › Checkout settings › Default payment link alanına https://hanogtcodev.com/plans yazıp kaydet (sandbox ve canlı hesapta ayrı ayrı).", EN: "For the team: no default payment link is set in Paddle. Enter https://hanogtcodev.com/plans under Paddle › Checkout › Checkout settings › Default payment link and save (separately for sandbox and live)." },
    transaction_checkout_url_domain_is_not_approved: { TR: "Ekip için: ödeme bağlantısının alan adı Paddle'da onaylı değil. Paddle › Checkout › Request domain approval bölümünden hanogtcodev.com için onay iste.", EN: "For the team: the payment link's domain isn't approved in Paddle. Request approval for hanogtcodev.com under Paddle › Checkout › Request domain approval." },
    transaction_checkout_not_enabled: { TR: "Ekip için: bu Paddle hesabında ödeme ekranı henüz açılmamış; Paddle'daki hesap doğrulama (onboarding) adımlarını tamamla.", EN: "For the team: checkout isn't enabled on this Paddle account yet; finish Paddle's account verification (onboarding)." },
    paddle_billing_not_enabled: { TR: "Ekip için: bu Paddle hesabında Paddle Billing açık değil (Classic hesap). Billing hesabının anahtarlarını kullan.", EN: "For the team: Paddle Billing isn't enabled on this Paddle account (a Classic account). Use a Billing account's keys." },
    forbidden: { TR: "Ekip için: Paddle API anahtarının bu işlem için izni yok. Paddle › Developer tools › Authentication bölümünde anahtara Transactions ve Customers yazma izni ver.", EN: "For the team: the Paddle API key isn't allowed to do this. Give the key write access to Transactions and Customers under Paddle › Developer tools › Authentication." },
    entity_not_found: { TR: "Ekip için: fiyat ya da müşteri bu Paddle hesabında bulunamadı (öbür ortamın kimliği olabilir). Yönetici Paneli › Abonelikler › Paddle bölümünde fiyat eşleştirmesini kontrol et.", EN: "For the team: the price or customer wasn't found in this Paddle account (it may be the other environment's id). Check the price mapping under Admin Panel › Subscriptions › Paddle." },
};

/** Answers that explain themselves; everything else also shows its error code. */
const EXPECTED_ERRORS: ReadonlySet<RequestFailure["error"]> = new Set(["already_subscribed", "payment_pending", "subscription_paused", "customer_unverified", "customer_conflict", "payment_declined", "plan_unavailable", "plan_blocked", "rate_limited", "unauthorized", "no_subscription", "no_change", "coupon_invalid", "coupon_expired", "coupon_used_up", "coupon_plan"]);
/** Answers whose notice offers a button. */
export const ERROR_ACTIONS: Partial<Record<RequestFailure["error"], NonNullable<Notice>["action"]>> = {
    subscription_paused: "resume",
    payment_declined: "updatePayment",
    forbidden_origin: "reload",
    invalid_request: "reload",
    no_subscription: "reload",
    no_change: "reload",
};
/** sessionStorage: the customer portal was opened; back on this page the subscription is re-read from Paddle. */
export const PORTAL_VISIT_KEY = "hanogt:paddle-portal-visit";
export const COUPON_ERRORS: ReadonlySet<RequestFailure["error"]> = new Set(["coupon_invalid", "coupon_expired", "coupon_used_up", "coupon_plan"]);




/** The notice for a failed request; `team` (staff, testers, the sandbox) also get the detail and where to look. */
export function failureNotice(result: RequestFailure, team: boolean): NonNullable<Notice> {
    const paddleDown = result.paddleStatus === undefined || result.paddleStatus === 0 || result.paddleStatus === 429 || result.paddleStatus >= 500;
    const copy =
        result.error === "network" ? C.networkFailed
            : result.error === "timeout" ? C.serverTimeout
                : result.error === "paddle_error" ? (paddleDown ? C.paddleError : C.paddleRefused)
                    : result.code === "database_error" ? C.databaseFailed
                        : ERROR_COPY[result.error] ?? C.failed;
    const ours = result.error === "network" || result.error === "timeout" || result.error === "unavailable" || result.error === "paddle_error";
    return {
        tone: "error",
        copy,
        vars: result.error === "paddle_error" ? { code: result.code ?? "?" } : undefined,
        hint: team ? (result.error === "paddle_error" && result.code ? PADDLE_SETUP_HINTS[result.code] : undefined) ?? (ours ? C.failureTeam : undefined) : undefined,
        technical: team && result.detail ? { stage: result.step ?? "server", message: result.detail } : undefined,
        reference: EXPECTED_ERRORS.has(result.error) ? undefined : failureReference(result),
        action: ERROR_ACTIONS[result.error],
    };
}
