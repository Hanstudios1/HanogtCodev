/**
 * Prefab links (V6, editor): scene objects made from a prefab remember it
 * (GameEntity.prefab), so the Inspector can show what an instance changed
 * (its overrides), push those changes to the prefab and its other instances
 * (Apply) or drop them (Revert).
 *
 * Matching: an instance object matches the prefab entity named by its
 * `prefab.sourceId`; components match by type and order among components of
 * that type ("script#1" is the second script). The instance root's position,
 * rotation, name and parent belong to the instance: they are never overrides.
 *
 * Override paths: "tag", "layer", "active", "name" (children only),
 * "spriteRenderer#0.color", "script#0.fields.speed" (arrays count as one
 * value), "+collider#0" (a component the instance added) and "-audioSource#0"
 * (one it removed). Objects the instance added are "+object"; prefab objects
 * it deleted are listed on the root as "-object:<prefab entity id>".
 */
import { createEngineId } from "./ids";
import { remapComponentRefs } from "./scene";
import type { GameComponent, GameEntity, GameProjectDocument, PrefabAsset } from "./types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isPlainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Fields of the root transform that belong to the instance. */
const ROOT_OWN = new Set(["position", "rotation"]);

/** "type#n": the component's type and its order among the entity's components of that type. */
export function componentKey(entity: Pick<GameEntity, "components">, component: GameComponent): string {
    let index = 0;
    for (const item of entity.components) {
        if (item === component || item.id === component.id) break;
        if (item.type === component.type) index += 1;
    }
    return `${component.type}#${index}`;
}

function keyedComponents(entity: Pick<GameEntity, "components">): Map<string, GameComponent> {
    const counts = new Map<string, number>();
    const output = new Map<string, GameComponent>();
    for (const component of entity.components) {
        const index = counts.get(component.type) ?? 0;
        counts.set(component.type, index + 1);
        output.set(`${component.type}#${index}`, component);
    }
    return output;
}

/** Component data compared between an instance and its prefab: no id, and no position/rotation on the root. */
function comparable(component: GameComponent, root: boolean): Record<string, unknown> {
    const data = clone(component) as unknown as Record<string, unknown>;
    delete data.id;
    if (root && component.type === "transform") for (const field of ROOT_OWN) delete data[field];
    return data;
}

function diffPaths(a: unknown, b: unknown, path: string, out: string[]) {
    if (same(a, b)) return;
    if (isPlainObject(a) && isPlainObject(b)) {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[key], b[key], `${path}.${key}`, out);
        return;
    }
    out.push(path);
}

/**
 * What an instance object changed against its prefab entity. Entity
 * references inside the prefab are compared as the instance's own ids (`toInstance`).
 */
export function entityOverrides(instance: GameEntity, source: GameEntity, root: boolean, toInstance: ReadonlyMap<string, string> = new Map()): string[] {
    const out: string[] = [];
    if (!root && instance.name !== source.name) out.push("name");
    if (instance.tag !== source.tag) out.push("tag");
    if (instance.layer !== source.layer) out.push("layer");
    if (instance.active !== source.active) out.push("active");
    const mine = keyedComponents(instance);
    const theirs = keyedComponents(source);
    for (const [key, component] of mine) {
        const other = theirs.get(key);
        if (!other) out.push(`+${key}`);
        else diffPaths(comparable(component, root), comparable(remapComponentRefs(other, toInstance), root), key, out);
    }
    for (const key of theirs.keys()) if (!mine.has(key)) out.push(`-${key}`);
    return out;
}

/** The prefab of a linked object, if it still exists. */
export function linkedPrefab(project: Pick<GameProjectDocument, "prefabs">, entity: GameEntity): PrefabAsset | null {
    if (!entity.prefab) return null;
    const prefab = project.prefabs.find((item) => item.id === entity.prefab?.prefabId) ?? null;
    return prefab && prefab.entities.some((item) => item.id === entity.prefab?.sourceId) ? prefab : null;
}

