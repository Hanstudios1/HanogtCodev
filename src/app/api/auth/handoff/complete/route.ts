import { encode } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { SESSION_MAX_AGE, authOptions } from "@/lib/auth";
import { AUTH_HANDOFF_COOKIE, requestOrigin, verifyHandoff } from "@/lib/server/auth-handoff";
import { getServerDocument, isFirebaseServerConfigured } from "@/lib/server/firebase-rest";

function serializeCookie(name: string, value: string, options: { path?: string; httpOnly?: boolean; sameSite?: unknown; secure?: boolean; maxAge?: number }) {
    const parts = [`${name}=${value}`, `Path=${options.path || "/"}`];
    if (options.maxAge !== undefined) {
        parts.push(`Max-Age=${options.maxAge}`, `Expires=${new Date(Date.now() + options.maxAge * 1000).toUTCString()}`);
    }
    if (options.httpOnly) parts.push("HttpOnly");
    if (typeof options.sameSite === "string") parts.push(`SameSite=${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`);
    if (options.secure) parts.push("Secure");
    return parts.join("; ");
}

/**
 * Redeems a hand-off token on the site where the sign-in started and stores
 * a regular NextAuth session cookie for this host.
 */
export async function GET(request: NextRequest) {
    const origin = requestOrigin(request);
    const secure = origin.startsWith("https://");
    const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    headers.append("Set-Cookie", serializeCookie(AUTH_HANDOFF_COOKIE, "", { path: "/api/auth/handoff", maxAge: 0, sameSite: "lax", secure }));
    const fail = (code: string) => {
        headers.set("Location", `/login?error=${encodeURIComponent(code)}`);
        return new Response(null, { status: 302, headers });
    };

    const nonce = request.cookies.get(AUTH_HANDOFF_COOKIE)?.value || "";
    let payload: ReturnType<typeof verifyHandoff> = null;
    try {
        payload = verifyHandoff(request.nextUrl.searchParams.get("token") || "", origin, nonce);
    } catch (error) {
        console.error("[auth] hand-off verification failed", error);
    }
    if (!payload) return fail("HandoffFailed");

    const { user } = payload;
    if (isFirebaseServerConfigured()) {
        try {
            const profile = await getServerDocument<{ banned?: boolean; suspended?: boolean }>(`users/${user.email}`);
            if (profile?.banned || profile?.suspended) return fail("AccountSuspended");
        } catch {
            // The auth host checked this account a moment ago during the Google step.
        }
    }

    const cookie = authOptions.cookies?.sessionToken;
    if (!cookie || !process.env.NEXTAUTH_SECRET) return fail("Configuration");
    const sessionToken = await encode({
        token: { name: user.name, email: user.email, picture: user.picture, sub: user.id, id: user.id },
        secret: process.env.NEXTAUTH_SECRET,
        maxAge: SESSION_MAX_AGE,
    });
    headers.append("Set-Cookie", serializeCookie(cookie.name, sessionToken, { ...cookie.options, maxAge: SESSION_MAX_AGE }));
    headers.set("Location", payload.next);
    return new Response(null, { status: 302, headers });
}
