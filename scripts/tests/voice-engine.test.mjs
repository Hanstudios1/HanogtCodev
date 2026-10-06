// Run: node --test scripts/tests/
// Group voice channels end to end: several people's VoiceChannelSessions
// (lib/social/voice-session.ts) take seats, connect to everyone (the mesh)
// and leave through the real server logic of /api/groups/voice, polling as
// browsers without the Firebase bridge do, over the in-memory Firestore
// stand-in. WebRTC and the microphone are faked; whose request it is comes
// from AsyncLocalStorage (each person runs in their own context).
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import { setFakeEmulatorEnv, createBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
globalThis.window = globalThis;
if (!globalThis.navigator) globalThis.navigator = {};
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
const mic = { error: null };
Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: {
        getUserMedia: async () => {
            if (mic.error) throw mic.error;
            return new FakeStream([new FakeTrack()]);
        },
    },
});
const beacons = [];
Object.defineProperty(globalThis.navigator, "sendBeacon", { configurable: true, value: (url, body) => (beacons.push({ url, body, as: identity.getStore() }), true) });

class FakeTrack { constructor(kind = "audio") { this.kind = kind; this.enabled = true; this.stopped = false; } stop() { this.stopped = true; } }
class FakeStream {
    constructor(tracks = []) { this.tracks = [...tracks]; }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
    addTrack(track) { this.tracks.push(track); }
}
globalThis.MediaStream = FakeStream;
globalThis.Audio = class { constructor() { this.muted = false; this.srcObject = null; } play() { return Promise.resolve(); } pause() {} };

/** Connects once both descriptions and a remote candidate are set (like the calls test). */
const connections = [];
let candidateCounter = 0;
class FakePeer {
    constructor() {
        this.localDescription = null;
        this.remoteDescription = null;
        this.connectionState = "new";
        this.remoteCandidates = [];
        this.closed = false;
        this.tracks = [];
        this.owner = identity.getStore();
        connections.push(this);
    }
    addTrack(track) { this.tracks.push(track); }
    getSenders() { return this.tracks.map((track) => ({ track, replaceTrack: async () => undefined })); }
    async createOffer() { return { type: "offer", sdp: `v=0\r\no=- ${connections.indexOf(this)} 1 IN IP4 0.0.0.0\r\n` }; }
    async createAnswer() { return { type: "answer", sdp: `v=0\r\no=- ${connections.indexOf(this)} 2 IN IP4 0.0.0.0\r\n` }; }
    get signalingState() { return this.localDescription?.type === "offer" && !this.remoteDescription ? "have-local-offer" : "stable"; }
    async setLocalDescription(description) {
        this.localDescription = description;
        for (let index = 0; index < 2; index += 1) {
            setTimeout(() => {
                if (this.closed) return;
                const n = ++candidateCounter;
                const candidate = { candidate: `candidate:${n} 1 udp 1 10.0.0.${n % 250} 5000 typ host`, sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "u" };
                this.onicecandidate?.({ candidate: { ...candidate, toJSON: () => candidate } });
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
                this.onconnectionstatechange?.();
            }, 5);
        }
    }
    close() { this.closed = true; this.connectionState = "closed"; }
}
globalThis.RTCPeerConnection = FakePeer;

const identity = new AsyncLocalStorage();
const voice = await load("lib/social/voice.ts");
const server = await load("lib/server/group-voice.ts");
const { VoiceChannelSession, splitSignal } = await load("lib/social/voice-session.ts");
const { memberKey } = await load("lib/server/group-keys.ts");

// Fast timings for the simulation (the server and the browser share them).
Object.assign(voice.VOICE_LIMITS, { heartbeatMs: 80, staleMs: 1_500 });
Object.assign(voice.VOICE_POLL, { joinedMs: 20, watchingMs: 50 });

