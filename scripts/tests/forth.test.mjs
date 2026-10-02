// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { runForth } = await load("lib/runtimes/forth.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES, PROJECT_TEMPLATES } = await load("lib/runtimes/templates.ts");

const out = (source, options) => runForth(source, options).output;

test("arithmetic, the stack and number bases", () => {
    assert.equal(out("2 3 + . 10 3 / . 10 3 mod . -7 2 / . 7 negate abs . 1 2 3 .s cr drop drop drop"), "5 3 1 -4 7 <3> 1 2 3 \n");
    assert.equal(out("hex ff . 10 . decimal 255 hex . decimal cr -1 u. cr 16 base ! 1A . decimal"), "FF 10 FF \n18446744073709551615 \n1A ");
    const left = runForth("1 2 3");
    assert.deepEqual(left.stack, [1, 2, 3]);
    assert.equal(left.exitCode, 0);
});

test("definitions and control structures", () => {
    assert.equal(out(": stars 0 ?do [char] * emit loop ; 5 stars cr : count 10 0 do i . 2 +loop ; count cr : down 0 10 do i . -1 +loop ; down cr"), "*****\n0 2 4 6 8 \n10 9 8 7 6 5 4 3 2 1 0 \n");
    assert.equal(out(": countdown begin dup . 1- dup 0= until drop ; 5 countdown cr : w begin dup 0> while dup . 1- repeat drop ; 3 w cr"), "5 4 3 2 1 \n3 2 1 \n");
    assert.equal(out(": fact ( n -- n! ) dup 1 > if dup 1- recurse * else drop 1 then ; 10 fact . cr"), "3628800 \n");
    assert.equal(out(": grade case 1 of .\" one\" endof 2 of .\" two\" endof .\" other\" endcase cr ; 1 grade 2 grade 5 grade"), "one\ntwo\nother\n");
    assert.equal(out(": l 10 0 do i 5 = if leave then i . loop ; l cr"), "0 1 2 3 4 \n");
    assert.equal(out(": grid 3 0 do 3 0 do j i * . loop cr loop ; grid"), "0 0 0 \n0 1 2 \n0 2 4 \n");
});

test("variables, values, CREATE/DOES>, DEFER and EVALUATE", () => {
    assert.equal(out("variable x 42 x ! x @ . 5 x +! x ? cr 10 constant ten ten . 7 value v v . 9 to v v . cr"), "42 47 \n10 7 9 \n");
    assert.equal(out("create arr 5 cells allot 3 arr 2 cells + ! arr 2 cells + @ . cr : const create , does> @ ; 99 const k k . cr"), "3 \n99 \n");
    assert.equal(out("defer greet : hi .\" hi\" ; ' hi is greet greet cr :noname .\" anon\" ; execute cr"), "hi\nanon\n");
    assert.equal(out(": ten 10 ; immediate : t [ 2 3 + ] literal . ; t cr"), "5 \n");
    assert.equal(out(": hi s\" Hello\" type space .\" there\" ; hi cr s\" 6 7 *\" evaluate . cr"), "Hello there\n42 \n");
});

test("KEY and ACCEPT read the Input tab", () => {
    assert.equal(out("key emit key emit key . pad 80 accept pad swap type", { stdin: "ab\nhello world\n" }), "ab10 hello world");
    assert.equal(out("pad 80 accept pad swap evaluate 2 * .", { stdin: "21\n" }), "42 ");
});

test("errors carry the word, line and column", () => {
    const undefinedWord = runForth(": x 1 2 + ;\nfoo");
    assert.equal(undefinedWord.exitCode, 1);
    assert.deepEqual(undefinedWord.error, { message: "Undefined word: foo", line: 2, column: 1 });
    const underflow = runForth("1 + ");
    assert.equal(underflow.error.message, "Stack underflow: + needs 2 values but the stack has 1");
    assert.equal(underflow.error.column, 3);
    assert.equal(runForth(": d 1 0 / ; d").error.message, "Division by zero (/)");
    assert.match(runForth(": foo 1 2").error.message, /missing ;/);
    assert.match(runForth("if then").error.message, /IF can only be used inside a : definition/);
    assert.match(runForth(": r dup 0= if exit then 1- recurse ; 100000 r .").error.message, /Return stack overflow/);
    assert.match(runForth("3.14 .").error.message, /Floating-point numbers are not supported/);
    assert.equal(runForth("bilinmeyen", { locale: "tr" }).error.message, "Tanımsız kelime: bilinmeyen");
});

test("BYE ends the program and endless loops hit the step limit", () => {
    assert.equal(out("1 . bye 2 ."), "1 ");
    const forever = runForth(": forever begin again ; forever", { maxSteps: 100000 });
    assert.equal(forever.exitCode, 1);
    assert.match(forever.error.message, /Step limit exceeded/);
    let polls = 0;
    const stopped = runForth(": forever begin again ; forever", { shouldStop: () => ++polls > 3 });
    assert.equal(stopped.exitCode, 1);
});

test("every Forth template runs cleanly", () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "forth").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "forth"),
        ...PROJECT_TEMPLATES.flatMap((project) => project.files.filter((file) => file.language === "forth").map((file) => ({ id: `${project.id}/${file.name}`, code: file.code }))),
    ];
    assert.ok(samples.length >= 3);
    for (const sample of samples) {
        const result = runForth(sample.code, { stdin: sample.stdin ?? "" });
        assert.equal(result.error, undefined, sample.id);
        assert.equal(result.exitCode, 0, sample.id);
        assert.deepEqual(result.stack, [], `${sample.id} leaves the stack empty`);
    }
    assert.match(out(LANGUAGES.find((language) => language.id === "forth").template), /^Hello World from Hanogt!\n/);
    assert.equal(out(FILE_TEMPLATES.find((template) => template.id === "forth-input").code, { stdin: "7 6\n" }).trim(), "Product: 42");
});
