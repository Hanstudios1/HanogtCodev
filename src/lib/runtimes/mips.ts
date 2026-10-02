/**
 * A MIPS32 assembler and simulator in the spirit of MARS/SPIM
 * (dependency-free; it runs in the runtime worker and in plain Node for tests).
 *
 * - Segments: .data at 0x10010000, .text at 0x00400000, the stack at
 *   0x7FFFEFFC and the heap (sbrk) from 0x10040000; memory is little-endian.
 * - Directives: .data .text .word .half .byte .ascii .asciiz .space .align
 *   .globl .eqv (aligned like MARS).
 * - Integer instructions (add … xor, shifts, mult/div with hi/lo, loads and
 *   stores, branches and jumps) plus the common pseudo-instructions: li, la,
 *   move, neg, not, abs, b, beqz/bnez, blt/bgt/ble/bge (and unsigned forms),
 *   three-operand mul/div/rem, seq/sne/sgt/sge/sle and immediates in R-type
 *   arithmetic. Overflow traps on add/addi/sub like real MIPS.
 * - Syscalls: 1 print int, 4 print string, 5 read int, 8 read string,
 *   9 sbrk, 10 exit, 11 print char, 12 read char, 17 exit2, 30 time,
 *   34/35/36 print hex/binary/unsigned, 40–42 random numbers.
 *
 * Every source instruction occupies one word, execution starts at `main` when
 * it exists (otherwise at the first instruction) and ends at syscall 10/17 or
 * after the last instruction. Floating-point (coprocessor 1) is not supported.
 */

export interface MipsOptions {
    stdin?: string;
    onOutput?: (text: string) => void;
    maxSteps?: number;
    shouldStop?: () => boolean;
    locale?: "tr" | "en";
    seed?: number;
}

export interface MipsResult {
    output: string;
    exitCode: number;
    error?: { message: string; line?: number; column?: number };
    /** General-purpose registers when the program stopped. */
    registers: number[];
    steps: number;
}

type Locale = "tr" | "en";

const TEXT_BASE = 0x00400000;
const DATA_BASE = 0x10010000;
const HEAP_BASE = 0x10040000;
const STACK_TOP = 0x7fffeffc;
const GP = 0x10008000;

export const REGISTER_NAMES = [
    "zero", "at", "v0", "v1", "a0", "a1", "a2", "a3",
    "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7",
    "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7",
    "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra",
];

const MESSAGES = {
    unknownInstruction: { tr: "Bilinmeyen komut: {name}", en: "Unknown instruction: {name}" },
    floatUnsupported: { tr: "Kayan noktalı (yardımcı işlemci 1) komutları desteklenmiyor: {name}", en: "Floating-point (coprocessor 1) instructions are not supported: {name}" },
    unknownDirective: { tr: "Bilinmeyen yönerge: {name}", en: "Unknown directive: {name}" },
    operandCount: { tr: "{name} {count} işlenen bekliyor: {format}", en: "{name} expects {count} operands: {format}" },
    expectedRegister: { tr: "Yazmaç bekleniyordu, \"{text}\" bulundu", en: "Expected a register but found \"{text}\"" },
    unknownRegister: { tr: "Bilinmeyen yazmaç: {text}", en: "Unknown register: {text}" },
    expectedImmediate: { tr: "Sayı bekleniyordu, \"{text}\" bulundu", en: "Expected a number but found \"{text}\"" },
    expectedAddress: { tr: "Adres bekleniyordu (örneğin 4($sp) veya bir etiket), \"{text}\" bulundu", en: "Expected an address (for example 4($sp) or a label) but found \"{text}\"" },
    undefinedLabel: { tr: "Tanımsız etiket: {name}", en: "Undefined label: {name}" },
    duplicateLabel: { tr: "Etiket iki kez tanımlanmış: {name}", en: "Label defined twice: {name}" },
    instructionInData: { tr: "Komutlar .text bölümünde olmalıdır ({name})", en: "Instructions belong in the .text segment ({name})" },
    dataInText: { tr: "{name} yönergesi .data bölümünde kullanılmalıdır", en: "The {name} directive belongs in the .data segment" },
    badString: { tr: "Tırnak içinde bir metin bekleniyordu", en: "Expected a quoted string" },
    noInstructions: { tr: "Programda çalıştırılacak komut yok (.text bölümü boş)", en: "There are no instructions to run (the .text segment is empty)" },
    overflow: { tr: "Aritmetik taşma ({name})", en: "Arithmetic overflow ({name})" },
    divideByZero: { tr: "Sıfıra bölme ({name})", en: "Division by zero ({name})" },
    unaligned: { tr: "{name}: 0x{address} adresi {size} bayta hizalı değil", en: "{name}: address 0x{address} is not aligned to {size} bytes" },
    badAddress: { tr: "{name}: 0x{address} adresi geçerli bir veri adresi değil", en: "{name}: address 0x{address} is out of range" },
    badJump: { tr: "0x{address} adresinde komut yok ({name})", en: "There is no instruction at address 0x{address} ({name})" },
    badSyscall: { tr: "Desteklenmeyen sistem çağrısı: $v0 = {code}", en: "Unsupported syscall: $v0 = {code}" },
    badInt: { tr: "Okunan değer bir tamsayı değil: \"{text}\"", en: "The input is not an integer: \"{text}\"" },
    inputEnd: { tr: "Girdi bitti: Girdi sekmesine bir satır daha ekleyin", en: "No more input: add another line to the Input tab" },
    breakInstruction: { tr: "break komutu çalıştırıldı (kod {code})", en: "break instruction executed (code {code})" },
    stepLimit: { tr: "Adım sınırı aşıldı ({count} komut)", en: "Step limit exceeded ({count} instructions)" },
    timeLimit: { tr: "Süre sınırı aşıldı; programda sonsuz döngü olabilir", en: "Time limit exceeded; the program may contain an infinite loop" },
    memoryLimit: { tr: "Bellek sınırı aşıldı", en: "Memory limit exceeded" },
};
type MessageKey = keyof typeof MESSAGES;

