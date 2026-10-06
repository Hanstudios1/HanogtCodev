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
const mathModule = await load("lib/game-engine/math.ts");

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

// ---------------------------------------------------------------------------
// Character Controller 2D
// ---------------------------------------------------------------------------

const C = await load("lib/game-engine/components.ts");
const { cloneEntitiesWithNewIds } = await load("lib/game-engine/scene.ts");

const objectOf = (id, name, components, tag = "Untagged") => ({ id, name, tag, parentId: null, active: true, components });
const block = (name, x, y, width, height, rotation = 0, extra = []) => objectOf(`entity_${name.toLowerCase()}`, name, [
    C.createTransform({ position: { x, y, z: 0 }, rotation: { x: 0, y: 0, z: rotation }, scale: { x: width, y: height, z: 1 } }),
    C.createSpriteRenderer(),
    C.createCollider(),
    ...extra,
]);

/** A 2D scene with the default camera, the given blocks and a player with a Character Controller 2D. */
function platformer(objects, { at = { x: 0, y: 0.2 }, controller = {}, scripts = [], mutate } = {}) {
    const project = createBlankProject("CC", "2d");
    const scene = project.scenes[0];
    scene.objects = scene.objects.filter((item) => item.components.some((component) => component.type === "camera"));
    scene.objects.push(...objects);
    project.scripts = scripts.map((script, index) => ({ id: `script_cc${index}`, name: script.name, language: "csharp", content: script.content }));
    scene.objects.push(objectOf("entity_player", "Player", [
        C.createTransform({ position: { x: at.x, y: at.y, z: 0 } }),
        C.createSpriteRenderer(),
        C.createRigidBody({ freezePosition: { x: false, y: false, z: true } }),
        C.createCollider({ size: { x: 0.8, y: 1, z: 1 } }),
        C.createCharacterController2D(controller),
        ...scripts.map((script, index) => createScriptComponent(`script_cc${index}`, script.name.replace(/\.cs$/, ""))),
    ], "Player"));
    mutate?.(project);
    return project;
}

test("Character Controller 2D runs at its top speed, stops, and jumps to its jump height (shorter when tapped)", () => {
    const game = startWorld(platformer([block("Ground", 0, -1, 40, 1)]));
    const player = game.find("Player");
    game.step(30);
    assert.equal(player.motor.grounded, true);
    game.hold("D", true);
    game.step(60);
    assert.ok(Math.abs(player.body.velocity.x - 7) < 0.05, `top speed ${player.body.velocity.x}`);
    assert.equal(player.components.find((component) => component.type === "spriteRenderer").flipX, false);
    game.hold("D", false);
    game.hold("A", true);
    game.step(30);
    assert.equal(player.components.find((component) => component.type === "spriteRenderer").flipX, true, "the sprite faces left");
    game.hold("A", false);
    game.step(30);
    assert.equal(player.body.velocity.x, 0);

    const apex = (holdFrames) => {
        const start = player.world.position.y;
        let top = start;
        game.hold("Space", true);
        for (let frame = 0; frame < 90; frame += 1) {
            if (frame === holdFrames) game.hold("Space", false);
            game.step(1);
            top = Math.max(top, player.world.position.y);
        }
        game.hold("Space", false);
        game.step(30);
        return top - start;
    };
    const full = apex(90);
    assert.ok(full > 2.8 && full < 3.2, `full jump ${full}`);
    const tap = apex(1);
    assert.ok(tap < full * 0.4, `a tapped jump is shorter (${tap})`);
    assert.deepEqual(game.problems(), []);
});

