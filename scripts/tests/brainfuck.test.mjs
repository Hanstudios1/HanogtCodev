// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { runBrainfuck, compileBrainfuck } = await load("lib/runtimes/brainfuck.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

/** A deliberately simple reference interpreter to check the optimiser against. */
function naive(source, stdin = "") {
    const code = [...source].filter((char) => "+-<>.,[]".includes(char));
    const jumps = new Map();
    const stack = [];
    code.forEach((char, index) => {
        if (char === "[") stack.push(index);
        if (char === "]") {
            const open = stack.pop();
            jumps.set(open, index);
            jumps.set(index, open);
        }
    });
    const tape = new Uint8Array(30000);
    const input = new TextEncoder().encode(stdin);
    const out = [];
    let pointer = 0;
    let read = 0;
    let pc = 0;
    for (let steps = 0; pc < code.length && steps < 2_000_000; pc += 1, steps += 1) {
        const char = code[pc];
        if (char === "+") tape[pointer] = (tape[pointer] + 1) & 255;
        else if (char === "-") tape[pointer] = (tape[pointer] - 1) & 255;
        else if (char === ">") pointer += 1;
        else if (char === "<") pointer -= 1;
        else if (char === ".") out.push(tape[pointer]);
        else if (char === ",") tape[pointer] = read < input.length ? input[read++] : 0;
        else if (char === "[" && tape[pointer] === 0) pc = jumps.get(pc);
        else if (char === "]" && tape[pointer] !== 0) pc = jumps.get(pc);
    }
    return { text: new TextDecoder().decode(Uint8Array.from(out)), completed: pc >= code.length };
}

test("the registry template prints Hello World", () => {
    const template = LANGUAGES.find((language) => language.id === "brainfuck").template;
    const result = runBrainfuck(template);
    assert.equal(result.exitCode, 0);
    assert.equal(result.output, "Hello World!\n");
});

test("template comments contain no Brainfuck commands", () => {
    for (const template of [LANGUAGES.find((language) => language.id === "brainfuck").template, ...FILE_TEMPLATES.filter((item) => item.language === "brainfuck").map((item) => item.code)]) {
        const commentLines = template.split("\n").filter((line) => /[A-Za-z]/.test(line));
        for (const line of commentLines) assert.doesNotMatch(line, /[+\-<>.,[\]]/, line);
    }
});

test("cat copies UTF-8 input byte by byte and EOF reads as 0", () => {
    const result = runBrainfuck(",[.,]", { stdin: "Merhaba dünya ğüşıöç 😀" });
    assert.equal(result.output, "Merhaba dünya ğüşıöç 😀");
    assert.equal(result.exitCode, 0);
});

test("unbalanced brackets report line and column", () => {
    const missingClose = runBrainfuck("+\n++[\n>+");
    assert.equal(missingClose.exitCode, 1);
    assert.equal(missingClose.error.line, 2);
    assert.equal(missingClose.error.column, 3);
    assert.match(missingClose.error.message, /Unmatched '\['/);
    const extraClose = runBrainfuck("+]");
    assert.equal(extraClose.error.line, 1);
    assert.equal(extraClose.error.column, 2);
    assert.match(extraClose.error.message, /Unmatched '\]'/);
    assert.throws(() => compileBrainfuck("[[]"));
});

test("moving left of cell 0 is a runtime error", () => {
    const result = runBrainfuck("+<");
    assert.equal(result.exitCode, 1);
    assert.match(result.error.message, /left of cell 0/);
});

test("the step limit points at the endless loop", () => {
    const result = runBrainfuck("+\n [ ]", { maxSteps: 10_000 });
    assert.equal(result.exitCode, 1);
    assert.match(result.error.message, /step limit/);
    assert.equal(result.error.line, 2);
    assert.equal(result.error.column, 2);
});

test("shouldStop ends long programs", () => {
    let calls = 0;
    const result = runBrainfuck("+[]", { shouldStop: () => ++calls > 2 });
    assert.equal(result.exitCode, 1);
    assert.match(result.error.message, /time limit/);
});

test("the tape grows on demand and respects maxCells", () => {
    assert.equal(runBrainfuck(">".repeat(40_000) + "+.", {}).output, "\u0001");
    const limited = runBrainfuck(">".repeat(200) + "+", { maxCells: 100 });
    assert.equal(limited.exitCode, 1);
    assert.match(limited.error.message, /tape limit/);
});

test("optimised loops (clear, scan, multiply) match a naive interpreter", () => {
    const programs = [
        "+++++[>+++++<-]>.",            // multiply
        "+++++[>+++<-]>[>++<-]>.",      // chained multiply
        "------[>+<+]>.",               // multiply with an incrementing counter (wraps)
        "+++[-]>++[+]<.>.",             // clear loops
        "+>+>+>+>[<]>.",                // scan left
        "+>+>+>>+<<<<[>]<.",            // scan right
        "++>+++++[<+>-]++++++++[<++++++>-]<.", // classic add + print
        "++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.",
    ];
    for (const program of programs) assert.equal(runBrainfuck(program).output, naive(program).text, program);
});

test("random programs behave like the naive interpreter", () => {
    let seed = 12345;
    const random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
    const piece = (depth) => {
        let text = "";
        const length = 1 + Math.floor(random() * 8);
        for (let index = 0; index < length; index += 1) {
            const choice = random();
            if (choice < 0.3) text += "+".repeat(1 + Math.floor(random() * 5));
            else if (choice < 0.45) text += "-".repeat(1 + Math.floor(random() * 3));
            else if (choice < 0.6) text += ">";
            else if (choice < 0.7) text += "<";
            else if (choice < 0.8) text += ".";
            else if (choice < 0.85) text += ",";
            else if (depth < 3) text += `[${piece(depth + 1)}-]`;
        }
        return text;
    };
    let compared = 0;
    for (let round = 0; round < 300; round += 1) {
        // Start a few cells in so "<" stays on the tape.
        const program = `>>>>${piece(0)}`;
        const expected = naive(program, "abc");
        if (!expected.completed) continue;
        const actual = runBrainfuck(program, { stdin: "abc", maxSteps: 3_000_000 });
        if (actual.error && /left of cell 0/.test(actual.error.message)) continue;
        assert.equal(actual.exitCode, 0, `program ${program}: ${actual.error?.message}`);
        assert.equal(actual.output, expected.text, `program ${program}`);
        compared += 1;
    }
    assert.ok(compared >= 100, `only ${compared} programs were comparable`);
});
