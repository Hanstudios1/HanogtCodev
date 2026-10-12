/**
 * Object pools (V6): Pool.Spawn reuses deactivated copies of a prefab instead
 * of creating and destroying objects, which keeps bullet-hell games and
 * particle-heavy scenes smooth.
 *
 * Lifecycle of a pooled copy:
 * - Prewarm makes inactive copies; their Awake waits for their first Spawn.
 * - Spawn activates a copy at a position: OnEnable runs every time, Awake and
 *   Start only the first time. Its Rigidbody speed, Animation, Animator and
 *   particles start over; script fields keep their values (reset them in
 *   OnEnable).
 * - Despawn deactivates it (OnDisable) and stops its coroutines, Invoke calls,
 *   Timers and Tweens; it is never destroyed by the pool.
 * - A pool holds at most `capacity` copies of a prefab; when all of them are
 *   in use, Spawn reuses the oldest one.
 */
import { quatFromEulerDeg, type Quat } from "../math";
import { cloneEntitiesWithNewIds } from "../scene";
import { cloneJson } from "../schema";
import type { PrefabAsset, TransformComponent, Vector3 } from "../types";
import type { RuntimeEntity } from "./entity";
import { createBodyRuntime } from "./physics";
import type { RuntimeWorld } from "./world";

export const POOL_LIMITS = {
    /** Copies a pool keeps of one prefab unless Pool.SetCapacity says otherwise. */
    defaultCapacity: 200,
    maxCapacity: 1000,
} as const;

/** What an entity knows about the pool it belongs to. */
export interface PoolMembership {
    prefabId: string;
    /** Bumped on every Spawn and Despawn so a stale delayed Despawn does nothing. */
    generation: number;
    /** True while it waits in the pool (deactivated). */
    despawned: boolean;
}

interface PoolState {
    prefab: PrefabAsset;
    capacity: number;
    /** Every live copy, the one spawned longest ago first. */
    copies: RuntimeEntity[];
    /** Warned once that the pool is full. */
    warnedFull: boolean;
}

export class ObjectPools {
    private readonly pools = new Map<string, PoolState>();
    private delayed: Array<{ entity: RuntimeEntity; generation: number; at: number }> = [];
    private readonly world: RuntimeWorld;

    constructor(world: RuntimeWorld) {
        this.world = world;
    }

    /** The pool of a prefab, without copies that were destroyed meanwhile. */
    private pool(prefab: PrefabAsset): PoolState {
        let pool = this.pools.get(prefab.id);
        if (!pool) {
            pool = { prefab, capacity: POOL_LIMITS.defaultCapacity, copies: [], warnedFull: false };
            this.pools.set(prefab.id, pool);
        }
        if (pool.copies.some((entity) => entity.destroyed || entity.pendingDestroy)) pool.copies = pool.copies.filter((entity) => !entity.destroyed && !entity.pendingDestroy);
        return pool;
    }

    /** A new, inactive copy of the prefab that belongs to its pool. */
    private create(pool: PoolState): RuntimeEntity | null {
        const docs = cloneEntitiesWithNewIds(cloneJson(pool.prefab.entities), null);
        if (!docs.length) return null;
        docs[0].parentId = null;
        docs[0].name = `${docs[0].name}(Clone)`;
        docs[0].active = false;
        const [root] = this.world.spawn(docs, {});
        if (!root) return null;
        root.pool = { prefabId: pool.prefab.id, generation: 0, despawned: true };
        pool.copies.push(root);
        return root;
    }

    /** Pool.Prewarm: inactive copies up to `count` (and the pool's capacity); returns how many wait in the pool. */
    prewarm(prefab: PrefabAsset, count: number): number {
        const pool = this.pool(prefab);
        const wanted = Math.min(pool.capacity, Math.max(0, Math.trunc(count)));
        while (pool.copies.length < wanted) {
            if (!this.create(pool)) break;
        }
        return this.countInactive(prefab);
    }

    /** Pool.Spawn: a waiting copy (or a new one, or the oldest in use when the pool is full) active at the position. */
    spawn(prefab: PrefabAsset, position?: Vector3, rotation?: Quat): RuntimeEntity | null {
        const pool = this.pool(prefab);
        // The copy that waited the shortest comes back first (last in, first out).
        let entity: RuntimeEntity | null = null;
        for (let index = pool.copies.length - 1; index >= 0 && !entity; index -= 1) {
            const copy = pool.copies[index];
            if (copy.pool?.despawned && !copy.activeSelf) entity = copy;
        }
        if (!entity && pool.copies.length < pool.capacity) entity = this.create(pool);
        if (!entity) {
            // Full: the copy spawned longest ago comes back first.
            entity = pool.copies[0] ?? null;
            if (!entity) return null;
            if (!pool.warnedFull) {
                pool.warnedFull = true;
                this.world.log("warning", `Pool '${prefab.name}' sınırına (${pool.capacity} kopya) ulaştı; en eski kopya yeniden kullanıldı. Daha fazlası için Pool.SetCapacity("${prefab.name}", sayı).`);
            }
            this.despawnNow(entity);
        }
        // The copy moves to the end: it is now the most recently spawned.
        pool.copies.splice(pool.copies.indexOf(entity), 1);
        pool.copies.push(entity);
        this.reset(entity, pool.prefab, position, rotation);
        const membership = entity.pool as PoolMembership;
        membership.generation += 1;
        membership.despawned = false;
        this.world.setActive(entity, true);
        return entity;
    }

