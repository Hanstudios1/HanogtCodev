"use client";

/**
 * One 1:1 voice call in the browser: microphone, RTCPeerConnection, the
 * signalling through /api/calls (client.ts), timeouts, the "speaking"
 * indicators and the checks that tell people why they can't hear each other
 * (muted microphone, blocked playback, no audio arriving, a silent input
 * device). The React provider (components/VoiceCallProvider.tsx) creates one
 * per call and renders its state.
 *
 * Screen sharing: the offer and the answer each reserve a video track that
 * carries nothing until someone shares; sharing swaps the screen in with
 * replaceTrack, so it never needs another round of signalling. Calls with an
 * older client on the other end simply can't share.
 */
import { CallRequestError, callsApi, watchCall, type CallView } from "./client";
import { CALL_LIMITS, CALL_POLL, hasVideoSection, type CallDescription, type CallRole, type DeclineReason } from "./model";

export type CallPhase = "preparing" | "ringing" | "incoming" | "connecting" | "active" | "ended";

/** Why a call ended or couldn't start (shown to the user). */
export type CallNotice =
    | "declined" | "busy" | "unavailable" | "no_answer" | "missed" | "ended"
    | "failed" | "failed_turn" | "mic_denied" | "mic_missing" | "mic_busy" | "unsupported" | "ice"
    | "start_failed" | "inactive" | "not_friend" | "blocked" | "rate_limited" | "network";

/** How the audio travels: straight between the two browsers, or through the TURN relay. */
export type CallRoute = "direct" | "relay";

/** Why a screen couldn't be shared: no screen capture here (phones), it failed, or the call can't carry it. */
export type ShareProblem = "unsupported" | "failed" | "not_ready";

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
    route: CallRoute | null;
    /** The other side switched its microphone off. */
    remoteMuted: boolean;
    /** The browser refused to start the other side's audio; a click on "start audio" fixes it. */
    audioBlocked: boolean;
    /** Connected, but no audio data has arrived for a while. */
    noIncomingAudio: boolean;
    /** The microphone only delivers digital silence (wrong or switched-off input device). */
    micSilent: boolean;
    /** Audio received so far, in kilobytes. */
    receivedKb: number;
    /** Both sides reserved a video track and the call is connected: a screen can be shared. */
    canShare: boolean;
    /** This side is sharing its screen. */
    sharing: boolean;
    /** The other side is sharing its screen. */
    remoteSharing: boolean;
    /** Frames of the other side's screen are arriving. */
    remoteVideoLive: boolean;
    shareProblem: ShareProblem | null;
    /** Changes whenever the local or remote screen stream changes (so views pick up the new one). */
    screenVersion: number;
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
    /** Chosen microphone and speaker (Hanogt Social's audio settings); null = the system default. */
    inputDeviceId?: string | null;
    outputDeviceId?: string | null;
    onChange: (state: CallSessionState) => void;
};

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

