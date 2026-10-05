// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const profile = await load("lib/account-profile.ts");
const {
    DEFAULT_ACCOUNT_FIELDS, EDITABLE_ACCOUNT_KEYS, PUBLIC_PROFILE_KEYS, defaultNickname, diffAccountFields, isSafeSocialLink,
    isTimeZoneName, mergeStoredAccount, normalizeStoredAccount, sameNickname, sanitizeAccountPatch, splitAccountPatch,
} = profile;

const fieldError = (input) => {
    const result = sanitizeAccountPatch(input);
    assert.equal(result.ok, false, `expected an error for ${JSON.stringify(input)}`);
    return result.error;
};
const clean = (input) => {
    const result = sanitizeAccountPatch(input);
    assert.equal(result.ok, true, `expected ${JSON.stringify(input)} to be accepted: ${JSON.stringify(result.error)}`);
    return result.patch;
};

test("unknown fields are refused, including prototype keys", () => {
    assert.deepEqual(fieldError({ role: "admin" }), { field: "role", code: "unknown_field" });
    assert.deepEqual(fieldError({ friends: [] }), { field: "friends", code: "unknown_field" });
    for (const key of ["toString", "constructor", "hasOwnProperty", "valueOf"]) {
        assert.deepEqual(fieldError({ [key]: "x" }), { field: key, code: "unknown_field" });
    }
    assert.deepEqual(fieldError(JSON.parse('{"__proto__": {"username": "x"}}')), { field: "__proto__", code: "unknown_field" });
    assert.deepEqual(fieldError(null), { field: "", code: "unknown_field" });
    assert.deepEqual(fieldError([]), { field: "", code: "unknown_field" });
    assert.deepEqual(fieldError("username"), { field: "", code: "unknown_field" });
    assert.deepEqual(clean({}), {});
});

test("types, enums and text limits", () => {
    assert.deepEqual(fieldError({ publicProfile: "yes" }), { field: "publicProfile", code: "type" });
    assert.deepEqual(fieldError({ bio: 42 }), { field: "bio", code: "type" });
    assert.deepEqual(fieldError({ msgFontSize: "huge" }), { field: "msgFontSize", code: "invalid" });
    assert.deepEqual(clean({ msgFontSize: "large", publicProfile: false }), { msgFontSize: "large", publicProfile: false });
    assert.deepEqual(fieldError({ bio: "a".repeat(601) }), { field: "bio", code: "too_long" });
    // Limits count characters (code points), not UTF-16 units.
    assert.deepEqual(clean({ customStatus: "🎮".repeat(120) }), { customStatus: "🎮".repeat(120) });
    assert.deepEqual(fieldError({ customStatus: "🎮".repeat(121) }), { field: "customStatus", code: "too_long" });
    assert.deepEqual(clean({ bio: "  Merhaba\u0000 dünya\u0007  " }), { bio: "Merhaba dünya" });
});

test("retired appearance settings: sent by an open tab, dropped; stored values aren't read back", () => {
    for (const key of ["compactMode", "uiFontSize", "timezone", "emojiStyle"]) {
        assert.ok(profile.RETIRED_ACCOUNT_KEYS.includes(key), key);
        assert.equal(key in DEFAULT_ACCOUNT_FIELDS, false, key);
    }
    assert.deepEqual(clean({ compactMode: true, uiFontSize: "large", timezone: "Europe/../x", emojiStyle: "noto", reduceAnimations: true }), { reduceAnimations: true });
    const stored = normalizeStoredAccount({ compactMode: true, timezone: "UTC", highContrast: true });
    assert.equal("compactMode" in stored, false);
    assert.equal("timezone" in stored, false);
    assert.equal(stored.highContrast, true);
});

test("the status emoji is retired: an open tab may still send it, and it is dropped", () => {
    assert.deepEqual(clean({ statusEmoji: "🎮", customStatus: "Kod yazıyorum" }), { customStatus: "Kod yazıyorum" });
    assert.deepEqual(clean({ statusEmoji: 42 }), {});
    assert.ok(profile.RETIRED_ACCOUNT_KEYS.includes("statusEmoji"));
    assert.equal("statusEmoji" in DEFAULT_ACCOUNT_FIELDS, false);
    assert.equal(PUBLIC_PROFILE_KEYS.includes("statusEmoji"), false);
    // A stored emoji isn't read back into the form.
    const merged = mergeStoredAccount({ statusEmoji: "😊", customStatus: "Burada" }, null);
    assert.equal(merged.customStatus, "Burada");
    assert.equal("statusEmoji" in merged, false);
});

