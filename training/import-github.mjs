#!/usr/bin/env node
// Imports the GitHub sources of training/sources.json into training samples
// (training/lib/common.mjs describes the schema):
//
//   • Exercism language tracks (MIT): every practice and concept exercise's
//     instructions with its reference solution, and every concept document as
//     an explanation. Python and JavaScript solutions are run against the
//     exercise's own tests here; the other tracks' solutions are checked by
//     the track's CI ("upstream-ci").
//   • TheAlgorithms/Python (MIT): standard-library modules whose doctests pass here.
//   • GSM8K (MIT): the train split's word problems with their human-written
//     step-by-step solutions (the steps become the model's thinking in 70%).
//   • HumanEval and GSM8K's test split are evaluation sets: only their
//     fingerprints are written, so no training sample may contain them.
//
// Repositories are shallow-cloned into training/cache/github and their
// license file is checked against the registry before anything is read.
//
//   node training/import-github.mjs [--only exercism-python,gsm8k-train] [--no-verify] [--concurrency 4]
//
// Writes training/data/github/<source id>.jsonl for each source,
// fingerprints.json and manifest.json.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify, parseArgs } from "node:util";
import zlib from "node:zlib";
import { approxTokens, invalidSample, sampleChars, sampleLine, unitHash } from "./lib/common.mjs";

const execute = promisify(execFile);
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const JEST_LITE = fileURLToPath(new URL("./lib/jest-lite.mjs", import.meta.url));

/** Markdown fence names for track slugs that differ from the slug. */
const FENCES = {
    "arm64-assembly": "asm",
    "x86-64-assembly": "nasm",
    wasm: "wat",
    "emacs-lisp": "elisp",
    "common-lisp": "lisp",
    vimscript: "vim",
    perl5: "perl",
    "objective-c": "objectivec",
    sqlite: "sql",
    lfe: "lisp",
    sml: "sml",
    delphi: "pascal",
};
const TR_SHARE = 0.45;
const LIMITS = { doc: 8000, stub: 3000, solution: 12000, concept: 12000 };

async function pool(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await worker(items[index], index);
        }
    }));
    return results;
}

async function readText(file) {
    try {
        return await readFile(file, "utf8");
    } catch {
        return null;
    }
}

