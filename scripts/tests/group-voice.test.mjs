// Run: node --test scripts/tests/
// Group voice channels (/api/groups/voice): who is in a group's channel, the
// five-person limit, time-outs, check-ins, the signals passed between
// participants and the clean-ups, against the in-memory Firestore stand-in.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const voice = await load("lib/social/voice.ts");
const server = await load("lib/server/group-voice.ts");
const { memberKey } = await load("lib/server/group-keys.ts");

const G = "group1";
const PEOPLE = ["ali", "berk", "cem", "deniz", "ece", "fatma", "gul"].map((name) => `${name}@example.com`);
const [ALI, BERK, CEM, DENIZ, ECE, FATMA, GUL] = PEOPLE;
const OUTSIDER = "zeki@example.com";

function seed(extra = {}) {
    return {
        [`groups/${G}`]: { name: "Kod Kulübü", ownerEmail: ALI, members: PEOPLE, admins: [ALI] },
        [`public_profiles/${ALI}`]: { username: "Ali", avatarUrl: "https://example.com/ali.png" },
        [`public_profiles/${BERK}`]: { username: "Berk", nickname: "Berko" },
        ...extra,
    };
}

async function rejects(promise, code) {
    await assert.rejects(promise, (error) => {
        assert.equal(error.code, code, `expected ${code}, got ${error.code} (${error.message})`);
        return true;
    });
}

const tab = (n) => `tab${String(n).padStart(5, "0")}`;
const peer = (email, n) => voice.voicePeerId(memberKey(G, email), tab(n));

test("ids, signal ids and stale participants", () => {
    assert.equal(voice.isVoiceTabId("abc12345"), true);
    assert.equal(voice.isVoiceTabId("ABC12345"), false);
    const id = voice.voicePeerId("k0123456789abcdef0123", "abc12345");
    assert.equal(voice.isVoicePeerId(id), true);
    assert.equal(voice.memberKeyOfPeer(id), "k0123456789abcdef0123");
    const signal = voice.voiceSignalId(id, 1_700_000_000_000);
    assert.equal(voice.isVoiceSignalId(signal), true);
    assert.equal(voice.isSignalFor(signal, id), true);
    assert.equal(voice.isSignalFor(signal, voice.voicePeerId("k0123456789abcdef0123", "zzz12345")), false);
    assert.ok(voice.voiceSignalId(id, 2) > voice.voiceSignalId(id, 1), "signal ids sort by time");
    const now = 1_000_000;
    const stored = {
        [id]: { email: "a@example.com", name: "A", seenAt: now - 5_000, joinedAt: now - 60_000 },
        [voice.voicePeerId("k0123456789abcdef0124", "abc12345")]: { email: "b@example.com", seenAt: now - voice.VOICE_LIMITS.staleMs - 1 },
        junk: { email: "c@example.com", seenAt: now },
    };
    assert.deepEqual(voice.readParticipants(stored, now).map((entry) => entry.name), ["A"]);
    assert.deepEqual(voice.staleParticipantIds(stored, now), [voice.voicePeerId("k0123456789abcdef0124", "abc12345")]);
});

test("joining: members only, five at a time, not while timed out; check-ins keep the place", async () => {
    await withBackend(seed({ [`group_mutes/${G}_x`]: {} }), {}, async (db) => {
        const now = Date.now();
        const joined = await server.joinVoice(G, ALI, { tab: tab(1), muted: false }, now);
        assert.equal(joined.self, peer(ALI, 1));
        assert.deepEqual(joined.participants.map((entry) => entry.name), ["Ali"]);
        assert.equal(db.get(`group_voice/${G}`).participants[peer(ALI, 1)].email, ALI);
        await rejects(server.joinVoice(G, OUTSIDER, { tab: tab(1) }, now), "not_found");
        await rejects(server.joinVoice("bad/id", ALI, { tab: tab(1) }, now), "not_found");
        await rejects(server.joinVoice(G, ALI, { tab: "NOPE" }, now), "invalid_request");

        const berk = await server.joinVoice(G, BERK, { tab: tab(2), muted: true }, now + 10);
        assert.deepEqual(berk.participants.map((entry) => entry.name), ["Ali", "Berko"], "earliest first, the nickname wins");
        for (const [index, email] of [CEM, DENIZ, ECE].entries()) await server.joinVoice(G, email, { tab: tab(3 + index) }, now + 20 + index);
        await rejects(server.joinVoice(G, FATMA, { tab: tab(9) }, now + 50), "voice_full");
        // The same tab joining again keeps its place (and its join time).
        const again = await server.joinVoice(G, ALI, { tab: tab(1), muted: true }, now + 60);
        assert.equal(again.participants.length, 5);
        assert.equal(again.participants[0].id, peer(ALI, 1));
        assert.equal(again.participants[0].muted, true);

        const room = await server.readVoiceRoom(G, GUL, null, now + 70);
        assert.equal(room.participants.length, 5);
        assert.deepEqual(room.signals, [], "only tabs in the channel get signals");
        await rejects(server.readVoiceRoom(G, OUTSIDER, null, now), "not_found");

        // Check-ins: only from tabs in the channel; they carry the switches.
        const beat = await server.heartbeatVoice(G, BERK, { tab: tab(2), muted: false, deafened: true }, now + 5_000);
        assert.equal(beat.participants.find((entry) => entry.id === peer(BERK, 2)).deafened, true);
        await rejects(server.heartbeatVoice(G, BERK, { tab: tab(7) }, now + 5_000), "not_in_voice");

        // Silent tabs go stale: Fatma gets the seat once the others stop checking in.
        const later = now + voice.VOICE_LIMITS.staleMs + 6_000;
        await server.heartbeatVoice(G, BERK, { tab: tab(2) }, later - 1_000);
        const fatma = await server.joinVoice(G, FATMA, { tab: tab(9) }, later);
        assert.deepEqual(fatma.participants.map((entry) => entry.email).sort(), [BERK, FATMA].sort());
        assert.deepEqual(Object.keys(db.get(`group_voice/${G}`).participants).sort(), [peer(BERK, 2), peer(FATMA, 9)].sort(), "stale entries were cleaned up");
    });
});

