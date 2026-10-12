"use client";

/**
 * Inspector of the Particle System (Particles V2, V6): the V5 settings plus
 * the emission shape, timed bursts, a color gradient and a size curve over
 * lifetime, an image and a sub-emitter that fires where particles die.
 */
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { createParticleSystem, createTransform } from "@/lib/game-engine/components";
import { createEngineId } from "@/lib/game-engine/ids";
import { particleColorAt, particleSizeAt } from "@/lib/game-engine/runtime/particles";
import { uniqueName } from "@/lib/game-engine/scene";
import { PARTICLE_SHAPES, type ParticleShape, type ParticleSystemComponent } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { TextureSelect, useComponentEdit, type Editor } from "./inspector-fields";
import { activeScene, touch } from "./operations";
import { useEditorState } from "./store";
import type { TextKey } from "./text";
import { Button, ColorInput, FieldRow, IconButton, NumberInput, SelectInput, SliderInput, Toggle, VectorInput } from "./ui";

const SHAPE_LABELS: Record<ParticleShape, TextKey> = {
    point: "particleShapePoint",
    circle: "particleShapeCircle",
    cone: "particleShapeCone",
    box: "particleShapeBox",
    edge: "particleShapeEdge",
};

function Heading({ children }: { children: string }) {
    return <p className="pb-0.5 pt-2.5 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{children}</p>;
}

/** A row of solid cells sampled from the color over lifetime (opacity shows as the cell's opacity). */
function ColorRamp({ component }: { component: ParticleSystemComponent }) {
    const cells = 32;
    const out = [0, 0, 0, 0];
    const toSrgb = (value: number) => Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055));
    return (
        <div className="flex h-4 overflow-hidden rounded border border-white/10 bg-zinc-800" aria-hidden>
            {Array.from({ length: cells }, (_, index) => {
                particleColorAt(component, index / (cells - 1), out);
                return <span key={index} className="h-full flex-1" style={{ backgroundColor: `rgb(${toSrgb(out[0])}, ${toSrgb(out[1])}, ${toSrgb(out[2])})`, opacity: Math.max(0.08, out[3]) }} />;
            })}
        </div>
    );
}

/** The size over lifetime as a small line chart. */
function SizePreview({ component }: { component: ParticleSystemComponent }) {
    const samples = 24;
    const sizes = Array.from({ length: samples + 1 }, (_, index) => particleSizeAt(component, index / samples));
    const top = Math.max(0.001, ...sizes);
    const points = sizes.map((size, index) => `${(index / samples) * 100},${28 - (size / top) * 24}`).join(" ");
    return (
        <svg viewBox="0 0 100 30" className="h-8 w-full rounded border border-white/10 bg-zinc-950/60" preserveAspectRatio="none" aria-hidden>
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="text-pink-300" />
        </svg>
    );
}

