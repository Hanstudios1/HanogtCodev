// Run: node --test scripts/tests/*.test.mjs
// Hanogt AI usage (lib/server/ai-usage.ts, lib/ai/usage.ts): what the meter
// shows, how a message is counted (minute first, then the plan's window,
// shared by the chat, the developer API and Social groups; a purchase Paddle
// never reported is looked up before refusing; a message the model never
// answered is given back), the 429 details and the X-Hanogt-AI-* headers.
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
const PRO = plans.PLAN_AI_LIMITS.pro;

/** Where a rate-limit window lives (src/lib/server/rate-limit.ts). */
const windowPath = (key) => `security_rate_limits/${createHash("sha256").update(`test-salt:${key}`).digest("hex")}`;
const windowDoc = (count, startedAt = NOW - HOUR) => ({ count, windowStartedAt: startedAt, expiresAt: new Date(startedAt + 2 * DAY) });
const KEYS = { minute: `ai:${ALI}`, window: `ai-window:${ALI}`, ownMinute: `ai-own:${ALI}`, ownDay: `ai-own-day:${ALI}` };

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
    assert.deepEqual(usage.usageWindow(null, 50), { limit: 50, used: 0, remaining: 50, resetsAt: null });
    await withPaddle(seed(undefined, { [windowPath(KEYS.window)]: windowDoc(40, NOW - FREE.windowDays * DAY - HOUR) }), [], async () => {
        const read = await usage.aiUsageFor(ALI);
        assert.equal(read.plan, "free");
        assert.deepEqual(read.hanogt.window, { limit: FREE.perWindow, used: 0, remaining: FREE.perWindow, resetsAt: null }, "the week is over");
        assert.deepEqual([read.hanogt.minute.limit, read.hanogt.windowDays, read.hanogt.bonus], [FREE.perMinute, FREE.windowDays, 0]);
        assert.equal(read.own, null, "Free has no own connections");
    });
});

test("the plans' windows: Free 50 in a week, Plus 750 in two weeks, Pro 2,000 in a week", () => {
    assert.deepEqual([FREE.perWindow, FREE.windowDays, FREE.perMinute], [50, 7, 5]);
    assert.deepEqual([PLUS.perWindow, PLUS.windowDays, PLUS.perMinute], [750, 14, 20]);
    assert.deepEqual([PRO.perWindow, PRO.windowDays, PRO.perMinute], [2000, 7, 30]);
});

test("an open window shows what is used and when it resets; Plus's lasts two weeks", async () => {
    const started = NOW - 3 * DAY;
    await withPaddle(seed(undefined, { [windowPath(KEYS.window)]: windowDoc(42, started) }), [], async () => {
        const { window } = (await usage.aiUsageFor(ALI)).hanogt;
        assert.deepEqual(window, { limit: FREE.perWindow, used: 42, remaining: FREE.perWindow - 42, resetsAt: new Date(started + FREE.windowDays * DAY).toISOString() });
    });
    // Ten days in: over for a week's window, still open for Plus's two weeks.
    const older = NOW - 10 * DAY;
    await withPaddle(seed({ plan: "plus", status: "active" }, { [windowPath(KEYS.window)]: windowDoc(300, older) }), [], async () => {
        const { window, windowDays } = (await usage.aiUsageFor(ALI)).hanogt;
        assert.equal(windowDays, 14);
        assert.deepEqual(window, { limit: PLUS.perWindow, used: 300, remaining: PLUS.perWindow - 300, resetsAt: new Date(older + 14 * DAY).toISOString() });
    });
});

test("a staff grant is part of the window's limit and shown as the bonus; own connections appear with Plus", async () => {
    const granted = { plan: "plus", status: "active", aiBonusDaily: 100, aiBonusUntil: iso(DAY) };
    await withPaddle(seed(granted, { [windowPath(KEYS.ownDay)]: windowDoc(7) }), [], async () => {
        const read = await usage.aiUsageFor(ALI);
        assert.equal(read.plan, "plus");
        assert.equal(read.hanogt.window.limit, PLUS.perWindow + 100);
        assert.equal(read.hanogt.bonus, 100);
        assert.deepEqual([read.own.day.used, read.own.day.limit, read.own.minute.limit], [7, OWN_PLUS.perDay, OWN_PLUS.perMinute]);
    });
});

test("a message counts once in the minute and once in the window, and the answer reports the window", async () => {
    await withPaddle(seed(), [], async (db) => {
        const counted = await usage.enforceHanogtAi(ALI);
        assert.equal(counted.ok, true);
        assert.equal(counted.plan, "free");
        assert.deepEqual([counted.quota.quota, counted.quota.limit, counted.quota.remaining, counted.quota.windowDays], ["hanogt", FREE.perWindow, FREE.perWindow - 1, FREE.windowDays]);
        assert.ok(Math.abs(Date.parse(counted.quota.resetsAt) - (Date.now() + FREE.windowDays * DAY)) < 5_000, counted.quota.resetsAt);
        assert.deepEqual([counted.minute.limit, counted.minute.remaining], [FREE.perMinute, FREE.perMinute - 1]);
        assert.equal(db.get(windowPath(KEYS.minute)).count, 1);
        assert.equal(db.get(windowPath(KEYS.window)).count, 1);
        const headers = usage.quotaHeaders(counted.quota);
        assert.equal(headers["X-Hanogt-AI-Window-Days"], String(FREE.windowDays));
        assert.deepEqual(shared.quotaFromHeaders(new Headers(headers)), counted.quota, "headers round-trip");
    });
});

