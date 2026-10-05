import type { NextRequest } from "next/server";
import { GifError, searchGifs } from "@/lib/server/gifs";
import { SocialApiError, assertRateLimit, requireSocialUser, socialErrorResponse, socialJson } from "@/lib/social/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GIF picker of Hanogt Social: `?q=` searches (empty: trending), `?page=`
 * pages through, `?lang=tr|en` picks the language. Signed-in people only; the
 * provider's key stays on the server (src/lib/server/gifs.ts).
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireSocialUser();
        await assertRateLimit(`social:gifs:${user.email}`, 60);
        const params = request.nextUrl.searchParams;
        const page = Number(params.get("page") || 1);
        const result = await searchGifs({
            query: params.get("q") ?? "",
            page: Number.isFinite(page) ? page : 1,
            language: params.get("lang") === "en" ? "en" : "tr",
        }).catch((error: unknown) => {
            if (error instanceof GifError) {
                throw error.code === "not_configured"
                    ? new SocialApiError(503, "not_configured", "GIF araması henüz açılmadı.")
                    : new SocialApiError(502, "unavailable", "GIF'ler şu anda yüklenemiyor.");
            }
            throw error;
        });
        return socialJson(result);
    } catch (error) {
        return socialErrorResponse(error, "social/gifs");
    }
}
