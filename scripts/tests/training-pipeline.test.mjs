// The fine-tuning set v2 (training/mix.mjs and its helpers): language
// detection, the filters that keep imported samples out (personal data,
// another model's identity, refusals), thinking moved where Qwen3's template
// reads it, exact and near duplicates, benchmark fingerprints, caps, the
// split by group, the GitHub importer's pieces (license check, Exercism docs,
// GSM8K solutions, extensionless imports), the Jest-compatible harness, and a
// source registry that only allows permissive licenses.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./setup.mjs";

const common = await import(new URL("training/lib/common.mjs", ROOT).href);
const mix = await import(new URL("training/mix.mjs", ROOT).href);
const github = await import(new URL("training/import-github.mjs", ROOT).href);
const registry = JSON.parse(await readFile(new URL("training/sources.json", ROOT), "utf8"));

const chat = (id, user, answer, extra = {}) => ({
    id,
    group: extra.group ?? id,
    source: extra.source ?? "exercism-python",
    license: "MIT",
    lang: extra.lang ?? "EN",
    family: extra.family ?? "chat",
    verified: "human",
    messages: [{ role: "user", content: user }, { role: "assistant", content: answer, ...(extra.reasoning ? { reasoning_content: extra.reasoning } : {}) }],
});
const NO_FINGERPRINTS = { site: () => false, imported: () => false };

test("language detection: Turkish, English, German, Azerbaijani, Russian, neither; code is ignored", () => {
    assert.equal(common.detectLanguage("Bu fonksiyon neden hata veriyor, nasıl düzeltirim?"), "TR");
    assert.equal(common.detectLanguage("Why does this function throw, and how do I fix it?"), "EN");
    assert.equal(common.detectLanguage("Pourquoi cette fonction échoue-t-elle ?"), null);
    assert.equal(common.detectLanguage("```python\nprint('the and of to is')\n```"), null, "only code");
    assert.equal(common.detectLanguage("Şunu açıkla:\n```js\nconst the = 1;\n```"), "TR");
    assert.equal(common.detectLanguage("Warum gibt diese Funktion einen Fehler aus, und wie behebe ich ihn?"), "DE");
    assert.equal(common.detectLanguage("Über die Brücke gehen wir mit dem Hund."), "DE", "ü alone doesn't make it Turkish");
    assert.equal(common.detectLanguage("Bu funksiya niyə xəta verir və necə düzəldim?"), "AZ");
    assert.equal(common.detectLanguage("Azərbaycanın paytaxtı Bakıdır."), "AZ");
    assert.equal(common.detectLanguage("Bakü, Azərbaycan’ın başkentidir ve çok güzel bir şehirdir."), "TR", "a Turkish text naming Azerbaijan");
    assert.equal(common.detectLanguage("Почему эта функция выдаёт ошибку и как её исправить?"), "RU");
    assert.equal(common.detectLanguage("Чому ця функція видає помилку і як її виправити? Це її"), null, "Ukrainian isn't Russian");
    assert.equal(common.detectLanguage("The plants die in winter and the dog was happy."), "EN");
    for (const lang of ["TR", "EN", "DE", "AZ", "RU"]) assert.ok(mix.IDENTITY_PROMPT[lang], `identity prompt ${lang}`);
});

test("personal data: e-mails, Turkish phones, IBANs, valid national ids and card numbers", () => {
    assert.equal(common.personalData("yaz bana: ali.veli@gmail.com"), "email");
    assert.equal(common.personalData("örnek: kisi@example.com"), null, "documentation domains are fine");
    assert.equal(common.personalData("ara: 0532 123 45 67"), "phone");
    assert.equal(common.personalData("IBAN TR33 0006 1005 1978 6457 8413 26"), "iban");
    assert.equal(common.personalData("kimlik 10000000146"), "national_id", "passes the checksum");
    assert.equal(common.personalData("sayı 12345678901"), null, "fails the checksum");
    assert.equal(common.personalData("kart 4539 3195 0343 6467"), "card");
    assert.equal(common.personalData("kart 4539 3195 0343 6467", { cards: false }), null, "Luhn exercises use test numbers");
    assert.equal(common.personalData("order 1234 5678 9012 3456"), null, "fails Luhn");
});

