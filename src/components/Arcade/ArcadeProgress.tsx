"use client";

/**
 * Leaderboards, achievements and their toasts on an Arcade game's page (V5).
 */
import { CheckCircle2, Crown, EyeOff, Lock, LoaderCircle, Medal, RefreshCw, ShieldAlert, Trash2, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatArcadeScore } from "@/lib/game-engine/arcade";
import type { ArcadeAchievement, ArcadeLeaderboard } from "@/lib/game-engine/types";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    leaderboard: { TR: "Skor tablosu", EN: "Leaderboard" },
    unverified: { TR: "Doğrulanmamış", EN: "Unverified" },
    unverifiedHint: { TR: "Skorlar oyunun içinden, oyuncunun tarayıcısından gelir. Sunucu en kısa oynama süresini ve yapımcının sınırlarını denetler ama hileyi tamamen engelleyemez.", EN: "Scores come from inside the game, in the player's browser. The server checks the minimum play time and the author's bounds but can't rule out cheating." },
    empty: { TR: "Henüz skor yok. İlk sen ol!", EN: "No scores yet. Be the first!" },
    you: { TR: "sen", EN: "you" },
    yourBest: { TR: "Senin en iyin", EN: "Your best" },
    outsideTop: { TR: "ilk {count} dışında", EN: "outside the top {count}" },
    onDevice: { TR: "Bu cihazdaki en iyin", EN: "Your best on this device" },
    signIn: { TR: "Skorunu tabloya eklemek için giriş yap", EN: "Sign in to put your score on the board" },
    share: { TR: "Skorlarımı tabloda paylaş", EN: "Share my scores on the board" },
    shareOff: { TR: "Paylaşım kapalı: skorların yalnızca bu oyun sırasında tutulur.", EN: "Sharing is off: your scores are only kept while you play." },
    removeMine: { TR: "Skorumu kaldır", EN: "Remove my score" },
    removeEntry: { TR: "Kaydı sil", EN: "Remove entry" },
    removeEntryConfirm: { TR: "{name} adlı oyuncunun kaydı silinsin mi?", EN: "Remove {name}'s entry?" },
    clearBoard: { TR: "Tabloyu temizle", EN: "Clear board" },
    clearBoardConfirm: { TR: "\"{board}\" tablosundaki bütün skorlar silinsin mi? Bu geri alınamaz.", EN: "Delete every score on \"{board}\"? This can't be undone." },
    refresh: { TR: "Yenile", EN: "Refresh" },
    loadFailed: { TR: "Skor tablosu yüklenemedi.", EN: "The leaderboard couldn't be loaded." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    removeFailed: { TR: "Kayıt silinemedi.", EN: "The entry couldn't be removed." },
    achievements: { TR: "Başarımlar", EN: "Achievements" },
    hidden: { TR: "Gizli başarım", EN: "Hidden achievement" },
    hiddenHint: { TR: "Açınca ne olduğu görünür.", EN: "Unlock it to see what it is." },
    achievementsOnDevice: { TR: "Bu cihazda saklanıyor. Giriş yaparsan hesabına kaydedilir.", EN: "Kept on this device. Sign in to keep them on your account." },
    unlocked: { TR: "Başarım açıldı", EN: "Achievement unlocked" },
    newBest: { TR: "Yeni rekor", EN: "New best" },
    savedOnBoard: { TR: "skor tablosuna kaydedildi", EN: "saved on the leaderboard" },
    dismiss: { TR: "Kapat", EN: "Dismiss" },
} satisfies Record<string, Copy>;

export type LeaderboardEntryView = { rank: number; name: string; score: number; achievedAt: string | null; you: boolean; entryId?: string };
type LeaderboardResponse = {
    board: Pick<ArcadeLeaderboard, "id" | "name" | "order" | "format">;
    entries: LeaderboardEntryView[];
    you: { score: number; achievedAt: string | null; rank: number | null } | null;
    canModerate: boolean;
    error?: string;
};

const RANK_COLORS = ["text-amber-500", "text-zinc-400", "text-orange-500"];

