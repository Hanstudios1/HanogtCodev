import "server-only";

import { RUNNABLE_LANGUAGES } from "@/lib/runtimes/languages";

/**
 * Server-side code execution backends.
 *
 * 1. CODE_RUNNER_URL: a Piston-compatible runner you host yourself (preferred).
 * 2. Wandbox (https://wandbox.org): a free public compiler service that needs
 *    no key. Code runs on Wandbox's isolated machines, never on ours.
 * 3. Kotlin: JetBrains' public Kotlin Playground compiler (api.kotlinlang.org),
 *    because Wandbox has no Kotlin compiler.
 *
 * JavaScript, TypeScript, Python, SQL and Lua normally run in the visitor's
 * browser (src/lib/runtimes) and only reach this module as a fallback.
 */

export type RunFile = { name: string; language: string; code: string };
export type RunJob = {
    name: string;
    language: string;
    version: string;
    run: { stdout: string; stderr: string; output: string; code: number };
};

export const MAX_OUTPUT_LENGTH = 64_000;

/** An error whose message is safe and useful to show to the user as-is. */
export class RunnerError extends Error {}

function clean(value: unknown) {
    return typeof value === "string" ? value.slice(0, MAX_OUTPUT_LENGTH) : "";
}

function job(file: RunFile, version: string, stdout: string, stderr: string, code: number): RunJob {
    return { name: file.name, language: file.language, version, run: { stdout, stderr, output: stdout || stderr, code } };
}

// ------------------------------------------------------------------ Wandbox
type WandboxCompiler = { name: string; version: string; language: string; "display-name"?: string };

/** Our language id -> Wandbox `language` names (lower case) and preferred compiler families. */
const WANDBOX_LANGUAGES: Record<string, { names: string[]; prefer: string[] }> = {
    c: { names: ["c"], prefer: ["gcc", "clang"] },
    cpp: { names: ["c++"], prefer: ["gcc", "clang"] },
    csharp: { names: ["c#"], prefer: ["mono", "dotnet"] },
    java: { names: ["java"], prefer: ["openjdk"] },
    go: { names: ["go"], prefer: ["go"] },
    rust: { names: ["rust"], prefer: ["rust"] },
    swift: { names: ["swift"], prefer: ["swift"] },
    ruby: { names: ["ruby"], prefer: ["ruby"] },
    php: { names: ["php"], prefer: ["php"] },
    perl: { names: ["perl"], prefer: ["perl"] },
    python: { names: ["python"], prefer: ["cpython"] },
    javascript: { names: ["javascript"], prefer: ["nodejs"] },
    typescript: { names: ["typescript"], prefer: ["typescript"] },
    lua: { names: ["lua"], prefer: ["lua"] },
    sql: { names: ["sql"], prefer: ["sqlite"] },
    scala: { names: ["scala"], prefer: ["scala"] },
    haskell: { names: ["haskell"], prefer: ["ghc"] },
    elixir: { names: ["elixir"], prefer: ["elixir"] },
    erlang: { names: ["erlang"], prefer: ["erlang"] },
    nim: { names: ["nim"], prefer: ["nim"] },
    d: { names: ["d"], prefer: ["dmd", "ldc", "gdc"] },
    crystal: { names: ["crystal"], prefer: ["crystal"] },
    bash: { names: ["bash script", "bash", "shell script"], prefer: ["bash"] },
    pascal: { names: ["pascal"], prefer: ["fpc"] },
    ocaml: { names: ["ocaml"], prefer: ["ocaml"] },
    zig: { names: ["zig"], prefer: ["zig"] },
    julia: { names: ["julia"], prefer: ["julia"] },
    r: { names: ["r"], prefer: ["r"] },
    groovy: { names: ["groovy"], prefer: ["groovy"] },
    lisp: { names: ["lisp", "common lisp"], prefer: ["sbcl", "clisp"] },
    fsharp: { names: ["f#"], prefer: ["fsharp", "dotnet"] },
    coffeescript: { names: ["coffeescript"], prefer: ["coffeescript"] },
};