test("another model's identity and refusals are recognized", () => {
    for (const text of ["I am ChatGPT, a model trained by OpenAI.", "I'm Claude, made by Anthropic.", "As an AI developed by Google DeepMind, I…", "Ben Qwen, Alibaba Cloud tarafından geliştirilen bir modelim."]) assert.ok(common.claimsOtherIdentity(text), text);
    for (const text of ["Use the OpenAI SDK to call the API.", "Claude Monet painted water lilies.", "Llama'lar Güney Amerika'da yaşar."]) assert.equal(common.claimsOtherIdentity(text), false, text);
    assert.ok(common.looksLikeRefusal("I'm sorry, but I can't help with that."));
    assert.ok(common.looksLikeRefusal("As an AI language model, I don't have opinions."));
    assert.ok(common.looksLikeRefusal("Üzgünüm, bu konuda yardımcı olamam."));
    assert.equal(common.looksLikeRefusal("Sorry for the wait — here's the fixed code."), false);
});

test("thinking blocks move to the last assistant message's reasoning_content", () => {
    assert.deepEqual(common.splitReasoning("<think>\nadd them\n</think>\n\n4"), { reasoning: "add them", answer: "4" });
    assert.deepEqual(common.splitReasoning("<|begin_of_thought|>steps<|end_of_thought|>\n<|begin_of_solution|>\n42\n<|end_of_solution|>"), { reasoning: "steps", answer: "42" });
    assert.deepEqual(common.splitReasoning("no thinking here"), { reasoning: "", answer: "no thinking here" });
    assert.deepEqual(common.splitReasoning("The tag <think> is literal."), { reasoning: "", answer: "The tag <think> is literal." });
    const sample = {
        ...chat("t", "q1", "<think>early</think>a1"),
        messages: [
            { role: "user", content: "q1" },
            { role: "assistant", content: "<think>early</think>a1" },
            { role: "user", content: "q2", reasoning_content: "users don't think" },
            { role: "assistant", content: "<think>late</think>a2" },
        ],
    };
    const normalized = mix.normalizeSample(sample);
    assert.equal(normalized.messages[1].content, "a1");
    assert.equal(normalized.messages[1].reasoning_content, undefined, "earlier turns lose their thinking, as in Qwen3's template");
    assert.equal(normalized.messages[2].reasoning_content, undefined);
    assert.deepEqual([normalized.messages[3].content, normalized.messages[3].reasoning_content], ["a2", "late"]);
});

test("duplicates: exact (normalized) and near-identical answers", () => {
    assert.equal(common.exactKey(chat("a", "Hello World!", "Answer 1.")), common.exactKey(chat("b", "hello   world", "answer 2")), "case, spacing, punctuation and digits are folded");
    const index = common.createNearDuplicateIndex(0.9);
    const answer = "To reverse a list in Python you can call the reverse method, which changes the list in place, or use slicing with a negative step to get a reversed copy of the list.";
    assert.equal(index.seen(common.minhash(answer)), false);
    assert.equal(index.seen(common.minhash(`${answer} `)), true);
    assert.equal(index.seen(common.minhash("Recursion is when a function calls itself with a smaller version of the same problem until it reaches a base case that stops the calls.")), false);
    assert.equal(common.minhash("too short"), null);
});

test("benchmark fingerprints: distinctive names and 8-word prompt runs", () => {
    const fingerprints = common.createFingerprints();
    fingerprints.addName("has_close_elements");
    fingerprints.addName("add");
    fingerprints.addText("Check if in given list of numbers, are any two numbers closer to each other than given threshold.");
    assert.ok(fingerprints.touches("def has_close_elements(numbers, threshold):"));
    assert.equal(fingerprints.touches("def add(a, b): return a + b"), false, "names under four characters are ignored");
    assert.ok(fingerprints.touches("Please check if in given list of numbers, are any two numbers closer together"));
    assert.equal(mix.distinctiveName("is_prime"), false);
    assert.equal(mix.distinctiveName("mergeIntervals"), true);
    assert.equal(mix.distinctiveName("separate_paren_groups"), true);
});

