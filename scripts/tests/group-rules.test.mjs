// Run: node --test scripts/tests/*.test.mjs
// The Rules section of Hanogt Social groups (lib/groups.ts, lib/server/group-rules.ts,
// app/api/groups/_shared.ts, _messages.ts, _join.ts): structured rules and their
// limits, groups that only have the old plain-text rules, acceptance by
// pseudonymous member key, the gate on every write path, accepting while
// joining, the clean-ups when someone leaves, /kurallar and the starter templates.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const groups = await load("lib/groups.ts");
const model = await load("lib/social/model.ts");
const workspace = await load("components/Groups/workspace/model.ts");
const { memberKey } = await load("lib/server/group-keys.ts");
const { rulesBlock } = await load("lib/server/group-rules.ts");
const shared = await load("app/api/groups/_shared.ts");
const messages = await load("app/api/groups/_messages.ts");
const join = await load("app/api/groups/_join.ts");
const voice = await load("lib/server/social-voice.ts");
const groupVoice = await load("lib/server/group-voice.ts");
const { deleteAccountData } = await load("lib/server/account-deletion.ts");

const G = "grpRules1";
const OWNER = "ali@example.com";
const ADMIN = "berk@example.com";
const MOD = "cem@example.com";
const MEMBER = "deniz@example.com";
const OTHER = "ece@example.com";
const NEWCOMER = "fatma@example.com";
const FRIEND = "gul@example.com";
const TOKEN = "AbCdEfGhIjKlMnOpQrSt_-";
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3]);

const RULES = [
    { id: "r1", title: "Saygılı ol", description: "Kişiyi değil fikri eleştir." },
    { id: "r2", title: "Spam yok", description: "" },
];

/** A group that asks members to accept its rules (version 2 is the one to accept). */
function gatedGroup(extra = {}) {
    return {
        name: "Kod Kulübü",
        ownerEmail: OWNER,
        members: [OWNER, ADMIN, MOD, MEMBER, OTHER],
        admins: [OWNER, ADMIN],
        moderators: [MOD],
        contentLanguage: "tr",
        topics: ["genel"],
        rulesList: RULES,
        rules: groups.rulesText(RULES),
        rulesVersion: 2,
        rulesAcceptVersion: 2,
        rulesScreening: true,
        ...extra,
    };
}

/** The session object the group API passes around (lib/server/active-session.ts). */
const person = (email, name = email.split("@")[0]) => ({ email, session: { user: { name } }, user: { friends: [] } });

async function rejects(promise, code, status) {
    await assert.rejects(promise, (error) => {
        assert.equal(error.code, code, `expected ${code}, got ${error.code} (${error.message})`);
        if (status) assert.equal(error.status, status);
        return true;
    });
}

// ---------------------------------------------------------------------------
// The rules themselves

test("limits: 20 rules, titles up to 120 characters, descriptions up to 600", () => {
    assert.equal(groups.GROUP_LIMITS.rulesCount, 20);
    assert.equal(groups.GROUP_LIMITS.ruleTitleMax, 120);
    assert.equal(groups.GROUP_LIMITS.ruleDescriptionMax, 600);
    assert.ok(groups.isRuleId(groups.newRuleId()));
    const ids = new Set(Array.from({ length: 50 }, () => groups.newRuleId()));
    assert.equal(ids.size, 50, "random ids");
});

test("rules sent by an admin: trimmed, ids kept or made, limits and empty titles refused", () => {
    let counter = 0;
    const makeId = () => `n${++counter}`;
    const result = groups.normalizeRulesInput([
        { id: "keep", title: "  Saygılı   ol ", description: "  Nazik ol.\r\n\r\n\r\n\r\nHer zaman.  " },
        { id: "keep", title: "Aynı kimlik", description: null },
        { id: "../bad", title: "Kötü kimlik" },
        { title: "Kimliksiz" },
    ], makeId);
    assert.equal(result.ok, true);
    assert.deepEqual(result.rules, [
        { id: "keep", title: "Saygılı ol", description: "Nazik ol.\n\nHer zaman." },
        { id: "n1", title: "Aynı kimlik", description: "" },
        { id: "n2", title: "Kötü kimlik", description: "" },
        { id: "n3", title: "Kimliksiz", description: "" },
    ]);
    assert.deepEqual(groups.normalizeRulesInput([]), { ok: true, rules: [] }, "an empty Rules section is allowed");
    assert.deepEqual(groups.normalizeRulesInput("1. kural"), { ok: false, problem: "invalid_rules" });
    assert.deepEqual(groups.normalizeRulesInput([{ title: "   " }]), { ok: false, problem: "invalid_rules" }, "a title is required");
    assert.deepEqual(groups.normalizeRulesInput([{ title: 5 }]), { ok: false, problem: "invalid_rules" });
    assert.deepEqual(groups.normalizeRulesInput([null]), { ok: false, problem: "invalid_rules" });
    assert.deepEqual(groups.normalizeRulesInput([{ title: "x".repeat(121) }]), { ok: false, problem: "rules_too_long" });
    assert.deepEqual(groups.normalizeRulesInput([{ title: "x", description: "y".repeat(601) }]), { ok: false, problem: "rules_too_long" });
    assert.equal(groups.normalizeRulesInput([{ title: "x".repeat(120), description: "y".repeat(600) }]).ok, true, "exactly at the limits");
    assert.deepEqual(groups.normalizeRulesInput(Array.from({ length: 21 }, (_, index) => ({ title: `Kural ${index}` }))), { ok: false, problem: "rules_limit" });
    assert.equal(groups.normalizeRulesInput(Array.from({ length: 20 }, (_, index) => ({ title: `Kural ${index}` }))).rules.length, 20);
});

