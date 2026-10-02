// Run: node --test scripts/tests/
// Paddle Billing: signatures, configuration, entitlements and the webhook,
// checkout and deletion flows against an in-memory Firestore (fake-backend)
// and a fake Paddle API on a loopback address (PADDLE_API_BASE_URL).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { json, setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const PADDLE_HOST = "127.0.0.1:8787";
Object.assign(process.env, {
    PADDLE_API_KEY: "pdl_sdbx_apikey_01abcdefghijklmnopqrstuvwx_testkeytestkeytestkeyXX",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_0123456789abcdefghijkl",
    PADDLE_WEBHOOK_SECRET: "pdl_ntfset_01testsecret_abcdefghijklmnop",
    PADDLE_API_BASE_URL: `http://${PADDLE_HOST}`,
    NEXTAUTH_SECRET: "test-nextauth-secret",
});

const paddle = await load("lib/server/paddle.ts");
const shared = await load("lib/paddle.ts");
const plans = await load("lib/plans.ts");
const serverPlans = await load("lib/server/plans.ts");
const { deleteAccountData } = await load("lib/server/account-deletion.ts");

const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 24 * 60 * 60_000;
const iso = (offset) => new Date(NOW + offset).toISOString();

const ALI = "ali@example.com";
const CUSTOMER = "ctm_01aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_CUSTOMER = "ctm_01bbbbbbbbbbbbbbbbbbbbbbbb";
const SUB = "sub_01aaaaaaaaaaaaaaaaaaaaaaaa";
const OLD_SUB = "sub_01oooooooooooooooooooooooo";
const PRICES = {
    plusMonth: "pri_01plusmonthxxxxxxxxxxxxxxx",
    plusYear: "pri_01plusyearxxxxxxxxxxxxxxxx",
    proMonth: "pri_01promonthxxxxxxxxxxxxxxxx",
    proYear: "pri_01proyearxxxxxxxxxxxxxxxxx",
};
const PRODUCTS = { plus: "pro_01plusproductxxxxxxxxxxxx", pro: "pro_01proproductxxxxxxxxxxxxx" };
const SANDBOX_SETTINGS = {
    prices: { plus: { month: PRICES.plusMonth, year: PRICES.plusYear }, pro: { month: PRICES.proMonth, year: PRICES.proYear } },
    products: { plus: [PRODUCTS.plus], pro: [PRODUCTS.pro] },
    salesOpen: true,
};
/** site_config/paddle: one part per environment; the tests run with sandbox keys. */
const SETTINGS = { sandbox: SANDBOX_SETTINGS, production: { prices: {}, products: {} } };
const sandboxSettings = () => paddle.normalizePaddleSettings(SETTINGS, "sandbox");

function price(id, product, interval = "month", frequency = 1) {
    return { id, product_id: product, billing_cycle: { interval, frequency }, unit_price: { amount: "19900", currency_code: "TRY" } };
}

function subscription(overrides = {}) {
    return {
        id: SUB,
        status: "active",
        customer_id: CUSTOMER,
        updated_at: iso(0),
        next_billed_at: iso(30 * DAY),
        canceled_at: null,
        current_billing_period: { starts_at: iso(-1 * DAY), ends_at: iso(29 * DAY) },
        billing_cycle: { interval: "month", frequency: 1 },
        scheduled_change: null,
        items: [{ status: "active", price: price(PRICES.plusMonth, PRODUCTS.plus) }],
        custom_data: null,
        ...overrides,
    };
}

