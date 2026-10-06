"use client";

/** Inspector editors of the UI components: Button, Panel (Image), Progress Bar and the V4 Slider, Toggle and Input Field. */
import { useId, useMemo } from "react";
import {
    INPUT_CONTENT_TYPES,
    PROGRESS_DIRECTIONS,
    TOGGLE_STYLES,
    type GameEntity,
    type UIButtonComponent,
    type UIEventTarget,
    type UIInputFieldComponent,
    type UIPanelComponent,
    type UIProgressBarComponent,
    type UISliderComponent,
    type UIToggleComponent,
} from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { AnchorInput, KeyCodeSelect, TextureSelect, useComponentEdit, type ComponentEdit, type Editor } from "./inspector-fields";
import { LocalizationKeyField } from "./LocalizationPanel";
import { activeScene } from "./operations";
import { useEditorState } from "./store";
import { ColorInput, FieldRow, NumberInput, SelectInput, SliderInput, TextInput, Toggle, VectorInput, inputClass } from "./ui";

const LIFECYCLE = new Set(["Awake", "Start", "Update", "FixedUpdate", "LateUpdate", "OnEnable", "OnDisable", "OnDestroy", "OnGUI", "OnApplicationQuit", "OnApplicationPause"]);

/** Anchor, offset, size and draw order (shared by every rectangular UI component). */
function RectFields<T extends UIButtonComponent | UIPanelComponent | UIProgressBarComponent | UISliderComponent | UIToggleComponent | UIInputFieldComponent>({ edit, component, disabled }: {
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
            <FieldRow label={t("localizationKey")} title={t("localizationKeyHint")}>
                <LocalizationKeyField value={component.localizationKey} text={component.text} disabled={disabled} onChange={(key, preview) => edit("localizationKey", (draft) => { draft.localizationKey = key; if (preview !== null) draft.text = preview.slice(0, 200); })} />
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

/** Script methods on an object that take no parameter or one (the UI value). */
function useTargetMethods(entityId: string, target: UIEventTarget, maxParams: number) {
    const { store, program } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const scene = activeScene(project);
    const targetId = target.targetId ?? entityId;
    return useMemo(() => {
        const found = scene.objects.find((item) => item.id === targetId);
        const names = new Set<string>();
        for (const item of found?.components ?? []) {
            if (item.type !== "script") continue;
            const className = item.className ?? (program.behavioursByScript.get(item.scriptId) ?? [])[0];
            for (let cls = className ? program.classes.get(className) ?? null : null; cls; cls = cls.base) {
                for (const [name, overloads] of cls.methods) {
                    if (!LIFECYCLE.has(name) && overloads.some((method) => !method.isConstructor && !method.isStatic && method.params.length <= maxParams)) names.add(name);
                }
            }
        }
        return [...names].sort();
    }, [scene.objects, targetId, program, maxParams]);
}

/** Target object and method of a UI event (e.g. "On Value Changed (float)"). */
function EventTargetFields({ entity, title, target, disabled, onChange }: {
    entity: GameEntity;
    title: string;
    target: UIEventTarget;
    disabled: boolean;
    onChange: (next: UIEventTarget) => void;
}) {
    const { store, t } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const scene = activeScene(project);
    const listId = useId();
    const methods = useTargetMethods(entity.id, target, 1);
    return (
        <>
            <p className="pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{title}</p>
            <FieldRow label={t("onClickTarget")}>
                <SelectInput
                    value={target.targetId ?? ""}
                    disabled={disabled}
                    onChange={(value) => onChange({ ...target, targetId: value || null })}
                    options={[{ value: "", label: t("thisObject") }, ...scene.objects.filter((item) => item.id !== entity.id).map((item) => ({ value: item.id, label: item.name }))]}
                />
            </FieldRow>
            <FieldRow label={t("onClickMethod")}>
                <input
                    list={listId}
                    defaultValue={target.method}
                    key={`${entity.id}:${title}:${target.method}`}
                    disabled={disabled}
                    maxLength={64}
                    placeholder="OnValueChanged"
                    onBlur={(event) => {
                        const method = event.target.value.trim();
                        if (method !== target.method && (method === "" || /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(method))) onChange({ ...target, method });
                    }}
                    onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                    className={inputClass}
                />
                <datalist id={listId}>{methods.map((name) => <option key={name} value={name} />)}</datalist>
            </FieldRow>
        </>
    );
}

export function UISliderEditor({ entity, component, disabled }: Editor<UISliderComponent>) {
    const { t } = useEditor();
    const edit = useComponentEdit(entity.id, component);
    const low = Math.min(component.min, component.max);
    const high = Math.max(component.min, component.max);
    return (
        <div className="space-y-0.5" data-ui-slider-editor>
            <FieldRow label="Value">
                {high > low ? (
                    <SliderInput value={Math.min(high, Math.max(low, component.value))} min={low} max={high} step={component.wholeNumbers ? 1 : (high - low) / 100} integer={component.wholeNumbers} disabled={disabled} onChange={(value) => edit("value", (draft) => { draft.value = value; })} />
                ) : <NumberInput value={component.value} disabled={disabled} onChange={(value) => edit("value", (draft) => { draft.value = value; })} />}
            </FieldRow>
            <FieldRow label="Min / Max">
                <div className="grid grid-cols-2 gap-1">
                    <NumberInput value={component.min} disabled={disabled} onChange={(min) => edit("min", (draft) => { draft.min = min; draft.value = Math.min(Math.max(min, draft.max), Math.max(Math.min(min, draft.max), draft.value)); })} />
                    <NumberInput value={component.max} disabled={disabled} onChange={(max) => edit("max", (draft) => { draft.max = max; draft.value = Math.min(Math.max(draft.min, max), Math.max(Math.min(draft.min, max), draft.value)); })} />
                </div>
            </FieldRow>
            <FieldRow label="Whole Numbers"><Toggle checked={component.wholeNumbers} disabled={disabled} onChange={(value) => edit("whole", (draft) => { draft.wholeNumbers = value; if (value) draft.value = Math.round(draft.value); })} /></FieldRow>
            <FieldRow label={t("direction")}>
                <SelectInput value={component.direction} disabled={disabled} onChange={(direction) => edit("direction", (draft) => { draft.direction = direction; })} options={PROGRESS_DIRECTIONS.map((value) => ({ value, label: { leftToRight: "→", rightToLeft: "←", bottomToTop: "↑", topToBottom: "↓" }[value] }))} />
            </FieldRow>
            <FieldRow label={t("fillColor")}><ColorInput value={component.fillColor} disabled={disabled} onChange={(color) => edit("fill", (draft) => { draft.fillColor = color; })} /></FieldRow>
            <FieldRow label={t("background")}><ColorInput value={component.backgroundColor} disabled={disabled} onChange={(color) => edit("background", (draft) => { draft.backgroundColor = color; })} /></FieldRow>
            <FieldRow label="Handle"><ColorInput value={component.handleColor} disabled={disabled} onChange={(color) => edit("handle", (draft) => { draft.handleColor = color; })} /></FieldRow>
            <FieldRow label={t("uiShowValue")}><Toggle checked={component.showValue} disabled={disabled} onChange={(value) => edit("showValue", (draft) => { draft.showValue = value; })} /></FieldRow>
            <FieldRow label={t("interactable")}><Toggle checked={component.interactable} disabled={disabled} onChange={(value) => edit("interactable", (draft) => { draft.interactable = value; })} /></FieldRow>
            <RectFields edit={edit} component={component} disabled={disabled} />
            <EventTargetFields entity={entity} title={`${t("uiOnValueChanged")} (float)`} target={component.onValueChanged} disabled={disabled} onChange={(next) => edit("onValueChanged", (draft) => { draft.onValueChanged = next; })} />
            <p className="pt-1 text-[11px] leading-snug text-zinc-500">{t("uiSliderHint")}</p>
        </div>
    );
}

export function UIToggleEditor({ entity, component, disabled }: Editor<UIToggleComponent>) {
    const { t } = useEditor();
    const edit = useComponentEdit(entity.id, component);
    return (
        <div className="space-y-0.5" data-ui-toggle-editor>
            <FieldRow label="Is On"><Toggle checked={component.isOn} disabled={disabled} onChange={(value) => edit("isOn", (draft) => { draft.isOn = value; })} /></FieldRow>
            <FieldRow label="Label"><TextInput value={component.label} maxLength={200} disabled={disabled} onChange={(label) => edit("label", (draft) => { draft.label = label; })} /></FieldRow>
            <FieldRow label={t("localizationKey")} title={t("localizationKeyHint")}>
                <LocalizationKeyField value={component.localizationKey} text={component.label} disabled={disabled} onChange={(key, preview) => edit("localizationKey", (draft) => { draft.localizationKey = key; if (preview !== null) draft.label = preview.slice(0, 200); })} />
            </FieldRow>
            <FieldRow label={t("uiToggleStyle")}>
                <SelectInput value={component.style} disabled={disabled} onChange={(style) => edit("style", (draft) => { draft.style = style; })} options={TOGGLE_STYLES.map((value) => ({ value, label: value === "switch" ? t("uiStyleSwitch") : t("uiStyleCheckbox") }))} />
            </FieldRow>
            <FieldRow label="Font Size"><NumberInput value={component.fontSize} min={6} max={120} step={1} integer disabled={disabled} onChange={(value) => edit("fontSize", (draft) => { draft.fontSize = value; })} /></FieldRow>
            <FieldRow label={t("textColor")}><ColorInput value={component.textColor} disabled={disabled} onChange={(color) => edit("textColor", (draft) => { draft.textColor = color; })} /></FieldRow>
            <FieldRow label="Off Color"><ColorInput value={component.color} disabled={disabled} onChange={(color) => edit("color", (draft) => { draft.color = color; })} /></FieldRow>
            <FieldRow label="On Color"><ColorInput value={component.checkColor} disabled={disabled} onChange={(color) => edit("checkColor", (draft) => { draft.checkColor = color; })} /></FieldRow>
            <FieldRow label={t("interactable")}><Toggle checked={component.interactable} disabled={disabled} onChange={(value) => edit("interactable", (draft) => { draft.interactable = value; })} /></FieldRow>
            <RectFields edit={edit} component={component} disabled={disabled} />
            <EventTargetFields entity={entity} title={`${t("uiOnValueChanged")} (bool)`} target={component.onValueChanged} disabled={disabled} onChange={(next) => edit("onValueChanged", (draft) => { draft.onValueChanged = next; })} />
        </div>
    );
}

export function UIInputFieldEditor({ entity, component, disabled }: Editor<UIInputFieldComponent>) {
    const { t } = useEditor();
    const edit = useComponentEdit(entity.id, component);
    return (
        <div className="space-y-0.5" data-ui-input-editor>
            <FieldRow label="Text"><TextInput value={component.text} maxLength={component.characterLimit} disabled={disabled} onChange={(text) => edit("text", (draft) => { draft.text = text.slice(0, draft.characterLimit); })} /></FieldRow>
            <FieldRow label="Placeholder"><TextInput value={component.placeholder} maxLength={200} disabled={disabled} onChange={(placeholder) => edit("placeholder", (draft) => { draft.placeholder = placeholder; })} /></FieldRow>
            <FieldRow label={t("localizationKey")} title={t("localizationKeyHint")}>
                <LocalizationKeyField value={component.localizationKey} text={component.placeholder} disabled={disabled} onChange={(key, preview) => edit("localizationKey", (draft) => { draft.localizationKey = key; if (preview !== null) draft.placeholder = preview.slice(0, 200); })} />
            </FieldRow>
            <FieldRow label="Content Type">
                <SelectInput value={component.contentType} disabled={disabled} onChange={(contentType) => edit("contentType", (draft) => { draft.contentType = contentType; })} options={INPUT_CONTENT_TYPES.map((value) => ({ value, label: value }))} />
            </FieldRow>
            <FieldRow label="Character Limit"><NumberInput value={component.characterLimit} min={1} max={200} integer step={1} disabled={disabled} onChange={(value) => edit("limit", (draft) => { draft.characterLimit = value; draft.text = draft.text.slice(0, value); })} /></FieldRow>
            <FieldRow label="Font Size"><NumberInput value={component.fontSize} min={6} max={120} step={1} integer disabled={disabled} onChange={(value) => edit("fontSize", (draft) => { draft.fontSize = value; })} /></FieldRow>
            <FieldRow label={t("textColor")}><ColorInput value={component.textColor} disabled={disabled} onChange={(color) => edit("textColor", (draft) => { draft.textColor = color; })} /></FieldRow>
            <FieldRow label={t("background")}><ColorInput value={component.backgroundColor} disabled={disabled} onChange={(color) => edit("background", (draft) => { draft.backgroundColor = color; })} /></FieldRow>
            <FieldRow label="Border"><ColorInput value={component.borderColor} disabled={disabled} onChange={(color) => edit("border", (draft) => { draft.borderColor = color; })} /></FieldRow>
            <FieldRow label={t("interactable")}><Toggle checked={component.interactable} disabled={disabled} onChange={(value) => edit("interactable", (draft) => { draft.interactable = value; })} /></FieldRow>
            <RectFields edit={edit} component={component} disabled={disabled} />
            <EventTargetFields entity={entity} title={`${t("uiOnValueChanged")} (string)`} target={component.onValueChanged} disabled={disabled} onChange={(next) => edit("onValueChanged", (draft) => { draft.onValueChanged = next; })} />
            <EventTargetFields entity={entity} title={`${t("uiOnEndEdit")} (string)`} target={component.onEndEdit} disabled={disabled} onChange={(next) => edit("onEndEdit", (draft) => { draft.onEndEdit = next; })} />
            <p className="pt-1 text-[11px] leading-snug text-zinc-500">{t("uiInputHint")}</p>
        </div>
    );
}

