/**
 * Arcade starter projects: a 2D endless runner (the landing page's mini game
 * as a real project), a one-button flappy game, Pong for one or two players
 * and Snake written in C++.
 */
import { createCollider, createParticleSystem, createRigidBody } from "../components";
import { createBlankProject, createEmptyScene } from "../scene";
import type { GameProjectDocument } from "../types";
import { AUTO_DESTROY, burst, camera2d, entity, finishProject, gameOverPanel, prefab, prefabRef, ref, script, scriptAsset, sprite, uiText } from "./builders";

// ---------------------------------------------------------------------------
// 2D endless runner
// ---------------------------------------------------------------------------

export function runner2d(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Neon Koşu", "2d");
    scene.settings.background = { mode: "gradient", color: "#fdf2f8", topColor: "#ede9fe" };

    const playerScript = scriptAsset("RunnerPlayer.cs", `
using UnityEngine;

// Koşucu yerinde koşar, dünya ona doğru akar. Space / ↑ / tıklama ile zıpla; havada bir kez daha zıplayabilirsin.
// "Coyote time" (kenardan düştükten hemen sonra) ve "jump buffer" (yere değmeden hemen önce basılan tuş) zıplamayı affedici yapar.
public class RunnerPlayer : MonoBehaviour
{
    [Header("Zıplama")]
    public float jumpVelocity = 11.5f;
    public int airJumps = 1;
    public float coyoteTime = 0.1f;
    public float jumpBuffer = 0.12f;

    private Rigidbody2D rb;
    private float x;
    private bool grounded;
    private float lastGrounded = -1f;
    private float lastPressed = -1f;
    private int airJumpsLeft;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        x = transform.position.x;
    }

    void Update()
    {
        if (RunGame.Instance.over) return;
        if (Input.GetButtonDown("Jump") || Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W) || Input.GetMouseButtonDown(0))
            lastPressed = Time.time;

        if (grounded)
        {
            lastGrounded = Time.time;
            airJumpsLeft = airJumps;
        }

        if (Time.time - lastPressed <= jumpBuffer)
        {
            if (Time.time - lastGrounded <= coyoteTime)
            {
                lastGrounded = -1f;
                Jump();
            }
            else if (airJumpsLeft > 0)
            {
                airJumpsLeft--;
                Jump();
            }
        }
        // Koşucu ekranda aynı yerde kalır; ileri giden dünyadır.
        transform.position = new Vector3(x, transform.position.y, 0);
    }

    void Jump()
    {
        rb.velocity = new Vector2(0, jumpVelocity);
        lastPressed = -1f;
        grounded = false;
        Audio.Play("jump", 0.35f);
        Tween.PunchScale(transform, 0.18f, 0.2f);
    }

    void OnCollisionStay2D(Collision2D collision)
    {
        if (collision.GetContact(0).normal.y > 0.5f) grounded = true;
    }

    void OnCollisionExit2D(Collision2D collision)
    {
        grounded = false;
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin")) RunGame.Instance.CollectCoin(other.gameObject);
        else if (other.CompareTag("Obstacle")) RunGame.Instance.GameOver();
    }
}`);

    const gameScript = scriptAsset("RunGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Oyunun beyni: hız gittikçe artar, engel ve altın üretilir; skor = mesafe + altın × 10. Rekor PlayerPrefs'te saklanır.
public class RunGame : MonoBehaviour
{
    public static RunGame Instance;

    [Header("Prefab'lar")]
    public GameObject spikePrefab;
    public GameObject wallPrefab;
    public GameObject coinPrefab;

    [Header("Arayüz")]
    public Text scoreText;
    public Text bestText;
    public GameObject gameOverPanel;
    public Text resultText;

    [Header("Hız")]
    public float startSpeed = 7f;
    public float maxSpeed = 15f;
    public float acceleration = 0.22f;
    [Tooltip("Bir zıplamanın havada geçen süresi: iki engel arası en az bu kadar + biraz boşluk olur.")]
    public float airTime = 1.1f;

    [HideInInspector] public float speed;
    [HideInInspector] public bool over;
    private float distance;
    private int coins;
    private int best;
    private float nextSpawn = 1.4f;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        speed = startSpeed;
        best = PlayerPrefs.GetInt("runner2d.best", 0);
        bestText.text = "Rekor: " + best;
        HUD.Show("Space / ↑ / tıkla: zıpla  •  havada bir kez daha", 2.5f);
    }

    void Update()
    {
        if (over) return;
        speed = Mathf.Min(maxSpeed, speed + acceleration * Time.deltaTime);
        distance += speed * Time.deltaTime;
        scoreText.text = Score().ToString();
        nextSpawn -= Time.deltaTime;
        if (nextSpawn <= 0) Spawn();
    }

    public int Score()
    {
        return Mathf.FloorToInt(distance) + coins * 10;
    }

    // Engeller ekranın sağından gelir. Aralık mesafeyle hesaplanır: hız ne olursa olsun
    // bir zıplamadan sonra yere inip yeniden zıplayacak yer kalır.
    void Spawn()
    {
        float x = 12f;
        float roll = Random.value;
        if (roll < 0.55f) Instantiate(spikePrefab, new Vector3(x, -2.65f, 0), Quaternion.identity);
        else if (roll < 0.85f) Instantiate(wallPrefab, new Vector3(x, -2.45f, 0), Quaternion.identity);
        if (Random.value < 0.7f)
        {
            for (int i = 0; i < 3; i++)
            {
                float lift = i == 1 ? 0.55f : 0f;
                Instantiate(coinPrefab, new Vector3(x + 2.6f + i * 0.9f, -0.5f + lift, 0), Quaternion.identity);
            }
        }
        nextSpawn = airTime + Random.Range(3f, 9f) / speed;
    }

    public void CollectCoin(GameObject coin)
    {
        coins++;
        Audio.Play("coin", 0.45f);
        Tween.PunchScale(scoreText, 0.25f, 0.25f);
        Destroy(coin);
    }

    public void GameOver()
    {
        if (over) return;
        over = true;
        speed = 0;
        int score = Score();
        bool record = score > best;
        if (record) PlayerPrefs.SetInt("runner2d.best", score);
        resultText.text = (record ? "Yeni rekor!\\n" : "") + "Mesafe: " + Mathf.FloorToInt(distance) + " m\\nAltın: " + coins + "\\nSkor: " + score;
        Audio.Play("lose", 0.6f);
        Tween.Shake(Camera.main.transform, 0.25f, 0.35f);
        Timer.After(0.5f, () => gameOverPanel.SetActive(true));
    }

    // "Tekrar Koş" butonu (R tuşu) bunu çağırır.
    public void Restart()
    {
        SceneManager.ReloadScene();
    }
}`);

    const moverScript = scriptAsset("WorldMover.cs", `
using UnityEngine;

// Engeller, altınlar ve arka plan koşunun hızıyla sola akar; parallax ile uzaktakiler daha yavaş gider.
public class WorldMover : MonoBehaviour
{
    [Range(0, 1)]
    public float parallax = 1f;
    public bool wrap = false;
    public float wrapWidth = 40f;

    void Update()
    {
        transform.position += Vector3.left * RunGame.Instance.speed * parallax * Time.deltaTime;
        if (transform.position.x < -wrapWidth / 2f)
        {
            if (wrap) transform.position += Vector3.right * wrapWidth;
            else Destroy(gameObject);
        }
    }
}`);

    project.scripts = [playerScript, gameScript, moverScript];

    const spike = prefab("Spike", entity("Spike", [
        sprite("#a855f7", "triangle", 3),
        createCollider({ shape: "box", size: { x: 0.8, y: 0.8, z: 1 }, isTrigger: true }),
        script(moverScript),
    ], { scale: { x: 0.8, y: 0.8 }, tag: "Obstacle" }));
    const wall = prefab("Wall", entity("Wall", [
        sprite("#6366f1", "roundedSquare", 3),
        createCollider({ shape: "box", size: { x: 0.9, y: 0.9, z: 1 }, isTrigger: true }),
        script(moverScript),
    ], { scale: { x: 0.7, y: 1.3 }, tag: "Obstacle" }));
    const coin = prefab("Coin", entity("Coin", [
        sprite("#f59e0b", "circle", 4),
        createCollider({ shape: "circle", radius: 0.5, isTrigger: true }),
        script(moverScript),
    ], { scale: { x: 0.42, y: 0.42 }, tag: "Coin" }));
    project.prefabs = [spike, wall, coin];

    const ground = entity("Ground", [sprite("#c4b5fd", "square", 1), createCollider({ shape: "box", friction: 0 })], { position: { x: 0, y: -3.6 }, scale: { x: 40, y: 1 }, tag: "Ground" });
    const groundLine = entity("GroundLine", [sprite("#ec4899", "square", 2)], { position: { x: 0, y: -3.08 }, scale: { x: 40, y: 0.06 } });
    const hill = (x: number, width: number, height: number, color: string, parallax: number) => entity("Hill", [
        sprite(color, "triangle", -10),
        script(moverScript, { parallax, wrap: true, wrapWidth: 44 }),
    ], { position: { x, y: -3.1 + height / 2 }, scale: { x: width, y: height } });
    const player = entity("Player", [
        sprite("#ec4899", "roundedSquare", 5),
        createRigidBody({ freezeRotation: true, freezePosition: { x: false, y: false, z: true }, linearDamping: 0, gravityScale: 2.2 }),
        createCollider({ shape: "box", friction: 0 }),
        script(playerScript),
    ], { position: { x: -5, y: -2.4 }, scale: { x: 0.8, y: 0.8 }, tag: "Player" });
    const trail = entity("Trail", [createParticleSystem({ emissionRate: 26, lifetime: 0.4, startSpeed: 1.6, spread: 18, startSize: 0.14, endSize: 0.02, startColor: "#f472b6", endColor: "#a855f7", maxParticles: 40, worldSpace: true })], { position: { x: -0.5, y: 0 }, rotation: { z: 180 }, parentId: player.id });

    const scoreText = entity("ScoreText", [uiText("0", { anchor: "top-left", fontSize: 36, color: "#4c1d95" })]);
    const bestText = entity("BestText", [uiText("Rekor: 0", { anchor: "top-right", fontSize: 18, color: "#7c3aed", bold: false })]);
    const hint = entity("HintText", [uiText("Space / ↑ / tıkla: zıpla", { anchor: "bottom", fontSize: 15, offset: { x: 0, y: 14 }, color: "#6d28d9", bold: false })]);
    const manager = entity("RunGame", []);
    const over = gameOverPanel(manager, "Oyun Bitti", "Tekrar Koş", "#7c3aed");
    manager.components.push(script(gameScript, {
        spikePrefab: prefabRef(spike),
        wallPrefab: prefabRef(wall),
        coinPrefab: prefabRef(coin),
        scoreText: ref(scoreText),
        bestText: ref(bestText),
        gameOverPanel: ref(over.panel),
        resultText: ref(over.result),
    }));

    scene.objects.push(
        camera2d(5),
        hill(-12, 10, 4, "#ddd6fe", 0.2), hill(0, 14, 5.5, "#e9d5ff", 0.2), hill(12, 9, 3.5, "#ddd6fe", 0.2),
        hill(-6, 6, 2.2, "#fbcfe8", 0.5), hill(8, 7, 2.6, "#fbcfe8", 0.5),
        ground, groundLine, player, trail, manager, scoreText, bestText, hint, ...over.entities,
    );
    return finishProject(project, scene, "runner-2d");
}

// ---------------------------------------------------------------------------
// One-button flappy game
// ---------------------------------------------------------------------------

export function flappy(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Gökyüzü", "2d");
    scene.settings.background = { mode: "gradient", color: "#e0f2fe", topColor: "#7dd3fc" };

    const birdScript = scriptAsset("Bird.cs", `
using UnityEngine;

// Tek tuşlu oyun: Space / ↑ / tıklama kanat çırpar. Hızına göre burnu yukarı ya da aşağı eğilir.
public class Bird : MonoBehaviour
{
    public float flapVelocity = 6.2f;
    public float gravity = 2.3f;
    public float tilt = 5f;
    public float ceiling = 4.9f;

    private Rigidbody2D rb;
    private float startY;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        rb.gravityScale = 0f;
        startY = transform.position.y;
    }

    void Update()
    {
        FlappyGame game = FlappyGame.Instance;
        bool pressed = Input.GetButtonDown("Jump") || Input.GetKeyDown(KeyCode.UpArrow) || Input.GetMouseButtonDown(0);
        if (game.state == FlappyState.Ready)
        {
            // Başlamadan önce yerinde süzülür.
            transform.position = new Vector3(transform.position.x, startY + Mathf.Sin(Time.time * 4f) * 0.25f, 0);
            if (pressed)
            {
                rb.gravityScale = gravity;
                game.Begin();
                Flap();
            }
            return;
        }
        if (game.state == FlappyState.Playing && pressed) Flap();
        // Tavan: ekranın üstünden kaçılmaz, kuş tavana sürtünür.
        if (transform.position.y > ceiling)
        {
            transform.position = new Vector3(transform.position.x, ceiling, 0);
            if (rb.velocity.y > 0) rb.velocity = Vector2.zero;
        }
        float angle = Mathf.Clamp(rb.velocity.y * tilt, -70f, 30f);
        transform.rotation = Quaternion.Euler(0, 0, angle);
    }

    void Flap()
    {
        rb.velocity = new Vector2(0, flapVelocity);
        Audio.Play("jump", 0.3f);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        FlappyGame game = FlappyGame.Instance;
        if (game.state != FlappyState.Playing) return;
        if (other.CompareTag("ScoreZone")) game.AddPoint();
        else if (other.CompareTag("Obstacle")) game.GameOver();
    }

    // Zemin katı: oyun bitince kuş yere düşüp orada kalır.
    void OnCollisionEnter2D(Collision2D collision)
    {
        if (collision.gameObject.CompareTag("Ground")) FlappyGame.Instance.GameOver();
    }
}`);

    const gameScript = scriptAsset("FlappyGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

public enum FlappyState { Ready, Playing, Over }

// Boruları üretir, skoru ve rekoru tutar. Her 5 puanda boşluk biraz daralır.
public class FlappyGame : MonoBehaviour
{
    public static FlappyGame Instance;

    public GameObject pipePrefab;
    public GameObject scoreZonePrefab;
    public Text scoreText;
    public Text bestText;
    public GameObject gameOverPanel;
    public Text resultText;

    [Header("Borular")]
    public float interval = 1.55f;
    public float startGap = 3.3f;
    public float minGap = 2.5f;

    [HideInInspector] public FlappyState state = FlappyState.Ready;
    private int score;
    private int best;
    private float nextPipe;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        best = PlayerPrefs.GetInt("flappy.best", 0);
        bestText.text = "Rekor: " + best;
        scoreText.text = "0";
        HUD.Show("Space / ↑ / tıkla: başla ve uç", 3f);
    }

    public void Begin()
    {
        state = FlappyState.Playing;
        nextPipe = 0.6f;
    }

    void Update()
    {
        if (state != FlappyState.Playing) return;
        nextPipe -= Time.deltaTime;
        if (nextPipe <= 0)
        {
            SpawnPipes();
            nextPipe = interval;
        }
    }

    void SpawnPipes()
    {
        float gap = Mathf.Max(minGap, startGap - (score / 5) * 0.15f);
        float center = Random.Range(-1.6f, 2.4f);
        float x = 11f;
        // Boru 8 birim boyunda: merkezini boşluğun kenarından 4 birim öteye koy.
        Instantiate(pipePrefab, new Vector3(x, center + gap / 2f + 4f, 0), Quaternion.identity);
        Instantiate(pipePrefab, new Vector3(x, center - gap / 2f - 4f, 0), Quaternion.identity);
        GameObject zone = Instantiate(scoreZonePrefab, new Vector3(x + 0.7f, center, 0), Quaternion.identity);
        zone.transform.localScale = new Vector3(0.3f, gap, 1);
    }

    public void AddPoint()
    {
        score++;
        scoreText.text = score.ToString();
        Audio.Play("coin", 0.4f);
        Tween.PunchScale(scoreText, 0.3f, 0.25f);
    }

    public void GameOver()
    {
        if (state == FlappyState.Over) return;
        state = FlappyState.Over;
        bool record = score > best;
        if (record) PlayerPrefs.SetInt("flappy.best", score);
        resultText.text = (record ? "Yeni rekor!\\n" : "") + "Skor: " + score + "\\nRekor: " + Mathf.Max(score, best);
        Audio.Play("hit", 0.6f);
        Tween.Shake(Camera.main.transform, 0.2f, 0.3f);
        Timer.After(0.6f, () => gameOverPanel.SetActive(true));
    }

    public void Restart()
    {
        SceneManager.ReloadScene();
    }
}`);

    const pipeScript = scriptAsset("PipeMover.cs", `
using UnityEngine;

// Borular sola kayar; oyun bitince durur, ekrandan çıkınca silinir.
public class PipeMover : MonoBehaviour
{
    public float speed = 3.2f;

    void Update()
    {
        if (FlappyGame.Instance.state == FlappyState.Over) return;
        transform.position += Vector3.left * speed * Time.deltaTime;
        if (transform.position.x < -12f) Destroy(gameObject);
    }
}`);

    project.scripts = [birdScript, gameScript, pipeScript];

    const pipe = prefab("Pipe", entity("Pipe", [
        sprite("#22c55e", "roundedSquare", 2),
        createCollider({ shape: "box", isTrigger: true }),
        script(pipeScript),
    ], { scale: { x: 1.3, y: 8 }, tag: "Obstacle" }));
    const zone = prefab("ScoreZone", entity("ScoreZone", [
        createCollider({ shape: "box", isTrigger: true }),
        script(pipeScript),
    ], { tag: "ScoreZone" }));
    project.prefabs = [pipe, zone];

    const bird = entity("Bird", [
        sprite("#f59e0b", "circle", 5),
        createRigidBody({ freezeRotation: true, freezePosition: { x: true, y: false, z: true }, linearDamping: 0, gravityScale: 0 }),
        createCollider({ shape: "circle", radius: 0.5 }),
        script(birdScript),
    ], { position: { x: -2.5, y: 0.5 }, scale: { x: 0.62, y: 0.62 }, tag: "Player" });
    const eye = entity("Eye", [sprite("#0f172a", "circle", 6)], { position: { x: 0.18, y: 0.15 }, scale: { x: 0.22, y: 0.22 }, parentId: bird.id });
    const beak = entity("Beak", [sprite("#ef4444", "triangle", 6)], { position: { x: 0.5, y: -0.05 }, rotation: { z: -90 }, scale: { x: 0.35, y: 0.3 }, parentId: bird.id });
    const ground = entity("Ground", [sprite("#a3e635", "square", 3), createCollider({ shape: "box" })], { position: { y: -5.2 }, scale: { x: 30, y: 1.2 }, tag: "Ground" });
    const cloud = (x: number, y: number, size: number) => entity("Cloud", [sprite("#ffffff", "circle", -5)], { position: { x, y }, scale: { x: size * 1.8, y: size } });

    const scoreText = entity("ScoreText", [uiText("0", { anchor: "top", fontSize: 52, offset: { x: 0, y: 24 }, color: "#0c4a6e" })]);
    const bestText = entity("BestText", [uiText("Rekor: 0", { anchor: "top-right", fontSize: 17, color: "#075985", bold: false })]);
    const manager = entity("FlappyGame", []);
    const over = gameOverPanel(manager, "Düştün!", "Tekrar Uç", "#0284c7");
    manager.components.push(script(gameScript, {
        pipePrefab: prefabRef(pipe),
        scoreZonePrefab: prefabRef(zone),
        scoreText: ref(scoreText),
        bestText: ref(bestText),
        gameOverPanel: ref(over.panel),
        resultText: ref(over.result),
    }));

    scene.objects.push(
        camera2d(5.2),
        cloud(-6, 3.2, 0.9), cloud(1, 3.8, 1.2), cloud(7, 2.6, 0.8),
        ground, bird, eye, beak, manager, scoreText, bestText, ...over.entities,
    );
    return finishProject(project, scene, "flappy-2d");
}

