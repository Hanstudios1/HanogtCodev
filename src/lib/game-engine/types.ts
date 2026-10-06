/**
 * Hanogt Engine data model (schema v4).
 *
 * Everything in this file is plain JSON so projects can be saved to the
 * cloud, exported, published to the Arcade and loaded by the standalone
 * player. Runtime-only state lives in `runtime/`.
 */
import type { InputSettings } from "./input-actions";

export const GAME_ENGINE_SCHEMA_VERSION = 4 as const;

/** Engine release shown in the UI, exported games and the Arcade. */
export const ENGINE_VERSION = 4 as const;
export const ENGINE_VERSION_LABEL = "Hanogt Engine V4";

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
    /** Sprite sheet layout of the texture; 1 × 1 shows the whole image. */
    sheet: { columns: number; rows: number };
    /** Sheet cell that is shown, row by row from the top-left corner. */
    frame: number;
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
    /** Drawing order among UI elements (higher is on top). */
    order: number;
}

/**
 * Screen-space rectangle shared by the V3 UI components. Sizes and offsets are
 * reference pixels of a 540 px tall screen; offsets point inwards from the
 * anchored edge (like UI Text).
 */
export interface UIRectFields {
    anchor: UIAnchor;
    offset: Vector2;
    width: number;
    height: number;
    order: number;
}

export interface UIButtonComponent extends ComponentBase, UIRectFields {
    type: "uiButton";
    text: string;
    fontSize: number;
    textColor: string;
    color: string;
    cornerRadius: number;
    interactable: boolean;
    /** Method called on the target object's scripts when clicked (target null = this object). */
    onClick: { targetId: string | null; method: string };
    /** KeyCode name that also presses the button, or "None". */
    hotkey: string;
}

export interface UIPanelComponent extends ComponentBase, UIRectFields {
    type: "uiPanel";
    color: string;
    opacity: number;
    /** Optional image drawn inside the panel (Unity's Image). */
    textureId: string | null;
    cornerRadius: number;
    /** Covers the whole screen (dim backgrounds, menus); anchor and size are ignored. */
    fullScreen: boolean;
    /** Clicks on the panel don't reach objects in the game world. */
    blocksClicks: boolean;
}

export const PROGRESS_DIRECTIONS = ["leftToRight", "rightToLeft", "bottomToTop", "topToBottom"] as const;
export type ProgressDirection = (typeof PROGRESS_DIRECTIONS)[number];

export interface UIProgressBarComponent extends ComponentBase, UIRectFields {
    type: "uiProgressBar";
    value: number;
    min: number;
    max: number;
    fillColor: string;
    backgroundColor: string;
    cornerRadius: number;
    direction: ProgressDirection;
    /** Shows the percentage on the bar. */
    showLabel: boolean;
}

/** One kind of tile in a tilemap palette. */
export interface TileDefinition {
    /** Single printable character used in `rows` ("." means an empty cell). */
    key: string;
    name: string;
    color: string;
    /** Solid tiles collide with bodies (or act as triggers when the tilemap is a trigger). */
    solid: boolean;
    /** Cell of the tilemap atlas drawn for this tile; -1 draws a plain colored tile. */
    frame: number;
}

export interface TilemapComponent extends ComponentBase {
    type: "tilemap";
    /** World units per cell. */
    cellSize: number;
    /** Cell coordinate of the bottom-left cell stored in `rows`. */
    origin: { x: number; y: number };
    /** Grid rows from top to bottom; each character is a palette key or "." for empty. */
    rows: string[];
    palette: TileDefinition[];
    /** Optional sprite sheet the tiles' `frame` indices refer to. */
    atlas: { textureId: string | null; columns: number; rows: number };
    sortingLayer: number;
    isTrigger: boolean;
    friction: number;
    bounciness: number;
}

export const EASINGS = [
    "linear", "inQuad", "outQuad", "inOutQuad", "inCubic", "outCubic", "inOutCubic", "inSine", "outSine", "inOutSine",
    "inBack", "outBack", "inOutBack", "inElastic", "outElastic", "inBounce", "outBounce", "step",
] as const;
export type Easing = (typeof EASINGS)[number];

export const ANIMATION_PROPERTIES = ["position", "rotation", "scale", "color", "opacity", "frame"] as const;
export type AnimationProperty = (typeof ANIMATION_PROPERTIES)[number];

export const ANIMATION_WRAP_MODES = ["once", "loop", "pingPong"] as const;
export type AnimationWrapMode = (typeof ANIMATION_WRAP_MODES)[number];

/** Vector3 for position/rotation/scale, "#rrggbb" for color, number for opacity and frame. */
export type AnimationValue = number | string | Vector3;