test("the mix keeps the site's paraphrases, filters imported data, caps sources and splits by group", () => {
    const testRegistry = { sources: [{ id: "exercism-python", cap: null }, { id: "hf-capped", cap: 2 }, { id: "hanogt-site", cap: null }] };
    const site = (id, user) => ({ ...chat(id, user, "Hanogt Codev'de proje oluşturmak için panelde Yeni proje düğmesine bas ve bir dil seç.", { source: "hanogt-site", lang: "TR", family: "site" }), license: "Proprietary (Hanogt Codev)", verified: "knowledge" });
    const samples = [
        site("s1", "Nasıl proje açarım?"),
        site("s2", "Yeni proje nasıl oluşturulur?"),
        chat("pii", "Mail me", "Sure, write to ali.veli@gmail.com and I will answer you."),
        chat("identity", "Who are you?", "I am ChatGPT, a large language model trained by OpenAI."),
        chat("refusal", "Tell me a joke", "I'm sorry, but I can't help with that request."),
        chat("ok1", "Explain recursion simply", "Recursion is when a function calls itself with a smaller version of the same problem until a base case stops it."),
        chat("dup", "Explain recursion simply!!", "Recursion is when a function calls itself with a smaller version of the same problem until a base case stops it."),
        chat("near", "What is recursion?", "Recursion is when a function calls itself with a smaller version of the same problem until a base case stops it!"),
        chat("think", "What is 2+2?", "<think>2 plus 2 is 4</think>The answer is 4, because two plus two makes four."),
        ...[1, 2, 3, 4].map((n) => chat(`cap${n}`, `Question number ${"x".repeat(n)} about loops`, `For loops repeat code; this is answer ${"y".repeat(n)} about loops and iteration in general.`, { source: "hf-capped" })),
        { ...chat("french", "Pourquoi cette fonction échoue-t-elle ?", "Parce que la variable n'est pas définie dans cette portée."), lang: null },
    ];
    const { samples: kept, dropped } = mix.mixSamples(samples, { registry: testRegistry, fingerprints: NO_FINGERPRINTS });
    const ids = kept.map((sample) => sample.id);
    assert.ok(ids.includes("s1") && ids.includes("s2"), "the site's paraphrases share an answer on purpose");
    for (const id of ["pii", "identity", "refusal", "dup", "near", "french"]) assert.ok(!ids.includes(id), id);
    assert.equal(kept.filter((sample) => sample.source === "hf-capped").length, 2, "capped");
    assert.deepEqual(Object.keys(dropped).sort(), ["cap", "duplicate", "identity", "invalid_lang", "near_duplicate", "pii_email", "refusal"].sort());
    const think = kept.find((sample) => sample.id === "think");
    const last = think.messages[think.messages.length - 1];
    assert.equal(last.reasoning_content, "2 plus 2 is 4");
    assert.doesNotMatch(last.content, /<think>/);
    for (const sample of kept) {
        if (sample.source === "hanogt-site") assert.notEqual(sample.messages[0].content, mix.IDENTITY_PROMPT.TR);
        else if (sample.messages[0].role === "system") assert.equal(sample.messages[0].content, mix.IDENTITY_PROMPT[sample.lang]);
    }
    const again = mix.mixSamples(samples, { registry: testRegistry, fingerprints: NO_FINGERPRINTS });
    assert.deepEqual(again.samples.map((sample) => sample.id), ids, "deterministic");
    const { train, evaluation } = mix.splitByGroup(kept);
    assert.equal(train.length + evaluation.length, kept.length);
    const evalGroups = new Set(evaluation.map((sample) => sample.group));
    assert.ok(train.every((sample) => !evalGroups.has(sample.group)));
});

test("benchmark hits are dropped from the mix", () => {
    const fingerprints = { site: () => false, imported: (text) => text.includes("mergeIntervals(") };
    const samples = [chat("bench", "Write mergeIntervals", "function mergeIntervals(list) { return list; }"), chat("fine", "Write a sum function", "function sum(list) { return list.reduce((a, b) => a + b, 0); }")];
    const { samples: kept, dropped } = mix.mixSamples(samples, { registry: { sources: [] }, fingerprints });
    assert.deepEqual(kept.map((sample) => sample.id), ["fine"]);
    assert.equal(dropped.benchmark, 1);
});

test("GitHub importer pieces: license files, Exercism docs, GSM8K solutions, extensionless imports", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hanogt-license-"));
    try {
        await writeFile(path.join(dir, "LICENSE"), "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy");
        assert.equal(await github.detectLicense(dir), "MIT");
        await writeFile(path.join(dir, "LICENSE"), "GNU GENERAL PUBLIC LICENSE\nVersion 3");
        assert.equal(await github.detectLicense(dir), "GPL");
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
    assert.equal(github.cleanDoc("# Title\n\n<!-- hidden -->\n~~~~exercism/note\nA note.\n~~~~\n\n\n\nText"), "# Title\n\nA note.\n\nText");
    assert.deepEqual(github.parseGsm8kAnswer("She has 3 + 4 = <<3+4=7>>7 apples.\nSo 7 * 2 = <<7*2=14>>14.\n#### 14"), { steps: ["She has 3 + 4 = 7 apples.", "So 7 * 2 = 14."], final: "14" });
    assert.equal(github.withExtensions("import { twoFer } from './two-fer';\nimport x from '../lib/x.js';\nconst m = await import('./m');"), "import { twoFer } from './two-fer.js';\nimport x from '../lib/x.js';\nconst m = await import('./m.js');");
});