/** A tiny Paddle API: subscriptions, customers, transactions, portal sessions and price previews. */
function createPaddle({ subscriptions = [], customers = [], down = false, ips } = {}) {
    const state = {
        down,
        ips,
        subscriptions: new Map(subscriptions.map((entry) => [entry.id, structuredClone(entry)])),
        customers: customers.map((entry) => ({ ...entry })),
        calls: [],
    };
    const error = (status, code, detail = "") => json(status, { error: { type: "request_error", code, detail } });
    state.route = async (url, init = {}) => {
        assert.equal(url.host, PADDLE_HOST, `unexpected request to ${url.href}`);
        const method = (init.method || "GET").toUpperCase();
        const body = init.body ? JSON.parse(init.body) : null;
        state.calls.push({ method, path: url.pathname, search: url.search, body, auth: init.headers?.Authorization });
        if (state.down) throw new TypeError("fetch failed");
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] === "ips") return json(200, { data: { ipv4_cidrs: state.ips ?? ["34.194.127.46/32", "54.234.237.108/32", "127.0.0.1/32"] } });
        if (parts[0] === "subscriptions" && parts.length === 1 && method === "GET") {
            const customer = url.searchParams.get("customer_id");
            return json(200, { data: [...state.subscriptions.values()].filter((entry) => entry.customer_id === customer) });
        }
        if (parts[0] === "subscriptions" && parts[1]) {
            const entry = state.subscriptions.get(parts[1]);
            if (!entry) return error(404, "entity_not_found");
            if (parts[2] === "cancel" && method === "POST") {
                if (entry.status === "canceled") return error(400, "subscription_locked_canceled");
                Object.assign(entry, { status: "canceled", canceled_at: iso(0), scheduled_change: null, updated_at: iso(60_000) });
                return json(200, { data: entry });
            }
            if (parts[2] === "preview" && method === "PATCH") {
                return json(200, { data: { ...entry, next_billed_at: iso(30 * DAY), update_summary: { result: { action: "charge", amount: "12345", currency_code: "TRY" } }, next_transaction: { details: { totals: { grand_total: "49900" } } } } });
            }
            if (method === "PATCH") {
                if ("scheduled_change" in body) entry.scheduled_change = body.scheduled_change;
                if (body.items) {
                    const next = Object.values(PRICES).includes(body.items[0].price_id) ? body.items[0].price_id : null;
                    if (!next) return error(400, "invalid_field");
                    const isPro = next === PRICES.proMonth || next === PRICES.proYear;
                    const isYear = next === PRICES.plusYear || next === PRICES.proYear;
                    entry.items = [{ status: "active", price: price(next, isPro ? PRODUCTS.pro : PRODUCTS.plus, isYear ? "year" : "month") }];
                }
                entry.updated_at = iso(120_000);
                return json(200, { data: entry });
            }
            return json(200, { data: entry });
        }
        if (parts[0] === "customers" && parts.length === 1 && method === "GET") {
            const email = url.searchParams.get("email");
            return json(200, { data: state.customers.filter((entry) => entry.email === email) });
        }
        if (parts[0] === "customers" && parts.length === 1 && method === "POST") {
            const existing = state.customers.find((entry) => entry.email === body.email);
            if (existing) return error(409, "customer_already_exists", `customer email conflicts with customer of id ${existing.id}`);
            const created = { id: `ctm_01new${String(state.customers.length).padStart(21, "0")}`, email: body.email };
            state.customers.push(created);
            return json(201, { data: created });
        }
        if (parts[0] === "customers" && parts[2] === "portal-sessions") {
            const deep = (body?.subscription_ids ?? []).map((id) => ({ id, cancel_subscription: `https://customer-portal.paddle.com/cancel/${id}`, update_subscription_payment_method: `https://customer-portal.paddle.com/pay/${id}` }));
            return json(201, { data: { urls: { general: { overview: `https://customer-portal.paddle.com/${parts[1]}` }, subscriptions: deep } } });
        }
        if (parts[0] === "transactions" && method === "POST") return json(201, { data: { id: "txn_01newtransactionxxxxxxxxxx", status: "draft" } });
        if (parts[0] === "pricing-preview") {
            const lineItems = body.items.map((item) => ({
                price: { id: item.price_id, trial_period: item.price_id === PRICES.proMonth ? { interval: "day", frequency: 7 } : null },
                totals: { total: item.price_id.includes("year") ? "199000" : "19900" },
                formatted_totals: { total: item.price_id.includes("year") ? "₺1.990,00" : "₺199,00" },
            }));
            return json(200, { data: { currency_code: "TRY", address: body.address, details: { line_items: lineItems } } });
        }
        throw new Error(`Unsupported Paddle request ${method} ${url.pathname}`);
    };
    return state;
}

async function withPaddle(seed, paddleSeed, run) {
    paddle.forgetPaddleCaches();
    const api = createPaddle(paddleSeed);
    return withBackend(seed, { route: api.route }, (db) => run(db, api));
}

