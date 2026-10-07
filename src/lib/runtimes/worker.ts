/**
 * In-browser code runner (bundled to /runtimes/worker.js by scripts/copy-runtimes.mjs).
 *
 * Runs JavaScript, TypeScript (sucrase), Python (Pyodide), SQL (sql.js), Lua
 * (wasmoon), Prolog (Tau Prolog), Clojure (Scittle), CoffeeScript, jq
 * (jq-wasm), the WebAssembly text format (wabt) and Hanogt's own interpreters
 * for Scheme, Brainfuck, Forth, BASIC, Befunge-93, Whitespace and MIPS
 * assembly; compiles Less and SCSS to CSS; and validates and formats JSON,
 * YAML, TOML, XML, INI, .env, .properties and CSV inside a dedicated module
 * worker, so learners can execute code without any server-side runner.
 * Runtimes other than the original ones are separate chunks loaded on first
 * use. The worker has no DOM access; the page terminates it when a run
 * exceeds its time limit.
 */
import { transform } from "sucrase";
import initSqlJs from "sql.js/dist/sql-wasm-browser.js";
import { LuaFactory } from "wasmoon";
import { runBrainfuck } from "./brainfuck";
import { analyzeJson, codeFrame } from "./json-tools";
import { runScheme } from "./scheme";
import type { ValidationResult } from "./validation";

type Locale = "tr" | "en";
type RunRequest = {
    id: number;
    type: "run";
    language: string;
    code: string;
    stdin?: string;
    /** Shown in error locations (e.g. "main.py"). */
    fileName?: string;
    locale?: Locale;
    /** Milliseconds after which interpreters stop gracefully (before the page's hard timeout). */
    softTimeoutMs?: number;
    /** Indentation used when formatting JSON. */
    indent?: number;
};
export type WorkerStatusCode =
    | "loading_python" | "loading_sqlite" | "loading_lua" | "loading_prolog"
    | "loading_clojure" | "loading_sass" | "loading_jq" | "loading_wat" | "loading_coffeescript" | "loading_less";
export type WorkerNoticeCode = "output_truncated";
type Outgoing =
    | { id: number; type: "stdout" | "stderr"; text: string }
    | { id: number; type: "status"; code: WorkerStatusCode; text: string }
    | { id: number; type: "notice"; code: WorkerNoticeCode }
    | { id: number; type: "done"; exitCode: number; version: string };

// A minimal view of the worker global; the project compiles with DOM typings.
type WorkerScope = { postMessage: (message: Outgoing) => void; onmessage: ((event: MessageEvent<RunRequest>) => void) | null };
const scope = self as unknown as WorkerScope;
const MAX_OUTPUT = 64_000;

/**
 * Same-origin URLs of the runtime files, injected by scripts/copy-runtimes.mjs.
 * Binaries carry a content hash (?v=…) and Pyodide a versioned folder, so a
 * browser cache that keeps /runtimes/* for a week never pairs a new worker
 * with an old binary.
 */
declare const __HANOGT_RUNTIME_ASSETS__: {
    pyodide: string;
    sqlWasm: string;
    luaWasm: string;
    jqWasm: string;
    scittle: string;
    scittleVersion: string;
};
const ASSETS = __HANOGT_RUNTIME_ASSETS__;

let outputBudget = MAX_OUTPUT;
let truncated = false;
let locale: Locale = "en";

/** Picks the Turkish or English text of a worker message (program output, not UI). */
const say = (text: { tr: string; en: string }) => text[locale];

class OutputLimitReached extends Error {}

function emit(id: number, type: "stdout" | "stderr", text: string) {
    if (!text) return;
    if (outputBudget <= 0) {
        if (!truncated) {
            truncated = true;
            scope.postMessage({ id, type: "notice", code: "output_truncated" } satisfies Outgoing);
        }
        return;
    }
    const chunk = text.length > outputBudget ? text.slice(0, outputBudget) : text;
    outputBudget -= chunk.length;
    scope.postMessage({ id, type, text: chunk } satisfies Outgoing);
    if (outputBudget <= 0 && !truncated) {
        truncated = true;
        scope.postMessage({ id, type: "notice", code: "output_truncated" } satisfies Outgoing);
    }
}
function status(id: number, code: WorkerStatusCode, text: string) {
    scope.postMessage({ id, type: "status", code, text } satisfies Outgoing);
}

/** Line-based stdin shared by every language: input(), readline(), io.read(). */
function stdinReader(stdin: string) {
    const lines = stdin.length ? stdin.replace(/\r\n/g, "\n").split("\n") : [];
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return () => (lines.length ? lines.shift()! : null);
}

