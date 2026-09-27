import type {
    Argument,
    Attribute,
    BlockStmt,
    ClassDecl,
    EnumDecl,
    Expr,
    FieldDecl,
    MethodDecl,
    ParamDecl,
    ProgramUnit,
    PropertyDecl,
    Stmt,
    SwitchCase,
    TypeRef,
    VarDeclarator,
    VarDeclStmt,
} from "./ast";
import { ScriptSyntaxError, tokenize, type ScriptDialect, type Token } from "./lexer";

const TYPE_ALIASES: Record<string, string> = {
    int: "int", uint: "int", long: "int", ulong: "int", short: "int", ushort: "int", byte: "int", sbyte: "int",
    size_t: "int", ssize_t: "int", int8_t: "int", int16_t: "int", int32_t: "int", int64_t: "int",
    uint8_t: "int", uint16_t: "int", uint32_t: "int", uint64_t: "int", Int32: "int", Int64: "int", Int16: "int", UInt32: "int",
    unsigned: "int", signed: "int",
    char: "string", wchar_t: "string", Char: "string",
    float: "float", double: "float", decimal: "float", Single: "float", Double: "float", Decimal: "float",
    bool: "bool", Boolean: "bool",
    string: "string", String: "string", wstring: "string",
    var: "var", auto: "var", dynamic: "object", object: "object", Object: "object",
    void: "void",
    vector: "List", List: "List", IList: "List", ICollection: "List", IEnumerable: "List", IReadOnlyList: "List", array: "List", deque: "List",
    map: "Dictionary", unordered_map: "Dictionary", Dictionary: "Dictionary", IDictionary: "Dictionary",
    set: "HashSet", unordered_set: "HashSet", HashSet: "HashSet",
    queue: "Queue", Queue: "Queue", stack: "Stack", Stack: "Stack",
    IEnumerator: "IEnumerator", Coroutine: "Coroutine",
    Vector2: "Vector2", Vector2Int: "Vector2", Vector3: "Vector3", Vector3Int: "Vector3", Vector4: "Vector3",
    Color: "Color", Color32: "Color",
    Quaternion: "Quaternion",
    BoxCollider: "Collider", SphereCollider: "Collider", CapsuleCollider: "Collider", MeshCollider: "Collider",
    BoxCollider2D: "Collider", CircleCollider2D: "Collider", CapsuleCollider2D: "Collider", PolygonCollider2D: "Collider", Collider2D: "Collider", Collider: "Collider",
    Collision2D: "Collision", Collision: "Collision",
    RaycastHit2D: "RaycastHit", RaycastHit: "RaycastHit",
    Text: "UIText", TextMeshProUGUI: "UIText", TMP_Text: "UIText", TextMeshPro: "UIText", UIText: "UIText",
    Renderer: "Renderer", MeshRenderer: "MeshRenderer", SpriteRenderer: "SpriteRenderer",
    Rigidbody2D: "Rigidbody2D", Rigidbody: "Rigidbody",
    MonoBehaviour: "Behaviour", Behaviour: "Behaviour", NetworkBehaviour: "Behaviour",
    Exception: "Exception", exception: "Exception", runtime_error: "Exception", logic_error: "Exception", out_of_range: "Exception", invalid_argument: "Exception",
    Action: "Action", Func: "Func", function: "Func",
    pair: "Pair", KeyValuePair: "Pair",
};

export function normalizeTypeName(name: string): string {
    return TYPE_ALIASES[name] ?? name;
}

const IGNORED_NAMESPACES = new Set(["std", "hanogt", "Hanogt", "UnityEngine", "System", "Collections", "Generic", "Engine", "SceneManagement", "UI", "TMPro", "Linq"]);

const MODIFIERS = new Set([
    "public", "private", "protected", "internal", "static", "const", "readonly", "virtual", "override", "abstract",
    "sealed", "new", "extern", "partial", "inline", "constexpr", "explicit", "friend", "mutable", "volatile",
    "unsafe", "async", "event", "implicit",
]);

const PRIMITIVE_CAST_TYPES = new Set(["int", "float", "bool", "string", "object"]);

type ParserOptions = { scriptId: string; scriptName: string; dialect: ScriptDialect };

export class Parser {
    private readonly tokens: Token[];
    private pos = 0;
    private readonly dialect: ScriptDialect;
    private yieldSeen = false;
    private readonly unit: ProgramUnit;

    constructor(source: string | Token[], private readonly options: ParserOptions) {
        this.dialect = options.dialect;
        this.tokens = typeof source === "string" ? tokenize(source, options.dialect) : source;
        this.unit = { scriptId: options.scriptId, scriptName: options.scriptName, dialect: options.dialect, classes: [], enums: [], functions: [], globals: [] };
    }

    // -------------------------------------------------------------------
    // Token helpers
    // -------------------------------------------------------------------

    private peek(offset = 0): Token {
        return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
    }

    private next(): Token {
        const token = this.tokens[this.pos];
        if (this.pos < this.tokens.length - 1) this.pos += 1;
        return token;
    }

    private is(value: string, offset = 0): boolean {
        const token = this.peek(offset);
        return (token.kind === "punct" || token.kind === "keyword") && token.value === value;
    }

    private isIdent(offset = 0, value?: string): boolean {
        const token = this.peek(offset);
        return token.kind === "ident" && (value === undefined || token.value === value);
    }

    private accept(value: string): boolean {
        if (this.is(value)) {
            this.next();
            return true;
        }
        return false;
    }

    private fail(message: string, token: Token = this.peek()): never {
        throw new ScriptSyntaxError(message, token.line, token.col);
    }

    private describe(token: Token): string {
        if (token.kind === "eof") return "dosya sonu";
        if (token.kind === "string") return "metin";
        if (token.kind === "number") return `'${token.value}'`;
        return `'${token.value}'`;
    }

    private expect(value: string, message?: string): Token {
        if (this.is(value)) return this.next();
        if (value === ">" && this.splitAngle()) return this.next();
        return this.fail(message ?? `'${value}' bekleniyordu, ${this.describe(this.peek())} bulundu.`);
    }

    private expectIdent(message = "Bir isim bekleniyordu."): Token {
        const token = this.peek();
        if (token.kind === "ident") return this.next();
        return this.fail(`${message} ${this.describe(token)} bulundu.`);
    }

    /** Splits '>>' / '>=' / '>>=' so generic argument lists can close. */
    private splitAngle(): boolean {
        const token = this.peek();
        if (token.kind !== "punct" || !token.value.startsWith(">") || token.value === ">") return false;
        const rest = token.value.slice(1);
        this.tokens.splice(this.pos, 1,
            { ...token, value: ">" },
            { ...token, value: rest, col: token.col + 1 });
        return true;
    }

    private pos0(token: Token = this.peek()) {
        return { line: token.line, col: token.col };
    }

    // -------------------------------------------------------------------
    // Program
    // -------------------------------------------------------------------

    parseProgram(): ProgramUnit {
        this.parseDeclarations(false);
        if (this.peek().kind !== "eof") this.fail(`Beklenmeyen ${this.describe(this.peek())}.`);
        return this.unit;
    }

