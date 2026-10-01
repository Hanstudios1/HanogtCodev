/**
 * A fast, safe Brainfuck interpreter (dependency-free; it runs in the runtime
 * worker and in plain Node for tests).
 *
 * - 8-bit wrapping cells and a tape that grows to the right up to `maxCells`.
 * - `,` reads the next byte of stdin (UTF-8); at the end of input the cell becomes 0.
 * - `.` output is decoded as UTF-8, so multi-byte characters print correctly.
 * - The program is compiled first: runs of + - < > are folded, and clear,
 *   scan and multiply loops become single instructions.
 */

export interface BrainfuckOptions {
    stdin?: string;
    /** Receives decoded output as it is produced. */
    onOutput?: (text: string) => void;
    /** Instruction budget; the run stops with an error when it is exhausted. */
    maxSteps?: number;
    /** Largest tape size in cells. */
    maxCells?: number;
    /** Polled regularly; returning true stops the run (e.g. a deadline). */
    shouldStop?: () => boolean;
}

export interface BrainfuckResult {
    output: string;
    exitCode: number;
    error?: { message: string; line?: number; column?: number };
    steps: number;
    cellsUsed: number;
}

const OP = {
    ADD: 0,
    MOVE: 1,
    OUT: 2,
    IN: 3,
    JZ: 4,
    JNZ: 5,
    CLEAR: 6,
    SCAN: 7,
    MUL: 8,
} as const;

type Instruction =
    | { op: typeof OP.ADD; value: number }
    | { op: typeof OP.MOVE; value: number }
    | { op: typeof OP.OUT }
    | { op: typeof OP.IN }
    | { op: typeof OP.JZ; target: number; line: number; column: number }
    | { op: typeof OP.JNZ; target: number }
    | { op: typeof OP.CLEAR }
    | { op: typeof OP.SCAN; value: number }
    | { op: typeof OP.MUL; offsets: Int32Array; factors: Int32Array; step: 1 | -1 };

export class BrainfuckSyntaxError extends Error {
    readonly line: number;
    readonly column: number;

    constructor(message: string, line: number, column: number) {
        super(message);
        this.name = "BrainfuckSyntaxError";
        this.line = line;
        this.column = column;
    }
}