    /** Back to the prefab's pose (at the given position), still and with its animations ready to start again. */
    private reset(entity: RuntimeEntity, prefab: PrefabAsset, position?: Vector3, rotation?: Quat) {
        const transform = prefab.entities[0]?.components.find((component): component is TransformComponent => component.type === "transform");
        entity.setLocalScale(transform?.scale ?? { x: 1, y: 1, z: 1 });
        entity.setWorldRotation(rotation ?? quatFromEulerDeg(transform?.rotation ?? { x: 0, y: 0, z: 0 }));
        entity.setWorldPosition(position ?? transform?.position ?? { x: 0, y: 0, z: 0 });
        for (const node of entity.subtree()) {
            node.body = createBodyRuntime(node.rigidBody);
            this.world.physics.forget(node.id);
            if (node.animator) node.animator.autoPlayed = false;
            node.animatorController = null;
            node.emitter?.stop(true);
        }
        entity.markDirty();
    }

    /** Pool.Despawn: deactivates the pooled object (now, or after `delay` seconds). False when it isn't from a pool. */
    despawn(target: RuntimeEntity, delay = 0): boolean {
        const entity = pooledRoot(target);
        if (!entity) return false;
        if (delay > 0) {
            this.delayed.push({ entity, generation: entity.pool?.generation ?? 0, at: this.world.time + delay });
            return true;
        }
        this.despawnNow(entity);
        return true;
    }

    private despawnNow(entity: RuntimeEntity) {
        const membership = entity.pool;
        if (!membership || membership.despawned || entity.destroyed) return;
        membership.despawned = true;
        membership.generation += 1;
        const world = this.world;
        // Nothing the copy started may reach its next life.
        for (const node of entity.subtree()) {
            for (const state of node.behaviours) {
                state.invokes.length = 0;
                world.timers.cancelOwner(state);
            }
            world.tweens.killTarget(node, false, world.runCallback);
            node.emitter?.stop(true);
        }
        world.setActive(entity, false);
    }

    /** Runs the delayed Despawns that are due (once per frame, with the destroy queue). */
    update(time: number) {
        if (!this.delayed.length) return;
        const due = this.delayed.filter((item) => item.at <= time);
        if (!due.length) return;
        this.delayed = this.delayed.filter((item) => item.at > time);
        for (const item of due) {
            // A copy that was despawned and spawned again meanwhile keeps living.
            if (item.entity.pool?.generation === item.generation) this.despawnNow(item.entity);
        }
    }

    count(prefab: PrefabAsset): number {
        return this.pool(prefab).copies.filter((entity) => !entity.pool?.despawned).length;
    }

    countInactive(prefab: PrefabAsset): number {
        return this.pool(prefab).copies.filter((entity) => entity.pool?.despawned).length;
    }

    countAll(prefab: PrefabAsset): number {
        return this.pool(prefab).copies.length;
    }

    /** Pool.SetCapacity: the most copies the pool keeps (1–1000); extra waiting copies are destroyed. */
    setCapacity(prefab: PrefabAsset, capacity: number) {
        const pool = this.pool(prefab);
        pool.capacity = Math.max(1, Math.min(POOL_LIMITS.maxCapacity, Math.trunc(capacity)));
        pool.warnedFull = false;
        for (const entity of pool.copies.filter((copy) => copy.pool?.despawned).slice(0, Math.max(0, pool.copies.length - pool.capacity))) this.world.destroy(this.world.gameObjectHandle(entity), 0, true);
        this.pool(prefab);
    }

    capacity(prefab: PrefabAsset): number {
        return this.pool(prefab).capacity;
    }

    /** Pool.Clear: destroys the waiting copies (copies in use stay). */
    clear(prefab: PrefabAsset) {
        for (const entity of this.pool(prefab).copies.filter((copy) => copy.pool?.despawned)) this.world.destroy(this.world.gameObjectHandle(entity), 0, true);
        this.pool(prefab);
    }

    /** Copies in use and in all pools (the editor's stats). */
    stats(): { active: number; total: number } {
        let active = 0;
        let total = 0;
        for (const pool of this.pools.values()) {
            for (const entity of pool.copies) {
                if (entity.destroyed) continue;
                total += 1;
                if (!entity.pool?.despawned) active += 1;
            }
        }
        return { active, total };
    }
}

/** The pooled object a target belongs to (itself or the nearest parent that came from a pool). */
export function pooledRoot(entity: RuntimeEntity): RuntimeEntity | null {
    for (let cursor: RuntimeEntity | null = entity; cursor; cursor = cursor.parent) if (cursor.pool) return cursor;
    return null;
}
