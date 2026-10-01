/**
 * Strict JSON validation and lossless pretty-printing (dependency-free).
 *
 * Unlike JSON.parse, errors carry a stable message plus line and column, and
 * formatting keeps every number and string exactly as written (no precision
 * loss for big integers, escapes stay as typed). Duplicate keys are reported
 * as warnings because most parsers silently keep the last value. Messages
 * are available in Turkish and English (`locale` option).
 */

export type JsonLocale = "tr" | "en";
type Message = { tr: string; en: string };

export interface JsonIssue {
    message: string;
    line: number;
    column: number;
    offset: number;
}

export type JsonKind = "object" | "array" | "string" | "number" | "boolean" | "null";

export interface JsonStats {
    topLevel: JsonKind;
    objects: number;
    arrays: number;
    keys: number;
    strings: number;
    numbers: number;
    booleans: number;
    nulls: number;
    maxDepth: number;
    bytes: number;
}

export interface JsonAnalysis {
    ok: boolean;
    error?: JsonIssue;
    warnings: JsonIssue[];
    formatted?: string;
    minified?: string;
    stats?: JsonStats;
}

type JsonNode =
    | { type: "object"; entries: Array<{ key: string; value: JsonNode }> }
    | { type: "array"; items: JsonNode[] }
    | { type: "scalar"; kind: "string" | "number" | "boolean" | "null"; raw: string };

const MAX_DEPTH = 512;

class JsonSyntaxError extends Error {
    readonly offset: number;
    constructor(message: string, offset: number) {
        super(message);
        this.offset = offset;
    }
}

/** 1-based line and column of an offset (columns count UTF-16 code units, like editors). */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
    let line = 1;
    let lineStart = 0;
    const end = Math.min(offset, text.length);
    for (let index = 0; index < end; index += 1) {
        if (text.charCodeAt(index) === 10) {
            line += 1;
            lineStart = index + 1;
        }
    }
    return { line, column: end - lineStart + 1 };
}

function describe(char: string | undefined, locale: JsonLocale) {
    const tr = locale === "tr";
    if (char === undefined) return tr ? "girdinin sonu" : "the end of the input";
    if (char === "\n") return tr ? "satır sonu" : "a line break";
    if (char === "\t") return tr ? "sekme" : "a tab";
    if (char === " ") return tr ? "boşluk" : "a space";
    return `'${char}'`;
}

const OBJECT_NOT_CLOSED: Message = { tr: "Girdi beklenmedik şekilde bitti; burada açılan nesne kapatılmamış.", en: "Unexpected end of the input; the object opened here is not closed." };
const ARRAY_NOT_CLOSED: Message = { tr: "Girdi beklenmedik şekilde bitti; burada açılan dizi kapatılmamış.", en: "Unexpected end of the input; the array opened here is not closed." };

class Parser {
    private index = 0;
    readonly text: string;
    readonly warnings: Array<{ message: string; offset: number }> = [];
    readonly stats = { objects: 0, arrays: 0, keys: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, maxDepth: 0 };
    readonly locale: JsonLocale;

    constructor(text: string, locale: JsonLocale) {
        this.text = text;
        this.locale = locale;
    }

    private say(message: Message) {
        return message[this.locale];
    }

    private fail(message: Message, offset: number) {
        return new JsonSyntaxError(message[this.locale], offset);
    }

    private describe(char: string | undefined) {
        return describe(char, this.locale);
    }

    parseDocument(): JsonNode {
        if (this.text.charCodeAt(0) === 0xfeff) {
            this.warnings.push({ message: this.say({ tr: "Dosya bir bayt sırası işaretiyle (BOM) başlıyor; JSON dosyaları BOM içermemeli.", en: "The file starts with a byte order mark (BOM); JSON should not contain one." }), offset: 0 });
            this.index = 1;
        }
        this.skipWhitespace();
        if (this.index >= this.text.length) throw this.fail({ tr: "Belge boş; bir JSON değeri bekleniyordu.", en: "The document is empty; expected a JSON value." }, this.index);
        const value = this.parseValue(1);
        this.skipWhitespace();
        if (this.index < this.text.length) {
            const found = this.describe(this.text[this.index]);
            throw this.fail({ tr: `JSON değeri bittikten sonra beklenmeyen ${found}; bir belge yalnızca tek bir değer içerir.`, en: `Unexpected ${found} after the end of the JSON value; a document holds a single value.` }, this.index);
        }
        return value;
    }

