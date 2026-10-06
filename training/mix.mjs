#!/usr/bin/env node
// Builds the Hanogt AI fine-tuning set v2 from every source:
//
//   1. this site's own samples (training/build-dataset.mjs), production's system prompt included;
//   2. the GitHub sources (training/import-github.mjs → training/data/github);
//   3. the Hugging Face sources, when imported (training/import_hf.py → training/data/hf).
//
// Every sample is normalized (thinking moved to the last assistant message's
// reasoning_content, as Qwen3's chat template expects), its language checked
// (Turkish, English, German, Azerbaijani and Russian) and, for imported data, filtered: personal data,
// another model's identity, refusals, length. Benchmarks are kept out
// (code-bench, HumanEval, GSM8K's test split). Exact duplicates go, and so do
// near-duplicate answers of imported data (MinHash). Each source is capped as
// training/sources.json says. Half of the imported samples get a short
// Hanogt AI system prompt. The split is by group, so the variants of one item
// never fall on both sides.
//
//   node training/mix.mjs [--out training/data/v2] [--max-chars 24000] [--seed 20261005]
//
// Writes train.jsonl, eval.jsonl, manifest.json, ATTRIBUTION.md and README.md
// (the dataset card) into --out.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
    approxTokens,
    claimsOtherIdentity,
    createFingerprints,
    createNearDuplicateIndex,
    detectLanguage,
    exactKey,
    invalidSample,
    LANGS,
    looksLikeRefusal,
    minhash,
    personalData,
    sampleChars,
    sampleLine,
    splitReasoning,
    unitHash,
} from "./lib/common.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const TARGET_SAMPLES = 140_000;
const CODE_FAMILIES = new Set(["code-solve", "code-explain", "code-algorithm", "math-reasoning"]);
const SITE_LICENSE = "Proprietary (Hanogt Codev)";

export const IDENTITY_PROMPT = {
    TR: "Sen Hanogt AI'sın: Hanogt Codev'in yapay zekâ asistanısın. Kullanıcının dilinde net, doğru ve yardımsever yanıt ver.",
    EN: "You are Hanogt AI, the AI assistant of Hanogt Codev. Answer clearly, accurately and helpfully in the user's language.",
    DE: "Du bist Hanogt AI, der KI-Assistent von Hanogt Codev. Antworte klar, korrekt und hilfsbereit in der Sprache der Person, die fragt.",
    AZ: "Sən Hanogt AI-san: Hanogt Codev-in süni intellekt köməkçisisən. İstifadəçinin dilində aydın, düzgün və faydalı cavab ver.",
    RU: "Ты — Hanogt AI, ИИ-ассистент Hanogt Codev. Отвечай ясно, точно и полезно на языке пользователя.",
};

/** A benchmark's function name counts only when it's distinctive enough not to hit ordinary code (is_prime, add…). */
export const distinctiveName = (name) => name.length >= 10 && (/_/.test(name) || /[a-z][A-Z]/.test(name));

async function readJsonl(file) {
    const text = await readFile(file, "utf8");
    const samples = [];
    for (const line of text.split("\n")) if (line.trim()) samples.push(JSON.parse(line));
    return samples;
}

async function jsonlFiles(dir) {
    if (!existsSync(dir)) return [];
    return (await readdir(dir)).filter((name) => name.endsWith(".jsonl")).sort().map((name) => path.join(dir, name));
}

/** The site's own samples (build-dataset.mjs) in the v2 schema. */
export async function siteSamples(seed) {
    const { buildDataset } = await import("./build-dataset.mjs");
    const { samples } = await buildDataset({ seed });
    return samples.map((sample) => ({
        id: `site:${sample.id}`,
        group: `site:${sample.group}`,
        source: "hanogt-site",
        license: SITE_LICENSE,
        lang: sample.lang,
        family: sample.source === "agent" || sample.source === "agent-off" ? "agent" : "site",
        verified: "knowledge",
        messages: sample.messages,
        ...(sample.tools ? { tools: sample.tools } : {}),
    }));
}

/**
 * Thinking in the place Qwen3's template reads it: reasoning_content of the
 * last assistant message (earlier turns' thinking is dropped, as the template
 * drops it). <think>-style blocks inside content are moved there.
 */
