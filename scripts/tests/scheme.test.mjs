// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { runScheme, parseNumber, formatFloat } = await load("lib/runtimes/scheme.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES, PROJECT_TEMPLATES } = await load("lib/runtimes/templates.ts");

/** Runs a program and returns its output lines (REPL values included). */
function run(source, options) {
    const result = runScheme(source, options);
    return { ...result, lines: result.output.split("\n").filter((line, index, all) => index < all.length - 1 || line !== "") };
}

function value(source) {
    const result = run(source);
    assert.equal(result.exitCode, 0, result.error?.message);
    return result.lines.at(-1);
}

test("templates run without errors", () => {
    const sources = [
        LANGUAGES.find((language) => language.id === "scheme").template,
        ...FILE_TEMPLATES.filter((template) => template.language === "scheme").map((template) => template.code),
        ...PROJECT_TEMPLATES.flatMap((project) => project.files.filter((file) => file.language === "scheme").map((file) => file.code)),
    ];
    for (const source of sources) {
        const result = run(source);
        assert.equal(result.exitCode, 0, result.error?.message);
    }
    assert.deepEqual(run(LANGUAGES.find((language) => language.id === "scheme").template).lines, ["Hello World from Hanogt!", "2432902008176640000"]);
});

test("numeric tower: exact integers, rationals and inexact reals", () => {
    assert.equal(value("(+ 1 2)"), "3");
    assert.equal(value("(/ 1 3)"), "1/3");
    assert.equal(value("(+ 1/2 1/3)"), "5/6");
    assert.equal(value("(/ 6 3)"), "2");
    assert.equal(value("(expt 2 100)"), "1267650600228229401496703205376");
    assert.equal(value("(* 1.0 100)"), "100.0");
    assert.equal(value("(exact->inexact 1/4)"), "0.25");
    assert.equal(value("(exact 0.5)"), "1/2");
    assert.equal(value("(sqrt 16)"), "4");
    assert.equal(value("(sqrt 1/4)"), "1/2");
    assert.equal(value("(round 2.5)"), "2.0");
    assert.equal(value("(round 7/2)"), "4");
    assert.equal(value("(modulo -7 3)"), "2");
    assert.equal(value("(remainder -7 3)"), "-1");
    assert.equal(value("(quotient 17 5)"), "3");
    assert.equal(value("(exact->inexact 2/3)"), "0.6666666666666666");
    assert.equal(value("(max 1 2.0)"), "2.0");
    assert.equal(value("(number->string 255 16)"), "\"ff\"");
    assert.equal(value("(string->number \"#xff\")"), "255");
    assert.equal(value("(string->number \"abc\")"), "#f");
    assert.equal(value("(exact-integer? 5)"), "#t");
    assert.equal(value("(integer? 2.0)"), "#t");
    assert.equal(value("(/ 1.0 0)"), "+inf.0");
    assert.equal(parseNumber("1/0"), null);
    assert.equal(formatFloat(-0), "-0.0");
});

test("proper tail calls run in constant stack space", () => {
    assert.equal(value("(define (loop i acc) (if (= i 0) acc (loop (- i 1) (+ acc i)))) (loop 200000 0)"), "20000100000");
    assert.equal(value("(let loop ((i 0)) (if (< i 100000) (loop (+ i 1)) i))"), "100000");
    assert.equal(value("(do ((i 0 (+ i 1)) (s 0 (+ s i))) ((= i 1000) s))"), "499500");
    assert.equal(value("(define (even2? n) (if (= n 0) #t (odd2? (- n 1)))) (define (odd2? n) (if (= n 0) #f (even2? (- n 1)))) (even2? 100001)"), "#f");
});

test("deep non-tail recursion fails with a clear message instead of crashing", () => {
    const result = run("(define (f n) (if (= n 0) 0 (+ 1 (f (- n 1))))) (f 10000000)");
    assert.equal(result.exitCode, 1);
    assert.match(result.error.message, /recursion depth/);
});