async function readJson(file) {
    const text = await readText(file);
    if (text === null) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

const isDir = async (dir) => {
    try {
        return (await stat(dir)).isDirectory();
    } catch {
        return false;
    }
};

// ---------------------------------------------------------------- repositories

async function clone(repo, cacheDir) {
    const dir = path.join(cacheDir, repo.replace("/", "__"));
    if (!existsSync(path.join(dir, ".git"))) {
        await mkdir(cacheDir, { recursive: true });
        await execute("git", ["clone", "--depth", "1", "--quiet", `https://github.com/${repo}.git`, dir], { timeout: 600_000, maxBuffer: 1 << 24 });
    }
    const { stdout } = await execute("git", ["-C", dir, "rev-parse", "HEAD"]);
    return { dir, commit: stdout.trim() };
}

/** The license the repository's license file states ("MIT", "Apache-2.0", …) or null. */
export async function detectLicense(dir) {
    const names = (await readdir(dir)).filter((name) => /^(?:LICEN[CS]E|COPYING)(?:\.md|\.txt)?$/i.test(name));
    for (const name of names) {
        const text = (await readText(path.join(dir, name))) ?? "";
        if (/Permission is hereby granted, free of charge/i.test(text)) return "MIT";
        if (/Apache License,?\s+Version 2\.0/i.test(text)) return "Apache-2.0";
        if (/Redistribution and use in source and binary forms/i.test(text)) return /Neither the name/i.test(text) ? "BSD-3-Clause" : "BSD-2-Clause";
        if (/GNU GENERAL PUBLIC LICENSE/i.test(text)) return "GPL";
    }
    return null;
}

// ---------------------------------------------------------------- exercism

/** Exercism docs without platform-only markup: admonition fences, HTML comments, extra blank lines. */
export function cleanDoc(text) {
    return String(text ?? "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/^~~~~exercism\/[\w-]+\s*$/gm, "")
        .replace(/^~~~~\s*$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

const fenceFor = (track) => FENCES[track] ?? track;
const block = (fence, code) => `\`\`\`${fence}\n${code.replace(/\s+$/, "")}\n\`\`\``;

const PRACTICE_FORMS = {
    EN: ["Solve this exercise in {language}.", "Write a {language} solution for the following problem.", "Can you implement this in {language}?"],
    TR: ["Bu alıştırmayı {language} ile çöz.", "Aşağıdaki problem için {language} ile bir çözüm yazar mısın?", "Şunu {language} ile uygular mısın?"],
};
const CONCEPT_FORMS = {
    EN: ["Explain {name} in {language}.", "How does {name} work in {language}?"],
    TR: ["{language} dilinde {name} konusunu açıklar mısın?", "{language} dilinde {name} nasıl çalışır?"],
};
const pickForm = (forms, key) => forms[Math.floor(unitHash(`form:${key}`) * forms.length)];
const langOf = (key) => (unitHash(`lang:${key}`) < TR_SHARE ? "TR" : "EN");

/** One exercise of a track, or null with the reason it was skipped. */
async function readExercise(trackDir, kind, slug) {
    const dir = path.join(trackDir, "exercises", kind, slug);
    const meta = await readJson(path.join(dir, ".meta", "config.json"));
    if (!meta?.files) return { skip: "no_config" };
    const solutionFiles = meta.files.example ?? meta.files.exemplar ?? [];
    if (!solutionFiles.length) return { skip: "no_solution" };
    const docs = [];
    for (const name of kind === "concept" ? ["introduction.md", "instructions.md"] : ["introduction.md", "instructions.md", "instructions.append.md"]) {
        const text = await readText(path.join(dir, ".docs", name));
        if (text) docs.push(cleanDoc(text));
    }
    const doc = docs.filter(Boolean).join("\n\n");
    if (!doc) return { skip: "no_docs" };
    if (doc.length > LIMITS.doc) return { skip: "too_long" };
    const solutions = [];
    for (const [index, file] of solutionFiles.entries()) {
        const code = await readText(path.join(dir, file));
        if (code === null) return { skip: "missing_solution" };
        // Name the file as the student's solution file when the lists line up.
        const name = meta.files.solution?.[index] ?? path.basename(file);
        solutions.push({ name, code });
    }
    if (solutions.reduce((sum, item) => sum + item.code.length, 0) > LIMITS.solution) return { skip: "too_long" };
    let stub = null;
    const stubName = meta.files.solution?.[0];
    if (stubName) {
        const code = await readText(path.join(dir, stubName));
        if (code && code.trim() && code.length <= LIMITS.stub && code.trim() !== solutions[0].code.trim()) stub = { name: stubName, code };
    }
    return { dir, slug, kind, doc, solutions, stub, tests: meta.files.test ?? [], blurb: meta.blurb ?? "" };
}

function exerciseSample(track, language, exercise) {
    const id = `exercism:${track}:${exercise.kind}:${exercise.slug}`;
    const lang = langOf(id);
    const fence = fenceFor(track);
    const ask = pickForm(PRACTICE_FORMS[lang], id).replaceAll("{language}", language);
    const start = exercise.stub
        ? `\n\n${lang === "TR" ? "Şu dosyadan başla" : "Start from this file"} (\`${exercise.stub.name}\`):\n${block(fence, exercise.stub.code)}`
        : "";
    const intro = lang === "TR" ? `${language} ile bir çözüm:` : `Here's a ${language} solution:`;
    const files = exercise.solutions.length === 1
        ? block(fence, exercise.solutions[0].code)
        : exercise.solutions.map((file) => `\`${file.name}\`:\n${block(fence, file.code)}`).join("\n\n");
    return {
        id,
        group: `exercism:${exercise.slug}`,
        source: `exercism-${track}`,
        license: "MIT",
        lang,
        family: "code-solve",
        verified: "upstream-ci",
        messages: [
            { role: "user", content: `${ask}\n\n${exercise.doc}${start}` },
            { role: "assistant", content: `${intro}\n\n${files}` },
        ],
    };
}

async function conceptDocs(trackDir, track, language, concepts) {
    const samples = [];
    const skipped = {};
    for (const concept of concepts ?? []) {
        const about = await readText(path.join(trackDir, "concepts", concept.slug, "about.md"));
        if (!about) {
            skipped.no_about = (skipped.no_about ?? 0) + 1;
            continue;
        }
        const text = cleanDoc(about);
        if (text.length < 200 || text.length > LIMITS.concept) {
            skipped.length = (skipped.length ?? 0) + 1;
            continue;
        }
        const id = `exercism:${track}:about:${concept.slug}`;
        const lang = langOf(id);
        const name = String(concept.name ?? concept.slug).trim();
        samples.push({
            id,
            group: `exercism-concept:${track}:${concept.slug}`,
            source: `exercism-${track}`,
            license: "MIT",
            lang,
            family: "code-explain",
            verified: "human",
            messages: [
                { role: "user", content: pickForm(CONCEPT_FORMS[lang], id).replaceAll("{language}", language).replaceAll("{name}", name) },
                { role: "assistant", content: text },
            ],
        });
    }
    return { samples, skipped };
}

// ---------------------------------------------------------------- verification

/** A copy of the exercise with the reference solution in the student's file, in a temporary directory. */
async function stage(exercise) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hanogt-ex-"));
    await cp(exercise.dir, dir, { recursive: true, filter: (source) => !/[/\\](?:\.meta|\.docs|node_modules)(?:[/\\]|$)/.test(source.slice(exercise.dir.length)) });
    for (const solution of exercise.solutions) {
        await mkdir(path.dirname(path.join(dir, solution.name)), { recursive: true });
        await writeFile(path.join(dir, solution.name), solution.code);
    }
    return dir;
}

let pythonRunner = null;
async function pythonTestCommand() {
    if (pythonRunner) return pythonRunner;
    try {
        await execute("python3", ["-c", "import pytest"]);
        pythonRunner = ["-m", "pytest", "-q", "-x", "-p", "no:cacheprovider"];
    } catch {
        pythonRunner = ["-m", "unittest", "discover", "-p", "*_test.py"];
    }
    return pythonRunner;
}

async function verifyPython(exercise) {
    const dir = await stage(exercise);
    try {
        await execute("python3", await pythonTestCommand(), { cwd: dir, timeout: 30_000, maxBuffer: 1 << 22 });
        return true;
    } catch {
        return false;
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

/** Adds ".js" to relative imports without an extension (Exercism's tests rely on Babel's resolution). */
export function withExtensions(source) {
    return source.replace(/(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+?)\2/g, (match, keyword, quote, specifier) => (/\.[cm]?[jt]s$|\.json$/.test(specifier) ? match : `${keyword}${quote}${specifier}.js${quote}`));
}

async function verifyJavaScript(exercise) {
    if (!exercise.tests.length) return false;
    const dir = await stage(exercise);
    try {
        for (const test of exercise.tests) {
            const file = path.join(dir, test);
            await writeFile(file, withExtensions(await readFile(file, "utf8")));
        }
        for (const solution of exercise.solutions) {
            const file = path.join(dir, solution.name);
            await writeFile(file, withExtensions(await readFile(file, "utf8")));
        }
        await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
        // The tests import their globals from @jest/globals: point it at the harness's.
        const globals = path.join(dir, "node_modules", "@jest", "globals");
        await mkdir(globals, { recursive: true });
        await writeFile(path.join(globals, "package.json"), JSON.stringify({ name: "@jest/globals", type: "module", exports: "./index.js" }));
        await writeFile(path.join(globals, "index.js"), "export const { describe, xdescribe, test, it, xtest, xit, expect, beforeEach, afterEach, beforeAll, afterAll } = globalThis;\nexport const jest = globalThis.jest;\n");
        const imports = exercise.tests.map((test) => `await import(${JSON.stringify(`./${test}`)});`).join("\n");
        await writeFile(path.join(dir, "__runner.mjs"), `import { install, run } from ${JSON.stringify(JEST_LITE)};\ninstall();\n${imports}\nconst result = await run();\nprocess.stdout.write(JSON.stringify(result));\nprocess.exit(result.failed || !result.passed ? 1 : 0);\n`);
        await execute(process.execPath, ["__runner.mjs"], { cwd: dir, timeout: 30_000, maxBuffer: 1 << 22 });
        return true;
    } catch {
        return false;
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const VERIFIERS = { python: verifyPython, javascript: verifyJavaScript };

// ---------------------------------------------------------------- per source

async function importExercismTrack(source, dir, options) {
    const track = source.repo.split("/")[1];
    const config = (await readJson(path.join(dir, "config.json"))) ?? {};
    const language = String(config.language ?? track);
    const samples = [];
    const skipped = {};
    const verification = { executed: 0, failed: 0, notRun: 0 };
    const count = (reason) => {
        skipped[reason] = (skipped[reason] ?? 0) + 1;
    };
    const exercises = [];
    for (const kind of ["practice", "concept"]) {
        const listed = new Map((config.exercises?.[kind] ?? []).map((item) => [item.slug, item]));
        const base = path.join(dir, "exercises", kind);
        if (!(await isDir(base))) continue;
        for (const slug of (await readdir(base)).sort()) {
            if (listed.get(slug)?.status === "deprecated") {
                count("deprecated");
                continue;
            }
            const exercise = await readExercise(dir, kind, slug);
            if (exercise.skip) count(exercise.skip);
            else exercises.push(exercise);
        }
    }
    const verify = options.verify ? VERIFIERS[track] : null;
    const results = await pool(exercises, options.concurrency, async (exercise) => (verify ? verify(exercise) : null));
    exercises.forEach((exercise, index) => {
        const sample = exerciseSample(track, language, exercise);
        if (results[index] === true) {
            sample.verified = "executed";
            verification.executed += 1;
        } else if (results[index] === false) {
            verification.failed += 1;
            // A reference solution that fails its own tests here is left out rather than trusted.
            count("failed_here");
            return;
        } else verification.notRun += 1;
        samples.push(sample);
    });
    const concepts = await conceptDocs(dir, track, language, config.concepts);
    samples.push(...concepts.samples);
    for (const [reason, value] of Object.entries(concepts.skipped)) skipped[`concept_${reason}`] = value;
    return { samples, skipped, verification };
}

const ALGORITHM_FORMS = {
    EN: ["Implement {title} in Python.", "Write a Python implementation of {title}, with doctests."],
    TR: ["Python ile {title} uygular mısın?", "{title} için doctest'leri olan bir Python uygulaması yazar mısın?"],
};

async function importTheAlgorithms(source, dir) {
    const { stdout } = await execute("python3", [path.join(ROOT, "training/lib/thealgorithms.py"), dir], { timeout: 1_800_000, maxBuffer: 1 << 28 });
    const samples = [];
    const skipped = {};
    const verification = { executed: 0, failed: 0, notRun: 0 };
    for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        const item = JSON.parse(line);
        if (!item.ok) {
            verification.failed += 1;
            skipped.doctest_failed = (skipped.doctest_failed ?? 0) + 1;
            continue;
        }
        verification.executed += 1;
        const id = `thealgorithms:${item.path}`;
        const lang = langOf(id);
        const ask = pickForm(ALGORITHM_FORMS[lang], id).replaceAll("{title}", item.title);
        samples.push({
            id,
            group: id,
            source: source.id,
            license: "MIT",
            lang,
            family: "code-algorithm",
            verified: "doctest",
            messages: [
                { role: "user", content: `${ask}\n\n${item.description}` },
                { role: "assistant", content: `${lang === "TR" ? `Doctest'leriyle birlikte bir uygulama (${item.category}):` : `Here's an implementation with doctests (${item.category}):`}\n\n${block("python", item.code)}` },
            ],
        });
    }
    return { samples, skipped, verification };
}

/** GSM8K's solution: calculator annotations removed, steps and the final number apart. */
export function parseGsm8kAnswer(answer) {
    const [work, final] = String(answer).split(/\n?####\s*/);
    const steps = work.replace(/<<[^>]*>>/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
    return { steps, final: String(final ?? "").trim() };
}

async function importGsm8k(source, dir) {
    const text = await readText(path.join(dir, "grade_school_math/data/train.jsonl"));
    if (!text) throw new Error("grade_school_math/data/train.jsonl is missing");
    const samples = [];
    const skipped = {};
    text.split("\n").filter(Boolean).forEach((line, index) => {
        const { question, answer } = JSON.parse(line);
        const { steps, final } = parseGsm8kAnswer(answer);
        if (!steps.length || !final) {
            skipped.unparsed = (skipped.unparsed ?? 0) + 1;
            return;
        }
        const id = `gsm8k:train:${index}`;
        const thinking = unitHash(`think:${id}`) < 0.7;
        const last = steps[steps.length - 1];
        const assistant = thinking
            ? { role: "assistant", content: `${last}\n\n**Answer: ${final}**`, reasoning_content: steps.join("\n") }
            : { role: "assistant", content: `${steps.join("\n")}\n\n**Answer: ${final}**` };
        samples.push({ id, group: id, source: source.id, license: "MIT", lang: "EN", family: "math-reasoning", verified: "human", messages: [{ role: "user", content: question.trim() }, assistant] });
    });
    return { samples, skipped, verification: null };
}

/** Evaluation sets: function names and prompts of HumanEval, questions of GSM8K's test split. */
async function evaluationFingerprints(dirs) {
    const names = new Set();
    const texts = [];
    if (dirs["human-eval"]) {
        const raw = await readFile(path.join(dirs["human-eval"], "data/HumanEval.jsonl.gz"));
        for (const line of zlib.gunzipSync(raw).toString("utf8").split("\n")) {
            if (!line.trim()) continue;
            const task = JSON.parse(line);
            names.add(task.entry_point);
            texts.push(task.prompt);
        }
    }
    if (dirs["gsm8k-train"]) {
        const test = await readText(path.join(dirs["gsm8k-train"], "grade_school_math/data/test.jsonl"));
        for (const line of (test ?? "").split("\n")) if (line.trim()) texts.push(JSON.parse(line).question);
    }
    return { names: [...names].sort(), texts };
}

// ---------------------------------------------------------------- main

function summarize(samples) {
    const by = (key) => samples.reduce((totals, sample) => ({ ...totals, [sample[key]]: (totals[sample[key]] ?? 0) + 1 }), {});
    const chars = samples.reduce((sum, sample) => sum + sampleChars(sample), 0);
    return { samples: samples.length, byLanguage: by("lang"), byFamily: by("family"), byVerified: by("verified"), approxTokens: approxTokens(chars) };
}

export async function main(argv = process.argv.slice(2)) {
    const { values } = parseArgs({
        args: argv,
        options: {
            only: { type: "string" },
            cache: { type: "string", default: "training/cache/github" },
            out: { type: "string", default: "training/data/github" },
            concurrency: { type: "string", default: String(Math.max(1, Math.min(4, os.cpus().length))) },
            "no-verify": { type: "boolean", default: false },
        },
    });
    const registry = JSON.parse(await readFile(path.join(ROOT, "training/sources.json"), "utf8"));
    const only = values.only ? new Set(values.only.split(",").map((item) => item.trim())) : null;
    const sources = registry.sources.filter((source) => source.kind === "github" && source.status === "allowed" && (!only || only.has(source.id)));
    const cacheDir = path.resolve(ROOT, values.cache);
    const outDir = path.resolve(ROOT, values.out);
    await mkdir(outDir, { recursive: true });
    const options = { verify: !values["no-verify"], concurrency: Number(values.concurrency) };

    const cloned = await pool(sources, 6, async (source) => {
        try {
            const { dir, commit } = await clone(source.repo, cacheDir);
            const found = await detectLicense(dir);
            return { source, dir, commit, license: { expected: source.license, found, ok: found === source.license } };
        } catch (error) {
            return { source, error: String(error?.message ?? error).slice(0, 300) };
        }
    });

    // A run with --only rewrites only its own sources: the manifest keeps the others.
    const previous = (await readJson(path.join(outDir, "manifest.json"))) ?? { sources: {} };
    const manifest = { built: new Date().toISOString(), sources: { ...previous.sources } };
    const dirs = {};
    for (const entry of cloned) {
        const { source } = entry;
        const record = { repo: source.repo, commit: entry.commit ?? null, license: entry.license ?? null };
        manifest.sources[source.id] = record;
        if (entry.error) {
            record.error = entry.error;
            console.warn(`✗ ${source.id}: ${entry.error}`);
            continue;
        }
        if (!entry.license.ok) {
            record.error = `license file says ${entry.license.found ?? "nothing recognizable"}, registry says ${source.license}`;
            console.warn(`✗ ${source.id}: ${record.error}`);
            continue;
        }
        dirs[source.id] = entry.dir;
        if (source.role === "evaluation" || source.role === "metadata") continue;
        let result;
        if (source.id.startsWith("exercism-")) result = await importExercismTrack(source, entry.dir, options);
        else if (source.id === "thealgorithms-python") result = await importTheAlgorithms(source, entry.dir);
        else if (source.id === "gsm8k-train") result = await importGsm8k(source, entry.dir);
        else continue;
        const valid = [];
        for (const sample of result.samples) {
            const problem = invalidSample(sample);
            if (problem) result.skipped[`invalid_${problem}`] = (result.skipped[`invalid_${problem}`] ?? 0) + 1;
            else valid.push(sample);
        }
        Object.assign(record, summarize(valid), { skipped: result.skipped, verification: result.verification });
        await writeFile(path.join(outDir, `${source.id}.jsonl`), valid.length ? `${valid.map(sampleLine).join("\n")}\n` : "");
        console.log(`✓ ${source.id}: ${valid.length} samples${result.verification ? ` (run here: ${result.verification.executed}, failed: ${result.verification.failed})` : ""}`);
    }

    if (dirs["human-eval"] || dirs["gsm8k-train"]) {
        const fingerprints = await evaluationFingerprints({ "human-eval": dirs["human-eval"], "gsm8k-train": dirs["gsm8k-train"] });
        await writeFile(path.join(outDir, "fingerprints.json"), `${JSON.stringify(fingerprints)}\n`);
        manifest.fingerprints = { names: fingerprints.names.length, texts: fingerprints.texts.length };
    } else manifest.fingerprints = previous.fingerprints ?? null;
    const totals = { samples: 0, approxTokens: 0, byLanguage: {}, byFamily: {}, byVerified: {} };
    for (const record of Object.values(manifest.sources)) {
        if (!record.samples) continue;
        totals.samples += record.samples;
        totals.approxTokens += record.approxTokens;
        for (const key of ["byLanguage", "byFamily", "byVerified"]) for (const [name, value] of Object.entries(record[key] ?? {})) totals[key][name] = (totals[key][name] ?? 0) + value;
    }
    manifest.totals = totals;
    await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify(totals, null, 2));
    return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
