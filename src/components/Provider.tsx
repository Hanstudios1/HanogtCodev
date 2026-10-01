"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SessionContext, SessionProvider, useSession } from "next-auth/react";
import { signInWithCustomToken, signOut as signOutFirebase } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, firebaseClientDiagnostics, hasFirebaseClientConfig } from "@/lib/firebase";
import { ThemeProvider } from "@/lib/theme";

/**
 * Why the browser could not use Firestore/Storage. CloudStatusBanner turns the
 * code into a translated, actionable message (more detail for staff).
 */
export type FirebaseBridgeFailureCode =
    /** NEXT_PUBLIC_FIREBASE_* missing in this build. */
    | "config_missing"
    /** NEXT_PUBLIC_FIREBASE_API_KEY is not a web API key. */
    | "config_invalid"
    /** /api/auth/firebase-token answered 401: the NextAuth session is no longer valid. */
    | "session_expired"
    /** 403 from the token endpoint (cross-origin request). */
    | "bad_origin"
    /** 429 from the token endpoint. */
    | "rate_limited"
    /** 5xx from the token endpoint: the server could not mint a token (service account). */
    | "token_unavailable"
    /** The token endpoint could not be reached. */
    | "token_network"
    | "invalid_custom_token"
    | "custom_token_mismatch"
    /** Firebase Authentication was never set up for the project. */
    | "configuration_not_found"
    | "api_key_invalid"
    /** HTTP-referrer restriction of the API key (or an unauthorized domain). */
    | "referer_blocked"
    /** The API key may not call the Identity Toolkit API. */
    | "api_restricted"
    /** The Identity Toolkit API is disabled in the Google Cloud project. */
    | "api_disabled"
    | "network"
    | "too_many_requests"
    | "user_disabled"
    /** Signed in, but the deployed security rules refuse reading one's own profile. */
    | "permission_denied"
    | "unknown";

export type FirebaseBridgeFailure = {
    code: FirebaseBridgeFailureCode;
    /** Technical detail (Firebase error code / server message), shown to staff only. */
    message: string;
    /** HTTP status of the token endpoint, when it was the cause. */
    status?: number;
};

type FirebaseBridgeState = {
    /** True once Firestore/Storage calls are authorised for the current NextAuth identity. */
    ready: boolean;
    /** Technical reason when the data connection could not be prepared (kept for older callers). */
    error: string | null;
    failure: FirebaseBridgeFailure | null;
    retry: () => void;
};

const FirebaseBridgeContext = createContext<FirebaseBridgeState>({ ready: false, error: null, failure: null, retry: () => undefined });

export function useFirebaseBridge() {
    return useContext(FirebaseBridgeContext);
}

type RawSession = ReturnType<typeof useSession>;
const RawSessionContext = createContext<RawSession | null>(null);

/**
 * The NextAuth session as soon as it is known, without waiting for the
 * Firebase bridge. Use it for "who is signed in" UI (header, login redirects)
 * and for pages that load their data through API routes; keep useSession()
 * for anything that reads or writes Firestore directly.
 */
export function useRawSession(): RawSession {
    const raw = useContext(RawSessionContext);
    const gated = useSession();
    return raw ?? gated;
}

const RETRY_DELAYS_MS = [1_500, 5_000, 15_000];
/** sessionStorage: the e-mail whose security-rules probe already succeeded in this tab session. */
const RULES_PROBE_KEY = "hanogt_rules_probe_ok";

class BridgeError extends Error {
    failure: FirebaseBridgeFailure;

    constructor(failure: FirebaseBridgeFailure) {
        super(failure.message);
        this.name = "BridgeError";
        this.failure = failure;
    }
}

/** Maps Firebase Auth errors (codes are derived from Google's messages) to a failure code. */
function classifyAuthError(error: unknown): FirebaseBridgeFailure {
    const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    const text = `${code} ${message}`.toLowerCase();
    const failure = (kind: FirebaseBridgeFailureCode): FirebaseBridgeFailure => ({ code: kind, message: code && !message.includes(code) ? `${code}: ${message}` : message });
    if (code === "auth/invalid-custom-token" || text.includes("invalid_custom_token")) return failure("invalid_custom_token");
    if (code === "auth/custom-token-mismatch" || text.includes("credential_mismatch")) return failure("custom_token_mismatch");
    if (code === "auth/configuration-not-found" || text.includes("configuration_not_found")) return failure("configuration_not_found");
    if (code === "auth/invalid-api-key" || code.startsWith("auth/api-key-not-valid") || text.includes("api_key_invalid") || text.includes("api key not valid")) return failure("api_key_invalid");
    if (/requests-to-this-api-.*-are-blocked/.test(code) || text.includes("api_key_service_blocked")) return failure("api_restricted");
    if (/requests-from-referer-.*-are-blocked/.test(code) || code === "auth/unauthorized-domain" || text.includes("referrer_blocked") || text.includes("referer")) return failure("referer_blocked");
    if (text.includes("has-not-been-used") || text.includes("service_disabled") || text.includes("it-is-disabled")) return failure("api_disabled");
    if (code === "auth/network-request-failed") return failure("network");
    if (code === "auth/too-many-requests" || code === "auth/quota-exceeded") return failure("too_many_requests");
    if (code === "auth/user-disabled") return failure("user_disabled");
    return failure("unknown");
}