test("lists, strings, characters and vectors", () => {
    assert.equal(value("(map (lambda (x) (* x x)) '(1 2 3))"), "(1 4 9)");
    assert.equal(value("(append '(1) '(2 3) '() '(4 . 5))"), "(1 2 3 4 . 5)");
    assert.equal(value("(assoc \"b\" '((\"a\" . 1) (\"b\" . 2)))"), "(\"b\" . 2)");
    assert.equal(value("(list-tail '(1 2 3 4) 2)"), "(3 4)");
    assert.equal(value("(sort '(3 1 2) <)"), "(1 2 3)");
    assert.equal(value("(fold-left cons '() '(1 2))"), "((() . 1) . 2)");
    assert.equal(value("(fold-right cons '() '(1 2))"), "(1 2)");
    assert.equal(value("(reduce + 0 '(1 2 3 4))"), "10");
    assert.equal(value("(string-append \"Mer\" \"haba\")"), "\"Merhaba\"");
    assert.equal(value("(string-length \"ğüşıöç\")"), "6");
    assert.equal(value("(string-upcase \"abc\")"), "\"ABC\"");
    assert.equal(value("(string->list \"ab\")"), "(#\\a #\\b)");
    assert.equal(value("(string-split \"a,b,,c\" #\\,)"), "(\"a\" \"b\" \"\" \"c\")");
    assert.equal(value("(char->integer #\\A)"), "65");
    assert.equal(value("#\\space"), "#\\space");
    assert.equal(value("(vector-map + #(1 2) #(10 20))"), "#(11 22)");
    assert.equal(value("(let ((v (make-vector 2 0))) (vector-set! v 1 'x) v)"), "#(0 x)");
    assert.equal(value("`(1 ,(+ 1 1) ,@(list 3 4))"), "(1 2 3 4)");
    assert.equal(value("(equal? '(1 #(2 \"x\")) (list 1 (vector 2 \"x\")))"), "#t");
    assert.equal(value("(eqv? 2.0 2)"), "#f");
});

test("define forms, closures, records, values and parameters", () => {
    assert.equal(value("(define ((adder n) x) (+ n x)) ((adder 5) 10)"), "15");
    assert.equal(value("(define counter (let ((n 0)) (lambda () (set! n (+ n 1)) n))) (counter) (counter)"), "2");
    assert.equal(value("(define-record-type point (make-point x y) point? (x point-x) (y point-y)) (point-x (make-point 7 8))"), "7");
    assert.equal(value("(call-with-values (lambda () (values 1 2)) +)"), "3");
    assert.equal(value("(define-values (q r) (floor/ 17 5)) (list q r)"), "(3 2)");
    assert.equal(value("(define p (make-parameter 1)) (list (p) (parameterize ((p 2)) (p)) (p))"), "(1 2 1)");
    assert.equal(value("(define f (case-lambda ((a) 1) ((a b) 2) ((a . rest) 'many))) (list (f 1) (f 1 2) (f 1 2 3))"), "(1 2 many)");
});

test("syntax-rules macros are hygienic for introduced bindings", () => {
    const swap = "(define-syntax swap! (syntax-rules () ((_ a b) (let ((tmp a)) (set! a b) (set! b tmp)))))";
    assert.equal(value(`${swap} (define tmp 1) (define other 2) (swap! tmp other) (list tmp other)`), "(2 1)");
    const myOr = "(define-syntax my-or (syntax-rules () ((_) #f) ((_ e) e) ((_ e r ...) (let ((t e)) (if t t (my-or r ...))))))";
    assert.equal(value(`${myOr} (define t 5) (my-or #f t)`), "5");
    const whileLoop = "(define-syntax while (syntax-rules () ((_ c body ...) (let loop () (when c body ... (loop))))))";
    assert.equal(run(`${whileLoop} (define i 0) (while (< i 3) (display i) (set! i (+ i 1)))`).output, "012");
    assert.equal(value("(define-syntax flat (syntax-rules () ((_ (a ...) ...) '(a ... ...)))) (flat (1 2) (3) (4 5))"), "(1 2 3 4 5)");
    assert.equal(value("(define-syntax ten (syntax-rules () ((_) 10))) (+ (ten) (ten))"), "20");
});

test("errors: guard, raise, error objects and with-exception-handler", () => {
    assert.equal(value("(guard (e (#t (error-object-message e))) (error \"boom\" 1 2))"), "\"boom\"");
    assert.equal(value("(guard (e ((symbol? e) (list 'sym e))) (raise 'oops))"), "(sym oops)");
    assert.equal(value("(guard (e ((string? e) 'string) (else 'other)) (raise 42))"), "other");
    assert.equal(value("(guard (e (#t (error-object-message e))) (car 5))"), "\"car: expected a pair, got\"");
    assert.equal(value("(guard (e (#t (error-object-message e))) (/ 1 0))"), "\"/: division by zero\"");
    assert.equal(value("(with-exception-handler (lambda (e) 42) (lambda () (+ (raise-continuable 'c) 1)))"), "43");
    assert.equal(value("(call/cc (lambda (k) (with-exception-handler (lambda (e) (k (list 'caught e))) (lambda () (raise 'bad)))))"), "(caught bad)");
    const uncaught = run("(define (f) (error \"Something failed:\" 42))\n(f)");
    assert.equal(uncaught.exitCode, 1);
    assert.match(uncaught.error.message, /Error: Something failed: 42/);
    assert.equal(uncaught.error.line, 1);
});

