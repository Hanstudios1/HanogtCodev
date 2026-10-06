"use client";

/**
 * The account's accessibility settings (Account Settings → Appearance):
 * "Reduce animations" and "High contrast". They apply to the whole site as
 * attributes on <html> (data-motion="reduce", data-contrast="more", styled in
 * globals.css), framer-motion follows the first through <MotionConfig>, and
 * the browser remembers both so they are in place before the page paints.
 */
import { MotionConfig } from "framer-motion";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useOwnProfile } from "@/lib/account-profile-client";
import { APPEARANCE_STORAGE_KEY as STORAGE_KEY } from "@/lib/appearance-script";

export type Appearance = { reduceAnimations: boolean; highContrast: boolean };

const EVENT = "hanogt:appearance";

function readAttributes(): Appearance {
    const root = document.documentElement;
    return { reduceAnimations: root.dataset.motion === "reduce", highContrast: root.dataset.contrast === "more" };
}

/** Applies the settings to this page and remembers them in this browser. */
export function applyAppearance(next: Appearance) {
    const root = document.documentElement;
    const before = readAttributes();
    if (next.reduceAnimations) root.dataset.motion = "reduce";
    else delete root.dataset.motion;
    if (next.highContrast) root.dataset.contrast = "more";
    else delete root.dataset.contrast;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Storage can be blocked; the attributes still apply to this page.
    }
    if (before.reduceAnimations !== next.reduceAnimations || before.highContrast !== next.highContrast) window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
}

/** Whether animations should be kept to a minimum: the account's setting or the system's. */
export function prefersReducedMotion() {
    if (typeof window === "undefined") return false;
    return document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeMotion(listener: () => void) {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", listener);
    window.addEventListener(EVENT, listener);
    return () => {
        query.removeEventListener("change", listener);
        window.removeEventListener(EVENT, listener);
    };
}

/**
 * prefersReducedMotion() kept up to date for rendering: the account's setting
 * or the system's. Still while rendering on the server, so nothing that moves
 * is in the first HTML.
 */
export function usePrefersReducedMotion() {
    return useSyncExternalStore(subscribeMotion, prefersReducedMotion, () => true);
}

/** The account's "Reduce animations" setting as it applies on this page. */
export function useReduceAnimationsSetting() {
    return useSyncExternalStore(subscribe, () => document.documentElement.dataset.motion === "reduce", () => false);
}

/**
 * Keeps the page in step with the signed-in account's settings (they follow
 * the account to every device) and makes framer-motion honour "Reduce
 * animations" as well as the system setting.
 */
export function AppearanceProvider({ email, children }: { email: string | null; children: ReactNode }) {
    const profile = useOwnProfile(email);
    const reduce = useReduceAnimationsSetting();

    useEffect(() => {
        if (profile) applyAppearance({ reduceAnimations: profile.reduceAnimations, highContrast: profile.highContrast });
    }, [profile]);

    return <MotionConfig reducedMotion={reduce ? "always" : "user"}>{children}</MotionConfig>;
}