test("coyote time, the jump buffer and double jumps", () => {
    // Coyote time: a jump a few frames after running off a ledge still works; much later it doesn't.
    for (const [wait, jumps] of [[3, true], [20, false]]) {
        const game = startWorld(platformer([block("Ledge", -8, -1, 20, 1)]));
        const player = game.find("Player");
        game.step(30);
        game.hold("D", true);
        for (let frame = 0; frame < 300 && player.motor.grounded; frame += 1) game.step(1);
        game.hold("D", false);
        game.step(wait);
        game.hold("Space", true);
        game.step(1);
        assert.equal(player.body.velocity.y > 0, jumps, `jump ${wait} frames after leaving the ledge`);
    }

    // Jump buffer (0.12 s): a press 4 frames before landing jumps on landing; 12 frames before doesn't.
    const drop = () => startWorld(platformer([block("Ground", 0, -1, 40, 1)], { at: { x: 0, y: 3 } }));
    const probe = drop();
    let landing = 0;
    for (let frame = 1; frame < 200 && !landing; frame += 1) {
        probe.step(1);
        if (probe.find("Player").motor?.grounded) landing = frame;
    }
    for (const [early, jumps] of [[4, true], [12, false]]) {
        const game = drop();
        const player = game.find("Player");
        game.step(landing - early - 1);
        game.hold("Space", true);
        game.step(1);
        game.hold("Space", false);
        let rising = false;
        for (let frame = 0; frame < early + 10; frame += 1) {
            game.step(1);
            if (player.body.velocity.y > 1) rising = true;
        }
        assert.equal(rising, jumps, `pressed ${early} frames before landing`);
    }

    // Double jump.
    const game = startWorld(platformer([block("Ground", 0, -1, 40, 1)], { controller: { maxJumps: 2 } }));
    const player = game.find("Player");
    game.step(30);
    game.press("Space");
    game.step(14);
    game.press("Space");
    assert.ok(player.body.velocity.y > 2, "the second jump works in the air");
    assert.equal(player.motor.jumpsLeft, 0);
    game.step(5);
    const before = player.body.velocity.y;
    game.press("Space");
    assert.ok(player.body.velocity.y < before, "a third press does nothing");
});

test("slopes, moving platforms and walls: no bouncing downhill, carried by platforms, no sticking to walls", () => {
    const ramp = startWorld(platformer([block("Ramp", 0, 0, 14, 1, -20)], { at: { x: -4.5, y: 2.6 } }));
    const player = ramp.find("Player");
    ramp.step(40);
    assert.equal(player.motor.grounded, true);
    const walk = (key, done) => {
        ramp.hold(key, true);
        let grounded = 0;
        let frames = 0;
        while (!done() && frames < 200) {
            ramp.step(1);
            frames += 1;
            if (player.motor.grounded) grounded += 1;
        }
        ramp.hold(key, false);
        return grounded / frames;
    };
    assert.equal(walk("D", () => player.world.position.x > 4), 1, "stays on the ground walking downhill");
    assert.equal(walk("A", () => player.world.position.x < -4), 1, "stays on the ground walking uphill");
    ramp.step(30);
    const x = player.world.position.x;
    ramp.step(120);
    assert.ok(Math.abs(player.world.position.x - x) < 0.02, `doesn't slide down when idle (${player.world.position.x - x})`);

    const platform = block("Platform", 0, -1, 4, 1, 0, [C.createRigidBody({ bodyType: "kinematic", velocity: { x: 2, y: 0, z: 0 }, useGravity: false })]);
    const ride = startWorld(platformer([platform]));
    const rider = ride.find("Player");
    ride.step(20);
    const offset = rider.world.position.x - ride.find("Platform").world.position.x;
    ride.step(60);
    assert.ok(Math.abs(rider.world.position.x - ride.find("Platform").world.position.x - offset) < 0.05, "rides along with the platform");

    const airtime = (wall) => {
        const game = startWorld(platformer(wall ? [block("Ground", 0, -1, 40, 1), block("Wall", 1, 3, 0.6, 8)] : [block("Ground", 0, -1, 40, 1)]));
        const body = game.find("Player");
        game.step(30);
        game.hold("Space", true);
        game.hold("D", true);
        game.step(2);
        let frames = 0;
        while (!body.motor.grounded && frames < 400) {
            game.step(1);
            frames += 1;
        }
        return frames;
    };
    assert.equal(airtime(true), airtime(false), "pushing into a wall doesn't slow the fall");
});

