/**
 * Physics layers and the collision matrix (V6). Shared by the schema, the
 * physics world, the script API (LayerMask, Physics.IgnoreLayerCollision) and
 * the editor's Layers panel.
 */
import { MAX_LAYERS, type LayerSettings } from "./types";

/** Every layer's bit. */
export const ALL_LAYERS = (1 << MAX_LAYERS) - 1;

/** A layer with this name is skipped by raycasts that pass no layer mask (Unity's Ignore Raycast). */
export const IGNORE_RAYCAST_LAYER = "Ignore Raycast";

/** Letters, digits, spaces and _ - . (no quotes or commas, so names read well in code and menus). */
const LAYER_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,31}$/u;

export function defaultLayerSettings(): LayerSettings {
    return { names: ["Default", ...Array.from({ length: MAX_LAYERS - 1 }, () => "")], collisions: Array.from({ length: MAX_LAYERS }, () => ALL_LAYERS) };
}

export function cleanLayerName(value: unknown): string {
    if (typeof value !== "string") return "";
    const name = value.replace(/\s+/g, " ").trim().slice(0, 32);
    return LAYER_NAME.test(name) ? name : "";
}

/**
 * Valid names (layer 0 is "Default", a name is used once ignoring case) and a
 * symmetric matrix: a pair collides only when both of its rows say so.
 */
export function normalizeLayerSettings(value: unknown): LayerSettings {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const rawNames = Array.isArray(source.names) ? source.names : [];
    const names: string[] = ["Default"];
    const taken = new Set(["default"]);
    for (let layer = 1; layer < MAX_LAYERS; layer += 1) {
        const name = cleanLayerName(rawNames[layer]);
        if (!name || taken.has(name.toLocaleLowerCase("tr"))) {
            names.push("");
            continue;
        }
        taken.add(name.toLocaleLowerCase("tr"));
        names.push(name);
    }
    const rawRows = Array.isArray(source.collisions) ? source.collisions : [];
    const rows = Array.from({ length: MAX_LAYERS }, (_, layer) => {
        const row = rawRows[layer];
        return typeof row === "number" && Number.isFinite(row) ? Math.trunc(row) & ALL_LAYERS : ALL_LAYERS;
    });
    const collisions = rows.map((row, a) => {
        let symmetric = 0;
        for (let b = 0; b < MAX_LAYERS; b += 1) if ((row & (1 << b)) && (rows[b] & (1 << a))) symmetric |= 1 << b;
        return symmetric;
    });
    return { names, collisions };
}

/** A layer number 0–15 (anything else is the Default layer). */
export function clampLayer(value: unknown): number {
    const layer = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
    return layer >= 0 && layer < MAX_LAYERS ? layer : 0;
}

export function layersCollide(collisions: readonly number[], a: number, b: number): boolean {
    return ((collisions[a] ?? ALL_LAYERS) & (1 << b)) !== 0;
}

/** Turns a pair of the matrix on or off (both rows, so it stays symmetric). */
export function setLayerCollision(collisions: number[], a: number, b: number, collide: boolean) {
    if (a < 0 || b < 0 || a >= MAX_LAYERS || b >= MAX_LAYERS) return;
    if (collide) {
        collisions[a] |= 1 << b;
        collisions[b] |= 1 << a;
    } else {
        collisions[a] &= ~(1 << b);
        collisions[b] &= ~(1 << a);
    }
}

/** The layer of a name (ignoring case), or -1. */
export function layerOfName(names: readonly string[], name: string): number {
    const wanted = name.trim().toLocaleLowerCase("tr");
    if (!wanted) return -1;
    return names.findIndex((candidate) => candidate && candidate.toLocaleLowerCase("tr") === wanted);
}

/** What a raycast without a layer mask hits: every layer except one named IGNORE_RAYCAST_LAYER. */
export function defaultRaycastMask(names: readonly string[]): number {
    const ignored = layerOfName(names, IGNORE_RAYCAST_LAYER);
    return ignored >= 0 ? ALL_LAYERS & ~(1 << ignored) : ALL_LAYERS;
}

/** "Default, Enemy" for a mask (the editor's LayerMask fields and the Layers panel). */
export function describeLayerMask(names: readonly string[], mask: number): string {
    if ((mask & ALL_LAYERS) === ALL_LAYERS) return "Everything";
    if ((mask & ALL_LAYERS) === 0) return "Nothing";
    const parts: string[] = [];
    for (let layer = 0; layer < MAX_LAYERS; layer += 1) if (mask & (1 << layer)) parts.push(names[layer] || `Layer ${layer}`);
    return parts.join(", ");
}
