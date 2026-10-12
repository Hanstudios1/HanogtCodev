"use client";

/**
 * Project settings → Touch (V6): the on-screen controls players get on phones
 * and tablets — the V5 arrow pad or a virtual joystick (side, size, dead zone)
 * and up to four buttons, each pressing an input action.
 */
import { Plus, Smartphone, Trash2 } from "lucide-react";
import { cleanTouchLabel, defaultTouchLayout, TOUCH_LIMITS } from "@/lib/game-engine/touch-controls";
import type { TouchLayout } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { touch } from "./operations";
import { useEditorState } from "./store";
import { Button, FieldRow, IconButton, SelectInput, SliderInput, TextInput, Toggle, cx } from "./ui";

/** Where the preview draws things: a 16:9 phone held sideways, 320 px wide. */
const PREVIEW_SCALE = 320 / 844;

/** A small picture of the layout (positions follow the player's overlay). */
function TouchPreview({ layout }: { layout: TouchLayout }) {
    const { t } = useEditor();
    const stickSide = layout.side;
    const buttonSide = stickSide === "left" ? "right" : "left";
    const px = (value: number) => `${Math.round(value * PREVIEW_SCALE)}px`;
    const spots: Record<number, Array<[number, number, number]>> = {
        1: [[28, 44, 72]],
        2: [[20, 56, 66], [96, 20, 58]],
        3: [[18, 70, 62], [92, 22, 58], [92, 112, 58]],
        4: [[14, 66, 58], [80, 14, 58], [80, 118, 58], [146, 66, 58]],
    };
    const buttons = layout.buttons.length ? layout.buttons.map((button) => button.label) : ["A", "B"];
    const placed = layout.buttons.length ? spots[layout.buttons.length] : [[20, 56, 66], [96, 20, 58]] as Array<[number, number, number]>;
    const shape = "absolute grid place-items-center border border-white/30 bg-zinc-900/70 font-bold text-white";
    return (
        <div className="relative mx-auto aspect-[844/390] w-full max-w-[320px] overflow-hidden rounded-xl border border-white/15 bg-zinc-800" aria-label={t("touchPreview")} role="img">
            <span className="absolute left-2 top-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-zinc-500">{t("touchPreview")}</span>
            {layout.stick === "joystick" ? (
                <span className={cx(shape, "rounded-full")} style={{ [stickSide]: px(24), bottom: px(24), width: px(layout.size), height: px(layout.size) }}>
                    <span className="block rounded-full border border-white/50 bg-white/30" style={{ width: px(layout.size * 0.42), height: px(layout.size * 0.42) }} />
                </span>
            ) : (
                ([["LeftArrow", stickSide === "left" ? 16 : 136, 40], ["RightArrow", stickSide === "left" ? 136 : 16, 40], ["UpArrow", 76, 96], ["DownArrow", 76, 12]] as Array<[string, number, number]>).map(([key, x, y]) => (
                    <span key={key} className={cx(shape, "rounded-md")} style={{ [stickSide]: px(x), bottom: px(y), width: px(58), height: px(58) }} />
                ))
            )}
            {placed.map(([x, y, size], index) => (
                <span key={index} className={cx(shape, "rounded-full text-[8px]")} style={{ [buttonSide]: px(x), bottom: px(y), width: px(size), height: px(size) }}>{buttons[index]}</span>
            ))}
        </div>
    );
}

