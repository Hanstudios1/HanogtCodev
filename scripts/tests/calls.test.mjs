// Run: node --test scripts/tests/
// 1:1 voice call signalling through the server (/api/calls): the shared model
// and the server module against the in-memory Firestore stand-in.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const model = await load("lib/calls/model.ts");
const calls = await load("lib/server/calls.ts");
const { CALL_LIMITS, callFromData, callWire, isCallId, isCallStale, readCandidate, readCandidates, readDescription, ringingCalls } = model;

const ALI = "ali@example.com";
const BERK = "berk@example.com";
const CEM = "cem@example.com";
const DENIZ = "deniz@example.com";
const OFFER = { type: "offer", sdp: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" };
const ANSWER = { type: "answer", sdp: "v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" };
const candidate = (n) => ({ candidate: `candidate:${n} 1 udp 2122260223 192.168.1.${n} 5000${n % 10} typ host`, sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "abcd" });

const user = (email, friends = [], blockedUsers = []) => ({ email, friends, blockedUsers });
const ali = user(ALI, [BERK, DENIZ]);
const berk = user(BERK, [ALI]);

function seed() {
    return {
        [`users/${ALI}`]: { email: ALI, friends: [BERK, DENIZ], blockedUsers: [] },
        [`users/${BERK}`]: { email: BERK, friends: [ALI], blockedUsers: [] },
        [`users/${CEM}`]: { email: CEM, friends: [], blockedUsers: [] },
        // Deniz is on Ali's list, but not the other way around.
        [`users/${DENIZ}`]: { email: DENIZ, friends: [], blockedUsers: [] },
        [`public_profiles/${ALI}`]: { email: ALI, username: "Ali", avatarUrl: "https://example.com/ali.png", staffRole: "moderator" },
    };
}

async function rejects(promise, code) {
    await assert.rejects(promise, (error) => {
        assert.equal(error.code, code, `expected ${code}, got ${error.code} (${error.message})`);
        return true;
    });
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

test("descriptions and candidates are validated before they are stored", () => {
    assert.deepEqual(readDescription(OFFER, "offer"), OFFER);
    assert.equal(readDescription(OFFER, "answer"), null, "an offer isn't an answer");
    assert.equal(readDescription({ type: "offer", sdp: "<script>" }), null);
    assert.equal(readDescription({ type: "offer", sdp: `v=0\r\n${"a".repeat(CALL_LIMITS.sdpMax)}` }), null);
    assert.equal(readDescription({ type: "pranswer", sdp: OFFER.sdp }), null);
    assert.equal(readDescription("v=0"), null);

    assert.deepEqual(readCandidate(candidate(1)), candidate(1));
    assert.deepEqual(readCandidate({ candidate: "candidate:x", sdpMLineIndex: 0 }), { candidate: "candidate:x", sdpMid: null, sdpMLineIndex: 0, usernameFragment: null });
    assert.equal(readCandidate({ candidate: "", sdpMid: "0" }), null, "the end-of-candidates marker isn't stored");
    assert.equal(readCandidate({ candidate: "candidate:x" }), null, "sdpMid or sdpMLineIndex is required");
    assert.equal(readCandidate({ candidate: "candidate:x\r\na=evil", sdpMid: "0" }), null);
    assert.equal(readCandidate({ candidate: "c".repeat(CALL_LIMITS.candidateMax + 1), sdpMid: "0" }), null);
    assert.equal(readCandidates([candidate(1), null, { candidate: 5 }, candidate(2), candidate(3)], 2).length, 2);
    assert.ok(isCallId(crypto.randomUUID()));
    assert.ok(!isCallId("../users/ali@example.com"));
    assert.ok(!isCallId("short"));
});

test("call records: parsing, ringing window and stale calls", () => {
    const id = crypto.randomUUID();
    const now = Date.parse("2026-10-02T12:00:00Z");
    assert.equal(callFromData(id, { caller: ALI, callee: ALI, status: "ringing" }), null, "a call needs two people");
    assert.equal(callFromData("bad id", { caller: ALI, callee: BERK }), null);
    const record = callFromData(id, { caller: "Ali@Example.com", callee: BERK, status: "ringing", offer: OFFER, callerCandidates: [candidate(1), { bad: true }], createdAt: new Date(now - 5_000) });
    assert.equal(record.caller, ALI);
    assert.equal(record.callerCandidates.length, 1);
    assert.equal(record.createdAt, now - 5_000);
    assert.equal(callFromData(id, { caller: ALI, callee: BERK, status: "weird" }).status, "ended", "unknown states count as over");

    const ringing = (overrides) => callFromData(crypto.randomUUID(), { caller: ALI, callee: BERK, status: "ringing", offer: OFFER, createdAt: now - 5_000, ...overrides });
    const fresh = ringing({});
    const old = ringing({ createdAt: now - CALL_LIMITS.incomingFreshMs - 1_000 });
    const answered = ringing({ status: "active" });
    const offerless = ringing({ offer: null });
    const mine = ringing({ caller: BERK, callee: ALI });
    assert.deepEqual(ringingCalls([old, fresh, answered, offerless, mine], BERK, now).map((call) => call.id), [fresh.id]);
    assert.deepEqual(ringingCalls([old], BERK, now, new Set([old.id])).map((call) => call.id), [old.id], "a change seen live counts whatever the clocks say");
    assert.deepEqual(ringingCalls([ringing({ createdAt: now + 20_000 })], BERK, now).length, 1, "a server clock a little ahead is tolerated");

    assert.equal(isCallStale(fresh, now), false);
    assert.equal(isCallStale(ringing({ createdAt: now - CALL_LIMITS.ringingTtlMs - 1 }), now), true);
    assert.equal(isCallStale(ringing({ status: "declined", endedAt: now - 1_000 }), now), false, "the caller still has to see the decline");
    assert.equal(isCallStale(ringing({ status: "declined", endedAt: now - CALL_LIMITS.declinedTtlMs - 1 }), now), true);
    assert.equal(isCallStale(ringing({ status: "active", answeredAt: now - 60 * 60_000, createdAt: now - 61 * 60_000 }), now), false, "long calls are fine");
    assert.equal(isCallStale(ringing({ status: "active", answeredAt: now - CALL_LIMITS.activeTtlMs - 1 }), now), true);

    const full = callFromData(id, { caller: ALI, callee: BERK, status: "active", offer: OFFER, answer: ANSWER, callerCandidates: [candidate(1), candidate(2)], calleeCandidates: [candidate(3)] });
    const forCallee = callWire(full, "callee", 1);
    assert.deepEqual(forCallee.offer, OFFER);
    assert.equal(forCallee.answer, null, "each side gets only the other side's description");
    assert.deepEqual(forCallee.candidates, [candidate(2)]);
    assert.equal(forCallee.candidateCount, 2);
    const forCaller = callWire(full, "caller", 99);
    assert.equal(forCaller.offer, null);
    assert.deepEqual(forCaller.answer, ANSWER);
    assert.deepEqual(forCaller.candidates, []);
});

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

test("starting a call: friends only, both directions, no blocks", async () => {
    await withBackend(seed(), {}, async (db) => {
        const started = await calls.startCall(ali, { callee: "Berk@Example.com", offer: OFFER });
        assert.ok(isCallId(started.callId));
        const stored = db.get(`calls/${started.callId}`);
        assert.equal(stored.caller, ALI);
        assert.equal(stored.callee, BERK);
        assert.deepEqual(stored.participants, [ALI, BERK], "the order the security rules expect");
        assert.equal(stored.status, "ringing");
        assert.deepEqual(stored.offer, OFFER);
        assert.deepEqual(stored.callerCandidates, []);
        assert.equal(started.call.status, "ringing");

        await rejects(calls.startCall(ali, { callee: CEM, offer: OFFER }), "not_friend");
        await rejects(calls.startCall(ali, { callee: DENIZ, offer: OFFER }), "not_friend");
        await rejects(calls.startCall(ali, { callee: ALI, offer: OFFER }), "self_action");
        await rejects(calls.startCall(user(ALI, [BERK], [BERK]), { callee: BERK, offer: OFFER }), "blocked");
        await rejects(calls.startCall(ali, { callee: BERK, offer: ANSWER }), "invalid_request");
        await rejects(calls.startCall(ali, { callee: "not an address", offer: OFFER }), "invalid_request");
    });

    const blockedByCallee = seed();
    blockedByCallee[`users/${BERK}`].blockedUsers = [ALI];
    await withBackend(blockedByCallee, {}, async () => {
        await rejects(calls.startCall(ali, { callee: BERK, offer: OFFER }), "not_friend");
    });
    const suspended = seed();
    suspended[`users/${BERK}`].suspended = true;
    await withBackend(suspended, {}, async () => {
        await rejects(calls.startCall(ali, { callee: BERK, offer: OFFER }), "not_friend");
    });
});

test("a call from offer to answer, with candidates from both sides", async () => {
    await withBackend(seed(), {}, async (db) => {
        const { callId } = await calls.startCall(ali, { callee: BERK, offer: OFFER });
        const path = `calls/${callId}`;

        // The callee's view of the ringing call.
        const ringingView = (await calls.readCall(berk, callId)).call;
        assert.deepEqual(ringingView.offer, OFFER);
        assert.equal(ringingView.answer, null);
        await rejects(calls.readCall(user(CEM), callId), "not_found");

        await calls.addCandidates(ali, { callId, candidates: [candidate(1), { candidate: "junk" }, candidate(2)] });
        await calls.addCandidates(ali, { callId, candidates: [candidate(2), candidate(3)] });
        assert.deepEqual(db.get(path).callerCandidates, [candidate(1), candidate(2), candidate(3)], "appended once each, on the caller's side");
        await rejects(calls.addCandidates(user(CEM), { callId, candidates: [candidate(9)] }), "not_found");
        await rejects(calls.addCandidates(ali, { callId, candidates: Array.from({ length: CALL_LIMITS.candidatesPerRequest + 1 }, (_, n) => candidate(n)) }), "invalid_request");

        await rejects(calls.answerCall(ali, { callId, answer: ANSWER }), "forbidden");
        await rejects(calls.answerCall(berk, { callId, answer: OFFER }), "invalid_request");
        await calls.answerCall(berk, { callId, answer: ANSWER });
        assert.equal(db.get(path).status, "active");
        assert.deepEqual(db.get(path).answer, ANSWER);
        assert.ok(db.get(path).answeredAt);
        await rejects(calls.answerCall(berk, { callId, answer: ANSWER }), "call_inactive");

        await calls.addCandidates(berk, { callId, candidates: [candidate(7)] });
        assert.deepEqual(db.get(path).calleeCandidates, [candidate(7)]);

        const callerView = (await calls.readCall(ali, callId, 0)).call;
        assert.deepEqual(callerView.answer, ANSWER);
        assert.deepEqual(callerView.candidates, [candidate(7)]);
        const calleeView = (await calls.readCall(berk, callId, 2)).call;
        assert.deepEqual(calleeView.candidates, [candidate(3)], "only the candidates the poller hasn't seen");
        assert.equal(calleeView.candidateCount, 3);

        // Hanging up deletes the call; the other side sees it gone.
        await rejects(calls.deleteCall(CEM, callId), "not_found");
        await calls.deleteCall(BERK, callId);
        assert.equal(db.has(path), false);
        await rejects(calls.readCall(ali, callId), "not_found");
        await rejects(calls.addCandidates(ali, { callId, candidates: [candidate(4)] }), "not_found");
        assert.equal(db.has(path), false, "a late candidate doesn't bring the call back");
        assert.deepEqual(await calls.deleteCall(ALI, callId), { success: true }, "deleting twice is fine");
    });
});

test("muting: each side's switch, seen by the other side only", async () => {
    await withBackend(seed(), {}, async (db) => {
        const { callId } = await calls.startCall(ali, { callee: BERK, offer: OFFER });
        const path = `calls/${callId}`;
        assert.equal((await calls.readCall(berk, callId)).call.remoteMuted, false);
        await calls.setCallMuted(ali, { callId, muted: true });
        assert.equal(db.get(path).callerMuted, true);
        assert.equal((await calls.readCall(berk, callId)).call.remoteMuted, true, "the callee sees the caller muted");
        assert.equal((await calls.readCall(ali, callId)).call.remoteMuted, false, "the caller's own switch isn't 'remote'");
        await calls.setCallMuted(berk, { callId, muted: true });
        assert.equal(db.get(path).calleeMuted, true);
        assert.equal((await calls.readCall(ali, callId)).call.remoteMuted, true);
        await calls.setCallMuted(ali, { callId, muted: false });
        assert.equal((await calls.readCall(berk, callId)).call.remoteMuted, false);
        await rejects(calls.setCallMuted(ali, { callId, muted: "yes" }), "invalid_request");
        await rejects(calls.setCallMuted(user(CEM), { callId, muted: true }), "not_found");
        await calls.deleteCall(ALI, callId);
        await rejects(calls.setCallMuted(ali, { callId, muted: true }), "not_found");
        assert.equal(db.has(path), false, "muting a finished call doesn't bring it back");
    });
});

test("candidates per side are capped", async () => {
    await withBackend(seed(), {}, async (db) => {
        const { callId } = await calls.startCall(ali, { callee: BERK, offer: OFFER });
        for (let batch = 0; batch < 5; batch += 1) {
            await calls.addCandidates(ali, { callId, candidates: Array.from({ length: CALL_LIMITS.candidatesPerRequest }, (_, n) => candidate(batch * 100 + n)) });
        }
        assert.equal(db.get(`calls/${callId}`).callerCandidates.length, CALL_LIMITS.candidatesPerSide);
    });
});

test("declining: the caller sees why, and answering afterwards fails", async () => {
    await withBackend(seed(), {}, async (db) => {
        const { callId } = await calls.startCall(ali, { callee: BERK, offer: OFFER });
        await rejects(calls.declineCall(ali, { callId, reason: "busy" }), "forbidden");
        await calls.declineCall(berk, { callId, reason: "busy" });
        assert.equal(db.get(`calls/${callId}`).status, "declined");
        assert.equal(db.get(`calls/${callId}`).endReason, "busy");
        assert.equal((await calls.readCall(ali, callId)).call.endReason, "busy");
        await rejects(calls.answerCall(berk, { callId, answer: ANSWER }), "call_inactive");
        assert.deepEqual(await calls.declineCall(berk, { callId }), { success: true }, "declining twice is fine");

        const second = await calls.startCall(ali, { callee: BERK, offer: OFFER });
        await calls.declineCall(berk, { callId: second.callId, reason: "<script>" });
        assert.equal(db.get(`calls/${second.callId}`).endReason, "declined", "unknown reasons become a plain decline");

        const third = await calls.startCall(ali, { callee: BERK, offer: OFFER });
        await calls.answerCall(berk, { callId: third.callId, answer: ANSWER });
        await rejects(calls.declineCall(berk, { callId: third.callId }), "call_inactive");

        await rejects(calls.declineCall(berk, { callId: "../users/x" }), "invalid_id");
    });
});

test("deleting a call also removes candidate subcollections of older clients", async () => {
    const id = crypto.randomUUID();
    const data = seed();
    data[`calls/${id}`] = { caller: ALI, callee: BERK, participants: [ALI, BERK], status: "active" };
    data[`calls/${id}/callerCandidates/c1`] = { candidate: "a" };
    data[`calls/${id}/calleeCandidates/c2`] = { candidate: "b" };
    await withBackend(data, {}, async (db) => {
        await calls.deleteCall(ALI, id);
        assert.deepEqual(db.paths().filter((path) => path.startsWith("calls/")), []);
    });
});

test("incoming calls for browsers without the Firebase bridge", async () => {
    const now = Date.now();
    const old = crypto.randomUUID();
    const stuck = crypto.randomUUID();
    const fromBlocked = crypto.randomUUID();
    const data = seed();
    data[`users/${BERK}`].friends = [ALI, CEM];
    data[`calls/${old}`] = { caller: ALI, callee: BERK, participants: [ALI, BERK], status: "declined", endReason: "declined", createdAt: new Date(now - 10 * 60_000), endedAt: new Date(now - 9 * 60_000) };
    data[`calls/${stuck}`] = { caller: ALI, callee: BERK, participants: [ALI, BERK], status: "ringing", offer: OFFER, createdAt: new Date(now - 5 * 60_000) };
    data[`calls/${fromBlocked}`] = { caller: CEM, callee: BERK, participants: [CEM, BERK], status: "ringing", offer: OFFER, createdAt: new Date(now - 2_000) };
    await withBackend(data, {}, async (db) => {
        const { callId } = await calls.startCall(ali, { callee: BERK, offer: OFFER });
        assert.equal(db.has(`calls/${old}`), false, "starting a call sweeps the caller's leftovers");
        assert.equal(db.has(`calls/${stuck}`), false);

        const berkBlockingCem = user(BERK, [ALI, CEM], [CEM]);
        const { calls: incoming } = await calls.listIncomingCalls(berkBlockingCem);
        assert.deepEqual(incoming.map((call) => call.id), [callId], "ringing calls only, never from blocked people");
        assert.deepEqual(incoming[0].person, { username: "Ali", avatarUrl: "https://example.com/ali.png", staffRole: "moderator" });
        assert.equal(incoming[0].caller, ALI);

        assert.deepEqual((await calls.listIncomingCalls(ali)).calls, [], "the caller isn't rung");
        await calls.answerCall(berk, { callId, answer: ANSWER });
        assert.deepEqual((await calls.listIncomingCalls(berkBlockingCem)).calls, [], "an answered call stops ringing");
    });
});
