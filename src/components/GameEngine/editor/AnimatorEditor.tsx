"use client";

/**
 * Inspector editor of the Animator (V5): parameters, states and transitions.
 * The Animator panel (AnimatorPanel.tsx) shows the same state machine as a
 * graph and, while the game runs, the state it is in.
 */
import { ArrowRight, GitBranch, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createAnimation, createAnimatorState, createAnimatorTransition } from "@/lib/game-engine/components";
import {
    ANIMATOR_ANY_STATE,
    ANIMATOR_CONDITION_MODES_FOR,
    ANIMATOR_PARAMETER_TYPES,
    type AnimatorComponent,
    type AnimatorConditionMode,
    type AnimatorParameterType,
    type AnimatorTransition,
} from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { useComponentEdit, type Editor } from "./inspector-fields";
import { findEntity, touch } from "./operations";
import type { TextKey } from "./text";
import { Button, Checkbox, Dropdown, FieldRow, IconButton, NumberInput, SelectInput, TextInput, cx, type MenuItem } from "./ui";

/** Asks the editor to show the Animator panel. */
export const SHOW_ANIMATOR_EVENT = "hanogt-engine:show-animator";
/** The graph selected a transition: the Inspector scrolls to it. */
export const ANIMATOR_SELECT_EVENT = "hanogt-engine:animator-select";
export type AnimatorSelectDetail = { componentId: string; transitionId: string | null; stateId: string | null };

const MODE_LABELS: Record<AnimatorConditionMode, TextKey> = {
    if: "animatorModeIf",
    ifNot: "animatorModeIfNot",
    greater: "animatorModeGreater",
    less: "animatorModeLess",
    equals: "animatorModeEquals",
    notEqual: "animatorModeNotEqual",
};

export function conditionModeLabel(t: (key: TextKey) => string, type: AnimatorParameterType, mode: AnimatorConditionMode) {
    return type === "trigger" ? t("animatorModeTrigger") : t(MODE_LABELS[mode]);
}

const TYPE_LABELS: Record<AnimatorParameterType, string> = { bool: "Bool", float: "Float", int: "Int", trigger: "Trigger" };

/** "Run" → "Run 2" while the name is taken (case-insensitive). */
function freeName(base: string, taken: string[]) {
    const lower = new Set(taken.map((name) => name.toLowerCase()));
    let name = base;
    for (let index = 2; lower.has(name.toLowerCase()); index += 1) name = `${base} ${index}`;
    return name;
}

/** Where a new state goes: next to the others, in rows of three. */
export function nextStatePosition(count: number) {
    return { x: 260 + (count % 3) * 200, y: 60 + Math.floor(count / 3) * 110 };
}

