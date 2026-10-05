import { NextRequest, NextResponse } from "next/server";
import { ARENA_CATEGORIES, ARENA_MODELS, getArenaStandings, getExternalBoards, isArenaCategory } from "@/lib/server/ai-rankings";
import { memoryRateLimit } from "@/lib/server/rate-limit";
import { clientIpFromHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";

/** Leaderboards and the community arena (a Firestore read each time): 60 per address in 10 minutes. */
export async function GET(request: NextRequest) {
    const rate = memoryRateLimit(`news-rankings:${clientIpFromHeaders(request.headers)}`, 60, 10 * 60_000);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const requested = request.nextUrl.searchParams.get("category");
    const category = isArenaCategory(requested) ? requested : "code";
    const [external, arena] = await Promise.all([
        getExternalBoards().catch(() => []),
        getArenaStandings(category).catch(() => null),
    ]);
    // Offer a random pair to vote on (clients can ask again for another pair).
    const shuffled = [...ARENA_MODELS].sort(() => Math.random() - 0.5);
    return NextResponse.json({
        external,
        arena,
        categories: ARENA_CATEGORIES,
        models: ARENA_MODELS,
        pair: [shuffled[0].id, shuffled[1].id],
    }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
