// The legal version metadata and what the in-app notice lists after an update
// (src/lib/legal.ts, src/components/PrivacyPolicyModal.tsx).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./setup.mjs";

const legal = await load("lib/legal.ts");

test("the version, the notice id and the newest change agree", () => {
    assert.equal(legal.LEGAL_CHANGES[0].version, legal.LEGAL_VERSION);
    assert.ok(legal.LEGAL_NOTICE_ID.startsWith(`${legal.LEGAL_VERSION}-`), legal.LEGAL_NOTICE_ID);
    const versions = legal.LEGAL_CHANGES.map((change) => change.version);
    assert.equal(new Set(versions).size, versions.length, "each version once");
    for (const change of legal.LEGAL_CHANGES) {
        assert.ok(change.items.length > 0 && change.items.every((item) => item.TR && item.EN), change.version);
    }
});

test("the notice lists every version since the one acknowledged, newest first", () => {
    const [newest, previous] = legal.LEGAL_CHANGES.map((change) => change.version);
    const since = (id, max) => legal.legalChangesSince(id, max).map((change) => change.version);
    assert.deepEqual(since(`${previous}-2026-01-01`), [newest], "one version behind");
    const older = legal.LEGAL_CHANGES[2].version;
    assert.deepEqual(since(`${older}-2026-01-01`), [newest, previous], "two versions behind: both are listed");
    assert.deepEqual(since("1.0-2020-01-01", 2).length, 2, "at most `max`");
    assert.deepEqual(since(legal.LEGAL_NOTICE_ID), [newest], "the same version re-noticed: the latest alone");
    assert.deepEqual(since(null), [newest], "nothing stored");
    assert.deepEqual(since("<script>"), [newest], "nonsense");
    assert.deepEqual(since(`${newest.split(".")[0]}.${Number(newest.split(".")[1]) + 10}-2030-01-01`), [newest], "a newer id than known: the latest");
});
