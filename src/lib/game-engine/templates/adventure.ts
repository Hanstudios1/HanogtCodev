/**
 * Adventure starter projects: a top-down RPG with a quest, dialogue and sword
 * fights, and a 3D obstacle course with moving platforms and checkpoints.
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
    createUIPanel,
} from "../components";
import { createBlankProject, createEmptyScene } from "../scene";
import type { GameEntity, GameProjectDocument, TileDefinition } from "../types";
import { burst, camera2d, entity, finishProject, gameOverPanel, prefab, prefabRef, ref, script, scriptAsset, sprite, tilemap, uiText, type TileFill } from "./builders";

// ---------------------------------------------------------------------------
// Top-down RPG
// ---------------------------------------------------------------------------

const RPG_WALLS: TileDefinition[] = [
    { key: "T", name: "Ağaç", color: "#166534", solid: true, frame: -1 },
    { key: "R", name: "Kaya", color: "#78716c", solid: true, frame: -1 },
    { key: "~", name: "Nehir", color: "#38bdf8", solid: true, frame: -1 },
    { key: "H", name: "Ev duvarı", color: "#c2410c", solid: true, frame: -1 },
    { key: "^", name: "Çatı", color: "#9f1239", solid: true, frame: -1 },
];

const RPG_GROUND: TileDefinition[] = [
    { key: "g", name: "Çimen", color: "#86efac", solid: false, frame: -1 },
    { key: "p", name: "Patika", color: "#fde68a", solid: false, frame: -1 },
    { key: "b", name: "Köprü", color: "#b45309", solid: false, frame: -1 },
    { key: "f", name: "Çiçekler", color: "#f9a8d4", solid: false, frame: -1 },
];

/** 34 × 20 cells: a village in the west, a river with a gated bridge, the treasure in the east. */
const RPG_MAP = {
    walls: [
        [0, 0, 33, 0, "T"], [0, 19, 33, 19, "T"], [0, 0, 0, 19, "T"], [33, 0, 33, 19, "T"],
        [16, 1, 17, 18, "~"], [16, 10, 17, 11, "."],
        [4, 7, 8, 8, "H"], [4, 9, 8, 9, "^"],
        [8, 13, 9, 14, "T"], [11, 4, 11, 4, "T"], [2, 12, 2, 13, "T"], [13, 17, 14, 17, "T"],
        [5, 15, 5, 15, "R"], [12, 7, 12, 7, "R"],
        [21, 15, 22, 16, "T"], [26, 6, 27, 7, "T"], [30, 3, 31, 3, "R"], [23, 2, 23, 3, "T"],
        [27, 11, 29, 11, "R"], [26, 17, 28, 17, "T"], [30, 8, 30, 9, "R"],
    ] as TileFill[],
    ground: [
        [1, 1, 32, 18, "g"],
        [6, 4, 6, 10, "p"], [7, 10, 15, 11, "p"], [16, 10, 17, 11, "b"], [18, 10, 25, 11, "p"], [25, 12, 25, 14, "p"], [26, 14, 29, 14, "p"],
        [1, 15, 4, 18, "f"], [28, 1, 32, 2, "f"], [19, 4, 21, 5, "f"],
    ] as TileFill[],
};

