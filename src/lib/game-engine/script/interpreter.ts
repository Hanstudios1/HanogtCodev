/**
 * Tree-walking interpreter for the Hanogt script VM.
 *
 * Scripts never touch the DOM, the network or JavaScript globals: every value
 * they can reach is created here, by stdlib.ts or by the engine host. Each
 * frame has an instruction budget so infinite loops are stopped instead of
 * freezing the tab.
 */
import type { ScriptFieldValue } from "../types";
import type { Argument, BlockStmt, Expr, MethodDecl, Stmt, TypeRef } from "./ast";
import type { CompiledProgram } from "./compiler";
import {
    callBuiltinMethod,
    constructBuiltin,
    createStdlib,
    defaultForTypeName,
    formatValue,
    getBuiltinMember,
    setBuiltinMember,
    toDisplayString,
    vmEquals,
    vmTruthy,
} from "./stdlib";
import {
    BudgetExceededError,
    ClassInfo,
    CoutStream,
    EndlToken,
    EnumInfo,
    isHostObject,
    NOT_FOUND,
    ScriptObject,
    StackOverflowVMError,
    StaticNamespace,
    Vec3,
    VMBoundMethod,
    VMColor,
    VMCoroutine,
    VMDict,
    VMError,
    VMException,
    VMIterator,
    VMLambda,
    VMList,
    VMNativeFunction,
    VMPair,
    VMQuat,
    VMRef,
    type BehaviourBinding,
    type FieldInfo,
    type HostObject,
    type VMValue,
} from "./values";

export interface ScriptHost {
    log(level: "info" | "warning" | "error", message: string, source?: { scriptName: string; line: number }): void;
    /** Engine namespaces such as Time, Input, Physics, SceneManager, GameObject, Debug… */
    resolveGlobal(name: string): VMValue | typeof NOT_FOUND;
    /** `new GameObject("x")` and other engine constructors. */
    construct(typeName: string, args: VMValue[]): VMValue | typeof NOT_FOUND;
    /** Name of the sound an AudioClip field set in the Inspector points to (V4). */
    audioClipName?(ref: string): string;
}

const NORMAL = 0;
const BREAK = 1;
const CONTINUE = 2;
const RETURN = 3;

const MAX_DEPTH = 200;

class Scope {
    readonly vars = new Map<string, VMValue>();
    refNames: Set<string> | null = null;
    readonly parent: Scope | null;
    constructor(parent: Scope | null) {
        this.parent = parent;
    }
}

interface Frame {
    self: ScriptObject | null;
    cls: ClassInfo | null;
    dialect: "csharp" | "cpp";
    scriptName: string;
    method: string;
    scope: Scope;
    returnValue: VMValue;
    line: number;
}

type LValue = { get: () => VMValue; set: (value: VMValue) => void };

function isStruct(value: VMValue): value is Vec3 | VMColor | VMQuat {
    return value instanceof Vec3 || value instanceof VMColor || value instanceof VMQuat;
}

function copyStruct(value: VMValue): VMValue {
    return isStruct(value) ? value.clone() : value;
}

function isCallable(value: VMValue): boolean {
    return value instanceof VMLambda || value instanceof VMBoundMethod || value instanceof VMNativeFunction;
}

export class Interpreter {
    steps = 0;
    budget = 4_000_000;
    private depth = 0;
    readonly globals = new Map<string, VMValue>();
    /** Static types of the arguments of the native call being made (int vs float overloads). */
    callArgTypes: Array<string | null> = [];
    private readonly stdlib: Map<string, VMValue>;
    private globalsInitialised = false;

    readonly program: CompiledProgram;
    readonly host: ScriptHost;
    constructor(program: CompiledProgram, host: ScriptHost) {
        this.program = program;
        this.host = host;
        this.stdlib = createStdlib(this);
    }

    resetBudget() {
        this.steps = 0;
    }

    private tick() {
        this.steps += 1;
        if (this.steps > this.budget) throw new BudgetExceededError();
    }

    // -------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------

    fail(message: string, node: { line: number; col: number } | null, frame: Frame | null, exceptionType = "Exception"): never {
        const error = new VMError(message, exceptionType);
        if (node) {
            error.line = node.line;
            error.col = node.col;
        } else if (frame) {
            error.line = frame.line;
        }
        if (frame) error.scriptName = frame.scriptName;
        throw error;
    }

    private nullRef(what: string, node: { line: number; col: number }, frame: Frame): never {
        return this.fail(`${what} null veya yok edilmiş bir nesneye erişildi.`, node, frame, "NullReferenceException");
    }

