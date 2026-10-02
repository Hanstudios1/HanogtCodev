"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketItem } from "@/lib/news/markets";

/** The markets endpoint is cached for five minutes on the server, so polling faster would only repeat itself. */
export const MARKETS_REFRESH_MS = 5 * 60_000;

export interface MarketsState {
    items: MarketItem[];
    /** When the server assembled the snapshot (ISO 8601). */
    generatedAt: string | null;
    /** "error": nothing could be shown (the server has no quotes, or it was never reachable). */
    status: "loading" | "ready" | "error";
    refreshing: boolean;
    reload: () => void;
}

const UNITS = new Set(["TRY", "USD", "pts"]);

/** The payload is untrusted JSON: keep only entries the strip can render. */
function isMarketItem(value: unknown): value is MarketItem {
    const item = value as Partial<MarketItem> | null;
    return Boolean(item && typeof item === "object"
        && typeof item.id === "string" && typeof item.label === "string"
        && typeof item.value === "number" && Number.isFinite(item.value)
        && (item.change === null || (typeof item.change === "number" && Number.isFinite(item.change)))
        && (item.changePercent === null || (typeof item.changePercent === "number" && Number.isFinite(item.changePercent)))
        && typeof item.unit === "string" && UNITS.has(item.unit)
        && typeof item.source === "string" && typeof item.updatedAt === "string");
}

/**
 * Loads /api/news/markets and refreshes it every five minutes while the tab is visible (and as soon as
 * it becomes visible again after being hidden for longer than that). A failed refresh keeps the
 * previous quotes on screen; their own timestamps stay visible in the tooltips.
 */
export function useMarkets(): MarketsState {
    const [snapshot, setSnapshot] = useState<{ items: MarketItem[]; generatedAt: string | null }>({ items: [], generatedAt: null });
    const [status, setStatus] = useState<MarketsState["status"]>("loading");
    const [refreshing, setRefreshing] = useState(false);
    const loadRef = useRef<(() => Promise<void>) | null>(null);

    useEffect(() => {
        let disposed = false;
        let controller: AbortController | null = null;
        let lastLoad = 0;

        const load = async () => {
            controller?.abort();
            const current = new AbortController();
            controller = current;
            lastLoad = Date.now();
            setRefreshing(true);
            try {
                const response = await fetch("/api/news/markets", { cache: "no-store", signal: current.signal });
                const payload = await response.json() as { items?: unknown; generatedAt?: unknown };
                if (disposed || controller !== current) return;
                if (!response.ok || !Array.isArray(payload.items)) throw new Error("markets");
                const items = payload.items.filter(isMarketItem);
                setSnapshot({ items, generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : null });
                // An empty list means the server has nothing fresh enough to show: do not keep older quotes.
                setStatus(items.length ? "ready" : "error");
            } catch (reason) {
                if (disposed || (reason instanceof DOMException && reason.name === "AbortError")) return;
                setStatus((existing) => (existing === "ready" ? existing : "error"));
            } finally {
                if (!disposed && controller === current) setRefreshing(false);
            }
        };
        loadRef.current = load;

        const first = window.setTimeout(() => void load(), 0);
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void load();
        }, MARKETS_REFRESH_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible" && Date.now() - lastLoad > MARKETS_REFRESH_MS) void load();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            disposed = true;
            controller?.abort();
            window.clearTimeout(first);
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
            loadRef.current = null;
        };
    }, []);

    const reload = useCallback(() => void loadRef.current?.(), []);
    return { items: snapshot.items, generatedAt: snapshot.generatedAt, status, refreshing, reload };
}