export function topDownRpg(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Köy", "2d");
    scene.settings.background = { mode: "solid", color: "#14532d", topColor: "#14532d" };

    const heroScript = scriptAsset("Hero.cs", `
using UnityEngine;
using UnityEngine.UI;

// Kahraman: WASD / ok tuşları ile yürür, Space (ya da J) ile kılıç sallar, E ile konuşur ve etkileşir.
public class Hero : MonoBehaviour
{
    public static Hero Instance;

    [Header("Hareket")]
    public float speed = 4.5f;

    [Header("Savaş")]
    public int maxHealth = 5;
    public float attackRange = 0.65f;
    public float attackCooldown = 0.35f;
    public Transform slash;

    [Header("Arayüz")]
    public Text heartsText;
    public Text promptText;

    [HideInInspector] public bool hasKey;
    [HideInInspector] public int health;
    [HideInInspector] public bool frozen;

    private Rigidbody2D rb;
    private SpriteRenderer body;
    private Vector3 facing = Vector3.down;
    private float nextAttack;
    private float invincibleUntil;
    private float knockbackUntil;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        body = GetComponent<SpriteRenderer>();
        health = maxHealth;
        UpdateHearts();
        slash.gameObject.SetActive(false);
    }

    void Update()
    {
        GameObject target = frozen ? null : NearestInteractable();
        promptText.text = target != null ? "E: " + target.GetComponent<Interactable>().prompt : "";
        if (frozen)
        {
            rb.velocity = Vector2.zero;
            return;
        }

        Vector2 input = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
        if (input.sqrMagnitude > 1) input = input.normalized;
        // Bakış yönü dört yönden biridir: kılıç o yöne vurur.
        if (input.x != 0 || input.y != 0)
            facing = Mathf.Abs(input.x) > Mathf.Abs(input.y) ? new Vector3(Mathf.Sign(input.x), 0, 0) : new Vector3(0, Mathf.Sign(input.y), 0);
        if (Time.time > knockbackUntil) rb.velocity = input * speed;

        if ((Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.J)) && Time.time >= nextAttack) Attack();
        if (Input.GetKeyDown(KeyCode.E) && target != null && !Dialogue.Instance.Busy()) target.SendMessage("Interact");

        // Hasar aldıktan sonraki bir saniye boyunca yanıp söner ve hasar almaz.
        body.enabled = Time.time > invincibleUntil || Mathf.Repeat(Time.time * 12f, 1f) > 0.5f;
    }

    void Attack()
    {
        nextAttack = Time.time + attackCooldown;
        Vector3 center = transform.position + facing * 0.75f;
        slash.localPosition = facing * 0.75f;
        slash.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(facing.y, facing.x) * Mathf.Rad2Deg);
        slash.gameObject.SetActive(true);
        Tween.PunchScale(slash, 0.4f, 0.15f);
        Timer.After(0.12f, () => slash.gameObject.SetActive(false));
        Audio.Play("shoot", 0.3f);
        foreach (Collider2D hit in Physics2D.OverlapCircleAll(center, attackRange))
        {
            if (hit.CompareTag("Enemy")) hit.GetComponent<Slime>().Hit(facing);
        }
    }

    public void TakeDamage(int amount, Vector3 from)
    {
        if (Time.time < invincibleUntil || health <= 0) return;
        health = Mathf.Max(0, health - amount);
        invincibleUntil = Time.time + 1f;
        knockbackUntil = Time.time + 0.15f;
        Vector3 away = (transform.position - from).normalized;
        rb.velocity = new Vector2(away.x, away.y) * 9f;
        UpdateHearts();
        Audio.Play("hit", 0.5f);
        Tween.Shake(Camera.main.transform, 0.15f, 0.2f);
        if (health <= 0) RpgGame.Instance.Lose();
    }

    public void Heal(int amount)
    {
        health = Mathf.Min(maxHealth, health + amount);
        UpdateHearts();
    }

    void UpdateHearts()
    {
        string hearts = "";
        for (int i = 0; i < maxHealth; i++) hearts += i < health ? "♥" : "♡";
        heartsText.text = hearts;
        Tween.PunchScale(heartsText, 0.2f, 0.2f);
    }

    // "Interactable" etiketli en yakın nesne (köylü, sandık…).
    GameObject NearestInteractable()
    {
        GameObject best = null;
        float bestDistance = 1.6f;
        foreach (GameObject candidate in GameObject.FindGameObjectsWithTag("Interactable"))
        {
            float distance = Vector3.Distance(candidate.transform.position, transform.position);
            if (distance < bestDistance)
            {
                best = candidate;
                bestDistance = distance;
            }
        }
        return best;
    }
}`);

    const interactableScript = scriptAsset("Interactable.cs", `
using UnityEngine;

// Yanına gelince ekranda "E: …" yazısını gösterir. E'ye basılınca nesnedeki Interact() çağrılır.
public class Interactable : MonoBehaviour
{
    public string prompt = "Konuş";
}`);

    const npcScript = scriptAsset("Npc.cs", `
using UnityEngine;

// Konuşulabilen köylü. Anahtarı bulmadan ve bulduktan sonra farklı şeyler söyler.
public class Npc : MonoBehaviour
{
    public string npcName = "Bilge Ayla";
    public string[] lines = {
        "Merhaba gezgin! Köyümüze hoş geldin.",
        "Nehrin ötesinde atalarımızın hazine sandığı var.",
        "Ama köprüdeki kapı kilitli. Anahtar kuzeybatıdaki çiçekli çayırda.",
        "Dikkat et: balçıklar çayırı mesken tuttu. Space ile kılıcını salla!"
    };
    public string[] keyLines = {
        "Anahtarı bulmuşsun! Köprüdeki kapıya git, sandık doğuda seni bekliyor."
    };

    void Interact()
    {
        Dialogue.Instance.Show(npcName, Hero.Instance.hasKey ? keyLines : lines);
    }
}`);

    const dialogueScript = scriptAsset("Dialogue.cs", `
using UnityEngine;
using UnityEngine.UI;

// Ekranın altındaki konuşma kutusu: E / Space / Enter bir sonraki satıra geçer.
public class Dialogue : MonoBehaviour
{
    public static Dialogue Instance;
    public GameObject panel;
    public Text nameText;
    public Text lineText;

    [HideInInspector] public bool open;
    private string[] current;
    private int index;
    private float changedAt = -1f;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        panel.SetActive(false);
    }

    // Kutuyu açan ya da kapatan tuş aynı karede başka bir şeyi tetiklemesin.
    public bool Busy()
    {
        return open || Time.time - changedAt < 0.15f;
    }

    public void Show(string speaker, string[] lines)
    {
        if (Busy()) return;
        current = lines;
        index = 0;
        open = true;
        changedAt = Time.time;
        nameText.text = speaker;
        lineText.text = lines[0];
        panel.SetActive(true);
        Hero.Instance.frozen = true;
        Audio.Play("blip", 0.4f);
    }

    void Update()
    {
        if (!open || Time.time - changedAt < 0.1f) return;
        if (Input.GetKeyDown(KeyCode.E) || Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return))
        {
            index++;
            if (index >= current.Length)
            {
                Close();
                return;
            }
            lineText.text = current[index];
            Audio.Play("blip", 0.3f);
        }
    }

    void Close()
    {
        open = false;
        changedAt = Time.time;
        panel.SetActive(false);
        Hero.Instance.frozen = false;
        RpgGame.Instance.DialogueClosed();
    }
}`);

    const slimeScript = scriptAsset("Slime.cs", `
using UnityEngine;

// Balçık: rastgele dolaşır, kahraman yaklaşınca kovalar ve değince canını azaltır. İki kılıç darbesiyle ölür.
public class Slime : MonoBehaviour
{
    public int health = 2;
    public float speed = 1.4f;
    public float chaseSpeed = 2.3f;
    public float sightRange = 4.5f;
    [Range(0, 1)]
    public float heartDropChance = 0.4f;
    public GameObject deathEffect;
    public GameObject heartPrefab;

    private Rigidbody2D rb;
    private Vector2 wander;
    private float nextTurn;
    private float stunnedUntil;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        PickDirection();
    }

    void Update()
    {
        if (Time.time < stunnedUntil || Hero.Instance.health <= 0 || Hero.Instance.frozen)
        {
            if (Hero.Instance.frozen) rb.velocity = Vector2.zero;
            return;
        }
        Vector3 toHero = Hero.Instance.transform.position - transform.position;
        if (toHero.magnitude < sightRange)
        {
            Vector3 direction = toHero.normalized;
            rb.velocity = new Vector2(direction.x, direction.y) * chaseSpeed;
        }
        else
        {
            if (Time.time > nextTurn) PickDirection();
            rb.velocity = wander * speed;
        }
    }

    void PickDirection()
    {
        float angle = Random.Range(0f, 360f) * Mathf.Deg2Rad;
        wander = Random.value < 0.25f ? Vector2.zero : new Vector2(Mathf.Cos(angle), Mathf.Sin(angle));
        nextTurn = Time.time + Random.Range(1f, 2.5f);
    }

    public void Hit(Vector3 direction)
    {
        health--;
        stunnedUntil = Time.time + 0.3f;
        rb.velocity = new Vector2(direction.x, direction.y) * 8f;
        Tween.PunchScale(transform, 0.3f, 0.2f);
        Audio.Play("hit", 0.4f);
        if (health <= 0) Die();
    }

    void Die()
    {
        Instantiate(deathEffect, transform.position, Quaternion.identity);
        if (Random.value < heartDropChance) Instantiate(heartPrefab, transform.position, Quaternion.identity);
        RpgGame.Instance.SlimeDefeated();
        Destroy(gameObject);
    }

    void OnCollisionStay2D(Collision2D collision)
    {
        if (collision.gameObject.CompareTag("Player")) Hero.Instance.TakeDamage(1, transform.position);
    }
}`);

    const pickupScript = scriptAsset("Pickup.cs", `
using UnityEngine;

// Kahraman değince toplanır: anahtar ya da can veren kalp.
public class Pickup : MonoBehaviour
{
    public bool isKey = false;

    void OnTriggerEnter2D(Collider2D other)
    {
        if (!other.CompareTag("Player")) return;
        if (isKey) RpgGame.Instance.GotKey();
        else Hero.Instance.Heal(1);
        Audio.Play(isKey ? "powerup" : "coin", 0.5f);
        Destroy(gameObject);
    }
}`);

    const gateScript = scriptAsset("Gate.cs", `
using UnityEngine;

// Köprüdeki kilitli kapı: anahtarla değince açılır.
public class Gate : MonoBehaviour
{
    private bool opened;

    void OnCollisionEnter2D(Collision2D collision)
    {
        if (opened || !collision.gameObject.CompareTag("Player")) return;
        if (Hero.Instance.hasKey) Open();
        else HUD.Show("Kapı kilitli. Anahtarı bul!", 1.5f);
    }

    void Open()
    {
        opened = true;
        GetComponent<Collider2D>().enabled = false;
        Audio.Play("powerup", 0.5f);
        HUD.Show("Kapı açıldı!", 1.5f);
        RpgGame.Instance.GateOpened();
        Tween.Scale(transform, new Vector3(transform.localScale.x, 0, 1), 0.4f).OnComplete(() => gameObject.SetActive(false));
    }
}`);

    const chestScript = scriptAsset("Chest.cs", `
using UnityEngine;

// Hazine sandığı: E ile açılır ve oyunu kazandırır.
public class Chest : MonoBehaviour
{
    public Transform lid;

    void Interact()
    {
        gameObject.tag = "Untagged";
        Tween.Move(lid, lid.position + new Vector3(0, 0.35f, 0), 0.3f);
        Tween.PunchScale(transform, 0.3f, 0.3f);
        Audio.Play("powerup", 0.6f);
        RpgGame.Instance.Win();
    }
}`);

    const gameScript = scriptAsset("RpgGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Görev akışı: bilgeyle konuş → anahtarı al → kapıyı aç → sandığı bul.
public class RpgGame : MonoBehaviour
{
    public static RpgGame Instance;
    public Text questText;
    public Text keyText;
    public GameObject endPanel;
    public Text endTitle;
    public Text resultText;

    private int slimes;
    private bool talked;
    private bool finished;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        questText.text = "Görev: Köy bilgesiyle konuş";
        HUD.Show("WASD: yürü  •  Space: kılıç  •  E: konuş", 3f);
    }

    public void DialogueClosed()
    {
        if (talked || Hero.Instance.hasKey) return;
        talked = true;
        questText.text = "Görev: Kuzeybatıdaki çayırdan anahtarı al";
    }

    public void GotKey()
    {
        Hero.Instance.hasKey = true;
        keyText.text = "Anahtar: var";
        Tween.PunchScale(keyText, 0.3f, 0.3f);
        questText.text = "Görev: Köprüdeki kapıyı aç";
        HUD.Show("Anahtarı aldın!", 1.5f);
    }

    public void GateOpened()
    {
        keyText.text = "Anahtar: kullanıldı";
        questText.text = "Görev: Doğudaki sandığı bul";
    }

    public void SlimeDefeated()
    {
        slimes++;
    }

    public void Win()
    {
        if (finished) return;
        finished = true;
        Hero.Instance.frozen = true;
        questText.text = "Görev tamamlandı!";
        endTitle.text = "Hazineyi buldun!";
        resultText.text = "Süre: " + Mathf.FloorToInt(Time.timeSinceLevelLoad) + " sn\\nYenilen balçık: " + slimes;
        Audio.Play("win");
        Timer.After(0.8f, () => endPanel.SetActive(true));
    }

    public void Lose()
    {
        if (finished) return;
        finished = true;
        Hero.Instance.frozen = true;
        endTitle.text = "Bayıldın...";
        resultText.text = "Yenilen balçık: " + slimes + "\\nBir dahaki sefere kalpleri topla!";
        Audio.Play("lose");
        Timer.After(0.6f, () => endPanel.SetActive(true));
    }

    // "Yeniden Başla" butonu (R tuşu) bunu çağırır.
    public void Restart()
    {
        SceneManager.ReloadScene();
    }
}`);

    const cameraScript = scriptAsset("CameraFollow.cs", `
using UnityEngine;

// Kamera kahramanı yumuşakça izler ama haritanın dışını göstermez.
public class CameraFollow : MonoBehaviour
{
    public Transform target;
    public float smooth = 6f;
    public Vector2 min = new Vector2(8.9f, 5f);
    public Vector2 max = new Vector2(25.1f, 15f);

    void LateUpdate()
    {
        if (target == null) return;
        Vector3 goal = new Vector3(Mathf.Clamp(target.position.x, min.x, max.x), Mathf.Clamp(target.position.y, min.y, max.y), transform.position.z);
        transform.position = Vector3.Lerp(transform.position, goal, smooth * Time.deltaTime);
    }
}`);

    const autoDestroy = scriptAsset("AutoDestroy.cs", `
using UnityEngine;

public class AutoDestroy : MonoBehaviour
{
    public float lifetime = 1f;

    void Start()
    {
        Destroy(gameObject, lifetime);
    }
}`);

    project.scripts = [heroScript, interactableScript, npcScript, dialogueScript, slimeScript, pickupScript, gateScript, chestScript, gameScript, cameraScript, autoDestroy];

    const bob = animationPreset("bob", "2d");
    const poof = prefab("Poof", entity("Poof", [burst(["#bef264", "#16a34a"], 18, 3, 0.2), script(autoDestroy, { lifetime: 1 })]));
    const heart = prefab("Heart", entity("Heart", [
        sprite("#f43f5e", "hexagon", 4),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        createAnimation({ clips: [bob] }),
        script(pickupScript, { isKey: false }),
    ], { scale: { x: 0.45, y: 0.45 } }));
    const slime = prefab("Slime", entity("Slime", [
        sprite("#84cc16", "circle", 3),
        createRigidBody({ gravityScale: 0, useGravity: false, linearDamping: 4, freezeRotation: true, freezePosition: { x: false, y: false, z: true } }),
        createCollider({ shape: "circle", radius: 0.5 }),
        script(slimeScript, { deathEffect: prefabRef(poof), heartPrefab: prefabRef(heart) }),
    ], { scale: { x: 0.7, y: 0.55 }, tag: "Enemy" }));
    project.prefabs = [poof, heart, slime];

    const cell = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });
    const ground = entity("Ground", [tilemap(RPG_GROUND, RPG_MAP.ground, { sortingLayer: -10 })]);
    const walls = entity("Walls", [tilemap(RPG_WALLS, RPG_MAP.walls)], { tag: "Wall" });

    const hero = entity("Hero", [
        sprite("#ec4899", "roundedSquare", 5),
        createRigidBody({ gravityScale: 0, useGravity: false, linearDamping: 0, freezeRotation: true, freezePosition: { x: false, y: false, z: true } }),
        createCollider({ shape: "box", size: { x: 0.9, y: 0.9, z: 1 } }),
    ], { position: cell(5, 4), scale: { x: 0.8, y: 0.8 }, tag: "Player" });
    const eyes = entity("Eyes", [sprite("#1e1b4b", "roundedSquare", 6)], { position: { y: 0.12 }, scale: { x: 0.6, y: 0.16 }, parentId: hero.id });
    const slash = entity("Slash", [sprite("#fde68a", "triangle", 7)], { position: { y: -0.75 }, scale: { x: 0.55, y: 0.9 }, parentId: hero.id });

    const elder = entity("Elder", [
        sprite("#a855f7", "roundedSquare", 5),
        createCollider({ shape: "box" }),
        script(interactableScript, { prompt: "Konuş" }),
        script(npcScript),
    ], { position: cell(9, 6), scale: { x: 0.8, y: 0.8 }, tag: "Interactable" });
    const elderHat = entity("Hat", [sprite("#7c3aed", "triangle", 6)], { position: { y: 0.7 }, scale: { x: 0.9, y: 0.6 }, parentId: elder.id });

    const key = entity("Key", [
        sprite("#f59e0b", "diamond", 4),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        createAnimation({ clips: [animationPreset("bob", "2d")] }),
        script(pickupScript, { isKey: true }),
    ], { position: cell(3, 17), scale: { x: 0.5, y: 0.5 } });
    const gate = entity("Gate", [sprite("#7c2d12", "square", 4), createCollider({ shape: "box" }), script(gateScript)], { position: { x: 16.5, y: 11 }, scale: { x: 0.6, y: 2 }, tag: "Gate" });

    const chest = entity("Chest", [
        sprite("#a16207", "roundedSquare", 4),
        createCollider({ shape: "box" }),
        script(interactableScript, { prompt: "Sandığı aç" }),
    ], { position: cell(29, 14), scale: { x: 0.9, y: 0.7 }, tag: "Interactable" });
    const lid = entity("Lid", [sprite("#facc15", "roundedSquare", 5)], { position: { y: 0.45 }, scale: { x: 1.05, y: 0.35 }, parentId: chest.id });
    chest.components.push(script(chestScript, { lid: ref(lid) }));

    const slimes: GameEntity[] = [[4, 15], [7, 17], [12, 15], [22, 13], [27, 9], [25, 4], [30, 16]].map(([x, y], index) => entity(`Slime ${index + 1}`, [
        sprite("#84cc16", "circle", 3),
        createRigidBody({ gravityScale: 0, useGravity: false, linearDamping: 4, freezeRotation: true, freezePosition: { x: false, y: false, z: true } }),
        createCollider({ shape: "circle", radius: 0.5 }),
        script(slimeScript, { deathEffect: prefabRef(poof), heartPrefab: prefabRef(heart) }),
    ], { position: cell(x, y), scale: { x: 0.7, y: 0.55 }, tag: "Enemy" }));
    const freeHeart = entity("Heart", [
        sprite("#f43f5e", "hexagon", 4),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        createAnimation({ clips: [bob] }),
        script(pickupScript, { isKey: false }),
    ], { position: cell(13, 2), scale: { x: 0.45, y: 0.45 } });

    const camera = camera2d(5, 8.9, 5);
    camera.components.push(script(cameraScript, { target: ref(hero) }));

    const heartsText = entity("HeartsText", [uiText("♥♥♥♥♥", { anchor: "top-left", fontSize: 30, color: "#fb7185" })]);
    const keyText = entity("KeyText", [uiText("Anahtar: yok", { anchor: "top-left", fontSize: 16, offset: { x: 24, y: 66 }, color: "#fde68a", bold: false })]);
    const questText = entity("QuestText", [uiText("", { anchor: "top-right", fontSize: 16, color: "#f5f3ff", bold: false })]);
    const promptText = entity("PromptText", [uiText("", { anchor: "bottom", fontSize: 18, offset: { x: 0, y: 26 }, color: "#fde68a" })]);

    const dialoguePanel = entity("DialoguePanel", [createUIPanel({ anchor: "bottom", offset: { x: 0, y: 18 }, width: 660, height: 132, color: "#1e1b4b", opacity: 0.94, order: 30 })], { active: false });
    const speaker = entity("SpeakerText", [uiText("", { anchor: "bottom", fontSize: 18, offset: { x: 0, y: 112 }, color: "#f0abfc", order: 35 })], { parentId: dialoguePanel.id });
    const line = entity("LineText", [uiText("", { anchor: "bottom", fontSize: 18, offset: { x: 0, y: 64 }, order: 35, bold: false })], { parentId: dialoguePanel.id });
    const next = entity("NextHint", [uiText("E ▸", { anchor: "bottom", fontSize: 14, offset: { x: 290, y: 28 }, color: "#c4b5fd", order: 35, bold: false })], { parentId: dialoguePanel.id });
    const dialogue = entity("Dialogue", []);
    dialogue.components.push(script(dialogueScript, { panel: ref(dialoguePanel), nameText: ref(speaker), lineText: ref(line) }));

    const manager = entity("RpgGame", []);
    const end = gameOverPanel(manager, "Hazineyi buldun!", "Yeniden Başla", "#7c3aed");
    manager.components.push(script(gameScript, { questText: ref(questText), keyText: ref(keyText), endPanel: ref(end.panel), endTitle: ref(end.heading), resultText: ref(end.result) }));
    hero.components.push(script(heroScript, { slash: ref(slash), heartsText: ref(heartsText), promptText: ref(promptText) }));

    scene.objects.push(
        camera, ground, walls, hero, eyes, slash, elder, elderHat, key, gate, chest, lid, freeHeart, ...slimes,
        heartsText, keyText, questText, promptText, dialoguePanel, speaker, line, next, dialogue, manager, ...end.entities,
    );
    return finishProject(project, scene, "rpg-topdown-2d");
}

// ---------------------------------------------------------------------------
// 3D obstacle course
// ---------------------------------------------------------------------------

export function obstacleCourse(name: string): GameProjectDocument {
    const project = createBlankProject(name, "3d");
    const scene = createEmptyScene("Parkur", "3d");
    scene.settings.background = { mode: "gradient", color: "#fdf2f8", topColor: "#a5b4fc" };
    scene.settings.ambientColor = "#f5d0fe";
    scene.settings.ambientIntensity = 0.6;
    scene.settings.fog = { ...scene.settings.fog, enabled: true, color: "#fce7f3", near: 45, far: 130 };

    const playerScript = scriptAsset("CoursePlayer.cs", `
using UnityEngine;

// Parkur koşucusu: WASD / ok tuşları ile koş, Space ile zıpla.
// Altındaki platform hareket ediyorsa onun hızını da alır; böylece platform seni taşır.
public class CoursePlayer : MonoBehaviour
{
    public static CoursePlayer Instance;

    [Header("Hareket")]
    public float speed = 6f;
    [Range(0, 1)]
    public float airControl = 0.35f;
    public float turnSpeed = 12f;

    [Header("Zıplama")]
    public float jumpVelocity = 8.5f;
    public float coyoteTime = 0.12f;
    public float jumpBuffer = 0.12f;

    private Rigidbody rb;
    private float lastGrounded = -1f;
    private float lastPressed = -1f;
    private float jumpedAt = -1f;
    private float stunnedUntil;
    private Vector3 platformVelocity;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        rb = GetComponent<Rigidbody>();
    }

    void Update()
    {
        if (CourseGame.Instance.finished) return;
        if (Input.GetButtonDown("Jump")) lastPressed = Time.time;
        if (Time.time - lastPressed <= jumpBuffer && Time.time - lastGrounded <= coyoteTime)
        {
            lastPressed = -1f;
            lastGrounded = -1f;
            jumpedAt = Time.time;
            rb.velocity = new Vector3(rb.velocity.x, jumpVelocity, rb.velocity.z);
            Audio.Play("jump", 0.35f);
            Tween.PunchScale(transform, 0.12f, 0.2f);
        }
        // Gidilen yöne doğru dön.
        Vector3 input = ReadInput();
        if (input.sqrMagnitude > 0.01f)
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(input), turnSpeed * Time.deltaTime);
    }

    void FixedUpdate()
    {
        if (CourseGame.Instance.finished)
        {
            rb.velocity = new Vector3(0, rb.velocity.y, 0);
            return;
        }
        if (Time.time < stunnedUntil) return;
        bool grounded = Time.time - lastGrounded <= 0.05f;
        Vector3 target = ReadInput() * speed + (grounded ? platformVelocity : Vector3.zero);
        float control = grounded ? 1f : airControl;
        Vector3 v = rb.velocity;
        v.x = Mathf.Lerp(v.x, target.x, control);
        v.z = Mathf.Lerp(v.z, target.z, control);
        rb.velocity = v;
    }

    Vector3 ReadInput()
    {
        Vector3 input = new Vector3(Input.GetAxisRaw("Horizontal"), 0, Input.GetAxisRaw("Vertical"));
        return input.sqrMagnitude > 1 ? input.normalized : input;
    }

    void OnCollisionEnter(Collision collision)
    {
        TouchGround(collision);
    }

    void OnCollisionStay(Collision collision)
    {
        TouchGround(collision);
    }

    // Normali yukarı bakan bir temas = ayağımızın altında zemin var.
    void TouchGround(Collision collision)
    {
        if (Time.time - jumpedAt < 0.1f) return;
        for (int i = 0; i < collision.contactCount; i++)
        {
            if (collision.GetContact(i).normal.y > 0.5f)
            {
                lastGrounded = Time.time;
                platformVelocity = collision.rigidbody != null ? collision.rigidbody.velocity : Vector3.zero;
                platformVelocity.y = 0;
                return;
            }
        }
    }

    // Süpürgeler ve iticiler oyuncuyu kısa bir süre kontrolsüz savurur.
    public void Knockback(Vector3 force)
    {
        if (Time.time < stunnedUntil) return;
        stunnedUntil = Time.time + 0.4f;
        rb.velocity = force;
        Audio.Play("hit", 0.5f);
        Tween.Shake(Camera.main.transform, 0.2f, 0.25f);
    }

    public void Teleport(Vector3 position)
    {
        rb.velocity = Vector3.zero;
        transform.position = position;
        stunnedUntil = 0;
    }
}`);

    const platformScript = scriptAsset("MovingPlatform.cs", `
