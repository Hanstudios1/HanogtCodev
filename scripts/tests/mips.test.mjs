// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { runMips, REGISTER_NAMES } = await load("lib/runtimes/mips.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES, PROJECT_TEMPLATES } = await load("lib/runtimes/templates.ts");

const text = (body) => `        .text\nmain:\n${body}`;
const T0 = REGISTER_NAMES.indexOf("t0");

test("data directives, strings and the MARS print syscalls", () => {
    const hello = runMips('        .data\nmsg:    .asciiz "Hello World from Hanogt!\\n"\n        .text\nmain:   li   $v0, 4\n        la   $a0, msg\n        syscall\n        li   $v0, 10\n        syscall\n');
    assert.equal(hello.output, "Hello World from Hanogt!\n");
    assert.equal(hello.exitCode, 0);
    assert.equal(runMips('  .data\ns: .asciiz "Çalışıyor ✓\\n"\n  .text\nmain: li $v0, 4\n  la $a0, s\n  syscall\n').output, "Çalışıyor ✓\n", "strings are UTF-8");
    assert.equal(runMips(text("  li $a0, -1\n  li $v0, 36\n  syscall\n  li $a0, 5\n  li $v0, 35\n  syscall\n")).output, "4294967295" + "00000000000000000000000000000101");
    assert.equal(runMips(text("  li $a0, 255\n  li $v0, 34\n  syscall\n")).output, "0x000000ff");
    assert.equal(runMips("  .eqv N 3\n" + text("  li $a0, N\n  li $v0, 1\n  syscall\n")).output, "3");
    assert.equal(runMips(text("  li $a0, '#'  # a hash\n  li $v0, 11\n  syscall\n")).output, "#");
});

test("arithmetic, shifts, hi/lo and memory", () => {
    assert.equal(runMips(text("  li $t1, 100000\n  li $t2, 100000\n  mult $t1, $t2\n  mfhi $a0\n  li $v0, 1\n  syscall\n  li $a0, 32\n  li $v0, 11\n  syscall\n  mflo $a0\n  li $v0, 1\n  syscall\n")).output, "2 1410065408");
    assert.equal(runMips(text("  li $t0, -16\n  sra $a0, $t0, 2\n  li $v0, 1\n  syscall\n  li $a0, 32\n  li $v0, 11\n  syscall\n  srl $a0, $t0, 28\n  li $v0, 1\n  syscall\n")).output, "-4 15");
    assert.equal(runMips(text("  li $zero, 5\n  move $t0, $zero\n")).registers[T0], 0, "$zero stays 0");
    assert.equal(runMips(text("  li $v0, 9\n  li $a0, 16\n  syscall\n  move $t0, $v0\n  li $t1, 77\n  sw $t1, 4($t0)\n  lw $a0, 4($t0)\n  li $v0, 1\n  syscall\n")).output, "77", "sbrk memory");
    const array = runMips("        .data\narr:    .word 5, 3, 9, 1, 7\n" + text("  la $t0, arr\n  li $t2, 0\n  li $t3, 0\nloop: bge $t3, 5, out\n  sll $t4, $t3, 2\n  add $t4, $t4, $t0\n  lw $t5, 0($t4)\n  ble $t5, $t2, skip\n  move $t2, $t5\nskip: addi $t3, $t3, 1\n  b loop\nout: li $v0, 1\n  move $a0, $t2\n  syscall\n"));
    assert.equal(array.output, "9");
});

test("functions with jal/jr and the stack", () => {
    const program = text("  li $a0, 10\n  jal fact\n  move $a0, $v0\n  li $v0, 1\n  syscall\n  li $v0, 10\n  syscall\nfact: addi $sp, $sp, -8\n  sw $ra, 4($sp)\n  sw $a0, 0($sp)\n  li $v0, 1\n  ble $a0, 1, fact_end\n  addi $a0, $a0, -1\n  jal fact\n  lw $a0, 0($sp)\n  mul $v0, $v0, $a0\nfact_end:\n  lw $ra, 4($sp)\n  addi $sp, $sp, 8\n  jr $ra\n");
    assert.equal(runMips(program).output, "3628800");
    assert.equal(runMips("  .text\nhelper: li $v0, 1\n  li $a0, 99\n  syscall\n  jr $ra\nmain: jal helper\n  li $v0, 10\n  syscall\n").output, "99", "execution starts at main");
});