export function LeaderboardCard({ gameId, boards, boardId, onBoardChange, signedIn, share, onShareChange, localBest, refreshKey, onOwnRemoved }: {
    gameId: string;
    boards: ArcadeLeaderboard[];
    boardId: string;
    onBoardChange: (id: string) => void;
    signedIn: boolean;
    share: boolean;
    onShareChange: (share: boolean) => void;
    /** The player's best this session or on this device (guests, sharing off). */
    localBest: Record<string, number>;
    /** Changes when a new best was saved: the list reloads. */
    refreshKey: number;
    /** The player removed their own entry from this board. */
    onOwnRemoved: (boardId: string) => void;
}) {
    const { tx, language, locale } = useI18n();
    const [reload, setReload] = useState(0);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const board = boards.find((item) => item.id === boardId) ?? boards[0];
    // What was loaded for which request: a new board, a saved best or a refresh asks again.
    const requestKey = board ? `${board.id}|${refreshKey}|${reload}` : "";
    const [result, setResult] = useState<{ key: string; data: LeaderboardResponse | null; error: string | null } | null>(null);
    const loading = result?.key !== requestKey;
    const data = result?.data ?? null;
    const failed = result?.key === requestKey ? result.error : null;
    const format = (score: number) => formatArcadeScore(score, board?.format ?? "number", locale);
    const serverText = (message: string | undefined | null, fallback: Copy) => (language === "TR" && message ? message : tx(fallback));

    useEffect(() => {
        if (!requestKey) return;
        const boardKey = requestKey.split("|")[0];
        const controller = new AbortController();
        fetch(`/api/arcade/${encodeURIComponent(gameId)}/scores?board=${encodeURIComponent(boardKey)}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" })
            .then(async (response) => {
                const payload = await response.json() as LeaderboardResponse;
                if (!response.ok) throw new Error(payload.error || "");
                setResult({ key: requestKey, data: payload, error: null });
            })
            .catch((reason: unknown) => {
                if (!controller.signal.aborted) setResult((current) => ({ key: requestKey, data: current?.data ?? null, error: reason instanceof Error ? reason.message : "" }));
            });
        return () => controller.abort();
    }, [gameId, requestKey]);

    const remove = async (body: Record<string, unknown>, confirmText: string | null) => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(true);
        try {
            const response = await fetch(`/api/arcade/${encodeURIComponent(gameId)}/scores`, {
                method: "DELETE",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ board: board?.id, ...body }),
            });
            const payload = await response.json().catch(() => ({})) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "");
            setActionError(null);
            if (body.mine === true && board) onOwnRemoved(board.id);
            setReload((value) => value + 1);
        } catch (reason) {
            setActionError(serverText(reason instanceof Error ? reason.message : null, C.removeFailed));
        } finally {
            setBusy(false);
        }
    };

    if (!board) return null;
    const listed = data && data.board.id === board.id ? data : null;
    const mine = listed?.you ?? null;
    const deviceBest = localBest[board.id];

    return (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/70" data-arcade-leaderboard aria-labelledby="arcade-leaderboard-title">
            <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
                <h2 id="arcade-leaderboard-title" className="text-[14px] font-bold text-zinc-900 dark:text-white">{tx(C.leaderboard)}</h2>
                <span title={tx(C.unverifiedHint)} className="inline-flex cursor-help items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300" data-unverified>
                    <ShieldAlert className="h-3 w-3" aria-hidden />{tx(C.unverified)}
                </span>
                <button type="button" onClick={() => setReload((value) => value + 1)} disabled={loading} aria-label={tx(C.refresh)} title={tx(C.refresh)} className="ms-auto grid h-7 w-7 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white">
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "motion-safe:animate-spin" : ""}`} />
                </button>
            </div>
            {boards.length > 1 ? (
                <div role="tablist" aria-label={tx(C.leaderboard)} className="mt-3 flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1 dark:bg-white/5">
                    {boards.map((item) => (
                        <button key={item.id} type="button" role="tab" aria-selected={item.id === board.id} onClick={() => onBoardChange(item.id)} className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${item.id === board.id ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>{item.name}</button>
                    ))}
                </div>
            ) : <p className="mt-1 text-[12px] text-zinc-500">{board.name}</p>}

            <div className="mt-3 min-h-24">
                {loading && !listed ? (
                    <div className="space-y-2" aria-hidden>{[0, 1, 2].map((index) => <div key={index} className="h-8 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />)}</div>
                ) : failed !== null && !listed ? (
                    <div className="py-4 text-center text-[12.5px] text-zinc-500">
                        <p>{serverText(failed, C.loadFailed)}</p>
                        <button type="button" onClick={() => setReload((value) => value + 1)} className="mt-2 font-semibold text-indigo-600 underline underline-offset-2 dark:text-indigo-300">{tx(C.retry)}</button>
                    </div>
                ) : listed && listed.entries.length ? (
                    <ol className="space-y-1" data-leaderboard-entries>
                        {listed.entries.map((entry, index) => (
                            <li key={`${entry.rank}-${entry.name}-${index}`} className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] motion-safe:animate-rise ${entry.you ? "bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/30" : "odd:bg-zinc-50 dark:odd:bg-white/[0.03]"}`} style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}>
                                <span className={`w-6 shrink-0 text-center font-black tabular-nums ${RANK_COLORS[entry.rank - 1] ?? "text-zinc-400"}`}>{entry.rank === 1 ? <Crown className="mx-auto h-4 w-4" aria-label="1" /> : entry.rank}</span>
                                <span className="min-w-0 flex-1 truncate font-semibold text-zinc-800 dark:text-zinc-100" dir="auto">{entry.name}{entry.you ? <span className="ms-1.5 rounded bg-indigo-500/15 px-1 py-0.5 text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-300">{tx(C.you)}</span> : null}</span>
                                <span className="shrink-0 font-mono text-[12.5px] font-bold tabular-nums text-zinc-900 dark:text-white">{format(entry.score)}</span>
                                {listed.canModerate && entry.entryId ? (
                                    <button type="button" disabled={busy} onClick={() => void remove({ entryId: entry.entryId }, tx(C.removeEntryConfirm, { name: entry.name }))} aria-label={tx(C.removeEntry)} title={tx(C.removeEntry)} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-400 opacity-60 transition hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100 disabled:opacity-30">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                ) : null}
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="py-6 text-center text-[12.5px] text-zinc-500">{tx(C.empty)}</p>
                )}
            </div>

            <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 text-[12px] dark:border-white/5">
                {actionError ? <p className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-rose-700 dark:text-rose-300" role="alert">{actionError}</p> : null}
                {mine && mine.rank === null ? (
                    <p className="flex items-center justify-between gap-2 text-zinc-600 dark:text-zinc-300"><span>{tx(C.yourBest)} <span className="text-zinc-400">({tx(C.outsideTop, { count: listed?.entries.length ?? 50 })})</span></span><span className="font-mono font-bold">{format(mine.score)}</span></p>
                ) : null}
                {(!signedIn || !share) && deviceBest !== undefined ? (
                    <p className="flex items-center justify-between gap-2 text-zinc-600 dark:text-zinc-300"><span>{tx(C.onDevice)}</span><span className="font-mono font-bold">{format(deviceBest)}</span></p>
                ) : null}
                {signedIn ? (
                    <>
                        <label className="flex cursor-pointer items-center gap-2 text-zinc-600 dark:text-zinc-300">
                            <input type="checkbox" checked={share} onChange={(event) => onShareChange(event.target.checked)} className="h-3.5 w-3.5 accent-indigo-500" />
                            {tx(C.share)}
                        </label>
                        {!share ? <p className="text-[11.5px] text-zinc-500">{tx(C.shareOff)}</p> : null}
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {mine ? <button type="button" disabled={busy} onClick={() => void remove({ mine: true }, null)} className="font-semibold text-zinc-500 underline-offset-2 hover:text-rose-500 hover:underline disabled:opacity-40">{tx(C.removeMine)}</button> : null}
                            {listed?.canModerate && listed.entries.length ? (
                                <button type="button" disabled={busy} onClick={() => void remove({ all: true }, tx(C.clearBoardConfirm, { board: board.name }))} className="inline-flex items-center gap-1 font-semibold text-rose-600 underline-offset-2 hover:underline disabled:opacity-40 dark:text-rose-400">
                                    {busy ? <LoaderCircle className="h-3 w-3 motion-safe:animate-spin" /> : <Trash2 className="h-3 w-3" />}{tx(C.clearBoard)}
                                </button>
                            ) : null}
                        </div>
                    </>
                ) : (
                    <Link href={`/login?callbackUrl=${encodeURIComponent(`/arcade/${gameId}`)}`} className="inline-flex font-semibold text-indigo-600 underline underline-offset-2 dark:text-indigo-300">{tx(C.signIn)}</Link>
                )}
            </div>
        </section>
    );
}

export function AchievementsCard({ achievements, unlocked, signedIn }: { achievements: ArcadeAchievement[]; unlocked: string[]; signedIn: boolean }) {
    const { tx } = useI18n();
    if (!achievements.length) return null;
    const have = new Set(unlocked);
    const count = achievements.filter((item) => have.has(item.id)).length;
    const percent = Math.round((count / achievements.length) * 100);
    return (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/70" data-arcade-achievements aria-labelledby="arcade-achievements-title">
            <div className="flex items-center gap-2">
                <Medal className="h-4 w-4 text-fuchsia-500" aria-hidden />
                <h2 id="arcade-achievements-title" className="text-[14px] font-bold text-zinc-900 dark:text-white">{tx(C.achievements)}</h2>
                <span className="ms-auto text-[12px] font-bold tabular-nums text-zinc-500" data-achievement-count>{count}/{achievements.length}</span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={achievements.length} aria-valuenow={count} aria-label={tx(C.achievements)}>
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400 transition-[width] duration-700 ease-out" style={{ width: `${percent}%` }} />
            </div>
            <ul className="mt-3 space-y-1.5">
                {achievements.map((achievement) => {
                    const open = have.has(achievement.id);
                    const secret = achievement.hidden && !open;
                    return (
                        <li key={achievement.id} className={`flex items-start gap-2.5 rounded-xl px-2 py-2 transition ${open ? "bg-fuchsia-500/[0.07]" : ""}`} data-achievement={achievement.id} data-unlocked={open || undefined}>
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${open ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-400 dark:bg-white/5"}`}>
                                {open ? <Medal className="h-4 w-4" aria-hidden /> : secret ? <EyeOff className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
                            </span>
                            <span className="min-w-0">
                                <span className={`block truncate text-[13px] font-semibold ${open ? "text-zinc-900 dark:text-white" : "text-zinc-500"}`}>{secret ? tx(C.hidden) : achievement.name}</span>
                                <span className="block text-[11.5px] leading-snug text-zinc-500">{secret ? tx(C.hiddenHint) : achievement.description}</span>
                            </span>
                            {open ? <CheckCircle2 className="ms-auto mt-1 h-4 w-4 shrink-0 text-emerald-500" aria-hidden /> : null}
                        </li>
                    );
                })}
            </ul>
            {!signedIn ? <p className="mt-2 text-[11.5px] text-zinc-500">{tx(C.achievementsOnDevice)}</p> : null}
        </section>
    );
}

export type ArcadeToast = { id: number; kind: "achievement" | "best" | "error"; title: string; detail: string };

/** Toasts over the game: achievements unlocked, new bests, failures. */
export function ArcadeToastStack({ toasts, onDismiss }: { toasts: ArcadeToast[]; onDismiss: (id: number) => void }) {
    const { tx } = useI18n();
    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-2 px-3" aria-live="polite" data-arcade-toasts>
            {toasts.map((toast) => (
                <div key={toast.id} role="status" className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-white/15 bg-zinc-950/95 px-3.5 py-2.5 text-white shadow-xl motion-safe:animate-rise" data-arcade-toast={toast.kind}>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toast.kind === "achievement" ? "bg-amber-500" : toast.kind === "best" ? "bg-indigo-500" : "bg-rose-500"}`}>
                        {toast.kind === "achievement" ? <Medal className="h-4.5 w-4.5" aria-hidden /> : toast.kind === "best" ? <Trophy className="h-4.5 w-4.5" aria-hidden /> : <ShieldAlert className="h-4.5 w-4.5" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                        <span className="block text-[11px] font-bold uppercase tracking-wide text-white/60">{toast.title}</span>
                        <span className="block truncate text-[13.5px] font-semibold">{toast.detail}</span>
                    </span>
                    <button type="button" onClick={() => onDismiss(toast.id)} aria-label={tx(C.dismiss)} className="ms-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/50 transition hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                </div>
            ))}
        </div>
    );
}

/** Toast texts (the page builds the toasts from the host's events). */
export const ARCADE_TOAST_COPY = { unlocked: C.unlocked, newBest: C.newBest, savedOnBoard: C.savedOnBoard };
