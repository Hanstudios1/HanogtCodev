"use client";

/**
 * V6 tile kinds in the Tilemap inspector: rule tiles (auto-tiling from the 16
 * or 47 cases of a 4- or 8-neighbour tileset, defined in a dialog by clicking
 * atlas cells), animated tiles (frames + fps) and one-way platforms.
 */
import { Grid3x3 } from "lucide-react";
import { useEffect, useState } from "react";
import { animatedTileFrame, consecutiveRuleFrames, convertRuleFrames, ruleSlotCount, ruleSlotPattern } from "@/lib/game-engine/tilemap";
import type { TileDefinition } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { atlasCellStyle, TileSwatch, type TileAtlasView } from "./tile-swatch";
import { Button, Checkbox, FieldRow, Modal, NumberInput, SelectInput, TextInput, Toggle, cx } from "./ui";

type TileKind = "normal" | "rule" | "animated";

/** Changes the selected palette tile (one undo step per field). */
export type TileUpdate = (field: string, recipe: (tile: TileDefinition) => void) => void;

const kindOf = (tile: TileDefinition): TileKind => (tile.rule ? "rule" : tile.animation ? "animated" : "normal");

/** "4, 5, 6" → [4, 5, 6] (cells of the atlas, at most 32). */
export function parseFrameList(text: string, frameCount: number): number[] {
    return text.split(/[\s,;]+/).filter(Boolean).map(Number).filter((frame) => Number.isInteger(frame) && frame >= 0 && frame < Math.max(1, frameCount)).slice(0, 32);
}

/** The 3×3 neighbour picture of a rule case. */
function CasePattern({ pattern }: { pattern: Array<boolean | null> }) {
    return (
        <span aria-hidden="true" className="grid shrink-0 grid-cols-3 gap-px">
            {pattern.map((cell, index) => (
                <span
                    key={index}
                    className={cx(
                        "h-[6px] w-[6px] rounded-[1px]",
                        index === 4 ? "bg-white" : cell === true ? "bg-indigo-300" : cell === false ? "border border-white/30" : "bg-white/[0.07]",
                    )}
                />
            ))}
        </span>
    );
}

/** An animated tile's swatch, playing at the tile's speed. */
function AnimatedSwatch({ tile, atlas }: { tile: TileDefinition; atlas: TileAtlasView | null }) {
    const [time, setTime] = useState(0);
    const animation = tile.animation;
    useEffect(() => {
        if (!animation || animation.frames.length < 2) return;
        const started = performance.now();
        const timer = window.setInterval(() => setTime((performance.now() - started) / 1000), Math.max(33, 1000 / animation.fps));
        return () => window.clearInterval(timer);
    }, [animation]);
    const frame = animation?.frames.length ? animatedTileFrame(animation, time) : tile.frame;
    return <TileSwatch tile={tile} atlas={atlas} frame={frame} className="h-8 w-8 shrink-0" />;
}

