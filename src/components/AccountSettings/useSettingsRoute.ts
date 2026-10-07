"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { FIELD_SECTIONS, SECTIONS, hashSnapshot, openSection, serverHash, subscribeHash, type SectionId } from "./sections";

// Wide screens (lg) show the sidebar next to a section; phones show the list or a section.
let wideQuery: MediaQueryList | null = null;
const wide = () => (wideQuery ??= window.matchMedia("(min-width: 1024px)"));

function subscribeWide(callback: () => void) {
    const query = wide();
    query.addEventListener("change", callback);
    return () => query.removeEventListener("change", callback);
}

const wideSnapshot = () => wide().matches;
const wideServer = () => false;

const CONTROL = "input:not([type='hidden']), select, textarea, button, a[href]";

/** The element itself when it takes the focus, else its first visible, enabled control. */
function focusTarget(element: HTMLElement) {
    if (element.matches(`${CONTROL}, [tabindex]`)) return element;
    return [...element.querySelectorAll<HTMLElement>(CONTROL)].find((control) => !control.matches(":disabled") && control.getClientRects().length > 0) ?? element;
}

/** Scrolls a setting into view and focuses it (or its first control); a soft flash shows which one it is. */
function bringIntoView(id: string, highlight: boolean) {
    const element = document.getElementById(id);
    if (!element) return false;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    focusTarget(element).focus({ preventScroll: true });
    if (highlight && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const row = element.closest<HTMLElement>("[data-setting-row]");
        // Rows are see-through, so their background can flash; cards and controls get an outline instead.
        if (row) row.animate([{ backgroundColor: "rgb(99 102 241 / 0.14)" }, { backgroundColor: "rgb(99 102 241 / 0)" }], { duration: 1600, easing: "ease-out" });
        else element.animate([{ outline: "3px solid rgb(99 102 241 / 0.45)", outlineOffset: "2px" }, { outline: "3px solid rgb(99 102 241 / 0)", outlineOffset: "2px" }], { duration: 1600, easing: "ease-out" });
    }
    return true;
}

type Pending = { heading: boolean; target: string | null; highlight: boolean; nav: SectionId | null };
const NOTHING: Pending = { heading: false, target: null, highlight: false, nav: null };

/**
 * The open section (URL hash: reloads and the back button keep it) and what
 * takes the focus after moving: the section heading after picking a section,
 * a setting after a search or a save error, the menu entry after going back
 * to the list on narrow screens. An empty hash shows "account" on wide
 * screens and the category list on narrow ones.
 */
export function useSettingsRoute() {
    const hash = useSyncExternalStore(subscribeHash, hashSnapshot, serverHash);
    const isWide = useSyncExternalStore(subscribeWide, wideSnapshot, wideServer);
    const selected = SECTIONS.find((section) => section.id === hash)?.id ?? null;
    const active: SectionId = selected ?? "account";
    const headingRef = useRef<HTMLHeadingElement>(null);
    const pending = useRef<Pending>(NOTHING);

    const settle = useCallback(() => {
        const next = pending.current;
        pending.current = NOTHING;
        if (next.target) {
            const target = next.target;
            // Two frames: the section renders and lays out first.
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                if (!bringIntoView(target, next.highlight)) headingRef.current?.focus({ preventScroll: true });
            }));
        } else if (next.heading) {
            headingRef.current?.focus({ preventScroll: true });
        } else if (next.nav) {
            document.querySelector<HTMLElement>(`[data-account-nav="${next.nav}"]`)?.focus({ preventScroll: true });
        }
    }, []);

    useEffect(() => {
        settle();
    }, [selected, settle]);

    /** Opens a section from the menu; its heading takes the focus. */
    const go = (id: SectionId) => {
        pending.current = { ...NOTHING, heading: true };
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (id === selected) settle();
        else openSection(id);
    };

    /** Narrow screens: back to the category list, focusing the section's entry. */
    const backToList = () => {
        pending.current = { ...NOTHING, nav: active };
        openSection("");
        window.scrollTo({ top: 0 });
    };

    /** Opens the section of a setting and brings the element with `target` id into view. */
    const reveal = (section: SectionId, target: string, highlight = true) => {
        pending.current = { ...NOTHING, target, highlight };
        if (section === selected) settle();
        else openSection(section);
    };

    /** A save error: the field's section opens and the field (`#field-<key>`) takes the focus. */
    const revealField = (field: string) => {
        const section = Object.prototype.hasOwnProperty.call(FIELD_SECTIONS, field) ? FIELD_SECTIONS[field as keyof typeof FIELD_SECTIONS] : undefined;
        reveal(section ?? active, `field-${field}`, false);
    };

    return { selected, active, wide: isWide, headingRef, go, backToList, reveal, revealField };
}
