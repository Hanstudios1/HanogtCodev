// Run: node --test scripts/tests/*.test.mjs
// Features opened step by step (lib/features.ts, lib/server/features.ts):
// audiences off / staff / early (Pro and staff) / all, the stored flags with
// their defaults, the one-minute cache and the admin's write.
import assert from "node:assert/strict";
import test from "node:test";
import { failure, setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const shared = await load("lib/features.ts");
const server = await load("lib/server/features.ts");

const VIEWERS = {
    signedOut: null,
    free: { staff: false, plan: "free" },
    plus: { staff: false, plan: "plus" },
    pro: { staff: false, plan: "pro" },
    staff: { staff: true, plan: "free" },
};

test("who each audience includes", () => {
    const expected = {
        off: { signedOut: false, free: false, plus: false, pro: false, staff: false },
        staff: { signedOut: false, free: false, plus: false, pro: false, staff: true },
        early: { signedOut: false, free: false, plus: false, pro: true, staff: true },
        all: { signedOut: true, free: true, plus: true, pro: true, staff: true },
    };
    for (const audience of shared.FEATURE_AUDIENCES) {
        for (const [name, viewer] of Object.entries(VIEWERS)) {
            assert.equal(shared.audienceAllows(audience, viewer), expected[audience][name], `${audience} / ${name}`);
        }
    }
});

test("stored flags: unknown features and audiences are ignored; everything new starts with the team", () => {
    assert.deepEqual(shared.DEFAULT_FEATURE_FLAGS, { ai_api: "staff", plan_badge: "staff", ai_voice: "staff" });
    assert.deepEqual(shared.normalizeFeatureFlags(null), shared.DEFAULT_FEATURE_FLAGS);
    assert.deepEqual(shared.normalizeFeatureFlags({ ai_api: "all", ai_voice: "everyone", unknown: "all" }), { ai_api: "all", plan_badge: "staff", ai_voice: "staff" });
    const allowed = shared.allowedFeatures({ ai_api: "all", plan_badge: "early", ai_voice: "off" }, VIEWERS.pro);
    assert.deepEqual(allowed, { ai_api: true, plan_badge: true, ai_voice: false });
});

test("the server reads site_config/features once a minute; nothing stored means the defaults", async () => {
    server.forgetFeatureCache();
    await withBackend({}, {}, async () => {
        assert.deepEqual(await server.getFeatureFlags(), shared.DEFAULT_FEATURE_FLAGS);
    });
    server.forgetFeatureCache();
    await withBackend({ "site_config/features": { audiences: { ai_voice: "early" }, updatedBy: "owner@example.com" } }, {}, async () => {
        assert.equal((await server.getFeatureFlags()).ai_voice, "early");
        assert.equal(await server.featureAllowed("ai_voice", VIEWERS.pro), true);
        assert.equal(await server.featureAllowed("ai_voice", VIEWERS.plus), false);
    });
    // Cached: a changed document isn't read again within the minute…
    await withBackend({ "site_config/features": { audiences: { ai_voice: "off" } } }, {}, async () => {
        assert.equal((await server.getFeatureFlags()).ai_voice, "early");
        // …unless asked for fresh (after the admin's change the cache is dropped).
        assert.equal((await server.getFeatureFlags(true)).ai_voice, "off");
    });
});

test("an unreadable database keeps the last flags known, else the defaults", async () => {
    server.forgetFeatureCache();
    await withBackend({ "site_config/features": { audiences: { ai_api: "all" } } }, {}, async () => {
        assert.equal((await server.getFeatureFlags()).ai_api, "all");
    });
    const broken = async () => failure(503, "UNAVAILABLE");
    const original = globalThis.fetch;
    globalThis.fetch = broken;
    try {
        assert.equal((await server.getFeatureFlags(true)).ai_api, "all", "the last flags known");
        server.forgetFeatureCache();
        assert.deepEqual(await server.getFeatureFlags(true), shared.DEFAULT_FEATURE_FLAGS, "else the defaults");
    } finally {
        globalThis.fetch = original;
    }
});

test("the admin's write changes one audience and records who did it", () => {
    const at = new Date("2026-10-03T12:00:00Z");
    assert.deepEqual(server.featureAudienceWrite("plan_badge", "all", "owner@example.com", at), {
        type: "update",
        path: "site_config/features",
        data: { audiences: { plan_badge: "all" }, updatedAt: at, updatedBy: "owner@example.com" },
        updateFields: ["audiences.plan_badge", "updatedAt", "updatedBy"],
    });
});
