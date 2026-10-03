// Run: node --test scripts/tests/
// Voice messages through the server (/api/social/voice): recordings stored in
// Firestore (voice_clips, no Storage bucket needed), message documents,
// playback access checks and byte ranges, deletion, and recordings stored in
// Storage before voice_clips.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const voice = await load("lib/server/social-voice.ts");
const rest = await load("lib/server/firebase-rest.ts");
const { deleteAccountData } = await load("lib/server/account-deletion.ts");
const { dmChatId } = await load("lib/social/model.ts");
const { VOICE_LIMITS, deleteVoiceRecording, openVoiceMessage, readLimitedBody, readVoiceTarget, sendVoiceMessage, sniffAudio } = voice;

const ALI = "ali@example.com";
const BERK = "berk@example.com";
const CEM = "cem@example.com";
const CHAT = dmChatId(ALI, BERK);
const GROUP = "grp1";
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const UUID = "0b9a7c1e-3f2d-4a8b-9c6d-5e4f3a2b1c0d";
const UUID2 = "1c8b6d2f-4e3a-4b9c-8d7e-6f5a4b3c2d1e";

const bytes = (...values) => new Uint8Array(values);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3]);
const MP4 = new Uint8Array([0, 0, 0, 0x1c, ...Buffer.from("ftypM4A "), 0, 0, 0, 0]);
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

/** A WebM header followed by a recognisable pattern, `size` bytes in all. */
function longWebm(size) {
    const data = new Uint8Array(size);
    for (let index = 0; index < size; index += 1) data[index] = (index * 7 + 3) % 251;
    data.set(WEBM);
    return data;
}

const user = (email, friends = [], blockedUsers = [], sessionName = "") => ({ email, friends, blockedUsers, sessionName });
const ali = user(ALI, [BERK], [], "Ali Session");
const berk = user(BERK, [ALI]);
const params = (entries) => new URLSearchParams(entries);
const clipIdOf = (path) => /\/([0-9a-f-]{36})\.[a-z0-9]+$/.exec(path)?.[1];
const toDm = { kind: "dm", partner: BERK };
const toGroup = { kind: "group", groupId: GROUP };

function seed() {
    return {
        [`users/${ALI}`]: { email: ALI, friends: [BERK], blockedUsers: [] },
        [`users/${BERK}`]: { email: BERK, friends: [ALI], blockedUsers: [] },
        [`users/${CEM}`]: { email: CEM, friends: [], blockedUsers: [] },
        [`public_profiles/${ALI}`]: { email: ALI, username: "Ali", avatarUrl: "https://example.com/ali.png" },
        [`groups/${GROUP}`]: { name: "G", ownerEmail: ALI, members: [ALI, BERK], admins: [] },
    };
}

async function rejects(promise, code) {
    await assert.rejects(promise, (error) => {
        assert.equal(error.code, code, `expected ${code}, got ${error.code} (${error.message})`);
        return true;
    });
}

function stream(chunks) {
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
    });
}

const BUCKET_VARIABLES = ["FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"];

