"use client";

import { useI18n } from "@/lib/i18n";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, ExternalLink, Info, LoaderCircle, RefreshCw, Scale, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { timeAgo } from "./NewsTypes";

interface ArenaStanding {
    id: string;
    name: string;
    organization: string;
    rating: number;
    wins: number;
    losses: number;
    ties: number;
    games: number;
    winRate: number | null;
}

interface ArenaView {
    category: string;
    standings: ArenaStanding[];
    votes: number;
    updatedAt: string | null;
}

interface ExternalModelView {
    id: string;
    name: string;
    organization: string;
    score: number | null;
    scoreLabel: string | null;
    detail: string | null;
    url: string | null;
    released: string | null;
}

interface ExternalBoardView {
    id: string;
    title: string;
    description: string;
    sourceName: string;
    sourceUrl: string;
    fetchedAt: string;
    models: ExternalModelView[];
}

interface RankingsPayload {
    external: ExternalBoardView[];
    arena: ArenaView | null;
    categories: Array<{ id: string; tr: string; en: string }>;
    models: Array<{ id: string; name: string; organization: string }>;
    pair: [string, string];
}

type Notice = { kind: "ok" | "error" | "login"; text: string } | null;

const MEDALS = ["🥇", "🥈", "🥉"];

function randomPair(models: RankingsPayload["models"], previous?: [string, string] | null): [string, string] | null {
    if (models.length < 2) return null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const first = Math.floor(Math.random() * models.length);
        let second = Math.floor(Math.random() * (models.length - 1));
        if (second >= first) second += 1;
        const pair: [string, string] = [models[first].id, models[second].id];
        if (!previous || pair.slice().sort().join() !== previous.slice().sort().join()) return pair;
    }
    return [models[0].id, models[1].id];
}

