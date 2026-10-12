// Hanogt Engine V6: a lighter player, layers and the collision matrix, object
// pools, particles V2, rule tiles, touch controls, animation events, prefab
// links and debugging help.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "./setup.mjs";

const types = await load("lib/game-engine/types.ts");
const { normalizeProject } = await load("lib/game-engine/schema.ts");
const { createBlankProject } = await load("lib/game-engine/scene.ts");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

test("engine reports V6", () => {
    assert.equal(types.GAME_ENGINE_SCHEMA_VERSION, 6);
    assert.equal(types.ENGINE_VERSION, 6);
    assert.equal(types.ENGINE_VERSION_LABEL, "Hanogt Engine V6");
    assert.deepEqual(types.ENGINE_RULES, [3, 4, 5, 6]);
});

test("new projects use V6 rules; V5 documents keep V5 rules", () => {
    const fresh = normalizeProject(createBlankProject("Yeni", "2d"));
    assert.equal(fresh.version, 6);
    assert.equal(fresh.settings.rules, 6);
    const v5 = JSON.parse(JSON.stringify(fresh));
    v5.version = 5;
    v5.settings.rules = 5;
    const migrated = normalizeProject(v5);
    assert.equal(migrated.version, 6);
    assert.equal(migrated.settings.rules, 5, "a V5 game keeps playing by V5 rules");
    assert.equal(normalizeProject(JSON.parse(JSON.stringify(migrated))).settings.rules, 5, "saving and loading keeps them");
    delete v5.settings.rules;
    assert.equal(normalizeProject(v5).settings.rules, 5, "a V5 document without rules gets V5's");
    assert.throws(() => normalizeProject({ ...fresh, version: 7 }), /daha yeni/, "a newer engine's document is refused");
});

// ---------------------------------------------------------------------------
// Bundle headroom: the player leaves the editor's code out
// ---------------------------------------------------------------------------

/** player.js as scripts/build-player.mjs builds it, kept in memory. */
async function buildPlayer() {
    const { build } = await import("esbuild");
    const { playerBuildOptions } = await import("../player-build-options.mjs");
    const result = await build({ ...playerBuildOptions(fileURLToPath(new URL("../../", import.meta.url))), write: false, logLevel: "silent" });
    assert.deepEqual(result.errors, []);
    return result.outputFiles[0].text;
}

test("player.js carries no editor code (camera controls, gizmos, box selection) and is far below V5's size", async () => {
    const bundle = await buildPlayer();
    // OrbitControls ("grabbing" cursor), TransformControls ("worldQuaternionStart", "translationSnap",
    // "dragging-changed") and the Scene view's box selection stay in the editor.
    for (const marker of ["grabbing", "worldQuaternionStart", "translationSnap", "dragging-changed", "data-scene-marquee"]) {
        assert.ok(!bundle.includes(marker), `${marker} must not be in player.js`);
    }
    const { PLAYER_BUDGET_KIB } = await import("../player-build-options.mjs");
    const kilobytes = Buffer.byteLength(bundle) / 1024;
    assert.ok(kilobytes < PLAYER_BUDGET_KIB, `player.js is ${Math.round(kilobytes)} KiB`);
    // V5's player was 1,241 KiB. Moving the editor out freed 111 KiB (1,130 KiB); the V6 runtime
    // features (layers, pools, particles V2, rule tiles, touch controls, animation events, log
    // points…) took 34 KiB of that back: 1,164 KiB when V6 shipped. Keep at least 60 KiB of the gain.
    assert.ok(kilobytes < 1180, `player.js is ${Math.round(kilobytes)} KiB (V5: 1241 KiB, V6: 1164 KiB)`);
});

test("sprite shapes are drawn without three's curve classes and keep their outlines", async () => {
    const { RenderAssets } = await load("lib/game-engine/render/assets.ts");
    const assets = new RenderAssets();
    const area = (geometry) => {
        const position = geometry.getAttribute("position");
        const index = geometry.getIndex();
        let total = 0;
        for (let face = 0; face < index.count; face += 3) {
            const [a, b, c] = [index.getX(face), index.getX(face + 1), index.getX(face + 2)];
            const ax = position.getX(a), ay = position.getY(a);
            total += ((position.getX(b) - ax) * (position.getY(c) - ay) - (position.getX(c) - ax) * (position.getY(b) - ay)) / 2;
        }
        return total;
    };
    // Counter-clockwise fans: the signed area is the shape's area (positions are 32-bit floats).
    assert.ok(Math.abs(area(assets.sprite("triangle")) - 0.5) < 1e-6);
    assert.ok(Math.abs(area(assets.sprite("diamond")) - 0.5) < 1e-6);
    assert.ok(Math.abs(area(assets.sprite("hexagon")) - (3 * Math.sqrt(3) / 2) * 0.25) < 1e-6);
    const corner = 0.14;
    // Each quadratic corner (control point at the square's corner) cuts off r²/6.
    const rounded = area(assets.sprite("roundedSquare"));
    assert.ok(Math.abs(rounded - (1 - (4 * corner * corner) / 6)) < 0.002, `rounded square area ${rounded}`);
    const uv = assets.sprite("star").getAttribute("uv");
    assert.equal(uv.count, 11, "center + 10 star points");
    assets.dispose();
});

// ---------------------------------------------------------------------------
// Layers and the collision matrix
// ---------------------------------------------------------------------------

const C = await load("lib/game-engine/components.ts");
const L = await load("lib/game-engine/layers.ts");
const { startWorld } = await import("./engine-helpers.mjs");

/** An object with a transform at (x, y) and the given components. */
function object(name, x, y, components, extra = {}) {
    return { id: `entity_${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`, name, tag: "Untagged", layer: 0, parentId: null, active: true, components: [C.createTransform({ position: { x, y, z: 0 } }), ...components], ...extra };
}

/** 2D project with layers Ground (1), Player (2), Ghost (3), Ignore Raycast (4); Ghost passes through Ground. */
function layeredProject({ rules = 6, script = null, objects = [], mutate } = {}) {
    const project = createBlankProject("Layers", "2d");
    project.settings.rules = rules;
    const layers = L.defaultLayerSettings();
    layers.names[1] = "Ground";
    layers.names[2] = "Player";
    layers.names[3] = "Ghost";
    layers.names[4] = "Ignore Raycast";
    L.setLayerCollision(layers.collisions, 1, 3, false);
    project.settings.layers = layers;
    const box = (shape = "box") => C.createCollider({ shape, size: { x: 1, y: 1, z: 1 }, radius: 0.5 });
    project.scenes[0].objects.push(
        object("Floor", 0, -2, [C.createSpriteRenderer(), C.createCollider({ shape: "box", size: { x: 20, y: 1, z: 1 } })], { layer: 1 }),
        object("Hero", -3, 0, [C.createSpriteRenderer(), C.createRigidBody(), box()], { layer: 2 }),
        object("Spirit", 3, 0, [C.createSpriteRenderer(), C.createRigidBody(), box()], { layer: 3 }),
        ...objects,
    );
    if (script) {
        project.scripts = [{ id: "script_probe", name: "Probe.cs", language: "csharp", content: script }];
        project.scenes[0].objects.push(object("Probe", 0, 5, [C.createScriptComponent("script_probe", "Probe")]));
    }
    mutate?.(project);
    return project;
}

test("layers: the schema keeps 16 named layers (0 is Default) and a symmetric matrix; entities keep their layer", () => {
    const fresh = normalizeProject(createBlankProject("Yeni", "2d"));
    assert.equal(fresh.settings.layers.names.length, 16);
    assert.equal(fresh.settings.layers.names[0], "Default");
    assert.ok(fresh.settings.layers.collisions.every((row) => row === 0xffff), "everything collides by default");
    const raw = JSON.parse(JSON.stringify(fresh));
    raw.settings.layers = {
        names: ["Zemin", "Enemy", "enemy", "  Player  ", "bad\"name", 42, "Ignore Raycast", ...Array(20).fill("Extra")],
        collisions: [0xffff, 0xffff & ~(1 << 3), 0xffff, 0xffff, "x", -1, 0x1ffff],
    };
    raw.scenes[0].objects.push(object("A", 0, 0, [], { layer: 9 }), object("B", 0, 0, [], { layer: 99 }), object("C", 0, 0, [], { layer: -2 }));
    const project = normalizeProject(raw);
    const { names, collisions } = project.settings.layers;
    assert.equal(names[0], "Default", "layer 0 is always Default");
    assert.equal(names[1], "Enemy");
    assert.equal(names[2], "", "a name is used once (ignoring case)");
    assert.equal(names[3], "Player", "spaces are trimmed");
    assert.equal(names[4], "", "quotes are not allowed");
    assert.equal(names[5], "");
    assert.equal(names[6], "Ignore Raycast");
    assert.equal(names.length, 16);
    assert.equal(L.layersCollide(collisions, 1, 3), false, "row 1 drops layer 3");
    assert.equal(L.layersCollide(collisions, 3, 1), false, "so row 3 drops layer 1 (symmetric)");
    assert.equal(L.layersCollide(collisions, 3, 3), true);
    assert.ok(collisions.every((row) => row >= 0 && row <= 0xffff));
    const layerOf = (name) => project.scenes[0].objects.find((item) => item.name === name).layer;
    assert.deepEqual([layerOf("A"), layerOf("B"), layerOf("C")], [9, 0, 0]);
});

test("layers: the collision matrix keeps layers apart (contacts and triggers)", () => {
    const sensorScript = [C.createScriptComponent("script_sensor", "Sensor")];
    const trigger = () => C.createCollider({ shape: "box", size: { x: 2, y: 1, z: 1 }, isTrigger: true });
    const game = startWorld(layeredProject({
        objects: [
            // Both sensors sit in the spirit's fall: Ground (1) ignores Ghost (3), Default (0) doesn't.
            object("GroundSensor", 3, -4, [trigger(), ...sensorScript], { layer: 1 }),
            object("DefaultSensor", 3, -6, [trigger(), ...sensorScript], { layer: 0 }),
        ],
        mutate: (project) => {
            project.scripts = [{ id: "script_sensor", name: "Sensor.cs", language: "csharp", content: `using UnityEngine;
public class Sensor : MonoBehaviour
{
    void OnTriggerEnter2D(Collider2D other) { Debug.Log(name + " saw " + other.name); }
}` }];
        },
    }));
    game.step(120);
    const hero = game.find("Hero");
    const spirit = game.find("Spirit");
    assert.ok(Math.abs(hero.world.position.y - -1) < 0.1, `the hero (Player) lands on the floor (Ground): y=${hero.world.position.y.toFixed(2)}`);
    assert.ok(spirit.world.position.y < -7, `the spirit (Ghost) falls through the Ground layer: y=${spirit.world.position.y.toFixed(2)}`);
    assert.deepEqual(game.messages("info"), ["DefaultSensor saw Spirit"], "only the Default-layer trigger sees the spirit");
    assert.deepEqual(game.problems(), []);
});

