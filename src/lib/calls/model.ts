/**
 * Voice calls (1:1, Hanogt Social) — shared, framework-free building blocks.
 *
 * A call is one `calls/{id}` document: the caller's offer, the callee's
 * answer, both sides' ICE candidates (arrays) and the status. The server
 * (/api/calls, service account) writes it; browsers with a working Firebase
 * bridge read it with a realtime listener, the others poll /api/calls.
 * Audio itself flows peer to peer (or through a TURN relay) and is never
 * recorded. Imported by the API routes, the call engine in the browser and
 * the plain-Node tests: no React, Firebase or Node imports here.
 */
import { timeOf } from "@/lib/social/model";

export type CallStatus = "preparing" | "ringing" | "active" | "declined" | "ended";
export const CALL_STATUSES: readonly CallStatus[] = ["preparing", "ringing", "active", "declined", "ended"];

/** Why the callee didn't take the call (shown to the caller). */
export type DeclineReason = "declined" | "busy" | "unavailable";
export const DECLINE_REASONS: readonly DeclineReason[] = ["declined", "busy", "unavailable"];

export type CallRole = "caller" | "callee";
export type CallDescription = { type: "offer" | "answer"; sdp: string };
export type CallCandidate = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment: string | null };

export type CallRecord = {
    id: string;
    caller: string;
    callee: string;
    status: CallStatus;
    offer: CallDescription | null;
    answer: CallDescription | null;
    callerCandidates: CallCandidate[];
    calleeCandidates: CallCandidate[];
    createdAt: number;
    answeredAt: number;
    endedAt: number;
    expiresAt: number;
    endReason: DeclineReason | null;
};

export const CALL_LIMITS = {
    /** Characters of one SDP (an audio-only offer is 2–6 KB). */
    sdpMax: 30_000,
    candidateMax: 1_000,
    candidatesPerRequest: 40,
    candidatesPerSide: 150,
    /** The caller gives up after this long without an answer. */
    ringMs: 45_000,
    /** A ringing call older than this isn't shown to the callee any more. */
    incomingFreshMs: 60_000,
    /** After answering, the connection must be up within this time. */
    connectMs: 30_000,
    /** How long a dropped connection may try to recover. */
    disconnectGraceMs: 15_000,
    /** Ringing calls left behind (a crashed tab) are removed after this. */
    ringingTtlMs: 2 * 60_000,
    /** Declined calls stay this long so the caller sees why. */
    declinedTtlMs: 2 * 60_000,
    /** Active calls left behind are removed after this. */
    activeTtlMs: 12 * 60 * 60_000,
} as const;

/** Polling cadence of browsers without the Firebase bridge (ms). */
export const CALL_POLL = {
    incomingVisibleMs: 5_000,
    incomingHiddenMs: 20_000,
    ringingMs: 1_500,
    connectingMs: 1_000,
    activeMs: 4_000,
} as const;

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Call ids: randomUUID() (also the ids older clients created). */
export function isCallId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9-]{20,64}$/.test(value);
}

function email(value: unknown) {
    if (typeof value !== "string") return "";
    const text = value.trim().toLowerCase();
    return text.length <= 254 && EMAIL.test(text) ? text : "";
}

/** An offer or answer as RTCSessionDescriptionInit; anything else (or another type) is null. */
export function readDescription(value: unknown, type?: CallDescription["type"]): CallDescription | null {
    if (!value || typeof value !== "object") return null;
    const record = value as { type?: unknown; sdp?: unknown };
    if (record.type !== "offer" && record.type !== "answer") return null;
    if (type && record.type !== type) return null;
    if (typeof record.sdp !== "string" || record.sdp.length < 10 || record.sdp.length > CALL_LIMITS.sdpMax || !/^v=0\r?\n/.test(record.sdp)) return null;
    return { type: record.type, sdp: record.sdp };
}

/** One RTCIceCandidateInit (the empty end-of-candidates marker isn't stored). */
export function readCandidate(value: unknown): CallCandidate | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.candidate !== "string" || !record.candidate || record.candidate.length > CALL_LIMITS.candidateMax) return null;
    if (/[\u0000-\u001f]/.test(record.candidate)) return null;
    const sdpMid = typeof record.sdpMid === "string" && record.sdpMid.length <= 64 ? record.sdpMid : null;
    const sdpMLineIndex = typeof record.sdpMLineIndex === "number" && Number.isInteger(record.sdpMLineIndex) && record.sdpMLineIndex >= 0 && record.sdpMLineIndex <= 64 ? record.sdpMLineIndex : null;
    // addIceCandidate needs one of the two.
    if (sdpMid === null && sdpMLineIndex === null) return null;
    const usernameFragment = typeof record.usernameFragment === "string" && record.usernameFragment.length <= 256 ? record.usernameFragment : null;
    return { candidate: record.candidate, sdpMid, sdpMLineIndex, usernameFragment };
}

