/**
 * Hanogt Scheme: a dependency-free interpreter for a practical subset of R7RS
 * Scheme (plus common SRFI-1/13/69 and SICP helpers). It runs inside the
 * runtime worker and in plain Node for tests.
 *
 * Supported: exact integers (arbitrary precision) and rationals, inexact reals,
 * proper tail calls, define / lambda / let family / named let / do / cond /
 * case / when / unless / quasiquote, define-record-type, syntax-rules macros
 * (with renaming of introduced bindings), guard / raise / error objects,
 * escape-only continuations (call/cc), dynamic-wind, multiple values,
 * parameters, promises and SICP streams (cons-stream), string ports, hash
 * tables, vectors and characters.
 *
 * Not supported: re-entrant continuations, full numeric tower (complex
 * numbers), mutable strings and bytevectors. Top-level expression results are
 * printed like a REPL (Racket-style); definitions print nothing.
 */

// ------------------------------------------------------------------ values
export class Sym {
    readonly name: string;
    constructor(name: string) {
        this.name = name;
    }
}

export class Pair {
    car: Value;
    cdr: Value;
    constructor(car: Value, cdr: Value) {
        this.car = car;
        this.cdr = cdr;
    }
}

export class Char {
    readonly code: number;
    constructor(code: number) {
        this.code = code;
    }
}

export class Rational {
    readonly num: bigint;
    readonly den: bigint;
    constructor(num: bigint, den: bigint) {
        this.num = num;
        this.den = den;
    }
}

class EmptyList {}
class UnspecifiedValue {}
class EofValue {}
class UnassignedValue {}

export const NIL = new EmptyList();
export const UNSPECIFIED = new UnspecifiedValue();
export const EOF = new EofValue();
const UNASSIGNED = new UnassignedValue();

class Environment {
    readonly vars = new Map<Sym, Value>();
    readonly parent: Environment | null;
    constructor(parent: Environment | null) {
        this.parent = parent;
    }
    define(name: Sym, value: Value) {
        this.vars.set(name, value);
    }
    find(name: Sym): Environment | null {
        if (this.vars.has(name)) return this;
        let env = this.parent;
        while (env) {
            if (env.vars.has(name)) return env;
            env = env.parent;
        }
        return null;
    }
}

class Lambda {
    readonly params: Sym[];
    readonly rest: Sym | null;
    readonly body: Value[];
    readonly env: Environment;
    name: string;
    constructor(params: Sym[], rest: Sym | null, body: Value[], env: Environment, name: string) {
        this.params = params;
        this.rest = rest;
        this.body = body;
        this.env = env;
        this.name = name;
    }
}

class CaseLambda {
    readonly clauses: Lambda[];
    name: string;
    constructor(clauses: Lambda[], name: string) {
        this.clauses = clauses;
        this.name = name;
    }
}

class Primitive {
    readonly name: string;
    readonly fn: (args: Value[]) => Value;
    readonly min: number;
    readonly max: number;
    constructor(name: string, fn: (args: Value[]) => Value, min: number, max: number) {
        this.name = name;
        this.fn = fn;
        this.min = min;
        this.max = max;
    }
}

class Continuation {
    active = true;
}

class Parameter {
    value: Value;
    readonly converter: Value | null;
    constructor(value: Value, converter: Value | null) {
        this.value = value;
        this.converter = converter;
    }
}

class RecordType {
    readonly name: string;
    readonly fields: Sym[];
    constructor(name: string, fields: Sym[]) {
        this.name = name;
        this.fields = fields;
    }
}

class RecordInstance {
    readonly type: RecordType;
    readonly values: Value[];
    constructor(type: RecordType, values: Value[]) {
        this.type = type;
        this.values = values;
    }
}

class SchemePromise {
    done: boolean;
    value: Value;
    expr: Value | null;
    env: Environment | null;
    readonly delayForce: boolean;
    constructor(done: boolean, value: Value, expr: Value | null, env: Environment | null, delayForce: boolean) {
        this.done = done;
        this.value = value;
        this.expr = expr;
        this.env = env;
        this.delayForce = delayForce;
    }
}

class MultipleValues {
    readonly items: Value[];
    constructor(items: Value[]) {
        this.items = items;
    }
}

class ErrorObject {
    readonly message: string;
    readonly irritants: Value[];
    constructor(message: string, irritants: Value[]) {
        this.message = message;
        this.irritants = irritants;
    }
}

class HashTable {
    readonly map = new Map<string, [Value, Value]>();
}

class Port {
    readonly kind: "stdout" | "stderr" | "string-out" | "input";
    readonly chunks: string[] = [];
    text: string;
    position = 0;
    constructor(kind: Port["kind"], text = "") {
        this.kind = kind;
        this.text = text;
    }
}

class SpecialForm {
    readonly name: string;
    constructor(name: string) {
        this.name = name;
    }
}

class Macro {
    readonly name: string;
    readonly literals: Set<Sym>;
    readonly rules: Array<{ pattern: Value; template: Value }>;
    readonly env: Environment;
    readonly ellipsis: Sym;
    constructor(name: string, literals: Set<Sym>, rules: Array<{ pattern: Value; template: Value }>, env: Environment, ellipsis: Sym) {
        this.name = name;
        this.literals = literals;
        this.rules = rules;
        this.env = env;
        this.ellipsis = ellipsis;
    }
}

export type Value =
    | boolean | string | bigint | number
    | Sym | Pair | Char | Rational | Value[]
    | EmptyList | UnspecifiedValue | EofValue | UnassignedValue
    | Lambda | CaseLambda | Primitive | Continuation | Parameter
    | RecordType | RecordInstance | SchemePromise | MultipleValues | ErrorObject
    | HashTable | Port | SpecialForm | Macro | Environment;

type Num = bigint | Rational | number;

// BigInt literals (0n) need an ES2020 target; the project compiles for ES2017.
const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);

// ------------------------------------------------------------------ symbols
const SYMBOLS = new Map<string, Sym>();
export function intern(name: string): Sym {
    let symbol = SYMBOLS.get(name);
    if (!symbol) {
        symbol = new Sym(name);
        SYMBOLS.set(name, symbol);
    }
    return symbol;
}

const S = {
    quote: intern("quote"),
    quasiquote: intern("quasiquote"),
    unquote: intern("unquote"),
    unquoteSplicing: intern("unquote-splicing"),
    lambda: intern("lambda"),
    define: intern("define"),
    else: intern("else"),
    arrow: intern("=>"),
    ellipsis: intern("..."),
    underscore: intern("_"),
    begin: intern("begin"),
};

const CHARS = new Map<number, Char>();
function makeChar(code: number): Char {
    let char = CHARS.get(code);
    if (!char) {
        char = new Char(code);
        CHARS.set(code, char);
    }
    return char;
}

// ------------------------------------------------------------------ signals
/** A raised Scheme object travelling up the JavaScript stack. */
class SchemeError extends Error {
    readonly payload: Value;
    position: Position | undefined;
    constructor(payload: Value, position?: Position) {
        super(payload instanceof ErrorObject ? payload.message : "Scheme exception");
        this.payload = payload;
        this.position = position;
    }
}

class ContinuationInvoked extends Error {
    readonly continuation: Continuation;
    readonly value: Value;
    constructor(continuation: Continuation, value: Value) {
        super("continuation");
        this.continuation = continuation;
        this.value = value;
    }
}

class ExitSignal extends Error {
    readonly code: number;
    constructor(code: number) {
        super("exit");
        this.code = code;
    }
}

/** Arithmetic failures (division by zero…); primitives turn them into catchable Scheme errors. */
class NumericError extends Error {}

/** Step, time and output limits: these stop the program and cannot be caught by guard. */
class LimitError extends Error {}

// ------------------------------------------------------------------ numbers
function isNumber(value: Value): value is Num {
    return typeof value === "bigint" || typeof value === "number" || value instanceof Rational;
}

function absBig(value: bigint) {
    return value < B0 ? -value : value;
}

function gcdBig(a: bigint, b: bigint): bigint {
    a = absBig(a);
    b = absBig(b);
    while (b) [a, b] = [b, a % b];
    return a;
}

function bitLength(value: bigint) {
    return absBig(value).toString(2).length;
}

function makeRational(num: bigint, den: bigint): bigint | Rational {
    if (den === B0) throw new NumericError("division by zero");
    if (den < B0) {
        num = -num;
        den = -den;
    }
    const divisor = gcdBig(num, den);
    if (divisor > B1) {
        num /= divisor;
        den /= divisor;
    }
    return den === B1 ? num : new Rational(num, den);
}

function toRational(value: bigint | Rational): Rational {
    return typeof value === "bigint" ? new Rational(value, B1) : value;
}

function toFloat(value: Num): number {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    const shift = Math.max(0, Math.max(bitLength(value.num), bitLength(value.den)) - 1000);
    const scale = BigInt(shift);
    return Number(value.num >> scale) / Number(value.den >> scale);
}

function toExact(value: Num): bigint | Rational {
    if (typeof value !== "number") return value;
    if (!Number.isFinite(value)) throw new NumericError(`no exact representation for ${formatFloat(value)}`);
    if (Number.isInteger(value)) return BigInt(value);
    let mantissa = value;
    let exponent = 0;
    while (!Number.isInteger(mantissa) && exponent < 1100) {
        mantissa *= 2;
        exponent += 1;
    }
    return makeRational(BigInt(mantissa), B1 << BigInt(exponent));
}

function numAdd(a: Num, b: Num): Num {
    if (typeof a === "number" || typeof b === "number") return toFloat(a) + toFloat(b);
    if (typeof a === "bigint" && typeof b === "bigint") return a + b;
    const x = toRational(a);
    const y = toRational(b);
    return makeRational(x.num * y.den + y.num * x.den, x.den * y.den);
}

function numNegate(a: Num): Num {
    if (typeof a === "number") return -a;
    if (typeof a === "bigint") return -a;
    return new Rational(-a.num, a.den);
}

function numSub(a: Num, b: Num): Num {
    return numAdd(a, numNegate(b));
}

function numMul(a: Num, b: Num): Num {
    if (typeof a === "number" || typeof b === "number") return toFloat(a) * toFloat(b);
    if (typeof a === "bigint" && typeof b === "bigint") return a * b;
    const x = toRational(a);
    const y = toRational(b);
    return makeRational(x.num * y.num, x.den * y.den);
}

function numDiv(a: Num, b: Num): Num {
    if (typeof a === "number" || typeof b === "number") return toFloat(a) / toFloat(b);
    const x = toRational(a);
    const y = toRational(b);
    if (y.num === B0) throw new NumericError("division by zero");
    return makeRational(x.num * y.den, x.den * y.num);
}

function numCompare(a: Num, b: Num): number {
    if (typeof a === "number" || typeof b === "number") {
        const x = toFloat(a);
        const y = toFloat(b);
        if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
        return x < y ? -1 : x > y ? 1 : 0;
    }
    if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
    const x = toRational(a);
    const y = toRational(b);
    const left = x.num * y.den;
    const right = y.num * x.den;
    return left < right ? -1 : left > right ? 1 : 0;
}

function numSign(a: Num): number {
    if (typeof a === "number") return a < 0 ? -1 : a > 0 ? 1 : 0;
    if (typeof a === "bigint") return a < B0 ? -1 : a > B0 ? 1 : 0;
    return a.num < B0 ? -1 : 1;
}

function isInteger(value: Value): boolean {
    return typeof value === "bigint" || (typeof value === "number" && Number.isInteger(value));
}

function floorDivBig(a: bigint, b: bigint): [bigint, bigint] {
    let quotient = a / b;
    let remainder = a % b;
    if (remainder !== B0 && (remainder < B0) !== (b < B0)) {
        quotient -= B1;
        remainder += b;
    }
    return [quotient, remainder];
}

function isqrt(value: bigint): bigint {
    if (value < B2) return value;
    let x = BigInt(Math.floor(Math.sqrt(Number(value))));
    // Newton steps fix the float estimate for large values.
    for (;;) {
        const next = (x + value / x) >> B1;
        if (next >= x && x * x <= value && (x + B1) * (x + B1) > value) return x;
        if (next === x) break;
        x = next;
    }
    while (x * x > value) x -= B1;
    while ((x + B1) * (x + B1) <= value) x += B1;
    return x;
}

export function formatFloat(value: number): string {
    if (Number.isNaN(value)) return "+nan.0";
    if (value === Number.POSITIVE_INFINITY) return "+inf.0";
    if (value === Number.NEGATIVE_INFINITY) return "-inf.0";
    if (Object.is(value, -0)) return "-0.0";
    if (Number.isInteger(value) && Math.abs(value) < 1e21) return `${value.toFixed(0)}.0`;
    return String(value).replace("e+", "e");
}

function formatNumber(value: Num, radix = 10): string {
    if (typeof value === "bigint") return value.toString(radix);
    if (value instanceof Rational) return `${value.num.toString(radix)}/${value.den.toString(radix)}`;
    return radix === 10 ? formatFloat(value) : value.toString(radix);
}

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Parses a Scheme number literal; null when the text is not a number. */
export function parseNumber(text: string, defaultRadix = 10): Num | null {
    let radix = defaultRadix;
    let exactness: "e" | "i" | null = null;
    let body = text;
    while (body.length > 1 && body[0] === "#") {
        const flag = body[1].toLowerCase();
        if (flag === "x") radix = 16;
        else if (flag === "b") radix = 2;
        else if (flag === "o") radix = 8;
        else if (flag === "d") radix = 10;
        else if (flag === "e" || flag === "i") exactness = flag;
        else return null;
        body = body.slice(2);
    }
    if (!body) return null;
    let value: Num | null = null;
    const lower = body.toLowerCase();
    if (lower === "+inf.0") value = Number.POSITIVE_INFINITY;
    else if (lower === "-inf.0") value = Number.NEGATIVE_INFINITY;
    else if (lower === "+nan.0" || lower === "-nan.0") value = Number.NaN;
    else if (radix === 10 && DECIMAL.test(body)) {
        value = /[.e]/i.test(body) ? Number(body) : BigInt(body);
    } else {
        const digits = radix === 16 ? "[0-9a-f]" : radix === 8 ? "[0-7]" : radix === 2 ? "[01]" : "\\d";
        const integer = new RegExp(`^[+-]?${digits}+$`, "i");
        const fraction = new RegExp(`^([+-]?${digits}+)/(${digits}+)$`, "i");
        const parseDigits = (part: string) => {
            const negative = part.startsWith("-");
            const unsigned = part.replace(/^[+-]/, "");
            const prefix = radix === 16 ? "0x" : radix === 8 ? "0o" : radix === 2 ? "0b" : "";
            const parsed = BigInt(`${prefix}${unsigned}`);
            return negative ? -parsed : parsed;
        };
        if (integer.test(body)) value = parseDigits(body);
        else {
            const match = fraction.exec(body);
            if (match) {
                const den = parseDigits(match[2]);
                if (den === B0) return null;
                value = makeRational(parseDigits(match[1]), den);
            }
        }
    }
    if (value === null) return null;
    if (exactness === "i") return toFloat(value);
    if (exactness === "e") return Number.isFinite(toFloat(value)) || typeof value !== "number" ? toExact(value) : null;
    return value;
}

// ------------------------------------------------------------------ lists
function cons(car: Value, cdr: Value) {
    return new Pair(car, cdr);
}

function arrayToList(items: Value[], tail: Value = NIL): Value {
    let list = tail;
    for (let index = items.length - 1; index >= 0; index -= 1) list = new Pair(items[index], list);
    return list;
}

/** Proper-list check that also terminates on cycles. */
function isList(value: Value): boolean {
    let slow = value;
    let fast = value;
    for (;;) {
        if (fast === NIL) return true;
        if (!(fast instanceof Pair)) return false;
        fast = fast.cdr;
        if (fast === NIL) return true;
        if (!(fast instanceof Pair)) return false;
        fast = fast.cdr;
        slow = (slow as Pair).cdr;
        if (fast === slow) return false;
    }
}

// ------------------------------------------------------------------ printer
const CHAR_NAMES: Record<string, number> = {
    space: 32, newline: 10, tab: 9, nul: 0, null: 0, return: 13, linefeed: 10,
    alarm: 7, backspace: 8, delete: 127, escape: 27, altmode: 27, rubout: 127, page: 12,
};
const CHAR_WRITE_NAMES: Record<number, string> = { 32: "space", 10: "newline", 9: "tab", 0: "null", 13: "return", 7: "alarm", 8: "backspace", 127: "delete", 27: "escape" };

function writeString(text: string) {
    let result = "\"";
    for (const char of text) {
        const code = char.codePointAt(0)!;
        if (char === "\"") result += "\\\"";
        else if (char === "\\") result += "\\\\";
        else if (char === "\n") result += "\\n";
        else if (char === "\t") result += "\\t";
        else if (char === "\r") result += "\\r";
        else if (code < 32 || code === 127) result += `\\x${code.toString(16)};`;
        else result += char;
    }
    return `${result}"`;
}