test("layers: LayerMask, gameObject.layer, layer masks on 2D raycasts and overlaps, Ignore Raycast and IgnoreCollision (V6 rules)", () => {
    const game = startWorld(layeredProject({
        objects: [object("Crate", 6, -1, [C.createSpriteRenderer(), C.createCollider({ shape: "box" })], { layer: 4 })],
        script: `using UnityEngine;
public class Probe : MonoBehaviour
{
    public LayerMask groundMask;
    public LayerMask unset;
    void Start()
    {
        Debug.Log("mask " + LayerMask.GetMask("Ground", "Ghost"));
        Debug.Log("array " + LayerMask.GetMask(new string[] { "Player" }));
        Debug.Log("name " + LayerMask.NameToLayer("player") + " " + LayerMask.LayerToName(3) + " [" + LayerMask.LayerToName(9) + "]");
        Debug.Log("field " + groundMask.value + " unset " + unset);
        GameObject hero = GameObject.Find("Hero");
        Debug.Log("layer " + hero.layer);
        RaycastHit2D any = Physics2D.Raycast(new Vector2(-3, 4), Vector2.down);
        Debug.Log("first " + any.collider.name);
        RaycastHit2D ground = Physics2D.Raycast(new Vector2(-3, 4), Vector2.down, 20f, groundMask);
        Debug.Log("ground " + ground.collider.name);
        RaycastHit2D none = Physics2D.Raycast(new Vector2(-3, 4), Vector2.down, 20f, LayerMask.GetMask("Ghost"));
        Debug.Log("ghost only " + (none ? "hit" : "miss"));
        Debug.Log("all " + Physics2D.RaycastAll(new Vector2(-3, 4), Vector2.down, 20f, LayerMask.GetMask("Player", "Ground")).Length);
        RaycastHit2D crate = Physics2D.Raycast(new Vector2(6, 4), Vector2.down);
        Debug.Log("crate " + crate.collider.name);
        Debug.Log("crate asked " + Physics2D.Raycast(new Vector2(6, 4), Vector2.down, 20f, Physics2D.AllLayers).collider.name);
        Debug.Log("overlap " + (Physics2D.OverlapCircle(new Vector2(-3, 0), 0.6f, LayerMask.GetMask("Ground")) == null) + " " + Physics2D.OverlapCircle(new Vector2(-3, 0), 0.6f, LayerMask.GetMask("Player")).name);
        hero.layer = LayerMask.NameToLayer("Ghost");
        Debug.Log("moved " + hero.layer + " " + (Physics2D.Raycast(new Vector2(-3, 4), Vector2.down, 20f, LayerMask.GetMask("Player")) ? "hit" : "miss"));
        Debug.Log("ignored " + Physics2D.GetIgnoreLayerCollision(1, 3) + " " + Physics2D.GetIgnoreLayerCollision(1, 2));
    }
}`,
        mutate: (project) => {
            const probe = project.scenes[0].objects.find((item) => item.name === "Probe");
            probe.components[1].fields = { groundMask: 1 << 1 };
        },
    }));
    game.step(1);
    const log = game.messages("info");
    assert.ok(log.includes(`mask ${(1 << 1) | (1 << 3)}`), log.join(" | "));
    assert.ok(log.includes(`array ${1 << 2}`));
    assert.ok(log.includes("name 2 Ghost []"), "NameToLayer ignores case; an unnamed layer has no name");
    assert.ok(log.includes("field 2 unset 0"), "the Inspector's mask reaches the field; an unset LayerMask is Nothing");
    assert.ok(log.includes("layer 2"));
    assert.ok(log.includes("first Hero"));
    assert.ok(log.includes("ground Floor"), "the mask skips the hero");
    assert.ok(log.includes("ghost only miss"));
    assert.ok(log.includes("all 2"));
    assert.ok(log.includes("crate Floor"), "a raycast without a mask skips the Ignore Raycast layer");
    assert.ok(log.includes("crate asked Crate"), "AllLayers includes it");
    assert.ok(log.includes("overlap True Hero"));
    assert.ok(log.includes("moved 3 miss"), "the hero moved to the Ghost layer");
    assert.ok(log.includes("ignored True False"));
    assert.deepEqual(game.problems(), []);
    // The hero is a Ghost now: it falls through the floor.
    game.step(90);
    assert.ok(game.find("Hero").world.position.y < -3, "after the layer change the hero falls through Ground");
});

test("layers: Physics.IgnoreLayerCollision and Physics2D.IgnoreCollision work while playing; layer numbers are checked", () => {
    const game = startWorld(layeredProject({
        script: `using UnityEngine;
public class Probe : MonoBehaviour
{
    void Start()
    {
        Physics2D.IgnoreLayerCollision(1, 2);
        Physics2D.IgnoreCollision(GameObject.Find("Spirit").GetComponent<Collider2D>(), GameObject.Find("Floor").GetComponent<Collider2D>(), false);
        Physics2D.IgnoreLayerCollision(1, 3, false);
    }
    public void Bad() { Physics2D.IgnoreLayerCollision(1, 16); }
    public void BadLayer() { gameObject.layer = 20; }
}`,
    }));
    game.step(90);
    assert.ok(game.find("Hero").world.position.y < -3, "Player no longer collides with Ground");
    assert.ok(Math.abs(game.find("Spirit").world.position.y - -1) < 0.1, "Ghost collides with Ground again");
    const probe = game.find("Probe").behaviours[0];
    game.world.callMethod(probe, "Bad");
    game.world.callMethod(probe, "BadLayer");
    const errors = game.messages("error");
    assert.ok(errors.some((message) => message.includes("0 ile 15")), errors.join(" | "));
    assert.ok(errors.some((message) => message.includes("gameObject.layer")), errors.join(" | "));

    // A single pair: the hero passes through the floor while every other Player would land.
    const pair = startWorld(layeredProject({
        script: `using UnityEngine;
public class Probe : MonoBehaviour
{
    void Start() { Physics2D.IgnoreCollision(GameObject.Find("Hero").GetComponent<Collider2D>(), GameObject.Find("Floor").GetComponent<BoxCollider2D>()); }
}`,
    }));
    pair.step(90);
    assert.ok(pair.find("Hero").world.position.y < -3, "the ignored pair passes through");
    assert.deepEqual(pair.problems(), []);
});

test("layers: 3D raycasts take the mask after the out hit and the distance; overlaps default to every layer", () => {
    const project = createBlankProject("Layers3D", "3d");
    project.settings.layers.names[5] = "Water";
    const cube = (name, z, layer) => ({ ...object(name, 0, 0, [C.createMeshRenderer(), C.createCollider({ shape: "box" })], { layer }), components: [C.createTransform({ position: { x: 0, y: 3, z } }), C.createMeshRenderer(), C.createCollider({ shape: "box" })] });
    project.scenes[0].objects.push(cube("Near", 3, 5), cube("Far", 6, 0));
    project.scripts = [{ id: "script_probe", name: "Probe.cs", language: "csharp", content: `using UnityEngine;
public class Probe : MonoBehaviour
{
    void Start()
    {
        RaycastHit hit;
        if (Physics.Raycast(new Vector3(0, 3, -5), Vector3.forward, out hit, 100f)) Debug.Log("plain " + hit.collider.name);
        int water = 1 << LayerMask.NameToLayer("Water");
        if (Physics.Raycast(new Vector3(0, 3, -5), Vector3.forward, out hit, 100f, ~water)) Debug.Log("not water " + hit.collider.name);
        Ray ray = new Ray(new Vector3(0, 3, -5), Vector3.forward);
        if (Physics.Raycast(ray, out hit, 100f, water)) Debug.Log("ray water " + hit.collider.name);
        Debug.Log("short " + Physics.Raycast(new Vector3(0, 3, -5), Vector3.forward, 6f, LayerMask.GetMask("Default")));
        Debug.Log("sphere " + Physics.OverlapSphere(new Vector3(0, 3, 3), 0.6f).Length + " " + Physics.OverlapSphere(new Vector3(0, 3, 3), 0.6f, LayerMask.GetMask("Default")).Length);
    }
}` }];
    project.scenes[0].objects.push(object("Probe", 0, 5, [C.createScriptComponent("script_probe", "Probe")]));
    const game = startWorld(project);
    game.step(1);
    const log = game.messages("info");
    assert.ok(log.includes("plain Near"), log.join(" | "));
    assert.ok(log.includes("not water Far"));
    assert.ok(log.includes("ray water Near"));
    assert.ok(log.includes("short False"), "the far cube is out of reach");
    assert.ok(log.includes("sphere 1 0"));
    assert.deepEqual(game.problems(), []);
});

test("layers under V5 rules: script masks and layer changes are ignored as before, but the editor's matrix still applies", () => {
    const game = startWorld(layeredProject({
        rules: 5,
        script: `using UnityEngine;
public class Probe : MonoBehaviour
{
    void Start()
    {
        Debug.Log("mask " + LayerMask.GetMask("Ground") + " " + LayerMask.NameToLayer("Ghost") + " " + LayerMask.LayerToName(3));
        RaycastHit2D hit = Physics2D.Raycast(new Vector2(-3, 4), Vector2.down, 20f, LayerMask.GetMask("Ground"));
        Debug.Log("hit " + hit.collider.name);
        GameObject hero = GameObject.Find("Hero");
        hero.layer = 3;
        Physics2D.IgnoreLayerCollision(1, 2);
        Debug.Log("layer " + hero.layer + " " + Physics.DefaultRaycastLayers);
    }
}`,
    }));
    game.step(90);
    const log = game.messages("info");
    assert.ok(log.includes("mask -1 0 Default"), log.join(" | "));
    assert.ok(log.includes("hit Hero"), "V5 rules: the mask is ignored");
    assert.ok(log.includes("layer 2 -5"), "V5 rules: the layer stays");
    assert.ok(Math.abs(game.find("Hero").world.position.y - -1) < 0.1, "IgnoreLayerCollision does nothing under V5 rules");
    assert.ok(game.find("Spirit").world.position.y < -3, "the matrix set in the editor still keeps Ghost off Ground");
});

