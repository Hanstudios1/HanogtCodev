// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { assembleWhitespace: assemble, runWhitespace: run, parseWhitespace, disassembleWhitespace } = await load("lib/runtimes/whitespace.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");

const output = (lines, options) => run(assemble(lines), options).output;

test("only space, tab and line feed are code; everything else is a comment", () => {
    const program = assemble(["push 72", "label ST", "call ST", "end"]);
    assert.match(program, /^ S S S\tT/, "the assembler annotates every character");
    assert.deepEqual(disassembleWhitespace(parseWhitespace(program)), ["push 72", "label 01", "call 01", "end"]);
    const stripped = program.replace(/[^ \t\n]/g, "");
    assert.deepEqual(disassembleWhitespace(parseWhitespace(stripped)), ["push 72", "label 01", "call 01", "end"]);
});

test("stack, arithmetic and heap instructions", () => {
    assert.equal(output(["push 6", "push 7", "mul", "printn", "end"]), "42");
    assert.equal(output(["push -5", "push 3", "add", "printn", "end"]), "-2");
    assert.equal(output(["push 9007199254740993", "push 2", "mul", "printn", "end"]), "18014398509481986", "numbers are arbitrary precision");
    assert.equal(output(["push -7", "push 2", "mod", "printn", "push -7", "push 2", "div", "printn", "end"]), "1-4", "div and mod floor like Haskell");
    assert.equal(output(["push 1", "push 2", "push 3", "copy 2", "printn", "slide 1", "printn", "printn", "end"]), "131");
    assert.equal(output(["push 1", "push 2", "swap", "printn", "drop", "end"]), "1");
    assert.equal(output(["push 1", "push 99", "store", "push 1", "retrieve", "printn", "end"]), "99");
});

test("labels, calls and conditional jumps", () => {
    assert.equal(output(["call T", "push 2", "printn", "end", "label T", "push 1", "printn", "ret"]), "12");
    assert.equal(output(["push -1", "jn S", "push 0", "printn", "label S", "push 0", "jz T", "push 9", "printn", "label T", "push 5", "printn", "end"]), "5");
});

test("readn and readc store input on the heap; the end of input stores -1", () => {
    assert.equal(output(["push 0", "readn", "push 0", "retrieve", "printn", "push 1", "readc", "push 1", "retrieve", "printc", "end"], { stdin: "123\nx" }), "123x");
    assert.equal(output(["push 0", "readc", "push 0", "retrieve", "printn", "end"], { stdin: "" }), "-1");
});

test("errors carry the position of the instruction", () => {
    const division = run(assemble(["push 1", "push 0", "div", "printn", "end"]));
    assert.equal(division.exitCode, 1);
    assert.deepEqual(division.error, { message: "Division by zero.", line: 3, column: 1 });
    assert.equal(run(assemble(["add", "end"])).error.message, "add needs 2 values on the stack but there are 0.");
    assert.equal(run(assemble(["add", "end"]), { locale: "tr" }).error.message, "add için yığında 2 değer gerekiyor, 0 var.");
    assert.match(run(assemble(["jump TT", "end"])).error.message, /undefined label/);
    assert.match(run(assemble(["label S", "label S", "end"])).error.message, /label is defined twice/);
    assert.match(run("   ").error.message, /ends in the middle of an instruction/);
    const loop = run(assemble(["label S", "jump S"]), { maxSteps: 1000 });
    assert.equal(loop.exitCode, 1);
    assert.match(loop.error.message, /Step limit exceeded/);
});

test("the starter template prints the greeting", () => {
    const result = run(LANGUAGES.find((language) => language.id === "whitespace").template);
    assert.equal(result.output, "Hello World from Hanogt!\n");
    assert.equal(result.exitCode, 0);
    assert.equal(result.error, undefined);
});
