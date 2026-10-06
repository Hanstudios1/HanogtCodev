/**
 * The V5 starter projects: a two-player duel on one keyboard (Player Input),
 * a dungeon escape whose hero runs on an Animator state machine and saves
 * its progress, and a retro meteor shooter with switchable screen effects.
 * All three speak Turkish and English, and report to Arcade leaderboards and
 * achievements.
 */
import {
    createAnimation,
    createAnimator,
    createAnimatorState,
    createAnimatorTransition,
    createCameraFollow,
    createCharacterController2D,
    createCollider,
    createPlayerInput,
    createRigidBody,
    createUIPanel,
    createUIToggle,
} from "../components";
import { createBlankProject, createEmptyScene } from "../scene";
import type { AnimationClip, AnimationKey, AnimatorCondition, GameProjectDocument, LocalizationEntry, PostProcessingSettings, TileDefinition } from "../types";
import { camera2d, entity, finishProject, gameOverPanel, prefab, prefabRef, ref, script, scriptAsset, sprite, spinClip, tilemap, uiButton, uiText, type TileFill } from "./builders";

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const key = (time: number, value: AnimationKey["value"], easing: AnimationKey["easing"] = "linear"): AnimationKey => ({ time, value, easing });
const scaleClip = (name: string, duration: number, wrap: AnimationClip["wrap"], keys: Array<[number, number, number]>): AnimationClip => ({
    name,
    duration,
    wrap,
    tracks: [{ property: "scale", keys: keys.map(([time, x, y]) => key(time, { x, y, z: 1 }, "inOutSine")) }],
});

/** Texts of the game in Turkish and English (Project settings → Languages). */
function strings(table: Record<string, [string, string]>): LocalizationEntry[] {
    return Object.entries(table).map(([entryKey, [tr, en]]) => ({ key: entryKey, values: { tr, en } }));
}

function localized(project: GameProjectDocument, table: Record<string, [string, string]>) {
    project.settings.localization = { languages: ["tr", "en"], startLanguage: "auto", entries: strings(table) };
}

/** A UI text that shows a string of the table (and follows the language). */
function keyedText(text: string, localizationKey: string, anchor: Parameters<typeof uiText>[1] = {}) {
    const component = uiText(text, anchor);
    component.localizationKey = localizationKey;
    return component;
}

function effects(scene: { settings: { postProcessing: PostProcessingSettings } }, change: (effects: PostProcessingSettings) => void) {
    change(scene.settings.postProcessing);
}

// ---------------------------------------------------------------------------
// V5: Star Duel (Player Input, Animator, Localization, SaveSystem, Arcade)
// ---------------------------------------------------------------------------

/** Where the star goes, in turn (the same for every match, fair for both sides). */
const DUEL_POINTS: Array<[number, number]> = [
    [0, 0], [-5, 2.5], [5, -2.5], [-3, -3], [3, 3], [-6.5, -1], [6.5, 1], [0, 3.2], [0, -3.2], [-2, 1.2],
    [2, -1.2], [-6, 3], [6, -3], [-4.5, 0], [4.5, 0], [0, 1.8], [-1.5, -2], [1.5, 2], [-7, -3.2], [7, 3.2],
];

const DUEL_TEXT: Record<string, [string, string]> = {
    title: ["Yıldız Düellosu", "Star Duel"],
    hint: ["Mavi: WASD + Space (atıl)  ·  Pembe: oklar + Enter  ·  İlk 10 yıldızı toplayan kazanır", "Blue: WASD + Space (dash)  ·  Pink: arrows + Enter  ·  First to 10 stars wins"],
    time: ["Süre: {0} sn", "Time: {0} s"],
    stats: ["Galibiyetler · Mavi {0} – {1} Pembe", "Wins · Blue {0} – {1} Pink"],
    blue_wins: ["Mavi kazandı!", "Blue wins!"],
    pink_wins: ["Pembe kazandı!", "Pink wins!"],
    result: ["Süre: {0} sn · Rekor: {1} sn", "Time: {0} s · Best: {1} s"],
    over: ["Düello bitti", "Duel over"],
    again: ["Yeniden oyna (R)", "Play again (R)"],
    language: ["English", "Türkçe"],
};

function duelist(name: string, color: string, x: number, player: 1 | 2, scriptComponent: ReturnType<typeof script>) {
    const idle = createAnimatorState("Idle", "Idle", { x: 260, y: 160 });
    const run = createAnimatorState("Run", "Run", { x: 480, y: 160 });
    const dash = createAnimatorState("Dash", "Dash", { x: 370, y: 40 });
    return entity(name, [
        sprite(color, "circle", 3),
        createRigidBody({ gravityScale: 0, useGravity: false, linearDamping: 0, freezeRotation: true }),
        createCollider({ shape: "circle", radius: 0.45 }),
        createPlayerInput({ player, scheme: player === 1 ? "keyboardLeft" : "keyboardRight", gamepad: player }),
        createAnimation({
            clips: [
                scaleClip("Idle", 1.2, "loop", [[0, 0.9, 0.9], [0.6, 0.94, 0.86], [1.2, 0.9, 0.9]]),
                scaleClip("Run", 0.3, "loop", [[0, 0.84, 0.96], [0.15, 0.96, 0.84], [0.3, 0.84, 0.96]]),
                scaleClip("Dash", 0.2, "once", [[0, 1.2, 0.7], [0.2, 0.9, 0.9]]),
            ],
        }),
        createAnimator({
            parameters: [{ name: "speed", type: "float", value: 0 }, { name: "dash", type: "trigger", value: 0 }],
            states: [idle, run, dash],
            defaultState: idle.id,
            transitions: [
                createAnimatorTransition(idle.id, run.id, { conditions: [{ parameter: "speed", mode: "greater", threshold: 0.5 }], duration: 0.08 }),
                createAnimatorTransition(run.id, idle.id, { conditions: [{ parameter: "speed", mode: "less", threshold: 0.5 }], duration: 0.12 }),
                createAnimatorTransition("any", dash.id, { conditions: [{ parameter: "dash", mode: "if", threshold: 0 }], duration: 0 }),
                createAnimatorTransition(dash.id, run.id, { duration: 0.05 }),
            ],
        }),
        scriptComponent,
    ], { position: { x, y: 0 }, scale: { x: 0.9, y: 0.9 }, tag: "Player" });
}