// ---------------------------------------------------------------------------
// Object pools
// ---------------------------------------------------------------------------

const BULLET_SCRIPT = `using UnityEngine;
public class Bullet : MonoBehaviour
{
    public int lives;
    public float speed = 4f;
    void Awake() { Debug.Log("awake " + name); }
    void Start() { Debug.Log("start"); }
    void OnEnable() { lives++; Debug.Log("enable " + lives); Invoke("Tick", 0.5f); }
    void OnDisable() { Debug.Log("disable"); }
    void Tick() { Debug.Log("tick"); }
}`;

const SHOOTER_SCRIPT = `using UnityEngine;
public class Shooter : MonoBehaviour
{
    public GameObject bulletPrefab;
    public GameObject last;
    void Start() { Debug.Log("ready " + Pool.Prewarm("Bullet", 3) + " " + Pool.CountAll("Bullet") + " " + Pool.Count(bulletPrefab)); }
    public void Fire(float x) { last = Pool.Spawn(bulletPrefab, new Vector3(x, 0, 0)); }
    public void FireTurned() { last = Pool.Spawn("bullet", new Vector3(1, 2, 0), Quaternion.Euler(0, 0, 90)); }
    public void Back() { Pool.Despawn(last); }
    public void BackLater(float seconds) { Pool.Despawn(last, seconds); }
    public void Push() { last.GetComponent<Rigidbody2D>().velocity = new Vector2(5, 0); last.transform.localScale = new Vector3(3, 3, 1); }
    public void Typed() { Bullet b = Pool.Spawn<Bullet>("Bullet", Vector3.zero); Debug.Log("typed " + b.lives + " " + b.speed); }
    public void Counts() { Debug.Log("counts " + Pool.Count("Bullet") + " " + Pool.CountInactive("Bullet") + " " + Pool.CountAll("Bullet") + " " + Pool.GetCapacity("Bullet")); }
    public void Cap(int n) { Pool.SetCapacity("Bullet", n); }
    public void Missing() { Pool.Spawn("Rocket", Vector3.zero); }
    public void NotPooled() { Pool.Despawn(GameObject.Find("Wall")); }
}`;

function poolProject(mutate) {
    const project = createBlankProject("Pools", "2d");
    project.scripts = [
        { id: "script_bullet", name: "Bullet.cs", language: "csharp", content: BULLET_SCRIPT },
        { id: "script_shooter", name: "Shooter.cs", language: "csharp", content: SHOOTER_SCRIPT },
    ];
    project.prefabs = [{
        id: "prefab_bullet",
        name: "Bullet",
        entities: [object("Bullet", 0, 0, [C.createSpriteRenderer({ shape: "circle" }), C.createRigidBody({ useGravity: false }), C.createCollider({ shape: "circle", radius: 0.2, isTrigger: true }), C.createScriptComponent("script_bullet", "Bullet")], { layer: 0 })],
    }];
    const shooter = C.createScriptComponent("script_shooter", "Shooter");
    shooter.fields = { bulletPrefab: { ref: "prefab", id: "prefab_bullet" } };
    project.scenes[0].objects.push(object("Gun", 0, 0, [shooter]), object("Wall", 5, 0, [C.createSpriteRenderer()]));
    mutate?.(project);
    return project;
}

test("Pool: Prewarm makes inactive copies; Spawn reuses them (Awake/Start once, OnEnable every time) and Despawn only deactivates", () => {
    const game = startWorld(poolProject());
    const gun = game.find("Gun").behaviours[0];
    const call = (method, ...args) => game.world.callMethod(gun, method, args);
    game.step(1);
    assert.deepEqual(game.messages("info"), ["ready 3 3 0"], "three waiting copies, none in use, and no Awake yet");
    assert.equal(game.findAll("Bullet(Clone)").length, 3);
    assert.ok(game.findAll("Bullet(Clone)").every((entity) => !entity.activeSelf));

    call("Fire", 2);
    const first = game.fields("Gun").last.entity;
    game.step(1);
    assert.deepEqual(game.messages("info").slice(1), ["awake Bullet(Clone)", "enable 1", "start"]);
    assert.ok(first.activeSelf);
    assert.equal(first.world.position.x, 2);
    call("Counts");
    assert.equal(game.messages("info").at(-1), "counts 1 2 3 200");

    call("Push");
    call("Back");
    assert.equal(game.messages("info").at(-1), "disable");
    assert.ok(!first.activeSelf && !first.destroyed, "despawned copies are deactivated, not destroyed");
    game.step(40);
    assert.ok(!game.messages("info").includes("tick"), "Despawn cancels the copy's pending Invoke");

    call("Fire", -1);
    const again = game.fields("Gun").last.entity;
    game.step(1);
    assert.equal(again.id, first.id, "the despawned copy comes back");
    assert.deepEqual(game.messages("info").slice(-1), ["enable 2"], "OnEnable again, but no Awake or Start");
    assert.equal(again.body.velocity.x, 0, "its Rigidbody starts still again");
    assert.deepEqual(again.localScale, { x: 1, y: 1, z: 1 }, "and the prefab's scale");
    assert.equal(again.world.position.x, -1);
    game.step(31);
    assert.ok(game.messages("info").includes("tick"), "the new life's Invoke runs");

    call("FireTurned");
    const turned = game.fields("Gun").last.entity;
    assert.ok(Math.abs(Math.abs(turned.world.rotation.z) - Math.SQRT1_2) < 1e-6, "Spawn takes a rotation");
    assert.deepEqual(game.problems(), []);
});

test("Pool: a delayed Despawn skips copies that came back meanwhile; full pools reuse the oldest copy; Spawn<T>, Clear and errors", () => {
    const game = startWorld(poolProject());
    const gun = game.find("Gun").behaviours[0];
    const call = (method, ...args) => game.world.callMethod(gun, method, args);
    game.step(1);
    call("Fire", 0);
    const copy = game.fields("Gun").last.entity;
    call("BackLater", 0.2);
    game.step(15);
    assert.ok(!copy.activeSelf, "despawned after 0.2 s");

    call("Fire", 0);
    assert.equal(game.fields("Gun").last.entity.id, copy.id);
    call("BackLater", 0.2);
    call("Back");
    call("Fire", 0);
    assert.equal(game.fields("Gun").last.entity.id, copy.id, "despawned and spawned again before the delay ran out");
    game.step(20);
    assert.ok(copy.activeSelf, "the old delayed Despawn belongs to the previous life");

    call("Cap", 2);
    call("Counts");
    assert.equal(game.messages("info").at(-1), "counts 1 1 2 2", "the extra waiting copy was destroyed");
    call("Fire", 1);
    call("Fire", 2);
    call("Counts");
    assert.equal(game.messages("info").at(-1), "counts 2 0 2 2", "the full pool reused the oldest copy");
    assert.ok(game.messages("warning").some((message) => message.includes("sınırına (2 kopya)")));

    call("Typed");
    assert.match(game.messages("info").at(-1), /^typed \d+ 4$/);

    call("Missing");
    assert.ok(game.messages("error").some((message) => message.includes("'Rocket' adında bir prefab yok")));
    call("NotPooled");
    assert.ok(!game.find("Wall")?.activeSelf, "a non-pooled object is just deactivated");
    assert.ok(game.messages("warning").some((message) => message.includes("bir havuzdan gelmedi")));
});

test("Pool: a script class of the same name still wins, and pooled copies leave with the scene", () => {
    const project = createBlankProject("OwnPool", "2d");
    project.scripts = [{ id: "script_own", name: "Pool.cs", language: "csharp", content: `using UnityEngine;
public class Pool
{
    public static int Spawn(string name) { return 42; }
}
public class User : MonoBehaviour
{
    void Start() { Debug.Log("own " + Pool.Spawn("x")); }
}` }];
    project.scenes[0].objects.push(object("User", 0, 0, [C.createScriptComponent("script_own", "User")]));
    const own = startWorld(project);
    own.step(1);
    assert.deepEqual(own.messages("info"), ["own 42"]);

    const game = startWorld(poolProject((draft) => {
        const second = JSON.parse(JSON.stringify(draft.scenes[0]));
        second.id = "scene_second";
        second.name = "Second";
        second.objects = second.objects.filter((item) => item.name === "Gun");
        draft.scenes.push(second);
    }));
    game.step(1);
    assert.equal(game.findAll("Bullet(Clone)").length, 3);
    game.world.requestSceneLoad("Second");
    game.step(2);
    assert.equal(game.findAll("Bullet(Clone)").length, 3, "the new scene's Gun prewarmed its own copies; the old ones were destroyed with their scene");
    assert.equal(game.world.pools.countAll(game.project.prefabs[0]), 3);
    assert.deepEqual(game.problems(), []);
});

// ---------------------------------------------------------------------------
// Particles V2
// ---------------------------------------------------------------------------

const P = await load("lib/game-engine/runtime/particles.ts");
const IDENTITY = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } };
const particle = (overrides = {}) => normalizeProject({
    ...createBlankProject("P", "3d"),
    scenes: [{ name: "S", objects: [object("E", 0, 0, [{ ...C.createParticleSystem({ playOnStart: true, loop: true, emissionRate: 0, lifetime: 100, startSpeed: 1, maxParticles: 400 }), ...overrides }])] }],
}).scenes[0].objects[0].components[1];
/** Particle i's start position and velocity. */
const particleAt = (emitter, index) => ({
    position: { x: emitter.positions[index * 3], y: emitter.positions[index * 3 + 1], z: emitter.positions[index * 3 + 2] },
    velocity: { x: emitter.velocities[index * 3], y: emitter.velocities[index * 3 + 1], z: emitter.velocities[index * 3 + 2] },
});

