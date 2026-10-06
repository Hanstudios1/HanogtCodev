/**
 * SaveSystem and JsonUtility (V5): script values to JSON and back, and save
 * slots kept in the browser's storage next to PlayerPrefs.
 *
 * Objects of the game's classes save their public and [SerializeField] fields
 * (like Unity's serializer); lists, arrays, dictionaries, vectors, colors and
 * rotations nest freely. References to scene objects can't be saved.
 */
import type { Interpreter } from "../script/interpreter";
import type { TypeRef } from "../script/ast";
import { ScriptObject, VMColor, VMDict, VMList, VMQuat, Vec3, type VMValue } from "../script/values";
import { hostError } from "./handles";

export const SAVE_LIMITS = {
    slots: 20,
    /** Characters of one slot's JSON. */
    slotBytes: 256 * 1024,
    /** Characters of all slots of a game together. */
    totalBytes: 512 * 1024,
    nameLength: 40,
    depth: 32,
} as const;

const SLOT_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,39}$/;
const INT_TYPES = new Set(["int", "long", "short", "byte", "sbyte", "uint", "ulong", "ushort", "char"]);
const FLOAT_TYPES = new Set(["float", "double", "decimal"]);
const LIST_TYPES = new Set(["List", "IList", "IEnumerable", "ICollection", "IReadOnlyList", "HashSet", "Queue", "Stack"]);

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Script values → JSON
// ---------------------------------------------------------------------------

interface ToJsonContext {
    /** Called once per kind of value that can't be saved (scene objects, functions…). */
    skip(kind: string): void;
    path: Set<object>;
    depth: number;
}

function finite(value: number) {
    return Number.isFinite(value) ? value : 0;
}

/** A script value as plain JSON; things that can't be saved become null (after a warning). */
export function toJsonValue(value: VMValue, context: ToJsonContext): JsonValue {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return finite(value);
    if (typeof value === "boolean" || typeof value === "string") return value;
    if (value instanceof Vec3) return value.is2D ? { x: finite(value.x), y: finite(value.y) } : { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
    if (value instanceof VMColor) return { r: finite(value.r), g: finite(value.g), b: finite(value.b), a: finite(value.a) };
    if (value instanceof VMQuat) return { x: finite(value.x), y: finite(value.y), z: finite(value.z), w: finite(value.w) };
    if (typeof value !== "object") return null;
    if (context.depth >= SAVE_LIMITS.depth) hostError(`Kaydedilen veri ${SAVE_LIMITS.depth} kattan derin olamaz.`, "ArgumentException");
    if (context.path.has(value)) hostError("Kaydedilen veri kendi içine dönüyor (bir nesne kendini ya da üstündeki bir nesneyi tutuyor).", "ArgumentException");
    context.path.add(value);
    context.depth += 1;
    try {
        if (value instanceof VMList) return value.items.map((item) => toJsonValue(item, context));
        if (value instanceof VMDict) {
            const output: Record<string, JsonValue> = {};
            for (const { key, value: item } of value.map.values()) {
                const name = String(key);
                if (name === "__proto__") continue;
                output[name] = toJsonValue(item, context);
            }
            return output;
        }
        if (value instanceof ScriptObject) {
            const output: Record<string, JsonValue> = {};
            for (const field of value.cls.allInstanceFields()) {
                if (!field.serialized) continue;
                output[field.name] = toJsonValue(value.fields[field.name], context);
            }
            return output;
        }
        context.skip("hostType" in value ? String((value as { hostType: unknown }).hostType) : "function");
        return null;
    } finally {
        context.depth -= 1;
        context.path.delete(value);
    }
}

// ---------------------------------------------------------------------------
// JSON → script values
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const numberOf = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : fallback);
const simpleType = (name: string): TypeRef => ({ name, args: [], isArray: false, raw: name, line: 0, col: 0 });

/** JSON without type information: objects become string-keyed dictionaries. */
function untyped(json: unknown, depth: number): VMValue {
    if (json === null || json === undefined) return null;
    if (typeof json === "number" || typeof json === "boolean" || typeof json === "string") return json;
    if (depth >= SAVE_LIMITS.depth) return null;
    if (Array.isArray(json)) return new VMList(json.map((item) => untyped(item, depth + 1)), "List");
    if (isRecord(json)) {
        const dict = new VMDict("string", null);
        for (const [key, value] of Object.entries(json)) dict.set(key, untyped(value, depth + 1));
        return dict;
    }
    return null;
}

