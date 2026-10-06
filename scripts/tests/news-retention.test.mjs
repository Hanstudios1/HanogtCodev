// Run: node --test scripts/tests/
// Hanogt News keeps a story for one day: the feed, the stored fallback, the
// comments and the old archive are all trimmed to the last 24 hours.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const {
    NEWS_RETENTION_MS, UNDATED_FORGET_MS, UNDATED_MEMORY_MAX,
    dropExpiredStories, isWithinRetention, newsCutoff, parseUndated, resolveUndated, serializeUndated,
} = await load("lib/news/retention.ts");
const { selectItems } = await load("lib/news/select.ts");
const { mergeNewsItems } = await load("components/News/NewsTypes.ts");
const { purgeOldNews } = await load("lib/server/news-retention.ts");
const { buildStorageReport, purgeExpiredRecords, EXPIRING_COLLECTIONS } = await load("lib/server/storage-report.ts");

const HOUR = 3600 * 1000;
const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const id = (n) => String(n).padStart(20, "0").replace(/^0/, "a");

// ---------------------------------------------------------------------------
// The one-day rule
// ---------------------------------------------------------------------------

test("a story is kept for exactly one day", () => {
    assert.equal(NEWS_RETENTION_MS, 24 * HOUR);
    assert.equal(newsCutoff(NOW), NOW - 24 * HOUR);
    assert.equal(isWithinRetention(iso(NOW - 24 * HOUR), NOW), true);
    assert.equal(isWithinRetention(iso(NOW - 24 * HOUR - 1), NOW), false);
    assert.equal(isWithinRetention(iso(NOW - 2 * HOUR), NOW), true);
    assert.equal(isWithinRetention("not a date", NOW), false);
    const stories = [
        { id: "new", publishedAt: iso(NOW - HOUR) },
        { id: "old", publishedAt: iso(NOW - 30 * HOUR) },
        { id: "edge", publishedAt: iso(NOW - 24 * HOUR) },
    ];
    assert.deepEqual(dropExpiredStories(stories, NOW).map((story) => story.id), ["new", "edge"]);
});

test("the live feed drops stories older than a day", () => {
    const candidates = [
        { id: "a", title: "Fresh story", publishedAt: iso(NOW - HOUR), category: "ai" },
        { id: "b", title: "Yesterday morning", publishedAt: iso(NOW - 23 * HOUR), category: "ai" },
        { id: "c", title: "Two days ago", publishedAt: iso(NOW - 48 * HOUR), category: "ai" },
        { id: "d", title: "Last week", publishedAt: iso(NOW - 7 * 24 * HOUR), category: "finance" },
    ];
    const items = selectItems(candidates, { now: NOW, maxAgeMs: NEWS_RETENTION_MS, maxItems: 300, perCategory: 60 });
    assert.deepEqual(items.map((item) => item.id), ["a", "b"]);
});

test("the browser keeps up to 300 merged stories", () => {
    const story = (n) => ({ id: id(n), title: `Story ${n}`, link: `https://example.com/${n}`, summary: "", image: null, publishedAt: iso(NOW - n * 1000), source: { id: "s", name: "S", homepage: "https://example.com" }, category: "ai", tags: [], language: "en" });
    const merged = mergeNewsItems(Array.from({ length: 200 }, (_, n) => story(n)), Array.from({ length: 200 }, (_, n) => story(n + 200)));
    assert.equal(merged.length, 300);
    assert.equal(merged[0].id, id(0));
});

// ---------------------------------------------------------------------------
// Stories whose feed gives no date
// ---------------------------------------------------------------------------

test("an undated story ages from the first time it was seen", () => {
    const memory = new Map();
    const first = resolveUndated([{ id: id(1), publishedAt: null }, { id: id(2), publishedAt: iso(NOW - HOUR) }], memory, NOW);
    assert.equal(first[0].publishedAt, iso(NOW));
    assert.equal(first[1].publishedAt, iso(NOW - HOUR));
    assert.equal(memory.size, 1);

    // Seen again later: it keeps its first time, so after a day it leaves the feed instead of looking new.
    const later = NOW + 25 * HOUR;
    const again = resolveUndated([{ id: id(1), publishedAt: null }], memory, later);
    assert.equal(again[0].publishedAt, iso(NOW));
    assert.equal(isWithinRetention(again[0].publishedAt, later), false);
    assert.equal(memory.get(id(1)).last, iso(later));

    // Gone from every feed for two days: forgotten.
    resolveUndated([], memory, later + UNDATED_FORGET_MS + 1);
    assert.equal(memory.size, 0);
});

