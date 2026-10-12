/**
 * Tilemap grid helpers shared by the editor painter, the renderer, physics and
 * scripts. Cells use integer coordinates (x right, y up). `rows` stores only
 * the occupied rectangle: the first string is its top row and `origin` is the
 * cell coordinate of its bottom-left corner.
 */
import type { RuleTile, TileDefinition, TilemapComponent } from "./types";

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
    /** V6: bodies only land on it from above (only its top face is open). */
    oneWay: boolean;
}

/**
 * Solid tiles that can be touched from outside (every tile with at least one
 * open face). Interior tiles are skipped; physics only needs the surface.
 * One-way tiles (V6) don't close their neighbours' faces and only offer their
 * top, when nothing solid sits on it.
 */
export function solidTiles(tilemap: Pick<TilemapComponent, "rows" | "origin" | "palette">): SolidTile[] {
    const solidKeys = new Set(tilemap.palette.filter((tile) => tile.solid && !tile.oneWay).map((tile) => tile.key));
    const oneWayKeys = new Set(tilemap.palette.filter((tile) => tile.solid && tile.oneWay).map((tile) => tile.key));
    if (!solidKeys.size && !oneWayKeys.size) return [];
    const { width, height } = tilemapSize(tilemap);
    // 1 = solid, 2 = one-way.
    const solid = new Uint8Array(width * height);
    for (let row = 0; row < height; row += 1) {
        const text = tilemap.rows[row];
        for (let column = 0; column < text.length; column += 1) {
            if (solidKeys.has(text[column])) solid[row * width + column] = 1;
            else if (oneWayKeys.has(text[column])) solid[row * width + column] = 2;
        }
    }
    const at = (column: number, row: number) => column >= 0 && column < width && row >= 0 && row < height && solid[row * width + column] === 1;
    const any = (column: number, row: number) => column >= 0 && column < width && row >= 0 && row < height && solid[row * width + column] !== 0;
    const output: SolidTile[] = [];
    for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
            const cell = solid[row * width + column];
            if (!cell) continue;
            const x = tilemap.origin.x + column;
            const y = tilemap.origin.y + height - 1 - row;
            if (cell === 2) {
                // Rows run top to bottom, so the cell above is row - 1.
                if (!any(column, row - 1)) output.push({ x, y, key: tilemap.rows[row][column], open: { left: false, right: false, bottom: false, top: true }, oneWay: true });
                continue;
            }
            const open = { left: !at(column - 1, row), right: !at(column + 1, row), bottom: !at(column, row + 1), top: !at(column, row - 1) };
            if (!open.left && !open.right && !open.bottom && !open.top) continue;
            output.push({ x, y, key: tilemap.rows[row][column], open, oneWay: false });
        }
    }
    return output;
}

// ---------------------------------------------------------------------------
// Rule tiles, animated tiles and one-way tiles (V6)
// ---------------------------------------------------------------------------

/** Neighbour bits of a 4-neighbour rule tile: slot = the sum of the joined sides. */
export const RULE4 = { N: 1, E: 2, S: 4, W: 8 } as const;

/** Neighbour bits of an 8-neighbour (blob) rule tile, clockwise from north. */
export const RULE8 = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;

/** Drops the corners whose two sides don't both join (they can't change the picture). */
export function reduceBlobMask(mask: number): number {
    let value = mask & 255;
    const corner = (bit: number, a: number, b: number) => {
        if (!((value & a) && (value & b))) value &= ~bit;
    };
    corner(RULE8.NE, RULE8.N, RULE8.E);
    corner(RULE8.SE, RULE8.S, RULE8.E);
    corner(RULE8.SW, RULE8.S, RULE8.W);
    corner(RULE8.NW, RULE8.N, RULE8.W);
    return value;
}

/** The 47 masks of a blob tileset in ascending order: slot i of an 8-neighbour rule tile is BLOB_MASKS[i]. */
export const BLOB_MASKS: readonly number[] = Array.from({ length: 256 }, (_, mask) => mask).filter((mask) => reduceBlobMask(mask) === mask);

const BLOB_SLOT = new Map(BLOB_MASKS.map((mask, slot) => [mask, slot]));

/** Slots of a rule tile with `neighbors` neighbours (16 or 47). */
export function ruleSlotCount(neighbors: 4 | 8): number {
    return neighbors === 8 ? BLOB_MASKS.length : 16;
}

/** The neighbour mask (bits of RULE4 / RULE8) a slot stands for. */
export function ruleSlotMask(neighbors: 4 | 8, slot: number): number {
    return neighbors === 8 ? BLOB_MASKS[slot] ?? 0 : slot;
}

type RuleGrid = Pick<TilemapComponent, "rows" | "origin">;

