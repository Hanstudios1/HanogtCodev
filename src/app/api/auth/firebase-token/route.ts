import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { createFirebaseCustomToken } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

// Tokens are only minted when the browser has no restored Firebase session
// (new tab/device, expired persistence). 20 per hour locked active users out
// of every page, so the quota now covers normal multi-tab usage.
const TOKENS_PER_HOUR = 120;

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) {
        return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403, headers: jsonSecurityHeaders() });
    }
    const activeSession = await getActiveSession();
    if (!activeSession) {
        return NextResponse.json({ error: "Oturumunuz doğrulanamadı. Lütfen yeniden giriş yapın." }, { status: 401, headers: jsonSecurityHeaders() });
    }
    const { email } = activeSession;
    try {
        const rate = await enforceRateLimit(`firebase-token:${email}`, TOKENS_PER_HOUR, 60 * 60_000);
        if (!rate.allowed) {
            return NextResponse.json({ error: "Kısa sürede çok fazla bağlantı isteği yapıldı. Birkaç dakika sonra tekrar deneyin." }, {
                status: 429,
                headers: jsonSecurityHeaders({ "Retry-After": String(rate.retryAfterSeconds) }),
            });
        }
        return NextResponse.json({ token: await createFirebaseCustomToken(email) }, { headers: jsonSecurityHeaders() });
    } catch {
        return NextResponse.json({ error: "Veri oturumu şu anda başlatılamadı." }, { status: 503, headers: jsonSecurityHeaders() });
    }
}
