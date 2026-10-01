"use client";

/**
 * Hanogt AI conversations, kept only in this browser (localStorage) and shared
 * between the floating panel and the /ai page. Nothing is stored on the server.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { AiMode } from "./local-engine";

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
}

export interface AiConversation {
    id: string;
    title: string;
    mode: AiMode;
    createdAt: number;
    updatedAt: number;
    messages: AiMessage[];
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

function read(): AiConversation[] {
    if (cache) return cache;
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
        cache = Array.isArray(parsed)
            ? parsed
                .filter((entry): entry is AiConversation => Boolean(entry && typeof entry.id === "string" && Array.isArray(entry.messages)))
                .map((entry) => ({ ...entry, mode: entry.mode === "code" || entry.mode === "security" ? entry.mode : "general", messages: entry.messages.filter(isMessage) }))
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
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Storage can be full or blocked; the chat still works for this visit.
    }
    window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === ACTIVE_KEY) {
            cache = null;
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

export function useConversationActions() {
    const create = useCallback((mode: AiMode, title = ""): AiConversation => {
        const now = Date.now();
        const conversation: AiConversation = { id: createId(), title, mode, createdAt: now, updatedAt: now, messages: [] };
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
    const clearAll = useCallback(() => {
        write([]);
        setActiveConversation(null);
    }, []);
    return { create, update, remove, clearAll };
}
