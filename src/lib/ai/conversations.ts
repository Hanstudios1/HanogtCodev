"use client";

/**
 * Hanogt AI conversations, kept only in this browser (localStorage) and shared
 * between the floating panel and the /ai page. Nothing is stored on the server.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { AgentCallRecord, AgentMessageState } from "./agent-protocol";
import { isAgentToolName } from "./agent-tools";
import type { AiMode } from "./local-engine";
import { readThinkingStep, type ThinkingStep } from "./thinking";

/** What the model (or the Core) thought before an answer, as the thinking panel shows it. */
export interface AiThinking {
    /** The model's thinking text (kept up to THINKING_STORED_MAX characters). */
    text: string;
    /** How long it thought, measured in the browser; null when unknown. */
    seconds: number | null;
    /** The steps taken before the answer (knowledge, analyzers, file, agent). */
    steps: ThinkingStep[];
    /** The Core's own trace: the intent it recognized and how sure it was. */
    core?: { intent: string; confidence: number };
}

export const THINKING_STORED_MAX = 6_000;

/**
 * The file a question was about, kept with its answer for the "Changes" card:
 * the file as it was sent (`base`; the answer proposes changes to it) and
 * what became of the proposal.
 */
export interface AiEdit {
    fileName: string;
    /** Editor language id. */
    language: string;
    /** The editor tab it came from; absent for an attached file. */
    tabId?: string;
    base: string;
    status?: "applied" | "dismissed";
    appliedAt?: number;
}

/** Files longer than this aren't kept for the card (the storage budget is shared by every chat). */
export const EDIT_BASE_MAX = 40_000;

export interface AiMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: number;
    /** Which engine answered: the server language model or the offline core. */
    engine?: "llm" | "core";
    sources?: Array<{ title: string; href: string }>;
    code?: { language: string; code: string };
    feedback?: "up" | "down";
    error?: boolean;
    /** Why the offline core answered instead of the language model (already localized). */
    notice?: string;
    /** A link next to the notice: "plans" (a limit a bigger plan raises) or "signin". */
    noticeAction?: "plans" | "signin";
    /** Agent actions proposed in this answer and what became of them. */
    agent?: AgentMessageState;
    /** A code file sent with this question (only its name and language are kept). */
    attachment?: { name: string; language: string };
    /** The language model that wrote an "llm" answer. */
    model?: string;
    /** The person's own provider connection that answered (src/lib/ai/connections.ts), when it wasn't Hanogt AI's model. */
    connectionId?: string;
    /** That connection's label at the time. */
    connectionLabel?: string;
    /** What was thought before this answer (never sent back to the model). */
    thinking?: AiThinking;
    /** The answer stopped early: it hit its length, the time limit or an error ("continue" picks it up). */
    cut?: "length" | "timeout" | "error";
    /** Answers about a file: the file as sent, for the "Changes" card. */
    edit?: AiEdit;
}

export interface AiConversation {
    id: string;
    title: string;
    mode: AiMode;
    createdAt: number;
    updatedAt: number;
    messages: AiMessage[];
    /** A private chat (the "keep chats" setting is off): it lives in this tab only and is never stored. */
    ephemeral?: boolean;
}

const STORAGE_KEY = "hanogt-ai:conversations:v1";
const ACTIVE_KEY = "hanogt-ai:active:v1";
const MAX_CONVERSATIONS = 40;
const MAX_MESSAGES = 120;
const MAX_BYTES = 900_000;
const EVENT = "hanogt-ai:conversations";

let cache: AiConversation[] | null = null;
let activeCache: string | null | undefined;

export function createId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isMessage(value: unknown): value is AiMessage {
    const message = value as AiMessage;
    return Boolean(message && typeof message.id === "string" && (message.role === "user" || message.role === "assistant") && typeof message.content === "string");
}

const CALL_STATUSES = new Set(["pending", "running", "done", "error", "denied", "dismissed"]);

/** Stored agent state is re-checked: a call that was running when the page closed didn't finish. */
function readAgentState(value: unknown): AgentMessageState | undefined {
    const state = value as AgentMessageState | undefined;
    if (!state || (state.source !== "llm" && state.source !== "core") || !Array.isArray(state.calls)) return undefined;
    const calls = state.calls
        .filter((call): call is AgentCallRecord => Boolean(call && typeof call.id === "string" && isAgentToolName(call.name) && call.args && typeof call.args === "object" && CALL_STATUSES.has(call.status)))
        .map((call) => (call.status === "running" ? { ...call, status: "error" as const, error: "interrupted" } : call));
    if (!calls.length) return undefined;
    return { source: state.source, calls, followUp: state.followUp === "waiting" || state.followUp === "sent" ? state.followUp : undefined, round: typeof state.round === "number" ? state.round : 0 };
}

/** Stored thinking re-checked (it comes from localStorage): known steps, bounded text, a sane duration. */
function readThinking(value: unknown): AiThinking | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.slice(0, THINKING_STORED_MAX) : "";
    const steps = Array.isArray(record.steps) ? record.steps.map(readThinkingStep).filter((step): step is ThinkingStep => step !== null).slice(0, 12) : [];
    const seconds = typeof record.seconds === "number" && Number.isFinite(record.seconds) && record.seconds >= 0 && record.seconds < 3_600 ? record.seconds : null;
    const core = record.core && typeof record.core === "object" && typeof (record.core as { intent?: unknown }).intent === "string" && typeof (record.core as { confidence?: unknown }).confidence === "number"
        ? { intent: String((record.core as { intent: string }).intent).slice(0, 60), confidence: Math.min(1, Math.max(0, (record.core as { confidence: number }).confidence)) }
        : undefined;
    if (!text && !steps.length && !core) return undefined;
    return { text, seconds, steps, ...(core ? { core } : {}) };
}