/** JSON read into a declared type: the game's classes, lists, dictionaries, vectors… */
export function fromJsonValue(json: unknown, type: TypeRef | null, interp: Interpreter, depth = 0): VMValue {
    if (!type || json === null || json === undefined) return untyped(json, depth);
    if (depth >= SAVE_LIMITS.depth) return null;
    if (type.isArray) {
        const element = { ...type, isArray: false };
        return new VMList(Array.isArray(json) ? json.map((item) => fromJsonValue(item, element, interp, depth + 1)) : [], "Array", element.name);
    }
    const name = type.name;
    if (INT_TYPES.has(name)) return Math.trunc(numberOf(json));
    if (FLOAT_TYPES.has(name)) return numberOf(json);
    if (name === "bool") return json === true || json === 1 || json === "true";
    if (name === "string") return typeof json === "string" ? json : String(json);
    if (name === "Vector2" || name === "Vector2Int") return isRecord(json) ? new Vec3(numberOf(json.x), numberOf(json.y), 0, true) : new Vec3(0, 0, 0, true);
    if (name === "Vector3" || name === "Vector3Int") return isRecord(json) ? new Vec3(numberOf(json.x), numberOf(json.y), numberOf(json.z)) : new Vec3();
    if (name === "Color" || name === "Color32") return isRecord(json) ? new VMColor(numberOf(json.r, 1), numberOf(json.g, 1), numberOf(json.b, 1), numberOf(json.a, 1)) : new VMColor();
    if (name === "Quaternion") return isRecord(json) ? new VMQuat(numberOf(json.x), numberOf(json.y), numberOf(json.z), numberOf(json.w, 1)) : new VMQuat();
    if (LIST_TYPES.has(name)) {
        const element = type.args[0] ?? null;
        const kind = name === "HashSet" || name === "Queue" || name === "Stack" ? name : "List";
        return new VMList(Array.isArray(json) ? json.map((item) => fromJsonValue(item, element, interp, depth + 1)) : [], kind, element?.name ?? null);
    }
    if (name === "Dictionary" || name === "IDictionary" || name === "SortedDictionary") {
        const [keyType, valueType] = type.args;
        const dict = new VMDict(keyType?.name ?? null, valueType?.name ?? null);
        if (isRecord(json)) {
            for (const [key, value] of Object.entries(json)) {
                const typedKey = keyType && (INT_TYPES.has(keyType.name) || FLOAT_TYPES.has(keyType.name)) ? fromJsonValue(numberOf(key), keyType, interp, depth + 1) : key;
                dict.set(typedKey, fromJsonValue(value, valueType ?? null, interp, depth + 1));
            }
        }
        return dict;
    }
    const cls = interp.program.classes.get(name);
    if (cls) {
        if (!isRecord(json)) return null;
        if (cls.isBehaviour) hostError(`'${name}' bir MonoBehaviour; JSON'dan yeni bir tane oluşturulamaz. Var olan bileşene JsonUtility.FromJsonOverwrite(json, bileşen) ile yükleyin.`, "ArgumentException");
        const object = interp.instantiate(cls);
        overwriteFields(object, json, interp, depth + 1);
        return object;
    }
    // Enums and other value names: numbers and strings pass through.
    return untyped(json, depth);
}

/** Fills an object's saved fields from JSON (fields the JSON doesn't name keep their value). */
export function overwriteFields(object: ScriptObject, json: Record<string, unknown>, interp: Interpreter, depth = 0) {
    for (const field of object.cls.allInstanceFields()) {
        if (!field.serialized || !Object.prototype.hasOwnProperty.call(json, field.name)) continue;
        object.fields[field.name] = fromJsonValue(json[field.name], field.typeRef ?? simpleType(field.typeName), interp, depth);
    }
}

/** The type a generic argument names (`Load<SaveData>` → SaveData). */
export function typeFromArgument(typeArgs: string[]): TypeRef | null {
    const name = String(typeArgs[0] ?? "").trim().replace(/^System\./, "");
    return name ? simpleType(name) : null;
}

// ---------------------------------------------------------------------------
// Save slots
// ---------------------------------------------------------------------------

