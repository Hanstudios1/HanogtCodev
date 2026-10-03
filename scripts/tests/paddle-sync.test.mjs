// Run: node --test scripts/tests/
// A paid plan without Paddle's notification (lib/server/paddle-sync.ts): the
// Plans page, GET /api/plans and a second checkout ask Paddle about the
// account's own checkout and customer. Also the webhook's recorded outcome
// and the throttled refusal notes (lib/server/paddle.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { json, setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const PADDLE_HOST = "127.0.0.1:8786";
Object.assign(process.env, {
    PADDLE_API_KEY: "pdl_sdbx_apikey_01abcdefghijklmnopqrstuvwx_testkeytestkeytestkeyXX",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_0123456789abcdefghijkl",
    PADDLE_WEBHOOK_SECRET: "pdl_ntfset_01testsecret_abcdefghijklmnop",
    PADDLE_API_BASE_URL: `http://${PADDLE_HOST}`,
    NEXTAUTH_SECRET: "test-nextauth-secret",
});

const sync = await load("lib/server/paddle-sync.ts");
const paddle = await load("lib/server/paddle.ts");
const serverPlans = await load("lib/server/plans.ts");
const plans = await load("lib/plans.ts");

const NOW = Date.UTC(2026, 9, 3, 12);
const DAY = 24 * 60 * 60_000;
const iso = (offset) => new Date(NOW + offset).toISOString();
const ALI = "ali@example.com";
const BOB = "bob@example.com";
const CUSTOMER = "ctm_01aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_CUSTOMER = "ctm_01bbbbbbbbbbbbbbbbbbbbbbbb";
const SUB = "sub_01aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_SUB = "sub_01bbbbbbbbbbbbbbbbbbbbbbbb";
const TXN = "txn_01checkoutaaaaaaaaaaaaaaa";
const PRICE = "pri_01plusmonthxxxxxxxxxxxxxxx";
const PRODUCT = "pro_01plusproductxxxxxxxxxxxx";
const SETTINGS = {
    sandbox: { prices: { plus: { month: PRICE, year: null }, pro: { month: null, year: null } }, products: { plus: [PRODUCT], pro: [] }, salesOpen: true },
    production: { prices: {}, products: {} },
};

function subscription(overrides = {}) {
    return {
        id: SUB,
        status: "active",
        customer_id: CUSTOMER,
        updated_at: iso(0),
        next_billed_at: iso(30 * DAY),
        canceled_at: null,
        current_billing_period: { starts_at: iso(-60_000), ends_at: iso(30 * DAY) },
        billing_cycle: { interval: "month", frequency: 1 },
        scheduled_change: null,
        items: [{ status: "active", price: { id: PRICE, product_id: PRODUCT, billing_cycle: { interval: "month", frequency: 1 } } }],
        custom_data: null,
        ...overrides,
    };
}

/** Paddle with transactions and subscriptions; any write is a test failure (the sync only reads). */
function createPaddle({ transactions = [], subscriptions = [], forbid = [] } = {}) {
    const state = { calls: [], transactions: new Map(transactions.map((entry) => [entry.id, entry])), subscriptions: new Map(subscriptions.map((entry) => [entry.id, entry])) };
    const error = (status, code) => json(status, { error: { type: "request_error", code, detail: "" } });
    state.route = async (url, init = {}) => {
        assert.equal(url.host, PADDLE_HOST, `unexpected request to ${url.href}`);
        const method = (init.method || "GET").toUpperCase();
        state.calls.push(`${method} ${url.pathname}${url.search}`);
        assert.equal(method, "GET", `the sync only reads Paddle (${method} ${url.pathname})`);
        const parts = url.pathname.split("/").filter(Boolean);
        if (forbid.includes(parts[0])) return error(403, "forbidden");
        if (parts[0] === "transactions" && parts[1]) {
            const entry = state.transactions.get(parts[1]);
            return entry ? json(200, { data: entry }) : error(404, "entity_not_found");
        }
        if (parts[0] === "subscriptions" && parts[1]) {
            const entry = state.subscriptions.get(parts[1]);
            return entry ? json(200, { data: entry }) : error(404, "entity_not_found");
        }
        if (parts[0] === "subscriptions") return json(200, { data: [...state.subscriptions.values()].filter((entry) => entry.customer_id === url.searchParams.get("customer_id")) });
        throw new Error(`Unsupported Paddle request ${method} ${url.pathname}`);
    };
    return state;
}

