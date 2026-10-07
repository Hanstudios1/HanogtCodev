// Run: node --test scripts/tests/
// The Arcade gallery (src/lib/server/arcade-feed.ts): paged sorts, genres,
// creator pages and featured games; the one-time backfill of older games; star
// ratings (src/lib/arcade-ratings.ts, src/lib/server/arcade-ratings.ts) with
// their totals, removal with the game and with the account; creator ids; and
// game reports in the shared report queue (content-reports.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
process.env.NEXTAUTH_SECRET = "arcade-feed-test-secret";

const genres = await load("lib/arcade-genres.ts");
const ratings = await load("lib/arcade-ratings.ts");
const { creatorIdOf, isCreatorId, likerHash, arcadeSummary } = await load("lib/server/arcade.ts");
const feed = await load("lib/server/arcade-feed.ts");
const serverRatings = await load("lib/server/arcade-ratings.ts");
const { removeArcadeGame } = await load("lib/server/arcade-scores.ts");
const { deleteAccountData, deletionSteps } = await load("lib/server/account-deletion.ts");
const { contentReportId, fileContentReport } = await load("lib/server/content-reports.ts");
const { forgetBackfills } = await load("lib/server/backfill.ts");
const { commitServerMutations } = await load("lib/server/firebase-rest.ts");

const { ARCADE_GENRES, isArcadeGenre, normalizeArcadeGenre } = genres;
const { RATING_PRIOR, applyRatingChange, isRatingStars, ratingAverage, ratingFields, ratingScore, readRatingTotals } = ratings;
const { ARCADE_PAGE_SIZE, ArcadeListError, arcadeCreator, ensureArcadeBackfill, listArcadePage, listFeaturedArcadeGames, readArcadeListQuery } = feed;
const { arcadeRatingPath, readArcadeRating, setArcadeRating } = serverRatings;

const ALI = "ali@example.com";
const BERK = "berk@example.com";
const CEM = "cem@example.com";
const params = (value) => new URLSearchParams(value);

function game(index, extra = {}) {
    const owner = index % 3 === 0 ? ALI : BERK;
    return {
        ownerEmail: owner,
        title: `Oyun ${index}`,
        description: index % 4 === 0 ? "Hızlı bir yarış oyunu" : "Bir oyun",
        dimension: index % 2 ? "2d" : "3d",
        authorName: owner.split("@")[0],
        plays: (index * 7) % 13,
        likes: index % 5,
        genre: ARCADE_GENRES[index % ARCADE_GENRES.length],
        creatorId: creatorIdOf(owner),
        ...ratingFields({ count: index % 4, sum: (index % 4) * (1 + (index % 5)) }),
        game: "{\"huge\":true}",
        createdAt: new Date(Date.UTC(2026, 8, 1) + index * 3_600_000).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 8, 1) + index * 3_600_000).toISOString(),
        ...extra,
    };
}

function seedGames(count, extra = () => ({})) {
    const seed = {};
    for (let index = 0; index < count; index += 1) seed[`arcade_games/game_${String(index).padStart(8, "0")}`] = game(index, extra(index));
    return seed;
}

async function readAll(query) {
    const ids = [];
    let cursor = null;
    for (let guard = 0; guard < 30; guard += 1) {
        const page = await listArcadePage({ ...query, cursor });
        ids.push(...page.games.map((item) => item.id));
        if (!page.nextCursor) break;
        const next = new URLSearchParams({ sort: query.sort, cursor: page.nextCursor });
        if (query.creator) next.set("creator", query.creator);
        cursor = readArcadeListQuery(next).cursor;
    }
    return ids;
}

const ALL = { sort: "new", genre: null, dimension: null, q: null, creator: null };

// ---------------------------------------------------------------------------
// Genres and the list query
// ---------------------------------------------------------------------------

