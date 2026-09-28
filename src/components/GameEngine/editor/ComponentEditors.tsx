"use client";

import { ExternalLink, Play, RotateCcw, Scaling } from "lucide-react";
import { createAudioSource, createCamera, createCollider, createLight, createMeshRenderer, createParticleSystem, createRigidBody, createSpriteRenderer, createUIText } from "@/lib/game-engine/components";
import { describeBehaviour } from "@/lib/game-engine/script/compiler";
import { KEY_CODES } from "@/lib/game-engine/script/stdlib";
import type { FieldInfo } from "@/lib/game-engine/script/values";
import { SoundEngine } from "@/lib/game-engine/runtime/audio";
import {
    PRIMITIVE_MESHES,
    SOUND_PRESETS,
    SPRITE_SHAPES,
    UI_ANCHORS,
    type AudioSourceComponent,
    type CameraComponent,
    type ColliderComponent,
    type GameComponent,
    type GameEntity,
    type LightComponent,
    type MeshRendererComponent,
    type ParticleSystemComponent,
    type RigidBodyComponent,
    type ScriptComponent,
    type ScriptFieldValue,
    type SpriteRendererComponent,
    type TransformComponent,
    type UITextComponent,
    type Vector3,
} from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { activeScene, updateComponent } from "./operations";
import { useEditorState } from "./store";
import { Button, Checkbox, ColorInput, FieldRow, NumberInput, SelectInput, SliderInput, TextInput, Toggle, VectorInput, cx } from "./ui";

type Editor<T extends GameComponent> = { entity: GameEntity; component: T; disabled: boolean };

