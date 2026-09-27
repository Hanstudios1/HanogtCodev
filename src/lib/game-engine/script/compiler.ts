/**
 * Compiles script assets into linked classes: parses every file, links
 * classes/enums/free functions, resolves identifiers, infers static types
 * (for C#/C++ integer semantics) and reports diagnostics with positions.
 */
import type { ScriptFieldValue, ScriptLanguage } from "../types";
import type {
    Argument,
    ClassDecl,
    Expr,
    FieldDecl,
    MethodDecl,
    ProgramUnit,
    Stmt,
    TypeRef,
    VarDeclStmt,
} from "./ast";
import { ScriptSyntaxError } from "./lexer";
import { ARG_TYPED_MEMBERS, BEHAVIOUR_MEMBERS, FLOAT_RESULT_MEMBERS, GLOBAL_NAMES, INT_RESULT_MEMBERS } from "./names";
import { parseScript } from "./parser";
import { ClassInfo, EnumInfo, type FieldInfo } from "./values";

export interface ScriptSource {
    id: string;
    name: string;
    language: ScriptLanguage;
    content: string;
}

export interface Diagnostic {
    scriptId: string;
    scriptName: string;
    severity: "error" | "warning";
    message: string;
    line: number;
    col: number;
}

export interface CompiledProgram {
    classes: Map<string, ClassInfo>;
    enums: Map<string, EnumInfo>;
    functions: Map<string, MethodDecl[]>;
    globals: Array<{ decl: VarDeclStmt; unit: ProgramUnit }>;
    units: ProgramUnit[];
    diagnostics: Diagnostic[];
    /** scriptId → behaviour classes declared in that file (declaration order). */
    behavioursByScript: Map<string, string[]>;
    ok: boolean;
}

const BEHAVIOUR_BASES = new Set(["Behaviour"]);

function levenshtein(a: string, b: string): number {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1));
        }
    }
    return dp[a.length][b.length];
}

