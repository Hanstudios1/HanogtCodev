/**
 * Hanogt Forth: a dependency-free interpreter for a practical subset of
 * ANS Forth (runs in the runtime worker and in plain Node for tests).
 *
 * Supported: the data and return stacks, integer arithmetic (exact up to
 * 2^53, 64-bit bitwise words), colon definitions with IF/ELSE/THEN,
 * BEGIN/UNTIL/AGAIN/WHILE/REPEAT, DO/?DO/LOOP/+LOOP/I/J/LEAVE/UNLOOP,
 * CASE/OF/ENDOF/ENDCASE, RECURSE and EXIT; VARIABLE, CONSTANT, VALUE/TO,
 * CREATE/ALLOT/,/DOES>, memory words (@ ! +! C@ C! CELLS FILL MOVE HERE),
 * strings (." S" .( TYPE COUNT CHAR [CHAR]), number bases (DECIMAL HEX
 * BINARY BASE), ' EXECUTE ['] IMMEDIATE LITERAL POSTPONE [ ], DEFER/IS,
 * EVALUATE, KEY and ACCEPT (reading the Input tab), .S, WORDS and RANDOM.
 *
 * Memory is addressed in cells: one address unit holds one value, so
 * `1 CELLS` is 1 and characters occupy one cell each. Definitions run on an
 * explicit return stack, so deep recursion cannot overflow JavaScript's
 * stack. Errors name the word and its line and column.
 */

export interface ForthOptions {
    stdin?: string;
    onOutput?: (text: string) => void;
    maxSteps?: number;
    shouldStop?: () => boolean;
    locale?: "tr" | "en";
    /** Random source for RANDOM (tests pass a seeded one). */
    random?: () => number;
}

export interface ForthResult {
    output: string;
    exitCode: number;
    error?: { message: string; line?: number; column?: number };
    /** The data stack when the program ended. */
    stack: number[];
}

type Locale = "tr" | "en";

class ForthError extends Error {
    line?: number;
    column?: number;
    constructor(message: string, line?: number, column?: number) {
        super(message);
        this.line = line;
        this.column = column;
    }
}
class ForthExit extends Error {}

type Position = { line: number; column: number };

/** A compiled instruction of a colon definition. */
type Instr =
    | { op: "call"; word: Word; at: Position }
    | { op: "lit"; value: number }
    | { op: "branch"; target: number }
    | { op: "0branch"; target: number; name: string; at: Position }
    | { op: "do"; check: boolean; exit: number; at: Position }
    | { op: "loop"; plus: boolean; target: number; at: Position }
    | { op: "leave"; at: Position }
    | { op: "unloop"; at: Position }
    | { op: "exit" }
    | { op: "type"; text: string }
    | { op: "abort"; text: string; at: Position }
    | { op: "to"; word: Word; at: Position }
    | { op: "is"; word: Word; at: Position }
    | { op: "does"; code: number }
    | { op: "of"; target: number }
    | { op: "endcase" };

type Word = {
    name: string;
    immediate: boolean;
    kind: "prim" | "colon" | "variable" | "constant" | "value" | "create" | "defer";
    prim?: (vm: Forth, at: Position) => void;
    code?: Instr[];
    value?: number;
    address?: number;
    /** DOES> code (index into the defining word's instructions). */
    does?: { code: Instr[]; start: number };
    target?: Word | null;
    hidden?: boolean;
};

type Token = { text: string; line: number; column: number; start: number; end: number };

type Source = { text: string; index: number; line: number; column: number; tokens: number };

type Control =
    | { kind: "if"; patch: number }
    | { kind: "else"; patch: number }
    | { kind: "begin"; target: number }
    | { kind: "while"; patch: number; target: number }
    | { kind: "do"; start: number }
    | { kind: "case"; ends: number[] }
    | { kind: "of"; patch: number };

type Frame = { code: Instr[]; pc: number; word: Word };
type LoopFrame = { index: number; limit: number; exit: number };

const MESSAGES = {
    undefined: { tr: "Tanımsız kelime: {name}", en: "Undefined word: {name}" },
    underflow: { tr: "Yığın yetersiz: {name} için {need} değer gerekiyor, yığında {have} var", en: "Stack underflow: {name} needs {need} {values} but the stack has {have}" },
    overflow: { tr: "Yığın taştı (100.000 değerden fazla)", en: "Stack overflow (more than 100,000 values)" },
    returnOverflow: { tr: "Dönüş yığını taştı; özyineleme çok derin olabilir", en: "Return stack overflow; the recursion may be too deep" },
    divide: { tr: "Sıfıra bölme ({name})", en: "Division by zero ({name})" },
    compileOnly: { tr: "{name} yalnızca bir : tanımının içinde kullanılabilir", en: "{name} can only be used inside a : definition" },
    unterminatedDefinition: { tr: "Tanım bitmedi: ; eksik ({name})", en: "Unfinished definition: missing ; ({name})" },
    unbalanced: { tr: "Eşleşmeyen kontrol yapısı: {name}", en: "Unmatched control structure: {name}" },
    missingName: { tr: "{name} sonrasında bir ad bekleniyordu", en: "Expected a name after {name}" },
    unterminatedString: { tr: "Kapatılmamış metin: {name} sonrasında \" eksik", en: "Unterminated string: missing \" after {name}" },
    unterminatedComment: { tr: "Kapatılmamış ( yorumu; ) eksik", en: "Unterminated ( comment; missing )" },
    badAddress: { tr: "Geçersiz bellek adresi: {address}", en: "Invalid memory address: {address}" },
    noLoop: { tr: "{name} bir DO … LOOP döngüsünün dışında kullanıldı", en: "{name} used outside a DO … LOOP" },
    notValue: { tr: "{name} bir VALUE değil", en: "{name} is not a VALUE" },
    notDefer: { tr: "{name} bir DEFER kelimesi değil", en: "{name} is not a DEFER word" },
    deferUnset: { tr: "{name} için IS ile bir kelime atanmamış", en: "No word was assigned to {name} with IS" },
    noFloat: { tr: "Ondalıklı sayılar desteklenmiyor: {name}", en: "Floating-point numbers are not supported: {name}" },
    memory: { tr: "Bellek sınırı aşıldı", en: "Memory limit exceeded" },
    abort: { tr: "İptal edildi", en: "Aborted" },
    timeLimit: { tr: "Süre sınırı aşıldı; programda sonsuz döngü olabilir", en: "Time limit exceeded; the program may contain an infinite loop" },
    stepLimit: { tr: "Adım sınırı aşıldı ({count} adım)", en: "Step limit exceeded ({count} steps)" },
    badExecute: { tr: "EXECUTE geçersiz bir yürütme belirteci aldı: {token}", en: "EXECUTE received an invalid execution token: {token}" },
    noDoes: { tr: "DOES> yalnızca CREATE ile tanımlanan bir kelimeyi değiştirebilir", en: "DOES> can only change a word defined with CREATE" },
    leftOnStack: { tr: "Veri yığınında kalanlar", en: "Left on the data stack" },
};