export default function AnimatorEditor({ entity, component, disabled }: Editor<AnimatorComponent>) {
    const { store, t } = useEditor();
    const edit = useComponentEdit(entity.id, component);
    const change = (field: string, recipe: (draft: AnimatorComponent) => void) => edit(field, recipe, t("hEditAnimator"));
    const animation = entity.components.find((item) => item.type === "animation");
    const clips = animation?.type === "animation" ? animation.clips.map((clip) => clip.name) : [];
    const [selected, setSelected] = useState<string | null>(null);
    const transitionRefs = useRef(new Map<string, HTMLDivElement>());

    // The graph picked a transition: highlight and scroll to its card.
    useEffect(() => {
        const onSelect = (event: Event) => {
            const detail = (event as CustomEvent<AnimatorSelectDetail>).detail;
            if (!detail || detail.componentId !== component.id) return;
            setSelected(detail.transitionId);
            if (detail.transitionId) transitionRefs.current.get(detail.transitionId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        };
        window.addEventListener(ANIMATOR_SELECT_EVENT, onSelect);
        return () => window.removeEventListener(ANIMATOR_SELECT_EVENT, onSelect);
    }, [component.id]);

    const addAnimation = () => store.update(t("animatorAddAnimation"), (draft) => {
        const target = findEntity(draft, entity.id);
        if (!target || target.components.some((item) => item.type === "animation")) return;
        target.components.push(createAnimation({ playOnStart: false }));
        touch(draft);
    });

    const statesFromClips = () => change("statesFromClips", (draft) => {
        for (const clip of clips) {
            if (draft.states.length >= 32) break;
            if (draft.states.some((state) => state.clip === clip)) continue;
            draft.states.push(createAnimatorState(freeName(clip, draft.states.map((state) => state.name)), clip, nextStatePosition(draft.states.length)));
        }
        if (!draft.defaultState) draft.defaultState = draft.states[0]?.id ?? null;
    });

    const addParameter = (type: AnimatorParameterType) => change("addParameter", (draft) => {
        if (draft.parameters.length >= 32) return;
        const base = type === "bool" ? "isGrounded" : type === "float" ? "speed" : type === "int" ? "count" : "jump";
        draft.parameters.push({ name: freeName(base, draft.parameters.map((parameter) => parameter.name)), type, value: 0 });
    });

    const addState = () => change("addState", (draft) => {
        if (draft.states.length >= 32) return;
        const state = createAnimatorState(freeName("State", draft.states.map((item) => item.name)), clips.find((clip) => !draft.states.some((item) => item.clip === clip)) ?? null, nextStatePosition(draft.states.length));
        draft.states.push(state);
        if (!draft.defaultState) draft.defaultState = state.id;
    });

    const addTransition = () => change("addTransition", (draft) => {
        if (draft.transitions.length >= 96 || draft.states.length < 1) return;
        const from = draft.states[0];
        const to = draft.states[1] ?? draft.states[0];
        draft.transitions.push(createAnimatorTransition(from.id, to.id));
    });

    const parameterMenu: MenuItem[] = ANIMATOR_PARAMETER_TYPES.map((type) => ({ label: TYPE_LABELS[type], onSelect: () => addParameter(type) }));
    const stateOptions = component.states.map((state) => ({ value: state.id, label: state.name }));
    const clipOptions = [{ value: "", label: t("animatorNoClip") }, ...clips.map((clip) => ({ value: clip, label: clip }))];

    return (
        <div className="space-y-2" data-animator-editor>
            {!animation ? (
                <div role="status" className="flex items-start gap-2 rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200">
                    <span className="min-w-0 flex-1">{t("animatorNeedsAnimation")}</span>
                    <Button className="h-6 shrink-0 px-2 text-[11px]" disabled={disabled} onClick={addAnimation}><Plus className="h-3 w-3" />{t("animatorAddAnimation")}</Button>
                </div>
            ) : <p className="rounded-md bg-white/[0.03] px-2 py-1.5 text-[11px] leading-relaxed text-zinc-400">{t("animatorHint")}</p>}
            <div className="flex flex-wrap gap-1.5">
                <Button className="h-7 px-2 text-[11.5px]" onClick={() => window.dispatchEvent(new CustomEvent(SHOW_ANIMATOR_EVENT))}><GitBranch className="h-3.5 w-3.5" />{t("animatorOpenGraph")}</Button>
                {clips.length ? <Button className="h-7 px-2 text-[11.5px]" disabled={disabled || clips.every((clip) => component.states.some((state) => state.clip === clip))} onClick={statesFromClips}><Plus className="h-3.5 w-3.5" />{t("animatorStatesFromClips")}</Button> : null}
            </div>
            <FieldRow label={t("speed")}><NumberInput value={component.speed} min={0} max={10} step={0.1} disabled={disabled} onChange={(value) => change("speed", (draft) => { draft.speed = value; })} /></FieldRow>

            {/* Parameters */}
            <div className="flex items-center justify-between pt-1">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("animatorParameters")}</p>
                <Dropdown align="right" items={parameterMenu} trigger={({ toggle }) => <IconButton icon={Plus} label={t("animatorAddParameter")} size="sm" disabled={disabled || component.parameters.length >= 32} onClick={toggle} />} />
            </div>
            {!component.parameters.length ? <p className="text-[11px] leading-snug text-zinc-500">{t("animatorNoParameters")}</p> : null}
            {component.parameters.map((parameter, index) => (
                <div key={index} className="flex items-center gap-1" data-animator-parameter={parameter.name}>
                    <div className="min-w-0 flex-1">
                        <TextInput value={parameter.name} disabled={disabled} maxLength={40} onChange={(value) => change(`parameter:${index}:name`, (draft) => {
                            const target = draft.parameters[index];
                            const name = value.trim();
                            if (!target || !name || draft.parameters.some((other, otherIndex) => otherIndex !== index && other.name.toLowerCase() === name.toLowerCase())) return;
                            for (const transition of draft.transitions) for (const condition of transition.conditions) if (condition.parameter === target.name) condition.parameter = name;
                            target.name = name;
                        })} />
                    </div>
                    <div className="w-[76px] shrink-0">
                        <SelectInput value={parameter.type} disabled={disabled} options={ANIMATOR_PARAMETER_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }))} onChange={(type) => change(`parameter:${index}:type`, (draft) => {
                            const target = draft.parameters[index];
                            if (!target) return;
                            target.type = type;
                            target.value = 0;
                            const modes = ANIMATOR_CONDITION_MODES_FOR[type];
                            for (const transition of draft.transitions) {
                                for (const condition of transition.conditions) if (condition.parameter === target.name && !modes.includes(condition.mode)) condition.mode = modes[0];
                            }
                        })} />
                    </div>
                    <div className="flex w-[64px] shrink-0 justify-center">
                        {parameter.type === "bool" ? <Checkbox checked={parameter.value !== 0} disabled={disabled} label={parameter.name} onChange={(value) => change(`parameter:${index}:value`, (draft) => { if (draft.parameters[index]) draft.parameters[index].value = value ? 1 : 0; })} />
                            : parameter.type === "trigger" ? <span className="text-[11px] text-zinc-600">—</span>
                                : <NumberInput value={parameter.value} integer={parameter.type === "int"} step={parameter.type === "int" ? 1 : 0.1} disabled={disabled} onChange={(value) => change(`parameter:${index}:value`, (draft) => { if (draft.parameters[index]) draft.parameters[index].value = parameter.type === "int" ? Math.round(value) : value; })} />}
                    </div>
                    <IconButton icon={Trash2} label={t("delete")} size="sm" tone="danger" disabled={disabled} onClick={() => change(`parameter:${index}:remove`, (draft) => {
                        const [removed] = draft.parameters.splice(index, 1);
                        if (!removed) return;
                        for (const transition of draft.transitions) transition.conditions = transition.conditions.filter((condition) => condition.parameter !== removed.name);
                    })} />
                </div>
            ))}

            {/* States */}
            <div className="flex items-center justify-between pt-1">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("animatorStates")}</p>
                <IconButton icon={Plus} label={t("animatorAddState")} size="sm" disabled={disabled || component.states.length >= 32} onClick={addState} />
            </div>
            {!component.states.length ? <p className="text-[11px] leading-snug text-zinc-500">{t("animatorNoStates")}</p> : null}
            {component.states.map((state, index) => {
                const isDefault = component.defaultState === state.id || (!component.defaultState && index === 0);
                return (
                    <div key={state.id} className="flex items-center gap-1" data-animator-state={state.name}>
                        <IconButton icon={Star} label={isDefault ? t("animatorDefault") : t("animatorMakeDefault")} size="sm" active={isDefault} disabled={disabled || isDefault} className={isDefault ? "text-amber-300" : undefined} onClick={() => change("defaultState", (draft) => { draft.defaultState = state.id; })} />
                        <div className="min-w-0 flex-1">
                            <TextInput value={state.name} disabled={disabled} maxLength={40} onChange={(value) => change(`state:${state.id}:name`, (draft) => {
                                const target = draft.states.find((item) => item.id === state.id);
                                const name = value.trim();
                                if (!target || !name) return;
                                target.name = freeName(name, draft.states.filter((item) => item !== target).map((item) => item.name));
                            })} />
                        </div>
                        <div className="w-[92px] shrink-0">
                            <SelectInput value={state.clip ?? ""} disabled={disabled} options={state.clip && !clips.includes(state.clip) ? [...clipOptions, { value: state.clip, label: `${state.clip} ?` }] : clipOptions} onChange={(value) => change(`state:${state.id}:clip`, (draft) => {
                                const target = draft.states.find((item) => item.id === state.id);
                                if (target) target.clip = value || null;
                            })} />
                        </div>
                        <div className="w-[52px] shrink-0" title={t("speed")}>
                            <NumberInput value={state.speed} min={0} max={10} step={0.1} disabled={disabled} onChange={(value) => change(`state:${state.id}:speed`, (draft) => {
                                const target = draft.states.find((item) => item.id === state.id);
                                if (target) target.speed = value;
                            })} />
                        </div>
                        <IconButton icon={Trash2} label={t("delete")} size="sm" tone="danger" disabled={disabled} onClick={() => change(`state:${state.id}:remove`, (draft) => {
                            draft.states = draft.states.filter((item) => item.id !== state.id);
                            draft.transitions = draft.transitions.filter((transition) => transition.from !== state.id && transition.to !== state.id);
                            if (draft.defaultState === state.id) draft.defaultState = draft.states[0]?.id ?? null;
                        })} />
                    </div>
                );
            })}

            {/* Transitions */}
            <div className="flex items-center justify-between pt-1">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("animatorTransitions")}</p>
                <IconButton icon={Plus} label={t("animatorAddTransition")} size="sm" disabled={disabled || !component.states.length || component.transitions.length >= 96} onClick={addTransition} />
            </div>
            {!component.transitions.length ? <p className="text-[11px] leading-snug text-zinc-500">{t("animatorNoTransitions")}</p> : null}
            {component.transitions.map((transition) => (
                <TransitionCard
                    key={transition.id}
                    refCallback={(element) => {
                        if (element) transitionRefs.current.set(transition.id, element);
                        else transitionRefs.current.delete(transition.id);
                    }}
                    component={component}
                    transition={transition}
                    stateOptions={stateOptions}
                    selected={selected === transition.id}
                    disabled={disabled}
                    t={t}
                    change={(field, recipe) => change(`transition:${transition.id}:${field}`, (draft) => {
                        const target = draft.transitions.find((item) => item.id === transition.id);
                        if (target) recipe(target, draft);
                    })}
                    onRemove={() => change(`transition:${transition.id}:remove`, (draft) => {
                        draft.transitions = draft.transitions.filter((item) => item.id !== transition.id);
                    })}
                />
            ))}
            <p className="text-[11px] leading-snug text-zinc-500">{t("animatorScriptHint")}</p>
        </div>
    );
}

