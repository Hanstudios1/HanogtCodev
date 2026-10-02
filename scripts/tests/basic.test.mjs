// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { runBasic, formatBasicNumber } = await load("lib/runtimes/basic.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES, PROJECT_TEMPLATES } = await load("lib/runtimes/templates.ts");

const out = (source, options) => runBasic(source, options).output;

test("PRINT formats numbers like QBasic", () => {
    assert.equal(formatBasicNumber(1 / 3), ".3333333");
    assert.equal(formatBasicNumber(-2.5), "-2.5");
    assert.equal(out("PRINT 1, 2, 3\nPRINT 1/3; -2.5; 10/4; 1E10; 2^10\nPRINT \"A\"; 5; \"B\"\n"), " 1             2             3 \n .3333333 -2.5  2.5  10000000000  1024 \nA 5 B\n");
    assert.equal(out("x = 7: y = 2\nPRINT x \\ y, x MOD y, x / y\nPRINT STR$(5); STR$(-5); VAL(\"3.5\") + 1\n"), " 3             1             3.5 \n 5-5 4.5 \n");
    assert.equal(out("PRINT \"a\"; TAB(5); \"b\"; SPC(3); \"c\"\nWRITE 1, \"two\", 3.5\n"), "a   b   c\n1,\"two\",3.5\n");
});

test("line numbers, GOTO, GOSUB and ON … GOSUB", () => {
    assert.equal(out("10 FOR I = 1 TO 5\n20 PRINT I;\n30 NEXT I\n40 PRINT\n50 GOSUB 100\n60 END\n100 PRINT \"in sub\"\n110 RETURN\n"), " 1  2  3  4  5 \nin sub\n");
    assert.equal(out("FOR k = 1 TO 3\nON k GOSUB 100, 200, 300\nNEXT\nEND\n100 PRINT \"one\": RETURN\n200 PRINT \"two\": RETURN\n300 PRINT \"three\": RETURN\n"), "one\ntwo\nthree\n");
    assert.equal(out("x = 5\nIF x > 3 THEN PRINT \"big\" ELSE PRINT \"small\"\nIF x < 3 THEN PRINT \"no\"\nIF x = 5 THEN 100\nPRINT \"skipped\"\n100 PRINT \"jumped\"\n"), "big\njumped\n");
});

test("structured blocks: IF/ELSEIF, WHILE/WEND, DO/LOOP, SELECT CASE, EXIT", () => {
    const fizz = out("FOR i = 1 TO 15\n  IF i MOD 15 = 0 THEN\n    PRINT \"FizzBuzz\"\n  ELSEIF i MOD 3 = 0 THEN\n    PRINT \"Fizz\"\n  ELSEIF i MOD 5 = 0 THEN\n    PRINT \"Buzz\"\n  ELSE\n    PRINT i\n  END IF\nNEXT i\n");
    assert.equal(fizz.split("\n")[14], "FizzBuzz");
    assert.equal(fizz.split("\n")[2], "Fizz");
    assert.equal(out("n = 3\nWHILE n > 0\n  PRINT n;\n  n = n - 1\nWEND\nPRINT\nk = 0\nDO\n  k = k + 1\n  IF k = 3 THEN EXIT DO\nLOOP WHILE k < 10\nPRINT \"k=\"; k\nDO UNTIL k >= 5: k = k + 1: LOOP\nPRINT k\n"), " 3  2  1 \nk= 3 \n 5 \n");
    assert.equal(out("FOR g = 1 TO 4\nSELECT CASE g\n  CASE 1: PRINT \"one\"\n  CASE 2, 3: PRINT \"two or three\"\n  CASE IS > 3: PRINT \"big\"\n  CASE ELSE: PRINT \"?\"\nEND SELECT\nNEXT\n"), "one\ntwo or three\ntwo or three\nbig\n");
    assert.equal(out("FOR i = 1 TO 10\n  IF i = 4 THEN EXIT FOR\n  PRINT i;\nNEXT\nPRINT\nPRINT \"after\"; i\n"), " 1  2  3 \nafter 4 \n");
    assert.equal(out("FOR i = 5 TO 1\nPRINT \"never\"\nNEXT\nPRINT \"done\"; i\nFOR j = 10 TO 1 STEP -3: PRINT j;: NEXT\n"), "done 5 \n 10  7  4  1 ");
});

