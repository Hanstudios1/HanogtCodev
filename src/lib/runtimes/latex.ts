/**
 * Converts a LaTeX document into HTML for the live preview (dependency-free).
 *
 * Text structure is converted here: sections (numbered, with \tableofcontents),
 * \title/\author/\date with \maketitle, paragraphs, itemize/enumerate/description,
 * tabular, quote, center, verbatim, abstract, theorem-like environments and
 * proofs, footnotes, \textbf/\emph/\texttt/\underline/\href…, accents (\c{c},
 * \u{g}, \"o, \i …), dashes and quotes. Math is NOT rendered here: every
 * formula becomes a placeholder element (class "hanogt-math" with its TeX
 * source as text, display mode and source line) that KaTeX renders inside the
 * sandboxed preview frame. \newcommand, \def and \DeclareMathOperator
 * definitions are collected as KaTeX macros.
 *
 * A file without any LaTeX structure but with math commands (e.g. just
 * "E = mc^2" or "\frac{a}{b}") is treated as a list of display formulas,
 * one per paragraph. Unsupported commands are rendered as their arguments
 * and reported in `warnings`.
 */

export interface LatexRender {
    html: string;
    /** KaTeX macros from \newcommand, \def and \DeclareMathOperator. */
    macros: Record<string, string>;
    /** Unsupported commands and environments (without the backslash). */
    warnings: string[];
    title: string | null;
    /** Number of formulas in the document. */
    formulas: number;
}

export interface LatexOptions {
    locale?: "tr" | "en";
    today?: Date;
}

const DISPLAY_ENVIRONMENTS = new Set([
    "equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*", "eqnarray", "eqnarray*",
    "displaymath", "flalign", "flalign*", "alignat", "alignat*", "split", "CD",
]);
const THEOREMS = new Set(["theorem", "lemma", "proposition", "corollary", "definition", "example", "remark", "note", "exercise", "solution", "claim", "conjecture", "problem"]);
const VERBATIM = new Set(["verbatim", "verbatim*", "lstlisting", "minted", "Verbatim", "code"]);
const IGNORED_COMMANDS = new Set([
    "documentclass", "usepackage", "RequirePackage", "pagestyle", "thispagestyle", "setlength", "setcounter", "addtolength", "geometry",
    "hypersetup", "graphicspath", "newtheorem", "theoremstyle", "bibliographystyle", "bibliography", "nocite", "pagenumbering", "linespread",
    "vspace", "vspace*", "hspace", "hspace*", "vfill", "hfill", "smallskip", "medskip", "bigskip", "noindent", "indent", "centering",
    "raggedright", "raggedleft", "label", "index", "newpage", "clearpage", "cleardoublepage", "pagebreak", "linebreak", "nopagebreak",
    "protect", "phantom", "selectlanguage", "frenchspacing", "sloppy", "fussy", "normalsize", "small", "footnotesize", "scriptsize",
    "tiny", "large", "Large", "LARGE", "huge", "Huge", "normalfont", "rmfamily", "sffamily", "ttfamily", "mdseries", "upshape", "maketitle",
]);
const TEXT_SYMBOLS: Record<string, string> = {
    LaTeX: "L<sup class=\"latex-a\">A</sup>T<sub class=\"latex-e\">E</sub>X", TeX: "T<sub class=\"latex-e\">E</sub>X", LaTeXe: "L<sup class=\"latex-a\">A</sup>T<sub class=\"latex-e\">E</sub>X 2<sub>ε</sub>",
    ldots: "…", dots: "…", textellipsis: "…", textbackslash: "\\", textasciitilde: "~", textasciicircum: "^", textbar: "|",
    textless: "&lt;", textgreater: "&gt;", textbullet: "•", textdegree: "°", copyright: "©", textcopyright: "©", textregistered: "®",
    texttrademark: "™", euro: "€", pounds: "£", S: "§", P: "¶", dag: "†", ddag: "‡", quad: " ", qquad: "  ",
    i: "ı", j: "ȷ", ss: "ß", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", o: "ø", O: "Ø", aa: "å", AA: "Å", l: "ł", L: "Ł",
    textendash: "–", textemdash: "—", textquoteleft: "‘", textquoteright: "’", textquotedblleft: "“", textquotedblright: "”",
    slash: "/", enspace: " ", thinspace: " ", newline: "<br>", par: "",
};
const ACCENTS: Record<string, string> = { "\"": "̈", "'": "́", "`": "̀", "^": "̂", "~": "̃", "=": "̄", ".": "̇", u: "̆", v: "̌", H: "̋", c: "̧", k: "̨", r: "̊", d: "̣", b: "̱" };
const STYLE_COMMANDS: Record<string, [string, string]> = {
    textbf: ["<strong>", "</strong>"], textit: ["<em>", "</em>"], emph: ["<em>", "</em>"], textsl: ["<em>", "</em>"],
    texttt: ["<code>", "</code>"], underline: ["<u>", "</u>"], uline: ["<u>", "</u>"], textsc: ["<span class=\"sc\">", "</span>"],
    textsf: ["<span class=\"sf\">", "</span>"], textrm: ["<span>", "</span>"], textup: ["<span>", "</span>"], textnormal: ["<span>", "</span>"],
    mbox: ["<span>", "</span>"], fbox: ["<span class=\"fbox\">", "</span>"], textsuperscript: ["<sup>", "</sup>"], textsubscript: ["<sub>", "</sub>"],
    sout: ["<s>", "</s>"], st: ["<s>", "</s>"],
};
const DECLARATIONS: Record<string, [string, string]> = {
    bfseries: ["<strong>", "</strong>"], bf: ["<strong>", "</strong>"], itshape: ["<em>", "</em>"], it: ["<em>", "</em>"], em: ["<em>", "</em>"],
    slshape: ["<em>", "</em>"], sl: ["<em>", "</em>"], ttfamily: ["<code>", "</code>"], tt: ["<code>", "</code>"], scshape: ["<span class=\"sc\">", "</span>"],
    sc: ["<span class=\"sc\">", "</span>"], large: ["<span class=\"size-large\">", "</span>"], Large: ["<span class=\"size-Large\">", "</span>"],
    LARGE: ["<span class=\"size-LARGE\">", "</span>"], huge: ["<span class=\"size-huge\">", "</span>"], Huge: ["<span class=\"size-huge\">", "</span>"],
    small: ["<span class=\"size-small\">", "</span>"], footnotesize: ["<span class=\"size-small\">", "</span>"], scriptsize: ["<span class=\"size-tiny\">", "</span>"],
    tiny: ["<span class=\"size-tiny\">", "</span>"],
};
const SECTION_LEVELS: Record<string, number> = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5, subparagraph: 6 };
const TEXT_STRUCTURE = /\\(?:section|subsection|subsubsection|chapter|part|title|maketitle|textbf|textit|emph|item|paragraph|begin\{document\}|tableofcontents)\b/;