/** The root of the prefab instance an object belongs to (itself or a linked parent), or null. */
export function instanceRootOf(entities: readonly GameEntity[], entityId: string, prefabs: readonly PrefabAsset[]): GameEntity | null {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    let cursor = byId.get(entityId) ?? null;
    const prefabId = cursor?.prefab?.prefabId;
    const prefab = prefabs.find((item) => item.id === prefabId);
    if (!prefab || !prefab.entities.length) return null;
    for (let guard = 0; cursor && guard < 64; guard += 1) {
        if (cursor.prefab?.prefabId !== prefab.id) return null;
        if (cursor.prefab.sourceId === prefab.entities[0].id) return cursor;
        cursor = cursor.parentId ? byId.get(cursor.parentId) ?? null : null;
    }
    return null;
}

/** The instance's objects: the root and everything under it (linked children and objects the instance added). */
function subtreeOf(entities: readonly GameEntity[], rootId: string): GameEntity[] {
    const ids = new Set([rootId]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const entity of entities) {
            if (!ids.has(entity.id) && entity.parentId && ids.has(entity.parentId)) {
                ids.add(entity.id);
                grew = true;
            }
        }
    }
    return entities.filter((entity) => ids.has(entity.id));
}

/** Instance object id ↔ prefab entity id for the linked objects of an instance. */
function matchInstance(members: readonly GameEntity[], prefab: PrefabAsset) {
    const sources = new Set(prefab.entities.map((entity) => entity.id));
    const toInstance = new Map<string, string>();
    const toPrefab = new Map<string, string>();
    for (const member of members) {
        const source = member.prefab?.prefabId === prefab.id ? member.prefab.sourceId : null;
        if (source && sources.has(source) && !toInstance.has(source)) {
            toInstance.set(source, member.id);
            toPrefab.set(member.id, source);
        }
    }
    return { toInstance, toPrefab };
}

/** Every override of an instance: object id → paths (objects without changes are left out). */
export function instanceOverrides(entities: readonly GameEntity[], root: GameEntity, prefab: PrefabAsset): Map<string, string[]> {
    const members = subtreeOf(entities, root.id);
    const { toInstance, toPrefab } = matchInstance(members, prefab);
    const output = new Map<string, string[]>();
    for (const member of members) {
        const sourceId = toPrefab.get(member.id);
        const source = sourceId ? prefab.entities.find((entity) => entity.id === sourceId) : undefined;
        const paths = source ? entityOverrides(member, source, member.id === root.id, toInstance) : ["+object"];
        if (paths.length) output.set(member.id, paths);
    }
    const missing = prefab.entities.filter((entity) => !toInstance.has(entity.id)).map((entity) => `-object:${entity.id}`);
    if (missing.length) output.set(root.id, [...(output.get(root.id) ?? []), ...missing]);
    return output;
}

/** Writes `value` at an override path inside an object (creating the path). */
function writePath(entity: GameEntity, path: string, from: GameEntity) {
    if (path === "name" || path === "tag" || path === "layer" || path === "active") {
        (entity as unknown as Record<string, unknown>)[path] = (from as unknown as Record<string, unknown>)[path];
        return;
    }
    const [key, ...rest] = path.split(".");
    const target = keyedComponents(entity).get(key) as unknown as Record<string, unknown> | undefined;
    const source = keyedComponents(from).get(key) as unknown as Record<string, unknown> | undefined;
    if (!target || !source || !rest.length) return;
    let into: Record<string, unknown> = target;
    let read: unknown = source;
    for (let index = 0; index < rest.length - 1; index += 1) {
        read = isPlainObject(read) ? read[rest[index]] : undefined;
        if (!isPlainObject(into[rest[index]])) into[rest[index]] = {};
        into = into[rest[index]] as Record<string, unknown>;
    }
    const last = rest[rest.length - 1];
    const value = isPlainObject(read) ? read[last] : undefined;
    if (value === undefined) delete into[last];
    else into[last] = clone(value);
}

/**
 * Rebuilds an instance from a prefab (mutates `entities`). Without `keep`
 * every override goes (Revert). With `keep` (the prefab before it changed),
 * each object keeps what it had changed against that version, objects it
 * added stay, and prefab objects it had deleted stay deleted (Apply on the
 * other instances).
 */