    private skipUsing() {
        // using X.Y; using static X; using A = B; using namespace std;
        this.next();
        let guard = 0;
        while (!this.is(";") && this.peek().kind !== "eof" && guard < 200) {
            this.next();
            guard += 1;
        }
        this.accept(";");
    }

    private parseDeclarations(insideNamespace: boolean) {
        while (this.peek().kind !== "eof") {
            if (insideNamespace && this.is("}")) return;
            if (this.accept(";")) continue;
            if (this.is("using")) {
                // `using (var x = ...)` statements never appear at top level.
                this.skipUsing();
                continue;
            }
            if (this.is("namespace")) {
                this.next();
                while (this.isIdent() || this.is(".") || this.is("::")) this.next();
                if (this.accept(";")) continue; // file-scoped namespace
                this.expect("{");
                this.parseDeclarations(true);
                this.expect("}");
                continue;
            }
            if (this.is("template")) this.fail("C++ template'leri desteklenmiyor.");
            if (this.is("extern") && this.peek(1).kind === "string") {
                this.next();
                this.next();
                continue;
            }
            this.skipAttributes();
            const modifiers = this.parseModifiers();
            if (this.is("class") || this.is("struct") || this.is("interface")) {
                this.parseClass(modifiers);
                continue;
            }
            if (this.is("enum")) {
                this.parseEnum();
                continue;
            }
            if (this.dialect === "cpp") {
                this.parseCppTopLevel(modifiers);
                continue;
            }
            this.fail(`Burada sınıf, enum veya namespace bekleniyordu; ${this.describe(this.peek())} bulundu.`);
        }
    }

    private skipAttributes(): Attribute[] {
        const attributes: Attribute[] = [];
        while (this.dialect === "csharp" && this.is("[")) {
            this.next();
            do {
                if (this.isIdent() && this.is(":", 1)) { this.next(); this.next(); } // [field: SerializeField]
                const name = this.expectIdent("Öznitelik adı bekleniyordu.").value;
                const args: Expr[] = [];
                if (this.accept("(")) {
                    if (!this.is(")")) {
                        do {
                            if (this.isIdent() && this.is("=", 1)) { this.next(); this.next(); }
                            args.push(this.parseExpression());
                        } while (this.accept(","));
                    }
                    this.expect(")");
                }
                attributes.push({ name: name.replace(/Attribute$/, ""), args });
            } while (this.accept(","));
            this.expect("]");
        }
        return attributes;
    }

    private parseModifiers() {
        const found = new Set<string>();
        while (true) {
            const token = this.peek();
            if ((token.kind === "keyword" || token.kind === "ident") && MODIFIERS.has(token.value)) {
                // `new` as a modifier only when followed by a declaration keyword/type.
                if (token.value === "new" && (this.is("(", 1) || this.is("[", 1))) break;
                // `async` / `event` / `partial` are contextual identifiers.
                if (token.kind === "ident" && !(this.isIdent(1) || this.peek(1).kind === "keyword")) break;
                found.add(token.value);
                this.next();
                continue;
            }
            break;
        }
        return found;
    }

    private parseEnum() {
        const start = this.next();
        if (this.is("class") || this.is("struct")) this.next();
        const name = this.expectIdent("Enum adı bekleniyordu.").value;
        if (this.accept(":")) this.parseType();
        this.expect("{");
        const members: EnumDecl["members"] = [];
        while (!this.is("}")) {
            this.skipAttributes();
            const memberName = this.expectIdent("Enum üyesi bekleniyordu.").value;
            const value = this.accept("=") ? this.parseExpression() : null;
            members.push({ name: memberName, value });
            if (!this.accept(",")) break;
        }
        this.expect("}");
        this.accept(";");
        this.unit.enums.push({ name, members, ...this.pos0(start) });
    }

    private parseClass(modifiers: Set<string>) {
        const keyword = this.next();
        const isInterface = keyword.value === "interface";
        const isStruct = keyword.value === "struct";
        const nameToken = this.expectIdent("Sınıf adı bekleniyordu.");
        if (this.is("<")) this.fail("Generic sınıflar desteklenmiyor.");
        if (this.isIdent(0, "final")) this.next();
        const baseNames: string[] = [];
        if (this.accept(":")) {
            do {
                while (this.is("public") || this.is("private") || this.is("protected") || this.is("virtual")) this.next();
                const base = this.parseType();
                baseNames.push(base.name);
            } while (this.accept(","));
        }
        // C# generic constraints `where T : ...`
        while (this.isIdent(0, "where")) {
            while (!this.is("{") && this.peek().kind !== "eof") this.next();
        }
        if (this.dialect === "cpp" && this.accept(";")) return; // forward declaration
        const cls: ClassDecl = {
            name: nameToken.value,
            baseNames,
            fields: [],
            methods: [],
            properties: [],
            isStruct,
            scriptId: this.options.scriptId,
            scriptName: this.options.scriptName,
            ...this.pos0(nameToken),
        };
        void modifiers;
        this.parseClassBody(cls, this.dialect === "cpp" ? isStruct : false);
        this.accept(";");
        if (!isInterface) this.unit.classes.push(cls);
    }

