"use client";

/** Building blocks shared by the component editors in the Inspector. */
import { KEY_CODES } from "@/lib/game-engine/script/stdlib";
import { UI_ANCHORS, type GameComponent, type GameEntity, type UIAnchor } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { updateComponent } from "./operations";
import { useEditorState } from "./store";
import { SelectInput, cx } from "./ui";

export type Editor<T extends GameComponent> = { entity: GameEntity; component: T; disabled: boolean };

/** Undoable edit of one component field; quick successive edits of the same field merge into one undo step. */
export type ComponentEdit<T extends GameComponent> = (field: string, recipe: (draft: T) => void, label?: string) => void;

/** Returns an updater that writes to the component inside an undoable store update. */
export function useComponentEdit<T extends GameComponent>(entityId: string, component: T): ComponentEdit<T> {
    const { store, t } = useEditor();
    return (field: string, recipe: (draft: T) => void, label = t("hEditComponent")) => {
        store.update(label, (draft) => updateComponent<T>(draft, entityId, component.id, recipe), { mergeKey: `${component.id}:${field}` });
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
