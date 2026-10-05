import "server-only";

import type { NextRequest } from "next/server";
import { validateSignInRequestMessage, type SignInRequestErrorCode } from "@/lib/auth-client";
import { httpsUrlOrNull } from "@/lib/server/admin";
import type { SignInTokenClaims } from "@/lib/server/appeal-token";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { getClientKey, isSameOrigin } from "@/lib/server/request-security";
import {
    createSupportTicket,
    notifyStaffAboutTicket,
    requireRateLimit,
    supportFailure,
    supportJson,
    type NewTicketInput,
} from "@/lib/server/support";
import { readJsonBody } from "@/lib/server/validate";

/**
 * Requests filed from /login by someone who can't finish signing in, carrying
 * the short-lived token sign-in gave them (src/lib/server/appeal-token.ts):
 * suspension appeals (./appeal), 2FA recovery requests (./two-factor-recovery)
 * and forgotten-password requests after a Google sign-in
 * (./password-recovery). Each becomes an ordinary ticket of the account's
 * address, so staff answer them in the Tickets section and the person finds
 * the reply under "Taleplerim" once they can sign in again. Whatever the
 * account's state, the only success answer is "received".
 */

const HOUR = 60 * 60_000;
/** Requests one address may send to each endpoint per hour, valid or not. */
const REQUESTS_PER_IP_HOUR = 10;

export type SignInRequestKind = {
    /** Rate-limit key and log label. */
    name: string;
    /** Verifies the token for this kind's purpose (a token of another purpose fails). */
    readToken: (token: unknown) => SignInTokenClaims | null;
    /** Requests one account may file per 24 hours. */
    perAccountPerDay: number;
    /**
     * Whether the account still needs this request (e.g. is still suspended).
     * If not, the answer is the same and no ticket is created.
     */
    applies: (email: string, user: Record<string, unknown>) => boolean | Promise<boolean>;
    ticket: Pick<NewTicketInput, "category" | "title" | "priority" | "meta">;
};

const ERROR_MESSAGES: Record<SignInRequestErrorCode, string> = {
    bad_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    invalid_body: "Geçersiz istek gövdesi.",
    invalid_token: "Doğrulamanın süresi dolmuş ya da geçersiz; yeniden giriş yapmayı deneyin.",
    message_required: "Açıklama gerekli.",
    message_too_short: "Açıklama çok kısa.",
    message_too_long: "Açıklama çok uzun.",
    unavailable: "Hizmet şu anda kullanılamıyor.",
};

function requestError(status: number, code: SignInRequestErrorCode) {
    return supportJson({ error: ERROR_MESSAGES[code], code }, status);
}

function displayName(email: string, profile: Record<string, unknown> | null, user: Record<string, unknown>) {
    const name = [profile?.username, user.username].find((value): value is string => typeof value === "string" && Boolean(value.trim()));
    return (name ?? email.split("@")[0]).trim().slice(0, 80);
}

/** POST { token, message } for one kind of request. */
export async function handleSignInRequest(request: NextRequest, kind: SignInRequestKind) {
    if (!isSameOrigin(request)) return requestError(403, "bad_origin");
    try {
        await requireRateLimit(`support:${kind.name}:ip:${getClientKey(request)}`, REQUESTS_PER_IP_HOUR, HOUR);
        const body = await readJsonBody(request, 24_000);
        if (!body) return requestError(400, "invalid_body");
        const claims = kind.readToken(body.token);
        if (!claims) return requestError(401, "invalid_token");
        const message = validateSignInRequestMessage(body.message);
        if (!message.ok) return requestError(400, message.code);
        // Invalid requests above don't use up the account's quota.
        const { email } = claims;
        await requireRateLimit(`support:${kind.name}:account:${email}`, kind.perAccountPerDay, 24 * HOUR);

        const [user, profile] = await Promise.all([
            getServerDocument<Record<string, unknown>>(`users/${email}`),
            getServerDocument<Record<string, unknown>>(`public_profiles/${email}`).catch(() => null),
        ]);
        // A deleted account, or one that no longer needs this, gets the same answer and no ticket.
        if (user && await kind.applies(email, user)) {
            const { id } = await createSupportTicket({
                ...kind.ticket,
                description: message.text,
                authorEmail: email,
                authorName: displayName(email, profile, user),
                authorAvatar: httpsUrlOrNull(profile?.avatarUrl) ?? httpsUrlOrNull(user.avatarUrl),
            });
            await notifyStaffAboutTicket({ ticketId: id, title: kind.ticket.title, authorEmail: email, event: "created" });
        }
        return supportJson({ status: "received" }, 201);
    } catch (error) {
        return supportFailure(error, kind.name);
    }
}