test("scripts drive the controller with Move/Jump, hear OnJump and OnLand, and their own CharacterController2D class wins", () => {
    const driver = {
        name: "Driver.cs",
        content: `using UnityEngine;
public class Driver : MonoBehaviour
{
    CharacterController2D controller;
    int frames;
    void Start() { controller = GetComponent<CharacterController2D>(); }
    void Update()
    {
        frames++;
        controller.Move(1f);
        if (frames == 40) controller.Jump();
    }
    void OnJump() { Debug.Log("jump, jumps left " + controller.jumpsLeft); }
    void OnLand(float speed) { Debug.Log("land " + (speed > 3f)); }
}`,
    };
    // Standing exactly on the ground, so the only landing is the one after the jump.
    const game = startWorld(platformer([block("Ground", 0, -1, 40, 1)], { at: { x: 0, y: 0 }, controller: { useInput: false }, scripts: [driver] }));
    game.step(150);
    const player = game.find("Player");
    assert.ok(player.world.position.x > 10, `moved by Move(1f): ${player.world.position.x}`);
    assert.deepEqual(game.messages("info"), ["jump, jumps left 0", "land True"]);
    assert.deepEqual(game.problems(), []);

    // A project that wrote its own CharacterController2D keeps using it.
    const own = {
        name: "CharacterController2D.cs",
        content: `using UnityEngine;
public class CharacterController2D : MonoBehaviour
{
    public void Move(float move, bool crouch, bool jump) { Debug.Log("own Move " + move); }
}`,
    };
    const user = {
        name: "PlayerMovement.cs",
        content: `using UnityEngine;
public class PlayerMovement : MonoBehaviour
{
    void Start() { GetComponent<CharacterController2D>().Move(0.5f, false, false); }
}`,
    };
    const legacy = startWorld(platformer([block("Ground", 0, -1, 40, 1)], {
        scripts: [own, user],
        mutate: (project) => {
            const player = project.scenes[0].objects.find((item) => item.name === "Player");
            player.components = player.components.filter((component) => component.type !== "characterController2D");
        },
    }));
    legacy.step(2);
    assert.deepEqual(legacy.messages("info"), ["own Move 0.5"]);
    assert.deepEqual(legacy.problems(), []);
});

test("Character Controller 2D settings are clamped and warn when the body is missing", () => {
    const project = platformer([block("Ground", 0, -1, 40, 1)], {
        controller: { moveSpeed: 9999, maxJumps: 99, airControl: 4, horizontalAction: "1 bad", jumpAction: "Dash" },
        mutate: (draft) => {
            const player = draft.scenes[0].objects.find((item) => item.name === "Player");
            player.components = player.components.filter((component) => component.type !== "rigidBody");
        },
    });
    const normalized = normalizeProject(project);
    const controller = normalized.scenes[0].objects.find((item) => item.name === "Player").components.find((component) => component.type === "characterController2D");
    assert.deepEqual([controller.moveSpeed, controller.maxJumps, controller.airControl, controller.horizontalAction, controller.jumpAction], [200, 10, 1, "Horizontal", "Dash"]);
    const game = startWorld(project);
    game.step(5);
    assert.equal(game.problems().filter((message) => message.includes("Character Controller 2D")).length, 1);
});

// ---------------------------------------------------------------------------
// Camera Follow and Camera.Shake
// ---------------------------------------------------------------------------

/** 2D scene with a camera that has Camera Follow and a plain target tagged Player. */
function followScene(follow = {}, { dimension = "2d", script } = {}) {
    const project = createBlankProject("Follow", dimension);
    const scene = project.scenes[0];
    const camera = scene.objects.find((item) => item.components.some((component) => component.type === "camera"));
    camera.components.push(C.createCameraFollow(follow, dimension));
    scene.objects = [camera, objectOf("entity_target", "Hero", [C.createTransform(), C.createSpriteRenderer()], "Player")];
    if (script) {
        project.scripts = [{ id: "script_follow", name: "Shaker.cs", language: "csharp", content: script }];
        scene.objects[1].components.push(createScriptComponent("script_follow", "Shaker"));
    }
    return project;
}

