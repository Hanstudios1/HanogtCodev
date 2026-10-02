// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const model = await load("lib/social/model.ts");
const groups = await load("lib/groups.ts");
const {
    SOCIAL_LIMITS, badgeLabel, cleanMessageText, compareMessages, cutText, dmChatId, dmHref, dmMessageFromData, dmUnreadCount, dmUnreadTotal,
    filterFriends, foldText, formatFriendTag, groupHref, groupUnreadState, homeBadgeCount, isDmVoicePath, isFriendsTab, isGroupNotifyLevel, isSticker,
    mergeMessages, parseFriendTag, parseSocialRoute, personMatches, previewText, railBadge, rankSwitcher, sectionMembers, sortDms, timeOf, visibleDms,
} = model;

const RLO = String.fromCharCode(0x202e);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const TOKEN = "AbCdEfGhIjKlMnOpQrSt_-";

function person(username, status, extra = {}) {
    return { email: `${username.toLowerCase()}@example.com`, username, nickname: "", status, ...extra };
}

test("direct conversations share one id whatever the order or case", () => {
    assert.equal(dmChatId("b@example.com", "A@example.com"), "a@example.com_b@example.com");
    assert.equal(dmChatId("a@example.com", "b@example.com"), dmChatId("B@example.com", "a@example.com"));
});

test("timeOf reads every stored time shape and rejects junk", () => {
    const iso = "2026-10-02T12:00:00.000Z";
    const ms = Date.parse(iso);
    assert.equal(timeOf(ms), ms);
    assert.equal(timeOf(iso), ms);
    assert.equal(timeOf(new Date(ms)), ms);
    assert.equal(timeOf({ toMillis: () => ms }), ms);
    assert.equal(timeOf({ seconds: ms / 1000, nanoseconds: 5_000_000 }), ms + 5);
    for (const value of [null, undefined, "", "not a date", Number.NaN, -5, 0, {}, []]) assert.equal(timeOf(value), 0);
});

test("message text is cleaned without breaking emoji", () => {
    assert.equal(cleanMessageText("  hi\r\nthere\rnow  "), "hi\nthere\nnow");
    assert.equal(cleanMessageText(`a\u0000b\u0007c${RLO}d${LINE_SEPARATOR}e\tf`), "abcde\tf");
    assert.equal(cleanMessageText("a\n\n\n\n\n\nb"), "a\n\n\nb");
    assert.equal(cleanMessageText(42), "");
    assert.equal(cleanMessageText("abcdef", 4), "abcd");
    // "aaa" + a surrogate pair is 5 units: cutting at 4 must drop the whole emoji.
    assert.equal(cleanMessageText("aaa😀", 4), "aaa");
    assert.equal(cleanMessageText("aa😀b", 4), "aa😀");
    assert.equal(cutText("😀😀", 3), "😀");
    assert.equal(cutText("short", 10), "short");
});

test("previews are one line with an ellipsis", () => {
    assert.equal(previewText("hello\n\nworld   again"), "hello world again");
    assert.equal(previewText("abcdefghij", 5), "abcd…");
    assert.equal(previewText("abc😀def", 5), "abc…");
    assert.equal(previewText(null), "");
    assert.ok(previewText("x".repeat(500)).length <= SOCIAL_LIMITS.previewMax);
});

test("friend tags split at the last # and need four digits", () => {
    assert.deepEqual(parseFriendTag(" Oyuncu#1234 "), { nickname: "Oyuncu", tag: "1234" });
    assert.deepEqual(parseFriendTag("C#Dev#0042"), { nickname: "C#Dev", tag: "0042" });
    for (const value of ["Oyuncu", "#1234", "Oyuncu#123", "Oyuncu#12345", "Oyuncu#abcd", "Bad\u0007Name#1234", `${"x".repeat(101)}#1234`, 1234, null]) {
        assert.equal(parseFriendTag(value), null, String(value));
    }
    assert.equal(formatFriendTag("Oyuncu", "1234"), "Oyuncu#1234");
    assert.equal(formatFriendTag("Oyuncu", ""), "");
    assert.equal(formatFriendTag("", "1234"), "");
});