class MipsError extends Error {
    readonly key: MessageKey;
    readonly vars: Record<string, string | number>;
    line?: number;
    column?: number;
    constructor(key: MessageKey, vars: Record<string, string | number> = {}, line?: number, column?: number) {
        super(key);
        this.key = key;
        this.vars = vars;
        this.line = line;
        this.column = column;
    }
}
class MipsExit extends Error {
    readonly code: number;
    constructor(code: number) {
        super("exit");
        this.code = code;
    }
}

// ------------------------------------------------------------------ memory
class Memory {
    private readonly pages = new Map<number, Uint8Array>();
    private allocated = 0;

    private page(address: number, create: boolean) {
        const key = Math.floor(address / 4096);
        let page = this.pages.get(key);
        if (!page && create) {
            this.allocated += 4096;
            if (this.allocated > 64 * 1024 * 1024) throw new MipsError("memoryLimit");
            page = new Uint8Array(4096);
            this.pages.set(key, page);
        }
        return page;
    }

    readByte(address: number) {
        return this.page(address, false)?.[address % 4096] ?? 0;
    }

    writeByte(address: number, value: number) {
        this.page(address, true)![address % 4096] = value & 0xff;
    }

    read(address: number, size: 1 | 2 | 4) {
        let value = 0;
        for (let index = size - 1; index >= 0; index -= 1) value = (value * 256) + this.readByte(address + index);
        return value >>> 0;
    }

    write(address: number, size: 1 | 2 | 4, value: number) {
        let rest = value >>> 0;
        for (let index = 0; index < size; index += 1) {
            this.writeByte(address + index, rest & 0xff);
            rest >>>= 8;
        }
    }
}

// ------------------------------------------------------------------ assembler
type Operand =
    | { kind: "reg"; reg: number; text: string }
    | { kind: "imm"; value: number; text: string }
    | { kind: "label"; name: string; offset: number; text: string }
    | { kind: "mem"; base: number; offset: number; label: string | null; text: string };

type Instruction = {
    name: string;
    operands: Operand[];
    line: number;
    column: number;
    address: number;
    /** Operand text as written and the column where it starts. */
    raw: string;
    restColumn: number;
    run?: (cpu: Cpu) => void;
};

type DataFixup = { address: number; size: 1 | 2 | 4; label: string; offset: number; line: number; column: number };

function parseIntLiteral(text: string): number | null {
    const trimmed = text.trim();
    let match = /^([-+]?)0x([0-9a-f]+)$/i.exec(trimmed);
    if (match) return (match[1] === "-" ? -1 : 1) * Number.parseInt(match[2], 16);
    match = /^([-+]?)0b([01]+)$/i.exec(trimmed);
    if (match) return (match[1] === "-" ? -1 : 1) * Number.parseInt(match[2], 2);
    if (/^[-+]?\d+$/.test(trimmed)) return Number(trimmed);
    match = /^'(\\?.)'$/.exec(trimmed);
    if (match) {
        const body = match[1];
        if (body.length === 2) return ({ n: 10, t: 9, r: 13, "0": 0, "\\": 92, "'": 39, "\"": 34 } as Record<string, number>)[body[1]] ?? body.codePointAt(1)!;
        return body.codePointAt(0)!;
    }
    return null;
}

function parseRegister(text: string): number | null {
    const match = /^\$(\w+)$/.exec(text.trim());
    if (!match) return null;
    const name = match[1].toLowerCase();
    if (/^\d+$/.test(name)) {
        const number = Number(name);
        return number < 32 ? number : null;
    }
    if (name === "s8") return 30;
    const index = REGISTER_NAMES.indexOf(name);
    return index >= 0 ? index : null;
}

/** Splits operands at commas outside quotes and parentheses. */
function splitOperands(text: string): Array<{ text: string; offset: number }> {
    const parts: Array<{ text: string; offset: number }> = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quote) {
            if (char === "\\") index += 1;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === "\"" || char === "'") quote = char;
        else if (char === "(") depth += 1;
        else if (char === ")") depth -= 1;
        else if (char === "," && depth === 0) {
            parts.push({ text: text.slice(start, index), offset: start });
            start = index + 1;
        }
    }
    if (text.slice(start).trim() || parts.length) parts.push({ text: text.slice(start), offset: start });
    return parts.map((part) => {
        const leading = part.text.length - part.text.trimStart().length;
        return { text: part.text.trim(), offset: part.offset + leading };
    }).filter((part) => part.text);
}

/** Removes a # comment, ignoring # inside quotes. */
function stripComment(line: string) {
    let quote: string | null = null;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (quote) {
            if (char === "\\") index += 1;
            else if (char === quote) quote = null;
        } else if (char === "\"" || char === "'") {
            quote = char;
        } else if (char === "#") {
            return line.slice(0, index);
        }
    }
    return line;
}

