/**
 * The V6 starter projects: a bullet-hell shooter built on object pools, physics
 * layers with the collision matrix and Particles V2, and a platformer painted
 * with rule tiles, animated water and one-way platforms, played on phones with
 * the virtual joystick.
 */
import { animationPreset } from "../animation";
import { createAnimation, createCameraFollow, createCharacterController2D, createCollider, createParticleSystem, createRigidBody } from "../components";
import { createEngineId } from "../ids";
import { defaultLayerSettings, setLayerCollision } from "../layers";
import { createBlankProject, createEmptyScene } from "../scene";
import { consecutiveRuleFrames } from "../tilemap";
import type { GameEntity, GameProjectDocument, ParticleSystemComponent, TileDefinition } from "../types";
import { camera2d, entity, finishProject, gameOverPanel, prefab, ref, script, scriptAsset, sprite, tilemap, uiText, type TileFill } from "./builders";

/** 8 × 3 cells of 16 px: 0–15 the ground rule tile (cell = N 1 + E 2 + S 4 + W 8), 16–19 water, 20 plank, 21 stone, 22 spikes, 23 crate. */
export const HILL_ATLAS = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAAAwCAYAAADZ9HK+AAADrklEQVR42u1bu4oVQRCtTzA0U9DMwERuoKGZG5gvwkabKIipgpgZLBiZGYhfsBiJgaCR3+AGJi6YrIF/MFoLtfRt+lHVNTO1t7oHijsz3adrTvfpx3TNBfh/vD55MrUYYu/duDK9O7zDshd7N7euEavxj6bxj9Y9fyxg83IzPTzeExliEBs/ADnB30ebq8UHInyLfzKNf3qGnvnPIoCUsnKqo2t8uLkqoNX/XALYZf4XAqCHkJynekBtyAnvhRXQ4j/VAyT+QwH0yv9CAJiAv6QOOkeLzylvWAFhwbWhh/KGFSD1T+ca/6EAeuW/tYjhKCYsPO4Ba+OpDCu8B/5FAdTmlhqBpfG1Clga74H/lgByQ0e4skytYq3wcQWsjffAH3KvEbGlCi+9Bq2Bp15khffAH1KLCO6KMrcIWgsf9gALvAf+5wKI1YGZawWGBKzwVIYV3gP/6lYmFZ4qtPYevDQ+ngPXxnvgnxUAZ0gpEVgDT7tpVngP/KG2lcjZybLCUxlWeA/8AVXQs6V6EPWOWsXmevBa+NwUIMEDPUTPxt00iedVazz3LaCEV8WiMZbNCTmWhi+NfzSNf7Te+UNrGDIMRGji4a3+yTT+0XrnP4sANPHwOSpAEw/vnT+0xKDDeLh0yIlXwRr/qR4gjYf3zh8o1twaD08VLImHt/qP77fGw3vnD1LFpFagVvgWxc+J98AfOPNFaSfLEs+d75bCe+APHHWV4tmWeE7Ic0m8B/7A3UPOxbMt8ZxesCTeA3+QBA9KBCzw1uke+ENKHZJ4tiU+p+618B74A3deycWzLfGSeXEJvAf+oBlSpH9KmBsvfSWaG++BP3Ayl3ayLPFcskvhPfDv/nuAUu/gxPMt8bXePb4HYH4LoInnW+JbN422vge4dnB81rP9+vh40tinL9+zdnD4rJoOyuPp/euTxuDr6fSXLFVBtXRp/jjd2v+3owdTzo72b021dGzIN2/fJw0bOJdG6XMJ4PPzuyK7EECqcmqVG9+T5C9hLfx7EAA1qKTx6Rduv/rxu2fzIgCuCOL83QsAG1Fjl0kANRGk8g4BOBNATgS5e90LgCoSG5Nb6WHeyyiA1FCfyzMEoBQANqLGlhJAuNIvpScFsP/hzxlartLidGn+mq3pf8kRoDYikABOfp6eX1OZkutFBDBGgN0XwJgChAJoPbQCwMakBkWTXo9F4BDAeA30IgA6517HAhgbQR0LYGwF77gApBYKQBUMGgLQHdp9gLkE0Gr/ADQQH2HeHqXMAAAAAElFTkSuQmCC";

// ---------------------------------------------------------------------------
// V6: Bullet Storm (object pools, layers and the collision matrix, Particles V2)
// ---------------------------------------------------------------------------

/** Physics layers of Bullet Storm. */
export const STORM_LAYERS = { player: 1, enemy: 2, playerShot: 3, enemyShot: 4 } as const;

