import { NextResponse } from "next/server";
import type { AccountSecuritySummary } from "@/lib/account-security";
import { readLoginHistory } from "@/lib/login-history";
import { getActiveSession } from "@/lib/server/active-session";
import { toIso } from "@/lib/server/admin";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { jsonSecurityHeaders } from "@/lib/server/request-security";
import type { CredentialRecord } from "@/lib/server/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET: the signed-in account's security at a glance for the Security page
 * (src/lib/account-security.ts). Facts only: no secret, hash or code leaves
 * the server, just whether they exist and how many recovery codes are left,
 * and the account's last sign-ins (when, how, device family, country).
 */

const READS_PER_MINUTE = 60;

function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders(headers) });
}

export async function GET() {
    const active = await getActiveSession();
    if (!active) return json({ error: "Etkin oturum gerekli.", code: "session" }, 401);
    const { email, session } = active;
    const user = active.user as Record<string, unknown>;
    try {
        const rate = await enforceRateLimitWithFallback(`account-security:read:${email}`, READS_PER_MINUTE, 60_000);
        if (!rate.allowed) return json({ error: "Çok fazla istek. Biraz sonra tekrar deneyin.", code: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
        const credential = await getServerDocument<CredentialRecord>(`credentials/${email}`);
        const twoFactor = Boolean(credential?.totpEnabled && credential.totpSecretEnc);
        const summary: AccountSecuritySummary = {
            provider: user.provider === "google" || user.provider === "credentials" ? user.provider : null,
            hasPassword: Boolean(credential?.passwordHash),
            twoFactor: { enabled: twoFactor, recoveryCodesLeft: twoFactor && Array.isArray(credential?.recoveryCodes) ? credential.recoveryCodes.length : 0 },
            lastLoginAt: toIso(user.lastLoginAt ?? user.lastLoginDate),
            sessionSince: typeof session.authTime === "number" && session.authTime > 0 ? toIso(session.authTime) : null,
            loginHistory: readLoginHistory(user.loginHistory),
        };
        return json(summary);
    } catch (error) {
        console.error("[account-security]", error instanceof Error ? error.message : "unknown error");
        return json({ error: "Güvenlik bilgileri şu anda alınamıyor.", code: "unavailable" }, 503);
    }
}
