// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { NEWS_CATEGORIES, NEWS_SOURCES, inferTags } = await load("lib/news/sources.ts");

test("economy & finance is a category with Turkish and English sources", () => {
    assert.ok(NEWS_CATEGORIES.some((entry) => entry.id === "finance"));
    const finance = NEWS_SOURCES.filter((source) => source.category === "finance");
    assert.ok(finance.some((source) => source.language === "tr"));
    assert.ok(finance.some((source) => source.language === "en"));
    for (const source of NEWS_SOURCES) assert.match(source.url, /^https:\/\//, source.id);
    assert.equal(new Set(NEWS_SOURCES.map((source) => source.id)).size, NEWS_SOURCES.length);
});

test("finance-heavy tech headlines get the finance tag too", () => {
    assert.ok(inferTags("Nvidia shares jump after earnings beat", "", "apps").includes("finance"));
    assert.ok(inferTags("Borsa İstanbul'da teknoloji hisseleri yükseldi", "", "apps").includes("finance"));
    assert.ok(!inferTags("New React compiler released", "", "software").includes("finance"));
    assert.deepEqual(inferTags("Dolar güne yükselişle başladı", "", "finance"), ["finance"]);
});
