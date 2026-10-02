/**
 * Validators and formatters for small configuration and data formats
 * (dependency-free): INI, .env (dotenv), Java .properties and CSV/TSV.
 *
 * Each analyzer returns a {@link ValidationResult}: real syntax errors stop
 * with a location, while things most parsers accept but handle differently
 * (duplicate keys, spaces around "=" in .env files, ragged CSV rows…) are
 * reported as warnings. Messages are available in Turkish and English.
 */
import {
    ValidationError, count, issueAt, localeOf,
    type Bilingual, type ValidationIssue, type ValidationResult, type ValidatorLocale, type ValidatorOptions,
} from "./validation";

type Line = { text: string; offset: number };

/** Physical lines without their line terminators, with start offsets. */
function splitLines(text: string): Line[] {
    const lines: Line[] = [];
    let offset = 0;
    for (const part of text.split("\n")) {
        lines.push({ text: part.endsWith("\r") ? part.slice(0, -1) : part, offset });
        offset += part.length + 1;
    }
    if (lines.length > 1 && lines[lines.length - 1].text === "") lines.pop();
    return lines;
}

function makeReporter(text: string, locale: ValidatorLocale) {
    const warnings: ValidationIssue[] = [];
    return {
        warnings,
        warn(offset: number, message: Bilingual) {
            if (warnings.length < 200) warnings.push(issueAt(text, offset, message[locale]));
        },
        fail(offset: number, message: Bilingual) {
            return new ValidationError(message[locale], offset);
        },
    };
}

function finish(text: string, locale: ValidatorLocale, run: (reporter: ReturnType<typeof makeReporter>) => Omit<ValidationResult, "ok" | "warnings">): ValidationResult {
    const reporter = makeReporter(text, locale);
    try {
        return { ok: true, warnings: reporter.warnings, ...run(reporter) };
    } catch (error) {
        if (error instanceof ValidationError) return { ok: false, error: issueAt(text, error.offset, error.message), warnings: reporter.warnings };
        throw error;
    }
}

/** Joins lines, collapsing runs of blank lines and trimming blank lines at both ends. */
function joinLines(lines: string[]) {
    const output: string[] = [];
    for (const line of lines) {
        if (!line && (!output.length || !output[output.length - 1])) continue;
        output.push(line);
    }
    while (output.length && !output[output.length - 1]) output.pop();
    return output.join("\n");
}

