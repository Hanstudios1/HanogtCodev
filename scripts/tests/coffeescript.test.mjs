// CoffeeScript: compiled in the browser, then run by the JavaScript runner. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { compileCoffeeScript } = await load("lib/runtimes/coffeescript.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

/** Runs compiled code the way the worker's JavaScript runner does (an async wrapper three lines down). */
async function run(js, stdin = []) {
    const lines = [];
    const fakeConsole = { log: (...args) => lines.push(args.join(" ")) };
    const prompt = (message) => { if (message) lines.push(message); return stdin.shift() ?? null; };
    await new Function("console", "prompt", "input", "readline", `return (async () => {\n${js}\n})();`)(fakeConsole, prompt, prompt, prompt);
    return lines.join("\n");
}

test("CoffeeScript compiles bare, with a working source map", async () => {
    const compiled = compileCoffeeScript("square = (x) -> x * x\nconsole.log square 5\nconsole.log (n * 2 for n in [1..3])");
    assert.equal(compiled.error, undefined);
    assert.match(compiled.version, /^CoffeeScript 2\.\d+\.\d+$/);
    assert.match(compiled.js, /^var n, square;\n/, "bare: no wrapper function");
    assert.equal(await run(compiled.js), "25\n2,4,6");
    const failing = compileCoffeeScript("x = 1\n\ny = ->\n  obj = null\n  obj.prop\n\ny()\n");
    const line = failing.js.split("\n").findIndex((text) => text.includes("obj.prop")) + 1;
    assert.deepEqual(failing.sourceLocation(line, failing.js.split("\n")[line - 1].indexOf("obj.prop") + 1), { line: 5, column: 3 });
});

test("syntax errors carry a 1-based line and column", () => {
    assert.deepEqual(compileCoffeeScript("x = (\n  1 +\n").error, { message: "missing )", line: 1, column: 5 });
    assert.deepEqual(compileCoffeeScript("a = 1\nb = a ->> 2\n").error, { message: "unexpected >", line: 2, column: 9 });
    assert.equal(compileCoffeeScript("x = (").js, "");
});

test("prompt reads the Input tab and top-level await works", async () => {
    const compiled = compileCoffeeScript("name = prompt 'Name?'\nconsole.log \"Hi #{name}\"\nawait new Promise (r) -> setTimeout r, 5\nconsole.log 'done'");
    assert.equal(await run(compiled.js, ["Ada"]), "Name?\nHi Ada\ndone");
});

test("every CoffeeScript template compiles and runs", async () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "coffeescript").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "coffeescript"),
    ];
    assert.ok(samples.length >= 2);
    for (const sample of samples) {
        const compiled = compileCoffeeScript(sample.code);
        assert.equal(compiled.error, undefined, `${sample.id}: ${compiled.error?.message}`);
        assert.ok((await run(compiled.js)).length > 0, sample.id);
    }
    assert.equal(await run(compileCoffeeScript(samples[0].code).js), "Hello World from Hanogt!\nSquares: 1, 4, 9, 16, 25\nRex says hello");
    assert.equal(await run(compileCoffeeScript(FILE_TEMPLATES.find((template) => template.id === "coffeescript-classes").code).js), "circle: area 3.14\nrectangle: area 12.00\ncircle: area 19.63\nLargest: circle\nDestructured: circle 2.5");
});
