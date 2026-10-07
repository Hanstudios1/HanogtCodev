// Clojure through Scittle (the Small Clojure Interpreter). Run: node --test scripts/tests/
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ROOT, load } from "./setup.mjs";

const { runClojure } = await load("lib/runtimes/clojure.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

// The worker downloads the self-hosted, unmodified copy (public/runtimes/scittle/scittle.js).
const runtime = fs.readFileSync(new URL("node_modules/scittle/dist/scittle.js", ROOT), "utf8");

function clojure(source, stdin = "") {
    let output = "";
    let errors = "";
    const result = runClojure(source, { runtime, stdin, onOutput: (text) => { output += text; }, onError: (text) => { errors += text; } });
    return { ...result, output, errors };
}

test("printing, data structures and the standard library", () => {
    const result = clojure("(print \"a\") (print \"b\") (println)\n(println \"x\" 1 [2 3] {:k :v} #{4})\n(prn \"quoted\")\n(printf \"%s has %d items%n\" \"cart\" 3)\n(println (format \"%-5s|%.2f\" \"pi\" 3.14159))\n(require '[clojure.string :as str]) (println (str/join \",\" (map inc [1 2 3])))\n(js/console.log \"via console\")");
    assert.equal(result.error, undefined);
    assert.equal(result.output, "ab\nx 1 [2 3] {:k :v} #{4}\n\"quoted\"\ncart has 3 items\npi   |3.14\n2,3,4\nvia console\n");
    assert.equal(result.errors, "");
    assert.equal(clojure("(defrecord P [x y]) (defprotocol Area (area [s])) (extend-type P Area (area [p] (* (:x p) (:y p)))) (println (area (->P 3 4)))").output, "12\n");
    assert.equal(clojure("(println (loop [i 0 acc 0] (if (< i 100000) (recur (inc i) (+ acc i)) acc)))").output, "4999950000\n");
});

test("read-line reads the Input tab line by line, then returns nil", () => {
    assert.equal(clojure("(println (read-line) \"/\" (read-line) \"/\" (read-line))", "Ada\r\nLinus\n").output, "Ada / Linus / nil\n");
});

test("every run starts from a fresh interpreter", () => {
    assert.equal(clojure("(def leaked 42)").exitCode, 0);
    assert.match(clojure("(println leaked)").error.message, /Unable to resolve symbol: leaked/);
});

test("errors carry the line, the column and ex-info data", () => {
    assert.deepEqual(clojure("(println \"a\")\n  (let [y 2]\n    (throw (ex-info \"boom\" {:a 1})))").error, { message: "boom {:a 1}", line: 3, column: 5 });
    assert.deepEqual(clojure("(foo 1)").error, { message: "Syntax error (analysis): Unable to resolve symbol: foo", line: 1, column: 1 });
    assert.deepEqual(clojure("(println \"unbalanced\" (+ 1 2)").error, { message: "Syntax error: EOF while reading, expected ) to match ( at [1,1]", line: 1, column: 30 });
    assert.deepEqual(clojure("(.toUpperCase nil)").error, { message: "TypeError: Cannot read properties of null (reading 'toUpperCase')", line: 1, column: 1 });
    const deep = clojure("(defn f [n] (f n)) (f 1)");
    assert.equal(deep.exitCode, 1);
    assert.match(deep.error.message, /Maximum call stack size exceeded/);
    assert.equal(clojure("(foo)").output, "", "Scittle's own error report stays out of the console");
});

test("the console is restored after a run", () => {
    const log = console.log;
    clojure("(println 1)");
    clojure("(throw (ex-info \"x\" {}))");
    assert.equal(console.log, log);
    assert.equal(globalThis.__hanogt_clojure, undefined);
});

test("every Clojure template runs", () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "clojure").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "clojure"),
    ];
    assert.ok(samples.length >= 2);
    for (const sample of samples) {
        const result = clojure(sample.code, sample.stdin ?? "");
        assert.equal(result.error, undefined, `${sample.id}: ${result.error?.message}`);
        assert.equal(result.errors, "", sample.id);
    }
    assert.equal(clojure(samples[0].code).output, "Hello World from Hanogt!\nClojure  2007\nScheme   1975\nLisp     1958\nSquares: (1 4 9 16 25)\n");
    const words = FILE_TEMPLATES.find((template) => template.id === "clojure-words");
    assert.match(clojure(words.code, words.stdin).output, /^to {7}\*\*\nbe {7}\*\*\n[\s\S]*Words: 10\n$/);
});
