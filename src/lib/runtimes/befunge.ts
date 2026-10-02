/**
 * A Befunge-93 interpreter (dependency-free; it runs in the runtime worker
 * and in plain Node for tests).
 *
 * The program is a grid (at least 80×25, larger when the source is larger)
 * that the instruction pointer walks through, wrapping at the edges. Popping
 * an empty stack yields 0, division and modulo by zero push 0 (the usual
 * choice for the "ask the user" case of the specification), `&` and `~` read
 * a number or a character from stdin and push -1 at the end of input, and
 * `p` can modify the program while it runs. Unknown instructions stop the
 * program with their position, which makes typos easy to find.
 */

export interface BefungeOptions {
    stdin?: string;
    onOutput?: (text: string) => void;
    /** Instruction budget (default: unlimited; the time limit applies). */
    maxSteps?: number;
    /** Polled regularly; returning true stops the run (e.g. a deadline). */
    shouldStop?: () => boolean;
    locale?: "tr" | "en";
    /** Random source for `?` (tests pass a seeded one). */
    random?: () => number;
}

export interface BefungeResult {
    output: string;
    exitCode: number;
    error?: { message: string; line?: number; column?: number };
    steps: number;
}

const MAX_STACK = 1_000_000;

export function runBefunge(source: string, options: BefungeOptions = {}): BefungeResult {
    const tr = options.locale === "tr";
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    const width = Math.max(80, ...lines.map((line) => [...line].length));
    const height = Math.max(25, lines.length);
    if (width * height > 4_000_000) {
        return { output: "", exitCode: 1, steps: 0, error: { message: tr ? "Program çok büyük (en fazla 4 milyon hücre)." : "The program is too large (4 million cells at most)." } };
    }
    const grid = new Int32Array(width * height).fill(32);
    lines.forEach((line, y) => {
        let x = 0;
        for (const char of line) grid[y * width + x++] = char.codePointAt(0) ?? 32;
    });

    const input = [...(options.stdin ?? "").replace(/\r\n/g, "\n")];
    let inputIndex = 0;
    const random = options.random ?? Math.random;
    const stack: number[] = [];
    const pop = () => (stack.length ? stack.pop()! : 0);
    const push = (value: number) => {
        if (stack.length >= MAX_STACK) throw new BefungeError(tr ? "Yığın taştı (1.000.000 değerden fazla)." : "Stack overflow (more than 1,000,000 values).");
        stack.push(value | 0);
    };
    let output = "";
    let pending = "";
    const flush = () => {
        if (!pending) return;
        output += pending;
        options.onOutput?.(pending);
        pending = "";
    };
    const write = (text: string) => {
        pending += text;
        if (pending.length >= 1024) flush();
    };

    let x = 0;
    let y = 0;
    let dx = 1;
    let dy = 0;
    let stringMode = false;
    let steps = 0;
    const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
    const move = () => {
        x = (x + dx + width) % width;
        y = (y + dy + height) % height;
    };
    const fail = (message: string): BefungeResult => {
        flush();
        return { output, exitCode: 1, steps, error: { message, line: y + 1, column: x + 1 } };
    };

    try {
        for (;;) {
            steps += 1;
            if (steps > maxSteps) return fail(tr ? `Adım sınırı aşıldı (${maxSteps} komut).` : `Step limit exceeded (${maxSteps} instructions).`);
            if ((steps & 0xffff) === 0 && options.shouldStop?.()) {
                return fail(tr ? "Süre sınırı aşıldı; programda sonsuz döngü olabilir." : "Time limit exceeded; the program may contain an infinite loop.");
            }
            const cell = grid[y * width + x];
            if (stringMode) {
                if (cell === 34) stringMode = false;
                else push(cell);
                move();
                continue;
            }
            switch (cell) {
                case 32: break;
                case 48: case 49: case 50: case 51: case 52: case 53: case 54: case 55: case 56: case 57:
                    push(cell - 48);
                    break;
                case 43: { const a = pop(); const b = pop(); push(b + a); break; } // +
                case 45: { const a = pop(); const b = pop(); push(b - a); break; } // -
                case 42: { const a = pop(); const b = pop(); push(Math.imul(b, a)); break; } // *
                case 47: { const a = pop(); const b = pop(); push(a === 0 ? 0 : Math.trunc(b / a)); break; } // /
                case 37: { const a = pop(); const b = pop(); push(a === 0 ? 0 : b % a); break; } // %
                case 33: push(pop() === 0 ? 1 : 0); break; // !
                case 96: { const a = pop(); const b = pop(); push(b > a ? 1 : 0); break; } // `
                case 62: dx = 1; dy = 0; break; // >
                case 60: dx = -1; dy = 0; break; // <
                case 94: dx = 0; dy = -1; break; // ^
                case 118: dx = 0; dy = 1; break; // v
                case 63: { // ?
                    const direction = Math.floor(random() * 4) & 3;
                    [dx, dy] = [[1, 0], [-1, 0], [0, -1], [0, 1]][direction];
                    break;
                }
                case 95: dx = pop() === 0 ? 1 : -1; dy = 0; break; // _
                case 124: dy = pop() === 0 ? 1 : -1; dx = 0; break; // |
                case 34: stringMode = true; break; // "
                case 58: { const a = pop(); push(a); push(a); break; } // :
                case 92: { const a = pop(); const b = pop(); push(a); push(b); break; } // \
                case 36: pop(); break; // $
                case 46: write(`${pop()} `); break; // .
                case 44: { // ,
                    const code = pop();
                    write(code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : "�");
                    break;
                }
                case 35: move(); break; // #
                case 103: { // g
                    const gy = pop();
                    const gx = pop();
                    push(gx >= 0 && gx < width && gy >= 0 && gy < height ? grid[gy * width + gx] : 0);
                    break;
                }
                case 112: { // p
                    const py = pop();
                    const px = pop();
                    const value = pop();
                    if (px >= 0 && px < width && py >= 0 && py < height) grid[py * width + px] = value;
                    else return fail(tr ? `p komutu ızgaranın dışına yazmaya çalıştı (${px}, ${py}).` : `p tried to write outside the grid at (${px}, ${py}).`);
                    break;
                }
                case 38: { // & reads an integer
                    while (inputIndex < input.length && !/[-+\d]/.test(input[inputIndex])) inputIndex += 1;
                    let text = "";
                    if (inputIndex < input.length && /[-+]/.test(input[inputIndex])) text += input[inputIndex++];
                    while (inputIndex < input.length && /\d/.test(input[inputIndex])) text += input[inputIndex++];
                    const value = Number.parseInt(text, 10);
                    push(Number.isFinite(value) ? value : -1);
                    break;
                }
                case 126: push(inputIndex < input.length ? input[inputIndex++].codePointAt(0) ?? -1 : -1); break; // ~
                case 64: // @
                    flush();
                    return { output, exitCode: 0, steps };
                default: {
                    const char = String.fromCodePoint(cell >= 0 && cell <= 0x10ffff ? cell : 0xfffd);
                    return fail(tr
                        ? `Bilinmeyen komut '${char}'. Befunge-93 komutları: 0-9 + - * / % ! \` > < ^ v ? _ | " : \\ $ . , # g p & ~ @ ve boşluk.`
                        : `Unknown instruction '${char}'. Befunge-93 instructions are 0-9 + - * / % ! \` > < ^ v ? _ | " : \\ $ . , # g p & ~ @ and space.`);
                }
            }
            move();
        }
    } catch (error) {
        if (error instanceof BefungeError) return fail(error.message);
        throw error;
    }
}

class BefungeError extends Error {}
