// jq in the browser (jq-wasm): the filter runs on the Input tab's JSON. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ROOT, load } from "./setup.mjs";

const { runJq } = await load("lib/runtimes/jq.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

// The worker loads the self-hosted copy of this file (public/runtimes/jq/jq.wasm).
const wasmUrl = fileURLToPath(new URL("node_modules/jq-wasm/dist/build/jq.wasm", ROOT));
const jq = (filter, stdin = "", fileName) => runJq(filter, { stdin, wasmUrl, fileName });

test("results print like the jq command line: pretty JSON, one value per line", async () => {
    const result = await jq(".users[] | {name}", "{\"users\": [{\"name\": \"Ada\", \"age\": 36}, {\"name\": \"Linus\"}]}");
    assert.equal(result.stdout, "{\n  \"name\": \"Ada\"\n}\n{\n  \"name\": \"Linus\"\n}\n");
    assert.equal(result.stderr, "");
    assert.equal(result.exitCode, 0);
    assert.match(result.version, /^jq 1\.\d+\.\d+ \(WebAssembly\)$/);
    assert.equal((await jq(".a", "{\"a\": 1} {\"a\": 2}")).stdout, "1\n2\n", "several input values are read one after another");
    assert.equal((await jq("\"x\", 3, [1, 2]")).stdout, "\"x\"\n3\n[\n  1,\n  2\n]\n");
    assert.equal((await jq("empty")).stdout, "");
});

test("an empty Input tab is null", async () => {
    assert.equal((await jq(".")).stdout, "null\n");
    assert.equal((await jq(". // \"default\"", "  \n")).stdout, "\"default\"\n");
});

test("errors keep jq's message; compile errors also name the filter's line and column", async () => {
    const compile = await jq("def f: .;\n\n  .x | ]", "", "report.jq");
    assert.equal(compile.exitCode, 3);
    assert.match(compile.stderr, /^jq: error: syntax error, unexpected INVALID_CHARACTER .*at <top-level>, line 3, column 8:\n {4}at report\.jq:3:8\n/);
    assert.match(compile.stderr, /jq: 1 compile error\n$/);
    const runtime = await jq(".a.b", "{\"a\": 1}");
    assert.equal(runtime.exitCode, 5);
    assert.equal(runtime.stderr, "jq: error (at <stdin>:0): Cannot index number with string (\"b\")\n");
    const input = await jq(".", "{\"a\": 1,}");
    assert.equal(input.exitCode, 5);
    assert.match(input.stderr, /^jq: parse error: .* at line 1, column 9\n {4}\(the JSON in the Input tab could not be read\)\n$/);
    assert.match((await runJq(".", { stdin: "[1,", wasmUrl, locale: "tr" })).stderr, /Girdi sekmesindeki JSON okunamadı/);
    assert.equal((await jq("error(\"custom\")")).stderr, "jq: error (at <stdin>:0): custom\n");
});

test("every jq template runs", async () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "jq").template, stdin: "" },
        ...FILE_TEMPLATES.filter((template) => template.language === "jq"),
    ];
    assert.ok(samples.length >= 2);
    for (const sample of samples) {
        const result = await jq(sample.code, sample.stdin ?? "");
        assert.equal(result.exitCode, 0, `${sample.id}: ${result.stderr}`);
        assert.equal(result.stderr, "", sample.id);
    }
    assert.match((await jq(samples[0].code)).stdout, /^"Hello World from Hanogt!"\n"Ada, Linus, Grace"\n/);
    const report = FILE_TEMPLATES.find((template) => template.id === "jq-report");
    assert.equal((await jq(report.code, report.stdin)).stdout, "\"Grace: 1 order(s), total 4200\"\n\"Ada: 2 order(s), total 870\"\n\"Linus: 1 order(s), total 500\"\n");
});