test("input syscalls read the Input tab", () => {
    const sum = runMips(text("  li $v0, 5\n  syscall\n  move $t0, $v0\n  li $v0, 5\n  syscall\n  add $a0, $t0, $v0\n  li $v0, 1\n  syscall\n"), { stdin: "19\n23\n" });
    assert.equal(sum.output, "42");
    const read = runMips('  .data\nbuf: .space 32\n  .text\nmain: li $v0, 8\n  la $a0, buf\n  li $a1, 32\n  syscall\n  li $v0, 4\n  syscall\n  li $v0, 12\n  syscall\n  move $a0, $v0\n  li $v0, 11\n  syscall\n  li $v0, 17\n  li $a0, 3\n  syscall\n', { stdin: "Merhaba dünya\nX" });
    assert.equal(read.output, "Merhaba dünya\nX");
    assert.equal(read.exitCode, 3, "exit2 sets the exit code");
    assert.match(runMips(text("  li $v0, 5\n  syscall\n"), { stdin: "abc\n" }).error.message, /not an integer/);
    assert.match(runMips(text("  li $v0, 5\n  syscall\n"), { stdin: "" }).error.message, /No more input/);
});

test("assembler and runtime errors point at the line", () => {
    assert.deepEqual(runMips("  .text\nmain: addd $t0, $t1, $t2\n").error, { message: "Unknown instruction: addd", line: 2, column: 7 });
    assert.equal(runMips("  .text\nmain: add $t0, $t1, $x9\n").error.message, "Unknown register: $x9");
    assert.equal(runMips("  .text\nmain: j nowhere\n").error.message, "Undefined label: nowhere");
    assert.match(runMips("  .text\nmain: add $t0, $t1\n").error.message, /add expects 3 operands/);
    assert.equal(runMips("  .text\nmain: nop\nmain: nop\n").error.message, "Label defined twice: main");
    const overflow = runMips("  .text\nmain: li $t0, 0x7fffffff\n  addi $t0, $t0, 1\n");
    assert.deepEqual(overflow.error, { message: "Arithmetic overflow (addi)", line: 3, column: 3 });
    assert.match(runMips("  .text\nmain: li $t0, 5\n  div $t1, $t0, $zero\n").error.message, /Division by zero/);
    assert.match(runMips("  .data\nb: .byte 1, 2, 3, 4, 5\n  .text\nmain: la $t0, b\n  lw $t1, 1($t0)\n").error.message, /not aligned to 4 bytes/);
    assert.match(runMips(text("  li $v0, 99\n  syscall\n")).error.message, /Unsupported syscall/);
    assert.equal(runMips("  .text\nmain: foo $t0\n", { locale: "tr" }).error.message, "Bilinmeyen komut: foo");
    const loop = runMips("  .text\nmain: j main\n", { maxSteps: 1000 });
    assert.equal(loop.exitCode, 1);
    assert.match(loop.error.message, /Step limit exceeded/);
});

test("every MIPS template runs cleanly", () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "mips").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "mips"),
        ...PROJECT_TEMPLATES.flatMap((project) => project.files.filter((file) => file.language === "mips").map((file) => ({ id: `${project.id}/${file.name}`, code: file.code }))),
    ];
    assert.ok(samples.length >= 3);
    for (const sample of samples) {
        const result = runMips(sample.code, { stdin: sample.stdin ?? "" });
        assert.equal(result.error, undefined, sample.id);
        assert.equal(result.exitCode, 0, sample.id);
        assert.ok(result.output, sample.id);
    }
    const sum = FILE_TEMPLATES.find((template) => template.id === "mips-sum");
    assert.match(runMips(sum.code, { stdin: sum.stdin }).output, /55/);
});
