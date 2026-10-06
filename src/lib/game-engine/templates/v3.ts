/**
 * The V3 starter projects: a two-level tilemap adventure, a UI clicker and a
 * foggy 3D runner.
 */
import { animationPreset } from "../animation";
import {
    createAnimation,
    createCamera,
    createCollider,
    createLight,
    createMeshRenderer,
    createParticleSystem,
    createRigidBody,
    createSpriteRenderer,
    createUIButton,
    createUIPanel,
    createUIProgressBar,
} from "../components";
import { createBlankProject, createEmptyScene } from "../scene";
import type {
    AnimationClip,
    GameEntity,
    GameProjectDocument,
    ScriptFieldValue,
    TileDefinition,
} from "../types";
import { entity, sprite, script, scriptAsset, ref, prefabRef, prefab, uiText, finishProject, finishScenes, tilemap, uiButton, spinClip, type TileFill } from "./builders";

// ---------------------------------------------------------------------------
// V3: Tilemap platformer (two scenes)
// ---------------------------------------------------------------------------

const GROUND_TILES: TileDefinition[] = [
    { key: "#", name: "Çimen", color: "#22c55e", solid: true, frame: -1 },
    { key: "=", name: "Toprak", color: "#92400e", solid: true, frame: -1 },
    { key: "@", name: "Taş", color: "#64748b", solid: true, frame: -1 },
    { key: "B", name: "Tuğla", color: "#c2410c", solid: true, frame: -1 },
];

/** Tiles of the trigger tilemap: touching any of them kills the player. */
const HAZARD_TILES: TileDefinition[] = [
    { key: "^", name: "Diken", color: "#f43f5e", solid: true, frame: -1 },
    { key: "~", name: "Su", color: "#0ea5e9", solid: true, frame: -1 },
];

const DECOR_TILES: TileDefinition[] = [
    { key: "c", name: "Bulut", color: "#f8fafc", solid: false, frame: -1 },
    { key: "b", name: "Çalı", color: "#15803d", solid: false, frame: -1 },
    { key: "*", name: "Çiçek", color: "#facc15", solid: false, frame: -1 },
];

interface TileLevel {
    name: string;
    ground: TileFill[];
    hazards: TileFill[];
    decor: TileFill[];
    coins: Array<[number, number]>;
    goalX: number;
    cameraMaxX: number;
    /** Build index of the next level; -1 on the last level (opens the win panel). */
    nextScene: number;
    key?: { x: number; y: number; fromX: number; toX: number; bridgeY: number };
}

const TILE_LEVELS: TileLevel[] = [
    {
        name: "Seviye 1",
        ground: [
            [-4, -4, -3, 12, "@"],
            [-2, -4, 14, -2, "="], [-2, -1, 14, -1, "#"],
            [6, 2, 9, 2, "@"],
            [15, -4, 17, -3, "="],
            [18, -4, 30, -2, "="], [18, -1, 23, -1, "#"], [24, -1, 30, -1, "="], [24, 0, 30, 0, "#"],
            [35, -4, 64, -2, "="], [35, -1, 64, -1, "#"],
            [46, 0, 46, 0, "B"], [47, 0, 47, 1, "B"], [48, 0, 52, 2, "B"],
            [65, -4, 66, 12, "@"],
        ],
        hazards: [[15, -2, 17, -2, "^"], [40, 0, 41, 0, "^"]],
        decor: [
            [2, 6, 4, 6, "c"], [3, 7, 3, 7, "c"], [20, 7, 23, 7, "c"], [21, 8, 22, 8, "c"], [38, 6, 41, 6, "c"], [39, 7, 40, 7, "c"], [55, 7, 57, 7, "c"],
            [1, 0, 2, 0, "b"], [11, 0, 11, 0, "*"], [19, 0, 19, 0, "*"], [36, 0, 37, 0, "b"], [56, 0, 56, 0, "*"], [62, 0, 63, 0, "b"],
        ],
        coins: [[3.5, 0.6], [6.5, 3.6], [7.5, 3.6], [8.5, 3.6], [9.5, 3.6], [16.5, 2.4], [20.5, 0.6], [21.5, 0.6], [33, 2.8], [41, 2.8], [49.5, 3.6], [50.5, 3.6], [51.5, 3.6], [57.5, 0.6], [58.5, 0.6]],
        goalX: 61.5,
        cameraMaxX: 56,
        nextScene: 1,
    },
    {
        name: "Seviye 2",
        ground: [
            [-4, -4, -3, 12, "@"],
            [-2, -4, 19, -2, "="], [-2, -1, 19, -1, "#"],
            [7, 2, 9, 2, "@"], [11, 4, 14, 4, "@"],
            [20, -4, 27, -4, "="],
            [28, -4, 44, -2, "="], [28, -1, 44, -1, "#"], [38, 0, 38, 1, "B"],
            [49, -4, 62, -2, "="], [49, -1, 62, -1, "#"], [52, 3, 54, 3, "@"],
            [63, -4, 64, 12, "@"],
        ],
        hazards: [[20, -3, 27, -2, "~"], [33, 0, 34, 0, "^"]],
        decor: [
            [0, 7, 2, 7, "c"], [1, 8, 1, 8, "c"], [17, 6, 20, 6, "c"], [18, 7, 19, 7, "c"], [33, 7, 35, 7, "c"], [46, 6, 49, 6, "c"], [47, 7, 48, 7, "c"],
            [2, 0, 3, 0, "b"], [16, 0, 16, 0, "*"], [30, 0, 31, 0, "b"], [42, 0, 42, 0, "*"], [50, 0, 50, 0, "*"], [60, 0, 61, 0, "b"],
        ],
        coins: [[4.5, 0.6], [5.5, 0.6], [7.5, 3.6], [8.5, 3.6], [11.5, 5.6], [12.5, 5.6], [16.5, 0.6], [23.5, 0.6], [24.5, 0.6], [33.5, 2.8], [38.5, 3.6], [46.5, 2.6], [52.5, 4.6], [53.5, 4.6], [57.5, 0.6]],
        goalX: 59.5,
        cameraMaxX: 54,
        nextScene: -1,
        key: { x: 13.5, y: 5.8, fromX: 20, toX: 27, bridgeY: -1 },
    },
];