/** Runs without any Storage bucket (a Spark project): voice messages must not need one. */
async function withoutBucket(run) {
    const saved = Object.fromEntries(BUCKET_VARIABLES.map((name) => [name, process.env[name]]));
    for (const name of BUCKET_VARIABLES) delete process.env[name];
    try {
        return await run();
    } finally {
        for (const [name, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    }
}

/** Records every request to the Storage "emulator" while the backend is installed. */
function watchStorage() {
    const calls = [];
    const inner = globalThis.fetch;
    globalThis.fetch = (input, init = {}) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        if (url.host === "127.0.0.1:9199") calls.push(`${(init.method || "GET").toUpperCase()} ${url.pathname}`);
        return inner(input, init);
    };
    return calls;
}

const clipPaths = (db) => db.paths().filter((path) => path.startsWith("voice_clips/")).sort();

/** The bytes a playback result serves (a clip body or the Storage response). */
async function served(playback) {
    return playback.source === "clip" ? new Uint8Array(playback.body) : new Uint8Array(await playback.response.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Input checks
// ---------------------------------------------------------------------------

test("only audio is accepted, recognised by its first bytes", () => {
    assert.deepEqual(sniffAudio(WEBM), { contentType: "audio/webm", extension: "webm" });
    assert.deepEqual(sniffAudio(MP4), { contentType: "audio/mp4", extension: "m4a" }, "Safari records MP4");
    assert.deepEqual(sniffAudio(new Uint8Array([...Buffer.from("OggS"), 0, 2, 0, 0, 0, 0, 0, 0])), { contentType: "audio/ogg", extension: "ogg" });
    assert.deepEqual(sniffAudio(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")])), { contentType: "audio/wav", extension: "wav" });
    assert.deepEqual(sniffAudio(new Uint8Array([...Buffer.from("ID3"), 4, 0, 0, 0, 0, 0, 0, 0, 0])), { contentType: "audio/mpeg", extension: "mp3" });
    assert.equal(sniffAudio(HTML), null);
    assert.equal(sniffAudio(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0)), null, "a JPEG isn't audio");
    assert.equal(sniffAudio(bytes(1, 2, 3)), null);
});

test("request bodies are read up to the limit only", async () => {
    assert.deepEqual(await readLimitedBody(stream([bytes(1, 2), bytes(3)]), 10), bytes(1, 2, 3));
    assert.deepEqual(await readLimitedBody(null, 10), new Uint8Array());
    await rejects(readLimitedBody(stream([bytes(1, 2, 3, 4), bytes(5, 6, 7, 8)]), 6), "voice_too_large");
    await rejects(readLimitedBody(stream([bytes(1)]), 6, 7), "voice_too_large");
});

test("targets: a friend's conversation or a group, never both or oneself", () => {
    assert.deepEqual(readVoiceTarget(params({ with: "Berk@Example.com" }), ALI), { kind: "dm", partner: BERK });
    assert.deepEqual(readVoiceTarget(params({ group: GROUP }), ALI), { kind: "group", groupId: GROUP });
    assert.throws(() => readVoiceTarget(params({ with: ALI }), ALI), (error) => error.code === "self_action");
    assert.throws(() => readVoiceTarget(params({ with: "nope" }), ALI), (error) => error.code === "invalid_email");
    assert.throws(() => readVoiceTarget(params({ group: "../users" }), ALI), (error) => error.code === "invalid_id");
    assert.throws(() => readVoiceTarget(params({ with: BERK, group: GROUP }), ALI), (error) => error.code === "invalid_request");
    assert.throws(() => readVoiceTarget(params({}), ALI), (error) => error.code === "invalid_request");
});

// ---------------------------------------------------------------------------
// Firestore bytes
// ---------------------------------------------------------------------------

test("firebase-rest writes Uint8Array/Buffer as bytes and reads them back as a Buffer; strings stay strings", async () => {
    const commits = [];
    await withBackend({}, { onCommit: (writes) => commits.push(writes) }, async (db) => {
        const data = bytes(0, 1, 2, 255);
        const view = new Uint8Array([9, 9, 7, 8, 9]).subarray(2, 4);
        await rest.commitServerMutations([{ type: "create", path: "blobs/a", data: { data, view, buffer: Buffer.from("hi"), text: "AAEC/w==", list: [data], nested: { data } } }]);
        const fields = commits[0][0].update.fields;
        assert.deepEqual(fields.data, { bytesValue: "AAEC/w==" });
        assert.deepEqual(fields.view, { bytesValue: Buffer.from([7, 8]).toString("base64") }, "only the view's own bytes");
        assert.deepEqual(fields.text, { stringValue: "AAEC/w==" }, "a base64-looking string is still a string");
        assert.deepEqual(fields.list, { arrayValue: { values: [{ bytesValue: "AAEC/w==" }] } });

        const stored = await rest.getServerDocument("blobs/a");
        assert.ok(Buffer.isBuffer(stored.data) && stored.data instanceof Uint8Array);
        assert.deepEqual([...stored.data], [0, 1, 2, 255]);
        assert.deepEqual([...stored.view], [7, 8]);
        assert.equal(stored.buffer.toString("utf8"), "hi");
        assert.equal(stored.text, "AAEC/w==");
        assert.deepEqual([...stored.list[0]], [0, 1, 2, 255]);
        assert.deepEqual([...stored.nested.data], [0, 1, 2, 255]);

        // A PATCH encodes bytes the same way.
        await rest.patchServerDocument("blobs/b", { data: Buffer.from([4, 5]), text: "hi" });
        assert.deepEqual([...db.get("blobs/b").data], [4, 5]);
        assert.deepEqual(await rest.getServerDocument("blobs/b").then(({ data, text }) => [[...data], text]), [[4, 5], "hi"]);
    });
});

// ---------------------------------------------------------------------------
// Sending and playback without Storage
// ---------------------------------------------------------------------------

test("a direct voice message without any Storage bucket: recording and message in Firestore", async () => {
    await withoutBucket(() => withBackend(seed(), {}, async (db) => {
        const storage = watchStorage();
        const sent = await sendVoiceMessage(ali, toDm, { bytes: WEBM, seconds: "7", label: "🎤 Voice message (0:07)" }, NOW);
        assert.equal(sent.kind, "dm");
        const message = sent.message;
        assert.match(message.voicePath, new RegExp(`^voice-messages/${CHAT}/[0-9a-f-]{36}\\.webm$`), "the path layout is unchanged");
        assert.equal(message.type, "voice");
        assert.equal(message.voiceDuration, 7);
        assert.equal(message.fromEmail, ALI);
        assert.equal(message.read, false);

        const stored = db.get(`chats/${CHAT}/messages/${message.id}`);
        assert.equal(stored.voicePath, message.voicePath);
        assert.equal(stored.text, "🎤 Voice message (0:07)");
        assert.deepEqual(Object.keys(stored).sort(), ["createdAt", "fromEmail", "read", "text", "type", "voiceDuration", "voicePath"], "the fields a client write may have");
        const chat = db.get(`chats/${CHAT}`);
        assert.deepEqual(chat.participants, [ALI, BERK]);
        assert.equal(chat.lastSender, ALI);
        assert.equal(chat.lastMessage, "🎤 Voice message (0:07)");

        const clipId = clipIdOf(message.voicePath);
        assert.deepEqual(clipPaths(db), [`voice_clips/${clipId}`], "short recordings stay in one document");
        const clip = db.get(`voice_clips/${clipId}`);
        assert.deepEqual(Object.keys(clip).sort(), ["contentType", "createdAt", "data", "parts", "path", "scope", "scopeId", "sender", "size"]);
        assert.equal(clip.path, message.voicePath);
        assert.equal(clip.contentType, "audio/webm");
        assert.equal(clip.size, WEBM.length);
        assert.equal(clip.parts, 0);
        assert.equal(clip.createdAt, new Date(NOW).toISOString());
        assert.equal(clip.sender, ALI);
        assert.equal(clip.scope, "dm");
        assert.equal(clip.scopeId, CHAT);
        assert.deepEqual(new Uint8Array(clip.data), WEBM);

        // Playback for both participants, nobody else.
        for (const reader of [ali, berk]) {
            const playback = await openVoiceMessage(reader, { kind: "dm", partner: reader.email === ALI ? BERK : ALI }, message.id);
            assert.equal(playback.source, "clip");
            assert.equal(playback.status, 200);
            assert.equal(playback.contentType, "audio/webm");
            assert.equal(playback.contentRange, null);
            assert.deepEqual(await served(playback), WEBM);
        }
        await rejects(openVoiceMessage(user(CEM), { kind: "dm", partner: ALI }, message.id), "not_found");
        await rejects(openVoiceMessage(ali, toDm, "../x"), "invalid_id");
        await rejects(openVoiceMessage(ali, toDm, "missing0000000000000"), "voice_unavailable");
        assert.deepEqual(storage, [], "Storage is never contacted");
        assert.deepEqual(db.storageUploads, []);
    }));
});

test("byte ranges of a recording stored in Firestore", async () => {
    await withoutBucket(() => withBackend(seed(), {}, async () => {
        const { message } = await sendVoiceMessage(ali, toDm, { bytes: WEBM, seconds: 2 }, NOW);
        const open = (range) => openVoiceMessage(berk, { kind: "dm", partner: ALI }, message.id, range);
        const size = WEBM.length;

        let playback = await open("bytes=0-3");
        assert.equal(playback.status, 206);
        assert.equal(playback.contentRange, `bytes 0-3/${size}`);
        assert.deepEqual(await served(playback), WEBM.subarray(0, 4));

        playback = await open("bytes=4-");
        assert.equal(playback.status, 206);
        assert.equal(playback.contentRange, `bytes 4-${size - 1}/${size}`);
        assert.deepEqual(await served(playback), WEBM.subarray(4));

        playback = await open("bytes=0-");
        assert.equal(playback.status, 206, "what media elements ask first");
        assert.deepEqual(await served(playback), WEBM);

        playback = await open("bytes=10-999");
        assert.equal(playback.contentRange, `bytes 10-${size - 1}/${size}`, "the end is clamped");
        assert.deepEqual(await served(playback), WEBM.subarray(10));

        playback = await open("bytes=-5");
        assert.equal(playback.contentRange, `bytes ${size - 5}-${size - 1}/${size}`, "the last n bytes");
        assert.deepEqual(await served(playback), WEBM.subarray(size - 5));

        playback = await open(`bytes=${size}-`);
        assert.equal(playback.status, 416, "a range past the end");
        assert.equal(playback.contentRange, `bytes */${size}`);
        assert.equal(playback.body.byteLength, 0);

        for (const ignored of ["bytes=5-3", "bytes=0-1,4-5", "items=0-3", "bytes=-", ""]) {
            playback = await open(ignored);
            assert.equal(playback.status, 200, `"${ignored}" serves everything`);
            assert.equal(playback.contentRange, null);
            assert.deepEqual(await served(playback), WEBM);
        }
    }));
});

test("long recordings are split into parts of at most 700 kB", async () => {
    await withoutBucket(() => withBackend(seed(), {}, async (db) => {
        const long = longWebm(1_600_000);
        const { message } = await sendVoiceMessage(ali, toDm, { bytes: long, seconds: 60 }, NOW);
        const clipId = clipIdOf(message.voicePath);
        const clip = db.get(`voice_clips/${clipId}`);
        assert.equal(clip.parts, 3);
        assert.equal(clip.size, 1_600_000);
        assert.equal("data" in clip, false, "no inline bytes next to parts");
        assert.deepEqual(clipPaths(db), [`voice_clips/${clipId}`, `voice_clips/${clipId}/parts/0`, `voice_clips/${clipId}/parts/1`, `voice_clips/${clipId}/parts/2`]);
        assert.deepEqual([0, 1, 2].map((index) => db.get(`voice_clips/${clipId}/parts/${index}`).data.length), [700_000, 700_000, 200_000]);
        assert.deepEqual(Object.keys(db.get(`voice_clips/${clipId}/parts/0`)), ["data"]);

        const whole = await openVoiceMessage(berk, { kind: "dm", partner: ALI }, message.id);
        assert.equal(whole.status, 200);
        assert.ok(Buffer.from(await served(whole)).equals(Buffer.from(long)), "the parts are put back together in order");
        const across = await openVoiceMessage(berk, { kind: "dm", partner: ALI }, message.id, "bytes=699990-700009");
        assert.equal(across.contentRange, "bytes 699990-700009/1600000");
        assert.deepEqual(await served(across), long.subarray(699_990, 700_010));

        // The boundary: 700 000 bytes stay inline, one more needs two parts.
        const exact = await sendVoiceMessage(ali, toDm, { bytes: longWebm(700_000), seconds: 30 }, NOW);
        assert.equal(db.get(`voice_clips/${clipIdOf(exact.message.voicePath)}`).parts, 0);
        const over = await sendVoiceMessage(ali, toDm, { bytes: longWebm(700_001), seconds: 30 }, NOW);
        const overId = clipIdOf(over.message.voicePath);
        assert.equal(db.get(`voice_clips/${overId}`).parts, 2);
        assert.equal(db.get(`voice_clips/${overId}/parts/1`).data.length, 1);
        assert.equal((await served(await openVoiceMessage(ali, toDm, over.message.id))).length, 700_001);

        // A recording with a part missing (e.g. while it is being deleted) is never served cut short.
        const missing = await sendVoiceMessage(ali, toDm, { bytes: long, seconds: 60 }, NOW);
        await rest.deleteServerDocument(`voice_clips/${clipIdOf(missing.message.voicePath)}/parts/1`);
        await rejects(openVoiceMessage(ali, toDm, missing.message.id), "voice_unavailable");
    }));
});

test("voice message rules: friends only, audio only, size checks; no bucket needed", async () => {
    await withoutBucket(() => withBackend(seed(), {}, async (db) => {
        await rejects(sendVoiceMessage(user(CEM, [ALI]), { kind: "dm", partner: ALI }, { bytes: WEBM, seconds: 3 }), "not_friend");
        await rejects(sendVoiceMessage(user(ALI, [BERK], [BERK]), toDm, { bytes: WEBM, seconds: 3 }), "blocked");
        await rejects(sendVoiceMessage(ali, toDm, { bytes: HTML, seconds: 3 }), "voice_format");
        await rejects(sendVoiceMessage(ali, toDm, { bytes: new Uint8Array(0), seconds: 3 }), "invalid_request");
        const big = new Uint8Array(VOICE_LIMITS.maxBytes + 1);
        big.set(WEBM);
        await rejects(sendVoiceMessage(ali, toDm, { bytes: big, seconds: 3 }), "voice_too_large");
        await rejects(sendVoiceMessage(user(CEM), toGroup, { bytes: WEBM, seconds: 2 }), "not_found");
        assert.deepEqual(clipPaths(db), [], "nothing was stored");

        const sent = await sendVoiceMessage(ali, toDm, { bytes: MP4, seconds: "9999", label: "‮   " });
        assert.ok(sent.message.voicePath.endsWith(".m4a"));
        assert.equal(sent.message.voiceDuration, VOICE_LIMITS.maxSeconds, "lengths are clamped");
        assert.equal(sent.message.text, "🎤 Sesli mesaj (5:00)", "an empty label gets the default");
        assert.equal(db.get(`voice_clips/${clipIdOf(sent.message.voicePath)}`).contentType, "audio/mp4");

        // The largest recording allowed still goes out in one commit.
        const largest = longWebm(VOICE_LIMITS.maxBytes);
        const max = await sendVoiceMessage(ali, toDm, { bytes: largest, seconds: 300 }, NOW);
        assert.equal(db.get(`voice_clips/${clipIdOf(max.message.voicePath)}`).parts, 5);
        assert.ok(Buffer.from(await served(await openVoiceMessage(berk, { kind: "dm", partner: ALI }, max.message.id))).equals(Buffer.from(largest)));
    }));
});

test("group voice messages: members only, author from the profile, no bucket needed", async () => {
    await withoutBucket(() => withBackend(seed(), {}, async (db) => {
        const sent = await sendVoiceMessage(ali, toGroup, { bytes: WEBM, seconds: 4, label: "Sesli mesaj (4 sn)" }, NOW);
        assert.equal(sent.kind, "group");
        const stored = db.get(`groups/${GROUP}/messages/${sent.message.id}`);
        assert.equal(stored.author, "Ali");
        assert.equal(stored.authorAvatar, "https://example.com/ali.png");
        assert.equal(stored.type, "voice");
        assert.equal(stored.voiceDuration, 4);
        assert.match(stored.voicePath, new RegExp(`^group-voice-messages/${GROUP}/[0-9a-f-]{36}\\.webm$`));
        assert.deepEqual(Object.keys(stored).sort(), ["author", "authorAvatar", "createdAt", "fromEmail", "text", "type", "voiceDuration", "voicePath"], "the fields a client write may have");

        const clip = db.get(`voice_clips/${clipIdOf(stored.voicePath)}`);
        assert.equal(clip.path, stored.voicePath);
        assert.equal(clip.scope, "group");
        assert.equal(clip.scopeId, GROUP);
        assert.equal(clip.sender, ALI);
        assert.equal(clip.parts, 0);

        const played = await openVoiceMessage(berk, toGroup, sent.message.id);
        assert.equal(played.source, "clip");
        assert.deepEqual(await served(played), WEBM);
        const ranged = await openVoiceMessage(berk, toGroup, sent.message.id, "bytes=2-5");
        assert.equal(ranged.status, 206);
        assert.deepEqual(await served(ranged), WEBM.subarray(2, 6));
        await rejects(openVoiceMessage(user(CEM), toGroup, sent.message.id), "not_found");

        // Long group recordings are split as well.
        const long = longWebm(1_600_000);
        const big = await sendVoiceMessage(ali, toGroup, { bytes: long, seconds: 60 }, NOW);
        assert.equal(db.get(`voice_clips/${clipIdOf(big.message.voicePath)}`).parts, 3);
        assert.ok(Buffer.from(await served(await openVoiceMessage(berk, toGroup, big.message.id))).equals(Buffer.from(long)));
    }));
});

test("a clip is only served for the exact path it was written for", async () => {
    const data = seed();
    const otherChat = dmChatId(BERK, CEM);
    data[`chats/${CHAT}`] = { participants: [ALI, BERK] };
    // The clip belongs to another conversation; a message here names its id in this chat's folder.
    data[`voice_clips/${UUID}`] = { path: `voice-messages/${otherChat}/${UUID}.webm`, contentType: "audio/webm", size: WEBM.length, parts: 0, data: Buffer.from(WEBM), sender: BERK, scope: "dm", scopeId: otherChat };
    data[`chats/${CHAT}/messages/m1`] = { fromEmail: BERK, type: "voice", voicePath: `voice-messages/${CHAT}/${UUID}.webm` };
    // A group message pointing at the same clip id from the group's folder.
    data[`groups/${GROUP}/messages/g1`] = { fromEmail: BERK, type: "voice", voicePath: `group-voice-messages/${GROUP}/${UUID}.webm` };
    // A clip of this chat, named with another extension.
    data[`voice_clips/${UUID2}`] = { path: `voice-messages/${CHAT}/${UUID2}.webm`, contentType: "audio/webm", size: WEBM.length, parts: 0, data: Buffer.from(WEBM), sender: BERK, scope: "dm", scopeId: CHAT };
    data[`chats/${CHAT}/messages/m2`] = { fromEmail: BERK, type: "voice", voicePath: `voice-messages/${CHAT}/${UUID2}.ogg` };
    data[`chats/${CHAT}/messages/m3`] = { fromEmail: BERK, type: "voice", voicePath: `voice-messages/${CHAT}/${UUID2}.webm` };
    await withoutBucket(() => withBackend(data, {}, async () => {
        await rejects(openVoiceMessage(ali, toDm, "m1"), "voice_unavailable");
        await rejects(openVoiceMessage(ali, toGroup, "g1"), "voice_unavailable");
        await rejects(openVoiceMessage(ali, toDm, "m2"), "voice_unavailable");
        assert.deepEqual(await served(await openVoiceMessage(ali, toDm, "m3")), WEBM, "the exact path plays");
    }));
    // With a bucket the lookup falls back to Storage, which has nothing there either.
    await withBackend(data, {}, async () => {
        await rejects(openVoiceMessage(ali, toDm, "m1"), "voice_unavailable");
    });
});

test("deleting a recording removes its clip and parts, and only the clip of that path", async () => {
    await withoutBucket(() => withBackend(seed(), {}, async (db) => {
        const short = await sendVoiceMessage(ali, toDm, { bytes: WEBM, seconds: 2 }, NOW);
        const long = await sendVoiceMessage(ali, toGroup, { bytes: longWebm(1_600_000), seconds: 60 }, NOW);
        const keep = await sendVoiceMessage(ali, toDm, { bytes: WEBM, seconds: 2 }, NOW);
        const keepId = clipIdOf(keep.message.voicePath);
        const longId = clipIdOf(long.message.voicePath);
        const storage = watchStorage();

        await deleteVoiceRecording(short.message.voicePath);
        await deleteVoiceRecording(long.message.voicePath);
        assert.deepEqual(clipPaths(db), [`voice_clips/${keepId}`]);
        await rejects(openVoiceMessage(berk, toGroup, long.message.id), "voice_unavailable");

        // The same clip id under another folder, paths outside the voice folders and repeated calls change nothing.
        await deleteVoiceRecording(`group-voice-messages/${GROUP}/${keepId}.webm`);
        await deleteVoiceRecording(`voice-messages/${CHAT}/${keepId}.ogg`);
        await deleteVoiceRecording(`voice_clips/${keepId}`);
        await deleteVoiceRecording(`users/${keepId}.webm`);
        await deleteVoiceRecording(`voice-messages//${keepId}.webm`);
        await deleteVoiceRecording(short.message.voicePath);
        assert.deepEqual(clipPaths(db), [`voice_clips/${keepId}`]);
        assert.deepEqual(storage, [], "no bucket, no Storage request");
        assert.deepEqual(db.storageDeleted, []);

        // A clip whose part count is unreadable still loses every part.
        await rest.patchServerDocument(`voice_clips/${longId}`, { path: long.message.voicePath, parts: "x" });
        await rest.patchServerDocument(`voice_clips/${longId}/parts/4`, { data: bytes(1) });
        await deleteVoiceRecording(long.message.voicePath);
        assert.deepEqual(clipPaths(db), [`voice_clips/${keepId}`]);
    }));
});

test("Storage is best effort when deleting: refused or unreachable Storage never blocks a deletion", async () => {
    const path = `voice-messages/${CHAT}/old.webm`;
    const storage = { [path]: { contentType: "audio/webm", data: WEBM } };
    await withBackend(seed(), { storage }, async (db) => {
        await deleteVoiceRecording(path);
        assert.deepEqual(db.storageDeleted, [path], "older recordings are deleted from Storage");
        assert.deepEqual(db.objectPaths(), []);
    });
    for (const status of [402, 403, 503]) {
        await withBackend(seed(), { storage, failStorage: () => status }, async () => {
            await deleteVoiceRecording(path);
        });
    }
    // Account deletion keeps a message whose file hit a temporary failure, for a later run…
    await withBackend(seed(), { storage, failStorage: () => 503 }, async () => {
        await assert.rejects(deleteVoiceRecording(path, { retryStorage: true }), /503/);
    });
    // …but not when Storage refuses for good (no Blaze plan, no permission).
    for (const status of [402, 403]) {
        await withBackend(seed(), { storage, failStorage: () => status }, async () => {
            await deleteVoiceRecording(path, { retryStorage: true });
        });
    }
    // A clip is deleted without asking Storage.
    await withBackend(seed(), { failStorage: () => 503 }, async (db) => {
        const sent = await sendVoiceMessage(ali, toDm, { bytes: WEBM, seconds: 2 }, NOW);
        const calls = watchStorage();
        await deleteVoiceRecording(sent.message.voicePath, { retryStorage: true });
        assert.deepEqual(clipPaths(db), []);
        assert.deepEqual(calls, []);
    });
});

test("account deletion removes the recordings of the account's conversations", async () => {
    await withoutBucket(() => withBackend(seed(), {}, async (db) => {
        const dm = await sendVoiceMessage(ali, toDm, { bytes: longWebm(1_600_000), seconds: 60 }, NOW);
        const fromBerk = await sendVoiceMessage(berk, { kind: "dm", partner: ALI }, { bytes: WEBM, seconds: 2 }, NOW);
        const inGroup = await sendVoiceMessage(ali, toGroup, { bytes: WEBM, seconds: 2 }, NOW);
        assert.equal(clipPaths(db).length, 6);
        const summary = await deleteAccountData(ALI, { scope: "all" });
        assert.deepEqual(summary.errors, []);
        assert.equal(summary.deleted.voiceFiles, 3);
        assert.deepEqual(clipPaths(db), [], "no recording outlives its message");
        assert.equal(db.has(`chats/${CHAT}/messages/${dm.message.id}`), false);
        assert.equal(db.has(`chats/${CHAT}/messages/${fromBerk.message.id}`), false);
        assert.equal(db.has(`groups/${GROUP}/messages/${inGroup.message.id}`), false, "the group Ali owned is gone");
    }));
});

// ---------------------------------------------------------------------------
// Failures while sending
// ---------------------------------------------------------------------------

test("a failed message write leaves no recording behind", async () => {
    const options = { onCommit: (writes) => { if (writes.some((write) => /\/messages\//.test(write.update?.name ?? ""))) throw new Error("commit failed"); } };
    await withoutBucket(() => withBackend(seed(), options, async (db) => {
        await assert.rejects(sendVoiceMessage(ali, toDm, { bytes: WEBM, seconds: 2 }, NOW), /commit failed/);
        await assert.rejects(sendVoiceMessage(ali, toDm, { bytes: longWebm(1_600_000), seconds: 60 }, NOW), /commit failed/);
        await assert.rejects(sendVoiceMessage(ali, toGroup, { bytes: WEBM, seconds: 2 }, NOW), /commit failed/);
        assert.deepEqual(clipPaths(db), []);
        assert.equal(db.has(`chats/${CHAT}`), false, "the chat document comes with the first message only");
        assert.ok(!db.paths().some((path) => path.includes("/messages/")));
    }));
    // Should a recording ever be stored without its message, it is removed again.
    const isMessage = (write) => /\/messages\//.test(write.update?.name ?? "");
    const partial = {
        onCommit(writes) {
            const index = writes.findIndex(isMessage);
            if (index >= 0) writes.splice(index, 1);
        },
        afterCommit(writes) {
            if (writes.some((write) => /\/voice_clips\//.test(write.update?.name ?? ""))) throw new Error("message write failed");
        },
    };
    await withoutBucket(() => withBackend(seed(), partial, async (db) => {
        await assert.rejects(sendVoiceMessage(ali, toDm, { bytes: longWebm(1_600_000), seconds: 60 }, NOW), /message write failed/);
        await assert.rejects(sendVoiceMessage(ali, toGroup, { bytes: WEBM, seconds: 2 }, NOW), /message write failed/);
        assert.deepEqual(clipPaths(db), [], "the clip and its parts are gone");
    }));
    // A message that was written although its commit reported a failure keeps its recording.
    let applied = 0;
    const lost = {
        afterCommit(writes) {
            if (!writes.some((write) => /\/messages\//.test(write.update?.name ?? ""))) return;
            applied += 1;
            throw new Error("connection reset");
        },
    };
    await withoutBucket(() => withBackend(seed(), lost, async (db) => {
        await assert.rejects(sendVoiceMessage(ali, toDm, { bytes: WEBM, seconds: 2 }, NOW), /connection reset/);
        assert.equal(applied, 1);
        // Firestore did apply it: the message arrived, so its recording must stay playable.
        const [messagePath] = db.paths().filter((path) => path.startsWith(`chats/${CHAT}/messages/`));
        const voicePath = db.get(messagePath).voicePath;
        assert.deepEqual(clipPaths(db), [`voice_clips/${clipIdOf(voicePath)}`]);
        assert.deepEqual(await served(await openVoiceMessage(berk, { kind: "dm", partner: ALI }, messagePath.split("/").pop())), WEBM);
    }));
});

// ---------------------------------------------------------------------------
// Recordings stored in Storage before voice_clips
// ---------------------------------------------------------------------------

test("older recordings in Storage still play while a bucket is configured", async () => {
    const data = seed();
    const path = `voice-messages/${CHAT}/${UUID}.webm`;
    data[`chats/${CHAT}`] = { participants: [ALI, BERK] };
    data[`chats/${CHAT}/messages/old`] = { fromEmail: BERK, type: "voice", voicePath: path };
    data[`groups/${GROUP}/messages/gold`] = { fromEmail: BERK, type: "voice", voicePath: `group-voice-messages/${GROUP}/v.ogg` };
    const storage = {
        [path]: { contentType: "audio/webm", data: WEBM },
        [`group-voice-messages/${GROUP}/v.ogg`]: { contentType: "audio/ogg; codecs=opus", data: WEBM },
    };
    await withBackend(data, { storage }, async () => {
        const playback = await openVoiceMessage(ali, toDm, "old");
        assert.equal(playback.source, "storage");
        assert.equal(playback.status, 200);
        assert.equal(playback.contentType, "audio/webm");
        assert.deepEqual(await served(playback), WEBM);
        const ranged = await openVoiceMessage(ali, toDm, "old", "bytes=0-3");
        assert.equal(ranged.status, 206, "byte ranges are passed on");
        assert.equal(ranged.response.headers.get("content-range"), `bytes 0-3/${WEBM.length}`);
        assert.deepEqual(await served(ranged), WEBM.subarray(0, 4));
        const group = await openVoiceMessage(berk, toGroup, "gold");
        assert.equal(group.contentType, "audio/ogg");
    });
    // Storage refusing for good (back on the Spark plan): unavailable, not a server error.
    await withBackend(data, { storage, failDownload: () => 403 }, async () => {
        await rejects(openVoiceMessage(ali, toDm, "old"), "voice_unavailable");
    });
    await withBackend(data, { storage, failDownload: () => 503 }, async () => {
        await assert.rejects(openVoiceMessage(ali, toDm, "old"), (error) => !error.code && /503/.test(error.message));
    });
    // Without a bucket there is nowhere to look.
    await withoutBucket(() => withBackend(data, { storage }, async () => {
        await rejects(openVoiceMessage(ali, toDm, "old"), "voice_unavailable");
    }));
});

test("playback only follows paths inside the conversation's own folder", async () => {
    const data = seed();
    data[`chats/${CHAT}`] = { participants: [ALI, BERK] };
    data[`chats/${CHAT}/messages/m1`] = { fromEmail: BERK, type: "voice", voicePath: "group-voice-messages/grp1/x.webm" };
    data[`chats/${CHAT}/messages/m2`] = { fromEmail: BERK, type: "voice", voicePath: `voice-messages/${CHAT}/y.webm`, deleted: true };
    data[`groups/${GROUP}/messages/g1`] = { fromEmail: BERK, type: "voice", voicePath: `voice-messages/${CHAT}/z.webm` };
    const storage = {
        "group-voice-messages/grp1/x.webm": { contentType: "audio/webm", data: WEBM },
        [`voice-messages/${CHAT}/y.webm`]: { contentType: "audio/webm", data: WEBM },
        [`voice-messages/${CHAT}/z.webm`]: { contentType: "text/html", data: HTML },
    };
    await withBackend(data, { storage }, async () => {
        await rejects(openVoiceMessage(ali, toDm, "m1"), "voice_unavailable");
        await rejects(openVoiceMessage(ali, toDm, "m2"), "voice_unavailable");
        await rejects(openVoiceMessage(ali, toGroup, "g1"), "voice_unavailable");
    });
    data[`chats/${CHAT}/messages/m3`] = { fromEmail: BERK, type: "voice", voicePath: `voice-messages/${CHAT}/z.webm` };
    data[`voice_clips/${UUID}`] = { path: `voice-messages/${CHAT}/${UUID}.webm`, contentType: "text/html", size: HTML.length, parts: 0, data: Buffer.from(HTML) };
    data[`chats/${CHAT}/messages/m4`] = { fromEmail: BERK, type: "voice", voicePath: `voice-messages/${CHAT}/${UUID}.webm` };
    await withBackend(data, { storage }, async () => {
        const { contentType } = await openVoiceMessage(ali, toDm, "m3");
        assert.equal(contentType, "application/octet-stream", "a stored file that isn't audio is never served as such");
        assert.equal((await openVoiceMessage(ali, toDm, "m4")).contentType, "application/octet-stream", "nor a clip");
    });
});