function signed(body, secret = process.env.PADDLE_WEBHOOK_SECRET, ts = Math.floor(Date.now() / 1000)) {
    return `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;
}

const baseSeed = () => ({
    [`users/${ALI}`]: { email: ALI, username: "ali" },
    "site_config/paddle": SETTINGS,
});

// ---------------------------------------------------------------------------
// Signatures and configuration
// ---------------------------------------------------------------------------

test("webhook signatures: valid, rotated, tampered, expired and malformed", () => {
    const secret = "pdl_ntfset_secret";
    const body = JSON.stringify({ event_type: "subscription.created", data: { id: SUB } });
    const now = 1_790_000_000;
    const good = createHmac("sha256", secret).update(`${now}:${body}`).digest("hex");
    assert.deepEqual(paddle.verifyPaddleSignature(body, `ts=${now};h1=${good}`, secret, now), { ok: true });
    assert.deepEqual(paddle.verifyPaddleSignature(body, `ts=${now};h1=${"0".repeat(64)};h1=${good}`, secret, now), { ok: true }, "any h1 may match while a secret rotates");
    assert.equal(paddle.verifyPaddleSignature(`${body} `, `ts=${now};h1=${good}`, secret, now).reason, "mismatch", "the raw body is signed as is");
    assert.equal(paddle.verifyPaddleSignature(body, `ts=${now};h1=${good}`, "pdl_ntfset_other", now).reason, "mismatch");
    assert.equal(paddle.verifyPaddleSignature(body, `ts=${now};h1=${good}`, secret, now + 301).reason, "expired");
    assert.equal(paddle.verifyPaddleSignature(body, null, secret, now).reason, "missing");
    assert.equal(paddle.verifyPaddleSignature(body, "h1=abc", secret, now).reason, "malformed");
    assert.equal(paddle.verifyPaddleSignature(body, `ts=${now};h1=xyz`, secret, now).reason, "mismatch");
});

test("configuration: environment from the key prefixes, warnings for mistakes", () => {
    const sandbox = paddle.getPaddleConfig({ PADDLE_API_KEY: " 'pdl_sdbx_apikey_01abcdefghijklmnopqrstuvwx_abcdefghij' ", NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_abcdefghijklmnop" });
    assert.equal(sandbox.environment, "sandbox");
    assert.equal(sandbox.apiBase, "https://sandbox-api.paddle.com");
    assert.equal(sandbox.apiKey, "pdl_sdbx_apikey_01abcdefghijklmnopqrstuvwx_abcdefghij", "quotes and spaces from dashboards are removed");
    assert.deepEqual(sandbox.warnings, []);

    const live = paddle.getPaddleConfig({ PADDLE_API_KEY: "pdl_live_apikey_01abcdefghijklmnopqrstuvwx_abcdefghij", PADDLE_CLIENT_TOKEN: "live_abcdefghijklmnop", NEXT_PUBLIC_PADDLE_ENV: "sandbox" });
    assert.equal(live.environment, "production", "the keys win over the environment variable");
    assert.ok(live.warnings.includes("environment_override_ignored"));

    const mixed = paddle.getPaddleConfig({ PADDLE_API_KEY: "pdl_live_apikey_01abcdefghijklmnopqrstuvwx_abcdefghij", NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_abcdefghijklmnop" });
    assert.ok(mixed.warnings.includes("key_token_mismatch"));

    const leaked = paddle.getPaddleConfig({ NEXT_PUBLIC_PADDLE_API_KEY: "pdl_live_apikey_x", NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "pdl_live_apikey_01abcdefghijklmnopqrstuvwx" });
    assert.ok(leaked.warnings.includes("public_secret"));
    assert.ok(leaked.warnings.includes("token_is_api_key"));
    assert.equal(paddle.isPaddleConfigured(leaked), false);

    const legacy = paddle.getPaddleConfig({ PADDLE_API_KEY: "a".repeat(50), PADDLE_ENVIRONMENT: "sandbox" });
    assert.equal(legacy.environment, "sandbox", "legacy keys follow the environment variable");
    assert.ok(!legacy.warnings.includes("api_key_format"));

    assert.equal(paddle.getPaddleConfig({ PADDLE_API_BASE_URL: "https://evil.example" }).apiBase, "https://api.paddle.com", "only loopback overrides are accepted");
    assert.equal(paddle.getPaddleConfig({ PADDLE_API_BASE_URL: "http://127.0.0.1:9000/x" }).apiBase, "http://127.0.0.1:9000");
});

test("signed custom data links a checkout to one account and plan", () => {
    const env = { NEXTAUTH_SECRET: "secret-a" };
    const data = paddle.accountLinkData(ALI, "plus", env);
    assert.deepEqual(paddle.verifyAccountLink(data, env), { email: ALI, plan: "plus" });
    assert.equal(paddle.verifyAccountLink({ ...data, hanogt_plan: "pro" }, env), null, "the plan is signed");
    assert.equal(paddle.verifyAccountLink({ ...data, hanogt_account: "eve@example.com" }, env), null, "the account is signed");
    assert.equal(paddle.verifyAccountLink(data, { NEXTAUTH_SECRET: "secret-b" }), null);
    assert.equal(paddle.accountLinkData(ALI, "plus", {}), null, "no secret, no signature");
    assert.equal(paddle.verifyAccountLink(data, {}), null);
    assert.equal(paddle.verifyAccountLink("nope", env), null);
});

// ---------------------------------------------------------------------------
// State and entitlements
// ---------------------------------------------------------------------------

test("a Paddle subscription maps to plan, interval and dates", () => {
    const settings = sandboxSettings();
    const state = paddle.subscriptionStateOf(subscription({ scheduled_change: { action: "cancel", effective_at: iso(29 * DAY) } }), settings, null, new Date(NOW));
    assert.equal(state.plan, "plus");
    assert.equal(state.interval, "month");
    assert.equal(state.priceId, PRICES.plusMonth);
    assert.deepEqual(state.scheduledChange, { action: "cancel", effectiveAt: iso(29 * DAY) });
    assert.equal(state.currentPeriodEnd, iso(29 * DAY));

    const replacedPrice = subscription({ items: [{ price: price("pri_01legacyproxxxxxxxxxxxxxxxx", PRODUCTS.pro, "month", 12) }] });
    const legacy = paddle.subscriptionStateOf(replacedPrice, settings);
    assert.equal(legacy.plan, "pro", "an old price of a known product still unlocks its plan");
    assert.equal(legacy.interval, "year", "12 months count as yearly");

    const custom = subscription({ items: [{ price: { ...price("pri_01customxxxxxxxxxxxxxxxxxx", "pro_01unknownxxxxxxxxxxxxxxxxx"), custom_data: { hanogt_plan: "pro" } } }] });
    assert.equal(paddle.subscriptionStateOf(custom, settings).plan, "pro", "the owner can tag prices in Paddle");

    const unknown = subscription({ items: [{ price: price("pri_01otherxxxxxxxxxxxxxxxxxxx", "pro_01unknownxxxxxxxxxxxxxxxxx") }] });
    assert.equal(paddle.subscriptionStateOf(unknown, settings).plan, null);
    assert.equal(paddle.subscriptionStateOf(unknown, settings, "plus").plan, "plus", "a signed checkout names the plan");
    assert.equal(paddle.subscriptionStateOf(subscription({ status: "mystery" }), settings).status, "paused", "unknown statuses unlock nothing");

    const stored = shared.normalizePaddleState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(stored, state, "the stored copy reads back the same");
    assert.equal(shared.normalizePaddleState({ ...state, subscriptionId: "x" }), null);
});

test("effective plan: the higher of staff and paid plans; blocked or lapsed gives Free", () => {
    const settings = sandboxSettings();
    const paidPro = paddle.subscriptionStateOf(subscription({ items: [{ price: price(PRICES.proMonth, PRODUCTS.pro) }] }), settings);
    const base = { ...plans.FREE_SUBSCRIPTION };
    assert.equal(plans.effectivePlan({ ...base, paddle: paidPro }, NOW), "pro");
    assert.equal(plans.planSource({ ...base, paddle: paidPro }, NOW), "paddle");
    assert.equal(plans.effectivePlan({ ...base, plan: "plus", paddle: paidPro }, NOW), "pro");
    assert.equal(plans.effectivePlan({ ...base, plan: "pro", paddle: { ...paidPro, plan: "plus" } }, NOW), "pro");
    assert.equal(plans.planSource({ ...base, plan: "pro", paddle: { ...paidPro, plan: "plus" } }, NOW), "staff");
    assert.equal(plans.effectivePlan({ ...base, status: "blocked", paddle: paidPro }, NOW), "free", "blocking switches off paid benefits too");
    assert.equal(plans.effectivePlan({ ...base, paddle: { ...paidPro, status: "past_due" } }, NOW), "pro", "benefits continue while Paddle retries");
    assert.equal(plans.effectivePlan({ ...base, paddle: { ...paidPro, status: "canceled" } }, NOW), "free");
    assert.equal(plans.effectivePlan({ ...base, paddle: { ...paidPro, status: "paused" } }, NOW), "free");
    assert.equal(plans.effectivePlan({ ...base, paddle: { ...paidPro, currentPeriodEnd: iso(-4 * DAY) } }, NOW), "free", "a renewal never reported ends after the grace days");
    assert.equal(plans.effectivePlan({ ...base, paddle: { ...paidPro, currentPeriodEnd: iso(-2 * DAY) } }, NOW), "pro");
    assert.equal(shared.paddleNeedsResync({ ...paidPro, currentPeriodEnd: iso(-1) }, NOW), true);
    assert.equal(plans.aiLimitsFor({ ...base, paddle: paidPro }, NOW).perDay, plans.PLAN_AI_LIMITS.pro.perDay);
});

test("which copy wins: fresh reads, older payloads and other subscriptions", () => {
    const settings = sandboxSettings();
    const current = paddle.subscriptionStateOf(subscription({ updated_at: iso(0) }), settings);
    const older = paddle.subscriptionStateOf(subscription({ status: "canceled", updated_at: iso(-60_000) }), settings);
    assert.equal(paddle.shouldReplaceState(current, older, false, NOW), false, "an older notification payload is ignored");
    assert.equal(paddle.shouldReplaceState(current, older, true, NOW), true, "the API's copy is always current");
    const oldSub = paddle.subscriptionStateOf(subscription({ id: OLD_SUB, status: "canceled", updated_at: iso(60_000) }), settings);
    assert.equal(paddle.shouldReplaceState(current, oldSub, true, NOW), false, "an ended subscription can't replace a live one");
    assert.equal(paddle.shouldReplaceState(oldSub, current, false, NOW), true);
    const pro = paddle.subscriptionStateOf(subscription({ id: OLD_SUB, items: [{ price: price(PRICES.proMonth, PRODUCTS.pro) }] }), settings);
    assert.equal(paddle.shouldReplaceState(current, pro, false, NOW), true, "of two live subscriptions the higher plan wins");
    assert.equal(paddle.shouldReplaceState(pro, current, false, NOW), false);
});

test("billing notifications appear once per event", () => {
    const settings = sandboxSettings();
    const at = new Date(NOW);
    const active = paddle.subscriptionStateOf(subscription(), settings);
    const kinds = (previous, next) => paddle.billingNotifications(ALI, previous, next, at).map((write) => write.data.kind);
    assert.deepEqual(kinds(null, active), ["active"]);
    assert.deepEqual(kinds(active, active), [], "a repeated delivery adds nothing");
    const scheduled = { ...active, scheduledChange: { action: "cancel", effectiveAt: iso(29 * DAY) } };
    assert.deepEqual(kinds(active, scheduled), ["cancel"]);
    assert.deepEqual(kinds(scheduled, scheduled), []);
    assert.deepEqual(kinds(active, { ...active, status: "past_due" }), ["pastdue"]);
    assert.deepEqual(kinds(active, { ...active, status: "canceled", scheduledChange: null }), ["ended"]);
    assert.deepEqual(kinds(active, { ...active, plan: "pro" }), ["changed"]);
    const write = paddle.billingNotifications(ALI, null, active, at)[0];
    assert.equal(write.path, `notifications/${ALI}/items/billing_${SUB}_active`);
    assert.equal(write.data.type, "billing");
    assert.equal(write.data.actionUrl, "/plans");
});

// ---------------------------------------------------------------------------
// Webhook flows
// ---------------------------------------------------------------------------

test("a signed checkout is linked to its account and activates the plan", async () => {
    const entity = subscription({ custom_data: paddle.accountLinkData(ALI, "plus") });
    await withPaddle(baseSeed(), { subscriptions: [entity] }, async (db, api) => {
        const result = await paddle.handlePaddleEvent({ event_id: "evt_1", event_type: "subscription.created", data: entity });
        assert.equal(result, "stored");
        assert.deepEqual(db.get(`paddle_customers/${CUSTOMER}`).email, ALI);
        const record = db.get(`subscriptions/${ALI}`);
        assert.equal(record.paddle.plan, "plus");
        assert.equal(record.paddle.status, "active");
        assert.equal(record.paddleCustomerId, CUSTOMER);
        assert.ok(record.plan === undefined || record.plan === "free", "no staff plan is assigned by a purchase");
        assert.equal(db.get(`notifications/${ALI}/items/billing_${SUB}_active`).kind, "active");
        assert.equal(db.get("site_config/paddle_status").lastEventType, "subscription.created");
        assert.ok(api.calls.some((call) => call.method === "GET" && call.path === `/subscriptions/${SUB}`), "the subscription is re-read from the API");
        assert.ok(api.calls.every((call) => call.auth === `Bearer ${process.env.PADDLE_API_KEY}`));

        // Delivered again: same state, no second notification.
        const before = db.paths().length;
        assert.equal(await paddle.handlePaddleEvent({ event_id: "evt_1", event_type: "subscription.created", data: entity }), "stored");
        assert.equal(db.paths().length, before);
    });
});

test("unknown customers wait for staff; deleted accounts are cancelled", async () => {
    const stranger = subscription({ customer_id: OTHER_CUSTOMER });
    await withPaddle(baseSeed(), { subscriptions: [stranger] }, async (db) => {
        assert.equal(await paddle.handlePaddleEvent({ event_type: "subscription.activated", data: stranger }), "unlinked");
        assert.equal(db.get(`paddle_unlinked/${SUB}`).customerId, OTHER_CUSTOMER);
        assert.equal(db.get(`paddle_unlinked/${SUB}`).plan, "plus");
    });

    const seed = { ...baseSeed(), [`paddle_customers/${CUSTOMER}`]: { deleted: true } };
    await withPaddle(seed, { subscriptions: [subscription()] }, async (db, api) => {
        assert.equal(await paddle.handlePaddleEvent({ event_type: "subscription.updated", data: subscription() }), "canceled_for_deleted_account");
        assert.ok(api.calls.some((call) => call.method === "POST" && call.path === `/subscriptions/${SUB}/cancel` && call.body.effective_from === "immediately"));
        assert.equal(db.has(`subscriptions/${ALI}`), false);
    });
});

test("when the API is down the payload is used, but never an older one", async () => {
    const seed = {
        ...baseSeed(),
        [`paddle_customers/${CUSTOMER}`]: { email: ALI },
        [`subscriptions/${ALI}`]: { plan: "free", status: "active", paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox", paddle: paddle.subscriptionStateOf(subscription({ updated_at: iso(0) }), sandboxSettings()) },
    };
    await withPaddle(seed, { down: true }, async (db) => {
        const stale = subscription({ status: "canceled", updated_at: iso(-60_000) });
        assert.equal(await paddle.handlePaddleEvent({ event_type: "subscription.canceled", data: stale }), "kept");
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.status, "active");
        const newer = subscription({ status: "past_due", updated_at: iso(60_000) });
        assert.equal(await paddle.handlePaddleEvent({ event_type: "subscription.past_due", data: newer }), "stored");
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.status, "past_due");
        assert.equal(db.get(`notifications/${ALI}/items/billing_${SUB}_pastdue_${iso(29 * DAY).slice(0, 10)}`).kind, "pastdue");
        await assert.rejects(paddle.handlePaddleEvent({ event_type: "transaction.completed", data: { subscription_id: SUB } }), "without a payload Paddle must retry");
    });
});

test("unrelated events are ignored", async () => {
    await withPaddle(baseSeed(), {}, async () => {
        assert.equal(await paddle.handlePaddleEvent({ event_type: "customer.updated", data: { id: CUSTOMER } }), "ignored");
        assert.equal(await paddle.handlePaddleEvent({ event_type: "subscription.created", data: { id: "nope" } }), "ignored");
        assert.equal(await paddle.handlePaddleEvent({ event_type: "transaction.completed", data: { subscription_id: null } }), "ignored");
    });
});

// ---------------------------------------------------------------------------
// Checkout, changes and portal
// ---------------------------------------------------------------------------

test("checkout: the account's own customer and signed custom data", async () => {
    await withPaddle(baseSeed(), { customers: [{ id: CUSTOMER, email: ALI }] }, async (db, api) => {
        const customerId = await paddle.ensureCustomer(ALI, null);
        assert.equal(customerId, CUSTOMER, "an existing Paddle customer is reused");
        assert.equal(db.get(`paddle_customers/${CUSTOMER}`).email, ALI);
        assert.equal(db.get(`subscriptions/${ALI}`).paddleCustomerId, CUSTOMER);
        const { transactionId } = await paddle.createCheckoutTransaction({ email: ALI, plan: "pro", priceId: PRICES.proYear, customerId });
        assert.match(transactionId, /^txn_/);
        const call = api.calls.find((entry) => entry.path === "/transactions");
        assert.deepEqual(call.body.items, [{ price_id: PRICES.proYear, quantity: 1 }]);
        assert.equal(call.body.customer_id, CUSTOMER);
        assert.deepEqual(paddle.verifyAccountLink(call.body.custom_data), { email: ALI, plan: "pro" });
    });

    await withPaddle(baseSeed(), {}, async (db, api) => {
        const created = await paddle.ensureCustomer(ALI, null);
        assert.match(created, /^ctm_01new/);
        assert.equal(api.calls.filter((call) => call.method === "POST" && call.path === "/customers").length, 1);
        assert.equal(await paddle.ensureCustomer(ALI, created), created, "a known customer needs no API call");
        assert.equal(api.calls.length, 2);
    });

    const taken = { ...baseSeed(), [`paddle_customers/${CUSTOMER}`]: { email: "eve@example.com" } };
    await withPaddle(taken, { customers: [{ id: CUSTOMER, email: ALI }] }, async () => {
        await assert.rejects(paddle.ensureCustomer(ALI, null), (error) => error.code === "customer_linked_elsewhere");
    });
});

test("plan changes, undoing a cancellation and the portal", async () => {
    const seed = { ...baseSeed(), [`paddle_customers/${CUSTOMER}`]: { email: ALI } };
    const scheduled = subscription({ scheduled_change: { action: "cancel", effective_at: iso(29 * DAY) } });
    await withPaddle(seed, { subscriptions: [scheduled] }, async (db, api) => {
        const preview = await paddle.previewPlanChange(SUB, PRICES.proMonth);
        assert.deepEqual(preview, { amount: "12345", currency: "TRY", result: "charge", nextBilledAt: iso(30 * DAY), nextAmount: "49900" });
        assert.equal(api.calls.at(-1).body.proration_billing_mode, "prorated_immediately");

        const changed = await paddle.applyPlanChange(SUB, PRICES.proMonth);
        assert.equal(changed.status, "stored");
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.plan, "pro");

        await paddle.keepSubscription(SUB);
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.scheduledChange, null);
        assert.deepEqual(api.calls.at(-1).body, { scheduled_change: null });

        const links = await paddle.portalLinks(CUSTOMER, SUB);
        assert.equal(links.overview, `https://customer-portal.paddle.com/${CUSTOMER}`);
        assert.equal(links.cancel, `https://customer-portal.paddle.com/cancel/${SUB}`);
        assert.equal(links.updatePayment, `https://customer-portal.paddle.com/pay/${SUB}`);
    });
});

