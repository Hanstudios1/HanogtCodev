/**
 * Voice chat of a live session: a small WebRTC mesh (2–5 people, everyone
 * connected to everyone). Signalling goes through the session transport
 * (/api/collab/[id]/call and the participant's inbox); ICE/TURN servers come
 * from /api/calls/ice like the 1:1 calls in VoiceCallProvider. Audio flows
 * peer to peer (or through the TURN relay) and is never recorded.
 *
 * Who connects to whom: every pair has one RTCPeerConnection and the peer
 * with the smaller id makes the offer, so offers never collide. Peers are
 * the participants whose awareness says they're in the call.
 */
export type MeshPeerId = string;
export type MeshSignalKind = "offer" | "answer" | "candidates" | "bye";
export type MeshConnection = "connecting" | "connected" | "failed";

export type MeshCallState = {
    status: "idle" | "joining" | "active";
    muted: boolean;
    deafened: boolean;
    /** Peers (and "self") whose audio is above the speaking threshold. */
    speaking: string[];
    connections: Record<MeshPeerId, MeshConnection>;
    error: "mic_denied" | "mic_unavailable" | "ice" | "unsupported" | null;
    /** False when no TURN server is configured (some networks then can't connect). */
    turnConfigured: boolean;
    /** The browser refused to start the incoming audio by itself (resumeAudio() from a click fixes it). */
    audioBlocked: boolean;
};

export const IDLE_CALL: MeshCallState = { status: "idle", muted: false, deafened: false, speaking: [], connections: {}, error: null, turnConfigured: true, audioBlocked: false };

export const SELF_PEER = "self";

type MeshOptions = {
    selfId: MeshPeerId;
    send: (to: MeshPeerId, kind: MeshSignalKind, data: string) => void;
    onChange: (state: MeshCallState) => void;
    /** Microphone and speaker picked in the voice settings (null: the system default). */
    inputDeviceId?: string | null;
    outputDeviceId?: string | null;
};

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

type Peer = {
    id: MeshPeerId;
    pc: RTCPeerConnection;
    initiator: boolean;
    audio: SinkAudio;
    stream: MediaStream;
    pendingRemote: RTCIceCandidateInit[];
    outgoing: RTCIceCandidateInit[];
    candidateTimer: number | null;
    restartTimer: number | null;
    restarts: number;
    analyser: AnalyserNode | null;
};

const SPEAKING_LEVEL = 0.035;
const SPEAKING_HOLD_MS = 450;
const MAX_PEERS = 4;
/** People in one voice call, yourself included: every one connects to every other, whatever the plan. */
export const MESH_MAX_PEOPLE = MAX_PEERS + 1;

function parseDescription(data: string): RTCSessionDescriptionInit | null {
    try {
        const value = JSON.parse(data) as { type?: unknown; sdp?: unknown };
        if ((value.type === "offer" || value.type === "answer") && typeof value.sdp === "string" && value.sdp.length < 15_000) return { type: value.type, sdp: value.sdp };
    } catch {
        // Ignored below.
    }
    return null;
}

function parseCandidates(data: string): RTCIceCandidateInit[] {
    try {
        const value = JSON.parse(data) as unknown;
        if (!Array.isArray(value)) return [];
        return value.slice(0, 40).flatMap((entry) => {
            const candidate = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
            if (!candidate || typeof candidate.candidate !== "string" || candidate.candidate.length > 1_000) return [];
            return [{
                candidate: candidate.candidate,
                sdpMid: typeof candidate.sdpMid === "string" ? candidate.sdpMid : null,
                sdpMLineIndex: typeof candidate.sdpMLineIndex === "number" ? candidate.sdpMLineIndex : null,
                usernameFragment: typeof candidate.usernameFragment === "string" ? candidate.usernameFragment : null,
            }];
        });
    } catch {
        return [];
    }
}

export class MeshCall {
    private readonly options: MeshOptions;
    private state: MeshCallState = { ...IDLE_CALL };
    private readonly peers = new Map<MeshPeerId, Peer>();
    private wanted = new Set<MeshPeerId>();
    private local: MediaStream | null = null;
    private iceServers: RTCIceServer[] = [];
    private audioContext: AudioContext | null = null;
    private localAnalyser: AnalyserNode | null = null;
    private meterTimer: number | null = null;
    private readonly lastLoud = new Map<string, number>();
    private mutedBeforeDeafen = false;
    private closed = false;
    private inputDeviceId: string | null;
    private outputDeviceId: string | null;

