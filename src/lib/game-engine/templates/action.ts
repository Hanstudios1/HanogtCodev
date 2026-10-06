/**
 * Action starter projects: a tower defense game played with the mouse and a
 * twin-stick arena shooter written in C++ (with a C# game manager).
 */
import { animationPreset } from "../animation";
import {
    createAnimation,
    createCollider,
    createRigidBody,
    createSpriteRenderer,
    createUIProgressBar,
} from "../components";
import { createBlankProject, createEmptyScene } from "../scene";
import type { GameEntity, GameProjectDocument, SpriteShape } from "../types";
import { AUTO_DESTROY, burst, camera2d, entity, finishProject, gameOverPanel, prefab, prefabRef, ref, script, scriptAsset, sprite, uiButton, uiText } from "./builders";

function faded(color: string, shape: SpriteShape, opacity: number, sortingLayer: number) {
    return createSpriteRenderer({ color, shape, opacity, sortingLayer });
}

// ---------------------------------------------------------------------------
// Tower defense
// ---------------------------------------------------------------------------

/** Path corners from the spawn (off-screen left) to the castle (right). */
const TD_PATH: Array<[number, number]> = [[-10.6, 2.4], [-6.5, 2.4], [-6.5, -2.6], [-1.5, -2.6], [-1.5, 2.6], [3.5, 2.6], [3.5, -2.6], [7.5, -2.6], [7.5, 1.2], [10.6, 1.2]];
const TD_SPOTS: Array<[number, number]> = [[-8.6, 0], [-4.1, 0], [-4.1, -4.3], [1, 0], [1, 4.3], [-4.1, 4.3], [5.5, 0], [5.5, -4.3]];

