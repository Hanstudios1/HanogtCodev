/**
 * Hanogt Engine data model (schema v6).
 *
 * Everything in this file is plain JSON so projects can be saved to the
 * cloud, exported, published to the Arcade and loaded by the standalone
 * player. Runtime-only state lives in `runtime/`.
 */
import type { InputSettings } from "./input-actions";

export const GAME_ENGINE_SCHEMA_VERSION = 6 as const;

/** Engine release shown in the UI, exported games and the Arcade. */
export const ENGINE_VERSION = 6 as const;
export const ENGINE_VERSION_LABEL = "Hanogt Engine V6";

export type EngineRules = 3 | 4 | 5 | 6;
export const ENGINE_RULES: readonly EngineRules[] = [3, 4, 5, 6];

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
    /** A model of the project shown instead of the primitive mesh (V5); null = the primitive. */
    modelId: string | null;
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

/**
 * Where particles start (V6). point: from the object's position (the V5
 * behaviour); circle: on a ring or disc in the object's XY plane, moving
 * outwards; cone: on a disc, fanning out by the cone angle; box: anywhere in
 * a box; edge: along a line on the object's X axis. Every shape but circle
 * moves along the object's forward axis (+Z) within the cone angle.
 */
export const PARTICLE_SHAPES = ["point", "circle", "cone", "box", "edge"] as const;
export type ParticleShape = (typeof PARTICLE_SHAPES)[number];

/** A timed burst of a particle system (V6), counted from the start of every loop. */
export interface ParticleBurst {
    /** Seconds after the loop starts. */
    time: number;
    count: number;
    /** How many times it fires; 0 repeats every interval while the system plays. */
    cycles: number;
    /** Seconds between the cycles. */
    interval: number;
}

/** A stop of the colour-over-lifetime gradient (V6). */
export interface ParticleColorStop {
    /** 0 = when a particle is born, 1 = when it dies. */
    time: number;
    color: string;
    alpha: number;
}

export interface ParticleSystemComponent extends ComponentBase {
    type: "particleSystem";
    playOnStart: boolean;
    loop: boolean;
    duration: number;
    emissionRate: number;
    /** Particles emitted at once whenever a loop starts. */
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
    /** V6: emission shape and its sizes. */
    shape: ParticleShape;
    /** circle and cone: radius of the ring/disc. */
    shapeRadius: number;
    /** circle and cone: 0 = only on the rim, 1 = anywhere inside. */
    radiusThickness: number;
    /** circle: degrees of the ring used (360 = all of it). */
    arc: number;
    /** box: size of the box. */
    boxSize: Vector3;
    /** edge: length of the line. */
    edgeLength: number;
    /** V6: repeating timed bursts (up to 8). */
    bursts: ParticleBurst[];
    /** V6: colour and opacity over lifetime (2–8 stops); empty keeps start → end colour with a fade (V5). */
    colorStops: ParticleColorStop[];
    /** V6: size in the middle of a particle's life (a smooth start → middle → end curve); null keeps start → end (V5). */
    midSize: number | null;
    /** V6: an image of the project drawn on every particle instead of a soft dot. */
    textureId: string | null;
    /** V6: object whose Particle System emits where each particle dies (one level: its own deaths emit nothing). */
    subEmitterId: string | null;
    /** Particles the sub-emitter emits per death. */
    subEmitterCount: number;
}

export const SOUND_PRESETS = ["coin", "jump", "hit", "explosion", "laser", "powerup", "click", "blip", "lose", "win", "step", "shoot"] as const;
export type SoundPreset = (typeof SOUND_PRESETS)[number];

export interface AudioSourceComponent extends ComponentBase {
    type: "audioSource";
    /** Built-in sound, used when no uploaded audio is chosen. */
    clip: SoundPreset;
    /** Uploaded audio (AudioAsset id) played instead of the built-in sound (V4). */
    audioId: string | null;
    volume: number;
    pitch: number;
    playOnStart: boolean;
    /** Repeats the uploaded audio until stopped (V4). */
    loop: boolean;
}

export const UI_ANCHORS = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
export type UIAnchor = (typeof UI_ANCHORS)[number];