export function starDuel(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    project.settings.aspect = "16:9";
    localized(project, DUEL_TEXT);
    project.settings.arcade = {
        leaderboards: [{ id: "fastest", name: "En hızlı zafer", order: "asc", format: "time", minScore: 3, maxScore: 900, minPlaySeconds: 5 }],
        achievements: [
            { id: "first-duel", name: "İlk düello", description: "Bir maçı bitir.", hidden: false },
            { id: "shutout", name: "Sıfıra sıfır", description: "Rakibin tek yıldız alamadan kazan.", hidden: false },
            { id: "dasher", name: "Fırtına", description: "Bir maçta 15 kez atıl.", hidden: true },
        ],
    };

    const duelistScript = scriptAsset("Duelist.cs", `
using UnityEngine;

// Bir oyuncu. Player Input bileşeni hangi tuşları ve hangi gamepad'i kullanacağını söyler:
// 1. oyuncu klavyenin sol yarısı (WASD + Space), 2. oyuncu sağ yarısı (oklar + Enter);
// gamepad'ler sırayla 1. ve 2. oyuncuya gider. Aynı "Horizontal" ve "Jump" eylemleri
// her oyuncu için kendi tuşlarından okunur.
// Animator, "speed" parametresiyle Idle ve Run arasında geçer; "dash" tetikleyicisi atılmayı oynatır.
public class Duelist : MonoBehaviour
{
    public DuelManager manager;
    public float speed = 6f;
    public float dashSpeed = 15f;
    public float dashTime = 0.16f;
    public float dashCooldown = 0.8f;
    public int dashes;

    private PlayerInput input;
    private Rigidbody2D body;
    private Animator animator;
    private Vector2 facing = new Vector2(1f, 0f);
    private float dashUntil;
    private float nextDash;

    void Start()
    {
        input = GetComponent<PlayerInput>();
        body = GetComponent<Rigidbody2D>();
        animator = GetComponent<Animator>();
    }

    void Update()
    {
        if (!manager.playing)
        {
            body.velocity = Vector2.zero;
            animator.SetFloat("speed", 0f);
            return;
        }
        Vector2 move = new Vector2(input.GetAxisRaw("Horizontal"), input.GetAxisRaw("Vertical"));
        if (move.magnitude > 1f) move = move.normalized;
        if (move.magnitude > 0.1f) facing = move.normalized;

        if (input.GetButtonDown("Jump") && Time.time >= nextDash)
        {
            dashUntil = Time.time + dashTime;
            nextDash = Time.time + dashCooldown;
            dashes++;
            animator.SetTrigger("dash");
            Audio.Play("jump", 0.25f);
        }

        Vector2 velocity = Time.time < dashUntil ? facing * dashSpeed : move * speed;
        body.velocity = velocity;
        animator.SetFloat("speed", velocity.magnitude);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Star")) manager.Collect(this);
    }
}`);

    const managerScript = scriptAsset("DuelManager.cs", `
using UnityEngine;
using UnityEngine.UI;

// Maçın kaydı: SaveSystem bu sınıfı "duel" yuvasına JSON olarak yazar ve geri okur.
[System.Serializable]
public class DuelStats
{
    public int blueWins;
    public int pinkWins;
    public float bestTime;
}

// Maçı yönetir: yıldızı sıradaki noktaya taşır, sayıları ve süreyi gösterir,
// kazananı açıklar. Metinler Proje ayarları → Diller'deki tablodan gelir
// (Localization.Get), oyuncunun diline göre Türkçe ya da İngilizce.
public class DuelManager : MonoBehaviour
{
    public Duelist blue;
    public Duelist pink;
    public Transform star;
    public Text blueScore;
    public Text pinkScore;
    public Text timeText;
    public Text statsText;
    public GameObject winPanel;
    public Text winText;
    public int target = 10;
    public bool playing = true;

    private int blueStars;
    private int pinkStars;
    private int next;
    private float startTime;
    private DuelStats stats;
    private Vector3[] points = {
${DUEL_POINTS.map(([x, y]) => `        new Vector3(${x}f, ${y}f, 0f)`).join(",\n")}
    };

    void Start()
    {
        stats = SaveSystem.Load<DuelStats>("duel", new DuelStats());
        startTime = Time.time;
        MoveStar();
        Refresh();
    }

    void Update()
    {
        if (playing) timeText.text = Localization.Get("time", (Time.time - startTime).ToString("0.0"));
        else if (Input.GetKeyDown(KeyCode.R)) Restart();
    }

    public void Collect(Duelist who)
    {
        if (!playing) return;
        if (who == blue) blueStars++;
        else pinkStars++;
        Audio.Play("coin", 0.5f);
        Tween.PunchScale(who.transform, 0.25f, 0.2f);
        Refresh();
        if (blueStars >= target || pinkStars >= target) Finish(blueStars >= target ? blue : pink);
        else MoveStar();
    }

    void MoveStar()
    {
        star.position = points[next % points.Length];
        next++;
        Tween.PunchScale(star, 0.3f, 0.25f);
    }

    void Refresh()
    {
        blueScore.text = blueStars.ToString();
        pinkScore.text = pinkStars.ToString();
        statsText.text = Localization.Get("stats", stats.blueWins, stats.pinkWins);
    }

    void Finish(Duelist winner)
    {
        playing = false;
        float time = Time.time - startTime;
        bool blueWon = winner == blue;
        if (blueWon) stats.blueWins++;
        else stats.pinkWins++;
        if (stats.bestTime <= 0f || time < stats.bestTime) stats.bestTime = time;
        SaveSystem.Save("duel", stats);
        star.gameObject.SetActive(false);
        winText.text = Localization.Get(blueWon ? "blue_wins" : "pink_wins") + "\\n" + Localization.Get("result", time.ToString("0.0"), stats.bestTime.ToString("0.0"));
        winPanel.SetActive(true);
        Audio.Play("powerup");

        // Arcade'de giriş yapan oyuncular için kaydedilir; editörde yalnızca konsola yazılır.
        Leaderboard.Submit("fastest", time);
        Achievements.Unlock("first-duel");
        if (blueStars == 0 || pinkStars == 0) Achievements.Unlock("shutout");
        if (winner.dashes >= 15) Achievements.Unlock("dasher");
        Refresh();
    }

    public void Restart()
    {
        SceneManager.ReloadScene();
    }

    public void ToggleLanguage()
    {
        Localization.language = Localization.language == "tr" ? "en" : "tr";
    }

    // Dil değişince betiğin yazdığı metinler de yenilenir (UI metinleri kendiliğinden değişir).
    void OnLanguageChanged(string language)
    {
        Refresh();
    }
}`);
    project.scripts = [duelistScript, managerScript];

    const scene = createEmptyScene("Arena", "2d");
    scene.settings.background = { mode: "gradient", color: "#0f0a1f", topColor: "#1e1b4b" };
    effects(scene, (post) => {
        post.vignette = { enabled: true, intensity: 0.4 };
        post.colorGrading = { ...post.colorGrading, enabled: true, saturation: 0.18, contrast: 0.12, brightness: 0, hue: 0 };
        post.bloom = { ...post.bloom, enabled: true, intensity: 0.7, threshold: 0.7 };
    });

    const manager = entity("GameManager", []);
    const blue = duelist("Blue", "#6366f1", -4, 1, script(duelistScript, { manager: ref(manager) }));
    const pink = duelist("Pink", "#ec4899", 4, 2, script(duelistScript, { manager: ref(manager) }));
    const star = entity("Star", [
        sprite("#facc15", "star", 2),
        createCollider({ shape: "circle", radius: 0.4, isTrigger: true }),
        createAnimation({ clips: [spinClip("2d", 3)] }),
    ], { scale: { x: 0.8, y: 0.8 }, tag: "Star" });
    const walls = [
        entity("WallTop", [sprite("#312e81"), createCollider()], { position: { y: 4.6 }, scale: { x: 18, y: 0.4 } }),
        entity("WallBottom", [sprite("#312e81"), createCollider()], { position: { y: -4.6 }, scale: { x: 18, y: 0.4 } }),
        entity("WallLeft", [sprite("#312e81"), createCollider()], { position: { x: -8.8 }, scale: { x: 0.4, y: 9.6 } }),
        entity("WallRight", [sprite("#312e81"), createCollider()], { position: { x: 8.8 }, scale: { x: 0.4, y: 9.6 } }),
    ];
    const blueScore = entity("BlueScore", [uiText("0", { anchor: "top-left", fontSize: 54, color: "#818cf8", offset: { x: 36, y: 18 } })]);
    const pinkScore = entity("PinkScore", [uiText("0", { anchor: "top-right", fontSize: 54, color: "#f472b6", offset: { x: 36, y: 18 } })]);
    const title = entity("TitleText", [keyedText(DUEL_TEXT.title[0], "title", { anchor: "top", fontSize: 26, color: "#facc15", offset: { x: 0, y: 16 } })]);
    const timeText = entity("TimeText", [uiText("", { anchor: "top", fontSize: 20, offset: { x: 0, y: 54 }, bold: false })]);
    const hint = entity("HintText", [keyedText(DUEL_TEXT.hint[0], "hint", { anchor: "bottom", fontSize: 16, offset: { x: 0, y: 18 }, bold: false, color: "#c7d2fe" })]);
    const statsText = entity("StatsText", [uiText("", { anchor: "bottom-left", fontSize: 15, offset: { x: 20, y: 46 }, bold: false, color: "#a5b4fc" })]);
    const languageButton = uiButton(DUEL_TEXT.language[0], manager, "ToggleLanguage", { anchor: "bottom-right", offset: { x: 20, y: 40 }, width: 130, height: 40, color: "#4338ca", fontSize: 16 });
    languageButton.localizationKey = "language";
    const language = entity("LanguageButton", [languageButton]);
    const over = gameOverPanel(manager, DUEL_TEXT.over[0], DUEL_TEXT.again[0], "#6366f1");
    over.panel.name = "WinPanel";
    over.result.name = "WinText";
    for (const item of over.entities) {
        for (const component of item.components) {
            if (component.type === "uiText" && component.text === DUEL_TEXT.over[0]) component.localizationKey = "over";
            if (component.type === "uiButton") component.localizationKey = "again";
        }
    }

    manager.components.push(script(managerScript, {
        blue: ref(blue),
        pink: ref(pink),
        star: ref(star),
        blueScore: ref(blueScore),
        pinkScore: ref(pinkScore),
        timeText: ref(timeText),
        statsText: ref(statsText),
        winPanel: ref(over.panel),
        winText: ref(over.result),
    }));
    scene.objects.push(camera2d(5.4), ...walls, star, blue, pink, manager, blueScore, pinkScore, title, timeText, hint, statsText, language, ...over.entities);
    return finishProject(project, scene, "star-duel-2d");
}

