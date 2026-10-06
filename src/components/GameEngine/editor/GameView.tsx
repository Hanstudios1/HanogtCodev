"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useI18n } from "@/lib/i18n";
import { GameOverlay } from "@/lib/game-engine/player/overlay";
import { GamePlayer, type PlayerState, type PlayerStats } from "@/lib/game-engine/player/game-player";
import { SceneRenderer } from "@/lib/game-engine/render/renderer";
import { sceneFrame } from "@/lib/game-engine/render/scene-frame";
import type { CompiledProgram } from "@/lib/game-engine/script/compiler";
import type { LogEntry } from "@/lib/game-engine/runtime/world";
import type { GameProjectDocument, SceneDocument } from "@/lib/game-engine/types";
import { useEditor } from "./context";

/** FPS, frame time and object counts of the running game (polled twice a second). */
function StatsPanel({ controlRef }: { controlRef: MutableRefObject<GamePlayer | null> }) {
    const { t } = useEditor();
    const [stats, setStats] = useState<PlayerStats | null>(null);
    useEffect(() => {
        const timer = window.setInterval(() => setStats(controlRef.current?.getStats() ?? null), 500);
        return () => window.clearInterval(timer);
    }, [controlRef]);
    if (!stats) return null;
    const fpsColor = stats.fps >= 50 ? "text-lime-300" : stats.fps >= 30 ? "text-amber-300" : "text-red-300";
    const rows: Array<[string, string]> = [
        [t("statsFrame"), `${stats.frameMs} ms`],
        [t("statsObjects"), String(stats.entities)],
        [t("scripts"), String(stats.behaviours)],
        [t("statsBodies"), String(stats.bodies)],
        [t("statsTweens"), `${stats.tweens} / ${stats.timers}`],
        [t("statsParticles"), String(stats.particles)],
        [t("statsDrawCalls"), String(stats.drawCalls)],
        [t("statsTriangles"), stats.triangles.toLocaleString()],
    ];
    return (
        <div className="pointer-events-none absolute left-2 top-2 z-10 min-w-[170px] rounded-lg border border-white/10 bg-black/70 px-2.5 py-2 font-mono text-[10.5px] text-zinc-300 shadow-xl backdrop-blur" role="status" aria-live="off">
            <p className={`text-[15px] font-bold ${fpsColor}`}>{stats.fps} FPS</p>
            <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                {rows.map(([label, value]) => (
                    <div key={label} className="contents">
                        <dt className="text-zinc-500">{label}</dt>
                        <dd className="text-right text-zinc-200">{value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

/** Runs the game (play mode). The project snapshot is fixed for the session. */
export function GameView({ project, program, sceneId, controlRef, onLog, onState, muted, showStats }: {
    project: GameProjectDocument;
    program: CompiledProgram;
    sceneId: string;
    controlRef: MutableRefObject<GamePlayer | null>;
    onLog: (entry: LogEntry, updated: boolean) => void;
    onState: (state: PlayerState) => void;
    muted: boolean;
    showStats: boolean;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const callbacks = useRef({ onLog, onState });
    // Games with the site's language start in it; changing the site language doesn't restart play mode.
    const { locale } = useI18n();
    const localeRef = useRef(locale);
    useEffect(() => {
        callbacks.current = { onLog, onState };
        localeRef.current = locale;
    }, [onLog, onState, locale]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const player = new GamePlayer(container, {
            project,
            program,
            sceneId,
            isEditor: true,
            touchControls: project.settings.touchControls ? "auto" : false,
            locale: localeRef.current,
            onLog: (entry, updated) => callbacks.current.onLog(entry, updated),
            onStateChange: (state) => callbacks.current.onState(state),
        });
        controlRef.current = player;
        player.start();
        return () => {
            player.dispose();
            if (controlRef.current === player) controlRef.current = null;
        };
    }, [project, program, sceneId, controlRef]);

    useEffect(() => {
        controlRef.current?.setMuted(muted);
    }, [muted, controlRef]);

    return (
        <div className="absolute inset-0 bg-black">
            <div ref={containerRef} className="absolute inset-0" />
            {showStats ? <StatsPanel controlRef={controlRef} /> : null}
        </div>
    );
}

/** Camera preview of the edited scene (Game tab while not playing). */
export function GamePreview({ project, scene }: { project: GameProjectDocument; scene: SceneDocument }) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const frame = useMemo(() => sceneFrame(scene, project.dimension), [scene, project.dimension]);
    const frameRef = useRef(frame);
    const { shadows, antialias, pixelArt } = project.settings;
    const textures = project.textures;

    useEffect(() => {
        frameRef.current = frame;
    }, [frame]);

    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const renderer = new SceneRenderer(stage, { mode: "game", shadows, antialias, pixelArt });
        renderer.setTextures(textures);
        const overlay = new GameOverlay(stage, { showFps: false, touchControls: false, textures });
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            if (document.hidden) return;
            renderer.render(frameRef.current);
            overlay.update(frameRef.current.entities, null, 0, renderer.size);
            overlay.setNotice(renderer.hasCamera ? null : "Sahnede aktif kamera yok.");
        };
        raf = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(raf);
            overlay.dispose();
            renderer.dispose();
        };
    }, [shadows, antialias, pixelArt, textures]);

    return <div ref={stageRef} className="absolute inset-0 bg-black" />;
}