async function currentFirebaseEmail() {
    if (!auth) return null;
    // Firebase restores the persisted user asynchronously. Reading
    // `currentUser` before this resolves made every page load mint a new
    // custom token, which quickly exhausted the server-side token quota.
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return null;
    try {
        const token = await user.getIdTokenResult();
        return typeof token.claims.email === "string" ? token.claims.email.toLowerCase() : null;
    } catch {
        return null;
    }
}

async function fetchCustomToken() {
    let response: Response;
    try {
        response = await fetch("/api/auth/firebase-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
        });
    } catch (error) {
        throw new BridgeError({ code: "token_network", message: error instanceof Error ? error.message : "fetch failed" });
    }
    const data = await response.json().catch(() => ({})) as { token?: string; error?: string };
    if (response.ok && data.token) return data.token;
    const code: FirebaseBridgeFailureCode = response.status === 401 ? "session_expired"
        : response.status === 403 ? "bad_origin"
            : response.status === 429 ? "rate_limited"
                : "token_unavailable";
    throw new BridgeError({ code, message: typeof data.error === "string" ? data.error.slice(0, 300) : "", status: response.status });
}

async function signInFirebase(email: string) {
    if (!hasFirebaseClientConfig || !auth) {
        const missing = firebaseClientDiagnostics.missing.join(", ");
        throw new BridgeError(firebaseClientDiagnostics.issue === "invalid_api_key"
            ? { code: "config_invalid", message: "NEXT_PUBLIC_FIREBASE_API_KEY" }
            : { code: "config_missing", message: missing || "NEXT_PUBLIC_FIREBASE_*" });
    }
    if (await currentFirebaseEmail() === email) return;
    const token = await fetchCustomToken();
    try {
        await signInWithCustomToken(auth, token);
    } catch (error) {
        throw new BridgeError(classifyAuthError(error));
    }
}

/**
 * Reading one's own users/{email} is allowed by every deployed version of
 * firestore.rules, so a permission error here means the rules were never
 * deployed or are outdated. Checked once per tab session and e-mail.
 */
async function probeSecurityRules(email: string): Promise<FirebaseBridgeFailure | null> {
    try {
        if (window.sessionStorage.getItem(RULES_PROBE_KEY) === email) return null;
    } catch {
        // Storage blocked: probe every time.
    }
    try {
        await getDoc(doc(db, "users", email));
    } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === "permission-denied") return { code: "permission_denied", message: error instanceof Error ? error.message.slice(0, 300) : "permission-denied" };
        // Offline or unavailable: nothing to report here.
        return null;
    }
    try {
        window.sessionStorage.setItem(RULES_PROBE_KEY, email);
    } catch {
        // Ignore.
    }
    return null;
}

const PRESENCE_HEARTBEAT_MS = 45_000;

/**
 * Keeps the signed-in user's presence fresh on every page, including the
 * full-screen editor, chat and game engine that do not render the header.
 * Friends lists treat a user as online while `lastSeenAt` is recent.
 */
function PresenceHeartbeat() {
    const { data } = useSession();
    const { ready } = useFirebaseBridge();
    const email = data?.user?.email?.toLowerCase() || null;

    useEffect(() => {
        // Without a Firebase sign-in every write would be rejected by the security rules.
        if (!email || !ready) return;
        const write = (isOnline: boolean) => {
            const presence = { isOnline, lastSeenAt: new Date().toISOString() };
            void setDoc(doc(db, "users", email), presence, { merge: true }).catch(() => undefined);
            void setDoc(doc(db, "public_profiles", email), { ...presence, email }, { merge: true }).catch(() => undefined);
        };
        write(true);
        const heartbeat = window.setInterval(() => write(true), PRESENCE_HEARTBEAT_MS);
        const markOffline = () => write(false);
        window.addEventListener("pagehide", markOffline);
        return () => {
            window.clearInterval(heartbeat);
            window.removeEventListener("pagehide", markOffline);
        };
    }, [email, ready]);

    return null;
}

