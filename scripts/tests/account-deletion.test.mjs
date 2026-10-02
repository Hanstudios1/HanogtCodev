// Run: node --test scripts/tests/
// The deletion cascade runs against an in-memory stand-in for the Firestore,
// Auth and Storage REST APIs: the server helpers talk to "emulators" on
// loopback addresses, and fetch is replaced before anything is sent.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const {
    anonymousSender, createDeletionTally, deleteAccountData, deletionSteps, deletionTotal, largestCounts,
} = await load("lib/server/account-deletion.ts");
const { likerHash } = await load("lib/server/arcade.ts");
const { voterHash } = await load("lib/server/ai-rankings.ts");

// ---------------------------------------------------------------------------
// Data set: Ali is deleted, Berk and Cem are bystanders
// ---------------------------------------------------------------------------

const ALI = "ali@example.com";
const BERK = "berk@example.com";
const CEM = "cem@example.com";
const NEWS_ID = "0123456789abcdef0123";

function seed() {
    return {
        [`users/${ALI}`]: { email: ALI, username: "Ali", friends: [BERK], blockedUsers: [] },
        [`users/${BERK}`]: { email: BERK, username: "Berk", friends: [ALI, CEM], blockedUsers: [] },
        [`users/${CEM}`]: { email: CEM, username: "Cem", friends: [BERK], blockedUsers: [ALI] },
        [`credentials/${ALI}`]: { passwordHash: "hash" },
        [`public_profiles/${ALI}`]: { email: ALI, username: "Ali" },
        [`public_profiles/${BERK}`]: { email: BERK, username: "Berk" },

        "chats/chat1": { participants: [ALI, BERK] },
        "chats/chat1/messages/m1": { fromEmail: ALI, type: "voice", text: "", voicePath: "voice-messages/chat1/a.webm" },
        "chats/chat1/messages/m2": { fromEmail: BERK, type: "text", text: "hi" },
        "chats/chat2": { participants: [BERK, CEM] },
        "chats/chat2/messages/m1": { fromEmail: BERK, type: "text", text: "hello" },
        "calls/call1": { participants: [ALI, BERK] },
        "calls/call1/callerCandidates/c1": { candidate: "a" },
        "calls/call1/calleeCandidates/c2": { candidate: "b" },

        "projects/p1": { email: ALI, name: "Ali's project" },
        "projects/p1/files/f1": { name: "main.js", code: "1" },
        "projects/p2": { email: BERK, name: "Berk's project" },
        "game_projects/g1": { ownerEmail: ALI },
        "game_projects/g1/scripts/s1": { source: "x" },

        "arcade_games/game1": { ownerEmail: ALI, likes: 1 },
        "arcade_likes/l1": { gameId: "game1", liker: likerHash(BERK) },
        "arcade_games/game2": { ownerEmail: BERK, likes: 1 },
        "arcade_likes/l2": { gameId: "game2", liker: likerHash(ALI) },
        "arena_votes/v1": { voter: voterHash(ALI), category: "code" },

        "news_comments/nc1": { authorEmail: ALI, newsId: NEWS_ID, text: "first" },
        "news_comments/nc2": { authorEmail: BERK, newsId: NEWS_ID, text: "second" },
        [`news_meta/${NEWS_ID}`]: { commentCount: 2 },

        "media_posts/mp1": { ownerEmail: ALI, likeCount: 1, commentCount: 1 },
        "media_posts/mp1/files/000": { name: "a.py" },
        "media_likes/mp1_berk": { postId: "mp1", userEmail: BERK },
        "media_comments/mc1": { postId: "mp1", authorEmail: BERK, text: "nice" },
        "media_reports/r1": { postId: "mp1", reporterEmail: CEM },
        "security_training_contributions/mp1": { ownerEmail: ALI },
        "media_posts/mp2": { ownerEmail: BERK, likeCount: 1, commentCount: 1 },
        "media_likes/mp2_ali": { postId: "mp2", userEmail: ALI },
        "media_comments/mc2": { postId: "mp2", authorEmail: ALI, text: "cool" },
        "media_reports/r2": { postId: "mp2", reporterEmail: ALI },

        "groups/grpA": { ownerEmail: ALI, members: [ALI, BERK], admins: [ALI] },
        "groups/grpA/messages/gm0": { fromEmail: ALI, type: "text", text: "welcome", author: "Ali" },
        "groups/grpA/messages/gm1": { fromEmail: BERK, type: "text", text: "hey", author: "Berk" },
        "groups/grpA/files/f1": { name: "a.txt" },
        "group_invites/i1": { groupId: "grpA", fromEmail: ALI, toEmail: CEM },
        "group_invite_links/link1": { groupId: "grpA", createdBy: ALI },
        "group_bans/b1": { groupId: "grpA", email: CEM, bannedBy: ALI },
        "groups/grpB": { ownerEmail: BERK, members: [BERK, ALI], admins: [BERK, ALI] },
        "groups/grpB/messages/gm2": { fromEmail: ALI, type: "text", text: "hello", author: "Ali", authorAvatar: "https://x/a.png" },
        "groups/grpB/messages/gm3": { fromEmail: ALI, type: "voice", text: "", author: "Ali", voicePath: "group-voice-messages/grpB/v.webm", voiceDuration: 3 },
        "groups/grpB/messages/gm4": { fromEmail: BERK, type: "text", text: "yo", author: "Berk" },
        "group_invite_links/link2": { groupId: "grpB", createdBy: ALI },
        "group_bans/b3": { groupId: "grpB", email: CEM, bannedBy: ALI },
        "groups/grpC": { ownerEmail: CEM, members: [CEM], admins: [CEM] },
        "groups/grpC/messages/gm5": { fromEmail: ALI, type: "text", text: "old message", author: "Ali" },
        "group_bans/b2": { groupId: "grpC", email: ALI, bannedBy: CEM },
        "group_invites/i2": { groupId: "grpB", fromEmail: BERK, toEmail: ALI },

        "friendRequests/fr1": { fromEmail: ALI, toEmail: CEM, status: "pending" },
        "friendRequests/fr2": { fromEmail: CEM, toEmail: ALI, status: "pending" },

        "feedback/fb1": { authorEmail: ALI, content: "idea", likes: [BERK], comments: [] },
        "feedback/fb2": {
            authorEmail: BERK,
            content: "other idea",
            likes: [ALI, CEM],
            comments: [{ id: "c1", authorEmail: ALI, content: "+1" }, { id: "c2", authorEmail: CEM, content: "ok" }],
        },
        "changelog_comments/v1/comments/cc1": { email: ALI, text: "nice release" },
        "changelog_comments/v1/comments/cc2": { email: BERK, text: "thanks" },
        [`notifications/${ALI}/items/n1`]: { text: "a" },
        [`notifications/${ALI}/items/n2`]: { text: "b" },
        "support_tickets/t1": { authorEmail: ALI, title: "help", messages: [{ from: "user", text: "hi" }] },
        "support_tickets/t2": { authorEmail: BERK, title: "bug" },
    };
}

