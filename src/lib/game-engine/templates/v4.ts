/**
 * The V4 starter projects: a tower climb built on Character Controller 2D and
 * Camera Follow, a maze chase with Nav Agent 2D and A* path finding, and a
 * slingshot physics puzzle with spring and distance joints and the new UI
 * controls (slider, toggle and input field).
 */
import { animationPreset } from "../animation";
import {
    createAnimation,
    createCameraFollow,
    createCharacterController2D,
    createCollider,
    createJoint,
    createNavAgent2D,
    createRigidBody,
    createUIInputField,
    createUIPanel,
    createUISlider,
    createUIToggle,
} from "../components";
import { createBlankProject, createEmptyScene } from "../scene";
import { createEngineId } from "../ids";
import type { GameProjectDocument, TileDefinition } from "../types";
import { AUTO_DESTROY, burst, camera2d, entity, finishProject, gameOverPanel, prefab, prefabRef, ref, script, scriptAsset, sprite, spinClip, tilemap, uiButton, uiText, type TileFill } from "./builders";

// ---------------------------------------------------------------------------
// V4: Sky Tower (Character Controller 2D, Camera Follow, settings menu)
// ---------------------------------------------------------------------------

const TOWER_TILES: TileDefinition[] = [
    { key: "#", name: "Platform", color: "#a855f7", solid: true, frame: -1 },
    { key: "W", name: "Kule duvarı", color: "#3b0764", solid: true, frame: -1 },
];

const TOWER_HAZARDS: TileDefinition[] = [
    { key: "^", name: "Diken", color: "#f43f5e", solid: true, frame: -1 },
];

/** Cell rows: a cell (x, y) covers x…x+1 and y…y+1, so a platform row y has its top at y + 1. */
const TOWER_GROUND: TileFill[] = [
    [-11, -6, -11, 40, "W"], [10, -6, 10, 40, "W"],
    [-10, -6, 9, -6, "#"],
    [3, -3, 7, -3, "#"],
    [-6, 0, -2, 0, "#"],
    [5, 6, 8, 6, "#"],
    [-1, 9, 2, 9, "#"],
    [-8, 12, -5, 12, "#"],
    [0, 15, 3, 15, "#"],
    [5, 18, 8, 18, "#"],
    [-3, 21, 1, 21, "#"],
];

const TOWER_SPIKES: TileFill[] = [
    [6, -5, 8, -5, "^"],
    [7, -2, 7, -2, "^"],
    [-8, 13, -8, 13, "^"],
];

const TOWER_COINS: Array<[number, number]> = [
    [-5.5, -4.4], [4.5, -1.4], [5.5, -1.4], [-5.5, 1.6], [-3.5, 1.6], [2, 5.4],
    [8, 7.6], [1.5, 10.6], [-5.5, 13.6], [1.5, 16.6], [6.5, 19.6], [-2.5, 22.6],
];