using UnityEngine;

// Kinematik platform başlangıç noktası ile (başlangıç + offset) arasında yumuşakça gidip gelir.
// Hızı Rigidbody'ye verildiği için üstündeki oyuncu platformu "hisseder" ve onunla taşınır.
public class MovingPlatform : MonoBehaviour
{
    public Vector3 offset = new Vector3(5, 0, 0);
    public float duration = 3f;
    [Range(0, 1)]
    public float phase = 0f;

    private Rigidbody rb;
    private Vector3 start;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
        start = transform.position;
    }

    void FixedUpdate()
    {
        float t = (1f - Mathf.Cos((Time.time / duration + phase) * Mathf.PI * 2f)) * 0.5f;
        Vector3 target = start + offset * t;
        rb.velocity = (target - transform.position) / Time.fixedDeltaTime;
    }
}`);

    const spinnerScript = scriptAsset("Spinner.cs", `
using UnityEngine;

// Dönen süpürge: çarptığı oyuncuyu savurur. Üstünden zıpla ya da zamanını kolla!
public class Spinner : MonoBehaviour
{
    public float degreesPerSecond = 90f;
    public float knockback = 9f;

    void Update()
    {
        transform.Rotate(0, degreesPerSecond * Time.deltaTime, 0);
    }

    void OnCollisionEnter(Collision collision)
    {
        if (!collision.gameObject.CompareTag("Player")) return;
        Vector3 away = collision.transform.position - transform.position;
        away.y = 0;
        CoursePlayer.Instance.Knockback(away.normalized * knockback + Vector3.up * 4f);
    }
}`);

    const pusherScript = scriptAsset("Pusher.cs", `
