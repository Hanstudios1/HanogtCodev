/**
 * The WebAssembly text format in the browser: WABT's parser and validator
 * (wabt, Apache-2.0, loaded on first use) turn the module into a binary,
 * which the browser's own WebAssembly engine then runs.
 *
 * The module may import, from "env":
 *  - print_i32, print_i64 (a BigInt in JavaScript), print_f32, print_f64:
 *    print a number on its own line;
 *  - print(ptr, len): prints UTF-8 text from the module's memory;
 *  - print_char(code): prints one character without a line break;
 *  - read_i32(): the next whole number of the Input tab (0 when there is none);
 *  - memory: a memory of the size the module asks for.
 * `console.log` (as in the MDN examples) prints its arguments, and the
 * basics of WASI preview 1 (fd_write, fd_read, proc_exit…) are there for
 * `_start` programs. The exported `main` (or `_start`) runs; when `main`
 * returns a value, it is printed after the program's own output.
 */
import wabtFactory from "wabt";

export interface WatRunOptions {
    stdin?: string;
    /** Shown in error locations, e.g. "main.wat". */
    fileName?: string;
    locale?: "tr" | "en";
    /** Receives program output; throwing (e.g. at the output limit) stops the program. */
    onOutput: (text: string) => void;
}

export interface WatRunResult {
    exitCode: number;
    error?: string;
}

type Wabt = Awaited<ReturnType<typeof wabtFactory>>;

let wabtPromise: Promise<Wabt> | null = null;

export function loadWabt(): Promise<Wabt> {
    if (!wabtPromise) {
        wabtPromise = wabtFactory();
        wabtPromise.catch(() => {
            wabtPromise = null;
        });
    }
    return wabtPromise;
}

/** Post-MVP features every current browser supports. */
const FEATURES = {
    mutable_globals: true, sat_float_to_int: true, sign_extension: true, simd: true,
    multi_value: true, bulk_memory: true, reference_types: true,
};

export const WAT_VERSION = "WebAssembly (wabt 1.0.39)";

const MESSAGES = {
    noEntry: { tr: "Modül main ya da _start adlı bir fonksiyonu dışa aktarmalı: (func (export \"main\") …)", en: "The module must export a function named main or _start: (func (export \"main\") …)" },
    entryParams: { tr: "{name} parametre almamalı (şu an {count} parametre alıyor)", en: "{name} must not take parameters (it takes {count})" },
    noMemory: { tr: "print için modülün belleğini \"memory\" adıyla dışa aktarması gerekir: (memory (export \"memory\") 1)", en: "print needs the module to export its memory as \"memory\": (memory (export \"memory\") 1)" },
    badText: { tr: "print belleğin dışını okumaya çalıştı (adres {ptr}, uzunluk {len})", en: "print tried to read outside the memory (address {ptr}, length {len})" },
    missingImport: { tr: "{name} içe aktarımı sağlanmıyor. Kullanılabilenler: env.print, env.print_i32, env.print_i64, env.print_f32, env.print_f64, env.print_char, env.read_i32, env.memory", en: "The import {name} is not provided. Available: env.print, env.print_i32, env.print_i64, env.print_f32, env.print_f64, env.print_char, env.read_i32, env.memory" },
    unsupportedImport: { tr: "{kind} türündeki {name} içe aktarımı desteklenmiyor", en: "Importing {name} (a {kind}) is not supported" },
    returned: { tr: "main şunu döndürdü: {value}", en: "main returned {value}" },
};

function say(locale: "tr" | "en", key: keyof typeof MESSAGES, vars: Record<string, string | number> = {}) {
    return MESSAGES[key][locale].replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Thrown by WASI proc_exit. */
class WasiExit {
    readonly code: number;
    constructor(code: number) {
        this.code = code;
    }
}

/** A failure the program caused by calling an import wrongly; reported without a stack trace. */
class ImportError extends Error {}

/** The shortest decimal that reads back as the same 32-bit float (0.1, not 0.10000000149011612). */
function formatF32(value: number) {
    if (!Number.isFinite(value) || Number.isInteger(value)) return String(value);
    for (let precision = 1; precision <= 9; precision += 1) {
        const text = Number(value.toPrecision(precision));
        if (Math.fround(text) === value) return String(text);
    }
    return String(value);
}

function formatValue(value: unknown): string {
    if (Array.isArray(value)) return value.map(formatValue).join(" ");
    return String(value);
}

/** wabt's "parseWat failed:\nmain.wat:1:2: error: …" without the first line. */
function wabtMessage(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    return text.replace(/^(?:parseWat|validate|resolveNames) failed:\n/, "").replace(/\n+$/, "");
}

/** Memory sizes the module imports, read from wabt's text output of the binary. */
function importedMemoryLimits(wabt: Wabt, binary: Uint8Array): Map<string, { initial: number; maximum?: number; shared: boolean }> {
    const limits = new Map<string, { initial: number; maximum?: number; shared: boolean }>();
    const parsed = wabt.readWasm(binary, { readDebugNames: false, ...FEATURES });
    try {
        parsed.generateNames();
        parsed.applyNames();
        const text = parsed.toText({ foldExprs: false, inlineExport: false });
        const pattern = /\(import "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)" \(memory(?: \(;\d+;\)| \$[^\s)]+)? (\d+)(?: (\d+))?( shared)?\)\)/g;
        for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
            limits.set(`${match[1]}.${match[2]}`, { initial: Number(match[3]), maximum: match[4] ? Number(match[4]) : undefined, shared: Boolean(match[5]) });
        }
    } finally {
        parsed.destroy();
    }
    return limits;
}

