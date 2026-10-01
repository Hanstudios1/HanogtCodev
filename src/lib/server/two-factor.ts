import "server-only";

import { isWriteConflict, patchServerDocument } from "./firebase-rest";
import { consumeRecoveryCode, decryptSecret, verifyTotp } from "./totp";

/** Server-only `credentials/{email}` document (never readable by clients). */
export type CredentialRecord = {
    passwordHash?: string;
    totpEnabled?: boolean;
    totpSecretEnc?: string;
    totpLastStep?: number;
    totpPendingEnc?: string;
    totpPendingAt?: number;
    totpEnabledAt?: string;
    recoveryCodes?: string[];
    _updateTime?: string;
};

/** Fields cleared when two-factor sign-in is switched off. */
export const TWO_FACTOR_FIELDS = ["totpEnabled", "totpSecretEnc", "totpLastStep", "totpPendingEnc", "totpPendingAt", "totpEnabledAt", "recoveryCodes"];

export type SecondFactorResult =
    | { ok: true; method: "totp" | "recovery"; recoveryCodesLeft: number }
    | { ok: false };

/**
 * Checks a second factor, either a 6-digit authenticator code or a recovery
 * code, and records its use. The write is conditioned on the version of the
 * credential that was read, so one code cannot be spent by two parallel
 * requests: the loser of the race is rejected like a wrong code.
 */
export async function verifySecondFactor(email: string, credential: CredentialRecord, input: string): Promise<SecondFactorResult> {
    if (!credential.totpEnabled || !credential.totpSecretEnc) return { ok: false };
    const value = input.trim().slice(0, 64);
    const condition = credential._updateTime ? { updateTime: credential._updateTime } : {};
    const codes = Array.isArray(credential.recoveryCodes) ? credential.recoveryCodes.filter((code): code is string => typeof code === "string") : [];
    try {
        if (/^\d{3}\s?\d{3}$/.test(value)) {
            let secret: string;
            try {
                secret = decryptSecret(credential.totpSecretEnc);
            } catch {
                // A rotated server secret makes the stored key unreadable; recovery codes still work.
                return { ok: false };
            }
            const step = verifyTotp(secret, value, typeof credential.totpLastStep === "number" ? credential.totpLastStep : -1);
            if (step === null) return { ok: false };
            await patchServerDocument(`credentials/${email}`, { totpLastStep: step, totpLastUsedAt: new Date() }, condition);
            return { ok: true, method: "totp", recoveryCodesLeft: codes.length };
        }
        const remaining = consumeRecoveryCode(codes, value);
        if (!remaining) return { ok: false };
        await patchServerDocument(`credentials/${email}`, { recoveryCodes: remaining, recoveryCodeUsedAt: new Date() }, condition);
        return { ok: true, method: "recovery", recoveryCodesLeft: remaining.length };
    } catch (error) {
        if (isWriteConflict(error)) return { ok: false };
        throw error;
    }
}
