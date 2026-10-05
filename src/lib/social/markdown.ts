/**
 * The Markdown of Hanogt Social messages, like Discord's: **bold**, *italic*
 * (or _italic_), __underline__, ~~strike~~, `code`, ||spoiler||, ```code
 * blocks```, "> " quotes (">>> " quotes the rest), "# " headings and "- " /
 * "1. " lists. The parser returns data, never HTML: the chat renders each
 * node as an element, so nothing in a message can become markup. Links,
 * @mentions and #topics are found later in the text nodes. Framework-free.
 */

export type MdInline =
    | { type: "text"; text: string }
    | { type: "code"; text: string }
    | { type: "bold" | "italic" | "underline" | "strike" | "spoiler"; children: MdInline[] };

export type MdBlock =
    | { type: "paragraph"; children: MdInline[] }
    | { type: "heading"; level: 1 | 2 | 3; children: MdInline[] }
    | { type: "list"; ordered: boolean; start: number; items: MdInline[][] }
    | { type: "code"; lang: string; text: string }
    | { type: "quote"; children: MdBlock[] };

/** Longer texts are not parsed at all (messages are at most 4000 characters). */
export const MARKDOWN_MAX_LENGTH = 8_000;
const MAX_DEPTH = 6;

const FENCE = /^```([A-Za-z0-9+#._-]{0,20})\s*$/;
const ONE_LINE_FENCE = /^```([\s\S]+?)```\s*$/;
const HEADING = /^(#{1,3}) (\S.*)$/;
const BULLET = /^[-*] (\S.*)$/;
const NUMBERED = /^(\d{1,4})[.)] (\S.*)$/;
const ESCAPABLE = new Set(["\\", "*", "_", "~", "|", "`", ">", "#", "-", "["]);
const WORD = /[\p{L}\p{N}]/u;
const URL_START = /^https?:\/\/[^\s<>"'`]+/i;

const isWord = (char: string | undefined) => Boolean(char && WORD.test(char));

/* -------------------------------------------------------------------------- */
/* Inline                                                                     */
/* -------------------------------------------------------------------------- */

type Delimiter = { marker: string; type: "bold" | "italic" | "underline" | "strike" | "spoiler" };

// Longer markers first: "**" before "*", "__" before "_".
const DELIMITERS: readonly Delimiter[] = [
    { marker: "||", type: "spoiler" },
    { marker: "**", type: "bold" },
    { marker: "__", type: "underline" },
    { marker: "~~", type: "strike" },
    { marker: "*", type: "italic" },
    { marker: "_", type: "italic" },
];

/** Where the run that opens at `from` closes, or -1. Escaped markers and code spans don't count. */
function findClosing(text: string, from: number, delimiter: Delimiter): number {
    const { marker } = delimiter;
    let index = from;
    while (index < text.length) {
        const char = text[index];
        if (char === "\\") {
            index += 2;
            continue;
        }
        if (char === "`") {
            // A code span hides its content from the other markers.
            const end = text.indexOf("`", index + 1);
            if (end > index + 1) {
                index = end + 1;
                continue;
            }
        }
        if (text.startsWith(marker, index)) {
            if (marker === "*" || marker === "_") {
                // A doubled marker is a different run ("**" inside "*…*").
                if (text[index + 1] === marker) {
                    const close = findClosing(text, index + 2, { marker: marker + marker, type: "bold" });
                    if (close > 0) {
                        index = close + 2;
                        continue;
                    }
                    index += 2;
                    continue;
                }
                const before = text[index - 1];
                if (before === " " || before === "\n" || before === "\t") {
                    index += 1;
                    continue;
                }
                // snake_case words keep their underscores.
                if (marker === "_" && isWord(text[index + 1])) {
                    index += 1;
                    continue;
                }
            }
            if (index > from) {
                // "**a *b***": the run of three closes the inner "*" first, then the "**".
                if (marker.length === 2 && text[index + 2] === marker[0]) return index + 1;
                return index;
            }
        }
        index += 1;
    }
    return -1;
}

function opensAt(text: string, index: number, delimiter: Delimiter) {
    if (!text.startsWith(delimiter.marker, index)) return false;
    const after = text[index + delimiter.marker.length];
    if (after === undefined || after === "\n") return false;
    if (delimiter.marker === "*" || delimiter.marker === "_") {
        if (after === " " || after === "\t" || after === delimiter.marker) return false;
        if (delimiter.marker === "_" && isWord(text[index - 1])) return false;
    }
    // No closing marker anywhere later: not a run (keeps long unmatched texts linear).
    return text.lastIndexOf(delimiter.marker) > index;
}

/** Inline Markdown of one block; text nodes are merged. */
export function parseInline(text: string, depth = 0): MdInline[] {
    if (!text) return [];
    if (depth > MAX_DEPTH) return [{ type: "text", text }];
    const nodes: MdInline[] = [];
    let buffer = "";
    const flush = () => {
        if (buffer) nodes.push({ type: "text", text: buffer });
        buffer = "";
    };
    let index = 0;
    while (index < text.length) {
        const char = text[index];
        if (char === "\\" && ESCAPABLE.has(text[index + 1] ?? "")) {
            buffer += text[index + 1];
            index += 2;
            continue;
        }
        // Links stay whole: markers inside an address are part of it.
        if ((char === "h" || char === "H") && !isWord(text[index - 1])) {
            const url = URL_START.exec(text.slice(index, index + 2_100));
            if (url) {
                buffer += url[0];
                index += url[0].length;
                continue;
            }
        }
        if (char === "`") {
            const double = text.startsWith("``", index);
            const marker = double ? "``" : "`";
            const end = text.indexOf(marker, index + marker.length);
            if (end > index + marker.length) {
                flush();
                nodes.push({ type: "code", text: text.slice(index + marker.length, end) });
                index = end + marker.length;
                continue;
            }
        }
        // ***both*** is bold and italic at once.
        if (text.startsWith("***", index) && text[index + 3] !== "*" && text[index + 3] !== " ") {
            const close = text.indexOf("***", index + 3);
            if (close > index + 3 && text[close - 1] !== " ") {
                flush();
                nodes.push({ type: "bold", children: [{ type: "italic", children: parseInline(text.slice(index + 3, close), depth + 2) }] });
                index = close + 3;
                continue;
            }
        }
        const delimiter = DELIMITERS.find((entry) => opensAt(text, index, entry));
        if (delimiter) {
            const start = index + delimiter.marker.length;
            const close = findClosing(text, start, delimiter);
            if (close > start) {
                const inner = text.slice(start, close);
                const trailing = inner[inner.length - 1];
                const loose = (delimiter.marker === "*" || delimiter.marker === "_") && (trailing === " " || trailing === "\t");
                if (!loose) {
                    flush();
                    nodes.push({ type: delimiter.type, children: parseInline(inner, depth + 1) });
                    index = close + delimiter.marker.length;
                    continue;
                }
            }
        }
        buffer += char;
        index += 1;
    }
    flush();
    return nodes;
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

const quoteLine = (line: string) => line === ">" || line.startsWith("> ");
const stripQuote = (line: string) => (line === ">" ? "" : line.slice(2));

function parseLines(lines: readonly string[], depth: number, quotes: boolean): MdBlock[] {
    const blocks: MdBlock[] = [];
    let paragraph: string[] = [];
    const flushParagraph = () => {
        // Blank lines at the edges of a paragraph are dropped; inside it they stay.
        while (paragraph.length && !paragraph[0].trim()) paragraph.shift();
        while (paragraph.length && !paragraph[paragraph.length - 1].trim()) paragraph.pop();
        if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n"), depth) });
        paragraph = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        const oneLine = ONE_LINE_FENCE.exec(line);
        if (oneLine && oneLine[1].trim()) {
            flushParagraph();
            blocks.push({ type: "code", lang: "", text: oneLine[1] });
            continue;
        }
        const fence = FENCE.exec(line);
        if (fence) {
            const close = lines.findIndex((entry, at) => at > index && entry.trimEnd() === "```");
            if (close > index) {
                flushParagraph();
                blocks.push({ type: "code", lang: fence[1].toLowerCase(), text: lines.slice(index + 1, close).join("\n") });
                index = close;
                continue;
            }
        }
        if (quotes && line.startsWith(">>> ")) {
            flushParagraph();
            const rest = [line.slice(4), ...lines.slice(index + 1)];
            blocks.push({ type: "quote", children: parseLines(rest, depth + 1, false) });
            break;
        }
        if (quotes && quoteLine(line)) {
            flushParagraph();
            const quoted: string[] = [];
            while (index < lines.length && quoteLine(lines[index])) {
                quoted.push(stripQuote(lines[index]));
                index += 1;
            }
            index -= 1;
            const children = parseLines(quoted, depth + 1, false);
            blocks.push({ type: "quote", children: children.length ? children : [{ type: "paragraph", children: [] }] });
            continue;
        }
        const heading = HEADING.exec(line);
        if (heading) {
            flushParagraph();
            blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2], depth) });
            continue;
        }
        const bullet = BULLET.exec(line);
        const numbered = bullet ? null : NUMBERED.exec(line);
        if (bullet || numbered) {
            flushParagraph();
            const ordered = Boolean(numbered);
            const items: MdInline[][] = [];
            const start = numbered ? Number(numbered[1]) : 1;
            while (index < lines.length) {
                const match = ordered ? NUMBERED.exec(lines[index]) : BULLET.exec(lines[index]);
                if (!match) break;
                items.push(parseInline(ordered ? match[2] : match[1], depth));
                index += 1;
            }
            index -= 1;
            blocks.push({ type: "list", ordered, start, items });
            continue;
        }
        paragraph.push(line);
    }
    flushParagraph();
    return blocks;
}

