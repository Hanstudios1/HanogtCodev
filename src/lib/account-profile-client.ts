"use client";

/**
 * The signed-in user's own profile and status as the header, the status
 * menu and the presence heartbeat need them, read once per page session from
 * GET /api/account/profile and shared, so they use one request. Account
 * Settings announces saved changes with the `hanogt:profile-updated` window
 * event; the cache applies the detail at once and reads the profile again
 * for settings the detail lacks. startPresenceReports() is the browser side
 * of POST /api/presence.
 */
import { useEffect, useSyncExternalStore } from "react";
import { PROFILE_TEXT_LIMITS, isSafeProfileUrl, type AccountProfileResponse } from "@/lib/account-profile";
import {
    AUTO_IDLE_MS,
    PRESENCE_HEARTBEAT_MS,
    PRESENCE_IDLE_HEARTBEAT_MS,
    activityRank,
    isPresenceActivity,
    isPresenceStatus,
    isStatusPreference,
    presenceTabId,
    readStatusPreference,
    type PresenceActivity,
    type PresenceApiResponse,
    type PresenceStatus,
    type StatusPreference,
} from "@/lib/presence";

export const PROFILE_UPDATED_EVENT = "hanogt:profile-updated";

export type OwnProfile = {
    email: string;
    username: string;
    /** https URL or "". */
    avatarUrl: string;
    nickname: string;
    nicknameTag: string;
    customStatus: string;
    statusPreference: StatusPreference;
    /** Privacy settings (users/{email}); the server publishes presence accordingly. */
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
    /** The status others see, from the last profile or presence answer. */
    status: PresenceStatus | null;
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

function entryFor(email: string) {
    if (!entry || entry.email !== email) entry = { email, profile: null, status: null, loadedAt: 0, failedAt: 0, request: null, reloadAfter: false };
    return entry;
}

const text = (value: unknown, max: number) => (typeof value === "string" ? [...value].slice(0, max).join("") : "");
const tag = (value: unknown) => (typeof value === "string" && /^[0-9]{4}$/.test(value) ? value : "");
const avatar = (value: unknown) => (typeof value === "string" && isSafeProfileUrl(value) ? value : "");

function readProfile(email: string, payload: unknown): OwnProfile | null {
    const fields = payload && typeof payload === "object" ? (payload as Partial<AccountProfileResponse>).fields : undefined;
    if (!fields || typeof fields !== "object") return null;
    return {
        email,
        username: text(fields.username, PROFILE_TEXT_LIMITS.username),
        avatarUrl: avatar(fields.avatarUrl),
        nickname: text(fields.nickname, PROFILE_TEXT_LIMITS.nickname),
        nicknameTag: tag(fields.nicknameTag),
        customStatus: text(fields.customStatus, PROFILE_TEXT_LIMITS.customStatus),
        statusPreference: readStatusPreference(fields.statusPreference),
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
 * Stores a GET or PATCH answer of /api/account/profile (Account Settings,
 * the status menu), so every reader shows the saved values at once.
 */
export function applyOwnProfileResponse(email: string, payload: AccountProfileResponse) {
    const profile = readProfile(email, payload);
    if (!profile) return;
    const current = entryFor(email);
    current.profile = profile;
    current.loadedAt = Date.now();
    current.failedAt = 0;
    if (isPresenceStatus(payload.presence)) current.status = payload.presence;
    emit();
}

/** The status others see, as the presence heartbeat last heard it from the server. */
export function setOwnStatus(email: string, status: PresenceStatus) {
    const current = entryFor(email);
    if (current.status === status) return;
    current.status = status;
    emit();
}

/**
 * The profile of `email` from the cache, read from the server when it is
 * missing or older than 15 minutes (`force` reads it in any case). Resolves
 * to the last known profile (or null) when the request fails.
 */
export function loadOwnProfile(email: string, options: { force?: boolean } = {}): Promise<OwnProfile | null> {
    const current = entryFor(email);
    if (current.request) {
        if (options.force) current.reloadAfter = true;
        return current.request;
    }
    const now = Date.now();
    if (!options.force && ((current.profile && now - current.loadedAt < FRESH_MS) || now - current.failedAt < RETRY_MS)) return Promise.resolve(current.profile);

    const request = fetch("/api/account/profile", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(async (response) => (response.ok ? await response.json().catch(() => null) as AccountProfileResponse | null : null))
        .catch(() => null)
        .then((payload) => {
            current.request = null;
            // Another account signed in meanwhile: this answer belongs to nobody.
            if (entry !== current) return null;
            const profile = payload ? readProfile(email, payload) : null;
            if (profile) {
                current.profile = profile;
                current.loadedAt = Date.now();
                current.failedAt = 0;
                if (payload && isPresenceStatus(payload.presence)) current.status = payload.presence;
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
    const settings = detail && typeof detail.showOnlineStatus === "boolean" && typeof detail.showLastSeen === "boolean" && isStatusPreference(detail.statusPreference)
        ? { showOnlineStatus: detail.showOnlineStatus, showLastSeen: detail.showLastSeen, statusPreference: detail.statusPreference }
        : null;
    if (current.profile && detail && typeof detail === "object") {
        const next = { ...current.profile };
        if (typeof detail.username === "string") next.username = text(detail.username, PROFILE_TEXT_LIMITS.username);
        if (typeof detail.avatarUrl === "string") next.avatarUrl = avatar(detail.avatarUrl);
        if (typeof detail.nickname === "string") next.nickname = text(detail.nickname, PROFILE_TEXT_LIMITS.nickname);
        if (typeof detail.nicknameTag === "string") next.nicknameTag = tag(detail.nicknameTag);
        if (typeof detail.customStatus === "string") next.customStatus = text(detail.customStatus, PROFILE_TEXT_LIMITS.customStatus);
        current.profile = settings ? { ...next, ...settings } : next;
        if (isPresenceStatus(detail.presence)) current.status = detail.presence;
        emit();
        if (settings) return;
    }
    // The saved changes may include the status or privacy settings, which this event does not carry.
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

/** The status others see for the signed-in user (null until the profile or a heartbeat answered). */
export function useOwnStatus(email: string | null): PresenceStatus | null {
    return useSyncExternalStore(subscribe, () => (email && entry?.email === email ? entry.status : null), () => null);
}

// ---------------------------------------------------------------------------
// Presence reports (POST /api/presence)
// ---------------------------------------------------------------------------

/** The last report of any tab of this browser, with the status the server answered. */
const BEAT_KEY = "hanogt:presence:beat";
/** One key per open tab: "<account>:<time>", refreshed on every check. */
const ALIVE_PREFIX = "hanogt:presence:alive:";
/** Background tabs run their timers about once a minute. */
const ALIVE_MS = 150_000;
const CHECK_MS = 15_000;

type BeatRecord = { tab: string; account: string; activity: PresenceActivity; at: number; status: PresenceStatus | null };

function storage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

/** Short non-reversible key of the account: tabs of another account in this browser don't count. */
function accountKey(email: string) {
    let hash = 0x811c9dc5;
    for (const char of email) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
    return hash.toString(36);
}

function readBeat(account: string): BeatRecord | null {
    try {
        const value = JSON.parse(storage()?.getItem(BEAT_KEY) ?? "null") as Partial<BeatRecord> | null;
        if (!value || value.account !== account || typeof value.tab !== "string" || !isPresenceActivity(value.activity) || typeof value.at !== "number") return null;
        return { tab: value.tab, account, activity: value.activity, at: value.at, status: isPresenceStatus(value.status) ? value.status : null };
    } catch {
        return null;
    }
}

function writeBeat(record: BeatRecord) {
    try {
        storage()?.setItem(BEAT_KEY, JSON.stringify(record));
    } catch {
        // Storage blocked: every tab reports for itself.
    }
}

/**
 * Reports "offline" for this tab right away (signing out): the reports stop
 * with the session, and the status would otherwise last until it expires.
 */
export function reportPresenceOffline() {
    void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity: "offline", tab: presenceTabId() }),
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
    }).catch(() => undefined);
}

/**
 * Reports this tab's presence until the returned function is called:
 * "active" while there was input in the last 5 minutes, "idle" after that or
 * after 5 minutes in a hidden tab, "offline" (a beacon) when the last open
 * tab goes away. Active reports repeat every 45 s, idle ones every 4
 * minutes; a tab stays quiet while another tab of this browser reported at
 * least as much presence, and every tab shows the status the server answered.
 */
export function startPresenceReports(email: string) {
    const tab = presenceTabId();
    const account = accountKey(email);
    let lastInput = Date.now();
    let hiddenSince: number | null = document.visibilityState === "hidden" ? Date.now() : null;
    let reported: PresenceActivity | null = null;
    let reportedAt = 0;
    let pausedUntil = 0;

    const activity = (): PresenceActivity => {
        const now = Date.now();
        if (now - lastInput >= AUTO_IDLE_MS || (hiddenSince !== null && now - hiddenSince >= AUTO_IDLE_MS)) return "idle";
        return "active";
    };

    const markAlive = () => {
        try {
            storage()?.setItem(ALIVE_PREFIX + tab, `${account}:${Date.now()}`);
        } catch {
            // Storage blocked.
        }
    };

    const otherTabOpen = () => {
        const store = storage();
        if (!store) return false;
        try {
            const now = Date.now();
            for (let index = 0; index < store.length; index += 1) {
                const key = store.key(index);
                if (!key?.startsWith(ALIVE_PREFIX) || key === ALIVE_PREFIX + tab) continue;
                const [owner, at] = (store.getItem(key) ?? "").split(":");
                if (owner === account && now - Number(at) < ALIVE_MS) return true;
            }
        } catch {
            // Storage blocked.
        }
        return false;
    };

    const send = (next: PresenceActivity, leaving = false) => {
        reported = next;
        reportedAt = Date.now();
        const record: BeatRecord = { tab, account, activity: next, at: reportedAt, status: null };
        writeBeat(record);
        const body = JSON.stringify({ activity: next, tab });
        // Only a beacon (or a keepalive request) outlives the page.
        if (leaving && typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/presence", body)) return;
        void fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body, credentials: "same-origin", cache: "no-store", keepalive: leaving })
            .then(async (response) => {
                // The session ended: wait instead of asking every minute.
                if (response.status === 401) pausedUntil = Date.now() + 5 * 60_000;
                if (!response.ok) return;
                const data = await response.json().catch(() => null) as PresenceApiResponse | null;
                if (!data || !isPresenceStatus(data.status)) return;
                setOwnStatus(email, data.status);
                const current = readBeat(account);
                if (current && current.tab === tab && current.at === record.at) writeBeat({ ...record, status: data.status });
            })
            .catch(() => undefined);
    };

    const check = () => {
        markAlive();
        const now = Date.now();
        if (now < pausedUntil) return;
        const next = activity();
        const every = next === "idle" ? PRESENCE_IDLE_HEARTBEAT_MS : PRESENCE_HEARTBEAT_MS;
        if (next === reported && now - reportedAt < every - CHECK_MS / 2) return;
        const beat = readBeat(account);
        const beatEvery = beat?.activity === "idle" ? PRESENCE_IDLE_HEARTBEAT_MS : PRESENCE_HEARTBEAT_MS;
        if (beat && beat.tab !== tab && now - beat.at < beatEvery - CHECK_MS / 2 && activityRank(beat.activity) >= activityRank(next)) {
            // Another tab of this browser speaks for both.
            reported = next;
            if (beat.status) setOwnStatus(email, beat.status);
            return;
        }
        send(next);
    };

    const onInput = () => {
        const now = Date.now();
        if (now - lastInput < 1_000) return;
        const wasIdle = activity() === "idle";
        lastInput = now;
        // Back to online at once.
        if (wasIdle) check();
    };

    const onVisibility = () => {
        if (document.visibilityState === "hidden") {
            hiddenSince = Date.now();
            return;
        }
        hiddenSince = null;
        lastInput = Date.now();
        check();
    };

    const onPageHide = () => {
        try {
            storage()?.removeItem(ALIVE_PREFIX + tab);
        } catch {
            // Storage blocked.
        }
        if (!otherTabOpen()) send("offline", true);
    };

    // Back from the back/forward cache.
    const onPageShow = (event: PageTransitionEvent) => {
        if (!event.persisted) return;
        lastInput = Date.now();
        reported = null;
        check();
    };

    // Another tab reported: show the status the server answered it.
    const onStorage = (event: StorageEvent) => {
        if (event.key !== BEAT_KEY) return;
        const beat = readBeat(account);
        if (beat?.status) setOwnStatus(email, beat.status);
    };

    // Tabs that crashed or were killed never removed their key.
    try {
        const store = storage();
        for (let index = (store?.length ?? 0) - 1; store && index >= 0; index -= 1) {
            const key = store.key(index);
            if (key?.startsWith(ALIVE_PREFIX) && Date.now() - Number((store.getItem(key) ?? "").split(":")[1]) > 86_400_000) store.removeItem(key);
        }
    } catch {
        // Storage blocked.
    }

    const inputEvents = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const name of inputEvents) window.addEventListener(name, onInput, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(check, CHECK_MS);
    check();

    return () => {
        window.clearInterval(timer);
        for (const name of inputEvents) window.removeEventListener(name, onInput);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("pageshow", onPageShow);
        window.removeEventListener("storage", onStorage);
        try {
            storage()?.removeItem(ALIVE_PREFIX + tab);
        } catch {
            // Storage blocked.
        }
    };
}