export const SERVER_LANGUAGES: ReadonlySet<string> = new Set(RUNNABLE_LANGUAGES);

/** WANDBOX_URL may point at a self-hosted Wandbox (github.com/melpon/wandbox). */
const WANDBOX_URL = (process.env.WANDBOX_URL || "https://wandbox.org").replace(/\/+$/, "");
let compilerCache: { at: number; list: WandboxCompiler[] } | null = null;

async function wandboxCompilers() {
    if (compilerCache && Date.now() - compilerCache.at < 6 * 60 * 60_000) return compilerCache.list;
    const response = await fetch(`${WANDBOX_URL}/api/list.json`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`wandbox list ${response.status}`);
    const list = await response.json() as WandboxCompiler[];
    compilerCache = { at: Date.now(), list: Array.isArray(list) ? list.filter((entry) => entry && typeof entry.name === "string") : [] };
    return compilerCache.list;
}

function compareVersions(left: string, right: string) {
    const a = String(left).split(/[.\-+]/).map((part) => Number.parseInt(part, 10));
    const b = String(right).split(/[.\-+]/).map((part) => Number.parseInt(part, 10));
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        const diff = (Number.isFinite(a[index]) ? a[index] : -1) - (Number.isFinite(b[index]) ? b[index] : -1);
        if (diff) return diff;
    }
    return 0;
}

function newest(list: WandboxCompiler[]) {
    return [...list].sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
}

async function pickCompiler(language: string) {
    const mapping = WANDBOX_LANGUAGES[language];
    if (!mapping) return null;
    const all = (await wandboxCompilers()).filter((entry) => mapping.names.includes(String(entry.language).toLowerCase()));
    // Development snapshots change daily and break often; use them only as a last resort.
    const stable = all.filter((entry) => !/head|nightly|snapshot|dev/i.test(`${entry.name} ${entry.version}`));
    for (const pool of [stable, all]) {
        for (const family of mapping.prefer) {
            const matching = pool.filter((entry) => entry.name.toLowerCase().startsWith(family));
            if (matching.length) return newest(matching);
        }
        if (pool.length) return newest(pool);
    }
    return null;
}

/** Replaces comments and string literals with spaces, keeping every index in place. */
function blankJavaLiterals(code: string) {
    return code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, (match) => match.replace(/[^\n]/g, " "));
}

