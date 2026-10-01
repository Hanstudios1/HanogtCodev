"use client";

import { useSyncExternalStore } from "react";

function detectMac() {
    if (typeof navigator === "undefined") return false;
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
    return /mac|iphone|ipad|ipod/i.test(platform) || /Mac OS X/.test(navigator.userAgent);
}

const noop = () => () => undefined;

/** True on Apple platforms (⌘ instead of Ctrl). */
export function useIsMac(): boolean {
    return useSyncExternalStore(noop, detectMac, () => false);
}

/** Formats a shortcut such as ["Mod", "Shift", "Enter"] for the current platform. */
export function formatShortcut(keys: readonly string[], mac: boolean): string {
    const names: Record<string, string> = mac
        ? { Mod: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃", Enter: "↵" }
        : { Mod: "Ctrl", Shift: "Shift", Alt: "Alt", Ctrl: "Ctrl", Enter: "Enter" };
    return keys.map((key) => names[key] ?? key).join(mac ? "" : "+");
}

/** True when the event comes from a text field outside the code editor. */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest(".monaco-editor")) return false;
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
