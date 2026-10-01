"use client";

/**
 * State of the tile painter shared by the Tilemap inspector and the Scene
 * view: whether painting is on, which tilemap is painted, the tool and the
 * brush tile. Kept outside the project document (painting itself goes
 * through the undoable editor store).
 */
import { useSyncExternalStore } from "react";

export type TileTool = "paint" | "erase" | "rect" | "pick";

export interface TilePainterState {
    active: boolean;
    entityId: string | null;
    tool: TileTool;
    /** Palette key of the brush tile. */
    brush: string | null;
}

export class TilePainterStore {
    private state: TilePainterState = { active: false, entityId: null, tool: "paint", brush: null };
    private readonly listeners = new Set<() => void>();

    getState = () => this.state;

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    set(patch: Partial<TilePainterState>) {
        const next = { ...this.state, ...patch };
        if ((Object.keys(next) as Array<keyof TilePainterState>).every((key) => next[key] === this.state[key])) return;
        this.state = next;
        for (const listener of this.listeners) listener();
    }

    start(entityId: string, brush: string | null) {
        this.set({ active: true, entityId, brush: brush ?? this.state.brush, tool: this.state.tool === "pick" ? "paint" : this.state.tool });
    }

    stop() {
        this.set({ active: false });
    }
}

export function useTilePainter<T>(store: TilePainterStore, selector: (state: TilePainterState) => T): T {
    return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}