export interface UITextComponent extends ComponentBase {
    type: "uiText";
    text: string;
    /** String table key whose text replaces `text` in the player's language (V5); "" = none. */
    localizationKey: string;
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
    /** String table key whose text replaces `text` (V5); "" = none. */
    localizationKey: string;
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

/** Inspector event of a V4 UI control: a method called on the target object's scripts with the new value. */
export interface UIEventTarget {
    /** null = this object. */
    targetId: string | null;
    method: string;
}

/** Draggable slider (Unity's Slider) (V4). */
export interface UISliderComponent extends ComponentBase, UIRectFields {
    type: "uiSlider";
    value: number;
    min: number;
    max: number;
    /** Snaps the value to whole numbers. */
    wholeNumbers: boolean;
    direction: ProgressDirection;
    fillColor: string;
    backgroundColor: string;
    handleColor: string;
    /** Shows the value next to the handle. */
    showValue: boolean;
    interactable: boolean;
    /** Called with the new value (float). */
    onValueChanged: UIEventTarget;
}

export const TOGGLE_STYLES = ["checkbox", "switch"] as const;
export type ToggleStyle = (typeof TOGGLE_STYLES)[number];

/** On/off control with a label (Unity's Toggle) (V4). */
export interface UIToggleComponent extends ComponentBase, UIRectFields {
    type: "uiToggle";
    isOn: boolean;
    label: string;
    /** String table key whose text replaces `label` (V5); "" = none. */
    localizationKey: string;
    fontSize: number;
    textColor: string;
    /** Box or track color when off. */
    color: string;
    /** Check or track color when on. */
    checkColor: string;
    style: ToggleStyle;
    interactable: boolean;
    /** Called with the new value (bool). */
    onValueChanged: UIEventTarget;
}

export const INPUT_CONTENT_TYPES = ["standard", "integer", "decimal", "alphanumeric", "name", "email", "password"] as const;
export type InputContentType = (typeof INPUT_CONTENT_TYPES)[number];

/** Text box the player can type in (Unity's InputField) (V4). */
export interface UIInputFieldComponent extends ComponentBase, UIRectFields {
    type: "uiInputField";
    text: string;
    placeholder: string;
    /** String table key whose text replaces `placeholder` (V5); "" = none. */
    localizationKey: string;
    fontSize: number;
    textColor: string;
    backgroundColor: string;
    borderColor: string;
    /** Maximum characters (1–200). */
    characterLimit: number;
    contentType: InputContentType;
    interactable: boolean;
    /** Called with the text on every change. */
    onValueChanged: UIEventTarget;
    /** Called with the text when editing ends (Enter or leaving the box). */
    onEndEdit: UIEventTarget;
}

/**
 * A rule tile (V6): the atlas frame it draws depends on which neighbours hold
 * a tile it joins (auto-tiling). 4 neighbours (N, E, S, W) give 16 slots; 8
 * neighbours give the 47 slots of a "blob" tileset (a corner only counts when
 * both of its sides join).
 */
export interface RuleTile {
    neighbors: 4 | 8;
    /** Atlas frame per slot (16 or 47 of them); -1 draws the tile's own frame. */
    frames: number[];
    /** Joins every tile of the tilemap instead of only itself. */
    matchAny: boolean;
}

/** An animated tile (V6): atlas frames shown one after another. */
export interface AnimatedTile {
    frames: number[];
    /** Frames per second. */
    fps: number;
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
    /** V6: picks its frame from its neighbours (null = a normal tile). The schema always writes it. */
    rule?: RuleTile | null;
    /** V6: cycles through atlas frames (null = still). A rule tile can't be animated. */
    animation?: AnimatedTile | null;
    /** V6: a solid tile bodies only land on from above; they pass through from below and the sides. */
    oneWay?: boolean;
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
    /** V6: script methods called when playback passes a time (Unity's animation events). */
    events?: AnimationEvent[];
}

export const ANIMATION_EVENT_PARAMETERS = ["none", "float", "int", "string"] as const;
export type AnimationEventParameter = (typeof ANIMATION_EVENT_PARAMETERS)[number];

/**
 * An animation event (V6): when playback passes `time`, every script on the
 * object with a method of that name runs it (like SendMessage), with the
 * parameter when the event has one.
 */
export interface AnimationEvent {
    /** Seconds from the clip's start (0 … duration). */
    time: number;
    /** Method name ("" while it is being typed: nothing runs). */
    method: string;
    parameter: AnimationEventParameter;
    /** The parameter's value: a number for float/int, text for string. */
    value: number | string;
}

export interface AnimationComponent extends ComponentBase {
    type: "animation";
    clips: AnimationClip[];
    /** Clip played automatically when `playOnStart` is set. */
    defaultClip: string | null;
    playOnStart: boolean;
    speed: number;
}

// ---------------------------------------------------------------------------
// Animator (V5): a state machine over the clips of the object's Animation component
// ---------------------------------------------------------------------------

export const ANIMATOR_PARAMETER_TYPES = ["bool", "float", "int", "trigger"] as const;
export type AnimatorParameterType = (typeof ANIMATOR_PARAMETER_TYPES)[number];

/** if / ifNot test bools and triggers; greater / less test numbers; equals / notEqual test ints. */
export const ANIMATOR_CONDITION_MODES = ["if", "ifNot", "greater", "less", "equals", "notEqual"] as const;
export type AnimatorConditionMode = (typeof ANIMATOR_CONDITION_MODES)[number];

/** Condition modes that make sense for each parameter type (the first is the default). */
export const ANIMATOR_CONDITION_MODES_FOR: Record<AnimatorParameterType, readonly AnimatorConditionMode[]> = {
    bool: ["if", "ifNot"],
    trigger: ["if"],
    float: ["greater", "less"],
    int: ["equals", "notEqual", "greater", "less"],
};

/** `from` of a transition that can start from any state (Unity's Any State). */
export const ANIMATOR_ANY_STATE = "any";

export interface AnimatorParameter {
    name: string;
    type: AnimatorParameterType;
    /** Starting value; bools and triggers use 0 or 1. */
    value: number;
}

export interface AnimatorCondition {
    parameter: string;
    mode: AnimatorConditionMode;
    threshold: number;
}

export interface AnimatorState {
    id: string;
    name: string;
    /** Clip of the object's Animation component; null plays nothing. */
    clip: string | null;
    speed: number;
    /** Node position in the Animator panel. */
    x: number;
    y: number;
}

export interface AnimatorTransition {
    id: string;
    /** Source state id, or ANIMATOR_ANY_STATE. */
    from: string;
    to: string;
    /** All must hold; a transition without conditions needs an exit time. */
    conditions: AnimatorCondition[];
    /** Leave only once the current clip reached `exitTime` (normalized: 1 = one full play). */
    hasExitTime: boolean;
    exitTime: number;
    /** Blend time in seconds. */
    duration: number;
}

export interface AnimatorComponent extends ComponentBase {
    type: "animator";
    parameters: AnimatorParameter[];
    states: AnimatorState[];
    transitions: AnimatorTransition[];
    /** State entered first (the first state when null). */
    defaultState: string | null;
    speed: number;
    /** Panel positions of the Entry and Any State nodes. */
    layout: { entry: { x: number; y: number }; any: { x: number; y: number } };
}

export const PLAYER_INPUT_SCHEMES = ["auto", "keyboard", "keyboardLeft", "keyboardRight", "gamepad"] as const;
export type PlayerInputScheme = (typeof PLAYER_INPUT_SCHEMES)[number];
export const MAX_LOCAL_PLAYERS = 4;

/**
 * Local multiplayer (V5): the player (1–4) an object belongs to and the
 * devices that player uses. Its Character Controller 2D and scripts reading
 * GetComponent<PlayerInput>() get only that player's input.
 */
export interface PlayerInputComponent extends ComponentBase {
    type: "playerInput";
    /** Player number, 1–4. */
    player: number;
    /**
     * auto: player 1 gets the keyboard, mouse, touch buttons and its gamepad,
     * other players their gamepad; keyboardLeft: WASD side; keyboardRight:
     * arrow side; gamepad: only the gamepad.
     */
    scheme: PlayerInputScheme;
    /** Gamepad slot (1–4) of the auto, keyboard and gamepad schemes. */
    gamepad: number;
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

/** Walks to a destination around static colliders and solid tiles (V4, 2D). */
export interface NavAgent2DComponent extends ComponentBase {
    type: "navAgent2D";
    /** Units per second. */
    speed: number;
    /** Stops this close to the destination. */
    stoppingDistance: number;
    /** Keeps this far from walls (half the agent's width). */
    radius: number;
    /** Object to chase; null waits for SetDestination(). */
    targetId: string | null;
    /** Seconds between new paths while chasing a moving target. */
    repathInterval: number;
    /** Mirrors the Sprite Renderer to face the direction of travel. */
    flipSprite: boolean;
    /** Draws the current path while playing. */
    showPath: boolean;
}

/**
 * Ties this object to another one or to a point in the world (V4): a distance
 * joint keeps the length (a rope when only the maximum is kept), a spring
 * joint pulls back and bounces. Joints pull the objects' centers along the line.
 */
export interface JointComponent extends ComponentBase {
    type: "joint";
    kind: "distance" | "spring";
    /** Object this one is tied to; null ties it to `connectedAnchor` in the world. */
    connectedId: string | null;
    /** Attachment point on this object (local). */
    anchor: Vector3;
    /** Attachment point on the connected object (local), or a world point without one. */
    connectedAnchor: Vector3;
    /** Length the joint keeps (or springs back to). */
    distance: number;
    /** Uses the length at the start of the game instead of `distance`. */
    autoDistance: boolean;
    /** Distance joints: only a maximum length, like a rope. */
    maxDistanceOnly: boolean;
    /** Spring joints: oscillations per second. */
    frequency: number;
    /** Spring joints: 0 keeps bouncing, 1 settles without bouncing. */
    dampingRatio: number;
    /** Draws the joint as a line while playing. */
    showLine: boolean;
    lineColor: string;
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
    | AnimatorComponent
    | PlayerInputComponent
    | CharacterController2DComponent
    | CameraFollowComponent
    | NavAgent2DComponent
    | JointComponent
    | UISliderComponent
    | UIToggleComponent
    | UIInputFieldComponent;

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
    "animator",
    "characterController2D",
    "cameraFollow",
    "navAgent2D",
    "joint",
    "uiSlider",
    "uiToggle",
    "uiInputField",
    "playerInput",
];

/** Screen-space UI components (drawn by the overlay, not the WebGL renderer). */
export const UI_COMPONENT_TYPES: ReadonlySet<ComponentType> = new Set(["uiText", "uiButton", "uiPanel", "uiProgressBar", "uiSlider", "uiToggle", "uiInputField"]);

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
    "animator",
    "characterController2D",
    "cameraFollow",
    "navAgent2D",
    "uiSlider",
    "uiToggle",
    "uiInputField",
    "playerInput",
]);

