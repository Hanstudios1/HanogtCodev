"use client";

/**
 * The account's Hanogt AI settings in this browser (GET/PUT /api/ai/settings),
 * shared by the chat and the settings page: loaded once per account, again
 * when the plan changes (the instruction limit grows or shrinks with it).
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { agentUserKey } from "@/lib/ai/agent-settings";
import type { AiSettings, AiSettingsResponse } from "@/lib/ai/ai-settings";
import { onPlanChange } from "@/lib/plan-signal";

const EVENT = "hanogt-ai:settings";

type Snapshot = { owner: string | null; data: AiSettingsResponse | null; status: "idle" | "loading" | "ready" | "error" };
const IDLE: Snapshot = { owner: null, data: null, status: "idle" };
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

function isResponse(value: unknown): value is AiSettingsResponse {
    return Boolean(value && typeof value === "object" && "settings" in value && typeof (value as AiSettingsResponse).instructionsLimit === "number");
}

async function loadSettings(owner: string, force = false) {
    const mine = snapshot.owner === owner;
    if (!force && mine && (snapshot.status === "loading" || snapshot.status === "ready")) return;
    setSnapshot({ owner, data: mine ? snapshot.data : null, status: "loading" });
    try {
        const response = await fetch("/api/ai/settings", { cache: "no-store" });
        const payload: unknown = await response.json().catch(() => null);
        if (snapshot.owner !== owner) return;
        setSnapshot(response.ok && isResponse(payload) ? { owner, data: payload, status: "ready" } : { ...snapshot, status: "error" });
    } catch {
        if (snapshot.owner === owner) setSnapshot({ ...snapshot, status: "error" });
    }
}

export type SaveResult = { ok: true } | { ok: false; code: string; field: string | null; limit: number | null };

export type AiSettingsHandle = {
    available: boolean;
    data: AiSettingsResponse | null;
    loading: boolean;
    failed: boolean;
    refresh: () => void;
    save: (settings: AiSettings) => Promise<SaveResult>;
};

export function useAiSettings(email: string | null): AiSettingsHandle {
    const owner = agentUserKey(email);
    const current = useSyncExternalStore(subscribe, readSnapshot, readIdle);

    useEffect(() => {
        if (owner) void loadSettings(owner);
    }, [owner]);
    useEffect(() => {
        if (!owner) return;
        return onPlanChange(() => void loadSettings(owner, true));
    }, [owner]);

    const refresh = useCallback(() => {
        if (owner) void loadSettings(owner, true);
    }, [owner]);

    const save = useCallback(async (settings: AiSettings): Promise<SaveResult> => {
        if (!owner) return { ok: false, code: "unauthorized", field: null, limit: null };
        try {
            const response = await fetch("/api/ai/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings }),
                cache: "no-store",
            });
            const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
            if (response.ok && isResponse(payload)) {
                setSnapshot({ owner, data: payload, status: "ready" });
                return { ok: true };
            }
            return {
                ok: false,
                code: typeof payload?.code === "string" ? payload.code : "network",
                field: typeof payload?.field === "string" ? payload.field : null,
                limit: typeof payload?.limit === "number" ? payload.limit : null,
            };
        } catch {
            return { ok: false, code: "network", field: null, limit: null };
        }
    }, [owner]);

    const mine = Boolean(owner) && current.owner === owner;
    const data = mine ? current.data : null;
    const loading = mine ? current.status === "loading" : Boolean(owner);
    const failed = mine && current.status === "error";
    return useMemo(() => ({ available: Boolean(owner), data, loading, failed, refresh, save }), [owner, data, loading, failed, refresh, save]);
}