test("one seat per person: joining from another tab or device moves them; a tab rejoining by itself doesn't", async () => {
    await withBackend(seed(), {}, async (db) => {
        const now = Date.now();
        const first = await server.joinVoice(G, ALI, { tab: tab(1) }, now);
        assert.equal(typeof first.now, "number", "the server's clock comes along");
        await server.joinVoice(G, BERK, { tab: tab(2) }, now);
        await server.exchangeVoiceSignals(G, BERK, { tab: tab(2), signals: [{ to: peer(ALI, 1), kind: "offer", data: "{}" }] }, now + 1);
        // Ali opens the channel on the phone: the laptop tab leaves it.
        const phone = await server.joinVoice(G, ALI, { tab: tab(21) }, now + 2);
        assert.deepEqual(phone.participants.map((entry) => entry.id).sort(), [peer(ALI, 21), peer(BERK, 2)].sort());
        assert.equal(db.paths().filter((path) => path.startsWith(`group_voice/${G}/signals/${peer(ALI, 1)}-`)).length, 0, "what waited for the laptop went");
        await rejects(server.heartbeatVoice(G, ALI, { tab: tab(1) }, now + 3), "moved");
        // The laptop wakes up and tries to rejoin by itself: the phone keeps the seat.
        await rejects(server.joinVoice(G, ALI, { tab: tab(31), resume: true }, now + 4), "moved");
        assert.deepEqual((await server.readVoiceRoom(G, ALI, null, now + 5)).participants.map((entry) => entry.id).sort(), [peer(ALI, 21), peer(BERK, 2)].sort());
        // Once the phone has left, rejoining by itself works again.
        await server.leaveVoice(G, ALI, { tab: tab(21) });
        const back = await server.joinVoice(G, ALI, { tab: tab(31), resume: true }, now + 6);
        assert.ok(back.participants.some((entry) => entry.id === peer(ALI, 31)));
        // A full channel doesn't count the seat the person is moving from.
        for (const [index, email] of [CEM, DENIZ, ECE].entries()) await server.joinVoice(G, email, { tab: tab(3 + index) }, now + 7);
        const moved = await server.joinVoice(G, ALI, { tab: tab(41) }, now + 8);
        assert.equal(moved.participants.length, 5);
        assert.deepEqual(Object.keys(db.get(`group_voice/${G}`).moved).sort(), [peer(ALI, 1), peer(ALI, 31)].sort());
        // The notes about moved tabs go after a few minutes (with the next write).
        await server.joinVoice(G, BERK, { tab: tab(2) }, now + 4 * 60_000);
        assert.deepEqual(Object.keys(db.get(`group_voice/${G}`).moved ?? {}), []);
    });
});

test("a time-out keeps a member out of the channel and takes them out of it", async () => {
    const { mutePath } = await load("lib/server/group-moderation.ts");
    const { patchServerDocument } = await load("lib/server/firebase-rest.ts");
    const now = Date.now();
    await withBackend(seed(), {}, async (db) => {
        await server.joinVoice(G, CEM, { tab: tab(3) }, now);
        // What /sustur stores.
        await patchServerDocument(mutePath(G, CEM), { groupId: G, email: CEM, until: new Date(now + 600_000) });
        await rejects(server.heartbeatVoice(G, CEM, { tab: tab(3) }, now + 1_000), "muted");
        assert.equal(db.has(`group_voice/${G}`), false, "out of the channel (the last one, so the channel is gone)");
        await rejects(server.joinVoice(G, CEM, { tab: tab(3) }, now + 2_000), "muted");
    });
});

