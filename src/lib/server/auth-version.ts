import "server-only";

import { commitServerMutations, deleteFirebaseAuthUser, getServerDocument } from "./firebase-rest";

/**
 * users/{email}.authVersion, which "sign out everywhere" and a password
 * change raise: a session issued at a lower version is signed out
 * (src/lib/step-up.ts). The server refuses such a session on every request
 * (src/lib/server/active-session.ts, uncached); the browser learns it from
 * /api/auth/session through the jwt callback (src/lib/auth.ts), which reads
 * the version through a short per-instance cache.
 */

const CACHE_TTL_MS = 60_000;
const CACHE_LIMIT = 5_000;
const cache = new Map<string, { version: number; at: number }>();

/** A stored version; 0 when never raised. */
export function authVersionOf(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function remember(email: string, version: number) {
    cache.delete(email);
    if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(email, { version, at: Date.now() });
}

/**
 * The account's version as of up to a minute ago: enough to tell a browser
 * it was signed out, never for letting a request in. Null when it can't be
 * read (no database, a missing account), so nothing is decided on a guess.
 */
export async function cachedAuthVersion(email: string): Promise<number | null> {
    const hit = cache.get(email);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.version;
    try {
        const user = await getServerDocument<{ authVersion?: unknown }>(`users/${email}`);
        if (!user) return null;
        const version = authVersionOf(user.authVersion);
        remember(email, version);
        return version;
    } catch {
        return null;
    }
}

/** Raises the account's version, which signs every session issued before it out, and returns the new one. */
export async function raiseAuthVersion(email: string): Promise<number> {
    const result = await commitServerMutations([{ type: "increment", path: `users/${email}`, fields: { authVersion: 1 }, mustExist: true }]);
    const raised = result.writeResults[0]?.transformResults?.[0];
    const version = typeof raised === "number" && Number.isFinite(raised)
        ? raised
        : authVersionOf((await getServerDocument<{ authVersion?: unknown }>(`users/${email}`))?.authVersion);
    remember(email, version);
    return version;
}

/**
 * Removes the account's Firebase Auth user, whose refresh tokens keep the
 * browsers' Firestore connections (realtime data, Social) alive: they end
 * within the hour. A browser that is still signed in gets a new one from
 * /api/auth/firebase-token. Best effort: false when it couldn't be done.
 */
export async function revokeDataSessions(email: string) {
    return deleteFirebaseAuthUser(email).then(() => true, (error: unknown) => {
        console.error("[auth] Firebase sessions could not be revoked:", error instanceof Error ? error.message : "unknown error");
        return false;
    });
}

/** Every session of the account signs in again: the version goes up and the data connections are cut. */
export async function signOutEverywhere(email: string): Promise<{ authVersion: number; dataSessionsRevoked: boolean }> {
    const authVersion = await raiseAuthVersion(email);
    return { authVersion, dataSessionsRevoked: await revokeDataSessions(email) };
}
