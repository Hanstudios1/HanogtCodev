// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { effectivePresence, publicPresence, isPresenceChoice, PRESENCE_WINDOW_MS, PRESENCE_CHOICES, PRESENCE_COPY } = await load("lib/presence.ts");

const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const fresh = new Date(NOW - 30_000).toISOString();
const stale = new Date(NOW - PRESENCE_WINDOW_MS - 1_000).toISOString();

test("public state follows the heartbeat and the chosen status", () => {
    assert.equal(effectivePresence(null, NOW), "offline");
    assert.equal(effectivePresence({ isOnline: true, presence: "online", presenceAt: fresh }, NOW), "online");
    assert.equal(effectivePresence({ isOnline: true, presence: "idle", presenceAt: fresh }, NOW), "idle");
    assert.equal(effectivePresence({ isOnline: true, presence: "dnd", presenceAt: fresh }, NOW), "dnd");
    assert.equal(effectivePresence({ isOnline: true, presence: "offline", presenceAt: fresh }, NOW), "offline");
    // A closed tab that never said goodbye goes offline after the window.
    assert.equal(effectivePresence({ isOnline: true, presence: "online", presenceAt: stale }, NOW), "offline");
    assert.equal(effectivePresence({ isOnline: false, presence: "online", presenceAt: fresh }, NOW), "offline");
});

test("profiles from before the heartbeat are read the same way", () => {
    assert.equal(effectivePresence({ isOnline: true, lastSeenAt: fresh }, NOW), "online");
    assert.equal(effectivePresence({ isOnline: true, lastSeenAt: fresh, dndMode: true }, NOW), "dnd");
    assert.equal(effectivePresence({ isOnline: true, lastSeenAt: stale }, NOW), "offline");
    assert.equal(effectivePresence({ isOnline: true, presenceAt: { seconds: Math.floor(NOW / 1000) - 10 } }, NOW), "online");
});

test("what the heartbeat publishes for each choice", () => {
    const base = { active: true, autoIdle: false, showOnline: true };
    assert.deepEqual(publicPresence("online", base), { isOnline: true, presence: "online" });
    assert.deepEqual(publicPresence("online", { ...base, autoIdle: true }), { isOnline: true, presence: "idle" });
    assert.deepEqual(publicPresence("idle", base), { isOnline: true, presence: "idle" });
    assert.deepEqual(publicPresence("dnd", { ...base, autoIdle: true }), { isOnline: true, presence: "dnd" });
    assert.deepEqual(publicPresence("invisible", base), { isOnline: false, presence: "offline" });
    assert.deepEqual(publicPresence("online", { ...base, showOnline: false }), { isOnline: false, presence: "offline" });
    assert.deepEqual(publicPresence("online", { ...base, active: false }), { isOnline: false, presence: "offline" });
});

test("choices and labels", () => {
    assert.deepEqual([...PRESENCE_CHOICES], ["online", "idle", "dnd", "invisible"]);
    assert.equal(isPresenceChoice("dnd"), true);
    assert.equal(isPresenceChoice("away"), false);
    for (const key of [...PRESENCE_CHOICES, "offline"]) {
        assert.ok(PRESENCE_COPY[key].label.TR && PRESENCE_COPY[key].label.EN, key);
        assert.ok(PRESENCE_COPY[key].hint.TR && PRESENCE_COPY[key].hint.EN, key);
    }
});
