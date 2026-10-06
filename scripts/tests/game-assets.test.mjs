// Run: node --test scripts/tests/
// Hanogt Engine audio files (/api/game-assets): content-addressed storage in
// Firestore, plan audio storage, files kept by published games, remixes and
// account deletion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const assets = await load("lib/server/game-assets.ts");
const { deleteAccountData } = await load("lib/server/account-deletion.ts");
const { PLAN_GAME_AUDIO_LIMITS, GAME_AUDIO_MAX_BYTES } = await load("lib/plans.ts");
const { claimGameAudio, deleteAccountGameAudio, listGameAudio, missingGameAudio, readGameAudio, releaseArcadeAudio, releaseGameAudio, sniffGameAudio, syncArcadeAudio, uploadGameAudio } = assets;

const ALI = "ali@example.com";
const BERK = "berk@example.com";

/** A small WAV file whose samples depend on `seed` (so different seeds give different files). */
function wav(seed, size = 2_000) {
    const bytes = new Uint8Array(size);
    bytes.set(Buffer.from("RIFF"), 0);
    bytes.set(Buffer.from("WAVEfmt "), 8);
    for (let index = 44; index < size; index += 1) bytes[index] = (index * 31 + seed * 17) % 256;
    return bytes;
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ownerDocs = (db) => db.paths().filter((path) => path.startsWith("game_asset_owners/"));
const usagePath = (email) => `game_asset_usage/${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;

async function rejects(promise, code) {
    await assert.rejects(promise, (error) => {
        assert.equal(error.code, code, `expected ${code}, got ${error.code} (${error.message})`);
        return true;
    });
}

test("only WAV, MP3 and Ogg files are accepted", () => {
    assert.equal(sniffGameAudio(wav(1)), "audio/wav");
    assert.equal(sniffGameAudio(new Uint8Array([...Buffer.from("OggS"), 0, 2, 0, 0, 0, 0, 0, 0, 0, 0])), "audio/ogg");
    assert.equal(sniffGameAudio(new Uint8Array([...Buffer.from("ID3"), 4, 0, 0, 0, 0, 0, 0, 0, 0])), "audio/mpeg");
    assert.equal(sniffGameAudio(new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0])), "audio/mpeg");
    assert.equal(sniffGameAudio(new TextEncoder().encode("<!doctype html><script>alert(1)</script>")), null);
    assert.equal(sniffGameAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8])), null, "WebM isn't a game audio format");
});

test("uploads are stored once by their hash, counted once per account, and read back", async () => {
    await withBackend({}, {}, async (db) => {
        const file = wav(1);
        const first = await uploadGameAudio(ALI, file, "Jump\u0007 sound");
        assert.equal(first.hash, sha(file));
        assert.deepEqual([first.contentType, first.size, first.name, first.duplicate], ["audio/wav", 2_000, "Jump sound", false]);
        assert.deepEqual([first.usage.bytes, first.usage.files, first.usage.plan], [2_000, 1, "free"]);
        const again = await uploadGameAudio(ALI, file, "Other name");
        assert.equal(again.duplicate, true);
        assert.equal(again.usage.files, 1, "the same file doesn't count twice");
        await uploadGameAudio(BERK, file, "Berk's copy");
        assert.equal(ownerDocs(db).length, 2, "two accounts keep the one stored file");
        assert.equal(db.paths().filter((path) => path.startsWith("game_assets/")).length, 1);
        const read = await readGameAudio(first.hash);
        assert.equal(read.contentType, "audio/wav");
        assert.deepEqual([...read.bytes.subarray(0, 4)], [...Buffer.from("RIFF")]);
        const listed = await listGameAudio(ALI);
        assert.deepEqual(listed.files.map((item) => [item.hash, item.name, item.size]), [[first.hash, "Jump sound", 2_000]]);
        assert.deepEqual(await missingGameAudio([first.hash, "a".repeat(64)]), ["a".repeat(64)]);
        await rejects(readGameAudio("b".repeat(64)), "not_found");
        await rejects(readGameAudio("../etc"), "invalid_hash");
    });
});

test("files that aren't audio, empty ones and ones over 300 KB are refused", async () => {
    await withBackend({}, {}, async () => {
        await rejects(uploadGameAudio(ALI, new TextEncoder().encode("<svg onload=alert(1)>…………"), "x"), "unsupported_audio");
        await rejects(uploadGameAudio(ALI, new Uint8Array(), "x"), "empty");
        await rejects(uploadGameAudio(ALI, wav(2, GAME_AUDIO_MAX_BYTES + 1), "x"), "too_large");
    });
});

test("the plan's audio storage is enforced (bytes and file count)", async () => {
    const limit = PLAN_GAME_AUDIO_LIMITS.free;
    // An account whose storage is nearly full (bytes), and one with the most files.
    await withBackend({ [usagePath(ALI)]: { owner: ALI, bytes: limit.bytes - 1_000, files: 3 }, [usagePath(BERK)]: { owner: BERK, bytes: 0, files: limit.files } }, {}, async () => {
        await assert.rejects(uploadGameAudio(ALI, wav(4), "b"), (error) => {
            assert.equal(error.code, "audio_quota");
            assert.equal(error.status, 409);
            assert.equal(error.extra.limitBytes, limit.bytes);
            return true;
        });
        await rejects(uploadGameAudio(BERK, wav(5), "c"), "audio_quota");
        // A smaller file still fits.
        const small = await uploadGameAudio(ALI, wav(6, 900), "tiny");
        assert.equal(small.usage.bytes, limit.bytes - 100);
    });
});

test("removing a file frees storage and deletes it when no account or published game keeps it", async () => {
    await withBackend({}, {}, async (db) => {
        const shared = await uploadGameAudio(ALI, wav(6), "shared");
        const own = await uploadGameAudio(ALI, wav(7), "own");
        await uploadGameAudio(BERK, wav(6), "shared too");
        const removed = await releaseGameAudio(ALI, own.hash);
        assert.equal(removed.removed, true);
        assert.deepEqual([removed.usage.files, removed.usage.bytes], [1, 2_000]);
        assert.equal(db.get(`game_assets/${own.hash}`), null, "nobody keeps it: deleted");
        await releaseGameAudio(ALI, shared.hash);
        assert.ok(db.get(`game_assets/${shared.hash}`), "Berk still keeps it");
        assert.equal((await releaseGameAudio(ALI, shared.hash)).removed, false);
    });
});

test("published games keep their own copies; unpublishing and account deletion clean up", async () => {
    await withBackend({ [`users/${ALI}`]: { email: ALI } }, {}, async (db) => {
        const jump = await uploadGameAudio(ALI, wav(8), "jump");
        const music = await uploadGameAudio(ALI, wav(9), "music");
        await syncArcadeAudio("game_arcade1", [jump.hash, music.hash]);
        assert.equal(ownerDocs(db).length, 4);
        // The author removes the music from their library: the game still has it.
        await releaseGameAudio(ALI, music.hash);
        assert.ok(db.get(`game_assets/${music.hash}`));
        // Republished without the music: the game's copy goes and nobody keeps it any more.
        await syncArcadeAudio("game_arcade1", [jump.hash]);
        assert.equal(db.get(`game_assets/${music.hash}`), null);

        // A remix keeps the files for the remixer too.
        await claimGameAudio(BERK, [{ hash: jump.hash, name: "jump", size: jump.size, contentType: jump.contentType }]);
        assert.equal((await listGameAudio(BERK)).usage.files, 1);

        // Ali deletes the account; the remix still has the jump sound.
        const summary = await deleteAccountData(ALI, { scope: "all" });
        assert.ok(summary.deleted.gameAudio >= 1);
        assert.ok(db.get(`game_assets/${jump.hash}`), "Berk keeps the file");
        await releaseArcadeAudio("game_arcade1");
        assert.ok(db.get(`game_assets/${jump.hash}`));
        assert.equal(await deleteAccountGameAudio(BERK), 1);
        assert.equal(db.get(`game_assets/${jump.hash}`), null, "the last owner is gone: the file is deleted");
        assert.deepEqual(ownerDocs(db), []);
    });
});

// ---------------------------------------------------------------------------
// GLB models (V5)
// ---------------------------------------------------------------------------

const glb = await load("lib/game-engine/glb.ts");

test("GLB models: a self-contained glTF 2.0 file is stored and served; compressed or linked ones are refused", async () => {
    const model = glb.sampleGlb();
    const check = glb.inspectGlb(model);
    assert.equal(check.ok, true);
    assert.deepEqual(check.info, { meshes: 1, materials: 0, textures: 0, animations: 0, nodes: 1, triangles: 1 });
    assert.equal(assets.sniffGameAsset(model), "model/gltf-binary");
    assert.equal(sniffGameAudio(model), null, "a model is no audio file");

    const draco = glb.sampleGlb({ extensionsUsed: ["KHR_draco_mesh_compression"], extensionsRequired: ["KHR_draco_mesh_compression"] });
    assert.equal(glb.inspectGlb(draco).reason, "compressed");
    assert.equal(glb.inspectGlb(glb.sampleGlb({ extensionsUsed: ["EXT_meshopt_compression"] })).reason, "compressed");
    assert.equal(glb.inspectGlb(glb.sampleGlb({ extensionsUsed: ["KHR_texture_basisu"] })).reason, "compressed");
    const linked = glb.sampleGlb({ buffers: [{ byteLength: 36, uri: "https://evil.example/mesh.bin" }] });
    assert.equal(glb.inspectGlb(linked).reason, "external");
    assert.equal(glb.inspectGlb(glb.sampleGlb({ images: [{ uri: "data:image/png;base64,AAAA" }] })).reason, "external");
    assert.equal(glb.inspectGlb(glb.sampleGlb({ asset: { version: "1.0" } })).reason, "version");
    const truncated = model.slice(0, 30);
    assert.equal(glb.inspectGlb(truncated).ok, false);
    assert.equal(glb.inspectGlb(new TextEncoder().encode("glTF but not really, just text")).ok, false);

    await withBackend({}, {}, async () => {
        const uploaded = await uploadGameAudio(ALI, model, "Robot");
        assert.deepEqual([uploaded.contentType, uploaded.name, uploaded.usage.files], ["model/gltf-binary", "Robot", 1]);
        const read = await readGameAudio(uploaded.hash);
        assert.equal(read.contentType, "model/gltf-binary");
        await rejects(uploadGameAudio(ALI, draco, "Draco"), "unsupported_model");
        await rejects(uploadGameAudio(ALI, linked, "Linked"), "unsupported_model");
        const listed = await listGameAudio(ALI);
        assert.deepEqual(listed.files.map((item) => item.contentType), ["model/gltf-binary"], "models share the game file library and quota");
    });
});
