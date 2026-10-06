"use client";

import type { AdminSectionId } from "./types";

/*
 * Where the admin panel is, kept in the address's hash ("#moderation?tab=
 * reports&status=closed") so a reload, a shared link or the back button
 * opens the same section, tab and filter. Changing a filter replaces the
 * history entry; opening a section adds one.
 */

export type AdminLocation = { section: string; params: URLSearchParams };

export function parseAdminHash(hash: string): AdminLocation {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    const index = raw.indexOf("?");
    if (index === -1) return { section: raw, params: new URLSearchParams() };
    return { section: raw.slice(0, index), params: new URLSearchParams(raw.slice(index + 1)) };
}

function hrefFor(section: string, params: URLSearchParams) {
    const query = params.toString();
    return `${window.location.pathname}${window.location.search}#${section}${query ? `?${query}` : ""}`;
}

/** Opens a section (a new history entry), optionally with its parameters. */
export function openAdminSection(section: AdminSectionId, params: Record<string, string> = {}) {
    const next = new URLSearchParams(params);
    const target = hrefFor(section, next);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== target) {
        window.history.pushState(null, "", target);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Changes the current section's parameters in place (null removes one). */
export function setAdminParams(changes: Record<string, string | null>) {
    const { section, params } = parseAdminHash(window.location.hash);
    for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
    }
    const target = hrefFor(section || "overview", params);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === target) return;
    window.history.replaceState(window.history.state, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
}