/**
 * Bridges the NextAuth session to Firebase so Firestore security rules can
 * authorise client reads/writes. Children always render (so pages keep their
 * server-rendered content); `useSession()` only reports "authenticated" once
 * Firebase is ready, which keeps Firestore listeners from firing too early.
 * Failures are exposed through useFirebaseBridge() and shown by
 * CloudStatusBanner, which lives inside the I18nProvider.
 */
function FirebaseSessionBridge({ children }: { children: React.ReactNode }) {
    const session = useSession();
    const { status, update } = session;
    const email = session.data?.user?.email?.toLowerCase() || "";
    const identity = status === "authenticated" ? `user:${email}` : status;
    const [syncedIdentity, setSyncedIdentity] = useState<string | null>(null);
    const [failure, setFailure] = useState<{ identity: string; failure: FirebaseBridgeFailure } | null>(null);
    const [attempt, setAttempt] = useState(0);

    // next-auth re-fetches the session on every tab focus and returns a new
    // object (with a fresh `expires`). Keep the reference stable while the
    // user data is unchanged so effects keyed on the session do not re-run.
    const userKey = JSON.stringify(session.data?.user ?? null);
    const sessionData = session.data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stableData = useMemo(() => sessionData, [userKey, status]);

    useEffect(() => {
        let cancelled = false;
        let retryTimer: number | undefined;
        const sync = async () => {
            if (status === "loading") return;
            if (status === "unauthenticated") {
                if (auth) {
                    await auth.authStateReady().catch(() => undefined);
                    if (auth.currentUser) await signOutFirebase(auth).catch(() => undefined);
                }
                if (!cancelled) setSyncedIdentity(identity);
                return;
            }
            if (!email) return;
            try {
                await signInFirebase(email);
                if (cancelled) return;
                setSyncedIdentity(identity);
                const denied = await probeSecurityRules(email);
                if (!cancelled) setFailure(denied ? { identity, failure: denied } : null);
            } catch (error) {
                if (cancelled) return;
                const reason = error instanceof BridgeError ? error.failure : classifyAuthError(error);
                setFailure({ identity, failure: reason });
                // Never lock the interface: pages that do not need Firestore
                // keep working and the bridge retries in the background.
                setSyncedIdentity(identity);
                // Retrying cannot fix a missing configuration.
                const permanent = reason.code === "config_missing" || reason.code === "config_invalid";
                const delay = permanent ? undefined : RETRY_DELAYS_MS[attempt];
                if (delay !== undefined) retryTimer = window.setTimeout(() => setAttempt((value) => value + 1), delay);
            }
        };
        void sync();
        return () => {
            cancelled = true;
            if (retryTimer) window.clearTimeout(retryTimer);
        };
    }, [attempt, email, identity, status]);

    const ready = syncedIdentity === identity && status !== "loading";
    const bridgeFailure = failure?.identity === identity ? failure.failure : null;
    const retry = useCallback(() => setAttempt((value) => value + 1), []);

    const gatedValue = useMemo(() => {
        if (status === "authenticated" && stableData && ready) {
            return { data: stableData, status: "authenticated" as const, update };
        }
        if (status === "unauthenticated") return { data: null, status: "unauthenticated" as const, update };
        return { data: null, status: "loading" as const, update };
    }, [ready, stableData, status, update]);

    const bridgeState = useMemo<FirebaseBridgeState>(() => ({
        ready: ready && !bridgeFailure,
        error: bridgeFailure ? bridgeFailure.message || bridgeFailure.code : null,
        failure: bridgeFailure,
        retry,
    }), [bridgeFailure, ready, retry]);

    return (
        <FirebaseBridgeContext.Provider value={bridgeState}>
            <RawSessionContext.Provider value={session}>
                <SessionContext.Provider value={gatedValue}>
                    {children}
                    <PresenceHeartbeat />
                </SessionContext.Provider>
            </RawSessionContext.Provider>
        </FirebaseBridgeContext.Provider>
    );
}

export default function Provider({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <SessionProvider refetchOnWindowFocus={false} refetchInterval={15 * 60}>
                <FirebaseSessionBridge>{children}</FirebaseSessionBridge>
            </SessionProvider>
        </ThemeProvider>
    );
}
