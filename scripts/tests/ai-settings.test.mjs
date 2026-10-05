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
    assert.deepEqual(normalizeAiSettings(good, "plus"), { ...DEFAULT_AI_SETTINGS, ...good, about: "Öğrenciyim\nPython öğreniyorum" });
});

test("code and conversation preferences: kept when valid, defaults otherwise", () => {
    assert.deepEqual(
        [DEFAULT_AI_SETTINGS.expertise, DEFAULT_AI_SETTINGS.codeOutput, DEFAULT_AI_SETTINGS.sendShortcut, DEFAULT_AI_SETTINGS.attachConsoleErrors, DEFAULT_AI_SETTINGS.attachProjectTree, DEFAULT_AI_SETTINGS.autoOpenArtifacts, DEFAULT_AI_SETTINGS.localRetentionDays, DEFAULT_AI_SETTINGS.answerFont],
        ["intermediate", "full", "enter", true, false, true, 0, "serif"],
    );
    const good = {
        expertise: "expert", commentLanguage: "EN", codeStyle: "  4 spaces,\nsingle quotes  ", preferredLanguages: ["python", "typescript", "python", "nope"],
        codeOutput: "diff", sendShortcut: "mod-enter", attachConsoleErrors: false, attachProjectTree: true, autoOpenArtifacts: false,
        dictationLanguage: "tr-TR", localRetentionDays: 30, answerVoice: "Google Türkçe", answerVoiceRate: 1.256, answerFont: "sans",
    };
    const read = normalizeAiSettings(good, "free");
    assert.equal(read.expertise, "expert");
    assert.equal(read.commentLanguage, "EN");
    assert.equal(read.codeStyle, "4 spaces, single quotes", "one line, trimmed");
    assert.deepEqual(read.preferredLanguages, ["python", "typescript"], "known languages, each once");
    assert.deepEqual([read.codeOutput, read.sendShortcut, read.attachConsoleErrors, read.attachProjectTree, read.autoOpenArtifacts], ["diff", "mod-enter", false, true, false]);
    assert.deepEqual([read.dictationLanguage, read.localRetentionDays, read.answerVoice, read.answerVoiceRate, read.answerFont], ["tr-TR", 30, "Google Türkçe", 1.26, "sans"]);
    const broken = normalizeAiSettings({ expertise: "guru", commentLanguage: "turkish", preferredLanguages: "python", codeOutput: "patch", sendShortcut: "space", dictationLanguage: "Turkish", localRetentionDays: 14, answerVoiceRate: 5, answerFont: "comic" }, "free");
    for (const field of ["expertise", "commentLanguage", "preferredLanguages", "codeOutput", "sendShortcut", "dictationLanguage", "localRetentionDays", "answerVoiceRate", "answerFont"]) {
        assert.deepEqual(broken[field], DEFAULT_AI_SETTINGS[field], field);
    }
    assert.equal(normalizeAiSettings({ codeStyle: "x".repeat(900) }, "pro").codeStyle.length, settings.AI_CODE_STYLE_MAX);
    assert.equal(normalizeAiSettings({ preferredLanguages: ["python", "javascript", "typescript", "go", "rust", "java", "c"] }, "pro").preferredLanguages.length, settings.AI_PREFERRED_LANGUAGES_MAX);
});

test("a save of the new preferences is checked strictly too", () => {
    const ok = parseAiSettingsInput({ expertise: "beginner", preferredLanguages: ["python", "go"], localRetentionDays: 7, sendShortcut: "mod-enter", answerVoiceRate: 0.5 }, "free");
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.settings.preferredLanguages, ["python", "go"]);
    const refused = [
        [{ expertise: "guru" }, "expertise"],
        [{ preferredLanguages: ["python", "python"] }, "preferredLanguages"],
        [{ preferredLanguages: ["plaintext"] }, "preferredLanguages"],
        [{ preferredLanguages: ["python", "javascript", "typescript", "go", "rust", "java"] }, "preferredLanguages"],
        [{ codeStyle: "x".repeat(301) }, "codeStyle"],
        [{ localRetentionDays: 14 }, "localRetentionDays"],
        [{ dictationLanguage: "tr_TR" }, "dictationLanguage"],
        [{ answerVoiceRate: 2.5 }, "answerVoiceRate"],
        [{ answerVoiceRate: Number.NaN }, "answerVoiceRate"],
        [{ attachProjectTree: "yes" }, "attachProjectTree"],
        [{ codeOutput: "patch" }, "codeOutput"],
    ];
    for (const [input, field] of refused) assert.deepEqual(parseAiSettingsInput(input, "pro"), { ok: false, code: "invalid_value", field }, field);
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