/** A file name safe to print in error locations. */
function displayName(fileName: string | undefined, fallback: string) {
    const name = (fileName ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
    return name || fallback;
}

// --------------------------------------------------------------------- JS / TS
function inspect(value: unknown, depth = 0, seen = new WeakSet<object>()): string {
    if (typeof value === "string") return depth ? JSON.stringify(value) : value;
    if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return String(value);
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "symbol") return value.toString();
    if (typeof value === "function") return `[Function ${value.name || "(anonymous)"}]`;
    if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
    if (typeof value !== "object") return String(value);
    if (seen.has(value)) return "[Circular]";
    if (depth > 4) return Array.isArray(value) ? "[Array]" : "[Object]";
    seen.add(value);
    if (Array.isArray(value)) return `[ ${value.map((item) => inspect(item, depth + 1, seen)).join(", ")} ]`;
    if (value instanceof Map) return `Map(${value.size}) { ${[...value].map(([k, v]) => `${inspect(k, depth + 1, seen)} => ${inspect(v, depth + 1, seen)}`).join(", ")} }`;
    if (value instanceof Set) return `Set(${value.size}) { ${[...value].map((item) => inspect(item, depth + 1, seen)).join(", ")} }`;
    if (value instanceof Date) return value.toISOString();
    const entries = Object.entries(value as Record<string, unknown>);
    const name = (value as object).constructor && (value as object).constructor !== Object ? `${(value as object).constructor.name} ` : "";
    return `${name}{ ${entries.map(([k, v]) => `${k}: ${inspect(v, depth + 1, seen)}`).join(", ")} }`;
}

// new Function adds two header lines and our async wrapper adds one more.
const JS_LINE_OFFSET = 3;

type SourceLocation = (line: number, column: number) => { line: number; column: number } | null;

/**
 * "Error: x\n    at f (main.js:2:9)" instead of frames pointing into worker.js.
 * `mapLocation` turns positions in compiled code (CoffeeScript) into source positions.
 */
function describeJavaScriptError(error: unknown, source: string, fileName: string, mapLocation?: SourceLocation) {
    if (!(error instanceof Error)) return String(error);
    const header = `${error.name}: ${error.message}`;
    if (error instanceof SyntaxError && mapLocation) return header;
    if (error instanceof SyntaxError) {
        // V8 reports no position for code compiled by new Function; ask the parser.
        try {
            transform(source, { transforms: fileName.endsWith(".ts") || fileName.endsWith(".tsx") ? ["typescript"] : [] });
        } catch (parseError) {
            const location = (parseError as { loc?: { line: number; column: number } }).loc;
            if (location) return `${header}\n    at ${fileName}:${location.line}:${location.column + 1}`;
        }
        return header;
    }
    const lineCount = source.split("\n").length;
    const frames = (error.stack || "").split("\n").flatMap((line) => {
        const match = /^\s*at (?:(\S+) \()?.*<anonymous>:(\d+):(\d+)\)?$/.exec(line);
        if (!match) return [];
        const lineNumber = Number(match[2]) - JS_LINE_OFFSET;
        if (lineNumber < 1 || lineNumber > lineCount) return [];
        const position = mapLocation ? mapLocation(lineNumber, Number(match[3])) : { line: lineNumber, column: Number(match[3]) };
        if (!position) return [];
        const name = match[1] && match[1] !== "eval" ? `${match[1]} ` : "";
        return [name ? `    at ${name}(${fileName}:${position.line}:${position.column})` : `    at ${fileName}:${position.line}:${position.column}`];
    });
    return [header, ...frames.slice(0, 10)].join("\n");
}

async function runJavaScript(id: number, source: string, stdin: string) {
    // Once the output limit is reached, logging stops the program instead of spinning until the timeout.
    const guard = () => {
        if (outputBudget <= 0) throw new OutputLimitReached("Output limit reached");
    };
    const out = (...args: unknown[]) => {
        guard();
        emit(id, "stdout", `${args.map((arg) => inspect(arg)).join(" ")}\n`);
    };
    const err = (...args: unknown[]) => {
        guard();
        emit(id, "stderr", `${args.map((arg) => inspect(arg)).join(" ")}\n`);
    };
    const fakeConsole = {
        log: out, info: out, debug: out, trace: out,
        warn: err, error: err,
        table: (data: unknown) => out(data),
        dir: (data: unknown) => out(data),
        clear: () => undefined,
        assert: (condition: unknown, ...args: unknown[]) => { if (!condition) err("Assertion failed:", ...args); },
    };
    const read = stdinReader(stdin);
    const prompt = (message?: string) => {
        if (message) out(message);
        return read();
    };
    // An async wrapper allows top-level await; sloppy mode keeps beginner code
    // (implicit globals) working like a normal <script>.
    const runner = new Function("console", "prompt", "input", "readline", `return (async () => {\n${source}\n})();`);
    await runner(fakeConsole, prompt, prompt, read);
}

function toRunnableTypeScript(source: string) {
    // Module syntax has no meaning in a single-file run; keep the declarations.
    const withoutExports = source
        .replace(/^\s*export\s+default\s+/gm, "")
        .replace(/^\s*export\s+(?=(?:async\s+)?(?:const|let|var|function|class|interface|type|enum|abstract|declare)\b)/gm, "")
        .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, "");
    return transform(withoutExports, { transforms: ["typescript"], disableESTransforms: true }).code;
}

