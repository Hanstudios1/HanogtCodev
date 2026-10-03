// Run: node --test scripts/tests/
// Live collaboration ("Ekiple düzenle"): ids, encodings, validation and permission checks.
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import { load } from "./setup.mjs";

const protocol = await load("lib/collab/protocol.ts");
const {
    COLLAB_LIMITS, assembleSnapshot, cleanChatText, cleanFileName, cleanTitle, collabColor, cssString, decodeAwarenessUpdate, fromBase64,
    invitableEmails, isBase64, isClientId, isCollabFileId, isCollabSessionId, isExpired, isOwnAwarenessUpdate, isParticipantKey, joinDecision,
    newParticipantKey, newSessionId, nextColorIndex, normalizeNewlines, parsePresenceDocId, presenceDocId, publicMeta, randomId, readAccess,
    readAwarenessState, readChatMessage, readMeta, readPresenceItem, readSessionRecord, readSignal, readUpdateItem, roleOf, seqFromUpdateDocId,
    splitParts, timeOf, timeOrderedId, toBase64, updateDocId, validateInitialFiles, writeAccess,
} = protocol;

const OWNER = "owner@example.com";
const ALI = "ali@example.com";
const AYSE = "ayse@example.com";
const STRANGER = "stranger@example.com";
const NOW = Date.parse("2026-10-02T12:00:00.000Z");

/** A stored session document as the server writes it. */
function stored(overrides = {}) {
    return {
        owner: OWNER,
        title: "Proje",
        status: "active",
        readOnly: false,
        frozen: false,
        participants: [OWNER, ALI],
        keys: { [OWNER]: "aaaaaaaaaaaa", [ALI]: "bbbbbbbbbbbb" },
        people: {
            aaaaaaaaaaaa: { name: "Sahip", avatar: "https://example.com/a.png", color: 0, joinedAt: NOW - 60_000 },
            bbbbbbbbbbbb: { name: "Ali", avatar: "javascript:alert(1)", color: 1, joinedAt: NOW - 30_000 },
        },
        invited: [ALI, AYSE],
        inviteProfiles: { [ALI]: { name: "Ali", avatar: null }, [AYSE]: { name: "Ayşe", avatar: null } },
        files: [{ id: "tab-1", name: "main.py", lang: "python", chars: 12 }],
        contentChars: 12,
        snapshotSeq: 0,
        chatAt: 0,
        createdAt: NOW - 120_000,
        expiresAt: new Date(NOW + COLLAB_LIMITS.sessionMs).toISOString(),
        endedAt: 0,
        endReason: null,
        ...overrides,
    };
}

test("ids: sessions, participant keys, files, clients", () => {
    assert.ok(isCollabSessionId(newSessionId()));
    assert.ok(isCollabSessionId("A1b2C3d4E5f6G7h8I9j0"));
    assert.equal(isCollabSessionId("A1b2C3d4E5f6G7h8I9j"), false);
    assert.equal(isCollabSessionId("../../collab_sessions"), false);
    assert.equal(isCollabSessionId("A1b2C3d4E5f6G7h8I9j/"), false);
    assert.ok(isParticipantKey(newParticipantKey()));
    assert.equal(isParticipantKey("ABCDEFGHIJKL"), false);
    assert.ok(isCollabFileId("tab-l9x0abc-12"));
    assert.equal(isCollabFileId("a/b"), false);
    assert.equal(isCollabFileId(""), false);
    assert.equal(isCollabFileId("x".repeat(65)), false);
    assert.ok(isClientId(0) && isClientId(4_294_967_295));
    assert.equal(isClientId(-1), false);
    assert.equal(isClientId(4_294_967_296), false);
    assert.equal(isClientId(1.5), false);
    assert.equal(isClientId("12"), false);
    const id = randomId(32);
    assert.match(id, /^[A-Za-z0-9]{32}$/);
    assert.notEqual(randomId(32), id);
});

