/**
 * In-browser code runner (bundled to /runtimes/worker.js by scripts/copy-runtimes.mjs).
 *
 * Runs JavaScript, TypeScript, Python (Pyodide), SQL (sql.js) and Lua (wasmoon)
 * inside a dedicated module worker, so learners can execute code without any
 * server-side runner. The worker has no DOM access; the page terminates it when
 * a run exceeds its time limit.
 */
import { transform } from "sucrase";
import initSqlJs from "sql.js/dist/sql-wasm-browser.js";
import { LuaFactory } from "wasmoon";

type RunRequest = { id: number; type: "run"; language: string; code: string; stdin?: string };
type Outgoing =
    | { id: number; type: "stdout" | "stderr"; text: string }
    | { id: number; type: "status"; text: string }
    | { id: number; type: "done"; exitCode: number; version: string };

// A minimal view of the worker global; the project compiles with DOM typings.
type WorkerScope = { postMessage: (message: Outgoing) => void; onmessage: ((event: MessageEvent<RunRequest>) => void) | null };
const scope = self as unknown as WorkerScope;
const BASE = "/runtimes";
const MAX_OUTPUT = 64_000;

let outputBudget = MAX_OUTPUT;
function emit(id: number, type: "stdout" | "stderr", text: string) {
    if (!text || outputBudget <= 0) return;
    const chunk = text.length > outputBudget ? `${text.slice(0, outputBudget)}\n… (çıktı kısaltıldı)\n` : text;
    outputBudget -= chunk.length;
    scope.postMessage({ id, type, text: chunk } satisfies Outgoing);
}
function status(id: number, text: string) {
    scope.postMessage({ id, type: "status", text } satisfies Outgoing);
}

/** Line-based stdin shared by every language: input(), readline(), io.read(). */
function stdinReader(stdin: string) {
    const lines = stdin.length ? stdin.replace(/\r\n/g, "\n").split("\n") : [];
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return () => (lines.length ? lines.shift()! : null);
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

/** "Error: x\n    at f (main.js:2:9)" instead of frames pointing into worker.js. */
function describeJavaScriptError(error: unknown, source: string, fileName: string) {
    if (!(error instanceof Error)) return String(error);
    const header = `${error.name}: ${error.message}`;
    if (error instanceof SyntaxError) {
        // V8 reports no position for code compiled by new Function; ask the parser.
        try {
            transform(source, { transforms: fileName.endsWith(".ts") ? ["typescript"] : [] });
        } catch (parseError) {
            const location = (parseError as { loc?: { line: number; column: number } }).loc;
            if (location) return `${header}\n    at ${fileName}:${location.line}:${location.column}`;
        }
        return header;
    }
    const lineCount = source.split("\n").length;
    const frames = (error.stack || "").split("\n").flatMap((line) => {
        const match = /^\s*at (?:(\S+) \()?.*<anonymous>:(\d+):(\d+)\)?$/.exec(line);
        if (!match) return [];
        const lineNumber = Number(match[2]) - JS_LINE_OFFSET;
        if (lineNumber < 1 || lineNumber > lineCount) return [];
        const name = match[1] && match[1] !== "eval" ? `${match[1]} ` : "";
        return [name ? `    at ${name}(${fileName}:${lineNumber}:${match[3]})` : `    at ${fileName}:${lineNumber}:${match[3]}`];
    });
    return [header, ...frames.slice(0, 10)].join("\n");
}

async function runJavaScript(id: number, source: string, stdin: string) {
    const out = (...args: unknown[]) => emit(id, "stdout", `${args.map((arg) => inspect(arg)).join(" ")}\n`);
    const err = (...args: unknown[]) => emit(id, "stderr", `${args.map((arg) => inspect(arg)).join(" ")}\n`);
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
        status(id, "Python çalışma zamanı yükleniyor (ilk çalıştırmada ~12 MB)…");
        const moduleUrl = `${BASE}/pyodide/pyodide.mjs`;
        pyodidePromise = import(/* webpackIgnore: true */ moduleUrl).then((module: { loadPyodide: (options: { indexURL: string }) => Promise<Pyodide> }) =>
            module.loadPyodide({ indexURL: `${BASE}/pyodide/` }));
        pyodidePromise.catch(() => { pyodidePromise = null; });
    }
    return pyodidePromise;
}

