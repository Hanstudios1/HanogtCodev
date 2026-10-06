"use client";

import { Gamepad2, Maximize2, Pause, Play, RotateCcw, Square, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import type { GamePlayer } from "@/lib/game-engine/player/game-player";
import type { GameProjectDocument } from "@/lib/game-engine/types";
import SceneSketch from "./SceneSketch";

/*
 * A template running in the real engine. With `autoPlay` it starts as a
 * silent demo that ignores the keyboard (the page keeps scrolling); "Play"
 * restarts it with input and sound. It pauses whenever it scrolls out of
 * view. The hub mounts at most one of these, so there is one WebGL context.
 */

const C = {
    play: { TR: "Oyna", EN: "Play" },
    takeControl: { TR: "Kontrolü al", EN: "Take control" },
    demo: { TR: "Canlı demo", EN: "Live demo" },
    playing: { TR: "Oynuyorsun", EN: "You're playing" },
    paused: { TR: "Duraklatıldı", EN: "Paused" },
    resume: { TR: "Devam et", EN: "Resume" },
    restart: { TR: "Yeniden başlat", EN: "Restart" },
    stop: { TR: "Demoya dön", EN: "Back to the demo" },
    sound: { TR: "Sesi aç", EN: "Turn sound on" },
    mute: { TR: "Sesi kapat", EN: "Mute" },
    fullscreen: { TR: "Tam ekran", EN: "Full screen" },
    loading: { TR: "Motor yükleniyor…", EN: "Loading the engine…" },
    failed: { TR: "Bu cihazda canlı önizleme açılamadı (WebGL gerekli).", EN: "The live preview couldn't start on this device (WebGL is required)." },
    controls: { TR: "Kontroller", EN: "Controls" },
} satisfies Record<string, Copy>;

type Status = "poster" | "loading" | "demo" | "playing" | "paused" | "error";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
    const store = new Map<string, string>();
    return {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, String(value)),
        removeItem: (key) => void store.delete(key),
    };
}

