// Run: node --test scripts/tests/
// Voice messages through the server (/api/social/voice): upload to Storage
// with the service account, message documents, playback access checks.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const voice = await load("lib/server/social-voice.ts");
const { dmChatId } = await load("lib/social/model.ts");
const { VOICE_LIMITS, openVoiceMessage, readLimitedBody, readVoiceTarget, sendVoiceMessage, sniffAudio } = voice;

const ALI = "ali@example.com";
const BERK = "berk@example.com";
const CEM = "cem@example.com";
const CHAT = dmChatId(ALI, BERK);
const GROUP = "grp1";

const bytes = (...values) => new Uint8Array(values);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3]);
const MP4 = new Uint8Array([0, 0, 0, 0x1c, ...Buffer.from("ftypM4A "), 0, 0, 0, 0]);
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

const user = (email, friends = [], blockedUsers = [], sessionName = "") => ({ email, friends, blockedUsers, sessionName });
const ali = user(ALI, [BERK], [], "Ali Session");
const params = (entries) => new URLSearchParams(entries);

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

test("a direct voice message: stored with the service account, message written by the server", async () => {
    await withBackend(seed(), {}, async (db) => {
        const sent = await sendVoiceMessage(ali, { kind: "dm", partner: BERK }, { bytes: WEBM, seconds: "7", label: "🎤 Voice message (0:07)" });
        assert.equal(sent.kind, "dm");
        const message = sent.message;
        assert.match(message.voicePath, new RegExp(`^voice-messages/${CHAT}/[0-9a-f-]{36}\\.webm$`));
        assert.equal(message.type, "voice");
        assert.equal(message.voiceDuration, 7);
        assert.equal(message.fromEmail, ALI);
        assert.equal(message.read, false);

        const object = db.object(message.voicePath);
        assert.equal(object.contentType, "audio/webm");
        assert.deepEqual(new Uint8Array(object.data), WEBM);
        assert.deepEqual(object.metadata, { sender: ALI, recipient: BERK }, "what storage.rules expect for client deletes");

        const stored = db.get(`chats/${CHAT}/messages/${message.id}`);
        assert.equal(stored.voicePath, message.voicePath);
        assert.equal(stored.text, "🎤 Voice message (0:07)");
        const chat = db.get(`chats/${CHAT}`);
        assert.deepEqual(chat.participants, [ALI, BERK]);
        assert.equal(chat.lastSender, ALI);
        assert.equal(chat.lastMessage, "🎤 Voice message (0:07)");

        // Playback for both participants, nobody else.
        for (const reader of [ali, user(BERK, [ALI])]) {
            const partner = reader.email === ALI ? BERK : ALI;
            const { response, contentType } = await openVoiceMessage(reader, { kind: "dm", partner }, message.id);
            assert.equal(contentType, "audio/webm");
            assert.deepEqual(new Uint8Array(await response.arrayBuffer()), WEBM);
        }
        await rejects(openVoiceMessage(user(CEM), { kind: "dm", partner: ALI }, message.id), "not_found");
        const ranged = await openVoiceMessage(ali, { kind: "dm", partner: BERK }, message.id, "bytes=0-3");
        assert.equal(ranged.response.status, 206, "byte ranges are passed on");
        assert.deepEqual(new Uint8Array(await ranged.response.arrayBuffer()), WEBM.subarray(0, 4));
        await rejects(openVoiceMessage(ali, { kind: "dm", partner: BERK }, "../x"), "invalid_id");
        await rejects(openVoiceMessage(ali, { kind: "dm", partner: BERK }, "missing0000000000000"), "voice_unavailable");
    });
});