export function tilemapPlatformer(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");

    const playerScript = scriptAsset("PlayerController.cs", `
using UnityEngine;

// ← → (A/D) ile koş, Space / W / ↑ ile zıpla.
// Zemin bir Tilemap: çarpışmalar karo karo hesaplanır, karoların arasında takılmazsın.
public class PlayerController : MonoBehaviour
{
    [Header("Hareket")]
    public float moveSpeed = 6.5f;
    public float jumpForce = 14f;
    [Tooltip("Kenardan düştükten sonra hâlâ zıplayabileceğin süre (saniye)")]
    public float coyoteTime = 0.12f;
    public bool controlsEnabled = true;

    private Rigidbody2D rb;
    private SpriteRenderer sprite;
    private float lastGroundedTime = -10f;
    private bool dead;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        sprite = GetComponent<SpriteRenderer>();
    }

    void Update()
    {
        if (dead) return;
        if (!controlsEnabled)
        {
            rb.velocity = new Vector2(0, rb.velocity.y);
            return;
        }

        float h = Input.GetAxisRaw("Horizontal");
        rb.velocity = new Vector2(h * moveSpeed, rb.velocity.y);
        if (h != 0) sprite.flipX = h < 0;

        bool jumpPressed = Input.GetButtonDown("Jump") || Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W);
        if (jumpPressed && Time.time - lastGroundedTime <= coyoteTime)
        {
            rb.velocity = new Vector2(rb.velocity.x, jumpForce);
            lastGroundedTime = -10f;
            Tween.PunchScale(transform, 0.2f, 0.25f);
            Audio.Play("jump", 0.5f);
        }

        if (transform.position.y < -12f) Die();
    }

    void OnCollisionStay2D(Collision2D collision)
    {
        // Temas noktalarından biri yukarı bakıyorsa (karonun üstü) yerdeyiz.
        foreach (ContactPoint2D contact in collision.contacts)
        {
            if (contact.normal.y > 0.5f) lastGroundedTime = Time.time;
        }
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        // Diken ve su karoları "Hazard" etiketli, tetikleyici (Is Trigger) bir Tilemap'te.
        if (other.CompareTag("Hazard")) Die();
    }

    public void Die()
    {
        if (dead) return;
        dead = true;
        rb.velocity = Vector2.zero;
        rb.isKinematic = true;
        Tween.Color(sprite, Color.red, 0.1f);
        Tween.Scale(transform, 0f, 0.4f).SetEase(Ease.InBack);
        Audio.Play("lose");
        GameManager.Instance.RestartLevel();
    }
}`);

    const cameraScript = scriptAsset("CameraFollow.cs", `
using UnityEngine;

// Kamera oyuncuyu yumuşakça takip eder ve seviyenin sınırları içinde kalır.
public class CameraFollow : MonoBehaviour
{
    public Transform target;
    public float smoothSpeed = 6f;
    public Vector2 offset = new Vector2(2f, 1.5f);
    public float minX = 7f;
    public float maxX = 56f;
    public float minY = 3f;

    void LateUpdate()
    {
        if (target == null) return;
        float x = Mathf.Clamp(target.position.x + offset.x, minX, maxX);
        float y = Mathf.Max(minY, target.position.y + offset.y);
        Vector3 desired = new Vector3(x, y, transform.position.z);
        transform.position = Vector3.Lerp(transform.position, desired, smoothSpeed * Time.deltaTime);
    }
}`);

    const managerScript = scriptAsset("GameManager.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Coinleri sayar, ilerleme çubuğunu ve duraklatma menüsünü yönetir.
// "static" alanlar sahne değişince sıfırlanmaz: coinler seviyeden seviyeye taşınır.
public class GameManager : MonoBehaviour
{
    public static GameManager Instance;
    public static int coins;

    [Header("Arayüz")]
    public Text coinText;
    public Slider progressBar;
    public GameObject pauseMenu;

    [Header("Seviye")]
    public Transform player;
    public Transform goal;

    private int coinsAtStart;
    private float startX;
    private bool paused;

    void Awake()
    {
        Instance = this;
        coinsAtStart = coins;
    }

    void Start()
    {
        Time.timeScale = 1f;
        startX = player.position.x;
        UpdateCoins();
        HUD.Show(SceneManager.GetActiveScene().name, 1.5f);
    }

    void Update()
    {
        // Başlangıçtan bayrağa ne kadar yol alındı? (0…1)
        progressBar.value = Mathf.InverseLerp(startX, goal.position.x, player.position.x);
    }

    public void AddCoin()
    {
        coins++;
        UpdateCoins();
        Tween.PunchScale(coinText, 0.35f, 0.3f);
    }

    void UpdateCoins()
    {
        coinText.text = "Coin: " + coins;
    }

    // "II" butonu (P tuşu) ve menüdeki "Devam" butonu bunu çağırır: Inspector → Button → On Click.
    public void TogglePause()
    {
        paused = !paused;
        Time.timeScale = paused ? 0f : 1f;
        pauseMenu.SetActive(paused);
        Audio.Play("click", 0.5f);
    }

    public void RestartLevel()
    {
        paused = false;
        Time.timeScale = 1f;
        coins = coinsAtStart;
        SceneManager.FadeToScene(SceneManager.GetActiveScene().buildIndex, 0.4f);
    }

    public void PlayAgain()
    {
        coins = 0;
        SceneManager.FadeToScene(0, 0.5f);
    }
}`);

    const coinScript = scriptAsset("Coin.cs", `
using UnityEngine;

// Süzülme hareketi Animation bileşenindeki "Bob" klibinden gelir.
// Toplanınca Tween ile küçülür ve kendini yok eder.
public class Coin : MonoBehaviour
{
    private bool taken;

    void OnTriggerEnter2D(Collider2D other)
    {
        if (taken || !other.CompareTag("Player")) return;
        taken = true;
        GameManager.Instance.AddCoin();
        Audio.Play("coin");
        GetComponent<Animation>().Stop();
        Tween.Scale(transform, 0f, 0.25f).SetEase(Ease.InBack).OnComplete(() => Destroy(gameObject));
    }
}`);

    const goalScript = scriptAsset("Goal.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Bayrağa ulaşınca sonraki sahneye geçilir; son seviyede kazanma paneli açılır ve rekor kaydedilir.
public class Goal : MonoBehaviour
{
    [Tooltip("Geçilecek sahnenin sırası (-1: son seviye)")]
    public int nextScene = 1;
    public GameObject winPanel;
    public Text winText;
    private bool reached;

    void OnTriggerEnter2D(Collider2D other)
    {
        if (reached || !other.CompareTag("Player")) return;
        reached = true;
        other.GetComponent<PlayerController>().controlsEnabled = false;
        Audio.Play("win");
        if (nextScene >= 0)
        {
            SceneManager.FadeToScene(nextScene, 0.6f);
            return;
        }
        int best = Mathf.Max(GameManager.coins, PlayerPrefs.GetInt("tilemap.bestCoins", 0));
        PlayerPrefs.SetInt("tilemap.bestCoins", best);
        winText.text = "Tebrikler!\\nCoin: " + GameManager.coins + "   •   Rekor: " + best;
        winPanel.SetActive(true);
        Tween.PunchScale(winText, 0.25f, 0.5f);
    }
}`);

    const keyScript = scriptAsset("BridgeKey.cs", `
using UnityEngine;
using System.Collections;

// Anahtarı alınca suyun üstüne karo karo köprü kurulur: Tilemap.SetTile(x, y, "Tuğla").
public class BridgeKey : MonoBehaviour
{
    public Tilemap ground;
    public int fromX = 20;
    public int toX = 27;
    public int y = -1;
    public string tile = "Tuğla";
    private bool used;

    void OnTriggerEnter2D(Collider2D other)
    {
        if (used || !other.CompareTag("Player")) return;
        used = true;
        GetComponent<SpriteRenderer>().enabled = false;
        Audio.Play("powerup");
        HUD.Show("Köprü kuruluyor!", 1.5f);
        StartCoroutine(BuildBridge());
    }

    IEnumerator BuildBridge()
    {
        for (int x = fromX; x <= toX; x++)
        {
            ground.SetTile(x, y, tile);
            Audio.Play("click", 0.3f);
            yield return new WaitForSeconds(0.15f);
        }
        Destroy(gameObject);
    }
}`);

    project.scripts = [playerScript, cameraScript, managerScript, coinScript, goalScript, keyScript];

    const scenes = TILE_LEVELS.map((level) => {
        const scene = createEmptyScene(level.name, "2d");
        scene.settings.background = { mode: "gradient", color: "#bae6fd", topColor: "#2563eb" };

        const camera = entity("Main Camera", [createCamera({ projection: "orthographic", orthographicSize: 6, primary: true })], { position: { x: 7, y: 3, z: -10 }, tag: "MainCamera" });
        const ground = entity("Ground", [tilemap(GROUND_TILES, level.ground)], { tag: "Ground" });
        const hazards = entity("Hazards", [tilemap(HAZARD_TILES, level.hazards, { isTrigger: true, sortingLayer: 1 })], { tag: "Hazard" });
        const decor = entity("Decor", [tilemap(DECOR_TILES, level.decor, { sortingLayer: -10 })]);
        const player = entity("Player", [
            sprite("#f97316", "roundedSquare", 5),
            createRigidBody({ freezeRotation: true, freezePosition: { x: false, y: false, z: true }, linearDamping: 0, gravityScale: 2.6 }),
            createCollider({ shape: "box", friction: 0 }),
            script(playerScript),
        ], { position: { x: 1.5, y: 0.5 }, scale: { x: 0.9, y: 0.9 }, tag: "Player" });
        camera.components.push(script(cameraScript, { target: ref(player), maxX: level.cameraMaxX }));

        const coins = level.coins.map(([x, y]) => entity("Coin", [
            sprite("#facc15", "circle", 3),
            createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
            createAnimation({ clips: [animationPreset("bob", "2d")] }),
            script(coinScript),
        ], { position: { x, y }, scale: { x: 0.5, y: 0.5 } }));

        // UI: coin counter, level progress, pause button and the pause menu (inactive until paused).
        const coinText = entity("CoinText", [uiText("Coin: 0", { anchor: "top-left", fontSize: 28 })]);
        const progressBar = entity("LevelProgress", [createUIProgressBar({ value: 0, anchor: "top", offset: { x: 0, y: 26 }, width: 300, height: 14, fillColor: "#facc15", backgroundColor: "#1e293b" })]);
        const hint = entity("HintText", [uiText("← → koş  •  Space zıpla  •  P duraklat", { anchor: "bottom", fontSize: 16, offset: { x: 0, y: 18 }, color: "#f8fafc", bold: false })]);
        const manager = entity("GameManager", []);
        const pauseButton = entity("PauseButton", [uiButton("II", manager, "TogglePause", { anchor: "top-right", offset: { x: 18, y: 16 }, width: 52, height: 52, fontSize: 22, color: "#334155", hotkey: "P" })]);
        const pauseMenu = entity("PauseMenu", [createUIPanel({ fullScreen: true, color: "#020617", opacity: 0.7, order: 50 })], { active: false });
        const pauseTitle = entity("Title", [uiText("Duraklatıldı", { anchor: "center", fontSize: 44, offset: { x: 0, y: -90 }, order: 55 })], { parentId: pauseMenu.id });
        const resume = entity("ResumeButton", [uiButton("Devam", manager, "TogglePause", { offset: { x: 0, y: 0 }, width: 240, height: 56, color: "#16a34a", order: 60 })], { parentId: pauseMenu.id });
        const restart = entity("RestartButton", [uiButton("Baştan Başla", manager, "RestartLevel", { offset: { x: 0, y: 72 }, width: 240, height: 56, color: "#6366f1", order: 60 })], { parentId: pauseMenu.id });

        const goal = entity("Goal", [
            sprite("#a855f7", "star", 4),
            createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
            createAnimation({ clips: [spinClip("2d", 3)] }),
        ], { position: { x: level.goalX, y: 0.9 }, scale: { x: 1.4, y: 1.4 } });

        const extra: GameEntity[] = [];
        const goalFields: Record<string, ScriptFieldValue> = { nextScene: level.nextScene };
        if (level.nextScene < 0) {
            const winPanel = entity("WinPanel", [createUIPanel({ width: 440, height: 280, color: "#0f172a", opacity: 0.94, order: 50 })], { active: false });
            const winText = entity("WinText", [uiText("Tebrikler!", { anchor: "center", fontSize: 30, offset: { x: 0, y: -40 }, order: 55 })], { parentId: winPanel.id });
            const again = entity("PlayAgainButton", [uiButton("Tekrar Oyna", manager, "PlayAgain", { offset: { x: 0, y: 80 }, width: 240, height: 56, color: "#f59e0b", order: 60 })], { parentId: winPanel.id });
            goalFields.winPanel = ref(winPanel);
            goalFields.winText = ref(winText);
            extra.push(winPanel, winText, again);
        }
        goal.components.push(script(goalScript, goalFields));

        if (level.key) {
            const key = level.key;
            extra.push(entity("Key", [
                sprite("#fde047", "diamond", 4),
                createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
                createAnimation({ clips: [animationPreset("bob", "2d")] }),
                script(keyScript, { ground: ref(ground), fromX: key.fromX, toX: key.toX, y: key.bridgeY }),
            ], { position: { x: key.x, y: key.y }, scale: { x: 0.6, y: 0.8 } }));
        }

        manager.components.push(script(managerScript, {
            coinText: ref(coinText),
            progressBar: ref(progressBar),
            pauseMenu: ref(pauseMenu),
            player: ref(player),
            goal: ref(goal),
        }));

        scene.objects.push(
            camera, decor, ground, hazards, ...coins, goal, player, manager,
            coinText, progressBar, hint, pauseButton, pauseMenu, pauseTitle, resume, restart, ...extra,
        );
        return scene;
    });
    return finishScenes(project, scenes, "tilemap-platformer-2d");
}