test("genres: the ten of the brief, anything else is \"other\"", () => {
    assert.deepEqual([...ARCADE_GENRES], ["action", "platformer", "puzzle", "racing", "shooter", "adventure", "arcade", "strategy", "sports", "other"]);
    for (const genre of ARCADE_GENRES) assert.equal(isArcadeGenre(genre), true);
    for (const value of ["Action", "rpg", "", null, 3, "__proto__"]) {
        assert.equal(isArcadeGenre(value), false, String(value));
        assert.equal(normalizeArcadeGenre(value), "other");
    }
    assert.equal(arcadeSummary({ title: "x" }, "game_abcdefgh").genre, "other", "a game without a genre counts as other");
});

test("the list query: sorts, genre, creator and cursors are checked", () => {
    assert.equal(readArcadeListQuery(params("")).sort, "new");
    assert.equal(readArcadeListQuery(params("sort=popular")).sort, "popular");
    assert.equal(readArcadeListQuery(params("sort=rated")).sort, "rated");
    assert.equal(readArcadeListQuery(params("sort=liked")).sort, "rated", "the old \"most liked\" link lands on top rated");
    assert.equal(readArcadeListQuery(params("genre=puzzle")).genre, "puzzle");
    assert.equal(readArcadeListQuery(params("genre=all")).genre, null);
    assert.equal(readArcadeListQuery(params("dimension=2d")).dimension, "2d");
    assert.equal(readArcadeListQuery(params("dimension=4d")).dimension, null);
    const creator = creatorIdOf(ALI);
    const forCreator = readArcadeListQuery(params(`creator=${creator}&sort=popular&genre=puzzle`));
    assert.deepEqual([forCreator.creator, forCreator.sort, forCreator.genre], [creator, "new", null], "a creator page is newest first, all genres");
    const refused = (value) => assert.throws(() => readArcadeListQuery(params(value)), (error) => error instanceof ArcadeListError && error.status === 400, value);
    refused("genre=rpg");
    refused("creator=ali@example.com");
    refused("creator=" + "g".repeat(24));
    refused("q=" + "x".repeat(61));
    refused("cursor=abc");
    refused("sort=popular&cursor=" + Buffer.from(JSON.stringify(["2026-10-01T00:00:00.000Z", "arcade_games/game_00000001"])).toString("base64url"));
});

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

test("pages of 24 for every sort, without repeats, never reading the game itself", async () => {
    forgetBackfills();
    await withBackend(seedGames(55), {}, async () => {
        for (const sort of ["new", "popular", "rated"]) {
            const first = await listArcadePage({ ...ALL, sort, cursor: null });
            assert.equal(first.games.length, ARCADE_PAGE_SIZE, sort);
            assert.ok(first.nextCursor);
            assert.equal("game" in first.games[0], false);
            assert.equal("ownerEmail" in first.games[0], false, "never the owner's address");
            const ids = await readAll({ ...ALL, sort });
            assert.equal(ids.length, 55, sort);
            assert.equal(new Set(ids).size, 55, sort);
        }
        const newest = await listArcadePage({ ...ALL, cursor: null });
        assert.equal(newest.games[0].id, "game_00000054");
        const popular = await listArcadePage({ ...ALL, sort: "popular", cursor: null });
        assert.ok(popular.games.every((item, index, list) => index === 0 || list[index - 1].plays >= item.plays));
        const rated = await readAll({ ...ALL, sort: "rated" });
        const scores = rated.map((id) => ratingScore(readRatingTotals(seedGames(55)[`arcade_games/${id}`])));
        assert.ok(scores.every((score, index) => index === 0 || scores[index - 1] >= score), "top rated: highest weighted score first");
    });
});

