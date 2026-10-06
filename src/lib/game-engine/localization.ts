/**
 * Localization (V5): a game's languages and string table, the language it
 * starts in, and CSV import/export so translators can work in a spreadsheet.
 * Shared by the schema, the runtime and the editor.
 */
import type { LocalizationEntry, LocalizationSettings } from "./types";

export const LOCALIZATION_LIMITS = {
    languages: 16,
    entries: 2000,
    keyLength: 80,
    valueLength: 2000,
} as const;

/** "tr", "en", "pt-BR", "es-419", "zh-Hans". */
export const LANGUAGE_CODE = /^[a-z]{2,3}(?:-(?:[A-Z]{2}|\d{3}|[A-Z][a-z]{3}))?$/;

/** Languages the editor offers in its picker (any valid code can still be typed). */
export const COMMON_LANGUAGES = ["tr", "en", "de", "fr", "es", "it", "pt", "pt-BR", "ru", "uk", "pl", "nl", "az", "ar", "fa", "hi", "ja", "ko", "zh-Hans", "zh-Hant", "id", "vi", "th", "sv"] as const;

export function emptyLocalization(): LocalizationSettings {
    return { languages: [], startLanguage: "auto", entries: [] };
}

/** "PT_br" → "pt-BR", "zh-hans" → "zh-Hans"; null when it isn't a language code. */
export function normalizeLanguageCode(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const parts = value.trim().replace(/_/g, "-").split("-");
    if (parts.length > 2 || !parts[0]) return null;
    const base = parts[0].toLowerCase();
    const region = parts[1];
    const code = region === undefined
        ? base
        : `${base}-${region.length === 4 ? region[0].toUpperCase() + region.slice(1).toLowerCase() : region.toUpperCase()}`;
    return LANGUAGE_CODE.test(code) ? code : null;
}

/**
 * Whether the code names a language the browser knows ("not" or "xx" fit the
 * pattern but aren't languages). The editor and CSV import check this; stored
 * projects only need the pattern.
 */
export function isKnownLanguage(code: string): boolean {
    if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") return true;
    try {
        return new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(code) !== undefined;
    } catch {
        return false;
    }
}

/** A string table key as stored: trimmed, single line, without control characters. */
export function cleanLocalizationKey(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, LOCALIZATION_LIMITS.keyLength);
}

/**
 * The game language closest to a player's locale ("en-US", "pt_BR", "zh-Hant-TW"):
 * the same code, then the same base language.
 */
export function matchLanguage(languages: readonly string[], locale: string | null | undefined): string | null {
    if (!locale) return null;
    const parts = locale.trim().replace(/_/g, "-").toLowerCase().split("-").filter(Boolean);
    if (!parts.length) return null;
    const base = parts[0];
    for (let length = Math.min(parts.length, 2); length >= 1; length -= 1) {
        const wanted = parts.slice(0, length).join("-");
        const exact = languages.find((code) => code.toLowerCase() === wanted);
        if (exact) return exact;
    }
    return languages.find((code) => code.toLowerCase().split("-")[0] === base) ?? null;
}

/** The language a game starts in: its fixed start language, else the player's, else its first. */
export function startLanguageOf(settings: LocalizationSettings, locale: string | null | undefined): string | null {
    const languages = settings.languages;
    if (!languages.length) return null;
    if (settings.startLanguage !== "auto" && languages.includes(settings.startLanguage)) return settings.startLanguage;
    return matchLanguage(languages, locale) ?? languages[0];
}

/** A language's own name ("Türkçe", "English", "Deutsch"), or the code where the browser can't name it. */
export function languageName(code: string, displayLanguage: string = code): string {
    try {
        const name = new Intl.DisplayNames([displayLanguage], { type: "language" }).of(code);
        if (name && name !== code) return name.charAt(0).toLocaleUpperCase(displayLanguage) + name.slice(1);
    } catch {
        // Older engines or an odd code: the code itself is still readable.
    }
    return code;
}

/** Fast lookups over a string table (exact key first, then ignoring case). */
export class LocalizationTable {
    readonly languages: readonly string[];
    private readonly exact = new Map<string, LocalizationEntry>();
    private readonly folded = new Map<string, LocalizationEntry>();

    constructor(settings: LocalizationSettings) {
        this.languages = settings.languages;
        for (const entry of settings.entries) {
            if (!this.exact.has(entry.key)) this.exact.set(entry.key, entry);
            const lower = entry.key.toLowerCase();
            if (!this.folded.has(lower)) this.folded.set(lower, entry);
        }
    }

    get size() {
        return this.exact.size;
    }

    entry(key: string): LocalizationEntry | null {
        return this.exact.get(key) ?? this.folded.get(key.toLowerCase()) ?? null;
    }

    /** A language of the game by code, ignoring case ("EN" → "en"). */
    language(code: string): string | null {
        const lower = code.trim().replace(/_/g, "-").toLowerCase();
        return this.languages.find((language) => language.toLowerCase() === lower) ?? null;
    }

