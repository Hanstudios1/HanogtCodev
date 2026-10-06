"use client";

/**
 * Editor state container: the project document (immutable, updated with
 * immer), selection and snapshot based undo/redo with change coalescing.
 */
import { produce, setAutoFreeze } from "immer";
import { useSyncExternalStore } from "react";
import type { GameProjectDocument, SceneDocument } from "@/lib/game-engine/types";

// Runtime systems clone what they mutate, but freezing large documents on every
// keystroke costs more than it protects here.
setAutoFreeze(false);

export type AssetRef = { kind: "script" | "prefab" | "texture" | "scene" | "audio" | "model"; id: string };

export interface EditorState {
    project: GameProjectDocument;
    selection: string[];
    selectedAsset: AssetRef | null;
    /** Incremented on every document change (autosave trigger). */
    revision: number;
    /** Revision that was last persisted. */
    savedRevision: number;
    canUndo: boolean;
    canRedo: boolean;
    undoLabel: string | null;
    redoLabel: string | null;
}

interface HistoryEntry {
    project: GameProjectDocument;
    selection: string[];
    label: string;
    mergeKey?: string;
    time: number;
}

const HISTORY_LIMIT = 150;
const MERGE_WINDOW_MS = 900;

export class EditorStore {
    private state: EditorState;
    private readonly listeners = new Set<() => void>();
    private past: HistoryEntry[] = [];
    private future: HistoryEntry[] = [];

    constructor(project: GameProjectDocument) {
        this.state = {
            project,
            selection: [],
            selectedAsset: null,
            revision: 0,
            savedRevision: 0,
            canUndo: false,
            canRedo: false,
            undoLabel: null,
            redoLabel: null,
        };
    }

    getState = () => this.state;

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private set(patch: Partial<EditorState>) {
        this.state = {
            ...this.state,
            ...patch,
            canUndo: this.past.length > 0,
            canRedo: this.future.length > 0,
            undoLabel: this.past[this.past.length - 1]?.label ?? null,
            redoLabel: this.future[this.future.length - 1]?.label ?? null,
        };
        for (const listener of this.listeners) listener();
    }

    get project() {
        return this.state.project;
    }

    get activeScene(): SceneDocument {
        const project = this.state.project;
        return project.scenes.find((scene) => scene.id === project.activeSceneId) ?? project.scenes[0];
    }

    /**
     * Applies a change to the project. Changes with the same `mergeKey` that
     * happen in quick succession (dragging a slider, typing) form one undo step.
     */
    update(label: string, recipe: (draft: GameProjectDocument) => void, options: { mergeKey?: string; selection?: string[]; history?: boolean } = {}) {
        const current = this.state.project;
        const next = produce(current, (draft) => {
            recipe(draft);
        });
        if (next === current) {
            if (options.selection) this.setSelection(options.selection);
            return;
        }
        if (options.history !== false) {
            const now = Date.now();
            const last = this.past[this.past.length - 1];
            if (options.mergeKey && last?.mergeKey === options.mergeKey && now - last.time < MERGE_WINDOW_MS) {
                last.time = now;
            } else {
                this.past.push({ project: current, selection: this.state.selection, label, mergeKey: options.mergeKey, time: now });
                if (this.past.length > HISTORY_LIMIT) this.past.shift();
            }
            this.future = [];
        }
        const scene = next.scenes.find((item) => item.id === next.activeSceneId) ?? next.scenes[0];
        const ids = new Set(scene.objects.map((entity) => entity.id));
        const selection = (options.selection ?? this.state.selection).filter((id) => ids.has(id));
        this.set({ project: next, selection, revision: this.state.revision + 1 });
    }

    /** Ends the current merge group so the next change starts a new undo step. */
    breakMerge() {
        const last = this.past[this.past.length - 1];
        if (last) last.mergeKey = undefined;
    }

    undo() {
        const entry = this.past.pop();
        if (!entry) return;
        this.future.push({ project: this.state.project, selection: this.state.selection, label: entry.label, time: Date.now() });
        this.set({ project: entry.project, selection: entry.selection, revision: this.state.revision + 1 });
    }

    redo() {
        const entry = this.future.pop();
        if (!entry) return;
        this.past.push({ project: this.state.project, selection: this.state.selection, label: entry.label, time: Date.now() });
        this.set({ project: entry.project, selection: entry.selection, revision: this.state.revision + 1 });
    }

    setSelection(ids: string[]) {
        const same = ids.length === this.state.selection.length && ids.every((id, index) => id === this.state.selection[index]);
        if (same) return;
        this.set({ selection: ids, selectedAsset: ids.length ? null : this.state.selectedAsset });
    }

    selectAsset(asset: AssetRef | null) {
        this.set({ selectedAsset: asset, selection: asset ? [] : this.state.selection });
    }

    /** Replaces the whole document (load/import). */
    replaceProject(project: GameProjectDocument, options: { resetHistory?: boolean; markSaved?: boolean } = {}) {
        if (options.resetHistory) {
            this.past = [];
            this.future = [];
        }
        const revision = this.state.revision + 1;
        this.set({ project, selection: [], selectedAsset: null, revision, savedRevision: options.markSaved ? revision : this.state.savedRevision });
    }

    markSaved(revision: number) {
        if (revision > this.state.savedRevision) this.set({ savedRevision: revision });
    }
}

export function useEditorState<T>(store: EditorStore, selector: (state: EditorState) => T): T {
    return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}