    private parseClassBody(cls: ClassDecl, defaultPublic: boolean) {
        this.expect("{");
        let access = defaultPublic;
        while (!this.is("}")) {
            if (this.peek().kind === "eof") this.fail(`'${cls.name}' sınıfı kapanmadı; '}' eksik.`);
            if (this.accept(";")) continue;
            if (this.dialect === "cpp" && (this.is("public") || this.is("private") || this.is("protected")) && this.is(":", 1)) {
                access = this.next().value === "public";
                this.next();
                continue;
            }
            const attributes = this.skipAttributes();
            const memberStart = this.peek();
            const modifiers = this.parseModifiers();
            const isPublic = this.dialect === "cpp" ? access || modifiers.has("public") : modifiers.has("public") || modifiers.has("internal");
            const isStatic = modifiers.has("static") || modifiers.has("const") && this.dialect === "csharp";
            const isConst = modifiers.has("const") || modifiers.has("constexpr") || modifiers.has("readonly");

            if (this.is("class") || this.is("struct") || this.is("interface")) {
                this.parseClass(modifiers);
                continue;
            }
            if (this.is("enum")) {
                this.parseEnum();
                continue;
            }
            if (this.is("using")) {
                this.skipUsing();
                continue;
            }
            if (this.is("delegate")) {
                while (!this.is(";") && this.peek().kind !== "eof") this.next();
                this.accept(";");
                continue;
            }
            if (this.is("~")) {
                // Destructor: parse and discard.
                this.next();
                this.expectIdent();
                this.expect("(");
                this.expect(")");
                this.skipMethodSuffix();
                if (!this.accept(";")) this.parseBlock();
                continue;
            }
            if (this.is("operator")) this.fail("Operatör aşırı yükleme desteklenmiyor.");
            if (this.isIdent(0, cls.name) && this.is("(", 1)) {
                this.next();
                const method = this.parseMethodRest({ name: "void", args: [], isArray: false, raw: "void", ...this.pos0(memberStart) }, cls.name, memberStart, isStatic, isPublic, true);
                if (method) cls.methods.push(method);
                continue;
            }

            const typeRef = this.parseType();
            if (this.dialect === "cpp" && this.is("operator")) this.fail("Operatör aşırı yükleme desteklenmiyor.");
            const nameToken = this.expectIdent("Üye adı bekleniyordu.");

            if (this.is("(")) {
                const method = this.parseMethodRest(typeRef, nameToken.value, nameToken, isStatic, isPublic, false);
                if (method) cls.methods.push(method);
                continue;
            }
            if (this.dialect === "csharp" && this.is("{")) {
                this.parseProperty(cls, typeRef, nameToken, isStatic, isPublic, attributes);
                continue;
            }
            if (this.dialect === "csharp" && this.is("=>")) {
                this.next();
                const expr = this.parseExpression();
                this.expect(";");
                cls.properties.push({
                    name: nameToken.value,
                    typeRef,
                    getter: { type: "Block", body: [{ type: "Return", arg: expr, ...this.pos0(nameToken) }], ...this.pos0(nameToken) },
                    setter: null,
                    isStatic,
                    isPublic,
                    ...this.pos0(nameToken),
                });
                continue;
            }
            // Field declaration(s)
            let current = nameToken;
            while (true) {
                const field: FieldDecl = {
                    name: current.value,
                    typeRef,
                    init: null,
                    isPublic,
                    isStatic,
                    isConst,
                    attributes,
                    ...this.pos0(current),
                };
                if (this.dialect === "cpp" && this.accept("[")) {
                    field.arraySize = this.is("]") ? null : this.parseExpression();
                    this.expect("]");
                }
                if (this.accept("=")) {
                    field.init = this.is("{") ? this.parseInitList() : this.parseExpression();
                } else if (this.dialect === "cpp" && this.is("{")) {
                    field.init = this.parseBraceInit(typeRef);
                }
                cls.fields.push(field);
                if (!this.accept(",")) break;
                current = this.expectIdent("Alan adı bekleniyordu.");
            }
            this.expect(";", `Alan bildiriminden sonra ';' bekleniyordu.`);
        }
        this.expect("}");
    }

    private parseProperty(cls: ClassDecl, typeRef: TypeRef, nameToken: Token, isStatic: boolean, isPublic: boolean, attributes: Attribute[]) {
        this.expect("{");
        let getter: BlockStmt | null = null;
        let setter: BlockStmt | null = null;
        let auto = true;
        while (!this.is("}")) {
            this.parseModifiers();
            const accessor = this.expectIdent("get veya set bekleniyordu.");
            if (accessor.value !== "get" && accessor.value !== "set" && accessor.value !== "init") this.fail("Özellikte yalnızca get/set kullanılabilir.", accessor);
            let body: BlockStmt | null = null;
            if (this.accept(";")) {
                body = null;
            } else if (this.accept("=>")) {
                const expr = this.parseExpression();
                this.expect(";");
                body = accessor.value === "get"
                    ? { type: "Block", body: [{ type: "Return", arg: expr, ...this.pos0(accessor) }], ...this.pos0(accessor) }
                    : { type: "Block", body: [{ type: "ExprStmt", expr, ...this.pos0(accessor) }], ...this.pos0(accessor) };
                auto = false;
            } else {
                body = this.parseBlock();
                auto = false;
            }
            if (accessor.value === "get") getter = body;
            else setter = body;
        }
        this.expect("}");
        if (auto) {
            const field: FieldDecl = { name: nameToken.value, typeRef, init: null, isPublic, isStatic, isConst: false, attributes, ...this.pos0(nameToken) };
            if (this.accept("=")) {
                field.init = this.parseExpression();
                this.expect(";");
            }
            cls.fields.push(field);
            return;
        }
        const property: PropertyDecl = { name: nameToken.value, typeRef, getter, setter, isStatic, isPublic, ...this.pos0(nameToken) };
        cls.properties.push(property);
    }

    private skipMethodSuffix() {
        while (true) {
            if (this.is("const") || this.is("override") || this.isIdent(0, "final") || this.isIdent(0, "noexcept") || this.is("volatile")) {
                this.next();
                continue;
            }
            if (this.is("=") && (this.peek(1).kind === "number" || this.is("default", 1) || this.is("delete", 1))) {
                this.next();
                this.next();
                continue;
            }
            if (this.is("->")) {
                // trailing return type
                this.next();
                this.parseType();
                continue;
            }
            break;
        }
    }

    private parseParams(): ParamDecl[] {
        this.expect("(");
        const params: ParamDecl[] = [];
        if (this.dialect === "cpp" && this.is("void") && this.is(")", 1)) this.next();
        if (!this.is(")")) {
            do {
                this.skipAttributes();
                let modifier: ParamDecl["modifier"] = null;
                while (this.is("ref") || this.is("out") || this.is("in") || this.is("params") || this.is("this") || this.is("const")) {
                    const value = this.next().value;
                    if (value === "ref" || value === "out" || value === "in" || value === "params") modifier = value;
                }
                const typeRef = this.parseType();
                if (this.dialect === "cpp" && /&$/.test(typeRef.raw) && modifier === null && !typeRef.raw.startsWith("const")) modifier = "ref";
                const name = this.isIdent() ? this.next().value : `__arg${params.length}`;
                if (this.dialect === "cpp" && this.accept("[")) {
                    if (!this.is("]")) this.parseExpression();
                    this.expect("]");
                }
                const defaultValue = this.accept("=") ? this.parseExpression() : null;
                params.push({ name, typeRef, defaultValue, modifier });
            } while (this.accept(","));
        }
        this.expect(")");
        return params;
    }

    private parseMethodRest(returnType: TypeRef, name: string, start: Token, isStatic: boolean, isPublic: boolean, isConstructor: boolean, ownerName?: string): MethodDecl | null {
        this.yieldSeen = false;
        const params = this.parseParams();
        this.skipMethodSuffix();
        const memberInits: MethodDecl["memberInits"] = [];
        if (isConstructor && this.dialect === "csharp" && this.accept(":")) {
            // : base(...) / : this(...) — evaluated as a leading call.
            const target = this.next().value;
            this.expect("(");
            const args: Expr[] = [];
            if (!this.is(")")) { do args.push(this.parseExpression()); while (this.accept(",")); }
            this.expect(")");
            memberInits.push({ name: `:${target}`, args });
        } else if (isConstructor && this.dialect === "cpp" && this.accept(":")) {
            do {
                const member = this.expectIdent("Üye başlatıcı adı bekleniyordu.").value;
                const close = this.is("{") ? "}" : ")";
                this.next();
                const args: Expr[] = [];
                if (!this.is(close)) { do args.push(this.parseExpression()); while (this.accept(",")); }
                this.expect(close);
                memberInits.push({ name: member, args });
            } while (this.accept(","));
        }
        let body: BlockStmt | null = null;
        if (this.accept(";")) {
            body = null;
        } else if (this.dialect === "csharp" && this.accept("=>")) {
            const expr = this.parseExpression();
            this.expect(";");
            body = {
                type: "Block",
                body: [returnType.name === "void" || isConstructor ? { type: "ExprStmt", expr, ...this.pos0(start) } : { type: "Return", arg: expr, ...this.pos0(start) }],
                ...this.pos0(start),
            };
        } else {
            body = this.parseBlock();
        }
        return {
            name,
            returnType,
            params,
            body,
            isStatic,
            isPublic,
            isConstructor,
            memberInits,
            isIterator: this.yieldSeen,
            ownerName,
            ...this.pos0(start),
        };
    }

