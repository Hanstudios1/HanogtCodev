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

const { openFilesInEditor, prepareEditorFilesImport, consumeEditorImportBundle, validateEditorImportBundle, EDITOR_IMPORT_MAX_FILES } = bridge;

test("openFilesInEditor hands several files over in one entry", () => {
    let href = "";
    const result = openFilesInEditor({
        files: [
            { name: "index.html", language: "html", code: "<h1>Hi</h1>" },
            { name: "style.css", language: "css", code: "" },
            { name: "INDEX.html", language: "html", code: "<p>2</p>" },
            { name: "notes", language: "klingon", code: "x" },
            { name: ".env", language: "plaintext", code: "DEBUG=1" },
            { language: "python", code: "print(1)" },
        ],
        title: "  Benim\nsitem ",
        mediaPostId: "0b8f2c6e-1d2a-4c55-9f00-123456789abc",
    }, { navigate: (target) => { href = target; } });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, 0);
    assert.equal(href, `/editor?import=${result.id}`);
    const consumed = consumeEditorImportBundle(result.id);
    assert.equal(consumed.ok, true);
    assert.deepEqual(consumed.bundle.files.map((file) => [file.name, file.language]), [
        ["index.html", "html"], ["style.css", "css"], ["INDEX-2.html", "html"], ["notes", "plaintext"], [".env", "plaintext"], ["main.py", "python"],
    ], "empty files are kept, names are unique, project names stay as they are and unknown languages open as plain text");
    assert.equal(consumed.bundle.title, "Benim sitem");
    assert.equal(consumed.bundle.mediaPostId, "0b8f2c6e-1d2a-4c55-9f00-123456789abc");
    assert.equal(storage.getItem(`${EDITOR_IMPORT_PREFIX}${result.id}`), null, "the entry is deleted");
    assert.deepEqual(consumeEditorImportBundle(result.id), { ok: false, error: "not_found" });
});

test("bundles skip files that do not fit and keep the rest", () => {
    const big = "x".repeat(EDITOR_IMPORT_MAX_BYTES + 1);
    const files = Array.from({ length: EDITOR_IMPORT_MAX_FILES + 2 }, (_, index) => ({ name: `f${index}.py`, language: "python", code: `print(${index})` }));
    const validated = validateEditorImportBundle({ files: [{ name: "big.txt", language: "plaintext", code: big }, { code: 5 }, ...files] });
    assert.equal(validated.ok, true);
    assert.equal(validated.bundle.files.length, EDITOR_IMPORT_MAX_FILES);
    assert.equal(validated.bundle.skipped, 4, "one too large, one unreadable, two over the file limit");
    assert.deepEqual(validateEditorImportBundle({ files: [{ name: "big.txt", code: big }] }), { ok: false, error: "too_large" });
    assert.deepEqual(validateEditorImportBundle({ files: [] }), { ok: false, error: "empty_code" });
    assert.deepEqual(validateEditorImportBundle({ files: "nope" }), { ok: false, error: "invalid_payload" });
    assert.equal(validateEditorImportBundle({ files: [{ code: "1" }], mediaPostId: "../x" }).bundle.mediaPostId, null);
    assert.deepEqual(prepareEditorFilesImport({ files: [] }), { ok: false, error: "empty_code" });
});

test("single-file and bundle entries are readable by both consumers", () => {
    const single = prepareEditorImport({ name: "a.lua", language: "lua", code: "print(1)" });
    assert.deepEqual(consumeEditorImportBundle(single.id), { ok: true, bundle: { files: [{ name: "a.lua", language: "lua", code: "print(1)" }], title: null, mediaPostId: null, skipped: 0 } });
    const bundle = prepareEditorFilesImport({ files: [{ name: "b.rb", language: "ruby", code: "puts 1" }, { name: "c.rb", language: "ruby", code: "puts 2" }] });
    assert.deepEqual(consumeEditorImport(bundle.id), { ok: true, file: { name: "b.rb", language: "ruby", code: "puts 1" } }, "older callers get the first file");
    const expired = prepareEditorFilesImport({ files: [{ name: "d.go", language: "go", code: "package main" }] });
    assert.deepEqual(consumeEditorImportBundle(expired.id, Date.now() + 11 * 60 * 1000), { ok: false, error: "expired" });
    assert.deepEqual(consumeEditorImportBundle("../hack"), { ok: false, error: "not_found" });
});
