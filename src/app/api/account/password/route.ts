import { NextRequest, NextResponse } from "next/server";
import { checkAccountPassword } from "@/lib/auth";
import { getActiveSession } from "@/lib/server/active-session";
import { signOutEverywhere } from "@/lib/server/auth-version";
import { getServerDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { hashPassword, validatePassword } from "@/lib/server/password";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { keepSessionCookie } from "@/lib/server/session-cookie";
import type { CredentialRecord } from "@/lib/server/two-factor";
import { readJsonBody } from "@/lib/server/validate";
import { isRecentAuth } from "@/lib/step-up";

/**
 * Sets or changes the account's password. Changing it needs the current one
 * (an old plaintext one is migrated, as at sign-in). Setting the first one,
 * on an account created with Google, needs a sign-in in the last 30 minutes:
 * from then on every Google sign-in asks for it (src/lib/step-up.ts). Either
 * way every other session is signed out (authVersion) and this one stays.
 */

function json(payload: Record<string, unknown>, status = 200) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders() });
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ error: "Geçersiz istek kaynağı." }, 403);
    const activeSession = await getActiveSession();
    if (!activeSession) return json({ error: "Etkin oturum gerekli." }, 401);
    const { email } = activeSession;
    const rate = await enforceRateLimit(`password-change:${email}`, 5, 60 * 60_000);
    if (!rate.allowed) return json({ error: "Çok fazla deneme. Daha sonra tekrar deneyin." }, 429);

    const body = await readJsonBody<{ currentPassword?: unknown; newPassword?: unknown }>(request, 8_000);
    if (!body) return json({ error: "Geçersiz istek gövdesi.", code: "bad_request" }, 400);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword.slice(0, 1_024) : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const validationError = validatePassword(newPassword);
    if (validationError) return json({ error: validationError }, 400);

    const user = activeSession.user as typeof activeSession.user & { password?: unknown };
    const credential = await getServerDocument<CredentialRecord>(`credentials/${email}`);
    const hasPassword = Boolean(credential?.passwordHash) || typeof user.password === "string";
    if (hasPassword) {
        if (!(await checkAccountPassword(email, currentPassword, user, credential))) {
            return json({ error: "Mevcut şifre yanlış.", code: "wrong_password" }, 403);
        }
    } else if (!isRecentAuth(activeSession.session.authTime)) {
        return json({ error: "Güvenliğiniz için çıkış yapıp yeniden giriş yapın, sonra şifrenizi belirleyin.", code: "reauth_required" }, 403);
    }

    await patchServerDocument(`credentials/${email}`, {
        passwordHash: await hashPassword(newPassword),
        updatedAt: new Date(),
    });
    await patchServerDocument(`users/${email}`, { hasPassword: true, passwordUpdatedAt: new Date() }, {
        updateFields: ["hasPassword", "passwordUpdatedAt", "password", "passwordHash"],
    });

    // Every other session signs in again (with Google, now asking for this password too).
    let raised = false;
    let cookies: string[] | null = null;
    try {
        const { authVersion } = await signOutEverywhere(email);
        raised = true;
        cookies = await keepSessionCookie(request, authVersion, { proven: hasPassword });
    } catch (error) {
        console.error("[account:password] other sessions could not be signed out:", error instanceof Error ? error.message : "unknown error");
    }
    const response = json({ success: true, otherSessionsSignedOut: raised });
    for (const cookie of cookies ?? []) response.headers.append("Set-Cookie", cookie);
    return response;
}
