import { NextRequest, NextResponse } from "next/server";
import { nowIso } from "@/lib/game-engine/ids";
import { assertGameId, likeDocumentId, likerHash, type ArcadeRecord } from "@/lib/server/arcade";
import { getActiveSession } from "@/lib/server/active-session";
import { commitServerMutations, getServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

/** Toggles the signed-in user's like. */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403, headers: jsonSecurityHeaders() });
        const active = await getActiveSession();
        if (!active) return NextResponse.json({ error: "Beğenmek için giriş yapın." }, { status: 401, headers: jsonSecurityHeaders() });
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return NextResponse.json({ error: "Geçersiz oyun." }, { status: 400, headers: jsonSecurityHeaders() });
        const rate = await enforceRateLimit(`arcade:like:${active.email}`, 40, 60_000);
        if (!rate.allowed) return NextResponse.json({ error: "Çok fazla istek." }, { status: 429, headers: jsonSecurityHeaders() });
        const record = await getServerDocument<ArcadeRecord>(`arcade_games/${gameId}`);
        if (!record) return NextResponse.json({ error: "Oyun bulunamadı." }, { status: 404, headers: jsonSecurityHeaders() });
        const likePath = `arcade_likes/${likeDocumentId(gameId, active.email)}`;
        const existing = await getServerDocument(likePath);
        if (existing) {
            await commitServerMutations([
                { type: "delete", path: likePath },
                { type: "increment", path: `arcade_games/${gameId}`, fields: { likes: -1 } },
            ]);
        } else {
            await commitServerMutations([
                { type: "create", path: likePath, data: { gameId, liker: likerHash(active.email), createdAt: nowIso() } },
                { type: "increment", path: `arcade_games/${gameId}`, fields: { likes: 1 } },
            ]);
        }
        const likes = Math.max(0, Number(record.likes || 0) + (existing ? -1 : 1));
        return NextResponse.json({ liked: !existing, likes }, { headers: jsonSecurityHeaders() });
    } catch {
        return NextResponse.json({ error: "Beğeni kaydedilemedi." }, { status: 503, headers: jsonSecurityHeaders() });
    }
}
