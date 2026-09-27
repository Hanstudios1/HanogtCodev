import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, BookOpen, Gamepad2, Rocket } from "lucide-react";
import { API_MEMBERS, TYPE_MEMBERS } from "@/components/GameEngine/editor/completions";

export const metadata: Metadata = {
    title: "Hanogt Engine Belgeleri",
    description: "Hanogt Engine kullanım kılavuzu: editör, bileşenler, C# ve C++ ile script yazma, fizik, girdi, prefab, sahneler, yayınlama ve API referansı.",
};

const SECTIONS = [
    ["baslarken", "Başlarken"],
    ["editor", "Editör"],
    ["bilesenler", "Nesneler ve bileşenler"],
    ["csharp", "C# ile script"],
    ["cpp", "C++ ile script"],
    ["yasam-dongusu", "Yaşam döngüsü"],
    ["girdi", "Girdi (Input)"],
    ["fizik", "Fizik ve çarpışmalar"],
    ["prefab", "Prefab, Instantiate, Destroy"],
    ["coroutine", "Coroutine ve Invoke"],
    ["sahneler", "Sahneler"],
    ["ui-ses", "UI, HUD ve ses"],
    ["kayit", "Kayıt (PlayerPrefs)"],
    ["yayinlama", "Yayınlama ve dışa aktarma"],
    ["api", "API referansı"],
    ["farklar", "Unity'den farklar"],
    ["guvenlik", "Güvenlik ve sınırlar"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-24 border-b border-zinc-200/70 py-10 dark:border-white/[0.06]">
            <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">{title}</h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">{children}</div>
        </section>
    );
}

function Code({ children, language = "C#" }: { children: string; language?: string }) {
    return (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 dark:border-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400"><span>{language}</span></div>
            <pre className="scrollbar-thin overflow-x-auto p-4 text-[12.5px] leading-relaxed text-zinc-200"><code>{children.trim()}</code></pre>
        </div>
    );
}

function K({ children }: { children: ReactNode }) {
    return <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[13px] text-indigo-600 dark:bg-white/10 dark:text-indigo-300">{children}</code>;
}

