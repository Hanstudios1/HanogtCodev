"use client";

import { ArrowLeft, BookOpen, Gamepad2, Rocket } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { API_MEMBERS, TYPE_MEMBERS } from "@/components/GameEngine/editor/completions";
import { engineLocale } from "@/components/GameEngine/editor/text";
import { useI18n } from "@/lib/i18n";

/** Section anchors stay the same in every language so shared links keep working. */
const SECTIONS: Array<{ id: string; tr: string; en: string }> = [
    { id: "baslarken", tr: "Başlarken", en: "Getting started" },
    { id: "editor", tr: "Editör", en: "The editor" },
    { id: "bilesenler", tr: "Nesneler ve bileşenler", en: "Objects and components" },
    { id: "csharp", tr: "C# ile script", en: "Scripting in C#" },
    { id: "cpp", tr: "C++ ile script", en: "Scripting in C++" },
    { id: "yasam-dongusu", tr: "Yaşam döngüsü", en: "Lifecycle" },
    { id: "girdi", tr: "Girdi (Input)", en: "Input" },
    { id: "fizik", tr: "Fizik ve çarpışmalar", en: "Physics and collisions" },
    { id: "prefab", tr: "Prefab, Instantiate, Destroy", en: "Prefabs, Instantiate, Destroy" },
    { id: "coroutine", tr: "Coroutine ve Invoke", en: "Coroutines and Invoke" },
    { id: "sahneler", tr: "Sahneler", en: "Scenes" },
    { id: "ui-ses", tr: "UI, HUD ve ses", en: "UI, HUD and sound" },
    { id: "kayit", tr: "Kayıt (PlayerPrefs)", en: "Saving (PlayerPrefs)" },
    { id: "yayinlama", tr: "Yayınlama ve dışa aktarma", en: "Publishing and exporting" },
    { id: "api", tr: "API referansı", en: "API reference" },
    { id: "farklar", tr: "Unity'den farklar", en: "Differences from Unity" },
    { id: "guvenlik", tr: "Güvenlik ve sınırlar", en: "Security and limits" },
];

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
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 dark:border-white/10" dir="ltr">
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
            <table className="w-full text-start text-[14px]">
                <thead className="bg-zinc-50 text-[12px] uppercase tracking-wider text-zinc-500 dark:bg-white/[0.04]">
                    <tr><th className="px-4 py-2 text-start font-semibold">{head[0]}</th><th className="px-4 py-2 text-start font-semibold">{head[1]}</th></tr>
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

