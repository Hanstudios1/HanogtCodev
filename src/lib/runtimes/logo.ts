/**
 * Hanogt Logo: a dependency-free interpreter for the turtle-graphics core of
 * UCBLogo. It runs in the editor's live preview (and in plain Node for tests)
 * and returns the drawing as data that {@link renderLogoSvg} turns into SVG.
 *
 * Supported:
 *  - turtle: FORWARD/FD, BACK/BK, LEFT/LT, RIGHT/RT, PENUP/PU, PENDOWN/PD,
 *    HOME, CLEARSCREEN/CS, CLEAN, SETPOS, SETXY, SETX, SETY, SETHEADING/SETH,
 *    SETPENCOLOR/SETPC (colour names, 0–15, "#RRGGBB or [R G B] 0–255),
 *    SETPENSIZE/SETWIDTH, SETBACKGROUND/SETBG, HIDETURTLE/HT, SHOWTURTLE/ST,
 *    ARC, CIRCLE, LABEL; POS, XCOR, YCOR, HEADING, TOWARDS;
 *  - control: REPEAT/REPCOUNT, FOR, WHILE, IF, IFELSE, RUN, STOP, OUTPUT/OP,
 *    TO … END procedures with :inputs, MAKE, NAME, LOCAL, THING;
 *  - arithmetic with infix + - * / and = < > <= >= <>, SUM, DIFFERENCE,
 *    PRODUCT, QUOTIENT, REMAINDER, MODULO, POWER, MINUS, SQRT, ABS, INT,
 *    ROUND, SIN, COS, TAN, ARCTAN, EXP, LN, PI, RANDOM, PICK;
 *  - words and lists: WORD, LIST, SENTENCE/SE, FPUT, LPUT, FIRST, LAST,
 *    BUTFIRST/BF, BUTLAST/BL, ITEM, COUNT, EMPTYP, MEMBERP, NUMBERP, WORDP,
 *    LISTP, EQUALP, LESSP, GREATERP, NOT, AND, OR;
 *  - output: PRINT/PR, SHOW, TYPE (WAIT is accepted and ignored).
 *
 * Procedures may be called before their TO … END definition. Every
 * instruction counts towards a step budget, so endless loops and runaway
 * recursion stop with an error that names the line instead of freezing the
 * page. RANDOM uses a seeded generator: the same program draws the same
 * picture while it is being edited.
 */

export type LogoLocale = "tr" | "en";

export interface LogoOptions {
    locale?: LogoLocale;
    /** Instructions and procedure calls a run may take (default 200,000). */
    maxSteps?: number;
    /** Line segments a drawing may hold (default 50,000). */
    maxSegments?: number;
    /** Nested procedure calls (default 400). */
    maxDepth?: number;
    /** Seed of RANDOM and PICK. */
    seed?: number;
    /** Characters PRINT, SHOW and TYPE may produce (default 20,000). */
    maxOutput?: number;
}

export interface LogoSegment { x1: number; y1: number; x2: number; y2: number; color: string; width: number }
export interface LogoLabel { x: number; y: number; text: string; color: string; size: number }
export interface LogoTurtle { x: number; y: number; heading: number; visible: boolean; color: string }

export interface LogoResult {
    segments: LogoSegment[];
    labels: LogoLabel[];
    turtle: LogoTurtle;
    /** Paper colour (SETBACKGROUND); white by default. */
    background: string;
    /** What PRINT, SHOW and TYPE wrote. */
    output: string;
    steps: number;
    exitCode: number;
    error?: { message: string; line?: number; column?: number };
}

// ------------------------------------------------------------------ messages
const MESSAGES = {
    unknown: { tr: "{name} komutunu bilmiyorum", en: "I don't know how to {name}" },
    notEnough: { tr: "{name} için yeterli girdi yok", en: "Not enough inputs to {name}" },
    tooMany: { tr: "{name} için fazla girdi var", en: "Too many inputs to {name}" },
    noUse: { tr: "{value} ile ne yapılacağı söylenmedi", en: "You don't say what to do with {value}" },
    noOutput: { tr: "{name} bir değer döndürmedi ama {caller} bir girdi bekliyordu", en: "{name} didn't output to {caller}" },
    badInput: { tr: "{name}, {value} değerini girdi olarak kabul etmiyor", en: "{name} doesn't like {value} as input" },
    noValue: { tr: "{name} değişkeninin değeri yok", en: "{name} has no value" },
    divide: { tr: "Sıfıra bölme", en: "Division by zero" },
    unexpected: { tr: "Beklenmeyen {text}", en: "Unexpected {text}" },
    missingParen: { tr: "Kapanış ) eksik", en: "Missing )" },
    missingBracket: { tr: "Kapanış ] eksik", en: "Missing ]" },
    noEnd: { tr: "TO {name} için END eksik", en: "TO {name} has no END" },
    toPlace: { tr: "TO yalnızca programın en üst düzeyinde kullanılabilir", en: "TO can only be used at the top level of the program" },
    toName: { tr: "TO sonrasında bir yordam adı gerekiyor", en: "TO needs a procedure name" },
    primitive: { tr: "{name} yerleşik bir komut; yordamınıza başka bir ad verin", en: "{name} is a primitive; give your procedure another name" },
    stray: { tr: "{name} burada kullanılamaz", en: "{name} can't be used here" },
    outputPlace: { tr: "OUTPUT yalnızca bir yordamın içinde kullanılabilir", en: "OUTPUT can only be used inside a procedure" },
    stepLimit: { tr: "Adım sınırı aşıldı ({count} adım); programda sonsuz döngü olabilir", en: "Step limit reached ({count} steps); the program may contain an infinite loop" },
    tooDeep: { tr: "Yordamlar çok derin iç içe çağrıldı ({count} düzey); özyinelemenin durma koşulunu kontrol edin", en: "Procedures are nested too deeply ({count} levels); check the stop condition of the recursion" },
    tooLarge: { tr: "Çizim çok büyük (en fazla {count} çizgi)", en: "The drawing is too large (at most {count} lines)" },
    outputLimit: { tr: "… (çıktı kısaltıldı)", en: "… (output truncated)" },
};

type MessageKey = keyof typeof MESSAGES;

class LogoError extends Error {
    line?: number;
    column?: number;
    constructor(message: string, at?: Position) {
        super(message);
        this.line = at?.line;
        this.column = at?.column;
    }
}

/** Thrown by STOP and OUTPUT; caught by the procedure that runs them. */
class Unwind {
    readonly value: Value | undefined;
    readonly at: Position;
    constructor(value: Value | undefined, at: Position) {
        this.value = value;
        this.at = at;
    }
}

/** BYE: ends the whole program quietly. */
class Bye {}

// ------------------------------------------------------------------ tokens
type Position = { line: number; column: number };

