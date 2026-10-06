/**
 * RuntimeWorld — play mode of Hanogt Engine.
 *
 * Owns the live copies of scene objects, runs the Unity-like lifecycle
 * (Awake → OnEnable → Start → FixedUpdate → physics → UI events → Update →
 * coroutines → animations/tweens/timers → LateUpdate), dispatches
 * collision/trigger/mouse/button callbacks and exposes the engine API to
 * scripts through handles and host globals.
 */
import { createComponentOfType, createScriptComponent, createTransform } from "../components";
import { createEngineId } from "../ids";
import { conjugateQuat, localToWorldPoint, rotateVec3, subVec3, type Quat } from "../math";
import { cloneEntitiesWithNewIds } from "../scene";
import { tilemapSize } from "../tilemap";
import { cloneJson } from "../schema";
import type { CompiledProgram } from "../script/compiler";
import { Interpreter, type ScriptHost } from "../script/interpreter";
import { vmTruthy } from "../script/stdlib";
import {
    BudgetExceededError,
    NOT_FOUND,
    ScriptObject,
    VMColor,
    VMCoroutine,
    VMError,
    VMList,
    VMQuat,
    Vec3,
    YieldInstruction,
    type BehaviourBinding,
    type ClassInfo,
    type FieldInfo,
    type HostObject,
    type VMRef,
    type VMValue,
} from "../script/values";
import type {
    AnimatorState,
    AnimatorTransition,
    PostProcessingSettings,
    PlayerInputComponent,
    SceneSettings,
    AudioAsset,
    AudioSourceComponent,
    CameraComponent,
    ColliderComponent,
    JointComponent,
    ComponentType,
    GameComponent,
    GameEntity,
    GameProjectDocument,
    ScriptComponent,
    ScriptFieldValue,
    SceneDocument,
    UIButtonComponent,
    UIEventTarget,
    UIInputFieldComponent,
    UISliderComponent,
    UIToggleComponent,
    Vector3,
} from "../types";
import { SOUND_PRESETS, UNIQUE_COMPONENT_TYPES } from "../types";
import { rectContains, scaleRect, uiRect, type ScreenRect } from "../ui-layout";
import { AnimationPlayer } from "./animator";
import { AnimatorController } from "./animator-controller";
import { SoundEngine, type SoundHandle } from "./audio";
import { CameraFollower, CameraShaker } from "./camera-follow";
import { CharacterMotor } from "./character";
import { jointCorrection, solveJointVelocity, type JointEnd } from "./joints";
import { NavAgentState, type NavPathStatus } from "./nav-agent";
import { NavGrid, type NavBounds, type NavObstacle, type NavPoint } from "./pathfinding";
import type { CameraView } from "./camera-math";
import { screenRay, screenToWorld } from "./camera-math";
import { BehaviourState, RuntimeEntity, type CoroutineState, type WaitState } from "./entity";
import { createHostGlobals, PlayerPrefsStore } from "./globals";
import { LocalizationTable, startLanguageOf } from "../localization";
import {
    AnimationHandle,
    AudioSourceHandle,
    CameraHandle,
    ColliderHandle,
    CollisionHandle,
    ComponentHandle,
    EntityHandle,
    GameObjectHandle,
    LightHandle,
    MeshRendererHandle,
    ParticleSystemHandle,
    PrefabHandle,
    RaycastHitHandle,
    RayHandle,
    RigidbodyHandle,
    SceneHandle,
    SpriteRendererHandle,
    TextHandle,
    TilemapHandle,
    TransformHandle,
    hostError,
    isVector,
    liveEntityOf,
    toBool,
    toNumber,
    toQuat,
    toVector,
    typeNameFrom,
} from "./handles";
import { InputManager, type PlayerInputView } from "./input";
import { inputSourceOf, type InputSourceSpec } from "../input-actions";
import { ParticleEmitter } from "./particles";
import { PhysicsWorld, type ContactInfo, type PhysicsAdapter, type PhysicsEntity, type RaycastResult } from "./physics";
import { TimerManager, TweenManager, type CallbackRunner } from "./tweens";
import { ButtonHandle, ButtonLabelHandle, InputFieldHandle, PanelHandle, ProgressBarHandle, SliderHandle, ToggleHandle, sameCallable } from "./ui-handles";
import { CameraFollowHandle, CharacterController2DHandle, JointHandle, NavAgent2DHandle } from "./v4-handles";
import { AnimatorHandle, PlayerInputHandle } from "./v5-handles";

export type LogLevel = "info" | "warning" | "error";

export interface LogEntry {
    id: number;
    level: LogLevel;
    message: string;
    count: number;
    time: number;
    frame: number;
    source?: { scriptName: string; line: number };
}

export interface DebugLine {
    from: Vector3;
    to: Vector3;
    color: string;
    until: number;
}

export interface WorldOptions {
    project: GameProjectDocument;
    program: CompiledProgram;
    /** Scene to start; defaults to the project's start scene. */
    sceneId?: string | null;
    input?: InputManager;
    audio?: SoundEngine | null;
    onLog?: (entry: LogEntry, updated: boolean) => void;
    getScreenSize?: () => { width: number; height: number };
    storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
    isEditor?: boolean;
    onQuit?: () => void;
    onSceneLoaded?: (scene: SceneDocument) => void;
    /** Per-callback instruction budget of the script VM. */
    scriptBudget?: number;
    /** The player's language ("tr", "en-US"): a game with that language starts in it (V5). */
    locale?: string | null;
}

type DestroyItem =
    | { kind: "entity"; entity: RuntimeEntity }
    | { kind: "behaviour"; state: BehaviourState }
    | { kind: "component"; entity: RuntimeEntity; component: GameComponent };

type DeferredReference = { object: ScriptObject; field: string; entityId: string; typeName: string };

/** Screen fade used by SceneManager.FadeToScene. */
interface FadeState {
    alpha: number;
    color: string;
    phase: "out" | "in";
    duration: number;
    target: SceneDocument | null;
}

export interface WorldStats {
    entities: number;
    behaviours: number;
    bodies: number;
    tweens: number;
    timers: number;
    particles: number;
}

const TEXT_TYPE_NAMES = new Set(["Text", "UIText", "TextMeshProUGUI", "TextMeshPro", "TMP_Text", "TextMesh"]);

const MOUSE_METHODS = ["OnMouseDown", "OnMouseUp", "OnMouseUpAsButton", "OnMouseEnter", "OnMouseExit", "OnMouseOver", "OnMouseDrag"];

/**
 * Script type names of built-in components. `userFirst` names (V4 additions) give way to a
 * script class of the same name, so older projects that wrote their own keep working.
 */
const COMPONENT_TYPE_ALIASES: Record<string, { type: Exclude<ComponentType, "script" | "transform">; shape?: ColliderComponent["shape"]; joint?: JointComponent["kind"]; userFirst?: boolean }> = {
    Rigidbody: { type: "rigidBody" },
    Rigidbody2D: { type: "rigidBody" },
    Collider: { type: "collider" },
    Collider2D: { type: "collider" },
    BoxCollider: { type: "collider", shape: "box" },
    BoxCollider2D: { type: "collider", shape: "box" },
    SphereCollider: { type: "collider", shape: "sphere" },
    CircleCollider2D: { type: "collider", shape: "circle" },
    CapsuleCollider: { type: "collider", shape: "box" },
    CapsuleCollider2D: { type: "collider", shape: "box" },
    MeshCollider: { type: "collider", shape: "box" },
    SpriteRenderer: { type: "spriteRenderer" },
    MeshRenderer: { type: "meshRenderer" },
    MeshFilter: { type: "meshRenderer" },
    Camera: { type: "camera" },
    Light: { type: "light" },
    ParticleSystem: { type: "particleSystem" },
    AudioSource: { type: "audioSource" },
    Text: { type: "uiText" },
    UIText: { type: "uiText" },
    TextMeshProUGUI: { type: "uiText" },
    TextMeshPro: { type: "uiText" },
    TMP_Text: { type: "uiText" },
    TextMesh: { type: "uiText" },
    Button: { type: "uiButton" },
    Image: { type: "uiPanel" },
    Panel: { type: "uiPanel" },
    RawImage: { type: "uiPanel" },
    Slider: { type: "uiProgressBar" },
    ProgressBar: { type: "uiProgressBar" },
    Scrollbar: { type: "uiProgressBar" },
    Tilemap: { type: "tilemap" },
    TilemapCollider2D: { type: "tilemap" },
    TilemapRenderer: { type: "tilemap" },
    Animation: { type: "animation" },
    Animator: { type: "animation" },
    CharacterController2D: { type: "characterController2D", userFirst: true },
    CameraFollow: { type: "cameraFollow", userFirst: true },
    CinemachineCamera: { type: "cameraFollow", userFirst: true },
    CinemachineVirtualCamera: { type: "cameraFollow", userFirst: true },
    NavAgent2D: { type: "navAgent2D", userFirst: true },
    NavMeshAgent: { type: "navAgent2D", userFirst: true },
    Toggle: { type: "uiToggle", userFirst: true },
    InputField: { type: "uiInputField", userFirst: true },
    TMP_InputField: { type: "uiInputField", userFirst: true },
    Joint: { type: "joint", userFirst: true },
    Joint2D: { type: "joint", userFirst: true },
    DistanceJoint2D: { type: "joint", joint: "distance", userFirst: true },
    SpringJoint2D: { type: "joint", joint: "spring", userFirst: true },
    SpringJoint: { type: "joint", joint: "spring", userFirst: true },
    PlayerInput: { type: "playerInput", userFirst: true },
};

function pairKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Behaviour binding: what `transform`, `gameObject`, `StartCoroutine`… mean inside a script. */
class Binding implements BehaviourBinding {
    state: BehaviourState | null = null;
    readonly world: RuntimeWorld;
    readonly entity: RuntimeEntity;
    constructor(world: RuntimeWorld, entity: RuntimeEntity) {
        this.world = world;
        this.entity = entity;
    }

    get gameObject(): HostObject {
        return this.world.gameObjectHandle(this.entity);
    }

    isAlive(): boolean {
        return !this.entity.destroyed && !(this.state?.destroyed ?? false);
    }

    enter(): unknown {
        const previous = this.world.currentBehaviour;
        if (this.state && !this.state.destroyed) this.world.currentBehaviour = this.state;
        return previous;
    }

    exit(previous: unknown) {
        this.world.currentBehaviour = previous as BehaviourState | null;
    }

    getMember(name: string): VMValue | typeof NOT_FOUND {
        switch (name) {
            case "transform": return this.world.transformHandle(this.entity);
            case "gameObject": return this.world.gameObjectHandle(this.entity);
            case "name": return this.entity.name;
            case "tag": return this.entity.tag;
            case "enabled": return this.state ? this.state.component.enabled : true;
            case "isActiveAndEnabled": return Boolean(this.state?.live);
            case "useGUILayout": return true;
            default: return NOT_FOUND;
        }
    }

    setMember(name: string, value: VMValue): boolean {
        switch (name) {
            case "name":
                this.entity.name = String(value ?? "");
                return true;
            case "tag":
                this.entity.tag = String(value ?? "Untagged") || "Untagged";
                return true;
            case "enabled":
                if (this.state) this.world.setBehaviourEnabled(this.state, toBool(value));
                return true;
            case "useGUILayout":
                return true;
            default:
                return false;
        }
    }

    callMember(name: string, args: VMValue[], typeArgs: string[], refs: Array<VMRef | null> = []): VMValue | typeof NOT_FOUND {
        const world = this.world;
        const state = this.state;
        switch (name) {
            case "GetComponent":
            case "GetComponents":
            case "GetComponentInChildren":
            case "GetComponentsInChildren":
            case "GetComponentInParent":
            case "GetComponentsInParent":
            case "TryGetComponent":
            case "AddComponent":
            case "CompareTag":
            case "SendMessage":
            case "BroadcastMessage":
            case "SendMessageUpwards":
                return world.gameObjectHandle(this.entity).call(name, args, typeArgs, refs);
            case "Destroy":
                world.destroy(args[0], typeof args[1] === "number" ? args[1] : 0);
                return undefined;
            case "DestroyImmediate":
                world.destroy(args[0], 0, true);
                return undefined;
            case "Instantiate":
                return world.instantiate(args);
            case "DontDestroyOnLoad":
                world.dontDestroyOnLoad(args[0]);
                return undefined;
            case "print":
                world.log("info", args[0] === null || args[0] === undefined ? "Null" : world.display(args[0]), state ? { scriptName: state.cls.scriptName, line: 0 } : undefined);
                return undefined;
            case "Invoke":
                if (state) world.invokeLater(state, String(args[0] ?? ""), toNumber(args[1] ?? 0, "süre"), -1);
                return undefined;
            case "InvokeRepeating": {
                const rate = toNumber(args[2] ?? 0, "tekrar aralığı");
                if (rate <= 0) hostError("InvokeRepeating: tekrar aralığı sıfırdan büyük olmalı.", "UnityException");
                if (state) world.invokeLater(state, String(args[0] ?? ""), toNumber(args[1] ?? 0, "süre"), rate);
                return undefined;
            }
            case "CancelInvoke":
                if (state) {
                    const method = args.length ? String(args[0]) : null;
                    for (let index = state.invokes.length - 1; index >= 0; index -= 1) {
                        if (method === null || state.invokes[index].method === method) state.invokes.splice(index, 1);
                    }
                }
                return undefined;
            case "IsInvoking": {
                if (!state) return false;
                const method = args.length ? String(args[0]) : null;
                return state.invokes.some((item) => method === null || item.method === method);
            }
            case "StartCoroutine":
                if (!state) return null;
                return world.startCoroutine(state, args[0] ?? null, args.slice(1));
            case "StopCoroutine":
                if (state) world.stopCoroutine(state, args[0] ?? null);
                return undefined;
            case "StopAllCoroutines":
                if (state) {
                    for (const coroutine of state.coroutines) coroutine.done = true;
                    state.coroutines.length = 0;
                }
                return undefined;
            case "FindObjectOfType":
            case "FindFirstObjectByType":
            case "FindAnyObjectByType":
                return world.findObjectsOfType(typeNameFrom(args, typeArgs), true)[0] ?? null;
            case "FindObjectsOfType":
            case "FindObjectsByType":
                return world.objectList(world.findObjectsOfType(typeNameFrom(args, typeArgs), false));
            case "GetInstanceID":
            case "GetHashCode":
                return this.entity.instanceId * 16 + (state ? this.entity.behaviours.indexOf(state) : 0);
            case "ToString":
                return `${this.entity.name} (${state?.cls.name ?? "Behaviour"})`;
            default:
                return NOT_FOUND;
        }
    }
}

export class RuntimeWorld implements ScriptHost {
    readonly project: GameProjectDocument;
    readonly program: CompiledProgram;
    readonly interpreter: Interpreter;
    readonly physics: PhysicsWorld;
    readonly input: InputManager;
    readonly audio: SoundEngine | null;
    readonly prefs: PlayerPrefsStore;
    readonly is2D: boolean;
    scene: SceneDocument;
    /** Screen effects of the running scene (V5: scripts change them through ScreenEffects; the scene data stays as it is). */
    effects: PostProcessingSettings;
    /** The game's string table (V5). */
    readonly localization: LocalizationTable;
    /** The language texts are shown in; null while the game has no languages. */
    language: string | null;
    readonly entities = new Map<string, RuntimeEntity>();
    behaviours: BehaviourState[] = [];
    readonly logs: LogEntry[] = [];
    readonly debugLines: DebugLine[] = [];
    readonly tweens = new TweenManager();
    readonly timers = new TimerManager();
    hud: { text: string; until: number; color: string } | null = null;
    /** Behaviour whose code is running (owner of timers created from scripts). */
    currentBehaviour: BehaviourState | null = null;
    /** True while the pointer is over a button or a click-blocking panel. */
    pointerOverUI = false;
    status: "idle" | "running" | "paused" | "stopped" = "idle";
    /** Bumped whenever entities are created or destroyed. */
    structureVersion = 0;

    // Time
    time = 0;
    unscaledTime = 0;
    realtime = 0;
    fixedTime = 0;
    deltaTime = 0;
    unscaledDeltaTime = 0;
    fixedDeltaTime = 1 / 60;
    maximumDeltaTime = 0.1;
    timeScale = 1;
    frameCount = 0;
    fixedStepCount = 0;
    levelLoadTime = 0;
    maxSubSteps = 5;
    inFixedStep = false;
    targetFrameRate = -1;
    audioMuted = false;