export function ParticleEditor({ entity, component, disabled }: Editor<ParticleSystemComponent>) {
    const { store, t } = useEditor();
    const edit = useComponentEdit(entity.id, component);
    const scene = useEditorState(store, (state) => activeScene(state.project));
    const number = (label: string, key: keyof ParticleSystemComponent, options: { min?: number; max?: number; step?: number; integer?: boolean } = {}) => (
        <FieldRow label={label}>
            <NumberInput value={component[key] as number} min={options.min} max={options.max} step={options.step ?? 0.1} integer={options.integer} disabled={disabled} onChange={(value) => edit(String(key), (draft) => { (draft as unknown as Record<string, number>)[key] = value; })} />
        </FieldRow>
    );
    const shape = component.shape;
    const gradient = component.colorStops.length >= 2;
    const subTargets = scene.objects.filter((item) => item.id !== entity.id && item.components.some((candidate) => candidate.type === "particleSystem"));

    const createSubEmitter = () => store.update(t("particleCreateSubEmitter"), (draft) => {
        const target = activeScene(draft);
        const owner = target.objects.find((item) => item.id === entity.id);
        const system = owner?.components.find((item) => item.id === component.id);
        if (!owner || system?.type !== "particleSystem") return;
        const child = {
            id: createEngineId("entity"),
            name: uniqueName(`${owner.name} Sparks`, target.objects.map((item) => item.name)),
            tag: "Untagged",
            layer: owner.layer,
            parentId: owner.id,
            active: true,
            components: [
                createTransform(),
                createParticleSystem({ playOnStart: false, loop: false, emissionRate: 0, lifetime: 0.45, startSpeed: 2.5, spread: 180, startSize: 0.14, endSize: 0, startColor: system.endColor, endColor: system.endColor, maxParticles: 400, worldSpace: true }),
            ],
        };
        target.objects.push(child);
        system.subEmitterId = child.id;
        touch(draft);
    });

    return (
        <div className="space-y-0.5">
            <FieldRow label="Play On Start"><Toggle checked={component.playOnStart} disabled={disabled} onChange={(value) => edit("playOnStart", (draft) => { draft.playOnStart = value; })} /></FieldRow>
            <FieldRow label="Looping"><Toggle checked={component.loop} disabled={disabled} onChange={(value) => edit("loop", (draft) => { draft.loop = value; })} /></FieldRow>
            {number("Duration", "duration", { min: 0.05, step: 0.1 })}
            {number("Max Particles", "maxParticles", { min: 1, max: 4000, step: 10, integer: true })}
            {number("Lifetime", "lifetime", { min: 0.05, step: 0.1 })}
            {number("Start Speed", "startSpeed", { step: 0.1 })}
            {number("Gravity Modifier", "gravityModifier", { step: 0.1 })}
            <FieldRow label="World Space"><Toggle checked={component.worldSpace} disabled={disabled} onChange={(value) => edit("worldSpace", (draft) => { draft.worldSpace = value; })} /></FieldRow>

            <Heading>{t("particleEmission")}</Heading>
            {number("Rate over Time", "emissionRate", { min: 0, step: 1 })}
            <FieldRow label={t("particleStartBurst")}>
                <NumberInput value={component.burstCount} min={0} step={1} integer disabled={disabled} onChange={(value) => edit("burstCount", (draft) => { draft.burstCount = value; })} />
            </FieldRow>
            <div className="space-y-1 py-1">
                {component.bursts.length ? (
                    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1 px-0.5 text-[10px] text-zinc-500">
                        <span>{t("particleBurstTime")}</span><span>{t("particleBurstCount")}</span><span>{t("particleBurstCycles")}</span><span>{t("particleBurstInterval")}</span><span className="w-6" />
                    </div>
                ) : null}
                {component.bursts.map((burst, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-1">
                        <NumberInput value={burst.time} min={0} step={0.1} disabled={disabled} onChange={(value) => edit(`burst:${index}:time`, (draft) => { draft.bursts[index].time = Math.max(0, value); })} />
                        <NumberInput value={burst.count} min={0} step={1} integer disabled={disabled} onChange={(value) => edit(`burst:${index}:count`, (draft) => { draft.bursts[index].count = Math.max(0, Math.round(value)); })} />
                        <NumberInput value={burst.cycles} min={0} step={1} integer disabled={disabled} onChange={(value) => edit(`burst:${index}:cycles`, (draft) => { draft.bursts[index].cycles = Math.max(0, Math.round(value)); })} />
                        <NumberInput value={burst.interval} min={0.01} step={0.05} disabled={disabled} onChange={(value) => edit(`burst:${index}:interval`, (draft) => { draft.bursts[index].interval = Math.max(0.01, value); })} />
                        <IconButton icon={Trash2} label={t("deleteLabel")} size="sm" disabled={disabled} onClick={() => edit("bursts", (draft) => { draft.bursts.splice(index, 1); })} />
                    </div>
                ))}
                <Button disabled={disabled || component.bursts.length >= 8} onClick={() => edit("bursts", (draft) => { draft.bursts.push({ time: 0, count: 10, cycles: 1, interval: 0.5 }); })}><Plus className="h-3.5 w-3.5" />{t("particleAddBurst")}</Button>
            </div>

            <Heading>{t("particleShape")}</Heading>
            <FieldRow label={t("particleShape")}>
                <SelectInput value={shape} disabled={disabled} onChange={(value) => edit("shape", (draft) => { draft.shape = value; })} options={PARTICLE_SHAPES.map((item) => ({ value: item, label: t(SHAPE_LABELS[item]) }))} />
            </FieldRow>
            {shape === "circle" || shape === "cone" ? (
                <>
                    {number(t("particleRadius"), "shapeRadius", { min: 0, step: 0.1 })}
                    <FieldRow label={t("particleThickness")}><SliderInput value={component.radiusThickness} min={0} max={1} disabled={disabled} onChange={(value) => edit("radiusThickness", (draft) => { draft.radiusThickness = value; })} /></FieldRow>
                </>
            ) : null}
            {shape === "circle" ? <FieldRow label={t("particleArc")}><SliderInput value={component.arc} min={0} max={360} step={1} disabled={disabled} onChange={(value) => edit("arc", (draft) => { draft.arc = value; })} /></FieldRow> : null}
            {shape === "box" ? <FieldRow label={t("particleBoxSize")}><VectorInput value={component.boxSize} disabled={disabled} onChange={(value) => edit("boxSize", (draft) => { draft.boxSize = { x: Math.max(0, value.x), y: Math.max(0, value.y), z: Math.max(0, value.z) }; })} /></FieldRow> : null}
            {shape === "edge" ? number(t("particleEdgeLength"), "edgeLength", { min: 0, step: 0.1 }) : null}
            {shape !== "circle" ? (
                <FieldRow label={t("particleConeAngle")}><SliderInput value={component.spread} min={0} max={shape === "cone" ? 89 : 180} step={1} disabled={disabled} onChange={(value) => edit("spread", (draft) => { draft.spread = value; })} /></FieldRow>
            ) : null}

            <Heading>{t("particleColor")}</Heading>
            <FieldRow label={t("particleGradient")}>
                <Toggle checked={gradient} disabled={disabled} onChange={(value) => edit("colorStops", (draft) => {
                    // A new gradient starts from today's look: the start color fading into the end color.
                    draft.colorStops = value ? [{ time: 0, color: draft.startColor, alpha: 1 }, { time: 1, color: draft.endColor, alpha: 0 }] : [];
                })} />
            </FieldRow>
            {gradient ? (
                <div className="space-y-1 py-1">
                    <ColorRamp component={component} />
                    <div className="grid grid-cols-[1.2fr_1fr_1fr_auto] gap-1 px-0.5 text-[10px] text-zinc-500">
                        <span>{t("particleStopTime")}</span><span>{t("particleColor")}</span><span>{t("particleAlpha")}</span><span className="w-6" />
                    </div>
                    {component.colorStops.map((stop, index) => (
                        <div key={index} className="grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-1">
                            <NumberInput value={stop.time} min={0} max={1} step={0.05} precision={2} disabled={disabled} onChange={(value) => edit(`stop:${index}:time`, (draft) => {
                                draft.colorStops[index].time = Math.max(0, Math.min(1, value));
                                draft.colorStops.sort((a, b) => a.time - b.time);
                            })} />
                            <ColorInput value={stop.color} disabled={disabled} onChange={(color) => edit(`stop:${index}:color`, (draft) => { draft.colorStops[index].color = color; })} />
                            <NumberInput value={stop.alpha} min={0} max={1} step={0.05} precision={2} disabled={disabled} onChange={(value) => edit(`stop:${index}:alpha`, (draft) => { draft.colorStops[index].alpha = Math.max(0, Math.min(1, value)); })} />
                            <IconButton icon={Trash2} label={t("deleteLabel")} size="sm" disabled={disabled || component.colorStops.length <= 2} onClick={() => edit("colorStops", (draft) => { draft.colorStops.splice(index, 1); })} />
                        </div>
                    ))}
                    <Button disabled={disabled || component.colorStops.length >= 8} onClick={() => edit("colorStops", (draft) => {
                        // A new stop halfway into the widest gap, with the color the gradient has there.
                        let gap = 0;
                        for (let index = 1; index < draft.colorStops.length; index += 1) {
                            if (draft.colorStops[index].time - draft.colorStops[index - 1].time > draft.colorStops[gap + 1].time - draft.colorStops[gap].time) gap = index - 1;
                        }
                        const a = draft.colorStops[gap];
                        const b = draft.colorStops[gap + 1];
                        draft.colorStops.splice(gap + 1, 0, { time: (a.time + b.time) / 2, color: a.color, alpha: (a.alpha + b.alpha) / 2 });
                    })}><Plus className="h-3.5 w-3.5" />{t("particleAddStop")}</Button>
                </div>
            ) : (
                <>
                    <FieldRow label="Start Color"><ColorInput value={component.startColor} disabled={disabled} onChange={(color) => edit("startColor", (draft) => { draft.startColor = color; })} /></FieldRow>
                    <FieldRow label="End Color"><ColorInput value={component.endColor} disabled={disabled} onChange={(color) => edit("endColor", (draft) => { draft.endColor = color; })} /></FieldRow>
                </>
            )}

            <Heading>{t("particleSize")}</Heading>
            {number("Start Size", "startSize", { min: 0, step: 0.02 })}
            {number("End Size", "endSize", { min: 0, step: 0.02 })}
            <FieldRow label={t("particleSizeCurve")}>
                <Toggle checked={component.midSize !== null} disabled={disabled} onChange={(value) => edit("midSize", (draft) => { draft.midSize = value ? Math.max(draft.startSize, draft.endSize) * 1.5 : null; })} />
            </FieldRow>
            {component.midSize !== null ? (
                <>
                    <FieldRow label={t("particleMidSize")}><NumberInput value={component.midSize} min={0} step={0.02} disabled={disabled} onChange={(value) => edit("midSize", (draft) => { draft.midSize = Math.max(0, value); })} /></FieldRow>
                    <SizePreview component={component} />
                </>
            ) : null}

            <Heading>{t("particleTexture")}</Heading>
            <FieldRow label={t("particleTexture")}><TextureSelect value={component.textureId} disabled={disabled} onChange={(value) => edit("textureId", (draft) => { draft.textureId = value; })} /></FieldRow>
            {component.textureId ? <p className="px-0.5 text-[10.5px] leading-snug text-zinc-500">{t("particleTextureHint")}</p> : null}

            <Heading>{t("particleSubEmitter")}</Heading>
            <FieldRow label={t("particleSubEmitter")}>
                <SelectInput
                    value={component.subEmitterId ?? ""}
                    disabled={disabled}
                    onChange={(value) => edit("subEmitterId", (draft) => { draft.subEmitterId = value || null; })}
                    options={[{ value: "", label: t("none") }, ...subTargets.map((item) => ({ value: item.id, label: item.name }))]}
                />
            </FieldRow>
            {component.subEmitterId ? (
                <FieldRow label={t("particleSubEmitterCount")}><NumberInput value={component.subEmitterCount} min={1} max={50} step={1} integer disabled={disabled} onChange={(value) => edit("subEmitterCount", (draft) => { draft.subEmitterCount = Math.max(1, Math.min(50, Math.round(value))); })} /></FieldRow>
            ) : (
                <Button disabled={disabled} onClick={createSubEmitter}><Sparkles className="h-3.5 w-3.5" />{t("particleCreateSubEmitter")}</Button>
            )}
            <p className="px-0.5 pt-1 text-[10.5px] leading-snug text-zinc-500">{t("particleSubEmitterHint")}</p>
        </div>
    );
}
