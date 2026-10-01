"use client";

/**
 * Lets pages share what the user is working on with Hanogt AI (e.g. the file
 * open in the code editor) without prop drilling: the page publishes, the
 * global Hanogt AI dock reads.
 */
import { useSyncExternalStore } from "react";
import type { AiContext } from "./local-engine";

let current: AiContext | null = null;
const listeners = new Set<() => void>();

export function publishAiContext(context: AiContext | null) {
    current = context;
    for (const listener of listeners) listener();
}

export function getAiContext() {
    return current;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useAiContext() {
    return useSyncExternalStore(subscribe, getAiContext, () => null);
}

export interface OpenAiOptions {
    prompt?: string;
    mode?: "general" | "code" | "security";
    /** Send the prompt immediately instead of only filling the input. */
    send?: boolean;
}

/** Opens the Hanogt AI panel from anywhere. */
export function openHanogtAI(options: OpenAiOptions = {}) {
    window.dispatchEvent(new CustomEvent<OpenAiOptions>("hanogt:open-ai", { detail: options }));
}
