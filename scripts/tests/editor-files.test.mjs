// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { uniqueFileName, sanitizeFileName, downloadName, buildSnippetFile, parseSnippetFile, decodeTextFile } = await load("components/Editor/editor-files.ts");

test("unique names get a numeric suffix (case-insensitive)", () => {
    assert.equal(uniqueFileName("main.py", []), "main.py");
    assert.equal(uniqueFileName("main.py", ["MAIN.py"]), "main-2.py");
    assert.equal(uniqueFileName("main.py", ["main.py", "main-2.py"]), "main-3.py");
    assert.equal(uniqueFileName("Dockerfile", ["Dockerfile"]), "Dockerfile-2");
});

test("names are sanitised for tabs and downloads", () => {
    assert.equal(sanitizeFileName("../../etc/passwd"), "passwd");
    assert.equal(sanitizeFileName("  a\u0000b  c.txt "), "ab c.txt");
    assert.equal(sanitizeFileName(""), "untitled.txt");
    assert.equal(sanitizeFileName("x".repeat(200) + ".py").length, 120);
    assert.equal(downloadName("Python Projesi", "python"), "Python Projesi.py");
    assert.equal(downloadName('a:b|c?.js', "javascript"), "a_b_c_.js");
    assert.equal(downloadName("index.html", "html"), "index.html");
});

test("snippet files round-trip and reject other JSON", () => {
    const text = buildSnippetFile({ name: "hello.scm", lang: "scheme", code: "(display 1)" });
    assert.deepEqual(parseSnippetFile(text), { name: "hello.scm", language: "scheme", code: "(display 1)" });
    assert.equal(parseSnippetFile('{"name":"x"}'), null);
    assert.equal(parseSnippetFile("not json"), null);
    assert.deepEqual(parseSnippetFile(JSON.stringify({ kind: "hanogt-snippet", name: "../a", language: "nope", code: "x" })), { name: "a.txt", language: "plaintext", code: "x" });
});

test("binary data is detected and the BOM removed", () => {
    assert.equal(decodeTextFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1])), null);
    assert.equal(decodeTextFile(new TextEncoder().encode("﻿merhaba ğ")), "merhaba ğ");
});

const { matchScore, searchKey } = await load("components/Editor/search.ts");

test("palette search ignores case and Turkish accents and ranks prefixes first", () => {
    assert.equal(searchKey("Çalıştır İŞLEM"), "calistir islem");
    assert.ok(matchScore("calistir", "Çalıştır") > 0);
    assert.ok(matchScore("kaydet", "Kaydet") > matchScore("kaydet", "Hepsini kaydet"));
    assert.ok(matchScore("nwf", "New file") > 0);
    assert.equal(matchScore("xyz", "New file"), 0);
    assert.equal(matchScore("", "anything"), 1);
});