    constructor(options: MeshOptions) {
        this.options = options;
        this.inputDeviceId = options.inputDeviceId ?? null;
        this.outputDeviceId = options.outputDeviceId ?? null;
    }

    get current() {
        return this.state;
    }

    private update(patch: Partial<MeshCallState>) {
        this.state = { ...this.state, ...patch };
        this.options.onChange(this.state);
    }

    /** Microphone and ICE servers; call from a click (autoplay and AudioContext need a user gesture). */
    async join(): Promise<boolean> {
        if (this.state.status !== "idle" || this.closed) return this.state.status === "active";
        if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            this.update({ error: "unsupported" });
            return false;
        }
        this.update({ status: "joining", error: null });
        try {
            this.local = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints(), video: false });
        } catch (error) {
            const name = error instanceof DOMException ? error.name : "";
            this.update({ status: "idle", error: name === "NotFoundError" || name === "OverconstrainedError" ? "mic_unavailable" : "mic_denied" });
            return false;
        }
        try {
            const response = await fetch("/api/calls/ice", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin" });
            if (!response.ok) throw new Error("ice");
            const data = await response.json() as { iceServers?: RTCIceServer[]; turnConfigured?: boolean };
            this.iceServers = Array.isArray(data.iceServers) ? data.iceServers : [];
            this.update({ turnConfigured: data.turnConfigured !== false });
        } catch {
            this.local.getTracks().forEach((track) => track.stop());
            this.local = null;
            this.update({ status: "idle", error: "ice" });
            return false;
        }
        if (this.closed) {
            this.local.getTracks().forEach((track) => track.stop());
            return false;
        }
        this.startMeters();
        this.update({ status: "active" });
        this.reconcile();
        return true;
    }

    private audioConstraints(): MediaTrackConstraints {
        const constraints: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
        // `ideal`: a microphone that was unplugged falls back to the default one instead of failing.
        if (this.inputDeviceId) constraints.deviceId = { ideal: this.inputDeviceId };
        return constraints;
    }

    private play(audio: HTMLAudioElement) {
        void audio.play().catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "NotAllowedError" && !this.closed) this.update({ audioBlocked: true });
        });
    }

    /** Starts audio the browser held back (call from a click). */
    resumeAudio() {
        void this.audioContext?.resume().catch(() => undefined);
        for (const peer of this.peers.values()) void peer.audio.play().catch(() => undefined);
        this.update({ audioBlocked: false });
    }

    private applySink(audio: SinkAudio) {
        // "" is the system default; a speaker that is gone keeps the current one.
        if (typeof audio.setSinkId === "function") void audio.setSinkId(this.outputDeviceId ?? "").catch(() => undefined);
    }

    /** Speaker chosen in the voice settings (applies at once). */
    setOutputDevice(id: string | null) {
        if (id === this.outputDeviceId) return;
        this.outputDeviceId = id;
        for (const peer of this.peers.values()) this.applySink(peer.audio);
    }

    /** Microphone chosen in the voice settings: every connection switches to it without renegotiating. */
    async setInputDevice(id: string | null) {
        if (id === this.inputDeviceId) return;
        this.inputDeviceId = id;
        if (this.state.status !== "active" || !this.local) return;
        try {
            const next = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints(), video: false });
            const track = next.getAudioTracks()[0];
            if (!track || this.closed || !this.local) {
                next.getTracks().forEach((entry) => entry.stop());
                return;
            }
            track.enabled = !this.state.muted;
            for (const peer of this.peers.values()) {
                await peer.pc.getSenders().find((sender) => sender.track?.kind === "audio")?.replaceTrack(track).catch(() => undefined);
            }
            this.local.getTracks().forEach((old) => old.stop());
            this.local = next;
            this.localAnalyser = this.analyse(next);
        } catch {
            // The other microphone couldn't be opened: the call keeps the current one.
        }
    }

    /** The peers that should be connected (participants whose awareness says they're in the call). */
    setPeers(ids: readonly MeshPeerId[]) {
        this.wanted = new Set(ids.filter((id) => id !== this.options.selfId).slice(0, MAX_PEERS));
        this.reconcile();
    }

    private reconcile() {
        if (this.state.status !== "active") return;
        for (const [id] of this.peers) if (!this.wanted.has(id)) this.closePeer(id, true);
        for (const id of this.wanted) {
            if (this.peers.has(id) || this.options.selfId > id) continue;
            // The smaller id offers.
            void this.offer(this.createPeer(id, true));
        }
    }

    private createPeer(id: MeshPeerId, initiator: boolean): Peer {
        const pc = new RTCPeerConnection({ iceServers: this.iceServers, iceCandidatePoolSize: 4 });
        const audio: SinkAudio = new Audio();
        audio.autoplay = true;
        audio.muted = this.state.deafened;
        this.applySink(audio);
        const stream = new MediaStream();
        audio.srcObject = stream;
        const peer: Peer = { id, pc, initiator, audio, stream, pendingRemote: [], outgoing: [], candidateTimer: null, restartTimer: null, restarts: 0, analyser: null };
        this.local?.getTracks().forEach((track) => pc.addTrack(track, this.local as MediaStream));
        pc.ontrack = (event) => {
            for (const track of event.streams[0]?.getTracks() ?? [event.track]) if (!stream.getTracks().includes(track)) stream.addTrack(track);
            this.play(audio);
            peer.analyser = this.analyse(stream);
        };
        pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            peer.outgoing.push(event.candidate.toJSON());
            if (peer.candidateTimer === null) {
                peer.candidateTimer = window.setTimeout(() => {
                    peer.candidateTimer = null;
                    const batch = peer.outgoing.splice(0, 40);
                    if (batch.length) this.options.send(id, "candidates", JSON.stringify(batch));
                }, 200);
            }
        };
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (state === "connected") {
                peer.restarts = 0;
                this.setConnection(id, "connected");
            } else if (state === "failed") {
                this.setConnection(id, "failed");
                this.scheduleRestart(peer);
            } else if (state === "disconnected") {
                // Often recovers by itself; restart if it doesn't.
                this.scheduleRestart(peer, 5_000);
            }
        };
        this.peers.set(id, peer);
        this.setConnection(id, "connecting");
        return peer;
    }

    private async offer(peer: Peer, iceRestart = false) {
        try {
            const offer = await peer.pc.createOffer({ iceRestart });
            await peer.pc.setLocalDescription(offer);
            this.options.send(peer.id, "offer", JSON.stringify({ type: offer.type, sdp: offer.sdp }));
        } catch {
            this.setConnection(peer.id, "failed");
        }
    }

    private scheduleRestart(peer: Peer, delay = 1_000) {
        if (!peer.initiator || peer.restartTimer !== null || this.peers.get(peer.id) !== peer) return;
        peer.restartTimer = window.setTimeout(() => {
            peer.restartTimer = null;
            if (this.peers.get(peer.id) !== peer || peer.pc.connectionState === "connected") return;
            if (peer.restarts >= 3) {
                // Start over with a new connection.
                this.closePeer(peer.id, false);
                if (this.wanted.has(peer.id)) void this.offer(this.createPeer(peer.id, true));
                return;
            }
            peer.restarts += 1;
            void this.offer(peer, true);
        }, delay);
    }

    /** A signal from another participant (already authenticated by the server). */
    async handleSignal(from: MeshPeerId, kind: MeshSignalKind, data: string) {
        if (this.state.status !== "active" || from === this.options.selfId) return;
        if (kind === "bye") {
            this.closePeer(from, false);
            return;
        }
        if (kind === "offer") {
            const description = parseDescription(data);
            if (!description || description.type !== "offer") return;
            let peer = this.peers.get(from);
            if (peer?.initiator) {
                // Both sides think they offer (ids changed after a reload): the smaller id wins.
                if (this.options.selfId < from) return;
                this.closePeer(from, false);
                peer = undefined;
            }
            if (!peer) {
                if (this.peers.size >= MAX_PEERS) return;
                peer = this.createPeer(from, false);
            }
            try {
                await peer.pc.setRemoteDescription(description);
                await this.flushRemoteCandidates(peer);
                const answer = await peer.pc.createAnswer();
                await peer.pc.setLocalDescription(answer);
                this.options.send(from, "answer", JSON.stringify({ type: answer.type, sdp: answer.sdp }));
            } catch {
                this.setConnection(from, "failed");
            }
            return;
        }
        const peer = this.peers.get(from);
        if (!peer) return;
        if (kind === "answer") {
            const description = parseDescription(data);
            if (!description || description.type !== "answer" || peer.pc.signalingState !== "have-local-offer") return;
            try {
                await peer.pc.setRemoteDescription(description);
                await this.flushRemoteCandidates(peer);
            } catch {
                this.setConnection(from, "failed");
            }
            return;
        }
        for (const candidate of parseCandidates(data)) {
            if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate).catch(() => undefined);
            else peer.pendingRemote.push(candidate);
        }
    }

    private async flushRemoteCandidates(peer: Peer) {
        const pending = peer.pendingRemote.splice(0);
        for (const candidate of pending) await peer.pc.addIceCandidate(candidate).catch(() => undefined);
    }

    private closePeer(id: MeshPeerId, sayBye: boolean) {
        const peer = this.peers.get(id);
        if (!peer) return;
        this.peers.delete(id);
        if (peer.candidateTimer !== null) window.clearTimeout(peer.candidateTimer);
        if (peer.restartTimer !== null) window.clearTimeout(peer.restartTimer);
        peer.pc.onicecandidate = null;
        peer.pc.ontrack = null;
        peer.pc.onconnectionstatechange = null;
        peer.pc.close();
        peer.audio.pause();
        peer.audio.srcObject = null;
        peer.stream.getTracks().forEach((track) => track.stop());
        if (sayBye) this.options.send(id, "bye", "");
        const connections = { ...this.state.connections };
        delete connections[id];
        this.lastLoud.delete(id);
        this.update({ connections, speaking: this.state.speaking.filter((entry) => entry !== id) });
    }

    private setConnection(id: MeshPeerId, value: MeshConnection) {
        if (this.state.connections[id] === value) return;
        this.update({ connections: { ...this.state.connections, [id]: value } });
    }

    setMuted(muted: boolean) {
        this.local?.getAudioTracks().forEach((track) => {
            track.enabled = !muted;
        });
        this.update({ muted });
    }

    /** Deafening also mutes the microphone; undeafening restores the earlier mute state. */
    setDeafened(deafened: boolean) {
        if (deafened === this.state.deafened) return;
        for (const peer of this.peers.values()) peer.audio.muted = deafened;
        if (deafened) {
            this.mutedBeforeDeafen = this.state.muted;
            this.update({ deafened });
            this.setMuted(true);
        } else {
            this.update({ deafened });
            this.setMuted(this.mutedBeforeDeafen);
        }
    }

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

    private startMeters() {
        try {
            const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            this.audioContext = AudioContextClass ? new AudioContextClass() : null;
            void this.audioContext?.resume().catch(() => undefined);
        } catch {
            this.audioContext = null;
        }
        if (this.local) this.localAnalyser = this.analyse(this.local);
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
        this.meterTimer = window.setInterval(() => {
            const now = Date.now();
            const loud = (id: string, value: number) => {
                if (value > SPEAKING_LEVEL) this.lastLoud.set(id, now);
                return now - (this.lastLoud.get(id) ?? 0) < SPEAKING_HOLD_MS;
            };
            const speaking: string[] = [];
            if (!this.state.muted && loud(SELF_PEER, level(this.localAnalyser))) speaking.push(SELF_PEER);
            for (const peer of this.peers.values()) if (loud(peer.id, level(peer.analyser))) speaking.push(peer.id);
            if (speaking.join("|") !== this.state.speaking.join("|")) this.update({ speaking });
        }, 150);
    }

    /** Hangs up: everyone gets a "bye", the microphone is released. */
    leave() {
        if (this.closed) return;
        this.closed = true;
        for (const id of [...this.peers.keys()]) this.closePeer(id, true);
        if (this.meterTimer !== null) window.clearInterval(this.meterTimer);
        this.meterTimer = null;
        this.local?.getTracks().forEach((track) => track.stop());
        this.local = null;
        void this.audioContext?.close().catch(() => undefined);
        this.audioContext = null;
        this.update({ ...IDLE_CALL, turnConfigured: this.state.turnConfigured });
    }
}
