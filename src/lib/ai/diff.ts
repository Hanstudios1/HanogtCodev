/**
 * Line diffs for Hanogt AI's "Changes" card: Myers' shortest edit script on
 * lines, hunks with context for showing it, and applying a unified diff an
 * answer gave to the file the question was about. Pure functions: the chat,
 * the editor and the tests share them.
 */

export type DiffKind = "same" | "add" | "del";

export interface DiffOp {
    kind: DiffKind;
    text: string;
    /** 1-based line in the old text (null for an added line). */
    oldLine: number | null;
    /** 1-based line in the new text (null for a deleted line). */
    newLine: number | null;
}

export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    ops: DiffOp[];
}

/** Lines of a text; a final line break doesn't make an empty last line. */
export function splitLines(text: string): string[] {
    if (!text) return [];
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
}

type Step = { kind: DiffKind; text: string };

/**
 * Myers' O((N+M)·D) algorithm with the trace kept per round (2d+3 values), so
 * memory grows with the number of edits rather than the file. Null when the
 * texts differ in more than `maxEdits` lines.
 */
function myers(a: string[], b: string[], maxEdits: number): Step[] | null {
    const n = a.length;
    const m = b.length;
    if (!n) return b.map((text) => ({ kind: "add", text }));
    if (!m) return a.map((text) => ({ kind: "del", text }));
    const limit = Math.min(n + m, maxEdits);
    const offset = limit + 1;
    const v = new Int32Array(2 * limit + 3);
    const trace: Int32Array[] = [];
    let found = -1;
    for (let d = 0; d <= limit && found < 0; d += 1) {
        // What round d reads: the values of round d-1 for k = -d-1 … d+1.
        trace.push(v.slice(offset - d - 1, offset + d + 2));
        for (let k = -d; k <= d; k += 2) {
            let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
            let y = x - k;
            while (x < n && y < m && a[x] === b[y]) {
                x += 1;
                y += 1;
            }
            v[offset + k] = x;
            if (x >= n && y >= m) {
                found = d;
                break;
            }
        }
    }
    if (found < 0) return null;

    const steps: Step[] = [];
    let x = n;
    let y = m;
    for (let d = found; d >= 0; d -= 1) {
        const snapshot = trace[d];
        const at = (k: number) => snapshot[k + d + 1];
        const k = x - y;
        const previousK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
        const previousX = d === 0 ? 0 : at(previousK);
        const previousY = d === 0 ? 0 : previousX - previousK;
        while (x > previousX && y > previousY) {
            steps.push({ kind: "same", text: a[x - 1] });
            x -= 1;
            y -= 1;
        }
        if (d > 0) {
            if (x === previousX) steps.push({ kind: "add", text: b[y - 1] });
            else steps.push({ kind: "del", text: a[x - 1] });
            x = previousX;
            y = previousY;
        }
    }
    return steps.reverse();
}

/**
 * The line-by-line difference of two texts (as lines), with line numbers on
 * both sides. Common lines at the start and the end are skipped before the
 * search. Null when they differ in more than `maxEdits` lines.
 */
export function diffLines(a: string[], b: string[], maxEdits = 2_000): DiffOp[] | null {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA -= 1;
        endB -= 1;
    }
    const middle = myers(a.slice(start, endA), b.slice(start, endB), maxEdits);
    if (!middle) return null;
    const ops: DiffOp[] = [];
    for (let index = 0; index < start; index += 1) ops.push({ kind: "same", text: a[index], oldLine: index + 1, newLine: index + 1 });
    let oldLine = start + 1;
    let newLine = start + 1;
    for (const step of middle) {
        if (step.kind === "same") ops.push({ kind: "same", text: step.text, oldLine: oldLine++, newLine: newLine++ });
        else if (step.kind === "del") ops.push({ kind: "del", text: step.text, oldLine: oldLine++, newLine: null });
        else ops.push({ kind: "add", text: step.text, oldLine: null, newLine: newLine++ });
    }
    for (let index = endA, other = endB; index < a.length; index += 1, other += 1) ops.push({ kind: "same", text: a[index], oldLine: index + 1, newLine: other + 1 });
    return ops;
}

export function diffStats(ops: DiffOp[]) {
    let added = 0;
    let removed = 0;
    for (const op of ops) {
        if (op.kind === "add") added += 1;
        else if (op.kind === "del") removed += 1;
    }
    return { added, removed };
}

/** The changes with `context` unchanged lines around them; changes closer than twice that share a hunk. */
export function diffHunks(ops: DiffOp[], context = 3): DiffHunk[] {
    const changed: number[] = [];
    ops.forEach((op, index) => {
        if (op.kind !== "same") changed.push(index);
    });
    if (!changed.length) return [];
    const ranges: Array<[number, number]> = [];
    for (const index of changed) {
        const from = Math.max(0, index - context);
        const to = Math.min(ops.length, index + context + 1);
        const last = ranges[ranges.length - 1];
        if (last && from <= last[1]) last[1] = Math.max(last[1], to);
        else ranges.push([from, to]);
    }
    return ranges.map(([from, to]) => {
        const slice = ops.slice(from, to);
        const firstOld = slice.find((op) => op.oldLine !== null)?.oldLine ?? null;
        const firstNew = slice.find((op) => op.newLine !== null)?.newLine ?? null;
        // A hunk that only adds lines starts after the old line before it.
        const before = ops.slice(0, from).filter((op) => op.oldLine !== null).length;
        const beforeNew = ops.slice(0, from).filter((op) => op.newLine !== null).length;
        return {
            oldStart: firstOld ?? before,
            oldLines: slice.filter((op) => op.kind !== "add").length,
            newStart: firstNew ?? beforeNew,
            newLines: slice.filter((op) => op.kind !== "del").length,
            ops: slice,
        };
    });
}

