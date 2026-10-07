// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const {
    searchFiles, compileSearch, countMatches, planReplacements, applyLineEdits, expandReplacement, escapeRegExp, SEARCH_RESULT_LIMIT,
} = await load("lib/editor/find-in-files.ts");

const opts = (query, extra = {}) => ({ query, matchCase: false, wholeWord: false, regex: false, ...extra });
const files = [
    { id: "a", name: "main.js", text: "const total = 1;\nfunction getTotal() {\n  return total + Total;\n}\n" },
    { id: "b", name: "util.py", text: "TOTAL = 3\nprint(TOTAL)\r\nsubtotal = TOTAL - 1\n" },
    { id: "c", name: "empty.txt", text: "" },
];

test("plain text search: case-insensitive by default, grouped per file with 1-based positions", () => {
    const result = searchFiles(files, opts("total"));
    assert.equal(result.total, 8);
    assert.equal(result.truncated, false);
    assert.deepEqual(result.files.map((file) => [file.id, file.matches.length]), [["a", 4], ["b", 4]]);
    const first = result.files[0].matches[0];
    assert.deepEqual([first.line, first.column, first.endColumn, first.text, first.before, first.after], [1, 7, 12, "total", "const ", " = 1;"]);
    // Windows line endings count as line breaks.
    assert.deepEqual(result.files[1].matches.map((match) => match.line), [1, 2, 3, 3]);
});

test("match case and whole word", () => {
    assert.equal(searchFiles(files, opts("Total", { matchCase: true })).total, 2);
    const whole = searchFiles(files, opts("total", { wholeWord: true }));
    assert.deepEqual(whole.files.map((file) => file.matches.map((match) => `${match.line}:${match.column}`)), [["1:7", "3:10", "3:18"], ["1:1", "2:7", "3:12"]]);
    // A shorter match after a rejected one is still found ("ab ab" for whole word "ab" inside "aab ab").
    assert.equal(countMatches("aab ab", opts("ab", { wholeWord: true })), 1);
    // Turkish letters are word characters.
    assert.equal(countMatches("şeker şekerci", opts("şeker", { wholeWord: true })), 1);
});

test("regular expressions: groups, anchors per line, empty matches skipped, invalid patterns reported", () => {
    const result = searchFiles(files, opts("^\\s*return (\\w+)", { regex: true }));
    assert.equal(result.total, 1);
    assert.equal(result.files[0].matches[0].text, "  return total");
    assert.equal(countMatches("a\nb\nc", opts("^", { regex: true })), 0, "empty matches don't count");
    assert.equal(countMatches("x1 y22 z333", opts("\\d+", { regex: true })), 3);
    assert.equal(countMatches("İstanbul ıspanak", opts("\\p{Lu}", { regex: true, matchCase: true })), 1, "Unicode property escapes work");
    assert.equal(countMatches("a-b", opts("a\\-b", { regex: true })), 1, "patterns invalid in Unicode mode still work");
    const invalid = searchFiles(files, opts("(unclosed", { regex: true }));
    assert.equal(invalid.total, 0);
    assert.match(invalid.error, /./);
    assert.equal(compileSearch(opts("")), null);
    assert.equal(escapeRegExp("a.b*c"), "a\\.b\\*c");
});

test("results stop at the limit and say so", () => {
    const many = [{ id: "m", name: "m.txt", text: "x ".repeat(1500) }, { id: "n", name: "n.txt", text: "x\n".repeat(1000) }];
    const result = searchFiles(many, opts("x"));
    assert.equal(SEARCH_RESULT_LIMIT, 2000);
    assert.equal(result.total, 2000);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.files.map((file) => file.matches.length), [1500, 500]);
    const exact = searchFiles([{ id: "e", name: "e", text: "x ".repeat(10) }, { id: "f", name: "f", text: "no" }], opts("x"), 10);
    assert.deepEqual([exact.total, exact.truncated], [10, false], "exactly at the limit with nothing left is not truncated");
    const more = searchFiles([{ id: "e", name: "e", text: "x ".repeat(10) }, { id: "f", name: "f", text: "x" }], opts("x"), 10);
    assert.deepEqual([more.total, more.truncated], [10, true]);
});

test("previews are shortened around long lines", () => {
    const line = `${"a".repeat(100)}needle${"b".repeat(300)}`;
    const [match] = searchFiles([{ id: "l", name: "l", text: line }], opts("needle")).files[0].matches;
    assert.ok(match.before.startsWith("…"));
    assert.ok(match.before.length <= 40);
    assert.ok(match.after.endsWith("…"));
    assert.equal(match.text, "needle");
});

test("replacement plans: plain text, regex groups and escapes", () => {
    const text = "let a = 1;\nlet bb = 22;\n";
    const plain = planReplacements(text, opts("let"), "const");
    assert.equal(applyLineEdits(text, plain), "const a = 1;\nconst bb = 22;\n");
    const swapped = planReplacements(text, opts("let (\\w+) = (\\d+)", { regex: true }), "var $2 = $1 /* $& */");
    assert.equal(applyLineEdits(text, swapped), "var 1 = a /* let a = 1 */;\nvar 22 = bb /* let bb = 22 */;\n");
    const named = planReplacements("x=1", opts("(?<key>\\w)=(?<value>\\d)", { regex: true }), "$<value>:$<key> $$ $9");
    assert.equal(applyLineEdits("x=1", named), "1:x $ $9");
    const lines = planReplacements("a;b", opts(";", { regex: true }), "\\n\\t\\\\");
    assert.equal(applyLineEdits("a;b", lines), "a\n\t\\b");
    // Plain-text replacements are inserted as typed.
    assert.equal(applyLineEdits("cost", planReplacements("cost", opts("cost"), "$1 \\n")), "$1 \\n");
    // Several matches in one line, whole word, and CRLF text keep their line breaks.
    const crlf = "foo foo foobar\r\nfoo";
    assert.equal(applyLineEdits(crlf, planReplacements(crlf, opts("foo", { wholeWord: true }), "x")), "x x foobar\r\nx");
});

test("expandReplacement handles two-digit groups and the text around the match", () => {
    const match = /(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)/.exec("xxabcdefghijklyy");
    assert.equal(expandReplacement("$12-$1-$13", match, "xxabcdefghijklyy"), "l-a-a3");
    assert.equal(expandReplacement("[$`|$']", match, "xxabcdefghijklyy"), "[xx|yy]");
    assert.equal(expandReplacement("$<missing>$", match, "x"), "$<missing>$");
});
