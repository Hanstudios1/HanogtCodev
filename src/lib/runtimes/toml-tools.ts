/**
 * TOML 1.0 validation and formatting on top of smol-toml.
 *
 * Errors carry smol-toml's reason with a line and column (translated to
 * Turkish when asked); big integers are kept exactly. The formatter re-emits
 * the data with tables in canonical order (comments are not preserved).
 */
import { parse, stringify, TomlError } from "smol-toml";
import { count, localeOf, type ValidationResult, type ValidatorLocale, type ValidatorOptions } from "./validation";

const TURKISH_REASONS: Record<string, string> = {
    "invalid value": "geçersiz değer; metinleri tırnak içine alın (örneğin ad = \"Hanogt\")",
    "trying to redefine an already defined table or value": "zaten tanımlanmış bir tablo veya değer yeniden tanımlanıyor",
    "trying to redefine an already defined value": "zaten tanımlanmış bir değer yeniden tanımlanıyor",
    "control characters are not allowed in strings": "metinlerde denetim karakteri olamaz (kapatılmamış bir tırnak olabilir)",
    "control characters are not allowed in comments": "yorumlarda denetim karakteri olamaz",
    "each key-value declaration must be followed by an end-of-line": "her anahtar-değer bildiriminden sonra satır sonu gelmelidir",
    "expected comma or end of structure": "virgül veya yapının sonu bekleniyordu",
    "expected end of table array declaration": "tablo dizisi bildiriminin sonu (]]) bekleniyordu",
    "illegal character in key": "anahtarda geçersiz karakter",
    "illegal empty bare key": "tırnaksız anahtar boş olamaz",
    "illegal leading zero": "sayılar başında sıfırla yazılamaz",
    "illegal underscore": "alt çizgi yalnızca iki rakam arasında kullanılabilir",
    "incomplete key-value: cannot find end of key": "eksik anahtar-değer: anahtarın sonu ('=') bulunamadı",
    "invalid date": "geçersiz tarih",
    "invalid date-time: date part is malformed": "geçersiz tarih-saat: tarih kısmı hatalı",
    "invalid date-time: time part is malformed": "geçersiz tarih-saat: saat kısmı hatalı",
    "invalid escape: only line-ending whitespace may be escaped": "geçersiz kaçış: yalnızca satır sonundaki boşluk kaçışlanabilir",
    "invalid non-hex character in unicode escape": "unicode kaçışında onaltılık olmayan karakter",
    "invalid unicode escape": "geçersiz unicode kaçışı",
    "unexpected end of key": "anahtar beklenmedik şekilde bitti",
    "unfinished array": "dizi kapatılmamış; ']' ekleyin",
    "unfinished numeric value": "sayı yarım kalmış",
    "unfinished string": "metin kapatılmamış; kapanış tırnağını ekleyin",
    "unfinished table": "tablo başlığı kapatılmamış; ']' ekleyin",
    "unrecognised escape sequence": "tanınmayan kaçış dizisi",
    "document contains excessively nested structures. aborting.": "belge çok derin iç içe yapılar içeriyor",
};

function reasonOf(error: TomlError) {
    return /^Invalid TOML document: ([^\n]*)/.exec(error.message)?.[1] ?? error.message.split("\n")[0];
}

/** smol-toml's wording for the two most common beginner mistakes is terse; add a hint. */
const ENGLISH_HINTS: Record<string, string> = {
    "invalid value": "invalid value; put text in quotes (for example name = \"Hanogt\")",
    "control characters are not allowed in strings": "control characters are not allowed in strings (is a closing quote missing?)",
};

function translate(reason: string, locale: ValidatorLocale) {
    return locale === "tr" ? TURKISH_REASONS[reason] ?? reason : ENGLISH_HINTS[reason] ?? reason;
}

function measure(value: unknown, depth: number, stats: { tables: number; keys: number; arrays: number; maxDepth: number }) {
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    if (Array.isArray(value)) {
        stats.arrays += 1;
        for (const item of value) measure(item, depth + 1, stats);
        return;
    }
    if (!value || typeof value !== "object" || value instanceof Date) return;
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return;
    if (depth > 0) stats.tables += 1;
    for (const item of Object.values(value as Record<string, unknown>)) {
        stats.keys += 1;
        measure(item, depth + 1, stats);
    }
}

/** Validates a TOML document and re-emits it in canonical form. */
export function analyzeToml(text: string, options: ValidatorOptions = {}): ValidationResult {
    const locale = localeOf(options);
    let data: Record<string, unknown>;
    try {
        data = parse(text, { integersAsBigInt: "asNeeded" }) as Record<string, unknown>;
    } catch (error) {
        if (error instanceof TomlError) {
            return { ok: false, error: { message: translate(reasonOf(error), locale), line: error.line, column: error.column }, warnings: [] };
        }
        throw error;
    }
    const stats = { tables: 0, keys: 0, arrays: 0, maxDepth: 0 };
    measure(data, 0, stats);
    let formatted: string;
    try {
        formatted = stringify(data).replace(/^\n+/, "").replace(/\n+$/, "");
    } catch {
        formatted = text.trim();
    }
    const summary = locale === "tr"
        ? `✓ Geçerli TOML · ${stats.tables} tablo · ${stats.keys} anahtar · ${stats.arrays} dizi`
        : `✓ Valid TOML · ${count(locale, stats.tables, "tablo", "table")} · ${count(locale, stats.keys, "anahtar", "key")} · ${count(locale, stats.arrays, "dizi", "array")}`;
    const notes = /(^|\s)#/.test(text)
        ? [locale === "tr" ? "Not: biçimlendirilmiş çıktıda yorumlar korunmaz." : "Note: comments are not kept in the formatted output."]
        : undefined;
    return { ok: true, warnings: [], summary, formatted, notes };
}
