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

export interface ShortcutKeys {
    keys: readonly string[];
    /** Different keys on Apple platforms. */
    mac?: readonly string[];
}

/** Monaco's default keys for the Edit menu; also shown in the palette and the shortcuts dialog. */
export const EDIT_SHORTCUTS = {
    undo: { keys: ["Mod", "Z"] },
    redo: { keys: ["Mod", "Y"], mac: ["Mod", "Shift", "Z"] },
    find: { keys: ["Mod", "F"] },
    replace: { keys: ["Mod", "H"], mac: ["Alt", "Mod", "F"] },
    gotoLine: { keys: ["Ctrl", "G"] },
    comment: { keys: ["Mod", "/"] },
    format: { keys: ["Shift", "Alt", "F"] },
    selectAll: { keys: ["Mod", "A"] },
} as const satisfies Record<string, ShortcutKeys>;

/** The platform's text for a shortcut entry. */
export function shortcutText(entry: ShortcutKeys, mac: boolean): string {
    return formatShortcut(mac && entry.mac ? entry.mac : entry.keys, mac);
}

/** A two-step shortcut such as "Ctrl+K Z" (the second key is pressed after releasing the first). */
export function chordText(first: readonly string[], second: readonly string[], mac: boolean): string {
    return `${formatShortcut(first, mac)} ${formatShortcut(second, mac)}`;
}

/** Hanogt's view shortcuts (palette, shortcuts dialog and keyboard handlers). */
export const VIEW_SHORTCUTS = {
    /** Like VS Code's View: Toggle Word Wrap. */
    wordWrap: { keys: ["Alt", "Z"] },
    /** Ctrl/⌘+K opens Quick actions; Z right after it toggles Zen mode. */
    zen: { keys: ["Mod", "K"], then: ["Z"] },
    problems: { keys: ["Mod", "Shift", "M"] },
    search: { keys: ["Mod", "Shift", "F"] },
} as const satisfies Record<string, ShortcutKeys & { then?: readonly string[] }>;
