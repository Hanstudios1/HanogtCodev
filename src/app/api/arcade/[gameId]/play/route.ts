import { NextRequest, NextResponse } from "next/server";
import { assertGameId, type ArcadeRecord } from "@/lib/server/arcade";
import { commitServerMutations, getServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

/** Counts a play (at most once per visitor per game every 10 minutes). */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403, headers: jsonSecurityHeaders() });
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return NextResponse.json({ error: "Geçersiz oyun." }, { status: 400, headers: jsonSecurityHeaders() });
        const rate = await enforceRateLimit(`arcade:play:${gameId}:${getClientKey(request)}`, 1, 10 * 60_000);
        const record = await getServerDocument<ArcadeRecord>(`arcade_games/${gameId}`);
        if (!record) return NextResponse.json({ error: "Oyun bulunamadı." }, { status: 404, headers: jsonSecurityHeaders() });
        if (rate.allowed) await commitServerMutations([{ type: "increment", path: `arcade_games/${gameId}`, fields: { plays: 1 } }]);
        return NextResponse.json({ plays: Number(record.plays || 0) + (rate.allowed ? 1 : 0), counted: rate.allowed }, { headers: jsonSecurityHeaders() });
    } catch {
        return NextResponse.json({ error: "Sayaç güncellenemedi." }, { status: 503, headers: jsonSecurityHeaders() });
    }
}