// ---------------------------------------------------------------------- Python
type Pyodide = {
    runPythonAsync: (code: string, options?: { globals?: unknown }) => Promise<unknown>;
    setStdout: (options: { batched: (text: string) => void }) => void;
    setStderr: (options: { batched: (text: string) => void }) => void;
    setStdin: (options: { stdin: () => string | null }) => void;
    globals: { get: (name: string) => (...args: unknown[]) => { set: (key: string, value: unknown) => void; destroy?: () => void } };
    version: string;
};
let pyodidePromise: Promise<Pyodide> | null = null;

async function loadPython(id: number) {
    if (!pyodidePromise) {
        status(id, "loading_python", "Loading the Python runtime (about 12 MB on the first run)…");
        const moduleUrl = `${ASSETS.pyodide}pyodide.mjs`;
        pyodidePromise = import(/* webpackIgnore: true */ moduleUrl).then((module: { loadPyodide: (options: { indexURL: string }) => Promise<Pyodide> }) =>
            module.loadPyodide({ indexURL: ASSETS.pyodide }));
        pyodidePromise.catch(() => { pyodidePromise = null; });
    }
    return pyodidePromise;
}

/** Drops Pyodide's internal frames and names the user's file. */
function describePythonError(message: string, source: string, fileName: string) {
    const sourceLines = source.split("\n");
    const output: string[] = [];
    let skipping = false;
    for (const line of message.replace(/\n+$/, "").split("\n")) {
        const frame = /^ {2}File "([^"]+)", line (\d+)(.*)$/.exec(line);
        if (frame) {
            skipping = frame[1] !== "<exec>";
            if (skipping) continue;
            output.push(`  File "${fileName}", line ${frame[2]}${frame[3]}`);
            // Python cannot print the line itself because <exec> is not a real file.
            const text = frame[3].startsWith(", in ") ? sourceLines[Number(frame[2]) - 1]?.trim() : "";
            if (text) output.push(`    ${text}`);
            continue;
        }
        if (skipping && /^\s{4}/.test(line)) continue;
        skipping = false;
        output.push(line);
    }
    // Like CPython, a syntax error in the script itself has no traceback header.
    if (!output.some((line) => line.startsWith(`  File "${fileName}"`) && line.includes(", in "))) {
        return output.filter((line) => line !== "Traceback (most recent call last):").join("\n");
    }
    return output.join("\n");
}

let pythonVersion = "";

async function runPython(id: number, source: string, stdin: string, fileName: string) {
    const pyodide = await loadPython(id);
    if (!pythonVersion) pythonVersion = String(await pyodide.runPythonAsync("import sys\nsys.version.split()[0]"));
    pyodide.setStdout({ batched: (text) => emit(id, "stdout", `${text}\n`) });
    pyodide.setStderr({ batched: (text) => emit(id, "stderr", `${text}\n`) });
    pyodide.setStdin({ stdin: stdinReader(stdin) });
    // A fresh namespace per run so variables do not leak between runs.
    const namespace = pyodide.globals.get("dict")();
    // Scripts guard their entry point with `if __name__ == "__main__":`.
    namespace.set("__name__", "__main__");
    try {
        await pyodide.runPythonAsync(source, { globals: namespace });
    } catch (error) {
        throw new Error(describePythonError(error instanceof Error ? error.message : String(error), source, fileName));
    } finally {
        namespace.destroy?.();
    }
    return `Python ${pythonVersion} (Pyodide ${pyodide.version})`;
}

// ------------------------------------------------------------------------- SQL
type SqlResult = { columns: string[]; values: unknown[][] };
function formatTable(result: SqlResult) {
    const rows = result.values.map((row) => row.map((cell) => (cell === null ? "NULL" : cell instanceof Uint8Array ? `<blob ${cell.length} B>` : String(cell))));
    const widths = result.columns.map((column, index) => Math.min(40, Math.max(column.length, ...rows.map((row) => row[index].length))));
    const clip = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width));
    const line = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
    return [
        line,
        `| ${result.columns.map((column, index) => clip(column, widths[index])).join(" | ")} |`,
        line,
        ...rows.map((row) => `| ${row.map((cell, index) => clip(cell, widths[index])).join(" | ")} |`),
        line,
        say({ tr: `(${rows.length} satır)`, en: `(${rows.length} ${rows.length === 1 ? "row" : "rows"})` }),
    ].join("\n");
}

async function runSql(id: number, source: string) {
    const SQL = await initSqlJs({ locateFile: () => ASSETS.sqlWasm });
    const db = new SQL.Database();
    try {
        const results = db.exec(source) as SqlResult[];
        if (!results.length) {
            const changed = db.getRowsModified();
            emit(id, "stdout", `${say({ tr: `Sorgular çalıştırıldı (${changed} satır etkilendi).`, en: `Statements executed (${changed} ${changed === 1 ? "row" : "rows"} affected).` })}\n`);
        }
        for (const result of results) emit(id, "stdout", `${formatTable(result)}\n\n`);
    } finally {
        db.close();
    }
    return "SQLite 3 (sql.js)";
}

