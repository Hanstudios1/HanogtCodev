/** Runtime values of the Hanogt script VM. */
import type { BlockStmt, ClassDecl, Expr, FieldDecl, MethodDecl, PropertyDecl, TypeRef } from "./ast";
import type { ScriptFieldValue } from "../types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class VMError extends Error {
    line = 0;
    col = 0;
    scriptName = "";
    /** C#-style exception type name shown in the console. */
    exceptionType: string;
    /** Script-level stack (method names) for the console. */
    trace: string[] = [];
    constructor(message: string, exceptionType = "Exception") {
        super(message);
        this.name = "VMError";
        this.exceptionType = exceptionType;
    }
}

/** Thrown when a script exceeds its per-frame instruction budget. Never catchable by scripts. */
export class BudgetExceededError extends VMError {
    constructor() {
        super("Script komut bütçesini aştı (olası sonsuz döngü).", "InfiniteLoopGuard");
        this.name = "BudgetExceededError";
    }
}

/** Thrown when call depth grows beyond the limit (runaway recursion). */
export class StackOverflowVMError extends VMError {
    constructor() {
        super("Çok derin özyineleme (StackOverflow).", "StackOverflowException");
    }
}

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export class Vec3 {
    constructor(public x = 0, public y = 0, public z = 0, public is2D = false) {}
    clone(): Vec3 {
        return new Vec3(this.x, this.y, this.z, this.is2D);
    }
    get magnitude(): number {
        return Math.hypot(this.x, this.y, this.z);
    }
    get sqrMagnitude(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    normalized(): Vec3 {
        const length = this.magnitude;
        return length > 1e-9 ? new Vec3(this.x / length, this.y / length, this.z / length, this.is2D) : new Vec3(0, 0, 0, this.is2D);
    }
    assign(other: { x: number; y: number; z?: number }): this {
        this.x = other.x;
        this.y = other.y;
        if (!this.is2D && other.z !== undefined) this.z = other.z;
        return this;
    }
    toString(): string {
        const f = (value: number) => (Math.abs(value) < 5e-4 ? 0 : value).toFixed(2);
        return this.is2D ? `(${f(this.x)}, ${f(this.y)})` : `(${f(this.x)}, ${f(this.y)}, ${f(this.z)})`;
    }
}

export class VMColor {
    constructor(public r = 1, public g = 1, public b = 1, public a = 1) {}
    clone(): VMColor {
        return new VMColor(this.r, this.g, this.b, this.a);
    }
    toHex(): string {
        const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0");
        return `#${channel(this.r)}${channel(this.g)}${channel(this.b)}`;
    }
    static fromHex(hex: string, alpha = 1): VMColor {
        const clean = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? "ffffff";
        return new VMColor(parseInt(clean.slice(0, 2), 16) / 255, parseInt(clean.slice(2, 4), 16) / 255, parseInt(clean.slice(4, 6), 16) / 255, alpha);
    }
    toString(): string {
        return `RGBA(${this.r.toFixed(3)}, ${this.g.toFixed(3)}, ${this.b.toFixed(3)}, ${this.a.toFixed(3)})`;
    }
}

export class VMQuat {
    constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
    clone(): VMQuat {
        return new VMQuat(this.x, this.y, this.z, this.w);
    }
    toString(): string {
        return `(${this.x.toFixed(5)}, ${this.y.toFixed(5)}, ${this.z.toFixed(5)}, ${this.w.toFixed(5)})`;
    }
}

export type CollectionKind = "List" | "Array" | "HashSet" | "Queue" | "Stack";

export class VMList {
    constructor(public items: VMValue[] = [], public kind: CollectionKind = "List", public elementType: string | null = null) {}
}

export class VMDict {
    readonly map = new Map<unknown, { key: VMValue; value: VMValue }>();
    constructor(public keyType: string | null = null, public valueType: string | null = null) {}
    static keyOf(key: VMValue): unknown {
        if (key instanceof Vec3) return `v:${key.x},${key.y},${key.z}`;
        if (key instanceof VMColor) return `c:${key.r},${key.g},${key.b},${key.a}`;
        return key;
    }
    get(key: VMValue) {
        return this.map.get(VMDict.keyOf(key));
    }
    set(key: VMValue, value: VMValue) {
        this.map.set(VMDict.keyOf(key), { key, value });
    }
    has(key: VMValue) {
        return this.map.has(VMDict.keyOf(key));
    }
    delete(key: VMValue) {
        return this.map.delete(VMDict.keyOf(key));
    }
}

export class VMPair {
    constructor(public key: VMValue, public value: VMValue) {}
}

/** Minimal C++ iterator (`v.begin() + i`) for std algorithms and erase/insert. */
export class VMIterator {
    constructor(public readonly list: VMList, public readonly index: number) {}
}

/** `std::cout` / `std::cerr` stream objects. */
export class CoutStream {
    buffer = "";
    constructor(public readonly level: "info" | "error") {}
}

export class EndlToken {}

/** Instance of `System.Random`. */
export class VMRandom {
    private state: number;
    constructor(seed?: number) {
        this.state = (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0 || 1;
    }
    next(): number {
        // xorshift32
        let x = this.state;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.state = x >>> 0;
        return this.state / 4294967296;
    }
}

export class VMException {
    constructor(public readonly exceptionType: string, public readonly message: string) {}
}

// ---------------------------------------------------------------------------
// Classes, instances and callables
// ---------------------------------------------------------------------------

export interface FieldInfo {
    name: string;
    typeName: string;
    typeRef: TypeRef;
    decl: FieldDecl;
    isStatic: boolean;
    isConst: boolean;
    /** Shown and editable in the Inspector (public or [SerializeField]). */
    serialized: boolean;
    range?: [number, number];
    header?: string;
    tooltip?: string;
    /** Constant initialiser, evaluated at compile time for the Inspector. */
    defaultValue?: ScriptFieldValue;
}

export class EnumInfo {
    readonly values = new Map<string, number>();
    readonly names = new Map<number, string>();
    constructor(public readonly name: string) {}
}

export class ClassInfo {
    base: ClassInfo | null = null;
    isBehaviour = false;
    readonly fields: FieldInfo[] = [];
    readonly staticValues = new Map<string, VMValue>();
    readonly methods = new Map<string, MethodDecl[]>();
    readonly properties = new Map<string, PropertyDecl>();
    private readonly lowerIndex = new Map<string, string>();
    staticsInitialised = false;

    constructor(public readonly name: string, public readonly decl: ClassDecl, public readonly dialect: "csharp" | "cpp") {}

    get scriptId() {
        return this.decl.scriptId;
    }

    get scriptName() {
        return this.decl.scriptName;
    }

    get baseName(): string | null {
        return this.decl.baseNames[0] ?? null;
    }

    addMethod(method: MethodDecl) {
        const list = this.methods.get(method.name) ?? [];
        list.push(method);
        this.methods.set(method.name, list);
        this.lowerIndex.set(method.name.toLowerCase(), method.name);
    }

    /** Finds a method walking the base chain; overloads are chosen by argument count. */
    findMethod(name: string, argc: number, caseInsensitive = false): { method: MethodDecl; owner: ClassInfo } | null {
        let cls: ClassInfo | null = this;
        while (cls) {
            const actual = cls.methods.has(name) ? name : caseInsensitive ? cls.lowerIndex.get(name.toLowerCase()) : undefined;
            const candidates = actual ? cls.methods.get(actual) : undefined;
            if (candidates?.length) {
                const exact = candidates.find((method) => method.body && method.params.length === argc && !method.isConstructor)
                    ?? candidates.find((method) => method.body && !method.isConstructor && argc <= method.params.length && method.params.slice(argc).every((param) => param.defaultValue || param.modifier === "params"))
                    ?? candidates.find((method) => method.body && !method.isConstructor && method.params.some((param) => param.modifier === "params"));
                if (exact) return { method: exact, owner: cls };
            }
            cls = cls.base;
        }
        return null;
    }

    hasMethodNamed(name: string, caseInsensitive = false): boolean {
        let cls: ClassInfo | null = this;
        while (cls) {
            if (cls.methods.has(name) || (caseInsensitive && cls.lowerIndex.has(name.toLowerCase()))) return true;
            cls = cls.base;
        }
        return false;
    }

    findConstructor(argc: number): MethodDecl | null {
        const candidates = this.methods.get(this.name) ?? [];
        return candidates.find((method) => method.isConstructor && method.body && method.params.length === argc)
            ?? candidates.find((method) => method.isConstructor && method.body && argc <= method.params.length && method.params.slice(argc).every((param) => param.defaultValue))
            ?? null;
    }

    findField(name: string): FieldInfo | null {
        let cls: ClassInfo | null = this;
        while (cls) {
            const field = cls.fields.find((candidate) => candidate.name === name);
            if (field) return field;
            cls = cls.base;
        }
        return null;
    }

    findProperty(name: string): { property: PropertyDecl; owner: ClassInfo } | null {
        let cls: ClassInfo | null = this;
        while (cls) {
            const property = cls.properties.get(name);
            if (property) return { property, owner: cls };
            cls = cls.base;
        }
        return null;
    }

    /** Class that owns a static field (walks the base chain). */
    staticOwner(name: string): ClassInfo | null {
        let cls: ClassInfo | null = this;
        while (cls) {
            if (cls.fields.some((field) => field.isStatic && field.name === name)) return cls;
            cls = cls.base;
        }
        return null;
    }

    isSubclassOf(name: string): boolean {
        let cls: ClassInfo | null = this;
        while (cls) {
            if (cls.name === name) return true;
            if (!cls.base && cls.decl.baseNames.includes(name)) return true;
            cls = cls.base;
        }
        return false;
    }

    allInstanceFields(): FieldInfo[] {
        const chain: ClassInfo[] = [];
        let cls: ClassInfo | null = this;
        while (cls) {
            chain.unshift(cls);
            cls = cls.base;
        }
        return chain.flatMap((item) => item.fields.filter((field) => !field.isStatic));
    }
}

/** Anything provided by the engine (GameObject, Transform, components, hits…). */
export interface HostObject {
    readonly hostType: string;
    get(name: string): VMValue;
    set(name: string, value: VMValue): void;
    /** `refs[i]` is set when argument i was passed with `ref`/`out`. */
    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue;
    /** False once the underlying engine object was destroyed (Unity "fake null"). */
    isAlive?(): boolean;
    /** Enables `foreach (Transform child in transform)`. */
    iterate?(): VMValue[];
    /** Type test used by `is`, `as` and GetComponent. */
    isType?(typeName: string): boolean;
    /** Custom truthiness (e.g. a RaycastHit2D that missed converts to false). */
    truthy?(): boolean;
    toString(): string;
}

export function isHostObject(value: unknown): value is HostObject {
    return typeof value === "object" && value !== null && typeof (value as HostObject).hostType === "string" && typeof (value as HostObject).call === "function";
}

export class ScriptObject {
    readonly fields: Record<string, VMValue> = Object.create(null);
    /** Behaviour binding (set by the runtime for components). */
    behaviour: BehaviourBinding | null = null;
    constructor(public readonly cls: ClassInfo) {}
    toString() {
        return this.cls.name;
    }
}

/** What a behaviour instance exposes as inherited members (transform, gameObject, …). */
export interface BehaviourBinding {
    gameObject: HostObject;
    getMember(name: string): VMValue | typeof NOT_FOUND;
    setMember(name: string, value: VMValue): boolean;
    callMember(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue | typeof NOT_FOUND;
}

export const NOT_FOUND: unique symbol = Symbol("not-found");

export class VMLambda {
    constructor(
        public readonly params: string[],
        public readonly body: Expr | BlockStmt,
        public readonly scope: unknown,
        public readonly self: ScriptObject | null,
        public readonly cls: ClassInfo | null,
    ) {}
}

export class VMBoundMethod {
    constructor(public readonly self: ScriptObject | null, public readonly cls: ClassInfo, public readonly name: string) {}
}

export class VMNativeFunction {
    constructor(public readonly name: string, public readonly fn: (args: VMValue[]) => VMValue) {}
}

export class VMRef {
    constructor(public readonly get: () => VMValue, public readonly set: (value: VMValue) => void) {}
}

/** Static API surface such as `Mathf`, `Input`, `Vector3` (statics) or `std`. */
export class StaticNamespace {
    constructor(
        public readonly name: string,
        public readonly getMember: (name: string) => VMValue | typeof NOT_FOUND,
        public readonly callMember: (name: string, args: VMValue[], typeArgs: string[], refs: Array<VMRef | null>) => VMValue | typeof NOT_FOUND,
        public readonly setMember?: (name: string, value: VMValue) => boolean,
    ) {}
}

export type YieldKind = "frame" | "seconds" | "realtime" | "until" | "while" | "coroutine" | "fixed" | "endOfFrame";

export class YieldInstruction {
    constructor(public readonly kind: YieldKind, public readonly value: VMValue = null) {}
}

export class VMCoroutine {
    done = false;
    /** Set once scheduled via StartCoroutine. */
    started = false;
    constructor(public readonly methodName: string, public readonly generator: Generator<VMValue, void, void>) {}
}

export type VMValue =
    | number
    | string
    | boolean
    | null
    | undefined
    | Vec3
    | VMColor
    | VMQuat
    | VMList
    | VMDict
    | VMPair
    | VMIterator
    | VMRandom
    | VMException
    | CoutStream
    | EndlToken
    | ScriptObject
    | VMLambda
    | VMBoundMethod
    | VMNativeFunction
    | VMRef
    | StaticNamespace
    | EnumInfo
    | ClassInfo
    | YieldInstruction
    | VMCoroutine
    | HostObject;
