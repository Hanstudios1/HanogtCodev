/**
 * The first-game walkthrough of the engine docs (/game-engine/docs#ilk-oyun).
 * scripts/tests/engine-docs.test.mjs builds the scene it describes with the
 * editor's own operations and plays it, so the steps and the code shown in the
 * docs keep working when the engine changes.
 */
export const FIRST_GAME = {
    player: { x: 0, y: 0 },
    ground: { x: 0, y: -3, scaleX: 14 },
    coins: [
        { x: -4, y: -2 },
        { x: 3, y: -2 },
        { x: 5, y: -0.5 },
    ],
    /** Script names (Turkish and English readers name the script differently). */
    scriptName: { tr: "Oyuncu", en: "Player" },
    script: {
        tr: `using UnityEngine;
using UnityEngine.SceneManagement;

// Ok tuşları (ya da A/D) ile yürür, Space ile zıplar ve coinleri toplar.
public class Oyuncu : MonoBehaviour
{
    public float hiz = 6f;
    public float ziplamaGucu = 7f;

    private Rigidbody2D rb;
    private bool yerde;
    private int skor;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        HUD.Show("Coinleri topla!", 2f);
    }

    void Update()
    {
        float yatay = Input.GetAxisRaw("Horizontal");
        rb.velocity = new Vector2(yatay * hiz, rb.velocity.y);

        if (Input.GetButtonDown("Jump") && yerde)
        {
            rb.velocity = new Vector2(rb.velocity.x, ziplamaGucu);
            yerde = false;
            Audio.Play("jump");
        }

        // Dünyadan düştüysek baştan başla.
        if (transform.position.y < -10f) SceneManager.ReloadScene();
    }

    void OnCollisionStay2D(Collision2D carpisma)
    {
        // Zeminin normali yukarı bakıyorsa ayağımız yerde.
        if (carpisma.GetContact(0).normal.y > 0.5f) yerde = true;
    }

    void OnTriggerEnter2D(Collider2D diger)
    {
        if (!diger.CompareTag("Coin")) return;
        skor++;
        Audio.Play("coin");
        HUD.Show("Skor: " + skor, 1f);
        Destroy(diger.gameObject);
    }
}`,
        en: `using UnityEngine;
using UnityEngine.SceneManagement;

// Walks with the arrow keys (or A/D), jumps with Space and collects coins.
public class Player : MonoBehaviour
{
    public float speed = 6f;
    public float jumpForce = 7f;

    private Rigidbody2D rb;
    private bool grounded;
    private int score;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        HUD.Show("Collect the coins!", 2f);
    }

    void Update()
    {
        float h = Input.GetAxisRaw("Horizontal");
        rb.velocity = new Vector2(h * speed, rb.velocity.y);

        if (Input.GetButtonDown("Jump") && grounded)
        {
            rb.velocity = new Vector2(rb.velocity.x, jumpForce);
            grounded = false;
            Audio.Play("jump");
        }

        // Fell off the world? Start again.
        if (transform.position.y < -10f) SceneManager.ReloadScene();
    }

    void OnCollisionStay2D(Collision2D collision)
    {
        // The ground's normal points up when it is under our feet.
        if (collision.GetContact(0).normal.y > 0.5f) grounded = true;
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (!other.CompareTag("Coin")) return;
        score++;
        Audio.Play("coin");
        HUD.Show("Score: " + score, 1f);
        Destroy(other.gameObject);
    }
}`,
    },
} as const;