export interface SaveSlotInfo {
    name: string;
    savedAt: string;
    bytes: number;
}

type SaveStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A game's save slots: one storage entry per slot, plus an index (storage can't list its keys). */
export class SaveStore {
    private readonly storage: SaveStorage | null;
    private readonly prefix: string;
    /** Slots kept in memory when there's no storage (private windows, previews). */
    private readonly memory = new Map<string, string>();
    private slots: SaveSlotInfo[] = [];

    constructor(storage: SaveStorage | null, projectId: string) {
        this.storage = storage;
        this.prefix = `hanogt-engine:save:${projectId}`;
        try {
            const raw = storage?.getItem(this.prefix);
            const parsed: unknown = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) {
                this.slots = parsed
                    .filter((item): item is SaveSlotInfo => isRecord(item) && typeof item.name === "string" && SLOT_NAME.test(item.name) && typeof item.savedAt === "string" && typeof item.bytes === "number")
                    .slice(0, SAVE_LIMITS.slots);
            }
        } catch {
            this.slots = [];
        }
    }

    /** Throws for names scripts can't use. */
    static checkName(value: unknown): string {
        const name = String(value ?? "").trim();
        if (!SLOT_NAME.test(name)) hostError(`'${name}' bir kayıt yuvası adı olamaz: harf ya da rakamla başlayan, en fazla ${SAVE_LIMITS.nameLength} karakterlik bir ad verin (harf, rakam, boşluk, _ . -).`, "ArgumentException");
        return name;
    }

    list(): readonly SaveSlotInfo[] {
        return this.slots;
    }

    info(name: string): SaveSlotInfo | null {
        return this.slots.find((slot) => slot.name === name) ?? null;
    }

    private key(name: string) {
        return `${this.prefix}:${name}`;
    }

    private writeIndex() {
        this.storage?.setItem(this.prefix, JSON.stringify(this.slots));
    }

    read(name: string): string | null {
        if (!this.info(name)) return null;
        if (!this.storage) return this.memory.get(name) ?? null;
        try {
            return this.storage.getItem(this.key(name));
        } catch {
            return null;
        }
    }

    /** Stores a slot; an error message when it doesn't fit (null when it was saved). */
    write(name: string, json: string, savedAt: string): string | null {
        if (json.length > SAVE_LIMITS.slotBytes) return `'${name}' kaydı ${Math.ceil(json.length / 1024)} KB; bir yuva en fazla ${SAVE_LIMITS.slotBytes / 1024} KB olabilir.`;
        const others = this.slots.filter((slot) => slot.name !== name);
        if (others.length >= SAVE_LIMITS.slots) return `Bir oyunun en fazla ${SAVE_LIMITS.slots} kayıt yuvası olabilir; önce SaveSystem.Delete ile birini silin.`;
        const total = others.reduce((sum, slot) => sum + slot.bytes, 0) + json.length;
        if (total > SAVE_LIMITS.totalBytes) return `Kayıtların toplamı ${SAVE_LIMITS.totalBytes / 1024} KB'ı aşamaz (şu an ${Math.ceil(total / 1024)} KB olurdu).`;
        const entry: SaveSlotInfo = { name, savedAt, bytes: json.length };
        const existing = this.slots.findIndex((slot) => slot.name === name);
        const next = existing >= 0 ? this.slots.map((slot, index) => (index === existing ? entry : slot)) : [...this.slots, entry];
        if (!this.storage) {
            this.memory.set(name, json);
            this.slots = next;
            return null;
        }
        try {
            this.storage.setItem(this.key(name), json);
            this.slots = next;
            this.writeIndex();
            return null;
        } catch {
            return "Tarayıcının depolama alanı dolu; kayıt yapılamadı.";
        }
    }

    delete(name: string): boolean {
        if (!this.info(name)) return false;
        this.slots = this.slots.filter((slot) => slot.name !== name);
        this.memory.delete(name);
        try {
            this.storage?.removeItem(this.key(name));
            this.writeIndex();
        } catch {
            // The index no longer lists it either way.
        }
        return true;
    }

    clear() {
        for (const slot of [...this.slots]) this.delete(slot.name);
        try {
            this.storage?.removeItem(this.prefix);
        } catch {
            // Nothing left to remove.
        }
    }
}