test("signals go to participants only, each tab reads and acknowledges its own", async () => {
    await withBackend(seed(), {}, async (db) => {
        const now = Date.now();
        await server.joinVoice(G, ALI, { tab: tab(1) }, now);
        await server.joinVoice(G, BERK, { tab: tab(2) }, now);
        const offer = JSON.stringify({ type: "offer", sdp: "v=0\r\n" });
        const sent = await server.exchangeVoiceSignals(G, ALI, { tab: tab(1), signals: [{ to: peer(BERK, 2), kind: "offer", data: offer }, { to: peer(CEM, 3), kind: "offer", data: offer }] }, now + 1);
        assert.equal(sent.sent, 1, "Cem isn't in the channel: dropped");
        const berkRoom = await server.readVoiceRoom(G, BERK, tab(2), now + 2);
        assert.equal(berkRoom.signals.length, 1);
        assert.equal(berkRoom.signals[0].from, peer(ALI, 1));
        assert.equal(berkRoom.signals[0].kind, "offer");
        assert.equal(db.get(`group_voice/${G}/signals/${berkRoom.signals[0].id}`).toEmail, BERK, "the rules read the recipient's account");
        assert.deepEqual((await server.readVoiceRoom(G, ALI, tab(1), now + 2)).signals, [], "the sender doesn't see it");

        await rejects(server.exchangeVoiceSignals(G, ALI, { tab: tab(1), ack: [berkRoom.signals[0].id] }, now + 3), "invalid_request");
        await rejects(server.exchangeVoiceSignals(G, CEM, { tab: tab(3), signals: [{ to: peer(ALI, 1), kind: "offer", data: offer }] }, now + 3), "not_in_voice");
        await rejects(server.exchangeVoiceSignals(G, ALI, { tab: tab(1), signals: [{ to: peer(ALI, 1), kind: "offer", data: offer }] }, now + 3), "invalid_request");
        await rejects(server.exchangeVoiceSignals(G, ALI, { tab: tab(1), signals: [{ to: peer(BERK, 2), kind: "hello", data: offer }] }, now + 3), "invalid_request");
        await rejects(server.exchangeVoiceSignals(G, ALI, { tab: tab(1), signals: [{ to: peer(BERK, 2), kind: "offer", data: "x".repeat(voice.VOICE_LIMITS.signalChars + 1) }] }, now + 3), "payload_too_large");

        await server.exchangeVoiceSignals(G, BERK, { tab: tab(2), ack: [berkRoom.signals[0].id], signals: [{ to: peer(ALI, 1), kind: "answer", data: offer }] }, now + 4);
        assert.deepEqual((await server.readVoiceRoom(G, BERK, tab(2), now + 5)).signals, []);
        const aliRoom = await server.readVoiceRoom(G, ALI, tab(1), now + 5);
        assert.deepEqual(aliRoom.signals.map((signal) => signal.kind), ["answer"]);

        // Leaving removes the tab and what was waiting for it; the last one out removes the channel.
        await server.leaveVoice(G, ALI, { tab: tab(1) });
        assert.equal(db.has(`group_voice/${G}/signals/${aliRoom.signals[0].id}`), false);
        assert.deepEqual((await server.readVoiceRoom(G, BERK, null, now + 6)).participants.map((entry) => entry.email), [BERK]);
        await server.leaveVoice(G, BERK, { tab: tab(2) });
        assert.equal(db.has(`group_voice/${G}`), false);
    });
});

test("removing a person takes every tab of theirs out; deleting the group removes the channel", async () => {
    await withBackend(seed(), {}, async (db) => {
        const now = Date.now();
        await server.joinVoice(G, ALI, { tab: tab(1) }, now);
        await server.joinVoice(G, ALI, { tab: tab(11) }, now);
        await server.joinVoice(G, BERK, { tab: tab(2) }, now);
        await server.exchangeVoiceSignals(G, BERK, { tab: tab(2), signals: [{ to: peer(ALI, 11), kind: "offer", data: "{}" }] }, now);
        await server.removeFromVoice(G, ALI, now + 1);
        assert.deepEqual(Object.keys(db.get(`group_voice/${G}`).participants), [peer(BERK, 2)]);
        assert.equal(db.paths().filter((path) => path.startsWith(`group_voice/${G}/signals/`)).length, 0, "Ali's waiting signals went too");
        await server.exchangeVoiceSignals(G, BERK, { tab: tab(2), signals: [] }, now + 2);
        await server.deleteGroupVoice(G);
        assert.equal(db.has(`group_voice/${G}`), false);
    });
});
