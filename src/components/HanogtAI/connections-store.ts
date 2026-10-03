"use client";

/**
 * The person's Hanogt AI connections in this browser: the list from
 * /api/ai/connections, shared by the /ai page, the floating panel and the
 * connections dialog (loaded again after a minute or after a change), and the
 * connection chosen on this device. The choice is kept in localStorage per
 * account (a hash, no e-mail address) and holds only the connection's id,
 * never a key.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { agentUserKey } from "@/lib/ai/agent-settings";
import { isConnectionId, isConnectionsState, type AiConnectionView, type AiConnectionsState } from "@/lib/ai/connections";
import { onPlanChange } from "@/lib/plan-signal";

const SELECTED_KEY = "hanogt-ai:connection:v1";
const EVENT = "hanogt-ai:connections";
const FRESH_MS = 60_000;

type ListSnapshot = { owner: string | null; state: AiConnectionsState | null; status: "idle" | "loading" | "ready" | "error"; loadedAt: number };

const IDLE: ListSnapshot = { owner: null, state: null, status: "idle", loadedAt: 0 };
const NO_ITEMS: AiConnectionView[] = [];
let list: ListSnapshot = IDLE;
/** The choice while localStorage is blocked (lasts for this visit). */
let memorySelection = "{}";

function emit() {
    window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
    const onStorage = (event: StorageEvent) => {
        if (event.key === SELECTED_KEY) listener();
    };
    window.addEventListener(EVENT, listener);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(EVENT, listener);
        window.removeEventListener("storage", onStorage);
    };
}

function setList(next: ListSnapshot) {
    list = next;
    emit();
}

const readList = () => list;
const readIdle = () => IDLE;

/** Loads the list of `owner` unless a fresh copy is there or on its way (`force` loads anyway). */
async function loadList(owner: string, force = false) {
    const mine = list.owner === owner;
    if (!force && mine && (list.status === "loading" || (list.status === "ready" && Date.now() - list.loadedAt < FRESH_MS))) return;
    setList({ owner, state: mine ? list.state : null, status: "loading", loadedAt: mine ? list.loadedAt : 0 });
    try {
        const response = await fetch("/api/ai/connections", { cache: "no-store" });
        const payload: unknown = await response.json().catch(() => null);
        if (list.owner !== owner) return;
        if (response.ok && isConnectionsState(payload)) setList({ owner, state: payload, status: "ready", loadedAt: Date.now() });
        else setList({ ...list, status: "error" });
    } catch {
        if (list.owner === owner) setList({ ...list, status: "error" });
    }
}

// ------------------------------------------------------------------ chosen connection
function readSelection(): string {
    try {
        return window.localStorage.getItem(SELECTED_KEY) ?? "{}";
    } catch {
        return memorySelection;
    }
}

const readNoSelection = () => "{}";

function parseSelection(raw: string): Record<string, string> {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const out: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (/^u[0-9a-z]{1,14}$/.test(key) && isConnectionId(value)) out[key] = value;
        }
        return out;
    } catch {
        return {};
    }
}

function storeSelection(owner: string, id: string | null) {
    const selection = parseSelection(readSelection());
    if (id) selection[owner] = id;
    else delete selection[owner];
    const raw = JSON.stringify(selection);
    try {
        window.localStorage.setItem(SELECTED_KEY, raw);
    } catch {
        // Storage blocked: the choice lasts for this visit.
        memorySelection = raw;
    }
    emit();
}

// ------------------------------------------------------------------ requests
export type ConnectionsRequestResult = { ok: true; data: Record<string, unknown> } | { ok: false; code: string; retryAfterSeconds?: number };

/** POST /api/ai/connections; `code` is the API's error code, or "network". */
export async function connectionsRequest(body: Record<string, unknown>): Promise<ConnectionsRequestResult> {
    try {
        const response = await fetch("/api/ai/connections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (response.ok && payload) return { ok: true, data: payload };
        return { ok: false, code: typeof payload?.code === "string" ? payload.code : "network", retryAfterSeconds: Number(response.headers.get("Retry-After")) || undefined };
    } catch {
        return { ok: false, code: "network" };
    }
}

// ------------------------------------------------------------------ hook
export type AiConnectionsHandle = {
    /** Signed in, so connections can be used and managed. */
    available: boolean;
    state: AiConnectionsState | null;
    loading: boolean;
    failed: boolean;
    items: AiConnectionView[];
    /** Where new messages go: a connection id, or null for Hanogt AI's own model. */
    selectedId: string | null;
    select: (id: string | null) => void;
    /** Loads the list again (e.g. after a connection failed). */
    refresh: () => void;
    /** Takes the list an add, update or delete returned. */
    apply: (state: AiConnectionsState) => void;
};

export function useAiConnections(email: string | null): AiConnectionsHandle {
    const owner = agentUserKey(email);
    const snapshot = useSyncExternalStore(subscribe, readList, readIdle);
    const selectionRaw = useSyncExternalStore(subscribe, readSelection, readNoSelection);

    useEffect(() => {
        if (owner) void loadList(owner);
    }, [owner]);

    // A new plan changes how many connections are on: read the list again at once.
    useEffect(() => {
        if (!owner) return;
        return onPlanChange(() => void loadList(owner, true));
    }, [owner]);

    const state = owner && snapshot.owner === owner ? snapshot.state : null;
    const items = state?.items ?? NO_ITEMS;
    const stored = owner ? parseSelection(selectionRaw)[owner] ?? null : null;
    // Until the list is known the stored choice is sent as it is (the server checks it);
    // afterwards a connection that is gone or not in the plan falls back to Hanogt AI.
    const selectedId = !stored ? null : state ? (items.some((item) => item.id === stored && item.active) ? stored : null) : stored;

    const select = useCallback((id: string | null) => {
        if (owner) storeSelection(owner, id);
    }, [owner]);
    const refresh = useCallback(() => {
        if (owner) void loadList(owner, true);
    }, [owner]);
    const apply = useCallback((next: AiConnectionsState) => {
        if (owner && isConnectionsState(next)) setList({ owner, state: next, status: "ready", loadedAt: Date.now() });
    }, [owner]);

    const mine = Boolean(owner) && snapshot.owner === owner;
    const loading = mine ? snapshot.status === "loading" : Boolean(owner);
    const failed = mine && snapshot.status === "error";
    return useMemo(() => ({ available: Boolean(owner), state, loading, failed, items, selectedId, select, refresh, apply }), [owner, state, loading, failed, items, selectedId, select, refresh, apply]);
}
