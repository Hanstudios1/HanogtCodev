import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
    BILLING_INTERVALS,
    ENTITLED_STATUSES,
    PADDLE_STATUSES,
    isPaddleId,
    normalizePaddleState,
    paddleEntitles,
    type BillingInterval,
    type PaddleCheckoutConfig,
    type PaddleEnvironment,
    type PaddlePriceView,
    type PaddleStatus,
    type PaddleSubscriptionState,
    type PlanChangePreview,
} from "@/lib/paddle";
import { PAID_PLAN_IDS, type PaidPlanId, type PlanCatalog } from "@/lib/plans";
import { commitServerMutations, getServerDocument, isWriteConflict } from "./firebase-rest";
import { subscriptionPath } from "./plans";
import { normalizeEmail } from "./validate";

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
// Configuration
// ---------------------------------------------------------------------------

const API_BASES: Record<PaddleEnvironment, string> = {
    sandbox: "https://sandbox-api.paddle.com",
    production: "https://api.paddle.com",
};

export type PaddleConfigWarning =
    /** The API key and the client-side token belong to different environments. */
    | "key_token_mismatch"
    /** NEXT_PUBLIC_PADDLE_ENV disagrees with the keys (the keys win). */
    | "environment_override_ignored"
    /** A secret was put in a NEXT_PUBLIC_ variable, which ships it to every browser. */
    | "public_secret"
    /** The client-side token looks like an API key. */
    | "token_is_api_key"
    | "api_key_format"
    | "client_token_format"
    | "webhook_secret_format";

export type PaddleConfig = {
    apiKey: string | null;
    clientToken: string | null;
    webhookSecret: string | null;
    environment: PaddleEnvironment;
    apiBase: string;
    warnings: PaddleConfigWarning[];
};

type Env = Record<string, string | undefined>;

/** Trims whitespace and the quotes people paste around values in dashboards. */
function cleanValue(value: string | undefined | null) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
    return trimmed || null;
}

function firstOf(env: Env, names: readonly string[]) {
    for (const name of names) {
        const value = cleanValue(env[name]);
        if (value) return value;
    }
    return null;
}

function keyEnvironment(apiKey: string | null): PaddleEnvironment | null {
    if (!apiKey) return null;
    if (apiKey.startsWith("pdl_sdbx_")) return "sandbox";
    if (apiKey.startsWith("pdl_live_")) return "production";
    return null;
}

function tokenEnvironment(token: string | null): PaddleEnvironment | null {
    if (!token) return null;
    if (token.startsWith("test_")) return "sandbox";
    if (token.startsWith("live_")) return "production";
    return null;
}

function explicitEnvironment(env: Env): PaddleEnvironment | null {
    const value = firstOf(env, ["NEXT_PUBLIC_PADDLE_ENV", "PADDLE_ENVIRONMENT", "PADDLE_ENV"])?.toLowerCase();
    if (value === "sandbox" || value === "test") return "sandbox";
    if (value === "production" || value === "live" || value === "prod") return "production";
    return null;
}

/** Loopback-only override of the API address, for tests and local end-to-end runs. */
function apiBaseOverride(env: Env) {
    const value = cleanValue(env.PADDLE_API_BASE_URL);
    if (!value) return null;
    try {
        const url = new URL(value);
        const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
        return loopback && (url.protocol === "http:" || url.protocol === "https:") ? url.origin : null;
    } catch {
        return null;
    }
}