const LABELS = {
    tr: { abstract: "Özet", proof: "Kanıt", contents: "İçindekiler", theorem: "Teorem", lemma: "Lemma", proposition: "Önerme", corollary: "Sonuç", definition: "Tanım", example: "Örnek", remark: "Not", note: "Not", exercise: "Alıştırma", solution: "Çözüm", claim: "İddia", conjecture: "Sanı", problem: "Problem", image: "Görsel", references: "Kaynaklar" },
    en: { abstract: "Abstract", proof: "Proof", contents: "Contents", theorem: "Theorem", lemma: "Lemma", proposition: "Proposition", corollary: "Corollary", definition: "Definition", example: "Example", remark: "Remark", note: "Note", exercise: "Exercise", solution: "Solution", claim: "Claim", conjecture: "Conjecture", problem: "Problem", image: "Image", references: "References" },
};

/** `\author{Ada \and Linus}` comes out as "Ada ,  Linus"; tidy it to "Ada, Linus". */
function authorList(html: string): string {
    return html.replace(/(\s*,)+\s*/g, ", ").replace(/^, |, $/g, "").trim();
}

export function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Replaces % comments with spaces (offsets and line numbers stay the same). */
function stripComments(source: string): string {
    return source.replace(/(^|[^\\])((?:\\\\)*)%[^\n]*/g, (match, before: string, slashes: string) => `${before}${slashes}${" ".repeat(match.length - before.length - slashes.length)}`);
}

class Converter {
    src: string;
    readonly locale: "tr" | "en";
    readonly today: Date;
    private readonly lineStarts: number[] = [0];
    readonly warnings = new Set<string>();
    readonly macros: Record<string, string> = {};
    private readonly footnotes: string[] = [];
    private readonly sections: Array<{ id: string; level: number; html: string; number: string }> = [];
    private readonly counters = [0, 0, 0, 0, 0, 0, 0];
    private readonly theoremCounters = new Map<string, number>();
    private hasChapters = false;
    meta: { title: string | null; author: string | null; date: string | null } = { title: null, author: null, date: null };
    formulas = 0;

    constructor(source: string, options: LatexOptions) {
        this.src = stripComments(source.replace(/\r\n?/g, "\n"));
        this.locale = options.locale === "tr" ? "tr" : "en";
        this.today = options.today ?? new Date();
        for (let index = 0; index < this.src.length; index += 1) if (this.src[index] === "\n") this.lineStarts.push(index + 1);
        this.hasChapters = /\\chapter\b/.test(this.src);
    }

    lineOf(offset: number) {
        let low = 0;
        let high = this.lineStarts.length - 1;
        while (low < high) {
            const middle = (low + high + 1) >> 1;
            if (this.lineStarts[middle] <= offset) low = middle;
            else high = middle - 1;
        }
        return low + 1;
    }

    // ---------------------------------------------------------------- scanning
    /** Index of the brace that closes the one at `open` (or the end of the source). */
    matchBrace(open: number, end = this.src.length, openChar = "{", closeChar = "}") {
        let depth = 0;
        for (let index = open; index < end; index += 1) {
            const char = this.src[index];
            if (char === "\\") {
                index += 1;
                continue;
            }
            if (char === openChar) depth += 1;
            else if (char === closeChar) {
                depth -= 1;
                if (depth === 0) return index;
            }
        }
        return end;
    }

    skipSpaces(position: number, end: number) {
        let index = position;
        while (index < end && /[ \t\n]/.test(this.src[index]) && !(this.src[index] === "\n" && this.src[index + 1] === "\n")) index += 1;
        return index;
    }

