"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Boxes, FileCode2, Keyboard, Layers3, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n, type Copy } from "@/lib/i18n";
import type { TemplateInfo } from "@/lib/game-engine/templates";
import type { GameProjectDocument } from "@/lib/game-engine/types";
import LivePreview from "./LivePreview";
import { templateFacts } from "./template-facts";
import { DIFFICULTY_COPY, TemplateBadges } from "./TemplateBadges";

const C = {
    close: { TR: "Kapat", EN: "Close" },
    start: { TR: "Bu şablonla başla", EN: "Start with this template" },
    controls: { TR: "Nasıl oynanır", EN: "How to play" },
    inside: { TR: "Bu projede", EN: "In this project" },
    scripts: { TR: "betik", EN: "scripts" },
    lines: { TR: "satır kod", EN: "lines of code" },
    objects: { TR: "nesne", EN: "objects" },
    prefabs: { TR: "prefab", EN: "prefabs" },
    components: { TR: "Kullanılan bileşenler", EN: "Components used" },
    files: { TR: "Betik dosyaları", EN: "Script files" },
    peek: { TR: "{file} dosyasının başı", EN: "The start of {file}" },
    learn: { TR: "Kodlar yorum satırlarıyla açıklanmıştır; değerleri değiştirip hemen oynayarak öğrenebilirsin.", EN: "The code is explained with comments; change values and play right away to learn." },
} satisfies Record<string, Copy>;

export default function TemplateDrawer({ template, project, locale, onClose, onStart }: {
    template: TemplateInfo | null;
    project: GameProjectDocument | null;
    locale: "tr" | "en";
    onClose: () => void;
    onStart: (template: TemplateInfo) => void;
}) {
    const { tx } = useI18n();
    const reduceMotion = useReducedMotion();
    const closeRef = useRef<HTMLButtonElement | null>(null);
    const facts = useMemo(() => (project ? templateFacts(project) : null), [project]);
    const open = Boolean(template && project);

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        const frame = requestAnimationFrame(() => closeRef.current?.focus());
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = overflow;
            previous?.focus?.({ preventScroll: true });
        };
    }, [open, onClose]);

    if (typeof document === "undefined") return null;
    const main = facts?.scripts[0];
    const peek = main ? main.content.trimEnd().split("\n").slice(0, 34) : [];

    return createPortal(
        <AnimatePresence>
            {template && project && facts ? (
                <div className="fixed inset-0 z-[140]" key="drawer">
                    <motion.div
                        className="absolute inset-0 bg-zinc-950/55 backdrop-blur-[2px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="template-drawer-title"
                        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl sm:inset-y-0 sm:end-0 sm:start-auto sm:max-h-none sm:w-[min(640px,100vw)] sm:rounded-none sm:rounded-s-3xl dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <header className="flex items-start gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-white/10">
                            <div className="min-w-0 flex-1">
                                <TemplateBadges template={template} locale={locale} />
                                <h2 id="template-drawer-title" className="mt-2 text-2xl font-black tracking-tight">{template.name[locale]}</h2>
                            </div>
                            <button ref={closeRef} type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white" aria-label={tx(C.close)}>
                                <X className="h-5 w-5" aria-hidden />
                            </button>
                        </header>

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-4">
                            <LivePreview project={project} label={template.name[locale]} controls={template.controls[locale]} touch />
                            <p className="mt-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">{template.description[locale]}</p>

                            <div className="mt-5 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                                <h3 className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wide text-zinc-500"><Keyboard className="h-4 w-4" aria-hidden />{tx(C.controls)}</h3>
                                <p className="mt-2 text-[14.5px] font-semibold">{template.controls[locale]}</p>
                                <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">{tx(DIFFICULTY_COPY[template.difficulty])}</p>
                            </div>

                            <div className="mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                                <h3 className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wide text-zinc-500"><Boxes className="h-4 w-4" aria-hidden />{tx(C.inside)}</h3>
                                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {[
                                        { value: facts.scripts.length, label: tx(C.scripts) },
                                        { value: facts.lines, label: tx(C.lines) },
                                        { value: facts.objects, label: tx(C.objects) },
                                        { value: facts.prefabs, label: tx(C.prefabs) },
                                    ].map((item) => (
                                        <div key={item.label} className="flex flex-col rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/[0.04]">
                                            <dt className="order-2 text-[12px] text-zinc-500 dark:text-zinc-400">{item.label}</dt>
                                            <dd className="text-xl font-black tabular-nums">{item.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                                <p className="mt-4 flex items-center gap-2 text-[12.5px] font-bold text-zinc-500"><Layers3 className="h-3.5 w-3.5" aria-hidden />{tx(C.components)}</p>
                                <ul className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
                                    {facts.components.map((name) => <li key={name} className="rounded-lg border border-zinc-200 px-2 py-0.5 font-mono text-[11.5px] text-zinc-700 dark:border-white/10 dark:text-zinc-300">{name}</li>)}
                                </ul>
                                <p className="mt-4 flex items-center gap-2 text-[12.5px] font-bold text-zinc-500"><FileCode2 className="h-3.5 w-3.5" aria-hidden />{tx(C.files)}</p>
                                <ul className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
                                    {facts.scripts.map((file) => (
                                        <li key={file.name} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2 py-0.5 font-mono text-[11.5px] text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300">
                                            <span className={file.language === "C++" ? "text-sky-600 dark:text-sky-300" : "text-violet-600 dark:text-violet-300"}>{file.language}</span>{file.name}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {main ? (
                                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
                                    <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[12.5px] font-bold text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">{tx(C.peek, { file: main.name })}</p>
                                    <pre dir="ltr" className="max-h-80 overflow-auto bg-zinc-950 px-0 py-3 font-mono text-[11.5px] leading-[1.55] text-zinc-200"><code>{peek.map((line, index) => (
                                        <span key={index} className="block whitespace-pre px-4"><span className="me-4 inline-block w-5 select-none text-end text-zinc-600">{index + 1}</span>{highlight(line)}</span>
                                    ))}</code></pre>
                                </div>
                            ) : null}
                            <p className="mt-3 text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(C.learn)}</p>
                        </div>

                        <footer className="border-t border-zinc-200/80 px-5 py-3 dark:border-white/10">
                            <button type="button" onClick={() => onStart(template)} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 text-[15px] font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                                <Plus className="h-4.5 w-4.5" aria-hidden />{tx(C.start)}
                            </button>
                        </footer>
                    </motion.section>
                </div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}

const KEYWORDS = /\b(using|public|private|protected|class|void|float|int|bool|string|return|if|else|for|foreach|while|new|static|override|true|false|null|nullptr|include|const|auto|struct|enum|this|in)\b/;

/** Tiny syntax tint for the code peek: comments, strings and keywords. */
function highlight(line: string) {
    const comment = line.indexOf("//");
    const code = comment >= 0 ? line.slice(0, comment) : line;
    const parts = code.split(/("(?:[^"\\]|\\.)*")/);
    return (
        <>
            {parts.map((part, index) => part.startsWith("\"")
                ? <span key={index} className="text-amber-300">{part}</span>
                : part.split(new RegExp(KEYWORDS.source, "g")).map((piece, inner) => KEYWORDS.test(piece) && piece.length > 1
                    ? <span key={`${index}-${inner}`} className="text-fuchsia-300">{piece}</span>
                    : <span key={`${index}-${inner}`}>{piece}</span>))}
            {comment >= 0 ? <span className="text-emerald-300/80">{line.slice(comment)}</span> : null}
        </>
    );
}
