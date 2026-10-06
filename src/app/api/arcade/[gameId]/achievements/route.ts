import type { NextRequest } from "next/server";
import { assertGameId, likerHash } from "@/lib/server/arcade";
import { unlockArcadeAchievement } from "@/lib/server/arcade-scores";
import { getActiveSession } from "@/lib/server/active-session";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin } from "@/lib/server/request-security";
import { arcadeFailure, arcadeJson, readArcadeBody, tooManyRequests } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

/** Unlocks an achievement of the game for the signed-in player ({ token, id }). */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        if (!isSameOrigin(request)) return arcadeJson({ error: "Geçersiz istek kaynağı.", code: "origin" }, 403);
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return arcadeJson({ error: "Geçersiz oyun.", code: "invalid_game" }, 400);
        const active = await getActiveSession();
        if (!active) return arcadeJson({ error: "Başarımların kaydedilmesi için giriş yapın.", code: "sign_in" }, 401);
        const body = await readArcadeBody(request, ["token", "id"]);
        const rate = await enforceRateLimitWithFallback(`arcade:achievement:${likerHash(active.email)}`, 120, 10 * 60_000);
        if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);
        return arcadeJson(await unlockArcadeAchievement({ gameId, email: active.email, token: body.token, id: body.id }));
    } catch (error) {
        return arcadeFailure(error, "Başarım kaydedilemedi.");
    }
}