test("Camera Follow snaps to the target, keeps a dead zone, eases, leads and stays inside its bounds", () => {
    const game = startWorld(followScene({ smoothTime: 0, lookAhead: 0, deadZone: { x: 2, y: 2 } }));
    const camera = game.find("Main Camera") ?? [...game.world.entities.values()].find((item) => item.cameraFollow);
    const hero = game.find("Hero");
    const z = camera.world.position.z;
    game.step(1);
    assert.deepEqual([camera.world.position.x, camera.world.position.y, camera.world.position.z], [0, 1, z], "starts on the target plus the offset and keeps its Z");
    hero.setWorldPosition({ x: 0.8, y: -0.5, z: 0 });
    game.step(1);
    assert.deepEqual([camera.world.position.x, camera.world.position.y], [0, 1], "inside the dead zone the camera stays");
    hero.setWorldPosition({ x: 4, y: 0, z: 0 });
    game.step(1);
    assert.ok(Math.abs(camera.world.position.x - 3) < 1e-9, "outside it the camera moves just enough");

    const smooth = startWorld(followScene({ smoothTime: 0.3, lookAhead: 0, deadZone: { x: 0, y: 0 } }));
    const smoothCamera = [...smooth.world.entities.values()].find((item) => item.cameraFollow);
    smooth.step(1);
    smooth.find("Hero").setWorldPosition({ x: 10, y: 0, z: 0 });
    smooth.step(1);
    assert.ok(smoothCamera.world.position.x > 0 && smoothCamera.world.position.x < 3, "eases towards the target");
    smooth.step(120);
    assert.ok(Math.abs(smoothCamera.world.position.x - 10) < 0.01, "and arrives");

    const lead = startWorld(followScene({ smoothTime: 0, lookAhead: 2, deadZone: { x: 0, y: 0 } }));
    const leadCamera = [...lead.world.entities.values()].find((item) => item.cameraFollow);
    const runner = lead.find("Hero");
    for (let frame = 0; frame < 120; frame += 1) {
        runner.setWorldPosition({ x: frame * 0.1, y: 0, z: 0 });
        lead.step(1);
    }
    assert.ok(Math.abs(leadCamera.world.position.x - runner.world.position.x - 2) < 0.05, "leads by lookAhead in the direction of travel");

    const bounded = startWorld(followScene({ smoothTime: 0, lookAhead: 0, useBounds: true, boundsMin: { x: -10, y: -5 }, boundsMax: { x: 10, y: 5 } }));
    const boundedCamera = [...bounded.world.entities.values()].find((item) => item.cameraFollow);
    const halfWidth = boundedCamera.components.find((component) => component.type === "camera").orthographicSize * (960 / 540);
    bounded.find("Hero").setWorldPosition({ x: 50, y: 50, z: 0 });
    bounded.step(1);
    assert.ok(Math.abs(boundedCamera.world.position.x - (10 - halfWidth)) < 1e-9, "the view's right edge stops at the bounds");
    assert.deepEqual(bounded.problems(), []);
});

test("Camera Follow in 3D looks at its target; Camera.Shake moves only the rendered camera and fades out", () => {
    const game = startWorld(followScene({ smoothTime: 0 }, { dimension: "3d" }));
    const camera = [...game.world.entities.values()].find((item) => item.cameraFollow);
    game.find("Hero").setWorldPosition({ x: 5, y: 0, z: 5 });
    game.step(1);
    assert.deepEqual([camera.world.position.x, camera.world.position.y, camera.world.position.z], [5, 4, -4]);
    const { rotateVec3 } = mathModule;
    const forward = rotateVec3(camera.world.rotation, { x: 0, y: 0, z: 1 });
    const toTarget = { x: 0, y: -4, z: 9 };
    const length = Math.hypot(toTarget.x, toTarget.y, toTarget.z);
    assert.ok(Math.abs(forward.x * toTarget.x / length + forward.y * toTarget.y / length + forward.z * toTarget.z / length - 1) < 1e-6, "the camera faces the target");

    const shaking = startWorld(followScene({ smoothTime: 0, lookAhead: 0 }, {
        script: `using UnityEngine;
public class Shaker : MonoBehaviour
{
    void Start() { Camera.Shake(0.5f, 0.25f); Camera.main.Shake(0.2f, 0.1f); }
}`,
    }));
    const shakeCamera = [...shaking.world.entities.values()].find((item) => item.cameraFollow);
    shaking.step(3);
    const offset = shaking.world.cameraShakeOffset();
    assert.ok(offset && (Math.abs(offset.x) > 0.001 || Math.abs(offset.y) > 0.001), "shaking");
    assert.deepEqual([shakeCamera.world.position.x, shakeCamera.world.position.y], [0, 1], "the camera object itself doesn't move");
    shaking.step(20);
    assert.equal(shaking.world.cameraShakeOffset(), null, "the shake is over after its duration");
    assert.deepEqual(shaking.problems(), []);
});