test("username and nickname", () => {
    assert.deepEqual(fieldError({ username: "   " }), { field: "username", code: "required" });
    assert.deepEqual(fieldError({ nickname: "" }), { field: "nickname", code: "required" });
    assert.deepEqual(fieldError({ username: "<b>Ada</b>" }), { field: "username", code: "invalid" });
    assert.deepEqual(fieldError({ nickname: "x".repeat(101) }), { field: "nickname", code: "too_long" });
    assert.deepEqual(clean({ username: " Oğuzhan Şahin ", nickname: "Çağrı_42" }), { username: "Oğuzhan Şahin", nickname: "Çağrı_42" });
});

test("profile URLs must be plain https", () => {
    assert.deepEqual(clean({ avatarUrl: "https://lh3.googleusercontent.com/a/abc=s96-c" }), { avatarUrl: "https://lh3.googleusercontent.com/a/abc=s96-c" });
    assert.deepEqual(clean({ bannerUrl: "" }), { bannerUrl: "" });
    for (const bad of ["http://example.com/a.png", "javascript:alert(1)", "https://x.com/a b.png", "https://x.com/a\".png", "https://x.com/a).png", "data:image/png;base64,AAAA", `https://x.com/${"a".repeat(2050)}`]) {
        assert.deepEqual(fieldError({ avatarUrl: bad }), { field: "avatarUrl", code: "invalid" }, bad);
    }
});

test("colours, tags, time zones and social links", () => {
    assert.deepEqual(clean({ accentColor: "#abc", bubbleColor: "#3B82F6CC" }), { accentColor: "#abc", bubbleColor: "#3B82F6CC" });
    for (const bad of ["red", "#12", "#12345", "3B82F6", "#GGGGGG", ""]) {
        assert.deepEqual(fieldError({ accentColor: bad }), { field: "accentColor", code: "invalid" }, bad);
    }
    assert.deepEqual(clean({ nicknameTag: "0042" }), { nicknameTag: "0042" });
    for (const bad of ["42", "12345", "12a4", ""]) assert.deepEqual(fieldError({ nicknameTag: bad }), { field: "nicknameTag", code: "invalid" }, bad);
    assert.deepEqual(fieldError({ nicknameTag: 1234 }), { field: "nicknameTag", code: "type" });

    for (const zone of ["Europe/Istanbul", "America/Argentina/Buenos_Aires", "UTC", "Etc/GMT+3", "America/Port-au-Prince"]) assert.ok(isTimeZoneName(zone), zone);
    for (const zone of ["", "Europe/../x", "Europe/Istanbul/", "<script>", "Europe Istanbul"]) assert.equal(isTimeZoneName(zone), false, zone);

    for (const link of ["", "github.com/ada", "@ada", "https://x.com/ada", "http://example.com", "youtube.com/@kanal"]) assert.ok(isSafeSocialLink(link), link);
    for (const link of ["javascript:alert(1)", "data:text/html,x", "a\"b", "x.com/<script>", "vbscript:x"]) assert.equal(isSafeSocialLink(link), false, link);
    assert.deepEqual(fieldError({ socialWebsite: "javascript:alert(1)" }), { field: "socialWebsite", code: "invalid" });
});

test("favourite languages", () => {
    assert.deepEqual(clean({ favoriteLangs: [" Python ", "Python", "C++"] }), { favoriteLangs: ["Python", "C++"] });
    assert.deepEqual(fieldError({ favoriteLangs: ["a", "b", "c", "d", "e", "f"] }), { field: "favoriteLangs", code: "too_long" });
    assert.deepEqual(fieldError({ favoriteLangs: ["x".repeat(41)] }), { field: "favoriteLangs", code: "too_long" });
    assert.deepEqual(fieldError({ favoriteLangs: ["Rust", 3] }), { field: "favoriteLangs", code: "type" });
    assert.deepEqual(fieldError({ favoriteLangs: "Rust" }), { field: "favoriteLangs", code: "type" });
});

