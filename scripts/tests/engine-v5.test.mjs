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

// ---------------------------------------------------------------------------
// Animator
// ---------------------------------------------------------------------------

const C = await load("lib/game-engine/components.ts");
const { startWorld } = await import("./engine-helpers.mjs");

const key = (time, value, easing = "linear") => ({ time, value, easing });
const HERO_CLIPS = [
    { name: "Idle", duration: 1, wrap: "loop", tracks: [{ property: "color", keys: [key(0, "#ffffff"), key(1, "#ffffff")] }] },
    { name: "Run", duration: 0.5, wrap: "loop", tracks: [{ property: "position", keys: [key(0, { x: 0, y: 0, z: 0 }), key(0.25, { x: 0, y: 0.5, z: 0 }), key(0.5, { x: 0, y: 0, z: 0 })] }, { property: "color", keys: [key(0, "#ff0000"), key(0.5, "#ff0000")] }] },
    { name: "Jump", duration: 0.5, wrap: "once", tracks: [{ property: "scale", keys: [key(0, { x: 1, y: 1, z: 1 }), key(0.25, { x: 1, y: 1.5, z: 1 }), key(0.5, { x: 1, y: 1, z: 1 })] }] },
];

/** A hero with Idle/Run/Jump clips and a state machine: speed > 0.1 runs, the jump trigger jumps from anywhere, the jump returns to Idle when it ends. */
function heroProject(script, mutate) {
    const project = createBlankProject("Animator", "2d");
    const idle = C.createAnimatorState("Idle", "Idle", { x: 260, y: 160 });
    const run = C.createAnimatorState("Run", "Run", { x: 480, y: 160 });
    const jump = C.createAnimatorState("Jump", "Jump", { x: 370, y: 40 });
    const animator = C.createAnimator({
        parameters: [{ name: "speed", type: "float", value: 0 }, { name: "grounded", type: "bool", value: 1 }, { name: "jump", type: "trigger", value: 0 }],
        states: [idle, run, jump],
        defaultState: idle.id,
        transitions: [
            C.createAnimatorTransition(idle.id, run.id, { conditions: [{ parameter: "speed", mode: "greater", threshold: 0.1 }], duration: 0.1 }),
            C.createAnimatorTransition(run.id, idle.id, { conditions: [{ parameter: "speed", mode: "less", threshold: 0.1 }], duration: 0.1 }),
            C.createAnimatorTransition("any", jump.id, { conditions: [{ parameter: "jump", mode: "if", threshold: 0 }], duration: 0 }),
            C.createAnimatorTransition(jump.id, idle.id, { duration: 0 }),
        ],
    });
    const components = [C.createTransform(), C.createSpriteRenderer(), C.createAnimation({ clips: HERO_CLIPS }), animator];
    if (script) {
        project.scripts = [{ id: "script_hero", name: "Hero.cs", language: "csharp", content: script }];
        components.push(C.createScriptComponent("script_hero", "Hero"));
    }
    project.scenes[0].objects.push({ id: "entity_hero", name: "Hero", tag: "Player", parentId: null, active: true, components });
    mutate?.(project);
    return project;
}

const animatorOf = (game) => {
    const hero = game.find("Hero");
    const component = hero.components.find((item) => item.type === "animator");
    return { hero, controller: game.world.animatorControllerOf(hero), handle: game.world.componentHandle(hero, component) };
};