    private readonly options: WorldOptions;
    private readonly globals: Map<string, VMValue>;
    private readonly physicsEntities = new Set<RuntimeEntity>();
    private readonly touching = new Set<string>();
    private pendingStarts: BehaviourState[] = [];
    private destroyQueue: DestroyItem[] = [];
    private timedDestroys: Array<{ target: VMValue; at: number }> = [];
    private pendingScene: SceneDocument | null = null;
    private fixedAccumulator = 0;
    private logSeq = 0;
    private hoverEntity: RuntimeEntity | null = null;
    private pressedEntity: RuntimeEntity | null = null;
    private mouseListeners = 0;
    private phase: "idle" | "fixed" | "update" | "late" | "endOfFrame" = "idle";
    private deferredRefs: DeferredReference[] = [];
    private warnedOnce = new Set<string>();
    private readonly scriptBudget: number;
    private quitRequested = false;
    private uiHover: string | null = null;
    private uiPressed: string | null = null;
    private readonly buttonListeners = new Map<string, VMValue[]>();
    /** Script listeners of V4 UI events, keyed "componentId:event". */
    private readonly uiListeners = new Map<string, VMValue[]>();
    /** Slider being dragged with the mouse. */
    private uiDragging: string | null = null;
    /** Input field that has the keyboard (reported by the overlay). */
    focusedInput: string | null = null;
    /** Latest request to focus an input field (id) or to let go of the keyboard (null); the overlay acts on new serials. */
    inputFocus: { id: string | null; serial: number } = { id: null, serial: 0 };
    private fade: FadeState | null = null;
    /** Screen shakes added to the rendered camera (Camera.Shake). */
    readonly shaker = new CameraShaker();
    /** What the game asked to play (newest last, at most 100): the console and tests read it. */
    readonly audioEvents: Array<{ kind: "sfx" | "loop" | "music" | "stopMusic"; name: string }> = [];
    /** Uploaded sounds playing from AudioSource components (Stop, isPlaying, loops). */
    private readonly sourceSounds = new Map<string, SoundHandle>();
    private musicName: string | null = null;
    /** Pathfinding.cellSize (null: the first tilemap's cell size, else 0.5). */
    navCellSize: number | null = null;
    /** Pathfinding.agentRadius: clearance kept by Pathfinding.FindPath. */
    navRadius = 0.25;
    private readonly navGrids = new Map<number, { frame: number; structure: number; key: string; grid: NavGrid | null }>();
    /** Bumped when tiles or colliders change, so path finding rescans within the same frame. */
    private obstacleRevision = 0;
    /** Runs timer/tween/button callbacks with error isolation. */
    readonly runCallback: CallbackRunner = (owner, label, callback, args) => {
        if (owner?.destroyed || owner?.failed) return;
        const previous = this.currentBehaviour;
        this.currentBehaviour = owner;
        try {
            this.guard(owner, label, () => this.interpreter.invokeCallable(callback, args));
        } finally {
            this.currentBehaviour = previous;
        }
    };

    constructor(options: WorldOptions) {
        this.options = options;
        this.project = options.project;
        this.program = options.program;
        this.is2D = options.project.dimension === "2d";
        this.interpreter = new Interpreter(options.program, this);
        this.scriptBudget = options.scriptBudget ?? 3_000_000;
        this.interpreter.budget = this.scriptBudget;
        const adapter: PhysicsAdapter = {
            entities: () => this.physicsEntities,
            worldTRS: (entity) => (entity as RuntimeEntity).world,
            translate: (entity, delta) => this.translate(entity, delta),
            rotateEuler: (entity, delta) => this.rotateEuler(entity, delta),
        };
        this.physics = new PhysicsWorld(adapter, options.project.dimension);
        this.input = options.input ?? new InputManager();
        this.input.configure(options.project.settings.input);
        this.audio = options.audio === undefined ? null : options.audio;
        this.prefs = new PlayerPrefsStore(options.storage ?? null, `hanogt-engine:prefs:${options.project.id}`);
        this.scene = this.findScene(options.sceneId ?? options.project.settings.startSceneId) ?? options.project.scenes[0];
        this.effects = cloneJson(this.scene.settings.postProcessing);
        this.localization = new LocalizationTable(options.project.settings.localization);
        this.language = startLanguageOf(options.project.settings.localization, this.locale);
        this.globals = createHostGlobals(this);
    }

    get isEditor() {
        return Boolean(this.options.isEditor);
    }

    /** The player's language ("tr", "en-US"): the player's choice, else the browser's. */
    get locale(): string | null {
        return this.options.locale || (typeof navigator !== "undefined" ? navigator.language : null) || null;
    }

    /** Engine rules of the game (3 for projects made before V4). */
    get rules() {
        return this.options.project.settings.rules;
    }

    // -------------------------------------------------------------------
    // Lifecycle of the world
    // -------------------------------------------------------------------

    start() {
        if (this.status !== "idle") return;
        this.status = "running";
        this.interpreter.resetStatics();
        this.guard(null, "global değişkenler", () => this.interpreter.initialiseGlobals());
        if (!this.program.ok) {
            const errors = this.program.diagnostics.filter((item) => item.severity === "error");
            for (const diagnostic of errors.slice(0, 20)) {
                this.log("error", `Derleme hatası: ${diagnostic.message}`, { scriptName: diagnostic.scriptName, line: diagnostic.line });
            }
        }
        this.loadSceneNow(this.scene);
    }

    pause() {
        if (this.status !== "running") return;
        this.status = "paused";
        this.broadcast("OnApplicationPause", [true]);
    }

    resume() {
        if (this.status !== "paused") return;
        this.status = "running";
        this.broadcast("OnApplicationPause", [false]);
    }

    /** Ends play mode: OnApplicationQuit, OnDisable and OnDestroy run like in Unity. */
    stop() {
        if (this.status === "stopped") return;
        const wasRunning = this.status !== "idle";
        this.status = "stopped";
        if (!wasRunning) return;
        this.broadcast("OnApplicationQuit", []);
        for (const entity of this.rootEntities()) this.destroyEntityNow(entity);
        this.audio?.stopAll();
        this.sourceSounds.clear();
        this.musicName = null;
        this.tweens.killAll();
        this.timers.cancelAll();
        this.interpreter.flushAllStreams();
        this.prefs.flush();
    }

    /** Runs one frame. `realDelta` is the wall-clock time since the previous frame in seconds. */
    step(realDelta: number) {
        if (this.status !== "running") return;
        const safeDelta = Number.isFinite(realDelta) ? Math.max(0, realDelta) : 0;
        const clamped = Math.min(safeDelta, this.maximumDeltaTime);
        this.realtime += safeDelta;
        this.unscaledDeltaTime = clamped;
        this.unscaledTime += clamped;
        this.deltaTime = clamped * this.timeScale;
        this.time += this.deltaTime;
        this.frameCount += 1;
        this.input.beginFrame(clamped);

        this.flushStarts();
        this.sampleMotors(clamped);

        // Fixed timestep: FixedUpdate → physics → collision callbacks.
        if (this.timeScale > 0) {
            const fixed = this.fixedDeltaTime;
            this.fixedAccumulator += this.deltaTime;
            let steps = 0;
            while (this.fixedAccumulator >= fixed - 1e-9 && steps < this.maxSubSteps) {
                this.fixedStep(fixed);
                this.fixedAccumulator -= fixed;
                steps += 1;
                if (this.status !== "running") return;
            }
            if (steps >= this.maxSubSteps) this.fixedAccumulator = Math.min(this.fixedAccumulator, fixed);
        }

        this.processUIEvents();
        this.processMouseEvents();
        this.flushStarts();

        this.phase = "update";
        for (const state of this.behaviours.slice()) {
            if (state.has.Update && state.started && state.live) this.callMethod(state, "Update", [this.deltaTime]);
        }
        this.runInvokes();
        this.runCoroutines("frame");
        this.updateNavAgents(this.deltaTime);
        this.updateAnimations(this.deltaTime);
        this.tweens.update(this.deltaTime, this.runCallback);
        this.timers.update(this.deltaTime, this.runCallback);
        this.processDestroyQueue();

        this.phase = "late";
        for (const state of this.behaviours.slice()) {
            if (state.has.LateUpdate && state.started && state.live) this.callMethod(state, "LateUpdate", [this.deltaTime]);
        }
        this.updateFollowers(this.deltaTime);
        this.shaker.update(this.deltaTime);
        this.drawJoints();
        this.updateParticles(this.deltaTime);

        this.phase = "endOfFrame";
        this.runCoroutines("endOfFrame");
        this.processDestroyQueue();
        this.phase = "idle";

        for (let index = this.debugLines.length - 1; index >= 0; index -= 1) {
            if (this.debugLines[index].until < this.time) this.debugLines.splice(index, 1);
        }
        if (this.hud && this.hud.until < this.realtime) this.hud = null;
        this.updateFade(clamped);
        this.interpreter.flushAllStreams();

        if (this.pendingScene) {
            const next = this.pendingScene;
            this.pendingScene = null;
            this.loadSceneNow(next);
        }
        if (this.quitRequested) {
            this.quitRequested = false;
            this.stop();
            this.options.onQuit?.();
        }
    }

    /** Application.Quit(): finishes the current frame, then stops. */
    requestQuit() {
        this.quitRequested = true;
    }

    private fixedStep(dt: number) {
        this.phase = "fixed";
        this.inFixedStep = true;
        for (const state of this.behaviours.slice()) {
            if (state.has.FixedUpdate && state.started && state.live) this.callMethod(state, "FixedUpdate", [dt]);
        }
        this.updateMotors(dt);
        this.solveJoints(dt, "velocity");
        const events = this.physics.step(dt);
        this.solveJoints(dt, "position");
        this.fixedTime += dt;
        this.fixedStepCount += 1;
        for (const info of events.enter) this.touching.add(pairKey(info.a, info.b));
        for (const info of events.exit) this.touching.delete(pairKey(info.a, info.b));
        for (const info of events.enter) this.dispatchContact(info, "Enter");
        for (const info of events.stay) this.dispatchContact(info, "Stay");
        for (const info of events.exit) this.dispatchContact(info, "Exit");
        this.runCoroutines("fixed");
        this.inFixedStep = false;
        this.processDestroyQueue();
        this.flushStarts();
    }

    // -------------------------------------------------------------------
    // Script calls & error handling
    // -------------------------------------------------------------------

    /** Runs a script callback with a fresh instruction budget and error isolation. */
    guard<T>(state: BehaviourState | null, label: string, fn: () => T): T | undefined {
        this.interpreter.resetBudget();
        try {
            return fn();
        } catch (error) {
            this.reportScriptError(error, state, label);
            return undefined;
        }
    }

