/**
 * Ready-to-play starter projects. Every template is a complete, working game
 * with scripts written like Unity scripts so they double as tutorials.
 */
import {
    createAudioSource,
    createCamera,
    createCollider,
    createLight,
    createMeshRenderer,
    createParticleSystem,
    createRigidBody,
    createScriptComponent,
    createSpriteRenderer,
    createTransform,
    createUIText,
} from "./components";
import { createEngineId, nowIso } from "./ids";
import { createBlankProject, createDefaultScene, createEmptyScene } from "./scene";
import type {
    GameComponent,
    GameDimension,
    GameEntity,
    GameProjectDocument,
    PrefabAsset,
    ScriptAsset,
    ScriptFieldValue,
    SceneDocument,
    SpriteShape,
    Vector3,
} from "./types";

export type TemplateId = "platformer-2d" | "rollaball-3d" | "space-shooter-2d" | "breakout-2d" | "empty-2d" | "empty-3d";

export interface TemplateInfo {
    id: TemplateId;
    dimension: GameDimension;
    name: { tr: string; en: string };
    description: { tr: string; en: string };
    languages: Array<"C#" | "C++">;
    gradient: [string, string];
    emoji: string;
    difficulty: "starter" | "easy" | "medium";
}

export const PROJECT_TEMPLATES: TemplateInfo[] = [
    {
        id: "platformer-2d",
        dimension: "2d",
        name: { tr: "2D Platform Oyunu", en: "2D Platformer" },
        description: { tr: "Çift zıplama, düşman ezme, coin toplama, kamera takibi ve bitiş bayrağı.", en: "Double jump, enemy stomping, coins, camera follow and a goal flag." },
        languages: ["C#"],
        gradient: ["#f59e0b", "#ef4444"],
        emoji: "🏃",
        difficulty: "easy",
    },
    {
        id: "rollaball-3d",
        dimension: "3d",
        name: { tr: "3D Top Yuvarlama", en: "3D Roll-a-Ball" },
        description: { tr: "Unity'nin klasik ilk dersi: kuvvetle topu yuvarla, dönen küpleri topla.", en: "Unity's classic first tutorial: roll the ball with forces and collect spinning cubes." },
        languages: ["C#"],
        gradient: ["#6366f1", "#06b6d4"],
        emoji: "🎱",
        difficulty: "starter",
    },
    {
        id: "space-shooter-2d",
        dimension: "2d",
        name: { tr: "Uzay Nişancısı", en: "Space Shooter" },
        description: { tr: "C++ ve C# birlikte: ateş et, düşman dalgalarını patlat, yıldız alanında hayatta kal.", en: "C++ and C# together: shoot, blow up enemy waves and survive in a starfield." },
        languages: ["C++", "C#"],
        gradient: ["#8b5cf6", "#ec4899"],
        emoji: "🚀",
        difficulty: "medium",
    },
    {
        id: "breakout-2d",
        dimension: "2d",
        name: { tr: "Tuğla Kırma", en: "Breakout" },
        description: { tr: "Raket, sekme fiziği, prefab ile oluşturulan tuğla ızgarası, can ve skor sistemi.", en: "Paddle, bounce physics, a prefab-built brick grid, lives and score." },
        languages: ["C#"],
        gradient: ["#22c55e", "#0ea5e9"],
        emoji: "🧱",
        difficulty: "easy",
    },
    {
        id: "empty-3d",
        dimension: "3d",
        name: { tr: "Boş 3D Proje", en: "Empty 3D Project" },
        description: { tr: "Kamera, ışık ve zemin ile temiz bir başlangıç.", en: "A clean start with a camera, a light and a ground plane." },
        languages: ["C#", "C++"],
        gradient: ["#334155", "#64748b"],
        emoji: "🧊",
        difficulty: "starter",
    },
    {
        id: "empty-2d",
        dimension: "2d",
        name: { tr: "Boş 2D Proje", en: "Empty 2D Project" },
        description: { tr: "Ortografik kameralı boş bir 2D sahne.", en: "An empty 2D scene with an orthographic camera." },
        languages: ["C#", "C++"],
        gradient: ["#475569", "#94a3b8"],
        emoji: "🟦",
        difficulty: "starter",
    },
];

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

interface EntityOptions {
    position?: Partial<Vector3>;
    rotation?: Partial<Vector3>;
    scale?: Partial<Vector3>;
    tag?: string;
    parentId?: string | null;
    active?: boolean;
}

function entity(name: string, components: GameComponent[], options: EntityOptions = {}): GameEntity {
    return {
        id: createEngineId("entity"),
        name,
        tag: options.tag ?? "Untagged",
        parentId: options.parentId ?? null,
        active: options.active ?? true,
        components: [
            createTransform({
                position: { x: 0, y: 0, z: 0, ...options.position },
                rotation: { x: 0, y: 0, z: 0, ...options.rotation },
                scale: { x: 1, y: 1, z: 1, ...options.scale },
            }),
            ...components,
        ],
    };
}

function sprite(color: string, shape: SpriteShape = "square", sortingLayer = 0) {
    return createSpriteRenderer({ color, shape, sortingLayer });
}

function script(asset: ScriptAsset, fields: Record<string, ScriptFieldValue> = {}, className?: string) {
    return createScriptComponent(asset.id, className ?? asset.name.replace(/\.(cs|cpp)$/, ""), { fields });
}

