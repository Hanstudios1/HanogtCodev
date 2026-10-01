/** Runtime values of the Hanogt script VM. */
/* eslint-disable @typescript-eslint/no-this-alias -- parent/base chains are walked starting from `this`. */
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
    x: number;
    y: number;
    z: number;
    is2D: boolean;
    constructor(x = 0, y = 0, z = 0, is2D = false) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.is2D = is2D;
    }
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
    r: number;
    g: number;
    b: number;
    a: number;
    constructor(r = 1, g = 1, b = 1, a = 1) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
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
    x: number;
    y: number;
    z: number;
    w: number;
    constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }
    clone(): VMQuat {
        return new VMQuat(this.x, this.y, this.z, this.w);
    }
    toString(): string {
        return `(${this.x.toFixed(5)}, ${this.y.toFixed(5)}, ${this.z.toFixed(5)}, ${this.w.toFixed(5)})`;
    }
}

export type CollectionKind = "List" | "Array" | "HashSet" | "Queue" | "Stack";

export class VMList {
    items: VMValue[];
    kind: CollectionKind;
    elementType: string | null;
    constructor(items: VMValue[] = [], kind: CollectionKind = "List", elementType: string | null = null) {
        this.items = items;
        this.kind = kind;
        this.elementType = elementType;
    }
}

export class VMDict {
    readonly map = new Map<unknown, { key: VMValue; value: VMValue }>();
    keyType: string | null;
    valueType: string | null;
    constructor(keyType: string | null = null, valueType: string | null = null) {
        this.keyType = keyType;
        this.valueType = valueType;
    }
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
    key: VMValue;
    value: VMValue;
    constructor(key: VMValue, value: VMValue) {
        this.key = key;
        this.value = value;
    }
}

/** Minimal C++ iterator (`v.begin() + i`) for std algorithms and erase/insert. */
export class VMIterator {
    readonly list: VMList;
    readonly index: number;
    constructor(list: VMList, index: number) {
        this.list = list;
        this.index = index;
    }
}

/** `std::cout` / `std::cerr` stream objects. */
export class CoutStream {
    buffer = "";
    readonly level: "info" | "error";
    constructor(level: "info" | "error") {
        this.level = level;
    }
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
    readonly exceptionType: string;
    readonly message: string;
    constructor(exceptionType: string, message: string) {
        this.exceptionType = exceptionType;
        this.message = message;
    }
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
    readonly name: string;
    constructor(name: string) {
        this.name = name;
    }
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

    readonly name: string;
    readonly decl: ClassDecl;
    readonly dialect: "csharp" | "cpp";
    constructor(name: string, decl: ClassDecl, dialect: "csharp" | "cpp") {
        this.name = name;
        this.decl = decl;
        this.dialect = dialect;
    }

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
    readonly cls: ClassInfo;
    constructor(cls: ClassInfo) {
        this.cls = cls;
    }
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
    readonly params: string[];
    readonly body: Expr | BlockStmt;
    readonly scope: unknown;
    readonly self: ScriptObject | null;
    readonly cls: ClassInfo | null;
    constructor(
        params: string[],
        body: Expr | BlockStmt,
        scope: unknown,
        self: ScriptObject | null,
        cls: ClassInfo | null,
    ) {
        this.params = params;
        this.body = body;
        this.scope = scope;
        this.self = self;
        this.cls = cls;
    }
}

export class VMBoundMethod {
    readonly self: ScriptObject | null;
    readonly cls: ClassInfo;
    readonly name: string;
    constructor(self: ScriptObject | null, cls: ClassInfo, name: string) {
        this.self = self;
        this.cls = cls;
        this.name = name;
    }
}

export class VMNativeFunction {
    readonly name: string;
    readonly fn: (args: VMValue[]) => VMValue;
    constructor(name: string, fn: (args: VMValue[]) => VMValue) {
        this.name = name;
        this.fn = fn;
    }
}

export class VMRef {
    readonly get: () => VMValue;
    readonly set: (value: VMValue) => void;
    constructor(get: () => VMValue, set: (value: VMValue) => void) {
        this.get = get;
        this.set = set;
    }
}

/** Static API surface such as `Mathf`, `Input`, `Vector3` (statics) or `std`. */
export class StaticNamespace {
    readonly name: string;
    readonly getMember: (name: string) => VMValue | typeof NOT_FOUND;
    readonly callMember: (name: string, args: VMValue[], typeArgs: string[], refs: Array<VMRef | null>) => VMValue | typeof NOT_FOUND;
    readonly setMember?: (name: string, value: VMValue) => boolean;
    constructor(
        name: string,
        getMember: (name: string) => VMValue | typeof NOT_FOUND,
        callMember: (name: string, args: VMValue[], typeArgs: string[], refs: Array<VMRef | null>) => VMValue | typeof NOT_FOUND,
        setMember?: (name: string, value: VMValue) => boolean,
    ) {
        this.name = name;
        this.getMember = getMember;
        this.callMember = callMember;
        this.setMember = setMember;
    }
}

export type YieldKind = "frame" | "seconds" | "realtime" | "until" | "while" | "coroutine" | "fixed" | "endOfFrame";

export class YieldInstruction {
    readonly kind: YieldKind;
    readonly value: VMValue;
    constructor(kind: YieldKind, value: VMValue = null) {
        this.kind = kind;
        this.value = value;
    }
}

export class VMCoroutine {
    done = false;
    /** Set once scheduled via StartCoroutine. */
    started = false;
    readonly methodName: string;
    readonly generator: Generator<VMValue, void, void>;
    constructor(methodName: string, generator: Generator<VMValue, void, void>) {
        this.methodName = methodName;
        this.generator = generator;
    }
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