function Table({ rows, head }: { rows: Array<[ReactNode, ReactNode]>; head: [string, string] }) {
    return (
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
            <table className="w-full text-left text-[14px]">
                <thead className="bg-zinc-50 text-[12px] uppercase tracking-wider text-zinc-500 dark:bg-white/[0.04]">
                    <tr><th className="px-4 py-2 font-semibold">{head[0]}</th><th className="px-4 py-2 font-semibold">{head[1]}</th></tr>
                </thead>
                <tbody>
                    {rows.map(([a, b], index) => (
                        <tr key={index} className="border-t border-zinc-200 dark:border-white/[0.06]">
                            <td className="px-4 py-2 align-top font-medium text-zinc-800 dark:text-zinc-200">{a}</td>
                            <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{b}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Tip({ children }: { children: ReactNode }) {
    return <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] p-4 text-[14px] text-zinc-700 dark:text-zinc-300">💡 {children}</div>;
}

export default function EngineDocsPage() {
    return (
        <div className="min-h-dvh bg-white dark:bg-zinc-950">
            <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-zinc-950/80">
                <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
                    <Link href="/game-engine" className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5" aria-label="Motora dön"><ArrowLeft className="h-4 w-4" /></Link>
                    <div className="flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><BookOpen className="h-4 w-4" /></div>
                        <span className="font-black text-zinc-900 dark:text-white">Hanogt Engine Belgeleri</span>
                    </div>
                    <div className="flex-1" />
                    <Link href="/arcade" className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5 sm:inline-flex"><Rocket className="h-4 w-4" />Arcade</Link>
                    <Link href="/game-engine" className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-semibold text-white dark:bg-white dark:text-zinc-900"><Gamepad2 className="h-4 w-4" />Motoru aç</Link>
                </div>
            </header>
            <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[240px_1fr]">
                <nav className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] overflow-y-auto py-8 lg:block" aria-label="İçindekiler">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400">İçindekiler</p>
                    <ol className="space-y-0.5">
                        {SECTIONS.map(([id, title], index) => (
                            <li key={id}><a href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-[13.5px] text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"><span className="mr-2 text-zinc-400">{index + 1}.</span>{title}</a></li>
                        ))}
                    </ol>
                </nav>
                <main id="main-content" className="min-w-0 pb-24">
                    <div className="border-b border-zinc-200/70 py-12 dark:border-white/[0.06]">
                        <p className="text-[13px] font-semibold text-indigo-600 dark:text-indigo-400">Kılavuz · v2</p>
                        <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-5xl">Tarayıcıda gerçek bir oyun motoru</h1>
                        <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                            Hanogt Engine; Unity&apos;ye benzeyen editörü, GameObject/Component mimarisi, C# ve C++ script desteği, fizik motoru, WebGL render&apos;ı ve Arcade yayınlamasıyla tarayıcıda çalışan bir 2D/3D oyun motorudur. Kurulum gerekmez; projeleriniz buluta veya tarayıcınıza kaydedilir.
                        </p>
                    </div>

                    <Section id="baslarken" title="1. Başlarken">
                        <ol className="list-decimal space-y-2 pl-5">
                            <li><Link href="/game-engine" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">Oyun Motoru</Link> sayfasını açın ve bir şablon seçin (2D Platform, 3D Top Yuvarlama, Uzay Nişancısı, Tuğla Kırma veya boş proje).</li>
                            <li>Giriş yaptıysanız proje hesabınıza (bulut) kaydedilir; misafir olarak oluşturulan projeler bu tarayıcıda (IndexedDB) saklanır.</li>
                            <li>Üstteki <b>▶ Oynat</b> düğmesi (Ctrl+P) oyunu editörün içinde çalıştırır. Durdurduğunuzda sahne oynatmadan önceki haline döner.</li>
                            <li>Scriptlere çift tıklayarak kod editörünü açın; değişiklikler otomatik derlenir, hatalar satır satır gösterilir.</li>
                            <li>Hazır olduğunuzda <b>Yayınla</b> ile Arcade&apos;e gönderin veya <b>Dışa aktar → Oynanabilir HTML</b> ile tek dosyalık oyun indirin.</li>
                        </ol>
                        <Tip>Şablonlardaki her script, Unity derslerindeki gibi yazılmıştır ve yorum satırlarıyla açıklanmıştır. Öğrenmenin en hızlı yolu bir şablonu açıp değerleri değiştirmektir.</Tip>
                    </Section>

                    <Section id="editor" title="2. Editör">
                        <Table head={["Panel", "Ne işe yarar?"]} rows={[
                            ["Hiyerarşi", "Sahnedeki nesnelerin ağacı. Sürükle-bırak ile ebeveyn değiştirme ve sıralama, sağ tık menüsü (oluştur, çoğalt, prefab yap, sil), arama ve göz simgesiyle aktiflik."],
                            ["Sahne görünümü", "WebGL görünüm. Tıklayarak seçin; taşıma/döndürme/ölçekleme gizmolarıyla düzenleyin. 3D'de sol sürükle döndürür, sağ sürükle kaydırır, tekerlek yakınlaştırır. Prefab ve görselleri buraya sürükleyebilirsiniz."],
                            ["Oyun görünümü", "Sahnenin ana kameradan görünüşü. Oynatma sırasında oyun burada çalışır."],
                            ["Inspector", "Seçili nesnenin bileşenlerini düzenler. Script'lerdeki public alanlar burada otomatik görünür."],
                            ["Proje (Assets)", "Sahneler, scriptler, prefab'lar ve dokular. Görsel yükleme, yeni C#/C++ script, yeni sahne."],
                            ["Konsol", "Debug.Log çıktıları, uyarılar, çalışma zamanı hataları ve derleme hataları. Kaynağa tıklayınca ilgili satır açılır."],
                        ]} />
                        <Table head={["Kısayol", "Eylem"]} rows={[
                            ["W / E / R", "Taşı / Döndür / Ölçekle gizmosu"],
                            ["F", "Seçili nesneye odaklan"],
                            ["Ctrl+Z · Ctrl+Y", "Geri al · Yinele"],
                            ["Ctrl+D", "Çoğalt"],
                            ["Ctrl+C · Ctrl+V", "Kopyala · Yapıştır"],
                            ["Delete", "Sil"],
                            ["F2", "Yeniden adlandır"],
                            ["Ctrl+S", "Kaydet (kapak görseliyle)"],
                            ["Ctrl+P", "Oynat / Durdur"],
                        ]} />
                        <p>Sayı alanlarının etiketini (X, Y, Z) yatay sürükleyerek değeri kaydırabilirsiniz; Shift ile 10 kat, Alt ile 0,1 kat hızlı. Alanlara <K>2*3</K> gibi ifadeler yazılabilir.</p>
                    </Section>

                    <Section id="bilesenler" title="3. Nesneler ve bileşenler">
                        <p>Her nesne (GameObject) bir <b>Transform</b> ve ona eklenen bileşenlerden oluşur. Koordinat sistemi Unity ile aynıdır: X sağ, Y yukarı, Z ileri; açılar derece cinsindendir.</p>
                        <Table head={["Bileşen", "Açıklama"]} rows={[
                            ["Transform", "Konum, dönüş ve ölçek. Ebeveyn-çocuk ilişkisi hiyerarşiden gelir."],
                            ["Sprite Renderer", "2D şekil (kare, daire, üçgen, yuvarlatılmış kare, elmas, altıgen, yıldız) veya yüklenen görsel; renk, saydamlık, sıralama, çevirme."],
                            ["Mesh Renderer", "3D ilkel (küp, küre, düzlem, kapsül, silindir, koni, torus) ve PBR materyal: renk, metalik, pürüzlülük, ışıma, doku ve döşeme."],
                            ["Camera", "Perspektif veya ortografik. Main Camera işaretli ve aktif olan kamera oyunu gösterir."],
                            ["Light", "Yönlü, nokta veya spot ışık; renk, yoğunluk, menzil ve gölgeler."],
                            ["Rigidbody / Rigidbody 2D", "Dinamik, kinematik veya statik gövde; kütle, yerçekimi, sürtünme, eksen kilitleme."],
                            ["Collider", "Kutu, küre (3D) veya daire (2D) çarpıştırıcı; tetikleyici (Is Trigger), sürtünme ve sekme."],
                            ["Script", "C# veya C++ MonoBehaviour sınıfı. Public alanlar Inspector'da düzenlenir."],
                            ["Particle System", "GPU'da çizilen parçacıklar: oran, patlama, ömür, hız, koni açısı, boyut ve renk geçişi, yerçekimi."],
                            ["Audio Source", "Prosedürel ses efektleri: coin, jump, hit, explosion, laser, powerup, click, blip, lose, win, step, shoot."],
                            ["UI Text", "Ekrana sabitlenen metin (skor, can). 9 çapa noktası, ofset, yazı boyutu, gölge."],
                        ]} />
                    </Section>

                    <Section id="csharp" title="4. C# ile script yazma">
                        <p>Scriptler Unity&apos;deki gibi <K>MonoBehaviour</K> sınıfından türetilir. Dosyadaki ilk MonoBehaviour sınıfı bileşen olarak kullanılır. Public alanlar (ve <K>[SerializeField]</K> ile işaretlenen private alanlar) Inspector&apos;da görünür.</p>
                        <Code>{`using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
    [Header("Hareket")]
    public float speed = 6f;
    [Range(1, 20)] public float jumpForce = 8f;
    public GameObject bulletPrefab;   // Inspector'dan bir prefab atayın

    private Rigidbody2D rb;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        rb.velocity = new Vector2(h * speed, rb.velocity.y);

        if (Input.GetKeyDown(KeyCode.Space))
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);

        if (Input.GetMouseButtonDown(0))
            Instantiate(bulletPrefab, transform.position, Quaternion.identity);
    }
}`}</Code>
                        <p>Desteklenen dil özellikleri: sınıflar, kalıtım, arayüzler, enum, struct, özellikler (get/set), statik üyeler, lambda, <K>List&lt;T&gt;</K>, <K>Dictionary&lt;K,V&gt;</K>, <K>foreach</K>, <K>switch</K>, <K>try/catch</K>, string interpolasyonu (<K>{`$"Skor: {score}"`}</K>), <K>ref/out</K>, varsayılan parametreler, coroutine (<K>IEnumerator</K> + <K>yield return</K>) ve LINQ benzeri temel yöntemler.</p>
                    </Section>

                    <Section id="cpp" title="5. C++ ile script yazma">
                        <p>C++ scriptleri aynı motor API&apos;sini kullanır. Üyelere <K>-&gt;</K> veya <K>.</K> ile, statik API&apos;lere <K>::</K> ile erişilir. Nesne referansları işaretçi (<K>GameObject*</K>) olarak yazılabilir; <K>nullptr</K> desteklenir.</p>
                        <Code language="C++">{`#include <hanogt.h>

class Spinner : public MonoBehaviour {
public:
    float speed = 90.0f;
    GameObject* target = nullptr;

    void Update() {
        transform->Rotate(0, speed * Time::deltaTime, 0);
        if (target != nullptr && Input::GetKeyDown(KeyCode::Space)) {
            target->SetActive(!target->activeSelf);
        }
    }

    IEnumerator Blink() {
        while (true) {
            Debug::Log("tick");
            co_yield new WaitForSeconds(0.5f);
        }
    }
};`}</Code>
                        <p><K>std::vector</K>, <K>std::map</K>, <K>std::string</K>, <K>std::cout</K>, <K>printf</K>, <K>cmath</K> fonksiyonları ve serbest fonksiyonlar kullanılabilir. C++ ve C# scriptleri aynı projede birlikte çalışır ve birbirlerinin sınıflarına erişebilir.</p>
                    </Section>

                    <Section id="yasam-dongusu" title="6. Yaşam döngüsü">
                        <Table head={["Metot", "Ne zaman çağrılır?"]} rows={[
                            [<K key="a">Awake()</K>, "Nesne oluşturulduğunda (aktifse) bir kez, tüm nesnelerin script örnekleri hazırken."],
                            [<K key="b">OnEnable()</K>, "Bileşen veya nesne her etkinleştirildiğinde."],
                            [<K key="c">Start()</K>, "İlk Update'ten hemen önce bir kez. IEnumerator dönerse coroutine olarak çalışır."],
                            [<K key="d">FixedUpdate()</K>, "Sabit fizik adımında (varsayılan 60 Hz), fizik hesaplamasından önce."],
                            [<K key="e">Update()</K>, "Her karede. Girdi okuma ve oyun mantığı için."],
                            [<K key="f">LateUpdate()</K>, "Tüm Update'lerden sonra. Kamera takibi için idealdir."],
                            [<K key="g">OnDisable() / OnDestroy()</K>, "Bileşen devre dışı kalınca / nesne yok edilince."],
                            [<K key="h">OnApplicationQuit()</K>, "Oyun durdurulurken."],
                        ]} />
                        <p>Çarpışma ve fare olayları: <K>OnCollisionEnter/Stay/Exit</K>, <K>OnTriggerEnter/Stay/Exit</K> (2D için sonuna <K>2D</K> ekleyin), <K>OnMouseDown/Up/Enter/Exit/Over/Drag</K>.</p>
                    </Section>

                    <Section id="girdi" title="7. Girdi (Input)">
                        <Code>{`if (Input.GetKey(KeyCode.W)) { /* basılı tutuluyor */ }
if (Input.GetKeyDown(KeyCode.Space)) { /* bu karede basıldı */ }
float h = Input.GetAxis("Horizontal");     // A/D veya ←/→ (yumuşatılmış)
float v = Input.GetAxisRaw("Vertical");    // W/S veya ↑/↓ (-1, 0, 1)
if (Input.GetButtonDown("Jump")) { }       // Space
if (Input.GetMouseButton(0)) { }           // sol tık / dokunma
Vector3 mouse = Input.mousePosition;       // piksel, sol-alt köşe (0,0)
Vector3 world = Camera.main.ScreenToWorldPoint(mouse);`}</Code>
                        <p>Mobil cihazlarda, proje ayarlarında açıksa ekranda yön tuşları ve A (Space) / B (LeftControl) düğmeleri gösterilir; bunlar normal tuşlar gibi okunur.</p>
                    </Section>

                    <Section id="fizik" title="8. Fizik ve çarpışmalar">
                        <p>Fizik, sabit zaman adımında çalışan dürtü tabanlı bir motordur: yerçekimi, sürtünme, sekme, kinematik gövdeler, tetikleyiciler, zemin algılama ve ışın atma desteklenir. Tetikleyici olayları için çarpışan nesnelerden en az birinde Rigidbody bulunmalıdır (Unity&apos;deki gibi).</p>
                        <Code>{`void OnCollisionEnter2D(Collision2D collision)
{
    // Normal, diğer nesneden bu nesneye doğru bakar.
    if (collision.GetContact(0).normal.y > 0.5f) Debug.Log("Yere indim");
}

void OnTriggerEnter(Collider other)
{
    if (other.CompareTag("Coin")) Destroy(other.gameObject);
}

void FixedUpdate()
{
    RaycastHit hit;
    if (Physics.Raycast(transform.position, Vector3.down, out hit, 1.2f))
        Debug.Log("Altımda: " + hit.collider.name);

    rb.AddForce(Vector3.forward * 10f);                 // sürekli kuvvet
    rb.AddForce(Vector3.up * 5f, ForceMode.Impulse);    // anlık itki
}`}</Code>
                        <p>2D&apos;de <K>Physics2D.Raycast</K> bir <K>RaycastHit2D</K> döndürür ve <K>if (hit)</K> ile kontrol edilir. <K>Physics.OverlapSphere</K>, <K>Physics2D.OverlapCircle</K>, <K>Linecast</K> ve <K>CheckSphere</K> da kullanılabilir.</p>
                    </Section>

                    <Section id="prefab" title="9. Prefab, Instantiate ve Destroy">
                        <p>Hiyerarşide bir nesneye sağ tıklayıp <b>Prefab oluştur</b> deyin. Script&apos;te <K>public GameObject prefab;</K> alanına Inspector&apos;dan prefab&apos;ı seçin ve çalışma sırasında çoğaltın:</p>
                        <Code>{`GameObject enemy = Instantiate(enemyPrefab, new Vector3(0, 5, 0), Quaternion.identity);
enemy.GetComponent<Enemy>().speed = 4f;
Destroy(enemy, 3f);                  // 3 saniye sonra yok et
Destroy(gameObject);                 // bu nesneyi yok et
GameObject p = Resources.Load<GameObject>("Bullet"); // prefab'ı adıyla yükle`}</Code>
                    </Section>

                    <Section id="coroutine" title="10. Coroutine ve Invoke">
                        <Code>{`void Start()
{
    StartCoroutine(SpawnWaves());
    InvokeRepeating("Tick", 1f, 0.5f);   // 1 sn sonra, her 0.5 sn
    Invoke("Explode", 3f);
}

IEnumerator SpawnWaves()
{
    for (int wave = 1; wave <= 5; wave++)
    {
        Debug.Log("Dalga " + wave);
        yield return new WaitForSeconds(2f);
    }
    yield return new WaitUntil(() => enemiesLeft == 0);
    HUD.Show("Tüm dalgalar bitti!", 2f);
}`}</Code>
                        <p><K>yield return null</K> bir kare, <K>WaitForSeconds</K>, <K>WaitForSecondsRealtime</K>, <K>WaitForFixedUpdate</K>, <K>WaitForEndOfFrame</K>, <K>WaitUntil</K>, <K>WaitWhile</K> ve iç içe coroutine desteklenir. <K>StopCoroutine</K>, <K>StopAllCoroutines</K>, <K>CancelInvoke</K> ve <K>IsInvoking</K> de mevcuttur.</p>
                    </Section>

                    <Section id="sahneler" title="11. Sahneler">
                        <p>Proje panelinden yeni sahne ekleyin; <b>Başlangıç sahnesi</b> oyunun açıldığı sahnedir. Sahne değiştirmek için:</p>
                        <Code>{`SceneManager.LoadScene("Level2");          // adıyla
SceneManager.LoadScene(1);                 // sırasıyla
SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex); // yeniden başlat
DontDestroyOnLoad(gameObject);             // sahneler arası koru`}</Code>
                        <p>Statik alanlar sahne değişince korunur (Unity ile aynı).</p>
                    </Section>

                    <Section id="ui-ses" title="12. UI, HUD ve ses">
                        <Code>{`public Text scoreText;       // Inspector'da bir UI Text nesnesi seçin
scoreText.text = "Skor: " + score;

HUD.Show("Seviye tamamlandı!", 2f, Color.yellow);   // ekranın ortasında mesaj
Audio.Play("coin");                                  // hazır ses efekti
GetComponent<AudioSource>().Play();`}</Code>
                    </Section>

                    <Section id="kayit" title="13. Kayıt (PlayerPrefs)">
                        <Code>{`int best = PlayerPrefs.GetInt("best", 0);
if (score > best) PlayerPrefs.SetInt("best", score);
PlayerPrefs.SetString("name", "Han");
PlayerPrefs.DeleteKey("name");`}</Code>
                        <p>Değerler oyunu oynayan kişinin tarayıcısında, her proje için ayrı saklanır (en fazla 64 KB).</p>
                    </Section>

                    <Section id="yayinlama" title="14. Yayınlama ve dışa aktarma">
                        <ul className="list-disc space-y-2 pl-5">
                            <li><b>Arcade&apos;de yayınla:</b> Bulut projeleri için. Oyun derlenir ve güvenlik taramasından geçer; herkese açık bağlantı oluşur. Oyuncular oynayabilir, beğenebilir ve remiksleyebilir. İstediğiniz zaman yayından kaldırabilirsiniz.</li>
                            <li><b>Oynanabilir HTML:</b> Oyunu ve motoru tek bir .html dosyasına paketler; internet olmadan açılır, istediğiniz yerde barındırabilirsiniz.</li>
                            <li><b>Proje dosyası (.json):</b> Yedekleme ve başka hesaba/tarayıcıya taşıma için.</li>
                        </ul>
                    </Section>

                    <Section id="api" title="15. API referansı">
                        <p>Aşağıdaki üyeler kod editöründe otomatik tamamlanır.</p>
                        <div className="grid gap-4 md:grid-cols-2">
                            {Object.entries({ ...API_MEMBERS, ...TYPE_MEMBERS }).map(([name, members]) => (
                                <div key={name} className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
                                    <p className="font-mono text-[14px] font-bold text-zinc-900 dark:text-white">{name}</p>
                                    <p className="mt-2 flex flex-wrap gap-1.5">
                                        {members.map((member) => <code key={member} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11.5px] text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300">{member}</code>)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section id="farklar" title="16. Unity'den farklar">
                        <ul className="list-disc space-y-2 pl-5">
                            <li>Ses efektleri dosya yerine prosedürel olarak üretilir (<K>Audio.Play(&quot;coin&quot;)</K>).</li>
                            <li>Kapsül/mesh çarpıştırıcılar kutu olarak yaklaştırılır; açısal fizik basitleştirilmiştir (küreler görsel olarak yuvarlanır).</li>
                            <li>Katman maskeleri (LayerMask) ve <K>IgnoreCollision</K> yok sayılır; bunun yerine etiket ve tetikleyici kullanın.</li>
                            <li>UI olarak UI Text ve HUD mesajları vardır; Canvas/Button sistemi yoktur (tıklanabilir nesneler için <K>OnMouseDown</K> kullanın).</li>
                            <li>Scriptler gerçek .NET/C++ derleyicisi yerine güvenli bir yorumlayıcıda çalışır; ağ, dosya ve tarayıcı API&apos;lerine erişemez.</li>
                        </ul>
                    </Section>

                    <Section id="guvenlik" title="17. Güvenlik ve sınırlar">
                        <ul className="list-disc space-y-2 pl-5">
                            <li>Script yorumlayıcısı DOM&apos;a, ağa, çerezlere veya dosyalara erişemez; her çağrının komut bütçesi vardır. Sonsuz döngüler oyunu dondurmaz, ilgili script devre dışı bırakılır ve konsola yazılır.</li>
                            <li>Proje içeriği en fazla 900 KB (dokular dahil), script başına 160 KB, 64 script, 24 sahne ve sahne başına 1000 nesne olabilir. Yüklenen görseller otomatik küçültülür.</li>
                            <li>Arcade&apos;e yayınlanan oyunlar herkese açıktır. Kişisel veri, parola veya gizli anahtar paylaşmayın; kurallara aykırı içerik kaldırılır.</li>
                        </ul>
                    </Section>
                </main>
            </div>
        </div>
    );
}
