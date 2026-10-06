// Run: node --test scripts/tests/
// Files in Hanogt Social messages (lib/server/message-files.ts) against the
// in-memory Firestore stand-in: the checks before storing, one commit with
// the message, parts for big files, who may open a file, byte ranges, the
// senders' space by plan and every way a file is deleted.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const files = await load("lib/server/message-files.ts");
const model = await load("lib/social/attachments.ts");

const ALI = "ali@example.com";
const BERK = "berk@example.com";
const CEM = "cem@example.com";
const CHAT = [ALI, BERK].sort().join("_");
const G = "group1";
const DAY = 86_400_000;
const seed = (extra = {}) => ({
    [`chats/${CHAT}`]: { participants: [ALI, BERK] },
    [`groups/${G}`]: { name: "Kod Kulübü", members: [ALI, CEM], ownerEmail: ALI },
    ...extra,
});

const u32be = (value) => [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
const chunk = (type, data) => [...u32be(data.length), ...Buffer.from(type, "latin1"), ...data, 0, 0, 0, 0];
/** A PNG of `width`×`height` whose picture data takes `size` bytes. */
function png(width, height, size = 16) {
    return Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...chunk("IHDR", [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]),
        ...chunk("tEXt", [...Buffer.from("Location\u0000Ankara", "latin1")]),
        ...chunk("IDAT", Array.from({ length: size }, (_, index) => index % 251)),
        ...chunk("IEND", []),
    ]);
}
const text = (value) => Uint8Array.from(Buffer.from(value, "utf8"));

async function rejects(promise, code) {
    await assert.rejects(promise, (error) => {
        assert.equal(error.code, code, `expected ${code}, got ${error.code} (${error.message})`);
        return true;
    });
}

let counter = 0;
/** A message carrying `file`, written the way the routes write it. */
async function send(file, sender, place) {
    counter += 1;
    const messagePath = place === "dm" ? `chats/${CHAT}/messages/m${counter}` : `groups/${G}/messages/m${counter}`;
    const container = place === "dm" ? `dm:${CHAT}` : `group:${G}`;
    const createdAt = new Date();
    await files.commitWithFile(file, messagePath, [
        ...files.fileWrites(file, { sender, container, messagePath }, createdAt),
        { type: "create", path: messagePath, data: { fromEmail: sender, type: "file", text: "", file: files.attachmentField(file), createdAt } },
    ]);
    return messagePath;
}

test("a file is checked before it is stored", () => {
    assert.throws(() => files.prepareFile(new Uint8Array(0), "a.txt"), { code: "attachment_empty" });
    assert.throws(() => files.prepareFile(text("x".repeat(100)), "a.txt", 50), { code: "attachment_too_large" });
    assert.throws(() => files.prepareFile(text("echo hi"), "setup.bat"), { code: "attachment_type" });
    assert.throws(() => files.prepareFile(Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]), "tool.dat"), { code: "attachment_type" });
    assert.throws(() => files.prepareFile(png(20_000, 20_000), "huge.png"), { code: "attachment_image" });

    const picture = files.prepareFile(png(800, 600), "kedi.pdf");
    assert.equal(picture.attachment.name, "kedi.png", "the extension follows the contents");
    assert.equal(picture.attachment.kind, "image");
    assert.equal(picture.attachment.contentType, "image/png");
    assert.deepEqual([picture.attachment.width, picture.attachment.height], [800, 600]);
    assert.ok(!Buffer.from(picture.bytes).includes(Buffer.from("Ankara")), "the picture's text chunks are gone");
    assert.equal(picture.attachment.size, picture.bytes.byteLength);
    assert.ok(model.isFileId(picture.attachment.id));

    const code = files.prepareFile(text("print('merhaba')\n"), "C:\\proje\\main.py");
    assert.deepEqual([code.attachment.name, code.attachment.kind, code.attachment.width], ["main.py", "text", null]);
});

test("small files sit in their document, big ones in parts; the sender's space counts them", async () => {
    await withBackend(seed(), {}, async (db) => {
        const small = files.prepareFile(text("a,b\n1,2\n"), "tablo.csv");
        await send(small, ALI, "dm");
        const stored = db.get(`message_files/${small.attachment.id}`);
        assert.equal(stored.parts, 0);
        assert.equal(stored.container, `dm:${CHAT}`);
        assert.equal(stored.sender, ALI);
        assert.ok(stored.data instanceof Uint8Array || Buffer.isBuffer(stored.data) || typeof stored.data === "object");

        const big = files.prepareFile(png(1000, 1000, 1_500_000), "foto.png");
        await send(big, ALI, "group");
        const record = db.get(`message_files/${big.attachment.id}`);
        assert.equal(record.parts, 3);
        assert.equal(record.data, undefined, "the bytes are in the parts");
        for (const index of [0, 1, 2]) assert.ok(db.has(`message_files/${big.attachment.id}/parts/${index}`));
        assert.deepEqual(await files.attachmentUsageOf(ALI), { bytes: small.bytes.byteLength + big.bytes.byteLength, files: 2 });

        // The whole big file comes back in order.
        const opened = await files.openMessageFile(CEM, big.attachment.id);
        assert.equal(opened.status, 200);
        assert.deepEqual(Buffer.from(opened.body), Buffer.from(big.bytes));
    });
});

