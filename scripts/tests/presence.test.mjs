// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const presence = await load("lib/presence.ts");
const profile = await load("lib/account-profile.ts");
const {
    PRESENCE_IDLE_STALE_MS, PRESENCE_STALE_MS, effectiveStatus, isPresenceTabId, lastSeenTime, newPresenceTabId, presenceTabId, presenceTime,
    presenceWrites, readPresenceReport, readStatusPreference, resolvePresence, supersedes,
} = presence;

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
const iso = (offset) => new Date(NOW + offset).toISOString();
const MINUTE = 60_000;

test("a fresh status counts, an expired one is offline", () => {
    const status = (value, updated, expires) => effectiveStatus({ presence: { status: value, updatedAt: iso(updated), expiresAt: expires === undefined ? undefined : iso(expires) } }, NOW);
    assert.equal(status("online", -30_000, 90_000), "online");
    assert.equal(status("dnd", -30_000, 90_000), "dnd");
    assert.equal(status("idle", -5 * MINUTE, 5 * MINUTE), "idle");
    assert.equal(status("online", -3 * MINUTE, -MINUTE), "offline");
    assert.equal(status("offline", -1_000, MINUTE), "offline");
    // Without expiresAt a status lasts PRESENCE_STALE_MS.
    assert.equal(status("online", -PRESENCE_STALE_MS + 1_000), "online");
    assert.equal(status("online", -PRESENCE_STALE_MS - 1_000), "offline");
    // expiresAt can't stretch a status beyond PRESENCE_IDLE_STALE_MS.
    assert.equal(status("idle", -PRESENCE_IDLE_STALE_MS - 1_000, 60 * MINUTE), "offline");
    // A time far in the future is a wrong clock.
    assert.equal(status("online", 10 * MINUTE, 12 * MINUTE), "offline");
    assert.equal(effectiveStatus({ presence: { status: "online" } }, NOW), "offline");
    assert.equal(effectiveStatus(null, NOW), "offline");
    assert.equal(effectiveStatus(undefined, NOW), "offline");
});

test("profiles from before presence use isOnline, lastSeenAt and dndMode", () => {
    assert.equal(effectiveStatus({ isOnline: true, lastSeenAt: iso(-30_000) }, NOW), "online");
    assert.equal(effectiveStatus({ isOnline: true, lastSeenAt: iso(-30_000), dndMode: true }, NOW), "dnd");
    assert.equal(effectiveStatus({ isOnline: true, lastSeenAt: iso(-5 * MINUTE) }, NOW), "offline");
    assert.equal(effectiveStatus({ isOnline: false, lastSeenAt: iso(-1_000) }, NOW), "offline");
    assert.equal(effectiveStatus({ isOnline: true }, NOW), "offline");
    // A malformed presence falls back as well.
    assert.equal(effectiveStatus({ presence: { status: "busy" }, isOnline: true, lastSeenAt: iso(-1_000) }, NOW), "online");
});

test("stored times: ISO strings, dates, numbers and client SDK timestamps", () => {
    assert.equal(presenceTime(iso(0)), NOW);
    assert.equal(presenceTime(new Date(NOW)), NOW);
    assert.equal(presenceTime(NOW), NOW);
    assert.equal(presenceTime({ toMillis: () => NOW }), NOW);
    assert.equal(presenceTime({ seconds: NOW / 1000, nanoseconds: 0 }), NOW);
    assert.equal(presenceTime("yesterday"), 0);
    assert.equal(presenceTime(null), 0);
    assert.equal(effectiveStatus({ presence: { status: "online", updatedAt: { toMillis: () => NOW - 1_000 } } }, NOW), "online");
    assert.equal(lastSeenTime({ lastSeenAt: iso(-MINUTE) }), NOW - MINUTE);
    assert.equal(lastSeenTime({}), 0);
});

test("the published status follows the preference, activity and privacy setting", () => {
    assert.equal(resolvePresence("auto", "active"), "online");
    assert.equal(resolvePresence("auto", "idle"), "idle");
    assert.equal(resolvePresence("idle", "active"), "idle");
    assert.equal(resolvePresence("dnd", "active"), "dnd");
    assert.equal(resolvePresence("dnd", "idle"), "dnd");
    assert.equal(resolvePresence("invisible", "active"), "offline");
    for (const preference of ["auto", "idle", "dnd", "invisible"]) {
        assert.equal(resolvePresence(preference, "offline"), "offline");
        assert.equal(resolvePresence(preference, "active", false), "offline");
    }
    assert.equal(readStatusPreference("idle"), "idle");
    assert.equal(readStatusPreference(undefined, true), "dnd");
    assert.equal(readStatusPreference("invisible", true), "invisible");
    assert.equal(readStatusPreference("busy"), "auto");
});