test("particles V2: a V5 system keeps its data, its point emission and exactly the colours and sizes the V5 renderer drew", async () => {
    const THREE = await import("three");
    // A V5 document has none of the new fields.
    const legacy = particle({ startColor: "#fde68a", endColor: "#f97316", startSize: 0.3, endSize: 0.05, spread: 25 });
    for (const key of ["shape", "bursts", "colorStops", "midSize", "textureId", "subEmitterId"]) assert.ok(key in legacy);
    assert.equal(legacy.shape, "point");
    assert.deepEqual(legacy.bursts, []);
    assert.deepEqual(legacy.colorStops, []);
    assert.equal(legacy.midSize, null);
    const emitter = new P.ParticleEmitter(legacy);
    emitter.emit(50, IDENTITY);
    for (let index = 0; index < 50; index += 1) {
        const { position, velocity } = particleAt(emitter, index);
        assert.deepEqual(position, { x: 0, y: 0, z: 0 }, "a point system starts every particle at the object");
        const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
        assert.ok(velocity.z / speed >= Math.cos((25 * Math.PI) / 180) - 1e-6, "inside the 25° cone around +Z");
    }
    const start = new THREE.Color("#fde68a");
    const end = new THREE.Color("#f97316");
    const out = [0, 0, 0, 0];
    for (const t of [0, 0.25, 0.5, 0.9, 1]) {
        P.particleColorAt(legacy, t, out);
        assert.ok(Math.abs(out[0] - (start.r + (end.r - start.r) * t)) < 1e-6 && Math.abs(out[1] - (start.g + (end.g - start.g) * t)) < 1e-6 && Math.abs(out[2] - (start.b + (end.b - start.b) * t)) < 1e-6, `colour at ${t}`);
        assert.ok(Math.abs(out[3] - (1 - t * t)) < 1e-9, `fade at ${t}`);
        assert.ok(Math.abs(P.particleSizeAt(legacy, t) - (0.3 + (0.05 - 0.3) * t)) < 1e-9, `size at ${t}`);
    }
});

test("particles V2: circle, cone, box and edge shapes start particles where they should and send them the right way", () => {
    const ring = new P.ParticleEmitter(particle({ shape: "circle", shapeRadius: 2, radiusThickness: 0 }));
    ring.emit(100, IDENTITY);
    for (let index = 0; index < 100; index += 1) {
        const { position, velocity } = particleAt(ring, index);
        assert.ok(Math.abs(Math.hypot(position.x, position.y) - 2) < 1e-5 && position.z === 0, "on the rim");
        const speed = Math.hypot(velocity.x, velocity.y);
        assert.ok(Math.abs((position.x * velocity.x + position.y * velocity.y) / (2 * speed) - 1) < 1e-5, "moving straight outwards");
    }
    const half = new P.ParticleEmitter(particle({ shape: "circle", shapeRadius: 1, arc: 90 }));
    half.emit(100, IDENTITY);
    for (let index = 0; index < 100; index += 1) {
        const { position } = particleAt(half, index);
        assert.ok(position.x >= -1e-6 && position.y >= -1e-6 && Math.hypot(position.x, position.y) <= 1 + 1e-6, "a 90° arc stays in the first quarter");
    }
    const cone = new P.ParticleEmitter(particle({ shape: "cone", shapeRadius: 1, spread: 30 }));
    cone.emit(100, IDENTITY);
    for (let index = 0; index < 100; index += 1) {
        const { position, velocity } = particleAt(cone, index);
        const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
        assert.ok(Math.hypot(position.x, position.y) <= 1 + 1e-6 && position.z === 0, "on the cone's base disc");
        assert.ok(velocity.z / speed >= Math.cos((30 * Math.PI) / 180) - 1e-6, "tilted by at most the cone angle");
        assert.ok(position.x * velocity.x + position.y * velocity.y >= -1e-6, "fanning outwards");
    }
    const box = new P.ParticleEmitter(particle({ shape: "box", boxSize: { x: 4, y: 2, z: 0 } }));
    box.emit(100, IDENTITY);
    for (let index = 0; index < 100; index += 1) {
        const { position } = particleAt(box, index);
        assert.ok(Math.abs(position.x) <= 2 && Math.abs(position.y) <= 1 && position.z === 0, "inside the box");
    }
    const edge = new P.ParticleEmitter(particle({ shape: "edge", edgeLength: 6, worldSpace: true }));
    edge.emit(100, { position: { x: 10, y: 5, z: 0 }, rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, scale: { x: 2, y: 1, z: 1 } });
    for (let index = 0; index < 100; index += 1) {
        const { position } = particleAt(edge, index);
        // The edge lies on the object's X axis, turned 90° (now along world Y) and scaled by 2.
        assert.ok(Math.abs(position.x - 10) < 1e-5 && Math.abs(position.y - 5) <= 6 + 1e-5, "on the turned, scaled edge");
    }
});

test("particles V2: timed bursts repeat by cycles and interval within each loop; 0 cycles repeats while playing", () => {
    const emitter = new P.ParticleEmitter(particle({ duration: 1, loop: true, bursts: [{ time: 0.2, count: 5, cycles: 3, interval: 0.1 }, { time: 0.5, count: 1, cycles: 0, interval: 0.25 }] }));
    const step = (seconds) => {
        for (let index = 0; index < Math.round(seconds * 100); index += 1) emitter.update(0.01, IDENTITY, { x: 0, y: 0, z: 0 }, false);
    };
    step(0.15);
    assert.equal(emitter.count, 0);
    step(0.1);
    assert.equal(emitter.count, 5, "the first cycle at 0.2 s");
    step(0.2);
    assert.equal(emitter.count, 15, "three cycles, 0.1 s apart");
    step(0.5);
    // 0.5, 0.75 (and 1.0 belongs to the next loop's start)
    assert.equal(emitter.count, 17, "the endless burst fires every 0.25 s until the loop ends");
    step(0.3);
    assert.equal(emitter.count, 23, "a new loop starts the bursts over");
});

test("particles V2: colour gradients and the size curve over lifetime", async () => {
    const THREE = await import("three");
    const component = particle({ colorStops: [{ time: 1, color: "#0000ff", alpha: 0 }, { time: 0, color: "#ff0000", alpha: 1 }, { time: 0.5, color: "#00ff00", alpha: 0.5 }], startSize: 0, midSize: 1, endSize: 0.2 });
    assert.deepEqual(component.colorStops.map((stop) => stop.time), [0, 0.5, 1], "stops are sorted");
    const out = [0, 0, 0, 0];
    P.particleColorAt(component, 0.25, out);
    const green = new THREE.Color("#00ff00");
    const red = new THREE.Color("#ff0000");
    assert.ok(Math.abs(out[0] - (red.r + green.r) / 2) < 1e-6 && Math.abs(out[1] - (red.g + green.g) / 2) < 1e-6 && Math.abs(out[3] - 0.75) < 1e-9, "halfway from red to green");
    P.particleColorAt(component, 1, out);
    assert.deepEqual([out[2], out[3]], [1, 0], "ends blue and transparent");
    assert.equal(P.particleSizeAt(component, 0), 0);
    assert.equal(P.particleSizeAt(component, 0.5), 1);
    assert.ok(Math.abs(P.particleSizeAt(component, 1) - 0.2) < 1e-9);
    let previous = -1;
    for (let t = 0; t <= 0.5; t += 0.05) {
        const size = P.particleSizeAt(component, t);
        assert.ok(size >= previous - 1e-9 && size <= 1 + 1e-9, "grows smoothly to the middle without overshooting");
        previous = size;
    }
    for (let t = 0.5; t <= 1; t += 0.05) assert.ok(P.particleSizeAt(component, t) >= 0.2 - 1e-9, "never below the end size");
    const single = particle({ colorStops: [{ time: 0.3, color: "#ffffff", alpha: 1 }] });
    assert.deepEqual(single.colorStops, [], "one stop is no gradient");
});

test("particles V2: a sub-emitter fires where particles die (one level), follows Instantiate, and scripts change the shape", () => {
    const project = createBlankProject("Sparks", "2d");
    // Lifetimes vary by ±20%: the rocket's particles die between 0.16 and 0.24 s, the sparks live 0.8–1.2 s.
    const sparks = C.createParticleSystem({ playOnStart: false, emissionRate: 0, lifetime: 1, maxParticles: 500, startSpeed: 2, spread: 180 });
    const rocket = C.createParticleSystem({ playOnStart: true, loop: false, duration: 0.05, burstCount: 4, emissionRate: 0, lifetime: 0.2, startSpeed: 0, maxParticles: 50 });
    rocket.subEmitterId = "entity_sparks";
    rocket.subEmitterCount = 3;
    // The sparks point back at the rocket: their deaths must not chain.
    sparks.subEmitterId = "entity_rocket";
    project.scenes[0].objects.push(
        object("Rocket", 0, 0, [rocket]),
        object("Sparks", 0, 0, [sparks], { parentId: "entity_rocket" }),
    );
    project.scripts = [{ id: "script_shape", name: "Shape.cs", language: "csharp", content: `using UnityEngine;
public class Shape : MonoBehaviour
{
    void Start()
    {
        ParticleSystem ps = GameObject.Find("Rocket").GetComponent<ParticleSystem>();
        ps.shape.shapeType = "Circle";
        ps.shape.radius = 2.5f;
        Debug.Log("shape " + ps.shape.shapeType + " " + ps.shape.radius);
        GameObject copy = Instantiate(GameObject.Find("Rocket"));
        copy.name = "Copy";
    }
}` }];
    project.scenes[0].objects.push(object("Probe", 0, 0, [C.createScriptComponent("script_shape", "Shape")]));
    const game = startWorld(project);
    game.step(1);
    assert.deepEqual(game.messages("info"), ["shape Circle 2.5"]);
    const rocketEmitter = game.find("Rocket").emitter;
    const sparksEmitter = game.find("Sparks").emitter ?? game.world.emitterOf(game.find("Sparks"), true);
    assert.equal(rocketEmitter.count, 4);
    game.step(19);
    assert.equal(rocketEmitter.count, 0, "the rocket's particles died");
    assert.equal(sparksEmitter.count, 12, "three sparks per death");
    game.step(80);
    assert.equal(sparksEmitter.count, 0, "the sparks died");
    assert.equal(rocketEmitter.count, 0, "and their deaths emitted nothing (one level)");
    const copy = game.find("Copy");
    const copyComponent = copy.components.find((item) => item.type === "particleSystem");
    const copySparks = copy.children.find((child) => child.name === "Sparks");
    assert.ok(copySparks && copyComponent.subEmitterId === copySparks.id, "the copy's sub-emitter is its own copied child");
    assert.deepEqual(game.problems(), []);
});

// ---------------------------------------------------------------------------
// Tilemaps: rule tiles, animated tiles and one-way platforms
// ---------------------------------------------------------------------------

const T = await load("lib/game-engine/tilemap.ts");

