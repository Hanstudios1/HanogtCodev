// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const {
    LocalHistory, createMemoryBackend, historyAccountTag, historyFileKey, historyScopeOf, snapshotHash, utf8Length,
    MAX_SNAPSHOTS_PER_FILE, MAX_HISTORY_BYTES, AUTO_SNAPSHOT_MS,
} = await load("lib/editor/local-history.ts");

const key = (name, scope = "guest|draft") => historyFileKey(scope, name);
const take = (history, name, code, reason = "save", at = undefined, scope = undefined) => history.snapshot({ fileKey: key(name, scope), name, lang: "javascript", code, reason, at });

test("limits and helpers", () => {
    assert.equal(MAX_SNAPSHOTS_PER_FILE, 30);
    assert.equal(MAX_HISTORY_BYTES, 25 * 1024 * 1024);
    assert.ok(AUTO_SNAPSHOT_MS >= 60_000 && AUTO_SNAPSHOT_MS <= 10 * 60_000, "every few minutes");
    assert.equal(historyAccountTag(""), "guest");
    assert.equal(historyAccountTag(null), "guest");
    assert.equal(historyAccountTag("Ada@Example.com"), historyAccountTag(" ada@example.com "));
    assert.notEqual(historyAccountTag("ada@example.com"), historyAccountTag("bob@example.com"));
    assert.ok(!historyAccountTag("ada@example.com").includes("@"), "the e-mail isn't stored");
    assert.equal(historyScopeOf(historyFileKey("u1|project:7", "main.py")), "u1|project:7");
    assert.equal(utf8Length("aç€😀"), 1 + 2 + 3 + 4);
    assert.equal(snapshotHash("abc"), snapshotHash("abc"));
    assert.notEqual(snapshotHash("abc"), snapshotHash("abd"));
});

test("unchanged files are skipped; snapshots list newest first with their metadata", async () => {
    const history = new LocalHistory(createMemoryBackend());
    const first = await take(history, "main.js", "let a = 1;", "save", 1000);
    assert.ok(first);
    assert.equal(await take(history, "main.js", "let a = 1;", "auto", 2000), null, "same code: nothing stored");
    const second = await take(history, "main.js", "let a = 2;", "run", 3000);
    assert.ok(second);
    const list = await history.list(key("main.js"));
    assert.deepEqual(list.map((meta) => [meta.reason, meta.at, meta.size]), [["run", 3000, 10], ["save", 1000, 10]]);
    assert.equal((await history.get(second.id)).code, "let a = 2;");
    // Another file with the same code is separate.
    assert.ok(await take(history, "other.js", "let a = 2;", "save", 4000));
    // The same name in another workspace is separate too.
    assert.ok(await take(history, "main.js", "let a = 2;", "save", 5000, "guest|project:1"));
    assert.equal((await history.list(key("main.js"))).length, 2);
});

test("a fresh store finds the newest snapshot in the backend before skipping", async () => {
    const backend = createMemoryBackend();
    await take(new LocalHistory(backend), "main.js", "same", "save", 1);
    const later = new LocalHistory(backend);
    assert.equal(await take(later, "main.js", "same", "auto", 2), null);
    assert.ok(await take(later, "main.js", "changed", "auto", 3));
});

test("each file keeps at most 30 snapshots, the oldest go first", async () => {
    const history = new LocalHistory(createMemoryBackend());
    for (let index = 0; index < 35; index += 1) await take(history, "main.js", `v${index}`, "auto", index);
    const list = await history.list(key("main.js"));
    assert.equal(list.length, 30);
    assert.equal(list[0].at, 34);
    assert.equal(list.at(-1).at, 5);
});

test("the total size cap drops the oldest snapshots of any file", async () => {
    const history = new LocalHistory(createMemoryBackend(), { totalBytes: 100 });
    await take(history, "a.js", "a".repeat(40), "save", 1);
    await take(history, "b.js", "b".repeat(40), "save", 2);
    await take(history, "a.js", "c".repeat(40), "save", 3);
    assert.deepEqual((await history.list(key("a.js"))).map((meta) => meta.at), [3]);
    assert.deepEqual((await history.list(key("b.js"))).map((meta) => meta.at), [2]);
    // A file larger than the whole cap isn't stored.
    assert.equal(await take(history, "huge.js", "x".repeat(101), "save", 4), null);
    // After the cap removed a file's newest snapshot, the same code is stored again.
    await take(history, "b.js", "d".repeat(40), "save", 5);
    await take(history, "c.js", "e".repeat(40), "save", 6);
    assert.equal((await history.list(key("a.js"))).length, 0);
    assert.ok(await take(history, "a.js", "c".repeat(40), "save", 7));
});

test("operations run in order even when started together", async () => {
    const history = new LocalHistory(createMemoryBackend());
    const results = await Promise.all([take(history, "main.js", "x", "save", 1), take(history, "main.js", "x", "run", 2), take(history, "main.js", "y", "auto", 3)]);
    assert.deepEqual(results.map(Boolean), [true, false, true]);
});

test("removing, clearing, renaming and moving a draft to a project", async () => {
    const history = new LocalHistory(createMemoryBackend());
    const one = await take(history, "main.js", "1", "save", 1);
    await take(history, "main.js", "2", "save", 2);
    await take(history, "style.css", "body{}", "save", 3);
    await history.remove(one.id);
    assert.deepEqual((await history.list(key("main.js"))).map((meta) => meta.at), [2]);
    await history.renameFile(key("main.js"), key("app.js"), "app.js");
    assert.equal((await history.list(key("main.js"))).length, 0);
    const renamed = await history.list(key("app.js"));
    assert.deepEqual(renamed.map((meta) => [meta.name, meta.at]), [["app.js", 2]]);
    assert.equal(await take(history, "app.js", "2", "auto", 4), null, "the renamed file's newest snapshot still counts");
    await history.moveScope("guest|draft", "guest|project:9", ["app.js"]);
    assert.equal((await history.list(key("app.js"))).length, 0);
    assert.equal((await history.list(key("app.js", "guest|project:9"))).length, 1);
    assert.equal((await history.list(key("style.css"))).length, 1, "files that weren't moved stay");
    await history.clearFile(key("style.css"));
    assert.equal((await history.list(key("style.css"))).length, 0);
    assert.ok(await take(history, "style.css", "body{}", "save", 5), "a cleared file starts again");
    await history.clearAll();
    assert.equal((await history.list(key("app.js", "guest|project:9"))).length, 0);
    assert.equal((await history.list(key("style.css"))).length, 0);
});
