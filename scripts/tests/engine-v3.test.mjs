// Hanogt Engine V3: schema migration, tilemap physics, animation math,
// the new script APIs and the V3 templates. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load, ROOT } from "./setup.mjs";

const types = await load("lib/game-engine/types.ts");
const { normalizeProject, SchemaError } = await load("lib/game-engine/schema.ts");
const { createBlankProject, createEmptyScene } = await load("lib/game-engine/scene.ts");
const components = await load("lib/game-engine/components.ts");
const { PROJECT_TEMPLATES, createProjectFromTemplate } = await load("lib/game-engine/templates/index.ts");
const { ease, easingFromName, wrapClipTime, sampleTrack, sampleClip, animationPreset, lerpColor } = await load("lib/game-engine/animation.ts");
const { fillTiles, setTileKey, solidTiles, tileAt, tilemapSize, resolveTileKey, trimTilemap } = await load("lib/game-engine/tilemap.ts");
const { uiRect, progressFraction } = await load("lib/game-engine/ui-layout.ts");
const { compileScripts } = await load("lib/game-engine/script/compiler.ts");
const { GLOBAL_NAMES } = await load("lib/game-engine/script/names.ts");
const { RuntimeWorld } = await load("lib/game-engine/runtime/world.ts");

const { createTransform, createSpriteRenderer, createRigidBody, createCollider, createScriptComponent, createTilemap, createAnimation, createUIButton, createUIProgressBar, createUIText } = components;

let nextId = 0;
function id(prefix) {
    nextId += 1;
    return `${prefix}_v3test${String(nextId).padStart(4, "0")}`;
}

function entity(name, comps, options = {}) {
    return {
        id: options.id ?? id("entity"),
        name,
        tag: options.tag ?? "Untagged",
        parentId: options.parentId ?? null,
        active: options.active ?? true,
        components: [createTransform({ position: { x: 0, y: 0, z: 0, ...options.position }, scale: { x: 1, y: 1, z: 1, ...options.scale } }), ...comps],
    };
}

