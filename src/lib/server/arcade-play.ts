import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Play tokens of the Arcade (V5 leaderboards and achievements).
 *
 * When a signed-in player starts a game, /api/arcade/[gameId]/session hands
 * out a token that says who started which game when. Scores and unlocks are
 * only accepted with a token of the same game and player, and a score only
 * once the board's minimum play time has passed since that start. The game
 * itself runs in the player's browser, so this can't prove a score was
 * earned (leaderboards say "unverified"), but it keeps scripts from posting
 * scores for games that were never played.
 *
 * Format: base64url("arcade-play|<gameId>|<player>|<startedAt ms>") + "." +
 * base64url(HMAC-SHA256(key, the same text)), where key is
 * HMAC(secret, "hanogt-arcade-play-v1") (see ./appeal-token for the same
 * pattern: a key of its own, so no other token of the site verifies here).
 * Encode/verify are pure for the plain-Node tests; issue/read use the
 * environment.
 */

export const ARCADE_PLAY_TTL_MS = 6 * 60 * 60_000;
export const ARCADE_PLAY_TOKEN_MAX_LENGTH = 400;

const PURPOSE = "arcade-play";
const CLOCK_SKEW_MS = 60_000;
const TOKEN_SHAPE = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/;
const GAME_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/;
/** likerHash of the player's address (32 hex characters). */
const PLAYER = /^[0-9a-f]{32}$/;

export type ArcadePlayClaims = { gameId: string; player: string; startedAt: number };

type Secret = string | Buffer;

function key(secret: Secret) {
    return createHmac("sha256", secret).update(`hanogt-${PURPOSE}-v1`).digest();
}

function signature(secret: Secret, claims: string) {
    return createHmac("sha256", key(secret)).update(claims, "utf8").digest("base64url");
}

export function encodeArcadePlayToken(claims: ArcadePlayClaims, secret: Secret): string {
    if (!GAME_ID.test(claims.gameId) || !PLAYER.test(claims.player) || !Number.isSafeInteger(claims.startedAt) || claims.startedAt < 0) {
        throw new Error("Geçersiz oyun jetonu bilgisi.");
    }
    const text = `${PURPOSE}|${claims.gameId}|${claims.player}|${claims.startedAt}`;
    return `${Buffer.from(text, "utf8").toString("base64url")}.${signature(secret, text)}`;
}

/** The claims of an authentic, well-formed token that hasn't expired at `now`; null otherwise. */
export function verifyArcadePlayToken(token: unknown, secret: Secret, now = Date.now()): ArcadePlayClaims | null {
    if (typeof token !== "string" || token.length > ARCADE_PLAY_TOKEN_MAX_LENGTH) return null;
    const match = TOKEN_SHAPE.exec(token);
    if (!match) return null;
    const [, payload, given] = match;
    const text = Buffer.from(payload, "base64url").toString("utf8");
    if (Buffer.from(text, "utf8").toString("base64url") !== payload) return null;
    if (!timingSafeEqual(Buffer.from(signature(secret, text)), Buffer.from(given))) return null;
    const parts = text.split("|");
    if (parts.length !== 4) return null;
    const [purpose, gameId, player, started] = parts;
    if (purpose !== PURPOSE || !GAME_ID.test(gameId) || !PLAYER.test(player) || !/^\d{1,15}$/.test(started)) return null;
    const startedAt = Number(started);
    // Issued in the future (beyond clock differences) or too long ago.
    if (startedAt - now > CLOCK_SKEW_MS || now - startedAt > ARCADE_PLAY_TTL_MS) return null;
    return { gameId, player, startedAt };
}

function secretFromEnvironment() {
    return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || null;
}

/** Null when no auth secret is configured. */
export function issueArcadePlayToken(gameId: string, player: string, now = Date.now()): string | null {
    const secret = secretFromEnvironment();
    return secret ? encodeArcadePlayToken({ gameId, player, startedAt: now }, secret) : null;
}

export function readArcadePlayToken(token: unknown, now = Date.now()): ArcadePlayClaims | null {
    const secret = secretFromEnvironment();
    return secret ? verifyArcadePlayToken(token, secret, now) : null;
}
