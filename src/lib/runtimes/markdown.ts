/**
 * A small, safe Markdown → HTML renderer (CommonMark core + GitHub tables,
 * task lists, strikethrough and bare-URL autolinks). Dependency-free.
 *
 * Safety: all text is HTML-escaped; raw HTML is shown as text except a short
 * list of attribute-free formatting tags (<br>, <kbd>, <sub>, <details>…);
 * link and image URLs are restricted to safe schemes. The preview additionally
 * renders the result inside a sandboxed iframe without scripts.
 */

export interface MarkdownOptions {
    /** Adds id attributes to headings so #fragment links work (default true). */
    headingIds?: boolean;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Escapes text but keeps valid character references such as &copy; or &#8364;. */
function escapeText(text: string): string {
    return text.replace(/&(?!(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});)|[<>"]/g, (char) => ESCAPES[char]);
}

const SAFE_TAGS = /^<\/?(?:br|kbd|sub|sup|details|summary|b|i|em|strong|u|s|mark|small|del|ins|code)\s*\/?>$/i;

export function sanitizeUrl(url: string, kind: "link" | "image"): string | null {
    const trimmed = url.trim();
    if (!trimmed) return kind === "link" ? "" : null;
    // Browsers ignore control characters and whitespace inside a scheme ("java\nscript:").
    const compact = trimmed.replace(/[\u0000- \u007f]/g, "");
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1]?.toLowerCase();
    if (!scheme) {
        if (compact.startsWith("//")) return `https:${compact}`;
        // Relative images have no file to load inside the preview.
        return kind === "image" ? null : trimmed;
    }
    if (kind === "image") {
        if (scheme === "http" || scheme === "https") return trimmed;
        return /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(compact) ? compact : null;
    }
    return ["http", "https", "mailto", "tel"].includes(scheme) ? trimmed : null;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/<[^>]*>/g, "")
        .replace(/&[a-z0-9#]+;/gi, "")
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .trim()
        .replace(/\s+/g, "-");
}

type LinkDefinition = { url: string; title?: string };

class Renderer {
    private readonly definitions = new Map<string, LinkDefinition>();
    private readonly usedIds = new Map<string, number>();
    private readonly options: MarkdownOptions;

    constructor(options: MarkdownOptions) {
        this.options = options;
    }

    render(source: string): string {
        const lines = source.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
        this.collectDefinitions(lines);
        return this.blocks(lines);
    }

    // ------------------------------------------------------------------ blocks
    private collectDefinitions(lines: string[]) {
        let inFence = false;
        for (let index = 0; index < lines.length; index += 1) {
            if (/^ {0,3}(`{3,}|~{3,})/.test(lines[index])) inFence = !inFence;
            if (inFence) continue;
            const match = /^ {0,3}\[([^\]]{1,999})\]:\s*<?([^\s>]+)>?(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/.exec(lines[index]);
            if (!match) continue;
            const label = match[1].trim().toLowerCase().replace(/\s+/g, " ");
            if (!this.definitions.has(label)) this.definitions.set(label, { url: match[2], title: match[3] ?? match[4] ?? match[5] });
            // The definition line itself renders as nothing (a blank separator).
            lines[index] = "";
        }
    }

    private blocks(lines: string[]): string {
        const html: string[] = [];
        let index = 0;
        while (index < lines.length) {
            const line = lines[index];
            if (!line.trim()) {
                index += 1;
                continue;
            }
            const fence = /^( {0,3})(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/.exec(line);
            if (fence) {
                const [, indent, marker, info] = fence;
                const body: string[] = [];
                index += 1;
                while (index < lines.length && !new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(lines[index])) {
                    body.push(lines[index].startsWith(indent) ? lines[index].slice(indent.length) : lines[index].trimStart());
                    index += 1;
                }
                index += 1;
                const language = info ? ` class="language-${escapeHtml(info.toLowerCase())}"` : "";
                html.push(`<pre><code${language}>${escapeHtml(body.join("\n"))}${body.length ? "\n" : ""}</code></pre>`);
                continue;
            }
            const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
            if (heading) {
                html.push(this.heading(heading[1].length, heading[2] ?? ""));
                index += 1;
                continue;
            }
            if (isThematicBreak(line)) {
                html.push("<hr>");
                index += 1;
                continue;
            }
            if (/^ {0,3}>/.test(line)) {
                const quoted: string[] = [];
                while (index < lines.length && lines[index].trim()) {
                    const current = lines[index];
                    if (/^ {0,3}>/.test(current)) quoted.push(current.replace(/^ {0,3}> ?/, ""));
                    else if (quoted.length && !startsBlock(current)) quoted.push(current);
                    else break;
                    index += 1;
                }
                html.push(`<blockquote>\n${this.blocks(quoted)}\n</blockquote>`);
                continue;
            }
            if (listMarker(line)) {
                const result = this.list(lines, index);
                html.push(result.html);
                index = result.next;
                continue;
            }
            if (/^ {4,}\S/.test(line)) {
                const body: string[] = [];
                while (index < lines.length && (/^ {4,}/.test(lines[index]) || !lines[index].trim())) {
                    body.push(lines[index].slice(Math.min(4, lines[index].length)));
                    index += 1;
                }
                while (body.length && !body[body.length - 1].trim()) body.pop();
                html.push(`<pre><code>${escapeHtml(body.join("\n"))}\n</code></pre>`);
                continue;
            }
            if (line.includes("|") && index + 1 < lines.length && isTableDelimiter(lines[index + 1])) {
                const result = this.table(lines, index);
                if (result) {
                    html.push(result.html);
                    index = result.next;
                    continue;
                }
            }
            // Paragraph (with setext heading detection).
            const paragraph: string[] = [];
            while (index < lines.length && lines[index].trim()) {
                const current = lines[index];
                if (paragraph.length && /^ {0,3}=+\s*$/.test(current)) {
                    html.push(this.heading(1, paragraph.join("\n")));
                    paragraph.length = 0;
                    index += 1;
                    break;
                }
                if (paragraph.length && /^ {0,3}-+\s*$/.test(current)) {
                    html.push(this.heading(2, paragraph.join("\n")));
                    paragraph.length = 0;
                    index += 1;
                    break;
                }
                if (paragraph.length && startsBlock(current)) break;
                paragraph.push(current);
                index += 1;
            }
            if (paragraph.length) html.push(`<p>${this.inline(paragraph.map((part) => part.replace(/^ {1,3}/, "")).join("\n"))}</p>`);
        }
        return html.join("\n");
    }

    private heading(level: number, text: string): string {
        const content = this.inline(text.trim());
        if (this.options.headingIds === false) return `<h${level}>${content}</h${level}>`;
        const base = slugify(content) || "section";
        const count = this.usedIds.get(base) ?? 0;
        this.usedIds.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        return `<h${level} id="${escapeHtml(id)}">${content}</h${level}>`;
    }

    private list(lines: string[], start: number): { html: string; next: number } {
        const first = listMarker(lines[start])!;
        const ordered = first.ordered;
        const items: Array<{ lines: string[]; blankInside: boolean }> = [];
        let index = start;
        let loose = false;
        while (index < lines.length) {
            const marker = listMarker(lines[index]);
            if (!marker || marker.ordered !== ordered || marker.symbol !== first.symbol || marker.indent > first.indent + 3) break;
            const contentIndent = marker.contentIndent;
            const itemLines = [marker.content];
            let blankInside = false;
            index += 1;
            while (index < lines.length) {
                const current = lines[index];
                if (!current.trim()) {
                    // A blank line continues the item only when indented content follows.
                    let lookahead = index + 1;
                    while (lookahead < lines.length && !lines[lookahead].trim()) lookahead += 1;
                    if (lookahead < lines.length && indentation(lines[lookahead]) >= contentIndent) {
                        for (; index < lookahead; index += 1) itemLines.push("");
                        blankInside = true;
                        continue;
                    }
                    break;
                }
                if (indentation(current) >= contentIndent) {
                    itemLines.push(current.slice(contentIndent));
                    index += 1;
                    continue;
                }
                const nextMarker = listMarker(current);
                if (nextMarker) break;
                if (!startsBlock(current) && itemLines[itemLines.length - 1]?.trim()) {
                    itemLines.push(current.trim());
                    index += 1;
                    continue;
                }
                break;
            }
            items.push({ lines: itemLines, blankInside });
            // A blank line between items makes the list loose.
            let lookahead = index;
            while (lookahead < lines.length && !lines[lookahead].trim()) lookahead += 1;
            const nextMarker = lookahead < lines.length ? listMarker(lines[lookahead]) : null;
            const continues = nextMarker && nextMarker.ordered === ordered && nextMarker.symbol === first.symbol && nextMarker.indent <= first.indent + 3;
            if (continues && lookahead > index) loose = true;
            if (!continues) break;
            index = lookahead;
        }
        if (items.some((item) => item.blankInside && item.lines.filter((line) => line.trim()).length > 1)) loose = true;
        const tag = ordered ? "ol" : "ul";
        const startAttribute = ordered && first.number !== 1 ? ` start="${first.number}"` : "";
        const rendered = items.map((item) => {
            let lines = item.lines;
            let task = "";
            const checkbox = /^\[([ xX])\]\s+/.exec(lines[0] ?? "");
            if (checkbox && !ordered) {
                task = `<input type="checkbox" disabled${checkbox[1] === " " ? "" : " checked"}> `;
                lines = [lines[0].slice(checkbox[0].length), ...lines.slice(1)];
            }
            let body = this.blocks(lines);
            if (!loose) body = body.replace(/^<p>([\s\S]*?)<\/p>/, "$1").replace(/\n<p>([\s\S]*?)<\/p>/g, "\n$1");
            return `<li${task ? " class=\"task-list-item\"" : ""}>${task}${body}</li>`;
        });
        return { html: `<${tag}${startAttribute}${items.some((item) => /^\[[ xX]\]\s/.test(item.lines[0] ?? "")) && !ordered ? " class=\"contains-task-list\"" : ""}>\n${rendered.join("\n")}\n</${tag}>`, next: index };
    }

    private table(lines: string[], start: number): { html: string; next: number } | null {
        const header = splitRow(lines[start]);
        const alignments = splitRow(lines[start + 1]).map((cell) => {
            const left = cell.startsWith(":");
            const right = cell.endsWith(":");
            return left && right ? "center" : right ? "right" : left ? "left" : "";
        });
        if (!header.length || header.length !== alignments.length) return null;
        const cell = (tag: "th" | "td", text: string, column: number) => {
            const align = alignments[column] ? ` class="align-${alignments[column]}"` : "";
            return `<${tag}${align}>${this.inline(text)}</${tag}>`;
        };
        const rows: string[] = [];
        let index = start + 2;
        while (index < lines.length && lines[index].trim() && lines[index].includes("|") && !startsBlock(lines[index])) {
            const cells = splitRow(lines[index]);
            rows.push(`<tr>${header.map((_, column) => cell("td", cells[column] ?? "", column)).join("")}</tr>`);
            index += 1;
        }
        const head = `<thead><tr>${header.map((text, column) => cell("th", text, column)).join("")}</tr></thead>`;
        return { html: `<table>${head}${rows.length ? `<tbody>${rows.join("")}</tbody>` : ""}</table>`, next: index };
    }

    // ------------------------------------------------------------------ inline
    inline(text: string): string {
        const stash: string[] = [];
        const keep = (html: string) => `\u0000${stash.push(html) - 1}\u0000`;
        let output = "";
        let index = 0;
        while (index < text.length) {
            const char = text[index];
            if (char === "\\" && index + 1 < text.length) {
                const next = text[index + 1];
                if (next === "\n") {
                    output += keep("<br>\n");
                    index += 2;
                    continue;
                }
                if (/[!-/:-@[-`{-~]/.test(next)) {
                    output += keep(escapeHtml(next));
                    index += 2;
                    continue;
                }
            }
            if (char === "`") {
                const run = /^`+/.exec(text.slice(index))![0];
                const close = text.indexOf(run, index + run.length);
                let end = close;
                // The closing run must have exactly the same length.
                while (end >= 0 && text[end + run.length] === "`") end = text.indexOf(run, end + run.length + 1);
                if (end >= 0) {
                    let code = text.slice(index + run.length, end).replace(/\n/g, " ");
                    if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
                    output += keep(`<code>${escapeHtml(code)}</code>`);
                    index = end + run.length;
                    continue;
                }
                output += keep(escapeHtml(run));
                index += run.length;
                continue;
            }
            if (char === "<") {
                const autolink = /^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/.exec(text.slice(index));
                if (autolink) {
                    const url = sanitizeUrl(autolink[1], "link");
                    output += keep(url ? this.anchor(url, escapeHtml(autolink[1])) : escapeHtml(autolink[0]));
                    index += autolink[0].length;
                    continue;
                }
                const email = /^<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/.exec(text.slice(index));
                if (email) {
                    output += keep(this.anchor(`mailto:${email[1]}`, escapeHtml(email[1])));
                    index += email[0].length;
                    continue;
                }
                const tag = /^<\/?[a-zA-Z][^<>]*>/.exec(text.slice(index));
                if (tag && SAFE_TAGS.test(tag[0])) {
                    output += keep(tag[0].toLowerCase().replace(/\s+/g, "").replace("/>", ">"));
                    index += tag[0].length;
                    continue;
                }
            }
            if (char === "!" && text[index + 1] === "[") {
                const image = this.linkAt(text, index + 1);
                if (image) {
                    const url = image.url === null ? null : sanitizeUrl(image.url, "image");
                    const alt = escapeHtml(stripMarkup(image.label));
                    output += keep(url ? `<img src="${escapeHtml(url)}" alt="${alt}"${image.title ? ` title="${escapeHtml(image.title)}"` : ""} loading="lazy">` : alt);
                    index = image.end;
                    continue;
                }
            }
            if (char === "[") {
                const link = this.linkAt(text, index);
                if (link) {
                    const label = this.inline(link.label);
                    const url = link.url === null ? null : sanitizeUrl(link.url, "link");
                    output += keep(url === null ? label : this.anchor(url, label, link.title));
                    index = link.end;
                    continue;
                }
            }
            output += char;
            index += 1;
        }
        let html = escapeText(output);
        html = html
            .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>")
            .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, "$1<strong>$2</strong>")
            .replace(/\*(?=[^\s*])([\s\S]*?[^\s*])\*/g, "<em>$1</em>")
            .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>")
            .replace(/(^|[\s(])((?:https?:\/\/|www\.)(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<\u0000])*[^\s<\u0000.,:;"')\]!?*_~&])/g, (match, before: string, url: string) => {
                const href = url.startsWith("www.") ? `https://${url}` : url;
                return `${before}${this.anchor(href.replace(/&amp;/g, "&"), url)}`;
            })
            .replace(/ {2,}\n/g, "<br>\n");
        // Stashed pieces may themselves contain stashes (link labels).
        for (let pass = 0; pass < 5 && html.includes("\u0000"); pass += 1) {
            html = html.replace(/\u0000(\d+)\u0000/g, (_, position: string) => stash[Number(position)] ?? "");
        }
        return html;
    }

    private anchor(url: string, label: string, title?: string): string {
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
        if (url.startsWith("#")) return `<a href="${escapeHtml(url)}"${titleAttribute}>${label}</a>`;
        if (/^(?:https?:|mailto:|tel:)/i.test(url)) {
            return `<a href="${escapeHtml(url)}"${titleAttribute} target="_blank" rel="noopener noreferrer">${label}</a>`;
        }
        // Relative links have no file system to point at inside the preview.
        return `<a class="relative-link" title="${escapeHtml(title ?? url)}">${label}</a>`;
    }

    /** Parses [label](url "title"), [label][ref], [label][] and [label] at `start`. */
    private linkAt(text: string, start: number): { label: string; url: string | null; title?: string; end: number } | null {
        let depth = 0;
        let close = -1;
        for (let index = start; index < text.length; index += 1) {
            const char = text[index];
            if (char === "\\") {
                index += 1;
                continue;
            }
            if (char === "`") {
                const run = /^`+/.exec(text.slice(index))![0];
                const end = text.indexOf(run, index + run.length);
                if (end >= 0) index = end + run.length - 1;
                continue;
            }
            if (char === "[") depth += 1;
            else if (char === "]") {
                depth -= 1;
                if (depth === 0) {
                    close = index;
                    break;
                }
            }
        }
        if (close < 0) return null;
        const label = text.slice(start + 1, close);
        if (text[close + 1] === "(") {
            let index = close + 2;
            while (text[index] === " " || text[index] === "\n") index += 1;
            let url = "";
            if (text[index] === "<") {
                const end = text.indexOf(">", index);
                if (end < 0) return null;
                url = text.slice(index + 1, end);
                index = end + 1;
            } else {
                let parens = 0;
                while (index < text.length) {
                    const char = text[index];
                    if (char === "\\" && index + 1 < text.length) {
                        url += text[index + 1];
                        index += 2;
                        continue;
                    }
                    if (/\s/.test(char)) break;
                    if (char === "(") parens += 1;
                    if (char === ")") {
                        if (parens === 0) break;
                        parens -= 1;
                    }
                    url += char;
                    index += 1;
                }
            }
            while (text[index] === " " || text[index] === "\n") index += 1;
            let title: string | undefined;
            const quote = text[index];
            if (quote === "\"" || quote === "'" || quote === "(") {
                const closing = quote === "(" ? ")" : quote;
                const end = text.indexOf(closing, index + 1);
                if (end < 0) return null;
                title = text.slice(index + 1, end);
                index = end + 1;
                while (text[index] === " " || text[index] === "\n") index += 1;
            }
            if (text[index] !== ")") return null;
            return { label, url, title, end: index + 1 };
        }
        const reference = /^\[([^\]]*)\]/.exec(text.slice(close + 1));
        const key = (reference && reference[1].trim() ? reference[1] : label).trim().toLowerCase().replace(/\s+/g, " ");
        const definition = this.definitions.get(key);
        if (!definition) return null;
        return { label, url: definition.url, title: definition.title, end: close + 1 + (reference ? reference[0].length : 0) };
    }
}

function indentation(line: string) {
    return /^ */.exec(line)![0].length;
}

function isThematicBreak(line: string) {
    return /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line);
}

function listMarker(line: string): { ordered: boolean; symbol: string; number: number; indent: number; contentIndent: number; content: string } | null {
    if (isThematicBreak(line)) return null;
    const match = /^( {0,3})([-*+]|(\d{1,9})([.)]))( {1,4}|$)(.*)$/.exec(line);
    if (!match) return null;
    const [, indent, marker, digits, delimiter, spacing, content] = match;
    const ordered = digits !== undefined;
    return {
        ordered,
        symbol: ordered ? delimiter : marker,
        number: ordered ? Number(digits) : 1,
        indent: indent.length,
        contentIndent: indent.length + marker.length + Math.max(1, spacing.length),
        content,
    };
}

function startsBlock(line: string) {
    return /^ {0,3}(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,})/.test(line) || isThematicBreak(line) || Boolean(listMarker(line) && listMarker(line)!.content.trim());
}

function isTableDelimiter(line: string) {
    return /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes("-");
}

function splitRow(line: string): string[] {
    let text = line.trim();
    if (text.startsWith("|")) text = text.slice(1);
    if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
    const cells: string[] = [];
    let current = "";
    let inCode = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === "\\" && text[index + 1] === "|") {
            current += "|";
            index += 1;
            continue;
        }
        if (char === "`") inCode = !inCode;
        if (char === "|" && !inCode) {
            cells.push(current.trim());
            current = "";
            continue;
        }
        current += char;
    }
    cells.push(current.trim());
    return cells;
}

function stripMarkup(text: string) {
    return text.replace(/[*_~`]/g, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/** Renders Markdown to an HTML fragment that is safe to show in a sandboxed frame. */
export function renderMarkdown(source: string, options: MarkdownOptions = {}): string {
    return new Renderer(options).render(source.length > 2_000_000 ? source.slice(0, 2_000_000) : source);
}
