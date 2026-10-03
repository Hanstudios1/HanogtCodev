import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { iceServersFor } from "@/lib/server/turn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ICE servers for one voice call (STUN, plus TURN when configured: see
 * src/lib/server/turn.ts). TURN credentials are short-lived and per person.
 */
export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;
    const rate = await enforceRateLimitWithFallback(`call-ice:${email}`, 30, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Çok fazla istek." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const { iceServers, turnConfigured } = await iceServersFor(email);
    return NextResponse.json({ iceServers, turnConfigured }, { headers: jsonSecurityHeaders() });
}