export function normalizeSample(sample) {
    const messages = sample.messages.map((message) => {
        const copy = { ...message, content: String(message.content ?? "").trim() };
        if (copy.role === "assistant") {
            const { reasoning, answer } = splitReasoning(copy.content);
            if (reasoning) {
                copy.content = answer;
                copy.reasoning_content = copy.reasoning_content ? `${copy.reasoning_content}\n${reasoning}` : reasoning;
            }
        } else delete copy.reasoning_content;
        return copy;
    });
    const last = messages.length - 1;
    messages.forEach((message, index) => {
        if (message.role !== "assistant") return;
        if (index !== last || !String(message.reasoning_content ?? "").trim()) delete message.reasoning_content;
        else message.reasoning_content = message.reasoning_content.trim();
    });
    return { ...sample, messages };
}

const finalAnswer = (sample) => sample.messages[sample.messages.length - 1]?.content ?? "";
const userText = (sample) => sample.messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
const allText = (sample) => sample.messages.map((message) => `${message.content}\n${message.reasoning_content ?? ""}`).join("\n");

/**
 * Fingerprints of every evaluation set. Our code-bench's function names are
 * checked strictly in the site's own data (as in v1) and, when distinctive,
 * in imported data; HumanEval and GSM8K are matched by their prompts only
 * (their function names — is_prime, add, fib… — are everyday names).
 */
export async function loadFingerprints(githubDir) {
    const { benchFingerprints } = await import("./build-dataset.mjs");
    const bench = await benchFingerprints();
    const strict = createFingerprints();
    const loose = createFingerprints();
    for (const name of bench.names) {
        strict.addName(name);
        if (distinctiveName(name)) loose.addName(name);
    }
    const file = path.join(githubDir, "fingerprints.json");
    const external = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : { names: [], texts: [] };
    for (const text of external.texts) {
        strict.addText(text);
        loose.addText(text);
    }
    return {
        site: (text) => strict.touches(text) || touchesShingles(text, bench.shingles),
        imported: (text) => loose.touches(text) || touchesShingles(text, bench.shingles),
        size: { names: strict.size.names, runs: strict.size.runs + bench.shingles.size },
    };
}

