"use client";

import { motion } from "framer-motion";
import { Check, Code2, Copy as CopyIcon, Eye, SquareArrowOutUpRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { buildWebPreview, createPreviewToken } from "@/lib/runtimes/web-preview";
import { useTheme } from "@/lib/theme";
import { artifactLanguageName, isWebPage, webPageTitle, type ChatArtifact } from "./artifacts";
import { highlight } from "./Markdown";
import { cx, ICON_BUTTON } from "./ui";

const C = {
    code: { TR: "Kod", EN: "Code" },
    preview: { TR: "Önizleme", EN: "Preview" },
    copy: { TR: "Kopyala", EN: "Copy" },
    copied: { TR: "Kopyalandı", EN: "Copied" },
    openInEditor: { TR: "Editörde aç", EN: "Open in editor" },
    close: { TR: "Paneli kapat", EN: "Close panel" },
    webPage: { TR: "Web sayfası", EN: "Web page" },
    codeTitle: { TR: "{language} kodu", EN: "{language} code" },
    lines: { TR: "{lines} satır", EN: "{lines} lines" },
    frame: { TR: "Önizleme: {name}", EN: "Preview: {name}" },
    sandbox: { TR: "Sayfa korumalı bir çerçevede çalışır; ağ istekleri ve sitenin verilerine erişim engellidir.", EN: "The page runs in a sandboxed frame without network access or access to the site's data." },
};

/**
 * Claude-style artifact panel: long code or a web page next to the
 * conversation, with a live preview for HTML (the editor's sandboxed preview
 * builder: opaque origin, strict CSP), copy and "open in editor".
 */
export default function ArtifactPanel({ artifact, variant, onClose, onOpenInEditor }: {
    artifact: ChatArtifact;
    variant: "panel" | "page";
    onClose: () => void;
    onOpenInEditor: (language: string, code: string) => void;
}) {
    const { tx } = useI18n();
    const { theme } = useTheme();
    const web = isWebPage(artifact.language, artifact.code);
    const [tab, setTab] = useState<"code" | "preview">(web ? "preview" : "code");
    const [copied, setCopied] = useState(false);
    const [token] = useState(createPreviewToken);
    const closeButton = useRef<HTMLButtonElement>(null);
    const lineCount = artifact.code.split("\n").length;
    const title = web ? webPageTitle(artifact.code) ?? tx(C.webPage) : tx(C.codeTitle, { language: artifactLanguageName(artifact.language) });

    const previewHtml = useMemo(() => {
        if (!web) return null;
        const file = { name: "index.html", language: "html", code: artifact.code };
        return buildWebPreview([file], file, { token, dark: theme === "dark" }).html;
    }, [artifact.code, theme, token, web]);

    useEffect(() => {
        closeButton.current?.focus();
    }, [artifact.id]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(artifact.code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    const highlighted = useMemo(() => highlight(artifact.code, artifact.language), [artifact.code, artifact.language]);

    return (
        <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            role="complementary"
            aria-label={title}
            onKeyDown={(event) => {
                // Only while focus is in the panel, so Escape in the composer keeps its own meaning.
                if (event.key === "Escape") {
                    event.stopPropagation();
                    onClose();
                }
            }}
            className={cx(
                "flex min-h-0 flex-col bg-white dark:bg-zinc-900",
                variant === "page"
                    ? "fixed inset-0 z-[60] lg:static lg:z-auto lg:w-[min(46vw,680px)] lg:shrink-0 lg:border-s lg:border-zinc-200 lg:dark:border-white/[0.06]"
                    : "absolute inset-0 z-20",
            )}
        >
            <div className="flex items-center gap-2 border-b border-zinc-200/80 px-3 py-2.5 dark:border-white/[0.06]">
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[14px] font-bold text-zinc-900 dark:text-white">{title}</h2>
                    <p className="truncate text-[11.5px] text-zinc-500 dark:text-zinc-400">{artifactLanguageName(artifact.language)} · {tx(C.lines, { lines: lineCount })}</p>
                </div>
                {web ? (
                    <div className="flex rounded-lg bg-zinc-900/[0.05] p-0.5 dark:bg-white/[0.06]" role="tablist" aria-label={title}>
                        {(["preview", "code"] as const).map((id) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={tab === id}
                                onClick={() => setTab(id)}
                                className={cx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold transition", tab === id ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100")}
                            >
                                {id === "preview" ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <Code2 className="h-3.5 w-3.5" aria-hidden />}
                                <span className="hidden sm:inline">{tx(id === "preview" ? C.preview : C.code)}</span>
                            </button>
                        ))}
                    </div>
                ) : null}
                <button type="button" onClick={() => void copy()} className={ICON_BUTTON} title={tx(copied ? C.copied : C.copy)} aria-label={tx(copied ? C.copied : C.copy)}>
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <CopyIcon className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => onOpenInEditor(artifact.language, artifact.code)} className={ICON_BUTTON} title={tx(C.openInEditor)} aria-label={tx(C.openInEditor)}>
                    <SquareArrowOutUpRight className="h-4 w-4" />
                </button>
                <button ref={closeButton} type="button" onClick={onClose} className={ICON_BUTTON} title={tx(C.close)} aria-label={tx(C.close)}>
                    <X className="h-4.5 w-4.5" />
                </button>
            </div>
            {tab === "preview" && previewHtml ? (
                <div className="flex min-h-0 flex-1 flex-col bg-zinc-100 p-2 dark:bg-zinc-950">
                    <iframe
                        key={artifact.id}
                        title={tx(C.frame, { name: title })}
                        srcDoc={previewHtml}
                        sandbox="allow-scripts allow-forms"
                        referrerPolicy="no-referrer"
                        className="min-h-0 w-full flex-1 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-white/10"
                    />
                    <p className="px-1 pt-1.5 text-[10.5px] text-zinc-500 dark:text-zinc-400">{tx(C.sandbox)}</p>
                </div>
            ) : (
                <div className="scrollbar-thin min-h-0 flex-1 overflow-auto bg-zinc-950 text-zinc-100" dir="ltr">
                    <pre className="flex min-w-max p-3 font-mono text-[12.5px] leading-relaxed">
                        <span className="select-none pe-4 text-end text-zinc-600" aria-hidden>
                            {Array.from({ length: lineCount }, (_, index) => <span key={index} className="block">{index + 1}</span>)}
                        </span>
                        <code className="block">{highlighted}</code>
                    </pre>
                </div>
            )}
        </motion.aside>
    );
}
