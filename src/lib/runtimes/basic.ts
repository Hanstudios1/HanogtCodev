/**
 * Hanogt BASIC: a dependency-free interpreter for a QBasic-flavoured BASIC
 * that also runs classic line-numbered (GW-BASIC style) programs. It runs in
 * the runtime worker and in plain Node for tests.
 *
 * Statements: PRINT (; , TAB SPC), INPUT, LINE INPUT, LET and assignment,
 * IF … THEN … ELSE on one line or as blocks (ELSEIF, END IF), FOR … NEXT
 * (STEP), WHILE … WEND, DO … LOOP (WHILE/UNTIL), EXIT FOR/DO/SUB/FUNCTION,
 * SELECT CASE (IS, TO, lists), GOTO, GOSUB/RETURN, ON … GOTO/GOSUB, labels,
 * DIM/REDIM (several dimensions, x TO y bounds, AS types, SHARED), CONST,
 * DATA/READ/RESTORE, SWAP, RANDOMIZE, SUB/FUNCTION/CALL with by-reference
 * parameters, DEF FN, DEFINT/DEFSTR…, WRITE, END/STOP and REM/' comments.
 * Screen statements (CLS, COLOR, LOCATE, SCREEN, BEEP, SLEEP…) are accepted
 * and ignored. Functions: ABS ASC ATN CDBL CHR$ CINT CLNG COS CSNG EXP FIX
 * HEX$ INSTR INT LCASE$ LEFT$ LEN LOG LTRIM$ MID$ OCT$ RIGHT$ RND RTRIM$ SGN
 * SIN SPACE$ SQR STR$ STRING$ TAN TIMER TRIM$ UCASE$ VAL DATE$ TIME$ INKEY$.
 *
 * Numbers are doubles printed with up to 7 significant digits like QBasic's
 * single precision (whole numbers print exactly); positive numbers get a
 * leading space. INPUT reads the Input tab and echoes what it read, so the
 * output looks like a terminal session. Errors use QBasic's names and carry
 * the source line and column (plus the BASIC line number when there is one).
 */

export interface BasicOptions {
    stdin?: string;
    onOutput?: (text: string) => void;
    maxSteps?: number;
    shouldStop?: () => boolean;
    locale?: "tr" | "en";
    /** Seed of the random number generator (RND) unless the program calls RANDOMIZE TIMER. */
    seed?: number;
}

export interface BasicResult {
    output: string;
    exitCode: number;
    error?: { message: string; line?: number; column?: number };
}

type Locale = "tr" | "en";
type Value = number | string;
type Position = { line: number; column: number; basicLine?: number };

// ------------------------------------------------------------------ messages
const MESSAGES = {
    syntax: { tr: "Sözdizimi hatası", en: "Syntax error" },
    expected: { tr: "Sözdizimi hatası: {what} bekleniyordu", en: "Syntax error: expected {what}" },
    unexpected: { tr: "Sözdizimi hatası: beklenmeyen {what}", en: "Syntax error: unexpected {what}" },
    typeMismatch: { tr: "Tür uyuşmazlığı", en: "Type mismatch" },
    divisionByZero: { tr: "Sıfıra bölme", en: "Division by zero" },
    overflow: { tr: "Taşma", en: "Overflow" },
    subscript: { tr: "Dizin aralık dışında: {name}({index})", en: "Subscript out of range: {name}({index})" },
    undefinedLabel: { tr: "Tanımsız satır numarası veya etiket: {name}", en: "Label not defined: {name}" },
    duplicateLabel: { tr: "Yinelenen etiket veya satır numarası: {name}", en: "Duplicate label: {name}" },
    nextWithoutFor: { tr: "FOR olmadan NEXT", en: "NEXT without FOR" },
    forWithoutNext: { tr: "NEXT olmadan FOR", en: "FOR without NEXT" },
    wendWithoutWhile: { tr: "WHILE olmadan WEND", en: "WEND without WHILE" },
    whileWithoutWend: { tr: "WEND olmadan WHILE", en: "WHILE without WEND" },
    loopWithoutDo: { tr: "DO olmadan LOOP", en: "LOOP without DO" },
    doWithoutLoop: { tr: "LOOP olmadan DO", en: "DO without LOOP" },
    blockIfWithoutEnd: { tr: "END IF olmadan blok IF", en: "Block IF without END IF" },
    elseWithoutIf: { tr: "IF olmadan ELSE", en: "ELSE without IF" },
    endIfWithoutIf: { tr: "Blok IF olmadan END IF", en: "END IF without block IF" },
    selectWithoutEnd: { tr: "END SELECT olmadan SELECT CASE", en: "SELECT CASE without END SELECT" },
    caseWithoutSelect: { tr: "SELECT CASE olmadan CASE", en: "CASE without SELECT CASE" },
    subWithoutEnd: { tr: "END {kind} eksik", en: "Missing END {kind}" },
    nestedSub: { tr: "SUB ve FUNCTION tanımları iç içe olamaz", en: "SUB and FUNCTION definitions cannot be nested" },
    exitOutside: { tr: "EXIT {kind} uygun bir bloğun dışında", en: "EXIT {kind} outside of a matching block" },
    returnWithoutGosub: { tr: "GOSUB olmadan RETURN", en: "RETURN without GOSUB" },
    outOfData: { tr: "DATA bitti (READ için okunacak değer kalmadı)", en: "Out of DATA" },
    inputPastEnd: { tr: "Girdi bitti: INPUT için Girdi sekmesine bir satır daha ekleyin", en: "Input past end: add another line to the Input tab for INPUT" },
    inputNumber: { tr: "INPUT bir sayı bekliyordu, \"{text}\" okundu", en: "INPUT expected a number but read \"{text}\"" },
    illegalCall: { tr: "Geçersiz işlev çağrısı: {name}", en: "Illegal function call: {name}" },
    argumentCount: { tr: "Bağımsız değişken sayısı yanlış: {name}", en: "Wrong number of arguments: {name}" },
    undefinedFunction: { tr: "Tanımsız işlev veya SUB: {name}", en: "Undefined function or SUB: {name}" },
    duplicateDefinition: { tr: "Yinelenen tanım: {name}", en: "Duplicate definition: {name}" },
    constAssign: { tr: "Sabite değer atanamaz: {name}", en: "Cannot assign to the constant {name}" },
    unsupported: { tr: "{name} desteklenmiyor", en: "{name} is not supported" },
    stackOverflow: { tr: "Yığın taştı (çok derin özyineleme veya GOSUB)", en: "Out of stack space (recursion or GOSUB too deep)" },
    stepLimit: { tr: "Adım sınırı aşıldı ({count} komut)", en: "Step limit exceeded ({count} statements)" },
    timeLimit: { tr: "Süre sınırı aşıldı; programda sonsuz döngü olabilir", en: "Time limit exceeded; the program may contain an infinite loop" },
    stringTooLong: { tr: "Metin çok uzun", en: "String too long" },
    basicLine: { tr: "satır {number}", en: "line {number}" },
};

/** Phrases used in "expected …" messages. */
const WHAT: Record<string, { tr: string; en: string }> = {
    expression: { tr: "bir ifade", en: "an expression" },
    name: { tr: "bir ad", en: "a name" },
    target: { tr: "satır numarası veya etiket", en: "a line number or label" },
    fnName: { tr: "FN ile başlayan bir ad", en: "a name starting with FN" },
    gotoGosub: { tr: "GOTO veya GOSUB", en: "GOTO or GOSUB" },
    separator: { tr: "';' veya ','", en: "';' or ','" },
};
type MessageKey = keyof typeof MESSAGES;

class BasicError extends Error {
    readonly key: MessageKey;
    readonly vars: Record<string, string | number>;
    position?: Position;
    constructor(key: MessageKey, vars: Record<string, string | number> = {}, position?: Position) {
        super(key);
        this.key = key;
        this.vars = vars;
        this.position = position;
    }
}
class BasicEnd extends Error {}

// ------------------------------------------------------------------ lexer
type TokenType = "num" | "str" | "id" | "op" | "eol";
type Token = { type: TokenType; text: string; value?: number; line: number; column: number };

const KEYWORDS = new Set([
    "PRINT", "LPRINT", "INPUT", "LINE", "LET", "IF", "THEN", "ELSE", "ELSEIF", "END", "ENDIF", "FOR", "TO", "STEP", "NEXT", "WHILE", "WEND",
    "DO", "LOOP", "UNTIL", "EXIT", "GOTO", "GOSUB", "RETURN", "ON", "DIM", "REDIM", "AS", "SHARED", "CONST", "DATA", "READ", "RESTORE",
    "SWAP", "RANDOMIZE", "SUB", "FUNCTION", "CALL", "DECLARE", "DEF", "SELECT", "CASE", "IS", "STOP", "SYSTEM", "REM", "AND", "OR", "NOT",
    "XOR", "EQV", "IMP", "MOD", "WRITE", "CLS", "COLOR", "LOCATE", "SCREEN", "WIDTH", "BEEP", "SOUND", "PLAY", "SLEEP", "KEY", "OPTION",
    "BASE", "ERASE", "DEFINT", "DEFLNG", "DEFSNG", "DEFDBL", "DEFSTR", "COMMON", "STATIC", "USING", "TAB", "SPC", "VIEW", "PSET", "OFF",
]);

