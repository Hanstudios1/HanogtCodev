import { NextRequest, NextResponse } from "next/server";
import { isDownloadPlatform } from "@/lib/downloads";
import { availableDownloads, downloadTarget } from "@/lib/server/releases";

export const runtime = "nodejs";

/**
 * GET /api/download              → which platforms the latest release has
 *                                  (503 when GitHub can't be asked: the menu then links to the releases page)
 * GET /api/download?platform=…   → 302 to that file (or to the release page)
 * Links stay the same from one version to the next.
 */
const CACHED = { "Cache-Control": "public, max-age=300, s-maxage=900" };
// GitHub couldn't be asked: nothing is cached, so the next visitor gets the real answer.
const UNCACHED = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
    const platform = request.nextUrl.searchParams.get("platform");
    if (platform === null) {
        const downloads = await availableDownloads();
        if (!downloads) return NextResponse.json({ error: "The releases can't be read right now." }, { status: 503, headers: UNCACHED });
        return NextResponse.json(downloads, { headers: CACHED });
    }
    if (!isDownloadPlatform(platform)) return NextResponse.json({ error: "Unknown platform." }, { status: 400 });
    const target = await downloadTarget(platform);
    return NextResponse.redirect(target.url, { status: 302, headers: target.known ? CACHED : UNCACHED });
}
