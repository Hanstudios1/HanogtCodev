/**
 * Tilemap grid helpers shared by the editor painter, the renderer, physics and
 * scripts. Cells use integer coordinates (x right, y up). `rows` stores only
 * the occupied rectangle: the first string is its top row and `origin` is the
 * cell coordinate of its bottom-left corner.
 */
import type { TileDefinition, TilemapComponent } from "./types";

export const EMPTY_TILE = ".";

export const TILEMAP_LIMITS = {
    maxColumns: 512,
    maxRows: 256,
    maxPalette: 48,
} as const;

/** Printable ASCII except "." (the empty cell) and space. */
const TILE_KEY = /^[\x21-\x2D\x2F-\x7E]$/;

/** Order in which the editor hands out keys for new palette tiles. */
const KEY_SEQUENCE = "#=@B~*%&+ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$!?^<>[]{}/|:;-_'\",`";

type Grid = Pick<TilemapComponent, "rows" | "origin">;

export function isTileKey(value: unknown): value is string {
    return typeof value === "string" && TILE_KEY.test(value);
}

export function nextTileKey(palette: readonly TileDefinition[]): string | null {
    const used = new Set(palette.map((tile) => tile.key));
    for (const key of KEY_SEQUENCE) if (!used.has(key)) return key;
    return null;
}

export function tilemapSize(tilemap: Pick<TilemapComponent, "rows">): { width: number; height: number } {
    let width = 0;
    for (const row of tilemap.rows) width = Math.max(width, row.length);
    return { width, height: tilemap.rows.length };
}

/** Palette key at a cell, or null when the cell is empty or outside the grid. */
export function tileKeyAt(tilemap: Grid, x: number, y: number): string | null {
    const height = tilemap.rows.length;
    const row = tilemap.origin.y + height - 1 - y;
    const column = x - tilemap.origin.x;
    if (row < 0 || row >= height || column < 0) return null;
    const key = tilemap.rows[row].charAt(column);
    return key && key !== EMPTY_TILE ? key : null;
}

export function tileAt(tilemap: Pick<TilemapComponent, "rows" | "origin" | "palette">, x: number, y: number): TileDefinition | null {
    const key = tileKeyAt(tilemap, x, y);
    return key ? tilemap.palette.find((tile) => tile.key === key) ?? null : null;
}

/** Accepts a tile name (case-insensitive) or a palette key. */
export function resolveTileKey(palette: readonly TileDefinition[], value: string): string | null {
    const exact = palette.find((tile) => tile.name === value);
    if (exact) return exact.key;
    const lower = value.toLocaleLowerCase("tr");
    const named = palette.find((tile) => tile.name.toLocaleLowerCase("tr") === lower);
    if (named) return named.key;
    return palette.some((tile) => tile.key === value) ? value : null;
}

export function forEachTile(tilemap: Grid, visit: (x: number, y: number, key: string) => void) {
    const height = tilemap.rows.length;
    for (let row = 0; row < height; row += 1) {
        const text = tilemap.rows[row];
        const y = tilemap.origin.y + height - 1 - row;
        for (let column = 0; column < text.length; column += 1) {
            const key = text[column];
            if (key !== EMPTY_TILE) visit(tilemap.origin.x + column, y, key);
        }
    }
}

export function countTiles(tilemap: Grid, key?: string): number {
    let count = 0;
    forEachTile(tilemap, (_x, _y, cell) => {
        if (key === undefined || cell === key) count += 1;
    });
    return count;
}

/** Removes empty border rows and columns (moving `origin` so tiles stay in place). */
export function trimTilemap(tilemap: Grid) {
    const rows = tilemap.rows;
    let top = 0;
    while (top < rows.length && !/[^.]/.test(rows[top])) top += 1;
    if (top === rows.length) {
        tilemap.rows = [];
        return;
    }
    let bottom = rows.length - 1;
    while (bottom > top && !/[^.]/.test(rows[bottom])) bottom -= 1;
    const kept = rows.slice(top, bottom + 1);
    let left = Infinity;
    let right = -1;
    for (const row of kept) {
        const first = row.search(/[^.]/);
        if (first < 0) continue;
        left = Math.min(left, first);
        let last = row.length - 1;
        while (last >= 0 && row[last] === EMPTY_TILE) last -= 1;
        right = Math.max(right, last);
    }
    tilemap.origin = { x: tilemap.origin.x + left, y: tilemap.origin.y + (rows.length - 1 - bottom) };
    tilemap.rows = kept.map((row) => row.slice(left, right + 1).padEnd(right - left + 1, EMPTY_TILE));
}

