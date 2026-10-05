import { NextResponse, type NextRequest } from "next/server";
import { checkAccountPassword, secondFactorAttempt } from "@/lib/auth";
import { issuePasswordRecoveryToken } from "@/lib/server/appeal-token";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { clientIpFromHeaders, isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readSessionToken, sessionCookieHeaders } from "@/lib/server/session-cookie";
import { verifySecondFactor, type CredentialRecord } from "@/lib/server/two-factor";
import { readJsonBody } from "@/lib/server/validate";
import { isStaleAuthVersion, readStepUpClaim, sessionStepUpOf, stepUpExpired } from "@/lib/step-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The second check after a Google sign-in (src/lib/step-up.ts), answered from
 * /login/verify.
 *
 * GET  → { pending, needs, expiresAt, email }
 * POST { action: "verify", password, code? } → the account's password (an old
 *      plaintext one is migrated, as at sign-in), then the second factor when
 *      two-step verification is on (an authenticator or a recovery code).
 *      Success re-issues the session cookie without the pending step-up.
 * POST { action: "recovery_token" } → a short-lived token for asking the team
 *      to remove a forgotten password (/api/support/password-recovery).
 *
 * Passwords: 10 tries per account and 60 per address in 15 minutes; codes
 * share sign-in's budget (6 per 15 minutes, 20 a day).
 */

type ErrorCode = "origin" | "auth_required" | "not_pending" | "expired" | "bad_request" | "rate_limited" | "wrong_password" | "totp_required" | "totp_invalid" | "suspended" | "unavailable";

const MESSAGES: Record<ErrorCode, string> = {
    origin: "Geçersiz istek kaynağı.",
    auth_required: "Oturum bulunamadı; yeniden giriş yapın.",
    not_pending: "Bu oturum için ek doğrulama gerekmiyor.",
    expired: "Doğrulama süresi doldu; yeniden giriş yapın.",
    bad_request: "Geçersiz istek.",
    rate_limited: "Çok fazla deneme. Biraz sonra tekrar deneyin.",
    wrong_password: "Şifre yanlış.",
    totp_required: "Doğrulama uygulamanızdaki kodu girin.",
    totp_invalid: "Doğrulama kodu hatalı, süresi dolmuş ya da zaten kullanılmış.",
    suspended: "Hesap askıya alınmış.",
    unavailable: "Doğrulama şu anda yapılamıyor. Biraz sonra tekrar deneyin.",
};

const STATUS: Record<ErrorCode, number> = {
    origin: 403, auth_required: 401, not_pending: 409, expired: 410, bad_request: 400, rate_limited: 429,
    wrong_password: 403, totp_required: 409, totp_invalid: 403, suspended: 403, unavailable: 503,
};

function json(payload: Record<string, unknown>, status = 200, extra: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders({ "Cache-Control": "no-store", ...extra }) });
}

function fail(code: ErrorCode, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return json({ error: MESSAGES[code], code, ...extra }, STATUS[code], headers);
}

function limited(retryAfterSeconds: number) {
    return fail("rate_limited", { retryAfterMinutes: Math.max(1, Math.ceil(retryAfterSeconds / 60)) }, { "Retry-After": String(retryAfterSeconds) });
}

export async function GET(request: NextRequest) {
    const token = await readSessionToken(request);
    const email = typeof token?.email === "string" ? token.email.toLowerCase() : "";
    if (!token || !email || token.revoked) return fail("auth_required");
    const claim = readStepUpClaim(token.stepUp);
    if (!claim) return json({ pending: false, email });
    const stepUp = sessionStepUpOf(claim);
    return json({ pending: true, email, needs: stepUp.needs, expiresAt: stepUp.expiresAt, expired: stepUpExpired(stepUp) });
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return fail("origin");
    const token = await readSessionToken(request);
    const email = typeof token?.email === "string" ? token.email.toLowerCase() : "";
    if (!token || !email || token.revoked) return fail("auth_required");
    const claim = readStepUpClaim(token.stepUp);
    if (!claim) return fail("not_pending");
    if (stepUpExpired(sessionStepUpOf(claim))) return fail("expired");

    const body = await readJsonBody<{ action?: unknown; password?: unknown; code?: unknown }>(request, 4_000);
    const action = body?.action === "recovery_token" ? "recovery_token" : body?.action === "verify" ? "verify" : null;
    if (!body || !action) return fail("bad_request");

    try {
        if (action === "recovery_token") {
            const rate = await enforceRateLimit(`step-up-recovery:${email}`, 5, 60 * 60_000);
            if (!rate.allowed) return limited(rate.retryAfterSeconds);
            const recoveryToken = issuePasswordRecoveryToken(email);
            return recoveryToken ? json({ token: recoveryToken }) : fail("unavailable");
        }

        const password = typeof body.password === "string" ? body.password : "";
        const code = typeof body.code === "string" ? body.code.trim().slice(0, 64) : "";
        if (!password || password.length > 1_024) return fail("bad_request");
        const [rate, ipRate] = await Promise.all([
            enforceRateLimit(`step-up:${email}`, 10, 15 * 60_000),
            enforceRateLimit(`step-up-ip:${clientIpFromHeaders(request.headers)}`, 60, 15 * 60_000),
        ]);
        if (!rate.allowed || !ipRate.allowed) return limited(Math.max(rate.allowed ? 0 : rate.retryAfterSeconds, ipRate.allowed ? 0 : ipRate.retryAfterSeconds));

        const [user, credential] = await Promise.all([
            getServerDocument<{ password?: unknown; suspended?: boolean; banned?: boolean; authVersion?: unknown }>(`users/${email}`),
            getServerDocument<CredentialRecord>(`credentials/${email}`),
        ]);
        if (!user) return fail("auth_required");
        // Signed out everywhere since this sign-in began: it starts over.
        if (isStaleAuthVersion(user.authVersion, token.authVersion)) return fail("expired");
        // The team may have removed the password in the meantime: nothing left to prove.
        const hasPassword = Boolean(credential?.passwordHash) || typeof user.password === "string";
        if (hasPassword && !(await checkAccountPassword(email, password, user, credential))) return fail("wrong_password");

        if (credential?.totpEnabled && credential.totpSecretEnc) {
            // The password was right; the form now asks for the code too.
            if (!code) return fail("totp_required");
            const attempt = await secondFactorAttempt(email);
            if (!attempt.allowed) return limited(attempt.retryAfterSeconds);
            const check = await verifySecondFactor(email, credential, code);
            if (!check.ok) return fail("totp_invalid");
        }
        // Ownership is proven: a suspension is reported now, as at sign-in.
        if (user.suspended || user.banned) return fail("suspended");

        const next = { ...token, authTime: Date.now() };
        delete next.stepUp;
        const cookies = await sessionCookieHeaders(next, request);
        if (!cookies) return fail("unavailable");
        const response = json({ ok: true });
        for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
        return response;
    } catch (error) {
        console.error("[auth:step-up]", error instanceof Error ? error.message : "unknown error");
        return fail("unavailable");
    }
}
