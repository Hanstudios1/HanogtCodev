import { after, type NextRequest } from "next/server";
import { StarError, listStars, starLimitFor, starMessage } from "@/lib/server/social-stars";
import { SocialApiError, assertRateLimit, assertSameOrigin, readBody, requireSocialUser, socialErrorResponse, socialJson } from "@/lib/social/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starred messages (Hanogt Social › Starred): GET lists them with the plan's
 * limit (Free 200, Plus 500, Pro 1,000), POST { scope: "dm" | "group",
 * target, messageId, starred } adds or removes one.
 */
export async function GET() {
    try {
        const user = await requireSocialUser();
        await assertRateLimit(`social:stars-read:${user.email}`, 60);
        const [stars, { limit }] = await Promise.all([listStars(user.email), starLimitFor(user.email)]);
        return socialJson({ stars, limit });
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
            return socialJson(await starMessage(user.email, scope, body.target, body.messageId, body.starred !== false, { onLate: (work) => after(() => work.then(() => undefined, () => undefined)) }));
        } catch (error) {
            if (error instanceof StarError) {
                throw error.code === "limit"
                    ? new SocialApiError(409, "stars_limit", `En fazla ${error.limit} mesaj yıldızlanabilir.`, {}, { limit: error.limit, plan: error.plan })
                    : new SocialApiError(error.status, error.code === "not_found" ? "message_not_found" : "invalid_request", "Mesaj bulunamadı.");
            }
            throw error;
        }
    } catch (error) {
        return socialErrorResponse(error, "social/stars");
    }
}
