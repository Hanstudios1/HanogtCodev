// The first-game walkthrough of the engine docs (/game-engine/docs#ilk-oyun):
// builds the scene exactly as the steps describe, with the editor's own
// operations, and plays it with simulated keys. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { normalizeProject } = await load("lib/game-engine/schema.ts");
const { createBlankProject } = await load("lib/game-engine/scene.ts");
const { compileScripts } = await load("lib/game-engine/script/compiler.ts");
const { RuntimeWorld } = await load("lib/game-engine/runtime/world.ts");
const operations = await load("components/GameEngine/editor/operations.ts");
const { FIRST_GAME } = await load("components/GameEngine/docs/first-game.ts");

function memoryStorage() {
    const store = new Map();
    return { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
}

/** Steps 1–6 of the walkthrough in one language. */
function buildWalkthrough(language) {
    const project = createBlankProject(language === "tr" ? "İlk oyunum" : "My first game", "2d");
    const transformOf = (entity) => entity.components.find((component) => component.type === "transform");

    // Step 2: Create → Sprite (Square), renamed, plus Add component → Physics → Rigidbody 2D.
    const player = operations.addEntity(project, "sprite", { x: FIRST_GAME.player.x, y: FIRST_GAME.player.y, z: 0 });
    player.name = FIRST_GAME.scriptName[language];
    assert.ok(operations.addComponent(project, player.id, "rigidBody"), "the sprite takes a Rigidbody 2D");

    // Step 3: a wide square as the ground (its Collider 2D comes with the sprite).
    const ground = operations.addEntity(project, "sprite", { x: FIRST_GAME.ground.x, y: FIRST_GAME.ground.y, z: 0 });
    ground.name = "Ground";
    transformOf(ground).scale.x = FIRST_GAME.ground.scaleX;

    // Step 4: Add component → New script…, then the code from the docs replaces the template.
    const scriptId = operations.createScript(project, FIRST_GAME.scriptName[language], "csharp");
    const script = project.scripts.find((item) => item.id === scriptId);
    assert.equal(script.name, `${FIRST_GAME.scriptName[language]}.cs`);
    script.content = FIRST_GAME.script[language];
    operations.addScriptComponent(project, player.id, scriptId, FIRST_GAME.scriptName[language]);

    // Step 5: Create → Sprite (Circle), Is Trigger on, tag Coin; duplicated for every coin.
    for (const position of FIRST_GAME.coins) {
        const coin = operations.addEntity(project, "circleSprite", { x: position.x, y: position.y, z: 0 });
        coin.name = "Coin";
        coin.tag = "Coin";
        const collider = coin.components.find((component) => component.type === "collider");
        assert.ok(collider, "the circle sprite comes with a collider");
        collider.isTrigger = true;
    }
    return project;
}

function play(project) {
    const normalized = normalizeProject(JSON.parse(JSON.stringify(project)));
    const program = compileScripts(normalized.scripts);
    const errors = program.diagnostics.filter((item) => item.severity === "error");
    assert.deepEqual(errors.map((item) => `${item.line}: ${item.message}`), [], "the docs' script compiles");
    const logs = [];
    const world = new RuntimeWorld({
        project: normalized,
        program,
        sceneId: null,
        storage: memoryStorage(),
        getScreenSize: () => ({ width: 960, height: 540 }),
        onLog: (entry, updated) => {
            if (!updated) logs.push(entry);
        },
    });
    world.start();
    const step = (frames) => {
        for (let index = 0; index < frames; index += 1) world.step(1 / 60);
    };
    const all = (name) => [...world.entities.values()].filter((item) => item.name === name);
    const problems = () => logs.filter((entry) => entry.level === "error" || entry.level === "warning").map((entry) => entry.message);
    return { world, step, all, problems };
}

for (const language of ["tr", "en"]) {
    test(`first-game walkthrough (${language}): land, walk, jump and collect every coin`, () => {
        const { world, step, all, problems } = play(buildWalkthrough(language));
        const player = () => all(FIRST_GAME.scriptName[language])[0];

        // Falls onto the ground and stays there (ground top -2.5, half a player above it).
        step(90);
        assert.ok(Math.abs(player().world.position.y - -2) < 0.06, `player lands on the ground (y=${player().world.position.y})`);
        assert.equal(all("Coin").length, 3);

        // Walk left into the first coin.
        world.input.setVirtualKey("LeftArrow", true);
        step(50);
        world.input.setVirtualKey("LeftArrow", false);
        step(5);
        assert.equal(all("Coin").length, 2, "walking left collects the coin at x=-4");

        // Walk right into the second coin.
        world.input.setVirtualKey("RightArrow", true);
        step(80);
        world.input.setVirtualKey("RightArrow", false);
        step(5);
        assert.equal(all("Coin").length, 1, "walking right collects the coin at x=3");

        // The last coin floats above the ground: jump and drift right into it.
        const groundY = player().world.position.y;
        world.input.setVirtualKey("Space", true);
        step(1);
        world.input.setVirtualKey("Space", false);
        world.input.setVirtualKey("RightArrow", true);
        let peak = groundY;
        for (let frame = 0; frame < 40; frame += 1) {
            step(1);
            peak = Math.max(peak, player().world.position.y);
        }
        world.input.setVirtualKey("RightArrow", false);
        step(60);
        assert.ok(peak > groundY + 1.5, `Space jumps (peak ${peak.toFixed(2)})`);
        assert.equal(all("Coin").length, 0, "the floating coin is collected in the air");
        assert.ok(Math.abs(player().world.position.y - groundY) < 0.06, "and the player lands again");
        assert.deepEqual(problems(), []);
    });
}

test("every docs section is listed in the contents once and written in both languages; what's new links land on a section", async () => {
    const { readFile } = await import("node:fs/promises");
    const docs = await readFile(new URL("../../src/components/GameEngine/docs/EngineDocs.tsx", import.meta.url), "utf8");
    const listed = [...docs.matchAll(/\{ id: "([a-z0-9-]+)", tr: "/g)].map((match) => match[1]);
    assert.equal(new Set(listed).size, listed.length, "no section is listed twice");
    const written = [...docs.matchAll(/<Section id="([a-z0-9-]+)"/g)].map((match) => match[1]);
    for (const id of listed) assert.equal(written.filter((item) => item === id).length, 2, `'${id}' is written in Turkish and English`);
    for (const id of written) assert.ok(listed.includes(id), `'${id}' is in the contents`);
    const whatsNew = await load("components/GameEngine/whats-new.ts");
    for (const list of ["V5_FEATURES", "V4_FEATURES", "V3_FEATURES", "TEMPLATE_UPDATE"]) {
        for (const item of whatsNew[list]) assert.ok(listed.includes(item.section), `${list}: '${item.title.EN}' links to #${item.section}`);
    }
});
