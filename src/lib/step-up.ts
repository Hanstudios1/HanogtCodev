/**
 * The second check after a Google sign-in. Google proves the address, not the
 * account: when the account also has a password (added later in Account
 * Settings), the new session stays "pending" until that password, and the
 * second factor when two-step verification is on, is entered at
 * /login/verify. Every new Google sign-in asks again; a password sign-in has
 * proved both already. While a step-up is pending, the server treats the
 * session as signed out (src/lib/server/active-session.ts) and the browser
 * keeps it on /login/verify (src/components/Provider.tsx).
 *
 * The session token (src/lib/auth.ts) carries these fields:
 *   sv          token version; tokens from before it are upgraded once
 *   authTime    when the person last proved who they are (ms)
 *   provider    "google" or "credentials"
 *   authVersion users/{email}.authVersion at sign-in ("sign out everywhere" raises it)
 *   stepUp      { needs, since } while the second check is pending
 *
 * Client-safe and dependency-free so the plain-Node tests can drive it.
 */

export type StepUpNeed = "password" | "totp";

/** How long a pending step-up lasts; after that the sign-in starts over. */
export const STEP_UP_TTL_MS = 15 * 60_000;
/** Where a pending session finishes signing in. */
export const STEP_UP_PATH = "/login/verify";
/** Version of the session token's fields. */
export const SESSION_TOKEN_VERSION = 2;
/** How long a sign-in (or a step-up) counts as recent for sensitive changes. */
export const RECENT_AUTH_MS = 30 * 60_000;

/** As the session token stores it. */
export type StepUpClaim = { needs: StepUpNeed[]; since: number };
/** As the session, and so the browser, sees it. */
export type SessionStepUp = { needs: StepUpNeed[]; expiresAt: number };

/** What sign-in knows about an account's credentials. */
export type CredentialFacts = {
    /** A password hash, or a password from the old plaintext implementation that hasn't been migrated yet. */
    hasPassword: boolean;
    /** Two-step verification is on. */
    twoFactor: boolean;
    /** users/{email}.authVersion (0 when never raised). */
    authVersion: number;
};

const isNeed = (value: unknown): value is StepUpNeed => value === "password" || value === "totp";

/** A stored claim, checked; null when missing or malformed. */
export function readStepUpClaim(value: unknown): StepUpClaim | null {
    if (!value || typeof value !== "object") return null;
    const record = value as { needs?: unknown; since?: unknown };
    if (!Array.isArray(record.needs) || typeof record.since !== "number" || !Number.isFinite(record.since)) return null;
    const needs = [...new Set(record.needs.filter(isNeed))];
    if (!needs.includes("password")) return null;
    return { needs: needs.sort((a, b) => (a === "password" ? -1 : b === "password" ? 1 : 0)), since: record.since };
}

/**
 * The check a fresh sign-in still needs: none after a password sign-in (it
 * proved the password and the second factor), the password (and the second
 * factor) after Google when the account has a password.
 */
export function stepUpForSignIn(provider: string | undefined, facts: Pick<CredentialFacts, "hasPassword" | "twoFactor">, now: number): StepUpClaim | null {
    if (provider === "credentials" || !facts.hasPassword) return null;
    return { needs: facts.twoFactor ? ["password", "totp"] : ["password"], since: now };
}

/** The claim as the session shows it. */
export function sessionStepUpOf(claim: StepUpClaim): SessionStepUp {
    return { needs: claim.needs, expiresAt: claim.since + STEP_UP_TTL_MS };
}

/** A session's pending step-up (as GET /api/auth/session returns it), checked; null when there is none. */
export function readSessionStepUp(session: unknown): SessionStepUp | null {
    const value = session && typeof session === "object" ? (session as { stepUp?: unknown }).stepUp : null;
    if (!value || typeof value !== "object") return null;
    const record = value as { needs?: unknown; expiresAt?: unknown };
    if (!Array.isArray(record.needs) || typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) return null;
    const needs = record.needs.filter(isNeed);
    return needs.includes("password") ? { needs, expiresAt: record.expiresAt } : null;
}

export function stepUpExpired(stepUp: { expiresAt: number }, now = Date.now()) {
    return now >= stepUp.expiresAt;
}

/** The session's sign-in is recent enough for a sensitive change (first password, deleting the account). */
export function isRecentAuth(authTime: unknown, now = Date.now()) {
    return typeof authTime === "number" && Number.isFinite(authTime) && authTime <= now + 60_000 && now - authTime < RECENT_AUTH_MS;
}

/** The session was issued before "sign out everywhere" (or a password change) raised the account's version. */
export function isStaleAuthVersion(stored: unknown, sessionVersion: unknown) {
    const current = typeof stored === "number" && Number.isFinite(stored) ? stored : 0;
    const session = typeof sessionVersion === "number" && Number.isFinite(sessionVersion) ? sessionVersion : 0;
    return current > session;
}
