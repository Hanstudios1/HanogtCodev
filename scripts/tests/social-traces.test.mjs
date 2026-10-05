// Run: node --test scripts/tests/*.test.mjs
// What a message leaves elsewhere in Hanogt Social (lib/server/message-traces.ts,
// lib/server/social-stars.ts): quotes in replies and starred copies follow the
// message, so its words don't outlive a deletion or an edit, and a person's
// stars in a group go when they leave it or the group is deleted.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const stars = await load("lib/server/social-stars.ts");
const traces = await load("lib/server/message-traces.ts");
const { dmChatId } = await load("lib/social/model.ts");

const ALI = "ali@example.com";
const BERK = "berk@example.com";
const CEM = "cem@example.com";
const CHAT = dmChatId(ALI, BERK);
const DM = { scope: "dm", place: CHAT, parentPath: `chats/${CHAT}` };
const GROUP = { scope: "group", place: "grp1", parentPath: "groups/grp1" };

function seed() {
    return {
        [`chats/${CHAT}`]: { participants: [ALI, BERK] },
        [`chats/${CHAT}/messages/m1`]: { fromEmail: ALI, type: "text", text: "the **secret** plan", createdAt: "2026-10-05T10:00:00.000Z" },
        [`chats/${CHAT}/messages/m2`]: { fromEmail: BERK, type: "text", text: "ok", replyTo: { id: "m1", text: "the secret plan", fromEmail: ALI } },
        [`chats/${CHAT}/messages/m3`]: { fromEmail: ALI, type: "text", text: "and?", replyTo: { id: "m2", text: "ok", fromEmail: BERK } },
        "groups/grp1": { ownerEmail: ALI, members: [ALI, BERK, CEM] },
        "groups/grp1/messages/g1": { fromEmail: ALI, author: "Ali", type: "text", text: "first" },
        "groups/grp1/messages/g2": { fromEmail: CEM, author: "Cem", type: "text", text: "second" },
        "groups/grp1/messages/g3": { fromEmail: BERK, author: "Berk", type: "text", text: "third", replyTo: { id: "g1", text: "first" } },
        "groups/grp2": { ownerEmail: BERK, members: [BERK] },
        "groups/grp2/messages/h1": { fromEmail: BERK, author: "Berk", type: "text", text: "elsewhere" },
    };
}

const starPaths = (db) => db.paths().filter((path) => path.startsWith("message_stars/")).sort();

test("a star records which message, place and author its excerpt came from", async () => {
    await withBackend(seed(), {}, async (db) => {
        await stars.starMessage(BERK, "dm", ALI, "m1", true);
        const [path] = starPaths(db);
        const star = db.get(path);
        assert.equal(star.owner, BERK);
        assert.equal(star.messageRef, `dm:${CHAT}:m1`);
        assert.equal(star.placeRef, `dm:${CHAT}`);
        assert.equal(star.authorEmail, ALI);
        assert.equal(star.excerpt, "the secret plan", "the excerpt is plain text");
        // Both people's stars on one message share the reference.
        await stars.starMessage(ALI, "dm", BERK, "m1", true);
        assert.deepEqual(new Set(starPaths(db).map((entry) => db.get(entry).messageRef)), new Set([`dm:${CHAT}:m1`]));
    });
});

test("a deleted message leaves no quote or star behind", async () => {
    await withBackend(seed(), {}, async (db) => {
        await stars.starMessage(BERK, "dm", ALI, "m1", true);
        await stars.starMessage(ALI, "dm", BERK, "m1", true);
        await stars.starMessage(ALI, "dm", BERK, "m2", true);
        await traces.clearMessageTraces(DM, ["m1"]);
        assert.deepEqual(db.get(`chats/${CHAT}/messages/m2`).replyTo, { id: "m1", text: "", fromEmail: ALI, deleted: true });
        assert.deepEqual(db.get(`chats/${CHAT}/messages/m3`).replyTo, { id: "m2", text: "ok", fromEmail: BERK }, "other quotes stay");
        assert.deepEqual(starPaths(db).map((path) => db.get(path).messageId), ["m2"]);
        assert.deepEqual(await stars.listStars(BERK), []);
    });
});

test("an edited message is quoted and starred with its new words", async () => {
    await withBackend(seed(), {}, async (db) => {
        await stars.starMessage(BERK, "dm", ALI, "m1", true);
        await traces.refreshMessageTraces(DM, "m1", { fromEmail: ALI, type: "text", text: "a *new* plan" }, "a new plan");
        assert.equal(db.get(`chats/${CHAT}/messages/m2`).replyTo.text, "a new plan");
        assert.equal(db.get(`chats/${CHAT}/messages/m2`).replyTo.fromEmail, ALI, "the rest of the quote stays");
        const [star] = await stars.listStars(BERK);
        assert.equal(star.excerpt, "a new plan");
    });
});

test("a purge clears quotes among the loaded messages and the stars on every purged message", async () => {
    await withBackend(seed(), {}, async (db) => {
        await stars.starMessage(BERK, "group", "grp1", "g1", true);
        await stars.starMessage(CEM, "group", "grp1", "g2", true);
        await stars.starMessage(CEM, "group", "grp1", "g3", true);
        const loaded = ["g1", "g2", "g3"].map((id) => ({ _path: `groups/grp1/messages/${id}`, replyTo: db.get(`groups/grp1/messages/${id}`).replyTo }));
        await traces.clearMessageTraces(GROUP, ["g1", "g2"], loaded);
        assert.deepEqual(db.get("groups/grp1/messages/g3").replyTo, { id: "g1", text: "", deleted: true });
        assert.deepEqual(starPaths(db).map((path) => db.get(path).messageId), ["g3"]);
    });
});

test("leaving a group takes the person's stars there, and deleting a group takes everyone's", async () => {
    await withBackend(seed(), {}, async (db) => {
        await stars.starMessage(BERK, "group", "grp1", "g1", true);
        await stars.starMessage(BERK, "group", "grp2", "h1", true);
        await stars.starMessage(CEM, "group", "grp1", "g2", true);
        await stars.forgetMemberStars(BERK, "grp1");
        const left = starPaths(db).map((path) => db.get(path));
        assert.deepEqual(left.map((star) => `${star.owner} ${star.messageId}`).sort(), [`${BERK} h1`, `${CEM} g2`]);
        await stars.forgetPlaceStars("group", "grp1");
        assert.deepEqual(starPaths(db).map((path) => db.get(path).messageId), ["h1"]);
    });
});

test("deleting an account takes everyone's stars on its messages", async () => {
    await withBackend(seed(), {}, async (db) => {
        await stars.starMessage(BERK, "group", "grp1", "g1", true);
        await stars.starMessage(CEM, "group", "grp1", "g1", true);
        await stars.starMessage(CEM, "group", "grp1", "g2", true);
        await stars.forgetAuthorStars(ALI);
        assert.deepEqual(starPaths(db).map((path) => db.get(path).messageId), ["g2"]);
    });
});