const BYSTANDER_DATA = [
    `users/${BERK}`, `users/${CEM}`, `public_profiles/${BERK}`, "chats/chat2", "chats/chat2/messages/m1", "projects/p2", "arcade_games/game2",
    "news_comments/nc2", "media_posts/mp2", "groups/grpB", "groups/grpB/messages/gm4", "groups/grpC", "feedback/fb2",
    "changelog_comments/v1/comments/cc2", "support_tickets/t2",
];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("the content scope never touches the account, private data or other people's lists", () => {
    const content = deletionSteps("content");
    const all = deletionSteps("all");
    for (const step of ["account", "chats", "calls", "projects", "gameProjects", "friendLists", "requests", "notifications", "supportTickets", "plans", "arcadeLikes", "groupRecords"]) {
        assert.ok(!content.includes(step), `"content" must not run ${step}`);
        assert.ok(all.includes(step), `"all" must run ${step}`);
    }
    assert.ok(content.every((step) => all.includes(step)));
    assert.equal(all.at(-1), "account", "the account goes last");
});

test("the tally merges repeated failures and never repeats an e-mail address", () => {
    const tally = createDeletionTally();
    tally.count("chats");
    tally.count("chats", 2);
    tally.count("nothing", 0);
    tally.fail("chats", new Error("Firestore silme hatası (503)."));
    tally.fail("chats", new Error("Firestore silme hatası (503)."));
    tally.fail("friendLists", new Error(`users/${BERK} could not be updated`));
    const summary = tally.summary();
    assert.deepEqual(summary.deleted, { chats: 3 });
    assert.deepEqual(summary.errors, ["chats: Firestore silme hatası (503). (×2)", "friendLists: users/… could not be updated"]);
    assert.ok(!summary.errors.join(" ").includes("@"));
});