export function syncInstance(entities: GameEntity[], rootId: string, prefab: PrefabAsset, keep: PrefabAsset | null = null): void {
    const root = entities.find((entity) => entity.id === rootId);
    if (!root || !prefab.entities.length) return;
    const members = subtreeOf(entities, rootId);
    const { toInstance } = matchInstance(members, prefab);
    const byId = new Map(members.map((entity) => [entity.id, entity]));
    // What to keep: overrides against the old prefab, per object.
    const kept = new Map<string, { paths: string[]; before: GameEntity }>();
    let deleted = new Set<string>();
    if (keep) {
        const old = matchInstance(members, keep);
        for (const member of members) {
            const sourceId = old.toPrefab.get(member.id);
            const source = sourceId ? keep.entities.find((entity) => entity.id === sourceId) : undefined;
            if (source) kept.set(member.id, { paths: entityOverrides(member, source, member.id === rootId, old.toInstance), before: clone(member) });
        }
        deleted = new Set(keep.entities.filter((entity) => !old.toInstance.has(entity.id)).map((entity) => entity.id));
    }

    // New ids for prefab objects the instance doesn't have yet.
    const idMap = new Map(toInstance);
    for (const source of prefab.entities) {
        if (!idMap.has(source.id) && !deleted.has(source.id)) idMap.set(source.id, createEngineId("entity"));
    }
    const rebuilt: GameEntity[] = [];
    prefab.entities.forEach((source, index) => {
        const id = idMap.get(source.id);
        if (!id) return;
        const current = byId.get(id);
        const isRoot = index === 0;
        const next = clone(source);
        next.id = id;
        next.prefab = { prefabId: prefab.id, sourceId: source.id };
        next.parentId = isRoot ? root.parentId : source.parentId && idMap.has(source.parentId) ? idMap.get(source.parentId) as string : root.id;
        if (isRoot) next.name = root.name;
        // Components keep their ids where they match; references point at the instance's objects.
        const currentComponents = current ? keyedComponents(current) : new Map<string, GameComponent>();
        next.components = next.components.map((component, componentIndex) => {
            const key = componentKey(next, next.components[componentIndex]);
            const remapped = remapComponentRefs(component, idMap);
            return { ...remapped, id: currentComponents.get(key)?.id ?? createEngineId("cmp") } as GameComponent;
        });
        if (isRoot) {
            const transform = next.components.find((component) => component.type === "transform");
            const own = root.components.find((component) => component.type === "transform");
            if (transform?.type === "transform" && own?.type === "transform") {
                transform.position = clone(own.position);
                transform.rotation = clone(own.rotation);
            }
        }
        const saved = current ? kept.get(current.id) : undefined;
        if (saved) {
            for (const path of saved.paths) {
                if (path.startsWith("+")) {
                    const added = keyedComponents(saved.before).get(path.slice(1));
                    if (added && !next.components.some((component) => component.id === added.id)) next.components.push(clone(added));
                } else if (path.startsWith("-")) {
                    const gone = keyedComponents(next).get(path.slice(1));
                    if (gone && gone.type !== "transform") next.components = next.components.filter((component) => component !== gone);
                } else {
                    writePath(next, path, saved.before);
                }
            }
        }
        rebuilt.push(next);
    });

    // Objects the instance added stay only when keeping overrides; old linked objects the prefab no longer has go.
    const rebuiltIds = new Set(rebuilt.map((entity) => entity.id));
    const extra = keep ? members.filter((member) => !rebuiltIds.has(member.id) && !(member.prefab?.prefabId === prefab.id)) : [];
    const removed = new Set(members.filter((member) => !rebuiltIds.has(member.id) && !extra.includes(member)).map((member) => member.id));
    // Objects under a removed object go with it.
    for (const member of extra.slice()) {
        let cursor: GameEntity | undefined = member;
        while (cursor?.parentId && byId.has(cursor.parentId)) {
            if (removed.has(cursor.parentId)) {
                removed.add(member.id);
                extra.splice(extra.indexOf(member), 1);
                break;
            }
            cursor = byId.get(cursor.parentId);
        }
    }

    // Splice the result back in place of the old objects (new ones after the last member).
    const firstIndex = entities.findIndex((entity) => byId.has(entity.id));
    const outside = entities.filter((entity) => !byId.has(entity.id));
    const before = outside.slice(0, entities.slice(0, firstIndex).filter((entity) => !byId.has(entity.id)).length);
    const after = outside.slice(before.length);
    entities.splice(0, entities.length, ...before, ...rebuilt, ...extra.filter((member) => !removed.has(member.id)), ...after);
}

