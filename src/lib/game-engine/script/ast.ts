/** AST for the C#/C++ subset executed by the Hanogt script VM. */

export interface Pos {
    line: number;
    col: number;
}

export interface TypeRef extends Pos {
    /** Normalised simple name, e.g. "int", "float", "List", "Vector3", "Player". */
    name: string;
    args: TypeRef[];
    isArray: boolean;
    /** Original spelling for error messages. */
    raw: string;
}

export interface Attribute {
    name: string;
    args: Expr[];
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export type StaticType = string | null;

interface ExprBase extends Pos {
    /** Static type computed by the analyser ("int", "float", "string", "Vector3", ...). */
    st?: StaticType;
}

export interface LiteralExpr extends ExprBase {
    type: "Literal";
    value: number | string | boolean | null;
    numKind?: "int" | "float";
    isChar?: boolean;
}

export interface InterpolatedExpr extends ExprBase {
    type: "Interpolated";
    parts: Array<{ text: string } | { expr: Expr; format?: string }>;
}

export type IdentResolution =
    | { kind: "local" }
    | { kind: "field"; className: string }
    | { kind: "static"; className: string }
    | { kind: "method"; className: string }
    | { kind: "class"; name: string }
    | { kind: "enum"; name: string }
    | { kind: "global"; name: string }
    | { kind: "behaviour"; name: string }
    | { kind: "function"; name: string };

export interface IdentExpr extends ExprBase {
    type: "Ident";
    name: string;
    res?: IdentResolution;
}

export interface ThisExpr extends ExprBase { type: "This" }
export interface BaseExpr extends ExprBase { type: "Base" }

export interface MemberExpr extends ExprBase {
    type: "Member";
    object: Expr;
    name: string;
    nullSafe: boolean;
    /** "::" access (C++ static/namespace). */
    scoped: boolean;
}

export interface IndexExpr extends ExprBase {
    type: "Index";
    object: Expr;
    index: Expr;
    nullSafe: boolean;
}

export interface Argument {
    expr: Expr;
    modifier: "ref" | "out" | "in" | null;
    /** `out var x` / `out RaycastHit hit` declares a local. */
    declare?: { name: string; typeRef: TypeRef | null };
}

export interface CallExpr extends ExprBase {
    type: "Call";
    callee: Expr;
    args: Argument[];
    typeArgs: TypeRef[];
}

export interface NewExpr extends ExprBase {
    type: "New";
    /** null for C# target-typed `new()`. */
    typeRef: TypeRef | null;
    args: Argument[];
    /** Collection initialiser `new List<int> { 1, 2 }`. */
    items: Expr[] | null;
    /** Object initialiser `new Foo { A = 1 }`. */
    props: Array<{ name: string; value: Expr }> | null;
}

export interface NewArrayExpr extends ExprBase {
    type: "NewArray";
    elementType: TypeRef | null;
    size: Expr | null;
    items: Expr[] | null;
}

export interface InitListExpr extends ExprBase {
    type: "InitList";
    items: Expr[];
}

export interface UnaryExpr extends ExprBase {
    type: "Unary";
    op: "-" | "+" | "!" | "~" | "*" | "&";
    arg: Expr;
}

export interface UpdateExpr extends ExprBase {
    type: "Update";
    op: "++" | "--";
    prefix: boolean;
    arg: Expr;
}

export interface BinaryExpr extends ExprBase {
    type: "Binary";
    op: string;
    left: Expr;
    right: Expr;
    /** Integer arithmetic (truncating division/modulo) decided by the analyser. */
    intOp?: boolean;
}

export interface LogicalExpr extends ExprBase {
    type: "Logical";
    op: "&&" | "||" | "??";
    left: Expr;
    right: Expr;
}

export interface AssignExpr extends ExprBase {
    type: "Assign";
    op: string;
    target: Expr;
    value: Expr;
    /** Target static type is integral: truncate the stored value. */
    intTarget?: boolean;
    intOp?: boolean;
}

export interface ConditionalExpr extends ExprBase {
    type: "Conditional";
    test: Expr;
    consequent: Expr;
    alternate: Expr;
}

export interface CastExpr extends ExprBase {
    type: "Cast";
    typeRef: TypeRef;
    arg: Expr;
}

export interface IsExpr extends ExprBase {
    type: "Is";
    arg: Expr;
    typeRef: TypeRef | null;
    /** `x is null` / `x is not null` */
    nullCheck?: boolean;
    negate?: boolean;
    declName?: string;
}

export interface AsExpr extends ExprBase {
    type: "As";
    arg: Expr;
    typeRef: TypeRef;
}

export interface LambdaExpr extends ExprBase {
    type: "Lambda";
    params: string[];
    body: Expr | BlockStmt;
}

export interface TypeOfExpr extends ExprBase {
    type: "TypeOf";
    typeRef: TypeRef;
}

export interface DefaultExpr extends ExprBase {
    type: "Default";
    typeRef: TypeRef | null;
}

export type Expr =
    | LiteralExpr
    | InterpolatedExpr
    | IdentExpr
    | ThisExpr
    | BaseExpr
    | MemberExpr
    | IndexExpr
    | CallExpr
    | NewExpr
    | NewArrayExpr
    | InitListExpr
    | UnaryExpr
    | UpdateExpr
    | BinaryExpr
    | LogicalExpr
    | AssignExpr
    | ConditionalExpr
    | CastExpr
    | IsExpr
    | AsExpr
    | LambdaExpr
    | TypeOfExpr
    | DefaultExpr;

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

interface StmtBase extends Pos {
    /** True when the statement (or a nested one) contains `yield`. */
    hasYield?: boolean;
}

export interface VarDeclarator {
    name: string;
    typeRef: TypeRef;
    init: Expr | null;
    /** C++ `int a[5]` fixed arrays. */
    arraySize?: Expr | null;
    line: number;
    col: number;
}

export interface BlockStmt extends StmtBase { type: "Block"; body: Stmt[] }
export interface VarDeclStmt extends StmtBase { type: "VarDecl"; declarations: VarDeclarator[]; isConst: boolean }
export interface ExprStmt extends StmtBase { type: "ExprStmt"; expr: Expr }
export interface IfStmt extends StmtBase { type: "If"; test: Expr; consequent: Stmt; alternate: Stmt | null }
export interface WhileStmt extends StmtBase { type: "While"; test: Expr; body: Stmt }
export interface DoWhileStmt extends StmtBase { type: "DoWhile"; body: Stmt; test: Expr }
export interface ForStmt extends StmtBase { type: "For"; init: Stmt | null; test: Expr | null; update: Expr[]; body: Stmt }
export interface ForEachStmt extends StmtBase { type: "ForEach"; name: string; typeRef: TypeRef | null; iterable: Expr; body: Stmt; /** C++ structured binding names */ bindings?: string[] }
export interface SwitchCase { tests: Expr[]; isDefault: boolean; body: Stmt[] }
export interface SwitchStmt extends StmtBase { type: "Switch"; discriminant: Expr; cases: SwitchCase[] }
export interface ReturnStmt extends StmtBase { type: "Return"; arg: Expr | null }
export interface BreakStmt extends StmtBase { type: "Break" }
export interface ContinueStmt extends StmtBase { type: "Continue" }
export interface ThrowStmt extends StmtBase { type: "Throw"; arg: Expr | null }
export interface TryStmt extends StmtBase { type: "Try"; block: BlockStmt; param: string | null; handler: BlockStmt | null; finalizer: BlockStmt | null }
export interface YieldStmt extends StmtBase { type: "Yield"; arg: Expr | null; isBreak: boolean }
export interface EmptyStmt extends StmtBase { type: "Empty" }

export type Stmt =
    | BlockStmt
    | VarDeclStmt
    | ExprStmt
    | IfStmt
    | WhileStmt
    | DoWhileStmt
    | ForStmt
    | ForEachStmt
    | SwitchStmt
    | ReturnStmt
    | BreakStmt
    | ContinueStmt
    | ThrowStmt
    | TryStmt
    | YieldStmt
    | EmptyStmt;

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

export interface ParamDecl {
    name: string;
    typeRef: TypeRef;
    defaultValue: Expr | null;
    modifier: "ref" | "out" | "in" | "params" | null;
}

export interface MethodDecl extends Pos {
    name: string;
    returnType: TypeRef;
    params: ParamDecl[];
    body: BlockStmt | null;
    isStatic: boolean;
    isPublic: boolean;
    isConstructor: boolean;
    /** C++ constructor member initialiser list. */
    memberInits: Array<{ name: string; args: Expr[] }>;
    /** Set when the body contains `yield` (C# iterator / coroutine). */
    isIterator: boolean;
    /** Owning class for C++ out-of-class definitions. */
    ownerName?: string;
}

export interface FieldDecl extends Pos {
    name: string;
    typeRef: TypeRef;
    init: Expr | null;
    isPublic: boolean;
    isStatic: boolean;
    isConst: boolean;
    attributes: Attribute[];
    /** C++ fixed-size array member `int arr[5]`. */
    arraySize?: Expr | null;
}

export interface PropertyDecl extends Pos {
    name: string;
    typeRef: TypeRef;
    getter: BlockStmt | null;
    setter: BlockStmt | null;
    isStatic: boolean;
    isPublic: boolean;
}

export interface EnumDecl extends Pos {
    name: string;
    members: Array<{ name: string; value: Expr | null }>;
}

export interface ClassDecl extends Pos {
    name: string;
    baseNames: string[];
    fields: FieldDecl[];
    methods: MethodDecl[];
    properties: PropertyDecl[];
    isStruct: boolean;
    scriptId: string;
    scriptName: string;
}

export interface ProgramUnit {
    scriptId: string;
    scriptName: string;
    dialect: "csharp" | "cpp";
    classes: ClassDecl[];
    enums: EnumDecl[];
    /** C++ free functions and out-of-class method definitions. */
    functions: MethodDecl[];
    /** C++ globals / namespace-scope constants. */
    globals: VarDeclStmt[];
}
