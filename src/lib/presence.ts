/**
 * Discord-style presence: the mark at the bottom right of a person's avatar.
 *
 * Shared by POST /api/presence (writes it), /api/account/profile (the status
 * preference), the presence heartbeat in Provider.tsx and every avatar that
 * shows a status (PresenceAvatar). Dependency-free, so the plain-Node tests
 * in scripts/tests can import it.
 *
 * Stored state (written by the server only)
 * - public_profiles/{email}.presence = { status, updatedAt, expiresAt }: what
 *   others see. The legacy fields isOnline, lastSeenAt (left out while "show
 *   last seen" is off) and dndMode keep older readers working.
 * - users/{email}.statusPreference: what the person chose; users/{email}.
 *   presenceState: the last accepted report (private).
 *
 * Read a status with effectiveStatus(profile): a presence that is not
 * refreshed in time counts as offline (closed laptop, lost connection).
 */
import type { Copy } from "@/lib/i18n";

/** What others see: green, yellow moon, red with a bar, gray ring. */
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";
/** What the person chose: "auto" is online while active and idle after AUTO_IDLE_MS without activity. */
export type StatusPreference = "auto" | "idle" | "dnd" | "invisible";
/** One browser's report: input within AUTO_IDLE_MS ("active"), none ("idle"), or leaving ("offline"). */
export type PresenceActivity = "active" | "idle" | "offline";

export const PRESENCE_STATUSES: readonly PresenceStatus[] = ["online", "idle", "dnd", "offline"];
export const STATUS_PREFERENCES: readonly StatusPreference[] = ["auto", "idle", "dnd", "invisible"];
export const PRESENCE_ACTIVITIES: readonly PresenceActivity[] = ["active", "idle", "offline"];

/** An active browser reports this often. */
export const PRESENCE_HEARTBEAT_MS = 45_000;
/** An idle browser reports this often (background tabs are throttled anyway). */
export const PRESENCE_IDLE_HEARTBEAT_MS = 4 * 60_000;
/** No input, or a hidden tab, for this long turns "auto" into idle. */
export const AUTO_IDLE_MS = 5 * 60_000;
/** A status from an active browser counts this long without a newer report. */
export const PRESENCE_STALE_MS = 2 * 60_000;
/** The same for idle browsers, which report less often. */
export const PRESENCE_IDLE_STALE_MS = 10 * 60_000;

export function isPresenceStatus(value: unknown): value is PresenceStatus {
    return typeof value === "string" && (PRESENCE_STATUSES as readonly string[]).includes(value);
}

export function isStatusPreference(value: unknown): value is StatusPreference {
    return typeof value === "string" && (STATUS_PREFERENCES as readonly string[]).includes(value);
}

export function isPresenceActivity(value: unknown): value is PresenceActivity {
    return typeof value === "string" && (PRESENCE_ACTIVITIES as readonly string[]).includes(value);
}

/**
 * Milliseconds of a stored time: an ISO string (server writes), a Date, a
 * number or a client SDK Timestamp ({ toMillis() } or { seconds }); 0 when
 * the value is unusable.
 */
export function presenceTime(value: unknown): number {
    let time = Number.NaN;
    if (typeof value === "number") time = value;
    else if (typeof value === "string") time = Date.parse(value);
    else if (value instanceof Date) time = value.getTime();
    else if (value && typeof value === "object") {
        const stamp = value as { toMillis?: unknown; seconds?: unknown };
        if (typeof stamp.toMillis === "function") time = Number((stamp.toMillis as () => unknown).call(value));
        else if (typeof stamp.seconds === "number") time = stamp.seconds * 1000;
    }
    return Number.isFinite(time) && time > 0 ? time : 0;
}

/**
 * Any object shaped like a public profile (client SDK data, API payloads,
 * typed profiles): presence, isOnline, lastSeenAt and dndMode are read.
 */
export type PresenceLike = object | null | undefined;

type PresenceFields = { presence?: unknown; isOnline?: unknown; lastSeenAt?: unknown; dndMode?: unknown };

