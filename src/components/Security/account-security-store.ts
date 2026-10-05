"use client";

/**
 * The signed-in account's security summary (GET /api/account/security),
 * shared by everything that shows it (the Security page's card, Account
 * Settings' card and recent sign-ins) so one request serves them all, and
 * read again whenever a password, two-step verification or the sessions
 * change ("hanogt:account-security-changed").
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { readSecuritySummary, type AccountSecuritySummary } from "@/lib/account-security";

export type SecurityLoad = { state: "loading" } | { state: "ready"; summary: AccountSecuritySummary } | { state: "failed" } | { state: "signedOut" };

const CHANGED = "hanogt:account-security-changed";
const LOADING: SecurityLoad = { state: "loading" };

let current: { owner: string | null; load: SecurityLoad } = { owner: null, load: LOADING };
let inflight: { owner: string; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function set(owner: string | null, load: SecurityLoad) {
    current = { owner, load };
    listeners.forEach((listener) => listener());
}

function fetchSummary(owner: string) {
    if (inflight?.owner === owner) return inflight.promise;
    const promise = fetch("/api/account/security", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(async (response): Promise<SecurityLoad> => {
            if (response.status === 401) return { state: "signedOut" };
            const summary = response.ok ? readSecuritySummary(await response.json().catch(() => null)) : null;
            return summary ? { state: "ready", summary } : { state: "failed" };
        })
        .catch((): SecurityLoad => ({ state: "failed" }))
        .then((load) => {
            // A newer request (another account, a change) owns the answer now.
            if (inflight?.promise === promise) inflight = null;
            if (current.owner === owner) set(owner, load);
        });
    inflight = { owner, promise };
    return promise;
}

/** Tells every security view that the account's security changed (password, 2FA, sessions). */
export function announceAccountSecurityChange() {
    window.dispatchEvent(new Event(CHANGED));
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** The summary for `owner` (the signed-in e-mail; null while unknown or signed out). */
export function useAccountSecurity(owner: string | null) {
    const snapshot = useSyncExternalStore(subscribe, () => current, () => current);
    const load: SecurityLoad = owner && snapshot.owner === owner ? snapshot.load : LOADING;

    useEffect(() => {
        if (!owner) return;
        if (current.owner !== owner) {
            inflight = null;
            current = { owner, load: LOADING };
        }
        if (current.load.state === "loading") void fetchSummary(owner);
        const onChange = () => {
            inflight = null;
            void fetchSummary(owner);
        };
        window.addEventListener(CHANGED, onChange);
        return () => window.removeEventListener(CHANGED, onChange);
    }, [owner]);

    const retry = useCallback(() => {
        if (!owner) return;
        inflight = null;
        set(owner, LOADING);
        void fetchSummary(owner);
    }, [owner]);

    return { load, retry };
}
