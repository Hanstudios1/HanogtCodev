import "server-only";

import { applyRatingChange, isRatingStars, ratingAverage, ratingFields, readRatingTotals, type RatingStars } from "@/lib/arcade-ratings";
import { likerHash, type ArcadeRecord } from "./arcade";
import { ArcadeError } from "./arcade-scores";
import { commitServerMutations, getServerDocument, isWriteConflict, type ServerMutation } from "./firebase-rest";

/*
 * Arcade star ratings. One small document per player and game,
 * arcade_ratings/{gameId}_{likerHash(email)} = { gameId, rater, stars,
 * updatedAt } (`rater` is the salted hash also used for likes, never the
 * address), and the game's totals (ratingCount, ratingSum, ratingScore)
 * change in the same commit. Both writes are checked against the versions
 * that were read, so two players rating at once never lose an update (the
 * loser reads again). Only the server writes them (firestore.rules); they go
 * with the game, and with the account (account-deletion.ts), and are part of
 * the data export.
 */

export const ARCADE_RATINGS = "arcade_ratings";
const ATTEMPTS = 5;

type StoredRating = { gameId?: unknown; rater?: unknown; stars?: unknown; updatedAt?: unknown };

export type ArcadeRatingState = { myRating: RatingStars | null; ratingCount: number; ratingAverage: number | null };

export function arcadeRatingPath(gameId: string, email: string) {
    return `${ARCADE_RATINGS}/${gameId}_${likerHash(email)}`;
}

/** The player's rating of a game, or null. */
export async function readArcadeRating(gameId: string, email: string): Promise<RatingStars | null> {
    const record = await getServerDocument<StoredRating>(arcadeRatingPath(gameId, email), { fields: ["stars"] });
    return record && isRatingStars(record.stars) ? record.stars : null;
}

/**
 * Sets (1–5), changes or, with null, removes a player's rating. The game's
 * author can't rate it; a game that is gone can't be rated.
 */
export async function setArcadeRating(input: { gameId: string; email: string; stars: RatingStars | null; now?: Date }): Promise<ArcadeRatingState> {
    if (input.stars !== null && !isRatingStars(input.stars)) throw new ArcadeError(400, "invalid_rating", "Puan 1 ile 5 arasında bir tam sayı olmalı.");
    const ratingPath = arcadeRatingPath(input.gameId, input.email);
    const gamePath = `arcade_games/${input.gameId}`;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        const [game, current] = await Promise.all([
            getServerDocument<ArcadeRecord>(gamePath, { fields: ["ownerEmail", "ratingCount", "ratingSum"] }),
            getServerDocument<StoredRating>(ratingPath),
        ]);
        if (!game) throw new ArcadeError(404, "not_found", "Oyun bulunamadı veya yayından kaldırıldı.");
        if (game.ownerEmail === input.email) throw new ArcadeError(403, "own_game", "Kendi oyununuzu puanlayamazsınız.");
        const previous = current && isRatingStars(current.stars) ? current.stars : null;
        const totals = readRatingTotals(game);
        if (previous === input.stars && (current !== null) === (input.stars !== null)) {
            return { myRating: previous, ratingCount: totals.count, ratingAverage: ratingAverage(totals) };
        }
        const next = applyRatingChange(totals, previous, input.stars);
        const mutations: ServerMutation[] = [];
        if (input.stars !== null) {
            const data = { gameId: input.gameId, rater: likerHash(input.email), stars: input.stars, updatedAt: (input.now ?? new Date()).toISOString() };
            mutations.push(current ? { type: "update", path: ratingPath, data, ...(current._updateTime ? { updateTime: current._updateTime } : {}) } : { type: "create", path: ratingPath, data });
        } else if (current) {
            mutations.push({ type: "delete", path: ratingPath, ...(current._updateTime ? { updateTime: current._updateTime } : {}) });
        }
        mutations.push({ type: "update", path: gamePath, data: ratingFields(next), ...(game._updateTime ? { updateTime: game._updateTime } : {}) });
        try {
            await commitServerMutations(mutations);
            return { myRating: input.stars, ratingCount: next.count, ratingAverage: ratingAverage(next) };
        } catch (error) {
            // Someone else rated (or the game was played) in between: read both again.
            if (isWriteConflict(error) && attempt < ATTEMPTS - 1) continue;
            throw error;
        }
    }
    throw new ArcadeError(409, "conflict", "Puan kaydedilemedi, tekrar deneyin.");
}

/**
 * Removes a stored rating and takes it out of its game's totals (deleting
 * an account). A rating whose game is gone is simply deleted.
 */
export async function removeArcadeRatingRecord(record: { _path: string; _updateTime?: string; gameId?: unknown; stars?: unknown }) {
    const gameId = typeof record.gameId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(record.gameId) ? record.gameId : null;
    let current: typeof record | null = record;
    for (let attempt = 0; current && attempt < ATTEMPTS; attempt += 1) {
        const game = gameId ? await getServerDocument<ArcadeRecord>(`arcade_games/${gameId}`, { fields: ["ratingCount", "ratingSum"] }) : null;
        const stars = isRatingStars(current.stars) ? current.stars : null;
        const mutations: ServerMutation[] = [{ type: "delete", path: current._path, ...(current._updateTime ? { updateTime: current._updateTime } : {}) }];
        if (game && gameId && stars) {
            mutations.push({ type: "update", path: `arcade_games/${gameId}`, data: ratingFields(applyRatingChange(readRatingTotals(game), stars, null)), ...(game._updateTime ? { updateTime: game._updateTime } : {}) });
        }
        try {
            await commitServerMutations(mutations);
            return true;
        } catch (error) {
            if (!isWriteConflict(error) || attempt >= ATTEMPTS - 1) throw error;
        }
        const fresh: StoredRating & { _updateTime?: string } | null = await getServerDocument<StoredRating>(record._path);
        current = fresh ? { ...fresh, _path: record._path } : null;
    }
    return false;
}

export function ratingStateOf(record: ArcadeRecord, myRating: RatingStars | null): ArcadeRatingState {
    const totals = readRatingTotals(record);
    return { myRating, ratingCount: totals.count, ratingAverage: ratingAverage(totals) };
}