const G = "group1";
const PEOPLE = ["ali", "berk", "cem", "deniz", "ece", "fatma"].map((name) => `${name}@example.com`);
const [ALI, BERK, CEM, DENIZ, ECE, FATMA] = PEOPLE;
const seed = () => ({
    [`groups/${G}`]: { name: "Kod Kulübü", ownerEmail: ALI, members: PEOPLE, admins: [ALI] },
    [`public_profiles/${ALI}`]: { username: "Ali" },
    [`public_profiles/${BERK}`]: { username: "Berk" },
});

function reply(status, data) {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function api(url, init = {}) {
    const me = identity.getStore();
    assert.ok(me, `request without identity: ${url}`);
    const parsed = new URL(url, "http://local");
    const body = init.body ? JSON.parse(init.body) : {};
    try {
        if (parsed.pathname === "/api/calls/ice") return reply(200, { iceServers: [], turnConfigured: false });
        if (parsed.pathname === "/api/groups/voice" && (init.method || "GET") === "GET") return reply(200, await server.readVoiceRoom(parsed.searchParams.get("groupId"), me, parsed.searchParams.get("tab")));
        if (parsed.pathname === "/api/groups/voice") {
            switch (body.action) {
                case "join": return reply(200, await server.joinVoice(body.groupId, me, body));
                case "heartbeat": return reply(200, await server.heartbeatVoice(body.groupId, me, body));
                case "leave": return reply(200, await server.leaveVoice(body.groupId, me, body));
                case "signal": return reply(200, await server.exchangeVoiceSignals(body.groupId, me, body));
            }
        }
        return reply(404, { code: "not_found" });
    } catch (error) {
        if (error instanceof server.VoiceApiError) return reply(error.status, { ...error.extra, code: error.code, error: error.message });
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

const sessions = [];
function person(email, options = {}) {
    const states = [];
    const created = identity.run(email, () => new VoiceChannelSession({ groupId: G, email, live: false, muted: false, deafened: false, onChange: (state) => states.push(state), ...options }));
    const entry = {
        created,
        states,
        last: () => states[states.length - 1] ?? created.current,
        join: () => identity.run(email, () => created.join()),
        leave: () => identity.run(email, () => created.leave()),
        /** Every other participant is connected. */
        connectedToAll: () => {
            const state = entry.last();
            const others = state.participants.filter((item) => item.id !== state.self);
            return state.phase === "connected" && others.length > 0 && others.every((item) => state.connections[item.id] === "connected");
        },
    };
    sessions.push(entry);
    return entry;
}

test.afterEach(() => {
    for (const entry of sessions.splice(0)) if (entry.created.active) identity.run("cleanup@example.com", () => entry.created.dispose());
    mic.error = null;
});

test("three people join, everyone connects to everyone, leaving says goodbye", async () => {
    await withWorld(async (db) => {
        const a = person(ALI), b = person(BERK), c = person(CEM);
        assert.equal(await a.join(), true);
        await b.join();
        await c.join();
        await until(() => a.connectedToAll() && b.connectedToAll() && c.connectedToAll());
        for (const entry of [a, b, c]) assert.equal(entry.last().participants.length, 3);
        assert.deepEqual(a.last().participants.map((item) => item.name), ["Ali", "Berk", "cem"], "earliest first; names from the profiles");
        assert.equal(Object.keys(db.get(`group_voice/${G}`).participants).length, 3);

        // Berk mutes: the others see it with the next check-in.
        identity.run(BERK, () => b.created.setSwitches(true, false));
        await until(() => a.last().participants.find((item) => item.email === BERK)?.muted === true);

        b.leave();
        assert.equal(b.last().phase, "ended");
        assert.equal(b.last().notice, null);
        await until(() => a.last().participants.length === 2 && c.last().participants.length === 2);
        await until(() => !Object.keys(a.last().connections).some((id) => id.startsWith(memberKey(G, BERK))));
        assert.ok(a.connectedToAll() && c.connectedToAll(), "Ali and Cem stay connected");

        a.leave();
        c.leave();
        await until(() => !db.has(`group_voice/${G}`));
        await until(() => db.paths().filter((path) => path.startsWith(`group_voice/${G}/signals/`)).length === 0);
    });
});

test("the sixth person finds the channel full", async () => {
    await withWorld(async () => {
        const five = [ALI, BERK, CEM, DENIZ, ECE].map((email) => person(email));
        for (const entry of five) await entry.join();
        await until(() => five.every((entry) => entry.connectedToAll() && entry.last().participants.length === 5));
        const sixth = person(FATMA);
        assert.equal(await sixth.join(), false);
        assert.equal(sixth.last().phase, "ended");
        assert.equal(sixth.last().notice, "full");
    });
});

test("a time-out takes the person out with the reason; a denied microphone frees the seat", async () => {
    await withWorld(async (db) => {
        const { mutePath } = await load("lib/server/group-moderation.ts");
        const { patchServerDocument } = await load("lib/server/firebase-rest.ts");
        const a = person(ALI), b = person(BERK);
        await a.join();
        await b.join();
        await until(() => a.connectedToAll() && b.connectedToAll());
        await patchServerDocument(mutePath(G, BERK), { groupId: G, email: BERK, until: new Date(Date.now() + 600_000) });
        await until(() => b.last().phase === "ended");
        assert.equal(b.last().notice, "muted");
        await until(() => a.last().participants.length === 1);

        mic.error = new DOMException("denied", "NotAllowedError");
        const c = person(CEM);
        assert.equal(await c.join(), false);
        assert.equal(c.last().notice, "mic_denied");
        await until(() => Object.keys(db.get(`group_voice/${G}`).participants).length === 1, 2_000);
    });
});

test("joining from another tab moves the person; a tab that lost its place takes a new one", async () => {
    await withWorld(async () => {
        const laptop = person(ALI), b = person(BERK);
        await laptop.join();
        await b.join();
        await until(() => laptop.connectedToAll() && b.connectedToAll());

        // The channel lost Berk's tab (a long sleep): it takes a new seat by itself and reconnects.
        const before = b.last().self;
        await server.removeFromVoice(G, BERK);
        await until(() => b.last().phase === "connected" && b.last().self !== before && b.connectedToAll());
        await until(() => laptop.connectedToAll() && laptop.last().participants.some((item) => item.id === b.last().self));

        // Ali joins on the phone: the laptop leaves with the reason, Berk connects to the phone.
        const phone = person(ALI);
        await phone.join();
        await until(() => laptop.last().phase === "ended");
        assert.equal(laptop.last().notice, "moved");
        await until(() => phone.connectedToAll() && b.connectedToAll() && b.last().participants.length === 2);
    });
});

test("closing the page frees the seat with a beacon", async () => {
    await withWorld(async () => {
        const a = person(ALI);
        await a.join();
        await until(() => a.last().phase === "connected");
        const tab = a.last().self.split("_")[1];
        identity.run(ALI, () => a.created.dispose());
        assert.equal(a.created.active, false);
        const beacon = beacons.find((entry) => entry.as === ALI);
        assert.ok(beacon, "a beacon was sent");
        assert.deepEqual(JSON.parse(beacon.body), { action: "leave", groupId: G, tab });
    });
});

test("oversized candidate batches are split, oversized descriptions dropped", () => {
    const candidates = Array.from({ length: 40 }, (_, index) => ({ candidate: `candidate:${index} ${"x".repeat(900)}`, sdpMid: "0", sdpMLineIndex: 0 }));
    const pieces = splitSignal("candidates", JSON.stringify(candidates));
    assert.ok(pieces.length > 1);
    assert.ok(pieces.every((piece) => piece.length <= voice.VOICE_LIMITS.signalChars));
    assert.equal(pieces.flatMap((piece) => JSON.parse(piece)).length, 40);
    assert.deepEqual(splitSignal("offer", "x".repeat(voice.VOICE_LIMITS.signalChars + 1)), []);
    assert.deepEqual(splitSignal("answer", "short"), ["short"]);
});