/** Every instance root of a prefab in the given objects. */
export function instancesOf(entities: readonly GameEntity[], prefab: PrefabAsset): GameEntity[] {
    const rootSource = prefab.entities[0]?.id;
    return entities.filter((entity) => entity.prefab?.prefabId === prefab.id && entity.prefab.sourceId === rootSource);
}

/**
 * Apply: makes the instance the prefab's new content (its root position,
 * rotation and name stay the prefab's), then updates every other instance in
 * every scene, keeping what each of them changed. Objects the instance added
 * become prefab objects. Returns how many other instances were updated.
 */
export function applyInstance(project: GameProjectDocument, sceneId: string, rootId: string): number {
    const scene = project.scenes.find((item) => item.id === sceneId);
    const root = scene?.objects.find((entity) => entity.id === rootId);
    const prefab = root ? linkedPrefab(project, root) : null;
    if (!scene || !root || !prefab || root.prefab?.sourceId !== prefab.entities[0]?.id) return 0;
    const old = clone(prefab);
    const members = subtreeOf(scene.objects, root.id);
    const { toPrefab } = matchInstance(members, prefab);
    // Prefab ids for every member (new ones for objects the instance added).
    const toNew = new Map<string, string>();
    for (const member of members) toNew.set(member.id, toPrefab.get(member.id) ?? createEngineId("entity"));
    const oldRoot = prefab.entities[0];
    const oldComponents = new Map(prefab.entities.map((entity) => [entity.id, keyedComponents(entity)]));
    prefab.entities = members.map((member, index) => {
        const id = toNew.get(member.id) as string;
        const next = clone(member);
        delete next.prefab;
        next.id = id;
        next.parentId = index === 0 ? null : member.parentId ? toNew.get(member.parentId) ?? toNew.get(root.id) as string : toNew.get(root.id) as string;
        if (index === 0) next.name = oldRoot.name;
        const known = oldComponents.get(id);
        next.components = next.components.map((component) => {
            const key = componentKey(member, member.components.find((item) => item.id === component.id) ?? component);
            return { ...remapComponentRefs(component, toNew), id: known?.get(key)?.id ?? createEngineId("cmp") } as GameComponent;
        });
        if (index === 0) {
            const transform = next.components.find((component) => component.type === "transform");
            const own = oldRoot.components.find((component) => component.type === "transform");
            if (transform?.type === "transform" && own?.type === "transform") {
                transform.position = clone(own.position);
                transform.rotation = clone(own.rotation);
            }
        }
        return next;
    });
    // The instance now links every object (including the ones it added).
    for (const member of members) member.prefab = { prefabId: prefab.id, sourceId: toNew.get(member.id) as string };
    let updated = 0;
    for (const other of project.scenes) {
        for (const instance of instancesOf(other.objects, prefab)) {
            if (other.id === scene.id && instance.id === root.id) continue;
            syncInstance(other.objects, instance.id, prefab, old);
            updated += 1;
        }
    }
    return updated;
}

/** Revert: drops every override of the instance (its root position, rotation, name and parent stay). */
export function revertInstance(project: GameProjectDocument, sceneId: string, rootId: string): boolean {
    const scene = project.scenes.find((item) => item.id === sceneId);
    const root = scene?.objects.find((entity) => entity.id === rootId);
    const prefab = root ? linkedPrefab(project, root) : null;
    if (!scene || !root || !prefab) return false;
    syncInstance(scene.objects, root.id, prefab, null);
    return true;
}

/** Links a subtree to the prefab it was just made from or copied out of (same order as the prefab's entities). */
export function linkToPrefab(subtree: readonly GameEntity[], prefab: PrefabAsset) {
    subtree.forEach((entity, index) => {
        const source = prefab.entities[index];
        if (source) entity.prefab = { prefabId: prefab.id, sourceId: source.id };
    });
}

/** Forgets the links to a deleted prefab. */
export function unlinkPrefab(project: GameProjectDocument, prefabId: string) {
    for (const scene of project.scenes) for (const entity of scene.objects) if (entity.prefab?.prefabId === prefabId) delete entity.prefab;
}
