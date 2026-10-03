// Run: node --test scripts/tests/*.test.mjs
// The Plus / Pro badge on a subscriber's profile (lib/plan-badge.ts,
// lib/server/plan-badge.ts): which badge a subscription earns and until when,
// reading a stored badge, the team's plan_badge audience deciding whose badges
// exist, and the server keeping the public profile in step without ever
// bringing a deleted profile back.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
const badges = await load("lib/plan-badge.ts");
const plans = await load("lib/plans.ts");
const { PERIOD_GRACE_MS } = await load("lib/paddle.ts");
const server = await load("lib/server/plan-badge.ts");
const features = await load("lib/server/features.ts");

const NOW = Date.parse("2026-10-03T12:00:00.000Z");
const DAY = 24 * 60 * 60_000;
const iso = (offset) => new Date(NOW + offset).toISOString();
const ALI = "ali@example.com";

/** A Paddle subscription to `plan` whose period ends in `days`. */
function paddle(plan, days, extra = {}) {
    return {
        environment: "sandbox",
        subscriptionId: "sub_01aaaaaaaaaaaaaaaaaaaaaaaa",
        customerId: "ctm_01aaaaaaaaaaaaaaaaaaaaaaaa",
        status: "active",
        plan,
        interval: "month",
        priceId: "pri_01aaaaaaaaaaaaaaaaaaaaaaaa",
        productId: "pro_01aaaaaaaaaaaaaaaaaaaaaaaa",
        currentPeriodEnd: iso(days * DAY),
        nextBilledAt: iso(days * DAY),
        scheduledChange: null,
        canceledAt: null,
        paddleUpdatedAt: iso(0),
        syncedAt: iso(0),
        ...extra,
    };
}
const subscription = (fields) => ({ ...plans.FREE_SUBSCRIPTION, ...fields });

test("the badge a subscription earns, and until when", () => {
    assert.equal(badges.planBadgeOf(plans.FREE_SUBSCRIPTION, NOW), null, "Free: no badge");
    // Staff grants: until the grant ends; a grant without an end gives a badge without one.
    assert.deepEqual(badges.planBadgeOf(subscription({ plan: "pro", expiresAt: iso(10 * DAY) }), NOW), { plan: "pro", until: iso(10 * DAY) });
    assert.deepEqual(badges.planBadgeOf(subscription({ plan: "plus", expiresAt: null }), NOW), { plan: "plus", until: null });
    assert.equal(badges.planBadgeOf(subscription({ plan: "pro", expiresAt: iso(-DAY) }), NOW), null, "an ended grant");
    // Paddle: the end of the paid period (or the next payment, whichever is later) plus the payment grace.
    assert.deepEqual(
        badges.planBadgeOf(subscription({ paddle: paddle("plus", 20, { nextBilledAt: iso(21 * DAY) }) }), NOW),
        { plan: "plus", until: new Date(NOW + 21 * DAY + PERIOD_GRACE_MS).toISOString() },
    );
    assert.deepEqual(
        badges.planBadgeOf(subscription({ paddle: paddle("pro", 0, { currentPeriodEnd: null, nextBilledAt: null }) }), NOW),
        { plan: "pro", until: iso(35 * DAY) },
        "no dates from Paddle: about a month",
    );
    // The higher plan wins, with its own end.
    assert.deepEqual(badges.planBadgeOf(subscription({ plan: "pro", expiresAt: iso(5 * DAY), paddle: paddle("plus", 30) }), NOW), { plan: "pro", until: iso(5 * DAY) });
    // Blocked or hidden by the subscriber: none.
    assert.equal(badges.planBadgeOf(subscription({ status: "blocked", paddle: paddle("pro", 30) }), NOW), null);
    assert.equal(badges.planBadgeOf(subscription({ paddle: paddle("pro", 30), planBadgeHidden: true }), NOW), null);
    // A paused or canceled subscription unlocks nothing, so it earns nothing.
    assert.equal(badges.planBadgeOf(subscription({ paddle: paddle("pro", 30, { status: "paused" }) }), NOW), null);
});