test("stored rules are read leniently: clipped, empty titles dropped, unique ids, 20 at most", () => {
    const stored = groups.sanitizeRulesList([
        { id: "a", title: "x".repeat(200), description: "y".repeat(900) },
        { id: "a", title: "İkinci" },
        { id: "b", title: "" },
        "metin",
        null,
        ...Array.from({ length: 30 }, (_, index) => ({ id: `c${index}`, title: `Kural ${index}` })),
    ]);
    assert.equal(stored.length, 20);
    assert.equal(stored[0].title.length, 120);
    assert.equal(stored[0].description.length, 600);
    assert.equal(stored[1].title, "İkinci");
    assert.notEqual(stored[1].id, "a", "a repeated id gets another one");
    assert.equal(new Set(stored.map((rule) => rule.id)).size, 20);
    assert.deepEqual(groups.sanitizeRulesList("1. a"), []);
});

test("older groups' plain-text rules become rules: numbered or bulleted lines, else paragraphs, else one rule", () => {
    const pick = (text) => groups.parseLegacyRules(text).map((rule) => [rule.id, rule.title, rule.description]);
    // The text the starter templates used to write (rulesSummary).
    assert.deepEqual(pick("1. Herkese saygılı ol.\n2. Spam yasaktır.\n3) Kişisel bilgi paylaşma."), [
        ["r1", "Herkese saygılı ol.", ""],
        ["r2", "Spam yasaktır.", ""],
        ["r3", "Kişisel bilgi paylaşma.", ""],
    ]);
    // An intro line and headings go; lines under an item (indented ones too) are its description.
    assert.deepEqual(pick("# Kurallar\nKurallarımız:\n- Nazik ol\n  ayrıntı satırı\n  - iç madde\n## Kod\n• Spam yok\n* **Kalın başlık**"), [
        ["r1", "Nazik ol", "ayrıntı satırı\n- iç madde"],
        ["r2", "Spam yok", ""],
        ["r3", "Kalın başlık", ""],
    ]);
    // Text above the list that says something is kept as a rule.
    assert.deepEqual(pick("Bu grupta herkes eşittir.\n1. Saygı\n2. Sabır").map((rule) => rule[1]), ["Bu grupta herkes eşittir.", "Saygı", "Sabır"]);
    // Without a list: every paragraph is a rule; a single paragraph is one rule.
    assert.deepEqual(pick("Be nice.\nNo spam.\n\nHave fun."), [["r1", "Be nice.", "No spam."], ["r2", "Have fun.", ""]]);
    assert.deepEqual(pick("Sadece tek bir kural metni."), [["r1", "Sadece tek bir kural metni.", ""]]);
    assert.deepEqual(pick(""), []);
    assert.deepEqual(pick(null), []);
    // A first line longer than a title: its first sentence, or the words that fit (nothing is lost).
    const sentence = pick(`${"Uzun bir cümle ".repeat(3)}bitti. ${"devam ".repeat(30)}`)[0];
    assert.equal(sentence[1], "Uzun bir cümle Uzun bir cümle Uzun bir cümle bitti.");
    assert.ok(sentence[2].startsWith("devam devam"));
    const words = pick(`${"kelime ".repeat(40)}son`)[0];
    assert.ok(words[1].endsWith("…") && words[1].length <= 120);
    assert.ok(words[2].endsWith("son") && words[2].startsWith("kelime kelime"), "the whole line opens the description");
    assert.equal(groups.parseLegacyRules(Array.from({ length: 30 }, (_, index) => `${index + 1}. Kural ${index + 1}`).join("\n")).length, 20);
});