using UnityEngine;

// İnce köprüdeki itici blok: değdiği oyuncuyu yana savurur.
public class Pusher : MonoBehaviour
{
    public float knockback = 7f;
    private Rigidbody rb;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
    }

    void OnCollisionEnter(Collision collision)
    {
        if (!collision.gameObject.CompareTag("Player")) return;
        float side = rb.velocity.x >= 0 ? 1f : -1f;
        CoursePlayer.Instance.Knockback(new Vector3(side * knockback, 3f, 0));
    }
}`);

    const tileScript = scriptAsset("FallingTile.cs", `
using UnityEngine;

// Üstüne basılınca titrer, kaybolur ve bir süre sonra geri gelir: durmadan koş!
public class FallingTile : MonoBehaviour
{
    public float delay = 0.45f;
    public float respawnTime = 2.5f;

    private bool falling;
    private Color original;
    private MeshRenderer view;
    private Collider solid;

    void Start()
    {
        view = GetComponent<MeshRenderer>();
        solid = GetComponent<Collider>();
        original = view.material.color;
    }

    void OnCollisionEnter(Collision collision)
    {
        if (falling || !collision.gameObject.CompareTag("Player")) return;
        falling = true;
        Tween.Shake(transform, 0.06f, delay);
        Tween.Color(gameObject, new Color(0.98f, 0.45f, 0.2f), delay);
        Timer.After(delay, Vanish);
    }

