import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { getArenaStandings, isArenaCategory, isArenaModel, recordArenaVote } from "@/lib/server/ai-rankings";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403, headers: jsonSecurityHeaders() });
    const active = await getActiveSession();
    if (!active) return NextResponse.json({ error: "Oy vermek için giriş yapın." }, { status: 401, headers: jsonSecurityHeaders() });
    const rate = await enforceRateLimit(`arena-vote:${active.email}`, 30, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Saatlik oy sınırına ulaştınız." }, { status: 429, headers: jsonSecurityHeaders() });
    const body = await request.json().catch(() => null) as { category?: unknown; a?: unknown; b?: unknown; result?: unknown } | null;
    if (!body || !isArenaCategory(body.category) || !isArenaModel(body.a) || !isArenaModel(body.b) || body.a === body.b || !["a", "b", "tie"].includes(String(body.result))) {
        return NextResponse.json({ error: "Geçersiz oy." }, { status: 400, headers: jsonSecurityHeaders() });
    }
    try {
        const outcome = await recordArenaVote(active.email, body.category, body.a, body.b, body.result as "a" | "b" | "tie");
        if (!outcome.ok) {
            const message = outcome.reason === "already-voted" ? "Bu ikili için bugün zaten oy verdin. Başka bir karşılaştırma dene!" : "Şu anda çok yoğun, lütfen tekrar deneyin.";
            return NextResponse.json({ error: message }, { status: 409, headers: jsonSecurityHeaders() });
        }
        const arena = await getArenaStandings(body.category);
        return NextResponse.json({ success: true, arena }, { headers: jsonSecurityHeaders() });
    } catch {
        return NextResponse.json({ error: "Oy kaydedilemedi." }, { status: 503, headers: jsonSecurityHeaders() });
    }
}
