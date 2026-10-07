// SCSS → CSS in the browser (Dart Sass). Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { compileScss } = await load("lib/runtimes/scss.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

test("SCSS compiles to expanded CSS with the built-in modules", () => {
    const result = compileScss("@use \"sass:math\";\n$p: #6366f1;\n.a { color: $p; padding: math.div(48px, 2); &:hover { color: red; } }\n@each $n, $s in (sm: 12px, lg: 20px) { .t-#{$n} { font-size: $s; } }\n");
    assert.equal(result.error, undefined);
    assert.equal(result.css, ".a {\n  color: #6366f1;\n  padding: 24px;\n}\n.a:hover {\n  color: red;\n}\n\n.t-sm {\n  font-size: 12px;\n}\n\n.t-lg {\n  font-size: 20px;\n}\n");
    assert.match(result.version, /^Dart Sass \d+\.\d+\.\d+/);
    assert.deepEqual(result.notices, []);
});

test("errors have a line, a column and Sass's code frame", () => {
    const missing = compileScss(".a {\n  color: $missing;\n}");
    assert.equal(missing.error.message, "Error: Undefined variable.");
    assert.equal(missing.error.line, 2);
    assert.equal(missing.error.column, 10);
    assert.match(missing.error.frame, /2 │ {3}color: \$missing;\n {2}│ {10}\^{8}/);
    assert.doesNotMatch(missing.error.frame, /root stylesheet/);
    assert.equal(compileScss("@use 'other';").error.message, "Error: Can't find stylesheet to import.", "there are no other files to use");
});

test("@warn, @debug and deprecations become notices with their lines", () => {
    const result = compileScss("$c: #f00;\n.a { color: darken($c, 10%); }\n@debug \"hi\";\n@warn \"careful\";\n");
    assert.equal(result.css, ".a {\n  color: #cc0000;\n}\n");
    assert.deepEqual(result.notices.map((notice) => [notice.kind, notice.line ?? null]), [["deprecation", 2], ["deprecation", 2], ["debug", 3], ["warning", null]]);
    assert.equal(result.notices[2].message, "hi");
    assert.equal(result.notices[3].message, "careful");
});

test("every SCSS template compiles without notices", () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "scss").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "scss"),
    ];
    assert.ok(samples.length >= 2);
    for (const sample of samples) {
        const result = compileScss(sample.code);
        assert.equal(result.error, undefined, `${sample.id}: ${result.error?.message}`);
        assert.deepEqual(result.notices, [], sample.id);
        assert.ok(result.css.trim(), sample.id);
    }
    assert.match(compileScss(samples[0].code).css, /\.text-large \{\n {2}font-size: 24px;\n\}/);
    assert.match(compileScss(FILE_TEMPLATES.find((template) => template.id === "scss-utilities").code).css, /^\.card--dark, \.card \{\n {2}border-radius: 12px;\n {2}padding: 1\.5rem;\n\}/m);
});