// ------------------------------------------------------------------------ INI
/** INI files: [sections], key = value / key: value, ; and # comments. */
export function analyzeIni(text: string, options: ValidatorOptions = {}): ValidationResult {
    const locale = localeOf(options);
    return finish(text, locale, ({ warn, fail }) => {
        const output: string[] = [];
        const sections = new Map<string, number>();
        let keys = new Map<string, number>();
        let sectionCount = 0;
        let keyCount = 0;
        let globalKeys = 0;
        let currentSection: string | null = null;
        let lastWasValue = false;
        for (const line of splitLines(text)) {
            const trimmed = line.text.trim();
            const indent = line.text.length - line.text.trimStart().length;
            const start = line.offset + indent;
            if (!trimmed) {
                output.push("");
                lastWasValue = false;
                continue;
            }
            if (trimmed.startsWith(";") || trimmed.startsWith("#")) {
                output.push(trimmed);
                continue;
            }
            if (trimmed.startsWith("[")) {
                if (trimmed.startsWith("[[")) throw fail(start, { tr: "[[…]] başlıkları INI'de geçersizdir; bu bir TOML dizi tablosu gibi görünüyor (.toml dosyası kullanın).", en: "[[…]] headers are not valid INI; this looks like a TOML array table (use a .toml file)." });
                const close = trimmed.indexOf("]");
                if (close < 0) throw fail(start, { tr: "Bölüm başlığı kapatılmamış; ']' ekleyin.", en: "The section header is not closed; add ']'." });
                const rest = trimmed.slice(close + 1).trim();
                if (rest && !rest.startsWith(";") && !rest.startsWith("#")) throw fail(start + close + 1, { tr: "Bölüm başlığından sonra beklenmeyen metin.", en: "Unexpected text after the section header." });
                const name = trimmed.slice(1, close).trim();
                if (!name) throw fail(start, { tr: "Bölüm adı boş olamaz.", en: "The section name cannot be empty." });
                if (sections.has(name)) {
                    warn(start, { tr: `[${name}] bölümü ikinci kez tanımlanmış; bazı ayrıştırıcılar birleştirir, bazıları hata verir.`, en: `Section [${name}] appears again; some parsers merge it, others reject it.` });
                } else {
                    sections.set(name, start);
                    sectionCount += 1;
                }
                currentSection = name;
                keys = new Map();
                output.push("", `[${name}]${rest ? ` ${rest}` : ""}`);
                lastWasValue = false;
                continue;
            }
            const separator = trimmed.search(/[=:]/);
            if (separator < 0) {
                if (indent > 0 && lastWasValue) {
                    // An indented line continues the previous value (Python's configparser).
                    output[output.length - 1] += `\n    ${trimmed}`;
                    continue;
                }
                if (/^[^\s"']+$/.test(trimmed)) {
                    warn(start, { tr: `"${trimmed}" satırında '=' yok; değeri olmayan bir anahtar olarak kabul edildi.`, en: `"${trimmed}" has no '='; it is treated as a key without a value.` });
                    output.push(trimmed);
                    keyCount += 1;
                    lastWasValue = false;
                    continue;
                }
                throw fail(start, { tr: "Bir 'anahtar = değer' satırı, [bölüm] başlığı veya ; yorumu bekleniyordu.", en: "Expected a 'key = value' line, a [section] header or a ; comment." });
            }
            const key = trimmed.slice(0, separator).trim();
            const value = trimmed.slice(separator + 1).trim();
            if (!key) throw fail(start, { tr: "Anahtar adı boş olamaz.", en: "The key name cannot be empty." });
            const previous = keys.get(key.toLowerCase());
            if (previous !== undefined) {
                warn(start, { tr: `"${key}" anahtarı bu bölümde tekrar tanımlanmış; çoğu ayrıştırıcı son değeri kullanır.`, en: `Key "${key}" is repeated in this section; most parsers keep the last value.` });
            }
            keys.set(key.toLowerCase(), start);
            const quote = value[0];
            if ((quote === "\"" || quote === "'") && (value.length === 1 || !value.endsWith(quote))) {
                warn(start + trimmed.indexOf(value, separator), { tr: "Değerdeki tırnak kapatılmamış görünüyor.", en: "The quote in this value does not seem to be closed." });
            }
            keyCount += 1;
            if (currentSection === null) globalKeys += 1;
            output.push(`${key} = ${value}`.trimEnd());
            lastWasValue = true;
        }
        const summary = locale === "tr"
            ? `✓ Geçerli INI · ${count(locale, sectionCount, "bölüm", "section")} · ${count(locale, keyCount, "anahtar", "key")}${globalKeys ? ` (${globalKeys} tanesi bölümsüz)` : ""}`
            : `✓ Valid INI · ${count(locale, sectionCount, "bölüm", "section")} · ${count(locale, keyCount, "anahtar", "key")}${globalKeys ? ` (${globalKeys} before any section)` : ""}`;
        return { summary, formatted: joinLines(output) };
    });
}

// ----------------------------------------------------------------------- .env
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const PORTABLE_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_KEY = /SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|API_?KEY|ACCESS_?KEY|CREDENTIAL/i;

/** dotenv files: KEY=value, optional `export`, quoted and multi-line values, # comments. */
export function analyzeDotenv(text: string, options: ValidatorOptions = {}): ValidationResult {
    const locale = localeOf(options);
    return finish(text, locale, ({ warn, fail }) => {
        const output: string[] = [];
        const seen = new Map<string, number>();
        const secrets: string[] = [];
        let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
        while (index < text.length) {
            const lineEnd = text.indexOf("\n", index) < 0 ? text.length : text.indexOf("\n", index);
            const raw = text.slice(index, lineEnd).replace(/\r$/, "");
            const indent = raw.length - raw.trimStart().length;
            const trimmed = raw.trim();
            const start = index + indent;
            if (!trimmed) {
                output.push("");
                index = lineEnd + 1;
                continue;
            }
            if (trimmed.startsWith("#")) {
                output.push(trimmed);
                index = lineEnd + 1;
                continue;
            }
            const exported = /^export\s+/.exec(trimmed);
            const body = exported ? trimmed.slice(exported[0].length) : trimmed;
            const bodyStart = start + (exported ? exported[0].length : 0);
            const equals = body.indexOf("=");
            if (equals < 0) {
                throw fail(bodyStart, { tr: "ANAHTAR=değer biçiminde bir satır bekleniyordu.", en: "Expected a line in the form KEY=value." });
            }
            const key = body.slice(0, equals).trimEnd();
            if (!key) throw fail(bodyStart, { tr: "Değişken adı boş olamaz.", en: "The variable name cannot be empty." });
            if (!ENV_KEY.test(key)) throw fail(bodyStart, { tr: `"${key}" geçerli bir değişken adı değil; harf, rakam ve _ kullanın ve rakamla başlamayın.`, en: `"${key}" is not a valid variable name; use letters, digits and _ and don't start with a digit.` });
            if (!PORTABLE_ENV_KEY.test(key)) warn(bodyStart, { tr: `"${key}" içinde '.' veya '-' var; kabuklar ve Docker bu adları kabul etmez.`, en: `"${key}" contains '.' or '-'; shells and Docker do not accept such names.` });
            if (key !== body.slice(0, equals) || /^[ \t]/.test(body.slice(equals + 1))) {
                warn(bodyStart + equals, { tr: "'=' çevresindeki boşluklar taşınabilir değildir; kabuklar ve Docker bunları değerin parçası sayar.", en: "Spaces around '=' are not portable; shells and Docker treat them as part of the value." });
            }
            const previous = seen.get(key);
            if (previous !== undefined) warn(bodyStart, { tr: `${key} tekrar tanımlanmış; yükleyicilere göre ilk ya da son değer kullanılır.`, en: `${key} is defined again; loaders keep either the first or the last value.` });
            seen.set(key, bodyStart);

            let valueIndex = index + raw.indexOf(body) + equals + 1;
            while (text[valueIndex] === " " || text[valueIndex] === "\t") valueIndex += 1;
            const quote = text[valueIndex];
            let value: string;
            let next: number;
            if (quote === "\"" || quote === "'" || quote === "`") {
                let cursor = valueIndex + 1;
                for (;;) {
                    const char = text[cursor];
                    if (char === undefined) throw fail(valueIndex, { tr: `${key} değerindeki tırnak kapatılmamış.`, en: `The quoted value of ${key} is not closed.` });
                    if (char === "\\" && quote === "\"") {
                        cursor += 2;
                        continue;
                    }
                    if (char === quote) break;
                    cursor += 1;
                }
                value = text.slice(valueIndex, cursor + 1);
                const afterEnd = text.indexOf("\n", cursor) < 0 ? text.length : text.indexOf("\n", cursor);
                const rest = text.slice(cursor + 1, afterEnd).replace(/\r$/, "").trim();
                if (rest && !rest.startsWith("#")) throw fail(cursor + 1, { tr: "Kapanış tırnağından sonra beklenmeyen metin; yorumlar # ile başlar.", en: "Unexpected text after the closing quote; comments start with #." });
                next = afterEnd + 1;
                if (quote === "\"") {
                    for (const match of value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
                        if (!seen.has(match[1])) warn(valueIndex + (match.index ?? 0), { tr: `\${${match[1]}} daha önce tanımlanmamış; genişletme her yükleyicide desteklenmez.`, en: `\${${match[1]}} is not defined above; expansion is not supported by every loader.` });
                    }
                }
            } else {
                const line = text.slice(valueIndex, lineEnd).replace(/\r$/, "");
                const comment = line.search(/\s#/);
                value = (comment >= 0 ? line.slice(0, comment) : line).trim();
                if (/\s/.test(value)) warn(valueIndex, { tr: `${key} değeri boşluk içeriyor; kabuk uyumluluğu için tırnak içine alın.`, en: `The value of ${key} contains spaces; quote it for shell compatibility.` });
                for (const match of value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
                    if (!seen.has(match[1])) warn(valueIndex + (match.index ?? 0), { tr: `\${${match[1]}} daha önce tanımlanmamış; genişletme her yükleyicide desteklenmez.`, en: `\${${match[1]}} is not defined above; expansion is not supported by every loader.` });
                }
                next = lineEnd + 1;
            }
            if (SECRET_KEY.test(key) && value.replace(/^["'`]|["'`]$/g, "")) secrets.push(key);
            output.push(`${exported ? "export " : ""}${key}=${value}`);
            index = next;
        }
        const variables = seen.size;
        const notes = secrets.length
            ? [locale === "tr"
                ? `🔒 Gizli değerler içeriyor (${secrets.slice(0, 5).join(", ")}${secrets.length > 5 ? "…" : ""}). .env dosyalarını paylaşmayın ve depoya göndermeyin.`
                : `🔒 Contains secrets (${secrets.slice(0, 5).join(", ")}${secrets.length > 5 ? "…" : ""}). Never share or commit .env files.`]
            : undefined;
        const summary = locale === "tr" ? `✓ Geçerli .env · ${variables} değişken` : `✓ Valid .env · ${count(locale, variables, "değişken", "variable")}`;
        return { summary, formatted: joinLines(output), notes };
    });
}

// ----------------------------------------------------------------- .properties
/** Java .properties: key=value, key: value or key value; # and ! comments; \ continuations. */
export function analyzeProperties(text: string, options: ValidatorOptions = {}): ValidationResult {
    const locale = localeOf(options);
    return finish(text, locale, ({ warn, fail }) => {
        const output: string[] = [];
        const seen = new Map<string, number>();
        const lines = splitLines(text);
        let keyCount = 0;
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            const first = lines[lineIndex];
            const indent = first.text.length - first.text.trimStart().length;
            const trimmed = first.text.trim();
            if (!trimmed) {
                output.push("");
                continue;
            }
            if (trimmed.startsWith("#") || trimmed.startsWith("!")) {
                output.push(trimmed);
                continue;
            }
            // A logical line continues while a physical line ends in an odd number of backslashes.
            let logical = first.text.slice(indent);
            const start = first.offset + indent;
            const firstLength = logical.length;
            const continues = (value: string) => (/\\+$/.exec(value)?.[0].length ?? 0) % 2 === 1;
            while (continues(logical)) {
                logical = logical.slice(0, -1);
                if (lineIndex + 1 >= lines.length) {
                    warn(lines[lineIndex].offset + lines[lineIndex].text.length - 1, { tr: "Son satır '\\' ile bitiyor ama devam satırı yok.", en: "The last line ends with '\\' but no continuation line follows." });
                    break;
                }
                lineIndex += 1;
                logical += lines[lineIndex].text.trimStart();
            }
            for (let cursor = 0; cursor < logical.length; cursor += 1) {
                if (logical[cursor] !== "\\") continue;
                if (logical[cursor + 1] === "u" && !/^[0-9a-fA-F]{4}$/.test(logical.slice(cursor + 2, cursor + 6))) {
                    throw fail(cursor < firstLength ? start + cursor : start, { tr: "Hatalı \\uXXXX kaçışı; \\u ardından dört onaltılık rakam gelmelidir.", en: "Malformed \\uXXXX escape; \\u must be followed by four hex digits." });
                }
                cursor += 1;
            }
            // Key: up to the first unescaped '=', ':' or whitespace.
            let cursor = 0;
            while (cursor < logical.length && !/[=:\s]/.test(logical[cursor])) cursor += logical[cursor] === "\\" ? 2 : 1;
            const key = logical.slice(0, Math.min(cursor, logical.length));
            let valueStart = cursor;
            while (valueStart < logical.length && /[ \t\f]/.test(logical[valueStart])) valueStart += 1;
            if (logical[valueStart] === "=" || logical[valueStart] === ":") valueStart += 1;
            while (valueStart < logical.length && /[ \t\f]/.test(logical[valueStart])) valueStart += 1;
            const value = logical.slice(valueStart);
            if (!key) warn(start, { tr: "Boş anahtar.", en: "Empty key." });
            const decodedKey = key.replace(/\\(.)/g, "$1");
            if (seen.has(decodedKey)) warn(start, { tr: `"${decodedKey}" anahtarı tekrar tanımlanmış; son değer kullanılır.`, en: `Key "${decodedKey}" is repeated; the last value wins.` });
            seen.set(decodedKey, start);
            keyCount += 1;
            output.push(`${key} = ${value}`.trimEnd());
        }
        const summary = locale === "tr" ? `✓ Geçerli .properties · ${keyCount} anahtar` : `✓ Valid .properties · ${count(locale, keyCount, "anahtar", "key")}`;
        return { summary, formatted: joinLines(output) };
    });
}

// ------------------------------------------------------------------------ CSV
export interface CsvOptions extends ValidatorOptions {
    /** Field separator; detected from the first record when omitted. */
    delimiter?: string;
    /** Used to pick tab as the default separator for .tsv files. */
    fileName?: string;
    /** Data rows shown in the formatted table (default 50). */
    maxRows?: number;
}

export interface CsvAnalysis extends ValidationResult {
    rows?: string[][];
    delimiter?: string;
}

const DELIMITERS = [",", ";", "\t", "|"];

/** Picks the separator that occurs most often in the first record, outside quotes. */
export function detectDelimiter(text: string): string {
    const counts = new Map(DELIMITERS.map((delimiter) => [delimiter, 0]));
    let quoted = false;
    for (let index = 0; index < text.length && index < 20_000; index += 1) {
        const char = text[index];
        if (char === "\"") quoted = !quoted;
        else if (!quoted && char === "\n") break;
        else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    let best = ",";
    let bestCount = 0;
    for (const [delimiter, value] of counts) {
        if (value > bestCount) {
            best = delimiter;
            bestCount = value;
        }
    }
    return best;
}

function delimiterName(delimiter: string, locale: ValidatorLocale) {
    if (delimiter === "\t") return locale === "tr" ? "sekme" : "tab";
    return `'${delimiter}'`;
}

/** Parses CSV per RFC 4180 (quoted fields, "" escapes, line breaks inside quotes). */
export function analyzeCsv(text: string, options: CsvOptions = {}): CsvAnalysis {
    const locale = localeOf(options);
    const delimiter = options.delimiter ?? (/\.tsv$/i.test(options.fileName ?? "") ? "\t" : detectDelimiter(text));
    let rows: string[][] = [];
    const result = finish(text, locale, ({ warn, fail }) => {
        const rowOffsets: number[] = [];
        let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
        let strayQuoteWarned = false;
        while (index < text.length) {
            const rowStart = index;
            const row: string[] = [];
            for (;;) {
                // One field.
                if (text[index] === "\"") {
                    const open = index;
                    let value = "";
                    index += 1;
                    for (;;) {
                        const char = text[index];
                        if (char === undefined) throw fail(open, { tr: "Tırnaklı alan kapatılmamış; kapanış \" ekleyin (alan içindeki tırnaklar \"\" olarak yazılır).", en: "Unterminated quoted field; add the closing \" (quotes inside a field are written as \"\")." });
                        if (char === "\"") {
                            if (text[index + 1] === "\"") {
                                value += "\"";
                                index += 2;
                                continue;
                            }
                            index += 1;
                            break;
                        }
                        value += char;
                        index += 1;
                    }
                    const after = text[index];
                    if (after !== undefined && after !== delimiter && after !== "\n" && after !== "\r") {
                        throw fail(index, { tr: `Kapanış tırnağından sonra ${delimiterName(delimiter, locale)} veya satır sonu bekleniyordu.`, en: `Expected ${delimiterName(delimiter, locale)} or a line break after the closing quote.` });
                    }
                    row.push(value);
                } else {
                    const fieldStart = index;
                    while (index < text.length && text[index] !== delimiter && text[index] !== "\n" && text[index] !== "\r") index += 1;
                    const value = text.slice(fieldStart, index);
                    const quote = value.indexOf("\"");
                    if (quote >= 0 && !strayQuoteWarned) {
                        strayQuoteWarned = true;
                        warn(fieldStart + quote, { tr: "Tırnaksız bir alanın içinde \" var; RFC 4180'e göre böyle alanlar tırnak içine alınmalı.", en: "An unquoted field contains \"; per RFC 4180 such fields must be quoted." });
                    }
                    row.push(value);
                }
                if (text[index] === delimiter) {
                    index += 1;
                    continue;
                }
                break;
            }
            if (text[index] === "\r") index += 1;
            if (text[index] === "\n") index += 1;
            rows.push(row);
            rowOffsets.push(rowStart);
        }
        // A blank line in the middle is a record with one empty field; at the end it is ignored.
        while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
            rows.pop();
            rowOffsets.pop();
        }
        if (!rows.length) throw fail(0, { tr: "Dosya boş; en az bir satır bekleniyordu.", en: "The file is empty; expected at least one row." });
        const columns = rows[0].length;
        const ragged: number[] = [];
        rows.forEach((row, rowIndex) => {
            if (row.length === 1 && row[0] === "" && columns > 1) {
                warn(rowOffsets[rowIndex], { tr: "Boş satır.", en: "Blank line." });
                return;
            }
            if (row.length !== columns) ragged.push(rowIndex);
        });
        for (const rowIndex of ragged.slice(0, 5)) {
            const actual = rows[rowIndex].length;
            warn(rowOffsets[rowIndex], {
                tr: `${rowIndex + 1}. kayıtta ${actual} alan var; ilk satırda ${columns} alan vardı.`,
                en: `Record ${rowIndex + 1} has ${actual} ${actual === 1 ? "field" : "fields"}; the first row has ${columns}.`,
            });
        }
        if (ragged.length > 5) warn(rowOffsets[ragged[5]], { tr: `Alan sayısı farklı olan ${ragged.length - 5} kayıt daha var.`, en: `${ragged.length - 5} more ${ragged.length - 5 === 1 ? "record has" : "records have"} a different number of fields.` });

        const dataRows = rows.length - 1;
        const header = rows[0].slice(0, 6).map((cell) => cell.trim() || "∅").join(", ") + (rows[0].length > 6 ? ", …" : "");
        const summary = locale === "tr"
            ? `✓ Geçerli CSV · ${dataRows} veri satırı × ${columns} sütun · ayırıcı ${delimiterName(delimiter, locale)} · başlık: ${header}`
            : `✓ Valid CSV · ${dataRows} data ${dataRows === 1 ? "row" : "rows"} × ${columns} ${columns === 1 ? "column" : "columns"} · delimiter ${delimiterName(delimiter, locale)} · header: ${header}`;
        const maxRows = Math.max(1, options.maxRows ?? 50);
        const notes = dataRows > maxRows
            ? [locale === "tr" ? `… ${dataRows - maxRows} satır daha gösterilmedi.` : `… ${dataRows - maxRows} more ${dataRows - maxRows === 1 ? "row" : "rows"} not shown.`]
            : undefined;
        return { summary, formatted: formatTable(rows.slice(0, maxRows + 1)), notes };
    });
    if (!result.ok) rows = [];
    return { ...result, rows: result.ok ? rows : undefined, delimiter };
}

/** An ASCII table with the first row as the header (cells are clipped at 32 characters). */
export function formatTable(rows: string[][]): string {
    const width = Math.max(...rows.map((row) => row.length));
    const clean = (cell: string | undefined) => (cell ?? "").replace(/\r?\n/g, "⏎").replace(/\t/g, " ");
    const cells = rows.map((row) => Array.from({ length: width }, (_, index) => clean(row[index])));
    const widths = Array.from({ length: width }, (_, index) => Math.min(32, Math.max(1, ...cells.map((row) => row[index].length))));
    const clip = (text: string, size: number) => (text.length > size ? `${text.slice(0, size - 1)}…` : text.padEnd(size));
    const line = `+${widths.map((size) => "-".repeat(size + 2)).join("+")}+`;
    const render = (row: string[]) => `| ${row.map((cell, index) => clip(cell, widths[index])).join(" | ")} |`;
    const [head, ...body] = cells;
    return [line, render(head), line, ...body.map(render), ...(body.length ? [line] : [])].join("\n");
}
