// The pieces of the Hanogt code-bench (scripts/ai-eval/code-bench.mjs): the
// prompt, picking the code out of an answer, the program a task's hidden tests
// run in, a sandboxed child process, scoring and the reports. Kept free of the
// CLI so scripts/tests/code-bench.test.mjs can drive it with fake engines.
//
// The sandbox is best effort: model-written code runs on this machine with a
// minimal environment (no API keys), a time and memory limit and, for
// JavaScript, Node's permission model (no file writes, no child processes);
// Python runs under audit hooks that block sockets, processes and writes
// outside the task folder. Run untrusted models in a throwaway VM or container.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const BENCH_SYSTEM = "You are an expert software engineer. Write correct, complete and efficient code that handles every edge case in the specification. Reply with the requested code block.";

const FENCE_TAGS = {
    javascript: ["javascript", "js", "node", "nodejs", "mjs", "cjs"],
    python: ["python", "py", "python3"],
};
const OTHER_TAGS = /^(?:ts|typescript|tsx|jsx|java|c|cpp|c\+\+|cs|csharp|go|rust|rb|ruby|php|bash|sh|shell|console|json|text|txt|output|plaintext|markdown|md)$/;

/** The prompt one task gets, in Turkish (TR) or English (EN). */
export function benchPrompt(task, lang = "TR") {
    const fence = task.language === "python" ? "python" : "javascript";
    const names = task.entries.map((name) => `\`${name}\``).join(", ");
    return lang === "EN"
        ? `${task.prompt.EN}\n\nReply with one \`\`\`${fence} code block that defines ${names} (and any helpers it needs). Don't read input, print examples or include tests.`
        : `${task.prompt.TR}\n\nYanıtın, ${names} fonksiyonunu (ve gerekiyorsa yardımcılarını) tanımlayan tek bir \`\`\`${fence} kod bloğu olsun. Girdi okuma, örnek çıktı ya da test kodu ekleme.`;
}

function definesEntry(code, language, entry) {
    const name = entry.replace(/[$]/g, "\\$");
    return language === "python"
        ? new RegExp(`^\\s*(?:async\\s+)?def\\s+${name}\\s*\\(|^${name}\\s*=`, "m").test(code)
        : new RegExp(`function\\s*\\*?\\s*${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=`).test(code);
}

