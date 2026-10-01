"use client";

/** Inspector editors of the V3 UI components: Button, Panel (Image) and Progress Bar. */
import { useId, useMemo } from "react";
import { PROGRESS_DIRECTIONS, type UIButtonComponent, type UIPanelComponent, type UIProgressBarComponent } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { AnchorInput, KeyCodeSelect, TextureSelect, useComponentEdit, type ComponentEdit, type Editor } from "./inspector-fields";
import { activeScene } from "./operations";
import { useEditorState } from "./store";
import { ColorInput, FieldRow, NumberInput, SelectInput, SliderInput, TextInput, Toggle, VectorInput, inputClass } from "./ui";

const LIFECYCLE = new Set(["Awake", "Start", "Update", "FixedUpdate", "LateUpdate", "OnEnable", "OnDisable", "OnDestroy", "OnGUI", "OnApplicationQuit", "OnApplicationPause"]);

/** Anchor, offset, size and draw order (shared by every rectangular UI component). */
function RectFields<T extends UIButtonComponent | UIPanelComponent | UIProgressBarComponent>({ edit, component, disabled }: {
    edit: ComponentEdit<T>;
    component: T;
    disabled: boolean;
}) {
    const { t } = useEditor();
    return (
        <>
            <FieldRow label={t("anchor")}>
                <AnchorInput value={component.anchor} disabled={disabled} onChange={(anchor) => edit("anchor", (draft) => { draft.anchor = anchor; })} />
            </FieldRow>
            <FieldRow label={t("offset")}>
                <VectorInput value={component.offset} hideZ step={1} disabled={disabled} onChange={(value) => edit("offset", (draft) => { draft.offset = { x: value.x, y: value.y }; })} />
            </FieldRow>
            <FieldRow label={t("size")}>
                <div className="grid grid-cols-2 gap-1">
                    <NumberInput label="W" value={component.width} min={0} max={4000} step={1} disabled={disabled} onChange={(width) => edit("width", (draft) => { draft.width = width; })} />
                    <NumberInput label="H" value={component.height} min={0} max={4000} step={1} disabled={disabled} onChange={(height) => edit("height", (draft) => { draft.height = height; })} />
                </div>
            </FieldRow>
            <FieldRow label={t("drawOrder")}>
                <NumberInput value={component.order} integer step={1} min={-1000} max={1000} disabled={disabled} onChange={(order) => edit("order", (draft) => { draft.order = order; })} />
            </FieldRow>
        </>
    );
}

export function UIButtonEditor({ entity, component, disabled }: Editor<UIButtonComponent>) {
    const { store, t, program } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const edit = useComponentEdit(entity.id, component);
    const listId = useId();
    const scene = activeScene(project);
    const targetId = component.onClick.targetId ?? entity.id;
    const methods = useMemo(() => {
        const target = scene.objects.find((item) => item.id === targetId);
        const names = new Set<string>();
        for (const item of target?.components ?? []) {
            if (item.type !== "script") continue;
            const className = item.className ?? (program.behavioursByScript.get(item.scriptId) ?? [])[0];
            for (let cls = className ? program.classes.get(className) ?? null : null; cls; cls = cls.base) {
                for (const [name, overloads] of cls.methods) {
                    if (!LIFECYCLE.has(name) && overloads.some((method) => !method.isConstructor && !method.isStatic && method.params.length === 0)) names.add(name);
                }
            }
        }
        return [...names].sort();
    }, [scene.objects, targetId, program]);
    return (
        <div className="space-y-0.5">
            <FieldRow label="Text">
                <TextInput value={component.text} maxLength={200} disabled={disabled} onChange={(text) => edit("text", (draft) => { draft.text = text; })} />
            </FieldRow>
            <FieldRow label="Font Size"><NumberInput value={component.fontSize} min={6} max={120} step={1} integer disabled={disabled} onChange={(value) => edit("fontSize", (draft) => { draft.fontSize = value; })} /></FieldRow>
            <FieldRow label={t("textColor")}><ColorInput value={component.textColor} disabled={disabled} onChange={(color) => edit("textColor", (draft) => { draft.textColor = color; })} /></FieldRow>
            <FieldRow label="Color"><ColorInput value={component.color} disabled={disabled} onChange={(color) => edit("color", (draft) => { draft.color = color; })} /></FieldRow>
            <FieldRow label={t("cornerRadius")}><SliderInput value={component.cornerRadius} min={0} max={60} step={1} integer disabled={disabled} onChange={(value) => edit("radius", (draft) => { draft.cornerRadius = value; })} /></FieldRow>
            <RectFields edit={edit} component={component} disabled={disabled} />
            <FieldRow label={t("interactable")}><Toggle checked={component.interactable} disabled={disabled} onChange={(value) => edit("interactable", (draft) => { draft.interactable = value; })} /></FieldRow>
            <FieldRow label={t("hotkey")}><KeyCodeSelect value={component.hotkey} disabled={disabled} onChange={(hotkey) => edit("hotkey", (draft) => { draft.hotkey = hotkey; })} /></FieldRow>
            <p className="pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("onClick")}</p>
            <FieldRow label={t("onClickTarget")}>
                <SelectInput
                    value={component.onClick.targetId ?? ""}
                    disabled={disabled}
                    onChange={(value) => edit("clickTarget", (draft) => { draft.onClick = { ...draft.onClick, targetId: value || null }; })}
                    options={[{ value: "", label: t("thisObject") }, ...scene.objects.filter((item) => item.id !== entity.id).map((item) => ({ value: item.id, label: item.name }))]}
                />
            </FieldRow>
            <FieldRow label={t("onClickMethod")}>
                <input
                    list={listId}
                    defaultValue={component.onClick.method}
                    key={`${component.id}:${component.onClick.method}`}
                    disabled={disabled}
                    maxLength={64}
                    placeholder="OnPlay"
                    onBlur={(event) => {
                        const method = event.target.value.trim();
                        if (method !== component.onClick.method && (method === "" || /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(method))) edit("clickMethod", (draft) => { draft.onClick = { ...draft.onClick, method }; });
                    }}
                    onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                    className={inputClass}
                />
                <datalist id={listId}>{methods.map((name) => <option key={name} value={name} />)}</datalist>
            </FieldRow>
            <p className="pt-1 text-[11px] leading-snug text-zinc-500">{t("onClickHint")}</p>
        </div>
    );
}

