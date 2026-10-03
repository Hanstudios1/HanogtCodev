"use client";

/**
 * "Delete my Hanogt AI chats on this device when I sign out": a choice kept
 * in this browser only (the chats themselves never leave it). Every sign-out
 * button calls prepareSignOut() first.
 */
import { useSyncExternalStore } from "react";
import { clearAllConversations } from "./conversations";

const KEY = "hanogt-ai:clear-on-sign-out:v1";
const EVENT = "hanogt-ai:clear-on-sign-out";

function read() {
    try {
        return window.localStorage.getItem(KEY) === "1";
    } catch {
        return false;
    }
}

function subscribe(listener: () => void) {
    const onStorage = (event: StorageEvent) => {
        if (event.key === KEY) listener();
    };
    window.addEventListener(EVENT, listener);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(EVENT, listener);
        window.removeEventListener("storage", onStorage);
    };
}

export function setClearChatsOnSignOut(on: boolean) {
    try {
        if (on) window.localStorage.setItem(KEY, "1");
        else window.localStorage.removeItem(KEY);
    } catch {
        // Storage blocked: nothing is kept anyway.
    }
    window.dispatchEvent(new Event(EVENT));
}

export function useClearChatsOnSignOut() {
    return useSyncExternalStore(subscribe, read, () => false);
}

/** Before signing out: removes this device's Hanogt AI chats when the person asked for it. */
export function prepareSignOut() {
    if (read()) clearAllConversations();
}
