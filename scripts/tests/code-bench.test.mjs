// The Hanogt code-bench harness (scripts/ai-eval): the tasks are well formed,
// every reference solution passes and every stub fails its hidden tests, code
// is picked out of answers, failures are classified, the engine is retried
// only when that can help, and model-written code gets neither the
// environment's secrets nor writes outside its folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCode, comparisonReport, extractCode, fixtureCode, markdownReport, mockEngine, pythonAvailable, runBench, summarize } from "../ai-eval/bench-lib.mjs";
import { BENCH_TASKS } from "../ai-eval/bench-tasks.mjs";

const PYTHON = pythonAvailable();
const runnable = BENCH_TASKS.filter((task) => PYTHON || task.language !== "python");
const byId = (id) => BENCH_TASKS.find((task) => task.id === id);

test("40 tasks, 20 per language, each with prompts in both languages, entries, tests and a solution", () => {
    assert.equal(BENCH_TASKS.length, 40);
    assert.equal(BENCH_TASKS.filter((task) => task.language === "javascript").length, 20);
    assert.equal(BENCH_TASKS.filter((task) => task.language === "python").length, 20);
    assert.equal(new Set(BENCH_TASKS.map((task) => task.id)).size, 40, "unique ids");
    for (const task of BENCH_TASKS) {
        assert.ok(task.prompt.TR.length > 80 && task.prompt.EN.length > 80, task.id);
        assert.ok(task.entries.length >= 1 && task.entries.every((name) => /^[A-Za-z_]\w*$/.test(name)), task.id);
        for (const name of task.entries) assert.ok(task.prompt.TR.includes(name) && task.prompt.EN.includes(name), `${task.id} names ${name} in both prompts`);
        assert.ok(task.tags.length >= 1, task.id);
        assert.ok(task.tests && task.solution, task.id);
    }
});

test("every reference solution passes and every stub (right names, no logic) fails", { skip: !PYTHON && "python3 not found: Python tasks skipped" }, async () => {
    const checks = await Promise.all(runnable.flatMap((task) => ["reference", "stub"].map(async (mode) => ({ task, mode, result: await checkCode(task, fixtureCode(task, mode), { timeoutMs: 15_000 }) }))));
    for (const { task, mode, result } of checks) {
        if (mode === "reference") assert.equal(result.status, "pass", `${task.id}: ${result.detail}`);
        else assert.notEqual(result.status, "pass", `${task.id}'s tests must reject a stub`);
    }
});

test("code is picked out of answers", () => {
    const js = "Önce açıklama.\n```js\nconsole.log(chunk([1], 1));\n```\nÇözüm:\n```javascript\nfunction chunk(array, size) {\n  return [];\n}\n```";
    assert.match(extractCode(js, "javascript", ["chunk"]), /^function chunk/, "the block that defines the entry");
    assert.equal(extractCode("```python\ndef f():\n    return 1\n```", "javascript", ["f"]), null, "a block in another language doesn't count");
    assert.equal(extractCode("```\nconst f = () => 1;\n```", "javascript", ["f"]), "const f = () => 1;", "an untagged block");
    assert.equal(extractCode("def f(x):\n    return x", "python", ["f"]), "def f(x):\n    return x", "plain code without a fence");
    assert.equal(extractCode("Bunu yapamam.", "python", ["f"]), null);
    assert.equal(extractCode("```python\ndef f(x):\n    return x  # cut off here", "python", ["f"]), "def f(x):\n    return x  # cut off here", "an answer cut off inside its block");
    assert.equal(extractCode("```ts\nfunction f(): number { return 1 }\n```", "javascript", ["f"]), null, "TypeScript isn't run as JavaScript");
});

test("failures are classified: missing function, syntax, wrong answer, runtime error, timeout", async () => {
    const chunk = byId("js-chunk");
    assert.equal((await checkCode(chunk, "function other() {}")).status, "missing_function");
    assert.equal((await checkCode(chunk, "function chunk( {")).status, "syntax_error");
    assert.equal((await checkCode(chunk, "function chunk() { return [[1, 2]]; }")).status, "wrong_answer");
    assert.equal((await checkCode(chunk, "function chunk() { null.x; }")).status, "runtime_error");
    assert.equal((await checkCode(chunk, "function chunk() { for (;;) {} }", { timeoutMs: 1200 })).status, "timeout");
    assert.equal((await checkCode(chunk, "export function chunk(array, size) { if (!Number.isInteger(size) || size < 1) throw new RangeError('x'); const out = []; for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size)); return out; }")).status, "pass", "ES module exports are accepted");
    assert.equal((await checkCode(chunk, null)).status, "no_code");
    if (!PYTHON) return;
    const caesar = byId("py-caesar");
    assert.equal((await checkCode(caesar, "def caesar(text, shift)\n    return text")).status, "syntax_error");
    assert.equal((await checkCode(caesar, "def caesar(text, shift):\n    return text")).status, "wrong_answer");
    assert.equal((await checkCode(caesar, "def caesar(text, shift):\n    while True:\n        pass", { timeoutMs: 1200 })).status, "timeout");
    const demo = `${byId("py-caesar").solution}\nif __name__ == "__main__":\n    print(caesar(input(), 3))\n`;
    assert.equal((await checkCode(caesar, demo)).status, "pass", "a __main__ demo that reads input doesn't run");
});