test("the most present tab or device keeps the status while its report is fresh", () => {
    const previous = { activity: "active", tab: "t0000000000000001", at: NOW - 30_000, status: "online" };
    assert.equal(supersedes(null, { activity: "idle", tab: "t0000000000000002" }, NOW), true);
    assert.equal(supersedes(previous, { activity: "idle", tab: "t0000000000000001" }, NOW), true);
    assert.equal(supersedes(previous, { activity: "idle", tab: "t0000000000000002" }, NOW), false);
    assert.equal(supersedes(previous, { activity: "offline", tab: "t0000000000000002" }, NOW), false);
    assert.equal(supersedes(previous, { activity: "active", tab: "t0000000000000002" }, NOW), true);
    assert.equal(supersedes({ ...previous, at: NOW - PRESENCE_STALE_MS - 1 }, { activity: "idle", tab: "t0000000000000002" }, NOW), true);
    assert.equal(readPresenceReport({ activity: "idle", tab: "t1", at: NOW, status: "idle" })?.status, "idle");
    assert.equal(readPresenceReport({ activity: "away", tab: "t1", at: NOW, status: "idle" }), null);
    assert.equal(readPresenceReport("x"), null);
});

test("presence writes: legacy fields, last seen and invisible", () => {
    const report = (activity, status) => ({ activity, tab: "t0000000000000001", at: NOW, status });
    const online = presenceWrites({ report: report("active", "online"), invisible: false, showLastSeen: true, previousStatus: null });
    assert.deepEqual(online.user.mask, ["presenceState", "isOnline", "lastSeenAt"]);
    assert.equal(online.user.data.isOnline, true);
    assert.deepEqual(online.profile.data.presence, { status: "online", updatedAt: iso(0), expiresAt: iso(PRESENCE_STALE_MS) });
    assert.equal(online.profile.data.isOnline, true);
    assert.equal(online.profile.data.dndMode, false);
    assert.equal(online.profile.data.lastSeenAt, iso(0));

    const idle = presenceWrites({ report: report("idle", "idle"), invisible: false, showLastSeen: true, previousStatus: "online" });
    assert.equal(idle.profile.data.presence.expiresAt, iso(PRESENCE_IDLE_STALE_MS));
    const dnd = presenceWrites({ report: report("active", "dnd"), invisible: false, showLastSeen: true, previousStatus: "online" });
    assert.equal(dnd.profile.data.dndMode, true);

    // "Show last seen" off: the field is in the mask without a value, so it is removed.
    const hidden = presenceWrites({ report: report("active", "online"), invisible: false, showLastSeen: false, previousStatus: "online" });
    assert.ok(hidden.profile.mask.includes("lastSeenAt"));
    assert.equal("lastSeenAt" in hidden.profile.data, false);

    // Invisible: offline without a fresh last-seen time; nothing to publish when already offline.
    const invisible = presenceWrites({ report: report("active", "offline"), invisible: true, showLastSeen: true, previousStatus: "online" });
    assert.deepEqual(invisible.profile.data.presence, { status: "offline", updatedAt: iso(0) });
    assert.equal(invisible.profile.mask.includes("lastSeenAt"), false);
    assert.equal(presenceWrites({ report: report("active", "offline"), invisible: true, showLastSeen: true, previousStatus: "offline" }).profile, null);
    assert.notEqual(presenceWrites({ report: report("active", "offline"), invisible: true, showLastSeen: false, previousStatus: "offline", force: true }).profile, null);

    // Leaving while visible stores the last-seen time.
    const left = presenceWrites({ report: report("offline", "offline"), invisible: false, showLastSeen: true, previousStatus: "online" });
    assert.equal(left.profile.data.lastSeenAt, iso(0));
    assert.equal(left.user.data.isOnline, false);
});

test("tab ids", () => {
    const id = newPresenceTabId();
    assert.ok(isPresenceTabId(id));
    assert.notEqual(id, newPresenceTabId());
    assert.equal(presenceTabId(), presenceTabId());
    assert.equal(isPresenceTabId("t123"), false);
    assert.equal(isPresenceTabId("presenceState.x"), false);
});

test("the status preference is an account setting; dndMode is kept in step", () => {
    const { DEFAULT_ACCOUNT_FIELDS, mergeStoredAccount, normalizeStoredAccount, sanitizeAccountPatch } = profile;
    assert.equal(DEFAULT_ACCOUNT_FIELDS.statusPreference, "auto");
    assert.deepEqual(sanitizeAccountPatch({ statusPreference: "dnd" }), { ok: true, patch: { statusPreference: "dnd" } });
    assert.deepEqual(sanitizeAccountPatch({ statusPreference: "busy" }), { ok: false, error: { field: "statusPreference", code: "invalid" } });
    assert.equal(normalizeStoredAccount({ dndMode: true }).statusPreference, "dnd");
    assert.equal(normalizeStoredAccount({ dndMode: true, statusPreference: "idle" }).statusPreference, "idle");
    assert.equal(normalizeStoredAccount({ dndMode: true, statusPreference: "idle" }).dndMode, false);
    assert.equal(normalizeStoredAccount({ statusPreference: "dnd" }).dndMode, true);
    assert.equal(mergeStoredAccount({}, { dndMode: true }).statusPreference, "dnd");
    assert.equal(mergeStoredAccount({ statusPreference: "auto" }, { dndMode: true }).dndMode, false);
});
