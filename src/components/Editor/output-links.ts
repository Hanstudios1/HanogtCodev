/**
 * Finds source locations in program output so the console can turn them into
 * "go to line" links. Dependency-free (tested in scripts/tests).
 *
 * Recognised forms: "main.py:3", "main.js:3:9", 'File "main.py", line 3',
 * Wandbox's "prog.cc:5:10" / "prog.java:5" / "prog.cs(5,10)", Kotlin's
 * "File.kt:3:5" and "./prog.go:5:2".
 */

export type OutputSegment = string | { text: string; line: number; column?: number };

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Removes terminal colour codes that some compilers print. */
export function stripAnsi(text: string): string {
    return text.replace(ANSI, "");
}

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits `text` into plain strings and location links for the given file names. */
export function linkifyOutput(text: string, fileNames: readonly string[]): OutputSegment[] {
    const names = [...new Set(fileNames.filter(Boolean))].sort((a, b) => b.length - a.length).map(escapeRegExp);
    const file = [...names, "prog\\.[A-Za-z]{1,6}", "File\\.kt", "main\\.[A-Za-z]{1,6}"].join("|");
    const pattern = new RegExp(
        `File "(?:${file})", line (\\d+)|(?:${file})(?::(\\d+)(?::(\\d+))?|\\((\\d+),(\\d+)\\))`,
        "g",
    );
    const segments: OutputSegment[] = [];
    let cursor = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        const line = Number(match[1] ?? match[2] ?? match[4]);
        const columnText = match[3] ?? match[5];
        if (!Number.isFinite(line) || line < 1 || line > 1_000_000) continue;
        if (match.index > cursor) segments.push(text.slice(cursor, match.index));
        segments.push({ text: match[0], line, ...(columnText ? { column: Number(columnText) } : {}) });
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length) segments.push(text.slice(cursor));
    return segments;
}