    /** A mandatory argument: {group} or a single token. Returns its inner range and the position after it. */
    readArg(position: number, end: number): { start: number; end: number; next: number } | null {
        const index = this.skipSpaces(position, end);
        if (index >= end) return null;
        if (this.src[index] === "{") {
            const close = this.matchBrace(index, end);
            return { start: index + 1, end: close, next: Math.min(end, close + 1) };
        }
        if (this.src[index] === "\\") {
            const name = /^\\(?:[A-Za-z]+|.)/.exec(this.src.slice(index, index + 40))?.[0] ?? "\\";
            return { start: index, end: index + name.length, next: index + name.length };
        }
        if (this.src[index] === "}") return null;
        return { start: index, end: index + 1, next: index + 1 };
    }

    readOptional(position: number, end: number): { start: number; end: number; next: number } | null {
        const index = this.skipSpaces(position, end);
        if (this.src[index] !== "[") return null;
        const close = this.matchBrace(index, end, "[", "]");
        return { start: index + 1, end: close, next: Math.min(end, close + 1) };
    }

    text(range: { start: number; end: number }) {
        return this.src.slice(range.start, range.end);
    }

    /** Position of the \end{name} that closes the environment whose body starts at `from`. */
    findEnd(name: string, from: number, end: number): { bodyEnd: number; next: number } {
        const escaped = name.replace(/[*]/g, "\\*");
        const pattern = new RegExp(`\\\\(begin|end)\\s*\\{${escaped}\\}`, "g");
        pattern.lastIndex = from;
        let depth = 1;
        for (let match = pattern.exec(this.src); match && match.index < end; match = pattern.exec(this.src)) {
            depth += match[1] === "begin" ? 1 : -1;
            if (depth === 0) return { bodyEnd: match.index, next: match.index + match[0].length };
        }
        return { bodyEnd: end, next: end };
    }