const SPEAKING_LEVEL = 0.035;
const SPEAKING_HOLD_MS = 450;
/** getStats' audioLevel (0…1) above which the other side counts as speaking. */
const REMOTE_SPEAKING_LEVEL = 0.02;
const REMOTE_HOLD_MS = 800;
const SLOW_AFTER_MS = 8_000;
const STATS_EVERY_MS = 500;
/** Connected but no audio packets for this long: tell the user. */
const NO_AUDIO_AFTER_MS = 5_000;
/** Shared screens: frames per second and resolution the capture is asked for, and the bitrate cap. */
const SCREEN_CAPTURE: MediaStreamConstraints = { video: { frameRate: { ideal: 24, max: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: false };
const SCREEN_BITRATE = { direct: 2_500_000, relay: 1_200_000 } as const;
/** The microphone has delivered digital silence for this long: tell the user. */
const MIC_SILENT_AFTER_MS = 8_000;
const MIC_SILENT_LEVEL = 0.0004;

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

type StatsEntry = Record<string, unknown> & { id?: string; type?: string };

/** What getStats says about the call's audio and route (fields browsers may lack are null). */
export function readCallStats(report: { forEach(callback: (value: StatsEntry) => void): void }) {
    let bytes = 0;
    // `as`: assigned inside the callback, where TypeScript doesn't follow them.
    let level = null as number | null;
    let energy = null as { energy: number; duration: number } | null;
    let selectedPair = null as string | null;
    const pairs = new Map<string, StatsEntry>();
    const candidates = new Map<string, string>();
    report.forEach((entry) => {
        const isAudio = entry.kind === "audio" || entry.mediaType === "audio";
        if (entry.type === "inbound-rtp" && isAudio) {
            bytes += Number(entry.bytesReceived) || 0;
            if (typeof entry.audioLevel === "number") level = Math.max(level ?? 0, entry.audioLevel);
            if (typeof entry.totalAudioEnergy === "number" && typeof entry.totalSamplesDuration === "number") {
                energy = { energy: entry.totalAudioEnergy, duration: entry.totalSamplesDuration };
            }
        } else if (entry.type === "transport" && typeof entry.selectedCandidatePairId === "string") {
            selectedPair = entry.selectedCandidatePairId;
        } else if (entry.type === "candidate-pair" && typeof entry.id === "string") {
            pairs.set(entry.id, entry);
        } else if ((entry.type === "local-candidate" || entry.type === "remote-candidate") && typeof entry.id === "string") {
            candidates.set(entry.id, String(entry.candidateType ?? ""));
        }
    });
    // Chrome and Safari name the pair on the transport; Firefox marks it `selected`.
    const pair = (selectedPair ? pairs.get(selectedPair) : undefined)
        ?? [...pairs.values()].find((entry) => entry.selected === true)
        ?? [...pairs.values()].find((entry) => entry.nominated === true && entry.state === "succeeded");
    let route: CallRoute | null = null;
    if (pair) {
        const types = [candidates.get(String(pair.localCandidateId)), candidates.get(String(pair.remoteCandidateId))];
        route = types.includes("relay") ? "relay" : "direct";
    }
    return { bytes, level, energy, route };
}

export class CallSession {
    readonly role: CallRole;
    readonly peer: string;
    private readonly options: SessionOptions;
    private state: CallSessionState;
    private pc: RTCPeerConnection | null = null;
    private local: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private audio: SinkAudio | null = null;
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
    private inputDeviceId: string | null;
    private outputDeviceId: string | null;
    /** What the server last heard about this side's microphone (absent on the call = on). */
    private muteSent = false;
    private audioContext: AudioContext | null = null;
    private analysers: { local: AnalyserNode | null; remote: AnalyserNode | null } = { local: null, remote: null };
    private readonly lastLoud = { local: 0, remote: 0 };
    /** The other side's level comes from getStats; the Web Audio meter is only a fallback. */
    private remoteLevelFromStats = false;
    private lastEnergy: { energy: number; duration: number } | null = null;
    private received = { bytes: 0, changedAt: 0 };
    private micQuietSince = 0;
    /** The video track reserved for screen sharing (null when the other side's client can't). */
    private video: RTCRtpTransceiver | null = null;
    private screen: MediaStream | null = null;
    private remoteVideo: MediaStream | null = null;
    /** The server says both sides reserved video. */
    private shareReady = false;
    /** What the server last heard about this side's screen sharing. */
    private shareSent = false;

    constructor(options: SessionOptions) {
        this.options = options;
        this.role = options.role;
        this.peer = options.peer;
        this.muted = options.muted;
        this.deafened = options.deafened;
        this.inputDeviceId = options.inputDeviceId ?? null;
        this.outputDeviceId = options.outputDeviceId ?? null;
        this.state = {
            phase: options.role === "caller" ? "preparing" : "incoming",
            callId: options.callId,
            notice: null,
            connectedAt: 0,
            turnConfigured: true,
            slow: false,
            remoteSpeaking: false,
            localSpeaking: false,
            route: null,
            remoteMuted: false,
            audioBlocked: false,
            noIncomingAudio: false,
            micSilent: false,
            receivedKb: 0,
            canShare: false,
            sharing: false,
            remoteSharing: false,
            remoteVideoLive: false,
            shareProblem: null,
            screenVersion: 0,
        };
    }

    /** Whether this browser can capture a screen at all (desktop browsers; phones can't). */
    static screenShareSupported() {
        return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
    }

    /** The other side's screen (one video track), once the call negotiated it. */
    get remoteScreen() {
        return this.remoteVideo;
    }

    /** This side's shared screen while sharing (for the preview). */
    get localScreen() {
        return this.screen;
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

    private audioConstraints(): MediaTrackConstraints {
        const constraints: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
        // `ideal`: a microphone that was unplugged falls back to the default one instead of failing.
        if (this.inputDeviceId) constraints.deviceId = { ideal: this.inputDeviceId };
        return constraints;
    }

    /** The element that plays the other side (the page's, or a detached one). */
    private ensureAudio(): SinkAudio {
        if (!this.audio) {
            this.audio = this.options.audio ?? new Audio();
            this.ownsAudio = !this.options.audio;
            this.audio.autoplay = true;
            this.audio.muted = this.deafened;
            this.applySink();
        }
        return this.audio;
    }

    private ensureAudioContext() {
        if (this.audioContext) {
            if (this.audioContext.state === "suspended") void this.audioContext.resume().catch(() => undefined);
            return this.audioContext;
        }
        try {
            const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            this.audioContext = AudioContextClass ? new AudioContextClass() : null;
            void this.audioContext?.resume().catch(() => undefined);
        } catch {
            this.audioContext = null;
        }
        return this.audioContext;
    }

    /**
     * Called synchronously from the click that starts or answers the call:
     * browsers (Safari above all) then let the call audio and the level
     * meters play later, after the connection comes up.
     */
    unlock() {
        const audio = this.ensureAudio();
        try {
            void audio.play()?.catch(() => undefined);
        } catch {
            // Nothing to play yet; the click still counts.
        }
        this.ensureAudioContext();
    }

    /** Microphone and ICE servers, then the connection; false (and the call ended) when something fails. */
    private async prepare(): Promise<boolean> {
        if (!this.supported()) {
            this.finish("unsupported", this.role === "callee" ? "decline" : "remove");
            return false;
        }
        try {
            this.local = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints(), video: false });
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
        // The caller reserves a video track for screen sharing; the callee answers with one
        // when the offer has it (accept()). Sharing later only swaps the track in.
        if (this.role === "caller" && typeof pc.addTransceiver === "function") {
            try {
                this.video = pc.addTransceiver("video", { direction: "sendrecv" });
            } catch {
                this.video = null;
            }
        }
        const remote = new MediaStream();
        this.remoteStream = remote;
        const audio = this.ensureAudio();
        pc.ontrack = (event) => {
            if (event.track.kind === "video") {
                // The other side's screen: its own stream, shown by the call stage (not the <audio>).
                const track = event.track;
                this.remoteVideo = new MediaStream([track]);
                track.onunmute = () => this.set({ remoteVideoLive: true });
                track.onmute = () => this.set({ remoteVideoLive: false });
                this.set({ remoteVideoLive: !track.muted, screenVersion: this.state.screenVersion + 1 });
                return;
            }
            if (!remote.getTracks().includes(event.track)) remote.addTrack(event.track);
            // Attached only once the track is in the stream: some browsers never
            // play tracks added to a stream that was already attached empty.
            if (audio.srcObject !== remote) audio.srcObject = remote;
            this.playRemote();
            event.track.onunmute = () => this.playRemote();
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

    private playRemote() {
        const audio = this.audio;
        if (!audio || this.closed || !audio.srcObject) return;
        let attempt: Promise<void> | undefined;
        try {
            attempt = audio.play();
        } catch {
            attempt = undefined;
        }
        attempt?.then(() => this.set({ audioBlocked: false })).catch((error: unknown) => {
            // Autoplay rules: the browser wants a click before it plays sound.
            if (!this.closed && (error as { name?: string } | null)?.name === "NotAllowedError") this.set({ audioBlocked: true });
        });
    }

    /** The "start audio" button: a click lets the browser play the call. */
    resumeAudio() {
        this.ensureAudioContext();
        this.playRemote();
    }

    private applySink() {
        const audio = this.audio;
        if (!audio || typeof audio.setSinkId !== "function") return;
        // "" is the system default; a speaker that is gone keeps the current one.
        void audio.setSinkId(this.outputDeviceId ?? "").catch(() => undefined);
    }

    /** Speaker chosen in the audio settings (applies at once). */
    setOutputDevice(id: string | null) {
        if (id === this.outputDeviceId) return;
        this.outputDeviceId = id;
        this.applySink();
    }

    /** Microphone chosen in the audio settings: the running call switches to it without renegotiating. */
    async setInputDevice(id: string | null) {
        if (id === this.inputDeviceId) return;
        this.inputDeviceId = id;
        const pc = this.pc;
        if (!pc || this.closed || !this.local) return;
        try {
            const next = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints(), video: false });
            const track = next.getAudioTracks()[0];
            if (!track || this.closed || this.pc !== pc) {
                next.getTracks().forEach((entry) => entry.stop());
                return;
            }
            track.enabled = !this.muted;
            await pc.getSenders().find((sender) => sender.track?.kind === "audio")?.replaceTrack(track);
            this.local.getTracks().forEach((old) => old.stop());
            this.local = next;
            this.analysers.local = this.analyse(next);
            this.micQuietSince = 0;
            this.set({ micSilent: false });
        } catch {
            // The other microphone couldn't be opened: the call keeps the current one.
        }
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
            ({ callId } = await callsApi.start(this.peer, { type: "offer", sdp: offer.sdp ?? "" }, Boolean(this.video) && hasVideoSection(offer.sdp ?? "")));
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
        this.reportMute();
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
            this.claimVideo();
            await this.flushRemote();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            if (this.closed) return;
            await callsApi.answer(callId, { type: "answer", sdp: answer.sdp ?? "" }, Boolean(this.video) && hasVideoSection(answer.sdp ?? ""));
        } catch (error) {
            if (!this.closed) this.finish(requestNotice(error, "inactive"), "none");
            return;
        }
        if (this.closed) return;
        this.canSend = true;
        void this.flushCandidates();
        this.reportMute();
        this.connecting();
    }

    /** The caller's offer reserved a video track: answer with one too, so either side can share a screen. */
    private claimVideo() {
        const pc = this.pc;
        if (!pc || typeof pc.getTransceivers !== "function") return;
        const transceiver = pc.getTransceivers().find((item) => item.receiver?.track?.kind === "video" && !(item as RTCRtpTransceiver & { stopped?: boolean }).stopped);
        if (!transceiver) return;
        try {
            transceiver.direction = "sendrecv";
            this.video = transceiver;
        } catch {
            this.video = null;
        }
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
        this.shareReady = view.shareReady === true && Boolean(this.video);
        this.set({
            remoteMuted: view.remoteMuted === true,
            canShare: this.shareReady && this.state.phase === "active",
            remoteSharing: this.shareReady && view.remoteSharing === true,
        });
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

    /** Tells the other side when this microphone goes off or on (debounced; the last state wins). */
    private reportMute() {
        const callId = this.state.callId;
        if (!callId || !this.canSend || this.closed || this.muteSent === this.muted) return;
        this.later("mute", 250, () => {
            const muted = this.muted;
            if (this.muteSent === muted) return;
            this.muteSent = muted;
            void callsApi.mute(callId, muted).catch(() => {
                // Try again with the next change (or the next state check).
                this.muteSent = !muted;
            });
        });
    }

    /** Tells the other side when this screen starts or stops being shared (debounced; the last state wins). */
    private reportShare() {
        const callId = this.state.callId;
        if (!callId || !this.canSend || this.closed || this.shareSent === this.state.sharing) return;
        this.later("share", 150, () => {
            const sharing = this.state.sharing;
            if (this.shareSent === sharing) return;
            this.shareSent = sharing;
            void callsApi.share(callId, sharing).catch(() => {
                // Try again with the next change.
                this.shareSent = !sharing;
            });
        });
    }

    /* --------------------------- screen sharing ------------------------ */

    /**
     * Shares a screen, window or tab (the browser asks which). Call it from a
     * click. Using the browser's own "stop sharing" button stops it too.
     */
    async startShare(): Promise<boolean> {
        const pc = this.pc;
        const video = this.video;
        if (!pc || this.closed || this.state.sharing) return this.state.sharing;
        if (!CallSession.screenShareSupported()) {
            this.set({ shareProblem: "unsupported" });
            return false;
        }
        if (!this.state.canShare || !video) {
            this.set({ shareProblem: "not_ready" });
            return false;
        }
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia(SCREEN_CAPTURE);
        } catch (error) {
            // Closing the browser's picker isn't a problem worth a message.
            const name = (error as { name?: string } | null)?.name ?? "";
            this.set({ shareProblem: name === "NotAllowedError" || name === "AbortError" ? null : "failed" });
            return false;
        }
        const track = stream.getVideoTracks()[0];
        if (!track || this.closed || this.pc !== pc || this.state.phase !== "active") {
            stream.getTracks().forEach((item) => item.stop());
            return false;
        }
        try {
            // Text and code stay sharp; the frame rate gives way first.
            track.contentHint = "detail";
        } catch {
            // Older browsers don't know content hints.
        }
        try {
            await video.sender.replaceTrack(track);
        } catch {
            stream.getTracks().forEach((item) => item.stop());
            this.set({ shareProblem: "failed" });
            return false;
        }
        this.screen = stream;
        track.onended = () => void this.stopShare();
        void this.limitShareBitrate();
        this.set({ sharing: true, shareProblem: null, screenVersion: this.state.screenVersion + 1 });
        this.reportShare();
        return true;
    }

    /** Stops sharing (the reserved video track goes back to carrying nothing). */
    async stopShare() {
        const stream = this.screen;
        if (!stream) return;
        this.screen = null;
        stream.getTracks().forEach((track) => {
            track.onended = null;
            track.stop();
        });
        await this.video?.sender.replaceTrack(null).catch(() => undefined);
        if (this.closed) return;
        this.set({ sharing: false, screenVersion: this.state.screenVersion + 1 });
        this.reportShare();
    }

    /** The user read why sharing didn't work. */
    clearShareProblem() {
        this.set({ shareProblem: null });
    }

    /** Caps the screen's bitrate: lower through the TURN relay, where every byte is paid for. */
    private async limitShareBitrate() {
        const sender = this.video?.sender;
        if (!sender || !this.screen || typeof sender.getParameters !== "function") return;
        try {
            const parameters = sender.getParameters();
            if (!parameters.encodings?.length) parameters.encodings = [{}];
            parameters.encodings[0].maxBitrate = SCREEN_BITRATE[this.state.route ?? "relay"];
            await sender.setParameters(parameters);
        } catch {
            // The browser keeps its own limits.
        }
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
        // connectionState covers ICE and the encryption handshake (DTLS): audio
        // only flows once it is "connected". Old browsers only have the ICE state.
        const connected = state ? state === "connected" : ice === "connected" || ice === "completed";
        if (connected) {
            this.clear("connect");
            this.clear("slow");
            this.clear("drop");
            if (this.state.phase !== "active") {
                const now = Date.now();
                this.received = { bytes: 0, changedAt: now };
                this.set({ phase: "active", connectedAt: now, slow: false, canShare: this.shareReady });
            }
            this.playRemote();
            this.startStats();
            return;
        }
        if (state === "failed" || ice === "failed") {
            this.fail();
            return;
        }
        const dropped = state ? state === "disconnected" : ice === "disconnected";
        if (dropped && this.state.phase === "active") {
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
        this.set({ phase: "ended", notice: null, slow: false, remoteSpeaking: false, localSpeaking: false, audioBlocked: false, noIncomingAudio: false, micSilent: false, canShare: false, sharing: false, remoteSharing: false, remoteVideoLive: false });
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
        this.set({ phase: "ended", notice, slow: false, remoteSpeaking: false, localSpeaking: false, audioBlocked: false, noIncomingAudio: false, micSilent: false, canShare: false, sharing: false, remoteSharing: false, remoteVideoLive: false });
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
        this.screen?.getTracks().forEach((track) => {
            track.onended = null;
            track.stop();
        });
        this.screen = null;
        this.remoteVideo = null;
        this.video = null;
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
        this.micQuietSince = 0;
        if (muted) this.set({ micSilent: false });
        this.reportMute();
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

    /**
     * Green "speaking" rings, like Discord, and the silent-microphone check:
     * a Web Audio level meter on this side's microphone (best effort).
     */
    private startMeters() {
        if (!this.ensureAudioContext()) return;
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
            const local = level(this.analysers.local);
            if (!this.muted && local > SPEAKING_LEVEL) this.lastLoud.local = now;
            const patch: Partial<CallSessionState> = { localSpeaking: !this.muted && now - this.lastLoud.local < SPEAKING_HOLD_MS };
            if (!this.remoteLevelFromStats && this.analysers.remote) {
                if (level(this.analysers.remote) > SPEAKING_LEVEL) this.lastLoud.remote = now;
                patch.remoteSpeaking = now - this.lastLoud.remote < SPEAKING_HOLD_MS;
            }
            // Only judged while the meter really runs (a suspended audio context reads zeros).
            const metering = this.audioContext?.state === "running" && Boolean(this.analysers.local) && !this.muted
                && Boolean(this.local?.getAudioTracks().some((track) => track.enabled && track.readyState === "live"));
            if (!metering || local > MIC_SILENT_LEVEL) this.micQuietSince = 0;
            else if (!this.micQuietSince) this.micQuietSince = now;
            patch.micSilent = this.state.phase === "active" && this.micQuietSince > 0 && now - this.micQuietSince > MIC_SILENT_AFTER_MS;
            this.set(patch);
            this.later("meter", 150, tick);
        };
        this.later("meter", 150, tick);
    }

    /** Twice a second while connected: route, incoming audio and the other side's level. */
    private startStats() {
        if (this.timers.has("stats")) return;
        const tick = async () => {
            await this.readStats();
            if (!this.closed && this.pc) this.later("stats", STATS_EVERY_MS, () => void tick());
        };
        this.later("stats", STATS_EVERY_MS, () => void tick());
    }

    private async readStats() {
        const pc = this.pc;
        if (!pc || this.closed || typeof pc.getStats !== "function") return;
        let stats: ReturnType<typeof readCallStats>;
        try {
            stats = readCallStats(await pc.getStats() as unknown as Parameters<typeof readCallStats>[0]);
        } catch {
            return;
        }
        if (this.closed || this.pc !== pc) return;
        const now = Date.now();
        let level = stats.level;
        if (level === null && stats.energy) {
            // Safari and older Chrome: the level from the energy since the last reading.
            const previous = this.lastEnergy;
            this.lastEnergy = stats.energy;
            const duration = previous ? stats.energy.duration - previous.duration : 0;
            if (previous && duration > 0) level = Math.sqrt(Math.max(0, stats.energy.energy - previous.energy) / duration);
        }
        if (level !== null) {
            this.remoteLevelFromStats = true;
            if (level > REMOTE_SPEAKING_LEVEL) this.lastLoud.remote = now;
        } else if (!this.analysers.remote && this.remoteStream?.getAudioTracks().length) {
            // No level in the stats (some browsers): measure the other side with Web Audio instead.
            this.analysers.remote = this.analyse(this.remoteStream);
        }
        if (stats.bytes > this.received.bytes) this.received = { bytes: stats.bytes, changedAt: now };
        // The route became known or changed while sharing: the bitrate cap follows it.
        if (stats.route && stats.route !== this.state.route && this.screen) queueMicrotask(() => void this.limitShareBitrate());
        const active = this.state.phase === "active";
        this.set({
            route: stats.route ?? this.state.route,
            receivedKb: Math.floor(stats.bytes / 1024),
            noIncomingAudio: active && now - Math.max(this.received.changedAt, this.state.connectedAt) > NO_AUDIO_AFTER_MS,
            ...(this.remoteLevelFromStats ? { remoteSpeaking: now - this.lastLoud.remote < REMOTE_HOLD_MS } : {}),
        });
    }
}
