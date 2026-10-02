// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { runBefunge } = await load("lib/runtimes/befunge.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

test("the instruction pointer walks, wraps and bridges", () => {
    assert.equal(runBefunge("55+\"!tgonaH morf dlroW olleH\">:#,_@").output, "Hello World from Hanogt!\n");
    assert.equal(runBefunge("v\n>1+:.:9`#@_\n").output, "1 2 3 4 5 6 7 8 9 10 ");
    // Wrapping: going left from column 1 continues at the right edge.
    assert.equal(runBefunge("<@.+29").output, "11 ");
});

test("arithmetic, stack and self-modifying code follow Befunge-93", () => {
    assert.equal(runBefunge("93-.92*.73/.73%.10/.@").output, "6 18 2 1 0 ");
    assert.equal(runBefunge("12\\..@").output, "1 2 ", "\\ swaps");
    assert.equal(runBefunge("5:..@").output, "5 5 ", ": duplicates");
    assert.equal(runBefunge("$.@").output, "0 ", "popping an empty stack yields 0");
    assert.equal(runBefunge("34`.43`.0!.5!.@").output, "0 1 1 0 ", "` compares, ! negates");
    // p writes '@' (64) at (9, 0), so the program stops there instead of looping.
    assert.equal(runBefunge("88*90p1.     ").output, "1 ");
    assert.equal(runBefunge("40g,@").output, "@", "g reads the grid");
    assert.equal(runBefunge("50g.@").output, "32 ", "cells outside the source are spaces");
});

test("& and ~ read numbers and characters from the Input tab", () => {
    assert.equal(runBefunge("&&+.@", { stdin: "3 4\n" }).output, "7 ");
    assert.equal(runBefunge("~:1+!#@_,", { stdin: "abc" }).output, "abc");
    assert.equal(runBefunge("&.@", { stdin: "" }).output, "-1 ", "end of input pushes -1");
    assert.equal(runBefunge("&>:1-:v v *_$.@\n ^    _$>\\:^\n", { stdin: "5" }).output, "120 ");
});

test("unknown instructions and endless loops report a position", () => {
    const unknown = runBefunge("1x@");
    assert.equal(unknown.exitCode, 1);
    assert.equal(unknown.error.line, 1);
    assert.equal(unknown.error.column, 2);
    assert.match(unknown.error.message, /^Unknown instruction 'x'/);
    const loop = runBefunge(">v\n^<", { maxSteps: 1000 });
    assert.equal(loop.exitCode, 1);
    assert.match(loop.error.message, /Step limit exceeded \(1000 instructions\)/);
    let polls = 0;
    assert.equal(runBefunge(">v\n^<", { shouldStop: () => ++polls > 2 }).exitCode, 1);
});

test("every Befunge template runs cleanly", () => {
    const hello = runBefunge(LANGUAGES.find((language) => language.id === "befunge").template);
    assert.equal(hello.output, "Hello World from Hanogt!\n");
    assert.equal(hello.exitCode, 0);
    for (const template of FILE_TEMPLATES.filter((item) => item.language === "befunge")) {
        const result = runBefunge(template.code, { stdin: template.stdin ?? "" });
        assert.equal(result.error, undefined, template.id);
        assert.equal(result.exitCode, 0, template.id);
    }
    const sum = FILE_TEMPLATES.find((template) => template.id === "befunge-sum");
    assert.equal(runBefunge(sum.code, { stdin: sum.stdin }).output.trim(), "42");
});