    math(tex: string, display: boolean, offset: number) {
        this.formulas += 1;
        const cleaned = tex.replace(/\\label\s*\{[^}]*\}/g, "").replace(/\\nonumber\b|\\notag\b/g, "\\nonumber");
        const node = `<span class="hanogt-math" data-display="${display ? 1 : 0}" data-line="${this.lineOf(offset)}">${escapeHtml(cleaned)}</span>`;
        return display ? `<div class="math-block">${node}</div>` : node;
    }

    // ---------------------------------------------------------------- definitions
    /** Collects \newcommand / \def / \DeclareMathOperator definitions and blanks them. */
    collectDefinitions(start: number, end: number): Array<[number, number]> {
        const removed: Array<[number, number]> = [];
        const pattern = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator\*?|def)\b\*?/g;
        pattern.lastIndex = start;
        for (let match = pattern.exec(this.src); match && match.index < end; match = pattern.exec(this.src)) {
            let position = match.index + match[0].length;
            let name: string | null = null;
            if (match[1] === "def") {
                const def = /^\s*(\\[A-Za-z]+)([^{]*)/.exec(this.src.slice(position, position + 80));
                if (!def) continue;
                name = def[1];
                position += def[0].length;
                const body = this.readArg(position, end);
                if (!body) continue;
                // \def\foo#1#2{…}: parameters are positional, like \newcommand.
                this.macros[name] = this.text(body);
                removed.push([match.index, body.next]);
                pattern.lastIndex = body.next;
                continue;
            }
            const nameArg = this.readArg(position, end);
            if (!nameArg) continue;
            name = this.text(nameArg).trim();
            position = nameArg.next;
            if (match[1].startsWith("DeclareMathOperator")) {
                const body = this.readArg(position, end);
                if (!body) continue;
                this.macros[name] = match[1].endsWith("*") ? `\\operatorname*{${this.text(body)}}` : `\\operatorname{${this.text(body)}}`;
                removed.push([match.index, body.next]);
                pattern.lastIndex = body.next;
                continue;
            }
            const count = this.readOptional(position, end);
            if (count) position = count.next;
            const defaultValue = count ? this.readOptional(position, end) : null;
            if (defaultValue) position = defaultValue.next;
            const body = this.readArg(position, end);
            if (!body || !name.startsWith("\\")) continue;
            this.macros[name] = this.text(body);
            removed.push([match.index, body.next]);
            pattern.lastIndex = body.next;
        }
        return removed;
    }

    // ---------------------------------------------------------------- blocks
    blocks(start: number, end: number): string {
        const out: string[] = [];
        let paragraph: Array<[number, number]> = [];
        let paragraphStart = -1;
        const flush = (until: number) => {
            if (paragraphStart >= 0) paragraph.push([paragraphStart, until]);
            paragraphStart = -1;
            const html = paragraph.map(([from, to]) => this.inline(from, to)).join("").trim();
            if (html) out.push(`<p>${html}</p>`);
            paragraph = [];
        };
        let index = start;
        while (index < end) {
            const char = this.src[index];
            if (char === "\n" && /^\n[ \t]*\n/.test(this.src.slice(index, index + 40))) {
                flush(index);
                index += 1;
                while (index < end && /[ \t\n]/.test(this.src[index])) index += 1;
                continue;
            }
            if (char === "$" && this.src[index + 1] === "$") {
                const close = this.src.indexOf("$$", index + 2);
                const stop = close < 0 || close >= end ? end : close;
                flush(index);
                out.push(this.math(this.src.slice(index + 2, stop), true, index + 2));
                index = Math.min(end, stop + 2);
                continue;
            }
            if (char === "\\") {
                const command = /^\\([A-Za-z]+\*?|.)/.exec(this.src.slice(index, index + 40))?.[1] ?? "";
                if (command === "[") {
                    const close = this.src.indexOf("\\]", index + 2);
                    const stop = close < 0 || close >= end ? end : close;
                    flush(index);
                    out.push(this.math(this.src.slice(index + 2, stop), true, index + 2));
                    index = Math.min(end, stop + 2);
                    continue;
                }
                if (command === "begin") {
                    const nameArg = this.readArg(index + 6, end);
                    const name = nameArg ? this.text(nameArg).trim() : "";
                    if (nameArg && this.isBlockEnvironment(name)) {
                        flush(index);
                        const { bodyEnd, next } = this.findEnd(name, nameArg.next, end);
                        out.push(this.environment(name, nameArg.next, bodyEnd, index));
                        index = next;
                        continue;
                    }
                }
                const sectionName = command.replace(/\*$/, "");
                if (SECTION_LEVELS[sectionName] !== undefined) {
                    flush(index);
                    const starred = command.endsWith("*");
                    let position = index + 1 + command.length;
                    const optional = this.readOptional(position, end);
                    if (optional) position = optional.next;
                    const title = this.readArg(position, end);
                    if (title) {
                        out.push(this.heading(sectionName, starred, this.inline(title.start, title.end)));
                        index = title.next;
                        continue;
                    }
                }
                if (command === "maketitle") {
                    flush(index);
                    out.push(this.titleBlock());
                    index += 10;
                    continue;
                }
                if (command === "tableofcontents") {
                    flush(index);
                    out.push("<!--hanogt-toc-->");
                    index += 16;
                    continue;
                }
                if (command === "title" || command === "author" || command === "date") {
                    const arg = this.readArg(index + 1 + command.length, end);
                    if (arg) {
                        this.meta[command] = command === "author" ? authorList(this.inline(arg.start, arg.end)) : this.inline(arg.start, arg.end);
                        index = arg.next;
                        continue;
                    }
                }
                if (command === "newpage" || command === "clearpage" || command === "hrule" || command === "hline") {
                    flush(index);
                    if (command === "hrule") out.push("<hr>");
                    index += 1 + command.length;
                    continue;
                }
            }
            if (paragraphStart < 0) paragraphStart = index;
            // Advance over an inline construct so block markers inside it are ignored.
            if (char === "$") {
                const close = this.findInlineDollar(index + 1, end);
                index = close < 0 ? end : close + 1;
                continue;
            }
            if (char === "\\") {
                const begin = /^\\begin\s*\{([^}]*)\}/.exec(this.src.slice(index, index + 60));
                if (begin) {
                    const { next } = this.findEnd(begin[1], index + begin[0].length, end);
                    index = next;
                    continue;
                }
                index += 2;
                continue;
            }
            if (char === "{") {
                index = Math.min(end, this.matchBrace(index, end) + 1);
                continue;
            }
            index += 1;
        }
        flush(end);
        return out.join("\n");
    }

    findInlineDollar(from: number, end: number) {
        for (let index = from; index < end; index += 1) {
            if (this.src[index] === "\\") {
                index += 1;
                continue;
            }
            if (this.src[index] === "$") return index;
        }
        return -1;
    }

    /** Every environment except inline math starts a block of its own. */
    isBlockEnvironment(name: string) {
        return name !== "math" && name.length > 0;
    }

    /** Replaces the given ranges with spaces (line breaks are kept). */
    blank(ranges: Array<[number, number]>) {
        for (const [from, to] of ranges) this.src = this.src.slice(0, from) + this.src.slice(from, to).replace(/[^\n]/g, " ") + this.src.slice(to);
    }

    heading(name: string, starred: boolean, html: string) {
        const level = SECTION_LEVELS[name];
        let number = "";
        if (!starred && level >= 1) {
            this.counters[level] += 1;
            for (let index = level + 1; index < this.counters.length; index += 1) this.counters[index] = 0;
            const first = this.hasChapters ? 1 : 2;
            if (level >= first && level <= 4) number = this.counters.slice(first, level + 1).join(".");
        }
        const tag = `h${Math.min(6, Math.max(1, level === 0 ? 1 : level - (this.hasChapters ? 0 : 1)))}`;
        const id = `sec-${this.sections.length + 1}`;
        if (!starred || level <= 3) this.sections.push({ id, level, html, number });
        return `<${tag} id="${id}">${number ? `<span class="secnum">${number}</span> ` : ""}${html}</${tag}>`;
    }

    titleBlock() {
        const date = this.meta.date ?? this.formatDate();
        return `<header class="title-block">${this.meta.title ? `<h1 class="title">${this.meta.title}</h1>` : ""}${this.meta.author ? `<p class="author">${this.meta.author}</p>` : ""}${date ? `<p class="date">${date}</p>` : ""}</header>`;
    }

    formatDate() {
        return new Intl.DateTimeFormat(this.locale === "tr" ? "tr-TR" : "en-US", { year: "numeric", month: "long", day: "numeric" }).format(this.today);
    }

    environment(name: string, bodyStart: number, bodyEnd: number, beginOffset: number): string {
        const labels = LABELS[this.locale];
        if (DISPLAY_ENVIRONMENTS.has(name)) {
            const inner = this.src.slice(bodyStart, bodyEnd);
            const katexName = name.startsWith("eqnarray") ? name.replace("eqnarray", "align") : name.startsWith("multline") ? name.replace("multline", "gather") : name;
            if (name === "displaymath") return this.math(inner, true, bodyStart);
            return this.math(`\\begin{${katexName}}${inner}\\end{${katexName}}`, true, beginOffset);
        }
        if (VERBATIM.has(name)) {
            let body = this.src.slice(bodyStart, bodyEnd);
            if (name === "minted") body = body.replace(/^\s*\{[^}]*\}/, "");
            body = body.replace(/^\s*\[[^\]]*\]/, "").replace(/^\n/, "").replace(/\s+$/, "");
            return `<pre><code>${escapeHtml(body)}</code></pre>`;
        }
        if (name === "itemize" || name === "enumerate" || name === "description") return this.list(name, bodyStart, bodyEnd);
        if (name === "tabular" || name === "tabular*" || name === "tabularx" || name === "array") return this.tabular(name, bodyStart, bodyEnd);
        if (name === "quote" || name === "quotation" || name === "verse") return `<blockquote>${this.blocks(bodyStart, bodyEnd)}</blockquote>`;
        if (name === "center" || name === "flushleft" || name === "flushright") return `<div class="${name}">${this.blocks(bodyStart, bodyEnd)}</div>`;
        if (name === "abstract") return `<section class="abstract"><h3>${labels.abstract}</h3>${this.blocks(bodyStart, bodyEnd)}</section>`;
        if (name === "proof") {
            const optional = this.readOptional(bodyStart, bodyEnd);
            const title = optional ? this.inline(optional.start, optional.end) : labels.proof;
            return `<div class="proof"><em>${title}.</em> ${this.blocks(optional ? optional.next : bodyStart, bodyEnd)}<span class="qed">∎</span></div>`;
        }
        if (THEOREMS.has(name)) {
            const count = (this.theoremCounters.get(name) ?? 0) + 1;
            this.theoremCounters.set(name, count);
            const optional = this.readOptional(bodyStart, bodyEnd);
            const extra = optional ? ` (${this.inline(optional.start, optional.end)})` : "";
            const label = labels[name as keyof typeof labels] ?? name;
            return `<div class="theorem theorem-${name}"><strong>${label} ${count}${extra}.</strong> ${this.blocks(optional ? optional.next : bodyStart, bodyEnd)}</div>`;
        }
        if (name === "figure" || name === "figure*" || name === "table" || name === "table*") {
            const optional = this.readOptional(bodyStart, bodyEnd);
            return `<figure>${this.blocks(optional ? optional.next : bodyStart, bodyEnd)}</figure>`;
        }
        if (name === "thebibliography") {
            const width = this.readArg(bodyStart, bodyEnd);
            const items = this.splitItems(width ? width.next : bodyStart, bodyEnd);
            return `<section class="bibliography"><h2>${labels.references}</h2><ol>${items.map((item) => {
                const key = this.readArg(item.start, item.end);
                return `<li>${this.blocks(key ? key.next : item.start, item.end)}</li>`;
            }).join("")}</ol></section>`;
        }
        if (name === "document") return this.blocks(bodyStart, bodyEnd);
        if (name !== "minipage" && name !== "multicols") this.warnings.add(`\\begin{${name}}`);
        const args = this.readArg(bodyStart, bodyEnd);
        const skip = name === "minipage" || name === "multicols" ? args?.next ?? bodyStart : bodyStart;
        return `<div class="env env-${escapeHtml(name)}">${this.blocks(skip, bodyEnd)}</div>`;
    }

    /** Splits a range at top-level \item commands. */
    splitItems(start: number, end: number): Array<{ start: number; end: number; label: { start: number; end: number } | null }> {
        const items: Array<{ start: number; end: number; label: { start: number; end: number } | null }> = [];
        let current: { start: number; label: { start: number; end: number } | null } | null = null;
        let index = start;
        while (index < end) {
            const char = this.src[index];
            if (char === "\\") {
                if (/^\\item\b/.test(this.src.slice(index, index + 6))) {
                    if (current) items.push({ ...current, end: index });
                    let position = index + 5;
                    const label = this.readOptional(position, end);
                    if (label) position = label.next;
                    current = { start: position, label: label ? { start: label.start, end: label.end } : null };
                    index = position;
                    continue;
                }
                const begin = /^\\begin\s*\{([^}]*)\}/.exec(this.src.slice(index, index + 60));
                if (begin) {
                    index = this.findEnd(begin[1], index + begin[0].length, end).next;
                    continue;
                }
                index += 2;
                continue;
            }
            if (char === "{") {
                index = Math.min(end, this.matchBrace(index, end) + 1);
                continue;
            }
            if (char === "$") {
                const close = this.findInlineDollar(index + 1, end);
                index = close < 0 ? end : close + 1;
                continue;
            }
            index += 1;
        }
        if (current) items.push({ ...current, end });
        return items;
    }

    list(name: string, start: number, end: number) {
        const items = this.splitItems(start, end);
        if (name === "description") {
            return `<dl>${items.map((item) => `<dt>${item.label ? this.inline(item.label.start, item.label.end) : ""}</dt><dd>${this.compact(item.start, item.end)}</dd>`).join("")}</dl>`;
        }
        const tag = name === "enumerate" ? "ol" : "ul";
        return `<${tag}>${items.map((item) => item.label
            ? `<li class="custom-label"><span class="item-label">${this.inline(item.label.start, item.label.end)}</span> ${this.compact(item.start, item.end)}</li>`
            : `<li>${this.compact(item.start, item.end)}</li>`).join("")}</${tag}>`;
    }

    /** Block content without a wrapping paragraph when it is a single paragraph. */
    compact(start: number, end: number) {
        const html = this.blocks(start, end);
        const single = /^<p>([\s\S]*)<\/p>$/.exec(html);
        return single && !single[1].includes("<p>") ? single[1] : html;
    }

    tabular(name: string, start: number, end: number) {
        let position = start;
        if (name === "tabular*" || name === "tabularx") {
            const width = this.readArg(position, end);
            if (width) position = width.next;
        }
        const optional = this.readOptional(position, end);
        if (optional) position = optional.next;
        const spec = this.readArg(position, end);
        const alignments = spec ? [...this.text(spec).replace(/\{[^}]*\}/g, "").replace(/[|@!<>]/g, "")].filter((char) => /[lcrpXmb]/.test(char)) : [];
        const bordered = spec ? this.text(spec).includes("|") : false;
        const bodyStart = spec ? spec.next : position;
        // Rows end at top-level \\, cells at top-level &.
        const rows: Array<Array<{ start: number; end: number }>> = [];
        let row: Array<{ start: number; end: number }> = [];
        let cellStart = bodyStart;
        let ruled = false;
        for (let index = bodyStart; index < end; index += 1) {
            const char = this.src[index];
            if (char === "\\") {
                if (this.src[index + 1] === "\\") {
                    row.push({ start: cellStart, end: index });
                    rows.push(row);
                    row = [];
                    index += 1;
                    const after = /^\s*\[[^\]]*\]/.exec(this.src.slice(index + 1, index + 30));
                    if (after) index += after[0].length;
                    cellStart = index + 1;
                    continue;
                }
                index += 1;
                continue;
            }
            if (char === "{") {
                index = this.matchBrace(index, end);
                continue;
            }
            if (char === "$") {
                const close = this.findInlineDollar(index + 1, end);
                index = close < 0 ? end : close;
                continue;
            }
            if (char === "&") {
                row.push({ start: cellStart, end: index });
                cellStart = index + 1;
            }
        }
        row.push({ start: cellStart, end });
        rows.push(row);
        const cellHtml = (cell: { start: number; end: number }, column: number) => {
            let text = this.src.slice(cell.start, cell.end);
            if (/\\hline|\\toprule|\\midrule|\\bottomrule|\\cline\{[^}]*\}/.test(text)) ruled = true;
            text = text.replace(/\\hline|\\toprule|\\midrule|\\bottomrule|\\cline\{[^}]*\}/g, (match) => " ".repeat(match.length));
            const offset = cell.start;
            const trimmed = text.trim();
            const multi = /^\\multicolumn\s*\{(\d+)\}\s*\{([^}]*)\}\s*\{/.exec(trimmed);
            const align = (spec: string | undefined) => (spec?.includes("c") ? "center" : spec?.includes("r") ? "right" : "left");
            if (multi) {
                const braceStart = offset + text.indexOf(multi[0]) + multi[0].length - 1;
                const close = this.matchBrace(braceStart, cell.end);
                return `<td colspan="${multi[1]}" style="text-align:${align(multi[2])}">${this.inline(braceStart + 1, close)}</td>`;
            }
            const leading = text.length - text.trimStart().length;
            return `<td style="text-align:${align(alignments[column])}">${this.inline(offset + leading, offset + leading + trimmed.length)}</td>`;
        };
        const body = rows
            .map((cells) => cells.map(cellHtml))
            .filter((cells, index) => !(index === rows.length - 1 && cells.length === 1 && cells[0].replace(/<[^>]+>/g, "").trim() === ""))
            .map((cells) => `<tr>${cells.join("")}</tr>`)
            .join("");
        return `<table class="tabular${bordered || ruled ? " ruled" : ""}">${body}</table>`;
    }

    // ---------------------------------------------------------------- inline
    inline(start: number, end: number): string {
        let out = "";
        let index = start;
        while (index < end) {
            const char = this.src[index];
            if (char === "$") {
                const display = this.src[index + 1] === "$";
                if (display) {
                    const close = this.src.indexOf("$$", index + 2);
                    const stop = close < 0 || close >= end ? end : close;
                    out += this.math(this.src.slice(index + 2, stop), true, index + 2);
                    index = Math.min(end, stop + 2);
                    continue;
                }
                const close = this.findInlineDollar(index + 1, end);
                const stop = close < 0 ? end : close;
                out += this.math(this.src.slice(index + 1, stop), false, index + 1);
                index = Math.min(end, stop + 1);
                continue;
            }
            if (char === "\\") {
                const result = this.command(index, end);
                out += result.html;
                index = result.next;
                continue;
            }
            if (char === "{") {
                const close = this.matchBrace(index, end);
                out += this.group(index + 1, close);
                index = Math.min(end, close + 1);
                continue;
            }
            if (char === "}") {
                index += 1;
                continue;
            }
            if (char === "~") {
                out += "&nbsp;";
                index += 1;
                continue;
            }
            if (char === "-" && this.src.startsWith("---", index)) {
                out += "—";
                index += 3;
                continue;
            }
            if (char === "-" && this.src.startsWith("--", index)) {
                out += "–";
                index += 2;
                continue;
            }
            if (char === "`" && this.src[index + 1] === "`") {
                out += "“";
                index += 2;
                continue;
            }
            if (char === "'" && this.src[index + 1] === "'") {
                out += "”";
                index += 2;
                continue;
            }
            if (char === "`") {
                out += "‘";
                index += 1;
                continue;
            }
            if (char === "\n") {
                out += " ";
                index += 1;
                continue;
            }
            out += escapeHtml(char);
            index += 1;
        }
        return out;
    }

    /** A {group}: a declaration such as \bfseries or \large applies to the rest of it. */
    group(start: number, end: number) {
        const declaration = /^\s*\\([A-Za-z]+)\b\s*/.exec(this.src.slice(start, Math.min(end, start + 40)));
        if (declaration && DECLARATIONS[declaration[1]]) {
            const [open, close] = DECLARATIONS[declaration[1]];
            return `${open}${this.inline(start + declaration[0].length, end)}${close}`;
        }
        return this.inline(start, end);
    }

    command(index: number, end: number): { html: string; next: number } {
        const match = /^\\([A-Za-z]+\*?|.)/.exec(this.src.slice(index, index + 40));
        if (!match) return { html: "\\", next: index + 1 };
        const name = match[1];
        let next = index + match[0].length;
        // Escaped characters.
        if (name.length === 1 && "&%$#_{}".includes(name)) return { html: escapeHtml(name), next };
        if (name === "\\") {
            const optional = /^\s*\[[^\]]*\]/.exec(this.src.slice(next, next + 30));
            return { html: "<br>", next: next + (optional ? optional[0].length : 0) };
        }
        if (name === "(") {
            const close = this.src.indexOf("\\)", next);
            const stop = close < 0 || close >= end ? end : close;
            return { html: this.math(this.src.slice(next, stop), false, next), next: Math.min(end, stop + 2) };
        }
        if (name === "[") {
            const close = this.src.indexOf("\\]", next);
            const stop = close < 0 || close >= end ? end : close;
            return { html: this.math(this.src.slice(next, stop), true, next), next: Math.min(end, stop + 2) };
        }
        if (name === " " || name === "," || name === ";" || name === ":" || name === "!" || name === "/") return { html: name === "!" || name === "/" ? "" : " ", next };
        if (name === "-") return { html: "­", next };
        if (name === "@") return { html: "", next };
        // Accents: \"o, \c{c}, \u{g} …
        if (ACCENTS[name] !== undefined) {
            const arg = this.readArg(next, end);
            if (!arg) return { html: "", next };
            let base = this.text(arg);
            if (base === "\\i") base = "ı";
            else if (base === "\\j") base = "ȷ";
            const composed = `${base}${ACCENTS[name]}`.normalize("NFC");
            return { html: escapeHtml(composed), next: arg.next };
        }
        const bare = name.replace(/\*$/, "");
        if (TEXT_SYMBOLS[bare] !== undefined) {
            if (/^[A-Za-z]+$/.test(bare)) {
                // Eat the empty group of "\LaTeX{}".
                if (this.src.startsWith("{}", next)) next += 2;
            }
            return { html: TEXT_SYMBOLS[bare], next };
        }
        if (bare === "today") return { html: escapeHtml(this.formatDate()), next: this.src.startsWith("{}", next) ? next + 2 : next };
        if (STYLE_COMMANDS[bare]) {
            const arg = this.readArg(next, end);
            if (!arg) return { html: "", next };
            const [open, close] = STYLE_COMMANDS[bare];
            return { html: `${open}${this.inline(arg.start, arg.end)}${close}`, next: arg.next };
        }
        if (DECLARATIONS[bare]) return { html: "", next };
        switch (bare) {
            case "url": {
                const arg = this.readArg(next, end);
                if (!arg) return { html: "", next };
                const url = this.text(arg);
                return { html: `<span class="link" title="${escapeHtml(url)}">${escapeHtml(url)}</span>`, next: arg.next };
            }
            case "href": {
                const url = this.readArg(next, end);
                const label = url ? this.readArg(url.next, end) : null;
                if (!url || !label) return { html: "", next };
                return { html: `<span class="link" title="${escapeHtml(this.text(url))}">${this.inline(label.start, label.end)}</span>`, next: label.next };
            }
            case "footnote": {
                const arg = this.readArg(next, end);
                if (!arg) return { html: "", next };
                this.footnotes.push(this.inline(arg.start, arg.end));
                const number = this.footnotes.length;
                return { html: `<sup class="fn"><a href="#fn-${number}" id="fnref-${number}">${number}</a></sup>`, next: arg.next };
            }
            case "cite": case "ref": case "eqref": case "pageref": case "autoref": case "cref": {
                const optional = this.readOptional(next, end);
                const arg = this.readArg(optional ? optional.next : next, end);
                if (!arg) return { html: "", next };
                const key = escapeHtml(this.text(arg));
                return { html: bare === "cite" ? `<span class="ref">[${key}]</span>` : `<span class="ref">${bare === "eqref" ? `(${key})` : key}</span>`, next: arg.next };
            }
            case "includegraphics": {
                const optional = this.readOptional(next, end);
                const arg = this.readArg(optional ? optional.next : next, end);
                if (!arg) return { html: "", next };
                return { html: `<span class="image-placeholder">🖼 ${LABELS[this.locale].image}: ${escapeHtml(this.text(arg))}</span>`, next: arg.next };
            }
            case "caption": {
                const optional = this.readOptional(next, end);
                const arg = this.readArg(optional ? optional.next : next, end);
                if (!arg) return { html: "", next };
                return { html: `<figcaption>${this.inline(arg.start, arg.end)}</figcaption>`, next: arg.next };
            }
            case "item": return { html: "• ", next };
            case "and": return { html: ", ", next };
            case "thanks": {
                const arg = this.readArg(next, end);
                return { html: "", next: arg ? arg.next : next };
            }
            case "verb": {
                const delimiter = this.src[next];
                const close = this.src.indexOf(delimiter, next + 1);
                if (!delimiter || close < 0) return { html: "", next };
                return { html: `<code>${escapeHtml(this.src.slice(next + 1, close))}</code>`, next: close + 1 };
            }
            case "begin": {
                const nameArg = this.readArg(next, end);
                if (!nameArg) return { html: "", next };
                const envName = this.text(nameArg).trim();
                const { bodyEnd, next: after } = this.findEnd(envName, nameArg.next, end);
                if (envName === "math") return { html: this.math(this.src.slice(nameArg.next, bodyEnd), false, nameArg.next), next: after };
                return { html: this.environment(envName, nameArg.next, bodyEnd, index), next: after };
            }
            case "end": {
                const arg = this.readArg(next, end);
                return { html: "", next: arg ? arg.next : next };
            }
            case "textcolor": case "colorbox": {
                const color = this.readArg(next, end);
                const arg = color ? this.readArg(color.next, end) : null;
                if (!color || !arg) return { html: "", next };
                const value = this.text(color).replace(/[^A-Za-z0-9#]/g, "");
                const style = bare === "textcolor" ? `color:${value}` : `background:${value}`;
                return { html: `<span style="${style}">${this.inline(arg.start, arg.end)}</span>`, next: arg.next };
            }
        }
        if (IGNORED_COMMANDS.has(bare)) {
            // Skip the command's arguments.
            let position = next;
            for (let count = 0; count < 3; count += 1) {
                const optional = this.readOptional(position, end);
                if (optional) position = optional.next;
                const after = this.skipSpaces(position, end);
                if (this.src[after] !== "{") break;
                position = this.matchBrace(after, end) + 1;
            }
            return { html: "", next: Math.min(end, position) };
        }
        this.warnings.add(`\\${bare}`);
        // Unknown command: keep the text of its arguments.
        const arg = this.src[this.skipSpaces(next, end)] === "{" ? this.readArg(next, end) : null;
        return arg ? { html: this.inline(arg.start, arg.end), next: arg.next } : { html: "", next };
    }

    finish(body: string) {
        let html = body;
        if (html.includes("<!--hanogt-toc-->")) {
            const toc = this.sections.filter((section) => section.level >= 1 && section.level <= 3)
                .map((section) => `<li class="toc-${section.level}"><a href="#${section.id}">${section.number ? `${section.number} ` : ""}${section.html}</a></li>`).join("");
            html = html.replace("<!--hanogt-toc-->", `<nav class="toc"><h2>${LABELS[this.locale].contents}</h2><ul>${toc}</ul></nav>`);
        }
        if (this.footnotes.length) {
            html += `<ol class="footnotes">${this.footnotes.map((text, index) => `<li id="fn-${index + 1}">${text} <a href="#fnref-${index + 1}">↩</a></li>`).join("")}</ol>`;
        }
        return html;
    }
}