test("update document ids sort in sequence order and round-trip", () => {
    const ids = [1, 2, 10, 99, 100, 123_456].map(updateDocId);
    assert.deepEqual([...ids].sort(), ids);
    assert.equal(seqFromUpdateDocId(updateDocId(42)), 42);
    assert.equal(seqFromUpdateDocId("u42"), null);
    assert.equal(seqFromUpdateDocId("x000000000042"), null);
    assert.deepEqual(parsePresenceDocId(presenceDocId("bbbbbbbbbbbb", 1234)), { key: "bbbbbbbbbbbb", client: 1234 });
    assert.equal(parsePresenceDocId("bbbbbbbbbbbb_12_3"), null);
    assert.equal(parsePresenceDocId("BAD_1"), null);
    const first = timeOrderedId(NOW);
    const later = timeOrderedId(NOW + 1);
    assert.ok(first < later, "time-ordered ids sort by time");
});

test("base64 round-trips binary data and rejects anything else", () => {
    const bytes = new Uint8Array(70_000).map((_, index) => (index * 31) % 256);
    const encoded = toBase64(bytes);
    assert.ok(isBase64(encoded));
    assert.deepEqual(fromBase64(encoded), bytes);
    assert.deepEqual(fromBase64(toBase64(new Uint8Array([]))), new Uint8Array([]));
    assert.equal(fromBase64("not base64!"), null);
    assert.equal(fromBase64("abc"), null, "unpadded");
    assert.equal(fromBase64(12), null);
    assert.equal(fromBase64(encoded, 100), null, "longer than allowed");
});

test("awareness updates: decoded, and only a tab's own state is accepted", () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalState({ file: "tab-1", line: 3, away: false });
    const own = encodeAwarenessUpdate(awareness, [doc.clientID]);
    const entries = decodeAwarenessUpdate(own);
    assert.equal(entries?.length, 1);
    assert.equal(entries[0].client, doc.clientID);
    assert.deepEqual(entries[0].state, { file: "tab-1", line: 3, away: false });
    assert.ok(isOwnAwarenessUpdate(own, doc.clientID));
    assert.equal(isOwnAwarenessUpdate(own, doc.clientID + 1), false, "another client's id");

    // Someone else's state inside the update (impersonation) is refused.
    const other = new Y.Doc();
    const otherAwareness = new Awareness(other);
    otherAwareness.setLocalState({ file: "tab-2" });
    const both = new Awareness(new Y.Doc());
    both.states.set(doc.clientID, { a: 1 });
    both.meta.set(doc.clientID, { clock: 1, lastUpdated: 0 });
    both.states.set(other.clientID, { b: 2 });
    both.meta.set(other.clientID, { clock: 1, lastUpdated: 0 });
    assert.equal(isOwnAwarenessUpdate(encodeAwarenessUpdate(both, [doc.clientID, other.clientID]), doc.clientID), false);

    awareness.setLocalState(null);
    assert.ok(isOwnAwarenessUpdate(encodeAwarenessUpdate(awareness, [doc.clientID]), doc.clientID), "leaving (null state)");
    assert.equal(decodeAwarenessUpdate(new Uint8Array([1, 5])), null, "truncated");
    assert.equal(decodeAwarenessUpdate(new Uint8Array([1, 1, 1, 2, 0x7b, 0x7d, 9])), null, "trailing bytes");
    [awareness, otherAwareness, both].forEach((entry) => entry.destroy());
});

test("remote awareness states are read defensively", () => {
    assert.deepEqual(readAwarenessState(null), { file: null, selection: null, line: null, away: false, call: null });
    const state = readAwarenessState({ file: "tab-1", line: 12, away: true, call: { on: true, muted: true }, selection: { anchor: { type: null }, head: { item: { client: 1, clock: 2 } } } });
    assert.equal(state.file, "tab-1");
    assert.equal(state.line, 12);
    assert.equal(state.away, true);
    assert.deepEqual(state.call, { on: true, muted: true, deafened: false });
    assert.ok(state.selection);
    const hostile = readAwarenessState({ file: "../x", line: -4, away: "yes", call: { on: "true" }, selection: { anchor: [], head: "x" } });
    assert.deepEqual(hostile, { file: null, selection: null, line: null, away: false, call: null });
});

