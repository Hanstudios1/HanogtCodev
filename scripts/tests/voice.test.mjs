// Run: node --test scripts/tests/*.test.mjs
// Voice for Hanogt AI (lib/ai/voice.ts): the speech language of the site's
// language, what is read aloud from a Markdown answer, and dictated text
// added to the message box.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const voice = await load("lib/ai/voice.ts");
const features = await load("lib/features.ts");

test("the site's language as a speech tag, the browser's otherwise", () => {
    assert.equal(voice.speechLangOf("TR"), "tr-TR");
    assert.equal(voice.speechLangOf("en"), "en-US");
    assert.equal(voice.speechLangOf("JP"), "ja-JP");
    assert.equal(voice.speechLangOf("XX", "de-AT"), "de-AT");
});

test("an answer read aloud: code named, links and formatting gone, long answers cut at a sentence", () => {
    const markdown = [
        "# Başlık",
        "**Kalın** ve _eğik_ bir cümle, `inline` kodla.",
        "- birinci madde",
        "1. ikinci madde",
        "> alıntı",
        "Bkz. [Kod Editörü](/editor).",
        "```python",
        "print('merhaba')",
        "```",
        "Son.",
    ].join("\n");
    const spoken = voice.speechTextOf(markdown, "Kod bloğu.");
    assert.equal(spoken, "Başlık\nKalın ve eğik bir cümle, inline kodla.\nbirinci madde\nikinci madde\nalıntı\nBkz. Kod Editörü.\nKod bloğu.\nSon.");
    assert.ok(!spoken.includes("print"), "code isn't read character by character");
    assert.equal(voice.speechTextOf("```js\nunfinished", "Code block."), "Code block.", "an unfinished block while streaming");
    const long = "Bir cümle. ".repeat(600);
    const cut = voice.speechTextOf(long);
    assert.ok(cut.length <= voice.SPEECH_TEXT_MAX + 1, String(cut.length));
    assert.ok(cut.endsWith(".…"), cut.slice(-10));
});

test("a text is read as short pieces: a new piece per line, sentences joined while they fit", () => {
    assert.deepEqual(voice.speechChunksOf("Başlık\nBir. İki! Üç?\nSon…"), ["Başlık", "Bir. İki! Üç?", "Son…"]);
    assert.deepEqual(voice.speechChunksOf("v1.2 sürümü çıktı. Tamam.", 12), ["v1.2 sürümü", "çıktı.", "Tamam."], "a dot inside a word isn't a sentence end");
    const long = "Bu cümle, virgüllerle ayrılmış, oldukça uzun bir cümledir ve tek parçada okunamayacak kadar uzundur, bu yüzden bölünür.";
    const pieces = voice.speechChunksOf(long, 40);
    assert.ok(pieces.every((piece) => piece.length <= 40), JSON.stringify(pieces));
    assert.equal(pieces.join(" "), long, "nothing is lost or doubled");
    assert.ok(pieces[0].endsWith(","), "split at a comma first");
    assert.deepEqual(voice.speechChunksOf("a".repeat(25), 10), ["a".repeat(10), "a".repeat(10), "a".repeat(5)], "a word longer than a piece is cut anywhere");
    assert.deepEqual(voice.speechChunksOf("  \n \n"), []);
    const answer = voice.speechTextOf(`${"Uzun bir yanıt cümlesi burada. ".repeat(200)}`);
    assert.ok(voice.speechChunksOf(answer).every((piece) => piece.length <= voice.SPEECH_CHUNK_MAX));
});

test("dictation adds what was heard to what is typed", () => {
    assert.equal(voice.appendDictation("", "  merhaba   dünya "), "merhaba dünya");
    assert.equal(voice.appendDictation("Selam", "nasılsın"), "Selam nasılsın");
    assert.equal(voice.appendDictation("Selam ", "nasılsın"), "Selam nasılsın");
    assert.equal(voice.appendDictation("Selam", "   "), "Selam");
});

test("voice is early access by default: Pro and staff only", () => {
    const allowed = (viewer) => features.audienceAllows(features.DEFAULT_FEATURE_FLAGS.ai_voice, viewer);
    assert.equal(allowed({ staff: false, plan: "pro" }), true);
    assert.equal(allowed({ staff: true, plan: "free" }), true);
    assert.equal(allowed({ staff: false, plan: "plus" }), false);
    assert.equal(allowed(null), false);
});
