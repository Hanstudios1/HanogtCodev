"use client";

/** Inspector of the Tilemap component: palette, painting tools, atlas and collision settings. */
import { Brush, Eraser, Paintbrush, Pipette, Plus, RectangleHorizontal, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { countTiles, eraseTileKey, isTileKey, nextTileKey, tilemapSize, TILEMAP_LIMITS } from "@/lib/game-engine/tilemap";
import type { TileDefinition, TilemapComponent } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { TextureSelect, useComponentEdit, type Editor } from "./inspector-fields";
import { useEditorState } from "./store";
import { useTilePainter, type TileTool } from "./tile-painter";
import { Button, Checkbox, ColorInput, FieldRow, NumberInput, SliderInput, TextInput, Toggle, cx, inputClass } from "./ui";

const NEW_TILE_COLORS = ["#f97316", "#8b5cf6", "#ec4899", "#14b8a6", "#eab308", "#ef4444", "#3b82f6", "#84cc16"];

/** CSS that shows one cell of an atlas texture (palette swatches). */
export function atlasCellStyle(dataUrl: string, columns: number, rows: number, frame: number): CSSProperties {
    const column = frame % columns;
    const row = Math.floor(frame / columns);
    return {
        backgroundImage: `url("${dataUrl}")`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${columns > 1 ? (column / (columns - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
        imageRendering: "pixelated",
    };
}

/** Small square showing what a palette tile looks like. */
export function TileSwatch({ tile, atlas, className }: { tile: TileDefinition; atlas: { dataUrl: string; columns: number; rows: number } | null; className?: string }) {
    const textured = atlas && tile.frame >= 0;
    return (
        <span
            aria-hidden="true"
            className={cx("block rounded-[4px] border border-black/30", className)}
            style={textured ? { ...atlasCellStyle(atlas.dataUrl, atlas.columns, atlas.rows, Math.min(tile.frame, atlas.columns * atlas.rows - 1)), backgroundColor: tile.color } : { background: `linear-gradient(180deg, ${tile.color}, ${tile.color}cc)` }}
        />
    );
}

export const TILE_TOOLS: Array<{ tool: TileTool; icon: typeof Brush; label: "toolPaint" | "toolErase" | "toolRect" | "toolPick" }> = [
    { tool: "paint", icon: Paintbrush, label: "toolPaint" },
    { tool: "erase", icon: Eraser, label: "toolErase" },
    { tool: "rect", icon: RectangleHorizontal, label: "toolRect" },
    { tool: "pick", icon: Pipette, label: "toolPick" },
];

export default function TilemapEditor({ entity, component, disabled }: Editor<TilemapComponent>) {
    const { store, t, tilePainter } = useEditor();
    const textures = useEditorState(store, (state) => state.project.textures);
    const is2D = useEditorState(store, (state) => state.project.dimension === "2d");
    const painter = useTilePainter(tilePainter, (state) => state);
    const edit = useComponentEdit(entity.id, component);
    const palette = component.palette;
    const brush = painter.brush && palette.some((tile) => tile.key === painter.brush) ? painter.brush : palette[0]?.key ?? null;
    const selected = palette.find((tile) => tile.key === brush) ?? null;
    const painting = painter.active && painter.entityId === entity.id;
    const atlasTexture = textures.find((texture) => texture.id === component.atlas.textureId) ?? null;
    const atlas = atlasTexture ? { dataUrl: atlasTexture.dataUrl, columns: component.atlas.columns, rows: component.atlas.rows } : null;
    const frameCount = component.atlas.columns * component.atlas.rows;
    const size = tilemapSize(component);

    const updateTile = (key: string, field: string, recipe: (tile: TileDefinition) => void) => edit(`tile:${key}:${field}`, (draft) => {
        const tile = draft.palette.find((item) => item.key === key);
        if (tile) recipe(tile);
    }, t("hEditPalette"));

    const addTile = () => {
        const key = nextTileKey(palette);
        if (!key || palette.length >= TILEMAP_LIMITS.maxPalette) return;
        edit("palette:add", (draft) => {
            draft.palette.push({ key, name: `Karo ${draft.palette.length + 1}`, color: NEW_TILE_COLORS[draft.palette.length % NEW_TILE_COLORS.length], solid: true, frame: -1 });
        }, t("hEditPalette"));
        tilePainter.set({ brush: key });
    };

    const removeTile = (key: string) => {
        edit("palette:remove", (draft) => {
            draft.palette = draft.palette.filter((tile) => tile.key !== key);
            eraseTileKey(draft, key);
        }, t("hEditPalette"));
    };

    const changeKey = (oldKey: string, value: string) => {
        const key = value.trim().slice(-1);
        if (!isTileKey(key) || key === oldKey || palette.some((tile) => tile.key === key)) return;
        edit(`tile:${oldKey}:key`, (draft) => {
            const tile = draft.palette.find((item) => item.key === oldKey);
            if (!tile) return;
            tile.key = key;
            draft.rows = draft.rows.map((row) => row.split(oldKey).join(key));
        }, t("hEditPalette"));
        if (painter.brush === oldKey) tilePainter.set({ brush: key });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Button
                    variant={painting ? "danger" : "primary"}
                    disabled={disabled || (!painting && !brush)}
                    className="h-8 flex-1"
                    onClick={() => (painting ? tilePainter.stop() : tilePainter.start(entity.id, brush))}
                >
                    <Brush className="h-4 w-4" />{painting ? t("stopPainting") : t("paintTiles")}
                </Button>
            </div>
            <p className="text-[11px] text-zinc-500">{t("tilemapInfo").replace("{tiles}", String(countTiles(component))).replace("{width}", String(size.width)).replace("{height}", String(size.height))}</p>
            {painting ? <p className="rounded-md bg-indigo-500/10 px-2 py-1.5 text-[11px] leading-snug text-indigo-200">{t("paintHint")}</p> : null}
            {!is2D ? <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-200">{t("tilemap2dHint")}</p> : null}

            <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label={t("toolPaint")}>
                {TILE_TOOLS.map(({ tool, icon: Icon, label }) => (
                    <button
                        key={tool}
                        type="button"
                        role="radio"
                        aria-checked={painter.tool === tool}
                        title={t(label)}
                        disabled={disabled}
                        onClick={() => tilePainter.set({ tool })}
                        className={cx("flex h-8 flex-col items-center justify-center rounded-md border text-[9.5px] font-semibold transition", painter.tool === tool ? "border-indigo-400/70 bg-indigo-500/20 text-indigo-100" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]")}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="leading-tight">{t(label)}</span>
                    </button>
                ))}
            </div>

            <div>
                <p className="pb-1 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("palette")}</p>
                <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label={t("palette")}>
                    {palette.map((tile) => (
                        <button
                            key={tile.key}
                            type="button"
                            role="radio"
                            aria-checked={brush === tile.key}
                            aria-label={tile.name}
                            title={`${tile.name} (${tile.key})${tile.solid ? "" : " · decor"}`}
                            onClick={() => tilePainter.set({ brush: tile.key, tool: painter.tool === "erase" || painter.tool === "pick" ? "paint" : painter.tool })}
                            className={cx("relative grid aspect-square place-items-center rounded-md border p-1 transition", brush === tile.key ? "border-indigo-300 bg-indigo-500/20 ring-1 ring-indigo-300/60" : "border-white/10 bg-white/[0.03] hover:border-white/25")}
                        >
                            <TileSwatch tile={tile} atlas={atlas} className="h-full w-full" />
                            <span className="absolute bottom-0 right-0.5 font-mono text-[9px] font-bold text-white drop-shadow">{tile.key}</span>
                        </button>
                    ))}
                    <button type="button" disabled={disabled || palette.length >= TILEMAP_LIMITS.maxPalette} onClick={addTile} title={t("addTile")} aria-label={t("addTile")} className="grid aspect-square place-items-center rounded-md border border-dashed border-white/20 text-zinc-400 hover:border-indigo-400/60 hover:text-white disabled:opacity-40">
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {selected ? (
                <div className="space-y-0.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2">
                    <FieldRow label={t("name")}><TextInput value={selected.name} maxLength={40} disabled={disabled} onChange={(value) => value.trim() && updateTile(selected.key, "name", (tile) => { tile.name = value.trim().slice(0, 40); })} /></FieldRow>
                    <FieldRow label={t("tileKey")}>
                        <input
                            defaultValue={selected.key}
                            key={`${component.id}:${selected.key}`}
                            maxLength={1}
                            disabled={disabled}
                            onChange={(event) => changeKey(selected.key, event.target.value)}
                            onBlur={(event) => { event.target.value = selected.key; }}
                            className={cx(inputClass, "w-12 text-center font-mono")}
                            aria-label={t("tileKey")}
                        />
                    </FieldRow>
                    <FieldRow label="Color"><ColorInput value={selected.color} disabled={disabled} onChange={(color) => updateTile(selected.key, "color", (tile) => { tile.color = color; })} /></FieldRow>
                    <FieldRow label={t("tileSolid")}><Toggle checked={selected.solid} disabled={disabled} onChange={(value) => updateTile(selected.key, "solid", (tile) => { tile.solid = value; })} /></FieldRow>
                    {atlas ? (
                        <FieldRow label={t("tileFrame")}>
                            <div className="flex items-center gap-1.5">
                                <label className="flex items-center gap-1 text-[11px] text-zinc-400">
                                    <Checkbox checked={selected.frame < 0} disabled={disabled} onChange={(plain) => updateTile(selected.key, "frame", (tile) => {
                                        tile.frame = plain ? -1 : 0;
                                        if (!plain && tile.color !== "#ffffff") tile.color = "#ffffff";
                                    })} />{t("plainColor")}
                                </label>
                                {selected.frame >= 0 ? <NumberInput value={selected.frame} min={0} max={Math.max(0, frameCount - 1)} integer step={1} disabled={disabled} onChange={(frame) => updateTile(selected.key, "frame", (tile) => { tile.frame = frame; })} /> : null}
                            </div>
                        </FieldRow>
                    ) : null}
                    <div className="pt-1">
                        <Button variant="danger" className="h-7 w-full" disabled={disabled} onClick={() => removeTile(selected.key)}><Trash2 className="h-3.5 w-3.5" />{t("removeTile")}</Button>
                    </div>
                </div>
            ) : null}

            <div className="space-y-0.5 border-t border-white/[0.06] pt-2">
                <FieldRow label={t("cellSize")}><NumberInput value={component.cellSize} min={0.05} max={100} step={0.05} disabled={disabled} onChange={(value) => edit("cellSize", (draft) => { draft.cellSize = value; })} /></FieldRow>
                <FieldRow label="Order in Layer"><NumberInput value={component.sortingLayer} integer step={1} disabled={disabled} onChange={(value) => edit("sorting", (draft) => { draft.sortingLayer = value; })} /></FieldRow>
                <FieldRow label="Is Trigger"><Toggle checked={component.isTrigger} disabled={disabled} onChange={(value) => edit("trigger", (draft) => { draft.isTrigger = value; })} /></FieldRow>
                <FieldRow label="Friction"><SliderInput value={component.friction} min={0} max={1} disabled={disabled} onChange={(value) => edit("friction", (draft) => { draft.friction = value; })} /></FieldRow>
                <FieldRow label="Bounciness"><SliderInput value={component.bounciness} min={0} max={1} disabled={disabled} onChange={(value) => edit("bounciness", (draft) => { draft.bounciness = value; })} /></FieldRow>
                <FieldRow label={t("atlas")}><TextureSelect value={component.atlas.textureId} disabled={disabled} onChange={(textureId) => edit("atlasTexture", (draft) => { draft.atlas = { ...draft.atlas, textureId }; })} /></FieldRow>
                {component.atlas.textureId ? (
                    <FieldRow label={t("atlasGrid")}>
                        <div className="grid grid-cols-2 gap-1">
                            <NumberInput label="↔" value={component.atlas.columns} min={1} max={64} integer step={1} disabled={disabled} onChange={(columns) => edit("atlasColumns", (draft) => { draft.atlas = { ...draft.atlas, columns }; })} />
                            <NumberInput label="↕" value={component.atlas.rows} min={1} max={64} integer step={1} disabled={disabled} onChange={(rows) => edit("atlasRows", (draft) => { draft.atlas = { ...draft.atlas, rows }; })} />
                        </div>
                    </FieldRow>
                ) : null}
            </div>
            <Button variant="ghost" className="h-7 w-full text-red-300" disabled={disabled || !component.rows.length} onClick={() => {
                if (!window.confirm(t("confirmClearTiles"))) return;
                edit("clear", (draft) => { draft.rows = []; });
            }}><Trash2 className="h-3.5 w-3.5" />{t("clearTiles")}</Button>
        </div>
    );
}
