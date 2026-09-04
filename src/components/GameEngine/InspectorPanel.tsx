"use client";

import { useState, type ReactNode } from "react";
import {
    Box,
    Camera,
    ChevronDown,
    Code2,
    Component,
    Eye,
    Gauge,
    Lightbulb,
    Move3d,
    Plus,
    RotateCw,
    Scale3d,
    Shapes,
} from "lucide-react";
import type { GameComponent, GameEntity, TransformComponent, Vector3 } from "@/lib/game-engine/types";
import { getTransform } from "./model";

type Props = {
    entity: GameEntity | null;
    onUpdateEntity: (updater: (entity: GameEntity) => GameEntity) => void;
    onAddComponent: (type: "rigidBody" | "collider") => void;
    onCreateScript: () => void;
    onEditScript: (component: Extract<GameComponent, { type: "script" }>) => void;
    className?: string;
};

const componentMeta: Record<GameComponent["type"], { label: string; icon: typeof Box }> = {
    transform: { label: "Transform", icon: Move3d },
    spriteRenderer: { label: "Sprite Renderer", icon: Shapes },
    meshRenderer: { label: "Mesh Renderer", icon: Box },
    camera: { label: "Camera", icon: Camera },
    light: { label: "Light", icon: Lightbulb },
    rigidBody: { label: "Rigid Body", icon: Gauge },
    collider: { label: "Collider", icon: Component },
    script: { label: "Script", icon: Code2 },
};

function NumberField({ label, value, axis, onChange }: { label: string; value: number; axis: "x" | "y" | "z"; onChange: (value: number) => void }) {
    const color = axis === "x" ? "text-red-500" : axis === "y" ? "text-emerald-500" : "text-blue-500";
    return (
        <label className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
            <span className={`px-2 text-[10px] font-black uppercase ${color}`}>{axis}</span>
            <span className="sr-only">{label}</span>
            <input
                type="number"
                step="0.1"
                value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
                onChange={(event) => onChange(Number(event.target.value) || 0)}
                className="min-w-0 flex-1 bg-transparent py-1.5 pr-1 text-right font-mono text-[11px] text-zinc-800 outline-none dark:text-zinc-100"
            />
        </label>
    );
}

function VectorEditor({ label, icon, value, onChange }: { label: string; icon: ReactNode; value: Vector3; onChange: (value: Vector3) => void }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">{icon}{label}</span>
            <div className="flex min-w-0 gap-1">
                {(["x", "y", "z"] as const).map((axis) => (
                    <NumberField key={axis} label={`${label} ${axis}`} axis={axis} value={value[axis]} onChange={(next) => onChange({ ...value, [axis]: next })} />
                ))}
            </div>
        </div>
    );
}

function Section({ title, icon: Icon, enabled = true, onEnabledChange, children }: { title: string; icon: typeof Box; enabled?: boolean; onEnabledChange?: (value: boolean) => void; children: ReactNode }) {
    const [open, setOpen] = useState(true);
    return (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex h-9 items-center gap-2 border-b border-zinc-200 px-2.5 dark:border-zinc-800">
                {onEnabledChange && <input aria-label={`${title} bileşenini etkinleştir`} type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} className="h-3.5 w-3.5 rounded accent-blue-600" />}
                <Icon className="h-3.5 w-3.5 text-blue-500" />
                <h3 className="flex-1 text-[11px] font-bold">{title}</h3>
                <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} /></button>
            </div>
            {open && <div className="space-y-2.5 p-3">{children}</div>}
        </section>
    );
}