/** The blocks of a message. Very long texts come back as one plain paragraph. */
export function parseChatMarkdown(text: string): MdBlock[] {
    const normalized = text.replace(/\r\n?/g, "\n");
    if (!normalized.trim()) return [];
    if (normalized.length > MARKDOWN_MAX_LENGTH) return [{ type: "paragraph", children: [{ type: "text", text: normalized }] }];
    return parseLines(normalized.split("\n"), 0, true);
}

/** True when the text uses any Markdown (so plain messages can skip the parser). */
export function hasMarkdown(text: string) {
    return /[*_~`|\\]|^\s*(?:>|#{1,3} |[-*] |\d{1,4}[.)] )/m.test(text);
}

/** The text without Markdown markers (previews, notifications, search). Spoilers stay hidden. */
export function markdownToPlain(text: string, spoiler = "▒▒▒") {
    const inline = (nodes: readonly MdInline[]): string => nodes.map((node) => {
        if (node.type === "text" || node.type === "code") return node.text;
        if (node.type === "spoiler") return spoiler;
        return inline(node.children);
    }).join("");
    const block = (nodes: readonly MdBlock[]): string => nodes.map((node) => {
        if (node.type === "paragraph" || node.type === "heading") return inline(node.children);
        if (node.type === "code") return node.text;
        if (node.type === "list") return node.items.map((item, index) => `${node.ordered ? `${node.start + index}.` : "•"} ${inline(item)}`).join("\n");
        return block(node.children);
    }).join("\n");
    return block(parseChatMarkdown(text));
}
