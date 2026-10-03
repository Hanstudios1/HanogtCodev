import "server-only";

import { createHash } from "node:crypto";
import type { AdminErrorCode, AdminPaddleCatalogReport, AdminPaddleClientTokenCheck, AdminPaddlePrice, AdminPaddleUnlinked, AdminUserPlanResponse } from "@/components/Admin/types";
import { BILLING_INTERVALS, isPaddleId, type BillingInterval, type PaddleClientError, type PaddleEnvironment } from "@/lib/paddle";
import { PAID_PLAN_IDS, PLAN_COPY, aiLimitsFor, effectivePlan, planSource, type PaidPlanId } from "@/lib/plans";
import { commitServerMutations, getServerDocument, runServerQuery } from "./firebase-rest";
import {
    EMPTY_PLAN_PRICES,
    PADDLE_SETTINGS_PATH,
    PADDLE_STATUS_PATH,
    PaddleApiError,
    customerPath,
    customerSubscriptions,
    forgetPaddleCaches,
    getPaddleConfig,
    getPaddleSettings,
    intervalOf,
    normalizePaddleClientErrors,
    normalizePaddleSettings,
    paddleDashboardUrl,
    paddleRequest,
    paddleSettingsMutation,
    rememberCustomer,
    syncSubscription,
    unlinkedPath,
    type PaddleConfig,
    type PaddlePlanPrices,
    type PaddlePriceEntity,
    type PaddleSettings,
    type PaddleSubscriptionEntity,
    type SyncResult,
} from "./paddle";
import { aiUsage, normalizeSubscription, subscriptionPath } from "./plans";
import { normalizeEmail } from "./validate";

/*
 * Paddle for Admin › Subscriptions: the price mapping and the sales gate of
 * the configured environment, creating the catalog, subscriptions no account
 * could be matched to, re-syncing a person, coupons as Paddle discounts and
 * whether the client-side token belongs to the API key's Paddle account.
 * Kept free of next/server (and of ./admin) so the plain-Node tests can load
 * it; the route turns PaddleAdminError into admin errors.
 */

export type { AdminPaddlePrice };

type Mutations = Parameters<typeof commitServerMutations>[0];
type Pagination = { next?: string | null; has_more?: boolean } | null | undefined;
type ListResponse<T> = { data?: T[]; meta?: { pagination?: Pagination } };
type PaddleProductEntity = { id?: string; name?: string; status?: string; custom_data?: Record<string, unknown> | null };

const PAGES_MAX = 3;
const PRODUCTS_MAX = 20;
/** Ids per request when Paddle is asked about several entities at once. */
const IDS_PER_REQUEST = 50;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type PaddleAdminErrorCode = Extract<AdminErrorCode, "invalid_price_id" | "price_mismatch" | "already_linked" | "user_not_found" | "invalid_id">;

const ERROR_STATUS: Record<PaddleAdminErrorCode, number> = {
    invalid_price_id: 400,
    price_mismatch: 400,
    invalid_id: 400,
    user_not_found: 404,
    already_linked: 409,
};

export class PaddleAdminError extends Error {
    readonly code: PaddleAdminErrorCode;
    // No parameter properties: the plain-Node tests strip types and can't run them.
    constructor(code: PaddleAdminErrorCode) {
        super(code);
        this.name = "PaddleAdminError";
        this.code = code;
    }
}

/**
 * The admin API answer for a failure of this module or of the Paddle API
 * (null for anything else): a missing API key is a setup problem (409), any
 * other Paddle failure a bad gateway (502).
 */
