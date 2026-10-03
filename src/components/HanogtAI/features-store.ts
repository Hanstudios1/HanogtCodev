"use client";

/**
 * Which features the team opened for the person in this tab (GET
 * /api/features: off, staff, early access for Pro and staff, everyone).
 * Loaded once per account and again when the plan changes
 * (src/lib/plan-signal.ts); in memory only. The routes behind a feature check
 * it again themselves, so this only decides what is shown.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useRawSession } from "@/components/Provider";
import type { FeatureId, FeaturesResponse } from "@/lib/features";
import { onPlanChange } from "@/lib/plan-signal";

const EVENT = "hanogt:features";

type Snapshot = { owner: string | null; features: Record<FeatureId, boolean> | null };

const EMPTY: Snapshot = { owner: null, features: null };
let snapshot: Snapshot = EMPTY;
let loading: string | null = null;

function subscribe(listener: () => void) {
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
}

const readSnapshot = () => snapshot;
const readEmpty = () => EMPTY;

/** Loads what is open to `owner` (an address, or "" signed out) unless it is already loaded or on its way. */
async function load(owner: string, force = false) {
    if (loading === owner || (!force && snapshot.owner === owner && snapshot.features)) return;
    loading = owner;
    try {
        const response = await fetch("/api/features", { cache: "no-store", credentials: "same-origin" });
        const data = response.ok ? await response.json() as FeaturesResponse : null;
        if (data?.features && typeof data.features === "object") {
            snapshot = { owner, features: data.features };
            window.dispatchEvent(new Event(EVENT));
        }
    } catch {
        // Nothing is shown until it can be read; the next mount asks again.
    } finally {
        if (loading === owner) loading = null;
    }
}

/** Whether `id` is open to the person in this tab (false while unknown). */
export function useFeature(id: FeatureId): boolean {
    const { data, status } = useRawSession();
    const owner = status === "loading" ? null : (data?.user?.email ?? "").toLowerCase();
    const current = useSyncExternalStore(subscribe, readSnapshot, readEmpty);

    useEffect(() => {
        if (owner === null) return;
        void load(owner);
        return onPlanChange(() => void load(owner, true));
    }, [owner]);

    return owner !== null && current.owner === owner && current.features?.[id] === true;
}
