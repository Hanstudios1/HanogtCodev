// Hanogt Engine V4: schema v4 and V3 rules, input actions and gamepads.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";
import { startWorld } from "./engine-helpers.mjs";

const types = await load("lib/game-engine/types.ts");
const { normalizeProject } = await load("lib/game-engine/schema.ts");
const { createBlankProject } = await load("lib/game-engine/scene.ts");
const { createScriptComponent, createTransform } = await load("lib/game-engine/components.ts");
const { defaultInputSettings, normalizeInputSettings } = await load("lib/game-engine/input-actions.ts");

function projectWithScript(name, content, mutate) {
    const project = createBlankProject("V4", "2d");
    project.scripts = [{ id: "script_v4test", name, language: name.endsWith(".cpp") ? "cpp" : "csharp", content }];
    project.scenes[0].objects.push({
        id: "entity_v4test",
        name: "Probe",
        tag: "Untagged",
        parentId: null,
        active: true,
        components: [createTransform(), createScriptComponent("script_v4test", name.replace(/\.(cs|cpp)$/, ""))],
    });
    mutate?.(project);
    return project;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

test("engine reports V4", () => {
    assert.equal(types.GAME_ENGINE_SCHEMA_VERSION, 4);
    assert.equal(types.ENGINE_VERSION, 4);
    assert.equal(types.ENGINE_VERSION_LABEL, "Hanogt Engine V4");
});

test("new projects use V4 rules; v3 documents keep V3 rules and get the default input actions", () => {
    const fresh = normalizeProject(createBlankProject("Yeni", "2d"));
    assert.equal(fresh.version, 4);
    assert.equal(fresh.settings.rules, 4);
    assert.deepEqual(fresh.settings.input, defaultInputSettings());

    const v3 = JSON.parse(JSON.stringify(fresh));
    v3.version = 3;
    delete v3.settings.rules;
    delete v3.settings.input;
    const migrated = normalizeProject(v3);
    assert.equal(migrated.version, 4);
    assert.equal(migrated.settings.rules, 3);
    assert.deepEqual(migrated.settings.input, defaultInputSettings());
    // Saving and loading again keeps the rules it was given.
    assert.equal(normalizeProject(JSON.parse(JSON.stringify(migrated))).settings.rules, 3);
});

test("input actions are validated: bad names, duplicates and unknown bindings are dropped", () => {
    const settings = normalizeInputSettings({
        deadZone: 5,
        actions: [
            { name: "Dash", kind: "button", positive: ["LeftShift", "Nope", "LeftShift"], gamepadPositive: ["RB", "Turbo"] },
            { name: "dash", kind: "button", positive: ["E"] },
            { name: "1bad", kind: "button", positive: ["Q"] },
            { name: "Steer", kind: "axis", positive: ["L"], negative: ["J"], gamepadAxis: "RightStickX", invert: true, gamepadPositive: ["DpadRight"] },
            { name: "Fire", kind: "button", negative: ["X"], gamepadAxis: "LeftStickX", invert: true },
            { name: "__proto__", kind: "button" },
            "junk",
        ],
    });
    assert.equal(settings.deadZone, 0.9);
    assert.deepEqual(settings.actions.map((action) => action.name), ["Dash", "Steer", "Fire"]);
    assert.deepEqual(settings.actions[0].positive, ["LeftShift"]);
    assert.deepEqual(settings.actions[0].gamepadPositive, ["RB"]);
    assert.equal(settings.actions[1].gamepadAxis, "RightStickX");
    assert.equal(settings.actions[1].invert, true);
    // Buttons have no negative side and no stick.
    assert.deepEqual([settings.actions[2].negative, settings.actions[2].gamepadAxis, settings.actions[2].invert], [[], null, false]);
    const many = normalizeInputSettings({ actions: Array.from({ length: 50 }, (_, index) => ({ name: `A${index}`, kind: "button" })) });
    assert.equal(many.actions.length, 32);
    assert.deepEqual(normalizeInputSettings(null), defaultInputSettings());
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const INPUT_PROBE = `using UnityEngine;
public class Probe : MonoBehaviour
{
    void Update()
    {
        Debug.Log("h " + Input.GetAxis("Horizontal").ToString("0.00") + " raw " + Input.GetAxisRaw("Horizontal").ToString("0.00")
            + " v " + Input.GetAxisRaw("Vertical").ToString("0.00")
            + " jump " + Input.GetButton("Jump") + " down " + Input.GetButtonDown("Jump")
            + " dash " + Input.GetButtonDown("Dash") + " key " + Input.GetButton("Q")
            + " pads " + Input.GetJoystickNames().Length);
    }
}`;

test("gamepad sticks, dead zone, inverted Y, d-pad and button edges drive the actions", () => {
    const game = startWorld(projectWithScript("Probe.cs", INPUT_PROBE, (project) => {
        project.settings.input.actions.push({ name: "Dash", kind: "button", positive: ["LeftShift"], negative: [], gamepadPositive: ["RB"], gamepadNegative: [], gamepadAxis: null, invert: false });
    }));
    const input = game.world.input;
    const last = () => game.messages("info").at(-1);
    game.step(1);
    assert.equal(last(), "h 0.00 raw 0.00 v 0.00 jump False down False dash False key False pads 0");

    // A stick inside the dead zone counts as zero; past it, the value is rescaled.
    input.setVirtualGamepad({ axes: [0.15, 0, 0, 0] });
    game.step(1);
    assert.match(last(), /^h 0\.00 raw 0\.00 /);
    input.setVirtualGamepad({ axes: [0.6, -1, 0, 0] });
    game.step(1);
    assert.match(last(), /^h 0\.50 raw 0\.50 v 1\.00 /, "stick X 0.6 → 0.5 after the 0.2 dead zone; stick up (−1) is +1 vertical");

    // The A button: held and pressed on the first frame only.
    input.setVirtualGamepad({ buttons: ["A"] });
    game.step(1);
    assert.match(last(), /jump True down True dash False key False pads 1$/);
    game.step(1);
    assert.match(last(), /jump True down False/);
    input.setVirtualGamepad({ buttons: ["RB", "DpadLeft"] });
    game.step(1);
    assert.match(last(), /^h -?\d\.\d\d raw -1\.00 .*dash True/, "d-pad left pushes Horizontal to −1, RB presses the custom Dash action");

    // Keyboard keeps working; a name that isn't an action reads that key.
    input.setVirtualGamepad(null);
    game.hold("Q", true);
    game.hold("D", true);
    game.step(30);
    assert.match(last(), /^h 1\.00 raw 1\.00 .*key True pads 0$/);
    assert.deepEqual(game.problems(), []);
});

test("keyboard axes ease in and out (Unity sensitivity and gravity 3) while sticks are immediate", () => {
    const game = startWorld(projectWithScript("Probe.cs", INPUT_PROBE));
    const last = () => game.messages("info").at(-1);
    game.hold("D", true);
    game.step(6);
    const eased = Number(/^h (\S+)/.exec(last())[1]);
    assert.ok(eased > 0.2 && eased < 0.4, `after 0.1 s the axis is ${eased}`);
    game.hold("D", false);
    game.world.input.setVirtualGamepad({ axes: [-1, 0, 0, 0] });
    game.step(1);
    assert.match(last(), /^h -1\.00 raw -1\.00/);
});

test("touch buttons press the matching gamepad buttons, so rebound actions still answer them", () => {
    const game = startWorld(projectWithScript("Probe.cs", INPUT_PROBE, (project) => {
        const jump = project.settings.input.actions.find((action) => action.name === "Jump");
        jump.positive = ["K"];
    }));
    const last = () => game.messages("info").at(-1);
    game.world.input.setVirtualKey("Space", true);
    game.step(1);
    assert.match(last(), /jump True down True/, "Jump is bound to K and pad A; the touch A button presses Space and pad A");
    assert.match(last(), /pads 0$/, "touch buttons are not a connected gamepad");
    game.world.input.setVirtualKey("Space", false);
    game.step(1);
    assert.match(last(), /jump False/);
});