test("search folds case, accents and the Turkish i", () => {
    assert.equal(foldText("İSTANBUL"), "istanbul");
    assert.equal(foldText("ıspanak"), "ispanak");
    assert.equal(foldText(`Jose${String.fromCharCode(0x301)}`), "jose");
    assert.equal(foldText(" Çağrı "), "cagri");
    assert.ok(personMatches({ username: "Işıl", nickname: "" }, "isi"));
    assert.ok(personMatches({ username: "x", nickname: "Kodcu" }, "KOD"));
    assert.ok(personMatches({ username: "x", nickname: "" }, "   "));
    assert.ok(!personMatches({ username: "Ali", nickname: "" }, "veli"));
});

test("direct messages from stored data are checked field by field", () => {
    const message = dmMessageFromData("m1", {
        fromEmail: "Ali@Example.com",
        text: "selam",
        type: "hologram",
        createdAt: { seconds: 100, nanoseconds: 0 },
        read: "yes",
        voiceDuration: 9999,
        replyTo: { id: "../evil", text: "x", fromEmail: "a@example.com" },
        extra: "dropped",
    });
    assert.deepEqual(message, {
        id: "m1", fromEmail: "ali@example.com", text: "selam", type: "text", voicePath: null, voiceDuration: 600, createdAt: 100_000,
        read: false, edited: false, deleted: false, replyTo: null, pending: false,
    });
    const deleted = dmMessageFromData("m2", { fromEmail: "a@example.com", text: "secret", type: "voice", voicePath: "voice-messages/c/f.webm", deleted: true }, false, 77);
    assert.equal(deleted.text, "");
    assert.equal(deleted.voicePath, null);
    assert.equal(deleted.createdAt, 77);
    const reply = dmMessageFromData("m3", { replyTo: { id: "abc_DEF-1", text: "y".repeat(500), fromEmail: "B@example.com" } }, true);
    assert.deepEqual(reply.replyTo, { id: "abc_DEF-1", text: "y".repeat(SOCIAL_LIMITS.replyExcerptMax), fromEmail: "b@example.com" });
    assert.equal(reply.pending, true);
});

test("voice paths must stay inside the conversation's folder", () => {
    const chat = dmChatId("a@example.com", "b@example.com");
    assert.ok(isDmVoicePath(`voice-messages/${chat}/clip-1.webm`, chat));
    for (const value of [`voice-messages/other/clip.webm`, `voice-messages/${chat}/../x`, `voice-messages/${chat}/..`, `voice-messages/${chat}/a/b`, `group-voice-messages/${chat}/a.webm`, "", 5]) {
        assert.equal(isDmVoicePath(value, chat), false, String(value));
    }
    assert.equal(isDmVoicePath("voice-messages/x/a.webm", ""), false);
});

test("message pages merge by id, sort oldest first and keep the newest", () => {
    const a = { id: "a", createdAt: 1 };
    const b = { id: "b", createdAt: 2 };
    const c = { id: "c", createdAt: 2 };
    assert.ok(compareMessages(b, c) < 0);
    const current = [b, a];
    assert.equal(mergeMessages(current, []), current);
    const updated = { id: "a", createdAt: 1, text: "edited" };
    assert.deepEqual(mergeMessages([a, b], [c, updated]), [updated, b, c]);
    assert.deepEqual(mergeMessages([a, b], [c], 2).map((message) => message.id), ["b", "c"]);
});

test("unread counts and the Home badge", () => {
    const messages = [
        dmMessageFromData("1", { fromEmail: "b@example.com", read: false }),
        dmMessageFromData("2", { fromEmail: "B@example.com", read: true }),
        dmMessageFromData("3", { fromEmail: "b@example.com", deleted: true }),
        dmMessageFromData("4", { fromEmail: "me@example.com" }),
    ];
    assert.equal(dmUnreadCount(messages, "B@example.com"), 1);
    assert.equal(dmUnreadTotal([{ unread: 2 }, { unread: -1 }, { unread: 3 }]), 5);
    assert.equal(homeBadgeCount(2, 1, -4), 3);
    assert.equal(badgeLabel(7), "7");
    assert.equal(badgeLabel(120), "99+");
    assert.equal(badgeLabel(12, 9), "9+");
    assert.equal(badgeLabel(-3), "0");
});