/** Returns an updater that writes to the component inside an undoable store update. */
function useComponentEdit<T extends GameComponent>(entityId: string, component: T) {
    const { store, t } = useEditor();
    return (field: string, recipe: (draft: T) => void, label = t("hEditComponent")) => {
        store.update(label, (draft) => updateComponent<T>(draft, entityId, component.id, recipe), { mergeKey: `${component.id}:${field}` });
    };
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

export function TransformEditor({ entity, component, disabled }: Editor<TransformComponent>) {
    const { t, store } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const is2D = project.dimension === "2d";
    const edit = useComponentEdit(entity.id, component);
    return (
        <div className="space-y-0.5">
            <FieldRow label={t("position")}>
                <VectorInput value={component.position} disabled={disabled} onChange={(value) => edit("position", (draft) => { draft.position = value; })} />
            </FieldRow>
            <FieldRow label={t("rotation")}>
                {is2D ? (
                    <div className="grid grid-cols-3 gap-1">
                        <div className="col-span-1 col-start-3">
                            <NumberInput label="Z" labelClassName="text-sky-400" value={component.rotation.z} step={1} precision={2} disabled={disabled} onChange={(z) => edit("rotation", (draft) => { draft.rotation = { x: 0, y: 0, z }; })} />
                        </div>
                    </div>
                ) : (
                    <VectorInput value={component.rotation} step={1} precision={2} disabled={disabled} onChange={(value) => edit("rotation", (draft) => { draft.rotation = value; })} />
                )}
            </FieldRow>
            <FieldRow label={t("scaleLabel")}>
                <VectorInput value={component.scale} hideZ={is2D} disabled={disabled} onChange={(value) => edit("scale", (draft) => { draft.scale = is2D ? { ...value, z: draft.scale.z } : value; })} />
            </FieldRow>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function TextureSelect({ value, onChange, disabled }: { value: string | null; onChange: (value: string | null) => void; disabled: boolean }) {
    const { store, t } = useEditor();
    const textures = useEditorState(store, (state) => state.project.textures);
    return (
        <SelectInput
            value={value ?? ""}
            disabled={disabled}
            onChange={(next) => onChange(next || null)}
            options={[{ value: "", label: t("none") }, ...textures.map((texture) => ({ value: texture.id, label: texture.name }))]}
        />
    );
}

export function SpriteEditor({ entity, component, disabled }: Editor<SpriteRendererComponent>) {
    const edit = useComponentEdit(entity.id, component);
    return (
        <div className="space-y-0.5">
            <FieldRow label="Shape">
                <SelectInput value={component.shape} disabled={disabled || Boolean(component.textureId)} onChange={(shape) => edit("shape", (draft) => { draft.shape = shape; })} options={SPRITE_SHAPES.map((shape) => ({ value: shape, label: shape }))} />
            </FieldRow>
            <FieldRow label="Sprite">
                <TextureSelect value={component.textureId} disabled={disabled} onChange={(textureId) => edit("texture", (draft) => { draft.textureId = textureId; })} />
            </FieldRow>
            <FieldRow label="Color">
                <ColorInput value={component.color} disabled={disabled} onChange={(color) => edit("color", (draft) => { draft.color = color; })} allowAlpha alpha={component.opacity} onAlphaChange={(opacity) => edit("opacity", (draft) => { draft.opacity = opacity; })} />
            </FieldRow>
            <FieldRow label="Order in Layer">
                <NumberInput value={component.sortingLayer} integer step={1} disabled={disabled} onChange={(value) => edit("sorting", (draft) => { draft.sortingLayer = value; })} />
            </FieldRow>
            <FieldRow label="Flip">
                <div className="flex items-center gap-3 text-[11.5px] text-zinc-400">
                    <label className="flex items-center gap-1.5"><Checkbox checked={component.flipX} disabled={disabled} onChange={(value) => edit("flipX", (draft) => { draft.flipX = value; })} />X</label>
                    <label className="flex items-center gap-1.5"><Checkbox checked={component.flipY} disabled={disabled} onChange={(value) => edit("flipY", (draft) => { draft.flipY = value; })} />Y</label>
                </div>
            </FieldRow>
        </div>
    );
}

export function MeshEditor({ entity, component, disabled }: Editor<MeshRendererComponent>) {
    const edit = useComponentEdit(entity.id, component);
    const material = component.material;
    return (
        <div className="space-y-0.5">
            <FieldRow label="Mesh">
                <SelectInput value={component.mesh} disabled={disabled} onChange={(mesh) => edit("mesh", (draft) => { draft.mesh = mesh; })} options={PRIMITIVE_MESHES.map((mesh) => ({ value: mesh, label: mesh }))} />
            </FieldRow>
            <p className="pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">Material</p>
            <FieldRow label="Albedo">
                <ColorInput value={material.color} disabled={disabled} onChange={(color) => edit("color", (draft) => { draft.material.color = color; })} allowAlpha alpha={material.opacity} onAlphaChange={(opacity) => edit("opacity", (draft) => { draft.material.opacity = opacity; })} />
            </FieldRow>
            <FieldRow label="Texture">
                <TextureSelect value={material.textureId} disabled={disabled} onChange={(textureId) => edit("texture", (draft) => { draft.material.textureId = textureId; })} />
            </FieldRow>
            {material.textureId ? (
                <FieldRow label="Tiling">
                    <NumberInput value={material.tiling} min={0.01} max={100} step={0.1} disabled={disabled} onChange={(tiling) => edit("tiling", (draft) => { draft.material.tiling = tiling; })} />
                </FieldRow>
            ) : null}
            <FieldRow label="Metallic">
                <SliderInput value={material.metallic} min={0} max={1} disabled={disabled} onChange={(metallic) => edit("metallic", (draft) => { draft.material.metallic = metallic; })} />
            </FieldRow>
            <FieldRow label="Roughness">
                <SliderInput value={material.roughness} min={0} max={1} disabled={disabled} onChange={(roughness) => edit("roughness", (draft) => { draft.material.roughness = roughness; })} />
            </FieldRow>
            <FieldRow label="Emission">
                <ColorInput value={material.emissive} disabled={disabled} onChange={(emissive) => edit("emissive", (draft) => { draft.material.emissive = emissive; if (draft.material.emissiveIntensity === 0) draft.material.emissiveIntensity = 0.6; })} />
            </FieldRow>
            <FieldRow label="Emission Power">
                <SliderInput value={material.emissiveIntensity} min={0} max={5} disabled={disabled} onChange={(value) => edit("emissiveIntensity", (draft) => { draft.material.emissiveIntensity = value; })} />
            </FieldRow>
            <FieldRow label="Options">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-zinc-400">
                    <label className="flex items-center gap-1.5"><Checkbox checked={material.wireframe} disabled={disabled} onChange={(value) => edit("wireframe", (draft) => { draft.material.wireframe = value; })} />Wireframe</label>
                    <label className="flex items-center gap-1.5"><Checkbox checked={material.flatShading} disabled={disabled} onChange={(value) => edit("flat", (draft) => { draft.material.flatShading = value; })} />Flat</label>
                </div>
            </FieldRow>
            <FieldRow label="Shadows">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-zinc-400">
                    <label className="flex items-center gap-1.5"><Checkbox checked={component.castShadows} disabled={disabled} onChange={(value) => edit("cast", (draft) => { draft.castShadows = value; })} />Cast</label>
                    <label className="flex items-center gap-1.5"><Checkbox checked={component.receiveShadows} disabled={disabled} onChange={(value) => edit("receive", (draft) => { draft.receiveShadows = value; })} />Receive</label>
                </div>
            </FieldRow>
        </div>
    );
}

export function CameraEditor({ entity, component, disabled }: Editor<CameraComponent>) {
    const { t } = useEditor();
    const edit = useComponentEdit(entity.id, component);
    return (
        <div className="space-y-0.5">
            <FieldRow label="Projection">
                <SelectInput value={component.projection} disabled={disabled} onChange={(projection) => edit("projection", (draft) => { draft.projection = projection; })} options={[{ value: "perspective", label: "Perspective" }, { value: "orthographic", label: "Orthographic" }]} />
            </FieldRow>
            {component.projection === "perspective" ? (
                <FieldRow label="Field of View">
                    <SliderInput value={component.fieldOfView} min={10} max={140} step={1} disabled={disabled} onChange={(value) => edit("fov", (draft) => { draft.fieldOfView = value; })} />
                </FieldRow>
            ) : (
                <FieldRow label="Size">
                    <NumberInput value={component.orthographicSize} min={0.01} step={0.1} disabled={disabled} onChange={(value) => edit("size", (draft) => { draft.orthographicSize = value; })} />
                </FieldRow>
            )}
            <FieldRow label="Clipping">
                <div className="grid grid-cols-2 gap-1">
                    <NumberInput label="N" value={component.nearClip} min={0.001} step={0.01} disabled={disabled} onChange={(value) => edit("near", (draft) => { draft.nearClip = value; })} />
                    <NumberInput label="F" value={component.farClip} min={0.1} step={1} disabled={disabled} onChange={(value) => edit("far", (draft) => { draft.farClip = value; })} />
                </div>
            </FieldRow>
            <FieldRow label="Background">
                <div className="flex items-center gap-2">
                    <Checkbox checked={component.backgroundColor !== null} disabled={disabled} onChange={(value) => edit("background", (draft) => { draft.backgroundColor = value ? "#0f172a" : null; })} label="Background override" />
                    {component.backgroundColor !== null ? <ColorInput value={component.backgroundColor} disabled={disabled} onChange={(color) => edit("backgroundColor", (draft) => { draft.backgroundColor = color; })} /> : <span className="text-[11px] text-zinc-500">{t("sceneSetting")}</span>}
                </div>
            </FieldRow>
            <FieldRow label="Main Camera">
                <Toggle checked={component.primary} disabled={disabled} onChange={(value) => edit("primary", (draft) => { draft.primary = value; })} />
            </FieldRow>
        </div>
    );
}

export function LightEditor({ entity, component, disabled }: Editor<LightComponent>) {
    const edit = useComponentEdit(entity.id, component);
    return (
        <div className="space-y-0.5">
            <FieldRow label="Type">
                <SelectInput value={component.lightType} disabled={disabled} onChange={(lightType) => edit("type", (draft) => { draft.lightType = lightType; })} options={[{ value: "directional", label: "Directional" }, { value: "point", label: "Point" }, { value: "spot", label: "Spot" }]} />
            </FieldRow>
            <FieldRow label="Color">
                <ColorInput value={component.color} disabled={disabled} onChange={(color) => edit("color", (draft) => { draft.color = color; })} />
            </FieldRow>
            <FieldRow label="Intensity">
                <SliderInput value={component.intensity} min={0} max={10} disabled={disabled} onChange={(value) => edit("intensity", (draft) => { draft.intensity = value; })} />
            </FieldRow>
            {component.lightType !== "directional" ? (
                <FieldRow label="Range">
                    <NumberInput value={component.range} min={0.1} step={0.5} disabled={disabled} onChange={(value) => edit("range", (draft) => { draft.range = value; })} />
                </FieldRow>
            ) : null}
            {component.lightType === "spot" ? (
                <FieldRow label="Spot Angle">
                    <SliderInput value={component.spotAngle} min={1} max={179} step={1} disabled={disabled} onChange={(value) => edit("spot", (draft) => { draft.spotAngle = value; })} />
                </FieldRow>
            ) : null}
            <FieldRow label="Shadows">
                <Toggle checked={component.castShadows} disabled={disabled} onChange={(value) => edit("shadows", (draft) => { draft.castShadows = value; })} />
            </FieldRow>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

export function RigidBodyEditor({ entity, component, disabled }: Editor<RigidBodyComponent>) {
    const { store } = useEditor();
    const is2D = useEditorState(store, (state) => state.project.dimension === "2d");
    const edit = useComponentEdit(entity.id, component);
    return (
        <div className="space-y-0.5">
            <FieldRow label="Body Type">
                <SelectInput value={component.bodyType} disabled={disabled} onChange={(bodyType) => edit("bodyType", (draft) => { draft.bodyType = bodyType; })} options={[{ value: "dynamic", label: "Dynamic" }, { value: "kinematic", label: "Kinematic" }, { value: "static", label: "Static" }]} />
            </FieldRow>
            {component.bodyType === "dynamic" ? (
                <>
                    <FieldRow label="Mass">
                        <NumberInput value={component.mass} min={0.001} step={0.1} disabled={disabled} onChange={(value) => edit("mass", (draft) => { draft.mass = value; })} />
                    </FieldRow>
                    <FieldRow label="Use Gravity">
                        <Toggle checked={component.useGravity} disabled={disabled} onChange={(value) => edit("gravity", (draft) => { draft.useGravity = value; })} />
                    </FieldRow>
                    <FieldRow label="Gravity Scale">
                        <NumberInput value={component.gravityScale} step={0.1} disabled={disabled} onChange={(value) => edit("gravityScale", (draft) => { draft.gravityScale = value; })} />
                    </FieldRow>
                    <FieldRow label="Linear Drag">
                        <NumberInput value={component.linearDamping} min={0} step={0.05} disabled={disabled} onChange={(value) => edit("linearDamping", (draft) => { draft.linearDamping = value; })} />
                    </FieldRow>
                    <FieldRow label="Angular Drag">
                        <NumberInput value={component.angularDamping} min={0} step={0.05} disabled={disabled} onChange={(value) => edit("angularDamping", (draft) => { draft.angularDamping = value; })} />
                    </FieldRow>
                </>
            ) : null}
            <FieldRow label="Start Velocity">
                <VectorInput value={component.velocity} hideZ={is2D} disabled={disabled} onChange={(value) => edit("velocity", (draft) => { draft.velocity = value; })} />
            </FieldRow>
            <FieldRow label="Freeze Position">
                <div className="flex items-center gap-3 text-[11.5px] text-zinc-400">
                    {(["x", "y", "z"] as const).filter((axis) => !(is2D && axis === "z")).map((axis) => (
                        <label key={axis} className="flex items-center gap-1.5 uppercase">
                            <Checkbox checked={component.freezePosition[axis]} disabled={disabled} onChange={(value) => edit(`freeze-${axis}`, (draft) => { draft.freezePosition[axis] = value; })} />{axis}
                        </label>
                    ))}
                </div>
            </FieldRow>
            <FieldRow label="Freeze Rotation">
                <Toggle checked={component.freezeRotation} disabled={disabled} onChange={(value) => edit("freezeRotation", (draft) => { draft.freezeRotation = value; })} />
            </FieldRow>
        </div>
    );
}

export function ColliderEditor({ entity, component, disabled }: Editor<ColliderComponent>) {
    const { store, t } = useEditor();
    const is2D = useEditorState(store, (state) => state.project.dimension === "2d");
    const edit = useComponentEdit(entity.id, component);
    const fit = () => {
        const mesh = entity.components.find((item) => item.type === "meshRenderer");
        const sprite = entity.components.find((item) => item.type === "spriteRenderer");
        edit("fit", (draft) => {
            draft.offset = { x: 0, y: 0, z: 0 };
            if (mesh?.type === "meshRenderer") {
                if (mesh.mesh === "sphere") {
                    draft.shape = "sphere";
                    draft.radius = 0.5;
                } else {
                    draft.shape = "box";
                    draft.size = mesh.mesh === "plane" ? { x: 1, y: 0.02, z: 1 } : mesh.mesh === "capsule" || mesh.mesh === "cylinder" ? { x: 1, y: 2, z: 1 } : { x: 1, y: 1, z: 1 };
                }
            } else if (sprite?.type === "spriteRenderer") {
                if (sprite.shape === "circle") {
                    draft.shape = is2D ? "circle" : "sphere";
                    draft.radius = 0.5;
                } else {
                    draft.shape = "box";
                    draft.size = { x: 1, y: 1, z: 1 };
                }
            }
        }, t("hFitCollider"));
    };
    return (
        <div className="space-y-0.5">
            <FieldRow label="Shape">
                <SelectInput
                    value={component.shape}
                    disabled={disabled}
                    onChange={(shape) => edit("shape", (draft) => { draft.shape = shape; })}
                    options={is2D ? [{ value: "box", label: "Box 2D" }, { value: "circle", label: "Circle 2D" }] : [{ value: "box", label: "Box" }, { value: "sphere", label: "Sphere" }]}
                />
            </FieldRow>
            {component.shape === "box" ? (
                <FieldRow label="Size">
                    <VectorInput value={component.size} hideZ={is2D} disabled={disabled} onChange={(value) => edit("size", (draft) => { draft.size = { x: Math.max(0.001, value.x), y: Math.max(0.001, value.y), z: is2D ? draft.size.z : Math.max(0.001, value.z) }; })} />
                </FieldRow>
            ) : (
                <FieldRow label="Radius">
                    <NumberInput value={component.radius} min={0.001} step={0.05} disabled={disabled} onChange={(value) => edit("radius", (draft) => { draft.radius = value; })} />
                </FieldRow>
            )}
            <FieldRow label={is2D ? "Offset" : "Center"}>
                <VectorInput value={component.offset} hideZ={is2D} disabled={disabled} onChange={(value) => edit("offset", (draft) => { draft.offset = is2D ? { ...value, z: 0 } : value; })} />
            </FieldRow>
            <FieldRow label="Is Trigger">
                <Toggle checked={component.isTrigger} disabled={disabled} onChange={(value) => edit("trigger", (draft) => { draft.isTrigger = value; })} />
            </FieldRow>
            <FieldRow label="Friction">
                <SliderInput value={component.friction} min={0} max={1} disabled={disabled} onChange={(value) => edit("friction", (draft) => { draft.friction = value; })} />
            </FieldRow>
            <FieldRow label="Bounciness">
                <SliderInput value={component.bounciness} min={0} max={1} disabled={disabled} onChange={(value) => edit("bounciness", (draft) => { draft.bounciness = value; })} />
            </FieldRow>
            <div className="pt-1.5">
                <Button onClick={fit} disabled={disabled} className="h-7 w-full"><Scaling className="h-3.5 w-3.5" />{t("fitCollider")}</Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Effects, audio & UI
// ---------------------------------------------------------------------------

export function ParticleEditor({ entity, component, disabled }: Editor<ParticleSystemComponent>) {
    const edit = useComponentEdit(entity.id, component);
    const number = (label: string, key: keyof ParticleSystemComponent, options: { min?: number; max?: number; step?: number; integer?: boolean } = {}) => (
        <FieldRow label={label}>
            <NumberInput value={component[key] as number} min={options.min} max={options.max} step={options.step ?? 0.1} integer={options.integer} disabled={disabled} onChange={(value) => edit(String(key), (draft) => { (draft as unknown as Record<string, number>)[key] = value; })} />
        </FieldRow>
    );
    return (
        <div className="space-y-0.5">
            <FieldRow label="Play On Start"><Toggle checked={component.playOnStart} disabled={disabled} onChange={(value) => edit("playOnStart", (draft) => { draft.playOnStart = value; })} /></FieldRow>
            <FieldRow label="Looping"><Toggle checked={component.loop} disabled={disabled} onChange={(value) => edit("loop", (draft) => { draft.loop = value; })} /></FieldRow>
            {number("Duration", "duration", { min: 0.05, step: 0.1 })}
            {number("Rate over Time", "emissionRate", { min: 0, step: 1 })}
            {number("Burst Count", "burstCount", { min: 0, step: 1, integer: true })}
            {number("Max Particles", "maxParticles", { min: 1, max: 4000, step: 10, integer: true })}
            {number("Lifetime", "lifetime", { min: 0.05, step: 0.1 })}
            {number("Start Speed", "startSpeed", { step: 0.1 })}
            <FieldRow label="Cone Angle"><SliderInput value={component.spread} min={0} max={180} step={1} disabled={disabled} onChange={(value) => edit("spread", (draft) => { draft.spread = value; })} /></FieldRow>
            {number("Start Size", "startSize", { min: 0, step: 0.02 })}
            {number("End Size", "endSize", { min: 0, step: 0.02 })}
            <FieldRow label="Start Color"><ColorInput value={component.startColor} disabled={disabled} onChange={(color) => edit("startColor", (draft) => { draft.startColor = color; })} /></FieldRow>
            <FieldRow label="End Color"><ColorInput value={component.endColor} disabled={disabled} onChange={(color) => edit("endColor", (draft) => { draft.endColor = color; })} /></FieldRow>
            {number("Gravity Modifier", "gravityModifier", { step: 0.1 })}
            <FieldRow label="World Space"><Toggle checked={component.worldSpace} disabled={disabled} onChange={(value) => edit("worldSpace", (draft) => { draft.worldSpace = value; })} /></FieldRow>
        </div>
    );
}

let previewEngine: SoundEngine | null = null;

export function AudioEditor({ entity, component, disabled }: Editor<AudioSourceComponent>) {
    const { t } = useEditor();
    const edit = useComponentEdit(entity.id, component);
    const preview = () => {
        previewEngine ??= new SoundEngine();
        previewEngine.unlock();
        previewEngine.play(component.clip, component.volume, component.pitch);
    };
    return (
        <div className="space-y-0.5">
            <FieldRow label="Clip">
                <div className="flex items-center gap-1">
                    <SelectInput value={component.clip} disabled={disabled} onChange={(clip) => edit("clip", (draft) => { draft.clip = clip; })} options={SOUND_PRESETS.map((preset) => ({ value: preset, label: preset }))} />
                    <button type="button" onClick={preview} title={t("previewSound")} aria-label={t("previewSound")} className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-emerald-300 hover:bg-white/10"><Play className="h-3.5 w-3.5" /></button>
                </div>
            </FieldRow>
            <FieldRow label="Volume"><SliderInput value={component.volume} min={0} max={1} disabled={disabled} onChange={(value) => edit("volume", (draft) => { draft.volume = value; })} /></FieldRow>
            <FieldRow label="Pitch"><SliderInput value={component.pitch} min={0.1} max={3} disabled={disabled} onChange={(value) => edit("pitch", (draft) => { draft.pitch = value; })} /></FieldRow>
            <FieldRow label="Play On Awake"><Toggle checked={component.playOnStart} disabled={disabled} onChange={(value) => edit("playOnStart", (draft) => { draft.playOnStart = value; })} /></FieldRow>
        </div>
    );
}

export function UITextEditor({ entity, component, disabled }: Editor<UITextComponent>) {
    const edit = useComponentEdit(entity.id, component);
    return (
        <div className="space-y-0.5">
            <FieldRow label="Text" wide>
                <TextInput multiline value={component.text} maxLength={2000} disabled={disabled} onChange={(text) => edit("text", (draft) => { draft.text = text; })} />
            </FieldRow>
            <FieldRow label="Font Size"><NumberInput value={component.fontSize} min={4} max={200} step={1} integer disabled={disabled} onChange={(value) => edit("fontSize", (draft) => { draft.fontSize = value; })} /></FieldRow>
            <FieldRow label="Color"><ColorInput value={component.color} disabled={disabled} onChange={(color) => edit("color", (draft) => { draft.color = color; })} /></FieldRow>
            <FieldRow label="Anchor">
                <div className="grid w-[84px] grid-cols-3 gap-0.5">
                    {UI_ANCHORS.map((anchor) => (
                        <button
                            key={anchor}
                            type="button"
                            disabled={disabled}
                            title={anchor}
                            aria-label={anchor}
                            onClick={() => edit("anchor", (draft) => { draft.anchor = anchor; })}
                            className={cx("h-6 rounded border transition", component.anchor === anchor ? "border-indigo-400 bg-indigo-500/40" : "border-white/10 bg-white/5 hover:bg-white/10")}
                        />
                    ))}
                </div>
            </FieldRow>
            <FieldRow label="Offset"><VectorInput value={component.offset} hideZ step={1} disabled={disabled} onChange={(value) => edit("offset", (draft) => { draft.offset = { x: value.x, y: value.y }; })} /></FieldRow>
            <FieldRow label="Style">
                <div className="flex items-center gap-3 text-[11.5px] text-zinc-400">
                    <label className="flex items-center gap-1.5"><Checkbox checked={component.bold} disabled={disabled} onChange={(value) => edit("bold", (draft) => { draft.bold = value; })} />Bold</label>
                    <label className="flex items-center gap-1.5"><Checkbox checked={component.shadow} disabled={disabled} onChange={(value) => edit("shadow", (draft) => { draft.shadow = value; })} />Shadow</label>
                </div>
            </FieldRow>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

const COMPONENT_REFERENCE_TYPES: Record<string, GameComponent["type"][]> = {
    Rigidbody: ["rigidBody"], Rigidbody2D: ["rigidBody"], Collider: ["collider"], Collider2D: ["collider"], BoxCollider: ["collider"], BoxCollider2D: ["collider"],
    SphereCollider: ["collider"], CircleCollider2D: ["collider"], SpriteRenderer: ["spriteRenderer"], MeshRenderer: ["meshRenderer"], Renderer: ["spriteRenderer", "meshRenderer"],
    Camera: ["camera"], Light: ["light"], ParticleSystem: ["particleSystem"], AudioSource: ["audioSource"], Text: ["uiText"], TextMeshProUGUI: ["uiText"], TMP_Text: ["uiText"], TextMeshPro: ["uiText"],
};

function defaultFieldValue(field: FieldInfo): ScriptFieldValue {
    if (field.defaultValue !== undefined) return field.defaultValue;
    switch (field.typeName) {
        case "int":
        case "float":
            return 0;
        case "bool":
            return false;
        case "string":
            return "";
        case "Vector2":
        case "Vector3":
            return { x: 0, y: 0, z: 0 };
        case "Color":
            return "#ffffff";
        case "KeyCode":
            return "None";
        default:
            return null;
    }
}

function ScriptFieldInput({ field, value, onChange, disabled }: { field: FieldInfo; value: ScriptFieldValue; onChange: (value: ScriptFieldValue) => void; disabled: boolean }) {
    const { store, program, t } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const type = field.typeName;
    if (type === "int" || type === "float") {
        const numeric = typeof value === "number" ? value : 0;
        if (field.range) return <SliderInput value={numeric} min={field.range[0]} max={field.range[1]} integer={type === "int"} step={type === "int" ? 1 : 0.01} disabled={disabled} onChange={onChange} />;
        return <NumberInput value={numeric} integer={type === "int"} step={type === "int" ? 1 : 0.1} disabled={disabled} onChange={onChange} />;
    }
    if (type === "bool") return <Toggle checked={value === true} disabled={disabled} onChange={onChange} />;
    if (type === "string") return <TextInput value={typeof value === "string" ? value : ""} maxLength={500} disabled={disabled} onChange={onChange} />;
    if (type === "Vector2" || type === "Vector3") {
        const vector = value && typeof value === "object" && "x" in value ? value as Vector3 : { x: 0, y: 0, z: 0 };
        return <VectorInput value={vector} hideZ={type === "Vector2"} disabled={disabled} onChange={(next) => onChange(type === "Vector2" ? { ...next, z: 0 } : next)} />;
    }
    if (type === "Color") return <ColorInput value={typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} disabled={disabled} onChange={onChange} />;
    if (type === "KeyCode") return <SelectInput value={typeof value === "string" ? value : "None"} disabled={disabled} onChange={onChange} options={KEY_CODES.map((key) => ({ value: key, label: key }))} />;
    const enumInfo = program.enums.get(type);
    if (enumInfo) {
        const options = [...enumInfo.values.entries()].map(([name, number]) => ({ value: String(number), label: name }));
        return <SelectInput value={String(typeof value === "number" ? value : options[0]?.value ?? "0")} disabled={disabled} onChange={(next) => onChange(Number(next))} options={options} />;
    }
    if (field.typeRef.isArray || type === "List" || type === "Dictionary") {
        return <span className="text-[11px] italic text-zinc-500">Koleksiyon — kodda doldurun</span>;
    }
    // References: GameObject, Transform, components, other behaviours.
    const scene = activeScene(project);
    const isScriptClass = program.classes.has(type);
    const matchesEntity = (entity: GameEntity) => {
        if (type === "GameObject" || type === "Transform" || type === "Object") return true;
        const componentTypes = COMPONENT_REFERENCE_TYPES[type];
        if (componentTypes) return entity.components.some((component) => componentTypes.includes(component.type));
        if (isScriptClass) {
            return entity.components.some((component) => {
                if (component.type !== "script") return false;
                const cls = program.classes.get(component.className ?? "") ?? program.classes.get((program.behavioursByScript.get(component.scriptId) ?? [])[0] ?? "");
                return Boolean(cls && (cls.name === type || cls.isSubclassOf(type)));
            });
        }
        return false;
    };
    const current = value && typeof value === "object" && "ref" in value ? value : null;
    const encoded = current?.id ? `${current.ref}:${current.id}` : "";
    const entityOptions = scene.objects.filter(matchesEntity).map((entity) => ({ value: `entity:${entity.id}`, label: `◈ ${entity.name}` }));
    const prefabOptions = project.prefabs.filter((prefab) => prefab.entities[0] && matchesEntity(prefab.entities[0])).map((prefab) => ({ value: `prefab:${prefab.id}`, label: `▣ ${prefab.name} (prefab)` }));
    const known = [...entityOptions, ...prefabOptions].some((option) => option.value === encoded);
    return (
        <SelectInput
            value={encoded}
            disabled={disabled}
            onChange={(next) => {
                if (!next) onChange(null);
                else {
                    const [ref, id] = next.split(/:(.+)/);
                    onChange({ ref: ref as "entity" | "prefab", id });
                }
            }}
            options={[
                { value: "", label: `${t("none")} — ${type}` },
                ...(encoded && !known ? [{ value: encoded, label: t("missing") }] : []),
                ...entityOptions,
                ...prefabOptions,
            ]}
        />
    );
}

export function ScriptEditor({ entity, component, disabled }: Editor<ScriptComponent>) {
    const { store, program, t, openScript } = useEditor();
    const scripts = useEditorState(store, (state) => state.project.scripts);
    const edit = useComponentEdit(entity.id, component);
    const script = scripts.find((item) => item.id === component.scriptId);
    const classes = program.behavioursByScript.get(component.scriptId) ?? [];
    const className = component.className && classes.includes(component.className) ? component.className : classes[0] ?? null;
    const fields = className ? describeBehaviour(program, className) : [];
    const errors = program.diagnostics.filter((diagnostic) => diagnostic.scriptId === component.scriptId && diagnostic.severity === "error");
    const headers: Array<string | null> = [];
    let previousHeader: string | null = null;
    for (const field of fields) {
        headers.push(field.header && field.header !== previousHeader ? field.header : null);
        if (field.header) previousHeader = field.header;
    }
    return (
        <div className="space-y-0.5">
            <FieldRow label="Script">
                <div className="flex items-center gap-1">
                    <SelectInput
                        value={component.scriptId}
                        disabled={disabled}
                        onChange={(scriptId) => edit("script", (draft) => {
                            draft.scriptId = scriptId;
                            draft.className = (program.behavioursByScript.get(scriptId) ?? [])[0] ?? null;
                            draft.fields = {};
                        })}
                        options={[...(script ? [] : [{ value: component.scriptId, label: t("missing") }]), ...scripts.map((item) => ({ value: item.id, label: item.name }))]}
                    />
                    {script ? <button type="button" onClick={() => openScript(script.id)} title={t("openScript")} aria-label={t("openScript")} className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-indigo-300 hover:bg-white/10"><ExternalLink className="h-3.5 w-3.5" /></button> : null}
                </div>
            </FieldRow>
            {classes.length > 1 ? (
                <FieldRow label="Class">
                    <SelectInput value={className ?? ""} disabled={disabled} onChange={(next) => edit("class", (draft) => { draft.className = next; })} options={classes.map((name) => ({ value: name, label: name }))} />
                </FieldRow>
            ) : null}
            {errors.length ? (
                <button type="button" onClick={() => openScript(component.scriptId, errors[0].line)} className="mt-1 w-full rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-left text-[11px] leading-snug text-red-200 hover:bg-red-500/15">
                    {t("compileErrorsFirst").replace("{count}", String(errors.length)).replace("{line}", String(errors[0].line)).replace("{message}", errors[0].message)}
                </button>
            ) : null}
            {!className && script && !errors.length ? <p className="py-1 text-[11px] text-amber-300/90">{t("classNotFound")}</p> : null}
            {fields.length ? (
                <div className="mt-1.5 border-t border-white/[0.06] pt-1.5">
                    {fields.map((field, fieldIndex) => {
                        const header = headers[fieldIndex];
                        const overridden = field.name in component.fields;
                        const value = overridden ? component.fields[field.name] : defaultFieldValue(field);
                        return (
                            <div key={field.name}>
                                {header ? <p className="pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{header}</p> : null}
                                <FieldRow
                                    label={(
                                        <span className="inline-flex items-center gap-1">
                                            {prettifyFieldName(field.name)}
                                            {overridden ? (
                                                <button type="button" title={t("resetComponent")} aria-label={t("resetComponent")} disabled={disabled} onClick={() => edit(`reset:${field.name}`, (draft) => { delete draft.fields[field.name]; })} className="text-indigo-300/70 hover:text-indigo-200">
                                                    <RotateCcw className="h-2.5 w-2.5" />
                                                </button>
                                            ) : null}
                                        </span>
                                    )}
                                    title={field.tooltip ?? `${field.typeName} ${field.name}`}
                                >
                                    <ScriptFieldInput field={field} value={value} disabled={disabled} onChange={(next) => edit(`field:${field.name}`, (draft) => { draft.fields[field.name] = next; })} />
                                </FieldRow>
                            </div>
                        );
                    })}
                </div>
            ) : className ? <p className="pt-1 text-[11px] text-zinc-500">{t("noFields")}</p> : null}
        </div>
    );
}

/** "moveSpeed" → "Move Speed" (Unity Inspector style). */
export function prettifyFieldName(name: string) {
    const clean = name.replace(/^m_/, "").replace(/^_+/, "");
    const spaced = clean.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function defaultComponentFor(component: GameComponent): GameComponent {
    const base = { id: component.id, enabled: component.enabled };
    switch (component.type) {
        case "transform": return { ...component, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
        case "spriteRenderer": return { ...createSpriteRenderer(), ...base };
        case "meshRenderer": return { ...createMeshRenderer({ mesh: component.mesh }), ...base };
        case "camera": return { ...createCamera({ projection: component.projection, primary: component.primary }), ...base };
        case "light": return { ...createLight({ lightType: component.lightType }), ...base };
        case "rigidBody": return { ...createRigidBody(), ...base };
        case "collider": return { ...createCollider({ shape: component.shape }), ...base };
        case "particleSystem": return { ...createParticleSystem(), ...base };
        case "audioSource": return { ...createAudioSource(), ...base };
        case "uiText": return { ...createUIText({ text: component.text }), ...base };
        case "script": return { ...component, fields: {} };
    }
}