type Token =
    | ({ kind: "number"; value: number; text: string } & Position)
    | ({ kind: "word"; text: string } & Position)
    | ({ kind: "quoted"; text: string } & Position)
    | ({ kind: "variable"; text: string } & Position)
    | ({ kind: "list"; items: Token[]; text: string } & Position)
    | ({ kind: "open" | "close"; text: string } & Position)
    | ({ kind: "infix"; text: string; tight: boolean } & Position);

type Value = number | string | boolean | Value[];

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

/** Splits source text into tokens; [ … ] become nested list tokens. */
function tokenize(source: string, say: (key: MessageKey, vars?: Record<string, string | number>) => string): Token[] {
    const root: Token[] = [];
    const stack: Array<{ items: Token[]; open: Position }> = [];
    let items = root;
    let line = 1;
    let column = 1;
    let index = 0;
    const length = source.length;
    const advance = (count: number) => {
        for (let step = 0; step < count; step += 1) {
            if (source[index] === "\n") {
                line += 1;
                column = 1;
            } else column += 1;
            index += 1;
        }
    };
    const isDelimiter = (char: string | undefined) => char === undefined || /[\s[\]()]/.test(char);
    while (index < length) {
        const char = source[index];
        if (char === ";") {
            while (index < length && source[index] !== "\n") advance(1);
            continue;
        }
        if (/\s/.test(char)) {
            advance(1);
            continue;
        }
        const at = { line, column };
        if (char === "[") {
            const list: Token = { kind: "list", items: [], text: "[", ...at };
            items.push(list);
            stack.push({ items, open: at });
            items = (list as { items: Token[] }).items;
            advance(1);
            continue;
        }
        if (char === "]") {
            const parent = stack.pop();
            if (!parent) throw new LogoError(say("unexpected", { text: "]" }), at);
            items = parent.items;
            advance(1);
            continue;
        }
        if (char === "(" || char === ")") {
            items.push({ kind: char === "(" ? "open" : "close", text: char, ...at });
            advance(1);
            continue;
        }
        if (char === "\"") {
            let end = index + 1;
            while (end < length && !isDelimiter(source[end])) end += 1;
            const text = source.slice(index + 1, end);
            items.push({ kind: "quoted", text, ...at });
            advance(end - index);
            continue;
        }
        if (char === ":") {
            let end = index + 1;
            while (end < length && /[\p{L}\p{N}_.?!]/u.test(source[end])) end += 1;
            items.push({ kind: "variable", text: source.slice(index + 1, end), ...at });
            advance(Math.max(1, end - index));
            continue;
        }
        const two = source.slice(index, index + 2);
        if (two === "<=" || two === ">=" || two === "<>") {
            items.push({ kind: "infix", text: two, tight: false, ...at });
            advance(2);
            continue;
        }
        if (char === "-") {
            // "fd -10" and "[-10 20]": a minus right before a number, after a space, is a negative number.
            const previous = source[index - 1];
            const next = source[index + 1];
            const afterSpace = previous === undefined || /[\s[(]/.test(previous);
            const number = /^-(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(source.slice(index));
            if (afterSpace && number && isDelimiterOrOperator(source[index + number[0].length])) {
                items.push({ kind: "number", value: Number(number[0]), text: number[0], ...at });
                advance(number[0].length);
                continue;
            }
            items.push({ kind: "infix", text: "-", tight: afterSpace && next !== undefined && !/\s/.test(next), ...at });
            advance(1);
            continue;
        }
        if ("+*/=<>".includes(char)) {
            items.push({ kind: "infix", text: char, tight: false, ...at });
            advance(1);
            continue;
        }
        const number = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(source.slice(index));
        if (number && isDelimiterOrOperator(source[index + number[0].length])) {
            items.push({ kind: "number", value: Number(number[0]), text: number[0], ...at });
            advance(number[0].length);
            continue;
        }
        // A word: letters, digits and a few marks; "draw-square" keeps its hyphen, "a-1" does not.
        let end = index + 1;
        while (end < length) {
            const next = source[end];
            if (/[\p{L}\p{N}_.?!#$%&@'~^|{},\\]/u.test(next)) end += 1;
            else if (next === "-" && /\p{L}/u.test(source[end + 1] ?? "")) end += 1;
            else break;
        }
        items.push({ kind: "word", text: source.slice(index, end), ...at });
        advance(end - index);
    }
    if (stack.length) throw new LogoError(say("missingBracket"), stack[stack.length - 1].open);
    return root;
}

function isDelimiterOrOperator(char: string | undefined) {
    return char === undefined || /[\s[\]()+\-*/=<>]/.test(char);
}

// ------------------------------------------------------------------ colours
const PALETTE = ["#000000", "#0000FF", "#00FF00", "#00FFFF", "#FF0000", "#FF00FF", "#FFFF00", "#FFFFFF", "#9B6024", "#C5885B", "#64A240", "#78BBBB", "#FF957E", "#904CFF", "#FFA300", "#B7B7B7"];

const COLORS: Record<string, string> = {
    black: "#000000", white: "#FFFFFF", red: "#E11D48", green: "#16A34A", blue: "#2563EB", yellow: "#EAB308", orange: "#F97316",
    purple: "#9333EA", pink: "#EC4899", brown: "#92400E", gray: "#6B7280", grey: "#6B7280", cyan: "#06B6D4", magenta: "#D946EF",
    lime: "#84CC16", navy: "#1E3A8A", teal: "#0D9488", violet: "#8B5CF6", gold: "#CA8A04", silver: "#A1A1AA", indigo: "#4F46E5",
    maroon: "#7F1D1D", olive: "#4D7C0F", turquoise: "#14B8A6", salmon: "#FA8072", coral: "#FF7F50", tan: "#D2B48C", aqua: "#22D3EE",
    // Turkish names
    siyah: "#000000", beyaz: "#FFFFFF", "kırmızı": "#E11D48", "yeşil": "#16A34A", mavi: "#2563EB", "sarı": "#EAB308", turuncu: "#F97316",
    mor: "#9333EA", pembe: "#EC4899", kahverengi: "#92400E", gri: "#6B7280", turkuaz: "#14B8A6", lacivert: "#1E3A8A", altın: "#CA8A04",
};

// ------------------------------------------------------------------ helpers
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function formatNumber(value: number): string {
    if (Number.isInteger(value)) return String(value);
    if (!Number.isFinite(value)) return String(value);
    return String(Number(value.toPrecision(12)));
}

/** Logo's printed form of a value; lists keep brackets inside other lists only. */
function show(value: Value, brackets: boolean): string {
    if (typeof value === "number") return formatNumber(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (Array.isArray(value)) {
        const inner = value.map((item) => show(item, true)).join(" ");
        return brackets ? `[${inner}]` : inner;
    }
    return value;
}

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

/** List values remember the tokens they were written with, so REPEAT/IF/RUN keep line numbers. */
const LIST_TOKENS = new WeakMap<Value[], Token[]>();

function listValue(token: Extract<Token, { kind: "list" }>): Value[] {
    const value = token.items.map((item): Value => {
        switch (item.kind) {
            case "number": return item.value;
            case "list": return listValue(item);
            case "quoted": return `"${item.text}`;
            case "variable": return `:${item.text}`;
            default: return item.text;
        }
    });
    LIST_TOKENS.set(value, token.items);
    return value;
}

type Procedure = { name: string; params: string[]; body: Token[]; at: Position };

type Builtin = {
    arity: number;
    /** Most inputs accepted inside parentheses, e.g. (SUM 1 2 3); defaults to `arity`. */
    max?: number;
    /** Fewest inputs accepted inside parentheses; defaults to `arity`. */
    min?: number;
    fn: (args: Value[], at: Position, name: string) => Value | undefined;
};

type Cursor = { tokens: Token[]; index: number };

const DEFAULTS = { maxSteps: 200_000, maxSegments: 50_000, maxDepth: 400, maxOutput: 20_000 };

class Interpreter {
    private readonly locale: LogoLocale;
    private readonly maxSteps: number;
    private readonly maxSegments: number;
    private readonly maxDepth: number;
    private readonly maxOutput: number;
    private readonly random: () => number;
    private readonly builtins = new Map<string, Builtin>();
    private readonly procedures = new Map<string, Procedure>();
    private readonly frames: Array<Map<string, Value>> = [new Map()];
    private readonly repcounts: number[] = [];
    private depth = 0;
    steps = 0;
    output = "";
    private outputFull = false;
    segments: LogoSegment[] = [];
    labels: LogoLabel[] = [];
    turtle: LogoTurtle = { x: 0, y: 0, heading: 0, visible: true, color: "#000000" };
    background = "#FFFFFF";
    private penDown = true;
    private penWidth = 2;

    constructor(options: LogoOptions) {
        this.locale = options.locale === "tr" ? "tr" : "en";
        this.maxSteps = options.maxSteps ?? DEFAULTS.maxSteps;
        this.maxSegments = options.maxSegments ?? DEFAULTS.maxSegments;
        this.maxDepth = options.maxDepth ?? DEFAULTS.maxDepth;
        this.maxOutput = options.maxOutput ?? DEFAULTS.maxOutput;
        this.random = mulberry32(options.seed ?? 1);
        this.installBuiltins();
    }

    say(key: MessageKey, vars: Record<string, string | number> = {}) {
        return MESSAGES[key][this.locale].replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
    }

    private fail(key: MessageKey, vars: Record<string, string | number>, at?: Position): LogoError {
        return new LogoError(this.say(key, vars), at);
    }

    // ------------------------------------------------------------ program
    run(source: string) {
        const tokens = tokenize(source, (key, vars) => this.say(key, vars));
        const main = this.collectProcedures(tokens);
        try {
            this.runTokens(main);
        } catch (error) {
            if (error instanceof Unwind) {
                // STOP at the top level ends the program; OUTPUT there is a mistake.
                if (error.value !== undefined) throw this.fail("outputPlace", {}, error.at);
                return;
            }
            if (error instanceof Bye) return;
            throw error;
        }
    }

    /** Takes every TO … END definition out of the program (procedures may be used before they are defined). */
    private collectProcedures(tokens: Token[]): Token[] {
        const main: Token[] = [];
        for (let index = 0; index < tokens.length; index += 1) {
            const token = tokens[index];
            if (token.kind !== "word" || token.text.toLowerCase() !== "to") {
                if (token.kind === "word" && token.text.toLowerCase() === "end") throw this.fail("stray", { name: "END" }, token);
                main.push(token);
                continue;
            }
            const nameToken = tokens[index + 1];
            if (!nameToken || nameToken.kind !== "word" || nameToken.line !== token.line) throw this.fail("toName", {}, token);
            const name = nameToken.text.toLowerCase();
            if (this.builtins.has(name) || name === "to" || name === "end") throw this.fail("primitive", { name: nameToken.text.toUpperCase() }, nameToken);
            const params: string[] = [];
            let cursor = index + 2;
            while (cursor < tokens.length && tokens[cursor].kind === "variable" && tokens[cursor].line === token.line) {
                params.push((tokens[cursor] as { text: string }).text.toLowerCase());
                cursor += 1;
            }
            const body: Token[] = [];
            let closed = false;
            for (; cursor < tokens.length; cursor += 1) {
                const item = tokens[cursor];
                if (item.kind === "word" && item.text.toLowerCase() === "end") {
                    closed = true;
                    break;
                }
                if (item.kind === "word" && item.text.toLowerCase() === "to") throw this.fail("noEnd", { name: nameToken.text }, token);
                body.push(item);
            }
            if (!closed) throw this.fail("noEnd", { name: nameToken.text }, token);
            this.procedures.set(name, { name: nameToken.text, params, body, at: token });
            index = cursor;
        }
        return main;
    }

    // ------------------------------------------------------------ evaluation
    private tick(at: Position) {
        this.steps += 1;
        if (this.steps > this.maxSteps) throw this.fail("stepLimit", { count: this.maxSteps.toLocaleString(this.locale === "tr" ? "tr-TR" : "en-US") }, at);
    }

    /** Runs an instruction list: every expression must be a command (its value is not used). */
    private runTokens(tokens: Token[]) {
        const cursor: Cursor = { tokens, index: 0 };
        while (cursor.index < tokens.length) {
            const start = tokens[cursor.index];
            this.tick(start);
            const value = this.expression(cursor);
            if (value !== undefined) throw this.fail("noUse", { value: show(value, true) }, start);
        }
    }

    private runList(list: Value, at: Position, name: string) {
        if (!Array.isArray(list)) throw this.fail("badInput", { name, value: show(list, true) }, at);
        this.runTokens(this.tokensOf(list, at));
    }

    private tokensOf(list: Value[], at: Position): Token[] {
        const known = LIST_TOKENS.get(list);
        if (known) return known;
        // A list built at run time (LIST, SENTENCE…): read it again, reporting errors at the caller.
        const text = list.map((item) => show(item, true)).join(" ");
        try {
            return tokenize(text, (key, vars) => this.say(key, vars)).map((token) => relocate(token, at));
        } catch (error) {
            if (error instanceof LogoError) throw new LogoError(error.message, at);
            throw error;
        }
    }

    private expression(cursor: Cursor): Value | undefined {
        let left = this.additive(cursor);
        for (;;) {
            const token = cursor.tokens[cursor.index];
            if (!token || token.kind !== "infix" || !["=", "<", ">", "<=", ">=", "<>"].includes(token.text)) return left;
            cursor.index += 1;
            const right = this.additive(cursor);
            left = this.compare(token.text, this.operand(left, token), this.operand(right, token), token);
        }
    }

    private additive(cursor: Cursor): Value | undefined {
        let left = this.multiplicative(cursor);
        for (;;) {
            const token = cursor.tokens[cursor.index];
            if (!token || token.kind !== "infix" || (token.text !== "+" && token.text !== "-") || (token.text === "-" && token.tight)) return left;
            cursor.index += 1;
            const right = this.multiplicative(cursor);
            const a = this.number(this.operand(left, token), token.text, token);
            const b = this.number(this.operand(right, token), token.text, token);
            left = token.text === "+" ? a + b : a - b;
        }
    }

    private multiplicative(cursor: Cursor): Value | undefined {
        let left = this.unary(cursor);
        for (;;) {
            const token = cursor.tokens[cursor.index];
            if (!token || token.kind !== "infix" || (token.text !== "*" && token.text !== "/")) return left;
            cursor.index += 1;
            const right = this.unary(cursor);
            const a = this.number(this.operand(left, token), token.text, token);
            const b = this.number(this.operand(right, token), token.text, token);
            if (token.text === "/" && b === 0) throw this.fail("divide", {}, token);
            left = token.text === "*" ? a * b : a / b;
        }
    }

    private unary(cursor: Cursor): Value | undefined {
        const token = cursor.tokens[cursor.index];
        if (token && token.kind === "infix" && token.text === "-") {
            cursor.index += 1;
            const value = this.unary(cursor);
            return -this.number(this.operand(value, token), "-", token);
        }
        return this.primary(cursor);
    }

    /** An operand of an infix operator must be a value. */
    private operand(value: Value | undefined, at: Extract<Token, { kind: "infix" }>): Value {
        if (value === undefined) throw this.fail("notEnough", { name: at.text }, at);
        return value;
    }

    private primary(cursor: Cursor): Value | undefined {
        const token = cursor.tokens[cursor.index];
        if (!token) {
            const last = cursor.tokens[cursor.tokens.length - 1];
            throw this.fail("unexpected", { text: this.locale === "tr" ? "satır sonu" : "end of line" }, last);
        }
        cursor.index += 1;
        switch (token.kind) {
            case "number": return token.value;
            case "quoted": return token.text;
            case "list": return listValue(token);
            case "variable": return this.lookup(token.text, token);
            case "infix": throw this.fail("unexpected", { text: token.text }, token);
            case "close": throw this.fail("unexpected", { text: ")" }, token);
            case "open": {
                const next = cursor.tokens[cursor.index];
                if (next && next.kind === "word" && !NUMBER.test(next.text)) {
                    cursor.index += 1;
                    const value = this.call(next.text, next, cursor, true);
                    const close = cursor.tokens[cursor.index];
                    if (!close || close.kind !== "close") {
                        if (!close) throw this.fail("missingParen", {}, token);
                        throw this.fail("tooMany", { name: next.text.toUpperCase() }, close);
                    }
                    cursor.index += 1;
                    // "(fd 10) rt 90": allow an infix continuation such as (sum 1 2) * 3.
                    return value;
                }
                const value = this.expression(cursor);
                const close = cursor.tokens[cursor.index];
                if (!close || close.kind !== "close") throw this.fail("missingParen", {}, token);
                cursor.index += 1;
                return value;
            }
            case "word": {
                if (NUMBER.test(token.text)) return Number(token.text);
                return this.call(token.text, token, cursor, false);
            }
        }
    }

    private lookup(name: string, at: Position): Value {
        const key = name.toLowerCase();
        for (let index = this.frames.length - 1; index >= 0; index -= 1) {
            const frame = this.frames[index];
            if (frame.has(key)) return frame.get(key)!;
        }
        throw this.fail("noValue", { name }, at);
    }

    private assign(name: string, value: Value) {
        const key = name.toLowerCase();
        for (let index = this.frames.length - 1; index >= 0; index -= 1) {
            if (this.frames[index].has(key)) {
                this.frames[index].set(key, value);
                return;
            }
        }
        this.frames[0].set(key, value);
    }

    /** Reads the inputs of a procedure and calls it. */
    private call(rawName: string, at: Position, cursor: Cursor, parenthesized: boolean): Value | undefined {
        const name = rawName.toLowerCase();
        if (name === "to") throw this.fail("toPlace", {}, at);
        if (name === "end") throw this.fail("stray", { name: "END" }, at);
        const builtin = this.builtins.get(name);
        const procedure = builtin ? undefined : this.procedures.get(name);
        if (!builtin && !procedure) throw this.fail("unknown", { name: rawName.toUpperCase() }, at);
        const arity = builtin ? builtin.arity : procedure!.params.length;
        const max = builtin ? builtin.max ?? builtin.arity : arity;
        const min = builtin ? builtin.min ?? arity : arity;
        const args: Value[] = [];
        const display = rawName.toUpperCase();
        const readInput = () => {
            const next = cursor.tokens[cursor.index];
            if (!next || next.kind === "close") throw this.fail("notEnough", { name: display }, at);
            const inputToken = next;
            const value = this.expression(cursor);
            if (value === undefined) {
                const producer = inputToken.kind === "word" ? inputToken.text.toUpperCase() : inputToken.kind === "open" ? "( )" : show(inputToken.text, false);
                throw this.fail("noOutput", { name: producer, caller: display }, inputToken);
            }
            args.push(value);
        };
        if (parenthesized && max !== arity) {
            while (cursor.tokens[cursor.index] && cursor.tokens[cursor.index].kind !== "close") {
                if (args.length >= max) break;
                readInput();
            }
            if (args.length < min) throw this.fail("notEnough", { name: display }, at);
        } else {
            for (let input = 0; input < arity; input += 1) readInput();
        }
        this.tick(at);
        if (builtin) return builtin.fn(args, at, display);
        return this.callProcedure(procedure!, args, at);
    }

    private callProcedure(procedure: Procedure, args: Value[], at: Position): Value | undefined {
        if (this.depth >= this.maxDepth) throw this.fail("tooDeep", { count: this.maxDepth }, at);
        const frame = new Map<string, Value>();
        procedure.params.forEach((param, index) => frame.set(param, args[index]));
        this.frames.push(frame);
        this.depth += 1;
        try {
            this.runTokens(procedure.body);
            return undefined;
        } catch (error) {
            if (error instanceof Unwind) return error.value;
            throw error;
        } finally {
            this.depth -= 1;
            this.frames.pop();
        }
    }

    // ------------------------------------------------------------ values
    private number(value: Value, name: string, at: Position): number {
        if (typeof value === "number") return value;
        if (typeof value === "string" && NUMBER.test(value)) return Number(value);
        throw this.fail("badInput", { name: name.toUpperCase(), value: show(value, true) }, at);
    }

    private boolean(value: Value, name: string, at: Position): boolean {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
            const lower = value.toLowerCase();
            if (lower === "true") return true;
            if (lower === "false") return false;
        }
        throw this.fail("badInput", { name, value: show(value, true) }, at);
    }

    private list(value: Value, name: string, at: Position): Value[] {
        if (Array.isArray(value)) return value;
        throw this.fail("badInput", { name, value: show(value, true) }, at);
    }

    private equal(a: Value, b: Value): boolean {
        const numberA = typeof a === "number" ? a : typeof a === "string" && NUMBER.test(a) ? Number(a) : null;
        const numberB = typeof b === "number" ? b : typeof b === "string" && NUMBER.test(b) ? Number(b) : null;
        if (numberA !== null && numberB !== null) return Math.abs(numberA - numberB) < 1e-12;
        if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => this.equal(item, b[index]));
        return show(a, true).toLowerCase() === show(b, true).toLowerCase();
    }

    private compare(operator: string, a: Value, b: Value, at: Position): boolean {
        if (operator === "=") return this.equal(a, b);
        if (operator === "<>") return !this.equal(a, b);
        const x = this.number(a, operator, at);
        const y = this.number(b, operator, at);
        switch (operator) {
            case "<": return x < y;
            case ">": return x > y;
            case "<=": return x <= y;
            default: return x >= y;
        }
    }

    private color(value: Value, name: string, at: Position): string {
        if (typeof value === "number" || (typeof value === "string" && NUMBER.test(value))) {
            const index = Math.round(Number(value));
            if (index >= 0 && index < PALETTE.length) return PALETTE[index];
        } else if (typeof value === "string") {
            const lower = value.toLocaleLowerCase(this.locale === "tr" ? "tr-TR" : "en-US");
            if (COLORS[lower] ?? COLORS[value.toLowerCase()]) return COLORS[lower] ?? COLORS[value.toLowerCase()];
            if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
            if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split("").map((digit) => digit + digit).join("")}`.toUpperCase();
        } else if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" || (typeof item === "string" && NUMBER.test(item)))) {
            const channels = value.map((item) => Math.max(0, Math.min(255, Math.round(Number(item)))));
            return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
        }
        throw this.fail("badInput", { name, value: show(value, true) }, at);
    }

    private print(text: string) {
        if (this.outputFull) return;
        if (this.output.length + text.length > this.maxOutput) {
            this.output += `${text.slice(0, Math.max(0, this.maxOutput - this.output.length))}\n${this.say("outputLimit")}\n`;
            this.outputFull = true;
            return;
        }
        this.output += text;
    }

    // ------------------------------------------------------------ turtle
    private line(x: number, y: number, at: Position) {
        const { x: x1, y: y1 } = this.turtle;
        if (this.penDown && (x !== x1 || y !== y1)) {
            if (this.segments.length >= this.maxSegments) throw this.fail("tooLarge", { count: this.maxSegments }, at);
            this.segments.push({ x1, y1, x2: x, y2: y, color: this.turtle.color, width: this.penWidth });
        }
        this.turtle.x = x;
        this.turtle.y = y;
    }

    private move(distance: number, at: Position) {
        const radians = toRadians(this.turtle.heading);
        this.line(clean(this.turtle.x + distance * Math.sin(radians)), clean(this.turtle.y + distance * Math.cos(radians)), at);
    }

    private turn(degrees: number) {
        this.turtle.heading = ((this.turtle.heading + degrees) % 360 + 360) % 360;
    }

    /** An arc of `angle` degrees around the turtle, clockwise from its heading; the turtle stays put. */
    private arc(angle: number, radius: number, at: Position) {
        if (!this.penDown || radius === 0 || angle === 0) return;
        const sweep = Math.max(-3600, Math.min(3600, angle));
        const steps = Math.max(4, Math.ceil(Math.abs(sweep) / 5));
        const { x, y, heading } = this.turtle;
        let previous: { x: number; y: number } | null = null;
        for (let step = 0; step <= steps; step += 1) {
            const radians = toRadians(heading + (sweep * step) / steps);
            const point = { x: clean(x + radius * Math.sin(radians)), y: clean(y + radius * Math.cos(radians)) };
            if (previous) {
                if (this.segments.length >= this.maxSegments) throw this.fail("tooLarge", { count: this.maxSegments }, at);
                this.segments.push({ x1: previous.x, y1: previous.y, x2: point.x, y2: point.y, color: this.turtle.color, width: this.penWidth });
            }
            previous = point;
        }
    }

    private position(value: Value, name: string, at: Position): [number, number] {
        const list = this.list(value, name, at);
        if (list.length !== 2) throw this.fail("badInput", { name, value: show(value, true) }, at);
        return [this.number(list[0], name, at), this.number(list[1], name, at)];
    }

    // ------------------------------------------------------------ primitives
    private define(names: string[], arity: number, fn: Builtin["fn"], max?: number, min?: number) {
        for (const name of names) this.builtins.set(name, { arity, fn, max, min });
    }

    private installBuiltins() {
        const num = (value: Value, name: string, at: Position) => this.number(value, name, at);
        // Turtle motion
        this.define(["forward", "fd"], 1, ([distance], at, name) => { this.move(num(distance, name, at), at); return undefined; });
        this.define(["back", "bk"], 1, ([distance], at, name) => { this.move(-num(distance, name, at), at); return undefined; });
        this.define(["right", "rt"], 1, ([angle], at, name) => { this.turn(num(angle, name, at)); return undefined; });
        this.define(["left", "lt"], 1, ([angle], at, name) => { this.turn(-num(angle, name, at)); return undefined; });
        this.define(["penup", "pu"], 0, () => { this.penDown = false; return undefined; });
        this.define(["pendown", "pd"], 0, () => { this.penDown = true; return undefined; });
        this.define(["home"], 0, (_, at) => { this.line(0, 0, at); this.turtle.heading = 0; return undefined; });
        this.define(["clearscreen", "cs"], 0, () => {
            this.segments = [];
            this.labels = [];
            this.turtle.x = 0;
            this.turtle.y = 0;
            this.turtle.heading = 0;
            return undefined;
        });
        this.define(["clean"], 0, () => { this.segments = []; this.labels = []; return undefined; });
        this.define(["setpos", "setposition"], 1, ([position], at, name) => { const [x, y] = this.position(position, name, at); this.line(x, y, at); return undefined; });
        this.define(["setxy"], 2, ([x, y], at, name) => { this.line(num(x, name, at), num(y, name, at), at); return undefined; });
        this.define(["setx"], 1, ([x], at, name) => { this.line(num(x, name, at), this.turtle.y, at); return undefined; });
        this.define(["sety"], 1, ([y], at, name) => { this.line(this.turtle.x, num(y, name, at), at); return undefined; });
        this.define(["setheading", "seth"], 1, ([angle], at, name) => { this.turtle.heading = 0; this.turn(num(angle, name, at)); return undefined; });
        this.define(["setpencolor", "setpc", "setcolor"], 1, ([color], at, name) => { this.turtle.color = this.color(color, name, at); return undefined; });
        this.define(["setpensize", "setwidth", "setpw"], 1, ([size], at, name) => {
            const width = Array.isArray(size) && size.length ? num(size[0], name, at) : num(size, name, at);
            if (!(width > 0)) throw this.fail("badInput", { name, value: show(size, true) }, at);
            this.penWidth = Math.min(100, width);
            return undefined;
        });
        this.define(["setbackground", "setbg", "setscreencolor", "setsc"], 1, ([color], at, name) => { this.background = this.color(color, name, at); return undefined; });
        this.define(["hideturtle", "ht"], 0, () => { this.turtle.visible = false; return undefined; });
        this.define(["showturtle", "st"], 0, () => { this.turtle.visible = true; return undefined; });
        this.define(["arc"], 2, ([angle, radius], at, name) => { this.arc(num(angle, name, at), num(radius, name, at), at); return undefined; });
        this.define(["circle"], 1, ([radius], at, name) => { this.arc(360, num(radius, name, at), at); return undefined; });
        this.define(["label"], 1, ([text]) => {
            this.labels.push({ x: this.turtle.x, y: this.turtle.y, text: show(text, false), color: this.turtle.color, size: 14 });
            return undefined;
        });
        this.define(["pos"], 0, () => [this.turtle.x, this.turtle.y]);
        this.define(["xcor"], 0, () => this.turtle.x);
        this.define(["ycor"], 0, () => this.turtle.y);
        this.define(["heading"], 0, () => this.turtle.heading);
        this.define(["pendownp", "pendown?"], 0, () => this.penDown);
        this.define(["towards"], 1, ([position], at, name) => {
            const [x, y] = this.position(position, name, at);
            const angle = toDegrees(Math.atan2(x - this.turtle.x, y - this.turtle.y));
            return clean((angle + 360) % 360);
        });

        // Control
        this.define(["repeat"], 2, ([count, list], at, name) => {
            const times = num(count, name, at);
            this.list(list, name, at);
            this.repcounts.push(0);
            try {
                for (let index = 1; index <= times; index += 1) {
                    this.repcounts[this.repcounts.length - 1] = index;
                    this.runList(list, at, name);
                }
            } finally {
                this.repcounts.pop();
            }
            return undefined;
        });
        this.define(["repcount", "#"], 0, () => (this.repcounts.length ? this.repcounts[this.repcounts.length - 1] : -1));
        this.define(["if"], 2, ([condition, list], at, name) => {
            if (this.boolean(condition, name, at)) this.runList(list, at, name);
            return undefined;
        });
        this.define(["ifelse"], 3, ([condition, yes, no], at, name) => {
            const branch = this.boolean(condition, name, at) ? yes : no;
            return this.runBranch(branch, at, name);
        });
        this.define(["while"], 2, ([condition, list], at, name) => {
            for (;;) {
                const test = Array.isArray(condition) ? this.evaluateList(condition, at, name) : condition;
                if (!this.boolean(test, name, at)) break;
                this.runList(list, at, name);
                this.tick(at);
            }
            return undefined;
        });
        this.define(["for"], 2, ([control, list], at, name) => {
            const spec = this.list(control, name, at);
            if (spec.length < 3 || typeof spec[0] !== "string") throw this.fail("badInput", { name, value: show(control, true) }, at);
            const variable = String(spec[0]).replace(/^:/, "").toLowerCase();
            const value = (item: Value) => (Array.isArray(item) ? this.evaluateList(item, at, name) : typeof item === "string" && item.startsWith(":") ? this.lookup(item.slice(1), at) : item);
            const start = num(value(spec[1]), name, at);
            const end = num(value(spec[2]), name, at);
            const step = spec.length > 3 ? num(value(spec[3]), name, at) : start <= end ? 1 : -1;
            if (step === 0) throw this.fail("badInput", { name, value: show(control, true) }, at);
            const frame = new Map<string, Value>();
            this.frames.push(frame);
            try {
                for (let index = start; step > 0 ? index <= end + 1e-9 : index >= end - 1e-9; index += step) {
                    frame.set(variable, clean(index));
                    this.runList(list, at, name);
                    this.tick(at);
                }
            } finally {
                this.frames.pop();
            }
            return undefined;
        });
        this.define(["run"], 1, ([list], at, name) => this.runBranch(list, at, name));
        this.define(["stop"], 0, (_, at) => { throw new Unwind(undefined, at); });
        this.define(["output", "op"], 1, ([value], at) => {
            if (!this.depth) throw this.fail("outputPlace", {}, at);
            throw new Unwind(value, at);
        });
        this.define(["bye"], 0, () => { throw new Bye(); });
        this.define(["wait"], 1, () => undefined);

        // Variables
        this.define(["make"], 2, ([name, value], at, display) => {
            if (typeof name !== "string" || !name) throw this.fail("badInput", { name: display, value: show(name, true) }, at);
            this.assign(name, value);
            return undefined;
        });
        this.define(["name"], 2, ([value, name], at, display) => {
            if (typeof name !== "string" || !name) throw this.fail("badInput", { name: display, value: show(name, true) }, at);
            this.assign(name, value);
            return undefined;
        });
        this.define(["local"], 1, ([names], at, display) => {
            const list = Array.isArray(names) ? names : [names];
            const frame = this.frames[this.frames.length - 1];
            for (const item of list) {
                if (typeof item !== "string") throw this.fail("badInput", { name: display, value: show(item, true) }, at);
                if (!frame.has(item.toLowerCase())) frame.set(item.toLowerCase(), []);
            }
            return undefined;
        });
        this.define(["thing"], 1, ([name], at, display) => {
            if (typeof name !== "string") throw this.fail("badInput", { name: display, value: show(name, true) }, at);
            return this.lookup(name, at);
        });

        // Arithmetic
        this.define(["sum"], 2, (args, at, name) => args.reduce<number>((total, value) => total + num(value, name, at), 0), 32, 0);
        this.define(["product"], 2, (args, at, name) => args.reduce<number>((total, value) => total * num(value, name, at), 1), 32, 0);
        this.define(["difference"], 2, ([a, b], at, name) => num(a, name, at) - num(b, name, at));
        this.define(["quotient"], 2, ([a, b], at, name) => {
            const divisor = num(b, name, at);
            if (divisor === 0) throw this.fail("divide", {}, at);
            return num(a, name, at) / divisor;
        });
        this.define(["remainder"], 2, ([a, b], at, name) => {
            const divisor = num(b, name, at);
            if (divisor === 0) throw this.fail("divide", {}, at);
            return num(a, name, at) % divisor;
        });
        this.define(["modulo"], 2, ([a, b], at, name) => {
            const divisor = num(b, name, at);
            if (divisor === 0) throw this.fail("divide", {}, at);
            const value = num(a, name, at) % divisor;
            return value !== 0 && Math.sign(value) !== Math.sign(divisor) ? value + divisor : value;
        });
        this.define(["power"], 2, ([a, b], at, name) => num(a, name, at) ** num(b, name, at));
        this.define(["minus"], 1, ([a], at, name) => -num(a, name, at));
        this.define(["sqrt"], 1, ([a], at, name) => {
            const value = num(a, name, at);
            if (value < 0) throw this.fail("badInput", { name, value: show(a, true) }, at);
            return Math.sqrt(value);
        });
        this.define(["abs"], 1, ([a], at, name) => Math.abs(num(a, name, at)));
        this.define(["int"], 1, ([a], at, name) => Math.trunc(num(a, name, at)));
        this.define(["round"], 1, ([a], at, name) => Math.round(num(a, name, at)));
        this.define(["sin"], 1, ([a], at, name) => clean(Math.sin(toRadians(num(a, name, at)))));
        this.define(["cos"], 1, ([a], at, name) => clean(Math.cos(toRadians(num(a, name, at)))));
        this.define(["tan"], 1, ([a], at, name) => clean(Math.tan(toRadians(num(a, name, at)))));
        this.define(["arctan"], 1, (args, at, name) => (args.length === 2
            ? clean((toDegrees(Math.atan2(num(args[1], name, at), num(args[0], name, at))) + 360) % 360)
            : toDegrees(Math.atan(num(args[0], name, at)))), 2);
        this.define(["exp"], 1, ([a], at, name) => Math.exp(num(a, name, at)));
        this.define(["ln"], 1, ([a], at, name) => {
            const value = num(a, name, at);
            if (value <= 0) throw this.fail("badInput", { name, value: show(a, true) }, at);
            return Math.log(value);
        });
        this.define(["pi"], 0, () => Math.PI);
        this.define(["random"], 1, (args, at, name) => {
            if (args.length === 2) {
                const low = Math.ceil(num(args[0], name, at));
                const high = Math.floor(num(args[1], name, at));
                if (high < low) throw this.fail("badInput", { name, value: show(args[1], true) }, at);
                return low + Math.floor(this.random() * (high - low + 1));
            }
            const limit = Math.floor(num(args[0], name, at));
            if (limit <= 0) throw this.fail("badInput", { name, value: show(args[0], true) }, at);
            return Math.floor(this.random() * limit);
        }, 2, 1);
        this.define(["pick"], 1, ([list], at, name) => {
            const items = typeof list === "string" ? [...list] : this.list(list, name, at);
            if (!items.length) throw this.fail("badInput", { name, value: show(list, true) }, at);
            return items[Math.floor(this.random() * items.length)];
        });

        // Logic and comparison
        this.define(["equalp", "equal?"], 2, ([a, b]) => this.equal(a, b));
        this.define(["notequalp", "notequal?"], 2, ([a, b]) => !this.equal(a, b));
        this.define(["lessp", "less?"], 2, ([a, b], at) => this.compare("<", a, b, at));
        this.define(["greaterp", "greater?"], 2, ([a, b], at) => this.compare(">", a, b, at));
        this.define(["true"], 0, () => true);
        this.define(["false"], 0, () => false);
        this.define(["not"], 1, ([a], at, name) => !this.boolean(a, name, at));
        this.define(["and"], 2, (args, at, name) => args.map((value) => this.boolean(value, name, at)).every(Boolean), 32, 0);
        this.define(["or"], 2, (args, at, name) => args.map((value) => this.boolean(value, name, at)).some(Boolean), 32, 0);

        // Words and lists
        this.define(["word"], 2, (args) => args.map((value) => show(value, true)).join(""), 32, 0);
        this.define(["list"], 2, (args) => [...args], 32, 0);
        this.define(["sentence", "se"], 2, (args) => args.flatMap((value) => (Array.isArray(value) ? value : [value])), 32, 0);
        this.define(["fput"], 2, ([item, list], at, name) => [item, ...this.list(list, name, at)]);
        this.define(["lput"], 2, ([item, list], at, name) => [...this.list(list, name, at), item]);
        const sequence = (value: Value, name: string, at: Position): Value[] => {
            if (Array.isArray(value)) return value;
            const text = show(value, false);
            if (!text) throw this.fail("badInput", { name, value: "\"\"" }, at);
            return [...text];
        };
        const rebuild = (original: Value, items: Value[]): Value => (Array.isArray(original) ? items : items.join(""));
        this.define(["first"], 1, ([value], at, name) => {
            const items = sequence(value, name, at);
            if (!items.length) throw this.fail("badInput", { name, value: "[]" }, at);
            return items[0];
        });
        this.define(["last"], 1, ([value], at, name) => {
            const items = sequence(value, name, at);
            if (!items.length) throw this.fail("badInput", { name, value: "[]" }, at);
            return items[items.length - 1];
        });
        this.define(["butfirst", "bf"], 1, ([value], at, name) => {
            const items = sequence(value, name, at);
            if (!items.length) throw this.fail("badInput", { name, value: "[]" }, at);
            return rebuild(value, items.slice(1));
        });
        this.define(["butlast", "bl"], 1, ([value], at, name) => {
            const items = sequence(value, name, at);
            if (!items.length) throw this.fail("badInput", { name, value: "[]" }, at);
            return rebuild(value, items.slice(0, -1));
        });
        this.define(["item"], 2, ([index, value], at, name) => {
            const items = sequence(value, name, at);
            const position = Math.floor(num(index, name, at));
            if (position < 1 || position > items.length) throw this.fail("badInput", { name, value: show(index, true) }, at);
            return items[position - 1];
        });
        this.define(["count"], 1, ([value]) => (Array.isArray(value) ? value.length : show(value, false).length));
        this.define(["emptyp", "empty?"], 1, ([value]) => (Array.isArray(value) ? value.length === 0 : show(value, false) === ""));
        this.define(["memberp", "member?"], 2, ([item, value]) => (Array.isArray(value) ? value.some((element) => this.equal(element, item)) : show(value, false).includes(show(item, false))));
        this.define(["numberp", "number?"], 1, ([value]) => typeof value === "number" || (typeof value === "string" && NUMBER.test(value)));
        this.define(["wordp", "word?"], 1, ([value]) => !Array.isArray(value));
        this.define(["listp", "list?"], 1, ([value]) => Array.isArray(value));

        // Output
        this.define(["print", "pr"], 1, (args) => { this.print(`${args.map((value) => show(value, false)).join(" ")}\n`); return undefined; }, 32, 0);
        this.define(["show"], 1, (args) => { this.print(`${args.map((value) => show(value, true)).join(" ")}\n`); return undefined; }, 32, 0);
        this.define(["type"], 1, (args) => { this.print(args.map((value) => show(value, false)).join("")); return undefined; }, 32, 0);
    }

    /** RUN and IFELSE: runs a list as instructions, or evaluates it when it produces a value. */
    private runBranch(list: Value, at: Position, name: string): Value | undefined {
        if (!Array.isArray(list)) throw this.fail("badInput", { name, value: show(list, true) }, at);
        const tokens = this.tokensOf(list, at);
        const cursor: Cursor = { tokens, index: 0 };
        let last: Value | undefined;
        while (cursor.index < tokens.length) {
            const start = tokens[cursor.index];
            this.tick(start);
            last = this.expression(cursor);
            if (last !== undefined && cursor.index < tokens.length) throw this.fail("noUse", { value: show(last, true) }, start);
        }
        return last;
    }

    /** Evaluates a list such as WHILE's [:n < 10] and returns its value. */
    private evaluateList(list: Value[], at: Position, name: string): Value {
        const value = this.runBranch(list, at, name);
        if (value === undefined) throw this.fail("badInput", { name, value: show(list, true) }, at);
        return value;
    }
}

/** Rounds away floating-point noise such as 99.99999999999999 after a turn. */
function clean(value: number): number {
    const rounded = Math.round(value * 1e9) / 1e9;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function relocate(token: Token, at: Position): Token {
    if (token.kind === "list") return { ...token, line: at.line, column: at.column, items: token.items.map((item) => relocate(item, at)) };
    return { ...token, line: at.line, column: at.column };
}

/** Runs a Logo program and returns its drawing, printed text and error (if any). */
export function runLogo(source: string, options: LogoOptions = {}): LogoResult {
    const interpreter = new Interpreter(options);
    let error: LogoResult["error"];
    try {
        interpreter.run(source);
    } catch (caught) {
        if (caught instanceof LogoError) {
            error = { message: caught.message, line: caught.line, column: caught.column };
        } else if (caught instanceof RangeError) {
            error = { message: interpreter.say("tooDeep", { count: DEFAULTS.maxDepth }) };
        } else {
            throw caught;
        }
    }
    return {
        segments: interpreter.segments,
        labels: interpreter.labels,
        turtle: { ...interpreter.turtle },
        background: interpreter.background,
        output: interpreter.output,
        steps: interpreter.steps,
        exitCode: error ? 1 : 0,
        ...(error ? { error } : {}),
    };
}

// ------------------------------------------------------------------ SVG
const round = (value: number) => String(Math.round(value * 100) / 100);

function escapeXml(text: string) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Draws a run's result as a standalone SVG: Logo's y axis points up, so y is
 * flipped; the view box fits the drawing (at least 200 × 200 around it).
 */
export function renderLogoSvg(result: Pick<LogoResult, "segments" | "labels" | "turtle" | "background">, options: { title?: string } = {}): string {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const include = (x: number, y: number, pad = 0) => {
        minX = Math.min(minX, x - pad);
        maxX = Math.max(maxX, x + pad);
        minY = Math.min(minY, y - pad);
        maxY = Math.max(maxY, y + pad);
    };
    for (const segment of result.segments) {
        include(segment.x1, segment.y1, segment.width / 2);
        include(segment.x2, segment.y2, segment.width / 2);
    }
    for (const label of result.labels) {
        include(label.x, label.y + label.size, 0);
        include(label.x + label.text.length * label.size * 0.62, label.y - label.size * 0.3, 0);
    }
    if (result.turtle.visible) include(result.turtle.x, result.turtle.y, 12);
    if (!Number.isFinite(minX)) include(0, 0, 100);
    const margin = 16;
    minX -= margin;
    minY -= margin;
    maxX += margin;
    maxY += margin;
    // At least 200 × 200, centred on the drawing.
    const grow = (low: number, high: number) => {
        const size = high - low;
        return size >= 200 ? [low, high] : [low - (200 - size) / 2, high + (200 - size) / 2];
    };
    [minX, maxX] = grow(minX, maxX);
    [minY, maxY] = grow(minY, maxY);
    const width = maxX - minX;
    const height = maxY - minY;

    // Consecutive segments with the same pen become one path.
    const paths: string[] = [];
    let current: { color: string; width: number; d: string[]; x: number; y: number } | null = null;
    const flush = () => {
        if (current) paths.push(`<path d="${current.d.join("")}" stroke="${current.color}" stroke-width="${round(current.width)}"/>`);
        current = null;
    };
    for (const segment of result.segments) {
        const continues = current && current.color === segment.color && current.width === segment.width && current.x === segment.x1 && current.y === segment.y1;
        if (!continues) {
            flush();
            current = { color: segment.color, width: segment.width, d: [`M${round(segment.x1)} ${round(-segment.y1)}`], x: segment.x1, y: segment.y1 };
        }
        current!.d.push(`L${round(segment.x2)} ${round(-segment.y2)}`);
        current!.x = segment.x2;
        current!.y = segment.y2;
    }
    flush();
    const labels = result.labels.map((label) => `<text x="${round(label.x)}" y="${round(-label.y)}" fill="${label.color}" font-size="${label.size}">${escapeXml(label.text)}</text>`);
    let turtle = "";
    if (result.turtle.visible) {
        const { x, y, heading } = result.turtle;
        const point = (angle: number, distance: number) => {
            const radians = toRadians(heading + angle);
            return `${round(x + distance * Math.sin(radians))},${round(-(y + distance * Math.cos(radians)))}`;
        };
        turtle = `<polygon points="${point(0, 12)} ${point(140, 9)} ${point(180, 4)} ${point(220, 9)}" fill="${result.turtle.color}" fill-opacity="0.35" stroke="${result.turtle.color}" stroke-width="1.5" stroke-linejoin="round"/>`;
    }
    const title = options.title ? `<title>${escapeXml(options.title)}</title>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(minX)} ${round(-maxY)} ${round(width)} ${round(height)}" role="img">${title}`
        + `<rect x="${round(minX)}" y="${round(-maxY)}" width="${round(width)}" height="${round(height)}" fill="${result.background}"/>`
        + `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${paths.join("")}</g>`
        + (labels.length ? `<g font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">${labels.join("")}</g>` : "")
        + `${turtle}</svg>`;
}
