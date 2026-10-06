// Hanogt Engine starter templates added after V3: every game is played
// through its main loop (with virtual input and simple autopilots), plus the
// engine fixes the templates rely on.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";
import { memoryStorage, startWorld } from "./engine-helpers.mjs";

const { PROJECT_TEMPLATES, createProjectFromTemplate } = await load("lib/game-engine/templates/index.ts");
const { createBlankProject, createEmptyScene } = await load("lib/game-engine/scene.ts");
const { createScriptComponent, createTransform } = await load("lib/game-engine/components.ts");

const NEW_TEMPLATES = ["runner-2d", "flappy-2d", "pong-2d", "snake-2d", "rpg-topdown-2d", "obstacle-course-3d", "tower-defense-2d", "arena-2d"];

/** Deterministic Math.random for one test (the engine's Random uses it unless a script seeds it). */
function seeded(seed, run) {
    const original = Math.random;
    let a = seed;
    Math.random = () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
        return run();
    } finally {
        Math.random = original;
    }
}

const xy = (entity) => entity.world.position;
const zeroVelocity = (entity) => {
    entity.body.velocity.x = 0;
    entity.body.velocity.y = 0;
    entity.body.velocity.z = 0;
};

/** Clicks the screen point under a world position (orthographic camera at the origin, 50 px per unit). */
function clickWorld(game, x, y) {
    const input = game.world.input;
    input.mouseX = 480 + x * 50;
    input.mouseY = 270 + y * 50;
    game.step(1);
    input.pendingMouseDown.add(0);
    input.mouseHeld.add(0);
    game.step(1);
    input.mouseHeld.delete(0);
    input.pendingMouseUp.add(0);
    game.step(1);
}