function suggest(name: string, candidates: Iterable<string>): string {
    let best = "";
    let bestScore = Infinity;
    for (const candidate of candidates) {
        const score = levenshtein(name, candidate);
        if (score < bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best && bestScore <= Math.max(1, Math.floor(name.length / 3)) ? ` Bunu mu demek istediniz: '${best}'?` : "";
}

/** Evaluates simple constant initialisers for the Inspector. */
function constantValue(expr: Expr | null, typeName: string, enums: Map<string, EnumInfo>): ScriptFieldValue | undefined {
    if (!expr) {
        if (typeName === "int" || typeName === "float") return 0;
        if (typeName === "bool") return false;
        if (typeName === "string") return "";
        if (typeName === "Vector3" || typeName === "Vector2") return { x: 0, y: 0, z: 0 };
        if (typeName === "Color") return "#ffffff";
        if (typeName === "GameObject" || typeName === "Transform") return { ref: "entity", id: null };
        return undefined;
    }
    switch (expr.type) {
        case "Literal":
            if (typeof expr.value === "number") return typeName === "int" ? Math.trunc(expr.value) : expr.value;
            return typeof expr.value === "string" || typeof expr.value === "boolean" ? expr.value : null;
        case "Unary": {
            const inner = constantValue(expr.arg, typeName, enums);
            if (expr.op === "-" && typeof inner === "number") return -inner;
            if (expr.op === "!" && typeof inner === "boolean") return !inner;
            return inner;
        }
        case "Cast":
            return constantValue(expr.arg, typeName, enums);
        case "New":
        case "InitList": {
            const items = expr.type === "New" ? expr.args.map((arg) => arg.expr) : expr.items;
            const numbers = items.map((item) => constantValue(item, "float", enums));
            if ((typeName === "Vector3" || typeName === "Vector2") && numbers.every((value) => typeof value === "number")) {
                return { x: Number(numbers[0] ?? 0), y: Number(numbers[1] ?? 0), z: Number(numbers[2] ?? 0) };
            }
            if (typeName === "Color" && numbers.length >= 3 && numbers.every((value) => typeof value === "number")) {
                const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0");
                return `#${channel(Number(numbers[0]))}${channel(Number(numbers[1]))}${channel(Number(numbers[2]))}`;
            }
            return undefined;
        }
        case "Member": {
            const objectName = expr.object.type === "Ident" ? expr.object.name : "";
            if ((objectName === "Vector3" || objectName === "Vector2")) {
                const presets: Record<string, [number, number, number]> = { zero: [0, 0, 0], one: [1, 1, 1], up: [0, 1, 0], down: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0], forward: [0, 0, 1], back: [0, 0, -1] };
                const preset = presets[expr.name];
                if (preset) return { x: preset[0], y: preset[1], z: objectName === "Vector2" ? 0 : preset[2] };
            }
            if (objectName === "Color") {
                const colors: Record<string, string> = { red: "#ff0000", green: "#00ff00", blue: "#0000ff", white: "#ffffff", black: "#000000", yellow: "#ffeb04", cyan: "#00ffff", magenta: "#ff00ff", gray: "#808080", grey: "#808080", clear: "#000000" };
                if (colors[expr.name]) return colors[expr.name];
            }
            if (objectName === "KeyCode") return expr.name;
            if (enums.has(objectName)) return enums.get(objectName)!.values.get(expr.name) ?? 0;
            return undefined;
        }
        default:
            return undefined;
    }
}

type ScopeFrame = Map<string, string | null>;

class Analyzer {
    private scopes: ScopeFrame[] = [];
    private cls: ClassInfo | null = null;
    private unit!: ProgramUnit;
    private currentStatic = false;
    private inSetter = false;

    constructor(private readonly program: CompiledProgram, private readonly globalsByName: Map<string, string | null>) {}

    private error(message: string, node: { line: number; col: number }) {
        this.program.diagnostics.push({ scriptId: this.unit.scriptId, scriptName: this.unit.scriptName, severity: "error", message, line: node.line, col: node.col });
    }

    private warn(message: string, node: { line: number; col: number }) {
        this.program.diagnostics.push({ scriptId: this.unit.scriptId, scriptName: this.unit.scriptName, severity: "warning", message, line: node.line, col: node.col });
    }

    private push() {
        this.scopes.push(new Map());
    }

    private pop() {
        this.scopes.pop();
    }

    private declare(name: string, type: string | null, node: { line: number; col: number }) {
        const scope = this.scopes[this.scopes.length - 1];
        if (!scope) return;
        if (this.scopes.some((frame) => frame.has(name)) && this.unit.dialect === "csharp" && !name.startsWith("__")) {
            this.warn(`'${name}' adı dış kapsamdaki bir değişkeni gölgeliyor.`, node);
        }
        scope.set(name, type);
    }

    private lookupLocal(name: string): { found: boolean; type: string | null } {
        for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
            if (this.scopes[index].has(name)) return { found: true, type: this.scopes[index].get(name) ?? null };
        }
        return { found: false, type: null };
    }

    private typeName(typeRef: TypeRef | null): string | null {
        if (!typeRef) return null;
        if (typeRef.isArray) return "Array";
        if (typeRef.name === "var") return null;
        return typeRef.name;
    }

    analyzeUnit(unit: ProgramUnit) {
        this.unit = unit;
        for (const decl of unit.classes) {
            const cls = this.program.classes.get(decl.name);
            if (!cls || cls.decl !== decl) continue;
            this.cls = cls;
            for (const field of decl.fields) {
                if (field.init) {
                    this.scopes = [new Map()];
                    this.currentStatic = field.isStatic;
                    this.expr(field.init);
                }
                if (field.arraySize) this.expr(field.arraySize);
            }
            for (const method of cls.methods.values()) {
                for (const overload of method) if (overload.body && (overload.ownerName === undefined || overload.ownerName === cls.name)) this.method(overload);
            }
            for (const property of decl.properties) {
                this.currentStatic = property.isStatic;
                if (property.getter) {
                    this.scopes = [new Map()];
                    this.block(property.getter.body);
                }
                if (property.setter) {
                    this.scopes = [new Map([["value", this.typeName(property.typeRef)]])];
                    this.inSetter = true;
                    this.block(property.setter.body);
                    this.inSetter = false;
                }
            }
        }
        this.cls = null;
        for (const fn of unit.functions) {
            if (fn.ownerName) continue; // analysed with its class
            this.method(fn);
        }
        for (const global of unit.globals) {
            this.scopes = [new Map()];
            for (const declaration of global.declarations) if (declaration.init) this.expr(declaration.init);
        }
    }

    private method(method: MethodDecl) {
        this.currentStatic = method.isStatic;
        this.scopes = [new Map()];
        for (const param of method.params) {
            this.scopes[0].set(param.name, this.typeName(param.typeRef));
            if (param.defaultValue) this.expr(param.defaultValue);
        }
        for (const init of method.memberInits) for (const arg of init.args) this.expr(arg);
        if (method.body) {
            this.block(method.body.body);
            method.isIterator = method.isIterator || method.body.body.some((stmt) => stmt.hasYield);
        }
    }

    private block(body: Stmt[]) {
        this.push();
        for (const stmt of body) this.stmt(stmt);
        this.pop();
    }

    private stmt(stmt: Stmt): boolean {
        let hasYield = false;
        switch (stmt.type) {
            case "Block":
                this.push();
                for (const inner of stmt.body) hasYield = this.stmt(inner) || hasYield;
                this.pop();
                break;
            case "VarDecl":
                for (const declaration of stmt.declarations) {
                    let type = this.typeName(declaration.typeRef);
                    if (declaration.arraySize) {
                        this.expr(declaration.arraySize);
                        type = "Array";
                    }
                    if (declaration.init) {
                        const initType = this.expr(declaration.init);
                        if (type === null) type = initType;
                    }
                    this.declare(declaration.name, type, declaration);
                }
                break;
            case "ExprStmt":
                this.expr(stmt.expr);
                break;
            case "If":
                this.expr(stmt.test);
                hasYield = this.scoped(stmt.consequent);
                if (stmt.alternate) hasYield = this.scoped(stmt.alternate) || hasYield;
                break;
            case "While":
                this.expr(stmt.test);
                hasYield = this.scoped(stmt.body);
                break;
            case "DoWhile":
                hasYield = this.scoped(stmt.body);
                this.expr(stmt.test);
                break;
            case "For":
                this.push();
                if (stmt.init) hasYield = this.stmt(stmt.init) || hasYield;
                if (stmt.test) this.expr(stmt.test);
                for (const update of stmt.update) this.expr(update);
                hasYield = this.scoped(stmt.body) || hasYield;
                this.pop();
                break;
            case "ForEach": {
                const iterableType = this.expr(stmt.iterable);
                this.push();
                const elementType = stmt.typeRef && stmt.typeRef.name !== "var" ? this.typeName(stmt.typeRef) : (iterableType === "Dictionary" ? "Pair" : null);
                if (stmt.bindings) for (const binding of stmt.bindings) this.declare(binding, null, stmt);
                else this.declare(stmt.name, elementType, stmt);
                hasYield = this.scoped(stmt.body);
                this.pop();
                break;
            }
            case "Switch":
                this.expr(stmt.discriminant);
                this.push();
                for (const switchCase of stmt.cases) {
                    for (const test of switchCase.tests) this.expr(test);
                    for (const inner of switchCase.body) hasYield = this.stmt(inner) || hasYield;
                }
                this.pop();
                break;
            case "Return":
                if (stmt.arg) this.expr(stmt.arg);
                break;
            case "Throw":
                if (stmt.arg) this.expr(stmt.arg);
                break;
            case "Try":
                hasYield = this.stmt(stmt.block);
                if (stmt.handler) {
                    this.push();
                    if (stmt.param) this.declare(stmt.param, "Exception", stmt);
                    hasYield = this.stmt(stmt.handler) || hasYield;
                    this.pop();
                }
                if (stmt.finalizer) hasYield = this.stmt(stmt.finalizer) || hasYield;
                if (hasYield) this.error("try/catch içinde yield kullanılamaz.", stmt);
                break;
            case "Yield":
                if (stmt.arg) this.expr(stmt.arg);
                hasYield = true;
                break;
            default:
                break;
        }
        stmt.hasYield = hasYield;
        return hasYield;
    }

    private scoped(stmt: Stmt): boolean {
        this.push();
        const result = this.stmt(stmt);
        this.pop();
        return result;
    }

    private resolveIdent(expr: Extract<Expr, { type: "Ident" }>, asCallee: boolean): string | null {
        const name = expr.name;
        const local = this.lookupLocal(name);
        if (local.found) {
            expr.res = { kind: "local" };
            return local.type;
        }
        if (this.inSetter && name === "value") {
            expr.res = { kind: "local" };
            return null;
        }
        const cls = this.cls;
        if (cls) {
            const field = cls.findField(name);
            if (field) {
                if (field.isStatic) {
                    expr.res = { kind: "static", className: cls.staticOwner(name)?.name ?? cls.name };
                } else {
                    if (this.currentStatic) this.error(`Statik metot içinde örnek alanı '${name}' kullanılamaz.`, expr);
                    expr.res = { kind: "field", className: cls.name };
                }
                return field.typeName;
            }
            const property = cls.findProperty(name);
            if (property) {
                expr.res = { kind: "field", className: cls.name };
                return this.typeName(property.property.typeRef);
            }
            if (cls.hasMethodNamed(name)) {
                expr.res = { kind: "method", className: cls.name };
                return null;
            }
            if (cls.isBehaviour && BEHAVIOUR_MEMBERS.has(name)) {
                expr.res = { kind: "behaviour", name };
                if (name === "transform") return "Transform";
                if (name === "gameObject") return "GameObject";
                if (name === "name" || name === "tag") return "string";
                if (name === "enabled") return "bool";
                return null;
            }
        }
        if (this.program.enums.has(name)) {
            expr.res = { kind: "enum", name };
            return `enumref:${name}`;
        }
        if (this.program.classes.has(name)) {
            expr.res = { kind: "class", name };
            return `classref:${name}`;
        }
        if (this.program.functions.has(name)) {
            expr.res = { kind: "function", name };
            return null;
        }
        if (this.globalsByName.has(name)) {
            expr.res = { kind: "global", name };
            return this.globalsByName.get(name) ?? null;
        }
        if (GLOBAL_NAMES.has(name)) {
            expr.res = { kind: "global", name };
            if (name === "RAND_MAX") return "int";
            if (["M_PI", "M_PI_2", "M_PI_4", "M_E", "INFINITY", "NAN"].includes(name)) return "float";
            return `static:${name}`;
        }
        if (cls && !cls.isBehaviour && BEHAVIOUR_MEMBERS.has(name)) {
            this.error(`'${name}' yalnızca MonoBehaviour/Behaviour sınıflarında kullanılabilir.`, expr);
            return null;
        }
        const candidates = new Set<string>([
            ...this.scopes.flatMap((scope) => [...scope.keys()]),
            ...(cls ? cls.allInstanceFields().map((field) => field.name) : []),
            ...(cls ? [...cls.methods.keys()] : []),
            ...(cls?.isBehaviour ? BEHAVIOUR_MEMBERS : []),
            ...GLOBAL_NAMES,
            ...this.program.classes.keys(),
        ]);
        this.error(`'${name}' adı bu bağlamda tanımlı değil.${asCallee ? "" : ""}${suggest(name, candidates)}`, expr);
        return null;
    }

    private memberType(objectType: string | null, name: string): string | null {
        if (INT_RESULT_MEMBERS.has(name)) return "int";
        if (objectType?.startsWith("enumref:")) return objectType.slice(8);
        if (objectType?.startsWith("classref:")) {
            const cls = this.program.classes.get(objectType.slice(9));
            const field = cls?.findField(name);
            if (field) return field.typeName;
            return null;
        }
        if (objectType && this.program.classes.has(objectType)) {
            const cls = this.program.classes.get(objectType)!;
            const field = cls.findField(name);
            if (field) return field.typeName;
            const property = cls.findProperty(name);
            if (property) return this.typeName(property.property.typeRef);
            return null;
        }
        if (objectType === "Vector3" || objectType === "Vector2") {
            if (name === "normalized") return objectType;
            if (["x", "y", "z", "magnitude", "sqrMagnitude"].includes(name)) return "float";
        }
        if (objectType === "Transform" && ["position", "localPosition", "eulerAngles", "localEulerAngles", "localScale", "forward", "right", "up", "lossyScale"].includes(name)) return "Vector3";
        if (objectType === "static:Vector3" || objectType === "static:Vector2") return objectType.slice(7);
        if (objectType === "static:Color") return "Color";
        if (objectType === "Rigidbody" && name === "velocity") return "Vector3";
        if (name === "position" || name === "velocity" || name === "point" || name === "normal" || name === "mousePosition") return "Vector3";
        if (name === "transform") return "Transform";
        if (name === "gameObject") return "GameObject";
        if (FLOAT_RESULT_MEMBERS.has(name)) return "float";
        return null;
    }

    private callType(callee: Expr, argTypes: Array<string | null>, typeArgs: TypeRef[]): string | null {
        const name = callee.type === "Member" ? callee.name : callee.type === "Ident" ? callee.name : "";
        if (typeArgs.length && /^(GetComponent|AddComponent|GetComponentInChildren|GetComponentInParent|FindObjectOfType|FindFirstObjectByType|FindAnyObjectByType)$/.test(name)) return typeArgs[0].name;
        if (ARG_TYPED_MEMBERS.has(name)) {
            if (argTypes.length && argTypes.every((type) => type === "int")) return "int";
            if (argTypes.some((type) => type === "float")) return "float";
            return argTypes.length ? null : null;
        }
        if (INT_RESULT_MEMBERS.has(name)) return "int";
        if (name === "rand") return "int";
        if (name === "ToString" || name === "to_string" || name === "Format" || name === "Substring" || name === "substr" || name === "ToUpper" || name === "ToLower" || name === "Trim" || name === "Replace") return "string";
        if (name === "Instantiate") return "GameObject";
        if (callee.type === "Ident") {
            const res = callee.res;
            if (res?.kind === "method" && this.cls) return this.returnTypeOf(this.cls, name, argTypes.length);
            if (res?.kind === "function") {
                const fn = this.program.functions.get(name)?.find((candidate) => candidate.params.length === argTypes.length) ?? this.program.functions.get(name)?.[0];
                return fn ? this.typeName(fn.returnType) : null;
            }
            if (res?.kind === "class") return name;
        }
        if (callee.type === "Member") {
            const objectType = callee.object.st ?? null;
            if (objectType && this.program.classes.has(objectType)) return this.returnTypeOf(this.program.classes.get(objectType)!, name, argTypes.length);
            if (objectType?.startsWith("classref:")) return this.returnTypeOf(this.program.classes.get(objectType.slice(9))!, name, argTypes.length);
            if ((objectType === "static:Vector3" || objectType === "static:Vector2") && ["Lerp", "MoveTowards", "Cross", "Normalize", "Scale", "Reflect", "Project", "ClampMagnitude", "Max", "Min", "SmoothDamp", "Slerp", "LerpUnclamped"].includes(name)) return objectType.slice(7);
        }
        if (FLOAT_RESULT_MEMBERS.has(name)) return "float";
        return null;
    }

    private returnTypeOf(cls: ClassInfo, name: string, argc: number): string | null {
        const found = cls.findMethod(name, argc);
        return found ? this.typeName(found.method.returnType) : null;
    }

    private args(args: Argument[]): Array<string | null> {
        return args.map((arg) => {
            if (arg.declare) {
                this.declare(arg.declare.name, this.typeName(arg.declare.typeRef), arg.expr);
                arg.expr.type === "Ident" && (arg.expr.res = { kind: "local" });
                return null;
            }
            return this.expr(arg.expr);
        });
    }

    private expr(expr: Expr): string | null {
        const type = this.exprInner(expr);
        expr.st = type;
        return type;
    }

    private exprInner(expr: Expr): string | null {
        switch (expr.type) {
            case "Literal":
                if (typeof expr.value === "number") return expr.numKind === "int" ? "int" : "float";
                if (typeof expr.value === "string") return "string";
                if (typeof expr.value === "boolean") return "bool";
                return null;
            case "Interpolated":
                for (const part of expr.parts) if ("expr" in part) this.expr(part.expr);
                return "string";
            case "Ident":
                return this.resolveIdent(expr, false);
            case "This":
                if (!this.cls) this.error("'this' yalnızca sınıf içinde kullanılabilir.", expr);
                if (this.currentStatic) this.error("Statik metotta 'this' kullanılamaz.", expr);
                return this.cls?.name ?? null;
            case "Base":
                if (!this.cls?.base && !this.cls?.isBehaviour) this.error("'base' için bir üst sınıf yok.", expr);
                return this.cls?.base?.name ?? null;
            case "Member": {
                const objectType = this.expr(expr.object);
                if (expr.object.type === "This" && this.cls) {
                    const known = this.cls.findField(expr.name) || this.cls.findProperty(expr.name) || this.cls.hasMethodNamed(expr.name) || (this.cls.isBehaviour && BEHAVIOUR_MEMBERS.has(expr.name));
                    if (!known) this.error(`'${this.cls.name}' sınıfında '${expr.name}' üyesi yok.${suggest(expr.name, [...this.cls.allInstanceFields().map((field) => field.name), ...this.cls.methods.keys()])}`, expr);
                }
                if (objectType?.startsWith("enumref:")) {
                    const info = this.program.enums.get(objectType.slice(8));
                    if (info && !info.values.has(expr.name)) this.error(`'${info.name}' enum'unda '${expr.name}' değeri yok.${suggest(expr.name, info.values.keys())}`, expr);
                }
                return this.memberType(objectType, expr.name);
            }
            case "Index": {
                const objectType = this.expr(expr.object);
                this.expr(expr.index);
                return objectType === "string" ? "string" : null;
            }
            case "Call": {
                let calleeType: string | null = null;
                if (expr.callee.type === "Ident") calleeType = this.resolveIdent(expr.callee, true);
                else calleeType = this.expr(expr.callee);
                void calleeType;
                const argTypes = this.args(expr.args);
                return this.callType(expr.callee, argTypes, expr.typeArgs);
            }
            case "New": {
                this.args(expr.args);
                if (expr.items) for (const item of expr.items) this.expr(item);
                if (expr.props) for (const prop of expr.props) this.expr(prop.value);
                if (expr.typeRef && !this.isKnownType(expr.typeRef.name)) {
                    this.error(`'${expr.typeRef.raw}' türü bulunamadı.${suggest(expr.typeRef.name, this.program.classes.keys())}`, expr.typeRef);
                }
                return expr.typeRef ? this.typeName(expr.typeRef) : null;
            }
            case "NewArray":
                if (expr.size) this.expr(expr.size);
                if (expr.items) for (const item of expr.items) this.expr(item);
                return "Array";
            case "InitList":
                for (const item of expr.items) this.expr(item);
                return null;
            case "Unary": {
                const argType = this.expr(expr.arg);
                if (expr.op === "!") return "bool";
                if (expr.op === "*" || expr.op === "&") return argType;
                return argType;
            }
            case "Update":
                return this.expr(expr.arg);
            case "Binary": {
                const left = this.expr(expr.left);
                const right = this.expr(expr.right);
                if (["==", "!=", "<", ">", "<=", ">="].includes(expr.op)) return "bool";
                if (expr.op === "+" && (left === "string" || right === "string")) return "string";
                if (left === "int" && right === "int") {
                    if (expr.op === "/" || expr.op === "%") expr.intOp = true;
                    return "int";
                }
                if (["&", "|", "^"].includes(expr.op) && left === "bool") return "bool";
                if (left === "Vector3" || right === "Vector3") return "Vector3";
                if (left === "Vector2" || right === "Vector2") return "Vector2";
                if (left === "Color" || right === "Color") return "Color";
                if (left === "Quaternion" && right === "Quaternion") return "Quaternion";
                if ((left === "int" || left === "float") && (right === "int" || right === "float")) return "float";
                if (expr.op === "<<" && (left === "static:std" || left === null)) return null;
                return left === "float" || right === "float" ? "float" : null;
            }
            case "Logical": {
                const left = this.expr(expr.left);
                const right = this.expr(expr.right);
                return expr.op === "??" ? (left ?? right) : "bool";
            }
            case "Assign": {
                const targetType = this.expr(expr.target);
                const valueType = this.expr(expr.value);
                if (expr.target.type === "Ident" && expr.target.res?.kind === "class") this.error("Bir sınıfa değer atanamaz.", expr);
                if (targetType === "int") {
                    expr.intTarget = valueType !== "int";
                    if ((expr.op === "/=" || expr.op === "%=") && valueType === "int") expr.intOp = true;
                }
                return targetType;
            }
            case "Conditional": {
                this.expr(expr.test);
                const a = this.expr(expr.consequent);
                const b = this.expr(expr.alternate);
                return a === b ? a : (a === "float" || b === "float") && (a === "int" || b === "int") ? "float" : a ?? b;
            }
            case "Cast":
                this.expr(expr.arg);
                return this.typeName(expr.typeRef);
            case "Is":
                this.expr(expr.arg);
                if (expr.declName) this.declare(expr.declName, expr.typeRef ? this.typeName(expr.typeRef) : null, expr);
                return "bool";
            case "As":
                this.expr(expr.arg);
                return this.typeName(expr.typeRef);
            case "Lambda": {
                this.push();
                for (const param of expr.params) this.declare(param, null, expr);
                if ("type" in expr.body && expr.body.type === "Block") {
                    const wasStatic = this.currentStatic;
                    this.block(expr.body.body);
                    this.currentStatic = wasStatic;
                } else {
                    this.expr(expr.body as Expr);
                }
                this.pop();
                return "Func";
            }
            case "TypeOf":
                return "Type";
            case "Default":
                return expr.typeRef ? this.typeName(expr.typeRef) : null;
        }
    }

    private isKnownType(name: string): boolean {
        return this.program.classes.has(name) || this.program.enums.has(name) || KNOWN_CONSTRUCTIBLE.has(name);
    }
}