// ---------------------------------------------------------------------------
// Pong for one or two players
// ---------------------------------------------------------------------------

export function pong(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Pong", "2d");
    scene.settings.background = { mode: "gradient", color: "#0f172a", topColor: "#1e1b4b" };

    const paddleScript = scriptAsset("Paddle.cs", `
using UnityEngine;

// Sol raket W/S ile oynar. Sağ raket ↑/↓ ile ikinci oyuncuya geçer; tuşa basılmazsa bilgisayar oynar.
public class Paddle : MonoBehaviour
{
    public bool leftSide = true;
    public float speed = 9f;
    public float limit = 3.9f;
    [Header("Bilgisayar")]
    public float aiSpeed = 6.2f;
    public Transform ball;

    private bool human;

    void Update()
    {
        float input = 0;
        if (leftSide)
        {
            if (Input.GetKey(KeyCode.W)) input += 1;
            if (Input.GetKey(KeyCode.S)) input -= 1;
        }
        else
        {
            if (Input.GetKey(KeyCode.UpArrow)) input += 1;
            if (Input.GetKey(KeyCode.DownArrow)) input -= 1;
            if (input != 0) human = true;
        }

        float y = transform.position.y;
        if (leftSide || human)
        {
            y += input * speed * Time.deltaTime;
        }
        else if (ball != null)
        {
            // Bilgisayar topu takip eder ama sınırlı hızla: arada bir kaçırır.
            y = Mathf.MoveTowards(y, ball.position.y, aiSpeed * Time.deltaTime);
        }
        transform.position = new Vector3(transform.position.x, Mathf.Clamp(y, -limit, limit), 0);
    }
}`);

    const ballScript = scriptAsset("PongBall.cs", `
using UnityEngine;

// Raketten sekerken açısı vurduğu yere göre değişir; her vuruşta biraz hızlanır.
public class PongBall : MonoBehaviour
{
    public float startSpeed = 7f;
    public float maxSpeed = 15f;
    public float speedUp = 1.06f;

    private Rigidbody2D rb;
    private float speed;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        Serve(Random.value < 0.5f ? -1 : 1);
    }

    public void Serve(int direction)
    {
        transform.position = Vector3.zero;
        rb.velocity = Vector2.zero;
        speed = startSpeed;
        float angle = Random.Range(-30f, 30f) * Mathf.Deg2Rad;
        Timer.After(0.8f, () => rb.velocity = new Vector2(Mathf.Cos(angle) * direction, Mathf.Sin(angle)) * speed);
    }

    void FixedUpdate()
    {
        Vector2 v = rb.velocity;
        if (v.sqrMagnitude < 0.01f) return;
        // Yatay hız hiç sıfıra yaklaşmasın, büyüklük sabit kalsın.
        if (Mathf.Abs(v.x) < 2.5f) v.x = v.x < 0 ? -2.5f : 2.5f;
        rb.velocity = v.normalized * speed;
    }

    void OnCollisionEnter2D(Collision2D collision)
    {
        if (!collision.gameObject.CompareTag("Paddle"))
        {
            Audio.Play("click", 0.35f);
            return;
        }
        Transform paddle = collision.transform;
        float offset = (transform.position.y - paddle.position.y) / (paddle.localScale.y * 0.5f);
        float direction = transform.position.x < paddle.position.x ? -1 : 1;
        speed = Mathf.Min(maxSpeed, speed * speedUp);
        rb.velocity = new Vector2(direction, Mathf.Clamp(offset, -1f, 1f) * 0.9f).normalized * speed;
        Audio.Play("blip", 0.5f);
        Tween.PunchScale(paddle, 0.15f, 0.2f);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("GoalLeft")) PongGame.Instance.Scored(false);
        else if (other.CompareTag("GoalRight")) PongGame.Instance.Scored(true);
    }
}`);

    const gameScript = scriptAsset("PongGame.cs", `
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

// Skoru tutar; 7 sayıya ulaşan kazanır.
public class PongGame : MonoBehaviour
{
    public static PongGame Instance;
    public int winScore = 7;
    public PongBall ball;
    public Text leftText;
    public Text rightText;
    public GameObject gameOverPanel;
    public Text resultText;

    private int left;
    private int right;
    private bool over;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        HUD.Show("W / S: sol raket  •  ↑ / ↓: ikinci oyuncu (basmazsan bilgisayar oynar)", 3f);
    }

    // leftScored: sol oyuncu sayı aldı (top sağ kaleye girdi).
    public void Scored(bool leftScored)
    {
        if (over) return;
        if (leftScored) left++;
        else right++;
        leftText.text = left.ToString();
        rightText.text = right.ToString();
        Tween.PunchScale(leftScored ? leftText : rightText, 0.35f, 0.3f);
        Audio.Play("coin", 0.5f);
        if (left >= winScore || right >= winScore)
        {
            over = true;
            ball.gameObject.SetActive(false);
            resultText.text = (left > right ? "Sol oyuncu kazandı!" : "Sağ oyuncu kazandı!") + "\\n" + left + " - " + right;
            Audio.Play("win");
            gameOverPanel.SetActive(true);
            return;
        }
        ball.Serve(leftScored ? 1 : -1);
    }

    public void Restart()
    {
        SceneManager.ReloadScene();
    }
}`);

    project.scripts = [paddleScript, ballScript, gameScript];

    const ball = entity("Ball", [
        sprite("#f8fafc", "circle", 4),
        createRigidBody({ gravityScale: 0, useGravity: false, linearDamping: 0, freezeRotation: true }),
        createCollider({ shape: "circle", radius: 0.5, friction: 0, bounciness: 1 }),
        script(ballScript),
    ], { scale: { x: 0.36, y: 0.36 }, tag: "Ball" });
    const paddle = (side: "left" | "right") => entity(side === "left" ? "LeftPaddle" : "RightPaddle", [
        sprite(side === "left" ? "#ec4899" : "#818cf8", "roundedSquare", 3),
        createCollider({ shape: "box", friction: 0, bounciness: 1 }),
        script(paddleScript, { leftSide: side === "left", ball: ref(ball) }),
    ], { position: { x: side === "left" ? -8.3 : 8.3 }, scale: { x: 0.32, y: 1.9 }, tag: "Paddle" });
    const wall = (name: string, y: number) => entity(name, [sprite("#334155", "square", 1), createCollider({ shape: "box", friction: 0, bounciness: 1 })], { position: { y }, scale: { x: 19, y: 0.3 }, tag: "Wall" });
    const goal = (name: string, x: number, tag: string) => entity(name, [createCollider({ shape: "box", isTrigger: true })], { position: { x }, scale: { x: 0.6, y: 12 }, tag });
    const dashes = Array.from({ length: 9 }, (_, index) => entity("CenterLine", [sprite("#475569", "square", 0)], { position: { y: -4 + index }, scale: { x: 0.08, y: 0.5 } }));

    const leftText = entity("LeftScore", [uiText("0", { anchor: "top", fontSize: 56, offset: { x: -120, y: 20 }, color: "#f9a8d4" })]);
    const rightText = entity("RightScore", [uiText("0", { anchor: "top", fontSize: 56, offset: { x: 120, y: 20 }, color: "#c7d2fe" })]);
    const manager = entity("PongGame", []);
    const over = gameOverPanel(manager, "Maç Bitti", "Rövanş", "#7c3aed");
    manager.components.push(script(gameScript, { ball: ref(ball), leftText: ref(leftText), rightText: ref(rightText), gameOverPanel: ref(over.panel), resultText: ref(over.result) }));

    scene.objects.push(
        camera2d(5),
        ...dashes,
        wall("TopWall", 4.85), wall("BottomWall", -4.85),
        goal("LeftGoal", -9.6, "GoalLeft"), goal("RightGoal", 9.6, "GoalRight"),
        paddle("left"), paddle("right"), ball, manager, leftText, rightText, ...over.entities,
    );
    return finishProject(project, scene, "pong-2d");
}