test("Animator: the default state plays; parameters switch states with a blend; a trigger jumps from any state; exit time returns", () => {
    const game = startWorld(heroProject(`using UnityEngine;
public class Hero : MonoBehaviour
{
    void OnStateEnter(string state) { Debug.Log("enter " + state); }
    void OnStateExit(string state) { Debug.Log("exit " + state); }
}`));
    game.step(1);
    const { hero, controller, handle } = animatorOf(game);
    assert.equal(controller.state.name, "Idle");
    assert.equal(hero.animator.clip.name, "Idle");
    assert.deepEqual(game.messages("info"), ["enter Idle"]);
    const start = { ...hero.localPosition };

    handle.call("SetFloat", ["speed", 1], []);
    game.step(1);
    assert.equal(controller.state.name, "Run");
    assert.equal(handle.call("IsInTransition", [0], []), true, "a 0.1 s blend");
    game.step(12);
    assert.equal(handle.call("IsInTransition", [0], []), false);
    assert.equal(hero.components.find((item) => item.type === "spriteRenderer").color, "#ff0000");
    assert.ok(hero.localPosition.y > start.y, "the run bobs");
    assert.equal(handle.call("GetCurrentAnimatorStateInfo", [0], []).call("IsName", ["Run"]), true);

    handle.call("SetTrigger", ["jump"], []);
    assert.equal(handle.call("GetBool", ["jump"], []), true);
    game.step(1);
    assert.equal(controller.state.name, "Jump");
    assert.equal(handle.call("GetBool", ["jump"], []), false, "the transition used the trigger");
    assert.ok(Math.abs(hero.localPosition.y - start.y) < 1e-9, "leaving the run puts the bob back (no blend)");
    handle.call("SetFloat", ["speed", 0], []);
    game.step(20);
    assert.ok(hero.localScale.y > 1.2, "the jump stretches");
    game.step(15);
    assert.equal(controller.state.name, "Idle", "back to Idle once the jump clip ended");
    assert.ok(Math.abs(hero.localScale.y - 1) < 1e-9, "scale back to the base");
    assert.deepEqual(game.messages("info"), ["enter Idle", "exit Idle", "enter Run", "exit Run", "enter Jump", "exit Jump", "enter Idle"]);
    assert.deepEqual(game.problems(), []);
});

test("Animator: scripts use names or StringToHash, Play jumps, speed scales, and unknown names warn once", () => {
    const game = startWorld(heroProject(`using UnityEngine;
public class Hero : MonoBehaviour
{
    Animator anim;
    static readonly int Speed = Animator.StringToHash("speed");
    void Start()
    {
        anim = GetComponent<Animator>();
        anim.SetFloat(Speed, 2f);
        Debug.Log("speed " + anim.GetFloat("speed") + " grounded " + anim.GetBool("grounded"));
        anim.SetBool("nope", true);
        anim.SetBool("nope", true);
        anim.SetInteger("speed", 3);
    }
    public void Teleport() { anim.Play("Jump", 0, 0.5f); }
}`));
    game.step(1);
    assert.deepEqual(game.messages("info"), ["speed 2 grounded True"]);
    const warnings = game.messages("warning");
    assert.equal(warnings.filter((message) => message.includes("'nope'")).length, 1, "one warning for the missing parameter");
    assert.ok(warnings.some((message) => message.includes("SetInteger")), "a float parameter can't be set with SetInteger");
    const { hero, controller, handle } = animatorOf(game);
    game.step(2);
    assert.equal(controller.state.name, "Run");
    game.world.sendMessage(hero, "Teleport", undefined, "SendMessage");
    assert.equal(controller.state.name, "Jump");
    assert.ok(Math.abs(hero.animator.normalizedTime - 0.5) < 1e-6, "Play(state, layer, normalizedTime) starts midway");
    handle.set("speed", 0.5);
    assert.equal(hero.animator.stateSpeed, 0.5);
    assert.equal(handle.get("currentState"), "Jump");
});