// ------------------------------------------------------------------------- Lua
async function runLua(id: number, source: string, stdin: string, fileName: string) {
    const factory = new LuaFactory(ASSETS.luaWasm);
    const lua = await factory.createEngine();
    const read = stdinReader(stdin);
    try {
        lua.global.set("__hanogt_out", (text: string) => emit(id, "stdout", text));
        lua.global.set("__hanogt_read", () => read());
        await lua.doString(`
            print = function(...)
                local parts = {}
                for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
                __hanogt_out(table.concat(parts, "\\t") .. "\\n")
            end
            io.write = function(...)
                for i = 1, select("#", ...) do __hanogt_out(tostring((select(i, ...)))) end
            end
            io.read = function() return __hanogt_read() end
        `);
        const mounted = fileName.endsWith(".lua") ? fileName.replace(/[^\w.-]/g, "_") : "main.lua";
        await factory.mountFile(mounted, source);
        await lua.doFile(mounted);
    } finally {
        lua.global.close();
    }
    return "Lua 5.4 (wasmoon)";
}

// ------------------------------------------------------------------ Brainfuck
function runBrainfuckProgram(id: number, source: string, stdin: string, fileName: string, deadline: number) {
    let result: ReturnType<typeof runBrainfuck>;
    try {
        result = runBrainfuck(source, {
            stdin,
            maxCells: 1_000_000,
            onOutput: (text) => {
                if (outputBudget <= 0) throw new OutputLimitReached("Output limit reached");
                emit(id, "stdout", text);
            },
            shouldStop: () => Date.now() > deadline,
        });
    } catch (error) {
        if (error instanceof OutputLimitReached) return "Brainfuck (Hanogt, 8-bit cells)";
        throw error;
    }
    if (result.error) {
        const where = result.error.line ? `\n    at ${fileName}:${result.error.line}:${result.error.column ?? 1}` : "";
        throw new Error(`${result.error.message}${where}`);
    }
    return "Brainfuck (Hanogt, 8-bit cells)";
}

// --------------------------------------------------------------------- Scheme
function runSchemeProgram(id: number, source: string, stdin: string, fileName: string, deadline: number) {
    const result = runScheme(source, {
        stdin,
        fileName,
        maxOutput: MAX_OUTPUT,
        onOutput: (text) => emit(id, "stdout", text),
        onError: (text) => emit(id, "stderr", text),
        shouldStop: () => Date.now() > deadline,
    });
    if (result.error) {
        const message = result.error.line
            ? result.error.message.replace(/\n {4}at line (\d+), column (\d+)$/, `\n    at ${fileName}:$1:$2`).replace(/ \(line (\d+), column (\d+)\)$/, `\n    at ${fileName}:$1:$2`)
            : result.error.message;
        throw new SchemeExit(message, result.exitCode || 1);
    }
    if (result.exitCode) throw new SchemeExit("", result.exitCode);
    return "Scheme (Hanogt R7RS subset)";
}

class SchemeExit extends Error {
    readonly code: number;
    constructor(message: string, code: number) {
        super(message);
        this.code = code;
    }
}

// ----------------------------------------------------------------------- JSON
function validateJson(id: number, source: string, fileName: string, indent: number) {
    const result = analyzeJson(source, { indent, locale });
    for (const warning of result.warnings) {
        emit(id, "stderr", `${say({ tr: "Uyarı", en: "Warning" })}: ${warning.message}\n    at ${fileName}:${warning.line}:${warning.column}\n`);
    }
    if (!result.ok || !result.stats || result.formatted === undefined) {
        const issue = result.error ?? { message: say({ tr: "Geçersiz JSON.", en: "Invalid JSON." }), line: 1, column: 1, offset: 0 };
        throw new Error(`SyntaxError: ${issue.message}\n    at ${fileName}:${issue.line}:${issue.column}\n\n${codeFrame(source, issue.line, issue.column)}`);
    }
    const stats = result.stats;
    const kinds: Record<string, { tr: string; en: string }> = {
        object: { tr: "nesne", en: "object" },
        array: { tr: "dizi", en: "array" },
        string: { tr: "metin", en: "string" },
        number: { tr: "sayı", en: "number" },
        boolean: { tr: "mantıksal değer", en: "boolean" },
        null: { tr: "null", en: "null" },
    };
    const summary = say({
        tr: `✓ Geçerli JSON · kök: ${kinds[stats.topLevel].tr} · ${stats.keys} anahtar · ${stats.arrays} dizi · derinlik ${stats.maxDepth} · ${stats.bytes} bayt`,
        en: `✓ Valid JSON · root: ${kinds[stats.topLevel].en} · ${stats.keys} ${stats.keys === 1 ? "key" : "keys"} · ${stats.arrays} ${stats.arrays === 1 ? "array" : "arrays"} · depth ${stats.maxDepth} · ${stats.bytes} bytes`,
    });
    emit(id, "stdout", `${summary}\n\n${result.formatted}\n`);
    return say({ tr: "JSON doğrulayıcı", en: "JSON validator" });
}

