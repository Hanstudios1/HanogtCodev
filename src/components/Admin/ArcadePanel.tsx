"use client";

import { AnimatePresence, motion } from "framer-motion";
import { EyeOff, Gamepad2, Heart, Play, SquareArrowOutUpRight, Star } from "lucide-react";
import { useState } from "react";
import OptimizedImage from "@/components/OptimizedImage";
import { useI18n } from "@/lib/i18n";
import { adminPost, type ApiFailure } from "./api";
import { COMMON } from "./copy";
import { formatNumber, useAdminResource } from "./hooks";
import type { AdminArcadeActionResponse, AdminArcadeGame, AdminArcadeResponse } from "./types";
import {
    Badge, Button, ConfirmDialog, EmptyState, ErrorNotice, FilterChips, IconButton, LoadingRows, RelativeTime, SearchInput, TextArea,
    cx, useErrorText, useToast,
} from "./ui";

const UNPUBLISH_REASON_MAX = 500;

export default function ArcadePanel() {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const games = useAdminResource<AdminArcadeResponse>("/api/admin/arcade");
    const [filter, setFilter] = useState<"all" | "featured">("all");
    const [query, setQuery] = useState("");
    const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
    const [target, setTarget] = useState<AdminArcadeGame | null>(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);

    const list = games.data?.games ?? [];
    const needle = query.trim().toLocaleLowerCase(locale);
    const visible = list
        .filter((game) => filter === "all" || game.featured)
        .filter((game) => !needle || `${game.title} ${game.authorName} ${game.ownerEmail}`.toLocaleLowerCase(locale).includes(needle));

    const toggleFeatured = async (game: AdminArcadeGame) => {
        const featured = !game.featured;
        const forKey = games.dataKey;
        const setFlag = (value: boolean) => games.mutate((current) => ({
            games: current.games.map((item) => (item.id === game.id ? { ...item, featured: value } : item)),
        }), forKey);
        setPendingIds((ids) => [...ids, game.id]);
        setFlag(featured);
        const result = await adminPost<AdminArcadeActionResponse>("/api/admin/arcade", { action: featured ? "feature" : "unfeature", gameId: game.id });
        setPendingIds((ids) => ids.filter((id) => id !== game.id));
        if (!result.ok) {
            setFlag(game.featured);
            toast("error", errorText(result));
            return;
        }
        toast("success", featured
            ? tx({ TR: "\"{title}\" öne çıkarıldı.", EN: "\"{title}\" is now featured." }, { title: game.title })
            : tx({ TR: "\"{title}\" artık öne çıkarılmıyor.", EN: "\"{title}\" is no longer featured." }, { title: game.title }));
    };

    const confirmUnpublish = async () => {
        if (!target) return;
        setBusy(true);
        setError(null);
        const result = await adminPost<AdminArcadeActionResponse>("/api/admin/arcade", {
            action: "unpublish",
            gameId: target.id,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
        setBusy(false);
        if (!result.ok && result.code !== "not_found") {
            setError(result);
            return;
        }
        const removedId = target.id;
        games.mutate((current) => ({ games: current.games.filter((game) => game.id !== removedId) }));
        toast("success", tx({ TR: "\"{title}\" Arcade'den kaldırıldı.", EN: "\"{title}\" was removed from the Arcade." }, { title: target.title }));
        setTarget(null);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <FilterChips
                    label={tx({ TR: "Oyun filtresi", EN: "Game filter" })}
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: "all", label: tx(COMMON.all), count: list.length },
                        { value: "featured", label: tx({ TR: "Öne çıkanlar", EN: "Featured" }), count: list.filter((game) => game.featured).length },
                    ]}
                />
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    className="min-w-0 flex-1"
                    label={tx({ TR: "Oyunlarda ara", EN: "Search games" })}
                    placeholder={tx({ TR: "Başlık, geliştirici veya e-posta…", EN: "Title, developer or e-mail…" })}
                />
            </div>

            {games.error ? <ErrorNotice error={games.error} onRetry={games.reload} /> : null}

            {!games.data && games.loading ? (
                <LoadingRows rows={3} />
            ) : visible.length === 0 ? (
                <EmptyState
                    icon={Gamepad2}
                    title={list.length ? tx(COMMON.noResults) : tx({ TR: "Yayında oyun yok", EN: "No published games" })}
                    action={list.length ? <Button size="sm" onClick={() => { setFilter("all"); setQuery(""); }}>{tx(COMMON.clearFilters)}</Button> : undefined}
                />
            ) : (
                <ul className={cx("grid gap-3 sm:grid-cols-2 2xl:grid-cols-3", games.loading && "opacity-60")}>
                    <AnimatePresence initial={false}>
                        {visible.map((game) => (
                            <motion.li
                                key={game.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.97 }}
                                className={cx(
                                    "flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-900/60",
                                    game.featured ? "border-amber-300 dark:border-amber-500/40" : "border-zinc-200 dark:border-white/10",
                                )}
                            >
                                <div className="relative aspect-video bg-gradient-to-br from-indigo-500/20 via-violet-500/15 to-fuchsia-500/20">
                                    {game.thumbnail ? (
                                        <OptimizedImage src={game.thumbnail} alt="" width={480} height={270} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                                    ) : (
                                        <span className="absolute inset-0 grid place-items-center text-violet-500/60"><Gamepad2 className="h-10 w-10" aria-hidden="true" /></span>
                                    )}
                                    <div className="absolute start-2 top-2 flex gap-1.5">
                                        <Badge tone="zinc" className="bg-white/90 dark:bg-zinc-900/90">{game.dimension.toUpperCase()}</Badge>
                                        {game.featured ? <Badge tone="amber" icon={Star} className="bg-amber-50/95">{tx({ TR: "Öne çıkan", EN: "Featured" })}</Badge> : null}
                                    </div>
                                </div>
                                <div className="flex flex-1 flex-col p-4">
                                    <p className="truncate text-sm font-black text-zinc-900 dark:text-white" dir="auto">{game.title || tx({ TR: "Adsız oyun", EN: "Untitled game" })}</p>
                                    <p className="truncate text-[12px] text-zinc-500">{game.authorName || "—"} · <span dir="ltr">{game.ownerEmail || "—"}</span></p>
                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-zinc-500">
                                        <span className="inline-flex items-center gap-1"><Play className="h-3.5 w-3.5" aria-hidden="true" />{formatNumber(game.plays, locale)}</span>
                                        <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" aria-hidden="true" />{formatNumber(game.likes, locale)}</span>
                                        <RelativeTime iso={game.updatedAt} />
                                    </div>
                                    <div className="mt-auto flex items-center gap-1.5 pt-3">
                                        <IconButton
                                            label={game.featured ? tx({ TR: "Öne çıkarmayı kaldır", EN: "Unfeature" }) : tx({ TR: "Öne çıkar", EN: "Feature" })}
                                            icon={Star}
                                            tone="warning"
                                            active={game.featured}
                                            busy={pendingIds.includes(game.id)}
                                            className={game.featured ? "text-amber-500" : undefined}
                                            onClick={() => void toggleFeatured(game)}
                                        />
                                        <a
                                            href={`/arcade/${encodeURIComponent(game.id)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={tx({ TR: "Oyunu yeni sekmede aç", EN: "Open the game in a new tab" })}
                                            title={tx({ TR: "Oyunu yeni sekmede aç", EN: "Open the game in a new tab" })}
                                            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/[0.08] dark:hover:text-white"
                                        >
                                            <SquareArrowOutUpRight className="h-4 w-4" aria-hidden="true" />
                                        </a>
                                        <span className="flex-1" />
                                        <Button size="sm" variant="ghost" icon={EyeOff} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={() => { setTarget(game); setReason(""); setError(null); }}>
                                            {tx({ TR: "Yayından kaldır", EN: "Unpublish" })}
                                        </Button>
                                    </div>
                                </div>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}

            <ConfirmDialog
                open={Boolean(target)}
                onClose={() => { if (!busy) setTarget(null); }}
                onConfirm={() => void confirmUnpublish()}
                busy={busy}
                error={error}
                icon={EyeOff}
                title={tx({ TR: "Oyun yayından kaldırılsın mı?", EN: "Unpublish this game?" })}
                description={target ? tx({ TR: "\"{title}\" Arcade'den ve beğenileriyle birlikte kaldırılır. Geliştiricinin motor projesi silinmez.", EN: "\"{title}\" is removed from the Arcade together with its likes. The developer's engine project is kept." }, { title: target.title }) : undefined}
                confirmLabel={tx({ TR: "Yayından kaldır", EN: "Unpublish" })}
                confirmDisabled={reason.length > UNPUBLISH_REASON_MAX}
            >
                <TextArea
                    label={tx({ TR: "Gerekçe", EN: "Reason" })}
                    optional
                    value={reason}
                    onChange={setReason}
                    max={UNPUBLISH_REASON_MAX}
                    rows={2}
                    hint={tx({ TR: "Denetim kaydına yazılır.", EN: "Written to the audit log." })}
                />
            </ConfirmDialog>
        </div>
    );
}
