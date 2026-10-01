"use client";

/**
 * The signed-in user's own profile as the header and the presence heartbeat
 * need it, read once per page session from GET /api/account/profile and
 * shared, so both use one request. Account Settings announces saved changes
 * with the `hanogt:profile-updated` window event; the cache applies the
 * detail at once and reads the profile again for settings the detail lacks.
 */
import { useEffect, useSyncExternalStore } from "react";
import { isSafeProfileUrl, type AccountProfileResponse } from "@/lib/account-profile";

export const PROFILE_UPDATED_EVENT = "hanogt:profile-updated";

export type OwnProfile = {
    email: string;
    username: string;
    /** https URL or "". */
    avatarUrl: string;
    nickname: string;
    nicknameTag: string;
    /** Privacy settings (users/{email}); the presence heartbeat follows them. */
    showOnlineStatus: boolean;
    showLastSeen: boolean;
};

/** Read again after this long, so a change made on another device or tab is picked up. */
const FRESH_MS = 15 * 60_000;
/** A failed read is not repeated sooner than this. */
const RETRY_MS = 60_000;

type Entry = {
    email: string;
    profile: OwnProfile | null;
    loadedAt: number;
    failedAt: number;
    request: Promise<OwnProfile | null> | null;
    /** A forced read was asked for while another one was running. */
    reloadAfter: boolean;
};

let entry: Entry | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

const text = (value: unknown, max: number) => (typeof value === "string" ? [...value].slice(0, max).join("") : "");
const tag = (value: unknown) => (typeof value === "string" && /^[0-9]{4}$/.test(value) ? value : "");
const avatar = (value: unknown) => (typeof value === "string" && isSafeProfileUrl(value) ? value : "");

function readProfile(email: string, payload: unknown): OwnProfile | null {
    const fields = payload && typeof payload === "object" ? (payload as Partial<AccountProfileResponse>).fields : undefined;
    if (!fields || typeof fields !== "object") return null;
    return {
        email,
        username: text(fields.username, 100),
        avatarUrl: avatar(fields.avatarUrl),
        nickname: text(fields.nickname, 100),
        nicknameTag: tag(fields.nicknameTag),
        // Anything unexpected counts as hidden: presence is only shared when the settings allow it.
        showOnlineStatus: fields.showOnlineStatus === true,
        showLastSeen: fields.showLastSeen === true,
    };
}

/** Cached profile of `email` without loading it. */
export function getOwnProfile(email: string | null): OwnProfile | null {
    return email && entry?.email === email ? entry.profile : null;
}

/**
 * The profile of `email` from the cache, read from the server when it is
 * missing or older than 15 minutes (`force` reads it in any case). Resolves
 * to the last known profile (or null) when the request fails.
 */
export function loadOwnProfile(email: string, options: { force?: boolean } = {}): Promise<OwnProfile | null> {
    if (!entry || entry.email !== email) entry = { email, profile: null, loadedAt: 0, failedAt: 0, request: null, reloadAfter: false };
    const current = entry;
    if (current.request) {
        if (options.force) current.reloadAfter = true;
        return current.request;
    }
    const now = Date.now();
    if (!options.force && ((current.profile && now - current.loadedAt < FRESH_MS) || now - current.failedAt < RETRY_MS)) return Promise.resolve(current.profile);

    const request = fetch("/api/account/profile", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(async (response) => (response.ok ? readProfile(email, await response.json().catch(() => null)) : null))
        .catch(() => null)
        .then((profile) => {
            current.request = null;
            // Another account signed in meanwhile: this answer belongs to nobody.
            if (entry !== current) return null;
            if (profile) {
                current.profile = profile;
                current.loadedAt = Date.now();
                current.failedAt = 0;
            } else {
                current.failedAt = Date.now();
            }
            emit();
            if (current.reloadAfter) {
                current.reloadAfter = false;
                return loadOwnProfile(email, { force: true });
            }
            return current.profile;
        });
    current.request = request;
    return request;
}

function onProfileUpdated(event: Event) {
    const current = entry;
    if (!current) return;
    const detail = (event as CustomEvent<Record<string, unknown> | null>).detail;
    const privacy = detail && typeof detail.showOnlineStatus === "boolean" && typeof detail.showLastSeen === "boolean"
        ? { showOnlineStatus: detail.showOnlineStatus, showLastSeen: detail.showLastSeen }
        : null;
    if (current.profile && detail && typeof detail === "object") {
        const next = { ...current.profile };
        if (typeof detail.username === "string") next.username = text(detail.username, 100);
        if (typeof detail.avatarUrl === "string") next.avatarUrl = avatar(detail.avatarUrl);
        if (typeof detail.nickname === "string") next.nickname = text(detail.nickname, 100);
        if (typeof detail.nicknameTag === "string") next.nicknameTag = tag(detail.nicknameTag);
        current.profile = privacy ? { ...next, ...privacy } : next;
        emit();
        if (privacy) return;
    }
    // The saved changes may include the privacy settings, which the event does not carry.
    void loadOwnProfile(current.email, { force: true });
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    };
}

/** The signed-in user's profile (null while loading, when signed out or unavailable); loads it on first use. */
export function useOwnProfile(email: string | null): OwnProfile | null {
    const profile = useSyncExternalStore(subscribe, () => getOwnProfile(email), () => null);
    useEffect(() => {
        if (email) void loadOwnProfile(email);
    }, [email]);
    return profile;
}
