"use client";

/** Palette swatches of the Tilemap inspector and the scene's paint toolbar. */
import type { CSSProperties } from "react";
import { tilePreviewFrame } from "@/lib/game-engine/tilemap";
import type { TileDefinition } from "@/lib/game-engine/types";
import { cx } from "./ui";

/** The atlas a tilemap uses, as the inspector draws it. */
export interface TileAtlasView {
    dataUrl: string;
    columns: number;
    rows: number;
    /** Image size in pixels (for the cell picker's aspect ratio). */
    width?: number;
    height?: number;
}

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

/** Small square showing what a palette tile looks like (a rule tile's lone case, an animated tile's first frame). */
export function TileSwatch({ tile, atlas, className, frame }: { tile: TileDefinition; atlas: TileAtlasView | null; className?: string; frame?: number }) {
    const shown = frame ?? tilePreviewFrame(tile);
    const textured = atlas && shown >= 0;
    return (
        <span
            aria-hidden="true"
            className={cx("block rounded-[4px] border border-black/30", className)}
            style={textured ? { ...atlasCellStyle(atlas.dataUrl, atlas.columns, atlas.rows, Math.min(shown, atlas.columns * atlas.rows - 1)), backgroundColor: tile.color } : { background: `linear-gradient(180deg, ${tile.color}, ${tile.color}cc)` }}
        />
    );
}