/** Palette tile "#" as a rule tile whose case i draws atlas cell start + i. */
const ruleTile = (neighbors, start, extra = {}) => ({ key: "#", name: "Kaya", color: "#ffffff", solid: true, frame: -1, rule: { neighbors, frames: T.consecutiveRuleFrames(neighbors, start), matchAny: false }, animation: null, oneWay: false, ...extra });

test("tilemaps: rule tiles pick their case from 4 or 8 neighbours, and painting one updates the tiles around it", () => {
    assert.equal(T.ruleSlotCount(4), 16);
    assert.equal(T.ruleSlotCount(8), 47);
    assert.equal(T.BLOB_MASKS.length, 47, "a blob tileset has 47 cases");
    assert.deepEqual([T.BLOB_MASKS[0], T.BLOB_MASKS[46]], [0, 255]);
    assert.equal(new Set(T.BLOB_MASKS.map(T.reduceBlobMask)).size, 47, "every case is its own reduced mask");

    const stone = { key: "@", name: "Taş", color: "#64748b", solid: true, frame: 3 };
    const map = C.createTilemap({ palette: [ruleTile(4, 10), stone], atlas: { textureId: null, columns: 16, rows: 8 } });
    const frame = (x, y) => T.tileFrameAt(map, x, y, T.tileAt(map, x, y));
    T.setTileKey(map, 0, 0, "#");
    assert.equal(frame(0, 0), 10, "alone: case 0");
    T.setTileKey(map, 1, 0, "#");
    assert.equal(frame(0, 0), 10 + T.RULE4.E, "painting a neighbour redraws the first tile (east joins)");
    assert.equal(frame(1, 0), 10 + T.RULE4.W);
    T.setTileKey(map, 0, 1, "#");
    assert.equal(frame(0, 0), 10 + (T.RULE4.N | T.RULE4.E));
    assert.equal(frame(0, 1), 10 + T.RULE4.S);
    T.setTileKey(map, 1, 0, null);
    assert.equal(frame(0, 0), 10 + T.RULE4.N, "erasing a neighbour redraws it too");
    T.setTileKey(map, -1, 0, "@");
    assert.equal(frame(0, 0), 10 + T.RULE4.N, "other tiles don't join...");
    map.palette[0].rule.matchAny = true;
    assert.equal(frame(0, 0), 10 + (T.RULE4.N | T.RULE4.W), "...unless the rule joins any tile");
    assert.equal(frame(-1, 0), 3, "a normal tile keeps its own frame");
    map.palette[0].rule.frames[T.RULE4.N | T.RULE4.W] = -1;
    map.palette[0].frame = 7;
    assert.equal(frame(0, 0), 7, "a case without a cell draws the tile's own frame");

    // 8 neighbours: a 3×3 block, then its middle erased.
    const blob = C.createTilemap({ palette: [ruleTile(8, 0)], rows: ["###", "###", "###"] });
    const slot = (x, y) => T.ruleTileSlot(blob, x, y, blob.palette[0]);
    const R = T.RULE8;
    assert.equal(T.BLOB_MASKS[slot(1, 1)], 255, "the middle is surrounded");
    assert.equal(T.BLOB_MASKS[slot(1, 2)], R.E | R.SE | R.S | R.SW | R.W, "top edge");
    assert.equal(T.BLOB_MASKS[slot(0, 2)], R.E | R.SE | R.S, "top-left corner");
    T.setTileKey(blob, 1, 1, null);
    assert.equal(T.BLOB_MASKS[slot(1, 2)], R.E | R.W, "without the middle the corners below no longer count");
    assert.equal(T.BLOB_MASKS[slot(0, 2)], R.E | R.S, "an outer corner of a ring");
    assert.equal(T.tileFrameAt(blob, 0, 2, blob.palette[0]), slot(0, 2), "frames follow the case order");
    assert.deepEqual(T.ruleSlotPattern(8, T.BLOB_MASKS.indexOf(R.E | R.SE | R.S)), [null, false, null, false, true, true, null, true, true], "the case picture marks corners that don't matter");
    assert.deepEqual(T.ruleSlotPattern(4, T.RULE4.N), [null, true, null, false, true, false, null, false, null]);

    // Switching 4 ↔ 8 neighbours keeps the frames of matching cases.
    const four = { neighbors: 4, frames: T.consecutiveRuleFrames(4, 20), matchAny: false };
    const eight = T.convertRuleFrames(four, 8);
    assert.equal(eight.length, 47);
    assert.equal(eight[T.BLOB_MASKS.indexOf(255)], 20 + 15);
    assert.deepEqual(T.convertRuleFrames({ neighbors: 8, frames: eight, matchAny: false }, 4), four.frames, "and back");
    assert.equal(T.tilePreviewFrame(ruleTile(4, 10)), 10, "the palette shows the lone case");
});

test("tilemaps: animated tiles advance by time; the schema keeps rule, animation and one-way data and repairs the rest", () => {
    const animation = { frames: [4, 5, 6], fps: 2 };
    assert.deepEqual([0, 0.49, 0.5, 1, 1.5, 3.2].map((time) => T.animatedTileFrame(animation, time)), [4, 4, 5, 6, 4, 4]);
    const water = { key: "~", name: "Su", color: "#ffffff", solid: false, frame: -1, animation };
    const grid = C.createTilemap({ palette: [water], rows: ["~"] });
    assert.equal(T.tileFrameAt(grid, 0, 0, water, 0.6), 5);
    assert.equal(T.tilePreviewFrame(water), 4);

    const project = createBlankProject("Tiles", "2d");
    project.scenes[0].objects.push(object("Map", 0, 0, [C.createTilemap({
        rows: ["#~-=."],
        palette: [
            { key: "#", name: "Kaya", color: "#ffffff", solid: true, frame: 0, rule: { neighbors: 8, frames: [1, 2, "x", -5, 9999], matchAny: true } },
            { key: "~", name: "Su", color: "#ffffff", solid: false, frame: 0, animation: { frames: [3, 4, 5], fps: 500 } },
            { key: "-", name: "Köprü", color: "#a16207", solid: true, frame: -1, oneWay: true, rule: { neighbors: 4, frames: [] }, animation: { frames: [1, 2], fps: 4 } },
            { key: "=", name: "Toprak", color: "#a16207", solid: true, frame: -1, animation: { frames: [], fps: 4 } },
        ],
    })]));
    const palette = normalizeProject(JSON.parse(JSON.stringify(project))).scenes[0].objects.find((item) => item.name === "Map").components[1].palette;
    const [rock, sea, bridge, dirt] = palette;
    assert.equal(rock.rule.neighbors, 8);
    assert.equal(rock.rule.frames.length, 47, "an 8-neighbour rule always has 47 cases");
    assert.deepEqual(rock.rule.frames.slice(0, 5), [1, 2, -1, -1, 4095], "bad cells are cleared or clamped");
    assert.equal(rock.rule.matchAny, true);
    assert.deepEqual(sea.animation, { frames: [3, 4, 5], fps: 60 }, "fps is clamped");
    assert.equal(sea.rule, null);
    assert.equal(bridge.oneWay, true);
    assert.equal(bridge.rule.frames.length, 16);
    assert.equal(bridge.animation, null, "a rule tile can't also be animated");
    assert.equal(dirt.animation, null, "an animation without frames is dropped");
    const old = normalizeProject(JSON.parse(JSON.stringify({ ...project, scenes: [{ ...project.scenes[0], objects: [object("Old", 0, 0, [C.createTilemap({ rows: ["#"] })])] }] }))).scenes[0].objects[0].components[1].palette[0];
    assert.deepEqual([old.rule, old.animation, old.oneWay], [null, null, false], "V5 tiles stay normal tiles");
});

test("tilemaps: one-way platforms hold bodies landing from above, let them jump up through and pass from the side", () => {
    const project = createBlankProject("OneWay", "2d");
    const palette = [
        { key: "#", name: "Zemin", color: "#22c55e", solid: true, frame: -1 },
        { key: "-", name: "Platform", color: "#a16207", solid: true, frame: -1, oneWay: true },
    ];
    /** A 0.9 × 0.9 box body. */
    const box = (name, x, y, rigidBody = {}) => {
        const item = object(name, x, y, [C.createSpriteRenderer(), C.createRigidBody({ freezeRotation: true, freezePosition: { x: false, y: false, z: true }, linearDamping: 0, ...rigidBody }), C.createCollider({ friction: 0 })]);
        item.components[0].scale = { x: 0.9, y: 0.9, z: 1 };
        return item;
    };
    // Floor at y -1 (top at 0); the platform row at y 2 (top at 3) from x -6 to 5.
    project.scenes[0].objects.push(
        object("Level", 0, 0, [C.createTilemap({ rows: ["............", "------------", "............", "............", "############"], origin: { x: -6, y: -1 }, palette, friction: 0 })]),
        box("Faller", 3, 6),
        // The walker passes the jumper's column before it jumps.
        box("Jumper", -5, 0.45),
        box("Walker", -9, 2.5, { useGravity: false }),
    );
    const game = startWorld(project);
    const faller = game.find("Faller");
    const jumper = game.find("Jumper");
    const walker = game.find("Walker");
    walker.body.velocity.x = 6;
    game.step(60);
    assert.ok(Math.abs(faller.world.position.y - 3.45) < 0.03, `a body falling on the platform lands on it (y=${faller.world.position.y})`);
    assert.ok(faller.body.grounded, "and stands on it");
    assert.ok(Math.abs(jumper.world.position.y - 0.45) < 0.03, `the jumper waits on the floor (y=${jumper.world.position.y})`);
    assert.ok(walker.world.position.x > -3.5, `walking in from the side passes through (x=${walker.world.position.x})`);
    jumper.body.velocity.y = 12;
    let highest = -Infinity;
    for (let frame = 0; frame < 150; frame += 1) {
        game.step(1);
        highest = Math.max(highest, jumper.world.position.y);
    }
    assert.ok(highest > 4, `jumping from below goes up through the platform (top ${highest.toFixed(2)})`);
    assert.ok(Math.abs(jumper.world.position.y - 3.45) < 0.03, `and lands on top of it on the way down (y=${jumper.world.position.y})`);
    assert.ok(Math.abs(faller.world.position.y - 3.45) < 0.03, `the faller still stands there (y=${faller.world.position.y})`);
    assert.ok(walker.world.position.x > 8, `the walker crossed every platform tile (x=${walker.world.position.x})`);
    assert.ok(Math.abs(walker.world.position.y - 2.5) < 1e-6, "without being pushed up or down");
    assert.deepEqual(game.problems(), []);

    const surface = T.solidTiles({ rows: ["-", "-", "#"], origin: { x: 0, y: 0 }, palette });
    assert.deepEqual(surface.map((tile) => [tile.y, tile.oneWay, tile.open.top]), [[2, true, true], [0, false, true]], "a one-way tile under another one offers no top; it never closes a solid tile's faces");
});