test("the plain-text copy reads back into the same rules", () => {
    const rules = [
        { id: "x1", title: "Saygılı ol", description: "Nazik ol.\n\n- Kişiyi değil fikri eleştir.\n1. Bu da açıklama" },
        { id: "x2", title: "- Tireli başlık", description: "" },
        { id: "x3", title: "Üçüncü", description: "Tek satır." },
    ];
    const text = groups.rulesText(rules);
    assert.equal(text.split("\n")[0], "1. Saygılı ol");
    assert.deepEqual(groups.parseLegacyRules(text).map(({ title, description }) => ({ title, description })), rules.map(({ title, description }) => ({ title, description })));
    assert.equal(groups.rulesText([]), "");
});

test("reading a group: the list (or the old text), versions and screening", () => {
    const legacy = groups.readGroupRules({ rules: "1. a\n2. b", rulesScreening: true });
    assert.deepEqual(legacy.list.map((rule) => rule.title), ["a", "b"]);
    assert.deepEqual([legacy.version, legacy.acceptVersion, legacy.updatedAt], [0, 0, null]);
    const stored = groups.readGroupRules({ rules: "ignored", rulesList: RULES, rulesVersion: 4, rulesAcceptVersion: 3, rulesScreening: true, rulesUpdatedAt: "2026-10-01T10:00:00.000Z" });
    assert.deepEqual(stored, { list: RULES, version: 4, updatedAt: "2026-10-01T10:00:00.000Z", screening: true, acceptVersion: 3 });
    assert.deepEqual(groups.readGroupRules({ rulesList: [] }).list, [], "an emptied Rules section stays empty (the old text isn't used)");
    assert.equal(groups.readGroupRules({ rulesVersion: -1, rulesAcceptVersion: 1.5 }).version, 0);
    assert.equal(groups.readGroupRules({ rulesVersion: 2, rulesAcceptVersion: 9 }).acceptVersion, 2, "never above the version");
    assert.deepEqual(groups.readGroupRules(null).list, []);
});

test("who has to accept: screening on, at least one rule, not staff, not accepted the asked version", () => {
    const state = groups.readGroupRules({ rulesList: RULES, rulesVersion: 3, rulesAcceptVersion: 2, rulesScreening: true });
    assert.equal(groups.rulesGateActive(state), true);
    for (const role of ["owner", "admin", "moderator"]) assert.equal(groups.mustAcceptRules(state, role, 0), false, `${role} is exempt`);
    assert.equal(groups.mustAcceptRules(state, "member", 0), true);
    assert.equal(groups.mustAcceptRules(state, "member", 1), true, "an older acceptance");
    assert.equal(groups.mustAcceptRules(state, "member", 2), false, "the asked version");
    assert.equal(groups.mustAcceptRules(state, "member", 3), false, "a newer one");
    assert.equal(groups.mustAcceptRules(state, null, 0), false, "not a member");
    assert.equal(groups.mustAcceptRules({ ...state, screening: false }, "member", 0), false, "screening off");
    assert.equal(groups.mustAcceptRules({ ...state, list: [] }, "member", 0), false, "no rules");
    // A broken document (screening on, nothing ever saved) still asks for version 1 and can be accepted.
    const broken = groups.readGroupRules({ rulesList: RULES, rulesScreening: true });
    assert.equal(groups.mustAcceptRules(broken, "member", 0), true);
    assert.equal(groups.acceptanceVersion(broken), 1);
    assert.equal(groups.mustAcceptRules(broken, "member", groups.acceptanceVersion(broken)), false);
});

test("versions: every save raises the version; members are asked again only when screening turns on or the owner asks", () => {
    const off = { version: 0, acceptVersion: 0, screening: false };
    assert.deepEqual(groups.nextRulesVersions(off, { screening: false, reaccept: false }), { version: 1, acceptVersion: 0 }, "rules without screening");
    assert.deepEqual(groups.nextRulesVersions({ version: 1, acceptVersion: 0, screening: false }, { screening: true, reaccept: false }), { version: 2, acceptVersion: 2 }, "screening turned on");
    assert.deepEqual(groups.nextRulesVersions({ version: 2, acceptVersion: 2, screening: true }, { screening: true, reaccept: false }), { version: 3, acceptVersion: 2 }, "a typo fix asks nobody again");
    assert.deepEqual(groups.nextRulesVersions({ version: 3, acceptVersion: 2, screening: true }, { screening: true, reaccept: true }), { version: 4, acceptVersion: 4 }, "everyone again");
    assert.deepEqual(groups.nextRulesVersions({ version: 4, acceptVersion: 4, screening: true }, { screening: false, reaccept: true }), { version: 5, acceptVersion: 4 }, "screening off keeps the asked version");
    assert.deepEqual(groups.nextRulesVersions({ version: 5, acceptVersion: 4, screening: false }, { screening: true, reaccept: false }), { version: 6, acceptVersion: 6 }, "turned on again: asked again");
    // What an acceptance records: the version shown, never above the current one.
    assert.equal(groups.acceptanceVersion({ version: 5 }), 5);
    assert.equal(groups.acceptanceVersion({ version: 5 }, 3), 3);
    assert.equal(groups.acceptanceVersion({ version: 5 }, 9), 5);
    assert.equal(groups.acceptanceVersion({ version: 5 }, 0), 5);
});

