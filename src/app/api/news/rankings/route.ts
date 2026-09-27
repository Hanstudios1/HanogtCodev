import { NextRequest, NextResponse } from "next/server";
import { ARENA_CATEGORIES, ARENA_MODELS, getArenaStandings, getExternalBoards, isArenaCategory } from "@/lib/server/ai-rankings";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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
