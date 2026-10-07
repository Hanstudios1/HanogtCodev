// Run: node --test scripts/tests/
// Live collaboration: the shared Yjs document, compaction into snapshots, and the editor's tab changes.
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { load } from "./setup.mjs";

const docModule = await load("lib/collab/doc.ts");
const { COLLAB_LIMITS } = await load("lib/collab/protocol.ts");
const {
    applyTabOps, compactUpdates, createSessionDoc, diffTabs, docTotalChars, filesFromState, filesOf, isValidYjsUpdate, listDocFiles, readDocFiles,
    readFileEntry, textChange,
} = docModule;

const INITIAL = [
    { id: "tab-a", name: "main.py", lang: "python", code: "print('merhaba')\n" },
    { id: "tab-b", name: "util.py", lang: "python", code: "def topla(a, b):\n    return a + b\n" },
];

/** A browser: a document built from the session snapshot that records its own updates. */
function client(snapshot) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, snapshot, "remote");
    const sent = [];
    doc.on("update", (update, origin) => {
        if (origin !== "remote") sent.push(update);
    });
    return { doc, sent, text: (id) => readFileEntry(id, filesOf(doc).get(id)).text };
}

test("a session document holds the files in tab order", () => {
    const doc = createSessionDoc(INITIAL);
    assert.deepEqual(readDocFiles(doc).map(({ id, name, lang, order, code }) => [id, name, lang, order, code]), [
        ["tab-a", "main.py", "python", 0, INITIAL[0].code],
        ["tab-b", "util.py", "python", 1, INITIAL[1].code],
    ]);
    assert.equal(docTotalChars(doc), INITIAL[0].code.length + INITIAL[1].code.length);
    // Malformed entries (another client's bug) are skipped instead of breaking the list.
    doc.transact(() => filesOf(doc).set("bad", new Y.Map()));
    assert.equal(listDocFiles(doc).length, 2);
});

test("concurrent edits converge, and compaction keeps the merged result", () => {
    const snapshot = Y.encodeStateAsUpdate(createSessionDoc(INITIAL));
    const ali = client(snapshot);
    const ayse = client(snapshot);
    ali.text("tab-a").insert(0, "# Ali\n");
    ayse.text("tab-a").insert(ayse.text("tab-a").length, "print('Ayşe')\n");
    ayse.text("tab-b").delete(0, 3);
    ayse.text("tab-b").insert(0, "async def");
    const log = [...ali.sent, ...ayse.sent];
    for (const update of ayse.sent) Y.applyUpdate(ali.doc, update, "remote");
    for (const update of ali.sent) Y.applyUpdate(ayse.doc, update, "remote");
    assert.equal(ali.text("tab-a").toString(), ayse.text("tab-a").toString());
    assert.equal(ali.text("tab-a").toString(), "# Ali\nprint('merhaba')\nprint('Ayşe')\n");
    assert.equal(ali.text("tab-b").toString(), "async def topla(a, b):\n    return a + b\n");

    const compacted = compactUpdates(snapshot, log);
    assert.equal(compacted.skipped, 0);
    assert.deepEqual(filesFromState(compacted.state), readDocFiles(ali.doc));
    assert.deepEqual(compacted.files.map((file) => [file.id, file.chars]), readDocFiles(ali.doc).map((file) => [file.id, file.code.length]));
    assert.equal(compacted.totalChars, docTotalChars(ali.doc));

    // A newcomer that loads the snapshot (and nothing else) sees the same code.
    const newcomer = client(compacted.state);
    assert.deepEqual(readDocFiles(newcomer.doc), readDocFiles(ali.doc));
});

test("incremental compaction equals one big compaction; garbage is skipped", () => {
    const snapshot = Y.encodeStateAsUpdate(createSessionDoc(INITIAL));
    const writer = client(snapshot);
    for (let index = 0; index < 30; index += 1) writer.text("tab-a").insert(0, `${index};`);
    writer.text("tab-a").delete(0, 20);
    const first = compactUpdates(snapshot, writer.sent.slice(0, 15));
    const second = compactUpdates(first.state, [...writer.sent.slice(15), new Uint8Array([1, 2, 3, 250, 7])]);
    const once = compactUpdates(snapshot, writer.sent);
    assert.equal(second.skipped, 1, "the malformed update is skipped");
    assert.deepEqual(filesFromState(second.state), filesFromState(once.state));
    assert.deepEqual(filesFromState(once.state), readDocFiles(writer.doc));
    // Re-applying updates the snapshot already contains changes nothing (Yjs updates are idempotent).
    assert.deepEqual(filesFromState(once.state, writer.sent), readDocFiles(writer.doc));
});

