/**
 * Shared helpers of the starter projects: entities, components, scripts,
 * prefabs and UI written the way the editor stores them.
 */
import { animationPreset } from "../animation";
import {
    createCamera,
    createParticleSystem,
    createScriptComponent,
    createSpriteRenderer,
    createTilemap,
    createTransform,
    createUIButton,
    createUIPanel,
    createUIText,
} from "../components";
import { createEngineId, nowIso } from "../ids";
import { fillTiles } from "../tilemap";
import type {
    AnimationClip,
    GameComponent,
    GameDimension,
    GameEntity,
    GameProjectDocument,
    PrefabAsset,
    ScriptAsset,
    ScriptFieldValue,
    SceneDocument,
    SpriteShape,
    TileDefinition,
    Vector3,
} from "../types";
import type { TemplateId } from "./index";

export interface EntityOptions {
    position?: Partial<Vector3>;
    rotation?: Partial<Vector3>;
    scale?: Partial<Vector3>;
    tag?: string;
    parentId?: string | null;
    active?: boolean;
}

export function entity(name: string, components: GameComponent[], options: EntityOptions = {}): GameEntity {
    return {
        id: createEngineId("entity"),
        name,
        tag: options.tag ?? "Untagged",
        parentId: options.parentId ?? null,
        active: options.active ?? true,
        components: [
            createTransform({
                position: { x: 0, y: 0, z: 0, ...options.position },
                rotation: { x: 0, y: 0, z: 0, ...options.rotation },
                scale: { x: 1, y: 1, z: 1, ...options.scale },
            }),
            ...components,
        ],
    };
}

export function sprite(color: string, shape: SpriteShape = "square", sortingLayer = 0) {
    return createSpriteRenderer({ color, shape, sortingLayer });
}

export function script(asset: ScriptAsset, fields: Record<string, ScriptFieldValue> = {}, className?: string) {
    return createScriptComponent(asset.id, className ?? asset.name.replace(/\.(cs|cpp)$/, ""), { fields });
}

export function scriptAsset(name: string, content: string): ScriptAsset {
    return { id: createEngineId("script"), name, language: name.endsWith(".cpp") ? "cpp" : "csharp", content: content.trim() + "\n" };
}

export function ref(target: GameEntity): ScriptFieldValue {
    return { ref: "entity", id: target.id };
}

export function prefabRef(target: PrefabAsset): ScriptFieldValue {
    return { ref: "prefab", id: target.id };
}

export function prefab(name: string, root: GameEntity, children: GameEntity[] = []): PrefabAsset {
    root.parentId = null;
    for (const child of children) child.parentId = root.id;
    return { id: createEngineId("prefab"), name, entities: [root, ...children] };
}

export function uiText(text: string, anchor: Parameters<typeof createUIText>[0] = {}) {
    return createUIText({ text, ...anchor });
}

export function burst(colors: [string, string], count: number, speed: number, size: number, gravity = 0) {
    return createParticleSystem({
        playOnStart: true,
        loop: false,
        duration: 0.2,
        emissionRate: 0,
        burstCount: count,
        maxParticles: Math.max(count, 40),
        lifetime: 0.6,
        startSpeed: speed,
        spread: 180,
        startSize: size,
        endSize: 0.02,
        startColor: colors[0],
        endColor: colors[1],
        gravityModifier: gravity,
        worldSpace: true,
    });
}

export function finishProject(project: GameProjectDocument, scene: SceneDocument, templateId: TemplateId) {
    scene.metadata.templateId = templateId;
    project.scenes = [scene];
    project.activeSceneId = scene.id;
    project.settings.startSceneId = scene.id;
    project.metadata.updatedAt = nowIso();
    return project;
}

export function finishScenes(project: GameProjectDocument, scenes: SceneDocument[], templateId: TemplateId) {
    for (const scene of scenes) scene.metadata.templateId = templateId;
    project.scenes = scenes;
    project.activeSceneId = scenes[0].id;
    project.settings.startSceneId = scenes[0].id;
    project.metadata.updatedAt = nowIso();
    return project;
}

/** A rectangle of tiles in cell coordinates (corners included); "." erases. */
export type TileFill = [x0: number, y0: number, x1: number, y1: number, key: string];

export function tilemap(palette: TileDefinition[], fills: TileFill[], overrides: Parameters<typeof createTilemap>[0] = {}) {
    const component = createTilemap({ ...overrides, palette });
    for (const [x0, y0, x1, y1, key] of fills) fillTiles(component, x0, y0, x1, y1, key);
    return component;
}

/** A UI button whose On Click calls `method` on `target` (like Unity's Inspector event list). */
export function uiButton(text: string, target: GameEntity | null, method: string, overrides: Parameters<typeof createUIButton>[0] = {}) {
    return createUIButton({ ...overrides, text, onClick: { targetId: target?.id ?? null, method } });
}

/** Endless rotation (z in 2D, y in 3D) over `seconds`. */
export function spinClip(dimension: GameDimension, seconds: number): AnimationClip {
    const clip = animationPreset("spin", dimension);
    clip.duration = seconds;
    clip.tracks[0].keys[1].time = seconds;
    return clip;
}

/** The primary orthographic camera of a 2D template. */
export function camera2d(size = 5.4, x = 0, y = 0): GameEntity {
    return entity("Main Camera", [createCamera({ projection: "orthographic", orthographicSize: size, primary: true })], { position: { x, y, z: -10 }, tag: "MainCamera" });
}

/** A dimmed full-screen panel with a title, a result line and a restart button (inactive until the game ends). */
export function gameOverPanel(manager: GameEntity, title: string, button: string, color: string, hotkey = "R") {
    const panel = entity("GameOverPanel", [createUIPanel({ fullScreen: true, color: "#020617", opacity: 0.74, order: 50 })], { active: false });
    const heading = entity("Title", [uiText(title, { anchor: "center", fontSize: 46, offset: { x: 0, y: -110 }, color: "#f472b6", order: 55 })], { parentId: panel.id });
    const result = entity("ResultText", [uiText("", { anchor: "center", fontSize: 22, offset: { x: 0, y: -20 }, order: 55, bold: false })], { parentId: panel.id });
    const again = entity("RestartButton", [uiButton(button, manager, "Restart", { offset: { x: 0, y: 96 }, width: 240, height: 60, color, order: 60, hotkey })], { parentId: panel.id });
    return { panel, heading, result, entities: [panel, heading, result, again] };
}

// ---------------------------------------------------------------------------
// Shared scripts
// ---------------------------------------------------------------------------

export const AUTO_DESTROY = `
using UnityEngine;

// Belirli bir süre sonra nesneyi yok eder (patlama efektleri için).
public class AutoDestroy : MonoBehaviour
{
    public float lifetime = 1.5f;

    void Start()
    {
        Destroy(gameObject, lifetime);
    }
}`;