    private parseCppTopLevel(modifiers: Set<string>) {
        const start = this.peek();
        // Out-of-class constructor: Foo::Foo(...)
        if (this.isIdent() && this.is("::", 1) && this.isIdent(2) && this.peek(2).value === this.peek().value && this.is("(", 3)) {
            const owner = this.next().value;
            this.next();
            this.next();
            const method = this.parseMethodRest({ name: "void", args: [], isArray: false, raw: "void", ...this.pos0(start) }, owner, start, false, true, true, owner);
            if (method && method.body) this.unit.functions.push(method);
            return;
        }
        if (this.isIdent() && this.is("::", 1) && this.is("~", 2)) {
            // Out-of-class destructor: skip.
            while (!this.is("{") && this.peek().kind !== "eof") this.next();
            this.parseBlock();
            return;
        }
        const typeRef = this.parseType();
        const nameToken = this.expectIdent("Fonksiyon veya değişken adı bekleniyordu.");
        if (this.is("::")) {
            this.next();
            const methodName = this.expectIdent("Metot adı bekleniyordu.");
            if (!this.is("(")) {
                // Static member definition: `int Enemy::count = 0;`
                let init: Expr | null = null;
                if (this.accept("=")) init = this.is("{") ? this.parseInitList() : this.parseExpression();
                else if (this.is("{")) init = this.parseBraceInit(typeRef);
                this.expect(";");
                this.unit.globals.push({
                    type: "VarDecl",
                    isConst: false,
                    declarations: [{ name: `${nameToken.value}::${methodName.value}`, typeRef, init, line: methodName.line, col: methodName.col }],
                    ...this.pos0(start),
                });
                return;
            }
            const method = this.parseMethodRest(typeRef, methodName.value, methodName, modifiers.has("static"), true, false, nameToken.value);
            if (method && method.body) this.unit.functions.push(method);
            return;
        }
        if (this.is("(")) {
            const method = this.parseMethodRest(typeRef, nameToken.value, nameToken, true, true, false);
            if (method && method.body) this.unit.functions.push(method);
            return;
        }
        // Global variable(s)
        this.pos -= 1;
        const declarations = this.parseDeclarators(typeRef);
        this.expect(";");
        this.unit.globals.push({ type: "VarDecl", declarations, isConst: modifiers.has("const") || modifiers.has("constexpr"), ...this.pos0(start) });
    }

    // -------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------

    private parseType(): TypeRef {
        const type = this.tryParseType();
        if (!type) return this.fail(`Tür bekleniyordu, ${this.describe(this.peek())} bulundu.`);
        return type;
    }

    private tryParseType(): TypeRef | null {
        const start = this.pos;
        const startToken = this.peek();
        let raw = "";
        while (this.is("const") || this.is("volatile") || this.is("typename") || (this.dialect === "cpp" && (this.is("struct") || this.is("class")))) {
            raw += `${this.next().value} `;
        }
        let name: string;
        if (this.is("unsigned") || this.is("signed")) {
            raw += this.next().value;
            if (this.isIdent() && ["int", "long", "short", "char"].includes(this.peek().value)) {
                raw += ` ${this.next().value}`;
                if (this.isIdent(0, "long") || this.isIdent(0, "int")) raw += ` ${this.next().value}`;
            }
            name = "int";
        } else if (this.is("void")) {
            raw += this.next().value;
            name = "void";
        } else if (this.isIdent()) {
            const segments = [this.next().value];
            while ((this.is("::") || this.is(".")) && this.isIdent(1)) {
                this.next();
                segments.push(this.next().value);
            }
            if ((segments[0] === "long" || segments[0] === "short") && this.isIdent() && ["long", "int", "double"].includes(this.peek().value)) {
                segments[0] = this.next().value === "double" ? "double" : "long";
            }
            raw += segments.join(this.dialect === "cpp" ? "::" : ".");
            const meaningful = segments.filter((segment, index) => index === segments.length - 1 || !IGNORED_NAMESPACES.has(segment));
            name = normalizeTypeName(meaningful[meaningful.length - 1]);
        } else {
            this.pos = start;
            return null;
        }
        const args: TypeRef[] = [];
        if (this.is("<")) {
            const beforeArgs = this.pos;
            this.next();
            let ok = true;
            if (!this.is(">")) {
                do {
                    const arg = this.tryParseType();
                    if (!arg) { ok = false; break; }
                    args.push(arg);
                } while (this.accept(","));
            }
            if (ok && (this.is(">") || this.splitAngle())) {
                this.next();
                raw += `<${args.map((arg) => arg.raw).join(", ")}>`;
            } else {
                this.pos = beforeArgs;
                args.length = 0;
            }
        }
        // C# nullable marker `int?` (only when followed by something a declaration can continue with)
        if (this.dialect === "csharp" && this.is("?") && (this.isIdent(1) || this.is(">", 1) || this.is(",", 1) || this.is(")", 1) || this.is("[", 1))) {
            this.next();
        }
        while (this.dialect === "cpp" && (this.is("*") || this.is("&") || this.is("&&") || this.is("const"))) {
            raw += this.next().value;
        }
        let isArray = false;
        while (this.is("[") && (this.is("]", 1) || this.is(",", 1))) {
            this.next();
            while (this.accept(",")) { /* multi-dim marker */ }
            this.expect("]");
            isArray = true;
            raw += "[]";
        }
        return { name, args, isArray, raw: raw.trim(), line: startToken.line, col: startToken.col };
    }

    // -------------------------------------------------------------------
    // Statements
    // -------------------------------------------------------------------

    private parseBlock(): BlockStmt {
        const start = this.expect("{");
        const body: Stmt[] = [];
        while (!this.is("}")) {
            if (this.peek().kind === "eof") this.fail("Blok kapanmadı; '}' eksik.", start);
            body.push(this.parseStatement());
        }
        this.expect("}");
        return { type: "Block", body, ...this.pos0(start) };
    }

    private parseEmbedded(): Stmt {
        return this.parseStatement();
    }

