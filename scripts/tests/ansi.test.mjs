// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { parseAnsi, stripAnsi, hasAnsi, ansiStyleKey, xtermColor } = await load("lib/editor/ansi.ts");
const { linkifyAnsiOutput, linkifyOutput, stripAnsi: stripFromLinks } = await load("components/Editor/output-links.ts");

const E = "\u001b";
/** Compact view of the spans: [text, style key]. */
const view = (text) => parseAnsi(text).map((span) => [span.text, ansiStyleKey(span.style)]);

test("plain text is one unstyled span; empty text has none", () => {
    assert.deepEqual(parseAnsi("hello\nworld"), [{ text: "hello\nworld", style: null }]);
    assert.deepEqual(parseAnsi(""), []);
    assert.equal(hasAnsi("plain"), false);
    assert.equal(hasAnsi(`${E}[0m`), true);
});

test("basic attributes, their off codes and reset", () => {
    assert.deepEqual(view(`${E}[1mbold${E}[22m normal`), [["bold", "bold"], [" normal", ""]]);
    assert.deepEqual(view(`${E}[2mdim${E}[3mdim-italic${E}[23m${E}[22mx`), [["dim", "dim"], ["dim-italic", "dim italic"], ["x", ""]]);
    assert.deepEqual(view(`${E}[4mu${E}[24m ${E}[7mi${E}[27m ${E}[9ms${E}[29m`), [["u", "underline"], [" ", ""], ["i", "inverse"], [" ", ""], ["s", "strike"]]);
    assert.deepEqual(view(`${E}[1;3;4;31mall${E}[0mnone`), [["all", "bold italic underline fg:1"], ["none", ""]]);
    // An empty parameter list is a reset, as is a lone 0 with leading zeros.
    assert.deepEqual(view(`${E}[31mred${E}[mplain${E}[1;32mg${E}[00mplain`), [["red", "fg:1"], ["plain", ""], ["g", "bold fg:2"], ["plain", ""]]);
    // 21 is a double underline; "4:0" turns underlining off, "4:3" (curly) on.
    assert.deepEqual(view(`${E}[21ma${E}[4:0mb${E}[4:3mc`), [["a", "underline"], ["b", ""], ["c", "underline"]]);
});

test("16 colours: normal, bright, background and defaults", () => {
    assert.deepEqual(view(`${E}[30ma${E}[37mb${E}[90mc${E}[97md${E}[39me`), [["a", "fg:0"], ["b", "fg:7"], ["c", "fg:8"], ["d", "fg:15"], ["e", ""]]);
    assert.deepEqual(view(`${E}[41ma${E}[47mb${E}[100mc${E}[107md${E}[49me`), [["a", "bg:1"], ["b", "bg:7"], ["c", "bg:8"], ["d", "bg:15"], ["e", ""]]);
    assert.deepEqual(view(`${E}[31;44mx${E}[39my${E}[49mz`), [["x", "fg:1 bg:4"], ["y", "bg:4"], ["z", ""]]);
});

test("256 colours and true colour, with semicolons or colons", () => {
    assert.deepEqual(view(`${E}[38;5;208mo${E}[48;5;21mb`), [["o", "fg:208"], ["b", "fg:208 bg:21"]]);
    assert.deepEqual(view(`${E}[38;2;255;100;0mx`), [["x", "fg:#ff6400"]]);
    assert.deepEqual(view(`${E}[48;2;0;0;255;1mx`), [["x", "bold bg:#0000ff"]], "the codes after a true colour still apply");
    assert.deepEqual(view(`${E}[38:5:46mx`), [["x", "fg:46"]]);
    assert.deepEqual(view(`${E}[38:2::10:20:30mx`), [["x", "fg:#0a141e"]], "colour-space id left empty");
    assert.deepEqual(view(`${E}[38:2:10:20:30mx`), [["x", "fg:#0a141e"]], "without the colour-space id");
    assert.deepEqual(view(`${E}[38;5;300mx${E}[38;2;1;2mx`), [["xx", ""]], "out-of-range and incomplete colours are ignored");
    assert.deepEqual(view(`${E}[58;5;1;4mx`), [["x", "underline"]], "underline colours are consumed without effect");
    assert.equal(xtermColor(16), "#000000");
    assert.equal(xtermColor(196), "#ff0000");
    assert.equal(xtermColor(231), "#ffffff");
    assert.equal(xtermColor(232), "#080808");
    assert.equal(xtermColor(255), "#eeeeee");
});