test("file names, titles, chat text and line endings", () => {
    assert.equal(cleanFileName("  main  file.py "), "main file.py");
    assert.equal(cleanFileName("a/b.py"), null);
    assert.equal(cleanFileName("a\\b.py"), null);
    assert.equal(cleanFileName(".."), null);
    assert.equal(cleanFileName("x\u0000.js"), null);
    assert.equal(cleanFileName("x".repeat(121)), null);
    assert.equal(cleanTitle("  Benim\n projem  "), "Benim projem");
    assert.equal(cleanTitle("", "Varsayılan"), "Varsayılan");
    assert.equal(cleanTitle("x".repeat(200)).length, COLLAB_LIMITS.maxTitle);
    assert.equal(cleanChatText("  merhaba\r\ndünya\u0007 "), "merhaba\ndünya");
    assert.equal(cleanChatText("a\n\n\n\n\n\nb"), "a\n\n\nb");
    assert.equal(cleanChatText("x".repeat(5_000)).length, COLLAB_LIMITS.maxChatChars);
    assert.equal(cleanChatText(42), "");
    assert.equal(normalizeNewlines("a\r\nb\rc\n"), "a\nb\nc\n");
});

test("a session's initial files respect the editor's limits", () => {
    const ok = validateInitialFiles([{ id: "tab-1", name: "main.py", lang: "python", code: "print(1)\r\n" }, { id: "tab-2", name: "x.unknownlang", lang: "nope", code: "" }]);
    assert.ok(ok.ok);
    assert.equal(ok.files[0].code, "print(1)\n", "CRLF becomes LF");
    assert.equal(ok.files[1].lang, "plaintext", "unknown languages become plain text");
    assert.deepEqual(validateInitialFiles([]), { ok: false, code: "invalid_file" });
    assert.deepEqual(validateInitialFiles("x"), { ok: false, code: "invalid_file" });
    assert.deepEqual(validateInitialFiles([{ id: "a/b", name: "x.js", lang: "javascript", code: "" }]), { ok: false, code: "invalid_file" });
    assert.deepEqual(validateInitialFiles([{ id: "a", name: "x.js", lang: "javascript", code: "" }, { id: "a", name: "y.js", lang: "javascript", code: "" }]), { ok: false, code: "invalid_file" });
    const many = Array.from({ length: COLLAB_LIMITS.maxFiles + 1 }, (_, index) => ({ id: `f${index}`, name: `f${index}.js`, lang: "javascript", code: "" }));
    assert.deepEqual(validateInitialFiles(many), { ok: false, code: "too_many_files" });
    assert.deepEqual(validateInitialFiles([{ id: "a", name: "a.js", lang: "javascript", code: "x".repeat(COLLAB_LIMITS.maxFileChars + 1) }]), { ok: false, code: "file_too_large" });
    const half = "x".repeat(COLLAB_LIMITS.maxFileChars);
    assert.deepEqual(validateInitialFiles([
        { id: "a", name: "a.js", lang: "javascript", code: half },
        { id: "b", name: "b.js", lang: "javascript", code: half },
        { id: "c", name: "c.js", lang: "javascript", code: "y" },
    ]), { ok: false, code: "content_too_large" });
});

test("cursor labels can't break out of the CSS string", () => {
    assert.equal(cssString("Ali"), "\"Ali\"");
    assert.equal(cssString("a\"b\\c"), "\"a\\\"b\\\\c\"");
    const evil = cssString("x\";}body{display:none}</style><script>");
    assert.ok(!/(?<!\\)"[^"]*$/.test(evil.slice(1, -1)), "no unescaped quote inside");
    assert.ok(!evil.includes("<") && !evil.includes(">"));
    assert.ok(!cssString("a\nb").includes("\n"));
});

test("colours: stable per index, lowest free one for new participants", () => {
    assert.equal(collabColor(0), collabColor(8));
    assert.equal(collabColor(-1), collabColor(7));
    assert.equal(nextColorIndex([]), 0);
    assert.equal(nextColorIndex([0, 1, 3]), 2);
});

