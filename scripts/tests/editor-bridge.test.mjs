// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

class MemoryStorage {
    #items = new Map();
    get length() { return this.#items.size; }
    key(index) { return [...this.#items.keys()][index] ?? null; }
    getItem(key) { return this.#items.has(key) ? this.#items.get(key) : null; }
    setItem(key, value) { this.#items.set(key, String(value)); }
    removeItem(key) { this.#items.delete(key); }
}

const storage = new MemoryStorage();
globalThis.window = { sessionStorage: storage, location: { assign: (href) => { globalThis.lastNavigation = href; } } };

const bridge = await load("lib/editor-bridge.ts");
const { openInEditor, prepareEditorImport, consumeEditorImport, validateEditorImport, EDITOR_IMPORT_PREFIX, EDITOR_IMPORT_MAX_BYTES } = bridge;

test("openInEditor stores the file and navigates to /editor?import=<id>", () => {
    let href = "";
    const result = openInEditor({ name: "main.py", language: "py", code: "print(1)\n" }, { navigate: (target) => { href = target; } });
    assert.equal(result.ok, true);
    assert.equal(href, `/editor?import=${result.id}`);
    assert.ok(storage.getItem(`${EDITOR_IMPORT_PREFIX}${result.id}`));
    const consumed = consumeEditorImport(result.id);
    assert.deepEqual(consumed, { ok: true, file: { name: "main.py", language: "python", code: "print(1)\n" } });
    assert.equal(storage.getItem(`${EDITOR_IMPORT_PREFIX}${result.id}`), null, "the entry is deleted");
    assert.deepEqual(consumeEditorImport(result.id), { ok: false, error: "not_found" });
});

test("without navigate the browser location changes", () => {
    const result = openInEditor({ language: "javascript", code: "console.log(1)" });
    assert.equal(globalThis.lastNavigation, result.href);
    assert.equal(consumeEditorImport(result.id).file.name, "main.js");
});

test("validation: size, language, empty code and names", () => {
    assert.deepEqual(validateEditorImport({ language: "python", code: "x".repeat(EDITOR_IMPORT_MAX_BYTES + 1) }), { ok: false, error: "too_large" });
    assert.deepEqual(validateEditorImport({ language: "python", code: "ğ".repeat(EDITOR_IMPORT_MAX_BYTES / 2 + 1) }), { ok: false, error: "too_large" }, "the limit counts UTF-8 bytes");
    assert.deepEqual(validateEditorImport({ language: "klingon", code: "x" }), { ok: false, error: "unsupported_language" });
    assert.deepEqual(validateEditorImport({ language: "python", code: "   " }), { ok: false, error: "empty_code" });
    assert.deepEqual(validateEditorImport({ language: "python", code: 5 }), { ok: false, error: "invalid_payload" });
    assert.deepEqual(validateEditorImport(null), { ok: false, error: "invalid_payload" });
    assert.equal(validateEditorImport({ name: "../../etc/passwd\u0000", language: "plaintext", code: "x" }).file.name, "passwd.txt");
    assert.equal(validateEditorImport({ name: "solution", language: "c++", code: "x" }).file.name, "solution.cpp");
    assert.equal(validateEditorImport({ name: "Dockerfile", language: "", code: "FROM x" }).file.language, "dockerfile");
    assert.equal(validateEditorImport({ name: "a".repeat(300) + ".rs", language: "rust", code: "x" }).file.name.length, 120);
    assert.ok(validateEditorImport({ name: "a".repeat(300) + ".rs", language: "rust", code: "x" }).file.name.endsWith(".rs"));
});

test("ids are validated and old entries expire", () => {
    assert.deepEqual(consumeEditorImport("../hack"), { ok: false, error: "not_found" });
    assert.deepEqual(consumeEditorImport(null), { ok: false, error: "not_found" });
    const prepared = prepareEditorImport({ language: "lua", code: "print(1)" });
    assert.equal(prepared.ok, true);
    assert.deepEqual(consumeEditorImport(prepared.id, Date.now() + 11 * 60 * 1000), { ok: false, error: "expired" });
    const tampered = "a".repeat(32);
    storage.setItem(`${EDITOR_IMPORT_PREFIX}${tampered}`, "{not json");
    assert.deepEqual(consumeEditorImport(tampered), { ok: false, error: "invalid_payload" });
});

test("entries written by hand (Hanogt AI) are accepted", () => {
    // HanogtAIChat stores { name, language, code } under a short id, without createdAt.
    const id = "mf3k2j1a-x8f2k1";
    storage.setItem(`${EDITOR_IMPORT_PREFIX}${id}`, JSON.stringify({ name: "hanogt-ai.python", language: "python", code: "print('hi')" }));
    assert.deepEqual(consumeEditorImport(id), { ok: true, file: { name: "hanogt-ai.py", language: "python", code: "print('hi')" } });
    assert.equal(storage.getItem(`${EDITOR_IMPORT_PREFIX}${id}`), null);
    assert.equal(validateEditorImport({ name: "hanogt-ai.csharp", language: "csharp", code: "class A {}" }).file.name, "hanogt-ai.cs");
    assert.equal(validateEditorImport({ name: "hanogt-ai.c++", language: "c++", code: "int main() {}" }).file.name, "hanogt-ai.c++", ".c++ is a real C++ extension");
    assert.equal(validateEditorImport({ name: "hanogt-ai.js", language: "js", code: "1" }).file.name, "hanogt-ai.js");
    assert.equal(validateEditorImport({ name: "notes.v2", language: "markdown", code: "# x" }).file.name, "notes.v2.md");
    // A present but invalid timestamp still counts as expired.
    storage.setItem(`${EDITOR_IMPORT_PREFIX}${id}`, JSON.stringify({ createdAt: "yesterday", language: "python", code: "1" }));
    assert.deepEqual(consumeEditorImport(id), { ok: false, error: "expired" });
    assert.deepEqual(consumeEditorImport("short"), { ok: false, error: "not_found" });
});
