/**
 * Script-facing wrappers ("handles") around runtime entities and components.
 * They implement the VM's HostObject interface and mimic the Unity API.
 */
import {
    DEG2RAD,
    IDENTITY_QUAT,
    RAD2DEG,
    conjugateQuat,
    crossVec3,
    dotVec3,
    eulerDegFromQuat,
    lengthVec3,
    localToWorldPoint,
    mulQuat,
    normalizeQuat,
    normalizeVec3,
    quatFromAxisAngle,
    quatFromEulerDeg,
    quatLookRotation,
    rotateVec3,
    subVec3,
    worldToLocalPoint,
    type Quat,
} from "../math";
import { VMColor, VMError, VMList, VMQuat, VMRef, Vec3, ScriptObject, type HostObject, type VMValue } from "../script/values";
import type {
    AudioSourceComponent,
    CameraComponent,
    ColliderComponent,
    GameComponent,
    LightComponent,
    MeshRendererComponent,
    ParticleSystemComponent,
    PrefabAsset,
    RigidBodyComponent,
    SpriteRendererComponent,
    UITextComponent,
    Vector3,
} from "../types";
import { screenRay, screenToViewport, screenToWorld, viewportRay, viewportToScreen, viewportToWorld, worldToScreen, worldToViewport, type WorldRay } from "./camera-math";
import type { RuntimeEntity } from "./entity";
import type { RuntimeWorld } from "./world";

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

export function hostError(message: string, exceptionType = "Exception"): never {
    throw new VMError(message, exceptionType);
}

export function toNumber(value: VMValue, what = "değer"): number {
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return hostError(`${what} bir sayı olmalı.`, "ArgumentException");
}

export function toBool(value: VMValue): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    return Boolean(value);
}

export function toVector(value: VMValue, what = "vektör"): Vector3 {
    if (value instanceof Vec3) return { x: value.x, y: value.y, z: value.is2D ? 0 : value.z };
    return hostError(`${what} bir Vector2/Vector3 olmalı.`, "ArgumentException");
}

export function isVector(value: VMValue): value is Vec3 {
    return value instanceof Vec3;
}

export function vec(v: Vector3, is2D = false): Vec3 {
    return new Vec3(v.x, v.y, is2D ? 0 : v.z, is2D);
}

export function quatToVM(q: Quat): VMQuat {
    return new VMQuat(q.x, q.y, q.z, q.w);
}

export function toQuat(value: VMValue, what = "rotasyon"): Quat {
    if (value instanceof VMQuat) return normalizeQuat({ x: value.x, y: value.y, z: value.z, w: value.w });
    return hostError(`${what} bir Quaternion olmalı.`, "ArgumentException");
}

export function colorToVM(hex: string, alpha = 1): VMColor {
    return VMColor.fromHex(hex, alpha);
}

export function toColor(value: VMValue): VMColor {
    if (value instanceof VMColor) return value;
    if (typeof value === "string") return VMColor.fromHex(value);
    return hostError("Renk bir Color değeri olmalı.", "ArgumentException");
}

function wrapAngle360(value: number) {
    const wrapped = ((value % 360) + 360) % 360;
    return Math.abs(wrapped - 360) < 1e-4 || Math.abs(wrapped) < 1e-6 ? 0 : wrapped;
}

function eulerForScript(q: Quat): Vector3 {
    const euler = eulerDegFromQuat(q);
    return { x: wrapAngle360(euler.x), y: wrapAngle360(euler.y), z: wrapAngle360(euler.z) };
}

/** Rotation that turns direction `from` into direction `to`. */
export function fromToRotation(from: Vector3, to: Vector3): Quat {
    const a = normalizeVec3(from);
    const b = normalizeVec3(to);
    const d = dotVec3(a, b);
    if (d > 0.999999) return { ...IDENTITY_QUAT };
    if (d < -0.999999) {
        let axis = crossVec3({ x: 1, y: 0, z: 0 }, a);
        if (lengthVec3(axis) < 1e-6) axis = crossVec3({ x: 0, y: 1, z: 0 }, a);
        return quatFromAxisAngle(axis, Math.PI);
    }
    const axis = crossVec3(a, b);
    return normalizeQuat({ x: axis.x, y: axis.y, z: axis.z, w: 1 + d });
}

/** `GetComponent<T>()`, `GetComponent(typeof(T))` and `GetComponent("T")`. */
export function typeNameFrom(args: VMValue[], typeArgs: string[]): string {
    const raw = typeArgs[0] ?? (typeof args[0] === "string" ? args[0] : "");
    const name = String(raw).trim().replace(/^UnityEngine\./, "").replace(/^UnityEngine::/, "");
    if (!name) hostError("Bileşen türü belirtilmedi. Örnek: GetComponent<Rigidbody>()", "ArgumentException");
    return name;
}

function spaceIsWorld(value: VMValue) {
    return value === "World" || value === 0;
}

// ---------------------------------------------------------------------------
// Base classes
// ---------------------------------------------------------------------------

abstract class EntityHandle implements HostObject {
    abstract readonly hostType: string;
    constructor(readonly world: RuntimeWorld, readonly entity: RuntimeEntity) {}

    isAlive(): boolean {
        return !this.entity.destroyed;
    }

    protected typeNames(): string[] {
        return [this.hostType, "Object", "UnityEngine.Object", "Component"];
    }

    isType(name: string): boolean {
        return this.typeNames().includes(name);
    }

    protected unknown(name: string): never {
        return hostError(`'${this.hostType}' türünde '${name}' üyesi yok (veya bu motorda desteklenmiyor).`, "MissingMemberException");
    }

    /** Members every component (and GameObject) shares. */
    protected commonGet(name: string): VMValue | undefined {
        switch (name) {
            case "gameObject": return this.world.gameObjectHandle(this.entity);
            case "transform": return this.world.transformHandle(this.entity);
            case "name": return this.entity.name;
            case "tag": return this.entity.tag;
            default: return undefined;
        }
    }

    protected commonSet(name: string, value: VMValue): boolean {
        switch (name) {
            case "name":
                this.entity.name = String(value ?? "");
                return true;
            case "tag":
                this.entity.tag = String(value ?? "Untagged") || "Untagged";
                return true;
            default:
                return false;
        }
    }

    protected commonCall(name: string, args: VMValue[], typeArgs: string[], refs: Array<VMRef | null> = []): VMValue | undefined {
        const world = this.world;
        const entity = this.entity;
        switch (name) {
            case "GetComponent":
                return world.getComponent(entity, typeNameFrom(args, typeArgs));
            case "GetComponents":
                return new VMList(world.getComponents(entity, typeNameFrom(args, typeArgs)), "Array");
            case "GetComponentInChildren":
                return world.getComponentInChildren(entity, typeNameFrom(args, typeArgs), toBool(args[typeArgs.length ? 0 : 1] ?? false));
            case "GetComponentsInChildren":
                return new VMList(world.getComponentsInChildren(entity, typeNameFrom(args, typeArgs), toBool(args[typeArgs.length ? 0 : 1] ?? false)), "Array");
            case "GetComponentInParent":
                return world.getComponentInParent(entity, typeNameFrom(args, typeArgs));
            case "GetComponentsInParent":
                return new VMList(world.getComponentsInParent(entity, typeNameFrom(args, typeArgs)), "Array");
            case "TryGetComponent": {
                const component = world.getComponent(entity, typeNameFrom(args.filter((_, index) => !refs[index]), typeArgs));
                const outIndex = refs.findIndex((ref) => ref);
                if (outIndex >= 0) refs[outIndex]?.set(component);
                return component !== null;
            }
            case "AddComponent":
                return world.addComponent(entity, typeNameFrom(args, typeArgs));
            case "CompareTag":
                return entity.tag === String(args[0] ?? "");
            case "SendMessage":
            case "BroadcastMessage":
            case "SendMessageUpwards":
                world.sendMessage(entity, String(args[0] ?? ""), args[1], name);
                return undefined;
            case "GetInstanceID":
                return entity.instanceId;
            case "GetHashCode":
                return entity.instanceId;
            case "ToString":
                return this.toString();
            case "Equals":
                return args[0] === this;
            default:
                return undefined;
        }
    }