/** Grows the stored rectangle so it contains the given cells; false when the limits would be exceeded. */
function ensureBounds(tilemap: Grid, minX: number, minY: number, maxX: number, maxY: number): boolean {
    const { width, height } = tilemapSize(tilemap);
    const empty = height === 0 || width === 0;
    const left = empty ? minX : Math.min(tilemap.origin.x, minX);
    const bottom = empty ? minY : Math.min(tilemap.origin.y, minY);
    const right = empty ? maxX : Math.max(tilemap.origin.x + width - 1, maxX);
    const top = empty ? maxY : Math.max(tilemap.origin.y + height - 1, maxY);
    const nextWidth = right - left + 1;
    const nextHeight = top - bottom + 1;
    if (nextWidth > TILEMAP_LIMITS.maxColumns || nextHeight > TILEMAP_LIMITS.maxRows) return false;
    if (!empty && left === tilemap.origin.x && bottom === tilemap.origin.y && nextWidth === width && nextHeight === height) return true;
    const rows: string[] = [];
    for (let y = top; y >= bottom; y -= 1) {
        let text = "";
        for (let x = left; x <= right; x += 1) text += (empty ? null : tileKeyAt(tilemap, x, y)) ?? EMPTY_TILE;
        rows.push(text);
    }
    tilemap.rows = rows;
    tilemap.origin = { x: left, y: bottom };
    return true;
}

function writeCell(tilemap: Grid, x: number, y: number, key: string): boolean {
    const height = tilemap.rows.length;
    const row = tilemap.origin.y + height - 1 - y;
    const column = x - tilemap.origin.x;
    const text = tilemap.rows[row];
    if (text === undefined || column < 0 || column >= text.length || text[column] === key) return false;
    tilemap.rows[row] = text.slice(0, column) + key + text.slice(column + 1);
    return true;
}

/** Paints (`key`) or erases (null) one cell. Returns true when the grid changed. */
export function setTileKey(tilemap: Grid, x: number, y: number, key: string | null): boolean {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (key === null || key === EMPTY_TILE) {
        if (!tileKeyAt(tilemap, x, y)) return false;
        writeCell(tilemap, x, y, EMPTY_TILE);
        trimTilemap(tilemap);
        return true;
    }
    if (!isTileKey(key)) return false;
    if (tileKeyAt(tilemap, x, y) === key) return false;
    if (!ensureBounds(tilemap, x, y, x, y)) return false;
    return writeCell(tilemap, x, y, key);
}

/** Fills (or erases) a rectangle of cells, corners included. */
export function fillTiles(tilemap: Grid, x0: number, y0: number, x1: number, y1: number, key: string | null): boolean {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const erase = key === null || key === EMPTY_TILE;
    if (!erase && (!isTileKey(key) || !ensureBounds(tilemap, minX, minY, maxX, maxY))) return false;
    let changed = false;
    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            if (erase) {
                if (tileKeyAt(tilemap, x, y)) changed = writeCell(tilemap, x, y, EMPTY_TILE) || changed;
            } else {
                changed = writeCell(tilemap, x, y, key as string) || changed;
            }
        }
    }
    if (erase && changed) trimTilemap(tilemap);
    return changed;
}

/** Removes every cell that uses `key` (e.g. after deleting a palette tile). */
export function eraseTileKey(tilemap: Grid, key: string) {
    if (!tilemap.rows.some((row) => row.includes(key))) return;
    tilemap.rows = tilemap.rows.map((row) => row.split(key).join(EMPTY_TILE));
    trimTilemap(tilemap);
}

/** Cell under a point given in the tilemap's local space. */
export function localPointToCell(tilemap: Pick<TilemapComponent, "cellSize">, x: number, y: number): { x: number; y: number } {
    const size = tilemap.cellSize > 0 ? tilemap.cellSize : 1;
    return { x: Math.floor(x / size), y: Math.floor(y / size) };
}

export function cellCenterLocal(tilemap: Pick<TilemapComponent, "cellSize">, x: number, y: number): { x: number; y: number } {
    return { x: (x + 0.5) * tilemap.cellSize, y: (y + 0.5) * tilemap.cellSize };
}

export interface SolidTile {
    x: number;
    y: number;
    key: string;
    /** Faces that border an empty (or non-solid) cell. Contacts only push out through these. */
    open: { left: boolean; right: boolean; bottom: boolean; top: boolean };
}

/**
 * Solid tiles that can be touched from outside (every tile with at least one
 * open face). Interior tiles are skipped; physics only needs the surface.
 */
export function solidTiles(tilemap: Pick<TilemapComponent, "rows" | "origin" | "palette">): SolidTile[] {
    const solidKeys = new Set(tilemap.palette.filter((tile) => tile.solid).map((tile) => tile.key));
    if (!solidKeys.size) return [];
    const { width, height } = tilemapSize(tilemap);
    const solid = new Uint8Array(width * height);
    for (let row = 0; row < height; row += 1) {
        const text = tilemap.rows[row];
        for (let column = 0; column < text.length; column += 1) if (solidKeys.has(text[column])) solid[row * width + column] = 1;
    }
    const at = (column: number, row: number) => column >= 0 && column < width && row >= 0 && row < height && solid[row * width + column] === 1;
    const output: SolidTile[] = [];
    for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
            if (!solid[row * width + column]) continue;
            // Rows run top to bottom, so the cell above is row - 1.
            const open = { left: !at(column - 1, row), right: !at(column + 1, row), bottom: !at(column, row + 1), top: !at(column, row - 1) };
            if (!open.left && !open.right && !open.bottom && !open.top) continue;
            output.push({ x: tilemap.origin.x + column, y: tilemap.origin.y + height - 1 - row, key: tilemap.rows[row][column], open });
        }
    }
    return output;
}
