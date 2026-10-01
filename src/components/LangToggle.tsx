"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe, Search } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { LANGUAGES, languageInfo, useI18n, type Language } from "@/lib/i18n";

type Placement = { top?: number; bottom?: number; left: number; width: number; listHeight: number; up: boolean };

const GAP = 8;
const noop = () => () => undefined;
const MAX_WIDTH = 288;
const SEARCH_HEIGHT = 49;

/**
 * Language picker. The menu is rendered into <body> with fixed positioning,
 * so containers with `overflow: hidden` (the footer) can't clip it; it opens
 * upwards near the bottom of the screen and always stays inside the viewport.
 */
export default function LangToggle({ compact = false }: { compact?: boolean }) {
    const { language, setLanguage, t } = useI18n();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [placement, setPlacement] = useState<Placement | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const current = languageInfo(language);
    // The portal target exists only in the browser; the server renders the button alone.
    const isClient = useSyncExternalStore(noop, () => true, () => false);

    const place = useCallback(() => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const width = Math.min(MAX_WIDTH, viewportWidth - GAP * 2);
        const below = viewportHeight - rect.bottom - GAP * 2;
        const above = rect.top - GAP * 2;
        const up = below < 320 && above > below;
        // Grow towards the side of the screen with more room.
        const startAligned = rect.left + rect.width / 2 < viewportWidth / 2;
        let left = startAligned ? rect.left : rect.right - width;
        left = Math.min(Math.max(GAP, left), viewportWidth - GAP - width);
        const listHeight = Math.max(140, Math.min(320, (up ? above : below) - SEARCH_HEIGHT));
        setPlacement(up
            ? { bottom: viewportHeight - rect.top + GAP, left, width, listHeight, up }
            : { top: rect.bottom + GAP, left, width, listHeight, up });
    }, []);

    useLayoutEffect(() => {
        if (open) place();
    }, [open, place]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: MouseEvent) => {
            const target = event.target as Node;
            if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        const focus = window.setTimeout(() => searchRef.current?.focus(), 30);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
            window.clearTimeout(focus);
        };
    }, [open, place]);

    const needle = query.trim().toLocaleLowerCase();
    const list = LANGUAGES.filter((entry) => !needle || `${entry.name} ${entry.english} ${entry.code}`.toLocaleLowerCase().includes(needle));

    const choose = (code: Language) => {
        setLanguage(code);
        setOpen(false);
        setQuery("");
    };

    const menu = (
        <AnimatePresence>
            {open && placement ? (
                <motion.div
                    ref={menuRef}
                    initial={{ opacity: 0, y: placement.up ? 6 : -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: placement.up ? 6 : -6, scale: 0.97 }}
                    transition={{ duration: 0.16 }}
                    style={{ position: "fixed", top: placement.top, bottom: placement.bottom, left: placement.left, width: placement.width }}
                    className={`z-[120] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-zinc-900 ${placement.up ? "origin-bottom" : "origin-top"}`}
                >
                    <div className="border-b border-zinc-100 p-2 dark:border-white/[0.06]">
                        <div className="relative">
                            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t("lt_search")}
                                aria-label={t("lt_search")}
                                className="h-8 w-full rounded-lg bg-zinc-100 pe-2 ps-8 text-[13px] text-zinc-800 outline-none focus:ring-2 focus:ring-indigo-500/30 dark:bg-white/[0.06] dark:text-zinc-100"
                            />
                        </div>
                    </div>
                    <ul role="listbox" aria-label={t("lt_languages")} style={{ maxHeight: placement.listHeight }} className="scrollbar-thin grid grid-cols-2 gap-0.5 overflow-y-auto overscroll-contain p-1.5">
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
                        {!list.length ? <li className="col-span-2 px-2 py-4 text-center text-[12px] text-zinc-400">{t("lt_no_results")}</li> : null}
                    </ul>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={t("lt_choose")}
                className={`flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200/80 px-2.5 text-[13px] font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10 ${compact ? "" : "min-w-[4.5rem]"}`}
            >
                <Globe className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                <span>{current.code}</span>
            </button>
            {isClient ? createPortal(menu, document.body) : null}
        </div>
    );
}