    parseStatement(): Stmt {
        const token = this.peek();
        const at = this.pos0(token);
        if (this.is("{")) return this.parseBlock();
        if (this.accept(";")) return { type: "Empty", ...at };

        if (token.kind === "keyword") {
            switch (token.value) {
                case "if": {
                    this.next();
                    this.expect("(");
                    const test = this.parseExpression();
                    this.expect(")");
                    const consequent = this.parseEmbedded();
                    const alternate = this.accept("else") ? this.parseEmbedded() : null;
                    return { type: "If", test, consequent, alternate, ...at };
                }
                case "while": {
                    this.next();
                    this.expect("(");
                    const test = this.parseExpression();
                    this.expect(")");
                    return { type: "While", test, body: this.parseEmbedded(), ...at };
                }
                case "do": {
                    this.next();
                    const body = this.parseEmbedded();
                    this.expect("while");
                    this.expect("(");
                    const test = this.parseExpression();
                    this.expect(")");
                    this.expect(";");
                    return { type: "DoWhile", body, test, ...at };
                }
                case "for":
                    return this.parseFor();
                case "foreach": {
                    this.next();
                    this.expect("(");
                    let typeRef: TypeRef | null = null;
                    if (!(this.isIdent() && this.is("in", 1))) typeRef = this.parseType();
                    const name = this.expectIdent("Döngü değişkeni bekleniyordu.").value;
                    this.expect("in");
                    const iterable = this.parseExpression();
                    this.expect(")");
                    return { type: "ForEach", name, typeRef, iterable, body: this.parseEmbedded(), ...at };
                }
                case "switch":
                    return this.parseSwitch();
                case "return": {
                    this.next();
                    const arg = this.is(";") ? null : this.parseExpression();
                    this.expect(";");
                    return { type: "Return", arg, ...at };
                }
                case "break":
                    this.next();
                    this.expect(";");
                    return { type: "Break", ...at };
                case "continue":
                    this.next();
                    this.expect(";");
                    return { type: "Continue", ...at };
                case "throw": {
                    this.next();
                    const arg = this.is(";") ? null : this.parseExpression();
                    this.expect(";");
                    return { type: "Throw", arg, ...at };
                }
                case "try":
                    return this.parseTry();
                case "goto":
                    return this.fail("'goto' desteklenmiyor.");
                case "delete": {
                    this.next();
                    if (this.accept("[")) this.expect("]");
                    this.parseExpression();
                    this.expect(";");
                    return { type: "Empty", ...at };
                }
                case "using": {
                    if (this.is("(", 1)) {
                        // using (var x = ...) { } → just a block with a declaration
                        this.next();
                        this.next();
                        const decl = this.tryParseLocalDeclaration(false);
                        if (!decl) this.fail("using bildirimi çözümlenemedi.");
                        this.expect(")");
                        const body = this.parseEmbedded();
                        return { type: "Block", body: [decl as VarDeclStmt, body], ...at };
                    }
                    this.skipUsing();
                    return { type: "Empty", ...at };
                }
                default:
                    break;
            }
        }
        if (this.isIdent(0, "co_yield") || this.isIdent(0, "co_return")) {
            // C++20 coroutine spelling: co_yield expr; / co_return;
            const isReturn = this.isIdent(0, "co_return");
            this.next();
            this.yieldSeen = true;
            if (isReturn) {
                if (!this.is(";")) this.parseExpression();
                this.expect(";");
                return { type: "Yield", arg: null, isBreak: true, ...at };
            }
            const arg = this.is(";") ? null : this.parseExpression();
            this.expect(";");
            return { type: "Yield", arg, isBreak: false, ...at };
        }
        if (this.isIdent(0, "yield") && (this.is("return", 1) || this.is("break", 1))) {
            this.next();
            this.yieldSeen = true;
            if (this.accept("break")) {
                this.expect(";");
                return { type: "Yield", arg: null, isBreak: true, ...at };
            }
            this.expect("return");
            const arg = this.is(";") ? null : this.parseExpression();
            this.expect(";");
            return { type: "Yield", arg, isBreak: false, ...at };
        }

        const declaration = this.tryParseLocalDeclaration(true);
        if (declaration) return declaration;

        const expr = this.parseExpression();
        this.expect(";", `İfadeden sonra ';' bekleniyordu, ${this.describe(this.peek())} bulundu.`);
        return { type: "ExprStmt", expr, ...at };
    }

    private parseFor(): Stmt {
        const at = this.pos0(this.next());
        this.expect("(");
        // C++ range-based for: for (auto& x : list) / for (const auto& [k, v] : map)
        const save = this.pos;
        const rangeType = this.tryParseType();
        if (rangeType) {
            if (this.is("[")) {
                this.next();
                const bindings: string[] = [];
                do bindings.push(this.expectIdent().value); while (this.accept(","));
                this.expect("]");
                if (this.accept(":")) {
                    const iterable = this.parseExpression();
                    this.expect(")");
                    return { type: "ForEach", name: bindings[0], bindings, typeRef: rangeType, iterable, body: this.parseEmbedded(), ...at };
                }
            } else if (this.isIdent() && this.is(":", 1)) {
                const name = this.next().value;
                this.next();
                const iterable = this.parseExpression();
                this.expect(")");
                return { type: "ForEach", name, typeRef: rangeType, iterable, body: this.parseEmbedded(), ...at };
            }
        }
        this.pos = save;
        let init: Stmt | null = null;
        if (!this.is(";")) {
            init = this.tryParseLocalDeclaration(false);
            if (!init) {
                const exprs: Expr[] = [];
                do exprs.push(this.parseExpression()); while (this.accept(","));
                init = exprs.length === 1
                    ? { type: "ExprStmt", expr: exprs[0], ...at }
                    : { type: "Block", body: exprs.map((expr) => ({ type: "ExprStmt" as const, expr, ...at })), ...at };
            }
        }
        this.expect(";");
        const test = this.is(";") ? null : this.parseExpression();
        this.expect(";");
        const update: Expr[] = [];
        if (!this.is(")")) {
            do update.push(this.parseExpression()); while (this.accept(","));
        }
        this.expect(")");
        return { type: "For", init, test, update, body: this.parseEmbedded(), ...at };
    }

    private parseSwitch(): Stmt {
        const at = this.pos0(this.next());
        this.expect("(");
        const discriminant = this.parseExpression();
        this.expect(")");
        this.expect("{");
        const cases: SwitchCase[] = [];
        while (!this.is("}")) {
            const labels: Expr[] = [];
            let isDefault = false;
            let sawLabel = false;
            while (this.is("case") || this.is("default")) {
                sawLabel = true;
                if (this.accept("default")) {
                    isDefault = true;
                } else {
                    this.next();
                    labels.push(this.parseConditional());
                    if (this.isIdent(0, "when")) this.fail("switch 'when' koşulları desteklenmiyor.");
                }
                this.expect(":");
            }
            if (!sawLabel) this.fail(`'case' veya 'default' bekleniyordu, ${this.describe(this.peek())} bulundu.`);
            const body: Stmt[] = [];
            while (!this.is("case") && !this.is("default") && !this.is("}")) {
                if (this.peek().kind === "eof") this.fail("switch bloğu kapanmadı.");
                body.push(this.parseStatement());
            }
            cases.push({ tests: labels, isDefault, body });
        }
        this.expect("}");
        return { type: "Switch", discriminant, cases, ...at };
    }

    private parseTry(): Stmt {
        const at = this.pos0(this.next());
        const block = this.parseBlock();
        let param: string | null = null;
        let handler: BlockStmt | null = null;
        let finalizer: BlockStmt | null = null;
        while (this.is("catch")) {
            this.next();
            let currentParam: string | null = null;
            if (this.accept("(")) {
                if (this.accept("...")) {
                    // catch (...)
                } else {
                    this.parseType();
                    if (this.isIdent()) currentParam = this.next().value;
                }
                this.expect(")");
            }
            const currentHandler = this.parseBlock();
            if (!handler) {
                handler = currentHandler;
                param = currentParam;
            }
        }
        if (this.accept("finally")) finalizer = this.parseBlock();
        if (!handler && !finalizer) this.fail("try bloğundan sonra catch veya finally bekleniyordu.");
        return { type: "Try", block, param, handler, finalizer, ...at };
    }