test("acceptances are kept by pseudonymous member key only", () => {
    const key = memberKey(G, MEMBER);
    assert.deepEqual(groups.readRulesAccepted({ [key]: 2, [MEMBER]: 2, kshort: 1, k0000000000000000000a: -1, k0000000000000000000b: "2" }), { [key]: 2 });
    assert.equal(groups.acceptedRulesVersion({ [key]: 3 }, key), 3);
    assert.equal(groups.acceptedRulesVersion({ [key]: 3 }, memberKey(G, OTHER)), 0);
    assert.equal(groups.acceptedRulesVersion(null, key), 0);
    assert.equal(groups.acceptedRulesVersion({ [MEMBER]: 3 }, MEMBER), 0, "an e-mail is never a key");
});

test("suggested rules: in the group's language, merged by title up to the limit", () => {
    assert.equal(groups.suggestedRules("tr")[0].title, "Saygılı ve yapıcı ol");
    assert.equal(groups.suggestedRules("en")[0].title, "Be respectful and constructive");
    let next = 0;
    const make = (rule) => ({ id: `s${++next}`, ...rule });
    const current = [{ id: "a", title: "saygılı VE yapıcı ol", description: "" }];
    const merged = groups.mergeRules(current, groups.suggestedRules("tr"), make);
    assert.equal(merged.length, groups.suggestedRules("tr").length, "the one it has isn't added twice");
    const almostFull = Array.from({ length: 18 }, (_, index) => ({ id: `f${index}`, title: `Kural ${index}`, description: "" }));
    assert.equal(groups.mergeRules(almostFull, groups.suggestedRules("en"), make).length, 20);
});

// ---------------------------------------------------------------------------
// The live group document and addresses (browser side)

test("the live group document: the rules list (also from the old text) and acceptances by key", () => {
    const key = memberKey(G, MEMBER);
    const live = workspace.liveGroupFromData({ members: [OWNER], rules: "1. a\n2. b", rulesAccepted: { [key]: 2, [MEMBER]: 9 } });
    assert.deepEqual(live.rulesList.map((rule) => rule.title), ["a", "b"]);
    assert.equal(live.rulesScreening, false);
    assert.deepEqual(live.rulesAccepted, { [key]: 2 });
    const current = workspace.liveGroupFromData({ members: [OWNER], rulesList: RULES, rulesVersion: 3, rulesAcceptVersion: 2, rulesScreening: true });
    assert.deepEqual([current.rulesList, current.rulesVersion, current.rulesAcceptVersion, current.rulesScreening, current.rules], [RULES, 3, 2, true, groups.rulesText(RULES)]);
    const partial = workspace.liveGroupFromData({ name: "x" });
    assert.equal(partial.rulesList, undefined, "a partial snapshot leaves the rules as they were");
});

test("the Rules section has its own address in a group", () => {
    assert.equal(model.groupHref("g1", { view: "rules" }), "/social/g/g1?view=rules");
    assert.equal(model.groupHref("g1", { view: "rules", topic: "ignored" }), "/social/g/g1?view=rules");
    assert.equal(model.groupViewOf("rules"), "rules");
    assert.equal(model.groupViewOf("files"), "files");
    assert.equal(model.groupViewOf("other"), "chat");
    assert.equal(model.groupViewOf(null), "chat");
});

// ---------------------------------------------------------------------------
// Saving the rules (POST /api/groups { action: "update-settings" })

