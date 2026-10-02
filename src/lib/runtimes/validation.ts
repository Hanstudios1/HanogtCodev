/**
 * Shared shapes for Hanogt's browser validators (dependency-free).
 *
 * JSON has its own analyzer (json-tools.ts); YAML, TOML, XML, INI, .env,
 * .properties and CSV report through these types so the runtime worker can
 * print every result the same way: warnings with a location, then either a
 * summary plus the pretty-printed document or an error with a code frame.
 */
import { codeFrame, lineColumn } from "./json-tools";

export { codeFrame, lineColumn };

export type ValidatorLocale = "tr" | "en";
export type Bilingual = { tr: string; en: string };

export interface ValidationIssue {
    message: string;
    /** 1-based line. */
    line: number;
    /** 1-based column (UTF-16 code units, like the editor). */
    column: number;
}

export interface ValidationResult {
    ok: boolean;
    error?: ValidationIssue;
    warnings: ValidationIssue[];
    /** One line, e.g. "✓ Valid YAML · 2 documents". */
    summary?: string;
    /** The pretty-printed document (or a table for CSV). */
    formatted?: string;
    /** Extra remarks printed after the formatted output. */
    notes?: string[];
}

export interface ValidatorOptions {
    locale?: ValidatorLocale;
    /** Spaces per indentation level used by the formatter (1–8, default 2). */
    indent?: number;
}

/** Thrown by hand-written parsers; carries the offset of the problem. */
export class ValidationError extends Error {
    readonly offset: number;
    constructor(message: string, offset: number) {
        super(message);
        this.name = "ValidationError";
        this.offset = offset;
    }
}

export function localeOf(options: ValidatorOptions | undefined): ValidatorLocale {
    return options?.locale === "tr" ? "tr" : "en";
}

export function indentOf(options: ValidatorOptions | undefined): number {
    const value = options?.indent ?? 2;
    return Number.isFinite(value) ? Math.max(1, Math.min(8, Math.round(value))) : 2;
}

/** An issue at a character offset of `text`. */
export function issueAt(text: string, offset: number, message: string): ValidationIssue {
    return { message, ...lineColumn(text, offset) };
}

/** "1 key" / "2 keys" in English; Turkish nouns do not take a plural after numbers. */
export function count(locale: ValidatorLocale, value: number, tr: string, singular: string, plural = `${singular}s`): string {
    return locale === "tr" ? `${value} ${tr}` : `${value} ${value === 1 ? singular : plural}`;
}

/** A readable name for a character in messages ("'x'", "a tab", "the end of the input"). */
export function describeChar(char: string | undefined, locale: ValidatorLocale): string {
    const tr = locale === "tr";
    if (char === undefined || char === "") return tr ? "girdinin sonu" : "the end of the input";
    if (char === "\n") return tr ? "satır sonu" : "a line break";
    if (char === "\t") return tr ? "sekme" : "a tab";
    if (char === " ") return tr ? "boşluk" : "a space";
    return `'${char}'`;
}
