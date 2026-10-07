// Run: node --test scripts/tests/
// Share cards (src/lib/og-text.ts): the text and images the Open Graph cards of
// Arcade games and Media posts are drawn from. The renderer itself
// (src/lib/server/og-cards.tsx, next/og) needs the Next.js build.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { ogCount, ogImageSource, ogText } = await load("lib/og-text.ts");

const char = (...codes) => String.fromCodePoint(...codes);

test("card text: one line, no emoji or invisible characters, cut at a word", () => {
    assert.equal(ogText("Basit ama şık.\n\nİkinci paragraf.", 140), "Basit ama şık. İkinci paragraf.", "line breaks become spaces");
    assert.equal(ogText(`Uzay ${char(0x1f680)} Kaçışı ${char(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)} ${char(0x1f1f9, 0x1f1f7)}`, 70), "Uzay Kaçışı", "emoji, joined emoji and flags go");
    assert.equal(ogText(`a${char(0x202e)}b${char(0x200b)}c${char(0xfeff)}d${char(0x2066)}e`, 70), "abcde", "direction overrides and invisible characters go");
    assert.equal(ogText("Çok uzun bir oyun adı ki iki satıra sığmayabilir ve kesilmesi gerekebilir belki", 70), "Çok uzun bir oyun adı ki iki satıra sığmayabilir ve kesilmesi…");
    assert.equal(ogText("x".repeat(100), 10), `${"x".repeat(9)}…`, "a single long word is cut where it has to be");
    assert.equal([...ogText("ş".repeat(80), 20)].length, 20, "counted in characters, not bytes");
    assert.equal(ogText(42, 10), "");
    assert.equal(ogText("   ", 10), "");
});

test("covers: only PNG or JPEG data URLs of a sane size are drawn", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    assert.equal(ogImageSource(png), png);
    assert.equal(ogImageSource("data:image/jpeg;base64,/9j/4AAQ"), "data:image/jpeg;base64,/9j/4AAQ");
    assert.equal(ogImageSource("data:image/webp;base64,UklGR"), null, "the renderer can't draw WebP");
    assert.equal(ogImageSource("https://example.com/cover.png"), null, "nothing is fetched while drawing");
    assert.equal(ogImageSource("data:image/svg+xml;base64,PHN2Zz4="), null);
    assert.equal(ogImageSource(`data:image/png;base64,${"A".repeat(400_001)}`), null);
    assert.equal(ogImageSource(null), null);
});

test("counts on cards", () => {
    assert.deepEqual([0, 999, 1000, 1280, 15_234, 999_999, 2_500_000, -4, Number.NaN, "7"].map(ogCount), ["0", "999", "1K", "1.3K", "15K", "1M", "2.5M", "0", "0", "0"]);
});
