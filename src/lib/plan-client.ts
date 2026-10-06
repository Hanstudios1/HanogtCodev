"use client";

/**
 * The signed-in person's plan as the browser knows it (GET /api/plans/me), for
 * limits the browser applies itself, such as how many files the editor runs
 * at once. Free until it is known; read again when the plan changes
 * (src/lib/plan-signal.ts) or the tab comes back after a while. The server
 * checks its own limits whatever the browser thinks.
 */
import { useEffect, useSyncExternalStore } from "react";
import { onPlanChange } from "@/lib/plan-signal";
import { isPlanId, type PlanId } from "@/lib/plans";

const EVENT = "hanogt:my-plan";
const FRESH_MS = 5 * 60_000;

type Snapshot = { owner: string | null; plan: PlanId; loadedAt: number; loading: boolean };
const EMPTY: Snapshot = { owner: null, plan: "free", loadedAt: 0, loading: false };
let snapshot: Snapshot = EMPTY;

function subscribe(listener: () => void) {
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
}

function setSnapshot(next: Snapshot) {
    snapshot = next;
    window.dispatchEvent(new Event(EVENT));
}

async function load(owner: string, force = false) {
    const mine = snapshot.owner === owner;
    if (!force && mine && (snapshot.loading || Date.now() - snapshot.loadedAt < FRESH_MS)) return;
    setSnapshot({ owner, plan: mine ? snapshot.plan : "free", loadedAt: mine ? snapshot.loadedAt : 0, loading: true });
    try {
        const response = await fetch("/api/plans/me", { cache: "no-store", credentials: "same-origin" });
        const data = response.ok ? await response.json().catch(() => null) as { plan?: unknown } | null : null;
        if (snapshot.owner !== owner) return;
        setSnapshot({ owner, plan: isPlanId(data?.plan) ? data.plan : snapshot.plan, loadedAt: Date.now(), loading: false });
    } catch {
        if (snapshot.owner === owner) setSnapshot({ ...snapshot, loading: false });
    }
}

/** The plan of `email` (null: signed out, Free). */
export function useMyPlan(email: string | null | undefined): PlanId {
    const owner = email ? email.toLowerCase() : null;
    const current = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);

    useEffect(() => {
        if (!owner) return;
        void load(owner);
        const onVisible = () => {
            if (document.visibilityState === "visible") void load(owner);
        };
        document.addEventListener("visibilitychange", onVisible);
        const stop = onPlanChange(() => void load(owner, true));
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            stop();
        };
    }, [owner]);

    return owner && current.owner === owner ? current.plan : "free";
}
