/**
 * Group voice channels in the browser. A VoiceChannelSession is one tab in
 * one group's channel: it takes a seat through /api/groups/voice, runs the
 * WebRTC mesh (lib/collab/mesh-call.ts, everyone connected to everyone) and
 * passes the mesh's offers, answers and candidates through the server.
 * Without the Firebase bridge it polls the channel and its signals; with it,
 * Firestore listeners (VoiceWatchers, passed in by the provider) read them
 * and a listener the rules refuse falls back to polling.
 *
 * No React or Firebase imports: the provider wires it to the page and the
 * plain-Node tests drive it with fakes.
 */
import { MeshCall, SELF_PEER, type MeshCallState, type MeshConnection, type MeshSignalKind } from "@/lib/collab/mesh-call";
import {
    VOICE_LIMITS,
    VOICE_POLL,
    isSignalFor,
    newVoiceTabId,
    readParticipants,
    readVoiceSignal,
    type VoiceParticipant,
    type VoiceRoomView,
    type VoiceSignal,
} from "./voice";

/* --------------------------------- the API --------------------------------- */

export class VoiceRequestError extends Error {
    readonly code: string;
    readonly status: number;
    readonly extra: Record<string, unknown>;

    constructor(code: string, status = 0, extra: Record<string, unknown> = {}) {
        super(code);
        this.name = "VoiceRequestError";
        this.code = code;
        this.status = status;
        this.extra = extra;
    }
}

const codeOf = (error: unknown) => (error instanceof VoiceRequestError ? error.code : "network");

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
    } catch {
        throw new VoiceRequestError("network");
    }
    const data = await response.json().catch(() => ({})) as T & { code?: unknown };
    if (!response.ok) {
        const code = typeof data.code === "string" && /^[a-z_]{2,40}$/.test(data.code)
            ? data.code
            : response.status === 401 ? "unauthorized" : response.status === 404 ? "not_found" : response.status === 429 ? "rate_limited" : "server_error";
        throw new VoiceRequestError(code, response.status, data as Record<string, unknown>);
    }
    return data;
}

function post<T>(body: Record<string, unknown>, keepalive = false) {
    return request<T>("/api/groups/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive });
}

type Switches = { muted: boolean; deafened: boolean };
type Seat = { self: string; participants: VoiceParticipant[]; now?: number };
export type OutgoingSignal = { to: string; kind: MeshSignalKind; data: string };

export const voiceApi = {
    room: (groupId: string, tab?: string | null) => request<VoiceRoomView>(`/api/groups/voice?groupId=${encodeURIComponent(groupId)}${tab ? `&tab=${encodeURIComponent(tab)}` : ""}`),
    /** `resume`: rejoining by itself after losing the place (never takes the seat of the person's other tab). */
    join: (groupId: string, tab: string, switches: Switches, resume = false) => post<Seat>({ action: "join", groupId, tab, ...switches, ...(resume ? { resume: true } : {}) }),
    heartbeat: (groupId: string, tab: string, switches: Switches) => post<Seat>({ action: "heartbeat", groupId, tab, ...switches }),
    leave: (groupId: string, tab: string) => post<{ success: true }>({ action: "leave", groupId, tab }, true),
    signal: (groupId: string, tab: string, signals: OutgoingSignal[], ack: string[]) => post<{ success: true; sent: number }>({ action: "signal", groupId, tab, signals, ack }),
    /** Leaving that survives the tab closing (text/plain JSON). */
    beaconLeave: (groupId: string, tab: string) => {
        try {
            return navigator.sendBeacon("/api/groups/voice", JSON.stringify({ action: "leave", groupId, tab }));
        } catch {
            return false;
        }
    },
};

/* ------------------------------ the server clock ----------------------------- */

/**
 * Who is in a channel depends on when each tab last checked in (server
 * time). Listeners compare those times with this estimate of the server's
 * clock, so a computer whose clock is off doesn't hide or keep people.
 */
let clockOffset = 0;

function calibrate(serverNow: unknown, sentAt: number) {
    if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) return;
    clockOffset = serverNow - (sentAt + Date.now()) / 2;
}

export function serverNow() {
    return Date.now() + clockOffset;
}

/* ------------------------------ Firestore reading ----------------------------- */

