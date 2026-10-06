"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useAdminResource } from "./hooks";
import type { AdminCountersResponse } from "./types";

/*
 * The side bar's counters, kept live: read when the panel opens, every minute
 * while the tab is visible, when the window gets focus again, and right after
 * a section changes something they count (sections call `refresh`).
 */

type CountersValue = { counters: AdminCountersResponse | null; refresh: () => void };

const CountersContext = createContext<CountersValue>({ counters: null, refresh: () => undefined });

const POLL_MS = 60_000;

export function CountersProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
    const resource = useAdminResource<AdminCountersResponse>(enabled ? "/api/admin/counters" : null);
    const { reload } = resource;

    useEffect(() => {
        if (!enabled) return;
        const visible = () => document.visibilityState === "visible";
        const onVisible = () => { if (visible()) reload(); };
        const timer = window.setInterval(() => { if (visible()) reload(); }, POLL_MS);
        window.addEventListener("focus", onVisible);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", onVisible);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [enabled, reload]);

    const refresh = useCallback(() => reload(), [reload]);
    const value = useMemo(() => ({ counters: resource.data, refresh }), [resource.data, refresh]);
    return <CountersContext.Provider value={value}>{children}</CountersContext.Provider>;
}

export function useCounters() {
    return useContext(CountersContext);
}
