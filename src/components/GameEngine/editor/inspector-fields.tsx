"use client";

/** Building blocks shared by the component editors in the Inspector. */
import { createContext, useContext } from "react";
import { KEY_CODES } from "@/lib/game-engine/script/stdlib";
import { UI_ANCHORS, type GameComponent, type GameEntity, type UIAnchor } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { applyValueChanges, diffValues, valueAt, writtenLeaf } from "./multi-edit";
import { findEntity, updateComponent } from "./operations";
import { useEditorState } from "./store";
import { SelectInput, cx } from "./ui";

export type Editor<T extends GameComponent> = { entity: GameEntity; component: T; disabled: boolean };

/** Undoable edit of one component field; quick successive edits of the same field merge into one undo step. */
export type ComponentEdit<T extends GameComponent> = (field: string, recipe: (draft: T) => void, label?: string) => void;

/**
 * While several objects are selected: for a component shown in the Inspector,
 * the same component on the other selected objects (see multi-edit.ts).
 */
export const MultiEditContext = createContext<ReadonlyMap<string, ReadonlyArray<{ entityId: string; componentId: string }>> | null>(null);

/** Returns an updater that writes to the component inside an undoable store update (and to the same component of every other selected object). */
export function useComponentEdit<T extends GameComponent>(entityId: string, component: T): ComponentEdit<T> {
    const { store, t } = useEditor();
    const multi = useContext(MultiEditContext);
    return (field: string, recipe: (draft: T) => void, label = t("hEditComponent")) => {
        const others = multi?.get(component.id) ?? [];
        if (!others.length) {
            store.update(label, (draft) => updateComponent<T>(draft, entityId, component.id, recipe), { mergeKey: `${component.id}:${field}` });
            return;
        }
        // Only what the recipe changed on this object is copied to the others.
        const current = findEntity(store.getState().project, entityId)?.components.find((item) => item.id === component.id);
        if (!current) return;
        const before = JSON.parse(JSON.stringify(current)) as T;
        const after = JSON.parse(JSON.stringify(current)) as T;
        recipe(after);
        const changes = diffValues(before, after);
        if (!changes.length) {
            // Same value as this object's: still make the others match.
            const leaf = writtenLeaf(current as T, recipe);
            if (leaf) changes.push({ path: leaf, value: valueAt(after, leaf) });
        }
        store.update(label, (draft) => {
            updateComponent<T>(draft, entityId, component.id, recipe);
            for (const other of others) updateComponent<GameComponent>(draft, other.entityId, other.componentId, (target) => applyValueChanges(target as unknown as Record<string, unknown>, changes));
        }, { mergeKey: `${component.id}:${field}:all` });
    };
}

const ANCHOR_LABELS: Record<UIAnchor, string> = {
    "top-left": "↖", top: "↑", "top-right": "↗", left: "←", center: "•", right: "→", "bottom-left": "↙", bottom: "↓", "bottom-right": "↘",
};

/** 3 × 3 anchor picker (Unity's anchor presets). */
export function AnchorInput({ value, onChange, disabled }: { value: UIAnchor; onChange: (anchor: UIAnchor) => void; disabled: boolean }) {
    return (
        <div className="grid w-[84px] grid-cols-3 gap-0.5" role="radiogroup">
            {UI_ANCHORS.map((anchor) => (
                <button
                    key={anchor}
                    type="button"
                    role="radio"
                    aria-checked={value === anchor}
                    disabled={disabled}
                    title={anchor}
                    aria-label={anchor}
                    onClick={() => onChange(anchor)}
                    className={cx("grid h-6 place-items-center rounded border text-[10px] leading-none transition", value === anchor ? "border-indigo-400 bg-indigo-500/40 text-white" : "border-white/10 bg-white/5 text-zinc-500 hover:bg-white/10")}
                >
                    {ANCHOR_LABELS[anchor]}
                </button>
            ))}
        </div>
    );
}

export function TextureSelect({ value, onChange, disabled }: { value: string | null; onChange: (value: string | null) => void; disabled: boolean }) {
    const { store, t } = useEditor();
    const textures = useEditorState(store, (state) => state.project.textures);
    return (
        <SelectInput
            value={value ?? ""}
            disabled={disabled}
            onChange={(next) => onChange(next || null)}
            options={[{ value: "", label: t("none") }, ...textures.map((texture) => ({ value: texture.id, label: texture.name }))]}
        />
    );
}

export function KeyCodeSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
    return <SelectInput value={value} disabled={disabled} onChange={onChange} options={KEY_CODES.map((key) => ({ value: key, label: key }))} />;
}