export function towerDefense(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Savunma", "2d");
    scene.settings.background = { mode: "gradient", color: "#ecfccb", topColor: "#d9f99d" };

    const pathScript = scriptAsset("EnemyPath.cs", `
using UnityEngine;
using System.Collections.Generic;

// Düşmanların izlediği yol: bu nesnenin çocukları sırasıyla yol noktalarıdır.
// Sahnede bir yol noktasını taşırsan yol da değişir.
public class EnemyPath : MonoBehaviour
{
    public static EnemyPath Instance;
    [HideInInspector] public List<Vector3> points = new List<Vector3>();

    void Awake()
    {
        Instance = this;
        for (int i = 0; i < transform.childCount; i++) points.Add(transform.GetChild(i).position);
    }
}`);

    const creepScript = scriptAsset("Creep.cs", `
using UnityEngine;
using System.Collections.Generic;

// Yol boyunca yürüyen düşman. progress yolda ne kadar ilerlediğidir: kuleler en öndekini hedefler.
public class Creep : MonoBehaviour
{
    public float speed = 1.6f;
    public float maxHealth = 4f;
    public int reward = 8;
    public int damage = 1;
    public Transform healthFill;
    public float barWidth = 1.2f;

    [HideInInspector] public float progress;
    private float health = 4f;
    private int next = 1;

    public void Setup(float hp, float moveSpeed, int gold, int livesCost)
    {
        maxHealth = hp;
        health = hp;
        speed = moveSpeed;
        reward = gold;
        damage = livesCost;
    }

    void Update()
    {
        if (TowerGame.Instance.over) return;
        List<Vector3> points = EnemyPath.Instance.points;
        Vector3 before = transform.position;
        transform.position = Vector3.MoveTowards(before, points[next], speed * Time.deltaTime);
        progress += Vector3.Distance(before, transform.position);
        if (Vector3.Distance(transform.position, points[next]) < 0.001f)
        {
            next++;
            if (next >= points.Count)
            {
                TowerGame.Instance.EnemyEscaped(damage);
                Destroy(gameObject);
            }
        }
    }

    public void TakeDamage(float amount)
    {
        if (health <= 0) return;
        health -= amount;
        // Can çubuğu soldan sağa kısalır.
        float ratio = Mathf.Max(0, health / maxHealth);
        healthFill.localScale = new Vector3(barWidth * ratio, healthFill.localScale.y, 1);
        healthFill.localPosition = new Vector3(-barWidth * (1 - ratio) / 2f, healthFill.localPosition.y, 0);
        if (health <= 0)
        {
            TowerGame.Instance.EnemyKilled(this);
            Destroy(gameObject);
        }
    }
}`);

    const towerScript = scriptAsset("Tower.cs", `
using UnityEngine;

// Kule: menzilindeki en öndeki düşmana ok atar. Üstüne tıklayınca yükseltilir (en fazla 3. seviye).
public class Tower : MonoBehaviour
{
    public GameObject arrowPrefab;
    public Transform head;
    public float range = 2.8f;
    public float fireInterval = 0.55f;
    public float damage = 1f;

    [HideInInspector] public int level = 1;
    private float cooldown;

    void Update()
    {
        if (TowerGame.Instance.over) return;
        cooldown -= Time.deltaTime;
        Creep target = FindTarget();
        if (target == null) return;
        Vector3 direction = target.transform.position - transform.position;
        head.rotation = Quaternion.Euler(0, 0, Mathf.Atan2(direction.y, direction.x) * Mathf.Rad2Deg - 90f);
        if (cooldown > 0) return;
        cooldown = fireInterval;
        GameObject arrow = Instantiate(arrowPrefab, head.position, head.rotation);
        arrow.GetComponent<Arrow>().Launch(target, damage);
        Audio.Play("shoot", 0.15f);
    }

    Creep FindTarget()
    {
        Creep best = null;
        foreach (GameObject candidate in GameObject.FindGameObjectsWithTag("Enemy"))
        {
            if (Vector3.Distance(candidate.transform.position, transform.position) > range) continue;
            Creep creep = candidate.GetComponent<Creep>();
            if (best == null || creep.progress > best.progress) best = creep;
        }
        return best;
    }

    public void Upgrade()
    {
        level++;
        damage += 1f;
        range += 0.4f;
        fireInterval *= 0.85f;
        Tween.PunchScale(transform, 0.3f, 0.3f);
        Tween.Color(head.gameObject, level == 2 ? new Color(0.98f, 0.57f, 0.24f) : new Color(0.94f, 0.27f, 0.27f), 0.3f);
    }
}`);

    const arrowScript = scriptAsset("Arrow.cs", `
using UnityEngine;

// Hedefini takip eden ok. Hedef yolda ölürse son konumuna gidip kaybolur.
public class Arrow : MonoBehaviour
{
    public float speed = 11f;
    private Creep target;
    private Vector3 lastPosition;
    private float damage;

    public void Launch(Creep creep, float amount)
    {
        target = creep;
        damage = amount;
        lastPosition = creep.transform.position;
    }

    void Update()
    {
        if (target != null) lastPosition = target.transform.position;
        Vector3 direction = lastPosition - transform.position;
        float step = speed * Time.deltaTime;
        if (direction.magnitude <= step)
        {
            if (target != null) target.TakeDamage(damage);
            Destroy(gameObject);
            return;
        }
        transform.position += direction.normalized * step;
        transform.rotation = Quaternion.Euler(0, 0, Mathf.Atan2(direction.y, direction.x) * Mathf.Rad2Deg - 90f);
    }
}`);

    const spotScript = scriptAsset("BuildSpot.cs", `
using UnityEngine;

// Kule yeri: tıklayınca kule kurar; kule varsa yükseltir. Fare üstündeyken menzil görünür.
public class BuildSpot : MonoBehaviour
{
    public GameObject towerPrefab;
    public Transform rangeView;
    private Tower tower;

    void Start()
    {
        rangeView.gameObject.SetActive(false);
    }

    void OnMouseEnter()
    {
        float range = tower != null ? tower.range : 2.8f;
        rangeView.localScale = new Vector3(range * 2f, range * 2f, 1);
        rangeView.gameObject.SetActive(true);
    }

    void OnMouseExit()
    {
        rangeView.gameObject.SetActive(false);
    }

    void OnMouseDown()
    {
        TowerGame game = TowerGame.Instance;
        if (game.over) return;
        if (tower == null)
        {
            if (!game.Spend(game.towerCost)) return;
            tower = Instantiate(towerPrefab, transform.position, Quaternion.identity).GetComponent<Tower>();
            Audio.Play("powerup", 0.4f);
        }
        else if (tower.level < 3)
        {
            if (!game.Spend(game.upgradeCost * tower.level)) return;
            tower.Upgrade();
            Audio.Play("powerup", 0.5f);
        }
        else
        {
            HUD.Show("Bu kule en üst seviyede", 1f);
            return;
        }
        OnMouseEnter();
    }
}`);

    const gameScript = scriptAsset("TowerGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Dalgaları, altını ve canları yönetir. 10 dalgayı atlatırsan kazanırsın.
public class TowerGame : MonoBehaviour
{
    public static TowerGame Instance;
    public GameObject creepPrefab;
    public GameObject popPrefab;
    public Text goldText;
    public Text livesText;
    public Text waveText;
    public GameObject endPanel;
    public Text endTitle;
    public Text resultText;

    [Header("Ekonomi")]
    public int gold = 120;
    public int lives = 20;
    public int towerCost = 50;
    public int upgradeCost = 50;

    [Header("Dalgalar")]
    public int totalWaves = 10;
    public float timeBetweenWaves = 8f;
    public float spawnInterval = 0.9f;

    [HideInInspector] public bool over;
    private int wave;
    private int alive;
    private int toSpawn;
    private float spawnTimer;
    private float countdown = 6f;
    private int kills;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        UpdateTexts();
        HUD.Show("Boş yere tıkla: kule kur (50)  •  Kuleye tıkla: yükselt (50 × seviye)  •  Space: dalgayı başlat", 4f);
    }

    void Update()
    {
        if (over) return;
        if (toSpawn > 0)
        {
            spawnTimer -= Time.deltaTime;
            if (spawnTimer <= 0)
            {
                SpawnCreep();
                toSpawn--;
                spawnTimer = spawnInterval;
            }
        }
        else if (alive == 0 && wave < totalWaves)
        {
            countdown -= Time.deltaTime;
            waveText.text = "Dalga " + (wave + 1) + " / " + totalWaves + "  •  " + Mathf.CeilToInt(countdown) + " sn";
            if (countdown <= 0) StartNextWave();
        }
    }

    // "Dalgayı Başlat" butonu (Space) bunu çağırır.
    public void StartNextWave()
    {
        if (over || toSpawn > 0 || wave >= totalWaves) return;
        wave++;
        toSpawn = 5 + wave * 2;
        spawnTimer = 0;
        countdown = timeBetweenWaves;
        waveText.text = "Dalga " + wave + " / " + totalWaves;
        Tween.PunchScale(waveText, 0.3f, 0.3f);
        Audio.Play("powerup", 0.4f);
    }

    void SpawnCreep()
    {
        GameObject made = Instantiate(creepPrefab, EnemyPath.Instance.points[0], Quaternion.identity);
        Creep creep = made.GetComponent<Creep>();
        // Dalga ilerledikçe düşmanlar hızla güçlenir; altın ödülü yavaş artar.
        float health = 3f + wave * 1.3f + wave * wave * 0.14f;
        // Her beşinci dalganın son düşmanı büyük ve dayanıklı bir dev.
        if (wave % 5 == 0 && toSpawn == 1)
        {
            creep.Setup(health * 5f, 1.0f, 40, 5);
            made.transform.localScale = made.transform.localScale * 1.6f;
            HUD.Show("Dev geliyor!", 1.5f);
        }
        else
        {
            creep.Setup(health, 1.5f + wave * 0.06f, 4 + wave / 2, 1);
        }
        alive++;
    }

    public bool Spend(int cost)
    {
        if (gold < cost)
        {
            HUD.Show("Yeterli altın yok (" + cost + " gerekli)", 1.2f);
            Tween.PunchScale(goldText, 0.3f, 0.3f);
            return false;
        }
        gold -= cost;
        UpdateTexts();
        return true;
    }

    public void EnemyKilled(Creep creep)
    {
        alive--;
        kills++;
        gold += creep.reward;
        Instantiate(popPrefab, creep.transform.position, Quaternion.identity);
        Audio.Play("coin", 0.25f);
        UpdateTexts();
        CheckWin();
    }

    public void EnemyEscaped(int damage)
    {
        alive--;
        lives = Mathf.Max(0, lives - damage);
        UpdateTexts();
        Tween.PunchScale(livesText, 0.4f, 0.3f);
        Tween.Shake(Camera.main.transform, 0.15f, 0.2f);
        Audio.Play("hit", 0.5f);
        if (lives <= 0) End(false);
        else CheckWin();
    }

    void CheckWin()
    {
        if (wave >= totalWaves && toSpawn == 0 && alive <= 0) End(true);
    }

    void UpdateTexts()
    {
        goldText.text = "Altın: " + gold;
        livesText.text = "Can: " + lives;
    }

    void End(bool won)
    {
        if (over) return;
        over = true;
        endTitle.text = won ? "Kale kurtuldu!" : "Kale düştü...";
        resultText.text = "Dalga: " + wave + " / " + totalWaves + "\\nYenilen düşman: " + kills + "\\nKalan can: " + lives;
        Audio.Play(won ? "win" : "lose");
        Timer.After(0.6f, () => endPanel.SetActive(true));
    }

    // "Yeniden Oyna" butonu (R tuşu) bunu çağırır.
    public void Restart()
    {
        SceneManager.ReloadScene();
    }
}`);

    const autoDestroy = scriptAsset("AutoDestroy.cs", AUTO_DESTROY);
    project.scripts = [pathScript, creepScript, towerScript, arrowScript, spotScript, gameScript, autoDestroy];

    const pop = prefab("Pop", entity("Pop", [burst(["#fde047", "#a855f7"], 16, 3, 0.18), script(autoDestroy, { lifetime: 0.8 })]));
    const arrow = prefab("Arrow", entity("Arrow", [sprite("#78350f", "triangle", 6), script(arrowScript)], { scale: { x: 0.16, y: 0.42 } }));
    const towerRoot = entity("Tower", [sprite("#7c3aed", "hexagon", 3)], { scale: { x: 0.95, y: 0.95 } });
    const head = entity("Head", [sprite("#facc15", "triangle", 4)], { position: { y: 0 }, scale: { x: 0.5, y: 0.7 }, parentId: towerRoot.id });
    towerRoot.components.push(script(towerScript, { arrowPrefab: prefabRef(arrow), head: ref(head) }));
    const tower = prefab("Tower", towerRoot, [head]);

    const creepRoot = entity("Creep", [sprite("#db2777", "circle", 4)], { scale: { x: 0.6, y: 0.6 }, tag: "Enemy" });
    const barBack = entity("HealthBack", [sprite("#1f2937", "square", 5)], { position: { y: 0.85 }, scale: { x: 1.2, y: 0.16 }, parentId: creepRoot.id });
    const barFill = entity("HealthFill", [sprite("#22c55e", "square", 6)], { position: { y: 0.85 }, scale: { x: 1.2, y: 0.16 }, parentId: creepRoot.id });
    creepRoot.components.push(createCollider({ shape: "circle", radius: 0.5, isTrigger: true }), script(creepScript, { healthFill: ref(barFill) }));
    const creep = prefab("Creep", creepRoot, [barBack, barFill]);
    project.prefabs = [pop, arrow, tower, creep];

    // The path: corner markers (children of EnemyPath) and sand segments between them.
    const path = entity("EnemyPath", []);
    const corners = TD_PATH.map(([x, y], index) => entity(`Point ${index}`, [], { position: { x, y }, parentId: path.id }));
    path.components.push(script(pathScript));
    const segments: GameEntity[] = [];
    for (let index = 0; index < TD_PATH.length - 1; index += 1) {
        const [x0, y0] = TD_PATH[index];
        const [x1, y1] = TD_PATH[index + 1];
        segments.push(entity("Road", [sprite("#fde68a", "square", -5)], {
            position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
            scale: { x: Math.abs(x1 - x0) + 1.1, y: Math.abs(y1 - y0) + 1.1 },
        }));
    }
    const castle = entity("Castle", [sprite("#6d28d9", "hexagon", 2)], { position: { x: 9.3, y: 1.2 }, scale: { x: 1.8, y: 1.8 } });
    const flag = entity("Flag", [sprite("#f472b6", "triangle", 3)], { position: { x: 0.1, y: 0.6 }, rotation: { z: -90 }, scale: { x: 0.35, y: 0.4 }, parentId: castle.id });

    const spots: GameEntity[] = [];
    TD_SPOTS.forEach(([x, y], index) => {
        const spot = entity(`BuildSpot ${index + 1}`, [createCollider({ shape: "circle", radius: 0.5 })], { position: { x, y } });
        const pad = entity("Pad", [sprite("#c4b5fd", "hexagon", 1)], { scale: { x: 0.9, y: 0.9 }, parentId: spot.id });
        const range = entity("Range", [faded("#a855f7", "circle", 0.16, 0)], { scale: { x: 5.6, y: 5.6 }, parentId: spot.id, active: false });
        spot.components.push(script(spotScript, { towerPrefab: prefabRef(tower), rangeView: ref(range) }));
        spots.push(spot, pad, range);
    });

    const goldText = entity("GoldText", [uiText("Altın: 120", { anchor: "top-left", fontSize: 24, color: "#a16207" })]);
    const livesText = entity("LivesText", [uiText("Can: 20", { anchor: "top-left", fontSize: 24, offset: { x: 200, y: 24 }, color: "#be123c" })]);
    const waveText = entity("WaveText", [uiText("Dalga 1 / 10", { anchor: "top", fontSize: 20, offset: { x: 0, y: 26 }, color: "#4c1d95" })]);
    const manager = entity("TowerGame", []);
    const startButton = entity("StartWaveButton", [uiButton("Dalgayı Başlat", manager, "StartNextWave", { anchor: "bottom-right", offset: { x: 20, y: 20 }, width: 190, height: 48, fontSize: 18, color: "#7c3aed", hotkey: "Space" })]);
    const end = gameOverPanel(manager, "Kale kurtuldu!", "Yeniden Oyna", "#7c3aed");
    manager.components.push(script(gameScript, {
        creepPrefab: prefabRef(creep),
        popPrefab: prefabRef(pop),
        goldText: ref(goldText),
        livesText: ref(livesText),
        waveText: ref(waveText),
        endPanel: ref(end.panel),
        endTitle: ref(end.heading),
        resultText: ref(end.result),
    }));

    scene.objects.push(camera2d(5.4), path, ...corners, ...segments, castle, flag, ...spots, manager, goldText, livesText, waveText, startButton, ...end.entities);
    return finishProject(project, scene, "tower-defense-2d");
}

// ---------------------------------------------------------------------------
// Twin-stick arena shooter (C++ with a C# manager)
// ---------------------------------------------------------------------------

export function arenaShooter(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Arena", "2d");
    scene.settings.background = { mode: "gradient", color: "#0b0420", topColor: "#1e1b4b" };

    const playerScript = scriptAsset("ArenaPlayer.cpp", `
#include <hanogt.h>

// Oyuncu (C++): WASD ile hareket et, fareyle nişan alıp sol tıkla ateş et.
// Fare kullanmıyorsan ok tuşları sekiz yöne ateş eder.
class ArenaPlayer : public MonoBehaviour {
public:
    float speed = 6.5f;
    float fireInterval = 0.12f;
    float spread = 4.0f;
    GameObject* bulletPrefab = nullptr;
    Transform* gun = nullptr;

private:
    Rigidbody2D* rb = nullptr;
    SpriteRenderer* body = nullptr;
    float nextShot = 0.0f;
    float invincibleUntil = 0.0f;
    Vector3 aim = Vector3(1.0f, 0.0f, 0.0f);

public:
    void Start() {
        rb = GetComponent<Rigidbody2D>();
        body = GetComponent<SpriteRenderer>();
    }

    void Update() {
        if (ArenaGame::Instance->over) {
            rb->velocity = Vector2::zero;
            return;
        }
        // Hareket yalnızca WASD ile: ok tuşları ateş içindir.
        float x = (Input::GetKey(KeyCode::D) ? 1.0f : 0.0f) - (Input::GetKey(KeyCode::A) ? 1.0f : 0.0f);
        float y = (Input::GetKey(KeyCode::W) ? 1.0f : 0.0f) - (Input::GetKey(KeyCode::S) ? 1.0f : 0.0f);
        Vector2 move = Vector2(x, y);
        if (move.sqrMagnitude > 1.0f) move = move.normalized;
        rb->velocity = move * speed;

        float ax = (Input::GetKey(KeyCode::RightArrow) ? 1.0f : 0.0f) - (Input::GetKey(KeyCode::LeftArrow) ? 1.0f : 0.0f);
        float ay = (Input::GetKey(KeyCode::UpArrow) ? 1.0f : 0.0f) - (Input::GetKey(KeyCode::DownArrow) ? 1.0f : 0.0f);
        bool arrows = ax != 0.0f || ay != 0.0f;
        if (arrows) {
            aim = Vector3(ax, ay, 0.0f).normalized;
        } else {
            Vector3 mouse = Camera::main->ScreenToWorldPoint(Input::mousePosition);
            Vector3 toMouse = mouse - transform->position;
            toMouse.z = 0.0f;
            if (toMouse.magnitude > 0.2f) aim = toMouse.normalized;
        }
        gun->rotation = Quaternion::Euler(0.0f, 0.0f, Mathf::Atan2(aim.y, aim.x) * Mathf::Rad2Deg);

        if ((arrows || Input::GetMouseButton(0)) && Time::time >= nextShot) Shoot();

        // Hasardan sonra kısa süre yanıp söner ve hasar almaz.
        body->enabled = Time::time > invincibleUntil || Mathf::Repeat(Time::time * 14.0f, 1.0f) > 0.5f;
    }

    void Shoot() {
        nextShot = Time::time + fireInterval;
        float angle = Mathf::Atan2(aim.y, aim.x) * Mathf::Rad2Deg + Random::Range(-spread, spread);
        Instantiate(bulletPrefab, transform->position + aim * 0.6f, Quaternion::Euler(0.0f, 0.0f, angle));
        Audio::Play("laser", 0.15f);
    }

    void OnCollisionEnter2D(Collision2D* collision) {
        if (collision->gameObject->CompareTag("Enemy")) Hurt();
    }

    void OnCollisionStay2D(Collision2D* collision) {
        if (collision->gameObject->CompareTag("Enemy")) Hurt();
    }

    void OnTriggerEnter2D(Collider2D* other) {
        if (!other->CompareTag("Pickup")) return;
        ArenaGame::Instance->Heal();
        Destroy(other->gameObject);
    }

    void Hurt() {
        if (Time::time < invincibleUntil || ArenaGame::Instance->over) return;
        invincibleUntil = Time::time + 0.9f;
        ArenaGame::Instance->PlayerHit();
    }
};`);

    const chaserScript = scriptAsset("Chaser.cpp", `
#include <hanogt.h>

// Düşman (C++): oyuncuya doğru gelir. dasher açıksa arada bir hızla atılır.
class Chaser : public MonoBehaviour {
public:
    float speed = 2.4f;
    int health = 2;
    int points = 10;
    bool dasher = false;
    GameObject* explosion = nullptr;
    GameObject* pickup = nullptr;

private:
    Rigidbody2D* rb = nullptr;
    float dashTimer = 2.0f;
    float dashUntil = 0.0f;
    bool dead = false;

public:
    void Start() {
        rb = GetComponent<Rigidbody2D>();
        dashTimer = Random::Range(1.5f, 3.0f);
    }

    void Update() {
        if (ArenaGame::Instance->over) {
            rb->velocity = Vector2::zero;
            return;
        }
        Vector3 direction = (ArenaGame::Instance->player->position - transform->position).normalized;
        float current = speed;
        if (dasher) {
            dashTimer -= Time::deltaTime;
            if (dashTimer <= 0.0f) {
                dashUntil = Time::time + 0.35f;
                dashTimer = Random::Range(1.8f, 3.2f);
                Tween::PunchScale(transform, 0.3f, 0.2f);
            }
            if (Time::time < dashUntil) current = speed * 3.2f;
        }
        rb->velocity = Vector2(direction.x, direction.y) * current;
        transform->Rotate(0.0f, 0.0f, 160.0f * Time::deltaTime);
    }

    void Hit(int damage) {
        if (dead) return;
        health -= damage;
        Tween::PunchScale(transform, 0.25f, 0.12f);
        if (health <= 0) Die();
    }

    void Die() {
        dead = true;
        Instantiate(explosion, transform->position, Quaternion::identity);
        if (pickup != nullptr && Random::value < 0.08f) Instantiate(pickup, transform->position, Quaternion::identity);
        ArenaGame::Instance->EnemyKilled(points);
        Destroy(gameObject);
    }
};`);

    const bulletScript = scriptAsset("Bullet.cpp", `
#include <hanogt.h>

// Mermi (C++): sağ ekseni yönünde uçar; düşmana ya da duvara değince yok olur.
class Bullet : public MonoBehaviour {
public:
    float speed = 17.0f;
    float lifetime = 1.2f;
    int damage = 1;

    void Start() {
        GetComponent<Rigidbody2D>()->velocity = transform->right * speed;
        Destroy(gameObject, lifetime);
    }

    void OnTriggerEnter2D(Collider2D* other) {
        if (other->CompareTag("Enemy")) {
            other->GetComponent<Chaser>()->Hit(damage);
            Destroy(gameObject);
        } else if (other->CompareTag("Wall")) {
            Destroy(gameObject);
        }
    }
};`);

    const gameScript = scriptAsset("ArenaGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Arenanın beyni (C#): dalgalar, puan, kombo çarpanı, can çubuğu ve rekor.
// C++ betikleri buna ArenaGame::Instance ile ulaşır.
public class ArenaGame : MonoBehaviour
{
    public static ArenaGame Instance;
    public Transform player;
    public GameObject chaserPrefab;
    public GameObject dasherPrefab;
    public GameObject portalPrefab;
    public Text scoreText;
    public Text waveText;
    public Text comboText;
    public Slider healthBar;
    public GameObject endPanel;
    public Text resultText;

    [Header("Arena")]
    public float arenaWidth = 16f;
    public float arenaHeight = 8.4f;
    public int maxHealth = 5;

    [HideInInspector] public bool over;
    private int health;
    private int score;
    private int wave;
    private int alive;
    private int pending;
    private int combo = 1;
    private float comboUntil;
    private int best;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        health = maxHealth;
        best = PlayerPrefs.GetInt("arena.best", 0);
        UpdateUi();
        HUD.Show("WASD: hareket  •  Fare + sol tık ya da ok tuşları: ateş", 3f);
        Timer.After(1.5f, NextWave);
    }

    void Update()
    {
        if (!over && combo > 1 && Time.time > comboUntil)
        {
            combo = 1;
            comboText.text = "";
        }
    }

    void NextWave()
    {
        if (over) return;
        wave++;
        waveText.text = "Dalga " + wave;
        Tween.PunchScale(waveText, 0.4f, 0.4f);
        int count = 4 + wave * 2;
        pending = count;
        for (int i = 0; i < count; i++) Timer.After(0.35f * i, SpawnOne);
    }

    // Düşman arenanın kenarında, oyuncudan uzakta bir geçitten çıkar.
    void SpawnOne()
    {
        if (over) return;
        bool dash = wave >= 3 && Random.value < 0.2f + wave * 0.02f;
        Vector3 position = EdgePoint();
        Instantiate(portalPrefab, position, Quaternion.identity);
        Timer.After(0.6f, () => Arrive(dash ? dasherPrefab : chaserPrefab, position));
    }

    void Arrive(GameObject prefab, Vector3 position)
    {
        pending--;
        if (over) return;
        GameObject enemy = Instantiate(prefab, position, Quaternion.identity);
        enemy.GetComponent<Chaser>().speed += wave * 0.12f;
        alive++;
    }

    Vector3 EdgePoint()
    {
        Vector3 point = Vector3.zero;
        float halfWidth = arenaWidth / 2f - 0.8f;
        float halfHeight = arenaHeight / 2f - 0.8f;
        for (int attempt = 0; attempt < 10; attempt++)
        {
            float x = Random.Range(-halfWidth, halfWidth);
            float y = Random.Range(-halfHeight, halfHeight);
            if (Random.value < 0.5f) x = x < 0 ? -halfWidth : halfWidth;
            else y = y < 0 ? -halfHeight : halfHeight;
            point = new Vector3(x, y, 0);
            if (Vector3.Distance(point, player.position) > 4f) break;
        }
        return point;
    }

    public void EnemyKilled(int points)
    {
        alive--;
        // 1,5 saniye içindeki her yeni vuruş çarpanı artırır (en fazla x5).
        combo = Time.time < comboUntil ? Mathf.Min(5, combo + 1) : 1;
        comboUntil = Time.time + 1.5f;
        score += points * combo;
        comboText.text = combo > 1 ? "x" + combo : "";
        if (combo > 1) Tween.PunchScale(comboText, 0.3f, 0.2f);
        Audio.Play("explosion", 0.3f);
        UpdateUi();
        if (alive <= 0 && pending <= 0) Timer.After(1.5f, NextWave);
    }

    public void PlayerHit()
    {
        if (over) return;
        health--;
        Audio.Play("hit", 0.6f);
        Tween.Shake(Camera.main.transform, 0.25f, 0.3f);
        UpdateUi();
        if (health <= 0) GameOver();
    }

    public void Heal()
    {
        health = Mathf.Min(maxHealth, health + 1);
        Audio.Play("powerup", 0.4f);
        UpdateUi();
    }

    void UpdateUi()
    {
        scoreText.text = score.ToString();
        healthBar.value = (float)health / maxHealth;
    }

    void GameOver()
    {
        over = true;
        bool record = score > best;
        if (record) PlayerPrefs.SetInt("arena.best", score);
        resultText.text = (record ? "Yeni rekor!\\n" : "") + "Puan: " + score + "\\nDalga: " + wave + "\\nRekor: " + Mathf.Max(score, best);
        Audio.Play("lose");
        Timer.After(0.7f, () => endPanel.SetActive(true));
    }

    // "Tekrar Oyna" butonu (R tuşu) bunu çağırır.
    public void Restart()
    {
        SceneManager.ReloadScene();
    }
}`);

    const autoDestroy = scriptAsset("AutoDestroy.cs", AUTO_DESTROY);
    project.scripts = [playerScript, chaserScript, bulletScript, gameScript, autoDestroy];

    const explosion = prefab("Explosion", entity("Explosion", [burst(["#f0abfc", "#7c3aed"], 22, 4.5, 0.2), script(autoDestroy, { lifetime: 1 })]));
    const pickup = prefab("Medkit", entity("Medkit", [
        sprite("#4ade80", "roundedSquare", 3),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        createAnimation({ clips: [animationPreset("pulse", "2d")] }),
        script(autoDestroy, { lifetime: 10 }),
    ], { scale: { x: 0.4, y: 0.4 }, tag: "Pickup" }));
    const portal = prefab("Portal", entity("Portal", [
        faded("#c084fc", "circle", 0.55, -1),
        createAnimation({ clips: [animationPreset("pulse", "2d")] }),
        script(autoDestroy, { lifetime: 0.6 }),
    ], { scale: { x: 0.9, y: 0.9 } }));
    const bullet = prefab("Bullet", entity("Bullet", [
        sprite("#fde047", "roundedSquare", 4),
        createRigidBody({ bodyType: "kinematic", useGravity: false, gravityScale: 0, linearDamping: 0, freezeRotation: true }),
        createCollider({ shape: "box", isTrigger: true }),
        script(bulletScript),
    ], { scale: { x: 0.34, y: 0.12 } }));
    const enemyBody = (label: string, color: string, shape: SpriteShape, size: number, fields: Record<string, number | boolean>) => prefab(label, entity(label, [
        sprite(color, shape, 3),
        createRigidBody({ gravityScale: 0, useGravity: false, linearDamping: 0, freezeRotation: true, freezePosition: { x: false, y: false, z: true } }),
        createCollider({ shape: "circle", radius: 0.5 }),
        script(chaserScript, { ...fields, explosion: prefabRef(explosion), pickup: prefabRef(pickup) }),
    ], { scale: { x: size, y: size }, tag: "Enemy" }));
    const chaser = enemyBody("Chaser", "#a855f7", "diamond", 0.62, { speed: 2.4, health: 2, points: 10, dasher: false });
    const dasher = enemyBody("Dasher", "#f43f5e", "triangle", 0.58, { speed: 2.0, health: 3, points: 25, dasher: true });
    project.prefabs = [explosion, pickup, portal, bullet, chaser, dasher];

    // Arena floor with the site's grid look, and the walls.
    const floor = entity("Floor", [sprite("#140a2e", "square", -10)], { scale: { x: 16, y: 8.4 } });
    const gridLines: GameEntity[] = [];
    for (let x = -6; x <= 6; x += 2) gridLines.push(entity("GridLine", [faded("#4c1d95", "square", 0.55, -9)], { position: { x }, scale: { x: 0.04, y: 8.4 } }));
    for (let y = -4; y <= 4; y += 2) gridLines.push(entity("GridLine", [faded("#4c1d95", "square", 0.55, -9)], { position: { y }, scale: { x: 16, y: 0.04 } }));
    const wall = (label: string, x: number, y: number, sx: number, sy: number) => entity(label, [sprite("#ec4899", "square", 1), createCollider({ shape: "box" })], { position: { x, y }, scale: { x: sx, y: sy }, tag: "Wall" });
    const walls = [wall("TopWall", 0, 4.45, 16.5, 0.5), wall("BottomWall", 0, -4.45, 16.5, 0.5), wall("LeftWall", -8.25, 0, 0.5, 9.4), wall("RightWall", 8.25, 0, 0.5, 9.4)];

    const player = entity("Player", [
        sprite("#f472b6", "circle", 5),
        createRigidBody({ gravityScale: 0, useGravity: false, linearDamping: 0, freezeRotation: true, freezePosition: { x: false, y: false, z: true } }),
        createCollider({ shape: "circle", radius: 0.5 }),
    ], { scale: { x: 0.6, y: 0.6 }, tag: "Player" });
    const gunPivot = entity("GunPivot", [], { parentId: player.id });
    const barrel = entity("Barrel", [sprite("#fbbf24", "roundedSquare", 6)], { position: { x: 0.7 }, scale: { x: 0.7, y: 0.3 }, parentId: gunPivot.id });
    player.components.push(script(playerScript, { bulletPrefab: prefabRef(bullet), gun: ref(gunPivot) }));

    const scoreText = entity("ScoreText", [uiText("0", { anchor: "top-left", fontSize: 34, color: "#fbcfe8" })]);
    const comboText = entity("ComboText", [uiText("", { anchor: "top-left", fontSize: 20, offset: { x: 26, y: 70 }, color: "#fde047" })]);
    const waveText = entity("WaveText", [uiText("Dalga 1", { anchor: "top", fontSize: 20, offset: { x: 0, y: 24 }, color: "#c4b5fd" })]);
    const healthBar = entity("HealthBar", [createUIProgressBar({ value: 1, anchor: "top-right", offset: { x: 24, y: 30 }, width: 200, height: 14, fillColor: "#22d3ee", backgroundColor: "#1e1b4b" })]);
    const manager = entity("ArenaGame", []);
    const end = gameOverPanel(manager, "Arena Kazandı", "Tekrar Oyna", "#db2777");
    manager.components.push(script(gameScript, {
        player: ref(player),
        chaserPrefab: prefabRef(chaser),
        dasherPrefab: prefabRef(dasher),
        portalPrefab: prefabRef(portal),
        scoreText: ref(scoreText),
        waveText: ref(waveText),
        comboText: ref(comboText),
        healthBar: ref(healthBar),
        endPanel: ref(end.panel),
        resultText: ref(end.result),
    }));

    // A slightly wider view keeps the HUD above the top wall.
    scene.objects.push(camera2d(5.9), floor, ...gridLines, ...walls, player, gunPivot, barrel, manager, scoreText, comboText, waveText, healthBar, ...end.entities);
    return finishProject(project, scene, "arena-2d");
}
