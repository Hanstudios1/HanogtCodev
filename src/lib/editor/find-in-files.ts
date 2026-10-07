/**
 * Search (and replace) across the editor's open files: plain text or regular
 * expressions, optional case and whole-word matching, line by line like the
 * editor's own find. Dependency-free (tested in scripts/tests).
 */

export interface SearchOptions {
    query: string;
    matchCase: boolean;
    wholeWord: boolean;
    regex: boolean;
}

export interface SearchFile {
    id: string;
    name: string;
    text: string;
}

/** One match; lines and columns are 1-based like Monaco's, `endColumn` is exclusive. */
export interface SearchMatch {
    line: number;
    column: number;
    endColumn: number;
    /** The matched text. */
    text: string;
    /** The line around the match, shortened for display. */
    before: string;
    after: string;
}

export interface FileMatches {
    id: string;
    name: string;
    matches: SearchMatch[];
}

export interface SearchResult {
    files: FileMatches[];
    /** Matches found (at most `limit`). */
    total: number;
    /** True when the search stopped at `limit`. */
    truncated: boolean;
}

/** A replacement for one match (same coordinates as SearchMatch). */
export interface LineEdit {
    line: number;
    column: number;
    endColumn: number;
    text: string;
}

/** The results panel shows at most this many matches. */
export const SEARCH_RESULT_LIMIT = 2_000;

const BEFORE_CHARS = 36;
const AFTER_CHARS = 120;
const MATCH_CHARS = 200;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

export function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type CompiledSearch = { ok: true; pattern: RegExp } | { ok: false; error: string };

/** The search as a global regular expression; null for an empty query. */
export function compileSearch(options: SearchOptions): CompiledSearch | null {
    if (!options.query) return null;
    const source = options.regex ? options.query : escapeRegExp(options.query);
    const flags = `g${options.matchCase ? "" : "i"}`;
    try {
        // Unicode mode first (\p{…}, case folding beyond ASCII); patterns written for the older syntax still work without it.
        return { ok: true, pattern: new RegExp(source, `${flags}u`) };
    } catch {
        try {
            return { ok: true, pattern: new RegExp(source, flags) };
        } catch (error) {
            // "Invalid regular expression: /(a/gi: Unterminated group" → "Unterminated group".
            const message = error instanceof Error ? error.message : String(error);
            return { ok: false, error: message.split(": ").pop()?.trim() || message };
        }
    }
}

function isWordChar(char: string | undefined): boolean {
    return char !== undefined && WORD_CHAR.test(char);
}

/** Splits text into lines (any line ending). */
export function splitLines(text: string): string[] {
    return text.split(/\r\n|\r|\n/);
}

/** Every match in one line (1-based columns); empty matches are skipped. */
function lineMatches(line: string, pattern: RegExp, wholeWord: boolean, limit: number): RegExpExecArray[] {
    const found: RegExpExecArray[] = [];
    pattern.lastIndex = 0;
    while (found.length < limit) {
        const match = pattern.exec(line);
        if (!match) break;
        if (match[0].length === 0) {
            // Step over the empty match (a whole code point in Unicode mode).
            const code = line.codePointAt(pattern.lastIndex);
            pattern.lastIndex += code !== undefined && code > 0xffff ? 2 : 1;
            if (pattern.lastIndex > line.length) break;
            continue;
        }
        const start = match.index;
        const end = start + match[0].length;
        if (wholeWord && (isWordChar(line[start - 1]) || isWordChar(line[end]))) {
            // Try again one character later (a shorter match may still be a whole word).
            pattern.lastIndex = start + 1;
            continue;
        }
        found.push(match);
    }
    return found;
}

function preview(line: string, start: number, end: number): { before: string; text: string; after: string } {
    let before = line.slice(Math.max(0, start - BEFORE_CHARS), start);
    if (start - BEFORE_CHARS > 0) before = `…${before.trimStart()}`;
    else before = before.trimStart();
    const text = line.slice(start, Math.min(end, start + MATCH_CHARS));
    const after = line.slice(end, end + AFTER_CHARS);
    return { before, text, after: end + AFTER_CHARS < line.length ? `${after}…` : after };
}

