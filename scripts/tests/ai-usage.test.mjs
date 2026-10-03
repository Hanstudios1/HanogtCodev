// Run: node --test scripts/tests/*.test.mjs
// Hanogt AI usage (lib/server/ai-usage.ts, lib/ai/usage.ts): what the meter
// shows, how a message is counted (minute first, then the day; a purchase
// Paddle never reported is looked up before refusing), the 429 details and
// the X-Hanogt-AI-* headers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const usage = await load("lib/server/ai-usage.ts");
const shared = await load("lib/ai/usage.ts");
const paddle = await load("lib/server/paddle.ts");
const plans = await load("lib/plans.ts");

const NOW = Date.now();
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
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
const FREE = plans.PLAN_AI_LIMITS.free;
const OWN_PLUS = plans.PLAN_AI_FEATURES.plus.ownKey;
const OWN_PRO = plans.PLAN_AI_FEATURES.pro.ownKey;
const PLUS = plans.PLAN_AI_LIMITS.plus;

/** Where a rate-limit window lives (src/lib/server/rate-limit.ts). */
const windowPath = (key) => `security_rate_limits/${createHash("sha256").update(`test-salt:${key}`).digest("hex")}`;
const windowDoc = (count, startedAt = NOW - HOUR) => ({ count, windowStartedAt: startedAt, expiresAt: new Date(startedAt + 2 * DAY) });
const KEYS = { minute: `ai:${ALI}`, day: `ai-day:${ALI}`, ownMinute: `ai-own:${ALI}`, ownDay: `ai-own-day:${ALI}` };

function seed(subscription = { plan: "free", status: "active" }, extra = {}) {
    return { [`users/${ALI}`]: { email: ALI }, "site_config/paddle": SETTINGS, [`subscriptions/${ALI}`]: subscription, ...extra };
}