test("the Jest-compatible harness runs matchers, async tests and reports failures", async () => {
    const harness = await import(new URL(`training/lib/jest-lite.mjs?${Date.now()}`, ROOT).href);
    const scope = {};
    harness.install(scope);
    scope.describe("math", () => {
        scope.test("equal", () => scope.expect({ a: [1, 2], b: undefined }).toEqual({ a: [1, 2] }));
        scope.xtest("close", () => scope.expect(0.1 + 0.2).toBeCloseTo(0.3));
        scope.test("throws", () => scope.expect(() => { throw new Error("boom"); }).toThrow("boom"));
        scope.test("async", async () => { await scope.expect(Promise.resolve(3)).resolves.toBe(3); });
        scope.test("rejects", async () => { await scope.expect(Promise.reject(new Error("no"))).rejects.toThrow("no"); });
        scope.test("not", () => scope.expect([1, 2, 3]).not.toContain(4));
        scope.test("fails", () => scope.expect(1).toBe(2));
    });
    const result = await harness.run();
    assert.equal(result.passed, 6);
    assert.equal(result.failed, 1);
    assert.match(result.failures[0].name, /math › fails/);
});

test("the source registry allows only permissive licenses and attributes what it uses", () => {
    const allowedLicenses = new Set(registry.licensesAllowed);
    const ids = new Set();
    for (const source of registry.sources) {
        assert.ok(!ids.has(source.id), `unique id ${source.id}`);
        ids.add(source.id);
        assert.ok(["allowed", "review", "excluded"].includes(source.status), source.id);
        if (source.status !== "allowed" || source.kind === "own") continue;
        assert.ok(allowedLicenses.has(source.license), `${source.id}: ${source.license}`);
        if (!source.role) assert.ok(source.attribution, `${source.id} needs an attribution line`);
    }
    for (const repo of ["magibu/turkish-multi-turn-dialog-dataset", "TFLai/Turkish-Alpaca", "databricks/databricks-dolly-15k"]) {
        assert.equal(registry.sources.find((source) => source.repo === repo)?.status, "excluded", repo);
    }
    assert.ok(registry.sources.filter((source) => source.kind === "github" && source.status === "allowed").length >= 60);
});

test("every Hugging Face source says how it is read, in the languages and families the mix knows", () => {
    const legacy = new Set(["hf-aya-dataset", "hf-oasst2", "hf-self-oss-instruct", "hf-opencodeinstruct", "hf-openthoughts-114k"]);
    const converters = new Set(["messages", "fields", "template", "verified-generation", "cvss", "aya", "oasst", "self-oss", "opencodeinstruct", "openthoughts", "helpsteer", "helpsteer3", "tools", "generic"]);
    for (const source of registry.sources) {
        // Sources still in review are read only once their card is checked; they get their "hf" block then.
        if (source.kind !== "hf" || source.status !== "allowed") continue;
        assert.ok(source.repo && /^[\w.-]+\/[\w.-]+$/.test(source.repo), `${source.id}: repo`);
        assert.ok(source.provenance, `${source.id}: provenance`);
        const spec = source.hf ?? {};
        assert.ok(legacy.has(source.id) || source.hf, `${source.id}: an "hf" block says how to read it`);
        if (spec.converter) assert.ok(converters.has(spec.converter), `${source.id}: converter ${spec.converter}`);
        if (spec.converter === "fields") assert.ok(spec.fields?.user && spec.fields?.assistant, `${source.id}: fields`);
        if (spec.converter === "template") assert.ok(Object.values(spec.templates ?? {}).every((template) => template.user && template.assistant) && Object.keys(spec.templates ?? {}).length > 0, `${source.id}: templates`);
        for (const lang of Object.keys(spec.templates ?? {})) assert.ok(common.LANGS.includes(lang), `${source.id}: template language ${lang}`);
        for (const condition of spec.where ?? []) assert.ok(condition.field, `${source.id}: every row filter names a field`);
        for (const lang of [spec.lang, ...Object.values(spec.langMap ?? {}), ...(source.languages ?? [])].filter(Boolean)) assert.ok(common.LANGS.includes(lang), `${source.id}: language ${lang}`);
        for (const family of [spec.family, ...(source.family ?? [])].filter(Boolean)) assert.ok(common.FAMILIES.includes(family), `${source.id}: family ${family}`);
        assert.ok(Number.isInteger(source.cap) && source.cap > 0, `${source.id}: cap`);
    }
});
