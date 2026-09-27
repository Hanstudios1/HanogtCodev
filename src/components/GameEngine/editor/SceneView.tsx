"use client";

import { Crosshair, Eye, Grid3x3, LocateFixed, SquareDashed } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createSpriteRenderer, createTransform } from "@/lib/game-engine/components";
import { createEngineId } from "@/lib/game-engine/ids";
import { SceneRenderer, type GizmoMode } from "@/lib/game-engine/render/renderer";
import { sceneFrame } from "@/lib/game-engine/render/scene-frame";
import { uniqueName } from "@/lib/game-engine/scene";
import type { Vector3 } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { activeScene, findEntity, instantiatePrefab, setWorldTransform, touch } from "./operations";
import { useEditorState } from "./store";
import { IconButton, cx } from "./ui";

export interface SceneViewApi {
    focus: (id: string) => void;
    resetView: () => void;
    center: () => Vector3;
    snapshot: () => string;
}

export default function SceneView({ apiRef, gizmoMode, gizmoSpace, hidden }: {
    apiRef: MutableRefObject<SceneViewApi | null>;
    gizmoMode: GizmoMode;
    gizmoSpace: "world" | "local";
    hidden?: boolean;
}) {
    const { store, t, playing } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const selection = useEditorState(store, (state) => state.selection);
    const scene = activeScene(project);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<SceneRenderer | null>(null);
    const frame = useMemo(() => sceneFrame(scene, project.dimension), [scene, project.dimension]);
    const frameRef = useRef(frame);
    const [grid, setGrid] = useState(true);
    const [colliders, setColliders] = useState(false);
    const [icons, setIcons] = useState(true);
    const [dragOver, setDragOver] = useState(false);
    const is2D = project.dimension === "2d";
    const { shadows, antialias, pixelArt } = project.settings;

    const playingRef = useRef(playing);
    const hiddenRef = useRef(Boolean(hidden));

    useEffect(() => {
        frameRef.current = frame;
    }, [frame]);

    useEffect(() => {
        playingRef.current = playing;
        hiddenRef.current = Boolean(hidden);
    }, [playing, hidden]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let renderer: SceneRenderer;
        try {
            renderer = new SceneRenderer(container, {
                mode: "editor",
                shadows,
                antialias,
                pixelArt,
                onPick: (id, additive) => {
                    const current = store.getState().selection;
                    if (!id) {
                        if (!additive) store.setSelection([]);
                        return;
                    }
                    if (additive) store.setSelection(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
                    else store.setSelection([id]);
                },
                onGizmoChange: (id, world) => {
                    if (playingRef.current) return;
                    store.update("Dönüşüm", (draft) => {
                        setWorldTransform(activeScene(draft), id, world, draft.dimension === "2d");
                        touch(draft);
                    }, { mergeKey: `gizmo:${id}` });
                },
                onGizmoEnd: () => store.breakMerge(),
            });
        } catch {
            container.textContent = "WebGL başlatılamadı. Tarayıcınızın donanım hızlandırmasını açın.";
            return;
        }
        rendererRef.current = renderer;
        renderer.setTextures(store.getState().project.textures);
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            if (document.hidden || hiddenRef.current) return;
            renderer.render(frameRef.current);
        };
        raf = requestAnimationFrame(loop);
        apiRef.current = {
            focus: (id) => renderer.focus(id),
            resetView: () => renderer.resetView(),
            center: () => {
                const rect = renderer.canvas.getBoundingClientRect();
                return renderer.groundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            },
            snapshot: () => renderer.snapshot(frameRef.current, 0.7),
        };
        return () => {
            cancelAnimationFrame(raf);
            apiRef.current = null;
            renderer.dispose();
            rendererRef.current = null;
        };
    }, [shadows, antialias, pixelArt, store, apiRef]);

    useEffect(() => {
        rendererRef.current?.setTextures(project.textures);
    }, [project.textures]);

    useEffect(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        renderer.gizmoEnabled = !playing;
        renderer.setSelection(selection);
    }, [selection, playing]);

    useEffect(() => {
        rendererRef.current?.setGizmoMode(gizmoMode);
    }, [gizmoMode]);

    useEffect(() => {
        rendererRef.current?.setGizmoSpace(gizmoSpace);
    }, [gizmoSpace]);

    useEffect(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        renderer.setGridVisible(grid);
        renderer.showColliders = colliders;
        renderer.showIcons = icons;
        renderer.setSelection(store.getState().selection);
    }, [grid, colliders, icons, store]);

    const handleDrop = (event: React.DragEvent) => {
        event.preventDefault();
        setDragOver(false);
        const renderer = rendererRef.current;
        if (!renderer || playing) return;
        const point = renderer.groundPoint(event.clientX, event.clientY);
        const prefabId = event.dataTransfer.getData("application/x-hanogt-prefab");
        const textureId = event.dataTransfer.getData("application/x-hanogt-texture");
        if (prefabId) {
            let id: string | null = null;
            store.update("Prefab ekle", (draft) => { id = instantiatePrefab(draft, prefabId, point); });
            if (id) store.setSelection([id]);
            return;
        }
        if (textureId) {
            const target = renderer.pick(event.clientX, event.clientY);
            const project = store.getState().project;
            const entity = target ? findEntity(project, target) : undefined;
            const hasVisual = entity?.components.some((component) => component.type === "spriteRenderer" || component.type === "meshRenderer");
            if (entity && hasVisual) {
                store.update("Doku ata", (draft) => {
                    const draftEntity = findEntity(draft, entity.id);
                    for (const component of draftEntity?.components ?? []) {
                        if (component.type === "spriteRenderer") component.textureId = textureId;
                        if (component.type === "meshRenderer") component.material.textureId = textureId;
                    }
                    touch(draft);
                });
                store.setSelection([entity.id]);
                return;
            }
            const texture = project.textures.find((item) => item.id === textureId);
            let createdId = "";
            store.update("Sprite oluştur", (draft) => {
                const sceneDraft = activeScene(draft);
                const aspect = texture && texture.height > 0 ? texture.width / texture.height : 1;
                const sprite = createSpriteRenderer({ textureId });
                const entityDoc = {
                    id: createEngineId("entity"),
                    name: uniqueName(texture?.name ?? "Sprite", sceneDraft.objects.map((item) => item.name)),
                    tag: "Untagged",
                    parentId: null,
                    active: true,
                    components: [createTransform({ position: point, scale: { x: aspect >= 1 ? aspect : 1, y: aspect >= 1 ? 1 : 1 / aspect, z: 1 } }), sprite],
                };
                sceneDraft.objects.push(entityDoc);
                createdId = entityDoc.id;
                touch(draft);
            });
            if (createdId) store.setSelection([createdId]);
        }
    };

    return (
        <div className={cx("relative h-full min-h-0 w-full overflow-hidden bg-zinc-950", hidden && "invisible absolute inset-0")}>
            <div
                ref={containerRef}
                className="absolute inset-0"
                onDragOver={(event) => {
                    const types = event.dataTransfer.types;
                    if (types.includes("application/x-hanogt-prefab") || types.includes("application/x-hanogt-texture")) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                        setDragOver(true);
                    }
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onContextMenu={(event) => event.preventDefault()}
            />
            <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
                <span className="rounded-md bg-black/55 px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-zinc-300 backdrop-blur">{is2D ? "2D" : "3D"} · {scene.name}</span>
            </div>
            <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-black/55 p-0.5 backdrop-blur">
                <IconButton icon={Grid3x3} label={t("grid")} size="sm" active={grid} onClick={() => setGrid(!grid)} />
                <IconButton icon={SquareDashed} label={t("colliders")} size="sm" active={colliders} onClick={() => setColliders(!colliders)} />
                <IconButton icon={Eye} label={t("icons")} size="sm" active={icons} onClick={() => setIcons(!icons)} />
                <IconButton icon={Crosshair} label={t("focus")} size="sm" disabled={!selection.length} onClick={() => selection[0] && rendererRef.current?.focus(selection[0])} />
                <IconButton icon={LocateFixed} label={t("resetView")} size="sm" onClick={() => rendererRef.current?.resetView()} />
            </div>
            <div className="pointer-events-none absolute bottom-2 left-2 hidden rounded-md bg-black/45 px-2 py-1 text-[10.5px] text-zinc-400 backdrop-blur md:block">
                {is2D ? "Sol tık: seç · Sürükle: kaydır · Tekerlek: yakınlaş · F: odakla" : "Sol tık: seç · Sol sürükle: döndür · Sağ sürükle: kaydır · Tekerlek: yakınlaş · F: odakla"}
            </div>
            {dragOver ? <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-indigo-400/70 bg-indigo-500/10 text-sm font-semibold text-indigo-100">{t("dropHere")}</div> : null}
        </div>
    );
}