test("snapshots are split into parts and only complete generations are joined", () => {
    const data = toBase64(new Uint8Array(2_000).map((_, index) => index % 251));
    const parts = splitParts(data, 700);
    assert.equal(parts.join(""), data);
    assert.deepEqual(splitParts(""), [""]);
    const stored = (gen, seq, list) => list.map((part, index) => ({ gen, seq, index, count: list.length, data: part }));
    assert.deepEqual(assembleSnapshot(stored("g1", 7, parts)), { gen: "g1", seq: 7, data });
    // Parts of an older and a newer compaction side by side: the newest complete one wins, never a mix.
    const newer = splitParts(`${data}AAAA`, 900);
    const mixed = [...stored("old", 3, parts), ...stored("new", 9, newer)];
    assert.deepEqual(assembleSnapshot(mixed), { gen: "new", seq: 9, data: `${data}AAAA` });
    // An incomplete generation is ignored.
    assert.deepEqual(assembleSnapshot([...stored("old", 3, parts), ...stored("new", 9, newer).slice(1)]), { gen: "old", seq: 3, data });
    assert.equal(assembleSnapshot([]), null);
    assert.equal(assembleSnapshot([{ gen: "g", seq: 1, index: 3, count: 2, data: "AAAA" }]), null);
});

test("the stored session is normalised", () => {
    const view = readSessionRecord(stored({ participants: [OWNER, ALI, "not-an-email"], status: "weird" }));
    assert.deepEqual(view.participants, [OWNER, ALI]);
    assert.equal(view.status, "ended", "unknown status counts as ended");
    assert.equal(view.people.bbbbbbbbbbbb.avatar, null, "javascript: avatar dropped");
    assert.equal(view.people.aaaaaaaaaaaa.avatar, "https://example.com/a.png");
    assert.equal(view.expiresAt, NOW + COLLAB_LIMITS.sessionMs, "ISO timestamps from the REST API");
    assert.equal(timeOf({ toMillis: () => NOW }), NOW);
    assert.equal(timeOf({ seconds: NOW / 1000 }), NOW);
    assert.equal(timeOf("nope"), 0);
});

test("reading and writing: participants only; read-only and frozen sessions", () => {
    const view = readSessionRecord(stored());
    assert.equal(roleOf(view, OWNER), "owner");
    assert.equal(roleOf(view, ALI), "editor");
    assert.equal(roleOf(view, AYSE), null, "invited but not joined");
    assert.equal(roleOf(view, STRANGER), null);
    assert.equal(readAccess(view, ALI, NOW), "ok");
    assert.equal(readAccess(view, STRANGER, NOW), "not_found", "outsiders learn nothing");
    assert.equal(writeAccess(view, ALI, NOW), "ok");
    const readOnly = readSessionRecord(stored({ readOnly: true }));
    assert.equal(writeAccess(readOnly, ALI, NOW), "read_only");
    assert.equal(writeAccess(readOnly, OWNER, NOW), "ok", "the owner can always edit");
    assert.equal(readAccess(readOnly, ALI, NOW), "ok", "read-only participants still read");
    assert.equal(writeAccess(readSessionRecord(stored({ frozen: true })), OWNER, NOW), "frozen");
    const ended = readSessionRecord(stored({ status: "ended" }));
    assert.equal(readAccess(ended, ALI, NOW), "ended");
    assert.equal(writeAccess(ended, OWNER, NOW), "ended");
    const expired = readSessionRecord(stored({ expiresAt: new Date(NOW - 1).toISOString() }));
    assert.ok(isExpired(expired, NOW));
    assert.equal(writeAccess(expired, OWNER, NOW), "ended");
    // A participant without a key (inconsistent document) has no access.
    const keyless = readSessionRecord(stored({ keys: { [OWNER]: "aaaaaaaaaaaa" } }));
    assert.equal(readAccess(keyless, ALI, NOW), "not_found");
});