function touchesShingles(text, set) {
    const words = String(text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    for (let index = 0; index + 8 <= words.length; index += 1) if (set.has(words.slice(index, index + 8).join(" "))) return true;
    return false;
}

/**
 * The mixing itself, over samples in priority order (site, then verified
 * GitHub sources, then Hugging Face). Returns the kept samples and what was
 * dropped, per reason and per source.
 */
export function mixSamples(samples, { registry, fingerprints, maxChars = 24_000 }) {
    const caps = new Map(registry.sources.map((source) => [source.id, source.cap ?? null]));
    const dropped = {};
    const droppedBySource = {};
    const drop = (sample, reason) => {
        dropped[reason] = (dropped[reason] ?? 0) + 1;
        const bySource = (droppedBySource[sample.source] ??= {});
        bySource[reason] = (bySource[reason] ?? 0) + 1;
    };
    const exact = new Set();
    const near = createNearDuplicateIndex(0.9);
    const kept = [];
    for (const raw of samples) {
        const sample = normalizeSample(raw);
        const site = sample.source === "hanogt-site";
        if (!LANGS.includes(sample.lang)) sample.lang = detectLanguage(`${userText(sample)}\n${finalAnswer(sample)}`);
        const problem = invalidSample(sample);
        if (problem) {
            drop(sample, `invalid_${problem}`);
            continue;
        }
        if (!site) {
            const pii = personalData(allText(sample), { cards: !CODE_FAMILIES.has(sample.family) });
            if (pii) {
                drop(sample, `pii_${pii}`);
                continue;
            }
            if (sample.messages.some((message) => message.role === "assistant" && claimsOtherIdentity(`${message.content}\n${message.reasoning_content ?? ""}`))) {
                drop(sample, "identity");
                continue;
            }
            if (looksLikeRefusal(finalAnswer(sample))) {
                drop(sample, "refusal");
                continue;
            }
        }
        if (sampleChars(sample) > maxChars) {
            drop(sample, "too_long");
            continue;
        }
        const said = sample.messages.filter((message) => message.role !== "system").map((message) => `${message.content} ${JSON.stringify(message.tool_calls ?? "")}`).join("\n");
        if (site ? fingerprints.site(said) : fingerprints.imported(said)) {
            drop(sample, "benchmark");
            continue;
        }
        const key = exactKey(sample);
        if (exact.has(key)) {
            drop(sample, "duplicate");
            continue;
        }
        exact.add(key);
        // The site teaches several phrasings of one answer on purpose; imported answers must differ.
        if (!site && near.seen(minhash(finalAnswer(sample), 2000))) {
            drop(sample, "near_duplicate");
            continue;
        }
        kept.push(sample);
    }
    // Caps: a stable, order-independent subset of each capped source.
    const bySource = new Map();
    for (const sample of kept) {
        const list = bySource.get(sample.source);
        if (list) list.push(sample);
        else bySource.set(sample.source, [sample]);
    }
    const capped = [];
    for (const [source, list] of bySource) {
        const cap = caps.get(source);
        if (!cap || list.length <= cap) {
            capped.push(...list);
            continue;
        }
        const chosen = new Set([...list].sort((a, b) => unitHash(`cap:${a.id}`) - unitHash(`cap:${b.id}`)).slice(0, cap).map((sample) => sample.id));
        for (const sample of list) {
            if (chosen.has(sample.id)) capped.push(sample);
            else drop(sample, "cap");
        }
    }
    // Half of the imported samples (those without their own system prompt) learn who they are.
    for (const sample of capped) {
        if (sample.source === "hanogt-site" || sample.messages[0].role === "system") continue;
        if (unitHash(`system:${sample.id}`) < 0.5) sample.messages = [{ role: "system", content: IDENTITY_PROMPT[sample.lang] }, ...sample.messages];
    }
    return { samples: capped, dropped, droppedBySource };
}

/** Split by group: 5% of the site's groups and 1% of the others go to evaluation. */
export function splitByGroup(samples) {
    const train = [];
    const evaluation = [];
    for (const sample of samples) {
        const share = sample.family === "site" || sample.family === "agent" ? 0.05 : 0.01;
        (unitHash(`split:${sample.group}`) < share ? evaluation : train).push(sample);
    }
    return { train, evaluation };
}

export function describe(samples) {
    const by = (pick) => samples.reduce((totals, sample) => {
        const key = pick(sample);
        totals[key] = (totals[key] ?? 0) + 1;
        return totals;
    }, {});
    const chars = samples.reduce((sum, sample) => sum + sampleChars(sample), 0);
    return {
        samples: samples.length,
        bySource: by((sample) => sample.source),
        byLanguage: by((sample) => sample.lang),
        byFamily: by((sample) => sample.family),
        byVerified: by((sample) => sample.verified),
        withThinking: samples.filter((sample) => sample.messages[sample.messages.length - 1].reasoning_content).length,
        multiTurn: samples.filter((sample) => sample.messages.filter((message) => message.role === "user").length > 1).length,
        approxTokens: approxTokens(chars),
    };
}

function attribution(registry, counts) {
    const lines = [
        "# Hanogt SFT v2 — sources and attribution",
        "",
        "Every sample keeps its `source` and `license` fields. Sources and their licenses (training/sources.json):",
        "",
        "| Source | License | Samples | Attribution |",
        "|---|---|---:|---|",
    ];
    for (const source of registry.sources) {
        const count = counts[source.id] ?? 0;
        if (!count) continue;
        lines.push(`| \`${source.id}\` | ${source.license} | ${count.toLocaleString("en-US")} | ${source.attribution ?? "Hanogt Codev's own content"} |`);
    }
    lines.push("", "Exercism, The Algorithms and GSM8K are used under the MIT License; their copyright notices are kept in the source repositories listed above. Datasets under CC BY 4.0 and ODC-BY require this attribution to travel with the data.", "");
    return lines.join("\n");
}

function datasetCard(summary, registry) {
    const total = summary.train.samples + summary.eval.samples;
    const size = total < 10_000 ? "1K<n<10K" : total < 100_000 ? "10K<n<100K" : "100K<n<1M";
    const rows = Object.entries(summary.all.bySource).sort((a, b) => b[1] - a[1]).map(([source, count]) => {
        const entry = registry.sources.find((item) => item.id === source);
        return `| \`${source}\` | ${entry?.license ?? "?"} | ${count.toLocaleString("en-US")} |`;
    });
    return `---
license: other
license_name: mixed
license_link: ATTRIBUTION.md
language:
- tr
- en
- de
- az
- ru
task_categories:
- text-generation
size_categories:
- ${size}
tags:
- sft
- code
- turkish
- reasoning
---

# Hanogt SFT v2

Supervised fine-tuning data for Hanogt AI, the assistant of Hanogt Codev. Chat samples in Turkish, English, German, Azerbaijani and Russian: the site's own knowledge and agent actions, verified code solutions in ${Object.keys(summary.all.bySource).filter((source) => source.startsWith("exercism-")).length} programming languages, algorithms, step-by-step math and, when imported, open conversation datasets.

- Samples: **${total.toLocaleString("en-US")}** (train ${summary.train.samples.toLocaleString("en-US")}, eval ${summary.eval.samples.toLocaleString("en-US")}), about ${(summary.all.approxTokens / 1e6).toFixed(1)} million tokens.
- With thinking (\`reasoning_content\`): ${summary.all.withThinking.toLocaleString("en-US")}; multi-turn: ${summary.all.multiTurn.toLocaleString("en-US")}.
- Languages: ${Object.entries(summary.all.byLanguage).map(([lang, count]) => `${lang} ${count.toLocaleString("en-US")}`).join(", ")}.

| Source | License | Samples |
|---|---|---:|
${rows.join("\n")}

Each line has \`messages\` (OpenAI chat format; the last assistant message may carry \`reasoning_content\`, which Qwen3's chat template renders as a \`<think>\` block), and \`id\`, \`group\`, \`source\`, \`license\`, \`lang\`, \`family\`, \`verified\`. Licenses and attribution: ATTRIBUTION.md. Filters, duplicates and benchmark checks: manifest.json.
`;
}

const number = (value) => Number(value ?? 0).toLocaleString("en-US");
const table = (rows, head) => [`| ${head.join(" | ")} |`, `|${head.map((_, index) => (index === head.length - 1 ? "---:" : "---")).join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");

/** The committed summary of a build (the data itself stays out of the repository). */
function report(manifest, registry) {
    const all = manifest.all;
    const license = (id) => registry.sources.find((source) => source.id === id)?.license ?? "?";
    const exercism = Object.entries(all.bySource).filter(([id]) => id.startsWith("exercism-"));
    const sources = [
        ...Object.entries(all.bySource).filter(([id]) => !id.startsWith("exercism-")).map(([id, count]) => [`\`${id}\``, license(id), number(count)]),
        ...(exercism.length ? [[`Exercism (${exercism.length} languages)`, "MIT", number(exercism.reduce((sum, [, count]) => sum + count, 0))]] : []),
    ].sort((a, b) => Number(b[2].replace(/,/g, "")) - Number(a[2].replace(/,/g, "")));
    const pending = registry.sources.filter((source) => source.kind === "hf" && source.status !== "excluded" && !all.bySource[source.id]);
    return `# Hanogt SFT v2: dataset build

Built ${manifest.built.slice(0, 10)} by \`node training/mix.mjs\` (seed ${manifest.seed}). The data stays out of the repository (\`training/data/v2\`); this report and \`training/sources.json\` describe it.

## Size

- **${number(all.samples)} samples** (train ${number(manifest.train.samples)}, eval ${number(manifest.eval.samples)}), about ${(all.approxTokens / 1e6).toFixed(1)} million tokens.
- Target ${number(manifest.target.samples)}: ${manifest.target.reached ? "reached" : `${number(all.samples)} so far (${((all.samples / manifest.target.samples) * 100).toFixed(0)}%)`}.
- Languages: ${Object.entries(all.byLanguage).map(([lang, count]) => `${lang} ${number(count)}`).join(", ")}. With thinking: ${number(all.withThinking)}. Multi-turn: ${number(all.multiTurn)}.

${table(Object.entries(all.byFamily).sort((a, b) => b[1] - a[1]).map(([family, count]) => [family, number(count)]), ["Family", "Samples"])}

## How answers were checked

${table(Object.entries(all.byVerified).sort((a, b) => b[1] - a[1]).map(([kind, count]) => [kind, number(count)]), ["Check", "Samples"])}

\`executed\`: run against the exercise's own tests here; \`doctest\`: its doctests pass here; \`upstream-ci\`: the source's own pipeline checked it (Exercism tracks' CI, execution-filtered datasets); \`human\`: written by people (Exercism concept documents, GSM8K solutions, Aya, OpenAssistant); \`knowledge\`: Hanogt's own knowledge base and agent schemas.

## Sources

${table(sources, ["Source", "License", "Samples"])}

${pending.length ? `Not imported yet (training/import_hf.py needs network access to huggingface.co and \`HF_TOKEN\`): ${pending.map((source) => `\`${source.repo}\` (${source.status})`).join(", ")}.` : "Every Hugging Face source in the registry is imported."}

## Dropped

${table(Object.entries(manifest.dropped).sort((a, b) => b[1] - a[1]).map(([reason, count]) => [reason, number(count)]), ["Reason", "Samples"])}

Benchmarks kept out: code-bench (scripts/ai-eval), HumanEval and GSM8K's test split (${number(manifest.fingerprints?.runs)} prompt runs, ${number(manifest.fingerprints?.names)} function names).
`;
}

