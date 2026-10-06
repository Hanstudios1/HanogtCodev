// Run: node --test scripts/tests/
// Arcade leaderboards and achievements (Hanogt Engine V5): play tokens, the
// definitions authors write, best scores per player, the rules a score must
// pass, listing, removing entries, unlocks, and taking a game off the Arcade.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
process.env.NEXTAUTH_SECRET = "arcade-test-secret";

const play = await load("lib/server/arcade-play.ts");
const scores = await load("lib/server/arcade-scores.ts");
const { likerHash } = await load("lib/server/arcade.ts");
const { encodeAppealToken } = await load("lib/server/appeal-token.ts");
const assets = await load("lib/server/game-assets.ts");
const { ARCADE_LIMITS, cleanArcadeId, formatArcadeScore, isBetterScore, normalizeArcadeSettings, scoreInRange } = await load("lib/game-engine/arcade.ts");

const { encodeArcadePlayToken, verifyArcadePlayToken, ARCADE_PLAY_TTL_MS } = play;
const { arcadeAchievementPath, arcadePlayerName, arcadeScorePath, clearChangedBoards, listArcadeScores, removeArcadeGame, removeArcadeScores, removeOwnArcadeScore, startArcadeSession, submitArcadeScore, unlockArcadeAchievement } = scores;

const ALI = "ali@example.com";
const BERK = "berk@example.com";
const CEM = "cem@example.com";
const GAME = "game_leaderboard1";
const OTHER = "game_leaderboard2";
const T0 = Date.parse("2026-10-06T12:00:00.000Z");

const ARCADE = {
    leaderboards: [
        { id: "main", name: "Puan", order: "desc", format: "number", minScore: 0, maxScore: 1000, minPlaySeconds: 10 },
        { id: "speed", name: "En hızlı", order: "asc", format: "time", minScore: 5, maxScore: 600, minPlaySeconds: 0 },
    ],
    achievements: [
        { id: "win", name: "İlk zafer", description: "Bir bölümü bitir.", hidden: false },
        { id: "secret", name: "Gizli", description: "", hidden: true },
    ],
};

function seed(extra = {}) {
    return {
        [`arcade_games/${GAME}`]: { ownerEmail: ALI, title: "Skor oyunu", arcade: ARCADE, game: "{}" },
        [`arcade_games/${OTHER}`]: { ownerEmail: BERK, title: "Başka oyun", arcade: ARCADE, game: "{}" },
        ...extra,
    };
}

async function rejects(promise, code, status) {
    await assert.rejects(promise, (error) => {
        assert.equal(error.code, code, `expected ${code}, got ${error.code} (${error.message})`);
        if (status) assert.equal(error.status, status);
        return true;
    });
}

