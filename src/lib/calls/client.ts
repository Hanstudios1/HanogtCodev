"use client";

/**
 * Browser side of call signalling. Every change goes through /api/calls
 * (the server checks friendship and roles), so calls work without the
 * Firebase bridge. Reading is realtime when the bridge is up (a Firestore
 * listener on the call document, and on the user's calls for ringing) and
 * polled otherwise; a listener the security rules refuse falls back to
 * polling instead of failing silently.
 */
import { collection, doc, onSnapshot, query, where, type FirestoreError } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    CALL_POLL,
    callFromData,
    callWire,
    ringingCalls,
    type CallCandidate,
    type CallDescription,
    type CallRole,
    type CallStatus,
    type CallWire,
    type DeclineReason,
    type IncomingCall,
} from "./model";

export type CallErrorCode =
    | "unauthorized" | "forbidden_origin" | "rate_limited" | "invalid_request" | "invalid_id" | "self_action" | "not_found"
    | "not_friend" | "blocked" | "forbidden" | "call_inactive" | "server_error" | "network";

const CODES: readonly CallErrorCode[] = [
    "unauthorized", "forbidden_origin", "rate_limited", "invalid_request", "invalid_id", "self_action", "not_found",
    "not_friend", "blocked", "forbidden", "call_inactive", "server_error", "network",
];

export class CallRequestError extends Error {
    readonly code: CallErrorCode;
    readonly status: number;

    constructor(code: CallErrorCode, status = 0) {
        super(code);
        this.name = "CallRequestError";
        this.code = code;
        this.status = status;
    }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
    } catch {
        throw new CallRequestError("network");
    }
    const data = await response.json().catch(() => ({})) as T & { code?: unknown };
    if (!response.ok) {
        const code = CODES.find((entry) => entry === data.code)
            ?? (response.status === 401 ? "unauthorized" : response.status === 404 ? "not_found" : response.status === 429 ? "rate_limited" : "server_error");
        throw new CallRequestError(code, response.status);
    }
    return data;
}