test("a settings save: the list, its plain-text copy, versions and screening; older clients' text is read into rules", () => {
    const now = new Date("2026-10-06T12:00:00.000Z");
    const change = shared.readRulesChange({ rulesList: [{ id: "r1", title: "Saygılı ol", description: "Kişiyi değil fikri eleştir." }, { title: "Yeni kural" }], rulesScreening: true });
    const written = shared.rulesWrite(gatedGroup({ rulesUpdatedAt: "2026-10-01T00:00:00.000Z" }), change, now);
    assert.equal(written.rulesList.length, 2);
    assert.equal(written.rulesList[1].title, "Yeni kural");
    assert.equal(written.rules, groups.rulesText(written.rulesList));
    assert.deepEqual([written.rulesVersion, written.rulesAcceptVersion, written.rulesScreening], [3, 2, true], "a new rule doesn't ask everyone again by itself");
    assert.equal(written.rulesUpdatedAt, now);
    const again = shared.rulesWrite(gatedGroup(), shared.readRulesChange({ rulesReaccept: true }), now);
    assert.deepEqual([again.rulesVersion, again.rulesAcceptVersion, again.rulesList], [3, 3, RULES], "everyone accepts again");
    const toggled = shared.rulesWrite(gatedGroup({ rulesUpdatedAt: "2026-10-01T00:00:00.000Z" }), shared.readRulesChange({ rulesScreening: false }), now);
    assert.equal(toggled.rulesUpdatedAt, undefined, "the switch alone doesn't move \"last updated\"");
    assert.equal(toggled.rulesScreening, false);
    const legacy = shared.readRulesChange({ rules: "1. Eski\n2. Metin" });
    assert.deepEqual(legacy.list.map((rule) => rule.title), ["Eski", "Metin"]);
    assert.equal(shared.readRulesChange({ name: "x" }), null, "the request doesn't touch the rules");
    assert.throws(() => shared.readRulesChange({ rulesList: [{ title: "" }] }), (error) => error.code === "invalid_rules");
    assert.throws(() => shared.readRulesChange({ rulesList: Array.from({ length: 21 }, () => ({ title: "x" })) }), (error) => error.code === "rules_limit" && error.extra.limit === 20);
    assert.throws(() => shared.readRulesChange({ rulesList: [{ title: "x".repeat(121) }] }), (error) => error.code === "rules_too_long");
    assert.throws(() => shared.readRulesChange({ rules: "x".repeat(4001) }), (error) => error.code === "rules_too_long");
    assert.throws(() => shared.readRulesChange({ rulesScreening: "yes" }), (error) => error.code === "invalid_request");
    assert.equal(shared.readSeenRulesVersion(2), 2);
    assert.equal(shared.readSeenRulesVersion(0), undefined);
    assert.equal(shared.readSeenRulesVersion("2"), undefined);
});

test("the client view of a group carries the rules, never the acceptances", () => {
    const info = shared.publicGroup(G, gatedGroup({ rulesAccepted: { [memberKey(G, MEMBER)]: 2 }, rulesUpdatedAt: "2026-10-01T00:00:00.000Z" }));
    assert.deepEqual([info.rulesList, info.rulesVersion, info.rulesAcceptVersion, info.rulesScreening, info.rulesUpdatedAt], [RULES, 2, 2, true, "2026-10-01T00:00:00.000Z"]);
    assert.equal(info.rules, groups.rulesText(RULES));
    assert.equal("rulesAccepted" in info, false);
    const legacy = shared.publicGroup(G, { name: "Eski", ownerEmail: OWNER, members: [OWNER], rules: "1. a\n2. b" });
    assert.deepEqual([legacy.rules, legacy.rulesList.length, legacy.rulesScreening], ["1. a\n2. b", 2, false], "the old text stays as it was");
});

// ---------------------------------------------------------------------------
// The gate on every write path, and accepting

test("a member who hasn't accepted the rules can read, run /kurallar and /yardim, and nothing else", async () => {
    await withBackend({ [`groups/${G}`]: gatedGroup(), [`public_profiles/${MEMBER}`]: { username: "Deniz" } }, {}, async (db) => {
        const member = person(MEMBER);
        await rejects(messages.sendGroupMessage(member, G, { text: "merhaba" }), "rules_not_accepted", 409);
        await rejects(messages.sendGroupMessage(member, G, { text: "#genel selam", type: "gif", gif: { id: "x" } }), "rules_not_accepted");
        await rejects(messages.editGroupMessage(member, G, "m1", "düzeltme"), "rules_not_accepted", 409);
        // Reactions go through the same check (POST /api/groups/chat { action: "react" }).
        assert.throws(() => shared.assertRulesAccepted(G, db.get(`groups/${G}`), MEMBER), (error) => error.code === "rules_not_accepted" && error.status === 409);
        // Voice messages and the voice channel.
        await rejects(voice.sendVoiceMessage({ email: MEMBER, friends: [], blockedUsers: [] }, { kind: "group", groupId: G }, { bytes: WEBM, seconds: 2 }), "rules_not_accepted");
        await rejects(groupVoice.joinVoice(G, MEMBER, { tab: "tab00001" }), "rules_not_accepted");
        // Reading commands still answer, only to the member: the rules, numbered.
        const shown = await messages.sendGroupMessage(member, G, { text: "/kurallar" });
        assert.equal(shown.message, undefined, "nothing is posted");
        assert.deepEqual(shown.ephemeral, { kind: "rules", rules: groups.rulesText(RULES), items: RULES.map(({ title, description }) => ({ title, description })) });
        assert.equal((await messages.sendGroupMessage(member, G, { text: "/yardim" })).ephemeral.kind, "help");
        await rejects(messages.sendGroupMessage(member, G, { text: "/rapor @Ali neden" }), "rules_not_accepted", 409);
        assert.equal(db.paths().filter((path) => path.startsWith(`groups/${G}/messages/`)).length, 0);
    });
});