// ---------------------------------------------------------------------------
// V5: Dungeon Escape (Animator states, SaveSystem, screen effects, Arcade)
// ---------------------------------------------------------------------------

const DUNGEON_TILES: TileDefinition[] = [
    { key: "#", name: "Taş", color: "#57534e", solid: true, frame: -1 },
    { key: "W", name: "Duvar", color: "#1c1917", solid: true, frame: -1 },
];

const DUNGEON_HAZARDS: TileDefinition[] = [
    { key: "^", name: "Diken", color: "#ef4444", solid: true, frame: -1 },
];

/**
 * Cell rows: a cell (x, y) covers x…x+1 and y…y+1, so the floor row −4 has its
 * top at −3. Pits are x 10–12, 28–30 and 48–50; floor spikes stand at 17 and
 * 42, with no ledge above them that would cut a jump short.
 */
const DUNGEON_GROUND: TileFill[] = [
    [-12, -8, -12, 7, "W"], [64, -8, 64, 7, "W"], [-12, 7, 64, 7, "W"],
    [-11, -8, 9, -4, "#"], [13, -8, 27, -4, "#"], [31, -8, 47, -4, "#"], [51, -8, 63, -4, "#"],
    [10, -8, 12, -8, "#"], [28, -8, 30, -8, "#"], [48, -8, 50, -8, "#"],
    [3, -1, 6, -1, "#"], [19, -1, 22, -1, "#"], [35, -1, 38, -1, "#"], [54, 0, 57, 0, "#"],
];

const DUNGEON_SPIKES: TileFill[] = [
    [10, -7, 12, -7, "^"], [28, -7, 30, -7, "^"], [48, -7, 50, -7, "^"],
    [17, -3, 17, -3, "^"], [42, -3, 42, -3, "^"],
];

/** Where the escape needs a jump: the start of each pit and floor spike (x). */
export const DUNGEON_JUMPS = [10, 17, 28, 42, 48];

const DUNGEON_COINS: Array<[number, number]> = [
    [-5, -2.3], [-1, -2.3], [4.5, 0.6], [11.5, -1.2], [15, -2.3], [20.5, 0.6],
    [24, -2.3], [29.5, -1.2], [33, -2.3], [36.5, 0.6], [49.5, -1.2], [55.5, 1.6],
];

const DUNGEON_TEXT: Record<string, [string, string]> = {
    title: ["Zindan Kaçışı", "Dungeon Escape"],
    hint: ["← → koş  •  Space zıpla  •  N: yeni oyun  •  Bayraklar ilerlemeni kaydeder", "← → run  •  Space jump  •  N: new game  •  Flags save your progress"],
    coins: ["Altın: {0}/{1}", "Gold: {0}/{1}"],
    lives: ["Can: {0}", "Lives: {0}"],
    time: ["Süre: {0}", "Time: {0}"],
    saved: ["İlerleme kaydedildi", "Progress saved"],
    resumed: ["Kayıttan devam ediliyor", "Continuing from your save"],
    escaped: ["Kaçtın!", "You escaped!"],
    caught: ["Zindanda kaldın", "Trapped in the dungeon"],
    result: ["Süre: {0} sn  •  Altın: {1}/{2}", "Time: {0} s  •  Gold: {1}/{2}"],
    again: ["Yeniden (R)", "Again (R)"],
};

