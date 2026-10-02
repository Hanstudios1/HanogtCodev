"use client";

import { Check, ChevronRight, Copy, ExternalLink, FileCode2, Globe, SquareArrowOutUpRight } from "lucide-react";
import Link from "next/link";
import { Fragment, memo, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { artifactId, artifactLanguageName, isArtifactCode, isWebPage, webPageTitle, type ChatArtifact } from "./artifacts";

/**
 * Safe Markdown for Hanogt AI answers: React elements only (no HTML injection),
 * internal links through next/link, external links only for http(s) with
 * noopener, and fenced code blocks with copy / open-in-editor actions. Long
 * code and whole web pages become artifact cards that open the side panel.
 */

type Block =
    | { type: "code"; language: string; code: string; open: boolean }
    | { type: "heading"; level: number; text: string }
    | { type: "hr" }
    | { type: "quote"; lines: string[] }
    | { type: "list"; ordered: boolean; start: number; items: string[] }
    | { type: "table"; header: string[]; rows: string[][]; align: Array<"left" | "center" | "right"> }
    | { type: "p"; lines: string[] };

const LIST_ITEM = /^\s{0,6}(?:([-*•+])|(\d{1,3})[.)])\s+(.*)$/;

function splitRow(line: string) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

export function parseBlocks(source: string): Block[] {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    const blocks: Block[] = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        const fence = /^\s*(```+|~~~+)\s*([\w#+.-]*)\s*$/.exec(line);
        if (fence) {
            const marker = fence[1];
            const code: string[] = [];
            index += 1;
            while (index < lines.length && !lines[index].trim().startsWith(marker)) code.push(lines[index++]);
            const closed = index < lines.length;
            if (closed) index += 1;
            blocks.push({ type: "code", language: fence[2].toLowerCase(), code: code.join("\n"), open: !closed });
            continue;
        }
        if (!line.trim()) { index += 1; continue; }
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        if (heading) { blocks.push({ type: "heading", level: heading[1].length, text: heading[2] }); index += 1; continue; }
        if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ type: "hr" }); index += 1; continue; }
        if (/^\s*>/.test(line)) {
            const quote: string[] = [];
            while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ""));
            blocks.push({ type: "quote", lines: quote });
            continue;
        }
        if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[index + 1])) {
            const header = splitRow(line);
            const align = splitRow(lines[index + 1]).map((cell) => (cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left") as "left" | "center" | "right");
            index += 2;
            const rows: string[][] = [];
            while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(splitRow(lines[index++]));
            blocks.push({ type: "table", header, rows, align });
            continue;
        }
        const item = LIST_ITEM.exec(line);
        if (item) {
            const ordered = Boolean(item[2]);
            const start = ordered ? Number(item[2]) : 1;
            const items: string[] = [];
            while (index < lines.length) {
                const next = LIST_ITEM.exec(lines[index]);
                if (next && Boolean(next[2]) === ordered) {
                    items.push(next[3]);
                    index += 1;
                } else if (lines[index].trim() && /^\s{2,}\S/.test(lines[index]) && items.length) {
                    items[items.length - 1] += `\n${lines[index].trim()}`;
                    index += 1;
                } else {
                    break;
                }
            }
            blocks.push({ type: "list", ordered, start, items });
            continue;
        }
        const paragraph: string[] = [];
        while (index < lines.length && lines[index].trim() && !LIST_ITEM.test(lines[index]) && !/^\s*(```|~~~|#{1,4}\s|>)/.test(lines[index])) paragraph.push(lines[index++]);
        if (paragraph.length) blocks.push({ type: "p", lines: paragraph });
        else index += 1;
    }
    return blocks;
}

function SafeLink({ href, children, onNavigate }: { href: string; children: ReactNode; onNavigate?: () => void }) {
    if (/^\/(?![/\\])[^\s]*$/.test(href)) {
        return <Link href={href} onClick={onNavigate} className="font-semibold text-indigo-600 underline decoration-indigo-500/30 underline-offset-2 hover:decoration-indigo-500 dark:text-indigo-300">{children}</Link>;
    }
    if (/^https?:\/\/[^\s]+$/i.test(href)) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 underline decoration-indigo-500/30 underline-offset-2 hover:decoration-indigo-500 dark:text-indigo-300">
                {children}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </a>
        );
    }
    return <>{children}</>;
}