test("totals and the largest counts for the audit log", () => {
    const deleted = { chats: 2, chatMessages: 40, account: 1, feedback: 2, notifications: 9 };
    assert.equal(deletionTotal(deleted), 54);
    assert.deepEqual(Object.keys(largestCounts(deleted, 3)), ["chatMessages", "notifications", "chats"]);
    assert.deepEqual(largestCounts({ a: 0 }, 5), {});
});

test("the anonymous sender is stable, salted and does not reveal the address", () => {
    const sender = anonymousSender(ALI);
    assert.equal(sender, anonymousSender(ALI));
    assert.notEqual(sender, anonymousSender(BERK));
    assert.match(sender, /^deleted-[a-f0-9]{24}$/);
    assert.ok(!sender.includes(Buffer.from(ALI).toString("base64url").slice(0, 8)));
});

test("only canonical e-mail addresses are accepted", async () => {
    await assert.rejects(() => deleteAccountData("../credentials/x", { scope: "all" }));
    await assert.rejects(() => deleteAccountData("Ali@Example.com", { scope: "all" }));
    await assert.rejects(() => deleteAccountData(ALI, { scope: "everything" }));
});

// ---------------------------------------------------------------------------
// Cascade
// ---------------------------------------------------------------------------

test('"all" deletes the account and everything it left behind', async () => {
    await withBackend(seed(), {}, async (db) => {
        const summary = await deleteAccountData(ALI, { scope: "all" });
        assert.deepEqual(summary.errors, []);
        assert.equal(summary.accountDeleted, true);

        for (const path of [
            `users/${ALI}`, `credentials/${ALI}`, `public_profiles/${ALI}`,
            "chats/chat1", "chats/chat1/messages/m1", "chats/chat1/messages/m2", "calls/call1", "calls/call1/callerCandidates/c1", "calls/call1/calleeCandidates/c2",
            "projects/p1", "projects/p1/files/f1", "game_projects/g1", "game_projects/g1/scripts/s1",
            "arcade_games/game1", "arcade_likes/l1", "arcade_likes/l2", "arena_votes/v1", "news_comments/nc1",
            "media_posts/mp1", "media_posts/mp1/files/000", "media_likes/mp1_berk", "media_comments/mc1", "media_reports/r1", "security_training_contributions/mp1",
            "media_likes/mp2_ali", "media_comments/mc2", "media_reports/r2",
            "groups/grpA", "groups/grpA/messages/gm0", "groups/grpA/messages/gm1", "groups/grpA/files/f1", "group_invites/i1", "group_invite_links/link1", "group_bans/b1",
            "group_invite_links/link2", "group_bans/b2", "group_invites/i2", "friendRequests/fr1", "friendRequests/fr2",
            "feedback/fb1", "changelog_comments/v1/comments/cc1", `notifications/${ALI}/items/n1`, `notifications/${ALI}/items/n2`, "support_tickets/t1",
        ]) {
            assert.equal(db.has(path), false, `${path} should be deleted`);
        }
        for (const path of BYSTANDER_DATA) assert.equal(db.has(path), true, `${path} must stay`);

        // Counters on other people's content go down.
        assert.equal(db.get("arcade_games/game2").likes, 0);
        assert.equal(db.get(`news_meta/${NEWS_ID}`).commentCount, 1);
        assert.equal(db.get("media_posts/mp2").likeCount, 0);
        assert.equal(db.get("media_posts/mp2").commentCount, 0);

        // Lists of other people no longer name the account.
        assert.deepEqual(db.get(`users/${BERK}`).friends, [CEM]);
        assert.deepEqual(db.get(`users/${CEM}`).blockedUsers, []);
        assert.deepEqual(db.get("groups/grpB").members, [BERK]);
        assert.deepEqual(db.get("groups/grpB").admins, [BERK]);
        assert.equal(db.get("group_bans/b3").bannedBy, null);
        assert.deepEqual(db.get("feedback/fb2").likes, [CEM]);
        assert.deepEqual(db.get("feedback/fb2").comments.map((comment) => comment.id), ["c2"]);

        // Messages in groups that stay are anonymised (also in a group left earlier).
        for (const path of ["groups/grpB/messages/gm2", "groups/grpB/messages/gm3", "groups/grpC/messages/gm5"]) {
            const message = db.get(path);
            assert.equal(message.fromEmail, anonymousSender(ALI), path);
            assert.equal(message.author, "Silinmiş kullanıcı");
            assert.equal(message.authorAvatar, null);
        }
        assert.equal(db.get("groups/grpB/messages/gm2").text, "hello");
        assert.equal(db.get("groups/grpB/messages/gm3").text, "Silinmiş sesli mesaj");
        assert.equal(db.get("groups/grpB/messages/gm3").voicePath, null);
        assert.equal(db.get("groups/grpB/messages/gm4").fromEmail, BERK);

        assert.deepEqual(db.storageDeleted.sort(), ["group-voice-messages/grpB/v.webm", "voice-messages/chat1/a.webm"]);
        assert.deepEqual(db.authDeleted, [createHash("sha256").update(ALI).digest("hex").slice(0, 64)]);
        assert.ok(!db.paths().some((path) => path.includes(ALI)), "no document path names the account");

        assert.equal(summary.deleted.account, 1);
        assert.equal(summary.deleted.chats, 1);
        assert.equal(summary.deleted.chatMessages, 2);
        assert.equal(summary.deleted.groups, 1);
        assert.equal(summary.deleted.groupMemberships, 1);
        assert.equal(summary.deleted.groupMessagesAnonymized, 3);
        assert.equal(summary.deleted.friendLinks, 1);
        assert.equal(summary.deleted.blockLinks, 1);
        assert.equal(summary.deleted.supportTickets, 1);
    });
});

