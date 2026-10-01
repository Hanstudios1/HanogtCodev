import { NextResponse, type NextRequest } from "next/server";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/news/sources";
import { getArchivedNews, getNewsSnapshot } from "@/lib/server/news";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { getClientKey } from "@/lib/server/request-security";

export const runtime = "nodejs";

const ARCHIVE_LIMIT = 60;

/**
 * GET /api/news            the live snapshot
 * GET /api/news?before=ISO  older headlines from the archive (&category=, &limit=)
 */
export async function GET(request: NextRequest) {
    const before = request.nextUrl.searchParams.get("before");
    if (before !== null) return archive(request, before);
    try {
        const snapshot = await getNewsSnapshot();
        return NextResponse.json(snapshot, {
            headers: {
                "Cache-Control": "public, max-age=30, s-maxage=90, stale-while-revalidate=300",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch {
        return NextResponse.json({ items: [], fetchedAt: new Date().toISOString(), sources: [], error: "Haberler şu anda alınamıyor." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}

async function archive(request: NextRequest, before: string) {
    const time = Date.parse(before);
    if (!Number.isFinite(time)) return NextResponse.json({ error: "invalid_before" }, { status: 400 });
    const categoryParam = request.nextUrl.searchParams.get("category");
    const category = NEWS_CATEGORIES.some((entry) => entry.id === categoryParam) ? categoryParam as NewsCategory : null;
    const limit = Math.min(ARCHIVE_LIMIT, Math.max(10, Number.parseInt(request.nextUrl.searchParams.get("limit") || "", 10) || 30));
    const rate = await enforceRateLimitWithFallback(`news-archive:${getClientKey(request)}`, 60, 60_000).catch(() => ({ allowed: true }));
    if (!rate.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    try {
        const result = await getArchivedNews(new Date(time).toISOString(), limit, category);
        return NextResponse.json(result, {
            headers: { "Cache-Control": "public, max-age=60, s-maxage=300", "X-Content-Type-Options": "nosniff" },
        });
    } catch {
        return NextResponse.json({ items: [], done: true, error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}