function TransitionCard({ component, transition, stateOptions, selected, disabled, t, change, onRemove, refCallback }: {
    component: AnimatorComponent;
    transition: AnimatorTransition;
    stateOptions: Array<{ value: string; label: string }>;
    selected: boolean;
    disabled: boolean;
    t: (key: TextKey) => string;
    change: (field: string, recipe: (draft: AnimatorTransition, animator: AnimatorComponent) => void) => void;
    onRemove: () => void;
    refCallback: (element: HTMLDivElement | null) => void;
}) {
    const parameters = component.parameters;
    return (
        <div ref={refCallback} className={cx("space-y-1.5 rounded-lg border p-2 transition", selected ? "border-indigo-400/60 bg-indigo-500/10" : "border-white/[0.06] bg-white/[0.02]")} data-animator-transition={transition.id}>
            <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1" title={t("animatorFrom")}>
                    <SelectInput value={transition.from} disabled={disabled} options={[{ value: ANIMATOR_ANY_STATE, label: t("animatorAnyState") }, ...stateOptions]} onChange={(value) => change("from", (draft) => { draft.from = value; })} />
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                <div className="min-w-0 flex-1" title={t("animatorTo")}>
                    <SelectInput value={transition.to} disabled={disabled} options={stateOptions} onChange={(value) => change("to", (draft) => { draft.to = value; })} />
                </div>
                <IconButton icon={Trash2} label={t("delete")} size="sm" tone="danger" disabled={disabled} onClick={onRemove} />
            </div>
            {transition.conditions.map((condition, index) => {
                const parameter = parameters.find((item) => item.name === condition.parameter);
                const modes = parameter ? ANIMATOR_CONDITION_MODES_FOR[parameter.type] : ["if" as const];
                return (
                    <div key={index} className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                            <SelectInput value={condition.parameter} disabled={disabled} options={parameters.map((item) => ({ value: item.name, label: item.name }))} onChange={(value) => change(`condition:${index}:parameter`, (draft, animator) => {
                                const target = draft.conditions[index];
                                const next = animator.parameters.find((item) => item.name === value);
                                if (!target || !next) return;
                                target.parameter = next.name;
                                const allowed = ANIMATOR_CONDITION_MODES_FOR[next.type];
                                if (!allowed.includes(target.mode)) target.mode = allowed[0];
                            })} />
                        </div>
                        <div className="w-[84px] shrink-0">
                            <SelectInput value={condition.mode} disabled={disabled || modes.length < 2} options={modes.map((mode) => ({ value: mode, label: parameter ? conditionModeLabel(t, parameter.type, mode) : mode }))} onChange={(value) => change(`condition:${index}:mode`, (draft) => {
                                if (draft.conditions[index]) draft.conditions[index].mode = value;
                            })} />
                        </div>
                        {parameter && (parameter.type === "float" || parameter.type === "int") ? (
                            <div className="w-[56px] shrink-0">
                                <NumberInput value={condition.threshold} integer={parameter.type === "int"} step={parameter.type === "int" ? 1 : 0.1} disabled={disabled} onChange={(value) => change(`condition:${index}:threshold`, (draft) => {
                                    if (draft.conditions[index]) draft.conditions[index].threshold = value;
                                })} />
                            </div>
                        ) : null}
                        <IconButton icon={X} label={t("delete")} size="sm" disabled={disabled} onClick={() => change(`condition:${index}:remove`, (draft) => {
                            draft.conditions.splice(index, 1);
                            if (!draft.conditions.length) draft.hasExitTime = true;
                        })} />
                    </div>
                );
            })}
            {!transition.conditions.length ? <p className="text-[11px] text-zinc-500">{t("animatorNoConditions")}</p> : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button className="h-6 px-2 text-[11px]" disabled={disabled || !parameters.length || transition.conditions.length >= 8} onClick={() => change("addCondition", (draft, animator) => {
                    const first = animator.parameters[0];
                    if (!first) return;
                    draft.conditions.push({ parameter: first.name, mode: ANIMATOR_CONDITION_MODES_FOR[first.type][0], threshold: 0 });
                })}><Plus className="h-3 w-3" />{t("animatorAddCondition")}</Button>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <Checkbox checked={transition.hasExitTime} disabled={disabled || !transition.conditions.length} label={t("animatorExitTime")} onChange={(value) => change("hasExitTime", (draft) => { draft.hasExitTime = value; })} />
                    {t("animatorExitTime")}
                </label>
                {transition.hasExitTime ? (
                    <div className="w-[56px]">
                        <NumberInput value={transition.exitTime} min={0} max={100} step={0.05} disabled={disabled} onChange={(value) => change("exitTime", (draft) => { draft.exitTime = value; })} />
                    </div>
                ) : null}
            </div>
            <FieldRow label={t("animatorDuration")}>
                <NumberInput value={transition.duration} min={0} max={10} step={0.05} disabled={disabled} onChange={(value) => change("duration", (draft) => { draft.duration = value; })} />
            </FieldRow>
        </div>
    );
}