/**
 * The status other people see. `presence.status` counts until its
 * `expiresAt` (at most 10 minutes after `updatedAt`; 2 minutes when it is
 * missing), then the person is offline. Profiles from before presence
 * existed fall back to isOnline with a recent lastSeenAt, plus dndMode.
 */
export function effectiveStatus(source: PresenceLike, now = Date.now()): PresenceStatus {
    if (!source || typeof source !== "object") return "offline";
    const profile = source as PresenceFields;
    const presence = profile.presence && typeof profile.presence === "object"
        ? profile.presence as { status?: unknown; updatedAt?: unknown; expiresAt?: unknown }
        : null;
    if (presence && isPresenceStatus(presence.status)) {
        if (presence.status === "offline") return "offline";
        const updatedAt = presenceTime(presence.updatedAt);
        // A time far in the future is a wrong clock, not a fresh status.
        if (!updatedAt || updatedAt - now > PRESENCE_STALE_MS) return "offline";
        const expiresAt = Math.min(presenceTime(presence.expiresAt) || updatedAt + PRESENCE_STALE_MS, updatedAt + PRESENCE_IDLE_STALE_MS);
        return now <= expiresAt ? presence.status : "offline";
    }
    const lastSeen = presenceTime(profile.lastSeenAt);
    if (profile.isOnline !== true || !lastSeen || Math.abs(now - lastSeen) > PRESENCE_STALE_MS) return "offline";
    return profile.dndMode === true ? "dnd" : "online";
}

/** The public "last seen" time in milliseconds, or 0 (hidden by the person, or never stored). */
export function lastSeenTime(source: PresenceLike) {
    return source && typeof source === "object" ? presenceTime((source as PresenceFields).lastSeenAt) : 0;
}

/** The stored preference; the older "Do not disturb" switch (dndMode) counts when none is stored. */
export function readStatusPreference(value: unknown, legacyDnd?: unknown): StatusPreference {
    if (isStatusPreference(value)) return value;
    return legacyDnd === true ? "dnd" : "auto";
}

/**
 * The status others see for a preference and the browser's activity.
 * "Show online status" turned off counts as invisible.
 */
export function resolvePresence(preference: StatusPreference, activity: PresenceActivity, showOnlineStatus = true): PresenceStatus {
    if (activity === "offline" || !showOnlineStatus || preference === "invisible") return "offline";
    if (preference === "dnd") return "dnd";
    if (preference === "idle") return "idle";
    return activity === "idle" ? "idle" : "online";
}

/** How long a report keeps the status fresh. */
export function presenceTtl(activity: PresenceActivity) {
    return activity === "idle" ? PRESENCE_IDLE_STALE_MS : PRESENCE_STALE_MS;
}

const ACTIVITY_RANK: Record<PresenceActivity, number> = { offline: 0, idle: 1, active: 2 };

/** "active" > "idle" > "offline": with several tabs or devices, the most present report wins. */
export function activityRank(activity: PresenceActivity) {
    return ACTIVITY_RANK[activity];
}

/** Random id of one browser tab: "t" and 16 hex digits (also a plain Firestore field name). */
export function isPresenceTabId(value: unknown): value is string {
    return typeof value === "string" && /^t[0-9a-f]{16}$/.test(value);
}

