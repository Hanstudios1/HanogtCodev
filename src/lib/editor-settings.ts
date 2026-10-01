/**
 * Code editor preferences: typed defaults, validation (including settings
 * saved by older versions), a React hook that stays in sync across components
 * and browser tabs, Monaco option mapping and JSON export/import.
 *
 * Settings live in localStorage under "hanogt_editor_settings" (the key the
 * account page exports and resets), so they are per device and never sent to
 * the server.
 */
import { useSyncExternalStore } from "react";
import type { editor } from "monaco-editor";

export const EDITOR_SETTINGS_KEY = "hanogt_editor_settings";
export const EDITOR_SETTINGS_VERSION = 2;

type Text = { TR: string; EN: string };

export type EditorThemeId =
    | "auto" | "vs" | "vs-dark" | "hc-black" | "hc-light"
    | "hanogt-night" | "hanogt-dracula" | "hanogt-monokai" | "hanogt-nord" | "hanogt-solarized-light" | "hanogt-github-light";

export interface EditorThemeInfo {
    id: EditorThemeId;
    label: Text;
    /** null: follows the site theme. */
    dark: boolean | null;
    /** Background, foreground and two accent colours for the picker preview. */
    swatch: [string, string, string, string];
}

export const EDITOR_THEMES: readonly EditorThemeInfo[] = [
    { id: "auto", label: { TR: "Site temasını izle", EN: "Follow site theme" }, dark: null, swatch: ["#FFFFFF", "#1E1E1E", "#0000FF", "#569CD6"] },
    { id: "vs", label: { TR: "Açık (VS)", EN: "Light (VS)" }, dark: false, swatch: ["#FFFFFF", "#000000", "#0000FF", "#A31515"] },
    { id: "vs-dark", label: { TR: "Koyu (VS)", EN: "Dark (VS)" }, dark: true, swatch: ["#1E1E1E", "#D4D4D4", "#569CD6", "#CE9178"] },
    { id: "hc-black", label: { TR: "Yüksek kontrast koyu", EN: "High contrast dark" }, dark: true, swatch: ["#000000", "#FFFFFF", "#569CD6", "#CE9178"] },
    { id: "hc-light", label: { TR: "Yüksek kontrast açık", EN: "High contrast light" }, dark: false, swatch: ["#FFFFFF", "#292929", "#0F4A85", "#264F78"] },
    { id: "hanogt-night", label: { TR: "Hanogt Gece", EN: "Hanogt Night" }, dark: true, swatch: ["#0E0E16", "#E4E4E7", "#C084FC", "#6EE7B7"] },
    { id: "hanogt-dracula", label: { TR: "Dracula benzeri", EN: "Dracula-like" }, dark: true, swatch: ["#282A36", "#F8F8F2", "#FF79C6", "#F1FA8C"] },
    { id: "hanogt-monokai", label: { TR: "Monokai benzeri", EN: "Monokai-like" }, dark: true, swatch: ["#272822", "#F8F8F2", "#F92672", "#A6E22E"] },
    { id: "hanogt-nord", label: { TR: "Nord benzeri", EN: "Nord-like" }, dark: true, swatch: ["#2E3440", "#D8DEE9", "#81A1C1", "#A3BE8C"] },
    { id: "hanogt-solarized-light", label: { TR: "Solarized Açık benzeri", EN: "Solarized Light-like" }, dark: false, swatch: ["#FDF6E3", "#657B83", "#859900", "#2AA198"] },
    { id: "hanogt-github-light", label: { TR: "GitHub Açık benzeri", EN: "GitHub Light-like" }, dark: false, swatch: ["#FFFFFF", "#1F2328", "#CF222E", "#0A3069"] },
];

export type EditorFontId = "jetbrains-mono" | "fira-code" | "cascadia-code" | "source-code-pro" | "sf-mono" | "consolas" | "ubuntu-mono" | "courier-new" | "system";