export function bulletStorm(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    project.settings.aspect = "16:9";
    const layers = defaultLayerSettings();
    layers.names[STORM_LAYERS.player] = "Player";
    layers.names[STORM_LAYERS.enemy] = "Enemy";
    layers.names[STORM_LAYERS.playerShot] = "PlayerShot";
    layers.names[STORM_LAYERS.enemyShot] = "EnemyShot";
    // Only the ship × enemies, ship × enemy shots and enemies × ship shots meet;
    // the hundreds of bullets never test each other, nor their own side.
    const L = STORM_LAYERS;
    for (const [a, b] of [[L.playerShot, L.playerShot], [L.enemyShot, L.enemyShot], [L.playerShot, L.enemyShot], [L.player, L.playerShot], [L.enemy, L.enemyShot], [L.enemy, L.enemy], [0, L.playerShot], [0, L.enemyShot]]) {
        setLayerCollision(layers.collisions, a, b, false);
    }
    project.settings.layers = layers;
    project.settings.input.actions.push({ name: "Bomb", kind: "button", positive: ["X", "B"], negative: [], gamepadPositive: ["B"], gamepadNegative: [], gamepadAxis: null, invert: false });
    project.settings.touchLayout = { stick: "joystick", side: "left", size: 140, deadZone: 0.12, buttons: [{ action: "Bomb", label: "B" }] };

    const shipScript = scriptAsset("Ship.cs", `
using UnityEngine;

// Gemi: "Horizontal" ve "Vertical" eksenleriyle her yöne uçar (klavye, gamepad ya da
// telefondaki sanal joystick) ve kendiliğinden ateş eder. Mermiler Pool.Spawn ile
// havuzdan gelir; yok edilmezler, Pool.Despawn ile havuza dönerler.
// Gemi "Player" katmanında: çarpışma tablosu (Proje Ayarları → Katmanlar) onu yalnızca
// düşmanlara ve düşman mermilerine çarptırır, kendi mermilerine değil.
public class Ship : MonoBehaviour
{
    public StormGame game;
    public float speed = 7.5f;
    public float fireRate = 0.08f;
    [Tooltip("Deneme modu: gemi vurulmaz")]
    public bool invincible = false;

    private float nextShot;
    private float safeUntil;
    private SpriteRenderer body;

    void Start()
    {
        body = GetComponent<SpriteRenderer>();
    }

    void Update()
    {
        if (!game.playing) return;
        Vector3 move = new Vector3(Input.GetAxis("Horizontal"), Input.GetAxis("Vertical"), 0f);
        if (move.magnitude > 1f) move = move.normalized;
        Vector3 position = transform.position + move * speed * Time.deltaTime;
        position.x = Mathf.Clamp(position.x, -8.3f, 8.3f);
        position.y = Mathf.Clamp(position.y, -4.6f, 2.2f);
        transform.position = position;

        if (Time.time >= nextShot)
        {
            nextShot = Time.time + fireRate;
            Pool.Spawn("Shot", position + new Vector3(-0.2f, 0.45f, 0f));
            Pool.Spawn("Shot", position + new Vector3(0.2f, 0.45f, 0f));
        }
        if (Input.GetButtonDown("Bomb")) game.Bomb(position);
        // Vurulduktan sonra kısa süre yanıp söner ve hasar almaz.
        body.enabled = Time.time >= safeUntil || Mathf.Repeat(Time.time * 14f, 1f) > 0.4f;
    }

    // Çarpışma tablosu sayesinde buraya yalnızca düşmanlar ve düşman mermileri gelir.
    void OnTriggerEnter2D(Collider2D other)
    {
        if (!game.playing || invincible || Time.time < safeUntil) return;
        safeUntil = Time.time + 1.6f;
        if (other.gameObject.layer == LayerMask.NameToLayer("EnemyShot")) Pool.Despawn(other.gameObject);
        game.ShipHit();
    }
}`);

    const bulletScript = scriptAsset("Bullet.cs", `
using UnityEngine;

// Mermi (geminin ve düşmanların): Launch ile yön ve hız alır, ekrandan çıkınca havuza döner.
// OnEnable her Pool.Spawn'da çalışır; Awake ve Start yalnızca kopyanın ilk Spawn'ında.
public class Bullet : MonoBehaviour
{
    public float speed = 16f;
    public int damage = 1;

    private Rigidbody2D rb;

    void OnEnable()
    {
        if (rb == null) rb = GetComponent<Rigidbody2D>();
        rb.velocity = new Vector2(0f, speed);
    }

    public void Launch(float degrees, float launchSpeed)
    {
        float radians = degrees * Mathf.Deg2Rad;
        rb.velocity = new Vector2(Mathf.Cos(radians) * launchSpeed, Mathf.Sin(radians) * launchSpeed);
    }

    void Update()
    {
        Vector3 p = transform.position;
        if (p.y > 6f || p.y < -6f || p.x > 9.5f || p.x < -9.5f) Pool.Despawn(gameObject);
    }
}`);

    const droneScript = scriptAsset("Drone.cs", `
using UnityEngine;

// Düşman: yerine uçar ve mermi desenleri atar. Mermileri kendi içinden doğar ama ona
// çarpmaz: "EnemyShot" × "Enemy" çifti çarpışma tablosunda kapalı.
public class Drone : MonoBehaviour
{
    public int maxHealth = 6;
    public float fireEvery = 1.4f;
    public int points = 100;
    [Tooltip("0: nişanlı yelpaze, 1: halka, 2: sarmal (boss)")]
    public int pattern = 0;

    private StormGame game;
    private Vector3 slot;
    private int health;
    private float nextFire;
    private float spin;

    // Pool.Spawn her seferinde OnEnable'ı çağırır: can burada dolar.
    void OnEnable()
    {
        health = maxHealth;
        nextFire = Time.time + 1.2f;
    }

    public void Setup(StormGame owner, Vector3 target)
    {
        game = owner;
        slot = target;
    }

    void Update()
    {
        if (game == null || !game.playing) return;
        Vector3 sway = new Vector3(Mathf.Sin(Time.time * 0.8f + slot.x) * 0.8f, 0f, 0f);
        transform.position = Vector3.MoveTowards(transform.position, slot + sway, 5f * Time.deltaTime);
        if (Time.time >= nextFire)
        {
            nextFire = Time.time + fireEvery;
            Fire();
        }
    }

    void Fire()
    {
        Vector3 toShip = game.ship.transform.position - transform.position;
        float aim = Mathf.Atan2(toShip.y, toShip.x) * Mathf.Rad2Deg;
        if (pattern == 0)
        {
            for (int i = -1; i <= 1; i++) Shoot(aim + i * 14f, 4.5f);
        }
        else if (pattern == 1)
        {
            spin += 15f;
            for (int i = 0; i < 12; i++) Shoot(spin + i * 30f, 3.2f);
        }
        else
        {
            // Boss: a five-armed spiral and, every few turns, an aimed fan.
            spin += 9f;
            for (int i = 0; i < 5; i++) Shoot(spin + i * 72f, 3.2f);
            if (Mathf.Repeat(spin, 81f) < 9f)
            {
                for (int i = -2; i <= 2; i++) Shoot(aim + i * 10f, 5f);
            }
        }
    }

    void Shoot(float degrees, float speed)
    {
        Bullet bullet = Pool.Spawn<Bullet>("EnemyShot", transform.position);
        bullet.Launch(degrees, speed);
        game.CountShot();
    }

    // Geminin mermileri can götürür. Düşman mermileri de Bullet'tır ama buraya hiç gelmez (tablo).
    void OnTriggerEnter2D(Collider2D other)
    {
        Bullet shot = other.GetComponent<Bullet>();
        if (shot == null || health <= 0) return;
        Pool.Despawn(other.gameObject);
        health -= shot.damage;
        if (health > 0) return;
        game.DroneDown(this, points);
        Pool.Despawn(gameObject);
    }
}`);

    const boomScript = scriptAsset("Boom.cs", `
using UnityEngine;

// Patlama efekti de havuzdan gelir: parçacıklar her Spawn'da baştan başlar,
// "lifetime" saniye sonra kopya havuza döner.
public class Boom : MonoBehaviour
{
    public float lifetime = 1.2f;

    void OnEnable()
    {
        Pool.Despawn(gameObject, lifetime);
    }
}`);

    const gameScript = scriptAsset("StormGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Dalgalar, puan, can ve bomba. Düşmanlar, mermiler ve patlamalar nesne havuzlarından
// gelir (Pool): kopyalar yok edilmez, yeniden kullanılır. Oynat → istatistikler panosunda
// havuz sayacını ve betiklerin kare başına süresini izleyebilirsiniz.
public class StormGame : MonoBehaviour
{
    public Ship ship;
    public Text scoreText;
    public Text livesText;
    public Text waveText;
    public Text bulletText;
    public GameObject overPanel;
    public Text overText;
    public GameObject winPanel;
    public Text winText;
    public bool playing = true;
    public int lives = 3;
    public int bombs = 2;

    public int score;
    public int wave;
    public int alive;
    public int dronesDown;
    public int shotsFired;

    private float nextWave = 1f;
    private bool waiting = true;

    void Start()
    {
        // Kaç kopya hazır bekleyecek ve en fazla kaç kopya olabilir.
        Pool.SetCapacity("EnemyShot", 400);
        Pool.Prewarm("EnemyShot", 150);
        Pool.Prewarm("Shot", 40);
        Pool.Prewarm("Drone", 6);
        Pool.Prewarm("Boom", 6);
        UpdateTexts();
    }

    void Update()
    {
        bulletText.text = "Mermi: " + Pool.Count("EnemyShot") + " / " + Pool.CountAll("EnemyShot");
        if (!playing)
        {
            if (Input.GetKeyDown(KeyCode.R)) Restart();
            return;
        }
        if (alive == 0 && !waiting)
        {
            waiting = true;
            nextWave = Time.time + 1.5f;
        }
        if (waiting && Time.time >= nextWave)
        {
            waiting = false;
            StartWave();
        }
    }

    void StartWave()
    {
        wave++;
        if (wave == 1)
        {
            for (int i = 0; i < 5; i++) SpawnDrone("Drone", new Vector3(-6f + i * 3f, 3f, 0f));
        }
        else if (wave == 2)
        {
            for (int i = 0; i < 6; i++) SpawnDrone(i % 2 == 0 ? "Drone" : "RingDrone", new Vector3(-6.25f + i * 2.5f, 2.6f + (i % 2) * 0.8f, 0f));
        }
        else if (wave == 3)
        {
            SpawnDrone("Boss", new Vector3(0f, 2.8f, 0f));
        }
        else
        {
            Win();
            return;
        }
        waveText.text = wave < 3 ? "Dalga " + wave : "Boss";
        HUD.Show(waveText.text, 1f);
    }

    void SpawnDrone(string kind, Vector3 slot)
    {
        Drone drone = Pool.Spawn<Drone>(kind, new Vector3(slot.x, 6.5f, 0f));
        drone.Setup(this, slot);
        alive++;
    }

    public void CountShot()
    {
        shotsFired++;
    }

    public void DroneDown(Drone drone, int points)
    {
        alive--;
        dronesDown++;
        score += points;
        Pool.Spawn("Boom", drone.transform.position);
        Audio.Play("explosion", 0.3f);
        Camera.Shake(points > 500 ? 0.45f : 0.1f, 0.2f);
        UpdateTexts();
    }

    public void ShipHit()
    {
        lives--;
        Pool.Spawn("Boom", ship.transform.position);
        Camera.Shake(0.35f, 0.3f);
        // Gamepad'i ya da telefonu titretir; ikisi de yoksa bir şey yapmaz.
        Input.Vibrate(150, 0.7f);
        Audio.Play("hit");
        UpdateTexts();
        if (lives <= 0) GameOver();
    }

    // Bomba: yakındaki düşman mermilerini tek sorguda bulur (yalnızca "EnemyShot" katmanı).
    public void Bomb(Vector3 center)
    {
        if (bombs <= 0) return;
        bombs--;
        Collider2D[] hits = Physics2D.OverlapCircleAll(center, 3.5f, LayerMask.GetMask("EnemyShot"));
        foreach (Collider2D hit in hits) Pool.Despawn(hit.gameObject);
        Pool.Spawn("Boom", center);
        Camera.Shake(0.25f, 0.25f);
        Audio.Play("powerup", 0.5f);
        UpdateTexts();
    }

    void GameOver()
    {
        playing = false;
        overText.text = "Puan: " + score + "   •   Dalga: " + wave;
        overPanel.SetActive(true);
        Audio.Play("lose");
    }

    void Win()
    {
        playing = false;
        winText.text = "Puan: " + score + "   •   Kalan can: " + lives;
        winPanel.SetActive(true);
        Audio.Play("win");
    }

    public void Restart()
    {
        SceneManager.ReloadScene();
    }

    void UpdateTexts()
    {
        scoreText.text = "Puan: " + score;
        livesText.text = "Can: " + lives + "   Bomba: " + bombs;
    }
}`);
    project.scripts = [shipScript, bulletScript, droneScript, boomScript, gameScript];

    const scene = createEmptyScene("Fırtına", "2d");
    scene.settings.background = { mode: "solid", color: "#0b1026", topColor: "#0b1026" };

    const manager = entity("GameManager", []);
    const kinematic = () => createRigidBody({ bodyType: "kinematic", useGravity: false, freezeRotation: true });

    // Pooled prefabs: ship shots, enemy shots, three kinds of drones and the explosion.
    const shot = prefab("Shot", entity("Shot", [
        sprite("#fde047", "roundedSquare", 6),
        kinematic(),
        createCollider({ shape: "box", isTrigger: true }),
        script(bulletScript, { speed: 16, damage: 1 }),
    ], { scale: { x: 0.1, y: 0.42 }, layer: STORM_LAYERS.playerShot }));
    const enemyShot = prefab("EnemyShot", entity("EnemyShot", [
        sprite("#f472b6", "circle", 7),
        kinematic(),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        script(bulletScript, { speed: 0, damage: 1 }),
    ], { scale: { x: 0.24, y: 0.24 }, layer: STORM_LAYERS.enemyShot }));
    const drone = (prefabName: string, color: string, shape: "hexagon" | "diamond" | "star", size: number, fields: Record<string, number>) => prefab(prefabName, entity(prefabName, [
        sprite(color, shape, 4),
        kinematic(),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        script(droneScript, fields),
    ], { scale: { x: size, y: size }, layer: STORM_LAYERS.enemy, tag: "Enemy" }));
    const fanDrone = drone("Drone", "#38bdf8", "hexagon", 0.8, { maxHealth: 6, fireEvery: 1.4, points: 100, pattern: 0 });
    const ringDrone = drone("RingDrone", "#a78bfa", "diamond", 0.8, { maxHealth: 8, fireEvery: 1.8, points: 150, pattern: 1 });
    const boss = drone("Boss", "#f43f5e", "star", 2.2, { maxHealth: 220, fireEvery: 0.1, points: 2000, pattern: 2 });

    // Particles V2: a ring-shaped burst with a colour gradient and a size curve; every spark that dies throws two embers (sub-emitter).
    const boomRoot = entity("Boom", [
        createParticleSystem({
            playOnStart: true, loop: false, duration: 0.3, emissionRate: 0, maxParticles: 80, lifetime: 0.55, startSpeed: 5.5, spread: 180,
            startSize: 0.3, endSize: 0.04, worldSpace: true,
            shape: "circle", shapeRadius: 0.15, radiusThickness: 1, arc: 360,
            bursts: [{ time: 0, count: 26, cycles: 1, interval: 0.1 }],
            colorStops: [
                { time: 0, color: "#ffffff", alpha: 1 },
                { time: 0.25, color: "#fde047", alpha: 1 },
                { time: 0.6, color: "#fb923c", alpha: 0.9 },
                { time: 1, color: "#ef4444", alpha: 0 },
            ],
            midSize: 0.42,
            subEmitterCount: 2,
        }),
        script(boomScript, { lifetime: 1.2 }),
    ]);
    const embers = entity("Embers", [createParticleSystem({
        playOnStart: false, loop: false, emissionRate: 0, maxParticles: 200, lifetime: 0.35, startSpeed: 2.5, spread: 180, startSize: 0.08, endSize: 0,
        worldSpace: true, colorStops: [{ time: 0, color: "#fef08a", alpha: 1 }, { time: 1, color: "#f97316", alpha: 0 }],
    })], { parentId: boomRoot.id });
    (boomRoot.components[1] as ParticleSystemComponent).subEmitterId = embers.id;
    const boom = prefab("Boom", boomRoot, [embers]);
    project.prefabs = [shot, enemyShot, fanDrone, ringDrone, boss, boom];

    // The ship with an engine flame: a cone turned to point down.
    const ship = entity("Ship", [
        sprite("#22d3ee", "triangle", 8),
        kinematic(),
        createCollider({ shape: "circle", radius: 0.22, isTrigger: true }),
        script(shipScript, { game: ref(manager) }),
    ], { position: { x: 0, y: -3.6 }, scale: { x: 0.7, y: 0.8 }, layer: STORM_LAYERS.player, tag: "Player" });
    const flame = entity("EngineFlame", [createParticleSystem({
        emissionRate: 45, maxParticles: 60, lifetime: 0.3, startSpeed: 3.5, spread: 12, startSize: 0.18, endSize: 0.02, worldSpace: true,
        shape: "cone", shapeRadius: 0.08, colorStops: [{ time: 0, color: "#e0f2fe", alpha: 1 }, { time: 0.5, color: "#38bdf8", alpha: 0.8 }, { time: 1, color: "#1d4ed8", alpha: 0 }],
    })], { parentId: ship.id, position: { x: 0, y: -0.55 }, rotation: { x: 90, y: 0, z: 0 } });

    // A star field streaming down: an edge across the top of the screen, turned to emit downwards.
    const stars = entity("StarField", [createParticleSystem({
        emissionRate: 16, maxParticles: 120, lifetime: 4.2, startSpeed: 2.8, spread: 0, startSize: 0.07, endSize: 0.07, worldSpace: true,
        shape: "edge", edgeLength: 18, colorStops: [{ time: 0, color: "#ffffff", alpha: 0.9 }, { time: 1, color: "#c7d2fe", alpha: 0.3 }],
    })], { position: { x: 0, y: 5.6 }, rotation: { x: 90, y: 0, z: 0 } });

    const scoreText = entity("ScoreText", [uiText("Puan: 0", { anchor: "top-left", fontSize: 26, color: "#fde047" })]);
    const livesText = entity("LivesText", [uiText("Can: 3   Bomba: 2", { anchor: "top-left", fontSize: 20, offset: { x: 16, y: 52 }, color: "#bae6fd" })]);
    const waveText = entity("WaveText", [uiText("", { anchor: "top", fontSize: 22, offset: { x: 0, y: 16 } })]);
    const bulletText = entity("BulletText", [uiText("Mermi: 0", { anchor: "top-right", fontSize: 18, offset: { x: 16, y: 16 }, color: "#f9a8d4", bold: false })]);
    const hint = entity("HintText", [uiText("WASD / oklar / joystick: uç  •  X / B: bomba  •  Gemi kendiliğinden ateş eder", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 14 }, bold: false, color: "#c7d2fe" })]);

    const over = gameOverPanel(manager, "Gemi düştü", "Yeniden (R)", "#6366f1");
    over.panel.name = "OverPanel";
    over.result.name = "OverText";
    const win = gameOverPanel(manager, "Fırtına dindi", "Yeniden (R)", "#16a34a");
    win.panel.name = "WinPanel";
    win.heading.components.forEach((component) => {
        if (component.type === "uiText") component.color = "#86efac";
    });
    win.result.name = "WinText";

    manager.components.push(script(gameScript, {
        ship: ref(ship),
        scoreText: ref(scoreText),
        livesText: ref(livesText),
        waveText: ref(waveText),
        bulletText: ref(bulletText),
        overPanel: ref(over.panel),
        overText: ref(over.result),
        winPanel: ref(win.panel),
        winText: ref(win.result),
    }));
    scene.objects.push(camera2d(5), stars, ship, flame, manager, scoreText, livesText, waveText, bulletText, hint, ...over.entities, ...win.entities);
    return finishProject(project, scene, "bullet-storm-2d");
}

// ---------------------------------------------------------------------------
// V6: Hill Run (rule tiles, animated tiles, one-way platforms, virtual joystick)
// ---------------------------------------------------------------------------

/** Ground tiles: the dirt rule tile picks its edges from its neighbours; stone walls close the level. */
const HILL_GROUND: TileDefinition[] = [
    { key: "#", name: "Toprak", color: "#ffffff", solid: true, frame: 15, rule: { neighbors: 4, frames: consecutiveRuleFrames(4, 0), matchAny: false }, animation: null, oneWay: false },
    { key: "@", name: "Taş", color: "#ffffff", solid: true, frame: 21, rule: null, animation: null, oneWay: false },
];
const HILL_PLATFORMS: TileDefinition[] = [
    { key: "-", name: "Köprü", color: "#ffffff", solid: true, frame: 20, rule: null, animation: null, oneWay: true },
];
const HILL_WATER: TileDefinition[] = [
    { key: "~", name: "Su", color: "#ffffff", solid: true, frame: 16, rule: null, animation: { frames: [16, 17, 18, 19], fps: 6 }, oneWay: false },
];

/** Cells: a cell (x, y) covers x…x+1 and y…y+1, so ground filled up to row y has its surface at y + 1. */
export const HILL_GROUND_FILLS: TileFill[] = [
    [-17, -6, -17, 12, "@"], [31, -6, 31, 12, "@"],
    [-16, -6, -6, -2, "#"],
    [-5, -6, -1, -1, "#"],
    [0, -6, 2, -5, "#"],
    [3, -6, 9, -1, "#"],
    [10, -6, 13, 1, "#"],
    [14, -6, 16, -5, "#"],
    [17, -6, 30, -1, "#"],
];
/** One-way bridges: their tops are at y 3, 6 and 9. */
export const HILL_PLATFORM_FILLS: TileFill[] = [
    [19, 2, 22, 2, "-"],
    [23, 5, 26, 5, "-"],
    [26, 8, 30, 8, "-"],
];
const HILL_WATER_FILLS: TileFill[] = [
    [0, -4, 2, -2, "~"],
    [14, -4, 16, -2, "~"],
];
export const HILL_COINS: Array<[number, number]> = [
    [-11, -0.4], [-3, 0.6], [1, 3], [6, 0.6], [11.5, 2.6], [15, 3], [20.5, 3.6], [24.5, 6.6], [28, 9.6],
];

export function hillRun(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    project.settings.aspect = "16:9";
    project.settings.pixelArt = true;
    project.settings.touchLayout = { stick: "joystick", side: "left", size: 130, deadZone: 0.15, buttons: [{ action: "Jump", label: "A" }, { action: "Fire1", label: "Blok" }] };
    const atlas = { id: createEngineId("texture"), name: "Tepe karoları", dataUrl: HILL_ATLAS, width: 128, height: 48, filter: "nearest" as const };
    project.textures = [atlas];

    const hikerScript = scriptAsset("Hiker.cs", `
using UnityEngine;

// Koşma ve zıplama Character Controller 2D'den gelir: "Horizontal" ve "Jump" giriş
// eylemleri (klavye, gamepad, telefonda sanal joystick ve A düğmesi).
// Tek yönlü köprülere alttan zıplayıp üstüne konarsın; köprüdeyken aşağı basınca
// içinden düşersin (Physics2D.IgnoreCollision, V6 kuralları).
// "Blok" (Ctrl / sol tık / telefonda Blok) önüne toprak koyar: kural karosu
// komşularına göre kendi kenarını seçer, komşuları da güncellenir.
public class Hiker : MonoBehaviour
{
    public HillGame game;
    public Tilemap ground;
    public Tilemap platforms;
    public int blocks = 3;

    private CharacterController2D controller;
    private Collider2D body;
    private Vector3 respawn;
    private float dropUntil;

    void Start()
    {
        controller = GetComponent<CharacterController2D>();
        body = GetComponent<Collider2D>();
        respawn = transform.position;
    }

    void Update()
    {
        if (!game.playing) return;
        if (Input.GetAxisRaw("Vertical") < -0.6f && controller.isGrounded && Time.time >= dropUntil) Drop();
        if (Input.GetButtonDown("Fire1")) PlaceBlock();
        if (transform.position.y < -9f) Fall();
    }

    void Drop()
    {
        dropUntil = Time.time + 0.5f;
        Physics2D.IgnoreCollision(body, platforms, true);
        Timer.After(0.3f, () => Physics2D.IgnoreCollision(body, platforms, false));
    }

    void PlaceBlock()
    {
        if (blocks <= 0) return;
        Vector3 cell = ground.WorldToCell(transform.position + new Vector3(controller.facing * 1f, -0.2f, 0f));
        int x = (int)cell.x;
        int y = (int)cell.y;
        if (ground.HasTile(x, y)) return;
        ground.SetTile(x, y, "Toprak");
        blocks--;
        game.BlockPlaced(blocks);
    }

    void OnJump()
    {
        Audio.Play("jump", 0.35f);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin")) game.CollectCoin(other.gameObject);
        else if (other.CompareTag("Water")) Fall();
        else if (other.CompareTag("Respawn")) respawn = other.transform.position + new Vector3(0f, 0.6f, 0f);
        else if (other.CompareTag("Finish")) game.ReachFlag();
    }

    void Fall()
    {
        Input.Vibrate(120, 0.5f);
        Audio.Play("hit", 0.5f);
        controller.Stop();
        transform.position = respawn;
        game.Splash();
    }

    public void Freeze()
    {
        controller.Stop();
        controller.enabled = false;
    }
}`);

    const gameScript = scriptAsset("HillGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Coin, süre ve bayrak. Zemin kural karolarıyla boyandı (Tilemap → karo türü: Kural karosu),
// sular animasyonlu karo, köprüler tek yönlü platform.
public class HillGame : MonoBehaviour
{
    public Hiker hiker;
    public Text coinText;
    public Text timeText;
    public Text blockText;
    public GameObject winPanel;
    public Text winText;
    public int totalCoins = 9;
    public bool playing = true;

    public int coins;
    public int falls;
    private float elapsed;

    void Start()
    {
        UpdateTexts();
        HUD.Show("Bayrağa ulaş!", 1.5f);
    }

    void Update()
    {
        if (!playing)
        {
            if (Input.GetKeyDown(KeyCode.R)) Restart();
            return;
        }
        elapsed += Time.deltaTime;
        timeText.text = "Süre: " + elapsed.ToString("F1");
    }

    public void CollectCoin(GameObject coin)
    {
        coins++;
        Destroy(coin);
        Audio.Play("coin");
        UpdateTexts();
    }

    public void BlockPlaced(int left)
    {
        blockText.text = "Blok: " + left;
        Audio.Play("click", 0.5f);
    }

    public void Splash()
    {
        falls++;
        Camera.Shake(0.2f, 0.2f);
    }

    public void ReachFlag()
    {
        if (!playing) return;
        playing = false;
        hiker.Freeze();
        float best = PlayerPrefs.GetFloat("hill.best", 0f);
        if (best <= 0f || elapsed < best) best = elapsed;
        PlayerPrefs.SetFloat("hill.best", best);
        winText.text = "Süre: " + elapsed.ToString("F1") + " sn   •   Coin: " + coins + "/" + totalCoins + "\\nRekor: " + best.ToString("F1") + " sn";
        winPanel.SetActive(true);
        Audio.Play("win");
    }

    public void Restart()
    {
        SceneManager.ReloadScene();
    }

    void UpdateTexts()
    {
        coinText.text = "Coin: " + coins + "/" + totalCoins;
    }
}`);
    project.scripts = [hikerScript, gameScript];

    const scene = createEmptyScene("Tepeler", "2d");
    scene.settings.background = { mode: "solid", color: "#93c5fd", topColor: "#93c5fd" };
    const textured = { textureId: atlas.id, columns: 8, rows: 3 };
    const ground = entity("Ground", [tilemap(HILL_GROUND, HILL_GROUND_FILLS, { atlas: textured, friction: 0.2 })], { tag: "Ground" });
    const platforms = entity("Platforms", [tilemap(HILL_PLATFORMS, HILL_PLATFORM_FILLS, { atlas: textured, sortingLayer: 1, friction: 0.2 })], { tag: "Ground" });
    const water = entity("Water", [tilemap(HILL_WATER, HILL_WATER_FILLS, { atlas: textured, sortingLayer: 2, isTrigger: true })], { tag: "Water" });
    const manager = entity("GameManager", []);
    const hiker = entity("Player", [
        sprite("#f97316", "roundedSquare", 5),
        createRigidBody({ freezeRotation: true, linearDamping: 0, gravityScale: 1 }),
        createCollider({ shape: "box", size: { x: 0.8, y: 0.9, z: 1 } }),
        createCharacterController2D({ moveSpeed: 6.5, jumpHeight: 3.6, maxJumps: 1, coyoteTime: 0.1, jumpBuffer: 0.12 }),
        script(hikerScript, { game: ref(manager), ground: ref(ground), platforms: ref(platforms), blocks: 3 }),
    ], { position: { x: -13, y: -0.5 }, tag: "Player" });
    const camera = camera2d(5.4, -9, 1);
    camera.components.push(createCameraFollow({
        targetId: hiker.id,
        offset: { x: 0, y: 1.2, z: 0 },
        smoothTime: 0.2,
        deadZone: { x: 1.2, y: 1 },
        lookAhead: 1.2,
        useBounds: true,
        boundsMin: { x: -17, y: -6 },
        boundsMax: { x: 32, y: 14 },
    }, "2d"));

    const coins = HILL_COINS.map(([x, y], index) => entity(`Coin ${index + 1}`, [
        sprite("#facc15", "circle", 3),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        createAnimation({ clips: [animationPreset("bob", "2d")] }),
    ], { position: { x, y }, scale: { x: 0.5, y: 0.5 }, tag: "Coin" }));
    const checkpoint = entity("Checkpoint", [
        sprite("#22c55e", "triangle", 2),
        createCollider({ shape: "box", isTrigger: true }),
    ], { position: { x: 5.5, y: 0.6 }, scale: { x: 0.5, y: 1.2 }, tag: "Respawn" });
    const flag: GameEntity = entity("Flag", [
        sprite("#ef4444", "triangle", 2),
        createCollider({ shape: "box", isTrigger: true }),
    ], { position: { x: 29.5, y: 9.8 }, rotation: { x: 0, y: 0, z: -90 }, scale: { x: 0.9, y: 1.4 }, tag: "Finish" });

    const coinText = entity("CoinText", [uiText("Coin: 0/9", { anchor: "top-left", fontSize: 26, color: "#713f12" })]);
    const timeText = entity("TimeText", [uiText("Süre: 0.0", { anchor: "top", fontSize: 22, offset: { x: 0, y: 16 }, color: "#1e3a8a" })]);
    const blockText = entity("BlockText", [uiText("Blok: 3", { anchor: "top-right", fontSize: 20, offset: { x: 16, y: 16 }, color: "#713f12" })]);
    const hint = entity("HintText", [uiText("← → / joystick: koş  •  Space / A: zıpla  •  ↓: köprüden in  •  Ctrl / Blok: toprak koy", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 14 }, bold: false, color: "#1e3a8a" })]);
    const win = gameOverPanel(manager, "Bayrağa ulaştın!", "Yeniden (R)", "#16a34a");
    win.panel.name = "WinPanel";
    win.result.name = "WinText";

    manager.components.push(script(gameScript, {
        hiker: ref(hiker),
        coinText: ref(coinText),
        timeText: ref(timeText),
        blockText: ref(blockText),
        winPanel: ref(win.panel),
        winText: ref(win.result),
        totalCoins: HILL_COINS.length,
    }));
    scene.objects.push(camera, water, ground, platforms, checkpoint, flag, ...coins, hiker, manager, coinText, timeText, blockText, hint, ...win.entities);
    return finishProject(project, scene, "hill-run-2d");
}