test("genre, dimension, search and creator filters", async () => {
    forgetBackfills();
    const seed = seedGames(40);
    const all = Object.entries(seed).map(([path, data]) => ({ id: path.split("/")[1], ...data }));
    await withBackend(seed, {}, async () => {
        const puzzle = await readAll({ ...ALL, sort: "popular", genre: "puzzle" });
        assert.deepEqual(new Set(puzzle), new Set(all.filter((item) => item.genre === "puzzle").map((item) => item.id)));
        const twoD = await readAll({ ...ALL, dimension: "2d" });
        assert.deepEqual(new Set(twoD), new Set(all.filter((item) => item.dimension === "2d").map((item) => item.id)));
        const search = await readAll({ ...ALL, q: "yaris" });
        assert.deepEqual(new Set(search), new Set(all.filter((item) => item.description.startsWith("Hızlı")).map((item) => item.id)), "accents and the dotless i are ignored");
        const byAli = await readAll({ ...ALL, creator: creatorIdOf(ALI) });
        assert.deepEqual(new Set(byAli), new Set(all.filter((item) => item.ownerEmail === ALI).map((item) => item.id)));
    });
});

test("featured games: most recently featured first", async () => {
    await withBackend(seedGames(12, (index) => (index === 2 ? { featured: true, featuredAt: "2026-10-02T00:00:00.000Z" } : index === 7 ? { featured: true, featuredAt: "2026-10-05T00:00:00.000Z" } : index === 9 ? { featured: false } : {})), {}, async () => {
        const featured = await listFeaturedArcadeGames();
        assert.deepEqual(featured.map((item) => item.id), ["game_00000007", "game_00000002"]);
        assert.equal(featured[0].featured, true);
    });
});

