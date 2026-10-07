"use client";

import { ArrowLeft, Gamepad2 } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { useI18n } from "@/lib/i18n";
import { CreatorAvatar, GameCard, GameGridSkeleton, LoadMoreGames, useArcadeErrorText } from "./ArcadeGallery";
import { useArcadeFeed } from "./useArcadeFeed";

const C = {
    back: { TR: "Arcade'e dön", EN: "Back to the Arcade" },
    creator: { TR: "Yapımcı", EN: "Creator" },
    games: { TR: "{count} yayında oyun", EN: "{count} published games" },
    intro: { TR: "Hanogt Engine ile yapıp Arcade'de yayımladığı oyunlar.", EN: "Games they made with Hanogt Engine and published on the Arcade." },
    notFound: { TR: "Bu yapımcının yayında oyunu yok", EN: "This creator has no published games" },
    notFoundHint: { TR: "Oyunlar yayından kaldırılmış olabilir.", EN: "The games may have been unpublished." },
    loading: { TR: "Yükleniyor", EN: "Loading" },
    retry: { TR: "Tekrar dene", EN: "Try again" },
};

/** /arcade/creator/{id}: a creator's published games, newest first, with the name and picture of their public profile. */
export default function ArcadeCreatorView({ creatorId }: { creatorId: string }) {
    const { tx, locale } = useI18n();
    const errorText = useArcadeErrorText();
    const feed = useArcadeFeed(new URLSearchParams({ creator: creatorId }).toString());
    const creator = feed.creator;
    const missing = feed.error?.code === "creator_not_found";

    return (
        <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
            <Header />
            <main id="main-content" className="mx-auto max-w-7xl overflow-x-hidden px-4 pb-16 pt-24 sm:pt-28">
                <Link href="/arcade" className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{tx(C.back)}</Link>
                {creator ? (
                    <header className="mb-8 flex flex-wrap items-center gap-4 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900 sm:p-6">
                        <CreatorAvatar name={creator.name} image={creator.avatar} size="lg" />
                        <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{tx(C.creator)}</p>
                            <h1 className="mt-1 break-words text-2xl font-black text-zinc-900 dark:text-white sm:text-3xl" dir="auto">{creator.name}</h1>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                                {typeof creator.games === "number" ? <><span className="font-semibold text-zinc-700 dark:text-zinc-300">{tx(C.games, { count: creator.games.toLocaleString(locale) })}</span><span aria-hidden> · </span></> : null}
                                <span>{tx(C.intro)}</span>
                            </p>
                        </div>
                    </header>
                ) : feed.loading ? (
                    <div className="mb-8 flex items-center gap-4 rounded-3xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900" aria-hidden>
                        <div className="h-16 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" />
                        <div className="space-y-2"><div className="h-6 w-48 animate-pulse rounded bg-zinc-200 dark:bg-white/10" /><div className="h-4 w-64 animate-pulse rounded bg-zinc-100 dark:bg-white/5" /></div>
                    </div>
                ) : null}

                {feed.loading && feed.games.length === 0 ? (
                    <>
                        <GameGridSkeleton count={4} />
                        <p className="sr-only" role="status">{tx(C.loading)}</p>
                    </>
                ) : missing ? (
                    <div className="grid place-items-center rounded-3xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-white/10 dark:bg-zinc-900">
                        <Gamepad2 className="h-10 w-10 text-zinc-400" aria-hidden />
                        <h1 className="mt-4 text-xl font-bold text-zinc-900 dark:text-white">{tx(C.notFound)}</h1>
                        <p className="mt-2 text-sm text-zinc-500">{tx(C.notFoundHint)}</p>
                    </div>
                ) : feed.error ? (
                    <div role="alert" className="grid place-items-center rounded-3xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-white/10 dark:bg-zinc-900">
                        <p className="text-sm text-red-600 dark:text-red-400">{errorText(feed.error)}</p>
                        <button type="button" onClick={feed.retry} className="mt-4 inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">{tx(C.retry)}</button>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {feed.games.map((game, index) => <GameCard key={game.id} game={game} index={index % 24} showAuthor={false} />)}
                        </div>
                        <LoadMoreGames shown={feed.games.length} hasMore={Boolean(feed.nextCursor)} loading={feed.loadingMore} error={feed.moreError ? errorText(feed.moreError) : null} onMore={() => void feed.loadMore()} />
                    </>
                )}
            </main>
            <SiteFooter />
        </div>
    );
}