function decodeString(body: string): number[] {
    const bytes: number[] = [];
    const encoder = new TextEncoder();
    for (let index = 0; index < body.length; index += 1) {
        const char = body[index];
        if (char === "\\") {
            const next = body[++index];
            const map: Record<string, number> = { n: 10, t: 9, r: 13, "0": 0, "\\": 92, "\"": 34, "'": 39 };
            if (next !== undefined && map[next] !== undefined) bytes.push(map[next]);
            else if (next !== undefined) bytes.push(...encoder.encode(next));
            continue;
        }
        const code = body.codePointAt(index)!;
        if (code > 0xffff) index += 1;
        bytes.push(...encoder.encode(String.fromCodePoint(code)));
    }
    return bytes;
}

// Operand format letters: r register, i immediate, l label (branch/jump target),
// m memory address, x register or immediate.
const FORMATS: Record<string, string> = {
    add: "r,r,x", addu: "r,r,x", sub: "r,r,x", subu: "r,r,x", and: "r,r,x", or: "r,r,x", xor: "r,r,x", nor: "r,r,r",
    slt: "r,r,x", sltu: "r,r,x", mul: "r,r,x", sllv: "r,r,r", srlv: "r,r,r", srav: "r,r,r", movn: "r,r,r", movz: "r,r,r",
    addi: "r,r,i", addiu: "r,r,i", andi: "r,r,i", ori: "r,r,i", xori: "r,r,i", slti: "r,r,i", sltiu: "r,r,i",
    sll: "r,r,i", srl: "r,r,i", sra: "r,r,i", rol: "r,r,x", ror: "r,r,x",
    mult: "r,r", multu: "r,r", madd: "r,r", maddu: "r,r", div: "r,r|r,r,x", divu: "r,r|r,r,x", rem: "r,r,x", remu: "r,r,x",
    mfhi: "r", mflo: "r", mthi: "r", mtlo: "r", lui: "r,i",
    lw: "r,m", lh: "r,m", lhu: "r,m", lb: "r,m", lbu: "r,m", sw: "r,m", sh: "r,m", sb: "r,m", la: "r,m",
    beq: "r,x,l", bne: "r,x,l", blt: "r,x,l", bgt: "r,x,l", ble: "r,x,l", bge: "r,x,l",
    bltu: "r,x,l", bgtu: "r,x,l", bleu: "r,x,l", bgeu: "r,x,l",
    bgtz: "r,l", blez: "r,l", bltz: "r,l", bgez: "r,l", bltzal: "r,l", bgezal: "r,l", beqz: "r,l", bnez: "r,l",
    b: "l", j: "l", jal: "l|r", jr: "r", jalr: "r|r,r",
    li: "r,i", move: "r,r", neg: "r,r", negu: "r,r", not: "r,r", abs: "r,r",
    seq: "r,r,x", sne: "r,r,x", sge: "r,r,x", sgt: "r,r,x", sle: "r,r,x", sgeu: "r,r,x", sgtu: "r,r,x", sleu: "r,r,x",
    syscall: "", nop: "", break: "|i",
};

type Cpu = {
    regs: Int32Array;
    hi: number;
    lo: number;
    pc: number;
    memory: Memory;
    instructions: Instruction[];
    current: Instruction;
    jump: (address: number) => void;
    syscall: () => void;
};

export class MipsProgram {
    readonly instructions: Instruction[] = [];
    readonly labels = new Map<string, number>();
    readonly memory = new Memory();
    entry = TEXT_BASE;
    dataEnd = DATA_BASE;

    static assemble(source: string): MipsProgram {
        const program = new MipsProgram();
        program.assemble(source);
        return program;
    }