test("conversations sort by activity and closed ones stay hidden until something new arrives", () => {
    const list = [
        { chatId: "x", lastMessageAt: 10, partner: { username: "Zeynep" } },
        { chatId: "y", lastMessageAt: 30, partner: { username: "Ali" } },
        { chatId: "z", lastMessageAt: 10, partner: { username: "Can" } },
    ];
    assert.deepEqual(sortDms(list).map((dm) => dm.chatId), ["y", "z", "x"]);
    assert.deepEqual(visibleDms(list, { x: 10, y: 20 }).map((dm) => dm.chatId), ["y", "z"]);
    assert.deepEqual(visibleDms(list, { x: 10 }, "x").map((dm) => dm.chatId), ["x", "y", "z"]);
});

test("group unread state skips own and system messages and counts mentions", () => {
    const recent = [
        { createdAt: 5, fromEmail: "a@example.com", system: false, mentionsMe: true },
        { createdAt: 15, fromEmail: "a@example.com", system: false, mentionsMe: true },
        { createdAt: 16, fromEmail: "ME@example.com", system: false, mentionsMe: false },
        { createdAt: 17, fromEmail: "hanogt-system", system: true, mentionsMe: false },
        { createdAt: 18, fromEmail: "b@example.com", system: false, mentionsMe: false },
    ];
    const state = groupUnreadState(recent, 10, "me@example.com");
    assert.deepEqual(state, { unread: 2, mentions: 1 });
    assert.deepEqual(railBadge(state), { dot: true, count: 1 });
    assert.deepEqual(railBadge(state, "mentions"), { dot: false, count: 1 });
    assert.deepEqual(railBadge(state, "none"), { dot: false, count: 0 });
    assert.deepEqual(railBadge(undefined), { dot: false, count: 0 });
});

test("member lists group the people around by role, then everyone offline", () => {
    const members = [
        person("Zehra", "online", { role: "member" }),
        person("Ahmet", "dnd", { role: "member" }),
        person("Burak", "idle", { role: "member" }),
        person("Owner", "offline", { role: "owner" }),
        person("Deniz", "online", { role: "admin" }),
        person("Cem", "offline", { role: "member" }),
    ];
    const sections = sectionMembers(members);
    assert.deepEqual(sections.map((section) => section.id), ["admin", "member", "offline"]);
    assert.deepEqual(sections[1].members.map((member) => member.username), ["Zehra", "Burak", "Ahmet"]);
    assert.deepEqual(sections[2].members.map((member) => member.username), ["Cem", "Owner"]);
    assert.deepEqual(sectionMembers([]), []);
});

test("the online tab shows everyone who isn't offline, best status first", () => {
    const friends = [person("Ece", "offline"), person("Bora", "dnd"), person("Arda", "idle"), person("Cansu", "online")];
    assert.deepEqual(filterFriends(friends, "online").map((friend) => friend.username), ["Cansu", "Arda", "Bora"]);
    assert.deepEqual(filterFriends(friends, "all").map((friend) => friend.username), ["Cansu", "Arda", "Bora", "Ece"]);
    assert.deepEqual(filterFriends(friends, "all", "e").map((friend) => friend.username), ["Ece"]);
});

test("the quick switcher ranks exact, prefix and word matches and drops duplicates", () => {
    const item = (id, label, extra = {}) => ({ id, kind: "dm", label, hint: "", href: `/social/dm/${id}`, recent: 0, unread: 0, ...extra });
    const items = [
        item("1", "Mehmet Kaya", { recent: 5 }),
        item("2", "Kaya", { recent: 1 }),
        item("3", "Kayak Kulübü", { kind: "group", href: "/social/g/g1", recent: 9 }),
        item("4", "Ali", { hint: "kayahan#1234" }),
        item("5", "Kaya duplicate", { href: "/social/dm/2" }),
        item("6", "Zeynep", { unread: 3, recent: 0 }),
        item("7", "Arda", { recent: 50 }),
    ];
    assert.deepEqual(rankSwitcher(items, "kaya").map((entry) => entry.id), ["2", "3", "1", "4"]);
    assert.deepEqual(rankSwitcher(items, "").map((entry) => entry.id).slice(0, 3), ["6", "7", "3"]);
    assert.deepEqual(rankSwitcher(items, "", 2).length, 2);
    assert.deepEqual(rankSwitcher(items, "nobody"), []);
});