/** Ali checked out a minute ago; Paddle's notification never arrived. */
function seed(overrides = {}) {
    return {
        [`users/${ALI}`]: { email: ALI },
        "site_config/paddle": SETTINGS,
        [`paddle_customers/${CUSTOMER}`]: { email: ALI, environment: "sandbox", deleted: false },
        [`subscriptions/${ALI}`]: { plan: "free", status: "active", paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox", paddleCheckout: { transactionId: TXN, environment: "sandbox", at: new Date(NOW - 60_000) } },
        ...overrides,
    };
}

async function withPaddle(data, paddleSeed, run) {
    paddle.forgetPaddleCaches();
    const api = createPaddle(paddleSeed);
    return withBackend(data, { route: api.route }, (db) => run(db, api));
}

test("a completed checkout unlocks its plan without the webhook; only reads, never cancels", async () => {
    await withPaddle(seed(), { transactions: [{ id: TXN, status: "completed", customer_id: CUSTOMER, subscription_id: SUB }], subscriptions: [subscription()] }, async (db, api) => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "active");
        assert.deepEqual(api.calls, [`GET /transactions/${TXN}`, `GET /subscriptions/${SUB}`]);
        const stored = db.get(`subscriptions/${ALI}`);
        assert.equal(stored.paddle.subscriptionId, SUB);
        assert.equal(stored.paddle.plan, "plus");
        assert.equal(plans.effectivePlan(serverPlans.normalizeSubscription(stored, "sandbox"), NOW), "plus");
        // Asked again: already active, Paddle isn't asked.
        api.calls.length = 0;
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "active");
        assert.deepEqual(api.calls, []);
    });
});

test("paid but no subscription yet: pending for an hour, then the customer's subscriptions decide", async () => {
    const paid = { id: TXN, status: "paid", customer_id: CUSTOMER, subscription_id: null, updated_at: iso(-30_000) };
    await withPaddle(seed(), { transactions: [paid] }, async (db, api) => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "pending");
        assert.deepEqual(api.calls, [`GET /transactions/${TXN}`], "pending: nothing else asked");
    });
    const stale = { ...paid, updated_at: iso(-2 * 60 * 60_000) };
    await withPaddle(seed(), { transactions: [stale] }, async (db, api) => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "none", "a paid transaction stuck for hours doesn't block new checkouts");
        assert.deepEqual(api.calls, [`GET /transactions/${TXN}`, `GET /subscriptions?customer_id=${CUSTOMER}&per_page=50`]);
    });
    // Opened but not paid (an abandoned checkout): not pending.
    await withPaddle(seed(), { transactions: [{ ...paid, status: "ready" }] }, async () => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "none");
    });
});

test("purchases without a remembered checkout, and transactions the key can't read, come from the customer's subscriptions", async () => {
    const legacy = seed({ [`subscriptions/${ALI}`]: { plan: "free", status: "active", paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox" } });
    await withPaddle(legacy, { subscriptions: [subscription()] }, async (db, api) => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "active");
        assert.deepEqual(api.calls, [`GET /subscriptions?customer_id=${CUSTOMER}&per_page=50`]);
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.status, "active");
    });
    await withPaddle(seed(), { subscriptions: [subscription()], forbid: ["transactions"] }, async () => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "active", "403 on transactions: falls back to the list");
    });
    // A canceled subscription unlocks nothing and isn't stored as a purchase.
    await withPaddle(legacy, { subscriptions: [subscription({ status: "canceled", canceled_at: iso(-DAY) })] }, async (db) => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "none");
        assert.equal(db.get(`subscriptions/${ALI}`).paddle, undefined);
    });
});