type Token = { char: string; line: number; column: number };

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let line = 1;
    let column = 1;
    for (const char of source) {
        if ("+-<>.,[]".includes(char)) tokens.push({ char, line, column });
        if (char === "\n") {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    return tokens;
}

/** A loop body made only of + - < > that returns to its start cell and changes it by one. */
function multiplyLoop(body: Token[]): { offsets: number[]; factors: number[]; step: 1 | -1 } | null {
    if (!body.length || body.some((token) => !"+-<>".includes(token.char))) return null;
    let pointer = 0;
    const deltas = new Map<number, number>();
    for (const token of body) {
        if (token.char === ">") pointer += 1;
        else if (token.char === "<") pointer -= 1;
        else deltas.set(pointer, (deltas.get(pointer) ?? 0) + (token.char === "+" ? 1 : -1));
    }
    if (pointer !== 0) return null;
    const own = (((deltas.get(0) ?? 0) % 256) + 256) % 256;
    if (own !== 255 && own !== 1) return null;
    deltas.delete(0);
    const offsets: number[] = [];
    const factors: number[] = [];
    for (const [offset, delta] of deltas) {
        if (delta % 256 === 0) continue;
        offsets.push(offset);
        factors.push(delta);
    }
    return { offsets, factors, step: own === 255 ? -1 : 1 };
}

function isScanLoop(body: Token[]) {
    if (!body.length) return false;
    const first = body[0].char;
    return (first === ">" || first === "<") && body.every((token) => token.char === first);
}

/** Compiles source code; throws {@link BrainfuckSyntaxError} for unbalanced brackets. */
export function compileBrainfuck(source: string): Instruction[] {
    const tokens = tokenize(source);
    const program: Instruction[] = [];
    const open: Array<{ index: number; token: Token }> = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const { char } = token;
        if (char === "+" || char === "-") {
            let value = 0;
            while (index < tokens.length && (tokens[index].char === "+" || tokens[index].char === "-")) {
                value += tokens[index].char === "+" ? 1 : -1;
                index += 1;
            }
            index -= 1;
            value = ((value % 256) + 256) % 256;
            if (value) program.push({ op: OP.ADD, value });
        } else if (char === ">" || char === "<") {
            let value = 0;
            while (index < tokens.length && (tokens[index].char === ">" || tokens[index].char === "<")) {
                value += tokens[index].char === ">" ? 1 : -1;
                index += 1;
            }
            index -= 1;
            if (value) program.push({ op: OP.MOVE, value });
        } else if (char === ".") {
            program.push({ op: OP.OUT });
        } else if (char === ",") {
            program.push({ op: OP.IN });
        } else if (char === "[") {
            // Find the matching bracket to try the loop optimisations.
            let depth = 0;
            let end = -1;
            for (let scan = index; scan < tokens.length; scan += 1) {
                if (tokens[scan].char === "[") depth += 1;
                else if (tokens[scan].char === "]") {
                    depth -= 1;
                    if (depth === 0) {
                        end = scan;
                        break;
                    }
                }
            }
            if (end < 0) throw new BrainfuckSyntaxError(`Unmatched '[' at line ${token.line}, column ${token.column}`, token.line, token.column);
            const body = tokens.slice(index + 1, end);
            if (body.length === 1 && (body[0].char === "-" || body[0].char === "+")) {
                program.push({ op: OP.CLEAR });
                index = end;
                continue;
            }
            if (isScanLoop(body)) {
                program.push({ op: OP.SCAN, value: body[0].char === ">" ? body.length : -body.length });
                index = end;
                continue;
            }
            const multiply = multiplyLoop(body);
            if (multiply) {
                program.push({ op: OP.MUL, offsets: Int32Array.from(multiply.offsets), factors: Int32Array.from(multiply.factors), step: multiply.step });
                index = end;
                continue;
            }
            open.push({ index: program.length, token });
            program.push({ op: OP.JZ, target: -1, line: token.line, column: token.column });
        } else if (char === "]") {
            const start = open.pop();
            if (!start) throw new BrainfuckSyntaxError(`Unmatched ']' at line ${token.line}, column ${token.column}`, token.line, token.column);
            const jump = program[start.index];
            if (jump.op === OP.JZ) jump.target = program.length + 1;
            program.push({ op: OP.JNZ, target: start.index + 1 });
        }
    }
    const unclosed = open.pop();
    if (unclosed) throw new BrainfuckSyntaxError(`Unmatched '[' at line ${unclosed.token.line}, column ${unclosed.token.column}`, unclosed.token.line, unclosed.token.column);
    return program;
}

/** The innermost loop around an instruction, to point at a likely endless loop. */
function enclosingLoop(program: Instruction[], pc: number) {
    let depth = 0;
    for (let index = Math.min(pc, program.length - 1); index >= 0; index -= 1) {
        const instruction = program[index];
        if (instruction.op === OP.JNZ && index !== pc) depth += 1;
        else if (instruction.op === OP.JZ) {
            if (depth === 0) return instruction;
            depth -= 1;
        }
    }
    return null;
}

