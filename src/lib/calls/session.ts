"use client";

/**
 * One 1:1 voice call in the browser: microphone, RTCPeerConnection, the
 * signalling through /api/calls (client.ts), timeouts and the "speaking"
 * meters. The React provider (components/VoiceCallProvider.tsx) creates one
 * per call and renders its state.
 */
import { CallRequestError, callsApi, watchCall, type CallView } from "./client";
import { CALL_LIMITS, CALL_POLL, type CallDescription, type CallRole, type DeclineReason } from "./model";

export type CallPhase = "preparing" | "ringing" | "incoming" | "connecting" | "active" | "ended";

/** Why a call ended or couldn't start (shown to the user). */
export type CallNotice =
    | "declined" | "busy" | "unavailable" | "no_answer" | "missed" | "ended"
    | "failed" | "failed_turn" | "mic_denied" | "mic_missing" | "mic_busy" | "unsupported" | "ice"
    | "start_failed" | "inactive" | "not_friend" | "blocked" | "rate_limited" | "network";

export type CallSessionState = {
    phase: CallPhase;
    callId: string | null;
    notice: CallNotice | null;
    /** When the audio connection came up (0 before). */
    connectedAt: number;
    /** False when the site has no TURN server (some networks then can't connect). */
    turnConfigured: boolean;
    /** Connecting takes longer than usual. */
    slow: boolean;
    remoteSpeaking: boolean;
    localSpeaking: boolean;
};

type SessionOptions = {
    role: CallRole;
    /** The other person's e-mail address. */
    peer: string;
    /** Known up front for incoming calls. */
    callId: string | null;
    /** Use realtime Firestore listeners (the Firebase bridge works). */
    live: boolean;
    muted: boolean;
    deafened: boolean;
    /** The page's <audio> element for the other side (a detached one is made otherwise). */
    audio: HTMLAudioElement | null;
    onChange: (state: CallSessionState) => void;
};

const SPEAKING_LEVEL = 0.035;
const SPEAKING_HOLD_MS = 450;
const SLOW_AFTER_MS = 8_000;

function micNotice(error: unknown): CallNotice {
    const name = error instanceof DOMException ? error.name : (error as { name?: string } | null)?.name ?? "";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "mic_missing";
    if (name === "NotReadableError" || name === "AbortError") return "mic_busy";
    return "mic_denied";
}

function requestNotice(error: unknown, fallback: CallNotice): CallNotice {
    if (!(error instanceof CallRequestError)) return fallback;
    switch (error.code) {
        case "not_friend": return "not_friend";
        case "blocked": return "blocked";
        case "rate_limited": return "rate_limited";
        case "network": return "network";
        case "call_inactive":
        case "not_found": return "inactive";
        default: return fallback;
    }
}

export class CallSession {
    readonly role: CallRole;
    readonly peer: string;
    private readonly options: SessionOptions;
    private state: CallSessionState;
    private pc: RTCPeerConnection | null = null;
    private local: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private audio: HTMLAudioElement | null = null;
    private ownsAudio = false;
    private stopWatch: (() => void) | null = null;
    private offer: CallDescription | null = null;
    private answerApplied = false;
    private remoteSeen = 0;
    private remoteQueue: RTCIceCandidateInit[] = [];
    private outgoing: RTCIceCandidateInit[] = [];
    private canSend = false;
    private sending = false;
    private readonly timers = new Map<string, number>();
    private closed = false;
    private muted: boolean;
    private deafened: boolean;
    private audioContext: AudioContext | null = null;
    private analysers: { local: AnalyserNode | null; remote: AnalyserNode | null } = { local: null, remote: null };
    private readonly lastLoud = { local: 0, remote: 0 };

    constructor(options: SessionOptions) {
        this.options = options;
        this.role = options.role;
        this.peer = options.peer;
        this.muted = options.muted;
        this.deafened = options.deafened;
        this.state = {
            phase: options.role === "caller" ? "preparing" : "incoming",
            callId: options.callId,
            notice: null,
            connectedAt: 0,
            turnConfigured: true,
            slow: false,
            remoteSpeaking: false,
            localSpeaking: false,
        };
    }

    get current() {
        return this.state;
    }

    /** Still ringing, connecting or talking. */
    get busy() {
        return this.state.phase !== "ended";
    }

    private set(patch: Partial<CallSessionState>) {
        const next = { ...this.state, ...patch };
        if ((Object.keys(patch) as Array<keyof CallSessionState>).every((key) => this.state[key] === next[key])) return;
        this.state = next;
        this.options.onChange(next);
    }