test("never another account's purchase: foreign transactions, foreign or deleted customers, the other environment", async () => {
    // The remembered transaction belongs to another customer: ignored.
    await withPaddle(seed(), { transactions: [{ id: TXN, status: "completed", customer_id: OTHER_CUSTOMER, subscription_id: OTHER_SUB }], subscriptions: [subscription({ id: OTHER_SUB, customer_id: OTHER_CUSTOMER })] }, async (db, api) => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "none");
        assert.ok(!api.calls.includes(`GET /subscriptions/${OTHER_SUB}`), "its subscription isn't read");
        assert.equal(db.get(`subscriptions/${ALI}`).paddle, undefined);
    });
    // The customer is linked to Bob (or left by a deleted account): Paddle isn't even asked.
    for (const mapping of [{ email: BOB, environment: "sandbox" }, { email: ALI, environment: "sandbox", deleted: true }]) {
        await withPaddle(seed({ [`paddle_customers/${CUSTOMER}`]: mapping }), { transactions: [{ id: TXN, status: "completed", customer_id: CUSTOMER, subscription_id: SUB }], subscriptions: [subscription()] }, async (db, api) => {
            assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "none");
            assert.deepEqual(api.calls, []);
        });
    }
    // Live keys and a sandbox customer: nothing to ask.
    const live = seed({ [`subscriptions/${ALI}`]: { plan: "free", status: "active", paddleCustomerId: CUSTOMER, paddleEnvironment: "production" } });
    await withPaddle(live, { subscriptions: [subscription()] }, async (db, api) => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "none");
        assert.deepEqual(api.calls, []);
    });
    // No user document: never (the shared sync would cancel a deleted account's subscription).
    const ghost = seed();
    delete ghost[`users/${ALI}`];
    await withPaddle(ghost, { subscriptions: [subscription()] }, async (db, api) => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "none");
        assert.deepEqual(api.calls, []);
    });
});

test("a customer known only on the account is linked to it before syncing", async () => {
    const data = seed();
    delete data[`paddle_customers/${CUSTOMER}`];
    await withPaddle(data, { transactions: [{ id: TXN, status: "completed", customer_id: CUSTOMER, subscription_id: SUB }], subscriptions: [subscription()] }, async (db) => {
        assert.equal(await sync.syncAccountFromPaddle(ALI, NOW), "active");
        assert.equal(db.get(`paddle_customers/${CUSTOMER}`).email, ALI);
    });
});

