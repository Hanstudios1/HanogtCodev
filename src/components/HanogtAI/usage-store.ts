"use client";

/**
 * The person's Hanogt AI usage in this browser (GET /api/ai/usage), shared by
 * the /ai page, the floating panel and the model picker. It is loaded when
 * first needed and again after a minute, when the tab comes back or the plan
 * changes (src/lib/plan-signal.ts); every answer updates it from its headers
 * without another request. Kept per account (agentUserKey), in memory only.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { agentUserKey } from "@/lib/ai/agent-settings";
import { readAiUsage, windowAfter, type AiUsage, type LimitDetails, type UsageWindow, type WindowQuota } from "@/lib/ai/usage";
import { onPlanChange } from "@/lib/plan-signal";

const EVENT = "hanogt-ai:usage";
const FRESH_MS = 60_000;

type Snapshot = { owner: string | null; usage: AiUsage | null; status: "idle" | "loading" | "ready" | "error"; loadedAt: number };

const IDLE: Snapshot = { owner: null, usage: null, status: "idle", loadedAt: 0 };
let snapshot: Snapshot = IDLE;

function subscribe(listener: () => void) {
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
}

function setSnapshot(next: Snapshot) {
    snapshot = next;
    window.dispatchEvent(new Event(EVENT));
}

const readSnapshot = () => snapshot;
const readIdle = () => IDLE;

/** Loads the usage of `owner` unless a fresh copy is there or on its way (`force` loads anyway). */
async function loadUsage(owner: string, force = false) {
    const mine = snapshot.owner === owner;
    if (!force && mine && (snapshot.status === "loading" || (snapshot.status === "ready" && Date.now() - snapshot.loadedAt < FRESH_MS))) return;
    setSnapshot({ owner, usage: mine ? snapshot.usage : null, status: "loading", loadedAt: mine ? snapshot.loadedAt : 0 });
    try {
        const response = await fetch("/api/ai/usage", { cache: "no-store" });
        const usage = response.ok ? readAiUsage(await response.json().catch(() => null)) : null;
        if (snapshot.owner !== owner) return;
        setSnapshot(usage ? { owner, usage, status: "ready", loadedAt: Date.now() } : { ...snapshot, status: "error" });
    } catch {
        if (snapshot.owner === owner) setSnapshot({ ...snapshot, status: "error" });
    }
}

/** Replaces Hanogt AI's plan window (every message counts in it, own connections included). */
function withWindow(usage: AiUsage, window: UsageWindow): AiUsage {
    return { ...usage, hanogt: { ...usage.hanogt, window } };
}

export type AiUsageHandle = {
    /** Signed in, so there is a usage to show. */
    available: boolean;
    usage: AiUsage | null;
    loading: boolean;
    failed: boolean;
    refresh: () => void;
    /** An answer's window (from its headers). */
    applyQuota: (quota: WindowQuota | undefined) => void;
    /** A limit refused a message: that window is full until it resets. */
    applyLimit: (limit: LimitDetails | undefined) => void;
};

export function useAiUsage(email: string | null): AiUsageHandle {
    const owner = agentUserKey(email);
    const current = useSyncExternalStore(subscribe, readSnapshot, readIdle);

    useEffect(() => {
        if (owner) void loadUsage(owner);
    }, [owner]);

    // Back on the tab (messages from another tab or device) or a new plan: read it again.
    useEffect(() => {
        if (!owner) return;
        const onVisible = () => {
            if (document.visibilityState === "visible") void loadUsage(owner);
        };
        document.addEventListener("visibilitychange", onVisible);
        const stop = onPlanChange(() => void loadUsage(owner, true));
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            stop();
        };
    }, [owner]);

    const refresh = useCallback(() => {
        if (owner) void loadUsage(owner, true);
    }, [owner]);

    const applyQuota = useCallback((quota: WindowQuota | undefined) => {
        if (!owner || !quota) return;
        if (snapshot.owner !== owner || !snapshot.usage) {
            void loadUsage(owner, true);
            return;
        }
        // A window of another length (the plan changed): ask again.
        if (quota.windowDays !== snapshot.usage.hanogt.windowDays) {
            void loadUsage(owner, true);
            return;
        }
        setSnapshot({ ...snapshot, usage: withWindow(snapshot.usage, windowAfter(snapshot.usage.hanogt.window, quota)) });
    }, [owner]);

    const applyLimit = useCallback((limit: LimitDetails | undefined) => {
        if (!owner || !limit) return;
        if (snapshot.owner !== owner || !snapshot.usage || snapshot.usage.plan !== limit.plan) {
            void loadUsage(owner, true);
            return;
        }
        const full: UsageWindow = { limit: limit.limit, used: Math.max(limit.used, limit.limit), remaining: 0, resetsAt: limit.resetsAt };
        setSnapshot({ ...snapshot, usage: withWindow(snapshot.usage, full) });
    }, [owner]);

    const mine = Boolean(owner) && current.owner === owner;
    const usage = mine ? current.usage : null;
    const loading = mine ? current.status === "loading" : Boolean(owner);
    const failed = mine && current.status === "error";
    return useMemo(() => ({ available: Boolean(owner), usage, loading, failed, refresh, applyQuota, applyLimit }), [owner, usage, loading, failed, refresh, applyQuota, applyLimit]);
}
