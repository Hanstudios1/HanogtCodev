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
import type { AiEngineNote } from "@/lib/ai/engine";
import { readAiUsage, windowAfter, type AiUsage, type DayQuota, type LimitDetails, type QuotaKind, type UsageWindow } from "@/lib/ai/usage";
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

/** Replaces the day window of `quota`. */
function withDay(usage: AiUsage, quota: QuotaKind, day: UsageWindow): AiUsage {
    if (quota === "hanogt") return { ...usage, hanogt: { ...usage.hanogt, day } };
    if (quota === "own") return usage.own ? { ...usage, own: { ...usage.own, day } } : usage;
    return usage.api ? { ...usage, api: { ...usage.api, day } } : usage;
}

export type AiUsageHandle = {
    /** Signed in, so there is a usage to show. */
    available: boolean;
    usage: AiUsage | null;
    loading: boolean;
    failed: boolean;
    refresh: () => void;
    /** An answer's day window (from its headers). */
    applyQuota: (quota: DayQuota | undefined) => void;
    /** A daily limit refused a message: that window is full until it resets. */
    applyLimit: (limit: LimitDetails | undefined) => void;
    /** The advanced engine's window after an answer, or its allowance ran out (the standard engine answered). */
    applyEngine: (window: UsageWindow | undefined, note: AiEngineNote | undefined) => void;
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

    const applyQuota = useCallback((quota: DayQuota | undefined) => {
        if (!owner || !quota) return;
        if (snapshot.owner !== owner || !snapshot.usage) {
            void loadUsage(owner, true);
            return;
        }
        const window = quota.quota === "hanogt" ? snapshot.usage.hanogt.day : quota.quota === "own" ? snapshot.usage.own?.day : snapshot.usage.api?.day;
        // Own connections the stored usage doesn't know about (the plan changed): ask again.
        if (!window) {
            void loadUsage(owner, true);
            return;
        }
        setSnapshot({ ...snapshot, usage: withDay(snapshot.usage, quota.quota, windowAfter(window, quota)) });
    }, [owner]);

    const applyLimit = useCallback((limit: LimitDetails | undefined) => {
        if (!owner || !limit) return;
        if (snapshot.owner !== owner || !snapshot.usage || snapshot.usage.plan !== limit.plan) {
            void loadUsage(owner, true);
            return;
        }
        const full: UsageWindow = { limit: limit.limit, used: Math.max(limit.used, limit.limit), remaining: 0, resetsAt: limit.resetsAt };
        setSnapshot({ ...snapshot, usage: withDay(snapshot.usage, limit.quota, full) });
    }, [owner]);

    const applyEngine = useCallback((window: UsageWindow | undefined, note: AiEngineNote | undefined) => {
        if (!owner || (!window && note !== "quota")) return;
        if (snapshot.owner !== owner || !snapshot.usage) {
            void loadUsage(owner, true);
            return;
        }
        const engine = window ?? (snapshot.usage.engine ? { ...snapshot.usage.engine, used: Math.max(snapshot.usage.engine.used, snapshot.usage.engine.limit), remaining: 0 } : null);
        if (!engine) {
            void loadUsage(owner, true);
            return;
        }
        setSnapshot({ ...snapshot, usage: { ...snapshot.usage, engine } });
    }, [owner]);

    const mine = Boolean(owner) && current.owner === owner;
    const usage = mine ? current.usage : null;
    const loading = mine ? current.status === "loading" : Boolean(owner);
    const failed = mine && current.status === "error";
    return useMemo(() => ({ available: Boolean(owner), usage, loading, failed, refresh, applyQuota, applyLimit, applyEngine }), [owner, usage, loading, failed, refresh, applyQuota, applyLimit, applyEngine]);
}