    private skipWhitespace() {
        for (;;) {
            const char = this.text[this.index];
            if (char === " " || char === "\t" || char === "\n" || char === "\r") {
                this.index += 1;
                continue;
            }
            if (char === "/" && (this.text[this.index + 1] === "/" || this.text[this.index + 1] === "*")) {
                throw this.fail({ tr: "JSON'da yorum satırlarına izin verilmez.", en: "Comments are not allowed in JSON." }, this.index);
            }
            return;
        }
    }

    private parseValue(depth: number): JsonNode {
        if (depth > MAX_DEPTH) throw this.fail({ tr: `İç içe yapı ${MAX_DEPTH} düzeyden derin.`, en: `Nesting is deeper than ${MAX_DEPTH} levels.` }, this.index);
        this.stats.maxDepth = Math.max(this.stats.maxDepth, depth);
        const char = this.text[this.index];
        if (char === "{") return this.parseObject(depth);
        if (char === "[") return this.parseArray(depth);
        if (char === "\"") {
            this.stats.strings += 1;
            return { type: "scalar", kind: "string", raw: this.parseString() };
        }
        if (char === "'") throw this.fail({ tr: "Metinler tek tırnak yerine çift tırnak (\") kullanmalıdır.", en: "Strings must use double quotes (\"), not single quotes." }, this.index);
        if (char === "-" || (char !== undefined && char >= "0" && char <= "9")) {
            this.stats.numbers += 1;
            return { type: "scalar", kind: "number", raw: this.parseNumber() };
        }
        for (const literal of ["true", "false", "null"] as const) {
            if (this.text.startsWith(literal, this.index)) {
                this.index += literal.length;
                if (literal === "null") this.stats.nulls += 1;
                else this.stats.booleans += 1;
                return { type: "scalar", kind: literal === "null" ? "null" : "boolean", raw: literal };
            }
        }
        const word = /^[A-Za-z_$][\w$]*/.exec(this.text.slice(this.index, this.index + 32))?.[0];
        if (word === "NaN" || word === "Infinity" || word === "undefined") {
            throw this.fail({ tr: `${word} geçerli bir JSON değeri değil; null veya bir sayı kullanın.`, en: `${word} is not a valid JSON value; use null or a number.` }, this.index);
        }
        if (word === "True" || word === "False" || word === "None" || word === "Null") {
            throw this.fail({ tr: `${word} geçerli JSON değil; sabitler küçük harfle yazılır: true, false ve null.`, en: `${word} is not valid JSON; literals are lower case: true, false and null.` }, this.index);
        }
        if (char === "+") throw this.fail({ tr: "Sayılar '+' ile başlayamaz.", en: "Numbers cannot start with '+'." }, this.index);
        if (char === ".") throw this.fail({ tr: "Ondalık noktadan önce bir rakam gerekir (.5 yerine 0.5 yazın).", en: "Numbers need a digit before the decimal point (write 0.5, not .5)." }, this.index);
        if (char === undefined) throw this.fail({ tr: "Girdi beklenmedik şekilde bitti; bir değer bekleniyordu.", en: "Unexpected end of the input; expected a value." }, this.index);
        const found = this.describe(char);
        throw this.fail({ tr: `Beklenmeyen ${found}; bir değer (nesne, dizi, metin, sayı, true, false veya null) bekleniyordu.`, en: `Unexpected ${found}; expected a value (object, array, string, number, true, false or null).` }, this.index);
    }

    private parseObject(depth: number): JsonNode {
        const start = this.index;
        this.index += 1;
        this.stats.objects += 1;
        const entries: Array<{ key: string; value: JsonNode }> = [];
        const seen = new Map<string, number>();
        this.skipWhitespace();
        if (this.text[this.index] === "}") {
            this.index += 1;
            return { type: "object", entries };
        }
        for (;;) {
            this.skipWhitespace();
            const char = this.text[this.index];
            if (char === "}") throw this.fail({ tr: "JSON nesnelerinde sondaki virgüle izin verilmez.", en: "Trailing commas are not allowed in JSON objects." }, this.index);
            if (char === undefined) throw this.fail(OBJECT_NOT_CLOSED, start);
            if (char === "'") throw this.fail({ tr: "Özellik adları tek tırnak yerine çift tırnak (\") kullanmalıdır.", en: "Property names must use double quotes (\"), not single quotes." }, this.index);
            if (char !== "\"") {
                const found = this.describe(char);
                throw this.fail({ tr: `Çift tırnak içinde bir özellik adı bekleniyordu, ancak ${found} bulundu.`, en: `Expected a property name in double quotes but found ${found}.` }, this.index);
            }
            const keyOffset = this.index;
            const key = this.parseString();
            const decoded = this.decodeKey(key);
            if (seen.has(decoded)) {
                this.warnings.push({ message: this.say({ tr: `${key} anahtarı birden fazla kez kullanılmış; çoğu ayrıştırıcı yalnızca son değeri tutar.`, en: `Duplicate key ${key}; most parsers keep only the last value.` }), offset: keyOffset });
            }
            seen.set(decoded, keyOffset);
            this.stats.keys += 1;
            this.skipWhitespace();
            if (this.text[this.index] !== ":") throw this.fail({ tr: `${key} özellik adından sonra ':' bekleniyordu.`, en: `Expected ':' after the property name ${key}.` }, this.index);
            this.index += 1;
            this.skipWhitespace();
            const value = this.parseValue(depth + 1);
            entries.push({ key, value });
            this.skipWhitespace();
            const next = this.text[this.index];
            if (next === ",") {
                this.index += 1;
                continue;
            }
            if (next === "}") {
                this.index += 1;
                return { type: "object", entries };
            }
            if (next === undefined) throw this.fail(OBJECT_NOT_CLOSED, start);
            if (next === "\"") throw this.fail({ tr: "Özellikler arasında ',' bekleniyordu.", en: "Expected ',' between properties." }, this.index);
            const found = this.describe(next);
            throw this.fail({ tr: `Bir özellik değerinden sonra ',' veya '}' bekleniyordu, ancak ${found} bulundu.`, en: `Expected ',' or '}' after a property value but found ${found}.` }, this.index);
        }
    }

