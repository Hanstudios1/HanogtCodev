"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock3, ImageOff, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Spinner, cx, storageGet, storageSet } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import { SocialRequestError, socialApi } from "@/lib/social/api";
import { EMOJI_BY_CATEGORY, EMOJI_CATEGORY_COPY, EMOJI_CATEGORY_IDS, emojiByChar, searchEmoji, type EmojiCategoryId, type EmojiEntry } from "@/lib/social/emoji";
import { GIF_ATTRIBUTION, type GifItem, type GifProvider } from "@/lib/social/gif";
import { DM_STICKERS } from "@/lib/social/model";
import { gifBox } from "./GifView";

const C = {
    emoji: { TR: "Emoji", EN: "Emoji" },
    gifs: { TR: "GIF", EN: "GIFs" },
    stickers: { TR: "Çıkartma", EN: "Stickers" },
    tabs: { TR: "İfade türleri", EN: "Expression types" },
    searchEmoji: { TR: "Emoji ara", EN: "Search emoji" },
    searchGifs: { TR: "GIF ara", EN: "Search GIFs" },
    recent: { TR: "Son kullanılanlar", EN: "Recently used" },
    noEmoji: { TR: "Eşleşen emoji yok.", EN: "No matching emoji." },
    trending: { TR: "Şu an popüler", EN: "Trending now" },
    results: { TR: "\"{query}\" için sonuçlar", EN: "Results for \"{query}\"" },
    noGifs: { TR: "GIF bulunamadı. Başka bir kelime dene.", EN: "No GIFs found. Try another word." },
    notConfigured: { TR: "GIF araması bu sitede henüz açılmadı.", EN: "GIF search isn't set up on this site yet." },
    unavailable: { TR: "GIF'ler şu anda yüklenemiyor.", EN: "GIFs can't be loaded right now." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    more: { TR: "Daha fazla yükle", EN: "Load more" },
    poweredBy: { TR: "{provider} tarafından sağlanır", EN: "Powered by {provider}" },
    close: { TR: "Kapat", EN: "Close" },
    categories: { TR: "Emoji grupları", EN: "Emoji groups" },
} satisfies Record<string, Copy>;

export type ExpressionTab = "emoji" | "gif" | "sticker";

const RECENT_KEY = "hanogt:social:recent-emoji";
const RECENT_MAX = 24;

function readRecent(): string[] {
    try {
        const value = JSON.parse(storageGet(RECENT_KEY) || "[]") as unknown;
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(emojiByChar(item))).slice(0, RECENT_MAX) : [];
    } catch {
        return [];
    }
}

/** Remembers an emoji for the "Recently used" row (this browser only). */
export function rememberEmoji(char: string) {
    if (!emojiByChar(char)) return;
    storageSet(RECENT_KEY, JSON.stringify([char, ...readRecent().filter((item) => item !== char)].slice(0, RECENT_MAX)));
}

type PickerProps = {
    open: boolean;
    tab: ExpressionTab;
    onTab: (tab: ExpressionTab) => void;
    onClose: () => void;
    onEmoji: (char: string) => void;
    onGif: (gif: GifItem) => void;
    /** Direct messages: big emoji stickers. */
    onSticker?: (emoji: string) => void;
    gifAutoplay: boolean;
};

/**
 * Discord's expression picker above the message box: emoji (search, groups,
 * recently used), GIFs from the server's GIF search, and (in direct
 * messages) stickers. Escape or a click outside closes it.
 */
export default function ExpressionPicker({ open, tab, onTab, onClose, onEmoji, onGif, onSticker, gifAutoplay }: PickerProps) {
    const { tx } = useI18n();
    const panelRef = useRef<HTMLDivElement | null>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node) || panelRef.current?.contains(target)) return;
            // The buttons that open the picker toggle it themselves.
            if (target instanceof Element && target.closest("[data-expression-toggle]")) return;
            onCloseRef.current();
        };
        document.addEventListener("pointerdown", onPointer);
        return () => document.removeEventListener("pointerdown", onPointer);
    }, [open]);

    const tabs: Array<{ id: ExpressionTab; label: string }> = [
        { id: "emoji", label: tx(C.emoji) },
        { id: "gif", label: tx(C.gifs) },
        ...(onSticker ? [{ id: "sticker" as const, label: tx(C.stickers) }] : []),
    ];

    const onKeyDown = (event: ReactKeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    ref={panelRef}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.14 }}
                    onKeyDown={onKeyDown}
                    className="absolute bottom-full end-0 z-40 mb-2 flex h-[min(26rem,62dvh)] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                >
                    <div className="flex items-center gap-1 border-b border-zinc-200 px-2 pt-2 dark:border-white/10" role="tablist" aria-label={tx(C.tabs)}>
                        {tabs.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === entry.id}
                                onClick={() => onTab(entry.id)}
                                className={cx("rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-bold transition", tab === entry.id ? "border-indigo-500 text-zinc-900 dark:text-white" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200")}
                            >
                                {entry.label}
                            </button>
                        ))}
                        <button type="button" onClick={onClose} className="ms-auto rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.close)}><X className="h-4 w-4" aria-hidden /></button>
                    </div>
                    {tab === "emoji" && <EmojiTab onPick={onEmoji} />}
                    {tab === "gif" && <GifTab onPick={onGif} autoplay={gifAutoplay} />}
                    {tab === "sticker" && onSticker && <StickerTab onPick={onSticker} />}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
    return (
        <label className="relative m-2 block">
            <span className="sr-only">{label}</span>
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <input
                autoFocus
                type="search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={label}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pe-3 ps-8 text-sm outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/30 dark:border-white/10 dark:bg-zinc-950"
            />
        </label>
    );
}