/** Searches every file; stops after `limit` matches. */
export function searchFiles(files: readonly SearchFile[], options: SearchOptions, limit = SEARCH_RESULT_LIMIT): SearchResult & { error?: string } {
    const compiled = compileSearch(options);
    if (!compiled) return { files: [], total: 0, truncated: false };
    if (!compiled.ok) return { files: [], total: 0, truncated: false, error: compiled.error };
    const results: FileMatches[] = [];
    let total = 0;
    let truncated = false;
    for (const file of files) {
        if (total >= limit) {
            truncated = truncated || countMatches(file.text, options, 1) > 0;
            if (truncated) break;
            continue;
        }
        const matches: SearchMatch[] = [];
        const lines = splitLines(file.text);
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const found = lineMatches(line, compiled.pattern, options.wholeWord, limit - total + 1);
            for (const match of found) {
                if (total >= limit) {
                    truncated = true;
                    break;
                }
                const start = match.index;
                const end = start + match[0].length;
                const { before, text, after } = preview(line, start, end);
                matches.push({ line: index + 1, column: start + 1, endColumn: end + 1, text, before, after });
                total += 1;
            }
            if (truncated) break;
        }
        if (matches.length) results.push({ id: file.id, name: file.name, matches });
        if (truncated) break;
    }
    return { files: results, total, truncated };
}

/** How many matches a text has (up to `limit`). */
export function countMatches(text: string, options: SearchOptions, limit = Number.POSITIVE_INFINITY): number {
    const compiled = compileSearch(options);
    if (!compiled?.ok) return 0;
    let count = 0;
    for (const line of splitLines(text)) {
        count += lineMatches(line, compiled.pattern, options.wholeWord, limit - count).length;
        if (count >= limit) break;
    }
    return count;
}

/**
 * The replacement text for one regular-expression match: $& (the match),
 * $1…$99 and $<name> (groups), $$ (a dollar sign), $` and $' (the line's text
 * before and after), and \n, \t, \\ escapes. Plain-text searches insert the
 * replacement as typed.
 */
export function expandReplacement(template: string, match: RegExpExecArray, line: string): string {
    let result = "";
    for (let index = 0; index < template.length; index += 1) {
        const char = template[index];
        const next = template[index + 1];
        if (char === "\\" && next !== undefined) {
            if (next === "n") { result += "\n"; index += 1; continue; }
            if (next === "t") { result += "\t"; index += 1; continue; }
            if (next === "\\") { result += "\\"; index += 1; continue; }
            result += char;
            continue;
        }
        if (char !== "$" || next === undefined) {
            result += char;
            continue;
        }
        if (next === "$") { result += "$"; index += 1; continue; }
        if (next === "&") { result += match[0]; index += 1; continue; }
        if (next === "`") { result += line.slice(0, match.index); index += 1; continue; }
        if (next === "'") { result += line.slice(match.index + match[0].length); index += 1; continue; }
        if (next === "<") {
            const close = template.indexOf(">", index + 2);
            const name = close > 0 ? template.slice(index + 2, close) : "";
            if (name && match.groups && name in match.groups) {
                result += match.groups[name] ?? "";
                index = close;
                continue;
            }
            result += char;
            continue;
        }
        if (/[0-9]/.test(next)) {
            // Two digits when that group exists ($12), else one ($1 followed by "2").
            const two = template.slice(index + 1, index + 3);
            if (/^[0-9]{2}$/.test(two) && Number(two) > 0 && Number(two) < match.length) {
                result += match[Number(two)] ?? "";
                index += 2;
                continue;
            }
            const one = Number(next);
            if (one > 0 && one < match.length) {
                result += match[one] ?? "";
                index += 1;
                continue;
            }
        }
        result += char;
    }
    return result;
}

/** Every match of the search in `text` with its replacement (no limit), for one undoable edit per file. */
export function planReplacements(text: string, options: SearchOptions, replacement: string): LineEdit[] {
    const compiled = compileSearch(options);
    if (!compiled?.ok) return [];
    const edits: LineEdit[] = [];
    const lines = splitLines(text);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        for (const match of lineMatches(line, compiled.pattern, options.wholeWord, Number.POSITIVE_INFINITY)) {
            edits.push({
                line: index + 1,
                column: match.index + 1,
                endColumn: match.index + match[0].length + 1,
                text: options.regex ? expandReplacement(replacement, match, line) : replacement,
            });
        }
    }
    return edits;
}

/** Applies line edits to a text (what the editor does with them; used by tests and previews). */
export function applyLineEdits(text: string, edits: readonly LineEdit[]): string {
    const lines = text.split(/(\r\n|\r|\n)/);
    // Even indexes are lines, odd indexes the line breaks after them.
    const byLine = new Map<number, LineEdit[]>();
    for (const edit of edits) byLine.set(edit.line, [...(byLine.get(edit.line) ?? []), edit]);
    for (const [lineNumber, lineEdits] of byLine) {
        const position = (lineNumber - 1) * 2;
        let line = lines[position] ?? "";
        for (const edit of [...lineEdits].sort((a, b) => b.column - a.column)) {
            line = line.slice(0, edit.column - 1) + edit.text + line.slice(edit.endColumn - 1);
        }
        lines[position] = line;
    }
    return lines.join("");
}