export function TouchControlsPanel({ disabled }: { disabled: boolean }) {
    const { store, t } = useEditor();
    const enabled = useEditorState(store, (state) => state.project.settings.touchControls);
    const layout = useEditorState(store, (state) => state.project.settings.touchLayout);
    const actions = useEditorState(store, (state) => state.project.settings.input.actions);
    const update = (key: string, recipe: (draft: TouchLayout) => void) => store.update(t("touchTab"), (draft) => {
        // Projects opened before the schema knew layouts still get one to edit.
        draft.settings.touchLayout ??= defaultTouchLayout();
        recipe(draft.settings.touchLayout);
        touch(draft);
    }, { mergeKey: `touch:${key}` });
    const actionOptions = actions.map((action) => ({ value: action.name, label: action.kind === "axis" ? `${action.name} (+)` : action.name }));
    const unused = actions.find((action) => action.kind === "button" && !layout.buttons.some((button) => button.action === action.name));

    return (
        <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-zinc-400">{t("touchIntro")}</p>
            <FieldRow label={t("touchControls")}>
                <Toggle checked={enabled} disabled={disabled} onChange={(value) => store.update(t("touchTab"), (draft) => { draft.settings.touchControls = value; touch(draft); }, { mergeKey: "touch:enabled" })} />
            </FieldRow>
            <div className={cx("space-y-1", !enabled && "opacity-50")}>
                <FieldRow label={t("touchStick")}>
                    <SelectInput<TouchLayout["stick"]>
                        value={layout.stick}
                        disabled={disabled || !enabled}
                        onChange={(stick) => update("stick", (draft) => { draft.stick = stick; })}
                        options={[{ value: "joystick", label: t("touchJoystick") }, { value: "dpad", label: t("touchDpad") }]}
                    />
                </FieldRow>
                <FieldRow label={t("touchSide")}>
                    <SelectInput<TouchLayout["side"]>
                        value={layout.side}
                        disabled={disabled || !enabled}
                        onChange={(side) => update("side", (draft) => { draft.side = side; })}
                        options={[{ value: "left", label: t("touchSideLeft") }, { value: "right", label: t("touchSideRight") }]}
                    />
                </FieldRow>
                {layout.stick === "joystick" ? (
                    <>
                        <FieldRow label={t("touchSize")}><SliderInput value={layout.size} min={TOUCH_LIMITS.minSize} max={TOUCH_LIMITS.maxSize} step={2} integer disabled={disabled || !enabled} onChange={(size) => update("size", (draft) => { draft.size = Math.round(size); })} /></FieldRow>
                        <FieldRow label={t("touchDeadZone")}><SliderInput value={layout.deadZone} min={0} max={TOUCH_LIMITS.maxDeadZone} step={0.01} disabled={disabled || !enabled} onChange={(deadZone) => update("deadZone", (draft) => { draft.deadZone = deadZone; })} /></FieldRow>
                        <p className="text-[11px] leading-snug text-zinc-500">{t("touchJoystickHint")}</p>
                    </>
                ) : null}

                <div className="pt-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("touchButtons")}</h3>
                        <Button
                            disabled={disabled || !enabled || layout.buttons.length >= TOUCH_LIMITS.maxButtons || !actions.length}
                            onClick={() => update(`add:${layout.buttons.length}`, (draft) => {
                                const action = unused?.name ?? actions[0]?.name;
                                if (!action || draft.buttons.length >= TOUCH_LIMITS.maxButtons) return;
                                draft.buttons.push({ action, label: cleanTouchLabel(String.fromCharCode(65 + draft.buttons.length), "A") });
                            })}
                        ><Plus className="h-3.5 w-3.5" />{t("touchAddButton")}</Button>
                    </div>
                    {layout.buttons.length ? (
                        <div className="space-y-1">
                            {layout.buttons.map((button, index) => (
                                <div key={index} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-1.5">
                                    <TextInput
                                        value={button.label}
                                        maxLength={TOUCH_LIMITS.labelLength}
                                        disabled={disabled || !enabled}
                                        placeholder={t("touchLabel")}
                                        onChange={(value) => update(`label:${index}`, (draft) => { draft.buttons[index].label = cleanTouchLabel(value, draft.buttons[index].label); })}
                                    />
                                    <SelectInput
                                        value={button.action}
                                        disabled={disabled || !enabled}
                                        onChange={(action) => update(`action:${index}`, (draft) => { draft.buttons[index].action = action; })}
                                        options={actionOptions.some((option) => option.value === button.action) ? actionOptions : [{ value: button.action, label: `${button.action} (${t("touchMissingAction")})` }, ...actionOptions]}
                                    />
                                    <IconButton icon={Trash2} label={t("delete")} size="sm" disabled={disabled || !enabled} onClick={() => update(`remove:${index}`, (draft) => { draft.buttons.splice(index, 1); })} />
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-[11px] leading-snug text-zinc-500">{t("touchNoButtons")}</p>}
                    <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">{t("touchButtonsHint")}</p>
                </div>
            </div>
            <TouchPreview layout={layout} />
            <p className="flex gap-1.5 text-[11px] leading-snug text-zinc-500"><Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("touchVibrateHint")}</p>
        </div>
    );
}