export function paddleAdminFailure(error: unknown): { status: number; code: AdminErrorCode } | null {
    if (error instanceof PaddleAdminError) return { status: ERROR_STATUS[error.code], code: error.code };
    if (error instanceof PaddleApiError) return error.code === "not_configured" ? { status: 409, code: "paddle_unconfigured" } : { status: 502, code: "paddle_error" };
    return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isoOrNull(value: unknown) {
    if (typeof value !== "string" || !value) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function emptyPrices(): PaddlePlanPrices {
    return { plus: { ...EMPTY_PLAN_PRICES.plus }, pro: { ...EMPTY_PLAN_PRICES.pro } };
}

function copyPrices(prices: PaddlePlanPrices): PaddlePlanPrices {
    return { plus: { ...prices.plus }, pro: { ...prices.pro } };
}

/** Path and query of the next page Paddle points to (it sends a full URL, `after` included), if there is one. */
function nextPage(pagination: Pagination, expectedPath: string): string | null {
    if (!pagination?.next || pagination.has_more === false) return null;
    try {
        const url = new URL(pagination.next);
        return url.pathname === expectedPath ? `${url.pathname}${url.search}` : null;
    } catch {
        return null;
    }
}

/** A Paddle list, following its pages (at most three). */
async function listAll<T>(firstPath: string, expectedPath: string): Promise<T[]> {
    const items: T[] = [];
    let path: string | null = firstPath;
    for (let page = 0; path && page < PAGES_MAX; page += 1) {
        const response: ListResponse<T> = await paddleRequest<ListResponse<T>>("GET", path);
        items.push(...(response.data ?? []));
        path = nextPage(response.meta?.pagination, expectedPath);
    }
    return items;
}

function chunks<T>(values: readonly T[], size: number) {
    const result: T[][] = [];
    for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
    return result;
}

// ---------------------------------------------------------------------------
// Prices and the mapping
// ---------------------------------------------------------------------------

function customPlan(data: unknown): PaidPlanId | null {
    if (!isRecord(data)) return null;
    const value = typeof data.hanogt_plan === "string" ? data.hanogt_plan.trim().toLowerCase() : "";
    return value === "plus" || value === "pro" ? value : null;
}

const PLUS_WORD = /\bplus\b/i;
const PRO_WORD = /\bpro\b/i;

/**
 * The plan a Paddle price seems to sell: `hanogt_plan` in the price's or the
 * product's custom data, otherwise "Plus" or "Pro" as a whole word in the
 * product name (then the price's own name and description). A name with both
 * words suggests nothing; "Professional" isn't "Pro".
 */
export function suggestedPlanOf(price: Pick<PaddlePriceEntity, "custom_data" | "product" | "name" | "description">): PaidPlanId | null {
    const custom = customPlan(price.custom_data) ?? customPlan(price.product?.custom_data);
    if (custom) return custom;
    for (const name of [price.product?.name, price.name, price.description]) {
        if (typeof name !== "string" || !name.trim()) continue;
        const plus = PLUS_WORD.test(name);
        const pro = PRO_WORD.test(name);
        if (plus !== pro) return plus ? "plus" : "pro";
        if (plus) return null;
    }
    return null;
}

const DAYS_PER_UNIT: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

function trialDaysOf(cycle: PaddlePriceEntity["trial_period"]) {
    if (!cycle || typeof cycle.frequency !== "number" || cycle.frequency <= 0) return null;
    const days = DAYS_PER_UNIT[cycle.interval ?? ""];
    return days ? days * cycle.frequency : null;
}

/** A price as the panel lists it; null for one-time prices (they can't sell a subscription) and malformed entries. */
export function adminPriceOf(price: PaddlePriceEntity): AdminPaddlePrice | null {
    if (!isRecord(price) || !isPaddleId("price", price.id) || !isPaddleId("product", price.product_id)) return null;
    const cycle = price.billing_cycle;
    if (!cycle || typeof cycle.interval !== "string" || typeof cycle.frequency !== "number") return null;
    const amount = price.unit_price?.amount;
    const currency = price.unit_price?.currency_code;
    return {
        id: price.id,
        productId: price.product_id,
        productName: text(price.product?.name, 200),
        description: text(price.description || price.name, 200),
        interval: intervalOf(cycle),
        cycle: `${cycle.frequency} ${text(cycle.interval, 12)}`,
        amount: typeof amount === "string" && /^\d{1,18}$/.test(amount) ? amount : "0",
        currency: typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "",
        trialDays: trialDaysOf(price.trial_period),
        suggestedPlan: suggestedPlanOf(price),
    };
}

const PERIOD_ORDER = (price: AdminPaddlePrice) => (price.interval === "month" ? 0 : price.interval === "year" ? 1 : 2);

/** Active recurring prices with their products (up to three pages of 200), by product and period. */
export async function listPaddlePrices(): Promise<AdminPaddlePrice[]> {
    const prices = new Map<string, AdminPaddlePrice>();
    for (const entity of await listAll<PaddlePriceEntity>("/prices?status=active&include=product&per_page=200", "/prices")) {
        // An archived product can't be bought, whatever its prices say.
        if (entity?.product?.status === "archived") continue;
        const price = adminPriceOf(entity);
        if (price) prices.set(price.id, price);
    }
    return [...prices.values()].sort((a, b) => a.productName.localeCompare(b.productName) || PERIOD_ORDER(a) - PERIOD_ORDER(b) || Number(a.amount) - Number(b.amount) || a.id.localeCompare(b.id));
}

/** Fills a plan's monthly or yearly slot when exactly one price looks like it (see suggestedPlanOf). */
export function suggestPriceMapping(prices: readonly AdminPaddlePrice[]): PaddlePlanPrices {
    const result = emptyPrices();
    for (const plan of PAID_PLAN_IDS) {
        for (const interval of BILLING_INTERVALS) {
            const ids = new Set(prices.filter((price) => price.suggestedPlan === plan && price.interval === interval).map((price) => price.id));
            result[plan][interval] = ids.size === 1 ? [...ids][0] : null;
        }
    }
    return result;
}

/**
 * Checks a mapping sent by the panel ({ plus: { month, year }, pro: { … } }):
 * every slot is a pri_… id or empty and no price sells two slots. When the
 * active prices are known each one must be among them with the slot's
 * billing period; without the list (Paddle unreachable) only the form of the
 * ids can be checked.
 */
export function validatePriceMapping(input: unknown, known: readonly AdminPaddlePrice[] | null): PaddlePlanPrices {
    if (!isRecord(input)) throw new PaddleAdminError("invalid_price_id");
    const byId = known ? new Map(known.map((price) => [price.id, price])) : null;
    const result = emptyPrices();
    const used = new Set<string>();
    for (const plan of PAID_PLAN_IDS) {
        const slots = input[plan];
        if (!isRecord(slots)) throw new PaddleAdminError("invalid_price_id");
        for (const interval of BILLING_INTERVALS) {
            const raw = slots[interval];
            const value = typeof raw === "string" ? raw.trim() : raw;
            if (value === null || value === "") continue;
            if (!isPaddleId("price", value)) throw new PaddleAdminError("invalid_price_id");
            if (used.has(value)) throw new PaddleAdminError("price_mismatch");
            used.add(value);
            if (byId && byId.get(value)?.interval !== interval) throw new PaddleAdminError("price_mismatch");
            result[plan][interval] = value;
        }
    }
    return result;
}

/** One environment's part of site_config/paddle, written over what `record` held. */
function settingsWrite(record: Record<string, unknown> | null, environment: PaddleEnvironment, settings: Pick<PaddleSettings, "prices" | "products" | "salesOpen">, actor: string) {
    // Products and the sales gate are carried over from what was read: a concurrent write makes this one fail instead of being undone.
    return { ...paddleSettingsMutation(environment, settings, actor), ...(typeof record?._updateTime === "string" ? { updateTime: record._updateTime } : {}) };
}

/**
 * Stores one environment's mapping in site_config/paddle (the other one is
 * left alone: sandbox ids mean nothing live). The products of the chosen
 * prices, and of the prices they replace, join that environment's product
 * list for each plan, which is never shortened (beyond its cap), so people
 * subscribed at an earlier price keep their plan. `extraMutations` (the
 * audit entry) commit together with it.
 */
export async function savePaddlePrices(
    prices: PaddlePlanPrices,
    actor: string,
    known: readonly AdminPaddlePrice[] | null,
    extraMutations: Mutations = [],
    options: { environment?: PaddleEnvironment; products?: Partial<Record<PaidPlanId, readonly string[]>> } = {},
): Promise<PaddleSettings> {
    const environment = options.environment ?? getPaddleConfig().environment;
    const record = await getServerDocument<Record<string, unknown>>(PADDLE_SETTINGS_PATH);
    const current = normalizePaddleSettings(record, environment);
    const productOf = new Map((known ?? []).map((price) => [price.id, price.productId]));
    const productsIn = (mapping: PaddlePlanPrices, plan: PaidPlanId) => BILLING_INTERVALS.flatMap((interval) => {
        const product = productOf.get(mapping[plan][interval] ?? "");
        return product ? [product] : [];
    });
    const productsFor = (plan: PaidPlanId) => [...new Set([...(options.products?.[plan] ?? []), ...productsIn(prices, plan), ...productsIn(current.prices, plan), ...current.products[plan]])]
        .filter((id) => isPaddleId("product", id))
        .slice(0, PRODUCTS_MAX);
    const products = { plus: productsFor("plus"), pro: productsFor("pro") };
    await commitServerMutations([settingsWrite(record, environment, { prices, products, salesOpen: current.salesOpen }, actor), ...extraMutations]);
    forgetPaddleCaches();
    return { ...current, prices, products, updatedAt: new Date().toISOString(), updatedBy: actor };
}

/**
 * Opens or closes sales in an environment: closed, only staff and the
 * testers in PADDLE_TESTER_EMAILS see and buy plans. The mapping is kept.
 * Returns false when the gate already was in that position.
 */
export async function setSalesOpen(open: boolean, actor: string, extraMutations: Mutations = [], environment: PaddleEnvironment = getPaddleConfig().environment) {
    const record = await getServerDocument<Record<string, unknown>>(PADDLE_SETTINGS_PATH);
    const current = normalizePaddleSettings(record, environment);
    if (current.salesOpen === open) return false;
    await commitServerMutations([settingsWrite(record, environment, { prices: current.prices, products: current.products, salesOpen: open }, actor), ...extraMutations]);
    forgetPaddleCaches();
    return true;
}

export type PaddleWebhookStatus = {
    /** The last signed notification the webhook accepted. */
    lastEventAt: string | null;
    lastEventType: string | null;
    /** The last delivery it refused (e.g. "ip_not_allowed", "signature_mismatch"). */
    lastRejectedAt: string | null;
    lastRejectedReason: string | null;
};

/** site_config/paddle_status: the webhook's notes and the checkout failures browsers reported (newest first). */
export type PaddleStatusRecord = PaddleWebhookStatus & { clientErrors: PaddleClientError[] };

export const EMPTY_WEBHOOK_STATUS: PaddleStatusRecord = { lastEventAt: null, lastEventType: null, lastRejectedAt: null, lastRejectedReason: null, clientErrors: [] };

export async function readPaddleStatus(): Promise<PaddleStatusRecord> {
    const record = await getServerDocument<Record<string, unknown>>(PADDLE_STATUS_PATH);
    return {
        lastEventAt: isoOrNull(record?.lastEventAt),
        lastEventType: text(record?.lastEventType, 60) || null,
        lastRejectedAt: isoOrNull(record?.lastRejectedAt),
        lastRejectedReason: text(record?.lastRejectedReason, 40) || null,
        clientErrors: normalizePaddleClientErrors(record?.clientErrors),
    };
}

// ---------------------------------------------------------------------------
// The client-side token
// ---------------------------------------------------------------------------

type PaddleClientTokenEntity = { id?: string; token?: string; name?: string | null; status?: string };

/** Pages of 200 tokens read per status before giving up. */
const TOKEN_PAGES_MAX = 5;
const TOKEN_CHECK_TTL_MS = 10 * 60_000;
/** A failed check is repeated sooner. */
const TOKEN_CHECK_RETRY_MS = 60_000;
let tokenCheckCache: { key: string; at: number; ttl: number; value: Promise<AdminPaddleClientTokenCheck> } | null = null;

/** The entry for `token` among the account's client-side tokens with that status, if Paddle lists it. */
async function findClientToken(token: string, status: "active" | "revoked", config: PaddleConfig) {
    let path: string | null = `/client-tokens?status=${status}&per_page=200`;
    for (let page = 0; path && page < TOKEN_PAGES_MAX; page += 1) {
        const response: ListResponse<PaddleClientTokenEntity> = await paddleRequest<ListResponse<PaddleClientTokenEntity>>("GET", path, undefined, config);
        const found = (response.data ?? []).find((entry) => isRecord(entry) && entry.token === token);
        if (found) return found;
        path = nextPage(response.meta?.pagination, "/client-tokens");
    }
    return null;
}

async function runClientTokenCheck(config: PaddleConfig, token: string): Promise<AdminPaddleClientTokenCheck> {
    const checkedAt = new Date().toISOString();
    try {
        const active = await findClientToken(token, "active", config);
        if (active) return { result: active.status === "revoked" ? "revoked" : "active", code: null, name: text(active.name, 100) || null, checkedAt };
        const revoked = await findClientToken(token, "revoked", config);
        if (revoked) return { result: "revoked", code: null, name: text(revoked.name, 100) || null, checkedAt };
        return { result: "missing", code: null, name: null, checkedAt };
    } catch (error) {
        if (error instanceof PaddleApiError && (error.status === 403 || error.code === "forbidden")) return { result: "no_permission", code: error.code, name: null, checkedAt };
        const code = error instanceof PaddleApiError ? `${error.status || "network"} ${error.code}` : "unexpected";
        console.error("[admin:paddle:client-token]", code);
        return { result: "error", code, name: null, checkedAt };
    }
}

/**
 * Whether the client-side token the Plans page hands to Paddle.js is one of
 * the API key's Paddle account (GET /client-tokens, active ones first, then
 * revoked ones): "active", "revoked", "missing" (it belongs to another account
 * or to the other environment, so Paddle.js can't start with it),
 * "no_permission" (the key lacks client_token.read) or "error". Cached for ten
 * minutes, a failed check for one; null without an API key or a token.
 */
export function checkClientToken(config: PaddleConfig = getPaddleConfig()): Promise<AdminPaddleClientTokenCheck | null> {
    const token = config.clientToken;
    if (!config.apiKey || !token) return Promise.resolve(null);
    // Keyed by what was checked (hashed: no key material is kept as is), so new variables mean a new check.
    const key = createHash("sha256").update(`${config.apiBase}\n${config.apiKey}\n${token}`).digest("hex");
    const now = Date.now();
    if (tokenCheckCache?.key === key && now - tokenCheckCache.at < tokenCheckCache.ttl) return tokenCheckCache.value;
    const value = runClientTokenCheck(config, token);
    const entry = { key, at: now, ttl: TOKEN_CHECK_TTL_MS, value };
    tokenCheckCache = entry;
    void value.then((check) => {
        if (check.result === "error") entry.ttl = TOKEN_CHECK_RETRY_MS;
    });
    return value;
}

/** Drops the cached token check (tests, and after the variables changed). */
export function forgetClientTokenCheck() {
    tokenCheckCache = null;
}

// ---------------------------------------------------------------------------
// Creating the catalog in Paddle
// ---------------------------------------------------------------------------

/** What Plus and Pro cost in Paddle: US cents (yearly is ten months). */
export const EXPECTED_PRICES = {
    currency: "USD",
    plus: { month: 2_000, year: 20_000 },
    pro: { month: 10_000, year: 100_000 },
} as const;

const PRODUCT_NAMES: Record<PaidPlanId, string> = { plus: "Hanogt Codev Plus", pro: "Hanogt Codev Pro" };
const PRICE_NAMES: Record<BillingInterval, { name: string; tr: string }> = {
    month: { name: "Aylık / Monthly", tr: "aylık" },
    year: { name: "Yıllık / Yearly", tr: "yıllık" },
};

async function createProduct(plan: PaidPlanId) {
    const created = await paddleRequest<{ data?: { id?: string } }>("POST", "/products", {
        name: PRODUCT_NAMES[plan],
        tax_category: "standard",
        description: `${PLAN_COPY[plan].tagline.TR} / ${PLAN_COPY[plan].tagline.EN}`,
        custom_data: { hanogt_plan: plan },
    });
    const id = created.data?.id;
    if (!isPaddleId("product", id)) throw new PaddleApiError(0, "unexpected_response");
    return id;
}

/**
 * Creates what Plus and Pro are missing in Paddle — a product each (marked
 * with custom data hanogt_plan) and a monthly and a yearly USD price at
 * EXPECTED_PRICES — and maps the prices for the configured environment.
 * Additive only: nothing in Paddle is changed, archived or deleted, since it
 * may be the live account. A period whose existing price has another amount
 * or currency gets nothing new and is reported as a conflict for the owner.
 */
export async function ensurePaddleCatalog(actor: string, extraMutations: Mutations = []): Promise<AdminPaddleCatalogReport> {
    const environment = getPaddleConfig().environment;
    const [products, listed, settings] = await Promise.all([
        listAll<PaddleProductEntity>("/products?status=active&per_page=200", "/products"),
        listPaddlePrices(),
        getPaddleSettings(true),
    ]);
    const known = [...listed];
    const report: AdminPaddleCatalogReport = { environment, products: [], prices: [] };
    const mapping = copyPrices(settings.prices);
    for (const plan of PAID_PLAN_IDS) {
        const ours = products.filter((product): product is PaddleProductEntity & { id: string } => isPaddleId("product", product?.id) && product.status !== "archived" && customPlan(product.custom_data) === plan);
        // The product the mapping already uses comes first when there are several.
        const existingId = (ours.find((product) => settings.products[plan].includes(product.id)) ?? ours[0])?.id ?? null;
        const productId = existingId ?? await createProduct(plan);
        report.products.push({ plan, productId, created: !existingId });
        for (const interval of BILLING_INTERVALS) {
            const expected = { amount: String(EXPECTED_PRICES[plan][interval]), currency: EXPECTED_PRICES.currency };
            const existing = known.filter((price) => price.productId === productId && price.interval === interval);
            const match = existing.find((price) => price.amount === expected.amount && price.currency === expected.currency);
            if (match) {
                mapping[plan][interval] = match.id;
                report.prices.push({ plan, interval, outcome: "reused", priceId: match.id, expected, found: [] });
                continue;
            }
            if (existing.length) {
                // Someone set this period up differently in Paddle: theirs to decide, nothing is touched.
                report.prices.push({ plan, interval, outcome: "conflict", priceId: null, expected, found: existing.map((price) => ({ id: price.id, amount: price.amount, currency: price.currency })) });
                continue;
            }
            const description = `${PRODUCT_NAMES[plan].replace("Hanogt Codev ", "")} · ${PRICE_NAMES[interval].tr}`;
            const created = await paddleRequest<{ data?: { id?: string } }>("POST", "/prices", {
                product_id: productId,
                description,
                name: PRICE_NAMES[interval].name,
                unit_price: { amount: expected.amount, currency_code: expected.currency },
                billing_cycle: { interval, frequency: 1 },
                tax_mode: "account_setting",
                custom_data: { hanogt_plan: plan, hanogt_interval: interval },
            });
            const priceId = created.data?.id;
            if (!isPaddleId("price", priceId)) throw new PaddleApiError(0, "unexpected_response");
            known.push({ id: priceId, productId, productName: PRODUCT_NAMES[plan], description, interval, cycle: `1 ${interval}`, amount: expected.amount, currency: expected.currency, trialDays: null, suggestedPlan: plan });
            mapping[plan][interval] = priceId;
            report.prices.push({ plan, interval, outcome: "created", priceId, expected, found: [] });
        }
    }
    const ensured = { plus: report.products.filter((entry) => entry.plan === "plus").map((entry) => entry.productId), pro: report.products.filter((entry) => entry.plan === "pro").map((entry) => entry.productId) };
    await savePaddlePrices(mapping, actor, known, extraMutations, { environment, products: ensured });
    return report;
}

// ---------------------------------------------------------------------------
// Subscriptions without an account
// ---------------------------------------------------------------------------

/**
 * Subscriptions the webhook couldn't match to an account (paddle_unlinked) in
 * the configured environment, newest first. Filtered here rather than in the
 * query, which would need a composite index.
 */
export async function listUnlinked(limit = 20, environment: PaddleEnvironment = getPaddleConfig().environment): Promise<AdminPaddleUnlinked[]> {
    const records = await runServerQuery<Record<string, unknown>>({
        collectionId: "paddle_unlinked",
        orderBy: [{ field: "seenAt", direction: "DESCENDING" }],
        limit: Math.max(limit, 100),
    });
    return records.filter((record) => record.environment === environment).slice(0, limit).flatMap((record): AdminPaddleUnlinked[] => {
        const subscriptionId = isPaddleId("subscription", record.subscriptionId) ? record.subscriptionId : record._id;
        if (!isPaddleId("subscription", subscriptionId)) return [];
        return [{
            subscriptionId,
            customerId: isPaddleId("customer", record.customerId) ? record.customerId : null,
            customerEmail: null,
            status: text(record.status, 20),
            plan: record.plan === "plus" || record.plan === "pro" ? record.plan : null,
            priceId: isPaddleId("price", record.priceId) ? record.priceId : null,
            seenAt: isoOrNull(record.seenAt),
        }];
    });
}

/** The e-mail addresses Paddle has for some customers (to help staff find the right account). */
export async function paddleCustomerEmails(customerIds: readonly string[]): Promise<Map<string, string>> {
    const ids = [...new Set(customerIds.filter((id) => isPaddleId("customer", id)))].slice(0, 200);
    const emails = new Map<string, string>();
    for (const chunk of chunks(ids, IDS_PER_REQUEST)) {
        const { data } = await paddleRequest<ListResponse<{ id?: string; email?: string }>>("GET", `/customers?id=${chunk.join(",")}&per_page=200`);
        for (const customer of data ?? []) {
            const email = normalizeEmail(customer?.email);
            if (isPaddleId("customer", customer?.id) && email) emails.set(customer.id, email);
        }
    }
    return emails;
}

async function accountExists(email: string) {
    return Boolean(await getServerDocument(`users/${email}`));
}

/**
 * Links a subscription to an account: its Paddle customer is remembered for
 * the account and the subscription stored on it. Refused when the customer
 * already belongs to another existing account. The account must exist, since
 * a subscription of a missing account counts as one to cancel.
 */
export async function linkSubscription(subscriptionId: string, email: string): Promise<SyncResult> {
    if (!isPaddleId("subscription", subscriptionId)) throw new PaddleAdminError("invalid_id");
    if (!(await accountExists(email))) throw new PaddleAdminError("user_not_found");
    const { data: entity } = await paddleRequest<{ data?: PaddleSubscriptionEntity }>("GET", `/subscriptions/${subscriptionId}`);
    if (!entity || entity.id !== subscriptionId || !isPaddleId("customer", entity.customer_id)) throw new PaddleApiError(0, "unexpected_response");
    const mapping = await getServerDocument<Record<string, unknown>>(customerPath(entity.customer_id));
    const mapped = normalizeEmail(mapping?.email);
    if (mapped && mapped !== email && mapping?.deleted !== true && (await accountExists(mapped))) throw new PaddleAdminError("already_linked");
    await rememberCustomer(entity.customer_id, email, "staff");
    const result = await syncSubscription(subscriptionId, { entity });
    if (result.status !== "unlinked") await commitServerMutations([{ type: "delete", path: unlinkedPath(subscriptionId) }]);
    return result;
}

/**
 * Asks Paddle for the subscriptions of the account's customer and stores the
 * most relevant one (active before paused before ended). Returns how many
 * Paddle has; 0 when the account has no Paddle customer in this environment.
 */
export async function resyncAccount(email: string): Promise<number> {
    // Only the configured environment's customer: a sandbox customer doesn't exist live.
    const subscription = normalizeSubscription(await getServerDocument<Record<string, unknown>>(subscriptionPath(email)));
    const customerId = subscription.paddleCustomerId ?? subscription.paddle?.customerId ?? null;
    if (!customerId) return 0;
    if (!(await accountExists(email))) throw new PaddleAdminError("user_not_found");
    const found = await customerSubscriptions(customerId);
    if (!found.length) return 0;
    // Records from before the customer link existed: without it the subscription would count as unknown.
    if (!(await getServerDocument(customerPath(customerId)))) await rememberCustomer(customerId, email, "staff");
    await syncSubscription(found[0].id, { entity: found[0] });
    return found.length;
}

/** One person's plan for Admin › Subscriptions: staff assignment, Paddle subscription and Hanogt AI limits. */
export async function adminPersonPlan(email: string): Promise<AdminUserPlanResponse> {
    const [user, record, usage] = await Promise.all([
        getServerDocument<Record<string, unknown>>(`users/${email}`),
        getServerDocument<Record<string, unknown>>(subscriptionPath(email)),
        aiUsage(email),
    ]);
    const environment = getPaddleConfig().environment;
    const subscription = normalizeSubscription(record, environment);
    return {
        email,
        exists: Boolean(user),
        subscription,
        effectivePlan: effectivePlan(subscription),
        planSource: planSource(subscription),
        aiLimits: aiLimitsFor(subscription),
        aiUsage: usage,
        paddleEnvironment: environment,
        paddleDashboard: paddleDashboardUrl(environment, ""),
    };
}

// ---------------------------------------------------------------------------
// Coupons as Paddle discounts
// ---------------------------------------------------------------------------

/** Paddle discount codes are letters and digits only (ours may also contain - and _). */
export function isPaddleDiscountCode(code: string) {
    return /^[A-Za-z0-9]{1,32}$/.test(code);
}

/**
 * The coupon's discount when it was made in the environment Paddle is set up
 * for now (a sandbox discount means nothing to the live checkout).
 */
export function couponDiscountId(record: Record<string, unknown> | null | undefined, environment: PaddleEnvironment): string | null {
    if (!record || !isPaddleId("discount", record.paddleDiscountId)) return null;
    const made = record.paddleEnvironment;
    return made === undefined || made === null || made === environment ? record.paddleDiscountId : null;
}

/** The prices a coupon for `plan` applies to; null (every price) when none is mapped. */
export function discountRestriction(plan: PaidPlanId | "any", prices: PaddlePlanPrices): string[] | null {
    const plans = plan === "any" ? PAID_PLAN_IDS : [plan];
    const ids = plans.flatMap((id) => BILLING_INTERVALS.flatMap((interval) => {
        const price = prices[id][interval];
        return price ? [price] : [];
    }));
    return ids.length ? [...new Set(ids)] : null;
}

/** RFC 3339 without milliseconds. */
function rfc3339(value: Date | string | null) {
    if (value === null) return null;
    const time = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString().replace(/\.\d{3}Z$/, "Z") : null;
}

export type PaddleDiscountInput = { code: string; percentOff: number; plan: PaidPlanId | "any"; maxUses: number | null; expiresAt: Date | string | null };

/** Creates the discount Paddle checkout accepts for a coupon code (first payment only); returns its dsc_… id. */
export async function createPaddleDiscount(input: PaddleDiscountInput): Promise<string> {
    const settings = await getPaddleSettings(true);
    const response = await paddleRequest<{ data?: { id?: string } }>("POST", "/discounts", {
        amount: String(input.percentOff),
        description: `Hanogt ${input.code}`,
        type: "percentage",
        enabled_for_checkout: true,
        code: input.code,
        recur: false,
        usage_limit: input.maxUses,
        expires_at: rfc3339(input.expiresAt),
        restrict_to: discountRestriction(input.plan, settings.prices),
    });
    const id = response.data?.id;
    if (!isPaddleId("discount", id)) throw new PaddleApiError(0, "unexpected_response");
    return id;
}

/** Turns a discount on or off at checkout (archived discounts can't be redeemed). */
export async function setPaddleDiscountActive(discountId: string, active: boolean) {
    if (!isPaddleId("discount", discountId)) throw new PaddleApiError(0, "invalid_id");
    await paddleRequest("PATCH", `/discounts/${discountId}`, { status: active ? "active" : "archived" });
}

/** How often each discount was redeemed, by id. */
export async function paddleDiscountUsage(discountIds: readonly string[]): Promise<Map<string, number>> {
    const ids = [...new Set(discountIds.filter((id) => isPaddleId("discount", id)))];
    const usage = new Map<string, number>();
    for (const chunk of chunks(ids, IDS_PER_REQUEST)) {
        const { data } = await paddleRequest<ListResponse<{ id?: string; times_used?: unknown }>>("GET", `/discounts?id=${chunk.join(",")}&per_page=200`);
        for (const discount of data ?? []) {
            if (isPaddleId("discount", discount?.id) && typeof discount.times_used === "number" && Number.isFinite(discount.times_used)) usage.set(discount.id, discount.times_used);
        }
    }
    return usage;
}