export function getPaddleConfig(env: Env = process.env): PaddleConfig {
    const apiKey = firstOf(env, ["PADDLE_API_KEY", "PADDLE_SECRET_KEY"]);
    const clientToken = firstOf(env, ["NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "PADDLE_CLIENT_TOKEN", "NEXT_PUBLIC_PADDLE_TOKEN"]);
    const webhookSecret = firstOf(env, ["PADDLE_WEBHOOK_SECRET", "PADDLE_NOTIFICATION_WEBHOOK_SECRET", "PADDLE_WEBHOOK_SECRET_KEY"]);
    const fromKey = keyEnvironment(apiKey);
    const fromToken = tokenEnvironment(clientToken);
    const explicit = explicitEnvironment(env);
    const environment = fromKey ?? fromToken ?? explicit ?? "production";

    const warnings: PaddleConfigWarning[] = [];
    if (fromKey && fromToken && fromKey !== fromToken) warnings.push("key_token_mismatch");
    if (explicit && (fromKey ?? fromToken) && explicit !== (fromKey ?? fromToken)) warnings.push("environment_override_ignored");
    if (cleanValue(env.NEXT_PUBLIC_PADDLE_API_KEY) || cleanValue(env.NEXT_PUBLIC_PADDLE_WEBHOOK_SECRET)) warnings.push("public_secret");
    if (clientToken?.startsWith("pdl_")) warnings.push("token_is_api_key");
    if (apiKey && !/^pdl_(sdbx|live)_apikey_[A-Za-z0-9_]{20,}$/.test(apiKey) && !/^[a-z0-9]{50}$/.test(apiKey)) warnings.push("api_key_format");
    if (clientToken && !clientToken.startsWith("pdl_") && !/^(test|live)_[A-Za-z0-9]{10,}$/.test(clientToken)) warnings.push("client_token_format");
    if (webhookSecret && !webhookSecret.startsWith("pdl_ntfset_")) warnings.push("webhook_secret_format");

    return { apiKey, clientToken, webhookSecret, environment, apiBase: apiBaseOverride(env) ?? API_BASES[environment], warnings };
}

/** Checkouts need the server key and the browser token. */
export function isPaddleConfigured(config: PaddleConfig = getPaddleConfig()) {
    return Boolean(config.apiKey && config.clientToken && !config.clientToken.startsWith("pdl_"));
}

/** Paddle's own dashboard, for links in the Admin Panel. */
export function paddleDashboardUrl(environment: PaddleEnvironment, path: string) {
    return `${environment === "sandbox" ? "https://sandbox-vendors.paddle.com" : "https://vendors.paddle.com"}${path}`;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export class PaddleApiError extends Error {
    constructor(public readonly status: number, public readonly code: string, public readonly detail = "") {
        super(`Paddle API ${status || "network"} ${code}`);
        this.name = "PaddleApiError";
    }
}

const REQUEST_TIMEOUT_MS = 10_000;

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
export type PaddleSettings = {
    /** The prices the Plans page sells. */
    prices: PaddlePlanPrices;
    /**
     * Products whose subscriptions unlock each plan. Prices the owner replaces
     * keep their product here, so people already subscribed keep their plan.
     */
    products: Record<PaidPlanId, string[]>;
    updatedAt: string | null;
    updatedBy: string | null;
};

export const EMPTY_PLAN_PRICES: PaddlePlanPrices = { plus: { month: null, year: null }, pro: { month: null, year: null } };

export function normalizePaddleSettings(record: Record<string, unknown> | null): PaddleSettings {
    const prices = record?.prices && typeof record.prices === "object" ? record.prices as Record<string, unknown> : {};
    const products = record?.products && typeof record.products === "object" ? record.products as Record<string, unknown> : {};
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
        updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : null,
        updatedBy: typeof record?.updatedBy === "string" ? record.updatedBy : null,
    };
}

let settingsCache: { at: number; settings: PaddleSettings } | null = null;

export async function getPaddleSettings(fresh = false): Promise<PaddleSettings> {
    if (!fresh && settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache.settings;
    const settings = normalizePaddleSettings(await getServerDocument<Record<string, unknown>>(PADDLE_SETTINGS_PATH));
    settingsCache = { at: Date.now(), settings };
    return settings;
}

export function forgetPaddleCaches() {
    settingsCache = null;
    pricingCache.clear();
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

/** The plan a Paddle price unlocks, from our settings or the custom data the owner set in Paddle. */
export function planOfPrice(price: PaddlePriceEntity | undefined, settings: PaddleSettings): PaidPlanId | null {
    if (!price) return null;
    for (const plan of PAID_PLAN_IDS) {
        if (BILLING_INTERVALS.some((interval) => settings.prices[plan][interval] === price.id)) return plan;
    }
    for (const plan of PAID_PLAN_IDS) {
        if (settings.products[plan].includes(price.product_id)) return plan;
    }
    return customPlan(price.custom_data) ?? customPlan(price.product?.custom_data);
}

function normalizeStatus(status: unknown): PaddleStatus {
    // An unknown future status unlocks nothing until we learn what it means.
    return (PADDLE_STATUSES as readonly unknown[]).includes(status) ? status as PaddleStatus : "paused";
}

function isoOrNull(value: unknown) {
    if (typeof value !== "string") return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** The state we store for a Paddle subscription. */
export function subscriptionStateOf(entity: PaddleSubscriptionEntity, settings: PaddleSettings, signedPlan: PaidPlanId | null = null, now = new Date()): PaddleSubscriptionState {
    const items = Array.isArray(entity.items) ? entity.items : [];
    const priced = items.map((item) => ({ item, plan: planOfPrice(item.price ? { ...item.price, product: item.price.product ?? item.product } : undefined, settings) }));
    const chosen = priced.find((entry) => entry.plan) ?? priced[0];
    const price = chosen?.item.price;
    const change = entity.scheduled_change;
    const changeAction = change?.action === "cancel" || change?.action === "pause" || change?.action === "resume" ? change.action : null;
    const changeAt = isoOrNull(change?.effective_at);
    return {
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

export type BillingNotificationKind = "active" | "changed" | "cancel" | "pastdue" | "ended";

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
        const current = normalizePaddleState(record?.paddle);
        if (!shouldReplaceState(current, state, options.fresh)) return "kept";
        const now = new Date();
        const write = record
            ? {
                type: "update" as const,
                path,
                data: { paddle: storedState(state), paddleCustomerId: state.customerId, updatedAt: now },
                updateFields: ["paddle", "paddleCustomerId", "updatedAt"],
                ...(record._updateTime ? { updateTime: record._updateTime } : {}),
            }
            : {
                type: "create" as const,
                path,
                data: { plan: "free", status: "active", aiBonusDaily: 0, aiBonusUntil: null, email, createdAt: now, paddle: storedState(state), paddleCustomerId: state.customerId, updatedAt: now },
            };
        try {
            await commitServerMutations([write, ...billingNotifications(email, current, state, now)]);
            return "stored";
        } catch (error) {
            if (!isWriteConflict(error) || attempt >= 3) throw error;
        }
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
    await commitServerMutations([
        { type: "update", path: customerPath(customerId), data: { email, deleted: false, linkedAt: now, via }, updateFields: ["email", "deleted", "deletedAt", "linkedAt", "via"] },
        { type: "update", path: subscriptionPath(email), data: { paddleCustomerId: customerId, updatedAt: now }, updateFields: ["paddleCustomerId", "updatedAt"] },
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
            data: { subscriptionId, customerId: state.customerId, status: state.status, plan: state.plan, priceId: state.priceId, productId: state.productId, seenAt: new Date() },
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
    await commitServerMutations([{
        type: "update",
        path: PADDLE_STATUS_PATH,
        data: { lastEventAt: new Date(), lastEventType: type.slice(0, 60), lastEventId: typeof event.event_id === "string" ? event.event_id.slice(0, 80) : null },
    }]).catch(() => undefined);
    const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : null;
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

/** The person's Paddle customer: ours if we know it, Paddle's by e-mail, or a new one. */
export async function ensureCustomer(email: string, known: string | null): Promise<string> {
    if (known && isPaddleId("customer", known)) return known;
    const found = await paddleRequest<{ data?: Array<{ id?: string; email?: string }> }>("GET", `/customers?email=${encodeURIComponent(email)}`);
    let customerId = (found.data ?? []).find((customer) => customer.email?.toLowerCase() === email && isPaddleId("customer", customer.id))?.id ?? null;
    if (!customerId) {
        try {
            customerId = (await paddleRequest<{ data: { id: string } }>("POST", "/customers", { email })).data.id;
        } catch (error) {
            // Created meanwhile (another tab): Paddle names the existing customer.
            const existing = error instanceof PaddleApiError && error.status === 409 ? /ctm_[a-z0-9]{10,64}/.exec(error.detail)?.[0] : null;
            if (!existing) throw error;
            customerId = existing;
        }
    }
    if (!isPaddleId("customer", customerId)) throw new PaddleApiError(0, "unexpected_response");
    const mapping = await getServerDocument<Record<string, unknown>>(customerPath(customerId));
    const mapped = normalizeEmail(mapping?.email);
    if (mapped && mapped !== email && mapping?.deleted !== true) throw new PaddleApiError(409, "customer_linked_elsewhere");
    await rememberCustomer(customerId, email, "checkout");
    return customerId;
}

/** A checkout for one plan, opened in the browser with Paddle.js. */
export async function createCheckoutTransaction(input: { email: string; plan: PaidPlanId; priceId: string; customerId: string }) {
    const link = accountLinkData(input.email, input.plan);
    const response = await paddleRequest<{ data: { id: string } }>("POST", "/transactions", {
        items: [{ price_id: input.priceId, quantity: 1 }],
        customer_id: input.customerId,
        collection_mode: "automatic",
        ...(link ? { custom_data: link } : {}),
    });
    if (!isPaddleId("transaction", response.data?.id)) throw new PaddleApiError(0, "unexpected_response");
    return { transactionId: response.data.id };
}

const CHANGE_BODY = (priceId: string) => ({ items: [{ price_id: priceId, quantity: 1 }], proration_billing_mode: "prorated_immediately" });

type Money = { amount?: string; currency_code?: string } | null | undefined;
type PreviewEntity = PaddleSubscriptionEntity & {
    currency_code?: string;
    immediate_transaction?: { details?: { totals?: { grand_total?: string; total?: string; currency_code?: string } } } | null;
    next_transaction?: { details?: { totals?: { grand_total?: string; total?: string } } } | null;
    update_summary?: { result?: { action?: string; amount?: string; currency_code?: string } } & { charge?: Money; credit?: Money } | null;
};

/** What a plan change would cost now (prorated), before the person confirms it. */
export async function previewPlanChange(subscriptionId: string, priceId: string): Promise<PlanChangePreview> {
    const { data } = await paddleRequest<{ data: PreviewEntity }>("PATCH", `/subscriptions/${subscriptionId}/preview`, CHANGE_BODY(priceId));
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
    };
}

export async function applyPlanChange(subscriptionId: string, priceId: string) {
    const { data } = await paddleRequest<{ data: PaddleSubscriptionEntity }>("PATCH", `/subscriptions/${subscriptionId}`, CHANGE_BODY(priceId));
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

/** The person's subscriptions at Paddle, most useful first. */
export async function customerSubscriptions(customerId: string) {
    const { data } = await paddleRequest<{ data?: PaddleSubscriptionEntity[] }>("GET", `/subscriptions?customer_id=${customerId}&per_page=50`);
    const rank = (entity: PaddleSubscriptionEntity) => (ENTITLED_STATUSES.includes(normalizeStatus(entity.status)) ? 0 : entity.status === "paused" ? 1 : 2);
    return (data ?? []).filter((entity) => isPaddleId("subscription", entity.id)).sort((a, b) => rank(a) - rank(b));
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
 * What the Plans page needs to sell: null until Paddle is set up and at
 * least one visible plan has a price (then the page shows "coming soon").
 */
export async function checkoutConfigFor(catalog: PlanCatalog, country: string | null): Promise<PaddleCheckoutConfig | null> {
    const config = getPaddleConfig();
    if (!isPaddleConfigured(config) || !config.clientToken) return null;
    const settings = await getPaddleSettings();
    const wanted = PAID_PLAN_IDS.flatMap((plan) => (catalog.plans[plan].visible
        ? BILLING_INTERVALS.flatMap((interval) => {
            const priceId = settings.prices[plan][interval];
            return priceId ? [{ plan, interval, priceId }] : [];
        })
        : []));
    if (!wanted.length) return null;
    const pricing = await pricingFor(wanted.map((entry) => entry.priceId), country);
    const prices: PaddleCheckoutConfig["prices"] = { plus: {}, pro: {} };
    for (const entry of wanted) {
        const price = pricing.get(entry.priceId);
        if (price) prices[entry.plan][entry.interval] = { ...price, interval: entry.interval };
    }
    if (!Object.keys(prices.plus).length && !Object.keys(prices.pro).length) return null;
    return { environment: config.environment, clientToken: config.clientToken, prices };
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/**
 * Ends billing for an account being deleted: the subscription is cancelled
 * at once and the customer link becomes a tombstone, so anything Paddle sends
 * later for that customer is cancelled too. Returns an error message (never
 * containing the e-mail) when Paddle couldn't be reached; staff then find the
 * subscription in paddle_cleanup.
 */
export async function releaseBillingForDeletion(record: Record<string, unknown> | null): Promise<{ canceled: boolean; error: string | null }> {
    const state = normalizePaddleState(record?.paddle);
    const customerId = isPaddleId("customer", record?.paddleCustomerId) ? record.paddleCustomerId : state?.customerId ?? null;
    let canceled = false;
    let error: string | null = null;
    if (state && state.status !== "canceled") {
        try {
            if (!getPaddleConfig().apiKey) throw new PaddleApiError(0, "not_configured");
            await cancelSubscriptionNow(state.subscriptionId);
            canceled = true;
        } catch (failure) {
            // Paddle refuses to cancel what is already cancelled; check before reporting it.
            const current = failure instanceof PaddleApiError && failure.status >= 400 && failure.status < 500
                ? await paddleRequest<{ data: PaddleSubscriptionEntity }>("GET", `/subscriptions/${state.subscriptionId}`).catch(() => null)
                : null;
            if (current?.data?.status === "canceled") {
                canceled = true;
            } else {
                const code = failure instanceof PaddleApiError ? `${failure.status || "network"} ${failure.code}` : "failed";
                error = `Paddle aboneliği iptal edilemedi (${code})`;
                await recordCleanup(state.subscriptionId, state.customerId, "account_deleted");
            }
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
