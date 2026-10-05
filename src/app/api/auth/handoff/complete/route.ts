import type { NextRequest } from "next/server";
import { AUTH_HANDOFF_COOKIE, requestOrigin, verifyHandoff } from "@/lib/server/auth-handoff";
import { getServerDocument, isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { serializeCookie, sessionCookieHeaders } from "@/lib/server/session-cookie";
import { SESSION_TOKEN_VERSION } from "@/lib/step-up";

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

    const { claims } = payload;
    const cookies = await sessionCookieHeaders({
        name: user.name,
        email: user.email,
        picture: user.picture,
        sub: user.id,
        id: user.id,
        sv: SESSION_TOKEN_VERSION,
        authTime: claims.authTime,
        provider: claims.provider,
        authVersion: claims.authVersion,
        // A step-up still pending on the auth host is finished here, at /login/verify.
        ...(claims.stepUp ? { stepUp: claims.stepUp } : {}),
    }, request);
    if (!cookies) return fail("Configuration");
    for (const cookie of cookies) headers.append("Set-Cookie", cookie);
    headers.set("Location", payload.next);
    return new Response(null, { status: 302, headers });
}