    void Vanish()
    {
        view.enabled = false;
        solid.enabled = false;
        Audio.Play("blip", 0.3f);
        Timer.After(respawnTime, Return);
    }

    void Return()
    {
        view.material.color = original;
        view.enabled = true;
        solid.enabled = true;
        falling = false;
    }
}`);

    const checkpointScript = scriptAsset("Checkpoint.cs", `
using UnityEngine;

// Kontrol noktası: düşersen buradan devam edersin. Bayrak yeşile döner.
public class Checkpoint : MonoBehaviour
{
    public int index = 1;
    public Transform flag;
    private bool reached;

    void OnTriggerEnter(Collider other)
    {
        if (reached || !other.CompareTag("Player")) return;
        reached = true;
        Tween.Color(flag.gameObject, new Color(0.13f, 0.77f, 0.37f), 0.3f);
        Tween.PunchScale(flag, 0.4f, 0.4f);
        CourseGame.Instance.ReachCheckpoint(index, transform.position + Vector3.up * 1.2f);
    }
}`);

    const finishScript = scriptAsset("FinishLine.cs", `
using UnityEngine;

public class FinishLine : MonoBehaviour
{
    public GameObject confetti;

    void OnTriggerEnter(Collider other)
    {
        if (!other.CompareTag("Player") || CourseGame.Instance.finished) return;
        Instantiate(confetti, transform.position + Vector3.up, Quaternion.identity);
        CourseGame.Instance.Finish();
    }
}`);

    const cameraScript = scriptAsset("CourseCamera.cs", `
