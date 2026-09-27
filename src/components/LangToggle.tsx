"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LANGUAGES, languageInfo, useI18n, type Language } from "@/lib/i18n";

export default function LangToggle({ compact = false }: { compact?: boolean }) {
    const { language, setLanguage, tx } = useI18n();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const current = languageInfo(language);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        const focus = window.setTimeout(() => searchRef.current?.focus(), 30);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
            window.clearTimeout(focus);
        };
    }, [open]);

    const needle = query.trim().toLocaleLowerCase();
    const list = LANGUAGES.filter((entry) => !needle || `${entry.name} ${entry.english} ${entry.code}`.toLocaleLowerCase().includes(needle));

    const choose = (code: Language) => {
        setLanguage(code);
        setOpen(false);
        setQuery("");
    };

    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={tx({ TR: "Dil seç", EN: "Choose language" })}
                className={`flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200/80 px-2.5 text-[13px] font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10 ${compact ? "" : "min-w-[4.5rem]"}`}
            >
                <Globe className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                <span>{current.code}</span>
            </button>

            <AnimatePresence>
                {open ? (
                    <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.16 }}
                        className="absolute end-0 top-full z-[70] mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-zinc-900"
                    >
                        <div className="border-b border-zinc-100 p-2 dark:border-white/[0.06]">
                            <div className="relative">
                                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                                <input
                                    ref={searchRef}
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder={tx({ TR: "Dil ara…", EN: "Search languages…" })}
                                    className="h-8 w-full rounded-lg bg-zinc-100 pe-2 ps-8 text-[13px] text-zinc-800 outline-none focus:ring-2 focus:ring-indigo-500/30 dark:bg-white/[0.06] dark:text-zinc-100"
                                />
                            </div>
                        </div>
                        <ul role="listbox" aria-label={tx({ TR: "Diller", EN: "Languages" })} className="scrollbar-thin grid max-h-80 grid-cols-2 gap-0.5 overflow-y-auto p-1.5">
                            {list.map((entry) => (
                                <li key={entry.code}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={entry.code === language}
                                        onClick={() => choose(entry.code)}
                                        lang={entry.locale}
                                        dir={entry.dir}
                                        title={entry.english}
                                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[13px] transition ${entry.code === language ? "bg-indigo-500/10 font-semibold text-indigo-700 dark:text-indigo-300" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]"}`}
                                    >
                                        <span aria-hidden="true">{entry.flag}</span>
                                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                                        {entry.code === language ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="text-[10px] text-zinc-400">{entry.code}</span>}
                                    </button>
                                </li>
                            ))}
                            {!list.length ? <li className="col-span-2 px-2 py-4 text-center text-[12px] text-zinc-400">{tx({ TR: "Sonuç yok", EN: "No results" })}</li> : null}
                        </ul>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