function heroAnimator() {
    const idle = createAnimatorState("Idle", "Idle", { x: 260, y: 220 });
    const run = createAnimatorState("Run", "Run", { x: 480, y: 220 });
    const jump = createAnimatorState("Jump", "Jump", { x: 300, y: 60 });
    const fall = createAnimatorState("Fall", "Fall", { x: 480, y: 60 });
    const hurt = createAnimatorState("Hurt", "Hurt", { x: 640, y: 140 });
    const rising: AnimatorCondition[] = [{ parameter: "grounded", mode: "ifNot", threshold: 0 }, { parameter: "vy", mode: "greater", threshold: 0.5 }];
    const falling: AnimatorCondition[] = [{ parameter: "grounded", mode: "ifNot", threshold: 0 }, { parameter: "vy", mode: "less", threshold: -0.5 }];
    return createAnimator({
        parameters: [
            { name: "speed", type: "float", value: 0 },
            { name: "vy", type: "float", value: 0 },
            { name: "grounded", type: "bool", value: 1 },
            { name: "hurt", type: "trigger", value: 0 },
        ],
        states: [idle, run, jump, fall, hurt],
        defaultState: idle.id,
        // Hurt comes from any state and plays to its end; jumping and falling start from
        // the ground states (not from Any State), so a hit is never cut short by a fall.
        transitions: [
            createAnimatorTransition("any", hurt.id, { conditions: [{ parameter: "hurt", mode: "if", threshold: 0 }], duration: 0 }),
            ...[idle, run, fall].map((from) => createAnimatorTransition(from.id, jump.id, { conditions: rising, duration: 0.05 })),
            ...[idle, run, jump].map((from) => createAnimatorTransition(from.id, fall.id, { conditions: falling, duration: 0.08 })),
            createAnimatorTransition(jump.id, idle.id, { conditions: [{ parameter: "grounded", mode: "if", threshold: 0 }], duration: 0.05 }),
            createAnimatorTransition(fall.id, idle.id, { conditions: [{ parameter: "grounded", mode: "if", threshold: 0 }], duration: 0.05 }),
            createAnimatorTransition(idle.id, run.id, { conditions: [{ parameter: "speed", mode: "greater", threshold: 0.3 }], duration: 0.08 }),
            createAnimatorTransition(run.id, idle.id, { conditions: [{ parameter: "speed", mode: "less", threshold: 0.3 }], duration: 0.1 }),
            createAnimatorTransition(hurt.id, idle.id, { duration: 0.1 }),
        ],
    });
}

