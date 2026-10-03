import "./setup.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const plans = await load("lib/plans.ts");
const { FREE_SUBSCRIPTION, PLAN_AI_CONNECTIONS, PLAN_AI_FEATURES, PLAN_AI_LIMITS, PLAN_COLLAB_LIMITS, PLAN_COPY, PLAN_GROUP_LIMITS, PLAN_IDS, PLAN_PROJECT_LIMITS, aiLimitsFor, discountedPrice, effectivePlan, isPaidPlanId, normalizeCouponCode, planRank } = plans;

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

test("plans rank Free < Plus < Pro", () => {
    assert.deepEqual(PLAN_IDS.map(planRank), [0, 1, 2]);
});

test("team editing grows with the owner's plan: 2, 5 and 30 people", () => {
    assert.deepEqual(PLAN_IDS.map((plan) => PLAN_COLLAB_LIMITS[plan].people), [2, 5, 30]);
    for (const plan of PLAN_IDS) assert.ok(PLAN_COLLAB_LIMITS[plan].invites >= PLAN_COLLAB_LIMITS[plan].people, `${plan}: room to invite everyone`);
});

test("the numbers on the Plans page are the limits the server enforces", () => {
    const number = (value, lang) => value.toLocaleString(lang === "TR" ? "tr-TR" : "en-US");
    for (const plan of PLAN_IDS) {
        for (const lang of ["TR", "EN"]) {
            const lines = PLAN_COPY[plan].features.map((feature) => feature.text[lang]);
            const line = (pattern) => {
                const found = lines.filter((text) => pattern.test(text));
                assert.equal(found.length, 1, `${plan}/${lang}: one line matches ${pattern}`);
                return found[0];
            };
            const unlimited = lang === "TR" ? /Sınırsız/ : /Unlimited/;
            const ai = line(/Hanogt AI/);
            assert.ok(ai.includes(number(PLAN_AI_LIMITS[plan].perDay, lang)), `${plan}/${lang}: "${ai}" shows ${PLAN_AI_LIMITS[plan].perDay}`);

            const projects = line(lang === "TR" ? /projesi/ : /projects/);
            const { code, game } = PLAN_PROJECT_LIMITS[plan];
            if (code === null || game === null) {
                assert.equal(code, game);
                assert.match(projects, unlimited);
            } else {
                const expected = lang === "TR" ? `${number(code, lang)} kod projesi ve ${number(game, lang)} oyun projesi` : `${number(code, lang)} code projects and ${number(game, lang)} game projects`;
                assert.equal(projects, expected);
            }

            const groups = line(lang === "TR" ? /grub/ : /groups/);
            const groupLimit = PLAN_GROUP_LIMITS[plan];
            if (groupLimit === null) assert.match(groups, unlimited);
            else assert.ok(` ${groups} `.includes(` ${number(groupLimit, lang)} `), `${plan}/${lang}: "${groups}" shows ${groupLimit}`);

            const team = line(lang === "TR" ? /ekiple düzenleme/ : /Team editing/);
            const people = number(PLAN_COLLAB_LIMITS[plan].people, lang);
            assert.ok(team.includes(lang === "TR" ? `${people} kişi` : `${people} people`), `${plan}/${lang}: "${team}" shows ${people} people`);

            const keys = lines.filter((text) => (lang === "TR" ? /API anahtar/ : /API keys/).test(text));
            if (PLAN_AI_CONNECTIONS[plan] === 0) assert.deepEqual(keys, [], `${plan}/${lang}: no own-key line`);
            else {
                assert.equal(keys.length, 1);
                assert.ok(keys[0].includes(lang === "TR" ? `${PLAN_AI_CONNECTIONS[plan]} yapay zekâ bağlantısı` : `Connect ${PLAN_AI_CONNECTIONS[plan]} AI providers`), `${plan}/${lang}: "${keys[0]}"`);
                const perDay = number(PLAN_AI_FEATURES[plan].ownKey.perDay, lang);
                assert.ok(keys[0].includes(lang === "TR" ? `günde ${perDay} mesaj` : `${perDay} messages a day`), `${plan}/${lang}: "${keys[0]}" shows ${perDay} a day`);
            }

            // The developer API: keys, a minute and a day, as the API counts them.
            const api = lines.filter((text) => (lang === "TR" ? /Geliştirici API/ : /Developer API/).test(text));
            const apiLimits = PLAN_AI_FEATURES[plan].api;
            if (!apiLimits) assert.deepEqual(api, [], `${plan}/${lang}: no API line`);
            else {
                assert.equal(api.length, 1);
                const expected = lang === "TR"
                    ? `${apiLimits.keys} anahtar, dakikada ${number(apiLimits.perMinute, lang)} ve günde ${number(apiLimits.perDay, lang)} istek`
                    : `${apiLimits.keys} keys, ${number(apiLimits.perMinute, lang)} requests a minute and ${number(apiLimits.perDay, lang)} a day`;
                assert.ok(api[0].includes(expected), `${plan}/${lang}: "${api[0]}"`);
            }

            // Paid plans name how much of the open file the AI reads.
            const reading = lines.filter((text) => (lang === "TR" ? /açık dosyanın/ : /open file/).test(text));
            if (plan === "free") assert.deepEqual(reading, []);
            else assert.ok(reading.length === 1 && reading[0].includes(number(PLAN_AI_FEATURES[plan].contextChars, lang)), `${plan}/${lang}: ${reading}`);
        }
    }
});
