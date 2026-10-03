// Run: node --test scripts/tests/*.test.mjs
// Plan benefits right after paying (lib/server/entitlements.ts): before a
// limit refuses someone, Paddle is asked once (only when it may help), and a
// higher plan is counted again with its own limit.
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

const entitlements = await load("lib/server/entitlements.ts");
const paddle = await load("lib/server/paddle.ts");
const plans = await load("lib/plans.ts");

const NOW = Date.now();
const DAY = 24 * 60 * 60_000;
const iso = (offset) => new Date(NOW + offset).toISOString();
const ALI = "ali@example.com";
const CUSTOMER = "ctm_01aaaaaaaaaaaaaaaaaaaaaaaa";
const SUB = "sub_01aaaaaaaaaaaaaaaaaaaaaaaa";
const PRICE = "pri_01plusmonthxxxxxxxxxxxxxxx";
const PRODUCT = "pro_01plusproductxxxxxxxxxxxx";
const SETTINGS = {
    sandbox: { prices: { plus: { month: PRICE, year: null }, pro: { month: null, year: null } }, products: { plus: [PRODUCT], pro: [] }, salesOpen: true },
    production: { prices: {}, products: {} },
};

/** Ali's Plus subscription, which Paddle never reported. */
const PLUS = {
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
};

/** Paddle answering reads only; `calls` lists what was asked. */
function createPaddle(subscriptions = []) {
    const state = { calls: [] };
    state.route = async (url, init = {}) => {
        assert.equal(url.host, PADDLE_HOST, `unexpected request to ${url.href}`);
        const method = (init.method || "GET").toUpperCase();
        state.calls.push(`${method} ${url.pathname}`);
        assert.equal(method, "GET", "a limit check only reads Paddle");
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] === "subscriptions" && parts[1]) {
            const entry = subscriptions.find((item) => item.id === parts[1]);
            return entry ? json(200, { data: entry }) : json(404, { error: { type: "request_error", code: "entity_not_found", detail: "" } });
        }
        if (parts[0] === "subscriptions") return json(200, { data: subscriptions.filter((item) => item.customer_id === url.searchParams.get("customer_id")) });
        throw new Error(`Unsupported Paddle request ${method} ${url.pathname}`);
    };
    return state;
}

function seed(subscription) {
    return {
        [`users/${ALI}`]: { email: ALI },
        "site_config/paddle": SETTINGS,
        [`paddle_customers/${CUSTOMER}`]: { email: ALI, environment: "sandbox", deleted: false },
        [`subscriptions/${ALI}`]: subscription,
    };
}

/** A paying customer whose purchase was never stored (the notification was lost). */
const UNRECORDED = { plan: "free", status: "active", paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox" };

async function withPaddle(data, subscriptions, run) {
    paddle.forgetPaddleCaches();
    const api = createPaddle(subscriptions);
    return withBackend(data, { route: api.route }, (db) => run(db, api));
}

/** A count that has `owned` items and records each cap it was asked with. */
function counter(owned) {
    const caps = [];
    const count = async (upTo) => {
        caps.push(upTo);
        return Math.min(owned, upTo);
    };
    return { caps, count };
}

test("under the limit: allowed without asking Paddle; the count stops one past the limit", async () => {
    await withPaddle(seed(UNRECORDED), [PLUS], async (db, api) => {
        const { caps, count } = counter(4);
        assert.deepEqual(await entitlements.planQuota(ALI, "code", count), { allowed: true, plan: "free", limit: plans.PLAN_PROJECT_LIMITS.free.code });
        assert.deepEqual(caps, [plans.PLAN_PROJECT_LIMITS.free.code + 1]);
        assert.deepEqual(api.calls, []);
    });
});

test("at the limit with nothing Paddle could change: refused without asking it", async () => {
    // No Paddle customer: selfHealReason has nothing to look for.
    await withPaddle(seed({ plan: "free", status: "active" }), [PLUS], async (db, api) => {
        const { caps, count } = counter(3);
        assert.deepEqual(await entitlements.planQuota(ALI, "group", count), { allowed: false, plan: "free", limit: plans.PLAN_GROUP_LIMITS.free });
        assert.deepEqual(caps, [plans.PLAN_GROUP_LIMITS.free + 1], "counted once");
        assert.deepEqual(api.calls, []);
    });
});

test("at the Free limit after paying: Paddle's subscription unlocks Plus and the count is taken again with its limit", async () => {
    await withPaddle(seed(UNRECORDED), [PLUS], async (db, api) => {
        const { caps, count } = counter(10);
        let handedOver = null;
        const answer = await entitlements.planQuota(ALI, "code", count, { onLate: (work) => { handedOver = work; } });
        assert.deepEqual(answer, { allowed: true, plan: "plus", limit: plans.PLAN_PROJECT_LIMITS.plus.code });
        assert.deepEqual(caps, [plans.PLAN_PROJECT_LIMITS.free.code + 1, plans.PLAN_PROJECT_LIMITS.plus.code + 1], "a count capped at the old limit is never reused");
        assert.equal(handedOver, null, "Paddle answered in time");
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.subscriptionId, SUB, "the purchase is stored for every other limit too");
        assert.ok(api.calls.length > 0);
    });
});

