/** Runtime (play mode) representation of scene objects and behaviours. */
/* eslint-disable @typescript-eslint/no-this-alias -- parent/base chains are walked starting from `this`. */
import { combineTRS, conjugateQuat, eulerDegFromQuat, mulQuat, normalizeQuat, quatFromEulerDeg, worldToLocalPoint, type Quat, type TRS } from "../math";
import type { ClassInfo, HostObject, ScriptObject, VMCoroutine, VMValue } from "../script/values";
import type {
    AnimatorComponent,
    CameraFollowComponent,
    CharacterController2DComponent,
    ColliderComponent,
    GameComponent,
    JointComponent,
    NavAgent2DComponent,
    GameEntity,
    RigidBodyComponent,
    ScriptComponent,
    TilemapComponent,
    TransformComponent,
    Vector3,
} from "../types";
import type { AnimatedTarget, AnimationPlayer } from "./animator";
import type { AnimatorController } from "./animator-controller";
import type { CameraFollower } from "./camera-follow";
import type { CharacterMotor } from "./character";
import type { NavAgentState } from "./nav-agent";
import type { ParticleEmitter } from "./particles";
import { createBodyRuntime, type BodyRuntime, type PhysicsEntity } from "./physics";

export type WaitState =
    | { kind: "frame" }
    | { kind: "seconds"; until: number }
    | { kind: "realtime"; until: number }
    | { kind: "until"; fn: VMValue }
    | { kind: "while"; fn: VMValue }
    | { kind: "coroutine"; target: VMCoroutine }
    | { kind: "fixed" }
    | { kind: "endOfFrame" };

export interface CoroutineState {
    owner: BehaviourState;
    /** Nested coroutines (`yield return OtherRoutine()`): the last one runs. */
    stack: VMCoroutine[];
    root: VMCoroutine;
    wait: WaitState;
    done: boolean;
}

export interface InvokeState {
    method: string;
    at: number;
    /** Seconds between repeats; negative means "call once". */
    repeat: number;
}

export class BehaviourState {
    awoken = false;
    started = false;
    destroyed = false;
    /** OnEnable was called and OnDisable is still owed. */
    enabledCalled = false;
    /** Disabled after an infinite loop so the game keeps running. */
    failed = false;
    readonly coroutines: CoroutineState[] = [];
    readonly invokes: InvokeState[] = [];
    readonly has: Record<"Update" | "FixedUpdate" | "LateUpdate" | "OnGUI", boolean>;
    readonly updateArity: number;

    readonly entity: RuntimeEntity;
    readonly component: ScriptComponent;
    readonly cls: ClassInfo;
    object: ScriptObject;
    constructor(
        entity: RuntimeEntity,
        component: ScriptComponent,
        cls: ClassInfo,
        object: ScriptObject,
        methods: { has: (name: string) => boolean; arity: (name: string) => number },
    ) {
        this.entity = entity;
        this.component = component;
        this.cls = cls;
        this.object = object;
        this.has = {
            Update: methods.has("Update"),
            FixedUpdate: methods.has("FixedUpdate"),
            LateUpdate: methods.has("LateUpdate"),
            OnGUI: methods.has("OnGUI"),
        };
        this.updateArity = this.has.Update ? methods.arity("Update") : 0;
    }

    get enabled() {
        return this.component.enabled && !this.failed;
    }

    /** Enabled, not destroyed and its GameObject is active in the hierarchy. */
    get live() {
        return !this.destroyed && this.enabled && this.entity.activeInHierarchy;
    }
}

let instanceCounter = 1;

export class RuntimeEntity implements PhysicsEntity, AnimatedTarget {
    readonly id: string;
    name: string;
    tag: string;
    activeSelf: boolean;
    parent: RuntimeEntity | null = null;
    readonly children: RuntimeEntity[] = [];
    components: GameComponent[];
    rigidBody: RigidBodyComponent | null = null;
    collider: ColliderComponent | null = null;
    tilemap: TilemapComponent | null = null;
    /** Bumped when scripts change tiles so physics rebuilds the tile shapes. */
    tilemapRevision = 0;
    animator: AnimationPlayer | null = null;
    /** The Animator component (V5) and its state machine, created on first use. */
    animatorComponent: AnimatorComponent | null = null;
    animatorController: AnimatorController | null = null;
    /** Seconds in the current Animator state (states without a clip use it as their time). */
    animatorStateTime = 0;
    characterController: CharacterController2DComponent | null = null;
    cameraFollow: CameraFollowComponent | null = null;
    navAgent: NavAgent2DComponent | null = null;
    joints: JointComponent[] = [];
    /** Runtime state of the Character Controller 2D, Camera Follow and Nav Agent 2D components (V4). */
    motor: CharacterMotor | null = null;
    follower: CameraFollower | null = null;
    nav: NavAgentState | null = null;
    /** Runtime opacity of this object's UI components (fades, tweens). */
    uiAlpha = 1;
    body: BodyRuntime;
    readonly behaviours: BehaviourState[] = [];
    emitter: ParticleEmitter | null = null;
    destroyed = false;
    /** Queued for destruction at the end of the current phase. */
    pendingDestroy = false;
    persistent = false;
    /** Bumped when a render-relevant property changes (renderer rebuilds visuals). */
    renderVersion = 0;
    readonly instanceId = instanceCounter++;
    localPosition: Vector3;
    localRotation: Quat;
    localScale: Vector3;
    private worldCache: TRS | null = null;
    /** Script-facing wrappers, created lazily and reused so `==` comparisons work. */
    readonly handles = new Map<string, HostObject>();
    /** Mouse state for OnMouseEnter/Exit/Over/Drag. */
    mouseOver = false;
    mouseDownActive = false;

