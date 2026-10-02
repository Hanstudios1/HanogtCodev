/**
 * A Whitespace interpreter (dependency-free; it runs in the runtime worker
 * and in plain Node for tests).
 *
 * Only space, tab and line feed are instructions; every other character is a
 * comment, so programs are usually annotated with visible letters (S, T, L).
 * Numbers and the heap use arbitrary precision (BigInt). Reading past the end
 * of the input stores -1. Errors report the line and column where the
 * offending instruction starts.
 */

export interface WhitespaceOptions {
    stdin?: string;
    onOutput?: (text: string) => void;
    maxSteps?: number;
    shouldStop?: () => boolean;
    locale?: "tr" | "en";
}

export interface WhitespaceResult {
    output: string;
    exitCode: number;
    error?: { message: string; line?: number; column?: number };
    steps: number;
}

type Op =
    | "push" | "dup" | "copy" | "swap" | "drop" | "slide"
    | "add" | "sub" | "mul" | "div" | "mod"
    | "store" | "retrieve"
    | "label" | "call" | "jump" | "jz" | "jn" | "ret" | "end"
    | "outc" | "outn" | "inc" | "inn";

export interface WhitespaceInstruction {
    op: Op;
    arg?: bigint;
    label?: string;
    line: number;
    column: number;
}

type Token = { char: "S" | "T" | "L"; line: number; column: number };

// BigInt constants (the project targets ES2017, which has no BigInt literals).
const ZERO = BigInt(0);
const ONE = BigInt(1);
const MINUS_ONE = BigInt(-1);

