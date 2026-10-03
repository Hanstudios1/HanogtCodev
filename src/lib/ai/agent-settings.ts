"use client";

/**
 * Hanogt AI agent settings in this browser. The mode is a preference
 * (localStorage). "Always allow in this session" grants live in
 * sessionStorage, so they end with the tab, and are keyed by a hash of the
 * signed-in account, so another account in the same tab never inherits them.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_AGENT_MODE, isAgentMode, isAgentToolName, type AgentMode, type AgentToolName } from "./agent-tools";
import { fnv1a } from "./nlp.mjs";

const MODE_KEY = "hanogt-ai:agent-mode:v1";
const GRANTS_KEY = "hanogt-ai:agent-grants:v1";
const EVENT = "hanogt-ai:agent-settings";

function emit() {
    window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
    const onStorage = (event: StorageEvent) => {
        if (event.key === MODE_KEY || event.key === GRANTS_KEY) listener();
    };
    window.addEventListener(EVENT, listener);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(EVENT, listener);
        window.removeEventListener("storage", onStorage);
    };
}

// ------------------------------------------------------------------ mode
/** The mode chosen on this device; null when none was (the account's default applies then). */
function readStoredMode(): AgentMode | null {
    try {
        const value = window.localStorage.getItem(MODE_KEY);
        return isAgentMode(value) ? value : null;
    } catch {
        return null;
    }
}

export function setAgentMode(mode: AgentMode) {
    try {
        window.localStorage.setItem(MODE_KEY, mode);
    } catch {
        // Storage blocked: the default mode stays in effect.
    }
    emit();
}

/** This device's choice, else `fallback` (the account's default from the Hanogt AI settings), else "ask". */
export function useAgentMode(fallback: AgentMode = DEFAULT_AGENT_MODE): AgentMode {
    return useSyncExternalStore(subscribe, readStoredMode, () => null) ?? fallback;
}

// ------------------------------------------------------------------ session grants
/** A short, non-reversible key for the account (no e-mail address in storage). */
export function agentUserKey(identity: string | null | undefined): string | null {
    const value = identity?.trim().toLowerCase();
    return value ? `u${fnv1a(value).toString(36)}` : null;
}

function readGrantsRaw(): string {
    try {
        return window.sessionStorage.getItem(GRANTS_KEY) ?? "{}";
    } catch {
        return "{}";
    }
}

function parseGrants(raw: string): Record<string, AgentToolName[]> {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const out: Record<string, AgentToolName[]> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (/^u[0-9a-z]{1,14}$/.test(key) && Array.isArray(value)) out[key] = value.filter(isAgentToolName);
        }
        return out;
    } catch {
        return {};
    }
}

function writeGrants(grants: Record<string, AgentToolName[]>) {
    try {
        window.sessionStorage.setItem(GRANTS_KEY, JSON.stringify(grants));
    } catch {
        // Without storage the grant only lasts for this page.
    }
    emit();
}

const NONE: readonly AgentToolName[] = [];

/** Tools the user allowed for the rest of this tab session (signed-in account only). */
export function useAgentGrants(userKey: string | null) {
    const raw = useSyncExternalStore(subscribe, readGrantsRaw, () => "{}");
    const granted = useMemo(() => (userKey ? parseGrants(raw)[userKey] ?? NONE : NONE), [raw, userKey]);
    const grant = useCallback((name: AgentToolName) => {
        if (!userKey) return;
        const grants = parseGrants(readGrantsRaw());
        const current = grants[userKey] ?? [];
        if (current.includes(name)) return;
        writeGrants({ ...grants, [userKey]: [...current, name] });
    }, [userKey]);
    const revokeAll = useCallback(() => {
        if (!userKey) return;
        const grants = parseGrants(readGrantsRaw());
        delete grants[userKey];
        writeGrants(grants);
    }, [userKey]);
    return { granted, grant, revokeAll };
}
