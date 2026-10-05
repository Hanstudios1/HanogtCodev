import type { NextRequest } from "next/server";
import { readPasswordRecoveryToken } from "@/lib/server/appeal-token";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { handleSignInRequest } from "../_sign-in-request";

/**
 * Forgotten-password request (POST { token, message }).
 *
 * After a Google sign-in, an account that also has a password asks for it at
 * /login/verify (src/lib/step-up.ts). Someone who has forgotten it gets a
 * short-lived "password-recovery" token there (/api/auth/step-up) and posts
 * the request here (checks and answers: ../_sign-in-request.ts).
 *
 * It becomes a high-priority "request" ticket of that address with
 * `meta.passwordRecovery: true`. Staff see a "Şifre kurtarma" badge and remove
 * the password in the Users section once they are sure the account is the
 * sender's: only Google was proven, not the password. A Google sign-in is
 * then enough again, and the reply is under "Taleplerim".
 */

export const runtime = "nodejs";

/** Stored title of these tickets (the admin inbox shows it as written). */
const TITLE = "Şifre şartını kaldırma talebi";

/** The account still has a password: a hash, or one from the old plaintext implementation. */
async function stillHasPassword(email: string, user: Record<string, unknown>) {
    if (typeof user.password === "string") return true;
    const credential = await getServerDocument<{ passwordHash?: unknown }>(`credentials/${email}`);
    return Boolean(credential?.passwordHash);
}

export function POST(request: NextRequest) {
    return handleSignInRequest(request, {
        name: "password-recovery",
        readToken: readPasswordRecoveryToken,
        perAccountPerDay: 1,
        // Removed since the token was issued: same answer, no ticket.
        applies: stillHasPassword,
        ticket: { category: "request", title: TITLE, priority: "high", meta: { passwordRecovery: true } },
    });
}