function memoryStorage() {
    const store = new Map();
    return { store, getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
}

/** Normalizes, compiles and starts a project the way the player does. */
function startWorld(project, options = {}) {
    const normalized = normalizeProject(JSON.parse(JSON.stringify(project)));
    const program = compileScripts(normalized.scripts);
    const errors = program.diagnostics.filter((item) => item.severity === "error");
    assert.deepEqual(errors.map((item) => `${item.line}: ${item.message}`), [], "scripts compile");
    const logs = [];
    const world = new RuntimeWorld({
        project: normalized,
        program,
        sceneId: options.sceneId ?? null,
        storage: options.storage ?? memoryStorage(),
        getScreenSize: () => ({ width: 960, height: 540 }),
        onLog: (entry, updated) => {
            if (!updated) logs.push(entry);
        },
    });
    world.start();
    const step = (frames = 1) => {
        for (let index = 0; index < frames; index += 1) world.step(1 / 60);
    };
    const find = (name) => [...world.entities.values()].find((item) => item.name === name);
    const messages = (level) => logs.filter((entry) => !level || entry.level === level).map((entry) => entry.message);
    const problems = () => logs.filter((entry) => entry.level === "error" || entry.level === "warning").map((entry) => entry.message);
    return { world, logs, step, find, messages, problems, project: normalized };
}

function script(name, content) {
    return { id: id("script"), name, language: name.endsWith(".cpp") ? "cpp" : "csharp", content };
}

/** Removes everything schema v3 added, producing what a V2 editor saved. */
function downgradeToV2(project) {
    const doc = JSON.parse(JSON.stringify(project));
    doc.version = 2;
    // V4 project settings did not exist yet.
    delete doc.settings.rules;
    delete doc.settings.input;
    const strip = (item) => {
        for (const component of item.components) {
            if (component.type === "spriteRenderer") {
                delete component.sheet;
                delete component.frame;
            }
            if (component.type === "uiText") delete component.order;
        }
    };
    for (const scene of doc.scenes) {
        scene.version = 2;
        delete scene.settings.postProcessing;
        delete scene.settings.fog.mode;
        delete scene.settings.fog.density;
        scene.objects.forEach(strip);
    }
    for (const prefab of doc.prefabs) prefab.entities.forEach(strip);
    return doc;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

test("v2 projects migrate to the current schema without losing data", () => {
    for (const templateId of ["platformer-2d", "rollaball-3d", "space-shooter-2d", "breakout-2d"]) {
        const original = normalizeProject(JSON.parse(JSON.stringify(createProjectFromTemplate(templateId))));
        const v2 = downgradeToV2(original);
        const migrated = normalizeProject(v2);
        assert.equal(migrated.version, types.GAME_ENGINE_SCHEMA_VERSION);
        // Projects from before V4 keep V3 rules; everything else comes back as it was.
        assert.equal(migrated.settings.rules, 3);
        assert.deepEqual(migrated, { ...original, settings: { ...original.settings, rules: 3 } }, `${templateId} migrates losslessly`);
        const sprite = migrated.scenes[0].objects.flatMap((item) => item.components).find((component) => component.type === "spriteRenderer");
        if (sprite) assert.deepEqual([sprite.sheet, sprite.frame], [{ columns: 1, rows: 1 }, 0]);
        assert.equal(migrated.scenes[0].settings.postProcessing.bloom.enabled, false);
        assert.equal(migrated.scenes[0].settings.fog.mode, "linear");
    }
});

test("v3 documents survive a save/load round trip unchanged", () => {
    for (const info of PROJECT_TEMPLATES) {
        const once = normalizeProject(JSON.parse(JSON.stringify(createProjectFromTemplate(info.id))));
        const twice = normalizeProject(JSON.parse(JSON.stringify(once)));
        assert.deepEqual(twice, once, `${info.id} round trip`);
    }
});

test("schema v1 documents still load", () => {
    const v1 = {
        version: 1,
        id: "game_v1legacyproject",
        name: "Eski Proje",
        dimension: "2d",
        scene: {
            id: "scene_v1legacyscene",
            name: "Sahne",
            objects: [{
                id: "entity_v1legacyball",
                name: "Top",
                components: [
                    { type: "transform", position: { x: 1, y: 2, z: 0 } },
                    { type: "rigidBody", restitution: 0.7 },
                    { type: "collider", shape: "circle" },
                    { type: "script", id: "cmp_v1legacyscript", fileName: "Spin.cs", language: "csharp", entryClass: "Spin", source: "using UnityEngine;\npublic class Spin : MonoBehaviour { void Update() { transform.Rotate(0, 0, 90 * Time.deltaTime); } }" },
                ],
            }],
        },
    };
    const project = normalizeProject(v1);
    assert.equal(project.version, types.GAME_ENGINE_SCHEMA_VERSION);
    assert.equal(project.settings.rules, 3);
    assert.equal(project.scenes[0].objects[0].name, "Top");
    const collider = project.scenes[0].objects[0].components.find((component) => component.type === "collider");
    assert.equal(collider.bounciness, 0.7);
    assert.equal(project.scripts.length, 1);
    assert.equal(project.scripts[0].name, "Spin.cs");
    assert.equal(project.scenes[0].settings.postProcessing.vignette.enabled, false);
});

test("projects saved by a newer engine are refused instead of being truncated", () => {
    const project = normalizeProject(createProjectFromTemplate("empty-2d"));
    assert.throws(() => normalizeProject({ ...project, version: types.GAME_ENGINE_SCHEMA_VERSION + 1 }), SchemaError);
});

test("V3 components are validated and clamped", () => {
    const project = createBlankProject("Clamp", "2d");
    project.scenes[0].objects.push({
        id: "entity_v3clampthings",
        name: "Messy",
        components: [
            { type: "transform" },
            {
                type: "tilemap",
                cellSize: 9999,
                origin: { x: 2.7, y: "x" },
                rows: ["#?#", 42, "#".repeat(900)],
                palette: [{ key: "#", name: "Çim", color: "nope", solid: "yes" }, { key: "#", name: "Kopya" }, { key: "..", name: "Kötü" }, { key: ".", name: "Boş" }],
                atlas: { columns: 0, rows: 999 },
            },
            {
                type: "animation",
                defaultClip: "Yok",
                clips: [
                    { name: "Zıpla", duration: 1, wrap: "bogus", tracks: [{ property: "scale", keys: [{ time: 5, value: { x: 2, y: 2, z: 2 } }, { time: -1, value: { x: 1, y: 1, z: 1 }, easing: "outBack" }] }, { property: "nope", keys: [] }] },
                    { name: "Zıpla", duration: 0, tracks: [] },
                ],
            },
            { type: "uiButton", text: "x".repeat(500), width: -10, onClick: { targetId: "bad id", method: "Do Something!" }, hotkey: "Banana" },
            { type: "uiProgressBar", value: Number.NaN, min: 5, max: 1, direction: "diagonal" },
        ],
    });
    const normalized = normalizeProject(project);
    const parts = normalized.scenes[0].objects.find((item) => item.name === "Messy").components;
    const tilemap = parts.find((component) => component.type === "tilemap");
    assert.equal(tilemap.cellSize, 100);
    assert.deepEqual(tilemap.origin, { x: 3, y: 0 });
    assert.deepEqual(tilemap.palette.map((tile) => tile.key), ["#"]);
    assert.equal(tilemap.palette[0].color, "#94a3b8");
    assert.equal(tilemap.rows.length, 3);
    assert.equal(tilemap.rows[0].slice(0, 3), "#.#");
    assert.ok(tilemap.rows.every((row) => row.length === 512), "rows are padded to one width within the column limit");
    assert.deepEqual([tilemap.atlas.columns, tilemap.atlas.rows], [1, 64]);

    const animation = parts.find((component) => component.type === "animation");
    assert.deepEqual(animation.clips.map((clip) => clip.name), ["Zıpla", "Zıpla 2"]);
    assert.equal(animation.clips[0].wrap, "once");
    assert.equal(animation.clips[0].tracks.length, 1);
    assert.deepEqual(animation.clips[0].tracks[0].keys.map((key) => key.time), [0, 1]);
    assert.equal(animation.clips[0].tracks[0].keys[0].easing, "outBack");
    assert.equal(animation.defaultClip, null);

    const button = parts.find((component) => component.type === "uiButton");
    assert.ok(button.text.length <= 200);
    assert.ok(button.width >= 0);
    assert.equal(button.onClick.targetId, null);
    assert.equal(button.hotkey, "None");

    const bar = parts.find((component) => component.type === "uiProgressBar");
    assert.ok(Number.isFinite(bar.value));
    assert.equal(bar.direction, "leftToRight");
});

// ---------------------------------------------------------------------------
// Tilemaps
// ---------------------------------------------------------------------------

test("tile grid helpers grow, trim and expose surface faces", () => {
    const tilemap = createTilemap();
    assert.ok(fillTiles(tilemap, 0, 0, 2, 1, "#"));
    assert.deepEqual(tilemapSize(tilemap), { width: 3, height: 2 });
    assert.equal(tileAt(tilemap, 1, 1).name, "Çimen");
    assert.equal(resolveTileKey(tilemap.palette, "çimen"), "#");
    assert.ok(setTileKey(tilemap, 5, 4, "@"));
    assert.deepEqual(tilemap.origin, { x: 0, y: 0 });
    assert.deepEqual(tilemapSize(tilemap), { width: 6, height: 5 });
    assert.ok(setTileKey(tilemap, 5, 4, null));
    assert.deepEqual(tilemapSize(tilemap), { width: 3, height: 2 }, "erasing trims the empty border");
    tilemap.rows = ["...", ".#.", "..."];
    trimTilemap(tilemap);
    assert.deepEqual(tilemap.rows, ["#"]);
    assert.deepEqual(tilemap.origin, { x: 1, y: 1 });

    const block = createTilemap({ rows: ["###", "###", "###"] });
    const surface = solidTiles(block);
    assert.equal(surface.length, 8, "the middle tile is interior");
    const topMiddle = surface.find((tile) => tile.x === 1 && tile.y === 2);
    assert.deepEqual(topMiddle.open, { left: false, right: false, bottom: false, top: true });
});

test("bodies rest on tilemaps and slide across tile seams", () => {
    const project = createBlankProject("Tiles", "2d");
    const scene = project.scenes[0];
    const ground = entity("Ground", [createTilemap({ rows: ["#".repeat(40)], origin: { x: -5, y: -1 }, friction: 0 })]);
    const box = entity("Box", [createSpriteRenderer(), createRigidBody({ freezeRotation: true, freezePosition: { x: false, y: false, z: true }, linearDamping: 0 }), createCollider({ friction: 0 })], { position: { x: 0, y: 3 }, scale: { x: 0.9, y: 0.9 } });
    scene.objects.push(ground, box);
    const { world, step, find, problems } = startWorld(project);
    step(120);
    const body = find("Box");
    assert.ok(Math.abs(body.world.position.y - 0.45) < 0.03, `box rests on the tiles (y=${body.world.position.y})`);
    // Slide right over 20 tile seams: no vertical bumps and no lost speed.
    body.body.velocity.x = 6;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let frame = 0; frame < 150; frame += 1) {
        body.body.velocity.x = 6;
        world.step(1 / 60);
        minY = Math.min(minY, body.world.position.y);
        maxY = Math.max(maxY, body.world.position.y);
    }
    assert.ok(body.world.position.x > 14, `box moved across the seams (x=${body.world.position.x})`);
    assert.ok(maxY - minY < 0.02, `no ghost collisions (dy=${maxY - minY})`);
    assert.deepEqual(problems(), []);
});

test("trigger tilemaps, tile edits and contacts reach scripts", () => {
    const project = createBlankProject("TileScripts", "2d");
    const scene = project.scenes[0];
    const probe = script("TileProbe.cs", `
using UnityEngine;
using UnityEngine.Tilemaps;

public class TileProbe : MonoBehaviour
{
    public Tilemap ground;

    void Start()
    {
        Debug.Log("tile " + ground.GetTile(0, -1) + " " + ground.HasTile(3, 3) + " " + ground.CountTiles());
        ground.SetTile(3, 3, "Taş");
        Vector3 cell = ground.WorldToCell(new Vector3(3.5f, 3.2f, 0));
        Debug.Log("set " + ground.GetTile(3, 3) + " solid " + ground.IsSolid(3, 3) + " cell " + cell.x + "," + cell.y);
    }

    void OnCollisionEnter2D(Collision2D collision)
    {
        Debug.Log("hit " + collision.gameObject.name + " contacts " + collision.contactCount + " up " + (collision.GetContact(0).normal.y > 0.5f));
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        Debug.Log("trigger " + other.tag);
    }
}`);
    project.scripts.push(probe);
    const ground = entity("Ground", [createTilemap({ rows: ["##########"], origin: { x: -5, y: -1 } })], { tag: "Ground" });
    const water = entity("Water", [createTilemap({ rows: ["~~"], origin: { x: 8, y: -1 }, isTrigger: true, palette: [{ key: "~", name: "Su", color: "#0ea5e9", solid: true, frame: -1 }] })], { tag: "Hazard" });
    const box = entity("Box", [
        createSpriteRenderer(),
        createRigidBody({ freezeRotation: true, freezePosition: { x: false, y: false, z: true } }),
        createCollider(),
        createScriptComponent(probe.id, "TileProbe", { fields: { ground: { ref: "entity", id: ground.id } } }),
    ], { position: { x: 0, y: 2 }, scale: { x: 0.9, y: 0.9 } });
    scene.objects.push(ground, water, box);
    const { step, find, messages, problems } = startWorld(project);
    step(90);
    // The box spans two tiles: one collision with the tilemap, one contact point per touched tile.
    assert.deepEqual(messages("info").slice(0, 3), ["tile Çimen False 10", "set Taş solid True cell 3,3", "hit Ground contacts 2 up True"]);
    assert.equal(messages("info").filter((message) => message.startsWith("hit ")).length, 1);
    // Walk into the water tiles (a trigger tilemap).
    find("Box").setWorldPosition({ x: 9, y: -0.3, z: 0 });
    step(3);
    assert.ok(messages("info").includes("trigger Hazard"));
    assert.deepEqual(problems(), []);
});

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

test("easing curves", () => {
    for (const easing of types.EASINGS) {
        assert.ok(Math.abs(ease(easing, 0)) < 1e-9, `${easing}(0) = 0`);
        assert.ok(Math.abs(ease(easing, 1) - 1) < 1e-9, `${easing}(1) = 1`);
    }
    assert.equal(ease("linear", 0.25), 0.25);
    assert.equal(ease("outQuad", 0.5), 0.75);
    assert.equal(ease("inQuad", 0.5), 0.25);
    assert.ok(ease("inBack", 0.2) < 0, "inBack pulls back first");
    assert.ok(ease("outBack", 0.8) > 1, "outBack overshoots");
    assert.equal(ease("step", 0.99), 0);
    assert.equal(ease("linear", 7), 1, "progress is clamped");
    assert.equal(easingFromName("Ease.OutQuad"), "outQuad");
    assert.equal(easingFromName("INOUTSINE"), "inOutSine");
    assert.equal(easingFromName("wobble", "linear"), "linear");
});

test("clip wrapping and track sampling", () => {
    assert.deepEqual(wrapClipTime({ duration: 2, wrap: "once" }, 3), { time: 2, finished: true });
    assert.deepEqual(wrapClipTime({ duration: 2, wrap: "loop" }, 5), { time: 1, finished: false });
    assert.deepEqual(wrapClipTime({ duration: 2, wrap: "pingPong" }, 3), { time: 1, finished: false });
    assert.deepEqual(wrapClipTime({ duration: 2, wrap: "pingPong" }, 3.5), { time: 0.5, finished: false });

    const move = { property: "position", keys: [{ time: 0, value: { x: 0, y: 0, z: 0 }, easing: "linear" }, { time: 1, value: { x: 2, y: 4, z: 0 }, easing: "outQuad" }, { time: 2, value: { x: 0, y: 0, z: 0 }, easing: "linear" }] };
    assert.deepEqual(sampleTrack(move, 0.5), { x: 1, y: 2, z: 0 });
    assert.deepEqual(sampleTrack(move, 1.5), { x: 0.5, y: 1, z: 0 }, "segment eased with the key's own easing (outQuad)");
    assert.deepEqual(sampleTrack(move, -1), { x: 0, y: 0, z: 0 });
    assert.deepEqual(sampleTrack(move, 9), { x: 0, y: 0, z: 0 });

    const frames = animationPreset("frames", "2d", 4, 8);
    assert.equal(frames.duration, 0.5);
    assert.deepEqual([0, 0.1, 0.13, 0.26, 0.49].map((time) => sampleClip(frames, time).frame), [0, 0, 1, 2, 3]);
    const flash = animationPreset("flash", "2d");
    assert.equal(sampleClip(flash, 0.075).color, lerpColor("#ffffff", "#ef4444", 0.5));
    assert.equal(sampleClip(animationPreset("fadeOut", "2d"), 0.6).opacity, 0);
});

test("the Animation component plays clips and reports completion", () => {
    const project = createBlankProject("Anim", "2d");
    const listener = script("AnimListener.cs", `
using UnityEngine;

public class AnimListener : MonoBehaviour
{
    void Start()
    {
        Animation anim = GetComponent<Animation>();
        Debug.Log("clips " + anim.clipCount + " playing " + anim.isPlaying + " " + anim.IsPlaying("Pulse"));
        anim.Play("FadeOut");
    }

    void OnAnimationComplete(string clip)
    {
        Debug.Log("done " + clip + " alpha " + GetComponent<SpriteRenderer>().color.a);
    }
}`);
    project.scripts.push(listener);
    const pulse = animationPreset("pulse", "2d");
    project.scenes[0].objects.push(entity("Pulser", [createSpriteRenderer(), createAnimation({ clips: [pulse] })], { scale: { x: 2, y: 2 } }));
    project.scenes[0].objects.push(entity("Fader", [
        createSpriteRenderer(),
        createAnimation({ clips: [animationPreset("pulse", "2d"), animationPreset("fadeOut", "2d")], playOnStart: true }),
        createScriptComponent(listener.id, "AnimListener"),
    ]));
    const { step, find, messages, problems } = startWorld(project);
    step(16);
    const pulser = find("Pulser");
    assert.ok(pulser.localScale.x > 2.05 && pulser.localScale.x < 2.31, `pulse scales relative to the authored scale (${pulser.localScale.x})`);
    step(50);
    assert.deepEqual(messages("info"), ["clips 2 playing True True", "done FadeOut alpha 0"]);
    assert.deepEqual(problems(), []);
});

// ---------------------------------------------------------------------------
// Script APIs
// ---------------------------------------------------------------------------

test("C# scripts drive tweens, timers, UI, prefs and scene fades", () => {
    const project = createBlankProject("Api", "2d");
    const second = createEmptyScene("İkinci", "2d");
    project.scenes.push(second);
    const api = script("ApiProbe.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

public class ApiProbe : MonoBehaviour
{
    public Button button;
    public Slider bar;
    public Text label;
    private int clicks;
    private int ticks;
    private float tweened;

    void Start()
    {
        button.onClick.AddListener(() => clicks++);
        button.onClick.AddListener(Count);
        button.onClick.Invoke();
        button.onClick.RemoveListener(Count);
        button.Click();
        Debug.Log("clicks " + clicks);

        bar.maxValue = 10;
        bar.value = 25;
        Debug.Log("bar " + bar.value + " " + bar.normalizedValue);

        Tween.Value(0f, 10f, 0.5f, v => tweened = v).SetEase(Ease.OutQuad).OnComplete(() => Debug.Log("value " + tweened));
        Tween.Move(transform, new Vector3(4, 0, 0), 0.25f).SetEase(Ease.InOutSine).OnComplete(() => Debug.Log("moved " + transform.position.x));
        Tween.Fade(label, 0f, 0.2f);

        StartTimers();
        PlayerPrefs.SetBool("muted", true);
        Debug.Log("prefs " + PlayerPrefs.GetBool("muted") + " " + PlayerPrefs.GetBool("missing", true));
        Debug.Log("engine " + Application.engineVersion + " ui " + UI.IsPointerOverUI());
    }

    void Count()
    {
        clicks += 10;
    }

    void StartTimers()
    {
        Timer.Every(0.1f, () => ticks++);
        Timer.After(0.55f, () => {
            Debug.Log("ticks " + ticks);
            Timer.CancelAll();
            SceneManager.FadeToScene(1, 0.2f);
        });
    }
}`);
    project.scripts.push(api);
    const button = entity("Button", [createUIButton({ text: "Tamam" })]);
    const bar = entity("Bar", [createUIProgressBar()]);
    const label = entity("Label", [createUIText({ text: "Merhaba" })]);
    project.scenes[0].objects.push(button, bar, label, entity("Probe", [createScriptComponent(api.id, "ApiProbe", { fields: { button: { ref: "entity", id: button.id }, bar: { ref: "entity", id: bar.id }, label: { ref: "entity", id: label.id } } })]));
    const storage = memoryStorage();
    const { world, step, find, messages, problems } = startWorld(project, { storage });
    step(1);
    assert.deepEqual(messages("info").slice(0, 4), ["clicks 12", "bar 10 1", "prefs True True", `engine ${types.ENGINE_VERSION}.0 ui False`]);
    assert.equal(find("Label").uiAlpha < 1, true);
    step(40);
    assert.ok(messages("info").includes("moved 4"));
    assert.ok(messages("info").includes("value 10"));
    assert.ok(messages("info").includes("ticks 5"));
    assert.equal(world.timers.activeCount, 0, "Timer.CancelAll stopped the repeating timer");
    assert.ok(world.fadeState(), "the fade-out is running");
    assert.equal(world.scene.name, project.scenes[0].name);
    step(30);
    assert.equal(world.scene.name, "İkinci");
    assert.equal(world.fadeState(), null, "the new scene faded in");
    assert.deepEqual(problems(), []);
});

test("Inspector On Click calls methods and hotkeys press buttons", () => {
    const project = createBlankProject("Clicks", "2d");
    const counter = script("Counter.cs", `
using UnityEngine;

public class Counter : MonoBehaviour
{
    public int count;

    public void Add()
    {
        count++;
        Debug.Log("count " + count);
    }
}`);
    project.scripts.push(counter);
    const holder = entity("Holder", [createScriptComponent(counter.id, "Counter")]);
    const button = entity("Button", [createUIButton({ text: "+1", width: 200, height: 60, onClick: { targetId: holder.id, method: "Add" }, hotkey: "K" })]);
    project.scenes[0].objects.push(holder, button);
    const { world, step, messages, problems } = startWorld(project);
    step(1);
    const input = world.input;
    // Mouse click in the middle of the screen (the button is centered).
    input.mouseX = 480;
    input.mouseY = 270;
    input.pendingMouseDown.add(0);
    input.mouseHeld.add(0);
    step(1);
    assert.equal(world.pointerOverUI, true);
    input.mouseHeld.delete(0);
    input.pendingMouseUp.add(0);
    step(1);
    input.setVirtualKey("K", true);
    step(1);
    input.setVirtualKey("K", false);
    step(1);
    assert.deepEqual(messages("info"), ["count 1", "count 2"]);
    assert.deepEqual(problems(), []);
});

test("C++ lambdas work with Timer and Tween", () => {
    const project = createBlankProject("Cpp", "3d");
    const cpp = script("Ticker.cpp", `
#include <hanogt.h>

class Ticker : public MonoBehaviour {
public:
    int ticks = 0;
    float last = 0.0f;

    void Start() {
        Timer::Every(0.1f, [this]() { ticks++; });
        Tween::Value(0.0f, 2.0f, 0.2f, [&](float v) { last = v; });
        Timer::After(0.35f, [this]() mutable -> void {
            Debug::Log("ticks " + std::to_string(ticks) + " last " + std::to_string((int)last));
        });
    }
};`);
    project.scripts.push(cpp);
    project.scenes[0].objects.push(entity("Ticker", [createScriptComponent(cpp.id, "Ticker")]));
    const { step, messages, problems } = startWorld(project);
    step(30);
    assert.deepEqual(messages("info"), ["ticks 3 last 2"]);
    assert.deepEqual(problems(), []);
});

test("the new globals are known to the analyser and defined at runtime", () => {
    const { world } = startWorld(createBlankProject("Globals", "2d"));
    for (const name of ["Tween", "Timer", "Ease", "LoopType", "UI", "EventSystem"]) {
        assert.ok(GLOBAL_NAMES.has(name), `${name} is a known global`);
        assert.ok(world.interpreter.getGlobal(name, null, null), `${name} is defined`);
    }
});

test("UI layout matches between overlay and hit testing", () => {
    const screen = { width: 960, height: 540 };
    assert.deepEqual(uiRect({ anchor: "center", offset: { x: 0, y: 0 }, width: 200, height: 60 }, screen), { left: 380, top: 240, width: 200, height: 60 });
    assert.deepEqual(uiRect({ anchor: "top-right", offset: { x: 10, y: 20 }, width: 100, height: 40 }, screen), { left: 850, top: 20, width: 100, height: 40 });
    assert.deepEqual(uiRect({ anchor: "bottom", offset: { x: 0, y: 10 }, width: 100, height: 40 }, { width: 960, height: 1080 }), { left: 380, top: 980, width: 200, height: 80 });
    assert.equal(progressFraction({ value: 5, min: 0, max: 10 }), 0.5);
    assert.equal(progressFraction({ value: 5, min: 3, max: 3 }), 1);
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

test("V3 templates keep their badge and every template plays without errors", () => {
    const ids = PROJECT_TEMPLATES.map((info) => info.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(PROJECT_TEMPLATES.filter((info) => info.since === 3).map((info) => info.id), ["tilemap-platformer-2d", "clicker-ui-2d", "runner-3d"]);
    for (const info of PROJECT_TEMPLATES) {
        const project = createProjectFromTemplate(info.id);
        assert.equal(project.dimension, info.dimension);
        assert.equal(project.settings.startSceneId, project.scenes[0].id);
        const { step, problems } = startWorld(project);
        step(300);
        assert.deepEqual(problems(), [], `${info.id} runs cleanly`);
    }
});

test("tilemap adventure: pause menu, bridge key and win panel", () => {
    const project = normalizeProject(createProjectFromTemplate("tilemap-platformer-2d"));
    assert.deepEqual(project.scenes.map((scene) => scene.name), ["Seviye 1", "Seviye 2"]);
    const storage = memoryStorage();
    const { world, step, find, problems } = startWorld(project, { sceneId: project.scenes[1].id, storage });
    step(30);
    world.input.setVirtualKey("P", true);
    step(1);
    world.input.setVirtualKey("P", false);
    step(1);
    assert.equal(world.timeScale, 0);
    assert.equal(find("PauseMenu").activeSelf, true);
    world.input.setVirtualKey("P", true);
    step(1);
    world.input.setVirtualKey("P", false);
    step(1);
    assert.equal(world.timeScale, 1);

    find("Player").setWorldPosition({ x: 13.5, y: 6, z: 0 });
    step(150);
    const ground = find("Ground").components.find((component) => component.type === "tilemap");
    for (let x = 20; x <= 27; x += 1) assert.equal(tileAt(ground, x, -1)?.name, "Tuğla", `bridge tile ${x}`);

    find("Player").setWorldPosition({ x: 55.5, y: 0.5, z: 0 });
    world.input.setVirtualKey("RightArrow", true);
    step(90);
    world.input.setVirtualKey("RightArrow", false);
    step(30);
    assert.equal(find("WinPanel").activeSelf, true);
    world.stop();
    assert.ok([...storage.store.values()].some((value) => value.includes("tilemap.bestCoins")));
    assert.deepEqual(problems(), []);
});

test("clicker factory: menu, production, upgrades and saving", () => {
    const storage = memoryStorage();
    const { world, step, find, problems } = startWorld(createProjectFromTemplate("clicker-ui-2d"), { storage });
    const press = (key) => {
        world.input.setVirtualKey(key, true);
        step(1);
        world.input.setVirtualKey(key, false);
        step(1);
    };
    const text = (name) => find(name).components.find((component) => component.type === "uiText").text;
    step(10);
    assert.equal(world.scene.name, "Menü");
    press("Space");
    step(60);
    assert.equal(world.scene.name, "Fabrika");
    for (let index = 0; index < 40; index += 1) press("Space");
    assert.equal(text("GoldText"), "40 altın");
    press("Alpha1");
    press("Alpha2");
    // 40 - 10 (stronger click) - 25 (first worker), plus the worker's first gold if its timer ticked meanwhile.
    assert.ok(["5 altın", "6 altın"].includes(text("GoldText")), text("GoldText"));
    assert.match(text("IncomeText"), /Tık başına 2 .*Saniyede 1/);
    const gold = () => Number.parseInt(text("GoldText"), 10);
    const before = gold();
    step(60);
    assert.equal(gold(), before + 1, "one worker produces 1 gold per second");
    const produce = find("ProduceButton");
    assert.ok(Math.abs(produce.localScale.x - 1) < 1e-6, "punches settle back to the original scale");
    const saved = gold();
    const menuButton = find("MenuButton");
    world.clickButton(menuButton, menuButton.components.find((component) => component.type === "uiButton"));
    step(60);
    assert.equal(world.scene.name, "Menü");
    assert.equal(text("SavedText"), `Kayıtlı oyun: ${saved} altın, 1 işçi`);
    assert.deepEqual(problems(), []);
});

test("foggy runner: obstacles end the run and the panel restarts it", () => {
    const project = normalizeProject(createProjectFromTemplate("runner-3d"));
    const settings = project.scenes[0].settings;
    assert.equal(settings.fog.mode, "exponential");
    assert.equal(settings.postProcessing.bloom.enabled, true);
    const { world, step, find, problems } = startWorld(project);
    step(30);
    const player = find("Player");
    const startZ = player.world.position.z;
    step(60);
    assert.ok(player.world.position.z - startZ > 8, "the runner moves forward");
    // Move a spawned obstacle right in front of the runner.
    const obstacle = [...world.entities.values()].find((item) => item.name.startsWith("Obstacle") && item.world.position.z > player.world.position.z + 3);
    assert.ok(obstacle, "rows of obstacles are spawned ahead");
    obstacle.setWorldPosition({ x: player.world.position.x, y: 0.6, z: player.world.position.z + 1.5 });
    step(70);
    assert.equal(find("GameOverPanel").activeSelf, true);
    world.input.setVirtualKey("R", true);
    step(1);
    world.input.setVirtualKey("R", false);
    step(2);
    assert.equal(find("GameOverPanel").activeSelf, false, "the scene was reloaded");
    assert.deepEqual(problems(), []);
});

test("the exported-HTML player bundle builds with the current runtime", async () => {
    // Same settings as scripts/build-player.mjs, kept in memory (public/engine is generated, not committed).
    const { build } = await import("esbuild");
    const result = await build({
        entryPoints: [fileURLToPath(new URL("src/lib/game-engine/player/standalone.ts", ROOT))],
        bundle: true,
        minify: true,
        write: false,
        format: "iife",
        target: ["es2019"],
        platform: "browser",
        logLevel: "silent",
        define: { "process.env.NODE_ENV": '"production"' },
    });
    assert.deepEqual(result.errors, []);
    const bundle = result.outputFiles[0].text;
    for (const marker of [types.ENGINE_VERSION_LABEL, "FadeToScene", "uiButton", "tilemap", "PunchScale"]) assert.ok(bundle.includes(marker), marker);
});

test("cloud project errors carry the server's code, plan and limit (game_limit)", async () => {
    const persistence = await load("components/GameEngine/editor/persistence.ts");
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "Planının oyun projesi sınırına ulaştın (10).", code: "game_limit", plan: "free", limit: 10 }), { status: 409, headers: { "content-type": "application/json" } });
    try {
        await assert.rejects(persistence.listCloudProjects(), (error) => {
            assert.ok(error instanceof persistence.PersistenceError);
            assert.deepEqual([error.status, error.code, error.plan, error.limit], [409, "game_limit", "free", 10]);
            return true;
        });
        globalThis.fetch = async () => new Response(JSON.stringify({ error: "x", code: 7, limit: "10" }), { status: 400 });
        await assert.rejects(persistence.listCloudProjects(), (error) => {
            assert.deepEqual([error.code, error.plan, error.limit], [null, null, null], "junk fields are dropped");
            return true;
        });
    } finally {
        globalThis.fetch = realFetch;
    }
});
