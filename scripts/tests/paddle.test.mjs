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
            if (parts[2] === "resume" && method === "POST") {
                if (entry.status !== "paused") return error(400, "subscription_not_paused");
                if (body?.on_resume === "continue_existing_billing_period" && Date.parse(entry.current_billing_period?.ends_at ?? "") <= NOW) return error(400, "subscription_resume_period_ended");
                Object.assign(entry, { status: "active", paused_at: null, updated_at: iso(90_000) });
                if (body?.on_resume !== "continue_existing_billing_period") entry.current_billing_period = { starts_at: iso(0), ends_at: iso(30 * DAY) };
                return json(200, { data: entry });
            }
            // Paddle refuses anything but do_not_bill for a subscription in its trial.
            if (method === "PATCH" && body?.items && entry.status === "trialing" && body.proration_billing_mode !== "do_not_bill") {
                return error(400, "subscription_trialing_items_update_invalid_options");
            }
            if (parts[2] === "preview" && method === "PATCH") {
                const trial = body.proration_billing_mode === "do_not_bill";
                return json(200, { data: { ...entry, next_billed_at: iso(30 * DAY), update_summary: { result: { action: "charge", amount: trial ? "0" : "12345", currency_code: "TRY" } }, next_transaction: { details: { totals: { grand_total: "49900" } } } } });
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
        if (parts[0] === "customers" && parts.length === 2 && method === "GET") {
            const entry = state.customers.find((customer) => customer.id === parts[1]);
            return entry ? json(200, { data: entry }) : error(404, "entity_not_found");
        }
        if (parts[0] === "customers" && parts.length === 1 && method === "GET") {
            const email = url.searchParams.get("email");
            // `hidden`: created by another request a moment ago, not in the search results yet.
            return json(200, { data: state.customers.filter((entry) => entry.email === email && !entry.hidden) });
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
    // Paddle already has a customer with Ali's address that no account is linked to: only a verified address may claim it.
    await withPaddle(baseSeed(), { customers: [{ id: CUSTOMER, email: ALI }] }, async (db, api) => {
        await assert.rejects(paddle.ensureCustomer(ALI, null, { verified: false }), (error) => error.code === "customer_unverified");
        assert.equal(db.get(`paddle_customers/${CUSTOMER}`) ?? null, null, "nothing linked");
        assert.equal(paddle.billingAnswer(new paddle.PaddleApiError(409, "customer_unverified")).error, "customer_unverified");
        const { customerId, created } = await paddle.ensureCustomer(ALI, null, { verified: true });
        assert.equal(customerId, CUSTOMER, "an existing Paddle customer is reused once the address is verified");
        assert.equal(created, false);
        assert.equal(db.get(`paddle_customers/${CUSTOMER}`).email, ALI);
        assert.equal(db.get(`subscriptions/${ALI}`).paddleCustomerId, CUSTOMER);
        const { transactionId } = await paddle.createCheckoutTransaction({ email: ALI, plan: "pro", priceId: PRICES.proYear, customerId });
        assert.match(transactionId, /^txn_/);
        const call = api.calls.find((entry) => entry.path === "/transactions");
        assert.deepEqual(call.body.items, [{ price_id: PRICES.proYear, quantity: 1 }]);
        assert.equal(call.body.customer_id, CUSTOMER);
        assert.deepEqual(paddle.verifyAccountLink(call.body.custom_data), { email: ALI, plan: "pro" });
        // Linked now: an unverified sign-in of the same account keeps using it.
        assert.deepEqual(await paddle.ensureCustomer(ALI, CUSTOMER, { verified: false }), { customerId: CUSTOMER, created: false });
    });

    await withPaddle(baseSeed(), {}, async (db, api) => {
        const fresh = await paddle.ensureCustomer(ALI, null, { verified: false });
        assert.match(fresh.customerId, /^ctm_01new/);
        assert.equal(fresh.created, true, "a customer we create needs no verified address");
        assert.equal(api.calls.filter((call) => call.method === "POST" && call.path === "/customers").length, 1);
        assert.deepEqual(await paddle.ensureCustomer(ALI, fresh.customerId, { verified: false }), { customerId: fresh.customerId, created: false }, "a known customer needs no API call");
        assert.equal(api.calls.length, 2);
    });

    const taken = { ...baseSeed(), [`paddle_customers/${CUSTOMER}`]: { email: "eve@example.com" } };
    await withPaddle(taken, { customers: [{ id: CUSTOMER, email: ALI }] }, async () => {
        await assert.rejects(paddle.ensureCustomer(ALI, null, { verified: true }), (error) => error.code === "customer_linked_elsewhere");
        assert.deepEqual(paddle.billingAnswer(new paddle.PaddleApiError(409, "customer_linked_elsewhere")), { status: 409, error: "customer_conflict" });
        // The account still names it (staff linked it to Eve since): it isn't used for Ali.
        await assert.rejects(paddle.ensureCustomer(ALI, CUSTOMER, { verified: true }), (error) => error.code === "customer_linked_elsewhere");
    });

    // A deleted account's customer (a tombstone) isn't taken over by a new password sign-up with the same address.
    const tombstone = { ...baseSeed(), [`paddle_customers/${CUSTOMER}`]: { deleted: true, deletedAt: new Date(NOW) } };
    await withPaddle(tombstone, { customers: [{ id: CUSTOMER, email: ALI }] }, async (db) => {
        await assert.rejects(paddle.ensureCustomer(ALI, CUSTOMER, { verified: false }), (error) => error.code === "customer_unverified");
        assert.equal((await paddle.ensureCustomer(ALI, CUSTOMER, { verified: true })).customerId, CUSTOMER);
        assert.equal(db.get(`paddle_customers/${CUSTOMER}`).deleted, false);
    });

    // Our record names the customer but its link was never written: the link is restored, no Paddle call.
    await withPaddle(baseSeed(), {}, async (db, api) => {
        assert.deepEqual(await paddle.ensureCustomer(ALI, CUSTOMER, { verified: false }), { customerId: CUSTOMER, created: false });
        assert.equal(db.get(`paddle_customers/${CUSTOMER}`).email, ALI);
        assert.equal(api.calls.length, 0);
    });

    // Two tabs at once: the search finds nothing, then Paddle says the customer exists, created moments ago by the other tab.
    const realNow = Date.now();
    await withPaddle(baseSeed(), { customers: [{ id: CUSTOMER, email: ALI, created_at: new Date(realNow - 30_000).toISOString(), hidden: true }] }, async () => {
        assert.deepEqual(await paddle.ensureCustomer(ALI, null, { verified: false }), { customerId: CUSTOMER, created: true });
    });
    // An old one that the search missed is no race: it needs a verified address like any other.
    await withPaddle(baseSeed(), { customers: [{ id: CUSTOMER, email: ALI, created_at: new Date(realNow - 30 * DAY).toISOString(), hidden: true }] }, async () => {
        await assert.rejects(paddle.ensureCustomer(ALI, null, { verified: false }), (error) => error.code === "customer_unverified");
    });
});