test("SUB, FUNCTION, DEF FN, arrays, DATA and strings", () => {
    const program = "DECLARE SUB Greet (who$)\nDECLARE FUNCTION Fact# (n)\nCALL Greet(\"Ada\")\nGreet \"Linus\"\nPRINT Fact(10)\na = 1: b = 2\nSwapThem a, b\nPRINT a; b\nEND\n\nSUB Greet (who$)\n  PRINT \"Hi \"; who$\nEND SUB\n\nFUNCTION Fact# (n)\n  IF n <= 1 THEN Fact = 1 ELSE Fact = n * Fact(n - 1)\nEND FUNCTION\n\nSUB SwapThem (x, y)\n  t = x: x = y: y = t\nEND SUB\n";
    assert.equal(out(program), "Hi Ada\nHi Linus\n 3628800 \n 2  1 \n");
    assert.equal(out("DEF FNSQ(x) = x * x\nPRINT FNSQ(7)\nCONST PI = 3.14159\nPRINT PI * 2\n"), " 49 \n 6.28318 \n");
    assert.equal(out("DIM a(5), m(2, 2)\nFOR i = 0 TO 5: a(i) = i * i: NEXT\nPRINT a(5)\nm(1, 2) = 9: PRINT m(1, 2)\nDIM names$(1 TO 3)\nnames$(3) = \"z\": PRINT names$(3); LEN(names$(3))\n"), " 25 \n 9 \nz 1 \n");
    assert.equal(out("FOR i = 1 TO 3\n  READ n$, v\n  PRINT n$; v\nNEXT\nRESTORE\nREAD n$: PRINT n$\nDATA apple, 1, \"big pear\", -2.5\nDATA kiwi, 3\n"), "apple 1 \nbig pear-2.5 \nkiwi 3 \napple\n");
    assert.equal(out("a$ = \"Hello World\"\nPRINT LEFT$(a$, 5); \"|\"; RIGHT$(a$, 5); \"|\"; MID$(a$, 7, 3); \"|\"; INSTR(a$, \"o\"); UCASE$(a$); LCASE$(\"ABC\")\n"), "Hello|World|Wor| 5 HELLO WORLDabc\n");
});

test("INPUT reads the Input tab and echoes it", () => {
    assert.equal(out("INPUT \"What is your name\"; N$\nINPUT \"Age: \", A\nPRINT \"Hello \"; N$; \", next year you are\"; A + 1\n", { stdin: "Ada\n36\n" }), "What is your name? Ada\nAge: 36\nHello Ada, next year you are 37 \n");
    const missing = runBasic("INPUT x\nINPUT y\n", { stdin: "5\n" });
    assert.equal(missing.exitCode, 1);
    assert.equal(missing.error.line, 2);
    assert.match(missing.error.message, /Input past end/);
});

test("errors use QBasic names with line and column", () => {
    assert.deepEqual(runBasic("PRINT 1 / 0\n").error, { message: "Division by zero", line: 1, column: 9 });
    assert.match(runBasic("10 PRINT \"a\"\n20 GOTO 99\n").error.message, /Label not defined: 99 \(line 20\)/);
    assert.equal(runBasic("x = \"text\"\n").error.message, "Type mismatch");
    assert.equal(runBasic("FOR i = 1 TO 3\nPRINT i\n").error.message, "FOR without NEXT");
    assert.equal(runBasic("DIM a(5)\nPRINT a(6)\n").error.message, "Subscript out of range: A(6)");
    assert.equal(runBasic("x% = 40000\n").error.message, "Overflow");
    assert.equal(runBasic("PRINT \"a\" +\n", { locale: "tr" }).error.message, "Sözdizimi hatası: bir ifade bekleniyordu");
    const loop = runBasic("10 GOTO 10\n", { maxSteps: 10000 });
    assert.equal(loop.exitCode, 1);
    assert.match(loop.error.message, /Step limit exceeded/);
});

test("RND is reproducible with RANDOMIZE", () => {
    assert.equal(out("RANDOMIZE 42\nPRINT INT(RND * 10); INT(RND * 10)\n"), out("RANDOMIZE 42\nPRINT INT(RND * 10); INT(RND * 10)\n"));
});

test("every BASIC template runs cleanly", () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "basic").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "basic"),
        ...PROJECT_TEMPLATES.flatMap((project) => project.files.filter((file) => file.language === "basic").map((file) => ({ id: `${project.id}/${file.name}`, code: file.code }))),
    ];
    assert.ok(samples.length >= 4);
    for (const sample of samples) {
        const result = runBasic(sample.code, { stdin: sample.stdin ?? "" });
        assert.equal(result.error, undefined, sample.id);
        assert.equal(result.exitCode, 0, sample.id);
    }
    assert.match(out(LANGUAGES.find((language) => language.id === "basic").template), /^Hello World from Hanogt!\n/);
    const guess = FILE_TEMPLATES.find((template) => template.id === "basic-guess");
    assert.match(out(guess.code, { stdin: guess.stdin }), /Correct in 4 tries\./);
});
