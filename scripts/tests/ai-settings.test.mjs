// Run: node --test scripts/tests/*.test.mjs
// Hanogt AI settings (lib/ai/ai-settings.ts): cleaning stored values, the
// plan's instruction length, strict checks for a save, and the agent finding
// the settings page.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const settings = await load("lib/ai/ai-settings.ts");
const plans = await load("lib/plans.ts");
const intents = await load("lib/ai/agent-intents.ts");
const tools = await load("lib/ai/agent-tools.ts");

const { DEFAULT_AI_SETTINGS, normalizeAiSettings, parseAiSettingsInput } = settings;

test("stored settings: broken or unknown fields fall back to the defaults", () => {
    assert.deepEqual(normalizeAiSettings(null, "free"), DEFAULT_AI_SETTINGS);
    assert.deepEqual(normalizeAiSettings([1, 2], "pro"), DEFAULT_AI_SETTINGS);
    const read = normalizeAiSettings({ tone: "angry", length: 3, language: "tr", defaultMode: "hack", defaultModel: "x", attachEditorFile: "yes", agentMode: "always", thinking: "always", showThinking: "no", secret: "x" }, "plus");
    assert.deepEqual(read, DEFAULT_AI_SETTINGS);
    assert.ok(!("secret" in read));
    const good = { about: "  Öğrenciyim\r\nPython öğreniyorum \u0007", style: "Kısa yaz.", tone: "friendly", length: "short", language: "EN", defaultMode: "code", defaultModel: "conn_12345678", attachEditorFile: false, agentMode: "auto_safe", thinking: "off", showThinking: false };
    assert.deepEqual(normalizeAiSettings(good, "plus"), { ...good, about: "Öğrenciyim\nPython öğreniyorum" });
});

test("instructions are cut to the plan: 500, 1,500 and 3,000 characters", () => {
    const long = { about: "a".repeat(5_000), style: "b".repeat(5_000) };
    for (const plan of plans.PLAN_IDS) {
        const read = normalizeAiSettings(long, plan);
        assert.equal(read.about.length, plans.PLAN_AI_FEATURES[plan].instructionsChars, plan);
        assert.equal(read.style.length, plans.PLAN_AI_FEATURES[plan].instructionsChars, plan);
    }
    assert.equal(settings.AI_INSTRUCTIONS_MAX, 3_000);
});

test("a save is checked strictly: unknown fields, wrong values and too-long text are refused", () => {
    assert.deepEqual(parseAiSettingsInput({ ...DEFAULT_AI_SETTINGS, admin: true }, "pro"), { ok: false, code: "unknown_field", field: "admin" });
    assert.deepEqual(parseAiSettingsInput({ tone: "angry" }, "pro"), { ok: false, code: "invalid_value", field: "tone" });
    assert.deepEqual(parseAiSettingsInput({ about: 42 }, "pro"), { ok: false, code: "invalid_value", field: "about" });
    assert.deepEqual(parseAiSettingsInput({ defaultModel: "../x" }, "pro"), { ok: false, code: "invalid_value", field: "defaultModel" });
    assert.deepEqual(parseAiSettingsInput("x", "pro"), { ok: false, code: "invalid_value" });
    assert.deepEqual(parseAiSettingsInput({ about: "x".repeat(501) }, "free"), { ok: false, code: "too_long", field: "about", limit: 500 });
    assert.equal(parseAiSettingsInput({ about: "x".repeat(501) }, "plus").ok, true, "Plus allows 1,500");
    const partial = parseAiSettingsInput({ tone: "professional", language: "DE" }, "free");
    assert.deepEqual(partial, { ok: true, settings: { ...DEFAULT_AI_SETTINGS, tone: "professional", language: "DE" } }, "missing fields keep their defaults");
    assert.equal(parseAiSettingsInput({ defaultModel: "hanogt", agentMode: "off", attachEditorFile: false }, "free").ok, true);
    // Thinking: auto (the default), on or off, and whether it is shown.
    assert.deepEqual([DEFAULT_AI_SETTINGS.thinking, DEFAULT_AI_SETTINGS.showThinking], ["auto", true]);
    assert.deepEqual(parseAiSettingsInput({ thinking: "on", showThinking: false }, "free"), { ok: true, settings: { ...DEFAULT_AI_SETTINGS, thinking: "on", showThinking: false } });
    assert.deepEqual(parseAiSettingsInput({ thinking: "max" }, "pro"), { ok: false, code: "invalid_value", field: "thinking" });
    assert.deepEqual(parseAiSettingsInput({ showThinking: "yes" }, "pro"), { ok: false, code: "invalid_value", field: "showThinking" });
});

test("the agent can open the settings page", () => {
    assert.equal(intents.extractRoute("Hanogt AI ayarlarını aç"), "/ai/settings");
    assert.equal(intents.extractRoute("yapay zeka ayarları"), "/ai/settings");
    assert.equal(intents.extractRoute("open the AI settings"), "/ai/settings");
    assert.equal(intents.extractRoute("editör ayarlarına git"), "/settings");
    assert.equal(intents.extractRoute("ayarlar"), "/account-settings", "the general rule stays last");
    assert.equal(tools.normalizeAgentRoute("/ai/settings"), "/ai/settings");
    assert.equal(tools.normalizeAgentRoute("/ai/settings/../admin"), null);
});