/** Which slot a rule tile at (x, y) uses, from the neighbours that join it. */
export function ruleTileSlot(tilemap: RuleGrid, x: number, y: number, tile: Pick<TileDefinition, "key" | "rule">): number {
    const rule = tile.rule;
    if (!rule) return 0;
    const joins = (dx: number, dy: number) => {
        const key = tileKeyAt(tilemap, x + dx, y + dy);
        return key !== null && (rule.matchAny || key === tile.key);
    };
    if (rule.neighbors === 4) return (joins(0, 1) ? RULE4.N : 0) | (joins(1, 0) ? RULE4.E : 0) | (joins(0, -1) ? RULE4.S : 0) | (joins(-1, 0) ? RULE4.W : 0);
    const mask = (joins(0, 1) ? RULE8.N : 0) | (joins(1, 1) ? RULE8.NE : 0) | (joins(1, 0) ? RULE8.E : 0) | (joins(1, -1) ? RULE8.SE : 0)
        | (joins(0, -1) ? RULE8.S : 0) | (joins(-1, -1) ? RULE8.SW : 0) | (joins(-1, 0) ? RULE8.W : 0) | (joins(-1, 1) ? RULE8.NW : 0);
    return BLOB_SLOT.get(reduceBlobMask(mask)) ?? 0;
}

/**
 * The atlas frame a cell draws at `time` seconds: a rule tile's slot frame, an
 * animated tile's current frame, else the tile's own frame (-1 = plain colour).
 */
export function tileFrameAt(tilemap: RuleGrid, x: number, y: number, tile: TileDefinition, time = 0): number {
    if (tile.rule) {
        const frame = tile.rule.frames[ruleTileSlot(tilemap, x, y, tile)];
        return frame !== undefined && frame >= 0 ? frame : tile.frame;
    }
    if (tile.animation && tile.animation.frames.length) return animatedTileFrame(tile.animation, time);
    return tile.frame;
}

export function animatedTileFrame(animation: { frames: readonly number[]; fps: number }, time: number): number {
    const frames = animation.frames;
    if (!frames.length) return -1;
    const index = Math.floor(Math.max(0, time) * Math.max(0.01, animation.fps)) % frames.length;
    return frames[index];
}

/** Frames of a rule tile laid out one after another in the atlas from `start` (the "fill from the atlas" button). */
export function consecutiveRuleFrames(neighbors: 4 | 8, start: number): number[] {
    return Array.from({ length: ruleSlotCount(neighbors) }, (_, slot) => start + slot);
}

/** The atlas frame a palette swatch shows: a rule tile's lone case (what one painted tile draws), an animated tile's first frame, else the tile's frame. */
export function tilePreviewFrame(tile: TileDefinition): number {
    if (tile.rule) {
        const lone = tile.rule.frames[0];
        if (lone !== undefined && lone >= 0) return lone;
        return tile.frame >= 0 ? tile.frame : tile.rule.frames.find((frame) => frame >= 0) ?? -1;
    }
    if (tile.animation?.frames.length) return tile.animation.frames[0];
    return tile.frame;
}

/**
 * The 3×3 picture of a rule slot (top row first, the tile itself in the
 * middle): true = a joined neighbour, false = an empty one, null = a corner
 * that doesn't matter for this slot.
 */
export function ruleSlotPattern(neighbors: 4 | 8, slot: number): Array<boolean | null> {
    const mask = ruleSlotMask(neighbors, slot);
    if (neighbors === 4) {
        return [null, Boolean(mask & RULE4.N), null, Boolean(mask & RULE4.W), true, Boolean(mask & RULE4.E), null, Boolean(mask & RULE4.S), null];
    }
    const corner = (bit: number, a: number, b: number) => ((mask & a) && (mask & b) ? Boolean(mask & bit) : null);
    return [
        corner(RULE8.NW, RULE8.N, RULE8.W), Boolean(mask & RULE8.N), corner(RULE8.NE, RULE8.N, RULE8.E),
        Boolean(mask & RULE8.W), true, Boolean(mask & RULE8.E),
        corner(RULE8.SW, RULE8.S, RULE8.W), Boolean(mask & RULE8.S), corner(RULE8.SE, RULE8.S, RULE8.E),
    ];
}

/** A rule tile's frames for the other neighbour count: every case keeps the frame of the case with the same sides. */
export function convertRuleFrames(rule: RuleTile, neighbors: 4 | 8): number[] {
    if (rule.neighbors === neighbors) return [...rule.frames];
    const sides = (mask: number) => (mask & RULE8.N ? RULE4.N : 0) | (mask & RULE8.E ? RULE4.E : 0) | (mask & RULE8.S ? RULE4.S : 0) | (mask & RULE8.W ? RULE4.W : 0);
    if (neighbors === 8) return BLOB_MASKS.map((mask) => rule.frames[sides(mask)] ?? -1);
    // 8 → 4: the case with those sides and every corner between them filled.
    return Array.from({ length: 16 }, (_, mask4) => {
        const blob = reduceBlobMask((mask4 & RULE4.N ? RULE8.N : 0) | (mask4 & RULE4.E ? RULE8.E : 0) | (mask4 & RULE4.S ? RULE8.S : 0) | (mask4 & RULE4.W ? RULE8.W : 0) | RULE8.NE | RULE8.SE | RULE8.SW | RULE8.NW);
        return rule.frames[BLOB_SLOT.get(blob) ?? 0] ?? -1;
    });
}
