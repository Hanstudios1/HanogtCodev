// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { runProlog, splitPrologClauses } = await load("lib/runtimes/prolog.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES, PROJECT_TEMPLATES } = await load("lib/runtimes/templates.ts");

test("clauses split at end tokens, not at dots inside terms", () => {
    const source = "a :- X =.. [f, 1], Y = 'a.b', Z = \"x. y\", C = 0'., D = 3.14.\n% comment.\n:- initialization(main).\n?- a.\n/* block. */ b.";
    assert.deepEqual(splitPrologClauses(source).map((clause) => `${clause.kind}@${clause.line}:${clause.column} ${clause.body}`), [
        "clause@1:1 a :- X =.. [f, 1], Y = 'a.b', Z = \"x. y\", C = 0'., D = 3.14",
        "directive@3:1 initialization(main)",
        "query@4:1 a",
        "clause@5:14 b",
    ]);
});

test("initialization(main), directives and halt run like swipl", async () => {
    const hello = await runProlog(":- initialization(main).\nmain :- write(\"Hello World from Hanogt!\"), nl.\n");
    assert.equal(hello.output, "Hello World from Hanogt!\n");
    assert.equal(hello.exitCode, 0);
    const halted = await runProlog(":- initialization(main).\nmain :- writeln(a), halt, writeln(b).\n:- writeln(directive).\n");
    assert.equal(halted.output, "directive\na\n");
    const code = await runProlog("main :- writeln(a), halt(3).\n");
    assert.equal(code.output, "a\n");
    assert.equal(code.exitCode, 3);
});

test("?- queries print their answers like the top level", async () => {
    const result = await runProlog("parent(tom, bob).\nparent(bob, ann).\nparent(bob, pat).\ngrand(X, Z) :- parent(X, Y), parent(Y, Z).\n?- grand(tom, W).\n?- parent(X, ann).\n?- parent(nobody, _).\n?- X is 2 + 3 * 4.\n");
    assert.equal(result.output, "?- grand(tom, W).\nW = ann ;\nW = pat.\n\n?- parent(X, ann).\nX = bob.\n\n?- parent(nobody, _).\nfalse.\n\n?- X is 2 + 3 * 4.\nX = 14.\n\n");
    assert.equal(result.exitCode, 0);
});

test("libraries, format/2, DCGs, dynamic predicates and stdin work", async () => {
    const strings = await runProlog(":- X = \"abc\", atom_length(X, L), writeln(L), string_concat(X, \"def\", Y), writeln(Y), atom_number('42', N), writeln(N), format(\"~a~t~10|~w~n\", [ab, x]), nth1(2, [a,b,c], E), writeln(E), numlist(1, 5, NL), sum_list(NL, S), writeln(S).\n");
    assert.equal(strings.output, "3\nabcdef\n42\nab        x\nb\n15\n");
    const dcg = await runProlog("greeting --> [hello], who.\nwho --> [world].\nwho --> [prolog].\n?- phrase(greeting, [hello, X]).\n");
    assert.match(dcg.output, /X = world ;\nX = prolog\./);
    const dynamic = await runProlog(":- dynamic counter/1.\ncounter(0).\ninc :- retract(counter(N)), M is N + 1, assert(counter(M)).\n:- inc, inc, counter(X), writeln(X).\n");
    assert.equal(dynamic.output, "2\n");
    const input = await runProlog(":- initialization(main).\nmain :- read(X), Y is X * 2, writeln(Y), read(Z), writeln(Z).\n", { stdin: "21.\nfoo(bar).\n" });
    assert.equal(input.output, "42\nfoo(bar)\n");
    const auto = await runProlog("main :- format(\"~w + ~w = ~w~n\", [1, 2, 3]).\n");
    assert.equal(auto.output, "1 + 2 = 3\n", "main/0 runs when there is no directive");
});

test("errors name the problem and the line", async () => {
    const evaluation = await runProlog("main :- X is foo + 1, write(X).\n:- initialization(main).\n");
    assert.equal(evaluation.exitCode, 1);
    assert.match(evaluation.errors, /^Type error: expected evaluable, found foo\/0 \(in is\/2\)\n {4}at main\.pro:2:1/);
    const unknown = await runProlog(":- initialization(main).\nmain :- greet(ada).\ngreet(X, Y) :- write(X-Y).\n");
    assert.match(unknown.errors, /Unknown procedure: greet\/1 \(defined: greet\/2\)/);
    const syntax = await runProlog("ok.\nbad(X) :- X = .\n", { fileName: "family.pl" });
    assert.match(syntax.errors, /^Syntax error: [^\n]+\n {4}at family\.pl:2:\d+/);
    const turkish = await runProlog(":- foo.\n", { locale: "tr" });
    assert.match(turkish.errors, /Tanımsız yüklem: foo\/0/);
    const loaded = await runProlog("fact(1).\n");
    assert.match(loaded.output, /^Program loaded \(1 clause\)\./);
});

test("infinite loops stop at the time limit", async () => {
    const start = Date.now();
    const result = await runProlog("loop :- loop.\n:- loop.\n", { shouldStop: () => Date.now() - start > 200 });
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
    assert.match(result.errors, /Time limit exceeded/);
});

test("every Prolog template runs cleanly", async () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "prolog").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "prolog"),
        ...PROJECT_TEMPLATES.flatMap((project) => project.files.filter((file) => file.language === "prolog").map((file) => ({ id: `${project.id}/${file.name}`, code: file.code }))),
    ];
    assert.ok(samples.length >= 3);
    for (const sample of samples) {
        const result = await runProlog(sample.code, { stdin: sample.stdin ?? "" });
        assert.equal(result.errors, "", sample.id);
        assert.equal(result.exitCode, 0, sample.id);
        assert.ok(result.output.trim(), sample.id);
    }
    assert.match((await runProlog(LANGUAGES.find((language) => language.id === "prolog").template)).output, /^Hello World from Hanogt!\n/);
});