/** Drops Pyodide's internal frames and names the user's file main.py. */
function describePythonError(message: string, source: string) {
    const sourceLines = source.split("\n");
    const output: string[] = [];
    let skipping = false;
    for (const line of message.replace(/\n+$/, "").split("\n")) {
        const frame = /^ {2}File "([^"]+)", line (\d+)(.*)$/.exec(line);
        if (frame) {
            skipping = frame[1] !== "<exec>";
            if (skipping) continue;
            output.push(`  File "main.py", line ${frame[2]}${frame[3]}`);
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
    if (!output.some((line) => line.startsWith('  File "main.py"') && line.includes(", in "))) {
        return output.filter((line) => line !== "Traceback (most recent call last):").join("\n");
    }
    return output.join("\n");
}

let pythonVersion = "";

async function runPython(id: number, source: string, stdin: string) {
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
        throw new Error(describePythonError(error instanceof Error ? error.message : String(error), source));
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
        `(${rows.length} satır)`,
    ].join("\n");
}

async function runSql(id: number, source: string) {
    const SQL = await initSqlJs({ locateFile: () => `${BASE}/sql-wasm.wasm` });
    const db = new SQL.Database();
    try {
        const results = db.exec(source) as SqlResult[];
        if (!results.length) emit(id, "stdout", `Sorgular çalıştırıldı (${db.getRowsModified()} satır etkilendi).\n`);
        for (const result of results) emit(id, "stdout", `${formatTable(result)}\n\n`);
    } finally {
        db.close();
    }
    return "SQLite 3 (sql.js)";
}

// ------------------------------------------------------------------------- Lua
async function runLua(id: number, source: string, stdin: string) {
    const factory = new LuaFactory(`${BASE}/lua-glue.wasm`);
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
        await factory.mountFile("main.lua", source);
        await lua.doFile("main.lua");
    } finally {
        lua.global.close();
    }
    return "Lua 5.4 (wasmoon)";
}

// ------------------------------------------------------------------ dispatcher
/** Version labels for runs that failed before their runner returned one. */
const FALLBACK_VERSIONS: Record<string, () => string> = {
    python: () => (pythonVersion ? `Python ${pythonVersion} (Pyodide)` : "Python (Pyodide)"),
    sql: () => "SQLite 3 (sql.js)",
    lua: () => "Lua 5.4 (wasmoon)",
};

scope.onmessage = async (event: MessageEvent<RunRequest>) => {
    const { id, language, code } = event.data;
    const stdin = event.data.stdin ?? "";
    outputBudget = MAX_OUTPUT;
    let version = "";
    let exitCode = 0;
    try {
        switch (language) {
            case "javascript":
                version = "JavaScript (tarayıcı)";
                await runJavaScript(id, code, stdin).catch((error) => { throw new Error(describeJavaScriptError(error, code, "main.js")); });
                break;
            case "typescript": {
                version = "TypeScript (sucrase)";
                let runnable: string;
                try {
                    runnable = toRunnableTypeScript(code);
                } catch (error) {
                    const location = (error as { loc?: { line: number; column: number } }).loc;
                    throw new Error(`SyntaxError: ${error instanceof Error ? error.message.replace(/\s*\(\d+:\d+\)$/, "") : String(error)}${location ? `\n    at main.ts:${location.line}:${location.column}` : ""}`);
                }
                await runJavaScript(id, runnable, stdin).catch((error) => { throw new Error(describeJavaScriptError(error, runnable, "main.ts")); });
                break;
            }
            case "python":
                version = await runPython(id, code, stdin);
                break;
            case "sql":
                version = await runSql(id, code);
                break;
            case "lua":
                version = await runLua(id, code, stdin);
                break;
            default:
                throw new Error(`${language} tarayıcıda çalıştırılamıyor.`);
        }
    } catch (error) {
        exitCode = 1;
        version ||= FALLBACK_VERSIONS[language]?.() ?? language;
        emit(id, "stderr", `${error instanceof Error ? error.message : String(error)}\n`);
    }
    scope.postMessage({ id, type: "done", exitCode, version } satisfies Outgoing);
};
