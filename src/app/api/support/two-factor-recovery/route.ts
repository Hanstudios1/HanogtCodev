import type { NextRequest } from "next/server";
import { readTwoFactorRecoveryToken } from "@/lib/server/appeal-token";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { handleSignInRequest } from "../_sign-in-request";

/**
 * Two-step verification recovery request (POST { token, message }).
 *
 * Someone who lost both their authenticator and their recovery codes can't
 * finish signing in, so they can't open a ticket. When they say so on the
 * 2FA step, sign-in checks the password again and hands /login a short-lived
 * "2fa-recovery" token (appeal tokens don't work here, nor these for appeals);
 * the request is posted here (checks and answers: ../_sign-in-request.ts).
 *
 * It becomes a high-priority "request" ticket of that address with
 * `meta.twoFactorRecovery: true`. Staff see a "2FA kurtarma" badge and reset
 * two-step verification in the Users section once they are sure the account
 * is the sender's: only the password was proven, not the second factor. The
 * person can't read replies before that; afterwards they sign in with their
 * password alone and find the reply under "Taleplerim".
 */

export const runtime = "nodejs";

/** Stored title of these tickets (the admin inbox shows it as written). */
const TITLE = "İki adımlı doğrulama kurtarma talebi";

/** Still asks for a second factor: the account flag or the credential itself (authorize() reads the latter). */
async function stillUsesTwoFactor(email: string, user: Record<string, unknown>) {
    if (user.twoFactorEnabled === true) return true;
    const credential = await getServerDocument<{ totpEnabled?: unknown }>(`credentials/${email}`);
    return credential?.totpEnabled === true;
}

export function POST(request: NextRequest) {
    return handleSignInRequest(request, {
        name: "2fa-recovery",
        readToken: readTwoFactorRecoveryToken,
        perAccountPerDay: 1,
        // A reset since the token was issued makes the request moot: same answer, no ticket.
        applies: stillUsesTwoFactor,
        ticket: { category: "request", title: TITLE, priority: "high", meta: { twoFactorRecovery: true } },
    });
}
