// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const settings = await load("lib/editor-settings.ts");
const {
    sanitizeEditorSettings, parseEditorSettingsFile, serializeEditorSettings, DEFAULT_EDITOR_SETTINGS, toMonacoOptions, resolveEditorTheme, EDITOR_THEMES,
    EDITOR_SETTING_KEYS, changedEditorSettingKeys, editorSettingsEqual, parseAccountEditorSettings, compareEditorSettingsCopies, tabSizeFor,
} = settings;

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
    assert.deepEqual(options.minimap, { enabled: false, side: "right" });
    assert.deepEqual(options.hover, { enabled: "off" });
    assert.equal(options.quickSuggestions, false);
    assert.equal(resolveEditorTheme("auto", "dark"), "vs-dark");
    assert.equal(resolveEditorTheme("auto", "light"), "vs");
    assert.equal(resolveEditorTheme("hanogt-nord", "light"), "hanogt-nord");
    assert.equal(resolveEditorTheme("hanogt-github-light", "light", "dark"), "vs-dark");
    assert.equal(resolveEditorTheme("hanogt-dracula", "light", "dark"), "hanogt-dracula");
    assert.ok(EDITOR_THEMES.filter((theme) => theme.id.startsWith("hanogt-")).length >= 4);
});

test("saving, console and finer editor settings: defaults, limits and Monaco options", () => {
    const d = DEFAULT_EDITOR_SETTINGS;
    assert.deepEqual([d.formatOnSave, d.runOnSave, d.confirmCloseUnsaved, d.consoleWordWrap, d.unicodeHighlight], [false, false, true, true, true]);
    assert.deepEqual([d.consoleFontSize, d.defaultLanguage, d.multiCursorModifier, d.fontWeight, d.letterSpacing, d.minimapSide, d.acceptSuggestionOnEnter], [12.5, "javascript", "alt", "400", 0, "right", "on"]);
    const read = sanitizeEditorSettings({
        formatOnSave: true, runOnSave: true, confirmCloseUnsaved: false, consoleFontSize: 40, consoleWordWrap: false,
        defaultLanguage: "py", languageTabSizes: { python: 4, js: 2, nope: 3, go: 12, java: "8" },
        unicodeHighlight: false, renderControlCharacters: false, multiCursorModifier: "ctrlCmd", fontWeight: 600, letterSpacing: 0.55,
        minimapSide: "left", acceptSuggestionOnEnter: "smart",
    });
    assert.deepEqual([read.formatOnSave, read.runOnSave, read.confirmCloseUnsaved, read.consoleWordWrap], [true, true, false, false]);
    assert.equal(read.consoleFontSize, 22, "clamped");
    assert.equal(read.defaultLanguage, "python", "aliases resolve to the registry id");
    assert.deepEqual(read.languageTabSizes, { python: 4, javascript: 2 }, "known languages and sizes 1-8 only");
    assert.deepEqual([read.multiCursorModifier, read.fontWeight, read.letterSpacing, read.minimapSide, read.acceptSuggestionOnEnter], ["ctrlCmd", "600", 0.6, "left", "smart"]);
    assert.equal(sanitizeEditorSettings({ defaultLanguage: "klingon" }).defaultLanguage, "javascript");
    const tooMany = Object.fromEntries(["python", "javascript", "typescript", "java", "c", "cpp", "csharp", "go", "rust", "ruby", "php", "lua", "kotlin", "swift", "dart", "scala", "r", "perl", "haskell", "elixir", "clojure", "bash", "sql", "html", "css", "json"].map((id) => [id, 2]));
    assert.ok(Object.keys(sanitizeEditorSettings({ languageTabSizes: tooMany }).languageTabSizes).length <= 24);

    const options = toMonacoOptions(read);
    assert.deepEqual(options.minimap, { enabled: true, side: "left" });
    assert.equal(options.multiCursorModifier, "ctrlCmd");
    assert.equal(options.fontWeight, "600");
    assert.equal(options.letterSpacing, 0.6);
    assert.equal(options.acceptSuggestionOnEnter, "smart");
    assert.deepEqual(options.unicodeHighlight, { ambiguousCharacters: false, invisibleCharacters: false, nonBasicASCII: false });
    assert.equal(options.renderControlCharacters, false);
});