test("upgraded but over the new limit too: refused with the new plan and limit", async () => {
    await withPaddle(seed(UNRECORDED), [PLUS], async () => {
        const { caps, count } = counter(500);
        assert.deepEqual(await entitlements.planQuota(ALI, "game", count), { allowed: false, plan: "plus", limit: plans.PLAN_PROJECT_LIMITS.plus.game });
        assert.equal(caps.length, 2);
    });
});

test("Paddle finds nothing: refused at the old limit, and asked at most once every ten minutes", async () => {
    await withPaddle(seed(UNRECORDED), [], async (db, api) => {
        const { count } = counter(3);
        assert.deepEqual(await entitlements.planQuota(ALI, "group", count), { allowed: false, plan: "free", limit: plans.PLAN_GROUP_LIMITS.free });
        const asked = api.calls.length;
        assert.ok(asked > 0, "Paddle was asked once");
        assert.equal((await entitlements.planQuota(ALI, "group", count)).allowed, false);
        assert.equal(api.calls.length, asked, "the second refusal doesn't ask again");
    });
});

test("unlimited plans never count", async () => {
    await withPaddle(seed({ plan: "pro", status: "active" }), [], async (db, api) => {
        const { caps, count } = counter(10_000);
        assert.deepEqual(await entitlements.planQuota(ALI, "group", count), { allowed: true, plan: "pro", limit: null });
        assert.deepEqual(caps, []);
        assert.deepEqual(api.calls, []);
    });
});

test("healBeforeRefusing reports whether the plan went up", async () => {
    await withPaddle(seed(UNRECORDED), [PLUS], async () => {
        const healed = await entitlements.healBeforeRefusing(ALI);
        assert.equal(healed.upgraded, true);
        assert.equal(healed.plan, "plus");
        assert.equal(healed.subscription.paddle.subscriptionId, SUB);
    });
    await withPaddle(seed({ plan: "plus", status: "active" }), [PLUS], async (db, api) => {
        const healed = await entitlements.healBeforeRefusing(ALI);
        assert.deepEqual([healed.upgraded, healed.plan], [false, "plus"]);
        assert.deepEqual(api.calls, [], "a staff plan without a Paddle customer has nothing to look up");
    });
});

test("quota limits come from the plan tables", () => {
    for (const plan of plans.PLAN_IDS) {
        assert.equal(entitlements.quotaLimit("code", plan), plans.PLAN_PROJECT_LIMITS[plan].code);
        assert.equal(entitlements.quotaLimit("game", plan), plans.PLAN_PROJECT_LIMITS[plan].game);
        assert.equal(entitlements.quotaLimit("group", plan), plans.PLAN_GROUP_LIMITS[plan]);
    }
});
