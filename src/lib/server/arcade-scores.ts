import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { isBetterScore, normalizeArcadeSettings, roundScore, scoreInRange } from "@/lib/game-engine/arcade";
import type { ArcadeLeaderboard, ArcadeSettings } from "@/lib/game-engine/types";
import { likerHash } from "./arcade";
import { issueArcadePlayToken, readArcadePlayToken, type ArcadePlayClaims } from "./arcade-play";
import { commitServerMutations, getServerDocument, isWriteConflict, runServerQuery } from "./firebase-rest";
import { releaseArcadeAudio } from "./game-assets";

/*
 * Leaderboards and achievements of Arcade games (V5).
 *
 * The author defines them in the game (settings.arcade); publishing copies
 * the definitions to the game's record (`arcade`), and every score and
 * unlock is checked against that copy here. Signed-in players only:
 *
 * - arcade_scores/{sha256(gameId|boardId|player)}: one best score per player
 *   and board ({ gameId, boardId, player, entryId, name, score, achievedAt }).
 *   `player` is the salted hash also used for likes; the address is never
 *   stored. `name` is the player's nickname or user name when the score was
 *   set; `entryId` is a random id the author uses to remove an entry.
 * - arcade_achievements/{sha256(gameId|player)}: { gameId, player,
 *   unlocked: { id: ISO time } }.
 *
 * A score needs a play token of the same game and player (./arcade-play),
 * the board's minimum play time since that token, and the board's bounds.
 * The game runs in the player's browser, so none of this proves a score was
 * earned: leaderboards are shown as unverified and the author (or staff) can
 * remove entries.
 */

