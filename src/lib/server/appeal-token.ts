import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "./validate";

/**
 * Appeal tokens for suspended accounts.
 *
 * A suspended account can't sign in, so it can't open a support ticket either.
 * Once someone has proven they own the account (password and second factor,
 * or Google), sign-in fails with a short-lived token instead, and that token
 * lets /api/support/appeal file an appeal for exactly that address. Before the
 * proof, a suspended account answers like any other, so the token is also the
 * only place where "this account is suspended" is ever revealed.
 *
 * Format: base64url("<email>|<expiresAt ms>") + "." + base64url(HMAC-SHA256(key, "<email>|<expiresAt ms>")).
 * Plain ASCII and URL-safe, because sign-in error codes end up in redirect
 * URLs and headers (see the top of src/lib/auth.ts). The key is
 * HMAC(secret, "hanogt-appeal-v1"), so these signatures can't be swapped with
 * any other HMAC made from the same secret.
 *
 * The encode/verify functions are pure (the key is passed in) so the plain-Node
 * tests in scripts/tests can exercise them; issue/read use the environment.
 */

export const APPEAL_TOKEN_TTL_MS = 30 * 60_000;
/** Generous upper bound: a 254-character address, "|", a timestamp, the dot and the signature. */
export const APPEAL_TOKEN_MAX_LENGTH = 512;

const KEY_LABEL = "hanogt-appeal-v1";
/** Clock difference tolerated between the instance that issues a token and the one that checks it. */
const CLOCK_SKEW_MS = 60_000;
/** Payload and a 32-byte signature (43 base64url characters); "." can't occur in base64url. */
const TOKEN_SHAPE = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/;

export type AppealTokenClaims = { email: string; expiresAt: number };

/** Signing key for appeal tokens: HMAC-SHA256(secret, "hanogt-appeal-v1"). */
export function deriveAppealKey(secret: string): Buffer {
    return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function signature(key: Buffer, claims: string) {
    return createHmac("sha256", key).update(claims, "utf8").digest("base64url");
}

/** A token for `email` (already normalised) that expires at `expiresAt` (epoch milliseconds). */
export function encodeAppealToken(email: string, expiresAt: number, key: Buffer): string {
    const claims = `${email}|${expiresAt}`;
    return `${Buffer.from(claims, "utf8").toString("base64url")}.${signature(key, claims)}`;
}

/** The claims when `token` is authentic, well-formed and unexpired at `now`; null otherwise. */
export function verifyAppealToken(token: unknown, key: Buffer, now = Date.now()): AppealTokenClaims | null {
    if (typeof token !== "string" || token.length > APPEAL_TOKEN_MAX_LENGTH) return null;
    const match = TOKEN_SHAPE.exec(token);
    if (!match) return null;
    const [, payload, given] = match;
    const claims = Buffer.from(payload, "base64url").toString("utf8");
    // Only the canonical encoding is accepted (no padding variants, stray bits or invalid UTF-8).
    if (Buffer.from(claims, "utf8").toString("base64url") !== payload) return null;
    // Both sides are 43 ASCII characters (see TOKEN_SHAPE), so the comparison is constant-time.
    if (!timingSafeEqual(Buffer.from(signature(key, claims)), Buffer.from(given))) return null;

    const separator = claims.lastIndexOf("|");
    if (separator <= 0) return null;
    const email = claims.slice(0, separator);
    const expiry = claims.slice(separator + 1);
    if (!/^\d{1,15}$/.test(expiry)) return null;
    const expiresAt = Number(expiry);
    // Expired, or valid for longer than any token this module issues.
    if (expiresAt <= now || expiresAt - now > APPEAL_TOKEN_TTL_MS + CLOCK_SKEW_MS) return null;
    // The address becomes a document id; it must be exactly what normalizeEmail accepts.
    if (normalizeEmail(email) !== email) return null;
    return { email, expiresAt };
}

function keyFromEnvironment() {
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    return secret ? deriveAppealKey(secret) : null;
}

/**
 * Token for someone who has just proven they own the suspended account
 * `email`. Null when no auth secret is configured or the address can't be a
 * document id; the caller then reports the suspension without a token.
 */
export function issueAppealToken(email: string, now = Date.now()): string | null {
    const key = keyFromEnvironment();
    if (!key || normalizeEmail(email) !== email) return null;
    return encodeAppealToken(email, now + APPEAL_TOKEN_TTL_MS, key);
}

/** Claims of a token sent back by the login page; null when it is forged, malformed or expired. */
export function readAppealToken(token: unknown, now = Date.now()): AppealTokenClaims | null {
    const key = keyFromEnvironment();
    return key ? verifyAppealToken(token, key, now) : null;
}