test("Plans page prices: on sale when visible and priced; buyable even if pricing fails", async () => {
    const catalog = { currency: "TRY", updatedAt: null, plans: { plus: { monthly: 199, yearly: 1990, discountPercent: 0, visible: true }, pro: { monthly: null, yearly: null, discountPercent: 0, visible: false } } };
    await withPaddle(baseSeed(), {}, async (db, api) => {
        const config = await paddle.checkoutConfigFor(catalog, "DE");
        assert.equal(config.environment, "sandbox");
        assert.equal(config.clientToken, process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN);
        assert.deepEqual(config.onSale, { plus: ["month", "year"], pro: [] }, "Pro isn't visible yet");
        assert.equal(config.prices.plus.month.total, "₺199,00");
        assert.equal(config.prices.plus.year.amount, "199000");
        assert.equal(config.pricesUnavailable, false);
        assert.deepEqual(api.calls.find((call) => call.path === "/pricing-preview").body.address, { country_code: "DE" });
        assert.equal(shared.yearlySavingsPercent(config.prices.plus.month, config.prices.plus.year), 16);

        api.down = true;
        paddle.forgetPaddleCaches();
        const offline = await paddle.checkoutConfigFor(catalog, "TR");
        assert.equal(offline.pricesUnavailable, true);
        assert.deepEqual(offline.onSale.plus, ["month", "year"]);
    });

    const saved = { ...process.env };
    try {
        delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
        await withPaddle(baseSeed(), {}, async () => assert.equal(await paddle.checkoutConfigFor(catalog, null), null));
    } finally {
        Object.assign(process.env, saved);
    }
});

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

