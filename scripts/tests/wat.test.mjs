// The WebAssembly text format: wabt parses and validates, the engine runs main/_start. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ROOT, load } from "./setup.mjs";

const { runWat, WAT_VERSION } = await load("lib/runtimes/wat.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

async function wat(source, options = {}) {
    let output = "";
    const result = await runWat(source, { fileName: "main.wat", ...options, onOutput: (text) => { output += text; } });
    return { ...result, output };
}

test("main runs, the env imports print, and main's result is printed last", async () => {
    const result = await wat(`(module
  (import "env" "print" (func $print (param i32 i32)))
  (import "env" "print_i32" (func $i32 (param i32)))
  (import "env" "print_i64" (func $i64 (param i64)))
  (import "env" "print_f32" (func $f32 (param f32)))
  (import "env" "print_f64" (func $f64 (param f64)))
  (import "env" "print_char" (func $char (param i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "Merhaba, dünya!\\n")
  (func (export "main") (result i32)
    (call $print (i32.const 0) (i32.const 17))
    (call $i32 (i32.const -42))
    (call $i64 (i64.const 9007199254740993))
    (call $f32 (f32.const 0.1))
    (call $f64 (f64.const 0.1))
    (call $char (i32.const 0x1F600))
    (call $char (i32.const 10))
    (i32.const 7)))`);
    assert.equal(result.error, undefined);
    assert.equal(result.exitCode, 0);
    assert.equal(result.output, "Merhaba, dünya!\n-42\n9007199254740993\n0.1\n0.1\n😀\nmain returned 7\n");
    assert.equal((await wat("(module (func (export \"main\")))")).output, "", "a main without a result prints nothing");
    assert.equal((await wat("(module (func (export \"main\") (result i32 i64) (i32.const 1) (i64.const 2)))", { locale: "tr" })).output, "main şunu döndürdü: 1 2\n");
    const installed = JSON.parse(fs.readFileSync(new URL("node_modules/wabt/package.json", ROOT), "utf8")).version;
    assert.equal(WAT_VERSION, `WebAssembly (wabt ${installed})`, "update WAT_VERSION in src/lib/runtimes/wat.ts");
});

test("read_i32 reads whole numbers from the Input tab", async () => {
    const source = "(module (import \"env\" \"read_i32\" (func $r (result i32))) (func (export \"main\") (result i32) (i32.add (call $r) (call $r))))";
    assert.equal((await wat(source, { stdin: "19 abc\n23\n" })).output, "main returned 42\n");
    assert.equal((await wat(source)).output, "main returned 0\n", "0 when the input runs out");
});

test("_start programs, WASI fd_write/fd_read/proc_exit and MDN-style imports", async () => {
    const hello = await wat(`(module
  (import "wasi_snapshot_preview1" "fd_write" (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 8) "hello from WASI\\n")
  (func (export "_start")
    (i32.store (i32.const 0) (i32.const 8))
    (i32.store (i32.const 4) (i32.const 16))
    (drop (call $fd_write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 40)))))`);
    assert.equal(hello.output, "hello from WASI\n");
    const echo = await wat(`(module
  (import "wasi_snapshot_preview1" "fd_read" (func $fd_read (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_write" (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit" (func $exit (param i32)))
  (memory (export "memory") 1)
  (func (export "_start")
    (i32.store (i32.const 0) (i32.const 100))
    (i32.store (i32.const 4) (i32.const 64))
    (drop (call $fd_read (i32.const 0) (i32.const 0) (i32.const 1) (i32.const 8)))
    (i32.store (i32.const 4) (i32.load (i32.const 8)))
    (drop (call $fd_write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 12)))
    (call $exit (i32.const 3))))`, { stdin: "echo me\n" });
    assert.equal(echo.output, "echo me\n");
    assert.equal(echo.exitCode, 3, "proc_exit sets the exit code");
    assert.equal(echo.error, undefined);
    const mdn = await wat("(module (import \"console\" \"log\" (func $log (param i32))) (import \"js\" \"mem\" (memory 2)) (func (export \"main\") (call $log (memory.size))))");
    assert.equal(mdn.output, "2\n", "imported memories get the size the module asks for");
});

test("parse, validation, import and run-time errors", async () => {
    const parse = await wat("(module\n  (func (export \"main\")\n    (call $nope)))");
    assert.equal(parse.exitCode, 1);
    assert.match(parse.error, /^main\.wat:3:11: error: undefined function variable "\$nope"\n/);
    const invalid = await wat("(module\n  (func (export \"main\") (result i32)\n    (i32.add (i32.const 1))))");
    assert.match(invalid.error, /^main\.wat:3:6: error: type mismatch in i32\.add, expected \[i32, i32\] but got \[i32\]/);
    assert.match((await wat("(module (func (export \"other\")))")).error, /must export a function named main or _start/);
    assert.match((await wat("(module (func (export \"main\") (param i32)))")).error, /main must not take parameters \(it takes 1\)/);
    assert.match((await wat("(module (import \"env\" \"nope\" (func $n)) (func (export \"main\") (call $n)))")).error, /^Error: The import env\.nope is not provided\. Available: env\.print,/);
    assert.match((await wat("(module (import \"env\" \"print\" (func $p (param i32 i32))) (func (export \"main\") (call $p (i32.const 0) (i32.const 5))))")).error, /print needs the module to export its memory/);
    const trap = await wat("(module (func $boom (unreachable)) (func (export \"main\") (call $boom)))");
    assert.match(trap.error, /^RuntimeError: unreachable\n {4}at boom \(wasm-function\[0\]:0x[0-9a-f]+\)/);
    const deep = await wat("(module (func $f (export \"main\") (call $f)))");
    assert.match(deep.error, /^RangeError: Maximum call stack size exceeded\n {4}at f \(wasm-function\[0\]:0x[0-9a-f]+\)/);
    assert.ok(deep.error.split("\n").length <= 4, "repeated frames are shown once");
});

test("errors thrown by the output callback (the output limit) reach the caller", async () => {
    class Limit extends Error {}
    await assert.rejects(runWat("(module (import \"env\" \"print_i32\" (func $p (param i32))) (func (export \"main\") (loop $l (call $p (i32.const 1)) (br $l))))", {
        onOutput: () => { throw new Limit("stop"); },
    }), Limit);
});

test("every WAT template runs", async () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "wat").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "wat"),
    ];
    assert.ok(samples.length >= 2);
    for (const sample of samples) {
        const result = await wat(sample.code, { stdin: sample.stdin ?? "" });
        assert.equal(result.error, undefined, `${sample.id}: ${result.error}`);
        assert.equal(result.exitCode, 0, sample.id);
    }
    assert.equal((await wat(samples[0].code)).output, "Hello World from Hanogt!\n42\nmain returned 2432902008176640000\n");
    const sieve = FILE_TEMPLATES.find((template) => template.id === "wat-sieve");
    assert.equal((await wat(sieve.code, { stdin: "30" })).output, "2\n3\n5\n7\n11\n13\n17\n19\n23\n29\nmain returned 10\n");
});
