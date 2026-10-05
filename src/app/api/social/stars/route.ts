import type { NextRequest } from "next/server";
import { StarError, listStars, starMessage } from "@/lib/server/social-stars";
import { SocialApiError, assertRateLimit, assertSameOrigin, readBody, requireSocialUser, socialErrorResponse, socialJson } from "@/lib/social/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starred messages (Hanogt Social › Starred): GET lists them, POST
 * { scope: "dm" | "group", target, messageId, starred } adds or removes one.
 */
export async function GET() {
    try {
        const user = await requireSocialUser();
        await assertRateLimit(`social:stars-read:${user.email}`, 60);
        return socialJson({ stars: await listStars(user.email) });
    } catch (error) {
        return socialErrorResponse(error, "social/stars");
    }
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireSocialUser();
        await assertRateLimit(`social:stars:${user.email}`, 60);
        const body = await readBody(request, 4_096);
        const scope = body.scope === "dm" || body.scope === "group" ? body.scope : null;
        if (!scope || typeof body.target !== "string" || typeof body.messageId !== "string") throw new SocialApiError(400, "invalid_request", "Geçersiz istek.");
        try {
            return socialJson(await starMessage(user.email, scope, body.target, body.messageId, body.starred !== false));
        } catch (error) {
            if (error instanceof StarError) {
                throw error.code === "conflict"
                    ? new SocialApiError(409, "conflict", "En fazla 200 mesaj yıldızlanabilir.")
                    : new SocialApiError(error.status, error.code === "not_found" ? "message_not_found" : "invalid_request", "Mesaj bulunamadı.");
            }
            throw error;
        }
    } catch (error) {
        return socialErrorResponse(error, "social/stars");
    }
}