    private later(name: string, ms: number, task: () => void) {
        this.clear(name);
        this.timers.set(name, window.setTimeout(() => {
            this.timers.delete(name);
            if (!this.closed) task();
        }, ms));
    }

    private clear(name: string) {
        const timer = this.timers.get(name);
        if (timer !== undefined) window.clearTimeout(timer);
        this.timers.delete(name);
    }

    /* ------------------------------ setup ------------------------------ */

    private supported() {
        return typeof window !== "undefined" && typeof RTCPeerConnection !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    }

    /** Microphone and ICE servers, then the connection; false (and the call ended) when something fails. */
    private async prepare(): Promise<boolean> {
        if (!this.supported()) {
            this.finish("unsupported", this.role === "callee" ? "decline" : "remove");
            return false;
        }
        try {
            this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        } catch (error) {
            this.finish(micNotice(error), this.role === "callee" ? "decline" : "remove");
            return false;
        }
        if (this.closed) {
            this.stopLocal();
            return false;
        }
        this.local.getAudioTracks().forEach((track) => { track.enabled = !this.muted; });
        let iceServers: RTCIceServer[] = [];
        try {
            const ice = await callsApi.ice();
            iceServers = Array.isArray(ice.iceServers) ? ice.iceServers : [];
            this.set({ turnConfigured: ice.turnConfigured !== false });
        } catch {
            this.finish("ice", this.role === "callee" ? "decline" : "remove");
            return false;
        }
        if (this.closed) {
            this.stopLocal();
            return false;
        }
        this.createPeer(iceServers);
        this.startMeters();
        return true;
    }

    private createPeer(iceServers: RTCIceServer[]) {
        const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
        this.pc = pc;
        const local = this.local;
        local?.getTracks().forEach((track) => pc.addTrack(track, local));
        const stream = new MediaStream();
        this.remoteStream = stream;
        this.audio = this.options.audio;
        if (!this.audio) {
            this.audio = new Audio();
            this.ownsAudio = true;
        }
        this.audio.autoplay = true;
        this.audio.muted = this.deafened;
        this.audio.srcObject = stream;
        pc.ontrack = (event) => {
            for (const track of event.streams[0]?.getTracks() ?? [event.track]) if (!stream.getTracks().includes(track)) stream.addTrack(track);
            void this.audio?.play().catch(() => undefined);
            if (!this.analysers.remote) this.analysers.remote = this.analyse(stream);
        };
        pc.onicecandidate = (event) => {
            if (!event.candidate || !event.candidate.candidate) return;
            this.outgoing.push(event.candidate.toJSON());
            this.later("send", 150, () => void this.flushCandidates());
        };
        const onState = () => this.connectionChanged();
        pc.onconnectionstatechange = onState;
        pc.oniceconnectionstatechange = onState;
    }

    /* ----------------------------- outgoing ---------------------------- */

    async startOutgoing() {
        if (this.role !== "caller" || this.closed) return;
        if (!await this.prepare() || !this.pc) return;
        let callId = "";
        try {
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            if (this.closed) return;
            ({ callId } = await callsApi.start(this.peer, { type: "offer", sdp: offer.sdp ?? "" }));
        } catch (error) {
            if (!this.closed) this.finish(requestNotice(error, "start_failed"), "none");
            return;
        }
        if (this.closed) {
            // Hung up while the call was being set up.
            void callsApi.end(callId).catch(() => undefined);
            return;
        }
        this.set({ callId, phase: "ringing" });
        this.canSend = true;
        void this.flushCandidates();
        this.watch(callId);
        this.later("ring", CALL_LIMITS.ringMs, () => this.finish("no_answer", "remove"));
    }

    /* ----------------------------- incoming ---------------------------- */

    /** Rings: follows the call (offer, caller's candidates, cancellation) without touching the microphone. */
    startIncoming() {
        if (this.role !== "callee" || !this.state.callId || this.closed) return;
        this.watch(this.state.callId);
    }

    async accept() {
        const callId = this.state.callId;
        if (this.role !== "callee" || !callId || this.closed || this.state.phase !== "incoming") return;
        this.set({ phase: "connecting" });
        if (!await this.prepare() || !this.pc) return;
        try {
            let offer = this.offer;
            if (!offer) {
                const { call } = await callsApi.get(callId, 0);
                offer = call.offer;
            }
            if (!offer) throw new CallRequestError("call_inactive", 409);
            await this.pc.setRemoteDescription(offer);
            await this.flushRemote();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            if (this.closed) return;
            await callsApi.answer(callId, { type: "answer", sdp: answer.sdp ?? "" });
        } catch (error) {
            if (!this.closed) this.finish(requestNotice(error, "inactive"), "none");
            return;
        }
        if (this.closed) return;
        this.canSend = true;
        void this.flushCandidates();
        this.connecting();
    }