test("compaction drops deleted text (the snapshot doesn't grow with the history)", () => {
    const snapshot = Y.encodeStateAsUpdate(createSessionDoc([{ id: "tab-a", name: "a.txt", lang: "plaintext", code: "" }]));
    const writer = client(snapshot);
    const big = "x".repeat(50_000);
    writer.text("tab-a").insert(0, big);
    writer.text("tab-a").delete(0, big.length);
    writer.text("tab-a").insert(0, "small");
    const compacted = compactUpdates(snapshot, writer.sent);
    assert.equal(filesFromState(compacted.state)[0].code, "small");
    assert.ok(compacted.state.length < 2_000, `snapshot is ${compacted.state.length} bytes`);
});

test("only real Yjs updates are accepted", () => {
    const doc = createSessionDoc(INITIAL);
    assert.ok(isValidYjsUpdate(Y.encodeStateAsUpdate(doc)));
    const writer = client(Y.encodeStateAsUpdate(doc));
    writer.text("tab-a").insert(0, "x");
    assert.ok(isValidYjsUpdate(writer.sent[0]));
    assert.equal(isValidYjsUpdate(new Uint8Array([])), false);
    assert.equal(isValidYjsUpdate(new Uint8Array([7])), false);
    assert.equal(isValidYjsUpdate(new Uint8Array([200, 200, 200, 200, 200, 1])), false);
});

test("textChange finds the smallest replacement", () => {
    assert.equal(textChange("abc", "abc"), null);
    assert.deepEqual(textChange("hello world", "hello brave world"), { index: 6, remove: 0, insert: "brave " });
    assert.deepEqual(textChange("abcdef", "abef"), { index: 2, remove: 2, insert: "" });
    assert.deepEqual(textChange("aaa", "aaaa"), { index: 3, remove: 0, insert: "a" });
    assert.deepEqual(textChange("", "x"), { index: 0, remove: 0, insert: "x" });
    // Surrogate pairs are never split.
    const change = textChange("a😀b", "a😃b");
    assert.equal("a😀b".slice(0, change.index) + change.insert + "a😀b".slice(change.index + change.remove), "a😃b");
    assert.equal(change.remove, 2);
    for (const [before, after] of [["", ""], ["x", ""], ["abc", "xbz"], ["1234", "1x34"], ["😀😀", "😀"]]) {
        const result = textChange(before, after);
        const applied = result ? before.slice(0, result.index) + result.insert + before.slice(result.index + result.remove) : before;
        assert.equal(applied, after, `${before} → ${after}`);
    }
});

const tab = (id, name, code = "", lang = "python") => ({ id, name, lang, code });

test("diffTabs describes only what the editor changed", () => {
    const base = [tab("a", "a.py"), tab("b", "b.py"), tab("c", "c.py")];
    assert.deepEqual(diffTabs(base, base), []);
    assert.deepEqual(diffTabs(base, [...base, tab("d", "d.py", "x")]), [{ type: "add", id: "d", name: "d.py", lang: "python", code: "x" }]);
    assert.deepEqual(diffTabs(base, [base[0], base[2]]), [{ type: "remove", id: "b" }]);
    assert.deepEqual(diffTabs(base, [base[0], { ...base[1], name: "b2.js", lang: "javascript" }, base[2]]), [{ type: "rename", id: "b", name: "b2.js", lang: "javascript" }]);
    assert.deepEqual(diffTabs(base, [base[1], base[0], base[2]]), [{ type: "order", ids: ["b", "a", "c"] }]);
    // Duplicate: the copy goes right after its source.
    assert.deepEqual(diffTabs(base, [base[0], tab("a2", "a-kopya.py"), base[1], base[2]]), [
        { type: "add", id: "a2", name: "a-kopya.py", lang: "python", code: "" },
        { type: "order", ids: ["a", "a2", "b", "c"] },
    ]);
    // Code edits and the saved flag reach the document through the Monaco binding, not here.
    assert.deepEqual(diffTabs(base, base.map((entry) => ({ ...entry, code: "changed", isSaved: true }))), []);
});