function ApiReference() {
    return (
        <div className="grid gap-4 md:grid-cols-2" dir="ltr">
            {Object.entries({ ...API_MEMBERS, ...TYPE_MEMBERS }).map(([name, members]) => (
                <div key={name} className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
                    <p className="font-mono text-[14px] font-bold text-zinc-900 dark:text-white">{name}</p>
                    <p className="mt-2 flex flex-wrap gap-1.5">
                        {members.map((member) => <code key={member} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11.5px] text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300">{member}</code>)}
                    </p>
                </div>
            ))}
        </div>
    );
}

function DocsTR() {
    return (
        <>
                            <Section id="baslarken" title="1. Başlarken">
                                <ol className="list-decimal space-y-2 ps-5">
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
                                <ul className="list-disc space-y-2 ps-5">
                                    <li><b>Arcade&apos;de yayınla:</b> Bulut projeleri için. Oyun derlenir ve güvenlik taramasından geçer; herkese açık bağlantı oluşur. Oyuncular oynayabilir, beğenebilir ve remiksleyebilir. İstediğiniz zaman yayından kaldırabilirsiniz.</li>
                                    <li><b>Oynanabilir HTML:</b> Oyunu ve motoru tek bir .html dosyasına paketler; internet olmadan açılır, istediğiniz yerde barındırabilirsiniz.</li>
                                    <li><b>Proje dosyası (.json):</b> Yedekleme ve başka hesaba/tarayıcıya taşıma için.</li>
                                </ul>
                            </Section>

                            <Section id="api" title="15. API referansı">
                                <p>Aşağıdaki üyeler kod editöründe otomatik tamamlanır.</p>
                                <ApiReference />
                            </Section>

                            <Section id="farklar" title="16. Unity'den farklar">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li>Ses efektleri dosya yerine prosedürel olarak üretilir (<K>Audio.Play(&quot;coin&quot;)</K>).</li>
                                    <li>Kapsül/mesh çarpıştırıcılar kutu olarak yaklaştırılır; açısal fizik basitleştirilmiştir (küreler görsel olarak yuvarlanır).</li>
                                    <li>Katman maskeleri (LayerMask) ve <K>IgnoreCollision</K> yok sayılır; bunun yerine etiket ve tetikleyici kullanın.</li>
                                    <li>UI olarak UI Text ve HUD mesajları vardır; Canvas/Button sistemi yoktur (tıklanabilir nesneler için <K>OnMouseDown</K> kullanın).</li>
                                    <li>Scriptler gerçek .NET/C++ derleyicisi yerine güvenli bir yorumlayıcıda çalışır; ağ, dosya ve tarayıcı API&apos;lerine erişemez.</li>
                                </ul>
                            </Section>

                            <Section id="guvenlik" title="17. Güvenlik ve sınırlar">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li>Script yorumlayıcısı DOM&apos;a, ağa, çerezlere veya dosyalara erişemez; her çağrının komut bütçesi vardır. Sonsuz döngüler oyunu dondurmaz, ilgili script devre dışı bırakılır ve konsola yazılır.</li>
                                    <li>Proje içeriği en fazla 900 KB (dokular dahil), script başına 160 KB, 64 script, 24 sahne ve sahne başına 1000 nesne olabilir. Yüklenen görseller otomatik küçültülür.</li>
                                    <li>Arcade&apos;e yayınlanan oyunlar herkese açıktır. Kişisel veri, parola veya gizli anahtar paylaşmayın; kurallara aykırı içerik kaldırılır.</li>
                                </ul>
                            </Section>
        </>
    );
}

function DocsEN() {
    return (
        <>
                            <Section id="baslarken" title="1. Getting started">
                                <ol className="list-decimal space-y-2 ps-5">
                                    <li>Open the <Link href="/game-engine" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">Game Engine</Link> page and pick a template (2D Platformer, 3D Roll-a-Ball, Space Shooter, Brick Breaker or an empty project).</li>
                                    <li>When you are signed in, the project is saved to your account (cloud); projects created as a guest are stored in this browser (IndexedDB).</li>
                                    <li>The <b>▶ Play</b> button at the top (Ctrl+P) runs the game inside the editor. When you stop, the scene returns to how it was before you pressed Play.</li>
                                    <li>Double-click a script to open the code editor; changes are compiled automatically and errors are shown line by line.</li>
                                    <li>When you are ready, send it to the Arcade with <b>Publish</b>, or download a single-file game with <b>Export → Playable HTML</b>.</li>
                                </ol>
                                <Tip>Every template script is written like a Unity tutorial and explained with comments. The fastest way to learn is to open a template and start changing values.</Tip>
                            </Section>

                            <Section id="editor" title="2. The editor">
                                <Table head={["Panel", "What is it for?"]} rows={[
                                    ["Hierarchy", "The tree of objects in the scene. Drag and drop to re-parent and reorder, right-click menu (create, duplicate, make prefab, delete), search, and the eye icon to toggle active state."],
                                    ["Scene view", "The WebGL viewport. Click to select, then edit with the move/rotate/scale gizmos. In 3D, left-drag orbits, right-drag pans and the wheel zooms. You can drag prefabs and images in here."],
                                    ["Game view", "The scene as seen from the main camera. The game runs here while playing."],
                                    ["Inspector", "Edits the components of the selected object. Public fields of your scripts show up here automatically."],
                                    ["Project (Assets)", "Scenes, scripts, prefabs and textures. Upload images, create new C#/C++ scripts and new scenes."],
                                    ["Console", "Debug.Log output, warnings, runtime errors and compile errors. Clicking the source opens the matching line."],
                                ]} />
                                <Table head={["Shortcut", "Action"]} rows={[
                                    ["W / E / R", "Move / Rotate / Scale gizmo"],
                                    ["F", "Focus the selected object"],
                                    ["Ctrl+Z · Ctrl+Y", "Undo · Redo"],
                                    ["Ctrl+D", "Duplicate"],
                                    ["Ctrl+C · Ctrl+V", "Copy · Paste"],
                                    ["Delete", "Delete"],
                                    ["F2", "Rename"],
                                    ["Ctrl+S", "Save (with a cover image)"],
                                    ["Ctrl+P", "Play / Stop"],
                                ]} />
                                <p>Drag the label of a number field (X, Y, Z) sideways to scrub its value; hold Shift for 10× and Alt for 0.1× speed. Fields also accept expressions such as <K>2*3</K>.</p>
                            </Section>

                            <Section id="bilesenler" title="3. Objects and components">
                                <p>Every object (GameObject) is made of a <b>Transform</b> plus the components attached to it. The coordinate system matches Unity: X is right, Y is up, Z is forward, and angles are in degrees.</p>
                                <Table head={["Component", "Description"]} rows={[
                                    ["Transform", "Position, rotation and scale. Parent-child relationships come from the hierarchy."],
                                    ["Sprite Renderer", "A 2D shape (square, circle, triangle, rounded square, diamond, hexagon, star) or an uploaded image; color, opacity, sorting order and flipping."],
                                    ["Mesh Renderer", "A 3D primitive (cube, sphere, plane, capsule, cylinder, cone, torus) with a PBR material: color, metallic, roughness, emission, texture and tiling."],
                                    ["Camera", "Perspective or orthographic. The active camera marked Main Camera shows the game."],
                                    ["Light", "Directional, point or spot light; color, intensity, range and shadows."],
                                    ["Rigidbody / Rigidbody 2D", "Dynamic, kinematic or static body; mass, gravity, drag and axis constraints."],
                                    ["Collider", "Box, sphere (3D) or circle (2D) collider; trigger (Is Trigger), friction and bounciness."],
                                    ["Script", "A C# or C++ MonoBehaviour class. Public fields are edited in the Inspector."],
                                    ["Particle System", "GPU-drawn particles: rate, bursts, lifetime, speed, cone angle, size and color over lifetime, gravity."],
                                    ["Audio Source", "Procedural sound effects: coin, jump, hit, explosion, laser, powerup, click, blip, lose, win, step, shoot."],
                                    ["UI Text", "Text pinned to the screen (score, lives). 9 anchor points, offset, font size and shadow."],
                                ]} />
                            </Section>

                            <Section id="csharp" title="4. Scripting in C#">
                                <p>Scripts derive from <K>MonoBehaviour</K>, just like in Unity. The first MonoBehaviour class in a file is used as the component. Public fields (and private fields marked <K>[SerializeField]</K>) appear in the Inspector.</p>
                                <Code>{`using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
    [Header("Movement")]
    public float speed = 6f;
    [Range(1, 20)] public float jumpForce = 8f;
    public GameObject bulletPrefab;   // assign a prefab in the Inspector

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
                                <p>Supported language features: classes, inheritance, interfaces, enums, structs, properties (get/set), static members, lambdas, <K>List&lt;T&gt;</K>, <K>Dictionary&lt;K,V&gt;</K>, <K>foreach</K>, <K>switch</K>, <K>try/catch</K>, string interpolation (<K>{`$"Score: {score}"`}</K>), <K>ref/out</K>, default parameters, coroutines (<K>IEnumerator</K> + <K>yield return</K>) and basic LINQ-style methods.</p>
                            </Section>

                            <Section id="cpp" title="5. Scripting in C++">
                                <p>C++ scripts use the same engine API. Members are reached with <K>-&gt;</K> or <K>.</K>, static APIs with <K>::</K>. Object references can be written as pointers (<K>GameObject*</K>), and <K>nullptr</K> is supported.</p>
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
                                <p>You can use <K>std::vector</K>, <K>std::map</K>, <K>std::string</K>, <K>std::cout</K>, <K>printf</K>, <K>cmath</K> functions and free functions. C++ and C# scripts work together in the same project and can use each other&apos;s classes.</p>
                            </Section>

                            <Section id="yasam-dongusu" title="6. Lifecycle">
                                <Table head={["Method", "When is it called?"]} rows={[
                                    [<K key="a">Awake()</K>, "Once when the object is created (if active), after every object's script instances are ready."],
                                    [<K key="b">OnEnable()</K>, "Every time the component or object is enabled."],
                                    [<K key="c">Start()</K>, "Once, right before the first Update. Runs as a coroutine if it returns IEnumerator."],
                                    [<K key="d">FixedUpdate()</K>, "On every fixed physics step (60 Hz by default), before the physics simulation."],
                                    [<K key="e">Update()</K>, "Every frame. Use it for reading input and game logic."],
                                    [<K key="f">LateUpdate()</K>, "After all Updates. Ideal for camera follow."],
                                    [<K key="g">OnDisable() / OnDestroy()</K>, "When the component is disabled / the object is destroyed."],
                                    [<K key="h">OnApplicationQuit()</K>, "When the game is stopped."],
                                ]} />
                                <p>Collision and mouse events: <K>OnCollisionEnter/Stay/Exit</K>, <K>OnTriggerEnter/Stay/Exit</K> (add <K>2D</K> at the end for 2D), <K>OnMouseDown/Up/Enter/Exit/Over/Drag</K>.</p>
                            </Section>

                            <Section id="girdi" title="7. Input">
                                <Code>{`if (Input.GetKey(KeyCode.W)) { /* held down */ }
if (Input.GetKeyDown(KeyCode.Space)) { /* pressed this frame */ }
float h = Input.GetAxis("Horizontal");     // A/D or ←/→ (smoothed)
float v = Input.GetAxisRaw("Vertical");    // W/S or ↑/↓ (-1, 0, 1)
if (Input.GetButtonDown("Jump")) { }       // Space
if (Input.GetMouseButton(0)) { }           // left click / touch
Vector3 mouse = Input.mousePosition;       // pixels, bottom-left is (0,0)
Vector3 world = Camera.main.ScreenToWorldPoint(mouse);`}</Code>
                                <p>On mobile devices, when enabled in the project settings, on-screen arrow keys and A (Space) / B (LeftControl) buttons are shown; they are read just like regular keys.</p>
                            </Section>

                            <Section id="fizik" title="8. Physics and collisions">
                                <p>Physics is an impulse-based engine running on a fixed time step: gravity, friction, bounciness, kinematic bodies, triggers, ground detection and raycasts are supported. For trigger events, at least one of the colliding objects needs a Rigidbody (just like in Unity).</p>
                                <Code>{`void OnCollisionEnter2D(Collision2D collision)
{
    // The normal points from the other object towards this one.
    if (collision.GetContact(0).normal.y > 0.5f) Debug.Log("Landed");
}

void OnTriggerEnter(Collider other)
{
    if (other.CompareTag("Coin")) Destroy(other.gameObject);
}

void FixedUpdate()
{
    RaycastHit hit;
    if (Physics.Raycast(transform.position, Vector3.down, out hit, 1.2f))
        Debug.Log("Below me: " + hit.collider.name);

    rb.AddForce(Vector3.forward * 10f);                 // continuous force
    rb.AddForce(Vector3.up * 5f, ForceMode.Impulse);    // instant impulse
}`}</Code>
                                <p>In 2D, <K>Physics2D.Raycast</K> returns a <K>RaycastHit2D</K> that you check with <K>if (hit)</K>. <K>Physics.OverlapSphere</K>, <K>Physics2D.OverlapCircle</K>, <K>Linecast</K> and <K>CheckSphere</K> are available too.</p>
                            </Section>

                            <Section id="prefab" title="9. Prefabs, Instantiate and Destroy">
                                <p>Right-click an object in the Hierarchy and choose <b>Create prefab</b>. Pick the prefab in the Inspector for a <K>public GameObject prefab;</K> field of your script, then spawn it at runtime:</p>
                                <Code>{`GameObject enemy = Instantiate(enemyPrefab, new Vector3(0, 5, 0), Quaternion.identity);
enemy.GetComponent<Enemy>().speed = 4f;
Destroy(enemy, 3f);                  // destroy after 3 seconds
Destroy(gameObject);                 // destroy this object
GameObject p = Resources.Load<GameObject>("Bullet"); // load a prefab by name`}</Code>
                            </Section>

                            <Section id="coroutine" title="10. Coroutines and Invoke">
                                <Code>{`void Start()
{
    StartCoroutine(SpawnWaves());
    InvokeRepeating("Tick", 1f, 0.5f);   // after 1 s, then every 0.5 s
    Invoke("Explode", 3f);
}

IEnumerator SpawnWaves()
{
    for (int wave = 1; wave <= 5; wave++)
    {
        Debug.Log("Wave " + wave);
        yield return new WaitForSeconds(2f);
    }
    yield return new WaitUntil(() => enemiesLeft == 0);
    HUD.Show("All waves cleared!", 2f);
}`}</Code>
                                <p><K>yield return null</K> (one frame), <K>WaitForSeconds</K>, <K>WaitForSecondsRealtime</K>, <K>WaitForFixedUpdate</K>, <K>WaitForEndOfFrame</K>, <K>WaitUntil</K>, <K>WaitWhile</K> and nested coroutines are supported. <K>StopCoroutine</K>, <K>StopAllCoroutines</K>, <K>CancelInvoke</K> and <K>IsInvoking</K> are available as well.</p>
                            </Section>

                            <Section id="sahneler" title="11. Scenes">
                                <p>Add new scenes from the Project panel; the <b>Start scene</b> is the one the game opens with. To switch scenes:</p>
                                <Code>{`SceneManager.LoadScene("Level2");          // by name
SceneManager.LoadScene(1);                 // by index
SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex); // restart
DontDestroyOnLoad(gameObject);             // keep across scenes`}</Code>
                                <p>Static fields survive scene changes (same as Unity).</p>
                            </Section>

                            <Section id="ui-ses" title="12. UI, HUD and sound">
                                <Code>{`public Text scoreText;       // pick a UI Text object in the Inspector
scoreText.text = "Score: " + score;

HUD.Show("Level complete!", 2f, Color.yellow);   // message in the middle of the screen
Audio.Play("coin");                               // built-in sound effect
GetComponent<AudioSource>().Play();`}</Code>
                            </Section>

                            <Section id="kayit" title="13. Saving (PlayerPrefs)">
                                <Code>{`int best = PlayerPrefs.GetInt("best", 0);
if (score > best) PlayerPrefs.SetInt("best", score);
PlayerPrefs.SetString("name", "Han");
PlayerPrefs.DeleteKey("name");`}</Code>
                                <p>Values are stored in the player&apos;s browser, separately for each project (up to 64 KB).</p>
                            </Section>

                            <Section id="yayinlama" title="14. Publishing and exporting">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li><b>Publish on the Arcade:</b> for cloud projects. The game is compiled and goes through a security scan, and a public link is created. Players can play, like and remix it. You can unpublish it any time.</li>
                                    <li><b>Playable HTML:</b> packs the game and the engine into a single .html file that opens without an internet connection; host it anywhere you like.</li>
                                    <li><b>Project file (.json):</b> for backups and for moving a project to another account or browser.</li>
                                </ul>
                            </Section>

                            <Section id="api" title="15. API reference">
                                <p>The members below are auto-completed in the code editor.</p>
                                <ApiReference />
                            </Section>

                            <Section id="farklar" title="16. Differences from Unity">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li>Sound effects are generated procedurally instead of loaded from files (<K>Audio.Play(&quot;coin&quot;)</K>).</li>
                                    <li>Capsule/mesh colliders are approximated as boxes, and angular physics is simplified (spheres roll visually).</li>
                                    <li>Layer masks (LayerMask) and <K>IgnoreCollision</K> are ignored; use tags and triggers instead.</li>
                                    <li>The UI consists of UI Text and HUD messages; there is no Canvas/Button system (use <K>OnMouseDown</K> for clickable objects).</li>
                                    <li>Scripts run in a safe interpreter instead of a real .NET/C++ compiler; they cannot reach the network, files or browser APIs.</li>
                                </ul>
                            </Section>

                            <Section id="guvenlik" title="17. Security and limits">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li>The script interpreter cannot reach the DOM, the network, cookies or files, and every call has an instruction budget. Infinite loops don&apos;t freeze the game: the script is disabled and the problem is logged to the console.</li>
                                    <li>Project content can be up to 900 KB (including textures), 160 KB per script, 64 scripts, 24 scenes and 1000 objects per scene. Uploaded images are downscaled automatically.</li>
                                    <li>Games published on the Arcade are public. Don&apos;t share personal data, passwords or secret keys; content that breaks the rules is removed.</li>
                                </ul>
                            </Section>
        </>
    );
}

export default function EngineDocs() {
    const { language, dir } = useI18n();
    // Same rule as the engine UI: Turkish (and Azerbaijani) readers get the Turkish guide, everyone else English.
    const tr = engineLocale(language) === "tr";
    return (
        <div className="min-h-dvh bg-white dark:bg-zinc-950" dir={dir === "rtl" ? "ltr" : undefined} lang={tr ? "tr" : "en"}>
            <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-zinc-950/80">
                <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
                    <Link href="/game-engine" className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5" aria-label={tr ? "Motora dön" : "Back to the engine"}><ArrowLeft className="h-4 w-4" /></Link>
                    <div className="flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><BookOpen className="h-4 w-4" /></div>
                        <span className="font-black text-zinc-900 dark:text-white">{tr ? "Hanogt Engine Belgeleri" : "Hanogt Engine Docs"}</span>
                    </div>
                    <div className="flex-1" />
                    <Link href="/arcade" className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5 sm:inline-flex"><Rocket className="h-4 w-4" />Arcade</Link>
                    <Link href="/game-engine" className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-semibold text-white dark:bg-white dark:text-zinc-900"><Gamepad2 className="h-4 w-4" />{tr ? "Motoru aç" : "Open the engine"}</Link>
                </div>
            </header>
            <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[240px_1fr]">
                <nav className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] overflow-y-auto py-8 lg:block" aria-label={tr ? "İçindekiler" : "Contents"}>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400">{tr ? "İçindekiler" : "Contents"}</p>
                    <ol className="space-y-0.5">
                        {SECTIONS.map((section, index) => (
                            <li key={section.id}><a href={`#${section.id}`} className="block rounded-lg px-3 py-1.5 text-[13.5px] text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"><span className="me-2 text-zinc-400">{index + 1}.</span>{tr ? section.tr : section.en}</a></li>
                        ))}
                    </ol>
                </nav>
                <main id="main-content" className="min-w-0 pb-24">
                    <div className="border-b border-zinc-200/70 py-12 dark:border-white/[0.06]">
                        <p className="text-[13px] font-semibold text-indigo-600 dark:text-indigo-400">{tr ? "Kılavuz · v2" : "Guide · v2"}</p>
                        <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-5xl">{tr ? "Tarayıcıda gerçek bir oyun motoru" : "A real game engine in your browser"}</h1>
                        <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {tr
                                ? "Hanogt Engine; Unity'ye benzeyen editörü, GameObject/Component mimarisi, C# ve C++ script desteği, fizik motoru, WebGL render'ı ve Arcade yayınlamasıyla tarayıcıda çalışan bir 2D/3D oyun motorudur. Kurulum gerekmez; projeleriniz buluta veya tarayıcınıza kaydedilir."
                                : "Hanogt Engine is a 2D/3D game engine that runs in your browser, with a Unity-like editor, a GameObject/Component architecture, C# and C++ scripting, a physics engine, WebGL rendering and Arcade publishing. Nothing to install; your projects are saved to the cloud or to your browser."}
                        </p>
                    </div>
                    {tr ? <DocsTR /> : <DocsEN />}
                </main>
            </div>
        </div>
    );
}