export function runBrainfuck(source: string, options: BrainfuckOptions = {}): BrainfuckResult {
    const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
    const maxCells = Math.max(1, Math.min(options.maxCells ?? 1_000_000, 16_000_000));
    const input = new TextEncoder().encode((options.stdin ?? "").replace(/\r\n/g, "\n"));
    const decoder = new TextDecoder("utf-8");
    let output = "";
    let pending: number[] = [];

    const flush = (final = false) => {
        if (!pending.length && !final) return;
        const text = decoder.decode(Uint8Array.from(pending), { stream: !final });
        pending = [];
        if (text) {
            output += text;
            options.onOutput?.(text);
        }
    };

    let program: Instruction[];
    try {
        program = compileBrainfuck(source);
    } catch (error) {
        if (error instanceof BrainfuckSyntaxError) {
            return { output: "", exitCode: 1, error: { message: `SyntaxError: ${error.message}`, line: error.line, column: error.column }, steps: 0, cellsUsed: 0 };
        }
        throw error;
    }

    let tape = new Uint8Array(Math.min(30_000, maxCells));
    let pointer = 0;
    let highest = 0;
    let inputIndex = 0;
    let steps = 0;
    let pc = 0;

    const grow = (needed: number) => {
        if (needed >= maxCells) return false;
        let size = tape.length;
        while (size <= needed) size = Math.min(maxCells, size * 2);
        const next = new Uint8Array(size);
        next.set(tape);
        tape = next;
        return true;
    };

    const fail = (message: string, withLoop = false): BrainfuckResult => {
        flush(true);
        const loop = withLoop ? enclosingLoop(program, pc) : null;
        const where = loop && loop.op === OP.JZ ? { line: loop.line, column: loop.column } : {};
        const suffix = loop && loop.op === OP.JZ ? ` The loop at line ${loop.line}, column ${loop.column} may never end.` : "";
        return { output, exitCode: 1, error: { message: `${message}${suffix}`, ...where }, steps, cellsUsed: highest + 1 };
    };
    const tapeLimit = () => fail(`RuntimeError: the tape limit of ${maxCells} cells was exceeded.`);

    while (pc < program.length) {
        steps += 1;
        if (steps > maxSteps) return fail(`RuntimeError: step limit exceeded (${maxSteps} instructions).`, true);
        if ((steps & 0xffff) === 0) {
            if (options.shouldStop?.()) return fail("RuntimeError: execution stopped because the time limit was exceeded.", true);
            if (pending.length > 1024) flush();
        }
        const instruction = program[pc];
        switch (instruction.op) {
            case OP.ADD:
                tape[pointer] = (tape[pointer] + instruction.value) & 0xff;
                break;
            case OP.MOVE: {
                const next = pointer + instruction.value;
                if (next < 0) return fail("RuntimeError: the pointer moved left of cell 0.");
                if (next >= tape.length && !grow(next)) return tapeLimit();
                pointer = next;
                if (pointer > highest) highest = pointer;
                break;
            }
            case OP.OUT:
                pending.push(tape[pointer]);
                if (tape[pointer] === 10) flush();
                break;
            case OP.IN:
                tape[pointer] = inputIndex < input.length ? input[inputIndex++] : 0;
                break;
            case OP.JZ:
                if (tape[pointer] === 0) {
                    pc = instruction.target;
                    continue;
                }
                break;
            case OP.JNZ:
                if (tape[pointer] !== 0) {
                    pc = instruction.target;
                    continue;
                }
                break;
            case OP.CLEAR:
                tape[pointer] = 0;
                break;
            case OP.SCAN:
                while (tape[pointer] !== 0) {
                    const next = pointer + instruction.value;
                    if (next < 0) return fail("RuntimeError: the pointer moved left of cell 0 during a scan loop.");
                    if (next >= tape.length && !grow(next)) return tapeLimit();
                    pointer = next;
                    if (pointer > highest) highest = pointer;
                    steps += 1;
                    if (steps > maxSteps) return fail(`RuntimeError: step limit exceeded (${maxSteps} instructions).`, true);
                }
                break;
            case OP.MUL: {
                const value = tape[pointer];
                if (value !== 0) {
                    const iterations = instruction.step === -1 ? value : (256 - value) & 0xff;
                    const { offsets, factors } = instruction;
                    for (let index = 0; index < offsets.length; index += 1) {
                        const target = pointer + offsets[index];
                        if (target < 0) return fail("RuntimeError: the pointer moved left of cell 0 inside a loop.");
                        if (target >= tape.length && !grow(target)) return tapeLimit();
                        if (target > highest) highest = target;
                        tape[target] = (tape[target] + iterations * factors[index]) & 0xff;
                    }
                    tape[pointer] = 0;
                }
                break;
            }
        }
        pc += 1;
    }
    flush(true);
    return { output, exitCode: 0, steps, cellsUsed: highest + 1 };
}
