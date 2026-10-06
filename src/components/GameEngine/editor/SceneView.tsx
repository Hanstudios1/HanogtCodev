"use client";

import { Check, Crosshair, Eye, Grid3x3, LocateFixed, Sparkles, SquareDashed } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { createSpriteRenderer, createTransform } from "@/lib/game-engine/components";
import { createEngineId } from "@/lib/game-engine/ids";
import { SceneRenderer, type GizmoMode, type SnapSettings } from "@/lib/game-engine/render/renderer";
import { sceneFrame } from "@/lib/game-engine/render/scene-frame";
import { uniqueName } from "@/lib/game-engine/scene";
import { addModelObject, MODEL_DRAG_TYPE } from "./ModelAssets";
import { localPointToCell, tileKeyAt } from "@/lib/game-engine/tilemap";
import type { TilemapComponent, Vector3 } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { selectionRoots } from "./multi-edit";
import { activeScene, fillTilemapRect, findEntity, instantiatePrefab, paintTilemap, setWorldTransform, touch } from "./operations";
import { useEditorState } from "./store";
import { useTilePainter } from "./tile-painter";
import { TILE_TOOLS, TileSwatch } from "./TilemapEditor";
import { IconButton, cx } from "./ui";

export interface SceneViewApi {
    focus: (id: string) => void;
    resetView: () => void;
    center: () => Vector3;
    snapshot: () => string;
}

type Cell = { x: number; y: number };

/** Cells on the straight line between two cells (fast strokes leave no gaps). */
function lineCells(from: Cell, to: Cell): Cell[] {
    const cells: Cell[] = [];
    let x = from.x;
    let y = from.y;
    const dx = Math.abs(to.x - x);
    const dy = -Math.abs(to.y - y);
    const sx = x < to.x ? 1 : -1;
    const sy = y < to.y ? 1 : -1;
    let error = dx + dy;
    for (let guard = 0; guard < 2048; guard += 1) {
        cells.push({ x, y });
        if (x === to.x && y === to.y) break;
        const doubled = 2 * error;
        if (doubled >= dy) {
            error += dy;
            x += sx;
        }
        if (doubled <= dx) {
            error += dx;
            y += sy;
        }
    }
    return cells;
}