using UnityEngine;

// Kamera oyuncuyu arkadan ve yukarıdan yumuşakça izler.
public class CourseCamera : MonoBehaviour
{
    public Transform target;
    public Vector3 offset = new Vector3(0, 5.5f, -9f);
    public float smooth = 5f;

    void LateUpdate()
    {
        if (target == null) return;
        transform.position = Vector3.Lerp(transform.position, target.position + offset, smooth * Time.deltaTime);
        transform.LookAt(target.position + Vector3.up * 1.2f);
    }
}`);

    const gameScript = scriptAsset("CourseGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Süreyi, kontrol noktalarını ve düşüşleri tutar. En iyi süre PlayerPrefs'te saklanır.
public class CourseGame : MonoBehaviour
{
    public static CourseGame Instance;
    public Transform player;
    public Text timeText;
    public Text checkpointText;
    public Text bestText;
    public GameObject endPanel;
    public Text resultText;
    public int checkpointCount = 3;
    public float fallHeight = -4f;

    [HideInInspector] public bool finished;
    private Vector3 respawn;
    private int checkpoint;
    private int falls;
    private float elapsed;
    private float best;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        respawn = player.position;
        best = PlayerPrefs.GetFloat("course.best", 0f);
        bestText.text = best > 0 ? "En iyi: " + FormatTime(best) : "En iyi: —";
        checkpointText.text = "Kontrol: 0/" + checkpointCount;
        HUD.Show("WASD: koş  •  Space: zıpla  •  Bitiş çizgisine ulaş!", 3f);
    }

    void Update()
    {
        if (finished) return;
        elapsed += Time.deltaTime;
        timeText.text = FormatTime(elapsed);
        if (player.position.y < fallHeight) Respawn();
    }

    // 75.4 → "1:15.40"
    public static string FormatTime(float seconds)
    {
        int minutes = Mathf.FloorToInt(seconds / 60f);
        float rest = seconds - minutes * 60;
        return minutes + ":" + rest.ToString("00.00");
    }

    public void ReachCheckpoint(int index, Vector3 position)
    {
        if (index <= checkpoint) return;
        checkpoint = index;
        respawn = position;
        checkpointText.text = "Kontrol: " + checkpoint + "/" + checkpointCount;
        Tween.PunchScale(checkpointText, 0.3f, 0.3f);
        Audio.Play("powerup", 0.5f);
        HUD.Show("Kontrol noktası!", 1.2f);
    }

    void Respawn()
    {
        falls++;
        CoursePlayer.Instance.Teleport(respawn);
        Audio.Play("lose", 0.4f);
        HUD.Show("Düştün! Son kontrol noktasından devam.", 1.2f);
    }

    public void Finish()
    {
        if (finished) return;
        finished = true;
        bool record = best <= 0 || elapsed < best;
        if (record) PlayerPrefs.SetFloat("course.best", elapsed);
        resultText.text = (record ? "Yeni rekor!\\n" : "") + "Süre: " + FormatTime(elapsed) + "\\nDüşüş: " + falls;
        Audio.Play("win");
        Timer.After(0.8f, () => endPanel.SetActive(true));
    }

    // "Tekrar Dene" butonu (R tuşu) bunu çağırır.
    public void Restart()
    {
        SceneManager.ReloadScene();
    }
}`);

    project.scripts = [playerScript, platformScript, spinnerScript, pusherScript, tileScript, checkpointScript, finishScript, cameraScript, gameScript];

    const confetti = prefab("Confetti", entity("Confetti", [
        createParticleSystem({ loop: false, duration: 0.3, emissionRate: 0, burstCount: 70, maxParticles: 80, lifetime: 1.6, startSpeed: 7, spread: 60, startSize: 0.2, endSize: 0.05, startColor: "#f472b6", endColor: "#fbbf24", gravityModifier: 0.8, worldSpace: true }),
    ], { rotation: { x: -90 } }));
    project.prefabs = [confetti];

    const objects: GameEntity[] = [];
    const block = (label: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, extra: GameEntity["components"] = [], tag = "Untagged") => {
        const made = entity(label, [
            createMeshRenderer({ mesh: "cube", material: { color, roughness: 0.55 } }),
            createCollider({ shape: "box", friction: 0.2 }),
            ...extra,
        ], { position: { x, y, z }, scale: { x: sx, y: sy, z: sz }, tag });
        objects.push(made);
        return made;
    };
    const mover = (offset: { x: number; y: number; z: number }, duration: number, phase = 0) => [
        createRigidBody({ bodyType: "kinematic", useGravity: false, linearDamping: 0, freezeRotation: true }),
        script(platformScript, { offset, duration, phase }),
    ];

    // Start and the stair jumps.
    block("Start", 0, -0.5, 0, 6, 1, 8, "#c4b5fd");
    block("Step 1", 1.5, -0.25, 7.5, 2.6, 1, 2.6, "#a78bfa");
    block("Step 2", -1.5, 0.25, 11.5, 2.6, 1, 2.6, "#a78bfa");
    block("Step 3", 1, 0.75, 15.5, 2.6, 1, 2.6, "#a78bfa");
    // A sliding platform and an elevator.
    block("Slider", -3, 0.75, 20.5, 2.6, 0.5, 2.6, "#f9a8d4", mover({ x: 6, y: 0, z: 0 }, 3));
    block("Landing", 0, 0.5, 26, 6, 1, 4, "#c4b5fd");
    block("Elevator", 0, 0.75, 30.5, 2.6, 0.5, 2.6, "#f9a8d4", mover({ x: 0, y: 3, z: 0 }, 3.5));
    // The long deck with two sweepers.
    block("Deck", 0, 3.5, 44.5, 6, 1, 22, "#c4b5fd");
    const sweeper = (z: number, speed: number) => {
        objects.push(entity("Pivot", [createMeshRenderer({ mesh: "cylinder", material: { color: "#64748b" } })], { position: { x: 0, y: 4.3, z }, scale: { x: 0.35, y: 0.3, z: 0.35 } }));
        block("Sweeper", 0, 4.45, z, 6.6, 0.45, 0.45, "#f43f5e", [script(spinnerScript, { degreesPerSecond: speed })], "Hazard");
    };
    sweeper(42, 80);
    sweeper(50, -110);
    // Vanishing tiles.
    for (let row = 0; row < 4; row += 1) {
        for (let column = -1; column <= 1; column += 1) {
            block("Tile", column * 2.1, 3.8, 58 + row * 2.2, 1.9, 0.4, 1.9, "#fcd34d", [script(tileScript)]);
        }
    }
    block("Rest", 0, 3.5, 70, 6, 1, 6, "#c4b5fd");
    // The narrow beam with pushers.
    block("Beam", 0, 3.5, 80, 1.4, 1, 12, "#a78bfa");
    block("Pusher", -3, 4.6, 77.5, 1.2, 1.2, 1.2, "#fb7185", [...mover({ x: 6, y: 0, z: 0 }, 2.2), script(pusherScript)], "Hazard");
    block("Pusher", 3, 4.6, 82.5, 1.2, 1.2, 1.2, "#fb7185", [...mover({ x: -6, y: 0, z: 0 }, 1.8, 0.25), script(pusherScript)], "Hazard");
    block("Finish", 0, 3.5, 92, 8, 1, 8, "#fde68a");

    // Checkpoints with flags.
    const checkpoint = (index: number, z: number) => {
        const flag = entity("Flag", [createMeshRenderer({ mesh: "cube", material: { color: "#a855f7", emissive: "#7e22ce", emissiveIntensity: 0.4 } })], { position: { x: 2.4, y: 5.2, z }, scale: { x: 0.8, y: 0.5, z: 0.08 } });
        const pole = entity("Pole", [createMeshRenderer({ mesh: "cylinder", material: { color: "#e2e8f0" } })], { position: { x: 2.8, y: 4.8, z }, scale: { x: 0.08, y: 0.8, z: 0.08 } });
        const zone = entity(`Checkpoint ${index}`, [createCollider({ shape: "box", isTrigger: true }), script(checkpointScript, { index, flag: ref(flag) })], { position: { x: 0, y: 5, z }, scale: { x: 6, y: 2, z: 1 } });
        objects.push(flag, pole, zone);
    };
    checkpoint(1, 35.5);
    checkpoint(2, 54.5);
    checkpoint(3, 69);

    const archColor = { color: "#f59e0b", emissive: "#f59e0b", emissiveIntensity: 0.5 };
    objects.push(
        entity("Arch", [createMeshRenderer({ mesh: "cube", material: archColor })], { position: { x: -3.2, y: 5.5, z: 93 }, scale: { x: 0.5, y: 3, z: 0.5 } }),
        entity("Arch", [createMeshRenderer({ mesh: "cube", material: archColor })], { position: { x: 3.2, y: 5.5, z: 93 }, scale: { x: 0.5, y: 3, z: 0.5 } }),
        entity("Arch", [createMeshRenderer({ mesh: "cube", material: archColor })], { position: { x: 0, y: 7.2, z: 93 }, scale: { x: 6.9, y: 0.5, z: 0.5 } }),
        entity("FinishLine", [createCollider({ shape: "box", isTrigger: true }), script(finishScript, { confetti: prefabRef(confetti) })], { position: { x: 0, y: 5.5, z: 93 }, scale: { x: 6, y: 3, z: 0.6 } }),
        entity("Sea", [createMeshRenderer({ mesh: "plane", receiveShadows: false, material: { color: "#c7d2fe", roughness: 0.3, metallic: 0.1 } })], { position: { x: 0, y: -7, z: 45 }, scale: { x: 80, y: 1, z: 160 } }),
    );

    const player = entity("Player", [
        createMeshRenderer({ mesh: "capsule", material: { color: "#ec4899", emissive: "#be185d", emissiveIntensity: 0.15, roughness: 0.35 } }),
        createRigidBody({ mass: 1, gravityScale: 2, linearDamping: 0, freezeRotation: true }),
        createCollider({ shape: "box", size: { x: 1, y: 2, z: 1 }, friction: 0 }),
        script(playerScript),
    ], { position: { y: 0.6, z: -1.5 }, scale: { x: 0.7, y: 0.55, z: 0.7 }, tag: "Player" });
    const visor = entity("Visor", [createMeshRenderer({ mesh: "cube", castShadows: false, material: { color: "#1e1b4b", emissive: "#38bdf8", emissiveIntensity: 0.6 } })], { position: { y: 0.45, z: 0.45 }, scale: { x: 0.8, y: 0.25, z: 0.2 }, parentId: player.id });

    const camera = entity("Main Camera", [createCamera({ fieldOfView: 60, farClip: 400, primary: true })], { position: { y: 6, z: -11 }, rotation: { x: 20 }, tag: "MainCamera" });
    camera.components.push(script(cameraScript, { target: ref(player) }));
    const light = entity("Directional Light", [createLight({ lightType: "directional", intensity: 1.25, color: "#fff7ed" })], { position: { y: 12 }, rotation: { x: 55, y: -35 } });

    const timeText = entity("TimeText", [uiText("0:00.00", { anchor: "top-left", fontSize: 32, color: "#4c1d95" })]);
    const checkpointText = entity("CheckpointText", [uiText("Kontrol: 0/3", { anchor: "top-left", fontSize: 16, offset: { x: 24, y: 66 }, color: "#7c3aed", bold: false })]);
    const bestText = entity("BestText", [uiText("En iyi: —", { anchor: "top-right", fontSize: 16, color: "#7c3aed", bold: false })]);
    const hint = entity("HintText", [uiText("WASD: koş  •  Space: zıpla", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 14 }, color: "#6d28d9", bold: false, shadow: false })]);
    const manager = entity("CourseGame", []);
    const end = gameOverPanel(manager, "Bitiş!", "Tekrar Dene", "#db2777");
    manager.components.push(script(gameScript, {
        player: ref(player),
        timeText: ref(timeText),
        checkpointText: ref(checkpointText),
        bestText: ref(bestText),
        endPanel: ref(end.panel),
        resultText: ref(end.result),
    }));

    scene.objects.push(camera, light, ...objects, player, visor, manager, timeText, checkpointText, bestText, hint, ...end.entities);
    return finishProject(project, scene, "obstacle-course-3d");
}