    private parseArray(depth: number): JsonNode {
        const start = this.index;
        this.index += 1;
        this.stats.arrays += 1;
        const items: JsonNode[] = [];
        this.skipWhitespace();
        if (this.text[this.index] === "]") {
            this.index += 1;
            return { type: "array", items };
        }
        for (;;) {
            this.skipWhitespace();
            if (this.text[this.index] === "]") throw this.fail({ tr: "JSON dizilerinde sondaki virgüle izin verilmez.", en: "Trailing commas are not allowed in JSON arrays." }, this.index);
            if (this.text[this.index] === undefined) throw this.fail(ARRAY_NOT_CLOSED, start);
            items.push(this.parseValue(depth + 1));
            this.skipWhitespace();
            const next = this.text[this.index];
            if (next === ",") {
                this.index += 1;
                continue;
            }
            if (next === "]") {
                this.index += 1;
                return { type: "array", items };
            }
            if (next === undefined) throw this.fail(ARRAY_NOT_CLOSED, start);
            const found = this.describe(next);
            throw this.fail({ tr: `Bir dizi öğesinden sonra ',' veya ']' bekleniyordu, ancak ${found} bulundu.`, en: `Expected ',' or ']' after an array item but found ${found}.` }, this.index);
        }
    }

    /** Returns the raw string literal including its quotes. */
    private parseString(): string {
        const start = this.index;
        this.index += 1;
        for (;;) {
            const char = this.text[this.index];
            if (char === undefined) throw this.fail({ tr: "Metin kapatılmamış; kapanış çift tırnağını ekleyin.", en: "Unterminated string; add the closing double quote." }, start);
            if (char === "\"") {
                this.index += 1;
                return this.text.slice(start, this.index);
            }
            if (char === "\n" || char === "\r") throw this.fail({ tr: "Metinler satır sonu içeremez; bunun yerine \\n kullanın.", en: "Strings cannot contain line breaks; use \\n instead." }, this.index);
            if (char.charCodeAt(0) < 0x20) throw this.fail({ tr: "Metinler kontrol karakteri içeremez; kaçış dizisiyle yazın (örneğin \\t).", en: "Strings cannot contain control characters; escape them (for example \\t)." }, this.index);
            if (char === "\\") {
                const escape = this.text[this.index + 1];
                if (escape === "u") {
                    if (!/^[0-9a-fA-F]{4}$/.test(this.text.slice(this.index + 2, this.index + 6))) {
                        throw this.fail({ tr: "Geçersiz unicode kaçışı; \\u ardından dört onaltılık rakam gelmelidir.", en: "Invalid unicode escape; \\u must be followed by four hex digits." }, this.index);
                    }
                    this.index += 6;
                    continue;
                }
                if (escape === undefined || !"\"\\/bfnrt".includes(escape)) {
                    const sequence = escape ?? "";
                    throw this.fail({ tr: `Geçersiz kaçış dizisi \\${sequence}; izin verilenler: \\" \\\\ \\/ \\b \\f \\n \\r \\t ve \\uXXXX.`, en: `Invalid escape sequence \\${sequence}; allowed escapes are \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX.` }, this.index);
                }
                this.index += 2;
                continue;
            }
            this.index += 1;
        }
    }

