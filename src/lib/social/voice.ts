/**
 * Group voice channels (Hanogt Social) — shared, framework-free pieces.
 *
 * Every group has one voice channel for up to five people. Everyone in it
 * connects to everyone else (a small WebRTC mesh, like the voice chat of the
 * code editor's live sessions); the server only keeps who is in the channel
 * and passes the connection offers between them. Audio never passes through
 * the server and is never recorded.
 *
 *   group_voice/{groupId}               who is in the channel (written by the server)
 *   group_voice/{groupId}/signals/{id}  offers, answers and candidates for one participant
 *
 * A participant is one browser tab: `<member key>_<tab id>`, so the same
 * person on two devices doesn't collide. Imported by the API route, the
 * browser and the plain-Node tests: no React, Firebase or Node imports here.
 */

export const VOICE_LIMITS = {
    /** People in one channel, everyone connected to everyone (the mesh's limit). */
    people: 5,
    /** Tabs check in this often while in the channel. */
    heartbeatMs: 10_000,
    /** A participant who hasn't checked in for this long is gone (a closed laptop, a crashed tab). */
    staleMs: 30_000,
    /** Characters of one offer, answer or candidate batch. */
    signalChars: 16_000,
    signalsPerRequest: 12,
    acksPerRequest: 60,
    /** Signals nobody picked up are removed after this. */
    signalTtlMs: 2 * 60_000,
    nameLength: 60,
} as const;

/** Polling cadence of browsers without the Firebase bridge (ms). */
export const VOICE_POLL = {
    /** In the channel: the room and this tab's signals. */
    joinedMs: 1_500,
    /** Looking at the group: who is in the channel. */
    watchingMs: 12_000,
} as const;

export type VoiceSignalKind = "offer" | "answer" | "candidates" | "bye";
export const VOICE_SIGNAL_KINDS: readonly VoiceSignalKind[] = ["offer", "answer", "candidates", "bye"];

export type VoiceParticipant = {
    /** `<member key>_<tab id>` */
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    joinedAt: number;
    seenAt: number;
    muted: boolean;
    deafened: boolean;
};

export type VoiceSignal = { id: string; from: string; kind: VoiceSignalKind; data: string; at: number };

/** What GET /api/groups/voice answers. */
export type VoiceRoomView = {
    participants: VoiceParticipant[];
    /** Signals for the asking tab (only when it is in the channel). */
    signals: VoiceSignal[];
    now: number;
};

const TAB_ID = /^[a-z0-9]{8}$/;
const PEER_ID = /^k[0-9a-f]{20}_[a-z0-9]{8}$/;
/** `<recipient>-<time><random>`: the recipient leads, so a tab can only acknowledge its own signals. */
const SIGNAL_ID = /^k[0-9a-f]{20}_[a-z0-9]{8}-[0-9a-z]{17}$/;

export function isVoiceTabId(value: unknown): value is string {
    return typeof value === "string" && TAB_ID.test(value);
}

export function isVoicePeerId(value: unknown): value is string {
    return typeof value === "string" && PEER_ID.test(value);
}

export function isVoiceSignalId(value: unknown): value is string {
    return typeof value === "string" && SIGNAL_ID.test(value);
}

export function isVoiceSignalKind(value: unknown): value is VoiceSignalKind {
    return typeof value === "string" && (VOICE_SIGNAL_KINDS as readonly string[]).includes(value);
}

/** A participant id: the member's per-group key and the tab. */
export function voicePeerId(memberKey: string, tab: string) {
    return `${memberKey}_${tab}`;
}

/** The member key part of a participant id. */
export function memberKeyOfPeer(peerId: string) {
    return peerId.split("_")[0] ?? "";
}

/** A random tab id (8 lowercase letters and digits). */
export function newVoiceTabId(random: () => number = Math.random) {
    let id = "";
    while (id.length < 8) id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
    return id;
}

/** A signal's document id: the recipient, then base-36 milliseconds (9 characters) and 8 random characters. */
export function voiceSignalId(to: string, now: number, random: () => number = Math.random) {
    return `${to}-${Math.max(0, Math.floor(now)).toString(36).padStart(9, "0").slice(-9)}${newVoiceTabId(random)}`;
}

/** Whether a signal (by its id) is addressed to the participant. */
export function isSignalFor(signalId: string, peerId: string) {
    return isVoiceSignalId(signalId) && signalId.startsWith(`${peerId}-`);
}

function time(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value instanceof Date) return value.getTime();
    // Firestore client Timestamps.
    const seconds = (value as { seconds?: unknown } | null)?.seconds;
    return typeof seconds === "number" ? seconds * 1000 : 0;
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

/**
 * The people in the channel from the stored `participants` map: only those
 * who checked in recently, earliest first. `now` is the reader's clock.
 */
export function readParticipants(value: unknown, now: number): VoiceParticipant[] {
    if (!value || typeof value !== "object") return [];
    const list: VoiceParticipant[] = [];
    for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
        if (!isVoicePeerId(id) || !raw || typeof raw !== "object") continue;
        const entry = raw as Record<string, unknown>;
        const seenAt = time(entry.seenAt);
        if (!seenAt || now - seenAt > VOICE_LIMITS.staleMs) continue;
        const email = typeof entry.email === "string" ? entry.email.trim().toLowerCase() : "";
        if (!email) continue;
        const avatar = typeof entry.avatarUrl === "string" && /^https:\/\/[^\s"'<>`]+$/.test(entry.avatarUrl) && entry.avatarUrl.length <= 2048 ? entry.avatarUrl : null;
        list.push({
            id,
            email,
            name: text(entry.name, VOICE_LIMITS.nameLength) || email.split("@")[0],
            avatarUrl: avatar,
            joinedAt: time(entry.joinedAt) || seenAt,
            seenAt,
            muted: entry.muted === true,
            deafened: entry.deafened === true,
        });
    }
    return list.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)).slice(0, VOICE_LIMITS.people * 2);
}

/** Ids of stored participants who are gone (for the server's clean-up). */
export function staleParticipantIds(value: unknown, now: number): string[] {
    if (!value || typeof value !== "object") return [];
    const fresh = new Set(readParticipants(value, now).map((entry) => entry.id));
    return Object.keys(value as Record<string, unknown>).filter((id) => !fresh.has(id) && isVoicePeerId(id));
}

export function readVoiceSignal(id: string, value: unknown): VoiceSignal | null {
    if (!isVoiceSignalId(id) || !value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (!isVoicePeerId(record.from) || !isVoiceSignalKind(record.kind)) return null;
    if (typeof record.data !== "string" || record.data.length > VOICE_LIMITS.signalChars) return null;
    return { id, from: record.from, kind: record.kind, data: record.data, at: time(record.at) };
}