// ---------------------------------------------------------------------------
// V3: UI clicker (menu + game scene)
// ---------------------------------------------------------------------------

export function clickerUi(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    project.settings.touchControls = false;

    const menuScript = scriptAsset("MenuController.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Ana menü: kayıtlı ilerlemeyi gösterir, oyunu başlatır veya sıfırlar.
// Butonlar bu metotları Inspector'daki On Click alanından çağırır.
public class MenuController : MonoBehaviour
{
    public Text savedText;
    public Transform logo;

    void Start()
    {
        ShowSaved();
        // Sonsuz "nefes alma" efekti: büyü, küçül, tekrarla.
        Tween.Scale(logo, 2.9f, 0.9f).SetEase(Ease.InOutSine).SetLoops(-1, LoopType.Yoyo);
    }

    public void Play()
    {
        Audio.Play("click");
        SceneManager.FadeToScene("Fabrika", 0.4f);
    }

    public void ResetProgress()
    {
        PlayerPrefs.DeleteKey("clicker.gold");
        PlayerPrefs.DeleteKey("clicker.perClick");
        PlayerPrefs.DeleteKey("clicker.workers");
        PlayerPrefs.DeleteKey("clicker.goal");
        ShowSaved();
        HUD.Show("İlerleme sıfırlandı", 1.5f);
    }

    void ShowSaved()
    {
        int gold = PlayerPrefs.GetInt("clicker.gold", 0);
        int workers = PlayerPrefs.GetInt("clicker.workers", 0);
        savedText.text = gold > 0 || workers > 0 ? "Kayıtlı oyun: " + gold + " altın, " + workers + " işçi" : "Yeni oyun";
    }
}`);

    const factoryScript = scriptAsset("Factory.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Oyunun beyni: altın, yükseltmeler, pasif gelir (Timer.Every) ve kayıt (PlayerPrefs).
// "Üret" butonu koddan bağlanır (onClick.AddListener); yükseltme butonları Inspector'dan.
public class Factory : MonoBehaviour
{
    [Header("Arayüz")]
    public Text goldText;
    public Text incomeText;
    public Slider goalBar;
    public Text goalText;
    public Button produceButton;
    public Button clickUpgradeButton;
    public Button workerButton;

    [Header("Efektler")]
    public GameObject floatingTextPrefab;
    public GameObject workerPrefab;

    [Header("Denge")]
    public int clickUpgradeBasePrice = 10;
    public int workerBasePrice = 25;

    private int gold;
    private int perClick = 1;
    private int workers;
    private int goal = 100;

    void Start()
    {
        gold = PlayerPrefs.GetInt("clicker.gold", 0);
        perClick = PlayerPrefs.GetInt("clicker.perClick", 1);
        workers = PlayerPrefs.GetInt("clicker.workers", 0);
        goal = PlayerPrefs.GetInt("clicker.goal", 100);
        for (int i = 0; i < workers; i++) SpawnWorker(i, false);

        produceButton.onClick.AddListener(Produce);
        // Her saniye işçiler üretir, her 5 saniyede ilerleme kaydedilir.
        Timer.Every(1f, () => AddGold(workers));
        Timer.Every(5f, Save);
        UpdateUI();
    }

    void Produce()
    {
        AddGold(perClick);
        Tween.PunchScale(produceButton, 0.12f, 0.25f);
        ShowFloatingText("+" + perClick);
        Audio.Play("coin", 0.35f);
    }

    void AddGold(int amount)
    {
        if (amount <= 0) return;
        gold += amount;
        if (gold >= goal)
        {
            HUD.Show("Hedef tamamlandı: " + goal + " altın!", 2f, Color.yellow);
            Audio.Play("win", 0.6f);
            goal *= 5;
        }
        UpdateUI();
    }

    public void BuyClickUpgrade()
    {
        int price = ClickUpgradePrice();
        if (gold < price) return;
        gold -= price;
        perClick++;
        Audio.Play("powerup", 0.5f);
        Tween.PunchScale(clickUpgradeButton, 0.1f, 0.25f);
        UpdateUI();
    }

    public void BuyWorker()
    {
        int price = WorkerPrice();
        if (gold < price) return;
        gold -= price;
        SpawnWorker(workers, true);
        workers++;
        Audio.Play("powerup", 0.5f);
        Tween.PunchScale(workerButton, 0.1f, 0.25f);
        UpdateUI();
    }

    int ClickUpgradePrice()
    {
        return clickUpgradeBasePrice * perClick * perClick;
    }

    int WorkerPrice()
    {
        return Mathf.RoundToInt(workerBasePrice * Mathf.Pow(1.35f, workers));
    }

    // Her işçi ekranın altında dönen bir çark olarak görünür (en fazla 24 tane).
    void SpawnWorker(int index, bool animate)
    {
        if (index >= 24) return;
        Vector3 position = new Vector3(-7.4f + (index % 12) * 1.35f, -3f - (index / 12) * 1.25f, 0);
        GameObject worker = Instantiate(workerPrefab, position, Quaternion.identity);
        if (!animate) return;
        worker.transform.localScale = Vector3.zero;
        Tween.Scale(worker.transform, 0.9f, 0.4f).SetEase(Ease.OutBack);
    }

    void ShowFloatingText(string text)
    {
        GameObject label = Instantiate(floatingTextPrefab);
        Text t = label.GetComponent<Text>();
        t.text = text;
        t.anchoredPosition = new Vector2(Random.Range(-70f, 70f), -60f);
    }

    void UpdateUI()
    {
        goldText.text = gold.ToString("N0") + " altın";
        incomeText.text = "Tık başına " + perClick + "   •   Saniyede " + workers;
        goalBar.maxValue = goal;
        goalBar.value = gold;
        goalText.text = "Hedef: " + goal.ToString("N0") + " altın";
        clickUpgradeButton.text = "Güçlü tık (+1)\\n" + ClickUpgradePrice() + " altın";
        clickUpgradeButton.interactable = gold >= ClickUpgradePrice();
        workerButton.text = "İşçi (+1/sn)\\n" + WorkerPrice() + " altın";
        workerButton.interactable = gold >= WorkerPrice();
    }

    public void Save()
    {
        PlayerPrefs.SetInt("clicker.gold", gold);
        PlayerPrefs.SetInt("clicker.perClick", perClick);
        PlayerPrefs.SetInt("clicker.workers", workers);
        PlayerPrefs.SetInt("clicker.goal", goal);
        PlayerPrefs.Save();
    }

    public void BackToMenu()
    {
        Save();
        SceneManager.FadeToScene("Menü", 0.4f);
    }
}`);

    const floatingScript = scriptAsset("FloatingText.cs", `
using UnityEngine;
using UnityEngine.UI;

// "+1" yazısı yukarı süzülür ve kaybolur: iki Tween aynı anda çalışır.
public class FloatingText : MonoBehaviour
{
    void Start()
    {
        Text label = GetComponent<Text>();
        Vector2 start = label.anchoredPosition;
        Tween.Value(0f, 90f, 0.8f, v => label.anchoredPosition = new Vector2(start.x, start.y - v)).SetEase(Ease.OutCubic);
        Tween.Fade(gameObject, 0f, 0.8f).SetEase(Ease.InQuad).OnComplete(() => Destroy(gameObject));
    }
}`);
    project.scripts = [menuScript, factoryScript, floatingScript];

    const floating = prefab("FloatingText", entity("FloatingText", [
        uiText("+1", { anchor: "center", fontSize: 30, color: "#fde047", offset: { x: 0, y: -60 }, order: 30 }),
        script(floatingScript),
    ]));
    const worker = prefab("Worker", entity("Worker", [
        sprite("#fbbf24", "star", 2),
        createAnimation({ clips: [spinClip("2d", 2)] }),
    ], { scale: { x: 0.9, y: 0.9 } }));
    project.prefabs = [floating, worker];

    const background = { mode: "gradient" as const, color: "#1e1b4b", topColor: "#be185d" };
    const camera = () => entity("Main Camera", [createCamera({ projection: "orthographic", orthographicSize: 5, primary: true })], { position: { z: -10 }, tag: "MainCamera" });

    // Menu scene
    const menu = createEmptyScene("Menü", "2d");
    menu.settings.background = { ...background };
    const logo = entity("Logo", [sprite("#f59e0b", "star", 0), createAnimation({ clips: [spinClip("2d", 8)] })], { position: { y: 0.8 }, scale: { x: 2.6, y: 2.6 } });
    const title = entity("Title", [uiText("Tıklama Fabrikası", { anchor: "top", fontSize: 50, offset: { x: 0, y: 48 }, color: "#fef3c7" })]);
    const savedText = entity("SavedText", [uiText("Yeni oyun", { anchor: "center", fontSize: 20, offset: { x: 0, y: 70 }, color: "#fde68a", bold: false })]);
    const menuController = entity("MenuController", []);
    menuController.components.push(script(menuScript, { savedText: ref(savedText), logo: ref(logo) }));
    const playButton = entity("PlayButton", [uiButton("Başla", menuController, "Play", { offset: { x: 0, y: 140 }, width: 240, height: 64, fontSize: 26, color: "#f59e0b", hotkey: "Space" })]);
    const resetButton = entity("ResetButton", [uiButton("Sıfırla", menuController, "ResetProgress", { anchor: "bottom-right", offset: { x: 20, y: 20 }, width: 140, height: 44, fontSize: 16, color: "#475569" })]);
    menu.objects.push(camera(), logo, title, savedText, menuController, playButton, resetButton);

    // Factory scene
    const game = createEmptyScene("Fabrika", "2d");
    game.settings.background = { ...background };
    const floor = entity("Floor", [sprite("#312e81", "square", -5)], { position: { y: -4.1 }, scale: { x: 24, y: 3 } });
    const glow = entity("Glow", [
        createSpriteRenderer({ color: "#fbbf24", shape: "circle", opacity: 0.18, sortingLayer: -10 }),
        createAnimation({ clips: [animationPreset("pulse", "2d")] }),
    ], { position: { y: -0.2 }, scale: { x: 4.6, y: 4.6 } });
    const goldText = entity("GoldText", [uiText("0 altın", { anchor: "top", fontSize: 44, offset: { x: 0, y: 26 }, color: "#fef3c7" })]);
    const incomeText = entity("IncomeText", [uiText("Tık başına 1", { anchor: "top", fontSize: 18, offset: { x: 0, y: 84 }, color: "#fde68a", bold: false })]);
    const goalBar = entity("GoalBar", [createUIProgressBar({ value: 0, max: 100, anchor: "top", offset: { x: 0, y: 116 }, width: 320, height: 16, fillColor: "#facc15", backgroundColor: "#1e1b4b", showLabel: true })]);
    const goalText = entity("GoalText", [uiText("Hedef: 100 altın", { anchor: "top", fontSize: 15, offset: { x: 0, y: 138 }, color: "#e2e8f0", bold: false })]);
    const factory = entity("Factory", []);
    const produce = entity("ProduceButton", [createUIButton({ text: "ÜRET", offset: { x: 0, y: 10 }, width: 190, height: 190, cornerRadius: 95, fontSize: 34, color: "#f59e0b", hotkey: "Space" })]);
    const clickUpgrade = entity("ClickUpgradeButton", [uiButton("Güçlü tık (+1)", factory, "BuyClickUpgrade", { anchor: "right", offset: { x: 24, y: -44 }, width: 230, height: 66, fontSize: 17, color: "#7c3aed", hotkey: "Alpha1" })]);
    const workerButton = entity("WorkerButton", [uiButton("İşçi (+1/sn)", factory, "BuyWorker", { anchor: "right", offset: { x: 24, y: 40 }, width: 230, height: 66, fontSize: 17, color: "#0891b2", hotkey: "Alpha2" })]);
    const menuButton = entity("MenuButton", [uiButton("← Menü", factory, "BackToMenu", { anchor: "top-left", offset: { x: 18, y: 16 }, width: 120, height: 44, fontSize: 16, color: "#334155" })]);
    const hint = entity("HintText", [uiText("Space: üret  •  1 / 2: satın al", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 14 }, color: "#c7d2fe", bold: false })]);
    factory.components.push(script(factoryScript, {
        goldText: ref(goldText),
        incomeText: ref(incomeText),
        goalBar: ref(goalBar),
        goalText: ref(goalText),
        produceButton: ref(produce),
        clickUpgradeButton: ref(clickUpgrade),
        workerButton: ref(workerButton),
        floatingTextPrefab: prefabRef(floating),
        workerPrefab: prefabRef(worker),
    }));
    game.objects.push(camera(), floor, glow, goldText, incomeText, goalBar, goalText, factory, produce, clickUpgrade, workerButton, menuButton, hint);

    return finishScenes(project, [menu, game], "clicker-ui-2d");
}