    async decline(reason: DeclineReason = "declined") {
        const callId = this.state.callId;
        if (this.role !== "callee" || !callId || this.closed) return;
        this.finish(null, "none");
        await callsApi.decline(callId, reason).catch(() => undefined);
    }

    /* ---------------------------- signalling --------------------------- */

    private pollInterval() {
        const phase = this.state.phase;
        if (phase === "connecting") return CALL_POLL.connectingMs;
        if (phase === "active") return CALL_POLL.activeMs;
        return CALL_POLL.ringingMs;
    }

    private watch(callId: string) {
        this.stopWatch?.();
        this.stopWatch = watchCall({
            callId,
            role: this.role,
            live: this.options.live,
            interval: () => this.pollInterval(),
            onUpdate: (view) => void this.update(view),
            onGone: () => this.gone(),
        });
    }

    private async update(view: CallView) {
        if (this.closed) return;
        if (view.offer && !this.offer) this.offer = view.offer;
        if (view.status === "declined") {
            // The caller learns why; it then removes the finished call.
            this.finish(this.role === "caller" ? view.endReason ?? "declined" : null, this.role === "caller" ? "remove" : "none");
            return;
        }
        if (view.status === "ended") {
            this.finish(this.state.phase === "incoming" ? "missed" : "ended", "remove");
            return;
        }
        if (this.role === "callee" && this.state.phase === "incoming" && view.status === "active") {
            // Answered on another device.
            this.finish(null, "none");
            return;
        }
        if (this.role === "caller" && view.answer && !this.answerApplied && this.pc) {
            this.answerApplied = true;
            this.clear("ring");
            this.set({ phase: "connecting" });
            this.connecting();
            try {
                await this.pc.setRemoteDescription(view.answer);
            } catch {
                this.fail();
                return;
            }
        }
        this.addRemote(view.remote);
        await this.flushRemote();
    }

    /** The call document disappeared: the other side hung up (or a cleanup ran). */
    private gone() {
        if (this.closed) return;
        const phase = this.state.phase;
        if (phase === "incoming") this.finish("missed", "none");
        else if (phase === "ringing" || phase === "preparing") this.finish("unavailable", "none");
        else this.finish("ended", "none");
    }

    private addRemote(list: RTCIceCandidateInit[]) {
        if (list.length < this.remoteSeen) this.remoteSeen = 0;
        for (const candidate of list.slice(this.remoteSeen)) this.remoteQueue.push(candidate);
        this.remoteSeen = list.length;
    }

    private async flushRemote() {
        const pc = this.pc;
        if (!pc || !pc.remoteDescription) return;
        const queue = this.remoteQueue.splice(0);
        for (const candidate of queue) await pc.addIceCandidate(candidate).catch(() => undefined);
    }

    private async flushCandidates() {
        const callId = this.state.callId;
        if (!this.canSend || !callId || this.sending || !this.outgoing.length || this.closed) return;
        this.sending = true;
        const batch = this.outgoing.splice(0, CALL_LIMITS.candidatesPerRequest);
        try {
            await callsApi.candidates(callId, batch);
        } catch (error) {
            // Rate limited or a network blip: try again shortly (a vanished call ends through the watcher).
            if (!(error instanceof CallRequestError && (error.code === "not_found" || error.code === "invalid_request"))) {
                this.outgoing.unshift(...batch);
                this.later("send", 1_000, () => void this.flushCandidates());
            }
        } finally {
            this.sending = false;
        }
        if (this.outgoing.length && !this.timers.has("send")) this.later("send", 150, () => void this.flushCandidates());
    }

    /* ---------------------------- connection --------------------------- */

    private connecting() {
        this.later("connect", CALL_LIMITS.connectMs, () => this.fail());
        this.later("slow", SLOW_AFTER_MS, () => this.set({ slow: true }));
    }

    private connectionChanged() {
        const pc = this.pc;
        if (!pc || this.closed) return;
        const state = pc.connectionState;
        const ice = pc.iceConnectionState;
        if (state === "connected" || ice === "connected" || ice === "completed") {
            this.clear("connect");
            this.clear("slow");
            this.clear("drop");
            if (this.state.phase !== "active") this.set({ phase: "active", connectedAt: Date.now(), slow: false });
            void this.audio?.play().catch(() => undefined);
            return;
        }
        if (state === "failed" || ice === "failed") {
            this.fail();
            return;
        }
        if ((state === "disconnected" || ice === "disconnected") && this.state.phase === "active") {
            // Networks change (Wi-Fi to mobile…); give it a moment to recover.
            if (!this.timers.has("drop")) this.later("drop", CALL_LIMITS.disconnectGraceMs, () => this.fail());
        }
    }

