import { NextResponse, type NextRequest } from "next/server";
import { getNewsSnapshot } from "@/lib/server/news";

export const runtime = "nodejs";

/**
 * GET /api/news  the live snapshot: stories of the last 24 hours.
 * Hanogt News keeps nothing older, so the old `?before=` archive pages answer
 * an empty, finished page (pages loaded before the change still work).
 */
export async function GET(request: NextRequest) {
    if (request.nextUrl.searchParams.get("before") !== null) {
        return NextResponse.json({ items: [], done: true }, {
            headers: { "Cache-Control": "public, max-age=300, s-maxage=3600", "X-Content-Type-Options": "nosniff" },
        });
    }
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