test("Animator under V4 rules stays the Animation clip player; V5 without an Animator falls back to it", () => {
    const script = `using UnityEngine;
public class Hero : MonoBehaviour
{
    void Start()
    {
        Animator anim = GetComponent<Animator>();
        anim.SetTrigger("Jump");
        Debug.Log("type " + anim);
    }
}`;
    const v4 = startWorld(heroProject(script, (project) => {
        project.settings.rules = 4;
        project.scenes[0].objects[project.scenes[0].objects.length - 1].components = project.scenes[0].objects.at(-1).components.filter((item) => item.type !== "animator");
    }));
    v4.step(1);
    assert.equal(v4.find("Hero").animator.clip.name, "Jump", "V4: SetTrigger plays the clip with that name");
    assert.deepEqual(v4.messages("info"), ["type Hero (Animation)"]);

    const fallback = startWorld(heroProject(script, (project) => {
        project.scenes[0].objects.at(-1).components = project.scenes[0].objects.at(-1).components.filter((item) => item.type !== "animator");
    }));
    fallback.step(1);
    assert.equal(fallback.find("Hero").animator.clip.name, "Jump", "V5 without an Animator: the Animation answers");

    const v5 = startWorld(heroProject(script));
    v5.step(2);
    assert.deepEqual(v5.messages("info"), ["type Hero (Animator)"]);
    assert.equal(animatorOf(v5).controller.state.name, "Jump", "V5: the trigger goes through the state machine");
    assert.deepEqual(v5.problems(), []);

    const added = startWorld(heroProject(`using UnityEngine;
public class Hero : MonoBehaviour
{
    void Start()
    {
        GameObject other = new GameObject("Other");
        Debug.Log("added " + (other.AddComponent<Animator>() != null) + " " + other.GetComponent<Animator>().parameterCount);
    }
}`));
    added.step(1);
    assert.deepEqual(added.messages("info"), ["added True 0"]);
    assert.ok(added.find("Other").components.some((item) => item.type === "animator"));
});

test("Animation.CrossFade blends under V5 rules and switches at once under V4 rules", () => {
    const clips = [
        { name: "Red", duration: 1, wrap: "loop", tracks: [{ property: "color", keys: [key(0, "#ff0000"), key(1, "#ff0000")] }] },
        { name: "Blue", duration: 1, wrap: "loop", tracks: [{ property: "color", keys: [key(0, "#0000ff"), key(1, "#0000ff")] }] },
    ];
    const run = (rules) => {
        const project = createBlankProject("Fade", "2d");
        project.settings.rules = rules;
        project.scripts = [{ id: "script_fade", name: "Fade.cs", language: "csharp", content: `using UnityEngine;
public class Fade : MonoBehaviour
{
    public void Go() { GetComponent<Animation>().CrossFade("Blue", 0.5f); }
}` }];
        project.scenes[0].objects.push({ id: "entity_fade", name: "Fade", tag: "Untagged", parentId: null, active: true, components: [C.createTransform(), C.createSpriteRenderer(), C.createAnimation({ clips }), C.createScriptComponent("script_fade", "Fade")] });
        const game = startWorld(project);
        game.step(2);
        const fade = game.find("Fade");
        game.world.sendMessage(fade, "Go", undefined, "SendMessage");
        game.step(15);
        return fade.components.find((item) => item.type === "spriteRenderer").color;
    };
    const midway = run(5);
    assert.notEqual(midway, "#0000ff");
    assert.notEqual(midway, "#ff0000");
    assert.equal(run(4), "#0000ff");
});

