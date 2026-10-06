"use client";

import {
    ArrowDown,
    ArrowUp,
    AudioLines,
    Box,
    Camera,
    CircleDot,
    Clapperboard,
    CopyPlus,
    FileCode,
    FilePlus,
    Film,
    Footprints,
    Gauge,
    Grid3x3,
    SlidersHorizontal,
    TextCursorInput,
    ToggleRight,
    Image as ImageIcon,
    Info,
    LayoutTemplate,
    Lightbulb,
    Link2,
    MousePointerClick,
    Move3d,
    MoreHorizontal,
    Navigation,
    Package,
    PanelTop,
    Play,
    Plus,
    RotateCcw,
    Sparkles,
    Square,
    Trash2,
    Type,
    Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { COMPONENT_LABELS } from "@/lib/game-engine/components";
import { UNIQUE_COMPONENT_TYPES, type ComponentType, type GameComponent, type GameEntity } from "@/lib/game-engine/types";
import {
    AudioEditor,
    CameraEditor,
    ColliderEditor,
    LightEditor,
    MeshEditor,
    ParticleEditor,
    RigidBodyEditor,
    ScriptEditor,
    SpriteEditor,
    TransformEditor,
    UITextEditor,
    defaultComponentFor,
} from "./ComponentEditors";
import AnimationEditor from "./AnimationEditor";
import { AudioInspector } from "./AudioAssets";
import { useEditor } from "./context";
import TilemapEditor from "./TilemapEditor";
import { UIButtonEditor, UIInputFieldEditor, UIPanelEditor, UIProgressBarEditor, UISliderEditor, UIToggleEditor } from "./UIEditors";
import { CameraFollowEditor, CharacterController2DEditor, JointEditor, NavAgent2DEditor } from "./V4Editors";
import {
    activeScene,
    addComponent,
    addScriptComponent,
    createScript,
    deleteEntities,
    deletePrefab,
    deleteScene,
    deleteScript,
    deleteTexture,
    duplicateEntities,
    findEntity,
    instantiatePrefab,
    moveComponent,
    removeComponent,
    touch,
} from "./operations";
import { useEditorState } from "./store";
import { Button, Checkbox, Dropdown, FieldRow, IconButton, PanelHeader, Section, SelectInput, TextInput, cx, inputClass, type MenuItem } from "./ui";

const COMPONENT_ICONS: Record<ComponentType, { icon: typeof Box; className: string }> = {
    transform: { icon: Move3d, className: "text-zinc-300" },
    spriteRenderer: { icon: Square, className: "text-emerald-300" },
    meshRenderer: { icon: Box, className: "text-indigo-300" },
    camera: { icon: Camera, className: "text-sky-300" },
    light: { icon: Lightbulb, className: "text-amber-300" },
    rigidBody: { icon: Gauge, className: "text-orange-300" },
    collider: { icon: CircleDot, className: "text-lime-300" },
    script: { icon: FileCode, className: "text-emerald-400" },
    particleSystem: { icon: Sparkles, className: "text-pink-300" },
    audioSource: { icon: AudioLines, className: "text-teal-300" },
    uiText: { icon: Type, className: "text-violet-300" },
    uiButton: { icon: MousePointerClick, className: "text-violet-300" },
    uiPanel: { icon: PanelTop, className: "text-violet-300" },
    uiProgressBar: { icon: LayoutTemplate, className: "text-violet-300" },
    tilemap: { icon: Grid3x3, className: "text-lime-300" },
    animation: { icon: Film, className: "text-fuchsia-300" },
    characterController2D: { icon: Footprints, className: "text-orange-300" },
    cameraFollow: { icon: Video, className: "text-sky-300" },
    navAgent2D: { icon: Navigation, className: "text-cyan-300" },
    joint: { icon: Link2, className: "text-orange-300" },
    uiSlider: { icon: SlidersHorizontal, className: "text-violet-300" },
    uiToggle: { icon: ToggleRight, className: "text-violet-300" },
    uiInputField: { icon: TextCursorInput, className: "text-violet-300" },
};

const COMMON_TAGS = ["Untagged", "Player", "Enemy", "Ground", "PickUp", "Coin", "Wall", "Bullet", "Finish", "Respawn", "MainCamera", "GameController", "EditorOnly"];

function ComponentBody({ entity, component, disabled }: { entity: GameEntity; component: GameComponent; disabled: boolean }) {
    switch (component.type) {
        case "transform": return <TransformEditor entity={entity} component={component} disabled={disabled} />;
        case "spriteRenderer": return <SpriteEditor entity={entity} component={component} disabled={disabled} />;
        case "meshRenderer": return <MeshEditor entity={entity} component={component} disabled={disabled} />;
        case "camera": return <CameraEditor entity={entity} component={component} disabled={disabled} />;
        case "light": return <LightEditor entity={entity} component={component} disabled={disabled} />;
        case "rigidBody": return <RigidBodyEditor entity={entity} component={component} disabled={disabled} />;
        case "collider": return <ColliderEditor entity={entity} component={component} disabled={disabled} />;
        case "script": return <ScriptEditor entity={entity} component={component} disabled={disabled} />;
        case "particleSystem": return <ParticleEditor entity={entity} component={component} disabled={disabled} />;
        case "audioSource": return <AudioEditor entity={entity} component={component} disabled={disabled} />;
        case "uiText": return <UITextEditor entity={entity} component={component} disabled={disabled} />;
        case "uiButton": return <UIButtonEditor entity={entity} component={component} disabled={disabled} />;
        case "uiPanel": return <UIPanelEditor entity={entity} component={component} disabled={disabled} />;
        case "uiProgressBar": return <UIProgressBarEditor entity={entity} component={component} disabled={disabled} />;
        case "tilemap": return <TilemapEditor entity={entity} component={component} disabled={disabled} />;
        case "animation": return <AnimationEditor entity={entity} component={component} disabled={disabled} />;
        case "characterController2D": return <CharacterController2DEditor entity={entity} component={component} disabled={disabled} />;
        case "cameraFollow": return <CameraFollowEditor entity={entity} component={component} disabled={disabled} />;
        case "navAgent2D": return <NavAgent2DEditor entity={entity} component={component} disabled={disabled} />;
        case "joint": return <JointEditor entity={entity} component={component} disabled={disabled} />;
        case "uiSlider": return <UISliderEditor entity={entity} component={component} disabled={disabled} />;
        case "uiToggle": return <UIToggleEditor entity={entity} component={component} disabled={disabled} />;
        case "uiInputField": return <UIInputFieldEditor entity={entity} component={component} disabled={disabled} />;
    }
}

function componentTitle(component: GameComponent, scriptName: (id: string, className: string | null) => string, is2D: boolean) {
    if (component.type === "script") return scriptName(component.scriptId, component.className);
    if (component.type === "collider") return is2D ? (component.shape === "box" ? "Box Collider 2D" : "Circle Collider 2D") : component.shape === "box" ? "Box Collider" : "Sphere Collider";
    if (component.type === "rigidBody") return is2D ? "Rigidbody 2D" : "Rigidbody";
    return COMPONENT_LABELS[component.type];
}

function EntityInspector({ entity }: { entity: GameEntity }) {
    const { store, t, playing, program, openScript } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const disabled = playing;
    const is2D = project.dimension === "2d";
    const [newScriptName, setNewScriptName] = useState<string | null>(null);

    const updateEntity = (label: string, recipe: (target: GameEntity) => void, mergeKey?: string) => {
        store.update(label, (draft) => {
            const target = findEntity(draft, entity.id);
            if (target) {
                recipe(target);
                touch(draft);
            }
        }, { mergeKey });
    };

    const scriptName = (scriptId: string, className: string | null) => {
        const script = project.scripts.find((item) => item.id === scriptId);
        const classes = program.behavioursByScript.get(scriptId) ?? [];
        const name = className && classes.includes(className) ? className : classes[0] ?? script?.name.replace(/\.(cs|cpp)$/, "") ?? "Missing Script";
        return `${name} (Script)`;
    };

    const addMenu = useMemo<MenuItem[]>(() => {
        const has = (type: ComponentType) => entity.components.some((component) => component.type === type);
        const builtIn = (type: Exclude<ComponentType, "script" | "transform">, label: string): MenuItem => {
            const icon = COMPONENT_ICONS[type];
            return {
                label,
                icon: icon.icon,
                disabled: UNIQUE_COMPONENT_TYPES.has(type) && has(type),
                onSelect: () => store.update(`${label} ekle`, (draft) => { addComponent(draft, entity.id, type); }),
            };
        };
        const behaviourItems: MenuItem[] = [];
        for (const script of project.scripts) {
            const classes = program.behavioursByScript.get(script.id) ?? [];
            for (const className of classes.length ? classes : [null]) {
                behaviourItems.push({
                    label: className ?? script.name,
                    icon: FileCode,
                    disabled: !className,
                    onSelect: () => store.update("Script ekle", (draft) => { addScriptComponent(draft, entity.id, script.id, className); }),
                });
            }
        }
        return [
            { label: "Rendering", icon: ImageIcon, items: [builtIn("spriteRenderer", "Sprite Renderer"), builtIn("meshRenderer", "Mesh Renderer"), builtIn("tilemap", "Tilemap"), builtIn("camera", "Camera"), builtIn("cameraFollow", "Camera Follow"), builtIn("light", "Light")] },
            { label: "Physics", icon: Gauge, items: [
                builtIn("rigidBody", is2D ? "Rigidbody 2D" : "Rigidbody"),
                builtIn("collider", is2D ? "Collider 2D" : "Collider"),
                ...(is2D ? [builtIn("characterController2D", "Character Controller 2D")] : []),
                builtIn("joint", is2D ? "Distance Joint 2D" : "Distance Joint"),
                {
                    label: is2D ? "Spring Joint 2D" : "Spring Joint",
                    icon: Link2,
                    onSelect: () => store.update(`${is2D ? "Spring Joint 2D" : "Spring Joint"} ekle`, (draft) => {
                        const joint = addComponent(draft, entity.id, "joint");
                        if (joint?.type === "joint") joint.kind = "spring";
                    }),
                },
            ] },
            ...(is2D ? [{ label: "Navigation", icon: Navigation, items: [builtIn("navAgent2D", "Nav Agent 2D")] }] : []),
            { label: "Effects", icon: Sparkles, items: [builtIn("particleSystem", "Particle System"), builtIn("animation", "Animation")] },
            { label: "Audio", icon: AudioLines, items: [builtIn("audioSource", "Audio Source")] },
            { label: "UI", icon: Type, items: [builtIn("uiText", "UI Text"), builtIn("uiButton", "UI Button"), builtIn("uiPanel", "UI Panel / Image"), builtIn("uiProgressBar", "UI Progress Bar"), builtIn("uiSlider", "UI Slider"), builtIn("uiToggle", "UI Toggle"), builtIn("uiInputField", "UI Input Field")] },
            { separator: true, label: "" },
            { label: t("scripts"), icon: FileCode, items: behaviourItems.length ? behaviourItems : [{ label: "—", disabled: true }] },
            { label: `${t("newScript")}…`, icon: FilePlus, onSelect: () => setNewScriptName("") },
        ];
    }, [entity.id, entity.components, project.scripts, program, store, t, is2D]);

    const createAndAttach = (language: "csharp" | "cpp") => {
        const name = (newScriptName ?? "").trim() || `${entity.name.replace(/[^A-Za-z0-9]/g, "")}Controller`;
        let scriptId = "";
        store.update("Yeni script", (draft) => {
            scriptId = createScript(draft, name, language);
            const script = draft.scripts.find((item) => item.id === scriptId);
            addScriptComponent(draft, entity.id, scriptId, script ? script.name.replace(/\.(cs|cpp)$/, "") : null);
        });
        setNewScriptName(null);
        if (scriptId) openScript(scriptId);
    };

    return (
        <div>
            <div className="space-y-2 border-b border-white/[0.06] p-3">
                <div className="flex items-center gap-2">
                    <Checkbox checked={entity.active} disabled={disabled} label={t("active")} onChange={(value) => updateEntity("Aktiflik", (target) => { target.active = value; })} />
                    <TextInput value={entity.name} disabled={disabled} maxLength={80} onChange={(value) => updateEntity(t("rename2"), (target) => { target.name = value.trim().slice(0, 80) || target.name; })} className="font-semibold" />
                </div>
                <FieldRow label={t("tag")}>
                    <div className="relative">
                        <input
                            list="hanogt-tags"
                            defaultValue={entity.tag}
                            key={`${entity.id}:${entity.tag}`}
                            disabled={disabled}
                            maxLength={40}
                            onBlur={(event) => {
                                const tag = event.target.value.trim().slice(0, 40) || "Untagged";
                                if (tag !== entity.tag) updateEntity("Etiket", (target) => { target.tag = tag; });
                            }}
                            onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                            className={inputClass}
                        />
                        <datalist id="hanogt-tags">{COMMON_TAGS.map((tag) => <option key={tag} value={tag} />)}</datalist>
                    </div>
                </FieldRow>
            </div>
            {entity.components.map((component, index) => {
                const icon = COMPONENT_ICONS[component.type];
                const isTransform = component.type === "transform";
                return (
                    <Section
                        key={component.id}
                        title={componentTitle(component, scriptName, is2D)}
                        icon={icon.icon}
                        iconClassName={icon.className}
                        enabled={isTransform ? undefined : component.enabled}
                        onEnabledChange={isTransform || disabled ? undefined : (value) => store.update(t("hComponentEnabled"), (draft) => {
                            const target = findEntity(draft, entity.id)?.components.find((item) => item.id === component.id);
                            if (target) target.enabled = value;
                        })}
                        actions={disabled ? null : (
                            <Dropdown
                                align="right"
                                trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label={t("componentMenu")} size="sm" onClick={toggle} />}
                                items={[
                                    { label: t("resetComponent"), icon: RotateCcw, onSelect: () => store.update(t("hResetComponent"), (draft) => {
                                        const target = findEntity(draft, entity.id);
                                        if (!target) return;
                                        const position = target.components.findIndex((item) => item.id === component.id);
                                        if (position >= 0) target.components[position] = defaultComponentFor(target.components[position], draft.dimension);
                                    }) },
                                    ...(!isTransform ? [
                                        { label: t("moveUp"), icon: ArrowUp, disabled: index <= 1, onSelect: () => store.update(t("hMoveComponent"), (draft) => moveComponent(draft, entity.id, component.id, -1)) },
                                        { label: t("moveDown"), icon: ArrowDown, disabled: index >= entity.components.length - 1, onSelect: () => store.update(t("hMoveComponent"), (draft) => moveComponent(draft, entity.id, component.id, 1)) },
                                        { separator: true, label: "" },
                                        { label: t("removeComponent"), icon: Trash2, danger: true, onSelect: () => store.update(t("hRemoveComponent"), (draft) => removeComponent(draft, entity.id, component.id)) },
                                    ] as MenuItem[] : []),
                                ]}
                            />
                        )}
                    >
                        <ComponentBody entity={entity} component={component} disabled={disabled} />
                    </Section>
                );
            })}
            <div className="p-3">
                {newScriptName !== null ? (
                    <div className="space-y-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-3">
                        <p className="text-[11.5px] font-semibold text-indigo-100">{t("newScript")}</p>
                        <input
                            autoFocus
                            value={newScriptName}
                            onChange={(event) => setNewScriptName(event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60))}
                            placeholder={`${entity.name.replace(/[^A-Za-z0-9]/g, "")}Controller`}
                            className={inputClass}
                            onKeyDown={(event) => { if (event.key === "Enter") createAndAttach("csharp"); if (event.key === "Escape") setNewScriptName(null); }}
                        />
                        <div className="grid grid-cols-3 gap-1.5">
                            <Button variant="primary" onClick={() => createAndAttach("csharp")}>C#</Button>
                            <Button onClick={() => createAndAttach("cpp")}>C++</Button>
                            <Button variant="ghost" onClick={() => setNewScriptName(null)}>{t("cancel")}</Button>
                        </div>
                    </div>
                ) : (
                    <Dropdown
                        items={addMenu}
                        trigger={({ toggle }) => (
                            <button type="button" disabled={disabled} onClick={toggle} className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-[12.5px] font-semibold text-zinc-300 transition hover:border-indigo-400/60 hover:bg-indigo-500/10 hover:text-white disabled:opacity-40">
                                <Plus className="h-4 w-4" />{t("addComponent")}
                            </button>
                        )}
                    />
                )}
            </div>
        </div>
    );
}