test("the tab size for a language: its own, else the general one", () => {
    const settings = sanitizeEditorSettings({ tabSize: 4, languageTabSizes: { javascript: 2 } });
    assert.equal(tabSizeFor(settings, "javascript"), 2);
    assert.equal(tabSizeFor(settings, "js"), 2);
    assert.equal(tabSizeFor(settings, "python"), 4);
    assert.equal(tabSizeFor(settings, null), 4);
    // Objects compare by value.
    assert.deepEqual(changedEditorSettingKeys(settings, sanitizeEditorSettings({ tabSize: 4, languageTabSizes: { javascript: 2 } })), []);
    assert.deepEqual(changedEditorSettingKeys(settings, sanitizeEditorSettings({ tabSize: 4, languageTabSizes: { javascript: 4 } })), ["languageTabSizes"]);
});

test("draft comparison helpers", () => {
    const base = sanitizeEditorSettings({});
    assert.ok(!EDITOR_SETTING_KEYS.includes("version"));
    assert.equal(EDITOR_SETTING_KEYS.length, Object.keys(DEFAULT_EDITOR_SETTINGS).length - 1);
    assert.ok(editorSettingsEqual(base, { ...DEFAULT_EDITOR_SETTINGS }));
    assert.deepEqual(changedEditorSettingKeys(base, { ...base, fontSize: 20, minimap: false }), ["fontSize", "minimap"]);
});

test("account copies use the import rules", () => {
    assert.equal(parseAccountEditorSettings(null), null);
    assert.equal(parseAccountEditorSettings([]), null);
    assert.equal(parseAccountEditorSettings({ unrelated: true }), null);
    const parsed = parseAccountEditorSettings({ fontSize: 99, theme: "hanogt-nord", injected: "<script>" });
    assert.equal(parsed.fontSize, 32);
    assert.equal(parsed.theme, "hanogt-nord");
    assert.equal("injected" in parsed, false);
});

test("deciding between this device and the account copy", () => {
    const defaults = sanitizeEditorSettings({});
    const custom = sanitizeEditorSettings({ fontSize: 18 });
    const at = (iso) => iso;
    const local = (settings, updatedAt, stored = true) => ({ settings, updatedAt, stored });
    const account = (editorSettings, updatedAt) => ({ editorSettings, updatedAt });
    assert.equal(compareEditorSettingsCopies(local(custom, at("2026-01-01T00:00:00.000Z")), account(null, null)), "account_empty");
    assert.equal(compareEditorSettingsCopies(local(custom, null), account(custom, at("2026-01-01T00:00:00.000Z"))), "in_sync");
    // Nothing was ever saved on this device: the account copy is applied silently.
    assert.equal(compareEditorSettingsCopies(local(defaults, null, false), account(custom, at("2026-01-01T00:00:00.000Z"))), "adopt_account");
    // A reset is a deliberate save, even though nothing is stored afterwards.
    assert.equal(compareEditorSettingsCopies(local(defaults, at("2026-03-01T00:00:00.000Z"), false), account(custom, at("2026-01-01T00:00:00.000Z"))), "local_newer");
    assert.equal(compareEditorSettingsCopies(local(defaults, at("2026-01-01T00:00:00.000Z")), account(custom, at("2026-02-01T00:00:00.000Z"))), "account_newer");
    assert.equal(compareEditorSettingsCopies(local(defaults, at("2026-02-01T00:00:00.000Z")), account(custom, at("2026-01-01T00:00:00.000Z"))), "local_newer");
    assert.equal(compareEditorSettingsCopies(local(defaults, at("2026-02-01T00:00:00.000Z")), account(custom, null)), "local_newer");
    // Saved by an older version (no time recorded) and different: let the user choose.
    assert.equal(compareEditorSettingsCopies(local(defaults, null, true), account(custom, at("2026-01-01T00:00:00.000Z"))), "conflict");
});
