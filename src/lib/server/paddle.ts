import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
    BILLING_INTERVALS,
    PADDLE_CLIENT_ERRORS_MAX,
    PADDLE_SERVER_ERRORS_MAX,
    PADDLE_STATUSES,
    isBillingStep,
    isPaddleClientErrorStage,
    isPaddleId,
    normalizePaddleState,
    paddleEntitles,
    type BillingInterval,
    type BillingNotificationKind,
    type PaddleCheckoutConfig,
    type PaddleClientError,
    type PaddleEnvironment,
    type BillingStep,
    type PaddleServerError,
    type PaddlePriceView,
    type PaddleStatus,
    type PaddleSubscriptionState,
    type PlanChangePreview,
} from "@/lib/paddle";
import { PAID_PLAN_IDS, type PaidPlanId, type PlanCatalog } from "@/lib/plans";
import { commitServerMutations, getServerDocument, isWriteConflict } from "./firebase-rest";
import { isCidr } from "./request-security";
import { cleanValue, currentPaddleEnvironment, getPaddleConfig, isPaddleConfigured, type Env, type PaddleConfig } from "./paddle-config";
import { subscriptionPath } from "./plans";
import { syncPlanBadgeQuietly } from "./plan-badge";
import { normalizeEmail } from "./validate";

export { currentPaddleEnvironment, getPaddleConfig, isPaddleConfigured, paddleDashboardUrl, type PaddleConfig, type PaddleConfigWarning } from "./paddle-config";

/*
 * Paddle Billing for Hanogt Codev (see docs/ENVIRONMENT.md, "Payments").
 *
 * - Checkouts are created here as transactions for the person's own Paddle
 *   customer, with signed custom data, so a browser can't attach a purchase
 *   to someone else's account.
 * - The webhook only trusts signed notifications and then re-reads the
 *   subscription from the API, so the order in which notifications arrive
 *   doesn't matter.
 * - What a person may use is decided by src/lib/plans.ts effectivePlan().
 */

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export class PaddleApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly detail: string;
    // No parameter properties: the plain-Node tests strip types and can't run them.
    constructor(status: number, code: string, detail = "") {
        super(`Paddle API ${status || "network"} ${code}`);
        this.name = "PaddleApiError";
        this.status = status;
        this.code = code;
        this.detail = detail;
    }
}

/** Per request: a checkout makes up to three in a row and has to answer well within its time limit. */
const REQUEST_TIMEOUT_MS = 8_000;