export default function SceneView({ apiRef, gizmoMode, gizmoSpace, hidden, snap }: {
    apiRef: MutableRefObject<SceneViewApi | null>;
    gizmoMode: GizmoMode;
    gizmoSpace: "world" | "local";
    hidden?: boolean;
    snap: SnapSettings | null;
}) {
    const { store, t, playing, tilePainter } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const selection = useEditorState(store, (state) => state.selection);
    const painter = useTilePainter(tilePainter, (state) => state);
    const scene = activeScene(project);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<SceneRenderer | null>(null);
    const frame = useMemo(() => sceneFrame(scene, project.dimension), [scene, project.dimension]);
    const frameRef = useRef(frame);
    const [grid, setGrid] = useState(true);
    const [colliders, setColliders] = useState(false);
    const [icons, setIcons] = useState(true);
    const [effects, setEffects] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const is2D = project.dimension === "2d";
    const { shadows, antialias, pixelArt } = project.settings;

    const paintEntity = painter.active && painter.entityId ? scene.objects.find((entity) => entity.id === painter.entityId) : undefined;
    const targetTilemap = paintEntity?.components.find((component): component is TilemapComponent => component.type === "tilemap");
    const painting = Boolean(!playing && paintEntity && targetTilemap);
    const brush = painter.brush && targetTilemap?.palette.some((tile) => tile.key === painter.brush) ? painter.brush : targetTilemap?.palette[0]?.key ?? null;
    const atlasTexture = targetTilemap?.atlas.textureId ? project.textures.find((texture) => texture.id === targetTilemap.atlas.textureId) : undefined;
    const atlas = atlasTexture && targetTilemap ? { dataUrl: atlasTexture.dataUrl, columns: targetTilemap.atlas.columns, rows: targetTilemap.atlas.rows } : null;

    const playingRef = useRef(playing);
    const hiddenRef = useRef(Boolean(hidden));
    // The renderer outlives language switches, so its callbacks read the latest strings from a ref.
    const textRef = useRef(t);
    const viewRef = useRef({ snap, effects, painting });
    const paintRef = useRef({ entityId: paintEntity?.id ?? null, componentId: targetTilemap?.id ?? null, brush, tool: painter.tool });
    const strokeRef = useRef<{ id: string; erase: boolean; rect: boolean; start: Cell; last: Cell } | null>(null);

    useEffect(() => {
        frameRef.current = frame;
    }, [frame]);

    useEffect(() => {
        textRef.current = t;
    }, [t]);

    useEffect(() => {
        playingRef.current = playing;
        hiddenRef.current = Boolean(hidden);
    }, [playing, hidden]);

    useEffect(() => {
        viewRef.current = { snap, effects, painting };
        paintRef.current = { entityId: paintEntity?.id ?? null, componentId: targetTilemap?.id ?? null, brush, tool: painter.tool };
    });

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
                    store.update(textRef.current("hTransform"), (draft) => {
                        setWorldTransform(activeScene(draft), id, world, draft.dimension === "2d");
                        touch(draft);
                    }, { mergeKey: `gizmo:${id}` });
                },
                onGizmoEnd: () => store.breakMerge(),
                onGizmoChangeMany: (changes) => {
                    if (playingRef.current) return;
                    store.update(textRef.current("hTransform"), (draft) => {
                        const scene = activeScene(draft);
                        // Children of selected parents move with them.
                        const roots = new Set(selectionRoots(scene.objects, changes.map((change) => change.id)));
                        for (const change of changes) if (roots.has(change.id)) setWorldTransform(scene, change.id, change.world, draft.dimension === "2d");
                        touch(draft);
                    }, { mergeKey: "gizmo:multi" });
                },
                onMarquee: (ids, additive) => {
                    const current = store.getState().selection;
                    store.setSelection(additive ? [...current, ...ids.filter((id) => !current.includes(id))] : ids);
                },
            });
        } catch {
            container.textContent = textRef.current("webglFailed");
            return;
        }
        rendererRef.current = renderer;
        renderer.setTextures(store.getState().project.textures);
        renderer.setModels(store.getState().project.models);
        renderer.setSnap(viewRef.current.snap);
        renderer.setEffectsVisible(viewRef.current.effects);
        renderer.setPaintMode(viewRef.current.painting);
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
        rendererRef.current?.setModels(project.models);
    }, [project.models]);

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
        rendererRef.current?.setSnap(snap);
    }, [snap]);

    useEffect(() => {
        rendererRef.current?.setEffectsVisible(effects);
    }, [effects]);

    useEffect(() => {
        rendererRef.current?.setPaintMode(painting);
    }, [painting]);

    // Painting ends when the game starts, the tilemap goes away or another object gets selected.
    useEffect(() => {
        if (!painter.active) return;
        if (playing || !targetTilemap || (selection.length > 0 && selection[0] !== painter.entityId)) tilePainter.stop();
    }, [painter.active, painter.entityId, playing, targetTilemap, selection, tilePainter]);

    useEffect(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        renderer.setGridVisible(grid);
        renderer.showColliders = colliders;
        renderer.showIcons = icons;
        renderer.setSelection(store.getState().selection);
    }, [grid, colliders, icons, store]);

    // ------------------------------------------------------------------
    // Tile painting
    // ------------------------------------------------------------------

    const currentTilemap = (): TilemapComponent | null => {
        const { entityId, componentId } = paintRef.current;
        if (!entityId || !componentId) return null;
        const component = findEntity(store.getState().project, entityId)?.components.find((item) => item.id === componentId);
        return component?.type === "tilemap" ? component : null;
    };

    const cellAt = (event: ReactPointerEvent): Cell | null => {
        const renderer = rendererRef.current;
        const { entityId } = paintRef.current;
        const tilemap = currentTilemap();
        if (!renderer || !entityId || !tilemap) return null;
        const local = renderer.localPointOnEntity(event.clientX, event.clientY, entityId);
        return local ? localPointToCell(tilemap, local.x, local.y) : null;
    };

    const showCursor = (from: Cell, to: Cell, erase: boolean) => {
        const tilemap = currentTilemap();
        const { entityId } = paintRef.current;
        if (!tilemap || !entityId) return;
        rendererRef.current?.setTileCursor({ entityId, cellSize: tilemap.cellSize, x0: from.x, y0: from.y, x1: to.x, y1: to.y, erase });
    };

    const paintCells = (cells: Cell[], erase: boolean, strokeId: string) => {
        const { entityId, componentId, brush: key } = paintRef.current;
        if (!entityId || !componentId || (!erase && !key)) return;
        store.update(t("hPaintTiles"), (draft) => { paintTilemap(draft, entityId, componentId, cells, erase ? null : key); }, { mergeKey: `tiles:${strokeId}` });
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!painting || event.button !== 0) return;
        if (strokeRef.current) {
            // A second finger means pinch/pan, not painting.
            endStroke();
            return;
        }
        const cell = cellAt(event);
        if (!cell) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const tool = paintRef.current.tool;
        if (tool === "pick") {
            const tilemap = currentTilemap();
            const key = tilemap ? tileKeyAt(tilemap, cell.x, cell.y) : null;
            if (key) tilePainter.set({ brush: key, tool: "paint" });
            return;
        }
        const erase = tool === "erase" || event.shiftKey;
        const stroke = { id: createEngineId("stroke"), erase, rect: tool === "rect", start: cell, last: cell };
        strokeRef.current = stroke;
        store.breakMerge();
        if (stroke.rect) showCursor(cell, cell, erase);
        else paintCells([cell], erase, stroke.id);
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!painting) return;
        const cell = cellAt(event);
        if (!cell) return;
        const stroke = strokeRef.current;
        if (!stroke) {
            showCursor(cell, cell, paintRef.current.tool === "erase" || event.shiftKey);
            return;
        }
        if (stroke.rect) {
            showCursor(stroke.start, cell, stroke.erase);
            stroke.last = cell;
            return;
        }
        showCursor(cell, cell, stroke.erase);
        if (cell.x === stroke.last.x && cell.y === stroke.last.y) return;
        paintCells(lineCells(stroke.last, cell).slice(1), stroke.erase, stroke.id);
        stroke.last = cell;
    };

    const endStroke = () => {
        const stroke = strokeRef.current;
        strokeRef.current = null;
        if (!stroke) return;
        if (stroke.rect) {
            const { entityId, componentId, brush: key } = paintRef.current;
            if (entityId && componentId && (stroke.erase || key)) {
                store.update(t("hPaintTiles"), (draft) => { fillTilemapRect(draft, entityId, componentId, stroke.start, stroke.last, stroke.erase ? null : key); });
            }
            showCursor(stroke.last, stroke.last, stroke.erase);
        }
        store.breakMerge();
    };

    // ------------------------------------------------------------------
    // Drag & drop
    // ------------------------------------------------------------------

    const handleDrop = (event: React.DragEvent) => {
        event.preventDefault();
        setDragOver(false);
        const renderer = rendererRef.current;
        if (!renderer || playing) return;
        const point = renderer.groundPoint(event.clientX, event.clientY);
        const prefabId = event.dataTransfer.getData("application/x-hanogt-prefab");
        const textureId = event.dataTransfer.getData("application/x-hanogt-texture");
        const modelId = event.dataTransfer.getData(MODEL_DRAG_TYPE);
        if (modelId) {
            // On an object with a Mesh Renderer the model replaces its mesh; elsewhere a new object shows it.
            const project = store.getState().project;
            const model = (project.models ?? []).find((item) => item.id === modelId);
            if (!model) return;
            const target = renderer.pick(event.clientX, event.clientY);
            const entity = target ? findEntity(project, target) : undefined;
            if (entity?.components.some((component) => component.type === "meshRenderer")) {
                store.update(t("hAssignModel"), (draft) => {
                    for (const component of findEntity(draft, entity.id)?.components ?? []) if (component.type === "meshRenderer") component.modelId = model.id;
                    touch(draft);
                });
                store.setSelection([entity.id]);
                return;
            }
            let created = "";
            store.update(t("hAddModelObject"), (draft) => { created = addModelObject(draft, model, point); });
            if (created) store.setSelection([created]);
            return;
        }
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
            store.update(t("hCreateSprite"), (draft) => {
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
                className={cx("absolute inset-0", painting && "cursor-crosshair")}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                onPointerLeave={() => {
                    if (!strokeRef.current) rendererRef.current?.setTileCursor(null);
                }}
                onDragOver={(event) => {
                    const types = event.dataTransfer.types;
                    if (types.includes("application/x-hanogt-prefab") || types.includes("application/x-hanogt-texture") || types.includes(MODEL_DRAG_TYPE)) {
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
                <IconButton icon={Sparkles} label={t("showEffects")} size="sm" active={effects} onClick={() => setEffects(!effects)} />
                <IconButton icon={Crosshair} label={t("focus")} size="sm" disabled={!selection.length} onClick={() => selection[0] && rendererRef.current?.focus(selection[0])} />
                <IconButton icon={LocateFixed} label={t("resetView")} size="sm" onClick={() => rendererRef.current?.resetView()} />
            </div>
            {painting && targetTilemap ? (
                <div className="absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-zinc-900/90 p-1 shadow-2xl backdrop-blur" role="toolbar" aria-label={t("paintTiles")}>
                    {TILE_TOOLS.map(({ tool, icon, label }) => (
                        <IconButton key={tool} icon={icon} label={t(label)} active={painter.tool === tool} onClick={() => tilePainter.set({ tool })} />
                    ))}
                    <span className="mx-0.5 h-6 w-px shrink-0 bg-white/10" />
                    {targetTilemap.palette.map((tile) => (
                        <button
                            key={tile.key}
                            type="button"
                            title={tile.name}
                            aria-label={tile.name}
                            aria-pressed={brush === tile.key}
                            onClick={() => tilePainter.set({ brush: tile.key, tool: painter.tool === "erase" || painter.tool === "pick" ? "paint" : painter.tool })}
                            className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-md border p-1", brush === tile.key ? "border-indigo-300 bg-indigo-500/25" : "border-transparent hover:bg-white/10")}
                        >
                            <TileSwatch tile={tile} atlas={atlas} className="h-full w-full" />
                        </button>
                    ))}
                    <span className="mx-0.5 h-6 w-px shrink-0 bg-white/10" />
                    <button type="button" onClick={() => tilePainter.stop()} className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-indigo-500 px-2.5 text-[11.5px] font-semibold text-white hover:bg-indigo-400">
                        <Check className="h-3.5 w-3.5" />{t("stopPainting")}
                    </button>
                </div>
            ) : null}
            <div className={cx("pointer-events-none absolute bottom-2 left-2 hidden rounded-md bg-black/45 px-2 py-1 text-[10.5px] text-zinc-400 backdrop-blur md:block", painting && "md:hidden")}>
                {is2D ? t("sceneHelp2D") : t("sceneHelp3D")}
            </div>
            {painting ? <div className="pointer-events-none absolute left-1/2 top-2 hidden -translate-x-1/2 rounded-md bg-black/55 px-2 py-1 text-[10.5px] text-indigo-100 backdrop-blur md:block">{t("paintHint")}</div> : null}
            {dragOver ? <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-indigo-400/70 bg-indigo-500/10 text-sm font-semibold text-indigo-100">{t("dropHere")}</div> : null}
        </div>
    );
}