/** Name of the top-level type that declares `static void main(`. */
function javaMainClass(source: string) {
    const mainIndex = source.search(/\bstatic\s+void\s+main\s*\(/);
    if (mainIndex < 0) return null;
    const declaration = /^(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/;
    let depth = 0;
    let pending: string | null = null;
    let current: string | null = null;
    for (let index = 0; index < mainIndex; index += 1) {
        const char = source[index];
        if (char === "{") {
            if (depth === 0) current = pending;
            depth += 1;
        } else if (char === "}") {
            depth = Math.max(0, depth - 1);
            if (depth === 0) current = null;
        } else if (depth === 0 && (char === "c" || char === "i" || char === "e" || char === "r") && !/[\w$]/.test(source[index - 1] || "")) {
            const match = declaration.exec(source.slice(index, index + 160));
            if (match) pending = match[1];
        }
    }
    return depth > 0 ? current : null;
}

/**
 * Wandbox saves Java code as prog.java, so a `public class Main` would not
 * compile there. Top-level types lose `public`, the package line is dropped and
 * a first `prog` class hands over to the user's own main method. Edits are
 * located on a copy without comments and strings, so literals stay untouched.
 */
function prepareJava(code: string) {
    const blanked = blankJavaLiterals(code);
    const mainClass = javaMainClass(blanked);
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const packageLine = /^[ \t]*package\s+[\w.]+\s*;/m.exec(blanked);
    if (packageLine) edits.push({ start: packageLine.index, end: packageLine.index + packageLine[0].length, text: "" });
    for (const match of blanked.matchAll(/\bpublic\s+(?=(?:(?:final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record)\s)/g)) {
        edits.push({ start: match.index, end: match.index + match[0].length, text: "" });
    }
    if (mainClass && mainClass !== "prog") {
        const typeStart = /^[ \t]*(?:@\w+(?:\([^)]*\))?\s*)*(?:(?:public|final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record)\s/m;
        const at = blanked.search(typeStart);
        const position = at >= 0 ? at : code.length;
        edits.push({ start: position, end: position, text: `class prog { public static void main(String[] args) throws Exception { ${mainClass}.main(args); } }\n` });
    }
    // Apply from the end; at equal positions the removal runs before the insertion.
    edits.sort((a, b) => b.start - a.start || b.end - a.end);
    return edits.reduce((source, edit) => `${source.slice(0, edit.start)}${edit.text}${source.slice(edit.end)}`, code);
}

async function runWithWandbox(file: RunFile, stdin: string, signal: AbortSignal): Promise<RunJob> {
    const compiler = await pickCompiler(file.language);
    if (!compiler) throw new RunnerError(`${file.language} için şu anda kullanılabilir bir derleyici bulunamadı.`);
    const response = await fetch(`${WANDBOX_URL}/api/compile.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            compiler: compiler.name,
            code: file.language === "java" ? prepareJava(file.code) : file.code,
            stdin,
            options: "",
            "compiler-option-raw": "",
            "runtime-option-raw": "",
            save: false,
        }),
        signal,
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`wandbox ${response.status}`);
    const result = await response.json() as Record<string, unknown>;
    const stdout = clean(result.program_output);
    const errors = [result.compiler_error, result.program_error].filter((part): part is string => typeof part === "string" && Boolean(part.trim()));
    const signalName = typeof result.signal === "string" && result.signal ? `Sinyal: ${result.signal}` : "";
    const stderr = clean([...errors, signalName].filter(Boolean).join("\n").trim());
    const status = Number.parseInt(String(result.status ?? ""), 10);
    const version = `${compiler["display-name"] || compiler.name} ${compiler.version}`.trim();
    return job(file, version, stdout, stderr, Number.isFinite(status) ? status : signalName ? 1 : 0);
}

// ------------------------------------------------------------------- Kotlin
const KOTLIN_SERVER = "https://api.kotlinlang.org";
let kotlinVersionCache: { at: number; version: string } | null = null;

async function kotlinVersion() {
    if (kotlinVersionCache && Date.now() - kotlinVersionCache.at < 6 * 60 * 60_000) return kotlinVersionCache.version;
    const response = await fetch(`${KOTLIN_SERVER}/versions`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`kotlin versions ${response.status}`);
    const list = await response.json() as Array<{ version?: string; latestStable?: boolean }>;
    const stable = Array.isArray(list) ? list.filter((entry) => typeof entry?.version === "string") : [];
    const version = stable.find((entry) => entry.latestStable)?.version ?? stable.at(-1)?.version;
    if (!version) throw new Error("kotlin versions empty");
    kotlinVersionCache = { at: Date.now(), version };
    return version;
}

type KotlinProblem = { message?: string; severity?: string; interval?: { start?: { line?: number; ch?: number } } };
type KotlinException = { message?: string | null; fullName?: string; stackTrace?: Array<{ className?: string; methodName?: string; fileName?: string; lineNumber?: number }>; cause?: KotlinException | null };

/** The playground wraps program output in <outStream> / <errStream> markers. */
function streams(text: string) {
    let stdout = "";
    let stderr = "";
    let marked = false;
    for (const match of text.matchAll(/<(outStream|errStream)>([\s\S]*?)<\/\1>/g)) {
        marked = true;
        if (match[1] === "outStream") stdout += match[2];
        else stderr += match[2];
    }
    return marked ? { stdout, stderr } : { stdout: text, stderr: "" };
}

function describeException(exception: KotlinException, depth = 0): string {
    const header = `${depth ? "Caused by: " : 'Exception in thread "main" '}${exception.fullName || "Exception"}${exception.message ? `: ${exception.message}` : ""}`;
    const frames = (exception.stackTrace ?? []).slice(0, 12).map((frame) => `\tat ${frame.className ?? "?"}.${frame.methodName ?? "?"}(${frame.fileName ?? "?"}:${frame.lineNumber ?? "?"})`);
    return [header, ...frames, ...(exception.cause && depth < 3 ? [describeException(exception.cause, depth + 1)] : [])].join("\n");
}

async function runKotlin(file: RunFile, stdin: string, signal: AbortSignal): Promise<RunJob> {
    const version = await kotlinVersion();
    const response = await fetch(`${KOTLIN_SERVER}/api/${encodeURIComponent(version)}/compiler/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ args: "", files: [{ name: "File.kt", text: file.code, publicId: "" }], confType: "java" }),
        signal,
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`kotlin ${response.status}`);
    const result = await response.json() as { errors?: Record<string, KotlinProblem[]>; exception?: KotlinException | null; text?: string };
    const problems = Object.values(result.errors ?? {}).flat().filter((problem) => problem?.severity === "ERROR");
    const output = streams(typeof result.text === "string" ? result.text : "");
    const messages = [
        ...problems.map((problem) => `File.kt:${(problem.interval?.start?.line ?? 0) + 1}:${(problem.interval?.start?.ch ?? 0) + 1}: error: ${problem.message ?? ""}`),
        output.stderr.trim(),
        result.exception ? describeException(result.exception) : "",
        stdin.trim() ? "Not: Kotlin çalıştırıcısı program girdisini (stdin) desteklemiyor." : "",
    ].filter(Boolean);
    return job(file, `Kotlin ${version} (JVM)`, clean(output.stdout), clean(messages.join("\n")), problems.length || result.exception ? 1 : 0);
}

// ------------------------------------------------------------ Piston runner
async function runWithPiston(url: string, file: RunFile, stdin: string, signal: AbortSignal): Promise<RunJob> {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(process.env.CODE_RUNNER_TOKEN ? { Authorization: `Bearer ${process.env.CODE_RUNNER_TOKEN}` } : {}),
        },
        body: JSON.stringify({
            language: file.language === "sql" ? "sqlite3" : file.language,
            version: "*",
            files: [{ name: file.name, content: file.code }],
            stdin,
            limits: { wallTimeMs: 15_000, outputBytes: MAX_OUTPUT_LENGTH },
        }),
        signal,
        cache: "no-store",
    });
    if (!response.ok) throw new Error("runner_unavailable");
    const result = await response.json() as {
        run?: { stdout?: unknown; stderr?: unknown; output?: unknown; code?: unknown };
        language?: unknown;
        version?: unknown;
    };
    if (!result.run) throw new Error("invalid_runner_response");
    const stdout = clean(result.run.stdout);
    const stderr = clean(result.run.stderr);
    return {
        name: file.name,
        language: typeof result.language === "string" ? result.language : file.language,
        version: typeof result.version === "string" ? result.version : "managed",
        run: { stdout, stderr, output: clean(result.run.output) || stdout || stderr, code: Number.isInteger(result.run.code) ? Number(result.run.code) : 1 },
    };
}

export function runnerName() {
    return process.env.CODE_RUNNER_URL ? "custom" : "public";
}

export async function runFiles(files: RunFile[], stdin: string, timeoutMs = 25_000) {
    const signal = AbortSignal.timeout(timeoutMs);
    const url = process.env.CODE_RUNNER_URL;
    return Promise.all(files.map((file) => {
        if (url) return runWithPiston(url, file, stdin, signal);
        return file.language === "kotlin" ? runKotlin(file, stdin, signal) : runWithWandbox(file, stdin, signal);
    }));
}

/** Exposed for unit tests. */
export const __test = { prepareJava, javaMainClass: (code: string) => javaMainClass(blankJavaLiterals(code)), streams, compareVersions };
