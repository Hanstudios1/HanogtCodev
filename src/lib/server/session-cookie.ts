import "server-only";

import { encode, getToken, type JWT } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { SESSION_MAX_AGE, authOptions } from "@/lib/auth";

/**
 * Reading and re-issuing the NextAuth session cookie outside NextAuth's own
 * routes: the session hand-off between our domains, the step-up after a
 * Google sign-in (/api/auth/step-up) and "sign out everywhere", which keep
 * the current session while changing its token.
 */

type CookieOptions = { path?: string; httpOnly?: boolean; sameSite?: unknown; secure?: boolean; maxAge?: number };

export function serializeCookie(name: string, value: string, options: CookieOptions) {
    const parts = [`${name}=${value}`, `Path=${options.path || "/"}`];
    if (options.maxAge !== undefined) {
        parts.push(`Max-Age=${options.maxAge}`, `Expires=${new Date(Date.now() + options.maxAge * 1000).toUTCString()}`);
    }
    if (options.httpOnly) parts.push("HttpOnly");
    if (typeof options.sameSite === "string") parts.push(`SameSite=${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`);
    if (options.secure) parts.push("Secure");
    return parts.join("; ");
}

function sessionCookie() {
    const cookie = authOptions.cookies?.sessionToken;
    if (!cookie || !process.env.NEXTAUTH_SECRET) return null;
    return cookie;
}

/** The decoded session token of this request; null when signed out, unreadable or not configured. */
export async function readSessionToken(request: NextRequest): Promise<JWT | null> {
    const cookie = sessionCookie();
    if (!cookie) return null;
    return getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, cookieName: cookie.name }).catch(() => null);
}

/**
 * Set-Cookie values that store `token` as this host's session (iat, exp and
 * jti are set anew), and clear chunks a larger cookie may have left behind.
 * Null when sessions aren't configured.
 */
export async function sessionCookieHeaders(token: JWT, request?: NextRequest): Promise<string[] | null> {
    const cookie = sessionCookie();
    if (!cookie) return null;
    const claims: JWT = { ...token };
    delete claims.iat;
    delete claims.exp;
    delete claims.jti;
    const value = await encode({ token: claims, secret: process.env.NEXTAUTH_SECRET!, maxAge: SESSION_MAX_AGE });
    const headers = [serializeCookie(cookie.name, value, { ...cookie.options, maxAge: SESSION_MAX_AGE })];
    for (const stale of request?.cookies.getAll() ?? []) {
        if (stale.name.startsWith(`${cookie.name}.`)) headers.push(serializeCookie(stale.name, "", { ...cookie.options, maxAge: 0 }));
    }
    return headers;
}

/**
 * Set-Cookie values that keep this request's session signed in at the
 * account's new `authVersion` after it was raised ("sign out everywhere", a
 * password change); `proven` also records that the person has just proved
 * who they are (authTime). Null when there is no finished session to keep.
 */
export async function keepSessionCookie(request: NextRequest, authVersion: number, options: { proven?: boolean } = {}): Promise<string[] | null> {
    const token = await readSessionToken(request);
    if (!token || token.stepUp || token.revoked) return null;
    return sessionCookieHeaders({ ...token, authVersion, ...(options.proven ? { authTime: Date.now() } : {}) }, request);
}
