"use client";

import { Check, Copy as CopyIcon } from "lucide-react";
import { Fragment, memo, useMemo, useState, type ReactNode } from "react";
import { copyText, cx } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import { hasMarkdown, parseChatMarkdown, type MdBlock, type MdInline } from "@/lib/social/markdown";

const C = {
    copyCode: { TR: "Kodu kopyala", EN: "Copy code" },
    copied: { TR: "Kopyalandı", EN: "Copied" },
    spoiler: { TR: "Sürprizi göster", EN: "Reveal spoiler" },
} satisfies Record<string, Copy>;

/** Renders the plain text pieces of a message (mentions, #topics, links, search highlights). */
export type TextRenderer = (text: string, key: string) => ReactNode;

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
    1: "mt-1 text-[1.4em] font-black leading-tight",
    2: "mt-1 text-[1.2em] font-extrabold leading-tight",
    3: "mt-0.5 text-[1.05em] font-bold",
};

function Spoiler({ children }: { children: ReactNode }) {
    const { tx } = useI18n();
    const [shown, setShown] = useState(false);
    if (shown) return <span className="rounded bg-zinc-200/80 px-0.5 dark:bg-white/10">{children}</span>;
    return (
        <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setShown(true); }}
            className="rounded bg-zinc-700 px-0.5 align-baseline text-transparent transition hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500 [&_*]:text-transparent"
            aria-label={tx(C.spoiler)}
            title={tx(C.spoiler)}
        >
            <span aria-hidden className="select-none">{children}</span>
        </button>
    );
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
    const { tx } = useI18n();
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        if (await copyText(text)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        }
    };
    return (
        <div className="group/code relative my-1 max-w-full" dir="ltr">
            <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 pe-10 font-mono text-[13px] leading-5 text-zinc-800 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200"><code>{text}</code></pre>
            {lang && <span className="pointer-events-none absolute bottom-1.5 end-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{lang}</span>}
            <button
                type="button"
                onClick={(event) => { event.stopPropagation(); void copy(); }}
                className="absolute end-1.5 top-1.5 rounded-md border border-zinc-200 bg-white p-1 text-zinc-500 opacity-0 transition hover:text-zinc-900 focus-visible:opacity-100 group-hover/code:opacity-100 dark:border-white/10 dark:bg-zinc-900 dark:hover:text-white"
                aria-label={copied ? tx(C.copied) : tx(C.copyCode)}
                title={copied ? tx(C.copied) : tx(C.copyCode)}
            >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> : <CopyIcon className="h-3.5 w-3.5" aria-hidden />}
            </button>
        </div>
    );
}

function renderInline(nodes: readonly MdInline[], renderText: TextRenderer, key: string): ReactNode[] {
    return nodes.map((node, index) => {
        const id = `${key}.${index}`;
        switch (node.type) {
            case "text":
                return <Fragment key={id}>{renderText(node.text, id)}</Fragment>;
            case "code":
                return <code key={id} dir="ltr" className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.85em] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">{node.text}</code>;
            case "bold":
                return <strong key={id} className="font-bold">{renderInline(node.children, renderText, id)}</strong>;
            case "italic":
                return <em key={id}>{renderInline(node.children, renderText, id)}</em>;
            case "underline":
                return <u key={id} className="underline-offset-2">{renderInline(node.children, renderText, id)}</u>;
            case "strike":
                return <s key={id}>{renderInline(node.children, renderText, id)}</s>;
            case "spoiler":
                return <Spoiler key={id}>{renderInline(node.children, renderText, id)}</Spoiler>;
        }
    });
}

function renderBlocks(blocks: readonly MdBlock[], renderText: TextRenderer, key: string): ReactNode[] {
    return blocks.map((block, index) => {
        const id = `${key}.${index}`;
        switch (block.type) {
            case "paragraph":
                return <p key={id} className="whitespace-pre-wrap">{renderInline(block.children, renderText, id)}</p>;
            case "heading":
                return <p key={id} className={cx("whitespace-pre-wrap", HEADING_CLASS[block.level])}>{renderInline(block.children, renderText, id)}</p>;
            case "list": {
                const items = block.items.map((item, at) => <li key={`${id}.${at}`} className="whitespace-pre-wrap">{renderInline(item, renderText, `${id}.${at}`)}</li>);
                return block.ordered
                    ? <ol key={id} start={block.start} className="my-0.5 list-decimal space-y-0.5 ps-6">{items}</ol>
                    : <ul key={id} className="my-0.5 list-disc space-y-0.5 ps-6">{items}</ul>;
            }
            case "code":
                return <CodeBlock key={id} lang={block.lang} text={block.text} />;
            case "quote":
                return <blockquote key={id} className="my-0.5 border-s-4 border-zinc-300 ps-2.5 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">{renderBlocks(block.children, renderText, id)}</blockquote>;
        }
    });
}

/**
 * A message's text with Discord's Markdown. Text pieces go through
 * `renderText` (mentions, topics, links), so no part of a message is ever
 * rendered as HTML.
 */
function ChatMarkdownView({ text, renderText, className }: { text: string; renderText: TextRenderer; className?: string }) {
    const blocks = useMemo(() => (hasMarkdown(text) ? parseChatMarkdown(text) : null), [text]);
    return (
        <div className={cx("min-w-0 break-words [overflow-wrap:anywhere]", className)}>
            {blocks ? renderBlocks(blocks, renderText, "md") : <p className="whitespace-pre-wrap">{renderText(text, "md")}</p>}
        </div>
    );
}

export const ChatMarkdown = memo(ChatMarkdownView);