    /**
     * The key's text in a language: that language, then the first one, then
     * any; the key itself while no language has a text yet. null when the
     * table has no such key.
     */
    text(key: string, language: string | null): string | null {
        const entry = this.entry(key);
        if (!entry) return null;
        const values = entry.values;
        if (language && values[language]) return values[language];
        const first = this.languages[0];
        if (first && values[first]) return values[first];
        for (const code of this.languages) if (values[code]) return values[code];
        return entry.key;
    }

    /** How many keys have no text in the language. */
    missing(language: string): number {
        let count = 0;
        for (const entry of this.exact.values()) if (!entry.values[language]) count += 1;
        return count;
    }
}

// ---------------------------------------------------------------------------
// CSV (a "key" column, then one column per language)
// ---------------------------------------------------------------------------

/** Cells a spreadsheet would run as a formula; a leading apostrophe keeps them text. */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string): string {
    const safe = FORMULA_START.test(value) ? `'${value}` : value;
    return /[",;\t\r\n]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The table as CSV (RFC 4180). Spreadsheets open it with one column per language. */
export function localizationToCsv(settings: LocalizationSettings): string {
    const rows = [["key", ...settings.languages], ...settings.entries.map((entry) => [entry.key, ...settings.languages.map((code) => entry.values[code] ?? "")])];
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Splits CSV text into rows of cells; quoted cells may hold separators, quotes ("") and line breaks. */
export function parseCsv(input: string, separator?: string): string[][] {
    const textValue = input.replace(/^﻿/, "");
    const firstLine = textValue.split(/\r?\n/, 1)[0] ?? "";
    const delimiter = separator ?? ([",", ";", "\t"] as const)
        .map((candidate) => ({ candidate, count: firstLine.split(candidate).length - 1 }))
        .sort((a, b) => b.count - a.count)[0].candidate;
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    let index = 0;
    while (index < textValue.length) {
        const char = textValue[index];
        if (quoted) {
            if (char === '"') {
                if (textValue[index + 1] === '"') {
                    cell += '"';
                    index += 2;
                    continue;
                }
                quoted = false;
            } else cell += char;
            index += 1;
            continue;
        }
        if (char === '"' && cell === "") quoted = true;
        else if (char === delimiter) {
            row.push(cell);
            cell = "";
        } else if (char === "\n" || char === "\r") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            if (char === "\r" && textValue[index + 1] === "\n") index += 1;
        } else cell += char;
        index += 1;
    }
    if (cell !== "" || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

export interface LocalizationImport {
    languages: string[];
    entries: LocalizationEntry[];
    /** Rows without a usable key or repeating one. */
    skipped: number;
    /** Header columns that aren't language codes. */
    ignoredColumns: string[];
}

/** A cell as written: the apostrophe csvCell put before a formula-like text comes off again. */
function cellText(raw: string | undefined): string {
    const value = raw ?? "";
    return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

/** Reads a CSV with a key column and language columns (as localizationToCsv writes it). */
export function localizationFromCsv(input: string): LocalizationImport {
    const rows = parseCsv(input);
    const header = rows[0] ?? [];
    // The first column of each language code counts; other columns are reported.
    const columnOf = new Map<string, number>();
    const ignoredColumns: string[] = [];
    header.forEach((cell, index) => {
        if (index === 0) return;
        const code = normalizeLanguageCode(cell);
        if (code && isKnownLanguage(code) && !columnOf.has(code) && columnOf.size < LOCALIZATION_LIMITS.languages) columnOf.set(code, index);
        else if (cell.trim()) ignoredColumns.push(cell.trim());
    });
    const languages = [...columnOf.keys()];
    const entries: LocalizationEntry[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (const cells of rows.slice(1)) {
        const key = cleanLocalizationKey(cellText(cells[0]));
        if (!key || seen.has(key) || entries.length >= LOCALIZATION_LIMITS.entries) {
            skipped += 1;
            continue;
        }
        seen.add(key);
        const values: Record<string, string> = {};
        for (const [code, index] of columnOf) {
            const value = cellText(cells[index]).slice(0, LOCALIZATION_LIMITS.valueLength);
            if (value) values[code] = value;
        }
        entries.push({ key, values });
    }
    return { languages, entries, skipped, ignoredColumns };
}

/** Adds imported languages and rows: existing keys take the imported texts, new keys go to the end. */
export function mergeLocalization(current: LocalizationSettings, imported: Pick<LocalizationImport, "languages" | "entries">): LocalizationSettings {
    const languages = [...current.languages];
    for (const code of imported.languages) if (!languages.includes(code) && languages.length < LOCALIZATION_LIMITS.languages) languages.push(code);
    const entries = current.entries.map((entry) => ({ key: entry.key, values: { ...entry.values } }));
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    for (const row of imported.entries) {
        const values = Object.fromEntries(Object.entries(row.values).filter(([code, value]) => languages.includes(code) && value));
        const existing = byKey.get(row.key);
        if (existing) Object.assign(existing.values, values);
        else if (entries.length < LOCALIZATION_LIMITS.entries) {
            const entry = { key: row.key, values };
            entries.push(entry);
            byKey.set(entry.key, entry);
        }
    }
    return { ...current, languages, entries };
}