function looksLikeCode(text, language) {
    return language === "python" ? /^\s*(?:async\s+)?def\s+\w+\s*\(/m.test(text) : /\bfunction\b|=>|\b(?:const|let)\s+\w+\s*=/.test(text);
}

/**
 * The code to run from a model's answer: among the fenced blocks in the task's
 * language (else untagged ones), the longest that defines an entry function,
 * else the longest. An answer cut off inside a block still yields that block;
 * an answer without fences counts only when it is plainly code.
 */
export function extractCode(answer, language, entries = []) {
    const text = String(answer ?? "");
    const blocks = [...text.matchAll(/```[ \t]*([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g)].map((match) => ({ tag: match[1].toLowerCase(), code: match[2] }));
    if (!blocks.length) {
        const open = /```[ \t]*([\w+#.-]*)[^\n]*\n([\s\S]*)$/.exec(text);
        if (open) blocks.push({ tag: open[1].toLowerCase(), code: open[2] });
    }
    if (!blocks.length) return looksLikeCode(text, language) ? text.trim() : null;
    const tagged = blocks.filter((block) => FENCE_TAGS[language].includes(block.tag));
    const candidates = tagged.length ? tagged : blocks.filter((block) => !block.tag || !OTHER_TAGS.test(block.tag) && !Object.values(FENCE_TAGS).flat().includes(block.tag));
    if (!candidates.length) return null;
    const defining = candidates.filter((block) => entries.some((entry) => definesEntry(block.code, language, entry)));
    const pool = defining.length ? defining : candidates;
    return pool.reduce((best, block) => (block.code.length > best.code.length ? block : best)).code.trim();
}

/** ES module syntax a CommonJS script can't run: `export` keywords and export lists. */
function asScript(code) {
    return code
        .replace(/^(\s*)export\s+default\s+(?=(?:async\s+)?function\b|class\b)/gm, "$1")
        .replace(/^(\s*)export\s+(?=(?:async\s+)?function\b|const\b|let\b|var\b|class\b)/gm, "$1")
        .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "")
        .replace(/^\s*export\s+default\s+[\w$]+\s*;?\s*$/gm, "");
}

const indent = (text, spaces) => text.split("\n").map((line) => (line.trim() ? `${" ".repeat(spaces)}${line}` : line)).join("\n");

/** The program that runs `code` against the task's hidden tests and prints `nonce` only when every test passed. */
export function buildProgram(task, code, nonce) {
    if (task.language === "python") {
        return `${code}


def _raises(exc, fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except exc:
        return True
    raise AssertionError(f"{getattr(fn, '__name__', fn)} did not raise {exc.__name__}")


def __hanogt_bench_check():
    missing = [name for name in ${JSON.stringify(task.entries)} if not callable(globals().get(name))]
    if missing:
        import sys
        print("MISSING_FUNCTION " + ",".join(missing), file=sys.stderr)
        raise SystemExit(3)


def __hanogt_bench_tests():
${indent(task.tests, 4)}


__hanogt_bench_check()
__hanogt_bench_tests()
print(${JSON.stringify(nonce)})
`;
    }
    const checks = task.entries.map((name) => `typeof ${name} === "function" ? null : ${JSON.stringify(name)}`).join(", ");
    return `${asScript(code)}
;(async () => {
    const missing = [${checks}].filter(Boolean);
    if (missing.length) {
        console.error("MISSING_FUNCTION " + missing.join(","));
        process.exit(3);
    }
    const assert = require("node:assert/strict");
    const tests = ${task.tests.toString()};
    await tests(assert, { ${task.entries.join(", ")} });
    console.log(${JSON.stringify(nonce)});
})().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
});
`;
}

/** Runs main.py through this bootstrap: limits and audit hooks first, then the program (its `__main__` demo blocks don't run). */
const pythonBootstrap = (cpuSeconds) => `import os
import runpy
import sys

try:
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (2 << 30, 2 << 30))
    resource.setrlimit(resource.RLIMIT_CPU, (${cpuSeconds}, ${cpuSeconds}))
except Exception:
    pass

ROOT = os.path.realpath(os.getcwd())
BLOCKED = {
    "socket.connect", "socket.bind", "socket.sendto", "subprocess.Popen", "os.system", "os.exec", "os.posix_spawn",
    "os.spawn", "os.fork", "os.forkpty", "os.kill", "os.killpg", "shutil.rmtree", "os.remove", "os.rmdir",
    "os.rename", "os.chmod", "os.chown", "ctypes.dlopen",
}
WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_TRUNC


def audit(event, args):
    if event in BLOCKED:
        raise PermissionError(f"code-bench sandbox blocked {event}")
    if event == "open" and len(args) >= 3:
        target, mode, flags = args[0], args[1], args[2]
        writes = any(flag in mode for flag in "wax+") if isinstance(mode, str) else isinstance(flags, int) and bool(flags & WRITE_FLAGS)
        if writes:
            if isinstance(target, bytes):
                target = target.decode(errors="replace")
            if not isinstance(target, str) or not os.path.realpath(target).startswith(ROOT):
                raise PermissionError("code-bench sandbox blocked a write outside the task folder")


sys.addaudithook(audit)
runpy.run_path("main.py", run_name="hanogt_bench")
`;

let permissionFlag;
/** Node's permission flag on this version ("--permission", or the older "--experimental-permission"); null when neither exists. */
export function nodePermissionFlag() {
    if (permissionFlag !== undefined) return permissionFlag;
    permissionFlag = null;
    for (const flag of ["--permission", "--experimental-permission"]) {
        const probe = spawnSync(process.execPath, [flag, "--allow-fs-read=*", "-e", "0"], { stdio: "ignore", timeout: 10_000 });
        if (probe.status === 0) {
            permissionFlag = flag;
            break;
        }
    }
    return permissionFlag;
}

/** The Python interpreter: $PYTHON, else python3 (python on Windows). */
export function defaultPython() {
    return process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
}

export function pythonAvailable(python = defaultPython()) {
    const probe = spawnSync(python, ["--version"], { stdio: "ignore", timeout: 10_000 });
    return probe.status === 0;
}

const OUTPUT_CAP = 64 * 1024;

function execute(command, args, { cwd, timeoutMs }) {
    return new Promise((resolve) => {
        const started = Date.now();
        const posix = process.platform !== "win32";
        const child = spawn(command, args, {
            cwd,
            // No inherited environment: API keys and tokens never reach model-written code.
            env: { PATH: process.env.PATH ?? "", LANG: "C.UTF-8", PYTHONIOENCODING: "utf-8", PYTHONHASHSEED: "0", ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}) },
            stdio: ["ignore", "pipe", "pipe"],
            detached: posix,
            windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const collect = (current, chunk) => (current.length < OUTPUT_CAP ? current + chunk.toString("utf8").slice(0, OUTPUT_CAP - current.length) : current);
        child.stdout.on("data", (chunk) => {
            stdout = collect(stdout, chunk);
        });
        child.stderr.on("data", (chunk) => {
            stderr = collect(stderr, chunk);
        });
        const kill = () => {
            try {
                if (posix) process.kill(-child.pid, "SIGKILL");
                else child.kill("SIGKILL");
            } catch {
                // Already gone.
            }
        };
        const timer = setTimeout(() => {
            timedOut = true;
            kill();
        }, timeoutMs);
        child.on("error", (error) => {
            clearTimeout(timer);
            resolve({ code: null, signal: null, stdout, stderr: `${stderr}\n${error.message}`, timedOut: false, ms: Date.now() - started, spawnError: true });
        });
        child.on("close", (code, signal) => {
            clearTimeout(timer);
            // Whatever the program left running (its own children) goes with it.
            if (posix && !timedOut) kill();
            resolve({ code, signal, stdout, stderr, timedOut, ms: Date.now() - started });
        });
    });
}

/** Runs a built program in a fresh temporary folder and removes the folder afterwards. */
export async function runProgram(language, source, { timeoutMs = 10_000, python = defaultPython() } = {}) {
    const dir = await mkdtemp(path.join(tmpdir(), "hanogt-bench-"));
    try {
        if (language === "python") {
            await writeFile(path.join(dir, "main.py"), source);
            await writeFile(path.join(dir, "bootstrap.py"), pythonBootstrap(Math.ceil(timeoutMs / 1000) + 1));
            return await execute(python, ["-I", "-B", "bootstrap.py"], { cwd: dir, timeoutMs });
        }
        await writeFile(path.join(dir, "main.js"), source);
        const flag = nodePermissionFlag();
        const sandbox = flag ? [flag, `--allow-fs-read=${dir}`] : [];
        return await execute(process.execPath, [...sandbox, "--max-old-space-size=512", "main.js"], { cwd: dir, timeoutMs });
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}

/** pass, or why not: timeout, missing_function, syntax_error, wrong_answer, runtime_error, incomplete (ended early). */
export function classifyRun(run, nonce) {
    if (run.timedOut) return "timeout";
    if (run.code === 0 && run.stdout.includes(nonce)) return "pass";
    const errors = run.stderr;
    if (/MISSING_FUNCTION/.test(errors)) return "missing_function";
    if (/\b(?:SyntaxError|IndentationError|TabError)\b/.test(errors)) return "syntax_error";
    if (/\bAssertionError\b|ERR_ASSERTION/.test(errors)) return "wrong_answer";
    if (run.code === 0) return "incomplete";
    return "runtime_error";
}

/** The first meaningful line of an error output, for the report. */
function errorLine(stderr) {
    const lines = stderr.split("\n").map((line) => line.trim()).filter(Boolean);
    return (lines.find((line) => /Error\b|MISSING_FUNCTION|PermissionError/.test(line)) ?? lines[lines.length - 1] ?? "").slice(0, 240);
}

/** Runs one piece of code against one task's hidden tests. */
export async function checkCode(task, code, options = {}) {
    if (!code) return { status: "no_code", ms: 0, detail: "no code block in the answer" };
    const nonce = `__HANOGT_BENCH_OK_${randomBytes(9).toString("hex")}__`;
    const run = await runProgram(task.language, buildProgram(task, code, nonce), options);
    const status = run.spawnError ? "runtime_error" : classifyRun(run, nonce);
    return { status, ms: run.ms, detail: status === "pass" ? "" : status === "timeout" ? `over ${options.timeoutMs ?? 10_000} ms` : errorLine(run.stderr) };
}

/** Code for the self-check and the tests: the reference solution, a stub that defines the names only, or an endless loop. */
export function fixtureCode(task, mode) {
    if (mode === "reference") return task.language === "python" ? task.solution : task.solution.toString();
    if (task.language === "python") {
        const body = mode === "loop" ? "    while True:\n        pass" : "    return None";
        return task.entries.map((name) => `def ${name}(*args, **kwargs):\n${body}\n`).join("\n");
    }
    const body = mode === "loop" ? "for (;;) {}" : "return undefined;";
    return task.entries.map((name) => `function ${name}() { ${body} }`).join("\n");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Status codes worth another try: rate limits and the provider's own failures. */
const retryable = (error) => error?.retryable === true || [408, 409, 425, 429, 500, 502, 503, 504, 529].includes(error?.status) || error?.name === "TypeError";

/** Asks the engine (retrying rate limits and outages up to three times), then runs the answer's code. */
async function solveTask(task, engine, options) {
    const prompt = benchPrompt(task, options.lang);
    let answer = null;
    let lastError = null;
    for (let attempt = 0; attempt < 4 && answer === null; attempt++) {
        if (attempt) await sleep(options.backoffMs * 2 ** (attempt - 1));
        try {
            answer = await engine.complete({ system: BENCH_SYSTEM, prompt, task, lang: options.lang });
        } catch (error) {
            lastError = error;
            if (!retryable(error)) break;
        }
    }
    if (answer === null) return { id: task.id, language: task.language, tags: task.tags, status: "api_error", ms: 0, detail: String(lastError?.message ?? lastError).slice(0, 240), answerChars: 0 };
    const code = extractCode(answer.text, task.language, task.entries);
    const result = answer.stopReason === "refusal" && !code ? { status: "refusal", ms: 0, detail: "the model declined" } : await checkCode(task, code, options);
    return { id: task.id, language: task.language, tags: task.tags, ...result, answerChars: answer.text.length, ...(answer.usage ? { usage: answer.usage } : {}) };
}

/** Runs every task through the engine, a few at a time; results keep the tasks' order. */
export async function runBench(tasks, engine, { lang = "TR", concurrency = 3, timeoutMs = 10_000, python = defaultPython(), backoffMs = 2000, onResult } = {}) {
    const results = new Array(tasks.length);
    let next = 0;
    const worker = async () => {
        while (next < tasks.length) {
            const index = next++;
            results[index] = await solveTask(tasks[index], engine, { lang, timeoutMs, python, backoffMs });
            onResult?.(results[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, worker));
    return results;
}

/** pass@1 overall, per language and per tag, and how the failures went. */
export function summarize(results) {
    const count = (list) => ({ total: list.length, passed: list.filter((result) => result.status === "pass").length });
    const rate = ({ total, passed }) => (total ? Math.round((passed / total) * 1000) / 10 : 0);
    const overall = count(results);
    const byLanguage = {};
    for (const language of [...new Set(results.map((result) => result.language))]) {
        const part = count(results.filter((result) => result.language === language));
        byLanguage[language] = { ...part, passAt1: rate(part) };
    }
    const byTag = {};
    for (const tag of [...new Set(results.flatMap((result) => result.tags ?? []))].sort()) {
        const part = count(results.filter((result) => result.tags?.includes(tag)));
        byTag[tag] = { ...part, passAt1: rate(part) };
    }
    const byStatus = {};
    for (const result of results) byStatus[result.status] = (byStatus[result.status] ?? 0) + 1;
    return { ...overall, passAt1: rate(overall), byLanguage, byTag, byStatus };
}

/** One run as Markdown: the scores and every failure. */
export function markdownReport(run) {
    const { summary } = run;
    const lines = [
        `# Hanogt code-bench: ${run.engine}`,
        "",
        `- Date: ${run.date}`,
        `- Prompt language: ${run.lang}, tasks: ${summary.total}, time limit per task: ${run.timeoutMs} ms`,
        `- **pass@1: ${summary.passAt1}%** (${summary.passed}/${summary.total})`,
        "",
        "| Language | Passed | pass@1 |",
        "| --- | --- | --- |",
        ...Object.entries(summary.byLanguage).map(([language, part]) => `| ${language} | ${part.passed}/${part.total} | ${part.passAt1}% |`),
        "",
        `Outcomes: ${Object.entries(summary.byStatus).map(([status, n]) => `${status} ${n}`).join(", ")}`,
    ];
    const failures = run.results.filter((result) => result.status !== "pass");
    if (failures.length) {
        lines.push("", "| Task | Outcome | Detail |", "| --- | --- | --- |");
        for (const failure of failures) lines.push(`| ${failure.id} | ${failure.status} | ${(failure.detail || "").replace(/\|/g, "\\|")} |`);
    }
    return `${lines.join("\n")}\n`;
}

/** Several saved runs side by side (newest run per engine), for ai/reports/code-bench.md. */
export function comparisonReport(runs) {
    const latest = new Map();
    for (const run of [...runs].sort((a, b) => a.date.localeCompare(b.date))) latest.set(`${run.engine}|${run.lang}`, run);
    const rows = [...latest.values()].sort((a, b) => b.summary.passAt1 - a.summary.passAt1);
    const languages = [...new Set(rows.flatMap((run) => Object.keys(run.summary.byLanguage)))].sort();
    return [
        "# Hanogt code-bench: comparison",
        "",
        "pass@1 on the hidden tests of scripts/ai-eval/bench-tasks.mjs (one answer per task). Generated by `node scripts/ai-eval/code-bench.mjs --compare`.",
        "",
        `| Engine | Prompt | Date | pass@1 | ${languages.join(" | ")} |`,
        `| --- | --- | --- | --- | ${languages.map(() => "---").join(" | ")} |`,
        ...rows.map((run) => `| ${run.engine} | ${run.lang} | ${run.date.slice(0, 10)} | **${run.summary.passAt1}%** | ${languages.map((language) => (run.summary.byLanguage[language] ? `${run.summary.byLanguage[language].passAt1}%` : "–")).join(" | ")} |`),
        "",
    ].join("\n");
}

/**
 * The answer without the thinking a thinking model may put in its text: a
 * <think> block, or everything up to </think> when the template opened the
 * block in the prompt. Only the answer is graded.
 */
export function answerText(content) {
    let text = String(content ?? "");
    const close = text.indexOf("</think>");
    if (close >= 0 && !text.slice(0, close).includes("<think>")) text = text.slice(close + "</think>".length);
    return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();
}

/** An OpenAI-compatible chat completions endpoint (Hanogt AI's own model, vLLM, Ollama, the Hanogt AI API…). */
export function openAiEngine({ name, baseUrl, apiKey, model, extra = {}, temperature = 0.2, maxTokens = 4000, fetchImpl = fetch, timeoutMs = 180_000 }) {
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    return {
        name: name ?? `openai-compatible:${model}`,
        async complete({ system, prompt }) {
            const response = await fetchImpl(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
                body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], temperature, max_tokens: maxTokens, ...extra }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
                error.status = response.status;
                throw error;
            }
            const data = await response.json();
            return { text: answerText(data?.choices?.[0]?.message?.content), stopReason: data?.choices?.[0]?.finish_reason ?? null, usage: data?.usage ?? null };
        },
    };
}

/** No model: answers with fixture code (reference, stub or loop), to check the harness itself. */
export function mockEngine(mode) {
    return {
        name: `mock:${mode}`,
        async complete({ task }) {
            const fence = task.language === "python" ? "python" : "javascript";
            return { text: `Here you go:\n\n\`\`\`${fence}\n${fixtureCode(task, mode)}\n\`\`\`\n`, stopReason: "end_turn" };
        },
    };
}
