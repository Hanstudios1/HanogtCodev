#!/usr/bin/env node
// Hanogt code-bench: how well an engine writes code, as pass@1 on 40 tasks
// (20 JavaScript, 20 Python) with hidden tests (scripts/ai-eval/bench-tasks.mjs).
//
//   node scripts/ai-eval/code-bench.mjs --self-check
//       the harness itself: every reference solution passes, every stub fails
//   node scripts/ai-eval/code-bench.mjs --engine hanogt --api-key-env HANOGT_API_KEY
//       Hanogt AI through its developer API (model hanogt-ai, Code mode)
//   node scripts/ai-eval/code-bench.mjs --engine openai --base-url "$HANOGT_AI_BASE_URL" \
//       --model "$HANOGT_AI_MODEL" --api-key-env HANOGT_AI_API_KEY
//       any OpenAI-compatible endpoint: Hanogt AI's own model (a Hugging Face
//       router model with its provider, an Inference Endpoint, vLLM), Ollama with /v1…
//   node scripts/ai-eval/code-bench.mjs --compare
//       every saved run side by side → ai/reports/code-bench.md
//
// Options: --lang tr|en (prompt language, default tr) · --only id,id ·
// --language javascript|python · --concurrency 3 · --timeout 10000 (ms per
// task) · --out ai/reports/code-bench · --python python3 · --no-save.
// Model-written code runs on this machine (see the sandbox notes in
// bench-lib.mjs): use a throwaway VM or container for untrusted models.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { checkCode, comparisonReport, defaultPython, fixtureCode, markdownReport, mockEngine, openAiEngine, pythonAvailable, runBench, summarize } from "./bench-lib.mjs";
import { BENCH_TASKS } from "./bench-tasks.mjs";

const { values: args } = parseArgs({
    options: {
        engine: { type: "string" },
        "base-url": { type: "string" },
        model: { type: "string" },
        "api-key-env": { type: "string" },
        mock: { type: "string", default: "reference" },
        lang: { type: "string", default: "tr" },
        only: { type: "string" },
        language: { type: "string" },
        concurrency: { type: "string", default: "3" },
        timeout: { type: "string", default: "10000" },
        out: { type: "string", default: "ai/reports/code-bench" },
        python: { type: "string" },
        "self-check": { type: "boolean", default: false },
        compare: { type: "boolean", default: false },
        "no-save": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
    },
});

function fail(message) {
    console.error(`code-bench: ${message}`);
    process.exit(2);
}

if (args.help) {
    console.log((await readFile(new URL(import.meta.url), "utf8")).split("\n").filter((line) => line.startsWith("//")).map((line) => line.slice(3)).join("\n"));
    process.exit(0);
}

const python = args.python ?? defaultPython();
const timeoutMs = Number(args.timeout);
const lang = args.lang.toUpperCase() === "EN" ? "EN" : "TR";
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) fail("--timeout is in milliseconds (at least 1000)");

let tasks = BENCH_TASKS;
if (args.only) {
    const ids = new Set(args.only.split(",").map((id) => id.trim()));
    tasks = tasks.filter((task) => ids.has(task.id));
    if (!tasks.length) fail(`no task matches --only ${args.only}`);
}
if (args.language) tasks = tasks.filter((task) => task.language === args.language);
if (tasks.some((task) => task.language === "python") && !pythonAvailable(python)) {
    console.warn(`code-bench: ${python} not found, Python tasks are skipped (set --python or $PYTHON)`);
    tasks = tasks.filter((task) => task.language !== "python");
}

if (args.compare) {
    const dir = path.resolve(args.out);
    const files = (await readdir(dir).catch(() => [])).filter((file) => file.endsWith(".json"));
    if (!files.length) fail(`no saved runs in ${dir}`);
    const runs = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(dir, file), "utf8"))));
    const report = comparisonReport(runs);
    const target = path.join(path.dirname(dir), "code-bench.md");
    await writeFile(target, report);
    console.log(report);
    console.log(`written to ${path.relative(process.cwd(), target)}`);
    process.exit(0);
}

if (args["self-check"]) {
    // The harness and the tests themselves: references pass, stubs (the right names, no logic) fail.
    let problems = 0;
    for (const mode of ["reference", "stub"]) {
        const checks = await Promise.all(tasks.map(async (task) => ({ task, result: await checkCode(task, fixtureCode(task, mode), { timeoutMs, python }) })));
        for (const { task, result } of checks) {
            const ok = mode === "reference" ? result.status === "pass" : result.status !== "pass";
            if (!ok) {
                problems += 1;
                console.log(`✘ ${mode} ${task.id}: ${result.status} ${result.detail}`);
            }
        }
        console.log(`${mode}: ${checks.filter(({ result }) => result.status === "pass").length}/${checks.length} pass`);
    }
    process.exit(problems ? 1 : 0);
}

async function makeEngine() {
    switch (args.engine) {
        case "mock":
            return mockEngine(args.mock);
        case "hanogt": {
            const key = process.env[args["api-key-env"] ?? "HANOGT_API_KEY"];
            if (!key) fail(`set ${args["api-key-env"] ?? "HANOGT_API_KEY"} to a Hanogt AI API key (hnk_…, from /ai/api)`);
            // Code mode, as the chat's Code button.
            return openAiEngine({ name: "hanogt-ai-api", baseUrl: args["base-url"] ?? "https://hanogtcodev.com/api/v1", apiKey: key, model: "hanogt-ai", extra: { mode: "code", language: lang } });
        }
        case "openai": {
            if (!args["base-url"] || !args.model) fail("--engine openai needs --base-url and --model");
            const key = args["api-key-env"] ? process.env[args["api-key-env"]] : undefined;
            if (args["api-key-env"] && !key) fail(`${args["api-key-env"]} is empty`);
            return openAiEngine({ baseUrl: args["base-url"], apiKey: key, model: args.model });
        }
        default:
            return fail("choose --engine hanogt | openai | mock, or --self-check / --compare");
    }
}

const engine = await makeEngine();
console.log(`code-bench: ${engine.name}, ${tasks.length} tasks, prompts in ${lang}`);
const started = Date.now();
const results = await runBench(tasks, engine, {
    lang,
    concurrency: Math.max(1, Number(args.concurrency) || 3),
    timeoutMs,
    python,
    onResult: (result) => console.log(`${result.status === "pass" ? "✔" : "✘"} ${result.id} ${result.status === "pass" ? "" : `${result.status} ${result.detail ?? ""}`}`.trimEnd()),
});
const run = { engine: engine.name, lang, date: new Date().toISOString(), timeoutMs, durationMs: Date.now() - started, summary: summarize(results), results };
console.log(`\n${markdownReport(run)}`);

if (!args["no-save"] && args.engine !== "mock") {
    const dir = path.resolve(args.out);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${run.date.replace(/[:.]/g, "-")}-${engine.name.replace(/[^\w.-]+/g, "_")}-${lang}.json`);
    await writeFile(file, `${JSON.stringify(run, null, 2)}\n`);
    console.log(`saved ${path.relative(process.cwd(), file)} (compare runs with --compare)`);
}