test("a stored badge is read with its end; anything broken counts as none", () => {
    assert.equal(badges.readStoredPlanBadge(null), null);
    assert.equal(badges.readStoredPlanBadge({ plan: "gold", until: null }), null);
    assert.equal(badges.readStoredPlanBadge({ plan: "pro", until: "soon" }), null);
    assert.equal(badges.readStoredPlanBadge({ plan: "pro", until: 42 }), null);
    assert.deepEqual(badges.readStoredPlanBadge({ plan: "pro" }), { plan: "pro", until: null });
    assert.deepEqual(badges.readStoredPlanBadge({ plan: "plus", until: "2026-10-05T00:00:00Z" }), { plan: "plus", until: "2026-10-05T00:00:00.000Z" });
    // Shown while `until` hasn't passed: an ended plan's badge goes without anyone deleting it.
    assert.equal(badges.readPlanBadge({ plan: "plus", until: iso(DAY) }, NOW), "plus");
    assert.equal(badges.readPlanBadge({ plan: "plus", until: iso(-1) }, NOW), null);
    assert.equal(badges.readPlanBadge({ plan: "pro", until: null }, NOW), "pro");
    assert.ok(badges.sameStoredBadge({ plan: "pro", until: null }, { plan: "pro", until: null }));
    assert.ok(!badges.sameStoredBadge({ plan: "pro", until: null }, { plan: "pro", until: iso(0) }));
    assert.ok(badges.sameStoredBadge(null, null));
    // What others see for the subscriber's own view of it.
    assert.equal(badges.visiblePlanBadge({ plan: "pro", hidden: false, allowed: true }), "pro");
    assert.equal(badges.visiblePlanBadge({ plan: "pro", hidden: true, allowed: true }), null);
    assert.equal(badges.visiblePlanBadge({ plan: "pro", hidden: false, allowed: false }), null);
    assert.equal(badges.visiblePlanBadge({ plan: null, hidden: false, allowed: true }), null);
    assert.equal(badges.visiblePlanBadge(null), null);
});

function seed({ plan = "plus", role = "user", audience, profile = {} } = {}) {
    return {
        [`users/${ALI}`]: { email: ALI, role },
        [`subscriptions/${ALI}`]: { plan, status: "active", expiresAt: new Date(Date.now() + 10 * DAY) },
        ...(profile ? { [`public_profiles/${ALI}`]: { email: ALI, username: "ali", ...profile } } : {}),
        ...(audience ? { "site_config/features": { audiences: { plan_badge: audience } } } : {}),
    };
}

test("badges exist only where the team opened them: staff, early access (Pro and staff) or everyone (the default)", async () => {
    const cases = [
        // [audience, plan, role, badge written]
        [undefined, "plus", "user", "plus"],
        ["staff", "plus", "user", null],
        ["staff", "plus", "moderator", "plus"],
        ["early", "plus", "user", null],
        ["early", "pro", "user", "pro"],
        ["all", "plus", "user", "plus"],
        ["off", "pro", "admin", null],
    ];
    for (const [audience, plan, role, expected] of cases) {
        features.forgetFeatureCache();
        await withBackend(seed({ plan, role, audience }), {}, async (db) => {
            const wrote = await server.syncPlanBadge(ALI);
            assert.equal(wrote, expected !== null, `${audience ?? "default"} / ${plan} / ${role}`);
            assert.equal(db.get(`public_profiles/${ALI}`).planBadge?.plan ?? null, expected, `${audience ?? "default"} / ${plan} / ${role}`);
            // In step already: nothing more is written.
            assert.equal(await server.syncPlanBadge(ALI), false);
        });
    }
});

