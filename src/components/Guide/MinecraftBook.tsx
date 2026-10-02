"use client";

import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { blockCopies, CHAPTER_ALIASES, CHAPTERS, chapterStartPage, PAGES, type Block, type BookPage, type ChapterId } from "./book-content";

const TURN_MS = 700;
const GLYPHS = "ᔑʖᓵ↸ᒷ⎓⊣⍑╎⋮ꖌꖎᒲリ𝙹ᑑ∷ᓭℸ⚍⍊∴";
const SEARCH_LIMIT = 8;

type Tx = (copy: Copy, vars?: Record<string, string | number>) => string;

// ---------------------------------------------------------------------------
// Small external stores
// ---------------------------------------------------------------------------

function subscribeWide(callback: () => void) {
    const media = window.matchMedia("(min-width: 1024px)");
    media.addEventListener("change", callback);
    return () => media.removeEventListener("change", callback);
}

function subscribeHash(callback: () => void) {
    window.addEventListener("hashchange", callback);
    return () => window.removeEventListener("hashchange", callback);
}

/** A chapter id from the URL hash, including old names such as #media. */
function chapterFromHash(value: string): ChapterId | null {
    if (CHAPTERS.some((chapter) => chapter.id === value)) return value as ChapterId;
    return CHAPTER_ALIASES[value] ?? null;
}

/**
 * Reading progress kept in this browser: the page to resume from, the
 * chapters already opened (the experience level) and whether the "Explorer"
 * advancement was shown. Storage may be unavailable (private windows), so the
 * session copy in memory is the source of truth and storage is best effort.
 */
type Progress = { page: number | null; visited: ChapterId[]; explorer: boolean };
const PROGRESS_KEY = "hanogt-guide-progress";
const PROGRESS_EVENT = "hanogt:guide-progress";
const EMPTY_PROGRESS: Progress = { page: null, visited: [], explorer: false };
let sessionProgress: Progress | null = null;

function parseProgress(raw: string | null): Progress {
    try {
        const value = raw ? JSON.parse(raw) as Partial<Progress> : null;
        if (!value || typeof value !== "object") return EMPTY_PROGRESS;
        const page = typeof value.page === "number" && Number.isInteger(value.page) && value.page > 0 && value.page < PAGES.length ? value.page : null;
        const visited = Array.isArray(value.visited) ? CHAPTERS.map((chapter) => chapter.id).filter((id) => value.visited?.includes(id)) : [];
        return { page, visited, explorer: value.explorer === true };
    } catch {
        return EMPTY_PROGRESS;
    }
}

function storedProgress(): Progress {
    try {
        return parseProgress(window.localStorage.getItem(PROGRESS_KEY));
    } catch {
        return EMPTY_PROGRESS;
    }
}

function readProgress(): Progress {
    sessionProgress ??= storedProgress();
    return sessionProgress;
}

function writeProgress(next: Progress) {
    sessionProgress = next;
    try {
        window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
    } catch {
        // Progress still works for this visit.
    }
    window.dispatchEvent(new Event(PROGRESS_EVENT));
}

function subscribeProgress(callback: () => void) {
    const onStorage = (event: StorageEvent) => {
        if (event.key !== PROGRESS_KEY) return;
        sessionProgress = storedProgress();
        callback();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(PROGRESS_EVENT, callback);
    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(PROGRESS_EVENT, callback);
    };
}

/** Lower case without accents, with Turkish dotless i folded, for searching. */
function fold(text: string) {
    return text.toLocaleLowerCase("tr").normalize("NFD").replace(/\p{M}+/gu, "").replace(/ı/g, "i");
}

// A short "paper" rustle synthesized with WebAudio (no audio files needed).
let audioContext: AudioContext | null = null;
function playPageSound() {
    try {
        audioContext ??= new AudioContext();
        const context = audioContext;
        const length = Math.floor(context.sampleRate * 0.22);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < length; index += 1) {
            const t = index / length;
            data[index] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2) * (0.6 + 0.4 * Math.sin(t * 40));
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        const filter = context.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 2400;
        filter.Q.value = 0.8;
        const gain = context.createGain();
        gain.gain.value = 0.18;
        source.connect(filter).connect(gain).connect(context.destination);
        source.start();
    } catch {
        // Audio is optional.
    }
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

function PixelArrow({ direction }: { direction: "left" | "right" }) {
    return (
        <svg width="38" height="24" viewBox="0 0 19 12" shapeRendering="crispEdges" aria-hidden="true" className={direction === "left" ? "-scale-x-100" : ""}>
            <polygon points="1,4 11,4 11,1 18,6 11,11 11,8 1,8" fill="currentColor" stroke="#3b2410" strokeWidth="1" strokeLinejoin="miter" />
        </svg>
    );
}

