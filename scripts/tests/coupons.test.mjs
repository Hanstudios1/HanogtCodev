// Run: node --test scripts/tests/
// Coupons on the Pricing page (lib/server/coupons.ts): which codes can be used,
// the Paddle discount a checkout carries (created, switched back on or widened
// to the mapped prices when needed), how many payments it covers, and the
// discount on the checkout's transaction.
import assert from "node:assert/strict";
import test from "node:test";
import { json, setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const PADDLE_HOST = "127.0.0.1:8788";
Object.assign(process.env, {
    PADDLE_API_KEY: "pdl_sdbx_apikey_01abcdefghijklmnopqrstuvwx_testkeytestkeytestkeyXX",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_0123456789abcdefghijkl",
    PADDLE_WEBHOOK_SECRET: "pdl_ntfset_01testsecret_abcdefghijklmnop",
    PADDLE_API_BASE_URL: `http://${PADDLE_HOST}`,
    NEXTAUTH_SECRET: "test-nextauth-secret",
});

const coupons = await load("lib/server/coupons.ts");
const admin = await load("lib/server/paddle-admin.ts");
const paddle = await load("lib/server/paddle.ts");
const plans = await load("lib/plans.ts");

const NOW = new Date(Date.UTC(2026, 9, 3, 12));
const PRICES = {
    plusMonth: "pri_01plusmonthxxxxxxxxxxxxxxx",
    plusYear: "pri_01plusyearxxxxxxxxxxxxxxxx",
    proMonth: "pri_01promonthxxxxxxxxxxxxxxxx",
    proYear: "pri_01proyearxxxxxxxxxxxxxxxxx",
};
const SETTINGS = {
    sandbox: { prices: { plus: { month: PRICES.plusMonth, year: PRICES.plusYear }, pro: { month: PRICES.proMonth, year: PRICES.proYear } }, products: { plus: [], pro: [] }, salesOpen: true },
    production: { prices: {}, products: {} },
};
const DISCOUNT = "dsc_01existingdiscountxxxxxxxx";
const coupon = (code, extra = {}) => ({ code, percentOff: 20, plan: "any", maxUses: null, used: 0, expiresAt: null, active: true, note: "", ...extra });
const seed = (extra = {}) => ({ "site_config/paddle": SETTINGS, ...extra });

/** A Paddle API with discounts only; records every call. */
function createPaddle(discounts = []) {
    const state = { discounts: structuredClone(discounts), calls: [] };
    let created = 0;
    async function route(url, init = {}) {
        assert.equal(url.host, PADDLE_HOST, `unexpected request to ${url.href}`);
        const method = (init.method || "GET").toUpperCase();
        const body = init.body ? JSON.parse(init.body) : null;
        state.calls.push({ method, path: url.pathname, body });
        if (method === "POST" && url.pathname === "/discounts") {
            // Paddle: one discount per code, archived ones included; null makes one up.
            const taken = body.code ? state.discounts.find((entry) => entry.code?.toUpperCase() === body.code.toUpperCase()) : null;
            if (taken) return json(409, { error: { code: "discount_code_conflict", detail: `Discount code conflicts with Discount ID ${taken.id}` } });
            const id = `dsc_01created${String(++created).padStart(16, "0")}`;
            const discount = { id, status: "active", times_used: 0, ...body, code: body.code ?? `GEN${String(created).padStart(7, "0")}` };
            state.discounts.push(discount);
            return json(201, { data: discount });
        }
        const one = /^\/discounts\/(dsc_[a-z0-9]+)$/.exec(url.pathname);
        const found = one ? state.discounts.find((entry) => entry.id === one[1]) : null;
        if (one && !found) return json(404, { error: { code: "entity_not_found", detail: "Not found" } });
        if (method === "GET" && found) return json(200, { data: found });
        if (method === "PATCH" && found) {
            Object.assign(found, body);
            return json(200, { data: found });
        }
        if (method === "POST" && url.pathname === "/transactions") return json(201, { data: { id: "txn_01newtransactionxxxxxxxxxx", status: "draft", ...body } });
        return json(404, { error: { code: "not_found", detail: `${method} ${url.pathname}` } });
    }
    return { state, route, writes: () => state.calls.filter((call) => call.method !== "GET") };
}

async function rejectsWith(promise, code) {
    await assert.rejects(promise, (error) => error instanceof coupons.CouponError && error.code === code, code);
}

test("which codes can be used: malformed, unknown, off, expired, used up, for the other plan", async () => {
    const data = seed({
        "plan_coupons/OFF20": coupon("OFF20", { active: false }),
        "plan_coupons/OLD20": coupon("OLD20", { expiresAt: new Date(NOW.getTime() - 1000) }),
        "plan_coupons/FULL20": coupon("FULL20", { maxUses: 5, used: 5 }),
        "plan_coupons/PRO20": coupon("PRO20", { plan: "pro", recur: 3, expiresAt: new Date(NOW.getTime() + 86_400_000) }),
        "plan_coupons/HANOGT20": coupon("HANOGT20"),
        "plan_coupons/BROKEN": coupon("BROKEN", { percentOff: 0 }),
    });
    await withBackend(data, {}, async () => {
        for (const code of ["", "x", "not a code!", 42, null]) await rejectsWith(coupons.findCoupon(code, null, NOW), "coupon_invalid");
        await rejectsWith(coupons.findCoupon("NOPE20", null, NOW), "coupon_invalid");
        await rejectsWith(coupons.findCoupon("off20", null, NOW), "coupon_invalid");
        await rejectsWith(coupons.findCoupon("BROKEN", null, NOW), "coupon_invalid");
        await rejectsWith(coupons.findCoupon("OLD20", null, NOW), "coupon_expired");
        await rejectsWith(coupons.findCoupon("FULL20", null, NOW), "coupon_used_up");
        await rejectsWith(coupons.findCoupon("PRO20", "plus", NOW), "coupon_plan");

        const pro = await coupons.findCoupon(" pro20 ", "pro", NOW);
        assert.deepEqual(pro.view, { code: "PRO20", percentOff: 20, plan: "pro", recur: 3, expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString() });
        const any = await coupons.findCoupon("HANOGT20", null, NOW);
        assert.deepEqual(any.view, { code: "HANOGT20", percentOff: 20, plan: "any", recur: "first", expiresAt: null }, "coupons from before the setting cover the first payment");
        assert.equal((await coupons.findCoupon("PRO20", null, NOW)).view.plan, "pro", "without a plan only the code is checked");
    });
});

test("a coupon without a Paddle discount gets one with its code, payments and the mapped prices", async () => {
    paddle.forgetPaddleCaches();
    const api = createPaddle();
    await withBackend(seed({ "plan_coupons/PLUS3": coupon("PLUS3", { plan: "plus", recur: 3, maxUses: 50 }) }), { route: api.route }, async (db) => {
        const { view, record } = await coupons.findCoupon("PLUS3", "plus", NOW);
        const id = await coupons.couponDiscount(view, record, PRICES.plusMonth);
        assert.match(id, /^dsc_01created/);
        const [create] = api.writes();
        assert.equal(create.path, "/discounts");
        assert.deepEqual(
            { amount: create.body.amount, type: create.body.type, code: create.body.code, checkout: create.body.enabled_for_checkout, recur: create.body.recur, intervals: create.body.maximum_recurring_intervals, limit: create.body.usage_limit, restrict: create.body.restrict_to },
            { amount: "20", type: "percentage", code: "PLUS3", checkout: true, recur: true, intervals: 3, limit: 50, restrict: [PRICES.plusMonth, PRICES.plusYear] },
        );
        const stored = db.get("plan_coupons/PLUS3");
        assert.equal(stored.paddleDiscountId, id);
        assert.equal(stored.paddleEnvironment, "sandbox");

        // Next time the stored discount is used as it is.
        const again = await coupons.findCoupon("PLUS3", "plus", NOW);
        assert.equal(await coupons.couponDiscount(again.view, again.record, PRICES.plusYear), id);
        assert.equal(api.writes().length, 1, "nothing else is created or changed");
    });

    // A code Paddle can't take (with - or _, from before Paddle was connected): Paddle makes one up, the checkout applies it by id.
    const dashed = createPaddle();
    await withBackend(seed({ "plan_coupons/SPRING-20": coupon("SPRING-20") }), { route: dashed.route }, async (db) => {
        const { view, record } = await coupons.findCoupon("SPRING-20", null, NOW);
        const id = await coupons.couponDiscount(view, record, PRICES.plusMonth);
        assert.deepEqual(dashed.writes().map((call) => [call.method, call.path, call.body.code]), [["POST", "/discounts", null]]);
        assert.equal(db.get("plan_coupons/SPRING-20").paddleDiscountId, id);
    });

    // The code already belongs to another Paddle discount (made in Paddle by hand, or an archived old one): ours gets a made-up code.
    const taken = createPaddle([{ id: "dsc_01handmadexxxxxxxxxxxxxxxx", status: "archived", code: "WELCOME50", usage_limit: null, times_used: 0, restrict_to: null }]);
    await withBackend(seed({ "plan_coupons/WELCOME50": coupon("WELCOME50", { plan: "pro" }) }), { route: taken.route }, async (db) => {
        const { view, record } = await coupons.findCoupon("welcome50", "pro", NOW);
        const id = await coupons.couponDiscount(view, record, PRICES.proYear);
        assert.notEqual(id, "dsc_01handmadexxxxxxxxxxxxxxxx", "the other discount isn't adopted: its terms may differ");
        assert.deepEqual(taken.writes().map((call) => [call.method, call.path, call.body.code]), [["POST", "/discounts", "WELCOME50"], ["POST", "/discounts", null]]);
        assert.deepEqual(taken.state.discounts.find((entry) => entry.id === id).restrict_to, [PRICES.proMonth, PRICES.proYear]);
        assert.equal(db.get("plan_coupons/WELCOME50").paddleDiscountId, id);
    });
});

test("an existing discount is switched back on, widened to a newly mapped price, or refused when used up", async () => {
    paddle.forgetPaddleCaches();
    const old = "pri_01oldplusmonthxxxxxxxxxxxx";
    const linked = { paddleDiscountId: DISCOUNT, paddleEnvironment: "sandbox" };
    const api = createPaddle([{ id: DISCOUNT, status: "archived", code: "HANOGT20", usage_limit: null, times_used: 4, restrict_to: [old] }]);
    await withBackend(seed({ "plan_coupons/HANOGT20": coupon("HANOGT20", { plan: "plus", ...linked }) }), { route: api.route }, async () => {
        const { view, record } = await coupons.findCoupon("HANOGT20", "plus", NOW);
        assert.equal(await coupons.couponDiscount(view, record, PRICES.plusMonth), DISCOUNT);
        assert.deepEqual(api.writes().map((call) => [call.method, call.path, call.body]), [
            ["PATCH", `/discounts/${DISCOUNT}`, { status: "active" }],
            ["PATCH", `/discounts/${DISCOUNT}`, { restrict_to: [PRICES.plusMonth, PRICES.plusYear] }],
        ]);
    });

    const usedUp = createPaddle([{ id: DISCOUNT, status: "active", usage_limit: 10, times_used: 10, restrict_to: null }]);
    await withBackend(seed({ "plan_coupons/HANOGT20": coupon("HANOGT20", linked) }), { route: usedUp.route }, async () => {
        const { view, record } = await coupons.findCoupon("HANOGT20", null, NOW);
        await rejectsWith(coupons.couponDiscount(view, record, PRICES.plusMonth), "coupon_used_up");
        assert.equal(usedUp.writes().length, 0);
    });

    // Paddle marks a discount "used" once its redemptions are spent.
    const used = createPaddle([{ id: DISCOUNT, status: "used", usage_limit: null, times_used: 3, restrict_to: null }]);
    await withBackend(seed({ "plan_coupons/HANOGT20": coupon("HANOGT20", linked) }), { route: used.route }, async () => {
        const { view, record } = await coupons.findCoupon("HANOGT20", null, NOW);
        await rejectsWith(coupons.couponDiscount(view, record, PRICES.plusMonth), "coupon_used_up");
        assert.equal(used.writes().length, 0, "not switched back on");
    });

    const expired = createPaddle([{ id: DISCOUNT, status: "expired", restrict_to: null }]);
    await withBackend(seed({ "plan_coupons/HANOGT20": coupon("HANOGT20", linked) }), { route: expired.route }, async () => {
        const { view, record } = await coupons.findCoupon("HANOGT20", null, NOW);
        await rejectsWith(coupons.couponDiscount(view, record, PRICES.plusMonth), "coupon_expired");
    });

    // A discount made for the live account means nothing to the sandbox: a sandbox one is made.
    const live = createPaddle();
    await withBackend(seed({ "plan_coupons/HANOGT20": coupon("HANOGT20", { paddleDiscountId: DISCOUNT, paddleEnvironment: "production" }) }), { route: live.route }, async (db) => {
        const { view, record } = await coupons.findCoupon("HANOGT20", null, NOW);
        const id = await coupons.couponDiscount(view, record, PRICES.proMonth);
        assert.notEqual(id, DISCOUNT);
        assert.equal(db.get("plan_coupons/HANOGT20").paddleEnvironment, "sandbox");
    });
});

test("payments a coupon covers, and the discount on the checkout's transaction", async () => {
    assert.deepEqual(["first", "all", 3, "12", 1, 25, "x", null, 2.5].map(plans.normalizeCouponRecur), ["first", "all", 3, 12, "first", "first", "first", "first", "first"]);
    assert.deepEqual(admin.discountRecurrence("first"), { recur: false, maximum_recurring_intervals: null });
    assert.deepEqual(admin.discountRecurrence("all"), { recur: true, maximum_recurring_intervals: null });
    assert.deepEqual(admin.discountRecurrence(6), { recur: true, maximum_recurring_intervals: 6 });
    assert.deepEqual(admin.discountRecurrence(undefined), { recur: false, maximum_recurring_intervals: null });
    assert.equal(plans.couponAmount("2000", 20), "1600");
    assert.equal(plans.couponAmount("10000", 15), "8500");
    assert.equal(plans.couponAmount("1999", 33), "1339");
    assert.equal(plans.couponAmount("x", 10), "0");

    const api = createPaddle();
    await withBackend(seed(), { route: api.route }, async () => {
        await paddle.createCheckoutTransaction({ email: "ali@example.com", plan: "plus", priceId: PRICES.plusMonth, customerId: "ctm_01aaaaaaaaaaaaaaaaaaaaaaaa", discountId: DISCOUNT });
        await paddle.createCheckoutTransaction({ email: "ali@example.com", plan: "plus", priceId: PRICES.plusMonth, customerId: "ctm_01aaaaaaaaaaaaaaaaaaaaaaaa", discountId: "not-a-discount" });
        await paddle.createCheckoutTransaction({ email: "ali@example.com", plan: "plus", priceId: PRICES.plusMonth, customerId: "ctm_01aaaaaaaaaaaaaaaaaaaaaaaa" });
        const bodies = api.writes().filter((call) => call.path === "/transactions").map((call) => call.body);
        assert.equal(bodies[0].discount_id, DISCOUNT);
        assert.equal("discount_id" in bodies[1], false, "anything but a discount id is left out");
        assert.equal("discount_id" in bodies[2], false);
    });
});

test("after the mapping changes, active coupons' discounts cover the newly mapped prices", async () => {
    paddle.forgetPaddleCaches();
    const api = createPaddle([
        { id: "dsc_01plusonlyxxxxxxxxxxxxxxxx", status: "active", restrict_to: ["pri_01oldxxxxxxxxxxxxxxxxxxxxx"] },
        { id: "dsc_01anyplanxxxxxxxxxxxxxxxxx", status: "active", restrict_to: ["pri_01oldxxxxxxxxxxxxxxxxxxxxx"] },
    ]);
    const data = seed({
        "plan_coupons/PLUS10": coupon("PLUS10", { plan: "plus", paddleDiscountId: "dsc_01plusonlyxxxxxxxxxxxxxxxx", paddleEnvironment: "sandbox" }),
        "plan_coupons/ALL10": coupon("ALL10", { paddleDiscountId: "dsc_01anyplanxxxxxxxxxxxxxxxxx", paddleEnvironment: "sandbox" }),
        "plan_coupons/OFF10": coupon("OFF10", { active: false, paddleDiscountId: "dsc_01offxxxxxxxxxxxxxxxxxxxxx", paddleEnvironment: "sandbox" }),
        "plan_coupons/LIVE10": coupon("LIVE10", { paddleDiscountId: "dsc_01livexxxxxxxxxxxxxxxxxxxx", paddleEnvironment: "production" }),
    });
    await withBackend(data, { route: api.route }, async () => {
        const result = await admin.refreshCouponDiscounts(SETTINGS.sandbox.prices);
        assert.deepEqual(result, { updated: 2, failed: 0 });
        const patches = Object.fromEntries(api.writes().map((call) => [call.path, call.body.restrict_to]));
        assert.deepEqual(patches, {
            "/discounts/dsc_01plusonlyxxxxxxxxxxxxxxxx": [PRICES.plusMonth, PRICES.plusYear],
            "/discounts/dsc_01anyplanxxxxxxxxxxxxxxxxx": [PRICES.plusMonth, PRICES.plusYear, PRICES.proMonth, PRICES.proYear],
        }, "switched-off coupons and the other environment's discounts are left alone");
    });
});