test("the chat, the developer API and a group share one window; a message the model never answered is given back", async () => {
    await withPaddle(seed({ plan: "plus", status: "active" }), [], async (db) => {
        const chat = await usage.enforceHanogtAi(ALI, { source: "chat" });
        const api = await usage.enforceHanogtAi(ALI, { source: "api" });
        const group = await usage.enforceHanogtAi(ALI, { source: "group" });
        assert.deepEqual([chat.ok, api.ok, group.ok], [true, true, true]);
        assert.equal(group.quota.remaining, PLUS.perWindow - 3);
        assert.equal(db.get(windowPath(KEYS.window)).count, 3);
        assert.equal(await usage.refundHanogtAi(api), true);
        assert.equal(db.get(windowPath(KEYS.window)).count, 2);
        assert.equal(db.get(windowPath(KEYS.minute)).count, 3, "the minute guard isn't given back");
        // Only the window that counted it: one that started afresh is left alone.
        assert.equal(await usage.refundHanogtAi({ ...chat, counted: { ...chat.counted, startedAt: chat.counted.startedAt - 1 } }), false);
        assert.equal(db.get(windowPath(KEYS.window)).count, 2);
    });
});

test("a refused burst never uses up the window", async () => {
    await withPaddle(seed(undefined, { [windowPath(KEYS.minute)]: windowDoc(FREE.perMinute, NOW - 10_000) }), [], async (db) => {
        const refused = await usage.enforceHanogtAi(ALI);
        assert.equal(refused.ok, false);
        assert.equal(refused.code, "rate_limited");
        assert.ok(refused.retryAfterSeconds >= 1 && refused.retryAfterSeconds <= 60);
        assert.equal(db.get(windowPath(KEYS.window)), null, "the window wasn't counted");
    });
});

test("at the window's limit: 429 details with the limit, the reset time and the plan that raises it", async () => {
    const started = NOW - 2 * DAY;
    await withPaddle(seed(undefined, { [windowPath(KEYS.window)]: windowDoc(FREE.perWindow, started) }), [], async (db, api) => {
        const refused = await usage.enforceHanogtAi(ALI);
        assert.equal(refused.ok, false);
        assert.equal(refused.code, "usage_limit");
        assert.deepEqual(usage.refusalDetails(refused), { quota: "hanogt", plan: "free", limit: FREE.perWindow, used: FREE.perWindow, resetsAt: refused.resetsAt, windowDays: FREE.windowDays, upgrade: "plus" });
        assert.ok(Math.abs(Date.parse(refused.resetsAt) - (started + FREE.windowDays * DAY)) < 2_000, "resets a week after the first message");
        assert.deepEqual(api.calls, [], "nothing at Paddle could change it (no customer)");
        const details = shared.limitDetailsOf({ code: "usage_limit", error: "x", ...usage.refusalDetails(refused) });
        assert.deepEqual(details, { quota: "hanogt", plan: "free", limit: FREE.perWindow, used: FREE.perWindow, resetsAt: refused.resetsAt, upgrade: "plus", windowDays: FREE.windowDays });
    });
    // Pro has nothing above it.
    await withPaddle(seed({ plan: "pro", status: "active" }, { [windowPath(KEYS.window)]: windowDoc(PRO.perWindow) }), [], async () => {
        const refused = await usage.enforceHanogtAi(ALI);
        assert.deepEqual([refused.code, refused.upgrade], ["usage_limit", null]);
    });
    // An older server's answer still reads as Hanogt AI's limit, a day long.
    assert.deepEqual(shared.limitDetailsOf({ code: "daily_limit", plan: "free", limit: 250, used: 250, resetsAt: null }), { quota: "hanogt", plan: "free", limit: 250, used: 250, resetsAt: null, upgrade: null, windowDays: 1 });
});