export interface GameEntity {
    id: string;
    name: string;
    tag: string;
    /** Physics layer 0–15 (V6): the collision matrix and layer masks use it. */
    layer: number;
    parentId: string | null;
    active: boolean;
    components: GameComponent[];
    /** V6 (editor): the prefab this scene object was made from, so it can be applied or reverted. Absent on other objects. */
    prefab?: PrefabLink;
}

/** A scene object's link to its prefab (V6). */
export interface PrefabLink {
    prefabId: string;
    /** The prefab entity it matches (the prefab's root for the instance root, a child for children). */
    sourceId: string;
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
    postProcessing: PostProcessingSettings;
    physics: { gravity: Vector3; fixedTimeStep: number; maxSubSteps: number };
}

export interface PostProcessingSettings {
    bloom: { enabled: boolean; intensity: number; threshold: number; radius: number };
    vignette: { enabled: boolean; intensity: number };
    exposure: number;
    /** V5: saturation, contrast and brightness (-1…1), a hue shift in degrees and a tint (amount 0…1). */
    colorGrading: { enabled: boolean; saturation: number; contrast: number; brightness: number; hue: number; tint: string; tintAmount: number };
    /** V5: red and blue split toward the edges (0…1). */
    chromaticAberration: { enabled: boolean; intensity: number };
    /** V5: big square pixels (size in screen pixels). */
    pixelate: { enabled: boolean; size: number };
    /** V5: an old TV: scanlines (0…1) and a curved screen (0…1). */
    crt: { enabled: boolean; scanlines: number; curvature: number };
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

/** Audio file of a project (V4); the bytes live in the asset store under `hash`. */
export interface AudioAsset {
    id: string;
    /** Name scripts use: Audio.Play("Name"), Audio.PlayMusic("Name"). */
    name: string;
    /** SHA-256 of the file (hex); the same file is stored once. */
    hash: string;
    contentType: "audio/wav" | "audio/mpeg" | "audio/ogg";
    size: number;
    /** Length in seconds (0 when unknown). */
    duration: number;
}

/** A static 3D model of a project (V5): a GLB file kept in the asset store under `hash`. */
export interface ModelAsset {
    id: string;
    /** Name scripts and the inspector use. */
    name: string;
    /** SHA-256 of the file (hex); the same file is stored once. */
    hash: string;
    size: number;
    /** Triangles in the file (shown in the editor). */
    triangles: number;
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
    /** What the on-screen touch controls look like (V6: joystick, side, buttons). */
    touchLayout: TouchLayout;
    /**
     * Engine rules the game was made with. A project keeps the behavior of the
     * engine it was made with wherever a later engine changed it: documents
     * from before V4 use 3, V4 projects 4, V5 projects 5, new projects 6. The
     * Engine rules panel upgrades a project (and can undo it).
     */
    rules: EngineRules;
    /** Rules the project had before the Engine rules panel upgraded it (V6), so the upgrade can be undone; null otherwise. */
    rulesBefore: EngineRules | null;
    /** Named buttons and axes for keyboard, mouse and gamepad (V4). */
    input: InputSettings;
    /** Languages and the string table (V5). */
    localization: LocalizationSettings;
    /** Leaderboards and achievements the Arcade keeps for players (V5). */
    arcade: ArcadeSettings;
    /** Named physics layers and which of them collide (V6). */
    layers: LayerSettings;
    /** Log points of the script editor (V6): they print while the game runs in the editor only. */
    logPoints: LogPoint[];
}

/** A log point (V6): prints `message` each time the line runs; {expression} parts show values. */
export interface LogPoint {
    scriptId: string;
    /** 1-based line in the script. */
    line: number;
    message: string;
    enabled: boolean;
    /** Also pauses the game at the end of that frame (a breakpoint that lets the frame finish). */
    pause: boolean;
}

/** On-screen touch controls (V6). */
export interface TouchLayout {
    /** "dpad": the arrow pad of V5 (presses the arrow keys); "joystick": an analog stick that also feeds the Horizontal/Vertical axes. */
    stick: "dpad" | "joystick";
    /** Side of the screen with the stick; the buttons take the other side. */
    side: "left" | "right";
    /** Joystick diameter in CSS pixels. */
    size: number;
    /** Part of the joystick's radius (0–0.9) that counts as zero. */
    deadZone: number;
    /** Up to 4 buttons, each pressing an input action; none = A (Space) and B (LeftControl) as before V6. */
    buttons: TouchButtonSetting[];
}

/** One on-screen button (V6). */
export interface TouchButtonSetting {
    /** Input action it presses (its keys and gamepad buttons too), e.g. "Jump". */
    action: string;
    /** Short text on the button. */
    label: string;
}

/** Physics layers (V6): up to 16, layer 0 is "Default". */
export const MAX_LAYERS = 16;

/** Named layers and the collision matrix (V6). */
export interface LayerSettings {
    /** Names of layers 0–15 ("" = unused); layer 0 is always "Default". */
    names: string[];
    /**
     * Collision matrix: bit j of row i is set when layers i and j collide.
     * Rows are symmetric; all bits set means everything collides (as before V6).
     */
    collisions: number[];
}

/** One text of the string table in every language of the game (V5). */
export interface LocalizationEntry {
    /** What scripts and UI elements ask for, e.g. Localization.Get("menu.play"). */
    key: string;
    /** Text per language code; a missing one falls back to the first language. */
    values: Record<string, string>;
}

/** The game's languages and its string table (V5). */
export interface LocalizationSettings {
    /** Language codes such as "tr", "en" or "pt-BR"; the first is the fallback for missing texts. */
    languages: string[];
    /** "auto": the player's language when the game has it, else the first; or a fixed language code. */
    startLanguage: string;
    entries: LocalizationEntry[];
}

/** A score table of the game in the Arcade (V5). */
export interface ArcadeLeaderboard {
    /** What scripts use: Leaderboard.Submit("main", score). */
    id: string;
    name: string;
    /** "desc": higher is better (points); "asc": lower is better (a finishing time). */
    order: "desc" | "asc";
    /** "time" shows seconds as 1:23.45. */
    format: "number" | "time";
    /** Scores outside these bounds are refused. */
    minScore: number;
    maxScore: number;
    /** A score counts only after the player has played this long (seconds). */
    minPlaySeconds: number;
}

/** Something a player can unlock (V5). */
export interface ArcadeAchievement {
    /** What scripts use: Achievements.Unlock("first-win"). */
    id: string;
    name: string;
    description: string;
    /** Its name and description stay hidden until it is unlocked. */
    hidden: boolean;
}

export interface ArcadeSettings {
    leaderboards: ArcadeLeaderboard[];
    achievements: ArcadeAchievement[];
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
    /** Uploaded sound effects and music (V4). */
    audio: AudioAsset[];
    /** Uploaded GLB models (V5). */
    models: ModelAsset[];
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
