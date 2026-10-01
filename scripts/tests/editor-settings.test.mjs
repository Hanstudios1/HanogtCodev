// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const settings = await load("lib/editor-settings.ts");
const { sanitizeEditorSettings, parseEditorSettingsFile, serializeEditorSettings, DEFAULT_EDITOR_SETTINGS, toMonacoOptions, resolveEditorTheme, EDITOR_THEMES } = settings;

test("defaults are already valid", () => {
    assert.deepEqual(sanitizeEditorSettings(DEFAULT_EDITOR_SETTINGS), { ...DEFAULT_EDITOR_SETTINGS });
    assert.deepEqual(sanitizeEditorSettings(null), { ...DEFAULT_EDITOR_SETTINGS });
});

test("settings saved by the old settings page are migrated", () => {
    const migrated = sanitizeEditorSettings({
        fontSize: 18, tabSize: 2, wordWrap: false, lineNumbers: true, minimap: false, autoSave: true, theme: "light",
        fontFamily: "Fira Code", autoCloseBrackets: false, autoCloseQuotes: true, autocomplete: false, hoverInfo: false,
        renderIndentGuides: false, lineHeight: 1.8, cursorStyle: "block", codeLens: true, inlineSuggest: true,
    });
    assert.equal(migrated.theme, "vs");
    assert.equal(migrated.fontFamily, "fira-code");
    assert.equal(migrated.wordWrap, "off");
    assert.equal(migrated.lineNumbers, "on");
    assert.equal(migrated.autoSave, "afterDelay");
    assert.equal(migrated.autoClosingBrackets, "never");
    assert.equal(migrated.autoClosingQuotes, "languageDefined");
    assert.equal(migrated.quickSuggestions, false);
    assert.equal(migrated.hover, false);
    assert.equal(migrated.indentGuides, false);
    assert.equal(migrated.lineHeight, 1.8);
    assert.equal(sanitizeEditorSettings({ theme: "dark" }).theme, "vs-dark");
    assert.equal(sanitizeEditorSettings({ theme: "system" }).theme, "auto");
    assert.equal("codeLens" in migrated, false);
});

test("values are clamped and unknown values fall back", () => {
    const clean = sanitizeEditorSettings({ fontSize: 999, lineHeight: "abc", theme: "nope", tabSize: 3.6, autoSaveDelay: 10, ruler: -5, cursorStyle: "triangle" });
    assert.equal(clean.fontSize, 32);
    assert.equal(clean.lineHeight, DEFAULT_EDITOR_SETTINGS.lineHeight);
    assert.equal(clean.theme, "auto");
    assert.equal(clean.tabSize, 4);
    assert.equal(clean.autoSaveDelay, 500);
    assert.equal(clean.ruler, 0);
    assert.equal(clean.cursorStyle, "line");
});

test("export and import round-trip; bad files are rejected", () => {
    const custom = sanitizeEditorSettings({ theme: "hanogt-dracula", fontSize: 16, autoSave: "onFocusChange", ruler: 100 });
    const parsed = parseEditorSettingsFile(serializeEditorSettings(custom));
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.settings, custom);
    assert.equal(parseEditorSettingsFile(JSON.stringify({ editorSettings: { fontSize: 20 } })).settings.fontSize, 20);
    assert.deepEqual(parseEditorSettingsFile("{"), { ok: false, error: "invalid_json" });
    assert.deepEqual(parseEditorSettingsFile("[]"), { ok: false, error: "invalid_format" });
    assert.deepEqual(parseEditorSettingsFile('{"unrelated": true}'), { ok: false, error: "invalid_format" });
    assert.deepEqual(parseEditorSettingsFile(" ".repeat(70_000)), { ok: false, error: "too_large" });
});

test("Monaco options and theme resolution", () => {
    const options = toMonacoOptions(sanitizeEditorSettings({ lineNumbers: "relative", ruler: 80, minimap: false, hover: false, quickSuggestions: false }));
    assert.equal(options.lineNumbers, "relative");
    assert.deepEqual(options.rulers, [80]);
    assert.deepEqual(options.minimap, { enabled: false });
    assert.deepEqual(options.hover, { enabled: "off" });
    assert.equal(options.quickSuggestions, false);
    assert.equal(resolveEditorTheme("auto", "dark"), "vs-dark");
    assert.equal(resolveEditorTheme("auto", "light"), "vs");
    assert.equal(resolveEditorTheme("hanogt-nord", "light"), "hanogt-nord");
    assert.equal(resolveEditorTheme("hanogt-github-light", "light", "dark"), "vs-dark");
    assert.equal(resolveEditorTheme("hanogt-dracula", "light", "dark"), "hanogt-dracula");
    assert.ok(EDITOR_THEMES.filter((theme) => theme.id.startsWith("hanogt-")).length >= 4);
});