export async function main(argv = process.argv.slice(2)) {
    const { values } = parseArgs({
        args: argv,
        options: {
            out: { type: "string", default: "training/data/v2" },
            github: { type: "string", default: "training/data/github" },
            hf: { type: "string", default: "training/data/hf" },
            "max-chars": { type: "string", default: "24000" },
            seed: { type: "string", default: "20261005" },
            report: { type: "string", default: "ai/reports/finetune-dataset-v2.md" },
        },
    });
    const registry = JSON.parse(await readFile(path.join(ROOT, "training/sources.json"), "utf8"));
    const allowed = new Set(registry.sources.filter((source) => source.status === "allowed" || source.status === "review").map((source) => source.id));
    const githubDir = path.resolve(ROOT, values.github);
    const hfDir = path.resolve(ROOT, values.hf);

    const inputs = [];
    const site = await siteSamples(Number(values.seed));
    inputs.push(...site);
    const order = registry.sources.map((source) => source.id);
    const files = [...(await jsonlFiles(githubDir)), ...(await jsonlFiles(hfDir))];
    const read = { "hanogt-site": site.length };
    for (const file of files) {
        const samples = await readJsonl(file);
        for (const sample of samples) {
            if (!allowed.has(sample.source)) throw new Error(`${path.relative(ROOT, file)}: source ${sample.source} is not allowed in training/sources.json`);
            read[sample.source] = (read[sample.source] ?? 0) + 1;
        }
        inputs.push(...samples);
    }
    // Priority: site first, then sources in registry order (verified GitHub data before Hugging Face).
    const rank = (sample) => (sample.source === "hanogt-site" ? -1 : order.indexOf(sample.source));
    inputs.sort((a, b) => rank(a) - rank(b));

    const fingerprints = await loadFingerprints(githubDir);
    const { samples, dropped, droppedBySource } = mixSamples(inputs, { registry, fingerprints, maxChars: Number(values["max-chars"]) });
    const { train, evaluation } = splitByGroup(samples);
    const out = path.resolve(ROOT, values.out);
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "train.jsonl"), `${train.map(sampleLine).join("\n")}\n`);
    await writeFile(path.join(out, "eval.jsonl"), `${evaluation.map(sampleLine).join("\n")}\n`);
    const summary = { all: describe(samples), train: describe(train), eval: describe(evaluation) };
    const githubManifest = existsSync(path.join(githubDir, "manifest.json")) ? JSON.parse(await readFile(path.join(githubDir, "manifest.json"), "utf8")) : null;
    const hfManifest = existsSync(path.join(hfDir, "manifest.json")) ? JSON.parse(await readFile(path.join(hfDir, "manifest.json"), "utf8")) : null;
    const manifest = {
        built: new Date().toISOString(),
        seed: Number(values.seed),
        target: { samples: TARGET_SAMPLES, reached: samples.length >= TARGET_SAMPLES },
        read,
        dropped,
        droppedBySource,
        fingerprints: fingerprints.size,
        ...summary,
        inputs: {
            github: githubManifest ? Object.fromEntries(Object.entries(githubManifest.sources).map(([id, record]) => [id, { repo: record.repo, commit: record.commit }])) : null,
            hf: hfManifest ? Object.fromEntries(Object.entries(hfManifest.sources).map(([id, record]) => [id, { repo: record.repo, revision: record.revision ?? null, error: record.error ?? undefined }])) : null,
        },
    };
    await writeFile(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(path.join(out, "ATTRIBUTION.md"), attribution(registry, summary.all.bySource));
    await writeFile(path.join(out, "README.md"), datasetCard(summary, registry));
    if (values.report) await writeFile(path.resolve(ROOT, values.report), report(manifest, registry));
    console.log(JSON.stringify({ samples: samples.length, train: train.length, eval: evaluation.length, approxTokens: summary.all.approxTokens, byLanguage: summary.all.byLanguage, byFamily: summary.all.byFamily, withThinking: summary.all.withThinking, dropped }, null, 2));
    console.log(samples.length >= TARGET_SAMPLES ? `✓ ${TARGET_SAMPLES.toLocaleString("en-US")} target reached` : `… ${samples.length.toLocaleString("en-US")} of the ${TARGET_SAMPLES.toLocaleString("en-US")} target (the Hugging Face sources add the rest: training/import_hf.py)`);
    return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