export default function LivePreview({ project, label, controls, autoPlay = false, touch = false, className = "" }: {
    /** A fresh template project (the preview never saves it). */
    project: GameProjectDocument;
    label: string;
    controls: string;
    autoPlay?: boolean;
    touch?: boolean;
    className?: string;
}) {
    const { tx, locale } = useI18n();
    // The game starts in the site's language when it has it; a language switch doesn't restart it.
    const localeRef = useRef(locale);
    useEffect(() => {
        localeRef.current = locale;
    }, [locale]);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<GamePlayer | null>(null);
    const statusRef = useRef<Status>(autoPlay ? "loading" : "poster");
    /** How the next player starts: a silent demo or a game the visitor controls. */
    const intentRef = useRef<"demo" | "play">(autoPlay ? "demo" : "play");
    const [status, setStatusState] = useState<Status>(autoPlay ? "loading" : "poster");
    const [muted, setMuted] = useState(true);
    const [wanted, setWanted] = useState(autoPlay);
    const setStatus = useCallback((next: Status) => {
        statusRef.current = next;
        setStatusState(next);
    }, []);

    // Creates the player when it's wanted; disposes it when the project changes or the preview unmounts.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage || !wanted) return;
        let disposed = false;
        let instance: GamePlayer | null = null;
        const startAsDemo = intentRef.current === "demo";
        void import("@/lib/game-engine/player/game-player").then(({ GamePlayer }) => {
            if (disposed) return;
            try {
                instance = new GamePlayer(stage, {
                    project: JSON.parse(JSON.stringify(project)) as GameProjectDocument,
                    muted: true,
                    touchControls: touch ? "auto" : false,
                    storage: memoryStorage(),
                    locale: localeRef.current,
                });
            } catch {
                setStatus("error");
                return;
            }
            playerRef.current = instance;
            // start() focuses the canvas; a demo must not take focus from, say, the search box.
            const focused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
            instance.start();
            if (startAsDemo) {
                instance.input.enabled = false;
                if (focused) focused.focus({ preventScroll: true });
                else instance.renderer.canvas.blur();
                setStatus("demo");
            } else {
                instance.setMuted(false);
                setMuted(false);
                setStatus("playing");
            }
        }).catch(() => setStatus("error"));
        return () => {
            disposed = true;
            instance?.dispose();
            if (playerRef.current === instance) playerRef.current = null;
        };
    }, [project, wanted, touch, setStatus]);

    // Pause off screen; a demo resumes by itself, a game waits for "Resume".
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => {
            const player = playerRef.current;
            if (!player) return;
            if (!entry.isIntersecting) {
                player.pause();
                player.input.enabled = false;
                if (statusRef.current === "playing") setStatus("paused");
            } else if (statusRef.current === "demo") {
                player.resume();
            }
        }, { threshold: 0.2 });
        observer.observe(stage);
        return () => observer.disconnect();
    }, [setStatus]);

    const takeControl = () => {
        const player = playerRef.current;
        if (!player) {
            intentRef.current = "play";
            setStatus("loading");
            setWanted(true);
            return;
        }
        player.restart();
        player.setMuted(false);
        setMuted(false);
        setStatus("playing");
    };
    const resume = () => {
        const player = playerRef.current;
        if (!player) return;
        player.resume();
        player.input.enabled = true;
        player.renderer.canvas.focus({ preventScroll: true });
        setStatus("playing");
    };
    const pause = () => {
        const player = playerRef.current;
        if (!player) return;
        player.pause();
        player.input.enabled = false;
        setStatus("paused");
    };
    const backToDemo = () => {
        const player = playerRef.current;
        if (!player) return;
        player.restart();
        player.input.enabled = false;
        player.renderer.canvas.blur();
        player.setMuted(true);
        setMuted(true);
        setStatus("demo");
    };
    const restart = () => {
        const player = playerRef.current;
        if (!player) return;
        player.restart();
        setStatus("playing");
    };
    const toggleMute = () => {
        const player = playerRef.current;
        const next = !muted;
        player?.setMuted(next);
        setMuted(next);
    };

    const live = status === "demo" || status === "playing" || status === "paused";
    const controlButton = "grid h-8 w-8 place-items-center rounded-lg text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white";

    return (
        <figure className={`relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-xl shadow-zinc-900/10 dark:border-white/10 dark:shadow-black/40 ${className}`} aria-label={label}>
            <div className="relative aspect-video w-full">
                {!live ? <SceneSketch project={project} className="absolute inset-0 h-full w-full" /> : null}
                <div ref={stageRef} className={`absolute inset-0 ${live ? "" : "pointer-events-none opacity-0"}`} />

                {status === "loading" ? (
                    <div className="absolute inset-0 grid place-items-center bg-zinc-950/40">
                        <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-semibold text-white">
                            <Gamepad2 className="h-3.5 w-3.5 animate-pulse" aria-hidden />{tx(C.loading)}
                        </span>
                    </div>
                ) : null}
                {status === "poster" || status === "paused" ? (
                    <div className="absolute inset-0 grid place-items-center bg-zinc-950/35">
                        <button type="button" onClick={status === "paused" ? resume : takeControl} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-bold text-zinc-900 shadow-lg transition hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                            <Play className="h-4 w-4 fill-current" aria-hidden />{status === "paused" ? tx(C.resume) : tx(C.play)}
                        </button>
                    </div>
                ) : null}
                {status === "error" ? (
                    <p role="status" className="absolute inset-x-3 bottom-3 rounded-xl bg-black/70 px-3 py-2 text-[12.5px] text-white">{tx(C.failed)}</p>
                ) : null}

                {status === "demo" ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" /></span>
                            {tx(C.demo)}
                        </span>
                        <button type="button" onClick={takeControl} className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-bold text-zinc-900 shadow-lg transition hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                            <Gamepad2 className="h-4 w-4" aria-hidden />{tx(C.takeControl)}
                        </button>
                    </div>
                ) : null}
            </div>

            {status === "playing" || status === "paused" ? (
                <figcaption className="flex flex-wrap items-center gap-1 border-t border-white/10 bg-zinc-900 px-2 py-1.5 text-white">
                    <span className="me-auto truncate px-1.5 text-[12px] text-white/70"><b className="font-semibold text-white">{tx(C.controls)}:</b> {controls}</span>
                    {status === "playing"
                        ? <button type="button" onClick={pause} className={controlButton} aria-label={tx(C.paused)} title={tx(C.paused)}><Pause className="h-4 w-4" aria-hidden /></button>
                        : <button type="button" onClick={resume} className={controlButton} aria-label={tx(C.resume)} title={tx(C.resume)}><Play className="h-4 w-4" aria-hidden /></button>}
                    <button type="button" onClick={restart} className={controlButton} aria-label={tx(C.restart)} title={tx(C.restart)}><RotateCcw className="h-4 w-4" aria-hidden /></button>
                    <button type="button" onClick={toggleMute} className={controlButton} aria-label={muted ? tx(C.sound) : tx(C.mute)} title={muted ? tx(C.sound) : tx(C.mute)}>{muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}</button>
                    <button type="button" onClick={() => playerRef.current?.toggleFullscreen()} className={controlButton} aria-label={tx(C.fullscreen)} title={tx(C.fullscreen)}><Maximize2 className="h-4 w-4" aria-hidden /></button>
                    {autoPlay ? <button type="button" onClick={backToDemo} className={controlButton} aria-label={tx(C.stop)} title={tx(C.stop)}><Square className="h-3.5 w-3.5" aria-hidden /></button> : null}
                </figcaption>
            ) : null}
        </figure>
    );
}