test("Camera Follow targets follow duplicated objects and are validated", () => {
    const camera = objectOf("entity_cam", "Cam", [C.createTransform(), C.createCamera(), C.createCameraFollow({ targetId: "entity_hero" })]);
    const hero = objectOf("entity_hero", "Hero", [C.createTransform()]);
    hero.parentId = null;
    camera.parentId = null;
    const [cameraCopy, heroCopy] = cloneEntitiesWithNewIds([camera, hero]);
    assert.equal(cameraCopy.components.find((component) => component.type === "cameraFollow").targetId, heroCopy.id);
    const outside = cloneEntitiesWithNewIds([camera]);
    assert.equal(outside[0].components.find((component) => component.type === "cameraFollow").targetId, "entity_hero", "a target outside the copy stays");

    const project = followScene({ smoothTime: 99, lookAhead: -3, offset: { x: 1e9, y: 0, z: 0 } });
    const normalized = normalizeProject(project);
    const follow = normalized.scenes[0].objects[0].components.find((component) => component.type === "cameraFollow");
    assert.deepEqual([follow.smoothTime, follow.lookAhead, follow.offset.x], [5, 0, 10_000]);
});

// ---------------------------------------------------------------------------
// Path finding and Nav Agent 2D
// ---------------------------------------------------------------------------

const { NavGrid, pathLength } = await load("lib/game-engine/runtime/pathfinding.ts");

test("NavGrid: A* goes around walls through gaps, never cuts corners, and reports unreachable goals", () => {
    const wall = (x, y, width, height, angle = 0) => ({ kind: "box", x, y, halfX: width / 2, halfY: height / 2, angle, radius: 0 });
    const bounds = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
    // A wall with a gap at the top: the path climbs over it, keeping the agent's radius from the wall.
    const gap = new NavGrid([wall(0, -2, 0.2, 16)], { cellSize: 0.5, radius: 0.3, bounds }).findPath({ x: -5, y: 0 }, { x: 5, y: 0 });
    assert.equal(gap.complete, true);
    assert.deepEqual(gap.points[0], { x: -5, y: 0 });
    assert.deepEqual(gap.points.at(-1), { x: 5, y: 0 });
    assert.ok(gap.points.some((point) => point.y > 6.3), "goes over the top of the wall");
    assert.ok(gap.points.length <= 5, `shortened to its corners (${gap.points.length})`);

    // A wall thinner than a cell still blocks; partial paths stop at the closest reachable point.
    const sealed = new NavGrid([wall(0, 0, 0.1, 30)], { cellSize: 0.5, radius: 0, bounds });
    assert.equal(sealed.findPath({ x: -5, y: 0 }, { x: 5, y: 0 }), null);
    const partial = sealed.findPath({ x: -5, y: 0 }, { x: 5, y: 0 }, true);
    assert.equal(partial.complete, false);
    assert.ok(partial.points.at(-1).x < 0 && partial.points.at(-1).x > -1);

    // Two blocks touching at a corner: no squeezing diagonally between them.
    const pinch = new NavGrid([wall(-0.5, 0.5, 1, 1), wall(0.5, -0.5, 1, 1)], { cellSize: 0.5, radius: 0, bounds: { minX: -3, minY: -3, maxX: 3, maxY: 3 } });
    const around = pinch.findPath({ x: -1.5, y: -1.5 }, { x: 1.5, y: 1.5 });
    assert.ok(pathLength(around.points) > Math.hypot(3, 3) + 0.5, "goes around the pinch");

    // Open ground is a straight line; rotated walls block along their length.
    assert.equal(new NavGrid([wall(8, 8, 1, 1)], { cellSize: 0.5, radius: 0.3, bounds }).findPath({ x: -5, y: -3 }, { x: 4, y: 2 }).points.length, 2);
    const rotated = new NavGrid([wall(0, 0, 8, 0.4, Math.PI / 4)], { cellSize: 0.5, radius: 0.2, bounds });
    assert.ok(pathLength(rotated.findPath({ x: -3, y: 3 }, { x: 3, y: -3 }).points) > Math.hypot(6, 6) + 1);
    assert.equal(rotated.isWalkable({ x: 0, y: 0 }), false);
    assert.equal(rotated.isWalkable({ x: 3, y: -3 }), true);
});