/** Splits one physical line into tokens (the comment after REM or ' is dropped). */
function tokenizeLine(text: string, line: number): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    const length = text.length;
    while (index < length) {
        const char = text[index];
        if (char === " " || char === "\t" || char === "\r") {
            index += 1;
            continue;
        }
        const column = index + 1;
        if (char === "'") break;
        if (char === "\"") {
            const end = text.indexOf("\"", index + 1);
            const value = end < 0 ? text.slice(index + 1) : text.slice(index + 1, end);
            tokens.push({ type: "str", text: value, line, column });
            index = end < 0 ? length : end + 1;
            continue;
        }
        const number = /^(?:\d+\.?\d*|\.\d+)(?:[eEdD][-+]?\d+)?[#!%&]?/.exec(text.slice(index));
        if (number) {
            const raw = number[0].replace(/[#!%&]$/, "").replace(/[dD]/, "e");
            tokens.push({ type: "num", text: number[0], value: Number(raw), line, column });
            index += number[0].length;
            continue;
        }
        const radix = /^&([HhOoBb])([0-9A-Fa-f]+)[%&]?/.exec(text.slice(index));
        if (radix) {
            const base = { h: 16, o: 8, b: 2 }[radix[1].toLowerCase() as "h" | "o" | "b"];
            tokens.push({ type: "num", text: radix[0], value: Number.parseInt(radix[2], base), line, column });
            index += radix[0].length;
            continue;
        }
        const word = /^[A-Za-z_][A-Za-z0-9_.]*[$%!#&]?/.exec(text.slice(index));
        if (word) {
            const upper = word[0].toUpperCase();
            if (upper === "REM") break;
            tokens.push({ type: "id", text: upper, line, column });
            index += word[0].length;
            continue;
        }
        const two = text.slice(index, index + 2);
        if (["<=", ">=", "<>", "=<", "=>", "><"].includes(two)) {
            tokens.push({ type: "op", text: two === "=<" ? "<=" : two === "=>" ? ">=" : two === "><" ? "<>" : two, line, column });
            index += 2;
            continue;
        }
        if ("+-*/\\^=<>(),;:?#".includes(char)) {
            tokens.push({ type: "op", text: char === "?" ? "PRINT" : char, line, column });
            if (char === "?") tokens[tokens.length - 1].type = "id";
            index += 1;
            continue;
        }
        throw new BasicError("unexpected", { what: `'${char}'` }, { line, column });
    }
    tokens.push({ type: "eol", text: "", line, column: length + 1 });
    return tokens;
}

// ------------------------------------------------------------------ AST
type Expr =
    | { k: "num"; v: number }
    | { k: "str"; v: string }
    | { k: "var"; name: string; at: Position }
    | { k: "index"; name: string; args: Expr[]; at: Position }
    | { k: "unary"; op: string; e: Expr; at: Position }
    | { k: "bin"; op: string; l: Expr; r: Expr; at: Position };

type LValue = { name: string; args: Expr[] | null; at: Position };
type PrintItem = { kind: "expr"; e: Expr } | { kind: "sep"; sep: ";" | "," } | { kind: "tab"; e: Expr } | { kind: "spc"; e: Expr };
type CaseTest = { kind: "eq"; e: Expr } | { kind: "range"; low: Expr; high: Expr } | { kind: "is"; op: string; e: Expr };
type Target = { name: string; at: Position };

type Stmt = { at: Position } & (
    | { kind: "print"; items: PrintItem[]; quoted?: boolean }
    | { kind: "input"; prompt: string | null; question: boolean; targets: LValue[]; whole: boolean }
    | { kind: "let"; target: LValue; e: Expr }
    | { kind: "goto"; target: Target; index?: number }
    | { kind: "gosub"; target: Target; index?: number }
    | { kind: "return" }
    | { kind: "jump"; index: number }
    | { kind: "jumpif"; cond: Expr; index: number; negate: boolean }
    | { kind: "for"; variable: LValue; start: Expr; end: Expr; step: Expr | null; exit: number }
    | { kind: "next"; names: string[]; forIndex: number | null }
    | { kind: "exitfor"; forIndex: number; index: number }
    | { kind: "on"; e: Expr; targets: Target[]; indexes?: number[]; gosub: boolean }
    | { kind: "end" }
    | { kind: "dim"; arrays: Array<{ name: string; bounds: Array<[Expr | null, Expr]>; type: string | null; at: Position }>; shared: boolean; redim: boolean; scalars: Array<{ name: string; type: string | null }> }
    | { kind: "erase"; names: string[] }
    | { kind: "const"; name: string; e: Expr }
    | { kind: "read"; targets: LValue[] }
    | { kind: "restore"; target: Target | null; index?: number }
    | { kind: "swap"; a: LValue; b: LValue }
    | { kind: "randomize"; e: Expr | null; timer: boolean }
    | { kind: "call"; name: string; args: Expr[] }
    | { kind: "subreturn" }
    | { kind: "settemp"; slot: number; e: Expr }
    | { kind: "casetest"; slot: number; tests: CaseTest[]; index: number }
    | { kind: "shared"; names: string[] }
    | { kind: "noop" }
);

type Procedure = { name: string; kind: "SUB" | "FUNCTION"; params: Array<{ name: string; array: boolean }>; start: number; end: number; at: Position; shared: Set<string> };
type DefFn = { name: string; params: string[]; e: Expr };

type Block =
    | { type: "if"; pending: number | null; ends: number[]; at: Position }
    | { type: "for"; index: number; name: string; at: Position; exits: number[] }
    | { type: "while"; index: number; at: Position }
    | { type: "do"; start: number; test: number | null; exits: number[]; at: Position }
    | { type: "select"; slot: number; pending: number | null; ends: number[]; at: Position; sawElse: boolean }
    | { type: "proc"; proc: Procedure; exits: number[] };

const FUNCTIONS: Record<string, [number, number]> = {
    ABS: [1, 1], ASC: [1, 1], ATN: [1, 1], CDBL: [1, 1], "CHR$": [1, 1], CINT: [1, 1], CLNG: [1, 1], COS: [1, 1], CSNG: [1, 1], EXP: [1, 1], FIX: [1, 1],
    "HEX$": [1, 1], INSTR: [2, 3], INT: [1, 1], "LCASE$": [1, 1], "LEFT$": [2, 2], LEN: [1, 1], LOG: [1, 1], "LTRIM$": [1, 1], "MID$": [2, 3],
    "OCT$": [1, 1], "RIGHT$": [2, 2], RND: [0, 1], "RTRIM$": [1, 1], SGN: [1, 1], SIN: [1, 1], "SPACE$": [1, 1], SQR: [1, 1], "STR$": [1, 1],
    "STRING$": [2, 2], TAN: [1, 1], TIMER: [0, 0], "TRIM$": [1, 1], "UCASE$": [1, 1], VAL: [1, 1], "DATE$": [0, 0], "TIME$": [0, 0], "INKEY$": [0, 0],
};

const IGNORED_STATEMENTS = new Set(["CLS", "COLOR", "LOCATE", "SCREEN", "WIDTH", "BEEP", "SOUND", "PLAY", "SLEEP", "KEY", "VIEW", "PSET", "DECLARE"]);

// ------------------------------------------------------------------ parser
/** SUB/FUNCTION names ignore numeric type suffixes: Fact# and Fact are the same procedure. */
function procedureKey(name: string) {
    return name.replace(/[#!%&]$/, "");
}

class Parser {
    private tokens: Token[] = [];
    private index = 0;
    readonly program: Stmt[] = [];
    readonly labels = new Map<string, number>();
    readonly blocks: Block[] = [];
    readonly procedures = new Map<string, Procedure>();
    readonly defFns = new Map<string, DefFn>();
    readonly data: Array<{ value: string; quoted: boolean; index: number }> = [];
    tempSlots = 0;
    private basicLine: number | undefined;
    private currentProc: Procedure | null = null;
    private lineText = "";

    parse(source: string) {
        const lines = source.replace(/\r\n?/g, "\n").split("\n");
        lines.forEach((text, lineIndex) => this.parseLine(text, lineIndex + 1));
        const open = this.blocks[this.blocks.length - 1];
        if (open) {
            const at = open.type === "proc" ? open.proc.at : open.at;
            const key: MessageKey = open.type === "if" ? "blockIfWithoutEnd" : open.type === "for" ? "forWithoutNext" : open.type === "while" ? "whileWithoutWend" : open.type === "do" ? "doWithoutLoop" : open.type === "select" ? "selectWithoutEnd" : "subWithoutEnd";
            throw new BasicError(key, { kind: open.type === "proc" ? open.proc.kind : "" }, at);
        }
        this.resolveTargets();
    }

    private emit(stmt: Stmt) {
        this.program.push(stmt);
        return this.program.length - 1;
    }

    private get peek() {
        return this.tokens[this.index];
    }

    private next() {
        return this.tokens[this.index++];
    }

    private position(token: Token = this.peek): Position {
        return { line: token.line, column: token.column, basicLine: this.basicLine };
    }

    private isOp(text: string, token = this.peek) {
        return token.type === "op" && token.text === text;
    }

    private isWord(text: string, token = this.peek) {
        return token.type === "id" && token.text === text;
    }

    private accept(text: string) {
        if (this.isOp(text) || this.isWord(text)) {
            this.index += 1;
            return true;
        }
        return false;
    }

    private expect(text: string, what = text) {
        if (!this.accept(text)) throw this.unexpectedHere(what);
    }

    private unexpectedHere(what: string) {
        const token = this.peek;
        if (token.type === "eol") return new BasicError("expected", { what }, this.position(token));
        return new BasicError("expected", { what, found: token.type === "str" ? `"${token.text}"` : token.text }, this.position(token));
    }

    private atEnd() {
        return this.isEol() || this.isOp(":") || this.isWord("ELSE");
    }

    /** True at the end of the line (a method, so TypeScript does not keep a stale narrowing). */
    private isEol() {
        return this.peek.type === "eol";
    }

    private parseLine(text: string, line: number) {
        let body = text;
        let offset = 0;
        const number = /^\s*(\d+)\s?/.exec(body);
        this.basicLine = undefined;
        if (number) {
            this.basicLine = Number(number[1]);
            this.defineLabel(number[1], { line, column: body.indexOf(number[1]) + 1 });
            offset = number[0].length;
            body = body.slice(offset);
        }
        this.lineText = " ".repeat(offset) + body;
        this.tokens = tokenizeLine(this.lineText, line);
        this.index = 0;
        // QBasic labels: "name:" at the start of a line.
        const first = this.tokens[0];
        if (first.type === "id" && !KEYWORDS.has(first.text) && !FUNCTIONS[first.text] && this.isOp(":", this.tokens[1])) {
            this.defineLabel(first.text, this.position(first));
            this.index = 2;
        }
        this.parseStatements(false);
        if (this.peek.type !== "eol") throw new BasicError("unexpected", { what: this.peek.text || this.peek.type }, this.position());
    }

    private defineLabel(name: string, at: Position) {
        if (this.labels.has(name)) throw new BasicError("duplicateLabel", { name }, at);
        this.labels.set(name, this.program.length);
    }

    /** Statements separated by ':' until the end of the line (or ELSE when `inIf`). */
    private parseStatements(inIf: boolean) {
        for (;;) {
            while (this.accept(":")) { /* empty statement */ }
            if (this.isEol()) return;
            if (inIf && this.isWord("ELSE")) return;
            this.parseStatement();
            if (this.isEol()) return;
            if (inIf && this.isWord("ELSE")) return;
            if (!this.isOp(":")) throw new BasicError("unexpected", { what: this.peek.text || this.peek.type }, this.position());
        }
    }

    private parseStatement() {
        const token = this.peek;
        const at = this.position(token);
        if (token.type === "num" && this.index === 0) {
            // A bare line number continues the previous line in some listings; treat it as GOTO-less noise.
            throw new BasicError("syntax", {}, at);
        }
        if (token.type !== "id") throw new BasicError("syntax", {}, at);
        const word = token.text;
        switch (word) {
            case "PRINT": case "LPRINT": this.next(); return this.parsePrint(at, false);
            case "WRITE": this.next(); return this.parsePrint(at, true);
            case "INPUT": this.next(); return this.parseInput(at, false);
            case "LINE":
                this.next();
                if (!this.accept("INPUT")) throw new BasicError("unsupported", { name: "LINE" }, at);
                return this.parseInput(at, true);
            case "LET": this.next(); return this.parseAssignment(at);
            case "IF": this.next(); return this.parseIf(at);
            case "ELSEIF": case "ELSE": this.next(); return this.parseElse(word, at);
            case "ENDIF": this.next(); return this.endIf(at);
            case "END": this.next(); return this.parseEnd(at);
            case "FOR": this.next(); return this.parseFor(at);
            case "NEXT": this.next(); return this.parseNext(at);
            case "WHILE": this.next(); return this.parseWhile(at);
            case "WEND": this.next(); return this.parseWend(at);
            case "DO": this.next(); return this.parseDo(at);
            case "LOOP": this.next(); return this.parseLoop(at);
            case "EXIT": this.next(); return this.parseExit(at);
            case "GOTO": this.next(); this.emit({ kind: "goto", target: this.parseTarget(), at }); return;
            case "GOSUB": this.next(); this.emit({ kind: "gosub", target: this.parseTarget(), at }); return;
            case "RETURN": this.next(); this.emit({ kind: "return", at }); return;
            case "ON": this.next(); return this.parseOn(at);
            case "DIM": this.next(); return this.parseDim(at, false);
            case "REDIM": this.next(); return this.parseDim(at, true);
            case "ERASE": {
                this.next();
                const names: string[] = [];
                do names.push(this.parseName()); while (this.accept(","));
                this.emit({ kind: "erase", names, at });
                return;
            }
            case "CONST": this.next(); return this.parseConst(at);
            case "DATA": this.next(); return this.parseData(at);
            case "READ": {
                this.next();
                const targets: LValue[] = [];
                do targets.push(this.parseLValue()); while (this.accept(","));
                this.emit({ kind: "read", targets, at });
                return;
            }
            case "RESTORE": this.next(); this.emit({ kind: "restore", target: this.atEnd() ? null : this.parseTarget(), at }); return;
            case "SWAP": {
                this.next();
                const a = this.parseLValue();
                this.expect(",");
                this.emit({ kind: "swap", a, b: this.parseLValue(), at });
                return;
            }
            case "RANDOMIZE": {
                this.next();
                if (this.atEnd()) this.emit({ kind: "randomize", e: null, timer: true, at });
                else if (this.isWord("TIMER")) {
                    this.next();
                    this.emit({ kind: "randomize", e: null, timer: true, at });
                } else this.emit({ kind: "randomize", e: this.parseExpr(), timer: false, at });
                return;
            }
            case "SUB": case "FUNCTION": this.next(); return this.parseProcedure(word, at);
            case "CALL": {
                this.next();
                const name = this.parseName();
                const args: Expr[] = [];
                if (this.accept("(")) {
                    if (!this.isOp(")")) do args.push(this.parseExpr()); while (this.accept(","));
                    this.expect(")");
                }
                this.emit({ kind: "call", name, args, at });
                return;
            }
            case "DEF": this.next(); return this.parseDefFn(at);
            case "SELECT": this.next(); return this.parseSelect(at);
            case "CASE": this.next(); return this.parseCase(at);
            case "STOP": case "SYSTEM": this.next(); this.emit({ kind: "end", at }); return;
            case "SHARED": case "COMMON": case "STATIC": {
                this.next();
                if (word === "COMMON") this.accept("SHARED");
                const names: string[] = [];
                do {
                    names.push(this.parseName());
                    if (this.accept("(")) this.expect(")");
                    if (this.accept("AS")) this.next();
                } while (this.accept(","));
                if (word !== "STATIC") this.emit({ kind: "shared", names, at });
                if (this.currentProc && word === "SHARED") for (const name of names) this.currentProc.shared.add(name);
                return;
            }
            case "OPTION": {
                this.next();
                this.expect("BASE");
                const value = this.next();
                if (value.type !== "num" || (value.value !== 0 && value.value !== 1)) throw new BasicError("syntax", {}, at);
                this.optionBase = value.value!;
                return;
            }
            case "DEFINT": case "DEFLNG": case "DEFSNG": case "DEFDBL": case "DEFSTR": {
                this.next();
                do {
                    const from = this.next();
                    let to = from;
                    if (this.accept("-")) to = this.next();
                    if (from.type !== "id" || to.type !== "id") throw new BasicError("syntax", {}, at);
                    for (let code = from.text.charCodeAt(0); code <= to.text.charCodeAt(0); code += 1) this.defaultTypes.set(String.fromCharCode(code), word);
                } while (this.accept(","));
                return;
            }
            default:
                if (IGNORED_STATEMENTS.has(word)) {
                    this.next();
                    while (!this.atEnd()) this.next();
                    this.emit({ kind: "noop", at });
                    return;
                }
                if (KEYWORDS.has(word) && word !== "TAB" && word !== "SPC") throw new BasicError("unexpected", { what: word }, at);
                // Assignment, or a SUB called without CALL: "PrintLine 3, x".
                if (this.isOp("=", this.tokens[this.index + 1]) || this.isOp("(", this.tokens[this.index + 1])) {
                    const save = this.index;
                    try {
                        return this.parseAssignment(at);
                    } catch (error) {
                        if (!(error instanceof BasicError)) throw error;
                        this.index = save;
                    }
                }
                this.next();
                const args: Expr[] = [];
                if (!this.atEnd()) {
                    const parenthesized = this.isOp("(");
                    do args.push(this.parseExpr()); while (this.accept(","));
                    void parenthesized;
                }
                this.emit({ kind: "call", name: word, args, at });
        }
    }

    optionBase = 0;
    readonly defaultTypes = new Map<string, string>();

    private parseName(): string {
        const token = this.next();
        if (token.type !== "id" || (KEYWORDS.has(token.text) && token.text !== "TIMER")) throw new BasicError("expected", { what: "@name" }, this.position(token));
        return token.text;
    }

    private parseTarget(): Target {
        const token = this.next();
        if (token.type === "num" || (token.type === "id" && !KEYWORDS.has(token.text))) return { name: token.type === "num" ? String(token.value) : token.text, at: this.position(token) };
        throw new BasicError("expected", { what: "@target" }, this.position(token));
    }

    private parseLValue(): LValue {
        const token = this.peek;
        const at = this.position(token);
        const name = this.parseName();
        let args: Expr[] | null = null;
        if (this.accept("(")) {
            args = [];
            if (!this.isOp(")")) do args.push(this.parseExpr()); while (this.accept(","));
            this.expect(")");
        }
        return { name, args, at };
    }

    private parseAssignment(at: Position) {
        const target = this.parseLValue();
        this.expect("=");
        this.emit({ kind: "let", target, e: this.parseExpr(), at });
    }

    private parsePrint(at: Position, quoted: boolean) {
        const items: PrintItem[] = [];
        if (this.accept("#")) throw new BasicError("unsupported", { name: "PRINT #" }, at);
        if (this.isWord("USING")) throw new BasicError("unsupported", { name: "PRINT USING" }, at);
        while (!this.atEnd()) {
            if (this.accept(";")) items.push({ kind: "sep", sep: ";" });
            else if (this.accept(",")) items.push({ kind: "sep", sep: "," });
            else if ((this.isWord("TAB") || this.isWord("SPC")) && this.isOp("(", this.tokens[this.index + 1])) {
                const kind = this.next().text === "TAB" ? "tab" : "spc";
                this.expect("(");
                const e = this.parseExpr();
                this.expect(")");
                items.push({ kind, e });
            } else items.push({ kind: "expr", e: this.parseExpr() });
        }
        this.emit({ kind: "print", items, quoted, at });
    }

    private parseInput(at: Position, whole: boolean) {
        let prompt: string | null = null;
        let question = !whole;
        this.accept(";");
        if (this.peek.type === "str") {
            prompt = this.next().text;
            if (this.accept(",")) question = false;
            else {
                this.expect(";", "@separator");
                question = !whole;
            }
        }
        const targets: LValue[] = [];
        do targets.push(this.parseLValue()); while (!whole && this.accept(","));
        this.emit({ kind: "input", prompt, question, targets, whole, at });
    }

    private parseIf(at: Position) {
        const cond = this.parseExpr();
        if (this.accept("GOTO")) {
            this.emitIfGoto(cond, this.parseTarget(), at);
            return;
        }
        this.expect("THEN");
        if (this.peek.type === "eol") {
            // Block IF.
            const jump = this.emit({ kind: "jumpif", cond, index: -1, negate: true, at });
            this.blocks.push({ type: "if", pending: jump, ends: [], at });
            return;
        }
        const jump = this.emit({ kind: "jumpif", cond, index: -1, negate: true, at });
        if (this.peek.type === "num") this.emit({ kind: "goto", target: this.parseTarget(), at });
        else this.parseStatements(true);
        if (this.accept("ELSE")) {
            const skip = this.emit({ kind: "jump", index: -1, at });
            this.patch(jump, this.program.length);
            if (this.peek.type === "num") this.emit({ kind: "goto", target: this.parseTarget(), at });
            else this.parseStatements(false);
            this.patch(skip, this.program.length);
        } else {
            this.patch(jump, this.program.length);
        }
    }

    private emitIfGoto(cond: Expr, target: Target, at: Position) {
        const jump = this.emit({ kind: "jumpif", cond, index: -1, negate: true, at });
        this.emit({ kind: "goto", target, at });
        this.patch(jump, this.program.length);
    }

    private patch(index: number, target: number) {
        const stmt = this.program[index] as { index: number };
        stmt.index = target;
    }

    private topBlock<T extends Block["type"]>(type: T): Extract<Block, { type: T }> | undefined {
        const block = this.blocks[this.blocks.length - 1];
        return block && block.type === type ? block as Extract<Block, { type: T }> : undefined;
    }

    private parseElse(word: string, at: Position) {
        const block = this.topBlock("if");
        if (!block) throw new BasicError("elseWithoutIf", {}, at);
        if (block.pending === null) throw new BasicError("elseWithoutIf", {}, at);
        block.ends.push(this.emit({ kind: "jump", index: -1, at }));
        this.patch(block.pending, this.program.length);
        block.pending = null;
        if (word === "ELSEIF") {
            const cond = this.parseExpr();
            this.expect("THEN");
            block.pending = this.emit({ kind: "jumpif", cond, index: -1, negate: true, at });
        } else if (!this.atEnd() && !this.isOp(":")) {
            // "ELSE PRINT x" or "ELSE IF …" continue on the same line.
            this.parseStatement();
        }
    }

    private endIf(at: Position) {
        const block = this.topBlock("if");
        if (!block) throw new BasicError("endIfWithoutIf", {}, at);
        this.blocks.pop();
        if (block.pending !== null) this.patch(block.pending, this.program.length);
        for (const end of block.ends) this.patch(end, this.program.length);
    }

    private parseEnd(at: Position) {
        if (this.accept("IF")) return this.endIf(at);
        if (this.accept("SELECT")) {
            const block = this.topBlock("select");
            if (!block) throw new BasicError("caseWithoutSelect", {}, at);
            this.blocks.pop();
            if (block.pending !== null) this.patch(block.pending, this.program.length);
            for (const end of block.ends) this.patch(end, this.program.length);
            return;
        }
        if (this.isWord("SUB") || this.isWord("FUNCTION")) {
            const kind = this.next().text;
            const block = this.topBlock("proc");
            if (!block || block.proc.kind !== kind) throw new BasicError("syntax", {}, at);
            this.blocks.pop();
            const end = this.emit({ kind: "subreturn", at });
            for (const exit of block.exits) this.patch(exit, end);
            block.proc.end = this.program.length;
            this.patch(block.proc.start - 1, this.program.length);
            this.currentProc = null;
            return;
        }
        if (this.isWord("DEF")) throw new BasicError("unsupported", { name: "END DEF" }, at);
        this.emit({ kind: "end", at });
    }

    private parseFor(at: Position) {
        const variable = this.parseLValue();
        if (variable.args) throw new BasicError("syntax", {}, variable.at);
        this.expect("=");
        const start = this.parseExpr();
        this.expect("TO");
        const end = this.parseExpr();
        const step = this.accept("STEP") ? this.parseExpr() : null;
        const index = this.emit({ kind: "for", variable, start, end, step, exit: -1, at });
        this.blocks.push({ type: "for", index, name: variable.name, at, exits: [] });
    }

    private parseNext(at: Position) {
        const names: string[] = [];
        if (!this.atEnd()) do names.push(this.parseName()); while (this.accept(","));
        const closing = names.length ? names : [null];
        for (const name of closing) {
            const block = this.topBlock("for");
            if (block && (name === null || block.name === name)) {
                this.blocks.pop();
                const next = this.emit({ kind: "next", names: name === null ? [] : [name], forIndex: block.index, at });
                (this.program[block.index] as { exit: number }).exit = next + 1;
                for (const exit of block.exits) this.patch(exit, next + 1);
            } else {
                // Unstructured NEXT (classic BASIC): matched with its FOR at run time.
                this.emit({ kind: "next", names: name === null ? [] : [name], forIndex: null, at });
            }
        }
    }

    private parseWhile(at: Position) {
        const cond = this.parseExpr();
        const index = this.emit({ kind: "jumpif", cond, index: -1, negate: true, at });
        this.blocks.push({ type: "while", index, at });
    }

    private parseWend(at: Position) {
        const block = this.topBlock("while");
        if (!block) throw new BasicError("wendWithoutWhile", {}, at);
        this.blocks.pop();
        this.emit({ kind: "jump", index: block.index, at });
        this.patch(block.index, this.program.length);
    }

    private parseDo(at: Position) {
        const start = this.program.length;
        let test: number | null = null;
        if (this.isWord("WHILE") || this.isWord("UNTIL")) {
            const until = this.next().text === "UNTIL";
            test = this.emit({ kind: "jumpif", cond: this.parseExpr(), index: -1, negate: !until, at });
        }
        this.blocks.push({ type: "do", start, test, exits: [], at });
    }

    private parseLoop(at: Position) {
        const block = this.topBlock("do");
        if (!block) throw new BasicError("loopWithoutDo", {}, at);
        this.blocks.pop();
        if (this.isWord("WHILE") || this.isWord("UNTIL")) {
            const until = this.next().text === "UNTIL";
            this.emit({ kind: "jumpif", cond: this.parseExpr(), index: block.start, negate: until, at });
        } else {
            this.emit({ kind: "jump", index: block.start, at });
        }
        if (block.test !== null) this.patch(block.test, this.program.length);
        for (const exit of block.exits) this.patch(exit, this.program.length);
    }

    private parseExit(at: Position) {
        const kind = this.next();
        const name = kind.text;
        const find = <T extends Block["type"]>(type: T) => [...this.blocks].reverse().find((block) => block.type === type) as Extract<Block, { type: T }> | undefined;
        if (name === "FOR") {
            const block = find("for");
            if (!block) throw new BasicError("exitOutside", { kind: name }, at);
            block.exits.push(this.emit({ kind: "exitfor", forIndex: block.index, index: -1, at }));
            return;
        }
        if (name === "DO") {
            const block = find("do");
            if (!block) throw new BasicError("exitOutside", { kind: name }, at);
            block.exits.push(this.emit({ kind: "jump", index: -1, at }));
            return;
        }
        if (name === "SUB" || name === "FUNCTION") {
            const block = find("proc");
            if (!block || block.proc.kind !== name) throw new BasicError("exitOutside", { kind: name }, at);
            block.exits.push(this.emit({ kind: "jump", index: -1, at }));
            return;
        }
        throw new BasicError("syntax", {}, at);
    }

    private parseOn(at: Position) {
        const e = this.parseExpr();
        const gosub = this.accept("GOSUB");
        if (!gosub) this.expect("GOTO", "@gotoGosub");
        const targets: Target[] = [];
        do targets.push(this.parseTarget()); while (this.accept(","));
        this.emit({ kind: "on", e, targets, gosub, at });
    }

    private parseDim(at: Position, redim: boolean) {
        const shared = this.accept("SHARED");
        if (redim) this.accept("PRESERVE");
        const arrays: Array<{ name: string; bounds: Array<[Expr | null, Expr]>; type: string | null; at: Position }> = [];
        const scalars: Array<{ name: string; type: string | null }> = [];
        do {
            const nameToken = this.peek;
            const name = this.parseName();
            let bounds: Array<[Expr | null, Expr]> | null = null;
            if (this.accept("(")) {
                bounds = [];
                if (!this.isOp(")")) {
                    do {
                        const first = this.parseExpr();
                        if (this.accept("TO")) bounds.push([first, this.parseExpr()]);
                        else bounds.push([null, first]);
                    } while (this.accept(","));
                }
                this.expect(")");
            }
            let type: string | null = null;
            if (this.accept("AS")) {
                const typeToken = this.next();
                if (typeToken.type !== "id") throw new BasicError("syntax", {}, this.position(typeToken));
                type = typeToken.text;
                if (type === "STRING" && this.accept("*")) this.next();
            }
            if (bounds) arrays.push({ name, bounds, type, at: this.position(nameToken) });
            else scalars.push({ name, type });
        } while (this.accept(","));
        this.emit({ kind: "dim", arrays, scalars, shared, redim, at });
        if (shared) {
            // DIM SHARED makes names visible inside every SUB and FUNCTION.
            for (const item of [...arrays, ...scalars]) this.sharedNames.add(item.name);
        }
        for (const item of [...arrays, ...scalars]) if (item.type) this.declaredTypes.set(this.typeKey(item.name), item.type);
    }

    readonly sharedNames = new Set<string>();
    readonly declaredTypes = new Map<string, string>();

    typeKey(name: string) {
        return `${this.currentProc?.name ?? ""}\u0000${name}`;
    }

    private parseConst(at: Position) {
        do {
            const name = this.parseName();
            this.expect("=");
            this.emit({ kind: "const", name, e: this.parseExpr(), at });
        } while (this.accept(","));
    }

    private parseData(at: Position) {
        // DATA items come from the raw text: numbers, "quoted strings" or bare words, up to ':' or the end of the line.
        const keyword = this.tokens[this.index - 1];
        const text = this.lineText;
        let cursor = keyword.column - 1 + 4;
        for (;;) {
            while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t")) cursor += 1;
            if (cursor >= text.length || text[cursor] === ":" || text[cursor] === "'") break;
            let value = "";
            let quoted = false;
            if (text[cursor] === "\"") {
                const end = text.indexOf("\"", cursor + 1);
                value = end < 0 ? text.slice(cursor + 1) : text.slice(cursor + 1, end);
                cursor = end < 0 ? text.length : end + 1;
                quoted = true;
                while (cursor < text.length && text[cursor] !== "," && text[cursor] !== ":") cursor += 1;
            } else {
                const start = cursor;
                while (cursor < text.length && text[cursor] !== "," && text[cursor] !== ":") cursor += 1;
                value = text.slice(start, cursor).trim();
            }
            this.data.push({ value, quoted, index: this.program.length });
            if (text[cursor] !== ",") break;
            cursor += 1;
        }
        while (this.peek.type !== "eol" && this.peek.column <= cursor) this.index += 1;
        this.emit({ kind: "noop", at });
    }

    private parseProcedure(kind: string, at: Position) {
        if (this.currentProc) throw new BasicError("nestedSub", {}, at);
        const name = this.parseName();
        const params: Array<{ name: string; array: boolean }> = [];
        if (this.accept("(")) {
            if (!this.isOp(")")) {
                do {
                    this.accept("BYVAL");
                    const param = this.parseName();
                    let array = false;
                    if (this.accept("(")) {
                        this.expect(")");
                        array = true;
                    }
                    if (this.accept("AS")) this.next();
                    params.push({ name: param, array });
                } while (this.accept(","));
            }
            this.expect(")");
        }
        this.accept("STATIC");
        if (this.procedures.has(procedureKey(name))) throw new BasicError("duplicateDefinition", { name }, at);
        // Normal execution skips over the body.
        this.emit({ kind: "jump", index: -1, at });
        const proc: Procedure = { name, kind: kind as "SUB" | "FUNCTION", params, start: this.program.length, end: -1, at, shared: new Set() };
        this.procedures.set(procedureKey(name), proc);
        this.currentProc = proc;
        this.blocks.push({ type: "proc", proc, exits: [] });
    }

    private parseDefFn(at: Position) {
        const name = this.parseName();
        if (!name.startsWith("FN")) throw new BasicError("expected", { what: "@fnName" }, at);
        const params: string[] = [];
        if (this.accept("(")) {
            if (!this.isOp(")")) do params.push(this.parseName()); while (this.accept(","));
            this.expect(")");
        }
        this.expect("=");
        if (this.defFns.has(name)) throw new BasicError("duplicateDefinition", { name }, at);
        this.defFns.set(name, { name, params, e: this.parseExpr() });
        this.emit({ kind: "noop", at });
    }

    private parseSelect(at: Position) {
        this.expect("CASE");
        const slot = this.tempSlots++;
        this.emit({ kind: "settemp", slot, e: this.parseExpr(), at });
        this.blocks.push({ type: "select", slot, pending: null, ends: [], at, sawElse: false });
    }

    private parseCase(at: Position) {
        const block = this.topBlock("select");
        if (!block) throw new BasicError("caseWithoutSelect", {}, at);
        if (block.pending !== null || block.ends.length || block.sawElse) {
            // End the previous CASE body.
            block.ends.push(this.emit({ kind: "jump", index: -1, at }));
        }
        if (block.pending !== null) this.patch(block.pending, this.program.length);
        block.pending = null;
        if (this.accept("ELSE")) {
            block.sawElse = true;
            return;
        }
        const tests: CaseTest[] = [];
        do {
            if (this.accept("IS")) {
                const op = this.next();
                if (op.type !== "op" || !["=", "<>", "<", ">", "<=", ">="].includes(op.text)) throw new BasicError("syntax", {}, this.position(op));
                tests.push({ kind: "is", op: op.text, e: this.parseExpr() });
            } else if (this.peek.type === "op" && ["<", ">", "<=", ">=", "<>"].includes(this.peek.text)) {
                const op = this.next().text;
                tests.push({ kind: "is", op, e: this.parseExpr() });
            } else {
                const low = this.parseExpr();
                if (this.accept("TO")) tests.push({ kind: "range", low, high: this.parseExpr() });
                else tests.push({ kind: "eq", e: low });
            }
        } while (this.accept(","));
        block.pending = this.emit({ kind: "casetest", slot: block.slot, tests, index: -1, at });
    }

    // ------------------------------------------------------------ expressions
    parseExpr(): Expr {
        return this.parseImp();
    }

    private binaryLevel(operators: string[], next: () => Expr): Expr {
        let left = next();
        for (;;) {
            const token = this.peek;
            const op = token.type === "op" || token.type === "id" ? token.text : "";
            if (!operators.includes(op)) return left;
            const at = this.position(token);
            this.next();
            left = { k: "bin", op, l: left, r: next(), at };
        }
    }

    private parseImp(): Expr { return this.binaryLevel(["IMP"], () => this.parseEqv()); }
    private parseEqv(): Expr { return this.binaryLevel(["EQV"], () => this.parseXor()); }
    private parseXor(): Expr { return this.binaryLevel(["XOR"], () => this.parseOr()); }
    private parseOr(): Expr { return this.binaryLevel(["OR"], () => this.parseAnd()); }
    private parseAnd(): Expr { return this.binaryLevel(["AND"], () => this.parseNot()); }

    private parseNot(): Expr {
        if (this.isWord("NOT")) {
            const at = this.position();
            this.next();
            return { k: "unary", op: "NOT", e: this.parseNot(), at };
        }
        return this.parseRelational();
    }

    private parseRelational(): Expr { return this.binaryLevel(["=", "<>", "<", ">", "<=", ">="], () => this.parseAdditive()); }
    private parseAdditive(): Expr { return this.binaryLevel(["+", "-"], () => this.parseMod()); }
    private parseMod(): Expr { return this.binaryLevel(["MOD"], () => this.parseIntDiv()); }
    private parseIntDiv(): Expr { return this.binaryLevel(["\\"], () => this.parseMultiplicative()); }
    private parseMultiplicative(): Expr { return this.binaryLevel(["*", "/"], () => this.parseNegation()); }

    private parseNegation(): Expr {
        if (this.isOp("-") || this.isOp("+")) {
            const at = this.position();
            const op = this.next().text;
            const e = this.parseNegation();
            return op === "-" ? { k: "unary", op: "-", e, at } : e;
        }
        return this.parsePower();
    }

    private parsePower(): Expr {
        let left = this.parsePrimary();
        while (this.isOp("^")) {
            const at = this.position();
            this.next();
            // Exponent operands may carry their own sign: 2 ^ -1.
            const right = this.isOp("-") || this.isOp("+") ? this.parseNegation() : this.parsePrimary();
            left = { k: "bin", op: "^", l: left, r: right, at };
        }
        return left;
    }

    private parsePrimary(): Expr {
        const token = this.peek;
        const at = this.position(token);
        if (token.type === "num") {
            this.next();
            return { k: "num", v: token.value! };
        }
        if (token.type === "str") {
            this.next();
            return { k: "str", v: token.text };
        }
        if (this.accept("(")) {
            const e = this.parseExpr();
            this.expect(")");
            return e;
        }
        if (token.type === "id" && (!KEYWORDS.has(token.text) || token.text === "TIMER")) {
            this.next();
            if (this.accept("(")) {
                const args: Expr[] = [];
                if (!this.isOp(")")) do args.push(this.parseExpr()); while (this.accept(","));
                this.expect(")");
                return { k: "index", name: token.text, args, at };
            }
            return { k: "var", name: token.text, at };
        }
        throw this.unexpectedHere("@expression");
    }

    private resolveTargets() {
        const find = (target: Target) => {
            const index = this.labels.get(target.name);
            if (index === undefined) throw new BasicError("undefinedLabel", { name: target.name }, target.at);
            return index;
        };
        for (const stmt of this.program) {
            if (stmt.kind === "goto" || stmt.kind === "gosub") stmt.index = find(stmt.target);
            else if (stmt.kind === "on") stmt.indexes = stmt.targets.map(find);
            else if (stmt.kind === "restore" && stmt.target) stmt.index = find(stmt.target);
        }
    }
}

// ------------------------------------------------------------------ runtime
type Cell = { value: Value };
type BasicArray = { lower: number[]; upper: number[]; data: Value[]; string: boolean };
type Scope = { cells: Map<string, Cell>; arrays: Map<string, BasicArray>; proc: Procedure | null; returnPc: number; functionName: string | null; resultCell?: Cell };
type ForFrame = { forIndex: number; name: string; cell: Cell; end: number; step: number; body: number };

function mulberry32(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** QBasic-style number text: up to 7 significant digits, ".5" instead of "0.5", "1E+10". */
export function formatBasicNumber(value: number): string {
    if (!Number.isFinite(value)) return value > 0 ? "inf" : value < 0 ? "-inf" : "nan";
    if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
    let text = value.toPrecision(7);
    if (/e/.test(text)) {
        const [mantissa, exponent] = text.split("e");
        const trimmed = mantissa.includes(".") ? mantissa.replace(/0+$/, "").replace(/\.$/, "") : mantissa;
        const sign = exponent.startsWith("-") ? "-" : "+";
        text = `${trimmed}E${sign}${exponent.replace(/^[-+]/, "").padStart(2, "0")}`;
    } else if (text.includes(".")) {
        text = text.replace(/0+$/, "").replace(/\.$/, "");
    }
    return text.replace(/^(-?)0\./, "$1.");
}

class Interpreter {
    readonly locale: Locale;
    readonly options: BasicOptions;
    private readonly parser: Parser;
    private readonly program: Stmt[];
    private output = "";
    private pending = "";
    private column = 0;
    private readonly globals: Scope = { cells: new Map(), arrays: new Map(), proc: null, returnPc: -1, functionName: null };
    private scopes: Scope[] = [];
    private readonly constants = new Map<string, Value>();
    private readonly gosubs: number[] = [];
    private fors: ForFrame[] = [];
    private readonly temps: Value[] = [];
    private dataPointer = 0;
    private random: () => number;
    private lastRandom = 0;
    private readonly input: string[];
    private inputIndex = 0;
    private steps = 0;
    private pc = 0;
    private current: Stmt | null = null;

    constructor(parser: Parser, options: BasicOptions) {
        this.parser = parser;
        this.program = parser.program;
        this.options = options;
        this.locale = options.locale === "tr" ? "tr" : "en";
        this.random = mulberry32(options.seed ?? 327680);
        const stdin = (options.stdin ?? "").replace(/\r\n/g, "\n");
        this.input = stdin.length ? stdin.split("\n") : [];
        if (this.input.length && this.input[this.input.length - 1] === "") this.input.pop();
        this.scopes = [this.globals];
    }

    // ---------------------------------------------------------------- output
    private write(text: string) {
        if (!text) return;
        this.pending += text;
        const newline = text.lastIndexOf("\n");
        this.column = newline >= 0 ? text.length - newline - 1 : this.column + text.length;
        if (this.pending.length >= 1024) this.flush();
        if (this.output.length + this.pending.length > 2_000_000) throw new BasicEnd();
    }

    flush() {
        if (!this.pending) return;
        this.output += this.pending;
        this.options.onOutput?.(this.pending);
        this.pending = "";
    }

    // ---------------------------------------------------------------- variables
    private isStringName(name: string, scope: Scope = this.scope) {
        if (name.endsWith("$")) return true;
        if (/[%!#&]$/.test(name)) return false;
        const declared = this.parser.declaredTypes.get(`${scope.proc?.name ?? ""}\u0000${name}`) ?? this.parser.declaredTypes.get(`\u0000${name}`);
        if (declared) return declared === "STRING";
        return this.parser.defaultTypes.get(name[0]) === "DEFSTR";
    }

    private isIntegerName(name: string, scope: Scope = this.scope) {
        if (name.endsWith("%") || name.endsWith("&")) return true;
        if (/[$!#]$/.test(name)) return false;
        const declared = this.parser.declaredTypes.get(`${scope.proc?.name ?? ""}\u0000${name}`) ?? this.parser.declaredTypes.get(`\u0000${name}`);
        if (declared) return declared === "INTEGER" || declared === "LONG";
        const fallback = this.parser.defaultTypes.get(name[0]);
        return fallback === "DEFINT" || fallback === "DEFLNG";
    }

    private get scope() {
        return this.scopes[this.scopes.length - 1];
    }

    /** The scope a name lives in: SUB locals unless the name is shared. */
    private scopeFor(name: string): Scope {
        const scope = this.scope;
        if (!scope.proc) return scope;
        if (scope.cells.has(name) || scope.arrays.has(name)) return scope;
        if (this.parser.sharedNames.has(name) || scope.proc.shared.has(name)) return this.globals;
        return scope;
    }

    private cell(name: string): Cell {
        const scope = this.scopeFor(name);
        let cell = scope.cells.get(name);
        if (!cell) {
            cell = { value: this.isStringName(name, scope) ? "" : 0 };
            scope.cells.set(name, cell);
        }
        return cell;
    }

    private coerce(name: string, value: Value, at: Position): Value {
        const wantsString = this.isStringName(name);
        if (wantsString !== (typeof value === "string")) throw new BasicError("typeMismatch", {}, at);
        if (typeof value === "number" && this.isIntegerName(name)) {
            const rounded = Math.round(value) === value + 0.5 && Math.round(value) % 2 !== 0 ? Math.round(value) - 1 : Math.round(value);
            const limit = name.endsWith("&") || this.parser.declaredTypes.get(`\u0000${name}`) === "LONG" ? 2147483647 : 32767;
            if (rounded > limit || rounded < -limit - 1) throw new BasicError("overflow", {}, at);
            return rounded;
        }
        return value;
    }

    private array(name: string, dimensions: number, at: Position): BasicArray {
        const scope = this.scopeFor(name);
        let array = scope.arrays.get(name);
        if (!array) {
            // Arrays used without DIM get bounds 0..10 in every dimension.
            const lower = Array.from({ length: dimensions }, () => this.parser.optionBase);
            const upper = Array.from({ length: dimensions }, () => 10);
            array = this.makeArray(name, lower, upper, at);
            scope.arrays.set(name, array);
        }
        return array;
    }

    private makeArray(name: string, lower: number[], upper: number[], at: Position): BasicArray {
        let size = 1;
        for (let index = 0; index < lower.length; index += 1) {
            if (upper[index] < lower[index]) throw new BasicError("subscript", { name, index: upper[index] }, at);
            size *= upper[index] - lower[index] + 1;
        }
        if (size > 5_000_000) throw new BasicError("overflow", {}, at);
        const string = this.isStringName(name);
        return { lower, upper, data: new Array<Value>(size).fill(string ? "" : 0), string };
    }

    private offset(name: string, array: BasicArray, indexes: number[], at: Position) {
        if (indexes.length !== array.lower.length) throw new BasicError("subscript", { name, index: indexes.join(", ") }, at);
        let offset = 0;
        for (let dimension = 0; dimension < indexes.length; dimension += 1) {
            const index = Math.round(indexes[dimension]);
            if (index < array.lower[dimension] || index > array.upper[dimension]) throw new BasicError("subscript", { name, index: indexes.join(", ") }, at);
            offset = offset * (array.upper[dimension] - array.lower[dimension] + 1) + (index - array.lower[dimension]);
        }
        return offset;
    }

    private assign(target: LValue, value: Value) {
        if (this.constants.has(target.name)) throw new BasicError("constAssign", { name: target.name }, target.at);
        const coerced = this.coerce(target.name, value, target.at);
        if (!target.args) {
            const scope = this.scope;
            if (scope.functionName !== null && scope.functionName === procedureKey(target.name) && scope.resultCell) {
                scope.resultCell.value = coerced;
                return;
            }
            this.cell(target.name).value = coerced;
            return;
        }
        const indexes = target.args.map((arg) => this.number(arg));
        const array = this.array(target.name, indexes.length, target.at);
        array.data[this.offset(target.name, array, indexes, target.at)] = coerced;
    }

    private read(target: LValue): Value {
        if (!target.args) return this.evaluate({ k: "var", name: target.name, at: target.at });
        return this.evaluate({ k: "index", name: target.name, args: target.args, at: target.at });
    }

    // ---------------------------------------------------------------- expressions
    private number(e: Expr): number {
        const value = this.evaluate(e);
        if (typeof value !== "number") throw new BasicError("typeMismatch", {}, "at" in e ? e.at : this.current?.at);
        return value;
    }

    private string(e: Expr): string {
        const value = this.evaluate(e);
        if (typeof value !== "string") throw new BasicError("typeMismatch", {}, "at" in e ? e.at : this.current?.at);
        return value;
    }

    private toInt(value: number, at: Position) {
        const rounded = Math.round(value);
        if (rounded > 2147483647 || rounded < -2147483648) throw new BasicError("overflow", {}, at);
        return rounded;
    }

    evaluate(e: Expr): Value {
        switch (e.k) {
            case "num": return e.v;
            case "str": return e.v;
            case "var": {
                if (this.constants.has(e.name)) return this.constants.get(e.name)!;
                const scope = this.scope;
                if (scope.functionName !== null && scope.functionName === procedureKey(e.name) && scope.resultCell) return scope.resultCell.value;
                const fn = this.parser.procedures.get(procedureKey(e.name));
                if (fn && fn.kind === "FUNCTION") return this.callFunction(fn, [], e.at);
                if (this.parser.defFns.has(e.name)) return this.callDefFn(e.name, [], e.at);
                if (FUNCTIONS[e.name] && FUNCTIONS[e.name][0] === 0) return this.builtin(e.name, [], e.at);
                return this.cell(e.name).value;
            }
            case "index": {
                const scope = this.scopeFor(e.name);
                if (scope.arrays.has(e.name)) {
                    const indexes = e.args.map((arg) => this.number(arg));
                    const array = scope.arrays.get(e.name)!;
                    return array.data[this.offset(e.name, array, indexes, e.at)];
                }
                const proc = this.parser.procedures.get(procedureKey(e.name));
                if (proc && proc.kind === "FUNCTION") return this.callFunction(proc, e.args, e.at);
                if (this.parser.defFns.has(e.name)) return this.callDefFn(e.name, e.args, e.at);
                if (FUNCTIONS[e.name]) return this.builtin(e.name, e.args, e.at);
                const indexes = e.args.map((arg) => this.number(arg));
                const array = this.array(e.name, indexes.length, e.at);
                return array.data[this.offset(e.name, array, indexes, e.at)];
            }
            case "unary": {
                const value = this.number(e.e);
                if (e.op === "-") return -value;
                return ~this.toInt(value, e.at);
            }
            case "bin": return this.binary(e);
        }
    }

    private binary(e: Extract<Expr, { k: "bin" }>): Value {
        const left = this.evaluate(e.l);
        const right = this.evaluate(e.r);
        const op = e.op;
        if (typeof left === "string" || typeof right === "string") {
            if (typeof left !== "string" || typeof right !== "string") throw new BasicError("typeMismatch", {}, e.at);
            switch (op) {
                case "+": {
                    if (left.length + right.length > 1_000_000) throw new BasicError("stringTooLong", {}, e.at);
                    return left + right;
                }
                case "=": return left === right ? -1 : 0;
                case "<>": return left !== right ? -1 : 0;
                case "<": return left < right ? -1 : 0;
                case ">": return left > right ? -1 : 0;
                case "<=": return left <= right ? -1 : 0;
                case ">=": return left >= right ? -1 : 0;
                default: throw new BasicError("typeMismatch", {}, e.at);
            }
        }
        switch (op) {
            case "+": return left + right;
            case "-": return left - right;
            case "*": return left * right;
            case "/":
                if (right === 0) throw new BasicError("divisionByZero", {}, e.at);
                return left / right;
            case "\\": {
                const divisor = this.toInt(right, e.at);
                if (divisor === 0) throw new BasicError("divisionByZero", {}, e.at);
                return Math.trunc(this.toInt(left, e.at) / divisor);
            }
            case "MOD": {
                const divisor = this.toInt(right, e.at);
                if (divisor === 0) throw new BasicError("divisionByZero", {}, e.at);
                return this.toInt(left, e.at) % divisor;
            }
            case "^": {
                const result = left ** right;
                if (Number.isNaN(result)) throw new BasicError("illegalCall", { name: "^" }, e.at);
                return result;
            }
            case "=": return left === right ? -1 : 0;
            case "<>": return left !== right ? -1 : 0;
            case "<": return left < right ? -1 : 0;
            case ">": return left > right ? -1 : 0;
            case "<=": return left <= right ? -1 : 0;
            case ">=": return left >= right ? -1 : 0;
            case "AND": return this.toInt(left, e.at) & this.toInt(right, e.at);
            case "OR": return this.toInt(left, e.at) | this.toInt(right, e.at);
            case "XOR": return this.toInt(left, e.at) ^ this.toInt(right, e.at);
            case "EQV": return ~(this.toInt(left, e.at) ^ this.toInt(right, e.at));
            case "IMP": return ~this.toInt(left, e.at) | this.toInt(right, e.at);
        }
        throw new BasicError("syntax", {}, e.at);
    }

    private builtin(name: string, args: Expr[], at: Position): Value {
        const [min, max] = FUNCTIONS[name];
        if (args.length < min || args.length > max) throw new BasicError("argumentCount", { name }, at);
        const num = (index: number) => this.number(args[index]);
        const str = (index: number) => this.string(args[index]);
        const illegal = () => new BasicError("illegalCall", { name }, at);
        switch (name) {
            case "ABS": return Math.abs(num(0));
            case "ASC": {
                const text = str(0);
                if (!text) throw illegal();
                return text.codePointAt(0)!;
            }
            case "ATN": return Math.atan(num(0));
            case "CDBL": case "CSNG": return num(0);
            case "CHR$": {
                const code = num(0);
                if (code < 0 || code > 0x10ffff) throw illegal();
                return String.fromCodePoint(Math.trunc(code));
            }
            case "CINT": case "CLNG": return this.toInt(num(0), at);
            case "COS": return Math.cos(num(0));
            case "EXP": return Math.exp(num(0));
            case "FIX": return Math.trunc(num(0));
            case "HEX$": return (this.toInt(num(0), at) >>> 0).toString(16).toUpperCase();
            case "OCT$": return (this.toInt(num(0), at) >>> 0).toString(8);
            case "INSTR": {
                let start = 1;
                let haystack: string;
                let needle: string;
                if (args.length === 3) {
                    start = Math.trunc(num(0));
                    haystack = str(1);
                    needle = str(2);
                } else {
                    haystack = str(0);
                    needle = str(1);
                }
                if (start < 1) throw illegal();
                return haystack.indexOf(needle, start - 1) + 1;
            }
            case "INT": return Math.floor(num(0));
            case "LCASE$": return str(0).toLowerCase();
            case "UCASE$": return str(0).toUpperCase();
            case "LEFT$": {
                const count = Math.trunc(num(1));
                if (count < 0) throw illegal();
                return str(0).slice(0, count);
            }
            case "RIGHT$": {
                const count = Math.trunc(num(1));
                if (count < 0) throw illegal();
                const text = str(0);
                return count === 0 ? "" : text.slice(-count);
            }
            case "MID$": {
                const text = str(0);
                const start = Math.trunc(num(1));
                if (start < 1) throw illegal();
                const count = args.length === 3 ? Math.trunc(num(2)) : text.length;
                if (count < 0) throw illegal();
                return text.substr(start - 1, count);
            }
            case "LEN": {
                const value = this.evaluate(args[0]);
                return typeof value === "string" ? value.length : 8;
            }
            case "LOG": {
                const value = num(0);
                if (value <= 0) throw illegal();
                return Math.log(value);
            }
            case "LTRIM$": return str(0).replace(/^ +/, "");
            case "RTRIM$": return str(0).replace(/ +$/, "");
            case "TRIM$": return str(0).trim();
            case "RND": {
                const argument = args.length ? num(0) : 1;
                if (argument < 0) this.random = mulberry32(Math.trunc(Math.abs(argument) * 1000) || 1);
                if (argument === 0) return this.lastRandom;
                this.lastRandom = this.random();
                return this.lastRandom;
            }
            case "SGN": return Math.sign(num(0));
            case "SIN": return Math.sin(num(0));
            case "SPACE$": {
                const count = Math.trunc(num(0));
                if (count < 0 || count > 1_000_000) throw illegal();
                return " ".repeat(count);
            }
            case "SQR": {
                const value = num(0);
                if (value < 0) throw illegal();
                return Math.sqrt(value);
            }
            case "STR$": {
                const value = num(0);
                return value >= 0 ? ` ${formatBasicNumber(value)}` : formatBasicNumber(value);
            }
            case "STRING$": {
                const count = Math.trunc(num(0));
                if (count < 0 || count > 1_000_000) throw illegal();
                const value = this.evaluate(args[1]);
                const char = typeof value === "string" ? value[0] ?? "" : String.fromCodePoint(Math.trunc(value));
                if (!char) throw illegal();
                return char.repeat(count);
            }
            case "TAN": return Math.tan(num(0));
            case "TIMER": {
                const now = new Date();
                return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
            }
            case "VAL": {
                const match = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][-+]?\d+)?/.exec(str(0).replace(/^\s*&H([0-9A-F]+)/i, (_, hex: string) => String(Number.parseInt(hex, 16))));
                return match ? Number(match[0].replace(/[dD]/, "e")) : 0;
            }
            case "DATE$": {
                const now = new Date();
                return `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${now.getFullYear()}`;
            }
            case "TIME$": return new Date().toTimeString().slice(0, 8);
            case "INKEY$": return "";
        }
        throw illegal();
    }

    private callDefFn(name: string, args: Expr[], at: Position): Value {
        const fn = this.parser.defFns.get(name)!;
        if (args.length !== fn.params.length) throw new BasicError("argumentCount", { name }, at);
        const values = args.map((arg) => this.evaluate(arg));
        const scope: Scope = { cells: new Map(), arrays: new Map(), proc: this.scope.proc, returnPc: -1, functionName: null };
        fn.params.forEach((param, index) => scope.cells.set(param, { value: this.coerceParam(param, values[index], at) }));
        // DEF FN bodies see the parameters first, then the surrounding variables.
        const outer = this.scope;
        for (const [key, cell] of outer.cells) if (!scope.cells.has(key)) scope.cells.set(key, cell);
        for (const [key, array] of outer.arrays) scope.arrays.set(key, array);
        this.pushScope(scope, at);
        try {
            return this.evaluate(fn.e);
        } finally {
            this.scopes.pop();
        }
    }

    private coerceParam(name: string, value: Value, at: Position) {
        if (this.isStringName(name) !== (typeof value === "string")) throw new BasicError("typeMismatch", {}, at);
        return value;
    }

    private pushScope(scope: Scope, at: Position) {
        if (this.scopes.length > 5000) throw new BasicError("stackOverflow", {}, at);
        this.scopes.push(scope);
    }

    /** Creates the scope of a SUB or FUNCTION call; plain variable arguments are passed by reference. */
    private enterProcedure(proc: Procedure, args: Expr[], at: Position, returnPc: number): Scope {
        if (args.length !== proc.params.length) throw new BasicError("argumentCount", { name: proc.name }, at);
        const scope: Scope = { cells: new Map(), arrays: new Map(), proc, returnPc, functionName: proc.kind === "FUNCTION" ? procedureKey(proc.name) : null };
        proc.params.forEach((param, index) => {
            const arg = args[index];
            if (param.array) {
                if (arg.k !== "var" && !(arg.k === "index" && !arg.args.length)) throw new BasicError("typeMismatch", {}, at);
                const owner = this.scopeFor(arg.name);
                const array = owner.arrays.get(arg.name);
                if (!array) throw new BasicError("subscript", { name: arg.name, index: "" }, at);
                scope.arrays.set(param.name, array);
                return;
            }
            if (arg.k === "var" && !this.constants.has(arg.name) && !this.parser.procedures.has(procedureKey(arg.name)) && !FUNCTIONS[arg.name]) {
                const cell = this.cell(arg.name);
                if (this.isStringName(param.name, scope) !== (typeof cell.value === "string")) throw new BasicError("typeMismatch", {}, at);
                scope.cells.set(param.name, cell);
                return;
            }
            const value = this.evaluate(arg);
            if (this.isStringName(param.name, scope) !== (typeof value === "string")) throw new BasicError("typeMismatch", {}, at);
            scope.cells.set(param.name, { value });
        });
        if (proc.kind === "FUNCTION") scope.resultCell = { value: this.isStringName(proc.name, scope) ? "" : 0 };
        return scope;
    }

    private callFunction(proc: Procedure, args: Expr[], at: Position): Value {
        const scope = this.enterProcedure(proc, args, at, -1);
        this.pushScope(scope, at);
        const savedPc = this.pc;
        const savedFors = this.fors;
        const savedCurrent = this.current;
        this.fors = [];
        try {
            this.pc = proc.start;
            this.loop(scope);
            return scope.resultCell!.value;
        } finally {
            this.pc = savedPc;
            this.fors = savedFors;
            this.current = savedCurrent;
            if (this.scope === scope) this.scopes.pop();
        }
    }

    // ---------------------------------------------------------------- statements
    run(): BasicResult {
        try {
            this.pc = 0;
            this.loop(null);
            this.flush();
            return { output: this.output, exitCode: 0 };
        } catch (error) {
            this.flush();
            if (error instanceof BasicEnd) return { output: this.output, exitCode: 0 };
            if (error instanceof BasicError) return { output: this.output, exitCode: 1, error: this.describe(error, error.position ?? this.current?.at) };
            if (error instanceof RangeError) return { output: this.output, exitCode: 1, error: this.describe(new BasicError("stackOverflow"), this.current?.at) };
            throw error;
        }
    }

    describe(error: BasicError, at: Position | undefined) {
        const vars = { ...error.vars };
        if (typeof vars.what === "string" && vars.what.startsWith("@")) vars.what = WHAT[vars.what.slice(1)]?.[this.locale] ?? vars.what.slice(1);
        if (vars.found !== undefined) vars.what = `${vars.what} (${this.locale === "tr" ? "bulunan" : "found"}: ${vars.found})`;
        let message = MESSAGES[error.key][this.locale].replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
        if (at?.basicLine !== undefined) message += ` (${MESSAGES.basicLine[this.locale].replace("{number}", String(at.basicLine))})`;
        return { message, line: at?.line, column: at?.column };
    }

    /** Runs statements until END, the end of the program or (for `until`) the end of that procedure call. */
    private loop(until: Scope | null) {
        const maxSteps = this.options.maxSteps ?? Number.POSITIVE_INFINITY;
        while (this.pc < this.program.length) {
            const stmt = this.program[this.pc];
            this.current = stmt;
            this.steps += 1;
            if (this.steps > maxSteps) throw new BasicError("stepLimit", { count: maxSteps }, stmt.at);
            if ((this.steps & 0xfff) === 0 && this.options.shouldStop?.()) throw new BasicError("timeLimit", {}, stmt.at);
            this.pc += 1;
            if (this.execute(stmt, until)) return;
        }
        if (until) return;
        throw new BasicEnd();
    }

    /** Executes one statement; returns true when the current FUNCTION call returns. */
    private execute(stmt: Stmt, until: Scope | null): boolean {
        const at = stmt.at;
        switch (stmt.kind) {
            case "noop": return false;
            case "print": this.print(stmt); return false;
            case "input": this.inputStatement(stmt); return false;
            case "let": this.assign(stmt.target, this.evaluate(stmt.e)); return false;
            case "goto": this.pc = stmt.index!; return false;
            case "gosub":
                if (this.gosubs.length > 10_000) throw new BasicError("stackOverflow", {}, at);
                this.gosubs.push(this.pc);
                this.pc = stmt.index!;
                return false;
            case "return":
                if (!this.gosubs.length) throw new BasicError("returnWithoutGosub", {}, at);
                this.pc = this.gosubs.pop()!;
                return false;
            case "jump": this.pc = stmt.index; return false;
            case "jumpif": {
                const value = this.number(stmt.cond);
                if ((value !== 0) !== stmt.negate) this.pc = stmt.index;
                return false;
            }
            case "for": {
                const cell = this.cell(stmt.variable.name);
                const start = this.coerce(stmt.variable.name, this.number(stmt.start), at) as number;
                const end = this.number(stmt.end);
                const step = stmt.step ? this.number(stmt.step) : 1;
                cell.value = start;
                // A FOR that restarts drops its old frame and the ones inside it.
                const existing = this.fors.findIndex((frame) => frame.cell === cell);
                if (existing >= 0) this.fors.length = existing;
                if (step >= 0 ? start > end : start < end) {
                    this.pc = stmt.exit >= 0 ? stmt.exit : this.findNext(stmt.variable.name, this.pc);
                    return false;
                }
                if (this.fors.length > 10_000) throw new BasicError("stackOverflow", {}, at);
                this.fors.push({ forIndex: this.pc - 1, name: stmt.variable.name, cell, end, step, body: this.pc });
                return false;
            }
            case "next": {
                const names = stmt.names.length ? stmt.names : [null];
                for (const name of names) {
                    let frame: ForFrame | undefined;
                    if (stmt.forIndex !== null) {
                        const position = this.fors.map((item) => item.forIndex).lastIndexOf(stmt.forIndex);
                        if (position < 0) throw new BasicError("nextWithoutFor", {}, at);
                        this.fors.length = position + 1;
                        frame = this.fors[position];
                    } else {
                        while (this.fors.length) {
                            const top = this.fors[this.fors.length - 1];
                            if (name === null || top.name === name) {
                                frame = top;
                                break;
                            }
                            this.fors.pop();
                        }
                        if (!frame) throw new BasicError("nextWithoutFor", {}, at);
                    }
                    const value = (frame.cell.value as number) + frame.step;
                    frame.cell.value = value;
                    if (frame.step >= 0 ? value <= frame.end : value >= frame.end) {
                        this.pc = frame.body;
                        return false;
                    }
                    this.fors.pop();
                }
                return false;
            }
            case "exitfor": {
                const position = this.fors.map((item) => item.forIndex).lastIndexOf(stmt.forIndex);
                if (position >= 0) this.fors.length = position;
                this.pc = stmt.index;
                return false;
            }
            case "on": {
                const choice = Math.round(this.number(stmt.e));
                if (choice < 0 || choice > 255) throw new BasicError("illegalCall", { name: "ON" }, at);
                if (choice >= 1 && choice <= stmt.indexes!.length) {
                    if (stmt.gosub) this.gosubs.push(this.pc);
                    this.pc = stmt.indexes![choice - 1];
                }
                return false;
            }
            case "end": throw new BasicEnd();
            case "dim": {
                const scope = stmt.shared ? this.globals : this.scope;
                for (const item of stmt.arrays) {
                    const lower = item.bounds.map(([low]) => (low ? Math.round(this.number(low)) : this.parser.optionBase));
                    const upper = item.bounds.map(([, high]) => Math.round(this.number(high)));
                    if (scope.arrays.has(item.name) && !stmt.redim) throw new BasicError("duplicateDefinition", { name: item.name }, item.at);
                    scope.arrays.set(item.name, this.makeArray(item.name, lower, upper, item.at));
                }
                for (const item of stmt.scalars) {
                    if (!scope.cells.has(item.name)) scope.cells.set(item.name, { value: this.isStringName(item.name, scope) ? "" : 0 });
                }
                return false;
            }
            case "erase":
                for (const name of stmt.names) this.scopeFor(name).arrays.delete(name);
                return false;
            case "const":
                if (this.constants.has(stmt.name)) throw new BasicError("duplicateDefinition", { name: stmt.name }, at);
                this.constants.set(stmt.name, this.evaluate(stmt.e));
                return false;
            case "read":
                for (const target of stmt.targets) {
                    const item = this.parser.data[this.dataPointer++];
                    if (!item) throw new BasicError("outOfData", {}, at);
                    if (this.isStringName(target.name)) this.assign(target, item.value);
                    else {
                        const number = Number(item.value.trim() || "0");
                        if (item.quoted || !Number.isFinite(number)) throw new BasicError("typeMismatch", {}, at);
                        this.assign(target, number);
                    }
                }
                return false;
            case "restore": {
                if (stmt.index === undefined) {
                    this.dataPointer = 0;
                    return false;
                }
                const found = this.parser.data.findIndex((item) => item.index >= stmt.index!);
                this.dataPointer = found < 0 ? this.parser.data.length : found;
                return false;
            }
            case "swap": {
                const a = this.read(stmt.a);
                const b = this.read(stmt.b);
                if (typeof a !== typeof b) throw new BasicError("typeMismatch", {}, at);
                this.assign(stmt.a, b);
                this.assign(stmt.b, a);
                return false;
            }
            case "randomize": {
                const seed = stmt.timer ? Date.now() : this.number(stmt.e!);
                this.random = mulberry32(Math.trunc(seed * 1000) ^ 0x5bd1e995);
                return false;
            }
            case "call": {
                const proc = this.parser.procedures.get(procedureKey(stmt.name));
                if (!proc) throw new BasicError("undefinedFunction", { name: stmt.name }, at);
                const scope = this.enterProcedure(proc, stmt.args, at, this.pc);
                this.pushScope(scope, at);
                scope.returnPc = this.pc;
                (scope as Scope & { savedFors?: ForFrame[] }).savedFors = this.fors;
                this.fors = [];
                this.pc = proc.start;
                return false;
            }
            case "subreturn": {
                const scope = this.scope;
                if (!scope.proc) throw new BasicError("syntax", {}, at);
                this.fors = (scope as Scope & { savedFors?: ForFrame[] }).savedFors ?? [];
                if (until === scope) return true;
                this.scopes.pop();
                this.pc = scope.returnPc;
                return false;
            }
            case "settemp": this.temps[stmt.slot] = this.evaluate(stmt.e); return false;
            case "casetest": {
                const value = this.temps[stmt.slot];
                const matches = stmt.tests.some((test) => {
                    const compare = (op: string, other: Value) => {
                        if (typeof other !== typeof value) throw new BasicError("typeMismatch", {}, at);
                        switch (op) {
                            case "=": return value === other;
                            case "<>": return value !== other;
                            case "<": return value < other;
                            case ">": return value > other;
                            case "<=": return value <= other;
                            default: return value >= other;
                        }
                    };
                    if (test.kind === "eq") return compare("=", this.evaluate(test.e));
                    if (test.kind === "is") return compare(test.op, this.evaluate(test.e));
                    return compare(">=", this.evaluate(test.low)) && compare("<=", this.evaluate(test.high));
                });
                if (!matches) this.pc = stmt.index;
                return false;
            }
            case "shared": return false;
        }
        return false;
    }

    /** For a FOR whose NEXT is not structured: the statement after the matching NEXT. */
    private findNext(name: string, from: number) {
        let depth = 0;
        for (let index = from; index < this.program.length; index += 1) {
            const stmt = this.program[index];
            if (stmt.kind === "for") depth += 1;
            if (stmt.kind === "next") {
                if (stmt.names.includes(name) || (!stmt.names.length && depth === 0)) return index + 1;
                if (depth > 0) depth -= 1;
            }
        }
        throw new BasicError("forWithoutNext", {}, this.current?.at);
    }

    private print(stmt: Extract<Stmt, { kind: "print" }>) {
        let newline = true;
        let previousWasValue = false;
        for (const item of stmt.items) {
            newline = true;
            if (item.kind === "sep") {
                newline = false;
                if (stmt.quoted) {
                    if (item.sep === "," || item.sep === ";") this.write(",");
                } else if (item.sep === ",") {
                    const next = (Math.floor(this.column / 14) + 1) * 14;
                    this.write(" ".repeat(next - this.column));
                }
                previousWasValue = false;
                continue;
            }
            if (stmt.quoted && previousWasValue) this.write(",");
            if (item.kind === "tab") {
                const target = Math.max(1, Math.round(this.number(item.e))) - 1;
                if (target < this.column) this.write(`\n${" ".repeat(target)}`);
                else this.write(" ".repeat(target - this.column));
                previousWasValue = false;
                continue;
            }
            if (item.kind === "spc") {
                this.write(" ".repeat(Math.max(0, Math.min(10_000, Math.round(this.number(item.e))))));
                previousWasValue = false;
                continue;
            }
            const value = this.evaluate(item.e);
            if (typeof value === "string") this.write(stmt.quoted ? `"${value}"` : value);
            else if (stmt.quoted) this.write(formatBasicNumber(value));
            else this.write(`${value >= 0 ? " " : ""}${formatBasicNumber(value)} `);
            previousWasValue = true;
        }
        if (newline) this.write("\n");
    }

    private nextInputLine(at: Position): string {
        if (this.inputIndex >= this.input.length) throw new BasicError("inputPastEnd", {}, at);
        return this.input[this.inputIndex++];
    }

    private inputStatement(stmt: Extract<Stmt, { kind: "input" }>) {
        const at = stmt.at;
        this.write(`${stmt.prompt ?? ""}${stmt.question ? "? " : ""}`);
        if (stmt.whole) {
            const line = this.nextInputLine(at);
            this.write(`${line}\n`);
            this.assign(stmt.targets[0], line);
            return;
        }
        const values: string[] = [];
        const echoed: string[] = [];
        while (values.length < stmt.targets.length) {
            const line = this.nextInputLine(at);
            echoed.push(line);
            values.push(...this.splitInput(line));
        }
        this.write(`${echoed.join(", ")}\n`);
        stmt.targets.forEach((target, index) => {
            const text = values[index] ?? "";
            if (this.isStringName(target.name)) {
                this.assign(target, text);
                return;
            }
            const trimmed = text.trim();
            const number = trimmed === "" ? 0 : Number(trimmed.replace(/[dD]/, "e"));
            if (!Number.isFinite(number)) throw new BasicError("inputNumber", { text: trimmed.slice(0, 40) }, at);
            this.assign(target, number);
        });
    }

    /** Splits an INPUT line at commas outside double quotes. */
    private splitInput(line: string): string[] {
        const parts: string[] = [];
        let current = "";
        let quoted = false;
        for (const char of line) {
            if (char === "\"") {
                quoted = !quoted;
                continue;
            }
            if (char === "," && !quoted) {
                parts.push(current.trim());
                current = "";
                continue;
            }
            current += char;
        }
        parts.push(quoted ? current : current.trim());
        return parts;
    }
}

export function runBasic(source: string, options: BasicOptions = {}): BasicResult {
    const locale: Locale = options.locale === "tr" ? "tr" : "en";
    const parser = new Parser();
    try {
        parser.parse(source);
    } catch (error) {
        if (error instanceof BasicError) {
            const interpreter = new Interpreter(parser, options);
            return { output: "", exitCode: 1, error: interpreter.describe(error, error.position) };
        }
        throw error;
    }
    void locale;
    return new Interpreter(parser, options).run();
}
