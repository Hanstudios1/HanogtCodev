"use client";

/** Inspector of the Animation component: clips, tracks and keyframes with easing. */
import { ChevronDown, ChevronRight, Film, Plus, Trash2, X, Zap } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { animationPreset, type AnimationPreset } from "@/lib/game-engine/animation";
import { ANIMATION_EVENT_PARAMETERS, ANIMATION_PROPERTIES, EASINGS, type AnimationClip, type AnimationComponent, type AnimationEvent, type AnimationEventParameter, type AnimationKey, type AnimationProperty, type AnimationValue, type Vector3 } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { useComponentEdit, type Editor } from "./inspector-fields";
import { useEditorState } from "./store";
import type { TextKey } from "./text";
import { scriptMethodNames } from "./UIEditors";
import { Button, ColorInput, Dropdown, FieldRow, IconButton, NumberInput, SelectInput, SliderInput, TextInput, Toggle, VectorInput, inputClass, type MenuItem } from "./ui";

const EVENT_PARAMETER_LABELS: Record<AnimationEventParameter, TextKey> = {
    none: "animEventNoParameter",
    float: "animEventFloat",
    int: "animEventInt",
    string: "animEventString",
};

/** Animation events of a clip (V6): a timeline of markers and one row per event. */
function ClipEvents({ clip, edit, disabled, methods }: {
    clip: AnimationClip;
    edit: (field: string, recipe: (clip: AnimationClip) => void) => void;
    disabled: boolean;
    methods: string[];
}) {
    const { t } = useEditor();
    const listId = useId();
    const events = clip.events ?? [];
    const duration = Math.max(0.01, clip.duration);
    const update = (index: number, field: string, recipe: (event: AnimationEvent) => void, sort = false) => edit(`event:${index}:${field}`, (draft) => {
        const event = draft.events?.[index];
        if (!event) return;
        recipe(event);
        if (sort) draft.events?.sort((a, b) => a.time - b.time);
    });
    return (
        <div className="mt-1.5 rounded-md border border-white/[0.06] bg-black/20 p-1.5">
            <div className="mb-1 flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-300" />
                <span className="flex-1 text-[11px] font-bold text-zinc-300">{t("animEvents")}</span>
                <IconButton icon={Plus} label={t("animAddEvent")} size="sm" disabled={disabled || events.length >= 32} onClick={() => edit("event:add", (draft) => {
                    const list = draft.events ?? [];
                    const last = list[list.length - 1];
                    list.push({ time: Math.min(draft.duration, last ? Math.round((last.time + draft.duration / 4) * 100) / 100 : Math.round(draft.duration * 50) / 100), method: methods[0] ?? "", parameter: "none", value: "" });
                    list.sort((a, b) => a.time - b.time);
                    draft.events = list;
                })} />
            </div>
            <div className="relative mx-1 mb-1 h-3 rounded-sm bg-white/[0.06]" aria-hidden="true">
                {events.map((event, index) => (
                    <span key={index} title={`${event.time}s · ${event.method}`} className="absolute top-0 h-3 w-[3px] rounded-sm bg-amber-300" style={{ left: `calc(${Math.min(100, (event.time / duration) * 100)}% - 1px)` }} />
                ))}
            </div>
            {events.map((event, index) => (
                <div key={`${index}:${event.time}:${event.method}`} className="mb-1 space-y-1 rounded border border-white/[0.05] p-1">
                    <div className="grid grid-cols-[64px_1fr_24px] items-center gap-1">
                        <NumberInput label="t" value={event.time} min={0} max={clip.duration} step={0.05} disabled={disabled} onChange={(time) => update(index, "time", (draft) => { draft.time = Math.min(clip.duration, Math.max(0, time)); }, true)} />
                        <input
                            list={listId}
                            defaultValue={event.method}
                            disabled={disabled}
                            maxLength={64}
                            placeholder={t("animEventMethod")}
                            aria-label={t("animEventMethod")}
                            onBlur={(change) => {
                                const method = change.target.value.trim();
                                if (method !== event.method && (method === "" || /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(method))) update(index, "method", (draft) => { draft.method = method; });
                                else change.target.value = event.method;
                            }}
                            onKeyDown={(key) => { if (key.key === "Enter") (key.target as HTMLInputElement).blur(); }}
                            className={inputClass}
                        />
                        <IconButton icon={X} label={t("animRemoveEvent")} size="sm" tone="danger" disabled={disabled} onClick={() => edit(`event:${index}:remove`, (draft) => { draft.events?.splice(index, 1); })} />
                    </div>
                    <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-1">
                        <SelectInput<AnimationEventParameter>
                            value={event.parameter}
                            disabled={disabled}
                            onChange={(parameter) => update(index, "parameter", (draft) => {
                                draft.parameter = parameter;
                                draft.value = parameter === "string" ? "" : 0;
                            })}
                            options={ANIMATION_EVENT_PARAMETERS.map((parameter) => ({ value: parameter, label: t(EVENT_PARAMETER_LABELS[parameter]) }))}
                        />
                        {event.parameter === "string"
                            ? <TextInput value={String(event.value)} maxLength={200} disabled={disabled} onChange={(value) => update(index, "value", (draft) => { draft.value = value.slice(0, 200); })} />
                            : event.parameter !== "none"
                                ? <NumberInput value={Number(event.value) || 0} integer={event.parameter === "int"} step={event.parameter === "int" ? 1 : 0.1} disabled={disabled} onChange={(value) => update(index, "value", (draft) => { draft.value = event.parameter === "int" ? Math.round(value) : value; })} />
                                : <span />}
                    </div>
                </div>
            ))}
            <datalist id={listId}>{methods.map((name) => <option key={name} value={name} />)}</datalist>
            <p className="px-0.5 text-[10.5px] leading-snug text-zinc-500">{t("animEventsHint")}</p>
        </div>
    );
}