    private parseDeclarators(typeRef: TypeRef): VarDeclarator[] {
        const declarations: VarDeclarator[] = [];
        do {
            const nameToken = this.expectIdent("Değişken adı bekleniyordu.");
            const declarator: VarDeclarator = { name: nameToken.value, typeRef, init: null, line: nameToken.line, col: nameToken.col };
            if (this.dialect === "cpp" && this.accept("[")) {
                declarator.arraySize = this.is("]") ? null : this.parseExpression();
                this.expect("]");
            }
            if (this.accept("=")) {
                declarator.init = this.is("{") ? this.parseInitList() : this.parseExpression();
            } else if (this.dialect === "cpp" && this.is("{")) {
                declarator.init = this.parseBraceInit(typeRef);
            } else if (this.dialect === "cpp" && this.is("(")) {
                const args = this.parseArguments();
                declarator.init = { type: "New", typeRef, args, items: null, props: null, line: nameToken.line, col: nameToken.col };
            }
            declarations.push(declarator);
        } while (this.accept(","));
        return declarations;
    }

    /** Local variable declaration (or C# local function) if the upcoming tokens form one. */
    private tryParseLocalDeclaration(requireSemicolon: boolean): VarDeclStmt | null {
        const start = this.pos;
        const at = this.pos0();
        let isConst = false;
        while (this.is("const") || this.is("static") || this.is("readonly") || this.is("constexpr")) {
            if (this.peek().value !== "static") isConst = true;
            this.next();
        }
        const typeRef = this.tryParseType();
        if (!typeRef || typeRef.name === "void" && !(this.isIdent() && this.is("(", 1))) {
            this.pos = start;
            return null;
        }
        if (!this.isIdent()) {
            this.pos = start;
            return null;
        }
        const follower = this.peek(1);
        const followerValue = follower.kind === "punct" || follower.kind === "keyword" ? follower.value : "";
        const cppDirect = this.dialect === "cpp" && (followerValue === "(" || followerValue === "{" || followerValue === "[");
        const csharpLocalFunction = this.dialect === "csharp" && followerValue === "(";
        if (!(followerValue === "=" || followerValue === ";" || followerValue === "," || cppDirect || csharpLocalFunction || (!requireSemicolon && followerValue === "in"))) {
            this.pos = start;
            return null;
        }
        if (csharpLocalFunction) {
            // Local function → lambda stored in a local variable.
            const nameToken = this.next();
            const method = this.parseMethodRest(typeRef, nameToken.value, nameToken, false, false, false);
            if (!method?.body) this.fail("Yerel fonksiyonun gövdesi olmalıdır.", nameToken);
            return {
                type: "VarDecl",
                isConst: true,
                declarations: [{
                    name: nameToken.value,
                    typeRef: { ...typeRef, name: "Func" },
                    init: { type: "Lambda", params: method!.params.map((param) => param.name), body: method!.body!, line: nameToken.line, col: nameToken.col },
                    line: nameToken.line,
                    col: nameToken.col,
                }],
                ...at,
            };
        }
        const declarations = this.parseDeclarators(typeRef);
        if (requireSemicolon) this.expect(";", `Değişken bildiriminden sonra ';' bekleniyordu.`);
        return { type: "VarDecl", declarations, isConst, ...at };
    }

    // -------------------------------------------------------------------
    // Expressions
    // -------------------------------------------------------------------

    parseExpression(): Expr {
        return this.parseAssignment();
    }

    private isLambdaStart(): boolean {
        if (this.isIdent() && this.is("=>", 1)) return true;
        if (!this.is("(")) return false;
        let depth = 0;
        for (let offset = 0; offset < 64; offset += 1) {
            const token = this.peek(offset);
            if (token.kind === "eof") return false;
            if (token.kind === "punct" && token.value === "(") depth += 1;
            if (token.kind === "punct" && token.value === ")") {
                depth -= 1;
                if (depth === 0) return this.is("=>", offset + 1);
            }
        }
        return false;
    }

    private parseLambda(): Expr {
        const at = this.pos0();
        const params: string[] = [];
        if (this.isIdent()) {
            params.push(this.next().value);
        } else {
            this.expect("(");
            if (!this.is(")")) {
                do {
                    if (this.isIdent() && (this.is(",", 1) || this.is(")", 1))) {
                        params.push(this.next().value);
                    } else {
                        this.parseType();
                        params.push(this.expectIdent("Parametre adı bekleniyordu.").value);
                    }
                } while (this.accept(","));
            }
            this.expect(")");
        }
        this.expect("=>");
        const body = this.is("{") ? this.parseBlock() : this.parseExpression();
        return { type: "Lambda", params, body, ...at };
    }

    private parseAssignment(): Expr {
        if (this.dialect === "csharp" && this.isLambdaStart()) return this.parseLambda();
        const left = this.parseConditional();
        const token = this.peek();
        if (token.kind === "punct" && ["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=", "??="].includes(token.value)) {
            if (!["Ident", "Member", "Index", "Unary"].includes(left.type)) this.fail("Atamanın sol tarafı bir değişken, alan veya dizi öğesi olmalıdır.", token);
            this.next();
            const value = token.value === "=" && this.is("{") ? this.parseInitList() : this.parseAssignment();
            return { type: "Assign", op: token.value, target: left, value, line: token.line, col: token.col };
        }
        return left;
    }

    private parseConditional(): Expr {
        const test = this.parseNullCoalesce();
        if (this.is("?")) {
            const at = this.pos0(this.next());
            const consequent = this.parseAssignment();
            this.expect(":", "Koşul ifadesinde ':' bekleniyordu.");
            const alternate = this.parseAssignment();
            return { type: "Conditional", test, consequent, alternate, ...at };
        }
        return test;
    }

    private parseNullCoalesce(): Expr {
        const left = this.parseLogicalOr();
        if (this.is("??")) {
            const at = this.pos0(this.next());
            return { type: "Logical", op: "??", left, right: this.parseNullCoalesce(), ...at };
        }
        return left;
    }

    private parseLogicalOr(): Expr {
        let left = this.parseLogicalAnd();
        while (this.is("||") || (this.dialect === "cpp" && this.isIdent(0, "or"))) {
            const at = this.pos0(this.next());
            left = { type: "Logical", op: "||", left, right: this.parseLogicalAnd(), ...at };
        }
        return left;
    }

    private parseLogicalAnd(): Expr {
        let left = this.parseBinaryLevel(0);
        while (this.is("&&") || (this.dialect === "cpp" && this.isIdent(0, "and"))) {
            const at = this.pos0(this.next());
            left = { type: "Logical", op: "&&", left, right: this.parseBinaryLevel(0), ...at };
        }
        return left;
    }