export function skyTower(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");

    const climberScript = scriptAsset("Climber.cs", `
using UnityEngine;

// Koşma ve zıplamayı Character Controller 2D bileşeni yapar; ayarları Inspector'da:
// çift zıplama, coyote süresi, zıplama tamponu, kısa basınca alçak zıplama.
// Klavye, dokunmatik düğmeler ve gamepad "Horizontal" ile "Jump" giriş eylemlerinden gelir
// (Proje Ayarları → Girdi). Bu betik yalnızca oyunun olaylarını dinler.
public class Climber : MonoBehaviour
{
    public GameManager manager;
    [Tooltip("Hasar aldıktan sonra yeniden hasar almadan geçen süre (saniye)")]
    public float invincibleTime = 1.2f;

    private CharacterController2D controller;
    private SpriteRenderer sprite;
    private Vector3 respawnPoint;
    private float invincibleUntil;

    void Start()
    {
        controller = GetComponent<CharacterController2D>();
        sprite = GetComponent<SpriteRenderer>();
        respawnPoint = transform.position;
    }

    void Update()
    {
        // Hasardan sonra yanıp söner.
        sprite.enabled = Time.time >= invincibleUntil || Mathf.Repeat(Time.time * 12f, 1f) > 0.4f;
    }

    // Character Controller 2D zıpladığında çağırır (havadaki ikinci zıplama dahil).
    void OnJump()
    {
        Audio.Play("jump", 0.4f);
        Tween.PunchScale(transform, 0.15f, 0.18f);
    }

    // Yere inince çağırır; hız ne kadar büyükse iniş o kadar serttir.
    void OnLand(float speed)
    {
        if (speed > 13f) manager.Shake(0.1f, 0.15f);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin")) manager.CollectCoin(other.gameObject);
        else if (other.CompareTag("Hazard")) Hurt();
        else if (other.CompareTag("Respawn")) SetCheckpoint(other.transform);
        else if (other.CompareTag("Finish")) manager.ReachTop();
    }

    void SetCheckpoint(Transform flag)
    {
        Vector3 point = flag.position + new Vector3(0f, 0.3f, 0f);
        if (point == respawnPoint) return;
        respawnPoint = point;
        HUD.Show("Kontrol noktası", 1f);
        Audio.Play("powerup", 0.4f);
    }

    public void Hurt()
    {
        if (Time.time < invincibleUntil || !controller.enabled) return;
        invincibleUntil = Time.time + invincibleTime;
        manager.Shake(0.35f, 0.3f);
        Audio.Play("hit");
        if (!manager.LoseLife()) return;
        controller.Stop();
        transform.position = respawnPoint;
    }

    public void Freeze()
    {
        controller.Stop();
        controller.enabled = false;
    }
}`);

    const platformScript = scriptAsset("MovingPlatform.cs", `
using UnityEngine;

// Kinematic bir Rigidbody2D'yi iki nokta arasında gidip getirir.
// Üstündeki Character Controller 2D, platformla birlikte kendiliğinden taşınır.
public class MovingPlatform : MonoBehaviour
{
    public float speed = 2f;
    public float leftX = -1f;
    public float rightX = 5f;

    private Rigidbody2D rb;
    private int direction = 1;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void FixedUpdate()
    {
        if (transform.position.x >= rightX) direction = -1;
        else if (transform.position.x <= leftX) direction = 1;
        rb.velocity = new Vector2(speed * direction, 0f);
    }
}`);

    const managerScript = scriptAsset("GameManager.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Coin, can ve süre; ayarlar menüsü (Toggle ve Slider) ile kazanma ve kaybetme panelleri.
// Ayarlar PlayerPrefs ile kaydedilir, bir dahaki oyunda da geçerlidir.
public class GameManager : MonoBehaviour
{
    [Header("Arayüz")]
    public Text coinText;
    public Text livesText;
    public Text timeText;
    public GameObject settingsPanel;
    public Toggle shakeToggle;
    public Slider speedSlider;
    public GameObject winPanel;
    public Text winText;
    public GameObject gameOverPanel;
    public Text resultText;

    [Header("Oyun")]
    public Climber player;
    public int lives = 3;
    public int totalCoins = 12;

    private int coins;
    private float elapsed;
    private bool finished;
    private bool paused;
    private bool shake = true;
    private float speed = 1f;

    void Start()
    {
        shake = PlayerPrefs.GetBool("tower.shake", true);
        speed = PlayerPrefs.GetFloat("tower.speed", 1f);
        // Kaydedilen ayarları menüye olay tetiklemeden yaz.
        shakeToggle.SetIsOnWithoutNotify(shake);
        speedSlider.SetValueWithoutNotify(speed);
        Time.timeScale = speed;
        UpdateTexts();
        HUD.Show("Zirveye tırman!", 1.5f);
    }

    void Update()
    {
        if (finished || paused) return;
        elapsed += Time.deltaTime;
        timeText.text = "Süre: " + elapsed.ToString("F1");
    }

    public void CollectCoin(GameObject coin)
    {
        coins++;
        Destroy(coin);
        Audio.Play("coin");
        UpdateTexts();
        Tween.PunchScale(coinText, 0.3f, 0.25f);
    }

    // Can kaldıysa true döner; son can giderse oyun biter.
    public bool LoseLife()
    {
        lives--;
        UpdateTexts();
        if (lives > 0) return true;
        finished = true;
        player.Freeze();
        resultText.text = "Coin: " + coins + "/" + totalCoins + "   •   Süre: " + elapsed.ToString("F1") + " sn";
        gameOverPanel.SetActive(true);
        Audio.Play("lose");
        return false;
    }

    // Ayarlarda kapatılabilen ekran sarsıntısı.
    public void Shake(float strength, float duration)
    {
        if (shake) Camera.Shake(strength, duration);
    }

    public void ReachTop()
    {
        if (finished) return;
        finished = true;
        player.Freeze();
        float best = PlayerPrefs.GetFloat("tower.best", 0f);
        if (best <= 0f || elapsed < best) best = elapsed;
        PlayerPrefs.SetFloat("tower.best", best);
        winText.text = "Süre: " + elapsed.ToString("F1") + " sn   •   Coin: " + coins + "/" + totalCoins + "\\nRekor: " + best.ToString("F1") + " sn";
        winPanel.SetActive(true);
        Audio.Play("win");
        Shake(0.2f, 0.4f);
    }

    // "II" butonu (Esc) ve menüdeki "Devam" butonu.
    public void TogglePause()
    {
        if (finished) return;
        paused = !paused;
        settingsPanel.SetActive(paused);
        Time.timeScale = paused ? 0f : speed;
        Audio.Play("click", 0.5f);
    }

    // Toggle → On Value Changed (Inspector)
    public void SetShake(bool on)
    {
        shake = on;
        PlayerPrefs.SetBool("tower.shake", on);
        if (on) Camera.Shake(0.15f, 0.2f);
    }

    // Slider → On Value Changed (Inspector)
    public void SetSpeed(float value)
    {
        speed = value;
        PlayerPrefs.SetFloat("tower.speed", value);
        if (!paused) Time.timeScale = value;
    }

    public void Restart()
    {
        Time.timeScale = speed;
        SceneManager.ReloadScene();
    }

    void UpdateTexts()
    {
        coinText.text = "Coin: " + coins + "/" + totalCoins;
        livesText.text = "Can: " + lives;
    }
}`);

    project.scripts = [climberScript, platformScript, managerScript];

    const scene = createEmptyScene("Gök Kulesi", "2d");
    scene.settings.background = { mode: "gradient", color: "#fbcfe8", topColor: "#4c1d95" };

    const camera = camera2d(5.4, -0.5, -1);
    const ground = entity("Tower", [tilemap(TOWER_TILES, TOWER_GROUND)], { tag: "Ground" });
    const spikes = entity("Spikes", [tilemap(TOWER_HAZARDS, TOWER_SPIKES, { isTrigger: true, sortingLayer: 1 })], { tag: "Hazard" });
    const manager = entity("GameManager", []);
    const player = entity("Player", [
        sprite("#f59e0b", "roundedSquare", 5),
        createRigidBody({ freezeRotation: true, linearDamping: 0, gravityScale: 1 }),
        createCollider({ shape: "box", size: { x: 0.8, y: 0.9, z: 1 } }),
        createCharacterController2D({ moveSpeed: 7, jumpHeight: 3.3, maxJumps: 2, coyoteTime: 0.12, jumpBuffer: 0.15 }),
        script(climberScript, { manager: ref(manager) }),
    ], { position: { x: -7.5, y: -4.5 }, tag: "Player" });
    camera.components.push(createCameraFollow({
        targetId: player.id,
        offset: { x: 0, y: 1.5, z: 0 },
        smoothTime: 0.2,
        deadZone: { x: 1.5, y: 1 },
        lookAhead: 1,
        // The view stays inside the tower: walls, floor and the sky above the summit.
        useBounds: true,
        boundsMin: { x: -11, y: -6 },
        boundsMax: { x: 11, y: 26 },
    }, "2d"));

    const mover = entity("MovingPlatform", [
        sprite("#ec4899", "roundedSquare", 2),
        createRigidBody({ bodyType: "kinematic", useGravity: false, freezeRotation: true }),
        createCollider({ shape: "box" }),
        script(platformScript, { speed: 2, leftX: -1, rightX: 5 }),
    ], { position: { x: 2, y: 3.75 }, scale: { x: 3, y: 0.5 } });

    const coins = TOWER_COINS.map(([x, y]) => entity("Coin", [
        sprite("#facc15", "circle", 3),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        createAnimation({ clips: [animationPreset("bob", "2d")] }),
    ], { position: { x, y }, scale: { x: 0.5, y: 0.5 }, tag: "Coin" }));
    const checkpoint = entity("Checkpoint", [
        sprite("#22d3ee", "triangle", 3),
        createCollider({ shape: "box", size: { x: 2, y: 1, z: 1 }, isTrigger: true }),
    ], { position: { x: 6.5, y: 7.5 }, scale: { x: 0.6, y: 1 }, tag: "Respawn" });
    const goal = entity("Summit", [
        sprite("#fde047", "star", 4),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        createAnimation({ clips: [spinClip("2d", 3)] }),
    ], { position: { x: -1, y: 23 }, scale: { x: 1.4, y: 1.4 }, tag: "Finish" });

    // HUD
    const coinText = entity("CoinText", [uiText("Coin: 0/12", { anchor: "top-left", fontSize: 26 })]);
    const livesText = entity("LivesText", [uiText("Can: 3", { anchor: "top-left", fontSize: 22, offset: { x: 16, y: 52 }, color: "#fecdd3" })]);
    const timeText = entity("TimeText", [uiText("Süre: 0.0", { anchor: "top", fontSize: 22, offset: { x: 0, y: 18 } })]);
    const hint = entity("HintText", [uiText("← → koş  •  Space zıpla (havada bir kez daha)  •  Esc ayarlar  •  gamepad de çalışır", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 16 }, color: "#f8fafc", bold: false })]);
    const pauseButton = entity("PauseButton", [uiButton("II", manager, "TogglePause", { anchor: "top-right", offset: { x: 18, y: 16 }, width: 52, height: 52, fontSize: 22, color: "#4c1d95", hotkey: "Escape" })]);

    // Settings menu (inactive until paused)
    const settings = entity("SettingsPanel", [createUIPanel({ width: 460, height: 330, color: "#0f172a", opacity: 0.94, order: 50 })], { active: false });
    const settingsTitle = entity("Title", [uiText("Ayarlar", { anchor: "center", fontSize: 32, offset: { x: 0, y: -120 }, order: 55 })], { parentId: settings.id });
    const shakeToggle = entity("ShakeToggle", [createUIToggle({ isOn: true, label: "Ekran sarsıntısı", offset: { x: 0, y: -55 }, width: 300, order: 56, onValueChanged: { targetId: manager.id, method: "SetShake" } })], { parentId: settings.id });
    const speedLabel = entity("SpeedLabel", [uiText("Oyun hızı", { anchor: "center", fontSize: 18, offset: { x: 0, y: -8 }, color: "#c4b5fd", bold: false, order: 55 })], { parentId: settings.id });
    const speedSlider = entity("SpeedSlider", [createUISlider({ value: 1, min: 0.5, max: 1.25, showValue: true, offset: { x: 0, y: 26 }, width: 300, fillColor: "#ec4899", order: 56, onValueChanged: { targetId: manager.id, method: "SetSpeed" } })], { parentId: settings.id });
    const resume = entity("ResumeButton", [uiButton("Devam", manager, "TogglePause", { offset: { x: -80, y: 110 }, width: 150, height: 52, color: "#16a34a", order: 60 })], { parentId: settings.id });
    const restart = entity("RestartButton", [uiButton("Baştan", manager, "Restart", { offset: { x: 80, y: 110 }, width: 150, height: 52, color: "#6366f1", order: 60 })], { parentId: settings.id });

    const winPanel = entity("WinPanel", [createUIPanel({ width: 480, height: 290, color: "#0f172a", opacity: 0.94, order: 50 })], { active: false });
    const winTitle = entity("WinTitle", [uiText("Zirvedesin!", { anchor: "center", fontSize: 40, offset: { x: 0, y: -90 }, color: "#fde047", order: 55 })], { parentId: winPanel.id });
    const winText = entity("WinText", [uiText("", { anchor: "center", fontSize: 20, offset: { x: 0, y: -10 }, bold: false, order: 55 })], { parentId: winPanel.id });
    const again = entity("PlayAgainButton", [uiButton("Tekrar Oyna", manager, "Restart", { offset: { x: 0, y: 90 }, width: 240, height: 56, color: "#a855f7", order: 60, hotkey: "R" })], { parentId: winPanel.id });
    const over = gameOverPanel(manager, "Canın bitti", "Tekrar Dene", "#ec4899");

    manager.components.push(script(managerScript, {
        coinText: ref(coinText),
        livesText: ref(livesText),
        timeText: ref(timeText),
        settingsPanel: ref(settings),
        shakeToggle: ref(shakeToggle),
        speedSlider: ref(speedSlider),
        winPanel: ref(winPanel),
        winText: ref(winText),
        gameOverPanel: ref(over.panel),
        resultText: ref(over.result),
        player: ref(player),
        totalCoins: TOWER_COINS.length,
    }));

    scene.objects.push(
        camera, ground, spikes, mover, ...coins, checkpoint, goal, player, manager,
        coinText, livesText, timeText, hint, pauseButton,
        settings, settingsTitle, shakeToggle, speedLabel, speedSlider, resume, restart,
        winPanel, winTitle, winText, again, ...over.entities,
    );
    return finishProject(project, scene, "sky-tower-2d");
}

// ---------------------------------------------------------------------------
// V4: Maze Hunt (Nav Agent 2D, Pathfinding, input actions)
// ---------------------------------------------------------------------------

/** Top row first; "#" wall, "." gem, "C" crystal, "P" player, "G" ghost home. Column c is x = c − 10, row r is y = 6 − r. */
const MAZE = [
    "#####################",
    "#C........#........C#",
    "#.##.###..#..###.##.#",
    "#...................#",
    "#.##.#.#######.#.##.#",
    "#....#....#....#....#",
    "####.###..G..###.####",
    "#........###........#",
    "#.##.###.....###.##.#",
    "#..#.....#.#.....#..#",
    "##.#.#.#######.#.#.##",
    "#C...#....#.P..#...C#",
    "#####################",
];

const MAZE_TILES: TileDefinition[] = [{ key: "#", name: "Duvar", color: "#4c1d95", solid: true, frame: -1 }];
/** A faceted gem on a transparent 32 × 32 image; the gem tiles draw it tinted with their color. */
const GEM_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR42u2U0QmAIBRF+3cbp3Eal9E1nMRf97g9oUBEo0gN4h643+cg9baNEELICwCkGGP6QqxwIAHn1Cq5RkERkKdnyw0qqoA8M0tu0aARkGdHyz06dALy/LCAEIKXoTXnXG9+6CuIzD4IsFO+AxGaGwFm6p8gUn0RoJfcAhGrRoBafhElIIl4/SkmhJBfsQPVylXYOBFYGQAAAABJRU5ErkJggg==";
const GEM_TILES: TileDefinition[] = [{ key: "o", name: "Gem", color: "#fde047", solid: false, frame: 0 }];

/** Runs of the same character in each row become one fill. */
function mazeFills(match: string, key: string): TileFill[] {
    const fills: TileFill[] = [];
    MAZE.forEach((row, r) => {
        const y = 6 - r;
        let start = -1;
        for (let c = 0; c <= row.length; c += 1) {
            const hit = c < row.length && row[c] === match;
            if (hit && start < 0) start = c;
            if (!hit && start >= 0) {
                fills.push([start - 10, y, c - 1 - 10, y, key]);
                start = -1;
            }
        }
    });
    return fills;
}

/** Centers of the cells holding a character. */
function mazeCells(match: string): Array<{ x: number; y: number }> {
    const cells: Array<{ x: number; y: number }> = [];
    MAZE.forEach((row, r) => {
        for (let c = 0; c < row.length; c += 1) if (row[c] === match) cells.push({ x: c - 10 + 0.5, y: 6 - r + 0.5 });
    });
    return cells;
}

export function mazeHunt(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    // The whole maze is on screen: wider or narrower screens get bars instead of cut-off walls.
    project.settings.aspect = "16:9";
    // A custom input action: H on the keyboard, Y on a gamepad (Project Settings → Input).
    project.settings.input.actions.push({ name: "Hint", kind: "button", positive: ["H"], negative: [], gamepadPositive: ["Y"], gamepadNegative: [], gamepadAxis: null, invert: false });

    const explorerScript = scriptAsset("Explorer.cs", `
using UnityEngine;

// Labirentte yürür, gem toplar, kristalle hayaletleri kaçırır.
// "Horizontal" ve "Vertical" giriş eylemleri klavyeyi (WASD / ok tuşları),
// dokunmatik düğmeleri ve gamepad'in sol çubuğu ile d-pad'ini birlikte okur.
public class Explorer : MonoBehaviour
{
    public float speed = 5f;
    public Tilemap gems;
    public MazeManager manager;

    private Rigidbody2D rb;
    private Vector3 home;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        home = transform.position;
    }

    void Update()
    {
        if (!manager.playing)
        {
            rb.velocity = Vector2.zero;
            return;
        }
        float h = Input.GetAxisRaw("Horizontal");
        float v = Input.GetAxisRaw("Vertical");
        // Koridorlarda kaymadan dönmek için diğer ekseni hücrenin ortasına çeker.
        Vector3 p = transform.position;
        float centerX = Mathf.Floor(p.x) + 0.5f;
        float centerY = Mathf.Floor(p.y) + 0.5f;
        if (Mathf.Abs(h) >= Mathf.Abs(v) && h != 0) rb.velocity = new Vector2(Mathf.Sign(h) * speed, (centerY - p.y) * 12f);
        else if (v != 0) rb.velocity = new Vector2((centerX - p.x) * 12f, Mathf.Sign(v) * speed);
        else rb.velocity = Vector2.zero;

        // Üstünde durduğun hücrede gem varsa al (gem'ler ayrı bir Tilemap'te).
        Vector3 cell = gems.WorldToCell(p);
        if (gems.HasTile((int)cell.x, (int)cell.y))
        {
            gems.SetTile((int)cell.x, (int)cell.y, null);
            manager.GemTaken();
        }

        // Özel giriş eylemi: H tuşu ya da gamepad'de Y.
        if (Input.GetButtonDown("Hint")) ShowHint();
    }

    // En yakın gem'e A* ile en kısa yolu bulur ve 2 saniye boyunca çizer.
    public void ShowHint()
    {
        Vector3 target = Vector3.zero;
        float best = 1e9f;
        for (int x = -10; x <= 10; x++)
        {
            for (int y = -6; y <= 6; y++)
            {
                if (!gems.HasTile(x, y)) continue;
                Vector3 center = gems.GetCellCenterWorld(x, y);
                float d = Vector3.Distance(center, transform.position);
                if (d < best)
                {
                    best = d;
                    target = center;
                }
            }
        }
        if (best >= 1e9f) return;
        var path = Pathfinding.FindPath(transform.position, target);
        for (int i = 1; i < path.Count; i++) Debug.DrawLine(path[i - 1], path[i], Color.yellow, 2f);
        HUD.Show("En yakın gem: " + path.Count + " köşe", 1.2f);
        Audio.Play("blip", 0.5f);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (!manager.playing) return;
        if (other.CompareTag("PowerUp"))
        {
            Destroy(other.gameObject);
            manager.CrystalTaken();
        }
        else if (other.CompareTag("Enemy"))
        {
            Ghost ghost = other.GetComponent<Ghost>();
            if (ghost.frightened) ghost.Eaten();
            else manager.Caught();
        }
    }

    public void ResetPosition()
    {
        transform.position = home;
        rb.velocity = Vector2.zero;
    }
}`);

    const ghostScript = scriptAsset("Ghost.cs", `
using UnityEngine;

// Hayaletleri Nav Agent 2D yürütür: duvarların etrafından A* ile bulunan yolu izler.
// Kovalayan hayaletin Inspector'daki "Target" alanı oyuncudur; diğerleri SetDestination kullanır.
public enum GhostMode { Chase, Ambush, Patrol }

public class Ghost : MonoBehaviour
{
    public GhostMode mode = GhostMode.Chase;
    public Transform player;
    public Color color = Color.red;
    [Tooltip("Oyunun başında evde bekleme süresi (saniye)")]
    public float releaseDelay = 1f;
    public bool frightened;

    private NavAgent2D agent;
    private SpriteRenderer sprite;
    private Vector3 home;
    private float frightenedUntil;
    private float nextThink;
    private int patrolIndex;
    private Vector2[] corners = { new Vector2(-8.5f, 5.5f), new Vector2(9.5f, 5.5f), new Vector2(9.5f, -4.5f), new Vector2(-8.5f, -4.5f) };

    void Start()
    {
        agent = GetComponent<NavAgent2D>();
        sprite = GetComponent<SpriteRenderer>();
        home = transform.position;
        sprite.color = color;
        agent.isStopped = true;
        if (mode == GhostMode.Patrol) agent.SetDestination(corners[0]);
    }

    void Update()
    {
        // Evden sırayla çıkarlar.
        if (agent.isStopped && Time.timeSinceLevelLoad >= releaseDelay) agent.isStopped = false;
        if (frightened)
        {
            // Kaçarken mavi; süre bitmeye yakın yanıp söner.
            float left = frightenedUntil - Time.time;
            sprite.color = left < 1.5f && Mathf.Repeat(Time.time * 6f, 1f) > 0.5f ? Color.white : new Color(0.25f, 0.4f, 1f);
            if (left <= 0f) Calm();
            return;
        }
        if (mode == GhostMode.Ambush && Time.time >= nextThink)
        {
            // Oyuncunun gittiği yönün birkaç kare önünü hedefler.
            nextThink = Time.time + 0.5f;
            Rigidbody2D body = player.GetComponent<Rigidbody2D>();
            Vector3 ahead = player.position + (Vector3)(body.velocity.normalized * 3f);
            agent.SetDestination(Pathfinding.IsWalkable(ahead) ? ahead : player.position);
        }
    }

    // Nav Agent 2D hedefe varınca çağırır: devriye sıradaki köşeye geçer.
    void OnDestinationReached()
    {
        if (mode == GhostMode.Patrol && !frightened)
        {
            patrolIndex = (patrolIndex + 1) % corners.Length;
            agent.SetDestination(corners[patrolIndex]);
        }
    }

    public void Frighten(float seconds)
    {
        frightened = true;
        frightenedUntil = Time.time + seconds;
        agent.target = null;
        agent.speed = 2f;
        // Oyuncudan en uzak köşeye kaç.
        Vector2 far = corners[0];
        foreach (Vector2 corner in corners)
        {
            if (Vector2.Distance(corner, player.position) > Vector2.Distance(far, player.position)) far = corner;
        }
        agent.SetDestination(far);
    }

    void Calm()
    {
        frightened = false;
        sprite.color = color;
        agent.speed = mode == GhostMode.Chase ? 3.2f : 3f;
        if (mode == GhostMode.Chase) agent.target = player;
        else if (mode == GhostMode.Patrol) agent.SetDestination(corners[patrolIndex]);
    }

    public void Eaten()
    {
        Audio.Play("powerup");
        FindObjectOfType<MazeManager>().AddScore(200);
        agent.Warp(home);
        Calm();
    }

    public void ResetGhost()
    {
        agent.Warp(home);
        Calm();
    }
}`);

    const managerScript = scriptAsset("MazeManager.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Puan, can, kalan gem'ler, kristal süresi ve oyun sonu.
public class MazeManager : MonoBehaviour
{
    public Tilemap gems;
    public Explorer player;
    public Text scoreText;
    public Text livesText;
    public Text gemsText;
    public GameObject winPanel;
    public Text winText;
    public GameObject gameOverPanel;
    public Text resultText;
    public float crystalSeconds = 6f;
    public int lives = 3;
    public bool playing = true;

    private int score;

    void Start()
    {
        UpdateTexts();
        HUD.Show("Bütün gem'leri topla! (H: ipucu)", 2f);
    }

    public void GemTaken()
    {
        AddScore(10);
        Audio.Play("blip", 0.25f);
        if (gems.CountTiles("Gem") == 0) Win();
    }

    public void AddScore(int amount)
    {
        score += amount;
        UpdateTexts();
    }

    public void CrystalTaken()
    {
        AddScore(50);
        Audio.Play("powerup");
        Camera.Shake(0.15f, 0.25f);
        foreach (Ghost ghost in FindObjectsOfType<Ghost>()) ghost.Frighten(crystalSeconds);
    }

    public void Caught()
    {
        lives--;
        Audio.Play("hit");
        Camera.Shake(0.4f, 0.35f);
        UpdateTexts();
        if (lives <= 0)
        {
            playing = false;
            resultText.text = "Puan: " + score + "   •   Kalan gem: " + gems.CountTiles("Gem");
            gameOverPanel.SetActive(true);
            Audio.Play("lose");
            return;
        }
        player.ResetPosition();
        foreach (Ghost ghost in FindObjectsOfType<Ghost>()) ghost.ResetGhost();
    }

    void Win()
    {
        playing = false;
        int best = Mathf.Max(score, PlayerPrefs.GetInt("maze.best", 0));
        PlayerPrefs.SetInt("maze.best", best);
        winText.text = "Puan: " + score + "   •   Rekor: " + best;
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
        livesText.text = "Can: " + lives;
        gemsText.text = "Gem: " + gems.CountTiles("Gem");
    }
}`);

    project.scripts = [explorerScript, ghostScript, managerScript];

    const scene = createEmptyScene("Labirent", "2d");
    scene.settings.background = { mode: "solid", color: "#0b0420", topColor: "#0b0420" };

    const camera = camera2d(6.8, 0.5, 0.5);
    const walls = entity("Maze", [tilemap(MAZE_TILES, mazeFills("#", "#"))], { tag: "Ground" });
    // Gems are tiles too (Tilemap.HasTile / SetTile / CountTiles); their atlas is the small gem image.
    const gemImage = { id: createEngineId("texture"), name: "Gem", dataUrl: GEM_IMAGE, width: 32, height: 32, filter: "linear" as const };
    project.textures = [gemImage];
    const gems = entity("Gems", [tilemap(GEM_TILES, mazeFills(".", "o"), { sortingLayer: 1, atlas: { textureId: gemImage.id, columns: 1, rows: 1 } })]);
    const manager = entity("MazeManager", []);
    const start = mazeCells("P")[0];
    const player = entity("Player", [
        sprite("#facc15", "circle", 5),
        createRigidBody({ useGravity: false, gravityScale: 0, freezeRotation: true, linearDamping: 0 }),
        createCollider({ shape: "circle", radius: 0.5, friction: 0 }),
        script(explorerScript, { gems: ref(gems), manager: ref(manager) }),
    ], { position: { x: start.x, y: start.y }, scale: { x: 0.7, y: 0.7 }, tag: "Player" });

    const home = mazeCells("G")[0];
    const ghostSpecs: Array<{ name: string; mode: number; color: string; dx: number; chase: boolean; delay: number }> = [
        { name: "Kızıl", mode: 0, color: "#ef4444", dx: 0, chase: true, delay: 1.5 },
        { name: "Mor", mode: 1, color: "#d946ef", dx: -1, chase: false, delay: 4 },
        { name: "Turuncu", mode: 2, color: "#fb923c", dx: 1, chase: false, delay: 7 },
    ];
    const ghosts = ghostSpecs.map((spec) => entity(spec.name, [
        sprite(spec.color, "roundedSquare", 4),
        createRigidBody({ bodyType: "kinematic", useGravity: false, freezeRotation: true }),
        createCollider({ shape: "circle", radius: 0.45, isTrigger: true }),
        createNavAgent2D({ speed: spec.chase ? 3.2 : 3, radius: 0.3, repathInterval: 0.3, targetId: spec.chase ? player.id : null, flipSprite: false }),
        script(ghostScript, { mode: spec.mode, player: ref(player), color: spec.color, releaseDelay: spec.delay }),
    ], { position: { x: home.x + spec.dx, y: home.y }, scale: { x: 0.8, y: 0.8 }, tag: "Enemy" }));

    const crystals = mazeCells("C").map((cell) => entity("Crystal", [
        sprite("#22d3ee", "diamond", 3),
        createCollider({ shape: "circle", radius: 0.4, isTrigger: true }),
        createAnimation({ clips: [animationPreset("pulse", "2d")] }),
    ], { position: cell, scale: { x: 0.6, y: 0.6 }, tag: "PowerUp" }));

    const scoreText = entity("ScoreText", [uiText("Puan: 0", { anchor: "top-left", fontSize: 24 })]);
    const gemsText = entity("GemsText", [uiText(`Gem: ${mazeCells(".").length}`, { anchor: "top", fontSize: 22, offset: { x: 0, y: 14 }, color: "#fde047" })]);
    const livesText = entity("LivesText", [uiText("Can: 3", { anchor: "top-right", fontSize: 24, color: "#fecdd3" })]);
    const hint = entity("HintText", [uiText("WASD / ok tuşları / sol çubuk: yürü  •  mavi kristal: hayaletler kaçar  •  H ya da Y: ipucu", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 10 }, color: "#e9d5ff", bold: false })]);

    const winPanel = entity("WinPanel", [createUIPanel({ width: 460, height: 270, color: "#0f172a", opacity: 0.94, order: 50 })], { active: false });
    const winTitle = entity("WinTitle", [uiText("Labirent temizlendi!", { anchor: "center", fontSize: 34, offset: { x: 0, y: -80 }, color: "#fde047", order: 55 })], { parentId: winPanel.id });
    const winText = entity("WinText", [uiText("", { anchor: "center", fontSize: 20, offset: { x: 0, y: -10 }, bold: false, order: 55 })], { parentId: winPanel.id });
    const again = entity("PlayAgainButton", [uiButton("Tekrar Oyna", manager, "Restart", { offset: { x: 0, y: 80 }, width: 240, height: 56, color: "#a855f7", order: 60, hotkey: "R" })], { parentId: winPanel.id });
    const over = gameOverPanel(manager, "Yakalandın!", "Tekrar Dene", "#ec4899");

    manager.components.push(script(managerScript, {
        gems: ref(gems),
        player: ref(player),
        scoreText: ref(scoreText),
        livesText: ref(livesText),
        gemsText: ref(gemsText),
        winPanel: ref(winPanel),
        winText: ref(winText),
        gameOverPanel: ref(over.panel),
        resultText: ref(over.result),
    }));

    scene.objects.push(
        camera, walls, gems, ...crystals, player, ...ghosts, manager,
        scoreText, gemsText, livesText, hint, winPanel, winTitle, winText, again, ...over.entities,
    );
    return finishProject(project, scene, "maze-hunt-2d");
}

