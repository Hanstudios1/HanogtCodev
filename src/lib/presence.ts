/**
 * Discord-style presence shared by the API (src/app/api/presence) and every
 * avatar on the site. Client-safe and dependency-free.
 *
 * The status a person picks (online, idle, do not disturb, invisible) is
 * private (users/{email}.presenceChoice). Others only see the resulting public
 * state on public_profiles/{email}: `presence` plus `presenceAt`, refreshed by
 * the heartbeat while a tab is open.
 */
import type { Copy } from "@/lib/i18n";

export const PRESENCE_CHOICES = ["online", "idle", "dnd", "invisible"] as const;
export type PresenceChoice = (typeof PRESENCE_CHOICES)[number];

/** What other people see. */
export type PresenceState = "online" | "idle" | "dnd" | "offline";

/** Open tabs report every 45 seconds… */
export const PRESENCE_HEARTBEAT_MS = 45_000;
/** …so a state older than this means the person left without signing out. */
export const PRESENCE_WINDOW_MS = 100_000;
/** No mouse, keyboard or touch input for this long turns "online" into "idle". */
export const AUTO_IDLE_MS = 10 * 60_000;

export function isPresenceChoice(value: unknown): value is PresenceChoice {
    return typeof value === "string" && (PRESENCE_CHOICES as readonly string[]).includes(value);
}

export type PresenceFields = {
    isOnline?: unknown;
    presence?: unknown;
    presenceAt?: unknown;
    lastSeenAt?: unknown;
    dndMode?: unknown;
};

function millis(value: unknown) {
    if (typeof value === "string") return Date.parse(value);
    if (value instanceof Date) return value.getTime();
    if (value && typeof value === "object" && "seconds" in value && typeof (value as { seconds: unknown }).seconds === "number") {
        return (value as { seconds: number }).seconds * 1000;
    }
    return Number.NaN;
}

/**
 * The public state of a profile. Profiles written before the presence
 * heartbeat existed (isOnline + lastSeenAt, dndMode) are read the same way.
 */
export function effectivePresence(profile: PresenceFields | null | undefined, now = Date.now()): PresenceState {
    if (!profile || profile.isOnline !== true) return "offline";
    const at = millis(profile.presenceAt ?? profile.lastSeenAt);
    if (!Number.isFinite(at) || now - at > PRESENCE_WINDOW_MS) return "offline";
    if (profile.presence === "offline") return "offline";
    if (profile.presence === "dnd" || (profile.presence === undefined && profile.dndMode === true)) return "dnd";
    if (profile.presence === "idle") return "idle";
    return "online";
}

/** Public fields the heartbeat writes for a choice; `active` is false when the last tab closes. */
export function publicPresence(choice: PresenceChoice, options: { active: boolean; autoIdle: boolean; showOnline: boolean }): { isOnline: boolean; presence: PresenceState } {
    if (!options.active || !options.showOnline || choice === "invisible") return { isOnline: false, presence: "offline" };
    if (choice === "dnd") return { isOnline: true, presence: "dnd" };
    if (choice === "idle" || options.autoIdle) return { isOnline: true, presence: "idle" };
    return { isOnline: true, presence: "online" };
}

export const PRESENCE_COPY: Record<PresenceChoice | "offline", { label: Copy; hint: Copy }> = {
    online: {
        label: { TR: "Çevrimiçi", EN: "Online" },
        hint: { TR: "Arkadaşların seni çevrimiçi görür.", EN: "Your friends see you as online." },
    },
    idle: {
        label: { TR: "Boşta", EN: "Idle" },
        hint: { TR: "Biraz uzaktasın; 10 dakika işlem yapmazsan da otomatik açılır.", EN: "You're away for a bit; it also turns on after 10 minutes without activity." },
    },
    dnd: {
        label: { TR: "Rahatsız Etmeyin", EN: "Do Not Disturb" },
        hint: { TR: "Gelen sesli aramalar çalmaz; arkadaşların meşgul olduğunu görür.", EN: "Incoming voice calls don't ring; your friends see that you're busy." },
    },
    invisible: {
        label: { TR: "Görünmez", EN: "Invisible" },
        hint: { TR: "Çevrimdışı görünürsün ama siteyi kullanmaya devam edebilirsin.", EN: "You appear offline but can keep using the site." },
    },
    offline: {
        label: { TR: "Çevrimdışı", EN: "Offline" },
        hint: { TR: "Şu anda sitede değil.", EN: "Not on the site right now." },
    },
};