    private static readonly LEVELS: string[][] = [["|"], ["^"], ["&"], ["==", "!="], ["<", ">", "<=", ">="], ["<<", ">>"], ["+", "-"], ["*", "/", "%"]];

    private parseBinaryLevel(level: number): Expr {
        if (level >= Parser.LEVELS.length) return this.parseUnary();
        let left = this.parseBinaryLevel(level + 1);
        const operators = Parser.LEVELS[level];
        while (true) {
            const token = this.peek();
            if (level === 4 && token.kind === "keyword" && (token.value === "is" || token.value === "as")) {
                left = this.parseIsAs(left);
                continue;
            }
            if (token.kind !== "punct" || !operators.includes(token.value)) break;
            this.next();
            const right = this.parseBinaryLevel(level + 1);
            left = { type: "Binary", op: token.value, left, right, line: token.line, col: token.col };
        }
        return left;
    }

    private parseIsAs(left: Expr): Expr {
        const token = this.next();
        const at = this.pos0(token);
        if (token.value === "as") return { type: "As", arg: left, typeRef: this.parseType(), ...at };
        let negate = false;
        if (this.isIdent(0, "not")) {
            this.next();
            negate = true;
        }
        if (this.is("null")) {
            this.next();
            return { type: "Is", arg: left, typeRef: null, nullCheck: true, negate, ...at };
        }
        const typeRef = this.parseType();
        const declName = this.isIdent() ? this.next().value : undefined;
        return { type: "Is", arg: left, typeRef, negate, declName, ...at };
    }

    private tryParseCast(): Expr | null {
        const start = this.pos;
        const at = this.pos0();
        this.next(); // (
        const typeRef = this.tryParseType();
        if (!typeRef || !this.is(")")) {
            this.pos = start;
            return null;
        }
        this.next();
        const nextToken = this.peek();
        const primitive = PRIMITIVE_CAST_TYPES.has(typeRef.name);
        const startsOperand = nextToken.kind === "ident" || nextToken.kind === "number" || nextToken.kind === "string"
            || nextToken.kind === "char" || nextToken.kind === "interp"
            || (nextToken.kind === "keyword" && ["this", "new", "true", "false", "null", "nullptr", "base", "typeof", "default"].includes(nextToken.value))
            || (nextToken.kind === "punct" && ["(", "!", "~"].includes(nextToken.value))
            || (primitive && nextToken.kind === "punct" && ["-", "+"].includes(nextToken.value));
        const looksLikeType = primitive || /^[A-Z]/.test(typeRef.name) || typeRef.raw.includes("*");
        if (!startsOperand || !looksLikeType) {
            this.pos = start;
            return null;
        }
        return { type: "Cast", typeRef, arg: this.parseUnary(), ...at };
    }

    private parseUnary(): Expr {
        const token = this.peek();
        const at = this.pos0(token);
        if (token.kind === "punct") {
            switch (token.value) {
                case "-":
                case "+":
                case "!":
                case "~":
                    this.next();
                    return { type: "Unary", op: token.value, arg: this.parseUnary(), ...at };
                case "++":
                case "--":
                    this.next();
                    return { type: "Update", op: token.value, prefix: true, arg: this.parseUnary(), ...at };
                case "*":
                case "&":
                    if (this.dialect === "cpp") {
                        this.next();
                        return { type: "Unary", op: token.value, arg: this.parseUnary(), ...at };
                    }
                    break;
                case "(": {
                    const cast = this.tryParseCast();
                    if (cast) return cast;
                    break;
                }
                default:
                    break;
            }
        }
        if (token.kind === "ident" && token.value === "not" && this.dialect === "cpp") {
            this.next();
            return { type: "Unary", op: "!", arg: this.parseUnary(), ...at };
        }
        if (token.kind === "ident" && token.value === "await") this.fail("async/await desteklenmiyor; coroutine (IEnumerator) kullanın.");
        return this.parsePostfix(this.parsePrimary());
    }

    parseArguments(): Argument[] {
        this.expect("(");
        const args: Argument[] = [];
        if (!this.is(")")) {
            do {
                if (this.isIdent() && this.is(":", 1) && this.dialect === "csharp") {
                    // Named arguments are accepted positionally.
                    this.next();
                    this.next();
                }
                let modifier: Argument["modifier"] = null;
                if (this.is("ref") || this.is("out") || this.is("in")) modifier = this.next().value as Argument["modifier"];
                if (modifier === "out" && !(this.isIdent() && (this.is(",", 1) || this.is(")", 1)))) {
                    // out var x / out RaycastHit hit
                    const typeRef = this.tryParseType();
                    const nameToken = this.expectIdent("out değişken adı bekleniyordu.");
                    args.push({
                        expr: { type: "Ident", name: nameToken.value, line: nameToken.line, col: nameToken.col },
                        modifier,
                        declare: { name: nameToken.value, typeRef: typeRef && typeRef.name !== "var" ? typeRef : null },
                    });
                    continue;
                }
                args.push({ expr: this.parseExpression(), modifier });
            } while (this.accept(","));
        }
        this.expect(")", "Fonksiyon çağrısında ')' bekleniyordu.");
        return args;
    }

    private tryParseTypeArgs(): TypeRef[] | null {
        const start = this.pos;
        if (!this.is("<")) return null;
        this.next();
        const args: TypeRef[] = [];
        if (!this.is(">")) {
            do {
                const type = this.tryParseType();
                if (!type) {
                    this.pos = start;
                    return null;
                }
                args.push(type);
            } while (this.accept(","));
        }
        if (!(this.is(">") || this.splitAngle())) {
            this.pos = start;
            return null;
        }
        this.next();
        if (!this.is("(")) {
            this.pos = start;
            return null;
        }
        return args;
    }

    private parsePostfix(expr: Expr): Expr {
        while (true) {
            const token = this.peek();
            if (token.kind !== "punct") break;
            const at = this.pos0(token);
            if (token.value === "." || token.value === "->" || token.value === "::" || token.value === "?.") {
                this.next();
                const nameToken = this.peek();
                if (nameToken.kind !== "ident" && nameToken.kind !== "keyword") this.fail("Üye adı bekleniyordu.");
                this.next();
                expr = { type: "Member", object: expr, name: nameToken.value, nullSafe: token.value === "?.", scoped: token.value === "::", ...at };
                continue;
            }
            if (token.value === "(") {
                expr = { type: "Call", callee: expr, args: this.parseArguments(), typeArgs: [], ...at };
                continue;
            }
            if (token.value === "[") {
                this.next();
                const index = this.parseExpression();
                this.expect("]");
                expr = { type: "Index", object: expr, index, nullSafe: false, ...at };
                continue;
            }
            if (token.value === "++" || token.value === "--") {
                this.next();
                expr = { type: "Update", op: token.value, prefix: false, arg: expr, ...at };
                continue;
            }
            if (token.value === "<" && (expr.type === "Ident" || expr.type === "Member")) {
                const typeArgs = this.tryParseTypeArgs();
                if (typeArgs) {
                    expr = { type: "Call", callee: expr, args: this.parseArguments(), typeArgs, ...at };
                    continue;
                }
            }
            if (token.value === "!" && this.dialect === "csharp" && (this.is(".", 1) || this.is(")", 1) || this.is(";", 1))) {
                this.next(); // null-forgiving operator
                continue;
            }
            break;
        }
        return expr;
    }