test("Paddle's own refusals people can act on are answers, not failures", () => {
    assert.deepEqual(paddle.billingAnswer(new paddle.BillingStepError("change", new paddle.PaddleApiError(400, "subscription_payment_declined"))), { status: 402, error: "payment_declined" });
    assert.equal(paddle.billingAnswer(new paddle.PaddleApiError(400, "invalid_field")), null);
    assert.equal(paddle.billingAnswer(new Error("Firestore down")), null);
});

test("prices: our mapping first, then the price's own custom data, and a product in both plans decides nothing", () => {
    const shared = paddle.normalizePaddleSettings({ sandbox: { prices: { plus: { month: PRICES.plusMonth, year: null }, pro: { month: PRICES.proMonth, year: null } }, products: { plus: [PRODUCTS.plus], pro: [PRODUCTS.plus] } } }, "sandbox");
    const oldPro = { id: "pri_01oldproxxxxxxxxxxxxxxxxxx", product_id: PRODUCTS.plus, custom_data: { hanogt_plan: "pro" } };
    assert.equal(paddle.planOfPrice(oldPro, shared), "pro", "a replaced Pro price in a shared product stays Pro");
    assert.equal(paddle.planOfPrice({ id: "pri_01oldunknownxxxxxxxxxxxxxx", product_id: PRODUCTS.plus }, shared), null, "ambiguous product, no custom data: no plan");
    assert.equal(paddle.planOfPrice({ id: PRICES.proMonth, product_id: PRODUCTS.plus, custom_data: { hanogt_plan: "plus" } }, shared), "pro", "a price on sale is decided by the mapping");
    assert.equal(paddle.planOfPrice({ id: "pri_01oldplusxxxxxxxxxxxxxxxxx", product_id: PRODUCTS.plus }, sandboxSettings()), "plus", "a product in one plan still counts");
});