export function UIPanelEditor({ entity, component, disabled }: Editor<UIPanelComponent>) {
    const { t } = useEditor();
    const edit = useComponentEdit(entity.id, component);
    return (
        <div className="space-y-0.5">
            <FieldRow label="Color">
                <ColorInput value={component.color} disabled={disabled} onChange={(color) => edit("color", (draft) => { draft.color = color; })} allowAlpha alpha={component.opacity} onAlphaChange={(opacity) => edit("opacity", (draft) => { draft.opacity = opacity; })} />
            </FieldRow>
            <FieldRow label={t("image")}><TextureSelect value={component.textureId} disabled={disabled} onChange={(textureId) => edit("texture", (draft) => { draft.textureId = textureId; })} /></FieldRow>
            <FieldRow label={t("fullScreen")}><Toggle checked={component.fullScreen} disabled={disabled} onChange={(value) => edit("fullScreen", (draft) => { draft.fullScreen = value; })} /></FieldRow>
            {!component.fullScreen ? (
                <>
                    <FieldRow label={t("cornerRadius")}><SliderInput value={component.cornerRadius} min={0} max={80} step={1} integer disabled={disabled} onChange={(value) => edit("radius", (draft) => { draft.cornerRadius = value; })} /></FieldRow>
                    <RectFields edit={edit} component={component} disabled={disabled} />
                </>
            ) : (
                <FieldRow label={t("drawOrder")}><NumberInput value={component.order} integer step={1} min={-1000} max={1000} disabled={disabled} onChange={(order) => edit("order", (draft) => { draft.order = order; })} /></FieldRow>
            )}
            <FieldRow label={t("blocksClicks")}><Toggle checked={component.blocksClicks} disabled={disabled} onChange={(value) => edit("blocks", (draft) => { draft.blocksClicks = value; })} /></FieldRow>
        </div>
    );
}

export function UIProgressBarEditor({ entity, component, disabled }: Editor<UIProgressBarComponent>) {
    const { t } = useEditor();
    const edit = useComponentEdit(entity.id, component);
    const low = Math.min(component.min, component.max);
    const high = Math.max(component.min, component.max);
    return (
        <div className="space-y-0.5">
            <FieldRow label="Value">
                {high > low ? (
                    <SliderInput value={Math.min(high, Math.max(low, component.value))} min={low} max={high} step={(high - low) / 100} disabled={disabled} onChange={(value) => edit("value", (draft) => { draft.value = value; })} />
                ) : <NumberInput value={component.value} disabled={disabled} onChange={(value) => edit("value", (draft) => { draft.value = value; })} />}
            </FieldRow>
            <FieldRow label="Min / Max">
                <div className="grid grid-cols-2 gap-1">
                    <NumberInput value={component.min} disabled={disabled} onChange={(min) => edit("min", (draft) => { draft.min = min; })} />
                    <NumberInput value={component.max} disabled={disabled} onChange={(max) => edit("max", (draft) => { draft.max = max; })} />
                </div>
            </FieldRow>
            <FieldRow label={t("fillColor")}><ColorInput value={component.fillColor} disabled={disabled} onChange={(color) => edit("fill", (draft) => { draft.fillColor = color; })} /></FieldRow>
            <FieldRow label={t("background")}><ColorInput value={component.backgroundColor} disabled={disabled} onChange={(color) => edit("background", (draft) => { draft.backgroundColor = color; })} /></FieldRow>
            <FieldRow label={t("direction")}>
                <SelectInput value={component.direction} disabled={disabled} onChange={(direction) => edit("direction", (draft) => { draft.direction = direction; })} options={PROGRESS_DIRECTIONS.map((value) => ({ value, label: { leftToRight: "→", rightToLeft: "←", bottomToTop: "↑", topToBottom: "↓" }[value] }))} />
            </FieldRow>
            <FieldRow label={t("showLabel")}><Toggle checked={component.showLabel} disabled={disabled} onChange={(value) => edit("label", (draft) => { draft.showLabel = value; })} /></FieldRow>
            <FieldRow label={t("cornerRadius")}><SliderInput value={component.cornerRadius} min={0} max={40} step={1} integer disabled={disabled} onChange={(value) => edit("radius", (draft) => { draft.cornerRadius = value; })} /></FieldRow>
            <RectFields edit={edit} component={component} disabled={disabled} />
        </div>
    );
}
