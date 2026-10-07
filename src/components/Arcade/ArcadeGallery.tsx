"use client";

import { Box, Flame, Gamepad2, GitFork, Heart, LoaderCircle, Play, Plus, Search, Sparkles, Square, Star, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { ARCADE_GENRES, ARCADE_GENRE_LABELS, type ArcadeGenre } from "@/lib/arcade-genres";
import { useI18n, type Copy } from "@/lib/i18n";
import { ARCADE_FEED_ERRORS, useArcadeFeed, type ArcadeFeedError } from "./useArcadeFeed";

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
    genre: ArcadeGenre;
    /** The creator page (/arcade/creator/{id}); null until the game is listed again. */
    creatorId: string | null;
    ratingCount: number;
    /** Average stars, one decimal; null without ratings. */
    ratingAverage: number | null;
    featured: boolean;
    createdAt: string | null;
    updatedAt: string | null;
}

type Sort = "new" | "popular" | "rated";

const C = {
    tagline: { TR: "Topluluk oyunları · Tarayıcıda anında oyna", EN: "Community games · Play instantly in your browser" },
    intro: { TR: "Hanogt Engine ile C# ve C++ kullanılarak yapılmış 2D ve 3D oyunlar. İndirme yok, kurulum yok: tıkla ve oyna. Beğendiğin oyunu remiksleyip kendi versiyonunu yap.", EN: "2D and 3D games made with Hanogt Engine in C# and C++. No downloads, no installs: click and play. Remix a game you like to make your own version." },
    make: { TR: "Kendi oyununu yap", EN: "Make your own game" },
    newest: { TR: "En yeni", EN: "Newest" },
    popular: { TR: "En çok oynanan", EN: "Most played" },
    rated: { TR: "En yüksek puanlı", EN: "Top rated" },
    sort: { TR: "Sıralama", EN: "Sort by" },
    genres: { TR: "Oyun türü", EN: "Genre" },
    allGenres: { TR: "Tümü", EN: "All" },
    dimension: { TR: "Boyut filtresi", EN: "Dimension filter" },
    only2d: { TR: "Yalnızca 2D", EN: "2D only" },
    only3d: { TR: "Yalnızca 3D", EN: "3D only" },
    search: { TR: "Oyun veya geliştirici ara…", EN: "Search games or developers…" },
    featured: { TR: "Öne çıkanlar", EN: "Featured" },
    featuredHint: { TR: "Hanogt ekibinin seçtiği oyunlar", EN: "Games picked by the Hanogt team" },
    featuredBadge: { TR: "Öne çıkan", EN: "Featured" },
    loadMore: { TR: "Daha fazla oyun", EN: "More games" },
    shown: { TR: "{count} oyun gösteriliyor", EN: "Showing {count} games" },
    loading: { TR: "Yükleniyor", EN: "Loading" },
    loadFailed: { TR: "Arcade yüklenemedi.", EN: "The Arcade couldn't be loaded." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    noResults: { TR: "Sonuç bulunamadı", EN: "No results" },
    noResultsHint: { TR: "Farklı bir arama ya da tür deneyin.", EN: "Try a different search or genre." },
    empty: { TR: "Arcade seni bekliyor", EN: "The Arcade is waiting for you" },
    emptyHint: { TR: "Henüz yayınlanmış oyun yok. Bir şablonla başlayıp birkaç dakikada ilk oyunu sen yayınla!", EN: "No games have been published yet. Start from a template and publish the first one in minutes!" },
    makeGame: { TR: "Oyun yap", EN: "Make a game" },
    remixable: { TR: "Remikslenebilir", EN: "Remixable" },
    defaultDescription: { TR: "Hanogt Engine ile yapılmış bir oyun.", EN: "A game made with Hanogt Engine." },
    rating: { TR: "{average} yıldız, {count} oy", EN: "{average} stars, {count} ratings" },
    noRating: { TR: "Henüz puan yok", EN: "No ratings yet" },
    plays: { TR: "{count} oynanma", EN: "{count} plays" },
    likes: { TR: "{count} beğeni", EN: "{count} likes" },
    creatorPage: { TR: "{name} adlı yapımcının oyunları", EN: "Games by {name}" },
} satisfies Record<string, Copy>;

export function compactNumber(value: number, locale = "tr-TR") {
    try {
        return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
    } catch {
        return String(value);
    }
}

/** The translated message of a failed Arcade request (the server's Turkish text for Turkish visitors). */
export function useArcadeErrorText() {
    const { tx, language } = useI18n();
    return (error: ArcadeFeedError, fallback: Copy = C.loadFailed) => {
        if (ARCADE_FEED_ERRORS[error.code]) return tx(ARCADE_FEED_ERRORS[error.code]);
        return language === "TR" && error.message ? error.message : tx(fallback);
    };
}

export function RatingBadge({ game, size = "sm" }: { game: Pick<ArcadeGameSummary, "ratingAverage" | "ratingCount">; size?: "sm" | "md" }) {
    const { tx, locale } = useI18n();
    if (game.ratingAverage === null || !game.ratingCount) return null;
    const label = tx(C.rating, { average: game.ratingAverage.toLocaleString(locale), count: game.ratingCount });
    return (
        <span className={`inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300 ${size === "md" ? "text-[13px]" : "text-[12px]"}`} title={label}>
            <Star className={size === "md" ? "h-4 w-4 fill-current" : "h-3.5 w-3.5 fill-current"} aria-hidden />
            <span aria-hidden>{game.ratingAverage.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            <span className="font-normal text-zinc-500 dark:text-zinc-400" aria-hidden>({compactNumber(game.ratingCount, locale)})</span>
            <span className="sr-only">{label}</span>
        </span>
    );
}

export function CreatorAvatar({ name, image, size = "sm" }: { name: string; image: string | null; size?: "sm" | "md" | "lg" }) {
    const box = size === "lg" ? "h-16 w-16 text-2xl" : size === "md" ? "h-6 w-6 text-[11px]" : "h-5 w-5 text-[10px]";
    return image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={image} alt="" referrerPolicy="no-referrer" className={`${box} shrink-0 rounded-full object-cover`} />
        : <span aria-hidden className={`${box} grid shrink-0 place-items-center rounded-full bg-indigo-600 font-bold text-white`}>{name.charAt(0).toUpperCase()}</span>;
}

/**
 * A game in a list. The title is the card's link (it covers the card); the
 * author's name links to their creator page on top of it.
 */
export function GameCard({ game, index = 0, showAuthor = true }: { game: ArcadeGameSummary; index?: number; showAuthor?: boolean }) {
    const { tx, locale } = useI18n();
    return (
        <article
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition duration-300 focus-within:ring-2 focus-within:ring-indigo-500 hover:-translate-y-0.5 hover:border-indigo-300 dark:border-white/[0.08] dark:bg-zinc-900 dark:hover:border-indigo-500/40 animate-fade-up"
            style={{ animationDelay: `${Math.min(index, 16) * 40}ms` }}
        >
            <div className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                {game.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={game.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                    <div className="grid h-full place-items-center text-zinc-400 dark:text-zinc-500">
                        <Gamepad2 className="h-12 w-12" aria-hidden />
                    </div>
                )}
                <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    {game.dimension === "3d" ? <Box className="h-3 w-3" aria-hidden /> : <Square className="h-3 w-3" aria-hidden />}{game.dimension}
                </span>
                <div className="absolute end-2 top-2 flex gap-1">
                    {game.featured ? <span title={tx(C.featuredBadge)} className="inline-flex items-center rounded-md bg-amber-500 px-1.5 py-0.5 text-white"><Star className="h-3 w-3 fill-current" aria-label={tx(C.featuredBadge)} /></span> : null}
                    {game.allowRemix ? <span title={tx(C.remixable)} className="inline-flex items-center rounded-md bg-emerald-600 px-1.5 py-0.5 text-white"><GitFork className="h-3 w-3" aria-label={tx(C.remixable)} /></span> : null}
                    {game.engineVersion ? <span title={`Hanogt Engine V${game.engineVersion}`} className="rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black text-white">V{game.engineVersion}</span> : null}
                    {game.languages.map((language) => <span key={language} className="rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-black text-white">{language}</span>)}
                </div>
            </div>
            <div className="flex flex-1 flex-col p-3.5">
                <h3 className="line-clamp-1 text-[15px] font-bold text-zinc-900 dark:text-white" dir="auto">
                    <Link href={`/arcade/${game.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">{game.title}</Link>
                </h3>
                <p className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[12.5px] leading-snug text-zinc-500 dark:text-zinc-400" dir="auto">{game.description || tx(C.defaultDescription)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{tx(ARCADE_GENRE_LABELS[game.genre] ?? ARCADE_GENRE_LABELS.other)}</span>
                    <RatingBadge game={game} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
                    {showAuthor ? (
                        game.creatorId ? (
                            <Link href={`/arcade/creator/${game.creatorId}`} className="relative z-10 flex min-w-0 flex-1 items-center gap-2 rounded-md font-medium hover:text-zinc-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:text-white" title={tx(C.creatorPage, { name: game.authorName })}>
                                <CreatorAvatar name={game.authorName} image={game.authorImage} />
                                <span className="truncate">{game.authorName}</span>
                            </Link>
                        ) : (
                            <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                                <CreatorAvatar name={game.authorName} image={game.authorImage} />
                                <span className="truncate">{game.authorName}</span>
                            </span>
                        )
                    ) : <span className="flex-1" />}
                    <span className="inline-flex items-center gap-1" title={tx(C.plays, { count: game.plays })}><Play className="h-3 w-3" aria-hidden /><span aria-hidden>{compactNumber(game.plays, locale)}</span><span className="sr-only">{tx(C.plays, { count: game.plays })}</span></span>
                    <span className="inline-flex items-center gap-1" title={tx(C.likes, { count: game.likes })}><Heart className="h-3 w-3" aria-hidden /><span aria-hidden>{compactNumber(game.likes, locale)}</span><span className="sr-only">{tx(C.likes, { count: game.likes })}</span></span>
                </div>
            </div>
        </article>
    );
}

export function GameGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-zinc-900">
                    <div className="aspect-video animate-pulse bg-zinc-200 dark:bg-white/[0.05]" />
                    <div className="space-y-2 p-3.5"><div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-white/[0.06]" /><div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-white/[0.04]" /></div>
                </div>
            ))}
        </div>
    );
}

/** "Load more" under a paged list, with how many games are shown. */
export function LoadMoreGames({ shown, hasMore, loading, error, onMore }: { shown: number; hasMore: boolean; loading: boolean; error: string | null; onMore: () => void }) {
    const { tx } = useI18n();
    return (
        <div className="mt-8 flex flex-col items-center gap-2">
            <p className="text-xs text-zinc-500" aria-live="polite">{tx(C.shown, { count: shown })}</p>
            {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            {hasMore ? (
                <button type="button" onClick={onMore} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-white/10">
                    {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {tx(C.loadMore)}
                </button>
            ) : null}
        </div>
    );
}

export default function ArcadeGallery() {
    const { tx } = useI18n();
    const errorText = useArcadeErrorText();
    const [sort, setSort] = useState<Sort>("new");
    const [genre, setGenre] = useState<"all" | ArcadeGenre>("all");
    const [dimension, setDimension] = useState<"all" | "2d" | "3d">("all");
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [query]);

    const params = new URLSearchParams({ sort });
    if (genre !== "all") params.set("genre", genre);
    if (dimension !== "all") params.set("dimension", dimension);
    if (debounced) params.set("q", debounced);
    const feed = useArcadeFeed(params.toString());
    const filtered = genre !== "all" || dimension !== "all" || Boolean(debounced);

    const tab = (value: Sort, label: string, Icon: typeof Flame) => (
        <button type="button" onClick={() => setSort(value)} aria-pressed={sort === value} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition sm:px-4 ${sort === value ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"}`}>
            <Icon className="h-4 w-4" aria-hidden />{label}
        </button>
    );

    const genreChip = (value: "all" | ArcadeGenre, label: string) => (
        <button key={value} type="button" onClick={() => setGenre(value)} aria-pressed={genre === value} className={`h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-semibold transition ${genre === value ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-white"}`}>
            {label}
        </button>
    );

    return (
        <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
            <Header />
            <main id="main-content" className="relative overflow-x-hidden">
                <section className="border-b border-zinc-200/70 dark:border-white/[0.06]">
                    <div className="mx-auto max-w-7xl px-4 pb-10 pt-28 sm:pb-12 sm:pt-32">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[12px] font-semibold text-indigo-700 dark:text-indigo-300"><Sparkles className="h-3.5 w-3.5" aria-hidden />{tx(C.tagline)}</span>
                        <h1 className="mt-4 text-4xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-6xl">
                            Hanogt <span className="text-indigo-600 dark:text-indigo-400">Arcade</span>
                        </h1>
                        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.intro)}</p>
                        <div className="mt-6">
                            <Link href="/game-engine" className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-[14px] font-bold text-white transition hover:bg-indigo-700"><Plus className="h-4 w-4" aria-hidden />{tx(C.make)}</Link>
                        </div>
                    </div>
                </section>

                <section className="mx-auto max-w-7xl px-4 py-8">
                    {feed.featured.length > 0 ? (
                        <div className="mb-10">
                            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <h2 className="flex items-center gap-2 text-xl font-black text-zinc-900 dark:text-white"><Star className="h-5 w-5 fill-amber-500 text-amber-500" aria-hidden />{tx(C.featured)}</h2>
                                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{tx(C.featuredHint)}</p>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {feed.featured.slice(0, 4).map((game, index) => <GameCard key={game.id} game={game} index={index} />)}
                            </div>
                        </div>
                    ) : null}

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-zinc-900" role="group" aria-label={tx(C.sort)}>
                            {tab("new", tx(C.newest), Sparkles)}
                            {tab("popular", tx(C.popular), Flame)}
                            {tab("rated", tx(C.rated), Trophy)}
                        </div>
                        <select value={dimension} onChange={(event) => setDimension(event.target.value as typeof dimension)} className="h-10 rounded-full border border-zinc-200 bg-white px-4 text-[13px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200" aria-label={tx(C.dimension)}>
                            <option value="all">2D + 3D</option>
                            <option value="2d">{tx(C.only2d)}</option>
                            <option value="3d">{tx(C.only3d)}</option>
                        </select>
                        <div className="relative w-full sm:ms-auto sm:w-72">
                            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                            <input type="search" value={query} maxLength={60} onChange={(event) => setQuery(event.target.value)} placeholder={tx(C.search)} aria-label={tx(C.search)} className="h-10 w-full rounded-full border border-zinc-200 bg-white pe-4 ps-10 text-[13px] text-zinc-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100" />
                        </div>
                    </div>
                    <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={tx(C.genres)}>
                        {genreChip("all", tx(C.allGenres))}
                        {ARCADE_GENRES.map((value) => genreChip(value, tx(ARCADE_GENRE_LABELS[value])))}
                    </div>

                    {feed.loading && feed.games.length === 0 ? (
                        <>
                            <GameGridSkeleton />
                            <p className="sr-only" role="status">{tx(C.loading)}</p>
                        </>
                    ) : feed.error ? (
                        <div role="alert" className="grid place-items-center rounded-3xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-white/10 dark:bg-zinc-900">
                            <Gamepad2 className="h-10 w-10 text-zinc-400" aria-hidden />
                            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errorText(feed.error)}</p>
                            <button type="button" onClick={feed.retry} className="mt-4 inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">{tx(C.retry)}</button>
                        </div>
                    ) : feed.games.length ? (
                        <>
                            <div className={`grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${feed.loading ? "opacity-50" : ""}`} aria-busy={feed.loading}>
                                {feed.games.map((game, index) => <GameCard key={game.id} game={game} index={index % 24} />)}
                            </div>
                            {!feed.loading ? (
                                <LoadMoreGames shown={feed.games.length} hasMore={Boolean(feed.nextCursor)} loading={feed.loadingMore} error={feed.moreError ? errorText(feed.moreError) : null} onMore={() => void feed.loadMore()} />
                            ) : null}
                        </>
                    ) : (
                        <div className="grid place-items-center rounded-3xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-white/10 dark:bg-zinc-900">
                            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-indigo-600 text-white"><Gamepad2 className="h-8 w-8" aria-hidden /></span>
                            <h2 className="mt-5 text-xl font-bold text-zinc-900 dark:text-white">{filtered ? tx(C.noResults) : tx(C.empty)}</h2>
                            <p className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{filtered ? tx(C.noResultsHint) : tx(C.emptyHint)}</p>
                            <Link href="/game-engine" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900"><Plus className="h-4 w-4" aria-hidden />{tx(C.makeGame)}</Link>
                        </div>
                    )}
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
