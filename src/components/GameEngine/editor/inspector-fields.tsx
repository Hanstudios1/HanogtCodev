"use client";

/** Building blocks shared by the component editors in the Inspector. */
import { Check, ChevronDown } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ALL_LAYERS, describeLayerMask } from "@/lib/game-engine/layers";
import { KEY_CODES } from "@/lib/game-engine/script/stdlib";
import { MAX_LAYERS, UI_ANCHORS, type GameComponent, type GameEntity, type UIAnchor } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { openSettings } from "./settings-events";
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

/** "Edit layers…" opens Project settings → Layers. */
const EDIT_LAYERS = "__edit_layers__";

/** An object's physics layer (V6): the named layers, its own layer if it has no name, and a link to the Layers tab. */
export function LayerSelect({ value, onChange, disabled, mixed }: { value: number; onChange: (layer: number) => void; disabled: boolean; mixed?: boolean }) {
    const { store, t } = useEditor();
    const names = useEditorState(store, (state) => state.project.settings.layers.names);
    const options = names.map((name, layer) => ({ value: String(layer), label: `${layer}: ${name || t("layerUnnamed")}`, named: Boolean(name) }))
        .filter((option) => option.named || Number(option.value) === value)
        .map(({ value: layer, label }) => ({ value: layer, label }));
    return (
        <SelectInput
            value={mixed ? "" : String(value)}
            disabled={disabled}
            onChange={(next) => {
                if (next === EDIT_LAYERS) openSettings("layers");
                else if (next !== "") onChange(Number(next));
            }}
            options={[...(mixed ? [{ value: "", label: "—" }] : []), ...options, { value: EDIT_LAYERS, label: t("editLayers") }]}
        />
    );
}

/** A LayerMask script field (V6): tick the layers the mask contains. */
export function LayerMaskInput({ value, onChange, disabled }: { value: number; onChange: (mask: number) => void; disabled: boolean }) {
    const { store, t } = useEditor();
    const names = useEditorState(store, (state) => state.project.settings.layers.names);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node)) setOpen(false);
        };
        window.addEventListener("pointerdown", onDown);
        return () => window.removeEventListener("pointerdown", onDown);
    }, [open]);
    const mask = value & ALL_LAYERS;
    const label = mask === ALL_LAYERS ? t("layerMaskEverything") : mask === 0 ? t("layerMaskNothing") : describeLayerMask(names, mask);
    const row = (key: string, text: string, checked: boolean, next: number) => (
        <button key={key} type="button" role="menuitemcheckbox" aria-checked={checked} onClick={() => onChange(next)} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-zinc-200 hover:bg-white/[0.07]">
            <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded border border-white/20">{checked ? <Check className="h-3 w-3 text-indigo-300" /> : null}</span>
            <span className="truncate">{text}</span>
        </button>
    );
    return (
        <div ref={ref} className="relative">
            <button type="button" disabled={disabled} onClick={() => setOpen(!open)} className={cx("flex h-7 w-full items-center justify-between gap-1 rounded-md border border-white/10 bg-zinc-950/70 px-2 text-left text-[12px] text-zinc-100 hover:border-white/20 disabled:opacity-50")}>
                <span className="truncate">{label}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            </button>
            {open ? (
                <div role="menu" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-2xl shadow-black/50">
                    {row("nothing", t("layerMaskNothing"), mask === 0, 0)}
                    {row("everything", t("layerMaskEverything"), mask === ALL_LAYERS, -1)}
                    <div className="my-1 h-px bg-white/[0.07]" />
                    {Array.from({ length: MAX_LAYERS }, (_, layer) => layer).filter((layer) => names[layer] || mask & (1 << layer)).map((layer) => {
                        const bit = 1 << layer;
                        const checked = (mask & bit) !== 0;
                        return row(String(layer), `${layer}: ${names[layer] || t("layerUnnamed")}`, checked, checked ? mask & ~bit : mask | bit);
                    })}
                    <div className="my-1 h-px bg-white/[0.07]" />
                    <button type="button" onClick={() => { setOpen(false); openSettings("layers"); }} className="flex h-7 w-full items-center rounded-md px-2 text-left text-[12px] text-indigo-300 hover:bg-white/[0.07]">{t("editLayers")}</button>
                </div>
            ) : null}
        </div>
    );
}