// ---------------------------------------------------------------------------
// Touch controls: virtual joystick, touch buttons and vibration
// ---------------------------------------------------------------------------

const Touch = await load("lib/game-engine/touch-controls.ts");

test("touch: joystick math (dead zone, rescaling, y up) and layout settings (V5 documents keep the arrow pad)", () => {
    const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} ≠ ${expected}`);
    assert.deepEqual(Touch.joystickVector(0, 0, 50, 0.2), { x: 0, y: 0 });
    assert.deepEqual(Touch.joystickVector(9, 0, 50, 0.2), { x: 0, y: 0 }, "inside the dead zone");
    close(Touch.joystickVector(30, 0, 50, 0.2).x, 0.5, "past the dead zone the value starts from 0 again");
    close(Touch.joystickVector(0, -50, 50, 0.2).y, 1, "screen up is +y");
    const far = Touch.joystickVector(300, 300, 50, 0);
    close(Math.hypot(far.x, far.y), 1, "never longer than 1");
    close(far.x, Math.SQRT1_2, "diagonal");

    const fresh = normalizeProject(createBlankProject("Dokun", "2d"));
    assert.equal(fresh.settings.touchLayout.stick, "joystick", "new projects get the joystick");
    assert.deepEqual(fresh.settings.touchLayout.buttons.map((button) => button.action), ["Jump", "Fire1"]);
    const v5 = JSON.parse(JSON.stringify(fresh));
    delete v5.settings.touchLayout;
    assert.deepEqual(normalizeProject(v5).settings.touchLayout, Touch.classicTouchLayout(), "a V5 document keeps its arrow pad and A/B");
    v5.settings.touchLayout = { stick: "joystick", side: "right", size: 999, deadZone: 3, buttons: [
        { action: "Jump", label: "  Zıpla!<b>  " }, { action: "9bad", label: "x" }, { action: "Fire1" }, { action: "Fire2", label: "" }, { action: "Fire3", label: "C" }, { action: "Submit", label: "E" },
    ] };
    const layout = normalizeProject(v5).settings.touchLayout;
    assert.deepEqual([layout.stick, layout.side, layout.size, layout.deadZone], ["joystick", "right", 220, 0.9], "sizes are clamped");
    assert.deepEqual(layout.buttons, [{ action: "Jump", label: "Zıpla!" }, { action: "Fire1", label: "Fire1" }, { action: "Fire2", label: "Fire2" }, { action: "Fire3", label: "C" }], "at most 4 buttons with valid action names and short labels");
});

const TOUCH_SCRIPT = `using UnityEngine;
public class Pad : MonoBehaviour
{
    public void Report(string tag)
    {
        Debug.Log(tag + " h=" + Input.GetAxis("Horizontal").ToString("0.00") + " v=" + Input.GetAxisRaw("Vertical").ToString("0.00")
            + " slide=" + Input.GetAxisRaw("Slide") + " right=" + Input.GetKey(KeyCode.RightArrow) + " down=" + Input.GetKey(KeyCode.DownArrow));
    }

    public void Buttons(string tag)
    {
        Debug.Log(tag + " jump=" + Input.GetButton("Jump") + "/" + Input.GetButtonDown("Jump") + "/" + Input.GetButtonUp("Jump")
            + " space=" + Input.GetKey(KeyCode.Space) + " submit=" + Input.GetButton("Submit") + " shoot=" + Input.GetButton("Shoot") + " mouse=" + Input.GetMouseButton(0));
    }

    public void Buzz()
    {
        Input.Vibrate(250, 0.5f);
        Input.Vibrate(80);
        Handheld.Vibrate();
    }
}`;

function touchProject() {
    const project = createBlankProject("Touch", "2d");
    project.settings.input.actions.push(
        // A digital axis without a stick: the joystick drives it through the arrow keys.
        { name: "Slide", kind: "axis", positive: ["RightArrow"], negative: ["LeftArrow"], gamepadPositive: [], gamepadNegative: [], gamepadAxis: null, invert: false },
        // Only a mouse button: the touch button still presses the action itself.
        { name: "Shoot", kind: "button", positive: ["Mouse0"], negative: [], gamepadPositive: [], gamepadNegative: [], gamepadAxis: null, invert: false },
    );
    project.scripts = [{ id: "script_pad", name: "Pad.cs", language: "csharp", content: TOUCH_SCRIPT }];
    project.scenes[0].objects.push(object("Pad", 0, 0, [C.createScriptComponent("script_pad", "Pad")]));
    return project;
}

test("touch: the joystick feeds Horizontal/Vertical as an analog stick and holds the arrows past half way", () => {
    const game = startWorld(touchProject());
    const pad = game.find("Pad").behaviours[0];
    const report = (tag) => game.world.callMethod(pad, "Report", [tag]);
    const input = game.world.input;
    game.step(1);
    input.setTouchStick(0.4, -0.3);
    game.step(1);
    report("small");
    input.setTouchStick(0.8, -0.7);
    for (let frame = 0; frame < 30; frame += 1) game.step(1);
    report("far");
    input.setTouchStick(0, 0);
    game.step(1);
    report("released");
    input.setTouchStick(-1, 0);
    input.setKeyboardKey("D", true);
    game.step(1);
    report("keyboard");
    input.setKeyboardKey("D", false);
    input.setTouchStick(0, 0);
    assert.deepEqual(game.messages("info"), [
        "small h=0.40 v=-0.30 slide=0 right=False down=False",
        // Analog: the arrow key the joystick holds doesn't push the axis to 1.
        "far h=0.80 v=-0.70 slide=1 right=True down=True",
        "released h=0.00 v=0.00 slide=0 right=False down=False",
        // The keyboard's D (smoothed to 0.05 after one frame) loses to the stick's -1; the stick's left arrow cancels Slide's right one.
        "keyboard h=-1.00 v=0.00 slide=-1 right=False down=False",
    ]);
    // Local multiplayer: a player whose source includes touch reads the stick too.
    input.setTouchStick(0.6, 0);
    game.step(1);
    assert.ok(Math.abs(input.view({ keyboard: "none", mouse: false, touch: true, pad: null }).getAxis("Horizontal") - 0.6) < 1e-9);
    assert.equal(input.view({ keyboard: "all", mouse: true, touch: false, pad: 1 }).getAxis("Horizontal"), 0, "a player without touch doesn't");
    assert.deepEqual(game.problems(), []);
});

test("touch: buttons press their action (and its keys) with one-frame edges; Input.Vibrate reaches the haptics", () => {
    const game = startWorld(touchProject());
    const pad = game.find("Pad").behaviours[0];
    const buttons = (tag) => game.world.callMethod(pad, "Buttons", [tag]);
    const input = game.world.input;
    game.step(1);
    input.setTouchAction("Jump", true, 0);
    game.step(1);
    buttons("down");
    game.step(1);
    buttons("held");
    input.setTouchAction("Jump", true, 1);
    input.setTouchAction("Jump", false, 0);
    game.step(1);
    buttons("second finger");
    input.setTouchAction("Jump", false, 1);
    game.step(1);
    buttons("up");
    input.setTouchAction("Shoot", true, 2);
    game.step(1);
    buttons("shoot");
    input.setTouchAction("Shoot", false, 2);
    game.step(1);
    assert.deepEqual(game.messages("info"), [
        "down jump=True/True/False space=True submit=True shoot=False mouse=False",
        "held jump=True/False/False space=True submit=True shoot=False mouse=False",
        "second finger jump=True/False/False space=True submit=True shoot=False mouse=False",
        "up jump=False/False/True space=False submit=False shoot=False mouse=False",
        "shoot jump=False/False/False space=False submit=False shoot=True mouse=False",
    ]);

    const calls = [];
    input.haptics = (milliseconds, strength) => {
        calls.push([milliseconds, strength]);
        return "device";
    };
    game.world.callMethod(pad, "Buzz", []);
    assert.deepEqual(calls, [[250, 0.5], [80, 1], [400, 1]]);
    assert.deepEqual(game.problems(), []);
});

test("touch: vibration rumbles gamepads with haptics, else the phone, else nothing (and never throws)", () => {
    const effects = [];
    const pad = { connected: true, vibrationActuator: { playEffect: (type, params) => { effects.push([type, params]); return Promise.reject(new Error("blocked")); }, reset: () => effects.push(["reset"]) } };
    const pulses = [];
    const firefox = { connected: true, hapticActuators: [{ pulse: (value, duration) => { pulses.push([value, duration]); return Promise.resolve(true); } }] };
    const phone = [];
    const host = { getGamepads: () => [null, pad, firefox, { connected: false }], vibrate: (pattern) => { phone.push(pattern); return true; } };
    assert.equal(Touch.vibrate(host, 99_999, 2), "gamepad");
    assert.deepEqual(effects, [["dual-rumble", { startDelay: 0, duration: 5000, strongMagnitude: 1, weakMagnitude: 1 }]], "clamped to 5 s and full strength");
    assert.deepEqual(pulses, [[1, 5000]]);
    assert.equal(Touch.vibrate(host, 0), "gamepad", "0 ms stops it");
    assert.deepEqual(effects.at(-1), ["reset"]);
    assert.deepEqual(pulses.at(-1), [0, 0]);
    assert.deepEqual(phone, [], "a gamepad that can rumble wins over the phone");
    assert.equal(Touch.vibrate({ getGamepads: () => [], vibrate: (pattern) => { phone.push(pattern); return true; } }, 120.4, 0.3), "device");
    assert.deepEqual(phone, [120]);
    assert.equal(Touch.vibrate({ getGamepads: () => { throw new Error("denied"); } }, 100), "none");
    assert.equal(Touch.vibrate({ vibrate: () => { throw new Error("no"); } }, 100), "none");
    assert.equal(Touch.vibrate(null, 100), "none");
});

// ---------------------------------------------------------------------------
// Animation events and the Engine rules panel
// ---------------------------------------------------------------------------

const Anim = await load("lib/game-engine/runtime/animator.ts");
const Rules = await load("lib/game-engine/rules.ts");

const FEET_SCRIPT = `using UnityEngine;
public class Feet : MonoBehaviour
{
    public void Step(string foot) { Debug.Log(name + " step " + foot); }
    public void Hit(int damage) { Debug.Log(name + " hit " + damage); }
    public void Done() { Debug.Log(name + " done"); }
    public void Need(float value) { Debug.Log(name + " need " + value); }
    void OnAnimationComplete(string clip) { Debug.Log(name + " complete " + clip); }
}`;

test("animation events: loops call the method every lap with its parameter, pingPong going and coming back, once clips at the end", () => {
    const project = createBlankProject("Events", "2d");
    project.scripts = [{ id: "script_feet", name: "Feet.cs", language: "csharp", content: FEET_SCRIPT }];
    const animated = (name, clip) => object(name, 0, 0, [C.createSpriteRenderer(), C.createAnimation({ clips: [clip] }), C.createScriptComponent("script_feet", "Feet")]);
    project.scenes[0].objects.push(
        animated("Walker", { name: "Walk", duration: 1, wrap: "loop", tracks: [], events: [
            { time: 0.75, method: "Step", parameter: "string", value: "right" },
            { time: 0.25, method: "Step", parameter: "string", value: "left" },
        ] }),
        animated("Swing", { name: "Swing", duration: 1, wrap: "pingPong", tracks: [], events: [{ time: 0.25, method: "Hit", parameter: "int", value: 3 }] }),
        animated("Once", { name: "Finish", duration: 0.5, wrap: "once", tracks: [], events: [
            { time: 0.5, method: "Done", parameter: "none", value: "" },
            { time: 0.1, method: "Need", parameter: "none", value: "" },
            { time: 0.2, method: "Nobody", parameter: "none", value: "" },
            { time: 0.3, method: "", parameter: "none", value: "" },
        ] }),
    );
    const game = startWorld(project);
    game.step(121);
    const of = (name) => game.messages("info").filter((message) => message.startsWith(`${name} `)).map((message) => message.slice(name.length + 1));
    assert.deepEqual(of("Walker"), ["step left", "step right", "step left", "step right"], "two steps a lap, sorted by time");
    assert.deepEqual(of("Swing"), ["hit 3", "hit 3"], "0.25 s going forward and 1.75 s coming back");
    assert.deepEqual(of("Once"), ["done", "complete Finish"], "an event at the very end fires before OnAnimationComplete");
    assert.deepEqual(game.problems(), [
        "Animasyon olayı 'Need' (Once): metot bir parametre bekliyor; Animation bileşeninde olaya bir değer verin.",
        "Animasyon olayı 'Nobody' (Once): nesnedeki betiklerde bu adda bir metot yok.",
    ], "a missing parameter or receiver warns once; an event without a method does nothing");
});

test("animation events: the playhead math (big steps, caps, pauses) and what the schema keeps", () => {
    const event = (time, method = "Tick") => ({ time, method, parameter: "none", value: "" });
    const loop = { duration: 1, wrap: "loop", events: [event(0), event(0.5, "Half")] };
    assert.deepEqual(Anim.passedAnimationEvents(loop, 0, 0.1).map((item) => item.method), ["Tick"], "an event at 0 fires when the clip starts");
    assert.deepEqual(Anim.passedAnimationEvents(loop, 0.4, 2.6).map((item) => item.method), ["Half", "Tick", "Half", "Tick", "Half"], "a long step fires every lap it passes, in order");
    assert.equal(Anim.passedAnimationEvents(loop, 0, 1000).length, 64, "at most 64 events per update");
    assert.deepEqual(Anim.passedAnimationEvents(loop, 0.6, 0.6), [], "a paused clip fires nothing");
    const ping = { duration: 2, wrap: "pingPong", events: [event(2, "Turn"), event(0, "Back")] };
    assert.deepEqual(Anim.passedAnimationEvents(ping, 0, 7.9).map((item) => item.method), ["Back", "Turn", "Back", "Turn"], "the turning points fire once per pass");
    const once = { duration: 1, wrap: "once", events: [event(1, "End")] };
    assert.deepEqual(Anim.passedAnimationEvents(once, 0.5, 0.99), [], "not before the end...");
    assert.deepEqual(Anim.passedAnimationEvents(once, 0.99, 1).map((item) => item.method), ["End"], "...then on the step that lands exactly on it");
    assert.deepEqual(Anim.passedAnimationEvents(once, 1, 1.5), [], "and only once");
    assert.deepEqual(Anim.passedAnimationEvents(loop, 0.25, 0.5).map((item) => item.method), ["Half"], "a step landing on an event fires it...");
    assert.deepEqual(Anim.passedAnimationEvents(loop, 0.5, 0.75), [], "...and the next one doesn't again");

    const project = createBlankProject("Events", "2d");
    project.scenes[0].objects.push(object("A", 0, 0, [C.createAnimation({ clips: [{ name: "C", duration: 2, wrap: "loop", tracks: [], events: [
        { time: 5, method: "Late", parameter: "float", value: "1.5" },
        { time: -1, method: "bad name!", parameter: "weird", value: 3 },
        { time: 1, method: "Count", parameter: "int", value: 2.7 },
        { time: 1.5, method: "Say", parameter: "string", value: "x".repeat(300) },
    ] }] })]));
    const clip = normalizeProject(JSON.parse(JSON.stringify(project))).scenes[0].objects.find((item) => item.name === "A").components[1].clips[0];
    assert.deepEqual(clip.events.map((item) => [item.time, item.method, item.parameter]), [[0, "", "none"], [1, "Count", "int"], [1.5, "Say", "string"], [2, "Late", "float"]], "sorted, inside the clip, with valid names and parameters");
    assert.deepEqual([clip.events[1].value, clip.events[2].value.length, clip.events[3].value], [3, 200, 1.5]);
    const old = normalizeProject(JSON.parse(JSON.stringify({ ...project, scenes: [{ ...project.scenes[0], objects: [object("B", 0, 0, [C.createAnimation({ clips: [{ name: "C", duration: 1, wrap: "loop", tracks: [] }] })])] }] })));
    assert.deepEqual(old.scenes[0].objects[0].components[1].clips[0].events, [], "V5 clips get no events");
});

test("engine rules: upgrading to V6 changes the gated behaviour, can be undone, and the schema keeps the undo", () => {
    const script = `using UnityEngine;
public class Mover : MonoBehaviour
{
    void Start()
    {
        gameObject.layer = 3;
        Debug.Log("layer " + gameObject.layer + " mask " + LayerMask.GetMask("Ghost"));
    }
}`;
    const project = layeredProject({ rules: 5, script: script.replace("Mover", "Probe") });
    assert.deepEqual(Rules.rulesToUpgrade(5), [6]);
    assert.deepEqual(Rules.rulesToUpgrade(3), [4, 5, 6]);
    assert.deepEqual(Rules.rulesToUpgrade(6), []);
    const v5 = startWorld(project);
    v5.step(1);
    assert.deepEqual(v5.messages("info"), ["layer 0 mask -1"], "V5 rules ignore the layer change, and masks mean every layer");

    const settings = project.settings;
    settings.rulesBefore = null;
    assert.ok(Rules.upgradeRules(settings));
    assert.deepEqual([settings.rules, settings.rulesBefore], [6, 5]);
    assert.ok(!Rules.upgradeRules(settings), "already the newest");
    const saved = normalizeProject(JSON.parse(JSON.stringify(project)));
    assert.deepEqual([saved.settings.rules, saved.settings.rulesBefore], [6, 5], "saving keeps what to undo");
    const v6 = startWorld(project);
    v6.step(1);
    assert.deepEqual(v6.messages("info"), ["layer 3 mask 8"], "V6 rules apply them");

    assert.ok(Rules.undoRulesUpgrade(settings));
    assert.deepEqual([settings.rules, settings.rulesBefore], [5, null]);
    assert.ok(!Rules.undoRulesUpgrade(settings), "nothing left to undo");
    const tampered = JSON.parse(JSON.stringify(project));
    tampered.settings.rulesBefore = 6;
    assert.equal(normalizeProject(tampered).settings.rulesBefore, null, "only older rules can be undone to");
    assert.equal(normalizeProject(createBlankProject("New", "3d")).settings.rulesBefore, null);
});

// ---------------------------------------------------------------------------
// Prefab links: overrides, Apply and Revert
// ---------------------------------------------------------------------------

const Links = await load("lib/game-engine/prefab-links.ts");
const Scene = await load("lib/game-engine/scene.ts");

/** A scene with two instances of an "Enemy" prefab (root + "Eye" child) and an unrelated object. */
function prefabScene() {
    const project = createBlankProject("Links", "2d");
    const enemy = object("Enemy", 0, 0, [C.createSpriteRenderer({ color: "#ff0000" }), C.createScriptComponent("script_enemy", "Enemy", { fields: { speed: 2 } })]);
    const eye = object("Eye", 0, 0.5, [C.createSpriteRenderer({ color: "#ffffff" })], { parentId: enemy.id });
    const prefab = Scene.prefabFromEntities(JSON.parse(JSON.stringify([enemy, eye])), "Enemy");
    project.prefabs.push(prefab);
    const instance = (x, name) => {
        const clones = Scene.cloneEntitiesWithNewIds(JSON.parse(JSON.stringify(prefab.entities)), null);
        clones[0].name = name;
        clones[0].components[0].position = { x, y: 1, z: 0 };
        Links.linkToPrefab(clones, prefab);
        return clones;
    };
    project.scenes[0].objects.push(...instance(-3, "Enemy A"), object("Rock", 5, 0, [C.createSpriteRenderer()]), ...instance(3, "Enemy B"));
    const scene = project.scenes[0];
    const find = (name) => scene.objects.find((item) => item.name === name);
    const childOf = (root, name) => scene.objects.find((item) => item.parentId === root.id && item.name === name);
    return { project, scene, prefab, find, childOf };
}

test("prefab links: instances remember their prefab and list what they changed (not the root's place or name)", () => {
    const { project, scene, prefab, find, childOf } = prefabScene();
    const a = find("Enemy A");
    const eye = childOf(a, "Eye");
    assert.equal(Links.instanceRootOf(scene.objects, eye.id, project.prefabs).id, a.id, "a child knows its instance");
    assert.equal(Links.instanceRootOf(scene.objects, find("Rock").id, project.prefabs), null);
    assert.equal(Links.linkedPrefab(project, a).id, prefab.id);
    assert.equal(Links.instanceOverrides(scene.objects, a, prefab).size, 0, "a fresh instance (moved and renamed) has no overrides");

    a.components[1].color = "#0000ff";
    a.components[2].fields.speed = 5;
    a.components.push(C.createCollider());
    eye.active = false;
    scene.objects.push(object("Hat", 0, 1, [C.createSpriteRenderer()], { id: "entity_hat", parentId: a.id }));
    const overrides = Links.instanceOverrides(scene.objects, a, prefab);
    assert.deepEqual(overrides.get(a.id), ["spriteRenderer#0.color", "script#0.fields.speed", "+collider#0"]);
    assert.deepEqual(overrides.get(eye.id), ["active"]);
    assert.deepEqual(overrides.get("entity_hat"), ["+object"]);
    assert.equal(Links.componentKey(a, a.components[2]), "script#0");
    scene.objects.splice(scene.objects.indexOf(eye), 1);
    assert.ok(Links.instanceOverrides(scene.objects, a, prefab).get(a.id).includes(`-object:${prefab.entities[1].id}`), "a deleted prefab child is listed on the root");
});

test("prefab links: Apply pushes an instance's changes to the prefab and the other instances, which keep their own; Revert drops them", () => {
    const { project, scene, prefab, find, childOf } = prefabScene();
    const a = find("Enemy A");
    let b = find("Enemy B");
    a.components[1].color = "#0000ff";
    a.components[2].fields.speed = 5;
    a.components.push(C.createCollider({ isTrigger: true }));
    childOf(a, "Eye").active = false;
    scene.objects.push(object("Hat", 0, 1, [C.createSpriteRenderer({ color: "#00ffff" })], { id: "entity_hat", parentId: a.id }));
    b.tag = "Boss";
    b.components[1].color = "#00ff00";
    const bEye = childOf(b, "Eye");
    const bSpriteId = b.components[1].id;

    assert.equal(Links.applyInstance(project, scene.id, a.id), 1, "one other instance updated");
    const [root, ...children] = prefab.entities;
    assert.deepEqual([root.name, root.components[0].position, root.components[1].color, root.components[2].fields.speed], ["Enemy", { x: 0, y: 0, z: 0 }, "#0000ff", 5], "the prefab keeps its name and origin and takes the changes");
    assert.ok(root.components.some((component) => component.type === "collider" && component.isTrigger));
    assert.deepEqual(children.map((child) => [child.name, child.active]).sort(), [["Eye", false], ["Hat", true]]);
    assert.ok(prefab.entities.every((entity) => !entity.prefab), "prefab objects carry no links");
    assert.equal(Links.instanceOverrides(scene.objects, a, prefab).size, 0, "the applied instance matches its prefab");
    assert.equal(find("Hat").prefab.prefabId, prefab.id, "the added object is linked now");
    // Other instances are rebuilt (same ids, new objects).
    b = find("Enemy B");

    assert.deepEqual([b.name, b.components[0].position, b.tag, b.components[1].color, b.components[2].fields.speed], ["Enemy B", { x: 3, y: 1, z: 0 }, "Boss", "#00ff00", 5], "B keeps its place, name and own changes and takes the rest");
    assert.equal(b.components[1].id, bSpriteId, "component ids stay");
    assert.equal(childOf(b, "Eye").id, bEye.id);
    assert.equal(childOf(b, "Eye").active, false);
    assert.ok(childOf(b, "Hat"), "the new prefab child reached B");
    assert.ok(b.components.some((component) => component.type === "collider"));
    assert.deepEqual([...Links.instanceOverrides(scene.objects, b, prefab).get(b.id)].sort(), ["spriteRenderer#0.color", "tag"]);
    assert.ok(find("Rock"), "unrelated objects stay");

    assert.ok(Links.revertInstance(project, scene.id, b.id));
    b = find("Enemy B");
    assert.deepEqual([b.tag, b.components[1].color, b.components[0].position], ["Untagged", "#0000ff", { x: 3, y: 1, z: 0 }], "Revert drops the overrides but not the place");
    assert.equal(Links.instanceOverrides(scene.objects, b, prefab).size, 0);

    // Deleting a child and applying removes it from the other instance too.
    scene.objects.splice(scene.objects.indexOf(childOf(a, "Hat")), 1);
    Links.applyInstance(project, scene.id, a.id);
    assert.equal(childOf(b, "Hat"), undefined);
    assert.equal(prefab.entities.length, 2);

    // Links survive saving; links to a missing prefab (or inside prefabs) don't.
    const saved = normalizeProject(JSON.parse(JSON.stringify(project)));
    assert.equal(saved.scenes[0].objects.filter((entity) => entity.prefab?.prefabId === prefab.id).length, 4);
    assert.ok(!("prefab" in saved.scenes[0].objects.find((entity) => entity.name === "Rock")), "objects without a prefab don't get the field");
    const broken = JSON.parse(JSON.stringify(project));
    broken.prefabs = [];
    assert.ok(normalizeProject(broken).scenes[0].objects.every((entity) => !entity.prefab));
    Links.unlinkPrefab(project, prefab.id);
    assert.ok(scene.objects.every((entity) => !entity.prefab));
});

// ---------------------------------------------------------------------------
// Debugging help: log points and per-script time
// ---------------------------------------------------------------------------

const COUNTER_SCRIPT = `using UnityEngine;
using System.Collections;
public class Counter : MonoBehaviour
{
    public float speed = 2.5f;
    int total;
    void Start()
    {
        for (int i = 0; i < 3; i++)
            total += i;
        if (total > 1) Debug.Log("big");
        Debug.Log("done " + total);
        StartCoroutine(Tick());
    }
    IEnumerator Tick()
    {
        for (int n = 0; n < 2; n++)
            yield return null;
    }
}`;

function counterProject(points) {
    const project = createBlankProject("Logs", "2d");
    project.scripts = [{ id: "script_counter", name: "Counter.cs", language: "csharp", content: COUNTER_SCRIPT }];
    project.scenes[0].objects.push(object("Counter", 4, 0, [C.createScriptComponent("script_counter", "Counter")]));
    project.settings.logPoints = points.map(([line, message, enabled = true, pause = false]) => ({ scriptId: "script_counter", line, message, enabled, pause }));
    return project;
}

test("log points: print each time their line runs (loops and coroutines too) with values from the line's scope, only in the editor", () => {
    const points = [
        [10, "i={i} total={total}"],
        [11, "check {total > 1} speed {speed * 2}"],
        [12, "x {transform.position.x} {missing} {total = 5} {{ok}}"],
        [18, "tick {n}"],
    ];
    const game = startWorld(counterProject(points), { isEditor: true });
    game.step(4);
    const info = game.messages("info");
    assert.deepEqual(info.slice(0, 5), ["i=0 total=0", "i=1 total=0", "i=2 total=1", "check True speed 5", "big"], "before the line runs, once per run; a statement nested on the same line doesn't print twice");
    assert.match(info[5], /^x 4 \{missing: .+\} \{total = 5\?\} \{ok\}$/, "errors and assignments show inline; {{ }} print braces");
    assert.deepEqual(info.slice(6), ["done 3", "tick 0", "tick 1"]);
    const logged = game.logs.find((entry) => entry.message === "i=0 total=0");
    assert.deepEqual([logged.source?.scriptName, logged.source?.line], ["Counter.cs", 10], "the Console links to the line");
    assert.deepEqual(game.problems(), []);

    const off = startWorld(counterProject([[11, "check", false], [10, ""]]), { isEditor: true });
    off.step(1);
    assert.deepEqual(off.messages("info").slice(0, 3), ["Counter.cs:10", "big", "done 3"], "a switched-off point is quiet; an empty message prints the place");
    assert.equal(off.logs[0].count, 3, "the Console counts the three runs of the same message");
    const paused = startWorld(counterProject([[11, "check {total}", true, true]]), { isEditor: true });
    paused.step(1);
    assert.equal(paused.world.status, "paused", "a pausing log point stops the game...");
    assert.deepEqual(paused.messages("info").slice(0, 3), ["check 3", "big", "done 3"], "...after its frame has finished");
    assert.match(paused.messages("info")[3], /^Log noktası Counter\.cs:11: oyun kare sonunda duraklatıldı/);
    const published = startWorld(counterProject(points));
    published.step(4);
    assert.deepEqual(published.messages("info"), ["big", "done 3"], "games outside the editor ignore log points");

    const saved = normalizeProject(JSON.parse(JSON.stringify({ ...counterProject([[10, "a"], [10, "dup"], [0, "bad"], [12, "x".repeat(300)]]), scripts: [] })));
    assert.deepEqual(saved.settings.logPoints, [], "log points of missing scripts are dropped");
    const kept = normalizeProject(JSON.parse(JSON.stringify(counterProject([[10, "a"], [10, "dup"], [0, "bad"], [12, "x".repeat(300)]]))));
    assert.deepEqual(kept.settings.logPoints.map((point) => [point.line, point.message.length]), [[10, 1], [12, 200]], "one per line, real lines, short messages");
});

test("stats: per-script time per frame while profiling, slowest first; nothing measured otherwise", () => {
    const project = createBlankProject("Busy", "2d");
    project.scripts = [
        { id: "script_heavy", name: "Heavy.cs", language: "csharp", content: `using UnityEngine;
public class Heavy : MonoBehaviour
{
    float sum;
    void Update() { for (int i = 0; i < 20000; i++) sum += Mathf.Sqrt(i); }
}` },
        { id: "script_light", name: "Light.cs", language: "csharp", content: `using UnityEngine;
public class Light : MonoBehaviour
{
    int frames;
    void Update() { frames++; }
}` },
    ];
    project.scenes[0].objects.push(
        object("Heavy", 0, 0, [C.createScriptComponent("script_heavy", "Heavy")]),
        object("Light", 0, 0, [C.createScriptComponent("script_light", "Light")]),
    );
    const game = startWorld(project);
    game.step(5);
    assert.deepEqual(game.world.stats().scripts, [], "off by default");
    game.world.profiling = true;
    game.step(20);
    const scripts = game.world.stats().scripts;
    assert.deepEqual(scripts.map((item) => item.name), ["Heavy", "Light"]);
    assert.ok(scripts[0].ms > scripts[1].ms && scripts[1].ms >= 0, `the busy script costs more (${scripts.map((item) => item.ms.toFixed(3)).join(" / ")} ms)`);
    game.world.profiling = false;
    game.step(1);
    assert.deepEqual(game.world.stats().scripts, []);
    assert.deepEqual(game.problems(), []);
});