function scriptAsset(name: string, content: string): ScriptAsset {
    return { id: createEngineId("script"), name, language: name.endsWith(".cpp") ? "cpp" : "csharp", content: content.trim() + "\n" };
}

function ref(target: GameEntity): ScriptFieldValue {
    return { ref: "entity", id: target.id };
}

function prefabRef(target: PrefabAsset): ScriptFieldValue {
    return { ref: "prefab", id: target.id };
}

function prefab(name: string, root: GameEntity, children: GameEntity[] = []): PrefabAsset {
    root.parentId = null;
    for (const child of children) child.parentId = root.id;
    return { id: createEngineId("prefab"), name, entities: [root, ...children] };
}

function uiText(text: string, anchor: Parameters<typeof createUIText>[0] = {}) {
    return createUIText({ text, ...anchor });
}

function burst(colors: [string, string], count: number, speed: number, size: number, gravity = 0) {
    return createParticleSystem({
        playOnStart: true,
        loop: false,
        duration: 0.2,
        emissionRate: 0,
        burstCount: count,
        maxParticles: Math.max(count, 40),
        lifetime: 0.6,
        startSpeed: speed,
        spread: 180,
        startSize: size,
        endSize: 0.02,
        startColor: colors[0],
        endColor: colors[1],
        gravityModifier: gravity,
        worldSpace: true,
    });
}

function finishProject(project: GameProjectDocument, scene: SceneDocument, templateId: TemplateId) {
    scene.metadata.templateId = templateId;
    project.scenes = [scene];
    project.activeSceneId = scene.id;
    project.settings.startSceneId = scene.id;
    project.metadata.updatedAt = nowIso();
    return project;
}

// ---------------------------------------------------------------------------
// Shared scripts
// ---------------------------------------------------------------------------

const AUTO_DESTROY = `
using UnityEngine;

// Belirli bir süre sonra nesneyi yok eder (patlama efektleri için).
public class AutoDestroy : MonoBehaviour
{
    public float lifetime = 1.5f;

    void Start()
    {
        Destroy(gameObject, lifetime);
    }
}`;

// ---------------------------------------------------------------------------
// 2D Platformer
// ---------------------------------------------------------------------------

