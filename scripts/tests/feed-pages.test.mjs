// Run: node --test scripts/tests/
// Paged public lists (src/lib/server/feed-pages.ts): opaque cursors, pages that
// never skip or repeat rows with equal values, filtered pages that remember how
// far they read; one-time backfills (backfill.ts) and batch reads (getServerDocuments).
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const { FeedCursorError, decodeFeedCursor, encodeFeedCursor, feedCursorOf, feedPage } = await load("lib/server/feed-pages.ts");
const { ensureBackfill, fillMissingFields, forgetBackfills } = await load("lib/server/backfill.ts");
const { getServerDocuments } = await load("lib/server/firebase-rest.ts");

const BY_PLAYS = [{ field: "plays", type: "number" }, { field: "createdAt", type: "text" }];
const NEWEST = [{ field: "createdAt", type: "timestamp" }];

test("cursors round-trip and anything else is refused", () => {
    const cursor = { values: [12, "2026-10-01T10:00:00.000Z"], path: "arcade_games/game_abcdefgh" };
    const raw = encodeFeedCursor(cursor);
    assert.match(raw, /^[A-Za-z0-9_-]+$/, "base64url: safe in a query string");
    assert.deepEqual(decodeFeedCursor(raw, "arcade_games", BY_PLAYS), cursor);
    assert.equal(decodeFeedCursor(null, "arcade_games", BY_PLAYS), null);
    assert.equal(decodeFeedCursor("", "arcade_games", BY_PLAYS), null);
    const bad = [
        "%%%",
        "x".repeat(900),
        Buffer.from("not json").toString("base64url"),
        Buffer.from(JSON.stringify({ a: 1 })).toString("base64url"),
        // Wrong number of values for this order.
        encodeFeedCursor({ values: [12], path: "arcade_games/game_abcdefgh" }),
        // Another collection's document.
        encodeFeedCursor({ values: [12, "2026-10-01T10:00:00.000Z"], path: "users/someone" }),
        // A path that would leave the collection.
        Buffer.from(JSON.stringify([12, "2026-10-01T10:00:00.000Z", "arcade_games/../users/x"])).toString("base64url"),
        // A number where the order needs one, and a non-finite one.
        Buffer.from(JSON.stringify(["12", "2026-10-01T10:00:00.000Z", "arcade_games/game_abcdefgh"])).toString("base64url"),
        Buffer.from(JSON.stringify([null, "2026-10-01T10:00:00.000Z", "arcade_games/game_abcdefgh"])).toString("base64url"),
    ];
    for (const value of bad) assert.throws(() => decodeFeedCursor(value, "arcade_games", BY_PLAYS), FeedCursorError, value.slice(0, 40));
    // Timestamps must be times.
    assert.throws(() => decodeFeedCursor(encodeFeedCursor({ values: ["yesterday"], path: "media_posts/p1" }), "media_posts", NEWEST), FeedCursorError);
    assert.deepEqual(feedCursorOf({ _path: "media_posts/p1", createdAt: "2026-10-01T10:00:00Z" }, NEWEST), { values: ["2026-10-01T10:00:00.000Z"], path: "media_posts/p1" });
    assert.equal(feedCursorOf({ _path: "media_posts/p1" }, NEWEST), null);
});

function games(count) {
    const seed = {};
    for (let index = 0; index < count; index += 1) {
        // Plenty of equal play counts and equal times: the path keeps the order total.
        seed[`arcade_games/game_${String(index).padStart(8, "0")}`] = { plays: index % 3, createdAt: `2026-10-0${1 + (index % 2)}T00:00:00.000Z`, title: `Game ${index}`, dimension: index % 4 === 0 ? "2d" : "3d" };
    }
    return seed;
}