const KNOWN_CONSTRUCTIBLE = new Set([
    "Vector2", "Vector3", "Color", "Quaternion", "List", "Dictionary", "HashSet", "Queue", "Stack", "WaitForSeconds",
    "WaitForSecondsRealtime", "WaitForEndOfFrame", "WaitForFixedUpdate", "WaitUntil", "WaitWhile", "Exception",
    "ArgumentException", "InvalidOperationException", "NullReferenceException", "IndexOutOfRangeException", "KeyNotFoundException",
    "GameObject", "Random", "string", "int", "float", "bool", "object", "Pair", "Array", "Func", "Action",
]);

function fieldInfoFrom(decl: FieldDecl, dialect: "csharp" | "cpp", enums: Map<string, EnumInfo>): FieldInfo {
    const attributes = new Map(decl.attributes.map((attribute) => [attribute.name, attribute]));
    const hidden = attributes.has("HideInInspector") || attributes.has("NonSerialized");
    const serialized = !hidden && !decl.isStatic && !decl.isConst && (decl.isPublic || attributes.has("SerializeField"));
    const range = attributes.get("Range");
    const numeric = (expr: Expr | undefined) => {
        const value = expr ? constantValue(expr, "float", enums) : undefined;
        return typeof value === "number" ? value : undefined;
    };
    const header = attributes.get("Header")?.args[0];
    const tooltip = attributes.get("Tooltip")?.args[0];
    const typeName = decl.typeRef.isArray || decl.arraySize !== undefined ? "Array" : decl.typeRef.name;
    const info: FieldInfo = {
        name: decl.name,
        typeName,
        typeRef: decl.typeRef,
        decl,
        isStatic: decl.isStatic,
        isConst: decl.isConst,
        serialized,
        header: header?.type === "Literal" && typeof header.value === "string" ? header.value : undefined,
        tooltip: tooltip?.type === "Literal" && typeof tooltip.value === "string" ? tooltip.value : undefined,
    };
    const min = numeric(range?.args[0]);
    const max = numeric(range?.args[1]);
    if (min !== undefined && max !== undefined) info.range = [min, max];
    info.defaultValue = constantValue(decl.init, typeName, enums);
    void dialect;
    return info;
}