    get(name: string): VMValue {
        const common = this.commonGet(name);
        if (common !== undefined) return common;
        return this.unknown(name);
    }

    set(name: string, value: VMValue): void {
        if (this.commonSet(name, value)) return;
        this.unknown(name);
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        const result = this.commonCall(name, args, typeArgs, refs);
        if (result !== undefined || name === "SendMessage" || name === "BroadcastMessage" || name === "SendMessageUpwards") return result;
        return this.unknown(`${name}()`);
    }

    toString(): string {
        return `${this.entity.name} (${this.hostType})`;
    }
}

abstract class ComponentHandle<T extends GameComponent> extends EntityHandle {
    constructor(world: RuntimeWorld, entity: RuntimeEntity, readonly component: T) {
        super(world, entity);
    }

    isAlive(): boolean {
        return !this.entity.destroyed && this.entity.components.includes(this.component);
    }

    protected componentGet(name: string): VMValue | undefined {
        switch (name) {
            case "enabled": return this.component.enabled;
            case "isActiveAndEnabled": return this.component.enabled && this.entity.activeInHierarchy;
            default: return this.commonGet(name);
        }
    }

    protected componentSet(name: string, value: VMValue): boolean {
        if (name === "enabled") {
            this.component.enabled = toBool(value);
            this.world.componentChanged(this.entity);
            return true;
        }
        return this.commonSet(name, value);
    }

    protected changed() {
        this.world.markRender(this.entity);
    }
}

// ---------------------------------------------------------------------------
// GameObject
// ---------------------------------------------------------------------------

export class GameObjectHandle extends EntityHandle {
    readonly hostType = "GameObject";

    protected typeNames(): string[] {
        return ["GameObject", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        switch (name) {
            case "activeSelf": return this.entity.activeSelf;
            case "activeInHierarchy": return this.entity.activeInHierarchy;
            case "layer": return 0;
            case "isStatic": return false;
            case "scene": return this.world.sceneHandle();
            case "gameObject": return this;
            default: return super.get(name);
        }
    }

    set(name: string, value: VMValue): void {
        if (name === "layer" || name === "isStatic") return;
        if (name === "active") {
            this.world.setActive(this.entity, toBool(value));
            return;
        }
        super.set(name, value);
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        if (name === "SetActive") {
            this.world.setActive(this.entity, toBool(args[0]));
            return undefined;
        }
        return super.call(name, args, typeArgs, refs);
    }

    toString(): string {
        return `${this.entity.name} (GameObject)`;
    }
}

/** A prefab asset referenced from the Inspector (or loaded with Resources.Load). */
export class PrefabHandle implements HostObject {
    readonly hostType: string;
    constructor(readonly prefab: PrefabAsset, readonly componentType: string | null = null) {
        this.hostType = componentType ?? "GameObject";
    }

    isAlive() {
        return true;
    }

    isType(name: string) {
        return name === this.hostType || name === "GameObject" || name === "Object" || name === "UnityEngine.Object" || name === "Component";
    }

    get(name: string): VMValue {
        if (name === "name") return this.prefab.name;
        if (name === "gameObject") return this.componentType ? new PrefabHandle(this.prefab) : this;
        return hostError(`Prefab '${this.prefab.name}' sahnede değil; önce Instantiate(${this.prefab.name}) ile oluşturun.`, "InvalidOperationException");
    }

    set(): void {
        hostError(`Prefab '${this.prefab.name}' çalışma sırasında değiştirilemez; Instantiate ile bir kopyasını oluşturun.`, "InvalidOperationException");
    }

    call(name: string): VMValue {
        if (name === "ToString") return this.prefab.name;
        if (name === "GetInstanceID" || name === "GetHashCode") return this.prefab.id.length;
        return hostError(`Prefab '${this.prefab.name}' üzerinde '${name}' çağrılamaz; önce Instantiate kullanın.`, "InvalidOperationException");
    }

    toString() {
        return `${this.prefab.name} (Prefab)`;
    }
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

export class TransformHandle extends EntityHandle {
    readonly hostType = "Transform";

    protected typeNames(): string[] {
        return ["Transform", "RectTransform", "Component", "Object", "UnityEngine.Object"];
    }

    iterate(): VMValue[] {
        return this.entity.children.filter((child) => !child.destroyed).map((child) => this.world.transformHandle(child));
    }

    get(name: string): VMValue {
        const entity = this.entity;
        const world = entity.world;
        switch (name) {
            case "position": return vec(world.position);
            case "localPosition": return vec(entity.localPosition);
            case "rotation": return quatToVM(world.rotation);
            case "localRotation": return quatToVM(entity.localRotation);
            case "eulerAngles": return vec(eulerForScript(world.rotation));
            case "localEulerAngles": return vec(eulerForScript(entity.localRotation));
            case "localScale": return vec(entity.localScale);
            case "lossyScale": return vec(world.scale);
            case "forward": return vec(rotateVec3(world.rotation, { x: 0, y: 0, z: 1 }));
            case "right": return vec(rotateVec3(world.rotation, { x: 1, y: 0, z: 0 }));
            case "up": return vec(rotateVec3(world.rotation, { x: 0, y: 1, z: 0 }));
            case "parent": return entity.parent ? this.world.transformHandle(entity.parent) : null;
            case "root": return this.world.transformHandle(entity.root());
            case "childCount": return entity.children.filter((child) => !child.destroyed).length;
            case "hasChanged": return true;
            case "transform": return this;
            default: return super.get(name);
        }
    }

