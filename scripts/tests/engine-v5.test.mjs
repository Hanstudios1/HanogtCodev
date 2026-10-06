// Hanogt Engine V5: schema v5 and the rules each project keeps.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const types = await load("lib/game-engine/types.ts");
const { normalizeProject } = await load("lib/game-engine/schema.ts");
const { createBlankProject } = await load("lib/game-engine/scene.ts");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

test("engine reports V5", () => {
    assert.equal(types.GAME_ENGINE_SCHEMA_VERSION, 5);
    assert.equal(types.ENGINE_VERSION, 5);
    assert.equal(types.ENGINE_VERSION_LABEL, "Hanogt Engine V5");
    assert.deepEqual(types.ENGINE_RULES, [3, 4, 5]);
});

test("new projects use V5 rules; V4 documents keep V4 rules", () => {
    const fresh = normalizeProject(createBlankProject("Yeni", "2d"));
    assert.equal(fresh.version, 5);
    assert.equal(fresh.settings.rules, 5);

    const v4 = JSON.parse(JSON.stringify(fresh));
    v4.version = 4;
    v4.settings.rules = 4;
    const migrated = normalizeProject(v4);
    assert.equal(migrated.version, 5);
    assert.equal(migrated.settings.rules, 4, "a V4 game keeps playing by V4 rules");
    assert.equal(normalizeProject(JSON.parse(JSON.stringify(migrated))).settings.rules, 4, "saving and loading keeps them");

    // Without valid rules a document gets those of the engine that saved it.
    delete v4.settings.rules;
    assert.equal(normalizeProject(v4).settings.rules, 4);
    assert.equal(normalizeProject({ ...fresh, settings: { ...fresh.settings, rules: 9 } }).settings.rules, 5);
});