test("pages follow each other without skipping or repeating equal values", async () => {
    await withBackend(games(23), {}, async () => {
        const seen = [];
        let cursor = null;
        let pages = 0;
        do {
            const page = await feedPage({ collectionId: "arcade_games", order: BY_PLAYS, select: ["title"], limit: 5, cursor: decodeFeedCursor(cursor, "arcade_games", BY_PLAYS) });
            assert.ok(page.items.length <= 5);
            seen.push(...page.items.map((item) => item._id));
            for (const item of page.items) assert.equal(item.dimension, undefined, "only the selected (and ordered) fields are read");
            cursor = page.nextCursor;
            pages += 1;
        } while (cursor && pages < 20);
        assert.equal(pages, 5);
        assert.equal(seen.length, 23);
        assert.equal(new Set(seen).size, 23, "no row twice");
        // Highest plays first, then the newest, then the path (descending).
        const all = Object.entries(games(23)).map(([path, data]) => ({ id: path.split("/")[1], ...data }));
        all.sort((a, b) => b.plays - a.plays || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        assert.deepEqual(seen, all.map((item) => item.id));
    });
});

test("a filtered page reads on until it is full and its cursor continues from where it stopped", async () => {
    await withBackend(games(40), {}, async () => {
        const keep = (row) => row.dimension === "2d";
        const first = await feedPage({ collectionId: "arcade_games", order: BY_PLAYS, select: ["title", "dimension"], limit: 4, cursor: null, keep, maxScan: 12 });
        assert.ok(first.items.every(keep));
        assert.ok(first.nextCursor, "more rows to read");
        const collected = [...first.items];
        let cursor = first.nextCursor;
        for (let guard = 0; cursor && guard < 20; guard += 1) {
            const page = await feedPage({ collectionId: "arcade_games", order: BY_PLAYS, select: ["title", "dimension"], limit: 4, cursor: decodeFeedCursor(cursor, "arcade_games", BY_PLAYS), keep, maxScan: 12 });
            assert.ok(page.items.every(keep));
            collected.push(...page.items);
            cursor = page.nextCursor;
        }
        assert.equal(collected.length, 10, "every 2D game exactly once");
        assert.equal(new Set(collected.map((item) => item._id)).size, 10);
    });
});

test("timestamps order and page like the stored times", async () => {
    const seed = {};
    for (let index = 0; index < 7; index += 1) seed[`media_posts/post-${index}`] = { createdAt: new Date(Date.UTC(2026, 9, 1, index)), title: `P${index}` };
    await withBackend(seed, {}, async () => {
        const first = await feedPage({ collectionId: "media_posts", order: NEWEST, limit: 3, cursor: null });
        assert.deepEqual(first.items.map((item) => item._id), ["post-6", "post-5", "post-4"]);
        const second = await feedPage({ collectionId: "media_posts", order: NEWEST, limit: 3, cursor: decodeFeedCursor(first.nextCursor, "media_posts", NEWEST) });
        assert.deepEqual(second.items.map((item) => item._id), ["post-3", "post-2", "post-1"]);
        const third = await feedPage({ collectionId: "media_posts", order: NEWEST, limit: 3, cursor: decodeFeedCursor(second.nextCursor, "media_posts", NEWEST) });
        assert.deepEqual(third.items.map((item) => item._id), ["post-0"]);
        assert.equal(third.nextCursor, null);
    });
});

test("batch reads keep the order asked and report missing documents", async () => {
    await withBackend({ "media_likes/a": { postId: "a", userEmail: "x@example.com" }, "media_likes/c": { postId: "c" } }, {}, async () => {
        const found = await getServerDocuments(["media_likes/a", "media_likes/b", "media_likes/c", "media_likes/a"], { fields: ["postId"] });
        assert.deepEqual(found.map((item) => item?._id ?? null), ["a", null, "c", "a"]);
        assert.deepEqual(Object.keys(found[0]).filter((key) => !key.startsWith("_")), ["postId"], "the field mask is applied");
        assert.deepEqual(await getServerDocuments([]), []);
    });
});

test("a backfill writes only missing fields, once per database", async () => {
    forgetBackfills();
    await withBackend({
        "media_posts/a": { title: "A" },
        "media_posts/b": { title: "B", downloadCount: 7 },
        "media_posts/c": { title: "C" },
    }, {}, async (db) => {
        let runs = 0;
        const run = async () => {
            runs += 1;
            await fillMissingFields("media_posts", ["downloadCount"], (row) => (typeof row.downloadCount === "number" ? null : { downloadCount: 0 }));
        };
        assert.equal(await ensureBackfill("mediaPosts", 1, run), true);
        assert.equal(db.get("media_posts/a").downloadCount, 0);
        assert.equal(db.get("media_posts/b").downloadCount, 7, "an existing value stays");
        assert.equal(db.get("media_posts/c").title, "C", "other fields stay");
        assert.equal(db.get("site_config/backfills").mediaPosts, 1);
        assert.equal(await ensureBackfill("mediaPosts", 1, run), true);
        assert.equal(runs, 1, "the same instance doesn't check again");
        forgetBackfills();
        assert.equal(await ensureBackfill("mediaPosts", 1, run), true);
        assert.equal(runs, 1, "another instance sees the marker");
        assert.equal(await ensureBackfill("mediaPosts", 2, run), true);
        assert.equal(runs, 2, "a new version runs again");
    });
    forgetBackfills();
});

test("a failed backfill is tried again later", async () => {
    forgetBackfills();
    await withBackend({}, {}, async () => {
        let runs = 0;
        const run = async () => {
            runs += 1;
            if (runs === 1) throw new Error("boom");
        };
        const warn = console.warn;
        console.warn = () => undefined;
        try {
            assert.equal(await ensureBackfill("arcadeGames", 1, run), false);
        } finally {
            console.warn = warn;
        }
        assert.equal(await ensureBackfill("arcadeGames", 1, run), true);
        assert.equal(runs, 2);
    });
    forgetBackfills();
});

test("a backfill doesn't overwrite a value written meanwhile", async () => {
    const { commitServerMutations } = await load("lib/server/firebase-rest.ts");
    await withBackend({ "media_posts/a": { title: "A" }, "media_posts/b": { title: "B" } }, {}, async (db) => {
        const fakeFetch = globalThis.fetch;
        let raced = false;
        // A download is counted between the backfill's read and its write of post a.
        globalThis.fetch = async (input, init = {}) => {
            const body = typeof init.body === "string" ? init.body : "";
            if (!raced && String(input).endsWith(":commit") && body.includes("media_posts/a") && body.includes("downloadCount") && !body.includes("increment")) {
                raced = true;
                globalThis.fetch = fakeFetch;
                await commitServerMutations([{ type: "increment", path: "media_posts/a", fields: { downloadCount: 3 } }]);
            }
            return fakeFetch(input, init);
        };
        try {
            const written = await fillMissingFields("media_posts", ["downloadCount"], (row) => (typeof row.downloadCount === "number" ? null : { downloadCount: 0 }));
            assert.equal(raced, true);
            assert.equal(written, 1, "post b only: post a was read again and needed nothing");
        } finally {
            globalThis.fetch = fakeFetch;
        }
        assert.equal(db.get("media_posts/a").downloadCount, 3, "the counted download stays");
        assert.equal(db.get("media_posts/b").downloadCount, 0);
    });
});
