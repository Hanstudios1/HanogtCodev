import { NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/server/markets";

export const runtime = "nodejs";

export async function GET() {
    try {
        const snapshot = await getMarketSnapshot();
        return NextResponse.json(snapshot, {
            headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600", "X-Content-Type-Options": "nosniff" },
        });
    } catch {
        return NextResponse.json({ quotes: [], updatedAt: new Date().toISOString(), source: "" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}