test("the sandbox: no secrets in the environment, no writes outside the task folder, no processes", async () => {
    process.env.HANOGT_BENCH_SECRET = "sk-should-not-leak";
    try {
        const chunk = byId("js-chunk");
        const reference = fixtureCode(chunk, "reference");
        assert.equal((await checkCode(chunk, `if (process.env.HANOGT_BENCH_SECRET) throw new Error("leaked");\n${reference}`)).status, "pass", "JavaScript sees no secrets");
        const write = await checkCode(chunk, `require("fs").writeFileSync(require("os").tmpdir() + "/hanogt-bench-escape.txt", "x");\n${reference}`);
        assert.equal(write.status, "runtime_error");
        assert.match(write.detail, /ERR_ACCESS_DENIED|permission/i);
        const spawn = await checkCode(chunk, `require("child_process").execSync("echo hi");\n${reference}`);
        assert.equal(spawn.status, "runtime_error");
        if (!PYTHON) return;
        const caesar = byId("py-caesar");
        assert.equal((await checkCode(caesar, `import os\nif os.environ.get("HANOGT_BENCH_SECRET"):\n    raise RuntimeError("leaked")\n${caesar.solution}`)).status, "pass", "Python sees no secrets");
        const pyWrite = await checkCode(caesar, `open("/tmp/hanogt-bench-escape.txt", "w").write("x")\n${caesar.solution}`);
        assert.equal(pyWrite.status, "runtime_error");
        assert.match(pyWrite.detail, /PermissionError/);
        const pyProcess = await checkCode(caesar, `import subprocess\nsubprocess.run(["echo", "hi"])\n${caesar.solution}`);
        assert.match(pyProcess.detail, /PermissionError/);
        const pySocket = await checkCode(caesar, `import socket\nsocket.create_connection(("127.0.0.1", 9))\n${caesar.solution}`);
        assert.match(pySocket.detail, /PermissionError/);
    } finally {
        delete process.env.HANOGT_BENCH_SECRET;
    }
});

test("a run: the engine is retried on rate limits and outages, not on other errors; the reports add up", async () => {
    const tasks = [byId("js-chunk"), byId("js-balanced")];
    let calls = 0;
    const flaky = {
        name: "flaky",
        async complete(request) {
            calls += 1;
            if (calls <= 2) throw Object.assign(new Error("rate limited"), { status: 429 });
            return mockEngine("reference").complete(request);
        },
    };
    const results = await runBench(tasks, flaky, { concurrency: 1, backoffMs: 1 });
    assert.deepEqual(results.map((result) => result.status), ["pass", "pass"]);
    assert.equal(calls, 4, "the first task: two rate limits, then the answer; the second: one call");
    let denied = 0;
    const rejected = await runBench([tasks[0]], {
        name: "denied",
        async complete() {
            denied += 1;
            throw Object.assign(new Error("bad key"), { status: 401 });
        },
    }, { backoffMs: 1 });
    assert.equal(rejected[0].status, "api_error");
    assert.equal(denied, 1, "an invalid key isn't retried");
    const refusal = await runBench([tasks[0]], { name: "refuses", complete: async () => ({ text: "I can't help with that.", stopReason: "refusal" }) });
    assert.equal(refusal[0].status, "refusal");

    const summary = summarize([...results, rejected[0]]);
    assert.equal(summary.passAt1, 66.7);
    assert.deepEqual(summary.byLanguage.javascript, { total: 3, passed: 2, passAt1: 66.7 });
    assert.deepEqual(summary.byStatus, { pass: 2, api_error: 1 });
    const run = { engine: "flaky", lang: "TR", date: "2026-10-03T12:00:00.000Z", timeoutMs: 10_000, summary, results: [...results, rejected[0]] };
    assert.match(markdownReport(run), /pass@1: 66.7%/);
    assert.match(markdownReport(run), /\| js-chunk \| api_error \| bad key \|/);
    const older = { ...run, date: "2026-10-01T00:00:00.000Z", summary: { ...summary, passAt1: 10, byLanguage: { javascript: { total: 1, passed: 0, passAt1: 10 } } } };
    const comparison = comparisonReport([older, run, { ...run, engine: "other", summary: { ...summary, passAt1: 90 } }]);
    assert.ok(comparison.indexOf("| other |") < comparison.indexOf("| flaky |"), "best first");
    assert.equal(comparison.match(/\| flaky \|/g).length, 1, "only the newest run of an engine");
});
