/**
 * The editor's Watch panel (V4): reads values of the running game by a path
 * such as "Player.score", "Player.transform.position", "Enemy.Rigidbody2D.velocity",
 * "Spawner.enemies.Count", "Spawner.enemies[0].name", "GameManager.highScore"
 * (a static field) or "Time.time".
 *
 * The first part is an object of the scene (by name), a script class (its
 * static fields) or an engine namespace. Script values are read from their
 * fields only: properties are never run, so watching can't change the game.
 */
import type { RuntimeEntity } from "./entity";
import type { RuntimeWorld } from "./world";
import { ClassInfo, ScriptObject, StaticNamespace, VMColor, VMDict, VMList, VMQuat, Vec3, isHostObject, NOT_FOUND, type VMValue } from "../script/values";

export type WatchKind = "number" | "bool" | "string" | "vector" | "object" | "null";

export type WatchResult =
    | { ok: true; text: string; kind: WatchKind; /** Plain numbers, for the history line. */ number: number | null }
    | { ok: false; error: string };

type Segment = { name: string; index: number[] };

const NAMESPACES = new Set(["Time", "Screen", "Input", "Audio", "Physics", "Physics2D", "Application", "Camera", "Cursor", "SceneManager", "Pathfinding", "ScreenEffects", "Localization", "PlayerInput", "SaveSystem", "Leaderboard", "Achievements"]);

/** Splits "Spawner.enemies[0].name" into parts; null when it can't be read. */
export function parseWatchPath(path: string): Segment[] | null {
    const text = path.trim();
    if (!text || text.length > 200) return null;
    const segments: Segment[] = [];
    for (const raw of text.split(".")) {
        const match = /^([^[\]]+?)\s*((?:\[\s*\d{1,6}\s*\])*)$/.exec(raw.trim());
        if (!match) return null;
        const index = [...match[2].matchAll(/\d+/g)].map((item) => Number(item[0]));
        segments.push({ name: match[1].trim(), index });
    }
    return segments.length ? segments : null;
}

function formatNumber(value: number) {
    if (!Number.isFinite(value)) return String(value);
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 1000) / 1000);
}

function describe(value: VMValue): { text: string; kind: WatchKind; number: number | null } {
    if (value === null || value === undefined) return { text: "null", kind: "null", number: null };
    if (typeof value === "number") return { text: formatNumber(value), kind: "number", number: Number.isFinite(value) ? value : null };
    if (typeof value === "boolean") return { text: value ? "True" : "False", kind: "bool", number: null };
    if (typeof value === "string") return { text: JSON.stringify(value.length > 120 ? `${value.slice(0, 120)}…` : value), kind: "string", number: null };
    if (value instanceof Vec3) return { text: value.is2D ? `(${formatNumber(value.x)}, ${formatNumber(value.y)})` : `(${formatNumber(value.x)}, ${formatNumber(value.y)}, ${formatNumber(value.z)})`, kind: "vector", number: null };
    if (value instanceof VMColor) return { text: value.toString(), kind: "vector", number: null };
    if (value instanceof VMQuat) return { text: value.toString(), kind: "vector", number: null };
    if (value instanceof VMList) {
        const items = value.items.slice(0, 6).map((item) => describe(item).text);
        return { text: `${value.kind}(${value.items.length}) [${items.join(", ")}${value.items.length > 6 ? ", …" : ""}]`, kind: "object", number: null };
    }
    if (value instanceof VMDict) return { text: `Dictionary(${value.map.size})`, kind: "object", number: null };
    if (value instanceof ScriptObject) return { text: value.cls.name, kind: "object", number: null };
    if (isHostObject(value)) {
        if (value.isAlive && !value.isAlive()) return { text: "null (destroyed)", kind: "null", number: null };
        return { text: value.toString(), kind: "object", number: null };
    }
    if (value instanceof StaticNamespace) return { text: value.name, kind: "object", number: null };
    return { text: String(value), kind: "object", number: null };
}

class WatchError extends Error {}

/** An object of the running scene by name (an active one first). */
function findEntity(world: RuntimeWorld, name: string): RuntimeEntity | null {
    let fallback: RuntimeEntity | null = null;
    for (const entity of world.entities.values()) {
        if (entity.destroyed || entity.name !== name) continue;
        if (entity.activeInHierarchy) return entity;
        fallback ??= entity;
    }
    return fallback;
}

/** "Player.x": a field of one of its scripts, a GameObject member, or one of its components by type. */
function entityMember(world: RuntimeWorld, entity: RuntimeEntity, name: string): VMValue {
    for (const state of entity.behaviours) {
        if (!state.destroyed && name in state.object.fields) return state.object.fields[name];
    }
    // A static field of one of its scripts ("Hero.highScore").
    for (const state of entity.behaviours) {
        const owner = state.cls.staticOwner(name);
        if (owner) return owner.staticValues.get(name) ?? null;
    }
    try {
        return world.gameObjectHandle(entity).get(name);
    } catch {
        // Not a GameObject member: maybe a component type.
    }
    if (world.isKnownComponentType(name)) {
        const component = world.getComponent(entity, name);
        if (component !== null && component !== undefined) return component;
        throw new WatchError(`"${entity.name}" nesnesinde ${name} bileşeni yok.`);
    }
    throw new WatchError(`"${entity.name}" nesnesinde '${name}' bulunamadı.`);
}

