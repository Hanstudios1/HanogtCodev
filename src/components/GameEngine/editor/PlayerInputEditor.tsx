"use client";

/** Inspector of Player Input (V5 local multiplayer): the player, its control scheme and gamepad, and the keys it gets. */
import { inputSourceOf, playerKeys } from "@/lib/game-engine/input-actions";
import { MAX_LOCAL_PLAYERS, PLAYER_INPUT_SCHEMES, type PlayerInputComponent, type PlayerInputScheme } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { useComponentEdit, type Editor } from "./inspector-fields";
import { useEditorState } from "./store";
import type { TextKey } from "./text";
import { FieldRow, SelectInput } from "./ui";

const KEY_LABELS: Record<string, string> = {
    UpArrow: "↑", DownArrow: "↓", LeftArrow: "←", RightArrow: "→", Return: "Enter", KeypadEnter: "Num Enter", Escape: "Esc",
    LeftShift: "L Shift", RightShift: "R Shift", LeftControl: "L Ctrl", RightControl: "R Ctrl", LeftAlt: "L Alt", RightAlt: "R Alt",
    Mouse0: "Mouse L", Mouse1: "Mouse R", Mouse2: "Mouse M",
};

const keyLabel = (key: string) => KEY_LABELS[key] ?? key.replace(/^Alpha/, "").replace(/^Keypad/, "Num ");

const SCHEME_TEXT: Record<PlayerInputScheme, TextKey> = {
    auto: "schemeAuto",
    keyboard: "schemeKeyboard",
    keyboardLeft: "schemeKeyboardLeft",
    keyboardRight: "schemeKeyboardRight",
    gamepad: "schemeGamepad",
};

const players = Array.from({ length: MAX_LOCAL_PLAYERS }, (_, index) => String(index + 1));

export function PlayerInputEditor({ entity, component, disabled }: Editor<PlayerInputComponent>) {
    const { store, t } = useEditor();
    const actions = useEditorState(store, (state) => state.project.settings.input.actions);
    const edit = useComponentEdit(entity.id, component);
    const spec = inputSourceOf(component);
    const rows = actions.map((action) => ({
        name: action.name,
        keys: [...new Set([...playerKeys(action.negative, spec), ...playerKeys(action.positive, spec)])],
        pad: spec.pad === null ? [] : [...action.gamepadNegative, ...action.gamepadPositive, ...(action.gamepadAxis ? [action.gamepadAxis] : [])],
    }));
    return (
        <div className="space-y-0.5" data-player-input-editor>
            <FieldRow label={t("playerNumber")}>
                <SelectInput
                    value={String(component.player)}
                    disabled={disabled}
                    onChange={(value) => edit("player", (draft) => {
                        // The gamepad follows the player number while it still matched it.
                        if (draft.gamepad === draft.player) draft.gamepad = Number(value);
                        draft.player = Number(value);
                    })}
                    options={players.map((value) => ({ value, label: t("playerLabel").replace("{n}", value) }))}
                />
            </FieldRow>
            <FieldRow label={t("controlScheme")}>
                <SelectInput value={component.scheme} disabled={disabled} onChange={(scheme) => edit("scheme", (draft) => { draft.scheme = scheme; })} options={PLAYER_INPUT_SCHEMES.map((value) => ({ value, label: t(SCHEME_TEXT[value]) }))} />
            </FieldRow>
            {spec.pad !== null ? (
                <FieldRow label="Gamepad">
                    <SelectInput value={String(component.gamepad)} disabled={disabled} onChange={(value) => edit("gamepad", (draft) => { draft.gamepad = Number(value); })} options={players.map((value) => ({ value, label: `Gamepad ${value}` }))} />
                </FieldRow>
            ) : null}
            <p className="pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("playerBindings")}</p>
            <ul className="space-y-1 rounded-md border border-white/[0.06] bg-zinc-950/40 p-1.5 text-[11px]">
                {rows.map((row) => (
                    <li key={row.name} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-1.5">
                        <span className="truncate pt-0.5 font-medium text-zinc-300">{row.name}</span>
                        <span className="flex flex-wrap gap-1">
                            {row.keys.map((key) => <kbd key={key} className="rounded border border-white/10 bg-white/[0.04] px-1 font-mono text-[10.5px] text-zinc-200">{keyLabel(key)}</kbd>)}
                            {row.pad.length ? <span className="rounded bg-sky-500/10 px-1 text-[10.5px] text-sky-200">Gamepad {component.gamepad}: {row.pad.join(", ")}</span> : null}
                            {!row.keys.length && !row.pad.length ? <span className="text-amber-300/80">{t("noBinding")}</span> : null}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="pt-1 text-[11px] leading-snug text-zinc-500">{t("playerInputHint")}</p>
        </div>
    );
}