test("joining: invited friends of the owner, at most five people in a session without a stored limit", () => {
    const view = readSessionRecord(stored());
    const friends = [ALI, AYSE];
    assert.equal(joinDecision(view, ALI, friends, NOW), "member");
    assert.equal(joinDecision(view, AYSE, friends, NOW), "ok");
    assert.equal(joinDecision(view, STRANGER, [...friends, STRANGER], NOW), "not_found", "a friend who wasn't invited");
    assert.equal(joinDecision(view, AYSE, [ALI], NOW), "not_friend", "no longer the owner's friend");
    assert.equal(joinDecision(view, OWNER, friends, NOW), "member");
    const full = readSessionRecord(stored({
        participants: [OWNER, ALI, "c@example.com", "d@example.com", "e@example.com"],
        keys: { [OWNER]: "aaaaaaaaaaaa", [ALI]: "bbbbbbbbbbbb", "c@example.com": "cccccccccccc", "d@example.com": "dddddddddddd", "e@example.com": "eeeeeeeeeeee" },
    }));
    assert.equal(joinDecision(full, AYSE, friends, NOW), "full");
    assert.equal(joinDecision(readSessionRecord(stored({ status: "ended" })), AYSE, friends, NOW), "ended");
});

test("invitations: friends only, never the owner, within the limit", () => {
    const view = readSessionRecord(stored());
    assert.deepEqual(invitableEmails(view, ["c@example.com", AYSE], ["c@example.com", AYSE, ALI]), { accepted: ["c@example.com"], rejected: [] });
    assert.deepEqual(invitableEmails(view, [STRANGER], [ALI]).rejected, [STRANGER]);
    assert.deepEqual(invitableEmails(view, [OWNER], [OWNER]).rejected, [OWNER]);
    const crowded = readSessionRecord(stored({ invited: Array.from({ length: COLLAB_LIMITS.maxInvites }, (_, index) => `p${index}@example.com`) }));
    assert.deepEqual(invitableEmails(crowded, ["new@example.com"], ["new@example.com"]).accepted, []);
});

test("the owner's plan sets the session size: Free 2, Plus 5, Pro 30 people", async () => {
    const { PLAN_COLLAB_LIMITS } = await load("lib/plans.ts");
    const people = (count) => Array.from({ length: count }, (_, index) => (index === 0 ? OWNER : `p${index}@example.com`));
    const keyed = (emails) => Object.fromEntries(emails.map((email, index) => [email, `k${String(index).padStart(11, "0")}`]));
    for (const [plan, limits] of Object.entries(PLAN_COLLAB_LIMITS)) {
        const room = (inside) => readSessionRecord(stored({ participants: inside, keys: keyed(inside), invited: [...inside.slice(1), AYSE], maxPeople: limits.people, maxInvites: limits.invites }));
        const friends = [AYSE];
        assert.equal(joinDecision(room(people(limits.people - 1)), AYSE, friends, NOW), "ok", `${plan}: one place left`);
        assert.equal(joinDecision(room(people(limits.people)), AYSE, friends, NOW), "full", `${plan}: ${limits.people} people is full`);
        // The owner moved to a lower plan: nobody is removed, but nobody new joins.
        assert.equal(joinDecision(room(people(limits.people + 1)), AYSE, friends, NOW), "full");
        const meta = publicMeta("A1b2C3d4E5f6G7h8I9j0", room(people(1)));
        assert.deepEqual([meta.maxPeople, meta.maxInvites], [limits.people, limits.invites]);
        assert.deepEqual([readMeta(meta).maxPeople, readMeta(meta).maxInvites], [limits.people, limits.invites]);
    }
    assert.equal(COLLAB_LIMITS.maxParticipants, PLAN_COLLAB_LIMITS.pro.people, "no plan above the hard cap");
    assert.equal(COLLAB_LIMITS.maxInvites, PLAN_COLLAB_LIMITS.pro.invites);
});

test("sessions from before per-plan limits keep five people and twelve invitations; junk is never a bigger room", () => {
    const legacy = readSessionRecord(stored());
    assert.deepEqual([legacy.maxPeople, legacy.maxInvites], [COLLAB_LIMITS.legacyPeople, COLLAB_LIMITS.legacyInvites]);
    for (const junk of ["30", 0, -3, 2.5, null, Number.NaN]) {
        const view = readSessionRecord(stored({ maxPeople: junk, maxInvites: junk }));
        assert.deepEqual([view.maxPeople, view.maxInvites], [COLLAB_LIMITS.legacyPeople, COLLAB_LIMITS.legacyInvites], `maxPeople ${String(junk)}`);
    }
    const huge = readSessionRecord(stored({ maxPeople: 1_000, maxInvites: 1_000 }));
    assert.deepEqual([huge.maxPeople, huge.maxInvites], [COLLAB_LIMITS.maxParticipants, COLLAB_LIMITS.maxInvites], "capped at Pro's limits");
    assert.equal(readMeta({ ...publicMeta("A1b2C3d4E5f6G7h8I9j0", legacy), maxPeople: 999 }).maxPeople, COLLAB_LIMITS.maxParticipants);
});