test("the owner, admins and moderators never have to accept", async () => {
    await withBackend({ [`groups/${G}`]: gatedGroup() }, {}, async (db) => {
        for (const [index, email] of [OWNER, ADMIN, MOD].entries()) {
            const sent = await messages.sendGroupMessage(person(email), G, { text: `selam ${index}` });
            assert.equal(db.get(`groups/${G}/messages/${sent.message.id}`).text, `selam ${index}`);
            assert.equal(rulesBlock(G, db.get(`groups/${G}`), email), false);
        }
        const joined = await groupVoice.joinVoice(G, MOD, { tab: "tab00002" });
        assert.equal(joined.participants.length, 1);
    });
});

test("accepting records the shown version by member key; then the member can take part", async () => {
    await withBackend({ [`groups/${G}`]: gatedGroup(), [`public_profiles/${MEMBER}`]: { username: "Deniz" } }, {}, async (db) => {
        const member = person(MEMBER);
        assert.deepEqual(await shared.acceptGroupRules(G, MEMBER, 2), { version: 2 });
        const stored = db.get(`groups/${G}`).rulesAccepted;
        assert.deepEqual(stored, { [memberKey(G, MEMBER)]: 2 });
        assert.ok(!JSON.stringify(stored).includes("@"), "no e-mail addresses on the group document");
        assert.deepEqual(await shared.acceptGroupRules(G, MEMBER), { version: 2 }, "accepting again changes nothing");
        const sent = await messages.sendGroupMessage(member, G, { text: "artık yazabiliyorum" });
        assert.equal(db.get(`groups/${G}/messages/${sent.message.id}`).text, "artık yazabiliyorum");
        shared.assertRulesAccepted(G, db.get(`groups/${G}`), MEMBER);
        const clip = await voice.sendVoiceMessage({ email: MEMBER, friends: [], blockedUsers: [] }, { kind: "group", groupId: G }, { bytes: WEBM, seconds: 2 });
        assert.equal(clip.kind, "group");
        const joined = await groupVoice.joinVoice(G, MEMBER, { tab: "tab00003" });
        assert.equal(joined.participants.length, 1);
        await rejects(shared.acceptGroupRules(G, NEWCOMER), "not_found");
    });
});

test("asking everyone again: earlier acceptances stop counting, an outdated page can't accept, voice drops out", async () => {
    const key = memberKey(G, MEMBER);
    await withBackend({ [`groups/${G}`]: gatedGroup({ rulesVersion: 3, rulesAcceptVersion: 3, rulesAccepted: { [key]: 2 } }) }, {}, async (db) => {
        assert.equal(rulesBlock(G, db.get(`groups/${G}`), MEMBER), true);
        await rejects(messages.sendGroupMessage(person(MEMBER), G, { text: "selam" }), "rules_not_accepted");
        await rejects(shared.acceptGroupRules(G, MEMBER, 2), "rules_changed", 409);
        assert.equal(db.get(`groups/${G}`).rulesAccepted[key], 2, "nothing recorded for the old rules");
        await shared.acceptGroupRules(G, MEMBER, 3);
        assert.equal(rulesBlock(G, db.get(`groups/${G}`), MEMBER), false);
    });
    // A typo fix (version 4, still asking for 3) keeps them in.
    await withBackend({ [`groups/${G}`]: gatedGroup({ rulesVersion: 4, rulesAcceptVersion: 3, rulesAccepted: { [key]: 3 } }) }, {}, async (db) => {
        assert.equal(rulesBlock(G, db.get(`groups/${G}`), MEMBER), false);
    });
    // In the voice channel when asked again: out at the next check-in.
    await withBackend({ [`groups/${G}`]: gatedGroup({ rulesAccepted: { [key]: 2 } }) }, {}, async (db) => {
        const now = Date.now();
        await groupVoice.joinVoice(G, MEMBER, { tab: "tab00004" }, now);
        const current = db.get(`groups/${G}`);
        await (await load("lib/server/firebase-rest.ts")).patchServerDocument(`groups/${G}`, { ...current, rulesVersion: 3, rulesAcceptVersion: 3 });
        await rejects(groupVoice.heartbeatVoice(G, MEMBER, { tab: "tab00004" }, now + 1000), "rules_not_accepted");
        assert.equal(db.get(`group_voice/${G}`), null, "the seat is gone");
    });
});