    private assemble(source: string) {
        let segment: "text" | "data" = "text";
        let dataAddress = DATA_BASE;
        let textAddress = TEXT_BASE;
        const fixups: DataFixup[] = [];
        const eqv = new Map<string, string>();
        const lines = source.replace(/\r\n?/g, "\n").split("\n");
        const align = (size: number) => {
            dataAddress = Math.ceil(dataAddress / size) * size;
        };
        lines.forEach((rawLine, lineIndex) => {
            const line = lineIndex + 1;
            let text = stripComment(rawLine);
            let column = 1;
            // Labels ("name:"), possibly several on one line.
            for (;;) {
                const match = /^(\s*)([A-Za-z_.$][\w.$]*)\s*:/.exec(text);
                if (!match) break;
                const name = match[2];
                if (this.labels.has(name)) throw new MipsError("duplicateLabel", { name }, line, column + match[1].length);
                this.labels.set(name, segment === "text" ? textAddress : dataAddress);
                column += match[0].length;
                text = text.slice(match[0].length);
            }
            const leading = text.length - text.trimStart().length;
            const body = text.trim();
            if (!body) return;
            column += leading;
            const head = /^(\S+)\s*/.exec(body)!;
            const name = head[1];
            let rest = body.slice(head[0].length);
            const restColumn = column + head[0].length;
            for (const [key, value] of eqv) rest = rest.replace(new RegExp(`(?<![\\w$])${key.replace(/[.$]/g, "\\$&")}(?![\\w])`, "g"), value);
            if (name.startsWith(".")) {
                const directive = name.toLowerCase();
                const operands = splitOperands(rest);
                switch (directive) {
                    case ".text": segment = "text"; return;
                    case ".data": segment = "data"; if (operands[0]) dataAddress = parseIntLiteral(operands[0].text) ?? dataAddress; return;
                    case ".globl": case ".global": case ".extern": case ".set": case ".ent": case ".end": return;
                    case ".eqv": {
                        const match = /^(\S+)\s+(.+)$/.exec(rest.trim());
                        if (!match) throw new MipsError("unknownDirective", { name }, line, column);
                        eqv.set(match[1], match[2].trim());
                        return;
                    }
                    case ".word": case ".half": case ".byte": {
                        if (segment !== "data") throw new MipsError("dataInText", { name }, line, column);
                        const size = directive === ".word" ? 4 : directive === ".half" ? 2 : 1;
                        align(size);
                        for (const operand of operands) {
                            // "value : count" repeats a value (MARS).
                            const repeat = /^(.*?)\s*:\s*(\d+)$/.exec(operand.text);
                            const valueText = repeat ? repeat[1] : operand.text;
                            const times = repeat ? Number(repeat[2]) : 1;
                            for (let index = 0; index < times; index += 1) {
                                const value = parseIntLiteral(valueText);
                                if (value === null) {
                                    const labelMatch = /^([A-Za-z_.$][\w.$]*)\s*(?:([-+])\s*(\d+))?$/.exec(valueText);
                                    if (!labelMatch || size !== 4) throw new MipsError("expectedImmediate", { text: valueText }, line, restColumn + operand.offset);
                                    fixups.push({ address: dataAddress, size, label: labelMatch[1], offset: labelMatch[3] ? Number(labelMatch[3]) * (labelMatch[2] === "-" ? -1 : 1) : 0, line, column: restColumn + operand.offset });
                                } else {
                                    this.memory.write(dataAddress, size, value);
                                }
                                dataAddress += size;
                            }
                        }
                        return;
                    }
                    case ".ascii": case ".asciiz": {
                        if (segment !== "data") throw new MipsError("dataInText", { name }, line, column);
                        const match = /^"((?:[^"\\]|\\.)*)"$/.exec(rest.trim());
                        if (!match) throw new MipsError("badString", {}, line, restColumn);
                        for (const byte of decodeString(match[1])) this.memory.writeByte(dataAddress++, byte);
                        if (directive === ".asciiz") this.memory.writeByte(dataAddress++, 0);
                        return;
                    }
                    case ".space": {
                        if (segment !== "data") throw new MipsError("dataInText", { name }, line, column);
                        const value = parseIntLiteral(operands[0]?.text ?? "");
                        if (value === null || value < 0) throw new MipsError("expectedImmediate", { text: operands[0]?.text ?? "" }, line, restColumn);
                        dataAddress += value;
                        return;
                    }
                    case ".align": {
                        const value = parseIntLiteral(operands[0]?.text ?? "");
                        if (value === null || value < 0 || value > 12) throw new MipsError("expectedImmediate", { text: operands[0]?.text ?? "" }, line, restColumn);
                        if (segment === "data") align(2 ** value);
                        return;
                    }
                    case ".float": case ".double":
                        throw new MipsError("floatUnsupported", { name }, line, column);
                    default:
                        throw new MipsError("unknownDirective", { name }, line, column);
                }
            }
            if (segment !== "text") throw new MipsError("instructionInData", { name }, line, column);
            this.instructions.push({ name: name.toLowerCase(), operands: [], line, column, address: textAddress, raw: rest, restColumn });
            textAddress += 4;
        });
        this.dataEnd = dataAddress;
        for (const fixup of fixups) {
            const address = this.labels.get(fixup.label);
            if (address === undefined) throw new MipsError("undefinedLabel", { name: fixup.label }, fixup.line, fixup.column);
            this.memory.write(fixup.address, fixup.size, address + fixup.offset);
        }
        for (const instruction of this.instructions) this.compile(instruction);
        if (!this.instructions.length) throw new MipsError("noInstructions");
        this.entry = this.labels.has("main") && this.labels.get("main")! >= TEXT_BASE && this.labels.get("main")! < TEXT_BASE + this.instructions.length * 4
            ? this.labels.get("main")!
            : TEXT_BASE;
    }

    private parseOperand(text: string, line: number, column: number): Operand {
        const register = parseRegister(text);
        if (register !== null) return { kind: "reg", reg: register, text };
        if (/^\$/.test(text)) throw new MipsError("unknownRegister", { text }, line, column);
        const immediate = parseIntLiteral(text);
        if (immediate !== null) return { kind: "imm", value: immediate, text };
        const memory = /^(.*?)\(\s*(\$\w+)\s*\)$/.exec(text);
        if (memory) {
            const base = parseRegister(memory[2]);
            if (base === null) throw new MipsError("unknownRegister", { text: memory[2] }, line, column);
            const offsetText = memory[1].trim();
            if (!offsetText) return { kind: "mem", base, offset: 0, label: null, text };
            const offset = parseIntLiteral(offsetText);
            if (offset !== null) return { kind: "mem", base, offset, label: null, text };
            const labelMatch = /^([A-Za-z_.$][\w.$]*)\s*(?:([-+])\s*(\w+))?$/.exec(offsetText);
            if (!labelMatch) throw new MipsError("expectedAddress", { text }, line, column);
            const extra = labelMatch[3] ? parseIntLiteral(labelMatch[3]) ?? 0 : 0;
            return { kind: "mem", base, offset: labelMatch[2] === "-" ? -extra : extra, label: labelMatch[1], text };
        }
        const label = /^([A-Za-z_.$][\w.$]*)\s*(?:([-+])\s*(\w+))?$/.exec(text);
        if (label) {
            const extra = label[3] ? parseIntLiteral(label[3]) ?? 0 : 0;
            return { kind: "label", name: label[1], offset: label[2] === "-" ? -extra : extra, text };
        }
        throw new MipsError("expectedImmediate", { text }, line, column);
    }

    private resolve(name: string, line: number, column: number) {
        const address = this.labels.get(name);
        if (address === undefined) throw new MipsError("undefinedLabel", { name }, line, column);
        return address;
    }

    private compile(instruction: Instruction) {
        const name = instruction.name;
        const { line, column } = instruction;
        if (/\.(s|d|w)$/.test(name) || /^(lwc1|swc1|ldc1|sdc1|mtc1|mfc1|cvt|bc1[tf])/.test(name)) throw new MipsError("floatUnsupported", { name }, line, column);
        const format = FORMATS[name];
        if (format === undefined) throw new MipsError("unknownInstruction", { name }, line, column);
        const parts = splitOperands(instruction.raw);
        const operands = parts.map((part) => this.parseOperand(part.text, line, instruction.restColumn + part.offset));
        const variants = format.split("|");
        const variant = variants.find((item) => (item ? item.split(",").length : 0) === operands.length);
        if (variant === undefined) {
            const expected = variants.map((item) => (item ? item.split(",").length : 0)).join(" / ");
            throw new MipsError("operandCount", { name, count: expected, format: variants.map((item) => `${name} ${item.replace(/r/g, "$reg").replace(/i/g, "imm").replace(/l/g, "label").replace(/m/g, "addr").replace(/x/g, "$reg|imm")}`).join(" | ") }, line, column);
        }
        const kinds = variant ? variant.split(",") : [];
        kinds.forEach((kind, index) => {
            const operand = operands[index];
            const at = instruction.restColumn + parts[index].offset;
            if (kind === "r" && operand.kind !== "reg") throw new MipsError("expectedRegister", { text: operand.text }, line, at);
            if (kind === "i" && operand.kind !== "imm") {
                if (operand.kind === "label" && (name === "li" || name === "la")) return;
                throw new MipsError("expectedImmediate", { text: operand.text }, line, at);
            }
            if (kind === "x" && operand.kind !== "reg" && operand.kind !== "imm") throw new MipsError("expectedImmediate", { text: operand.text }, line, at);
            if (kind === "l" && operand.kind !== "label" && !(operand.kind === "imm")) throw new MipsError("expectedAddress", { text: operand.text }, line, at);
            if (kind === "m" && operand.kind === "reg") throw new MipsError("expectedAddress", { text: operand.text }, line, at);
        });
        // Labels used by memory operands, branches and la must exist.
        for (const [index, operand] of operands.entries()) {
            const at = instruction.restColumn + parts[index].offset;
            if (operand.kind === "label") this.resolve(operand.name, line, at);
            if (operand.kind === "mem" && operand.label) this.resolve(operand.label, line, at);
        }
        instruction.operands = operands;
        instruction.run = buildExecutor(name, operands, this);
    }

    addressOf(operand: Operand, cpu: Cpu): number {
        if (operand.kind === "mem") return ((operand.label ? this.labels.get(operand.label)! : 0) + operand.offset + cpu.regs[operand.base]) >>> 0;
        if (operand.kind === "label") return (this.labels.get(operand.name)! + operand.offset) >>> 0;
        if (operand.kind === "imm") return operand.value >>> 0;
        return cpu.regs[operand.reg] >>> 0;
    }
}

