import type { NextRequest } from "next/server";
import { assertGameId, likerHash, type ArcadeRecord } from "@/lib/server/arcade";
import { getActiveSession } from "@/lib/server/active-session";
import { fileContentReport } from "@/lib/server/content-reports";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin } from "@/lib/server/request-security";
import { arcadeFailure, arcadeJson, readArcadeBody, tooManyRequests } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

/**
 * Reports a game to the staff ({ category, reason }): it joins the same
 * queue as Media reports (media_reports, kind "arcade"), which moderators
 * review in the Admin Panel. Reporting the same game again replaces the
 * earlier report; ten reports an hour at most.
 */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        if (!isSameOrigin(request)) return arcadeJson({ error: "Geçersiz istek kaynağı.", code: "origin" }, 403);
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return arcadeJson({ error: "Geçersiz oyun.", code: "invalid_game" }, 400);
        const active = await getActiveSession();
        if (!active) return arcadeJson({ error: "Bildirmek için giriş yapın.", code: "sign_in" }, 401);
        const body = await readArcadeBody(request, ["category", "reason"], 4096);
        const rate = await enforceRateLimitWithFallback(`arcade:report:${likerHash(active.email)}`, 10, 60 * 60_000);
        if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);
        const game = await getServerDocument<ArcadeRecord>(`arcade_games/${gameId}`, { fields: ["ownerEmail"] });
        if (!game) return arcadeJson({ error: "Oyun bulunamadı.", code: "not_found" }, 404);
        if (game.ownerEmail === active.email) return arcadeJson({ error: "Kendi oyununuzu bildiremezsiniz.", code: "own_game" }, 400);
        const report = await fileContentReport({ kind: "arcade", targetId: gameId, email: active.email, category: body.category, reason: body.reason });
        if (!report) return arcadeJson({ error: "Bildirim için kısa bir açıklama yazın.", code: "empty_report" }, 400);
        return arcadeJson({ success: true }, 201);
    } catch (error) {
        return arcadeFailure(error, "Bildirim gönderilemedi.");
    }
}