// ---------------------------------------------------------------------------
// V3: 3D runner with fog and screen effects
// ---------------------------------------------------------------------------

export function runner3d(name: string): GameProjectDocument {
    const project = createBlankProject(name, "3d");
    const scene = createEmptyScene("Koşu", "3d");
    const settings = scene.settings;
    settings.background = { mode: "gradient", color: "#4c1d95", topColor: "#020617" };
    settings.ambientColor = "#a78bfa";
    settings.ambientIntensity = 0.55;
    settings.fog = { ...settings.fog, enabled: true, mode: "exponential", color: "#4c1d95", density: 0.03 };
    settings.postProcessing = {
        bloom: { enabled: true, intensity: 0.9, threshold: 0.55, radius: 0.55 },
        vignette: { enabled: true, intensity: 0.45 },
        exposure: 1.1,
    };

    const runnerScript = scriptAsset("Runner.cs", `
using UnityEngine;

// Sonsuz koşu: oyuncu sürekli ileri gider ve gittikçe hızlanır.
// ← → (A/D) şerit değiştirir, Space zıplar. Zıplama fiziği koddan hesaplanır.
public class Runner : MonoBehaviour
{
    public static Runner Instance;

    [Header("Hız")]
    public float startSpeed = 9f;
    public float maxSpeed = 22f;
    public float acceleration = 0.3f;

    [Header("Şeritler")]
    public float laneWidth = 2.2f;
    public float laneChangeSpeed = 14f;

    [Header("Zıplama")]
    public float jumpVelocity = 9f;
    public float gravity = 26f;

    [HideInInspector] public float speed;
    [HideInInspector] public bool alive = true;
    private int lane;
    private float lastInput;
    private float verticalVelocity;
    private float groundY;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        speed = startSpeed;
        groundY = transform.position.y;
    }

    void Update()
    {
        if (!alive) return;

        // Ok tuşu ya da dokunmatik çubuk: yalnızca basıldığı anda bir şerit kay.
        float h = Input.GetAxisRaw("Horizontal");
        if (h != 0 && lastInput == 0) lane = Mathf.Clamp(lane + (h > 0 ? 1 : -1), -1, 1);
        lastInput = h;

        bool grounded = transform.position.y <= groundY + 0.001f;
        if (grounded && (Input.GetButtonDown("Jump") || Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W)))
        {
            verticalVelocity = jumpVelocity;
            Audio.Play("jump", 0.4f);
        }

        speed = Mathf.Min(maxSpeed, speed + acceleration * Time.deltaTime);
        verticalVelocity -= gravity * Time.deltaTime;
        Vector3 p = transform.position;
        p.x = Mathf.MoveTowards(p.x, lane * laneWidth, laneChangeSpeed * Time.deltaTime);
        p.y = Mathf.Max(groundY, p.y + verticalVelocity * Time.deltaTime);
        p.z += speed * Time.deltaTime;
        if (p.y <= groundY) verticalVelocity = 0;
        transform.position = p;
    }

    void OnTriggerEnter(Collider other)
    {
        if (!alive) return;
        if (other.CompareTag("Gem"))
        {
            RunnerGame.Instance.CollectGem(other.gameObject);
        }
        else if (other.CompareTag("Obstacle"))
        {
            alive = false;
            Tween.Shake(Camera.main.transform, 0.35f, 0.5f);
            Tween.Color(gameObject, Color.red, 0.2f);
            RunnerGame.Instance.GameOver();
        }
    }
}`);

    const cameraScript = scriptAsset("RunnerCamera.cs", `
using UnityEngine;

// Kamera oyuncunun arkasından gelir; yanlara yarı hızla kayar.
public class RunnerCamera : MonoBehaviour
{
    public Transform target;
    public Vector3 offset = new Vector3(0, 3.2f, -6.5f);
    public float sideFollow = 0.5f;

    void LateUpdate()
    {
        if (target == null || !Runner.Instance.alive) return;
        float x = Mathf.Lerp(transform.position.x, target.position.x * sideFollow, 8f * Time.deltaTime);
        transform.position = new Vector3(x, offset.y + target.position.y * 0.3f, target.position.z + offset.z);
    }
}`);

    const gameScript = scriptAsset("RunnerGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Oyuncunun önüne engel ve elmas sıraları üretir, mesafeyi, elmasları ve rekoru tutar.
public class RunnerGame : MonoBehaviour
{
    public static RunnerGame Instance;

    [Header("Prefab'lar")]
    public GameObject obstaclePrefab;
    public GameObject gemPrefab;

    [Header("Arayüz")]
    public Text distanceText;
    public Text gemText;
    public Text bestText;
    public Slider speedBar;
    public GameObject gameOverPanel;
    public Text resultText;

    [Header("Üretim")]
    public float spawnAhead = 70f;
    public float rowSpacing = 10f;

    private float nextRowZ = 24f;
    private int gems;
    private int best;
    private bool over;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        best = PlayerPrefs.GetInt("runner.best", 0);
        bestText.text = "Rekor: " + best;
        HUD.Show("← → şerit değiştir  •  Space zıpla", 2.5f);
    }

    void Update()
    {
        Runner runner = Runner.Instance;
        float z = runner.transform.position.z;
        while (nextRowZ < z + spawnAhead)
        {
            SpawnRow(nextRowZ);
            nextRowZ += rowSpacing * Random.Range(0.8f, 1.3f);
        }
        if (over) return;
        distanceText.text = Mathf.FloorToInt(z) + " m";
        speedBar.value = Mathf.InverseLerp(runner.startSpeed, runner.maxSpeed, runner.speed);
    }

    // Her sırada en az bir şerit boş kalır; boş şeritte çoğu zaman bir elmas olur.
    void SpawnRow(float z)
    {
        int free = Random.Range(-1, 2);
        for (int lane = -1; lane <= 1; lane++)
        {
            Vector3 position = new Vector3(lane * Runner.Instance.laneWidth, 0.6f, z);
            if (lane == free)
            {
                if (Random.value < 0.6f) Instantiate(gemPrefab, position + Vector3.up * 0.4f, Quaternion.identity);
            }
            else if (Random.value < 0.6f)
            {
                GameObject obstacle = Instantiate(obstaclePrefab, position, Quaternion.identity);
                // Bazı engeller yüksek: bunların üstünden atlanamaz, şerit değiştirmek gerekir.
                if (Random.value < 0.3f)
                {
                    obstacle.transform.localScale = new Vector3(1.6f, 2.6f, 0.6f);
                    obstacle.transform.position += Vector3.up * 0.7f;
                }
            }
        }
    }

    public void CollectGem(GameObject gem)
    {
        gems++;
        gemText.text = "💎 " + gems;
        Audio.Play("coin", 0.5f);
        Tween.PunchScale(gemText, 0.3f, 0.3f);
        Tween.Scale(gem.transform, 0f, 0.2f).OnComplete(() => Destroy(gem));
    }

    public void GameOver()
    {
        if (over) return;
        over = true;
        int distance = Mathf.FloorToInt(Runner.Instance.transform.position.z);
        int score = distance + gems * 10;
        bool record = score > best;
        if (record) PlayerPrefs.SetInt("runner.best", score);
        resultText.text = (record ? "Yeni rekor!\\n" : "") + "Mesafe: " + distance + " m\\nElmas: " + gems + "\\nSkor: " + score;
        Audio.Play("lose");
        // Panel, kamera sarsıntısı bitince açılır.
        Timer.After(0.6f, () => gameOverPanel.SetActive(true));
    }

    // "Tekrar Koş" butonu (R tuşu) bunu çağırır.
    public void Restart()
    {
        SceneManager.ReloadScene();
    }
}`);

    const cleanupScript = scriptAsset("Cleanup.cs", `
using UnityEngine;

// Oyuncunun arkasında kalan engelleri ve elmasları siler.
public class Cleanup : MonoBehaviour
{
    void Update()
    {
        if (transform.position.z < Runner.Instance.transform.position.z - 10f) Destroy(gameObject);
    }
}`);

    const sceneryScript = scriptAsset("Scenery.cs", `
using UnityEngine;
using System.Collections.Generic;

// Yol kenarındaki ışıklı direkleri geride kalınca öne taşır; yol oyuncuyla ilerler.
public class Scenery : MonoBehaviour
{
    public GameObject pillarPrefab;
    public Transform road;
    public int pairs = 12;
    public float spacing = 10f;
    public float sideOffset = 5f;
    private List<Transform> pillars = new List<Transform>();

    void Start()
    {
        for (int i = 0; i < pairs; i++)
        {
            for (int side = -1; side <= 1; side += 2)
            {
                GameObject pillar = Instantiate(pillarPrefab, new Vector3(side * sideOffset, 1.6f, i * spacing), Quaternion.identity);
                pillars.Add(pillar.transform);
            }
        }
    }

    void Update()
    {
        float z = Runner.Instance.transform.position.z;
        foreach (Transform pillar in pillars)
        {
            if (pillar.position.z < z - 10f) pillar.position += new Vector3(0, 0, pairs * spacing);
        }
        road.position = new Vector3(0, 0, z + 60f);
    }
}`);
    project.scripts = [runnerScript, cameraScript, gameScript, cleanupScript, sceneryScript];

    const obstacle = prefab("Obstacle", entity("Obstacle", [
        createMeshRenderer({ mesh: "cube", material: { color: "#f43f5e", emissive: "#be123c", emissiveIntensity: 0.8, roughness: 0.4 } }),
        createCollider({ shape: "box", isTrigger: true }),
        script(cleanupScript),
    ], { scale: { x: 1.6, y: 1.2, z: 0.6 }, tag: "Obstacle" }));
    const gemIdle: AnimationClip = {
        name: "Idle",
        duration: 2,
        wrap: "loop",
        tracks: [
            { property: "rotation", keys: [{ time: 0, value: { x: 0, y: 0, z: 0 }, easing: "linear" }, { time: 2, value: { x: 0, y: 360, z: 0 }, easing: "linear" }] },
            { property: "position", keys: [{ time: 0, value: { x: 0, y: 0, z: 0 }, easing: "inOutSine" }, { time: 1, value: { x: 0, y: 0.3, z: 0 }, easing: "inOutSine" }, { time: 2, value: { x: 0, y: 0, z: 0 }, easing: "linear" }] },
        ],
    };
    const gem = prefab("Gem", entity("Gem", [
        createMeshRenderer({ mesh: "cube", material: { color: "#67e8f9", emissive: "#06b6d4", emissiveIntensity: 1.8, metallic: 0.3, roughness: 0.2 } }),
        createCollider({ shape: "box", isTrigger: true }),
        createAnimation({ clips: [gemIdle] }),
        script(cleanupScript),
    ], { rotation: { x: 45, z: 45 }, scale: { x: 0.45, y: 0.45, z: 0.45 }, tag: "Gem" }));
    const pillar = prefab("Pillar", entity("Pillar", [
        createMeshRenderer({ mesh: "cylinder", castShadows: false, material: { color: "#c084fc", emissive: "#a855f7", emissiveIntensity: 1.4 } }),
    ], { scale: { x: 0.25, y: 1.6, z: 0.25 } }));
    project.prefabs = [obstacle, gem, pillar];

    const camera = entity("Main Camera", [createCamera({ fieldOfView: 62, farClip: 400, primary: true })], { position: { y: 3.2, z: -6.5 }, rotation: { x: 14 }, tag: "MainCamera" });
    const light = entity("Directional Light", [createLight({ lightType: "directional", intensity: 1.1, color: "#e9d5ff" })], { position: { y: 10 }, rotation: { x: 50, y: -30 } });
    const road = entity("Road", [], { position: { z: 60 } });
    const ground = entity("Ground", [createMeshRenderer({ mesh: "plane", material: { color: "#1e1b4b", roughness: 0.95 } })], { scale: { x: 12, y: 1, z: 220 }, parentId: road.id });
    const line = (name: string, x: number, width: number, color: string) => entity(name, [
        createMeshRenderer({ mesh: "cube", castShadows: false, material: { color, emissive: color, emissiveIntensity: 1.3 } }),
    ], { position: { x, y: 0.01 }, scale: { x: width, y: 0.02, z: 220 }, parentId: road.id });
    const player = entity("Player", [
        createMeshRenderer({ mesh: "capsule", material: { color: "#f8fafc", emissive: "#22d3ee", emissiveIntensity: 0.25, roughness: 0.35 } }),
        createRigidBody({ bodyType: "kinematic", useGravity: false }),
        createCollider({ shape: "box", size: { x: 1, y: 2, z: 1 } }),
        script(runnerScript),
    ], { position: { y: 0.55 }, scale: { x: 0.7, y: 0.55, z: 0.7 }, tag: "Player" });
    const trail = entity("Trail", [createParticleSystem({ emissionRate: 40, lifetime: 0.45, startSpeed: 1.2, spread: 25, startSize: 0.16, endSize: 0.02, startColor: "#67e8f9", endColor: "#a855f7", maxParticles: 60, worldSpace: true })], { position: { y: -0.6, z: -0.6 }, parentId: player.id });
    camera.components.push(script(cameraScript, { target: ref(player) }));

    const distanceText = entity("DistanceText", [uiText("0 m", { anchor: "top-left", fontSize: 34 })]);
    const gemText = entity("GemText", [uiText("💎 0", { anchor: "top-right", fontSize: 30, color: "#67e8f9" })]);
    const bestText = entity("BestText", [uiText("Rekor: 0", { anchor: "top", fontSize: 16, offset: { x: 0, y: 26 }, color: "#c4b5fd", bold: false })]);
    const speedBar = entity("SpeedBar", [createUIProgressBar({ value: 0, anchor: "bottom", offset: { x: 0, y: 24 }, width: 260, height: 10, fillColor: "#22d3ee", backgroundColor: "#1e1b4b" })]);
    const manager = entity("RunnerGame", []);
    const gameOver = entity("GameOverPanel", [createUIPanel({ fullScreen: true, color: "#020617", opacity: 0.75, order: 50 })], { active: false });
    const gameOverTitle = entity("Title", [uiText("Oyun Bitti", { anchor: "center", fontSize: 48, offset: { x: 0, y: -120 }, color: "#f472b6", order: 55 })], { parentId: gameOver.id });
    const resultText = entity("ResultText", [uiText("", { anchor: "center", fontSize: 22, offset: { x: 0, y: -20 }, order: 55, bold: false })], { parentId: gameOver.id });
    const again = entity("RestartButton", [uiButton("Tekrar Koş", manager, "Restart", { offset: { x: 0, y: 100 }, width: 240, height: 60, color: "#7c3aed", order: 60, hotkey: "R" })], { parentId: gameOver.id });
    manager.components.push(script(gameScript, {
        obstaclePrefab: prefabRef(obstacle),
        gemPrefab: prefabRef(gem),
        distanceText: ref(distanceText),
        gemText: ref(gemText),
        bestText: ref(bestText),
        speedBar: ref(speedBar),
        gameOverPanel: ref(gameOver),
        resultText: ref(resultText),
    }));
    const scenery = entity("Scenery", [script(sceneryScript, { pillarPrefab: prefabRef(pillar), road: ref(road) })]);

    scene.objects.push(
        camera, light, road, ground,
        line("Lane Line L", -1.1, 0.06, "#8b5cf6"), line("Lane Line R", 1.1, 0.06, "#8b5cf6"),
        line("Edge L", -3.4, 0.12, "#ec4899"), line("Edge R", 3.4, 0.12, "#ec4899"),
        player, trail, manager, scenery,
        distanceText, gemText, bestText, speedBar, gameOver, gameOverTitle, resultText, again,
    );
    return finishProject(project, scene, "runner-3d");
}