function EmojiButton({ entry, onPick, onHover }: { entry: EmojiEntry; onPick: (char: string) => void; onHover: (entry: EmojiEntry | null) => void }) {
    return (
        <button
            type="button"
            onClick={() => onPick(entry.char)}
            onPointerEnter={() => onHover(entry)}
            onFocus={() => onHover(entry)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[22px] leading-none transition hover:scale-110 hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
            aria-label={`:${entry.name}:`}
            title={`:${entry.name}:`}
        >
            {entry.char}
        </button>
    );
}

function EmojiTab({ onPick }: { onPick: (char: string) => void }) {
    const { tx } = useI18n();
    const [query, setQuery] = useState("");
    const [hovered, setHovered] = useState<EmojiEntry | null>(null);
    const [recent] = useState(() => readRecent().map((char) => emojiByChar(char)).filter((entry): entry is EmojiEntry => Boolean(entry)));
    const results = useMemo(() => (query.trim() ? searchEmoji(query, 96) : null), [query]);

    const pick = useCallback((char: string) => {
        rememberEmoji(char);
        onPick(char);
    }, [onPick]);

    const jump = (id: EmojiCategoryId) => {
        setQuery("");
        window.requestAnimationFrame(() => document.getElementById(`emoji-group-${id}`)?.scrollIntoView({ block: "start" }));
    };

    return (
        <>
            <SearchBox value={query} onChange={setQuery} label={tx(C.searchEmoji)} />
            {!results && (
                <div className="flex gap-0.5 overflow-x-auto px-2 pb-1" role="group" aria-label={tx(C.categories)}>
                    {EMOJI_CATEGORY_IDS.map((id) => (
                        <button key={id} type="button" onClick={() => jump(id)} className="shrink-0 rounded-lg p-1.5 text-lg leading-none grayscale transition hover:bg-zinc-100 hover:grayscale-0 dark:hover:bg-zinc-800" aria-label={tx(EMOJI_CATEGORY_COPY[id].label)} title={tx(EMOJI_CATEGORY_COPY[id].label)}>
                            {EMOJI_CATEGORY_COPY[id].icon}
                        </button>
                    ))}
                </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" onPointerLeave={() => setHovered(null)}>
                {results ? (
                    results.length ? (
                        <div className="grid grid-cols-8 gap-0.5">{results.map((entry) => <EmojiButton key={entry.char} entry={entry} onPick={pick} onHover={setHovered} />)}</div>
                    ) : <p className="px-2 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{tx(C.noEmoji)}</p>
                ) : (
                    <>
                        {recent.length > 0 && (
                            <section aria-label={tx(C.recent)}>
                                <h3 className="flex items-center gap-1 px-1 pb-1 pt-2 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400"><Clock3 className="h-3 w-3" aria-hidden />{tx(C.recent)}</h3>
                                <div className="grid grid-cols-8 gap-0.5">{recent.map((entry) => <EmojiButton key={`recent-${entry.char}`} entry={entry} onPick={pick} onHover={setHovered} />)}</div>
                            </section>
                        )}
                        {EMOJI_CATEGORY_IDS.map((id) => (
                            <section key={id} id={`emoji-group-${id}`} aria-label={tx(EMOJI_CATEGORY_COPY[id].label)} className="scroll-mt-1">
                                <h3 className="px-1 pb-1 pt-2 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(EMOJI_CATEGORY_COPY[id].label)}</h3>
                                <div className="grid grid-cols-8 gap-0.5">{EMOJI_BY_CATEGORY[id].map((entry) => <EmojiButton key={entry.char} entry={entry} onPick={pick} onHover={setHovered} />)}</div>
                            </section>
                        ))}
                    </>
                )}
            </div>
            <div className="flex h-10 shrink-0 items-center gap-2 border-t border-zinc-200 px-3 text-sm dark:border-white/10" aria-hidden>
                {hovered && <><span className="text-xl leading-none">{hovered.char}</span><span className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">:{hovered.name}:</span></>}
            </div>
        </>
    );
}

function StickerTab({ onPick }: { onPick: (emoji: string) => void }) {
    return (
        <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-2 overflow-y-auto p-3 sm:grid-cols-5">
            {DM_STICKERS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => onPick(emoji)} className="flex aspect-square items-center justify-center rounded-2xl bg-zinc-50 text-4xl leading-none transition hover:scale-105 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800" aria-label={emoji}>{emoji}</button>
            ))}
        </div>
    );
}

type GifError = "not_configured" | "unavailable";
/** What the GIF tab shows: the answer for one search (`key`), with any pages loaded after the first. */
type GifState = { key: string; items: GifItem[]; next: number | null; provider: GifProvider | null; error: GifError | null; more: "idle" | "loading" | "failed" };

const gifErrorOf = (error: unknown): GifError => (error instanceof SocialRequestError && error.code === "not_configured" ? "not_configured" : "unavailable");

function GifTab({ onPick, autoplay }: { onPick: (gif: GifItem) => void; autoplay: boolean }) {
    const { tx, language } = useI18n();
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<GifState | null>(null);
    const lang = language === "TR" ? "tr" : "en";
    // A new search or a retry is a new key; until its answer arrives the tab shows a spinner.
    const key = `${lang}|${attempt}|${debounced}`;
    const current = state?.key === key ? state : null;

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 350);
        return () => window.clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        let active = true;
        socialApi.gifs(debounced, 1, lang)
            .then((result) => { if (active) setState({ key, items: result.items, next: result.next, provider: result.provider, error: null, more: "idle" }); })
            .catch((error: unknown) => { if (active) setState({ key, items: [], next: null, provider: null, error: gifErrorOf(error), more: "idle" }); });
        return () => { active = false; };
    }, [debounced, key, lang]);

    const loadMore = () => {
        if (!current?.next || current.more === "loading") return;
        const page = current.next;
        setState({ ...current, more: "loading" });
        socialApi.gifs(debounced, page, lang)
            .then((result) => setState((latest) => (latest?.key !== key ? latest : {
                ...latest,
                items: [...latest.items, ...result.items.filter((item) => !latest.items.some((known) => known.id === item.id))],
                next: result.next,
                more: "idle",
            })))
            .catch(() => setState((latest) => (latest?.key !== key ? latest : { ...latest, more: "failed" })));
    };

    const items = useMemo(() => current?.items ?? [], [current]);
    const loading = !current;
    const columns = useMemo(() => {
        const result: GifItem[][] = [[], []];
        const heights = [0, 0];
        for (const item of items) {
            const box = gifBox(item);
            const column = heights[0] <= heights[1] ? 0 : 1;
            result[column].push(item);
            heights[column] += box.height / box.width;
        }
        return result;
    }, [items]);

    return (
        <>
            <SearchBox value={query} onChange={setQuery} label={tx(C.searchGifs)} />
            <p className="px-3 pb-1 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{debounced ? tx(C.results, { query: debounced }) : tx(C.trending)}</p>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-busy={loading || current?.more === "loading"}>
                {current?.error ? (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                        <ImageOff className="h-8 w-8 text-zinc-400" aria-hidden />
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{tx(current.error === "not_configured" ? C.notConfigured : C.unavailable)}</p>
                        {current.error !== "not_configured" && <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"><RefreshCw className="h-4 w-4" aria-hidden />{tx(C.retry)}</button>}
                    </div>
                ) : loading ? (
                    <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6 text-indigo-500" /></div>
                ) : !items.length ? (
                    <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">{tx(C.noGifs)}</p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-1.5">
                            {columns.map((column, index) => (
                                <div key={index} className="flex flex-col gap-1.5">
                                    {column.map((item) => (
                                        <button key={`${item.provider}-${item.id}`} type="button" onClick={() => onPick(item)} className="group/gif relative overflow-hidden rounded-lg bg-zinc-100 transition focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-zinc-800" aria-label={item.title || "GIF"} title={item.title || undefined} style={{ aspectRatio: `${item.width} / ${item.height}` }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element -- provider media hosts (see GifView) */}
                                            <img src={autoplay || !item.still ? item.url : item.still} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover transition group-hover/gif:opacity-90" />
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                        {current?.more === "loading" && <div className="flex justify-center p-4"><Spinner className="h-6 w-6 text-indigo-500" /></div>}
                        {current?.next && current.more !== "loading" && (
                            <div className="flex justify-center p-2">
                                <button type="button" onClick={loadMore} className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800">{tx(current.more === "failed" ? C.retry : C.more)}</button>
                            </div>
                        )}
                    </>
                )}
            </div>
            {current?.provider && <p className="shrink-0 border-t border-zinc-200 px-3 py-1.5 text-end text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:border-white/10">{tx(C.poweredBy, { provider: GIF_ATTRIBUTION[current.provider] })}</p>}
        </>
    );
}