test("hiding, a lower plan and an ended plan take the badge away; other profile fields stay", async () => {
    features.forgetFeatureCache();
    const stale = { planBadge: { plan: "pro", until: null }, bio: "merhaba", staffRole: null };
    await withBackend(seed({ plan: "plus", audience: "all", profile: stale }), {}, async (db) => {
        assert.equal(await server.syncPlanBadge(ALI), true, "Pro badge, Plus plan");
        assert.equal(db.get(`public_profiles/${ALI}`).planBadge.plan, "plus");
        const hidden = { ...(await (await load("lib/server/plans.ts")).getSubscription(ALI)), planBadgeHidden: true };
        assert.equal(await server.syncPlanBadge(ALI, { subscription: hidden }), true);
        const profile = db.get(`public_profiles/${ALI}`);
        assert.ok(!("planBadge" in profile), "removed");
        assert.equal(profile.bio, "merhaba", "only the badge field is written");
    });
    features.forgetFeatureCache();
    await withBackend(seed({ plan: "free", audience: "all", profile: { planBadge: { plan: "plus", until: null } } }), {}, async (db) => {
        assert.equal(await server.syncPlanBadge(ALI), true, "back on Free");
        assert.ok(!("planBadge" in db.get(`public_profiles/${ALI}`)));
    });
});

test("no public profile, or a deleted one: nothing is created", async () => {
    features.forgetFeatureCache();
    await withBackend(seed({ plan: "pro", audience: "all", profile: null }), {}, async (db) => {
        assert.equal(await server.syncPlanBadge(ALI), false);
        assert.equal(db.has(`public_profiles/${ALI}`), false);
    });
    // The profile disappears between the read and the write (the account was deleted meanwhile).
    features.forgetFeatureCache();
    await withBackend(seed({ plan: "pro", audience: "all" }), {}, async (db) => {
        const original = globalThis.fetch;
        globalThis.fetch = async (url, init) => {
            if ((init?.method || "GET") === "PATCH") await db.fetch(new URL(String(url)).href, { method: "DELETE" });
            return original(url, init);
        };
        try {
            assert.equal(await server.syncPlanBadge(ALI), false);
        } finally {
            globalThis.fetch = original;
        }
        assert.equal(db.has(`public_profiles/${ALI}`), false, "not brought back");
    });
});

test("the subscriber's own view, the quiet sync and the page-load throttle", async () => {
    features.forgetFeatureCache();
    await withBackend(seed({ plan: "pro", audience: "early" }), {}, async (db) => {
        const sub = await (await load("lib/server/plans.ts")).getSubscription(ALI);
        assert.deepEqual(await server.planBadgeStateFor(ALI, sub), { plan: "pro", hidden: false, allowed: true });
        assert.deepEqual(await server.planBadgeStateFor(ALI, { ...sub, planBadgeHidden: true }), { plan: "pro", hidden: true, allowed: true });
        assert.deepEqual(await server.planBadgeStateFor(ALI, plans.FREE_SUBSCRIPTION), { plan: null, hidden: false, allowed: false }, "early access doesn't include Free");
        // Page loads: the first one syncs, the next ones within ten minutes don't read anything.
        assert.equal(await server.syncPlanBadgeThrottled(ALI), true);
        assert.equal(db.get(`public_profiles/${ALI}`).planBadge.plan, "pro");
        const original = globalThis.fetch;
        globalThis.fetch = () => Promise.reject(new Error("read while throttled"));
        try {
            assert.equal(await server.syncPlanBadgeThrottled(ALI), false);
        } finally {
            globalThis.fetch = original;
        }
    });
    // …unless the team changed whose badges exist meanwhile: then the next page load catches up at once.
    features.forgetFeatureCache();
    await withBackend(seed({ plan: "pro", audience: "off", profile: { planBadge: { plan: "pro", until: null } } }), {}, async (db) => {
        assert.equal(await server.syncPlanBadgeThrottled(ALI), true);
        assert.ok(!("planBadge" in db.get(`public_profiles/${ALI}`)), "badges switched off: removed");
        assert.equal(await server.syncPlanBadgeThrottled(ALI), false);
    });
    // A failure is logged, never thrown (it runs after a payment was stored).
    features.forgetFeatureCache();
    const original = globalThis.fetch;
    const warn = console.warn;
    const warnings = [];
    globalThis.fetch = () => Promise.reject(new Error("network down"));
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
        assert.equal(await server.syncPlanBadgeQuietly("veli@example.com"), false);
    } finally {
        globalThis.fetch = original;
        console.warn = warn;
    }
    assert.ok(warnings.some((line) => line.startsWith("[plan-badge]")), warnings.join("\n"));
});