test('"content" removes public content and keeps the account, friends, chats and projects', async () => {
    await withBackend(seed(), {}, async (db) => {
        const summary = await deleteAccountData(ALI, { scope: "content" });
        assert.deepEqual(summary.errors, []);
        assert.equal(summary.accountDeleted, false);

        for (const path of [
            "arcade_games/game1", "arcade_likes/l1", "news_comments/nc1",
            "media_posts/mp1", "media_posts/mp1/files/000", "media_likes/mp1_berk", "media_comments/mc1", "media_reports/r1", "security_training_contributions/mp1",
            "media_comments/mc2", "feedback/fb1", "changelog_comments/v1/comments/cc1",
        ]) {
            assert.equal(db.has(path), false, `${path} should be deleted`);
        }
        for (const path of [
            `users/${ALI}`, `credentials/${ALI}`, `public_profiles/${ALI}`, "chats/chat1", "chats/chat1/messages/m1", "calls/call1", "projects/p1", "projects/p1/files/f1",
            "game_projects/g1", "arcade_likes/l2", "arena_votes/v1", "media_likes/mp2_ali", "media_reports/r2", "groups/grpA", "groups/grpA/files/f1",
            "group_invite_links/link2", "group_bans/b2", "friendRequests/fr1", "group_invites/i2", `notifications/${ALI}/items/n1`, "support_tickets/t1",
            ...BYSTANDER_DATA,
        ]) {
            assert.equal(db.has(path), true, `${path} must stay`);
        }

        assert.deepEqual(db.get(`users/${BERK}`).friends, [ALI, CEM]);
        assert.deepEqual(db.get("groups/grpB").members, [BERK, ALI]);
        assert.deepEqual(db.get("feedback/fb2").likes, [ALI, CEM], "likes are not content");
        assert.deepEqual(db.get("feedback/fb2").comments.map((comment) => comment.id), ["c2"]);
        assert.equal(db.get("media_posts/mp2").commentCount, 0);
        assert.equal(db.get("media_posts/mp2").likeCount, 1);
        assert.equal(db.get(`news_meta/${NEWS_ID}`).commentCount, 1);

        // Group messages are anonymised everywhere, also in the group the account owns.
        for (const path of ["groups/grpA/messages/gm0", "groups/grpB/messages/gm2", "groups/grpB/messages/gm3", "groups/grpC/messages/gm5"]) {
            assert.equal(db.get(path).fromEmail, anonymousSender(ALI), path);
        }
        assert.equal(db.get("chats/chat1/messages/m1").fromEmail, ALI, "private chats stay as they are");
        assert.deepEqual(db.storageDeleted, ["group-voice-messages/grpB/v.webm"]);
        assert.deepEqual(db.authDeleted, []);
        assert.equal(summary.deleted.account, undefined);
    });
});

