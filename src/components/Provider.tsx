"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SessionContext, SessionProvider, useSession } from "next-auth/react";
import { signInWithCustomToken, signOut as signOutFirebase } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { auth, db, hasFirebaseClientConfig } from "@/lib/firebase";
import { ThemeProvider } from "@/lib/theme";

type FirebaseBridgeState = {
    /** True once Firestore/Storage calls are authorised for the current NextAuth identity. */
    ready: boolean;
    /** Human readable reason when the data connection could not be prepared. */
    error: string | null;
    retry: () => void;
};

const FirebaseBridgeContext = createContext<FirebaseBridgeState>({ ready: false, error: null, retry: () => undefined });

export function useFirebaseBridge() {
    return useContext(FirebaseBridgeContext);
}

const RETRY_DELAYS_MS = [1_500, 5_000, 15_000];

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

async function signInFirebase(email: string) {
    if (!hasFirebaseClientConfig || !auth) {
        throw new Error("Veri bağlantısı yapılandırılmamış. Yönetici Firebase istemci ayarlarını kontrol etmeli.");
    }
    if (await currentFirebaseEmail() === email) return;
    const response = await fetch("/api/auth/firebase-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
    });
    const data = await response.json().catch(() => ({})) as { token?: string; error?: string };
    if (!response.ok || !data.token) {
        throw new Error(data.error || "Veri bağlantısı hazırlanamadı.");
    }
    await signInWithCustomToken(auth, data.token);
}

const PRESENCE_HEARTBEAT_MS = 45_000;

/**
 * Keeps the signed-in user's presence fresh on every page, including the
 * full-screen editor, chat and game engine that do not render the header.
 * Friends lists treat a user as online while `lastSeenAt` is recent.
 */
function PresenceHeartbeat() {
    const { data } = useSession();
    const email = data?.user?.email?.toLowerCase() || null;

    useEffect(() => {
        if (!email) return;
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
    }, [email]);

    return null;
}

/**
 * Bridges the NextAuth session to Firebase so Firestore security rules can
 * authorise client reads/writes. Children always render (so pages keep their
 * server-rendered content); `useSession()` only reports "authenticated" once
 * Firebase is ready, which keeps Firestore listeners from firing too early.
 */
function FirebaseSessionBridge({ children }: { children: React.ReactNode }) {
    const session = useSession();
    const { status, update } = session;
    const email = session.data?.user?.email?.toLowerCase() || "";
    const identity = status === "authenticated" ? `user:${email}` : status;
    const [syncedIdentity, setSyncedIdentity] = useState<string | null>(null);
    const [failure, setFailure] = useState<{ identity: string; message: string } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [dismissed, setDismissed] = useState(false);

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
                if (!cancelled) {
                    setFailure(null);
                    setSyncedIdentity(identity);
                }
            } catch (error) {
                if (cancelled) return;
                const message = error instanceof Error ? error.message : "Veri bağlantısı hazırlanamadı.";
                setFailure({ identity, message });
                // Never lock the interface: pages that do not need Firestore
                // keep working and the bridge retries in the background.
                setSyncedIdentity(identity);
                const delay = RETRY_DELAYS_MS[attempt];
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
    const bridgeError = failure?.identity === identity ? failure.message : null;
    const retry = useCallback(() => {
        setDismissed(false);
        setAttempt((value) => value + 1);
    }, []);

    const gatedValue = useMemo(() => {
        if (status === "authenticated" && stableData && ready) {
            return { data: stableData, status: "authenticated" as const, update };
        }
        if (status === "unauthenticated") return { data: null, status: "unauthenticated" as const, update };
        return { data: null, status: "loading" as const, update };
    }, [ready, stableData, status, update]);

    const bridgeState = useMemo<FirebaseBridgeState>(() => ({ ready: ready && !bridgeError, error: bridgeError, retry }), [bridgeError, ready, retry]);

    return (
        <FirebaseBridgeContext.Provider value={bridgeState}>
            <SessionContext.Provider value={gatedValue}>
                {children}
                <PresenceHeartbeat />
                {bridgeError && !dismissed && (
                    <div role="status" className="fixed inset-x-3 bottom-3 z-[200] mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/95 p-3 text-sm text-amber-900 shadow-2xl backdrop-blur dark:border-amber-500/30 dark:bg-zinc-900/95 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <p className="min-w-0 flex-1 leading-5"><strong className="font-semibold">Bulut verilerine bağlanılamadı.</strong> {bridgeError} Yerel özellikler çalışmaya devam eder.</p>
                        <button type="button" onClick={retry} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-amber-100 dark:hover:bg-zinc-800"><RefreshCw className="h-3.5 w-3.5" />Tekrar dene</button>
                        <button type="button" onClick={() => setDismissed(true)} aria-label="Uyarıyı kapat" className="rounded-lg p-1 hover:bg-amber-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
                    </div>
                )}
            </SessionContext.Provider>
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