test("other escape sequences are removed, text is kept", () => {
    // Cursor movement and erasing, private modes, keypad mode, character sets.
    assert.equal(stripAnsi(`a${E}[2K${E}[1Gb${E}[?25lc${E}[?25h${E}=d${E}(Be${E}7f`), "abcdef");
    // A window title (OSC ended by BEL) and an OSC 8 hyperlink (ended by ST): the link text stays.
    assert.equal(stripAnsi(`${E}]0;title\u0007${E}]8;;https://example.com${E}\\link${E}]8;;${E}\\ end`), "link end");
    // DCS strings and C1 CSI.
    assert.equal(stripAnsi(`x${E}Pq#0;1;2${E}\\y\u009b31mz`), "xyz");
    // Incomplete sequences at the end, and a lone ESC.
    assert.equal(stripAnsi(`done${E}[31`), "done");
    assert.equal(stripAnsi(`done${E}`), "done");
    assert.equal(stripAnsi(`osc${E}]0;never ends`), "osc");
    // Non-SGR sequences don't change the style; "m" with a private prefix isn't SGR.
    assert.deepEqual(view(`${E}[31mr${E}[2Ar${E}[>4;1mr`), [["rrr", "fg:1"]]);
    assert.equal(stripAnsi(`${E}[1m${E}[31merror${E}[0m: x`), "error: x");
    assert.equal(stripFromLinks(`${E}[1m${E}[31merror${E}[0m: x`), "error: x", "output-links re-exports the same function");
});

test("styles are shared, frozen objects and adjacent equal runs merge", () => {
    const spans = parseAnsi(`${E}[31ma${E}[1m${E}[22mb${E}[0m${E}[0mc`);
    assert.deepEqual(spans.map((span) => span.text), ["ab", "c"]);
    assert.ok(Object.isFrozen(spans[0].style));
    assert.throws(() => { spans[0].style.fg = 3; });
});

test("links are found in coloured output and keep their colours", () => {
    const text = `${E}[1m${E}[31mmain.py${E}[0m:${E}[33m3${E}[0m: error: bad\nok`;
    const chunks = linkifyAnsiOutput(text, ["main.py"]);
    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks[0].link, { text: "main.py:3", line: 3 });
    assert.deepEqual(chunks[0].pieces.map((piece) => [piece.text, ansiStyleKey(piece.style)]), [["main.py", "bold fg:1"], [":", ""], ["3", "fg:3"]]);
    assert.equal(chunks[1].link, undefined);
    assert.deepEqual(chunks[1].pieces.map((piece) => piece.text), [": error: bad\nok"]);
    // Every visible character appears exactly once, in order.
    assert.equal(chunks.flatMap((chunk) => chunk.pieces.map((piece) => piece.text)).join(""), stripAnsi(text));
});

test("a colour change inside a link, and text around several links", () => {
    const text = `see ${E}[36mprog.cc:5${E}[0m:10 and ${E}[4mFile "app.py", line 7${E}[24m.`;
    const chunks = linkifyAnsiOutput(text, ["app.py"]);
    const links = chunks.filter((chunk) => chunk.link).map((chunk) => chunk.link);
    assert.deepEqual(links, [{ text: "prog.cc:5:10", line: 5, column: 10 }, { text: 'File "app.py", line 7', line: 7 }]);
    assert.deepEqual(chunks[1].pieces.map((piece) => [piece.text, ansiStyleKey(piece.style)]), [["prog.cc:5", "fg:6"], [":10", ""]]);
    assert.equal(chunks.flatMap((chunk) => chunk.pieces.map((piece) => piece.text)).join(""), stripAnsi(text));
    // Without escape sequences the result matches linkifyOutput.
    const plain = "TypeError at main.js:12:5 (main.js:1)";
    assert.deepEqual(
        linkifyAnsiOutput(plain, ["main.js"]).map((chunk) => (chunk.link ? chunk.link : chunk.pieces.map((piece) => piece.text).join(""))),
        linkifyOutput(plain, ["main.js"]),
    );
    assert.deepEqual(linkifyAnsiOutput("", ["main.js"]), []);
});

test("large output is parsed in linear time", () => {
    const line = `${E}[32m✔${E}[0m test ${E}[2m(3 ms)${E}[22m\n`;
    const text = line.repeat(20_000);
    const started = performance.now();
    const spans = parseAnsi(text);
    const chunks = linkifyAnsiOutput(text, ["main.js"]);
    assert.ok(performance.now() - started < 2_000);
    assert.equal(spans.length, 80_000, "check mark, text, dim duration, newline");
    assert.equal(chunks.length, 1);
});