const MAX_STACK = 100_000;
const MAX_RETURN = 50_000;
const MAX_MEMORY = 4_000_000;

export class Forth {
    readonly locale: Locale;
    readonly options: ForthOptions;
    readonly stack: number[] = [];
    readonly rstack: number[] = [];
    readonly memory: number[] = [];
    readonly dictionary = new Map<string, Word>();
    /** Execution tokens: index → word. */
    readonly tokens: Word[] = [];
    output = "";
    private pending = "";
    private sources: Source[] = [];
    private compiling: { word: Word; code: Instr[]; control: Control[]; at: Position } | null = null;
    private frames: Frame[] = [];
    private loops: LoopFrame[] = [];
    private steps = 0;
    private readonly maxSteps: number;
    private readonly input: string[];
    private inputIndex = 0;
    private lastCreated: Word | null = null;
    private here = 0;
    private readonly baseAddress: number;
    private readonly padAddress: number;

    constructor(options: ForthOptions = {}) {
        this.options = options;
        this.locale = options.locale === "tr" ? "tr" : "en";
        this.maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
        this.input = [...(options.stdin ?? "").replace(/\r\n/g, "\n")];
        // Address 0 is never valid; BASE lives at 1, PAD at 2..257.
        this.memory.length = 258;
        this.memory.fill(0);
        this.baseAddress = 1;
        this.padAddress = 2;
        this.here = 258;
        this.installPrimitives();
    }

    // ---------------------------------------------------------------- helpers
    say(key: keyof typeof MESSAGES, vars: Record<string, string | number> = {}) {
        return MESSAGES[key][this.locale].replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
    }

    error(key: keyof typeof MESSAGES, vars: Record<string, string | number> = {}, at?: Position): ForthError {
        return new ForthError(this.say(key, vars), at?.line, at?.column);
    }

    write(text: string) {
        this.pending += text;
        if (this.pending.length >= 1024) this.flush();
    }

    flush() {
        if (!this.pending) return;
        this.output += this.pending;
        this.options.onOutput?.(this.pending);
        this.pending = "";
    }

    push(value: number) {
        if (this.stack.length >= MAX_STACK) throw this.error("overflow");
        this.stack.push(value);
    }

    pop(name: string, at?: Position): number {
        if (!this.stack.length) throw this.error("underflow", { name, need: 1, have: 0, values: "value" }, at);
        return this.stack.pop()!;
    }

    need(count: number, name: string, at?: Position) {
        if (this.stack.length < count) throw this.error("underflow", { name, need: count, have: this.stack.length, values: count === 1 ? "value" : "values" }, at);
    }

    private checkAddress(address: number, at?: Position) {
        if (!Number.isInteger(address) || address <= 0 || address >= this.memory.length) throw this.error("badAddress", { address }, at);
        return address;
    }

    fetch(address: number, at?: Position) {
        return this.memory[this.checkAddress(address, at)] ?? 0;
    }

    store(address: number, value: number, at?: Position) {
        this.memory[this.checkAddress(address, at)] = value;
    }

    allot(count: number) {
        if (this.here + count > MAX_MEMORY) throw this.error("memory");
        if (count > 0) for (let index = 0; index < count; index += 1) this.memory[this.here + index] = 0;
        this.here += count;
        if (this.here > this.memory.length) this.memory.length = this.here;
    }

    comma(value: number) {
        this.allot(1);
        this.memory[this.here - 1] = value;
    }

    /** The number base stored in BASE (2–36; anything else counts as decimal). */
    get base() {
        const value = this.memory[this.baseAddress];
        return Number.isInteger(value) && value >= 2 && value <= 36 ? value : 10;
    }

    /** Formats a number in the current base. */
    format(value: number, unsigned = false) {
        let number = value;
        if (unsigned && number < 0) {
            return BigInt.asUintN(64, BigInt(Math.trunc(number))).toString(this.base).toUpperCase();
        }
        if (!Number.isFinite(number)) number = 0;
        return Math.trunc(number).toString(this.base).toUpperCase();
    }

    private define(name: string, prim: (vm: Forth, at: Position) => void, immediate = false) {
        const word: Word = { name: name.toUpperCase(), immediate, kind: "prim", prim };
        this.addWord(word);
        return word;
    }

    addWord(word: Word) {
        this.dictionary.set(word.name, word);
        this.tokens.push(word);
    }

    tokenOf(word: Word) {
        let index = this.tokens.lastIndexOf(word);
        if (index < 0) {
            this.tokens.push(word);
            index = this.tokens.length - 1;
        }
        return index + 1;
    }

    // ---------------------------------------------------------------- parsing
    private source() {
        return this.sources[this.sources.length - 1];
    }

    /** The next blank-delimited word of the current source, or null at its end. */
    nextToken(): Token | null {
        const source = this.source();
        const text = source.text;
        while (source.index < text.length && /\s/.test(text[source.index])) this.advance(source, 1);
        if (source.index >= text.length) return null;
        const start = source.index;
        const line = source.line;
        const column = source.column;
        while (source.index < text.length && !/\s/.test(text[source.index])) this.advance(source, 1);
        source.tokens += 1;
        return { text: text.slice(start, source.index), line, column, start, end: source.index };
    }

    /** Text up to `delimiter` (consumed), after skipping one leading space. */
    parseUntil(delimiter: string, name: string, at: Position, key: "unterminatedString" | "unterminatedComment" = "unterminatedString"): string {
        const source = this.source();
        if (source.text[source.index] === " " || source.text[source.index] === "\t") this.advance(source, 1);
        const end = source.text.indexOf(delimiter, source.index);
        if (end < 0) throw this.error(key, { name }, at);
        const text = source.text.slice(source.index, end);
        this.advance(source, end - source.index + delimiter.length);
        return text;
    }