function BlockView({ block, tx, onJump }: { block: Block; tx: Tx; onJump: (chapter: ChapterId) => void }) {
    switch (block.type) {
        case "cover":
            return (
                <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="grid grid-cols-5 gap-1" aria-hidden="true">
                        {"🟩🟩🟫🟩🟩🟫🟦🟦🟦🟫🟩🟦💎🟦🟩🟫🟦🟦🟦🟫🟩🟩🟫🟩🟩".match(/./gu)?.map((cell, index) => <span key={index} className="text-[18px] leading-none">{cell}</span>)}
                    </div>
                    <h2 className="mt-6 text-[34px] font-semibold leading-none text-[#3b2410]">Hanogt<br />{tx({ TR: "Kılavuzu", EN: "Guide" })}</h2>
                    <p className="mt-3 text-[16px] text-[#6b5433]">{tx({ TR: "Kod yaz · Oyun yap · Keşfet", EN: "Code · Build games · Explore" })}</p>
                    <p className="mt-8 text-[14px] text-[#8a7350]">{tx({ TR: "Yazan: HanStudios", EN: "Written by HanStudios" })}</p>
                    <p className="mt-6 text-[14px] text-[#1f6b3a]">{tx({ TR: "▶ Başlamak için sayfayı çevir", EN: "▶ Turn the page to begin" })}</p>
                </div>
            );
        case "toc":
            return (
                <ol className="space-y-1">
                    {CHAPTERS.map((chapter, index) => (
                        <li key={chapter.id}>
                            <button type="button" onClick={() => onJump(chapter.id)} className="group flex w-full items-center gap-2 rounded px-1 py-0.5 text-start text-[16px] text-[#2b1d0e] hover:bg-[#e9d9a8]">
                                <span className="w-6 text-[#8a7350]">{index + 1}.</span>
                                <span aria-hidden="true">{chapter.icon}</span>
                                <span className="flex-1 underline decoration-[#1f4fd1]/0 underline-offset-2 group-hover:text-[#1f4fd1] group-hover:decoration-[#1f4fd1]">{tx(chapter.title)}</span>
                                <span className="text-[#8a7350]">{chapterStartPage(chapter.id) + 1}</span>
                            </button>
                        </li>
                    ))}
                </ol>
            );
        case "p":
            return <p className="text-[16px] leading-[1.4]">{tx(block.text)}</p>;
        case "list":
            return (
                <ul className="space-y-1.5">
                    {block.items.map((item, index) => <li key={index} className="flex gap-2 text-[15.5px] leading-[1.35]"><span className="mt-[7px] h-2 w-2 shrink-0 bg-[#5b3d1f]" aria-hidden="true" /><span>{tx(item)}</span></li>)}
                </ul>
            );
        case "steps":
            return (
                <ol className="space-y-2">
                    {block.items.map((item, index) => (
                        <li key={index} className="flex gap-2.5 text-[15.5px] leading-[1.35]">
                            <span className="mc-slot grid h-6 w-6 shrink-0 place-items-center text-[13px] font-semibold text-white [text-shadow:1px_1px_0_#3f3f3f]">{index + 1}</span>
                            <span>{tx(item)}</span>
                        </li>
                    ))}
                </ol>
            );
        case "tip":
            return (
                <div className="mc-tooltip px-3 py-2">
                    <p className="text-[15px] text-[#55ffff]">✦ {tx(block.title)}</p>
                    <p className="mt-0.5 text-[14px] leading-[1.35] text-[#d8d8d8]">{tx(block.text)}</p>
                </div>
            );
        case "item":
            return (
                <div className="flex items-start gap-3">
                    <span className="mc-slot grid h-10 w-10 shrink-0 place-items-center text-[20px]" aria-hidden="true">{block.icon}</span>
                    <div className="min-w-0">
                        <p className="text-[16px] font-semibold leading-tight text-[#3b2410]">{tx(block.name)}</p>
                        <p className="text-[14.5px] leading-[1.3] text-[#4a3620]">{tx(block.text)}</p>
                    </div>
                </div>
            );
        case "keys":
            return (
                <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                    {block.items.map((item) => (
                        <div key={item.keys} className="contents">
                            <dt><kbd className="inline-block min-w-[3.2rem] border-2 border-[#3b2410] bg-[#fff8e1] px-1.5 text-center text-[13px] shadow-[2px_2px_0_#3b2410]" dir="ltr">{item.keys}</kbd></dt>
                            <dd className="text-[15px] leading-tight">{tx(item.text)}</dd>
                        </div>
                    ))}
                </dl>
            );
        case "code":
            return <pre dir="ltr" className="overflow-x-auto border-2 border-[#3b2410] bg-[#1d1b16] p-2.5 font-mono text-[11.5px] leading-[1.45] text-[#e8e2cf]">{block.code}</pre>;
        case "link":
            return <Link href={block.href} className="inline-block text-[16px] text-[#1f4fd1] underline decoration-2 underline-offset-2 hover:text-[#0d2f99]">➜ {tx(block.label)}</Link>;
        default:
            return null;
    }
}