// ------------------------------------------------- Hanogt interpreters (lazy chunks)
/** Thrown by output callbacks once the output budget is spent, to stop an interpreter early. */
function guardedOutput(id: number) {
    return (text: string) => {
        if (outputBudget <= 0) throw new OutputLimitReached("Output limit reached");
        emit(id, "stdout", text);
    };
}

function located(message: string, fileName: string, line?: number, column?: number) {
    return line ? `${message}\n    at ${fileName}:${line}:${column ?? 1}` : message;
}

/** Runs a synchronous interpreter; reaching the output limit ends the run quietly. */
function runInterpreter<T extends { error?: { message: string; line?: number; column?: number }; exitCode: number }>(run: () => T, fileName: string): T | null {
    let result: T;
    try {
        result = run();
    } catch (error) {
        if (error instanceof OutputLimitReached) return null;
        throw error;
    }
    if (result.error) throw new InterpreterExit(located(result.error.message, fileName, result.error.line, result.error.column), result.exitCode || 1);
    if (result.exitCode) throw new InterpreterExit("", result.exitCode);
    return result;
}

class InterpreterExit extends Error {
    readonly code: number;
    constructor(message: string, code: number) {
        super(message);
        this.code = code;
    }
}

const VERSIONS = {
    forth: "Forth (Hanogt)",
    basic: "BASIC (Hanogt, QBasic dialect)",
    befunge: "Befunge-93 (Hanogt)",
    whitespace: "Whitespace (Hanogt)",
    mips: "MIPS32 (Hanogt, MARS syscalls)",
    prolog: "Prolog (Tau Prolog 0.3)",
} as const;

async function runForthProgram(id: number, source: string, stdin: string, fileName: string, deadline: number) {
    const { runForth } = await import("./forth");
    const result = runInterpreter(() => runForth(source, { stdin, locale, onOutput: guardedOutput(id), shouldStop: () => Date.now() > deadline }), fileName);
    if (result && result.stack.length) {
        const ending = result.output && !result.output.endsWith("\n") ? "\n" : "";
        emit(id, "stdout", `${ending}${say({ tr: "Yığında kalanlar", en: "Left on the stack" })}: <${result.stack.length}> ${result.stack.slice(-20).join(" ")}\n`);
    }
    return VERSIONS.forth;
}

async function runBasicProgram(id: number, source: string, stdin: string, fileName: string, deadline: number) {
    const { runBasic } = await import("./basic");
    runInterpreter(() => runBasic(source, { stdin, locale, onOutput: guardedOutput(id), shouldStop: () => Date.now() > deadline, seed: Date.now() }), fileName);
    return VERSIONS.basic;
}

async function runBefungeProgram(id: number, source: string, stdin: string, fileName: string, deadline: number) {
    const { runBefunge } = await import("./befunge");
    runInterpreter(() => runBefunge(source, { stdin, locale, onOutput: guardedOutput(id), shouldStop: () => Date.now() > deadline }), fileName);
    return VERSIONS.befunge;
}

async function runWhitespaceProgram(id: number, source: string, stdin: string, fileName: string, deadline: number) {
    const { runWhitespace } = await import("./whitespace");
    runInterpreter(() => runWhitespace(source, { stdin, locale, onOutput: guardedOutput(id), shouldStop: () => Date.now() > deadline }), fileName);
    return VERSIONS.whitespace;
}

async function runMipsProgram(id: number, source: string, stdin: string, fileName: string, deadline: number) {
    const { runMips } = await import("./mips");
    runInterpreter(() => runMips(source, { stdin, locale, onOutput: guardedOutput(id), shouldStop: () => Date.now() > deadline, seed: Date.now() }), fileName);
    return VERSIONS.mips;
}

let prologLoaded = false;

async function runPrologProgram(id: number, source: string, stdin: string, fileName: string, deadline: number) {
    if (!prologLoaded) status(id, "loading_prolog", "Loading the Prolog runtime…");
    const { runProlog } = await import("./prolog");
    prologLoaded = true;
    // Output beyond the budget is dropped by emit(); stopping at the next inference slice ends the run.
    const result = await runProlog(source, {
        stdin,
        fileName,
        locale,
        onOutput: (text) => emit(id, "stdout", text),
        onError: (text) => emit(id, "stderr", text),
        shouldStop: () => outputBudget <= 0 || Date.now() > deadline,
    });
    if (result.exitCode) throw new InterpreterExit("", result.timedOut ? 124 : result.exitCode);
    return VERSIONS.prolog;
}

