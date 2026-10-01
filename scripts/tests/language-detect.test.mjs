// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { detectLanguage, languageForCountry, languageForBrowser, languageForBrowserTag } = await load("lib/language-detect.ts");

test("the visitor's country decides first", () => {
    assert.equal(detectLanguage("TR", ["en-US"]), "TR");
    assert.equal(detectLanguage("de", ["en-US"]), "DE");
    assert.equal(detectLanguage("BR", []), "PT");
    assert.equal(detectLanguage("TW", ["zh-CN"]), "TW");
    assert.equal(detectLanguage("SA", []), "AR");
});

test("unknown countries fall back to the browser, then English", () => {
    assert.equal(detectLanguage(null, ["fr-CA", "en"]), "FR");
    assert.equal(detectLanguage("XX", ["xx-YY", "ja-JP"]), "JP");
    assert.equal(detectLanguage(undefined, ["eo", "la"]), "EN");
    assert.equal(detectLanguage("AQ", []), "EN");
});

test("browser tags map to the site's languages", () => {
    assert.equal(languageForBrowserTag("zh-Hant-HK"), "TW");
    assert.equal(languageForBrowserTag("zh-Hans"), "CN");
    assert.equal(languageForBrowserTag("nl-BE"), "BE");
    assert.equal(languageForBrowserTag("nl-NL"), "NL");
    assert.equal(languageForBrowserTag("nb-NO"), "NO");
    assert.equal(languageForBrowserTag("fil-PH"), "TL");
    assert.equal(languageForBrowserTag("kk"), "KZ");
    assert.equal(languageForBrowserTag("iw"), "HE");
    assert.equal(languageForBrowserTag(""), null);
    assert.equal(languageForBrowser(["xx", "ko-KR"]), "KR");
    assert.equal(languageForCountry("tr"), "TR");
    assert.equal(languageForCountry(""), null);
});