test("continuations, dynamic-wind, promises and streams", () => {
    assert.equal(value("(call/cc (lambda (k) (for-each (lambda (x) (if (> x 2) (k x))) '(1 2 3 4)) 'none))"), "3");
    assert.equal(run("(dynamic-wind (lambda () (display \"[in]\")) (lambda () (display \"body\")) (lambda () (display \"[out]\")))").output, "[in]body[out]");
    assert.equal(run("(define p (delay (begin (display \"once \") 5))) (force p) (force p)").lines.join("|"), "once |5|5");
    assert.equal(value("(define (ints n) (cons-stream n (ints (+ n 1)))) (stream-head (ints 1) 5)"), "(1 2 3 4 5)");
    assert.equal(value("(define-values (a b) (values 1 2)) (+ a b)"), "3");
    const reentry = run("(define saved #f) (+ 1 (call/cc (lambda (k) (set! saved k) 1))) (saved 5)");
    assert.equal(reentry.exitCode, 1);
    assert.match(reentry.error.message, /re-entrant continuations/);
});

test("input ports read the program input", () => {
    const result = run("(define name (read-line)) (define n (read)) (display (string-append \"Hi \" name)) (newline) (* n 2) (read-line) (eof-object? (read-char))", { stdin: "Ada\n21\n" });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.lines, ["Hi Ada", "42", "\"\"", "#t"]);
});

test("REPL printing: definitions and unspecified values print nothing", () => {
    assert.deepEqual(run("(define x 5) (set! x 6) (display \"a\") x (if #f #f) (values) (values 1 2)").lines, ["a", "6", "1", "2"]);
    assert.equal(run("(+ 1 2)", { printResults: false }).output, "");
});

test("hash tables, string ports and format", () => {
    assert.equal(value("(define h (make-hash-table)) (hash-table-set! h '(1 2) 'list) (hash-table-ref/default h (list 1 2) #f)"), "list");
    assert.equal(value("(define h (make-hash-table)) (hash-table-update!/default h 'k (lambda (v) (+ v 1)) 0) (hash-table-ref h 'k)"), "1");
    assert.equal(value("(with-output-to-string (lambda () (display 42) (write \"x\")))"), "\"42\\\"x\\\"\"");
    assert.equal(value("(format #f \"~a + ~s~%\" 1 \"b\")"), "\"1 + \\\"b\\\"\\n\"");
});

test("reader errors report their position", () => {
    const result = run("(display \"hi\")\n(+ 1 2");
    assert.equal(result.exitCode, 1);
    assert.match(result.error.message, /SyntaxError: missing '\)'/);
    assert.equal(result.error.line, 2);
    assert.equal(result.error.column, 1);
    assert.match(run("(1 2]").error.message, /expected '\)' but found '\]'/);
    assert.match(run(")").error.message, /unexpected closing parenthesis/);
    assert.equal(value("#| block #| nested |# |# #;(ignored) [+ 1 2]"), "3");
});

test("runtime errors mention the procedure and position", () => {
    const unbound = run("(define (f)\n  (undefined-thing))\n(f)");
    assert.match(unbound.error.message, /unbound variable: undefined-thing/);
    assert.equal(unbound.error.line, 2);
    assert.match(run("(define (f a b) a) (f 1)").error.message, /f: expected 2 argument\(s\), got 1/);
    assert.match(run("(5 3)").error.message, /not a procedure: 5/);
    assert.match(run("(vector-ref (vector 1) 3)").error.message, /out of range/);
    assert.match(run("(assert (= 1 2))").error.message, /assertion failed: \(= 1 2\)/);
});

test("limits stop runaway programs", () => {
    const steps = run("(define (f) (f)) (f)", { maxSteps: 50_000 });
    assert.equal(steps.exitCode, 1);
    assert.match(steps.error.message, /step limit/);
    const output = run("(define (f) (display \"xxxxxxxxxx\") (f)) (f)", { maxOutput: 100 });
    assert.equal(output.exitCode, 1);
    assert.equal(output.output.length, 100);
    assert.match(output.error.message, /output limit/);
    let polls = 0;
    const timed = run("(define (f) (f)) (f)", { shouldStop: () => ++polls > 3 });
    assert.match(timed.error.message, /time limit/);
    assert.equal(run("(display 1) (exit 3) (display 2)").exitCode, 3);
    assert.equal(run("(display 1) (exit 3) (display 2)").output, "1");
});

test("R7RS import declarations are accepted", () => {
    assert.equal(run("(import (scheme base) (scheme write))\n(display \"ok\")").output, "ok");
});