test("Animator data is validated: unique names, live references, modes that fit the parameter", () => {
    const project = createBlankProject("Check", "2d");
    project.scenes[0].objects.push({
        id: "entity_check",
        name: "Check",
        tag: "Untagged",
        parentId: null,
        active: true,
        components: [C.createTransform(), {
            id: "cmp_animator_check",
            type: "animator",
            enabled: true,
            parameters: [{ name: "go", type: "bool", value: 7 }, { name: "Go", type: "float", value: 1 }, { name: "n", type: "int", value: 2.6 }, { name: "", type: "bool", value: 0 }],
            states: [{ id: "state_a", name: "A", clip: "Walk", speed: 99, x: 0, y: 0 }, { id: "state_a", name: "A", clip: "", speed: 1, x: 5, y: 5 }],
            transitions: [
                { id: "t1", from: "state_a", to: "missing", conditions: [], hasExitTime: false, exitTime: 1, duration: 0.1 },
                { id: "t2", from: "any", to: "state_a", conditions: [{ parameter: "go", mode: "greater", threshold: 1 }, { parameter: "ghost", mode: "if", threshold: 0 }, { parameter: "n", mode: "equals", threshold: 2.4 }], hasExitTime: false, exitTime: -3, duration: 50 },
                { id: "t3", from: "state_a", to: "state_a", conditions: [], hasExitTime: false, exitTime: 1, duration: 0 },
            ],
            defaultState: "nowhere",
            speed: 3,
            layout: {},
        }],
    });
    const animator = normalizeProject(project).scenes[0].objects.at(-1).components.find((item) => item.type === "animator");
    assert.deepEqual(animator.parameters, [{ name: "go", type: "bool", value: 1 }, { name: "n", type: "int", value: 3 }]);
    assert.deepEqual(animator.states.map((state) => [state.name, state.clip, state.speed]), [["A", "Walk", 10], ["A 2", null, 1]]);
    assert.notEqual(animator.states[0].id, animator.states[1].id, "duplicate ids are replaced");
    assert.equal(animator.defaultState, animator.states[0].id);
    assert.equal(animator.transitions.length, 2, "a transition to a missing state is dropped");
    const [anyTransition, self] = animator.transitions;
    assert.deepEqual(anyTransition.conditions, [{ parameter: "go", mode: "if", threshold: 1 }, { parameter: "n", mode: "equals", threshold: 2 }]);
    assert.deepEqual([anyTransition.exitTime, anyTransition.duration], [0, 10]);
    assert.equal(self.hasExitTime, true, "no conditions: it waits for the clip");
    assert.deepEqual(animator.layout, { entry: { x: 40, y: 160 }, any: { x: 40, y: 40 } });
});

// ---------------------------------------------------------------------------
// Screen effects V2
// ---------------------------------------------------------------------------

const { NOT_FOUND } = await load("lib/game-engine/script/values.ts");

test("screen effects V2: off by default, clamped, and V4 scenes get them switched off", () => {
    const fresh = normalizeProject(createBlankProject("Efekt", "2d"));
    const effects = fresh.scenes[0].settings.postProcessing;
    assert.deepEqual(effects.colorGrading, { enabled: false, saturation: 0, contrast: 0, brightness: 0, hue: 0, tint: "#ffffff", tintAmount: 0 });
    assert.deepEqual(effects.chromaticAberration, { enabled: false, intensity: 0.4 });
    assert.deepEqual(effects.pixelate, { enabled: false, size: 4 });
    assert.deepEqual(effects.crt, { enabled: false, scanlines: 0.5, curvature: 0.3 });

    const wild = JSON.parse(JSON.stringify(fresh));
    wild.scenes[0].settings.postProcessing = {
        ...effects,
        colorGrading: { enabled: true, saturation: 5, contrast: -9, brightness: "x", hue: 720, tint: "not a color", tintAmount: 3 },
        chromaticAberration: { enabled: 1, intensity: 2 },
        pixelate: { enabled: true, size: 100.7 },
        crt: { enabled: true, scanlines: -1, curvature: 9 },
    };
    const clamped = normalizeProject(wild).scenes[0].settings.postProcessing;
    assert.deepEqual(clamped.colorGrading, { enabled: true, saturation: 1, contrast: -1, brightness: 0, hue: 180, tint: "#ffffff", tintAmount: 1 });
    assert.deepEqual(clamped.chromaticAberration, { enabled: false, intensity: 1 }, "only a real true switches it on");
    assert.deepEqual(clamped.pixelate, { enabled: true, size: 32 });
    assert.deepEqual(clamped.crt, { enabled: true, scanlines: 0, curvature: 1 });

    const v4 = JSON.parse(JSON.stringify(fresh));
    v4.version = 4;
    for (const name of ["colorGrading", "chromaticAberration", "pixelate", "crt"]) delete v4.scenes[0].settings.postProcessing[name];
    const migrated = normalizeProject(v4).scenes[0].settings.postProcessing;
    assert.equal(migrated.colorGrading.enabled || migrated.chromaticAberration.enabled || migrated.pixelate.enabled || migrated.crt.enabled, false);
});