export function dungeonEscape(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    project.settings.aspect = "16:9";
    localized(project, DUNGEON_TEXT);
    project.settings.arcade = {
        leaderboards: [
            // A flawless run takes about 11 seconds; anything faster is not a real escape.
            { id: "escape-time", name: "En hızlı kaçış", order: "asc", format: "time", minScore: 8, maxScore: 3600, minPlaySeconds: 8 },
            { id: "gold", name: "En çok altın", order: "desc", format: "number", minScore: 0, maxScore: DUNGEON_COINS.length, minPlaySeconds: 10 },
        ],
        achievements: [
            { id: "escaped", name: "Özgürlük", description: "Zindandan kaç.", hidden: false },
            { id: "all-gold", name: "Hazine avcısı", description: "Bütün altınları toplayıp kaç.", hidden: false },
            { id: "untouched", name: "Dokunulmaz", description: "Hiç hasar almadan kaç.", hidden: false },
            { id: "sprinter", name: "Rüzgâr", description: "16 saniyenin altında kaç.", hidden: true },
        ],
    };

    const heroScript = scriptAsset("Hero.cs", `
using UnityEngine;

// Kahraman. Koşma ve zıplamayı Character Controller 2D yapar; bu betik Animator'ın
// parametrelerini her karede günceller: "speed", "vy" ve "grounded".
// Durumlar (Idle, Run, Jump, Fall, Hurt) ve aralarındaki geçişler Animator panelinde:
// hiçbir yerde Play("Run") çağrılmaz, durum makinesi parametrelere bakıp kendisi seçer.
public class Hero : MonoBehaviour
{
    public DungeonManager manager;
    public float invincibleTime = 1.2f;

    private CharacterController2D controller;
    private Animator animator;
    private Vector3 respawnPoint;
    private float invincibleUntil;

    void Start()
    {
        controller = GetComponent<CharacterController2D>();
        animator = GetComponent<Animator>();
        respawnPoint = transform.position;
    }

    void Update()
    {
        Vector2 velocity = controller.velocity;
        animator.SetFloat("speed", Mathf.Abs(velocity.x));
        animator.SetFloat("vy", velocity.y);
        animator.SetBool("grounded", controller.isGrounded);
    }

    void OnJump()
    {
        Audio.Play("jump", 0.35f);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin")) manager.CollectCoin(other.gameObject);
        else if (other.CompareTag("Hazard")) Hurt();
        else if (other.CompareTag("Respawn")) manager.ReachFlag(other.transform);
        else if (other.CompareTag("Finish")) manager.Escape();
    }

    public void SetRespawn(Vector3 point)
    {
        respawnPoint = point;
    }

    public void Hurt()
    {
        if (Time.time < invincibleUntil || !controller.enabled) return;
        invincibleUntil = Time.time + invincibleTime;
        animator.SetTrigger("hurt");
        if (!manager.LoseLife()) return;
        controller.Stop();
        transform.position = respawnPoint;
    }

    public void Freeze()
    {
        controller.Stop();
        controller.enabled = false;
        animator.SetFloat("speed", 0f);
    }
}`);

    const managerScript = scriptAsset("DungeonManager.cs", `
using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

// Bayrağa dokununca SaveSystem'e yazılan kayıt. Sahnedeki nesneler kaydedilemez;
// konum, sayılar ve alınan altınların adları kaydedilir.
[System.Serializable]
public class DungeonSave
{
    public Vector3 checkpoint;
    public int lives = 3;
    public float time;
    public bool hurt;
    public List<string> taken = new List<string>();
}

// Altın, can ve süre; bayraklarda kayıt, kaçışta ya da canlar bitince sonuç paneli.
// Hasar alınca ScreenEffects ile kısa bir renk kayması ve kırmızılık; zindanın
// loş havası sahne ayarlarındaki vinyet ve renk ayarından gelir.
public class DungeonManager : MonoBehaviour
{
    public Hero hero;
    public Text coinText;
    public Text livesText;
    public Text timeText;
    public GameObject endPanel;
    public Text endTitle;
    public Text endText;
    public int totalCoins = 12;

    private DungeonSave save;
    private int lives = 3;
    private float elapsed;
    private bool finished;
    private bool tookDamage;

    void Start()
    {
        save = SaveSystem.Load<DungeonSave>("dungeon");
        if (save != null)
        {
            // Kaldığın yerden: bayrağın yanında, aynı can ve süreyle; alınan altınlar sahneden kalkar.
            lives = save.lives;
            elapsed = save.time;
            tookDamage = save.hurt;
            foreach (string coin in save.taken)
            {
                GameObject found = GameObject.Find(coin);
                if (found != null) Destroy(found);
            }
            hero.transform.position = save.checkpoint;
            hero.SetRespawn(save.checkpoint);
            HUD.Show(Localization.Get("resumed"), 1.5f);
        }
        else
        {
            save = new DungeonSave();
            HUD.Show(Localization.Get("title"), 1.5f);
        }
        UpdateTexts();
    }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.N)) NewGame();
        if (finished)
        {
            if (Input.GetKeyDown(KeyCode.R)) NewGame();
            return;
        }
        elapsed += Time.deltaTime;
        timeText.text = Localization.Get("time", elapsed.ToString("0.0"));
    }

    public void CollectCoin(GameObject coin)
    {
        if (save.taken.Contains(coin.name)) return;
        save.taken.Add(coin.name);
        Destroy(coin);
        Audio.Play("coin");
        UpdateTexts();
    }

    public void ReachFlag(Transform flag)
    {
        Vector3 point = flag.position;
        if (point == save.checkpoint) return;
        save.checkpoint = point;
        save.lives = lives;
        save.time = elapsed;
        save.hurt = tookDamage;
        hero.SetRespawn(point);
        SaveSystem.Save("dungeon", save);
        HUD.Show(Localization.Get("saved"), 1f);
        Audio.Play("powerup", 0.4f);
        Tween.PunchScale(flag, 0.3f, 0.3f);
    }

    // Can kaldıysa true döner.
    public bool LoseLife()
    {
        lives--;
        tookDamage = true;
        Camera.Shake(0.3f, 0.3f);
        Audio.Play("hit");
        // Ekran efektleri: kısa bir renk kayması ve kırmızı ton, sonra sahnenin kendi ayarı.
        ScreenEffects.chromaticAberration = 0.8f;
        ScreenEffects.tint = new Color(1f, 0.1f, 0.1f, 0.35f);
        Timer.After(0.35f, () => ScreenEffects.Reset());
        UpdateTexts();
        if (lives > 0) return true;
        End(false);
        return false;
    }

    public void Escape()
    {
        if (finished) return;
        End(true);
        int gold = save.taken.Count;
        Leaderboard.Submit("escape-time", elapsed);
        Leaderboard.Submit("gold", gold);
        Achievements.Unlock("escaped");
        if (gold >= totalCoins) Achievements.Unlock("all-gold");
        if (!tookDamage) Achievements.Unlock("untouched");
        if (elapsed < 16f) Achievements.Unlock("sprinter");
    }

    void End(bool escaped)
    {
        finished = true;
        hero.Freeze();
        SaveSystem.Delete("dungeon");
        endTitle.text = Localization.Get(escaped ? "escaped" : "caught");
        endText.text = Localization.Get("result", elapsed.ToString("0.0"), save.taken.Count, totalCoins);
        endPanel.SetActive(true);
        Audio.Play(escaped ? "win" : "lose");
    }

    public void NewGame()
    {
        SaveSystem.Delete("dungeon");
        SceneManager.ReloadScene();
    }

    void UpdateTexts()
    {
        coinText.text = Localization.Get("coins", save.taken.Count, totalCoins);
        livesText.text = Localization.Get("lives", lives);
    }

    void OnLanguageChanged(string language)
    {
        UpdateTexts();
    }
}`);
    project.scripts = [heroScript, managerScript];

    const scene = createEmptyScene("Zindan", "2d");
    scene.settings.background = { mode: "gradient", color: "#0c0a09", topColor: "#292524" };
    scene.settings.ambientIntensity = 0.8;
    effects(scene, (post) => {
        post.vignette = { enabled: true, intensity: 0.55 };
        post.bloom = { ...post.bloom, enabled: true, intensity: 1, threshold: 0.65, radius: 0.5 };
        post.colorGrading = { ...post.colorGrading, enabled: true, saturation: -0.15, contrast: 0.15, brightness: -0.05, hue: 0, tint: "#f59e0b", tintAmount: 0.12 };
    });

    const camera = camera2d(5.4, -2.4, -0.4);
    const ground = entity("Dungeon", [tilemap(DUNGEON_TILES, DUNGEON_GROUND)], { tag: "Ground" });
    const spikes = entity("Spikes", [tilemap(DUNGEON_HAZARDS, DUNGEON_SPIKES, { isTrigger: true, sortingLayer: 1 })], { tag: "Hazard" });
    const manager = entity("GameManager", []);
    const hero = entity("Hero", [
        sprite("#fbbf24", "roundedSquare", 5),
        createRigidBody({ freezeRotation: true, linearDamping: 0, gravityScale: 1 }),
        createCollider({ shape: "box", size: { x: 0.8, y: 0.9, z: 1 } }),
        createCharacterController2D({ moveSpeed: 6.5, jumpHeight: 2.6, maxJumps: 1, coyoteTime: 0.12, jumpBuffer: 0.15 }),
        createAnimation({
            clips: [
                scaleClip("Idle", 1.4, "loop", [[0, 1, 1], [0.7, 1.04, 0.96], [1.4, 1, 1]]),
                scaleClip("Run", 0.32, "loop", [[0, 0.94, 1.06], [0.16, 1.06, 0.94], [0.32, 0.94, 1.06]]),
                scaleClip("Jump", 0.25, "once", [[0, 0.85, 1.2], [0.25, 0.92, 1.1]]),
                scaleClip("Fall", 0.25, "once", [[0, 1, 1], [0.25, 1.08, 0.94]]),
                { name: "Hurt", duration: 0.4, wrap: "once", tracks: [{ property: "color", keys: [key(0, "#ef4444"), key(0.2, "#fecaca"), key(0.4, "#fbbf24")] }] },
            ],
        }),
        heroAnimator(),
        script(heroScript, { manager: ref(manager) }),
    ], { position: { x: -8, y: -2.5 }, tag: "Player" });
    camera.components.push(createCameraFollow({
        targetId: hero.id,
        offset: { x: 0, y: 1.2, z: 0 },
        smoothTime: 0.18,
        deadZone: { x: 1, y: 1 },
        lookAhead: 1.5,
        useBounds: true,
        boundsMin: { x: -2.4, y: -2.7 },
        boundsMax: { x: 54.4, y: 2.7 },
    }, "2d"));

    const coins = DUNGEON_COINS.map(([x, y], index) => entity(`Gold ${index + 1}`, [
        sprite("#fde047", "diamond", 3),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        createAnimation({ clips: [spinClip("2d", 2.5)] }),
    ], { position: { x, y }, scale: { x: 0.5, y: 0.5 }, tag: "Coin" }));
    const flags = [14, 32, 53].map((x, index) => entity(`Flag ${index + 1}`, [
        sprite("#22d3ee", "triangle", 3),
        createCollider({ shape: "box", size: { x: 1, y: 2.4, z: 1 }, isTrigger: true }),
    ], { position: { x, y: -2.3 }, scale: { x: 0.6, y: 0.9 }, tag: "Respawn" }));
    const torches = [-6, 8, 22, 36, 50].map((x, index) => entity(`Torch ${index + 1}`, [
        sprite("#fb923c", "circle", 1),
        createAnimation({ clips: [{ name: "Flicker", duration: 0.6, wrap: "pingPong", tracks: [{ property: "scale", keys: [key(0, { x: 0.45, y: 0.55, z: 1 }), key(0.3, { x: 0.52, y: 0.62, z: 1 }), key(0.6, { x: 0.42, y: 0.5, z: 1 })] }] }] }),
    ], { position: { x, y: 2 }, scale: { x: 0.45, y: 0.55 } }));
    const exit = entity("Exit", [
        sprite("#a3e635", "roundedSquare", 2),
        createCollider({ shape: "box", size: { x: 1, y: 1, z: 1 }, isTrigger: true }),
    ], { position: { x: 61, y: -1.8 }, scale: { x: 1.2, y: 2.4 }, tag: "Finish" });

    const coinText = entity("CoinText", [uiText("Altın: 0/12", { anchor: "top-left", fontSize: 26, color: "#fde047" })]);
    const livesText = entity("LivesText", [uiText("Can: 3", { anchor: "top-left", fontSize: 22, offset: { x: 16, y: 54 }, color: "#fecaca" })]);
    const timeText = entity("TimeText", [uiText("", { anchor: "top", fontSize: 22, offset: { x: 0, y: 18 } })]);
    const hint = entity("HintText", [keyedText(DUNGEON_TEXT.hint[0], "hint", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 16 }, bold: false, color: "#e7e5e4" })]);
    const end = gameOverPanel(manager, DUNGEON_TEXT.escaped[0], DUNGEON_TEXT.again[0], "#d97706");
    end.panel.name = "EndPanel";
    end.heading.name = "EndTitle";
    end.result.name = "EndText";
    for (const component of end.entities.flatMap((item) => item.components)) {
        if (component.type === "uiButton") {
            component.localizationKey = "again";
            component.onClick.method = "NewGame";
        }
    }

    manager.components.push(script(managerScript, {
        hero: ref(hero),
        coinText: ref(coinText),
        livesText: ref(livesText),
        timeText: ref(timeText),
        endPanel: ref(end.panel),
        endTitle: ref(end.heading),
        endText: ref(end.result),
        totalCoins: DUNGEON_COINS.length,
    }));
    scene.objects.push(camera, ground, spikes, ...torches, ...coins, ...flags, exit, hero, manager, coinText, livesText, timeText, hint, ...end.entities);
    return finishProject(project, scene, "dungeon-escape-2d");
}