function platformer(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Level 1", "2d");
    scene.settings.background = { mode: "gradient", color: "#0f172a", topColor: "#1d4ed8" };

    const playerScript = scriptAsset("PlayerController.cs", `
using UnityEngine;
using UnityEngine.SceneManagement;

// Sağ/sol ok (veya A/D) ile koş, Space/W/Yukarı ile zıpla. Havada bir kez daha zıplayabilirsin.
public class PlayerController : MonoBehaviour
{
    [Header("Hareket")]
    public float moveSpeed = 6.5f;
    public float jumpForce = 11f;
    [Range(1, 3)]
    public int maxJumps = 2;

    private Rigidbody2D rb;
    private SpriteRenderer sprite;
    private bool grounded;
    private int jumpsLeft;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        sprite = GetComponent<SpriteRenderer>();
        jumpsLeft = maxJumps;
    }

    void Update()
    {
        float h = Input.GetAxisRaw("Horizontal");
        rb.velocity = new Vector2(h * moveSpeed, rb.velocity.y);
        if (h != 0) sprite.flipX = h < 0;

        bool jumpPressed = Input.GetButtonDown("Jump") || Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W);
        if (jumpPressed && (grounded || jumpsLeft > 0))
        {
            rb.velocity = new Vector2(rb.velocity.x, jumpForce);
            jumpsLeft--;
            grounded = false;
            Audio.Play("jump", 0.5f);
        }

        if (transform.position.y < -12f) Die();
    }

    void OnCollisionStay2D(Collision2D collision)
    {
        // Zemin normali yukarı bakıyorsa yerdeyiz.
        if (collision.GetContact(0).normal.y > 0.5f)
        {
            grounded = true;
            jumpsLeft = maxJumps;
        }
    }

    void OnCollisionExit2D(Collision2D collision)
    {
        grounded = false;
    }

    public void Bounce()
    {
        rb.velocity = new Vector2(rb.velocity.x, jumpForce * 0.8f);
        jumpsLeft = maxJumps - 1;
    }

    public void Die()
    {
        Audio.Play("lose");
        SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }
}`);

    const cameraScript = scriptAsset("CameraFollow.cs", `
using UnityEngine;

// Kamera oyuncuyu yumuşakça takip eder (LateUpdate, oyuncu hareket ettikten sonra çalışır).
public class CameraFollow : MonoBehaviour
{
    public Transform target;
    public float smoothSpeed = 5f;
    public Vector2 offset = new Vector2(2f, 1.5f);
    public float minY = -1f;

    void LateUpdate()
    {
        if (target == null) return;
        Vector3 desired = new Vector3(target.position.x + offset.x, Mathf.Max(minY, target.position.y + offset.y), transform.position.z);
        transform.position = Vector3.Lerp(transform.position, desired, smoothSpeed * Time.deltaTime);
    }
}`);

    const managerScript = scriptAsset("GameManager.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Skoru tutar ve arayüzü günceller. Diğer script'ler GameManager.Instance ile ulaşır.
public class GameManager : MonoBehaviour
{
    public static GameManager Instance;
    public Text scoreText;
    private int score;
    private bool finished;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        UpdateUI();
        HUD.Show("Coinleri topla ve bayrağa ulaş!", 2.5f);
    }

    public void AddScore(int amount)
    {
        score += amount;
        UpdateUI();
    }

    public void Win()
    {
        if (finished) return;
        finished = true;
        HUD.Show("Tebrikler! Seviye tamamlandı\\nCoin: " + score, 3f, Color.yellow);
        Audio.Play("win");
        Invoke("Restart", 3f);
    }

    void UpdateUI()
    {
        if (scoreText != null) scoreText.text = "Coin: " + score;
    }

    void Restart()
    {
        SceneManager.LoadScene(0);
    }
}`);

    const coinScript = scriptAsset("Coin.cs", `
using UnityEngine;

public class Coin : MonoBehaviour
{
    public int value = 1;
    public float spinSpeed = 180f;
    public GameObject pickupEffect;

    void Update()
    {
        transform.Rotate(0, spinSpeed * Time.deltaTime, 0);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (!other.CompareTag("Player")) return;
        GameManager.Instance.AddScore(value);
        if (pickupEffect != null) Instantiate(pickupEffect, transform.position, Quaternion.identity);
        Audio.Play("coin");
        Destroy(gameObject);
    }
}`);

    const enemyScript = scriptAsset("Enemy.cs", `
using UnityEngine;

// İki nokta arasında devriye gezer. Üstüne zıplarsan ezilir, yandan dokunursan kaybedersin.
public class Enemy : MonoBehaviour
{
    public float speed = 2f;
    public float patrolDistance = 2.5f;
    private Vector3 start;
    private int direction = 1;

    void Start()
    {
        start = transform.position;
    }

    void Update()
    {
        transform.position += Vector3.right * direction * speed * Time.deltaTime;
        if (transform.position.x > start.x + patrolDistance) direction = -1;
        else if (transform.position.x < start.x - patrolDistance) direction = 1;
    }

    void OnCollisionEnter2D(Collision2D collision)
    {
        if (!collision.gameObject.CompareTag("Player")) return;
        PlayerController player = collision.gameObject.GetComponent<PlayerController>();
        if (collision.GetContact(0).normal.y < -0.5f)
        {
            player.Bounce();
            Audio.Play("hit");
            Destroy(gameObject);
        }
        else
        {
            player.Die();
        }
    }
}`);

    const goalScript = scriptAsset("Goal.cs", `
using UnityEngine;

public class Goal : MonoBehaviour
{
    void Update()
    {
        transform.Rotate(0, 0, 90 * Time.deltaTime);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Player")) GameManager.Instance.Win();
    }
}`);

    const autoDestroy = scriptAsset("AutoDestroy.cs", AUTO_DESTROY);
    project.scripts = [playerScript, cameraScript, managerScript, coinScript, enemyScript, goalScript, autoDestroy];

    const burstEntity = entity("CoinBurst", [burst(["#fde047", "#f97316"], 18, 4, 0.18, 1.2), script(autoDestroy, { lifetime: 1 })]);
    const coinBurst = prefab("CoinBurst", burstEntity);
    project.prefabs = [coinBurst];

    const camera = entity("Main Camera", [createCamera({ projection: "orthographic", orthographicSize: 6, primary: true })], { position: { x: -6, y: 0, z: -10 }, tag: "MainCamera" });
    const player = entity("Player", [
        sprite("#f59e0b", "roundedSquare", 5),
        createRigidBody({ freezeRotation: true, freezePosition: { x: false, y: false, z: true }, linearDamping: 0 }),
        createCollider({ shape: "box", friction: 0 }),
        script(playerScript),
    ], { position: { x: -8, y: -2 }, scale: { x: 0.9, y: 0.9 }, tag: "Player" });
    camera.components.push(script(cameraScript, { target: ref(player) }));

    const ground = (x: number, width: number, y = -4, color = "#3f3f46") => entity("Ground", [sprite(color, "square"), createCollider({ shape: "box" })], { position: { x, y }, scale: { x: width, y: 1 }, tag: "Ground" });
    const platform = (x: number, y: number, width: number) => entity("Platform", [sprite("#22c55e", "roundedSquare"), createCollider({ shape: "box" })], { position: { x, y }, scale: { x: width, y: 0.5 }, tag: "Ground" });
    const coin = (x: number, y: number) => entity("Coin", [sprite("#facc15", "circle", 2), createCollider({ shape: "circle", radius: 0.5, isTrigger: true }), script(coinScript, { pickupEffect: prefabRef(coinBurst) })], { position: { x, y }, scale: { x: 0.5, y: 0.5 } });
    const enemy = (x: number) => entity("Enemy", [sprite("#ef4444", "roundedSquare", 3), createCollider({ shape: "box" }), script(enemyScript)], { position: { x, y: -3.1 }, scale: { x: 0.8, y: 0.8 }, tag: "Enemy" });
    const mountain = (x: number, width: number, height: number, color: string) => entity("Mountain", [sprite(color, "triangle", -20)], { position: { x, y: -3.5 + height / 2 }, scale: { x: width, y: height } });

    const scoreText = entity("ScoreText", [uiText("Coin: 0", { anchor: "top-left", fontSize: 30 })]);
    const hintText = entity("HintText", [uiText("← → koş  •  Space zıpla (2x)", { anchor: "bottom", fontSize: 18, offset: { x: 0, y: 18 }, color: "#cbd5e1", bold: false })]);
    const manager = entity("GameManager", [script(managerScript, { scoreText: ref(scoreText) })]);
    const goal = entity("Goal", [sprite("#a855f7", "star", 4), createCollider({ shape: "circle", radius: 0.5, isTrigger: true }), script(goalScript)], { position: { x: 32, y: -2.4 }, scale: { x: 1.4, y: 1.4 } });

    scene.objects.push(
        camera,
        mountain(-4, 14, 7, "#1e3a8a"), mountain(12, 18, 9, "#1e40af"), mountain(28, 16, 6, "#1e3a8a"),
        ground(0, 20), ground(16, 8), ground(28, 12),
        platform(4, -1, 4), platform(9, 1.5, 3), platform(14, 0, 4), platform(24, -1.5, 3),
        coin(-4, -2.5), coin(-2, -2.5), coin(4, 0), coin(9, 2.6), coin(14, 1.1), coin(16, -2.5), coin(24, -0.4), coin(28, -2.5),
        enemy(1), enemy(27),
        player, goal, manager, scoreText, hintText,
    );
    return finishProject(project, scene, "platformer-2d");
}

// ---------------------------------------------------------------------------
// 3D Roll-a-Ball
// ---------------------------------------------------------------------------

function rollABall(name: string): GameProjectDocument {
    const project = createBlankProject(name, "3d");
    const scene = createEmptyScene("MiniGame", "3d");
    scene.settings.background = { mode: "gradient", color: "#e2e8f0", topColor: "#3b82f6" };
    scene.settings.fog = { enabled: true, color: "#cbd5e1", near: 30, far: 90 };

    const playerScript = scriptAsset("PlayerController.cs", `
using UnityEngine;
using UnityEngine.UI;

// Ok tuşları / WASD ile topa kuvvet uygula. Tüm sarı küpleri topla!
public class PlayerController : MonoBehaviour
{
    public float speed = 14f;
    public Text countText;
    public Text winText;

    private Rigidbody rb;
    private int count;
    private int total;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
        total = GameObject.FindGameObjectsWithTag("PickUp").Length;
        SetCountText();
        winText.text = "";
    }

    void FixedUpdate()
    {
        Vector3 movement = new Vector3(Input.GetAxis("Horizontal"), 0f, Input.GetAxis("Vertical"));
        rb.AddForce(movement * speed);
    }

    void Update()
    {
        // Platformdan düşersen başa dön.
        if (transform.position.y < -5f)
        {
            transform.position = new Vector3(0, 1, 0);
            rb.velocity = Vector3.zero;
        }
    }

    void OnTriggerEnter(Collider other)
    {
        if (other.gameObject.CompareTag("PickUp"))
        {
            other.gameObject.SetActive(false);
            count++;
            Audio.Play("coin");
            SetCountText();
        }
    }

    void SetCountText()
    {
        countText.text = "Toplanan: " + count + " / " + total;
        if (count >= total)
        {
            winText.text = "Kazandın! 🎉";
            Audio.Play("win");
        }
    }
}`);

    const rotator = scriptAsset("Rotator.cs", `