test("a failing step is reported and the rest of the cascade still runs", async () => {
    // A missing collection-group index makes Firestore reject these queries with 400.
    const options = { failQuery: ({ allDescendants }) => (allDescendants ? 400 : 0) };
    await withBackend(seed(), options, async (db) => {
        const summary = await deleteAccountData(ALI, { scope: "all" });
        assert.equal(summary.accountDeleted, true);
        assert.ok(summary.errors.some((line) => line.startsWith("groupMessages:")), summary.errors.join("\n"));
        assert.ok(summary.errors.some((line) => line.startsWith("changelogComments:")), summary.errors.join("\n"));
        assert.equal(summary.errors.length, 2);
        // Groups the account is still in are handled without the collection-group query.
        assert.equal(db.get("groups/grpB/messages/gm2").fromEmail, anonymousSender(ALI));
        // The group it left earlier can only be reached through it.
        assert.equal(db.get("groups/grpC/messages/gm5").fromEmail, ALI);
        assert.equal(db.has("changelog_comments/v1/comments/cc1"), true);
        assert.equal(db.has("support_tickets/t1"), false);
        assert.equal(db.has(`users/${ALI}`), false);
    });
});

test("a parent document stays when its children could not be deleted, so a second run finishes", async () => {
    let failChatMessages = true;
    const options = {
        onCommit(writes) {
            if (failChatMessages && writes.some((write) => write.delete?.includes("/documents/chats/chat1/messages/"))) {
                throw new Precondition(503, "UNAVAILABLE");
            }
        },
    };
    await withBackend(seed(), options, async (db) => {
        const first = await deleteAccountData(ALI, { scope: "all" });
        assert.equal(first.accountDeleted, true);
        assert.ok(first.errors.some((line) => line.startsWith("chats:")), first.errors.join("\n"));
        assert.equal(db.has("chats/chat1"), true);
        assert.equal(db.has("chats/chat1/messages/m2"), true);
        assert.equal(db.has("projects/p1"), false);

        failChatMessages = false;
        const second = await deleteAccountData(ALI, { scope: "all" });
        assert.deepEqual(second.errors, []);
        assert.equal(db.has("chats/chat1"), false);
        assert.equal(db.has("chats/chat1/messages/m2"), false);
        assert.equal(second.deleted.chats, 1);
    });
});

test("a voice file that cannot be deleted keeps its message for a later run", async () => {
    const options = { failStorage: (object) => (object.startsWith("voice-messages/") ? 503 : 0) };
    await withBackend(seed(), options, async (db) => {
        const summary = await deleteAccountData(ALI, { scope: "all" });
        assert.ok(summary.errors.some((line) => line.startsWith("chats:")), summary.errors.join("\n"));
        assert.equal(db.has("chats/chat1/messages/m1"), true, "the message still points to the recording");
        assert.equal(db.has("chats/chat1/messages/m2"), false);
        assert.equal(db.has("chats/chat1"), true);
    });
});