export async function paddleRequest<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, config: PaddleConfig = getPaddleConfig()): Promise<T> {
    if (!config.apiKey) throw new PaddleApiError(0, "not_configured");
    let response: Response;
    try {
        response = await fetch(`${config.apiBase}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
                Accept: "application/json",
                "Paddle-Version": "1",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        throw new PaddleApiError(0, error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network_error");
    }
    const payload = await response.json().catch(() => null) as { error?: { code?: unknown; detail?: unknown } } | null;
    if (!response.ok) {
        const code = typeof payload?.error?.code === "string" ? payload.error.code.slice(0, 80) : "http_error";
        const detail = typeof payload?.error?.detail === "string" ? payload.error.detail.slice(0, 300) : "";
        throw new PaddleApiError(response.status, code, detail);
    }
    // Every Paddle answer we use is a JSON object; anything else (an HTML error
    // page from a proxy, an empty body) must not turn into a TypeError later.
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new PaddleApiError(response.status, "unexpected_response");
    return payload as T;
}

// ---------------------------------------------------------------------------
// Paddle entities (only the fields we read)
// ---------------------------------------------------------------------------

type BillingCycle = { interval?: string; frequency?: number } | null | undefined;

export type PaddlePriceEntity = {
    id: string;
    product_id: string;
    name?: string | null;
    description?: string | null;
    status?: string;
    billing_cycle?: BillingCycle;
    trial_period?: BillingCycle;
    unit_price?: { amount?: string; currency_code?: string };
    /** How many a checkout may buy; anything above 1 shows a quantity stepper in the checkout. */
    quantity?: { minimum?: number; maximum?: number } | null;
    custom_data?: Record<string, unknown> | null;
    product?: { id?: string; name?: string; status?: string; custom_data?: Record<string, unknown> | null } | null;
};

export type PaddleSubscriptionEntity = {
    id: string;
    status: string;
    customer_id: string;
    updated_at?: string | null;
    next_billed_at?: string | null;
    canceled_at?: string | null;
    current_billing_period?: { starts_at?: string; ends_at?: string } | null;
    billing_cycle?: BillingCycle;
    scheduled_change?: { action?: string; effective_at?: string } | null;
    items?: Array<{ status?: string; price?: PaddlePriceEntity; product?: PaddlePriceEntity["product"] }>;
    custom_data?: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Webhook signatures
// ---------------------------------------------------------------------------

/** Paddle signs "<ts>:<raw body>"; deliveries older than this are refused (replays). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" };

/**
 * Checks a Paddle-Signature header ("ts=1671552777;h1=<hex>"). While a secret
 * is being rotated there can be several h1 values; any match is enough.
 */
export function verifyPaddleSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): SignatureCheck {
    if (!header) return { ok: false, reason: "missing" };
    let ts = "";
    const signatures: string[] = [];
    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index < 1) continue;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key === "ts") ts = value;
        else if (key === "h1") signatures.push(value.toLowerCase());
    }
    if (!/^\d{9,12}$/.test(ts) || !signatures.length) return { ok: false, reason: "malformed" };
    if (Math.abs(nowSeconds - Number(ts)) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "expired" };
    const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest();
    const matches = signatures.some((signature) => /^[0-9a-f]{64}$/.test(signature) && timingSafeEqual(Buffer.from(signature, "hex"), expected));
    return matches ? { ok: true } : { ok: false, reason: "mismatch" };
}

// ---------------------------------------------------------------------------
// Webhook source addresses
// ---------------------------------------------------------------------------

const IPS_TTL_MS = 60 * 60_000;
const IPS_FAILURE_TTL_MS = 60_000;
let ipsCache: { base: string; at: number; ttl: number; value: Promise<string[]> } | null = null;

/** True when the address is inside one of the CIDR blocks (shared with the rate limits' client address). */
export { ipInCidrs } from "./request-security";

/**
 * The addresses Paddle sends webhooks from, read from {api}/ips
 * (data.ipv4_cidrs) and cached for an hour. Not hard-coded: Paddle's endpoint
 * is the source of truth and the list can change.
 */
export async function paddleWebhookCidrs(config: PaddleConfig = getPaddleConfig()): Promise<string[]> {
    if (ipsCache && ipsCache.base === config.apiBase && Date.now() - ipsCache.at < ipsCache.ttl) return ipsCache.value;
    const value = (async () => {
        let response: Response;
        try {
            response = await fetch(`${config.apiBase}/ips`, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(5_000) });
        } catch {
            throw new PaddleApiError(0, "ips_unreachable");
        }
        if (!response.ok) throw new PaddleApiError(response.status, "ips_unavailable");
        const payload = await response.json().catch(() => null) as { data?: { ipv4_cidrs?: unknown } } | null;
        const cidrs = Array.isArray(payload?.data?.ipv4_cidrs) ? payload.data.ipv4_cidrs.filter((cidr): cidr is string => isCidr(cidr)) : [];
        if (!cidrs.length) throw new PaddleApiError(0, "ips_empty");
        return cidrs;
    })();
    const entry = { base: config.apiBase, at: Date.now(), ttl: IPS_TTL_MS, value };
    ipsCache = entry;
    value.catch(() => {
        entry.ttl = IPS_FAILURE_TTL_MS;
    });
    return value;
}

/** When each refusal reason was last written (per instance): anyone can post to the webhook, so it's noted once a minute at most. */
const rejectionsNoted = new Map<string, number>();
const REJECTION_NOTE_MS = 60_000;

/** Notes a refused delivery for the Admin Panel (best effort, no request data). */
export async function recordWebhookRejection(reason: string, now = Date.now()) {
    const key = reason.slice(0, 40);
    const last = rejectionsNoted.get(key);
    if (last !== undefined && now - last < REJECTION_NOTE_MS) return;
    rejectionsNoted.set(key, now);
    await commitServerMutations([{
        type: "update",
        path: PADDLE_STATUS_PATH,
        data: { lastRejectedAt: new Date(now), lastRejectedReason: key },
        updateFields: ["lastRejectedAt", "lastRejectedReason"],
    }]).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Checkout failures browsers report (POST /api/paddle/client-error)
// ---------------------------------------------------------------------------

/** C0/C1 control characters and the invisible marks (zero-width, bidi) that could disguise text in the panel. */
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
const EMAIL_LIKE = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,}/gi;
const REPORT_CODE = /^[a-z0-9_]{1,80}$/;

/** One line of plain text without control characters or e-mail addresses, at most `max` characters. */
export function reportText(value: unknown, max: number) {
    if (typeof value !== "string") return "";
    return value.replace(UNSAFE_CHARACTERS, " ").replace(EMAIL_LIKE, "[e-mail]").replace(/\s+/g, " ").trim().slice(0, max);
}

/** An https address as origin and path only (its query could carry ids), or null. */
function reportUrl(value: unknown) {
    if (typeof value !== "string" || !value.trim() || value.length > 4_000) return null;
    try {
        const url = new URL(value.replace(UNSAFE_CHARACTERS, "").trim());
        return url.protocol === "https:" ? reportText(`${url.origin}${url.pathname}`, 300) || null : null;
    } catch {
        return null;
    }
}

export type PaddleClientErrorReport = Pick<PaddleClientError, "stage" | "message" | "blockedUrl" | "code">;

/**
 * The body of POST /api/paddle/client-error, cleaned: a known stage (null
 * otherwise), the message on one line (300 characters), an https blocked
 * address (300) and Paddle's error code ([a-z0-9_], 80); anything else is dropped.
 */
export function normalizeClientErrorReport(body: unknown): PaddleClientErrorReport | null {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const record = body as Record<string, unknown>;
    if (!isPaddleClientErrorStage(record.stage)) return null;
    const code = typeof record.code === "string" ? record.code.trim().toLowerCase() : "";
    return {
        stage: record.stage,
        message: reportText(record.message, 300),
        blockedUrl: reportUrl(record.blockedUrl),
        code: REPORT_CODE.test(code) ? code : null,
    };
}

/** Engines that also name Chrome or Safari come first; Brave can't be told from Chrome. */
const BROWSERS: Array<[name: string, pattern: RegExp]> = [
    ["Edge", /\bEdg(?:e|A|iOS)?\/(\d{1,4})/],
    ["Opera", /\b(?:OPR|OPT|Opera)\/(\d{1,4})/],
    ["Samsung Internet", /\bSamsungBrowser\/(\d{1,4})/],
    ["Yandex", /\bYaBrowser\/(\d{1,4})/],
    ["Firefox", /\b(?:Firefox|FxiOS)\/(\d{1,4})/],
    ["Chrome", /\b(?:CriOS|Chrome|Chromium)\/(\d{1,4})/],
    ["Safari", /\bVersion\/(\d{1,4})[\d.]*\s.*\bSafari\//],
];

/** A short browser label from a User-Agent ("Chrome 141", "Safari 18"), "Other" when it's none of the known ones. */
export function browserLabel(userAgent: string | null | undefined) {
    const agent = (userAgent ?? "").slice(0, 512);
    for (const [name, pattern] of BROWSERS) {
        const major = pattern.exec(agent)?.[1];
        if (major) return `${name} ${Number(major)}`;
    }
    return "Other";
}

/** Stored reports read back, newest first; malformed entries are left out. */
export function normalizePaddleClientErrors(value: unknown): PaddleClientError[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): PaddleClientError[] => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        const at = isoOrNull(entry.at);
        const environment = entry.environment === "sandbox" || entry.environment === "production" ? entry.environment : null;
        if (!at || !environment || !isPaddleClientErrorStage(entry.stage)) return [];
        return [{
            at,
            stage: entry.stage,
            message: reportText(entry.message, 300),
            blockedUrl: reportUrl(entry.blockedUrl),
            code: typeof entry.code === "string" && REPORT_CODE.test(entry.code) ? entry.code : null,
            browser: reportText(entry.browser, 40) || "Other",
            environment,
        }];
    }).slice(0, PADDLE_CLIENT_ERRORS_MAX);
}

/** Puts a report first in site_config/paddle_status.clientErrors (the newest ten are kept). Who sent it isn't stored. */
export async function recordPaddleClientError(report: PaddleClientErrorReport & { browser: string }, now = new Date()): Promise<PaddleClientError> {
    const entry: PaddleClientError = {
        at: now.toISOString(),
        stage: report.stage,
        message: reportText(report.message, 300),
        blockedUrl: reportUrl(report.blockedUrl),
        code: report.code && REPORT_CODE.test(report.code) ? report.code : null,
        browser: reportText(report.browser, 40) || "Other",
        environment: currentPaddleEnvironment(),
    };
    await prependStatusEntry("clientErrors", entry, normalizePaddleClientErrors, PADDLE_CLIENT_ERRORS_MAX);
    return entry;
}

/**
 * Puts `entry` first in one list of site_config/paddle_status, keeping the
 * newest `max`. Read and written with the document's update time as
 * precondition, so concurrent reports and the webhook's notes can't undo each
 * other; a conflict means reading again.
 */
async function prependStatusEntry<T>(field: "clientErrors" | "serverErrors", entry: T, normalize: (value: unknown) => T[], max: number, repeats?: (newest: T) => boolean) {
    for (let attempt = 1; ; attempt += 1) {
        const record = await getServerDocument<Record<string, unknown>>(PADDLE_STATUS_PATH);
        const current = normalize(record?.[field]);
        // The same failure again a moment later (a page asking every few seconds) adds nothing.
        if (repeats && current[0] && repeats(current[0])) return;
        const list = [entry, ...current].slice(0, max);
        const write = record
            ? { type: "update" as const, path: PADDLE_STATUS_PATH, data: { [field]: list }, updateFields: [field], ...(record._updateTime ? { updateTime: record._updateTime } : {}) }
            : { type: "create" as const, path: PADDLE_STATUS_PATH, data: { [field]: list } };
        try {
            await commitServerMutations([write]);
            return;
        } catch (error) {
            if (!isWriteConflict(error) || attempt >= 4) throw error;
        }
    }
}

// ---------------------------------------------------------------------------
// Billing requests that failed on the server (checkout, subscription actions)
// ---------------------------------------------------------------------------

const ROUTE_NAME = /^[a-z][a-z:_]{0,39}$/;

/** Paddle's explanation or an error message, fit for the panel: one line, no e-mail addresses, 200 characters. */
export function failureDetail(value: unknown) {
    return reportText(value, 200);
}

/** Stored failures read back, newest first; malformed entries are left out. */
export function normalizePaddleServerErrors(value: unknown): PaddleServerError[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): PaddleServerError[] => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        const at = isoOrNull(entry.at);
        const environment = entry.environment === "sandbox" || entry.environment === "production" ? entry.environment : null;
        const status = Number(entry.status);
        const code = typeof entry.code === "string" ? entry.code : "";
        if (!at || !environment || !Number.isInteger(status) || status < 400 || status > 599 || !REPORT_CODE.test(code)) return [];
        const paddleStatus = entry.paddleStatus === null || entry.paddleStatus === undefined ? null : Number(entry.paddleStatus);
        const ms = Number(entry.ms);
        return [{
            at,
            route: typeof entry.route === "string" && ROUTE_NAME.test(entry.route) ? entry.route : "checkout",
            step: isBillingStep(entry.step) ? entry.step : null,
            status,
            paddleStatus: paddleStatus !== null && Number.isInteger(paddleStatus) && paddleStatus >= 0 && paddleStatus <= 599 ? paddleStatus : null,
            code,
            detail: failureDetail(entry.detail),
            ms: Number.isFinite(ms) && ms >= 0 ? Math.min(Math.round(ms), 3_600_000) : 0,
            environment,
        }];
    }).slice(0, PADDLE_SERVER_ERRORS_MAX);
}

/** A failure inside a billing route, with the step it happened in. */
export class BillingStepError extends Error {
    readonly step: BillingStep;
    readonly original: unknown;
    // No parameter properties: the plain-Node tests strip types and can't run them.
    constructor(step: BillingStep, original: unknown) {
        super(original instanceof Error ? original.message : String(original));
        this.name = "BillingStepError";
        this.step = step;
        this.original = original;
    }
}

/** Runs one step of a billing route; if it fails, the error names the step. */
export async function billingStep<T>(step: BillingStep, run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        throw error instanceof BillingStepError ? error : new BillingStepError(step, error);
    }
}

/** Steps that only read our database. */
const DATABASE_STEPS: ReadonlySet<BillingStep> = new Set(["catalog", "settings", "subscription"]);

export type BillingFailure = {
    /**
     * 424 when Paddle refused or couldn't be reached, 500 when our side failed.
     * Never 502 or 504: Cloudflare, in front of the site, replaces those
     * answers with its own error page and the JSON with the reason is lost.
     */
    status: 424 | 500;
    error: "paddle_error" | "unavailable";
    step: BillingStep | null;
    code: string;
    paddleStatus: number | null;
    detail: string;
};

/**
 * Refusals people can act on (a declined card, a customer that can't be
 * linked): answered with their own code and status instead of "Paddle
 * refused, try again", and not kept as server errors.
 */
const BILLING_ANSWERS: Readonly<Record<string, { status: 402 | 409; error: "payment_declined" | "customer_conflict" | "customer_unverified" }>> = {
    subscription_payment_declined: { status: 402, error: "payment_declined" },
    customer_linked_elsewhere: { status: 409, error: "customer_conflict" },
    customer_unverified: { status: 409, error: "customer_unverified" },
};

export function billingAnswer(error: unknown) {
    const cause = error instanceof BillingStepError ? error.original : error;
    return cause instanceof PaddleApiError ? BILLING_ANSWERS[cause.code] ?? null : null;
}

/** What went wrong in a billing route, in the terms the Plans page and Admin › Subscriptions use. */
export function describeBillingFailure(error: unknown): BillingFailure {
    const step = error instanceof BillingStepError ? error.step : null;
    const cause = error instanceof BillingStepError ? error.original : error;
    if (cause instanceof PaddleApiError) {
        return { status: 424, error: "paddle_error", step, code: cause.code, paddleStatus: cause.status, detail: failureDetail(cause.detail || cause.message) };
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    const database = (step !== null && DATABASE_STEPS.has(step)) || /^(?:Firestore|Firebase)\b/.test(message);
    return { status: 500, error: "unavailable", step, code: database ? "database_error" : "internal_error", paddleStatus: null, detail: failureDetail(message) };
}

/** Puts a failure first in site_config/paddle_status.serverErrors (the newest ten are kept); whose request it was isn't stored. */
export async function recordPaddleServerError(failure: Omit<PaddleServerError, "at" | "environment">, now = new Date()): Promise<PaddleServerError> {
    const [entry] = normalizePaddleServerErrors([{ ...failure, at: now.toISOString(), environment: currentPaddleEnvironment() }]);
    if (!entry) throw new Error("Invalid billing failure.");
    const repeats = (newest: PaddleServerError) => newest.route === entry.route && newest.step === entry.step && newest.code === entry.code
        && newest.environment === entry.environment && now.getTime() - Date.parse(newest.at) < SERVER_ERROR_REPEAT_MS;
    await prependStatusEntry("serverErrors", entry, normalizePaddleServerErrors, PADDLE_SERVER_ERRORS_MAX, repeats);
    return entry;
}

/** A failure identical to the newest one within this long isn't listed again. */
const SERVER_ERROR_REPEAT_MS = 60_000;

// ---------------------------------------------------------------------------
// Signed custom data: which account a checkout was opened for
// ---------------------------------------------------------------------------

function linkSecret(env: Env = process.env) {
    return cleanValue(env.PADDLE_LINK_SECRET) ?? cleanValue(env.NEXTAUTH_SECRET) ?? cleanValue(env.AUTH_SECRET) ?? "";
}

function linkSignature(email: string, plan: PaidPlanId, secret: string) {
    return createHmac("sha256", secret).update(`hanogt-paddle:v1:${email}:${plan}`).digest("hex").slice(0, 40);
}

/** custom_data attached to checkouts we create; null when no secret is configured. */
export function accountLinkData(email: string, plan: PaidPlanId, env: Env = process.env) {
    const secret = linkSecret(env);
    if (!secret) return null;
    return { hanogt_account: email, hanogt_plan: plan, hanogt_sig: linkSignature(email, plan, secret) };
}

/** The account and plan in custom_data, when the signature is ours. */
export function verifyAccountLink(customData: unknown, env: Env = process.env): { email: string; plan: PaidPlanId } | null {
    if (!customData || typeof customData !== "object") return null;
    const record = customData as Record<string, unknown>;
    const secret = linkSecret(env);
    const email = normalizeEmail(record.hanogt_account);
    const plan = record.hanogt_plan;
    const signature = record.hanogt_sig;
    if (!secret || !email || (plan !== "plus" && plan !== "pro") || typeof signature !== "string" || !/^[0-9a-f]{40}$/.test(signature)) return null;
    const expected = Buffer.from(linkSignature(email, plan, secret), "hex");
    return timingSafeEqual(Buffer.from(signature, "hex"), expected) ? { email, plan } : null;
}

// ---------------------------------------------------------------------------
// Settings: which Paddle prices sell which plan
// ---------------------------------------------------------------------------

export const PADDLE_SETTINGS_PATH = "site_config/paddle";
export const PADDLE_STATUS_PATH = "site_config/paddle_status";
export const customerPath = (customerId: string) => `paddle_customers/${customerId}`;
export const unlinkedPath = (subscriptionId: string) => `paddle_unlinked/${subscriptionId}`;
export const cleanupPath = (subscriptionId: string) => `paddle_cleanup/${subscriptionId}`;

export type PaddlePlanPrices = Record<PaidPlanId, Record<BillingInterval, string | null>>;
/**
 * One environment's part of site_config/paddle, which is laid out as
 * { sandbox: { prices, products }, production: { prices, products }, updatedAt, updatedBy }:
 * sandbox and live are separate Paddle accounts with different ids.
 */
export type PaddleSettings = {
    /** The prices the Plans page sells. */
    prices: PaddlePlanPrices;
    /**
     * Off by default: only staff and PADDLE_TESTER_EMAILS can buy, so the keys
     * can be tested on the real site before the owner opens sales to everyone.
     */
    salesOpen: boolean;
    /**
     * Products whose subscriptions unlock each plan. Prices the owner replaces
     * keep their product here, so people already subscribed keep their plan.
     */
    products: Record<PaidPlanId, string[]>;
    updatedAt: string | null;
    updatedBy: string | null;
};

export const EMPTY_PLAN_PRICES: PaddlePlanPrices = { plus: { month: null, year: null }, pro: { month: null, year: null } };

export function normalizePaddleSettings(record: Record<string, unknown> | null, environment: PaddleEnvironment): PaddleSettings {
    const scoped = record?.[environment] && typeof record[environment] === "object" ? record[environment] as Record<string, unknown> : {};
    const prices = scoped.prices && typeof scoped.prices === "object" ? scoped.prices as Record<string, unknown> : {};
    const products = scoped.products && typeof scoped.products === "object" ? scoped.products as Record<string, unknown> : {};
    const priceOf = (plan: PaidPlanId, interval: BillingInterval) => {
        const entry = prices[plan] && typeof prices[plan] === "object" ? (prices[plan] as Record<string, unknown>)[interval] : null;
        return isPaddleId("price", entry) ? entry : null;
    };
    const productsOf = (plan: PaidPlanId) => (Array.isArray(products[plan]) ? (products[plan] as unknown[]).filter((id): id is string => isPaddleId("product", id)).slice(0, 20) : []);
    return {
        prices: {
            plus: { month: priceOf("plus", "month"), year: priceOf("plus", "year") },
            pro: { month: priceOf("pro", "month"), year: priceOf("pro", "year") },
        },
        products: { plus: productsOf("plus"), pro: productsOf("pro") },
        salesOpen: scoped.salesOpen === true,
        updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : null,
        updatedBy: typeof record?.updatedBy === "string" ? record.updatedBy : null,
    };
}

let settingsCache: { at: number; environment: PaddleEnvironment; settings: PaddleSettings } | null = null;

/** The price mapping of the environment the keys belong to. */
export async function getPaddleSettings(fresh = false): Promise<PaddleSettings> {
    const environment = getPaddleConfig().environment;
    if (!fresh && settingsCache?.environment === environment && Date.now() - settingsCache.at < 60_000) return settingsCache.settings;
    const settings = normalizePaddleSettings(await getServerDocument<Record<string, unknown>>(PADDLE_SETTINGS_PATH), environment);
    settingsCache = { at: Date.now(), environment, settings };
    return settings;
}

/**
 * Write for one environment's settings (the other environment is left as it
 * is). Pass the complete settings: the environment's part is replaced whole.
 */
export function paddleSettingsMutation(environment: PaddleEnvironment, settings: Pick<PaddleSettings, "prices" | "products" | "salesOpen">, actor: string) {
    return {
        type: "update" as const,
        path: PADDLE_SETTINGS_PATH,
        data: { [environment]: { prices: settings.prices, products: settings.products, salesOpen: settings.salesOpen === true }, updatedAt: new Date(), updatedBy: actor },
        updateFields: [environment, "updatedAt", "updatedBy"],
    };
}

/** People who may buy while sales are closed: staff, plus PADDLE_TESTER_EMAILS (comma-separated). */
export function isBillingTester(email: string | null | undefined, isStaff: boolean, env: Env = process.env) {
    if (isStaff) return true;
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    const testers = (cleanValue(env.PADDLE_TESTER_EMAILS) ?? "").split(/[\s,;]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    return testers.includes(normalized);
}

export function forgetPaddleCaches() {
    settingsCache = null;
    ipsCache = null;
    pricingCache.clear();
    rejectionsNoted.clear();
}

export function intervalOf(cycle: BillingCycle): BillingInterval | null {
    if (!cycle) return null;
    if (cycle.interval === "month" && cycle.frequency === 1) return "month";
    if ((cycle.interval === "year" && cycle.frequency === 1) || (cycle.interval === "month" && cycle.frequency === 12)) return "year";
    return null;
}

function customPlan(data: Record<string, unknown> | null | undefined): PaidPlanId | null {
    const value = data?.hanogt_plan;
    return value === "plus" || value === "pro" ? value : null;
}

/**
 * The plan a Paddle price unlocks: a price on sale in our settings, then the
 * price's own custom data, then its product. A product listed under both plans
 * (one Paddle product holding the Plus and the Pro prices) says nothing about
 * a price that has been replaced since: only the price's custom data or the
 * product's own can tell then. Otherwise a grandfathered Pro subscriber on an
 * old price would be stored as Plus.
 */
export function planOfPrice(price: PaddlePriceEntity | undefined, settings: PaddleSettings): PaidPlanId | null {
    if (!price) return null;
    for (const plan of PAID_PLAN_IDS) {
        if (BILLING_INTERVALS.some((interval) => settings.prices[plan][interval] === price.id)) return plan;
    }
    const own = customPlan(price.custom_data);
    if (own) return own;
    const listed = PAID_PLAN_IDS.filter((plan) => settings.products[plan].includes(price.product_id));
    if (listed.length === 1) return listed[0];
    return customPlan(price.product?.custom_data);
}

/** Paddle's status as we store it; an unknown future status unlocks nothing until we learn what it means. */
export function paddleStatusOf(status: unknown): PaddleStatus {
    return (PADDLE_STATUSES as readonly unknown[]).includes(status) ? status as PaddleStatus : "paused";
}

const normalizeStatus = paddleStatusOf;

function isoOrNull(value: unknown) {
    if (typeof value !== "string") return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** The state we store for a Paddle subscription. */
export function subscriptionStateOf(entity: PaddleSubscriptionEntity, settings: PaddleSettings, signedPlan: PaidPlanId | null = null, now = new Date(), environment: PaddleEnvironment = getPaddleConfig().environment): PaddleSubscriptionState {
    const items = Array.isArray(entity.items) ? entity.items : [];
    const priced = items.map((item) => ({ item, plan: planOfPrice(item.price ? { ...item.price, product: item.price.product ?? item.product } : undefined, settings) }));
    const chosen = priced.find((entry) => entry.plan) ?? priced[0];
    const price = chosen?.item.price;
    const change = entity.scheduled_change;
    const changeAction = change?.action === "cancel" || change?.action === "pause" || change?.action === "resume" ? change.action : null;
    const changeAt = isoOrNull(change?.effective_at);
    return {
        environment,
        subscriptionId: entity.id,
        customerId: entity.customer_id,
        status: normalizeStatus(entity.status),
        plan: chosen?.plan ?? signedPlan,
        interval: intervalOf(price?.billing_cycle ?? entity.billing_cycle),
        priceId: typeof price?.id === "string" ? price.id : "",
        productId: typeof price?.product_id === "string" ? price.product_id : "",
        currentPeriodEnd: isoOrNull(entity.current_billing_period?.ends_at),
        nextBilledAt: isoOrNull(entity.next_billed_at),
        scheduledChange: changeAction && changeAt ? { action: changeAction, effectiveAt: changeAt } : null,
        canceledAt: isoOrNull(entity.canceled_at),
        paddleUpdatedAt: isoOrNull(entity.updated_at),
        syncedAt: now.toISOString(),
    };
}

const PLAN_RANK: Record<string, number> = { plus: 1, pro: 2 };

function newerOrSame(next: string | null, current: string | null) {
    if (!next || !current) return true;
    return Date.parse(next) >= Date.parse(current);
}

/**
 * Whether `next` should replace what is stored. A copy read from the API is
 * always current for its subscription; a notification payload only wins if it
 * isn't older. Across subscriptions, one that unlocks a plan beats one that
 * doesn't, so a late "canceled" for an old subscription can't undo a new one.
 */
export function shouldReplaceState(current: PaddleSubscriptionState | null, next: PaddleSubscriptionState, nextIsFresh: boolean, now = Date.now()) {
    if (!current) return true;
    if (current.subscriptionId === next.subscriptionId) return nextIsFresh || newerOrSame(next.paddleUpdatedAt, current.paddleUpdatedAt);
    const currentLive = paddleEntitles(current, now);
    const nextLive = paddleEntitles(next, now);
    if (currentLive !== nextLive) return nextLive;
    if (currentLive && nextLive && next.plan !== current.plan) return (PLAN_RANK[next.plan ?? ""] ?? 0) > (PLAN_RANK[current.plan ?? ""] ?? 0);
    return newerOrSame(next.paddleUpdatedAt, current.paddleUpdatedAt);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const PLAN_NAMES: Record<PaidPlanId, string> = { plus: "Plus", pro: "Pro" };

/**
 * In-app notifications for what changed. Their ids are fixed per subscription
 * and event, so a notification Paddle delivers twice still appears once.
 * The text is stored in Turkish; NotificationCenter shows `kind` translated.
 */
export function billingNotifications(email: string, previous: PaddleSubscriptionState | null, next: PaddleSubscriptionState, now = new Date()) {
    const same = previous?.subscriptionId === next.subscriptionId ? previous : null;
    const nowMs = now.getTime();
    const wasLive = Boolean(same && paddleEntitles(same, nowMs));
    const isLive = paddleEntitles(next, nowMs);
    const planName = next.plan ? PLAN_NAMES[next.plan] : "";
    const events: Array<{ kind: BillingNotificationKind; id: string; title: string; body: string; date?: string | null }> = [];
    if (isLive && !wasLive && next.status !== "past_due") {
        events.push({ kind: "active", id: `billing_${next.subscriptionId}_active`, title: `Planın etkin: ${planName}`, body: "Teşekkürler! Plan avantajların açıldı." });
    } else if (isLive && wasLive && same && same.plan !== next.plan && next.plan) {
        events.push({ kind: "changed", id: `billing_${next.subscriptionId}_plan_${next.plan}_${next.interval ?? "x"}`, title: `Planın değişti: ${planName}`, body: "Yeni planının avantajları hemen geçerli." });
    }
    if (next.scheduledChange?.action === "cancel" && same?.scheduledChange?.action !== "cancel" && next.status !== "canceled") {
        events.push({ kind: "cancel", id: `billing_${next.subscriptionId}_cancel_${next.scheduledChange.effectiveAt.slice(0, 10)}`, title: "Aboneliğin sona erecek", body: "Plan avantajların dönem sonuna kadar sürer.", date: next.scheduledChange.effectiveAt });
    }
    if (next.status === "past_due" && same?.status !== "past_due") {
        events.push({ kind: "pastdue", id: `billing_${next.subscriptionId}_pastdue_${(next.currentPeriodEnd ?? "").slice(0, 10)}`, title: "Ödeme alınamadı", body: "Ödeme yöntemini Planlar sayfasından güncelleyebilirsin." });
    }
    if (next.status === "canceled" && same && same.status !== "canceled") {
        events.push({ kind: "ended", id: `billing_${next.subscriptionId}_ended`, title: "Aboneliğin sona erdi", body: "Ücretsiz plana geçtin. İstediğin zaman yeniden abone olabilirsin." });
    }
    return events.map((event) => ({
        type: "update" as const,
        path: `notifications/${email}/items/${event.id}`,
        data: {
            type: "billing",
            kind: event.kind,
            plan: next.plan,
            date: event.date ?? null,
            title: event.title,
            body: event.body,
            actionUrl: "/plans",
            read: false,
            createdAt: now,
        },
    }));
}

// ---------------------------------------------------------------------------
// Storing a subscription on the account
// ---------------------------------------------------------------------------

/** Firestore-safe copy of the state (no undefined values). */
function storedState(state: PaddleSubscriptionState) {
    return { ...state, scheduledChange: state.scheduledChange ? { ...state.scheduledChange } : null };
}

export type StoreOutcome = "stored" | "kept";

/** Writes the state to subscriptions/{email}, re-reading on write conflicts. */
export async function storeSubscriptionState(email: string, state: PaddleSubscriptionState, options: { fresh: boolean }): Promise<StoreOutcome> {
    const path = subscriptionPath(email);
    for (let attempt = 1; ; attempt += 1) {
        const record = await getServerDocument<Record<string, unknown>>(path);
        const stored = normalizePaddleState(record?.paddle);
        const current = stored?.environment === state.environment ? stored : null;
        if (!shouldReplaceState(current, state, options.fresh)) return "kept";
        const now = new Date();
        const write = record
            ? {
                type: "update" as const,
                path,
                data: { paddle: storedState(state), paddleCustomerId: state.customerId, paddleEnvironment: state.environment, updatedAt: now },
                updateFields: ["paddle", "paddleCustomerId", "paddleEnvironment", "updatedAt"],
                ...(record._updateTime ? { updateTime: record._updateTime } : {}),
            }
            : {
                type: "create" as const,
                path,
                data: { plan: "free", status: "active", aiBonusDaily: 0, aiBonusUntil: null, email, createdAt: now, paddle: storedState(state), paddleCustomerId: state.customerId, paddleEnvironment: state.environment, updatedAt: now },
            };
        try {
            await commitServerMutations([write, ...billingNotifications(email, current, state, now)]);
        } catch (error) {
            if (!isWriteConflict(error) || attempt >= 3) throw error;
            continue;
        }
        // The profile's Plus / Pro badge follows the new state (best effort).
        await syncPlanBadgeQuietly(email);
        return "stored";
    }
}

// ---------------------------------------------------------------------------
// Which account a subscription belongs to
// ---------------------------------------------------------------------------

type AccountMatch =
    | { kind: "account"; email: string; signedPlan: PaidPlanId | null }
    | { kind: "deleted" }
    | { kind: "unknown" };

async function userExists(email: string) {
    return Boolean(await getServerDocument(`users/${email}`));
}

/**
 * 1. paddle_customers/{customer}: written when we create the customer at
 *    checkout (or by staff linking it); a deleted account leaves a tombstone.
 * 2. Our signed custom data, e.g. when Paddle reused an existing customer.
 */
export async function accountForSubscription(entity: Pick<PaddleSubscriptionEntity, "customer_id" | "custom_data">): Promise<AccountMatch> {
    const signed = verifyAccountLink(entity.custom_data);
    const mapping = isPaddleId("customer", entity.customer_id) ? await getServerDocument<Record<string, unknown>>(customerPath(entity.customer_id)) : null;
    if (mapping?.deleted === true) return { kind: "deleted" };
    const mapped = normalizeEmail(mapping?.email);
    if (mapped) {
        if (!(await userExists(mapped))) return { kind: "deleted" };
        return { kind: "account", email: mapped, signedPlan: signed?.email === mapped ? signed.plan : null };
    }
    if (signed && isPaddleId("customer", entity.customer_id) && (await userExists(signed.email))) {
        await rememberCustomer(entity.customer_id, signed.email, "checkout");
        return { kind: "account", email: signed.email, signedPlan: signed.plan };
    }
    return { kind: "unknown" };
}

/** Links a Paddle customer to an account both ways. */
export async function rememberCustomer(customerId: string, email: string, via: "checkout" | "staff") {
    const now = new Date();
    const environment = getPaddleConfig().environment;
    await commitServerMutations([
        { type: "update", path: customerPath(customerId), data: { email, environment, deleted: false, linkedAt: now, via }, updateFields: ["email", "environment", "deleted", "deletedAt", "linkedAt", "via"] },
        { type: "update", path: subscriptionPath(email), data: { paddleCustomerId: customerId, paddleEnvironment: environment, updatedAt: now }, updateFields: ["paddleCustomerId", "paddleEnvironment", "updatedAt"] },
    ]);
}

// ---------------------------------------------------------------------------
// Sync: Paddle → subscriptions/{email}
// ---------------------------------------------------------------------------

export type SyncResult =
    | { status: "stored" | "kept"; email: string; state: PaddleSubscriptionState }
    | { status: "unlinked" }
    | { status: "canceled_for_deleted_account" };

/**
 * Brings one subscription up to date. `entity` is a copy the API just
 * returned; `fallback` (a notification payload) is only used when the API
 * can't be reached.
 */
export async function syncSubscription(subscriptionId: string, options: { entity?: PaddleSubscriptionEntity; fallback?: PaddleSubscriptionEntity } = {}): Promise<SyncResult> {
    let entity = options.entity ?? null;
    let fresh = Boolean(entity);
    if (!entity) {
        try {
            entity = (await paddleRequest<{ data: PaddleSubscriptionEntity }>("GET", `/subscriptions/${subscriptionId}`)).data;
            fresh = true;
        } catch (error) {
            if (!options.fallback) throw error;
            entity = options.fallback;
        }
    }
    if (!entity || entity.id !== subscriptionId) throw new PaddleApiError(0, "unexpected_response");

    const account = await accountForSubscription(entity);
    if (account.kind === "deleted") {
        if (normalizeStatus(entity.status) !== "canceled") {
            try {
                await cancelSubscriptionNow(subscriptionId);
            } catch (error) {
                await recordCleanup(subscriptionId, entity.customer_id, "deleted_account").catch(() => undefined);
                throw error;
            }
        }
        return { status: "canceled_for_deleted_account" };
    }
    const settings = await getPaddleSettings();
    if (account.kind === "unknown") {
        const state = subscriptionStateOf(entity, settings);
        await commitServerMutations([{
            type: "update",
            path: unlinkedPath(subscriptionId),
            data: { subscriptionId, environment: state.environment, customerId: state.customerId, status: state.status, plan: state.plan, priceId: state.priceId, productId: state.productId, seenAt: new Date() },
        }]);
        return { status: "unlinked" };
    }
    const state = subscriptionStateOf(entity, settings, account.signedPlan);
    const status = await storeSubscriptionState(account.email, state, { fresh });
    return { status, email: account.email, state };
}

async function recordCleanup(subscriptionId: string, customerId: string, reason: string) {
    await commitServerMutations([{
        type: "update",
        path: cleanupPath(subscriptionId),
        data: { subscriptionId, customerId: isPaddleId("customer", customerId) ? customerId : null, reason, at: new Date() },
    }]);
}

export type PaddleEvent = { event_id?: unknown; event_type?: unknown; occurred_at?: unknown; data?: unknown };

/** Webhook entry point (after the signature check). Throws when Paddle should retry. */
export async function handlePaddleEvent(event: PaddleEvent): Promise<string> {
    const type = typeof event.event_type === "string" ? event.event_type : "";
    let result = "failed";
    try {
        result = await processPaddleEvent(type, event.data);
        return result;
    } catch (error) {
        result = `failed:${error instanceof PaddleApiError ? error.code : error instanceof Error && isWriteConflict(error) ? "conflict" : "error"}`;
        throw error;
    } finally {
        // Written after processing, with its outcome: a delivery that arrived but couldn't be processed must not look fine in the panel.
        await commitServerMutations([{
            type: "update",
            path: PADDLE_STATUS_PATH,
            data: {
                lastEventAt: new Date(),
                lastEventType: type.slice(0, 60),
                lastEventId: typeof event.event_id === "string" ? event.event_id.slice(0, 80) : null,
                lastEventResult: result.slice(0, 60),
            },
            updateFields: ["lastEventAt", "lastEventType", "lastEventId", "lastEventResult"],
        }]).catch(() => undefined);
    }
}

async function processPaddleEvent(type: string, payload: unknown): Promise<string> {
    const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
    if (type.startsWith("subscription.")) {
        if (!data || !isPaddleId("subscription", data.id) || !isPaddleId("customer", data.customer_id)) return "ignored";
        return (await syncSubscription(data.id, { fallback: data as unknown as PaddleSubscriptionEntity })).status;
    }
    if (type === "transaction.completed" || type === "transaction.paid") {
        if (!data || !isPaddleId("subscription", data.subscription_id)) return "ignored";
        return (await syncSubscription(data.subscription_id)).status;
    }
    return "ignored";
}

// ---------------------------------------------------------------------------
// Customers, checkouts and changes
// ---------------------------------------------------------------------------

/** A customer Paddle says already exists was created this recently by the account's other tab (a double click). */
const RACE_WINDOW_MS = 5 * 60_000;

async function createdMomentsAgo(customerId: string, now = Date.now()) {
    const { data } = await paddleRequest<{ data?: { id?: string; created_at?: string } }>("GET", `/customers/${customerId}`).catch(() => ({ data: undefined }));
    const created = Date.parse(data?.id === customerId ? data.created_at ?? "" : "");
    return Number.isFinite(created) && now - created >= 0 && now - created <= RACE_WINDOW_MS;
}

/**
 * The person's Paddle customer: the account's own, Paddle's by e-mail, or a new one.
 * - A known customer id is used only while paddle_customers links it to this
 *   account: after staff linked it to someone else, the old account must not
 *   buy for them, and a deleted account's customer isn't reused silently.
 * - A customer Paddle finds by the e-mail address that no account (or a deleted
 *   one) is linked to is linked only when the account's address is verified
 *   (`verified`: signed in with Google). A password sign-up proves nothing about
 *   the address, and the link would open that customer's invoices, address,
 *   payment method and subscriptions to the account.
 * `created`: the customer is new, so it can't have a subscription yet.
 */
export async function ensureCustomer(email: string, known: string | null, options: { verified: boolean }): Promise<{ customerId: string; created: boolean }> {
    if (known && isPaddleId("customer", known)) {
        const mapping = await getServerDocument<Record<string, unknown>>(customerPath(known));
        if (mapping?.deleted !== true && normalizeEmail(mapping?.email) === email) return { customerId: known, created: false };
        if (!mapping) {
            // Our own record names it but its link was never written: restore the link.
            await rememberCustomer(known, email, "checkout");
            return { customerId: known, created: false };
        }
        // Linked to another account, or left by a deleted one: look the address up like for a new buyer.
    }
    const found = await paddleRequest<{ data?: Array<{ id?: string; email?: string }> }>("GET", `/customers?email=${encodeURIComponent(email)}`);
    let customerId = (found.data ?? []).find((customer) => customer.email?.toLowerCase() === email && isPaddleId("customer", customer.id))?.id ?? null;
    let created = false;
    if (!customerId) {
        try {
            customerId = (await paddleRequest<{ data: { id: string } }>("POST", "/customers", { email })).data.id;
            created = true;
        } catch (error) {
            // Created meanwhile: Paddle names the existing customer.
            const existing = error instanceof PaddleApiError && error.status === 409 ? /ctm_[a-z0-9]{10,64}/.exec(error.detail)?.[0] : null;
            if (!existing) throw error;
            customerId = existing;
            created = await createdMomentsAgo(existing);
        }
    }
    if (!isPaddleId("customer", customerId)) throw new PaddleApiError(0, "unexpected_response");
    const mapping = await getServerDocument<Record<string, unknown>>(customerPath(customerId));
    const mapped = normalizeEmail(mapping?.email);
    const live = mapping?.deleted !== true;
    if (mapped && mapped !== email && live) throw new PaddleApiError(409, "customer_linked_elsewhere");
    const ours = live && mapped === email;
    if (!ours && !created && !options.verified) throw new PaddleApiError(409, "customer_unverified");
    if (!ours) await rememberCustomer(customerId, email, "checkout");
    return { customerId, created };
}

/** A checkout for one plan, opened in the browser with Paddle.js. */
export async function createCheckoutTransaction(input: { email: string; plan: PaidPlanId; priceId: string; customerId: string; discountId?: string | null }) {
    const link = accountLinkData(input.email, input.plan);
    const response = await paddleRequest<{ data: { id: string } }>("POST", "/transactions", {
        items: [{ price_id: input.priceId, quantity: 1 }],
        customer_id: input.customerId,
        collection_mode: "automatic",
        // A coupon the Plans page accepted: Paddle shows it applied in the checkout.
        ...(input.discountId && isPaddleId("discount", input.discountId) ? { discount_id: input.discountId } : {}),
        ...(link ? { custom_data: link } : {}),
    });
    if (!isPaddleId("transaction", response.data?.id)) throw new PaddleApiError(0, "unexpected_response");
    return { transactionId: response.data.id };
}

/**
 * A plan change takes effect now with the difference prorated. In a free
 * trial nothing can be billed yet: Paddle accepts only do_not_bill then, and
 * the first payment is the trial's end at the new price.
 */
const changeBody = (priceId: string, trialing: boolean) => ({
    items: [{ price_id: priceId, quantity: 1 }],
    proration_billing_mode: trialing ? "do_not_bill" : "prorated_immediately",
});

type Money = { amount?: string; currency_code?: string } | null | undefined;
type PreviewEntity = PaddleSubscriptionEntity & {
    currency_code?: string;
    immediate_transaction?: { details?: { totals?: { grand_total?: string; total?: string; currency_code?: string } } } | null;
    next_transaction?: { details?: { totals?: { grand_total?: string; total?: string } } } | null;
    update_summary?: { result?: { action?: string; amount?: string; currency_code?: string } } & { charge?: Money; credit?: Money } | null;
};

/** What a plan change would cost now (prorated), before the person confirms it. */
export async function previewPlanChange(subscriptionId: string, priceId: string, trialing = false): Promise<PlanChangePreview> {
    const { data } = await paddleRequest<{ data: PreviewEntity }>("PATCH", `/subscriptions/${subscriptionId}/preview`, changeBody(priceId, trialing));
    const result = data.update_summary?.result;
    const currency = result?.currency_code ?? data.immediate_transaction?.details?.totals?.currency_code ?? data.currency_code ?? "USD";
    const immediate = data.immediate_transaction?.details?.totals;
    const raw = result?.amount ?? immediate?.grand_total ?? immediate?.total ?? "0";
    const amount = /^\d+$/.test(raw) ? raw : "0";
    const next = data.next_transaction?.details?.totals;
    const nextAmount = next?.grand_total ?? next?.total ?? null;
    return {
        amount,
        currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
        result: Number(amount) <= 0 ? "none" : result?.action === "credit" ? "credit" : "charge",
        nextBilledAt: isoOrNull(data.next_billed_at),
        nextAmount: nextAmount && /^\d+$/.test(nextAmount) ? nextAmount : null,
        trialing,
    };
}

export async function applyPlanChange(subscriptionId: string, priceId: string, trialing = false) {
    const { data } = await paddleRequest<{ data: PaddleSubscriptionEntity }>("PATCH", `/subscriptions/${subscriptionId}`, changeBody(priceId, trialing));
    return syncSubscription(subscriptionId, { entity: data });
}

/**
 * Resumes a paused subscription now. `continuePeriod`: the paid period hasn't
 * ended, so it simply carries on and nothing is charged; otherwise Paddle
 * starts a new period today and bills it at once (Paddle's default).
 */
export async function resumeSubscription(subscriptionId: string, continuePeriod: boolean) {
    const { data } = await paddleRequest<{ data: PaddleSubscriptionEntity }>("POST", `/subscriptions/${subscriptionId}/resume`, {
        effective_from: "immediately",
        on_resume: continuePeriod ? "continue_existing_billing_period" : "start_new_billing_period",
    });
    return syncSubscription(subscriptionId, { entity: data });
}

/** Undoes a cancellation the person scheduled. */
export async function keepSubscription(subscriptionId: string) {
    const { data } = await paddleRequest<{ data: PaddleSubscriptionEntity }>("PATCH", `/subscriptions/${subscriptionId}`, { scheduled_change: null });
    return syncSubscription(subscriptionId, { entity: data });
}

export async function cancelSubscriptionNow(subscriptionId: string) {
    return paddleRequest<{ data: PaddleSubscriptionEntity }>("POST", `/subscriptions/${subscriptionId}/cancel`, { effective_from: "immediately" });
}

/** Short-lived, signed-in links to Paddle's customer portal. */
export async function portalLinks(customerId: string, subscriptionId: string | null) {
    const { data } = await paddleRequest<{ data: { urls?: { general?: { overview?: string }; subscriptions?: Array<{ id?: string; cancel_subscription?: string; update_subscription_payment_method?: string }> } } }>(
        "POST",
        `/customers/${customerId}/portal-sessions`,
        subscriptionId ? { subscription_ids: [subscriptionId] } : {},
    );
    const deep = data.urls?.subscriptions?.find((entry) => entry.id === subscriptionId) ?? data.urls?.subscriptions?.[0];
    const https = (value: unknown) => (typeof value === "string" && value.startsWith("https://") ? value : null);
    const overview = https(data.urls?.general?.overview);
    if (!overview) throw new PaddleApiError(0, "unexpected_response");
    return { overview, cancel: https(deep?.cancel_subscription), updatePayment: https(deep?.update_subscription_payment_method) };
}

const STATUS_RANK: Record<PaddleStatus, number> = { active: 0, trialing: 1, past_due: 2, paused: 3, canceled: 4 };

/**
 * Subscriptions in the order a sync should try them: those that unlock a plan
 * first (the higher plan first), then by status (active, trialing, past due,
 * paused, ended), then the most recently updated. One that is active but sold
 * through a price no plan claims comes after one that unlocks a plan.
 */
export function rankCandidates(entities: readonly PaddleSubscriptionEntity[], settings: PaddleSettings, now = Date.now()) {
    return entities
        .map((entity) => {
            const state = subscriptionStateOf(entity, settings, verifyAccountLink(entity.custom_data)?.plan ?? null, new Date(now));
            return {
                entity,
                unlocks: paddleEntitles(state, now) ? 1 : 0,
                plan: PLAN_RANK[state.plan ?? ""] ?? 0,
                status: STATUS_RANK[state.status],
                updated: Date.parse(entity.updated_at ?? "") || 0,
            };
        })
        // Among those that unlock a plan the higher plan wins; among the rest a live one (still billing) comes first.
        .sort((a, b) => b.unlocks - a.unlocks || (a.unlocks ? b.plan - a.plan || a.status - b.status : a.status - b.status || b.plan - a.plan) || b.updated - a.updated)
        .map((entry) => entry.entity);
}

/** The person's subscriptions at Paddle, most useful first (rankCandidates). */
export async function customerSubscriptions(customerId: string, now = Date.now()) {
    const { data } = await paddleRequest<{ data?: PaddleSubscriptionEntity[] }>("GET", `/subscriptions?customer_id=${customerId}&per_page=50`);
    const entities = (data ?? []).filter((entity) => isPaddleId("subscription", entity.id) && entity.customer_id === customerId);
    return rankCandidates(entities, await getPaddleSettings(), now);
}

// ---------------------------------------------------------------------------
// Prices for the Plans page
// ---------------------------------------------------------------------------

const PRICING_TTL_MS = 10 * 60_000;
const PRICING_FAILURE_TTL_MS = 60_000;
export const DEFAULT_PRICING_COUNTRY = "TR";
const pricingCache = new Map<string, { at: number; ttl: number; value: Promise<Map<string, Omit<PaddlePriceView, "interval">>> }>();

function trialDaysOf(cycle: BillingCycle) {
    if (!cycle?.frequency || !cycle.interval) return null;
    const days = { day: 1, week: 7, month: 30, year: 365 }[cycle.interval as "day" | "week" | "month" | "year"];
    return days ? days * cycle.frequency : null;
}

type PricingPreview = {
    data?: {
        currency_code?: string;
        details?: { line_items?: Array<{ price?: PaddlePriceEntity; totals?: { total?: string }; formatted_totals?: { total?: string } }> };
    };
};

async function fetchPricing(priceIds: string[], country: string) {
    const response = await paddleRequest<PricingPreview>("POST", "/pricing-preview", {
        items: priceIds.map((price_id) => ({ price_id, quantity: 1 })),
        address: { country_code: country },
    });
    const currency = response.data?.currency_code ?? "";
    const prices = new Map<string, Omit<PaddlePriceView, "interval">>();
    for (const line of response.data?.details?.line_items ?? []) {
        const id = line.price?.id;
        const total = line.formatted_totals?.total;
        const amount = line.totals?.total;
        if (!isPaddleId("price", id) || typeof total !== "string" || typeof amount !== "string" || !/^[A-Z]{3}$/.test(currency)) continue;
        prices.set(id, { priceId: id, total: total.slice(0, 40), amount, currency, trialDays: trialDaysOf(line.price?.trial_period) });
    }
    return prices;
}

/** Localised prices (Paddle adds taxes and picks the currency for the country); cached per country. */
export async function pricingFor(priceIds: string[], country: string | null) {
    const code = country && /^[A-Z]{2}$/.test(country) ? country : DEFAULT_PRICING_COUNTRY;
    const key = `${code}:${[...priceIds].sort().join(",")}`;
    const cached = pricingCache.get(key);
    if (cached && Date.now() - cached.at < cached.ttl) return cached.value;
    const value = fetchPricing(priceIds, code).catch(async (error) => {
        // Countries Paddle doesn't sell to still see the regular prices.
        if (code !== DEFAULT_PRICING_COUNTRY && error instanceof PaddleApiError && error.status >= 400 && error.status < 500) return fetchPricing(priceIds, DEFAULT_PRICING_COUNTRY);
        throw error;
    });
    const entry = { at: Date.now(), ttl: PRICING_TTL_MS, value };
    pricingCache.set(key, entry);
    value.catch(() => {
        entry.ttl = PRICING_FAILURE_TTL_MS;
    });
    if (pricingCache.size > 300) pricingCache.delete(pricingCache.keys().next().value!);
    return value;
}

/**
 * What the Plans page needs: null until Paddle is set up. Plans that aren't
 * "Visible" or have no Paddle price stay "coming soon"; if Paddle can't be
 * asked for prices the plans remain buyable and the checkout shows the amount.
 */
export async function checkoutConfigFor(catalog: PlanCatalog, country: string | null, viewer: { tester: boolean } = { tester: false }): Promise<PaddleCheckoutConfig | null> {
    const config = getPaddleConfig();
    if (!isPaddleConfigured(config) || !config.clientToken) return null;
    const settings = await getPaddleSettings();
    // Closed sales: everyone else sees "coming soon" (subscribers can still manage theirs).
    const selling = settings.salesOpen || viewer.tester;
    const wanted = PAID_PLAN_IDS.flatMap((plan) => (selling && catalog.plans[plan].visible
        ? BILLING_INTERVALS.flatMap((interval) => {
            const priceId = settings.prices[plan][interval];
            return priceId ? [{ plan, interval, priceId }] : [];
        })
        : []));
    const onSale: PaddleCheckoutConfig["onSale"] = { plus: [], pro: [] };
    for (const entry of wanted) onSale[entry.plan].push(entry.interval);
    const prices: PaddleCheckoutConfig["prices"] = { plus: {}, pro: {} };
    let pricesUnavailable = false;
    if (wanted.length) {
        try {
            const pricing = await pricingFor(wanted.map((entry) => entry.priceId), country);
            for (const entry of wanted) {
                const price = pricing.get(entry.priceId);
                if (price) prices[entry.plan][entry.interval] = { ...price, interval: entry.interval };
            }
        } catch (error) {
            pricesUnavailable = true;
            console.error("[paddle:pricing]", error instanceof PaddleApiError ? `${error.status || "network"} ${error.code}` : error);
        }
    }
    return { environment: config.environment, clientToken: config.clientToken, onSale, prices, pricesUnavailable, salesOpen: settings.salesOpen, testMode: !settings.salesOpen && viewer.tester };
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/**
 * Ends billing for an account being deleted: every subscription of its Paddle
 * customer that isn't over yet is cancelled at once (the stored one, and any
 * other the customer has: an unrecorded purchase or a second subscription),
 * and the customer link becomes a tombstone, so anything Paddle sends later
 * for that customer is cancelled too. Returns how many were cancelled and an
 * error message (never containing the e-mail) when Paddle couldn't be reached
 * for some; staff then find them in paddle_cleanup.
 */
export async function releaseBillingForDeletion(record: Record<string, unknown> | null): Promise<{ canceled: number; error: string | null }> {
    const environment = getPaddleConfig().environment;
    const stored = normalizePaddleState(record?.paddle);
    // A subscription of the other environment (e.g. a sandbox test) can't be reached with these keys; nothing is billed there.
    const state = stored?.environment === environment ? stored : null;
    const linked = isPaddleId("customer", record?.paddleCustomerId) ? record.paddleCustomerId : null;
    const customerHere = (linked && record?.paddleEnvironment === environment ? linked : null) ?? state?.customerId ?? null;
    const customerId = linked ?? stored?.customerId ?? null;
    const describe = (failure: unknown) => (failure instanceof PaddleApiError ? `${failure.status || "network"} ${failure.code}` : "failed");
    const targets = new Map<string, string>();
    if (state && state.status !== "canceled") targets.set(state.subscriptionId, state.customerId);
    let canceled = 0;
    let error: string | null = null;
    if (getPaddleConfig().apiKey && customerHere) {
        try {
            for (const entity of await customerSubscriptions(customerHere)) {
                if (normalizeStatus(entity.status) !== "canceled") targets.set(entity.id, entity.customer_id);
            }
        } catch (failure) {
            // The stored one is still cancelled below; the tombstone catches the rest when Paddle next reports them.
            error = `Paddle abonelikleri listelenemedi (${describe(failure)})`;
        }
    }
    for (const [subscriptionId, owner] of targets) {
        try {
            if (!getPaddleConfig().apiKey) throw new PaddleApiError(0, "not_configured");
            await cancelSubscriptionNow(subscriptionId);
            canceled += 1;
        } catch (failure) {
            // Paddle refuses to cancel what is already cancelled; check before reporting it.
            const current = failure instanceof PaddleApiError && failure.status >= 400 && failure.status < 500
                ? await paddleRequest<{ data: PaddleSubscriptionEntity }>("GET", `/subscriptions/${subscriptionId}`).catch(() => null)
                : null;
            if (current?.data?.status === "canceled") continue;
            error = `Paddle aboneliği iptal edilemedi (${describe(failure)})`;
            await recordCleanup(subscriptionId, owner, "account_deleted");
        }
    }
    if (customerId) {
        await commitServerMutations([{
            type: "update",
            path: customerPath(customerId),
            data: { deleted: true, deletedAt: new Date() },
            updateFields: ["email", "deleted", "deletedAt", "linkedAt", "via"],
        }]);
    }
    return { canceled, error };
}