test("invitations stop at the session's own limit", () => {
    const free = readSessionRecord(stored({ invited: [ALI, AYSE, "c@example.com"], maxPeople: 2, maxInvites: 4 }));
    const friends = ["d@example.com", "e@example.com", "f@example.com"];
    assert.deepEqual(invitableEmails(free, friends, friends), { accepted: ["d@example.com"], rejected: [] }, "one invitation left on Free");
    const full = readSessionRecord(stored({ invited: [ALI, AYSE, "c@example.com", "d@example.com"], maxPeople: 2, maxInvites: 4 }));
    assert.deepEqual(invitableEmails(full, ["e@example.com"], friends).accepted, []);
    const pro = readSessionRecord(stored({ invited: [ALI, AYSE, "c@example.com", "d@example.com"], maxPeople: 30, maxInvites: 60 }));
    assert.deepEqual(invitableEmails(pro, ["e@example.com"], friends).accepted, ["e@example.com"], "the same session after moving to Pro");
});

test("the public meta never contains e-mail addresses", () => {
    const meta = publicMeta("A1b2C3d4E5f6G7h8I9j0", readSessionRecord(stored()));
    const text = JSON.stringify(meta);
    assert.ok(!text.includes("@"), text);
    assert.deepEqual(meta.participants.map((person) => [person.key, person.role]), [["aaaaaaaaaaaa", "owner"], ["bbbbbbbbbbbb", "editor"]]);
    assert.deepEqual(readMeta(JSON.parse(text)), meta);
    assert.equal(readMeta({ id: "../x" }), null);
});

test("documents read from Firestore or the API are validated", () => {
    const update = { seq: 5, data: toBase64(new Uint8Array([1, 2, 3])), client: 77, by: "bbbbbbbbbbbb" };
    assert.deepEqual(readUpdateItem(update), update);
    assert.equal(readUpdateItem({ ...update, seq: 0 }), null);
    assert.equal(readUpdateItem({ ...update, data: "%%%" }), null);
    assert.equal(readUpdateItem({ ...update, client: -1 }).client, -1, "a malformed client id is never our own");
    const presence = { by: "bbbbbbbbbbbb", client: 77, data: "AAAA", at: NOW };
    assert.deepEqual(readPresenceItem("bbbbbbbbbbbb_77", presence), { id: "bbbbbbbbbbbb_77", ...presence });
    assert.equal(readPresenceItem("bbbbbbbbbbbb_78", presence), null, "document id and content disagree");
    assert.equal(readPresenceItem("cccccccccccc_77", presence), null);
    const message = readChatMessage("0000abcd-ABCDEFGH", { by: "bbbbbbbbbbbb", name: "Ali\u0000", text: "selam", at: NOW });
    assert.equal(message.text, "selam");
    assert.equal(message.name, "Ali");
    assert.equal(readChatMessage("0000abcd-ABCDEFGH", { by: "bbbbbbbbbbbb", text: "" }), null);
    const signal = readSignal("0000abcd-ABCDEFGH", { from: "bbbbbbbbbbbb", fromClient: 1, toClient: 2, kind: "offer", data: "{}", at: NOW });
    assert.equal(signal.kind, "offer");
    assert.equal(readSignal("0000abcd-ABCDEFGH", { from: "bbbbbbbbbbbb", fromClient: 1, toClient: 2, kind: "exec", data: "{}" }), null);
    assert.equal(readSignal("0000abcd-ABCDEFGH", { from: "bbbbbbbbbbbb", fromClient: 1, toClient: 2, kind: "offer", data: "x".repeat(COLLAB_LIMITS.maxSignalChars + 1) }), null);
});