function evaluateEnum(decl: { name: string; members: Array<{ name: string; value: Expr | null }> }, info: EnumInfo) {
    let next = 0;
    for (const member of decl.members) {
        let value = next;
        if (member.value) {
            const constant = constantValue(member.value, "int", new Map([[info.name, info]]));
            if (typeof constant === "number") value = constant;
            else if (member.value.type === "Ident" && info.values.has(member.value.name)) value = info.values.get(member.value.name)!;
        }
        info.values.set(member.name, value);
        if (!info.names.has(value)) info.names.set(value, member.name);
        next = value + 1;
    }
}

export function compileScripts(sources: ScriptSource[]): CompiledProgram {
    const program: CompiledProgram = {
        classes: new Map(),
        enums: new Map(),
        functions: new Map(),
        globals: [],
        units: [],
        diagnostics: [],
        behavioursByScript: new Map(),
        ok: true,
    };
    const addError = (source: { id: string; name: string }, message: string, line: number, col: number) => {
        program.diagnostics.push({ scriptId: source.id, scriptName: source.name, severity: "error", message, line, col });
    };

    for (const source of sources) {
        try {
            const unit = parseScript(source.content, { scriptId: source.id, scriptName: source.name, dialect: source.language });
            program.units.push(unit);
        } catch (error) {
            if (error instanceof ScriptSyntaxError) addError(source, error.message, error.line, error.col);
            else addError(source, error instanceof Error ? error.message : "Script çözümlenemedi.", 1, 1);
        }
    }

    // Enums first (field defaults and case labels need them).
    for (const unit of program.units) {
        for (const decl of unit.enums) {
            if (program.enums.has(decl.name)) {
                addError({ id: unit.scriptId, name: unit.scriptName }, `'${decl.name}' enum'u birden fazla kez tanımlandı.`, decl.line, decl.col);
                continue;
            }
            const info = new EnumInfo(decl.name);
            evaluateEnum(decl, info);
            program.enums.set(decl.name, info);
        }
    }

    const unitOfClass = new Map<string, ProgramUnit>();
    for (const unit of program.units) {
        for (const decl of unit.classes) {
            if (program.classes.has(decl.name) || program.enums.has(decl.name)) {
                addError({ id: unit.scriptId, name: unit.scriptName }, `'${decl.name}' adı birden fazla kez tanımlandı. Sınıf adları proje genelinde benzersiz olmalıdır.`, decl.line, decl.col);
                continue;
            }
            const cls = new ClassInfo(decl.name, decl, unit.dialect);
            for (const method of decl.methods) cls.addMethod(method);
            for (const property of decl.properties) cls.properties.set(property.name, property);
            for (const field of decl.fields) cls.fields.push(fieldInfoFrom(field, unit.dialect, program.enums));
            program.classes.set(decl.name, cls);
            unitOfClass.set(decl.name, unit);
        }
    }

    // C++ out-of-class definitions and free functions.
    for (const unit of program.units) {
        for (const fn of unit.functions) {
            if (fn.ownerName) {
                const cls = program.classes.get(fn.ownerName);
                if (!cls) {
                    addError({ id: unit.scriptId, name: unit.scriptName }, `'${fn.ownerName}::${fn.name}' için '${fn.ownerName}' sınıfı bulunamadı.`, fn.line, fn.col);
                    continue;
                }
                const existing = cls.methods.get(fn.name)?.find((candidate) => !candidate.body && candidate.params.length === fn.params.length);
                if (existing) {
                    existing.body = fn.body;
                    existing.params = fn.params.map((param, index) => ({ ...param, defaultValue: existing.params[index]?.defaultValue ?? param.defaultValue }));
                    existing.isIterator = fn.isIterator;
                    existing.memberInits = fn.memberInits;
                    existing.ownerName = fn.ownerName;
                } else {
                    cls.addMethod({ ...fn, isStatic: false, isPublic: true });
                }
                continue;
            }
            const list = program.functions.get(fn.name) ?? [];
            list.push(fn);
            program.functions.set(fn.name, list);
        }
        for (const global of unit.globals) {
            const staticDefinitions = global.declarations.filter((declaration) => declaration.name.includes("::"));
            for (const declaration of staticDefinitions) {
                const [className, member] = declaration.name.split("::");
                const field = program.classes.get(className)?.fields.find((candidate) => candidate.name === member);
                if (field && declaration.init) field.decl.init = declaration.init;
            }
            const plain = global.declarations.filter((declaration) => !declaration.name.includes("::"));
            if (plain.length) program.globals.push({ decl: { ...global, declarations: plain }, unit });
        }
    }

    // Link base classes and detect behaviours.
    for (const cls of program.classes.values()) {
        const baseName = cls.baseName;
        if (baseName && program.classes.has(baseName)) cls.base = program.classes.get(baseName)!;
    }
    for (const cls of program.classes.values()) {
        const seen = new Set<string>();
        let cursor: ClassInfo | null = cls;
        let behaviour = false;
        while (cursor) {
            if (seen.has(cursor.name)) {
                const unit = unitOfClass.get(cls.name)!;
                addError({ id: unit.scriptId, name: unit.scriptName }, `'${cls.name}' sınıf kalıtımı döngü içeriyor.`, cls.decl.line, cls.decl.col);
                cls.base = null;
                break;
            }
            seen.add(cursor.name);
            if (cursor.decl.baseNames.some((name) => BEHAVIOUR_BASES.has(name))) behaviour = true;
            cursor = cursor.base;
        }
        cls.isBehaviour = behaviour;
    }
    for (const unit of program.units) {
        const names = unit.classes.filter((decl) => program.classes.get(decl.name)?.decl === decl && program.classes.get(decl.name)?.isBehaviour).map((decl) => decl.name);
        program.behavioursByScript.set(unit.scriptId, names);
    }

    const globalsByName = new Map<string, string | null>();
    for (const { decl } of program.globals) {
        for (const declaration of decl.declarations) globalsByName.set(declaration.name, declaration.typeRef.name === "var" ? null : declaration.typeRef.name);
    }
    const analyzer = new Analyzer(program, globalsByName);
    for (const unit of program.units) {
        try {
            analyzer.analyzeUnit(unit);
        } catch (error) {
            addError({ id: unit.scriptId, name: unit.scriptName }, error instanceof Error ? `Analiz hatası: ${error.message}` : "Analiz hatası.", 1, 1);
        }
    }

    program.diagnostics.sort((a, b) => a.scriptName.localeCompare(b.scriptName) || a.line - b.line || a.col - b.col);
    program.ok = !program.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    return program;
}

/** Inspector-facing description of a behaviour's serialized fields. */
export function describeBehaviour(program: CompiledProgram, className: string): FieldInfo[] {
    const cls = program.classes.get(className);
    if (!cls) return [];
    return cls.allInstanceFields().filter((field) => field.serialized);
}

export type { ClassDecl };