function PageView({ page, index, tx, onJump, side, flash }: { page: BookPage | undefined; index: number; tx: Tx; onJump: (chapter: ChapterId) => void; side: "left" | "right" | "single"; flash?: boolean }) {
    const chapter = page ? CHAPTERS.find((entry) => entry.id === page.chapter) : null;
    return (
        <div className={`mc-page mc-font relative flex h-full w-full flex-col overflow-hidden ${side === "left" ? "rounded-s-md" : side === "right" ? "rounded-e-md" : "rounded-md"}`}>
            {side !== "single" ? <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 w-10 ${side === "left" ? "end-0 bg-gradient-to-l" : "start-0 bg-gradient-to-r"} from-[rgba(90,60,20,0.22)] to-transparent`} /> : null}
            {flash ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 animate-pulse shadow-[inset_0_0_0_4px_#55ffff,inset_0_0_40px_rgba(85,255,255,0.45)]" /> : null}
            {page ? (
                <>
                    <div className="flex items-center justify-between px-6 pt-4 text-[12.5px] text-[#8a7350]">
                        <span className="truncate">{chapter ? `${chapter.icon} ${tx(chapter.title)}` : ""}</span>
                        <span className="shrink-0">{tx({ TR: "Sayfa {page} / {total}", EN: "Page {page} of {total}" }, { page: index + 1, total: PAGES.length })}</span>
                    </div>
                    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pb-14 pt-3">
                        {page.title ? <h2 className="mb-3 text-[23px] font-semibold leading-tight text-[#3b2410]">{tx(page.title)}</h2> : null}
                        <div className="space-y-3.5">
                            {page.blocks.map((block, blockIndex) => <BlockView key={blockIndex} block={block} tx={tx} onJump={onJump} />)}
                        </div>
                    </div>
                </>
            ) : (
                <div className="grid flex-1 place-items-center text-[40px] opacity-40" aria-hidden="true">🪶</div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Search (the creative inventory's search box)
// ---------------------------------------------------------------------------

type SearchEntry = { pageIndex: number; chapter: ChapterId; title: string; titleFold: string; texts: string[]; haystack: string };

function GuideSearch({ tx, onOpen }: { tx: Tx; onOpen: (pageIndex: number) => void }) {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(0);
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();

    // Searches the shown language and the Turkish and English originals, so either works.
    const index = useMemo<SearchEntry[]>(() => PAGES.flatMap((page, pageIndex) => {
        if (!page.title) return [];
        const copies = page.blocks.flatMap(blockCopies);
        const title = tx(page.title);
        const texts = copies.map((copy) => tx(copy));
        const originals = [page.title, ...copies].flatMap((copy) => [copy.TR, copy.EN]);
        return [{ pageIndex, chapter: page.chapter, title, titleFold: fold(title), texts, haystack: fold([title, ...texts, ...originals].join("\n")) }];
    }), [tx]);

    const words = useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
    const results = useMemo(() => {
        if (!words.length) return [];
        return index
            .filter((entry) => words.every((word) => entry.haystack.includes(word)))
            .map((entry) => ({ entry, score: words.filter((word) => entry.titleFold.includes(word)).length }))
            .sort((a, b) => b.score - a.score || a.entry.pageIndex - b.entry.pageIndex)
            .slice(0, SEARCH_LIMIT)
            .map(({ entry }) => ({ ...entry, snippet: entry.texts.find((text) => words.some((word) => fold(text).includes(word))) ?? entry.texts[0] ?? "" }));
    }, [index, words]);

    const open = (pageIndex: number) => {
        setQuery("");
        setSelected(0);
        // Arrow keys turn the pages again once the result is open.
        inputRef.current?.blur();
        onOpen(pageIndex);
    };
    const active = Math.min(selected, Math.max(0, results.length - 1));
    const listOpen = focused && words.length > 0;

    return (
        <div className="relative mx-auto w-full max-w-md">
            <label className="mc-field mc-font flex h-11 items-center gap-2 px-3">
                <span aria-hidden="true" className="text-[18px]">🔎</span>
                <span className="sr-only">{tx({ TR: "Kılavuzda ara", EN: "Search the guide" })}</span>
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(value + 1, results.length - 1)); }
                        else if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(value - 1, 0)); }
                        else if (event.key === "Enter" && results[active]) { event.preventDefault(); open(results[active].pageIndex); }
                        else if (event.key === "Escape") setQuery("");
                    }}
                    placeholder={tx({ TR: "Kılavuzda ara: 2FA, remiks, tilemap…", EN: "Search the guide: 2FA, remix, tilemap…" })}
                    maxLength={60}
                    role="combobox"
                    aria-expanded={listOpen}
                    aria-controls={listId}
                    aria-activedescendant={results[active] ? `${listId}-${results[active].pageIndex}` : undefined}
                    aria-autocomplete="list"
                    className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-[#8f8f8f]"
                />
            </label>
            {listOpen ? (
                <ul id={listId} role="listbox" aria-label={tx({ TR: "Arama sonuçları", EN: "Search results" })} className="mc-tooltip mc-font absolute inset-x-0 top-full z-40 mt-2 max-h-[22rem] overflow-y-auto py-1">
                    {results.length ? results.map((result, resultIndex) => {
                        const chapter = CHAPTERS.find((entry) => entry.id === result.chapter);
                        return (
                            <li key={result.pageIndex} id={`${listId}-${result.pageIndex}`} role="option" aria-selected={resultIndex === active}>
                                <button
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => open(result.pageIndex)}
                                    onMouseEnter={() => setSelected(resultIndex)}
                                    className={`block w-full px-3 py-2 text-start ${resultIndex === active ? "bg-white/10" : ""}`}
                                >
                                    <span className="flex items-center gap-2 text-[15px] text-white">
                                        <span aria-hidden="true">{chapter?.icon}</span>
                                        <span className="min-w-0 flex-1 truncate">{result.title}</span>
                                        <span className="shrink-0 text-[12px] text-[#5555ff]">{tx({ TR: "Sayfa {page}", EN: "Page {page}" }, { page: result.pageIndex + 1 })}</span>
                                    </span>
                                    {result.snippet ? <span className="mt-0.5 block truncate text-[13px] text-[#a8a8a8]">{result.snippet}</span> : null}
                                </button>
                            </li>
                        );
                    }) : (
                        <li className="px-3 py-2 text-[14px] text-[#a8a8a8]">{tx({ TR: "Bu kitapta böyle bir sayfa yok. Başka bir kelime dene.", EN: "No page in this book matches. Try another word." })}</li>
                    )}
                </ul>
            ) : null}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Book
// ---------------------------------------------------------------------------

type Turn = { from: number; to: number };
type Toast = { icon: string; title: Copy };

export default function MinecraftBook() {
    const { tx } = useI18n();
    const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 1024px)").matches, () => true);
    const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
    const progress = useSyncExternalStore(subscribeProgress, readProgress, () => EMPTY_PROGRESS);
    const [page, setPage] = useState(0);
    const [activeChapter, setActiveChapter] = useState<ChapterId>("start");
    const [seenHash, setSeenHash] = useState("");
    const [turn, setTurn] = useState<Turn | null>(null);
    const [direction, setDirection] = useState<1 | -1>(1);
    const [plain, setPlain] = useState(false);
    const [sound, setSound] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [flashPage, setFlashPage] = useState<number | null>(null);
    const [hoverSlot, setHoverSlot] = useState<ChapterId | null>(null);
    const masterShown = useRef(false);
    // Advancement timers outlive dependency changes (a page turn ends right after a chapter opens).
    const advancementTimers = useRef<number[]>([]);
    const swipe = useRef<{ x: number; y: number } | null>(null);
    const flashTimer = useRef<number | null>(null);

    // Follow #chapter links (initial load and in-page anchors).
    if (hash !== seenHash) {
        setSeenHash(hash);
        const chapter = chapterFromHash(hash);
        if (chapter) {
            setPage(chapterStartPage(chapter));
            setActiveChapter(chapter);
        }
    }

    const spread = (index: number) => (wide ? index - (index % 2) : index);
    const current = spread(page);
    const step = wide ? 2 : 1;
    const lastStart = spread(PAGES.length - 1);
    const currentChapter = activeChapter;

    const syncHash = useCallback((index: number, chapter: ChapterId) => {
        const next = chapter === "start" && index === 0 ? "" : chapter;
        window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname + window.location.search);
        setSeenHash(next);
    }, []);

    const goTo = useCallback((target: number, chapterHint?: ChapterId) => {
        if (turn) return;
        const align = (index: number) => (wide ? index - (index % 2) : index);
        const to = Math.max(0, Math.min(align(target), lastStart));
        if (to === current) {
            if (chapterHint) {
                setActiveChapter(chapterHint);
                syncHash(to, chapterHint);
            }
            return;
        }
        // A spread whose right page opens a new chapter belongs to that chapter.
        const right = wide ? PAGES[to + 1] : undefined;
        const chapter = chapterHint ?? (right && chapterStartPage(right.chapter) === to + 1 ? right.chapter : PAGES[to].chapter);
        if (sound) playPageSound();
        setDirection(to > current ? 1 : -1);
        setActiveChapter(chapter);
        syncHash(to, chapter);
        if (!wide) {
            setPage(to);
            return;
        }
        setTurn({ from: current, to });
        window.setTimeout(() => {
            setPage(to);
            setTurn(null);
        }, TURN_MS);
    }, [turn, current, lastStart, sound, wide, syncHash]);

    const jump = useCallback((chapter: ChapterId) => {
        if (plain) {
            setActiveChapter(chapter);
            document.getElementById(`read-${chapter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        goTo(chapterStartPage(chapter), chapter);
    }, [goTo, plain]);

    // Advancements wait for each other instead of replacing the one on screen.
    const announce = useCallback((next: Toast) => {
        setToasts((list) => (list.some((item) => item.title.EN === next.title.EN) ? list : [...list, next]));
    }, []);
    const toast = toasts[0] ?? null;
    useEffect(() => {
        if (!toast) return;
        const hide = window.setTimeout(() => setToasts((list) => list.slice(1)), 4800);
        return () => window.clearTimeout(hide);
    }, [toast]);

    /** Opens a search result and makes its page glow for a moment. */
    const openPage = useCallback((pageIndex: number) => {
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        setFlashPage(pageIndex);
        flashTimer.current = window.setTimeout(() => setFlashPage(null), 1800);
        if (plain) {
            setActiveChapter(PAGES[pageIndex].chapter);
            document.getElementById(`read-page-${pageIndex + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        goTo(pageIndex, PAGES[pageIndex].chapter);
    }, [goTo, plain]);

    useEffect(() => () => {
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        for (const timer of advancementTimers.current) window.clearTimeout(timer);
    }, []);

    // "Guide Master" when the last page becomes visible.
    const reachedEnd = current + (wide ? 1 : 0) >= PAGES.length - 1;
    useEffect(() => {
        if (!reachedEnd || masterShown.current) return;
        masterShown.current = true;
        advancementTimers.current.push(window.setTimeout(() => announce({ icon: "🏆", title: { TR: "Kılavuz Ustası", EN: "Guide Master" } }), turn ? TURN_MS : 150));
    }, [reachedEnd, turn, announce]);

    // Remember the page and the chapters opened; "Explorer" once every chapter was opened.
    useEffect(() => {
        const saved = readProgress();
        const visited = saved.visited.includes(activeChapter) ? saved.visited : CHAPTERS.map((chapter) => chapter.id).filter((id) => id === activeChapter || saved.visited.includes(id));
        // A finished book has nothing to resume; the cover isn't worth remembering.
        const resumePage = reachedEnd ? null : current > 0 ? current : saved.page;
        const explorer = !saved.explorer && visited.length === CHAPTERS.length;
        if (visited !== saved.visited || resumePage !== saved.page || explorer) writeProgress({ page: resumePage, visited, explorer: saved.explorer || explorer });
        if (!explorer) return;
        advancementTimers.current.push(window.setTimeout(() => announce({ icon: "🗺️", title: { TR: "Kâşif: tüm bölümleri açtın", EN: "Explorer: every chapter opened" } }), turn ? TURN_MS : 400));
    }, [activeChapter, current, reachedEnd, turn, announce]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            if (plain || event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); goTo(current + step); }
            else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); goTo(current - step); }
            else if (event.key === "Home") { event.preventDefault(); goTo(0); }
            else if (event.key === "End") { event.preventDefault(); goTo(PAGES.length - 1); }
            else if (/^[0-9]$/.test(event.key)) {
                // 1–9 open the first nine chapters and 0 the tenth, like the hotbar.
                const chapter = CHAPTERS[event.key === "0" ? 9 : Number(event.key) - 1];
                if (chapter) jump(chapter.id);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [goTo, jump, current, step, plain]);

    const pagesFor = () => {
        if (!turn) return { left: current, right: current + 1 };
        return turn.to > turn.from ? { left: turn.from, right: turn.to + 1 } : { left: turn.to, right: turn.from + 1 };
    };
    const underlay = pagesFor();

    const glyphs = Array.from({ length: 18 }, (_, index) => ({
        char: [...GLYPHS][(index * 7) % [...GLYPHS].length],
        left: `${(index * 53) % 100}%`,
        top: `${55 + ((index * 29) % 40)}%`,
        dx: `${((index * 17) % 60) - 30}px`,
        duration: `${6 + (index % 5)}s`,
        delay: `${-(index * 0.9)}s`,
    }));

    const level = progress.visited.length;
    const readFraction = (Math.min(PAGES.length - 1, current + (wide ? 1 : 0)) + 1) / PAGES.length;
    const resumePage = progress.page !== null && progress.page > 1 && current === 0 && !plain ? progress.page : null;

    const hotbar = (
        <div className="mc-hotbar relative mx-auto grid w-full max-w-[33rem] grid-cols-10 gap-0.5 p-1" role="tablist" aria-label={tx({ TR: "Bölümler", EN: "Chapters" })}>
            {CHAPTERS.map((chapter, index) => {
                const active = chapter.id === currentChapter;
                const key = index === 9 ? 0 : index + 1;
                return (
                    <div key={chapter.id} className="relative">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => jump(chapter.id)}
                            onMouseEnter={() => setHoverSlot(chapter.id)}
                            onMouseLeave={() => setHoverSlot(null)}
                            onFocus={() => setHoverSlot(chapter.id)}
                            onBlur={() => setHoverSlot(null)}
                            className={`relative grid aspect-square w-full place-items-center text-[16px] transition sm:text-[22px] ${active ? "z-10 scale-110 outline outline-[3px] outline-[#f4f4f4] [box-shadow:0_0_0_5px_#1e1e1e]" : "hover:bg-white/10"}`}
                            aria-label={`${index + 1}. ${tx(chapter.title)}`}
                        >
                            <span aria-hidden="true">{chapter.icon}</span>
                            <span className="mc-font absolute bottom-0 end-0.5 text-[10px] text-white [text-shadow:1px_1px_0_#3f3f3f] sm:text-[11px]" aria-hidden="true">{key}</span>
                            {progress.visited.includes(chapter.id) ? null : <span className="absolute start-0.5 top-0.5 h-1.5 w-1.5 bg-[#ffff55] shadow-[0_0_4px_#ffff55]" aria-hidden="true" />}
                        </button>
                        <AnimatePresence>
                            {hoverSlot === chapter.id ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.12 }}
                                    className="mc-tooltip mc-font pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 w-max max-w-[14rem] -translate-x-1/2 px-2.5 py-1.5 text-start"
                                >
                                    <p className="text-[15px]" style={{ color: "#ffffff" }}>{tx(chapter.item)}</p>
                                    <p className="text-[13px] text-[#a8a8a8]">{tx(chapter.title)}</p>
                                    <p className="text-[12px] text-[#5555ff]">{tx({ TR: "Sayfa {page}", EN: "Page {page}" }, { page: chapterStartPage(chapter.id) + 1 })}</p>
                                    {progress.visited.includes(chapter.id) ? null : <p className="text-[12px] text-[#ffff55]">{tx({ TR: "Henüz açılmadı", EN: "Not opened yet" })}</p>}
                                </motion.div>
                            ) : null}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );

    return (
        <section className="mc-planks relative isolate min-h-dvh overflow-hidden pb-16 pt-24">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.65))]" />
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
                {glyphs.map((glyph, index) => (
                    <span
                        key={index}
                        className="mc-glyph absolute text-[18px] text-[#b9a7ff] [text-shadow:0_0_8px_rgba(160,120,255,0.9)]"
                        style={{ left: glyph.left, top: glyph.top, ["--glyph-dx" as string]: glyph.dx, ["--glyph-duration" as string]: glyph.duration, ["--glyph-delay" as string]: glyph.delay } as React.CSSProperties}
                    >
                        {glyph.char}
                    </span>
                ))}
            </div>

            <div className="mx-auto max-w-6xl px-4">
                <div className="mc-font text-center">
                    <h1 className="text-[34px] font-semibold text-[#fcefc4] [text-shadow:3px_3px_0_#2b1a0c] sm:text-[44px]">📖 {tx({ TR: "Hanogt Kılavuzu", EN: "The Hanogt Guide" })}</h1>
                    <p className="mt-1 text-[16px] text-[#e8d6a5] [text-shadow:2px_2px_0_#2b1a0c]">{tx({ TR: "Sayfaları çevir, bölümler arasında gez, Hanogt ustası ol.", EN: "Turn the pages, hop between chapters, become a Hanogt master." })}</p>
                </div>

                <div className="mt-6 space-y-3">
                    <GuideSearch tx={tx} onOpen={openPage} />
                    {resumePage !== null ? (
                        <div className="mc-font text-center">
                            <button type="button" onClick={() => openPage(resumePage)} className="mc-button h-10 px-4 text-[15px]">
                                📌 {tx({ TR: "Kaldığın yerden devam et: Sayfa {page}", EN: "Continue where you left off: page {page}" }, { page: resumePage + 1 })}
                            </button>
                        </div>
                    ) : null}
                </div>

                <div className="mt-8">{hotbar}</div>

                {plain ? (
                    <article className="mx-auto mt-8 max-w-3xl space-y-6 rounded-2xl bg-[#fbf3d6] p-6 text-[#2b1d0e] shadow-2xl sm:p-10">
                        {PAGES.map((entry, index) => {
                            const chapterStart = index === chapterStartPage(entry.chapter);
                            const chapter = CHAPTERS.find((item) => item.id === entry.chapter);
                            return (
                                <section key={index} id={`read-page-${index + 1}`} className={`scroll-mt-24 space-y-3 border-b border-[#e4d19c] pb-6 last:border-0 ${flashPage === index ? "rounded-lg ring-4 ring-[#55ffff]/70" : ""}`}>
                                    {chapterStart && chapter ? <p id={`read-${entry.chapter}`} className="scroll-mt-24 text-[13px] font-bold uppercase tracking-wider text-[#8a7350]">{chapter.icon} {tx(chapter.title)}</p> : null}
                                    {entry.title ? <h2 className="text-2xl font-black">{tx(entry.title)}</h2> : null}
                                    {entry.blocks.map((block, blockIndex) => <BlockView key={blockIndex} block={block} tx={tx} onJump={jump} />)}
                                </section>
                            );
                        })}
                    </article>
                ) : (
                    <div
                        className="relative mx-auto mt-8 select-none"
                        onPointerDown={(event) => { swipe.current = { x: event.clientX, y: event.clientY }; }}
                        onPointerUp={(event) => {
                            const start = swipe.current;
                            swipe.current = null;
                            if (!start || event.pointerType === "mouse") return;
                            const dx = event.clientX - start.x;
                            const dy = event.clientY - start.y;
                            if (Math.abs(dx) > 50 && Math.abs(dy) < 60) goTo(current + (dx < 0 ? step : -step));
                        }}
                    >
                        {wide ? (
                            <div className="relative mx-auto h-[640px] w-full max-w-[980px] rounded-lg border-[12px] border-[#6b4423] bg-[#6b4423] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8),inset_0_0_0_2px_#3d2512] [perspective:2400px]">
                                <div className="absolute inset-0 flex">
                                    <div className="h-full w-1/2"><PageView page={PAGES[underlay.left]} index={underlay.left} tx={tx} onJump={jump} side="left" flash={!turn && flashPage === underlay.left} /></div>
                                    <div className="h-full w-1/2"><PageView page={PAGES[underlay.right]} index={underlay.right} tx={tx} onJump={jump} side="right" flash={!turn && flashPage === underlay.right} /></div>
                                </div>
                                <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-3 -translate-x-1/2 bg-gradient-to-r from-[rgba(60,35,10,0.35)] via-[rgba(60,35,10,0.6)] to-[rgba(60,35,10,0.35)]" aria-hidden="true" />
                                {turn ? (
                                    <motion.div
                                        className="absolute inset-y-0 left-1/2 z-20 w-1/2 origin-left [transform-style:preserve-3d]"
                                        initial={{ rotateY: turn.to > turn.from ? 0 : -180 }}
                                        animate={{ rotateY: turn.to > turn.from ? -180 : 0 }}
                                        transition={{ duration: TURN_MS / 1000, ease: [0.45, 0.05, 0.25, 1] }}
                                    >
                                        <div className="absolute inset-0 [backface-visibility:hidden]">
                                            <PageView page={PAGES[turn.to > turn.from ? turn.from + 1 : turn.to + 1]} index={turn.to > turn.from ? turn.from + 1 : turn.to + 1} tx={tx} onJump={jump} side="right" />
                                        </div>
                                        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                                            <PageView page={PAGES[turn.to > turn.from ? turn.to : turn.from]} index={turn.to > turn.from ? turn.to : turn.from} tx={tx} onJump={jump} side="left" />
                                        </div>
                                    </motion.div>
                                ) : null}
                                <button type="button" onClick={() => goTo(current - step)} disabled={current === 0 || Boolean(turn)} className="absolute bottom-3 left-5 z-30 p-1 text-[#d9b36c] drop-shadow-[2px_2px_0_rgba(91,61,31,0.45)] transition hover:text-[#f5d58a] disabled:opacity-0" aria-label={tx({ TR: "Önceki sayfa", EN: "Previous page" })}><PixelArrow direction="left" /></button>
                                <button type="button" onClick={() => goTo(current + step)} disabled={current >= lastStart || Boolean(turn)} className="absolute bottom-3 right-5 z-30 p-1 text-[#d9b36c] drop-shadow-[2px_2px_0_rgba(91,61,31,0.45)] transition hover:text-[#f5d58a] disabled:opacity-0" aria-label={tx({ TR: "Sonraki sayfa", EN: "Next page" })}><PixelArrow direction="right" /></button>
                            </div>
                        ) : (
                            <div className="relative mx-auto h-[min(76dvh,640px)] w-full max-w-[460px] rounded-lg border-[10px] border-[#6b4423] bg-[#6b4423] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] [perspective:1600px]">
                                <AnimatePresence initial={false} custom={direction} mode="popLayout">
                                    <motion.div
                                        key={current}
                                        custom={direction}
                                        className="absolute inset-0"
                                        style={{ transformOrigin: direction > 0 ? "left center" : "right center" }}
                                        initial={{ rotateY: direction > 0 ? 70 : -70, opacity: 0 }}
                                        animate={{ rotateY: 0, opacity: 1 }}
                                        exit={{ rotateY: direction > 0 ? -70 : 70, opacity: 0 }}
                                        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                                    >
                                        <PageView page={PAGES[current]} index={current} tx={tx} onJump={jump} side="single" flash={flashPage === current} />
                                    </motion.div>
                                </AnimatePresence>
                                <button type="button" onClick={() => goTo(current - 1)} disabled={current === 0} className="absolute bottom-2 left-3 z-30 p-1 text-[#d9b36c] transition hover:text-[#f5d58a] disabled:opacity-0" aria-label={tx({ TR: "Önceki sayfa", EN: "Previous page" })}><PixelArrow direction="left" /></button>
                                <button type="button" onClick={() => goTo(current + 1)} disabled={current >= PAGES.length - 1} className="absolute bottom-2 right-3 z-30 p-1 text-[#d9b36c] transition hover:text-[#f5d58a] disabled:opacity-0" aria-label={tx({ TR: "Sonraki sayfa", EN: "Next page" })}><PixelArrow direction="right" /></button>
                            </div>
                        )}
                    </div>
                )}

                {/* Experience bar: the number is how many chapters you opened, the bar how far you read. */}
                <div className="mx-auto mt-9 max-w-[980px]">
                    <div className="relative">
                        <p className="mc-font absolute -top-[26px] left-1/2 -translate-x-1/2 text-[22px] leading-none text-[#80ff20] [text-shadow:2px_0_0_#000,-2px_0_0_#000,0_2px_0_#000,0_-2px_0_#000]" aria-hidden="true">{level}</p>
                        <div className="mc-xp relative h-3 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(readFraction * 100)} aria-label={tx({ TR: "Okunan sayfalar", EN: "Pages read" })}>
                            <motion.div className="mc-xp-fill h-full" initial={false} animate={{ width: `${readFraction * 100}%` }} transition={{ duration: 0.4 }} />
                            <div className="mc-xp-notches pointer-events-none absolute inset-0" aria-hidden="true" />
                        </div>
                    </div>
                    <p className="mc-font mt-2 text-center text-[14px] text-[#e8d6a5] [text-shadow:2px_2px_0_#2b1a0c]">
                        {tx({ TR: "Seviye {level} · {visited}/{total} bölüm keşfedildi", EN: "Level {level} · {visited}/{total} chapters explored" }, { level, visited: level, total: CHAPTERS.length })}
                    </p>
                </div>

                <div className="mc-font mt-4 flex flex-wrap items-center justify-center gap-2 text-[15px]">
                    <button type="button" onClick={() => setPlain((value) => !value)} className="mc-button h-10 px-4">{plain ? tx({ TR: "📖 Kitap görünümü", EN: "📖 Book view" }) : tx({ TR: "📜 Düz metin", EN: "📜 Plain text" })}</button>
                    <button type="button" onClick={() => setSound((value) => !value)} aria-pressed={sound} className="mc-button h-10 px-4">{sound ? tx({ TR: "🔊 Ses açık", EN: "🔊 Sound on" }) : tx({ TR: "🔇 Ses kapalı", EN: "🔇 Sound off" })}</button>
                    {!plain ? <span className="px-2 text-[14px] text-[#e8d6a5] [text-shadow:2px_2px_0_#2b1a0c]">{tx({ TR: "← → sayfa çevir · 1–9, 0 bölüm", EN: "← → turn pages · 1–9, 0 chapters" })}</span> : null}
                </div>
            </div>

            <AnimatePresence>
                {toast ? (
                    <motion.div
                        key={toast.title.EN}
                        role="status"
                        initial={{ x: 360, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 360, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 26 }}
                        className="mc-toast mc-font fixed end-4 top-20 z-50 flex w-72 items-center gap-3 p-3"
                    >
                        <span className="mc-slot grid h-10 w-10 shrink-0 place-items-center text-[22px]">{toast.icon}</span>
                        <div>
                            <p className="text-[15px] text-[#ffff55]">{tx({ TR: "Başarım kazanıldı!", EN: "Advancement made!" })}</p>
                            <p className="text-[15px] text-white">{tx(toast.title)}</p>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </section>
    );
}