    constructor(source: GameEntity) {
        this.id = source.id;
        this.name = source.name;
        this.tag = source.tag || "Untagged";
        this.activeSelf = source.active;
        this.components = source.components;
        const transform = source.components.find((component): component is TransformComponent => component.type === "transform");
        this.localPosition = transform ? { ...transform.position } : { x: 0, y: 0, z: 0 };
        this.localRotation = quatFromEulerDeg(transform?.rotation ?? { x: 0, y: 0, z: 0 });
        this.localScale = transform ? { ...transform.scale } : { x: 1, y: 1, z: 1 };
        this.refreshComponentCache();
        this.body = createBodyRuntime(this.rigidBody);
    }

    refreshComponentCache() {
        this.rigidBody = (this.components.find((component) => component.type === "rigidBody") as RigidBodyComponent | undefined) ?? null;
        this.collider = (this.components.find((component) => component.type === "collider") as ColliderComponent | undefined) ?? null;
        this.tilemap = (this.components.find((component) => component.type === "tilemap") as TilemapComponent | undefined) ?? null;
        this.characterController = (this.components.find((component) => component.type === "characterController2D") as CharacterController2DComponent | undefined) ?? null;
        this.cameraFollow = (this.components.find((component) => component.type === "cameraFollow") as CameraFollowComponent | undefined) ?? null;
        this.navAgent = (this.components.find((component) => component.type === "navAgent2D") as NavAgent2DComponent | undefined) ?? null;
        this.animatorComponent = (this.components.find((component) => component.type === "animator") as AnimatorComponent | undefined) ?? null;
        this.joints = this.components.filter((component): component is JointComponent => component.type === "joint");
        this.renderVersion += 1;
    }

    /** Physics: a Character Controller 2D drives the speed itself, so its contacts have no friction. */
    get frictionless(): boolean {
        return Boolean(this.characterController?.enabled);
    }

    get transformComponent(): TransformComponent | undefined {
        return this.components.find((component): component is TransformComponent => component.type === "transform");
    }

    get activeInHierarchy(): boolean {
        let guard = 0;
        for (let cursor: RuntimeEntity | null = this; cursor && guard < 256; cursor = cursor.parent, guard += 1) {
            if (!cursor.activeSelf || cursor.destroyed) return false;
        }
        return true;
    }

    get alive() {
        return !this.destroyed;
    }

    /** RenderEntity: drawn when active in the hierarchy. */
    get visible(): boolean {
        return this.activeInHierarchy;
    }

    /** RenderEntity: bumped on in-place component changes. */
    get version(): number {
        return this.renderVersion;
    }

    /**
     * Invalidates the cached world transform of this subtree. A child cache can
     * only exist while the parent cache exists, so stopping early is safe.
     */
    markDirty() {
        if (!this.worldCache) return;
        this.worldCache = null;
        for (const child of this.children) child.markDirty();
    }

    get world(): TRS {
        if (!this.worldCache) {
            const local: TRS = { position: { ...this.localPosition }, rotation: { ...this.localRotation }, scale: { ...this.localScale } };
            this.worldCache = this.parent ? combineTRS(this.parent.world, local) : local;
        }
        return this.worldCache;
    }

    setWorldPosition(position: Vector3) {
        this.localPosition = this.parent ? worldToLocalPoint(this.parent.world, position) : { x: position.x, y: position.y, z: position.z };
        this.markDirty();
    }

    setWorldRotation(rotation: Quat) {
        const normalized = normalizeQuat(rotation);
        this.localRotation = this.parent ? normalizeQuat(mulQuat(conjugateQuat(this.parent.world.rotation), normalized)) : normalized;
        this.markDirty();
    }

    setLocalPosition(position: Vector3) {
        this.localPosition = { x: position.x, y: position.y, z: position.z };
        this.markDirty();
    }

    setLocalRotation(rotation: Quat) {
        this.localRotation = normalizeQuat(rotation);
        this.markDirty();
    }

    setLocalScale(scale: Vector3) {
        this.localScale = { x: scale.x, y: scale.y, z: scale.z };
        this.markDirty();
    }

    /** Writes the live transform back into the Transform component (for cloning/snapshots). */
    syncTransformComponent() {
        const transform = this.transformComponent;
        if (!transform) return;
        transform.position = { ...this.localPosition };
        transform.rotation = eulerDegFromQuat(this.localRotation);
        transform.scale = { ...this.localScale };
    }

    isDescendantOf(other: RuntimeEntity): boolean {
        for (let cursor = this.parent; cursor; cursor = cursor.parent) if (cursor === other) return true;
        return false;
    }

    /** This entity and all descendants, parents first. */
    subtree(): RuntimeEntity[] {
        const output: RuntimeEntity[] = [];
        const visit = (entity: RuntimeEntity) => {
            output.push(entity);
            for (const child of entity.children) visit(child);
        };
        visit(this);
        return output;
    }

    root(): RuntimeEntity {
        let cursor: RuntimeEntity = this;
        while (cursor.parent) cursor = cursor.parent;
        return cursor;
    }
}
