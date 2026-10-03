// Run: node --test scripts/tests/
// The browser call engine (lib/calls/session.ts) end to end: two people's
// CallSessions talk through the real server logic of /api/calls (polling, as
// browsers without the Firebase bridge do) over the in-memory Firestore
// stand-in. WebRTC and the microphone are faked; whose request it is comes
// from AsyncLocalStorage (each side runs in its own context).
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import { setFakeEmulatorEnv, createBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
globalThis.window = globalThis;
if (!globalThis.navigator) globalThis.navigator = {};
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
Object.defineProperty(globalThis.navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => new FakeStream([new FakeTrack()]) } });
Object.defineProperty(globalThis.navigator, "sendBeacon", { configurable: true, value: () => true });

class FakeTrack { constructor() { this.enabled = true; this.stopped = false; } stop() { this.stopped = true; } }
class FakeStream { constructor(tracks = []) { this.tracks = [...tracks]; } getTracks() { return this.tracks; } getAudioTracks() { return this.tracks; } addTrack(track) { this.tracks.push(track); } }
globalThis.MediaStream = FakeStream;
globalThis.Audio = class { constructor() { this.muted = false; this.srcObject = null; } play() { return Promise.resolve(); } pause() {} };

const connections = [];
let candidateCounter = 0;
class FakePeer {
    constructor() {
        this.localDescription = null;
        this.remoteDescription = null;
        this.connectionState = "new";
        this.iceConnectionState = "new";
        this.remoteCandidates = [];
        this.closed = false;
        this.statsCalls = 0;
        connections.push(this);
    }
    addTrack() {}
    getSenders() { return []; }
    // Audio arriving at 4 KB a second over a direct path, as Chrome reports it.
    async getStats() {
        const bytes = this.connectionState === "connected" ? 4_000 * (1 + this.statsCalls++) : 0;
        return new Map([
            ["in", { id: "in", type: "inbound-rtp", kind: "audio", bytesReceived: bytes, audioLevel: 0.2 }],
            ["t", { id: "t", type: "transport", selectedCandidatePairId: "p" }],
            ["p", { id: "p", type: "candidate-pair", localCandidateId: "l", remoteCandidateId: "r", state: "succeeded", nominated: true }],
            ["l", { id: "l", type: "local-candidate", candidateType: "host" }],
            ["r", { id: "r", type: "remote-candidate", candidateType: "srflx" }],
        ]);
    }
    async createOffer() { return { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n" }; }
    async createAnswer() { return { type: "answer", sdp: "v=0\r\no=- 2 2 IN IP4 0.0.0.0\r\n" }; }
    async setLocalDescription(description) {
        this.localDescription = description;
        // Gathering: a few candidates arrive shortly after.
        for (let index = 0; index < 3; index += 1) {
            setTimeout(() => {
                if (this.closed) return;
                const n = ++candidateCounter;
                this.onicecandidate?.({ candidate: { candidate: `candidate:${n} 1 udp 1 10.0.0.${n} 5000 typ host`, toJSON: () => ({ candidate: `candidate:${n} 1 udp 1 10.0.0.${n} 5000 typ host`, sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "u" }) } });
            }, 5 + index * 5);
        }
        this.check();
    }
    async setRemoteDescription(description) {
        if (!description?.sdp) throw new Error("bad description");
        this.remoteDescription = description;
        this.check();
    }
    async addIceCandidate(candidate) {
        if (!this.remoteDescription) throw new Error("no remote description");
        this.remoteCandidates.push(candidate);
        this.check();
    }
    check() {
        if (this.closed || this.connectionState === "connected") return;
        if (this.localDescription && this.remoteDescription && this.remoteCandidates.length) {
            setTimeout(() => {
                if (this.closed) return;
                this.connectionState = "connected";
                this.iceConnectionState = "connected";
                this.onconnectionstatechange?.();
            }, 5);
        }
    }
    close() { this.closed = true; this.connectionState = "closed"; }
}
globalThis.RTCPeerConnection = FakePeer;

const identity = new AsyncLocalStorage();
const model = await load("lib/calls/model.ts");
const server = await load("lib/server/calls.ts");
const { CallSession, readCallStats } = await load("lib/calls/session.ts");
const { watchIncoming } = await load("lib/calls/client.ts");

// Fast timings for the simulation.
Object.assign(model.CALL_POLL, { incomingVisibleMs: 30, incomingHiddenMs: 30, ringingMs: 20, connectingMs: 20, activeMs: 30 });

const A = "ali@example.com", B = "berk@example.com";
const users = { [A]: { email: A, friends: [B], blockedUsers: [] }, [B]: { email: B, friends: [A], blockedUsers: [] } };
const seed = () => ({
    [`users/${A}`]: { email: A, friends: [B], blockedUsers: [] },
    [`users/${B}`]: { email: B, friends: [A], blockedUsers: [] },
    [`public_profiles/${A}`]: { username: "Ali" },
});

function reply(status, data) {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function api(url, init = {}) {
    const me = identity.getStore();
    assert.ok(me, `request without identity: ${url}`);
    const user = users[me];
    const parsed = new URL(url, "http://local");
    const body = init.body ? JSON.parse(init.body) : {};
    try {
        if (parsed.pathname === "/api/calls/ice") return reply(200, { iceServers: [], turnConfigured: false });
        if (parsed.pathname === "/api/calls/incoming") return reply(200, await server.listIncomingCalls(user));
        if (parsed.pathname === "/api/calls/cleanup") return reply(200, await server.deleteCall(me, body.callId));
        if (parsed.pathname === "/api/calls" && (init.method || "GET") === "GET") return reply(200, await server.readCall(user, parsed.searchParams.get("id"), Number(parsed.searchParams.get("have"))));
        if (parsed.pathname === "/api/calls") {
            switch (body.action) {
                case "start": return reply(201, await server.startCall(user, body));
                case "answer": return reply(200, await server.answerCall(user, body));
                case "decline": return reply(200, await server.declineCall(user, body));
                case "end": return reply(200, await server.deleteCall(me, body.callId));
                case "candidates": return reply(200, await server.addCandidates(user, body));
                case "mute": return reply(200, await server.setCallMuted(user, body));
            }
        }
        return reply(404, { code: "not_found" });
    } catch (error) {
        if (error instanceof server.CallApiError) return reply(error.status, { code: error.code, error: error.message });
        throw error;
    }
}

async function withWorld(run) {
    const backend = createBackend(seed());
    const original = globalThis.fetch;
    globalThis.fetch = (input, init) => (typeof input === "string" && input.startsWith("/api/") ? api(input, init) : backend.fetch(input, init));
    try {
        return await run(backend);
    } finally {
        globalThis.fetch = original;
    }
}

const until = async (predicate, ms = 8_000) => {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > ms) throw new Error(`timed out: ${predicate.toString().slice(0, 160)}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

function session(me, options) {
    const states = [];
    const created = identity.run(me, () => new CallSession({ live: false, muted: false, deafened: false, audio: null, onChange: (state) => states.push(state), ...options }));
    return { created, states, last: () => states[states.length - 1] ?? created.current };
}

/** B's browser: rings via polling, then reacts with `answer`. */
function callee(react) {
    const sessions = [];
    const stop = identity.run(B, () => watchIncoming({
        email: B,
        live: false,
        onCalls: (calls) => {
            for (const call of calls) {
                if (sessions.some((entry) => entry.created.current.callId === call.id)) continue;
                const entry = session(B, { role: "callee", peer: call.caller, callId: call.id });
                sessions.push(entry);
                identity.run(B, () => {
                    entry.created.startIncoming();
                    setTimeout(() => void react(entry.created), 50);
                });
            }
        },
    }));
    return { sessions, stop };
}

test("a call rings, connects on both sides and ends when the caller hangs up", async () => {
    await withWorld(async (db) => {
        const b = callee((created) => created.accept());
        const a = session(A, { role: "caller", peer: B, callId: null });
        await identity.run(A, () => a.created.startOutgoing());
        await until(() => b.sessions.length === 1);
        await until(() => a.last().phase === "active" && b.sessions[0].last().phase === "active");
        assert.ok(a.last().connectedAt > 0);
        assert.equal(db.get(`calls/${a.last().callId}`).status, "active");
        identity.run(A, () => a.created.hangUp());
        await until(() => b.sessions[0].last().phase === "ended");
        assert.equal(b.sessions[0].last().notice, "ended");
        assert.equal(a.last().notice, null);
        assert.equal(db.has(`calls/${a.last().callId}`), false);
        b.stop();
    });
});

test("declined: the caller is told and the call is cleaned up", async () => {
    await withWorld(async (db) => {
        const b = callee((created) => created.decline("declined"));
        const a = session(A, { role: "caller", peer: B, callId: null });
        await identity.run(A, () => a.created.startOutgoing());
        await until(() => a.last().phase === "ended");
        assert.equal(a.last().notice, "declined");
        await until(() => !db.has(`calls/${a.last().callId}`));
        b.stop();
    });
});

test("busy and unavailable reach the caller", async () => {
    for (const reason of ["busy", "unavailable"]) {
        await withWorld(async () => {
            const b = callee((created) => created.decline(reason));
            const a = session(A, { role: "caller", peer: B, callId: null });
            await identity.run(A, () => a.created.startOutgoing());
            await until(() => a.last().phase === "ended");
            assert.equal(a.last().notice, reason);
            b.stop();
        });
    }
});

test("no answer: the caller gives up, the callee sees a missed call", async () => {
    const previous = model.CALL_LIMITS.ringMs;
    model.CALL_LIMITS.ringMs = 400;
    try {
        await withWorld(async (db) => {
            const b = callee(() => undefined);
            const a = session(A, { role: "caller", peer: B, callId: null });
            await identity.run(A, () => a.created.startOutgoing());
            await until(() => a.last().phase === "ended");
            assert.equal(a.last().notice, "no_answer");
            await until(() => b.sessions[0]?.last().phase === "ended");
            assert.equal(b.sessions[0].last().notice, "missed");
            assert.equal(db.has(`calls/${a.last().callId}`), false);
            b.stop();
        });
    } finally {
        model.CALL_LIMITS.ringMs = previous;
    }
});

test("the caller cancels while it rings", async () => {
    await withWorld(async () => {
        const b = callee(() => undefined);
        const a = session(A, { role: "caller", peer: B, callId: null });
        await identity.run(A, () => a.created.startOutgoing());
        await until(() => b.sessions.length === 1 && b.sessions[0].last().phase === "incoming");
        identity.run(A, () => a.created.hangUp());
        await until(() => b.sessions[0].last().phase === "ended");
        assert.equal(b.sessions[0].last().notice, "missed");
        b.stop();
    });
});

test("the callee hangs up during the call", async () => {
    await withWorld(async (db) => {
        const b = callee((created) => created.accept());
        const a = session(A, { role: "caller", peer: B, callId: null });
        await identity.run(A, () => a.created.startOutgoing());
        await until(() => a.last().phase === "active" && b.sessions[0]?.last().phase === "active");
        identity.run(B, () => b.sessions[0].created.hangUp());
        await until(() => a.last().phase === "ended");
        assert.equal(a.last().notice, "ended");
        assert.equal(db.has(`calls/${a.last().callId}`), false);
        b.stop();
    });
});

test("microphone denied on the callee side declines as unavailable", async () => {
    const original = navigator.mediaDevices.getUserMedia;
    await withWorld(async () => {
        const b = callee(async (created) => {
            navigator.mediaDevices.getUserMedia = async () => { const error = new Error("denied"); error.name = "NotAllowedError"; throw error; };
            await created.accept();
            navigator.mediaDevices.getUserMedia = original;
        });
        const a = session(A, { role: "caller", peer: B, callId: null });
        await identity.run(A, () => a.created.startOutgoing());
        await until(() => b.sessions[0]?.last().phase === "ended");
        assert.equal(b.sessions[0].last().notice, "mic_denied");
        await until(() => a.last().phase === "ended");
        assert.equal(a.last().notice, "unavailable");
        b.stop();
    });
    navigator.mediaDevices.getUserMedia = original;
});

test("calling a stranger fails clearly", async () => {
    await withWorld(async () => {
        const a = session(A, { role: "caller", peer: "cem@example.com", callId: null });
        await identity.run(A, () => a.created.startOutgoing());
        assert.equal(a.last().phase, "ended");
        assert.equal(a.last().notice, "not_friend");
    });
});

test("muting reaches the other side, and unmuting clears it", async () => {
    await withWorld(async (db) => {
        const b = callee((created) => created.accept());
        const a = session(A, { role: "caller", peer: B, callId: null });
        await identity.run(A, () => a.created.startOutgoing());
        await until(() => a.last().phase === "active" && b.sessions[0]?.last().phase === "active");
        identity.run(A, () => a.created.setMuted(true));
        await until(() => b.sessions[0].last().remoteMuted === true);
        assert.equal(db.get(`calls/${a.last().callId}`).callerMuted, true);
        identity.run(A, () => a.created.setMuted(false));
        await until(() => b.sessions[0].last().remoteMuted === false);
        identity.run(A, () => a.created.hangUp());
        await until(() => b.sessions[0].last().phase === "ended");
        b.stop();
    });
});

test("a call that starts muted tells the other side once it rings", async () => {
    await withWorld(async (db) => {
        const b = callee((created) => created.accept());
        const a = session(A, { role: "caller", peer: B, callId: null, muted: true });
        await identity.run(A, () => a.created.startOutgoing());
        await until(() => b.sessions[0]?.last().phase === "active");
        await until(() => b.sessions[0].last().remoteMuted === true);
        assert.equal(db.get(`calls/${a.last().callId}`).callerMuted, true);
        identity.run(A, () => a.created.hangUp());
        await until(() => b.sessions[0].last().phase === "ended");
        b.stop();
    });
});

test("connected means ICE and the encryption handshake, and stats report route and audio", async () => {
    await withWorld(async () => {
        const b = callee(() => undefined);
        const a = session(A, { role: "caller", peer: B, callId: null });
        await identity.run(A, () => a.created.startOutgoing());
        await until(() => a.last().phase === "ringing" && b.sessions[0]?.last().phase === "incoming");
        const pc = connections[connections.length - 1];
        // ICE is up but DTLS isn't: no audio can flow yet.
        // The browser's events run in A's tab (A's requests).
        const fire = (handler) => identity.run(A, () => pc[handler]?.());
        pc.iceConnectionState = "connected";
        pc.connectionState = "connecting";
        fire("oniceconnectionstatechange");
        assert.equal(a.last().phase, "ringing");
        pc.connectionState = "connected";
        fire("onconnectionstatechange");
        assert.equal(a.last().phase, "active");
        await until(() => a.last().route === "direct" && a.last().receivedKb > 0 && a.last().remoteSpeaking);
        // DTLS fails while ICE still says connected: the call ends instead of staying silent.
        pc.connectionState = "failed";
        fire("onconnectionstatechange");
        assert.equal(a.last().phase, "ended");
        assert.equal(a.last().notice, "failed_turn");
        // The callee's ringing stops once the call is gone (sessions must end before the fake server goes away).
        await until(() => b.sessions[0]?.last().phase === "ended");
        b.stop();
    });
});

test("readCallStats: Chrome and Firefox shaped reports", () => {
    const chrome = readCallStats(new Map([
        ["in", { id: "in", type: "inbound-rtp", kind: "audio", bytesReceived: 9000, audioLevel: 0.05 }],
        ["in2", { id: "in2", type: "inbound-rtp", kind: "video", bytesReceived: 1 }],
        ["t", { id: "t", type: "transport", selectedCandidatePairId: "p2" }],
        ["p1", { id: "p1", type: "candidate-pair", localCandidateId: "l1", remoteCandidateId: "r1", state: "succeeded", nominated: true }],
        ["p2", { id: "p2", type: "candidate-pair", localCandidateId: "l2", remoteCandidateId: "r1", state: "succeeded", nominated: true }],
        ["l1", { id: "l1", type: "local-candidate", candidateType: "host" }],
        ["l2", { id: "l2", type: "local-candidate", candidateType: "relay" }],
        ["r1", { id: "r1", type: "remote-candidate", candidateType: "srflx" }],
    ]));
    assert.deepEqual(chrome, { bytes: 9000, level: 0.05, energy: null, route: "relay" });
    const firefox = readCallStats(new Map([
        ["in", { id: "in", type: "inbound-rtp", mediaType: "audio", bytesReceived: 300, totalAudioEnergy: 0.5, totalSamplesDuration: 10 }],
        ["p", { id: "p", type: "candidate-pair", localCandidateId: "l", remoteCandidateId: "r", selected: true, state: "succeeded" }],
        ["l", { id: "l", type: "local-candidate", candidateType: "host" }],
        ["r", { id: "r", type: "remote-candidate", candidateType: "host" }],
    ]));
    assert.deepEqual(firefox, { bytes: 300, level: null, energy: { energy: 0.5, duration: 10 }, route: "direct" });
    assert.deepEqual(readCallStats(new Map()), { bytes: 0, level: null, energy: null, route: null });
});
