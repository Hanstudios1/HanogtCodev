import { NextRequest, NextResponse } from "next/server";
import { ArcadeListError, arcadeCreator, ensureArcadeBackfill, listArcadePage, listFeaturedArcadeGames, readArcadeListQuery } from "@/lib/server/arcade-feed";
import { memoryRateLimit } from "@/lib/server/rate-limit";
import { getClientKey } from "@/lib/server/request-security";

export const runtime = "nodejs";

function json(payload: unknown, status = 200, cache = "public, max-age=15, s-maxage=30, stale-while-revalidate=120") {
    return NextResponse.json(payload, { status, headers: { "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });
}

/**
 * The Arcade gallery, 24 games a page (?cursor= from the previous page):
 * ?sort=new|popular|rated, ?genre=, ?dimension=2d|3d, ?q=, or ?creator=<id>
 * for a creator page (with the creator's public name and picture on the
 * first page). The unfiltered first page also carries the featured games.
 * Nothing in it depends on the viewer, so it can be cached.
 */
export async function GET(request: NextRequest) {
    try {
        // Reading is limited in memory: a stored counter would cost a database write per page.
        const rate = memoryRateLimit(`arcade:list:${getClientKey(request)}`, 120, 60_000);
        if (!rate.allowed) return json({ games: [], error: "Çok fazla istek. Biraz sonra tekrar deneyin.", code: "rate_limited" }, 429, "no-store");
        const query = readArcadeListQuery(request.nextUrl.searchParams);
        await ensureArcadeBackfill();
        const first = !query.cursor;
        const plain = first && !query.genre && !query.dimension && !query.q && !query.creator;
        const [page, featured, creator] = await Promise.all([
            listArcadePage(query),
            plain ? listFeaturedArcadeGames().catch(() => []) : Promise.resolve(null),
            query.creator && first ? arcadeCreator(query.creator) : Promise.resolve(null),
        ]);
        if (query.creator && first && !creator) return json({ games: [], error: "Yapımcı bulunamadı.", code: "creator_not_found" }, 404, "no-store");
        return json({ ...page, ...(featured ? { featured } : {}), ...(creator ? { creator } : {}) });
    } catch (error) {
        if (error instanceof ArcadeListError) return json({ games: [], error: error.message, code: error.code }, error.status, "no-store");
        return json({ games: [], error: "Arcade şu anda yüklenemiyor.", code: "unavailable" }, 503, "no-store");
    }
}