export default function AiRankings({ locale, now }: { locale: "tr" | "en"; now: number }) {
    const { tx, language } = useI18n();
    const [category, setCategory] = useState("code");
    const [tab, setTab] = useState<string>("arena");
    const [data, setData] = useState<RankingsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pair, setPair] = useState<[string, string] | null>(null);
    const [voting, setVoting] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch(`/api/news/rankings?category=${encodeURIComponent(category)}`, { signal: controller.signal, cache: "no-store" });
                if (!response.ok) throw new Error(tx({ TR: "Sıralamalar yüklenemedi.", EN: "Could not load rankings." }));
                const payload = await response.json() as RankingsPayload;
                setData(payload);
                setPair((current) => current ?? payload.pair);
                setError(null);
            } catch (reason) {
                if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void load();
        return () => controller.abort();
    }, [category, reload, tx]);

    const modelName = (id: string) => data?.models.find((model) => model.id === id)?.name ?? id;
    const modelOrg = (id: string) => data?.models.find((model) => model.id === id)?.organization ?? "";
    const categoryLabel = (id: string) => {
        const entry = data?.categories.find((item) => item.id === id);
        return entry ? tx({ TR: entry.tr, EN: entry.en }) : id;
    };

    const vote = async (result: "a" | "b" | "tie") => {
        if (!pair || voting) return;
        setVoting(true);
        setNotice(null);
        try {
            const response = await fetch("/api/news/rankings/vote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ category, a: pair[0], b: pair[1], result }),
            });
            const payload = await response.json().catch(() => ({})) as { arena?: ArenaView; error?: string };
            if (response.status === 401) {
                setNotice({ kind: "login", text: tx({ TR: "Oy vermek için giriş yapmalısın.", EN: "Sign in to vote." }) });
                return;
            }
            if (!response.ok || !payload.arena) throw new Error(payload.error || (tx({ TR: "Oy kaydedilemedi.", EN: "Vote failed." })));
            setData((current) => (current ? { ...current, arena: payload.arena ?? current.arena } : current));
            const winner = result === "tie" ? null : modelName(result === "a" ? pair[0] : pair[1]);
            setNotice({ kind: "ok", text: winner ? tx({ TR: "Oyun kaydedildi: {winner} kazandı 🎉", EN: "Vote saved: {winner} wins 🎉" }, { winner }) : (tx({ TR: "Oyun kaydedildi: berabere", EN: "Vote saved: tie" })) });
            setPair((current) => (data ? randomPair(data.models, current) : current));
        } catch (reason) {
            setNotice({ kind: "error", text: reason instanceof Error ? reason.message : String(reason) });
        } finally {
            setVoting(false);
        }
    };

    const arena = data?.arena ?? null;
    const ratings = arena?.standings.map((entry) => entry.rating) ?? [];
    const maxRating = ratings.length ? Math.max(...ratings) : 1000;
    const minRating = ratings.length ? Math.min(...ratings) : 1000;
    const board = data?.external.find((entry) => entry.id === tab) ?? null;

    const tabButton = (id: string, label: string) => (
        <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`relative shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${tab === id ? "text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"}`}
        >
            {tab === id ? <motion.span layoutId="ai-rank-tab" className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 shadow" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
            <span className="relative">{label}</span>
        </button>
    );

    return (
        <section className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-sm dark:border-white/[0.08] dark:bg-zinc-900/70" aria-labelledby="ai-rankings-title">
            <div className="relative overflow-hidden border-b border-zinc-200/70 p-4 dark:border-white/[0.06]">
                <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-fuchsia-500/20 blur-2xl" />
                <div className="relative flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-pink-500 text-white shadow-lg shadow-pink-500/25"><Trophy className="h-4.5 w-4.5" /></span>
                    <div className="min-w-0 flex-1">
                        <h2 id="ai-rankings-title" className="text-[15px] font-black text-zinc-900 dark:text-white">{tx({ TR: "Yapay Zeka Sıralamaları", EN: "AI Leaderboards" })}</h2>
                        <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">{tx({ TR: "Topluluk oyları + canlı dış kaynaklar", EN: "Community votes + live external sources" })}</p>
                    </div>
                    <button type="button" onClick={() => setReload((value) => value + 1)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-white" aria-label={tx({ TR: "Yenile", EN: "Refresh" })}>
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
                <div className="scrollbar-none relative mt-3 flex gap-1 overflow-x-auto">
                    {tabButton("arena", tx({ TR: "Topluluk Arenası", EN: "Community Arena" }))}
                    {data?.external.map((entry) => tabButton(entry.id, entry.id === "openrouter-new" ? (tx({ TR: "Yeni modeller", EN: "New models" })) : entry.title))}
                </div>
            </div>

            {error && !data ? <p className="m-4 rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">{error}</p> : null}
            {!data && loading ? (
                <div className="space-y-2 p-4">
                    {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-9 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.05]" />)}
                </div>
            ) : null}

            {data && tab === "arena" ? (
                <div className="p-4">
                    <div className="flex items-center gap-2">
                        <label htmlFor="arena-category" className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{tx({ TR: "Kategori", EN: "Category" })}</label>
                        <select
                            id="arena-category"
                            value={category}
                            onChange={(event) => { setCategory(event.target.value); setNotice(null); }}
                            className="h-8 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-[12.5px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
                        >
                            {data.categories.map((entry) => <option key={entry.id} value={entry.id}>{tx({ TR: entry.tr, EN: entry.en })}</option>)}
                        </select>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400"><Users className="h-3 w-3" />{arena?.votes ?? 0}</span>
                    </div>

                    <ol className="mt-3 space-y-1.5">
                        <AnimatePresence initial={false}>
                            {arena?.standings.map((entry, index) => {
                                const span = Math.max(1, maxRating - minRating);
                                const width = arena.votes ? 18 + ((entry.rating - minRating) / span) * 82 : 50;
                                return (
                                    <motion.li
                                        key={entry.id}
                                        layout
                                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                        className="relative overflow-hidden rounded-xl border border-zinc-100 px-2.5 py-1.5 dark:border-white/[0.05]"
                                    >
                                        <motion.span
                                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/10 to-transparent"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${width}%` }}
                                            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                                        />
                                        <div className="relative flex items-center gap-2">
                                            <span className="w-6 text-center text-[13px] font-black text-zinc-400">{arena.votes && index < 3 ? MEDALS[index] : index + 1}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{entry.name}</p>
                                                <p className="truncate text-[10.5px] text-zinc-400">{entry.organization}{entry.games ? ` · ${entry.wins}G ${entry.losses}M ${entry.ties}B` : ""}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-mono text-[13px] font-black tabular-nums text-zinc-900 dark:text-white">{entry.rating}</p>
                                                {entry.winRate !== null ? <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">%{entry.winRate}</p> : <p className="text-[10px] text-zinc-400">—</p>}
                                            </div>
                                        </div>
                                    </motion.li>
                                );
                            })}
                        </AnimatePresence>
                    </ol>
                    {arena && !arena.votes ? (
                        <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11.5px] leading-snug text-amber-700 dark:text-amber-300">
                            {tx({ TR: "Bu kategoride henüz oy yok. Tüm modeller 1000 puanla başlar; sıralama sizin oylarınızla oluşur.", EN: "No votes in this category yet. Every model starts at 1000; the ranking is built from your votes." })}
                        </p>
                    ) : null}

                    {pair ? (
                        <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.07] to-fuchsia-500/[0.07] p-3">
                            <p className="flex items-center gap-1.5 text-[12px] font-bold text-indigo-700 dark:text-indigo-300"><Swords className="h-3.5 w-3.5" />{tx({ TR: "Kapışma: {category} için hangisi daha iyi?", EN: "Face-off: which is better at {category}?" }, { category: language === "TR" ? categoryLabel(category) : categoryLabel(category).toLocaleLowerCase(locale) })}</p>
                            <AnimatePresence mode="popLayout" initial={false}>
                                <motion.div key={pair.join(":")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-2 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                                    <button type="button" disabled={voting} onClick={() => void vote("a")} className="rounded-xl border border-zinc-200 bg-white px-2 py-2.5 text-center transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-lg disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900">
                                        <span className="block truncate text-[13px] font-black text-zinc-900 dark:text-white">{modelName(pair[0])}</span>
                                        <span className="block truncate text-[10.5px] text-zinc-400">{modelOrg(pair[0])}</span>
                                    </button>
                                    <span className="grid place-items-center text-[11px] font-black text-zinc-400">VS</span>
                                    <button type="button" disabled={voting} onClick={() => void vote("b")} className="rounded-xl border border-zinc-200 bg-white px-2 py-2.5 text-center transition hover:-translate-y-0.5 hover:border-fuchsia-400 hover:shadow-lg disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900">
                                        <span className="block truncate text-[13px] font-black text-zinc-900 dark:text-white">{modelName(pair[1])}</span>
                                        <span className="block truncate text-[10.5px] text-zinc-400">{modelOrg(pair[1])}</span>
                                    </button>
                                </motion.div>
                            </AnimatePresence>
                            <div className="mt-2 flex items-center gap-2">
                                <button type="button" disabled={voting} onClick={() => void vote("tie")} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/70 text-[12px] font-semibold text-zinc-600 transition hover:bg-white disabled:opacity-50 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/10"><Scale className="h-3.5 w-3.5" />{tx({ TR: "Berabere", EN: "Tie" })}</button>
                                <button type="button" disabled={voting} onClick={() => { setPair((current) => randomPair(data.models, current)); setNotice(null); }} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/70 text-[12px] font-semibold text-zinc-600 transition hover:bg-white disabled:opacity-50 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/10">
                                    {voting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{tx({ TR: "Başka ikili", EN: "Another pair" })}
                                </button>
                            </div>
                            <AnimatePresence>
                                {notice ? (
                                    <motion.p
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        role="status"
                                        className={`mt-2 overflow-hidden rounded-lg px-2.5 py-1.5 text-[12px] font-medium ${notice.kind === "ok" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : notice.kind === "login" ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "bg-red-500/10 text-red-600 dark:text-red-300"}`}
                                    >
                                        {notice.text}
                                        {notice.kind === "login" ? <> <Link href="/login?callbackUrl=/news" className="font-bold underline">{tx({ TR: "Giriş yap", EN: "Sign in" })}</Link></> : null}
                                    </motion.p>
                                ) : null}
                            </AnimatePresence>
                        </div>
                    ) : null}
                    <p className="mt-3 flex gap-1.5 text-[10.5px] leading-snug text-zinc-400">
                        <Info className="mt-px h-3 w-3 shrink-0" />
                        {tx({ TR: "Arena puanları yalnızca Hanogt kullanıcılarının oylarından Elo yöntemiyle (K=24) hesaplanır; resmi bir benchmark değildir. Aynı ikiliye günde bir oy verilebilir.", EN: "Arena ratings are computed only from Hanogt users' votes with Elo (K=24); this is not an official benchmark. One vote per pair per day." })}
                    </p>
                </div>
            ) : null}

            {data && board ? (
                <div className="p-4">
                    <p className="text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">{board.id === "openrouter-new" ? (tx({ TR: "OpenRouter kataloğuna en son eklenen yapay zeka modelleri.", EN: "The latest AI models added to the OpenRouter catalog." })) : board.description}</p>
                    <ol className="mt-3 space-y-1.5">
                        {board.models.map((model, index) => (
                            <motion.li
                                key={model.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: Math.min(index, 12) * 0.03 }}
                                className="flex items-center gap-2 rounded-xl border border-zinc-100 px-2.5 py-1.5 dark:border-white/[0.05]"
                            >
                                <span className="w-6 text-center text-[12px] font-black text-zinc-400">{model.score !== null && index === 0 ? <Crown className="mx-auto h-3.5 w-3.5 text-amber-500" /> : index + 1}</span>
                                <div className="min-w-0 flex-1">
                                    {model.url ? (
                                        <a href={model.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-[12.5px] font-bold text-zinc-800 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-300">{model.name}</a>
                                    ) : <p className="truncate text-[12.5px] font-bold text-zinc-800 dark:text-zinc-100">{model.name}</p>}
                                    <p className="truncate text-[10.5px] text-zinc-400">
                                        {[model.organization, model.detail, model.released ? timeAgo(model.released, locale, now) : null].filter(Boolean).join(" · ")}
                                    </p>
                                </div>
                                {model.score !== null ? (
                                    <div className="text-right">
                                        <p className="font-mono text-[13px] font-black tabular-nums text-zinc-900 dark:text-white">{model.score}</p>
                                        {model.scoreLabel ? <p className="text-[9.5px] text-zinc-400">{model.scoreLabel}</p> : null}
                                    </div>
                                ) : null}
                            </motion.li>
                        ))}
                    </ol>
                    <a href={board.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-indigo-500">
                        {tx({ TR: "Kaynak", EN: "Source" })}: {board.sourceName} · {timeAgo(board.fetchedAt, locale, now)}<ExternalLink className="h-3 w-3" />
                    </a>
                </div>
            ) : null}
        </section>
    );
}