// ---------------------------------------------------------------------------
// V5: Meteor Storm (screen effects V2, SaveSystem settings, Animator, Arcade)
// ---------------------------------------------------------------------------

/** Where meteors fall, in turn (x). */
export const METEOR_LANES = [-7, 3, -2, 6, -5, 1, 7.5, -8, 4.5, -0.5, 2, -3.5];

const METEOR_TEXT: Record<string, [string, string]> = {
    title: ["Meteor Yağmuru", "Meteor Storm"],
    hint: ["← → hareket  •  Space / Ctrl / tık: ateş  •  O: seçenekler", "← → move  •  Space / Ctrl / click: fire  •  O: options"],
    score: ["Puan: {0}", "Score: {0}"],
    lives: ["Can: {0}", "Lives: {0}"],
    time: ["{0} sn", "{0} s"],
    options: ["Seçenekler", "Options"],
    crt: ["CRT ekranı", "CRT screen"],
    pixel: ["Piksel görünüm", "Pixel look"],
    resume: ["Devam (O)", "Resume (O)"],
    language: ["English", "Türkçe"],
    over: ["Oyun bitti", "Game over"],
    result: ["Puan: {0}  •  Süre: {1} sn", "Score: {0}  •  Time: {1} s"],
    again: ["Yeniden (R)", "Again (R)"],
};