// ---------------------------------------------------------------------------
// Snake (C++)
// ---------------------------------------------------------------------------

export function snake(name: string): GameProjectDocument {
    const project = createBlankProject(name, "2d");
    const scene = createEmptyScene("Yılan", "2d");
    scene.settings.background = { mode: "solid", color: "#052e16", topColor: "#052e16" };

    const snakeScript = scriptAsset("Snake.cpp", `
#include <hanogt.h>

// Klasik yılan (C++): ızgara üzerinde adım adım ilerler. Ok tuşları / WASD ile yön değiştir.
// Elmayı yiyince uzar ve hızlanır; duvara ya da kendine çarparsan oyun biter.
class Snake : public MonoBehaviour {
public:
    GameObject* segmentPrefab = nullptr;
    GameObject* food = nullptr;
    GameObject* gameOverPanel = nullptr;
    Text* scoreText = nullptr;
    Text* resultText = nullptr;
    int columns = 24;
    int rows = 15;
    float cellSize = 0.6f;
    float startDelay = 0.16f;
    float minDelay = 0.07f;

private:
    std::vector<int> xs;
    std::vector<int> ys;
    std::vector<GameObject*> parts;
    int dirX = 1;
    int dirY = 0;
    int nextX = 1;
    int nextY = 0;
    int foodX = 0;
    int foodY = 0;
    int score = 0;
    float delay = 0.16f;
    float timer = 0.0f;
    bool over = false;

public:
    void Start() {
        delay = startDelay;
        for (int i = 0; i < 4; i++) {
            AddPart(columns / 2 - i, rows / 2);
        }
        PlaceFood();
        UpdateScore();
        HUD::Show("Ok tuşları / WASD: yön  •  Elmaları ye!", 2.5f);
    }

    void Update() {
        if (over) return;
        // Ters yöne dönülmez: sağa giderken sola basmak işe yaramaz.
        if ((Input::GetKeyDown(KeyCode::UpArrow) || Input::GetKeyDown(KeyCode::W)) && dirY == 0) { nextX = 0; nextY = 1; }
        if ((Input::GetKeyDown(KeyCode::DownArrow) || Input::GetKeyDown(KeyCode::S)) && dirY == 0) { nextX = 0; nextY = -1; }
        if ((Input::GetKeyDown(KeyCode::LeftArrow) || Input::GetKeyDown(KeyCode::A)) && dirX == 0) { nextX = -1; nextY = 0; }
        if ((Input::GetKeyDown(KeyCode::RightArrow) || Input::GetKeyDown(KeyCode::D)) && dirX == 0) { nextX = 1; nextY = 0; }

        timer += Time::deltaTime;
        if (timer < delay) return;
        timer = 0.0f;
        StepForward();
    }

    void StepForward() {
        dirX = nextX;
        dirY = nextY;
        int headX = xs[0] + dirX;
        int headY = ys[0] + dirY;
        if (headX < 0 || headY < 0 || headX >= columns || headY >= rows || Occupied(headX, headY)) {
            GameOver();
            return;
        }
        bool ate = headX == foodX && headY == foodY;
        if (ate) {
            AddPart(xs.back(), ys.back());
            score++;
            delay = Mathf::Max(minDelay, delay * 0.95f);
            Audio::Play("coin", 0.45f);
            UpdateScore();
        }
        // Gövde bir adım öne kayar: her parça öndekinin yerine geçer.
        for (int i = (int)xs.size() - 1; i > 0; i--) {
            xs[i] = xs[i - 1];
            ys[i] = ys[i - 1];
        }
        xs[0] = headX;
        ys[0] = headY;
        for (int i = 0; i < (int)parts.size(); i++) {
            parts[i]->transform->position = CellToWorld(xs[i], ys[i]);
        }
        if (ate) PlaceFood();
    }

    bool Occupied(int x, int y) {
        // Kuyruk bu adımda kayacağı için son parçaya çarpmak sayılmaz.
        for (int i = 0; i < (int)xs.size() - 1; i++) {
            if (xs[i] == x && ys[i] == y) return true;
        }
        return false;
    }

    void AddPart(int x, int y) {
        xs.push_back(x);
        ys.push_back(y);
        GameObject* part = Instantiate(segmentPrefab, CellToWorld(x, y), Quaternion::identity);
        if (parts.size() == 0) part->GetComponent<SpriteRenderer>()->color = Color(0.53f, 0.94f, 0.67f);
        parts.push_back(part);
    }

    void PlaceFood() {
        for (int attempt = 0; attempt < 200; attempt++) {
            int x = Random::Range(0, columns);
            int y = Random::Range(0, rows);
            bool taken = false;
            for (int i = 0; i < (int)xs.size(); i++) {
                if (xs[i] == x && ys[i] == y) taken = true;
            }
            if (!taken) {
                foodX = x;
                foodY = y;
                food->transform->position = CellToWorld(x, y);
                Tween::PunchScale(food->transform, 0.4f, 0.3f);
                return;
            }
        }
    }

    Vector3 CellToWorld(int x, int y) {
        return Vector3((x - (columns - 1) / 2.0f) * cellSize, (y - (rows - 1) / 2.0f) * cellSize, 0.0f);
    }

    void UpdateScore() {
        scoreText->text = "Elma: " + std::to_string(score);
    }

    void GameOver() {
        over = true;
        int best = Mathf::Max(score, PlayerPrefs::GetInt("snake.best", 0));
        PlayerPrefs::SetInt("snake.best", best);
        resultText->text = "Elma: " + std::to_string(score) + "\\nRekor: " + std::to_string(best);
        Audio::Play("lose", 0.6f);
        Tween::Shake(Camera::main->transform, 0.2f, 0.3f);
        gameOverPanel->SetActive(true);
    }

    // "Tekrar Oyna" butonu (R tuşu) bunu çağırır.
    void Restart() {
        SceneManager::ReloadScene();
    }
};`);

    project.scripts = [snakeScript];

    const segment = prefab("Segment", entity("Segment", [sprite("#22c55e", "roundedSquare", 3)], { scale: { x: 0.54, y: 0.54 } }));
    project.prefabs = [segment];

    const columns = 24;
    const rows = 15;
    const cell = 0.6;
    const board = entity("Board", [sprite("#064e3b", "roundedSquare", -2)], { scale: { x: columns * cell + 0.2, y: rows * cell + 0.2 } });
    const food = entity("Food", [sprite("#ef4444", "circle", 4)], { scale: { x: 0.46, y: 0.46 } });
    const leaf = entity("Leaf", [sprite("#84cc16", "diamond", 5)], { position: { x: 0.18, y: 0.55 }, scale: { x: 0.45, y: 0.3 }, parentId: food.id });
    const scoreText = entity("ScoreText", [uiText("Elma: 0", { anchor: "top-left", fontSize: 28, color: "#bbf7d0" })]);
    const manager = entity("Snake", []);
    const over = gameOverPanel(manager, "Oyun Bitti", "Tekrar Oyna", "#16a34a");
    manager.components.push(script(snakeScript, {
        segmentPrefab: prefabRef(segment),
        food: ref(food),
        gameOverPanel: ref(over.panel),
        scoreText: ref(scoreText),
        resultText: ref(over.result),
        columns,
        rows,
        cellSize: cell,
    }));

    scene.objects.push(camera2d(5.2, 0, 0.2), board, food, leaf, manager, scoreText, ...over.entities);
    return finishProject(project, scene, "snake-2d");
}

/** Shared by the action templates: the explosion prefab every shooter uses. */
export function explosionPrefab(colors: [string, string] = ["#fde047", "#ef4444"]) {
    const autoDestroy = scriptAsset("AutoDestroy.cs", AUTO_DESTROY);
    return { autoDestroy, explosion: prefab("Explosion", entity("Explosion", [burst(colors, 24, 4.5, 0.22), script(autoDestroy, { lifetime: 1 })])) };
}
