// Run: node --test scripts/tests/
// Admin › Subscriptions, Paddle side (src/lib/server/paddle-admin.ts): price
// suggestions and checks, and what reaches Paddle and site_config/paddle,
// against an in-memory Firestore (fake-backend) and a fake Paddle API on a
// loopback address (PADDLE_API_BASE_URL).
import assert from "node:assert/strict";
import test from "node:test";
import { json, setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const PADDLE_HOST = "127.0.0.1:8788";
Object.assign(process.env, {
    // Made-up sandbox credentials: the tests run against the sandbox part of the settings.
    PADDLE_API_KEY: "pdl_sdbx_apikey_01abcdefghijklmnopqrstuvwx_testkeytestkeytestkeyXX",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_0123456789abcdefghijkl",
    PADDLE_API_BASE_URL: `http://${PADDLE_HOST}`,
});

const admin = await load("lib/server/paddle-admin.ts");
const paddle = await load("lib/server/paddle.ts");

/** A Paddle id: the prefix, then lowercase letters and digits. */
const pid = (prefix, name) => `${prefix}_01${name.toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(24, "x").slice(0, 24)}`;

const PRODUCT = { plus: pid("pro", "plusproduct"), pro: pid("pro", "proproduct"), old: pid("pro", "oldproduct"), legacy: pid("pro", "legacyproduct"), other: pid("pro", "otherproduct") };
const PRICE = {
    plusMonth: pid("pri", "plusmonth"),
    plusYear: pid("pri", "plusyear"),
    proMonth: pid("pri", "promonth"),
    proYear: pid("pri", "proyear"),
    proMonthOld: pid("pri", "promonthold"),
    professional: pid("pri", "professional"),
    oneTime: pid("pri", "onetime"),
    oldMonth: pid("pri", "oldmonth"),
    manualYear: pid("pri", "manualyear"),
    live: pid("pri", "livemonth"),
};
const EMPTY = { plus: { month: null, year: null }, pro: { month: null, year: null } };
const OWNER = "owner@example.com";

function paddleProduct(id, name, { plan = null, status = "active" } = {}) {
    return { id, name, status, custom_data: plan ? { hanogt_plan: plan } : null };
}

function paddlePrice(id, product, { interval = "month", frequency = 1, amount = "2000", currency = "USD", custom = null, name = null, description = "" } = {}) {
    return {
        id,
        product_id: product,
        status: "active",
        name,
        description,
        billing_cycle: interval ? { interval, frequency } : null,
        trial_period: null,
        unit_price: { amount, currency_code: currency },
        custom_data: custom,
    };
}

/** A price as GET /prices?include=product returns it. */
function listed(price, product) {
    return { ...price, product };
}

function adminPrice(id, productName, interval = "month", extra = {}) {
    const product = paddleProduct(extra.product ?? pid("pro", productName), productName, extra);
    return admin.adminPriceOf(listed(paddlePrice(id, product.id, { interval, ...extra }), product));
}

function errorCode(run) {
    try {
        run();
    } catch (error) {
        assert.ok(error instanceof admin.PaddleAdminError, `expected a PaddleAdminError, got ${error}`);
        return error.code;
    }
    assert.fail("expected an error");
}

// ---------------------------------------------------------------------------
// Prices: what they sell and the suggestions
// ---------------------------------------------------------------------------

test("only recurring prices are listed, with their billing period", () => {
    const product = paddleProduct(PRODUCT.plus, "Hanogt Codev Plus");
    assert.deepEqual(admin.adminPriceOf(listed(paddlePrice(PRICE.plusMonth, PRODUCT.plus, { description: "Plus · aylık" }), product)), {
        id: PRICE.plusMonth,
        productId: PRODUCT.plus,
        productName: "Hanogt Codev Plus",
        description: "Plus · aylık",
        interval: "month",
        cycle: "1 month",
        amount: "2000",
        currency: "USD",
        trialDays: null,
        suggestedPlan: "plus",
        quantityMax: null,
    });
    assert.equal(admin.adminPriceOf(listed({ ...paddlePrice(PRICE.plusMonth, PRODUCT.plus), quantity: { minimum: 1, maximum: 100 } }, product)).quantityMax, 100, "Paddle's default lets a checkout buy 100");
    assert.equal(admin.adminPriceOf(listed({ ...paddlePrice(PRICE.plusMonth, PRODUCT.plus), quantity: { minimum: 1, maximum: 1 } }, product)).quantityMax, 1);
    assert.equal(admin.adminPriceOf(listed(paddlePrice(PRICE.plusYear, PRODUCT.plus, { interval: "year" }), product)).interval, "year");
    const twelve = admin.adminPriceOf(listed(paddlePrice(PRICE.plusYear, PRODUCT.plus, { frequency: 12 }), product));
    assert.equal(twelve.interval, "year", "every 12 months is yearly");
    assert.equal(twelve.cycle, "12 month");
    assert.equal(admin.adminPriceOf(listed(paddlePrice(PRICE.plusMonth, PRODUCT.plus, { frequency: 3 }), product)).interval, null, "a quarterly price fits no slot");
    assert.equal(admin.adminPriceOf(listed(paddlePrice(PRICE.oneTime, PRODUCT.plus, { interval: null }), product)), null, "one-time prices sell no subscription");
    assert.equal(admin.adminPriceOf(listed({ ...paddlePrice(PRICE.plusMonth, PRODUCT.plus), id: "pri_short" }, product)), null);
    const trial = admin.adminPriceOf(listed({ ...paddlePrice(PRICE.plusMonth, PRODUCT.plus), trial_period: { interval: "day", frequency: 14 } }, product));
    assert.equal(trial.trialDays, 14);
});

test("a price's plan comes from hanogt_plan first, then whole words in the names", () => {
    const plan = ({ product = {}, ...price }) => admin.suggestedPlanOf({ custom_data: null, name: null, description: "", ...price, product: { name: "", custom_data: null, ...product } });
    assert.equal(plan({ product: { name: "Hanogt Codev Plus" } }), "plus");
    assert.equal(plan({ product: { name: "Pro (yıllık)" } }), "pro");
    assert.equal(plan({ product: { name: "Hanogt Pro" }, custom_data: { hanogt_plan: "plus" } }), "plus", "the price's custom data wins over the name");
    assert.equal(plan({ product: { name: "Hanogt Plus", custom_data: { hanogt_plan: " PRO " } } }), "pro", "so does the product's");
    assert.equal(plan({ product: { name: "Professional" } }), null, "Professional isn't Pro");
    assert.equal(plan({ product: { name: "Pluses and minuses" } }), null);
    assert.equal(plan({ product: { name: "Plus & Pro bundle" } }), null, "a name with both words suggests nothing");
    assert.equal(plan({ product: { name: "Hanogt Codev" }, name: "Pro monthly" }), "pro", "the price's own name when the product's says nothing");
    assert.equal(plan({ product: { name: "Hanogt Codev" } }), null);
    assert.equal(plan({ product: { name: "Codev" }, custom_data: { hanogt_plan: "enterprise" } }), null, "unknown plans in custom data are ignored");
});

test("suggestions fill a slot only when exactly one price fits it", () => {
    const prices = [
        adminPrice(PRICE.plusMonth, "Hanogt Codev Plus"),
        adminPrice(PRICE.plusYear, "Hanogt Codev Plus", "year"),
        adminPrice(PRICE.proMonth, "Hanogt Codev Pro"),
        adminPrice(PRICE.proMonthOld, "Pro (old)"),
        adminPrice(PRICE.professional, "Professional", "year"),
    ];
    assert.deepEqual(admin.suggestPriceMapping(prices), {
        plus: { month: PRICE.plusMonth, year: PRICE.plusYear },
        pro: { month: null, year: null },
    }, "two Pro monthly prices are ambiguous and Professional isn't Pro");
    const tagged = [adminPrice(PRICE.proMonth, "Hanogt Codev", "month", { custom: { hanogt_plan: "pro" } }), adminPrice(PRICE.proMonthOld, "Hanogt Codev")];
    assert.deepEqual(admin.suggestPriceMapping(tagged), { plus: { month: null, year: null }, pro: { month: PRICE.proMonth, year: null } });
    assert.deepEqual(admin.suggestPriceMapping([]), EMPTY);
});

// ---------------------------------------------------------------------------
// Checking a mapping
// ---------------------------------------------------------------------------

const mapping = (plus = {}, pro = {}) => ({ plus: { month: null, year: null, ...plus }, pro: { month: null, year: null, ...pro } });

test("a mapping is refused unless every slot is a price id or empty", () => {
    assert.deepEqual(admin.validatePriceMapping(mapping(), null), EMPTY, "every slot may stay empty");
    assert.deepEqual(admin.validatePriceMapping(mapping({ month: ` ${PRICE.plusMonth} `, year: "" }), null), mapping({ month: PRICE.plusMonth }), "trimmed; an empty text means none");
    assert.equal(errorCode(() => admin.validatePriceMapping(null, null)), "invalid_price_id");
    assert.equal(errorCode(() => admin.validatePriceMapping("pri_x", null)), "invalid_price_id");
    assert.equal(errorCode(() => admin.validatePriceMapping({ plus: { month: null, year: null } }, null)), "invalid_price_id", "both plans are needed");
    assert.equal(errorCode(() => admin.validatePriceMapping({ plus: { month: null }, pro: { month: null, year: null } }, null)), "invalid_price_id", "and both periods");
    for (const bad of ["pri_short", PRICE.plusMonth.toUpperCase(), PRODUCT.plus, 42, [PRICE.plusMonth]]) {
        assert.equal(errorCode(() => admin.validatePriceMapping(mapping({ month: bad }), null)), "invalid_price_id", String(bad));
    }
});

test("with Paddle's list, every price must exist there with the slot's period and sell one slot", () => {
    const known = [
        adminPrice(PRICE.plusMonth, "Hanogt Codev Plus"),
        adminPrice(PRICE.plusYear, "Hanogt Codev Plus", "year"),
        adminPrice(PRICE.proMonth, "Hanogt Codev Pro"),
        adminPrice(PRICE.proYear, "Hanogt Codev Pro", "year"),
    ];
    const full = mapping({ month: PRICE.plusMonth, year: PRICE.plusYear }, { month: PRICE.proMonth, year: PRICE.proYear });
    assert.deepEqual(admin.validatePriceMapping(full, known), full);
    assert.deepEqual(admin.validatePriceMapping(mapping({ month: PRICE.plusMonth }), known), mapping({ month: PRICE.plusMonth }), "empty slots are allowed");
    assert.equal(errorCode(() => admin.validatePriceMapping(mapping({ month: PRICE.oldMonth }), known)), "price_mismatch", "not an active price in Paddle");
    assert.equal(errorCode(() => admin.validatePriceMapping(mapping({ month: PRICE.plusYear }), known)), "price_mismatch", "a yearly price can't sell the monthly slot");
    assert.equal(errorCode(() => admin.validatePriceMapping(mapping({ month: PRICE.plusMonth }, { month: PRICE.plusMonth }), known)), "price_mismatch", "one price can't sell two slots");
});

test("without Paddle's list only the form of the ids is checked", () => {
    const unchecked = mapping({ month: PRICE.oldMonth }, { month: PRICE.proYear });
    assert.deepEqual(admin.validatePriceMapping(unchecked, null), unchecked, "existence and period can't be checked");
    assert.equal(errorCode(() => admin.validatePriceMapping(mapping({ month: PRICE.plusMonth, year: PRICE.plusMonth }), null)), "price_mismatch", "a price used twice is still refused");
    assert.equal(errorCode(() => admin.validatePriceMapping(mapping({ month: "pri_short" }), null)), "invalid_price_id");
});

test("failures become admin API answers", () => {
    assert.deepEqual(admin.paddleAdminFailure(new admin.PaddleAdminError("invalid_price_id")), { status: 400, code: "invalid_price_id" });
    assert.deepEqual(admin.paddleAdminFailure(new admin.PaddleAdminError("already_linked")), { status: 409, code: "already_linked" });
    assert.deepEqual(admin.paddleAdminFailure(new admin.PaddleAdminError("user_not_found")), { status: 404, code: "user_not_found" });
    assert.deepEqual(admin.paddleAdminFailure(new paddle.PaddleApiError(0, "not_configured")), { status: 409, code: "paddle_unconfigured" });
    assert.deepEqual(admin.paddleAdminFailure(new paddle.PaddleApiError(403, "forbidden")), { status: 424, code: "paddle_error" });
    assert.equal(admin.paddleAdminFailure(new Error("Firestore")), null);
});

test("coupons: Paddle codes, the prices a discount applies to and its environment", () => {
    assert.equal(admin.isPaddleDiscountCode("HANOGT20"), true);
    assert.equal(admin.isPaddleDiscountCode("YAZ-2026"), false, "Paddle codes are letters and digits only");
    assert.equal(admin.isPaddleDiscountCode("YAZ_2026"), false);
    const prices = mapping({ month: PRICE.plusMonth }, { month: PRICE.proMonth, year: PRICE.proYear });
    assert.deepEqual(admin.discountRestriction("plus", prices), [PRICE.plusMonth]);
    assert.deepEqual(admin.discountRestriction("any", prices), [PRICE.plusMonth, PRICE.proMonth, PRICE.proYear]);
    assert.equal(admin.discountRestriction("plus", EMPTY), null, "nothing mapped: every price");
    const discount = pid("dsc", "discount");
    assert.equal(admin.couponDiscountId({ paddleDiscountId: discount, paddleEnvironment: "sandbox" }, "sandbox"), discount);
    assert.equal(admin.couponDiscountId({ paddleDiscountId: discount, paddleEnvironment: "sandbox" }, "production"), null, "a sandbox discount means nothing live");
    assert.equal(admin.couponDiscountId({ paddleDiscountId: "dsc_bad" }, "sandbox"), null);
    assert.equal(admin.couponDiscountId(null, "sandbox"), null);
});

// ---------------------------------------------------------------------------
// Against the fake Paddle API and Firestore
// ---------------------------------------------------------------------------

/** A tiny Paddle API: products, prices (paged), subscriptions and customers; records every call. */
function createPaddle({ products = [], prices = [], subscriptions = [], pageSize = 200 } = {}) {
    const state = { products: structuredClone(products), prices: structuredClone(prices), subscriptions: structuredClone(subscriptions), calls: [] };
    let created = 0;
    const newId = (prefix) => `${prefix}_01created${String(++created).padStart(16, "0")}`;
    async function route(url, init = {}) {
        assert.equal(url.host, PADDLE_HOST, `unexpected request to ${url.href}`);
        const method = (init.method || "GET").toUpperCase();
        const body = init.body ? JSON.parse(init.body) : null;
        state.calls.push({ method, path: url.pathname, search: url.search, body });
        if (method === "GET" && url.pathname === "/products") {
            return json(200, { data: state.products.filter((product) => product.status === (url.searchParams.get("status") ?? product.status)), meta: { pagination: { has_more: false, next: `http://${PADDLE_HOST}/products?after=x` } } });
        }
        if (method === "GET" && url.pathname === "/prices") {
            const active = state.prices.filter((price) => price.status === "active");
            const after = url.searchParams.get("after");
            const start = after ? active.findIndex((price) => price.id === after) + 1 : 0;
            const page = active.slice(start, start + pageSize).map((price) => listed(price, state.products.find((product) => product.id === price.product_id) ?? null));
            const next = `http://${PADDLE_HOST}/prices?after=${page.at(-1)?.id ?? ""}&status=active&include=product&per_page=200`;
            return json(200, { data: page, meta: { pagination: { per_page: pageSize, has_more: start + pageSize < active.length, next } } });
        }
        if (method === "POST" && url.pathname === "/products") {
            const product = { id: newId("pro"), status: "active", ...body };
            state.products.push(product);
            return json(201, { data: product });
        }
        if (method === "POST" && url.pathname === "/prices") {
            const price = { id: newId("pri"), status: "active", ...body };
            state.prices.push(price);
            return json(201, { data: price });
        }
        const price = /^\/prices\/(pri_[a-z0-9]+)$/.exec(url.pathname);
        if (method === "PATCH" && price) {
            const found = state.prices.find((entry) => entry.id === price[1]);
            if (!found) return json(404, { error: { code: "entity_not_found", detail: "Not found" } });
            Object.assign(found, body);
            return json(200, { data: found });
        }
        const one = /^\/subscriptions\/(sub_[a-z0-9]+)$/.exec(url.pathname);
        if (method === "GET" && one) {
            const found = state.subscriptions.find((entry) => entry.id === one[1]);
            return found ? json(200, { data: found }) : json(404, { error: { code: "entity_not_found", detail: "Not found" } });
        }
        if (method === "GET" && url.pathname === "/subscriptions") {
            return json(200, { data: state.subscriptions.filter((entry) => entry.customer_id === url.searchParams.get("customer_id")) });
        }
        return json(404, { error: { code: "not_found", detail: `${method} ${url.pathname}` } });
    }
    return { state, route, writes: () => state.calls.filter((call) => call.method !== "GET") };
}

function subscription(id, customer, { status = "active", price = PRICE.plusMonth } = {}) {
    return {
        id,
        status,
        customer_id: customer,
        updated_at: "2026-10-01T00:00:00Z",
        next_billed_at: status === "canceled" ? null : "2026-11-01T00:00:00Z",
        canceled_at: status === "canceled" ? "2026-09-01T00:00:00Z" : null,
        current_billing_period: { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" },
        billing_cycle: { interval: "month", frequency: 1 },
        scheduled_change: null,
        items: [{ status: "active", price: paddlePrice(price, PRODUCT.plus) }],
        custom_data: null,
    };
}

const SANDBOX_MAPPING = { prices: mapping({ month: PRICE.plusMonth }), products: { plus: [PRODUCT.plus], pro: [] }, salesOpen: false };
const LIVE_SETTINGS = { prices: mapping({ month: PRICE.live }), products: { plus: [PRODUCT.legacy], pro: [] }, salesOpen: true };

test("prices are read page by page; one-time prices and archived products are left out", async () => {
    paddle.forgetPaddleCaches();
    const api = createPaddle({
        pageSize: 2,
        products: [paddleProduct(PRODUCT.plus, "Hanogt Codev Plus"), paddleProduct(PRODUCT.old, "Old Plus", { status: "archived" })],
        prices: [
            paddlePrice(PRICE.plusMonth, PRODUCT.plus),
            paddlePrice(PRICE.plusYear, PRODUCT.plus, { interval: "year", amount: "20000" }),
            paddlePrice(PRICE.oneTime, PRODUCT.plus, { interval: null }),
            paddlePrice(PRICE.oldMonth, PRODUCT.old),
        ],
    });
    await withBackend({}, { route: api.route }, async () => {
        const prices = await admin.listPaddlePrices();
        assert.deepEqual(prices.map((price) => price.id), [PRICE.plusMonth, PRICE.plusYear]);
        assert.deepEqual(api.state.calls.map((call) => `${call.path}${call.search}`), [
            "/prices?status=active&include=product&per_page=200",
            `/prices?after=${PRICE.plusYear}&status=active&include=product&per_page=200`,
        ], "the second page comes from meta.pagination.next");
    });
});

test("an empty Paddle account gets both products and all four prices, mapped for the sandbox only", async () => {
    paddle.forgetPaddleCaches();
    const api = createPaddle();
    await withBackend({ "site_config/paddle": { production: LIVE_SETTINGS } }, { route: api.route }, async (backend) => {
        const audit = { type: "create", path: "admin_audit_log/catalog", data: { action: "paddle.create_catalog" } };
        const report = await admin.ensurePaddleCatalog(OWNER, [audit]);
        assert.equal(report.environment, "sandbox");
        assert.deepEqual(report.products.map((entry) => [entry.plan, entry.created]), [["plus", true], ["pro", true]]);
        assert.deepEqual(report.prices.map((entry) => `${entry.plan}.${entry.interval}:${entry.outcome}:${entry.expected.amount}`), [
            "plus.month:created:2000",
            "plus.year:created:20000",
            "pro.month:created:10000",
            "pro.year:created:100000",
        ]);

        const writes = api.writes();
        assert.ok(writes.every((call) => call.method === "POST"), "nothing in Paddle is changed or deleted");
        const products = writes.filter((call) => call.path === "/products").map((call) => call.body);
        assert.deepEqual(products.map((body) => [body.name, body.tax_category, body.custom_data.hanogt_plan]), [["Hanogt Codev Plus", "standard", "plus"], ["Hanogt Codev Pro", "standard", "pro"]]);
        const prices = writes.filter((call) => call.path === "/prices").map((call) => call.body);
        assert.ok(prices.every((body) => body.quantity?.minimum === 1 && body.quantity?.maximum === 1), "one subscription per checkout: no quantity stepper");
        assert.deepEqual(prices.map((body) => [body.unit_price.amount, body.unit_price.currency_code, body.billing_cycle.interval, body.billing_cycle.frequency, body.tax_mode, body.custom_data.hanogt_interval]), [
            ["2000", "USD", "month", 1, "account_setting", "month"],
            ["20000", "USD", "year", 1, "account_setting", "year"],
            ["10000", "USD", "month", 1, "account_setting", "month"],
            ["100000", "USD", "year", 1, "account_setting", "year"],
        ]);
        assert.equal(prices[0].product_id, report.products[0].productId);

        const stored = backend.get("site_config/paddle");
        const ids = Object.fromEntries(report.prices.map((entry) => [`${entry.plan}.${entry.interval}`, entry.priceId]));
        assert.deepEqual(stored.sandbox.prices, { plus: { month: ids["plus.month"], year: ids["plus.year"] }, pro: { month: ids["pro.month"], year: ids["pro.year"] } });
        assert.deepEqual(stored.sandbox.products, { plus: [report.products[0].productId], pro: [report.products[1].productId] });
        assert.deepEqual(stored.production, LIVE_SETTINGS, "the live mapping is left alone");
        assert.equal(stored.updatedBy, OWNER);
        assert.ok(backend.has("admin_audit_log/catalog"), "the audit entry commits with the mapping");
    });
});

test("existing prices are reused, a different amount is a conflict, and a second run creates nothing", async () => {
    paddle.forgetPaddleCaches();
    const api = createPaddle({
        products: [paddleProduct(PRODUCT.plus, "Plus (ours)", { plan: "plus" }), paddleProduct(PRODUCT.other, "Pro without custom data")],
        prices: [
            paddlePrice(PRICE.plusMonth, PRODUCT.plus),
            paddlePrice(PRICE.plusYear, PRODUCT.plus, { interval: "year", amount: "25000" }),
        ],
    });
    const seed = { "site_config/paddle": { sandbox: { prices: mapping({ year: PRICE.manualYear }), products: { plus: [PRODUCT.legacy], pro: [] }, salesOpen: true } } };
    await withBackend(seed, { route: api.route }, async (backend) => {
        const report = await admin.ensurePaddleCatalog(OWNER);
        assert.deepEqual(report.products.map((entry) => [entry.plan, entry.productId === PRODUCT.plus, entry.created]), [["plus", true, false], ["pro", false, true]], "only products marked hanogt_plan count as ours");
        const outcome = Object.fromEntries(report.prices.map((entry) => [`${entry.plan}.${entry.interval}`, entry]));
        assert.equal(outcome["plus.month"].outcome, "reused");
        assert.equal(outcome["plus.month"].priceId, PRICE.plusMonth);
        assert.equal(outcome["plus.year"].outcome, "conflict");
        assert.equal(outcome["plus.year"].priceId, null);
        assert.deepEqual(outcome["plus.year"].found, [{ id: PRICE.plusYear, amount: "25000", currency: "USD" }]);
        assert.equal(outcome["pro.month"].outcome, "created");
        assert.equal(api.writes().filter((call) => call.path === "/prices").length, 2, "nothing is created for the conflicting period");
        assert.ok(api.writes().every((call) => call.method === "POST"));

        const stored = backend.get("site_config/paddle").sandbox;
        assert.equal(stored.prices.plus.month, PRICE.plusMonth);
        assert.equal(stored.prices.plus.year, PRICE.manualYear, "a conflicting slot keeps what the owner mapped");
        assert.deepEqual(stored.products.plus, [PRODUCT.plus, PRODUCT.legacy], "product lists only grow");
        assert.equal(stored.salesOpen, true, "the sales gate is kept");

        const before = api.writes().length;
        const again = await admin.ensurePaddleCatalog(OWNER);
        assert.equal(api.writes().length, before, "a second run creates nothing");
        assert.deepEqual(again.prices.map((entry) => entry.outcome), ["reused", "conflict", "reused", "reused"]);
    });
});

test("saving a mapping keeps the replaced price's product, the sales gate and the other environment", async () => {
    paddle.forgetPaddleCaches();
    const seed = { "site_config/paddle": { sandbox: { prices: mapping({ month: PRICE.oldMonth }), products: { plus: [PRODUCT.legacy], pro: [] }, salesOpen: true }, production: LIVE_SETTINGS } };
    await withBackend(seed, {}, async (backend) => {
        const known = [adminPrice(PRICE.oldMonth, "Old Plus", "month", { product: PRODUCT.old }), adminPrice(PRICE.plusMonth, "Hanogt Codev Plus", "month", { product: PRODUCT.plus })];
        const audit = { type: "create", path: "admin_audit_log/prices", data: { action: "paddle.set_prices" } };
        const saved = await admin.savePaddlePrices(mapping({ month: PRICE.plusMonth }), OWNER, known, [audit]);
        const stored = backend.get("site_config/paddle");
        assert.equal(stored.sandbox.prices.plus.month, PRICE.plusMonth);
        assert.deepEqual(stored.sandbox.products.plus, [PRODUCT.plus, PRODUCT.old, PRODUCT.legacy], "new, then replaced, then earlier products");
        assert.deepEqual(saved.products, stored.sandbox.products);
        assert.equal(stored.sandbox.salesOpen, true);
        assert.deepEqual(stored.production, LIVE_SETTINGS);
        assert.ok(backend.has("admin_audit_log/prices"));

        // Saved while Paddle was unreachable: no products are known, none are dropped.
        await admin.savePaddlePrices(mapping({ month: PRICE.manualYear.replace("manualyear", "manualmont") }), OWNER, null);
        assert.deepEqual(backend.get("site_config/paddle").sandbox.products.plus, [PRODUCT.plus, PRODUCT.old, PRODUCT.legacy]);
    });
});

test("the sales gate opens and closes without touching the mapping", async () => {
    paddle.forgetPaddleCaches();
    await withBackend({ "site_config/paddle": { sandbox: { prices: SANDBOX_MAPPING.prices, products: SANDBOX_MAPPING.products }, production: LIVE_SETTINGS } }, {}, async (backend) => {
        assert.equal(paddle.normalizePaddleSettings(backend.get("site_config/paddle"), "sandbox").salesOpen, false, "closed unless opened");
        assert.equal(await admin.setSalesOpen(true, OWNER), true);
        const stored = backend.get("site_config/paddle");
        assert.equal(stored.sandbox.salesOpen, true);
        assert.deepEqual(stored.sandbox.prices, SANDBOX_MAPPING.prices);
        assert.deepEqual(stored.sandbox.products, SANDBOX_MAPPING.products);
        assert.deepEqual(stored.production, LIVE_SETTINGS);
        assert.equal(await admin.setSalesOpen(true, OWNER), false, "already open");
        assert.equal(await admin.setSalesOpen(false, OWNER), true);
        assert.equal(backend.get("site_config/paddle").sandbox.salesOpen, false);
    });
});

const ALI = "ali@example.com";
const BOB = "bob@example.com";
const CUSTOMER = { ali: pid("ctm", "alicustomer"), bob: pid("ctm", "bobcustomer"), stranger: pid("ctm", "stranger") };
const SUB = { stranger: pid("sub", "stranger"), bob: pid("sub", "bob"), old: pid("sub", "old"), current: pid("sub", "current") };

test("unlinked subscriptions of the configured environment are listed", async () => {
    paddle.forgetPaddleCaches();
    const seed = {
        [`paddle_unlinked/${SUB.stranger}`]: { subscriptionId: SUB.stranger, environment: "sandbox", customerId: CUSTOMER.stranger, status: "active", plan: "plus", priceId: PRICE.plusMonth, seenAt: new Date("2026-10-01T10:00:00Z") },
        [`paddle_unlinked/${SUB.bob}`]: { subscriptionId: SUB.bob, environment: "production", customerId: CUSTOMER.bob, status: "active", plan: null, priceId: "", seenAt: new Date("2026-10-01T11:00:00Z") },
    };
    await withBackend(seed, {}, async () => {
        assert.deepEqual(await admin.listUnlinked(), [{
            subscriptionId: SUB.stranger,
            customerId: CUSTOMER.stranger,
            customerEmail: null,
            status: "active",
            plan: "plus",
            priceId: PRICE.plusMonth,
            seenAt: "2026-10-01T10:00:00.000Z",
        }]);
    });
});

test("linking a subscription to an account stores it there, unless the customer belongs to someone else", async () => {
    paddle.forgetPaddleCaches();
    const api = createPaddle({ subscriptions: [subscription(SUB.stranger, CUSTOMER.stranger), subscription(SUB.bob, CUSTOMER.bob)] });
    const seed = {
        [`users/${ALI}`]: { email: ALI },
        [`users/${BOB}`]: { email: BOB },
        [`paddle_customers/${CUSTOMER.bob}`]: { email: BOB, environment: "sandbox", deleted: false },
        [`paddle_unlinked/${SUB.stranger}`]: { subscriptionId: SUB.stranger, environment: "sandbox", customerId: CUSTOMER.stranger, status: "active", seenAt: new Date() },
        "site_config/paddle": { sandbox: SANDBOX_MAPPING },
    };
    await withBackend(seed, { route: api.route }, async (backend) => {
        await assert.rejects(admin.linkSubscription(SUB.bob, ALI), (error) => error.code === "already_linked");
        const calls = api.state.calls.length;
        await assert.rejects(admin.linkSubscription(SUB.stranger, "nobody@example.com"), (error) => error.code === "user_not_found");
        assert.equal(api.state.calls.length, calls, "a missing account is refused before Paddle is asked (it would count as deleted)");
        await assert.rejects(admin.linkSubscription("sub_short", ALI), (error) => error.code === "invalid_id");

        const result = await admin.linkSubscription(SUB.stranger, ALI);
        assert.equal(result.status, "stored");
        const stored = backend.get(`subscriptions/${ALI}`);
        assert.equal(stored.paddle.subscriptionId, SUB.stranger);
        assert.equal(stored.paddle.plan, "plus");
        assert.equal(stored.paddleCustomerId, CUSTOMER.stranger);
        assert.equal(backend.get(`paddle_customers/${CUSTOMER.stranger}`).email, ALI);
        assert.equal(backend.get(`paddle_customers/${CUSTOMER.stranger}`).via, "staff");
        assert.equal(backend.has(`paddle_unlinked/${SUB.stranger}`), false, "the entry leaves the list");
        assert.ok(api.writes().length === 0, "linking never changes anything in Paddle");
    });
});

test("re-syncing an account stores its most relevant subscription in this environment", async () => {
    paddle.forgetPaddleCaches();
    const api = createPaddle({ subscriptions: [subscription(SUB.old, CUSTOMER.ali, { status: "canceled" }), subscription(SUB.current, CUSTOMER.ali)] });
    const seed = {
        [`users/${ALI}`]: { email: ALI },
        [`users/${BOB}`]: { email: BOB },
        [`subscriptions/${ALI}`]: { plan: "free", status: "active", paddleCustomerId: CUSTOMER.ali, paddleEnvironment: "sandbox" },
        [`subscriptions/${BOB}`]: { plan: "free", status: "active", paddleCustomerId: CUSTOMER.bob, paddleEnvironment: "production" },
        "site_config/paddle": { sandbox: SANDBOX_MAPPING },
    };
    await withBackend(seed, { route: api.route }, async (backend) => {
        assert.equal(await admin.resyncAccount(ALI), 2);
        assert.equal(backend.get(`subscriptions/${ALI}`).paddle.subscriptionId, SUB.current, "the active one before the ended one");
        assert.equal(backend.get(`paddle_customers/${CUSTOMER.ali}`).email, ALI, "the missing customer link is added");

        const calls = api.state.calls.length;
        assert.equal(await admin.resyncAccount(BOB), 0, "a live customer means nothing to the sandbox");
        assert.equal(await admin.resyncAccount("carol@example.com"), 0, "no customer at all");
        assert.equal(api.state.calls.length, calls, "Paddle isn't asked without a customer of this environment");
    });
});

// ---------------------------------------------------------------------------
// The client-side token and the checkout errors browsers reported
// ---------------------------------------------------------------------------

const TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;

function clientToken(name, token, status = "active") {
    return { id: pid("ctkn", name), token, name, description: null, status, revoked_at: status === "revoked" ? "2026-09-01T00:00:00Z" : null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
}

/** GET /client-tokens: the tokens, filtered by status and paged like Paddle (meta.pagination.next with `after`); or one fixed failure. */
function createTokenApi({ tokens = [], pageSize = 200, fail = null } = {}) {
    const calls = [];
    async function route(url, init = {}) {
        assert.equal(url.host, PADDLE_HOST, `unexpected request to ${url.href}`);
        assert.equal((init.method || "GET").toUpperCase(), "GET", "the check only reads");
        calls.push(`${url.pathname}${url.search}`);
        if (fail) return json(fail.status, { error: { type: "request_error", code: fail.code, detail: "" } });
        assert.equal(url.pathname, "/client-tokens");
        const status = url.searchParams.get("status");
        const matching = tokens.filter((entry) => !status || entry.status === status);
        const after = url.searchParams.get("after");
        const start = after ? matching.findIndex((entry) => entry.id === after) + 1 : 0;
        const page = matching.slice(start, start + pageSize);
        const next = `http://${PADDLE_HOST}/client-tokens?after=${page.at(-1)?.id ?? ""}&per_page=200${status ? `&status=${status}` : ""}`;
        return json(200, { data: page, meta: { pagination: { per_page: pageSize, next, has_more: start + pageSize < matching.length, estimated_total: matching.length } } });
    }
    return { calls, route };
}

async function tokenCheck(api, config = paddle.getPaddleConfig()) {
    admin.forgetClientTokenCheck();
    return withBackend({}, { route: api.route }, () => admin.checkClientToken(config));
}

const others = (count, status = "active") => Array.from({ length: count }, (_, index) => clientToken(`other${index}`, `test_other${String(index).padStart(16, "0")}`, status));

test("client-side token: active, revoked or missing in the API key's account", async () => {
    const active = createTokenApi({ tokens: [...others(2), clientToken("vercel", TOKEN)] });
    const found = await tokenCheck(active);
    assert.equal(found.result, "active");
    assert.equal(found.name, "vercel");
    assert.equal(found.code, null);
    assert.ok(Number.isFinite(Date.parse(found.checkedAt)));
    assert.deepEqual(active.calls, ["/client-tokens?status=active&per_page=200"]);

    const revoked = createTokenApi({ tokens: [...others(2), clientToken("old", TOKEN, "revoked")] });
    assert.equal((await tokenCheck(revoked)).result, "revoked");
    assert.deepEqual(revoked.calls, ["/client-tokens?status=active&per_page=200", "/client-tokens?status=revoked&per_page=200"], "revoked tokens are looked up when no active one matches");

    const missing = createTokenApi({ tokens: [...others(3), clientToken("revokedother", "test_someoneelse0000000", "revoked")] });
    const absent = await tokenCheck(missing);
    assert.deepEqual({ result: absent.result, name: absent.name, code: absent.code }, { result: "missing", name: null, code: null }, "another account's or the other environment's token");

    const ignoresFilter = createTokenApi({ tokens: [clientToken("old", TOKEN, "revoked")] });
    ignoresFilter.route = ((route) => (url, init) => route(new URL(url.href.replace("status=active", "status=revoked")), init))(ignoresFilter.route);
    assert.equal((await tokenCheck(ignoresFilter)).result, "revoked", "an entry's own status counts");
});

test("client-side token: pages are followed, five at most per status", async () => {
    const third = createTokenApi({ pageSize: 2, tokens: [...others(5), clientToken("vercel", TOKEN)] });
    assert.equal((await tokenCheck(third)).result, "active");
    assert.equal(third.calls.length, 3, "found on the third page");
    assert.match(third.calls[1], /^\/client-tokens\?after=ctkn_01other1x+&per_page=200&status=active$/, "the next page comes from meta.pagination.next");

    const far = createTokenApi({ pageSize: 2, tokens: [...others(10), clientToken("vercel", TOKEN)] });
    assert.equal((await tokenCheck(far)).result, "missing", "beyond five pages counts as not found");
    assert.equal(far.calls.filter((call) => call.includes("status=active")).length, 5);
    assert.equal(far.calls.filter((call) => call.includes("status=revoked")).length, 1);
});

test("client-side token: no permission, Paddle errors, nothing to check and the cache", async () => {
    const forbidden = await tokenCheck(createTokenApi({ fail: { status: 403, code: "forbidden" } }));
    assert.deepEqual({ result: forbidden.result, code: forbidden.code }, { result: "no_permission", code: "forbidden" }, "the key lacks client_token.read");
    const broken = await tokenCheck(createTokenApi({ fail: { status: 500, code: "internal_error" } }));
    assert.deepEqual({ result: broken.result, code: broken.code }, { result: "error", code: "500 internal_error" });

    const none = createTokenApi();
    const config = paddle.getPaddleConfig();
    assert.equal(await tokenCheck(none, { ...config, clientToken: null }), null, "no token, nothing to check");
    assert.equal(await tokenCheck(none, { ...config, apiKey: null }), null, "no API key, no way to check");
    assert.deepEqual(none.calls, []);

    const api = createTokenApi({ tokens: [clientToken("vercel", TOKEN)] });
    admin.forgetClientTokenCheck();
    await withBackend({}, { route: api.route }, async () => {
        assert.equal((await admin.checkClientToken(config)).result, "active");
        assert.equal((await admin.checkClientToken(config)).result, "active");
        assert.equal(api.calls.length, 1, "cached for ten minutes");
        assert.equal((await admin.checkClientToken({ ...config, clientToken: "test_anothertoken00000000" })).result, "missing", "another token is checked anew");
        assert.equal(api.calls.length, 3);
    });
    admin.forgetClientTokenCheck();
});

test("the status record carries the reported checkout errors, malformed ones left out", async () => {
    const entry = { at: "2026-10-02T10:00:00.000Z", stage: "blocked", message: "https://cdn.paddle.com/paddle/v2/paddle.js failed to load", blockedUrl: "https://cdn.paddle.com/paddle/v2/paddle.js", code: null, browser: "Chrome 141", environment: "sandbox" };
    const seed = { "site_config/paddle_status": { lastEventType: "subscription.updated", lastEventAt: new Date("2026-10-02T09:00:00Z"), clientErrors: [entry, { stage: "blocked" }, null] } };
    await withBackend(seed, {}, async () => {
        const status = await admin.readPaddleStatus();
        assert.equal(status.lastEventType, "subscription.updated");
        assert.deepEqual(status.clientErrors, [entry]);
    });
    await withBackend({}, {}, async () => assert.deepEqual((await admin.readPaddleStatus()).clientErrors, []));
    assert.deepEqual(admin.EMPTY_WEBHOOK_STATUS.clientErrors, []);
});

test("quantity: only the given prices are set to exactly one, nothing else changes", async () => {
    paddle.forgetPaddleCaches();
    const loose = { ...paddlePrice(PRICE.plusMonth, PRODUCT.plus), quantity: { minimum: 1, maximum: 100 } };
    const other = { ...paddlePrice(PRICE.proMonth, PRODUCT.pro), quantity: { minimum: 1, maximum: 100 } };
    const api = createPaddle({ products: [paddleProduct(PRODUCT.plus, "Hanogt Codev Plus"), paddleProduct(PRODUCT.pro, "Hanogt Codev Pro")], prices: [loose, other] });
    await withBackend({}, { route: api.route }, async () => {
        const fixed = await admin.fixPriceQuantities([PRICE.plusMonth, PRICE.plusMonth, "pri_short"]);
        assert.deepEqual(fixed, [PRICE.plusMonth], "each valid id once");
        assert.deepEqual(api.writes().map((call) => [call.method, call.path, call.body]), [["PATCH", `/prices/${PRICE.plusMonth}`, { quantity: { minimum: 1, maximum: 1 } }]]);
        assert.deepEqual(api.state.prices.find((entry) => entry.id === PRICE.proMonth).quantity, { minimum: 1, maximum: 100 }, "prices not asked for stay as they are");
    });
});
