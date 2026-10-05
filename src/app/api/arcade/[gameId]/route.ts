import { NextRequest, NextResponse } from "next/server";
import { arcadeProject, arcadeSummary, assertGameId, likeDocumentId, type ArcadeRecord } from "@/lib/server/arcade";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, jsonSecurityHeaders } from "@/lib/server/request-security";
import { getSignedInSession } from "@/lib/server/active-session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return NextResponse.json({ error: "Geçersiz oyun." }, { status: 400, headers: jsonSecurityHeaders() });
        const rate = await enforceRateLimit(`arcade:game:${getClientKey(request)}`, 90, 60_000);
        if (!rate.allowed) return NextResponse.json({ error: "Çok fazla istek." }, { status: 429, headers: jsonSecurityHeaders({ "Retry-After": String(rate.retryAfterSeconds) }) });
        const record = await getServerDocument<ArcadeRecord>(`arcade_games/${gameId}`);
        if (!record) return NextResponse.json({ error: "Oyun bulunamadı veya yayından kaldırıldı." }, { status: 404, headers: jsonSecurityHeaders() });
        const session = await getSignedInSession();
        const email = session?.user?.email?.toLowerCase();
        const liked = email ? Boolean(await getServerDocument(`arcade_likes/${likeDocumentId(gameId, email)}`).catch(() => null)) : false;
        return NextResponse.json({
            game: { ...arcadeSummary(record, gameId), isOwner: Boolean(email && record.ownerEmail === email), liked },
            project: arcadeProject(record, gameId),
        }, { headers: jsonSecurityHeaders() });
    } catch {
        return NextResponse.json({ error: "Oyun yüklenemedi." }, { status: 503, headers: jsonSecurityHeaders() });
    }
}