const CUTS = new Set(["length", "timeout", "error"]);

/** A stored edit re-checked: a bounded file and a plain name. */
function readEdit(value: unknown): AiEdit | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.base !== "string" || record.base.length > EDIT_BASE_MAX || typeof record.fileName !== "string" || !record.fileName.trim()) return undefined;
    return {
        fileName: record.fileName.slice(0, 120),
        language: typeof record.language === "string" ? record.language.slice(0, 40) : "plaintext",
        ...(typeof record.tabId === "string" && record.tabId.length <= 80 ? { tabId: record.tabId } : {}),
        base: record.base,
        ...(record.status === "applied" || record.status === "dismissed" ? { status: record.status } : {}),
        ...(typeof record.appliedAt === "number" && Number.isFinite(record.appliedAt) ? { appliedAt: record.appliedAt } : {}),
    };
}

function read(): AiConversation[] {
    if (cache) return cache;
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
        cache = Array.isArray(parsed)
            ? parsed
                .filter((entry): entry is AiConversation => Boolean(entry && typeof entry.id === "string" && Array.isArray(entry.messages)))
                .map((entry) => ({
                    ...entry,
                    mode: entry.mode === "code" || entry.mode === "security" ? entry.mode : "general",
                    messages: entry.messages.filter(isMessage).map((message) => {
                        const { thinking, cut, edit, ...rest } = message;
                        const checked = { ...rest, ...(message.agent ? { agent: readAgentState(message.agent) } : {}) };
                        const kept = readThinking(thinking);
                        const keptEdit = message.role === "assistant" ? readEdit(edit) : undefined;
                        return { ...checked, ...(kept ? { thinking: kept } : {}), ...(cut && CUTS.has(cut) ? { cut } : {}), ...(keptEdit ? { edit: keptEdit } : {}) };
                    }),
                }))
            : [];
    } catch {
        cache = [];
    }
    return cache;
}

function write(conversations: AiConversation[]) {
    let next = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS)
        .map((conversation) => ({ ...conversation, messages: conversation.messages.slice(-MAX_MESSAGES) }));
    // Keep the newest chats when the storage budget is exceeded.
    while (next.length > 1 && JSON.stringify(next).length > MAX_BYTES) next = next.slice(0, -1);
    cache = next;
    try {
        // Private chats stay in memory only.
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.filter((conversation) => !conversation.ephemeral)));
    } catch {
        // Storage can be full or blocked; the chat still works for this visit.
    }
    window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === ACTIVE_KEY) {
            // Another tab saved: read its chats again but keep this tab's private ones (they were never stored).
            const kept = (cache ?? []).filter((conversation) => conversation.ephemeral);
            cache = null;
            if (kept.length) cache = [...kept, ...read()].sort((a, b) => b.updatedAt - a.updatedAt);
            activeCache = undefined;
            listener();
        }
    };
    window.addEventListener(EVENT, listener);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(EVENT, listener);
        window.removeEventListener("storage", onStorage);
    };
}

const EMPTY: AiConversation[] = [];

export function useConversations() {
    return useSyncExternalStore(subscribe, read, () => EMPTY);
}

function readActive() {
    if (activeCache !== undefined) return activeCache;
    try {
        activeCache = window.localStorage.getItem(ACTIVE_KEY);
    } catch {
        activeCache = null;
    }
    return activeCache;
}

export function useActiveConversationId() {
    return useSyncExternalStore(subscribe, readActive, () => null);
}

export function setActiveConversation(id: string | null) {
    activeCache = id;
    try {
        if (id) window.localStorage.setItem(ACTIVE_KEY, id);
        else window.localStorage.removeItem(ACTIVE_KEY);
    } catch {
        // Convenience only.
    }
    window.dispatchEvent(new Event(EVENT));
}

export function titleFrom(text: string) {
    const line = text.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
    return (line || "…").slice(0, 60);
}

/** Removes every conversation in this browser (sign-out with "delete my chats", the settings page). */
export function clearAllConversations() {
    write([]);
    setActiveConversation(null);
}

/**
 * Deletes the chats not touched in `days` days (the Hanogt AI setting "keep
 * chats for"; 0 keeps them). Returns how many went.
 */
export function pruneConversations(days: number, now = Date.now()) {
    if (!days || days <= 0) return 0;
    const cutoff = now - days * 86_400_000;
    const all = read();
    const kept = all.filter((conversation) => conversation.updatedAt >= cutoff);
    if (kept.length === all.length) return 0;
    write(kept);
    const active = readActive();
    if (active && !kept.some((conversation) => conversation.id === active)) setActiveConversation(null);
    return all.length - kept.length;
}

/** This browser's conversations as a JSON file's text (the settings page's export). */
export function exportConversationsJson() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), conversations: read() }, null, 2);
}

export function useConversationActions() {
    const create = useCallback((mode: AiMode, title = "", options: { ephemeral?: boolean } = {}): AiConversation => {
        const now = Date.now();
        const conversation: AiConversation = { id: createId(), title, mode, createdAt: now, updatedAt: now, messages: [], ...(options.ephemeral ? { ephemeral: true } : {}) };
        write([conversation, ...read()]);
        setActiveConversation(conversation.id);
        return conversation;
    }, []);
    const update = useCallback((id: string, change: (conversation: AiConversation) => AiConversation) => {
        write(read().map((conversation) => (conversation.id === id ? { ...change(conversation), updatedAt: Date.now() } : conversation)));
    }, []);
    const remove = useCallback((id: string) => {
        write(read().filter((conversation) => conversation.id !== id));
        if (readActive() === id) setActiveConversation(null);
    }, []);
    const clearAll = useCallback(() => clearAllConversations(), []);
    return { create, update, remove, clearAll };
}
