// Less → CSS in the browser (the Less compiler's core). Run: node --test scripts/tests/
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ROOT, load } from "./setup.mjs";

const { compileLess, LESS_VERSION } = await load("lib/runtimes/less.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

test("Less compiles to CSS", async () => {
    const result = await compileLess("@c: #6366f1;\n.mixin(@r) { border-radius: @r; }\n.a { color: @c; .mixin(4px); width: (10px * 3); &:hover { color: darken(@c, 10%); } }\n@media (min-width: 768px) { .a { padding: 1rem; } }\n");
    assert.equal(result.error, undefined);
    assert.equal(result.css, ".a {\n  color: #6366f1;\n  border-radius: 4px;\n  width: 30px;\n}\n.a:hover {\n  color: #3438ed;\n}\n@media (min-width: 768px) {\n  .a {\n    padding: 1rem;\n  }\n}\n");
    assert.equal(result.version, `Less ${LESS_VERSION}`);
    assert.equal((await compileLess("@x: 1;")).css, "", "variables alone produce no CSS");
});

test("errors carry Less's message and a 1-based line and column", async () => {
    assert.deepEqual((await compileLess(".a { color: @missing; }")).error, { message: "NameError: variable @missing is undefined", line: 1, column: 13 });
    assert.deepEqual((await compileLess(".a {\n  color: red;\n  .b {\n")).error, { message: "ParseError: Unrecognised input. Possibly missing something", line: 4, column: 1 });
    assert.match((await compileLess("@import 'other.less';")).error.message, /^SyntaxError: Could not find a file-manager for other\.less/, "there are no other files to import");
    assert.match((await compileLess("@plugin 'x';")).error.message, /^SyntaxError:/);
    assert.match((await compileLess("@x: ~`1 + 1`;\n.a { b: @x; }")).error.message, /Inline JavaScript is not enabled/);
});

test("LESS_VERSION matches the installed compiler", () => {
    const installed = JSON.parse(fs.readFileSync(new URL("node_modules/less/package.json", ROOT), "utf8")).version;
    assert.equal(LESS_VERSION, installed, "update LESS_VERSION in src/lib/runtimes/less.ts");
});

test("every Less template compiles", async () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "less").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "less"),
    ];
    assert.ok(samples.length >= 2);
    for (const sample of samples) {
        const result = await compileLess(sample.code);
        assert.equal(result.error, undefined, sample.id);
        assert.ok(result.css.trim(), sample.id);
    }
    assert.match((await compileLess(samples[0].code)).css, /content: " · Hello World from Hanogt!";/);
    assert.match((await compileLess(FILE_TEMPLATES.find((template) => template.id === "less-themes").code)).css, /\.btn-danger:hover \{\n {2}background: #e24949;\n\}/);
});
