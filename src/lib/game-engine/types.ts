/**
 * Hanogt Engine data model (schema v2).
 *
 * Everything in this file is plain JSON so projects can be saved to the
 * cloud, exported, published to the Arcade and loaded by the standalone
 * player. Runtime-only state lives in `runtime/`.
 */

export const GAME_ENGINE_SCHEMA_VERSION = 2 as const;

export const SUPPORTED_SCRIPT_LANGUAGES = ["csharp", "cpp"] as const;

export type GameDimension = "2d" | "3d";
export type ScriptLanguage = (typeof SUPPORTED_SCRIPT_LANGUAGES)[number];
export type EngineMode = "edit" | "playing" | "paused";

export interface Vector2 {
    x: number;
    y: number;
}

export interface Vector3 extends Vector2 {
    z: number;
}

export interface ComponentBase {
    id: string;
    enabled: boolean;
}

export interface TransformComponent extends ComponentBase {
    type: "transform";
    position: Vector3;
    /** Euler angles in degrees (XYZ order). */
    rotation: Vector3;
    scale: Vector3;
}

export const SPRITE_SHAPES = ["square", "circle", "triangle", "roundedSquare", "diamond", "hexagon", "star"] as const;
export type SpriteShape = (typeof SPRITE_SHAPES)[number];

export interface SpriteRendererComponent extends ComponentBase {
    type: "spriteRenderer";
    shape: SpriteShape;
    /** Texture asset id; when set the texture replaces the shape. */
    textureId: string | null;
    color: string;
    opacity: number;
    sortingLayer: number;
    flipX: boolean;
    flipY: boolean;
}

export const PRIMITIVE_MESHES = ["cube", "sphere", "plane", "capsule", "cylinder", "cone", "torus"] as const;
export type PrimitiveMesh = (typeof PRIMITIVE_MESHES)[number];

export interface MaterialData {
    color: string;
    metallic: number;
    roughness: number;
    emissive: string;
    emissiveIntensity: number;
    opacity: number;
    textureId: string | null;
    /** Texture repeat (tiling) on both axes. */
    tiling: number;
    wireframe: boolean;
    flatShading: boolean;
}

export interface MeshRendererComponent extends ComponentBase {
    type: "meshRenderer";
    mesh: PrimitiveMesh;
    material: MaterialData;
    castShadows: boolean;
    receiveShadows: boolean;
}

export interface CameraComponent extends ComponentBase {
    type: "camera";
    projection: "perspective" | "orthographic";
    fieldOfView: number;
    orthographicSize: number;
    nearClip: number;
    farClip: number;
    /** Overrides the scene background when set. */
    backgroundColor: string | null;
    primary: boolean;
}

export interface LightComponent extends ComponentBase {
    type: "light";
    lightType: "directional" | "point" | "spot";
    color: string;
    intensity: number;
    range: number;
    spotAngle: number;
    castShadows: boolean;
}

export interface RigidBodyComponent extends ComponentBase {
    type: "rigidBody";
    bodyType: "dynamic" | "kinematic" | "static";
    mass: number;
    useGravity: boolean;
    gravityScale: number;
    linearDamping: number;
    angularDamping: number;
    /** Initial linear velocity in units/second. */
    velocity: Vector3;
    /** Initial angular velocity in degrees/second. */
    angularVelocity: Vector3;
    freezePosition: { x: boolean; y: boolean; z: boolean };
    freezeRotation: boolean;
}

export interface ColliderComponent extends ComponentBase {
    type: "collider";
    shape: "box" | "sphere" | "circle";
    size: Vector3;
    radius: number;
    offset: Vector3;
    isTrigger: boolean;
    friction: number;
    bounciness: number;
}

export type ScriptFieldValue =
    | number
    | boolean
    | string
    | null
    | Vector3
    | { ref: "entity" | "prefab"; id: string | null };

export interface ScriptComponent extends ComponentBase {
    type: "script";
    /** ScriptAsset id. */
    scriptId: string;
    /** Behaviour class to instantiate; null picks the first behaviour class in the file. */
    className: string | null;
    /** Inspector overrides for public/serialized fields. */
    fields: Record<string, ScriptFieldValue>;
}

