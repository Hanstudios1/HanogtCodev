// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { prepareJava, javaMainClass } = await load("lib/runtimes/java-launcher.ts");
const { __test } = await load("lib/server/code-runner.ts");

const lines = (text) => text.split("\n");

test("public Main gets a prog launcher without moving any line", () => {
    const source = "package demo;\n\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(\"public class X\"); // public class Y\n        int x = ;\n    }\n}\n";
    const prepared = prepareJava(source);
    const before = lines(source);
    const after = lines(prepared);
    assert.equal(after[0].trim(), "");
    assert.equal(after[4], "class Main {");
    for (let index = 1; index < before.length - 1; index += 1) {
        if (index === 4) continue;
        assert.equal(after[index], before[index], `line ${index + 1} moved`);
    }
    assert.match(prepared, /\nclass prog \{ public static void main\(String\[\] args\) throws Exception \{ Main\.main\(args\); \} \}\n$/);
    assert.match(prepared, /"public class X"/);
});

test("nested public types keep their modifier", () => {
    const prepared = prepareJava("public class App {\n    public static class Inner {}\n    public static void main(String[] a) {}\n}\n");
    assert.match(prepared, /^class App \{\n {4}public static class Inner \{\}/);
    assert.match(prepared, /App\.main\(args\)/);
});

test("main detection ignores comments, strings and text blocks", () => {
    assert.equal(javaMainClass("// class Fake { static void main(String[] a) {} }\nclass Real {\n  static void main(String[] a) {}\n}"), "Real");
    assert.equal(javaMainClass("class A { String s = \"\"\"\nstatic void main(\n\"\"\"; }\nclass B { public static void main(String[] a) {} }"), "B");
    assert.equal(javaMainClass("class NoMain {}"), null);
    assert.equal(prepareJava("class prog { public static void main(String[] a) {} }"), "class prog { public static void main(String[] a) {} }");
});

test("server helpers stay exported for tests", () => {
    assert.deepEqual(__test.streams("<outStream>hi</outStream><errStream>oops</errStream>"), { stdout: "hi", stderr: "oops" });
    assert.ok(__test.compareVersions("13.2.0", "9.1") > 0);
    assert.ok(__test.compareVersions("1.10", "1.9") > 0);
});