test("subscriptions are tried in a useful order: unlocking a plan, the higher plan, status, newest", () => {
    const settings = sandboxSettings();
    const unmapped = subscription({ id: "sub_01unmappedxxxxxxxxxxxxxxx", items: [{ status: "active", price: price("pri_01unknownxxxxxxxxxxxxxxxxx", "pro_01unknownxxxxxxxxxxxxxxxx") }] });
    const plus = subscription({ id: "sub_01plusxxxxxxxxxxxxxxxxxxx" });
    const pro = subscription({ id: "sub_01proxxxxxxxxxxxxxxxxxxxx", items: [{ status: "active", price: price(PRICES.proMonth, PRODUCTS.pro) }] });
    const paused = subscription({ id: "sub_01pausedxxxxxxxxxxxxxxxxx", status: "paused" });
    const canceledNew = subscription({ id: "sub_01cancelednewxxxxxxxxxxxx", status: "canceled", updated_at: iso(DAY) });
    const ranked = paddle.rankCandidates([canceledNew, paused, unmapped, plus, pro], settings, NOW).map((entry) => entry.id);
    assert.deepEqual(ranked, [pro.id, plus.id, unmapped.id, paused.id, canceledNew.id]);
});

test("plan changes, undoing a cancellation and the portal", async () => {
    const seed = { ...baseSeed(), [`paddle_customers/${CUSTOMER}`]: { email: ALI } };
    const scheduled = subscription({ scheduled_change: { action: "cancel", effective_at: iso(29 * DAY) } });
    await withPaddle(seed, { subscriptions: [scheduled] }, async (db, api) => {
        const preview = await paddle.previewPlanChange(SUB, PRICES.proMonth);
        assert.deepEqual(preview, { amount: "12345", currency: "TRY", result: "charge", nextBilledAt: iso(30 * DAY), nextAmount: "49900", trialing: false });
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

test("deleting an account cancels every subscription its customer still has, not only the stored one", async () => {
    const settings = sandboxSettings();
    const unrecorded = subscription({ id: "sub_01unrecordedxxxxxxxxxxxxx", items: [{ status: "active", price: price(PRICES.proMonth, PRODUCTS.pro) }] });
    const paused = subscription({ id: "sub_01pausedxxxxxxxxxxxxxxxxx", status: "paused" });
    const ended = subscription({ id: "sub_01endedxxxxxxxxxxxxxxxxxx", status: "canceled" });
    const seed = {
        ...baseSeed(),
        [`paddle_customers/${CUSTOMER}`]: { email: ALI },
        [`subscriptions/${ALI}`]: { plan: "free", status: "active", paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox", paddle: paddle.subscriptionStateOf(subscription(), settings) },
    };
    await withPaddle(seed, { subscriptions: [subscription(), unrecorded, paused, ended] }, async (db, api) => {
        const summary = await deleteAccountData(ALI, { scope: "all" });
        assert.deepEqual(summary.errors, []);
        assert.equal(summary.deleted.paddleSubscriptionsCanceled, 3);
        const cancelled = api.calls.filter((call) => call.path.endsWith("/cancel")).map((call) => call.path.split("/")[2]).sort();
        assert.deepEqual(cancelled, [SUB, unrecorded.id, paused.id].sort());
        assert.equal(db.get(`paddle_customers/${CUSTOMER}`).deleted, true);
    });
});

test("a plan change in a free trial isn't billed (do_not_bill) and says so", async () => {
    const seed = { ...baseSeed(), [`paddle_customers/${CUSTOMER}`]: { email: ALI } };
    await withPaddle(seed, { subscriptions: [subscription({ status: "trialing" })] }, async (db, api) => {
        // What the old code sent: Paddle refuses it for a trialing subscription.
        await assert.rejects(paddle.previewPlanChange(SUB, PRICES.proMonth, false), (error) => error.code === "subscription_trialing_items_update_invalid_options");
        const preview = await paddle.previewPlanChange(SUB, PRICES.proMonth, true);
        assert.equal(api.calls.at(-1).body.proration_billing_mode, "do_not_bill");
        assert.equal(preview.trialing, true);
        assert.equal(preview.result, "none", "nothing is charged now");
        const changed = await paddle.applyPlanChange(SUB, PRICES.proMonth, true);
        assert.equal(changed.status, "stored");
        assert.equal(api.calls.at(-1).body.proration_billing_mode, "do_not_bill");
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.plan, "pro");
    });
});

test("resuming a paused subscription: within the paid period without a charge, after it with a new period", async () => {
    const seed = { ...baseSeed(), [`paddle_customers/${CUSTOMER}`]: { email: ALI } };
    await withPaddle(seed, { subscriptions: [subscription({ status: "paused" })] }, async (db, api) => {
        const result = await paddle.resumeSubscription(SUB, true);
        assert.equal(result.status, "stored");
        assert.deepEqual(api.calls.find((call) => call.path === `/subscriptions/${SUB}/resume`).body, { effective_from: "immediately", on_resume: "continue_existing_billing_period" });
        assert.equal(api.calls.length, 1, "the answer is stored as it is, without asking again");
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.status, "active");
    });
    const ended = subscription({ status: "paused", current_billing_period: { starts_at: iso(-40 * DAY), ends_at: iso(-10 * DAY) } });
    await withPaddle(seed, { subscriptions: [ended] }, async (db, api) => {
        await paddle.resumeSubscription(SUB, false);
        const call = api.calls.find((entry) => entry.path === `/subscriptions/${SUB}/resume`);
        assert.equal(call.body.on_resume, "start_new_billing_period");
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.status, "active");
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
        assert.deepEqual(await serverPlans.groupLimitFor("nobody@example.com"), { plan: "free", limit: 3 });
        assert.deepEqual(await serverPlans.groupLimitFor("plus@example.com"), { plan: "plus", limit: 10 });
        assert.deepEqual(await serverPlans.groupLimitFor("pro@example.com"), { plan: "pro", limit: null });
    });
    assert.deepEqual(plans.PLAN_GROUP_LIMITS, { free: 3, plus: 10, pro: null });
});

// ---------------------------------------------------------------------------
// Checkout failures browsers report (POST /api/paddle/client-error)
// ---------------------------------------------------------------------------

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const STATUS_PATH = "site_config/paddle_status";
/** Built from code points: invisible characters shouldn't sit in the test's source. */
const NUL = String.fromCharCode(0);
const RLO = String.fromCharCode(0x202e);
const LINE_SEPARATOR = String.fromCharCode(0x2028);

test("client error reports: known stages, one clean line, https addresses and Paddle codes only", () => {
    const report = paddle.normalizeClientErrorReport;
    for (const body of [null, "blocked", [], { message: "no stage" }, { stage: "exploded" }, { stage: "BLOCKED" }]) {
        assert.equal(report(body), null, JSON.stringify(body));
    }
    const cleaned = report({
        stage: "blocked",
        message: `  Failed\nto${NUL} load${RLO} for ${ALI}${LINE_SEPARATOR}  `,
        blockedUrl: "https://cdn.paddle.com/paddle/v2/paddle.js?token=test_abc#frag",
        code: " Forbidden ",
        email: ALI,
        userId: "u_1",
    });
    assert.deepEqual(cleaned, { stage: "blocked", message: "Failed to load for [e-mail]", blockedUrl: "https://cdn.paddle.com/paddle/v2/paddle.js", code: "forbidden" }, "controls stripped, the e-mail hidden, the query dropped, unknown fields ignored");
    assert.equal(report({ stage: "init", message: "x".repeat(400) }).message.length, 300);
    assert.equal(report({ stage: "init", message: 42 }).message, "");
    assert.equal(report({ stage: "open", blockedUrl: `https://sandbox-buy.paddle.com/${"a".repeat(400)}` }).blockedUrl.length, 300);
    for (const blockedUrl of ["http://cdn.paddle.com/paddle.js", "javascript:alert(1)", "cdn.paddle.com", "https://", 42]) {
        assert.equal(report({ stage: "blocked", blockedUrl }).blockedUrl, null, String(blockedUrl));
    }
    assert.equal(report({ stage: "blocked", blockedUrl: "https://user:secret@cdn.paddle.com/x" }).blockedUrl, "https://cdn.paddle.com/x", "credentials in an address are dropped");
    assert.equal(report({ stage: "checkout_error", code: "transaction_not_found" }).code, "transaction_not_found");
    for (const code of ["bad-code", "a b", "x".repeat(81), "", 7]) assert.equal(report({ stage: "checkout_error", code }).code, null, String(code));
    for (const stage of ["blocked", "missing", "init", "open", "checkout_error", "checkout_failed", "payment_error", "request"]) assert.equal(report({ stage }).stage, stage);
    assert.deepEqual(report({ stage: "request", code: "http_504", message: "POST /api/paddle/checkout: HTTP 504, 10.0 s" }), { stage: "request", message: "POST /api/paddle/checkout: HTTP 504, 10.0 s", blockedUrl: null, code: "http_504" }, "a request the server never answered");
});

test("browser labels: family and major version from the User-Agent", () => {
    const cases = [
        [CHROME, "Chrome 141"],
        [`${CHROME} Edg/141.0.3537.57`, "Edge 141"],
        [`${CHROME} OPR/123.0.0.0`, "Opera 123"],
        ["Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36", "Samsung Internet 28"],
        ["Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", "Firefox 140"],
        ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15", "Safari 18"],
        ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", "Safari 18"],
        ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1", "Chrome 141"],
        ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15", "Firefox 140"],
        ["curl/8.5.0", "Other"],
        ["", "Other"],
        [null, "Other"],
    ];
    for (const [agent, label] of cases) assert.equal(paddle.browserLabel(agent), label, String(agent));
});

test("client errors: newest first, ten at most, no names, the webhook's notes kept", async () => {
    const commits = [];
    const seed = { [STATUS_PATH]: { lastEventAt: new Date(NOW), lastEventType: "subscription.created" } };
    await withBackend(seed, { onCommit: (writes) => commits.push(writes) }, async (db) => {
        for (let index = 1; index <= 12; index += 1) {
            const stage = index % 2 ? "blocked" : "init";
            await paddle.recordPaddleClientError({ stage, message: `failure ${index}`, blockedUrl: null, code: null, browser: paddle.browserLabel(CHROME) }, new Date(NOW + index * 1_000));
        }
        const stored = db.get(STATUS_PATH);
        assert.equal(stored.lastEventType, "subscription.created", "only clientErrors is written");
        assert.equal(stored.clientErrors.length, 10);
        assert.deepEqual(stored.clientErrors.map((entry) => entry.message), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((index) => `failure ${index}`), "newest first; the two oldest dropped");
        assert.deepEqual(stored.clientErrors[0], { at: new Date(NOW + 12_000).toISOString(), stage: "init", message: "failure 12", blockedUrl: null, code: null, browser: "Chrome 141", environment: "sandbox" });
        for (const entry of stored.clientErrors) assert.deepEqual(Object.keys(entry).sort(), ["at", "blockedUrl", "browser", "code", "environment", "message", "stage"]);
        assert.equal(JSON.stringify(stored).includes("ali"), false, "nothing about who reported it");
        for (const writes of commits) {
            assert.deepEqual(writes[0].updateMask.fieldPaths, ["clientErrors"]);
            assert.ok(writes[0].currentDocument?.updateTime, "written against the version that was read");
        }
    });

    await withBackend({}, {}, async (db) => {
        const entry = await paddle.recordPaddleClientError({ stage: "checkout_error", message: "checkout.error · request_error · forbidden", blockedUrl: "https://sandbox-buy.paddle.com/x", code: "forbidden", browser: "Firefox 140" }, new Date(NOW));
        assert.deepEqual(db.get(STATUS_PATH).clientErrors, [entry], "the document is created when it doesn't exist");
        assert.equal(entry.code, "forbidden");
    });
});

test("client errors: a concurrent write means reading again, and junk entries are dropped", async () => {
    const holder = {};
    let interfere = true;
    let attempts = 0;
    const commitUrl = "http://127.0.0.1:8080/v1/projects/demo-hanogt/databases/(default)/documents:commit";
    const options = {
        onCommit: (writes) => {
            if (!writes.some((write) => write.update?.name.endsWith(STATUS_PATH) && write.updateMask?.fieldPaths.includes("clientErrors"))) return;
            attempts += 1;
            if (!interfere) return;
            interfere = false;
            // Another report (or the webhook) lands between our read and our write.
            void holder.db.fetch(commitUrl, {
                method: "POST",
                body: JSON.stringify({ writes: [{ update: { name: `projects/demo-hanogt/databases/(default)/documents/${STATUS_PATH}`, fields: { lastEventType: { stringValue: "transaction.completed" } } }, updateMask: { fieldPaths: ["lastEventType"] } }] }),
            });
        },
    };
    const junk = [
        { at: "yesterday", stage: "blocked", message: "bad date", environment: "sandbox" },
        { at: new Date(NOW).toISOString(), stage: "exploded", message: "bad stage", environment: "sandbox" },
        { at: new Date(NOW).toISOString(), stage: "open", message: "bad environment", environment: "mars" },
        "not an entry",
        { at: new Date(NOW).toISOString(), stage: "open", message: "kept", blockedUrl: "http://insecure.example/x", code: "Bad-Code", browser: "", environment: "production" },
    ];
    await withBackend({ [STATUS_PATH]: { clientErrors: junk } }, options, async (db) => {
        holder.db = db;
        await paddle.recordPaddleClientError({ stage: "missing", message: "no instance", blockedUrl: null, code: null, browser: "Safari 18" }, new Date(NOW + 60_000));
        assert.equal(interfere, false, "the concurrent write happened");
        assert.equal(attempts, 2, "the first write was refused and the list read again");
        const stored = db.get(STATUS_PATH);
        assert.equal(stored.lastEventType, "transaction.completed", "the other write survives");
        assert.deepEqual(stored.clientErrors.map((entry) => entry.message), ["no instance", "kept"]);
        assert.deepEqual(stored.clientErrors[1], { at: new Date(NOW).toISOString(), stage: "open", message: "kept", blockedUrl: null, code: null, browser: "Other", environment: "production" });
    });
});

// ---------------------------------------------------------------------------
// Failed billing requests: what went wrong, where, and the list for the team
// ---------------------------------------------------------------------------

test("Paddle answers that aren't JSON and timeouts become Paddle errors, not crashes", async () => {
    const answers = [
        () => new Response("<html><body>Bad gateway</body></html>", { status: 200, headers: { "Content-Type": "text/html" } }),
        () => new Response("", { status: 201 }),
        () => json(200, ["not", "an", "object"]),
        () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); },
        () => { throw new TypeError("fetch failed"); },
        () => new Response("<html>502</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
    ];
    const expected = [[200, "unexpected_response"], [201, "unexpected_response"], [200, "unexpected_response"], [0, "timeout"], [0, "network_error"], [502, "http_error"]];
    for (const [index, answer] of answers.entries()) {
        await withBackend(baseSeed(), { route: async () => answer() }, async () => {
            await assert.rejects(
                paddle.createCheckoutTransaction({ email: ALI, plan: "plus", priceId: PRICES.plusMonth, customerId: CUSTOMER }),
                (error) => error instanceof paddle.PaddleApiError && error.status === expected[index][0] && error.code === expected[index][1],
                `answer ${index}`,
            );
        });
    }
});

test("billing failures name the step: Paddle, the database or our own code", async () => {
    const failed = async (step, error) => {
        let caught = null;
        await paddle.billingStep(step, async () => { throw error; }).catch((wrapped) => { caught = wrapped; });
        assert.ok(caught instanceof paddle.BillingStepError, "the error names its step");
        return paddle.describeBillingFailure(caught);
    };
    assert.deepEqual(await failed("transaction", new paddle.PaddleApiError(503, "internal_error", `Paddle had a hiccup creating a transaction for ${ALI}`)), {
        status: 424, error: "paddle_error", step: "transaction", code: "internal_error", paddleStatus: 503, detail: "Paddle had a hiccup creating a transaction for [e-mail]",
    });
    assert.deepEqual(await failed("transaction", new paddle.PaddleApiError(0, "timeout")), {
        status: 424, error: "paddle_error", step: "transaction", code: "timeout", paddleStatus: 0, detail: "Paddle API network timeout",
    }, "without Paddle's words the message says what happened");
    assert.deepEqual(await failed("subscription", new Error("Firestore okuma hatası (429).")), {
        status: 500, error: "unavailable", step: "subscription", code: "database_error", paddleStatus: null, detail: "Firestore okuma hatası (429).",
    });
    assert.equal((await failed("catalog", new TypeError("fetch failed"))).code, "database_error", "the catalog only lives in the database");
    assert.equal((await failed("customer", new Error("Firebase erişim belirteci alınamadı (HTTP 400)."))).code, "database_error");
    assert.equal((await failed("customer", new TypeError("Cannot read properties of null (reading 'data')"))).code, "internal_error");
    const long = await failed("transaction", new Error(`${"x".repeat(300)}\nsecond line`));
    assert.equal(long.detail.length, 200, "one line of 200 characters at most");
    assert.equal((await failed("transaction", "plain text")).detail, "plain text");

    // The innermost step wins; errors outside any step have none.
    const nested = await paddle.billingStep("customer", () => paddle.billingStep("transaction", async () => { throw new paddle.PaddleApiError(400, "invalid_field"); })).catch((error) => error);
    assert.equal(paddle.describeBillingFailure(nested).step, "transaction");
    assert.deepEqual(paddle.describeBillingFailure(new Error("boom")), { status: 500, error: "unavailable", step: null, code: "internal_error", paddleStatus: null, detail: "boom" });
    assert.equal(await paddle.billingStep("settings", async () => 42), 42, "a step that works returns its value");
});

test("server errors: newest first, ten at most, nothing about the account, the other lists kept", async () => {
    const commits = [];
    const browserReport = { at: new Date(NOW).toISOString(), stage: "blocked", message: "kept", blockedUrl: null, code: null, browser: "Chrome 141", environment: "sandbox" };
    const seed = { [STATUS_PATH]: { lastEventType: "subscription.created", clientErrors: [browserReport] } };
    await withBackend(seed, { onCommit: (writes) => commits.push(writes) }, async (db) => {
        // A minute apart: the same failure again within a minute isn't listed twice (see below).
        for (let index = 1; index <= 12; index += 1) {
            await paddle.recordPaddleServerError({ route: "checkout", step: "transaction", status: 502, paddleStatus: 0, code: "timeout", detail: `attempt ${index} for ${ALI}`, ms: 8_000 + index }, new Date(NOW + index * 61_000));
        }
        const stored = db.get(STATUS_PATH);
        assert.equal(stored.lastEventType, "subscription.created");
        assert.deepEqual(stored.clientErrors, [browserReport], "the browsers' list is untouched");
        assert.equal(stored.serverErrors.length, 10);
        assert.deepEqual(stored.serverErrors.map((entry) => entry.ms), [8012, 8011, 8010, 8009, 8008, 8007, 8006, 8005, 8004, 8003], "newest first; the two oldest dropped");
        assert.deepEqual(stored.serverErrors[0], {
            at: new Date(NOW + 12 * 61_000).toISOString(), route: "checkout", step: "transaction", status: 502, paddleStatus: 0, code: "timeout", detail: "attempt 12 for [e-mail]", ms: 8012, environment: "sandbox",
        });
        assert.equal(JSON.stringify(stored.serverErrors).includes("ali"), false, "nothing about whose request it was");
        for (const writes of commits) {
            assert.deepEqual(writes[0].updateMask.fieldPaths, ["serverErrors"]);
            assert.ok(writes[0].currentDocument?.updateTime, "written against the version that was read");
        }
        const read = await (await load("lib/server/paddle-admin.ts")).readPaddleStatus();
        assert.equal(read.serverErrors.length, 10);
        assert.equal(read.clientErrors.length, 1);
    });

    // A page asking every few seconds: the same failure within a minute is listed once; another step or code is new.
    await withBackend({}, {}, async (db) => {
        const failure = { route: "sync", step: "sync", status: 424, paddleStatus: 403, code: "forbidden", detail: "", ms: 300 };
        await paddle.recordPaddleServerError(failure, new Date(NOW));
        await paddle.recordPaddleServerError(failure, new Date(NOW + 5_000));
        await paddle.recordPaddleServerError(failure, new Date(NOW + 30_000));
        assert.equal(db.get(STATUS_PATH).serverErrors.length, 1);
        await paddle.recordPaddleServerError({ ...failure, code: "timeout", paddleStatus: 0 }, new Date(NOW + 31_000));
        await paddle.recordPaddleServerError(failure, new Date(NOW + 32_000));
        assert.deepEqual(db.get(STATUS_PATH).serverErrors.map((entry) => entry.code), ["forbidden", "timeout", "forbidden"], "a different failure in between lists it again");
        await paddle.recordPaddleServerError(failure, new Date(NOW + 93_000));
        assert.equal(db.get(STATUS_PATH).serverErrors.length, 4, "and again after a minute");
    });

    const junk = [
        { at: "yesterday", route: "checkout", step: "customer", status: 503, code: "database_error", environment: "sandbox" },
        { at: new Date(NOW).toISOString(), route: "checkout", step: "customer", status: 200, code: "database_error", environment: "sandbox" },
        { at: new Date(NOW).toISOString(), route: "checkout", step: "customer", status: 503, code: "Bad Code", environment: "sandbox" },
        { at: new Date(NOW).toISOString(), route: "checkout", step: "customer", status: 503, code: "database_error", environment: "mars" },
        "not an entry",
        { at: new Date(NOW).toISOString(), route: "<script>", step: "exploded", status: 503, paddleStatus: "x", code: "database_error", detail: 42, ms: -5, environment: "production" },
    ];
    await withBackend({ [STATUS_PATH]: { serverErrors: junk } }, {}, async (db) => {
        await paddle.recordPaddleServerError({ route: "subscription:portal", step: "portal", status: 502, paddleStatus: 403, code: "forbidden", detail: "", ms: 321 }, new Date(NOW + 60_000));
        const stored = db.get(STATUS_PATH).serverErrors;
        assert.deepEqual(stored.map((entry) => entry.route), ["subscription:portal", "checkout"], "junk entries are dropped");
        assert.deepEqual(stored[1], { at: new Date(NOW).toISOString(), route: "checkout", step: null, status: 503, paddleStatus: null, code: "database_error", detail: "", ms: 0, environment: "production" });
        await assert.rejects(paddle.recordPaddleServerError({ route: "checkout", step: null, status: 200, paddleStatus: null, code: "ok", detail: "", ms: 1 }), /Invalid billing failure/);
    });
});