/** Converts LaTeX source into HTML with math placeholders (see the module comment). */
export function renderLatex(source: string, options: LatexOptions = {}): LatexRender {
    const converter = new Converter(source, options);
    const src = converter.src;
    const beginDocument = /\\begin\s*\{document\}/.exec(src);
    let bodyStart = 0;
    let bodyEnd = src.length;
    if (beginDocument) {
        bodyStart = beginDocument.index + beginDocument[0].length;
        const endDocument = /\\end\s*\{document\}/.exec(src.slice(bodyStart));
        if (endDocument) bodyEnd = bodyStart + endDocument.index;
        // The preamble only contributes metadata and definitions.
        converter.collectDefinitions(0, beginDocument.index);
        for (const field of ["title", "author", "date"] as const) {
            const match = new RegExp(`\\\\${field}\\s*\\{`).exec(src.slice(0, beginDocument.index));
            if (!match) continue;
            const open = match.index + match[0].length - 1;
            const close = converter.matchBrace(open, beginDocument.index);
            const html = converter.inline(open + 1, close);
            converter.meta[field] = field === "author" ? authorList(html) : html;
        }
    }
    // Definitions inside the body are removed from the output.
    converter.blank(converter.collectDefinitions(bodyStart, bodyEnd));
    const plain = converter.src.slice(bodyStart, bodyEnd);
    const mathOnly = !beginDocument && !/\$|\\\(|\\\[|\\begin\s*\{/.test(plain) && !TEXT_STRUCTURE.test(plain) && /\\[A-Za-z]|[\^_]/.test(plain);
    let bodyHtml: string;
    if (mathOnly) {
        // One display formula per paragraph.
        const chunks: string[] = [];
        const separator = /\n[ \t]*\n/g;
        let cursor = 0;
        for (;;) {
            const match = separator.exec(plain);
            const stop = match ? match.index : plain.length;
            const part = plain.slice(cursor, stop);
            if (part.trim()) chunks.push(converter.math(part.trim(), true, bodyStart + cursor + (part.length - part.trimStart().length)));
            if (!match) break;
            cursor = match.index + match[0].length;
        }
        bodyHtml = chunks.join("\n");
    } else {
        bodyHtml = converter.finish(converter.blocks(bodyStart, bodyEnd));
    }
    const title = converter.meta.title ? converter.meta.title.replace(/<[^>]+>/g, "") : null;
    return { html: bodyHtml, macros: converter.macros, warnings: [...converter.warnings], title, formulas: converter.formulas };
}
