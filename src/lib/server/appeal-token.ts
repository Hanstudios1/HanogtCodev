import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "./validate";

/**
 * Short-lived signed tokens that sign-in hands to someone who can't finish
 * signing in, so they can still reach the team from /login:
 *
 * - "appeal": a suspended account appeals (/api/support/appeal). Issued only
 *   after the password and second factor (or Google) proved ownership; before
 *   that a suspended account answers like any other, so this token is also
 *   the only place where "this account is suspended" is ever revealed.
 * - "2fa-recovery": the password was right, but the authenticator and the
 *   recovery codes are both lost; the person asks the team to reset two-step
 *   verification (/api/support/two-factor-recovery).
 * - "password-recovery": Google confirmed the address, but the password the
 *   account also has (asked for at /login/verify) is forgotten; the person
 *   asks the team to remove it (/api/support/password-recovery).
 *
 * Format: base64url("<purpose>|<email>|<expiresAt ms>") + "." + base64url(HMAC-SHA256(key, the same text)).
 * Plain ASCII and URL-safe, because sign-in error codes end up in redirect
 * URLs and headers (see the top of src/lib/auth.ts).
 *
 * Purposes are kept apart twice: every purpose signs with its own key,
 * HMAC(secret, "hanogt-<purpose>-v1"), which the functions below derive from
 * the secret themselves (a caller can't pair a purpose with another purpose's
 * key), and the purpose is part of the signed text. So a token of one purpose
 * never verifies as another, and none can be swapped with any other HMAC made
 * from the same secret.
 *
 * The encode/verify functions are pure (the secret is passed in) so the
 * plain-Node tests in scripts/tests can exercise them; issue/read use the
 * environment.
 */

export const SIGN_IN_TOKEN_PURPOSES = ["appeal", "2fa-recovery", "password-recovery"] as const;
export type SignInTokenPurpose = (typeof SIGN_IN_TOKEN_PURPOSES)[number];

export const SIGN_IN_TOKEN_TTL_MS = 30 * 60_000;
/** Generous upper bound: the purpose, a 254-character address, a timestamp, the separators, the dot and the signature. */
export const SIGN_IN_TOKEN_MAX_LENGTH = 512;
export const APPEAL_TOKEN_TTL_MS = SIGN_IN_TOKEN_TTL_MS;
export const APPEAL_TOKEN_MAX_LENGTH = SIGN_IN_TOKEN_MAX_LENGTH;

/** Clock difference tolerated between the instance that issues a token and the one that checks it. */
const CLOCK_SKEW_MS = 60_000;
/** Payload and a 32-byte signature (43 base64url characters); "." can't occur in base64url. */
const TOKEN_SHAPE = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/;

export type SignInTokenClaims = { email: string; expiresAt: number };
export type AppealTokenClaims = SignInTokenClaims;

type Secret = string | Buffer;

function isPurpose(value: unknown): value is SignInTokenPurpose {
    return typeof value === "string" && (SIGN_IN_TOKEN_PURPOSES as readonly string[]).includes(value);
}

/** An address exactly as normalizeEmail accepts it (it becomes a document id). */
function isTokenEmail(email: string) {
    return Boolean(email) && normalizeEmail(email) === email;
}

/** Signing key of one purpose: HMAC-SHA256(secret, "hanogt-<purpose>-v1"). */
export function deriveSignInTokenKey(secret: Secret, purpose: SignInTokenPurpose): Buffer {
    if (!isPurpose(purpose)) throw new Error(`Unknown sign-in token purpose: ${String(purpose)}`);
    return createHmac("sha256", secret).update(`hanogt-${purpose}-v1`).digest();
}

function signature(key: Buffer, claims: string) {
    return createHmac("sha256", key).update(claims, "utf8").digest("base64url");
}

/** A `purpose` token for `email` (already normalised) that expires at `expiresAt` (epoch milliseconds). */
export function encodeSignInToken(purpose: SignInTokenPurpose, email: string, expiresAt: number, secret: Secret): string {
    const key = deriveSignInTokenKey(secret, purpose);
    const claims = `${purpose}|${email}|${expiresAt}`;
    return `${Buffer.from(claims, "utf8").toString("base64url")}.${signature(key, claims)}`;
}