test("ScreenEffects: scripts change the running effects, not the scene; Reset and scene loads bring the scene's back", () => {
    const project = createBlankProject("Efekt", "2d");
    project.scenes[0].settings.postProcessing.vignette = { enabled: true, intensity: 0.3 };
    const second = JSON.parse(JSON.stringify(project.scenes[0]));
    second.id = "scene_two";
    second.name = "Two";
    second.objects = [];
    project.scenes.push(second);
    project.scripts = [{ id: "script_fx", name: "Fx.cs", language: "csharp", content: `using UnityEngine;
using UnityEngine.SceneManagement;
public class Fx : MonoBehaviour
{
    public void Hit()
    {
        ScreenEffects.saturation = -2f;
        ScreenEffects.contrast = 0.25f;
        ScreenEffects.hue = 30f;
        ScreenEffects.tint = new Color(1f, 0f, 0f, 0.5f);
        ScreenEffects.chromaticAberration = 0.8f;
        ScreenEffects.pixelate = 6;
        ScreenEffects.crt = true;
        ScreenEffects.scanlines = 0.7f;
        ScreenEffects.vignette = 0f;
        ScreenEffects.exposure = 9f;
        Debug.Log("fx " + ScreenEffects.saturation + " " + ScreenEffects.pixelate + " " + ScreenEffects.crt + " " + ScreenEffects.vignette + " " + ScreenEffects.exposure + " " + ScreenEffects.tint.a);
    }
    public void Calm()
    {
        ScreenEffects.Reset();
        Debug.Log("calm " + ScreenEffects.saturation + " " + ScreenEffects.pixelate + " " + ScreenEffects.vignette);
    }
    public void Next() { SceneManager.LoadScene("Two"); }
}` }];
    project.scenes[0].objects.push({ id: "entity_fx", name: "Fx", tag: "Untagged", parentId: null, active: true, components: [C.createTransform(), C.createScriptComponent("script_fx", "Fx")] });
    const game = startWorld(project);
    game.step(1);
    const fx = game.find("Fx");
    const scene = game.world.scene.settings.postProcessing;
    const before = JSON.stringify(scene);

    game.world.sendMessage(fx, "Hit", undefined, "SendMessage");
    assert.deepEqual(game.messages("info"), ["fx -1 6 True 0 4 0.5"]);
    const running = game.world.renderSettings.postProcessing;
    assert.equal(running, game.world.effects);
    assert.equal(running.colorGrading.enabled, true, "setting a grading value switches grading on");
    assert.equal(running.colorGrading.tint, "#ff0000");
    assert.equal(running.colorGrading.tintAmount, 0.5);
    assert.equal(running.colorGrading.hue, 30);
    assert.deepEqual(running.chromaticAberration, { enabled: true, intensity: 0.8 });
    assert.deepEqual(running.pixelate, { enabled: true, size: 6 });
    assert.equal(running.crt.enabled, true);
    assert.equal(running.vignette.enabled, false, "0 switches the vignette off");
    assert.equal(JSON.stringify(scene), before, "the scene data is untouched");
    assert.equal(game.world.renderSettings.background, game.world.scene.settings.background, "the rest of the settings are the scene's");

    game.world.sendMessage(fx, "Calm", undefined, "SendMessage");
    assert.equal(game.messages("info")[1], "calm 0 1 0.3");
    assert.deepEqual(game.world.effects, scene);
    assert.notEqual(game.world.effects, scene, "a copy, so scripts never write into the scene");

    game.world.sendMessage(fx, "Hit", undefined, "SendMessage");
    game.world.sendMessage(fx, "Next", undefined, "SendMessage");
    game.step(1);
    assert.equal(game.world.scene.name, "Two");
    assert.equal(game.world.effects.pixelate.enabled, false, "a new scene starts with its own effects");
    assert.deepEqual(game.problems(), []);

    // Only the namespace's own members exist (no "constructor", "toString" from the JavaScript object).
    const namespace = game.world.resolveGlobal("ScreenEffects");
    assert.equal(namespace.getMember("constructor"), NOT_FOUND);
    assert.equal(namespace.callMember("toString", [], [], []), NOT_FOUND);
    assert.equal(namespace.callMember("hasOwnProperty", ["Reset"], [], []), NOT_FOUND);
    assert.equal(namespace.setMember("__proto__", 1), false);
});
