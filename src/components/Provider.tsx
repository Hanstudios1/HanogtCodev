"use client";

import { useEffect, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { signInWithCustomToken, signOut as signOutFirebase } from "firebase/auth";
import { auth, hasFirebaseClientConfig } from "@/lib/firebase";

function FirebaseSessionBridge({ children }: { children: React.ReactNode }) {
    const { status, data: session } = useSession();
    const email = session?.user?.email?.toLowerCase() || "";
    const identity = status === "authenticated" ? `user:${email}` : status;
    const [syncedIdentity, setSyncedIdentity] = useState<string | null>(null);
    const [failure, setFailure] = useState<{ identity: string; message: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const syncSession = async () => {
            if (status === "unauthenticated") {
                if (auth?.currentUser) await signOutFirebase(auth);
                if (!cancelled) setSyncedIdentity(identity);
                return;
            }
            if (status !== "authenticated" || !email) return;
            if (!hasFirebaseClientConfig || !auth) {
                throw new Error("Firebase istemci yapılandırması eksik veya geçersiz.");
            }
            const currentEmail = auth.currentUser?.getIdTokenResult
                ? (await auth.currentUser.getIdTokenResult()).claims.email
                : null;
            if (currentEmail === email) {
                if (!cancelled) setSyncedIdentity(identity);
                return;
            }
            const response = await fetch("/api/auth/firebase-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!response.ok) {
                throw new Error("Firebase yetkilendirmesi hazırlanamadı.");
            }
            const data = await response.json() as { token?: string };
            if (!cancelled && data.token) await signInWithCustomToken(auth, data.token);
            if (!data.token) throw new Error("Firebase yetkilendirme belirteci alınamadı.");
            if (!cancelled) setSyncedIdentity(identity);
        };
        syncSession().catch((error) => {
            if (!cancelled) setFailure({
                identity,
                message: error instanceof Error ? error.message : "Veri erişimi hazırlanamadı.",
            });
        });
        return () => { cancelled = true; };
    }, [status, email, identity]);

    if (failure?.identity === identity) {
        return <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-sm text-red-600 dark:bg-black dark:text-red-400" role="alert">{failure.message}</div>;
    }
    if (syncedIdentity !== identity) {
        return <div className="min-h-screen bg-white dark:bg-black" aria-label="Oturum hazırlanıyor" />;
    }
    return children;
}

export default function Provider({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <FirebaseSessionBridge>{children}</FirebaseSessionBridge>
        </SessionProvider>
    );
}