function buildExecutor(name: string, operands: Operand[], program: MipsProgram): (cpu: Cpu) => void {
    const reg = (index: number) => (operands[index] as Extract<Operand, { kind: "reg" }>).reg;
    const value = (cpu: Cpu, index: number) => {
        const operand = operands[index];
        return operand.kind === "reg" ? cpu.regs[operand.reg] : (operand as Extract<Operand, { kind: "imm" }>).value | 0;
    };
    const set = (cpu: Cpu, index: number, result: number) => {
        const target = reg(index);
        if (target !== 0) cpu.regs[target] = result | 0;
    };
    const overflow = (cpu: Cpu) => new MipsError("overflow", { name }, cpu.current.line, cpu.current.column);
    const target = (cpu: Cpu, index: number) => program.addressOf(operands[index], cpu);
    const branch = (test: (a: number, b: number) => boolean, unsigned = false) => (cpu: Cpu) => {
        let a = cpu.regs[reg(0)];
        let b = operands.length === 3 ? value(cpu, 1) : 0;
        if (unsigned) {
            a >>>= 0;
            b >>>= 0;
        }
        if (test(a, b)) cpu.jump(target(cpu, operands.length - 1));
    };
    const memory = (size: 1 | 2 | 4, signedLoad: boolean) => (cpu: Cpu) => {
        const address = target(cpu, 1);
        const loaded = loadMemory(cpu, address, size, name);
        set(cpu, 0, signedLoad ? (size === 4 ? loaded | 0 : size === 2 ? (loaded << 16) >> 16 : (loaded << 24) >> 24) : loaded);
    };
    const store = (size: 1 | 2 | 4) => (cpu: Cpu) => storeMemory(cpu, target(cpu, 1), size, cpu.regs[reg(0)], name);
    const divide = (unsigned: boolean, wantRemainder: boolean | null) => (cpu: Cpu) => {
        const three = operands.length === 3;
        let a = cpu.regs[reg(three ? 1 : 0)];
        let b = three ? value(cpu, 2) : cpu.regs[reg(1)];
        if (b === 0) {
            // The real div leaves hi/lo undefined; the 3-operand pseudo-instruction checks (like MARS).
            if (three) throw new MipsError("divideByZero", { name }, cpu.current.line, cpu.current.column);
            return;
        }
        if (unsigned) {
            a >>>= 0;
            b >>>= 0;
        }
        const quotient = unsigned ? Math.floor(a / b) : Math.trunc(a / b);
        const remainder = a - quotient * b;
        if (three) set(cpu, 0, wantRemainder ? remainder : quotient);
        else {
            cpu.lo = quotient | 0;
            cpu.hi = remainder | 0;
        }
    };
    const setIf = (test: (a: number, b: number) => boolean, unsigned = false) => (cpu: Cpu) => {
        let a = cpu.regs[reg(1)];
        let b = value(cpu, 2);
        if (unsigned) {
            a >>>= 0;
            b >>>= 0;
        }
        set(cpu, 0, test(a, b) ? 1 : 0);
    };
    switch (name) {
        case "add": case "addi": return (cpu) => {
            const a = cpu.regs[reg(1)];
            const b = value(cpu, 2);
            const result = a + b;
            if (result > 0x7fffffff || result < -0x80000000) throw overflow(cpu);
            set(cpu, 0, result);
        };
        case "sub": return (cpu) => {
            const result = cpu.regs[reg(1)] - value(cpu, 2);
            if (result > 0x7fffffff || result < -0x80000000) throw overflow(cpu);
            set(cpu, 0, result);
        };
        case "addu": case "addiu": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] + value(cpu, 2));
        case "subu": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] - value(cpu, 2));
        case "and": case "andi": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] & (name === "andi" ? value(cpu, 2) & 0xffff : value(cpu, 2)));
        case "or": case "ori": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] | (name === "ori" ? value(cpu, 2) & 0xffff : value(cpu, 2)));
        case "xor": case "xori": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] ^ (name === "xori" ? value(cpu, 2) & 0xffff : value(cpu, 2)));
        case "nor": return (cpu) => set(cpu, 0, ~(cpu.regs[reg(1)] | cpu.regs[reg(2)]));
        case "slt": case "slti": return setIf((a, b) => a < b);
        case "sltu": case "sltiu": return setIf((a, b) => a < b, true);
        case "seq": return setIf((a, b) => a === b);
        case "sne": return setIf((a, b) => a !== b);
        case "sge": return setIf((a, b) => a >= b);
        case "sgt": return setIf((a, b) => a > b);
        case "sle": return setIf((a, b) => a <= b);
        case "sgeu": return setIf((a, b) => a >= b, true);
        case "sgtu": return setIf((a, b) => a > b, true);
        case "sleu": return setIf((a, b) => a <= b, true);
        case "mul": return (cpu) => set(cpu, 0, Math.imul(cpu.regs[reg(1)], value(cpu, 2)));
        case "mult": case "multu": case "madd": case "maddu": return (cpu) => {
            const unsigned = name.endsWith("u");
            const a = BigInt(unsigned ? cpu.regs[reg(0)] >>> 0 : cpu.regs[reg(0)]);
            const b = BigInt(unsigned ? cpu.regs[reg(1)] >>> 0 : cpu.regs[reg(1)]);
            let product = a * b;
            if (name.startsWith("madd")) product += (BigInt(cpu.hi) << BigInt(32)) | BigInt(cpu.lo >>> 0);
            cpu.lo = Number(BigInt.asIntN(32, product));
            cpu.hi = Number(BigInt.asIntN(32, product >> BigInt(32)));
        };
        case "div": return divide(false, false);
        case "divu": return divide(true, false);
        case "rem": return divide(false, true);
        case "remu": return divide(true, true);
        case "mfhi": return (cpu) => set(cpu, 0, cpu.hi);
        case "mflo": return (cpu) => set(cpu, 0, cpu.lo);
        case "mthi": return (cpu) => { cpu.hi = cpu.regs[reg(0)]; };
        case "mtlo": return (cpu) => { cpu.lo = cpu.regs[reg(0)]; };
        case "sll": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] << (value(cpu, 2) & 31));
        case "srl": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] >>> (value(cpu, 2) & 31));
        case "sra": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] >> (value(cpu, 2) & 31));
        case "sllv": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] << (cpu.regs[reg(2)] & 31));
        case "srlv": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] >>> (cpu.regs[reg(2)] & 31));
        case "srav": return (cpu) => set(cpu, 0, cpu.regs[reg(1)] >> (cpu.regs[reg(2)] & 31));
        case "rol": return (cpu) => { const n = value(cpu, 2) & 31; const v = cpu.regs[reg(1)] >>> 0; set(cpu, 0, (v << n) | (v >>> ((32 - n) & 31))); };
        case "ror": return (cpu) => { const n = value(cpu, 2) & 31; const v = cpu.regs[reg(1)] >>> 0; set(cpu, 0, (v >>> n) | (v << ((32 - n) & 31))); };
        case "movn": return (cpu) => { if (cpu.regs[reg(2)] !== 0) set(cpu, 0, cpu.regs[reg(1)]); };
        case "movz": return (cpu) => { if (cpu.regs[reg(2)] === 0) set(cpu, 0, cpu.regs[reg(1)]); };
        case "lui": return (cpu) => set(cpu, 0, (value(cpu, 1) & 0xffff) << 16);
        case "li": return (cpu) => set(cpu, 0, operands[1].kind === "label" ? target(cpu, 1) : value(cpu, 1));
        case "la": return (cpu) => set(cpu, 0, target(cpu, 1));
        case "move": return (cpu) => set(cpu, 0, cpu.regs[reg(1)]);
        case "neg": return (cpu) => {
            const v = cpu.regs[reg(1)];
            if (v === -0x80000000) throw overflow(cpu);
            set(cpu, 0, -v);
        };
        case "negu": return (cpu) => set(cpu, 0, -cpu.regs[reg(1)]);
        case "not": return (cpu) => set(cpu, 0, ~cpu.regs[reg(1)]);
        case "abs": return (cpu) => set(cpu, 0, Math.abs(cpu.regs[reg(1)]));
        case "lw": return memory(4, true);
        case "lh": return memory(2, true);
        case "lhu": return memory(2, false);
        case "lb": return memory(1, true);
        case "lbu": return memory(1, false);
        case "sw": return store(4);
        case "sh": return store(2);
        case "sb": return store(1);
        case "beq": return branch((a, b) => a === b);
        case "bne": return branch((a, b) => a !== b);
        case "blt": return branch((a, b) => a < b);
        case "bgt": return branch((a, b) => a > b);
        case "ble": return branch((a, b) => a <= b);
        case "bge": return branch((a, b) => a >= b);
        case "bltu": return branch((a, b) => a < b, true);
        case "bgtu": return branch((a, b) => a > b, true);
        case "bleu": return branch((a, b) => a <= b, true);
        case "bgeu": return branch((a, b) => a >= b, true);
        case "bgtz": return branch((a) => a > 0);
        case "blez": return branch((a) => a <= 0);
        case "bltz": return branch((a) => a < 0);
        case "bgez": return branch((a) => a >= 0);
        case "beqz": return branch((a) => a === 0);
        case "bnez": return branch((a) => a !== 0);
        case "bltzal": case "bgezal": return (cpu) => {
            const a = cpu.regs[reg(0)];
            cpu.regs[31] = cpu.pc;
            if (name === "bltzal" ? a < 0 : a >= 0) cpu.jump(target(cpu, 1));
        };
        case "b": case "j": return (cpu) => cpu.jump(target(cpu, 0));
        case "jal": return (cpu) => {
            const address = operands[0].kind === "reg" ? cpu.regs[operands[0].reg] >>> 0 : target(cpu, 0);
            cpu.regs[31] = cpu.pc;
            cpu.jump(address);
        };
        case "jr": return (cpu) => cpu.jump(cpu.regs[reg(0)] >>> 0);
        case "jalr": return (cpu) => {
            const address = cpu.regs[reg(operands.length === 2 ? 1 : 0)] >>> 0;
            const link = operands.length === 2 ? reg(0) : 31;
            if (link !== 0) cpu.regs[link] = cpu.pc;
            cpu.jump(address);
        };
        case "syscall": return (cpu) => cpu.syscall();
        case "nop": return () => undefined;
        case "break": return (cpu) => {
            throw new MipsError("breakInstruction", { code: operands[0] ? value(cpu, 0) : 0 }, cpu.current.line, cpu.current.column);
        };
    }
    throw new MipsError("unknownInstruction", { name });
}

