import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { createFirebaseCustomToken } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;
    const rate = await enforceRateLimit(`firebase-token:${email}`, 20, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Çok fazla istek." }, { status: 429 });
    try {
        return NextResponse.json({ token: await createFirebaseCustomToken(email) }, { headers: jsonSecurityHeaders() });
    } catch {
        return NextResponse.json({ error: "Veri oturumu başlatılamadı." }, { status: 503, headers: jsonSecurityHeaders() });
    }
}
