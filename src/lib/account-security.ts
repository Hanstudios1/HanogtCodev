/**
 * The signed-in account's security at a glance (GET /api/account/security),
 * shown on the Security page: how it signs in, the password, two-step
 * verification and its recovery codes, and the last sign-in. Only facts and
 * their states live here; the page has the words.
 */

export interface AccountSecuritySummary {
    /** How the account was created: with Google or with e-mail and password; null when unknown. */
    provider: "google" | "credentials" | null;
    hasPassword: boolean;
    twoFactor: { enabled: boolean; recoveryCodesLeft: number };
    /** The last sign-in (ISO); null when none was recorded. */
    lastLoginAt: string | null;
    /** When this browser last proved who it is (ISO); null for a session from before that was recorded. */
    sessionSince: string | null;
}

export type SecurityCheckId = "password" | "twoFactor" | "recovery" | "sessions";
/** ok: in place; action: worth doing now; info: nothing to fix. */
export type SecurityCheckState = "ok" | "action" | "info";

export interface SecurityCheck {
    id: SecurityCheckId;
    state: SecurityCheckState;
}

/** Fewer recovery codes than this left: time to make new ones. */
export const LOW_RECOVERY_CODES = 3;

/**
 * The checks the page lists, in order. A Google account without a password
 * is fine as it is ("info"), but two-step verification here needs one, so
 * that check asks for an action either way until it is on.
 */
export function securityChecks(summary: AccountSecuritySummary): SecurityCheck[] {
    const checks: SecurityCheck[] = [
        { id: "password", state: summary.hasPassword ? "ok" : "info" },
        { id: "twoFactor", state: summary.twoFactor.enabled ? "ok" : "action" },
    ];
    if (summary.twoFactor.enabled) checks.push({ id: "recovery", state: summary.twoFactor.recoveryCodesLeft >= LOW_RECOVERY_CODES ? "ok" : "action" });
    checks.push({ id: "sessions", state: "info" });
    return checks;
}

/** Recommendations left to act on; 0 means the account is set up well. */
export function openActions(checks: SecurityCheck[]) {
    return checks.filter((check) => check.state === "action").length;
}

const isoOrNull = (value: unknown) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null);

/** Reads an answer of GET /api/account/security; null when it isn't one. */
export function readSecuritySummary(value: unknown): AccountSecuritySummary | null {
    if (!value || typeof value !== "object") return null;
    const data = value as Record<string, unknown>;
    const twoFactor = data.twoFactor && typeof data.twoFactor === "object" ? data.twoFactor as Record<string, unknown> : null;
    if (typeof data.hasPassword !== "boolean" || !twoFactor || typeof twoFactor.enabled !== "boolean") return null;
    const left = Number(twoFactor.recoveryCodesLeft);
    return {
        provider: data.provider === "google" || data.provider === "credentials" ? data.provider : null,
        hasPassword: data.hasPassword,
        twoFactor: { enabled: twoFactor.enabled, recoveryCodesLeft: twoFactor.enabled && Number.isInteger(left) && left > 0 ? Math.min(left, 99) : 0 },
        lastLoginAt: isoOrNull(data.lastLoginAt),
        sessionSince: isoOrNull(data.sessionSince),
    };
}
