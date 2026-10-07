// Hanogt Logo: the turtle-graphics interpreter behind the Logo preview. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { runLogo, renderLogoSvg } = await load("lib/runtimes/logo.ts");
const { buildLogoDocument, STATIC_PREVIEW_CSP } = await load("lib/runtimes/web-preview.ts");
const { LANGUAGES } = await load("lib/runtimes/languages.ts");
const { FILE_TEMPLATES } = await load("lib/runtimes/templates.ts");

const out = (source, options) => runLogo(source, options).output;
const ends = (result) => result.segments.map((segment) => [segment.x2, segment.y2]);

test("the turtle moves, turns and draws only with the pen down", () => {
    const square = runLogo("repeat 4 [fd 100 rt 90]");
    assert.equal(square.error, undefined);
    assert.deepEqual(ends(square), [[0, 100], [100, 100], [100, 0], [0, 0]], "heading 0 is up and turns are clockwise");
    assert.deepEqual(square.turtle, { x: 0, y: 0, heading: 0, visible: true, color: "#000000" });
    const moves = runLogo("fd 10 pu fd 10 pd bk 5 lt 90 fd 10 setpos [20 30] setxy -5 -5 setx 1 sety 2 setheading 45 home");
    assert.deepEqual(ends(moves), [[0, 10], [0, 15], [-10, 15], [20, 30], [-5, -5], [1, -5], [1, 2], [0, 0]]);
    assert.equal(moves.turtle.heading, 0, "HOME faces up again");
    assert.equal(runLogo("fd 10 cs fd 5").segments.length, 1, "CLEARSCREEN wipes the drawing and goes home");
    assert.equal(runLogo("fd 10 ht").turtle.visible, false);
});