test("rememberCheckout writes only its own field; it is read back for the configured environment", async () => {
    const commits = [];
    await withBackend({ [`subscriptions/${ALI}`]: { plan: "pro", note: "gift", paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox" } }, { onCommit: (writes) => commits.push(writes) }, async (db) => {
        await sync.rememberCheckout(ALI, TXN, new Date(NOW));
        await sync.rememberCheckout(ALI, "not-a-transaction", new Date(NOW));
        assert.equal(commits.length, 1, "an invalid id writes nothing");
        assert.deepEqual(commits[0][0].updateMask.fieldPaths, ["paddleCheckout"]);
        const stored = db.get(`subscriptions/${ALI}`);
        assert.equal(stored.plan, "pro");
        assert.equal(stored.note, "gift");
        assert.deepEqual(serverPlans.normalizeSubscription(stored, "sandbox").paddleCheckout, { transactionId: TXN, at: new Date(NOW).toISOString() });
        assert.equal(serverPlans.normalizeSubscription(stored, "production").paddleCheckout, null, "the other environment's checkout doesn't count");
    });
});

test("when /api/plans asks Paddle by itself (selfHealReason) and when a checkout counts as recent", () => {
    const base = { ...plans.FREE_SUBSCRIPTION };
    const state = (overrides = {}) => ({ environment: "sandbox", subscriptionId: SUB, customerId: CUSTOMER, status: "active", plan: "plus", interval: "month", priceId: PRICE, productId: PRODUCT, currentPeriodEnd: iso(10 * DAY), nextBilledAt: iso(10 * DAY), scheduledChange: null, canceledAt: null, paddleUpdatedAt: iso(0), syncedAt: iso(0), ...overrides });
    const recent = { transactionId: TXN, at: iso(-DAY) };
    assert.equal(sync.selfHealReason(base, NOW), null, "no Paddle customer: nothing to ask");
    assert.equal(sync.selfHealReason({ ...base, paddleCustomerId: CUSTOMER }, NOW), "unrecorded", "a customer and no subscription ever stored (also from before checkouts were remembered)");
    assert.equal(sync.selfHealReason({ ...base, paddleCustomerId: CUSTOMER, paddle: state() }, NOW), null, "entitled: nothing to ask");
    assert.equal(sync.selfHealReason({ ...base, paddleCustomerId: CUSTOMER, paddle: state({ status: "canceled" }) }, NOW), null, "an old canceled subscription and no new checkout");
    assert.equal(sync.selfHealReason({ ...base, paddleCustomerId: CUSTOMER, paddle: state({ status: "canceled" }), paddleCheckout: recent }, NOW), "unrecorded", "canceled, then a new checkout");
    assert.equal(sync.selfHealReason({ ...base, paddleCustomerId: CUSTOMER, paddle: state({ currentPeriodEnd: iso(-DAY) }) }, NOW), "lapsed", "the period ended without a renewal");
    assert.equal(plans.isRecentCheckout(recent, NOW), true);
    assert.equal(plans.isRecentCheckout({ transactionId: TXN, at: iso(-8 * DAY) }, NOW), false);
    assert.equal(plans.isRecentCheckout({ transactionId: TXN, at: iso(DAY) }, NOW), false, "a date in the future is junk");
    assert.equal(plans.isRecentCheckout(null, NOW), false);
});

test("withDeadline: the answer when it comes in time, the fallback when it doesn't", async () => {
    assert.equal(await sync.withDeadline(Promise.resolve("active"), 1_000, "none"), "active");
    assert.equal(await sync.withDeadline(new Promise((resolve) => setTimeout(() => resolve("active"), 200)), 20, "none"), "none");
    await assert.rejects(sync.withDeadline(Promise.reject(new Error("boom")), 1_000, "none"), /boom/, "errors are the caller's to catch");
});

test("the webhook records how a delivery was processed, after processing; refusals are noted once a minute per reason", async () => {
    const STATUS = "site_config/paddle_status";
    const data = { [`users/${ALI}`]: { email: ALI }, "site_config/paddle": SETTINGS, [`paddle_customers/${CUSTOMER}`]: { email: ALI, environment: "sandbox" } };
    await withPaddle(data, { subscriptions: [subscription()] }, async (db) => {
        assert.equal(await paddle.handlePaddleEvent({ event_id: "evt_1", event_type: "subscription.created", data: subscription() }), "stored");
        assert.equal(db.get(STATUS).lastEventResult, "stored");
        assert.equal(db.get(STATUS).lastEventType, "subscription.created");
        assert.equal(await paddle.handlePaddleEvent({ event_type: "customer.updated", data: {} }), "ignored");
        assert.equal(db.get(STATUS).lastEventResult, "ignored");
        // transaction.completed re-reads the subscription; Paddle doesn't know it: failed, Paddle retries.
        await assert.rejects(paddle.handlePaddleEvent({ event_type: "transaction.completed", data: { subscription_id: OTHER_SUB } }));
        assert.equal(db.get(STATUS).lastEventResult, "failed:entity_not_found");
        assert.equal(db.get(STATUS).lastEventType, "transaction.completed");
    });
    paddle.forgetPaddleCaches();
    const commits = [];
    await withBackend({}, { onCommit: (writes) => commits.push(writes) }, async (db) => {
        await paddle.recordWebhookRejection("ip_not_allowed", NOW);
        await paddle.recordWebhookRejection("ip_not_allowed", NOW + 10_000);
        await paddle.recordWebhookRejection("signature_mismatch", NOW + 20_000);
        await paddle.recordWebhookRejection("ip_not_allowed", NOW + 61_000);
        assert.equal(commits.length, 3, "the same reason within a minute is written once");
        assert.equal(db.get(STATUS).lastRejectedReason, "ip_not_allowed");
        assert.deepEqual(commits[0][0].updateMask.fieldPaths, ["lastRejectedAt", "lastRejectedReason"]);
    });
});
