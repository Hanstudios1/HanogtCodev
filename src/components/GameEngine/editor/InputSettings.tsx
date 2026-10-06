"use client";

import { ChevronDown, ChevronRight, Gamepad2, Keyboard, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
    ACTION_NAME,
    defaultInputSettings,
    GAMEPAD_AXES,
    GAMEPAD_BUTTONS,
    INPUT_LIMITS,
    type GamepadAxisName,
    type GamepadButtonName,
    type InputAction,
    type InputSettings,
} from "@/lib/game-engine/input-actions";
import { KEY_CODES } from "@/lib/game-engine/key-codes";
import { useEditor } from "./context";
import { Button, cx, FieldRow, IconButton, SelectInput, SliderInput, TextInput, Toggle } from "./ui";

type EditInput = (key: string, recipe: (input: InputSettings) => void) => void;

const BINDABLE_KEYS = KEY_CODES.filter((key) => key !== "None");

/** Project settings tab for input actions (V4): names, keys, gamepad buttons and sticks. */
export function InputSettingsPanel({ input, disabled, onEdit }: { input: InputSettings; disabled: boolean; onEdit: EditInput }) {
    const { t } = useEditor();
    const [openName, setOpenName] = useState<string | null>(null);
    const [nameError, setNameError] = useState<{ index: number; message: string } | null>(null);
    const full = input.actions.length >= INPUT_LIMITS.maxActions;

    const rename = (index: number, value: string) => {
        const name = value.trim();
        if (!ACTION_NAME.test(name)) {
            setNameError({ index, message: t("actionNameInvalid") });
            return;
        }
        if (input.actions.some((action, other) => other !== index && action.name.toLowerCase() === name.toLowerCase())) {
            setNameError({ index, message: t("actionNameTaken") });
            return;
        }
        setNameError(null);
        if (openName === input.actions[index].name) setOpenName(name);
        onEdit(`name:${index}`, (draft) => { draft.actions[index].name = name; });
    };

    const addAction = () => {
        const taken = new Set(input.actions.map((action) => action.name.toLowerCase()));
        let number = input.actions.length + 1;
        while (taken.has(`action ${number}`)) number += 1;
        const name = `Action ${number}`;
        onEdit(`add:${input.actions.length}`, (draft) => {
            draft.actions.push({ name, kind: "button", positive: [], negative: [], gamepadPositive: [], gamepadNegative: [], gamepadAxis: null, invert: false });
        });
        setOpenName(name);
    };

    return (
        <div className="space-y-3" data-input-settings>
            <p className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11.5px] leading-relaxed text-zinc-400">{t("inputHint")}</p>
            <FieldRow label={t("deadZone")}>
                <SliderInput value={input.deadZone} min={0} max={0.9} step={0.05} disabled={disabled} onChange={(value) => onEdit("deadZone", (draft) => { draft.deadZone = Math.min(0.9, Math.max(0, value)); })} />
            </FieldRow>
            <div>
                <p className="pb-1 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("inputActions")} · {input.actions.length}/{INPUT_LIMITS.maxActions}</p>
                <ul className="space-y-1.5">
                    {input.actions.map((action, index) => {
                        const open = openName === action.name;
                        return (
                            <li key={`${index}:${action.name}`} className="overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950/40" data-input-action={action.name}>
                                <div className="flex items-center gap-1 pe-1">
                                    <button
                                        type="button"
                                        aria-expanded={open}
                                        onClick={() => setOpenName(open ? null : action.name)}
                                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-start transition hover:bg-white/[0.03]"
                                    >
                                        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500 rtl:rotate-180" />}
                                        <span className="truncate font-mono text-[12px] font-semibold text-zinc-100" dir="ltr">{action.name}</span>
                                        <span className={cx("shrink-0 rounded px-1.5 text-[10px] font-bold uppercase leading-4", action.kind === "axis" ? "bg-sky-500/15 text-sky-300" : "bg-violet-500/15 text-violet-300")}>
                                            {action.kind === "axis" ? t("kindAxis") : t("kindButton")}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500" dir="ltr">{summary(action) || t("notBound")}</span>
                                    </button>
                                    <IconButton icon={Trash2} label={t("removeAction")} size="sm" tone="danger" disabled={disabled} onClick={() => {
                                        if (open) setOpenName(null);
                                        setNameError(null);
                                        onEdit(`remove:${action.name}`, (draft) => { draft.actions.splice(index, 1); });
                                    }} />
                                </div>
                                {open ? (
                                    <div className="space-y-0.5 border-t border-white/[0.06] px-2.5 py-2">
                                        <FieldRow label={t("name")}>
                                            <TextInput value={action.name} maxLength={INPUT_LIMITS.nameLength} disabled={disabled} onChange={(value) => rename(index, value)} />
                                        </FieldRow>
                                        {nameError?.index === index ? <p role="alert" className="pb-1 text-[11px] text-red-300">{nameError.message}</p> : null}
                                        <FieldRow label={t("actionKind")}>
                                            <SelectInput value={action.kind} disabled={disabled} onChange={(kind) => onEdit(`kind:${index}`, (draft) => {
                                                const target = draft.actions[index];
                                                target.kind = kind;
                                                if (kind === "button") {
                                                    target.negative = [];
                                                    target.gamepadNegative = [];
                                                    target.gamepadAxis = null;
                                                    target.invert = false;
                                                }
                                            })} options={[{ value: "button", label: t("kindButton") }, { value: "axis", label: t("kindAxis") }]} />
                                        </FieldRow>
                                        <FieldRow label={<span className="inline-flex items-center gap-1"><Keyboard className="h-3 w-3" />{action.kind === "axis" ? t("positiveKeys") : t("keys")}</span>} title={action.kind === "axis" ? t("positiveKeys") : t("keys")}>
                                            <Bindings values={action.positive} options={BINDABLE_KEYS} disabled={disabled} onChange={(next) => onEdit(`positive:${index}`, (draft) => { draft.actions[index].positive = next; })} />
                                        </FieldRow>
                                        {action.kind === "axis" ? (
                                            <FieldRow label={<span className="inline-flex items-center gap-1"><Keyboard className="h-3 w-3" />{t("negativeKeys")}</span>} title={t("negativeKeys")}>
                                                <Bindings values={action.negative} options={BINDABLE_KEYS} disabled={disabled} onChange={(next) => onEdit(`negative:${index}`, (draft) => { draft.actions[index].negative = next; })} />
                                            </FieldRow>
                                        ) : null}
                                        <FieldRow label={<span className="inline-flex items-center gap-1"><Gamepad2 className="h-3 w-3" />{action.kind === "axis" ? t("padPositive") : t("padButtons")}</span>} title={action.kind === "axis" ? t("padPositive") : t("padButtons")}>
                                            <Bindings<GamepadButtonName> values={action.gamepadPositive} options={GAMEPAD_BUTTONS} disabled={disabled} onChange={(next) => onEdit(`padPositive:${index}`, (draft) => { draft.actions[index].gamepadPositive = next; })} />
                                        </FieldRow>
                                        {action.kind === "axis" ? (
                                            <>
                                                <FieldRow label={<span className="inline-flex items-center gap-1"><Gamepad2 className="h-3 w-3" />{t("padNegative")}</span>} title={t("padNegative")}>
                                                    <Bindings<GamepadButtonName> values={action.gamepadNegative} options={GAMEPAD_BUTTONS} disabled={disabled} onChange={(next) => onEdit(`padNegative:${index}`, (draft) => { draft.actions[index].gamepadNegative = next; })} />
                                                </FieldRow>
                                                <FieldRow label={t("analogStick")}>
                                                    <SelectInput<GamepadAxisName | "none">
                                                        value={action.gamepadAxis ?? "none"}
                                                        disabled={disabled}
                                                        onChange={(value) => onEdit(`stick:${index}`, (draft) => {
                                                            draft.actions[index].gamepadAxis = value === "none" ? null : value;
                                                            if (value === "none") draft.actions[index].invert = false;
                                                        })}
                                                        options={[{ value: "none", label: t("none") }, ...GAMEPAD_AXES.map((axis) => ({ value: axis, label: axis }))]}
                                                    />
                                                </FieldRow>
                                                {action.gamepadAxis ? (
                                                    <FieldRow label={t("invertStick")}>
                                                        <Toggle checked={action.invert} disabled={disabled} label={t("invertStick")} onChange={(value) => onEdit(`invert:${index}`, (draft) => { draft.actions[index].invert = value; })} />
                                                    </FieldRow>
                                                ) : null}
                                            </>
                                        ) : null}
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={addAction} disabled={disabled || full}><Plus className="h-3.5 w-3.5" />{t("addAction")}</Button>
                <Button variant="ghost" disabled={disabled} onClick={() => {
                    setOpenName(null);
                    setNameError(null);
                    onEdit(`reset:${Date.now()}`, (draft) => {
                        const defaults = defaultInputSettings();
                        draft.actions = defaults.actions;
                        draft.deadZone = defaults.deadZone;
                    });
                }}><RotateCcw className="h-3.5 w-3.5" />{t("resetInput")}</Button>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">{t("touchMapsTo")}</p>
        </div>
    );
}

function summary(action: InputAction) {
    const keys = action.kind === "axis"
        ? [action.positive.length || action.negative.length ? `${action.negative.join("/") || "–"} ↔ ${action.positive.join("/") || "–"}` : ""]
        : [action.positive.join(", ")];
    const pad = [...action.gamepadPositive, ...action.gamepadNegative];
    return [...keys, pad.join(", "), action.gamepadAxis ?? ""].filter(Boolean).join(" · ");
}

/** Bound keys or buttons as removable chips, with a menu that adds one more. */
function Bindings<T extends string>({ values, options, disabled, onChange }: { values: readonly T[]; options: readonly T[]; disabled: boolean; onChange: (next: T[]) => void }) {
    const { t } = useEditor();
    const available = options.filter((option) => !values.includes(option));
    return (
        <div className="flex flex-wrap items-center gap-1" dir="ltr">
            {values.map((value) => (
                <span key={value} className="inline-flex h-6 items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.06] ps-1.5 font-mono text-[11px] text-zinc-100">
                    {value}
                    <button type="button" disabled={disabled} aria-label={`${t("removeBinding")}: ${value}`} title={t("removeBinding")} onClick={() => onChange(values.filter((item) => item !== value))} className="grid h-5 w-5 place-items-center rounded text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-40">
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}
            {values.length < INPUT_LIMITS.maxBindings ? (
                <select
                    value=""
                    disabled={disabled || available.length === 0}
                    aria-label={t("addBinding")}
                    onChange={(event) => {
                        const value = event.target.value as T;
                        if (value) onChange([...values, value]);
                    }}
                    className="h-6 max-w-[7.5rem] cursor-pointer rounded-md border border-dashed border-white/15 bg-transparent px-1.5 text-[11px] text-zinc-400 outline-none transition hover:border-white/30 hover:text-zinc-200 focus:border-indigo-400/70 disabled:opacity-40"
                >
                    <option value="" className="bg-zinc-900">{t("addBinding")}</option>
                    {available.map((option) => <option key={option} value={option} className="bg-zinc-900">{option}</option>)}
                </select>
            ) : null}
        </div>
    );
}
