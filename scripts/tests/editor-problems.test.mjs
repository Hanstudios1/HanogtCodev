// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { groupProblems, filterProblems, severityOf, emptyCounts } = await load("lib/editor/problems.ts");

const marker = (severity, line, column, message, extra = {}) => ({ severity, message, startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column + 3, ...extra });

test("Monaco severities map to problems; hints are left out", () => {
    assert.equal(severityOf(8), "error");
    assert.equal(severityOf(4), "warning");
    assert.equal(severityOf(2), "info");
    assert.equal(severityOf(1), null);
    assert.deepEqual(emptyCounts(), { error: 0, warning: 0, info: 0 });
});

test("problems are grouped per file in tab order, errors first, then by position", () => {
    const { groups, counts } = groupProblems([
        { tabId: "a", name: "main.ts", language: "typescript", markers: [
            marker(4, 2, 1, "unused"),
            marker(8, 9, 5, "late error", { source: "ts", code: "2304" }),
            marker(8, 3, 7, "early error", { code: { value: "1005" } }),
            marker(1, 1, 1, "hint only"),
            marker(2, 1, 1, "info"),
        ] },
        { tabId: "b", name: "clean.js", language: "javascript", markers: [marker(1, 1, 1, "just a hint")] },
        { tabId: "c", name: "data.json", language: "json", markers: [marker(8, 1, 2, "Expected comma")] },
    ]);
    assert.deepEqual(groups.map((group) => group.tabId), ["a", "c"], "files without problems are left out");
    assert.deepEqual(groups[0].problems.map((problem) => [problem.severity, problem.line, problem.message]), [
        ["error", 3, "early error"], ["error", 9, "late error"], ["warning", 2, "unused"], ["info", 1, "info"],
    ]);
    assert.equal(groups[0].problems[0].code, "1005");
    assert.equal(groups[0].problems[1].source, "ts");
    assert.deepEqual(groups[0].counts, { error: 2, warning: 1, info: 1 });
    assert.deepEqual(counts, { error: 3, warning: 1, info: 1 });
    assert.equal(new Set(groups.flatMap((group) => group.problems.map((problem) => problem.key))).size, 5, "keys are unique");
});

test("duplicates are listed once and positions are at least 1", () => {
    const { groups, counts } = groupProblems([{ tabId: "x", name: "x.css", language: "css", markers: [
        marker(8, 0, 0, "  dup  "), marker(8, 0, 0, "  dup  "), marker(4, 0, 0, "dup"),
    ] }]);
    assert.equal(groups[0].problems.length, 2);
    assert.equal(groups[0].problems[0].message, "dup");
    assert.equal(groups[0].problems[0].line, 1);
    assert.equal(groups[0].problems[0].column, 1);
    assert.deepEqual(counts, { error: 1, warning: 1, info: 0 });
});

test("filtering by severity keeps only the chosen kinds", () => {
    const { groups } = groupProblems([
        { tabId: "a", name: "a.ts", language: "typescript", markers: [marker(8, 1, 1, "e"), marker(4, 2, 1, "w")] },
        { tabId: "b", name: "b.ts", language: "typescript", markers: [marker(4, 1, 1, "w only")] },
    ]);
    const errorsOnly = filterProblems(groups, new Set(["error"]));
    assert.deepEqual(errorsOnly.map((group) => [group.tabId, group.problems.map((problem) => problem.message)]), [["a", ["e"]]]);
    assert.equal(filterProblems(groups, new Set(["error", "warning", "info"]))[0], groups[0], "unchanged groups are reused");
    assert.deepEqual(filterProblems(groups, new Set()), []);
});
