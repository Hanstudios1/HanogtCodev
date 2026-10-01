// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { linkifyOutput, stripAnsi } = await load("components/Editor/output-links.ts");

const links = (text, names) => linkifyOutput(text, names).filter((segment) => typeof segment !== "string");

test("locations in runtime and compiler output become links", () => {
    assert.deepEqual(links('Traceback:\n  File "app.py", line 3, in <module>', ["app.py"]), [{ text: 'File "app.py", line 3', line: 3 }]);
    assert.deepEqual(links("TypeError: x\n    at main.js:12:5", ["main.js"]), [{ text: "main.js:12:5", line: 12, column: 5 }]);
    assert.deepEqual(links("prog.cc:5:10: error: expected ';'", ["main.cpp"]), [{ text: "prog.cc:5:10", line: 5, column: 10 }]);
    assert.deepEqual(links("prog.java:7: error: cannot find symbol", ["Main.java"]), [{ text: "prog.java:7", line: 7 }]);
    assert.deepEqual(links("prog.cs(4,13): error CS1002", ["Program.cs"]), [{ text: "prog.cs(4,13)", line: 4, column: 13 }]);
    assert.deepEqual(links("File.kt:2:5: error: unresolved", ["Main.kt"]), [{ text: "File.kt:2:5", line: 2, column: 5 }]);
    assert.deepEqual(links("./prog.go:6:2: undefined: x", ["main.go"]), [{ text: "prog.go:6:2", line: 6, column: 2 }]);
    assert.deepEqual(links("SyntaxError: bad\n    at my file (1).js:3:1", ["my file (1).js"]), [{ text: "my file (1).js:3:1", line: 3, column: 1 }]);
});

test("text around links is preserved and nothing else is linked", () => {
    const segments = linkifyOutput("before main.py:2 after", ["main.py"]);
    assert.deepEqual(segments, ["before ", { text: "main.py:2", line: 2 }, " after"]);
    assert.deepEqual(linkifyOutput("Result: 3:4 ratio", ["main.py"]), ["Result: 3:4 ratio"]);
    assert.deepEqual(linkifyOutput("", ["main.py"]), []);
});

test("ANSI colour codes are removed", () => {
    assert.equal(stripAnsi("\u001b[1m\u001b[31merror\u001b[0m: x"), "error: x");
});