test("only people who can see the message open its file, with byte ranges", async () => {
    await withBackend(seed(), {}, async (db) => {
        const note = files.prepareFile(text("0123456789abcdef"), "not.txt");
        const dmPath = await send(note, ALI, "dm");
        const shot = files.prepareFile(png(10, 10), "ekran.png");
        const groupPath = await send(shot, CEM, "group");

        assert.equal((await files.openMessageFile(BERK, note.attachment.id)).status, 200, "the other person in the conversation");
        await rejects(files.openMessageFile(CEM, note.attachment.id), "attachment_unavailable");
        assert.equal((await files.openMessageFile(ALI, shot.attachment.id)).status, 200, "a member of the group");
        await rejects(files.openMessageFile(BERK, shot.attachment.id), "attachment_unavailable");
        await rejects(files.openMessageFile(ALI, "not-an-id"), "attachment_unavailable");

        const part = await files.openMessageFile(ALI, note.attachment.id, "bytes=4-7");
        assert.equal(part.status, 206);
        assert.equal(Buffer.from(part.body).toString(), "4567");
        assert.equal(part.contentRange, "bytes 4-7/16");
        const tail = await files.openMessageFile(ALI, note.attachment.id, "bytes=-3");
        assert.equal(Buffer.from(tail.body).toString(), "def");
        assert.equal((await files.openMessageFile(ALI, note.attachment.id, "bytes=99-")).status, 416);

        // A deleted message, or one that no longer carries the file, opens nothing.
        db.get(dmPath).deleted = true;
        await rejects(files.openMessageFile(BERK, note.attachment.id), "attachment_unavailable");
        db.get(groupPath).file = { ...db.get(groupPath).file, id: "123e4567-e89b-42d3-a456-426614174000" };
        await rejects(files.openMessageFile(ALI, shot.attachment.id), "attachment_unavailable");
    });
});

test("deleting a message, a place or an account frees the space", async () => {
    await withBackend(seed(), {}, async (db) => {
        const one = files.prepareFile(png(1000, 1000, 800_000), "bir.png");
        const two = files.prepareFile(text("iki"), "iki.txt");
        const three = files.prepareFile(text("üç"), "uc.txt");
        const theirs = files.prepareFile(text("Berk'in"), "berk.txt");
        await send(one, ALI, "dm");
        await send(two, ALI, "group");
        await send(three, ALI, "group");
        await send(theirs, BERK, "dm");
        const before = await files.attachmentUsageOf(ALI);
        assert.equal(before.files, 3);

        assert.equal(await files.deleteMessageFiles([one.attachment.id, "junk", null]), 1);
        assert.equal(db.has(`message_files/${one.attachment.id}`), false);
        assert.equal(db.paths().some((path) => path.startsWith(`message_files/${one.attachment.id}/`)), false, "its parts went too");
        assert.deepEqual(await files.attachmentUsageOf(ALI), { bytes: before.bytes - one.bytes.byteLength, files: 2 });
        assert.equal(await files.deleteMessageFiles([one.attachment.id]), 0, "deleting again is harmless");

        assert.equal(await files.deleteContainerFiles(`group:${G}`), 2);
        assert.deepEqual(await files.attachmentUsageOf(ALI), { bytes: 0, files: 0 });
        assert.ok(db.has(`message_files/${theirs.attachment.id}`), "other places keep their files");

        const listed = await files.listSenderFiles(BERK);
        assert.deepEqual(listed.map((entry) => [entry.name, entry.place]), [["berk.txt", "dm"]]);
        assert.ok(!JSON.stringify(listed).includes(ALI), "the export doesn't name the other person");
        assert.equal(await files.deleteSenderFiles(BERK), 1);
        assert.equal(db.has(`message_file_usage/${BERK}`), false);
    });
});

test("the plan decides the largest file and the space", async () => {
    const MB = 1024 * 1024;
    await withBackend(seed({
        [`subscriptions/${BERK}`]: { plan: "plus", status: "active", expiresAt: new Date(Date.now() + 30 * DAY) },
        [`message_file_usage/${CEM}`]: { bytes: 25 * MB - 1_000, files: 40 },
    }), {}, async () => {
        await rejects(files.assertFileFits(ALI, 3 * MB), "attachment_too_large");
        assert.equal((await files.assertFileFits(ALI, 2 * MB)).plan, "free");
        assert.equal((await files.assertFileFits(BERK, 4 * MB)).plan, "plus");
        await rejects(files.assertFileFits(BERK, 4 * MB + 1), "attachment_too_large");
        await rejects(files.assertFileFits(CEM, 2_000), "attachment_storage");
        assert.ok(await files.assertFileFits(CEM, 1_000));
    });
});