using UnityEngine;

public class Rotator : MonoBehaviour
{
    public Vector3 speed = new Vector3(15, 30, 45);

    void Update()
    {
        transform.Rotate(speed * Time.deltaTime);
    }
}`);

    const cameraScript = scriptAsset("CameraController.cs", `
using UnityEngine;

// Kamera ile oyuncu arasındaki mesafeyi korur.
public class CameraController : MonoBehaviour
{
    public GameObject player;
    private Vector3 offset;

    void Start()
    {
        offset = transform.position - player.transform.position;
    }

    void LateUpdate()
    {
        transform.position = player.transform.position + offset;
    }
}`);
    project.scripts = [playerScript, rotator, cameraScript];

    const camera = entity("Main Camera", [createCamera({ fieldOfView: 60, primary: true })], { position: { y: 10, z: -10 }, rotation: { x: 45 }, tag: "MainCamera" });
    const light = entity("Directional Light", [createLight({ lightType: "directional", intensity: 1.3 })], { position: { y: 8 }, rotation: { x: 50, y: -30 } });
    const ground = entity("Ground", [
        createMeshRenderer({ mesh: "plane", material: { color: "#475569", roughness: 0.9 } }),
        createCollider({ shape: "box", size: { x: 1, y: 0.2, z: 1 }, offset: { x: 0, y: -0.1, z: 0 } }),
    ], { scale: { x: 20, y: 1, z: 20 }, tag: "Ground" });
    const wall = (name: string, x: number, z: number, sx: number, sz: number) => entity(name, [
        createMeshRenderer({ mesh: "cube", material: { color: "#94a3b8", roughness: 0.7 } }),
        createCollider({ shape: "box" }),
    ], { position: { x, y: 0.5, z }, scale: { x: sx, y: 1, z: sz } });
    const player = entity("Player", [
        createMeshRenderer({ mesh: "sphere", material: { color: "#f8fafc", metallic: 0.25, roughness: 0.35 } }),
        createRigidBody({ mass: 1, linearDamping: 0.45, freezeRotation: false }),
        createCollider({ shape: "sphere", radius: 0.5, friction: 0 }),
        script(playerScript),
    ], { position: { y: 0.5 }, tag: "Player" });
    camera.components.push(script(cameraScript, { player: ref(player) }));
    const countText = entity("CountText", [uiText("Toplanan: 0", { anchor: "top-left", fontSize: 30 })]);
    const winText = entity("WinText", [uiText("", { anchor: "center", fontSize: 56, color: "#facc15", offset: { x: 0, y: 0 } })]);
    player.components = player.components.map((component) => component.type === "script" ? { ...component, fields: { countText: ref(countText), winText: ref(winText) } } : component);
    const pickups: GameEntity[] = [];
    for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        pickups.push(entity(`PickUp ${index + 1}`, [
            createMeshRenderer({ mesh: "cube", material: { color: "#facc15", emissive: "#f59e0b", emissiveIntensity: 0.35, metallic: 0.3, roughness: 0.4 } }),
            createCollider({ shape: "box", isTrigger: true }),
            script(rotator),
        ], { position: { x: Math.round(Math.cos(angle) * 6 * 100) / 100, y: 0.5, z: Math.round(Math.sin(angle) * 6 * 100) / 100 }, rotation: { x: 45, y: 45, z: 45 }, scale: { x: 0.5, y: 0.5, z: 0.5 }, tag: "PickUp" }));
    }
    const hint = entity("HintText", [uiText("WASD / ok tuşları ile topu yuvarla", { anchor: "bottom", fontSize: 18, offset: { x: 0, y: 18 }, color: "#1e293b", bold: false, shadow: false })]);
    scene.objects.push(camera, light, ground, wall("North Wall", 0, 10, 20.5, 0.5), wall("South Wall", 0, -10, 20.5, 0.5), wall("East Wall", 10, 0, 0.5, 20.5), wall("West Wall", -10, 0, 0.5, 20.5), player, ...pickups, countText, winText, hint);
    return finishProject(project, scene, "rollaball-3d");
}

// ---------------------------------------------------------------------------
// Space shooter (C++ + C#)
// ---------------------------------------------------------------------------

function spaceShooter(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Space", "2d");
    scene.settings.background = { mode: "gradient", color: "#020617", topColor: "#1e1b4b" };

    const shipScript = scriptAsset("Ship.cpp", `