test("deleting an account cancels its subscription and leaves a tombstone", async () => {
    const settings = sandboxSettings();
    const seed = {
        ...baseSeed(),
        [`credentials/${ALI}`]: { passwordHash: "x" },
        [`paddle_customers/${CUSTOMER}`]: { email: ALI },
        [`subscriptions/${ALI}`]: { plan: "free", status: "active", paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox", paddle: paddle.subscriptionStateOf(subscription(), settings) },
    };
    await withPaddle(seed, { subscriptions: [subscription()] }, async (db, api) => {
        const summary = await deleteAccountData(ALI, { scope: "all" });
        assert.deepEqual(summary.errors, []);
        assert.equal(summary.deleted.paddleSubscriptionsCanceled, 1);
        assert.ok(api.calls.some((call) => call.path === `/subscriptions/${SUB}/cancel`));
        assert.equal(db.has(`subscriptions/${ALI}`), false);
        const tombstone = db.get(`paddle_customers/${CUSTOMER}`);
        assert.equal(tombstone.deleted, true);
        assert.equal("email" in tombstone, false, "no e-mail is kept");
    });

    await withPaddle(seed, { subscriptions: [subscription()], down: true }, async (db) => {
        const summary = await deleteAccountData(ALI, { scope: "all" });
        assert.equal(summary.errors.length, 1);
        assert.match(summary.errors[0], /^billing: Paddle aboneliği iptal edilemedi/);
        assert.equal(summary.errors[0].includes(ALI), false);
        assert.equal(db.get(`paddle_cleanup/${SUB}`).reason, "account_deleted");
        assert.equal(db.has(`subscriptions/${ALI}`), false, "the records go even when Paddle is unreachable");
        assert.equal(db.get(`paddle_customers/${CUSTOMER}`).deleted, true);
    });
});

// ---------------------------------------------------------------------------
// Going live: environments, webhook addresses, sales gate
// ---------------------------------------------------------------------------

test("sandbox and live data never mix", () => {
    const state = paddle.subscriptionStateOf(subscription(), sandboxSettings());
    assert.equal(state.environment, "sandbox", "the keys in the tests are sandbox keys");
    const record = { plan: "free", status: "active", paddle: state, paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox" };
    assert.equal(serverPlans.normalizeSubscription(record, "sandbox").paddle?.subscriptionId, SUB);
    assert.equal(serverPlans.normalizeSubscription(record, "sandbox").paddleCustomerId, CUSTOMER);
    const live = serverPlans.normalizeSubscription(record, "production");
    assert.equal(live.paddle, null, "a sandbox test purchase unlocks nothing with live keys");
    assert.equal(live.paddleCustomerId, null, "live checkouts get a live customer");
    assert.equal(plans.effectivePlan(live), "free");
    assert.deepEqual(paddle.normalizePaddleSettings(SETTINGS, "production").prices, paddle.EMPTY_PLAN_PRICES, "each environment has its own price ids");
    const write = paddle.paddleSettingsMutation("production", { prices: paddle.EMPTY_PLAN_PRICES, products: { plus: [], pro: [] }, salesOpen: false }, "owner@example.com");
    assert.deepEqual(write.updateFields, ["production", "updatedAt", "updatedBy"], "the sandbox part is left alone");
});

test("webhook addresses come from Paddle's /ips and are matched as CIDR blocks", async () => {
    assert.equal(paddle.ipInCidrs("34.194.127.46", ["34.194.127.46/32"]), true);
    assert.equal(paddle.ipInCidrs("::ffff:34.194.127.46", ["34.194.127.46/32"]), true);
    assert.equal(paddle.ipInCidrs("34.194.127.47", ["34.194.127.46/32"]), false);
    assert.equal(paddle.ipInCidrs("10.1.2.3", ["10.0.0.0/8"]), true);
    assert.equal(paddle.ipInCidrs("unknown", ["0.0.0.0/0"]), false);
    assert.equal(paddle.ipInCidrs("2001:db8::1", ["0.0.0.0/0"]), false, "only the published IPv4 blocks are accepted");
    assert.equal(paddle.ipInCidrs("1.2.3.4", ["bogus", "1.2.3.400/32"]), false);

    await withPaddle(baseSeed(), { ips: ["203.0.113.7/32", "not-a-cidr"] }, async (db, api) => {
        assert.deepEqual(await paddle.paddleWebhookCidrs(), ["203.0.113.7/32"]);
        await paddle.paddleWebhookCidrs();
        assert.equal(api.calls.filter((call) => call.path === "/ips").length, 1, "the list is cached");
    });
    await withPaddle(baseSeed(), { ips: [] }, async () => {
        await assert.rejects(paddle.paddleWebhookCidrs(), (error) => error.code === "ips_empty", "an empty list refuses everything");
    });
});

test("sales stay closed for everyone but staff and testers until the owner opens them", async () => {
    assert.equal(paddle.isBillingTester("someone@example.com", true), true, "staff can always test");
    assert.equal(paddle.isBillingTester("Tester@Example.com", false, { PADDLE_TESTER_EMAILS: "tester@example.com, qa@example.com" }), true);
    assert.equal(paddle.isBillingTester("someone@example.com", false, { PADDLE_TESTER_EMAILS: "tester@example.com" }), false);
    assert.equal(paddle.isBillingTester(null, false, { PADDLE_TESTER_EMAILS: "tester@example.com" }), false);

    const catalog = { currency: "USD", updatedAt: null, plans: { plus: { monthly: 20, yearly: 200, discountPercent: 0, visible: true }, pro: { monthly: 100, yearly: 1000, discountPercent: 0, visible: true } } };
    const closed = { ...baseSeed(), "site_config/paddle": { ...SETTINGS, sandbox: { ...SANDBOX_SETTINGS, salesOpen: false } } };
    await withPaddle(closed, {}, async () => {
        const visitor = await paddle.checkoutConfigFor(catalog, "TR", { tester: false });
        assert.deepEqual(visitor.onSale, { plus: [], pro: [] }, "visitors see coming soon");
        assert.equal(visitor.salesOpen, false);
        assert.equal(visitor.testMode, false);
        const tester = await paddle.checkoutConfigFor(catalog, "TR", { tester: true });
        assert.deepEqual(tester.onSale, { plus: ["month", "year"], pro: ["month", "year"] });
        assert.equal(tester.testMode, true);
    });
});

test("list prices are in dollars and a year costs ten months", () => {
    assert.equal(plans.DEFAULT_PLAN_CATALOG.currency, "USD");
    for (const plan of ["plus", "pro"]) assert.equal(plans.LIST_PRICES[plan].yearly, plans.LIST_PRICES[plan].monthly * 10);
    assert.deepEqual(plans.LIST_PRICES, { plus: { monthly: 20, yearly: 200 }, pro: { monthly: 100, yearly: 1000 } });
    const legacy = serverPlans.normalizeCatalog({ plans: { plus: { monthly: 199, yearly: 1990, discountPercent: 10, visible: true } } });
    assert.deepEqual(legacy.plans.plus, { monthly: 20, yearly: 200, discountPercent: 0, visible: true }, "old lira prices are replaced, Visible is kept");
    const dollars = serverPlans.normalizeCatalog({ currency: "USD", plans: { pro: { monthly: 90, yearly: 900, discountPercent: 0, visible: false } } });
    assert.equal(dollars.plans.pro.monthly, 90);
});

test("project limits: Free 10, Plus 40, Pro unlimited, from either plan source", async () => {
    assert.deepEqual(plans.PLAN_PROJECT_LIMITS, { free: { code: 10, game: 10 }, plus: { code: 40, game: 40 }, pro: { code: null, game: null } });
    const paidPlus = paddle.subscriptionStateOf(subscription(), sandboxSettings());
    const seed = {
        ...baseSeed(),
        "subscriptions/plus@example.com": { plan: "free", status: "active", paddle: paidPlus, paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox" },
        "subscriptions/pro@example.com": { plan: "pro", status: "active", expiresAt: null },
        "subscriptions/blocked@example.com": { plan: "pro", status: "blocked" },
    };
    await withPaddle(seed, {}, async () => {
        assert.deepEqual(await serverPlans.projectLimitFor("nobody@example.com", "code"), { plan: "free", limit: 10 });
        assert.deepEqual(await serverPlans.projectLimitFor("plus@example.com", "game"), { plan: "plus", limit: 40 });
        assert.deepEqual(await serverPlans.projectLimitFor("pro@example.com", "code"), { plan: "pro", limit: null });
        assert.deepEqual(await serverPlans.projectLimitFor("blocked@example.com", "game"), { plan: "free", limit: 10 });
    });
});
