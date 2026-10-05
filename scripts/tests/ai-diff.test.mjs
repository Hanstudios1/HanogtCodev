// Run: node --test scripts/tests/
// Hanogt AI's "Changes" card: line diffs (src/lib/ai/diff.ts) and the change
// an answer proposes for the open file (src/lib/ai/file-edit.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { applyUnifiedDiff, diffHunks, diffLines, diffStats, parseUnifiedDiff, splitLines } = await load("lib/ai/diff.ts");
const { codeBlocks, proposedEdit, textFingerprint } = await load("lib/ai/file-edit.ts");

/** Rebuilds both sides from an edit script. */
function sides(ops) {
    return { old: ops.filter((op) => op.kind !== "add").map((op) => op.text), new: ops.filter((op) => op.kind !== "del").map((op) => op.text) };
}

test("lines: a final line break doesn't add an empty line; CRLF is read as LF", () => {
    assert.deepEqual(splitLines(""), []);
    assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
    assert.deepEqual(splitLines("a\r\nb"), ["a", "b"]);
    assert.deepEqual(splitLines("a\n\n"), ["a", ""]);
});

test("diff: the shortest edit script, with line numbers on both sides", () => {
    const a = ["def f(x):", "    return x", "", "print(f(1))"];
    const b = ["def f(x, y=1):", "    return x * y", "", "print(f(1))", "print(f(2, 3))"];
    const ops = diffLines(a, b);
    assert.deepEqual(sides(ops), { old: a, new: b });
    assert.deepEqual(diffStats(ops), { added: 3, removed: 2 });
    const kept = ops.filter((op) => op.kind === "same");
    assert.deepEqual(kept.map((op) => [op.oldLine, op.newLine]), [[3, 3], [4, 4]]);
    assert.equal(ops.find((op) => op.text === "print(f(2, 3))").newLine, 5);
});

test("diff: random edits always rebuild both texts and are minimal for a single change", () => {
    let seed = 7;
    const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
    for (let round = 0; round < 200; round += 1) {
        const a = Array.from({ length: Math.floor(random() * 30) }, () => `line ${Math.floor(random() * 8)}`);
        const b = a.flatMap((line) => (random() < 0.15 ? [] : random() < 0.15 ? [line, `new ${Math.floor(random() * 5)}`] : [line]));
        const ops = diffLines(a, b);
        assert.deepEqual(sides(ops), { old: a, new: b }, `round ${round}`);
    }
    const a = Array.from({ length: 50 }, (_, index) => `x${index}`);
    const b = [...a.slice(0, 20), "changed", ...a.slice(21)];
    assert.deepEqual(diffStats(diffLines(a, b)), { added: 1, removed: 1 });
});

test("diff: gives up past the edit limit; empty sides are all additions or deletions", () => {
    const a = Array.from({ length: 300 }, (_, index) => `a${index}`);
    const b = Array.from({ length: 300 }, (_, index) => `b${index}`);
    assert.equal(diffLines(a, b, 50), null);
    assert.equal(diffLines(a, b, 1_000).length, 600);
    assert.deepEqual(diffStats(diffLines([], ["a", "b"])), { added: 2, removed: 0 });
    assert.deepEqual(diffStats(diffLines(["a"], [])), { added: 0, removed: 1 });
});

test("hunks: changes with three lines of context, close ones merged", () => {
    const a = Array.from({ length: 30 }, (_, index) => `l${index + 1}`);
    const b = [...a];
    b[4] = "five";
    b[7] = "eight";
    b[25] = "twenty-six";
    const hunks = diffHunks(diffLines(a, b));
    assert.equal(hunks.length, 2);
    assert.deepEqual([hunks[0].oldStart, hunks[0].oldLines, hunks[0].newStart, hunks[0].newLines], [2, 10, 2, 10]);
    assert.deepEqual([hunks[1].oldStart, hunks[1].oldLines], [23, 7]);
    assert.deepEqual(diffHunks(diffLines(a, a)), []);
});

const FILE = [
    "import math",
    "",
    "def area(r):",
    "    return 3.14 * r * r",
    "",
    "def main():",
    "    print(area(2))",
    "",
    "main()",
    "",
].join("\n");