export interface ParticleSystemComponent extends ComponentBase {
    type: "particleSystem";
    playOnStart: boolean;
    loop: boolean;
    duration: number;
    emissionRate: number;
    burstCount: number;
    maxParticles: number;
    lifetime: number;
    startSpeed: number;
    /** Cone half-angle in degrees; 180 emits in every direction. */
    spread: number;
    startSize: number;
    endSize: number;
    startColor: string;
    endColor: string;
    gravityModifier: number;
    worldSpace: boolean;
}

export const SOUND_PRESETS = ["coin", "jump", "hit", "explosion", "laser", "powerup", "click", "blip", "lose", "win", "step", "shoot"] as const;
export type SoundPreset = (typeof SOUND_PRESETS)[number];

export interface AudioSourceComponent extends ComponentBase {
    type: "audioSource";
    clip: SoundPreset;
    volume: number;
    pitch: number;
    playOnStart: boolean;
}

export const UI_ANCHORS = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
export type UIAnchor = (typeof UI_ANCHORS)[number];

export interface UITextComponent extends ComponentBase {
    type: "uiText";
    text: string;
    fontSize: number;
    color: string;
    anchor: UIAnchor;
    offset: Vector2;
    bold: boolean;
    shadow: boolean;
}

export type GameComponent =
    | TransformComponent
    | SpriteRendererComponent
    | MeshRendererComponent
    | CameraComponent
    | LightComponent
    | RigidBodyComponent
    | ColliderComponent
    | ScriptComponent
    | ParticleSystemComponent
    | AudioSourceComponent
    | UITextComponent;

export type ComponentType = GameComponent["type"];
export type ComponentOfType<T extends ComponentType> = Extract<GameComponent, { type: T }>;

export const COMPONENT_TYPES: readonly ComponentType[] = [
    "transform",
    "spriteRenderer",
    "meshRenderer",
    "camera",
    "light",
    "rigidBody",
    "collider",
    "script",
    "particleSystem",
    "audioSource",
    "uiText",
];

/** Components that may appear at most once per entity. */
export const UNIQUE_COMPONENT_TYPES: ReadonlySet<ComponentType> = new Set([
    "transform",
    "spriteRenderer",
    "meshRenderer",
    "camera",
    "light",
    "rigidBody",
    "collider",
    "particleSystem",
    "uiText",
]);

export interface GameEntity {
    id: string;
    name: string;
    tag: string;
    parentId: string | null;
    active: boolean;
    components: GameComponent[];
}

export interface SceneSettings {
    background: {
        mode: "solid" | "gradient";
        color: string;
        /** Sky/top color when `mode` is "gradient". */
        topColor: string;
    };
    ambientColor: string;
    ambientIntensity: number;
    fog: { enabled: boolean; color: string; near: number; far: number };
    physics: { gravity: Vector3; fixedTimeStep: number; maxSubSteps: number };
}

export interface SceneDocument {
    version: typeof GAME_ENGINE_SCHEMA_VERSION;
    id: string;
    name: string;
    dimension: GameDimension;
    objects: GameEntity[];
    settings: SceneSettings;
    metadata: { createdAt: string; updatedAt: string; templateId: string | null };
}

export interface PrefabAsset {
    id: string;
    name: string;
    /** First entity is the prefab root; parent links are relative to the prefab. */
    entities: GameEntity[];
}

export interface TextureAsset {
    id: string;
    name: string;
    dataUrl: string;
    width: number;
    height: number;
    filter: "linear" | "nearest";
}

export interface ScriptAsset {
    id: string;
    name: string;
    language: ScriptLanguage;
    content: string;
}

export interface ProjectSettings {
    startSceneId: string;
    aspect: "free" | "16:9" | "4:3" | "9:16" | "1:1";
    shadows: boolean;
    antialias: boolean;
    pixelArt: boolean;
    showFps: boolean;
    touchControls: boolean;
}

export interface GameProjectDocument {
    version: typeof GAME_ENGINE_SCHEMA_VERSION;
    id: string;
    name: string;
    description: string;
    dimension: GameDimension;
    activeSceneId: string;
    scenes: SceneDocument[];
    prefabs: PrefabAsset[];
    textures: TextureAsset[];
    scripts: ScriptAsset[];
    settings: ProjectSettings;
    metadata: { createdAt: string; updatedAt: string };
}

export interface CollisionEvent {
    entityAId: string;
    entityBId: string;
    trigger: boolean;
    normal: Vector3;
    penetration: number;
}