export class ArcadeError extends Error {
    readonly status: number;
    readonly code: string;
    readonly retryAfterSeconds: number | null;
    constructor(status: number, code: string, message: string, retryAfterSeconds: number | null = null) {
        super(message);
        this.name = "ArcadeError";
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

export const ARCADE_SCORES = "arcade_scores";
export const ARCADE_ACHIEVEMENTS = "arcade_achievements";
/** Entries a leaderboard shows. */
export const ARCADE_SCORE_PAGE = 50;
/** A score may arrive this much before the minimum play time (clock differences, the request's way). */
const PLAY_TIME_TOLERANCE_MS = 1500;
/** Unlock times kept per player and game (achievements the author removed stay until then). */
const UNLOCK_LIMIT = 60;
const QUERY_LIMIT = 1000;
const COMMIT_SIZE = 400;
const MAX_PASSES = 25;
const ENTRY_ID = /^[0-9a-f]{16}$/;

type StoredScore = {
    gameId?: unknown;
    boardId?: unknown;
    player?: unknown;
    entryId?: unknown;
    name?: unknown;
    score?: unknown;
    achievedAt?: unknown;
    _path?: string;
    _updateTime?: string;
};

type StoredUnlocks = { gameId?: unknown; player?: unknown; unlocked?: unknown; _updateTime?: string };

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export function arcadeScorePath(gameId: string, boardId: string, player: string) {
    return `${ARCADE_SCORES}/${sha256(`${gameId}|${boardId}|${player}`)}`;
}

export function arcadeAchievementPath(gameId: string, player: string) {
    return `${ARCADE_ACHIEVEMENTS}/${sha256(`${gameId}|${player}`)}`;
}

/** How a player appears on leaderboards: their nickname or user name, never their address. */
export function arcadePlayerName(user: Record<string, unknown> | null | undefined) {
    for (const value of [user?.nickname, user?.username]) {
        if (typeof value === "string" && value.trim()) return value.replace(/\s+/g, " ").trim().slice(0, 40);
    }
    return "Hanogt oyuncusu";
}

const finiteScore = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export type ArcadeGameRules = { ownerEmail: string; settings: ArcadeSettings };

/** Owner and leaderboard/achievement definitions of a published game (its content isn't read). */
export async function arcadeGameRules(gameId: string): Promise<ArcadeGameRules> {
    const record = await getServerDocument<{ ownerEmail?: unknown; arcade?: unknown }>(`arcade_games/${gameId}`, { fields: ["ownerEmail", "arcade"] });
    if (!record) throw new ArcadeError(404, "not_found", "Oyun bulunamadı veya yayından kaldırıldı.");
    return { ownerEmail: typeof record.ownerEmail === "string" ? record.ownerEmail : "", settings: normalizeArcadeSettings(record.arcade) };
}

function boardOf(rules: ArcadeGameRules, boardId: unknown): ArcadeLeaderboard {
    const board = typeof boardId === "string" ? rules.settings.leaderboards.find((item) => item.id === boardId) : undefined;
    if (!board) throw new ArcadeError(404, "unknown_board", "Bu oyunda böyle bir skor tablosu yok.");
    return board;
}

function unlockedIds(stored: StoredUnlocks | null, settings: ArcadeSettings) {
    const unlocked = stored?.unlocked && typeof stored.unlocked === "object" && !Array.isArray(stored.unlocked) ? stored.unlocked as Record<string, unknown> : {};
    return settings.achievements.filter((achievement) => typeof unlocked[achievement.id] === "string").map((achievement) => achievement.id);
}

// ---------------------------------------------------------------------------
// Play sessions
// ---------------------------------------------------------------------------

export type ArcadeSession = {
    token: string;
    startedAt: number;
    /** The player's best score per board id. */
    best: Record<string, number>;
    /** Ids of the achievements the player has. */
    unlocked: string[];
};

/** What a signed-in player reached in a game: the best score per board and the unlocked achievements. */
export async function readArcadeProgress(gameId: string, email: string, rules?: ArcadeGameRules): Promise<Pick<ArcadeSession, "best" | "unlocked">> {
    const game = rules ?? await arcadeGameRules(gameId);
    const player = likerHash(email);
    const [scores, unlocks] = await Promise.all([
        Promise.all(game.settings.leaderboards.map((board) => getServerDocument<StoredScore>(arcadeScorePath(gameId, board.id, player), { fields: ["score"] }))),
        game.settings.achievements.length ? getServerDocument<StoredUnlocks>(arcadeAchievementPath(gameId, player), { fields: ["unlocked"] }) : Promise.resolve(null),
    ]);
    const best: Record<string, number> = {};
    game.settings.leaderboards.forEach((board, index) => {
        const score = finiteScore(scores[index]?.score);
        if (score !== null) best[board.id] = score;
    });
    return { best, unlocked: unlockedIds(unlocks, game.settings) };
}

/** A play token for a signed-in player, with what the player reached in this game before. */
export async function startArcadeSession(gameId: string, email: string, now = Date.now()): Promise<ArcadeSession> {
    const rules = await arcadeGameRules(gameId);
    const token = issueArcadePlayToken(gameId, likerHash(email), now);
    if (!token) throw new ArcadeError(503, "unavailable", "Skor tabloları şu an kullanılamıyor.");
    return { token, startedAt: now, ...await readArcadeProgress(gameId, email, rules) };
}

function playClaims(token: unknown, gameId: string, player: string, now: number): ArcadePlayClaims {
    const claims = readArcadePlayToken(token, now);
    if (!claims) throw new ArcadeError(401, "session_expired", "Oyun oturumu geçersiz ya da süresi dolmuş. Oyunu yeniden başlatın.");
    if (claims.gameId !== gameId || claims.player !== player) throw new ArcadeError(403, "wrong_session", "Bu oyun oturumu başka bir oyuna ya da hesaba ait.");
    return claims;
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export type SubmittedScore = { board: string; improved: boolean; best: number };

/** Keeps the score when it is the player's best on the board; the board's rules are checked first. */
export async function submitArcadeScore(input: { gameId: string; email: string; name: string; token: unknown; board: unknown; score: unknown; now?: number }): Promise<SubmittedScore> {
    const now = input.now ?? Date.now();
    const player = likerHash(input.email);
    const claims = playClaims(input.token, input.gameId, player, now);
    const board = boardOf(await arcadeGameRules(input.gameId), input.board);
    if (finiteScore(input.score) === null) throw new ArcadeError(400, "invalid_score", "Skor bir sayı olmalı.");
    const score = roundScore(input.score as number);
    if (!scoreInRange(board, score)) throw new ArcadeError(400, "out_of_range", `Skor bu tablonun sınırlarının dışında (${board.minScore} – ${board.maxScore}).`);
    const waitMs = claims.startedAt + board.minPlaySeconds * 1000 - PLAY_TIME_TOLERANCE_MS - now;
    if (waitMs > 0) throw new ArcadeError(400, "too_early", `Skor, oyun en az ${board.minPlaySeconds} saniye oynandıktan sonra sayılır.`, Math.ceil(waitMs / 1000));

    const path = arcadeScorePath(input.gameId, board.id, player);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await getServerDocument<StoredScore>(path);
        const previous = finiteScore(current?.score);
        if (previous !== null && !isBetterScore(board.order, score, previous)) return { board: board.id, improved: false, best: previous };
        const at = new Date(now).toISOString();
        const data = {
            gameId: input.gameId,
            boardId: board.id,
            player,
            entryId: typeof current?.entryId === "string" && ENTRY_ID.test(current.entryId) ? current.entryId : randomBytes(8).toString("hex"),
            name: input.name.slice(0, 40),
            score,
            achievedAt: at,
        };
        try {
            await commitServerMutations([current?._updateTime ? { type: "update", path, data, updateTime: current._updateTime } : { type: "create", path, data }]);
            return { board: board.id, improved: true, best: score };
        } catch (error) {
            // Another request of the same player wrote first: compare with that one.
            if (isWriteConflict(error) && attempt < 2) continue;
            throw error;
        }
    }
    throw new ArcadeError(409, "conflict", "Skor kaydedilemedi, tekrar deneyin.");
}

export type LeaderboardEntry = { rank: number; name: string; score: number; achievedAt: string | null; you: boolean; entryId?: string };

export type LeaderboardPage = {
    board: Pick<ArcadeLeaderboard, "id" | "name" | "order" | "format">;
    entries: LeaderboardEntry[];
    /** The requester's own entry when they have one (rank null when it is below the shown entries). */
    you: { score: number; achievedAt: string | null; rank: number | null } | null;
    /** Scores come from the game in the player's browser: never verified by the server. */
    verified: false;
};

/** Better scores first; equal scores by who reached them first. */
function compareEntries(order: ArcadeLeaderboard["order"]) {
    return (a: StoredScore, b: StoredScore) => {
        const difference = (finiteScore(a.score) ?? 0) - (finiteScore(b.score) ?? 0);
        if (difference) return order === "asc" ? difference : -difference;
        return String(a.achievedAt ?? "").localeCompare(String(b.achievedAt ?? ""));
    };
}

/**
 * The best entries of a board. `viewer` (an address) marks the requester's
 * own entry; `withEntryIds` adds the ids the author or staff remove entries with.
 */
export async function listArcadeScores(gameId: string, boardId: unknown, options: { viewer?: string | null; withEntryIds?: boolean; rules?: ArcadeGameRules } = {}): Promise<LeaderboardPage> {
    const rules = options.rules ?? await arcadeGameRules(gameId);
    const board = boardId === undefined || boardId === null || boardId === "" ? rules.settings.leaderboards[0] : boardOf(rules, boardId);
    if (!board) throw new ArcadeError(404, "unknown_board", "Bu oyunun skor tablosu yok.");
    const direction = board.order === "asc" ? "ASCENDING" : "DESCENDING";
    const stored = await runServerQuery<StoredScore>({
        collectionId: ARCADE_SCORES,
        where: [{ field: "gameId", op: "EQUAL", value: gameId }, { field: "boardId", op: "EQUAL", value: board.id }],
        orderBy: [{ field: "score", direction }, { field: "achievedAt", direction: "ASCENDING" }],
        select: ["name", "score", "achievedAt", "player", "entryId"],
        limit: ARCADE_SCORE_PAGE,
    });
    const rows = stored.filter((row) => finiteScore(row.score) !== null).sort(compareEntries(board.order)).slice(0, ARCADE_SCORE_PAGE);
    const viewer = options.viewer ? likerHash(options.viewer) : null;
    const entries: LeaderboardEntry[] = [];
    rows.forEach((row, index) => {
        // Equal scores share a rank (1, 2, 2, 4).
        const previous = entries[index - 1];
        const score = finiteScore(row.score) as number;
        const rank = previous && previous.score === score ? previous.rank : index + 1;
        entries.push({
            rank,
            name: typeof row.name === "string" && row.name ? row.name.slice(0, 40) : "Hanogt oyuncusu",
            score,
            achievedAt: typeof row.achievedAt === "string" ? row.achievedAt : null,
            you: Boolean(viewer && row.player === viewer),
            ...(options.withEntryIds && typeof row.entryId === "string" && ENTRY_ID.test(row.entryId) ? { entryId: row.entryId } : {}),
        });
    });
    let you: LeaderboardPage["you"] = null;
    const listed = entries.find((entry) => entry.you);
    if (listed) you = { score: listed.score, achievedAt: listed.achievedAt, rank: listed.rank };
    else if (viewer) {
        const own = await getServerDocument<StoredScore>(arcadeScorePath(gameId, board.id, viewer));
        const score = finiteScore(own?.score);
        if (score !== null) you = { score, achievedAt: typeof own?.achievedAt === "string" ? own.achievedAt : null, rank: null };
    }
    return { board: { id: board.id, name: board.name, order: board.order, format: board.format }, entries, you, verified: false };
}

/** Deletes documents of a query in commits of 400, repeating while it comes back full; returns how many went. */
async function deleteMatching(collectionId: string, where: NonNullable<Parameters<typeof runServerQuery>[0]["where"]>) {
    let removed = 0;
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        const batch = await runServerQuery<Record<string, unknown>>({ collectionId, where, select: [where[0].field], limit: QUERY_LIMIT });
        for (let index = 0; index < batch.length; index += COMMIT_SIZE) {
            await commitServerMutations(batch.slice(index, index + COMMIT_SIZE).map((document) => ({ type: "delete" as const, path: document._path })));
        }
        removed += batch.length;
        if (batch.length < QUERY_LIMIT) return removed;
    }
    throw new Error("Silinecek kayıt çok fazla; işlemi yeniden çalıştırın.");
}

/** Removes one entry (by its entry id) or every entry of a board; returns how many went. */
export async function removeArcadeScores(gameId: string, boardId: string, target: { entryId: string } | { all: true }) {
    if ("all" in target) return deleteMatching(ARCADE_SCORES, [{ field: "gameId", op: "EQUAL", value: gameId }, { field: "boardId", op: "EQUAL", value: boardId }]);
    if (!ENTRY_ID.test(target.entryId)) throw new ArcadeError(400, "invalid_entry", "Geçersiz kayıt.");
    const found = await runServerQuery<StoredScore>({
        collectionId: ARCADE_SCORES,
        where: [{ field: "gameId", op: "EQUAL", value: gameId }, { field: "entryId", op: "EQUAL", value: target.entryId }],
        select: ["boardId"],
        limit: 5,
    });
    const paths = found.filter((row) => row.boardId === boardId).map((row) => row._path as string);
    if (!paths.length) throw new ArcadeError(404, "entry_not_found", "Kayıt bulunamadı.");
    await commitServerMutations(paths.map((path) => ({ type: "delete" as const, path })));
    return paths.length;
}

/** A player takes their own entry off a board; 1 when there was one. */
export async function removeOwnArcadeScore(gameId: string, boardId: string, email: string) {
    const path = arcadeScorePath(gameId, boardId, likerHash(email));
    if (!(await getServerDocument(path, { fields: ["boardId"] }))) return 0;
    await commitServerMutations([{ type: "delete", path }]);
    return 1;
}

/**
 * After a republish: entries of boards that are gone, or whose order flipped
 * (the old bests would rank backwards), are removed. Best effort.
 */
export async function clearChangedBoards(gameId: string, before: unknown, after: ArcadeSettings) {
    const previous = normalizeArcadeSettings(before).leaderboards;
    const stale = previous.filter((board) => {
        const next = after.leaderboards.find((item) => item.id === board.id);
        return !next || next.order !== board.order;
    });
    for (const board of stale) await removeArcadeScores(gameId, board.id, { all: true });
    return stale.map((board) => board.id);
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export type UnlockResult = { id: string; newly: boolean; unlocked: string[] };

export async function unlockArcadeAchievement(input: { gameId: string; email: string; token: unknown; id: unknown; now?: number }): Promise<UnlockResult> {
    const now = input.now ?? Date.now();
    const player = likerHash(input.email);
    playClaims(input.token, input.gameId, player, now);
    const rules = await arcadeGameRules(input.gameId);
    const achievement = typeof input.id === "string" ? rules.settings.achievements.find((item) => item.id === input.id) : undefined;
    if (!achievement) throw new ArcadeError(404, "unknown_achievement", "Bu oyunda böyle bir başarım yok.");
    const path = arcadeAchievementPath(input.gameId, player);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await getServerDocument<StoredUnlocks>(path);
        const stored = current?.unlocked && typeof current.unlocked === "object" && !Array.isArray(current.unlocked) ? current.unlocked as Record<string, unknown> : {};
        if (typeof stored[achievement.id] === "string") return { id: achievement.id, newly: false, unlocked: unlockedIds(current, rules.settings) };
        // Unlocks of achievements the author removed go first when the record is full.
        const kept = Object.entries(stored).filter(([id, at]) => typeof at === "string" && /^[a-z0-9][a-z0-9_-]{0,31}$/.test(id))
            .sort(([a], [b]) => Number(rules.settings.achievements.some((item) => item.id === b)) - Number(rules.settings.achievements.some((item) => item.id === a)))
            .slice(0, UNLOCK_LIMIT - 1);
        const unlocked = Object.fromEntries([...kept, [achievement.id, new Date(now).toISOString()]]);
        const data = { gameId: input.gameId, player, unlocked, updatedAt: new Date(now).toISOString() };
        try {
            await commitServerMutations([current?._updateTime ? { type: "update", path, data, updateTime: current._updateTime } : { type: "create", path, data }]);
            return { id: achievement.id, newly: true, unlocked: unlockedIds({ unlocked }, rules.settings) };
        } catch (error) {
            if (isWriteConflict(error) && attempt < 2) continue;
            throw error;
        }
    }
    throw new ArcadeError(409, "conflict", "Başarım kaydedilemedi, tekrar deneyin.");
}

// ---------------------------------------------------------------------------
// Removing a game
// ---------------------------------------------------------------------------

/** Every like, score and unlock of a game. */
export async function deleteArcadeGameRecords(gameId: string) {
    let removed = 0;
    for (const collectionId of ["arcade_likes", ARCADE_SCORES, ARCADE_ACHIEVEMENTS]) {
        removed += await deleteMatching(collectionId, [{ field: "gameId", op: "EQUAL", value: gameId }]);
    }
    return removed;
}

/**
 * Takes a game off the Arcade the same way everywhere (its author, deleting
 * the project, staff): likes, scores and unlocks first, then the game with
 * `extra` writes in the same commit (an audit entry), then its own copies of
 * audio and model files. A failure before the game goes leaves it in place,
 * so the removal can simply be repeated.
 */
export async function removeArcadeGame(gameId: string, extra: Parameters<typeof commitServerMutations>[0] = []) {
    const records = await deleteArcadeGameRecords(gameId);
    await commitServerMutations([{ type: "delete", path: `arcade_games/${gameId}` }, ...extra]);
    // A like or score that raced the removal.
    await deleteArcadeGameRecords(gameId).catch(() => 0);
    await releaseArcadeAudio(gameId).catch(() => 0);
    return { records };
}
