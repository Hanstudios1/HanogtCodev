import type { NextRequest } from "next/server";
import { assertGameId, likerHash } from "@/lib/server/arcade";
import { arcadePlayerName, readArcadeProgress, startArcadeSession } from "@/lib/server/arcade-scores";
import { getActiveSession } from "@/lib/server/active-session";
import { enforceRateLimitWithFallback, memoryRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, isSameOrigin } from "@/lib/server/request-security";
import { arcadeFailure, arcadeJson, tooManyRequests } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

/** What the signed-in player reached in this game so far (shown before they press Play). */
export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return arcadeJson({ error: "Geçersiz oyun.", code: "invalid_game" }, 400);
        const rate = memoryRateLimit(`arcade:progress:${getClientKey(request)}`, 60, 60_000);
        if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);
        const active = await getActiveSession();
        if (!active) return arcadeJson({ error: "Giriş yapın.", code: "sign_in" }, 401);
        return arcadeJson(await readArcadeProgress(gameId, active.email));
    } catch (error) {
        return arcadeFailure(error, "İlerleme yüklenemedi.");
    }
}

/**
 * Starts a play session of a signed-in player (V5 leaderboards and
 * achievements): a play token, and the player's bests and unlocks so far.
 */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        if (!isSameOrigin(request)) return arcadeJson({ error: "Geçersiz istek kaynağı.", code: "origin" }, 403);
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return arcadeJson({ error: "Geçersiz oyun.", code: "invalid_game" }, 400);
        const active = await getActiveSession();
        if (!active) return arcadeJson({ error: "Skorların kaydedilmesi için giriş yapın.", code: "sign_in" }, 401);
        const rate = await enforceRateLimitWithFallback(`arcade:session:${likerHash(active.email)}`, 30, 10 * 60_000);
        if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);
        const session = await startArcadeSession(gameId, active.email);
        return arcadeJson({ ...session, name: arcadePlayerName(active.user as Record<string, unknown>) });
    } catch (error) {
        return arcadeFailure(error, "Oyun oturumu başlatılamadı.");
    }
}