// ------------------------------------------------------------------ unified diffs

export interface PatchLine {
    kind: " " | "-" | "+";
    text: string;
}

export interface PatchHunk {
    /** 1-based; 0 when the header had no numbers ("@@ ... @@" written loosely). */
    oldStart: number;
    lines: PatchLine[];
}

export interface PatchFile {
    oldName: string | null;
    newName: string | null;
    hunks: PatchHunk[];
}

const fileNameOf = (header: string) => {
    const name = header.replace(/^(?:---|\+\+\+)\s+/, "").replace(/\t.*$/, "").trim();
    if (!name || name === "/dev/null") return null;
    return name.replace(/^[ab]\//, "");
};

/**
 * The files and hunks of a unified diff, read leniently: answers sometimes
 * leave out the file headers or the line numbers, or write an empty context
 * line without its leading space.
 */
export function parseUnifiedDiff(patch: string): PatchFile[] {
    const files: PatchFile[] = [];
    let file: PatchFile | null = null;
    let hunk: PatchHunk | null = null;
    const lines = patch.replace(/\r\n?/g, "\n").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.startsWith("--- ") && lines[index + 1]?.startsWith("+++ ")) {
            file = { oldName: fileNameOf(line), newName: fileNameOf(lines[index + 1]), hunks: [] };
            files.push(file);
            hunk = null;
            index += 1;
            continue;
        }
        // "@@ -3,2 +3,2 @@", but also a bare "@@" or "@@ ... @@": a line starting with @@ is a hunk header.
        const header = /^@@(?:\s*-(\d+)(?:,\d+)?\s+\+\d+(?:,\d+)?)?/.exec(line);
        if (header) {
            if (!file) {
                file = { oldName: null, newName: null, hunks: [] };
                files.push(file);
            }
            hunk = { oldStart: header[1] ? Number(header[1]) : 0, lines: [] };
            file.hunks.push(hunk);
            continue;
        }
        if (!hunk) continue;
        if (line.startsWith("\\")) continue;
        const kind = line[0];
        if (kind === " " || kind === "-" || kind === "+") hunk.lines.push({ kind, text: line.slice(1) });
        else if (line === "") hunk.lines.push({ kind: " ", text: "" });
        else hunk = null;
    }
    // A trailing empty line after the last hunk is the text's own line break, not context.
    for (const entry of files) {
        for (const each of entry.hunks) {
            while (each.lines.length && each.lines[each.lines.length - 1].kind === " " && each.lines[each.lines.length - 1].text === "") each.lines.pop();
        }
    }
    return files.filter((entry) => entry.hunks.some((each) => each.lines.length));
}

type Compare = (a: string, b: string) => boolean;
const COMPARES: Compare[] = [
    (a, b) => a === b,
    (a, b) => a.trimEnd() === b.trimEnd(),
    (a, b) => a.trim() === b.trim(),
];

/** Where `block` occurs in `lines` at or after `from`, nearest to `expected`; -1 when nowhere. */
function findBlock(lines: string[], block: string[], from: number, expected: number, same: Compare) {
    let best = -1;
    for (let start = from; start + block.length <= lines.length; start += 1) {
        let match = true;
        for (let offset = 0; offset < block.length; offset += 1) {
            if (!same(lines[start + offset], block[offset])) {
                match = false;
                break;
            }
        }
        if (match && (best < 0 || Math.abs(start - expected) < Math.abs(best - expected))) best = start;
    }
    return best;
}

export type ApplyResult = { ok: true; text: string } | { ok: false; reason: "empty" | "mismatch" };

/**
 * Applies a unified diff to `original`: each hunk's old lines (context and
 * deletions) are found in order, nearest to the line the header names,
 * first exactly, then ignoring trailing and then all surrounding spaces.
 * The first file of the patch is used, or the one named `fileName`.
 */
export function applyUnifiedDiff(original: string, patch: string, fileName?: string): ApplyResult {
    const files = parseUnifiedDiff(patch);
    if (!files.length) return { ok: false, reason: "empty" };
    const base = fileName?.trim().toLowerCase();
    const file = (base && files.find((entry) => [entry.oldName, entry.newName].some((name) => name && (name.toLowerCase() === base || name.toLowerCase().endsWith(`/${base}`))))) || files[0];
    const lines = splitLines(original);
    const result: string[] = [];
    // `lines` stays the original: the headers' line numbers point into it.
    let position = 0;
    for (const hunk of file.hunks) {
        const oldBlock = hunk.lines.filter((line) => line.kind !== "+").map((line) => line.text);
        const newBlock = hunk.lines.filter((line) => line.kind !== "-").map((line) => line.text);
        const expected = hunk.oldStart > 0 ? hunk.oldStart - 1 : position;
        let at = -1;
        if (!oldBlock.length) {
            // Only additions without context: after the line the header names, else at the end.
            at = hunk.oldStart > 0 ? Math.min(Math.max(position, hunk.oldStart), lines.length) : lines.length;
        } else {
            for (const same of COMPARES) {
                at = findBlock(lines, oldBlock, position, Math.max(expected, position), same);
                if (at >= 0) break;
            }
        }
        if (at < 0) return { ok: false, reason: "mismatch" };
        result.push(...lines.slice(position, at), ...newBlock);
        position = at + oldBlock.length;
    }
    result.push(...lines.slice(position));
    const ending = original.endsWith("\n") || !original ? "\n" : "";
    return { ok: true, text: result.length ? `${result.join("\n")}${ending}` : "" };
}
