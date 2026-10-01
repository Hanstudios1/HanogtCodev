import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getActiveSession } from "@/lib/server/active-session";
import { getServerDocument, isWriteConflict, patchServerDocument } from "@/lib/server/firebase-rest";
import { verifyPassword } from "@/lib/server/password";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { decryptSecret, encryptSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUri, verifyTotp } from "@/lib/server/totp";
import { TWO_FACTOR_FIELDS, verifySecondFactor, type CredentialRecord } from "@/lib/server/two-factor";
import { readJsonBody } from "@/lib/server/validate";

/** A started set-up has to be confirmed with a code within this time. */
const SETUP_TTL_MS = 15 * 60_000;

type ErrorCode =
    | "origin" | "session" | "rate_limited" | "bad_request" | "no_password" | "wrong_password"
    | "already_enabled" | "not_enabled" | "setup_expired" | "invalid_code" | "conflict" | "unavailable";

const MESSAGES: Record<ErrorCode, string> = {
    origin: "Geçersiz istek kaynağı.",
    session: "Etkin oturum gerekli.",
    rate_limited: "Çok fazla deneme. Biraz sonra tekrar deneyin.",
    bad_request: "Geçersiz istek.",
    no_password: "İki adımlı doğrulama e-posta/şifre girişini korur. Önce hesabınız için bir şifre belirleyin.",
    wrong_password: "Şifre yanlış.",
    already_enabled: "İki adımlı doğrulama zaten açık.",
    not_enabled: "İki adımlı doğrulama kapalı.",
    setup_expired: "Kurulum süresi doldu. Yeniden başlatın.",
    invalid_code: "Kod geçersiz veya süresi dolmuş.",
    conflict: "Ayar başka bir oturumda değişti. Sayfayı yenileyip tekrar deneyin.",
    unavailable: "İki adımlı doğrulama şu anda kullanılamıyor.",
};

const STATUS: Record<ErrorCode, number> = {
    origin: 403, session: 401, rate_limited: 429, bad_request: 400, no_password: 409, wrong_password: 403,
    already_enabled: 409, not_enabled: 409, setup_expired: 410, invalid_code: 403, conflict: 409, unavailable: 503,
};

function json(data: Record<string, unknown>, status = 200) {
    return NextResponse.json(data, { status, headers: jsonSecurityHeaders() });
}

function fail(code: ErrorCode, extra: Record<string, unknown> = {}) {
    return json({ error: MESSAGES[code], code, ...extra }, STATUS[code]);
}

function statusOf(credential: CredentialRecord | null) {
    const enabled = Boolean(credential?.totpEnabled && credential.totpSecretEnc);
    return {
        enabled,
        hasPassword: Boolean(credential?.passwordHash),
        recoveryCodesLeft: enabled && Array.isArray(credential?.recoveryCodes) ? credential.recoveryCodes.length : 0,
        enabledAt: enabled && typeof credential?.totpEnabledAt === "string" ? credential.totpEnabledAt : null,
    };
}

export async function GET() {
    const active = await getActiveSession();
    if (!active) return fail("session");
    try {
        const credential = await getServerDocument<CredentialRecord>(`credentials/${active.email}`);
        return json(statusOf(credential));
    } catch {
        return fail("unavailable");
    }
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return fail("origin");
    const active = await getActiveSession();
    if (!active) return fail("session");
    const { email } = active;

    const body = await readJsonBody<{ action?: unknown; password?: unknown; code?: unknown }>(request, 4_000);
    if (!body || typeof body.action !== "string") return fail("bad_request");
    const password = typeof body.password === "string" ? body.password.slice(0, 1_024) : "";
    const code = typeof body.code === "string" ? body.code.trim().slice(0, 64) : "";

    try {
        // Password and code guesses share one budget per account.
        const rate = await enforceRateLimit(`2fa-manage:${email}`, 10, 15 * 60_000);
        if (!rate.allowed) return fail("rate_limited", { retryAfterSeconds: rate.retryAfterSeconds });

        const credential = await getServerDocument<CredentialRecord>(`credentials/${email}`);
        const enabled = Boolean(credential?.totpEnabled && credential.totpSecretEnc);
        const condition = credential?._updateTime ? { updateTime: credential._updateTime } : { exists: false };

        switch (body.action) {
            case "setup": {
                if (!credential?.passwordHash) return fail("no_password");
                if (enabled) return fail("already_enabled");
                if (!(await verifyPassword(password, credential.passwordHash))) return fail("wrong_password");
                const secret = generateTotpSecret();
                const uri = otpauthUri(email, secret);
                await patchServerDocument(`credentials/${email}`, { totpPendingEnc: encryptSecret(secret), totpPendingAt: Date.now() }, condition);
                const qr = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#18181bff", light: "#ffffffff" } });
                return json({ secret, uri, qr, expiresInSeconds: SETUP_TTL_MS / 1000 });
            }
            case "enable": {
                if (enabled) return fail("already_enabled");
                const startedAt = Number(credential?.totpPendingAt || 0);
                if (!credential?.totpPendingEnc || !startedAt || Date.now() - startedAt > SETUP_TTL_MS) return fail("setup_expired");
                let secret: string;
                try {
                    secret = decryptSecret(credential.totpPendingEnc);
                } catch {
                    return fail("setup_expired");
                }
                const step = verifyTotp(secret, code);
                if (step === null) return fail("invalid_code");
                const recoveryCodes = generateRecoveryCodes();
                const enabledState: CredentialRecord = {
                    totpEnabled: true,
                    totpSecretEnc: credential.totpPendingEnc,
                    totpLastStep: step,
                    totpEnabledAt: new Date().toISOString(),
                    recoveryCodes: recoveryCodes.map(hashRecoveryCode),
                };
                // The mask also lists the pending fields, which are therefore deleted.
                await patchServerDocument(`credentials/${email}`, enabledState, { updateFields: TWO_FACTOR_FIELDS, ...condition });
                await patchServerDocument(`users/${email}`, { twoFactorEnabled: true, twoFactorUpdatedAt: new Date() });
                // The plain recovery codes are shown exactly once.
                return json({ ...statusOf({ ...credential, ...enabledState }), recoveryCodes });
            }
            case "disable": {
                if (!enabled || !credential) return fail("not_enabled");
                if (credential.passwordHash && !(await verifyPassword(password, credential.passwordHash))) return fail("wrong_password");
                const check = await verifySecondFactor(email, credential, code);
                if (!check.ok) return fail("invalid_code");
                // Deletes every 2FA field (they are in the mask but not in the data).
                await patchServerDocument(`credentials/${email}`, {}, { updateFields: TWO_FACTOR_FIELDS });
                await patchServerDocument(`users/${email}`, { twoFactorEnabled: false, twoFactorUpdatedAt: new Date() });
                return json(statusOf({ passwordHash: credential.passwordHash }));
            }
            case "regenerate": {
                if (!enabled || !credential) return fail("not_enabled");
                const check = await verifySecondFactor(email, credential, code);
                if (!check.ok) return fail("invalid_code");
                const recoveryCodes = generateRecoveryCodes();
                await patchServerDocument(`credentials/${email}`, { recoveryCodes: recoveryCodes.map(hashRecoveryCode), recoveryCodesGeneratedAt: new Date() });
                return json({ ...statusOf({ ...credential, recoveryCodes }), recoveryCodes });
            }
            default:
                return fail("bad_request");
        }
    } catch (error) {
        if (isWriteConflict(error)) return fail("conflict");
        console.error("[2fa]", error instanceof Error ? error.message : error);
        return fail("unavailable");
    }
}
