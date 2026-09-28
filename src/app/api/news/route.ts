import { NextResponse } from "next/server";
import { getNewsSnapshot } from "@/lib/server/news";

export const runtime = "nodejs";

export async function GET() {
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