class WhitespaceError extends Error {
    readonly line?: number;
    readonly column?: number;
    constructor(message: string, line?: number, column?: number) {
        super(message);
        this.line = line;
        this.column = column;
    }
}

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let line = 1;
    let column = 1;
    for (const char of source) {
        if (char === " ") tokens.push({ char: "S", line, column });
        else if (char === "\t") tokens.push({ char: "T", line, column });
        else if (char === "\n") tokens.push({ char: "L", line, column });
        if (char === "\n") {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    return tokens;
}

const NAMES: Record<Op, string> = {
    push: "push", dup: "dup", copy: "copy", swap: "swap", drop: "drop", slide: "slide",
    add: "add", sub: "sub", mul: "mul", div: "div", mod: "mod", store: "store", retrieve: "retrieve",
    label: "label", call: "call", jump: "jump", jz: "jz", jn: "jn", ret: "ret", end: "end",
    outc: "printc", outn: "printn", inc: "readc", inn: "readn",
};

/** Parses a program into instructions (throws on incomplete or unknown commands). */
export function parseWhitespace(source: string, locale: "tr" | "en" = "en"): WhitespaceInstruction[] {
    const tr = locale === "tr";
    const tokens = tokenize(source);
    const program: WhitespaceInstruction[] = [];
    let index = 0;
    const take = (start: Token) => {
        const token = tokens[index++];
        if (!token) throw new WhitespaceError(tr ? "Program yarım bir komutla bitiyor." : "The program ends in the middle of an instruction.", start.line, start.column);
        return token.char;
    };
    const number = (start: Token) => {
        const sign = take(start);
        if (sign === "L") return ZERO;
        let value = ZERO;
        for (;;) {
            const bit = take(start);
            if (bit === "L") break;
            value = (value << ONE) | (bit === "T" ? ONE : ZERO);
        }
        return sign === "T" ? -value : value;
    };
    const label = (start: Token) => {
        let text = "";
        for (;;) {
            const bit = take(start);
            if (bit === "L") return text;
            text += bit;
        }
    };
    while (index < tokens.length) {
        const start = tokens[index];
        const at = { line: start.line, column: start.column };
        const unknown = (code: string) => new WhitespaceError(tr ? `Bilinmeyen komut: ${code}` : `Unknown instruction: ${code}`, at.line, at.column);
        const imp = take(start);
        if (imp === "S") {
            const a = take(start);
            if (a === "S") program.push({ op: "push", arg: number(start), ...at });
            else if (a === "L") {
                const b = take(start);
                program.push({ op: b === "S" ? "dup" : b === "T" ? "swap" : "drop", ...at });
            } else {
                const b = take(start);
                if (b === "S") program.push({ op: "copy", arg: number(start), ...at });
                else if (b === "L") program.push({ op: "slide", arg: number(start), ...at });
                else throw unknown("[Space][Tab][Tab]");
            }
        } else if (imp === "T") {
            const a = take(start);
            const b = take(start);
            if (a === "S") {
                if (b === "S") {
                    const c = take(start);
                    program.push({ op: c === "S" ? "add" : c === "T" ? "sub" : "mul", ...at });
                } else if (b === "T") {
                    const c = take(start);
                    if (c === "L") throw unknown("[Tab][Space][Tab][LF]");
                    program.push({ op: c === "S" ? "div" : "mod", ...at });
                } else {
                    throw unknown("[Tab][Space][LF]");
                }
            } else if (a === "T") {
                if (b === "L") throw unknown("[Tab][Tab][LF]");
                program.push({ op: b === "S" ? "store" : "retrieve", ...at });
            } else {
                const c = take(start);
                if (b === "S") {
                    if (c === "L") throw unknown("[Tab][LF][Space][LF]");
                    program.push({ op: c === "S" ? "outc" : "outn", ...at });
                } else if (b === "T") {
                    if (c === "L") throw unknown("[Tab][LF][Tab][LF]");
                    program.push({ op: c === "S" ? "inc" : "inn", ...at });
                } else {
                    throw unknown("[Tab][LF][LF]");
                }
            }
        } else {
            const a = take(start);
            const b = take(start);
            if (a === "S") {
                const op: Op = b === "S" ? "label" : b === "T" ? "call" : "jump";
                program.push({ op, label: label(start), ...at });
            } else if (a === "T") {
                if (b === "L") program.push({ op: "ret", ...at });
                else program.push({ op: b === "S" ? "jz" : "jn", label: label(start), ...at });
            } else {
                if (b !== "L") throw unknown(b === "S" ? "[LF][LF][Space]" : "[LF][LF][Tab]");
                program.push({ op: "end", ...at });
            }
        }
    }
    return program;
}

/** A readable listing ("push 72", "printc"…), useful for debugging and tests. */
export function disassembleWhitespace(program: WhitespaceInstruction[]): string[] {
    return program.map((instruction) => {
        const name = NAMES[instruction.op];
        if (instruction.arg !== undefined) return `${name} ${instruction.arg}`;
        if (instruction.label !== undefined) return `${name} ${instruction.label.replace(/S/g, "0").replace(/T/g, "1") || "ε"}`;
        return name;
    });
}

export function runWhitespace(source: string, options: WhitespaceOptions = {}): WhitespaceResult {
    const locale = options.locale === "tr" ? "tr" : "en";
    const tr = locale === "tr";
    let output = "";
    let pending = "";
    let steps = 0;
    const flush = () => {
        if (!pending) return;
        output += pending;
        options.onOutput?.(pending);
        pending = "";
    };
    let program: WhitespaceInstruction[];
    try {
        program = parseWhitespace(source, locale);
    } catch (error) {
        if (error instanceof WhitespaceError) return { output, exitCode: 1, steps, error: { message: `${tr ? "Sözdizimi hatası" : "SyntaxError"}: ${error.message}`, line: error.line, column: error.column } };
        throw error;
    }
    const labels = new Map<string, number>();
    for (let index = 0; index < program.length; index += 1) {
        const instruction = program[index];
        if (instruction.op !== "label") continue;
        if (labels.has(instruction.label!)) {
            return { output, exitCode: 1, steps, error: { message: tr ? "Aynı etiket iki kez tanımlanmış." : "The same label is defined twice.", line: instruction.line, column: instruction.column } };
        }
        labels.set(instruction.label!, index);
    }
    for (const instruction of program) {
        if ((instruction.op === "call" || instruction.op === "jump" || instruction.op === "jz" || instruction.op === "jn") && !labels.has(instruction.label!)) {
            return { output, exitCode: 1, steps, error: { message: tr ? "Tanımsız bir etikete atlanıyor." : "Jump to an undefined label.", line: instruction.line, column: instruction.column } };
        }
    }

    const input = [...(options.stdin ?? "").replace(/\r\n/g, "\n")];
    let inputIndex = 0;
    const stack: bigint[] = [];
    const calls: number[] = [];
    const heap = new Map<bigint, bigint>();
    const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
    let pc = 0;
    let instruction: WhitespaceInstruction | undefined;
    const fail = (message: string): WhitespaceResult => {
        flush();
        return { output, exitCode: 1, steps, error: { message, line: instruction?.line, column: instruction?.column } };
    };
    const need = (count: number) => {
        if (stack.length < count) throw new WhitespaceError(tr ? `${NAMES[instruction!.op]} için yığında ${count} değer gerekiyor, ${stack.length} var.` : `${NAMES[instruction!.op]} needs ${count} ${count === 1 ? "value" : "values"} on the stack but there ${stack.length === 1 ? "is" : "are"} ${stack.length}.`);
    };
    const pop = () => stack.pop()!;
    try {
        while (pc < program.length) {
            instruction = program[pc];
            steps += 1;
            if (steps > maxSteps) return fail(tr ? `Adım sınırı aşıldı (${maxSteps} komut).` : `Step limit exceeded (${maxSteps} instructions).`);
            if ((steps & 0x3fff) === 0 && options.shouldStop?.()) return fail(tr ? "Süre sınırı aşıldı; programda sonsuz döngü olabilir." : "Time limit exceeded; the program may contain an infinite loop.");
            if (stack.length > 1_000_000) return fail(tr ? "Yığın taştı." : "Stack overflow.");
            pc += 1;
            switch (instruction.op) {
                case "push": stack.push(instruction.arg!); break;
                case "dup": need(1); stack.push(stack[stack.length - 1]); break;
                case "copy": {
                    const n = Number(instruction.arg!);
                    if (n < 0 || n >= stack.length) return fail(tr ? `copy ${n}: yığında o kadar değer yok.` : `copy ${n}: the stack does not have that many values.`);
                    stack.push(stack[stack.length - 1 - n]);
                    break;
                }
                case "swap": {
                    need(2);
                    const a = pop();
                    const b = pop();
                    stack.push(a, b);
                    break;
                }
                case "drop": need(1); pop(); break;
                case "slide": {
                    need(1);
                    const top = pop();
                    const n = Number(instruction.arg!);
                    stack.splice(Math.max(0, stack.length - Math.max(0, n)));
                    stack.push(top);
                    break;
                }
                case "add": case "sub": case "mul": case "div": case "mod": {
                    need(2);
                    const a = pop();
                    const b = pop();
                    if ((instruction.op === "div" || instruction.op === "mod") && a === ZERO) return fail(tr ? "Sıfıra bölme." : "Division by zero.");
                    // Whitespace's reference implementation (Haskell) floors division and modulo.
                    const floorDiv = (x: bigint, y: bigint) => {
                        const q = x / y;
                        return (x % y !== ZERO && (x < ZERO) !== (y < ZERO)) ? q - ONE : q;
                    };
                    stack.push(instruction.op === "add" ? b + a : instruction.op === "sub" ? b - a : instruction.op === "mul" ? b * a
                        : instruction.op === "div" ? floorDiv(b, a) : b - a * floorDiv(b, a));
                    break;
                }
                case "store": {
                    need(2);
                    const value = pop();
                    const address = pop();
                    heap.set(address, value);
                    break;
                }
                case "retrieve": need(1); stack.push(heap.get(pop()) ?? ZERO); break;
                case "label": break;
                case "call":
                    if (calls.length > 100_000) return fail(tr ? "Çağrı yığını taştı (çok derin özyineleme)." : "Call stack overflow (recursion too deep).");
                    calls.push(pc);
                    pc = labels.get(instruction.label!)! + 1;
                    break;
                case "jump": pc = labels.get(instruction.label!)! + 1; break;
                case "jz": need(1); if (pop() === ZERO) pc = labels.get(instruction.label!)! + 1; break;
                case "jn": need(1); if (pop() < ZERO) pc = labels.get(instruction.label!)! + 1; break;
                case "ret":
                    if (!calls.length) return fail(tr ? "Alt programın dışında ret (dönüş) komutu." : "Return outside of a subroutine.");
                    pc = calls.pop()!;
                    break;
                case "end":
                    flush();
                    return { output, exitCode: 0, steps };
                case "outc": {
                    need(1);
                    const code = Number(pop());
                    pending += code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : "�";
                    if (pending.length >= 1024) flush();
                    break;
                }
                case "outn":
                    need(1);
                    pending += pop().toString();
                    if (pending.length >= 1024) flush();
                    break;
                case "inc": {
                    need(1);
                    const address = pop();
                    heap.set(address, inputIndex < input.length ? BigInt(input[inputIndex++].codePointAt(0) ?? -1) : MINUS_ONE);
                    break;
                }
                case "inn": {
                    need(1);
                    const address = pop();
                    let line = "";
                    while (inputIndex < input.length && input[inputIndex] !== "\n") line += input[inputIndex++];
                    if (inputIndex < input.length) inputIndex += 1;
                    const text = line.trim();
                    if (!/^[-+]?\d+$/.test(text)) {
                        if (!text && inputIndex >= input.length) {
                            heap.set(address, MINUS_ONE);
                            break;
                        }
                        return fail(tr ? `readn bir tamsayı bekliyordu, "${text.slice(0, 40)}" okundu.` : `readn expected an integer but read "${text.slice(0, 40)}".`);
                    }
                    heap.set(address, BigInt(text));
                    break;
                }
            }
        }
    } catch (error) {
        if (error instanceof WhitespaceError) return fail(error.message);
        throw error;
    }
    // Falling off the end is accepted (many programs omit the final end instruction).
    flush();
    return { output, exitCode: 0, steps };
}

/**
 * Builds an annotated Whitespace program from readable instructions:
 * every space, tab and line feed is followed by a visible S, T or L.
 * Used for the starter templates.
 */
export function assembleWhitespace(lines: string[]): string {
    const numberBits = (value: bigint) => `${value < ZERO ? "T" : "S"}${(value < ZERO ? -value : value).toString(2).replace(/0/g, "S").replace(/1/g, "T").replace(/^S$/, "")}L`;
    const labelBits = (name: string) => `${name}L`;
    const encode: Record<string, (argument: string) => string> = {
        push: (argument) => `SS${numberBits(BigInt(argument))}`,
        dup: () => "SLS", copy: (argument) => `STS${numberBits(BigInt(argument))}`, swap: () => "SLT", drop: () => "SLL",
        slide: (argument) => `STL${numberBits(BigInt(argument))}`,
        add: () => "TSSS", sub: () => "TSST", mul: () => "TSSL", div: () => "TSTS", mod: () => "TSTT",
        store: () => "TTS", retrieve: () => "TTT",
        label: (argument) => `LSS${labelBits(argument)}`, call: (argument) => `LST${labelBits(argument)}`, jump: (argument) => `LSL${labelBits(argument)}`,
        jz: (argument) => `LTS${labelBits(argument)}`, jn: (argument) => `LTT${labelBits(argument)}`, ret: () => "LTL", end: () => "LLL",
        printc: () => "TLSS", printn: () => "TLST", readc: () => "TLTS", readn: () => "TLTT",
    };
    const visible = { S: " S", T: "\tT", L: "L\n" } as const;
    return lines.map((line) => {
        const [name, argument = ""] = line.trim().split(/\s+/);
        const code = encode[name]?.(argument);
        if (!code) throw new Error(`Unknown instruction ${name}`);
        return [...code].map((char) => visible[char as "S" | "T" | "L"]).join("");
    }).join("");
}
