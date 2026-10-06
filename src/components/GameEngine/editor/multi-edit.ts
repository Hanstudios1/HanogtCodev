/**
 * Editing several objects at once (V4). The Inspector shows the first selected
 * object's components; a change is applied to it exactly and, for the others,
 * only the values that changed are copied (editing X of a position keeps
 * every object's own Y and Z).
 */
import type { GameComponent, GameEntity } from "@/lib/game-engine/types";

export type ValueChange = { path: string[]; value: unknown; deleted?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJson(a: unknown, b: unknown) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Leaf values that differ between two versions of a component (arrays change as a whole). */
export function diffValues(before: unknown, after: unknown, path: string[] = [], out: ValueChange[] = []): ValueChange[] {
    if (Object.is(before, after)) return out;
    if (isRecord(before) && isRecord(after)) {
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
            if (!(key in after)) out.push({ path: [...path, key], value: undefined, deleted: true });
            else diffValues(before[key], after[key], [...path, key], out);
        }
        return out;
    }
    if (Array.isArray(before) && Array.isArray(after) && sameJson(before, after)) return out;
    out.push({ path, value: after });
    return out;
}

/** Writes changes into another component (never its id or type). */
export function applyValueChanges(target: Record<string, unknown>, changes: readonly ValueChange[]) {
    for (const change of changes) {
        if (!change.path.length || change.path[0] === "id" || change.path[0] === "type") continue;
        let cursor = target;
        for (const key of change.path.slice(0, -1)) {
            if (!isRecord(cursor[key])) cursor[key] = {};
            cursor = cursor[key] as Record<string, unknown>;
        }
        const last = change.path[change.path.length - 1];
        if (change.deleted) delete cursor[last];
        else cursor[last] = change.value === undefined ? undefined : JSON.parse(JSON.stringify(change.value));
    }
}

const UNCHANGED = "\u0000unchanged";

function poison(value: unknown): unknown {
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, poison(item)]));
    if (Array.isArray(value)) return JSON.parse(JSON.stringify(value));
    return UNCHANGED;
}

function written(original: unknown, probe: unknown, path: string[], out: string[][]) {
    if (isRecord(probe)) {
        for (const [key, item] of Object.entries(probe)) written(isRecord(original) ? original[key] : undefined, item, [...path, key], out);
        return;
    }
    if (Array.isArray(probe)) {
        if (!sameJson(original, probe)) out.push(path);
        return;
    }
    if (probe !== UNCHANGED) out.push(path);
}

/**
 * The single value an edit writes (when it writes exactly one), even if it
 * writes the value this object already had: "set all to 0.8" must still reach
 * the objects that hold 0.5. Null when it can't be told.
 */
export function writtenLeaf<T>(component: T, recipe: (draft: T) => void): string[] | null {
    try {
        const probe = poison(JSON.parse(JSON.stringify(component))) as T;
        recipe(probe);
        const out: string[][] = [];
        written(component, probe, [], out);
        return out.length === 1 && out[0].length ? out[0] : null;
    } catch {
        return null;
    }
}

export function valueAt(source: unknown, path: readonly string[]): unknown {
    let cursor = source;
    for (const key of path) cursor = isRecord(cursor) ? cursor[key] : undefined;
    return cursor;
}

/** What makes two components "the same one" on different objects: the type (and a script's class), counted in order. */
function componentKey(component: GameComponent) {
    return component.type === "script" ? `script:${component.scriptId}:${component.className ?? ""}` : component.type;
}

function keyed(entity: GameEntity) {
    const seen = new Map<string, number>();
    return entity.components.map((component) => {
        const key = componentKey(component);
        const index = seen.get(key) ?? 0;
        seen.set(key, index + 1);
        return { key: `${key}#${index}`, component };
    });
}

export type SharedComponent = {
    /** The first object's component (shown in the Inspector). */
    component: GameComponent;
    /** The same component on the other objects. */
    others: Array<{ entityId: string; componentId: string }>;
    /** Whether any of them holds different values. */
    mixed: boolean;
};

/** Components every selected object has, and the names of those only some have. */
export function sharedComponents(entities: readonly GameEntity[]): { shared: SharedComponent[]; partial: GameComponent[] } {
    if (!entities.length) return { shared: [], partial: [] };
    const [primary, ...rest] = entities;
    const restKeyed = rest.map((entity) => ({ entity, map: new Map(keyed(entity).map((item) => [item.key, item.component])) }));
    const shared: SharedComponent[] = [];
    const partial = new Map<string, GameComponent>();
    for (const { key, component } of keyed(primary)) {
        const others = restKeyed.map(({ entity, map }) => ({ entity, component: map.get(key) }));
        if (others.every((item) => item.component)) {
            const strip = (value: GameComponent) => ({ ...value, id: "" });
            const base = JSON.stringify(strip(component));
            shared.push({
                component,
                others: others.map((item) => ({ entityId: item.entity.id, componentId: item.component!.id })),
                mixed: others.some((item) => JSON.stringify(strip(item.component!)) !== base),
            });
        } else partial.set(key.replace(/#\d+$/, ""), component);
    }
    for (const { map } of restKeyed) {
        for (const [key, component] of map) {
            const plain = key.replace(/#\d+$/, "");
            if (!shared.some((item) => `${componentKey(item.component)}` === plain) && !partial.has(plain)) partial.set(plain, component);
        }
    }
    return { shared, partial: [...partial.values()] };
}

/** The roots of a selection: objects whose parent (or any ancestor) isn't selected too. */
export function selectionRoots(entities: readonly GameEntity[], ids: readonly string[]): string[] {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const chosen = new Set(ids);
    return ids.filter((id) => {
        let cursor = byId.get(id)?.parentId ?? null;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor)) {
            if (chosen.has(cursor)) return false;
            visited.add(cursor);
            cursor = byId.get(cursor)?.parentId ?? null;
        }
        return byId.has(id);
    });
}

/**
 * Hierarchy search: words match names and tags; "t:Type" keeps objects with
 * that component (a built-in type such as Camera or Rigidbody2D, or a script class).
 */
export function matchesSearch(entity: GameEntity, query: string, scriptClass: (component: GameComponent) => string | null, typeLabel: (component: GameComponent) => string[]): boolean {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    return terms.every((term) => {
        if (term.startsWith("t:") && term.length > 2) {
            const wanted = term.slice(2);
            return entity.components.some((component) => {
                const names = [...typeLabel(component), component.type, scriptClass(component) ?? ""].map((name) => name.toLocaleLowerCase().replace(/\s+/g, ""));
                return names.some((name) => name && (name === wanted || name.startsWith(wanted)));
            });
        }
        if (term.startsWith("tag:") && term.length > 4) return entity.tag.toLocaleLowerCase() === term.slice(4);
        return entity.name.toLocaleLowerCase().includes(term) || entity.tag.toLocaleLowerCase().includes(term);
    });
}
