import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { AUTH_ERROR_COOKIE, authRequestContext } from "@/lib/server/auth-diagnostics";

const nextAuth = NextAuth(authOptions);

type RouteContext = { params: Promise<{ nextauth: string[] }> };

function reasonCookie(request: NextRequest, reason: string) {
    const https = (request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "")) === "https";
    return `${AUTH_ERROR_COOKIE}=${encodeURIComponent(reason)}; Path=/; Max-Age=300; SameSite=Lax${https ? "; Secure" : ""}`;
}

/** Relative redirect to the login screen with a properly encoded error code. */
function toLogin(code: string, cookie?: string) {
    const headers = new Headers({ Location: `/login?error=${encodeURIComponent(code)}`, "Cache-Control": "no-store" });
    if (cookie) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 302, headers });
}

/**
 * Runs NextAuth inside a per-request context so the logger can record why a
 * sign-in failed; the reason travels back to /login in a short-lived cookie.
 *
 * NextAuth's own /error route copies the error text into the Location header
 * without encoding it, so any non-ASCII message (Turkish characters) made the
 * request crash with an empty HTTP 500. That route is answered here instead,
 * and any other crash is turned into a trip back to the login screen.
 */
async function handler(request: NextRequest, context: RouteContext) {
    const state = { reason: null as string | null };
    try {
        const action = (await context.params).nextauth?.[0];
        if (request.method === "GET" && action === "error") {
            return toLogin(request.nextUrl.searchParams.get("error") || "Default");
        }
        const response: Response = await authRequestContext.run(state, () => nextAuth(request, context));
        if (!state.reason) return response;
        const headers = new Headers(response.headers);
        headers.append("Set-Cookie", reasonCookie(request, state.reason));
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
        console.error("[auth] route handler failed", error);
        const message = error instanceof Error ? error.message : String(error);
        const cookie = reasonCookie(request, `HANDLER_ERROR: ${state.reason ?? message}`.slice(0, 180));
        if (request.method === "POST") {
            // The login screen posts with fetch and reads `{ url }` from JSON.
            const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
            headers.append("Set-Cookie", cookie);
            return new Response(JSON.stringify({ url: "/login?error=Default" }), { status: 200, headers });
        }
        return toLogin("Default", cookie);
    }
}

export { handler as GET, handler as POST };