function AssetInspector() {
    const { store, t, playing, program, openScript, createAt, toast } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const asset = useEditorState(store, (state) => state.selectedAsset);
    if (!asset) return null;
    const disabled = playing;

    if (asset.kind === "script") {
        const script = project.scripts.find((item) => item.id === asset.id);
        if (!script) return null;
        const diagnostics = program.diagnostics.filter((item) => item.scriptId === script.id);
        const classes = program.behavioursByScript.get(script.id) ?? [];
        return (
            <div className="space-y-3 p-3">
                <div className="flex items-center gap-2">
                    <FileCode className="h-5 w-5 text-emerald-400" />
                    <TextInput value={script.name} disabled={disabled} maxLength={80} onChange={(value) => {
                        const clean = value.trim().replace(/[^\p{L}\p{N} _.-]/gu, "");
                        if (!clean) return;
                        const extension = script.language === "cpp" ? ".cpp" : ".cs";
                        store.update(t("hScriptName"), (draft) => {
                            const target = draft.scripts.find((item) => item.id === script.id);
                            if (target) target.name = clean.endsWith(extension) ? clean : `${clean.replace(/\.[^.]*$/, "")}${extension}`;
                        });
                    }} />
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-zinc-300">{script.language === "cpp" ? "C++" : "C#"}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-zinc-300">{script.content.split("\n").length} {t("line")}</span>
                    {classes.map((name) => <span key={name} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">{name}</span>)}
                </div>
                <Button variant="primary" className="w-full" onClick={() => openScript(script.id)}><FileCode className="h-4 w-4" />{t("openScript")}</Button>
                {diagnostics.length ? (
                    <div className="space-y-1">
                        {diagnostics.slice(0, 30).map((diagnostic, index) => (
                            <button key={index} type="button" onClick={() => openScript(script.id, diagnostic.line)} className={cx("block w-full rounded-md px-2 py-1.5 text-left text-[11px] leading-snug", diagnostic.severity === "error" ? "bg-red-500/10 text-red-200 hover:bg-red-500/15" : "bg-amber-500/10 text-amber-200 hover:bg-amber-500/15")}>
                                {t("line")} {diagnostic.line}: {diagnostic.message}
                            </button>
                        ))}
                    </div>
                ) : <p className="text-[11.5px] text-emerald-300/90">✓ {t("compiledOk")}</p>}
                <pre className="scrollbar-thin max-h-72 overflow-auto rounded-lg border border-white/[0.06] bg-zinc-950 p-2 font-mono text-[10.5px] leading-relaxed text-zinc-400">{script.content.slice(0, 4000)}</pre>
                <Button variant="danger" className="w-full" disabled={disabled} onClick={() => {
                    if (!window.confirm(t("confirmDeleteScript"))) return;
                    store.update("Script sil", (draft) => deleteScript(draft, script.id));
                    store.selectAsset(null);
                }}><Trash2 className="h-4 w-4" />{t("deleteLabel")}</Button>
            </div>
        );
    }

    if (asset.kind === "prefab") {
        const prefab = project.prefabs.find((item) => item.id === asset.id);
        if (!prefab) return null;
        const root = prefab.entities[0];
        return (
            <div className="space-y-3 p-3">
                <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-sky-300" />
                    <TextInput value={prefab.name} disabled={disabled} maxLength={80} onChange={(value) => store.update(t("hPrefabName"), (draft) => {
                        const target = draft.prefabs.find((item) => item.id === prefab.id);
                        if (target && value.trim()) target.name = value.trim().slice(0, 80);
                    })} />
                </div>
                <p className="text-[11.5px] text-zinc-400">{prefab.entities.length} {t("objects")} · {root?.components.map((component) => COMPONENT_LABELS[component.type]).join(", ")}</p>
                <Button variant="primary" className="w-full" disabled={disabled} onClick={() => {
                    let id: string | null = null;
                    store.update("Prefab ekle", (draft) => { id = instantiatePrefab(draft, prefab.id, createAt()); });
                    if (id) store.setSelection([id]);
                }}><CopyPlus className="h-4 w-4" />{t("instantiate")}</Button>
                <p className="rounded-lg bg-white/[0.03] p-2 text-[11px] leading-relaxed text-zinc-500">{t("prefabUsage1")}<code className="text-zinc-300">public GameObject prefab;</code>{t("prefabUsage2")}<code className="text-zinc-300">Instantiate(prefab)</code>{t("prefabUsage3")}</p>
                <Button variant="danger" className="w-full" disabled={disabled} onClick={() => {
                    if (!window.confirm(`"${prefab.name}" ${t("confirmDelete")}`)) return;
                    store.update("Prefab sil", (draft) => deletePrefab(draft, prefab.id));
                    store.selectAsset(null);
                }}><Trash2 className="h-4 w-4" />{t("deleteLabel")}</Button>
            </div>
        );
    }

    if (asset.kind === "audio") return <AudioInspector id={asset.id} />;

    if (asset.kind === "texture") {
        const texture = project.textures.find((item) => item.id === asset.id);
        if (!texture) return null;
        return (
            <div className="space-y-3 p-3">
                <div className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-fuchsia-300" />
                    <TextInput value={texture.name} disabled={disabled} maxLength={60} onChange={(value) => store.update(t("hTextureName"), (draft) => {
                        const target = draft.textures.find((item) => item.id === texture.id);
                        if (target && value.trim()) target.name = value.trim().slice(0, 60);
                    })} />
                </div>
                <div className="grid place-items-center rounded-xl border border-white/[0.06] bg-[conic-gradient(#27272a_25%,#18181b_0_50%,#27272a_0_75%,#18181b_0)] bg-[length:16px_16px] p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={texture.dataUrl} alt={texture.name} className="max-h-48 max-w-full object-contain" style={{ imageRendering: texture.filter === "nearest" ? "pixelated" : "auto" }} />
                </div>
                <p className="text-[11.5px] text-zinc-400">{texture.width} × {texture.height} px · {Math.round(texture.dataUrl.length / 1024)} KB</p>
                <FieldRow label="Filter">
                    <SelectInput value={texture.filter} disabled={disabled} onChange={(filter) => store.update("Doku filtresi", (draft) => {
                        const target = draft.textures.find((item) => item.id === texture.id);
                        if (target) target.filter = filter;
                    })} options={[{ value: "linear", label: "Bilinear" }, { value: "nearest", label: "Point (pixel art)" }]} />
                </FieldRow>
                <Button variant="danger" className="w-full" disabled={disabled} onClick={() => {
                    if (!window.confirm(`"${texture.name}" ${t("confirmDelete")}`)) return;
                    store.update("Doku sil", (draft) => deleteTexture(draft, texture.id));
                    store.selectAsset(null);
                }}><Trash2 className="h-4 w-4" />{t("deleteLabel")}</Button>
            </div>
        );
    }

    const scene = project.scenes.find((item) => item.id === asset.id);
    if (!scene) return null;
    const isStart = project.settings.startSceneId === scene.id;
    return (
        <div className="space-y-3 p-3">
            <div className="flex items-center gap-2">
                <Clapperboard className="h-5 w-5 text-amber-300" />
                <TextInput value={scene.name} disabled={disabled} maxLength={80} onChange={(value) => store.update(t("hSceneName"), (draft) => {
                    const target = draft.scenes.find((item) => item.id === scene.id);
                    if (target && value.trim()) target.name = value.trim().slice(0, 80);
                })} />
            </div>
            <p className="text-[11.5px] text-zinc-400">#{project.scenes.indexOf(scene)} · {scene.objects.length} {t("objects")}{isStart ? ` · ${t("startScene")}` : ""}</p>
            <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" disabled={disabled || project.activeSceneId === scene.id} onClick={() => store.update(t("hOpenScene"), (draft) => { draft.activeSceneId = scene.id; }, { selection: [] })}><Play className="h-4 w-4" />{t("open")}</Button>
                <Button disabled={disabled || isStart} onClick={() => {
                    store.update(t("hStartScene"), (draft) => { draft.settings.startSceneId = scene.id; });
                    toast(`${scene.name}: ${t("startScene")}`, "success");
                }}>{t("setStartScene")}</Button>
            </div>
            <Button variant="danger" className="w-full" disabled={disabled || project.scenes.length <= 1} onClick={() => {
                if (!window.confirm(`"${scene.name}" ${t("confirmDelete")}`)) return;
                store.update("Sahne sil", (draft) => deleteScene(draft, scene.id));
                store.selectAsset(null);
            }}><Trash2 className="h-4 w-4" />{t("deleteLabel")}</Button>
        </div>
    );
}

export default function InspectorPanel() {
    const { store, t, playing } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const selection = useEditorState(store, (state) => state.selection);
    const selectedAsset = useEditorState(store, (state) => state.selectedAsset);
    const scene = activeScene(project);
    const entity = selection.length === 1 ? scene.objects.find((item) => item.id === selection[0]) : undefined;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <PanelHeader>
                <Info className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-[12px] font-semibold text-zinc-300">{t("inspector")}</span>
            </PanelHeader>
            {playing ? <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">{t("readOnlyPlaying")}</div> : null}
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                {selectedAsset && !selection.length ? <AssetInspector /> : entity ? <EntityInspector key={entity.id} entity={entity} /> : selection.length > 1 ? (
                    <div className="space-y-3 p-4">
                        <p className="text-[13px] font-semibold text-zinc-200">{selection.length} {t("multiSelection")}</p>
                        <div className="grid grid-cols-2 gap-2">
                            <Button disabled={playing} onClick={() => {
                                let created: string[] = [];
                                store.update(t("duplicateLabel"), (draft) => { created = duplicateEntities(draft, selection); });
                                store.setSelection(created);
                            }}><CopyPlus className="h-4 w-4" />{t("duplicateLabel")}</Button>
                            <Button variant="danger" disabled={playing} onClick={() => store.update("Sil", (draft) => deleteEntities(draft, selection), { selection: [] })}><Trash2 className="h-4 w-4" />{t("deleteLabel")}</Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid h-full place-items-center p-6 text-center">
                        <div>
                            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04]"><Move3d className="h-5 w-5 text-zinc-500" /></div>
                            <p className="text-[12.5px] leading-relaxed text-zinc-500">{t("noSelection")}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