test("paid but not reported: the window refusing asks Paddle once, and the message counts exactly once at the new limit", async () => {
    await withPaddle(seed(UNRECORDED, { ...PADDLE_CUSTOMER, [windowPath(KEYS.window)]: windowDoc(FREE.perWindow) }), [PLUS_AT_PADDLE], async (db, api) => {
        const counted = await usage.enforceHanogtAi(ALI);
        assert.equal(counted.ok, true, JSON.stringify(counted));
        assert.equal(counted.plan, "plus");
        assert.deepEqual([counted.quota.limit, counted.quota.remaining, counted.quota.windowDays], [PLUS.perWindow, PLUS.perWindow - FREE.perWindow - 1, PLUS.windowDays]);
        assert.equal(db.get(windowPath(KEYS.window)).count, FREE.perWindow + 1);
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
        assert.equal(db.get(windowPath(KEYS.window)), null, "Hanogt AI's own window is untouched");
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
        assert.equal(read.hanogt.window.limit, FREE.perWindow);
    });
    const connections = { items: [{ id: "c1", provider: "groq" }, { id: "c2", provider: "openai" }] };
    await withPaddle(seed({ plan: "pro", status: "active" }, { "groups/a": { ownerEmail: ALI }, [`ai_api_keys/${ALI}`]: { items: [{ id: "key_0000000000000001" }, { id: "key_0000000000000002" }] }, [`ai_connections/${ALI}`]: connections }), [], async () => {
        const read = await usage.planUsageFor(ALI, null, { api: true });
        assert.deepEqual(read.counts.groups, { used: 1, limit: null }, "unlimited");
        assert.deepEqual(read.counts.apiKeys, { used: 2, limit: plans.PLAN_AI_FEATURES.pro.api.keys });
        assert.deepEqual(read.counts.connections, { used: 1, limit: plans.PLAN_AI_CONNECTIONS.pro }, "a retired provider's connection doesn't count");
        assert.equal(read.api, undefined, "the API has no window of its own: it uses Hanogt AI's");
    });
});

test("the browser side: usage answers and headers are checked, windows move on", () => {
    assert.equal(shared.readAiUsage({ plan: "gold", hanogt: {} }), null);
    assert.equal(shared.readAiUsage({ plan: "free", hanogt: { window: { limit: -1, used: 0, remaining: 0 }, minute: { limit: 1, used: 0, remaining: 1 } } }), null);
    const valid = { plan: "plus", hanogt: { window: { limit: 750, used: 10, remaining: 740, resetsAt: iso(HOUR) }, minute: { limit: 20, used: 1, remaining: 19, resetsAt: null }, windowDays: 14, bonus: 0 }, own: null };
    assert.deepEqual(shared.readAiUsage(valid), valid);
    assert.equal(shared.readAiUsage({ ...valid, hanogt: { ...valid.hanogt, windowDays: "x" } }).hanogt.windowDays, 7, "a broken window length falls back to a week");
    const withOwn = { ...valid, own: { day: { limit: 3000, used: 3, remaining: 2997, resetsAt: iso(HOUR) }, minute: { limit: 30, used: 1, remaining: 29, resetsAt: null } } };
    assert.deepEqual(shared.readAiUsage(withOwn), withOwn);
    assert.equal(shared.readAiUsage({ ...valid, own: { day: { limit: 1 } } }).own, null, "a broken own part is dropped, the rest stays");
    assert.equal(shared.quotaFromHeaders(new Headers({ "X-Hanogt-AI-Quota": "other", "X-Hanogt-AI-Window-Limit": "1", "X-Hanogt-AI-Window-Remaining": "1" })), null);
    assert.deepEqual(shared.quotaFromHeaders(new Headers({ "X-Hanogt-AI-Quota": "hanogt", "X-Hanogt-AI-Window-Limit": "750", "X-Hanogt-AI-Window-Remaining": "739" })), { quota: "hanogt", limit: 750, remaining: 739, resetsAt: null, windowDays: 7 }, "a week when the days are missing");
    assert.equal(shared.quotaFromHeaders(new Headers({ "X-Hanogt-AI-Quota": "own", "X-Hanogt-AI-Window-Limit": "3000", "X-Hanogt-AI-Window-Remaining": "2" })).windowDays, 1, "own connections count by the day");
    assert.equal(shared.limitDetailsOf({ code: "rate_limited", plan: "free", limit: 5 }), null, "only used-up windows carry details");
    const after = shared.windowAfter(valid.hanogt.window, { quota: "hanogt", limit: 750, remaining: 739, resetsAt: null, windowDays: 14 });
    assert.deepEqual(after, { limit: 750, used: 11, remaining: 739, resetsAt: valid.hanogt.window.resetsAt });
    assert.deepEqual(shared.currentWindow({ limit: 750, used: 750, remaining: 0, resetsAt: iso(-1) }), { limit: 750, used: 0, remaining: 750, resetsAt: null });
    assert.deepEqual([shared.usageLevel({ limit: 100, used: 79, remaining: 21 }), shared.usageLevel({ limit: 100, used: 80, remaining: 20 }), shared.usageLevel({ limit: 100, used: 100, remaining: 0 })], ["ok", "high", "full"]);
    assert.match(shared.formatResetTime(new Date(NOW).toISOString(), "tr-TR", NOW), /^\d{2}[:.]\d{2}$/);
    assert.match(shared.formatResetTime(new Date(NOW + 10 * DAY).toISOString(), "en-GB", NOW), /\b\d{1,2} [A-Z][a-z]{2}/, "a window two weeks long shows the date");
    assert.deepEqual([plans.aiWindowCopy(7).EN, plans.aiWindowCopy(14).TR, plans.aiWindowCopy(1).EN], ["a week", "2 haftada", "a day"]);
    assert.equal(plans.nextPlanUp("free"), "plus");
    assert.equal(plans.nextPlanUp("pro"), null);
});
