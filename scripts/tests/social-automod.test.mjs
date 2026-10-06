// Run: node --test scripts/tests/*.test.mjs
// AutoMod of Hanogt Social groups (lib/social/automod-config.ts,
// lib/server/automod.ts): settings as stored, and which messages each filter stops.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const config = await load("lib/social/automod-config.ts");
const automod = await load("lib/server/automod.ts");
const { sanitizeAutoMod, sanitizeCustomWords, normalizeDomain, DEFAULT_AUTOMOD } = config;
const { scanMessage, linkHosts, repeatKey } = automod;

const ALL = sanitizeAutoMod({ profanity: true, slang: true, spam: true, maxMentions: 3, links: "allowlist", linkAllowlist: ["github.com"], caps: true, personalData: true });
const scan = (text, settings = ALL, words = [], mentions = 0) => scanMessage({ text, mentions }, settings, words);
const rule = (text, settings, words, mentions) => {
    const verdict = scan(text, settings, words, mentions);
    return verdict.ok ? null : verdict.rule;
};

test("settings: defaults, limits and the owner always exempt", () => {
    assert.deepEqual(sanitizeAutoMod(null), { ...DEFAULT_AUTOMOD, exempt: ["admin", "owner"] });
    const clean = sanitizeAutoMod({ enabled: "yes", maxMentions: 99, links: "sometimes", linkAllowlist: ["https://www.GitHub.com/x", "not a host", "github.com", "docs.python.org"], action: "block_warn", muteAfterWarnings: -3, muteMinutes: 999_999, exempt: ["moderator", "owner", "member", "x"] });
    assert.equal(clean.enabled, true, "not a boolean: the default");
    assert.equal(clean.maxMentions, 25);
    assert.equal(clean.links, "allow");
    assert.deepEqual(clean.linkAllowlist, ["github.com", "docs.python.org"]);
    assert.equal(clean.action, "block_warn");
    assert.equal(clean.muteAfterWarnings, 0);
    assert.equal(clean.muteMinutes, 40_320);
    assert.deepEqual(clean.exempt, ["moderator", "owner"], "members can't be exempt; the owner always is");
    assert.deepEqual(sanitizeAutoMod({ exempt: [] }).exempt, ["owner"]);
    assert.equal(normalizeDomain("http://user@evil"), null);
    assert.equal(normalizeDomain("WWW.Example.co.uk"), "example.co.uk");
});

test("custom words: trimmed, lower case, no duplicates, at most 1,000 (the most any plan allows)", () => {
    assert.deepEqual(sanitizeCustomWords(["  Kötü  Söz ", "kötü söz", "a", 5, "ÇİRKİN"]), ["kötü söz", "çirkin"]);
    assert.equal(sanitizeCustomWords(Array.from({ length: 1500 }, (_, i) => `kelime${i}`)).length, 1000);
    assert.equal(sanitizeCustomWords(["x".repeat(80)])[0].length, 40);
});

test("swearing: Turkish and English, disguised spellings, whole words only", () => {
    for (const text of ["siktir git", "S1KT1R", "siiiiiktir", "what the fuck", "f u c k is fine but FUCK isn't", "orospu çocuğu"]) {
        if (text.startsWith("f u c k")) assert.equal(rule(text), "profanity", text);
        else assert.equal(rule(text), "profanity", text);
    }
    for (const text of ["I got it", "Bu kod çalışıyor", "class Assessment", "skunk", "amkara değil ankara"]) assert.equal(rule(text), null, text);
    assert.equal(rule("siktir", { ...ALL, profanity: false }), null, "off");
});

test("slang only when the group turns it on; folded Turkish letters count", () => {
    assert.equal(rule("sen tam bir salaksın"), "slang");
    assert.equal(rule("gerizekali misin"), "slang", "written without ı");
    assert.equal(rule("LAN partisi yapalım"), null, "'lan' isn't on the list");
    assert.equal(rule("ayı gibi uyudum, mal varlığı"), null, "everyday words aren't");
    assert.equal(rule("salak", sanitizeAutoMod({})), null, "off by default");
});

test("a group's own words, phrases included", () => {
    assert.equal(rule("bu bir Yasak Kelime örneği", ALL, ["yasak kelime"]), "custom");
    assert.equal(rule("şerefsizlik", ALL, ["serefsizlik"]), "custom", "folded");
    assert.equal(rule("yasaklı kelimeler", ALL, ["yasak"]), null, "whole words only");
});

test("personal data, links, mentions and capitals", () => {
    assert.equal(rule("numaram 0532 123 45 67"), "personal");
    assert.equal(rule("mailim ali@example.com"), "personal");
    assert.equal(rule("kod burada https://github.com/hanogt/x"), null, "on the allow-list");
    assert.equal(rule("bak: https://evil.example/phish"), "links");
    assert.equal(rule("bak: www.evil.example"), "links");
    const noLinks = sanitizeAutoMod({ links: "block" });
    assert.equal(rule("https://github.com", noLinks), "links");
    assert.equal(rule("https://github.com", noLinks), "links", "the same answer twice in a row");
    assert.deepEqual(linkHosts("a https://www.Example.com/x b http://docs.python.org c"), ["example.com", "docs.python.org"]);
    assert.equal(rule("@a @b @c @d selam", ALL, [], 4), "mentions");
    assert.equal(rule("@a @b @c selam", ALL, [], 3), null);
    assert.equal(rule("BU GRUBA HERKES GELSİN ARTIK"), "caps");
    assert.equal(rule("SQL ve HTML öğreniyorum"), null, "a few capitals are fine");
});

test("disabled AutoMod lets everything through; repeats compare the words", () => {
    assert.deepEqual(scan("siktir https://evil.example 0532 123 45 67", sanitizeAutoMod({ enabled: false })), { ok: true });
    assert.equal(repeatKey("Merhaba   DÜNYA!!!"), repeatKey("merhaba dünya"));
    assert.notEqual(repeatKey("merhaba dünya"), repeatKey("merhaba dünyalar"));
});
