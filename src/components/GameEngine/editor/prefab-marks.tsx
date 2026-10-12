"use client";

/**
 * Which fields of the inspected object override its prefab (V6), for the
 * editors that mark them (Transform, script fields, the object's header).
 */
import { createContext, useContext } from "react";
import { componentKey } from "@/lib/game-engine/prefab-links";
import type { GameComponent, GameEntity } from "@/lib/game-engine/types";

export const PrefabMarksContext = createContext<{ entity: GameEntity; paths: readonly string[] } | null>(null);

/** `marked(component, "scale")` is true when that field (or something inside it) differs from the prefab. */
export function usePrefabMarks(): (component: GameComponent, field?: string) => boolean {
    const context = useContext(PrefabMarksContext);
    return (component, field) => {
        if (!context) return false;
        const key = componentKey(context.entity, component);
        const prefix = field ? `${key}.${field}` : key;
        return context.paths.some((path) => path === prefix || path.startsWith(`${prefix}.`) || (!field && path === `+${key}`));
    };
}