const TRACK_LABELS: Record<AnimationProperty, TextKey> = {
    position: "trackPosition",
    rotation: "trackRotation",
    scale: "trackScale",
    color: "trackColor",
    opacity: "trackOpacity",
    frame: "trackFrame",
};

const PRESET_LABELS: Record<AnimationPreset, TextKey> = {
    bob: "presetBob",
    spin: "presetSpin",
    pulse: "presetPulse",
    shake: "presetShake",
    fadeOut: "presetFadeOut",
    flash: "presetFlash",
    frames: "presetFrames",
};

function defaultValue(property: AnimationProperty): AnimationValue {
    switch (property) {
        case "position":
        case "rotation":
            return { x: 0, y: 0, z: 0 };
        case "scale": return { x: 1, y: 1, z: 1 };
        case "color": return "#ffffff";
        case "opacity": return 1;
        case "frame": return 0;
    }
}

function uniqueClipName(clips: AnimationClip[], base: string) {
    let name = base;
    for (let index = 2; clips.some((clip) => clip.name === name); index += 1) name = `${base} ${index}`;
    return name;
}

function KeyValueInput({ property, value, onChange, disabled, is2D }: { property: AnimationProperty; value: AnimationValue; onChange: (value: AnimationValue) => void; disabled: boolean; is2D: boolean }) {
    switch (property) {
        case "position":
        case "scale":
            return <VectorInput value={value as Vector3} hideZ={is2D} step={0.05} disabled={disabled} onChange={(next) => onChange(is2D ? { ...next, z: (value as Vector3).z } : next)} />;
        case "rotation":
            return is2D
                ? <NumberInput label="Z" labelClassName="text-sky-400" value={(value as Vector3).z} step={1} disabled={disabled} onChange={(z) => onChange({ x: 0, y: 0, z })} />
                : <VectorInput value={value as Vector3} step={1} disabled={disabled} onChange={onChange} />;
        case "color":
            return <ColorInput value={String(value)} disabled={disabled} onChange={onChange} />;
        case "opacity":
            return <SliderInput value={Number(value)} min={0} max={1} disabled={disabled} onChange={onChange} />;
        case "frame":
            return <NumberInput value={Number(value)} min={0} max={4095} integer step={1} disabled={disabled} onChange={onChange} />;
    }
}

