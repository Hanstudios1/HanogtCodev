// Run: node --test scripts/tests/*.test.mjs
// A Hanogt Social group's room follows its owner's plan (lib/plans.ts
// PLAN_GROUP_FEATURES, lib/server/group-limits.ts): members, pinned messages,
// custom commands and AutoMod's banned words. A group above its limit after
// the owner's plan went down keeps everything and can still edit or remove.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const plans = await load("lib/plans.ts");
const limits = await load("lib/server/group-limits.ts");
const automod = await load("lib/social/automod-config.ts");

const OWNER = "owner@example.com";
const iso = (offset) => new Date(Date.now() + offset).toISOString();

test("the plans: Free 25 / 25 / 20 / 100, Plus 100 / 50 / 50 / 300, Pro 250 / 100 / 100 / 1,000", () => {
    assert.deepEqual(plans.PLAN_GROUP_FEATURES, {
        free: { members: 25, pinned: 25, commands: 20, bannedWords: 100 },
        plus: { members: 100, pinned: 50, commands: 50, bannedWords: 300 },
        pro: { members: 250, pinned: 100, commands: 100, bannedWords: 1000 },
    });
    assert.deepEqual(plans.GROUP_FEATURES_MAX, plans.PLAN_GROUP_FEATURES.pro);
    // Every limit grows with the plan.
    for (const key of ["members", "pinned", "commands", "bannedWords"]) {
        assert.ok(plans.PLAN_GROUP_FEATURES.free[key] < plans.PLAN_GROUP_FEATURES.plus[key] && plans.PLAN_GROUP_FEATURES.plus[key] < plans.PLAN_GROUP_FEATURES.pro[key], key);
    }
});

test("a group's limits are its owner's plan's, read fresh; Free without an owner, when blocked or after a grant ends", async () => {
    await withBackend({ [`subscriptions/${OWNER}`]: { plan: "plus", status: "active" } }, {}, async () => {
        assert.deepEqual(await limits.groupLimitsFor(OWNER), { plan: "plus", limits: plans.PLAN_GROUP_FEATURES.plus });
    });
    await withBackend({ [`subscriptions/${OWNER}`]: { plan: "pro", status: "blocked" } }, {}, async () => {
        assert.deepEqual(await limits.groupLimitsFor(OWNER), { plan: "free", limits: plans.PLAN_GROUP_FEATURES.free });
    });
    await withBackend({ [`subscriptions/${OWNER}`]: { plan: "pro", status: "active", expiresAt: iso(-60_000) } }, {}, async () => {
        assert.equal((await limits.groupLimitsFor(OWNER)).plan, "free", "an ended staff grant");
    });
    await withBackend({}, {}, async () => {
        assert.deepEqual(await limits.groupLimitsFor(""), { plan: "free", limits: plans.PLAN_GROUP_FEATURES.free });
        assert.deepEqual(await limits.groupLimitsFor(OWNER), { plan: "free", limits: plans.PLAN_GROUP_FEATURES.free }, "no subscription stored");
    });
});

test("a list may grow up to the limit; above it (the plan went down) it can only stay or shrink", () => {
    assert.equal(limits.fitsGroupLimit(20, 19, 20), true);
    assert.equal(limits.fitsGroupLimit(21, 20, 20), false);
    assert.equal(limits.fitsGroupLimit(45, 50, 20), true, "removing from a Plus-sized list on Free");
    assert.equal(limits.fitsGroupLimit(50, 50, 20), true, "editing without adding");
    assert.equal(limits.fitsGroupLimit(51, 50, 20), false, "but never adding");
});

test("AutoMod keeps up to 1,000 distinct banned words (the most any plan allows)", () => {
    assert.equal(automod.AUTOMOD_LIMITS.customWords, 1000);
    const words = automod.sanitizeCustomWords(Array.from({ length: 1500 }, (_, index) => `kelime${index}`));
    assert.equal(words.length, 1000);
    assert.deepEqual(automod.sanitizeCustomWords(["Spam", "spam", " SPAM ", "x"]), ["spam"], "case, repeats and one-letter words");
});
