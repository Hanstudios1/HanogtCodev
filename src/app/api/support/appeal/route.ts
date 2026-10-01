import type { NextRequest } from "next/server";
import { validateAppealMessage, type AppealErrorCode } from "@/lib/auth-client";
import { httpsUrlOrNull } from "@/lib/server/admin";
import { readAppealToken } from "@/lib/server/appeal-token";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { getClientKey, isSameOrigin } from "@/lib/server/request-security";
import { APPEAL_TICKET_TITLE, createSupportTicket, requireRateLimit, supportFailure, supportJson } from "@/lib/server/support";
import { readJsonBody } from "@/lib/server/validate";

/**
 * Appeal against a suspension (POST { token, message }).
 *
 * A suspended account can't sign in, so it can't use /api/support. After it
 * has proven ownership at sign-in, /login receives a short-lived appeal token
 * (src/lib/server/appeal-token.ts) and posts the appeal here. The appeal
 * becomes an ordinary "ban_appeal" ticket of that address, so staff answer it in
 * the Tickets section and the person finds the reply under "Taleplerim" once
 * the account is reinstated. The only success answer is "received".
 */

export const runtime = "nodejs";

const HOUR = 60 * 60_000;
/** Requests one address may send per hour, valid or not. */
const REQUESTS_PER_IP_HOUR = 10;
/** Appeals one account may file per day. */
const APPEALS_PER_ACCOUNT_DAY = 2;

const ERROR_MESSAGES: Record<AppealErrorCode, string> = {
    bad_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    invalid_body: "Geçersiz istek gövdesi.",
    invalid_token: "Doğrulamanın süresi dolmuş ya da geçersiz; yeniden giriş yapmayı deneyin.",
    message_required: "İtiraz metni gerekli.",
    message_too_short: "İtiraz metni çok kısa.",
    message_too_long: "İtiraz metni çok uzun.",
    unavailable: "Hizmet şu anda kullanılamıyor.",
};

function appealError(status: number, code: AppealErrorCode) {
    return supportJson({ error: ERROR_MESSAGES[code], code }, status);
}

function displayName(email: string, profile: Record<string, unknown> | null, user: Record<string, unknown>) {
    const name = [profile?.username, user.username].find((value): value is string => typeof value === "string" && Boolean(value.trim()));
    return (name ?? email.split("@")[0]).trim().slice(0, 80);
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return appealError(403, "bad_origin");
    try {
        await requireRateLimit(`support:appeal:ip:${getClientKey(request)}`, REQUESTS_PER_IP_HOUR, HOUR);
        const body = await readJsonBody(request, 24_000);
        if (!body) return appealError(400, "invalid_body");
        const claims = readAppealToken(body.token);
        if (!claims) return appealError(401, "invalid_token");
        const message = validateAppealMessage(body.message);
        if (!message.ok) return appealError(400, message.code);
        // Invalid requests above don't use up the account's quota.
        const { email } = claims;
        await requireRateLimit(`support:appeal:account:${email}`, APPEALS_PER_ACCOUNT_DAY, 24 * HOUR);

        const [user, profile] = await Promise.all([
            getServerDocument<Record<string, unknown>>(`users/${email}`),
            getServerDocument<Record<string, unknown>>(`public_profiles/${email}`).catch(() => null),
        ]);
        // Only a suspended account files an appeal. One reinstated (or deleted)
        // since the token was issued gets the same answer and no ticket.
        if (user && (user.suspended || user.banned)) {
            await createSupportTicket({
                category: "ban_appeal",
                title: APPEAL_TICKET_TITLE,
                description: message.text,
                priority: "high",
                authorEmail: email,
                authorName: displayName(email, profile, user),
                authorAvatar: httpsUrlOrNull(profile?.avatarUrl) ?? httpsUrlOrNull(user.avatarUrl),
                meta: { appeal: true },
            });
        }
        return supportJson({ status: "received" }, 201);
    } catch (error) {
        return supportFailure(error, "appeal");
    }
}