#include <hanogt.h>

// Oyuncu gemisi (C++). Ok tuşlarıyla hareket, Space ile ateş.
class Ship : public MonoBehaviour {
public:
    float speed = 8.0f;
    float fireRate = 0.18f;
    GameObject* bulletPrefab = nullptr;

private:
    float nextFire = 0.0f;

public:
    void Update() {
        if (GameController::Instance->IsGameOver()) return;
        float h = Input::GetAxisRaw("Horizontal");
        float v = Input::GetAxisRaw("Vertical");
        Vector3 pos = transform->position;
        pos.x = Mathf::Clamp(pos.x + h * speed * Time::deltaTime, -8.5f, 8.5f);
        pos.y = Mathf::Clamp(pos.y + v * speed * Time::deltaTime, -5.0f, 3.0f);
        transform->position = pos;

        if ((Input::GetKey(KeyCode::Space) || Input::GetMouseButton(0)) && Time::time > nextFire) {
            nextFire = Time::time + fireRate;
            Instantiate(bulletPrefab, transform->position + Vector3(0.0f, 0.7f, 0.0f), Quaternion::identity);
            Audio::Play("laser", 0.35f);
        }
    }

    void OnTriggerEnter2D(Collider2D* other) {
        if (other->CompareTag("Enemy")) {
            GameController::Instance->Explode(transform->position);
            GameController::Instance->GameOver();
            gameObject->SetActive(false);
        }
    }
};`);

    const spawnerScript = scriptAsset("Spawner.cpp", `
#include <hanogt.h>

// Belirli aralıklarla ekranın üstünden düşman üretir (C++).
class Spawner : public MonoBehaviour {
public:
    GameObject* enemyPrefab = nullptr;
    float interval = 0.8f;
    float range = 8.0f;

    void Start() {
        InvokeRepeating("Spawn", 1.0f, interval);
    }

    void Spawn() {
        if (GameController::Instance->IsGameOver()) return;
        float x = Random::Range(-range, range);
        Instantiate(enemyPrefab, Vector3(x, 7.0f, 0.0f), Quaternion::identity);
    }
};`);

    const enemyScript = scriptAsset("Enemy.cpp", `
#include <hanogt.h>

class Enemy : public MonoBehaviour {
public:
    float speed = 3.0f;
    int points = 10;

    void Start() {
        speed = speed * Random::Range(0.8f, 1.7f);
    }

    void Update() {
        transform->Translate(0.0f, -speed * Time::deltaTime, 0.0f, Space::World);
        transform->Rotate(0.0f, 0.0f, 120.0f * Time::deltaTime);
        if (transform->position.y < -7.0f) {
            Destroy(gameObject);
        }
    }
};`);

    const bulletScript = scriptAsset("Bullet.cs", `
using UnityEngine;

public class Bullet : MonoBehaviour
{
    public float speed = 16f;

    void Start()
    {
        Destroy(gameObject, 1.2f);
    }