const INLINE = /(`+)([^`]+?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|(?<![\w_])_([^_\s][^_]*?)_(?![\w_])|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function Inline({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
    const parts: ReactNode[] = [];
    let last = 0;
    let key = 0;
    for (const match of text.matchAll(INLINE)) {
        const start = match.index ?? 0;
        if (start > last) parts.push(text.slice(last, start));
        if (match[2] !== undefined) parts.push(<code key={key++} className="rounded-md bg-zinc-900/[0.07] px-1.5 py-0.5 font-mono text-[0.86em] text-fuchsia-700 dark:bg-white/10 dark:text-fuchsia-300" dir="ltr">{match[2]}</code>);
        else if (match[3] !== undefined || match[4] !== undefined) parts.push(<strong key={key++} className="font-bold text-zinc-900 dark:text-white"><Inline text={match[3] ?? match[4]} onNavigate={onNavigate} /></strong>);
        else if (match[5] !== undefined || match[6] !== undefined) parts.push(<em key={key++}>{match[5] ?? match[6]}</em>);
        else if (match[7] !== undefined) parts.push(<SafeLink key={key++} href={match[8]} onNavigate={onNavigate}><Inline text={match[7]} onNavigate={onNavigate} /></SafeLink>);
        else if (match[9] !== undefined) parts.push(<SafeLink key={key++} href={match[9]} onNavigate={onNavigate}>{match[9].replace(/^https?:\/\//, "").slice(0, 60)}</SafeLink>);
        last = start + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return <>{parts}</>;
}

// ------------------------------------------------------------------ highlighting
const KEYWORDS: Record<string, string> = {
    js: "await async break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while yield null undefined true false interface type enum implements readonly as",
    py: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self print",
    c: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while include define std string vector cout cin endl abstract base byte decimal event foreach get implicit interface internal is lock object out override params readonly ref sbyte sealed set uint ulong unchecked ushort var yield boolean extends final implements import instanceof native package super synchronized throws transient null String System",
    sql: "select from where insert into values update set delete create table drop alter add primary key foreign references join left right inner outer on group by order having limit offset as and or not null is in like between distinct count sum avg min max integer text real varchar",
    lua: "and break do else elseif end false for function goto if in local nil not or repeat return then true until while print",
    sh: "if then else elif fi for while do done case esac function in echo export local return exit sudo cd ls",
};

function keywordSet(language: string) {
    const family = /^(?:js|jsx|ts|tsx|javascript|typescript|node|json)$/.test(language) ? "js"
        : /^(?:py|python)$/.test(language) ? "py"
            : /^(?:sql|sqlite|mysql|postgres)$/.test(language) ? "sql"
                : /^(?:lua)$/.test(language) ? "lua"
                    : /^(?:sh|bash|shell|zsh|console)$/.test(language) ? "sh"
                        : "c";
    return { family, words: new Set(KEYWORDS[family].split(" ")) };
}

const TOKEN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#(?![\w]*\s*(?:include|define|if|endif|pragma))[^\n]*|--[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?[fFdDlL]?\b|[A-Za-z_][\w]*)/g;

export function highlight(code: string, language: string): ReactNode[] {
    const { family, words } = keywordSet(language);
    const out: ReactNode[] = [];
    let last = 0;
    let key = 0;
    for (const match of code.matchAll(TOKEN)) {
        const token = match[0];
        const start = match.index ?? 0;
        if (start > last) out.push(code.slice(last, start));
        let className = "";
        if (token.startsWith("/*") || token.startsWith("//")) className = family === "py" || family === "sh" ? "" : "text-zinc-500 italic";
        else if (token.startsWith("#")) className = family === "py" || family === "sh" ? "text-zinc-500 italic" : "";
        else if (token.startsWith("--")) className = family === "sql" || family === "lua" ? "text-zinc-500 italic" : "";
        else if (/^["'`]/.test(token)) className = "text-emerald-300";
        else if (/^\d/.test(token)) className = "text-amber-300";
        else if (words.has(family === "sql" ? token.toLowerCase() : token)) className = "text-fuchsia-400 font-semibold";
        else if (code[start + token.length] === "(") className = "text-sky-300";
        else if (/^[A-Z][a-zA-Z0-9]+$/.test(token)) className = "text-cyan-300";
        out.push(className ? <span key={key++} className={className}>{token}</span> : token);
        last = start + token.length;
    }
    if (last < code.length) out.push(code.slice(last));
    return out;
}

const RUNNABLE: Record<string, string> = {
    python: "py", py: "py", javascript: "js", js: "js", node: "js", typescript: "ts", ts: "ts", csharp: "cs", cs: "cs", "c#": "cs",
    cpp: "cpp", "c++": "cpp", c: "c", java: "java", go: "go", rust: "rs", rs: "rs", lua: "lua", sql: "sql", php: "php", ruby: "rb", kotlin: "kt", swift: "swift", html: "html", css: "css",
};

export function editorLanguageFor(fence: string) {
    return RUNNABLE[fence.toLowerCase()] ?? null;
}

function ArtifactCard({ language, code, onOpen }: { language: string; code: string; onOpen: (artifact: ChatArtifact) => void }) {
    const { tx } = useI18n();
    const web = isWebPage(language, code);
    const lines = code.split("\n").length;
    const title = web ? webPageTitle(code) ?? tx({ TR: "Web sayfası", EN: "Web page" }) : tx({ TR: "{language} kodu", EN: "{language} code" }, { language: artifactLanguageName(language) });
    const Icon = web ? Globe : FileCode2;
    return (
        <button
            type="button"
            onClick={() => onOpen({ id: artifactId(language, code), language, code })}
            className="group my-2 flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-start shadow-sm transition hover:border-violet-400/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-violet-400/40"
        >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Icon className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-zinc-900 dark:text-white">{title}</span>
                <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                    {web
                        ? tx({ TR: "{lines} satır · önizlemek için tıkla", EN: "{lines} lines · click to preview" }, { lines })
                        : tx({ TR: "{language} · {lines} satır · açmak için tıkla", EN: "{language} · {lines} lines · click to open" }, { language: artifactLanguageName(language), lines })}
                </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
        </button>
    );
}

function CodeBlock({ language, code, open, onOpenInEditor, onOpenArtifact }: { language: string; code: string; open: boolean; onOpenInEditor?: (language: string, code: string) => void; onOpenArtifact?: (artifact: ChatArtifact) => void }) {
    const { tx } = useI18n();
    const [copied, setCopied] = useState(false);
    const editorLanguage = editorLanguageFor(language);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };
    if (onOpenArtifact && !open && isArtifactCode(language, code)) return <ArtifactCard language={language} code={code} onOpen={onOpenArtifact} />;
    return (
        <div className="my-2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-inner" dir="ltr">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px]">
                <span className="font-mono font-semibold uppercase tracking-wide text-zinc-400">{language || "code"}</span>
                <span className="flex items-center gap-1">
                    {onOpenInEditor && editorLanguage && !open ? (
                        <button type="button" onClick={() => onOpenInEditor(editorLanguage, code)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white">
                            <SquareArrowOutUpRight className="h-3.5 w-3.5" />{tx({ TR: "Editörde aç", EN: "Open in editor" })}
                        </button>
                    ) : null}
                    <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white" aria-live="polite">
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? tx({ TR: "Kopyalandı", EN: "Copied" }) : tx({ TR: "Kopyala", EN: "Copy" })}
                    </button>
                </span>
            </div>
            <pre className="scrollbar-thin max-h-[420px] overflow-auto p-3 font-mono text-[12.5px] leading-relaxed"><code>{highlight(code, language)}</code></pre>
        </div>
    );
}

function MarkdownImpl({ text, onNavigate, onOpenInEditor, onOpenArtifact }: { text: string; onNavigate?: () => void; onOpenInEditor?: (language: string, code: string) => void; onOpenArtifact?: (artifact: ChatArtifact) => void }) {
    const blocks = parseBlocks(text);
    return (
        <div className="space-y-2 break-words">
            {blocks.map((block, index) => {
                switch (block.type) {
                    case "code":
                        return <CodeBlock key={index} language={block.language} code={block.code} open={block.open} onOpenInEditor={onOpenInEditor} onOpenArtifact={onOpenArtifact} />;
                    case "heading": {
                        const size = block.level === 1 ? "text-[17px]" : block.level === 2 ? "text-[15.5px]" : "text-[14.5px]";
                        return <p key={index} className={`${size} pt-1 font-black tracking-tight text-zinc-900 dark:text-white`}><Inline text={block.text} onNavigate={onNavigate} /></p>;
                    }
                    case "hr":
                        return <hr key={index} className="border-zinc-200 dark:border-white/10" />;
                    case "quote":
                        return <blockquote key={index} className="border-s-4 border-indigo-400/50 ps-3 text-zinc-600 dark:text-zinc-300">{block.lines.map((line, lineIndex) => <p key={lineIndex}><Inline text={line} onNavigate={onNavigate} /></p>)}</blockquote>;
                    case "list": {
                        const Tag = block.ordered ? "ol" : "ul";
                        return (
                            <Tag key={index} start={block.ordered ? block.start : undefined} className={`space-y-1 ps-5 ${block.ordered ? "list-decimal marker:font-bold marker:text-indigo-500" : "list-disc marker:text-indigo-500"}`}>
                                {block.items.map((item, itemIndex) => (
                                    <li key={itemIndex}>{item.split("\n").map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex ? <br /> : null}<Inline text={line} onNavigate={onNavigate} /></Fragment>)}</li>
                                ))}
                            </Tag>
                        );
                    }
                    case "table":
                        return (
                            <div key={index} className="scrollbar-thin overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10">
                                <table className="w-full text-[12.5px]">
                                    <thead className="bg-zinc-50 dark:bg-white/[0.04]"><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex} className="px-3 py-1.5 font-bold" style={{ textAlign: block.align[cellIndex] ?? "left" }}><Inline text={cell} onNavigate={onNavigate} /></th>)}</tr></thead>
                                    <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-zinc-100 dark:border-white/[0.06]">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-1.5" style={{ textAlign: block.align[cellIndex] ?? "left" }}><Inline text={cell} onNavigate={onNavigate} /></td>)}</tr>)}</tbody>
                                </table>
                            </div>
                        );
                    default:
                        return <p key={index}>{block.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex ? <br /> : null}<Inline text={line} onNavigate={onNavigate} /></Fragment>)}</p>;
                }
            })}
        </div>
    );
}

export const Markdown = memo(MarkdownImpl);
export default Markdown;
