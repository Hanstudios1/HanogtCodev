/**
 * Hanogt Physics — impulse based "arcade" rigid-body physics.
 *
 * Supports boxes (oriented, SAT), spheres and 2D circles/boxes, tilemaps,
 * triggers, friction, restitution, kinematic bodies, grounded detection,
 * raycasts and overlap queries. Collisions change linear velocity only;
 * rotation is integrated from angular velocity (and spheres roll visually).
 */
import { conjugateQuat, mat3FromQuat, rotateVec3, type Quat, type TRS } from "../math";
import { solidTiles } from "../tilemap";
import type { ColliderComponent, GameDimension, RigidBodyComponent, TilemapComponent, Vector3 } from "../types";

export interface BodyRuntime {
    velocity: Vector3;
    angularVelocity: Vector3;
    grounded: boolean;
    /** Ground normal of the last supporting contact. */
    groundNormal: Vector3;
    /** Accumulated force for the next step (AddForce with ForceMode.Force/Acceleration). */
    force: Vector3;
    sleeping?: boolean;
}

export interface PhysicsEntity {
    id: string;
    rigidBody: RigidBodyComponent | null;
    collider: ColliderComponent | null;
    /** Solid tiles of a tilemap collide like static boxes. */
    tilemap?: TilemapComponent | null;
    /** Bumped whenever tiles change at runtime (invalidates cached tile shapes). */
    tilemapRevision?: number;
    activeInHierarchy: boolean;
    body: BodyRuntime;
}

export interface PhysicsAdapter {
    entities(): Iterable<PhysicsEntity>;
    worldTRS(entity: PhysicsEntity): TRS;
    translate(entity: PhysicsEntity, delta: Vector3): void;
    rotateEuler(entity: PhysicsEntity, deltaDegrees: Vector3): void;
}

type Shape =
    | { kind: "sphere"; center: Vector3; radius: number }
    | { kind: "box"; center: Vector3; axes: [Vector3, Vector3, Vector3]; half: [number, number, number] };

/** Faces of a tile that border empty space (in the box's local axes). */
interface OpenFaces {
    left: boolean;
    right: boolean;
    bottom: boolean;
    top: boolean;
}

interface ShapeEntry {
    entity: PhysicsEntity;
    shape: Shape;
    min: Vector3;
    max: Vector3;
    type: "dynamic" | "kinematic" | "static";
    invMass: number;
    trigger: boolean;
    friction: number;
    bounciness: number;
    hasBody: boolean;
    /** Tile boxes only push bodies out through open faces (no snagging on seams between tiles). */
    open?: OpenFaces;
}

export interface ContactPoint {
    point: Vector3;
    /** From entity `a` towards entity `b`. */
    normal: Vector3;
    penetration: number;
}

export interface ContactInfo {
    a: string;
    b: string;
    trigger: boolean;
    normal: Vector3;
    penetration: number;
    point: Vector3;
    relativeVelocity: Vector3;
    /** Every contact of the pair in this step (several when a body touches many tiles). */
    contacts: ContactPoint[];
}

export interface PhysicsEvents {
    enter: ContactInfo[];
    stay: ContactInfo[];
    exit: ContactInfo[];
}

export interface RaycastResult {
    entityId: string;
    point: Vector3;
    normal: Vector3;
    distance: number;
}

const EPS = 1e-9;
const SLOP = 0.002;
const CORRECTION = 0.85;
const REST_VELOCITY = 0.6;

const v = (x = 0, y = 0, z = 0): Vector3 => ({ x, y, z });
const add = (a: Vector3, b: Vector3) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vector3, b: Vector3) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: Vector3, s: number) => v(a.x * s, a.y * s, a.z * s);
const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vector3, b: Vector3) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const length = (a: Vector3) => Math.hypot(a.x, a.y, a.z);
const normalize = (a: Vector3) => {
    const len = length(a);
    return len > EPS ? scale(a, 1 / len) : v();
};

function pairKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export class PhysicsWorld {
    gravity: Vector3 = { x: 0, y: -9.81, z: 0 };
    solverIterations = 3;
    private previousPairs = new Map<string, ContactInfo>();
    private shapes: ShapeEntry[] = [];
    private tileCache = new WeakMap<PhysicsEntity, { key: string; tilemap: TilemapComponent; entries: ShapeEntry[] }>();

    private readonly adapter: PhysicsAdapter;
    dimension: GameDimension;
    constructor(adapter: PhysicsAdapter, dimension: GameDimension) {
        this.adapter = adapter;
        this.dimension = dimension;
    }

    reset() {
        this.previousPairs.clear();
        this.shapes = [];
        this.tileCache = new WeakMap();
    }

    private bodyType(entity: PhysicsEntity): "dynamic" | "kinematic" | "static" {
        const rb = entity.rigidBody;
        if (!rb || !rb.enabled) return "static";
        return rb.bodyType;
    }

    private buildShape(entity: PhysicsEntity, collider: ColliderComponent): Shape {
        const trs = this.adapter.worldTRS(entity);
        const rotated = rotateVec3(trs.rotation, v(collider.offset.x * trs.scale.x, collider.offset.y * trs.scale.y, collider.offset.z * trs.scale.z));
        const center = add(trs.position, rotated);
        if (this.dimension === "2d") center.z = 0;
        const sx = Math.abs(trs.scale.x), sy = Math.abs(trs.scale.y), sz = Math.abs(trs.scale.z);
        if (collider.shape === "sphere" || collider.shape === "circle") {
            const radiusScale = this.dimension === "2d" ? Math.max(sx, sy) : Math.max(sx, sy, sz);
            return { kind: "sphere", center, radius: Math.max(0.0005, collider.radius * radiusScale) };
        }
        let rotation: Quat = trs.rotation;
        if (this.dimension === "2d") {
            // Only the rotation around Z matters in 2D.
            const angle = 2 * Math.atan2(rotation.z, rotation.w);
            rotation = { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) };
        }
        const m = mat3FromQuat(rotation);
        const axes: [Vector3, Vector3, Vector3] = [v(m[0], m[3], m[6]), v(m[1], m[4], m[7]), v(m[2], m[5], m[8])];
        return {
            kind: "box",
            center,
            axes,
            half: [
                Math.max(0.0005, collider.size.x * sx / 2),
                Math.max(0.0005, collider.size.y * sy / 2),
                this.dimension === "2d" ? 1_000 : Math.max(0.0005, collider.size.z * sz / 2),
            ],
        };
    }

    private bounds(shape: Shape): { min: Vector3; max: Vector3 } {
        if (shape.kind === "sphere") {
            const r = shape.radius;
            return { min: v(shape.center.x - r, shape.center.y - r, shape.center.z - r), max: v(shape.center.x + r, shape.center.y + r, shape.center.z + r) };
        }
        const extent = (axisIndex: 0 | 1 | 2) => Math.abs(shape.axes[0][["x", "y", "z"][axisIndex] as "x"]) * shape.half[0]
            + Math.abs(shape.axes[1][["x", "y", "z"][axisIndex] as "x"]) * shape.half[1]
            + Math.abs(shape.axes[2][["x", "y", "z"][axisIndex] as "x"]) * shape.half[2];
        const ex = extent(0), ey = extent(1);
        const ez = this.dimension === "2d" ? 1_000 : extent(2);
        return { min: v(shape.center.x - ex, shape.center.y - ey, shape.center.z - ez), max: v(shape.center.x + ex, shape.center.y + ey, shape.center.z + ez) };
    }

    /** Static boxes for the solid surface tiles of a tilemap, cached until the tiles or the transform change. */
    private tileEntries(entity: PhysicsEntity, tilemap: TilemapComponent): ShapeEntry[] {
        const trs = this.adapter.worldTRS(entity);
        const bodyType = this.bodyType(entity);
        const type = bodyType === "dynamic" ? "kinematic" : bodyType;
        const p = trs.position;
        const q = trs.rotation;
        const s = trs.scale;
        const key = `${entity.tilemapRevision ?? 0}|${tilemap.cellSize}|${tilemap.isTrigger}|${tilemap.friction}|${tilemap.bounciness}|${type}|${p.x},${p.y},${p.z}|${q.x},${q.y},${q.z},${q.w}|${s.x},${s.y},${s.z}`;
        const cached = this.tileCache.get(entity);
        if (cached && cached.key === key && cached.tilemap === tilemap) return cached.entries;
        let rotation: Quat = q;
        if (this.dimension === "2d") {
            const angle = 2 * Math.atan2(q.z, q.w);
            rotation = { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) };
        }
        const m = mat3FromQuat(rotation);
        const axes: [Vector3, Vector3, Vector3] = [v(m[0], m[3], m[6]), v(m[1], m[4], m[7]), v(m[2], m[5], m[8])];
        const size = tilemap.cellSize;
        const half: [number, number, number] = [
            Math.max(0.0005, (size * Math.abs(s.x)) / 2),
            Math.max(0.0005, (size * Math.abs(s.y)) / 2),
            this.dimension === "2d" ? 1_000 : Math.max(0.0005, (size * Math.abs(s.z)) / 2),
        ];
        const rb = entity.rigidBody;
        const entries: ShapeEntry[] = [];
        for (const tile of solidTiles(tilemap)) {
            const local = rotateVec3(rotation, v((tile.x + 0.5) * size * s.x, (tile.y + 0.5) * size * s.y, 0));
            const center = add(p, local);
            if (this.dimension === "2d") center.z = 0;
            // Mirrored tilemaps swap which side of a tile is open.
            const open: OpenFaces = {
                left: s.x < 0 ? tile.open.right : tile.open.left,
                right: s.x < 0 ? tile.open.left : tile.open.right,
                bottom: s.y < 0 ? tile.open.top : tile.open.bottom,
                top: s.y < 0 ? tile.open.bottom : tile.open.top,
            };
            const shape: Shape = { kind: "box", center, axes, half };
            const { min, max } = this.bounds(shape);
            entries.push({ entity, shape, min, max, type, invMass: 0, trigger: tilemap.isTrigger, friction: tilemap.friction, bounciness: tilemap.bounciness, hasBody: Boolean(rb && rb.enabled), open });
        }
        this.tileCache.set(entity, { key, tilemap, entries });
        return entries;
    }

    private collectShapes() {
        const shapes: ShapeEntry[] = [];
        for (const entity of this.adapter.entities()) {
            if (entity.activeInHierarchy && entity.tilemap?.enabled) shapes.push(...this.tileEntries(entity, entity.tilemap));
            const collider = entity.collider;
            if (!entity.activeInHierarchy || !collider || !collider.enabled) continue;
            const shape = this.buildShape(entity, collider);
            const type = this.bodyType(entity);
            const { min, max } = this.bounds(shape);
            const rb = entity.rigidBody;
            shapes.push({
                entity,
                shape,
                min,
                max,
                type,
                invMass: type === "dynamic" && rb ? 1 / Math.max(0.001, rb.mass) : 0,
                trigger: collider.isTrigger,
                friction: collider.friction,
                bounciness: collider.bounciness,
                hasBody: Boolean(rb && rb.enabled),
            });
        }
        this.shapes = shapes;
        return shapes;
    }

    private moveShape(entry: ShapeEntry, delta: Vector3) {
        entry.shape.center = add(entry.shape.center, delta);
        entry.min = add(entry.min, delta);
        entry.max = add(entry.max, delta);
        this.adapter.translate(entry.entity, delta);
    }

    // ------------------------------------------------------------------
    // Narrow phase (normal always points from A to B)
    // ------------------------------------------------------------------

    private sphereSphere(a: Extract<Shape, { kind: "sphere" }>, b: Extract<Shape, { kind: "sphere" }>) {
        const d = sub(b.center, a.center);
        if (this.dimension === "2d") d.z = 0;
        const dist = length(d);
        const radius = a.radius + b.radius;
        if (dist >= radius) return null;
        const normal = dist > EPS ? scale(d, 1 / dist) : v(0, 1, 0);
        return { normal, penetration: radius - dist, point: add(a.center, scale(normal, a.radius)) };
    }

    /** Whether the face of `box` whose outward normal is closest to `outward` borders empty space. */
    private faceOpen(box: Extract<Shape, { kind: "box" }>, open: OpenFaces, outward: Vector3): boolean {
        const dx = dot(outward, box.axes[0]);
        const dy = dot(outward, box.axes[1]);
        if (Math.abs(dx) >= Math.abs(dy)) return Math.abs(dx) < 0.7 || (dx > 0 ? open.right : open.left);
        return Math.abs(dy) < 0.7 || (dy > 0 ? open.top : open.bottom);
    }

    /** Removes the parts of a sphere-vs-tile normal that would push through a closed face. */
    private clampToOpenFaces(box: Extract<Shape, { kind: "box" }>, open: OpenFaces, normalFromSphere: Vector3): Vector3 {
        const outward = scale(normalFromSphere, -1);
        let dx = dot(outward, box.axes[0]);
        let dy = dot(outward, box.axes[1]);
        const dz = this.dimension === "2d" ? 0 : dot(outward, box.axes[2]);
        if ((dx > 0 && !open.right) || (dx < 0 && !open.left)) dx = 0;
        if ((dy > 0 && !open.top) || (dy < 0 && !open.bottom)) dy = 0;
        if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 && Math.abs(dz) < 1e-9) return normalFromSphere;
        const adjusted = normalize(add(add(scale(box.axes[0], dx), scale(box.axes[1], dy)), scale(box.axes[2], dz)));
        return scale(adjusted, -1);
    }

    private sphereBox(sphere: Extract<Shape, { kind: "sphere" }>, box: Extract<Shape, { kind: "box" }>, open?: OpenFaces) {
        const result = this.sphereBoxRaw(sphere, box);
        if (!result || !open) return result;
        return { ...result, normal: this.clampToOpenFaces(box, open, result.normal) };
    }

    private sphereBoxRaw(sphere: Extract<Shape, { kind: "sphere" }>, box: Extract<Shape, { kind: "box" }>) {
        const rel = sub(sphere.center, box.center);
        const local = [dot(rel, box.axes[0]), dot(rel, box.axes[1]), this.dimension === "2d" ? 0 : dot(rel, box.axes[2])];
        const clamped = local.map((value, index) => Math.max(-box.half[index], Math.min(box.half[index], value)));
        const inside = local.every((value, index) => Math.abs(value) <= box.half[index]);
        if (!inside) {
            const closest = add(add(add(box.center, scale(box.axes[0], clamped[0])), scale(box.axes[1], clamped[1])), scale(box.axes[2], clamped[2]));
            const d = sub(closest, sphere.center);
            if (this.dimension === "2d") d.z = 0;
            const dist = length(d);
            if (dist >= sphere.radius) return null;
            const normal = dist > EPS ? scale(d, 1 / dist) : scale(box.axes[1], -1);
            return { normal, penetration: sphere.radius - dist, point: closest };
        }
        let axis = 0;
        let best = Infinity;
        const count = this.dimension === "2d" ? 2 : 3;
        for (let index = 0; index < count; index += 1) {
            const distance = box.half[index] - Math.abs(local[index]);
            if (distance < best) {
                best = distance;
                axis = index;
            }
        }
        const sign = local[axis] >= 0 ? 1 : -1;
        const normal = scale(box.axes[axis], -sign);
        return { normal, penetration: best + sphere.radius, point: sphere.center };
    }

    private boxBox(a: Extract<Shape, { kind: "box" }>, b: Extract<Shape, { kind: "box" }>, openA?: OpenFaces, openB?: OpenFaces) {
        const d = sub(b.center, a.center);
        const axes: Array<{ axis: Vector3; edge: boolean }> = [];
        const faceCount = this.dimension === "2d" ? 2 : 3;
        for (let index = 0; index < faceCount; index += 1) axes.push({ axis: a.axes[index], edge: false }, { axis: b.axes[index], edge: false });
        if (this.dimension === "3d") {
            for (let i = 0; i < 3; i += 1) {
                for (let j = 0; j < 3; j += 1) {
                    const axis = cross(a.axes[i], b.axes[j]);
                    const len = length(axis);
                    if (len > 1e-6) axes.push({ axis: scale(axis, 1 / len), edge: true });
                }
            }
        }
        let bestOverlap = Infinity;
        let bestAxis: Vector3 | null = null;
        let fallbackOverlap = Infinity;
        let fallbackAxis: Vector3 | null = null;
        for (const { axis, edge } of axes) {
            const projectA = a.half[0] * Math.abs(dot(a.axes[0], axis)) + a.half[1] * Math.abs(dot(a.axes[1], axis)) + (this.dimension === "2d" ? 0 : a.half[2] * Math.abs(dot(a.axes[2], axis)));
            const projectB = b.half[0] * Math.abs(dot(b.axes[0], axis)) + b.half[1] * Math.abs(dot(b.axes[1], axis)) + (this.dimension === "2d" ? 0 : b.half[2] * Math.abs(dot(b.axes[2], axis)));
            const distance = Math.abs(dot(d, axis));
            const overlap = projectA + projectB - distance;
            if (overlap <= 0) return null;
            const weighted = edge ? overlap * 1.05 + 1e-4 : overlap;
            const direction = dot(d, axis) >= 0 ? axis : scale(axis, -1);
            const closed = (openA && !this.faceOpen(a, openA, direction)) || (openB && !this.faceOpen(b, openB, scale(direction, -1)));
            if (closed) {
                if (weighted < fallbackOverlap) {
                    fallbackOverlap = weighted;
                    fallbackAxis = direction;
                }
                continue;
            }
            if (weighted < bestOverlap) {
                bestOverlap = weighted;
                bestAxis = direction;
            }
        }
        if (!bestAxis && fallbackAxis) {
            // Deep inside a block of tiles: leave the shortest way even through a closed face.
            bestAxis = fallbackAxis;
            bestOverlap = fallbackOverlap;
        }
        if (!bestAxis) return null;
        const penetration = Math.max(0, bestOverlap);
        const support = (box: Extract<Shape, { kind: "box" }>, direction: Vector3) => add(box.center, add(add(scale(box.axes[0], box.half[0] * Math.sign(dot(box.axes[0], direction) || 1)), scale(box.axes[1], box.half[1] * Math.sign(dot(box.axes[1], direction) || 1))), this.dimension === "2d" ? v() : scale(box.axes[2], box.half[2] * Math.sign(dot(box.axes[2], direction) || 1))));
        const pa = support(a, bestAxis);
        const pb = support(b, scale(bestAxis, -1));
        const point = scale(add(pa, pb), 0.5);
        return { normal: bestAxis, penetration, point };
    }

    private collide(a: ShapeEntry, b: ShapeEntry) {
        const sa = a.shape;
        const sb = b.shape;
        if (sa.kind === "sphere" && sb.kind === "sphere") return this.sphereSphere(sa, sb);
        if (sa.kind === "sphere" && sb.kind === "box") return this.sphereBox(sa, sb, b.open);
        if (sa.kind === "box" && sb.kind === "sphere") {
            const result = this.sphereBox(sb, sa, a.open);
            return result ? { ...result, normal: scale(result.normal, -1) } : null;
        }
        return this.boxBox(sa as Extract<Shape, { kind: "box" }>, sb as Extract<Shape, { kind: "box" }>, a.open, b.open);
    }

    // ------------------------------------------------------------------
    // Step
    // ------------------------------------------------------------------

    step(dt: number): PhysicsEvents {
        const is2D = this.dimension === "2d";
        // 1. Integrate velocities and positions.
        for (const entity of this.adapter.entities()) {
            const rb = entity.rigidBody;
            if (!entity.activeInHierarchy || !rb || !rb.enabled) continue;
            const body = entity.body;
            body.grounded = false;
            if (rb.bodyType === "static") {
                body.velocity.x = body.velocity.y = body.velocity.z = 0;
                continue;
            }
            if (rb.bodyType === "dynamic") {
                const invMass = 1 / Math.max(0.001, rb.mass);
                body.velocity.x += body.force.x * invMass * dt;
                body.velocity.y += body.force.y * invMass * dt;
                body.velocity.z += body.force.z * invMass * dt;
                if (rb.useGravity) {
                    body.velocity.x += this.gravity.x * rb.gravityScale * dt;
                    body.velocity.y += this.gravity.y * rb.gravityScale * dt;
                    body.velocity.z += this.gravity.z * rb.gravityScale * dt;
                }
                const damping = 1 / (1 + rb.linearDamping * dt);
                body.velocity.x *= damping;
                body.velocity.y *= damping;
                body.velocity.z *= damping;
            }
            body.force.x = body.force.y = body.force.z = 0;
            if (rb.freezePosition.x) body.velocity.x = 0;
            if (rb.freezePosition.y) body.velocity.y = 0;
            if (rb.freezePosition.z || is2D) body.velocity.z = 0;
            const maxSpeed = 500;
            const speed = length(body.velocity);
            if (speed > maxSpeed) {
                const factor = maxSpeed / speed;
                body.velocity.x *= factor;
                body.velocity.y *= factor;
                body.velocity.z *= factor;
            }
            this.adapter.translate(entity, scale(body.velocity, dt));
            if (!rb.freezeRotation) {
                const angularDamping = 1 / (1 + rb.angularDamping * dt);
                body.angularVelocity.x *= angularDamping;
                body.angularVelocity.y *= angularDamping;
                body.angularVelocity.z *= angularDamping;
                if (is2D) {
                    body.angularVelocity.x = 0;
                    body.angularVelocity.y = 0;
                }
                if (length(body.angularVelocity) > 1e-6) this.adapter.rotateEuler(entity, scale(body.angularVelocity, dt));
            }
        }

        // 2. Collision detection & response.
        const shapes = this.collectShapes();
        const currentPairs = new Map<string, ContactInfo>();
        const order = shapes.slice().sort((left, right) => left.min.x - right.min.x);
        for (let iteration = 0; iteration < this.solverIterations; iteration += 1) {
            for (let i = 0; i < order.length; i += 1) {
                const a = order[i];
                for (let j = i + 1; j < order.length; j += 1) {
                    const b = order[j];
                    if (b.min.x > a.max.x) break;
                    if (a.entity === b.entity) continue;
                    if (a.type === "static" && b.type === "static" && !(a.trigger || b.trigger)) continue;
                    if (a.type === "static" && b.type === "static" && !a.hasBody && !b.hasBody) continue;
                    if (b.min.y > a.max.y || b.max.y < a.min.y) continue;
                    if (!is2D && (b.min.z > a.max.z || b.max.z < a.min.z)) continue;
                    const contact = this.collide(a, b);
                    if (!contact) continue;
                    const trigger = a.trigger || b.trigger;
                    const key = pairKey(a.entity.id, b.entity.id);
                    if (iteration === 0) {
                        const [first, second] = a.entity.id < b.entity.id ? [a, b] : [b, a];
                        const normal = first === a ? contact.normal : scale(contact.normal, -1);
                        const point: ContactPoint = { point: contact.point, normal, penetration: contact.penetration };
                        const existing = currentPairs.get(key);
                        if (existing) {
                            existing.contacts.push(point);
                        } else {
                            currentPairs.set(key, {
                                a: first.entity.id,
                                b: second.entity.id,
                                trigger,
                                normal,
                                penetration: contact.penetration,
                                point: contact.point,
                                relativeVelocity: sub(second.entity.body.velocity, first.entity.body.velocity),
                                contacts: [point],
                            });
                        }
                    }
                    if (trigger) continue;
                    this.resolve(a, b, contact.normal, contact.penetration, iteration === 0);
                }
            }
        }

        // 3. Rolling spheres (visual) on the ground.
        for (const entry of shapes) {
            const rb = entry.entity.rigidBody;
            if (entry.type !== "dynamic" || !rb || rb.freezeRotation || entry.shape.kind !== "sphere" || !entry.entity.body.grounded) continue;
            const body = entry.entity.body;
            const radius = entry.shape.radius;
            if (is2D) {
                body.angularVelocity.z = -(body.velocity.x / radius) * (180 / Math.PI);
            } else {
                const omega = scale(cross(entry.entity.body.groundNormal, body.velocity), 1 / radius);
                body.angularVelocity.x = omega.x * (180 / Math.PI);
                body.angularVelocity.y = omega.y * (180 / Math.PI);
                body.angularVelocity.z = omega.z * (180 / Math.PI);
            }
        }

        // 4. Events.
        const events: PhysicsEvents = { enter: [], stay: [], exit: [] };
        for (const [key, info] of currentPairs) {
            if (this.previousPairs.has(key)) events.stay.push(info);
            else events.enter.push(info);
        }
        for (const [key, info] of this.previousPairs) {
            if (!currentPairs.has(key)) events.exit.push(info);
        }
        this.previousPairs = currentPairs;
        return events;
    }

    /** Forgets contacts of a destroyed entity (without exit callbacks). */
    forget(entityId: string) {
        for (const key of [...this.previousPairs.keys()]) {
            if (key.startsWith(`${entityId}|`) || key.endsWith(`|${entityId}`)) this.previousPairs.delete(key);
        }
    }

    private resolve(a: ShapeEntry, b: ShapeEntry, normal: Vector3, penetration: number, applyImpulse: boolean) {
        const invA = a.invMass;
        const invB = b.invMass;
        const totalInv = invA + invB;
        const moverA = a.type === "dynamic";
        const moverB = b.type === "dynamic";
        if (!moverA && !moverB) return;

        // Grounded detection: the supporting normal points up from the ground into the body.
        if (moverA && -normal.y > 0.55) {
            a.entity.body.grounded = true;
            a.entity.body.groundNormal = scale(normal, -1);
        }
        if (moverB && normal.y > 0.55) {
            b.entity.body.grounded = true;
            b.entity.body.groundNormal = { ...normal };
        }

        // Positional correction.
        const correctionMagnitude = Math.max(penetration - SLOP, 0) * CORRECTION;
        if (correctionMagnitude > 0) {
            if (totalInv > 0) {
                if (moverA) this.moveShape(a, scale(normal, -correctionMagnitude * (invA / totalInv)));
                if (moverB) this.moveShape(b, scale(normal, correctionMagnitude * (invB / totalInv)));
            }
        }
        if (!applyImpulse) return;

        const va = a.entity.body.velocity;
        const vb = b.entity.body.velocity;
        const relative = sub(vb, va);
        const velocityAlongNormal = dot(relative, normal);
        if (velocityAlongNormal > 0) return;
        let restitution = Math.max(a.bounciness, b.bounciness);
        if (Math.abs(velocityAlongNormal) < REST_VELOCITY) restitution = 0;
        const effectiveInv = totalInv > 0 ? totalInv : 1;
        const j = -(1 + restitution) * velocityAlongNormal / effectiveInv;
        const impulse = scale(normal, j);
        if (moverA) this.applyVelocity(a, scale(impulse, -invA));
        if (moverB) this.applyVelocity(b, scale(impulse, invB));

        // Coulomb friction.
        const relativeAfter = sub(b.entity.body.velocity, a.entity.body.velocity);
        const tangentRaw = sub(relativeAfter, scale(normal, dot(relativeAfter, normal)));
        const tangentLength = length(tangentRaw);
        if (tangentLength < 1e-6) return;
        const tangent = scale(tangentRaw, 1 / tangentLength);
        const mu = Math.sqrt(Math.max(0, a.friction) * Math.max(0, b.friction));
        let jt = -dot(relativeAfter, tangent) / effectiveInv;
        const maxFriction = Math.abs(j) * mu;
        jt = Math.max(-maxFriction, Math.min(maxFriction, jt));
        const frictionImpulse = scale(tangent, jt);
        if (moverA) this.applyVelocity(a, scale(frictionImpulse, -invA));
        if (moverB) this.applyVelocity(b, scale(frictionImpulse, invB));
    }

    private applyVelocity(entry: ShapeEntry, delta: Vector3) {
        const rb = entry.entity.rigidBody;
        const velocity = entry.entity.body.velocity;
        velocity.x += rb?.freezePosition.x ? 0 : delta.x;
        velocity.y += rb?.freezePosition.y ? 0 : delta.y;
        velocity.z += rb?.freezePosition.z || this.dimension === "2d" ? 0 : delta.z;
    }

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    private queryShapes(): ShapeEntry[] {
        return this.collectShapes();
    }

    raycast(origin: Vector3, direction: Vector3, maxDistance = Infinity, includeTriggers = false, ignoreId?: string): RaycastResult | null {
        const hits = this.raycastAll(origin, direction, maxDistance, includeTriggers, ignoreId);
        return hits[0] ?? null;
    }

    raycastAll(origin: Vector3, direction: Vector3, maxDistance = Infinity, includeTriggers = false, ignoreId?: string): RaycastResult[] {
        const is2D = this.dimension === "2d";
        const dir = normalize(is2D ? v(direction.x, direction.y, 0) : direction);
        if (length(dir) < EPS) return [];
        const start = is2D ? v(origin.x, origin.y, 0) : origin;
        const results: RaycastResult[] = [];
        for (const entry of this.queryShapes()) {
            if (entry.trigger && !includeTriggers) continue;
            if (entry.entity.id === ignoreId) continue;
            const hit = entry.shape.kind === "sphere" ? this.raySphere(start, dir, entry.shape) : this.rayBox(start, dir, entry.shape);
            if (!hit || hit.distance > maxDistance) continue;
            results.push({ entityId: entry.entity.id, ...hit });
        }
        // One hit per object: a tilemap made of many boxes reports its nearest tile.
        const seen = new Set<string>();
        return results.sort((left, right) => left.distance - right.distance).filter((hit) => {
            if (seen.has(hit.entityId)) return false;
            seen.add(hit.entityId);
            return true;
        });
    }

    private raySphere(origin: Vector3, dir: Vector3, sphere: Extract<Shape, { kind: "sphere" }>) {
        const oc = sub(origin, sphere.center);
        if (this.dimension === "2d") oc.z = 0;
        const b = dot(oc, dir);
        const c = dot(oc, oc) - sphere.radius * sphere.radius;
        if (c <= 0) return null; // origin inside
        const discriminant = b * b - c;
        if (discriminant < 0) return null;
        const t = -b - Math.sqrt(discriminant);
        if (t < 0) return null;
        const point = add(origin, scale(dir, t));
        const normal = normalize(sub(point, sphere.center));
        if (this.dimension === "2d") normal.z = 0;
        return { point, normal, distance: t };
    }

    private rayBox(origin: Vector3, dir: Vector3, box: Extract<Shape, { kind: "box" }>) {
        const rel = sub(origin, box.center);
        let tMin = -Infinity;
        let tMax = Infinity;
        let normalAxis = 0;
        let normalSign = 1;
        const count = this.dimension === "2d" ? 2 : 3;
        for (let index = 0; index < count; index += 1) {
            const axis = box.axes[index];
            const e = dot(axis, rel);
            const f = dot(axis, dir);
            if (Math.abs(f) > EPS) {
                let t1 = (-box.half[index] - e) / f;
                let t2 = (box.half[index] - e) / f;
                let sign = -1;
                if (t1 > t2) {
                    [t1, t2] = [t2, t1];
                    sign = 1;
                }
                if (t1 > tMin) {
                    tMin = t1;
                    normalAxis = index;
                    normalSign = sign;
                }
                tMax = Math.min(tMax, t2);
                if (tMin > tMax) return null;
            } else if (-e - box.half[index] > 0 || -e + box.half[index] < 0) {
                return null;
            }
        }
        if (tMin < 0) return null; // origin inside or behind
        const point = add(origin, scale(dir, tMin));
        const normal = scale(box.axes[normalAxis], normalSign);
        return { point, normal, distance: tMin };
    }

    overlapSphere(center: Vector3, radius: number, includeTriggers = true): string[] {
        const probe: ShapeEntry = {
            entity: { id: "__probe__", rigidBody: null, collider: null, tilemap: null, activeInHierarchy: true, body: { velocity: v(), angularVelocity: v(), grounded: false, groundNormal: v(0, 1, 0), force: v() } },
            shape: { kind: "sphere", center: this.dimension === "2d" ? v(center.x, center.y, 0) : { ...center }, radius },
            min: v(), max: v(), type: "static", invMass: 0, trigger: false, friction: 0, bounciness: 0, hasBody: false,
        };
        const output = new Set<string>();
        for (const entry of this.queryShapes()) {
            if (entry.trigger && !includeTriggers) continue;
            if (output.has(entry.entity.id)) continue;
            if (this.collide(probe, entry)) output.add(entry.entity.id);
        }
        return [...output];
    }

    /** World-space point inside the collider closest to `point` (used by Collider.ClosestPoint). */
    closestPoint(entityId: string, point: Vector3): Vector3 | null {
        const entry = this.shapes.find((candidate) => candidate.entity.id === entityId);
        if (!entry) return null;
        if (entry.shape.kind === "sphere") {
            const d = sub(point, entry.shape.center);
            const dist = length(d);
            return dist <= entry.shape.radius ? { ...point } : add(entry.shape.center, scale(d, entry.shape.radius / dist));
        }
        const box = entry.shape;
        const rel = sub(point, box.center);
        const local = [0, 1, 2].map((index) => Math.max(-box.half[index], Math.min(box.half[index], dot(rel, box.axes[index]))));
        return add(add(add(box.center, scale(box.axes[0], local[0])), scale(box.axes[1], local[1])), scale(box.axes[2], this.dimension === "2d" ? 0 : local[2]));
    }
}

export function createBodyRuntime(rb: RigidBodyComponent | null): BodyRuntime {
    return {
        velocity: { x: rb?.velocity.x ?? 0, y: rb?.velocity.y ?? 0, z: rb?.velocity.z ?? 0 },
        angularVelocity: { x: rb?.angularVelocity.x ?? 0, y: rb?.angularVelocity.y ?? 0, z: rb?.angularVelocity.z ?? 0 },
        grounded: false,
        groundNormal: { x: 0, y: 1, z: 0 },
        force: { x: 0, y: 0, z: 0 },
    };
}

export { conjugateQuat };
