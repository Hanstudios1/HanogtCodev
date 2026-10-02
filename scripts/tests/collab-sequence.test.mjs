// Run: node --test scripts/tests/
// Live collaboration: numbering of Yjs updates, gaps, duplicates and which updates a compaction may delete.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { SequenceTracker, deletableUpdates, nextSequence, orderUpdates } = await load("lib/collab/sequence.ts");

test("updates in order move the watermark", () => {
    const tracker = new SequenceTracker();
    assert.equal(tracker.watermark, 0);
    assert.ok(tracker.accept(1));
    assert.ok(tracker.accept(2));
    assert.equal(tracker.watermark, 2);
    assert.equal(tracker.hasGap, false);
    assert.equal(tracker.missing, null);
});

test("duplicates (own echoes, overlapping listener and poll) are skipped", () => {
    const tracker = new SequenceTracker();
    assert.ok(tracker.accept(1));
    assert.equal(tracker.accept(1), false);
    assert.ok(tracker.accept(3));
    assert.equal(tracker.accept(3), false, "an early update counts once");
    assert.equal(tracker.accept(0), false);
    assert.equal(tracker.accept(-2), false);
    assert.equal(tracker.accept(1.5), false);
    assert.equal(tracker.accept(Number.NaN), false);
});

test("an early update leaves a gap until the missing one arrives", () => {
    const tracker = new SequenceTracker(10);
    assert.ok(tracker.accept(12));
    assert.ok(tracker.accept(13));
    assert.equal(tracker.watermark, 10, "polls keep asking after the gap");
    assert.ok(tracker.hasGap);
    assert.equal(tracker.missing, 11);
    assert.equal(tracker.highest, 13);
    assert.ok(tracker.accept(11));
    assert.equal(tracker.watermark, 13);
    assert.equal(tracker.hasGap, false);
});

test("a snapshot covers everything up to its number", () => {
    const tracker = new SequenceTracker();
    tracker.accept(1);
    tracker.accept(5);
    assert.ok(tracker.coverUpTo(7));
    assert.equal(tracker.watermark, 7);
    assert.equal(tracker.hasGap, false, "the snapshot filled the gap");
    assert.equal(tracker.accept(5), false);
    assert.equal(tracker.coverUpTo(6), false, "an older snapshot adds nothing");
    tracker.accept(9);
    assert.ok(tracker.coverUpTo(8));
    assert.equal(tracker.watermark, 9, "updates after the snapshot that already arrived count");
});

test("orderUpdates sorts and removes duplicate numbers", () => {
    const ordered = orderUpdates([{ seq: 3, data: "c" }, { seq: 1, data: "a" }, { seq: 3, data: "x" }, { seq: 0, data: "bad" }, { seq: 2, data: "b" }]);
    assert.deepEqual(ordered.map((item) => `${item.seq}${item.data}`), ["1a", "2b", "3c"]);
});

test("the server's next number: after the newest stored update, never below the snapshot", () => {
    assert.equal(nextSequence(null, 0), 1);
    assert.equal(nextSequence(7, 0), 8);
    assert.equal(nextSequence(null, 120), 121, "everything was compacted (only possible before any update was stored)");
    assert.equal(nextSequence(118, 120), 121);
    assert.equal(nextSequence(130, 120), 131);
    assert.equal(nextSequence("7", 0), 1);
});

test("competing writers never get the same number", () => {
    // A tiny model of POST /api/collab/[id]/sync: read the newest number, create the next document
    // only if it doesn't exist yet, otherwise read again (Firestore's create precondition).
    const stored = new Map();
    const snapshotSeq = 0;
    const latest = () => (stored.size ? Math.max(...stored.keys()) : null);
    const writers = Array.from({ length: 5 }, (_, index) => ({ name: `w${index}`, seen: null, done: false }));
    let steps = 0;
    while (writers.some((writer) => !writer.done) && steps < 1_000) {
        steps += 1;
        // Everyone reads before anyone writes: the worst interleaving.
        for (const writer of writers) if (!writer.done) writer.seen = latest();
        for (const writer of writers) {
            if (writer.done) continue;
            const seq = nextSequence(writer.seen, snapshotSeq);
            if (stored.has(seq)) continue;
            stored.set(seq, writer.name);
            writer.done = true;
        }
    }
    assert.deepEqual([...stored.keys()].sort((a, b) => a - b), [1, 2, 3, 4, 5], "no gaps, no duplicates");
});

test("compaction keeps the newest update and the ones live listeners may not have delivered", () => {
    const now = 1_000_000;
    const grace = 120_000;
    const items = [
        { seq: 1, at: now - 600_000 },
        { seq: 2, at: now - 300_000 },
        { seq: 3, at: now - 60_000 },
        { seq: 4, at: now - 500_000 },
        { seq: 5, at: now - 500_000 },
    ];
    assert.deepEqual(deletableUpdates(items, 4, now, grace).map((item) => item.seq), [1, 2, 4], "3 is too recent, 5 isn't covered");
    assert.deepEqual(deletableUpdates(items, 5, now, grace).map((item) => item.seq), [1, 2, 4], "5 is the newest: it keeps the numbering");
    assert.deepEqual(deletableUpdates([{ seq: 1, at: 0 }, { seq: 2, at: now - grace }], 2, now, grace).map((item) => item.seq), [], "unknown times are kept");
    assert.deepEqual(deletableUpdates([], 10, now, grace), []);
});