// ------------------------------------------- jq, Less, SCSS, WAT, Clojure, CoffeeScript (lazy chunks)
/** Runtimes that have been downloaded once in this worker (their first run announces the download). */
const loaded = new Set<string>();
/** Version labels learnt from the runtimes themselves (used when a run fails before it reports one). */
const learnedVersions: Record<string, string> = {};

function announce(id: number, language: string, code: WorkerStatusCode, text: string) {
    if (!loaded.has(language)) status(id, code, text);
}

/** "message\n    at file:line:column" followed by the code frame of that line. */
function locatedWithFrame(message: string, source: string, fileName: string, line?: number, column?: number) {
    return line ? `${located(message, fileName, line, column)}\n\n${codeFrame(source, line, column ?? 1)}` : message;
}

const emptyCss = () => say({ tr: "(Derlenen CSS boş: bu dosya yalnızca değişken, mixin ya da yorum içeriyor.)", en: "(The compiled CSS is empty: this file only holds variables, mixins or comments.)" });

async function runJqProgram(id: number, source: string, stdin: string, fileName: string) {
    announce(id, "jq", "loading_jq", "Loading the jq runtime…");
    const { runJq } = await import("./jq");
    const result = await runJq(source, { stdin, wasmUrl: ASSETS.jqWasm, fileName, locale });
    loaded.add("jq");
    learnedVersions.jq = result.version;
    emit(id, "stdout", result.stdout);
    emit(id, "stderr", result.stderr);
    if (result.exitCode) throw new InterpreterExit("", result.exitCode);
    return result.version;
}

async function runLessProgram(id: number, source: string, fileName: string) {
    announce(id, "less", "loading_less", "Loading the Less compiler…");
    const { compileLess } = await import("./less");
    loaded.add("less");
    const result = await compileLess(source, { fileName });
    learnedVersions.less = result.version;
    if (result.error) throw new InterpreterExit(locatedWithFrame(result.error.message, source, fileName, result.error.line, result.error.column), 1);
    emit(id, "stdout", result.css || `${emptyCss()}\n`);
    return result.version;
}

async function runScssProgram(id: number, source: string, fileName: string) {
    announce(id, "scss", "loading_sass", "Loading the Sass compiler (about 1 MB on the first run)…");
    const { compileScss } = await import("./scss");
    loaded.add("scss");
    const result = compileScss(source);
    learnedVersions.scss = result.version;
    for (const notice of result.notices) {
        const label = notice.kind === "debug" ? "Debug" : notice.kind === "deprecation" ? say({ tr: "Kullanımdan kalkma uyarısı", en: "Deprecation warning" }) : say({ tr: "Uyarı", en: "Warning" });
        emit(id, "stderr", `${located(`${label}: ${notice.message}`, fileName, notice.line, notice.column)}\n`);
    }
    if (result.error) {
        const frame = result.error.frame ? `\n\n${result.error.frame}` : "";
        throw new InterpreterExit(`${located(result.error.message, fileName, result.error.line, result.error.column)}${frame}`, 1);
    }
    emit(id, "stdout", result.css || `${emptyCss()}\n`);
    return result.version;
}

async function runWatProgram(id: number, source: string, stdin: string, fileName: string) {
    announce(id, "wat", "loading_wat", "Loading the WebAssembly text compiler…");
    const { runWat, WAT_VERSION } = await import("./wat");
    loaded.add("wat");
    learnedVersions.wat = WAT_VERSION;
    let result: Awaited<ReturnType<typeof runWat>>;
    try {
        result = await runWat(source, { stdin, fileName, locale, onOutput: guardedOutput(id) });
    } catch (error) {
        if (error instanceof OutputLimitReached) return WAT_VERSION;
        throw error;
    }
    if (result.error || result.exitCode) throw new InterpreterExit(result.error ?? "", result.exitCode || 1);
    return WAT_VERSION;
}

let scittleSource: Promise<string> | null = null;