/** The claims when `token` is an authentic, well-formed, unexpired `purpose` token at `now`; null otherwise. */
export function verifySignInToken(token: unknown, purpose: SignInTokenPurpose, secret: Secret, now = Date.now()): SignInTokenClaims | null {
    if (!isPurpose(purpose) || typeof token !== "string" || token.length > SIGN_IN_TOKEN_MAX_LENGTH) return null;
    const match = TOKEN_SHAPE.exec(token);
    if (!match) return null;
    const [, payload, given] = match;
    const claims = Buffer.from(payload, "base64url").toString("utf8");
    // Only the canonical encoding is accepted (no padding variants, stray bits or invalid UTF-8).
    if (Buffer.from(claims, "utf8").toString("base64url") !== payload) return null;
    // Both sides are 43 ASCII characters (see TOKEN_SHAPE), so the comparison is constant-time.
    if (!timingSafeEqual(Buffer.from(signature(deriveSignInTokenKey(secret, purpose), claims)), Buffer.from(given))) return null;

    // Addresses can't contain "|" (see normalizeEmail), so there are exactly three parts.
    const parts = claims.split("|");
    if (parts.length !== 3) return null;
    const [claimedPurpose, email, expiry] = parts;
    if (claimedPurpose !== purpose || !/^\d{1,15}$/.test(expiry) || !isTokenEmail(email)) return null;
    const expiresAt = Number(expiry);
    // Expired, or valid for longer than any token this module issues.
    if (expiresAt <= now || expiresAt - now > SIGN_IN_TOKEN_TTL_MS + CLOCK_SKEW_MS) return null;
    return { email, expiresAt };
}

/** Appeal tokens (see above): the same functions with the purpose fixed. */
export function encodeAppealToken(email: string, expiresAt: number, secret: Secret): string {
    return encodeSignInToken("appeal", email, expiresAt, secret);
}

export function verifyAppealToken(token: unknown, secret: Secret, now = Date.now()): AppealTokenClaims | null {
    return verifySignInToken(token, "appeal", secret, now);
}

function secretFromEnvironment() {
    return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || null;
}

/**
 * Token for someone who has just proven what `purpose` requires for the
 * account `email`. Null when no auth secret is configured or the address
 * can't be a document id.
 */
export function issueSignInToken(purpose: SignInTokenPurpose, email: string, now = Date.now()): string | null {
    const secret = secretFromEnvironment();
    if (!secret || !isTokenEmail(email)) return null;
    return encodeSignInToken(purpose, email, now + SIGN_IN_TOKEN_TTL_MS, secret);
}

/** Claims of a `purpose` token sent back by the login page; null when it is forged, malformed, expired or of another purpose. */
export function readSignInToken(token: unknown, purpose: SignInTokenPurpose, now = Date.now()): SignInTokenClaims | null {
    const secret = secretFromEnvironment();
    return secret ? verifySignInToken(token, purpose, secret, now) : null;
}

/** For a suspended account whose owner passed every sign-in check; the caller reports the suspension without a token when null. */
export function issueAppealToken(email: string, now = Date.now()): string | null {
    return issueSignInToken("appeal", email, now);
}

export function readAppealToken(token: unknown, now = Date.now()): AppealTokenClaims | null {
    return readSignInToken(token, "appeal", now);
}

/** For an account whose password was right but whose second factor can't be completed. */
export function issueTwoFactorRecoveryToken(email: string, now = Date.now()): string | null {
    return issueSignInToken("2fa-recovery", email, now);
}

export function readTwoFactorRecoveryToken(token: unknown, now = Date.now()): SignInTokenClaims | null {
    return readSignInToken(token, "2fa-recovery", now);
}

/** For someone signed in with Google who can't give the account's password at /login/verify. */
export function issuePasswordRecoveryToken(email: string, now = Date.now()): string | null {
    return issueSignInToken("password-recovery", email, now);
}

export function readPasswordRecoveryToken(token: unknown, now = Date.now()): SignInTokenClaims | null {
    return readSignInToken(token, "password-recovery", now);
}