    set(name: string, value: VMValue): void {
        const entity = this.entity;
        switch (name) {
            case "position":
                entity.setWorldPosition(toVector(value, "position"));
                break;
            case "localPosition":
                entity.setLocalPosition(toVector(value, "localPosition"));
                break;
            case "rotation":
                entity.setWorldRotation(toQuat(value));
                break;
            case "localRotation":
                entity.setLocalRotation(toQuat(value));
                break;
            case "eulerAngles":
                entity.setWorldRotation(quatFromEulerDeg(toVector(value, "eulerAngles")));
                break;
            case "localEulerAngles":
                entity.setLocalRotation(quatFromEulerDeg(toVector(value, "localEulerAngles")));
                break;
            case "localScale":
                entity.setLocalScale(toVector(value, "localScale"));
                this.world.markRender(entity);
                break;
            case "forward": {
                const direction = toVector(value, "forward");
                if (lengthVec3(direction) > 1e-9) entity.setWorldRotation(quatLookRotation(direction));
                break;
            }
            case "up":
                entity.setWorldRotation(fromToRotation({ x: 0, y: 1, z: 0 }, toVector(value, "up")));
                break;
            case "right":
                entity.setWorldRotation(fromToRotation({ x: 1, y: 0, z: 0 }, toVector(value, "right")));
                break;
            case "parent":
                this.world.setParent(entity, value, true);
                break;
            case "hasChanged":
                break;
            default:
                super.set(name, value);
                return;
        }
        this.world.transformChanged(entity);
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        const entity = this.entity;
        const world = this.world;
        switch (name) {
            case "Translate": {
                let delta: Vector3;
                let rest: VMValue[];
                if (isVector(args[0])) {
                    delta = toVector(args[0]);
                    rest = args.slice(1);
                } else {
                    delta = { x: toNumber(args[0] ?? 0), y: toNumber(args[1] ?? 0), z: toNumber(args[2] ?? 0) };
                    rest = args.slice(3);
                }
                const relative = rest[0];
                const current = entity.world;
                let worldDelta = delta;
                if (relative instanceof TransformHandle) worldDelta = rotateVec3(relative.entity.world.rotation, delta);
                else if (!spaceIsWorld(relative)) worldDelta = rotateVec3(current.rotation, delta);
                entity.setWorldPosition({ x: current.position.x + worldDelta.x, y: current.position.y + worldDelta.y, z: current.position.z + worldDelta.z });
                world.transformChanged(entity);
                return undefined;
            }
            case "Rotate": {
                let rotation: Quat;
                let space: VMValue;
                if (isVector(args[0]) && typeof args[1] === "number") {
                    rotation = quatFromAxisAngle(toVector(args[0]), args[1] * DEG2RAD);
                    space = args[2];
                } else if (isVector(args[0])) {
                    rotation = quatFromEulerDeg(toVector(args[0]));
                    space = args[1];
                } else {
                    rotation = quatFromEulerDeg({ x: toNumber(args[0] ?? 0), y: toNumber(args[1] ?? 0), z: toNumber(args[2] ?? 0) });
                    space = args[3];
                }
                if (spaceIsWorld(space)) entity.setWorldRotation(mulQuat(rotation, entity.world.rotation));
                else entity.setLocalRotation(mulQuat(entity.localRotation, rotation));
                world.transformChanged(entity);
                return undefined;
            }
            case "RotateAround": {
                const point = toVector(args[0], "point");
                const axis = toVector(args[1], "axis");
                const angle = toNumber(args[2] ?? 0, "angle");
                const q = quatFromAxisAngle(axis, angle * DEG2RAD);
                const current = entity.world;
                const offset = rotateVec3(q, subVec3(current.position, point));
                entity.setWorldPosition({ x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z });
                entity.setWorldRotation(mulQuat(q, current.rotation));
                world.transformChanged(entity);
                return undefined;
            }
            case "LookAt": {
                const target = args[0] instanceof TransformHandle ? args[0].entity.world.position : args[0] instanceof GameObjectHandle ? args[0].entity.world.position : toVector(args[0], "hedef");
                const up = isVector(args[1]) ? toVector(args[1]) : { x: 0, y: 1, z: 0 };
                const direction = subVec3(target, entity.world.position);
                if (lengthVec3(direction) > 1e-9) entity.setWorldRotation(quatLookRotation(direction, up));
                world.transformChanged(entity);
                return undefined;
            }
            case "SetParent":
                world.setParent(entity, args[0] ?? null, args.length > 1 ? toBool(args[1]) : true);
                return undefined;
            case "SetPositionAndRotation":
                entity.setWorldPosition(toVector(args[0], "position"));
                entity.setWorldRotation(toQuat(args[1]));
                world.transformChanged(entity);
                return undefined;
            case "SetLocalPositionAndRotation":
                entity.setLocalPosition(toVector(args[0], "localPosition"));
                entity.setLocalRotation(toQuat(args[1]));
                world.transformChanged(entity);
                return undefined;
            case "GetChild": {
                const children = entity.children.filter((child) => !child.destroyed);
                const index = Math.trunc(toNumber(args[0] ?? 0, "index"));
                if (index < 0 || index >= children.length) hostError(`Transform alt nesne indeksi sınır dışında (${index}).`, "UnityException");
                return world.transformHandle(children[index]);
            }
            case "Find":
            case "FindChild": {
                const path = String(args[0] ?? "").split("/").filter(Boolean);
                let cursor: RuntimeEntity | undefined = entity;
                for (const part of path) {
                    cursor = cursor?.children.find((child) => !child.destroyed && child.name === part);
                    if (!cursor) return null;
                }
                return cursor && cursor !== entity ? world.transformHandle(cursor) : null;
            }
            case "TransformPoint":
                return vec(localToWorldPoint(entity.world, this.vectorArgs(args)));
            case "InverseTransformPoint":
                return vec(worldToLocalPoint(entity.world, this.vectorArgs(args)));
            case "TransformDirection":
                return vec(rotateVec3(entity.world.rotation, this.vectorArgs(args)));
            case "InverseTransformDirection":
                return vec(rotateVec3(conjugateQuat(entity.world.rotation), this.vectorArgs(args)));
            case "TransformVector": {
                const v = this.vectorArgs(args);
                const s = entity.world.scale;
                return vec(rotateVec3(entity.world.rotation, { x: v.x * s.x, y: v.y * s.y, z: v.z * s.z }));
            }
            case "InverseTransformVector": {
                const v = rotateVec3(conjugateQuat(entity.world.rotation), this.vectorArgs(args));
                const s = entity.world.scale;
                return vec({ x: s.x ? v.x / s.x : 0, y: s.y ? v.y / s.y : 0, z: s.z ? v.z / s.z : 0 });
            }
            case "DetachChildren":
                for (const child of [...entity.children]) world.setParent(child, null, true);
                return undefined;
            case "IsChildOf": {
                const other = args[0] instanceof TransformHandle ? args[0].entity : null;
                return Boolean(other && (other === entity || entity.isDescendantOf(other)));
            }
            case "GetSiblingIndex": {
                const siblings = entity.parent ? entity.parent.children : world.rootEntities();
                return Math.max(0, siblings.indexOf(entity));
            }
            case "SetSiblingIndex":
            case "SetAsFirstSibling":
            case "SetAsLastSibling": {
                const siblings = entity.parent?.children;
                if (siblings) {
                    const index = siblings.indexOf(entity);
                    if (index >= 0) siblings.splice(index, 1);
                    const target = name === "SetAsFirstSibling" ? 0 : name === "SetAsLastSibling" ? siblings.length : Math.max(0, Math.min(siblings.length, Math.trunc(toNumber(args[0] ?? 0))));
                    siblings.splice(target, 0, entity);
                }
                return undefined;
            }
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }

    private vectorArgs(args: VMValue[]): Vector3 {
        if (isVector(args[0])) return toVector(args[0]);
        return { x: toNumber(args[0] ?? 0), y: toNumber(args[1] ?? 0), z: toNumber(args[2] ?? 0) };
    }

    toString(): string {
        return `${this.entity.name} (Transform)`;
    }
}

// ---------------------------------------------------------------------------
// Physics components
// ---------------------------------------------------------------------------

export class RigidbodyHandle extends ComponentHandle<RigidBodyComponent> {
    get hostType() {
        return this.world.is2D ? "Rigidbody2D" : "Rigidbody";
    }

    protected typeNames(): string[] {
        return ["Rigidbody", "Rigidbody2D", "Component", "Object", "UnityEngine.Object"];
    }

    private get body() {
        return this.entity.body;
    }