function post<T>(body: Record<string, unknown>, keepalive = false) {
    return request<T>("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive });
}

export const callsApi = {
    ice: () => request<{ iceServers?: RTCIceServer[]; turnConfigured?: boolean }>("/api/calls/ice", { method: "POST", headers: { "Content-Type": "application/json" } }),
    start: (callee: string, offer: CallDescription) => post<{ callId: string; call: CallWire }>({ action: "start", callee, offer }),
    answer: (callId: string, answer: CallDescription) => post<{ success: true }>({ action: "answer", callId, answer }),
    candidates: (callId: string, candidates: RTCIceCandidateInit[]) => post<{ success: true }>({ action: "candidates", callId, candidates }),
    decline: (callId: string, reason: DeclineReason) => post<{ success: true }>({ action: "decline", callId, reason }),
    end: (callId: string, keepalive = false) => post<{ success: true }>({ action: "end", callId }, keepalive),
    mute: (callId: string, muted: boolean) => post<{ success: true }>({ action: "mute", callId, muted }),
    get: (callId: string, have: number) => request<{ call: CallWire }>(`/api/calls?id=${encodeURIComponent(callId)}&have=${Math.max(0, Math.floor(have))}`),
    incoming: () => request<{ calls: IncomingCall[] }>("/api/calls/incoming"),
    /** Hang-up that survives the tab closing. */
    beacon: (callId: string) => {
        try {
            return navigator.sendBeacon("/api/calls/cleanup", JSON.stringify({ callId }));
        } catch {
            return false;
        }
    },
};

/** What a participant needs of a call: every remote candidate so far, the other side's description. */
export type CallView = {
    status: CallStatus;
    offer: CallDescription | null;
    answer: CallDescription | null;
    remote: CallCandidate[];
    endReason: DeclineReason | null;
    /** The other side switched its microphone off. */
    remoteMuted: boolean;
};

function warn(scope: string, error: unknown) {
    const code = (error as FirestoreError | null)?.code;
    console.warn(`[calls] ${scope} listener failed${code ? ` (${code})` : ""}; polling the server instead.`);
}

/**
 * Follows one call until it is stopped: `onUpdate` with every change,
 * `onGone` once the call document no longer exists (hung up or cleaned up).
 */
export function watchCall(options: {
    callId: string;
    role: CallRole;
    live: boolean;
    /** Polling interval for the current phase (without the bridge). */
    interval: () => number;
    onUpdate: (view: CallView) => void;
    onGone: () => void;
}): () => void {
    let stopped = false;
    let timer = 0;
    let unsubscribe: (() => void) | null = null;
    let remote: CallCandidate[] = [];
    let failures = 0;

    const poll = async () => {
        if (stopped) return;
        try {
            const { call } = await callsApi.get(options.callId, remote.length);
            if (stopped) return;
            failures = 0;
            remote = call.candidateCount < remote.length ? [...call.candidates] : [...remote, ...call.candidates];
            options.onUpdate({ status: call.status, offer: call.offer, answer: call.answer, remote, endReason: call.endReason, remoteMuted: call.remoteMuted === true });
        } catch (error) {
            if (stopped) return;
            if (error instanceof CallRequestError && (error.code === "not_found" || error.code === "invalid_id" || error.code === "unauthorized")) {
                options.onGone();
                return;
            }
            failures += 1;
        }
        if (!stopped) timer = window.setTimeout(() => void poll(), failures ? Math.min(8_000, options.interval() * (1 + failures)) : options.interval());
    };

    if (options.live) {
        unsubscribe = onSnapshot(doc(db, "calls", options.callId), (snapshot) => {
            if (stopped) return;
            if (!snapshot.exists()) {
                // Only the server can say a call is gone (an offline cache knows nothing yet).
                if (!snapshot.metadata.fromCache) options.onGone();
                return;
            }
            const record = callFromData(snapshot.id, snapshot.data());
            if (!record) {
                options.onGone();
                return;
            }
            const wire = callWire(record, options.role);
            options.onUpdate({ status: wire.status, offer: wire.offer, answer: wire.answer, remote: wire.candidates, endReason: wire.endReason, remoteMuted: wire.remoteMuted });
        }, (error) => {
            warn("call", error);
            unsubscribe = null;
            void poll();
        });
    } else {
        void poll();
    }

    return () => {
        stopped = true;
        window.clearTimeout(timer);
        unsubscribe?.();
    };
}

/**
 * Calls ringing for `email`. Live: a listener on the user's calls (the
 * security rules allow participants to read them; filtering by callee and
 * status in the query itself would be refused), filtered here. Otherwise
 * /api/calls/incoming is polled, faster while the tab is visible.
 */
export function watchIncoming(options: { email: string; live: boolean; onCalls: (calls: IncomingCall[]) => void }): () => void {
    let stopped = false;
    let timer = 0;
    let unsubscribe: (() => void) | null = null;

    const poll = async () => {
        if (stopped) return;
        let failed = false;
        try {
            const { calls } = await callsApi.incoming();
            if (!stopped) options.onCalls(Array.isArray(calls) ? calls : []);
        } catch {
            failed = true;
        }
        if (stopped) return;
        const visible = document.visibilityState === "visible";
        timer = window.setTimeout(() => void poll(), failed ? 20_000 : visible ? CALL_POLL.incomingVisibleMs : CALL_POLL.incomingHiddenMs);
    };

    // Coming back to the tab checks at once (timers of hidden tabs are throttled).
    const onVisible = () => {
        if (stopped || unsubscribe || document.visibilityState !== "visible") return;
        window.clearTimeout(timer);
        void poll();
    };

    if (options.live) {
        const fresh = new Set<string>();
        let primed = false;
        unsubscribe = onSnapshot(query(collection(db, "calls"), where("participants", "array-contains", options.email)), (snapshot) => {
            if (stopped) return;
            const received = Date.now();
            if (primed) for (const change of snapshot.docChanges()) if (change.type !== "removed") fresh.add(change.doc.id);
            primed = true;
            const records = snapshot.docs.flatMap((item) => {
                const record = callFromData(item.id, item.data());
                return record ? [record] : [];
            });
            for (const id of fresh) if (!records.some((record) => record.id === id)) fresh.delete(id);
            options.onCalls(ringingCalls(records, options.email, received, fresh).map((record) => ({ id: record.id, caller: record.caller, createdAt: record.createdAt, person: null })));
        }, (error) => {
            warn("incoming-call", error);
            unsubscribe = null;
            void poll();
        });
    } else {
        void poll();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
        stopped = true;
        window.clearTimeout(timer);
        unsubscribe?.();
        document.removeEventListener("visibilitychange", onVisible);
    };
}
