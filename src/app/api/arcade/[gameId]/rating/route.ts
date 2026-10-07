import type { NextRequest } from "next/server";
import { isRatingStars } from "@/lib/arcade-ratings";
import { assertGameId, likerHash } from "@/lib/server/arcade";
import { setArcadeRating } from "@/lib/server/arcade-ratings";
import { getActiveSession } from "@/lib/server/active-session";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin } from "@/lib/server/request-security";
import { arcadeFailure, arcadeJson, readArcadeBody, tooManyRequests } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

/** Checks shared by rating and removing a rating; returns the player or a response. */
async function authorize(request: NextRequest, context: RouteContext) {
    if (!isSameOrigin(request)) return { response: arcadeJson({ error: "Geçersiz istek kaynağı.", code: "origin" }, 403) };
    const gameId = assertGameId((await context.params).gameId);
    if (!gameId) return { response: arcadeJson({ error: "Geçersiz oyun.", code: "invalid_game" }, 400) };
    const active = await getActiveSession();
    if (!active) return { response: arcadeJson({ error: "Puan vermek için giriş yapın.", code: "sign_in" }, 401) };
    const rate = await enforceRateLimitWithFallback(`arcade:rate:${likerHash(active.email)}`, 30, 10 * 60_000);
    if (!rate.allowed) return { response: tooManyRequests(rate.retryAfterSeconds) };
    return { gameId, email: active.email };
}

/** Rates the game ({ stars: 1–5 }) or changes the player's rating; the author can't rate their own game. */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const checked = await authorize(request, context);
        if ("response" in checked) return checked.response;
        const body = await readArcadeBody(request, ["stars"]);
        if (!isRatingStars(body.stars)) return arcadeJson({ error: "Puan 1 ile 5 arasında bir tam sayı olmalı.", code: "invalid_rating" }, 400);
        return arcadeJson(await setArcadeRating({ gameId: checked.gameId, email: checked.email, stars: body.stars }));
    } catch (error) {
        return arcadeFailure(error, "Puan kaydedilemedi.");
    }
}

/** Removes the player's rating. */
export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const checked = await authorize(request, context);
        if ("response" in checked) return checked.response;
        return arcadeJson(await setArcadeRating({ gameId: checked.gameId, email: checked.email, stars: null }));
    } catch (error) {
        return arcadeFailure(error, "Puan kaldırılamadı.");
    }
}