    get(name: string): VMValue {
        const rb = this.component;
        const is2D = this.world.is2D;
        switch (name) {
            case "velocity":
            case "linearVelocity":
                return vec(this.body.velocity, is2D);
            case "angularVelocity":
                return is2D ? this.body.angularVelocity.z : vec({ x: this.body.angularVelocity.x * DEG2RAD, y: this.body.angularVelocity.y * DEG2RAD, z: this.body.angularVelocity.z * DEG2RAD });
            case "mass": return rb.mass;
            case "drag":
            case "linearDamping":
                return rb.linearDamping;
            case "angularDrag":
            case "angularDamping":
                return rb.angularDamping;
            case "useGravity": return rb.useGravity;
            case "gravityScale": return rb.gravityScale;
            case "isKinematic": return rb.bodyType === "kinematic";
            case "bodyType": return rb.bodyType === "dynamic" ? "Dynamic" : rb.bodyType === "kinematic" ? "Kinematic" : "Static";
            case "freezeRotation": return rb.freezeRotation;
            case "position": return vec(this.entity.world.position, is2D);
            case "rotation": return is2D ? eulerDegFromQuat(this.entity.world.rotation).z : quatToVM(this.entity.world.rotation);
            case "isGrounded": return this.body.grounded;
            case "detectCollisions": return true;
            case "simulated": return rb.enabled;
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const rb = this.component;
        switch (name) {
            case "velocity":
            case "linearVelocity": {
                const v = toVector(value, "velocity");
                this.body.velocity.x = v.x;
                this.body.velocity.y = v.y;
                this.body.velocity.z = this.world.is2D ? 0 : v.z;
                return;
            }
            case "angularVelocity":
                if (typeof value === "number") {
                    this.body.angularVelocity.z = value;
                } else {
                    const v = toVector(value, "angularVelocity");
                    this.body.angularVelocity.x = v.x * RAD2DEG;
                    this.body.angularVelocity.y = v.y * RAD2DEG;
                    this.body.angularVelocity.z = v.z * RAD2DEG;
                }
                return;
            case "mass":
                rb.mass = Math.max(0.001, toNumber(value, "mass"));
                return;
            case "drag":
            case "linearDamping":
                rb.linearDamping = Math.max(0, toNumber(value, "drag"));
                return;
            case "angularDrag":
            case "angularDamping":
                rb.angularDamping = Math.max(0, toNumber(value, "angularDrag"));
                return;
            case "useGravity":
                rb.useGravity = toBool(value);
                return;
            case "gravityScale":
                rb.gravityScale = toNumber(value, "gravityScale");
                return;
            case "isKinematic":
                rb.bodyType = toBool(value) ? "kinematic" : "dynamic";
                return;
            case "bodyType": {
                const text = String(value).toLowerCase();
                rb.bodyType = text.includes("kinematic") ? "kinematic" : text.includes("static") ? "static" : "dynamic";
                return;
            }
            case "freezeRotation":
                rb.freezeRotation = toBool(value);
                return;
            case "position":
                this.entity.setWorldPosition(toVector(value, "position"));
                this.world.transformChanged(this.entity);
                return;
            case "rotation":
                this.entity.setWorldRotation(typeof value === "number" ? quatFromEulerDeg({ x: 0, y: 0, z: value }) : toQuat(value));
                this.world.transformChanged(this.entity);
                return;
            case "detectCollisions":
            case "interpolation":
            case "collisionDetectionMode":
            case "constraints":
            case "sleepMode":
                return;
            case "simulated":
                rb.enabled = toBool(value);
                return;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        const rb = this.component;
        const body = this.body;
        const mass = Math.max(0.001, rb.mass);
        const is2D = this.world.is2D;
        switch (name) {
            case "AddForce":
            case "AddRelativeForce": {
                let force: Vector3;
                let mode: VMValue;
                if (isVector(args[0])) {
                    force = toVector(args[0], "force");
                    mode = args[1];
                } else {
                    force = { x: toNumber(args[0] ?? 0), y: toNumber(args[1] ?? 0), z: toNumber(args[2] ?? 0) };
                    mode = args[3];
                }
                if (name === "AddRelativeForce") force = rotateVec3(this.entity.world.rotation, force);
                if (is2D) force.z = 0;
                if (rb.bodyType !== "dynamic") return undefined;
                this.applyForce(force, typeof mode === "string" ? mode : "Force", mass);
                return undefined;
            }
            case "AddForceAtPosition":
                if (rb.bodyType === "dynamic") this.applyForce(toVector(args[0], "force"), typeof args[2] === "string" ? args[2] : "Force", mass);
                return undefined;
            case "AddExplosionForce": {
                const force = toNumber(args[0] ?? 0, "force");
                const center = toVector(args[1], "position");
                const radius = Math.max(0.001, toNumber(args[2] ?? 1, "radius"));
                const upwards = typeof args[3] === "number" ? args[3] : 0;
                const offset = subVec3(this.entity.world.position, center);
                const distance = lengthVec3(offset);
                if (distance > radius || rb.bodyType !== "dynamic") return undefined;
                const direction = normalizeVec3({ x: offset.x, y: offset.y + upwards, z: offset.z });
                const strength = force * (1 - distance / radius);
                this.applyForce({ x: direction.x * strength, y: direction.y * strength, z: is2D ? 0 : direction.z * strength }, typeof args[4] === "string" ? args[4] : "Impulse", mass);
                return undefined;
            }
            case "AddTorque":
            case "AddRelativeTorque": {
                if (rb.bodyType !== "dynamic") return undefined;
                const mode = typeof args[args.length - 1] === "string" ? String(args[args.length - 1]) : "Force";
                // No inertia tensor: mass stands in for it. Force/Acceleration act over one fixed step.
                const dt = this.world.fixedDeltaTime;
                const factor = mode === "Impulse" ? 1 / mass : mode === "VelocityChange" ? 1 : mode === "Acceleration" ? dt : dt / mass;
                const scaleFor = (value: number) => value * factor;
                if (typeof args[0] === "number" && args.length <= 2 && (is2D || typeof args[1] !== "number")) {
                    body.angularVelocity.z += scaleFor(args[0]) * RAD2DEG;
                } else if (typeof args[0] === "number") {
                    body.angularVelocity.x += scaleFor(toNumber(args[0])) * RAD2DEG;
                    body.angularVelocity.y += scaleFor(toNumber(args[1] ?? 0)) * RAD2DEG;
                    body.angularVelocity.z += scaleFor(toNumber(args[2] ?? 0)) * RAD2DEG;
                } else {
                    const torque = toVector(args[0], "torque");
                    body.angularVelocity.x += scaleFor(torque.x) * RAD2DEG;
                    body.angularVelocity.y += scaleFor(torque.y) * RAD2DEG;
                    body.angularVelocity.z += scaleFor(torque.z) * RAD2DEG;
                }
                return undefined;
            }
            case "MovePosition":
                this.entity.setWorldPosition(toVector(args[0], "position"));
                this.world.transformChanged(this.entity);
                return undefined;
            case "MoveRotation":
                this.entity.setWorldRotation(typeof args[0] === "number" ? quatFromEulerDeg({ x: 0, y: 0, z: args[0] }) : toQuat(args[0]));
                this.world.transformChanged(this.entity);
                return undefined;
            case "Sleep":
                body.velocity.x = body.velocity.y = body.velocity.z = 0;
                return undefined;
            case "WakeUp":
                return undefined;
            case "IsSleeping":
                return false;
            case "IsAwake":
                return true;
            case "GetPointVelocity":
            case "GetRelativePointVelocity":
                return vec(body.velocity, is2D);
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }

    private applyForce(force: Vector3, mode: string, mass: number) {
        const body = this.body;
        switch (mode) {
            case "Impulse":
                body.velocity.x += force.x / mass;
                body.velocity.y += force.y / mass;
                body.velocity.z += force.z / mass;
                break;
            case "VelocityChange":
                body.velocity.x += force.x;
                body.velocity.y += force.y;
                body.velocity.z += force.z;
                break;
            case "Acceleration":
                body.force.x += force.x * mass;
                body.force.y += force.y * mass;
                body.force.z += force.z * mass;
                break;
            default:
                body.force.x += force.x;
                body.force.y += force.y;
                body.force.z += force.z;
        }
    }
}

export class BoundsHandle implements HostObject {
    readonly hostType = "Bounds";
    constructor(readonly center: Vector3, readonly size: Vector3) {}

    get(name: string): VMValue {
        const extents = { x: this.size.x / 2, y: this.size.y / 2, z: this.size.z / 2 };
        switch (name) {
            case "center": return vec(this.center);
            case "size": return vec(this.size);
            case "extents": return vec(extents);
            case "min": return vec({ x: this.center.x - extents.x, y: this.center.y - extents.y, z: this.center.z - extents.z });
            case "max": return vec({ x: this.center.x + extents.x, y: this.center.y + extents.y, z: this.center.z + extents.z });
            default: return hostError(`Bounds üzerinde '${name}' yok.`, "MissingMemberException");
        }
    }

    set(name: string): void {
        hostError(`Bounds.${name} salt okunurdur.`, "InvalidOperationException");
    }

    call(name: string, args: VMValue[]): VMValue {
        const min = { x: this.center.x - this.size.x / 2, y: this.center.y - this.size.y / 2, z: this.center.z - this.size.z / 2 };
        const max = { x: this.center.x + this.size.x / 2, y: this.center.y + this.size.y / 2, z: this.center.z + this.size.z / 2 };
        switch (name) {
            case "Contains": {
                const p = toVector(args[0], "nokta");
                return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
            }
            case "Intersects": {
                const other = args[0];
                if (!(other instanceof BoundsHandle)) return false;
                const omin = { x: other.center.x - other.size.x / 2, y: other.center.y - other.size.y / 2, z: other.center.z - other.size.z / 2 };
                const omax = { x: other.center.x + other.size.x / 2, y: other.center.y + other.size.y / 2, z: other.center.z + other.size.z / 2 };
                return min.x <= omax.x && max.x >= omin.x && min.y <= omax.y && max.y >= omin.y && min.z <= omax.z && max.z >= omin.z;
            }
            case "ClosestPoint": {
                const p = toVector(args[0], "nokta");
                return vec({ x: Math.max(min.x, Math.min(max.x, p.x)), y: Math.max(min.y, Math.min(max.y, p.y)), z: Math.max(min.z, Math.min(max.z, p.z)) });
            }
            case "ToString": return this.toString();
            default: return hostError(`Bounds.${name}() desteklenmiyor.`, "MissingMemberException");
        }
    }

    toString() {
        return `Center: ${vec(this.center).toString()}, Extents: ${vec({ x: this.size.x / 2, y: this.size.y / 2, z: this.size.z / 2 }).toString()}`;
    }
}

export class ColliderHandle extends ComponentHandle<ColliderComponent> {
    get hostType() {
        const shape = this.component.shape;
        if (this.world.is2D) return shape === "box" ? "BoxCollider2D" : "CircleCollider2D";
        return shape === "box" ? "BoxCollider" : "SphereCollider";
    }

    protected typeNames(): string[] {
        const names = ["Collider", "Collider2D", "Component", "Object", "UnityEngine.Object", this.hostType];
        if (this.component.shape === "box") names.push("BoxCollider", "BoxCollider2D");
        else names.push("SphereCollider", "CircleCollider2D");
        return names;
    }

    bounds(): BoundsHandle {
        const trs = this.entity.world;
        const c = this.component;
        const center = localToWorldPoint(trs, c.offset);
        if (c.shape !== "box") {
            const s = Math.max(Math.abs(trs.scale.x), Math.abs(trs.scale.y), this.world.is2D ? 0 : Math.abs(trs.scale.z));
            const d = c.radius * s * 2;
            return new BoundsHandle(center, { x: d, y: d, z: this.world.is2D ? 0 : d });
        }
        const half = { x: (c.size.x * Math.abs(trs.scale.x)) / 2, y: (c.size.y * Math.abs(trs.scale.y)) / 2, z: (c.size.z * Math.abs(trs.scale.z)) / 2 };
        const axes = [rotateVec3(trs.rotation, { x: 1, y: 0, z: 0 }), rotateVec3(trs.rotation, { x: 0, y: 1, z: 0 }), rotateVec3(trs.rotation, { x: 0, y: 0, z: 1 })];
        const extent = (key: "x" | "y" | "z") => Math.abs(axes[0][key]) * half.x + Math.abs(axes[1][key]) * half.y + Math.abs(axes[2][key]) * half.z;
        return new BoundsHandle(center, { x: extent("x") * 2, y: extent("y") * 2, z: this.world.is2D ? 0 : extent("z") * 2 });
    }

    get(name: string): VMValue {
        const c = this.component;
        const is2D = this.world.is2D;
        switch (name) {
            case "isTrigger": return c.isTrigger;
            case "size": return vec(c.size, is2D);
            case "radius": return c.radius;
            case "center":
            case "offset":
                return vec(c.offset, is2D);
            case "bounds": return this.bounds();
            case "attachedRigidbody": {
                for (let cursor: RuntimeEntity | null = this.entity; cursor; cursor = cursor.parent) {
                    if (cursor.rigidBody) return this.world.componentHandle(cursor, cursor.rigidBody);
                }
                return null;
            }
            case "friction": return c.friction;
            case "bounciness": return c.bounciness;
            case "sharedMaterial":
            case "material":
                return new PhysicsMaterialHandle(c);
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "isTrigger":
                c.isTrigger = toBool(value);
                return;
            case "size": {
                const v = toVector(value, "size");
                c.size = { x: Math.max(0.001, Math.abs(v.x)), y: Math.max(0.001, Math.abs(v.y)), z: this.world.is2D ? c.size.z : Math.max(0.001, Math.abs(v.z)) };
                return;
            }
            case "radius":
                c.radius = Math.max(0.001, toNumber(value, "radius"));
                return;
            case "center":
            case "offset":
                c.offset = toVector(value, "offset");
                return;
            case "friction":
                c.friction = Math.max(0, toNumber(value));
                return;
            case "bounciness":
                c.bounciness = Math.max(0, Math.min(1, toNumber(value)));
                return;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        switch (name) {
            case "ClosestPoint":
            case "ClosestPointOnBounds": {
                const point = toVector(args[0], "nokta");
                const closest = this.world.physics.closestPoint(this.entity.id, point);
                return vec(closest ?? point, this.world.is2D);
            }
            case "OverlapPoint": {
                const point = toVector(args[0], "nokta");
                return this.world.physics.overlapSphere(point, 0.0005, true).includes(this.entity.id);
            }
            case "IsTouching": {
                const other = args[0];
                if (!(other instanceof ColliderHandle)) return false;
                return this.world.areTouching(this.entity.id, other.entity.id);
            }
            case "Raycast": {
                const ray = args[0] instanceof RayHandle ? args[0].ray : null;
                if (!ray) return false;
                const maxDistance = typeof args[2] === "number" ? args[2] : Infinity;
                const hits = this.world.physics.raycastAll(ray.origin, ray.direction, maxDistance, true).filter((hit) => hit.entityId === this.entity.id);
                const outIndex = refs?.findIndex((ref) => ref) ?? -1;
                if (outIndex >= 0) refs![outIndex]!.set(hits[0] ? this.world.raycastHit(hits[0]) : RaycastHitHandle.miss(this.world));
                return hits.length > 0;
            }
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }
}

class PhysicsMaterialHandle implements HostObject {
    readonly hostType = "PhysicMaterial";
    constructor(readonly collider: ColliderComponent) {}
    get(name: string): VMValue {
        if (name === "bounciness") return this.collider.bounciness;
        if (name === "friction" || name === "dynamicFriction" || name === "staticFriction") return this.collider.friction;
        return hostError(`PhysicMaterial.${name} desteklenmiyor.`, "MissingMemberException");
    }
    set(name: string, value: VMValue) {
        if (name === "bounciness") this.collider.bounciness = Math.max(0, Math.min(1, toNumber(value)));
        else if (name === "friction" || name === "dynamicFriction" || name === "staticFriction") this.collider.friction = Math.max(0, toNumber(value));
        else hostError(`PhysicMaterial.${name} desteklenmiyor.`, "MissingMemberException");
    }
    call(name: string): VMValue {
        return hostError(`PhysicMaterial.${name}() desteklenmiyor.`, "MissingMemberException");
    }
    toString() {
        return "PhysicMaterial";
    }
}

// ---------------------------------------------------------------------------
// Rendering components
// ---------------------------------------------------------------------------

class MaterialHandle implements HostObject {
    readonly hostType = "Material";
    constructor(readonly world: RuntimeWorld, readonly entity: RuntimeEntity, readonly component: MeshRendererComponent | SpriteRendererComponent) {}

    isAlive() {
        return !this.entity.destroyed;
    }

    private readColor(): VMColor {
        const c = this.component;
        return c.type === "meshRenderer" ? colorToVM(c.material.color, c.material.opacity) : colorToVM(c.color, c.opacity);
    }

    private writeColor(value: VMValue) {
        const color = toColor(value);
        const c = this.component;
        if (c.type === "meshRenderer") {
            c.material.color = color.toHex();
            c.material.opacity = Math.max(0, Math.min(1, color.a));
        } else {
            c.color = color.toHex();
            c.opacity = Math.max(0, Math.min(1, color.a));
        }
        this.world.markRender(this.entity);
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "color": return this.readColor();
            case "name": return "Material";
            case "mainTextureScale": return c.type === "meshRenderer" ? new Vec3(c.material.tiling, c.material.tiling, 0, true) : new Vec3(1, 1, 0, true);
            case "shader": return "Standard";
            default: return hostError(`Material.${name} desteklenmiyor.`, "MissingMemberException");
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "color":
                this.writeColor(value);
                return;
            case "mainTextureScale":
                if (c.type === "meshRenderer" && value instanceof Vec3) {
                    c.material.tiling = Math.max(0.01, value.x);
                    this.world.markRender(this.entity);
                }
                return;
            default:
                hostError(`Material.${name} desteklenmiyor.`, "MissingMemberException");
        }
    }

    call(name: string, args: VMValue[]): VMValue {
        const c = this.component;
        switch (name) {
            case "SetColor": {
                const property = String(args[0] ?? "_Color");
                if (/emission/i.test(property) && c.type === "meshRenderer") {
                    const color = toColor(args[1]);
                    c.material.emissive = color.toHex();
                    c.material.emissiveIntensity = Math.max(c.material.emissiveIntensity, 1);
                    this.world.markRender(this.entity);
                } else {
                    this.writeColor(args[1]);
                }
                return undefined;
            }
            case "GetColor":
                return /emission/i.test(String(args[0] ?? "")) && c.type === "meshRenderer" ? colorToVM(c.material.emissive) : this.readColor();
            case "SetFloat": {
                const property = String(args[0] ?? "");
                const value = toNumber(args[1] ?? 0);
                if (c.type === "meshRenderer") {
                    if (/metal/i.test(property)) c.material.metallic = Math.max(0, Math.min(1, value));
                    else if (/gloss|smooth/i.test(property)) c.material.roughness = Math.max(0, Math.min(1, 1 - value));
                    else if (/rough/i.test(property)) c.material.roughness = Math.max(0, Math.min(1, value));
                    this.world.markRender(this.entity);
                }
                return undefined;
            }
            case "EnableKeyword":
            case "DisableKeyword":
                return undefined;
            case "ToString":
                return "Material";
            default:
                return hostError(`Material.${name}() desteklenmiyor.`, "MissingMemberException");
        }
    }

    toString() {
        return "Material";
    }
}

export class SpriteRendererHandle extends ComponentHandle<SpriteRendererComponent> {
    readonly hostType = "SpriteRenderer";

    protected typeNames(): string[] {
        return ["SpriteRenderer", "Renderer", "Component", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "color": return colorToVM(c.color, c.opacity);
            case "flipX": return c.flipX;
            case "flipY": return c.flipY;
            case "sortingOrder": return c.sortingLayer;
            case "sprite":
            case "shape":
                return c.shape;
            case "material":
            case "sharedMaterial":
                return new MaterialHandle(this.world, this.entity, c);
            case "bounds": {
                const trs = this.entity.world;
                return new BoundsHandle(trs.position, { x: Math.abs(trs.scale.x), y: Math.abs(trs.scale.y), z: 0 });
            }
            case "isVisible": return c.enabled && this.entity.activeInHierarchy;
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "color": {
                const color = toColor(value);
                c.color = color.toHex();
                c.opacity = Math.max(0, Math.min(1, color.a));
                break;
            }
            case "flipX":
                c.flipX = toBool(value);
                break;
            case "flipY":
                c.flipY = toBool(value);
                break;
            case "sortingOrder":
                c.sortingLayer = Math.trunc(toNumber(value));
                break;
            case "sprite":
            case "shape": {
                const shape = String(value);
                if (["square", "circle", "triangle", "roundedSquare", "diamond", "hexagon", "star"].includes(shape)) c.shape = shape as SpriteRendererComponent["shape"];
                else {
                    const texture = this.world.project.textures.find((item) => item.name === shape || item.id === shape);
                    if (texture) c.textureId = texture.id;
                }
                break;
            }
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }
}

export class MeshRendererHandle extends ComponentHandle<MeshRendererComponent> {
    readonly hostType = "MeshRenderer";

    protected typeNames(): string[] {
        return ["MeshRenderer", "Renderer", "MeshFilter", "Component", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "material":
            case "sharedMaterial":
                return new MaterialHandle(this.world, this.entity, c);
            case "mesh":
            case "sharedMesh":
                return c.mesh;
            case "shadowCastingMode": return c.castShadows ? "On" : "Off";
            case "receiveShadows": return c.receiveShadows;
            case "isVisible": return c.enabled && this.entity.activeInHierarchy;
            case "bounds": {
                const trs = this.entity.world;
                return new BoundsHandle(trs.position, { x: Math.abs(trs.scale.x), y: Math.abs(trs.scale.y), z: Math.abs(trs.scale.z) });
            }
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "mesh":
            case "sharedMesh": {
                const mesh = String(value).toLowerCase();
                if (["cube", "sphere", "plane", "capsule", "cylinder", "cone", "torus"].includes(mesh)) c.mesh = mesh as MeshRendererComponent["mesh"];
                break;
            }
            case "shadowCastingMode":
                c.castShadows = String(value) !== "Off";
                break;
            case "receiveShadows":
                c.receiveShadows = toBool(value);
                break;
            case "material":
            case "sharedMaterial":
                if (value instanceof MaterialHandle && value.component.type === "meshRenderer") c.material = { ...value.component.material };
                break;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }
}

export class CameraHandle extends ComponentHandle<CameraComponent> {
    readonly hostType = "Camera";

    private view() {
        return this.world.cameraView(this.entity, this.component);
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "fieldOfView": return c.fieldOfView;
            case "orthographicSize": return c.orthographicSize;
            case "orthographic": return c.projection === "orthographic";
            case "nearClipPlane": return c.nearClip;
            case "farClipPlane": return c.farClip;
            case "backgroundColor": return colorToVM(c.backgroundColor ?? this.world.scene.settings.background.color);
            case "aspect": {
                const size = this.world.screenSize();
                return size.width / Math.max(1, size.height);
            }
            case "pixelWidth": return this.world.screenSize().width;
            case "pixelHeight": return this.world.screenSize().height;
            case "depth": return c.primary ? 0 : -1;
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "fieldOfView":
                c.fieldOfView = Math.max(1, Math.min(179, toNumber(value)));
                break;
            case "orthographicSize":
                c.orthographicSize = Math.max(0.01, toNumber(value));
                break;
            case "orthographic":
                c.projection = toBool(value) ? "orthographic" : "perspective";
                break;
            case "nearClipPlane":
                c.nearClip = Math.max(0.001, toNumber(value));
                break;
            case "farClipPlane":
                c.farClip = Math.max(c.nearClip + 0.01, toNumber(value));
                break;
            case "backgroundColor":
                c.backgroundColor = toColor(value).toHex();
                break;
            case "depth":
                c.primary = toNumber(value) >= 0;
                break;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        switch (name) {
            case "ScreenToWorldPoint":
                return vec(screenToWorld(this.view(), toVector(args[0], "ekran noktası")));
            case "WorldToScreenPoint":
                return vec(worldToScreen(this.view(), toVector(args[0], "dünya noktası")));
            case "ViewportToWorldPoint":
                return vec(viewportToWorld(this.view(), toVector(args[0], "viewport noktası")));
            case "WorldToViewportPoint":
                return vec(worldToViewport(this.view(), toVector(args[0], "dünya noktası")));
            case "ScreenToViewportPoint":
                return vec(screenToViewport(this.view(), toVector(args[0], "ekran noktası")));
            case "ViewportToScreenPoint":
                return vec(viewportToScreen(this.view(), toVector(args[0], "viewport noktası")));
            case "ScreenPointToRay":
                return new RayHandle(screenRay(this.view(), toVector(args[0], "ekran noktası")));
            case "ViewportPointToRay":
                return new RayHandle(viewportRay(this.view(), toVector(args[0], "viewport noktası")));
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }
}

export class LightHandle extends ComponentHandle<LightComponent> {
    readonly hostType = "Light";

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "color": return colorToVM(c.color);
            case "intensity": return c.intensity;
            case "range": return c.range;
            case "spotAngle": return c.spotAngle;
            case "type": return c.lightType === "directional" ? "Directional" : c.lightType === "point" ? "Point" : "Spot";
            case "shadows": return c.castShadows ? "Soft" : "None";
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "color":
                c.color = toColor(value).toHex();
                break;
            case "intensity":
                c.intensity = Math.max(0, toNumber(value));
                break;
            case "range":
                c.range = Math.max(0.01, toNumber(value));
                break;
            case "spotAngle":
                c.spotAngle = Math.max(1, Math.min(179, toNumber(value)));
                break;
            case "shadows":
                c.castShadows = String(value) !== "None";
                break;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }
}

export class ParticleSystemHandle extends ComponentHandle<ParticleSystemComponent> {
    readonly hostType = "ParticleSystem";

    private get emitter() {
        return this.world.emitterOf(this.entity);
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "isPlaying": return this.emitter?.playing ?? false;
            case "isStopped": return !(this.emitter?.isAlive ?? false);
            case "isEmitting": return this.emitter?.playing ?? false;
            case "particleCount": return this.emitter?.count ?? 0;
            case "main":
            case "emission":
            case "shape":
                return this;
            case "startColor": return colorToVM(c.startColor);
            case "endColor": return colorToVM(c.endColor);
            case "startSpeed": return c.startSpeed;
            case "startLifetime": return c.lifetime;
            case "startSize": return c.startSize;
            case "endSize": return c.endSize;
            case "loop": return c.loop;
            case "duration": return c.duration;
            case "maxParticles": return c.maxParticles;
            case "gravityModifier": return c.gravityModifier;
            case "rateOverTime":
            case "emissionRate":
                return c.emissionRate;
            case "angle": return c.spread;
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "startColor":
                c.startColor = toColor(value).toHex();
                break;
            case "endColor":
                c.endColor = toColor(value).toHex();
                break;
            case "startSpeed":
                c.startSpeed = toNumber(value);
                break;
            case "startLifetime":
                c.lifetime = Math.max(0.01, toNumber(value));
                break;
            case "startSize":
                c.startSize = Math.max(0, toNumber(value));
                break;
            case "endSize":
                c.endSize = Math.max(0, toNumber(value));
                break;
            case "loop":
                c.loop = toBool(value);
                break;
            case "duration":
                c.duration = Math.max(0.01, toNumber(value));
                break;
            case "gravityModifier":
                c.gravityModifier = toNumber(value);
                break;
            case "rateOverTime":
            case "emissionRate":
                c.emissionRate = Math.max(0, toNumber(value));
                break;
            case "angle":
                c.spread = Math.max(0, Math.min(180, toNumber(value)));
                break;
            case "enabled":
                this.componentSet(name, value);
                break;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        const emitter = this.world.emitterOf(this.entity, true);
        switch (name) {
            case "Play":
                emitter?.play();
                return undefined;
            case "Stop":
                emitter?.stop(args.length > 1 && String(args[1]).includes("Clear"));
                return undefined;
            case "Pause":
                if (emitter) emitter.playing = false;
                return undefined;
            case "Clear":
                emitter?.clear();
                return undefined;
            case "Emit":
                emitter?.emit(Math.max(0, Math.min(1000, Math.trunc(toNumber(args[0] ?? 1)))), this.entity.world);
                return undefined;
            case "IsAlive":
                return emitter?.isAlive ?? false;
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }
}

export class AudioSourceHandle extends ComponentHandle<AudioSourceComponent> {
    readonly hostType = "AudioSource";
    private playedAt = -Infinity;

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "volume": return c.volume;
            case "pitch": return c.pitch;
            case "clip": return c.clip;
            case "isPlaying": return this.world.realtime - this.playedAt < 0.35;
            case "playOnAwake": return c.playOnStart;
            case "mute": return this.world.audioMuted;
            case "loop": return false;
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "volume":
                c.volume = Math.max(0, Math.min(1, toNumber(value)));
                return;
            case "pitch":
                c.pitch = Math.max(0.1, Math.min(3, toNumber(value)));
                return;
            case "clip":
                c.clip = String(value ?? c.clip) as AudioSourceComponent["clip"];
                return;
            case "playOnAwake":
                c.playOnStart = toBool(value);
                return;
            case "mute":
            case "loop":
                return;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        const c = this.component;
        switch (name) {
            case "Play":
            case "PlayDelayed":
                if (c.enabled) {
                    this.world.playSound(c.clip, c.volume, c.pitch);
                    this.playedAt = this.world.realtime;
                }
                return undefined;
            case "PlayOneShot": {
                const clip = typeof args[0] === "string" ? args[0] : c.clip;
                const scale = typeof args[1] === "number" ? args[1] : 1;
                this.world.playSound(clip, c.volume * scale, c.pitch);
                this.playedAt = this.world.realtime;
                return undefined;
            }
            case "Stop":
            case "Pause":
            case "UnPause":
                return undefined;
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }
}

export class TextHandle extends ComponentHandle<UITextComponent> {
    readonly hostType = "Text";

    protected typeNames(): string[] {
        return ["Text", "UIText", "TextMeshProUGUI", "TextMeshPro", "TMP_Text", "TextMesh", "Graphic", "Component", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        const c = this.component;
        switch (name) {
            case "text": return c.text;
            case "color": return colorToVM(c.color);
            case "fontSize": return c.fontSize;
            case "fontStyle": return c.bold ? "Bold" : "Normal";
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "text":
                c.text = (value === null || value === undefined ? "" : typeof value === "string" ? value : this.world.display(value)).slice(0, 2000);
                break;
            case "color":
                c.color = toColor(value).toHex();
                break;
            case "fontSize":
                c.fontSize = Math.max(4, Math.min(200, toNumber(value)));
                break;
            case "fontStyle":
                c.bold = String(value).includes("Bold");
                break;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
        this.changed();
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        if (name === "SetText") {
            this.set("text", args[0] ?? "");
            return undefined;
        }
        return super.call(name, args, typeArgs, refs);
    }
}

// ---------------------------------------------------------------------------
// Queries: rays, hits, collisions
// ---------------------------------------------------------------------------

export class RayHandle implements HostObject {
    readonly hostType = "Ray";
    constructor(readonly ray: WorldRay) {}

    isType(name: string) {
        return name === "Ray" || name === "Ray2D";
    }

    get(name: string): VMValue {
        if (name === "origin") return vec(this.ray.origin);
        if (name === "direction") return vec(this.ray.direction);
        return hostError(`Ray.${name} yok.`, "MissingMemberException");
    }

    set(name: string, value: VMValue): void {
        if (name === "origin") this.ray.origin = toVector(value);
        else if (name === "direction") this.ray.direction = normalizeVec3(toVector(value));
        else hostError(`Ray.${name} yok.`, "MissingMemberException");
    }

    call(name: string, args: VMValue[]): VMValue {
        if (name === "GetPoint") {
            const d = toNumber(args[0] ?? 0, "mesafe");
            return vec({ x: this.ray.origin.x + this.ray.direction.x * d, y: this.ray.origin.y + this.ray.direction.y * d, z: this.ray.origin.z + this.ray.direction.z * d });
        }
        if (name === "ToString") return this.toString();
        return hostError(`Ray.${name}() yok.`, "MissingMemberException");
    }

    toString() {
        return `Origin: ${vec(this.ray.origin).toString()}, Dir: ${vec(this.ray.direction).toString()}`;
    }
}

export class RaycastHitHandle implements HostObject {
    readonly hostType: string;
    constructor(
        readonly world: RuntimeWorld,
        readonly entity: RuntimeEntity | null,
        readonly point: Vector3,
        readonly normal: Vector3,
        readonly distance: number,
    ) {
        this.hostType = world.is2D ? "RaycastHit2D" : "RaycastHit";
    }

    static miss(world: RuntimeWorld) {
        return new RaycastHitHandle(world, null, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0);
    }

    isType(name: string) {
        return name === "RaycastHit" || name === "RaycastHit2D";
    }

    truthy() {
        return this.entity !== null && !this.entity.destroyed;
    }

    get(name: string): VMValue {
        const entity = this.entity && !this.entity.destroyed ? this.entity : null;
        const is2D = this.world.is2D;
        switch (name) {
            case "point": return vec(this.point, is2D);
            case "normal": return vec(this.normal, is2D);
            case "distance": return this.distance;
            case "fraction": return this.distance;
            case "centroid": return vec(this.point, is2D);
            case "collider": return entity?.collider ? this.world.componentHandle(entity, entity.collider) : null;
            case "rigidbody": return entity?.rigidBody ? this.world.componentHandle(entity, entity.rigidBody) : null;
            case "transform": return entity ? this.world.transformHandle(entity) : null;
            case "gameObject": return entity ? this.world.gameObjectHandle(entity) : null;
            default: return hostError(`${this.hostType}.${name} yok.`, "MissingMemberException");
        }
    }

    set(name: string): void {
        hostError(`${this.hostType}.${name} salt okunurdur.`, "InvalidOperationException");
    }

    call(name: string): VMValue {
        if (name === "ToString") return this.toString();
        return hostError(`${this.hostType}.${name}() yok.`, "MissingMemberException");
    }

    toString() {
        return this.entity ? `${this.hostType}(${this.entity.name})` : `${this.hostType}(boş)`;
    }
}

class ContactPointHandle implements HostObject {
    readonly hostType = "ContactPoint";
    constructor(readonly world: RuntimeWorld, readonly point: Vector3, readonly normal: Vector3, readonly separation: number, readonly other: RuntimeEntity, readonly self: RuntimeEntity) {}

    get(name: string): VMValue {
        const is2D = this.world.is2D;
        switch (name) {
            case "point": return vec(this.point, is2D);
            case "normal": return vec(this.normal, is2D);
            case "separation": return -this.separation;
            case "otherCollider": return this.other.collider && !this.other.destroyed ? this.world.componentHandle(this.other, this.other.collider) : null;
            case "thisCollider": return this.self.collider && !this.self.destroyed ? this.world.componentHandle(this.self, this.self.collider) : null;
            default: return hostError(`ContactPoint.${name} yok.`, "MissingMemberException");
        }
    }

    set(name: string): void {
        hostError(`ContactPoint.${name} salt okunurdur.`, "InvalidOperationException");
    }

    call(name: string): VMValue {
        return hostError(`ContactPoint.${name}() yok.`, "MissingMemberException");
    }

    toString() {
        return "ContactPoint";
    }
}

/** `Collision` / `Collision2D` passed to OnCollisionEnter & co. */
export class CollisionHandle implements HostObject {
    readonly hostType: string;
    private readonly contact: ContactPointHandle;

    constructor(
        readonly world: RuntimeWorld,
        readonly self: RuntimeEntity,
        readonly other: RuntimeEntity,
        point: Vector3,
        /** Points from the other object towards this one (Unity convention). */
        readonly normal: Vector3,
        readonly penetration: number,
        readonly relativeVelocity: Vector3,
    ) {
        this.hostType = world.is2D ? "Collision2D" : "Collision";
        this.contact = new ContactPointHandle(world, point, normal, penetration, other, self);
    }

    isType(name: string) {
        return name === "Collision" || name === "Collision2D";
    }

    get(name: string): VMValue {
        const other = this.other;
        const alive = !other.destroyed;
        switch (name) {
            case "gameObject": return alive ? this.world.gameObjectHandle(other) : null;
            case "transform": return alive ? this.world.transformHandle(other) : null;
            case "collider": return alive && other.collider ? this.world.componentHandle(other, other.collider) : null;
            case "otherCollider": return this.self.collider && !this.self.destroyed ? this.world.componentHandle(this.self, this.self.collider) : null;
            case "rigidbody":
            case "otherRigidbody":
                return alive && other.rigidBody ? this.world.componentHandle(other, other.rigidBody) : null;
            case "relativeVelocity": return vec(this.relativeVelocity, this.world.is2D);
            case "contactCount": return 1;
            case "contacts": return new VMList([this.contact], "Array");
            case "impulse": {
                const mass = this.self.rigidBody?.mass ?? 1;
                return vec({ x: this.normal.x * lengthVec3(this.relativeVelocity) * mass, y: this.normal.y * lengthVec3(this.relativeVelocity) * mass, z: this.normal.z * lengthVec3(this.relativeVelocity) * mass }, this.world.is2D);
            }
            default: return hostError(`${this.hostType}.${name} yok.`, "MissingMemberException");
        }
    }

    set(name: string): void {
        hostError(`${this.hostType}.${name} salt okunurdur.`, "InvalidOperationException");
    }

    call(name: string, args: VMValue[], typeArgs: string[]): VMValue {
        switch (name) {
            case "GetContact": return this.contact;
            case "GetContacts": {
                const target = args[0];
                if (target instanceof VMList) {
                    target.items.length = 0;
                    target.items.push(this.contact);
                }
                return 1;
            }
            case "ToString": return this.toString();
            case "CompareTag": return this.other.tag === String(args[0] ?? "");
            case "GetComponent": return this.other.destroyed ? null : this.world.getComponent(this.other, typeNameFrom(args, typeArgs));
            default: return hostError(`${this.hostType}.${name}() yok.`, "MissingMemberException");
        }
    }

    toString() {
        return `${this.hostType}(${this.other.name})`;
    }
}

export class SceneHandle implements HostObject {
    readonly hostType = "Scene";
    constructor(readonly name: string, readonly buildIndex: number) {}

    get(name: string): VMValue {
        switch (name) {
            case "name": return this.name;
            case "buildIndex": return this.buildIndex;
            case "isLoaded": return true;
            case "path": return `Scenes/${this.name}.scene`;
            case "rootCount": return 0;
            default: return hostError(`Scene.${name} yok.`, "MissingMemberException");
        }
    }

    set(name: string): void {
        hostError(`Scene.${name} salt okunurdur.`, "InvalidOperationException");
    }

    call(name: string, args: VMValue[]): VMValue {
        if (name === "ToString") return this.name;
        if (name === "IsValid") return true;
        if (name === "Equals") return args[0] instanceof SceneHandle && args[0].buildIndex === this.buildIndex;
        return hostError(`Scene.${name}() yok.`, "MissingMemberException");
    }

    toString() {
        return this.name;
    }
}

export class TouchHandle implements HostObject {
    readonly hostType = "Touch";
    constructor(readonly position: Vector3, readonly delta: Vector3, readonly phase: string) {}

    get(name: string): VMValue {
        switch (name) {
            case "position":
            case "rawPosition":
                return new Vec3(this.position.x, this.position.y, 0, true);
            case "deltaPosition": return new Vec3(this.delta.x, this.delta.y, 0, true);
            case "phase": return this.phase;
            case "fingerId": return 0;
            case "tapCount": return 1;
            case "pressure": return 1;
            default: return hostError(`Touch.${name} yok.`, "MissingMemberException");
        }
    }

    set(name: string): void {
        hostError(`Touch.${name} salt okunurdur.`, "InvalidOperationException");
    }

    call(name: string): VMValue {
        return hostError(`Touch.${name}() yok.`, "MissingMemberException");
    }

    toString() {
        return `Touch(${this.phase})`;
    }
}

/** True when a VM value refers to a live engine object. */
export function liveEntityOf(value: VMValue): RuntimeEntity | null {
    if (value instanceof ScriptObject) {
        const binding = value.behaviour as { entity?: RuntimeEntity } | null;
        return binding?.entity && !binding.entity.destroyed ? binding.entity : null;
    }
    if (value instanceof EntityHandle) return value.entity.destroyed ? null : value.entity;
    return null;
}

export { EntityHandle, ComponentHandle, MaterialHandle };