test("screening off or no rules: nobody is held back", async () => {
    await withBackend({ [`groups/${G}`]: gatedGroup({ rulesScreening: false }) }, {}, async () => {
        const sent = await messages.sendGroupMessage(person(MEMBER), G, { text: "kural onayı yok" });
        assert.ok(sent.message.id);
    });
    await withBackend({ [`groups/${G}`]: gatedGroup({ rulesList: [], rules: "" }) }, {}, async () => {
        const sent = await messages.sendGroupMessage(person(MEMBER), G, { text: "kural yok" });
        assert.ok(sent.message.id);
        assert.equal((await messages.sendGroupMessage(person(MEMBER), G, { text: "/kurallar" })).ephemeral.items.length, 0);
    });
    // A group from before the Rules section (only the text) asks nothing.
    await withBackend({ [`groups/${G}`]: { name: "Eski", ownerEmail: OWNER, members: [OWNER, MEMBER], admins: [OWNER], rules: "1. Eski kural" } }, {}, async () => {
        const shown = await messages.sendGroupMessage(person(MEMBER), G, { text: "/rules" });
        assert.deepEqual(shown.ephemeral.items, [{ title: "Eski kural", description: "" }]);
        assert.ok((await messages.sendGroupMessage(person(MEMBER), G, { text: "eski grup" })).message.id);
    });
});

// ---------------------------------------------------------------------------
// Joining with the rules accepted

function joinSeed(extra = {}) {
    return {
        [`groups/${G}`]: gatedGroup(),
        [`group_invite_links/${TOKEN}`]: { groupId: G, createdBy: OWNER, createdAt: "2026-10-01T00:00:00.000Z", expiresAt: null, maxUses: 0, uses: 0 },
        [`public_profiles/${OWNER}`]: { username: "Ali" },
        ...extra,
    };
}

test("the invitation page shows the rules and whether joining needs them accepted", async () => {
    await withBackend(joinSeed(), {}, async () => {
        const preview = await join.joinLinkPreview(person(NEWCOMER), TOKEN);
        assert.deepEqual(preview.rules, RULES.map(({ title, description }) => ({ title, description })));
        assert.equal(preview.rulesScreening, true);
        assert.equal(preview.rulesVersion, 2);
        assert.equal(preview.alreadyMember, false);
    });
});

test("joining with an invite link: acceptRules accepts the rules shown, with the membership", async () => {
    await withBackend(joinSeed(), {}, async (db) => {
        const result = await join.joinWithLink(person(NEWCOMER), TOKEN, { acceptRules: true, rulesVersion: 2 });
        assert.deepEqual(result, { success: true, groupId: G, alreadyMember: false });
        const group = db.get(`groups/${G}`);
        assert.ok(group.members.includes(NEWCOMER));
        assert.deepEqual(group.rulesAccepted, { [memberKey(G, NEWCOMER)]: 2 });
        assert.equal(db.get(`group_invite_links/${TOKEN}`).uses, 1);
        assert.equal(rulesBlock(G, group, NEWCOMER), false);
        const sent = await messages.sendGroupMessage(person(NEWCOMER), G, { text: "merhaba herkese" });
        assert.ok(sent.message.id);
        // The notice that someone joined is posted as before.
        assert.ok(db.paths().some((path) => path.startsWith(`groups/${G}/messages/`) && db.get(path).event === "member_joined"));
    });
    await withBackend(joinSeed(), {}, async (db) => {
        await join.joinWithLink(person(NEWCOMER), TOKEN);
        assert.equal(db.get(`groups/${G}`).rulesAccepted, undefined, "without the box ticked nothing is accepted");
        assert.equal(rulesBlock(G, db.get(`groups/${G}`), NEWCOMER), true, "they accept inside the group");
    });
    await withBackend(joinSeed({ [`groups/${G}`]: gatedGroup({ rulesVersion: 3, rulesAcceptVersion: 3 }) }), {}, async (db) => {
        await join.joinWithLink(person(NEWCOMER), TOKEN, { acceptRules: true, rulesVersion: 2 });
        assert.ok(db.get(`groups/${G}`).members.includes(NEWCOMER), "rules changed meanwhile: the join still goes through");
        assert.equal(db.get(`groups/${G}`).rulesAccepted, undefined, "but the old rules aren't recorded as accepted");
    });
});