export default function InspectorPanel({ entity, onUpdateEntity, onAddComponent, onCreateScript, onEditScript, className = "" }: Props) {
    const [addMenu, setAddMenu] = useState(false);

    const updateComponent = (id: string, updater: (component: GameComponent) => GameComponent) => {
        onUpdateEntity((current) => ({ ...current, components: current.components.map((component) => component.id === id ? updater(component) : component) }));
    };

    if (!entity) {
        return (
            <aside className={`flex min-h-0 flex-col border-l border-zinc-200 bg-zinc-50/95 dark:border-zinc-800 dark:bg-zinc-950/95 ${className}`} aria-label="Inspector">
                <div className="flex h-11 items-center border-b border-zinc-200 px-3 dark:border-zinc-800"><h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Inspector</h2></div>
                <div className="flex flex-1 flex-col items-center justify-center p-7 text-center"><MousePointerGraphic /><p className="mt-4 text-sm font-semibold">Bir nesne seçin</p><p className="mt-1 text-xs leading-5 text-zinc-500">Özellikleri düzenlemek için Hierarchy veya sahne görünümünden bir nesne seçin.</p></div>
            </aside>
        );
    }

    const transform = getTransform(entity);
    return (
        <aside className={`flex min-h-0 flex-col border-l border-zinc-200 bg-zinc-50/95 dark:border-zinc-800 dark:bg-zinc-950/95 ${className}`} aria-label={`${entity.name} özellikleri`}>
            <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800">
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Inspector</h2>
                <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">ID {entity.id.slice(-5)}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                <div className="flex items-center gap-2">
                    <input aria-label="Nesne etkin" type="checkbox" checked={entity.active} onChange={(event) => onUpdateEntity((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 rounded accent-blue-600" />
                    <input aria-label="Nesne adı" value={entity.name} maxLength={80} onChange={(event) => onUpdateEntity((current) => ({ ...current, name: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900" />
                </div>

                {transform && (
                    <Section title="Transform" icon={Move3d}>
                        <VectorEditor label="Konum" icon={<Move3d className="h-3 w-3" />} value={transform.position} onChange={(position) => updateComponent(transform.id, (component) => ({ ...(component as TransformComponent), position }))} />
                        <VectorEditor label="Dönüş" icon={<RotateCw className="h-3 w-3" />} value={transform.rotation} onChange={(rotation) => updateComponent(transform.id, (component) => ({ ...(component as TransformComponent), rotation }))} />
                        <VectorEditor label="Ölçek" icon={<Scale3d className="h-3 w-3" />} value={transform.scale} onChange={(scale) => updateComponent(transform.id, (component) => ({ ...(component as TransformComponent), scale }))} />
                    </Section>
                )}

                {entity.components.filter((component) => component.type !== "transform").map((component) => {
                    const meta = componentMeta[component.type];
                    return (
                        <Section key={component.id} title={meta.label} icon={meta.icon} enabled={component.enabled} onEnabledChange={(enabled) => updateComponent(component.id, (current) => ({ ...current, enabled }))}>
                            <ComponentFields component={component} onUpdate={(next) => updateComponent(component.id, () => next)} onEditScript={onEditScript} />
                        </Section>
                    );
                })}

                <div className="relative pt-1">
                    <button type="button" onClick={() => setAddMenu((value) => !value)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2.5 text-xs font-bold text-zinc-600 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-blue-950/20"><Plus className="h-4 w-4" />Bileşen ekle</button>
                    {addMenu && (
                        <div className="absolute bottom-12 left-0 right-0 z-30 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
                            <button type="button" onClick={() => { onAddComponent("rigidBody"); setAddMenu(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"><Gauge className="h-4 w-4 text-blue-500" />Rigid Body</button>
                            <button type="button" onClick={() => { onAddComponent("collider"); setAddMenu(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"><Component className="h-4 w-4 text-blue-500" />Collider</button>
                            <button type="button" onClick={() => { onCreateScript(); setAddMenu(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"><Code2 className="h-4 w-4 text-violet-500" />C# / C++ Script</button>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}

function ComponentFields({ component, onUpdate, onEditScript }: { component: GameComponent; onUpdate: (component: GameComponent) => void; onEditScript: Props["onEditScript"] }) {
    if (component.type === "meshRenderer") {
        return <><Readout label="Mesh" value={component.mesh.kind === "primitive" ? component.mesh.primitive : "Özel model"} /><label className="flex items-center justify-between text-[11px] text-zinc-500"><span>Materyal</span><span className="flex items-center gap-2"><input type="color" aria-label="Materyal rengi" value={component.material.color} onChange={(event) => onUpdate({ ...component, material: { ...component.material, color: event.target.value } })} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent" /><code>{component.material.color}</code></span></label><Range label="Pürüzlülük" value={component.material.roughness} onChange={(roughness) => onUpdate({ ...component, material: { ...component.material, roughness } })} /></>;
    }
    if (component.type === "spriteRenderer") {
        return <><label className="flex items-center justify-between text-[11px] text-zinc-500"><span>Renk</span><input type="color" aria-label="Sprite rengi" value={component.color} onChange={(event) => onUpdate({ ...component, color: event.target.value })} /></label><Range label="Opaklık" value={component.opacity} onChange={(opacity) => onUpdate({ ...component, opacity })} /></>;
    }
    if (component.type === "camera") return <><Readout label="Projeksiyon" value={component.projection} /><Range label="Görüş açısı" value={component.fieldOfView} max={120} onChange={(fieldOfView) => onUpdate({ ...component, fieldOfView })} /></>;
    if (component.type === "light") return <><Readout label="Tür" value={component.lightType} /><Range label="Yoğunluk" value={component.intensity} max={4} onChange={(intensity) => onUpdate({ ...component, intensity })} /></>;
    if (component.type === "rigidBody") return <><Readout label="Gövde" value={component.bodyType} /><Range label="Kütle" value={component.mass} max={20} onChange={(mass) => onUpdate({ ...component, mass })} /><label className="flex items-center justify-between text-[11px] text-zinc-500"><span>Yerçekimi</span><input type="checkbox" checked={component.useGravity} onChange={(event) => onUpdate({ ...component, useGravity: event.target.checked })} className="accent-blue-600" /></label></>;
    if (component.type === "collider") return <><Readout label="Şekil" value={component.shape} /><label className="flex items-center justify-between text-[11px] text-zinc-500"><span>Trigger</span><input type="checkbox" checked={component.isTrigger} onChange={(event) => onUpdate({ ...component, isTrigger: event.target.checked })} className="accent-blue-600" /></label></>;
    if (component.type === "script") return <><Readout label="Dil" value={component.language === "csharp" ? "C#" : "C++"} /><Readout label="Dosya" value={component.fileName} /><div className="rounded-lg bg-amber-50 p-2 text-[10px] leading-4 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Derleme, yapılandırılmış izole araç zincirinde yapılır; tarayıcıda yerel kod çalıştırılmaz.</div><button type="button" onClick={() => onEditScript(component)} className="w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700">Kod editöründe aç</button></>;
    return <p className="text-[11px] text-zinc-500">Bileşen hazır ve sahneye bağlı.</p>;
}

function Readout({ label, value }: { label: string; value: string }) {
    return <div className="flex items-center justify-between text-[11px] text-zinc-500"><span>{label}</span><span className="max-w-[150px] truncate rounded bg-zinc-200/70 px-2 py-1 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{value}</span></div>;
}

function Range({ label, value, onChange, max = 1 }: { label: string; value: number; onChange: (value: number) => void; max?: number }) {
    return <label className="grid grid-cols-[72px_minmax(0,1fr)_34px] items-center gap-2 text-[11px] text-zinc-500"><span>{label}</span><input type="range" min="0" max={max} step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-1 accent-blue-600" /><span className="text-right font-mono text-[10px]">{value.toFixed(2)}</span></label>;
}

function MousePointerGraphic() {
    return <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><Eye className="h-6 w-6 text-blue-500" /><span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-zinc-50 bg-violet-500 dark:border-zinc-950" /></div>;
}
