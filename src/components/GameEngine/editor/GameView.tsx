"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { GameOverlay } from "@/lib/game-engine/player/overlay";
import { GamePlayer, type PlayerState } from "@/lib/game-engine/player/game-player";
import { SceneRenderer } from "@/lib/game-engine/render/renderer";
import { sceneFrame } from "@/lib/game-engine/render/scene-frame";
import type { CompiledProgram } from "@/lib/game-engine/script/compiler";
import type { LogEntry } from "@/lib/game-engine/runtime/world";
import type { GameProjectDocument, SceneDocument } from "@/lib/game-engine/types";

/** Runs the game (play mode). The project snapshot is fixed for the session. */
export function GameView({ project, program, sceneId, controlRef, onLog, onState, muted }: {
    project: GameProjectDocument;
    program: CompiledProgram;
    sceneId: string;
    controlRef: MutableRefObject<GamePlayer | null>;
    onLog: (entry: LogEntry, updated: boolean) => void;
    onState: (state: PlayerState) => void;
    muted: boolean;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const callbacks = useRef({ onLog, onState });
    useEffect(() => {
        callbacks.current = { onLog, onState };
    }, [onLog, onState]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const player = new GamePlayer(container, {
            project,
            program,
            sceneId,
            isEditor: true,
            touchControls: project.settings.touchControls ? "auto" : false,
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

    return <div ref={containerRef} className="absolute inset-0 bg-black" />;
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
        const overlay = new GameOverlay(stage, { showFps: false, touchControls: false });
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            if (document.hidden) return;
            renderer.render(frameRef.current);
            overlay.update(frameRef.current.entities as Iterable<{ id: string; visible: boolean; components: GameProjectDocument["scenes"][number]["objects"][number]["components"] }>, null, 0, renderer.size.height);
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
