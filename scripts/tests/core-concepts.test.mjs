// Hanogt AI Core's programming concepts (src/lib/ai/concepts.ts): the glossary
// is complete in both languages, its JavaScript examples parse, and with the
// shipped intent model "X nedir" / "what is X" questions get the right concept
// while site and off-topic questions don't.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { load, ROOT } from "./setup.mjs";

const { CONCEPTS } = await load("lib/ai/concepts.ts");
const engine = await load("lib/ai/local-engine.ts");
const nlp = await import(new URL("src/lib/ai/nlp.mjs", ROOT).href);
const meta = JSON.parse(fs.readFileSync(new URL("src/lib/ai/model-meta.json", ROOT), "utf8"));
engine.setIntentModel(nlp.decodeModelBinary(fs.readFileSync(new URL(`public/ai/${meta.file}`, ROOT))));

const txFor = (lang) => (copy, vars) => (lang === "TR" ? copy.TR : copy.EN).replace(/\{(\w+)\}/g, (match, name) => (vars && name in vars ? String(vars[name]) : match));
const ask = (text, lang = "TR") => engine.answerLocally(text, { tx: txFor(lang), locale: lang === "TR" ? "tr-TR" : "en-US", mode: "general", signedIn: true, context: null, agentMode: "ask" });
const titleOf = (id, lang = "TR") => CONCEPTS.find((concept) => concept.id === id).title[lang];

test("the glossary: 50 concepts with Turkish and English text, unique ids, runnable-looking examples", () => {
    assert.equal(CONCEPTS.length, 50);
    assert.equal(new Set(CONCEPTS.map((concept) => concept.id)).size, CONCEPTS.length);
    for (const concept of CONCEPTS) {
        assert.ok(concept.title.TR && concept.title.EN && concept.keywords.length > 20, concept.id);
        assert.ok(concept.text.TR.length > 120 && concept.text.EN.length > 120, concept.id);
        if (concept.example?.language === "javascript") assert.doesNotThrow(() => new Function(concept.example.code.replace(/\bawait\b/g, "")), concept.id);
    }
});

test("programming questions get the concept, with its example ready for the editor", async () => {
    const cases = [
        ["özyineleme nedir", "recursion", "TR"],
        ["what is a closure in javascript", "closure", "EN"],
        ["SQL ile NoSQL arasındaki fark nedir", "sql", "TR"],
        ["git branch ne işe yarar", "git", "TR"],
        ["explain big o notation", "big-o", "EN"],
        ["kalıtım nedir", "inheritance", "TR"],
        ["event loop nasıl işler", "async-await", "TR"],
    ];
    for (const [question, id, lang] of cases) {
        const reply = await ask(question, lang);
        assert.equal(reply.intent, "code_concept", `${question} → ${reply.intent}: ${reply.text.slice(0, 80)}`);
        assert.ok(reply.text.startsWith(`**${titleOf(id, lang)}**`), `${question} → ${reply.text.slice(0, 60)}`);
    }
    const recursion = await ask("özyineleme nedir");
    assert.equal(recursion.code?.language, "py", "the Python example opens in the editor");
    assert.match(recursion.text, /```python\n/);
});

test("site and off-topic questions don't get a concept", async () => {
    for (const [question, lang] of [["evrim teorisi nedir", "TR"], ["i don't understand why i was blocked", "EN"], ["Arcade nedir", "TR"], ["Hanogt Social'da grup nasıl kurulur", "TR"]]) {
        const reply = await ask(question, lang);
        assert.notEqual(reply.intent, "code_concept", `${question}: ${reply.text.slice(0, 80)}`);
    }
});
