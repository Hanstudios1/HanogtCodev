import { NextRequest, NextResponse } from "next/server";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { memoryRateLimit } from "@/lib/server/rate-limit";
import { clientIpFromHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";

/**
 * Comment counts for up to 30 headlines (news_meta documents, fetched in
 * parallel). Every new set of ids misses the CDN cache, so each address gets
 * 120 lookups per 10 minutes (the news page asks once per page of headlines).
 */
export async function GET(request: NextRequest) {
    const ids = (request.nextUrl.searchParams.get("ids") || "").split(",").filter((id) => /^[a-f0-9]{20}$/.test(id)).slice(0, 30);
    if (!ids.length) return NextResponse.json({ counts: {} });
    const rate = memoryRateLimit(`news-counts:${clientIpFromHeaders(request.headers)}`, 120, 10 * 60_000);
    if (!rate.allowed) return NextResponse.json({ counts: {} }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "no-store" } });
    try {
        const entries = await Promise.all(ids.map(async (id) => {
            const doc = await getServerDocument<{ commentCount?: number }>(`news_meta/${id}`).catch(() => null);
            return [id, Math.max(0, Number(doc?.commentCount || 0))] as const;
        }));
        return NextResponse.json({ counts: Object.fromEntries(entries.filter(([, count]) => count > 0)) }, { headers: { "Cache-Control": "public, max-age=20, s-maxage=30" } });
    } catch {
        return NextResponse.json({ counts: {} });
    }
}