test("tab changes apply to a document others changed meanwhile without undoing their work", () => {
    const doc = createSessionDoc([tab("a", "a.py", "1"), tab("b", "b.py", "2")]);
    const staleBase = readDocFiles(doc).map(({ id, name, lang, code }) => ({ id, name, lang, code }));
    // Someone else adds a file and edits "a" while this editor still shows the old list.
    doc.transact(() => {
        applyTabOps(doc, [{ type: "add", id: "remote", name: "remote.py", lang: "python", code: "r" }], "other");
        readFileEntry("a", filesOf(doc).get("a")).text.insert(1, " + 1");
    });
    const next = [...staleBase, tab("mine", "mine.py", "m")];
    const result = applyTabOps(doc, diffTabs(staleBase, next), "local");
    assert.equal(result.rejected, null);
    assert.deepEqual(readDocFiles(doc).map((file) => [file.id, file.code]), [["a", "1 + 1"], ["b", "2"], ["remote", "r"], ["mine", "m"]]);
});

test("tab changes respect the session's limits", () => {
    const doc = createSessionDoc([tab("a", "a.py")]);
    assert.equal(applyTabOps(doc, [{ type: "remove", id: "a" }], "local").rejected, "last_file");
    assert.equal(listDocFiles(doc).length, 1);
    assert.equal(applyTabOps(doc, [{ type: "add", id: "big", name: "big.py", lang: "python", code: "x".repeat(COLLAB_LIMITS.maxFileChars + 1) }], "local").rejected, "file_too_large");
    assert.equal(applyTabOps(doc, [{ type: "add", id: "bad/id", name: "x.py", lang: "python", code: "" }], "local").rejected, "invalid_file");
    assert.equal(applyTabOps(doc, [{ type: "rename", id: "a", name: "../x", lang: "python" }], "local").rejected, "invalid_file");
    // Sessions from before per-plan files (and Free) hold 20 files; the session's own limit (the owner's plan) is passed in.
    const many = Array.from({ length: COLLAB_LIMITS.legacyFiles }, (_, index) => ({ type: "add", id: `f${index}`, name: `f${index}.py`, lang: "python", code: "" }));
    const result = applyTabOps(doc, many, "local");
    assert.equal(result.rejected, "too_many_files");
    assert.equal(listDocFiles(doc).length, COLLAB_LIMITS.legacyFiles);
    const plus = createSessionDoc([tab("a", "a.py")]);
    const forty = Array.from({ length: 45 }, (_, index) => ({ type: "add", id: `p${index}`, name: `p${index}.py`, lang: "python", code: "" }));
    assert.equal(applyTabOps(plus, forty, "local", 40).rejected, "too_many_files");
    assert.equal(listDocFiles(plus).length, 40);
    const capped = createSessionDoc([tab("a", "a.py")]);
    applyTabOps(capped, Array.from({ length: 120 }, (_, index) => ({ type: "add", id: `c${index}`, name: `c${index}.py`, lang: "python", code: "" })), "local", 999);
    assert.equal(listDocFiles(capped).length, COLLAB_LIMITS.maxFiles, "never more than any plan allows");
    const total = createSessionDoc([tab("a", "a.py", "x".repeat(COLLAB_LIMITS.maxFileChars)), tab("b", "b.py", "x".repeat(COLLAB_LIMITS.maxFileChars - 10))]);
    assert.equal(applyTabOps(total, [{ type: "add", id: "c", name: "c.py", lang: "python", code: "x".repeat(11) }], "local").rejected, "content_too_large");
    // Renames and reordering.
    const order = createSessionDoc([tab("a", "a.py"), tab("b", "b.py"), tab("c", "c.py")]);
    applyTabOps(order, [{ type: "order", ids: ["c", "a"] }, { type: "rename", id: "b", name: "b.js", lang: "javascript" }], "local");
    assert.deepEqual(readDocFiles(order).map((file) => [file.id, file.name, file.lang]), [["c", "c.py", "python"], ["a", "a.py", "python"], ["b", "b.js", "javascript"]]);
    // CRLF in added files becomes LF; unknown languages become plain text.
    applyTabOps(order, [{ type: "add", id: "d", name: "d.txt", lang: "not-a-language", code: "x\r\ny" }], "local");
    const added = readDocFiles(order).find((file) => file.id === "d");
    assert.equal(added.code, "x\ny");
    assert.equal(added.lang, "plaintext");
});
