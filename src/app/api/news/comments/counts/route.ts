import { NextRequest, NextResponse } from "next/server";
import { getServerDocument } from "@/lib/server/firebase-rest";

export const runtime = "nodejs";

/** Comment counts for up to 30 headlines (news_meta documents, fetched in parallel). */
export async function GET(request: NextRequest) {
    const ids = (request.nextUrl.searchParams.get("ids") || "").split(",").filter((id) => /^[a-f0-9]{20}$/.test(id)).slice(0, 30);
    if (!ids.length) return NextResponse.json({ counts: {} });
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