/** Parses, validates and runs a WebAssembly text module. */
export async function runWat(source: string, options: WatRunOptions): Promise<WatRunResult> {
    const locale = options.locale === "tr" ? "tr" : "en";
    const fileName = options.fileName || "main.wat";
    const wabt = await loadWabt();

    // ---------------------------------------------------------------- compile
    let binary: Uint8Array;
    let parsed: ReturnType<Wabt["parseWat"]>;
    try {
        // As UTF-8 bytes: wabt reads a JavaScript string one byte per character, which breaks "ü" in (data …).
        parsed = wabt.parseWat(fileName, new TextEncoder().encode(source), FEATURES);
    } catch (error) {
        return { exitCode: 1, error: wabtMessage(error) };
    }
    try {
        parsed.resolveNames();
        parsed.validate();
        binary = parsed.toBinary({ log: false, write_debug_names: true }).buffer;
    } catch (error) {
        return { exitCode: 1, error: wabtMessage(error) };
    } finally {
        parsed.destroy();
    }
    const compiled = await WebAssembly.compile(binary as Uint8Array<ArrayBuffer>);

    // ---------------------------------------------------------------- imports
    let memory: WebAssembly.Memory | null = null;
    const decoder = new TextDecoder();
    const streams = { 1: new TextDecoder(), 2: new TextDecoder() } as Record<number, TextDecoder>;
    const input = new TextEncoder().encode((options.stdin ?? "").replace(/\r\n/g, "\n"));
    let inputOffset = 0;
    const numbers = (options.stdin ?? "").split(/\s+/).filter(Boolean);
    const out = options.onOutput;
    const memoryOf = () => {
        if (!memory) throw new ImportError(say(locale, "noMemory"));
        return memory;
    };
    const env: Record<string, unknown> = {
        print_i32: (value: number) => out(`${value}\n`),
        print_i64: (value: bigint) => out(`${value}\n`),
        print_f32: (value: number) => out(`${formatF32(value)}\n`),
        print_f64: (value: number) => out(`${value}\n`),
        print_char: (code: number) => out(String.fromCodePoint(Math.max(0, Math.min(0x10ffff, code >>> 0)))),
        read_i32: () => {
            while (numbers.length) {
                const value = Number.parseInt(numbers.shift()!, 10);
                if (Number.isFinite(value)) return value | 0;
            }
            return 0;
        },
        print: (ptr: number, len: number) => {
            const buffer = memoryOf().buffer;
            const start = ptr >>> 0;
            const length = len >>> 0;
            if (start + length > buffer.byteLength) throw new ImportError(say(locale, "badText", { ptr: start, len: length }));
            out(decoder.decode(new Uint8Array(buffer, start, length)));
        },
    };
    const wasi: Record<string, unknown> = {
        fd_write: (fd: number, iovs: number, count: number, written: number) => {
            if (fd !== 1 && fd !== 2) return 8; // EBADF
            const view = new DataView(memoryOf().buffer);
            let total = 0;
            let text = "";
            for (let index = 0; index < count; index += 1) {
                const pointer = view.getUint32(iovs + index * 8, true);
                const length = view.getUint32(iovs + index * 8 + 4, true);
                text += streams[fd].decode(new Uint8Array(memoryOf().buffer, pointer, length), { stream: true });
                total += length;
            }
            view.setUint32(written, total, true);
            out(text);
            return 0;
        },
        fd_read: (fd: number, iovs: number, count: number, read: number) => {
            if (fd !== 0) return 8;
            const view = new DataView(memoryOf().buffer);
            let total = 0;
            for (let index = 0; index < count && inputOffset < input.length; index += 1) {
                const pointer = view.getUint32(iovs + index * 8, true);
                const length = Math.min(view.getUint32(iovs + index * 8 + 4, true), input.length - inputOffset);
                new Uint8Array(memoryOf().buffer, pointer, length).set(input.subarray(inputOffset, inputOffset + length));
                inputOffset += length;
                total += length;
            }
            view.setUint32(read, total, true);
            return 0;
        },
        fd_fdstat_get: (fd: number, stat: number) => {
            if (fd > 2) return 8;
            new Uint8Array(memoryOf().buffer, stat, 24).fill(0);
            new DataView(memoryOf().buffer).setUint8(stat, 2); // a character device
            return 0;
        },
        fd_close: () => 0,
        fd_seek: () => 70, // ESPIPE
        proc_exit: (code: number) => {
            throw new WasiExit(code);
        },
        args_sizes_get: (count: number, size: number) => {
            const view = new DataView(memoryOf().buffer);
            view.setUint32(count, 0, true);
            view.setUint32(size, 0, true);
            return 0;
        },
        args_get: () => 0,
        environ_sizes_get: (count: number, size: number) => {
            const view = new DataView(memoryOf().buffer);
            view.setUint32(count, 0, true);
            view.setUint32(size, 0, true);
            return 0;
        },
        environ_get: () => 0,
        clock_time_get: (_id: number, _precision: bigint, time: number) => {
            new DataView(memoryOf().buffer).setBigUint64(time, BigInt(Date.now()) * BigInt(1_000_000), true);
            return 0;
        },
        random_get: (buffer: number, length: number) => {
            crypto.getRandomValues(new Uint8Array(memoryOf().buffer, buffer, length));
            return 0;
        },
    };
    const imports: Record<string, Record<string, unknown>> = {};
    const descriptors = WebAssembly.Module.imports(compiled);
    const memoryLimits = descriptors.some((item) => item.kind === "memory") ? importedMemoryLimits(wabt, binary) : new Map();
    for (const item of descriptors) {
        const name = `${item.module}.${item.name}`;
        const target = (imports[item.module] ??= {});
        if (item.kind === "memory") {
            const limits = memoryLimits.get(name) ?? { initial: 1, shared: false };
            memory = new WebAssembly.Memory({ initial: limits.initial, ...(limits.maximum !== undefined ? { maximum: limits.maximum } : {}), ...(limits.shared ? { shared: true } : {}) } as WebAssembly.MemoryDescriptor);
            target[item.name] = memory;
            continue;
        }
        if (item.kind !== "function") return { exitCode: 1, error: say(locale, "unsupportedImport", { name, kind: item.kind }) };
        if (item.module === "env" && item.name in env) target[item.name] = env[item.name];
        else if (item.module === "wasi_snapshot_preview1" || item.module === "wasi_unstable") target[item.name] = wasi[item.name] ?? (() => 52); // ENOSYS
        else if (item.module === "console" && item.name === "log") target[item.name] = (...args: unknown[]) => out(`${args.map(formatValue).join(" ")}\n`);
        else target[item.name] = () => { throw new ImportError(say(locale, "missingImport", { name })); };
    }

    // ---------------------------------------------------------------- run
    let instance: WebAssembly.Instance;
    try {
        instance = await WebAssembly.instantiate(compiled, imports as WebAssembly.Imports);
    } catch (error) {
        // A (start …) function runs here, so traps and exits can happen already.
        if (error instanceof WasiExit) return { exitCode: error.code };
        if (error instanceof ImportError) return { exitCode: 1, error: `Error: ${error.message}` };
        if (!(error instanceof WebAssembly.RuntimeError) && !(error instanceof WebAssembly.LinkError) && !(error instanceof RangeError)) throw error;
        return { exitCode: 1, error: describeTrap(error) };
    }
    const exported = instance.exports;
    if (exported.memory instanceof WebAssembly.Memory) memory = exported.memory;
    const entryName = typeof exported.main === "function" ? "main" : typeof exported._start === "function" ? "_start" : null;
    if (!entryName) return { exitCode: 1, error: say(locale, "noEntry") };
    const entry = exported[entryName] as (...args: unknown[]) => unknown;
    if (entry.length > 0) return { exitCode: 1, error: say(locale, "entryParams", { name: entryName, count: entry.length }) };
    let result: unknown;
    try {
        result = entry();
    } catch (error) {
        if (error instanceof WasiExit) return { exitCode: error.code };
        if (error instanceof ImportError) return { exitCode: 1, error: `Error: ${error.message}` };
        // Errors such as the output limit belong to the caller.
        if (!(error instanceof WebAssembly.RuntimeError) && !(error instanceof RangeError)) throw error;
        return { exitCode: 1, error: describeTrap(error) };
    }
    if (result !== undefined) out(`${say(locale, "returned", { value: formatValue(result) })}\n`);
    return { exitCode: 0 };
}

/** "RuntimeError: unreachable" with the WebAssembly frames (named by the module's debug names). */
function describeTrap(error: unknown) {
    if (!(error instanceof Error)) return String(error);
    const frames = (error.stack ?? "").split("\n").flatMap((line) => {
        const match = /^\s*at (?:(\S+) )?\(?wasm:\/\/wasm\/[^:]+:(wasm-function\[\d+\]):(0x[0-9a-f]+)\)?$/.exec(line);
        if (!match) return [];
        return [`    at ${match[1] ? `${match[1]} ` : ""}(${match[2]}:${match[3]})`];
    });
    // Deep recursion repeats one frame many times; show it once.
    const shown = frames.filter((frame, index) => frame !== frames[index - 1]).slice(0, 10);
    if (shown.length < frames.length) shown.push("    …");
    return [`${error.name}: ${error.message}`, ...shown].join("\n");
}