async function runClojureProgram(id: number, source: string, stdin: string, fileName: string) {
    const version = `Clojure (Scittle ${ASSETS.scittleVersion})`;
    if (!scittleSource) {
        status(id, "loading_clojure", "Loading the Clojure interpreter…");
        const request = fetch(ASSETS.scittle, { credentials: "same-origin" }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status} (${ASSETS.scittle})`);
            return response.text();
        });
        scittleSource = request;
        request.catch(() => {
            if (scittleSource === request) scittleSource = null;
        });
    }
    const [runtime, { runClojure }] = await Promise.all([scittleSource, import("./clojure")]);
    loaded.add("clojure");
    const result = runClojure(source, {
        runtime,
        stdin,
        onOutput: guardedOutput(id),
        onError: (text) => emit(id, "stderr", text),
    });
    // Reaching the output limit stops the program from inside its print function; that is not its error.
    if (result.error && outputBudget > 0) throw new InterpreterExit(located(result.error.message, fileName, result.error.line, result.error.column), result.exitCode || 1);
    return version;
}

async function runCoffeeScriptProgram(id: number, source: string, stdin: string, fileName: string) {
    announce(id, "coffeescript", "loading_coffeescript", "Loading the CoffeeScript compiler…");
    const { compileCoffeeScript } = await import("./coffeescript");
    loaded.add("coffeescript");
    const compiled = compileCoffeeScript(source);
    learnedVersions.coffeescript = compiled.version;
    if (compiled.error) throw new Error(locatedWithFrame(`SyntaxError: ${compiled.error.message}`, source, fileName, compiled.error.line, compiled.error.column));
    await runJavaScript(id, compiled.js, stdin).catch((error) => {
        if (error instanceof OutputLimitReached) return;
        throw new Error(describeJavaScriptError(error, compiled.js, fileName, compiled.sourceLocation));
    });
    return compiled.version;
}

// ------------------------------------------------------------------ validators
type ValidatorId = "yaml" | "toml" | "xml" | "ini" | "dotenv" | "properties" | "csv";

const VALIDATOR_LABELS: Record<ValidatorId, { tr: string; en: string }> = {
    yaml: { tr: "YAML doğrulayıcı (js-yaml)", en: "YAML validator (js-yaml)" },
    toml: { tr: "TOML doğrulayıcı (smol-toml)", en: "TOML validator (smol-toml)" },
    xml: { tr: "XML doğrulayıcı", en: "XML validator" },
    ini: { tr: "INI doğrulayıcı", en: "INI validator" },
    dotenv: { tr: ".env doğrulayıcı", en: ".env validator" },
    properties: { tr: ".properties doğrulayıcı", en: ".properties validator" },
    csv: { tr: "CSV doğrulayıcı", en: "CSV validator" },
};

async function analyze(language: ValidatorId, source: string, fileName: string, indent: number): Promise<ValidationResult> {
    const options = { locale, indent };
    switch (language) {
        case "yaml": return (await import("./yaml-tools")).analyzeYaml(source, options);
        case "toml": return (await import("./toml-tools")).analyzeToml(source, options);
        case "xml": return (await import("./xml-tools")).analyzeXml(source, options);
        case "ini": return (await import("./config-tools")).analyzeIni(source, options);
        case "dotenv": return (await import("./config-tools")).analyzeDotenv(source, options);
        case "properties": return (await import("./config-tools")).analyzeProperties(source, options);
        case "csv": return (await import("./config-tools")).analyzeCsv(source, { ...options, fileName });
    }
}

/** Prints warnings, then the summary and formatted document, or throws the error with a code frame. */
async function validate(id: number, language: ValidatorId, source: string, fileName: string, indent: number) {
    const result = await analyze(language, source, fileName, indent);
    for (const warning of result.warnings) {
        emit(id, "stderr", `${say({ tr: "Uyarı", en: "Warning" })}: ${warning.message}\n    at ${fileName}:${warning.line}:${warning.column}\n`);
    }
    if (!result.ok) {
        const issue = result.error ?? { message: say({ tr: "Geçersiz belge.", en: "Invalid document." }), line: 1, column: 1 };
        throw new Error(`SyntaxError: ${issue.message}\n    at ${fileName}:${issue.line}:${issue.column}\n\n${codeFrame(source, issue.line, issue.column)}`);
    }
    const formatted = result.formatted ? `\n\n${result.formatted}` : "";
    const notes = result.notes?.length ? `\n\n${result.notes.join("\n")}` : "";
    emit(id, "stdout", `${result.summary ?? ""}${formatted}${notes}\n`);
    return say(VALIDATOR_LABELS[language]);
}

// ------------------------------------------------------------------ dispatcher
const DEFAULT_FILE_NAMES: Record<string, string> = {
    javascript: "main.js", typescript: "main.ts", python: "main.py", sql: "query.sql", lua: "main.lua",
    brainfuck: "main.bf", scheme: "main.scm", json: "data.json", prolog: "main.pro", forth: "main.fth", basic: "main.bas",
    befunge: "main.b93", whitespace: "main.ws", mips: "main.asm", yaml: "config.yaml", toml: "config.toml", xml: "data.xml",
    ini: "settings.ini", dotenv: ".env", properties: "app.properties", csv: "data.csv",
    jq: "filter.jq", less: "style.less", scss: "style.scss", wat: "main.wat", clojure: "main.clj", coffeescript: "main.coffee",
};

const VERSIONS_AS_FALLBACKS: Record<string, () => string> = Object.fromEntries(Object.entries(VERSIONS).map(([language, version]) => [language, () => version]));

/** Version labels for runs that failed before their runner returned one. */
const FALLBACK_VERSIONS: Record<string, () => string> = {
    python: () => (pythonVersion ? `Python ${pythonVersion} (Pyodide)` : "Python (Pyodide)"),
    sql: () => "SQLite 3 (sql.js)",
    lua: () => "Lua 5.4 (wasmoon)",
    brainfuck: () => "Brainfuck (Hanogt, 8-bit cells)",
    scheme: () => "Scheme (Hanogt R7RS subset)",
    json: () => say({ tr: "JSON doğrulayıcı", en: "JSON validator" }),
    jq: () => learnedVersions.jq ?? "jq (WebAssembly)",
    less: () => learnedVersions.less ?? "Less",
    scss: () => learnedVersions.scss ?? "Dart Sass",
    wat: () => learnedVersions.wat ?? "WebAssembly (wabt)",
    clojure: () => `Clojure (Scittle ${ASSETS.scittleVersion})`,
    coffeescript: () => learnedVersions.coffeescript ?? "CoffeeScript",
    ...VERSIONS_AS_FALLBACKS,
    ...Object.fromEntries(Object.entries(VALIDATOR_LABELS).map(([language, label]) => [language, () => say(label)])),
};

scope.onmessage = async (event: MessageEvent<RunRequest>) => {
    const { id, language, code } = event.data;
    const stdin = event.data.stdin ?? "";
    locale = event.data.locale === "tr" ? "tr" : "en";
    const fileName = displayName(event.data.fileName, DEFAULT_FILE_NAMES[language] ?? "main");
    const deadline = Date.now() + Math.max(1_000, Math.min(event.data.softTimeoutMs ?? 12_000, 120_000));
    outputBudget = MAX_OUTPUT;
    truncated = false;
    let version = "";
    let exitCode = 0;
    try {
        switch (language) {
            case "javascript":
                version = "JavaScript (browser)";
                await runJavaScript(id, code, stdin).catch((error) => {
                    if (error instanceof OutputLimitReached) return;
                    throw new Error(describeJavaScriptError(error, code, fileName));
                });
                break;
            case "typescript": {
                version = "TypeScript (sucrase)";
                let runnable: string;
                try {
                    runnable = toRunnableTypeScript(code);
                } catch (error) {
                    const location = (error as { loc?: { line: number; column: number } }).loc;
                    throw new Error(`SyntaxError: ${error instanceof Error ? error.message.replace(/\s*\(\d+:\d+\)$/, "") : String(error)}${location ? `\n    at ${fileName}:${location.line}:${location.column + 1}` : ""}`);
                }
                await runJavaScript(id, runnable, stdin).catch((error) => {
                    if (error instanceof OutputLimitReached) return;
                    throw new Error(describeJavaScriptError(error, runnable, fileName));
                });
                break;
            }
            case "python":
                version = await runPython(id, code, stdin, fileName);
                break;
            case "sql":
                version = await runSql(id, code);
                break;
            case "lua":
                version = await runLua(id, code, stdin, fileName);
                break;
            case "brainfuck":
                version = runBrainfuckProgram(id, code, stdin, fileName, deadline);
                break;
            case "scheme":
                version = runSchemeProgram(id, code, stdin, fileName, deadline);
                break;
            case "json":
                version = validateJson(id, code, fileName, Math.max(1, Math.min(8, event.data.indent ?? 2)));
                break;
            case "prolog":
                version = await runPrologProgram(id, code, stdin, fileName, deadline);
                break;
            case "forth":
                version = await runForthProgram(id, code, stdin, fileName, deadline);
                break;
            case "basic":
                version = await runBasicProgram(id, code, stdin, fileName, deadline);
                break;
            case "befunge":
                version = await runBefungeProgram(id, code, stdin, fileName, deadline);
                break;
            case "whitespace":
                version = await runWhitespaceProgram(id, code, stdin, fileName, deadline);
                break;
            case "mips":
                version = await runMipsProgram(id, code, stdin, fileName, deadline);
                break;
            case "jq":
                version = await runJqProgram(id, code, stdin, fileName);
                break;
            case "less":
                version = await runLessProgram(id, code, fileName);
                break;
            case "scss":
                version = await runScssProgram(id, code, fileName);
                break;
            case "wat":
                version = await runWatProgram(id, code, stdin, fileName);
                break;
            case "clojure":
                version = await runClojureProgram(id, code, stdin, fileName);
                break;
            case "coffeescript":
                version = await runCoffeeScriptProgram(id, code, stdin, fileName);
                break;
            case "yaml":
            case "toml":
            case "xml":
            case "ini":
            case "dotenv":
            case "properties":
            case "csv":
                version = await validate(id, language, code, fileName, Math.max(1, Math.min(8, event.data.indent ?? 2)));
                break;
            default:
                throw new Error(say({ tr: `${language} tarayıcıda çalıştırılamıyor.`, en: `${language} can't run in the browser.` }));
        }
    } catch (error) {
        exitCode = error instanceof SchemeExit || error instanceof InterpreterExit ? error.code : 1;
        version ||= FALLBACK_VERSIONS[language]?.() ?? language;
        const message = error instanceof Error ? error.message : String(error);
        if (message) emit(id, "stderr", `${message}\n`);
    }
    scope.postMessage({ id, type: "done", exitCode, version } satisfies Outgoing);
};