/** The rule-tile dialog: cases on one side, the atlas to pick cells from on the other. */
function RuleTileDialog({ tile, atlas, frameCount, disabled, update, onClose }: {
    tile: TileDefinition;
    atlas: TileAtlasView | null;
    frameCount: number;
    disabled: boolean;
    update: TileUpdate;
    onClose: () => void;
}) {
    const { t } = useEditor();
    const [slot, setSlot] = useState(0);
    const [start, setStart] = useState(0);
    const rule = tile.rule;
    if (!rule) return null;
    const count = ruleSlotCount(rule.neighbors);
    const current = rule.frames[slot] ?? -1;
    const setFrame = (target: number, frame: number) => update(`rule:${target}`, (draft) => {
        if (draft.rule) draft.rule.frames[target] = frame;
    });
    const pickCell = (frame: number) => {
        if (disabled) return;
        setFrame(slot, frame);
        setSlot((slot + 1) % count);
    };
    const columns = atlas?.columns ?? 1;
    const rows = atlas?.rows ?? 1;

    return (
        <Modal open title={t("ruleDialogTitle").replace("{name}", tile.name)} onClose={onClose} width="max-w-4xl" icon={Grid3x3} footer={<Button variant="primary" onClick={onClose}>{t("close")}</Button>}>
            <div className="space-y-3">
                <p className="text-[12px] leading-relaxed text-zinc-400">{t("ruleDialogHelp")}</p>
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2">
                    <label className="grid gap-1 text-[11px] text-zinc-400">
                        {t("ruleFillFrom")}
                        <span className="w-20"><NumberInput value={start} min={0} max={Math.max(0, frameCount - count)} integer step={1} disabled={disabled} onChange={(value) => setStart(Math.max(0, Math.round(value)))} /></span>
                    </label>
                    <Button disabled={disabled || !atlas} onClick={() => update("rule:fill", (draft) => {
                        if (draft.rule) draft.rule.frames = consecutiveRuleFrames(draft.rule.neighbors, start).map((frame) => (frame < frameCount ? frame : -1));
                    })}>{t("ruleFill")}</Button>
                    <Button variant="ghost" disabled={disabled || rule.frames.every((frame) => frame < 0)} onClick={() => update("rule:clear", (draft) => {
                        if (draft.rule) draft.rule.frames = draft.rule.frames.map(() => -1);
                    })}>{t("ruleClear")}</Button>
                    <p className="basis-full text-[11px] leading-snug text-zinc-500">{t("ruleFillHint").replace("{count}", String(count))} {t("ruleUnsetHint")}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                        <div className={cx("grid gap-1", count > 16 ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-4")} role="radiogroup" aria-label={t("tileKindRule")}>
                            {Array.from({ length: count }, (_, index) => {
                                const frame = rule.frames[index] ?? -1;
                                const label = `${t("ruleCase").replace("{slot}", String(index))} · ${frame >= 0 ? `#${frame}` : t("ruleCaseUnset")}`;
                                return (
                                    <button
                                        key={index}
                                        type="button"
                                        role="radio"
                                        aria-checked={slot === index}
                                        aria-label={label}
                                        title={label}
                                        onClick={() => setSlot(index)}
                                        className={cx("flex items-center justify-center gap-1.5 rounded-md border p-1.5 transition", slot === index ? "border-indigo-300 bg-indigo-500/20 ring-1 ring-indigo-300/60" : "border-white/10 bg-white/[0.03] hover:border-white/25")}
                                    >
                                        <CasePattern pattern={ruleSlotPattern(rule.neighbors, index)} />
                                        {atlas && frame >= 0
                                            ? <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-[3px] border border-black/30" style={atlasCellStyle(atlas.dataUrl, columns, rows, Math.min(frame, columns * rows - 1))} />
                                            : <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] border border-dashed border-white/20 text-[9px] text-zinc-500">{frame >= 0 ? frame : "–"}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-zinc-300">
                            <CasePattern pattern={ruleSlotPattern(rule.neighbors, slot)} />
                            <span>{t("ruleCase").replace("{slot}", String(slot))}</span>
                            <span className="w-20"><NumberInput value={current} min={-1} max={Math.max(0, frameCount - 1)} integer step={1} disabled={disabled} onChange={(frame) => setFrame(slot, Math.round(frame))} /></span>
                            {current < 0 ? <span className="text-zinc-500">{t("ruleCaseUnset")}</span> : null}
                        </div>
                    </div>

                    <div>
                        <p className="pb-1 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("ruleAtlas")}</p>
                        {atlas ? (
                            <div
                                className={cx("relative w-full select-none overflow-hidden rounded-md border border-white/10 bg-zinc-950", disabled ? "cursor-not-allowed" : "cursor-crosshair")}
                                style={{ aspectRatio: `${Math.max(1, atlas.width ?? columns)} / ${Math.max(1, atlas.height ?? rows)}` }}
                                onClick={(event) => {
                                    const bounds = event.currentTarget.getBoundingClientRect();
                                    const column = Math.min(columns - 1, Math.max(0, Math.floor(((event.clientX - bounds.left) / bounds.width) * columns)));
                                    const row = Math.min(rows - 1, Math.max(0, Math.floor(((event.clientY - bounds.top) / bounds.height) * rows)));
                                    pickCell(row * columns + column);
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element -- a project texture (data URL) */}
                                <img src={atlas.dataUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />
                                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${columns} ${rows}`} preserveAspectRatio="none" aria-hidden="true">
                                    {Array.from({ length: columns - 1 }, (_, index) => <line key={`c${index}`} x1={index + 1} y1={0} x2={index + 1} y2={rows} stroke="rgba(255,255,255,0.25)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                                    {Array.from({ length: rows - 1 }, (_, index) => <line key={`r${index}`} x1={0} y1={index + 1} x2={columns} y2={index + 1} stroke="rgba(255,255,255,0.25)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                                    {current >= 0 && current < columns * rows ? <rect x={current % columns} y={Math.floor(current / columns)} width={1} height={1} fill="rgba(129,140,248,0.25)" stroke="#a5b4fc" strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
                                </svg>
                            </div>
                        ) : <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-200">{t("tileNeedsAtlas")}</p>}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

/** Type (normal / rule / animated) and one-way settings of the selected palette tile. */
export function TileKindFields({ tile, atlas, frameCount, disabled, update }: {
    tile: TileDefinition;
    atlas: TileAtlasView | null;
    frameCount: number;
    disabled: boolean;
    update: TileUpdate;
}) {
    const { t } = useEditor();
    const [dialog, setDialog] = useState(false);
    const kind = kindOf(tile);
    const setKind = (next: TileKind) => update("kind", (draft) => {
        if (next === "rule") {
            draft.rule = draft.rule ?? { neighbors: 4, frames: Array.from({ length: 16 }, () => -1), matchAny: false };
            draft.animation = null;
        } else if (next === "animated") {
            draft.rule = null;
            draft.animation = draft.animation ?? { frames: [Math.max(0, draft.frame)], fps: 8 };
        } else {
            draft.rule = null;
            draft.animation = null;
        }
        // Atlas cells show their own colors (the tile color tints them).
        if (next !== "normal" && atlas) draft.color = "#ffffff";
    });
    const set = tile.rule ? tile.rule.frames.filter((frame) => frame >= 0).length : 0;

    return (
        <>
            <FieldRow label={t("tileKind")}>
                <SelectInput<TileKind>
                    value={kind}
                    disabled={disabled}
                    onChange={setKind}
                    options={[
                        { value: "normal", label: t("tileKindNormal") },
                        { value: "rule", label: t("tileKindRule") },
                        { value: "animated", label: t("tileKindAnimated") },
                    ]}
                />
            </FieldRow>
            {kind !== "normal" && !atlas ? <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-200">{t("tileNeedsAtlas")}</p> : null}
            {tile.rule ? (
                <>
                    <FieldRow label={t("tileNeighbors")}>
                        <SelectInput<"4" | "8">
                            value={String(tile.rule.neighbors) as "4" | "8"}
                            disabled={disabled}
                            onChange={(value) => update("rule:neighbors", (draft) => {
                                if (!draft.rule) return;
                                const neighbors = value === "8" ? 8 : 4;
                                draft.rule = { ...draft.rule, frames: convertRuleFrames(draft.rule, neighbors), neighbors };
                            })}
                            options={[{ value: "4", label: t("tileNeighbors4") }, { value: "8", label: t("tileNeighbors8") }]}
                        />
                    </FieldRow>
                    <label className="flex items-center gap-2 py-[3px] text-[11.5px] text-zinc-400">
                        <Checkbox checked={tile.rule.matchAny} disabled={disabled} onChange={(value) => update("rule:matchAny", (draft) => { if (draft.rule) draft.rule.matchAny = value; })} />
                        {t("tileMatchAny")}
                    </label>
                    <div className="flex items-center gap-2 py-1">
                        <Button className="h-7 flex-1" onClick={() => setDialog(true)}><Grid3x3 className="h-3.5 w-3.5" />{t("tileRuleEdit")}</Button>
                        <span className="shrink-0 text-[11px] text-zinc-500">{t("tileRuleCases").replace("{set}", String(set)).replace("{total}", String(tile.rule.frames.length))}</span>
                    </div>
                    <p className="text-[11px] leading-snug text-zinc-500">{t("tileRuleHint")}</p>
                    {dialog ? <RuleTileDialog tile={tile} atlas={atlas} frameCount={frameCount} disabled={disabled} update={update} onClose={() => setDialog(false)} /> : null}
                </>
            ) : null}
            {tile.animation ? (
                <>
                    <FieldRow label={t("tileAnimFrames")} title={t("tileAnimFramesHint")}>
                        <div className="flex items-center gap-1.5">
                            <TextInput
                                value={tile.animation.frames.join(", ")}
                                placeholder={t("tileAnimFramesHint")}
                                disabled={disabled}
                                onChange={(text) => {
                                    const frames = parseFrameList(text, frameCount);
                                    if (frames.length) update("animation:frames", (draft) => { if (draft.animation) draft.animation.frames = frames; });
                                }}
                            />
                            <AnimatedSwatch tile={tile} atlas={atlas} />
                        </div>
                    </FieldRow>
                    <FieldRow label={t("tileAnimFps")}>
                        <NumberInput value={tile.animation.fps} min={0.1} max={60} step={1} disabled={disabled} onChange={(fps) => update("animation:fps", (draft) => { if (draft.animation) draft.animation.fps = fps; })} />
                    </FieldRow>
                </>
            ) : null}
            {tile.solid ? (
                <FieldRow label={t("tileOneWay")} title={t("tileOneWayHint")}>
                    <Toggle checked={Boolean(tile.oneWay)} disabled={disabled} label={t("tileOneWay")} onChange={(value) => update("oneWay", (draft) => { draft.oneWay = value; })} />
                </FieldRow>
            ) : null}
        </>
    );
}
