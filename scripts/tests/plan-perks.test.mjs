// Run: node --test scripts/tests/*.test.mjs
// Paid-plan perks added in 0.3.32 (lib/plans.ts): longer Hanogt Social
// messages, longer group answers from Hanogt AI, and game exports without the
// "Made with Hanogt Engine" badge. The Free plan keeps exactly what it had.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const plans = await load("lib/plans.ts");
const { checkMessageLength } = await load("lib/server/message-limits.ts");
const { groupAiLimits } = await load("lib/server/group-ai-bot.ts");
const webExport = await load("lib/game-engine/web-export.ts");
const { MARKDOWN_MAX_LENGTH } = await load("lib/social/markdown.ts");

const ALI = "ali@example.com";
const seed = (plan) => ({ [`users/${ALI}`]: { email: ALI }, [`subscriptions/${ALI}`]: { plan, status: "active" } });

test("messages: Free keeps 4,000 characters; Plus 6,000 and Pro 8,000; readers keep the longest", () => {
    assert.deepEqual(plans.PLAN_MESSAGE_CHARS, { free: 4_000, plus: 6_000, pro: 8_000 });
    assert.equal(plans.MESSAGE_CHARS_MAX, 8_000);
});

test("messages: the sender's plan decides; a short text needs no read", async () => {
    // No subscription document and no backend data at all: a text within Free's limit is allowed without reading.
    await withBackend({}, {}, async (db) => {
        assert.deepEqual(await checkMessageLength(ALI, 4_000), { allowed: true });
        assert.equal(db.paths().length, 0);
    });
    await withBackend(seed("free"), {}, async () => {
        assert.deepEqual(await checkMessageLength(ALI, 4_001), { allowed: false, plan: "free", limit: 4_000, upgrade: "plus" });
    });
    await withBackend(seed("plus"), {}, async () => {
        assert.deepEqual(await checkMessageLength(ALI, 6_000), { allowed: true });
        assert.deepEqual(await checkMessageLength(ALI, 6_001), { allowed: false, plan: "plus", limit: 6_000, upgrade: "pro" });
    });
    await withBackend(seed("pro"), {}, async () => {
        assert.deepEqual(await checkMessageLength(ALI, 8_000), { allowed: true });
        assert.deepEqual(await checkMessageLength(ALI, 8_001), { allowed: false, plan: "pro", limit: 8_000, upgrade: null });
    });
});

test("group answers from Hanogt AI: Free keeps 1,200 tokens and 12 messages; Plus and Pro get more", () => {
    assert.deepEqual(plans.PLAN_GROUP_AI.free, { answerTokens: 1_200, answerChars: 4_000, history: 12 });
    assert.deepEqual(groupAiLimits("free"), { maxTokens: 1_200, answerChars: 4_000, history: 12 });
    assert.deepEqual(groupAiLimits("plus"), { maxTokens: 2_000, answerChars: 8_000, history: 20 });
    assert.deepEqual(groupAiLimits("pro"), { maxTokens: 3_000, answerChars: 12_000, history: 30 });
    for (const plan of plans.PLAN_IDS) {
        assert.ok(groupAiLimits(plan).maxTokens <= plans.PLAN_AI_FEATURES[plan].maxTokens, `${plan}: never more than a chat answer`);
        // The chat's Markdown still formats the longest answer and the longest message.
        assert.ok(groupAiLimits(plan).answerChars <= MARKDOWN_MAX_LENGTH && plans.PLAN_MESSAGE_CHARS[plan] <= MARKDOWN_MAX_LENGTH, `${plan}: Markdown renders it`);
    }
});

test("exports without the badge: a Plus and Pro choice; Free exports keep it", () => {
    assert.deepEqual(plans.PLAN_UNBRANDED_EXPORT, { free: false, plus: true, pro: true });
    const project = { name: "Uzay Koşusu", description: "", settings: { aspect: "16:9", localization: { startLanguage: "tr", languages: ["tr"] } } };
    const branded = webExport.webIndexHtml(project, "https://hanogt.example");
    assert.match(branded, /id="badge"/);
    assert.match(branded, /ile yapıldı/);
    const plain = webExport.webIndexHtml(project, "https://hanogt.example", { badge: false });
    assert.doesNotMatch(plain, /id="badge"/);
    assert.doesNotMatch(plain, /ile yapıldı|Made with/);
    assert.match(webExport.webManifest(project).description, /Made with/);
    assert.equal(webExport.webManifest(project, { badge: false }).description, "Uzay Koşusu");
});