test("older games get a genre, a creator id and empty rating totals once, so every list finds them", async () => {
    forgetBackfills();
    const seed = seedGames(3);
    const legacy = { ownerEmail: CEM, title: "Eski oyun", dimension: "2d", plays: 4, likes: 1, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", game: "{}" };
    seed["arcade_games/game_legacy01"] = legacy;
    await withBackend(seed, {}, async (db) => {
        assert.equal((await readAll({ ...ALL, genre: "other" })).includes("game_legacy01"), false, "before: no genre, not in \"other\"");
        assert.equal(await ensureArcadeBackfill(), true);
        const upgraded = db.get("arcade_games/game_legacy01");
        assert.equal(upgraded.genre, "other");
        assert.equal(upgraded.creatorId, creatorIdOf(CEM));
        assert.deepEqual([upgraded.ratingCount, upgraded.ratingSum, upgraded.ratingScore], [0, 0, RATING_PRIOR]);
        assert.equal(upgraded.game, "{}", "the game itself is untouched");
        assert.ok((await readAll({ ...ALL, genre: "other" })).includes("game_legacy01"));
        assert.ok((await readAll({ ...ALL, sort: "rated" })).includes("game_legacy01"));
        assert.deepEqual(await readAll({ ...ALL, creator: creatorIdOf(CEM) }), ["game_legacy01"]);
        // A game that already had everything keeps its values.
        assert.equal(db.get("arcade_games/game_00000001").genre, seedGames(3)["arcade_games/game_00000001"].genre);
    });
    forgetBackfills();
});

// ---------------------------------------------------------------------------
// Creator pages
// ---------------------------------------------------------------------------

test("creator ids are stable, one-way and never the address", () => {
    const id = creatorIdOf(ALI);
    assert.match(id, /^[a-f0-9]{24}$/);
    assert.equal(isCreatorId(id), true);
    assert.equal(creatorIdOf(" ALI@example.com "), id, "the same address in any case");
    assert.notEqual(creatorIdOf(BERK), id);
    assert.equal(id.includes("ali"), false);
    assert.notEqual(id, likerHash(ALI).slice(0, 24), "a different hash from the one likes and ratings use");
    const salt = process.env.RATE_LIMIT_SALT;
    process.env.RATE_LIMIT_SALT = "another-salt";
    try {
        assert.notEqual(creatorIdOf(ALI), id, "salted: it can't be computed from an address without the server's secret");
    } finally {
        process.env.RATE_LIMIT_SALT = salt;
    }
    for (const bad of [null, "", "ABCDEF0123456789abcdef01", id.slice(1), `${id}0`, "ali@example.com"]) assert.equal(isCreatorId(bad), false, String(bad));
});

test("a creator page shows the public profile's name and picture, never the address", async () => {
    await withBackend({
        ...seedGames(4),
        [`public_profiles/${BERK}`]: { username: "berk_dev", nickname: "Berk Usta", avatarUrl: "https://cdn.example.com/berk.png", email: BERK },
    }, {}, async () => {
        const creator = await arcadeCreator(creatorIdOf(BERK));
        assert.deepEqual(creator, { id: creatorIdOf(BERK), name: "Berk Usta", avatar: "https://cdn.example.com/berk.png", games: 2 });
        const ali = await arcadeCreator(creatorIdOf(ALI));
        assert.equal(ali.name, "ali", "without a profile the published author name is used");
        assert.equal(JSON.stringify(ali).includes("@"), false);
        assert.equal(await arcadeCreator(creatorIdOf(CEM)), null, "no published games");
        assert.equal(await arcadeCreator("not-an-id"), null);
    });
});

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

test("rating totals: weighted score, average, changes", () => {
    assert.equal(isRatingStars(5), true);
    for (const bad of [0, 6, 2.5, "4", null, Number.NaN]) assert.equal(isRatingStars(bad), false, String(bad));
    assert.equal(ratingScore({ count: 0, sum: 0 }), RATING_PRIOR, "a game nobody rated sits at the neutral 3");
    assert.equal(ratingScore({ count: 1, sum: 5 }), 3.5);
    assert.ok(ratingScore({ count: 50, sum: 230 }) > ratingScore({ count: 1, sum: 5 }), "fifty 4.6 ratings beat a single 5");
    assert.ok(ratingScore({ count: 1, sum: 1 }) < RATING_PRIOR, "a single 1-star rating ranks below unrated games");
    assert.equal(ratingAverage({ count: 3, sum: 13 }), 4.3);
    assert.equal(ratingAverage({ count: 0, sum: 0 }), null);
    assert.deepEqual(applyRatingChange({ count: 2, sum: 7 }, null, 5), { count: 3, sum: 12 });
    assert.deepEqual(applyRatingChange({ count: 3, sum: 12 }, 5, 2), { count: 3, sum: 9 });
    assert.deepEqual(applyRatingChange({ count: 3, sum: 9 }, 2, null), { count: 2, sum: 7 });
    assert.deepEqual(applyRatingChange({ count: 1, sum: 4 }, 4, null), { count: 0, sum: 0 });
    assert.deepEqual(readRatingTotals({ ratingCount: 2, ratingSum: 50 }), { count: 2, sum: 10 }, "a broken sum is clamped");
    assert.deepEqual(readRatingTotals({ ratingCount: "2", ratingSum: 8 }), { count: 0, sum: 0 });
    assert.deepEqual(ratingFields({ count: 2, sum: 9 }), { ratingCount: 2, ratingSum: 9, ratingScore: 3.6 });
});

const GAME = "game_rated001";
const ratingSeed = (extra = {}) => ({ [`arcade_games/${GAME}`]: { ...game(1), ownerEmail: ALI, creatorId: creatorIdOf(ALI), ...ratingFields({ count: 0, sum: 0 }), ...extra } });

test("players rate, change and remove their rating; the game's totals follow in the same commit", async () => {
    let commits = 0;
    await withBackend(ratingSeed(), { onCommit: () => { commits += 1; } }, async (db) => {
        assert.deepEqual(await setArcadeRating({ gameId: GAME, email: BERK, stars: 4 }), { myRating: 4, ratingCount: 1, ratingAverage: 4 });
        assert.equal(commits, 1, "one commit for the rating and the totals");
        const stored = db.get(arcadeRatingPath(GAME, BERK));
        assert.deepEqual(Object.keys(stored).sort(), ["gameId", "rater", "stars", "updatedAt"]);
        assert.equal(stored.rater, likerHash(BERK));
        assert.equal(JSON.stringify(stored).includes("berk"), false, "no address in the rating");
        assert.equal(arcadeRatingPath(GAME, BERK), `arcade_ratings/${GAME}_${likerHash(BERK)}`);

        assert.deepEqual(await setArcadeRating({ gameId: GAME, email: CEM, stars: 2 }), { myRating: 2, ratingCount: 2, ratingAverage: 3 });
        assert.deepEqual(await setArcadeRating({ gameId: GAME, email: BERK, stars: 5 }), { myRating: 5, ratingCount: 2, ratingAverage: 3.5 }, "a change keeps the count");
        assert.deepEqual(await setArcadeRating({ gameId: GAME, email: BERK, stars: 5 }), { myRating: 5, ratingCount: 2, ratingAverage: 3.5 }, "the same rating again changes nothing");
        const totals = db.get(`arcade_games/${GAME}`);
        assert.deepEqual([totals.ratingCount, totals.ratingSum, totals.ratingScore], [2, 7, ratingScore({ count: 2, sum: 7 })]);
        assert.equal(await readArcadeRating(GAME, BERK), 5);

        assert.deepEqual(await setArcadeRating({ gameId: GAME, email: BERK, stars: null }), { myRating: null, ratingCount: 1, ratingAverage: 2 });
        assert.equal(db.has(arcadeRatingPath(GAME, BERK)), false);
        assert.equal(await readArcadeRating(GAME, BERK), null);
        assert.deepEqual(await setArcadeRating({ gameId: GAME, email: BERK, stars: null }), { myRating: null, ratingCount: 1, ratingAverage: 2 }, "removing twice is fine");
        assert.equal(db.get(`arcade_games/${GAME}`).title, "Oyun 1", "other fields of the game stay");
    });
});

test("owners can't rate their own game; bad stars and missing games are refused", async () => {
    await withBackend(ratingSeed(), {}, async (db) => {
        const refused = (input, code, status) => assert.rejects(setArcadeRating(input), (error) => {
            assert.equal(error.code, code);
            assert.equal(error.status, status);
            return true;
        });
        await refused({ gameId: GAME, email: ALI, stars: 5 }, "own_game", 403);
        await refused({ gameId: GAME, email: BERK, stars: 6 }, "invalid_rating", 400);
        await refused({ gameId: GAME, email: BERK, stars: 0 }, "invalid_rating", 400);
        await refused({ gameId: "game_missing01", email: BERK, stars: 3 }, "not_found", 404);
        assert.equal(db.get(`arcade_games/${GAME}`).ratingCount, 0);
        assert.equal(db.paths().some((path) => path.startsWith("arcade_ratings/")), false);
    });
});

test("ratings at the same time never lose an update", async () => {
    await withBackend(ratingSeed(), {}, async (db) => {
        const fakeFetch = globalThis.fetch;
        let interfered = false;
        // Between the read and the commit of the first rating, someone plays the game and someone else rates it.
        globalThis.fetch = async (input, init = {}) => {
            if (!interfered && String(input).endsWith(":commit") && String(init.body).includes("arcade_ratings")) {
                interfered = true;
                globalThis.fetch = fakeFetch;
                await commitServerMutations([{ type: "increment", path: `arcade_games/${GAME}`, fields: { plays: 1 } }]);
                await setArcadeRating({ gameId: GAME, email: CEM, stars: 1 });
            }
            return fakeFetch(input, init);
        };
        try {
            await setArcadeRating({ gameId: GAME, email: BERK, stars: 5 });
        } finally {
            globalThis.fetch = fakeFetch;
        }
        assert.equal(interfered, true);
        const totals = db.get(`arcade_games/${GAME}`);
        assert.deepEqual([totals.ratingCount, totals.ratingSum], [2, 6], "both ratings count");
        assert.equal(totals.plays, game(1).plays + 1, "and the play too");
    });
});

test("ratings go with their game and with the rater's account", async () => {
    forgetBackfills();
    const other = "game_other001";
    await withBackend({
        ...ratingSeed(),
        [`arcade_games/${other}`]: { ...game(2), ownerEmail: CEM, creatorId: creatorIdOf(CEM), ...ratingFields({ count: 0, sum: 0 }) },
        [`users/${BERK}`]: { email: BERK },
        [`users/${ALI}`]: { email: ALI },
    }, {}, async (db) => {
        await setArcadeRating({ gameId: GAME, email: BERK, stars: 4 });
        await setArcadeRating({ gameId: GAME, email: CEM, stars: 2 });
        await setArcadeRating({ gameId: other, email: BERK, stars: 5 });
        await setArcadeRating({ gameId: other, email: ALI, stars: 3 });

        assert.ok(deletionSteps("all").includes("arcadeRatings"));
        assert.equal(deletionSteps("content").includes("arcadeRatings"), false, "ratings aren't public content");
        const summary = await deleteAccountData(BERK, { scope: "all" });
        assert.equal(summary.deleted.arcadeRatings, 2);
        assert.equal(db.has(arcadeRatingPath(GAME, BERK)), false);
        assert.equal(db.has(arcadeRatingPath(other, BERK)), false);
        assert.deepEqual([db.get(`arcade_games/${GAME}`).ratingCount, db.get(`arcade_games/${GAME}`).ratingSum], [1, 2]);
        assert.deepEqual([db.get(`arcade_games/${other}`).ratingCount, db.get(`arcade_games/${other}`).ratingSum], [1, 3]);

        // Ali's account goes: Ali's own game takes the ratings others left on it, and Ali's rating of Cem's game is taken out.
        await deleteAccountData(ALI, { scope: "all" });
        assert.equal(db.has(`arcade_games/${GAME}`), false);
        assert.equal(db.has(arcadeRatingPath(GAME, CEM)), false);
        assert.equal(db.has(arcadeRatingPath(other, ALI)), false);
        assert.deepEqual([db.get(`arcade_games/${other}`).ratingCount, db.get(`arcade_games/${other}`).ratingScore], [0, RATING_PRIOR]);

        await setArcadeRating({ gameId: other, email: BERK, stars: 4 });
        await removeArcadeGame(other);
        assert.equal(db.paths().some((path) => path.startsWith("arcade_ratings/")), false, "unpublishing removes the game's ratings");
    });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

test("a game report joins the shared queue, one per person, and a new report reopens it", async () => {
    await withBackend({}, {}, async (db) => {
        const now = new Date("2026-10-07T10:00:00.000Z");
        const report = await fileContentReport({ kind: "arcade", targetId: GAME, email: BERK, category: "inappropriate", reason: "  Uygunsuz görseller var.  ", now });
        const id = contentReportId("arcade", GAME, BERK);
        assert.equal(report.id, id);
        assert.match(id, /^arcade_game_rated001_[a-f0-9]{40}$/);
        const stored = db.get(`media_reports/${id}`);
        assert.deepEqual({ ...stored, createdAt: undefined }, { kind: "arcade", gameId: GAME, reporterEmail: BERK, category: "inappropriate", reason: "Uygunsuz görseller var.", status: "open", createdAt: undefined });
        assert.equal("postId" in stored, false, "a game report never looks like a Media post's");

        // Staff close it; the same person reports again: it is open again without the old decision.
        db.get(`media_reports/${id}`).status = "resolved";
        db.get(`media_reports/${id}`).resolution = "resolved";
        db.get(`media_reports/${id}`).resolvedBy = "mod@example.com";
        await fileContentReport({ kind: "arcade", targetId: GAME, email: BERK, category: "made-up", reason: "Hâlâ aynı." });
        const again = db.get(`media_reports/${id}`);
        assert.equal(again.status, "open");
        assert.equal(again.category, "other", "unknown reasons count as other");
        assert.equal("resolution" in again || "resolvedBy" in again, false);
        assert.equal(db.paths().filter((path) => path.startsWith("media_reports/")).length, 1);

        assert.equal(await fileContentReport({ kind: "arcade", targetId: GAME, email: CEM, category: "spam", reason: "   " }), null, "a reason is required");
        await fileContentReport({ kind: "media", targetId: "post-1", email: CEM, category: "spam", reason: "Reklam" });
        assert.deepEqual(db.get(`media_reports/${contentReportId("media", "post-1", CEM)}`).postId, "post-1", "Media reports keep their ids and fields");
    });
});
