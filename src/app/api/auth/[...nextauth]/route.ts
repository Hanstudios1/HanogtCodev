import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { AUTH_ERROR_COOKIE, authRequestContext } from "@/lib/server/auth-diagnostics";

const nextAuth = NextAuth(authOptions);

type RouteContext = { params: Promise<{ nextauth: string[] }> };

/**
 * Runs NextAuth inside a per-request context so the logger can record why a
 * sign-in failed. The reason travels back to /login in a short-lived cookie,
 * turning a bare "OAuthCallback" into something actionable.
 */
async function handler(request: NextRequest, context: RouteContext) {
    const state = { reason: null as string | null };
    const response: Response = await authRequestContext.run(state, () => nextAuth(request, context));
    if (!state.reason) return response;
    const https = (request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "")) === "https";
    const headers = new Headers(response.headers);
    headers.append("Set-Cookie", `${AUTH_ERROR_COOKIE}=${encodeURIComponent(state.reason)}; Path=/; Max-Age=300; SameSite=Lax${https ? "; Secure" : ""}`);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export { handler as GET, handler as POST };
