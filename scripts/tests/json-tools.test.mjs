// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { analyzeJson, codeFrame, lineColumn } = await load("lib/runtimes/json-tools.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");

test("valid documents are formatted losslessly", () => {
    const source = '{"big": 12345678901234567890, "escaped": "x\\u0041\\n", "nested": {"a": [1, {"b": []}], "c": {}}}';
    const result = analyzeJson(source);
    assert.equal(result.ok, true);
    assert.equal(result.minified, source.replace(/\s/g, ""));
    assert.equal(result.formatted, '{\n  "big": 12345678901234567890,\n  "escaped": "x\\u0041\\n",\n  "nested": {\n    "a": [\n      1,\n      {\n        "b": []\n      }\n    ],\n    "c": {}\n  }\n}');
    assert.equal(result.stats.topLevel, "object");
    assert.equal(result.stats.keys, 6);
    assert.equal(result.stats.maxDepth, 5);
    assert.equal(analyzeJson('{"a":1}', { indent: "\t" }).formatted, '{\n\t"a": 1\n}');
    assert.equal(analyzeJson('[1]', { indent: 4 }).formatted, "[\n    1\n]");
    assert.equal(analyzeJson('"text"').stats.topLevel, "string");
});

test("the registry template is valid JSON", () => {
    assert.equal(analyzeJson(LANGUAGES.find((language) => language.id === "json").template).ok, true);
});

test("syntax errors carry a message, line and column", () => {
    const cases = [
        ['{"a": 1,}', /Trailing commas/, 1, 9],
        ['{"a": 1 "b": 2}', /Expected ','/, 1, 9],
        ["{'a': 1}", /double quotes/, 1, 2],
        ['{"a": 01}', /leading zeros/, 1, 7],
        ["// comment\n{}", /Comments are not allowed/, 1, 1],
        ["[1, 2,]", /Trailing commas/, 1, 7],
        ["", /empty/, 1, 1],
        ['{"a": NaN}', /NaN is not a valid JSON value/, 1, 7],
        ['{"a": True}', /lower case/, 1, 7],
        ['{"a": "line\nbreak"}', /line breaks/, 1, 12],
        ['{"a": 1.}', /decimal point/, 1, 8],
        ["[1] [2]", /after the end of the JSON value/, 1, 5],
        ['{\n  "x": [\n    1\n', /not closed/, 2, 8],
        ['{"a": "\\q"}', /Invalid escape/, 1, 8],
        ['{"a": "\\u12"}', /unicode escape/, 1, 8],
        ['{"a" 1}', /Expected ':'/, 1, 6],
        ['{"a": +1}', /cannot start with '\+'/, 1, 7],
    ];
    for (const [source, message, line, column] of cases) {
        const result = analyzeJson(source);
        assert.equal(result.ok, false, source);
        assert.match(result.error.message, message, source);
        assert.equal(result.error.line, line, `${source} line`);
        assert.equal(result.error.column, column, `${source} column`);
    }
});

test("duplicate keys are warnings, not errors", () => {
    const result = analyzeJson('{\n  "a": 1,\n  "a": 2\n}');
    assert.equal(result.ok, true);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0].message, /Duplicate key "a"/);
    assert.equal(result.warnings[0].line, 3);
});

test("very deep nesting is rejected without a stack overflow", () => {
    const result = analyzeJson("[".repeat(10_000) + "]".repeat(10_000));
    assert.equal(result.ok, false);
    assert.match(result.error.message, /deeper than/);
});

test("code frames point at the column", () => {
    assert.equal(codeFrame('{\n  "age": 3\n}', 2, 3), '2 |   "age": 3\n  |   ^');
    assert.deepEqual(lineColumn("ab\ncd", 4), { line: 2, column: 2 });
});

test("messages are available in Turkish", () => {
    const trailing = analyzeJson('{"a": 1,}', { locale: "tr" });
    assert.match(trailing.error.message, /sondaki virgüle izin verilmez/);
    assert.equal(trailing.error.column, 9);
    assert.match(analyzeJson('{"a": 1, "a": 2}', { locale: "tr" }).warnings[0].message, /"a" anahtarı birden fazla kez/);
    assert.match(analyzeJson("[1] x", { locale: "tr" }).error.message, /beklenmeyen 'x'/);
    // Every Turkish message differs from its English counterpart.
    for (const source of ['{"a": 1,}', "{'a': 1}", '{"a": 01}', "", '{"a": NaN}', '{\n "x": [', '{"a" 1}', '{"a": "\\q"}']) {
        assert.notEqual(analyzeJson(source, { locale: "tr" }).error.message, analyzeJson(source).error.message, source);
    }
});
