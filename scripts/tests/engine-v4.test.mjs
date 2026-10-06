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

test("new projects use the newest rules; v3 documents keep V3 rules and get the default input actions", () => {
    const fresh = normalizeProject(createBlankProject("Yeni", "2d"));
    assert.equal(fresh.version, types.GAME_ENGINE_SCHEMA_VERSION);
    assert.equal(fresh.settings.rules, types.ENGINE_VERSION);
    assert.deepEqual(fresh.settings.input, defaultInputSettings());

    const v3 = JSON.parse(JSON.stringify(fresh));
    v3.version = 3;
    delete v3.settings.rules;
    delete v3.settings.input;
    const migrated = normalizeProject(v3);
    assert.equal(migrated.version, types.GAME_ENGINE_SCHEMA_VERSION);
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

// ---------------------------------------------------------------------------
// Joints
// ---------------------------------------------------------------------------

/** 2D scene with gravity and the given objects (no camera needed for physics). */
function physicsScene(objects, script) {
    const project = createBlankProject("Joints", "2d");
    const scene = project.scenes[0];
    scene.objects = scene.objects.filter((item) => item.components.some((component) => component.type === "camera"));
    scene.objects.push(...objects);
    if (script) {
        project.scripts = [{ id: "script_joint", name: `${script.name}.cs`, language: "csharp", content: script.content }];
        scene.objects.find((item) => item.name === script.on).components.push(createScriptComponent("script_joint", script.name));
    }
    return project;
}
const ball = (name, x, y, extra = []) => objectOf(`entity_${name.toLowerCase()}`, name, [
    C.createTransform({ position: { x, y, z: 0 } }),
    C.createSpriteRenderer({ shape: "circle" }),
    C.createRigidBody({ freezePosition: { x: false, y: false, z: true }, linearDamping: 0 }),
    C.createCollider({ shape: "circle", radius: 0.25 }),
    ...extra,
]);

test("distance joints swing like a pendulum and ropes only go taut", () => {
    const pendulum = startWorld(physicsScene([ball("Bob", 3, 0, [C.createJoint({ connectedAnchor: { x: 0, y: 0, z: 0 } })])]));
    const bob = pendulum.find("Bob");
    let worst = 0;
    let minX = Infinity;
    for (let frame = 0; frame < 180; frame += 1) {
        pendulum.step(1);
        const { x, y } = bob.world.position;
        worst = Math.max(worst, Math.abs(Math.hypot(x, y) - 3));
        minX = Math.min(minX, x);
    }
    assert.ok(worst < 0.06, `keeps its length (off by ${worst.toFixed(3)})`);
    assert.ok(minX < -2, `swings to the other side (${minX.toFixed(2)})`);

    // A 3-unit rope from a point 1 unit above: free fall first, then it holds at 3.
    const rope = startWorld(physicsScene([ball("Weight", 0, -1, [C.createJoint({ connectedAnchor: { x: 0, y: 0, z: 0 }, autoDistance: false, distance: 3, maxDistanceOnly: true })])]));
    const weight = rope.find("Weight");
    rope.step(20);
    assert.ok(Math.abs(weight.world.position.y - (-1 - 0.5 * 9.81 * (20 / 60) ** 2)) < 0.05, `falls freely while slack (${weight.world.position.y.toFixed(3)})`);
    let longest = 0;
    for (let frame = 0; frame < 120; frame += 1) {
        rope.step(1);
        longest = Math.max(longest, Math.hypot(weight.world.position.x, weight.world.position.y));
    }
    assert.ok(longest < 3.08, `never longer than the rope (${longest.toFixed(3)})`);
    assert.ok(Math.abs(weight.world.position.y + 3) < 0.05, "hangs at the rope's end");
    assert.deepEqual(rope.problems(), []);
});

test("spring joints bounce, settle with damping, and chains keep every link", () => {
    const hang = (dampingRatio) => {
        const game = startWorld(physicsScene([ball("Spring", 0, -2, [C.createJoint({ kind: "spring", connectedAnchor: { x: 0, y: 0, z: 0 }, autoDistance: false, distance: 2, frequency: 3, dampingRatio })])]));
        const body = game.find("Spring");
        let low = 0;
        for (let frame = 0; frame < 30; frame += 1) {
            game.step(1);
            low = Math.min(low, body.world.position.y);
        }
        game.step(150);
        return { low, y: body.world.position.y, speed: Math.hypot(body.body.velocity.x, body.body.velocity.y) };
    };
    const bouncy = hang(0);
    const settled = hang(1);
    const sag = 9.81 / (2 * Math.PI * 3) ** 2;
    assert.ok(bouncy.low < -2 - sag * 1.5, `an undamped spring overshoots (${bouncy.low.toFixed(3)})`);
    assert.ok(Math.abs(settled.y - (-2 - sag)) < 0.01 && settled.speed < 0.05, `a damped spring settles where gravity balances it (${settled.y.toFixed(4)})`);

    const chain = startWorld(physicsScene([
        ball("Link1", 1, 0, [C.createJoint({ connectedAnchor: { x: 0, y: 0, z: 0 } })]),
        ball("Link2", 2, 0, [C.createJoint({ connectedId: "entity_link1" })]),
        ball("Link3", 3, 0, [C.createJoint({ connectedId: "entity_link2" })]),
    ]));
    let stretch = 0;
    for (let frame = 0; frame < 240; frame += 1) {
        chain.step(1);
        const [a, b, c] = ["Link1", "Link2", "Link3"].map((name) => chain.find(name).world.position);
        stretch = Math.max(stretch, Math.abs(Math.hypot(a.x, a.y) - 1), Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 1), Math.abs(Math.hypot(c.x - b.x, c.y - b.y) - 1));
    }
    assert.ok(stretch < 0.12, `every link keeps its length (${stretch.toFixed(3)})`);
});

test("joint scripts: SpringJoint2D vs DistanceJoint2D lookups, AddComponent, connectedBody and copies", () => {
    const game = startWorld(physicsScene([
        ball("Anchor", 0, 0),
        ball("Hook", 2, 0, [C.createJoint({ kind: "distance", connectedAnchor: { x: 0, y: 3, z: 0 } }), C.createJoint({ kind: "spring", connectedId: "entity_anchor" })]),
    ], {
        name: "Rigger",
        on: "Hook",
        content: `using UnityEngine;
public class Rigger : MonoBehaviour
{
    void Start()
    {
        SpringJoint2D spring = GetComponent<SpringJoint2D>();
        DistanceJoint2D distance = GetComponent<DistanceJoint2D>();
        Debug.Log("spring " + spring.frequency + " to " + spring.connectedBody.gameObject.name + "; distance auto " + distance.autoConfigureDistance + " " + GetComponents<Joint2D>().Length);
        distance.distance = 1.5f;
        Debug.Log("distance " + distance.distance + " auto " + distance.autoConfigureDistance);
        SpringJoint2D extra = gameObject.AddComponent<SpringJoint2D>();
        extra.connectedBody = GameObject.Find("Anchor").GetComponent<Rigidbody2D>();
        Debug.Log("added spring " + (extra.connectedBody != null) + " joints " + GetComponents<Joint2D>().Length);
    }
}`,
    }));
    game.step(1);
    assert.deepEqual(game.messages("info"), ["spring 2 to Anchor; distance auto True 2", "distance 1.5 auto False", "added spring True joints 3"]);
    assert.deepEqual(game.problems(), []);

    const anchor = objectOf("entity_a", "A", [C.createTransform()]);
    const hook = objectOf("entity_b", "B", [C.createTransform(), C.createJoint({ connectedId: "entity_a" })]);
    const [anchorCopy, hookCopy] = cloneEntitiesWithNewIds([anchor, hook]);
    assert.equal(hookCopy.components.find((component) => component.type === "joint").connectedId, anchorCopy.id);
    const normalized = normalizeProject(physicsScene([ball("X", 0, 0, [C.createJoint({ frequency: 999, dampingRatio: -2, kind: "weird" })])]));
    const joint = normalized.scenes[0].objects.find((item) => item.name === "X").components.find((component) => component.type === "joint");
    assert.deepEqual([joint.frequency, joint.dampingRatio, joint.kind], [60, 0, "distance"]);
});

// ---------------------------------------------------------------------------
// UI: Slider, Toggle, InputField
// ---------------------------------------------------------------------------

/** A 2D scene with a slider, a toggle and an input field stacked in the middle of a 960 × 540 screen. */
function uiProject(script, rules) {
    const project = createBlankProject("UI", "2d");
    if (rules) project.settings.rules = rules;
    const scene = project.scenes[0];
    scene.objects.push(objectOf("entity_ui", "Menu", [
        C.createTransform(),
        C.createUISlider({ offset: { x: 0, y: -80 }, width: 300, height: 30, min: 0, max: 10, value: 5, onValueChanged: { targetId: null, method: "OnVolume" } }),
    ]));
    scene.objects.push(objectOf("entity_toggle", "Sound", [C.createTransform(), C.createUIToggle({ offset: { x: 0, y: 0 }, label: "Sound", onValueChanged: { targetId: "entity_ui", method: "OnSound" } })]));
    scene.objects.push(objectOf("entity_input", "Name", [C.createTransform(), C.createUIInputField({ offset: { x: 0, y: 80 }, contentType: "integer", characterLimit: 4, onEndEdit: { targetId: "entity_ui", method: "OnName" } })]));
    if (script) {
        project.scripts = [{ id: "script_ui", name: "Menu.cs", language: "csharp", content: script }];
        scene.objects[scene.objects.length - 3].components.push(createScriptComponent("script_ui", "Menu"));
    }
    return project;
}

const MENU_SCRIPT = `using UnityEngine;
using UnityEngine.UI;
public class Menu : MonoBehaviour
{
    void Start()
    {
        Slider slider = GetComponent<Slider>();
        slider.onValueChanged.AddListener(v => Debug.Log("listener " + v));
        GameObject.Find("Name").GetComponent<InputField>().onSubmit.AddListener(text => Debug.Log("submit " + text));
        GameObject.Find("Sound").GetComponent<Toggle>().onValueChanged.AddListener(on => Debug.Log("toggle listener " + on));
    }
    void OnVolume(float value) { Debug.Log("volume " + value); }
    void OnSound(bool on) { Debug.Log("sound " + on); }
    void OnName(string text) { Debug.Log("name " + text); }
}`;

/** Presses, optionally drags, and releases the left mouse button at screen pixels (origin top-left). */
function mouse(game, points) {
    const input = game.world.input;
    const [first, ...rest] = points;
    input.mouseX = first.x;
    input.mouseY = 540 - first.y;
    input.pendingMouseDown.add(0);
    input.mouseHeld.add(0);
    game.step(1);
    for (const point of rest) {
        input.mouseX = point.x;
        input.mouseY = 540 - point.y;
        game.step(1);
    }
    input.mouseHeld.delete(0);
    input.pendingMouseUp.add(0);
    game.step(1);
}

test("UI Slider: dragging sets the value, calls the Inspector method and listeners; whole numbers snap", () => {
    const game = startWorld(uiProject(MENU_SCRIPT));
    game.step(1);
    const slider = game.find("Menu").components.find((component) => component.type === "uiSlider");
    // The slider spans x 330…630 at y 175…205 (center 190).
    mouse(game, [{ x: 480, y: 190 }, { x: 600, y: 190 }, { x: 700, y: 190 }]);
    assert.equal(slider.value, 10, "dragging past the end clamps to the maximum");
    const info = game.messages("info");
    assert.ok(info.includes("volume 10") && info.includes("listener 10"), info.join(" | "));
    const handle = game.world.componentHandle(game.find("Menu"), slider);
    handle.set("wholeNumbers", true);
    handle.call("SetValueWithoutNotify", [3.4], []);
    assert.equal(slider.value, 3);
    const before = game.messages("info").length;
    handle.set("value", 7.6);
    assert.equal(slider.value, 8);
    assert.deepEqual(game.messages("info").slice(before), ["volume 8", "listener 8"]);
    assert.equal(game.world.pointerOverUI, false);
    game.world.input.mouseX = 480;
    game.world.input.mouseY = 540 - 190;
    game.step(1);
    assert.equal(game.world.pointerOverUI, true, "the pointer over a slider counts as over the UI");
    assert.deepEqual(game.problems(), []);
});

test("UI Slider: a quick tap released within the same frame still sets the value once", () => {
    const game = startWorld(uiProject(MENU_SCRIPT));
    game.step(1);
    const slider = game.find("Menu").components.find((component) => component.type === "uiSlider");
    const input = game.world.input;
    // The slider spans x 330…630 (value 0…10); x 405 is a quarter of the way.
    input.mouseX = 405;
    input.mouseY = 540 - 190;
    input.pendingMouseDown.add(0);
    input.pendingMouseUp.add(0);
    const before = game.messages("info").length;
    game.step(1);
    assert.equal(slider.value, 2.5);
    assert.deepEqual(game.messages("info").slice(before), ["volume 2.5", "listener 2.5"]);
    game.step(2);
    assert.equal(game.messages("info").length, before + 2, "no more events after the tap");
    assert.deepEqual(game.problems(), []);
});

test("UI Toggle flips on click; UI InputField filters typing and reports changes, end of editing and submit", () => {
    const game = startWorld(uiProject(MENU_SCRIPT));
    game.step(1);
    const toggle = game.find("Sound").components.find((component) => component.type === "uiToggle");
    mouse(game, [{ x: 400, y: 270 }]);
    assert.equal(toggle.isOn, true);
    assert.ok(game.messages("info").includes("sound True") && game.messages("info").includes("toggle listener True"));

    const field = game.find("Name").components.find((component) => component.type === "uiInputField");
    const start = game.messages("info").length;
    game.world.uiInput(field.id, "a1b2c3d4e5", "change");
    assert.equal(field.text, "1234", "integer fields keep digits, cut to the character limit");
    game.world.uiInput(field.id, "1234", "submit");
    assert.deepEqual(game.messages("info").slice(start), ["submit 1234", "name 1234"]);
    const handle = game.world.componentHandle(game.find("Name"), field);
    handle.set("contentType", "Alphanumeric");
    handle.set("text", "hi there!");
    assert.equal(field.text, "hith", "alphanumeric, still four characters");
    const serial = game.world.inputFocus.serial;
    handle.call("ActivateInputField", [], []);
    assert.deepEqual(game.world.inputFocus, { id: field.id, serial: serial + 1 });
    game.world.setFocusedInput(field.id);
    assert.equal(handle.get("isFocused"), true);
    // A click on the field (when the canvas gets it) asks for the keyboard too.
    mouse(game, [{ x: 480, y: 350 }]);
    assert.equal(game.world.inputFocus.id, field.id);
    assert.deepEqual(game.problems(), []);
});

test("Slider lookups: V4 rules add real sliders, V3 rules keep progress bars; GetComponent<Slider> finds either", () => {
    const script = `using UnityEngine;
using UnityEngine.UI;
public class Menu : MonoBehaviour
{
    void Start()
    {
        GameObject made = new GameObject("Made");
        Slider added = made.AddComponent<Slider>();
        Debug.Log("added " + (added != null) + " interactable " + added.interactable);
    }
}`;
    const v4 = startWorld(uiProject(script));
    v4.step(1);
    assert.deepEqual(v4.messages("info"), ["added True interactable True"]);
    assert.equal(v4.find("Made").components.some((component) => component.type === "uiSlider"), true);
    const v3 = startWorld(uiProject(script, 3));
    v3.step(1);
    assert.equal(v3.find("Made").components.some((component) => component.type === "uiProgressBar"), true, "V3 games keep their progress bar");
    assert.deepEqual(v3.messages("info"), ["added True interactable False"]);

    const normalized = normalizeProject(uiProject());
    const slider = normalized.scenes[0].objects.find((item) => item.name === "Menu").components.find((component) => component.type === "uiSlider");
    assert.equal(slider.value, 5);
    const input = normalized.scenes[0].objects.find((item) => item.name === "Name").components.find((component) => component.type === "uiInputField");
    assert.equal(input.onEndEdit.targetId, "entity_ui");
    const [copy] = cloneEntitiesWithNewIds([normalized.scenes[0].objects.find((item) => item.name === "Sound")]);
    assert.equal(copy.components.find((component) => component.type === "uiToggle").onValueChanged.targetId, "entity_ui", "targets outside the copy stay");
});

// ---------------------------------------------------------------------------
// Audio files and music
// ---------------------------------------------------------------------------

const JUMP_HASH = "a".repeat(64);
const THEME_HASH = "b".repeat(64);

/** Records what the game asks the sound engine to do. */
function fakeSound() {
    const calls = [];
    const engine = {
        volume: 0.7,
        musicVolume: 1,
        sfxVolume: 1,
        muted: false,
        play: (preset) => calls.push(["preset", preset]),
        playClip: (hash, volume, pitch, loop = false) => {
            const handle = {
                playing: true,
                stop: () => {
                    if (!handle.playing) return;
                    handle.playing = false;
                    calls.push(["stopClip", hash]);
                },
            };
            calls.push(["clip", hash, Math.round(volume * 100) / 100, loop]);
            return handle;
        },
        playMusic: (hash, volume, fade) => calls.push(["music", hash, volume, fade]),
        stopMusic: (fade) => calls.push(["stopMusic", fade]),
        setVolume: (value) => { engine.volume = value; },
        setMusicVolume: (value) => { engine.musicVolume = value; },
        setSfxVolume: (value) => { engine.sfxVolume = value; },
        setMuted: (value) => { engine.muted = value; },
        stopAll: () => calls.push(["stopAll"]),
    };
    return { engine, calls };
}

function audioProject(script, mutate, rules) {
    return projectWithScript("Sounds.cs", script, (project) => {
        project.audio = [
            { id: "audio_jump", name: "Jump", hash: JUMP_HASH, contentType: "audio/wav", size: 2048, duration: 0.3 },
            { id: "audio_theme", name: "Theme", hash: THEME_HASH, contentType: "audio/mpeg", size: 200_000, duration: 42 },
        ];
        if (rules) project.settings.rules = rules;
        mutate?.(project);
    });
}

test("project audio files are validated; Audio Sources lose links to files that are gone", () => {
    const project = audioProject("", (draft) => {
        draft.audio.push(
            { id: "audio_bad", name: "Bad", hash: "not-a-hash", contentType: "audio/wav", size: 10 },
            { id: "audio_jump", name: "Copy", hash: "c".repeat(64), contentType: "audio/wav", size: 10 },
            { id: "audio_odd", name: "  Odd  ", hash: "d".repeat(64), contentType: "text/html", size: 10_000_000, duration: -3 },
        );
        draft.scenes[0].objects.push({
            id: "entity_speaker", name: "Speaker", tag: "Untagged", parentId: null, active: true,
            components: [createTransform(), C.createAudioSource({ audioId: "audio_theme", loop: true }), C.createAudioSource({ audioId: "audio_gone" })],
        });
    });
    const normalized = normalizeProject(project);
    assert.deepEqual(normalized.audio.map((item) => item.id), ["audio_jump", "audio_theme", "audio_odd"], "bad hashes and repeated ids are dropped");
    const odd = normalized.audio[2];
    assert.equal(odd.name, "Odd");
    assert.equal(odd.contentType, "audio/mpeg");
    assert.equal(odd.size, 300 * 1024);
    assert.equal(odd.duration, 0);
    const sources = normalized.scenes[0].objects.find((item) => item.name === "Speaker").components.filter((component) => component.type === "audioSource");
    assert.equal(sources[0].audioId, "audio_theme");
    assert.equal(sources[0].loop, true);
    assert.equal(sources[1].audioId, null, "a file that is gone falls back to the built-in sound");
    assert.ok(normalizeProject({ ...project, audio: Array.from({ length: 60 }, (_, index) => ({ id: `audio_${index}`, name: `S${index}`, hash: index.toString(16).padStart(64, "0"), contentType: "audio/ogg", size: 100 })) }).audio.length <= 40);
});

test("Audio.Play plays uploaded files by name, PlayMusic loops one track, volumes and StopMusic work", () => {
    const sound = fakeSound();
    const game = startWorld(audioProject(`using UnityEngine;
public class Sounds : MonoBehaviour
{
    void Start()
    {
        Audio.Play("Jump");
        Audio.Play("JUMP", 0.5f);
        Audio.Play("jump");
        Audio.Play("Coin");
        Audio.PlayMusic("Theme", 0.6f, 1f);
        Debug.Log("music " + Audio.IsMusicPlaying() + " " + Audio.currentMusic);
        Audio.SetMusicVolume(0.5f);
        Audio.sfxVolume = 0.25f;
        Debug.Log("volumes " + Audio.musicVolume + " " + Audio.sfxVolume);
    }
    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Space))
        {
            Audio.StopMusic(0f);
            Debug.Log("stopped " + Audio.isMusicPlaying);
        }
    }
}`), { audio: sound.engine });
    game.step(1);
    // Exact names first ("jump" is a built-in sound), then a file ignoring case, then V4's "Coin" for "coin".
    assert.deepEqual(sound.calls, [["clip", JUMP_HASH, 1, false], ["clip", JUMP_HASH, 0.5, false], ["preset", "jump"], ["preset", "coin"], ["music", THEME_HASH, 0.6, 1]]);
    assert.deepEqual(game.world.audioEvents, [{ kind: "sfx", name: "Jump" }, { kind: "sfx", name: "Jump" }, { kind: "sfx", name: "jump" }, { kind: "sfx", name: "coin" }, { kind: "music", name: "Theme" }]);
    game.press("Space");
    assert.deepEqual(sound.calls.at(-1), ["stopMusic", 0]);
    assert.deepEqual(game.messages("info"), ["music True Theme", "volumes 0.5 0.25", "stopped False"]);
    assert.deepEqual(game.problems(), []);
    game.world.stop();
    assert.deepEqual(sound.calls.at(-1), ["stopAll"], "stopping the game stops every sound");
});

test("Audio Sources play their file (looping until stopped), AudioClip fields and PlayClipAtPoint; destroyed sources go quiet", () => {
    const sound = fakeSound();
    const project = audioProject(`using UnityEngine;
public class Sounds : MonoBehaviour
{
    public AudioClip hit;
    public AudioClip fallback;
    AudioSource ambience;
    void Start()
    {
        ambience = GameObject.Find("Ambience").GetComponent<AudioSource>();
        Debug.Log("ambience " + ambience.clip + " loop " + ambience.loop + " playing " + ambience.isPlaying);
        Debug.Log("fields " + hit + " " + fallback);
        AudioSource.PlayClipAtPoint(hit, transform.position, 0.5f);
        ambience.PlayOneShot(fallback);
    }
    void Update()
    {
        if (Input.GetKeyDown(KeyCode.S))
        {
            ambience.Stop();
            Debug.Log("after stop " + ambience.isPlaying);
            ambience.clip = "Jump";
            ambience.loop = false;
            ambience.Play();
            Debug.Log("now " + ambience.clip);
        }
        if (Input.GetKeyDown(KeyCode.D)) Destroy(ambience.gameObject);
    }
}`, (draft) => {
        draft.scenes[0].objects.find((item) => item.name === "Probe").components[1].fields = { hit: "audio_jump", fallback: "laser" };
        draft.scenes[0].objects.push({
            id: "entity_ambience", name: "Ambience", tag: "Untagged", parentId: null, active: true,
            components: [createTransform(), C.createAudioSource({ audioId: "audio_theme", loop: true, playOnStart: true, volume: 0.4 })],
        });
    });
    const game = startWorld(project, { audio: sound.engine });
    game.step(1);
    assert.deepEqual(sound.calls, [["clip", THEME_HASH, 0.4, true], ["clip", JUMP_HASH, 0.5, false], ["preset", "laser"]]);
    assert.deepEqual(game.messages("info"), ["ambience Theme loop True playing True", "fields Jump laser"]);
    game.press("S");
    assert.deepEqual(sound.calls.slice(3), [["stopClip", THEME_HASH], ["clip", JUMP_HASH, 0.4, false]]);
    assert.deepEqual(game.messages("info").slice(2), ["after stop False", "now Jump"]);
    const source = game.find("Ambience").components.find((component) => component.type === "audioSource");
    assert.equal(source.audioId, "audio_jump", "assigning a file's name links the file");
    game.hold("D", true);
    game.step(1);
    game.hold("D", false);
    game.step(1);
    assert.equal(game.find("Ambience"), undefined);
    assert.deepEqual(sound.calls.at(-1), ["stopClip", JUMP_HASH], "a destroyed object stops its sound");
    assert.deepEqual(game.problems(), []);
});

test("unknown sound names warn once under V4 rules and stay quiet under V3 rules; PlayMusic needs an uploaded file", () => {
    const script = `using UnityEngine;
public class Sounds : MonoBehaviour
{
    void Update()
    {
        Audio.Play("Boom");
        Audio.Play("Explosion");
        Audio.PlayMusic("Missing");
    }
}`;
    const v4 = startWorld(audioProject(script));
    v4.step(5);
    const warnings = v4.messages("warning");
    assert.equal(warnings.length, 2, warnings.join(" | "));
    assert.ok(warnings[0].includes("Boom") && warnings[0].includes("Jump"), warnings[0]);
    assert.ok(warnings[1].includes("PlayMusic") && warnings[1].includes("Missing"), warnings[1]);
    assert.equal(v4.world.currentMusic, null);
    assert.ok(v4.world.audioEvents.some((event) => event.name === "explosion"), "V4 plays the built-in explosion for \"Explosion\"");

    const v3 = startWorld(audioProject(script, null, 3));
    v3.step(5);
    assert.deepEqual(v3.messages("warning").filter((message) => message.includes("Boom")), [], "V3 games keep their quiet fallback");
    assert.ok(v3.world.audioEvents.some((event) => event.name === "Explosion"), "V3 rules keep the old name");
});

// ---------------------------------------------------------------------------
// Editor: Watch panel and multi-selection
// ---------------------------------------------------------------------------

const { readWatch, parseWatchPath, watchSuggestions } = await load("lib/game-engine/runtime/watch.ts");
const multi = await load("components/GameEngine/editor/multi-edit.ts");

test("watches read script fields, statics, lists, vectors, components and engine values without running game code", () => {
    const game = startWorld(projectWithScript("Hero.cs", `using UnityEngine;
using System.Collections.Generic;
public class Hero : MonoBehaviour
{
    public static int highScore = 7;
    public int score;
    float speed = 2.5f;
    public List<int> items = new List<int>();
    public Vector2 dir = new Vector2(1f, 2f);
    public string title = "hi";
    public float Speed { get { Debug.Log("getter ran"); return speed; } }
    void Start() { items.Add(3); items.Add(4); }
    void Update() { score += 1; }
}`, (project) => {
        project.scenes[0].objects.find((item) => item.name === "Probe").name = "Hero";
    }));
    game.step(3);
    const read = (path) => readWatch(game.world, path);
    assert.deepEqual(read("Hero.score"), { ok: true, text: "3", kind: "number", number: 3 });
    assert.equal(read("Hero.speed").text, "2.5", "private fields too");
    assert.equal(read("Hero.items").text, "List(2) [3, 4]");
    assert.equal(read("Hero.items.Count").number, 2);
    assert.equal(read("Hero.items[1]").text, "4");
    assert.equal(read("Hero.dir").text, "(1, 2)");
    assert.equal(read("Hero.dir.x").number, 1);
    assert.equal(read("Hero.title").text, "\"hi\"");
    assert.equal(read("Hero.tag").text, "\"Untagged\"");
    assert.equal(read("Hero.highScore").text, "7", "a static field through the object");
    assert.equal(read("Hero.Hero.score").text, "3", "a script by its class name");
    assert.equal(read("Main Camera.Camera.orthographicSize").kind, "number", "names with spaces and built-in components");
    assert.equal(read("Time.frameCount").number, 3);
    assert.equal(read("Hero.Speed").ok, false, "properties are not run");
    assert.match(read("Hero.items[5]").error, /dışında/);
    assert.match(read("Nobody.x").error, /Nobody/);
    assert.match(read("Hero.Rigidbody2D").error, /Rigidbody2D/);
    assert.equal(read("a..b").ok, false);
    assert.equal(parseWatchPath("Spawner.enemies[0].name").length, 3);
    assert.ok(watchSuggestions(game.world).includes("Hero.score"));
    assert.deepEqual(game.problems(), [], "reading watches writes nothing to the console");
    assert.equal(game.messages("info").includes("getter ran"), false);
});

test("multi-edit: only changed values reach the other objects, and a re-entered value still does", () => {
    const before = { id: "a", type: "collider", size: { x: 1, y: 2, z: 3 }, isTrigger: false, fields: { speed: 1, jump: 2 } };
    const after = { ...JSON.parse(JSON.stringify(before)), size: { x: 5, y: 2, z: 3 } };
    delete after.fields.jump;
    const changes = multi.diffValues(before, after);
    assert.deepEqual(changes, [{ path: ["size", "x"], value: 5 }, { path: ["fields", "jump"], value: undefined, deleted: true }]);
    const other = { id: "b", type: "collider", size: { x: 9, y: 8, z: 7 }, isTrigger: true, fields: { speed: 4, jump: 6 } };
    multi.applyValueChanges(other, [...changes, { path: ["id"], value: "x" }]);
    assert.deepEqual(other, { id: "b", type: "collider", size: { x: 5, y: 8, z: 7 }, isTrigger: true, fields: { speed: 4 } });
    // Setting the value this object already has: the one written value is found.
    assert.deepEqual(multi.writtenLeaf({ volume: 0.8, pitch: 1 }, (draft) => { draft.volume = 0.8; }), ["volume"]);
    assert.equal(multi.writtenLeaf({ size: { x: 1, y: 2 } }, (draft) => { draft.size = { x: 1, y: 2 }; }), null, "a whole vector is ambiguous");
    assert.deepEqual(multi.writtenLeaf({ sheet: { columns: 2, rows: 3 } }, (draft) => { draft.sheet = { ...draft.sheet, columns: 2 }; }), ["sheet", "columns"]);
});

test("multi-edit: shared components, selection roots and hierarchy search", () => {
    const transform = (id) => ({ id, type: "transform", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
    const body = (id, mass) => ({ id, type: "rigidBody", enabled: true, mass });
    const script = (id, className) => ({ id, type: "script", enabled: true, scriptId: "s1", className, fields: {} });
    const entities = [
        { id: "e1", name: "Coin A", tag: "Coin", parentId: null, active: true, components: [transform("t1"), body("b1", 1), script("c1", "Spin")] },
        { id: "e2", name: "Coin B", tag: "Coin", parentId: "e1", active: true, components: [transform("t2"), body("b2", 2), script("c2", "Spin"), { id: "a2", type: "audioSource", enabled: true }] },
        { id: "e3", name: "Wall", tag: "Untagged", parentId: null, active: true, components: [transform("t3"), body("b3", 1), script("c3", "Spin")] },
    ];
    const { shared, partial } = multi.sharedComponents(entities);
    assert.deepEqual(shared.map((item) => [item.component.id, item.others.map((other) => other.componentId), item.mixed]), [
        ["t1", ["t2", "t3"], false],
        ["b1", ["b2", "b3"], true],
        ["c1", ["c2", "c3"], false],
    ]);
    assert.deepEqual(partial.map((component) => component.type), ["audioSource"]);
    assert.deepEqual(multi.selectionRoots(entities, ["e2", "e1", "e3"]), ["e1", "e3"], "a child of a selected parent moves with it");
    const scriptClass = (component) => (component.type === "script" ? component.className : null);
    const typeLabel = (component) => [component.type === "rigidBody" ? "Rigidbody" : component.type, ...(component.type === "rigidBody" ? ["Rigidbody2D"] : [])];
    const find = (query) => entities.filter((entity) => multi.matchesSearch(entity, query, scriptClass, typeLabel)).map((entity) => entity.id);
    assert.deepEqual(find("coin"), ["e1", "e2"]);
    assert.deepEqual(find("t:audiosource"), ["e2"]);
    assert.deepEqual(find("t:Rigidbody2D wall"), ["e3"]);
    assert.deepEqual(find("t:spin"), ["e1", "e2", "e3"], "scripts by class name");
    assert.deepEqual(find("tag:coin b"), ["e2"]);
});

// ---------------------------------------------------------------------------
// Exported-HTML player
// ---------------------------------------------------------------------------

test("the exported-HTML player carries the V4 runtime and stays within its size budget", async () => {
    // Same settings as scripts/build-player.mjs, kept in memory (public/engine is generated, not committed).
    const { build } = await import("esbuild");
    const { fileURLToPath } = await import("node:url");
    const result = await build({
        entryPoints: [fileURLToPath(new URL("../../src/lib/game-engine/player/standalone.ts", import.meta.url))],
        bundle: true,
        minify: true,
        write: false,
        format: "iife",
        target: ["es2019"],
        platform: "browser",
        legalComments: "none",
        logLevel: "silent",
        define: { "process.env.NODE_ENV": '"production"' },
    });
    assert.deepEqual(result.errors, []);
    const bundle = result.outputFiles[0].text;
    for (const marker of ["characterController2D", "cameraFollow", "navAgent2D", "FindPath", "uiSlider", "uiToggle", "uiInputField", "PlayMusic", "GetButtonDown"]) {
        assert.ok(bundle.includes(marker), marker);
    }
    // About 1.1 MB with V4; a jump past the budget usually means a library got bundled by mistake.
    const kilobytes = Buffer.byteLength(bundle) / 1024;
    assert.ok(kilobytes < 1300, `player.js is ${Math.round(kilobytes)} KB`);
});