test("undated sightings survive a restart and stay bounded", () => {
    const memory = new Map();
    const many = Array.from({ length: UNDATED_MEMORY_MAX + 25 }, (_, n) => ({ id: id(n + 10), publishedAt: null }));
    resolveUndated(many, memory, NOW);
    assert.equal(memory.size, UNDATED_MEMORY_MAX);

    const restored = parseUndated(serializeUndated(memory));
    assert.equal(restored.size, UNDATED_MEMORY_MAX);
    const [someId, sighting] = [...memory.entries()][0];
    assert.deepEqual(restored.get(someId), sighting);

    assert.equal(parseUndated("not json").size, 0);
    assert.equal(parseUndated(42).size, 0);
    assert.equal(parseUndated(JSON.stringify([["../evil", iso(NOW), iso(NOW)], [id(3), "x", iso(NOW)], [id(4), iso(NOW), iso(NOW)]])).size, 1);
});

// ---------------------------------------------------------------------------
// Cleanup of what is stored in Firestore
// ---------------------------------------------------------------------------

function newsSeed() {
    const seed = {
        "news_cache/archive_state": { upTo: iso(NOW - HOUR) },
        "news_cache/latest": { snapshot: "{}", fetchedAt: iso(NOW) },
        // Comments: one written two days ago, one an hour ago.
        "news_comments/old": { newsId: id(1), text: "eski", createdAt: iso(NOW - 48 * HOUR) },
        "news_comments/fresh": { newsId: id(2), text: "yeni", createdAt: iso(NOW - HOUR) },
        [`news_meta/${id(1)}`]: { commentCount: 1 },
    };
    for (let n = 0; n < 5; n += 1) seed[`news_items/${id(100 + n)}`] = { id: id(100 + n), title: `Archived ${n}`, publishedAt: iso(NOW - (n + 2) * 24 * HOUR) };
    return seed;
}

test("the cleanup deletes the old archive, old comments and idle counters, a budget at a time", async () => {
    await withBackend(newsSeed(), {}, async (db) => {
        // The fake database stamps documents at 2026-10-01; this run happens five days later.
        const partial = await purgeOldNews({ now: NOW, budget: 2 });
        assert.equal(partial.archive, 2);
        assert.equal(partial.done, false);
        assert.equal(db.paths().filter((path) => path.startsWith("news_items/")).length, 3);
        assert.ok(db.has("news_cache/archive_state"), "the high-water mark goes only with the last archive page");

        const rest = await purgeOldNews({ now: NOW, budget: 1000 });
        assert.equal(rest.archive, 3);
        assert.equal(rest.comments, 1);
        assert.equal(rest.counters, 1);
        assert.equal(rest.done, true);
        assert.equal(db.paths().filter((path) => path.startsWith("news_items/")).length, 0);
        assert.equal(db.has("news_cache/archive_state"), false);
        assert.ok(db.has("news_cache/latest"), "the shared snapshot stays");
        assert.equal(db.has("news_comments/old"), false);
        assert.ok(db.has("news_comments/fresh"), "comments from the last day stay");
        assert.equal(db.has(`news_meta/${id(1)}`), false);
    });
});

test("a counter touched within the last day stays", async () => {
    const seed = { [`news_meta/${id(7)}`]: { commentCount: 2 } };
    await withBackend(seed, {}, async (db) => {
        // The counter was stamped at 2026-10-01T00:00; twelve hours later it is still in use.
        const result = await purgeOldNews({ now: Date.parse("2026-10-01T12:00:00.000Z"), budget: 100 });
        assert.equal(result.counters, 0);
        assert.ok(db.has(`news_meta/${id(7)}`));
    });
});

// ---------------------------------------------------------------------------
// Storage view and expired records
// ---------------------------------------------------------------------------

test("the storage view counts documents, file bytes and expired records", async () => {
    const seed = {
        "news_comments/a": { newsId: id(1), createdAt: iso(NOW) },
        "message_files/f1": { size: 1000 },
        "message_files/f2": { size: 2500 },
        "security_rate_limits/old": { count: 1, expiresAt: new Date(NOW - HOUR) },
        "security_rate_limits/live": { count: 1, expiresAt: new Date(NOW + HOUR) },
        "calls/c1": { status: "declined", expiresAt: new Date(NOW - 2 * HOUR) },
    };
    await withBackend(seed, {}, async (db) => {
        const report = await buildStorageReport(NOW);
        const row = (name) => report.rows.find((entry) => entry.id === name);
        assert.equal(row("news_comments").count, 1);
        assert.equal(row("message_files").count, 2);
        assert.equal(row("message_files").bytes, 3500);
        assert.equal(row("security_rate_limits").count, 2);
        assert.equal(row("security_rate_limits").expired, 1);
        assert.equal(row("calls").expired, 1);
        assert.equal(row("news_items").count, 0);
        assert.equal(row("news_items").expired, null);
        assert.ok(EXPIRING_COLLECTIONS.includes("security_rate_limits"));

        const result = await purgeExpiredRecords(NOW);
        assert.deepEqual(result.deleted, { security_rate_limits: 1, calls: 1 });
        assert.equal(result.done, true);
        assert.equal(db.has("security_rate_limits/old"), false);
        assert.ok(db.has("security_rate_limits/live"));
        assert.equal(db.has("calls/c1"), false);
        assert.ok(db.has("message_files/f1"), "files are never touched");
    });
});