/** Realtime reading with the Firebase bridge (the provider passes Firestore listeners in). */
export type VoiceWatchers = {
    /** The channel document; null when nobody is in it. */
    room: (groupId: string, onRoom: (data: Record<string, unknown> | null) => void, onError: () => void) => () => void;
    /** Signals addressed to this account in the channel (any of its tabs). */
    signals: (groupId: string, email: string, onSignals: (docs: Array<{ id: string; data: Record<string, unknown> }>) => void, onError: () => void) => () => void;
};

/**
 * Who is in a group's channel, for people looking at the group (not in the
 * channel themselves): a listener on the channel document, or polling every
 * few seconds. Participants who stop checking in drop off by the clock.
 */
export function watchVoiceRoom(options: {
    groupId: string;
    live: boolean;
    watchers?: VoiceWatchers | null;
    onParticipants: (participants: VoiceParticipant[]) => void;
}): () => void {
    let stopped = false;
    let timer = 0;
    let tick = 0;
    let unsubscribe: (() => void) | null = null;
    let stored: unknown = null;

    const poll = async () => {
        if (stopped) return;
        let failed = false;
        const sentAt = Date.now();
        try {
            const view = await voiceApi.room(options.groupId);
            calibrate(view.now, sentAt);
            if (!stopped && !unsubscribe) options.onParticipants(Array.isArray(view.participants) ? view.participants : []);
        } catch (error) {
            failed = true;
            // No longer a member (or the group is gone): nothing to show.
            if (!stopped && codeOf(error) === "not_found") options.onParticipants([]);
        }
        if (stopped || unsubscribe) return;
        const visible = typeof document === "undefined" || document.visibilityState === "visible";
        timer = window.setTimeout(() => void poll(), failed ? 30_000 : visible ? VOICE_POLL.watchingMs : VOICE_POLL.watchingMs * 4);
    };

    const onVisible = () => {
        if (stopped || unsubscribe || document.visibilityState !== "visible") return;
        window.clearTimeout(timer);
        void poll();
    };

    const fallBack = () => {
        if (stopped) return;
        unsubscribe?.();
        unsubscribe = null;
        window.clearInterval(tick);
        void poll();
    };

    if (options.live && options.watchers) {
        // One read for the server's clock, then the listener.
        void voiceApi.room(options.groupId).then((view) => calibrate(view.now, Date.now())).catch(() => undefined);
        try {
            unsubscribe = options.watchers.room(options.groupId, (data) => {
                if (stopped) return;
                stored = data?.participants ?? null;
                options.onParticipants(readParticipants(stored, serverNow()));
            }, fallBack);
            // Tabs that stop checking in leave the list even when nothing else changes.
            tick = window.setInterval(() => {
                if (!stopped && stored) options.onParticipants(readParticipants(stored, serverNow()));
            }, 5_000);
        } catch {
            fallBack();
        }
    } else {
        void poll();
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

    return () => {
        stopped = true;
        window.clearTimeout(timer);
        window.clearInterval(tick);
        unsubscribe?.();
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
}

/* --------------------------------- the session -------------------------------- */

export type VoicePhase = "joining" | "connected" | "ended";

/** Why the tab is not (or no longer) in the channel. */
export type VoiceNotice =
    | "full" | "muted" | "removed" | "moved" | "mic_denied" | "mic_unavailable" | "unsupported" | "ice"
    | "rate_limited" | "network" | "failed" | "call_started";

export type VoiceSessionState = {
    phase: VoicePhase;
    /** This tab's participant id (once it has a seat). */
    self: string | null;
    participants: VoiceParticipant[];
    /** Participant ids speaking right now (this tab's own id included). */
    speaking: string[];
    connections: Record<string, MeshConnection>;
    muted: boolean;
    deafened: boolean;
    /** False when no TURN server is configured (some networks then can't connect). */
    turnConfigured: boolean;
    audioBlocked: boolean;
    notice: VoiceNotice | null;
    /** For "muted": when the time-out ends. */
    mutedUntil: number;
    /** When this tab got its seat (local clock). */
    connectedAt: number;
};

export type VoiceSessionOptions = {
    groupId: string;
    email: string;
    live: boolean;
    watchers?: VoiceWatchers | null;
    muted: boolean;
    deafened: boolean;
    inputDeviceId?: string | null;
    outputDeviceId?: string | null;
    onChange: (state: VoiceSessionState) => void;
};

/** A sender stays connected this long after its last signal, even before the channel lists it. */
const RECENT_SENDER_MS = 15_000;
/** Losing the place (a long sleep, a network change) is repaired this often at most. */
const MAX_RECOVERIES = 3;
const RECOVERY_WINDOW_MS = 5 * 60_000;

export class VoiceChannelSession {
    readonly groupId: string;
    private readonly options: VoiceSessionOptions;
    private state: VoiceSessionState;
    private tab = "";
    private mesh: MeshCall | null = null;
    /** Bumped whenever the tab starts over: answers to older requests are ignored. */
    private generation = 0;
    private closed = false;
    private muted: boolean;
    private deafened: boolean;
    private inputDeviceId: string | null;
    private outputDeviceId: string | null;
    private outbox: OutgoingSignal[] = [];
    private acks: string[] = [];
    private flushTimer = 0;
    private flushing = false;
    private sendFailures = 0;
    private readonly handled = new Set<string>();
    private readonly recent = new Map<string, number>();
    private queue: Promise<void> = Promise.resolve();
    private beatTimer = 0;
    private pollTimer = 0;
    private pollFailures = 0;
    private polling = false;
    private tick = 0;
    private storedRoom: unknown = null;
    private unwatch: Array<() => void> = [];
    private recoveries: number[] = [];

    constructor(options: VoiceSessionOptions) {
        this.options = options;
        this.groupId = options.groupId;
        this.muted = options.muted;
        this.deafened = options.deafened;
        this.inputDeviceId = options.inputDeviceId ?? null;
        this.outputDeviceId = options.outputDeviceId ?? null;
        this.state = {
            phase: "joining",
            self: null,
            participants: [],
            speaking: [],
            connections: {},
            muted: options.muted,
            deafened: options.deafened,
            turnConfigured: true,
            audioBlocked: false,
            notice: null,
            mutedUntil: 0,
            connectedAt: 0,
        };
    }

    get current() {
        return this.state;
    }

    /** Still taking part (joining or in the channel). */
    get active() {
        return !this.closed;
    }

    static supported() {
        return typeof window !== "undefined" && typeof RTCPeerConnection !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    }

    private set(patch: Partial<VoiceSessionState>) {
        this.state = { ...this.state, ...patch };
        this.options.onChange(this.state);
    }

    private stale(generation: number) {
        return this.closed || generation !== this.generation;
    }

    private switches(): Switches {
        return { muted: this.muted || this.deafened, deafened: this.deafened };
    }

    /** Takes a seat and connects to everyone in the channel; call from a click (the microphone prompt and audio need it). */
    async join(): Promise<boolean> {
        if (this.closed || this.mesh || this.generation) return false;
        if (!VoiceChannelSession.supported()) return this.end("unsupported", false);
        return this.enter(false);
    }

    private async enter(resume: boolean): Promise<boolean> {
        const generation = ++this.generation;
        const tab = newVoiceTabId();
        this.tab = tab;
        this.set({ phase: "joining", self: null, speaking: [], connections: {}, notice: null });
        let seat: Seat;
        const sentAt = Date.now();
        try {
            seat = await voiceApi.join(this.groupId, tab, this.switches(), resume);
        } catch (error) {
            if (this.stale(generation)) return false;
            return this.fail(error, false);
        }
        calibrate(seat.now, sentAt);
        if (this.stale(generation)) {
            // Left while the seat was being taken.
            void voiceApi.leave(this.groupId, tab).catch(() => undefined);
            return false;
        }
        const mesh = new MeshCall({
            selfId: seat.self,
            send: (to, kind, data) => this.send(generation, to, kind, data),
            onChange: (state) => {
                if (!this.stale(generation)) this.set(this.meshView(state, seat.self));
            },
            inputDeviceId: this.inputDeviceId,
            outputDeviceId: this.outputDeviceId,
        });
        this.mesh = mesh;
        this.set({ self: seat.self, participants: seat.participants });
        const ok = await mesh.join();
        if (this.stale(generation)) {
            mesh.leave();
            return false;
        }
        if (!ok) {
            const error = mesh.current.error;
            this.generation += 1;
            mesh.leave();
            this.mesh = null;
            void voiceApi.leave(this.groupId, tab).catch(() => undefined);
            return this.end(error === "mic_unavailable" ? "mic_unavailable" : error === "unsupported" ? "unsupported" : error === "ice" ? "ice" : "mic_denied", false);
        }
        mesh.setDeafened(this.deafened);
        mesh.setMuted(this.muted || this.deafened);
        this.set({ phase: "connected", connectedAt: this.state.connectedAt || Date.now() });
        this.applyPeers();
        this.startReading(generation);
        this.scheduleBeat(generation);
        return true;
    }

    private meshView(state: MeshCallState, self: string): Partial<VoiceSessionState> {
        return {
            speaking: state.speaking.map((id) => (id === SELF_PEER ? self : id)),
            connections: state.connections,
            turnConfigured: state.turnConfigured,
            audioBlocked: state.audioBlocked,
        };
    }

    /* ------------------------------ signals out ------------------------------ */

    private send(generation: number, to: string, kind: MeshSignalKind, data: string) {
        if (generation !== this.generation) return;
        for (const piece of splitSignal(kind, data)) this.outbox.push({ to, kind, data: piece });
        this.scheduleFlush(this.outbox.length >= VOICE_LIMITS.signalsPerRequest ? 0 : 40);
    }

    private scheduleFlush(delay: number) {
        if (this.flushTimer) {
            if (delay > 0) return;
            window.clearTimeout(this.flushTimer);
        }
        this.flushTimer = window.setTimeout(() => {
            this.flushTimer = 0;
            void this.flush();
        }, delay);
    }

    private async flush() {
        if (this.flushing || this.closed) return;
        const signals = this.outbox.splice(0, VOICE_LIMITS.signalsPerRequest);
        const ack = this.acks.splice(0, VOICE_LIMITS.acksPerRequest);
        if (!signals.length && !ack.length) return;
        const generation = this.generation;
        this.flushing = true;
        let retry = 0;
        try {
            await voiceApi.signal(this.groupId, this.tab, signals, ack);
            this.sendFailures = 0;
        } catch (error) {
            const code = codeOf(error);
            if (this.stale(generation)) {
                // Started over: these were for the old seat.
            } else if (code === "not_in_voice") {
                void this.recover(generation);
            } else if (code === "not_found" || code === "unauthorized") {
                this.end("removed", false);
            } else if (code !== "invalid_request" && code !== "payload_too_large" && this.sendFailures < 4) {
                // Network trouble or a busy server: try again shortly, in order.
                this.sendFailures += 1;
                this.outbox.unshift(...signals);
                this.acks.unshift(...ack);
                retry = Math.min(4_000, 500 * 2 ** this.sendFailures);
            }
        } finally {
            this.flushing = false;
        }
        if (!this.closed && (this.outbox.length || this.acks.length)) this.scheduleFlush(retry || 0);
    }

    /* ------------------------------ reading ------------------------------ */

    private startReading(generation: number) {
        const watchers = this.options.watchers;
        if (this.options.live && watchers) {
            try {
                this.unwatch.push(watchers.room(this.groupId, (data) => {
                    if (this.stale(generation) || this.polling) return;
                    this.storedRoom = data?.participants ?? null;
                    this.onParticipants(readParticipants(this.storedRoom, serverNow()), generation);
                }, () => this.fallBack(generation)));
                this.unwatch.push(watchers.signals(this.groupId, this.options.email, (docs) => {
                    if (this.stale(generation) || this.polling) return;
                    const self = this.state.self ?? "";
                    const signals = docs.flatMap(({ id, data }) => {
                        const signal = isSignalFor(id, self) ? readVoiceSignal(id, data) : null;
                        return signal ? [signal] : [];
                    });
                    this.onSignals(signals, generation);
                }, () => this.fallBack(generation)));
                // Check-ins that stop show up even when nothing else changes.
                this.tick = window.setInterval(() => {
                    if (!this.stale(generation) && !this.polling && this.storedRoom) this.onParticipants(readParticipants(this.storedRoom, serverNow()), generation);
                }, 5_000);
                return;
            } catch {
                // Polled below.
            }
        }
        this.polling = true;
        void this.poll(generation);
    }

    /** A listener the rules refuse (or that breaks): poll the server instead. */
    private fallBack(generation: number) {
        if (this.stale(generation) || this.polling) return;
        this.stopWatching();
        this.polling = true;
        void this.poll(generation);
    }

    private stopWatching() {
        for (const stop of this.unwatch.splice(0)) stop();
        window.clearInterval(this.tick);
        this.tick = 0;
    }

    private async poll(generation: number) {
        if (this.stale(generation)) return;
        let delay: number = VOICE_POLL.joinedMs;
        const sentAt = Date.now();
        try {
            const view = await voiceApi.room(this.groupId, this.tab);
            if (this.stale(generation)) return;
            calibrate(view.now, sentAt);
            this.pollFailures = 0;
            this.onParticipants(Array.isArray(view.participants) ? view.participants : [], generation);
            this.onSignals(Array.isArray(view.signals) ? view.signals : [], generation);
        } catch (error) {
            if (this.stale(generation)) return;
            if (codeOf(error) === "not_found") {
                this.end("removed", false);
                return;
            }
            this.pollFailures += 1;
            delay = codeOf(error) === "rate_limited" ? 3_000 : Math.min(8_000, VOICE_POLL.joinedMs * (1 + this.pollFailures));
        }
        if (!this.stale(generation)) this.pollTimer = window.setTimeout(() => void this.poll(generation), delay);
    }

    private onParticipants(participants: VoiceParticipant[], generation: number) {
        if (this.stale(generation)) return;
        this.set({ participants });
        const self = this.state.self;
        // Taken out (a time-out, another tab took the seat, or this one was silent too long): the check-in says which.
        if (self && !participants.some((entry) => entry.id === self) && Date.now() - this.state.connectedAt > 3_000) this.scheduleBeat(generation, 200);
        this.applyPeers();
    }

    private onSignals(signals: VoiceSignal[], generation: number) {
        if (this.stale(generation) || !signals.length) return;
        const mesh = this.mesh;
        let added = false;
        for (const signal of [...signals].sort((a, b) => a.id.localeCompare(b.id))) {
            if (this.handled.has(signal.id)) continue;
            this.handled.add(signal.id);
            this.acks.push(signal.id);
            added = true;
            if (signal.kind === "bye") this.recent.delete(signal.from);
            else this.recent.set(signal.from, Date.now());
            // In order: an offer is set before its candidates arrive.
            this.queue = this.queue.then(() => (mesh && !this.stale(generation) ? mesh.handleSignal(signal.from, signal.kind, signal.data) : undefined)).catch(() => undefined);
        }
        if (this.handled.size > 600) {
            const keep = [...this.handled].slice(-300);
            this.handled.clear();
            for (const id of keep) this.handled.add(id);
        }
        if (added) {
            this.applyPeers();
            this.scheduleFlush(250);
        }
    }

    /** Everyone listed in the channel, and anyone who just sent this tab an offer (the list may lag behind). */
    private applyPeers() {
        const mesh = this.mesh;
        if (!mesh || mesh.current.status !== "active") return;
        const now = Date.now();
        for (const [id, at] of this.recent) if (now - at > RECENT_SENDER_MS) this.recent.delete(id);
        const ids = new Set(this.state.participants.map((entry) => entry.id));
        for (const id of this.recent.keys()) ids.add(id);
        if (this.state.self) ids.delete(this.state.self);
        mesh.setPeers([...ids]);
    }

    /* ------------------------------ check-ins ------------------------------ */

    private scheduleBeat(generation: number, delay: number = VOICE_LIMITS.heartbeatMs) {
        if (this.stale(generation)) return;
        window.clearTimeout(this.beatTimer);
        this.beatTimer = window.setTimeout(() => void this.beat(generation), delay);
    }

    private async beat(generation: number) {
        if (this.stale(generation)) return;
        const sentAt = Date.now();
        try {
            const seat = await voiceApi.heartbeat(this.groupId, this.tab, this.switches());
            if (this.stale(generation)) return;
            calibrate(seat.now, sentAt);
            this.set({ participants: seat.participants });
            this.applyPeers();
        } catch (error) {
            if (this.stale(generation)) return;
            const code = codeOf(error);
            if (code === "not_in_voice") {
                void this.recover(generation);
                return;
            }
            if (code === "muted" || code === "moved" || code === "not_found" || code === "unauthorized") {
                this.end(code === "muted" ? "muted" : code === "moved" ? "moved" : "removed", false, error);
                return;
            }
        }
        this.scheduleBeat(generation);
    }

    /**
     * The channel lost this tab (it slept or was offline for a while): start
     * over with a new seat and new connections, without taking the seat of
     * the person's other tab or device.
     */
    private async recover(generation: number) {
        if (this.stale(generation)) return;
        const now = Date.now();
        this.recoveries = this.recoveries.filter((at) => now - at < RECOVERY_WINDOW_MS);
        if (this.recoveries.length >= MAX_RECOVERIES) {
            this.end("failed", true);
            return;
        }
        this.recoveries.push(now);
        this.teardown();
        await this.enter(true);
    }

    /** Stops the timers, the reading and the mesh of the current seat (its "bye"s are dropped). */
    private teardown() {
        this.generation += 1;
        window.clearTimeout(this.beatTimer);
        window.clearTimeout(this.pollTimer);
        window.clearTimeout(this.flushTimer);
        this.flushTimer = 0;
        this.stopWatching();
        this.polling = false;
        this.storedRoom = null;
        this.outbox = [];
        this.acks = [];
        this.recent.clear();
        const mesh = this.mesh;
        this.mesh = null;
        mesh?.leave();
    }

    private fail(error: unknown, holdsSeat: boolean): false {
        const code = codeOf(error);
        const notice: VoiceNotice = code === "voice_full" ? "full"
            : code === "muted" ? "muted"
                : code === "moved" ? "moved"
                    : code === "not_found" || code === "unauthorized" ? "removed"
                        : code === "rate_limited" ? "rate_limited"
                            : code === "network" ? "network" : "failed";
        return this.end(notice, holdsSeat, error);
    }

    /** Leaves for a reason other than the person's own choice. */
    private end(notice: VoiceNotice, holdsSeat: boolean, error?: unknown): false {
        if (this.closed) return false;
        const tab = this.tab;
        this.teardown();
        this.closed = true;
        if (holdsSeat && tab) void voiceApi.leave(this.groupId, tab).catch(() => undefined);
        const until = error instanceof VoiceRequestError && typeof error.extra.until === "number" ? error.extra.until : 0;
        this.set({ phase: "ended", notice, mutedUntil: until, speaking: [], connections: {} });
        return false;
    }

    /* ------------------------------ the person ------------------------------ */

    /** The microphone and headphone switches of Hanogt Social (the others see them at once). */
    setSwitches(muted: boolean, deafened: boolean) {
        if (muted === this.muted && deafened === this.deafened) return;
        this.muted = muted;
        this.deafened = deafened;
        this.mesh?.setDeafened(deafened);
        this.mesh?.setMuted(muted || deafened);
        this.set({ muted, deafened });
        if (this.state.phase === "connected") this.scheduleBeat(this.generation, 250);
    }

    setInputDevice(id: string | null) {
        this.inputDeviceId = id;
        void this.mesh?.setInputDevice(id);
    }

    setOutputDevice(id: string | null) {
        this.outputDeviceId = id;
        this.mesh?.setOutputDevice(id);
    }

    resumeAudio() {
        this.mesh?.resumeAudio();
    }

    /** Leaves the channel: everyone gets a "bye", then the seat is freed. */
    leave(notice: VoiceNotice | null = null) {
        if (this.closed) return;
        const generation = this.generation;
        const tab = this.tab;
        const seated = Boolean(this.state.self);
        // The mesh says bye through `send` while this seat is still current.
        this.mesh?.leave();
        const byes = this.outbox.splice(0, VOICE_LIMITS.signalsPerRequest);
        const ack = this.acks.splice(0, VOICE_LIMITS.acksPerRequest);
        this.mesh = null;
        this.teardown();
        this.closed = true;
        this.set({ phase: "ended", notice, speaking: [], connections: {} });
        if (!seated || !tab || generation === 0) return;
        void (async () => {
            if (byes.length || ack.length) await voiceApi.signal(this.groupId, tab, byes, ack).catch(() => undefined);
            await voiceApi.leave(this.groupId, tab).catch(() => undefined);
        })();
    }

    /** The page is closing: the seat is freed with a beacon. */
    dispose() {
        if (this.closed) return;
        const tab = this.tab;
        const seated = Boolean(this.state.self);
        this.teardown();
        this.closed = true;
        if (seated && tab) voiceApi.beaconLeave(this.groupId, tab);
        // A page restored from the back/forward cache shows the channel as left.
        this.set({ phase: "ended", notice: null, speaking: [], connections: {} });
    }
}

/** Candidate batches too large for one signal are split; an oversized description can't be sent. */
export function splitSignal(kind: MeshSignalKind, data: string): string[] {
    if (data.length <= VOICE_LIMITS.signalChars) return [data];
    if (kind !== "candidates") return [];
    let list: unknown;
    try {
        list = JSON.parse(data);
    } catch {
        return [];
    }
    if (!Array.isArray(list) || list.length < 2) return [];
    const half = Math.ceil(list.length / 2);
    return [...splitSignal(kind, JSON.stringify(list.slice(0, half))), ...splitSignal(kind, JSON.stringify(list.slice(half)))];
}

