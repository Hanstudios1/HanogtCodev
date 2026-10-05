/**
 * Turns an answer about the open editor file into a proposed change of that
 * file: a unified diff applied to the file the question was sent with, or a
 * code block that is the whole file rewritten. A short snippet (one function
 * out of a long file) is not a change of the file: replacing the file with it
 * would lose the rest, so no change is proposed then.
 */
import { applyUnifiedDiff, diffLines, diffStats, splitLines, type DiffOp } from "./diff";
import { normalizeLanguageId } from "@/lib/runtimes/languages";

export interface FenceBlock {
    lang: string;
    code: string;
}

/** The closed fenced code blocks of a Markdown text (an unfinished block at the end is left out). */
export function codeBlocks(markdown: string): FenceBlock[] {
    const blocks: FenceBlock[] = [];
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    let open: { fence: string; lang: string; body: string[] } | null = null;
    for (const line of lines) {
        if (!open) {
            const start = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
            if (start) open = { fence: start[1], lang: start[2].toLowerCase(), body: [] };
            continue;
        }
        const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line);
        if (close && close[1][0] === open.fence[0] && close[1].length >= open.fence.length) {
            blocks.push({ lang: open.lang, code: open.body.join("\n") });
            open = null;
        } else {
            open.body.push(line);
        }
    }
    return blocks;
}

export interface EditBase {
    /** The file as it was sent with the question. */
    code: string;
    /** Editor language id (python, javascript…). */
    language: string;
    fileName: string;
}

export interface ProposedEdit {
    /** Where the change came from: a diff block, or a block with the whole file. */
    kind: "diff" | "full";
    /** The file after the change. */
    code: string;
    ops: DiffOp[];
    added: number;
    removed: number;
}

const DIFF_LANGS = new Set(["diff", "patch", "udiff"]);
/** Below this share of the old lines kept, a block is a different snippet, not the file rewritten. */
const MIN_KEPT_SHARE = 0.3;

function looksLikeDiff(block: FenceBlock) {
    return DIFF_LANGS.has(block.lang) || /^(?:--- .*\n\+\+\+ |@@ )/m.test(block.code);
}

function withEnding(code: string, like: string) {
    const body = code.replace(/\s+$/, "");
    return like.endsWith("\n") ? `${body}\n` : body;
}

function proposal(kind: ProposedEdit["kind"], base: string, code: string): ProposedEdit | null {
    if (code === base || code.replace(/\s+$/, "") === base.replace(/\s+$/, "")) return null;
    const ops = diffLines(splitLines(base), splitLines(code));
    if (!ops) return null;
    const { added, removed } = diffStats(ops);
    return { kind, code, ops, added, removed };
}

/**
 * The change an answer proposes for `base`, or null. Diff blocks come first
 * (they say exactly what changes); otherwise the largest block in the file's
 * language (or with no language) that keeps enough of the file's lines.
 */
export function proposedEdit(answer: string, base: EditBase): ProposedEdit | null {
    const blocks = codeBlocks(answer).filter((block) => block.code.trim());
    if (!blocks.length) return null;

    for (const block of blocks.filter(looksLikeDiff)) {
        const applied = applyUnifiedDiff(base.code, block.code, base.fileName);
        if (applied.ok) return proposal("diff", base.code, applied.text);
    }

    const language = normalizeLanguageId(base.language) ?? base.language;
    const candidates = blocks
        .filter((block) => !looksLikeDiff(block))
        .filter((block) => !block.lang || (normalizeLanguageId(block.lang) ?? block.lang) === language)
        .sort((a, b) => b.code.length - a.code.length);
    const baseLines = splitLines(base.code);
    for (const block of candidates) {
        const code = withEnding(block.code, base.code);
        const lines = splitLines(code);
        // An almost empty file (a new one): any block in its language is the file.
        if (baseLines.filter((line) => line.trim()).length <= 3) return proposal("full", base.code, code);
        const ops = diffLines(baseLines, lines);
        if (!ops) continue;
        const kept = ops.filter((op) => op.kind === "same").length;
        if (kept / baseLines.length >= MIN_KEPT_SHARE && lines.length >= baseLines.length * 0.5) return proposal("full", base.code, code);
    }
    return null;
}

/** A short, stable fingerprint of a text (FNV-1a), to tell whether the file changed since the question. */
export function textFingerprint(text: string) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}
