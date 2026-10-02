"use client";

import { Box, Flame, Gamepad2, GitFork, Heart, LoaderCircle, Play, Plus, Search, Sparkles, Square, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { useI18n } from "@/lib/i18n";
import { PROJECT_TEMPLATES } from "@/lib/game-engine/templates";

export interface ArcadeGameSummary {
    id: string;
    title: string;
    description: string;
    dimension: "2d" | "3d";
    thumbnail: string | null;
    authorName: string;
    authorImage: string | null;
    templateId: string | null;
    /** Major Hanogt Engine version the game was published with (null for games published before V3). */
    engineVersion?: number | null;
    languages: string[];
    plays: number;
    likes: number;
    /** The author lets others copy the game with Remix. */
    allowRemix?: boolean;
    /** The game was made from a remix of this one. */
    remixOf?: { gameId: string; title: string; authorName: string } | null;
    createdAt: string | null;
    updatedAt: string | null;
}

type Sort = "new" | "popular" | "liked";

export function compactNumber(value: number, locale = "tr-TR") {
    try {
        return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
    } catch {
        return String(value);
    }
}

export function GameCard({ game, index = 0 }: { game: ArcadeGameSummary; index?: number }) {
    const { tx, locale } = useI18n();
    const template = PROJECT_TEMPLATES.find((item) => item.id === game.templateId);
    const gradient = template?.gradient ?? (game.dimension === "3d" ? ["#6366f1", "#0ea5e9"] : ["#f97316", "#ec4899"]);
    return (
        <Link
            href={`/arcade/${game.id}`}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-white/[0.08] dark:bg-zinc-900/70 animate-fade-up"
            style={{ animationDelay: `${Math.min(index, 16) * 45}ms` }}
        >
            <div className="relative aspect-video overflow-hidden" style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}>
                {game.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                ) : (
                    <div className="grid h-full place-items-center text-5xl drop-shadow-lg transition duration-500 group-hover:scale-110">{template?.emoji ?? "🎮"}</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white backdrop-blur">
                    {game.dimension === "3d" ? <Box className="h-3 w-3" /> : <Square className="h-3 w-3" />}{game.dimension}
                </span>
                <div className="absolute right-2 top-2 flex gap-1">
                    {game.allowRemix ? <span title={tx({ TR: "Remikslenebilir", EN: "Remixable" })} className="inline-flex items-center rounded-md bg-emerald-500/85 px-1.5 py-0.5 text-white backdrop-blur"><GitFork className="h-3 w-3" aria-label={tx({ TR: "Remikslenebilir", EN: "Remixable" })} /></span> : null}
                    {game.engineVersion ? <span title={`Hanogt Engine V${game.engineVersion}`} className="rounded-md bg-indigo-500/80 px-1.5 py-0.5 text-[10px] font-black text-white backdrop-blur">V{game.engineVersion}</span> : null}
                    {game.languages.map((language) => <span key={language} className="rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-black text-white backdrop-blur">{language}</span>)}
                </div>
                <span className="absolute bottom-2 right-2 grid h-10 w-10 translate-y-2 place-items-center rounded-full bg-white text-zinc-900 opacity-0 shadow-xl transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <Play className="h-4 w-4 fill-current" />
                </span>
            </div>
            <div className="flex flex-1 flex-col p-3.5">
                <h3 className="line-clamp-1 text-[15px] font-bold text-zinc-900 dark:text-white">{game.title}</h3>
                <p className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[12.5px] leading-snug text-zinc-500 dark:text-zinc-400">{game.description || tx({ TR: "Hanogt Engine ile yapılmış bir oyun.", EN: "A game made with Hanogt Engine." })}</p>
                <div className="mt-3 flex items-center gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
                    {game.authorImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={game.authorImage} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[10px] font-bold text-white">{game.authorName.charAt(0).toUpperCase()}</span>}
                    <span className="min-w-0 flex-1 truncate font-medium">{game.authorName}</span>
                    <span className="inline-flex items-center gap-1"><Play className="h-3 w-3" />{compactNumber(game.plays, locale)}</span>
                    <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" />{compactNumber(game.likes, locale)}</span>
                </div>
            </div>
        </Link>
    );
}

export default function ArcadeGallery() {
    const { tx, locale, language } = useI18n();
    const [sort, setSort] = useState<Sort>("new");
    const [dimension, setDimension] = useState<"all" | "2d" | "3d">("all");
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [games, setGames] = useState<ArcadeGameSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({ sort, limit: "48" });
        if (dimension !== "all") params.set("dimension", dimension);
        if (debounced) params.set("q", debounced);
        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch(`/api/arcade?${params.toString()}`, { signal: controller.signal });
                const payload = await response.json() as { games?: ArcadeGameSummary[]; error?: string };
                if (!response.ok) throw new Error(payload.error || "");
                setGames(payload.games ?? []);
                setError(payload.error ?? null);
            } catch (reason) {
                if (controller.signal.aborted) return;
                // An empty message is replaced with the localized fallback while rendering.
                setError(reason instanceof Error ? reason.message : "");
                setGames([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void load();
        return () => controller.abort();
    }, [sort, dimension, debounced]);

    const totals = useMemo(() => ({ plays: games.reduce((sum, game) => sum + game.plays, 0), likes: games.reduce((sum, game) => sum + game.likes, 0) }), [games]);

    const tab = (value: Sort, label: string, Icon: typeof Flame) => (
        <button type="button" onClick={() => setSort(value)} aria-pressed={sort === value} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition ${sort === value ? "bg-zinc-900 text-white shadow-lg dark:bg-white dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"}`}>
            <Icon className="h-4 w-4" />{label}
        </button>
    );

    return (
        <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
            <Header />
            <main id="main-content" className="relative">
                <section className="relative overflow-hidden border-b border-zinc-200/70 dark:border-white/[0.06]">
                    <div className="absolute inset-0 bg-grid opacity-60 mask-fade-b" />
                    <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
                    <div className="absolute -right-24 -top-10 h-80 w-80 rounded-full bg-indigo-500/25 blur-3xl" />
                    <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-28 sm:pt-32">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[12px] font-semibold text-indigo-600 dark:text-indigo-300 animate-fade-up"><Sparkles className="h-3.5 w-3.5" />{tx({ TR: "Topluluk oyunları · Tarayıcıda anında oyna", EN: "Community games · Play instantly in your browser" })}</span>
                        <h1 className="mt-4 text-5xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-6xl animate-fade-up" style={{ animationDelay: "60ms" }}>
                            Hanogt <span className="text-gradient animate-gradient">Arcade</span>
                        </h1>
                        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400 animate-fade-up" style={{ animationDelay: "120ms" }}>
                            {tx({ TR: "Hanogt Engine ile C# ve C++ kullanılarak yapılmış 2D ve 3D oyunlar. İndirme yok, kurulum yok: tıkla ve oyna. Beğendiğin oyunu remiksleyip kendi versiyonunu yap.", EN: "2D and 3D games made with Hanogt Engine in C# and C++. No downloads, no installs: click and play. Remix a game you like to make your own version." })}
                        </p>
                        <div className="mt-6 flex flex-wrap items-center gap-3 animate-fade-up" style={{ animationDelay: "180ms" }}>
                            <Link href="/game-engine" className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 text-[14px] font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110"><Plus className="h-4 w-4" />{tx({ TR: "Kendi oyununu yap", EN: "Make your own game" })}</Link>
                            <div className="flex items-center gap-4 text-[13px] text-zinc-500 dark:text-zinc-400">
                                <span className="inline-flex items-center gap-1.5"><Gamepad2 className="h-4 w-4" />{games.length} {tx({ TR: "oyun", EN: "games" })}</span>
                                <span className="inline-flex items-center gap-1.5"><Play className="h-4 w-4" />{compactNumber(totals.plays, locale)} {tx({ TR: "oynanma", EN: "plays" })}</span>
                                <span className="inline-flex items-center gap-1.5"><Heart className="h-4 w-4" />{compactNumber(totals.likes, locale)} {tx({ TR: "beğeni", EN: "likes" })}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mx-auto max-w-7xl px-4 py-8">
                    <div className="mb-6 flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap gap-1 rounded-full border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-zinc-900">
                            {tab("new", tx({ TR: "Yeni", EN: "New" }), Sparkles)}
                            {tab("popular", tx({ TR: "Popüler", EN: "Popular" }), Flame)}
                            {tab("liked", tx({ TR: "En beğenilen", EN: "Most liked" }), Trophy)}
                        </div>
                        <select value={dimension} onChange={(event) => setDimension(event.target.value as typeof dimension)} className="h-10 rounded-full border border-zinc-200 bg-white px-4 text-[13px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200" aria-label={tx({ TR: "Boyut filtresi", EN: "Dimension filter" })}>
                            <option value="all">2D + 3D</option>
                            <option value="2d">{tx({ TR: "Yalnızca 2D", EN: "2D only" })}</option>
                            <option value="3d">{tx({ TR: "Yalnızca 3D", EN: "3D only" })}</option>
                        </select>
                        <div className="relative ms-auto w-full sm:w-72">
                            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx({ TR: "Oyun veya geliştirici ara…", EN: "Search games or developers…" })} className="h-10 w-full rounded-full border border-zinc-200 bg-white ps-10 pe-4 text-[13px] text-zinc-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100" />
                        </div>
                    </div>

                    {loading ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {Array.from({ length: 8 }, (_, index) => (
                                <div key={index} className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-white/[0.06] dark:bg-zinc-900/60">
                                    <div className="aspect-video animate-pulse bg-zinc-200 dark:bg-white/[0.05]" />
                                    <div className="space-y-2 p-3.5"><div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-white/[0.06]" /><div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-white/[0.04]" /></div>
                                </div>
                            ))}
                        </div>
                    ) : games.length ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {games.map((game, index) => <GameCard key={game.id} game={game} index={index} />)}
                        </div>
                    ) : (
                        <div className="grid place-items-center rounded-3xl border border-dashed border-zinc-300 bg-white/60 px-6 py-16 text-center dark:border-white/10 dark:bg-white/[0.02]">
                            {error !== null ? <p className="mb-3 text-sm text-red-500">{(language === "TR" && error) || tx({ TR: "Arcade yüklenemedi.", EN: "The Arcade couldn't be loaded." })}</p> : null}
                            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-3xl shadow-xl animate-float">🎮</div>
                            <h2 className="mt-5 text-xl font-bold text-zinc-900 dark:text-white">{debounced ? tx({ TR: "Sonuç bulunamadı", EN: "No results" }) : tx({ TR: "Arcade seni bekliyor", EN: "The Arcade is waiting for you" })}</h2>
                            <p className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{debounced ? tx({ TR: "Farklı bir arama deneyin.", EN: "Try a different search." }) : tx({ TR: "Henüz yayınlanmış oyun yok. Bir şablonla başlayıp birkaç dakikada ilk oyunu sen yayınla!", EN: "No games have been published yet. Start from a template and publish the first one in minutes!" })}</p>
                            <Link href="/game-engine" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900"><Plus className="h-4 w-4" />{tx({ TR: "Oyun yap", EN: "Make a game" })}</Link>
                        </div>
                    )}
                    {loading ? <p className="sr-only"><LoaderCircle className="animate-spin" />{tx({ TR: "Yükleniyor", EN: "Loading" })}</p> : null}
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
