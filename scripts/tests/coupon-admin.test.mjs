// Run: node --test scripts/tests/
// Deleted coupons coming back (lib/server/coupon-admin.ts): the list from the
// audit log (a full copy since deletions record one, the creation entry for
// older ones), and restoring: the coupon written again, its Paddle discount
// reopened or a new one made, new end dates and limits when the old are spent.
import assert from "node:assert/strict";
import test from "node:test";
import { json, setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const PADDLE_HOST = "127.0.0.1:8784";
Object.assign(process.env, {
    PADDLE_API_KEY: "pdl_sdbx_apikey_01abcdefghijklmnopqrstuvwx_testkeytestkeytestkeyXX",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_0123456789abcdefghijkl",
    PADDLE_WEBHOOK_SECRET: "pdl_ntfset_01testsecret_abcdefghijklmnop",
    PADDLE_API_BASE_URL: `http://${PADDLE_HOST}`,
});

const couponAdmin = await load("lib/server/coupon-admin.ts");
const admin = await load("lib/server/paddle-admin.ts");
const paddle = await load("lib/server/paddle.ts");

const NOW = new Date(Date.UTC(2026, 9, 3, 12));
const DAY = 24 * 60 * 60_000;
const at = (offset) => new Date(NOW.getTime() + offset);
const PRICES = { plusMonth: "pri_01plusmonthxxxxxxxxxxxxxxx", plusYear: "pri_01plusyearxxxxxxxxxxxxxxxx", proMonth: "pri_01promonthxxxxxxxxxxxxxxxx", proYear: "pri_01proyearxxxxxxxxxxxxxxxxx" };
const SETTINGS = {
    sandbox: { prices: { plus: { month: PRICES.plusMonth, year: PRICES.plusYear }, pro: { month: PRICES.proMonth, year: PRICES.proYear } }, products: { plus: [], pro: [] }, salesOpen: true },
    production: { prices: {}, products: {} },
};
const OLD_DISCOUNT = "dsc_01olddiscountxxxxxxxxxxxxx";
const OWNER = "owner@example.com";

let auditId = 0;
/** An admin_audit_log document as auditLogMutation writes it. */
function audit(action, code, details, createdAt, actor = OWNER) {
    auditId += 1;
    return [`admin_audit_log/entry${String(auditId).padStart(4, "0")}`, { actor, action, target: `plan_coupons/${code}`, details, createdAt }];
}

/** Paddle with discounts; PATCH may be refused for some, and the list filter only takes active|archived like Paddle's. */
function createPaddle(discounts = [], { refuse = [] } = {}) {
    const state = { discounts: structuredClone(discounts), calls: [] };
    let created = 0;
    const error = (status, code, detail = "") => json(status, { error: { type: "request_error", code, detail } });
    state.route = async (url, init = {}) => {
        assert.equal(url.host, PADDLE_HOST, `unexpected request to ${url.href}`);
        const method = (init.method || "GET").toUpperCase();
        const body = init.body ? JSON.parse(init.body) : null;
        state.calls.push({ method, path: url.pathname, search: url.search, body });
        if (url.pathname === "/discounts" && method === "GET") {
            const statuses = (url.searchParams.get("status") ?? "active").split(",");
            if (statuses.some((status) => status !== "active" && status !== "archived")) return error(400, "invalid_field", "status");
            const ids = (url.searchParams.get("id") ?? "").split(",");
            return json(200, { data: state.discounts.filter((entry) => ids.includes(entry.id) && statuses.includes(entry.status)) });
        }
        if (url.pathname === "/discounts" && method === "POST") {
            const taken = body.code ? state.discounts.find((entry) => entry.code?.toUpperCase() === body.code.toUpperCase()) : null;
            if (taken) return error(409, "discount_code_conflict", `Discount code conflicts with Discount ID ${taken.id}`);
            const discount = { id: `dsc_01created${String(++created).padStart(16, "0")}`, status: "active", times_used: 0, ...body, code: body.code ?? `GEN${created}` };
            state.discounts.push(discount);
            return json(201, { data: discount });
        }
        const one = /^\/discounts\/(dsc_[a-z0-9]+)$/.exec(url.pathname);
        const found = one ? state.discounts.find((entry) => entry.id === one[1]) : null;
        if (one && !found) return error(404, "entity_not_found");
        if (method === "GET" && found) return json(200, { data: found });
        if (method === "PATCH" && found) {
            if (refuse.includes(found.id) && body.status === "active") return error(400, "discount_cannot_be_reactivated");
            Object.assign(found, body);
            return json(200, { data: found });
        }
        throw new Error(`Unsupported Paddle request ${method} ${url.pathname}`);
    };
    state.writes = () => state.calls.filter((call) => call.method !== "GET");
    return state;
}

const restoreAudit = (details) => ({ type: "create", path: `admin_audit_log/restore${++auditId}`, data: { actor: OWNER, action: "coupon.restore", details, createdAt: NOW } });

test("the deletion entry keeps the whole coupon (16 keys at most)", () => {
    const record = { code: "SPRING20", percentOff: 20, plan: "pro", maxUses: 50, used: 0, expiresAt: at(30 * DAY), recur: 3, active: true, note: "bahar", createdBy: OWNER, createdAt: at(-DAY), paddleDiscountId: OLD_DISCOUNT, paddleEnvironment: "sandbox" };
    const details = couponAdmin.couponDeletionDetails(record, "SPRING20", "sandbox");
    assert.deepEqual(details, {
        code: "SPRING20", percentOff: 20, plan: "pro", maxUses: 50, expiresAt: at(30 * DAY).toISOString(), recur: "3", note: "bahar", active: true,
        paddleDiscountId: OLD_DISCOUNT, environment: "sandbox", createdBy: OWNER, createdAt: at(-DAY).toISOString(),
    });
    assert.ok(Object.keys(details).length <= 16);
    assert.equal(couponAdmin.couponDeletionDetails({ ...record, paddleEnvironment: "production" }, "SPRING20", "sandbox").paddleDiscountId, null, "the other environment's discount isn't this one's");
});

test("deleted coupons from the audit log: full copies, older deletions from their creation entry, codes in use left out", async () => {
    const seed = Object.fromEntries([
        // Deleted with a full copy.
        audit("coupon.create", "SPRING20", { code: "SPRING20", percentOff: 10, plan: "any", maxUses: null, expiresAt: null, recur: "first" }, at(-10 * DAY)),
        audit("coupon.delete", "SPRING20", { code: "SPRING20", percentOff: 20, plan: "pro", maxUses: 50, expiresAt: at(30 * DAY).toISOString(), recur: "3", note: "bahar", paddleDiscountId: OLD_DISCOUNT, environment: "sandbox", createdBy: "maker@example.com" }, at(-2 * DAY)),
        // Deleted before copies: terms from the newest creation before the deletion, its actor as creator.
        audit("coupon.create", "OLD10", { code: "OLD10", percentOff: 5, plan: "plus", maxUses: 3, expiresAt: null }, at(-20 * DAY), "first@example.com"),
        audit("coupon.create", "OLD10", { code: "OLD10", percentOff: 10, plan: "plus", maxUses: 7, expiresAt: at(-DAY).toISOString(), recur: "all", paddleDiscountId: "dsc_01old10discountxxxxxxxxxxx" }, at(-15 * DAY), "second@example.com"),
        audit("coupon.delete", "OLD10", { code: "OLD10", paddleDiscountId: "dsc_01old10discountxxxxxxxxxxx" }, at(-5 * DAY), "deleter@example.com"),
        audit("coupon.create", "OLD10", { code: "OLD10", percentOff: 99, plan: "pro" }, at(-4 * DAY), "later@example.com"),
        // Deleted twice: the newest deletion counts.
        audit("coupon.delete", "TWICE", { code: "TWICE", percentOff: 15, plan: "any", recur: "first" }, at(-9 * DAY)),
        audit("coupon.delete", "TWICE", { code: "TWICE", percentOff: 25, plan: "any", recur: "all" }, at(-DAY)),
        // Made outside the panel: no terms anywhere.
        audit("coupon.delete", "MYSTERY", { code: "MYSTERY" }, at(-3 * DAY)),
        // In use again (restored or re-created): not listed.
        audit("coupon.delete", "BACK", { code: "BACK", percentOff: 30, plan: "any" }, at(-6 * DAY)),
        // Other actions don't count.
        audit("coupon.set_active", "SPRING20", { code: "SPRING20", active: false }, at(-3 * DAY)),
    ]);
    await withBackend(seed, {}, async () => {
        const list = await couponAdmin.listDeletedCoupons(new Set(["BACK"]));
        assert.deepEqual(list.map((coupon) => coupon.code), ["TWICE", "SPRING20", "MYSTERY", "OLD10"], "newest deletion first");
        const byCode = Object.fromEntries(list.map((coupon) => [coupon.code, coupon]));
        assert.deepEqual(byCode.SPRING20, {
            code: "SPRING20", percentOff: 20, plan: "pro", recur: 3, maxUses: 50, expiresAt: at(30 * DAY).toISOString(), note: "bahar",
            deletedAt: at(-2 * DAY).toISOString(), deletedBy: OWNER, paddleDiscountId: OLD_DISCOUNT, paddleTimesUsed: null, source: "snapshot",
        });
        assert.equal(byCode.OLD10.source, "created");
        assert.equal(byCode.OLD10.percentOff, 10, "the newest creation before the deletion, not after it");
        assert.equal(byCode.OLD10.recur, "all");
        assert.equal(byCode.OLD10.maxUses, 7);
        assert.equal(byCode.OLD10.deletedBy, "deleter@example.com");
        assert.equal(byCode.OLD10.paddleDiscountId, "dsc_01old10discountxxxxxxxxxxx");
        assert.equal(byCode.TWICE.percentOff, 25);
        assert.equal(byCode.MYSTERY.percentOff, null);
        assert.equal(byCode.MYSTERY.source, "unknown");
    });
});

function restoreSeed(details, extra = {}) {
    return Object.fromEntries([
        ["site_config/paddle", SETTINGS],
        audit("coupon.delete", "SPRING20", { code: "SPRING20", percentOff: 20, plan: "pro", maxUses: 50, expiresAt: at(30 * DAY).toISOString(), recur: "3", note: "bahar", paddleDiscountId: OLD_DISCOUNT, environment: "sandbox", createdBy: "maker@example.com", ...details }, at(-2 * DAY)),
        ...Object.entries(extra),
    ]);
}

test("restoring reopens the archived discount with the coupon's limit, end date and the prices mapped now", async () => {
    paddle.forgetPaddleCaches();
    const api = createPaddle([{ id: OLD_DISCOUNT, status: "archived", code: "SPRING20", times_used: 4, usage_limit: 50, restrict_to: ["pri_01oldxxxxxxxxxxxxxxxxxxxxx"] }]);
    await withBackend(restoreSeed({}), { route: api.route }, async (db) => {
        const result = await couponAdmin.restoreCoupon({ code: "spring20" }, OWNER, restoreAudit, NOW);
        assert.deepEqual(result, { code: "SPRING20", paddle: "reactivated", paddleDiscountId: OLD_DISCOUNT });
        assert.deepEqual(api.writes().map((call) => [call.method, call.path, call.body]), [
            ["PATCH", `/discounts/${OLD_DISCOUNT}`, { status: "active", usage_limit: 50, expires_at: at(30 * DAY).toISOString().replace(/\.\d{3}Z$/, "Z"), restrict_to: [PRICES.proMonth, PRICES.proYear] }],
        ]);
        const stored = db.get("plan_coupons/SPRING20");
        assert.equal(stored.active, true);
        assert.equal(stored.percentOff, 20);
        assert.equal(stored.plan, "pro");
        assert.equal(stored.recur, 3);
        assert.equal(stored.note, "bahar");
        assert.equal(stored.createdBy, "maker@example.com");
        assert.equal(stored.restoredBy, OWNER);
        assert.equal(stored.paddleDiscountId, OLD_DISCOUNT);
        assert.equal(stored.paddleEnvironment, "sandbox");
        const restoreEntry = db.paths().find((path) => path.startsWith("admin_audit_log/restore"));
        assert.equal(db.get(restoreEntry).details.paddleResult, "reactivated");
        // Now in use: not restorable twice, not listed as deleted.
        await assert.rejects(couponAdmin.restoreCoupon({ code: "SPRING20" }, OWNER, restoreAudit, NOW), (error) => error instanceof admin.PaddleAdminError && error.code === "coupon_exists");
    });
});

test("spent end dates and limits need new values; a refused reopen makes a new discount (Paddle's code when ours is taken)", async () => {
    // The end date passed: a new one (or none) is needed.
    paddle.forgetPaddleCaches();
    await withBackend(restoreSeed({ expiresAt: at(-DAY).toISOString() }), { route: createPaddle().route }, async () => {
        await assert.rejects(couponAdmin.restoreCoupon({ code: "SPRING20" }, OWNER, restoreAudit, NOW), (error) => error.code === "coupon_restore_expired");
    });
    // Used up in Paddle: a higher limit is needed; with one, the discount reopens with it.
    const usedUp = createPaddle([{ id: OLD_DISCOUNT, status: "archived", code: "SPRING20", times_used: 50, usage_limit: 50 }]);
    await withBackend(restoreSeed({}), { route: usedUp.route }, async () => {
        await assert.rejects(couponAdmin.restoreCoupon({ code: "SPRING20" }, OWNER, restoreAudit, NOW), (error) => error.code === "coupon_restore_used_up");
        assert.equal(usedUp.writes().length, 0);
        const result = await couponAdmin.restoreCoupon({ code: "SPRING20", maxUses: 80, expiresAt: null }, OWNER, restoreAudit, NOW);
        assert.equal(result.paddle, "reactivated");
        assert.equal(usedUp.writes()[0].body.usage_limit, 80);
        assert.equal(usedUp.writes()[0].body.expires_at, null, "no end date when cleared");
    });
    // Paddle won't reopen it: a new discount; the old one still holds the code, so Paddle makes one up.
    const refused = createPaddle([{ id: OLD_DISCOUNT, status: "expired", code: "SPRING20", times_used: 2, usage_limit: 50 }], { refuse: [OLD_DISCOUNT] });
    await withBackend(restoreSeed({}), { route: refused.route }, async (db) => {
        const result = await couponAdmin.restoreCoupon({ code: "SPRING20" }, OWNER, restoreAudit, NOW);
        assert.equal(result.paddle, "created");
        assert.notEqual(result.paddleDiscountId, OLD_DISCOUNT);
        const posts = refused.writes().filter((call) => call.method === "POST");
        assert.deepEqual(posts.map((call) => call.body.code), ["SPRING20", null]);
        assert.equal(posts[1].body.amount, "20");
        assert.deepEqual(posts[1].body.restrict_to, [PRICES.proMonth, PRICES.proYear]);
        assert.equal(db.get("plan_coupons/SPRING20").paddleDiscountId, result.paddleDiscountId);
    });
    // The discount is gone (or from the other environment): a new one with the coupon's own code.
    const gone = createPaddle();
    await withBackend(restoreSeed({}), { route: gone.route }, async () => {
        const result = await couponAdmin.restoreCoupon({ code: "SPRING20" }, OWNER, restoreAudit, NOW);
        assert.equal(result.paddle, "created");
        assert.equal(gone.writes().find((call) => call.method === "POST").body.code, "SPRING20");
    });
});

test("nothing to restore, and a failed write leaves no open discount behind", async () => {
    paddle.forgetPaddleCaches();
    await withBackend(restoreSeed({}), { route: createPaddle().route }, async () => {
        await assert.rejects(couponAdmin.restoreCoupon({ code: "NEVER1" }, OWNER, restoreAudit, NOW), (error) => error.code === "not_found");
        await assert.rejects(couponAdmin.restoreCoupon({ code: "x" }, OWNER, restoreAudit, NOW), (error) => error.code === "invalid_coupon");
    });
    const api = createPaddle([{ id: OLD_DISCOUNT, status: "archived", code: "SPRING20", times_used: 0, usage_limit: 50 }]);
    const failing = { onCommit: (writes) => { if (writes.some((write) => write.update?.name.includes("plan_coupons/"))) throw new Error("Firestore unavailable"); } };
    await withBackend(restoreSeed({}), { route: api.route, ...failing }, async (db) => {
        await assert.rejects(couponAdmin.restoreCoupon({ code: "SPRING20" }, OWNER, restoreAudit, NOW));
        assert.deepEqual(api.writes().map((call) => call.body.status), ["active", "archived"], "reopened, then archived again");
        assert.equal(db.get("plan_coupons/SPRING20"), null);
    });
});

test("Paddle's use counts of switched-off coupons are read too (status active and archived)", async () => {
    paddle.forgetPaddleCaches();
    const api = createPaddle([{ id: OLD_DISCOUNT, status: "archived", times_used: 7 }, { id: "dsc_01activexxxxxxxxxxxxxxxxxx", status: "active", times_used: 2 }]);
    await withBackend({}, { route: api.route }, async () => {
        const usage = await admin.paddleDiscountUsage([OLD_DISCOUNT, "dsc_01activexxxxxxxxxxxxxxxxxx"]);
        assert.equal(usage.get(OLD_DISCOUNT), 7);
        assert.equal(usage.get("dsc_01activexxxxxxxxxxxxxxxxxx"), 2);
        assert.match(api.calls[0].search, /status=active%2Carchived|status=active,archived/);
    });
});