function writeSymbol(name: string) {
    if (!name || /[\s()[\]";'`,|]/.test(name) || parseNumber(name) !== null || name === ".") {
        return `|${name.replace(/[|\\]/g, (match) => `\\${match}`)}|`;
    }
    return name;
}

function procedureName(value: Value) {
    if (value instanceof Lambda || value instanceof CaseLambda) return value.name;
    if (value instanceof Primitive) return value.name;
    return "";
}

export function printValue(value: Value, write: boolean, limit = 100_000): string {
    const parts: string[] = [];
    let length = 0;
    const path = new Set<object>();
    const push = (text: string) => {
        parts.push(text);
        length += text.length;
    };
    const visit = (item: Value) => {
        if (length > limit) return;
        if (item === true) return push("#t");
        if (item === false) return push("#f");
        if (typeof item === "bigint" || typeof item === "number" || item instanceof Rational) return push(formatNumber(item));
        if (typeof item === "string") return push(write ? writeString(item) : item);
        if (item instanceof Sym) return push(write ? writeSymbol(item.name) : item.name);
        if (item instanceof Char) {
            if (!write) return push(String.fromCodePoint(item.code));
            const name = CHAR_WRITE_NAMES[item.code];
            return push(`#\\${name ?? (item.code < 32 ? `x${item.code.toString(16)}` : String.fromCodePoint(item.code))}`);
        }
        if (item === NIL) return push("()");
        if (item instanceof Pair) {
            if (path.has(item)) return push("...");
            // 'x, `x, ,x and ,@x keep their short form.
            if (item.car instanceof Sym && item.cdr instanceof Pair && item.cdr.cdr === NIL) {
                const prefix = item.car === S.quote ? "'" : item.car === S.quasiquote ? "`" : item.car === S.unquote ? "," : item.car === S.unquoteSplicing ? ",@" : "";
                if (prefix) {
                    push(prefix);
                    return visit(item.cdr.car);
                }
            }
            path.add(item);
            push("(");
            let current: Value = item;
            let first = true;
            const seen = new Set<object>();
            while (current instanceof Pair) {
                if (seen.has(current) && current !== item) {
                    push(" ...");
                    break;
                }
                seen.add(current);
                if (!first) push(" ");
                visit(current.car);
                first = false;
                current = current.cdr;
                if (length > limit) break;
                if (current === item) {
                    push(" ...");
                    current = NIL;
                    break;
                }
            }
            if (current !== NIL && !(current instanceof Pair)) {
                push(" . ");
                visit(current);
            }
            push(")");
            path.delete(item);
            return;
        }
        if (Array.isArray(item)) {
            if (path.has(item)) return push("#(...)");
            path.add(item);
            push("#(");
            item.forEach((element, index) => {
                if (index) push(" ");
                visit(element);
            });
            push(")");
            path.delete(item);
            return;
        }
        if (item === UNSPECIFIED) return push("#<unspecified>");
        if (item === EOF) return push("#<eof>");
        if (item === UNASSIGNED) return push("#<unassigned>");
        if (item instanceof Lambda || item instanceof CaseLambda || item instanceof Primitive) {
            const name = procedureName(item);
            return push(name ? `#<procedure ${name}>` : "#<procedure>");
        }
        if (item instanceof Continuation) return push("#<continuation>");
        if (item instanceof Parameter) return push("#<parameter>");
        if (item instanceof RecordType) return push(`#<record-type ${item.name}>`);
        if (item instanceof RecordInstance) {
            push(`#<${item.type.name}`);
            item.values.forEach((element, index) => {
                push(` ${item.type.fields[index].name}: `);
                visit(element);
            });
            return push(">");
        }
        if (item instanceof SchemePromise) return push("#<promise>");
        if (item instanceof MultipleValues) {
            item.items.forEach((element, index) => {
                if (index) push(" ");
                visit(element);
            });
            return;
        }
        if (item instanceof ErrorObject) {
            push(`#<error ${writeString(item.message)}`);
            for (const irritant of item.irritants) {
                push(" ");
                visit(irritant);
            }
            return push(">");
        }
        if (item instanceof HashTable) return push(`#<hash-table ${item.map.size}>`);
        if (item instanceof Port) return push("#<port>");
        if (item instanceof SpecialForm) return push(`#<syntax ${item.name}>`);
        if (item instanceof Macro) return push(`#<macro ${item.name}>`);
        if (item instanceof Environment) return push("#<environment>");
        push(String(item));
    };
    visit(value);
    const text = parts.join("");
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// ------------------------------------------------------------------ equality
function isEqv(a: Value, b: Value): boolean {
    if (a === b) return true;
    if (typeof a === "number" && typeof b === "number") return Object.is(a, b);
    if (a instanceof Rational && b instanceof Rational) return a.num === b.num && a.den === b.den;
    return false;
}

function isEqual(a: Value, b: Value, depth = 0): boolean {
    if (isEqv(a, b)) return true;
    if (depth > 100_000) return false;
    if (a instanceof Pair && b instanceof Pair) {
        let left: Value = a;
        let right: Value = b;
        while (left instanceof Pair && right instanceof Pair) {
            if (!isEqual(left.car, right.car, depth + 1)) return false;
            left = left.cdr;
            right = right.cdr;
        }
        return isEqual(left, right, depth + 1);
    }
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => isEqual(item, b[index], depth + 1));
    if (typeof a === "string" && typeof b === "string") return a === b;
    return false;
}

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
function hashKey(value: Value): string {
    if (typeof value === "bigint") return `i${value}`;
    if (typeof value === "number") return `f${Object.is(value, -0) ? "-0" : value}`;
    if (typeof value === "string") return `s${value}`;
    if (typeof value === "boolean") return value ? "#t" : "#f";
    if (value instanceof Rational) return `r${value.num}/${value.den}`;
    if (value instanceof Char) return `c${value.code}`;
    if (value === NIL) return "()";
    if (value instanceof Pair || Array.isArray(value)) return `p${printValue(value, true, 1_000_000)}`;
    const target = value as object;
    let id = objectIds.get(target);
    if (id === undefined) {
        id = nextObjectId++;
        objectIds.set(target, id);
    }
    return `o${id}`;
}

// ------------------------------------------------------------------ reader
type Position = { line: number; column: number };

class ReadError extends Error {
    readonly position: Position;
    constructor(message: string, position: Position) {
        super(message);
        this.position = position;
    }
}

const READ_EOF = Symbol("eof");
const CLOSE = Symbol("close");
const DOT = Symbol("dot");
const DELIMITERS = new Set([" ", "\t", "\n", "\r", "\f", "(", ")", "[", "]", "\"", ";"]);

class Reader {
    private index = 0;
    private line = 1;
    private column = 1;
    readonly text: string;
    readonly positions: WeakMap<object, Position>;

    constructor(text: string, positions: WeakMap<object, Position>, start = 0) {
        this.text = text;
        this.positions = positions;
        this.index = start;
        if (start) {
            for (let cursor = 0; cursor < start; cursor += 1) this.advancePosition(text[cursor]);
        }
    }

    get offset() {
        return this.index;
    }

    private advancePosition(char: string) {
        if (char === "\n") {
            this.line += 1;
            this.column = 1;
        } else {
            this.column += 1;
        }
    }

    private peek(offset = 0) {
        return this.text[this.index + offset];
    }

    private next() {
        const char = this.text[this.index++];
        this.advancePosition(char);
        return char;
    }

    private position(): Position {
        return { line: this.line, column: this.column };
    }

    private skipAtmosphere() {
        for (;;) {
            const char = this.peek();
            if (char === undefined) return;
            if (char === ";") {
                while (this.peek() !== undefined && this.peek() !== "\n") this.next();
            } else if (char === "#" && this.peek(1) === "|") {
                const start = this.position();
                this.next();
                this.next();
                let depth = 1;
                while (depth > 0) {
                    const current = this.peek();
                    if (current === undefined) throw new ReadError("unterminated block comment #| … |#", start);
                    if (current === "|" && this.peek(1) === "#") {
                        this.next();
                        this.next();
                        depth -= 1;
                    } else if (current === "#" && this.peek(1) === "|") {
                        this.next();
                        this.next();
                        depth += 1;
                    } else {
                        this.next();
                    }
                }
            } else if (char === "#" && this.peek(1) === ";") {
                this.next();
                this.next();
                const skipped = this.readItem();
                if (skipped === READ_EOF) throw new ReadError("datum comment #; is not followed by a datum", this.position());
            } else if (/\s/.test(char)) {
                this.next();
            } else {
                return;
            }
        }
    }

    /** The next datum, or READ_EOF at the end of the text. */
    read(): Value | typeof READ_EOF {
        const item = this.readItem();
        if (item === CLOSE) throw new ReadError("unexpected closing parenthesis", this.lastClose);
        if (item === DOT) throw new ReadError("unexpected dot (.)", this.position());
        return item;
    }

    private lastClose: Position = { line: 1, column: 1 };

    private readItem(): Value | typeof READ_EOF | typeof CLOSE | typeof DOT {
        this.skipAtmosphere();
        const start = this.position();
        const char = this.peek();
        if (char === undefined) return READ_EOF;
        if (char === "(" || char === "[") {
            this.next();
            return this.readList(char === "(" ? ")" : "]", start);
        }
        if (char === ")" || char === "]") {
            this.lastClose = start;
            this.next();
            return CLOSE;
        }
        if (char === "'" || char === "`" || char === ",") {
            this.next();
            let symbol = char === "'" ? S.quote : char === "`" ? S.quasiquote : S.unquote;
            if (char === "," && this.peek() === "@") {
                this.next();
                symbol = S.unquoteSplicing;
            }
            const datum = this.readItem();
            if (datum === READ_EOF || datum === CLOSE || datum === DOT) throw new ReadError(`${symbol.name}: missing datum`, start);
            const list = new Pair(symbol, new Pair(datum, NIL));
            this.positions.set(list, start);
            return list;
        }
        if (char === "\"") return this.readString(start);
        if (char === "#") {
            const following = this.peek(1);
            if (following === "(") {
                this.next();
                this.next();
                const list = this.readList(")", start);
                return this.listItems(list);
            }
            if (following === "\\") return this.readChar(start);
            if (following === "u" && this.text.startsWith("#u8(", this.index)) throw new ReadError("bytevectors are not supported", start);
            if (following === "!") {
                // Reader directives such as #!fold-case are accepted and ignored.
                this.readAtom();
                return this.readItem();
            }
        }
        if (char === "|") return this.readPipeSymbol(start);
        const atom = this.readAtom();
        if (atom === ".") return DOT;
        return this.parseAtom(atom, start);
    }

    private listItems(list: Value): Value[] {
        const items: Value[] = [];
        let current = list;
        while (current instanceof Pair) {
            items.push(current.car);
            current = current.cdr;
        }
        return items;
    }

    private readList(close: string, start: Position): Value {
        const items: Value[] = [];
        let tail: Value = NIL;
        for (;;) {
            this.skipAtmosphere();
            if (this.peek() === undefined) throw new ReadError(`missing '${close}' for the list opened here`, start);
            const item = this.readItem();
            if (item === READ_EOF) throw new ReadError(`missing '${close}' for the list opened here`, start);
            if (item === CLOSE) {
                const closing = this.text[this.index - 1];
                if (closing !== close) throw new ReadError(`expected '${close}' but found '${closing}'`, this.lastClose);
                break;
            }
            if (item === DOT) {
                if (!items.length) throw new ReadError("unexpected dot (.) at the start of a list", this.position());
                const last = this.readItem();
                if (last === READ_EOF || last === CLOSE || last === DOT) throw new ReadError("expected a datum after the dot (.)", this.position());
                tail = last;
                const after = this.readItem();
                if (after !== CLOSE) throw new ReadError("expected the list to end after the dotted tail", this.position());
                break;
            }
            items.push(item);
        }
        const list = arrayToList(items, tail);
        if (list instanceof Pair) this.positions.set(list, start);
        return list;
    }

    private readString(start: Position): string {
        this.next();
        let result = "";
        for (;;) {
            const char = this.next();
            if (char === undefined) throw new ReadError("unterminated string", start);
            if (char === "\"") return result;
            if (char !== "\\") {
                result += char;
                continue;
            }
            const escape = this.next();
            if (escape === undefined) throw new ReadError("unterminated string", start);
            if (escape === "n") result += "\n";
            else if (escape === "t") result += "\t";
            else if (escape === "r") result += "\r";
            else if (escape === "a") result += "\u0007";
            else if (escape === "b") result += "\b";
            else if (escape === "0") result += "\0";
            else if (escape === "x" || escape === "X") {
                let hex = "";
                while (this.peek() !== undefined && this.peek() !== ";" && hex.length < 8) hex += this.next();
                if (this.peek() === ";") this.next();
                const code = Number.parseInt(hex, 16);
                if (!Number.isFinite(code) || code > 0x10ffff) throw new ReadError(`invalid string escape \\x${hex};`, start);
                result += String.fromCodePoint(code);
            } else if (escape === "\n" || escape === " " || escape === "\t") {
                // Line continuation: skip the newline and the next line's indentation.
                let sawNewline = escape === "\n";
                while (this.peek() === " " || this.peek() === "\t" || (!sawNewline && this.peek() === "\n")) {
                    if (this.next() === "\n") sawNewline = true;
                }
            } else {
                result += escape;
            }
        }
    }

    private readChar(start: Position): Char {
        this.next();
        this.next();
        let name = this.next() ?? "";
        if (!name) throw new ReadError("incomplete character literal #\\", start);
        while (this.peek() !== undefined && !DELIMITERS.has(this.peek()!)) name += this.next();
        const codePoints = [...name];
        if (codePoints.length === 1) return makeChar(codePoints[0].codePointAt(0)!);
        const lower = name.toLowerCase();
        if (lower in CHAR_NAMES) return makeChar(CHAR_NAMES[lower]);
        if (/^x[0-9a-f]+$/i.test(name)) return makeChar(Number.parseInt(name.slice(1), 16));
        if (/^u\+?[0-9a-f]+$/i.test(name)) return makeChar(Number.parseInt(name.replace(/^u\+?/i, ""), 16));
        throw new ReadError(`unknown character name #\\${name}`, start);
    }

    private readPipeSymbol(start: Position): Sym {
        this.next();
        let name = "";
        for (;;) {
            const char = this.next();
            if (char === undefined) throw new ReadError("unterminated |symbol|", start);
            if (char === "|") return intern(name);
            if (char === "\\") name += this.next() ?? "";
            else name += char;
        }
    }

    private readAtom(): string {
        let atom = "";
        while (this.peek() !== undefined && !DELIMITERS.has(this.peek()!)) atom += this.next();
        return atom;
    }

    private parseAtom(atom: string, start: Position): Value {
        if (atom.startsWith("#")) {
            const lower = atom.toLowerCase();
            if (lower === "#t" || lower === "#true") return true;
            if (lower === "#f" || lower === "#false") return false;
            const number = parseNumber(atom);
            if (number !== null) return number;
            throw new ReadError(`unknown syntax ${atom}`, start);
        }
        const number = parseNumber(atom);
        if (number !== null) return number;
        return intern(atom);
    }
}

// ------------------------------------------------------------------ public API
export interface SchemeOptions {
    stdin?: string;
    onOutput?: (text: string) => void;
    onError?: (text: string) => void;
    /** Evaluation step budget. */
    maxSteps?: number;
    /** Largest amount of output in characters before the run is stopped. */
    maxOutput?: number;
    shouldStop?: () => boolean;
    /** Print the values of top-level expressions like a REPL (default true). */
    printResults?: boolean;
    fileName?: string;
}

export interface SchemeResult {
    output: string;
    exitCode: number;
    error?: { message: string; line?: number; column?: number };
}

export function runScheme(source: string, options: SchemeOptions = {}): SchemeResult {
    return new Interpreter(options).run(source);
}

// ------------------------------------------------------------------ interpreter
type SchemeProcedure = Lambda | CaseLambda | Primitive | Continuation | Parameter;

class Interpreter {
    private readonly global = new Environment(null);
    private readonly positions = new WeakMap<object, Position>();
    private readonly options: SchemeOptions;
    private readonly maxSteps: number;
    private readonly maxOutput: number;
    private steps = 0;
    private output = "";
    private outputBuffer = "";
    private outputSize = 0;
    /** The innermost form being evaluated (cheap to track; positions are looked up on errors). */
    private currentForm: Value = NIL;
    private topLevelPosition: Position | undefined;
    private readonly expansions = new WeakMap<Pair, { macro: Macro; expansion: Value }>();
    private handlers: Value[] = [];
    private readonly stdout = new Port("stdout");
    private readonly stderr = new Port("stderr");
    private readonly stdin: Port;
    private outputPorts: Port[] = [];
    private gensymCounter = 0;
    private lastChar = "\n";

    constructor(options: SchemeOptions) {
        this.options = options;
        this.maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
        this.maxOutput = options.maxOutput ?? 1_000_000;
        this.stdin = new Port("input", (options.stdin ?? "").replace(/\r\n/g, "\n"));
        this.outputPorts = [this.stdout];
        this.installSpecialForms();
        this.installPrimitives();
    }

    // ---------------------------------------------------------------- running
    run(source: string): SchemeResult {
        const forms: Value[] = [];
        try {
            const reader = new Reader(source, this.positions);
            for (;;) {
                const datum = reader.read();
                if (datum === READ_EOF) break;
                forms.push(datum);
            }
        } catch (error) {
            if (error instanceof ReadError) {
                return { output: "", exitCode: 1, error: { message: `SyntaxError: ${error.message} (line ${error.position.line}, column ${error.position.column})`, ...error.position } };
            }
            throw error;
        }
        const printResults = this.options.printResults ?? true;
        let exitCode = 0;
        let failure: SchemeResult["error"];
        try {
            for (const form of forms) {
                this.topLevelPosition = form instanceof Pair ? this.positions.get(form) : undefined;
                const value = this.eval(form, this.global);
                if (printResults && !this.isDefinition(form)) this.printResult(value);
            }
        } catch (error) {
            const outcome = this.describeFailure(error);
            exitCode = outcome.exitCode;
            failure = outcome.error;
        } finally {
            this.flush();
        }
        return failure ? { output: this.output, exitCode, error: failure } : { output: this.output, exitCode };
    }

    private isDefinition(form: Value) {
        if (!(form instanceof Pair) || !(form.car instanceof Sym)) return false;
        return ["define", "define-syntax", "define-record-type", "define-values", "import", "set!"].includes(form.car.name);
    }

    private printResult(value: Value) {
        if (value === UNSPECIFIED || value === UNASSIGNED) return;
        const items = value instanceof MultipleValues ? value.items : [value];
        for (const item of items) {
            if (item === UNSPECIFIED) continue;
            if (this.lastChar !== "\n") this.emit("\n");
            this.emit(`${printValue(item, true)}\n`);
        }
    }

    private currentPosition(): Position | undefined {
        return (this.currentForm instanceof Pair ? this.positions.get(this.currentForm) : undefined) ?? this.topLevelPosition;
    }

    private describeFailure(error: unknown): { exitCode: number; error?: SchemeResult["error"] } {
        const where = (error instanceof SchemeError ? error.position : undefined) ?? this.currentPosition();
        const at = where ? `\n    at line ${where.line}, column ${where.column}` : "";
        const location = where ? { line: where.line, column: where.column } : {};
        if (error instanceof ExitSignal) return { exitCode: error.code };
        if (error instanceof SchemeError) {
            const payload = error.payload;
            if (payload instanceof ErrorObject) {
                const irritants = payload.irritants.map((item) => printValue(item, true, 2000)).join(" ");
                return { exitCode: 1, error: { message: `Error: ${payload.message}${irritants ? ` ${irritants}` : ""}${at}`, ...location } };
            }
            return { exitCode: 1, error: { message: `Error: uncaught exception: ${printValue(payload, true, 2000)}${at}`, ...location } };
        }
        if (error instanceof ContinuationInvoked) {
            return { exitCode: 1, error: { message: `Error: a continuation was called after its extent ended (re-entrant continuations are not supported)${at}`, ...location } };
        }
        if (error instanceof LimitError || error instanceof NumericError) return { exitCode: 1, error: { message: `Error: ${error.message}${at}`, ...location } };
        if (error instanceof RangeError && /call stack|recursion/i.test(error.message)) {
            return { exitCode: 1, error: { message: `Error: maximum recursion depth exceeded; use tail recursion or an iterative loop${at}`, ...location } };
        }
        throw error;
    }

    // ---------------------------------------------------------------- output
    private emit(text: string, port: Port = this.currentOutput()) {
        if (!text) return;
        if (port.kind === "string-out") {
            port.chunks.push(text);
            return;
        }
        if (port.kind === "stderr") {
            this.flush();
            this.options.onError?.(text);
            this.output += text;
            return;
        }
        this.outputSize += text.length;
        if (this.outputSize > this.maxOutput) {
            const room = Math.max(0, this.maxOutput - (this.outputSize - text.length));
            this.outputBuffer += text.slice(0, room);
            this.flush();
            throw new LimitError(`output limit of ${this.maxOutput} characters exceeded; the program was stopped`);
        }
        this.outputBuffer += text;
        this.lastChar = text[text.length - 1];
        if (this.outputBuffer.length > 4096 || text.includes("\n")) this.flush();
    }

    private flush() {
        if (!this.outputBuffer) return;
        const text = this.outputBuffer;
        this.outputBuffer = "";
        this.output += text;
        this.options.onOutput?.(text);
    }

    private currentOutput() {
        return this.outputPorts[this.outputPorts.length - 1];
    }

    // ---------------------------------------------------------------- errors
    private fail(message: string, ...irritants: Value[]): SchemeError {
        return new SchemeError(new ErrorObject(message, irritants), this.currentPosition());
    }

    private tick() {
        this.steps += 1;
        if (this.steps > this.maxSteps) throw new LimitError(`step limit exceeded (${this.maxSteps} evaluation steps); the program may contain an infinite loop`);
        if ((this.steps & 0x3fff) === 0 && this.options.shouldStop?.()) throw new LimitError("execution stopped because the time limit was exceeded");
    }

    // ---------------------------------------------------------------- environment
    private lookup(name: Sym, env: Environment): Value {
        let frame: Environment | null = env;
        while (frame) {
            const value = frame.vars.get(name);
            if (value !== undefined) {
                if (value === UNASSIGNED) throw this.fail(`${name.name}: variable used before its definition`);
                return value;
            }
            frame = frame.parent;
        }
        throw this.fail(`unbound variable: ${name.name}`);
    }

    // ---------------------------------------------------------------- helpers
    private listToArray(value: Value, who: string): Value[] {
        const items: Value[] = [];
        let current = value;
        let slow = value;
        let steps = 0;
        while (current instanceof Pair) {
            items.push(current.car);
            current = current.cdr;
            steps += 1;
            if ((steps & 1) === 0) slow = (slow as Pair).cdr;
            if (current === slow && current instanceof Pair) throw this.fail(`${who}: expected a proper list, got a circular list`);
        }
        if (current !== NIL) throw this.fail(`${who}: expected a proper list`, value);
        return items;
    }

    private formArgs(form: Pair, min: number, max: number, who: string): Value[] {
        const args = this.listToArray(form.cdr, who);
        if (args.length < min || args.length > max) throw this.fail(`${who}: bad syntax`, form);
        return args;
    }

    private truthy(value: Value) {
        return value !== false;
    }

    // ---------------------------------------------------------------- eval
    eval(expression: Value, environment: Environment): Value {
        let x = expression;
        let env = environment;
        for (;;) {
            this.tick();
            if (x instanceof Sym) return this.lookup(x, env);
            if (!(x instanceof Pair)) {
                if (x === NIL) throw this.fail("missing procedure expression: ()");
                return x;
            }
            this.currentForm = x;
            const head = x.car;
            let operator: Value;
            if (head instanceof Sym) {
                operator = this.lookup(head, env);
                if (operator instanceof SpecialForm) {
                    const outcome = this.special(operator.name, x, env);
                    if (outcome.tail) {
                        x = outcome.expr;
                        env = outcome.env;
                        continue;
                    }
                    return outcome.value;
                }
                if (operator instanceof Macro) {
                    x = this.expandMacro(operator, x);
                    continue;
                }
            } else {
                operator = this.eval(head, env);
            }
            const args: Value[] = [];
            for (let rest = x.cdr; rest !== NIL; rest = rest.cdr) {
                if (!(rest instanceof Pair)) throw this.fail("improper argument list in a procedure call", x);
                args.push(this.eval(rest.car, env));
            }
            this.currentForm = x;
            if (operator instanceof Lambda || operator instanceof CaseLambda) {
                const lambda = operator instanceof CaseLambda ? this.pickClause(operator, args) : operator;
                env = this.bind(lambda, args);
                const body = lambda.body;
                for (let index = 0; index < body.length - 1; index += 1) this.eval(body[index], env);
                x = body[body.length - 1];
                continue;
            }
            return this.applyOther(operator, args);
        }
    }

    private pickClause(procedure: CaseLambda, args: Value[]): Lambda {
        for (const clause of procedure.clauses) {
            if (args.length === clause.params.length || (clause.rest && args.length >= clause.params.length)) return clause;
        }
        throw this.fail(`${procedure.name || "case-lambda"}: no clause accepts ${args.length} argument(s)`);
    }

    private bind(lambda: Lambda, args: Value[]): Environment {
        const { params, rest } = lambda;
        if (args.length < params.length || (!rest && args.length > params.length)) {
            const expected = rest ? `at least ${params.length}` : `${params.length}`;
            throw this.fail(`${lambda.name || "#<procedure>"}: expected ${expected} argument(s), got ${args.length}`);
        }
        const env = new Environment(lambda.env);
        for (let index = 0; index < params.length; index += 1) env.vars.set(params[index], args[index]);
        if (rest) env.vars.set(rest, arrayToList(args.slice(params.length)));
        return env;
    }

    /** Calls any procedure from JavaScript (used by primitives such as map and sort). */
    apply(procedure: Value, args: Value[]): Value {
        if (procedure instanceof Lambda || procedure instanceof CaseLambda) {
            const lambda = procedure instanceof CaseLambda ? this.pickClause(procedure, args) : procedure;
            const env = this.bind(lambda, args);
            const body = lambda.body;
            for (let index = 0; index < body.length - 1; index += 1) this.eval(body[index], env);
            return this.eval(body[body.length - 1], env);
        }
        return this.applyOther(procedure, args);
    }

    private applyOther(procedure: Value, args: Value[]): Value {
        if (procedure instanceof Primitive) {
            if (args.length < procedure.min || args.length > procedure.max) {
                const expected = procedure.max === Number.POSITIVE_INFINITY ? `at least ${procedure.min}` : procedure.min === procedure.max ? `${procedure.min}` : `${procedure.min} to ${procedure.max}`;
                throw this.fail(`${procedure.name}: expected ${expected} argument(s), got ${args.length}`);
            }
            try {
                return procedure.fn(args);
            } catch (error) {
                if (error instanceof NumericError) throw this.fail(`${procedure.name}: ${error.message}`);
                throw error;
            }
        }
        if (procedure instanceof Continuation) {
            if (!procedure.active) throw this.fail("re-entrant continuations are not supported (the continuation's extent has ended)");
            throw new ContinuationInvoked(procedure, args.length === 1 ? args[0] : new MultipleValues(args));
        }
        if (procedure instanceof Parameter) {
            if (args.length) throw this.fail("parameter objects take no arguments");
            return procedure.value;
        }
        throw this.fail("not a procedure:", procedure);
    }

    private makeLambda(params: Value, body: Value, env: Environment, name: string, form: Value): Lambda {
        const names: Sym[] = [];
        let rest: Sym | null = null;
        let current = params;
        while (current instanceof Pair) {
            if (!(current.car instanceof Sym)) throw this.fail("lambda: parameters must be identifiers", form);
            names.push(current.car);
            current = current.cdr;
        }
        if (current instanceof Sym) rest = current;
        else if (current !== NIL) throw this.fail("lambda: bad parameter list", form);
        const all = rest ? [...names, rest] : names;
        if (new Set(all).size !== all.length) throw this.fail("lambda: duplicate parameter name", form);
        const forms = this.listToArray(body, "lambda");
        if (!forms.length) throw this.fail("lambda: the body is empty", form);
        return new Lambda(names, rest, forms, env, name);
    }

    // ---------------------------------------------------------------- special forms
    private installSpecialForms() {
        const names = [
            "quote", "quasiquote", "lambda", "define", "set!", "if", "cond", "case", "and", "or", "when", "unless",
            "begin", "let", "let*", "letrec", "letrec*", "do", "delay", "delay-force", "make-lazy-promise", "cons-stream",
            "define-record-type", "define-syntax", "let-syntax", "letrec-syntax", "syntax-rules", "guard", "case-lambda",
            "parameterize", "let-values", "let*-values", "define-values", "receive", "assert", "import", "define-library",
            "else", "=>", "unquote", "unquote-splicing", "...", "_", "named-lambda",
        ];
        for (const name of names) this.global.define(intern(name), new SpecialForm(name));
    }

    private special(name: string, x: Pair, env: Environment): { tail: true; expr: Value; env: Environment } | { tail: false; value: Value } {
        const done = (value: Value) => ({ tail: false as const, value });
        const tail = (expr: Value, nextEnv: Environment = env) => ({ tail: true as const, expr, env: nextEnv });
        const body = (forms: Value[], nextEnv: Environment) => {
            if (!forms.length) return done(UNSPECIFIED);
            for (let index = 0; index < forms.length - 1; index += 1) this.eval(forms[index], nextEnv);
            return tail(forms[forms.length - 1], nextEnv);
        };
        switch (name) {
            case "quote":
                return done(this.formArgs(x, 1, 1, "quote")[0]);
            case "quasiquote":
                return done(this.quasi(this.formArgs(x, 1, 1, "quasiquote")[0], 1, env));
            case "lambda": {
                const args = this.listToArray(x.cdr, "lambda");
                if (args.length < 2) throw this.fail("lambda: bad syntax", x);
                return done(this.makeLambda(args[0], (x.cdr as Pair).cdr, env, "", x));
            }
            case "named-lambda": {
                const spec = this.listToArray(x.cdr, "named-lambda")[0];
                if (!(spec instanceof Pair) || !(spec.car instanceof Sym)) throw this.fail("named-lambda: bad syntax", x);
                return done(this.makeLambda(spec.cdr, (x.cdr as Pair).cdr, env, spec.car.name, x));
            }
            case "define": {
                const args = this.listToArray(x.cdr, "define");
                if (!args.length) throw this.fail("define: bad syntax", x);
                let target = args[0];
                if (target instanceof Pair) {
                    // (define (name . params) body…) and curried (define ((f a) b) …).
                    let lambdaBody: Value = (x.cdr as Pair).cdr;
                    while (target instanceof Pair && target.car instanceof Pair) {
                        lambdaBody = new Pair(new Pair(S.lambda, new Pair(target.cdr, lambdaBody)), NIL);
                        target = target.car;
                    }
                    if (!(target instanceof Pair) || !(target.car instanceof Sym)) throw this.fail("define: bad syntax", x);
                    env.define(target.car, this.makeLambda(target.cdr, lambdaBody, env, target.car.name, x));
                    return done(UNSPECIFIED);
                }
                if (!(target instanceof Sym)) throw this.fail("define: expected an identifier", x);
                if (args.length > 2) throw this.fail("define: bad syntax (too many expressions)", x);
                const value = args.length === 2 ? this.eval(args[1], env) : UNSPECIFIED;
                if ((value instanceof Lambda || value instanceof CaseLambda) && !value.name) value.name = target.name;
                env.define(target, value);
                return done(UNSPECIFIED);
            }
            case "set!": {
                const [target, expression] = this.formArgs(x, 2, 2, "set!");
                if (!(target instanceof Sym)) throw this.fail("set!: expected an identifier", x);
                const frame = env.find(target);
                if (!frame) throw this.fail(`set!: unbound variable: ${target.name}`);
                frame.vars.set(target, this.eval(expression, env));
                return done(UNSPECIFIED);
            }
            case "if": {
                const args = this.formArgs(x, 2, 3, "if");
                if (this.truthy(this.eval(args[0], env))) return tail(args[1]);
                return args.length === 3 ? tail(args[2]) : done(UNSPECIFIED);
            }
            case "cond": {
                for (const clause of this.listToArray(x.cdr, "cond")) {
                    if (!(clause instanceof Pair)) throw this.fail("cond: bad clause", clause);
                    const forms = this.listToArray(clause.cdr, "cond");
                    if (clause.car === S.else) return body(forms, env);
                    const test = this.eval(clause.car, env);
                    if (!this.truthy(test)) continue;
                    if (!forms.length) return done(test);
                    if (forms[0] === S.arrow) {
                        if (forms.length !== 2) throw this.fail("cond: bad => clause", clause);
                        return done(this.apply(this.eval(forms[1], env), [test]));
                    }
                    return body(forms, env);
                }
                return done(UNSPECIFIED);
            }
            case "case": {
                const args = this.listToArray(x.cdr, "case");
                if (!args.length) throw this.fail("case: bad syntax", x);
                const key = this.eval(args[0], env);
                for (const clause of args.slice(1)) {
                    if (!(clause instanceof Pair)) throw this.fail("case: bad clause", clause);
                    const forms = this.listToArray(clause.cdr, "case");
                    const matches = clause.car === S.else || this.listToArray(clause.car, "case").some((datum) => isEqv(datum, key));
                    if (!matches) continue;
                    if (forms[0] === S.arrow) return done(this.apply(this.eval(forms[1], env), [key]));
                    return body(forms, env);
                }
                return done(UNSPECIFIED);
            }
            case "and": {
                const args = this.listToArray(x.cdr, "and");
                if (!args.length) return done(true);
                for (let index = 0; index < args.length - 1; index += 1) {
                    if (!this.truthy(this.eval(args[index], env))) return done(false);
                }
                return tail(args[args.length - 1]);
            }
            case "or": {
                const args = this.listToArray(x.cdr, "or");
                if (!args.length) return done(false);
                for (let index = 0; index < args.length - 1; index += 1) {
                    const value = this.eval(args[index], env);
                    if (this.truthy(value)) return done(value);
                }
                return tail(args[args.length - 1]);
            }
            case "when":
            case "unless": {
                const args = this.listToArray(x.cdr, name);
                if (!args.length) throw this.fail(`${name}: bad syntax`, x);
                const test = this.truthy(this.eval(args[0], env));
                return test === (name === "when") ? body(args.slice(1), env) : done(UNSPECIFIED);
            }
            case "begin":
                return body(this.listToArray(x.cdr, "begin"), env);
            case "let":
                return this.evalLet(x, env, body);
            case "let*": {
                const args = this.listToArray(x.cdr, "let*");
                if (!args.length) throw this.fail("let*: bad syntax", x);
                let current = env;
                for (const binding of this.listToArray(args[0], "let*")) {
                    const [variable, init] = this.parseBinding(binding, "let*");
                    const next = new Environment(current);
                    next.define(variable, init === undefined ? UNSPECIFIED : this.eval(init, current));
                    current = next;
                }
                return body(args.slice(1), new Environment(current));
            }
            case "letrec":
            case "letrec*": {
                const args = this.listToArray(x.cdr, name);
                if (!args.length) throw this.fail(`${name}: bad syntax`, x);
                const frame = new Environment(env);
                const bindings = this.listToArray(args[0], name).map((binding) => this.parseBinding(binding, name));
                for (const [variable] of bindings) frame.define(variable, UNASSIGNED);
                for (const [variable, init] of bindings) {
                    const value = init === undefined ? UNSPECIFIED : this.eval(init, frame);
                    if ((value instanceof Lambda || value instanceof CaseLambda) && !value.name) value.name = variable.name;
                    frame.define(variable, value);
                }
                return body(args.slice(1), frame);
            }
            case "do": {
                const args = this.listToArray(x.cdr, "do");
                if (args.length < 2) throw this.fail("do: bad syntax", x);
                const specs = this.listToArray(args[0], "do").map((spec) => {
                    const parts = this.listToArray(spec, "do");
                    if (!parts.length || !(parts[0] instanceof Sym) || parts.length > 3) throw this.fail("do: bad variable clause", spec);
                    return { variable: parts[0] as Sym, init: parts[1], step: parts[2] };
                });
                const exit = this.listToArray(args[1], "do");
                if (!exit.length) throw this.fail("do: missing test clause", x);
                const commands = args.slice(2);
                let frame = new Environment(env);
                for (const spec of specs) frame.define(spec.variable, spec.init === undefined ? UNSPECIFIED : this.eval(spec.init, env));
                for (;;) {
                    this.tick();
                    if (this.truthy(this.eval(exit[0], frame))) return body(exit.slice(1), frame);
                    for (const command of commands) this.eval(command, frame);
                    const next = new Environment(env);
                    for (const spec of specs) next.define(spec.variable, spec.step === undefined ? frame.vars.get(spec.variable)! : this.eval(spec.step, frame));
                    frame = next;
                }
            }
            case "delay":
            case "make-lazy-promise":
                return done(new SchemePromise(false, UNSPECIFIED, this.formArgs(x, 1, 1, name)[0], env, false));
            case "delay-force":
                return done(new SchemePromise(false, UNSPECIFIED, this.formArgs(x, 1, 1, name)[0], env, true));
            case "cons-stream": {
                const [head, rest] = this.formArgs(x, 2, 2, "cons-stream");
                return done(new Pair(this.eval(head, env), new SchemePromise(false, UNSPECIFIED, rest, env, false)));
            }
            case "define-record-type":
                return done(this.defineRecordType(x, env));
            case "define-syntax": {
                const [keyword, spec] = this.formArgs(x, 2, 2, "define-syntax");
                if (!(keyword instanceof Sym)) throw this.fail("define-syntax: expected an identifier", x);
                env.define(keyword, this.makeMacro(keyword.name, spec, env));
                return done(UNSPECIFIED);
            }
            case "let-syntax":
            case "letrec-syntax": {
                const args = this.listToArray(x.cdr, name);
                if (!args.length) throw this.fail(`${name}: bad syntax`, x);
                const frame = new Environment(env);
                for (const binding of this.listToArray(args[0], name)) {
                    const [keyword, spec] = this.listToArray(binding, name);
                    if (!(keyword instanceof Sym)) throw this.fail(`${name}: expected an identifier`, binding);
                    frame.define(keyword, this.makeMacro(keyword.name, spec, name === "letrec-syntax" ? frame : env));
                }
                return body(args.slice(1), frame);
            }
            case "syntax-rules":
                throw this.fail("syntax-rules: only allowed inside define-syntax, let-syntax or letrec-syntax", x);
            case "guard":
                return done(this.evalGuard(x, env));
            case "case-lambda": {
                const clauses = this.listToArray(x.cdr, "case-lambda").map((clause) => {
                    if (!(clause instanceof Pair)) throw this.fail("case-lambda: bad clause", clause);
                    return this.makeLambda(clause.car, clause.cdr, env, "", x);
                });
                return done(new CaseLambda(clauses, ""));
            }
            case "parameterize": {
                const args = this.listToArray(x.cdr, "parameterize");
                if (!args.length) throw this.fail("parameterize: bad syntax", x);
                const bindings = this.listToArray(args[0], "parameterize").map((binding) => {
                    const [parameterExpression, valueExpression] = this.listToArray(binding, "parameterize");
                    const parameter = this.eval(parameterExpression, env);
                    if (!(parameter instanceof Parameter)) throw this.fail("parameterize: not a parameter", parameter);
                    const raw = this.eval(valueExpression, env);
                    return { parameter, value: parameter.converter ? this.apply(parameter.converter, [raw]) : raw };
                });
                const saved = bindings.map(({ parameter }) => parameter.value);
                bindings.forEach(({ parameter, value }) => { parameter.value = value; });
                try {
                    return done(this.evalSequence(args.slice(1), new Environment(env)));
                } finally {
                    bindings.forEach(({ parameter }, index) => { parameter.value = saved[index]; });
                }
            }
            case "let-values":
            case "let*-values": {
                const args = this.listToArray(x.cdr, name);
                if (!args.length) throw this.fail(`${name}: bad syntax`, x);
                const frame = new Environment(env);
                for (const binding of this.listToArray(args[0], name)) {
                    const [formals, expression] = this.listToArray(binding, name);
                    const values = this.valuesOf(this.eval(expression, name === "let*-values" ? frame : env));
                    this.bindFormals(formals, values, frame, name);
                }
                return body(args.slice(1), frame);
            }
            case "define-values": {
                const [formals, expression] = this.formArgs(x, 2, 2, "define-values");
                this.bindFormals(formals, this.valuesOf(this.eval(expression, env)), env, "define-values");
                return done(UNSPECIFIED);
            }
            case "receive": {
                const args = this.listToArray(x.cdr, "receive");
                if (args.length < 3) throw this.fail("receive: bad syntax", x);
                const frame = new Environment(env);
                this.bindFormals(args[0], this.valuesOf(this.eval(args[1], env)), frame, "receive");
                return body(args.slice(2), frame);
            }
            case "assert": {
                const [expression] = this.formArgs(x, 1, 1, "assert");
                if (!this.truthy(this.eval(expression, env))) throw this.fail("assertion failed:", expression);
                return done(UNSPECIFIED);
            }
            case "import":
                // Libraries are built in; (import (scheme base) …) is accepted for R7RS programs.
                return done(UNSPECIFIED);
            case "define-library":
                throw this.fail("define-library is not supported; write the definitions at the top level", x);
            default:
                throw this.fail(`${name}: bad syntax (auxiliary keyword used as an expression)`, x);
        }
    }

    private evalSequence(forms: Value[], env: Environment): Value {
        let value: Value = UNSPECIFIED;
        for (const form of forms) value = this.eval(form, env);
        return value;
    }

    private parseBinding(binding: Value, who: string): [Sym, Value | undefined] {
        if (binding instanceof Sym) return [binding, undefined];
        const parts = this.listToArray(binding, who);
        if (!parts.length || parts.length > 2 || !(parts[0] instanceof Sym)) throw this.fail(`${who}: bad binding`, binding);
        return [parts[0] as Sym, parts[1]];
    }

    private evalLet(
        x: Pair,
        env: Environment,
        body: (forms: Value[], nextEnv: Environment) => { tail: true; expr: Value; env: Environment } | { tail: false; value: Value },
    ) {
        const args = this.listToArray(x.cdr, "let");
        if (!args.length) throw this.fail("let: bad syntax", x);
        if (args[0] instanceof Sym) {
            // Named let: (let loop ((var init) …) body…)
            const loopName = args[0];
            if (args.length < 3) throw this.fail("let: bad syntax", x);
            const bindings = this.listToArray(args[1], "let").map((binding) => this.parseBinding(binding, "let"));
            const inits = bindings.map(([, init]) => (init === undefined ? UNSPECIFIED : this.eval(init, env)));
            const loopEnv = new Environment(env);
            const lambda = this.makeLambda(arrayToList(bindings.map(([variable]) => variable)), arrayToList(args.slice(2)), loopEnv, loopName.name, x);
            loopEnv.define(loopName, lambda);
            const frame = this.bind(lambda, inits);
            return body(lambda.body, frame);
        }
        const frame = new Environment(env);
        for (const binding of this.listToArray(args[0], "let")) {
            const [variable, init] = this.parseBinding(binding, "let");
            const value = init === undefined ? UNSPECIFIED : this.eval(init, env);
            if ((value instanceof Lambda || value instanceof CaseLambda) && !value.name) value.name = variable.name;
            frame.define(variable, value);
        }
        return body(args.slice(1), frame);
    }

    private valuesOf(value: Value): Value[] {
        return value instanceof MultipleValues ? value.items : [value];
    }

    private bindFormals(formals: Value, values: Value[], env: Environment, who: string) {
        let current = formals;
        let index = 0;
        while (current instanceof Pair) {
            if (!(current.car instanceof Sym)) throw this.fail(`${who}: formals must be identifiers`, formals);
            if (index >= values.length) throw this.fail(`${who}: expected more values`, formals);
            env.define(current.car, values[index++]);
            current = current.cdr;
        }
        if (current instanceof Sym) env.define(current, arrayToList(values.slice(index)));
        else if (current !== NIL) throw this.fail(`${who}: bad formals`, formals);
        else if (index !== values.length) throw this.fail(`${who}: expected ${index} value(s), got ${values.length}`);
    }

    private quasi(template: Value, depth: number, env: Environment): Value {
        if (Array.isArray(template)) {
            const list = this.quasi(arrayToList(template), depth, env);
            return this.listToArray(list, "quasiquote");
        }
        if (!(template instanceof Pair)) return template;
        if (template.car === S.unquote) {
            const [expression] = this.listToArray(template.cdr, "unquote");
            if (depth === 1) return this.eval(expression, env);
            return arrayToList([S.unquote, this.quasi(expression, depth - 1, env)]);
        }
        if (template.car === S.quasiquote) {
            const [expression] = this.listToArray(template.cdr, "quasiquote");
            return arrayToList([S.quasiquote, this.quasi(expression, depth + 1, env)]);
        }
        const head = template.car;
        if (head instanceof Pair && head.car === S.unquoteSplicing) {
            const [expression] = this.listToArray(head.cdr, "unquote-splicing");
            const rest = this.quasi(template.cdr, depth, env);
            if (depth === 1) {
                const spliced = this.eval(expression, env);
                const items = this.listToArray(spliced, "unquote-splicing");
                return arrayToList(items, rest);
            }
            return new Pair(arrayToList([S.unquoteSplicing, this.quasi(expression, depth - 1, env)]), rest);
        }
        return new Pair(this.quasi(head, depth, env), this.quasi(template.cdr, depth, env));
    }

    private force(value: Value): Value {
        if (!(value instanceof SchemePromise)) return value;
        const promise = value;
        while (!promise.done) {
            const expression = promise.expr!;
            const env = promise.env!;
            const result = this.eval(expression, env);
            if (promise.done) break;
            if (promise.delayForce && result instanceof SchemePromise) {
                // Iterative forcing keeps long delay-force chains from growing the stack.
                if (result.done) {
                    promise.done = true;
                    promise.value = result.value;
                } else {
                    promise.expr = result.expr;
                    promise.env = result.env;
                    if (!result.delayForce) {
                        const inner = this.eval(result.expr!, result.env!);
                        promise.done = true;
                        promise.value = inner;
                        result.done = true;
                        result.value = inner;
                    }
                }
                continue;
            }
            promise.done = true;
            promise.value = result;
            promise.expr = null;
            promise.env = null;
        }
        return promise.value;
    }

    private defineRecordType(x: Pair, env: Environment): Value {
        const args = this.listToArray(x.cdr, "define-record-type");
        if (args.length < 2) throw this.fail("define-record-type: bad syntax", x);
        const [typeSpec, constructorSpec, predicate, ...fieldSpecs] = args;
        const typeName = typeSpec instanceof Pair ? typeSpec.car : typeSpec;
        if (!(typeName instanceof Sym)) throw this.fail("define-record-type: expected a type name", x);
        const fields = fieldSpecs.map((spec) => {
            const parts = spec instanceof Sym ? [spec] : this.listToArray(spec, "define-record-type");
            if (!(parts[0] instanceof Sym)) throw this.fail("define-record-type: bad field", spec);
            return { name: parts[0] as Sym, accessor: parts[1], modifier: parts[2] };
        });
        const displayName = typeName.name.replace(/^<(.*)>$/, "$1");
        const type = new RecordType(displayName, fields.map((field) => field.name));
        env.define(typeName, type);
        if (constructorSpec instanceof Pair || constructorSpec instanceof Sym) {
            const constructorName = constructorSpec instanceof Pair ? constructorSpec.car : constructorSpec;
            if (!(constructorName instanceof Sym)) throw this.fail("define-record-type: bad constructor", constructorSpec);
            const constructorFields = constructorSpec instanceof Pair ? this.listToArray(constructorSpec.cdr, "define-record-type") : fields.map((field) => field.name);
            const indexes = constructorFields.map((field) => {
                const position = type.fields.indexOf(field as Sym);
                if (position < 0) throw this.fail("define-record-type: unknown constructor field", field);
                return position;
            });
            env.define(constructorName, new Primitive(constructorName.name, (values) => {
                const record = new RecordInstance(type, type.fields.map(() => false as Value));
                indexes.forEach((position, index) => { record.values[position] = values[index]; });
                return record;
            }, indexes.length, indexes.length));
        }
        if (predicate instanceof Sym) {
            env.define(predicate, new Primitive(predicate.name, ([value]) => value instanceof RecordInstance && value.type === type, 1, 1));
        }
        fields.forEach((field, position) => {
            if (field.accessor instanceof Sym) {
                const accessorName = field.accessor.name;
                env.define(field.accessor, new Primitive(accessorName, ([record]) => {
                    if (!(record instanceof RecordInstance) || record.type !== type) throw this.fail(`${accessorName}: expected a ${displayName} record`, record);
                    return record.values[position];
                }, 1, 1));
            }
            if (field.modifier instanceof Sym) {
                const modifierName = field.modifier.name;
                env.define(field.modifier, new Primitive(modifierName, ([record, value]) => {
                    if (!(record instanceof RecordInstance) || record.type !== type) throw this.fail(`${modifierName}: expected a ${displayName} record`, record);
                    record.values[position] = value;
                    return UNSPECIFIED;
                }, 2, 2));
            }
        });
        return UNSPECIFIED;
    }

    private evalGuard(x: Pair, env: Environment): Value {
        const args = this.listToArray(x.cdr, "guard");
        if (!args.length || !(args[0] instanceof Pair) || !(args[0].car instanceof Sym)) throw this.fail("guard: bad syntax", x);
        const variable = args[0].car;
        const clauses = this.listToArray(args[0].cdr, "guard");
        const savedHandlers = this.handlers;
        const savedPorts = this.outputPorts.length;
        try {
            return this.evalSequence(args.slice(1), new Environment(env));
        } catch (error) {
            if (!(error instanceof SchemeError)) throw error;
            this.handlers = savedHandlers;
            this.outputPorts.length = Math.max(1, savedPorts);
            const frame = new Environment(env);
            frame.define(variable, error.payload);
            for (const clause of clauses) {
                if (!(clause instanceof Pair)) throw this.fail("guard: bad clause", clause);
                const forms = this.listToArray(clause.cdr, "guard");
                if (clause.car === S.else) return this.evalSequence(forms, frame);
                const test = this.eval(clause.car, frame);
                if (!this.truthy(test)) continue;
                if (!forms.length) return test;
                if (forms[0] === S.arrow) return this.apply(this.eval(forms[1], frame), [test]);
                return this.evalSequence(forms, frame);
            }
            throw error;
        }
    }

    // ---------------------------------------------------------------- macros
    private makeMacro(name: string, spec: Value, env: Environment): Macro {
        const parts = this.listToArray(spec, "define-syntax");
        if (!(parts[0] instanceof Sym) || parts[0].name !== "syntax-rules") throw this.fail("define-syntax: only syntax-rules transformers are supported", spec);
        let rest = parts.slice(1);
        let ellipsis = S.ellipsis;
        if (rest[0] instanceof Sym) {
            ellipsis = rest[0];
            rest = rest.slice(1);
        }
        if (!rest.length) throw this.fail("syntax-rules: missing literals list", spec);
        const literals = new Set(this.listToArray(rest[0], "syntax-rules").map((literal) => {
            if (!(literal instanceof Sym)) throw this.fail("syntax-rules: literals must be identifiers", literal);
            return literal;
        }));
        const rules = rest.slice(1).map((rule) => {
            const pieces = this.listToArray(rule, "syntax-rules");
            if (pieces.length !== 2 || !(pieces[0] instanceof Pair)) throw this.fail("syntax-rules: each rule needs a pattern and a template", rule);
            return { pattern: pieces[0], template: pieces[1] };
        });
        return new Macro(name, literals, rules, env, ellipsis);
    }

    private expandMacro(macro: Macro, form: Pair): Value {
        // A form expands the same way every time, so loops do not re-expand their bodies.
        const cached = this.expansions.get(form);
        if (cached && cached.macro === macro) return cached.expansion;
        for (const rule of macro.rules) {
            const bindings = new Map<Sym, MatchBinding>();
            const pattern = rule.pattern as Pair;
            // The keyword position is ignored.
            if (this.match(pattern.cdr, form.cdr, macro, bindings)) {
                const bound = new Set<Sym>();
                this.templateBindings(rule.template, bindings, macro, bound);
                const renames = new Map<Sym, Sym>();
                const expansion = this.expandTemplate(rule.template, bindings, macro, { renames, bound }, false);
                const position = this.positions.get(form);
                if (expansion instanceof Pair && position && !this.positions.has(expansion)) this.positions.set(expansion, position);
                this.expansions.set(form, { macro, expansion });
                return expansion;
            }
        }
        throw this.fail(`${macro.name}: no syntax rule matches`, form);
    }

    /**
     * Identifiers the template itself binds (let/lambda/do… variables that are
     * not pattern variables). They are always renamed, so a macro's temporary
     * never captures a user variable of the same name, even a global one.
     */
    private templateBindings(template: Value, bindings: Map<Sym, MatchBinding>, macro: Macro, bound: Set<Sym>) {
        const add = (value: Value) => {
            if (value instanceof Sym && value !== macro.ellipsis && value !== S.underscore && !bindings.has(value)) bound.add(value);
        };
        const formals = (value: Value) => {
            let current = value;
            while (current instanceof Pair) {
                add(current.car);
                current = current.cdr;
            }
            add(current);
        };
        const bindingNames = (value: Value) => {
            for (let current = value; current instanceof Pair; current = current.cdr) {
                if (current.car instanceof Pair) add(current.car.car);
            }
        };
        const visit = (node: Value) => {
            if (Array.isArray(node)) {
                node.forEach(visit);
                return;
            }
            if (!(node instanceof Pair)) return;
            const head = node.car;
            const second = node.cdr instanceof Pair ? node.cdr.car : NIL;
            const third = node.cdr instanceof Pair && node.cdr.cdr instanceof Pair ? node.cdr.cdr.car : NIL;
            if (head instanceof Sym && !bindings.has(head)) {
                switch (head.name) {
                    case "lambda":
                        formals(second);
                        break;
                    case "named-lambda":
                        if (second instanceof Pair) formals(second.cdr);
                        break;
                    case "let":
                        if (second instanceof Sym) {
                            add(second);
                            bindingNames(third);
                        } else {
                            bindingNames(second);
                        }
                        break;
                    case "let*":
                    case "letrec":
                    case "letrec*":
                    case "do":
                        bindingNames(second);
                        break;
                    case "let-values":
                    case "let*-values":
                        for (let current = second; current instanceof Pair; current = current.cdr) {
                            if (current.car instanceof Pair) formals(current.car.car);
                        }
                        break;
                    case "receive":
                        formals(second);
                        break;
                    default:
                        break;
                }
            }
            if (head === S.quote) return;
            visit(node.car);
            visit(node.cdr);
        };
        visit(template);
    }

    private match(pattern: Value, input: Value, macro: Macro, bindings: Map<Sym, MatchBinding>): boolean {
        if (pattern instanceof Sym) {
            if (pattern === S.underscore) return true;
            if (macro.literals.has(pattern)) return input === pattern;
            bindings.set(pattern, { kind: "one", value: input });
            return true;
        }
        if (pattern instanceof Pair) {
            if (pattern.cdr instanceof Pair && pattern.cdr.car === macro.ellipsis) {
                // (p ... tail…): match as many items as possible while leaving room for the tail.
                const after = pattern.cdr.cdr;
                let minimumAfter = 0;
                for (let cursor = after; cursor instanceof Pair; cursor = cursor.cdr) minimumAfter += 1;
                const items: Value[] = [];
                let current = input;
                while (current instanceof Pair) {
                    items.push(current.car);
                    current = current.cdr;
                }
                const available = items.length - minimumAfter;
                if (available < 0) return false;
                const matches: Array<Map<Sym, MatchBinding>> = [];
                for (let position = 0; position < available; position += 1) {
                    const itemBindings = new Map<Sym, MatchBinding>();
                    if (!this.match(pattern.car, items[position], macro, itemBindings)) return false;
                    matches.push(itemBindings);
                }
                for (const variable of this.patternVariables(pattern.car, macro)) {
                    bindings.set(variable, { kind: "many", items: matches.map((itemBindings) => itemBindings.get(variable) ?? { kind: "one", value: NIL }) });
                }
                let restInput: Value = input;
                for (let position = 0; position < available; position += 1) restInput = (restInput as Pair).cdr;
                return this.match(after, restInput, macro, bindings);
            }
            if (!(input instanceof Pair)) return false;
            return this.match(pattern.car, input.car, macro, bindings) && this.match(pattern.cdr, input.cdr, macro, bindings);
        }
        if (Array.isArray(pattern)) {
            return Array.isArray(input) && this.match(arrayToList(pattern), arrayToList(input), macro, bindings);
        }
        if (pattern === NIL) return input === NIL;
        return isEqual(pattern, input);
    }

    private patternVariables(pattern: Value, macro: Macro, found: Sym[] = []): Sym[] {
        if (pattern instanceof Sym) {
            if (pattern !== macro.ellipsis && pattern !== S.underscore && !macro.literals.has(pattern)) found.push(pattern);
        } else if (pattern instanceof Pair) {
            this.patternVariables(pattern.car, macro, found);
            this.patternVariables(pattern.cdr, macro, found);
        } else if (Array.isArray(pattern)) {
            pattern.forEach((item) => this.patternVariables(item, macro, found));
        }
        return found;
    }

    private expandTemplate(template: Value, bindings: Map<Sym, MatchBinding>, macro: Macro, renames: Renames, quoted: boolean): Value {
        if (template instanceof Sym) {
            const binding = bindings.get(template);
            if (binding) {
                if (binding.kind === "many") throw this.fail(`${macro.name}: pattern variable ${template.name} is used without an ellipsis`);
                return binding.value;
            }
            return quoted ? template : this.rename(template, macro, renames);
        }
        if (template instanceof Pair) {
            // (... ...) escapes the ellipsis.
            if (template.car === macro.ellipsis && template.cdr instanceof Pair) return this.expandEscaped(template.cdr.car, bindings);
            if (template.cdr instanceof Pair && template.cdr.car === macro.ellipsis) {
                let rest: Value = template.cdr.cdr;
                let depth = 1;
                while (rest instanceof Pair && rest.car === macro.ellipsis) {
                    depth += 1;
                    rest = rest.cdr;
                }
                const results = this.expandEllipsis(template.car, bindings, macro, renames, quoted, depth);
                return arrayToList(results, this.expandTemplate(rest, bindings, macro, renames, quoted));
            }
            const isQuote = template.car === S.quote;
            return new Pair(
                this.expandTemplate(template.car, bindings, macro, renames, quoted),
                this.expandTemplate(template.cdr, bindings, macro, renames, quoted || isQuote),
            );
        }
        if (Array.isArray(template)) {
            return this.listToArray(this.expandTemplate(arrayToList(template), bindings, macro, renames, quoted), macro.name);
        }
        return template;
    }

    private expandEscaped(template: Value, bindings: Map<Sym, MatchBinding>): Value {
        if (template instanceof Sym) {
            const binding = bindings.get(template);
            return binding && binding.kind === "one" ? binding.value : template;
        }
        if (template instanceof Pair) return new Pair(this.expandEscaped(template.car, bindings), this.expandEscaped(template.cdr, bindings));
        return template;
    }

    /** Expands `template ...` (depth 1) or `template ... ...` (depth 2…) into a flat list of results. */
    private expandEllipsis(template: Value, bindings: Map<Sym, MatchBinding>, macro: Macro, renames: Renames, quoted: boolean, depth: number): Value[] {
        const variables = this.patternVariables(template, macro).filter((variable) => bindings.get(variable)?.kind === "many");
        if (!variables.length) throw this.fail(`${macro.name}: an ellipsis follows a template without pattern variables`);
        let length = -1;
        for (const variable of variables) {
            const binding = bindings.get(variable);
            if (!binding || binding.kind !== "many") continue;
            if (length === -1) length = binding.items.length;
            else if (binding.items.length !== length) throw this.fail(`${macro.name}: pattern variables under the same ellipsis matched different numbers of items`);
        }
        const results: Value[] = [];
        for (let position = 0; position < Math.max(0, length); position += 1) {
            const scoped = new Map(bindings);
            for (const variable of variables) {
                const binding = bindings.get(variable);
                if (binding && binding.kind === "many") scoped.set(variable, binding.items[position]);
            }
            if (depth > 1) results.push(...this.expandEllipsis(template, scoped, macro, renames, quoted, depth - 1));
            else results.push(this.expandTemplate(template, scoped, macro, renames, quoted));
        }
        return results;
    }

    /**
     * Hygiene approximation: identifiers the template binds itself, and those
     * that are not bound where the macro was defined, are renamed to fresh,
     * uninterned symbols with the same printed name, so they can neither
     * capture nor be captured by the user's variables. Free references to
     * definitions (car, display, a global helper…) keep their meaning.
     */
    private rename(symbol: Sym, macro: Macro, renames: Renames): Sym {
        if (symbol === macro.ellipsis) return symbol;
        if (!renames.bound.has(symbol) && macro.env.find(symbol)) return symbol;
        let renamed = renames.renames.get(symbol);
        if (!renamed) {
            renamed = new Sym(symbol.name);
            renames.renames.set(symbol, renamed);
        }
        return renamed;
    }

    // ---------------------------------------------------------------- errors API
    private raise(payload: Value, continuable: boolean): Value {
        if (continuable && this.handlers.length) {
            const handler = this.handlers[this.handlers.length - 1];
            const saved = this.handlers;
            this.handlers = saved.slice(0, -1);
            try {
                return this.apply(handler, [payload]);
            } finally {
                this.handlers = saved;
            }
        }
        throw new SchemeError(payload, this.currentPosition());
    }

    private withExceptionHandler(handler: Value, thunk: Value): Value {
        const saved = this.handlers;
        this.handlers = [...saved, handler];
        try {
            return this.apply(thunk, []);
        } catch (error) {
            if (!(error instanceof SchemeError)) throw error;
            this.handlers = saved;
            // The handler runs after unwinding; returning from it is an error for `raise`.
            this.apply(handler, [error.payload]);
            throw this.fail("exception handler returned from a non-continuable exception:", error.payload);
        } finally {
            this.handlers = saved;
        }
    }

    private callWithCurrentContinuation(procedure: Value): Value {
        const continuation = new Continuation();
        const savedHandlers = this.handlers;
        const savedPorts = this.outputPorts.length;
        try {
            return this.apply(procedure, [continuation]);
        } catch (error) {
            if (error instanceof ContinuationInvoked && error.continuation === continuation) {
                this.handlers = savedHandlers;
                this.outputPorts.length = Math.max(1, savedPorts);
                return error.value;
            }
            throw error;
        } finally {
            continuation.active = false;
        }
    }

    // ---------------------------------------------------------------- primitives
    private installPrimitives() {
        const global = this.global;
        const def = (name: string, min: number, max: number, fn: (args: Value[]) => Value) => {
            global.define(intern(name), new Primitive(name, fn, min, max));
        };
        const alias = (name: string, target: string) => {
            const value = global.vars.get(intern(target));
            if (value instanceof Primitive) global.define(intern(name), new Primitive(name, value.fn, value.min, value.max));
        };
        const ANY = Number.POSITIVE_INFINITY;
        const fail = (message: string, ...irritants: Value[]) => this.fail(message, ...irritants);
        const num = (value: Value, who: string): Num => {
            if (!isNumber(value)) throw fail(`${who}: expected a number, got`, value);
            return value;
        };
        const integer = (value: Value, who: string): bigint | number => {
            if (!isInteger(value)) throw fail(`${who}: expected an integer, got`, value);
            return value as bigint | number;
        };
        const index = (value: Value, who: string): number => {
            if (typeof value === "bigint" && value >= B0 && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
            if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
            throw fail(`${who}: expected a non-negative exact integer, got`, value);
        };
        const str = (value: Value, who: string): string => {
            if (typeof value !== "string") throw fail(`${who}: expected a string, got`, value);
            return value;
        };
        const chr = (value: Value, who: string): Char => {
            if (!(value instanceof Char)) throw fail(`${who}: expected a character, got`, value);
            return value;
        };
        const symbolArg = (value: Value, who: string): Sym => {
            if (!(value instanceof Sym)) throw fail(`${who}: expected a symbol, got`, value);
            return value;
        };
        const pair = (value: Value, who: string): Pair => {
            if (!(value instanceof Pair)) throw fail(`${who}: expected a pair, got`, value);
            return value;
        };
        const vector = (value: Value, who: string): Value[] => {
            if (!Array.isArray(value)) throw fail(`${who}: expected a vector, got`, value);
            return value;
        };
        const procedure = (value: Value, who: string): SchemeProcedure => {
            if (!this.isProcedure(value)) throw fail(`${who}: expected a procedure, got`, value);
            return value as SchemeProcedure;
        };
        const list = (value: Value, who: string) => this.listToArray(value, who);
        const hashTable = (value: Value, who: string): HashTable => {
            if (!(value instanceof HashTable)) throw fail(`${who}: expected a hash table, got`, value);
            return value;
        };
        const chars = (text: string) => [...text];
        const range = (length: number, args: Value[], startAt: number, who: string): [number, number] => {
            const start = args.length > startAt ? index(args[startAt], who) : 0;
            const end = args.length > startAt + 1 ? index(args[startAt + 1], who) : length;
            if (start > end || end > length) throw fail(`${who}: index out of range`, BigInt(start), BigInt(end));
            return [start, end];
        };
        const outputPort = (args: Value[], at: number, who: string): Port => {
            if (args.length <= at) return this.currentOutput();
            const port = args[at];
            if (!(port instanceof Port) || port.kind === "input") throw fail(`${who}: expected an output port, got`, port);
            return port;
        };
        const inputPort = (args: Value[], at: number, who: string): Port => {
            if (args.length <= at) return this.stdin;
            const port = args[at];
            if (!(port instanceof Port) || port.kind !== "input") throw fail(`${who}: expected an input port, got`, port);
            return port;
        };
        const truthy = (value: Value) => value !== false;
        const call = (proc: Value, args: Value[]) => this.apply(proc, args);

        // ------------------------------------------------------ numbers
        def("+", 0, ANY, (args) => args.reduce<Num>((total, value) => numAdd(total, num(value, "+")), B0));
        def("*", 0, ANY, (args) => args.reduce<Num>((total, value) => numMul(total, num(value, "*")), B1));
        def("-", 1, ANY, (args) => {
            const first = num(args[0], "-");
            if (args.length === 1) return numNegate(first);
            return args.slice(1).reduce<Num>((total, value) => numSub(total, num(value, "-")), first);
        });
        def("/", 1, ANY, (args) => {
            const first = num(args[0], "/");
            if (args.length === 1) return numDiv(B1, first);
            return args.slice(1).reduce<Num>((total, value) => numDiv(total, num(value, "/")), first);
        });
        const compare = (name: string, test: (order: number) => boolean) => def(name, 1, ANY, (args) => {
            for (let position = 0; position < args.length - 1; position += 1) {
                const order = numCompare(num(args[position], name), num(args[position + 1], name));
                if (Number.isNaN(order) || !test(order)) return false;
            }
            if (args.length === 1) num(args[0], name);
            return true;
        });
        compare("=", (order) => order === 0);
        compare("<", (order) => order < 0);
        compare(">", (order) => order > 0);
        compare("<=", (order) => order <= 0);
        compare(">=", (order) => order >= 0);
        def("number?", 1, 1, ([value]) => isNumber(value));
        alias("complex?", "number?");
        def("real?", 1, 1, ([value]) => isNumber(value));
        def("rational?", 1, 1, ([value]) => isNumber(value) && (typeof value !== "number" || Number.isFinite(value)));
        def("integer?", 1, 1, ([value]) => isInteger(value));
        def("exact?", 1, 1, ([value]) => typeof num(value, "exact?") !== "number");
        def("inexact?", 1, 1, ([value]) => typeof num(value, "inexact?") === "number");
        def("exact-integer?", 1, 1, ([value]) => typeof value === "bigint");
        def("exact-rational?", 1, 1, ([value]) => typeof value === "bigint" || value instanceof Rational);
        def("exact-nonnegative-integer?", 1, 1, ([value]) => typeof value === "bigint" && value >= B0);
        def("nan?", 1, 1, ([value]) => Number.isNaN(toFloat(num(value, "nan?"))));
        def("infinite?", 1, 1, ([value]) => { const x = toFloat(num(value, "infinite?")); return x === Infinity || x === -Infinity; });
        def("finite?", 1, 1, ([value]) => Number.isFinite(toFloat(num(value, "finite?"))));
        def("zero?", 1, 1, ([value]) => numSign(num(value, "zero?")) === 0);
        def("positive?", 1, 1, ([value]) => numSign(num(value, "positive?")) > 0);
        def("negative?", 1, 1, ([value]) => numSign(num(value, "negative?")) < 0);
        def("odd?", 1, 1, ([value]) => { const n = integer(value, "odd?"); return typeof n === "bigint" ? n % B2 !== B0 : n % 2 !== 0; });
        def("even?", 1, 1, ([value]) => { const n = integer(value, "even?"); return typeof n === "bigint" ? n % B2 === B0 : n % 2 === 0; });
        def("max", 1, ANY, (args) => {
            let inexact = false;
            let best = num(args[0], "max");
            for (const value of args) {
                const n = num(value, "max");
                if (typeof n === "number") inexact = true;
                if (numCompare(n, best) > 0 || Number.isNaN(toFloat(n))) best = n;
            }
            return inexact ? toFloat(best) : best;
        });
        def("min", 1, ANY, (args) => {
            let inexact = false;
            let best = num(args[0], "min");
            for (const value of args) {
                const n = num(value, "min");
                if (typeof n === "number") inexact = true;
                if (numCompare(n, best) < 0 || Number.isNaN(toFloat(n))) best = n;
            }
            return inexact ? toFloat(best) : best;
        });
        def("abs", 1, 1, ([value]) => { const n = num(value, "abs"); return numSign(n) < 0 ? numNegate(n) : n; });
        alias("magnitude", "abs");
        const integerDivision = (who: string, kind: "truncate" | "floor") => (a: Value, b: Value): [Num, Num] => {
            const x = integer(a, who);
            const y = integer(b, who);
            if (typeof x === "bigint" && typeof y === "bigint") {
                if (y === B0) throw fail(`${who}: division by zero`);
                if (kind === "floor") return floorDivBig(x, y);
                return [x / y, x % y];
            }
            const fx = toFloat(x);
            const fy = toFloat(y);
            if (fy === 0) throw fail(`${who}: division by zero`);
            const quotient = kind === "floor" ? Math.floor(fx / fy) : Math.trunc(fx / fy);
            return [quotient, fx - quotient * fy];
        };
        def("quotient", 2, 2, ([a, b]) => integerDivision("quotient", "truncate")(a, b)[0]);
        def("remainder", 2, 2, ([a, b]) => integerDivision("remainder", "truncate")(a, b)[1]);
        def("modulo", 2, 2, ([a, b]) => integerDivision("modulo", "floor")(a, b)[1]);
        def("truncate-quotient", 2, 2, ([a, b]) => integerDivision("truncate-quotient", "truncate")(a, b)[0]);
        def("truncate-remainder", 2, 2, ([a, b]) => integerDivision("truncate-remainder", "truncate")(a, b)[1]);
        def("floor-quotient", 2, 2, ([a, b]) => integerDivision("floor-quotient", "floor")(a, b)[0]);
        def("floor-remainder", 2, 2, ([a, b]) => integerDivision("floor-remainder", "floor")(a, b)[1]);
        def("floor/", 2, 2, ([a, b]) => new MultipleValues(integerDivision("floor/", "floor")(a, b)));
        def("truncate/", 2, 2, ([a, b]) => new MultipleValues(integerDivision("truncate/", "truncate")(a, b)));
        def("gcd", 0, ANY, (args) => {
            let result = B0;
            let inexact = false;
            for (const value of args) {
                const n = integer(value, "gcd");
                if (typeof n === "number") inexact = true;
                result = gcdBig(result, typeof n === "bigint" ? n : BigInt(n));
            }
            return inexact ? Number(result) : result;
        });
        def("lcm", 0, ANY, (args) => {
            let result = B1;
            let inexact = false;
            for (const value of args) {
                const n = integer(value, "lcm");
                if (typeof n === "number") inexact = true;
                const big = absBig(typeof n === "bigint" ? n : BigInt(n));
                if (big === B0) return inexact ? 0 : B0;
                result = (result * big) / gcdBig(result, big);
            }
            return inexact ? Number(result) : result;
        });
        def("numerator", 1, 1, ([value]) => {
            const n = num(value, "numerator");
            const exact = toExact(n);
            const result = exact instanceof Rational ? exact.num : exact;
            return typeof n === "number" ? Number(result) : result;
        });
        def("denominator", 1, 1, ([value]) => {
            const n = num(value, "denominator");
            const exact = toExact(n);
            const result = exact instanceof Rational ? exact.den : B1;
            return typeof n === "number" ? Number(result) : result;
        });
        const rounding = (name: string, float: (x: number) => number, exact: (value: Rational) => bigint) => def(name, 1, 1, ([value]) => {
            const n = num(value, name);
            if (typeof n === "number") return float(n);
            if (typeof n === "bigint") return n;
            return exact(n);
        });
        const roundEven = (x: number) => {
            const rounded = Math.round(x);
            return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : rounded;
        };
        rounding("floor", Math.floor, (value) => floorDivBig(value.num, value.den)[0]);
        rounding("ceiling", Math.ceil, (value) => -floorDivBig(-value.num, value.den)[0]);
        rounding("truncate", Math.trunc, (value) => value.num / value.den);
        rounding("round", roundEven, (value) => {
            const [floor, remainder] = floorDivBig(value.num, value.den);
            const twice = remainder * B2;
            if (twice < value.den) return floor;
            if (twice > value.den) return floor + B1;
            return floor % B2 === B0 ? floor : floor + B1;
        });
        const floatFunction = (name: string, fn: (x: number) => number) => def(name, 1, 1, ([value]) => fn(toFloat(num(value, name))));
        floatFunction("exp", Math.exp);
        floatFunction("sin", Math.sin);
        floatFunction("cos", Math.cos);
        floatFunction("tan", Math.tan);
        floatFunction("asin", Math.asin);
        floatFunction("acos", Math.acos);
        def("log", 1, 2, ([value, base]) => {
            const x = toFloat(num(value, "log"));
            return base === undefined ? Math.log(x) : Math.log(x) / Math.log(toFloat(num(base, "log")));
        });
        def("atan", 1, 2, ([y, x]) => (x === undefined ? Math.atan(toFloat(num(y, "atan"))) : Math.atan2(toFloat(num(y, "atan")), toFloat(num(x, "atan")))));
        def("sqrt", 1, 1, ([value]) => {
            const n = num(value, "sqrt");
            if (numSign(n) < 0) throw fail("sqrt: complex numbers are not supported", value);
            if (typeof n === "bigint") {
                const root = isqrt(n);
                return root * root === n ? root : Math.sqrt(Number(n));
            }
            if (n instanceof Rational) {
                const top = isqrt(n.num);
                const bottom = isqrt(n.den);
                if (top * top === n.num && bottom * bottom === n.den) return makeRational(top, bottom);
                return Math.sqrt(toFloat(n));
            }
            return Math.sqrt(n);
        });
        def("exact-integer-sqrt", 1, 1, ([value]) => {
            if (typeof value !== "bigint" || value < B0) throw fail("exact-integer-sqrt: expected a non-negative exact integer, got", value);
            const root = isqrt(value);
            return new MultipleValues([root, value - root * root]);
        });
        def("expt", 2, 2, ([base, power]) => {
            const b = num(base, "expt");
            const e = num(power, "expt");
            if (typeof e === "bigint" && typeof b !== "number") {
                if (e >= B0) {
                    const bits = b instanceof Rational ? Math.max(bitLength(b.num), bitLength(b.den)) : bitLength(b);
                    if (bits * Number(e) > 4_000_000) throw fail("expt: the result is too large");
                    return b instanceof Rational ? makeRational(b.num ** e, b.den ** e) : b ** e;
                }
                if (numSign(b) === 0) throw fail("expt: division by zero");
                const positive = -e;
                const bits = b instanceof Rational ? Math.max(bitLength(b.num), bitLength(b.den)) : bitLength(b);
                if (bits * Number(positive) > 4_000_000) throw fail("expt: the result is too large");
                return numDiv(B1, b instanceof Rational ? makeRational(b.num ** positive, b.den ** positive) : b ** positive);
            }
            const result = Math.pow(toFloat(b), toFloat(e));
            if (Number.isNaN(result) && !Number.isNaN(toFloat(b)) && !Number.isNaN(toFloat(e))) throw fail("expt: complex results are not supported", base, power);
            return result;
        });
        def("square", 1, 1, ([value]) => { const n = num(value, "square"); return numMul(n, n); });
        def("cube", 1, 1, ([value]) => { const n = num(value, "cube"); return numMul(n, numMul(n, n)); });
        def("1+", 1, 1, ([value]) => numAdd(num(value, "1+"), B1));
        def("-1+", 1, 1, ([value]) => numSub(num(value, "-1+"), B1));
        alias("1-", "-1+");
        alias("add1", "1+");
        alias("sub1", "-1+");
        def("exact", 1, 1, ([value]) => toExact(num(value, "exact")));
        def("inexact", 1, 1, ([value]) => toFloat(num(value, "inexact")));
        alias("inexact->exact", "exact");
        alias("exact->inexact", "inexact");
        def("number->string", 1, 2, ([value, radix]) => {
            const base = radix === undefined ? 10 : index(radix, "number->string");
            if (![2, 8, 10, 16].includes(base)) throw fail("number->string: radix must be 2, 8, 10 or 16", radix);
            return formatNumber(num(value, "number->string"), base);
        });
        def("string->number", 1, 2, ([text, radix]) => {
            const base = radix === undefined ? 10 : index(radix, "string->number");
            return parseNumber(str(text, "string->number").trim(), base) ?? false;
        });
        def("random", 1, 1, ([limit]) => {
            const n = num(limit, "random");
            if (typeof n === "number") return Math.random() * n;
            if (typeof n !== "bigint" || n <= B0) throw fail("random: expected a positive integer, got", limit);
            if (n <= BigInt(Number.MAX_SAFE_INTEGER)) return BigInt(Math.floor(Math.random() * Number(n)));
            let result = B0;
            for (let bits = 0; bits < bitLength(n) + 16; bits += 30) result = (result << BigInt(30)) | BigInt(Math.floor(Math.random() * 2 ** 30));
            return result % n;
        });

        // ------------------------------------------------------ booleans and equality
        def("not", 1, 1, ([value]) => value === false);
        def("boolean?", 1, 1, ([value]) => typeof value === "boolean");
        def("boolean=?", 2, ANY, (args) => args.every((value) => value === args[0]));
        def("eq?", 2, 2, ([a, b]) => a === b || (typeof a === "number" && typeof b === "number" && Object.is(a, b)));
        def("eqv?", 2, 2, ([a, b]) => isEqv(a, b));
        def("equal?", 2, 2, ([a, b]) => isEqual(a, b));

        // ------------------------------------------------------ pairs and lists
        def("cons", 2, 2, ([a, b]) => cons(a, b));
        def("car", 1, 1, ([value]) => pair(value, "car").car);
        def("cdr", 1, 1, ([value]) => pair(value, "cdr").cdr);
        def("set-car!", 2, 2, ([target, value]) => { pair(target, "set-car!").car = value; return UNSPECIFIED; });
        def("set-cdr!", 2, 2, ([target, value]) => { pair(target, "set-cdr!").cdr = value; return UNSPECIFIED; });
        for (const path of ["aa", "ad", "da", "dd", "aaa", "aad", "ada", "add", "daa", "dad", "dda", "ddd", "addd", "dddd"]) {
            const name = `c${path}r`;
            def(name, 1, 1, ([value]) => {
                let current = value;
                for (let position = path.length - 1; position >= 0; position -= 1) {
                    const cell = pair(current, name);
                    current = path[position] === "a" ? cell.car : cell.cdr;
                }
                return current;
            });
        }
        def("pair?", 1, 1, ([value]) => value instanceof Pair);
        def("null?", 1, 1, ([value]) => value === NIL);
        def("list?", 1, 1, ([value]) => isList(value));
        def("list", 0, ANY, (args) => arrayToList(args));
        def("cons*", 1, ANY, (args) => arrayToList(args.slice(0, -1), args[args.length - 1]));
        alias("list*", "cons*");
        def("make-list", 1, 2, ([count, fill]) => arrayToList(Array.from({ length: index(count, "make-list") }, () => fill ?? UNSPECIFIED)));
        def("length", 1, 1, ([value]) => BigInt(list(value, "length").length));
        def("append", 0, ANY, (args) => {
            if (!args.length) return NIL;
            let result = args[args.length - 1];
            for (let position = args.length - 2; position >= 0; position -= 1) result = arrayToList(list(args[position], "append"), result);
            return result;
        });
        alias("append!", "append");
        def("reverse", 1, 1, ([value]) => arrayToList(list(value, "reverse").reverse()));
        alias("reverse!", "reverse");
        def("list-tail", 2, 2, ([value, k]) => {
            let current = value;
            for (let count = index(k, "list-tail"); count > 0; count -= 1) current = pair(current, "list-tail").cdr;
            return current;
        });
        def("list-ref", 2, 2, ([value, k]) => {
            let current = value;
            for (let count = index(k, "list-ref"); count > 0; count -= 1) current = pair(current, "list-ref").cdr;
            return pair(current, "list-ref").car;
        });
        def("list-set!", 3, 3, ([value, k, item]) => {
            let current = value;
            for (let count = index(k, "list-set!"); count > 0; count -= 1) current = pair(current, "list-set!").cdr;
            pair(current, "list-set!").car = item;
            return UNSPECIFIED;
        });
        def("list-copy", 1, 1, ([value]) => (value instanceof Pair ? arrayToList(list(value, "list-copy")) : value));
        def("last-pair", 1, 1, ([value]) => {
            let current = pair(value, "last-pair");
            while (current.cdr instanceof Pair) current = current.cdr;
            return current;
        });
        def("last", 1, 1, ([value]) => {
            const items = list(value, "last");
            if (!items.length) throw fail("last: empty list");
            return items[items.length - 1];
        });
        ["first", "second", "third", "fourth", "fifth"].forEach((name, position) => def(name, 1, 1, ([value]) => {
            const items = list(value, name);
            if (items.length <= position) throw fail(`${name}: list is too short`, value);
            return items[position];
        }));
        const member = (name: string, same: (a: Value, b: Value) => boolean) => def(name, 2, 3, ([item, value, compare]) => {
            let current = value;
            while (current instanceof Pair) {
                if (compare ? truthy(call(compare, [item, current.car])) : same(item, current.car)) return current;
                current = current.cdr;
            }
            return false;
        });
        member("memq", (a, b) => a === b);
        member("memv", isEqv);
        member("member", isEqual);
        const assoc = (name: string, same: (a: Value, b: Value) => boolean) => def(name, 2, 3, ([key, value, compare]) => {
            for (const entry of list(value, name)) {
                const cell = pair(entry, name);
                if (compare ? truthy(call(compare, [key, cell.car])) : same(key, cell.car)) return cell;
            }
            return false;
        });
        assoc("assq", (a, b) => a === b);
        assoc("assv", isEqv);
        assoc("assoc", isEqual);
        def("map", 2, ANY, ([proc, ...lists]) => {
            procedure(proc, "map");
            const arrays = lists.map((value) => list(value, "map"));
            const length = Math.min(...arrays.map((items) => items.length));
            const results: Value[] = [];
            for (let position = 0; position < length; position += 1) results.push(call(proc, arrays.map((items) => items[position])));
            return arrayToList(results);
        });
        def("for-each", 2, ANY, ([proc, ...lists]) => {
            procedure(proc, "for-each");
            const arrays = lists.map((value) => list(value, "for-each"));
            const length = Math.min(...arrays.map((items) => items.length));
            for (let position = 0; position < length; position += 1) call(proc, arrays.map((items) => items[position]));
            return UNSPECIFIED;
        });
        def("append-map", 2, 2, ([proc, value]) => arrayToList(list(value, "append-map").flatMap((item) => list(call(proc, [item]), "append-map"))));
        def("filter-map", 2, 2, ([proc, value]) => arrayToList(list(value, "filter-map").map((item) => call(proc, [item])).filter(truthy)));
        def("filter", 2, 2, ([pred, value]) => arrayToList(list(value, "filter").filter((item) => truthy(call(pred, [item])))));
        def("remove", 2, 2, ([pred, value]) => arrayToList(list(value, "remove").filter((item) => !truthy(call(pred, [item])))));
        def("partition", 2, 2, ([pred, value]) => {
            const yes: Value[] = [];
            const no: Value[] = [];
            for (const item of list(value, "partition")) (truthy(call(pred, [item])) ? yes : no).push(item);
            return new MultipleValues([arrayToList(yes), arrayToList(no)]);
        });
        def("delete", 2, 3, ([item, value, compare]) => arrayToList(list(value, "delete").filter((element) => !(compare ? truthy(call(compare, [item, element])) : isEqual(item, element)))));
        def("delete-duplicates", 1, 2, ([value, compare]) => {
            const result: Value[] = [];
            for (const item of list(value, "delete-duplicates")) {
                if (!result.some((existing) => (compare ? truthy(call(compare, [existing, item])) : isEqual(existing, item)))) result.push(item);
            }
            return arrayToList(result);
        });
        def("fold-left", 3, ANY, ([proc, initial, ...lists]) => {
            const arrays = lists.map((value) => list(value, "fold-left"));
            const length = Math.min(...arrays.map((items) => items.length));
            let accumulator = initial;
            for (let position = 0; position < length; position += 1) accumulator = call(proc, [accumulator, ...arrays.map((items) => items[position])]);
            return accumulator;
        });
        def("fold-right", 3, ANY, ([proc, initial, ...lists]) => {
            const arrays = lists.map((value) => list(value, "fold-right"));
            const length = Math.min(...arrays.map((items) => items.length));
            let accumulator = initial;
            for (let position = length - 1; position >= 0; position -= 1) accumulator = call(proc, [...arrays.map((items) => items[position]), accumulator]);
            return accumulator;
        });
        def("fold", 3, ANY, ([proc, initial, ...lists]) => {
            const arrays = lists.map((value) => list(value, "fold"));
            const length = Math.min(...arrays.map((items) => items.length));
            let accumulator = initial;
            for (let position = 0; position < length; position += 1) accumulator = call(proc, [...arrays.map((items) => items[position]), accumulator]);
            return accumulator;
        });
        def("reduce", 3, 3, ([proc, initial, value]) => {
            const items = list(value, "reduce");
            if (!items.length) return initial;
            let accumulator = items[0];
            for (const item of items.slice(1)) accumulator = call(proc, [item, accumulator]);
            return accumulator;
        });
        alias("reduce-left", "reduce");
        def("find", 2, 2, ([pred, value]) => list(value, "find").find((item) => truthy(call(pred, [item]))) ?? false);
        def("find-tail", 2, 2, ([pred, value]) => {
            let current = value;
            while (current instanceof Pair) {
                if (truthy(call(pred, [current.car]))) return current;
                current = current.cdr;
            }
            return false;
        });
        def("list-index", 2, 2, ([pred, value]) => {
            const position = list(value, "list-index").findIndex((item) => truthy(call(pred, [item])));
            return position < 0 ? false : BigInt(position);
        });
        def("any", 2, 2, ([pred, value]) => {
            for (const item of list(value, "any")) {
                const result = call(pred, [item]);
                if (truthy(result)) return result;
            }
            return false;
        });
        def("every", 2, 2, ([pred, value]) => {
            let result: Value = true;
            for (const item of list(value, "every")) {
                result = call(pred, [item]);
                if (!truthy(result)) return false;
            }
            return result;
        });
        def("count", 2, 2, ([pred, value]) => BigInt(list(value, "count").filter((item) => truthy(call(pred, [item]))).length));
        def("iota", 1, 3, ([count, start, step]) => {
            const total = index(count, "iota");
            const from = start === undefined ? B0 : num(start, "iota");
            const by = step === undefined ? B1 : num(step, "iota");
            const items: Value[] = [];
            let current: Num = from;
            for (let position = 0; position < total; position += 1) {
                items.push(current);
                current = numAdd(current, by);
            }
            return arrayToList(items);
        });
        def("list-tabulate", 2, 2, ([count, proc]) => arrayToList(Array.from({ length: index(count, "list-tabulate") }, (_, position) => call(proc, [BigInt(position)]))));
        def("take", 2, 2, ([value, k]) => {
            const items = list(value, "take");
            const count = index(k, "take");
            if (count > items.length) throw fail("take: list is too short", value);
            return arrayToList(items.slice(0, count));
        });
        alias("list-head", "take");
        def("drop", 2, 2, ([value, k]) => {
            let current = value;
            for (let count = index(k, "drop"); count > 0; count -= 1) current = pair(current, "drop").cdr;
            return current;
        });
        def("sublist", 3, 3, ([value, start, end]) => {
            const items = list(value, "sublist");
            const [from, to] = range(items.length, [start, end], 0, "sublist");
            return arrayToList(items.slice(from, to));
        });
        def("take-while", 2, 2, ([pred, value]) => {
            const result: Value[] = [];
            for (const item of list(value, "take-while")) {
                if (!truthy(call(pred, [item]))) break;
                result.push(item);
            }
            return arrayToList(result);
        });
        def("drop-while", 2, 2, ([pred, value]) => {
            let current = value;
            while (current instanceof Pair && truthy(call(pred, [current.car]))) current = current.cdr;
            return current;
        });
        const sortItems = (items: Value[], less: Value) => [...items].sort((a, b) => (truthy(call(less, [a, b])) ? -1 : truthy(call(less, [b, a])) ? 1 : 0));
        def("sort", 2, 2, ([first, second]) => {
            const [sequence, less] = this.isProcedure(first) ? [second, first] : [first, second];
            procedure(less, "sort");
            if (Array.isArray(sequence)) return sortItems(sequence, less);
            return arrayToList(sortItems(list(sequence, "sort"), less));
        });
        alias("sort!", "sort");
        alias("list-sort", "sort");
        def("vector-sort", 2, 2, ([first, second]) => {
            const [sequence, less] = this.isProcedure(first) ? [second, first] : [first, second];
            return sortItems(vector(sequence, "vector-sort"), less);
        });
        def("apply", 1, ANY, ([proc, ...rest]) => {
            if (!rest.length) return call(proc, []);
            const spread = list(rest[rest.length - 1], "apply");
            return call(procedure(proc, "apply"), [...rest.slice(0, -1), ...spread]);
        });

        // ------------------------------------------------------ symbols
        def("symbol?", 1, 1, ([value]) => value instanceof Sym);
        def("symbol->string", 1, 1, ([value]) => symbolArg(value, "symbol->string").name);
        def("string->symbol", 1, 1, ([value]) => intern(str(value, "string->symbol")));
        def("symbol=?", 2, ANY, (args) => args.every((value) => symbolArg(value, "symbol=?") === args[0]));
        def("gensym", 0, 1, ([prefix]) => {
            this.gensymCounter += 1;
            const base = prefix instanceof Sym ? prefix.name : typeof prefix === "string" ? prefix : "g";
            return new Sym(`${base}${this.gensymCounter}`);
        });
        alias("generate-uninterned-symbol", "gensym");
        def("symbol-append", 0, ANY, (args) => intern(args.map((value) => symbolArg(value, "symbol-append").name).join("")));

        // ------------------------------------------------------ characters
        def("char?", 1, 1, ([value]) => value instanceof Char);
        def("char->integer", 1, 1, ([value]) => BigInt(chr(value, "char->integer").code));
        def("integer->char", 1, 1, ([value]) => {
            const code = index(value, "integer->char");
            if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw fail("integer->char: not a Unicode scalar value", value);
            return makeChar(code);
        });
        const charText = (value: Value, who: string) => String.fromCodePoint(chr(value, who).code);
        def("char-upcase", 1, 1, ([value]) => makeChar(charText(value, "char-upcase").toUpperCase().codePointAt(0)!));
        def("char-downcase", 1, 1, ([value]) => makeChar(charText(value, "char-downcase").toLowerCase().codePointAt(0)!));
        alias("char-foldcase", "char-downcase");
        def("char-alphabetic?", 1, 1, ([value]) => /\p{L}/u.test(charText(value, "char-alphabetic?")));
        def("char-numeric?", 1, 1, ([value]) => /\p{Nd}/u.test(charText(value, "char-numeric?")));
        def("char-whitespace?", 1, 1, ([value]) => /\s/u.test(charText(value, "char-whitespace?")));
        def("char-upper-case?", 1, 1, ([value]) => /\p{Lu}/u.test(charText(value, "char-upper-case?")));
        def("char-lower-case?", 1, 1, ([value]) => /\p{Ll}/u.test(charText(value, "char-lower-case?")));
        def("digit-value", 1, 1, ([value]) => {
            const text = charText(value, "digit-value");
            return /^[0-9]$/.test(text) ? BigInt(Number(text)) : false;
        });
        const charCompare = (name: string, fold: boolean, test: (a: number, b: number) => boolean) => def(name, 1, ANY, (args) => {
            const codes = args.map((value) => {
                const text = charText(value, name);
                return (fold ? text.toLowerCase() : text).codePointAt(0)!;
            });
            return codes.every((code, position) => position === 0 || test(codes[position - 1], code));
        });
        charCompare("char=?", false, (a, b) => a === b);
        charCompare("char<?", false, (a, b) => a < b);
        charCompare("char>?", false, (a, b) => a > b);
        charCompare("char<=?", false, (a, b) => a <= b);
        charCompare("char>=?", false, (a, b) => a >= b);
        charCompare("char-ci=?", true, (a, b) => a === b);
        charCompare("char-ci<?", true, (a, b) => a < b);
        charCompare("char-ci>?", true, (a, b) => a > b);

        // ------------------------------------------------------ strings
        def("string?", 1, 1, ([value]) => typeof value === "string");
        def("make-string", 1, 2, ([count, fill]) => (fill === undefined ? " " : charText(fill, "make-string")).repeat(index(count, "make-string")));
        def("string", 0, ANY, (args) => args.map((value) => (typeof value === "string" ? value : charText(value, "string"))).join(""));
        def("string-length", 1, 1, ([value]) => BigInt(chars(str(value, "string-length")).length));
        def("string-ref", 2, 2, ([value, k]) => {
            const items = chars(str(value, "string-ref"));
            const position = index(k, "string-ref");
            if (position >= items.length) throw fail(`string-ref: index ${position} is out of range for a string of length ${items.length}`);
            return makeChar(items[position].codePointAt(0)!);
        });
        def("substring", 2, 3, ([value, start, end]) => {
            const items = chars(str(value, "substring"));
            const [from, to] = range(items.length, end === undefined ? [start] : [start, end], 0, "substring");
            return items.slice(from, to).join("");
        });
        def("string-append", 0, ANY, (args) => args.map((value) => str(value, "string-append")).join(""));
        def("string-copy", 1, 3, (args) => {
            const items = chars(str(args[0], "string-copy"));
            const [from, to] = range(items.length, args, 1, "string-copy");
            return items.slice(from, to).join("");
        });
        const immutable = (name: string) => def(name, 0, ANY, () => { throw fail(`${name}: strings are immutable in Hanogt Scheme; build a new string instead`); });
        immutable("string-set!");
        immutable("string-fill!");
        immutable("string-copy!");
        def("string->list", 1, 3, (args) => {
            const items = chars(str(args[0], "string->list"));
            const [from, to] = range(items.length, args, 1, "string->list");
            return arrayToList(items.slice(from, to).map((char) => makeChar(char.codePointAt(0)!)));
        });
        def("list->string", 1, 1, ([value]) => list(value, "list->string").map((item) => charText(item, "list->string")).join(""));
        def("string->vector", 1, 1, ([value]) => chars(str(value, "string->vector")).map((char) => makeChar(char.codePointAt(0)!)));
        def("vector->string", 1, 1, ([value]) => vector(value, "vector->string").map((item) => charText(item, "vector->string")).join(""));
        def("string-upcase", 1, 1, ([value]) => str(value, "string-upcase").toUpperCase());
        def("string-downcase", 1, 1, ([value]) => str(value, "string-downcase").toLowerCase());
        alias("string-foldcase", "string-downcase");
        const stringCompare = (name: string, fold: boolean, test: (order: number) => boolean) => def(name, 1, ANY, (args) => {
            const texts = args.map((value) => (fold ? str(value, name).toLowerCase() : str(value, name)));
            return texts.every((text, position) => position === 0 || test(texts[position - 1] < text ? -1 : texts[position - 1] > text ? 1 : 0));
        });
        stringCompare("string=?", false, (order) => order === 0);
        stringCompare("string<?", false, (order) => order < 0);
        stringCompare("string>?", false, (order) => order > 0);
        stringCompare("string<=?", false, (order) => order <= 0);
        stringCompare("string>=?", false, (order) => order >= 0);
        stringCompare("string-ci=?", true, (order) => order === 0);
        stringCompare("string-ci<?", true, (order) => order < 0);
        stringCompare("string-ci>?", true, (order) => order > 0);
        def("string-null?", 1, 1, ([value]) => str(value, "string-null?") === "");
        def("string-contains", 2, 2, ([value, needle]) => {
            const position = str(value, "string-contains").indexOf(str(needle, "string-contains"));
            return position < 0 ? false : BigInt(chars(str(value, "string-contains").slice(0, position)).length);
        });
        alias("string-search-forward", "string-contains");
        def("string-index", 2, 2, ([value, predicate]) => {
            const items = chars(str(value, "string-index"));
            const position = items.findIndex((char) => (predicate instanceof Char ? char.codePointAt(0) === predicate.code : truthy(call(predicate, [makeChar(char.codePointAt(0)!)]))));
            return position < 0 ? false : BigInt(position);
        });
        def("string-prefix?", 2, 2, ([prefix, value]) => str(value, "string-prefix?").startsWith(str(prefix, "string-prefix?")));
        def("string-suffix?", 2, 2, ([suffix, value]) => str(value, "string-suffix?").endsWith(str(suffix, "string-suffix?")));
        def("string-reverse", 1, 1, ([value]) => chars(str(value, "string-reverse")).reverse().join(""));
        def("string-trim", 1, 1, ([value]) => str(value, "string-trim").trim());
        def("string-trim-left", 1, 1, ([value]) => str(value, "string-trim-left").trimStart());
        def("string-trim-right", 1, 1, ([value]) => str(value, "string-trim-right").trimEnd());
        def("string-split", 1, 2, ([value, separator]) => {
            const text = str(value, "string-split");
            if (separator === undefined) return arrayToList(text.split(/\s+/).filter(Boolean));
            const by = separator instanceof Char ? String.fromCodePoint(separator.code) : str(separator, "string-split");
            return arrayToList(text.split(by));
        });
        def("string-join", 1, 2, ([value, separator]) => list(value, "string-join").map((item) => str(item, "string-join")).join(separator === undefined ? " " : str(separator, "string-join")));
        def("string-map", 2, 2, ([proc, value]) => chars(str(value, "string-map")).map((char) => charText(call(proc, [makeChar(char.codePointAt(0)!)]), "string-map")).join(""));
        def("string-for-each", 2, 2, ([proc, value]) => {
            for (const char of chars(str(value, "string-for-each"))) call(proc, [makeChar(char.codePointAt(0)!)]);
            return UNSPECIFIED;
        });

        // ------------------------------------------------------ vectors
        def("vector?", 1, 1, ([value]) => Array.isArray(value));
        def("vector", 0, ANY, (args) => [...args]);
        def("make-vector", 1, 2, ([count, fill]) => {
            const size = index(count, "make-vector");
            if (size > 10_000_000) throw fail("make-vector: the vector is too large", count);
            return Array.from({ length: size }, () => fill ?? false);
        });
        def("vector-length", 1, 1, ([value]) => BigInt(vector(value, "vector-length").length));
        def("vector-ref", 2, 2, ([value, k]) => {
            const items = vector(value, "vector-ref");
            const position = index(k, "vector-ref");
            if (position >= items.length) throw fail(`vector-ref: index ${position} is out of range for a vector of length ${items.length}`);
            return items[position];
        });
        def("vector-set!", 3, 3, ([value, k, item]) => {
            const items = vector(value, "vector-set!");
            const position = index(k, "vector-set!");
            if (position >= items.length) throw fail(`vector-set!: index ${position} is out of range for a vector of length ${items.length}`);
            items[position] = item;
            return UNSPECIFIED;
        });
        def("vector->list", 1, 3, (args) => {
            const items = vector(args[0], "vector->list");
            const [from, to] = range(items.length, args, 1, "vector->list");
            return arrayToList(items.slice(from, to));
        });
        def("list->vector", 1, 1, ([value]) => list(value, "list->vector"));
        def("vector-fill!", 2, 4, (args) => {
            const items = vector(args[0], "vector-fill!");
            const [from, to] = range(items.length, args, 2, "vector-fill!");
            items.fill(args[1], from, to);
            return UNSPECIFIED;
        });
        def("vector-copy", 1, 3, (args) => {
            const items = vector(args[0], "vector-copy");
            const [from, to] = range(items.length, args, 1, "vector-copy");
            return items.slice(from, to);
        });
        alias("subvector", "vector-copy");
        def("vector-copy!", 3, 5, (args) => {
            const target = vector(args[0], "vector-copy!");
            const at = index(args[1], "vector-copy!");
            const source = vector(args[2], "vector-copy!");
            const [from, to] = range(source.length, args, 3, "vector-copy!");
            if (at + (to - from) > target.length) throw fail("vector-copy!: the target vector is too small");
            const slice = source.slice(from, to);
            slice.forEach((item, offset) => { target[at + offset] = item; });
            return UNSPECIFIED;
        });
        def("vector-append", 0, ANY, (args) => args.flatMap((value) => vector(value, "vector-append")));
        def("vector-map", 2, ANY, ([proc, ...vectors]) => {
            const arrays = vectors.map((value) => vector(value, "vector-map"));
            const length = Math.min(...arrays.map((items) => items.length));
            return Array.from({ length }, (_, position) => call(proc, arrays.map((items) => items[position])));
        });
        def("vector-for-each", 2, ANY, ([proc, ...vectors]) => {
            const arrays = vectors.map((value) => vector(value, "vector-for-each"));
            const length = Math.min(...arrays.map((items) => items.length));
            for (let position = 0; position < length; position += 1) call(proc, arrays.map((items) => items[position]));
            return UNSPECIFIED;
        });

        // ------------------------------------------------------ control
        def("procedure?", 1, 1, ([value]) => this.isProcedure(value));
        def("values", 0, ANY, (args) => (args.length === 1 ? args[0] : new MultipleValues(args)));
        def("call-with-values", 2, 2, ([producer, consumer]) => call(consumer, this.valuesOf(call(producer, []))));
        def("call-with-current-continuation", 1, 1, ([proc]) => this.callWithCurrentContinuation(proc));
        alias("call/cc", "call-with-current-continuation");
        def("call-with-escape-continuation", 1, 1, ([proc]) => this.callWithCurrentContinuation(proc));
        alias("call/ec", "call-with-escape-continuation");
        def("dynamic-wind", 3, 3, ([before, thunk, after]) => {
            call(before, []);
            try {
                return call(thunk, []);
            } finally {
                call(after, []);
            }
        });
        def("force", 1, 1, ([value]) => this.force(value));
        def("make-promise", 1, 1, ([value]) => (value instanceof SchemePromise ? value : new SchemePromise(true, value, null, null, false)));
        def("promise?", 1, 1, ([value]) => value instanceof SchemePromise);
        def("make-parameter", 1, 2, ([value, converter]) => new Parameter(converter === undefined ? value : call(converter, [value]), converter ?? null));
        def("eval", 1, 2, ([expression]) => this.eval(expression, this.global));
        def("interaction-environment", 0, 0, () => this.global);
        def("system-global-environment", 0, 0, () => this.global);
        def("scheme-report-environment", 0, 1, () => this.global);
        def("null-environment", 0, 1, () => this.global);
        def("environment", 0, ANY, () => this.global);
        def("void", 0, ANY, () => UNSPECIFIED);
        def("exit", 0, 1, ([code]) => {
            if (code === undefined || code === true) throw new ExitSignal(0);
            if (code === false) throw new ExitSignal(1);
            throw new ExitSignal(typeof code === "bigint" ? Number(code) : 1);
        });
        alias("emergency-exit", "exit");
        def("runtime", 0, 0, () => Date.now() / 1000);
        def("current-second", 0, 0, () => Date.now() / 1000);
        def("current-jiffy", 0, 0, () => BigInt(Math.round(performance.now() * 1000)));
        def("jiffies-per-second", 0, 0, () => BigInt(1_000_000));
        def("current-time", 0, 0, () => BigInt(Math.floor(Date.now() / 1000)));
        def("command-line", 0, 0, () => arrayToList([this.options.fileName ?? "main.scm"]));
        def("get-environment-variable", 1, 1, () => false);
        def("load", 1, 1, () => { throw fail("load: there is no file system in the browser runtime"); });

        // ------------------------------------------------------ errors
        def("error", 0, ANY, (args) => {
            let message = "error";
            let irritants = args;
            if (typeof args[0] === "string") {
                message = args[0];
                irritants = args.slice(1);
            } else if (args[0] instanceof Sym) {
                message = typeof args[1] === "string" ? `${args[0].name}: ${args[1]}` : args[0].name;
                irritants = args.slice(typeof args[1] === "string" ? 2 : 1);
            }
            throw new SchemeError(new ErrorObject(message, irritants), this.currentPosition());
        });
        def("raise", 1, 1, ([value]) => this.raise(value, false));
        def("raise-continuable", 1, 1, ([value]) => this.raise(value, true));
        def("with-exception-handler", 2, 2, ([handler, thunk]) => this.withExceptionHandler(procedure(handler, "with-exception-handler"), procedure(thunk, "with-exception-handler")));
        def("error-object?", 1, 1, ([value]) => value instanceof ErrorObject);
        def("error-object-message", 1, 1, ([value]) => (value instanceof ErrorObject ? value.message : ""));
        def("error-object-irritants", 1, 1, ([value]) => (value instanceof ErrorObject ? arrayToList(value.irritants) : NIL));
        alias("condition/report-string", "error-object-message");
        def("error-message", 1, 1, ([value]) => (value instanceof ErrorObject ? value.message : printValue(value, false)));
        def("file-error?", 1, 1, () => false);
        def("read-error?", 1, 1, () => false);

        // ------------------------------------------------------ streams (SICP)
        global.define(intern("the-empty-stream"), NIL);
        global.define(intern("stream-nil"), NIL);
        def("stream-car", 1, 1, ([value]) => pair(value, "stream-car").car);
        def("stream-cdr", 1, 1, ([value]) => this.force(pair(value, "stream-cdr").cdr));
        alias("stream-rest", "stream-cdr");
        alias("stream-first", "stream-car");
        def("stream-pair?", 1, 1, ([value]) => value instanceof Pair && value.cdr instanceof SchemePromise);
        def("stream-null?", 1, 1, ([value]) => value === NIL);
        alias("empty-stream?", "stream-null?");
        def("stream-head", 2, 2, ([value, k]) => {
            const items: Value[] = [];
            let current = value;
            for (let count = index(k, "stream-head"); count > 0; count -= 1) {
                const cell = pair(current, "stream-head");
                items.push(cell.car);
                current = this.force(cell.cdr);
            }
            return arrayToList(items);
        });
        def("stream-tail", 2, 2, ([value, k]) => {
            let current = value;
            for (let count = index(k, "stream-tail"); count > 0; count -= 1) current = this.force(pair(current, "stream-tail").cdr);
            return current;
        });

        // ------------------------------------------------------ hash tables
        def("make-hash-table", 0, ANY, () => new HashTable());
        alias("make-equal-hash-table", "make-hash-table");
        alias("make-strong-eqv-hash-table", "make-hash-table");
        alias("make-string-hash-table", "make-hash-table");
        alias("make-hash", "make-hash-table");
        def("hash-table?", 1, 1, ([value]) => value instanceof HashTable);
        def("hash-table-set!", 3, 3, ([table, key, value]) => { hashTable(table, "hash-table-set!").map.set(hashKey(key), [key, value]); return UNSPECIFIED; });
        alias("hash-table/put!", "hash-table-set!");
        alias("hash-set!", "hash-table-set!");
        def("hash-table-ref", 2, 3, ([table, key, failure]) => {
            const entry = hashTable(table, "hash-table-ref").map.get(hashKey(key));
            if (entry) return entry[1];
            if (failure !== undefined) return call(failure, []);
            throw fail("hash-table-ref: key not found", key);
        });
        def("hash-table-ref/default", 3, 3, ([table, key, fallback]) => hashTable(table, "hash-table-ref/default").map.get(hashKey(key))?.[1] ?? fallback);
        alias("hash-table/get", "hash-table-ref/default");
        def("hash-ref", 2, 3, ([table, key, fallback]) => {
            const entry = hashTable(table, "hash-ref").map.get(hashKey(key));
            if (entry) return entry[1];
            if (fallback === undefined) throw fail("hash-ref: key not found", key);
            return this.isProcedure(fallback) ? call(fallback, []) : fallback;
        });
        def("hash-table-delete!", 2, 2, ([table, key]) => { hashTable(table, "hash-table-delete!").map.delete(hashKey(key)); return UNSPECIFIED; });
        alias("hash-table/remove!", "hash-table-delete!");
        alias("hash-remove!", "hash-table-delete!");
        def("hash-table-contains?", 2, 2, ([table, key]) => hashTable(table, "hash-table-contains?").map.has(hashKey(key)));
        alias("hash-table-exists?", "hash-table-contains?");
        alias("hash-has-key?", "hash-table-contains?");
        def("hash-table-count", 1, 1, ([table]) => BigInt(hashTable(table, "hash-table-count").map.size));
        alias("hash-table-size", "hash-table-count");
        alias("hash-count", "hash-table-count");
        def("hash-table-keys", 1, 1, ([table]) => arrayToList([...hashTable(table, "hash-table-keys").map.values()].map(([key]) => key)));
        alias("hash-keys", "hash-table-keys");
        def("hash-table-values", 1, 1, ([table]) => arrayToList([...hashTable(table, "hash-table-values").map.values()].map(([, value]) => value)));
        alias("hash-values", "hash-table-values");
        def("hash-table->alist", 1, 1, ([table]) => arrayToList([...hashTable(table, "hash-table->alist").map.values()].map(([key, value]) => cons(key, value))));
        alias("hash->list", "hash-table->alist");
        def("hash-table-walk", 2, 2, ([table, proc]) => {
            for (const [key, value] of [...hashTable(table, "hash-table-walk").map.values()]) call(proc, [key, value]);
            return UNSPECIFIED;
        });
        def("hash-table-update!", 3, 4, ([table, key, proc, failure]) => {
            const map = hashTable(table, "hash-table-update!").map;
            const entry = map.get(hashKey(key));
            let current: Value;
            if (entry) current = entry[1];
            else if (failure !== undefined) current = call(failure, []);
            else throw fail("hash-table-update!: key not found", key);
            map.set(hashKey(key), [key, call(proc, [current])]);
            return UNSPECIFIED;
        });
        def("hash-table-update!/default", 4, 4, ([table, key, proc, fallback]) => {
            const map = hashTable(table, "hash-table-update!/default").map;
            const entry = map.get(hashKey(key));
            map.set(hashKey(key), [key, call(proc, [entry ? entry[1] : fallback])]);
            return UNSPECIFIED;
        });
        def("hash-table-clear!", 1, 1, ([table]) => { hashTable(table, "hash-table-clear!").map.clear(); return UNSPECIFIED; });
        def("hash-table-copy", 1, 2, ([table]) => {
            const copy = new HashTable();
            for (const [key, entry] of hashTable(table, "hash-table-copy").map) copy.map.set(key, [entry[0], entry[1]]);
            return copy;
        });

        // ------------------------------------------------------ output
        def("display", 1, 2, (args) => { this.emit(printValue(args[0], false), outputPort(args, 1, "display")); return UNSPECIFIED; });
        def("write", 1, 2, (args) => { this.emit(printValue(args[0], true), outputPort(args, 1, "write")); return UNSPECIFIED; });
        alias("write-shared", "write");
        alias("write-simple", "write");
        alias("print", "write");
        def("displayln", 1, 2, (args) => { this.emit(`${printValue(args[0], false)}\n`, outputPort(args, 1, "displayln")); return UNSPECIFIED; });
        def("newline", 0, 1, (args) => { this.emit("\n", outputPort(args, 0, "newline")); return UNSPECIFIED; });
        def("write-char", 1, 2, (args) => { this.emit(charText(args[0], "write-char"), outputPort(args, 1, "write-char")); return UNSPECIFIED; });
        def("write-string", 1, 4, (args) => {
            const items = chars(str(args[0], "write-string"));
            const [from, to] = range(items.length, args, 2, "write-string");
            this.emit(items.slice(from, to).join(""), outputPort(args, 1, "write-string"));
            return UNSPECIFIED;
        });
        def("pp", 1, 2, (args) => { this.emit(`${printValue(args[0], true)}\n`, outputPort(args, 1, "pp")); return UNSPECIFIED; });
        alias("pretty-print", "pp");
        const format = (template: string, args: Value[]) => {
            let result = "";
            let next = 0;
            for (let position = 0; position < template.length; position += 1) {
                const char = template[position];
                if (char !== "~") {
                    result += char;
                    continue;
                }
                const directive = template[++position]?.toLowerCase();
                if (directive === "a" || directive === "s") {
                    if (next >= args.length) throw fail("format: not enough arguments for the format string");
                    result += printValue(args[next++], directive === "s");
                } else if (directive === "%" || directive === "n") result += "\n";
                else if (directive === "~") result += "~";
                else throw fail(`format: unknown directive ~${directive ?? ""}`);
            }
            return result;
        };
        def("format", 1, ANY, (args) => {
            if (typeof args[0] === "string") return format(args[0], args.slice(1));
            const destination = args[0];
            const text = format(str(args[1], "format"), args.slice(2));
            if (destination === false) return text;
            this.emit(text, destination instanceof Port ? destination : this.currentOutput());
            return UNSPECIFIED;
        });
        def("printf", 1, ANY, (args) => { this.emit(format(str(args[0], "printf"), args.slice(1))); return UNSPECIFIED; });
        def("current-output-port", 0, 0, () => this.currentOutput());
        def("current-error-port", 0, 0, () => this.stderr);
        def("current-input-port", 0, 0, () => this.stdin);
        def("flush-output-port", 0, 1, () => { this.flush(); return UNSPECIFIED; });
        alias("flush-output", "flush-output-port");
        def("open-output-string", 0, 0, () => new Port("string-out"));
        def("open-input-string", 1, 1, ([value]) => new Port("input", str(value, "open-input-string")));
        def("get-output-string", 1, 1, ([port]) => {
            if (!(port instanceof Port) || port.kind !== "string-out") throw fail("get-output-string: expected a string output port", port);
            return port.chunks.join("");
        });
        def("call-with-output-string", 1, 1, ([proc]) => {
            const port = new Port("string-out");
            call(proc, [port]);
            return port.chunks.join("");
        });
        def("with-output-to-string", 1, 1, ([thunk]) => {
            const port = new Port("string-out");
            this.outputPorts.push(port);
            try {
                call(thunk, []);
            } finally {
                const position = this.outputPorts.lastIndexOf(port);
                if (position > 0) this.outputPorts.splice(position, 1);
            }
            return port.chunks.join("");
        });
        def("port?", 1, 1, ([value]) => value instanceof Port);
        def("input-port?", 1, 1, ([value]) => value instanceof Port && value.kind === "input");
        def("output-port?", 1, 1, ([value]) => value instanceof Port && value.kind !== "input");
        alias("textual-port?", "port?");
        def("close-port", 1, 1, () => UNSPECIFIED);
        alias("close-input-port", "close-port");
        alias("close-output-port", "close-port");

        // ------------------------------------------------------ input
        def("eof-object", 0, 0, () => EOF);
        def("eof-object?", 1, 1, ([value]) => value === EOF);
        def("read-line", 0, 1, (args) => {
            const port = inputPort(args, 0, "read-line");
            if (port.position >= port.text.length) return EOF;
            const end = port.text.indexOf("\n", port.position);
            const line = port.text.slice(port.position, end < 0 ? port.text.length : end);
            port.position = end < 0 ? port.text.length : end + 1;
            return line;
        });
        def("read-char", 0, 1, (args) => {
            const port = inputPort(args, 0, "read-char");
            const code = port.text.codePointAt(port.position);
            if (code === undefined) return EOF;
            port.position += code > 0xffff ? 2 : 1;
            return makeChar(code);
        });
        def("peek-char", 0, 1, (args) => {
            const port = inputPort(args, 0, "peek-char");
            const code = port.text.codePointAt(port.position);
            return code === undefined ? EOF : makeChar(code);
        });
        def("read-string", 1, 2, ([count, port]) => {
            const source = inputPort(port === undefined ? [] : [port], 0, "read-string");
            if (source.position >= source.text.length) return EOF;
            const items = chars(source.text.slice(source.position)).slice(0, index(count, "read-string"));
            const text = items.join("");
            source.position += text.length;
            return text;
        });
        def("char-ready?", 0, 1, () => true);
        def("read", 0, 1, (args) => {
            const port = inputPort(args, 0, "read");
            const reader = new Reader(port.text, this.positions, port.position);
            try {
                const datum = reader.read();
                port.position = reader.offset;
                return datum === READ_EOF ? EOF : datum;
            } catch (error) {
                if (error instanceof ReadError) throw fail(`read: ${error.message}`);
                throw error;
            }
        });

        // ------------------------------------------------------ records
        def("record?", 1, 1, ([value]) => value instanceof RecordInstance);
    }

    private isProcedure(value: Value) {
        return value instanceof Lambda || value instanceof CaseLambda || value instanceof Primitive || value instanceof Continuation || value instanceof Parameter;
    }
}

type MatchBinding = { kind: "one"; value: Value } | { kind: "many"; items: MatchBinding[] };
type Renames = { renames: Map<Sym, Sym>; bound: Set<Sym> };
