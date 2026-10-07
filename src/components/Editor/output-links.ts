/**
 * Finds source locations in program output so the console can turn them into
 * "go to line" links, and combines them with the output's terminal colours.
 * Dependency-free (tested in scripts/tests).
 *
 * Recognised forms: "main.py:3", "main.js:3:9", 'File "main.py", line 3',
 * Wandbox's "prog.cc:5:10" / "prog.java:5" / "prog.cs(5,10)", Kotlin's
 * "File.kt:3:5" and "./prog.go:5:2".
 */
import { parseAnsi, stripAnsi, type AnsiStyle } from "@/lib/editor/ansi";

export type OutputSegment = string | { text: string; line: number; column?: number };

/** Removes terminal colour codes and other escape sequences that some programs print. */
export { stripAnsi };

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

/** Text in one terminal style; `style` is null for the console's own colour. */
export type OutputPiece = { text: string; style: AnsiStyle | null };

/** Consecutive pieces, optionally forming one location link. */
export type OutputChunk = { pieces: OutputPiece[]; link?: { text: string; line: number; column?: number } };

/**
 * Colours and location links together: the escape sequences are parsed first,
 * links are found in the visible text (so a colour code inside "main.py:3"
 * doesn't hide the link) and every link keeps the colours of its characters.
 */
export function linkifyAnsiOutput(text: string, fileNames: readonly string[]): OutputChunk[] {
    const spans = parseAnsi(text);
    const plain = spans.map((span) => span.text).join("");
    const segments = linkifyOutput(plain, fileNames);
    const chunks: OutputChunk[] = [];
    let spanIndex = 0;
    let spanOffset = 0;
    for (const segment of segments) {
        const segmentText = typeof segment === "string" ? segment : segment.text;
        const pieces: OutputPiece[] = [];
        let remaining = segmentText.length;
        while (remaining > 0 && spanIndex < spans.length) {
            const span = spans[spanIndex];
            const available = span.text.length - spanOffset;
            const take = Math.min(available, remaining);
            pieces.push({ text: span.text.slice(spanOffset, spanOffset + take), style: span.style });
            remaining -= take;
            spanOffset += take;
            if (spanOffset >= span.text.length) {
                spanIndex += 1;
                spanOffset = 0;
            }
        }
        if (typeof segment === "string") {
            // Plain text after plain text: one chunk.
            const previous = chunks[chunks.length - 1];
            if (previous && !previous.link) previous.pieces.push(...pieces);
            else chunks.push({ pieces });
        } else {
            chunks.push({ pieces, link: { text: segment.text, line: segment.line, ...(segment.column !== undefined ? { column: segment.column } : {}) } });
        }
    }
    return chunks;
}