// ---------------------------------------------------------------------------
// V4: Slingshot (spring and distance joints, slider, toggle and input field)
// ---------------------------------------------------------------------------

const SLING_GROUND: TileFill[] = [[-12, -6, 22, -5, "#"], [9, -4, 9, -4, "#"], [14, -4, 15, -3, "#"]];
const SLING_TILES: TileDefinition[] = [{ key: "#", name: "Toprak", color: "#7c2d12", solid: true, frame: -1 }];
/** Crates (x, y of the center) and the slimes standing on them. */
const SLING_CRATES: Array<[number, number]> = [[7.5, -3.5], [7.5, -2.5], [11.5, -3.5], [12.5, -3.5], [12, -2.5], [16.5, -3.5], [16.5, -2.5], [16.5, -1.5]];
const SLING_SLIMES: Array<[number, number]> = [[7.5, -1.6], [10.5, -3.6], [12, -1.6], [14.8, -1.6], [16.5, -0.6]];

export function slingshot(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    project.settings.touchControls = false;
    // The sling and the last crate both stay on screen.
    project.settings.aspect = "16:9";

    const slingScript = scriptAsset("Slingshot.cs", `
using UnityEngine;

// Topu fareyle (ya da parmakla) geri çek ve bırak. Topu sapana bir Spring Joint 2D bağlar:
// bırakınca yay topu sapana doğru hızlandırır; sapanı geçtiği an eklem kapanır ve top uçar.
public class Slingshot : MonoBehaviour
{
    public Transform anchor;
    public LevelManager manager;
    [Tooltip("Topun en fazla ne kadar geri çekilebileceği")]
    public float maxStretch = 2.2f;
    public bool showAim = true;

    private Rigidbody2D rb;
    private SpringJoint2D spring;
    private bool dragging;
    private bool flying;
    private float flightTime;
    private float stillTime;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        spring = GetComponent<SpringJoint2D>();
        Ready();
    }

    void Update()
    {
        if (!manager.playing) return;
        Vector3 mouse = Camera.main.ScreenToWorldPoint(Input.mousePosition);
        mouse.z = 0f;
        if (!flying && !dragging && Input.GetMouseButtonDown(0) && Vector2.Distance(mouse, transform.position) < 1.2f)
        {
            dragging = true;
            Audio.Play("click", 0.4f);
        }
        if (dragging)
        {
            // Sapandan en fazla maxStretch kadar uzağa çek.
            Vector3 pull = Vector3.ClampMagnitude(mouse - anchor.position, maxStretch);
            transform.position = anchor.position + pull;
            if (showAim) DrawAim(-pull);
            if (Input.GetMouseButtonUp(0)) Release();
        }
    }

    void FixedUpdate()
    {
        if (!flying) return;
        flightTime += Time.fixedDeltaTime;
        // Top sapanı geçince yayı bırak: artık serbestçe uçar.
        if (spring.enabled && transform.position.x > anchor.position.x) spring.enabled = false;
        stillTime = rb.velocity.magnitude < 0.25f ? stillTime + Time.fixedDeltaTime : 0f;
        bool gone = transform.position.y < -8f || transform.position.x > 26f || transform.position.x < -14f;
        if (gone || stillTime > 0.6f || flightTime > 7f)
        {
            flying = false;
            manager.ShotFinished();
        }
    }

    void Release()
    {
        dragging = false;
        flying = true;
        flightTime = 0f;
        stillTime = 0f;
        rb.isKinematic = false;
        manager.ShotFired();
        Audio.Play("shoot");
    }

    // Yeni atış: top sapana döner, yay yeniden bağlanır.
    public void Ready()
    {
        flying = false;
        dragging = false;
        rb.isKinematic = true;
        rb.velocity = Vector2.zero;
        transform.position = anchor.position;
        spring.enabled = true;
    }

    // Slider → On Value Changed: yayın sertliği (frekansı).
    public void SetPower(float value)
    {
        spring.frequency = value;
    }

    // Toggle → On Value Changed
    public void SetAim(bool on)
    {
        showAim = on;
    }

    // Bırakınca topun izleyeceği yol: yayın hızı yaklaşık 2π·frekans·gerilme.
    void DrawAim(Vector3 direction)
    {
        Vector2 velocity = direction * (2f * Mathf.PI * spring.frequency);
        Vector2 point = anchor.position;
        float gravity = Physics2D.gravity.y * rb.gravityScale;
        for (int i = 0; i < 18; i++)
        {
            Vector2 next = point + velocity * 0.06f;
            velocity.y += gravity * 0.06f;
            Debug.DrawLine(point, next, i % 2 == 0 ? Color.white : new Color(1f, 1f, 1f, 0.3f));
            point = next;
        }
    }
}`);

    const slimeScript = scriptAsset("Slime.cs", `
using UnityEngine;

// Yeterince sert bir çarpışmada ya da sahneden düşünce patlar.
public class Slime : MonoBehaviour
{
    public float toughness = 3.2f;
    private bool popped;

    void OnCollisionEnter2D(Collision2D collision)
    {
        if (collision.relativeVelocity.magnitude >= toughness) Pop();
    }

    void Update()
    {
        if (transform.position.y < -7f) Pop();
    }

    public void Pop()
    {
        if (popped) return;
        popped = true;
        FindObjectOfType<LevelManager>().SlimePopped(transform.position);
        Destroy(gameObject);
    }
}`);

    const levelScript = scriptAsset("LevelManager.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Atışlar, puan, patlayan balçıklar ve rekor tablosu.
// Oyun bitince adını yazarsın (Input Field → On End Edit) ve en iyi üç skor kaydedilir.
public class LevelManager : MonoBehaviour
{
    public Slingshot ball;
    public GameObject popEffect;
    public Text scoreText;
    public Text shotsText;
    public GameObject endPanel;
    public Text endTitle;
    public Text endText;
    public Text boardText;
    public InputField nameField;
    public int shots = 4;
    public bool playing = true;

    private int score;
    private int slimes;

    void Start()
    {
        slimes = FindObjectsOfType<Slime>().Length;
        UpdateTexts();
        HUD.Show("Topu geri çek ve bırak!", 2f);
    }

    void Update()
    {
        // Oyun sürerken R baştan başlatır; bitince "Tekrar Oyna" düğmesinin kısayolu da R.
        if (playing && Input.GetKeyDown(KeyCode.R)) Restart();
    }

    public void SlimePopped(Vector3 position)
    {
        slimes--;
        score += 500;
        Instantiate(popEffect, position, Quaternion.identity);
        Audio.Play("explosion", 0.6f);
        Camera.Shake(0.2f, 0.2f);
        UpdateTexts();
        if (slimes <= 0 && playing) Invoke("Finish", 0.8f);
    }

    public void ShotFired()
    {
        shots--;
        UpdateTexts();
    }

    // Top durunca, sahneden çıkınca ya da 7 saniye sonra çağrılır.
    public void ShotFinished()
    {
        if (!playing || slimes <= 0) return;
        if (shots <= 0) Invoke("Finish", 0.5f);
        else ball.Ready();
    }

    void Finish()
    {
        if (!playing) return;
        playing = false;
        bool won = slimes <= 0;
        if (won) score += shots * 300;
        UpdateTexts();
        endTitle.text = won ? "Hepsi patladı!" : "Atış kalmadı";
        endText.text = "Puan: " + score + (won ? "   •   kalan atış başına +300" : "   •   kalan balçık: " + slimes);
        endPanel.SetActive(true);
        ShowBoard();
        nameField.ActivateInputField();
        Audio.Play(won ? "win" : "lose");
    }

    // Input Field → On End Edit (Enter'a basınca ya da alandan çıkınca)
    public void SaveName(string playerName)
    {
        string name = playerName.Trim();
        if (name.Length == 0) return;
        // "ad:puan" kayıtlarını virgülle tutar, en iyi üçü kalır.
        string saved = PlayerPrefs.GetString("sling.board", "");
        string[] entries = saved.Length > 0 ? saved.Split(',') : new string[0];
        string board = "";
        bool placed = false;
        int count = 0;
        foreach (string entry in entries)
        {
            int points = int.Parse(entry.Substring(entry.LastIndexOf(':') + 1));
            if (!placed && score > points && count < 3)
            {
                board += (count > 0 ? "," : "") + name + ":" + score;
                placed = true;
                count++;
            }
            if (count < 3)
            {
                board += (count > 0 ? "," : "") + entry;
                count++;
            }
        }
        if (!placed && count < 3) board += (count > 0 ? "," : "") + name + ":" + score;
        PlayerPrefs.SetString("sling.board", board);
        nameField.interactable = false;
        ShowBoard();
        Audio.Play("powerup", 0.5f);
    }

    void ShowBoard()
    {
        string saved = PlayerPrefs.GetString("sling.board", "");
        if (saved.Length == 0)
        {
            boardText.text = "Rekor tablosu boş: ilk sen ol!";
            return;
        }
        string text = "";
        string[] entries = saved.Split(',');
        for (int i = 0; i < entries.Length; i++)
        {
            int colon = entries[i].LastIndexOf(':');
            text += (i + 1) + ". " + entries[i].Substring(0, colon) + " — " + entries[i].Substring(colon + 1) + "\\n";
        }
        boardText.text = text;
    }

    public void Restart()
    {
        SceneManager.ReloadScene();
    }

    void UpdateTexts()
    {
        scoreText.text = "Puan: " + score;
        shotsText.text = "Atış: " + shots + "   •   Balçık: " + slimes;
    }
}`);

    const swingScript = scriptAsset("Swing.cs", `
using UnityEngine;

// Distance Joint 2D ile tavana asılı yıkım topu: başta bir itiş alır ve sallanır.
public class Swing : MonoBehaviour
{
    public float push = 6f;

    void Start()
    {
        GetComponent<Rigidbody2D>().velocity = new Vector2(push, 0f);
    }
}`);

    project.scripts = [slingScript, slimeScript, levelScript, swingScript];

    const scene = createEmptyScene("Sapan", "2d");
    scene.settings.background = { mode: "gradient", color: "#fde68a", topColor: "#7c3aed" };

    const camera = camera2d(6.2, 4, 0.6);
    const ground = entity("Ground", [tilemap(SLING_TILES, SLING_GROUND)], { tag: "Ground" });
    const manager = entity("LevelManager", []);
    const anchor = entity("SlingAnchor", [sprite("#78350f", "triangle", 1)], { position: { x: -5, y: -2.2 }, scale: { x: 0.9, y: 1.4 } });
    const ball = entity("Ball", [
        sprite("#f43f5e", "circle", 6),
        createRigidBody({ bodyType: "kinematic", mass: 1, gravityScale: 1, linearDamping: 0.02, freezeRotation: true }),
        createCollider({ shape: "circle", radius: 0.5, bounciness: 0.2, friction: 0.5 }),
        createJoint({ kind: "spring", connectedId: anchor.id, autoDistance: false, distance: 0.05, frequency: 1, dampingRatio: 0.05, lineColor: "#78350f" }),
        script(slingScript, { anchor: ref(anchor), manager: ref(manager) }),
    ], { position: { x: -5, y: -2.2 }, scale: { x: 0.7, y: 0.7 }, tag: "Player" });

    const crates = SLING_CRATES.map(([x, y]) => entity("Crate", [
        sprite("#d97706", "roundedSquare", 2),
        createRigidBody({ mass: 0.6, freezeRotation: true, linearDamping: 0.05 }),
        createCollider({ shape: "box", friction: 0.6 }),
    ], { position: { x, y }, scale: { x: 0.95, y: 0.95 } }));
    const slimes = SLING_SLIMES.map(([x, y]) => entity("Slime", [
        sprite("#22c55e", "circle", 3),
        createRigidBody({ mass: 0.4, freezeRotation: true }),
        createCollider({ shape: "circle", radius: 0.5, friction: 0.6 }),
        script(slimeScript),
    ], { position: { x, y }, scale: { x: 0.8, y: 0.7 }, tag: "Enemy" }));

    const pivot = entity("SwingPivot", [sprite("#334155", "circle", 1)], { position: { x: 3.5, y: 4.5 }, scale: { x: 0.3, y: 0.3 } });
    const wreckingBall = entity("WreckingBall", [
        sprite("#475569", "circle", 4),
        createRigidBody({ mass: 4, gravityScale: 1, linearDamping: 0, freezeRotation: true }),
        createCollider({ shape: "circle", radius: 0.5, bounciness: 0.1 }),
        createJoint({ kind: "distance", connectedId: pivot.id, autoDistance: true, lineColor: "#cbd5e1" }),
        script(swingScript, { push: 5 }),
    ], { position: { x: 3.5, y: 1 }, scale: { x: 1.1, y: 1.1 } });

    const autoDestroy = scriptAsset("AutoDestroy.cs", AUTO_DESTROY);
    project.scripts.push(autoDestroy);
    const popEffect = prefab("Pop", entity("Pop", [burst(["#bbf7d0", "#16a34a"], 26, 4, 0.22, 1), script(autoDestroy, { lifetime: 1 })]));
    project.prefabs.push(popEffect);

    const powerLabel = entity("PowerLabel", [uiText("Güç", { anchor: "top-left", fontSize: 18, offset: { x: 16, y: 14 }, color: "#f8fafc" })]);
    const powerSlider = entity("PowerSlider", [createUISlider({ value: 1, min: 0.7, max: 1.4, showValue: true, anchor: "top-left", offset: { x: 70, y: 12 }, width: 220, fillColor: "#f43f5e", onValueChanged: { targetId: ball.id, method: "SetPower" } })]);
    const aimToggle = entity("AimToggle", [createUIToggle({ isOn: true, label: "Nişan çizgisi", anchor: "top-left", offset: { x: 16, y: 52 }, width: 230, fontSize: 18, onValueChanged: { targetId: ball.id, method: "SetAim" } })]);
    const scoreText = entity("ScoreText", [uiText("Puan: 0", { anchor: "top-right", fontSize: 24 })]);
    const shotsText = entity("ShotsText", [uiText("Atış: 4", { anchor: "top-right", fontSize: 18, offset: { x: 16, y: 52 }, color: "#fef3c7", bold: false })]);
    const hint = entity("HintText", [uiText("Topu fareyle ya da parmağınla geri çek ve bırak  •  R: yeniden başla", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 12 }, color: "#fffbeb", bold: false })]);

    const endPanel = entity("EndPanel", [createUIPanel({ width: 500, height: 420, color: "#0f172a", opacity: 0.95, order: 50 })], { active: false });
    const endTitle = entity("EndTitle", [uiText("", { anchor: "center", fontSize: 36, offset: { x: 0, y: -160 }, color: "#fde047", order: 55 })], { parentId: endPanel.id });
    const endText = entity("EndText", [uiText("", { anchor: "center", fontSize: 18, offset: { x: 0, y: -110 }, bold: false, order: 55 })], { parentId: endPanel.id });
    const nameField = entity("NameField", [createUIInputField({ placeholder: "Adın (Enter ile kaydet)", characterLimit: 12, offset: { x: 0, y: -55 }, width: 320, order: 56, onEndEdit: { targetId: manager.id, method: "SaveName" } })], { parentId: endPanel.id });
    const boardText = entity("BoardText", [uiText("", { anchor: "center", fontSize: 18, offset: { x: 0, y: 40 }, color: "#c4b5fd", bold: false, order: 55 })], { parentId: endPanel.id });
    const again = entity("RestartButton", [uiButton("Tekrar Oyna", manager, "Restart", { offset: { x: 0, y: 150 }, width: 240, height: 56, color: "#f43f5e", order: 60, hotkey: "R" })], { parentId: endPanel.id });

    manager.components.push(script(levelScript, {
        ball: ref(ball),
        popEffect: prefabRef(popEffect),
        scoreText: ref(scoreText),
        shotsText: ref(shotsText),
        endPanel: ref(endPanel),
        endTitle: ref(endTitle),
        endText: ref(endText),
        boardText: ref(boardText),
        nameField: ref(nameField),
    }));

    scene.objects.push(
        camera, ground, anchor, pivot, wreckingBall, ...crates, ...slimes, ball, manager,
        powerLabel, powerSlider, aimToggle, scoreText, shotsText, hint,
        endPanel, endTitle, endText, nameField, boardText, again,
    );
    return finishProject(project, scene, "slingshot-2d");
}