/** A 2D maze: a tilemap with walls and a solid block collider; the hero is the target. */
function mazeProject({ agent = {}, script, agentBody = false } = {}) {
    const project = createBlankProject("Maze", "2d");
    const scene = project.scenes[0];
    scene.settings.physics.gravity = { x: 0, y: 0, z: 0 };
    const camera = scene.objects.find((item) => item.components.some((component) => component.type === "camera"));
    const rows = [
        "############",
        "#..........#",
        "#.########.#",
        "#.#......#.#",
        "#.#.####.#.#",
        "#...#..#...#",
        "######.#####",
    ];
    const tilemap = C.createTilemap({ rows, palette: [{ key: "#", name: "Wall", color: "#334155", solid: true, frame: -1 }], origin: { x: 0, y: 0 } });
    scene.objects = [
        camera,
        objectOf("entity_maze", "Maze", [C.createTransform(), tilemap]),
        objectOf("entity_hero", "Hero", [C.createTransform({ position: { x: 6.5, y: 3.5, z: 0 } }), C.createSpriteRenderer()], "Player"),
        objectOf("entity_goblin", "Goblin", [
            C.createTransform({ position: { x: 1.5, y: 1.5, z: 0 } }),
            C.createSpriteRenderer(),
            ...(agentBody ? [C.createRigidBody({ useGravity: false, freezePosition: { x: false, y: false, z: true } }), C.createCollider({ shape: "circle", radius: 0.3 })] : []),
            C.createNavAgent2D({ targetId: "entity_hero", speed: 4, ...agent }),
        ]),
    ];
    if (script) {
        project.scripts = [{ id: "script_nav", name: `${script.name}.cs`, language: "csharp", content: script.content }];
        scene.objects.find((item) => item.name === script.on).components.push(createScriptComponent("script_nav", script.name));
    }
    return project;
}

test("Nav Agent 2D chases its target through a tilemap maze without entering walls and says when it arrives", () => {
    const game = startWorld(mazeProject({
        script: {
            name: "Goblin",
            on: "Goblin",
            content: `using UnityEngine;
public class Goblin : MonoBehaviour
{
    void OnDestinationReached() { Debug.Log("caught at " + Time.frameCount); }
}`,
        },
    }));
    const goblin = game.find("Goblin");
    const maze = game.find("Maze").tilemap;
    const solidAt = (x, y) => {
        const column = Math.floor(x);
        const row = maze.rows.length - 1 - Math.floor(y);
        return maze.rows[row]?.[column] === "#";
    };
    let worst = 0;
    for (let frame = 0; frame < 600 && !game.messages("info").length; frame += 1) {
        game.step(1);
        const { x, y } = goblin.world.position;
        if (solidAt(x, y)) worst += 1;
    }
    assert.equal(worst, 0, "never stands inside a wall tile");
    assert.equal(game.messages("info").length, 1, "OnDestinationReached ran once");
    const hero = game.find("Hero").world.position;
    assert.ok(Math.hypot(goblin.world.position.x - hero.x, goblin.world.position.y - hero.y) <= 0.11);
    const handle = game.world.componentHandle(goblin, goblin.navAgent);
    assert.equal(handle.get("pathStatus"), "PathComplete");
    assert.deepEqual(game.problems(), []);
});

