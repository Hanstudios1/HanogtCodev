"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowUp, Bookmark, BookmarkCheck, BookOpen, CircleAlert, Clock, ExternalLink, Flame, Hash, MessageCircle, Newspaper,
    Radio, RefreshCw, Search, Share2, Sparkles, Wifi, WifiOff, X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { useI18n } from "@/lib/i18n";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/news/sources";
import AiRankings from "./AiRankings";
import CommentsDrawer from "./CommentsDrawer";
import MarketsStrip from "./MarketsStrip";
import { balanceFeed, mergeNewsItems, timeAgo, trendingTopics, type NewsItemView, type NewsSnapshotView } from "./NewsTypes";
import { useMarkets } from "./useMarkets";

const REFRESH_MS = 75_000;
const PAGE_SIZE = 24;
const SAVED_KEY = "hanogt-news:saved";

type CategoryFilter = "all" | "saved" | NewsCategory;

const CATEGORY_STYLE: Record<NewsCategory, { gradient: string; chip: string }> = {
    ai: { gradient: "from-indigo-500 via-violet-500 to-fuchsia-500", chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
    software: { gradient: "from-sky-500 via-cyan-500 to-emerald-500", chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
    games: { gradient: "from-orange-500 via-rose-500 to-pink-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
    apps: { gradient: "from-violet-500 via-purple-500 to-sky-500", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
    science: { gradient: "from-slate-700 via-indigo-700 to-sky-600", chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
    finance: { gradient: "from-emerald-600 via-teal-600 to-cyan-700", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

// ---------------------------------------------------------------------------
// Tiny external stores (clock + saved headlines) — hydration-safe.
// ---------------------------------------------------------------------------

function subscribeClock(callback: () => void) {
    const timer = window.setInterval(callback, 30_000);
    return () => window.clearInterval(timer);
}

function clockSnapshot() {
    return Math.floor(Date.now() / 30_000) * 30_000;
}

const EMPTY_SAVED: NewsItemView[] = [];
const savedListeners = new Set<() => void>();
let savedCache: { raw: string | null; items: NewsItemView[] } = { raw: null, items: EMPTY_SAVED };

function isStoredItem(value: unknown): value is NewsItemView {
    const item = value as NewsItemView | null;
    return Boolean(item && typeof item.id === "string" && typeof item.title === "string" && typeof item.link === "string" && /^https?:\/\//.test(item.link)
        && typeof item.publishedAt === "string" && item.source && typeof item.source.name === "string");
}

function readSaved(): NewsItemView[] {
    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(SAVED_KEY);
    } catch {
        raw = null;
    }
    if (raw === savedCache.raw) return savedCache.items;
    let items: NewsItemView[] = EMPTY_SAVED;
    try {
        const parsed = JSON.parse(raw ?? "[]") as unknown;
        if (Array.isArray(parsed)) items = parsed.filter(isStoredItem).slice(0, 100).map((item) => ({ ...item, image: item.image && item.image.startsWith("https://") ? item.image : null }));
    } catch {
        items = EMPTY_SAVED;
    }
    savedCache = { raw, items };
    return items;
}

function subscribeSaved(callback: () => void) {
    savedListeners.add(callback);
    const onStorage = (event: StorageEvent) => {
        if (event.key === SAVED_KEY) callback();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        savedListeners.delete(callback);
        window.removeEventListener("storage", onStorage);
    };
}

function writeSaved(items: NewsItemView[]) {
    try {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify(items.slice(0, 100)));
    } catch {
        // Storage can be unavailable (private mode); saving is a convenience only.
    }
    savedListeners.forEach((listener) => listener());
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function NewsImage({ item, className }: { item: NewsItemView; className: string }) {
    const [failed, setFailed] = useState(false);
    const style = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE.apps;
    const emoji = NEWS_CATEGORIES.find((entry) => entry.id === item.category)?.emoji ?? "📰";
    if (!item.image || failed) {
        return (
            <div className={`${className} relative grid place-items-center overflow-hidden bg-gradient-to-br ${style.gradient}`}>
                <div className="absolute inset-0 bg-dots opacity-30" />
                <span className="relative text-4xl drop-shadow-lg">{emoji}</span>
                <span className="absolute bottom-2 left-3 max-w-[80%] truncate text-[11px] font-black uppercase tracking-widest text-white/70">{item.source.name}</span>
            </div>
        );
    }
    return (
        <div className={`${className} overflow-hidden bg-zinc-100 dark:bg-white/[0.04]`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        </div>
    );
}

interface CardProps {
    item: NewsItemView;
    locale: "tr" | "en";
    now: number;
    isNew: boolean;
    comments: number;
    saved: boolean;
    featured?: boolean;
    delay: number;
    onComments: (item: NewsItemView) => void;
    onSave: (item: NewsItemView) => void;
    onShare: (item: NewsItemView) => void;
}

function NewsCard({ item, locale, now, isNew, comments, saved, featured = false, delay, onComments, onSave, onShare }: CardProps) {
    const { tx, locale: intlLocale } = useI18n();
    const category = NEWS_CATEGORIES.find((entry) => entry.id === item.category);
    const style = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE.apps;
    const published = new Date(item.publishedAt);
    return (
        <article
            className={`group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-white transition duration-300 animate-fade-up hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 dark:bg-zinc-900/70 ${featured ? "md:flex-row" : ""} ${isNew ? "border-indigo-400/80 shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-500/40 dark:border-indigo-400/60" : "border-zinc-200/80 shadow-sm dark:border-white/[0.08]"}`}
            style={{ animationDelay: `${delay}ms` }}
        >
            <a href={item.link} target="_blank" rel="noopener noreferrer nofollow" tabIndex={-1} aria-hidden="true" className={featured ? "md:w-[55%] md:shrink-0" : ""}>
                <NewsImage item={item} className={featured ? "aspect-video h-full md:aspect-auto md:min-h-[300px]" : "aspect-[16/9]"} />
            </a>
            <div className={`flex flex-1 flex-col ${featured ? "p-5 md:p-7" : "p-4"}`}>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${style.chip}`}>{category?.emoji} {category ? tx({ TR: category.tr, EN: category.en }) : item.category}</span>
                    {isNew ? (
                        <span className="relative inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-2 py-0.5 font-black uppercase tracking-wider text-white">
                            <span className="absolute inset-0 rounded-full animate-pulse-ring" />
                            <Sparkles className="h-3 w-3" />{tx({ TR: "Yeni", EN: "New" })}
                        </span>
                    ) : null}
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-bold text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">{item.language.toUpperCase()}</span>
                </div>
                <h3 className={`mt-2.5 font-extrabold leading-snug tracking-tight text-zinc-900 dark:text-white ${featured ? "text-2xl md:text-[28px]" : "line-clamp-3 text-[16px]"}`}>
                    <a href={item.link} target="_blank" rel="noopener noreferrer nofollow" className="outline-none after:absolute after:inset-0 after:content-[''] hover:text-indigo-600 focus-visible:underline dark:hover:text-indigo-300">{item.title}</a>
                </h3>
                {item.summary ? <p className={`mt-2 text-zinc-600 dark:text-zinc-400 ${featured ? "line-clamp-4 text-[15px] leading-relaxed" : "line-clamp-3 text-[13.5px] leading-relaxed"}`}>{item.summary}</p> : null}
                <div className="mt-auto flex items-center gap-2 pt-4 text-[12px] text-zinc-500 dark:text-zinc-400">
                    <span className="min-w-0 truncate font-bold text-zinc-700 dark:text-zinc-300">{item.source.name}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={item.publishedAt} title={published.toLocaleString(intlLocale)} suppressHydrationWarning className="shrink-0">{timeAgo(item.publishedAt, locale, now)}</time>
                    <div className="relative z-10 ml-auto flex items-center gap-0.5">
                        <button type="button" onClick={() => onComments(item)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 font-semibold transition hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-300" aria-label={tx({ TR: "Yorumlar ({count})", EN: "Comments ({count})" }, { count: comments })}>
                            <MessageCircle className="h-4 w-4" />{comments ? <span className="tabular-nums">{comments}</span> : null}
                        </button>
                        <button type="button" onClick={() => onSave(item)} className={`grid h-8 w-8 place-items-center rounded-lg transition hover:bg-amber-500/10 hover:text-amber-600 ${saved ? "text-amber-500" : ""}`} aria-pressed={saved} aria-label={saved ? (tx({ TR: "Kaydedilenlerden çıkar", EN: "Remove from saved" })) : (tx({ TR: "Sonra oku", EN: "Read later" }))}>
                            {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                        </button>
                        <button type="button" onClick={() => onShare(item)} className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-white" aria-label={tx({ TR: "Paylaş", EN: "Share" })}>
                            <Share2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
}

function Ticker({ items }: { items: NewsItemView[]; locale: "tr" | "en" }) {
    const { tx } = useI18n();
    if (items.length < 3) return null;
    const loop = [...items, ...items];
    return (
        <div className="relative border-y border-zinc-200/70 bg-white/70 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-950/60">
            <div className="mx-auto flex max-w-7xl items-center">
                <span className="z-10 flex shrink-0 items-center gap-1.5 bg-gradient-to-r from-red-500 to-rose-500 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{tx({ TR: "Son dakika", EN: "Breaking" })}
                </span>
                <div className="mask-fade-x min-w-0 flex-1 overflow-hidden">
                    <div className="flex w-max animate-marquee gap-8 py-2 pl-6 hover:[animation-play-state:paused]" style={{ animationDuration: `${Math.max(40, items.length * 6)}s` }}>
                        {loop.map((item, index) => (
                            <a key={`${item.id}-${index}`} href={item.link} target="_blank" rel="noopener noreferrer nofollow" tabIndex={index >= items.length ? -1 : undefined} aria-hidden={index >= items.length ? true : undefined} className="flex shrink-0 items-center gap-2 text-[13px] text-zinc-700 transition hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-300">
                                <span>{NEWS_CATEGORIES.find((entry) => entry.id === item.category)?.emoji}</span>
                                <span className="font-bold text-zinc-400">{item.source.name}</span>
                                <span className="max-w-[46ch] truncate font-medium">{item.title}</span>
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewsPage({ initial }: { initial: NewsSnapshotView | null }) {
    const { language, dir, tx } = useI18n();
    const locale: "tr" | "en" = language === "TR" ? "tr" : "en";
    // News copy exists in Turkish and English only, so right-to-left languages read it left-to-right.
    const contentDir = dir === "rtl" ? "ltr" : undefined;
    const initialItems = initial?.items ?? [];
    const serverNow = initial ? Date.parse(initial.fetchedAt) || 0 : 0;

    const [items, setItems] = useState<NewsItemView[]>(initialItems);
    const [sources, setSources] = useState(initial?.sources ?? []);
    const [fetchedAt, setFetchedAt] = useState<string | null>(initial?.fetchedAt ?? null);
    const [loading, setLoading] = useState(initialItems.length === 0);
    const [refreshing, setRefreshing] = useState(false);
    const [offline, setOffline] = useState(false);
    const [pending, setPending] = useState<NewsItemView[]>([]);
    const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
    const [category, setCategory] = useState<CategoryFilter>("all");
    const [lang, setLang] = useState<"all" | "tr" | "en">("all");
    const [query, setQuery] = useState("");
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [active, setActive] = useState<NewsItemView | null>(null);
    const [cycle, setCycle] = useState(0);
    const [toast, setToast] = useState<string | null>(null);
    const [showAllSources, setShowAllSources] = useState(false);

    const initialRef = useRef(initial);
    const knownIds = useRef<Set<string> | null>(null);
    const loadRef = useRef<((manual: boolean) => Promise<void>) | null>(null);
    const toastTimer = useRef<number | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const feedRef = useRef<HTMLDivElement | null>(null);

    const now = useSyncExternalStore(subscribeClock, clockSnapshot, () => serverNow);
    const saved = useSyncExternalStore(subscribeSaved, readSaved, () => EMPTY_SAVED);
    const savedIds = new Set(saved.map((item) => item.id));
    const markets = useMarkets();

    const showToast = useCallback((message: string) => {
        setToast(message);
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 2600);
    }, []);

    const highlight = useCallback((ids: string[]) => {
        if (!ids.length) return;
        setFreshIds((current) => new Set([...current, ...ids]));
        window.setTimeout(() => {
            setFreshIds((current) => {
                const next = new Set(current);
                for (const id of ids) next.delete(id);
                return next;
            });
        }, 14_000);
    }, []);

    // Polling: fetch the aggregated snapshot, animate genuinely new headlines in.
    useEffect(() => {
        let disposed = false;
        let controller: AbortController | null = null;
        let lastLoad = 0;
        const seed = initialRef.current?.items ?? [];
        if (!knownIds.current) knownIds.current = new Set(seed.map((item) => item.id));

        const load = async (manual: boolean) => {
            if (!manual && document.visibilityState === "hidden") return;
            controller?.abort();
            const current = new AbortController();
            controller = current;
            lastLoad = Date.now();
            setRefreshing(true);
            try {
                const response = await fetch("/api/news", { cache: "no-store", signal: current.signal });
                const payload = await response.json() as NewsSnapshotView & { error?: string };
                if (disposed) return;
                if (!Array.isArray(payload.items)) throw new Error(payload.error || "invalid");
                setSources(payload.sources ?? []);
                setFetchedAt(payload.fetchedAt ?? null);
                setOffline(!response.ok && !payload.items.length);
                const known = knownIds.current ?? new Set<string>();
                const firstLoad = known.size === 0;
                const fresh = payload.items.filter((item) => !known.has(item.id));
                for (const item of fresh) known.add(item.id);
                knownIds.current = known;
                if (firstLoad) {
                    setItems(payload.items);
                } else if (fresh.length) {
                    if (window.scrollY < 520) {
                        setItems((existing) => mergeNewsItems(fresh, existing));
                        highlight(fresh.map((item) => item.id));
                        showToast(tx({ TR: "{count} yeni haber geldi", EN: "{count} new stories arrived" }, { count: fresh.length }));
                    } else {
                        setPending((existing) => mergeNewsItems(fresh, existing));
                    }
                } else if (manual) {
                    showToast(tx({ TR: "Akış güncel — yeni haber yok", EN: "Feed is up to date" }));
                }
            } catch (reason) {
                if (!disposed && !(reason instanceof DOMException && reason.name === "AbortError")) setOffline(true);
            } finally {
                if (!disposed && controller === current) {
                    setRefreshing(false);
                    setLoading(false);
                    setCycle((value) => value + 1);
                }
            }
        };
        loadRef.current = load;

        const first = window.setTimeout(() => void load(false), seed.length ? 5_000 : 0);
        const timer = window.setInterval(() => void load(false), REFRESH_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible" && Date.now() - lastLoad > 30_000) void load(false);
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            disposed = true;
            controller?.abort();
            window.clearTimeout(first);
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
            loadRef.current = null;
        };
    }, [highlight, showToast, tx]);

    // "/" focuses search, Escape clears it.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
            if (event.key === "/" && !typing) {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => {
        const base = "Hanogt News";
        document.title = pending.length ? `(${pending.length}) ${base}` : `${base} — ${tx({ TR: "Canlı teknoloji ve finans haberleri", EN: "Live tech and finance news" })}`;
    }, [pending.length, tx]);

    // Derived lists
    const needle = query.trim().toLocaleLowerCase("tr");
    const languageFiltered = useMemo(() => items.filter((item) => lang === "all" || item.language === lang), [items, lang]);
    // The mixed views (All, the ticker, trending topics) interleave categories so a busy one cannot bury the rest.
    const balanced = useMemo(() => balanceFeed(languageFiltered), [languageFiltered]);
    const tickerItems = useMemo(() => balanceFeed(items).slice(0, 14), [items]);
    const pool = category === "saved" ? saved.filter((item) => lang === "all" || item.language === lang) : category === "all" && !needle ? balanced : languageFiltered;
    const filtered = pool.filter((item) => (category === "all" || category === "saved" || item.category === category || item.tags.includes(category))
        && (!needle || `${item.title} ${item.summary} ${item.source.name}`.toLocaleLowerCase("tr").includes(needle)));
    const featured = category !== "saved" && !needle ? (filtered.slice(0, 6).find((item) => item.image) ?? filtered[0] ?? null) : null;
    const rest = featured ? filtered.filter((item) => item.id !== featured.id) : filtered;
    const visible = rest.slice(0, limit);
    const categoryCount = (id: NewsCategory) => languageFiltered.filter((item) => item.category === id || item.tags.includes(id)).length;
    const trending = trendingTopics(balanced, 14);
    const okSources = sources.filter((source) => source.ok).length;
    const countKey = [featured, ...visible.slice(0, 29)].filter((item): item is NewsItemView => Boolean(item)).map((item) => item.id).join(",");

    useEffect(() => {
        if (!countKey) return;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            try {
                const response = await fetch(`/api/news/comments/counts?ids=${countKey}`, { signal: controller.signal });
                if (!response.ok) return;
                const payload = await response.json() as { counts?: Record<string, number> };
                setCounts((current) => ({ ...current, ...(payload.counts ?? {}) }));
            } catch {
                // Counts are decorative.
            }
        }, 350);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [countKey]);

    const revealPending = () => {
        const ids = pending.map((item) => item.id);
        setItems((existing) => mergeNewsItems(pending, existing));
        setPending([]);
        setCategory("all");
        setQuery("");
        highlight(ids);
        const top = (feedRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 140;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    };

    const toggleSave = (item: NewsItemView) => {
        const exists = saved.some((entry) => entry.id === item.id);
        writeSaved(exists ? saved.filter((entry) => entry.id !== item.id) : [item, ...saved]);
        showToast(exists ? (tx({ TR: "Kaydedilenlerden çıkarıldı", EN: "Removed from saved" })) : (tx({ TR: "Sonra okumak için kaydedildi", EN: "Saved for later" })));
    };

    const share = async (item: NewsItemView) => {
        try {
            if (typeof navigator.share === "function") {
                await navigator.share({ title: item.title, url: item.link });
                return;
            }
            await navigator.clipboard.writeText(item.link);
            showToast(tx({ TR: "Bağlantı kopyalandı", EN: "Link copied" }));
        } catch {
            // The share sheet was dismissed.
        }
    };

    const onCountChange = useCallback((id: string, delta: number) => {
        setCounts((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + delta) }));
    }, []);
    const closeComments = useCallback(() => setActive(null), []);

    const openFinance = () => {
        setCategory("finance");
        setLimit(PAGE_SIZE);
    };
    // The strip belongs to the general stream and to the Finance view; topic views stay uncluttered.
    const showMarkets = category === "all" || category === "finance";

    const chip = (id: CategoryFilter, label: string, emoji: string, count?: number) => (
        <button
            key={id}
            type="button"
            onClick={() => { setCategory(id); setLimit(PAGE_SIZE); }}
            aria-pressed={category === id}
            className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${category === id ? "text-white dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"}`}
        >
            {category === id ? <motion.span layoutId="news-category" className="absolute inset-0 rounded-full bg-zinc-900 shadow-lg dark:bg-white" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
            <span className="relative">{emoji}</span>
            <span className="relative">{label}</span>
            {count !== undefined ? <span className={`relative rounded-full px-1.5 text-[10.5px] tabular-nums ${category === id ? "bg-white/20 dark:bg-zinc-900/10" : "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400"}`}>{count}</span> : null}
        </button>
    );

    return (
        <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
            <Header />
            <main id="main-content" dir={contentDir}>
                {/* Hero */}
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-grid opacity-60 mask-fade-b" />
                    <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl animate-float" />
                    <div className="absolute -right-20 -top-10 h-80 w-80 rounded-full bg-rose-500/15 blur-3xl animate-float" style={{ animationDelay: "-3s" }} />
                    <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-28 sm:pt-32">
                        <div className="flex flex-wrap items-center gap-2 animate-fade-up">
                            <span className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-[12px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">
                                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
                                {tx({ TR: "Canlı", EN: "Live" })}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-[12px] font-semibold text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
                                {offline ? <WifiOff className="h-3.5 w-3.5 text-amber-500" /> : <Wifi className="h-3.5 w-3.5 text-emerald-500" />}
                                {fetchedAt ? <>{tx({ TR: "Güncellendi", EN: "Updated" })} <time dateTime={fetchedAt} suppressHydrationWarning>{timeAgo(fetchedAt, locale, now)}</time></> : (tx({ TR: "Bağlanıyor…", EN: "Connecting…" }))}
                            </span>
                        </div>
                        <h1 className="mt-4 text-5xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-6xl animate-fade-up" style={{ animationDelay: "60ms" }}>
                            Hanogt <span className="text-gradient animate-gradient">News</span>
                        </h1>
                        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400 animate-fade-up" style={{ animationDelay: "120ms" }}>
                            {tx({ TR: "Yapay zeka, yazılım, oyun, uygulama, bilim ve ekonomi dünyasından güncel haberler tek akışta. Akış kendiliğinden yenilenir, yeni haberler canlı olarak düşer; döviz, altın ve borsa için piyasa şeridi var; yorum yap, kaydet, yapay zeka arenasında oy ver.", EN: "The latest from AI, software, games, apps, science and finance in one stream. The feed refreshes itself and new stories drop in live; a markets strip tracks currencies, gold and stocks; comment, save and vote in the AI arena." })}
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: "180ms" }}>
                            {[
                                { icon: Newspaper, value: items.length, label: tx({ TR: "haber", EN: "stories" }) },
                                { icon: Radio, value: sources.length ? `${okSources}/${sources.length}` : "—", label: tx({ TR: "kaynak aktif", EN: "sources live" }) },
                                { icon: Clock, value: `${Math.round(REFRESH_MS / 1000)}${tx({ TR: " sn", EN: "s" })}`, label: tx({ TR: "yenileme aralığı", EN: "refresh interval" }) },
                                { icon: Bookmark, value: saved.length, label: tx({ TR: "kaydedilen", EN: "saved" }) },
                            ].map((stat) => (
                                <div key={stat.label} className="flex items-center gap-2.5 rounded-2xl border border-zinc-200/80 bg-white/80 px-3.5 py-2 backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.04]">
                                    <stat.icon className="h-4 w-4 text-indigo-500" />
                                    <span className="text-[15px] font-black tabular-nums text-zinc-900 dark:text-white">{stat.value}</span>
                                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{stat.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <Ticker items={tickerItems} locale={locale} />

                {/* Filters */}
                <div className="sticky top-16 z-30 border-b border-zinc-200/70 bg-zinc-50/85 backdrop-blur-xl dark:border-white/[0.06] dark:bg-zinc-950/85">
                    <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 lg:flex-row lg:items-center">
                        <div className="scrollbar-none -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]">
                            {chip("all", tx({ TR: "Tümü", EN: "All" }), "🌐", languageFiltered.length)}
                            {NEWS_CATEGORIES.map((entry) => chip(entry.id, tx({ TR: entry.tr, EN: entry.en }), entry.emoji, categoryCount(entry.id)))}
                            {chip("saved", tx({ TR: "Kaydedilenler", EN: "Saved" }), "🔖", saved.length)}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex rounded-full border border-zinc-200 bg-white p-0.5 dark:border-white/10 dark:bg-zinc-900" role="group" aria-label={tx({ TR: "Haber dili", EN: "News language" })}>
                                {(["all", "tr", "en"] as const).map((value) => (
                                    <button key={value} type="button" onClick={() => setLang(value)} aria-pressed={lang === value} className={`h-8 rounded-full px-3 text-[12px] font-bold transition ${lang === value ? "bg-indigo-500 text-white shadow" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"}`}>
                                        {value === "all" ? (tx({ TR: "Hepsi", EN: "All" })) : value.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                            <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                <input
                                    ref={searchRef}
                                    value={query}
                                    onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
                                    onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}
                                    placeholder={tx({ TR: "Haberlerde ara…  ( / )", EN: "Search stories…  ( / )" })}
                                    aria-label={tx({ TR: "Haberlerde ara", EN: "Search stories" })}
                                    className="h-9 w-full rounded-full border border-zinc-200 bg-white pl-10 pr-8 text-[13px] text-zinc-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
                                />
                                {query ? <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label={tx({ TR: "Aramayı temizle", EN: "Clear search" })}><X className="h-3.5 w-3.5" /></button> : null}
                            </div>
                            <button type="button" onClick={() => void loadRef.current?.(true)} disabled={refreshing} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:text-indigo-600 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300" aria-label={tx({ TR: "Şimdi yenile", EN: "Refresh now" })}>
                                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                            </button>
                        </div>
                    </div>
                    <div className="h-0.5 w-full overflow-hidden bg-transparent">
                        <motion.div key={cycle} className="h-full origin-left bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-rose-500 opacity-70" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: REFRESH_MS / 1000, ease: "linear" }} />
                    </div>
                </div>

                {/* New stories pill */}
                <AnimatePresence>
                    {pending.length ? (
                        <motion.button
                            type="button"
                            onClick={revealPending}
                            initial={{ y: -30, opacity: 0, scale: 0.9 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: -30, opacity: 0, scale: 0.9 }}
                            className="fixed left-1/2 top-[132px] z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-[13px] font-bold text-white shadow-2xl shadow-indigo-500/40"
                        >
                            <ArrowUp className="h-4 w-4" />{tx({ TR: "{count} yeni haber", EN: "{count} new stories" }, { count: pending.length })}
                        </motion.button>
                    ) : null}
                </AnimatePresence>

                <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div ref={feedRef} className="min-w-0">
                        {showMarkets ? (
                            <MarketsStrip variant={category === "finance" ? "prominent" : "compact"} markets={markets} now={now} onOpenFinance={category === "finance" ? undefined : openFinance} />
                        ) : null}

                        {offline ? (
                            <p className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[13px] text-amber-700 dark:text-amber-300" role="status">
                                <CircleAlert className="h-4 w-4 shrink-0" />{tx({ TR: "Haber sunucusuna şu anda ulaşılamıyor; akış otomatik olarak yeniden denenecek.", EN: "The news server is unreachable right now; the feed will retry automatically." })}
                            </p>
                        ) : null}

                        {loading ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                                {Array.from({ length: 6 }, (_, index) => (
                                    <div key={index} className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white dark:border-white/[0.06] dark:bg-zinc-900/60">
                                        <div className="aspect-video animate-pulse bg-zinc-200 dark:bg-white/[0.05]" />
                                        <div className="space-y-2 p-4"><div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-white/[0.06]" /><div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-white/[0.04]" /><div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-white/[0.04]" /></div>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {!loading && !filtered.length ? (
                            <div className="grid place-items-center rounded-3xl border border-dashed border-zinc-300 bg-white/60 px-6 py-16 text-center dark:border-white/10 dark:bg-white/[0.02]">
                                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-rose-500 text-3xl shadow-xl animate-float">{category === "saved" ? "🔖" : "📰"}</div>
                                <h2 className="mt-5 text-xl font-bold text-zinc-900 dark:text-white">
                                    {category === "saved" ? (tx({ TR: "Kaydedilen haber yok", EN: "Nothing saved yet" })) : needle ? (tx({ TR: "Sonuç bulunamadı", EN: "No results" })) : (tx({ TR: "Haberler hazırlanıyor", EN: "Fetching stories" }))}
                                </h2>
                                <p className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
                                    {category === "saved"
                                        ? (tx({ TR: "Kartlardaki yer imi simgesine basarak haberleri sonra okumak üzere bu cihaza kaydedebilirsin.", EN: "Tap the bookmark icon on any card to keep it on this device for later." }))
                                        : needle ? (tx({ TR: "Farklı bir kelime veya kategori deneyin.", EN: "Try another keyword or category." }))
                                            : (tx({ TR: "Kaynaklara şu anda ulaşılamıyor olabilir. Akış birkaç dakika içinde otomatik olarak yeniden denenecek.", EN: "Sources may be unreachable right now. The feed will retry automatically." }))}
                                </p>
                            </div>
                        ) : null}

                        {!loading && featured ? (
                            <div key={featured.id} className="mb-5">
                                <NewsCard item={featured} featured locale={locale} now={now} isNew={freshIds.has(featured.id)} comments={counts[featured.id] ?? 0} saved={savedIds.has(featured.id)} delay={0} onComments={setActive} onSave={toggleSave} onShare={(item) => void share(item)} />
                            </div>
                        ) : null}

                        {!loading && visible.length ? (
                            <motion.div layout className="grid gap-4 sm:grid-cols-2">
                                <AnimatePresence initial={false} mode="popLayout">
                                    {visible.map((item, index) => (
                                        <motion.div
                                            key={item.id}
                                            layout
                                            initial={{ opacity: 0, y: -28, scale: 0.94 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
                                            transition={{ type: "spring", stiffness: 260, damping: 28 }}
                                        >
                                            <NewsCard item={item} locale={locale} now={now} isNew={freshIds.has(item.id)} comments={counts[item.id] ?? 0} saved={savedIds.has(item.id)} delay={Math.min(index, 10) * 40} onComments={setActive} onSave={toggleSave} onShare={(entry) => void share(entry)} />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </motion.div>
                        ) : null}

                        {!loading && rest.length > limit ? (
                            <div className="mt-6 flex justify-center">
                                <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className="inline-flex h-11 items-center gap-2 rounded-full border border-zinc-200 bg-white px-6 text-[14px] font-bold text-zinc-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100">
                                    <Newspaper className="h-4 w-4" />{tx({ TR: "Daha fazla göster ({count})", EN: "Show more ({count})" }, { count: rest.length - limit })}
                                </button>
                            </div>
                        ) : null}
                    </div>

                    <aside className="space-y-5 lg:sticky lg:top-36 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto lg:pb-6 scrollbar-thin" aria-label={tx({ TR: "Yan panel", EN: "Sidebar" })}>
                        <AiRankings locale={locale} now={now} />

                        {trending.length ? (
                            <section className="rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-zinc-900/70">
                                <h2 className="flex items-center gap-2 text-[14px] font-black text-zinc-900 dark:text-white"><Flame className="h-4 w-4 text-orange-500" />{tx({ TR: "Gündemdeki konular", EN: "Trending topics" })}</h2>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {trending.map((topic, index) => (
                                        <motion.button
                                            key={topic.word}
                                            type="button"
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: index * 0.03 }}
                                            onClick={() => { setQuery(topic.word); setCategory("all"); feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                                            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[12px] font-semibold text-zinc-700 transition hover:-translate-y-0.5 hover:border-orange-400 hover:text-orange-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
                                        >
                                            <Hash className="h-3 w-3 text-zinc-400" />{topic.word}<span className="text-[10.5px] text-zinc-400">{topic.count}</span>
                                        </motion.button>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        <section className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] via-white to-fuchsia-500/[0.08] p-4 dark:via-zinc-900/60">
                            <h2 className="flex items-center gap-2 text-[14px] font-black text-zinc-900 dark:text-white"><BookOpen className="h-4 w-4 text-indigo-500" />{tx({ TR: "Hanogt News nasıl çalışır?", EN: "How Hanogt News works" })}</h2>
                            <ul className="mt-2 space-y-1.5 text-[12.5px] leading-snug text-zinc-600 dark:text-zinc-400">
                                <li>📡 {tx({ TR: "{count} güvenilir kaynağın herkese açık RSS/Atom akışları okunur; yalnızca başlık, kısa özet ve bağlantı gösterilir.", EN: "Public RSS/Atom feeds from {count} trusted sources; only headlines, short excerpts and links are shown." }, { count: sources.length || "20+" })}</li>
                                <li>⏱️ {tx({ TR: "Sunucu akışları birkaç dakikada bir yeniler, bu sayfa 75 saniyede bir kontrol eder ve yeni haberleri animasyonla ekler.", EN: "The server refreshes feeds every few minutes; this page checks every 75 seconds and animates new stories in." })}</li>
                                <li>📈 {tx({ TR: "Piyasa şeridinde döviz kurları TCMB'den; altın, BIST 100 ve Bitcoin ücretsiz kamu veri kaynaklarından 5 dakikada bir alınır. Gecikmeli veriler, yatırım tavsiyesi değildir.", EN: "In the markets strip, exchange rates come from the Central Bank of Türkiye (TCMB); gold, BIST 100 and Bitcoin from free public data sources, refreshed every 5 minutes. Delayed data; not investment advice." })}</li>
                                <li>💬 {tx({ TR: "Yorumlar giriş yapan kullanıcılara açıktır; spam ve hakaret filtrelenir.", EN: "Signed-in users can comment; spam and abuse are filtered." })}</li>
                                <li>🏆 {tx({ TR: "Arena puanları yalnızca sizin oylarınızdan Elo ile hesaplanır.", EN: "Arena ratings come only from your votes via Elo." })}</li>
                            </ul>
                            <Link href="/guide#news" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-bold text-indigo-600 hover:underline dark:text-indigo-300">{tx({ TR: "Kılavuzda ayrıntılar", EN: "Read the guide" })} →</Link>
                        </section>

                        {sources.length ? (
                            <section className="rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-zinc-900/70">
                                <h2 className="flex items-center gap-2 text-[14px] font-black text-zinc-900 dark:text-white"><Radio className="h-4 w-4 text-emerald-500" />{tx({ TR: "Kaynaklar", EN: "Sources" })}<span className="ml-auto text-[11px] font-semibold text-zinc-400">{okSources}/{sources.length}</span></h2>
                                <ul className="mt-2 grid grid-cols-2 gap-1">
                                    {(showAllSources ? sources : sources.slice(0, 10)).map((source) => (
                                        <li key={source.id}>
                                            <a href={source.homepage} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/[0.06]" title={source.ok ? `${source.count} ${tx({ TR: "haber", EN: "stories" })}` : (tx({ TR: "Şu anda ulaşılamıyor", EN: "Unreachable right now" }))}>
                                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${source.ok ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`} />
                                                <span className="truncate">{source.name}</span>
                                                <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-40" />
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                                {sources.length > 10 ? (
                                    <button type="button" onClick={() => setShowAllSources((value) => !value)} className="mt-2 text-[12px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
                                        {showAllSources ? (tx({ TR: "Daha az göster", EN: "Show less" })) : tx({ TR: "Tüm kaynaklar ({count})", EN: "All sources ({count})" }, { count: sources.length })}
                                    </button>
                                ) : null}
                                <p className="mt-2 text-[10.5px] leading-snug text-zinc-400">{tx({ TR: "Haber içerikleri ilgili yayıncılara aittir; kartlar her zaman orijinal habere bağlantı verir.", EN: "Stories belong to their publishers; every card links to the original article." })}</p>
                            </section>
                        ) : null}
                    </aside>
                </div>
            </main>
            <SiteFooter />

            <div dir={contentDir}>
            <CommentsDrawer item={active} locale={locale} onClose={closeComments} onCountChange={onCountChange} />

            <AnimatePresence>
                {toast ? (
                    <motion.div
                        role="status"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-6 left-1/2 z-[130] -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white shadow-2xl dark:bg-white dark:text-zinc-900"
                    >
                        {toast}
                    </motion.div>
                ) : null}
            </AnimatePresence>
            </div>
        </div>
    );
}