    private advance(source: Source, count: number) {
        for (let step = 0; step < count && source.index < source.text.length; step += 1) {
            if (source.text[source.index] === "\n") {
                source.line += 1;
                source.column = 1;
            } else {
                source.column += 1;
            }
            source.index += 1;
        }
    }

    skipLine() {
        const source = this.source();
        while (source.index < source.text.length && source.text[source.index] !== "\n") this.advance(source, 1);
    }

    /** Parses a number in the current base; null when the token is not a number. */
    parseNumber(text: string): number | null {
        let body = text;
        let base = this.base;
        if (/^'.'$/.test(body)) return body.codePointAt(1) ?? 0;
        if (body.startsWith("$")) { base = 16; body = body.slice(1); }
        else if (body.startsWith("#")) { base = 10; body = body.slice(1); }
        else if (body.startsWith("%")) { base = 2; body = body.slice(1); }
        let negative = false;
        if (body.startsWith("-")) {
            negative = true;
            body = body.slice(1);
        }
        if (!body) return null;
        const digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, base);
        let value = 0;
        for (const char of body.toUpperCase()) {
            const digit = digits.indexOf(char);
            if (digit < 0) return null;
            value = value * base + digit;
        }
        return negative ? -value : value;
    }

    // ---------------------------------------------------------------- running
    run(source: string): ForthResult {
        try {
            this.interpret(source);
            if (this.compiling) throw this.error("unterminatedDefinition", { name: this.compiling.word.name }, this.compiling.at);
            this.flush();
            return { output: this.output, exitCode: 0, stack: [...this.stack] };
        } catch (error) {
            this.flush();
            if (error instanceof ForthExit) return { output: this.output, exitCode: 0, stack: [...this.stack] };
            if (error instanceof ForthError) {
                return { output: this.output, exitCode: 1, stack: [...this.stack], error: { message: error.message, line: error.line, column: error.column } };
            }
            if (error instanceof RangeError) {
                return { output: this.output, exitCode: 1, stack: [...this.stack], error: { message: this.say("returnOverflow") } };
            }
            throw error;
        }
    }

    /** The outer interpreter: reads words from `text` and interprets or compiles them. */
    interpret(text: string, origin?: Position) {
        this.sources.push({ text, index: 0, line: origin?.line ?? 1, column: origin?.column ?? 1, tokens: 0 });
        try {
            for (let token = this.nextToken(); token; token = this.nextToken()) {
                const at = { line: token.line, column: token.column };
                const name = token.text.toUpperCase();
                const word = this.dictionary.get(name);
                if (word && !word.hidden) {
                    if (this.compiling && !word.immediate) this.compiling.code.push({ op: "call", word, at });
                    else this.execute(word, at);
                    continue;
                }
                const number = this.parseNumber(token.text);
                if (number !== null) {
                    if (this.compiling) this.compiling.code.push({ op: "lit", value: number });
                    else this.push(number);
                    continue;
                }
                if (/^-?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?$/.test(token.text)) throw this.error("noFloat", { name: token.text }, at);
                throw this.error("undefined", { name: token.text }, at);
            }
        } finally {
            this.sources.pop();
        }
    }

    /** Runs a word to completion (colon definitions use an explicit frame stack). */
    execute(word: Word, at: Position) {
        const base = this.frames.length;
        const loopBase = this.loops.length;
        this.invoke(word, at);
        while (this.frames.length > base) {
            const frame = this.frames[this.frames.length - 1];
            if (frame.pc >= frame.code.length) {
                this.frames.pop();
                continue;
            }
            const instr = frame.code[frame.pc++];
            this.steps += 1;
            if (this.steps > this.maxSteps) throw this.error("stepLimit", { count: this.maxSteps }, at);
            if ((this.steps & 0x3fff) === 0 && this.options.shouldStop?.()) throw this.error("timeLimit", {}, "at" in instr ? instr.at : at);
            switch (instr.op) {
                case "call": this.invoke(instr.word, instr.at); break;
                case "lit": this.push(instr.value); break;
                case "branch": frame.pc = instr.target; break;
                case "0branch": if (this.pop(instr.name, instr.at) === 0) frame.pc = instr.target; break;
                case "do": {
                    this.need(2, instr.check ? "?DO" : "DO", instr.at);
                    const index = this.stack.pop()!;
                    const limit = this.stack.pop()!;
                    if (instr.check && index === limit) {
                        frame.pc = instr.exit;
                        break;
                    }
                    if (this.loops.length > MAX_RETURN) throw this.error("returnOverflow", {}, instr.at);
                    this.loops.push({ index, limit, exit: instr.exit });
                    break;
                }
                case "loop": {
                    const loop = this.loops[this.loops.length - 1];
                    if (!loop || this.loops.length <= loopBase) throw this.error("noLoop", { name: instr.plus ? "+LOOP" : "LOOP" }, instr.at);
                    const step = instr.plus ? this.pop("+LOOP", instr.at) : 1;
                    const before = loop.index - loop.limit;
                    loop.index += step;
                    const after = loop.index - loop.limit;
                    // Standard rule: the loop ends when the index crosses the boundary between limit-1 and limit.
                    const done = step >= 0 ? before < 0 && after >= 0 : before >= 0 && after < 0;
                    if (done || (step === 0 && loop.index === loop.limit)) this.loops.pop();
                    else frame.pc = instr.target;
                    break;
                }
                case "leave": {
                    const loop = this.loops.pop();
                    if (!loop) throw this.error("noLoop", { name: "LEAVE" }, instr.at);
                    frame.pc = loop.exit;
                    break;
                }
                case "unloop":
                    if (!this.loops.pop()) throw this.error("noLoop", { name: "UNLOOP" }, instr.at);
                    break;
                case "exit": this.frames.pop(); break;
                case "type": this.write(instr.text); break;
                case "abort":
                    if (this.pop("ABORT\"", instr.at) !== 0) throw new ForthError(instr.text || this.say("abort"), instr.at.line, instr.at.column);
                    break;
                case "to": {
                    const value = this.pop("TO", instr.at);
                    instr.word.value = value;
                    break;
                }
                case "is": {
                    const token = this.pop("IS", instr.at);
                    instr.word.target = this.tokens[token - 1] ?? null;
                    break;
                }
                case "does": {
                    const created = this.lastCreated;
                    if (!created || created.kind !== "create") throw this.error("noDoes", {}, at);
                    created.does = { code: frame.code, start: instr.code };
                    this.frames.pop();
                    break;
                }
                case "of": {
                    this.need(2, "OF", at);
                    const test = this.stack.pop()!;
                    const value = this.stack[this.stack.length - 1];
                    if (value === test) this.stack.pop();
                    else frame.pc = instr.target;
                    break;
                }
                case "endcase": this.pop("ENDCASE", at); break;
            }
        }
        if (this.loops.length > loopBase && this.frames.length === base) this.loops.length = loopBase;
    }

    /** Starts executing a word: primitives run now, colon definitions push a frame. */
    private invoke(word: Word, at: Position) {
        switch (word.kind) {
            case "prim":
                word.prim!(this, at);
                return;
            case "colon":
                if (this.frames.length >= MAX_RETURN) throw this.error("returnOverflow", {}, at);
                this.frames.push({ code: word.code!, pc: 0, word });
                return;
            case "variable":
                this.push(word.address!);
                return;
            case "constant":
            case "value":
                this.push(word.value!);
                return;
            case "create":
                this.push(word.address!);
                if (word.does) {
                    if (this.frames.length >= MAX_RETURN) throw this.error("returnOverflow", {}, at);
                    this.frames.push({ code: word.does.code, pc: word.does.start, word });
                }
                return;
            case "defer":
                if (!word.target) throw this.error("deferUnset", { name: word.name }, at);
                this.invoke(word.target, at);
                return;
        }
    }

    readName(name: string, at: Position): Token {
        const token = this.nextToken();
        if (!token) throw this.error("missingName", { name }, at);
        return token;
    }

    // ---------------------------------------------------------------- compiling
    private needCompiling(name: string, at: Position) {
        if (!this.compiling) throw this.error("compileOnly", { name }, at);
        return this.compiling;
    }

    private popControl<K extends Control["kind"]>(kinds: K[], name: string, at: Position): Extract<Control, { kind: K }> {
        const compiling = this.needCompiling(name, at);
        const control = compiling.control[compiling.control.length - 1];
        if (!control || !kinds.includes(control.kind as K)) throw this.error("unbalanced", { name }, at);
        compiling.control.pop();
        return control as Extract<Control, { kind: K }>;
    }

    private installPrimitives() {
        const binary = (name: string, fn: (a: number, b: number) => number) => this.define(name, (vm, at) => {
            vm.need(2, name, at);
            const b = vm.stack.pop()!;
            const a = vm.stack.pop()!;
            vm.push(fn(a, b));
        });
        const unary = (name: string, fn: (a: number) => number) => this.define(name, (vm, at) => vm.push(fn(vm.pop(name, at))));
        const flag = (value: boolean) => (value ? -1 : 0);
        const big = (value: number) => BigInt.asIntN(64, BigInt(Math.trunc(value)));
        const fromBig = (value: bigint) => Number(BigInt.asIntN(64, value));
        const divide = (name: string, a: number, b: number, at: Position) => {
            if (b === 0) throw this.error("divide", { name }, at);
            return Math.floor(a / b);
        };
        const modulo = (a: number, b: number) => a - b * Math.floor(a / b);

        // Arithmetic (floored division, like gforth).
        binary("+", (a, b) => a + b);
        binary("-", (a, b) => a - b);
        binary("*", (a, b) => a * b);
        this.define("/", (vm, at) => { vm.need(2, "/", at); const b = vm.stack.pop()!; const a = vm.stack.pop()!; vm.push(divide("/", a, b, at)); });
        this.define("MOD", (vm, at) => { vm.need(2, "MOD", at); const b = vm.stack.pop()!; const a = vm.stack.pop()!; divide("MOD", a, b, at); vm.push(modulo(a, b)); });
        this.define("/MOD", (vm, at) => { vm.need(2, "/MOD", at); const b = vm.stack.pop()!; const a = vm.stack.pop()!; const q = divide("/MOD", a, b, at); vm.push(modulo(a, b)); vm.push(q); });
        this.define("*/", (vm, at) => { vm.need(3, "*/", at); const c = vm.stack.pop()!; const b = vm.stack.pop()!; const a = vm.stack.pop()!; vm.push(divide("*/", a * b, c, at)); });
        this.define("*/MOD", (vm, at) => { vm.need(3, "*/MOD", at); const c = vm.stack.pop()!; const b = vm.stack.pop()!; const a = vm.stack.pop()!; const q = divide("*/MOD", a * b, c, at); vm.push(modulo(a * b, c)); vm.push(q); });
        unary("NEGATE", (a) => -a);
        unary("ABS", (a) => Math.abs(a));
        binary("MIN", (a, b) => Math.min(a, b));
        binary("MAX", (a, b) => Math.max(a, b));
        unary("1+", (a) => a + 1);
        unary("1-", (a) => a - 1);
        unary("2+", (a) => a + 2);
        unary("2-", (a) => a - 2);
        unary("2*", (a) => a * 2);
        unary("2/", (a) => Math.floor(a / 2));
        binary("AND", (a, b) => fromBig(big(a) & big(b)));
        binary("OR", (a, b) => fromBig(big(a) | big(b)));
        binary("XOR", (a, b) => fromBig(big(a) ^ big(b)));
        unary("INVERT", (a) => fromBig(~big(a)));
        binary("LSHIFT", (a, b) => fromBig(big(a) << BigInt(Math.max(0, Math.min(64, b)))));
        binary("RSHIFT", (a, b) => Number(BigInt.asUintN(64, big(a)) >> BigInt(Math.max(0, Math.min(64, b)))));
        // Comparisons return Forth flags (-1 true, 0 false).
        binary("=", (a, b) => flag(a === b));
        binary("<>", (a, b) => flag(a !== b));
        binary("<", (a, b) => flag(a < b));
        binary(">", (a, b) => flag(a > b));
        binary("<=", (a, b) => flag(a <= b));
        binary(">=", (a, b) => flag(a >= b));
        binary("U<", (a, b) => flag(BigInt.asUintN(64, big(a)) < BigInt.asUintN(64, big(b))));
        binary("U>", (a, b) => flag(BigInt.asUintN(64, big(a)) > BigInt.asUintN(64, big(b))));
        unary("0=", (a) => flag(a === 0));
        unary("0<>", (a) => flag(a !== 0));
        unary("0<", (a) => flag(a < 0));
        unary("0>", (a) => flag(a > 0));
        this.define("WITHIN", (vm, at) => { vm.need(3, "WITHIN", at); const high = vm.stack.pop()!; const low = vm.stack.pop()!; const value = vm.stack.pop()!; vm.push(flag(low <= value && value < high)); });
        this.define("TRUE", (vm) => vm.push(-1));
        this.define("FALSE", (vm) => vm.push(0));

        // Stack manipulation.
        this.define("DUP", (vm, at) => { vm.need(1, "DUP", at); vm.push(vm.stack[vm.stack.length - 1]); });
        this.define("?DUP", (vm, at) => { vm.need(1, "?DUP", at); const top = vm.stack[vm.stack.length - 1]; if (top !== 0) vm.push(top); });
        this.define("DROP", (vm, at) => { vm.pop("DROP", at); });
        this.define("SWAP", (vm, at) => { vm.need(2, "SWAP", at); const s = vm.stack; [s[s.length - 1], s[s.length - 2]] = [s[s.length - 2], s[s.length - 1]]; });
        this.define("OVER", (vm, at) => { vm.need(2, "OVER", at); vm.push(vm.stack[vm.stack.length - 2]); });
        this.define("ROT", (vm, at) => { vm.need(3, "ROT", at); vm.push(vm.stack.splice(vm.stack.length - 3, 1)[0]); });
        this.define("-ROT", (vm, at) => { vm.need(3, "-ROT", at); const top = vm.stack.pop()!; vm.stack.splice(vm.stack.length - 2, 0, top); });
        this.define("NIP", (vm, at) => { vm.need(2, "NIP", at); vm.stack.splice(vm.stack.length - 2, 1); });
        this.define("TUCK", (vm, at) => { vm.need(2, "TUCK", at); const top = vm.stack[vm.stack.length - 1]; vm.stack.splice(vm.stack.length - 2, 0, top); });
        this.define("PICK", (vm, at) => { const n = vm.pop("PICK", at); vm.need(n + 1, "PICK", at); vm.push(vm.stack[vm.stack.length - 1 - n]); });
        this.define("ROLL", (vm, at) => { const n = vm.pop("ROLL", at); vm.need(n + 1, "ROLL", at); vm.push(vm.stack.splice(vm.stack.length - 1 - n, 1)[0]); });
        this.define("2DUP", (vm, at) => { vm.need(2, "2DUP", at); const s = vm.stack; vm.push(s[s.length - 2]); vm.push(s[s.length - 2]); });
        this.define("2DROP", (vm, at) => { vm.need(2, "2DROP", at); vm.stack.length -= 2; });
        this.define("2SWAP", (vm, at) => { vm.need(4, "2SWAP", at); const s = vm.stack; const moved = s.splice(s.length - 4, 2); s.push(...moved); });
        this.define("2OVER", (vm, at) => { vm.need(4, "2OVER", at); const s = vm.stack; vm.push(s[s.length - 4]); vm.push(s[s.length - 4]); });
        this.define("DEPTH", (vm) => vm.push(vm.stack.length));
        this.define("CLEARSTACK", (vm) => { vm.stack.length = 0; });
        this.define(">R", (vm, at) => { if (vm.rstack.length >= MAX_RETURN) throw vm.error("returnOverflow", {}, at); vm.rstack.push(vm.pop(">R", at)); });
        this.define("R>", (vm, at) => { if (!vm.rstack.length) throw vm.error("underflow", { name: "R>", need: 1, have: 0, values: "value" }, at); vm.push(vm.rstack.pop()!); });
        this.define("R@", (vm, at) => { if (!vm.rstack.length) throw vm.error("underflow", { name: "R@", need: 1, have: 0, values: "value" }, at); vm.push(vm.rstack[vm.rstack.length - 1]); });
        this.define("2>R", (vm, at) => { vm.need(2, "2>R", at); const b = vm.stack.pop()!; const a = vm.stack.pop()!; vm.rstack.push(a, b); });
        this.define("2R>", (vm, at) => { if (vm.rstack.length < 2) throw vm.error("underflow", { name: "2R>", need: 2, have: vm.rstack.length, values: "values" }, at); const b = vm.rstack.pop()!; const a = vm.rstack.pop()!; vm.push(a); vm.push(b); });
        this.define("I", (vm, at) => { const loop = vm.loops[vm.loops.length - 1]; if (!loop) throw vm.error("noLoop", { name: "I" }, at); vm.push(loop.index); });
        this.define("J", (vm, at) => { const loop = vm.loops[vm.loops.length - 2]; if (!loop) throw vm.error("noLoop", { name: "J" }, at); vm.push(loop.index); });
        this.define("K", (vm, at) => { const loop = vm.loops[vm.loops.length - 3]; if (!loop) throw vm.error("noLoop", { name: "K" }, at); vm.push(loop.index); });

        // Memory.
        this.define("@", (vm, at) => vm.push(vm.fetch(vm.pop("@", at), at)));
        this.define("!", (vm, at) => { vm.need(2, "!", at); const address = vm.stack.pop()!; const value = vm.stack.pop()!; vm.store(address, value, at); });
        this.define("+!", (vm, at) => { vm.need(2, "+!", at); const address = vm.stack.pop()!; const value = vm.stack.pop()!; vm.store(address, vm.fetch(address, at) + value, at); });
        this.define("C@", (vm, at) => vm.push(vm.fetch(vm.pop("C@", at), at)));
        this.define("C!", (vm, at) => { vm.need(2, "C!", at); const address = vm.stack.pop()!; const value = vm.stack.pop()!; vm.store(address, value, at); });
        this.define("?", (vm, at) => vm.write(`${vm.format(vm.fetch(vm.pop("?", at), at))} `));
        this.define("CELLS", () => undefined);
        this.define("CELL+", (vm, at) => vm.push(vm.pop("CELL+", at) + 1));
        this.define("CHARS", () => undefined);
        this.define("CHAR+", (vm, at) => vm.push(vm.pop("CHAR+", at) + 1));
        this.define("ALIGN", () => undefined);
        this.define("ALIGNED", () => undefined);
        this.define("HERE", (vm) => vm.push(vm.here));
        this.define("ALLOT", (vm, at) => vm.allot(vm.pop("ALLOT", at)));
        this.define(",", (vm, at) => vm.comma(vm.pop(",", at)));
        this.define("C,", (vm, at) => vm.comma(vm.pop("C,", at)));
        this.define("PAD", (vm) => vm.push(vm.padAddress));
        this.define("BASE", (vm) => vm.push(vm.baseAddress));
        this.define("FILL", (vm, at) => { vm.need(3, "FILL", at); const value = vm.stack.pop()!; const count = vm.stack.pop()!; const address = vm.stack.pop()!; for (let index = 0; index < count; index += 1) vm.store(address + index, value, at); });
        this.define("ERASE", (vm, at) => { vm.need(2, "ERASE", at); const count = vm.stack.pop()!; const address = vm.stack.pop()!; for (let index = 0; index < count; index += 1) vm.store(address + index, 0, at); });
        const move = (name: string) => this.define(name, (vm, at) => {
            vm.need(3, name, at);
            const count = vm.stack.pop()!;
            const to = vm.stack.pop()!;
            const from = vm.stack.pop()!;
            const values = Array.from({ length: Math.max(0, count) }, (_, index) => vm.fetch(from + index, at));
            values.forEach((value, index) => vm.store(to + index, value, at));
        });
        move("MOVE");
        move("CMOVE");
        move("CMOVE>");

        // Output.
        this.define(".", (vm, at) => vm.write(`${vm.format(vm.pop(".", at))} `));
        this.define("U.", (vm, at) => vm.write(`${vm.format(vm.pop("U.", at), true)} `));
        this.define(".R", (vm, at) => { vm.need(2, ".R", at); const width = vm.stack.pop()!; vm.write(vm.format(vm.stack.pop()!).padStart(width)); });
        this.define("U.R", (vm, at) => { vm.need(2, "U.R", at); const width = vm.stack.pop()!; vm.write(vm.format(vm.stack.pop()!, true).padStart(width)); });
        this.define(".S", (vm) => vm.write(`<${vm.stack.length}> ${vm.stack.map((value) => vm.format(value)).join(" ")}${vm.stack.length ? " " : ""}`));
        this.define("EMIT", (vm, at) => {
            const code = vm.pop("EMIT", at);
            vm.write(code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : "�");
        });
        this.define("CR", (vm) => vm.write("\n"));
        this.define("SPACE", (vm) => vm.write(" "));
        this.define("SPACES", (vm, at) => vm.write(" ".repeat(Math.max(0, Math.min(10_000, vm.pop("SPACES", at))))));
        this.define("BL", (vm) => vm.push(32));
        this.define("PAGE", () => undefined);
        this.define("TYPE", (vm, at) => {
            vm.need(2, "TYPE", at);
            const length = vm.stack.pop()!;
            const address = vm.stack.pop()!;
            let text = "";
            for (let index = 0; index < length; index += 1) {
                const code = vm.fetch(address + index, at);
                text += code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : "�";
            }
            vm.write(text);
        });
        this.define("COUNT", (vm, at) => { const address = vm.pop("COUNT", at); vm.push(address + 1); vm.push(vm.fetch(address, at)); });
        this.define("DECIMAL", (vm) => { vm.memory[vm.baseAddress] = 10; });
        this.define("HEX", (vm) => { vm.memory[vm.baseAddress] = 16; });
        this.define("BINARY", (vm) => { vm.memory[vm.baseAddress] = 2; });
        this.memory[this.baseAddress] = 10;

        // Input from the Input tab.
        this.define("KEY", (vm) => vm.push(vm.inputIndex < vm.input.length ? vm.input[vm.inputIndex++].codePointAt(0) ?? 0 : -1));
        this.define("KEY?", (vm) => vm.push(flag(vm.inputIndex < vm.input.length)));
        this.define("ACCEPT", (vm, at) => {
            vm.need(2, "ACCEPT", at);
            const max = vm.stack.pop()!;
            const address = vm.stack.pop()!;
            let count = 0;
            while (vm.inputIndex < vm.input.length && vm.input[vm.inputIndex] !== "\n") {
                const char = vm.input[vm.inputIndex++];
                if (count < max) vm.store(address + count++, char.codePointAt(0) ?? 0, at);
            }
            if (vm.inputIndex < vm.input.length) vm.inputIndex += 1;
            vm.push(count);
        });
        this.define("EVALUATE", (vm, at) => {
            vm.need(2, "EVALUATE", at);
            const length = vm.stack.pop()!;
            const address = vm.stack.pop()!;
            let text = "";
            for (let index = 0; index < length; index += 1) text += String.fromCodePoint(Math.max(0, Math.min(0x10ffff, vm.fetch(address + index, at))));
            vm.interpret(text, at);
        });
        this.define("RANDOM", (vm, at) => { const n = vm.pop("RANDOM", at); vm.push(n > 0 ? Math.floor((vm.options.random ?? Math.random)() * n) : 0); });
        this.define("MS", (vm, at) => { vm.pop("MS", at); });
        this.define("BYE", () => { throw new ForthExit(); });
        this.define("ABORT", (vm, at) => { throw vm.error("abort", {}, at); });
        this.define("WORDS", (vm) => vm.write(`${[...vm.dictionary.values()].filter((word) => !word.hidden).map((word) => word.name).reverse().join(" ")}\n`));

        // Comments and strings.
        this.define("(", (vm, at) => { vm.parseUntil(")", "(", at, "unterminatedComment"); }, true);
        this.define("\\", (vm) => vm.skipLine(), true);
        this.define(".(", (vm, at) => vm.write(vm.parseUntil(")", ".(", at)), true);
        this.define(".\"", (vm, at) => {
            const text = vm.parseUntil("\"", ".\"", at);
            if (vm.compiling) vm.compiling.code.push({ op: "type", text });
            else vm.write(text);
        }, true);
        // String literals live in data space; compiled ones are stored once, when compiled.
        this.define("S\"", (vm, at) => {
            const text = [...vm.parseUntil("\"", "S\"", at)];
            const address = vm.here;
            for (const char of text) vm.comma(char.codePointAt(0) ?? 0);
            if (vm.compiling) vm.compiling.code.push({ op: "lit", value: address }, { op: "lit", value: text.length });
            else {
                vm.push(address);
                vm.push(text.length);
            }
        }, true);
        this.define("C\"", (vm, at) => {
            const text = [...vm.parseUntil("\"", "C\"", at)];
            const compiling = vm.needCompiling("C\"", at);
            const address = vm.here;
            vm.comma(text.length);
            for (const char of text) vm.comma(char.codePointAt(0) ?? 0);
            compiling.code.push({ op: "lit", value: address });
        }, true);
        this.define("ABORT\"", (vm, at) => {
            const text = vm.parseUntil("\"", "ABORT\"", at);
            vm.needCompiling("ABORT\"", at).code.push({ op: "abort", text, at });
        }, true);
        this.define("CHAR", (vm, at) => vm.push(vm.readName("CHAR", at).text.codePointAt(0) ?? 0));
        this.define("[CHAR]", (vm, at) => {
            const code = vm.readName("[CHAR]", at).text.codePointAt(0) ?? 0;
            vm.needCompiling("[CHAR]", at).code.push({ op: "lit", value: code });
        }, true);

        // Defining words.
        this.define(":", (vm, at) => {
            const name = vm.readName(":", at);
            const word: Word = { name: name.text.toUpperCase(), immediate: false, kind: "colon", code: [], hidden: true };
            vm.compiling = { word, code: word.code!, control: [], at };
            vm.addWord(word);
        });
        this.define(":NONAME", (vm, at) => {
            const word: Word = { name: ":NONAME", immediate: false, kind: "colon", code: [], hidden: true };
            vm.compiling = { word, code: word.code!, control: [], at };
            vm.tokens.push(word);
        });
        this.define(";", (vm, at) => {
            const compiling = vm.needCompiling(";", at);
            if (compiling.control.length) throw vm.error("unbalanced", { name: compiling.control[compiling.control.length - 1].kind.toUpperCase() }, at);
            compiling.code.push({ op: "exit" });
            compiling.word.hidden = false;
            if (compiling.word.name === ":NONAME") vm.push(vm.tokenOf(compiling.word));
            else vm.dictionary.set(compiling.word.name, compiling.word);
            vm.lastCreated = compiling.word;
            vm.compiling = null;
        }, true);
        this.define("IMMEDIATE", (vm) => { if (vm.lastCreated) vm.lastCreated.immediate = true; });
        this.define("VARIABLE", (vm, at) => {
            const name = vm.readName("VARIABLE", at);
            vm.allot(1);
            vm.addWord({ name: name.text.toUpperCase(), immediate: false, kind: "variable", address: vm.here - 1 });
        });
        this.define("2VARIABLE", (vm, at) => {
            const name = vm.readName("2VARIABLE", at);
            vm.allot(2);
            vm.addWord({ name: name.text.toUpperCase(), immediate: false, kind: "variable", address: vm.here - 2 });
        });
        this.define("CONSTANT", (vm, at) => {
            const name = vm.readName("CONSTANT", at);
            vm.addWord({ name: name.text.toUpperCase(), immediate: false, kind: "constant", value: vm.pop("CONSTANT", at) });
        });
        this.define("VALUE", (vm, at) => {
            const name = vm.readName("VALUE", at);
            vm.addWord({ name: name.text.toUpperCase(), immediate: false, kind: "value", value: vm.pop("VALUE", at) });
        });
        this.define("TO", (vm, at) => {
            const name = vm.readName("TO", at);
            const word = vm.dictionary.get(name.text.toUpperCase());
            if (!word) throw vm.error("undefined", { name: name.text }, at);
            if (word.kind !== "value") throw vm.error("notValue", { name: name.text }, at);
            if (vm.compiling) vm.compiling.code.push({ op: "to", word, at });
            else word.value = vm.pop("TO", at);
        }, true);
        this.define("CREATE", (vm, at) => {
            const name = vm.readName("CREATE", at);
            const word: Word = { name: name.text.toUpperCase(), immediate: false, kind: "create", address: vm.here };
            vm.addWord(word);
            vm.lastCreated = word;
        });
        this.define("BUFFER:", (vm, at) => {
            const size = vm.pop("BUFFER:", at);
            const name = vm.readName("BUFFER:", at);
            const word: Word = { name: name.text.toUpperCase(), immediate: false, kind: "create", address: vm.here };
            vm.allot(size);
            vm.addWord(word);
        });
        this.define("DOES>", (vm, at) => {
            const compiling = vm.needCompiling("DOES>", at);
            compiling.code.push({ op: "does", code: compiling.code.length + 1 });
        }, true);
        this.define("DEFER", (vm, at) => {
            const name = vm.readName("DEFER", at);
            vm.addWord({ name: name.text.toUpperCase(), immediate: false, kind: "defer", target: null });
        });
        this.define("IS", (vm, at) => {
            const name = vm.readName("IS", at);
            const word = vm.dictionary.get(name.text.toUpperCase());
            if (!word) throw vm.error("undefined", { name: name.text }, at);
            if (word.kind !== "defer") throw vm.error("notDefer", { name: name.text }, at);
            if (vm.compiling) vm.compiling.code.push({ op: "is", word, at });
            else word.target = vm.tokens[vm.pop("IS", at) - 1] ?? null;
        }, true);
        this.define("'", (vm, at) => {
            const name = vm.readName("'", at);
            const word = vm.dictionary.get(name.text.toUpperCase());
            if (!word || word.hidden) throw vm.error("undefined", { name: name.text }, at);
            vm.push(vm.tokenOf(word));
        });
        this.define("[']", (vm, at) => {
            const name = vm.readName("[']", at);
            const word = vm.dictionary.get(name.text.toUpperCase());
            if (!word || word.hidden) throw vm.error("undefined", { name: name.text }, at);
            vm.needCompiling("[']", at).code.push({ op: "lit", value: vm.tokenOf(word) });
        }, true);
        this.define("EXECUTE", (vm, at) => {
            const token = vm.pop("EXECUTE", at);
            const word = vm.tokens[token - 1];
            if (!word) throw vm.error("badExecute", { token }, at);
            vm.invoke(word, at);
        });
        this.define("LITERAL", (vm, at) => vm.needCompiling("LITERAL", at).code.push({ op: "lit", value: vm.pop("LITERAL", at) }), true);
        this.define("POSTPONE", (vm, at) => {
            const compiling = vm.needCompiling("POSTPONE", at);
            const name = vm.readName("POSTPONE", at);
            const word = vm.dictionary.get(name.text.toUpperCase());
            if (!word) throw vm.error("undefined", { name: name.text }, at);
            compiling.code.push({ op: "call", word, at });
        }, true);
        this.define("[", (vm, at) => {
            const compiling = vm.needCompiling("[", at);
            vm.suspended = compiling;
            vm.compiling = null;
        }, true);
        this.define("]", (vm) => {
            if (vm.suspended) {
                vm.compiling = vm.suspended;
                vm.suspended = null;
            }
        });

        // Control structures (compile-only).
        this.define("IF", (vm, at) => {
            const compiling = vm.needCompiling("IF", at);
            compiling.control.push({ kind: "if", patch: compiling.code.length });
            compiling.code.push({ op: "0branch", target: -1, name: "IF", at });
        }, true);
        this.define("ELSE", (vm, at) => {
            const control = vm.popControl(["if"], "ELSE", at);
            const compiling = vm.compiling!;
            const jump = compiling.code.length;
            compiling.code.push({ op: "branch", target: -1 });
            (compiling.code[control.patch] as { target: number }).target = compiling.code.length;
            compiling.control.push({ kind: "else", patch: jump });
        }, true);
        this.define("THEN", (vm, at) => {
            const control = vm.popControl(["if", "else"], "THEN", at);
            (vm.compiling!.code[control.patch] as { target: number }).target = vm.compiling!.code.length;
        }, true);
        this.define("BEGIN", (vm, at) => {
            const compiling = vm.needCompiling("BEGIN", at);
            compiling.control.push({ kind: "begin", target: compiling.code.length });
        }, true);
        this.define("UNTIL", (vm, at) => {
            const control = vm.popControl(["begin"], "UNTIL", at);
            vm.compiling!.code.push({ op: "0branch", target: control.target, name: "UNTIL", at });
        }, true);
        this.define("AGAIN", (vm, at) => {
            const control = vm.popControl(["begin"], "AGAIN", at);
            vm.compiling!.code.push({ op: "branch", target: control.target });
        }, true);
        this.define("WHILE", (vm, at) => {
            const control = vm.popControl(["begin"], "WHILE", at);
            const compiling = vm.compiling!;
            compiling.control.push({ kind: "while", patch: compiling.code.length, target: control.target });
            compiling.code.push({ op: "0branch", target: -1, name: "WHILE", at });
        }, true);
        this.define("REPEAT", (vm, at) => {
            const control = vm.popControl(["while"], "REPEAT", at);
            const compiling = vm.compiling!;
            compiling.code.push({ op: "branch", target: control.target });
            (compiling.code[control.patch] as { target: number }).target = compiling.code.length;
        }, true);
        const doWord = (name: string, check: boolean) => this.define(name, (vm, at) => {
            const compiling = vm.needCompiling(name, at);
            compiling.control.push({ kind: "do", start: compiling.code.length + 1 });
            compiling.code.push({ op: "do", check, exit: -1, at });
        }, true);
        doWord("DO", false);
        doWord("?DO", true);
        const loopWord = (name: string, plus: boolean) => this.define(name, (vm, at) => {
            const control = vm.popControl(["do"], name, at);
            const compiling = vm.compiling!;
            compiling.code.push({ op: "loop", plus, target: control.start, at });
            const exit = compiling.code.length;
            (compiling.code[control.start - 1] as { exit: number }).exit = exit;
        }, true);
        loopWord("LOOP", false);
        loopWord("+LOOP", true);
        this.define("LEAVE", (vm, at) => {
            const compiling = vm.needCompiling("LEAVE", at);
            if (!compiling.control.some((control) => control.kind === "do")) throw vm.error("noLoop", { name: "LEAVE" }, at);
            compiling.code.push({ op: "leave", at });
        }, true);
        this.define("UNLOOP", (vm, at) => vm.needCompiling("UNLOOP", at).code.push({ op: "unloop", at }), true);
        this.define("EXIT", (vm, at) => vm.needCompiling("EXIT", at).code.push({ op: "exit" }), true);
        this.define("RECURSE", (vm, at) => {
            const compiling = vm.needCompiling("RECURSE", at);
            compiling.code.push({ op: "call", word: compiling.word, at });
        }, true);
        this.define("CASE", (vm, at) => vm.needCompiling("CASE", at).control.push({ kind: "case", ends: [] }), true);
        this.define("OF", (vm, at) => {
            const compiling = vm.needCompiling("OF", at);
            const top = compiling.control[compiling.control.length - 1];
            if (!top || top.kind !== "case") throw vm.error("unbalanced", { name: "OF" }, at);
            compiling.control.push({ kind: "of", patch: compiling.code.length });
            compiling.code.push({ op: "of", target: -1 });
        }, true);
        this.define("ENDOF", (vm, at) => {
            const control = vm.popControl(["of"], "ENDOF", at);
            const compiling = vm.compiling!;
            const caseControl = compiling.control[compiling.control.length - 1] as Extract<Control, { kind: "case" }>;
            caseControl.ends.push(compiling.code.length);
            compiling.code.push({ op: "branch", target: -1 });
            (compiling.code[control.patch] as { target: number }).target = compiling.code.length;
        }, true);
        this.define("ENDCASE", (vm, at) => {
            const control = vm.popControl(["case"], "ENDCASE", at);
            const compiling = vm.compiling!;
            compiling.code.push({ op: "endcase" });
            for (const end of control.ends) (compiling.code[end] as { target: number }).target = compiling.code.length;
        }, true);
    }

    /** A definition interrupted by `[` (resumed by `]`). */
    suspended: { word: Word; code: Instr[]; control: Control[]; at: Position } | null = null;
}

export function runForth(source: string, options: ForthOptions = {}): ForthResult {
    return new Forth(options).run(source);
}