test("scripts use Pathfinding.FindPath and SetDestination; agents with a body move by velocity; walls removed at runtime reopen the way", () => {
    const game = startWorld(mazeProject({
        agent: { targetId: null },
        agentBody: true,
        script: {
            name: "Director",
            on: "Hero",
            content: `using UnityEngine;
using System.Collections.Generic;
public class Director : MonoBehaviour
{
    public NavAgent2D goblin;
    void Start()
    {
        List<Vector2> path = Pathfinding.FindPath(new Vector2(1.5f, 1.5f), new Vector2(6.5f, 3.5f));
        Debug.Log("corners " + path.Count + " walkable " + Pathfinding.IsWalkable(new Vector2(0.5f, 0.5f)) + " " + Pathfinding.IsWalkable(new Vector2(1.5f, 1.5f)));
        List<Vector2> none = Pathfinding.FindPath(new Vector2(1.5f, 1.5f), new Vector2(5.5f, 1.5f));
        Debug.Log("sealed " + none.Count + " " + Pathfinding.HasPath(new Vector2(1.5f, 1.5f), new Vector2(5.5f, 1.5f)));
        goblin = GameObject.Find("Goblin").GetComponent<NavAgent2D>();
        goblin.SetDestination(new Vector2(10.5f, 5.5f));
    }
}`,
        },
    }));
    game.step(1);
    const [corners, sealed] = game.messages("info");
    assert.match(corners, /^corners [4-9] walkable False True$/);
    assert.equal(sealed, "sealed 0 False", "the room inside the walls can't be reached");
    const goblin = game.find("Goblin");
    game.step(10);
    assert.ok(Math.hypot(goblin.body.velocity.x, goblin.body.velocity.y) > 3.9, "moves by setting its body's velocity");
    const handle = game.world.componentHandle(goblin, goblin.navAgent);
    const remaining = handle.get("remainingDistance");
    game.step(30);
    assert.ok(handle.get("remainingDistance") < remaining - 1);
    handle.call("Stop", [], []);
    game.step(2);
    const stopped = { ...goblin.world.position };
    game.step(10);
    assert.deepEqual(goblin.world.position, stopped);
    assert.equal(handle.get("isStopped"), true);
    handle.call("Resume", [], []);
    game.step(240);
    assert.ok(Math.hypot(goblin.world.position.x - 10.5, goblin.world.position.y - 5.5) < 0.2, "arrives");

    // Opening the sealed room at runtime: the cached grid notices the tile change.
    const maze = game.find("Maze");
    const tilemapHandle = game.world.componentHandle(maze, maze.tilemap);
    assert.equal(game.world.findPath({ x: 1.5, y: 1.5 }, { x: 5.5, y: 1.5 }, 0.25, false).status, "invalid");
    tilemapHandle.call("SetTile", [7, 1, null], []);
    assert.equal(game.world.findPath({ x: 1.5, y: 1.5 }, { x: 5.5, y: 1.5 }, 0.25, false).status, "complete");
    assert.deepEqual(game.problems(), []);
});

test("Nav Agent 2D settings are clamped, targets follow copies, and 3D falls back to straight paths with a warning", () => {
    const project = mazeProject({ agent: { speed: 999, radius: -1, repathInterval: 0 } });
    const agent = normalizeProject(project).scenes[0].objects.find((item) => item.name === "Goblin").components.find((component) => component.type === "navAgent2D");
    assert.deepEqual([agent.speed, agent.radius, agent.repathInterval], [200, 0, 0.05]);
    const hero = objectOf("entity_a", "A", [C.createTransform()]);
    const chaser = objectOf("entity_b", "B", [C.createTransform(), C.createNavAgent2D({ targetId: "entity_a" })]);
    const [heroCopy, chaserCopy] = cloneEntitiesWithNewIds([hero, chaser]);
    assert.equal(chaserCopy.components.find((component) => component.type === "navAgent2D").targetId, heroCopy.id);

    const flat = createBlankProject("3D", "3d");
    const game = startWorld(flat);
    const result = game.world.findPath({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, 0.3, false);
    assert.equal(result.points.length, 2);
    assert.equal(game.problems().filter((message) => message.includes("2D")).length, 1);
});