test("accepting a friend's invitation can accept the rules too", async () => {
    const inviteId = shared.inviteDocumentId(G, FRIEND);
    const seed = {
        [`groups/${G}`]: gatedGroup(),
        [`group_invites/${inviteId}`]: { groupId: G, groupName: "Kod Kulübü", fromEmail: MEMBER, toEmail: FRIEND, status: "pending", createdAt: "2026-10-01T00:00:00.000Z", expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    };
    await withBackend(seed, {}, async (db) => {
        await join.acceptFriendInvite(person(FRIEND), G, { acceptRules: true, rulesVersion: 2 });
        assert.ok(db.get(`groups/${G}`).members.includes(FRIEND));
        assert.deepEqual(db.get(`groups/${G}`).rulesAccepted, { [memberKey(G, FRIEND)]: 2 });
        assert.equal(db.get(`group_invites/${inviteId}`).status, "accepted");
    });
});

// ---------------------------------------------------------------------------
// Leaving, removal and account deletion

test("leaving, being removed or banned and deleting the account take the acceptance away", async () => {
    const accepted = Object.fromEntries([MEMBER, OTHER, MOD, ADMIN].map((email) => [memberKey(G, email), 2]));
    await withBackend({ [`groups/${G}`]: gatedGroup({ rulesAccepted: accepted, typing: { [memberKey(G, MEMBER)]: Date.now() } }) }, {}, async (db) => {
        await shared.leaveGroupMembership(G, MEMBER);
        let group = db.get(`groups/${G}`);
        assert.ok(!group.members.includes(MEMBER));
        assert.equal(memberKey(G, MEMBER) in group.rulesAccepted, false);
        assert.equal(memberKey(G, MEMBER) in group.typing, false);
        await shared.removeGroupMember(G, OWNER, OTHER, true);
        group = db.get(`groups/${G}`);
        assert.equal(memberKey(G, OTHER) in group.rulesAccepted, false, "removed (and banned)");
        assert.ok(db.has(`group_bans/${shared.banDocumentId(G, OTHER)}`));
        await rejects(shared.leaveGroupMembership(G, OWNER), "owner_cannot_leave");

        await deleteAccountData(MOD, { scope: "all" });
        group = db.get(`groups/${G}`);
        assert.ok(!group.members.includes(MOD));
        assert.ok(!group.moderators.includes(MOD), "the moderator list doesn't keep the address");
        assert.deepEqual(group.rulesAccepted, { [memberKey(G, ADMIN)]: 2 }, "only the others' acceptances are left");
    });
});

// ---------------------------------------------------------------------------
// Starter templates

test("templates no longer write rules files: they start a Rules section (screening on when they come with rules)", () => {
    const ctx = { groupName: "Test Grubu", ownerName: "Ali", date: "2026-10-06", year: 2026 };
    for (const template of groups.GROUP_TEMPLATES) {
        for (const lang of ["tr", "en"]) {
            const seed = groups.buildGroupSeed(template.id, lang, ctx);
            const names = seed.files.map((file) => file.name);
            for (const name of ["KURALLAR.md", "RULES.md", "CODE_OF_CONDUCT.md"]) {
                assert.ok(!names.includes(name), `${template.id}/${lang} creates ${name}`);
                assert.ok(!template.files[lang].includes(name), `${template.id}/${lang} lists ${name}`);
                assert.ok(seed.files.every((file) => !file.code.includes(name)), `${template.id}/${lang} mentions ${name}`);
            }
            assert.deepEqual([...names].sort(), [...template.files[lang]].sort(), `${template.id}/${lang}: the listed files are the created ones`);
            assert.equal(seed.rules, groups.rulesText(seed.rulesList));
            if (template.id === "blank") {
                assert.deepEqual([seed.rulesList, seed.rulesScreening, seed.rules], [[], false, ""]);
                continue;
            }
            assert.equal(seed.rulesScreening, true);
            assert.ok(seed.rulesList.length >= 5 && seed.rulesList.length <= groups.GROUP_LIMITS.rulesCount);
            assert.deepEqual(seed.rulesList.map((rule) => rule.id), seed.rulesList.map((_, index) => `r${index + 1}`), "stable ids");
            assert.deepEqual(seed.rulesList.slice(0, 5).map((rule) => rule.title), groups.suggestedRules(lang).map((rule) => rule.title), "the suggested rules first");
            assert.ok(seed.rulesList.every((rule) => rule.title && rule.description), "each rule has a title and a description");
            assert.deepEqual(groups.templateRules(template.id, lang).rules.map((rule) => rule.title), seed.rulesList.map((rule) => rule.title), "the wizard previews the same rules");
            const readme = seed.files.find((file) => file.name === "README.md").code;
            assert.ok(readme.includes(lang === "tr" ? "Kurallar bölümünü oku" : "Rules section"), `${template.id}/${lang}: the first steps point at the Rules section`);
        }
    }
    const study = groups.getGroupTemplate("study").welcome;
    assert.ok(study.TR.includes("Kurallar bölümünü") && study.EN.includes("Rules section"));
});