function ClipEditor({ clip, index, edit, disabled, is2D, onRemove, methods }: {
    clip: AnimationClip;
    index: number;
    edit: (field: string, recipe: (clip: AnimationClip) => void) => void;
    disabled: boolean;
    is2D: boolean;
    onRemove: () => void;
    /** Script methods on the object (animation event suggestions). */
    methods: string[];
}) {
    const { t } = useEditor();
    const [open, setOpen] = useState(index === 0);
    const unused = ANIMATION_PROPERTIES.filter((property) => !clip.tracks.some((track) => track.property === property));
    const updateKey = (trackIndex: number, keyIndex: number, field: string, recipe: (key: AnimationKey) => void, sort = false) => edit(`${trackIndex}:${keyIndex}:${field}`, (draft) => {
        const track = draft.tracks[trackIndex];
        const key = track?.keys[keyIndex];
        if (!key) return;
        recipe(key);
        if (sort) track.keys.sort((a, b) => a.time - b.time);
    });
    return (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02]">
            <div className="flex items-center gap-1 px-1.5 py-1">
                <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:text-zinc-200" aria-label={clip.name}>
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <Film className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-zinc-200">{clip.name}</span>
                <span className="text-[10.5px] text-zinc-500">{clip.duration}s</span>
                <IconButton icon={Trash2} label={t("removeClip")} size="sm" tone="danger" disabled={disabled} onClick={onRemove} />
            </div>
            {open ? (
                <div className="space-y-1 border-t border-white/[0.06] p-2">
                    <FieldRow label={t("name")}><TextInput value={clip.name} maxLength={40} disabled={disabled} onChange={(value) => value.trim() && edit("name", (draft) => { draft.name = value.trim().slice(0, 40); })} /></FieldRow>
                    <FieldRow label={t("duration")}><NumberInput value={clip.duration} min={0.01} max={600} step={0.05} disabled={disabled} onChange={(duration) => edit("duration", (draft) => {
                        draft.duration = duration;
                        for (const track of draft.tracks) for (const key of track.keys) key.time = Math.min(key.time, duration);
                        for (const event of draft.events ?? []) event.time = Math.min(event.time, duration);
                    })} /></FieldRow>
                    <FieldRow label={t("wrapMode")}>
                        <SelectInput value={clip.wrap} disabled={disabled} onChange={(wrap) => edit("wrap", (draft) => { draft.wrap = wrap; })} options={[{ value: "once", label: t("wrapOnce") }, { value: "loop", label: t("wrapLoop") }, { value: "pingPong", label: t("wrapPingPong") }]} />
                    </FieldRow>
                    {clip.tracks.map((track, trackIndex) => (
                        <div key={track.property} className="mt-1.5 rounded-md border border-white/[0.06] bg-black/20 p-1.5">
                            <div className="mb-1 flex items-center gap-1">
                                <span className="flex-1 text-[11px] font-bold text-zinc-300">{t(TRACK_LABELS[track.property])}</span>
                                <IconButton icon={Plus} label={t("addKey")} size="sm" disabled={disabled || track.keys.length >= 120} onClick={() => edit(`${trackIndex}:add`, (draft) => {
                                    const target = draft.tracks[trackIndex];
                                    const last = target.keys[target.keys.length - 1];
                                    const time = Math.min(draft.duration, Math.round(((last?.time ?? -0.25) + 0.25) * 100) / 100);
                                    target.keys.push({ time, value: last ? JSON.parse(JSON.stringify(last.value)) as AnimationValue : defaultValue(track.property), easing: track.property === "frame" ? "step" : "linear" });
                                    target.keys.sort((a, b) => a.time - b.time);
                                })} />
                                <IconButton icon={Trash2} label={t("removeTrack")} size="sm" tone="danger" disabled={disabled} onClick={() => edit(`${trackIndex}:remove`, (draft) => { draft.tracks.splice(trackIndex, 1); })} />
                            </div>
                            {track.keys.map((key, keyIndex) => (
                                <div key={keyIndex} className="mb-1 space-y-1 rounded border border-white/[0.05] p-1">
                                    <div className="grid grid-cols-[64px_1fr_24px] items-center gap-1">
                                        <NumberInput label="t" value={key.time} min={0} max={clip.duration} step={0.05} disabled={disabled} onChange={(time) => updateKey(trackIndex, keyIndex, "time", (draft) => { draft.time = time; }, true)} />
                                        {track.property === "frame"
                                            ? <span className="text-[10.5px] text-zinc-500">step</span>
                                            : <SelectInput value={key.easing} disabled={disabled} onChange={(easing) => updateKey(trackIndex, keyIndex, "easing", (draft) => { draft.easing = easing; })} options={EASINGS.map((easing) => ({ value: easing, label: easing }))} />}
                                        <IconButton icon={X} label={t("removeKey")} size="sm" tone="danger" disabled={disabled} onClick={() => edit(`${trackIndex}:${keyIndex}:remove`, (draft) => { draft.tracks[trackIndex]?.keys.splice(keyIndex, 1); })} />
                                    </div>
                                    <KeyValueInput property={track.property} value={key.value} is2D={is2D} disabled={disabled} onChange={(value) => updateKey(trackIndex, keyIndex, "value", (draft) => { draft.value = value; })} />
                                </div>
                            ))}
                        </div>
                    ))}
                    {unused.length && clip.tracks.length < 12 ? (
                        <SelectInput
                            value=""
                            disabled={disabled}
                            onChange={(property) => property && edit("addTrack", (draft) => {
                                draft.tracks.push({ property, keys: [{ time: 0, value: defaultValue(property), easing: property === "frame" ? "step" : "linear" }] });
                            })}
                            options={[{ value: "" as AnimationProperty, label: `+ ${t("addTrack")}` }, ...unused.map((property) => ({ value: property, label: t(TRACK_LABELS[property]) }))]}
                        />
                    ) : null}
                    <ClipEvents clip={clip} edit={edit} disabled={disabled} methods={methods} />
                </div>
            ) : null}
        </div>
    );
}