test("Social routes round-trip through their links", () => {
    assert.deepEqual(parseSocialRoute("/social"), { kind: "home" });
    assert.deepEqual(parseSocialRoute("/social/"), { kind: "home" });
    assert.deepEqual(parseSocialRoute(dmHref("Ali+test@Example.com")), { kind: "dm", email: "ali+test@example.com" });
    assert.deepEqual(parseSocialRoute("/social/dm/%E0%A4%A"), { kind: "dm", email: "%e0%a4%a" });
    assert.deepEqual(parseSocialRoute(groupHref("grp_1-A").split("?")[0]), { kind: "group", groupId: "grp_1-A" });
    assert.deepEqual(parseSocialRoute(`/social/join/${TOKEN}`), { kind: "other" });
    assert.deepEqual(parseSocialRoute("/social/g/bad id"), { kind: "other" });
    assert.deepEqual(parseSocialRoute(null), { kind: "other" });
    assert.equal(groupHref("g1"), "/social/g/g1");
    assert.equal(groupHref("g1", { topic: "hata ayıklama" }), "/social/g/g1?topic=hata+ay%C4%B1klama");
    assert.equal(groupHref("g1", { view: "files", file: "src/main.ts" }), "/social/g/g1?view=files&file=src%2Fmain.ts");
    assert.equal(groupHref("g1", { view: "files", topic: "ignored" }), "/social/g/g1?view=files");
});

test("small guards", () => {
    assert.ok(isSticker("🔥"));
    assert.ok(!isSticker("<img>"));
    assert.ok(isGroupNotifyLevel("mentions"));
    assert.ok(!isGroupNotifyLevel("loud"));
    assert.ok(isFriendsTab("blocked"));
    assert.ok(!isFriendsTab("add"));
});

test("invite links are recognised in every shape people paste", () => {
    const { extractInviteToken, inviteLinkPath } = groups;
    assert.equal(inviteLinkPath(TOKEN), `/social/join/${TOKEN}`);
    for (const value of [
        TOKEN,
        `  ${TOKEN}  `,
        `https://codev.example/social/join/${TOKEN}`,
        `https://codev.example/groups/join/${TOKEN}?utm=1`,
        `/groups?join=${TOKEN}`,
        `https://codev.example/groups?x=1&join=${TOKEN}`,
    ]) {
        assert.equal(extractInviteToken(value), TOKEN, value);
    }
    for (const value of ["", "hello", `${TOKEN}x`, `https://codev.example/social/join/${TOKEN}x`, `https://codev.example/social/join/short`]) {
        assert.equal(extractInviteToken(value), null, value);
    }
});

test("channel list markers: unread per channel and mentions, like Discord", () => {
    const { channelUnreadState } = model;
    const me = "ali@example.com";
    const message = (createdAt, text, extra = {}) => ({ createdAt, fromEmail: "berk@example.com", type: "text", text, ...extra });
    const messages = [
        message(100, "eski"),
        message(200, "#oyun yeni tur"),
        message(300, "@Ali #Oyun bak"),
        message(400, "genel sohbet"),
        message(500, "kendi mesajım #oyun", { fromEmail: me }),
        message(600, "sistem", { type: "system" }),
        message(700, "#müzik bekliyor", { pending: true }),
    ];
    const options = { me, myName: "Ali", usernames: ["Ali", "Berk"], lastReadAt: 150, readAt: {} };
    assert.deepEqual(channelUnreadState(messages, options), {
        "": { unread: true, mentions: 1 },
        oyun: { unread: true, mentions: 1 },
    });
    // Reading the topic clears it but not the main channel; the main channel covers every topic.
    assert.deepEqual(channelUnreadState(messages, { ...options, readAt: { oyun: 300 } }), { "": { unread: true, mentions: 1 } });
    assert.deepEqual(channelUnreadState(messages, { ...options, readAt: { "": 400 } }), {});
    assert.deepEqual(channelUnreadState(messages, { ...options, myName: "" }), { "": { unread: true, mentions: 0 }, oyun: { unread: true, mentions: 0 } });
});