/** Paddle that only answers reads; `calls` lists what was asked. */
function createPaddle(subscriptions = []) {
    const state = { calls: [] };
    state.route = async (url, init = {}) => {
        assert.equal(url.host, PADDLE_HOST, `unexpected request to ${url.href}`);
        const method = (init.method || "GET").toUpperCase();
        state.calls.push(`${method} ${url.pathname}`);
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

async function withPaddle(data, subscriptions, run) {
    paddle.forgetPaddleCaches();
    const api = createPaddle(subscriptions);
    return withBackend(data, { route: api.route }, (db) => run(db, api));
}

const PLUS_AT_PADDLE = {
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
const UNRECORDED = { plan: "free", status: "active", paddleCustomerId: CUSTOMER, paddleEnvironment: "sandbox" };
const PADDLE_CUSTOMER = { [`paddle_customers/${CUSTOMER}`]: { email: ALI, environment: "sandbox", deleted: false } };

test("no window yet: nothing used; an ended window counts as none", async () => {
    assert.deepEqual(usage.usageWindow(null, 250), { limit: 250, used: 0, remaining: 250, resetsAt: null });
    await withPaddle(seed(undefined, { [windowPath(KEYS.day)]: windowDoc(120, NOW - DAY - HOUR) }), [], async () => {
        const read = await usage.aiUsageFor(ALI);
        assert.equal(read.plan, "free");
        assert.deepEqual(read.hanogt.day, { limit: FREE.perDay, used: 0, remaining: FREE.perDay, resetsAt: null }, "the 24 hours are over");
        assert.deepEqual([read.hanogt.minute.limit, read.hanogt.bonus], [FREE.perMinute, 0]);
        assert.equal(read.own, null, "Free has no own connections");
    });
});

test("an open window shows what is used and when it resets", async () => {
    const started = NOW - 3 * HOUR;
    await withPaddle(seed(undefined, { [windowPath(KEYS.day)]: windowDoc(42, started) }), [], async () => {
        const { day } = (await usage.aiUsageFor(ALI)).hanogt;
        assert.deepEqual(day, { limit: FREE.perDay, used: 42, remaining: FREE.perDay - 42, resetsAt: new Date(started + DAY).toISOString() });
    });
});

test("a staff grant is part of the day's limit and shown as the bonus; own connections appear with Plus", async () => {
    const granted = { plan: "plus", status: "active", aiBonusDaily: 100, aiBonusUntil: iso(DAY) };
    await withPaddle(seed(granted, { [windowPath(KEYS.ownDay)]: windowDoc(7) }), [], async () => {
        const read = await usage.aiUsageFor(ALI);
        assert.equal(read.plan, "plus");
        assert.equal(read.hanogt.day.limit, PLUS.perDay + 100);
        assert.equal(read.hanogt.bonus, 100);
        assert.deepEqual([read.own.day.used, read.own.day.limit, read.own.minute.limit], [7, OWN_PLUS.perDay, OWN_PLUS.perMinute]);
    });
});

test("a message counts once in the minute and once in the day, and the answer reports the day", async () => {
    await withPaddle(seed(), [], async (db) => {
        const counted = await usage.enforceHanogtAi(ALI);
        assert.equal(counted.ok, true);
        assert.equal(counted.plan, "free");
        assert.deepEqual([counted.quota.quota, counted.quota.limit, counted.quota.remaining], ["hanogt", FREE.perDay, FREE.perDay - 1]);
        assert.ok(Math.abs(Date.parse(counted.quota.resetsAt) - (Date.now() + DAY)) < 5_000, counted.quota.resetsAt);
        assert.equal(db.get(windowPath(KEYS.minute)).count, 1);
        assert.equal(db.get(windowPath(KEYS.day)).count, 1);
        const headers = usage.quotaHeaders(counted.quota);
        assert.deepEqual(shared.quotaFromHeaders(new Headers(headers)), counted.quota, "headers round-trip");
    });
});

test("a refused burst never uses up the day", async () => {
    await withPaddle(seed(undefined, { [windowPath(KEYS.minute)]: windowDoc(FREE.perMinute, NOW - 10_000) }), [], async (db) => {
        const refused = await usage.enforceHanogtAi(ALI);
        assert.equal(refused.ok, false);
        assert.equal(refused.code, "rate_limited");
        assert.ok(refused.retryAfterSeconds >= 1 && refused.retryAfterSeconds <= 60);
        assert.equal(db.get(windowPath(KEYS.day)), null, "the day wasn't counted");
    });
});

test("at the daily limit: 429 details with the limit, the reset time and the plan that raises it", async () => {
    const started = NOW - 5 * HOUR;
    await withPaddle(seed(undefined, { [windowPath(KEYS.day)]: windowDoc(FREE.perDay, started) }), [], async (db, api) => {
        const refused = await usage.enforceHanogtAi(ALI);
        assert.equal(refused.ok, false);
        assert.equal(refused.code, "daily_limit");
        assert.deepEqual(usage.refusalDetails(refused), { plan: "free", limit: FREE.perDay, used: FREE.perDay, resetsAt: refused.resetsAt, upgrade: "plus" });
        assert.ok(Math.abs(Date.parse(refused.resetsAt) - (started + DAY)) < 2_000, "resets 24 hours after the first message");
        assert.deepEqual(api.calls, [], "nothing at Paddle could change it (no customer)");
        const details = shared.limitDetailsOf({ code: "daily_limit", error: "x", ...usage.refusalDetails(refused) });
        assert.deepEqual(details, { quota: "hanogt", plan: "free", limit: FREE.perDay, used: FREE.perDay, resetsAt: refused.resetsAt, upgrade: "plus" });
    });
    // Pro has nothing above it.
    await withPaddle(seed({ plan: "pro", status: "active" }, { [windowPath(KEYS.day)]: windowDoc(plans.PLAN_AI_LIMITS.pro.perDay) }), [], async () => {
        const refused = await usage.enforceHanogtAi(ALI);
        assert.deepEqual([refused.code, refused.upgrade], ["daily_limit", null]);
    });
});

test("paid but not reported: the day refusing asks Paddle once, and the message counts exactly once at the new limit", async () => {
    await withPaddle(seed(UNRECORDED, { ...PADDLE_CUSTOMER, [windowPath(KEYS.day)]: windowDoc(FREE.perDay) }), [PLUS_AT_PADDLE], async (db, api) => {
        const counted = await usage.enforceHanogtAi(ALI);
        assert.equal(counted.ok, true, JSON.stringify(counted));
        assert.equal(counted.plan, "plus");
        assert.deepEqual([counted.quota.limit, counted.quota.remaining], [PLUS.perDay, PLUS.perDay - FREE.perDay - 1]);
        assert.equal(db.get(windowPath(KEYS.day)).count, FREE.perDay + 1);
        assert.equal(db.get(windowPath(KEYS.minute)).count, 1, "the minute that let it through isn't counted again");
        assert.ok(api.calls.length > 0);
        assert.equal(db.get(`subscriptions/${ALI}`).paddle.subscriptionId, SUB);
    });
});

test("own connections: Free has none (connection_unavailable, nothing counted); Plus counts its own windows", async () => {
    await withPaddle(seed(), [], async (db) => {
        const refused = await usage.enforceOwnKeys(ALI);
        assert.deepEqual(refused, { ok: false, code: "connection_unavailable", plan: "free" });
        assert.equal(db.get(windowPath(KEYS.ownMinute)), null);
    });
    await withPaddle(seed({ plan: "plus", status: "active" }, { [windowPath(KEYS.ownDay)]: windowDoc(OWN_PLUS.perDay) }), [], async (db) => {
        const refused = await usage.enforceOwnKeys(ALI);
        assert.equal(refused.code, "connection_daily_limit");
        assert.equal(refused.quota, "own");
        assert.equal(shared.limitDetailsOf({ code: refused.code, ...usage.refusalDetails(refused) }).quota, "own");
        assert.equal(db.get(windowPath(KEYS.day)), null, "Hanogt AI's own day is untouched");
    });
    await withPaddle(seed({ plan: "pro", status: "active" }), [], async () => {
        const counted = await usage.enforceOwnKeys(ALI);
        assert.deepEqual([counted.ok, counted.quota.quota, counted.quota.limit], [true, "own", OWN_PRO.perDay]);
    });
});

test("planUsageFor counts projects, games, groups and connections against the plan", async () => {
    const data = seed(undefined, {
        "projects/p1": { email: ALI }, "projects/p2": { email: ALI }, "projects/other": { email: "bob@example.com" },
        "game_projects/g1": { ownerEmail: ALI },
        "groups/a": { ownerEmail: ALI }, "groups/b": { ownerEmail: ALI }, "groups/c": { ownerEmail: ALI },
    });
    await withPaddle(data, [], async () => {
        const read = await usage.planUsageFor(ALI);
        assert.deepEqual(read.counts, {
            codeProjects: { used: 2, limit: plans.PLAN_PROJECT_LIMITS.free.code },
            gameProjects: { used: 1, limit: plans.PLAN_PROJECT_LIMITS.free.game },
            groups: { used: 3, limit: plans.PLAN_GROUP_LIMITS.free },
            connections: { used: 0, limit: 0 },
            apiKeys: null,
        });
        assert.equal(read.api, null, "the developer API isn't listed unless it is open to the account");
    });
    await withPaddle(seed({ plan: "pro", status: "active" }, { "groups/a": { ownerEmail: ALI }, [`ai_api_keys/${ALI}`]: { items: [{ id: "key_0000000000000001" }, { id: "key_0000000000000002" }] } }), [], async () => {
        const read = await usage.planUsageFor(ALI, null, { api: true });
        assert.deepEqual(read.counts.groups, { used: 1, limit: null }, "unlimited");
        assert.deepEqual(read.counts.apiKeys, { used: 2, limit: plans.PLAN_AI_FEATURES.pro.api.keys });
        assert.deepEqual([read.api.day.limit, read.api.minute.limit, read.api.day.used], [plans.PLAN_AI_FEATURES.pro.api.perDay, plans.PLAN_AI_FEATURES.pro.api.perMinute, 0]);
    });
});

test("the browser side: usage answers and headers are checked, windows move on", () => {
    assert.equal(shared.readAiUsage({ plan: "gold", hanogt: {} }), null);
    assert.equal(shared.readAiUsage({ plan: "free", hanogt: { day: { limit: -1, used: 0, remaining: 0 }, minute: { limit: 1, used: 0, remaining: 1 } } }), null);
    const valid = { plan: "plus", hanogt: { day: { limit: 750, used: 10, remaining: 740, resetsAt: iso(HOUR) }, minute: { limit: 20, used: 1, remaining: 19, resetsAt: null }, bonus: 0 }, own: null, api: null, engine: null };
    assert.deepEqual(shared.readAiUsage(valid), valid);
    const withEngine = { ...valid, engine: { limit: 25, used: 4, remaining: 21, resetsAt: iso(HOUR) } };
    assert.deepEqual(shared.readAiUsage(withEngine), withEngine, "the advanced engine's window when the server has the engine");
    assert.equal(shared.readAiUsage({ ...valid, engine: { limit: "x" } }).engine, null);
    const withApi = { ...valid, api: { day: { limit: 250, used: 3, remaining: 247, resetsAt: iso(HOUR) }, minute: { limit: 10, used: 1, remaining: 9, resetsAt: null } } };
    assert.deepEqual(shared.readAiUsage(withApi), withApi);
    assert.equal(shared.readAiUsage({ ...valid, api: { day: { limit: 1 } } }).api, null, "a broken API part is dropped, the rest stays");
    assert.equal(shared.quotaFromHeaders(new Headers({ "X-Hanogt-AI-Quota": "other", "X-Hanogt-AI-Day-Limit": "1", "X-Hanogt-AI-Day-Remaining": "1" })), null);
    assert.equal(shared.limitDetailsOf({ code: "rate_limited", plan: "free", limit: 12 }), null, "only daily limits carry details");
    const after = shared.windowAfter(valid.hanogt.day, { quota: "hanogt", limit: 750, remaining: 739, resetsAt: null });
    assert.deepEqual(after, { limit: 750, used: 11, remaining: 739, resetsAt: valid.hanogt.day.resetsAt });
    assert.deepEqual(shared.currentWindow({ limit: 750, used: 750, remaining: 0, resetsAt: iso(-1) }), { limit: 750, used: 0, remaining: 750, resetsAt: null });
    assert.deepEqual([shared.usageLevel({ limit: 100, used: 79, remaining: 21 }), shared.usageLevel({ limit: 100, used: 80, remaining: 20 }), shared.usageLevel({ limit: 100, used: 100, remaining: 0 })], ["ok", "high", "full"]);
    assert.match(shared.formatResetTime(new Date(NOW).toISOString(), "tr-TR", NOW), /^\d{2}[:.]\d{2}$/);
    assert.equal(plans.nextPlanUp("free"), "plus");
    assert.equal(plans.nextPlanUp("pro"), null);
});