export default function AnimationEditor({ entity, component, disabled }: Editor<AnimationComponent>) {
    const { store, t, program } = useEditor();
    const methods = useMemo(() => scriptMethodNames(entity.components, program, 1), [entity.components, program]);
    const is2D = useEditorState(store, (state) => state.project.dimension === "2d");
    const edit = useComponentEdit(entity.id, component);
    const sprite = entity.components.find((item) => item.type === "spriteRenderer");
    const frames = sprite?.type === "spriteRenderer" ? sprite.sheet.columns * sprite.sheet.rows : 4;

    const addClip = (clip: AnimationClip) => edit("addClip", (draft) => {
        if (draft.clips.length >= 16) return;
        const name = uniqueClipName(draft.clips, clip.name);
        draft.clips.push({ ...clip, name });
        if (!draft.defaultClip) draft.defaultClip = name;
    }, t("hEditAnimation"));

    const presets: MenuItem[] = [
        ...(["bob", "spin", "pulse", "shake", "fadeOut", "flash", "frames"] as const).map((preset) => ({
            label: t(PRESET_LABELS[preset]),
            icon: Film,
            onSelect: () => addClip(animationPreset(preset, is2D ? "2d" : "3d", Math.max(2, frames), 8)),
        })),
        { separator: true, label: "" },
        { label: t("emptyClip"), icon: Plus, onSelect: () => addClip({ name: "Clip", duration: 1, wrap: "loop", tracks: [] }) },
    ];

    return (
        <div className="space-y-1.5">
            <FieldRow label={t("playOnStart")}><Toggle checked={component.playOnStart} disabled={disabled} onChange={(value) => edit("playOnStart", (draft) => { draft.playOnStart = value; })} /></FieldRow>
            <FieldRow label={t("speed")}><NumberInput value={component.speed} min={0} max={10} step={0.1} disabled={disabled} onChange={(value) => edit("speed", (draft) => { draft.speed = value; })} /></FieldRow>
            {component.clips.length ? (
                <FieldRow label={t("defaultClip")}>
                    <SelectInput value={component.defaultClip ?? ""} disabled={disabled} onChange={(value) => edit("defaultClip", (draft) => { draft.defaultClip = value || null; })} options={[{ value: "", label: t("none") }, ...component.clips.map((clip) => ({ value: clip.name, label: clip.name }))]} />
                </FieldRow>
            ) : <p className="py-1 text-[11px] text-zinc-500">{t("noClips")}</p>}
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("clips")}</p>
            {component.clips.map((clip, index) => (
                <ClipEditor
                    key={index}
                    clip={clip}
                    index={index}
                    is2D={is2D}
                    disabled={disabled}
                    methods={methods}
                    edit={(field, recipe) => edit(`clip:${index}:${field}`, (draft) => {
                        const target = draft.clips[index];
                        if (!target) return;
                        const before = target.name;
                        recipe(target);
                        if (target.name !== before) {
                            target.name = uniqueClipName(draft.clips.filter((item) => item !== target), target.name);
                            if (draft.defaultClip === before) draft.defaultClip = target.name;
                        }
                    }, t("hEditAnimation"))}
                    onRemove={() => edit(`clip:${index}:remove`, (draft) => {
                        const [removed] = draft.clips.splice(index, 1);
                        if (removed && draft.defaultClip === removed.name) draft.defaultClip = draft.clips[0]?.name ?? null;
                    }, t("hEditAnimation"))}
                />
            ))}
            <Dropdown
                items={presets}
                trigger={({ toggle }) => (
                    <Button className="h-8 w-full" disabled={disabled || component.clips.length >= 16} onClick={toggle}><Plus className="h-4 w-4" />{t("addClip")}</Button>
                )}
            />
            <p className="text-[11px] leading-snug text-zinc-500">{t("animationHint")}</p>
        </div>
    );
}