    private fail() {
        this.finish(this.state.turnConfigured ? "failed" : "failed_turn", "remove");
    }

    /* ------------------------------ ending ----------------------------- */

    /** Hang up: cancels a ringing call, ends a running one. */
    hangUp() {
        if (this.closed) return;
        this.finish(null, "remove");
    }

    /** The tab is closing: tell the server in a way that survives unloading. */
    dispose() {
        if (this.closed) return;
        const callId = this.state.callId;
        // A call still ringing here keeps ringing on the user's other devices.
        if (callId && this.state.phase !== "incoming") callsApi.beacon(callId);
        this.closed = true;
        this.teardown();
        this.set({ phase: "ended", notice: null, slow: false, remoteSpeaking: false, localSpeaking: false });
    }

    /**
     * Ends the call locally. `remove` deletes the call document (the other
     * side sees it gone), `decline` tells the caller this side can't take it,
     * `none` leaves the document to whoever ended it.
     */
    private finish(notice: CallNotice | null, server: "remove" | "decline" | "none") {
        if (this.closed && this.state.phase === "ended") return;
        const callId = this.state.callId;
        this.closed = true;
        this.teardown();
        if (callId && server === "remove") void callsApi.end(callId, true).catch(() => undefined);
        if (callId && server === "decline") void callsApi.decline(callId, "unavailable").catch(() => undefined);
        this.set({ phase: "ended", notice, slow: false, remoteSpeaking: false, localSpeaking: false });
    }

    private stopLocal() {
        this.local?.getTracks().forEach((track) => track.stop());
        this.local = null;
    }

    private teardown() {
        for (const timer of this.timers.values()) window.clearTimeout(timer);
        this.timers.clear();
        this.stopWatch?.();
        this.stopWatch = null;
        this.stopLocal();
        const pc = this.pc;
        if (pc) {
            pc.ontrack = null;
            pc.onicecandidate = null;
            pc.onconnectionstatechange = null;
            pc.oniceconnectionstatechange = null;
            pc.close();
        }
        this.pc = null;
        this.remoteStream?.getTracks().forEach((track) => track.stop());
        this.remoteStream = null;
        if (this.audio) {
            this.audio.pause();
            this.audio.srcObject = null;
        }
        if (this.ownsAudio) this.audio = null;
        void this.audioContext?.close().catch(() => undefined);
        this.audioContext = null;
        this.analysers = { local: null, remote: null };
    }

    /* --------------------------- audio controls ------------------------ */

    setMuted(muted: boolean) {
        this.muted = muted;
        this.local?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    }

    setDeafened(deafened: boolean) {
        this.deafened = deafened;
        if (this.audio) this.audio.muted = deafened;
    }

    /* ------------------------------ meters ----------------------------- */

    private analyse(stream: MediaStream): AnalyserNode | null {
        if (!this.audioContext) return null;
        try {
            const source = this.audioContext.createMediaStreamSource(stream);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            return analyser;
        } catch {
            return null;
        }
    }

    /** Green "speaking" rings, like Discord: a level meter on both sides (best effort). */
    private startMeters() {
        try {
            const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            this.audioContext = AudioContextClass ? new AudioContextClass() : null;
            void this.audioContext?.resume().catch(() => undefined);
        } catch {
            this.audioContext = null;
        }
        if (!this.audioContext) return;
        if (this.local) this.analysers.local = this.analyse(this.local);
        const buffer = new Uint8Array(512);
        const level = (analyser: AnalyserNode | null) => {
            if (!analyser) return 0;
            analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (let index = 0; index < analyser.fftSize; index += 1) {
                const sample = (buffer[index] - 128) / 128;
                sum += sample * sample;
            }
            return Math.sqrt(sum / analyser.fftSize);
        };
        const tick = () => {
            const now = Date.now();
            if (!this.muted && level(this.analysers.local) > SPEAKING_LEVEL) this.lastLoud.local = now;
            if (level(this.analysers.remote) > SPEAKING_LEVEL) this.lastLoud.remote = now;
            this.set({
                localSpeaking: !this.muted && now - this.lastLoud.local < SPEAKING_HOLD_MS,
                remoteSpeaking: now - this.lastLoud.remote < SPEAKING_HOLD_MS,
            });
            this.later("meter", 150, tick);
        };
        this.later("meter", 150, tick);
    }
}
