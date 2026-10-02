import "./setup.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const plans = await load("lib/plans.ts");
const { FREE_SUBSCRIPTION, PLAN_AI_LIMITS, aiLimitsFor, discountedPrice, effectivePlan, isPaidPlanId, normalizeCouponCode } = plans;

const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 24 * 60 * 60_000;
const iso = (offset) => new Date(NOW + offset).toISOString();

test("blocked, expired and free subscriptions give Free benefits", () => {
    assert.equal(effectivePlan({ plan: "pro", status: "active", expiresAt: null }, NOW), "pro");
    assert.equal(effectivePlan({ plan: "pro", status: "active", expiresAt: iso(DAY) }, NOW), "pro");
    assert.equal(effectivePlan({ plan: "pro", status: "active", expiresAt: iso(-1) }, NOW), "free");
    assert.equal(effectivePlan({ plan: "plus", status: "blocked", expiresAt: null }, NOW), "free");
    assert.equal(effectivePlan({ plan: "free", status: "active", expiresAt: iso(DAY) }, NOW), "free");
    assert.equal(effectivePlan({ plan: "plus", status: "active", expiresAt: "not a date" }, NOW), "free");
});

test("Hanogt AI limits follow the plan and add a live staff grant", () => {
    assert.deepEqual(aiLimitsFor(FREE_SUBSCRIPTION, NOW), PLAN_AI_LIMITS.free);
    const pro = { ...FREE_SUBSCRIPTION, plan: "pro" };
    assert.deepEqual(aiLimitsFor(pro, NOW), PLAN_AI_LIMITS.pro);
    const granted = { ...FREE_SUBSCRIPTION, aiBonusDaily: 100, aiBonusUntil: iso(DAY) };
    assert.equal(aiLimitsFor(granted, NOW).perDay, PLAN_AI_LIMITS.free.perDay + 100);
    assert.equal(aiLimitsFor({ ...granted, aiBonusUntil: iso(-1) }, NOW).perDay, PLAN_AI_LIMITS.free.perDay, "an expired grant adds nothing");
    assert.equal(aiLimitsFor({ ...granted, aiBonusUntil: null }, NOW).perDay, PLAN_AI_LIMITS.free.perDay, "a grant needs an end date");
    assert.equal(aiLimitsFor({ ...granted, plan: "pro", status: "blocked" }, NOW).perDay, PLAN_AI_LIMITS.free.perDay, "blocked accounts lose plan and grant");
});

test("discounts round to kuruş and never go negative", () => {
    assert.equal(discountedPrice(100, 25), 75);
    assert.equal(discountedPrice(59.99, 10), 53.99);
    assert.equal(discountedPrice(80, 150), 0);
    assert.equal(discountedPrice(80, -5), 80);
    assert.equal(discountedPrice(null, 10), null);
});

test("coupon codes are upper-cased and restricted", () => {
    assert.equal(normalizeCouponCode(" hanogt20 "), "HANOGT20");
    assert.equal(normalizeCouponCode("YAZ-2026_A"), "YAZ-2026_A");
    assert.equal(normalizeCouponCode("ab"), "");
    assert.equal(normalizeCouponCode("-ABC"), "");
    assert.equal(normalizeCouponCode("İNDİRİM"), "", "letters outside A-Z are refused");
    assert.equal(normalizeCouponCode("A".repeat(25)), "");
    assert.equal(normalizeCouponCode(42), "");
});

test("only Plus and Pro can be waited for", () => {
    assert.equal(isPaidPlanId("plus"), true);
    assert.equal(isPaidPlanId("pro"), true);
    assert.equal(isPaidPlanId("free"), false);
    assert.equal(isPaidPlanId("enterprise"), false);
});
