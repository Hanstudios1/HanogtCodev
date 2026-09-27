"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

/**
 * Runs before React hydrates (inlined in <head>) so the first paint already
 * uses the stored theme. Without it the page flashed dark → light and pages
 * without the header never applied the user's choice at all.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=s==='dark'||((!s||s==='system')&&m);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.classList.add('dark');}})();`;

type ThemeContextValue = {
    preference: ThemePreference;
    theme: ResolvedTheme;
    setPreference: (preference: ThemePreference) => void;
    toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
    preference: "system",
    theme: "dark",
    setPreference: () => undefined,
    toggle: () => undefined,
});

const listeners = new Set<() => void>();
// Fallback for browsers where storage is blocked (private mode, sandboxed frames).
let memoryPreference: ThemePreference | null = null;

function readPreference(): ThemePreference {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === "light" || stored === "dark" || stored === "system") return stored;
    } catch {
        // Ignore and use the in-memory choice below.
    }
    return memoryPreference ?? "system";
}

function resolve(preference: ThemePreference): ResolvedTheme {
    if (preference !== "system") return preference;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ResolvedTheme) {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
}

function notify() {
    applyTheme(resolve(readPreference()));
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => { if (readPreference() === "system") notify(); };
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) notify(); };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        media.removeEventListener("change", onSystemChange);
        window.removeEventListener("storage", onStorage);
    };
}

// Snapshots are primitive strings so React can compare them cheaply.
const getSnapshot = () => {
    const preference = readPreference();
    return `${preference}|${resolve(preference)}`;
};
const getServerSnapshot = () => "system|dark";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const [preference, theme] = snapshot.split("|") as [ThemePreference, ResolvedTheme];

    const setPreference = useCallback((next: ThemePreference) => {
        memoryPreference = next;
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Private mode: the choice still applies for this page view.
        }
        notify();
    }, []);

    const toggle = useCallback(() => setPreference(theme === "dark" ? "light" : "dark"), [setPreference, theme]);
    const value = useMemo(() => ({ preference, theme, setPreference, toggle }), [preference, setPreference, theme, toggle]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    return useContext(ThemeContext);
}
