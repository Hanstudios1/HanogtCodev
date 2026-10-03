import "server-only";

import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerDocument } from "./firebase-rest";

export type ActiveUser = {
    banned?: boolean;
    suspended?: boolean;
    securityResearchConsent?: boolean;
    friends?: string[];
    /** "credentials" for a password sign-up, "google" for an account created with Google. */
    provider?: unknown;
    /** First Google sign-in that confirmed the address (Google's email_verified). */
    emailVerifiedAt?: unknown;
    /** Hanogt AI settings (src/lib/ai/ai-settings.ts), written only by /api/ai/settings. */
    aiSettings?: unknown;
};

export type ActiveSession = { session: Session; email: string; user: ActiveUser };

/**
 * The signed-in account, told apart from "couldn't check": "none" (signed
 * out, or the account is gone, banned or suspended) and "error" (the session
 * or the database couldn't be read). Billing routes answer "error" with 503
 * so a database hiccup right after a payment doesn't look like a sign-out.
 */
export async function getActiveSessionState(): Promise<{ state: "active"; active: ActiveSession } | { state: "none" } | { state: "error" }> {
    let email: string | undefined;
    let session: Session | null;
    try {
        session = await getServerSession(authOptions);
        email = session?.user?.email?.toLowerCase();
    } catch {
        // Missing/invalid auth configuration fails closed.
        return { state: "none" };
    }
    if (!session || !email) return { state: "none" };
    try {
        const user = await getServerDocument<ActiveUser>(`users/${email}`);
        if (!user || user.banned || user.suspended) return { state: "none" };
        return { state: "active", active: { session, email, user } };
    } catch {
        return { state: "error" };
    }
}

export async function getActiveSession() {
    // Missing/invalid auth or database configuration must fail closed and
    // must not turn an anonymous request into an internal-error response.
    const result = await getActiveSessionState().catch(() => ({ state: "error" as const }));
    return result.state === "active" ? result.active : null;
}

/** The account's address is verified: it signed in with Google (which confirmed it) or was created with Google. */
export function hasVerifiedEmail(user: ActiveUser | null | undefined) {
    return Boolean(user && (user.emailVerifiedAt || user.provider === "google"));
}