export function newPresenceTabId() {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return `t${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

let currentTab: string | null = null;

/** This browser tab's id: one per page load, kept across client-side navigation. */
export function presenceTabId() {
    currentTab ??= newPresenceTabId();
    return currentTab;
}

/** POST /api/presence body: `{ activity, tab }`. */
export type PresenceReportBody = { activity: PresenceActivity; tab: string };

/** POST /api/presence answer: the status others see now (`accepted` is false when a more present tab or device keeps it). */
export type PresenceApiResponse = { status: PresenceStatus; preference: StatusPreference; accepted: boolean };

/** The last accepted report, kept in users/{email}.presenceState (private). */
export type PresenceReport = { activity: PresenceActivity; tab: string; at: number; status: PresenceStatus };

export function readPresenceReport(value: unknown): PresenceReport | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const report = value as Record<string, unknown>;
    const at = presenceTime(report.at);
    if (!isPresenceActivity(report.activity) || !isPresenceStatus(report.status) || typeof report.tab !== "string" || !at) return null;
    return { activity: report.activity, tab: report.tab.slice(0, 40), at, status: report.status };
}

/**
 * Whether a report replaces the stored one. Another tab or device that
 * reported more presence keeps the status while its report is fresh, so a
 * background tab going idle, or a closing tab, doesn't hide an active one.
 */
export function supersedes(previous: PresenceReport | null, next: { activity: PresenceActivity; tab: string }, now: number) {
    if (!previous || previous.tab === next.tab) return true;
    if (now - previous.at >= presenceTtl(previous.activity)) return true;
    return activityRank(next.activity) >= activityRank(previous.activity);
}

export type PresenceWrite = { data: Record<string, unknown>; mask: string[] };

/**
 * Document updates for a report: users/{email} (private, always) and
 * public_profiles/{email} (null when nothing visible changes). A hidden
 * status (Görünmez, or "show online status" off) never refreshes the public
 * last-seen time, which would otherwise tell that the person is around.
 */
export function presenceWrites(input: {
    report: PresenceReport;
    /** The status hidden on purpose rather than the person being away. */
    invisible: boolean;
    showLastSeen: boolean;
    /** The status published before, from the stored report. */
    previousStatus: PresenceStatus | null;
    /** Publish even when nothing seems to change (a privacy setting changed). */
    force?: boolean;
}): { user: PresenceWrite; profile: PresenceWrite | null } {
    const { report } = input;
    const at = new Date(report.at).toISOString();
    const user: PresenceWrite = {
        data: { presenceState: { ...report }, isOnline: report.activity !== "offline", lastSeenAt: at },
        mask: ["presenceState", "isOnline", "lastSeenAt"],
    };
    if (!input.force && report.status === "offline" && input.previousStatus === "offline") return { user, profile: null };
    const data: Record<string, unknown> = {
        presence: report.status === "offline"
            ? { status: "offline", updatedAt: at }
            : { status: report.status, updatedAt: at, expiresAt: new Date(report.at + presenceTtl(report.activity)).toISOString() },
        isOnline: report.status !== "offline",
        dndMode: report.status === "dnd",
    };
    const mask = ["presence", "isOnline", "dndMode"];
    // In the mask without a value: a time stored before the setting was turned off is removed.
    if (!input.showLastSeen) mask.push("lastSeenAt");
    else if (!input.invisible) {
        data.lastSeenAt = at;
        mask.push("lastSeenAt");
    }
    return { user, profile: { data, mask } };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const PRESENCE_STATUS_COPY: Record<PresenceStatus, Copy> = {
    online: { TR: "Çevrimiçi", EN: "Online" },
    idle: { TR: "Boşta", EN: "Idle" },
    dnd: { TR: "Rahatsız Etmeyin", EN: "Do Not Disturb" },
    offline: { TR: "Çevrimdışı", EN: "Offline" },
};

export const STATUS_PREFERENCE_COPY: Record<StatusPreference, { label: Copy; hint: Copy }> = {
    auto: {
        label: { TR: "Çevrimiçi", EN: "Online" },
        hint: { TR: "Sitedeyken yeşil görünürsünüz; 5 dakika işlem yapmazsanız kendiliğinden Boşta olursunuz.", EN: "You show as green while you're here and switch to Idle after 5 minutes without activity." },
    },
    idle: {
        label: { TR: "Boşta", EN: "Idle" },
        hint: { TR: "Uzakta olduğunuzu gösterir.", EN: "Shows that you're away." },
    },
    dnd: {
        label: { TR: "Rahatsız Etmeyin", EN: "Do Not Disturb" },
        hint: { TR: "Meşgul olduğunuzu gösterir.", EN: "Shows that you're busy." },
    },
    invisible: {
        label: { TR: "Görünmez", EN: "Invisible" },
        hint: { TR: "Çevrimdışı görünürsünüz ama siteyi her zamanki gibi kullanabilirsiniz.", EN: "You appear offline but can use the site as usual." },
    },
};

/** "Son görülme {time}" for offline people whose last-seen time is shown. */
export const LAST_SEEN_COPY: Copy = { TR: "Son görülme {time}", EN: "Last seen {time}" };