export function meteorStorm(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    project.settings.aspect = "16:9";
    project.settings.pixelArt = true;
    localized(project, METEOR_TEXT);
    project.settings.arcade = {
        leaderboards: [{ id: "score", name: "En yüksek puan", order: "desc", format: "number", minScore: 0, maxScore: 100000, minPlaySeconds: 10 }],
        achievements: [
            { id: "first-blood", name: "İlk vuruş", description: "Bir meteoru vur.", hidden: false },
            { id: "survivor", name: "Hayatta kalan", description: "60 saniye dayan.", hidden: false },
            { id: "ace", name: "As pilot", description: "1000 puana ulaş.", hidden: false },
            { id: "clean", name: "Kusursuz", description: "Hiç vurulmadan 300 puan topla.", hidden: true },
        ],
    };

    const shipScript = scriptAsset("Ship.cs", `
using UnityEngine;

// Gemi: sağa sola gider, ateş eder, meteora çarpınca oyuna haber verir.
// Animator: "speed" ile Idle ve Thrust arasında geçer, "hit" tetikleyicisi vurulma durumunu oynatır.
public class Ship : MonoBehaviour
{
    public MeteorGame game;
    public GameObject bulletPrefab;
    public float speed = 9f;
    public float fireRate = 0.18f;

    private Animator animator;
    private float nextShot;

    void Start()
    {
        animator = GetComponent<Animator>();
    }

    void Update()
    {
        if (!game.playing)
        {
            animator.SetFloat("speed", 0f);
            return;
        }
        float move = Input.GetAxisRaw("Horizontal");
        Vector3 position = transform.position;
        position.x = Mathf.Clamp(position.x + move * speed * Time.deltaTime, -8.4f, 8.4f);
        transform.position = position;
        animator.SetFloat("speed", Mathf.Abs(move));

        if ((Input.GetButton("Jump") || Input.GetButton("Fire1")) && Time.time >= nextShot)
        {
            nextShot = Time.time + fireRate;
            Instantiate(bulletPrefab, transform.position + new Vector3(0f, 0.6f, 0f), Quaternion.identity);
            Audio.Play("laser", 0.2f);
        }
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (!other.CompareTag("Meteor") || !game.playing) return;
        Destroy(other.gameObject);
        animator.SetTrigger("hit");
        game.ShipHit();
    }
}`);

    const bulletScript = scriptAsset("Bullet.cs", `
using UnityEngine;

// Mermi: yukarı uçar, ekrandan çıkınca yok olur.
public class Bullet : MonoBehaviour
{
    public float speed = 14f;

    void Start()
    {
        GetComponent<Rigidbody2D>().velocity = new Vector2(0f, speed);
    }

    void Update()
    {
        if (transform.position.y > 6.5f) Destroy(gameObject);
    }
}`);

    const meteorScript = scriptAsset("Meteor.cs", `
using UnityEngine;

// Meteor: aşağı düşer ve döner; mermi değince parçalanır.
public class Meteor : MonoBehaviour
{
    public MeteorGame game;
    public float speed = 3f;

    void Start()
    {
        GetComponent<Rigidbody2D>().velocity = new Vector2(0f, -speed);
    }

    void Update()
    {
        transform.Rotate(0f, 0f, 90f * Time.deltaTime);
        if (transform.position.y < -6.5f) Destroy(gameObject);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (!other.CompareTag("Bullet") || game == null) return;
        Destroy(other.gameObject);
        game.MeteorDestroyed();
        Destroy(gameObject);
    }
}`);

    const gameScript = scriptAsset("MeteorGame.cs", `
using UnityEngine;
using UnityEngine.UI;

// Seçenekler SaveSystem ile "settings" yuvasına yazılır; bir dahaki oyunda da geçerlidir.
[System.Serializable]
public class RetroSettings
{
    public bool crt = true;
    public bool pixel = false;
}

// Meteorları sırayla atar, puanı ve canı tutar. Ekran efektleri V2:
// sahnede CRT (tarama çizgileri, kavis) ve renk ayarı açık; seçeneklerden
// CRT ve piksel görünüm kapatılıp açılır, vurulunca kısa bir renk kayması olur.
public class MeteorGame : MonoBehaviour
{
    public Ship ship;
    public GameObject meteorPrefab;
    public Text scoreText;
    public Text livesText;
    public Text timeText;
    public GameObject optionsPanel;
    public Toggle crtToggle;
    public Toggle pixelToggle;
    public GameObject overPanel;
    public Text overText;
    public float spawnEvery = 1.1f;
    public bool playing = true;

    private int score;
    private int lives = 3;
    private float elapsed;
    private float nextSpawn = 0.8f;
    private int spawned;
    private bool wasHit;
    private bool paused;
    private RetroSettings settings;
    private float[] lanes = { ${METEOR_LANES.map((x) => `${x}f`).join(", ")} };

    void Start()
    {
        settings = SaveSystem.Load<RetroSettings>("settings", new RetroSettings());
        crtToggle.SetIsOnWithoutNotify(settings.crt);
        pixelToggle.SetIsOnWithoutNotify(settings.pixel);
        Apply();
        UpdateTexts();
    }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.O) || Input.GetKeyDown(KeyCode.Escape)) ToggleOptions();
        if (!playing)
        {
            if (Input.GetKeyDown(KeyCode.R) && overPanel.activeSelf) Restart();
            return;
        }
        elapsed += Time.deltaTime;
        timeText.text = Localization.Get("time", elapsed.ToString("0"));
        if (elapsed >= nextSpawn) Spawn();
        if (elapsed >= 60f) Achievements.Unlock("survivor");
    }

    void Spawn()
    {
        float x = lanes[spawned % lanes.Length];
        spawned++;
        GameObject meteor = Instantiate(meteorPrefab, new Vector3(x, 6.2f, 0f), Quaternion.identity);
        Meteor rock = meteor.GetComponent<Meteor>();
        rock.game = this;
        rock.speed = 2.6f + Mathf.Min(elapsed * 0.05f, 4f);
        nextSpawn = elapsed + Mathf.Max(0.4f, spawnEvery - elapsed * 0.01f);
    }

    public void MeteorDestroyed()
    {
        score += 10;
        Audio.Play("explosion", 0.35f);
        Achievements.Unlock("first-blood");
        if (score >= 1000) Achievements.Unlock("ace");
        if (score >= 300 && !wasHit) Achievements.Unlock("clean");
        UpdateTexts();
    }

    public void ShipHit()
    {
        lives--;
        wasHit = true;
        Camera.Shake(0.3f, 0.25f);
        Audio.Play("hit");
        // Kısa bir renk kayması; CRT ve piksel seçimine dokunmaz.
        ScreenEffects.chromaticAberration = 0.9f;
        Timer.After(0.3f, () => { ScreenEffects.chromaticAberration = 0f; });
        UpdateTexts();
        if (lives <= 0) GameOver();
    }

    void GameOver()
    {
        playing = false;
        overText.text = Localization.Get("result", score, elapsed.ToString("0"));
        overPanel.SetActive(true);
        Audio.Play("lose");
        Leaderboard.Submit("score", score);
    }

    void Apply()
    {
        ScreenEffects.crt = settings.crt;
        ScreenEffects.pixelate = settings.pixel ? 3 : 1;
    }

    // Seçeneklerdeki anahtarlar (Inspector → On Value Changed).
    public void SetCrt(bool on)
    {
        settings.crt = on;
        Apply();
        SaveSystem.Save("settings", settings);
    }

    public void SetPixel(bool on)
    {
        settings.pixel = on;
        Apply();
        SaveSystem.Save("settings", settings);
    }

    public void ToggleOptions()
    {
        if (!playing && !paused) return;
        paused = !paused;
        playing = !paused;
        optionsPanel.SetActive(paused);
        Time.timeScale = paused ? 0f : 1f;
    }

    public void ToggleLanguage()
    {
        Localization.language = Localization.language == "tr" ? "en" : "tr";
    }

    public void Restart()
    {
        Time.timeScale = 1f;
        SceneManager.ReloadScene();
    }

    void UpdateTexts()
    {
        scoreText.text = Localization.Get("score", score);
        livesText.text = Localization.Get("lives", lives);
    }

    void OnLanguageChanged(string language)
    {
        UpdateTexts();
    }
}`);
    project.scripts = [shipScript, bulletScript, meteorScript, gameScript];

    const scene = createEmptyScene("Uzay", "2d");
    scene.settings.background = { mode: "gradient", color: "#020617", topColor: "#1e1b4b" };
    effects(scene, (post) => {
        post.crt = { enabled: true, scanlines: 0.35, curvature: 0.25 };
        post.colorGrading = { ...post.colorGrading, enabled: true, saturation: 0.3, contrast: 0.2, brightness: 0, hue: 0 };
        post.bloom = { ...post.bloom, enabled: true, intensity: 0.9, threshold: 0.6 };
        post.vignette = { enabled: true, intensity: 0.3 };
    });

    const manager = entity("GameManager", []);
    const bulletRoot = entity("Bullet", [
        sprite("#fde047", "square", 4),
        createRigidBody({ bodyType: "kinematic", useGravity: false, freezeRotation: true }),
        createCollider({ shape: "box", isTrigger: true }),
        script(bulletScript),
    ], { scale: { x: 0.14, y: 0.42 }, tag: "Bullet" });
    const bullet = prefab("Bullet", bulletRoot);
    const meteorRoot = entity("Meteor", [
        sprite("#a8a29e", "hexagon", 3),
        createRigidBody({ bodyType: "kinematic", useGravity: false }),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        script(meteorScript),
    ], { scale: { x: 0.9, y: 0.9 }, tag: "Meteor" });
    const meteor = prefab("Meteor", meteorRoot);
    project.prefabs = [bullet, meteor];

    const idle = createAnimatorState("Idle", "Idle", { x: 260, y: 160 });
    const thrust = createAnimatorState("Thrust", "Thrust", { x: 480, y: 160 });
    const hit = createAnimatorState("Hit", "Hit", { x: 370, y: 40 });
    const ship = entity("Ship", [
        sprite("#22d3ee", "triangle", 5),
        createRigidBody({ bodyType: "kinematic", useGravity: false, freezeRotation: true }),
        createCollider({ shape: "circle", radius: 0.4, isTrigger: true }),
        createAnimation({
            clips: [
                scaleClip("Idle", 1, "loop", [[0, 0.8, 0.8], [0.5, 0.82, 0.78], [1, 0.8, 0.8]]),
                scaleClip("Thrust", 0.2, "loop", [[0, 0.74, 0.86], [0.1, 0.86, 0.74], [0.2, 0.74, 0.86]]),
                { name: "Hit", duration: 0.5, wrap: "once", tracks: [{ property: "color", keys: [key(0, "#f43f5e"), key(0.25, "#ffffff"), key(0.5, "#22d3ee")] }] },
            ],
        }),
        createAnimator({
            parameters: [{ name: "speed", type: "float", value: 0 }, { name: "hit", type: "trigger", value: 0 }],
            states: [idle, thrust, hit],
            defaultState: idle.id,
            transitions: [
                createAnimatorTransition(idle.id, thrust.id, { conditions: [{ parameter: "speed", mode: "greater", threshold: 0.2 }], duration: 0.05 }),
                createAnimatorTransition(thrust.id, idle.id, { conditions: [{ parameter: "speed", mode: "less", threshold: 0.2 }], duration: 0.1 }),
                createAnimatorTransition("any", hit.id, { conditions: [{ parameter: "hit", mode: "if", threshold: 0 }], duration: 0 }),
                createAnimatorTransition(hit.id, idle.id, { duration: 0.05 }),
            ],
        }),
        script(shipScript, { game: ref(manager), bulletPrefab: prefabRef(bullet) }),
    ], { position: { x: 0, y: -4.2 }, scale: { x: 0.8, y: 0.8 }, tag: "Player" });
    const stars = Array.from({ length: 18 }, (_, index) => entity(`Star ${index + 1}`, [sprite(index % 3 === 0 ? "#fde047" : "#e0e7ff", "star", 0)], {
        position: { x: ((index * 37) % 180) / 10 - 9, y: ((index * 53) % 100) / 10 - 4.5 },
        scale: { x: 0.12 + (index % 3) * 0.05, y: 0.12 + (index % 3) * 0.05 },
    }));

    const scoreText = entity("ScoreText", [uiText("Puan: 0", { anchor: "top-left", fontSize: 26, color: "#fde047" })]);
    const livesText = entity("LivesText", [uiText("Can: 3", { anchor: "top-left", fontSize: 22, offset: { x: 16, y: 54 }, color: "#fecdd3" })]);
    const timeText = entity("TimeText", [uiText("", { anchor: "top", fontSize: 22, offset: { x: 0, y: 18 } })]);
    const hint = entity("HintText", [keyedText(METEOR_TEXT.hint[0], "hint", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 16 }, bold: false, color: "#c7d2fe" })]);
    const optionsButton = uiButton("⚙", manager, "ToggleOptions", { anchor: "top-right", offset: { x: 18, y: 16 }, width: 52, height: 52, fontSize: 22, color: "#312e81" });
    const optionsOpen = entity("OptionsButton", [optionsButton]);

    const options = entity("OptionsPanel", [createUIPanel({ width: 440, height: 330, color: "#0f172a", opacity: 0.95, order: 50 })], { active: false });
    const optionsTitle = entity("OptionsTitle", [keyedText(METEOR_TEXT.options[0], "options", { anchor: "center", fontSize: 30, offset: { x: 0, y: -120 }, order: 55 })], { parentId: options.id });
    const crtToggle = entity("CrtToggle", [createUIToggle({ isOn: true, label: METEOR_TEXT.crt[0], localizationKey: "crt", offset: { x: 0, y: -55 }, width: 300, order: 56, onValueChanged: { targetId: manager.id, method: "SetCrt" } })], { parentId: options.id });
    const pixelToggle = entity("PixelToggle", [createUIToggle({ isOn: false, label: METEOR_TEXT.pixel[0], localizationKey: "pixel", offset: { x: 0, y: -5 }, width: 300, order: 56, onValueChanged: { targetId: manager.id, method: "SetPixel" } })], { parentId: options.id });
    const languageButton = uiButton(METEOR_TEXT.language[0], manager, "ToggleLanguage", { offset: { x: 0, y: 50 }, width: 200, height: 44, color: "#4338ca", order: 60, fontSize: 18 });
    languageButton.localizationKey = "language";
    const language = entity("LanguageButton", [languageButton], { parentId: options.id });
    const resumeButton = uiButton(METEOR_TEXT.resume[0], manager, "ToggleOptions", { offset: { x: 0, y: 112 }, width: 200, height: 50, color: "#16a34a", order: 60 });
    resumeButton.localizationKey = "resume";
    const resume = entity("ResumeButton", [resumeButton], { parentId: options.id });

    const over = gameOverPanel(manager, METEOR_TEXT.over[0], METEOR_TEXT.again[0], "#6366f1");
    over.panel.name = "OverPanel";
    over.result.name = "OverText";
    for (const component of over.entities.flatMap((item) => item.components)) {
        if (component.type === "uiText" && component.text === METEOR_TEXT.over[0]) component.localizationKey = "over";
        if (component.type === "uiButton") component.localizationKey = "again";
    }

    manager.components.push(script(gameScript, {
        ship: ref(ship),
        meteorPrefab: prefabRef(meteor),
        scoreText: ref(scoreText),
        livesText: ref(livesText),
        timeText: ref(timeText),
        optionsPanel: ref(options),
        crtToggle: ref(crtToggle),
        pixelToggle: ref(pixelToggle),
        overPanel: ref(over.panel),
        overText: ref(over.result),
    }));
    scene.objects.push(camera2d(5.4), ...stars, ship, manager, scoreText, livesText, timeText, hint, optionsOpen, options, optionsTitle, crtToggle, pixelToggle, language, resume, ...over.entities);
    return finishProject(project, scene, "meteor-retro-2d");
}