const FALLBACK_STACK = "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Code', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export const EDITOR_FONTS: ReadonlyArray<{ id: EditorFontId; label: string; stack: string; bundled?: boolean }> = [
    { id: "jetbrains-mono", label: "JetBrains Mono", stack: FALLBACK_STACK, bundled: true },
    { id: "fira-code", label: "Fira Code", stack: `'Fira Code', 'Fira Mono', ${FALLBACK_STACK}` },
    { id: "cascadia-code", label: "Cascadia Code", stack: `'Cascadia Code', 'Cascadia Mono', ${FALLBACK_STACK}` },
    { id: "source-code-pro", label: "Source Code Pro", stack: `'Source Code Pro', ${FALLBACK_STACK}` },
    { id: "sf-mono", label: "SF Mono / Menlo", stack: `'SF Mono', SFMono-Regular, Menlo, Monaco, ${FALLBACK_STACK}` },
    { id: "consolas", label: "Consolas", stack: `Consolas, 'Lucida Console', ${FALLBACK_STACK}` },
    { id: "ubuntu-mono", label: "Ubuntu Mono", stack: `'Ubuntu Mono', 'DejaVu Sans Mono', ${FALLBACK_STACK}` },
    { id: "courier-new", label: "Courier New", stack: "'Courier New', Courier, monospace" },
    { id: "system", label: "ui-monospace", stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace" },
];

export type AutoClosing = "always" | "languageDefined" | "beforeWhitespace" | "never";