function projectWithScripts(scripts, dimension = "2d") {
    const project = createBlankProject("Test", dimension);
    const scene = createEmptyScene("Main", dimension);
    project.scripts = scripts.map(([name, content], index) => ({ id: `script_test${index}`, name, language: name.endsWith(".cpp") ? "cpp" : "csharp", content }));
    const objects = scripts.map(([name], index) => ({
        id: `entity_test${index}`,
        name: name.replace(/\.(cs|cpp)$/, ""),
        tag: "Untagged",
        parentId: null,
        active: true,
        components: [createTransform(), createScriptComponent(`script_test${index}`, name.replace(/\.(cs|cpp)$/, ""))],
    }));
    scene.objects.push(...objects);
    project.scenes = [scene];
    project.activeSceneId = scene.id;
    project.settings.startSceneId = scene.id;
    return project;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

test("the new templates are in the catalog, marked new, and listed first", () => {
    const ids = PROJECT_TEMPLATES.map((info) => info.id);
    assert.deepEqual(ids.slice(0, NEW_TEMPLATES.length), NEW_TEMPLATES);
    assert.deepEqual(PROJECT_TEMPLATES.filter((info) => info.isNew).map((info) => info.id), NEW_TEMPLATES);
    for (const id of NEW_TEMPLATES) {
        const info = PROJECT_TEMPLATES.find((item) => item.id === id);
        assert.ok(info.name.tr && info.name.en && info.description.tr && info.description.en, `${id} has copy`);
        const project = createProjectFromTemplate(id);
        assert.equal(project.dimension, info.dimension);
        assert.equal(project.scenes[0].metadata.templateId, id);
        const languages = new Set(project.scripts.map((item) => (item.language === "cpp" ? "C++" : "C#")));
        assert.deepEqual([...languages].sort(), [...info.languages].sort(), `${id} lists the languages it uses`);
    }
});

// ---------------------------------------------------------------------------
// Engine fixes used by the templates
// ---------------------------------------------------------------------------

test("C++: a vector of pointers starts empty, a pointer to a vector starts null", () => {
    const game = startWorld(projectWithScripts([["Bag.cpp", `#include <hanogt.h>
class Bag : public MonoBehaviour {
public:
    std::vector<GameObject*> parts;
    std::vector<int>* maybe = nullptr;
    std::map<std::string, Transform*> named;
    void Start() {
        parts.push_back(gameObject);
        named["self"] = transform;
        Debug::Log("parts " + std::to_string(parts.size()) + " named " + std::to_string(named.size()) + " maybe " + (maybe == nullptr ? "null" : "set"));
    }
};`]]));
    game.step(2);
    assert.deepEqual(game.problems(), []);
    assert.ok(game.messages().includes("parts 1 named 1 maybe null"), game.messages().join(" | "));
});

test("a destroyed script compares equal to null (Unity fake null)", () => {
    const game = startWorld(projectWithScripts([
        ["Target.cs", `using UnityEngine;
public class Target : MonoBehaviour { public int hp = 1; }`],
        ["Watcher.cs", `using UnityEngine;
public class Watcher : MonoBehaviour
{
    private Target target;
    private int frames;
    void Start() { target = GameObject.Find("Target").GetComponent<Target>(); }
    void Update()
    {
        frames++;
        if (frames == 2) Destroy(target.gameObject);
        if (frames == 4) Debug.Log("after destroy: " + (target == null ? "null" : "alive") + " / " + (target ? "truthy" : "falsy"));
        if (frames == 1) Debug.Log("before destroy: " + (target != null ? "alive" : "null"));
    }
}`],
    ]));
    game.step(6);
    assert.deepEqual(game.problems(), []);
    assert.ok(game.messages().includes("before destroy: alive"));
    assert.ok(game.messages().includes("after destroy: null / falsy"), game.messages().join(" | "));
});

test("a timer started by a method another script calls belongs to the called script", () => {
    // The enemy calls Manager.Killed() and destroys itself right after; the manager's timer must still fire.
    const game = startWorld(projectWithScripts([
        ["Manager.cs", `using UnityEngine;
public class Manager : MonoBehaviour
{
    public static Manager Instance;
    void Awake() { Instance = this; }
    public void Killed() { Timer.After(0.2f, () => Debug.Log("next wave")); }
}`],
        ["Enemy.cs", `using UnityEngine;
public class Enemy : MonoBehaviour
{
    void Start() { Manager.Instance.Killed(); Destroy(gameObject); }
}`],
    ]));
    game.step(30);
    assert.deepEqual(game.problems(), []);
    assert.ok(game.messages().includes("next wave"), game.messages().join(" | "));
});

// ---------------------------------------------------------------------------
// Arcade
// ---------------------------------------------------------------------------

test("neon run: jumps clear every obstacle at any speed, a crash ends the run and saves the record", () => {
    for (const seed of [1001, 1002, 1003]) {
        seeded(seed, () => {
            const game = startWorld(createProjectFromTemplate("runner-2d"));
            const player = game.find("Player");
            const state = game.fields("RunGame");
            let frames = 0;
            while (frames < 60 * 40 && !state.over) {
                const danger = [...game.findAll("Spike"), ...game.findAll("Wall")].some((item) => {
                    const ahead = xy(item).x - xy(player).x;
                    return ahead > 0.5 && ahead < state.speed * 0.22 + 0.9;
                });
                if (danger && player.body.grounded) game.press("Space");
                else game.step(1);
                frames += 1;
            }
            assert.equal(state.over, false, `seed ${seed}: the autopilot survives 40 s`);
            assert.ok(state.speed > 14, "the world sped up");
            assert.ok(state.coins > 10, "coins were collected");
            assert.deepEqual(game.problems(), []);
        });
    }
    const storage = memoryStorage();
    const game = seeded(5, () => {
        const run = startWorld(createProjectFromTemplate("runner-2d"), { storage });
        run.step(60 * 20);
        return run;
    });
    assert.equal(game.fields("RunGame").over, true, "standing still hits an obstacle");
    assert.equal(game.find("GameOverPanel").activeInHierarchy, true);
    assert.match(game.text("ResultText"), /Yeni rekor!/);
    assert.ok([...storage.store.values()].some((value) => value.includes("runner2d.best")), "the record is saved");
});

test("flap: the autopilot scores through the pipes; without input the bird lands and the game ends", () => {
    seeded(7, () => {
        const game = startWorld(createProjectFromTemplate("flappy-2d"));
        const bird = game.find("Bird");
        game.step(30);
        assert.equal(game.fields("FlappyGame").state, 0, "Ready");
        game.press("Space");
        assert.equal(game.fields("FlappyGame").state, 1, "Playing");
        for (let frame = 0; frame < 60 * 25; frame += 1) {
            const zones = game.findAll("ScoreZone").filter((zone) => xy(zone).x > xy(bird).x - 0.5).sort((a, b) => xy(a).x - xy(b).x);
            const target = zones[0] ? xy(zones[0]).y - 0.4 : 0;
            if (xy(bird).y < target && bird.body.velocity.y < 0) game.press("Space");
            else game.step(1);
        }
        assert.ok(Number(game.text("ScoreText")) >= 10, `score ${game.text("ScoreText")}`);
        assert.equal(game.find("GameOverPanel").activeInHierarchy, false);
        assert.deepEqual(game.problems(), []);
    });
    const game = startWorld(createProjectFromTemplate("flappy-2d"));
    game.press("Space");
    game.step(240);
    assert.equal(game.fields("FlappyGame").state, 2, "Over");
    assert.equal(game.find("GameOverPanel").activeInHierarchy, true);
    assert.ok(Math.abs(xy(game.find("Bird")).y - -4.29) < 0.1, `the bird rests on the ground (y=${xy(game.find("Bird")).y})`);
});

test("pong: rallies speed up, the computer misses angled shots and a second player can take over", () => {
    seeded(3, () => {
        const game = startWorld(createProjectFromTemplate("pong-2d"));
        const ball = game.find("Ball");
        const left = game.find("LeftPaddle");
        let returns = 0;
        let lastVx = 0;
        for (let frame = 0; frame < 60 * 60; frame += 1) {
            left.setWorldPosition({ x: xy(left).x, y: Math.max(-3.9, Math.min(3.9, xy(ball).y - 0.7)), z: 0 });
            game.step(1);
            if (lastVx < 0 && ball.body.velocity.x > 0) returns += 1;
            lastVx = ball.body.velocity.x;
        }
        assert.ok(returns > 10, `${returns} returns`);
        assert.ok(Number(game.text("LeftScore")) >= 1, "the angled paddle beats the computer at least once");
        assert.ok(Math.hypot(ball.body.velocity.x, ball.body.velocity.y) > 8, "the rally sped up");
        assert.deepEqual(game.problems(), []);
    });
    const game = startWorld(createProjectFromTemplate("pong-2d"));
    const right = game.find("RightPaddle");
    game.hold("UpArrow", true);
    game.step(30);
    game.hold("UpArrow", false);
    assert.ok(xy(right).y > 2, "↑ moves the right paddle (two-player mode)");
    game.step(30);
    const resting = xy(right).y;
    game.step(60);
    assert.equal(xy(right).y, resting, "after a human takes over, the computer stops steering");
});

test("snake (C++): turns, eats, grows, speeds up and dies at the wall", () => {
    const storage = memoryStorage();
    const game = startWorld(createProjectFromTemplate("snake-2d"), { storage });
    game.step(2);
    const state = game.fields("Snake");
    assert.equal(state.xs.items.length, 4);
    assert.equal(game.findAll("Segment").length, 4);
    const startY = state.ys.items[0];
    game.press("UpArrow");
    game.step(12);
    assert.equal(state.ys.items[0], startY + 1, "the head moved up");
    state.foodX = state.xs.items[0];
    state.foodY = state.ys.items[0] + 1;
    game.step(12);
    assert.equal(game.text("ScoreText"), "Elma: 1");
    assert.equal(state.xs.items.length, 5);
    assert.equal(game.findAll("Segment").length, 5);
    assert.ok(state.delay < 0.16, "eating speeds the snake up");
    game.step(60 * 10);
    assert.equal(state.over, true);
    assert.equal(game.find("GameOverPanel").activeInHierarchy, true);
    assert.match(game.text("ResultText"), /Rekor: 1/);
    assert.deepEqual(game.problems(), []);
});

// ---------------------------------------------------------------------------
// Adventure
// ---------------------------------------------------------------------------

test("little adventure: talk, fight, take the key, open the gate and win at the chest", () => {
    const game = seeded(11, () => startWorld(createProjectFromTemplate("rpg-topdown-2d")));
    const hero = game.find("Hero");
    const teleport = (x, y) => {
        hero.setWorldPosition({ x, y, z: 0 });
        zeroVelocity(hero);
    };
    game.step(30);
    assert.equal(game.text("HeartsText"), "♥♥♥♥♥");
    game.hold("D", true);
    game.step(30);
    game.hold("D", false);
    assert.ok(xy(hero).x > 7, "WASD walks");

    teleport(9.5, 5.3);
    game.step(2);
    assert.equal(game.text("PromptText"), "E: Konuş");
    game.press("E");
    assert.equal(game.fields("Dialogue").open, true);
    assert.equal(game.text("SpeakerText"), "Bilge Ayla");
    assert.equal(game.fields("Hero").frozen, true, "the hero stands still while talking");
    for (let line = 0; line < 4; line += 1) {
        game.step(8);
        game.press("E");
    }
    game.step(10);
    assert.equal(game.fields("Dialogue").open, false, "the last line closes the box without reopening it");
    assert.match(game.text("QuestText"), /anahtarı al/);

    const slime = game.findAll("Slime")[0];
    for (let swing = 0; swing < 2; swing += 1) {
        teleport(8, 3.2);
        slime.setWorldPosition({ x: 8.9, y: 3.2, z: 0 });
        zeroVelocity(slime);
        game.step(1);
        game.press("Space");
        game.step(25);
    }
    assert.equal(slime.destroyed, true, "two sword hits defeat a slime");
    assert.equal(game.fields("RpgGame").slimes, 1);

    teleport(15.4, 11);
    game.hold("D", true);
    game.step(20);
    game.hold("D", false);
    assert.equal(game.find("Gate").activeInHierarchy, true, "the gate stays shut without the key");

    teleport(3.5, 17.3);
    game.step(10);
    assert.equal(game.fields("Hero").hasKey, true);
    assert.equal(game.text("KeyText"), "Anahtar: var");

    teleport(15.4, 11);
    game.hold("D", true);
    game.step(20);
    game.hold("D", false);
    game.step(40);
    assert.equal(game.find("Gate").activeInHierarchy, false, "the key opens the gate");

    teleport(28.4, 14.5);
    game.step(3);
    assert.equal(game.text("PromptText"), "E: Sandığı aç");
    game.press("E");
    game.step(60);
    assert.equal(game.find("GameOverPanel").activeInHierarchy, true);
    assert.equal(game.text("Title"), "Hazineyi buldun!");
    assert.match(game.text("ResultText"), /Yenilen balçık: 1/);
    assert.deepEqual(game.problems(), []);
});

test("little adventure: slimes hurt with a grace period and five hits knock the hero out", () => {
    const game = seeded(12, () => startWorld(createProjectFromTemplate("rpg-topdown-2d")));
    const hero = game.find("Hero");
    const slime = game.findAll("Slime")[0];
    game.step(10);
    for (let hit = 0; hit < 5; hit += 1) {
        slime.setWorldPosition({ x: xy(hero).x + 0.6, y: xy(hero).y, z: 0 });
        game.step(4);
        game.step(65);
    }
    game.step(60);
    assert.equal(game.fields("Hero").health, 0);
    assert.equal(game.text("HeartsText"), "♡♡♡♡♡");
    assert.equal(game.find("GameOverPanel").activeInHierarchy, true);
    assert.equal(game.text("Title"), "Bayıldın...");
});

test("obstacle course: platforms carry you, checkpoints catch falls and the finish saves a best time", () => {
    const storage = memoryStorage();
    const game = startWorld(createProjectFromTemplate("obstacle-course-3d"), { storage });
    const player = game.find("Player");
    const teleport = (x, y, z) => {
        player.setWorldPosition({ x, y, z });
        zeroVelocity(player);
    };
    game.step(60);
    assert.ok(Math.abs(xy(player).y - 0.55) < 0.05, "the runner stands on the start");
    game.hold("W", true);
    game.step(30);
    game.hold("W", false);
    game.step(10);
    assert.ok(xy(player).z > 1, "W runs forward");
    game.press("Space");
    game.step(12);
    assert.ok(xy(player).y > 1.5, "Space jumps");
    game.step(60);

    const slider = game.find("Slider");
    teleport(xy(slider).x, 1.7, 20.5);
    game.step(30);
    const sliderStart = xy(slider).x;
    const playerStart = xy(player).x;
    game.step(60);
    assert.ok(Math.abs(xy(slider).x - sliderStart) > 2, "the slider moves");
    assert.ok(Math.abs((xy(player).x - playerStart) - (xy(slider).x - sliderStart)) < 0.3, "the runner rides along");

    const elevator = game.find("Elevator");
    teleport(0, xy(elevator).y + 1, 30.5);
    let highest = 0;
    for (let frame = 0; frame < 240; frame += 1) {
        game.step(1);
        highest = Math.max(highest, xy(player).y);
    }
    assert.ok(highest > 4.3, `the elevator lifts the runner (max y ${highest.toFixed(2)})`);

    teleport(0, 4.6, 34);
    game.hold("W", true);
    game.step(30);
    game.hold("W", false);
    assert.equal(game.text("CheckpointText"), "Kontrol: 1/3");

    teleport(0, 4.6, 40);
    let knocked = false;
    for (let frame = 0; frame < 300 && !knocked; frame += 1) {
        game.step(1);
        knocked = game.fields("Player").stunnedUntil > 0;
    }
    assert.ok(knocked, "a sweeper knocks the runner back");

    teleport(5, 4.6, 45);
    game.step(90);
    assert.equal(game.fields("CourseGame").falls, 1);
    assert.ok(Math.abs(xy(player).z - 35.5) < 0.5, "a fall respawns at the last checkpoint");

    const tile = game.findAll("Tile")[4];
    const view = tile.components.find((component) => component.type === "meshRenderer");
    teleport(xy(tile).x, 4.6, xy(tile).z);
    game.step(40);
    assert.equal(view.enabled, false, "a stepped-on tile vanishes");
    game.step(200);
    assert.equal(view.enabled, true, "and comes back");

    teleport(0, 4.6, 91);
    game.hold("W", true);
    game.step(40);
    game.hold("W", false);
    game.step(60);
    assert.equal(game.fields("CourseGame").finished, true);
    assert.equal(game.find("GameOverPanel").activeInHierarchy, true);
    assert.match(game.text("ResultText"), /Yeni rekor!\nSüre: \d:\d\d\.\d\d/);
    assert.ok([...storage.store.values()].some((value) => value.includes("course.best")), "the best time is saved");
    assert.deepEqual(game.problems(), []);
});

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

function playTowerDefense(mode) {
    return seeded(7, () => {
        const game = startWorld(createProjectFromTemplate("tower-defense-2d"));
        const state = game.fields("TowerGame");
        const spots = [[-4.1, 0], [1, 0], [-8.6, 0], [5.5, 0], [-4.1, -4.3], [1, 4.3], [-4.1, 4.3], [5.5, -4.3]];
        const level = new Map();
        const act = () => {
            const built = spots.filter(([x, y]) => (level.get(`${x},${y}`) ?? 0) > 0);
            const free = spots.filter(([x, y]) => !level.get(`${x},${y}`));
            const build = () => {
                const [x, y] = free[0];
                clickWorld(game, x, y);
                level.set(`${x},${y}`, 1);
            };
            if (mode === "lazy") {
                if (built.length < 2 && state.gold >= 50) build();
                return;
            }
            if (built.length < 4 && state.gold >= 50) return build();
            const upgradable = built.filter(([x, y]) => level.get(`${x},${y}`) < 3).sort((a, b) => level.get(`${a[0]},${a[1]}`) - level.get(`${b[0]},${b[1]}`));
            if (upgradable.length) {
                const [x, y] = upgradable[0];
                const current = level.get(`${x},${y}`);
                if (state.gold >= 50 * current) {
                    clickWorld(game, x, y);
                    level.set(`${x},${y}`, current + 1);
                }
                return;
            }
            if (free.length && state.gold >= 50) build();
        };
        let frames = 0;
        while (!state.over && frames < 60 * 600) {
            game.step(30);
            frames += 30;
            act();
        }
        return { game, state };
    });
}

test("castle defense: towers are built and upgraded with gold; an active player wins, a passive one loses", () => {
    const game = startWorld(createProjectFromTemplate("tower-defense-2d"));
    game.step(10);
    assert.equal(game.text("GoldText"), "Altın: 120");
    clickWorld(game, -4.1, 0);
    assert.equal(game.text("GoldText"), "Altın: 70");
    assert.equal(game.findAll("Tower(Clone)").length, 1);
    clickWorld(game, -4.1, 0);
    assert.equal(game.text("GoldText"), "Altın: 20", "the first upgrade costs 50");
    clickWorld(game, 1, 0);
    assert.equal(game.findAll("Tower(Clone)").length, 1, "no tower without enough gold");
    game.press("Space");
    assert.match(game.text("WaveText"), /^Dalga 1 \/ 10$/);

    const active = playTowerDefense("smart");
    assert.equal(active.state.over, true);
    assert.equal(active.state.wave, 10);
    assert.ok(active.state.lives > 0);
    assert.equal(active.game.text("Title"), "Kale kurtuldu!");
    assert.deepEqual(active.game.problems(), []);

    const passive = playTowerDefense("lazy");
    assert.equal(passive.state.over, true);
    assert.equal(passive.state.lives, 0);
    assert.ok(passive.state.wave < 8, `the passive player falls early (wave ${passive.state.wave})`);
    assert.equal(passive.game.text("Title"), "Kale düştü...");
});

test("neon arena (C++): aiming with the mouse clears waves; standing still ends the run", () => {
    seeded(5, () => {
        const storage = memoryStorage();
        const game = startWorld(createProjectFromTemplate("arena-2d"), { storage });
        const input = game.world.input;
        const player = game.find("Player");
        const state = game.fields("ArenaGame");
        game.step(150);
        input.mouseHeld.add(0);
        input.pendingMouseDown.add(0);
        for (let frame = 0; frame < 60 * 45; frame += 1) {
            const enemies = [...game.findAll("Chaser"), ...game.findAll("Dasher")].filter((item) => !item.destroyed);
            let nearest = null;
            let best = Infinity;
            for (const enemy of enemies) {
                const distance = Math.hypot(xy(enemy).x - xy(player).x, xy(enemy).y - xy(player).y);
                if (distance < best) [best, nearest] = [distance, enemy];
            }
            if (nearest) {
                // The arena camera shows ±5.9 units vertically on a 540 px tall screen.
                input.mouseX = 480 + xy(nearest).x * (270 / 5.9);
                input.mouseY = 270 + xy(nearest).y * (270 / 5.9);
            }
            for (const key of ["W", "A", "S", "D"]) game.hold(key, false);
            if (nearest && best < 3) {
                const dx = xy(player).x - xy(nearest).x;
                const dy = xy(player).y - xy(nearest).y;
                if (dx > 0.3) game.hold("D", true);
                if (dx < -0.3) game.hold("A", true);
                if (dy > 0.3) game.hold("W", true);
                if (dy < -0.3) game.hold("S", true);
            }
            game.step(1);
        }
        assert.ok(state.wave >= 4, `waves advance (wave ${state.wave})`);
        assert.ok(state.score > 300, `score ${state.score}`);
        assert.equal(state.over, false);
        input.mouseHeld.delete(0);
        for (const key of ["W", "A", "S", "D"]) game.hold(key, false);
        game.step(60 * 30);
        assert.equal(state.over, true, "enemies wear the idle player down");
        game.step(60);
        assert.equal(game.find("GameOverPanel").activeInHierarchy, true);
        assert.match(game.text("ResultText"), /Puan: \d+\nDalga: \d+/);
        assert.ok([...storage.store.values()].some((value) => value.includes("arena.best")));
        assert.deepEqual(game.problems(), []);
    });
});

test("neon arena (C++): the arrow keys also shoot", () => {
    const game = seeded(9, () => startWorld(createProjectFromTemplate("arena-2d")));
    game.hold("RightArrow", true);
    game.step(30);
    const bullets = game.findAll("Bullet");
    assert.ok(bullets.length > 0, "bullets fly");
    assert.ok(bullets.every((bullet) => bullet.body.velocity.x > 10), "to the right");
    game.hold("RightArrow", false);
});

// ---------------------------------------------------------------------------
// Hub helpers: scene sketches and template facts
// ---------------------------------------------------------------------------

const { sketchProject, SKETCH_WIDTH, SKETCH_HEIGHT } = await load("components/GameEngine/hub/scene-sketch.ts");
const { templateFacts } = await load("components/GameEngine/hub/template-facts.ts");

test("every template has a clean SVG sketch of its first frame", () => {
    for (const info of PROJECT_TEMPLATES) {
        const sketch = sketchProject(createProjectFromTemplate(info.id));
        assert.match(sketch.top, /^#[0-9a-f]{3,8}$/i, info.id);
        const numbers = JSON.stringify(sketch.shapes).match(/-?\d+(\.\d+)?|NaN|Infinity/g) ?? [];
        assert.ok(!numbers.some((value) => value === "NaN" || value === "Infinity"), `${info.id} has finite coordinates`);
        if (!info.id.startsWith("empty")) assert.ok(sketch.shapes.length >= 2, `${info.id} draws something (${sketch.shapes.length})`);
    }
    const runner = sketchProject(createProjectFromTemplate("runner-2d"));
    assert.ok(runner.shapes.some((shape) => shape.kind === "text" && shape.text === "Rekor: 0"), "UI text is drawn");
    assert.ok(!runner.shapes.some((shape) => shape.kind === "text" && shape.text === "Oyun Bitti"), "inactive panels are not drawn");
    const course = sketchProject(createProjectFromTemplate("obstacle-course-3d"));
    const polygons = course.shapes.filter((shape) => shape.kind === "polygon");
    assert.ok(polygons.length > 30, `3D faces are projected (${polygons.length})`);
    for (const polygon of polygons) {
        for (const point of polygon.points.split(" ")) {
            const [x, y] = point.split(",").map(Number);
            assert.ok(Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < SKETCH_WIDTH * 40 && Math.abs(y) < SKETCH_HEIGHT * 40, `sane point ${point}`);
        }
    }
});

test("template facts come from the project itself", () => {
    const rpg = templateFacts(createProjectFromTemplate("rpg-topdown-2d"));
    assert.equal(rpg.scripts[0].name, "Hero.cs");
    assert.ok(rpg.scripts.every((script) => script.language === "C#"));
    assert.ok(rpg.components.includes("Tilemap") && rpg.components.includes("Rigidbody2D") && rpg.components.includes("Panel"));
    assert.equal(rpg.lines, rpg.scripts.reduce((sum, script) => sum + script.lines, 0));
    const arena = templateFacts(createProjectFromTemplate("arena-2d"));
    assert.deepEqual([...new Set(arena.scripts.map((script) => script.language))].sort(), ["C#", "C++"]);
    const course = templateFacts(createProjectFromTemplate("obstacle-course-3d"));
    assert.ok(course.components.includes("Rigidbody") && course.components.includes("Mesh Renderer"));
    assert.ok(!course.components.includes("Tilemap"));
});