function checkDataAddress(cpu: Cpu, address: number, size: number, name: string) {
    const hex = (address >>> 0).toString(16).padStart(8, "0");
    if (address % size !== 0) throw new MipsError("unaligned", { name, address: hex, size }, cpu.current.line, cpu.current.column);
    if (address < 0x10000000 || address + size > 0x80000000) throw new MipsError("badAddress", { name, address: hex }, cpu.current.line, cpu.current.column);
}

function loadMemory(cpu: Cpu, address: number, size: 1 | 2 | 4, name: string) {
    checkDataAddress(cpu, address, size, name);
    return cpu.memory.read(address, size);
}

function storeMemory(cpu: Cpu, address: number, size: 1 | 2 | 4, value: number, name: string) {
    checkDataAddress(cpu, address, size, name);
    cpu.memory.write(address, size, value);
}

// ------------------------------------------------------------------ running
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

function describe(error: MipsError, locale: Locale) {
    return MESSAGES[error.key][locale].replace(/\{(\w+)\}/g, (match, name: string) => (name in error.vars ? String(error.vars[name]) : match));
}

export function runMips(source: string, options: MipsOptions = {}): MipsResult {
    const locale: Locale = options.locale === "tr" ? "tr" : "en";
    const regs = new Int32Array(32);
    let output = "";
    let pending = "";
    let steps = 0;
    const decoder = new TextDecoder();
    const flush = () => {
        if (!pending) return;
        output += pending;
        options.onOutput?.(pending);
        pending = "";
    };
    const writeText = (text: string) => {
        pending += text;
        if (pending.length >= 1024) flush();
    };
    const writeBytes = (bytes: number[]) => writeText(decoder.decode(Uint8Array.from(bytes), { stream: true }));

    let program: MipsProgram;
    try {
        program = MipsProgram.assemble(source);
    } catch (error) {
        if (error instanceof MipsError) return { output, exitCode: 1, steps, registers: [...regs], error: { message: describe(error, locale), line: error.line, column: error.column } };
        throw error;
    }

    const input = (options.stdin ?? "").replace(/\r\n/g, "\n");
    let inputIndex = 0;
    const readLine = (cpu: Cpu) => {
        if (inputIndex >= input.length) throw new MipsError("inputEnd", {}, cpu.current.line, cpu.current.column);
        const end = input.indexOf("\n", inputIndex);
        const line = end < 0 ? input.slice(inputIndex) : input.slice(inputIndex, end);
        inputIndex = end < 0 ? input.length : end + 1;
        return line;
    };
    let heap = HEAP_BASE;
    let random = mulberry32(options.seed ?? 20_250_101);
    const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
    regs[28] = GP;
    regs[29] = STACK_TOP;

    const cpu: Cpu = {
        regs,
        hi: 0,
        lo: 0,
        pc: program.entry,
        memory: program.memory,
        instructions: program.instructions,
        current: program.instructions[0],
        jump: (address) => {
            const index = (address - TEXT_BASE) / 4;
            if (!Number.isInteger(index) || index < 0 || index > program.instructions.length) {
                throw new MipsError("badJump", { address: (address >>> 0).toString(16).padStart(8, "0"), name: cpu.current.name }, cpu.current.line, cpu.current.column);
            }
            cpu.pc = address;
        },
        syscall: () => {
            const code = regs[2];
            const a0 = regs[4];
            switch (code) {
                case 1: writeText(String(a0)); return;
                case 4: {
                    const bytes: number[] = [];
                    for (let address = a0 >>> 0; ; address += 1) {
                        const byte = loadMemory(cpu, address, 1, "syscall 4");
                        if (byte === 0 || bytes.length > 1_000_000) break;
                        bytes.push(byte);
                    }
                    writeBytes(bytes);
                    return;
                }
                case 5: {
                    const text = readLine(cpu).trim();
                    if (!/^[-+]?\d+$/.test(text)) throw new MipsError("badInt", { text: text.slice(0, 40) }, cpu.current.line, cpu.current.column);
                    regs[2] = Number(text) | 0;
                    return;
                }
                case 8: {
                    const max = regs[5];
                    if (max < 1) return;
                    let line: string;
                    try {
                        line = `${readLine(cpu)}\n`;
                    } catch {
                        line = "";
                    }
                    const bytes = [...new TextEncoder().encode(line)].slice(0, max - 1);
                    bytes.forEach((byte, index) => storeMemory(cpu, (a0 >>> 0) + index, 1, byte, "syscall 8"));
                    storeMemory(cpu, (a0 >>> 0) + bytes.length, 1, 0, "syscall 8");
                    return;
                }
                case 9: {
                    const size = Math.max(0, a0);
                    regs[2] = heap;
                    heap += Math.ceil(size / 4) * 4;
                    if (heap > 0x10400000) throw new MipsError("memoryLimit", {}, cpu.current.line, cpu.current.column);
                    return;
                }
                case 10: throw new MipsExit(0);
                case 11: writeBytes([a0 & 0xff]); return;
                case 12: {
                    if (inputIndex >= input.length) {
                        regs[2] = 0;
                        return;
                    }
                    const codePoint = input.codePointAt(inputIndex)!;
                    inputIndex += codePoint > 0xffff ? 2 : 1;
                    regs[2] = codePoint;
                    return;
                }
                case 17: throw new MipsExit(a0);
                case 30: {
                    const now = BigInt(Date.now());
                    regs[4] = Number(BigInt.asIntN(32, now));
                    regs[5] = Number(BigInt.asIntN(32, now >> BigInt(32)));
                    return;
                }
                case 31: case 32: case 33: return;
                case 34: writeText(`0x${(a0 >>> 0).toString(16).padStart(8, "0")}`); return;
                case 35: writeText((a0 >>> 0).toString(2).padStart(32, "0")); return;
                case 36: writeText(String(a0 >>> 0)); return;
                case 40: random = mulberry32(regs[5]); return;
                case 41: regs[4] = Math.floor(random() * 0x100000000) | 0; return;
                case 42: {
                    const bound = regs[5];
                    if (bound <= 0) throw new MipsError("badSyscall", { code }, cpu.current.line, cpu.current.column);
                    regs[4] = Math.floor(random() * bound);
                    return;
                }
                default:
                    throw new MipsError("badSyscall", { code }, cpu.current.line, cpu.current.column);
            }
        },
    };

    const finish = (exitCode: number, error?: MipsError): MipsResult => {
        writeText(decoder.decode());
        flush();
        return {
            output,
            exitCode,
            steps,
            registers: [...regs],
            error: error ? { message: describe(error, locale), line: error.line, column: error.column } : undefined,
        };
    };

    try {
        const end = TEXT_BASE + program.instructions.length * 4;
        while (cpu.pc < end) {
            const instruction = program.instructions[(cpu.pc - TEXT_BASE) / 4];
            cpu.current = instruction;
            cpu.pc += 4;
            steps += 1;
            if (steps > maxSteps) throw new MipsError("stepLimit", { count: maxSteps }, instruction.line, instruction.column);
            if ((steps & 0xffff) === 0 && options.shouldStop?.()) throw new MipsError("timeLimit", {}, instruction.line, instruction.column);
            instruction.run!(cpu);
        }
        return finish(0);
    } catch (error) {
        if (error instanceof MipsExit) return finish(error.code);
        if (error instanceof MipsError) {
            if (error.line === undefined) {
                error.line = cpu.current.line;
                error.column = cpu.current.column;
            }
            return finish(1, error);
        }
        throw error;
    }
}