    private decodeKey(raw: string): string {
        try {
            return JSON.parse(raw) as string;
        } catch {
            return raw;
        }
    }

    private parseNumber(): string {
        const start = this.index;
        const rest = this.text.slice(start, start + 400);
        const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
        if (!match) {
            if (/^-?\./.test(rest)) throw this.fail({ tr: "Ondalık noktadan önce bir rakam gerekir.", en: "Numbers need a digit before the decimal point." }, start);
            if (/^-(?:Infinity|NaN)/.test(rest)) throw this.fail({ tr: "Infinity ve NaN geçerli JSON sayıları değildir.", en: "Infinity and NaN are not valid JSON numbers." }, start);
            throw this.fail({ tr: "Geçersiz sayı.", en: "Invalid number." }, start);
        }
        const literal = match[0];
        const after = this.text[start + literal.length];
        if (/^-?0\d/.test(rest)) throw this.fail({ tr: "Sayılar başında sıfır ile yazılamaz.", en: "Numbers cannot have leading zeros." }, start);
        if (after === ".") throw this.fail({ tr: "Ondalık noktadan sonra rakam gelmelidir.", en: "A decimal point must be followed by digits." }, start + literal.length);
        if (after === "e" || after === "E") throw this.fail({ tr: "Üs kısmında rakam olmalıdır.", en: "An exponent must have digits." }, start + literal.length);
        if (after !== undefined && /[0-9A-Za-z_]/.test(after)) {
            const found = this.describe(after);
            throw this.fail({ tr: `Geçersiz sayı: beklenmeyen ${found}.`, en: `Invalid number: unexpected ${found}.` }, start + literal.length);
        }
        this.index += literal.length;
        return literal;
    }
}

function print(node: JsonNode, indent: string, level: number): string {
    if (node.type === "scalar") return node.raw;
    const inner = indent.repeat(level + 1);
    const outer = indent.repeat(level);
    if (node.type === "array") {
        if (!node.items.length) return "[]";
        return `[\n${node.items.map((item) => `${inner}${print(item, indent, level + 1)}`).join(",\n")}\n${outer}]`;
    }
    if (!node.entries.length) return "{}";
    return `{\n${node.entries.map((entry) => `${inner}${entry.key}: ${print(entry.value, indent, level + 1)}`).join(",\n")}\n${outer}}`;
}

function minify(node: JsonNode): string {
    if (node.type === "scalar") return node.raw;
    if (node.type === "array") return `[${node.items.map(minify).join(",")}]`;
    return `{${node.entries.map((entry) => `${entry.key}:${minify(entry.value)}`).join(",")}}`;
}

function kindOf(node: JsonNode): JsonKind {
    return node.type === "scalar" ? node.kind : node.type;
}

/** Validates and formats a JSON document. `indent` is a number of spaces or "\t"; messages default to English. */
export function analyzeJson(text: string, options: { indent?: number | "\t"; locale?: JsonLocale } = {}): JsonAnalysis {
    const indentOption = options.indent ?? 2;
    const indent = indentOption === "\t" ? "\t" : " ".repeat(Math.max(0, Math.min(8, indentOption)));
    const parser = new Parser(text, options.locale === "tr" ? "tr" : "en");
    const toIssue = (message: string, offset: number): JsonIssue => ({ message, offset, ...lineColumn(text, offset) });
    try {
        const root = parser.parseDocument();
        return {
            ok: true,
            warnings: parser.warnings.map((warning) => toIssue(warning.message, warning.offset)),
            formatted: print(root, indent, 0),
            minified: minify(root),
            stats: { topLevel: kindOf(root), ...parser.stats, bytes: new TextEncoder().encode(text).length },
        };
    } catch (error) {
        if (error instanceof JsonSyntaxError) {
            return { ok: false, error: toIssue(error.message, error.offset), warnings: parser.warnings.map((warning) => toIssue(warning.message, warning.offset)) };
        }
        throw error;
    }
}

/** The source line of an issue with a caret under the column, for console output. */
export function codeFrame(text: string, line: number, column: number): string {
    const lines = text.split("\n");
    const source = (lines[line - 1] ?? "").replace(/\r$/, "").replace(/\t/g, " ");
    const gutter = String(line).length;
    const clipped = source.length > 120 ? source.slice(Math.max(0, column - 60), Math.max(0, column - 60) + 120) : source;
    const caretColumn = source.length > 120 ? Math.min(column - Math.max(0, column - 60), clipped.length + 1) : column;
    return `${String(line).padStart(gutter)} | ${clipped}\n${" ".repeat(gutter)} | ${" ".repeat(Math.max(0, caretColumn - 1))}^`;
}