export interface AnimationKey {
    time: number;
    value: AnimationValue;
    /** Easing of the segment that starts at this key. */
    easing: Easing;
}

/**
 * Position and rotation keys are offsets added to the pose the object had when
 * the clip started; scale keys multiply it. Color, opacity and frame are absolute.
 */
export interface AnimationTrack {
    property: AnimationProperty;
    keys: AnimationKey[];
}

export interface AnimationClip {
    name: string;
    duration: number;
    wrap: AnimationWrapMode;
    tracks: AnimationTrack[];
}

export interface AnimationComponent extends ComponentBase {
    type: "animation";
    clips: AnimationClip[];
    /** Clip played automatically when `playOnStart` is set. */
    defaultClip: string | null;
    playOnStart: boolean;
    speed: number;
}

/**
 * Platformer movement on a dynamic Rigidbody 2D (V4): acceleration, jumps with
 * coyote time and a jump buffer, slopes and moving platforms.
 */
export interface CharacterController2DComponent extends ComponentBase {
    type: "characterController2D";
    /** Top running speed in units per second. */
    moveSpeed: number;
    /** Speed gained per second while a direction is held (on the ground). */
    acceleration: number;
    /** Speed lost per second when no direction is held (on the ground). */
    deceleration: number;
    /** Multiplies acceleration and deceleration in the air (0–1). */
    airControl: number;
    /** Height of a full jump in units; the jump speed follows from gravity. */
    jumpHeight: number;
    /** 2 allows a double jump. */
    maxJumps: number;
    /** Seconds after walking off a ledge during which a jump still works. */
    coyoteTime: number;
    /** Seconds a jump press is remembered before landing. */
    jumpBuffer: number;
    /** Letting go of jump early cuts the jump short. */
    variableJump: boolean;
    /** Gravity multiplier while falling (1 = same as rising). */
    fallGravity: number;
    maxFallSpeed: number;
    /** Steepest slope in degrees that still counts as ground. */
    maxSlope: number;
    /** Reads the input actions below; when off, scripts call Move() and Jump(). */
    useInput: boolean;
    horizontalAction: string;
    jumpAction: string;
    /** Mirrors the Sprite Renderer to face the direction of movement. */
    flipSprite: boolean;
}

/** Smooth camera that follows a target (V4); add it to the camera object. */
export interface CameraFollowComponent extends ComponentBase {
    type: "cameraFollow";
    /** Object to follow; null follows the first object tagged "Player". */
    targetId: string | null;
    /** Camera position relative to the target (2D keeps the camera's own Z). */
    offset: Vector3;
    /** Seconds the camera takes to catch up; 0 sticks to the target. */
    smoothTime: number;
    /** Box around the screen center (world units) inside which the target can move without the camera moving (2D). */
    deadZone: Vector2;
    /** Units the camera leads in the direction the target moves. */
    lookAhead: number;
    followX: boolean;
    followY: boolean;
    /** Keeps the view inside the rectangle below. */
    useBounds: boolean;
    boundsMin: Vector2;
    boundsMax: Vector2;
    /** 3D: turns the camera towards the target. */
    lookAtTarget: boolean;
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
    | UITextComponent
    | UIButtonComponent
    | UIPanelComponent
    | UIProgressBarComponent
    | TilemapComponent
    | AnimationComponent
    | CharacterController2DComponent
    | CameraFollowComponent;

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
    "uiButton",
    "uiPanel",
    "uiProgressBar",
    "tilemap",
    "animation",
    "characterController2D",
    "cameraFollow",
];

/** Screen-space UI components (drawn by the overlay, not the WebGL renderer). */
export const UI_COMPONENT_TYPES: ReadonlySet<ComponentType> = new Set(["uiText", "uiButton", "uiPanel", "uiProgressBar"]);

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
    "uiButton",
    "uiPanel",
    "uiProgressBar",
    "tilemap",
    "animation",
    "characterController2D",
    "cameraFollow",
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
    /** Linear fog fades between `near` and `far`; exponential fog uses `density`. */
    fog: { enabled: boolean; mode: "linear" | "exponential"; color: string; near: number; far: number; density: number };
    /** Screen effects applied to the game view. */
    postProcessing: {
        bloom: { enabled: boolean; intensity: number; threshold: number; radius: number };
        vignette: { enabled: boolean; intensity: number };
        exposure: number;
    };
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
    /**
     * Engine rules the game was made with. Projects from before V4 keep V3
     * behavior wherever a later engine changed it; new projects use 4.
     */
    rules: 3 | 4;
    /** Named buttons and axes for keyboard, mouse and gamepad (V4). */
    input: InputSettings;
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