    void Update()
    {
        transform.Translate(Vector3.up * speed * Time.deltaTime, Space.World);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (!other.CompareTag("Enemy")) return;
        Enemy enemy = other.GetComponent<Enemy>();
        GameController.Instance.AddScore(enemy != null ? enemy.points : 10);
        GameController.Instance.Explode(other.transform.position);
        Destroy(other.gameObject);
        Destroy(gameObject);
    }
}`);

    const controllerScript = scriptAsset("GameController.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

public class GameController : MonoBehaviour
{
    public static GameController Instance;
    public Text scoreText;
    public GameObject explosionPrefab;

    private int score;
    private bool gameOver;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        UpdateScore();
        HUD.Show("Ok tuşları: hareket  •  Space: ateş", 2.5f);
    }

    public void AddScore(int value)
    {
        if (gameOver) return;
        score += value;
        UpdateScore();
    }

    public void Explode(Vector3 position)
    {
        if (explosionPrefab != null) Instantiate(explosionPrefab, position, Quaternion.identity);
        Audio.Play("explosion", 0.45f);
    }

    public bool IsGameOver()
    {
        return gameOver;
    }

    public void GameOver()
    {
        if (gameOver) return;
        gameOver = true;
        int best = Mathf.Max(score, PlayerPrefs.GetInt("best", 0));
        PlayerPrefs.SetInt("best", best);
        HUD.Show("Oyun Bitti!\\nSkor: " + score + "  •  En iyi: " + best, 3f, Color.red);
        Audio.Play("lose");
        Invoke("Restart", 3f);
    }

    void UpdateScore()
    {
        scoreText.text = "Skor: " + score;
    }

    void Restart()
    {
        SceneManager.LoadScene(0);
    }
}`);

    const starfieldScript = scriptAsset("Starfield.cs", `
using UnityEngine;
using System.Collections.Generic;

// Çalışma sırasında kod ile yıldızlar oluşturur ve aşağı kaydırır.
public class Starfield : MonoBehaviour
{
    public int count = 70;
    public float speed = 2f;
    private List<Transform> stars = new List<Transform>();

    void Start()
    {
        for (int i = 0; i < count; i++)
        {
            GameObject star = new GameObject("Star");
            SpriteRenderer sr = star.AddComponent<SpriteRenderer>();
            sr.shape = "circle";
            float b = Random.Range(0.35f, 1f);
            sr.color = new Color(b, b, 1f, b);
            sr.sortingOrder = -20;
            float s = Random.Range(0.04f, 0.12f);
            star.transform.localScale = new Vector3(s, s, 1);
            star.transform.position = new Vector3(Random.Range(-10f, 10f), Random.Range(-6.5f, 6.5f), 0);
            star.transform.SetParent(transform);
            stars.Add(star.transform);
        }
    }

    void Update()
    {
        foreach (Transform star in stars)
        {
            Vector3 p = star.position;
            p.y -= speed * Time.deltaTime * star.localScale.x * 10f;
            if (p.y < -6.5f) p.y = 6.5f;
            star.position = p;
        }
    }
}`);
    const autoDestroy = scriptAsset("AutoDestroy.cs", AUTO_DESTROY);
    project.scripts = [shipScript, spawnerScript, enemyScript, bulletScript, controllerScript, starfieldScript, autoDestroy];

    const explosion = prefab("Explosion", entity("Explosion", [burst(["#fde047", "#ef4444"], 28, 5, 0.25), script(autoDestroy, { lifetime: 1 })]));
    const bullet = prefab("Bullet", entity("Bullet", [
        sprite("#67e8f9", "roundedSquare", 3),
        createRigidBody({ bodyType: "kinematic", useGravity: false }),
        createCollider({ shape: "box", isTrigger: true }),
        script(bulletScript),
    ], { scale: { x: 0.12, y: 0.45 }, tag: "Bullet" }));
    const enemy = prefab("Enemy", entity("Enemy", [
        sprite("#f43f5e", "diamond", 2),
        createCollider({ shape: "box", size: { x: 0.8, y: 0.8, z: 1 }, isTrigger: true }),
        script(enemyScript),
    ], { scale: { x: 0.9, y: 0.9 }, tag: "Enemy" }));
    project.prefabs = [bullet, enemy, explosion];

    const camera = entity("Main Camera", [createCamera({ projection: "orthographic", orthographicSize: 6, primary: true })], { position: { z: -10 }, tag: "MainCamera" });
    const ship = entity("Ship", [
        sprite("#22d3ee", "triangle", 5),
        createRigidBody({ bodyType: "kinematic", useGravity: false }),
        createCollider({ shape: "box", size: { x: 0.7, y: 0.8, z: 1 }, isTrigger: true }),
        script(shipScript, { bulletPrefab: prefabRef(bullet) }),
    ], { position: { y: -4 }, scale: { x: 0.9, y: 1.1 }, tag: "Player" });
    const flame = entity("Engine Flame", [createParticleSystem({ emissionRate: 60, lifetime: 0.35, startSpeed: 3.5, spread: 12, startSize: 0.22, endSize: 0.02, startColor: "#fde68a", endColor: "#f43f5e", maxParticles: 80 })], { position: { y: -0.55 }, rotation: { x: 90 }, parentId: ship.id });
    const scoreText = entity("ScoreText", [uiText("Skor: 0", { anchor: "top-left", fontSize: 28 })]);
    const controller = entity("GameController", [script(controllerScript, { scoreText: ref(scoreText), explosionPrefab: prefabRef(explosion) })]);
    const spawner = entity("Spawner", [script(spawnerScript, { enemyPrefab: prefabRef(enemy) })]);
    const starfield = entity("Starfield", [script(starfieldScript)]);
    const music = entity("Sound", [createAudioSource({ clip: "powerup", playOnStart: true, volume: 0.4 })]);
    scene.objects.push(camera, starfield, ship, flame, controller, spawner, scoreText, music);
    return finishProject(project, scene, "space-shooter-2d");
}