test("unified diff: applied by its context, also with shifted numbers or loose headers", () => {
    const patch = [
        "--- a/main.py",
        "+++ b/main.py",
        "@@ -3,2 +3,2 @@",
        " def area(r):",
        "-    return 3.14 * r * r",
        "+    return math.pi * r * r",
    ].join("\n");
    const applied = applyUnifiedDiff(FILE, patch, "main.py");
    assert.equal(applied.ok, true);
    assert.equal(applied.text, FILE.replace("3.14", "math.pi"));
    // Wrong line numbers: found by its lines.
    assert.equal(applyUnifiedDiff(FILE, patch.replace("@@ -3,2 +3,2 @@", "@@ -40,2 +40,2 @@")).text, applied.text);
    // No headers and no numbers, an empty context line without its space.
    const loose = ["@@", "-def main():", "-    print(area(2))", "+def main(radius=2):", "+    print(area(radius))", "", " main()"].join("\n");
    const looseApplied = applyUnifiedDiff(FILE, loose);
    assert.equal(looseApplied.ok, true);
    assert.match(looseApplied.text, /def main\(radius=2\):\n {4}print\(area\(radius\)\)\n\nmain\(\)\n$/);
    // Trailing spaces differ: still applied.
    assert.equal(applyUnifiedDiff(FILE.replace("def area(r):", "def area(r):   "), patch).ok, true);
    // Context that isn't in the file: refused.
    assert.deepEqual(applyUnifiedDiff(FILE, patch.replace("def area(r):", "def volume(r):")), { ok: false, reason: "mismatch" });
    assert.deepEqual(applyUnifiedDiff(FILE, "no diff here"), { ok: false, reason: "empty" });
});

test("unified diff: several hunks in order, additions at the end, the named file of many", () => {
    const patch = [
        "--- a/other.py",
        "+++ b/other.py",
        "@@ -1 +1 @@",
        "-x = 1",
        "+x = 2",
        "--- a/src/main.py",
        "+++ b/src/main.py",
        "@@ -1,1 +1,2 @@",
        " import math",
        "+import sys",
        "@@ -9,1 +10,2 @@",
        " main()",
        "+sys.exit(0)",
    ].join("\n");
    assert.equal(parseUnifiedDiff(patch).length, 2);
    const applied = applyUnifiedDiff(FILE, patch, "main.py");
    assert.equal(applied.ok, true);
    assert.equal(applied.text, FILE.replace("import math\n", "import math\nimport sys\n").replace("main()\n", "main()\nsys.exit(0)\n"));
});

test("code blocks: closed fences only, with their language", () => {
    const blocks = codeBlocks("Text\n```python\nprint(1)\n```\n~~~js\nlet a\n~~~\n```\nunfinished");
    assert.deepEqual(blocks, [{ lang: "python", code: "print(1)" }, { lang: "js", code: "let a" }]);
    assert.deepEqual(codeBlocks("````md\n```py\nx\n```\n````"), [{ lang: "md", code: "```py\nx\n```" }]);
});

test("proposed change: a whole-file block or a diff; a snippet of a long file is not a change", () => {
    const base = { code: FILE, language: "python", fileName: "main.py" };
    const full = FILE.replace("3.14", "math.pi");
    const fromFull = proposedEdit(`Here it is:\n\n\`\`\`py\n${full}\`\`\`\n`, base);
    assert.equal(fromFull.kind, "full");
    assert.equal(fromFull.code, full);
    assert.deepEqual([fromFull.added, fromFull.removed], [1, 1]);

    const fromDiff = proposedEdit("```diff\n--- a/main.py\n+++ b/main.py\n@@ -3,2 +3,2 @@\n def area(r):\n-    return 3.14 * r * r\n+    return math.pi * r * r\n```", base);
    assert.equal(fromDiff.kind, "diff");
    assert.equal(fromDiff.code, full);

    // Just one new function: not the file.
    assert.equal(proposedEdit("```python\ndef perimeter(r):\n    return 2 * math.pi * r\n```", base), null);
    // Another language: not this file.
    assert.equal(proposedEdit(`\`\`\`js\n${full}\`\`\``, base), null);
    // The same file back: nothing to change.
    assert.equal(proposedEdit(`\`\`\`python\n${FILE}\`\`\``, base), null);
    // A new, empty file takes any block in its language.
    const empty = proposedEdit("```python\nprint('hi')\n```", { ...base, code: "" });
    assert.equal(empty.code, "print('hi')");
    assert.deepEqual([empty.added, empty.removed], [1, 0]);
});

test("fingerprints tell texts apart", () => {
    assert.equal(textFingerprint("abc"), textFingerprint("abc"));
    assert.notEqual(textFingerprint("abc"), textFingerprint("abd"));
    assert.notEqual(textFingerprint(""), textFingerprint(" "));
});
