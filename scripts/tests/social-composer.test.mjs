// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { findTrigger, applySuggestion, rankByQuery, foldForMatch } = await load("lib/social/composer.ts");
const { searchEmoji, emojiByChar, ALL_EMOJI, EMOJI_CATEGORY_IDS, EMOJI_BY_CATEGORY } = await load("lib/social/emoji.ts");
const { readSocialPrefs, enterAction, DEFAULT_SOCIAL_PREFS, SOCIAL_PREF_KEYS, VOICE_BITRATE } = await load("lib/social/prefs.ts");

test("triggers at the caret: people, channels, commands and emoji", () => {
    assert.deepEqual(findTrigger("selam @al", 9), { kind: "mention", query: "al", start: 6, end: 9 });
    assert.deepEqual(findTrigger("@", 1), { kind: "mention", query: "", start: 0, end: 1 });
    assert.deepEqual(findTrigger("bak #gen", 8), { kind: "channel", query: "gen", start: 4, end: 8 });
    assert.deepEqual(findTrigger("/sus", 4), { kind: "command", query: "sus", start: 0, end: 4 });
    assert.deepEqual(findTrigger("harika :smi", 11), { kind: "emoji", query: "smi", start: 7, end: 11 });
    // Commands only at the start; e-mail addresses and words with # inside are no triggers.
    assert.equal(findTrigger("selam /sus", 10), null);
    assert.equal(findTrigger("ali@example", 11), null);
    assert.equal(findTrigger("c#", 2), null);
    assert.equal(findTrigger("saat 10:30", 10), null);
    // After a space the trigger is over.
    assert.equal(findTrigger("@ali ", 5), null);
    // The caret decides, not the end of the text.
    assert.deepEqual(findTrigger("@al sonra", 3), { kind: "mention", query: "al", start: 0, end: 3 });
});

test("a picked suggestion replaces the trigger and adds one space", () => {
    const trigger = findTrigger("selam @al nasılsın", 9);
    assert.deepEqual(applySuggestion("selam @al nasılsın", trigger, "@Ali"), { value: "selam @Ali nasılsın", caret: 11 });
    const end = findTrigger("/sus", 4);
    assert.deepEqual(applySuggestion("/sus", end, "/sustur"), { value: "/sustur ", caret: 8 });
});

test("names are ranked by how they match, Turkish letters folded", () => {
    const names = ["Zeynep", "Ali Veli", "Işıl", "Kerem Ali", "Malik"];
    assert.deepEqual(rankByQuery(names, "ali", (name) => name), ["Ali Veli", "Kerem Ali", "Malik"]);
    assert.deepEqual(rankByQuery(names, "isi", (name) => name), ["Işıl"]);
    assert.deepEqual(rankByQuery(names, "", (name) => name, 2), ["Zeynep", "Ali Veli"]);
    assert.equal(foldForMatch("İSTANBUL Çağrı"), "istanbul cagri");
});

test("emoji search finds English and Turkish words", () => {
    assert.ok(ALL_EMOJI.length > 300);
    for (const id of EMOJI_CATEGORY_IDS) assert.ok(EMOJI_BY_CATEGORY[id].length >= 30, id);
    assert.equal(searchEmoji("thumbsup")[0].char, "👍");
    assert.ok(searchEmoji("kalp").some((entry) => entry.char === "❤️"));
    assert.ok(searchEmoji("ateş").some((entry) => entry.char === "🔥"));
    assert.ok(searchEmoji(":fire:").some((entry) => entry.char === "🔥"));
    assert.deepEqual(searchEmoji("   "), []);
    assert.equal(searchEmoji("e", 5).length, 5);
    assert.equal(emojiByChar("🚀").name, "rocket");
    // Every emoji appears once and has a shortcode name.
    assert.equal(new Set(ALL_EMOJI.map((entry) => entry.char)).size, ALL_EMOJI.length);
    assert.ok(ALL_EMOJI.every((entry) => /^[a-z0-9_]+$/.test(entry.name)));
});

test("messaging settings: defaults, odd values and the Enter key", () => {
    assert.deepEqual(readSocialPrefs(null), DEFAULT_SOCIAL_PREFS);
    assert.deepEqual(readSocialPrefs({ enterToSend: false, msgFontSize: "huge", chatBackground: "pattern", readReceipts: "no", mentionNotifications: false }), {
        ...DEFAULT_SOCIAL_PREFS, enterToSend: false, chatBackground: "pattern", mentionNotifications: false,
    });
    assert.equal(SOCIAL_PREF_KEYS.length, Object.keys(DEFAULT_SOCIAL_PREFS).length);
    const key = (extra = {}) => ({ key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false, isComposing: false, ...extra });
    assert.equal(enterAction(key(), true, false), "send");
    assert.equal(enterAction(key(), false, false), "newline");
    assert.equal(enterAction(key({ ctrlKey: true }), false, false), "send");
    assert.equal(enterAction(key({ shiftKey: true }), true, false), "newline");
    assert.equal(enterAction(key(), true, true), "newline");
    assert.equal(enterAction(key({ isComposing: true }), true, false), null);
    assert.equal(enterAction(key({ key: "a" }), true, false), null);
    assert.ok(VOICE_BITRATE.high * 60 / 8 < 3 * 1024 * 1024);
});