export interface EditorSettings {
    version: typeof EDITOR_SETTINGS_VERSION;
    theme: EditorThemeId;
    fontFamily: EditorFontId;
    fontSize: number;
    /** Multiplier of the font size. */
    lineHeight: number;
    fontLigatures: boolean;
    tabSize: number;
    insertSpaces: boolean;
    detectIndentation: boolean;
    wordWrap: "off" | "on" | "bounded";
    wordWrapColumn: number;
    minimap: boolean;
    lineNumbers: "on" | "off" | "relative";
    renderWhitespace: "none" | "boundary" | "selection" | "trailing" | "all";
    bracketPairColorization: boolean;
    bracketPairGuides: boolean;
    indentGuides: boolean;
    highlightActiveLine: boolean;
    stickyScroll: boolean;
    folding: boolean;
    /** Vertical ruler column; 0 hides it. */
    ruler: number;
    smoothScrolling: boolean;
    mouseWheelZoom: boolean;
    scrollBeyondLastLine: boolean;
    cursorStyle: "line" | "line-thin" | "block" | "block-outline" | "underline" | "underline-thin";
    cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid";
    cursorSmoothCaretAnimation: boolean;
    autoClosingBrackets: AutoClosing;
    autoClosingQuotes: AutoClosing;
    autoIndent: "none" | "keep" | "brackets" | "advanced" | "full";
    formatOnPaste: boolean;
    formatOnType: boolean;
    linkedEditing: boolean;
    quickSuggestions: boolean;
    suggestOnTriggerCharacters: boolean;
    snippetSuggestions: boolean;
    parameterHints: boolean;
    hover: boolean;
    autoSave: "off" | "afterDelay" | "onFocusChange";
    /** Milliseconds of inactivity before an automatic save. */
    autoSaveDelay: number;
    insertFinalNewline: boolean;
    trimTrailingWhitespace: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = Object.freeze({
    version: EDITOR_SETTINGS_VERSION,
    theme: "auto",
    fontFamily: "jetbrains-mono",
    fontSize: 14,
    lineHeight: 1.6,
    fontLigatures: true,
    tabSize: 4,
    insertSpaces: true,
    detectIndentation: false,
    wordWrap: "on",
    wordWrapColumn: 100,
    minimap: true,
    lineNumbers: "on",
    renderWhitespace: "selection",
    bracketPairColorization: true,
    bracketPairGuides: true,
    indentGuides: true,
    highlightActiveLine: true,
    stickyScroll: true,
    folding: true,
    ruler: 0,
    smoothScrolling: true,
    mouseWheelZoom: true,
    scrollBeyondLastLine: false,
    cursorStyle: "line",
    cursorBlinking: "blink",
    cursorSmoothCaretAnimation: false,
    autoClosingBrackets: "languageDefined",
    autoClosingQuotes: "languageDefined",
    autoIndent: "advanced",
    formatOnPaste: false,
    formatOnType: false,
    linkedEditing: true,
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    snippetSuggestions: true,
    parameterHints: true,
    hover: true,
    autoSave: "off",
    autoSaveDelay: 2000,
    insertFinalNewline: false,
    trimTrailingWhitespace: false,
}) as EditorSettings;

export const SETTING_LIMITS = {
    fontSize: { min: 10, max: 32 },
    lineHeight: { min: 1, max: 2.6 },
    tabSize: { min: 1, max: 8 },
    wordWrapColumn: { min: 40, max: 200 },
    ruler: { min: 0, max: 200 },
    autoSaveDelay: { min: 500, max: 60_000 },
} as const;

// ------------------------------------------------------------------ validation
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
    typeof value === "string" && (options as readonly string[]).includes(value) ? value as T : fallback;

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

const clamp = (value: unknown, limits: { min: number; max: number }, fallback: number, step = 1) => {
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    if (!Number.isFinite(number)) return fallback;
    const rounded = Math.round(number / step) * step;
    return Math.min(limits.max, Math.max(limits.min, Number(rounded.toFixed(2))));
};

const THEME_IDS = EDITOR_THEMES.map((theme) => theme.id);
const FONT_IDS = EDITOR_FONTS.map((font) => font.id);
const AUTO_CLOSING: readonly AutoClosing[] = ["always", "languageDefined", "beforeWhitespace", "never"];

/** Old (version 1) values: display-name fonts, light/dark/system themes and booleans. */
const LEGACY_FONTS: Record<string, EditorFontId> = {
    "jetbrains mono": "jetbrains-mono", "fira code": "fira-code", "cascadia code": "cascadia-code",
    "source code pro": "source-code-pro", consolas: "consolas", monaco: "sf-mono", menlo: "sf-mono", "courier new": "courier-new",
};

/** Turns anything (stored JSON, an imported file) into complete, valid settings. */
export function sanitizeEditorSettings(input: unknown): EditorSettings {
    const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const d = DEFAULT_EDITOR_SETTINGS;
    const legacyTheme = raw.theme === "light" ? "vs" : raw.theme === "dark" ? "vs-dark" : raw.theme === "system" ? "auto" : raw.theme;
    const legacyFont = typeof raw.fontFamily === "string" ? LEGACY_FONTS[raw.fontFamily.trim().toLowerCase()] ?? raw.fontFamily : raw.fontFamily;
    const legacyClosing = (value: unknown, fallback: AutoClosing) => (typeof value === "boolean" ? (value ? "languageDefined" : "never") : oneOf(value, AUTO_CLOSING, fallback));
    const wordWrap = typeof raw.wordWrap === "boolean" ? (raw.wordWrap ? "on" : "off") : oneOf(raw.wordWrap, ["off", "on", "bounded"] as const, d.wordWrap);
    const lineNumbers = typeof raw.lineNumbers === "boolean" ? (raw.lineNumbers ? "on" : "off") : oneOf(raw.lineNumbers, ["on", "off", "relative"] as const, d.lineNumbers);
    const autoSave = typeof raw.autoSave === "boolean" ? (raw.autoSave ? "afterDelay" : "off") : oneOf(raw.autoSave, ["off", "afterDelay", "onFocusChange"] as const, d.autoSave);
    const legacySuggest = typeof raw.autocomplete === "boolean" ? raw.autocomplete : undefined;
    return {
        version: EDITOR_SETTINGS_VERSION,
        theme: oneOf(legacyTheme, THEME_IDS, d.theme),
        fontFamily: oneOf(legacyFont, FONT_IDS, d.fontFamily),
        fontSize: clamp(raw.fontSize, SETTING_LIMITS.fontSize, d.fontSize),
        lineHeight: clamp(raw.lineHeight, SETTING_LIMITS.lineHeight, d.lineHeight, 0.1),
        fontLigatures: bool(raw.fontLigatures, d.fontLigatures),
        tabSize: clamp(raw.tabSize, SETTING_LIMITS.tabSize, d.tabSize),
        insertSpaces: bool(raw.insertSpaces, d.insertSpaces),
        detectIndentation: bool(raw.detectIndentation, d.detectIndentation),
        wordWrap,
        wordWrapColumn: clamp(raw.wordWrapColumn, SETTING_LIMITS.wordWrapColumn, d.wordWrapColumn),
        minimap: bool(raw.minimap, d.minimap),
        lineNumbers,
        renderWhitespace: oneOf(raw.renderWhitespace, ["none", "boundary", "selection", "trailing", "all"] as const, d.renderWhitespace),
        bracketPairColorization: bool(raw.bracketPairColorization, d.bracketPairColorization),
        bracketPairGuides: bool(raw.bracketPairGuides, typeof raw.bracketPairColorization === "boolean" ? raw.bracketPairColorization : d.bracketPairGuides),
        indentGuides: bool(raw.indentGuides, bool(raw.renderIndentGuides, d.indentGuides)),
        highlightActiveLine: bool(raw.highlightActiveLine, d.highlightActiveLine),
        stickyScroll: bool(raw.stickyScroll, d.stickyScroll),
        folding: bool(raw.folding, d.folding),
        ruler: clamp(raw.ruler, SETTING_LIMITS.ruler, d.ruler),
        smoothScrolling: bool(raw.smoothScrolling, d.smoothScrolling),
        mouseWheelZoom: bool(raw.mouseWheelZoom, d.mouseWheelZoom),
        scrollBeyondLastLine: bool(raw.scrollBeyondLastLine, d.scrollBeyondLastLine),
        cursorStyle: oneOf(raw.cursorStyle, ["line", "line-thin", "block", "block-outline", "underline", "underline-thin"] as const, d.cursorStyle),
        cursorBlinking: oneOf(raw.cursorBlinking, ["blink", "smooth", "phase", "expand", "solid"] as const, d.cursorBlinking),
        cursorSmoothCaretAnimation: bool(raw.cursorSmoothCaretAnimation, d.cursorSmoothCaretAnimation),
        autoClosingBrackets: legacyClosing(raw.autoClosingBrackets ?? raw.autoCloseBrackets, d.autoClosingBrackets),
        autoClosingQuotes: legacyClosing(raw.autoClosingQuotes ?? raw.autoCloseQuotes, d.autoClosingQuotes),
        autoIndent: oneOf(raw.autoIndent, ["none", "keep", "brackets", "advanced", "full"] as const, d.autoIndent),
        formatOnPaste: bool(raw.formatOnPaste, d.formatOnPaste),
        formatOnType: bool(raw.formatOnType, d.formatOnType),
        linkedEditing: bool(raw.linkedEditing, d.linkedEditing),
        quickSuggestions: bool(raw.quickSuggestions, legacySuggest ?? d.quickSuggestions),
        suggestOnTriggerCharacters: bool(raw.suggestOnTriggerCharacters, legacySuggest ?? d.suggestOnTriggerCharacters),
        snippetSuggestions: bool(raw.snippetSuggestions, d.snippetSuggestions),
        parameterHints: bool(raw.parameterHints, d.parameterHints),
        hover: bool(raw.hover, bool(raw.hoverInfo, d.hover)),
        autoSave,
        autoSaveDelay: clamp(raw.autoSaveDelay, SETTING_LIMITS.autoSaveDelay, d.autoSaveDelay, 100),
        insertFinalNewline: bool(raw.insertFinalNewline, d.insertFinalNewline),
        trimTrailingWhitespace: bool(raw.trimTrailingWhitespace, d.trimTrailingWhitespace),
    };
}

// ------------------------------------------------------------------ store
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSettings: EditorSettings = DEFAULT_EDITOR_SETTINGS;
/** Used when storage is blocked (private mode, sandboxed frames). */
let memorySettings: EditorSettings | null = null;

function readRaw(): string | null | undefined {
    try {
        return window.localStorage.getItem(EDITOR_SETTINGS_KEY);
    } catch {
        return undefined;
    }
}

/** The current settings (a stable object until something changes). */
export function readEditorSettings(): EditorSettings {
    if (typeof window === "undefined") return DEFAULT_EDITOR_SETTINGS;
    const raw = readRaw();
    if (raw === undefined) return memorySettings ?? DEFAULT_EDITOR_SETTINGS;
    if (raw === cachedRaw) return cachedSettings;
    cachedRaw = raw;
    if (!raw) {
        cachedSettings = memorySettings ?? DEFAULT_EDITOR_SETTINGS;
        return cachedSettings;
    }
    try {
        cachedSettings = sanitizeEditorSettings(JSON.parse(raw));
    } catch {
        cachedSettings = DEFAULT_EDITOR_SETTINGS;
    }
    return cachedSettings;
}

function notify() {
    listeners.forEach((listener) => listener());
}

/** Saves complete settings (validated) and updates every editor on the page. */
export function saveEditorSettings(next: EditorSettings) {
    const settings = sanitizeEditorSettings(next);
    memorySettings = settings;
    try {
        window.localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Storage is unavailable; the in-memory copy applies for this page view.
    }
    notify();
}

export function updateEditorSettings(patch: Partial<EditorSettings>) {
    saveEditorSettings({ ...readEditorSettings(), ...patch });
}

export function resetEditorSettings() {
    memorySettings = null;
    try {
        window.localStorage.removeItem(EDITOR_SETTINGS_KEY);
    } catch {
        // Nothing stored.
    }
    notify();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === EDITOR_SETTINGS_KEY || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

/** Editor preferences, kept in sync across components and browser tabs. */
export function useEditorSettings(): EditorSettings {
    return useSyncExternalStore(subscribe, readEditorSettings, () => DEFAULT_EDITOR_SETTINGS);
}

// ------------------------------------------------------------------ Monaco
export function fontStack(id: EditorFontId): string {
    return EDITOR_FONTS.find((font) => font.id === id)?.stack ?? FALLBACK_STACK;
}

export function isDarkTheme(theme: EditorThemeId, siteTheme: "light" | "dark"): boolean {
    const info = EDITOR_THEMES.find((entry) => entry.id === theme);
    return info?.dark ?? siteTheme === "dark";
}

/**
 * The Monaco theme to apply. `forced` comes from pages that need a light or
 * dark editor (e.g. the game engine): the user's theme is kept when it already
 * matches, otherwise the default theme of that brightness is used.
 */
export function resolveEditorTheme(theme: EditorThemeId, siteTheme: "light" | "dark", forced?: "light" | "dark"): string {
    const target = forced ?? siteTheme;
    if (theme === "auto") return target === "dark" ? "vs-dark" : "vs";
    if (forced && isDarkTheme(theme, siteTheme) !== (forced === "dark")) return forced === "dark" ? "vs-dark" : "vs";
    return theme;
}

/** Monaco construction/update options for the given settings. */
export function toMonacoOptions(settings: EditorSettings): editor.IStandaloneEditorConstructionOptions {
    return {
        fontFamily: fontStack(settings.fontFamily),
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        fontLigatures: settings.fontLigatures,
        tabSize: settings.tabSize,
        insertSpaces: settings.insertSpaces,
        detectIndentation: settings.detectIndentation,
        wordWrap: settings.wordWrap,
        wordWrapColumn: settings.wordWrapColumn,
        minimap: { enabled: settings.minimap },
        lineNumbers: settings.lineNumbers,
        renderWhitespace: settings.renderWhitespace,
        bracketPairColorization: { enabled: settings.bracketPairColorization },
        guides: { indentation: settings.indentGuides, bracketPairs: settings.bracketPairGuides, highlightActiveIndentation: settings.indentGuides },
        renderLineHighlight: settings.highlightActiveLine ? "all" : "none",
        stickyScroll: { enabled: settings.stickyScroll },
        folding: settings.folding,
        rulers: settings.ruler > 0 ? [settings.ruler] : [],
        smoothScrolling: settings.smoothScrolling,
        mouseWheelZoom: settings.mouseWheelZoom,
        scrollBeyondLastLine: settings.scrollBeyondLastLine,
        cursorStyle: settings.cursorStyle,
        cursorBlinking: settings.cursorBlinking,
        cursorSmoothCaretAnimation: settings.cursorSmoothCaretAnimation ? "on" : "off",
        autoClosingBrackets: settings.autoClosingBrackets,
        autoClosingQuotes: settings.autoClosingQuotes,
        autoIndent: settings.autoIndent,
        formatOnPaste: settings.formatOnPaste,
        formatOnType: settings.formatOnType,
        linkedEditing: settings.linkedEditing,
        quickSuggestions: settings.quickSuggestions ? { other: true, comments: false, strings: false } : false,
        suggestOnTriggerCharacters: settings.suggestOnTriggerCharacters,
        snippetSuggestions: settings.snippetSuggestions ? "inline" : "none",
        parameterHints: { enabled: settings.parameterHints },
        hover: { enabled: settings.hover ? "on" : "off" },
    };
}

// ------------------------------------------------------------------ export / import
export const SETTINGS_FILE_KIND = "hanogt-editor-settings";

export function serializeEditorSettings(settings: EditorSettings): string {
    return `${JSON.stringify({ kind: SETTINGS_FILE_KIND, version: EDITOR_SETTINGS_VERSION, exportedAt: new Date().toISOString(), settings: sanitizeEditorSettings(settings) }, null, 2)}\n`;
}

export type SettingsImportError = "too_large" | "invalid_json" | "invalid_format";

/** Accepts an exported settings file, a bare settings object or an account data export. */
export function parseEditorSettingsFile(text: string): { ok: true; settings: EditorSettings } | { ok: false; error: SettingsImportError } {
    if (text.length > 64_000) return { ok: false, error: "too_large" };
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return { ok: false, error: "invalid_json" };
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "invalid_format" };
    const record = data as Record<string, unknown>;
    const candidate = record.kind === SETTINGS_FILE_KIND ? record.settings : record.editorSettings ?? record;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { ok: false, error: "invalid_format" };
    const keys = Object.keys(candidate);
    const known = new Set(Object.keys(DEFAULT_EDITOR_SETTINGS).concat(["autoCloseBrackets", "autoCloseQuotes", "autocomplete", "hoverInfo", "renderIndentGuides"]));
    if (!keys.some((key) => known.has(key))) return { ok: false, error: "invalid_format" };
    return { ok: true, settings: sanitizeEditorSettings(candidate) };
}
