"use client";

import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { CHAPTERS, chapterStartPage, PAGES, type Block, type BookPage, type ChapterId } from "./book-content";

const TURN_MS = 700;
const GLYPHS = "ᔑʖᓵ↸ᒷ⎓⊣⍑╎⋮ꖌꖎᒲリ𝙹ᑑ∷ᓭℸ⚍⍊∴";

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

function isChapter(value: string): value is ChapterId {
    return CHAPTERS.some((chapter) => chapter.id === value);
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

function BlockView({ block, tx, onJump }: { block: Block; tx: (copy: Copy, vars?: Record<string, string | number>) => string; onJump: (chapter: ChapterId) => void }) {
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
                                <span className="w-5 text-[#8a7350]">{index + 1}.</span>
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

function PageView({ page, index, tx, onJump, side }: { page: BookPage | undefined; index: number; tx: (copy: Copy, vars?: Record<string, string | number>) => string; onJump: (chapter: ChapterId) => void; side: "left" | "right" | "single" }) {
    const chapter = page ? CHAPTERS.find((entry) => entry.id === page.chapter) : null;
    return (
        <div className={`mc-page mc-font relative flex h-full w-full flex-col overflow-hidden ${side === "left" ? "rounded-s-md" : side === "right" ? "rounded-e-md" : "rounded-md"}`}>
            {side !== "single" ? <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 w-10 ${side === "left" ? "end-0 bg-gradient-to-l" : "start-0 bg-gradient-to-r"} from-[rgba(90,60,20,0.22)] to-transparent`} /> : null}
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
// Book
// ---------------------------------------------------------------------------

type Turn = { from: number; to: number };

export default function MinecraftBook() {
    const { tx } = useI18n();
    const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 1024px)").matches, () => true);
    const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
    const [page, setPage] = useState(0);
    const [activeChapter, setActiveChapter] = useState<ChapterId>("start");
    const [seenHash, setSeenHash] = useState("");
    const [turn, setTurn] = useState<Turn | null>(null);
    const [direction, setDirection] = useState<1 | -1>(1);
    const [plain, setPlain] = useState(false);
    const [sound, setSound] = useState(false);
    const [achievement, setAchievement] = useState(false);
    const [hoverSlot, setHoverSlot] = useState<ChapterId | null>(null);
    const achievementShown = useRef(false);
    const swipe = useRef<{ x: number; y: number } | null>(null);

    // Follow #chapter links (initial load and in-page anchors).
    if (hash !== seenHash) {
        setSeenHash(hash);
        if (isChapter(hash)) {
            setPage(chapterStartPage(hash));
            setActiveChapter(hash);
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

    const jump = useCallback((chapter: ChapterId) => goTo(chapterStartPage(chapter), chapter), [goTo]);

    // Achievement when the last page becomes visible.
    const reachedEnd = current + (wide ? 1 : 0) >= PAGES.length - 1;
    useEffect(() => {
        if (!reachedEnd || achievementShown.current) return;
        achievementShown.current = true;
        const show = window.setTimeout(() => setAchievement(true), turn ? TURN_MS : 150);
        const hide = window.setTimeout(() => setAchievement(false), 5200);
        return () => {
            window.clearTimeout(show);
            window.clearTimeout(hide);
        };
    }, [reachedEnd, turn]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            if (plain) return;
            if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); goTo(current + step); }
            else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); goTo(current - step); }
            else if (event.key === "Home") { event.preventDefault(); goTo(0); }
            else if (event.key === "End") { event.preventDefault(); goTo(PAGES.length - 1); }
            else if (/^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
                const chapter = CHAPTERS[Number(event.key) - 1];
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

    const hotbar = (
        <div className="mc-hotbar relative mx-auto flex w-max gap-0.5 p-1" role="tablist" aria-label={tx({ TR: "Bölümler", EN: "Chapters" })}>
            {CHAPTERS.map((chapter, index) => {
                const active = chapter.id === currentChapter;
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
                            className={`relative grid h-9 w-9 place-items-center text-[18px] transition sm:h-12 sm:w-12 sm:text-[22px] ${active ? "z-10 scale-110 outline outline-[3px] outline-[#f4f4f4] [box-shadow:0_0_0_5px_#1e1e1e]" : "hover:bg-white/10"}`}
                            aria-label={`${index + 1}. ${tx(chapter.title)}`}
                        >
                            <span aria-hidden="true">{chapter.icon}</span>
                            <span className="mc-font absolute bottom-0 end-0.5 text-[11px] text-white [text-shadow:1px_1px_0_#3f3f3f]" aria-hidden="true">{index + 1}</span>
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

                <div className="mt-6">{hotbar}</div>

                {plain ? (
                    <article className="mx-auto mt-8 max-w-3xl space-y-6 rounded-2xl bg-[#fbf3d6] p-6 text-[#2b1d0e] shadow-2xl sm:p-10">
                        {PAGES.map((entry, index) => (
                            <section key={index} id={index === chapterStartPage(entry.chapter) ? `read-${entry.chapter}` : undefined} className="space-y-3 border-b border-[#e4d19c] pb-6 last:border-0">
                                {index === chapterStartPage(entry.chapter) ? <p className="text-[13px] font-bold uppercase tracking-wider text-[#8a7350]">{CHAPTERS.find((chapter) => chapter.id === entry.chapter)?.icon} {tx(CHAPTERS.find((chapter) => chapter.id === entry.chapter)?.title ?? { TR: "", EN: "" })}</p> : null}
                                {entry.title ? <h2 className="text-2xl font-black">{tx(entry.title)}</h2> : null}
                                {entry.blocks.map((block, blockIndex) => <BlockView key={blockIndex} block={block} tx={tx} onJump={(chapter) => document.getElementById(`read-${chapter}`)?.scrollIntoView({ behavior: "smooth" })} />)}
                            </section>
                        ))}
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
                                    <div className="h-full w-1/2"><PageView page={PAGES[underlay.left]} index={underlay.left} tx={tx} onJump={jump} side="left" /></div>
                                    <div className="h-full w-1/2"><PageView page={PAGES[underlay.right]} index={underlay.right} tx={tx} onJump={jump} side="right" /></div>
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
                                        <PageView page={PAGES[current]} index={current} tx={tx} onJump={jump} side="single" />
                                    </motion.div>
                                </AnimatePresence>
                                <button type="button" onClick={() => goTo(current - 1)} disabled={current === 0} className="absolute bottom-2 left-3 z-30 p-1 text-[#d9b36c] transition hover:text-[#f5d58a] disabled:opacity-0" aria-label={tx({ TR: "Önceki sayfa", EN: "Previous page" })}><PixelArrow direction="left" /></button>
                                <button type="button" onClick={() => goTo(current + 1)} disabled={current >= PAGES.length - 1} className="absolute bottom-2 right-3 z-30 p-1 text-[#d9b36c] transition hover:text-[#f5d58a] disabled:opacity-0" aria-label={tx({ TR: "Sonraki sayfa", EN: "Next page" })}><PixelArrow direction="right" /></button>
                            </div>
                        )}
                        <div className="mx-auto mt-4 h-2 max-w-[980px] overflow-hidden rounded-full bg-black/40" aria-hidden="true">
                            <motion.div className="h-full bg-gradient-to-r from-[#55ff55] to-[#3fbf3f]" animate={{ width: `${((Math.min(PAGES.length - 1, current + (wide ? 1 : 0)) + 1) / PAGES.length) * 100}%` }} transition={{ duration: 0.4 }} />
                        </div>
                    </div>
                )}

                <div className="mc-font mt-5 flex flex-wrap items-center justify-center gap-2 text-[15px]">
                    <button type="button" onClick={() => setPlain((value) => !value)} className="mc-button h-10 px-4">{plain ? tx({ TR: "📖 Kitap görünümü", EN: "📖 Book view" }) : tx({ TR: "📜 Düz metin", EN: "📜 Plain text" })}</button>
                    <button type="button" onClick={() => setSound((value) => !value)} aria-pressed={sound} className="mc-button h-10 px-4">{sound ? tx({ TR: "🔊 Ses açık", EN: "🔊 Sound on" }) : tx({ TR: "🔇 Ses kapalı", EN: "🔇 Sound off" })}</button>
                    {!plain ? <span className="px-2 text-[14px] text-[#e8d6a5] [text-shadow:2px_2px_0_#2b1a0c]">{tx({ TR: "← → sayfa çevir · 1–9 bölüm", EN: "← → turn pages · 1–9 chapters" })}</span> : null}
                </div>
            </div>

            <AnimatePresence>
                {achievement ? (
                    <motion.div
                        role="status"
                        initial={{ x: 360, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 360, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 26 }}
                        className="mc-toast mc-font fixed end-4 top-20 z-50 flex w-72 items-center gap-3 p-3"
                    >
                        <span className="mc-slot grid h-10 w-10 shrink-0 place-items-center text-[22px]">🏆</span>
                        <div>
                            <p className="text-[15px] text-[#ffff55]">{tx({ TR: "Başarım kazanıldı!", EN: "Advancement made!" })}</p>
                            <p className="text-[15px] text-white">{tx({ TR: "Kılavuz Ustası", EN: "Guide Master" })}</p>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </section>
    );
}
