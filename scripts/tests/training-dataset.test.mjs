// The fine-tuning set (training/build-dataset.mjs) and the training scripts:
// well-formed chat samples in both languages, tool calls that pass the site's
// own validation, nothing from the code-bench, no secrets or e-mail
// addresses, a train/eval split that keeps an item's variants together, the
// same output for the same seed, and Python scripts that compile and find the
// assistant's turns.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { load, ROOT } from "./setup.mjs";

const builder = await import(new URL("training/build-dataset.mjs", ROOT).href);
const agentTools = await load("lib/ai/agent-tools.ts");
const { samples } = await builder.buildDataset();
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const python = spawnSync(PYTHON, ["--version"], { stdio: "ignore" }).status === 0;

test("enough samples from every source, in Turkish and English", () => {
    assert.ok(samples.length >= 1800, `${samples.length} samples`);
    const sources = new Set(samples.map((sample) => sample.source));
    for (const source of ["knowledge", "phrasing", "concept", "snippet", "engine", "program", "error", "agent", "agent-off", "refusal"]) assert.ok(sources.has(source), source);
    const turkish = samples.filter((sample) => sample.lang === "TR").length / samples.length;
    assert.ok(turkish > 0.4 && turkish < 0.7, `Turkish share ${turkish}`);
});

test("every sample is a well-formed chat; tool calls pass the site's validation and get a result", () => {
    const names = new Set(agentTools.agentToolSchemas().map((tool) => tool.function.name));
    for (const sample of samples) {
        const { messages } = sample;
        assert.equal(messages[0].role, "system", sample.id);
        assert.match(messages[0].content, /^You are Hanogt AI/, sample.id);
        assert.equal(messages[1].role, "user", sample.id);
        const last = messages[messages.length - 1];
        assert.ok(last.role === "assistant" && last.content.trim().length > 0, sample.id);
        const open = new Set();
        for (const message of messages.slice(1)) {
            assert.ok(["user", "assistant", "tool"].includes(message.role), sample.id);
            for (const call of message.tool_calls ?? []) {
                assert.ok(sample.tools, `${sample.id}: a tool call needs the tools list`);
                assert.ok(names.has(call.function.name), call.function.name);
                const checked = agentTools.sanitizeAgentCall(call.function.name, call.function.arguments);
                assert.ok(checked.ok, `${sample.id}: ${JSON.stringify(call.function.arguments)}`);
                open.add(call.id);
            }
            if (message.role === "tool") {
                assert.ok(open.has(message.tool_call_id), `${sample.id}: a result for a call that was made`);
                assert.doesNotThrow(() => JSON.parse(message.content), sample.id);
            }
        }
    }
    const denied = samples.filter((sample) => sample.messages.some((message) => message.role === "tool" && message.content.includes("\"denied\"")));
    assert.ok(denied.length > 5, "some actions are declined");
    for (const sample of denied) assert.doesNotMatch(sample.messages.at(-1).content, /oluşturdum|açtım|I created|I opened/i, `${sample.id}: never claims a declined action`);
});

test("nothing from the code-bench, no secrets, no e-mail addresses", async () => {
    const fingerprints = await builder.benchFingerprints();
    const secret = /\b(?:sk-[A-Za-z0-9-]{16,}|hnk_[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,})\b/;
    // Reserved example domains (RFC 2606) are fine in examples.
    const email = /[\w.+-]+@(?!example\.(?:com|org|net)\b)[\w-]+\.[\w.-]+/;
    for (const sample of samples) {
        const said = sample.messages.filter((message) => message.role !== "system").map((message) => `${message.content ?? ""} ${JSON.stringify(message.tool_calls ?? "")}`).join("\n");
        assert.equal(builder.touchesBench(said, fingerprints), false, sample.id);
        assert.doesNotMatch(said, secret, sample.id);
        assert.doesNotMatch(said, email, sample.id);
    }
    assert.ok(builder.touchesBench("def rle_encode(text):", fingerprints), "the check itself works");
});

test("the split keeps an item's variants together; the same seed gives the same set", async () => {
    const { train, evaluation } = builder.splitDataset(samples, 0.05);
    assert.equal(train.length + evaluation.length, samples.length);
    const evalGroups = new Set(evaluation.map((sample) => sample.group));
    assert.equal(train.filter((sample) => evalGroups.has(sample.group)).length, 0);
    assert.ok(evaluation.length > samples.length * 0.02 && evaluation.length < samples.length * 0.1, `${evaluation.length} eval samples`);
    const again = await builder.buildDataset();
    assert.equal(JSON.stringify(again.samples), JSON.stringify(samples));
    assert.equal(builder.languageOf("Editor jetzt öffnen"), null, "German isn't Turkish");
    assert.equal(builder.languageOf("ayarları aç"), "TR");
    assert.equal(builder.languageOf("what is git"), "EN");
});

test("the Python scripts compile and find the assistant's turns", { skip: !python && "python3 not found" }, () => {
    const compiled = spawnSync(PYTHON, ["-m", "py_compile", "training/train_lora.py", "training/merge_and_export.py"], { cwd: new URL(".", ROOT), encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stderr);
    const check = spawnSync(PYTHON, ["-c", [
        "import sys; sys.path.insert(0, 'training')",
        "import train_lora as t",
        "text = '<|im_start|>system\\nS<|im_end|>\\n<|im_start|>user\\nU<|im_end|>\\n<|im_start|>assistant\\n<think>\\n\\n</think>\\n\\nA<|im_end|>\\n'",
        "spans = t.assistant_spans(text, '<|im_start|>assistant\\n', '<|im_end|>')",
        "assert [text[a:b] for a, b in spans] == ['A<|im_end|>'], spans",
        "args = t.parse_args(['--preset', 'small'])",
        "assert args.base_model == 'Qwen/Qwen3-8B' and args.grad_accum == 8, args",
        "assert t.parse_args([]).base_model == 'Qwen/Qwen3.6-27B'",
        "import re",
        "assert re.fullmatch(t.TARGET_MODULES, 'model.language_model.layers.0.linear_attn.in_proj_qkv')",
        "assert not re.fullmatch(t.TARGET_MODULES, 'model.visual.blocks.0.attn.qkv')",
        "assert not re.fullmatch(t.TARGET_MODULES, 'model.visual.merger.linear_fc1')",
        "print('ok')",
    ].join("\n")], { cwd: new URL(".", ROOT), encoding: "utf8" });
    assert.equal(check.stdout.trim(), "ok", check.stderr);
});