// ---------------------------------------------------------------------------
// Breakout
// ---------------------------------------------------------------------------

function breakout(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Breakout", "2d");
    scene.settings.background = { mode: "gradient", color: "#020617", topColor: "#0f766e" };

    const paddleScript = scriptAsset("Paddle.cs", `
using UnityEngine;

// Raket fare ile ya da ok tuşlarıyla hareket eder.
public class Paddle : MonoBehaviour
{
    public float speed = 14f;
    public float limit = 7.9f;
    public bool followMouse = true;
    private Vector3 lastMouse;

    void Update()
    {
        float x = transform.position.x + Input.GetAxisRaw("Horizontal") * speed * Time.deltaTime;
        if (followMouse && Input.mousePosition != lastMouse)
        {
            lastMouse = Input.mousePosition;
            x = Camera.main.ScreenToWorldPoint(Input.mousePosition).x;
        }
        transform.position = new Vector3(Mathf.Clamp(x, -limit, limit), transform.position.y, 0);
    }
}`);

    const ballScript = scriptAsset("Ball.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

public class Ball : MonoBehaviour
{
    public float speed = 8.5f;
    public Transform paddle;
    public Text scoreText;
    public Text livesText;
    public int lives = 3;

    private Rigidbody2D rb;
    private bool launched;
    private int score;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        UpdateUI();
        HUD.Show("Space veya tıkla: topu fırlat", 2.5f);
    }

    void Update()
    {
        if (!launched)
        {
            transform.position = paddle.position + new Vector3(0, 0.45f, 0);
            rb.velocity = Vector2.zero;
            if (Input.GetKeyDown(KeyCode.Space) || Input.GetMouseButtonDown(0))
            {
                launched = true;
                rb.velocity = new Vector2(Random.Range(-0.6f, 0.6f), 1f).normalized * speed;
                Audio.Play("blip");
            }
            return;
        }
        if (transform.position.y < -6.5f) LoseLife();
    }

    void FixedUpdate()
    {
        if (!launched) return;
        Vector2 v = rb.velocity;
        // Topun yatay döngüye girmesini engelle ve hızı sabit tut.
        if (Mathf.Abs(v.y) < 1.5f) v.y = v.y < 0 ? -1.5f : 1.5f;
        rb.velocity = v.normalized * speed;
    }

    void OnCollisionEnter2D(Collision2D collision)
    {
        if (collision.gameObject.CompareTag("Paddle"))
        {
            float offset = (transform.position.x - collision.transform.position.x) / collision.transform.localScale.x;
            rb.velocity = new Vector2(offset * 2.5f, 1f).normalized * speed;
            Audio.Play("blip", 0.5f);
        }
        else if (collision.gameObject.CompareTag("Brick"))
        {
            score += 10;
            UpdateUI();
        }
        else
        {
            Audio.Play("click", 0.4f);
        }
    }

    void LoseLife()
    {
        lives--;
        launched = false;
        Audio.Play("lose", 0.6f);
        UpdateUI();
        if (lives <= 0)
        {
            HUD.Show("Oyun Bitti!\\nSkor: " + score, 3f, Color.red);
            Invoke("Restart", 3f);
            enabled = false;
        }
    }

    void UpdateUI()
    {
        scoreText.text = "Skor: " + score;
        livesText.text = "Can: " + lives;
    }

    void Restart()
    {
        SceneManager.LoadScene(0);
    }
}`);

    const brickScript = scriptAsset("Brick.cs", `
using UnityEngine;

public class Brick : MonoBehaviour
{
    public int hits = 1;
    public GameObject breakEffect;

    void OnCollisionEnter2D(Collision2D collision)
    {
        hits--;
        if (hits > 0) return;
        if (breakEffect != null) Instantiate(breakEffect, transform.position, Quaternion.identity);
        Audio.Play("hit", 0.45f);
        BrickGrid.Instance.BrickDestroyed();
        Destroy(gameObject);
    }
}`);

    const gridScript = scriptAsset("BrickGrid.cs", `
using UnityEngine;
using UnityEngine.SceneManagement;

// Tuğla ızgarasını prefab'tan kod ile oluşturur.
public class BrickGrid : MonoBehaviour
{
    public static BrickGrid Instance;
    public GameObject brickPrefab;
    public int rows = 5;
    public int columns = 9;
    private int remaining;
    private Color[] rowColors = new Color[] {
        new Color(0.94f, 0.27f, 0.27f),
        new Color(0.98f, 0.57f, 0.24f),
        new Color(0.98f, 0.8f, 0.08f),
        new Color(0.13f, 0.77f, 0.37f),
        new Color(0.23f, 0.51f, 0.96f)
    };

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        for (int r = 0; r < rows; r++)
        {
            for (int c = 0; c < columns; c++)
            {
                Vector3 position = new Vector3((c - (columns - 1) / 2f) * 1.9f, 4.8f - r * 0.7f, 0);
                GameObject brick = Instantiate(brickPrefab, position, Quaternion.identity);
                brick.GetComponent<SpriteRenderer>().color = rowColors[r % rowColors.Length];
                remaining++;
            }
        }
    }

    public void BrickDestroyed()
    {
        remaining--;
        if (remaining <= 0)
        {
            HUD.Show("Tebrikler! Tüm tuğlalar kırıldı 🎉", 3f, Color.yellow);
            Audio.Play("win");
            Invoke("Restart", 3f);
        }
    }

    void Restart()
    {
        SceneManager.LoadScene(0);
    }
}`);
    const autoDestroy = scriptAsset("AutoDestroy.cs", AUTO_DESTROY);
    project.scripts = [paddleScript, ballScript, brickScript, gridScript, autoDestroy];

    const shards = prefab("BrickShards", entity("BrickShards", [burst(["#e2e8f0", "#64748b"], 14, 3, 0.16, 1), script(autoDestroy, { lifetime: 1 })]));
    const brick = prefab("Brick", entity("Brick", [
        sprite("#f97316", "roundedSquare", 1),
        createCollider({ shape: "box", friction: 0, bounciness: 1 }),
        script(brickScript, { breakEffect: prefabRef(shards) }),
    ], { scale: { x: 1.6, y: 0.5 }, tag: "Brick" }));
    project.prefabs = [brick, shards];

    const camera = entity("Main Camera", [createCamera({ projection: "orthographic", orthographicSize: 6.4, primary: true })], { position: { z: -10 }, tag: "MainCamera" });
    const wall = (name: string, x: number, y: number, sx: number, sy: number) => entity(name, [sprite("#334155", "square", 0), createCollider({ shape: "box", friction: 0, bounciness: 1 })], { position: { x, y }, scale: { x: sx, y: sy }, tag: "Wall" });
    const paddle = entity("Paddle", [sprite("#38bdf8", "roundedSquare", 2), createCollider({ shape: "box", friction: 0, bounciness: 1 }), script(paddleScript)], { position: { y: -5 }, scale: { x: 2.4, y: 0.35 }, tag: "Paddle" });
    const scoreText = entity("ScoreText", [uiText("Skor: 0", { anchor: "top-left", fontSize: 26 })]);
    const livesText = entity("LivesText", [uiText("Can: 3", { anchor: "top-right", fontSize: 26, color: "#fca5a5" })]);
    const ball = entity("Ball", [
        sprite("#f8fafc", "circle", 4),
        createRigidBody({ gravityScale: 0, useGravity: false, linearDamping: 0, freezeRotation: true }),
        createCollider({ shape: "circle", radius: 0.5, friction: 0, bounciness: 1 }),
        script(ballScript, { paddle: ref(paddle), scoreText: ref(scoreText), livesText: ref(livesText) }),
    ], { position: { y: -4.5 }, scale: { x: 0.35, y: 0.35 }, tag: "Ball" });
    const grid = entity("Bricks", [script(gridScript, { brickPrefab: prefabRef(brick) })]);
    scene.objects.push(camera, wall("Left Wall", -9.5, 0, 0.5, 14), wall("Right Wall", 9.5, 0, 0.5, 14), wall("Top Wall", 0, 6.1, 19.5, 0.5), paddle, ball, grid, scoreText, livesText);
    return finishProject(project, scene, "breakout-2d");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createProjectFromTemplate(templateId: TemplateId, name?: string): GameProjectDocument {
    const info = PROJECT_TEMPLATES.find((template) => template.id === templateId) ?? PROJECT_TEMPLATES[PROJECT_TEMPLATES.length - 1];
    const projectName = (name?.trim() || info.name.tr).slice(0, 80);
    switch (info.id) {
        case "platformer-2d": return platformer(projectName);
        case "rollaball-3d": return rollABall(projectName);
        case "space-shooter-2d": return spaceShooter(projectName);
        case "breakout-2d": return breakout(projectName);
        case "empty-2d":
        case "empty-3d": {
            const project = createBlankProject(projectName, info.dimension);
            const scene = createDefaultScene("Main Scene", info.dimension);
            return finishProject(project, scene, info.id);
        }
    }
}

/** Script file templates offered by "Create → Script". */
export function newScriptSource(className: string, language: "csharp" | "cpp"): string {
    const name = className.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]+/, "") || "NewBehaviour";
    if (language === "cpp") {
        return `#include <hanogt.h>

// ${name}: nesneye eklenen C++ davranışı.
class ${name} : public MonoBehaviour {
public:
    float speed = 5.0f;

    // İlk karede bir kez çalışır.
    void Start() {
        Debug::Log("${name} başladı!");
    }

    // Her karede çalışır.
    void Update() {
        // Örnek: transform->Rotate(0, speed * 10 * Time::deltaTime, 0);
    }
};
`;
    }
    return `using UnityEngine;

public class ${name} : MonoBehaviour
{
    public float speed = 5f;

    // İlk karede bir kez çalışır.
    void Start()
    {
        Debug.Log("${name} başladı!");
    }

    // Her karede çalışır.
    void Update()
    {
        // Örnek: transform.Rotate(0, speed * 10 * Time.deltaTime, 0);
    }
}
`;
}
