import { NextRequest, NextResponse } from "next/server";
import { ARCADE_LIST_FIELDS, arcadeSummary, type ArcadeRecord } from "@/lib/server/arcade";
import { runServerQuery } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getClientKey } from "@/lib/server/request-security";

export const runtime = "nodejs";

function json(payload: unknown, status = 200, cache = "public, max-age=15, s-maxage=30, stale-while-revalidate=120") {
    return NextResponse.json(payload, { status, headers: { "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: NextRequest) {
    try {
        const rate = await enforceRateLimit(`arcade:list:${getClientKey(request)}`, 120, 60_000);
        if (!rate.allowed) return json({ error: "Çok fazla istek. Biraz sonra tekrar deneyin." }, 429, "no-store");
        const params = request.nextUrl.searchParams;
        const sort = params.get("sort") === "popular" ? "plays" : params.get("sort") === "liked" ? "likes" : "updatedAt";
        const dimension = params.get("dimension");
        const query = (params.get("q") || "").trim().toLocaleLowerCase("tr").slice(0, 60);
        const limit = Math.min(60, Math.max(1, Number(params.get("limit")) || 48));
        const records = await runServerQuery<ArcadeRecord>({
            collectionId: "arcade_games",
            select: ARCADE_LIST_FIELDS,
            orderBy: [{ field: sort, direction: "DESCENDING" }],
            limit: query || dimension ? 200 : limit,
        });
        const games = records
            .map((record) => arcadeSummary(record, record._id))
            .filter((game) => (dimension === "2d" || dimension === "3d" ? game.dimension === dimension : true))
            .filter((game) => !query || `${game.title} ${game.description} ${game.authorName}`.toLocaleLowerCase("tr").includes(query))
            .slice(0, limit);
        return json({ games });
    } catch {
        return json({ games: [], error: "Arcade şu anda yüklenemiyor." }, 503, "no-store");
    }
}