    reportScriptError(error: unknown, state: BehaviourState | null, label: string) {
        if (error instanceof BudgetExceededError) {
            if (state) state.failed = true;
            this.log("error", `${state ? `${state.cls.name}.${label}` : label}: ${error.message}${state ? " Bu script bu oturum için devre dışı bırakıldı." : ""}`, {
                scriptName: error.scriptName || state?.cls.scriptName || "",
                line: error.line,
            });
            return;
        }
        if (error instanceof VMError) {
            const trace = error.trace.length ? `\n  konum: ${error.trace.join("\n  konum: ")}` : "";
            this.log("error", `${error.exceptionType}: ${error.message}${trace}`, { scriptName: error.scriptName || state?.cls.scriptName || "", line: error.line });
            return;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.log("error", `Motor hatası (${state ? `${state.cls.name}.` : ""}${label}): ${message}`);
    }

    /** Calls a lifecycle/message method; coroutine results (IEnumerator Start) are scheduled. */
    callMethod(state: BehaviourState, name: string, args: VMValue[] = []): VMValue {
        if (state.destroyed || state.failed) return undefined;
        const previous = this.currentBehaviour;
        this.currentBehaviour = state;
        try {
            const result = this.guard(state, name, () => this.interpreter.invoke(state.object, name, args));
            if (result instanceof VMCoroutine && !result.started) this.startCoroutine(state, result, []);
            return result === NOT_FOUND ? undefined : result;
        } finally {
            this.currentBehaviour = previous;
        }
    }

    private hasMethod(state: BehaviourState, name: string) {
        return this.interpreter.hasMethod(state.object, name, true);
    }

    private broadcast(method: string, args: VMValue[]) {
        for (const state of this.behaviours.slice()) {
            if (!state.destroyed && state.awoken && this.hasMethod(state, method)) this.callMethod(state, method, args);
        }
    }

    // -------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------

    log(level: LogLevel, message: string, source?: { scriptName: string; line: number }) {
        const text = String(message).slice(0, 4000);
        const cleanSource = source && (source.scriptName || source.line) ? source : undefined;
        const same = (entry: LogEntry | undefined) => entry
            && entry.level === level
            && entry.message === text
            && entry.source?.scriptName === cleanSource?.scriptName
            && entry.source?.line === cleanSource?.line;
        let existing: LogEntry | undefined = this.logs[this.logs.length - 1];
        if (!same(existing) && level !== "info") {
            // Repeating errors (e.g. every frame in Update) collapse into one line.
            for (let index = this.logs.length - 2; index >= Math.max(0, this.logs.length - 30); index -= 1) {
                if (same(this.logs[index])) {
                    existing = this.logs[index];
                    break;
                }
            }
        }
        if (existing && same(existing)) {
            existing.count += 1;
            existing.time = this.time;
            existing.frame = this.frameCount;
            this.options.onLog?.(existing, true);
            return;
        }
        const entry: LogEntry = { id: ++this.logSeq, level, message: text, count: 1, time: this.time, frame: this.frameCount, source: cleanSource };
        this.logs.push(entry);
        if (this.logs.length > 1000) this.logs.splice(0, this.logs.length - 1000);
        this.options.onLog?.(entry, false);
    }

    warnOnce(key: string, message: string) {
        if (this.warnedOnce.has(key)) return;
        this.warnedOnce.add(key);
        this.log("warning", message);
    }

    display(value: VMValue): string {
        return this.interpreter.display(value);
    }

    // -------------------------------------------------------------------
    // ScriptHost
    // -------------------------------------------------------------------

    resolveGlobal(name: string): VMValue | typeof NOT_FOUND {
        return this.globals.has(name) ? this.globals.get(name) : NOT_FOUND;
    }

    construct(typeName: string, args: VMValue[]): VMValue | typeof NOT_FOUND {
        switch (typeName) {
            case "GameObject": {
                const name = typeof args[0] === "string" ? args[0] : "New Game Object";
                const doc: GameEntity = { id: createEngineId("entity"), name, tag: "Untagged", parentId: null, active: true, components: [createTransform()] };
                const [entity] = this.spawn([doc], {});
                for (const extra of args.slice(1)) if (typeof extra === "string") this.addComponent(entity, extra);
                return this.gameObjectHandle(entity);
            }
            case "Ray":
            case "Ray2D": {
                const origin = isVector(args[0]) ? toVector(args[0]) : { x: 0, y: 0, z: 0 };
                const direction = isVector(args[1]) ? toVector(args[1]) : { x: 0, y: 0, z: 1 };
                const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
                return this.rayHandle({ origin, direction: { x: direction.x / length, y: direction.y / length, z: direction.z / length } });
            }
            case "RaycastHit":
            case "RaycastHit2D":
                return RaycastHitHandle.miss(this);
            default:
                return NOT_FOUND;
        }
    }

    // -------------------------------------------------------------------
    // PhysicsAdapter
    // -------------------------------------------------------------------

    private translate(entity: PhysicsEntity, delta: Vector3) {
        const runtime = entity as RuntimeEntity;
        if (runtime.parent) {
            const parent = runtime.parent.world;
            const local = rotateVec3(conjugateQuat(parent.rotation), delta);
            runtime.localPosition = {
                x: runtime.localPosition.x + (parent.scale.x ? local.x / parent.scale.x : 0),
                y: runtime.localPosition.y + (parent.scale.y ? local.y / parent.scale.y : 0),
                z: runtime.localPosition.z + (parent.scale.z ? local.z / parent.scale.z : 0),
            };
        } else {
            runtime.localPosition = { x: runtime.localPosition.x + delta.x, y: runtime.localPosition.y + delta.y, z: runtime.localPosition.z + delta.z };
        }
        runtime.markDirty();
    }

    private rotateEuler(entity: PhysicsEntity, deltaDegrees: Vector3) {
        const runtime = entity as RuntimeEntity;
        const half = Math.PI / 360;
        const dq: Quat = {
            x: Math.sin(deltaDegrees.x * half),
            y: Math.sin(deltaDegrees.y * half),
            z: Math.sin(deltaDegrees.z * half),
            w: 1,
        };
        dq.w = Math.sqrt(Math.max(0, 1 - dq.x * dq.x - dq.y * dq.y - dq.z * dq.z));
        const current = runtime.world.rotation;
        runtime.setWorldRotation({
            x: dq.x * current.w + dq.w * current.x + dq.y * current.z - dq.z * current.y,
            y: dq.y * current.w + dq.w * current.y + dq.z * current.x - dq.x * current.z,
            z: dq.z * current.w + dq.w * current.z + dq.x * current.y - dq.y * current.x,
            w: dq.w * current.w - dq.x * current.x - dq.y * current.y - dq.z * current.z,
        });
    }

    private registerPhysics(entity: RuntimeEntity) {
        if ((entity.rigidBody || entity.collider || entity.tilemap) && !entity.destroyed) this.physicsEntities.add(entity);
        else this.physicsEntities.delete(entity);
    }

    areTouching(a: string, b: string) {
        return this.touching.has(pairKey(a, b));
    }

    // -------------------------------------------------------------------
    // Scenes
    // -------------------------------------------------------------------

    findScene(nameOrId: string | number | null | undefined): SceneDocument | undefined {
        const scenes = this.project.scenes;
        if (typeof nameOrId === "number") return scenes[Math.trunc(nameOrId)];
        if (!nameOrId) return undefined;
        const text = String(nameOrId);
        return scenes.find((scene) => scene.id === text)
            ?? scenes.find((scene) => scene.name === text)
            ?? scenes.find((scene) => scene.name.toLowerCase() === text.toLowerCase());
    }

    /** The scene's settings as the renderer should draw them (with the effects scripts changed). */
    get renderSettings(): SceneSettings {
        return { ...this.scene.settings, postProcessing: this.effects };
    }

    /** ScreenEffects.Reset(): back to the scene's own effects. */
    resetEffects() {
        this.effects = cloneJson(this.scene.settings.postProcessing);
    }

    // -------------------------------------------------------------------
    // Localization (V5)
    // -------------------------------------------------------------------

    /** The key's text in the current language; null (after one warning) when the string table has no such key. */
    localize(key: string, caller = "Localization.Get"): string | null {
        const text = this.localization.text(key, this.language);
        if (text === null) this.warnOnce(`localization:${key}`, `${caller}: dil tablosunda '${key}' anahtarı yok (Proje ayarları → Diller).`);
        return text;
    }

    /** A UI element with a string table key shows the key's text (its own text stays when the key is missing). */
    localizeComponent(component: GameComponent) {
        if (!("localizationKey" in component) || !component.localizationKey) return;
        const text = this.localize(component.localizationKey, `'${component.localizationKey}' anahtarlı UI öğesi`);
        if (text === null) return;
        switch (component.type) {
            case "uiText":
            case "uiButton":
                component.text = text;
                break;
            case "uiToggle":
                component.label = text;
                break;
            case "uiInputField":
                component.placeholder = text;
                break;
        }
    }

    private localizeEntity(entity: RuntimeEntity) {
        for (const component of entity.components) this.localizeComponent(component);
    }

    /**
     * Localization.language = code: every UI element with a key switches to
     * the language and scripts get OnLanguageChanged(code). False (after a
     * warning) when the game has no such language.
     */
    setLanguage(code: string): boolean {
        const language = this.localization.language(code);
        if (!language) {
            const offered = this.localization.languages.join(", ") || "yok";
            this.warnOnce(`localization-language:${code}`, `Localization: oyunda '${code}' dili yok (diller: ${offered}).`);
            return false;
        }
        if (language === this.language) return true;
        this.language = language;
        for (const entity of this.entities.values()) {
            if (!entity.destroyed) this.localizeEntity(entity);
        }
        this.broadcast("OnLanguageChanged", [language]);
        return true;
    }

    sceneIndex(scene: SceneDocument = this.scene) {
        return Math.max(0, this.project.scenes.findIndex((candidate) => candidate.id === scene.id));
    }

    sceneHandle(scene: SceneDocument = this.scene) {
        return new SceneHandle(scene.name, this.sceneIndex(scene));
    }

    requestSceneLoad(target: VMValue) {
        const scene = typeof target === "number" ? this.findScene(target) : target instanceof SceneHandle ? this.findScene(target.buildIndex) : this.findScene(String(target ?? ""));
        if (!scene) hostError(`Sahne bulunamadı: '${this.display(target)}'. Sahne adını veya sırasını (0, 1, …) kontrol edin.`, "ArgumentException");
        this.pendingScene = scene;
    }

    private loadSceneNow(scene: SceneDocument) {
        for (const entity of this.rootEntities()) {
            if (!entity.persistent) this.destroyEntityNow(entity);
        }
        this.physics.reset();
        this.touching.clear();
        this.hoverEntity = null;
        this.pressedEntity = null;
        this.uiHover = null;
        this.uiPressed = null;
        this.pointerOverUI = false;
        this.shaker.stop();
        for (const entity of this.entities.values()) entity.follower?.snap();
        this.scene = scene;
        const settings = scene.settings;
        this.effects = cloneJson(settings.postProcessing);
        this.physics.gravity = { ...settings.physics.gravity };
        this.fixedDeltaTime = Math.min(0.1, Math.max(1 / 240, settings.physics.fixedTimeStep || 1 / 60));
        this.maxSubSteps = Math.max(1, Math.min(10, Math.trunc(settings.physics.maxSubSteps || 5)));
        let docs = cloneJson(scene.objects);
        if (docs.some((doc) => this.entities.has(doc.id))) docs = cloneEntitiesWithNewIds(docs, null);
        this.levelLoadTime = this.time;
        this.spawn(docs, {});
        this.structureVersion += 1;
        if (this.options.onSceneLoaded) this.guard(null, "sahne yükleme", () => this.options.onSceneLoaded?.(scene));
    }

    // -------------------------------------------------------------------
    // Entity creation
    // -------------------------------------------------------------------

    /** Creates runtime entities (scene load, Instantiate, new GameObject) and runs Awake/OnEnable. */
    spawn(docs: GameEntity[], options: { parent?: RuntimeEntity | null; position?: Vector3; rotation?: Quat; keepWorld?: boolean }): RuntimeEntity[] {
        const created: RuntimeEntity[] = [];
        const batch = new Map<string, RuntimeEntity>();
        for (const doc of docs) {
            if (this.entities.has(doc.id) || batch.has(doc.id)) continue;
            const entity = new RuntimeEntity(doc);
            batch.set(entity.id, entity);
            created.push(entity);
        }
        for (const entity of created) this.entities.set(entity.id, entity);
        const parentIds = new Map(docs.map((doc) => [doc.id, doc.parentId]));
        for (const entity of created) {
            const parentId = parentIds.get(entity.id);
            const parent = parentId ? batch.get(parentId) ?? null : null;
            if (parent && parent !== entity) {
                entity.parent = parent;
                parent.children.push(entity);
            }
        }
        const roots = created.filter((entity) => !entity.parent);
        for (const root of roots) {
            if (options.parent && !options.parent.destroyed) {
                const worldBefore = options.keepWorld ? root.world : null;
                root.parent = options.parent;
                options.parent.children.push(root);
                root.markDirty();
                if (worldBefore) {
                    root.setWorldPosition(worldBefore.position);
                    root.setWorldRotation(worldBefore.rotation);
                }
            }
            if (options.position) root.setWorldPosition(options.position);
            if (options.rotation) root.setWorldRotation(options.rotation);
        }
        for (const entity of created) {
            this.registerPhysics(entity);
            this.localizeEntity(entity);
            const particles = entity.components.find((component) => component.type === "particleSystem");
            if (particles && particles.type === "particleSystem") entity.emitter = new ParticleEmitter(particles);
            const animation = entity.components.find((component) => component.type === "animation");
            if (animation && animation.type === "animation") entity.animator = new AnimationPlayer(animation);
        }
        // Behaviours: create every instance first so cross references resolve, then Awake/OnEnable.
        const newStates: BehaviourState[] = [];
        for (const entity of created) {
            for (const component of entity.components) {
                if (component.type !== "script") continue;
                const state = this.createBehaviour(entity, component);
                if (state) newStates.push(state);
            }
        }
        this.resolveDeferredReferences();
        for (const entity of created) {
            if (!entity.activeInHierarchy) continue;
            this.activateBehaviours(entity);
            if (entity.destroyed) continue;
            for (const component of entity.components) {
                if (component.type === "audioSource" && component.enabled && component.playOnStart) this.playSource(component);
            }
        }
        this.structureVersion += 1;
        void newStates;
        return created;
    }

    private findBehaviourClass(component: ScriptComponent): ClassInfo | null {
        if (component.className) {
            const cls = this.program.classes.get(component.className);
            if (cls?.isBehaviour) return cls;
        }
        const names = this.program.behavioursByScript.get(component.scriptId) ?? [];
        const script = this.project.scripts.find((item) => item.id === component.scriptId);
        const byFileName = script ? names.find((name) => name === script.name.replace(/\.(cs|cpp|h|hpp)$/i, "")) : undefined;
        const name = byFileName ?? names[0];
        return name ? this.program.classes.get(name) ?? null : null;
    }

    private createBehaviour(entity: RuntimeEntity, component: ScriptComponent): BehaviourState | null {
        const cls = this.findBehaviourClass(component);
        if (!cls) {
            const script = this.project.scripts.find((item) => item.id === component.scriptId);
            this.warnOnce(`missing:${component.scriptId}:${component.className ?? ""}`, script
                ? `'${entity.name}' nesnesindeki '${script.name}' script'inde MonoBehaviour sınıfı bulunamadı veya derleme hatası var.`
                : `'${entity.name}' nesnesindeki script dosyası bulunamadı (silinmiş olabilir).`);
            return null;
        }
        const binding = new Binding(this, entity);
        const deferred: Array<{ field: string; entityId: string; typeName: string }> = [];
        const object = this.guard(null, `${cls.name} oluşturma`, () => this.interpreter.instantiateBehaviour(cls, binding, component.fields, (value, field) => this.resolveFieldReference(value, field, deferred)));
        if (!object) return null;
        for (const item of deferred) this.deferredRefs.push({ object, ...item });
        const state = new BehaviourState(entity, component, cls, object, {
            has: (name) => this.interpreter.hasMethod(object, name, true),
            arity: (name) => this.interpreter.methodArity(object, name),
        });
        binding.state = state;
        entity.behaviours.push(state);
        this.behaviours.push(state);
        if (MOUSE_METHODS.some((name) => this.interpreter.hasMethod(object, name, false))) this.mouseListeners += 1;
        return state;
    }

    private resolveFieldReference(value: { ref: "entity" | "prefab"; id: string | null }, field: FieldInfo, deferred: Array<{ field: string; entityId: string; typeName: string }>): VMValue {
        if (!value.id) return null;
        const typeName = field.typeName;
        if (value.ref === "prefab") {
            const prefab = this.project.prefabs.find((item) => item.id === value.id);
            if (!prefab) return null;
            return new PrefabHandle(prefab, typeName === "GameObject" || typeName === "Object" || typeName === "Transform" ? null : typeName);
        }
        const entity = this.entities.get(value.id);
        if (!entity) return null;
        if (this.program.classes.has(typeName)) {
            deferred.push({ field: field.name, entityId: entity.id, typeName });
            return null;
        }
        return this.referenceAs(entity, typeName);
    }

    private resolveDeferredReferences() {
        const pending = this.deferredRefs;
        this.deferredRefs = [];
        for (const item of pending) {
            const entity = this.entities.get(item.entityId);
            if (entity) item.object.fields[item.field] = this.getComponent(entity, item.typeName);
        }
    }

    referenceAs(entity: RuntimeEntity, typeName: string): VMValue {
        switch (typeName) {
            case "GameObject":
            case "Object":
            case "object":
            case "var":
                return this.gameObjectHandle(entity);
            case "Transform":
                return this.transformHandle(entity);
            default:
                return this.getComponent(entity, typeName);
        }
    }

    private activateBehaviours(entity: RuntimeEntity) {
        for (const state of entity.behaviours.slice()) {
            if (state.destroyed) continue;
            if (!state.awoken) {
                state.awoken = true;
                this.callMethod(state, "Awake");
            }
            if (state.destroyed || !entity.activeInHierarchy) return;
            if (state.enabled && !state.enabledCalled) {
                state.enabledCalled = true;
                this.callMethod(state, "OnEnable");
            }
            if (state.enabled && !state.started && !this.pendingStarts.includes(state)) this.pendingStarts.push(state);
        }
        if (entity.emitter && entity.emitter.component.playOnStart && entity.emitter.component.enabled && !entity.emitter.playing && entity.emitter.count === 0) entity.emitter.play();
        const animator = entity.animator;
        const stateMachine = entity.animatorComponent;
        if (animator && !animator.autoPlayed && animator.component.enabled && animator.component.playOnStart && !(stateMachine?.enabled && stateMachine.states.length)) {
            animator.autoPlayed = true;
            animator.play(entity);
        }
    }

    private deactivateBehaviours(entity: RuntimeEntity) {
        for (const state of entity.behaviours.slice()) {
            if (state.destroyed) continue;
            for (const coroutine of state.coroutines) coroutine.done = true;
            state.coroutines.length = 0;
            if (state.enabledCalled) {
                state.enabledCalled = false;
                this.callMethod(state, "OnDisable");
            }
        }
    }

    private flushStarts() {
        let guard = 0;
        while (this.pendingStarts.length && guard < 10_000) {
            const batch = this.pendingStarts;
            this.pendingStarts = [];
            for (const state of batch) {
                guard += 1;
                if (state.started || state.destroyed || !state.live) continue;
                state.started = true;
                this.callMethod(state, "Start");
            }
        }
    }

    setBehaviourEnabled(state: BehaviourState, enabled: boolean) {
        if (state.component.enabled === enabled) return;
        state.component.enabled = enabled;
        if (state.destroyed || !state.entity.activeInHierarchy) return;
        if (enabled) {
            if (state.failed) return;
            if (!state.enabledCalled) {
                state.enabledCalled = true;
                this.callMethod(state, "OnEnable");
            }
            if (!state.started && !this.pendingStarts.includes(state)) this.pendingStarts.push(state);
        } else if (state.enabledCalled) {
            state.enabledCalled = false;
            this.callMethod(state, "OnDisable");
        }
    }

    setActive(entity: RuntimeEntity, active: boolean) {
        if (entity.destroyed || entity.activeSelf === active) return;
        const affected = entity.subtree();
        const wasActive = new Set(affected.filter((node) => node.activeInHierarchy));
        entity.activeSelf = active;
        if (active) {
            for (const node of affected) if (!wasActive.has(node) && node.activeInHierarchy) this.activateBehaviours(node);
        } else {
            for (const node of affected) if (wasActive.has(node)) this.deactivateBehaviours(node);
            if (this.hoverEntity && !this.hoverEntity.activeInHierarchy) this.hoverEntity = null;
        }
        entity.renderVersion += 1;
    }

    setParent(entity: RuntimeEntity, parentValue: VMValue, worldPositionStays: boolean) {
        const parent = parentValue === null || parentValue === undefined ? null : liveEntityOf(parentValue);
        if (parentValue !== null && parentValue !== undefined && !parent) hostError("SetParent: geçerli bir Transform bekleniyor.", "ArgumentException");
        if (parent === entity.parent) return;
        if (parent && (parent === entity || parent.isDescendantOf(entity))) hostError("Bir nesne kendi alt nesnesinin çocuğu yapılamaz.", "InvalidOperationException");
        const before = entity.world;
        const wasActive = entity.activeInHierarchy;
        if (entity.parent) {
            const siblings = entity.parent.children;
            const index = siblings.indexOf(entity);
            if (index >= 0) siblings.splice(index, 1);
        }
        entity.parent = parent;
        if (parent) parent.children.push(entity);
        // Force recomputation from the new parent (the cache may be valid for the old one).
        entity.localPosition = { ...entity.localPosition };
        (entity as unknown as { worldCache: unknown }).worldCache = null;
        for (const child of entity.children) child.markDirty();
        if (worldPositionStays) {
            entity.setWorldPosition(before.position);
            entity.setWorldRotation(before.rotation);
            if (parent) {
                const parentScale = parent.world.scale;
                entity.setLocalScale({
                    x: parentScale.x ? before.scale.x / parentScale.x : before.scale.x,
                    y: parentScale.y ? before.scale.y / parentScale.y : before.scale.y,
                    z: parentScale.z ? before.scale.z / parentScale.z : before.scale.z,
                });
            } else {
                entity.setLocalScale(before.scale);
            }
        }
        const nowActive = entity.activeInHierarchy;
        if (wasActive && !nowActive) for (const node of entity.subtree()) this.deactivateBehaviours(node);
        if (!wasActive && nowActive) for (const node of entity.subtree()) if (node.activeInHierarchy) this.activateBehaviours(node);
        entity.renderVersion += 1;
    }

    dontDestroyOnLoad(target: VMValue) {
        const entity = liveEntityOf(target);
        if (!entity) return;
        const root = entity.root();
        if (root !== entity) this.log("warning", "DontDestroyOnLoad yalnızca kök nesnelerde çalışır; kök nesne kalıcı yapıldı.");
        root.persistent = true;
    }

    // -------------------------------------------------------------------
    // Instantiate
    // -------------------------------------------------------------------

    private snapshotSubtree(root: RuntimeEntity): GameEntity[] {
        return root.subtree().map((node) => {
            node.syncTransformComponent();
            const components = cloneJson(node.components.filter((component) => component.type !== "script" || node.behaviours.some((state) => state.component === component && !state.destroyed)));
            for (const component of components) {
                if (component.type !== "script") continue;
                const state = node.behaviours.find((candidate) => candidate.component.id === component.id);
                if (!state) continue;
                const fields: Record<string, ScriptFieldValue> = { ...component.fields };
                for (const field of state.cls.allInstanceFields()) {
                    if (!field.serialized) continue;
                    const converted = this.toFieldValue(state.object.fields[field.name]);
                    if (converted !== undefined) fields[field.name] = converted;
                }
                component.fields = fields;
            }
            return {
                id: node.id,
                name: node.name,
                tag: node.tag,
                parentId: node === root ? null : node.parent?.id ?? null,
                active: node.activeSelf,
                components,
            };
        });
    }

    private toFieldValue(value: VMValue): ScriptFieldValue | undefined {
        if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
        if (value === null) return null;
        if (value instanceof Vec3) return { x: value.x, y: value.y, z: value.z };
        if (value instanceof VMColor) return value.toHex();
        if (value instanceof PrefabHandle) return { ref: "prefab", id: value.prefab.id };
        const entity = liveEntityOf(value);
        if (entity) return { ref: "entity", id: entity.id };
        return undefined;
    }

    instantiate(args: VMValue[]): VMValue {
        const original = args[0];
        if (original === null || original === undefined) hostError("Instantiate: kopyalanacak nesne null. Inspector'da prefab alanını doldurdunuz mu?", "ArgumentException");
        let docs: GameEntity[];
        let componentIndex = -1;
        let componentType: string | null = null;
        let rootActive = true;
        if (original instanceof PrefabHandle) {
            docs = cloneJson(original.prefab.entities);
            componentType = original.componentType;
            rootActive = docs[0]?.active ?? true;
        } else {
            const source = liveEntityOf(original);
            if (!source) hostError("Instantiate: yok edilmiş veya geçersiz bir nesne kopyalanamaz.", "MissingReferenceException");
            docs = this.snapshotSubtree(source);
            rootActive = source.activeSelf;
            if (original instanceof ComponentHandle) componentIndex = source.components.indexOf(original.component);
            else if (original instanceof TransformHandle) componentType = "Transform";
            else if (original instanceof ScriptObject) {
                const state = source.behaviours.find((candidate) => candidate.object === original);
                componentIndex = state ? source.components.indexOf(state.component) : -1;
            }
        }
        if (!docs.length) hostError("Instantiate: prefab boş.", "ArgumentException");
        let position: Vector3 | undefined;
        let rotation: Quat | undefined;
        let parent: RuntimeEntity | null = null;
        let keepWorld = false;
        if (isVector(args[1])) {
            position = toVector(args[1], "pozisyon");
            if (args[2] instanceof VMQuat) rotation = toQuat(args[2]);
            if (args[3] !== undefined && args[3] !== null) parent = liveEntityOf(args[3]);
        } else if (args[1] !== undefined && args[1] !== null) {
            parent = liveEntityOf(args[1]);
            keepWorld = toBool(args[2] ?? false);
        }
        const clones = cloneEntitiesWithNewIds(docs, null);
        clones[0].parentId = null;
        clones[0].name = `${clones[0].name}(Clone)`;
        clones[0].active = rootActive;
        const created = this.spawn(clones, { parent, position, rotation, keepWorld });
        const root = created[0];
        if (!root) return null;
        if (componentType === "Transform") return this.transformHandle(root);
        if (componentType && componentType !== "GameObject") return this.getComponent(root, componentType);
        if (componentIndex >= 0) {
            const component = root.components[componentIndex];
            return component ? this.componentHandle(root, component) : null;
        }
        return this.gameObjectHandle(root);
    }

    createPrimitive(kind: string): VMValue {
        const mesh = String(kind).toLowerCase();
        const valid = ["cube", "sphere", "capsule", "cylinder", "plane", "quad"];
        if (!valid.includes(mesh)) hostError(`Bilinmeyen PrimitiveType: ${kind}`, "ArgumentException");
        const names: Record<string, string> = { cube: "Cube", sphere: "Sphere", capsule: "Capsule", cylinder: "Cylinder", plane: "Plane", quad: "Quad" };
        const components: GameComponent[] = [createTransform(mesh === "plane" ? { scale: { x: 10, y: 1, z: 10 } } : {})];
        const renderer = createComponentOfType("meshRenderer", this.project.dimension);
        if (renderer.type === "meshRenderer") renderer.mesh = mesh === "quad" ? "plane" : mesh as typeof renderer.mesh;
        components.push(renderer);
        const collider = createComponentOfType("collider", this.project.dimension) as ColliderComponent;
        if (mesh === "sphere") {
            collider.shape = "sphere";
            collider.radius = 0.5;
        } else if (mesh === "capsule" || mesh === "cylinder") {
            collider.size = { x: 1, y: 2, z: 1 };
        } else if (mesh === "plane" || mesh === "quad") {
            collider.size = { x: 1, y: 0.02, z: 1 };
        }
        components.push(collider);
        const [entity] = this.spawn([{ id: createEngineId("entity"), name: names[mesh], tag: "Untagged", parentId: null, active: true, components }], {});
        return this.gameObjectHandle(entity);
    }

    // -------------------------------------------------------------------
    // Destroy
    // -------------------------------------------------------------------

    destroy(target: VMValue, delay = 0, immediate = false) {
        if (target === null || target === undefined) return;
        if (target instanceof PrefabHandle) hostError("Prefab varlıkları yok edilemez; sahnedeki kopyayı yok edin.", "InvalidOperationException");
        if (delay > 0) {
            this.timedDestroys.push({ target, at: this.time + delay });
            return;
        }
        let item: DestroyItem | null = null;
        if (target instanceof GameObjectHandle) {
            if (!target.entity.destroyed && !target.entity.pendingDestroy) item = { kind: "entity", entity: target.entity };
        } else if (target instanceof TransformHandle) {
            hostError(`'${target.entity.name}' nesnesinin Transform bileşeni yok edilemez. Nesneyi yok etmek için Destroy(gameObject) kullanın.`, "InvalidOperationException");
        } else if (target instanceof ScriptObject) {
            const state = this.behaviours.find((candidate) => candidate.object === target);
            if (state && !state.destroyed) item = { kind: "behaviour", state };
        } else if (target instanceof ComponentHandle) {
            if (!target.entity.destroyed) item = { kind: "component", entity: target.entity, component: target.component };
        } else if (target instanceof EntityHandle) {
            item = { kind: "entity", entity: target.entity };
        }
        if (!item) return;
        if (item.kind === "entity") item.entity.pendingDestroy = true;
        if (immediate) this.performDestroy(item);
        else this.destroyQueue.push(item);
    }

    private processDestroyQueue() {
        if (this.timedDestroys.length) {
            const due = this.timedDestroys.filter((item) => item.at <= this.time);
            if (due.length) {
                this.timedDestroys = this.timedDestroys.filter((item) => item.at > this.time);
                for (const item of due) this.guard(null, "Destroy", () => this.destroy(item.target, 0));
            }
        }
        let guard = 0;
        while (this.destroyQueue.length && guard < 100_000) {
            const item = this.destroyQueue.shift() as DestroyItem;
            this.performDestroy(item);
            guard += 1;
        }
    }

    private performDestroy(item: DestroyItem) {
        switch (item.kind) {
            case "entity":
                this.destroyEntityNow(item.entity);
                break;
            case "behaviour":
                this.destroyBehaviourNow(item.state, true);
                break;
            case "component":
                this.removeComponentNow(item.entity, item.component);
                break;
        }
    }

    private destroyBehaviourNow(state: BehaviourState, removeComponent: boolean) {
        if (state.destroyed) return;
        if (state.enabledCalled) {
            state.enabledCalled = false;
            this.callMethod(state, "OnDisable");
        }
        if (state.awoken) this.callMethod(state, "OnDestroy");
        state.destroyed = true;
        for (const coroutine of state.coroutines) coroutine.done = true;
        state.coroutines.length = 0;
        state.invokes.length = 0;
        this.timers.cancelOwner(state);
        if (MOUSE_METHODS.some((name) => this.interpreter.hasMethod(state.object, name, false))) this.mouseListeners = Math.max(0, this.mouseListeners - 1);
        if (removeComponent) {
            const entity = state.entity;
            entity.components = entity.components.filter((component) => component !== state.component);
            const index = entity.behaviours.indexOf(state);
            if (index >= 0) entity.behaviours.splice(index, 1);
        }
        this.behaviours = this.behaviours.filter((candidate) => candidate !== state);
    }

    private destroyEntityNow(entity: RuntimeEntity) {
        if (entity.destroyed) return;
        const nodes = entity.subtree();
        for (const node of nodes) {
            for (const state of node.behaviours.slice()) this.destroyBehaviourNow(state, false);
        }
        for (const node of nodes) {
            node.destroyed = true;
            node.pendingDestroy = false;
            this.entities.delete(node.id);
            this.physicsEntities.delete(node);
            this.physics.forget(node.id);
            node.emitter = null;
            node.animator = null;
            if (this.hoverEntity === node) this.hoverEntity = null;
            if (this.pressedEntity === node) this.pressedEntity = null;
            for (const component of node.components) {
                if (component.type === "audioSource") this.stopSource(component, 0.05);
                if (component.type !== "uiButton") continue;
                this.buttonListeners.delete(component.id);
                if (this.uiHover === component.id) this.uiHover = null;
                if (this.uiPressed === component.id) this.uiPressed = null;
            }
        }
        for (const key of [...this.touching]) {
            const [a, b] = key.split("|");
            if (nodes.some((node) => node.id === a || node.id === b)) this.touching.delete(key);
        }
        if (entity.parent) {
            const siblings = entity.parent.children;
            const index = siblings.indexOf(entity);
            if (index >= 0) siblings.splice(index, 1);
        }
        this.structureVersion += 1;
    }

    private removeComponentNow(entity: RuntimeEntity, component: GameComponent) {
        if (entity.destroyed || !entity.components.includes(component)) return;
        if (component.type === "transform") return;
        if (component.type === "script") {
            const state = entity.behaviours.find((candidate) => candidate.component === component);
            if (state) this.destroyBehaviourNow(state, true);
            else entity.components = entity.components.filter((candidate) => candidate !== component);
            return;
        }
        entity.components = entity.components.filter((candidate) => candidate !== component);
        entity.handles.delete(component.id);
        if (component.type === "particleSystem") entity.emitter = null;
        if (component.type === "animation") entity.animator = null;
        if (component.type === "uiButton") this.buttonListeners.delete(component.id);
        entity.refreshComponentCache();
        this.registerPhysics(entity);
        if (component.type === "collider" || component.type === "rigidBody" || component.type === "tilemap") this.physics.forget(entity.id);
    }

    // -------------------------------------------------------------------
    // Components
    // -------------------------------------------------------------------

    gameObjectHandle(entity: RuntimeEntity): GameObjectHandle {
        let handle = entity.handles.get("#go") as GameObjectHandle | undefined;
        if (!handle) {
            handle = new GameObjectHandle(this, entity);
            entity.handles.set("#go", handle);
        }
        return handle;
    }

    transformHandle(entity: RuntimeEntity): TransformHandle {
        let handle = entity.handles.get("#transform") as TransformHandle | undefined;
        if (!handle) {
            handle = new TransformHandle(this, entity);
            entity.handles.set("#transform", handle);
        }
        return handle;
    }

    rayHandle(ray: { origin: Vector3; direction: Vector3 }) {
        return new RayHandle(ray);
    }

    componentHandle(entity: RuntimeEntity, component: GameComponent): VMValue {
        if (component.type === "transform") return this.transformHandle(entity);
        if (component.type === "script") {
            const state = entity.behaviours.find((candidate) => candidate.component === component && !candidate.destroyed);
            return state ? state.object : null;
        }
        let handle = entity.handles.get(component.id);
        if (!handle) {
            switch (component.type) {
                case "rigidBody": handle = new RigidbodyHandle(this, entity, component); break;
                case "collider": handle = new ColliderHandle(this, entity, component); break;
                case "spriteRenderer": handle = new SpriteRendererHandle(this, entity, component); break;
                case "meshRenderer": handle = new MeshRendererHandle(this, entity, component); break;
                case "camera": handle = new CameraHandle(this, entity, component); break;
                case "light": handle = new LightHandle(this, entity, component); break;
                case "particleSystem": handle = new ParticleSystemHandle(this, entity, component); break;
                case "audioSource": handle = new AudioSourceHandle(this, entity, component); break;
                case "uiText": handle = new TextHandle(this, entity, component); break;
                case "uiButton": handle = new ButtonHandle(this, entity, component); break;
                case "uiPanel": handle = new PanelHandle(this, entity, component); break;
                case "uiProgressBar": handle = new ProgressBarHandle(this, entity, component); break;
                case "tilemap": handle = new TilemapHandle(this, entity, component); break;
                case "animation": handle = new AnimationHandle(this, entity, component); break;
                case "animator": handle = new AnimatorHandle(this, entity, component); break;
                case "playerInput": handle = new PlayerInputHandle(this, entity, component); break;
                case "characterController2D": handle = new CharacterController2DHandle(this, entity, component); break;
                case "cameraFollow": handle = new CameraFollowHandle(this, entity, component); break;
                case "navAgent2D": handle = new NavAgent2DHandle(this, entity, component); break;
                case "joint": handle = new JointHandle(this, entity, component); break;
                case "uiSlider": handle = new SliderHandle(this, entity, component); break;
                case "uiToggle": handle = new ToggleHandle(this, entity, component); break;
                case "uiInputField": handle = new InputFieldHandle(this, entity, component); break;
            }
            if (handle) entity.handles.set(component.id, handle);
        }
        return handle ?? null;
    }

    private matches(entity: RuntimeEntity, component: GameComponent, typeName: string): boolean {
        switch (typeName) {
            case "Transform":
            case "RectTransform":
                return component.type === "transform";
            case "Component":
            case "Object":
                return true;
            case "Behaviour":
            case "MonoBehaviour":
                return component.type === "script";
            case "Renderer":
                return component.type === "spriteRenderer" || component.type === "meshRenderer" || component.type === "tilemap";
            case "Image":
                return component.type === "uiPanel" || component.type === "uiProgressBar";
            case "Graphic":
            case "MaskableGraphic":
                return component.type === "uiText" || component.type === "uiPanel" || component.type === "uiButton" || component.type === "uiProgressBar"
                    || component.type === "uiSlider" || component.type === "uiToggle" || component.type === "uiInputField";
            case "Selectable":
                return component.type === "uiButton" || component.type === "uiSlider" || component.type === "uiToggle" || component.type === "uiInputField";
            case "Slider":
            case "Scrollbar":
                return component.type === "uiSlider" || component.type === "uiProgressBar";
            case "Animator":
                // V5 rules: the Animator state machine; an object without one still answers with its
                // Animation component, like V4 did.
                if (this.rules >= 5 && !this.program.classes.has("Animator")) {
                    return component.type === "animator" || (component.type === "animation" && !entity.animatorComponent);
                }
                return component.type === "animation";
            default: {
                const alias = this.builtInAlias(typeName);
                if (alias) {
                    if (component.type !== alias.type) return false;
                    if (component.type === "joint" && alias.joint) return component.kind === alias.joint;
                    if (component.type === "collider" && alias.shape && alias.shape !== "box") return component.shape !== "box";
                    if (component.type === "collider" && alias.shape === "box" && !typeName.startsWith("Capsule") && typeName !== "MeshCollider") return component.shape === "box";
                    return true;
                }
                if (component.type !== "script") return false;
                const state = entity.behaviours.find((candidate) => candidate.component === component && !candidate.destroyed);
                return Boolean(state && (state.cls.isSubclassOf(typeName) || state.cls.name === typeName));
            }
        }
    }

    getComponents(entity: RuntimeEntity, typeName: string): VMValue[] {
        if (entity.destroyed) return [];
        const output: VMValue[] = [];
        for (const component of entity.components) {
            if (!this.matches(entity, component, typeName)) continue;
            const handle = this.componentHandle(entity, component);
            if (handle !== null && handle !== undefined) output.push(handle);
        }
        if (!output.length && TEXT_TYPE_NAMES.has(typeName)) {
            // Unity buttons keep their label in a child Text; here the label is part of the button.
            const button = entity.components.find((component): component is UIButtonComponent => component.type === "uiButton");
            if (button) {
                let label = entity.handles.get(`#label:${button.id}`);
                if (!label) {
                    label = new ButtonLabelHandle(this, entity, button);
                    entity.handles.set(`#label:${button.id}`, label);
                }
                output.push(label);
            }
        }
        return output;
    }

    getComponent(entity: RuntimeEntity, typeName: string): VMValue {
        if (typeName === "GameObject") return this.gameObjectHandle(entity);
        if (!this.isKnownComponentType(typeName)) this.warnOnce(`type:${typeName}`, `GetComponent<${typeName}>: '${typeName}' bilinen bir bileşen veya script sınıfı değil.`);
        return this.getComponents(entity, typeName)[0] ?? null;
    }

    /** A built-in component type, an engine base type or a script class (GetComponent<T> and the editor's Watch panel). */
    isKnownComponentType(typeName: string) {
        return typeName in COMPONENT_TYPE_ALIASES
            || ["Transform", "RectTransform", "Component", "Object", "Behaviour", "MonoBehaviour", "Renderer", "Graphic", "MaskableGraphic", "Selectable"].includes(typeName)
            || this.program.classes.has(typeName);
    }

    /** The collider-like handle of an entity: its Collider, else its Tilemap. */
    colliderHandleOf(entity: RuntimeEntity): VMValue {
        if (entity.collider) return this.componentHandle(entity, entity.collider);
        if (entity.tilemap) return this.componentHandle(entity, entity.tilemap);
        return null;
    }

    getComponentInChildren(entity: RuntimeEntity, typeName: string, includeInactive: boolean): VMValue {
        for (const node of entity.subtree()) {
            if (!includeInactive && !node.activeInHierarchy) continue;
            const found = this.getComponents(node, typeName)[0];
            if (found !== undefined) return found;
        }
        return null;
    }

    getComponentsInChildren(entity: RuntimeEntity, typeName: string, includeInactive: boolean): VMValue[] {
        const output: VMValue[] = [];
        for (const node of entity.subtree()) {
            if (!includeInactive && !node.activeInHierarchy) continue;
            output.push(...this.getComponents(node, typeName));
        }
        return output;
    }

    getComponentInParent(entity: RuntimeEntity, typeName: string): VMValue {
        for (let cursor: RuntimeEntity | null = entity; cursor; cursor = cursor.parent) {
            const found = this.getComponents(cursor, typeName)[0];
            if (found !== undefined) return found;
        }
        return null;
    }

    getComponentsInParent(entity: RuntimeEntity, typeName: string): VMValue[] {
        const output: VMValue[] = [];
        for (let cursor: RuntimeEntity | null = entity; cursor; cursor = cursor.parent) output.push(...this.getComponents(cursor, typeName));
        return output;
    }

    /** The built-in component a script type name means (a script class of the same name wins for V4 names). */
    private builtInAlias(typeName: string) {
        const alias = COMPONENT_TYPE_ALIASES[typeName];
        if (!alias || (alias.userFirst && this.program.classes.has(typeName))) return undefined;
        return alias;
    }

    addComponent(entity: RuntimeEntity, typeName: string): VMValue {
        if (entity.destroyed) hostError("Yok edilmiş bir nesneye bileşen eklenemez.", "MissingReferenceException");
        // V4 rules: AddComponent<Slider>() makes a draggable slider (V3 made a progress bar);
        // V5 rules: AddComponent<Animator>() adds the state machine.
        const alias = typeName === "Slider" && this.rules >= 4 ? { type: "uiSlider" as const }
            : typeName === "Animator" && this.rules >= 5 && !this.program.classes.has("Animator") ? { type: "animator" as const }
                : this.builtInAlias(typeName);
        if (alias) {
            const existing = UNIQUE_COMPONENT_TYPES.has(alias.type) ? entity.components.find((component) => component.type === alias.type) : undefined;
            if (existing) {
                this.log("warning", `'${entity.name}' nesnesinde zaten bir ${typeName} var; mevcut bileşen döndürüldü.`);
                return this.componentHandle(entity, existing);
            }
            const component = createComponentOfType(alias.type, this.project.dimension);
            if (component.type === "collider" && alias.shape) {
                component.shape = alias.shape;
                if (alias.shape !== "box") component.radius = 0.5;
            }
            if (component.type === "joint" && alias.joint) component.kind = alias.joint;
            entity.components = [...entity.components, component];
            entity.refreshComponentCache();
            if (component.type === "rigidBody") entity.body = { ...entity.body };
            if (component.type === "particleSystem") {
                entity.emitter = new ParticleEmitter(component);
                if (entity.activeInHierarchy && component.playOnStart) entity.emitter.play();
            }
            if (component.type === "animation") entity.animator = new AnimationPlayer(component);
            this.registerPhysics(entity);
            return this.componentHandle(entity, component);
        }
        const cls = this.program.classes.get(typeName);
        if (cls?.isBehaviour) {
            const component = createScriptComponent(cls.scriptId, cls.name);
            entity.components = [...entity.components, component];
            const state = this.createBehaviour(entity, component);
            this.resolveDeferredReferences();
            if (!state) return null;
            if (entity.activeInHierarchy) {
                if (!state.awoken) {
                    state.awoken = true;
                    this.callMethod(state, "Awake");
                }
                if (state.enabled && !state.enabledCalled && !state.destroyed) {
                    state.enabledCalled = true;
                    this.callMethod(state, "OnEnable");
                }
                if (!state.started && !this.pendingStarts.includes(state)) this.pendingStarts.push(state);
            }
            return state.object;
        }
        if (cls) hostError(`'${typeName}' bir MonoBehaviour olmadığı için bileşen olarak eklenemez.`, "ArgumentException");
        if (["Transform", "GameObject"].includes(typeName)) hostError(`${typeName} bileşeni eklenemez.`, "ArgumentException");
        return hostError(`'${typeName}' bileşeni bu motorda yok. Desteklenenler: ${Object.keys(COMPONENT_TYPE_ALIASES).slice(0, 12).join(", ")}…`, "ArgumentException");
    }

    componentChanged(entity: RuntimeEntity) {
        entity.refreshComponentCache();
        this.registerPhysics(entity);
        this.obstaclesChanged();
    }

    markRender(entity: RuntimeEntity) {
        entity.renderVersion += 1;
    }

    transformChanged(entity: RuntimeEntity) {
        void entity;
    }

    emitterOf(entity: RuntimeEntity, create = false): ParticleEmitter | null {
        const component = entity.components.find((candidate) => candidate.type === "particleSystem");
        if (!component || component.type !== "particleSystem") return null;
        if (!entity.emitter || entity.emitter.component !== component) {
            if (!create && !entity.emitter) return null;
            entity.emitter = new ParticleEmitter(component);
        }
        return entity.emitter;
    }

    private updateParticles(dt: number) {
        for (const entity of this.entities.values()) {
            const emitter = entity.emitter;
            if (!emitter || !entity.activeInHierarchy) continue;
            emitter.update(dt, entity.world, this.physics.gravity, this.is2D);
        }
    }

    private recordAudio(kind: "sfx" | "loop" | "music" | "stopMusic", name: string) {
        this.audioEvents.push({ kind, name });
        if (this.audioEvents.length > 100) this.audioEvents.shift();
    }

    /** ScriptHost: an AudioClip field holds an uploaded file's id or a built-in sound's name. */
    audioClipName(ref: string): string {
        return (this.project.audio ?? []).find((item) => item.id === ref)?.name ?? ref;
    }

    /** An uploaded audio file by name (exact, then ignoring case) or id. */
    audioAsset(ref: string | null | undefined): AudioAsset | null {
        if (!ref) return null;
        const list = this.project.audio ?? [];
        const lower = ref.toLocaleLowerCase();
        return list.find((item) => item.name === ref) ?? list.find((item) => item.id === ref) ?? list.find((item) => item.name.toLocaleLowerCase() === lower) ?? null;
    }

    /**
     * What a sound name plays: an uploaded file with exactly that name (so a
     * file can replace a built-in sound), a built-in sound, then a file whose
     * name matches ignoring case. V4 rules also accept "Explosion" for "explosion".
     */
    resolveSound(clip: string): { asset: AudioAsset | null; preset: string | null } {
        const list = this.project.audio ?? [];
        const presets = SOUND_PRESETS as readonly string[];
        const exact = list.find((item) => item.name === clip) ?? list.find((item) => item.id === clip);
        if (exact) return { asset: exact, preset: null };
        if (presets.includes(clip)) return { asset: null, preset: clip };
        const lower = clip.toLocaleLowerCase();
        const loose = list.find((item) => item.name.toLocaleLowerCase() === lower);
        if (loose) return { asset: loose, preset: null };
        if (this.rules >= 4 && presets.includes(lower)) return { asset: null, preset: lower };
        return { asset: null, preset: null };
    }

    /** Audio.Play / PlayOneShot: a built-in sound or an uploaded file (by name). */
    playSound(clip: string, volume = 1, pitch = 1) {
        const { asset, preset } = this.resolveSound(clip);
        if (!preset && !asset && this.rules >= 4) {
            const uploaded = (this.project.audio ?? []).map((item) => item.name);
            this.warnOnce(`audio:${clip}`, `Ses bulunamadı: "${clip}". Hazır sesler: ${SOUND_PRESETS.join(", ")}${uploaded.length ? `; yüklenenler: ${uploaded.slice(0, 8).join(", ")}` : ""}.`);
        }
        this.recordAudio("sfx", asset?.name ?? preset ?? clip);
        if (this.audioMuted) return;
        if (asset) this.audio?.playClip(asset.hash, volume, pitch);
        else this.audio?.play(preset ?? clip, volume, pitch);
    }

    /** Audio.PlayMusic: loops an uploaded file on the music channel (one track at a time). */
    playMusic(name: string, volume = 1, fade = 0.5) {
        const asset = this.audioAsset(name);
        if (!asset) {
            this.warnOnce(`music:${name}`, `Audio.PlayMusic("${name}"): bu adda yüklenmiş bir ses yok. Proje panelinden bir müzik dosyası yükleyin.`);
            return;
        }
        this.musicName = asset.name;
        this.recordAudio("music", asset.name);
        this.audio?.playMusic(asset.hash, volume, fade);
    }

    stopMusic(fade = 0.5) {
        this.musicName = null;
        this.recordAudio("stopMusic", "");
        this.audio?.stopMusic(fade);
    }

    get currentMusic(): string | null {
        return this.musicName;
    }

    /** AudioSource.Play: its uploaded file (looping when set), else its built-in sound. */
    playSource(component: AudioSourceComponent, clipOverride?: string) {
        const asset = clipOverride !== undefined ? this.resolveSound(clipOverride).asset : component.audioId ? (this.project.audio ?? []).find((item) => item.id === component.audioId) ?? null : null;
        if (!asset) {
            this.playSound(clipOverride ?? component.clip, component.volume, component.pitch);
            return;
        }
        const loop = clipOverride === undefined && component.loop;
        this.recordAudio(loop ? "loop" : "sfx", asset.name);
        if (clipOverride === undefined) this.stopSource(component, 0);
        if (this.audioMuted && !loop) return;
        const handle = this.audio?.playClip(asset.hash, component.volume, component.pitch, loop) ?? null;
        if (handle && clipOverride === undefined) this.sourceSounds.set(component.id, handle);
    }

    stopSource(component: AudioSourceComponent, fade = 0.05) {
        const handle = this.sourceSounds.get(component.id);
        if (!handle) return;
        handle.stop(fade);
        this.sourceSounds.delete(component.id);
    }

    sourcePlaying(component: AudioSourceComponent): boolean {
        return Boolean(this.sourceSounds.get(component.id)?.playing);
    }

    sendMessage(entity: RuntimeEntity, method: string, arg: VMValue, mode: string) {
        const targets = mode === "BroadcastMessage" ? entity.subtree() : mode === "SendMessageUpwards" ? (() => {
            const chain: RuntimeEntity[] = [];
            for (let cursor: RuntimeEntity | null = entity; cursor; cursor = cursor.parent) chain.push(cursor);
            return chain;
        })() : [entity];
        let received = false;
        for (const target of targets) {
            if (!target.activeInHierarchy) continue;
            for (const state of target.behaviours.slice()) {
                if (state.destroyed || !this.hasMethod(state, method)) continue;
                received = true;
                const args = arg === undefined ? [] : [arg];
                const result = this.interpreter.invoke(state.object, method, args);
                if (result instanceof VMCoroutine && !result.started) this.startCoroutine(state, result, []);
            }
        }
        if (!received) this.warnOnce(`msg:${method}`, `${mode}('${method}'): bu isimde metodu olan bir script bulunamadı.`);
    }

    // -------------------------------------------------------------------
    // Queries
    // -------------------------------------------------------------------

    rootEntities(): RuntimeEntity[] {
        return [...this.entities.values()].filter((entity) => !entity.parent);
    }

    findByName(name: string): RuntimeEntity | null {
        if (name.includes("/")) {
            const parts = name.split("/").filter(Boolean);
            const absolute = name.startsWith("/");
            const candidates = absolute ? this.rootEntities() : [...this.entities.values()];
            for (const start of candidates) {
                if (start.name !== parts[0] || !start.activeInHierarchy) continue;
                let cursor: RuntimeEntity | undefined = start;
                for (const part of parts.slice(1)) {
                    cursor = cursor?.children.find((child) => child.name === part && child.activeInHierarchy);
                    if (!cursor) break;
                }
                if (cursor) return cursor;
            }
            return null;
        }
        for (const entity of this.entities.values()) if (entity.name === name && entity.activeInHierarchy) return entity;
        return null;
    }

    findWithTag(tag: string): RuntimeEntity[] {
        const output: RuntimeEntity[] = [];
        for (const entity of this.entities.values()) if (entity.tag === tag && entity.activeInHierarchy) output.push(entity);
        return output;
    }

    findObjectsOfType(typeName: string, firstOnly: boolean): VMValue[] {
        const output: VMValue[] = [];
        for (const entity of this.entities.values()) {
            if (!entity.activeInHierarchy) continue;
            if (typeName === "GameObject") {
                output.push(this.gameObjectHandle(entity));
            } else {
                for (const component of this.getComponents(entity, typeName)) {
                    if (component instanceof ScriptObject) {
                        const state = entity.behaviours.find((candidate) => candidate.object === component);
                        if (state && !state.enabled) continue;
                    }
                    output.push(component);
                }
            }
            if (firstOnly && output.length) return output;
        }
        return output;
    }

    objectList(items: VMValue[]) {
        return new VMList(items, "Array");
    }

    primaryCamera(): { entity: RuntimeEntity; component: CameraComponent } | null {
        let fallback: { entity: RuntimeEntity; component: CameraComponent } | null = null;
        let tagged: { entity: RuntimeEntity; component: CameraComponent } | null = null;
        for (const entity of this.entities.values()) {
            if (!entity.activeInHierarchy) continue;
            const component = entity.components.find((candidate): candidate is CameraComponent => candidate.type === "camera" && candidate.enabled);
            if (!component) continue;
            if (component.primary) return { entity, component };
            if (!tagged && entity.tag === "MainCamera") tagged = { entity, component };
            if (!fallback) fallback = { entity, component };
        }
        return tagged ?? fallback;
    }

    screenSize() {
        const size = this.options.getScreenSize?.();
        return size && size.width > 0 && size.height > 0 ? size : { width: 960, height: 540 };
    }

    cameraView(entity: RuntimeEntity, component: CameraComponent): CameraView {
        const size = this.screenSize();
        return { trs: entity.world, camera: component, width: size.width, height: size.height };
    }

    raycastHit(result: RaycastResult): RaycastHitHandle {
        const entity = this.entities.get(result.entityId) ?? null;
        return new RaycastHitHandle(this, entity, result.point, result.normal, result.distance);
    }

    // -------------------------------------------------------------------
    // Collision & mouse callbacks
    // -------------------------------------------------------------------

    private wants(entity: RuntimeEntity, base: string): Array<{ state: BehaviourState; method: string }> {
        const output: Array<{ state: BehaviourState; method: string }> = [];
        for (const state of entity.behaviours) {
            if (state.destroyed || state.failed || !state.awoken) continue;
            const candidates = this.is2D ? [`${base}2D`, base] : [base, `${base}2D`];
            const method = candidates.find((name) => this.interpreter.hasMethod(state.object, name, false));
            if (method) output.push({ state, method });
        }
        return output;
    }

    private dispatchContact(info: ContactInfo, phase: "Enter" | "Stay" | "Exit") {
        const a = this.entities.get(info.a);
        const b = this.entities.get(info.b);
        if (!a || !b) return;
        const base = info.trigger ? `OnTrigger${phase}` : `OnCollision${phase}`;
        const deliver = (self: RuntimeEntity, other: RuntimeEntity, flip: boolean, relative: Vector3) => {
            if (self.destroyed || other.destroyed || !self.activeInHierarchy) return;
            const receivers = this.wants(self, base);
            if (!receivers.length) return;
            let payload: VMValue;
            if (info.trigger) {
                payload = this.colliderHandleOf(other) ?? this.gameObjectHandle(other);
            } else {
                // Normals point towards the receiver; the most upward-facing contact comes first so
                // "GetContact(0).normal.y > 0.5f" ground checks work on tilemaps too.
                const contacts = (info.contacts.length ? info.contacts : [{ point: info.point, normal: info.normal, penetration: info.penetration }])
                    .map((contact) => ({ ...contact, normal: flip ? { x: -contact.normal.x, y: -contact.normal.y, z: -contact.normal.z } : contact.normal }))
                    .sort((left, right) => right.normal.y - left.normal.y);
                const first = contacts[0];
                payload = new CollisionHandle(this, self, other, first.point, first.normal, first.penetration, relative).withContacts(contacts);
            }
            for (const { state, method } of receivers) {
                if (state.destroyed || self.destroyed) break;
                this.callMethod(state, method, [payload]);
            }
        };
        const relativeForA = { x: -info.relativeVelocity.x, y: -info.relativeVelocity.y, z: -info.relativeVelocity.z };
        deliver(a, b, true, relativeForA);
        deliver(b, a, false, info.relativeVelocity);
    }

    private pickAtMouse(): RuntimeEntity | null {
        const camera = this.primaryCamera();
        if (!camera) return null;
        const view = this.cameraView(camera.entity, camera.component);
        const mouse = { x: this.input.mouseX, y: this.input.mouseY };
        if (this.is2D) {
            const point = screenToWorld(view, { x: mouse.x, y: mouse.y, z: 0 });
            const ids = this.physics.overlapSphere(point, 0.0005, true);
            let best: RuntimeEntity | null = null;
            let bestOrder = -Infinity;
            for (const id of ids) {
                const entity = this.entities.get(id);
                if (!entity) continue;
                const sprite = entity.components.find((component) => component.type === "spriteRenderer");
                const order = sprite && sprite.type === "spriteRenderer" ? sprite.sortingLayer : 0;
                if (order >= bestOrder) {
                    best = entity;
                    bestOrder = order;
                }
            }
            return best;
        }
        const ray = screenRay(view, mouse);
        const hit = this.physics.raycast(ray.origin, ray.direction, camera.component.farClip, true);
        return hit ? this.entities.get(hit.entityId) ?? null : null;
    }

    private sendMouse(entity: RuntimeEntity | null, method: string) {
        if (!entity || entity.destroyed || !entity.activeInHierarchy) return;
        for (const state of entity.behaviours.slice()) {
            if (!state.live || !this.interpreter.hasMethod(state.object, method, false)) continue;
            this.callMethod(state, method);
        }
    }

    private processMouseEvents() {
        if (this.mouseListeners <= 0) return;
        const hit = this.pointerOverUI ? null : this.pickAtMouse();
        if (hit !== this.hoverEntity) {
            this.sendMouse(this.hoverEntity, "OnMouseExit");
            this.hoverEntity = hit;
            this.sendMouse(hit, "OnMouseEnter");
        }
        if (hit) this.sendMouse(hit, "OnMouseOver");
        if (this.input.getMouseButtonDown(0) && hit) {
            this.pressedEntity = hit;
            this.sendMouse(hit, "OnMouseDown");
        }
        if (this.pressedEntity && this.input.getMouseButton(0)) this.sendMouse(this.pressedEntity, "OnMouseDrag");
        if (this.input.getMouseButtonUp(0) && this.pressedEntity) {
            const pressed = this.pressedEntity;
            this.pressedEntity = null;
            this.sendMouse(pressed, "OnMouseUp");
            if (pressed === hit) this.sendMouse(pressed, "OnMouseUpAsButton");
        }
    }

    // -------------------------------------------------------------------
    // Invoke & coroutines
    // -------------------------------------------------------------------

    invokeLater(state: BehaviourState, method: string, delay: number, repeat: number) {
        if (!method) hostError("Invoke: metot adı boş.", "ArgumentException");
        if (!this.hasMethod(state, method)) {
            this.log("warning", `Invoke: '${state.cls.name}' sınıfında '${method}' metodu bulunamadı.`, { scriptName: state.cls.scriptName, line: 0 });
            return;
        }
        state.invokes.push({ method, at: this.time + Math.max(0, delay), repeat });
    }

    private runInvokes() {
        for (const state of this.behaviours.slice()) {
            if (!state.invokes.length || state.destroyed || !state.entity.activeInHierarchy) continue;
            const due = state.invokes.filter((item) => item.at <= this.time);
            for (const item of due) {
                if (item.repeat > 0) {
                    item.at += item.repeat;
                    if (item.at <= this.time) item.at = this.time + item.repeat;
                } else {
                    const index = state.invokes.indexOf(item);
                    if (index >= 0) state.invokes.splice(index, 1);
                }
                this.callMethod(state, item.method);
                if (state.destroyed) break;
            }
        }
    }

    startCoroutine(owner: BehaviourState, routine: VMValue, extraArgs: VMValue[]): VMValue {
        let coroutine: VMCoroutine | null = null;
        if (routine instanceof VMCoroutine) {
            coroutine = routine;
        } else if (typeof routine === "string") {
            const result = this.interpreter.invoke(owner.object, routine, extraArgs.slice(0, 1));
            if (result === NOT_FOUND) hostError(`StartCoroutine: '${routine}' metodu bulunamadı.`, "ArgumentException");
            if (!(result instanceof VMCoroutine)) hostError(`StartCoroutine: '${routine}' bir IEnumerator döndürmüyor.`, "ArgumentException");
            coroutine = result;
        } else {
            hostError("StartCoroutine bir IEnumerator (ör. StartCoroutine(Bekle())) veya metot adı bekliyor.", "ArgumentException");
        }
        if (coroutine.started) {
            this.log("warning", `'${coroutine.methodName}' coroutine'i zaten başlatılmış.`);
            return coroutine;
        }
        if (owner.destroyed || !owner.entity.activeInHierarchy) {
            this.log("warning", `Coroutine '${coroutine.methodName}' başlatılamadı: '${owner.entity.name}' nesnesi aktif değil.`);
            return coroutine;
        }
        coroutine.started = true;
        const state: CoroutineState = { owner, stack: [coroutine], root: coroutine, wait: { kind: "frame" }, done: false };
        owner.coroutines.push(state);
        this.advanceCoroutine(state);
        return coroutine;
    }

    stopCoroutine(owner: BehaviourState, target: VMValue) {
        for (const state of owner.coroutines) {
            if (state.root === target || (typeof target === "string" && state.root.methodName === target)) {
                state.done = true;
                for (const item of state.stack) item.done = true;
            }
        }
        for (let index = owner.coroutines.length - 1; index >= 0; index -= 1) if (owner.coroutines[index].done) owner.coroutines.splice(index, 1);
    }

    private finishCoroutine(state: CoroutineState) {
        state.done = true;
        state.root.done = true;
        for (const item of state.stack) item.done = true;
    }

    private waitFor(value: VMValue): WaitState | VMCoroutine {
        if (value instanceof YieldInstruction) {
            switch (value.kind) {
                case "seconds": return { kind: "seconds", until: this.time + Number(value.value ?? 0) };
                case "realtime": return { kind: "realtime", until: this.realtime + Number(value.value ?? 0) };
                case "until": return { kind: "until", fn: value.value };
                case "while": return { kind: "while", fn: value.value };
                case "fixed": return { kind: "fixed" };
                case "endOfFrame": return { kind: "endOfFrame" };
                default: return { kind: "frame" };
            }
        }
        if (value instanceof VMCoroutine) return value.started ? { kind: "coroutine", target: value } : value;
        return { kind: "frame" };
    }

    private advanceCoroutine(state: CoroutineState) {
        let guard = 0;
        while (!state.done && guard < 1000) {
            guard += 1;
            const top = state.stack[state.stack.length - 1];
            if (!top || top.done) {
                state.stack.pop();
                if (!state.stack.length) {
                    this.finishCoroutine(state);
                    return;
                }
                continue;
            }
            let result: IteratorResult<VMValue, void>;
            const previous = this.currentBehaviour;
            this.currentBehaviour = state.owner;
            try {
                result = top.generator.next();
            } catch (error) {
                this.reportScriptError(error, state.owner, `Coroutine ${top.methodName}`);
                this.finishCoroutine(state);
                return;
            } finally {
                this.currentBehaviour = previous;
            }
            if (result.done) {
                top.done = true;
                continue;
            }
            const wait = this.waitFor(result.value);
            if (wait instanceof VMCoroutine) {
                wait.started = true;
                state.stack.push(wait);
                continue;
            }
            state.wait = wait;
            (state as CoroutineState & { yieldFrame: number; yieldFixed: number; yieldPhase: string }).yieldFrame = this.frameCount;
            (state as CoroutineState & { yieldFixed: number }).yieldFixed = this.fixedStepCount;
            (state as CoroutineState & { yieldPhase: string }).yieldPhase = this.phase;
            return;
        }
        if (guard >= 1000) {
            this.log("error", "Coroutine iç içe çok derin veya sonsuz döngüde; durduruldu.");
            this.finishCoroutine(state);
        }
    }

    private coroutineReady(state: CoroutineState, phase: "frame" | "fixed" | "endOfFrame"): boolean {
        const meta = state as CoroutineState & { yieldFrame?: number; yieldFixed?: number; yieldPhase?: string };
        const wait = state.wait;
        if (phase === "fixed") return wait.kind === "fixed" && this.fixedStepCount > (meta.yieldFixed ?? -1);
        if (phase === "endOfFrame") return wait.kind === "endOfFrame" && (meta.yieldPhase !== "endOfFrame" || this.frameCount > (meta.yieldFrame ?? -1));
        if (this.frameCount <= (meta.yieldFrame ?? -1)) return false;
        switch (wait.kind) {
            case "frame": return true;
            case "seconds": return this.time >= wait.until;
            case "realtime": return this.realtime >= wait.until;
            case "coroutine": return wait.target.done;
            case "until":
            case "while": {
                const value = this.guard(state.owner, "WaitUntil", () => this.interpreter.invokeCallable(wait.fn, []));
                const truthy = vmTruthy(value ?? false);
                return wait.kind === "until" ? truthy : !truthy;
            }
            default: return false;
        }
    }

    private runCoroutines(phase: "frame" | "fixed" | "endOfFrame") {
        for (const owner of this.behaviours.slice()) {
            if (!owner.coroutines.length || owner.destroyed || !owner.entity.activeInHierarchy) continue;
            for (const state of owner.coroutines.slice()) {
                if (state.done || owner.destroyed) continue;
                if (!this.coroutineReady(state, phase)) continue;
                this.interpreter.resetBudget();
                this.advanceCoroutine(state);
            }
            for (let index = owner.coroutines.length - 1; index >= 0; index -= 1) if (owner.coroutines[index].done) owner.coroutines.splice(index, 1);
        }
    }

    // -------------------------------------------------------------------
    // Animation component
    // -------------------------------------------------------------------

    // -------------------------------------------------------------------
    // Character Controller 2D and Camera Follow (V4)
    // -------------------------------------------------------------------

    /** Runtime state of an entity's Character Controller 2D (made on first use). */
    motorOf(entity: RuntimeEntity): CharacterMotor | null {
        const component = entity.characterController;
        if (!component) return null;
        if (!entity.motor || entity.motor.component !== component) entity.motor = new CharacterMotor(component);
        return entity.motor;
    }

    followerOf(entity: RuntimeEntity): CameraFollower | null {
        const component = entity.cameraFollow;
        if (!component) return null;
        if (!entity.follower || entity.follower.component !== component) entity.follower = new CameraFollower(component);
        return entity.follower;
    }

    private sampleMotors(frameDelta: number) {
        const input = this.input;
        const shared = {
            axis: (name: string) => input.getAxisRaw(name),
            down: (name: string) => input.getButtonDown(name),
            held: (name: string) => input.getButton(name),
        };
        for (const entity of this.entities.values()) {
            if (!entity.characterController?.enabled || !entity.activeInHierarchy) continue;
            // A Player Input on the object (V5) gives its controller only that player's devices.
            const view = this.playerInputView(entity);
            const source = view ? { axis: (name: string) => view.getAxisRaw(name), down: (name: string) => view.getButtonDown(name), held: (name: string) => view.getButton(name) } : shared;
            this.motorOf(entity)?.sample(source, this.frameCount, frameDelta);
        }
    }

    // -------------------------------------------------------------------
    // Local multiplayer (V5)
    // -------------------------------------------------------------------

    /** The devices a Player Input reads. */
    inputSpecOf(component: PlayerInputComponent): InputSourceSpec {
        return inputSourceOf(component);
    }

    /** The input of the player an object belongs to; null without an enabled Player Input. */
    playerInputView(entity: RuntimeEntity): PlayerInputView | null {
        const component = entity.playerInput;
        if (!component?.enabled) return null;
        return this.input.view(this.inputSpecOf(component));
    }

    /** Live objects with an enabled Player Input, by player number. */
    players(): RuntimeEntity[] {
        return [...this.entities.values()]
            .filter((entity) => !entity.destroyed && entity.playerInput?.enabled)
            .sort((a, b) => (a.playerInput?.player ?? 0) - (b.playerInput?.player ?? 0));
    }

    private updateMotors(dt: number) {
        for (const entity of this.entities.values()) {
            const component = entity.characterController;
            if (!component?.enabled || !entity.activeInHierarchy) continue;
            const rb = entity.rigidBody;
            if (!rb || !rb.enabled || rb.bodyType !== "dynamic") {
                this.warnOnce(`cc2d:${entity.id}`, `${entity.name}: Character Controller 2D çalışmak için aynı nesnede Dynamic bir Rigidbody 2D ve bir Collider 2D ister.`);
                continue;
            }
            const motor = this.motorOf(entity);
            if (!motor) continue;
            motor.fixedUpdate(dt, entity.body, this.physics.gravity, rb.gravityScale, rb.useGravity);
            if (component.flipSprite) {
                const sprite = entity.components.find((item) => item.type === "spriteRenderer");
                if (sprite && sprite.type === "spriteRenderer" && sprite.flipX !== (motor.facing < 0)) {
                    sprite.flipX = motor.facing < 0;
                    this.markRender(entity);
                }
            }
            if (motor.events.length) {
                const events = motor.events.splice(0);
                for (const event of events) {
                    const method = event.kind === "jump" ? "OnJump" : "OnLand";
                    for (const state of entity.behaviours.slice()) {
                        if (state.live && state.awoken && this.hasMethod(state, method)) this.callMethod(state, method, event.kind === "land" ? [event.speed] : []);
                    }
                    if (entity.destroyed) break;
                }
            }
        }
    }

    /** The object a Camera Follow tracks: its target, else the first object tagged "Player". */
    private followTarget(component: { targetId: string | null }): RuntimeEntity | null {
        if (component.targetId) {
            const target = this.entities.get(component.targetId);
            return target && !target.destroyed ? target : null;
        }
        return this.findWithTag("Player")[0] ?? null;
    }

    private updateFollowers(deltaTime: number) {
        for (const entity of this.entities.values()) {
            const component = entity.cameraFollow;
            if (!component?.enabled || !entity.activeInHierarchy) continue;
            const target = this.followTarget(component);
            const follower = this.followerOf(entity);
            if (!target || !target.activeInHierarchy || !follower) continue;
            const camera = entity.components.find((item): item is CameraComponent => item.type === "camera");
            const size = this.screenSize();
            const halfExtents = camera && camera.projection === "orthographic"
                ? { x: camera.orthographicSize * (size.width / Math.max(1, size.height)), y: camera.orthographicSize }
                : null;
            const result = follower.update(deltaTime, entity.world.position, target.world.position, this.is2D, { halfExtents });
            entity.setWorldPosition(result.position);
            if (result.rotation) entity.setWorldRotation(result.rotation);
        }
    }

    // -------------------------------------------------------------------
    // Path finding and Nav Agent 2D (V4)
    // -------------------------------------------------------------------

    navAgentOf(entity: RuntimeEntity): NavAgentState | null {
        const component = entity.navAgent;
        if (!component) return null;
        if (!entity.nav || entity.nav.component !== component) entity.nav = new NavAgentState(component);
        return entity.nav;
    }

    /** Static colliders and solid tiles, as path finding obstacles, plus a key that changes when they do. */
    private navObstacles() {
        const obstacles: NavObstacle[] = [];
        const parts: string[] = [];
        let bounds: NavBounds | null = null;
        let anchor: NavPoint | null = null;
        let tileCell: number | null = null;
        const grow = (x: number, y: number, extent: number) => {
            bounds = bounds
                ? { minX: Math.min(bounds.minX, x - extent), minY: Math.min(bounds.minY, y - extent), maxX: Math.max(bounds.maxX, x + extent), maxY: Math.max(bounds.maxY, y + extent) }
                : { minX: x - extent, minY: y - extent, maxX: x + extent, maxY: y + extent };
        };
        for (const entity of this.entities.values()) {
            if (entity.destroyed || !entity.activeInHierarchy) continue;
            // Moving things (players, enemies, agents) are not walls.
            if (entity.characterController || entity.navAgent) continue;
            const rb = entity.rigidBody;
            if (rb && rb.enabled && rb.bodyType !== "static") continue;
            const collider = entity.collider;
            const tilemap = entity.tilemap;
            const solidCollider = Boolean(collider?.enabled && !collider.isTrigger);
            const solidTilemap = Boolean(tilemap?.enabled && !tilemap.isTrigger);
            if (!solidCollider && !solidTilemap) continue;
            const trs = entity.world;
            const angle = 2 * Math.atan2(trs.rotation.z, trs.rotation.w);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const sx = Math.abs(trs.scale.x);
            const sy = Math.abs(trs.scale.y);
            if (solidCollider && collider) {
                const ox = collider.offset.x * trs.scale.x;
                const oy = collider.offset.y * trs.scale.y;
                const x = trs.position.x + ox * cos - oy * sin;
                const y = trs.position.y + ox * sin + oy * cos;
                if (collider.shape === "box") {
                    const halfX = (collider.size.x * sx) / 2;
                    const halfY = (collider.size.y * sy) / 2;
                    obstacles.push({ kind: "box", x, y, halfX, halfY, angle, radius: 0 });
                    grow(x, y, Math.hypot(halfX, halfY));
                } else {
                    const radius = collider.radius * Math.max(sx, sy);
                    obstacles.push({ kind: "circle", x, y, halfX: 0, halfY: 0, angle: 0, radius });
                    grow(x, y, radius);
                }
                parts.push(`${entity.id}:${x.toFixed(3)},${y.toFixed(3)},${angle.toFixed(4)},${sx.toFixed(3)},${sy.toFixed(3)},${collider.shape},${collider.size.x},${collider.size.y},${collider.radius}`);
            }
            if (solidTilemap && tilemap) {
                const cell = tilemap.cellSize;
                const solid = new Set(tilemap.palette.filter((tile) => tile.solid).map((tile) => tile.key));
                const { height } = tilemapSize(tilemap);
                anchor ??= { x: trs.position.x, y: trs.position.y };
                tileCell ??= cell * sx;
                for (let row = 0; row < height; row += 1) {
                    const text = tilemap.rows[row];
                    for (let column = 0; column < text.length; column += 1) {
                        if (!solid.has(text[column])) continue;
                        const lx = (tilemap.origin.x + column + 0.5) * cell * trs.scale.x;
                        const ly = (tilemap.origin.y + height - 1 - row + 0.5) * cell * trs.scale.y;
                        const x = trs.position.x + lx * cos - ly * sin;
                        const y = trs.position.y + lx * sin + ly * cos;
                        obstacles.push({ kind: "box", x, y, halfX: (cell * sx) / 2, halfY: (cell * sy) / 2, angle, radius: 0 });
                        grow(x, y, cell * Math.max(sx, sy));
                    }
                }
                parts.push(`${entity.id}:t${entity.tilemapRevision}:${trs.position.x.toFixed(3)},${trs.position.y.toFixed(3)},${angle.toFixed(4)},${sx},${sy},${cell}`);
            }
        }
        return { obstacles, key: parts.join("|"), bounds: bounds as NavBounds | null, anchor: anchor as NavPoint | null, tileCell: tileCell as number | null };
    }

    /** The path finding grid for an agent radius (null when the scene has no obstacles). Rebuilt when obstacles change. */
    navGrid(radius: number): NavGrid | null {
        const cached = this.navGrids.get(radius);
        if (cached && cached.frame === this.frameCount && cached.structure === this.structureVersion + this.obstacleRevision * 1e6) return cached.grid;
        const scan = this.navObstacles();
        const cellSize = this.navCellSize ?? scan.tileCell ?? 0.5;
        const key = `${cellSize}|${scan.key}`;
        const structure = this.structureVersion + this.obstacleRevision * 1e6;
        if (cached && cached.key === key) {
            cached.frame = this.frameCount;
            cached.structure = structure;
            return cached.grid;
        }
        let grid: NavGrid | null = null;
        if (scan.bounds) {
            const margin = Math.max(cellSize * 4, 2 + radius);
            const bounds = { minX: scan.bounds.minX - margin, minY: scan.bounds.minY - margin, maxX: scan.bounds.maxX + margin, maxY: scan.bounds.maxY + margin };
            grid = new NavGrid(scan.obstacles, { cellSize, radius, bounds, anchor: scan.anchor ?? undefined });
        }
        if (this.navGrids.size >= 8) this.navGrids.clear();
        this.navGrids.set(radius, { frame: this.frameCount, structure, key, grid });
        return grid;
    }

    /** Tiles or colliders changed (path finding rescans the obstacles). */
    obstaclesChanged() {
        this.obstacleRevision += 1;
    }

    /** Forgets cached grids (Pathfinding.Rebuild, cell size changes). */
    resetNavigation() {
        this.navGrids.clear();
    }

    /** A path around the scene's static obstacles; `partial` falls back to the closest reachable point. */
    findPath(from: NavPoint, to: NavPoint, radius: number, partial: boolean): { points: NavPoint[]; status: NavPathStatus } {
        if (!this.is2D) {
            this.warnOnce("nav-3d", "Pathfinding ve Nav Agent 2D yalnızca 2D projelerde engellerin etrafından dolaşır; 3D'de düz bir yol döner.");
            return { points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], status: "complete" };
        }
        const grid = this.navGrid(Math.max(0, radius));
        if (!grid) return { points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], status: "complete" };
        const result = grid.findPath(from, to, partial);
        if (!result || result.points.length < 2) return { points: [], status: "invalid" };
        return { points: result.points, status: result.complete ? "complete" : "partial" };
    }

    /** Whether a point is free for an agent of `radius`. */
    isWalkable(point: NavPoint, radius: number): boolean {
        const grid = this.is2D ? this.navGrid(Math.max(0, radius)) : null;
        return grid ? grid.isWalkable(point) : true;
    }

    private updateNavAgents(deltaTime: number) {
        if (deltaTime <= 0) return;
        // A few new paths per frame at most; other agents get theirs next frame.
        let budget = 8;
        for (const entity of this.entities.values()) {
            const component = entity.navAgent;
            if (!component?.enabled || !entity.activeInHierarchy) continue;
            const agent = this.navAgentOf(entity);
            if (!agent) continue;
            const position = entity.world.position;
            if (component.targetId) {
                const target = this.entities.get(component.targetId);
                if (target && !target.destroyed && target.activeInHierarchy) {
                    const goal = target.world.position;
                    if (!agent.destination || Math.hypot(goal.x - agent.destination.x, goal.y - agent.destination.y) > 1e-4) {
                        const far = !agent.destination || Math.hypot(goal.x - agent.destination.x, goal.y - agent.destination.y) > component.stoppingDistance + 0.25;
                        agent.destination = { x: goal.x, y: goal.y };
                        if (far) agent.arrived = false;
                    }
                }
            }
            const halt = () => {
                agent.velocity = { x: 0, y: 0 };
                const rb = entity.rigidBody;
                if (rb?.enabled && rb.bodyType !== "static") {
                    entity.body.velocity.x = 0;
                    entity.body.velocity.y = 0;
                }
            };
            if (!agent.destination || agent.stopped) {
                halt();
                continue;
            }
            agent.repathTimer -= deltaTime;
            const moved = agent.pathGoal ? Math.hypot(agent.destination.x - agent.pathGoal.x, agent.destination.y - agent.pathGoal.y) : Infinity;
            const stale = !agent.pathGoal || (agent.repathTimer <= 0 && (moved > 0.2 || agent.status !== "complete"));
            if (stale && budget > 0) {
                budget -= 1;
                const result = this.findPath(position, agent.destination, component.radius, true);
                agent.path = result.points;
                agent.corner = 1;
                agent.status = result.status;
                agent.pathGoal = { ...agent.destination };
                agent.repathTimer = component.repathInterval;
            }
            if (agent.path.length < 2) {
                halt();
                continue;
            }
            if (component.showPath) {
                let previous: Vector3 = { x: position.x, y: position.y, z: 0 };
                for (let index = agent.corner; index < agent.path.length; index += 1) {
                    const next = { x: agent.path[index].x, y: agent.path[index].y, z: 0 };
                    this.drawLine(previous, next, agent.status === "complete" ? "#22d3ee" : "#f59e0b", 0);
                    previous = next;
                }
            }
            if (agent.remainingDistance(position) <= component.stoppingDistance + 1e-6) {
                halt();
                if (!agent.arrived && agent.status === "complete") {
                    agent.arrived = true;
                    for (const state of entity.behaviours.slice()) {
                        if (state.live && state.awoken && this.hasMethod(state, "OnDestinationReached")) this.callMethod(state, "OnDestinationReached");
                    }
                }
                continue;
            }
            let step = component.speed * deltaTime;
            let x = position.x;
            let y = position.y;
            while (step > 1e-9 && agent.corner < agent.path.length) {
                const corner = agent.path[agent.corner];
                const dx = corner.x - x;
                const dy = corner.y - y;
                const distance = Math.hypot(dx, dy);
                const last = agent.corner === agent.path.length - 1;
                const usable = last ? Math.max(0, distance - component.stoppingDistance) : distance;
                if (usable <= step) {
                    if (distance > 1e-9) {
                        x += (dx / distance) * usable;
                        y += (dy / distance) * usable;
                    }
                    step -= usable;
                    if (last) break;
                    agent.corner += 1;
                } else {
                    x += (dx / distance) * step;
                    y += (dy / distance) * step;
                    step = 0;
                }
            }
            agent.velocity = { x: (x - position.x) / deltaTime, y: (y - position.y) / deltaTime };
            const rb = entity.rigidBody;
            if (rb?.enabled && rb.bodyType !== "static") {
                // Bodies move with the physics step so they still collide.
                entity.body.velocity.x = agent.velocity.x;
                entity.body.velocity.y = agent.velocity.y;
            } else {
                entity.setWorldPosition({ x, y, z: position.z });
            }
            if (component.flipSprite && Math.abs(agent.velocity.x) > 0.01) {
                const sprite = entity.components.find((item) => item.type === "spriteRenderer");
                if (sprite && sprite.type === "spriteRenderer" && sprite.flipX !== agent.velocity.x < 0) {
                    sprite.flipX = agent.velocity.x < 0;
                    this.markRender(entity);
                }
            }
        }
    }

    // -------------------------------------------------------------------
    // Joints (V4)
    // -------------------------------------------------------------------

    /** Rest lengths measured at the start for joints with autoDistance. */
    private readonly jointLengths = new WeakMap<JointComponent, number>();

    /** Both ends of a joint, or null when its connected object is gone. */
    private jointEnds(entity: RuntimeEntity, joint: JointComponent): { a: JointEnd; b: JointEnd; other: RuntimeEntity | null } | null {
        const endOf = (target: RuntimeEntity, local: Vector3): JointEnd => {
            const rb = target.rigidBody;
            const moving = Boolean(rb?.enabled && rb.bodyType !== "static");
            return {
                point: localToWorldPoint(target.world, local),
                velocity: moving ? target.body.velocity : { x: 0, y: 0, z: 0 },
                invMass: rb?.enabled && rb.bodyType === "dynamic" ? 1 / Math.max(0.001, rb.mass) : 0,
            };
        };
        const a = endOf(entity, joint.anchor);
        if (!joint.connectedId) return { a, b: { point: { ...joint.connectedAnchor }, velocity: { x: 0, y: 0, z: 0 }, invMass: 0 }, other: null };
        const other = this.entities.get(joint.connectedId);
        if (!other || other.destroyed || !other.activeInHierarchy) return null;
        return { a, b: endOf(other, joint.connectedAnchor), other };
    }

    /** Measures an auto-distance joint again (its connection changed). */
    resetJointLength(joint: JointComponent) {
        this.jointLengths.delete(joint);
    }

    jointRestLength(entity: RuntimeEntity, joint: JointComponent): number {
        if (!joint.autoDistance) return joint.distance;
        let length = this.jointLengths.get(joint);
        if (length === undefined) {
            const ends = this.jointEnds(entity, joint);
            length = ends ? Math.hypot(ends.b.point.x - ends.a.point.x, ends.b.point.y - ends.a.point.y, this.is2D ? 0 : ends.b.point.z - ends.a.point.z) : joint.distance;
            this.jointLengths.set(joint, length);
        }
        return length;
    }

    private solveJoints(dt: number, phase: "velocity" | "position") {
        for (let pass = 0; pass < (phase === "velocity" ? 4 : 2); pass += 1) {
            for (const entity of this.entities.values()) {
                if (!entity.joints.length || !entity.activeInHierarchy) continue;
                for (const joint of entity.joints) {
                    // Distance joints converge over a few passes (chains); a spring's force applies once per step.
                    if (!joint.enabled || (joint.kind === "spring" && pass > 0)) continue;
                    const ends = this.jointEnds(entity, joint);
                    if (!ends) continue;
                    const rest = this.jointRestLength(entity, joint);
                    if (phase === "velocity") {
                        solveJointVelocity(joint, ends.a, ends.b, rest, dt, this.is2D);
                    } else {
                        const move = jointCorrection(joint, ends.a, ends.b, rest, this.is2D);
                        if (!move) continue;
                        if (ends.a.invMass > 0) this.translate(entity, move.a);
                        if (ends.other && ends.b.invMass > 0) this.translate(ends.other, move.b);
                    }
                }
            }
        }
    }

    private drawJoints() {
        for (const entity of this.entities.values()) {
            if (!entity.joints.length || !entity.activeInHierarchy) continue;
            for (const joint of entity.joints) {
                if (!joint.enabled || !joint.showLine) continue;
                const ends = this.jointEnds(entity, joint);
                if (ends) this.drawLine(ends.a.point, ends.b.point, joint.lineColor, 0);
            }
        }
    }

    /** Camera-space offset of the active shakes for the renderer (null when still). */
    cameraShakeOffset(): { x: number; y: number; roll: number } | null {
        return this.shaker.offset();
    }

    animatorOf(entity: RuntimeEntity): AnimationPlayer | null {
        const component = entity.components.find((candidate) => candidate.type === "animation");
        if (!component || component.type !== "animation") return null;
        if (!entity.animator || entity.animator.component !== component) entity.animator = new AnimationPlayer(component);
        return entity.animator;
    }

    playAnimation(entity: RuntimeEntity, clip: string | null): boolean {
        const animator = this.animatorOf(entity);
        if (!animator) return false;
        animator.autoPlayed = true;
        return animator.play(entity, clip);
    }

    stopAnimation(entity: RuntimeEntity) {
        const animator = this.animatorOf(entity);
        if (animator) animator.stop(entity);
    }

    /** The Animator state machine of an object (V5), created on first use. */
    animatorControllerOf(entity: RuntimeEntity): AnimatorController | null {
        const component = entity.animatorComponent;
        if (!component) return null;
        if (!entity.animatorController || entity.animatorController.component !== component) {
            entity.animatorController = new AnimatorController(component);
            entity.animatorStateTime = 0;
        }
        return entity.animatorController;
    }

    /** Seconds the object's Animator has been in its current state. */
    animatorStateTime(entity: RuntimeEntity) {
        return entity.animatorStateTime;
    }

    /** Enters an Animator state: its clip plays (or blends in) and scripts get OnStateExit / OnStateEnter. */
    enterAnimatorState(entity: RuntimeEntity, controller: AnimatorController, state: AnimatorState, duration: number, transition: AnimatorTransition | null) {
        const previous = controller.state;
        const player = this.animatorOf(entity);
        if (player) player.autoPlayed = true;
        // A state entered from Start() (Animator.Play) replaces the default state.
        controller.started = true;
        entity.animatorStateTime = 0;
        if (!controller.enter(state, player, entity, duration, transition)) {
            this.warnOnce(`animator-clip:${entity.id}:${state.clip ?? ""}`, player
                ? `Animator '${entity.name}': '${state.name}' durumu '${state.clip}' klibini bulamadı; Animation bileşenine bu adda bir klip ekleyin.`
                : `Animator '${entity.name}': klipleri oynatmak için nesneye bir Animation bileşeni ekleyin.`);
        }
        for (const behaviour of entity.behaviours.slice()) {
            if (!behaviour.live) continue;
            if (previous && this.interpreter.hasMethod(behaviour.object, "OnStateExit", false)) this.callMethod(behaviour, "OnStateExit", [previous.name]);
            if (behaviour.live && this.interpreter.hasMethod(behaviour.object, "OnStateEnter", false)) this.callMethod(behaviour, "OnStateEnter", [state.name]);
        }
    }

    /** Runs the state machine for a frame: the first state on the first frame, then the transitions whose time has come. */
    private stepAnimator(entity: RuntimeEntity, controller: AnimatorController, deltaTime: number) {
        if (!controller.started) {
            controller.started = true;
            const first = controller.defaultState;
            if (first && !controller.state) this.enterAnimatorState(entity, controller, first, 0, null);
            return;
        }
        if (!controller.state) return;
        entity.animatorStateTime += deltaTime * controller.state.speed * controller.component.speed * controller.speed;
        const player = entity.animator;
        if (controller.transition && !player?.blending) controller.transition = null;
        // Instant transitions may chain within a frame; a few hops at most so a loop can't hang the game.
        for (let hop = 0; hop < 4 && !entity.destroyed && controller.state; hop += 1) {
            const state: AnimatorState = controller.state;
            const normalizedTime = state.clip && player?.clip ? player.normalizedTime : entity.animatorStateTime;
            const transition = controller.pick(normalizedTime);
            const next = transition ? controller.targetOf(transition) : null;
            if (!transition || !next) break;
            controller.consume(transition);
            this.enterAnimatorState(entity, controller, next, transition.duration, transition);
            if (transition.duration > 0) break;
        }
    }

    private updateAnimations(deltaTime: number) {
        for (const entity of this.entities.values()) {
            if (entity.destroyed || !entity.activeInHierarchy) continue;
            const animator = entity.animator;
            if (animator && animator.playing && animator.component.enabled) {
                const finished = animator.update(entity, deltaTime);
                if (finished) {
                    // Scripts on the object can react without a warning when nobody listens.
                    for (const state of entity.behaviours.slice()) {
                        if (state.live && this.interpreter.hasMethod(state.object, "OnAnimationComplete", false)) this.callMethod(state, "OnAnimationComplete", [finished]);
                    }
                }
            }
            if (entity.destroyed || !entity.animatorComponent?.enabled) continue;
            const controller = this.animatorControllerOf(entity);
            if (controller) this.stepAnimator(entity, controller, deltaTime);
        }
    }

    // -------------------------------------------------------------------
    // UI (buttons, panels, progress bars)
    // -------------------------------------------------------------------

    /** Screen rectangle of a UI component in CSS pixels (same math as the overlay). */
    uiRectOf(entity: RuntimeEntity, component: GameComponent): ScreenRect | null {
        const screen = this.screenSize();
        if (component.type === "uiPanel" && component.fullScreen) return { left: 0, top: 0, width: screen.width, height: screen.height };
        if (component.type !== "uiButton" && component.type !== "uiPanel" && component.type !== "uiProgressBar"
            && component.type !== "uiSlider" && component.type !== "uiToggle" && component.type !== "uiInputField") return null;
        const scale = entity.world.scale;
        return scaleRect(uiRect(component, screen), scale.x, scale.y);
    }

    uiState(): { hover: string | null; pressed: string | null; focus: { id: string | null; serial: number } } {
        return { hover: this.uiHover, pressed: this.uiPressed, focus: this.inputFocus };
    }

    /** Gives the keyboard to an input field (ActivateInputField) or takes it back (null). */
    requestInputFocus(id: string | null) {
        this.inputFocus = { id, serial: this.inputFocus.serial + 1 };
    }

    /** The overlay reports which input field has the keyboard. */
    setFocusedInput(id: string | null) {
        this.focusedInput = id;
    }

    private processUIEvents() {
        const screen = this.screenSize();
        const x = this.input.mouseX;
        const y = screen.height - this.input.mouseY;
        let top: { component: GameComponent; entity: RuntimeEntity; order: number; index: number } | null = null;
        let index = 0;
        const hotkeys: Array<{ entity: RuntimeEntity; component: UIButtonComponent }> = [];
        for (const entity of this.entities.values()) {
            index += 1;
            if (!entity.activeInHierarchy) continue;
            for (const component of entity.components) {
                if (!component.enabled) continue;
                const interactive = component.type === "uiButton" || (component.type === "uiPanel" && component.blocksClicks)
                    || component.type === "uiSlider" || component.type === "uiToggle" || component.type === "uiInputField";
                if (!interactive) continue;
                if (component.type === "uiButton" && component.interactable && component.hotkey !== "None") hotkeys.push({ entity, component });
                const rect = this.uiRectOf(entity, component);
                if (!rect || !rectContains(rect, x, y)) continue;
                const order = "order" in component ? component.order : 0;
                if (!top || order > top.order || (order === top.order && index >= top.index)) top = { component, entity, order, index };
            }
        }
        const control = top && (top.component.type === "uiButton" || top.component.type === "uiSlider" || top.component.type === "uiToggle" || top.component.type === "uiInputField")
            && top.component.interactable ? top : null;
        this.uiHover = control ? control.component.id : null;
        if (this.input.getMouseButtonDown(0) && control) {
            this.uiPressed = control.component.id;
            if (control.component.type === "uiSlider") {
                // The press itself sets the value (a quick tap can be released within the same frame).
                this.uiDragging = control.component.id;
                const rect = this.uiRectOf(control.entity, control.component);
                if (rect) this.setSliderValue(control.entity, control.component, this.sliderValueAt(control.component, rect, x, y), true);
            }
            if (control.component.type === "uiInputField") this.requestInputFocus(control.component.id);
        }
        // Dragging a slider follows the mouse even outside its rectangle.
        if (this.uiDragging) {
            const dragged = this.findUIComponent(this.uiDragging);
            if (dragged && dragged.component.type === "uiSlider" && this.input.getMouseButton(0)) {
                const rect = this.uiRectOf(dragged.entity, dragged.component);
                if (rect) this.setSliderValue(dragged.entity, dragged.component, this.sliderValueAt(dragged.component, rect, x, y), true);
            }
        }
        if (this.input.getMouseButtonUp(0)) {
            const pressed = this.uiPressed;
            this.uiPressed = null;
            this.uiDragging = null;
            if (pressed && control && pressed === control.component.id) {
                if (control.component.type === "uiButton") this.clickButton(control.entity, control.component);
                else if (control.component.type === "uiToggle") this.setToggle(control.entity, control.component, !control.component.isOn, true);
            }
        }
        this.pointerOverUI = top !== null || this.uiDragging !== null;
        for (const { entity, component } of hotkeys) {
            if (!entity.destroyed && this.input.getKeyDown(component.hotkey)) this.clickButton(entity, component);
        }
    }

    private findUIComponent(id: string): { entity: RuntimeEntity; component: GameComponent } | null {
        for (const entity of this.entities.values()) {
            if (entity.destroyed || !entity.activeInHierarchy) continue;
            const component = entity.components.find((item) => item.id === id);
            if (component) return component.enabled ? { entity, component } : null;
        }
        return null;
    }

    private sliderValueAt(component: UISliderComponent, rect: ScreenRect, x: number, y: number): number {
        const across = component.direction === "leftToRight" ? (x - rect.left) / Math.max(1, rect.width)
            : component.direction === "rightToLeft" ? 1 - (x - rect.left) / Math.max(1, rect.width)
                : component.direction === "bottomToTop" ? (rect.top + rect.height - y) / Math.max(1, rect.height)
                    : (y - rect.top) / Math.max(1, rect.height);
        const t = Math.max(0, Math.min(1, across));
        return component.min + (component.max - component.min) * t;
    }

    /** Sets a slider's value (clamped, snapped for whole numbers); `notify` runs onValueChanged when it changes. */
    setSliderValue(entity: RuntimeEntity, component: UISliderComponent, value: number, notify: boolean) {
        const low = Math.min(component.min, component.max);
        const high = Math.max(component.min, component.max);
        let next = Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
        if (component.wholeNumbers) next = Math.max(low, Math.min(high, Math.round(next)));
        if (next === component.value) return;
        component.value = next;
        this.markRender(entity);
        if (notify) this.fireUIEvent(entity, component, "onValueChanged", component.onValueChanged, next);
    }

    setToggle(entity: RuntimeEntity, component: UIToggleComponent, isOn: boolean, notify: boolean) {
        if (component.isOn === isOn) return;
        component.isOn = isOn;
        this.markRender(entity);
        if (notify) this.fireUIEvent(entity, component, "onValueChanged", component.onValueChanged, isOn);
    }

    /** Keeps only the characters an input field accepts, cut to its limit. */
    filterInputText(component: UIInputFieldComponent, text: string): string {
        let value = String(text ?? "").replace(/[\r\n\t]+/g, " ");
        switch (component.contentType) {
            case "integer":
                value = value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "");
                break;
            case "decimal": {
                value = value.replace(/[^0-9.,-]/g, "").replace(/(?!^)-/g, "").replace(",", ".");
                const dot = value.indexOf(".");
                if (dot >= 0) value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, "");
                break;
            }
            case "alphanumeric":
                value = value.replace(/[^\p{L}\p{N}]/gu, "");
                break;
            case "name":
                value = value.replace(/[^\p{L} '\-]/gu, "");
                break;
            case "email":
                value = value.replace(/\s/g, "");
                break;
        }
        return [...value].slice(0, Math.max(1, component.characterLimit)).join("");
    }

    /**
     * Text typed into an input field (from the overlay, or tests): "change" while typing,
     * "end" when editing ends, "submit" on Enter (which also ends editing).
     */
    uiInput(componentId: string, text: string, phase: "change" | "end" | "submit") {
        const found = this.findUIComponent(componentId);
        if (!found || found.component.type !== "uiInputField" || !found.component.interactable) return;
        const { entity, component } = found;
        const value = this.filterInputText(component, text);
        if (value !== component.text) {
            component.text = value;
            this.markRender(entity);
            this.fireUIEvent(entity, component, "onValueChanged", component.onValueChanged, value);
        }
        if (phase === "submit") this.fireUIEvent(entity, component, "onSubmit", null, component.text);
        if (phase !== "change") this.fireUIEvent(entity, component, "onEndEdit", component.onEndEdit, component.text);
    }

    /** Calls a UI event: the Inspector method (with the value) and the script listeners. */
    fireUIEvent(entity: RuntimeEntity, component: GameComponent, event: string, target: UIEventTarget | null, value: VMValue) {
        if (entity.destroyed) return;
        if (target?.method) {
            const receiver = target.targetId ? this.entities.get(target.targetId) ?? null : entity;
            if (!receiver) this.warnOnce(`ui-target:${component.id}:${event}`, `'${entity.name}' ${event} hedef nesnesi sahnede yok.`);
            else this.guard(null, `${entity.name} ${event}`, () => this.sendMessage(receiver, target.method, value, "SendMessage"));
        }
        for (const listener of [...(this.uiListeners.get(`${component.id}:${event}`) ?? [])]) {
            if (entity.destroyed) break;
            this.runCallback(this.currentBehaviour, `${entity.name} ${event}`, listener, [value]);
        }
    }

    addUIListener(componentId: string, event: string, listener: VMValue) {
        const key = `${componentId}:${event}`;
        const list = this.uiListeners.get(key) ?? [];
        if (list.length >= 64) hostError("Bir olaya en fazla 64 dinleyici eklenebilir.", "InvalidOperationException");
        list.push(listener);
        this.uiListeners.set(key, list);
    }

    removeUIListener(componentId: string, event: string, listener: VMValue | null) {
        const key = `${componentId}:${event}`;
        if (listener === null) {
            this.uiListeners.delete(key);
            return;
        }
        const list = this.uiListeners.get(key);
        if (!list) return;
        const index = list.findIndex((item) => sameCallable(item, listener));
        if (index >= 0) list.splice(index, 1);
    }

    uiListenerCount(componentId: string, event: string) {
        return this.uiListeners.get(`${componentId}:${event}`)?.length ?? 0;
    }

    /** Runs a button's Inspector method and its script listeners. */
    clickButton(entity: RuntimeEntity, component: UIButtonComponent) {
        if (entity.destroyed || !component.enabled || !component.interactable) return;
        const method = component.onClick.method;
        if (method) {
            const target = component.onClick.targetId ? this.entities.get(component.onClick.targetId) ?? null : entity;
            if (!target) this.warnOnce(`button-target:${component.id}`, `'${entity.name}' butonunun hedef nesnesi sahnede yok.`);
            else this.guard(null, `${entity.name} onClick`, () => this.sendMessage(target, method, undefined, "SendMessage"));
        }
        for (const listener of [...(this.buttonListeners.get(component.id) ?? [])]) {
            if (entity.destroyed) break;
            this.runCallback(this.currentBehaviour, `${entity.name} onClick`, listener, []);
        }
    }

    addButtonListener(component: UIButtonComponent, listener: VMValue) {
        const list = this.buttonListeners.get(component.id) ?? [];
        if (list.length >= 64) hostError("Bir butona en fazla 64 dinleyici eklenebilir.", "InvalidOperationException");
        list.push(listener);
        this.buttonListeners.set(component.id, list);
    }

    /** Removes one listener, or all of them when `listener` is null. */
    removeButtonListener(component: UIButtonComponent, listener: VMValue) {
        if (listener === null) {
            this.buttonListeners.delete(component.id);
            return;
        }
        const list = this.buttonListeners.get(component.id);
        if (!list) return;
        const index = list.findIndex((item) => sameCallable(item, listener));
        if (index >= 0) list.splice(index, 1);
    }

    // -------------------------------------------------------------------
    // Scene fades
    // -------------------------------------------------------------------

    /** SceneManager.FadeToScene: fades out, loads the scene, fades back in. */
    requestSceneFade(target: VMValue, seconds: number, color: string) {
        const scene = typeof target === "number" ? this.findScene(target) : target instanceof SceneHandle ? this.findScene(target.buildIndex) : this.findScene(String(target ?? ""));
        if (!scene) hostError(`Sahne bulunamadı: '${this.display(target)}'. Sahne adını veya sırasını (0, 1, …) kontrol edin.`, "ArgumentException");
        if (this.fade?.phase === "out") return;
        this.fade = { alpha: this.fade?.alpha ?? 0, color, phase: "out", duration: Math.max(0.05, Math.min(5, seconds)), target: scene };
    }

    private updateFade(deltaTime: number) {
        const fade = this.fade;
        if (!fade) return;
        const step = deltaTime / fade.duration;
        if (fade.phase === "out") {
            fade.alpha = Math.min(1, fade.alpha + step);
            if (fade.alpha >= 1) {
                this.pendingScene = fade.target;
                fade.target = null;
                fade.phase = "in";
            }
        } else {
            fade.alpha = Math.max(0, fade.alpha - step);
            if (fade.alpha <= 0) this.fade = null;
        }
    }

    fadeState(): { alpha: number; color: string } | null {
        return this.fade ? { alpha: this.fade.alpha, color: this.fade.color } : null;
    }

    // -------------------------------------------------------------------
    // Stats
    // -------------------------------------------------------------------

    stats(): WorldStats {
        let particles = 0;
        for (const entity of this.entities.values()) particles += entity.emitter?.count ?? 0;
        return {
            entities: this.entities.size,
            behaviours: this.behaviours.length,
            bodies: this.physicsEntities.size,
            tweens: this.tweens.activeCount,
            timers: this.timers.activeCount,
            particles,
        };
    }

    // -------------------------------------------------------------------
    // Debug drawing & HUD
    // -------------------------------------------------------------------

    drawLine(from: Vector3, to: Vector3, color: string, duration: number) {
        if (this.debugLines.length > 2000) this.debugLines.shift();
        this.debugLines.push({ from, to, color, until: this.time + Math.max(0, duration) });
    }

    showHud(text: string, seconds: number, color = "#ffffff") {
        this.hud = { text: text.slice(0, 500), until: this.realtime + Math.max(0.1, seconds), color };
    }

    /** Distance helper used by physics queries (keeps handles free of math imports). */
    distance(a: Vector3, b: Vector3) {
        const d = subVec3(a, b);
        return Math.hypot(d.x, d.y, d.z);
    }
}