test("stored documents are normalized leniently", () => {
    assert.deepEqual(normalizeStoredAccount(null), { ...DEFAULT_ACCOUNT_FIELDS });
    const legacy = normalizeStoredAccount({
        username: "<Ada>",
        nickname: "ada",
        nicknameTag: 42,
        bio: "b".repeat(900),
        publicProfile: "false",
        accentColor: "blue",
        avatarUrl: "http://insecure.example/a.png",
        msgFontSize: "gigantic",
        favoriteLangs: ["Rust", 7, "Rust", "", "x".repeat(50), "Go", "C", "Lua", "Zig", "Elm"],
        dndSchedule: "22:00-07:00",
        socialGithub: "javascript:alert(1)",
        role: "admin",
        friends: ["x@example.com"],
        password: "secret",
    });
    assert.equal(legacy.username, "Ada");
    assert.equal(legacy.nicknameTag, "0042");
    assert.equal(legacy.bio.length, 600);
    assert.equal(legacy.publicProfile, false);
    assert.equal(legacy.accentColor, DEFAULT_ACCOUNT_FIELDS.accentColor);
    assert.equal(legacy.avatarUrl, "");
    assert.equal(legacy.msgFontSize, "medium");
    assert.deepEqual(legacy.favoriteLangs, ["Rust", "Go", "C", "Lua", "Zig"]);
    assert.equal(legacy.dndSchedule, "22:00-07:00");
    assert.equal(legacy.socialGithub, "");
    assert.deepEqual(Object.keys(legacy).sort(), [...EDITABLE_ACCOUNT_KEYS].sort());
    assert.equal("role" in legacy, false);
    assert.equal(normalizeStoredAccount({ nicknameTag: "12" }).nicknameTag, "");
    assert.equal(normalizeStoredAccount({ username: "" }).username, "");
});

test("diff, split and nickname helpers", () => {
    const base = normalizeStoredAccount({ username: "Ada", favoriteLangs: ["Rust"], dndSchedule: "22:00-07:00" });
    assert.deepEqual(diffAccountFields(base, { ...base }), {});
    assert.deepEqual(diffAccountFields(base, { ...base, favoriteLangs: ["Rust"] }), {});
    assert.deepEqual(diffAccountFields(base, { ...base, favoriteLangs: ["Rust", "Go"], bio: "Hi", highContrast: true }), { bio: "Hi", favoriteLangs: ["Rust", "Go"], highContrast: true });

    const { publicPatch, privatePatch } = splitAccountPatch({ bio: "Hi", highContrast: true, nicknameTag: "1234", dndSchedule: "23:00-08:00" });
    assert.deepEqual(publicPatch, { bio: "Hi", nicknameTag: "1234" });
    assert.deepEqual(privatePatch, { highContrast: true, dndSchedule: "23:00-08:00" });
    assert.ok(Object.keys(publicPatch).every((key) => PUBLIC_PROFILE_KEYS.includes(key)));

    assert.ok(sameNickname("Ada", " ada "));
    assert.ok(sameNickname("IŞIK", "ışık"));
    assert.ok(sameNickname("İlker", "ilker"));
    assert.equal(sameNickname("Ada", "Adam"), false);

    // Like Google sign-up: the username itself, else the e-mail name in nickname characters.
    assert.equal(defaultNickname("  Oğuzhan Guluzade ", "x@example.com"), "Oğuzhan Guluzade");
    assert.equal(defaultNickname("<>", "ada.lovelace@example.com"), "adalovelace");
    assert.equal(defaultNickname("", "...@example.com"), "Hanogt");
    assert.equal([...defaultNickname("ş".repeat(150), "x@example.com")].length, 100);
});

test("users/{email} wins over public_profiles/{email}, which fills the gaps", () => {
    const merged = mergeStoredAccount(
        { username: "Ada", nickname: "", bio: "", avatarUrl: "http://old.example/a.png", publicProfile: false, reduceAnimations: true, favoriteLangs: [] },
        { username: "Someone else", nickname: "ada", nicknameTag: "0420", bio: "Merhaba", avatarUrl: "https://cdn.example/a.png", publicProfile: true, favoriteLangs: ["Rust"], reduceAnimations: false, staffRole: "owner" },
    );
    assert.equal(merged.username, "Ada");
    assert.equal(merged.nickname, "ada");
    assert.equal(merged.nicknameTag, "0420");
    assert.equal(merged.bio, "Merhaba");
    // The users value is unusable (http), so the public one is shown.
    assert.equal(merged.avatarUrl, "https://cdn.example/a.png");
    assert.equal(merged.publicProfile, false);
    assert.deepEqual(merged.favoriteLangs, ["Rust"]);
    // Private settings never come from the public profile.
    assert.equal(merged.reduceAnimations, true);
    assert.equal("staffRole" in merged, false);
    assert.deepEqual(mergeStoredAccount(null, null), { ...DEFAULT_ACCOUNT_FIELDS });
    assert.equal(mergeStoredAccount({ nicknameTag: 7 }, { nicknameTag: "1234" }).nicknameTag, "0007");
});
