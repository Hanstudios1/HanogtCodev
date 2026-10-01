"use client";

import { ArrowLeft, Copy, ExternalLink, Heart, Keyboard, LoaderCircle, Maximize2, Pencil, Play, RotateCcw, Share2, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { useI18n, type Copy as CopyText } from "@/lib/i18n";
import { createEngineId } from "@/lib/game-engine/ids";
import type { GamePlayer } from "@/lib/game-engine/player/game-player";
import type { GameProjectDocument } from "@/lib/game-engine/types";
import { createCloudProject, saveLocalProject } from "@/components/GameEngine/editor/persistence";
import { compactNumber, type ArcadeGameSummary } from "./ArcadeGallery";

type GameInfo = ArcadeGameSummary & { isOwner: boolean; liked: boolean };

const C = {
    loadFailed: { TR: "Oyun yüklenemedi.", EN: "The game couldn't be loaded." },
    likeFailed: { TR: "Beğeni kaydedilemedi.", EN: "Your like couldn't be saved." },
    remixFailed: { TR: "Remix oluşturulamadı.", EN: "The remix couldn't be created." },
    linkCopied: { TR: "Bağlantı kopyalandı.", EN: "Link copied." },
} satisfies Record<string, CopyText>;

export default function ArcadePlayerView({ gameId }: { gameId: string }) {
    const router = useRouter();
    const { data: session } = useSession();
    const { tx, locale, language } = useI18n();
    // Server messages are written in Turkish; other languages get the localized fallback.
    const serverText = (message: string | undefined | null, fallback: CopyText) => (language === "TR" && message ? message : tx(fallback));
    const stageRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<GamePlayer | null>(null);
    const [game, setGame] = useState<GameInfo | null>(null);
    const [project, setProject] = useState<GameProjectDocument | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [started, setStarted] = useState(false);
    const [muted, setMuted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/arcade/${encodeURIComponent(gameId)}`, { signal: controller.signal, cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json() as { game?: GameInfo; project?: GameProjectDocument; error?: string };
                if (!response.ok || !payload.game || !payload.project) throw new Error(payload.error || "");
                setGame(payload.game);
                setProject(payload.project);
            })
            .catch((reason) => {
                // An empty message is replaced with the localized fallback while rendering.
                if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "");
            });
        return () => controller.abort();
    }, [gameId]);

    useEffect(() => {
        const stage = stageRef.current;
        if (!stage || !project) return;
        let disposed = false;
        let instance: GamePlayer | null = null;
        void import("@/lib/game-engine/player/game-player").then(({ GamePlayer }) => {
            if (disposed) return;
            instance = new GamePlayer(stage, { project, touchControls: project.settings.touchControls ? "auto" : false });
            playerRef.current = instance;
        });
        return () => {
            disposed = true;
            instance?.dispose();
            playerRef.current = null;
        };
    }, [project]);

    const start = () => {
        const player = playerRef.current;
        if (!player) return;
        player.start();
        setStarted(true);
        void fetch(`/api/arcade/${encodeURIComponent(gameId)}/play`, { method: "POST" })
            .then((response) => response.json())
            .then((payload: { plays?: number }) => {
                if (typeof payload.plays === "number") setGame((current) => (current ? { ...current, plays: payload.plays as number } : current));
            })
            .catch(() => undefined);
    };

    const toggleLike = async () => {
        if (!session?.user) {
            router.push(`/login?callbackUrl=${encodeURIComponent(`/arcade/${gameId}`)}`);
            return;
        }
        try {
            const response = await fetch(`/api/arcade/${encodeURIComponent(gameId)}/like`, { method: "POST" });
            const payload = await response.json() as { liked?: boolean; likes?: number; error?: string };
            if (!response.ok) throw new Error(serverText(payload.error, C.likeFailed));
            setGame((current) => (current ? { ...current, liked: Boolean(payload.liked), likes: payload.likes ?? current.likes } : current));
        } catch (reason) {
            setNotice(reason instanceof Error && reason.message ? reason.message : tx(C.likeFailed));
        }
    };

    const remix = async () => {
        if (!project) return;
        setBusy(true);
        try {
            const copy: GameProjectDocument = { ...project, id: createEngineId("game"), name: `${project.name} (Remix)` };
            if (session?.user) {
                const created = await createCloudProject(copy);
                router.push(`/game-engine?project=${encodeURIComponent(created.id)}&source=cloud`);
            } else {
                await saveLocalProject(copy);
                router.push(`/game-engine?project=${encodeURIComponent(copy.id)}&source=local`);
            }
        } catch (reason) {
            setNotice(serverText(reason instanceof Error ? reason.message : null, C.remixFailed));
            setBusy(false);
        }
    };

    const share = async () => {
        const url = window.location.href;
        try {
            if (navigator.share) await navigator.share({ title: game?.title, url });
            else {
                await navigator.clipboard.writeText(url);
                setNotice(tx(C.linkCopied));
            }
        } catch {
            // user cancelled
        }
    };

    if (error !== null) {
        return (
            <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
                <Header />
                <main id="main-content" className="mx-auto grid max-w-lg place-items-center px-4 pt-40 text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-zinc-200 text-3xl dark:bg-white/10">🕹️</div>
                    <h1 className="mt-4 text-xl font-bold text-zinc-900 dark:text-white">{tx({ TR: "Oyun açılamadı", EN: "Couldn't open the game" })}</h1>
                    <p className="mt-2 text-sm text-zinc-500">{serverText(error, C.loadFailed)}</p>
                    <Link href="/arcade" className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{tx({ TR: "Arcade'e dön", EN: "Back to the Arcade" })}</Link>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
            <Header />
            <main id="main-content" className="mx-auto max-w-7xl px-4 pb-16 pt-24">
                <Link href="/arcade" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />Arcade</Link>
                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                    <div>
                        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-2xl shadow-indigo-500/10 dark:border-white/10">
                            <div ref={stageRef} className="aspect-video w-full" />
                            {!started ? (
                                <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-black/30 via-black/50 to-black/80">
                                    {project ? (
                                        <button type="button" onClick={start} className="group flex flex-col items-center gap-3 text-white">
                                            <span className="grid h-20 w-20 place-items-center rounded-full bg-white text-zinc-900 shadow-2xl shadow-white/20 transition group-hover:scale-110 animate-pulse-ring"><Play className="h-8 w-8 translate-x-0.5 fill-current" /></span>
                                            <span className="text-lg font-black">{game?.title ?? tx({ TR: "Oyna", EN: "Play" })}</span>
                                            <span className="text-[12px] text-white/70">{tx({ TR: "Tıkla ve oyna · ses açık", EN: "Click to play · sound on" })}</span>
                                        </button>
                                    ) : <LoaderCircle className="h-8 w-8 animate-spin text-white/80" />}
                                </div>
                            ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button type="button" disabled={!started} onClick={() => playerRef.current?.restart()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-white/10"><RotateCcw className="h-4 w-4" />{tx({ TR: "Yeniden başlat", EN: "Restart" })}</button>
                            <button type="button" onClick={() => { setMuted(!muted); playerRef.current?.setMuted(!muted); }} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-white/10">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}{muted ? tx({ TR: "Sesi aç", EN: "Unmute" }) : tx({ TR: "Sessiz", EN: "Mute" })}</button>
                            <button type="button" onClick={() => playerRef.current?.toggleFullscreen()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-white/10"><Maximize2 className="h-4 w-4" />{tx({ TR: "Tam ekran", EN: "Fullscreen" })}</button>
                            <span className="ms-auto inline-flex items-center gap-1.5 text-[12px] text-zinc-500"><Keyboard className="h-4 w-4" />{tx({ TR: "Klavye · fare · dokunmatik", EN: "Keyboard · mouse · touch" })}</span>
                        </div>
                    </div>
                    <aside className="space-y-4">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/70">
                            {game ? (
                                <>
                                    <h1 className="text-2xl font-black leading-tight text-zinc-900 dark:text-white">{game.title}</h1>
                                    <div className="mt-2 flex items-center gap-2 text-[13px] text-zinc-500">
                                        {game.authorImage ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={game.authorImage} alt="" className="h-6 w-6 rounded-full object-cover" />
                                        ) : <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[11px] font-bold text-white">{game.authorName.charAt(0).toUpperCase()}</span>}
                                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{game.authorName}</span>
                                        {game.updatedAt ? <span>· {new Date(game.updatedAt).toLocaleDateString(locale)}</span> : null}
                                    </div>
                                    {game.description ? <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{game.description}</p> : null}
                                    <div className="mt-4 flex flex-wrap gap-1.5">
                                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{game.dimension}</span>
                                        {game.languages.map((language) => <span key={language} className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">{language}</span>)}
                                        {game.engineVersion ? <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-bold text-fuchsia-600 dark:text-fuchsia-300">Hanogt Engine V{game.engineVersion}</span> : null}
                                    </div>
                                    <div className="mt-5 grid grid-cols-2 gap-2">
                                        <div className="rounded-xl bg-zinc-50 p-3 text-center dark:bg-white/[0.04]"><p className="text-xl font-black text-zinc-900 dark:text-white">{compactNumber(game.plays, locale)}</p><p className="text-[11px] text-zinc-500">{tx({ TR: "oynanma", EN: "plays" })}</p></div>
                                        <button type="button" onClick={() => void toggleLike()} aria-pressed={game.liked} className={`rounded-xl p-3 text-center transition ${game.liked ? "bg-rose-500/15 text-rose-500" : "bg-zinc-50 hover:bg-rose-500/10 dark:bg-white/[0.04]"}`}>
                                            <p className="flex items-center justify-center gap-1.5 text-xl font-black"><Heart className={`h-5 w-5 ${game.liked ? "fill-current" : ""}`} />{compactNumber(game.likes, locale)}</p>
                                            <p className="text-[11px] text-zinc-500">{game.liked ? tx({ TR: "beğendin", EN: "liked" }) : tx({ TR: "beğen", EN: "like" })}</p>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-2"><div className="h-7 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-white/10" /><div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-white/5" /></div>
                            )}
                        </div>
                        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/70">
                            {game?.isOwner ? (
                                <Link href={`/game-engine?project=${encodeURIComponent(gameId)}&source=cloud`} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-[13px] font-bold text-white dark:bg-white dark:text-zinc-900"><Pencil className="h-4 w-4" />{tx({ TR: "Motorda düzenle", EN: "Edit in the engine" })}</Link>
                            ) : null}
                            <button type="button" disabled={!project || busy} onClick={() => void remix()} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-[13px] font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110 disabled:opacity-50">
                                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}{tx({ TR: "Remiksle (kopyasını düzenle)", EN: "Remix (edit a copy)" })}
                            </button>
                            <button type="button" onClick={() => void share()} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10"><Share2 className="h-4 w-4" />{tx({ TR: "Paylaş", EN: "Share" })}</button>
                            <Link href="/game-engine/docs" className="flex h-9 w-full items-center justify-center gap-1.5 text-[12px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white">{tx({ TR: "Bu oyun nasıl yapıldı? Belgeler", EN: "How was this made? Docs" })}<ExternalLink className="h-3.5 w-3.5" /></Link>
                            {notice ? <p className="rounded-lg bg-zinc-100 px-3 py-2 text-[12px] text-zinc-600 dark:bg-white/5 dark:text-zinc-300" role="status">{notice}</p> : null}
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}