/** A session started at `at` and a submit helper bound to it. */
async function session(email, gameId = GAME, at = T0) {
    const started = await startArcadeSession(gameId, email, at);
    const submit = (board, score, seconds) => submitArcadeScore({ gameId, email, name: email.split("@")[0], token: started.token, board, score, now: at + seconds * 1000 });
    return { ...started, submit };
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

test("authors' definitions are cleaned: ids, names, bounds, play time and limits", () => {
    assert.equal(cleanArcadeId("Best Time!"), "best-time");
    assert.equal(cleanArcadeId("  coins_100 "), "coins_100");
    assert.equal(cleanArcadeId("-x"), null, "an id starts with a letter or digit");
    assert.equal(cleanArcadeId(""), null);
    assert.equal(cleanArcadeId(42), null);

    const settings = normalizeArcadeSettings({
        leaderboards: [
            { id: "Main", name: "  Score\u0000 board ", order: "sideways", format: "money", minScore: 50, maxScore: 10, minPlaySeconds: 99_999 },
            { id: "main", name: "Duplicate" },
            { id: "", name: "No id" },
            ...Array.from({ length: 8 }, (_, index) => ({ id: `b${index}` })),
        ],
        achievements: [{ id: "win", name: "", description: "x".repeat(500), hidden: "yes" }, { id: "__proto__" }, ...Array.from({ length: 40 }, (_, index) => ({ id: `a${index}` }))],
        extra: true,
    });
    assert.equal(settings.leaderboards.length, ARCADE_LIMITS.leaderboards);
    assert.deepEqual(settings.leaderboards[0], { id: "main", name: "Score board", order: "desc", format: "number", minScore: 10, maxScore: 50, minPlaySeconds: 3600 });
    assert.deepEqual(settings.leaderboards[1], { id: "b0", name: "b0", order: "desc", format: "number", minScore: 0, maxScore: 1_000_000, minPlaySeconds: 10 });
    assert.equal(settings.achievements.length, ARCADE_LIMITS.achievements);
    assert.deepEqual(settings.achievements[0], { id: "win", name: "win", description: "x".repeat(120), hidden: false });
    assert.equal(settings.achievements[1].id, "a0", "an id can't start with an underscore: no prototype keys");
    assert.deepEqual(Object.keys(settings), ["leaderboards", "achievements"]);
    assert.deepEqual(normalizeArcadeSettings(null), { leaderboards: [], achievements: [] });
    assert.deepEqual(normalizeArcadeSettings({ leaderboards: [{ id: "x", minScore: "abc", maxScore: 1e15 }] }).leaderboards[0].maxScore, 1_000_000_000);
});

test("better scores, bounds and how scores read", () => {
    assert.equal(isBetterScore("desc", 10, null), true);
    assert.equal(isBetterScore("desc", 10, 9), true);
    assert.equal(isBetterScore("desc", 10, 10), false, "a tie keeps the earlier score");
    assert.equal(isBetterScore("asc", 9.5, 10), true);
    assert.equal(isBetterScore("asc", 11, 10), false);
    assert.equal(scoreInRange({ minScore: 0, maxScore: 100 }, 100.0004), true, "rounded to three decimals first");
    assert.equal(scoreInRange({ minScore: 0, maxScore: 100 }, 100.01), false);
    assert.equal(scoreInRange({ minScore: 0, maxScore: 100 }, Number.NaN), false);
    assert.equal(formatArcadeScore(83.456, "time"), "1:23.46");
    assert.equal(formatArcadeScore(3725.5, "time"), "1:02:05.50");
    assert.equal(formatArcadeScore(12500, "number", "en"), "12,500");
    assert.equal(formatArcadeScore(12500, "number", "tr"), "12.500");
    assert.equal(arcadePlayerName({ nickname: "  Kuzey  Işık ", username: "kuzey" }), "Kuzey Işık");
    assert.equal(arcadePlayerName({ username: "kuzey" }), "kuzey");
    assert.equal(arcadePlayerName({ email: "secret@example.com" }), "Hanogt oyuncusu", "never the address");
});

// ---------------------------------------------------------------------------
// Play tokens
// ---------------------------------------------------------------------------

test("play tokens: signed, for one game and player, and short-lived", () => {
    const secret = "arcade-test-secret";
    const player = likerHash(BERK);
    const token = encodeArcadePlayToken({ gameId: GAME, player, startedAt: T0 }, secret);
    assert.deepEqual(verifyArcadePlayToken(token, secret, T0 + 1000), { gameId: GAME, player, startedAt: T0 });
    assert.equal(verifyArcadePlayToken(token, "another-secret", T0), null);
    assert.equal(verifyArcadePlayToken(`${token.slice(0, -2)}AA`, secret, T0), null, "a changed signature fails");
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(Buffer.from(payload, "base64url").toString().replace(GAME, OTHER)).toString("base64url");
    assert.equal(verifyArcadePlayToken(`${forged}.${signature}`, secret, T0), null, "the game can't be swapped");
    assert.equal(verifyArcadePlayToken(token, secret, T0 + ARCADE_PLAY_TTL_MS + 1), null, "expired");
    assert.equal(verifyArcadePlayToken(token, secret, T0 - 5 * 60_000), null, "started in the future");
    assert.equal(verifyArcadePlayToken(encodeAppealToken(BERK, T0 + 60_000, secret), secret, T0), null, "another token of the site never verifies here");
    assert.equal(verifyArcadePlayToken("x".repeat(500), secret, T0), null);
    assert.equal(verifyArcadePlayToken(null, secret, T0), null);
    assert.throws(() => encodeArcadePlayToken({ gameId: "bad|id", player, startedAt: T0 }, secret));
});

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

test("a player's best score is kept per board, after the minimum play time and within the bounds", async () => {
    await withBackend(seed(), {}, async (db) => {
        const berk = await session(BERK);
        assert.deepEqual([berk.best, berk.unlocked], [{}, []]);

        await assert.rejects(berk.submit("main", 500, 5), (error) => {
            assert.equal(error.code, "too_early");
            assert.equal(error.retryAfterSeconds, 4, "10 s minus 1.5 s of tolerance minus 5 s played");
            return true;
        });
        assert.deepEqual(await berk.submit("main", 500, 11), { board: "main", improved: true, best: 500 });
        const path = arcadeScorePath(GAME, "main", likerHash(BERK));
        const stored = db.get(path);
        assert.deepEqual([stored.gameId, stored.boardId, stored.player, stored.name, stored.score], [GAME, "main", likerHash(BERK), "berk", 500]);
        assert.match(stored.entryId, /^[0-9a-f]{16}$/);
        assert.ok(!JSON.stringify(stored).includes(BERK), "the address is never stored");

        assert.deepEqual(await berk.submit("main", 400, 12), { board: "main", improved: false, best: 500 });
        assert.deepEqual(await berk.submit("main", 500, 12), { board: "main", improved: false, best: 500 }, "a tie keeps the first");
        assert.deepEqual(await berk.submit("main", 700.12345, 13), { board: "main", improved: true, best: 700.123 });
        assert.equal(db.get(path).entryId, stored.entryId, "the entry keeps its id");

        await rejects(berk.submit("main", 1000.5, 14), "out_of_range", 400);
        await rejects(berk.submit("main", -1, 14), "out_of_range");
        await rejects(berk.submit("main", "900", 14), "invalid_score", 400);
        await rejects(berk.submit("main", Number.POSITIVE_INFINITY, 14), "invalid_score");
        await rejects(berk.submit("nope", 1, 14), "unknown_board", 404);

        // A time board: lower is better, no minimum play time, a lower bound against impossible times.
        assert.equal((await berk.submit("speed", 30, 0)).improved, true);
        assert.equal((await berk.submit("speed", 20.5, 1)).improved, true);
        assert.equal((await berk.submit("speed", 25, 2)).improved, false);
        await rejects(berk.submit("speed", 4.9, 3), "out_of_range");

        const again = await startArcadeSession(GAME, BERK, T0 + 60_000);
        assert.deepEqual(again.best, { main: 700.123, speed: 20.5 });
    });
});

test("scores need a token of the same game and player", async () => {
    await withBackend(seed(), {}, async () => {
        const berk = await session(BERK);
        const ali = await session(ALI);
        const other = await session(BERK, OTHER);
        const send = (token, gameId = GAME) => submitArcadeScore({ gameId, email: BERK, name: "berk", token, board: "main", score: 10, now: T0 + 20_000 });
        await rejects(send(ali.token), "wrong_session", 403);
        await rejects(send(other.token), "wrong_session", 403);
        await rejects(send("forged.token"), "session_expired", 401);
        await rejects(send(undefined), "session_expired", 401);
        await rejects(submitArcadeScore({ gameId: GAME, email: BERK, name: "berk", token: berk.token, board: "main", score: 10, now: T0 + ARCADE_PLAY_TTL_MS + 1 }), "session_expired");
        assert.equal((await send(berk.token)).improved, true);
        await rejects(startArcadeSession("game_missing1", BERK, T0), "not_found", 404);
    });
});

test("leaderboards list the best entries with shared ranks, the viewer's own entry and no addresses", async () => {
    await withBackend(seed(), {}, async () => {
        for (const [email, score, seconds] of [[BERK, 700, 20], [CEM, 900, 30], [ALI, 700, 40]]) {
            await (await session(email)).submit("main", score, seconds);
        }
        const page = await listArcadeScores(GAME, "main", { viewer: ALI });
        assert.deepEqual(page.board, { id: "main", name: "Puan", order: "desc", format: "number" });
        assert.equal(page.verified, false);
        assert.deepEqual(page.entries.map((entry) => [entry.rank, entry.name, entry.score, entry.you]), [[1, "cem", 900, false], [2, "berk", 700, false], [2, "ali", 700, true]]);
        assert.ok(page.entries.every((entry) => !("entryId" in entry)), "entry ids are for the author only");
        assert.deepEqual([page.you.rank, page.you.score], [2, 700]);
        assert.ok(!JSON.stringify(page).includes("@"), "no addresses");
        assert.ok(!JSON.stringify(page).includes(likerHash(BERK)), "no player ids");

        const moderated = await listArcadeScores(GAME, null, { withEntryIds: true });
        assert.equal(moderated.board.id, "main", "the first board when none is named");
        assert.ok(moderated.entries.every((entry) => /^[0-9a-f]{16}$/.test(entry.entryId)));
        assert.equal(moderated.you, null);

        await (await session(BERK)).submit("speed", 42, 1);
        await (await session(CEM)).submit("speed", 33.3, 1);
        assert.deepEqual((await listArcadeScores(GAME, "speed")).entries.map((entry) => entry.score), [33.3, 42], "lower times first");
        await rejects(listArcadeScores(GAME, "nope"), "unknown_board", 404);
        await rejects(listArcadeScores("game_missing1", "main"), "not_found", 404);
    });
});

test("a viewer below the shown entries still sees their score", async () => {
    const extra = {};
    for (let index = 0; index < 55; index += 1) {
        extra[`arcade_scores/seed${index}`] = { gameId: GAME, boardId: "main", player: `p${index}`, entryId: `${index}`.padStart(16, "0"), name: `p${index}`, score: 100 + index, achievedAt: "2026-10-01T00:00:00.000Z" };
    }
    await withBackend(seed(extra), {}, async () => {
        await (await session(BERK)).submit("main", 50, 20);
        const page = await listArcadeScores(GAME, "main", { viewer: BERK });
        assert.equal(page.entries.length, scores.ARCADE_SCORE_PAGE);
        assert.equal(page.entries[0].score, 154);
        assert.deepEqual(page.you, { score: 50, achievedAt: new Date(T0 + 20_000).toISOString(), rank: null });
    });
});

test("the author removes one entry or clears a board; republishing clears boards that changed", async () => {
    await withBackend(seed(), {}, async (db) => {
        for (const email of [BERK, CEM]) {
            const player = await session(email);
            await player.submit("main", email === BERK ? 100 : 200, 20);
            await player.submit("speed", 30, 1);
        }
        // A player takes their own entry off; nobody else's.
        assert.equal(await removeOwnArcadeScore(GAME, "speed", CEM), 1);
        assert.equal(await removeOwnArcadeScore(GAME, "speed", CEM), 0);
        assert.deepEqual((await listArcadeScores(GAME, "speed")).entries.map((entry) => entry.name), ["berk"]);
        await (await session(CEM)).submit("speed", 30, 1);

        const [first] = (await listArcadeScores(GAME, "main", { withEntryIds: true })).entries;
        await rejects(removeArcadeScores(GAME, "speed", { entryId: first.entryId }), "entry_not_found", 404);
        await rejects(removeArcadeScores(GAME, "main", { entryId: "not-an-id" }), "invalid_entry", 400);
        assert.equal(await removeArcadeScores(GAME, "main", { entryId: first.entryId }), 1);
        assert.deepEqual((await listArcadeScores(GAME, "main")).entries.map((entry) => entry.name), ["berk"]);
        assert.equal(await removeArcadeScores(GAME, "main", { all: true }), 1);
        assert.deepEqual((await listArcadeScores(GAME, "main")).entries, []);
        assert.equal((await listArcadeScores(GAME, "speed")).entries.length, 2, "other boards stay");

        // Republished: "speed" now ranks the other way, "main" stays the same.
        await (await session(BERK)).submit("main", 300, 20);
        const after = normalizeArcadeSettings({ leaderboards: [ARCADE.leaderboards[0], { ...ARCADE.leaderboards[1], order: "desc" }] });
        assert.deepEqual(await clearChangedBoards(GAME, ARCADE, after), ["speed"]);
        assert.equal((await listArcadeScores(GAME, "main")).entries.length, 1);
        assert.ok(!db.paths().some((path) => path.startsWith("arcade_scores/") && db.get(path).boardId === "speed"));
        // A board that's gone loses its entries too.
        assert.deepEqual(await clearChangedBoards(GAME, ARCADE, normalizeArcadeSettings({ leaderboards: [] })), ["main", "speed"]);
        assert.ok(!db.paths().some((path) => path.startsWith("arcade_scores/")));
    });
});

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

test("achievements unlock once per player and come back with the next session", async () => {
    await withBackend(seed(), {}, async (db) => {
        const berk = await session(BERK);
        const unlock = (id, token = berk.token) => unlockArcadeAchievement({ gameId: GAME, email: BERK, token, id, now: T0 + 1000 });
        assert.deepEqual(await unlock("win"), { id: "win", newly: true, unlocked: ["win"] });
        assert.deepEqual(await unlock("win"), { id: "win", newly: false, unlocked: ["win"] });
        assert.deepEqual((await unlock("secret")).unlocked, ["win", "secret"]);
        await rejects(unlock("nope"), "unknown_achievement", 404);
        await rejects(unlock("win", (await session(ALI)).token), "wrong_session", 403);
        const stored = db.get(arcadeAchievementPath(GAME, likerHash(BERK)));
        assert.deepEqual(Object.keys(stored.unlocked).sort(), ["secret", "win"]);
        assert.ok(!JSON.stringify(stored).includes(BERK));
        assert.deepEqual((await startArcadeSession(GAME, BERK, T0 + 5000)).unlocked, ["win", "secret"]);
        assert.deepEqual((await startArcadeSession(GAME, CEM, T0 + 5000)).unlocked, []);
    });
});

// ---------------------------------------------------------------------------
// Taking a game off the Arcade
// ---------------------------------------------------------------------------

test("removing a game takes its likes, scores, unlocks and own files with it, and nothing else", async () => {
    await withBackend(seed({
        [`users/${ALI}`]: { email: ALI },
        "arcade_likes/l1": { gameId: GAME, liker: likerHash(BERK) },
        "arcade_likes/l2": { gameId: OTHER, liker: likerHash(ALI) },
    }), {}, async (db) => {
        const file = new Uint8Array(2_000);
        file.set(Buffer.from("RIFF"), 0);
        file.set(Buffer.from("WAVEfmt "), 8);
        for (let index = 44; index < file.length; index += 1) file[index] = index % 251;
        const sound = await assets.uploadGameAudio(ALI, file, "jump");
        await assets.syncArcadeAudio(GAME, [sound.hash]);
        await assets.releaseGameAudio(ALI, sound.hash);
        assert.ok(db.get(`game_assets/${sound.hash}`), "the published game keeps its own copy");

        for (const gameId of [GAME, OTHER]) {
            const berk = await session(BERK, gameId);
            await berk.submit("main", 100, 20);
            await unlockArcadeAchievement({ gameId, email: BERK, token: berk.token, id: "win", now: T0 + 1000 });
        }
        await removeArcadeGame(GAME, [{ type: "create", path: "admin_audit_log/a1", data: { action: "arcade.unpublish" } }]);

        assert.equal(db.has(`arcade_games/${GAME}`), false);
        assert.ok(db.has("admin_audit_log/a1"), "extra writes go with the game");
        const left = db.paths().filter((path) => /^arcade_(likes|scores|achievements)\//.test(path)).map((path) => db.get(path).gameId);
        assert.deepEqual([...new Set(left)], [OTHER], "the other game keeps its records");
        assert.equal(left.length, 3);
        assert.equal(db.get(`game_assets/${sound.hash}`), null, "nobody keeps the file any more");
        assert.ok(db.has(`arcade_games/${OTHER}`));
    });
});
