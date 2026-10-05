import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { signOutEverywhere } from "@/lib/server/auth-version";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { keepSessionCookie } from "@/lib/server/session-cookie";
import { readJsonBody } from "@/lib/server/validate";

/**
 * POST { action: "sign_out_everywhere" }: every other session of the account,
 * on every device and site, is signed out (users/{email}.authVersion, see
 * src/lib/step-up.ts) and their live data connections are cut (the Firebase
 * Auth user is removed; this browser connects again afterwards). This session
 * stays signed in with the new version. 5 an hour.
 */

function json(payload: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders(headers) });
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ error: "Geçersiz istek kaynağı.", code: "origin" }, 403);
    const active = await getActiveSession();
    if (!active) return json({ error: "Etkin oturum gerekli.", code: "session" }, 401);
    const { email } = active;
    const body = await readJsonBody<{ action?: unknown }>(request, 1_000);
    if (body?.action !== "sign_out_everywhere") return json({ error: "Geçersiz istek.", code: "bad_request" }, 400);
    const rate = await enforceRateLimit(`sign-out-everywhere:${email}`, 5, 60 * 60_000);
    if (!rate.allowed) {
        return json({ error: "Çok fazla deneme. Biraz sonra tekrar deneyin.", code: "rate_limited", retryAfterSeconds: rate.retryAfterSeconds }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
    }

    let result: Awaited<ReturnType<typeof signOutEverywhere>>;
    try {
        result = await signOutEverywhere(email);
    } catch (error) {
        console.error("[account:sessions]", error instanceof Error ? error.message : "unknown error");
        return json({ error: "Oturumlar şu anda kapatılamadı. Biraz sonra tekrar deneyin.", code: "unavailable" }, 503);
    }
    const cookies = await keepSessionCookie(request, result.authVersion);
    const response = json({ success: true, dataSessionsRevoked: result.dataSessionsRevoked, keptThisSession: Boolean(cookies) });
    for (const cookie of cookies ?? []) response.headers.append("Set-Cookie", cookie);
    return response;
}