    /** Converts engine/host exceptions into positioned VM errors. */
    private wrapError(error: unknown, node: { line: number; col: number } | null, frame: Frame): never {
        if (error instanceof VMError) {
            if (!error.scriptName) {
                error.scriptName = frame.scriptName;
                if (node && !error.line) {
                    error.line = node.line;
                    error.col = node.col;
                }
            }
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        return this.fail(message, node, frame);
    }

    // -------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------

    private rootFrame(cls: ClassInfo | null, self: ScriptObject | null, scriptName = "", dialect: "csharp" | "cpp" = "csharp"): Frame {
        return {
            self,
            cls,
            dialect: cls?.dialect ?? dialect,
            scriptName: cls?.scriptName ?? scriptName,
            method: "<init>",
            scope: new Scope(null),
            returnValue: undefined,
            line: 0,
        };
    }

    initialiseGlobals() {
        if (this.globalsInitialised) return;
        this.globalsInitialised = true;
        for (const { decl, unit } of this.program.globals) {
            const frame = this.rootFrame(null, null, unit.scriptName, unit.dialect);
            for (const declaration of decl.declarations) {
                const typeName = declaration.typeRef.name;
                let value: VMValue;
                if (declaration.arraySize !== undefined) {
                    value = this.newFixedArray(typeName, declaration.arraySize ? this.eval(declaration.arraySize, frame) : 0, declaration.init, frame);
                } else {
                    value = declaration.init ? this.evalExpected(declaration.init, typeName, frame) : defaultForTypeName(typeName, frame.dialect, this.program);
                }
                this.globals.set(declaration.name, this.coerce(value, typeName));
            }
        }
    }

    private ensureStatics(cls: ClassInfo) {
        const chain: ClassInfo[] = [];
        for (let cursor: ClassInfo | null = cls; cursor; cursor = cursor.base) chain.unshift(cursor);
        for (const item of chain) {
            if (item.staticsInitialised) continue;
            item.staticsInitialised = true;
            const frame = this.rootFrame(item, null);
            for (const field of item.fields) {
                if (!field.isStatic) continue;
                item.staticValues.set(field.name, this.initialFieldValue(field, frame));
            }
        }
    }

    /** Resets static state (called when play mode starts). */
    resetStatics() {
        for (const cls of this.program.classes.values()) {
            cls.staticsInitialised = false;
            cls.staticValues.clear();
        }
        this.globals.clear();
        this.globalsInitialised = false;
    }

    private initialFieldValue(field: FieldInfo, frame: Frame): VMValue {
        if (field.decl.arraySize !== undefined) {
            const size = field.decl.arraySize ? this.eval(field.decl.arraySize, frame) : 0;
            return this.newFixedArray(field.typeRef.name, size, field.decl.init, frame);
        }
        if (field.decl.init) return this.coerce(this.evalExpected(field.decl.init, field.typeName, frame), field.typeName);
        return defaultForTypeName(field.typeName, frame.dialect, this.program, field.typeRef);
    }

    // -------------------------------------------------------------------
    // Objects
    // -------------------------------------------------------------------

    instantiate(cls: ClassInfo, args: VMValue[] = [], callerFrame: Frame | null = null): ScriptObject {
        this.ensureStatics(cls);
        const object = new ScriptObject(cls);
        this.initialiseFields(object);
        const ctor = cls.findConstructor(args.length);
        if (ctor) {
            this.callUserMethod(object, cls, ctor, args);
        } else if (args.length) {
            // Aggregate initialisation: assign in declaration order (C++ structs, simple C# data classes).
            const fields = cls.allInstanceFields();
            if (args.length > fields.length) this.fail(`'${cls.name}' için ${args.length} parametreli yapıcı yok.`, null, callerFrame);
            args.forEach((value, index) => { object.fields[fields[index].name] = this.coerce(copyStruct(value), fields[index].typeName); });
        }
        return object;
    }

    private initialiseFields(object: ScriptObject) {
        const chain: ClassInfo[] = [];
        for (let cursor: ClassInfo | null = object.cls; cursor; cursor = cursor.base) chain.unshift(cursor);
        for (const cls of chain) {
            const frame = this.rootFrame(cls, object);
            for (const field of cls.fields) {
                if (field.isStatic) continue;
                object.fields[field.name] = this.initialFieldValue(field, frame);
            }
        }
    }

    instantiateBehaviour(cls: ClassInfo, binding: BehaviourBinding, overrides: Record<string, ScriptFieldValue>, resolveReference: (value: { ref: "entity" | "prefab"; id: string | null }, field: FieldInfo) => VMValue): ScriptObject {
        this.ensureStatics(cls);
        const object = new ScriptObject(cls);
        object.behaviour = binding;
        this.initialiseFields(object);
        for (const field of cls.allInstanceFields()) {
            if (!field.serialized || !(field.name in overrides)) continue;
            const converted = this.convertFieldValue(overrides[field.name], field, resolveReference);
            if (converted !== NOT_FOUND) object.fields[field.name] = converted;
        }
        const ctor = cls.findConstructor(0);
        if (ctor) this.callUserMethod(object, cls, ctor, []);
        return object;
    }

    private convertFieldValue(value: ScriptFieldValue, field: FieldInfo, resolveReference: (value: { ref: "entity" | "prefab"; id: string | null }, field: FieldInfo) => VMValue): VMValue | typeof NOT_FOUND {
        const type = field.typeName;
        if (value === null) return null;
        if (typeof value === "object" && "ref" in value) return resolveReference(value, field);
        if (typeof value === "object") {
            if (type === "Vector2") return new Vec3(value.x, value.y, 0, true);
            if (type === "Vector3") return new Vec3(value.x, value.y, value.z);
            return NOT_FOUND;
        }
        if (type === "Color" && typeof value === "string") return VMColor.fromHex(value);
        if (type === "int" && typeof value === "number") return Math.trunc(value);
        if (type === "float" && typeof value === "number") return value;
        if (type === "bool" && typeof value === "boolean") return value;
        if (type === "string" && typeof value === "string") return value;
        if (type === "KeyCode" && typeof value === "string") return value;
        // V4: sounds are passed around by name (Audio.Play(clip), source.PlayOneShot(clip)).
        if (type === "AudioClip" && typeof value === "string") return value ? this.host.audioClipName?.(value) ?? value : null;
        if (this.program.enums.has(type) && typeof value === "number") return value;
        return NOT_FOUND;
    }

    /** Calls a method by name on a script object; lifecycle names are matched case-insensitively. */
    invoke(object: ScriptObject, name: string, args: VMValue[] = [], caseInsensitive = true): VMValue | typeof NOT_FOUND {
        let found = object.cls.findMethod(name, args.length, caseInsensitive);
        if (!found && args.length) found = object.cls.findMethod(name, 0, caseInsensitive);
        if (!found) return NOT_FOUND;
        const actualArgs = found.method.params.length === 0 ? [] : args;
        return this.callUserMethod(object, found.owner, found.method, actualArgs);
    }

    hasMethod(object: ScriptObject, name: string, caseInsensitive = true): boolean {
        return object.cls.hasMethodNamed(name, caseInsensitive);
    }

    /** Parameter count of the best matching method (used to pass deltaTime to Update(float)). */
    methodArity(object: ScriptObject, name: string): number {
        const found = object.cls.findMethod(name, 0, true) ?? object.cls.findMethod(name, 1, true);
        return found?.method.params.length ?? 0;
    }

    callValue(fn: VMValue, args: VMValue[], node: { line: number; col: number } | null = null, frame: Frame | null = null): VMValue {
        if (fn instanceof VMLambda) {
            this.tick();
            if (++this.depth > MAX_DEPTH) {
                this.depth -= 1;
                throw new StackOverflowVMError();
            }
            try {
                const scope = new Scope(fn.scope as Scope);
                fn.params.forEach((param, index) => scope.vars.set(param, copyStruct(args[index] ?? null)));
                const lambdaFrame: Frame = {
                    self: fn.self,
                    cls: fn.cls,
                    dialect: fn.cls?.dialect ?? frame?.dialect ?? "csharp",
                    scriptName: fn.cls?.scriptName ?? frame?.scriptName ?? "",
                    method: "lambda",
                    scope,
                    returnValue: undefined,
                    line: fn.body.line,
                };
                if ((fn.body as BlockStmt).type === "Block") {
                    this.execBlock((fn.body as BlockStmt).body, lambdaFrame, false);
                    return lambdaFrame.returnValue;
                }
                return this.eval(fn.body as Expr, lambdaFrame);
            } finally {
                this.depth -= 1;
            }
        }
        if (fn instanceof VMBoundMethod) {
            const target = fn.self?.cls ?? fn.cls;
            const found = target.findMethod(fn.name, args.length, false);
            if (!found) this.fail(`'${fn.name}' metodu ${args.length} parametreyle bulunamadı.`, node, frame);
            return this.callUserMethod(fn.self, found!.owner, found!.method, args);
        }
        if (fn instanceof VMNativeFunction) return fn.fn(args);
        if (fn instanceof VMList && fn.items.every(isCallable)) {
            let result: VMValue = null;
            for (const item of [...fn.items]) result = this.callValue(item, args, node, frame);
            return result;
        }
        if (fn === null || fn === undefined) return this.fail("Null bir temsilci (delegate) çağrıldı.", node, frame, "NullReferenceException");
        return this.fail("Bu değer bir fonksiyon değil.", node, frame);
    }

    callUserMethod(self: ScriptObject | null, owner: ClassInfo | null, method: MethodDecl, args: VMValue[], callerFrame: Frame | null = null): VMValue {
        this.tick();
        if (++this.depth > MAX_DEPTH) {
            this.depth -= 1;
            throw new StackOverflowVMError();
        }
        const scope = new Scope(null);
        const frame: Frame = {
            self,
            cls: owner,
            dialect: owner?.dialect ?? callerFrame?.dialect ?? this.dialectOfFunction(method),
            scriptName: owner?.scriptName ?? this.scriptOfFunction(method),
            method: owner ? `${owner.name}.${method.name}` : method.name,
            scope,
            returnValue: undefined,
            line: method.line,
        };
        const binding = self?.behaviour ?? null;
        const previousOwner = binding?.enter ? binding.enter() : undefined;
        try {
            method.params.forEach((param, index) => {
                if (param.modifier === "params") {
                    scope.vars.set(param.name, new VMList(args.slice(index).map(copyStruct), "Array"));
                    return;
                }
                let value: VMValue;
                if (index < args.length) value = args[index];
                else if (param.defaultValue) value = this.evalExpected(param.defaultValue, param.typeRef.name, frame);
                else value = defaultForTypeName(param.typeRef.name, frame.dialect, this.program, param.typeRef);
                if ((param.modifier === "ref" || param.modifier === "out") && value instanceof VMRef) {
                    scope.vars.set(param.name, value);
                    (scope.refNames ??= new Set()).add(param.name);
                } else {
                    scope.vars.set(param.name, this.coerce(copyStruct(value instanceof VMRef ? value.get() : value), param.typeRef.name, param.typeRef));
                }
            });
            if (method.isConstructor && self) {
                for (const init of method.memberInits) {
                    if (init.name.startsWith(":")) {
                        const values = init.args.map((arg) => this.eval(arg, frame));
                        if (init.name === ":base" && owner?.base) {
                            const baseCtor = owner.base.findConstructor(values.length);
                            if (baseCtor) this.callUserMethod(self, owner.base, baseCtor, values);
                        } else if (init.name === ":this" && owner) {
                            const other = owner.findConstructor(values.length);
                            if (other && other !== method) this.callUserMethod(self, owner, other, values);
                        }
                        continue;
                    }
                    const field = owner?.findField(init.name);
                    const values = init.args.map((arg) => this.eval(arg, frame));
                    if (field) {
                        const value = values.length === 1 ? values[0] : this.constructType(field.typeRef, values, frame, null);
                        self.fields[init.name] = this.coerce(copyStruct(value), field.typeName);
                    } else if (owner?.base && owner.base.name === init.name) {
                        const baseCtor = owner.base.findConstructor(values.length);
                        if (baseCtor) this.callUserMethod(self, owner.base, baseCtor, values);
                    }
                }
            }
            if (method.isIterator && method.body) {
                return new VMCoroutine(method.name, this.runIterator(method.body, frame));
            }
            if (method.body) this.execBlock(method.body.body, frame, false);
            const result = frame.returnValue;
            return method.returnType.name === "void" || method.isConstructor ? undefined : this.coerce(result, method.returnType.name);
        } catch (error) {
            if (error instanceof VMError && !(error instanceof BudgetExceededError)) {
                if (error.trace.length < 12) error.trace.push(`${frame.method} (${frame.scriptName}:${frame.line})`);
            }
            return this.wrapError(error, null, frame);
        } finally {
            this.depth -= 1;
            if (binding?.exit) binding.exit(previousOwner);
        }
    }

    private dialectOfFunction(method: MethodDecl): "csharp" | "cpp" {
        for (const unit of this.program.units) if (unit.functions.includes(method)) return unit.dialect;
        return "cpp";
    }

    private scriptOfFunction(method: MethodDecl): string {
        for (const unit of this.program.units) if (unit.functions.includes(method)) return unit.scriptName;
        return "";
    }

    // -------------------------------------------------------------------
    // Coercion
    // -------------------------------------------------------------------

    coerce(value: VMValue, typeName: string, typeRef?: TypeRef): VMValue {
        switch (typeName) {
            case "int":
                if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
                if (typeof value === "boolean") return value ? 1 : 0;
                return value;
            case "float":
                if (typeof value === "boolean") return value ? 1 : 0;
                return value;
            case "bool":
                if (typeof value === "number") return value !== 0;
                return value;
            case "string":
                return value;
            case "Vector2":
                if (value instanceof Vec3) return value.is2D ? value : new Vec3(value.x, value.y, 0, true);
                if (value instanceof VMList) return new Vec3(Number(value.items[0] ?? 0), Number(value.items[1] ?? 0), 0, true);
                return value;
            case "Vector3":
                if (value instanceof Vec3 && value.is2D) return new Vec3(value.x, value.y, 0, false);
                if (value instanceof VMList) return new Vec3(Number(value.items[0] ?? 0), Number(value.items[1] ?? 0), Number(value.items[2] ?? 0));
                return value;
            case "Color":
                if (value instanceof VMList) return new VMColor(Number(value.items[0] ?? 0), Number(value.items[1] ?? 0), Number(value.items[2] ?? 0), Number(value.items[3] ?? 1));
                return value;
            default:
                if (value instanceof VMList && typeRef && !typeRef.isArray && this.program.classes.has(typeName)) {
                    return this.instantiate(this.program.classes.get(typeName)!, value.items);
                }
                return value;
        }
    }

    /** Evaluates `expr` knowing the declared target type (target-typed new, init lists). */
    private evalExpected(expr: Expr, typeName: string, frame: Frame): VMValue {
        if (expr.type === "New" && !expr.typeRef) {
            const typeRef: TypeRef = { name: typeName, args: [], isArray: false, raw: typeName, line: expr.line, col: expr.col };
            return this.constructType(typeRef, this.evalArgs(expr.args, frame).values, frame, expr);
        }
        if (expr.type === "InitList") {
            const items = expr.items.map((item) => this.eval(item, frame));
            if (typeName === "Vector3") return new Vec3(Number(items[0] ?? 0), Number(items[1] ?? 0), Number(items[2] ?? 0));
            if (typeName === "Vector2") return new Vec3(Number(items[0] ?? 0), Number(items[1] ?? 0), 0, true);
            if (typeName === "Color") return new VMColor(Number(items[0] ?? 0), Number(items[1] ?? 0), Number(items[2] ?? 0), Number(items[3] ?? 1));
            if (typeName === "Dictionary") {
                const dict = new VMDict();
                for (const item of items) if (item instanceof VMList) dict.set(item.items[0], item.items[1]);
                return dict;
            }
            if (this.program.classes.has(typeName)) return this.instantiate(this.program.classes.get(typeName)!, items, frame);
            const kind = typeName === "HashSet" || typeName === "Queue" || typeName === "Stack" ? typeName : typeName === "Array" ? "Array" : "List";
            return new VMList(items.map(copyStruct), kind);
        }
        return this.eval(expr, frame);
    }

    private newFixedArray(elementType: string, sizeValue: VMValue, init: Expr | null, frame: Frame): VMList {
        const size = Math.max(0, Math.trunc(Number(sizeValue) || 0));
        const items: VMValue[] = [];
        const initItems = init?.type === "InitList" ? init.items.map((item) => this.eval(item, frame)) : [];
        const length = Math.max(size, initItems.length);
        if (length > 1_000_000) this.fail("Dizi boyutu çok büyük.", init, frame);
        for (let index = 0; index < length; index += 1) {
            items.push(index < initItems.length ? this.coerce(initItems[index], elementType) : defaultForTypeName(elementType, frame.dialect, this.program));
        }
        return new VMList(items, "Array", elementType);
    }

    // -------------------------------------------------------------------
    // Statements
    // -------------------------------------------------------------------

    private execBlock(body: Stmt[], frame: Frame, newScope: boolean): number {
        const saved = frame.scope;
        if (newScope) frame.scope = new Scope(saved);
        try {
            for (const stmt of body) {
                const completion = this.exec(stmt, frame);
                if (completion !== NORMAL) return completion;
            }
            return NORMAL;
        } finally {
            frame.scope = saved;
        }
    }

    private execScoped(stmt: Stmt, frame: Frame): number {
        if (stmt.type === "Block") return this.execBlock(stmt.body, frame, true);
        const saved = frame.scope;
        frame.scope = new Scope(saved);
        try {
            return this.exec(stmt, frame);
        } finally {
            frame.scope = saved;
        }
    }

    private declareLocal(frame: Frame, name: string, value: VMValue) {
        frame.scope.vars.set(name, value);
    }

    private exec(stmt: Stmt, frame: Frame): number {
        this.tick();
        frame.line = stmt.line;
        switch (stmt.type) {
            case "Block":
                return this.execBlock(stmt.body, frame, true);
            case "VarDecl":
                for (const declaration of stmt.declarations) {
                    const typeName = declaration.typeRef.name;
                    let value: VMValue;
                    if (declaration.arraySize !== undefined) {
                        value = this.newFixedArray(typeName, declaration.arraySize ? this.eval(declaration.arraySize, frame) : 0, declaration.init, frame);
                    } else if (declaration.init) {
                        value = this.evalExpected(declaration.init, typeName, frame);
                        value = typeName === "var" ? copyStruct(value) : this.coerce(copyStruct(value), typeName, declaration.typeRef);
                    } else {
                        value = defaultForTypeName(typeName, frame.dialect, this.program, declaration.typeRef);
                    }
                    this.declareLocal(frame, declaration.name, value);
                }
                return NORMAL;
            case "ExprStmt":
                this.eval(stmt.expr, frame);
                return NORMAL;
            case "If":
                if (vmTruthy(this.eval(stmt.test, frame))) return this.execScoped(stmt.consequent, frame);
                return stmt.alternate ? this.execScoped(stmt.alternate, frame) : NORMAL;
            case "While":
                while (vmTruthy(this.eval(stmt.test, frame))) {
                    this.tick();
                    const completion = this.execScoped(stmt.body, frame);
                    if (completion === BREAK) break;
                    if (completion === RETURN) return RETURN;
                }
                return NORMAL;
            case "DoWhile":
                do {
                    this.tick();
                    const completion = this.execScoped(stmt.body, frame);
                    if (completion === BREAK) break;
                    if (completion === RETURN) return RETURN;
                } while (vmTruthy(this.eval(stmt.test, frame)));
                return NORMAL;
            case "For": {
                const saved = frame.scope;
                frame.scope = new Scope(saved);
                try {
                    if (stmt.init) this.exec(stmt.init, frame);
                    while (!stmt.test || vmTruthy(this.eval(stmt.test, frame))) {
                        this.tick();
                        const completion = this.execScoped(stmt.body, frame);
                        if (completion === BREAK) break;
                        if (completion === RETURN) return RETURN;
                        for (const update of stmt.update) this.eval(update, frame);
                    }
                    return NORMAL;
                } finally {
                    frame.scope = saved;
                }
            }
            case "ForEach": {
                const items = this.iterate(this.eval(stmt.iterable, frame), stmt, frame);
                for (const item of items) {
                    this.tick();
                    const saved = frame.scope;
                    frame.scope = new Scope(saved);
                    try {
                        this.bindForEach(stmt.name, stmt.bindings, stmt.typeRef, item, frame);
                        const completion = stmt.body.type === "Block" ? this.execBlock(stmt.body.body, frame, false) : this.exec(stmt.body, frame);
                        if (completion === BREAK) break;
                        if (completion === RETURN) return RETURN;
                    } finally {
                        frame.scope = saved;
                    }
                }
                return NORMAL;
            }
            case "Switch": {
                const value = this.eval(stmt.discriminant, frame);
                const start = this.findCase(stmt.cases, value, frame);
                if (start < 0) return NORMAL;
                const saved = frame.scope;
                frame.scope = new Scope(saved);
                try {
                    for (let index = start; index < stmt.cases.length; index += 1) {
                        for (const inner of stmt.cases[index].body) {
                            const completion = this.exec(inner, frame);
                            if (completion === BREAK) return NORMAL;
                            if (completion !== NORMAL) return completion;
                        }
                    }
                    return NORMAL;
                } finally {
                    frame.scope = saved;
                }
            }
            case "Return":
                frame.returnValue = stmt.arg ? this.eval(stmt.arg, frame) : undefined;
                return RETURN;
            case "Break":
                return BREAK;
            case "Continue":
                return CONTINUE;
            case "Throw": {
                const value = stmt.arg ? this.eval(stmt.arg, frame) : null;
                if (value instanceof VMException) return this.fail(value.message, stmt, frame, value.exceptionType);
                return this.fail(value === null ? "Exception" : toDisplayString(value, frame.dialect, this), stmt, frame);
            }
            case "Try":
                return this.execTry(stmt, frame);
            case "Yield":
                return this.fail("yield yalnızca IEnumerator döndüren metotlarda kullanılabilir.", stmt, frame);
            case "Empty":
                return NORMAL;
        }
    }

    private execTry(stmt: Extract<Stmt, { type: "Try" }>, frame: Frame): number {
        let completion = NORMAL;
        try {
            completion = this.execBlock(stmt.block.body, frame, true);
        } catch (error) {
            if (error instanceof BudgetExceededError || error instanceof StackOverflowVMError || !(error instanceof VMError) || !stmt.handler) {
                if (stmt.finalizer) this.execBlock(stmt.finalizer.body, frame, true);
                throw error;
            }
            const saved = frame.scope;
            frame.scope = new Scope(saved);
            try {
                if (stmt.param) this.declareLocal(frame, stmt.param, new VMException(error.exceptionType, error.message));
                completion = this.execBlock(stmt.handler.body, frame, false);
            } finally {
                frame.scope = saved;
            }
        }
        if (stmt.finalizer) {
            const finalCompletion = this.execBlock(stmt.finalizer.body, frame, true);
            if (finalCompletion !== NORMAL) return finalCompletion;
        }
        return completion;
    }

    private findCase(cases: Extract<Stmt, { type: "Switch" }>["cases"], value: VMValue, frame: Frame): number {
        let defaultIndex = -1;
        for (let index = 0; index < cases.length; index += 1) {
            const switchCase = cases[index];
            if (switchCase.isDefault) defaultIndex = index;
            for (const test of switchCase.tests) {
                if (vmEquals(value, this.eval(test, frame))) return index;
            }
        }
        return defaultIndex;
    }

    private bindForEach(name: string, bindings: string[] | undefined, typeRef: TypeRef | null, item: VMValue, frame: Frame) {
        if (bindings && bindings.length >= 2) {
            if (item instanceof VMPair) {
                this.declareLocal(frame, bindings[0], item.key);
                this.declareLocal(frame, bindings[1], item.value);
                return;
            }
        }
        const typeName = typeRef?.name ?? "var";
        this.declareLocal(frame, name, typeName === "var" ? copyStruct(item) : this.coerce(copyStruct(item), typeName, typeRef ?? undefined));
    }

    iterate(value: VMValue, node: { line: number; col: number }, frame: Frame | null): VMValue[] {
        if (value instanceof VMList) return [...value.items];
        if (value instanceof VMDict) return [...value.map.values()].map((entry) => new VMPair(entry.key, entry.value));
        if (typeof value === "string") return [...value];
        if (isHostObject(value) && value.iterate) return value.iterate();
        if (value === null || value === undefined) return this.fail("foreach: koleksiyon null.", node, frame, "NullReferenceException");
        return this.fail("Bu değer üzerinde foreach kullanılamaz.", node, frame);
    }

    // -------------------------------------------------------------------
    // Coroutines (iterator methods)
    // -------------------------------------------------------------------

    private *runIterator(body: BlockStmt, frame: Frame): Generator<VMValue, void, void> {
        yield* this.execBlockGen(body.body, frame, false);
    }

    private *execBlockGen(body: Stmt[], frame: Frame, newScope: boolean): Generator<VMValue, number, void> {
        const saved = frame.scope;
        if (newScope) frame.scope = new Scope(saved);
        try {
            for (const stmt of body) {
                const completion = yield* this.execGen(stmt, frame);
                if (completion !== NORMAL) return completion;
            }
            return NORMAL;
        } finally {
            frame.scope = saved;
        }
    }

    private *execScopedGen(stmt: Stmt, frame: Frame): Generator<VMValue, number, void> {
        if (stmt.type === "Block") return yield* this.execBlockGen(stmt.body, frame, true);
        const saved = frame.scope;
        frame.scope = new Scope(saved);
        try {
            return yield* this.execGen(stmt, frame);
        } finally {
            frame.scope = saved;
        }
    }

    private *execGen(stmt: Stmt, frame: Frame): Generator<VMValue, number, void> {
        if (!stmt.hasYield) {
            try {
                return this.exec(stmt, frame);
            } catch (error) {
                return this.wrapError(error, stmt, frame);
            }
        }
        this.tick();
        frame.line = stmt.line;
        switch (stmt.type) {
            case "Block":
                return yield* this.execBlockGen(stmt.body, frame, true);
            case "If":
                if (vmTruthy(this.eval(stmt.test, frame))) return yield* this.execScopedGen(stmt.consequent, frame);
                return stmt.alternate ? yield* this.execScopedGen(stmt.alternate, frame) : NORMAL;
            case "While":
                while (vmTruthy(this.eval(stmt.test, frame))) {
                    this.tick();
                    const completion = yield* this.execScopedGen(stmt.body, frame);
                    if (completion === BREAK) break;
                    if (completion === RETURN) return RETURN;
                }
                return NORMAL;
            case "DoWhile":
                do {
                    this.tick();
                    const completion = yield* this.execScopedGen(stmt.body, frame);
                    if (completion === BREAK) break;
                    if (completion === RETURN) return RETURN;
                } while (vmTruthy(this.eval(stmt.test, frame)));
                return NORMAL;
            case "For": {
                const saved = frame.scope;
                frame.scope = new Scope(saved);
                try {
                    if (stmt.init) this.exec(stmt.init, frame);
                    while (!stmt.test || vmTruthy(this.eval(stmt.test, frame))) {
                        this.tick();
                        const completion = yield* this.execScopedGen(stmt.body, frame);
                        if (completion === BREAK) break;
                        if (completion === RETURN) return RETURN;
                        for (const update of stmt.update) this.eval(update, frame);
                    }
                    return NORMAL;
                } finally {
                    frame.scope = saved;
                }
            }
            case "ForEach": {
                const items = this.iterate(this.eval(stmt.iterable, frame), stmt, frame);
                for (const item of items) {
                    this.tick();
                    const saved = frame.scope;
                    frame.scope = new Scope(saved);
                    try {
                        this.bindForEach(stmt.name, stmt.bindings, stmt.typeRef, item, frame);
                        const completion = stmt.body.type === "Block" ? yield* this.execBlockGen(stmt.body.body, frame, false) : yield* this.execGen(stmt.body, frame);
                        if (completion === BREAK) break;
                        if (completion === RETURN) return RETURN;
                    } finally {
                        frame.scope = saved;
                    }
                }
                return NORMAL;
            }
            case "Switch": {
                const value = this.eval(stmt.discriminant, frame);
                const start = this.findCase(stmt.cases, value, frame);
                if (start < 0) return NORMAL;
                const saved = frame.scope;
                frame.scope = new Scope(saved);
                try {
                    for (let index = start; index < stmt.cases.length; index += 1) {
                        for (const inner of stmt.cases[index].body) {
                            const completion = yield* this.execGen(inner, frame);
                            if (completion === BREAK) return NORMAL;
                            if (completion !== NORMAL) return completion;
                        }
                    }
                    return NORMAL;
                } finally {
                    frame.scope = saved;
                }
            }
            case "Yield": {
                if (stmt.isBreak) return RETURN;
                const value = stmt.arg ? this.eval(stmt.arg, frame) : null;
                yield value;
                return NORMAL;
            }
            default:
                return this.exec(stmt, frame);
        }
    }

    // -------------------------------------------------------------------
    // Expressions
    // -------------------------------------------------------------------

    eval(expr: Expr, frame: Frame): VMValue {
        switch (expr.type) {
            case "Literal":
                return expr.value;
            case "Interpolated": {
                let output = "";
                for (const part of expr.parts) {
                    if ("text" in part) output += part.text;
                    else output += formatValue(this.eval(part.expr, frame), part.format, frame.dialect, this, part.expr.st ?? null);
                }
                return output;
            }
            case "Ident":
                return this.readIdent(expr, frame);
            case "This":
                return frame.self;
            case "Base":
                return frame.self;
            case "Member":
                return this.evalMember(expr, frame);
            case "Index": {
                const object = this.eval(expr.object, frame);
                const index = this.eval(expr.index, frame);
                return this.readIndex(object, index, expr, frame);
            }
            case "Call":
                return this.evalCall(expr, frame);
            case "New": {
                if (!expr.typeRef) return this.fail("Hedef türü belirsiz 'new()' ifadesi; türü açıkça yazın.", expr, frame);
                const { values } = this.evalArgs(expr.args, frame);
                const value = this.constructType(expr.typeRef, values, frame, expr);
                if (expr.items) {
                    for (const item of expr.items) this.addCollectionItem(value, item, frame);
                }
                if (expr.props) {
                    for (const prop of expr.props) this.setMember(value, prop.name, this.eval(prop.value, frame), prop.value, frame);
                }
                return value;
            }
            case "NewArray": {
                const elementType = expr.elementType?.name ?? "var";
                if (expr.size) {
                    const list = this.newFixedArray(elementType, this.eval(expr.size, frame), null, frame);
                    if (expr.items) expr.items.forEach((item, index) => { if (index < list.items.length) list.items[index] = this.coerce(this.eval(item, frame), elementType); });
                    return list;
                }
                return new VMList((expr.items ?? []).map((item) => this.coerce(copyStruct(this.eval(item, frame)), elementType)), "Array", elementType);
            }
            case "InitList":
                return new VMList(expr.items.map((item) => copyStruct(this.eval(item, frame))), "List");
            case "Unary":
                return this.evalUnary(expr, frame);
            case "Update":
                return this.evalUpdate(expr, frame);
            case "Binary": {
                const left = this.eval(expr.left, frame);
                const right = this.eval(expr.right, frame);
                return this.binary(expr.op, left, right, Boolean(expr.intOp), expr, frame);
            }
            case "Logical": {
                const left = this.eval(expr.left, frame);
                if (expr.op === "&&") return vmTruthy(left) ? vmTruthy(this.eval(expr.right, frame)) : false;
                if (expr.op === "||") return vmTruthy(left) ? true : vmTruthy(this.eval(expr.right, frame));
                return left === null || left === undefined || (isHostObject(left) && left.isAlive && !left.isAlive()) ? this.eval(expr.right, frame) : left;
            }
            case "Assign":
                return this.evalAssign(expr, frame);
            case "Conditional":
                return vmTruthy(this.eval(expr.test, frame)) ? this.eval(expr.consequent, frame) : this.eval(expr.alternate, frame);
            case "Cast":
                return this.cast(this.eval(expr.arg, frame), expr.typeRef, expr, frame);
            case "Is": {
                const value = this.eval(expr.arg, frame);
                let result: boolean;
                if (expr.nullCheck) result = value === null || value === undefined || (isHostObject(value) && value.isAlive !== undefined && !value.isAlive());
                else result = this.isType(value, expr.typeRef!);
                if (expr.negate) result = !result;
                if (expr.declName && result) this.declareLocal(frame, expr.declName, value);
                return result;
            }
            case "As": {
                const value = this.eval(expr.arg, frame);
                return this.isType(value, expr.typeRef) ? value : null;
            }
            case "Lambda":
                return new VMLambda(expr.params, expr.body, frame.scope, frame.self, frame.cls);
            case "TypeOf":
                return expr.typeRef.name;
            case "Default":
                return expr.typeRef ? defaultForTypeName(expr.typeRef.name, frame.dialect, this.program, expr.typeRef) : null;
        }
    }

    private readIdent(expr: Extract<Expr, { type: "Ident" }>, frame: Frame): VMValue {
        const name = expr.name;
        const res = expr.res;
        switch (res?.kind) {
            case "local": {
                for (let scope: Scope | null = frame.scope; scope; scope = scope.parent) {
                    if (scope.vars.has(name)) {
                        const value = scope.vars.get(name);
                        return scope.refNames?.has(name) && value instanceof VMRef ? value.get() : value;
                    }
                }
                return this.fail(`'${name}' değişkeni henüz tanımlanmadı.`, expr, frame);
            }
            case "field":
                if (!frame.self) return this.fail(`'${name}' alanına statik bağlamdan erişilemez.`, expr, frame);
                return this.getObjectMember(frame.self, name, expr, frame);
            case "static":
                return this.getStatic(this.program.classes.get(res.className)!, name, expr, frame);
            case "method":
                return new VMBoundMethod(frame.self, frame.cls!, name);
            case "enum":
                return this.program.enums.get(name)!;
            case "class":
                return this.program.classes.get(name)!;
            case "function":
                return new VMNativeFunction(name, (args) => this.callFunction(name, args, expr, frame));
            case "behaviour": {
                const binding = frame.self?.behaviour;
                if (!binding) return this.fail(`'${name}' yalnızca sahnedeki bir bileşende kullanılabilir.`, expr, frame);
                const value = binding.getMember(name);
                if (value === NOT_FOUND) return new VMNativeFunction(name, (args) => this.callBehaviour(frame, name, args, [], expr));
                return value;
            }
            case "global":
                return this.getGlobal(name, expr, frame);
            default:
                return this.fail(`'${name}' çözümlenemedi.`, expr, frame);
        }
    }

    getGlobal(name: string, node: { line: number; col: number } | null, frame: Frame | null): VMValue {
        if (this.globals.has(name)) return this.globals.get(name);
        if (this.stdlib.has(name)) return this.stdlib.get(name);
        const hosted = this.host.resolveGlobal(name);
        if (hosted !== NOT_FOUND) return hosted;
        return this.fail(`'${name}' bu motor sürümünde desteklenmiyor.`, node, frame);
    }

    private getStatic(cls: ClassInfo, name: string, node: { line: number; col: number }, frame: Frame): VMValue {
        this.ensureStatics(cls);
        const owner = cls.staticOwner(name);
        if (owner) return owner.staticValues.get(name);
        const property = cls.findProperty(name);
        if (property?.property.isStatic && property.property.getter) {
            const getterFrame = this.rootFrame(property.owner, null);
            this.execBlock(property.property.getter.body, getterFrame, false);
            return getterFrame.returnValue;
        }
        if (cls.hasMethodNamed(name)) return new VMBoundMethod(null, cls, name);
        return this.fail(`'${cls.name}.${name}' statik üyesi yok.`, node, frame);
    }

    private setStatic(cls: ClassInfo, name: string, value: VMValue, node: { line: number; col: number }, frame: Frame) {
        this.ensureStatics(cls);
        const owner = cls.staticOwner(name);
        if (owner) {
            const field = owner.fields.find((candidate) => candidate.name === name)!;
            if (field.isConst) this.fail(`'${name}' sabit (const) olduğu için değiştirilemez.`, node, frame);
            owner.staticValues.set(name, this.coerce(copyStruct(value), field.typeName));
            return;
        }
        const property = cls.findProperty(name);
        if (property?.property.isStatic && property.property.setter) {
            const setterFrame = this.rootFrame(property.owner, null);
            setterFrame.scope.vars.set("value", value);
            this.execBlock(property.property.setter.body, setterFrame, false);
            return;
        }
        this.fail(`'${cls.name}.${name}' statik alanı yok.`, node, frame);
    }

    private getObjectMember(object: ScriptObject, name: string, node: { line: number; col: number }, frame: Frame): VMValue {
        if (name in object.fields) return object.fields[name];
        const property = object.cls.findProperty(name);
        if (property) {
            if (property.property.isStatic) return this.getStatic(property.owner, name, node, frame);
            if (!property.property.getter) return this.fail(`'${name}' özelliğinin get erişimcisi yok.`, node, frame);
            const getterFrame = this.rootFrame(property.owner, object);
            this.execBlock(property.property.getter.body, getterFrame, false);
            return this.coerce(getterFrame.returnValue, property.property.typeRef.name);
        }
        const staticOwner = object.cls.staticOwner(name);
        if (staticOwner) return this.getStatic(staticOwner, name, node, frame);
        if (object.cls.hasMethodNamed(name)) return new VMBoundMethod(object, object.cls, name);
        if (object.behaviour) {
            const value = object.behaviour.getMember(name);
            if (value !== NOT_FOUND) return value;
        }
        return this.fail(`'${object.cls.name}' nesnesinde '${name}' üyesi yok.`, node, frame);
    }

    private setObjectMember(object: ScriptObject, name: string, value: VMValue, node: { line: number; col: number }, frame: Frame) {
        if (name in object.fields) {
            const field = object.cls.findField(name);
            object.fields[name] = field ? this.coerce(copyStruct(value), field.typeName, field.typeRef) : copyStruct(value);
            return;
        }
        const property = object.cls.findProperty(name);
        if (property) {
            if (!property.property.setter) return this.fail(`'${name}' özelliği salt okunur.`, node, frame);
            const setterFrame = this.rootFrame(property.owner, object);
            setterFrame.scope.vars.set("value", this.coerce(copyStruct(value), property.property.typeRef.name));
            this.execBlock(property.property.setter.body, setterFrame, false);
            return;
        }
        const staticOwner = object.cls.staticOwner(name);
        if (staticOwner) return this.setStatic(staticOwner, name, value, node, frame);
        if (object.behaviour?.setMember(name, value)) return;
        this.fail(`'${object.cls.name}' nesnesinde '${name}' alanı yok.`, node, frame);
    }

    private evalMember(expr: Extract<Expr, { type: "Member" }>, frame: Frame): VMValue {
        const object = this.eval(expr.object, frame);
        if (expr.nullSafe && (object === null || object === undefined || (isHostObject(object) && object.isAlive && !object.isAlive()))) return null;
        return this.getMember(object, expr.name, expr, frame);
    }

    getMember(object: VMValue, name: string, node: { line: number; col: number }, frame: Frame): VMValue {
        if (object === null || object === undefined) return this.nullRef(`'${name}' okunurken`, node, frame);
        if (object instanceof ScriptObject) return this.getObjectMember(object, name, node, frame);
        if (isHostObject(object)) {
            if (object.isAlive && !object.isAlive()) return this.fail(`Yok edilmiş bir ${object.hostType} nesnesinin '${name}' üyesine erişildi.`, node, frame, "MissingReferenceException");
            try {
                return object.get(name);
            } catch (error) {
                return this.wrapError(error, node, frame);
            }
        }
        if (object instanceof StaticNamespace) {
            const value = object.getMember(name);
            if (value === NOT_FOUND) return this.fail(`'${object.name}.${name}' bulunamadı.`, node, frame);
            return value;
        }
        if (object instanceof EnumInfo) {
            if (object.values.has(name)) return object.values.get(name)!;
            return this.fail(`'${object.name}' enum'unda '${name}' yok.`, node, frame);
        }
        if (object instanceof ClassInfo) return this.getStatic(object, name, node, frame);
        const builtin = getBuiltinMember(object, name, frame.dialect);
        if (builtin !== NOT_FOUND) return builtin;
        return this.fail(`'${name}' üyesi bu değerde yok.`, node, frame);
    }

    private setMember(object: VMValue, name: string, value: VMValue, node: { line: number; col: number }, frame: Frame) {
        if (object === null || object === undefined) return this.nullRef(`'${name}' atanırken`, node, frame);
        if (object instanceof ScriptObject) return this.setObjectMember(object, name, value, node, frame);
        if (isHostObject(object)) {
            if (object.isAlive && !object.isAlive()) return this.fail(`Yok edilmiş bir ${object.hostType} nesnesine yazılamaz.`, node, frame, "MissingReferenceException");
            try {
                object.set(name, value);
            } catch (error) {
                this.wrapError(error, node, frame);
            }
            return;
        }
        if (object instanceof ClassInfo) return this.setStatic(object, name, value, node, frame);
        if (object instanceof StaticNamespace) {
            if (object.setMember?.(name, value)) return;
            return this.fail(`'${object.name}.${name}' değiştirilemez.`, node, frame);
        }
        if (setBuiltinMember(object, name, value)) return;
        this.fail(`'${name}' üyesi atanamaz.`, node, frame);
    }

    private readIndex(object: VMValue, index: VMValue, node: { line: number; col: number }, frame: Frame): VMValue {
        if (object instanceof VMList) {
            const position = Math.trunc(Number(index));
            if (!Number.isFinite(position) || position < 0 || position >= object.items.length) {
                return this.fail(`Dizin aralık dışında: ${index} (uzunluk ${object.items.length}).`, node, frame, object.kind === "Array" ? "IndexOutOfRangeException" : "ArgumentOutOfRangeException");
            }
            return object.items[position];
        }
        if (object instanceof VMDict) {
            const entry = object.get(index);
            if (entry) return entry.value;
            if (frame.dialect === "cpp") {
                const value = defaultForTypeName(object.valueType ?? "int", "cpp", this.program);
                object.set(index, value);
                return value;
            }
            return this.fail(`Sözlükte '${toDisplayString(index, frame.dialect, this)}' anahtarı yok.`, node, frame, "KeyNotFoundException");
        }
        if (typeof object === "string") {
            const position = Math.trunc(Number(index));
            if (position < 0 || position >= object.length) return this.fail("Metin dizini aralık dışında.", node, frame, "IndexOutOfRangeException");
            return object[position];
        }
        if (object instanceof Vec3) {
            const position = Math.trunc(Number(index));
            return position === 0 ? object.x : position === 1 ? object.y : position === 2 ? object.z : this.fail("Vector dizini 0-2 olmalıdır.", node, frame);
        }
        if (object === null || object === undefined) return this.nullRef("Dizin okunurken", node, frame);
        return this.fail("Bu değer dizinlenemez.", node, frame);
    }

    private writeIndex(object: VMValue, index: VMValue, value: VMValue, node: { line: number; col: number }, frame: Frame) {
        if (object instanceof VMList) {
            const position = Math.trunc(Number(index));
            if (!Number.isFinite(position) || position < 0 || position >= object.items.length) {
                this.fail(`Dizin aralık dışında: ${index} (uzunluk ${object.items.length}).`, node, frame, object.kind === "Array" ? "IndexOutOfRangeException" : "ArgumentOutOfRangeException");
            }
            object.items[position] = object.elementType ? this.coerce(copyStruct(value), object.elementType) : copyStruct(value);
            return;
        }
        if (object instanceof VMDict) {
            object.set(index, copyStruct(value));
            return;
        }
        if (object instanceof Vec3) {
            const position = Math.trunc(Number(index));
            if (position === 0) object.x = Number(value);
            else if (position === 1) object.y = Number(value);
            else if (position === 2) object.z = Number(value);
            return;
        }
        if (object === null || object === undefined) return this.nullRef("Dizine yazılırken", node, frame);
        this.fail("Bu değere dizinle yazılamaz.", node, frame);
    }

    private lvalue(expr: Expr, frame: Frame): LValue {
        switch (expr.type) {
            case "Ident": {
                const name = expr.name;
                const res = expr.res;
                if (res?.kind === "local") {
                    for (let scope: Scope | null = frame.scope; scope; scope = scope.parent) {
                        if (!scope.vars.has(name)) continue;
                        const owner = scope;
                        if (owner.refNames?.has(name)) {
                            const ref = owner.vars.get(name) as VMRef;
                            return { get: () => ref.get(), set: (value) => ref.set(value) };
                        }
                        return { get: () => owner.vars.get(name), set: (value) => { owner.vars.set(name, copyStruct(value)); } };
                    }
                    return this.fail(`'${name}' değişkeni henüz tanımlanmadı.`, expr, frame);
                }
                if (res?.kind === "field" && frame.self) {
                    const self = frame.self;
                    return { get: () => this.getObjectMember(self, name, expr, frame), set: (value) => this.setObjectMember(self, name, value, expr, frame) };
                }
                if (res?.kind === "static") {
                    const cls = this.program.classes.get(res.className)!;
                    return { get: () => this.getStatic(cls, name, expr, frame), set: (value) => this.setStatic(cls, name, value, expr, frame) };
                }
                if (res?.kind === "global" && this.globals.has(name)) {
                    return { get: () => this.globals.get(name), set: (value) => { this.globals.set(name, copyStruct(value)); } };
                }
                if (res?.kind === "behaviour" && frame.self?.behaviour) {
                    const binding = frame.self.behaviour;
                    return {
                        get: () => binding.getMember(name) as VMValue,
                        set: (value) => { if (!binding.setMember(name, value)) this.fail(`'${name}' atanamaz.`, expr, frame); },
                    };
                }
                return this.fail(`'${name}' atanabilir bir değişken değil.`, expr, frame);
            }
            case "Member": {
                const object = expr.object.type === "Base" ? frame.self : this.eval(expr.object, frame);
                return { get: () => this.getMember(object, expr.name, expr, frame), set: (value) => this.setMember(object, expr.name, value, expr, frame) };
            }
            case "Index": {
                const object = this.eval(expr.object, frame);
                const index = this.eval(expr.index, frame);
                return { get: () => this.readIndex(object, index, expr, frame), set: (value) => this.writeIndex(object, index, value, expr, frame) };
            }
            case "Unary":
                if (expr.op === "*") return this.lvalue(expr.arg, frame);
                break;
            default:
                break;
        }
        return this.fail("Bu ifadeye değer atanamaz.", expr, frame);
    }

    private evalAssign(expr: Extract<Expr, { type: "Assign" }>, frame: Frame): VMValue {
        const target = this.lvalue(expr.target, frame);
        let value: VMValue;
        if (expr.op === "=") {
            value = expr.value.type === "InitList" || (expr.value.type === "New" && !expr.value.typeRef)
                ? this.evalExpected(expr.value, expr.target.st ?? "List", frame)
                : this.eval(expr.value, frame);
        } else if (expr.op === "??=") {
            const current = target.get();
            if (current !== null && current !== undefined) return current;
            value = this.eval(expr.value, frame);
        } else {
            const current = target.get();
            const rhs = this.eval(expr.value, frame);
            value = this.binary(expr.op.slice(0, -1), current, rhs, Boolean(expr.intOp), expr, frame);
        }
        if (expr.intTarget && typeof value === "number") value = Math.trunc(value);
        target.set(value);
        return value;
    }

    private evalUpdate(expr: Extract<Expr, { type: "Update" }>, frame: Frame): VMValue {
        const target = this.lvalue(expr.arg, frame);
        const current = target.get();
        if (typeof current !== "number") return this.fail(`'${expr.op}' yalnızca sayılarla kullanılabilir.`, expr, frame);
        const next = expr.op === "++" ? current + 1 : current - 1;
        target.set(next);
        return expr.prefix ? next : current;
    }

    private evalUnary(expr: Extract<Expr, { type: "Unary" }>, frame: Frame): VMValue {
        const value = this.eval(expr.arg, frame);
        switch (expr.op) {
            case "-":
                if (typeof value === "number") return -value;
                if (value instanceof Vec3) return new Vec3(-value.x, -value.y, -value.z, value.is2D);
                if (value instanceof VMColor) return new VMColor(-value.r, -value.g, -value.b, -value.a);
                return this.fail("'-' bu değerle kullanılamaz.", expr, frame);
            case "+":
                return value;
            case "!":
                return !vmTruthy(value);
            case "~":
                return ~Number(value);
            case "*":
                if (value instanceof VMIterator) {
                    if (value.index < 0 || value.index >= value.list.items.length) return this.fail("Geçersiz yineleyici (end) okunamaz.", expr, frame);
                    return value.list.items[value.index];
                }
                return value;
            case "&":
                return value;
        }
    }

    binary(op: string, left: VMValue, right: VMValue, intOp: boolean, node: { line: number; col: number }, frame: Frame): VMValue {
        switch (op) {
            case "+":
                if (typeof left === "number" && typeof right === "number") return left + right;
                if (left instanceof VMIterator && typeof right === "number") return new VMIterator(left.list, left.index + Math.trunc(right));
                if (typeof left === "string" || typeof right === "string") return toDisplayString(left, frame.dialect, this) + toDisplayString(right, frame.dialect, this);
                if (left instanceof Vec3 && right instanceof Vec3) return new Vec3(left.x + right.x, left.y + right.y, left.z + right.z, left.is2D && right.is2D);
                if (left instanceof VMColor && right instanceof VMColor) return new VMColor(left.r + right.r, left.g + right.g, left.b + right.b, left.a + right.a);
                if ((left === null || left === undefined || isCallable(left) || (left instanceof VMList && left.items.every(isCallable))) && isCallable(right)) {
                    const items = left instanceof VMList ? [...left.items] : left ? [left] : [];
                    return new VMList([...items, right], "List");
                }
                break;
            case "-":
                if (typeof left === "number" && typeof right === "number") return left - right;
                if (left instanceof VMIterator && typeof right === "number") return new VMIterator(left.list, left.index - Math.trunc(right));
                if (left instanceof VMIterator && right instanceof VMIterator) return left.index - right.index;
                if (left instanceof Vec3 && right instanceof Vec3) return new Vec3(left.x - right.x, left.y - right.y, left.z - right.z, left.is2D && right.is2D);
                if (left instanceof VMColor && right instanceof VMColor) return new VMColor(left.r - right.r, left.g - right.g, left.b - right.b, left.a - right.a);
                if (left instanceof VMList && isCallable(right)) return new VMList(left.items.filter((item) => !this.sameCallable(item, right)), "List");
                if (isCallable(left) && isCallable(right)) return this.sameCallable(left, right) ? null : left;
                break;
            case "*":
                if (typeof left === "number" && typeof right === "number") return left * right;
                if (left instanceof Vec3 && typeof right === "number") return new Vec3(left.x * right, left.y * right, left.z * right, left.is2D);
                if (typeof left === "number" && right instanceof Vec3) return new Vec3(right.x * left, right.y * left, right.z * left, right.is2D);
                if (left instanceof VMColor && typeof right === "number") return new VMColor(left.r * right, left.g * right, left.b * right, left.a * right);
                if (typeof left === "number" && right instanceof VMColor) return new VMColor(right.r * left, right.g * left, right.b * left, right.a * left);
                if (left instanceof VMColor && right instanceof VMColor) return new VMColor(left.r * right.r, left.g * right.g, left.b * right.b, left.a * right.a);
                if (left instanceof VMQuat && right instanceof VMQuat) return quatMultiply(left, right);
                if (left instanceof VMQuat && right instanceof Vec3) return quatRotate(left, right);
                if (left instanceof Vec3 && right instanceof Vec3) return new Vec3(left.x * right.x, left.y * right.y, left.z * right.z, left.is2D);
                break;
            case "/":
                if (typeof left === "number" && typeof right === "number") {
                    if (intOp) {
                        if (right === 0) return this.fail("Sıfıra bölme.", node, frame, "DivideByZeroException");
                        return Math.trunc(left / right);
                    }
                    return left / right;
                }
                if (left instanceof Vec3 && typeof right === "number") return new Vec3(left.x / right, left.y / right, left.z / right, left.is2D);
                if (left instanceof VMColor && typeof right === "number") return new VMColor(left.r / right, left.g / right, left.b / right, left.a / right);
                break;
            case "%":
                if (typeof left === "number" && typeof right === "number") {
                    if (intOp && right === 0) return this.fail("Sıfıra bölme (mod).", node, frame, "DivideByZeroException");
                    return left % right;
                }
                break;
            case "==":
                return vmEquals(left, right);
            case "!=":
                return !vmEquals(left, right);
            case "<":
            case ">":
            case "<=":
            case ">=": {
                if ((typeof left === "number" || typeof left === "boolean") && (typeof right === "number" || typeof right === "boolean")) {
                    const a = Number(left);
                    const b = Number(right);
                    return op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
                }
                if (typeof left === "string" && typeof right === "string") {
                    return op === "<" ? left < right : op === ">" ? left > right : op === "<=" ? left <= right : left >= right;
                }
                break;
            }
            case "&":
                if (typeof left === "boolean" || typeof right === "boolean") return vmTruthy(left) && vmTruthy(right);
                return Number(left) & Number(right);
            case "|":
                if (typeof left === "boolean" || typeof right === "boolean") return vmTruthy(left) || vmTruthy(right);
                return Number(left) | Number(right);
            case "^":
                if (typeof left === "boolean" || typeof right === "boolean") return vmTruthy(left) !== vmTruthy(right);
                return Number(left) ^ Number(right);
            case "<<":
                if (left instanceof CoutStream) {
                    if (right instanceof EndlToken) {
                        this.flushStream(left, frame);
                    } else {
                        left.buffer += toDisplayString(right, "cpp", this, true);
                        if (left.buffer.includes("\n")) this.flushStream(left, frame, true);
                    }
                    return left;
                }
                return Number(left) << Number(right);
            case ">>":
                return Number(left) >> Number(right);
            default:
                break;
        }
        const describe = (value: VMValue) => value === null || value === undefined ? "null" : value instanceof ScriptObject ? value.cls.name : isHostObject(value) ? value.hostType : value.constructor?.name === "Object" ? typeof value : typeof value === "object" ? (value as object).constructor.name.replace(/^VM/, "") : typeof value;
        return this.fail(`'${op}' işlemi ${describe(left)} ve ${describe(right)} türleriyle yapılamaz.`, node, frame);
    }

    private sameCallable(a: VMValue, b: VMValue): boolean {
        if (a === b) return true;
        if (a instanceof VMBoundMethod && b instanceof VMBoundMethod) return a.self === b.self && a.name === b.name;
        return false;
    }

    flushStream(stream: CoutStream, frame: Frame | null, partial = false) {
        const text = stream.buffer;
        if (!text) return;
        if (partial) {
            const lastBreak = text.lastIndexOf("\n");
            const complete = text.slice(0, lastBreak);
            stream.buffer = text.slice(lastBreak + 1);
            for (const line of complete.split("\n")) this.host.log(stream.level, line, frame ? { scriptName: frame.scriptName, line: frame.line } : undefined);
            return;
        }
        stream.buffer = "";
        for (const line of text.split("\n")) this.host.log(stream.level, line, frame ? { scriptName: frame.scriptName, line: frame.line } : undefined);
    }

    /** Flushes pending std::cout text (called by the runtime after each callback). */
    flushAllStreams() {
        for (const name of ["cout", "cerr"]) {
            const stream = (this.stdlib.get("std") as StaticNamespace | undefined)?.getMember(name);
            if (stream instanceof CoutStream && stream.buffer) this.flushStream(stream, null);
        }
    }

    cast(value: VMValue, typeRef: TypeRef, node: { line: number; col: number }, frame: Frame): VMValue {
        const name = typeRef.name;
        switch (name) {
            case "int":
                if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
                if (typeof value === "boolean") return value ? 1 : 0;
                if (typeof value === "string" && value.length === 1) return value.charCodeAt(0);
                return this.fail(`Değer int türüne dönüştürülemez.`, node, frame, "InvalidCastException");
            case "float":
                if (typeof value === "number") return value;
                if (typeof value === "boolean") return value ? 1 : 0;
                if (typeof value === "string" && value.length === 1) return value.charCodeAt(0);
                return this.fail(`Değer float türüne dönüştürülemez.`, node, frame, "InvalidCastException");
            case "bool":
                return vmTruthy(value);
            case "string":
                if (typeRef.raw === "char" && typeof value === "number") return String.fromCharCode(value);
                return typeof value === "string" || value === null ? value : toDisplayString(value, frame.dialect, this);
            case "Vector2":
                return value instanceof Vec3 ? new Vec3(value.x, value.y, 0, true) : value;
            case "Vector3":
                return value instanceof Vec3 ? new Vec3(value.x, value.y, value.is2D ? 0 : value.z) : value;
            case "object":
            case "var":
                return value;
            default:
                if (this.program.enums.has(name)) return typeof value === "number" ? Math.trunc(value) : value;
                if (value === null || value === undefined) return null;
                if (!this.isType(value, typeRef)) return this.fail(`'${name}' türüne dönüştürme geçersiz.`, node, frame, "InvalidCastException");
                return value;
        }
    }

    isType(value: VMValue, typeRef: TypeRef): boolean {
        if (value === null || value === undefined) return false;
        const name = typeRef.name;
        switch (name) {
            case "int":
                return typeof value === "number" && Number.isInteger(value);
            case "float":
                return typeof value === "number";
            case "bool":
                return typeof value === "boolean";
            case "string":
                return typeof value === "string";
            case "object":
                return true;
            case "Vector3":
            case "Vector2":
                return value instanceof Vec3;
            case "Color":
                return value instanceof VMColor;
            case "Quaternion":
                return value instanceof VMQuat;
            case "List":
                return value instanceof VMList;
            case "Dictionary":
                return value instanceof VMDict;
            case "Exception":
                return value instanceof VMException;
            case "Behaviour":
                return value instanceof ScriptObject && value.cls.isBehaviour;
            default:
                if (value instanceof ScriptObject) return value.cls.isSubclassOf(name);
                if (isHostObject(value)) return value.hostType === name || Boolean(value.isType?.(name));
                if (typeRef.isArray) return value instanceof VMList;
                return false;
        }
    }

    private addCollectionItem(collection: VMValue, item: Expr, frame: Frame) {
        if (collection instanceof VMDict) {
            const pair = this.eval(item, frame);
            if (pair instanceof VMList && pair.items.length >= 2) collection.set(pair.items[0], copyStruct(pair.items[1]));
            else this.fail("Sözlük başlatıcısı {anahtar, değer} biçiminde olmalıdır.", item, frame);
            return;
        }
        if (collection instanceof VMList) {
            const value = copyStruct(this.eval(item, frame));
            if (collection.kind === "HashSet" && collection.items.some((existing) => vmEquals(existing, value))) return;
            collection.items.push(collection.elementType ? this.coerce(value, collection.elementType) : value);
            return;
        }
        this.fail("Koleksiyon başlatıcısı bu türle kullanılamaz.", item, frame);
    }

    constructType(typeRef: TypeRef, args: VMValue[], frame: Frame, node: { line: number; col: number } | null): VMValue {
        const name = typeRef.name;
        const cls = this.program.classes.get(name);
        if (cls) return this.instantiate(cls, args, frame);
        const builtin = constructBuiltin(name, args, typeRef.args.map((arg) => arg.name), frame.dialect, this);
        if (builtin !== NOT_FOUND) return builtin;
        const hosted = this.host.construct(name, args);
        if (hosted !== NOT_FOUND) return hosted;
        return this.fail(`'${typeRef.raw}' türünden nesne oluşturulamıyor.`, node, frame);
    }

    // -------------------------------------------------------------------
    // Calls
    // -------------------------------------------------------------------

    private evalArgs(args: Argument[], frame: Frame): { values: VMValue[]; refs: Array<VMRef | null> } {
        const values: VMValue[] = [];
        const refs: Array<VMRef | null> = [];
        for (const arg of args) {
            if (arg.modifier === "ref" || arg.modifier === "out") {
                if (arg.declare) this.declareLocal(frame, arg.declare.name, arg.declare.typeRef ? defaultForTypeName(arg.declare.typeRef.name, frame.dialect, this.program) : null);
                const target = this.lvalue(arg.expr, frame);
                const ref = new VMRef(target.get, target.set);
                values.push(ref);
                refs.push(ref);
                continue;
            }
            values.push(this.eval(arg.expr, frame));
            refs.push(null);
        }
        return { values, refs };
    }

    private derefArgs(values: VMValue[]): VMValue[] {
        return values.map((value) => (value instanceof VMRef ? value.get() : value));
    }

    private evalCall(expr: Extract<Expr, { type: "Call" }>, frame: Frame): VMValue {
        const callee = expr.callee;
        const typeArgs = expr.typeArgs.map((type) => type.name);
        if (callee.type === "Ident") {
            const name = callee.name;
            const res = callee.res;
            if (res?.kind === "method") {
                const { values } = this.evalArgs(expr.args, frame);
                const target = frame.self?.cls ?? frame.cls!;
                let found = target.findMethod(name, values.length) ?? frame.cls?.findMethod(name, values.length) ?? null;
                if (!found) this.fail(`'${name}' metodu ${values.length} parametreyle bulunamadı.`, callee, frame);
                const self = found!.method.isStatic ? null : frame.self;
                if (!found!.method.isStatic && !self) found = null;
                if (!found) return this.fail(`'${name}' örnek metodu statik bağlamdan çağrılamaz.`, callee, frame);
                return this.callUserMethod(self, found.owner, found.method, values, frame);
            }
            if (res?.kind === "function") {
                const { values } = this.evalArgs(expr.args, frame);
                return this.callFunction(name, values, callee, frame);
            }
            if (res?.kind === "behaviour") {
                const { values, refs } = this.evalArgs(expr.args, frame);
                return this.callBehaviour(frame, name, this.derefArgs(values), typeArgs, callee, refs);
            }
            if (res?.kind === "global") {
                const { values, refs } = this.evalArgs(expr.args, frame);
                this.callArgTypes = expr.args.map((arg) => arg.expr.st ?? null);
                return this.callGlobal(name, values, refs, typeArgs, callee, frame);
            }
            if (res?.kind === "class") {
                // C++ temporary: Enemy(1, 2)
                const { values } = this.evalArgs(expr.args, frame);
                return this.instantiate(this.program.classes.get(name)!, values, frame);
            }
            const fn = this.readIdent(callee, frame);
            const { values } = this.evalArgs(expr.args, frame);
            return this.callValue(fn, values, callee, frame);
        }
        if (callee.type === "Member") {
            if (callee.object.type === "Base") {
                const { values } = this.evalArgs(expr.args, frame);
                const base = frame.cls?.base;
                const found = base?.findMethod(callee.name, values.length);
                if (found) return this.callUserMethod(frame.self, found.owner, found.method, values, frame);
                return undefined; // base.Start() on MonoBehaviour: nothing to do
            }
            const object = this.eval(callee.object, frame);
            if (callee.nullSafe && (object === null || object === undefined || (isHostObject(object) && object.isAlive && !object.isAlive()))) return null;
            const { values, refs } = this.evalArgs(expr.args, frame);
            this.callArgTypes = expr.args.map((arg) => arg.expr.st ?? null);
            return this.callMember(object, callee.name, values, refs, typeArgs, callee, frame);
        }
        const fn = this.eval(callee, frame);
        const { values } = this.evalArgs(expr.args, frame);
        return this.callValue(fn, values, callee, frame);
    }

    private callFunction(name: string, args: VMValue[], node: { line: number; col: number }, frame: Frame): VMValue {
        const candidates = this.program.functions.get(name) ?? [];
        const fn = candidates.find((candidate) => candidate.params.length === args.length)
            ?? candidates.find((candidate) => args.length <= candidate.params.length && candidate.params.slice(args.length).every((param) => param.defaultValue));
        if (!fn) return this.fail(`'${name}' fonksiyonu ${args.length} parametreyle bulunamadı.`, node, frame);
        return this.callUserMethod(null, null, fn, args, frame);
    }

    private callBehaviour(frame: Frame, name: string, args: VMValue[], typeArgs: string[], node: { line: number; col: number }, refs: Array<VMRef | null> = []): VMValue {
        const binding = frame.self?.behaviour;
        if (!binding) return this.fail(`'${name}' yalnızca sahnedeki bir bileşende kullanılabilir.`, node, frame);
        try {
            const result = binding.callMember(name, args, typeArgs, refs);
            if (result === NOT_FOUND) return this.fail(`'${name}' çağrılamadı.`, node, frame);
            return result;
        } catch (error) {
            return this.wrapError(error, node, frame);
        }
    }

    private callGlobal(name: string, values: VMValue[], refs: Array<VMRef | null>, typeArgs: string[], node: { line: number; col: number }, frame: Frame): VMValue {
        if (this.globals.has(name)) return this.callValue(this.globals.get(name), this.derefArgs(values), node, frame);
        const target = this.stdlib.get(name) ?? this.host.resolveGlobal(name);
        const args = this.derefArgs(values);
        try {
            if (target instanceof VMNativeFunction) return target.fn(args);
            if (target instanceof StaticNamespace) {
                // C++ functional-style construction: Vector3(1, 2, 3)
                const constructed = constructBuiltin(name, args, typeArgs, frame.dialect, this);
                if (constructed !== NOT_FOUND) return constructed;
                const call = target.callMember("__call", args, typeArgs, refs);
                if (call !== NOT_FOUND) return call;
            }
        } catch (error) {
            return this.wrapError(error, node, frame);
        }
        if (target === NOT_FOUND || target === undefined) return this.fail(`'${name}' bu motor sürümünde desteklenmiyor.`, node, frame);
        return this.fail(`'${name}' çağrılabilir değil.`, node, frame);
    }

    callMember(object: VMValue, name: string, values: VMValue[], refs: Array<VMRef | null>, typeArgs: string[], node: { line: number; col: number }, frame: Frame): VMValue {
        if (object === null || object === undefined) return this.nullRef(`'${name}()' çağrılırken`, node, frame);
        if (object instanceof ScriptObject) {
            const found = object.cls.findMethod(name, values.length);
            if (found) return this.callUserMethod(found.method.isStatic ? null : object, found.owner, found.method, values, frame);
            if (name in object.fields && isCallable(object.fields[name])) return this.callValue(object.fields[name], this.derefArgs(values), node, frame);
            if (object.behaviour) {
                try {
                    const result = object.behaviour.callMember(name, this.derefArgs(values), typeArgs, refs);
                    if (result !== NOT_FOUND) return result;
                } catch (error) {
                    return this.wrapError(error, node, frame);
                }
            }
            if (name === "ToString") return object.cls.name;
            if (name === "Equals") return vmEquals(object, values[0]);
            if (name === "GetType") return object.cls.name;
            if (name === "GetHashCode") return 0;
            return this.fail(`'${object.cls.name}' nesnesinde '${name}' metodu (${values.length} parametre) yok.`, node, frame);
        }
        const args = this.derefArgs(values);
        if (isHostObject(object)) {
            if (object.isAlive && !object.isAlive() && name !== "Equals" && name !== "ToString") {
                return this.fail(`Yok edilmiş bir ${object.hostType} nesnesinde '${name}' çağrıldı.`, node, frame, "MissingReferenceException");
            }
            try {
                return object.call(name, args, typeArgs, refs);
            } catch (error) {
                return this.wrapError(error, node, frame);
            }
        }
        if (object instanceof StaticNamespace) {
            try {
                const result = object.callMember(name, args, typeArgs, refs);
                if (result === NOT_FOUND) return this.fail(`'${object.name}.${name}' fonksiyonu bulunamadı.`, node, frame);
                return result;
            } catch (error) {
                return this.wrapError(error, node, frame);
            }
        }
        if (object instanceof ClassInfo) {
            const found = object.findMethod(name, values.length);
            if (found?.method.isStatic) return this.callUserMethod(null, found.owner, found.method, values, frame);
            return this.fail(`'${object.name}.${name}' statik metodu bulunamadı.`, node, frame);
        }
        if (object instanceof EnumInfo) {
            if (name === "ToString") return object.name;
            return this.fail(`Enum üzerinde '${name}' çağrılamaz.`, node, frame);
        }
        if (name === "Invoke" && (isCallable(object) || object instanceof VMList)) return this.callValue(object, args, node, frame);
        try {
            const result = callBuiltinMethod(object, name, args, refs, typeArgs, frame.dialect, this, frame);
            if (result !== NOT_FOUND) return result;
        } catch (error) {
            return this.wrapError(error, node, frame);
        }
        return this.fail(`'${name}' metodu bu değerde yok.`, node, frame);
    }

    /** Human readable formatting honouring C# conventions. */
    display(value: VMValue, dialect: "csharp" | "cpp" = "csharp"): string {
        return toDisplayString(value, dialect, this);
    }

    /** Minimal frame for host callbacks (predicates, comparers). */
    hostFrame(scriptName = ""): Frame {
        return this.rootFrame(null, null, scriptName);
    }

    /** Invokes a callable from host/stdlib code (List.Find, WaitUntil…). */
    invokeCallable(fn: VMValue, args: VMValue[]): VMValue {
        return this.callValue(fn, args);
    }

    enumName(typeName: string | null, value: VMValue): string | null {
        if (!typeName || typeof value !== "number") return null;
        return this.program.enums.get(typeName)?.names.get(value) ?? null;
    }

    isHost(value: VMValue): value is HostObject {
        return isHostObject(value);
    }
}

function quatMultiply(a: VMQuat, b: VMQuat): VMQuat {
    return new VMQuat(
        a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
        a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
        a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    );
}

function quatRotate(q: VMQuat, v: Vec3): Vec3 {
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    return new Vec3(
        v.x + q.w * tx + (q.y * tz - q.z * ty),
        v.y + q.w * ty + (q.z * tx - q.x * tz),
        v.z + q.w * tz + (q.x * ty - q.y * tx),
        v.is2D,
    );
}

export type { Frame };