    private parseInitList(): Expr {
        const at = this.pos0(this.expect("{"));
        const items: Expr[] = [];
        while (!this.is("}")) {
            items.push(this.is("{") ? this.parseInitList() : this.parseExpression());
            if (!this.accept(",")) break;
        }
        this.expect("}");
        return { type: "InitList", items, ...at };
    }

    private parseBraceInit(typeRef: TypeRef): Expr {
        const list = this.parseInitList();
        if (list.type !== "InitList") return list;
        if (["List", "Dictionary", "HashSet", "Queue", "Stack"].includes(typeRef.name) || typeRef.isArray) return list;
        return { type: "New", typeRef, args: list.items.map((expr) => ({ expr, modifier: null })), items: null, props: null, line: list.line, col: list.col };
    }

    private parseNew(): Expr {
        const at = this.pos0(this.next());
        if (this.is("(")) {
            return { type: "New", typeRef: null, args: this.parseArguments(), items: null, props: null, ...at };
        }
        if (this.is("[") && this.is("]", 1)) {
            this.next();
            this.next();
            const list = this.parseInitList();
            return { type: "NewArray", elementType: null, size: null, items: list.type === "InitList" ? list.items : [], ...at };
        }
        const typeRef = this.parseType();
        if (typeRef.isArray) {
            const list = this.is("{") ? this.parseInitList() : null;
            return { type: "NewArray", elementType: { ...typeRef, isArray: false }, size: null, items: list && list.type === "InitList" ? list.items : [], ...at };
        }
        if (this.is("[")) {
            this.next();
            const size = this.parseExpression();
            this.expect("]");
            const list = this.is("{") ? this.parseInitList() : null;
            return { type: "NewArray", elementType: typeRef, size, items: list && list.type === "InitList" ? list.items : null, ...at };
        }
        const hasArgs = this.is("(");
        const args = hasArgs ? this.parseArguments() : [];
        let items: Expr[] | null = null;
        let props: Array<{ name: string; value: Expr }> | null = null;
        if (!hasArgs && !this.is("{") && this.dialect === "csharp") this.fail("'new' ifadesinde '(' bekleniyordu.");
        if (this.is("{")) {
            if (this.isIdent(1) && this.is("=", 2)) {
                this.next();
                props = [];
                while (!this.is("}")) {
                    const name = this.expectIdent().value;
                    this.expect("=");
                    props.push({ name, value: this.is("{") ? this.parseInitList() : this.parseExpression() });
                    if (!this.accept(",")) break;
                }
                this.expect("}");
            } else {
                const list = this.parseInitList();
                items = list.type === "InitList" ? list.items : [];
            }
        }
        return { type: "New", typeRef, args, items, props, ...at };
    }

    private parseInterpolated(token: Token): Expr {
        const parts: Array<{ text: string } | { expr: Expr; format?: string }> = [];
        for (const part of token.parts ?? []) {
            if (part.text !== undefined) {
                parts.push({ text: part.text });
                continue;
            }
            let tokens: Token[];
            try {
                tokens = tokenize(part.code ?? "", this.dialect).map((inner) => ({
                    ...inner,
                    line: part.line + inner.line - 1,
                    col: inner.line === 1 ? part.col + inner.col - 1 : inner.col,
                }));
            } catch (error) {
                if (error instanceof ScriptSyntaxError) throw new ScriptSyntaxError(error.message, part.line, part.col);
                throw error;
            }
            const sub = new Parser(tokens, this.options);
            const expr = sub.parseExpression();
            if (sub.peek().kind !== "eof") sub.fail(`Enterpolasyon ifadesinde beklenmeyen ${sub.describe(sub.peek())}.`);
            parts.push({ expr, format: part.format });
        }
        return { type: "Interpolated", parts, line: token.line, col: token.col };
    }

    private parsePrimary(): Expr {
        const token = this.peek();
        const at = this.pos0(token);
        switch (token.kind) {
            case "number":
                this.next();
                return { type: "Literal", value: token.num ?? 0, numKind: token.isFloat ? "float" : "int", ...at };
            case "string":
                this.next();
                return { type: "Literal", value: token.value, ...at };
            case "char":
                this.next();
                return { type: "Literal", value: token.value, isChar: true, ...at };
            case "interp":
                this.next();
                return this.parseInterpolated(token);
            case "keyword":
                switch (token.value) {
                    case "true":
                    case "false":
                        this.next();
                        return { type: "Literal", value: token.value === "true", ...at };
                    case "null":
                    case "nullptr":
                        this.next();
                        return { type: "Literal", value: null, ...at };
                    case "this":
                        this.next();
                        return { type: "This", ...at };
                    case "base":
                        this.next();
                        return { type: "Base", ...at };
                    case "new":
                        return this.parseNew();
                    case "typeof": {
                        this.next();
                        this.expect("(");
                        const typeRef = this.parseType();
                        this.expect(")");
                        return { type: "TypeOf", typeRef, ...at };
                    }
                    case "default": {
                        this.next();
                        if (this.accept("(")) {
                            const typeRef = this.parseType();
                            this.expect(")");
                            return { type: "Default", typeRef, ...at };
                        }
                        return { type: "Default", typeRef: null, ...at };
                    }
                    case "sizeof":
                        return this.fail("sizeof desteklenmiyor.");
                    case "void":
                        return this.fail("Burada 'void' kullanılamaz.");
                    default:
                        return this.fail(`Beklenmeyen anahtar kelime: '${token.value}'.`);
                }
            case "ident": {
                if (this.dialect === "cpp" && ["static_cast", "dynamic_cast", "reinterpret_cast", "const_cast"].includes(token.value) && this.is("<", 1)) {
                    this.next();
                    this.expect("<");
                    const typeRef = this.parseType();
                    this.expect(">");
                    this.expect("(");
                    const arg = this.parseExpression();
                    this.expect(")");
                    return { type: "Cast", typeRef, arg, ...at };
                }
                this.next();
                return { type: "Ident", name: token.value, ...at };
            }
            case "punct":
                if (token.value === "(") {
                    this.next();
                    const inner = this.parseExpression();
                    this.expect(")", "Parantez kapanmadı; ')' bekleniyordu.");
                    return inner;
                }
                if (token.value === "{") return this.parseInitList();
                if (token.value === "[" && this.dialect === "csharp") {
                    // C# 12 collection expression [a, b, c]
                    this.next();
                    const items: Expr[] = [];
                    while (!this.is("]")) {
                        items.push(this.parseExpression());
                        if (!this.accept(",")) break;
                    }
                    this.expect("]");
                    return { type: "InitList", items, ...at };
                }
                return this.fail(`Beklenmeyen ${this.describe(token)}.`);
            case "eof":
                return this.fail("İfade bekleniyordu ama dosya bitti.");
        }
    }
}

export function parseScript(source: string, options: ParserOptions): ProgramUnit {
    return new Parser(source, options).parseProgram();
}