export function readCandidates(value: unknown, max: number): CallCandidate[] {
    if (!Array.isArray(value)) return [];
    const result: CallCandidate[] = [];
    for (const entry of value) {
        const candidate = readCandidate(entry);
        if (candidate) result.push(candidate);
        if (result.length >= max) break;
    }
    return result;
}

/**
 * A call from Firestore data (client snapshot or REST) or an API payload;
 * null when it isn't a usable two-person call.
 */
export function callFromData(id: string, data: Record<string, unknown> | null | undefined): CallRecord | null {
    if (!data || !isCallId(id)) return null;
    const caller = email(data.caller);
    const callee = email(data.callee);
    if (!caller || !callee || caller === callee) return null;
    const status = CALL_STATUSES.find((entry) => entry === data.status) ?? "ended";
    return {
        id,
        caller,
        callee,
        status,
        offer: readDescription(data.offer, "offer"),
        answer: readDescription(data.answer, "answer"),
        callerCandidates: readCandidates(data.callerCandidates, CALL_LIMITS.candidatesPerSide),
        calleeCandidates: readCandidates(data.calleeCandidates, CALL_LIMITS.candidatesPerSide),
        createdAt: timeOf(data.createdAt),
        answeredAt: timeOf(data.answeredAt),
        endedAt: timeOf(data.endedAt),
        expiresAt: timeOf(data.expiresAt),
        endReason: DECLINE_REASONS.find((entry) => entry === data.endReason) ?? null,
    };
}

export function callRoleOf(record: Pick<CallRecord, "caller" | "callee">, who: string): CallRole | null {
    const me = who.toLowerCase();
    if (record.caller === me) return "caller";
    if (record.callee === me) return "callee";
    return null;
}

/** The other side's ICE candidates. */
export function remoteCandidates(record: Pick<CallRecord, "callerCandidates" | "calleeCandidates">, role: CallRole) {
    return role === "caller" ? record.calleeCandidates : record.callerCandidates;
}

export function isTerminalStatus(status: CallStatus) {
    return status === "declined" || status === "ended";
}

/** Left behind: a finished call nobody cleaned up, or one ringing or active for far too long. */
export function isCallStale(record: CallRecord, now: number) {
    const started = record.createdAt || 0;
    if (isTerminalStatus(record.status)) return now - (record.endedAt || started) > CALL_LIMITS.declinedTtlMs;
    if (record.status === "active") return now - (record.answeredAt || started) > CALL_LIMITS.activeTtlMs;
    return now - started > CALL_LIMITS.ringingTtlMs;
}

/**
 * Calls ringing for `me` right now, newest first. `fresh` marks calls that
 * changed while the browser was listening (they count however the clocks of
 * the two computers differ); the others must be recent by their own time.
 */
export function ringingCalls(records: readonly CallRecord[], me: string, now: number, fresh: ReadonlySet<string> = new Set()) {
    const own = me.toLowerCase();
    return records
        .filter((record) => record.callee === own
            && record.status === "ringing"
            && Boolean(record.offer)
            && (fresh.has(record.id) || (record.createdAt > 0 && now - record.createdAt < CALL_LIMITS.incomingFreshMs && record.createdAt - now < CALL_LIMITS.incomingFreshMs)))
        .sort((a, b) => b.createdAt - a.createdAt);
}

/** What a participant may see of a call (GET /api/calls): only the remote candidates from `have` on. */
export type CallWire = {
    id: string;
    caller: string;
    callee: string;
    status: CallStatus;
    offer: CallDescription | null;
    answer: CallDescription | null;
    candidates: CallCandidate[];
    candidateCount: number;
    endReason: DeclineReason | null;
    createdAt: number;
    answeredAt: number;
};

export function callWire(record: CallRecord, role: CallRole, have = 0): CallWire {
    const remote = remoteCandidates(record, role);
    const from = Math.min(Math.max(0, Math.floor(have) || 0), remote.length);
    return {
        id: record.id,
        caller: record.caller,
        callee: record.callee,
        status: record.status,
        // Each side only needs the other side's description.
        offer: role === "callee" ? record.offer : null,
        answer: role === "caller" ? record.answer : null,
        candidates: remote.slice(from),
        candidateCount: remote.length,
        endReason: record.endReason,
        createdAt: record.createdAt,
        answeredAt: record.answeredAt,
    };
}

/** A ringing call as /api/calls/incoming lists it (with the caller's name card). */
export type IncomingCall = {
    id: string;
    caller: string;
    createdAt: number;
    person: { username: string; avatarUrl: string | null; staffRole: string | null } | null;
};