test("voice message rules: friends only, audio only, size and storage checks", async () => {
    await withBackend(seed(), {}, async (db) => {
        await rejects(sendVoiceMessage(user(CEM, [ALI]), { kind: "dm", partner: ALI }, { bytes: WEBM, seconds: 3 }), "not_friend");
        await rejects(sendVoiceMessage(user(ALI, [BERK], [BERK]), { kind: "dm", partner: BERK }, { bytes: WEBM, seconds: 3 }), "blocked");
        await rejects(sendVoiceMessage(ali, { kind: "dm", partner: BERK }, { bytes: HTML, seconds: 3 }), "voice_format");
        await rejects(sendVoiceMessage(ali, { kind: "dm", partner: BERK }, { bytes: new Uint8Array(0), seconds: 3 }), "invalid_request");
        const big = new Uint8Array(VOICE_LIMITS.maxBytes + 1);
        big.set(WEBM);
        await rejects(sendVoiceMessage(ali, { kind: "dm", partner: BERK }, { bytes: big, seconds: 3 }), "voice_too_large");
        assert.deepEqual(db.storageUploads, [], "nothing was stored");

        const sent = await sendVoiceMessage(ali, { kind: "dm", partner: BERK }, { bytes: MP4, seconds: "9999", label: "‮   " });
        assert.ok(sent.message.voicePath.endsWith(".m4a"));
        assert.equal(sent.message.voiceDuration, VOICE_LIMITS.maxSeconds, "lengths are clamped");
        assert.equal(sent.message.text, "🎤 Sesli mesaj (5:00)", "an empty label gets the default");
    });

    const previous = process.env.FIREBASE_STORAGE_BUCKET;
    delete process.env.FIREBASE_STORAGE_BUCKET;
    try {
        await withBackend(seed(), {}, async () => {
            await rejects(sendVoiceMessage(ali, { kind: "dm", partner: BERK }, { bytes: WEBM, seconds: 3 }), "voice_storage");
        });
    } finally {
        process.env.FIREBASE_STORAGE_BUCKET = previous;
    }
});

test("a failed message write removes the uploaded file", async () => {
    const options = { onCommit: (writes) => { if (writes.some((write) => write.update?.name.includes("/messages/"))) throw new Error("commit failed"); } };
    await withBackend(seed(), options, async (db) => {
        await assert.rejects(sendVoiceMessage(ali, { kind: "dm", partner: BERK }, { bytes: WEBM, seconds: 2 }));
        assert.equal(db.storageUploads.length, 1);
        assert.deepEqual(db.storageDeleted, db.storageUploads);
        assert.deepEqual(db.objectPaths(), []);
    });
});

test("group voice messages: members only, author from the profile", async () => {
    await withBackend(seed(), {}, async (db) => {
        const sent = await sendVoiceMessage(ali, { kind: "group", groupId: GROUP }, { bytes: WEBM, seconds: 4, label: "Sesli mesaj (4 sn)" });
        assert.equal(sent.kind, "group");
        const stored = db.get(`groups/${GROUP}/messages/${sent.message.id}`);
        assert.equal(stored.author, "Ali");
        assert.equal(stored.authorAvatar, "https://example.com/ali.png");
        assert.equal(stored.type, "voice");
        assert.equal(stored.voiceDuration, 4);
        assert.match(stored.voicePath, new RegExp(`^group-voice-messages/${GROUP}/[0-9a-f-]{36}\\.webm$`));
        assert.deepEqual(Object.keys(stored).sort(), ["author", "authorAvatar", "createdAt", "fromEmail", "text", "type", "voiceDuration", "voicePath"], "the fields a client write may have");
        assert.deepEqual(db.object(stored.voicePath).metadata, { sender: ALI, groupId: GROUP });

        const played = await openVoiceMessage(user(BERK, [ALI]), { kind: "group", groupId: GROUP }, sent.message.id);
        assert.deepEqual(new Uint8Array(await played.response.arrayBuffer()), WEBM);
        await rejects(openVoiceMessage(user(CEM), { kind: "group", groupId: GROUP }, sent.message.id), "not_found");
        await rejects(sendVoiceMessage(user(CEM), { kind: "group", groupId: GROUP }, { bytes: WEBM, seconds: 2 }), "not_found");
    });
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
        await rejects(openVoiceMessage(ali, { kind: "dm", partner: BERK }, "m1"), "voice_unavailable");
        await rejects(openVoiceMessage(ali, { kind: "dm", partner: BERK }, "m2"), "voice_unavailable");
        await rejects(openVoiceMessage(ali, { kind: "group", groupId: GROUP }, "g1"), "voice_unavailable");
    });
    data[`chats/${CHAT}/messages/m3`] = { fromEmail: BERK, type: "voice", voicePath: `voice-messages/${CHAT}/z.webm` };
    await withBackend(data, { storage }, async () => {
        const { contentType } = await openVoiceMessage(ali, { kind: "dm", partner: BERK }, "m3");
        assert.equal(contentType, "application/octet-stream", "a stored file that isn't audio is never served as such");
    });
});