function member(value: VMValue, name: string): VMValue {
    if (value === null || value === undefined) throw new WatchError(`'${name}' okunamadı: değer null.`);
    if (value instanceof ScriptObject) {
        if (name in value.fields) return value.fields[name];
        if (value.behaviour) {
            const inherited = value.behaviour.getMember(name);
            if (inherited !== NOT_FOUND && (name === "transform" || name === "gameObject" || name === "name" || name === "tag" || name === "enabled")) return inherited;
        }
        throw new WatchError(`${value.cls.name} içinde '${name}' alanı yok (özellikler izlenmez, yalnızca alanlar).`);
    }
    if (value instanceof Vec3) {
        if (name === "x" || name === "y" || name === "z") return value[name];
        if (name === "magnitude") return Math.hypot(value.x, value.y, value.z);
        throw new WatchError(`Vector içinde '${name}' yok.`);
    }
    if (value instanceof VMColor) {
        if (name === "r" || name === "g" || name === "b" || name === "a") return value[name];
        throw new WatchError(`Color içinde '${name}' yok.`);
    }
    if (value instanceof VMQuat) {
        if (name === "x" || name === "y" || name === "z" || name === "w") return value[name];
        throw new WatchError(`Quaternion içinde '${name}' yok.`);
    }
    if (value instanceof VMList) {
        if (name === "Count" || name === "Length") return value.items.length;
        throw new WatchError(`Liste içinde '${name}' yok.`);
    }
    if (value instanceof VMDict) {
        if (name === "Count") return value.map.size;
        throw new WatchError(`Sözlük içinde '${name}' yok.`);
    }
    if (value instanceof StaticNamespace) {
        const found = value.getMember(name);
        if (found === NOT_FOUND) throw new WatchError(`${value.name} içinde '${name}' yok.`);
        return found;
    }
    if (isHostObject(value)) {
        if (value.isAlive && !value.isAlive()) throw new WatchError("Nesne yok edildi.");
        try {
            return value.get(name);
        } catch (error) {
            throw new WatchError(error instanceof Error ? error.message : `'${name}' okunamadı.`);
        }
    }
    throw new WatchError(`'${name}' okunamadı.`);
}

function indexed(value: VMValue, index: number): VMValue {
    if (value instanceof VMList) {
        if (index >= value.items.length) throw new WatchError(`[${index}] listenin dışında (${value.items.length} öğe).`);
        return value.items[index];
    }
    throw new WatchError(`[${index}] yalnızca listelerde kullanılabilir.`);
}

type Root = { kind: "entity"; entity: RuntimeEntity } | { kind: "class"; cls: ClassInfo } | { kind: "value"; value: VMValue };

function root(world: RuntimeWorld, name: string): Root {
    const entity = findEntity(world, name);
    if (entity) return { kind: "entity", entity };
    const cls = world.program.classes.get(name);
    if (cls) return { kind: "class", cls };
    if (NAMESPACES.has(name)) {
        const global = world.resolveGlobal(name);
        if (global !== NOT_FOUND) return { kind: "value", value: global };
    }
    throw new WatchError(`"${name}" adında bir nesne, sınıf ya da motor alanı yok.`);
}

function follow(value: VMValue, index: number[]) {
    let current = value;
    for (const item of index) current = indexed(current, item);
    return current;
}

/** Reads one watch from the running world. */
export function readWatch(world: RuntimeWorld, path: string): WatchResult {
    const segments = parseWatchPath(path);
    if (!segments) return { ok: false, error: "Örnek: Player.score, Player.transform.position, Time.time" };
    try {
        const [first, ...rest] = segments;
        const start = root(world, first.name);
        let value: VMValue;
        let remaining = rest;
        if (start.kind === "entity") {
            if (first.index.length) throw new WatchError(`[${first.index[0]}] yalnızca listelerde kullanılabilir.`);
            if (!rest.length) value = world.gameObjectHandle(start.entity);
            else {
                value = follow(entityMember(world, start.entity, rest[0].name), rest[0].index);
                remaining = rest.slice(1);
            }
        } else if (start.kind === "class") {
            // A script class: its static fields.
            const cls = start.cls;
            if (!rest.length) throw new WatchError(`${cls.name} sınıfının hangi statik alanı? Örnek: ${cls.name}.score`);
            const owner = cls.staticOwner(rest[0].name);
            if (!owner) throw new WatchError(`${cls.name} içinde '${rest[0].name}' statik alanı yok.`);
            value = follow(owner.staticValues.get(rest[0].name) ?? null, rest[0].index);
            remaining = rest.slice(1);
        } else {
            value = follow(start.value, first.index);
        }
        for (const segment of remaining) value = follow(member(value, segment.name), segment.index);
        return { ok: true, ...describe(value) };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/** Suggestions for the watch box: objects of the scene with their script fields, then common engine values. */
export function watchSuggestions(world: RuntimeWorld, limit = 60): string[] {
    const output: string[] = [];
    const seen = new Set<string>();
    const add = (value: string) => {
        if (output.length < limit && !seen.has(value)) {
            seen.add(value);
            output.push(value);
        }
    };
    for (const entity of world.entities.values()) {
        if (entity.destroyed) continue;
        for (const state of entity.behaviours) {
            for (const field of Object.keys(state.object.fields)) add(`${entity.name}.${field}`);
        }
        add(`${entity.name}.transform.position`);
        if (output.length >= limit) break;
    }
    for (const value of ["Time.time", "Time.timeScale", "Time.deltaTime", "Input.mousePosition"]) add(value);
    return output;
}