test("pen colours accept names, palette numbers, #RRGGBB words and RGB lists", () => {
    const result = runLogo("setpc \"red fd 1 setpencolor 4 fd 1 setpc \"#abc fd 1 setpc [0 128 255] fd 1 setpc \"kırmızı fd 1 setpensize 5 fd 1 setbg \"black", { locale: "tr" });
    assert.deepEqual(result.segments.map((segment) => segment.color), ["#E11D48", "#FF0000", "#AABBCC", "#0080FF", "#E11D48", "#E11D48"]);
    assert.equal(result.segments[5].width, 5);
    assert.equal(result.background, "#000000");
    assert.match(runLogo("setpc \"nocolour").error.message, /SETPC doesn't like nocolour as input/);
    assert.match(runLogo("setpc [1 2]").error.message, /doesn't like \[1 2\] as input/);
});

test("procedures with inputs, OUTPUT, STOP and recursion", () => {
    assert.equal(runLogo("square 30\nto square :n\n  repeat 4 [fd :n rt 90]\nend").segments.length, 4, "a procedure may be used before its TO … END");
    assert.equal(out("to fact :n\n  if :n < 2 [output 1]\n  output :n * fact :n - 1\nend\nprint fact 10"), "3628800\n");
    const tree = runLogo("to tree :size\n  if :size < 5 [stop]\n  fd :size\n  lt 30 tree :size * 0.7\n  rt 60 tree :size * 0.7\n  lt 30 bk :size\nend\ntree 80");
    assert.equal(tree.error, undefined);
    assert.equal(tree.segments.length, 510);
    assert.deepEqual([tree.turtle.x, tree.turtle.y, tree.turtle.heading], [0, 0, 0], "the tree brings the turtle back");
    assert.equal(out("to draw-square :n\n  repeat 4 [fd :n rt 90]\nend\ndraw-square 10 print \"ok"), "ok\n", "names may contain hyphens");
});

test("arithmetic, comparison, variables and printing", () => {
    assert.equal(out("print 1 + 2 * 3\nprint (1 + 2) * 3\nprint 7 / 2\nprint 3 - 1\nprint 3-1\nprint -3 + 4\nprint 0.1 + 0.2\nprint sqrt 2"), "7\n9\n3.5\n2\n2\n1\n0.3\n1.41421356237\n");
    assert.equal(out("print (sum 1 2 3) print (product 2 3 4) print (sum) print remainder -7 3 print modulo -7 3 print power 2 10 print int 3.7 print round 3.5"), "6\n24\n0\n-1\n2\n1024\n3\n4\n");
    assert.equal(out("print 3 = 3.0 print \"abc = \"ABC print 2 < 3 print 2 >= 3 print 1 <> 2 print not \"true print (and \"true \"true \"false) print (or \"false \"true)"), "true\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\ntrue\n");
    assert.equal(out("make \"x 10\nprint :x\nmake \"x :x + 5\nprint thing \"x\nname 3 \"y print :y"), "10\n15\n3\n");
    assert.equal(out("print [hello world]\nshow [a [b c]]\ntype \"abc\nprint \"\nprint (list 1 2 3)\nprint se [a b] \"c\nprint word \"ab \"cd\n(print 1 \"two [3])"), "hello world\n[a [b c]]\nabc\n1 2 3\na b c\nabcd\n1 two 3\n");
    assert.equal(out("print first [a b c] print last \"hello print bf [1 2 3] print bl \"hello print item 2 [x y z] print count [1 2 3] print emptyp [] print memberp 2 [1 2 3] print fput 0 [1] print lput 2 [1]"), "a\no\n2 3\nhell\ny\n3\ntrue\ntrue\n0 1\n1 2\n");
    assert.equal(out("fd -10 rt -90 make \"a 5 print :a - 1 print -:a print 2 * -3 print minus 4 print abs -2"), "4\n-5\n-6\n-4\n2\n");
});

test("control: IF, IFELSE, REPEAT/REPCOUNT, FOR, WHILE and RUN", () => {
    assert.equal(out("make \"n 5\nif :n > 3 [print \"big]\nifelse :n < 3 [print \"small] [print \"notsmall]\nprint ifelse :n = 5 [\"five] [\"other]"), "big\nnotsmall\nfive\n");
    assert.equal(out("repeat 3 [type repcount] print \"\nrepeat 2 [repeat 2 [type repcount]] print \""), "123\n1212\n");
    assert.equal(out("for [i 1 5] [type :i]\nprint \"\nfor [i 10 0 -5] [print :i]\nmake \"n 3 for [j 1 :n] [type :j]"), "12345\n10\n5\n0\n123");
    assert.equal(out("make \"i 0\nwhile [:i < 3] [print :i make \"i :i + 1]"), "0\n1\n2\n");
    assert.equal(out("run [print 1 + 1] run list \"print 3"), "2\n3\n");
    assert.equal(out("print (random 1 1)\nrepeat 20 [if (random 10) > 9 [print \"bad]]"), "1\n");
    assert.equal(out("repeat 5 [type random 100 type \" ]", { seed: 7 }), out("repeat 5 [type random 100 type \" ]", { seed: 7 }), "RANDOM is reproducible for a seed");
    const stopped = runLogo("fd 10 stop fd 10");
    assert.equal(stopped.segments.length, 1, "STOP at the top level ends the program");
    assert.equal(stopped.exitCode, 0);
    assert.equal(runLogo("fd 10 bye fd 10").segments.length, 1);
});

test("ARC, CIRCLE and LABEL", () => {
    const arc = runLogo("arc 90 50");
    assert.equal(arc.segments.length, 18);
    assert.deepEqual([arc.segments[0].x1, arc.segments[0].y1], [0, 50], "the arc starts in the turtle's heading");
    assert.deepEqual([arc.segments[17].x2, arc.segments[17].y2], [50, 0]);
    assert.deepEqual([arc.turtle.x, arc.turtle.y], [0, 0], "the turtle does not move");
    assert.equal(runLogo("circle 20").segments.length, 72);
    const label = runLogo("fd 50 label [Hi there]");
    assert.deepEqual(label.labels, [{ x: 0, y: 50, text: "Hi there", color: "#000000", size: 14 }]);
});

test("errors name the line and column", () => {
    const at = (source, options) => {
        const { error, exitCode } = runLogo(source, options);
        assert.equal(exitCode, 1, source);
        return error;
    };
    assert.deepEqual(at("fd 10\nfoo 20"), { message: "I don't know how to FOO", line: 2, column: 1 });
    assert.deepEqual(at("fd"), { message: "Not enough inputs to FD", line: 1, column: 1 });
    assert.deepEqual(at("fd 10\n5"), { message: "You don't say what to do with 5", line: 2, column: 1 });
    assert.deepEqual(at("print fd 10"), { message: "FD didn't output to PRINT", line: 1, column: 7 });
    assert.deepEqual(at("fd \"abc"), { message: "FD doesn't like abc as input", line: 1, column: 1 });
    assert.deepEqual(at("print :nope"), { message: "nope has no value", line: 1, column: 7 });
    assert.deepEqual(at("print 1 / 0"), { message: "Division by zero", line: 1, column: 9 });
    assert.deepEqual(at("repeat 4 [fd 10"), { message: "Missing ]", line: 1, column: 10 });
    assert.deepEqual(at("fd 10 ]"), { message: "Unexpected ]", line: 1, column: 7 });
    assert.deepEqual(at("print (1 + 2"), { message: "Missing )", line: 1, column: 7 });
    assert.deepEqual(at("to square :n\nfd :n"), { message: "TO square has no END", line: 1, column: 1 });
    assert.deepEqual(at("output 5"), { message: "OUTPUT can only be used inside a procedure", line: 1, column: 1 });
    assert.match(at("to fd :n\nend").message, /FD is a primitive/);
    assert.deepEqual(at("to square :n\n  repeat 4 [fd :n rt 90 oops]\nend\nsquare 10"), { message: "I don't know how to OOPS", line: 2, column: 25 }, "errors inside procedures keep their own line");
    assert.equal(at("fd \"abc", { locale: "tr" }).message, "FD, abc değerini girdi olarak kabul etmiyor");
    assert.equal(at("ileri 10", { locale: "tr" }).message, "ILERI komutunu bilmiyorum");
});

test("endless loops, runaway recursion and huge drawings stop with an error", () => {
    const loop = runLogo("make \"i 0\nwhile [true] [make \"i :i + 1]", { maxSteps: 10_000 });
    assert.match(loop.error.message, /Step limit reached \(10,000 steps\)/);
    assert.equal(loop.error.line, 2);
    const forever = runLogo("to spin\n  rt 1\n  spin\nend\nspin");
    assert.match(forever.error.message, /nested too deeply \(400 levels\)/);
    assert.equal(forever.error.line, 3);
    assert.equal(runLogo("to down :n\n  if :n = 0 [stop]\n  down :n - 1\nend\ndown 390").error, undefined, "deep but finite recursion is fine");
    const huge = runLogo("repeat 100 [fd 1 rt 1]", { maxSegments: 50 });
    assert.match(huge.error.message, /too large \(at most 50 lines\)/);
    assert.equal(huge.segments.length, 50);
    const chatty = runLogo("repeat 100 [print \"aaaaaaaaaa]", { maxOutput: 100 });
    assert.match(chatty.output, /… \(output truncated\)\n$/);
    assert.equal(chatty.error, undefined);
});

test("the drawing becomes a self-contained SVG with y pointing up", () => {
    const result = runLogo("setpc \"blue repeat 5 [fd 50 rt 144] label \"star");
    const svg = renderLogoSvg(result, { title: "Star & stripes" });
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-\d. ]+" role="img"><title>Star &amp; stripes<\/title>/);
    assert.match(svg, /<path d="M0 0L0 -50L29\.39 -9\.55L-18\.16 -25L29\.39 -40\.45L0 0" stroke="#2563EB" stroke-width="2"\/>/, "one path per pen, y flipped");
    assert.match(svg, /<text x="0" y="0" fill="#2563EB" font-size="14">star<\/text>/);
    assert.match(svg, /<polygon points="[^"]+" fill="#2563EB"/, "the visible turtle is drawn");
    assert.doesNotMatch(svg, /<script|on\w+=/i);
    assert.doesNotMatch(renderLogoSvg(runLogo("ht")), /<polygon/);
    assert.match(renderLogoSvg(runLogo("label \"<b>&")), />&lt;b&gt;&amp;<\/text>/, "label text is escaped");
    const [, , , width, height] = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(renderLogoSvg(runLogo(""))).map(Number);
    assert.ok(width >= 200 && height >= 200, "an empty drawing still gets a 200 × 200 paper");
});

test("the preview document is static and shows the drawing, the output and the error", () => {
    const labels = { output: "OUT", error: "ERR", location: "line {line}, column {column}", stats: "Lines: {lines} · Steps: {steps}", drawing: "DRAWING" };
    const document = (result, source, dark) => buildLogoDocument(result, source, { dark, labels, svg: renderLogoSvg(result, { title: labels.drawing }) });
    const ok = document(runLogo("repeat 4 [fd 10 rt 90] print \"done"), "", true);
    assert.ok(ok.includes(`content="${STATIC_PREVIEW_CSP}"`));
    assert.match(ok, /data-theme="dark"/);
    assert.match(ok, /<title>DRAWING<\/title>/);
    assert.match(ok, /<h2>OUT<\/h2><pre>done<\/pre>/);
    assert.match(ok, /Lines: 4 · Steps: \d+/);
    assert.doesNotMatch(ok, /<script/i);
    const source = "fd 10\nfoo <b>";
    const failed = document(runLogo(source), source, false);
    assert.match(failed, /<div class="error" role="alert"><strong>ERR<\/strong> \(line 2, column 1\)<br>I don't know how to FOO<pre>foo &lt;b&gt;\n\^<\/pre><\/div>/);
});

test("every Logo template runs without errors", () => {
    const samples = [
        { id: "hello", code: LANGUAGES.find((language) => language.id === "logo").template },
        ...FILE_TEMPLATES.filter((template) => template.language === "logo"),
    ];
    assert.ok(samples.length >= 2);
    for (const sample of samples) {
        const result = runLogo(sample.code);
        assert.equal(result.error, undefined, `${sample.id}: ${result.error?.message}`);
        assert.ok(result.segments.length > 10, `${sample.id} draws something`);
    }
    assert.equal(runLogo(samples[0].code).labels[0].text, "Hello World from Hanogt!");
});
