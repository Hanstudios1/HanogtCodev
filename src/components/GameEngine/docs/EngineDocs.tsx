"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, Copy, Gamepad2, ListTree, Rocket, Search } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { API_MEMBERS, TYPE_MEMBERS } from "@/components/GameEngine/editor/completions";
import { engineLocale } from "@/components/GameEngine/editor/text";
import { V3_FEATURES, V4_FEATURES, type WhatsNewItem } from "@/components/GameEngine/whats-new";
import { FIRST_GAME } from "./first-game";
import { ENGINE_VERSION } from "@/lib/game-engine/types";
import { useI18n } from "@/lib/i18n";

/** Section anchors stay the same in every language so shared links keep working. */
const SECTIONS: Array<{ id: string; tr: string; en: string }> = [
    { id: "yenilikler", tr: "V4'te yenilikler", en: "What's new in V4" },
    { id: "baslarken", tr: "Başlarken", en: "Getting started" },
    { id: "ilk-oyun", tr: "İlk oyunun: adım adım", en: "Your first game, step by step" },
    { id: "editor", tr: "Editör", en: "The editor" },
    { id: "bilesenler", tr: "Nesneler ve bileşenler", en: "Objects and components" },
    { id: "csharp", tr: "C# ile script", en: "Scripting in C#" },
    { id: "cpp", tr: "C++ ile script", en: "Scripting in C++" },
    { id: "yasam-dongusu", tr: "Yaşam döngüsü", en: "Lifecycle" },
    { id: "girdi", tr: "Girdi, giriş eylemleri ve gamepad", en: "Input, input actions and gamepads" },
    { id: "fizik", tr: "Fizik ve çarpışmalar", en: "Physics and collisions" },
    { id: "karakter", tr: "Character Controller 2D", en: "Character Controller 2D" },
    { id: "kamera", tr: "Kamera takibi ve sarsıntı", en: "Camera follow and shake" },
    { id: "eklemler", tr: "Eklemler: Distance ve Spring", en: "Joints: Distance and Spring" },
    { id: "tilemap", tr: "Tilemap ve karo boyama", en: "Tilemaps and tile painting" },
    { id: "yol-bulma", tr: "Yol bulma ve Nav Agent 2D", en: "Path finding and Nav Agent 2D" },
    { id: "prefab", tr: "Prefab, Instantiate, Destroy", en: "Prefabs, Instantiate, Destroy" },
    { id: "coroutine", tr: "Coroutine ve Invoke", en: "Coroutines and Invoke" },
    { id: "animasyon", tr: "Animasyon, Tween ve Timer", en: "Animation, Tween and Timer" },
    { id: "sahneler", tr: "Sahneler", en: "Scenes" },
    { id: "ui-ses", tr: "UI, HUD ve ses", en: "UI, HUD and sound" },
    { id: "ui-kontroller", tr: "Kaydırıcı, anahtar ve metin kutusu", en: "Sliders, toggles and input fields" },
    { id: "ses-dosyalari", tr: "Ses dosyaları ve müzik", en: "Audio files and music" },
    { id: "ortam", tr: "Ortam ve ekran efektleri", en: "Environment and screen effects" },
    { id: "kayit", tr: "Kayıt (PlayerPrefs)", en: "Saving (PlayerPrefs)" },
    { id: "yayinlama", tr: "Yayınlama ve dışa aktarma", en: "Publishing and exporting" },
    { id: "api", tr: "API referansı", en: "API reference" },
    { id: "farklar", tr: "Unity'den farklar", en: "Differences from Unity" },
    { id: "guvenlik", tr: "Güvenlik ve sınırlar", en: "Security and limits" },
    { id: "sorunlar", tr: "Sık karşılaşılan sorunlar", en: "Troubleshooting" },
];

/** Whether the guide is shown in Turkish (code blocks label their buttons with it). */
const TurkishDocs = createContext(true);

/** Lower case without accents, with Turkish dotless i folded, for searching. */
function fold(text: string) {
    return text.toLocaleLowerCase("tr").normalize("NFD").replace(/\p{M}+/gu, "").replace(/ı/g, "i");
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    // Numbers follow the table of contents, so adding a section never leaves stale numbering.
    const number = SECTIONS.findIndex((section) => section.id === id) + 1;
    return (
        <section id={id} className="scroll-mt-24 border-b border-zinc-200/70 py-10 dark:border-white/[0.06]">
            <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">{number ? `${number}. ` : ""}{title}</h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">{children}</div>
        </section>
    );
}

function Code({ children, language = "C#" }: { children: string; language?: string }) {
    const tr = useContext(TurkishDocs);
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(children.trim());
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard access can be refused; the code can still be selected by hand.
        }
    };
    return (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 dark:border-white/10" dir="ltr">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-400">
                <span>{language}</span>
                <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-live="polite">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? (tr ? "Kopyalandı" : "Copied") : (tr ? "Kopyala" : "Copy")}
                </button>
            </div>
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

function WhatsNewList({ tr, items = V4_FEATURES }: { tr: boolean; items?: WhatsNewItem[] }) {
    return (
        <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((feature) => {
                const Icon = feature.icon;
                return (
                    <li key={feature.section + feature.title.EN} className="flex gap-3 rounded-xl border border-zinc-200 p-4 dark:border-white/10">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0">
                            <span className="block font-bold text-zinc-900 dark:text-white">{tr ? feature.title.TR : feature.title.EN}</span>
                            <span className="mt-1 block text-[14px] text-zinc-600 dark:text-zinc-400">{tr ? feature.text.TR : feature.text.EN}</span>
                            <a href={`#${feature.section}`} className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{tr ? "Ayrıntılar" : "Details"}<ArrowRight className="h-3.5 w-3.5" /></a>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
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
                            <Section id="yenilikler" title="V4'te yenilikler">
                                <p>Hanogt Engine V4; gamepad destekli giriş eylemleri, hazır karakter denetleyicisi, kamera takibi, A* yol bulma, eklemler, yeni arayüz kontrolleri, ses dosyaları ve müzik, çoklu seçim ve İzle paneliyle geliyor. Önceki sürümlerle kaydedilen projeler açıldığında V4 biçimine taşınır ve verileriniz korunur; davranışı değişen yerlerde (ör. bilinmeyen ses adları için uyarı, <K>AddComponent&lt;Slider&gt;()</K>) eski oyunlar V3 kurallarıyla çalışmaya devam eder.</p>
                                <WhatsNewList tr />
                                <h3 className="pt-4 text-[13px] font-black uppercase tracking-wider text-zinc-500">V3 ile gelenler</h3>
                                <WhatsNewList tr items={V3_FEATURES} />
                            </Section>

                            <Section id="baslarken" title="Başlarken">
                                <ol className="list-decimal space-y-2 ps-5">
                                    <li><Link href="/game-engine" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">Oyun Motoru</Link> sayfasını açın ve bir şablon seçin: V4 ile gelen Gök Kulesi, Labirent Avı ve Sapan Ustası; Neon Koşu, Kanat Çırp, Pong, Yılan (C++), Küçük Macera, Engel Parkuru, Kale Savunması ve Neon Arena (C++); V3 ile gelen Tilemap Macerası, Tıklama Fabrikası ve Sisli Koşu; ya da 2D Platform, 3D Top Yuvarlama, Uzay Nişancısı, Tuğla Kırma veya boş proje.</li>
                                    <li>Giriş yaptıysanız proje hesabınıza (bulut) kaydedilir; misafir olarak oluşturulan projeler bu tarayıcıda (IndexedDB) saklanır.</li>
                                    <li>Üstteki <b>▶ Oynat</b> düğmesi (Ctrl+P) oyunu editörün içinde çalıştırır. Durdurduğunuzda sahne oynatmadan önceki haline döner.</li>
                                    <li>Scriptlere çift tıklayarak kod editörünü açın; değişiklikler otomatik derlenir, hatalar satır satır gösterilir.</li>
                                    <li>Hazır olduğunuzda <b>Yayınla</b> ile Arcade&apos;e gönderin veya <b>Dışa aktar → Oynanabilir HTML</b> ile tek dosyalık oyun indirin.</li>
                                </ol>
                                <Tip>Şablonlardaki her script, Unity derslerindeki gibi yazılmıştır ve yorum satırlarıyla açıklanmıştır. Öğrenmenin en hızlı yolu bir şablonu açıp değerleri değiştirmektir.</Tip>
                                <Tip>Takıldığınızda <Link href="/ai" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">Hanogt AI</Link>&apos;a sorun: Hanogt Engine için C# veya C++ script yazar, hata mesajlarını açıklar; Ajan modunda izninizle şablondan oyun projesi de oluşturur.</Tip>
                            </Section>

                            <Section id="ilk-oyun" title="İlk oyunun: adım adım">
                                <p>Bu bölümde yaklaşık 10 dakikada küçük bir platform oyunu yapacaksınız: ok tuşlarıyla yürüyen, Space ile zıplayan ve coin toplayan bir karakter. Adımlar motorun gerçek menülerini kullanır.</p>
                                <ol className="list-decimal space-y-3 ps-5">
                                    <li><b>Projeyi oluşturun.</b> <Link href="/game-engine" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">Oyun Motoru</Link> sayfasında <b>Boş 2D Proje</b> şablonunu seçip <b>Projeyi oluştur</b>&apos;a basın. Sahnede yalnızca Main Camera vardır.</li>
                                    <li><b>Oyuncuyu ekleyin.</b> Hiyerarşide <b>Oluştur → Sprite (Kare)</b>. Inspector&apos;da adını <K>{FIRST_GAME.scriptName.tr}</K>, konumunu <K>({FIRST_GAME.player.x}, {FIRST_GAME.player.y})</K> yapın ve <b>Bileşen ekle → Physics → Rigidbody 2D</b> ekleyin. Kare, <b>Box Collider 2D</b> ile birlikte gelir.</li>
                                    <li><b>Zemini ekleyin.</b> Yine <b>Oluştur → Sprite (Kare)</b>: adı <K>Zemin</K>, konumu <K>({FIRST_GAME.ground.x}, {FIRST_GAME.ground.y})</K>, ölçeğin X değeri <K>{FIRST_GAME.ground.scaleX}</K>. Zemine Rigidbody eklemeyin; Rigidbody&apos;si olmayan çarpıştırıcılar yerinde durur.</li>
                                    <li><b>Script&apos;i yazın.</b> Oyuncu seçiliyken <b>Bileşen ekle → Yeni script…</b>, ad olarak <K>{FIRST_GAME.scriptName.tr}</K> yazıp <b>C#</b>&apos;ı seçin. Açılan kod editöründeki her şeyi aşağıdaki kodla değiştirin; script otomatik derlenir.</li>
                                    <li><b>Coinleri dağıtın.</b> <b>Oluştur → Sprite (Daire)</b>: adı <K>Coin</K>, <b>Etiket</b> alanına <K>Coin</K> yazın ve <b>Circle Collider 2D</b>&apos;de <b>Is Trigger</b>&apos;ı açın. Konumu <K>({FIRST_GAME.coins[0].x}, {FIRST_GAME.coins[0].y})</K> olsun; Ctrl+D ile iki kopya alıp <K>({FIRST_GAME.coins[1].x}, {FIRST_GAME.coins[1].y})</K> ve <K>({FIRST_GAME.coins[2].x}, {FIRST_GAME.coins[2].y})</K> konumlarına taşıyın.</li>
                                    <li><b>Oynayın.</b> <b>▶ Oynat</b>&apos;a (Ctrl+P) basın: ← → ile yürüyün, Space ile zıplayın. Havadaki coin için zıplarken sağa gidin.</li>
                                </ol>
                                <Code>{FIRST_GAME.script.tr}</Code>
                                <Table head={["Parça", "Ne yapar?"]} rows={[
                                    [<K key="a">GetComponent&lt;Rigidbody2D&gt;()</K>, "Fizik gövdesini bir kez bulur; hız her karede bu gövdeye yazılır."],
                                    [<K key="b">Input.GetAxisRaw(&quot;Horizontal&quot;)</K>, "← → ya da A/D basılıyken -1, 0 veya 1 verir."],
                                    [<K key="c">OnCollisionStay2D</K>, "Zemine değdiği sürece çağrılır; çarpışmanın normali yukarı bakıyorsa oyuncu yerdedir ve zıplayabilir."],
                                    [<K key="d">OnTriggerEnter2D</K>, "Is Trigger açık bir çarpıştırıcıya girince çağrılır; Coin etiketli nesne yok edilir, skor artar."],
                                    [<K key="e">SceneManager.ReloadScene()</K>, "Oyuncu dünyadan düşerse sahneyi baştan başlatır."],
                                ]} />
                                <Tip>Şimdi kendi fikirlerinizi ekleyin: skoru ekranda göstermek için <b>Oluştur → UI → Text</b> ekleyin, script&apos;in başına <K>using UnityEngine.UI;</K> ve sınıfa <K>public Text skorYazisi;</K> yazıp alanı Inspector&apos;dan atayın; coin alınca <K>skorYazisi.text = &quot;Skor: &quot; + skor;</K>. Düşmanlar için <a href="#fizik" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Fizik</a>, seviyeler için <a href="#tilemap" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Tilemap</a> bölümüne bakın; hazır olunca Ctrl+S ile kaydedip <a href="#yayinlama" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Arcade&apos;de yayınlayın</a>.</Tip>
                            </Section>

                            <Section id="editor" title="Editör">
                                <Table head={["Panel", "Ne işe yarar?"]} rows={[
                                    ["Hiyerarşi", "Sahnedeki nesnelerin ağacı. Sürükle-bırak ile ebeveyn değiştirme ve sıralama, sağ tık menüsü (oluştur, çoğalt, prefab yap, sil), arama ve göz simgesiyle aktiflik."],
                                    ["Sahne görünümü", "WebGL görünüm. Tıklayarak seçin; taşıma/döndürme/ölçekleme gizmolarıyla düzenleyin. 3D'de sol sürükle döndürür, sağ sürükle kaydırır, tekerlek yakınlaştırır. Prefab ve görselleri buraya sürükleyebilirsiniz."],
                                    ["Oyun görünümü", "Sahnenin ana kameradan görünüşü. Oynatma sırasında oyun burada çalışır."],
                                    ["Inspector", "Seçili nesnenin bileşenlerini düzenler. Script'lerdeki public alanlar burada otomatik görünür."],
                                    ["Proje (Assets)", "Sahneler, scriptler, prefab'lar ve dokular. Görsel yükleme, yeni C#/C++ script, yeni sahne."],
                                    ["Konsol", "Debug.Log çıktıları, uyarılar, çalışma zamanı hataları ve derleme hataları. Kaynağa tıklayınca ilgili satır açılır."],
                                    ["İzle", "Oyun çalışırken değerleri canlı gösterir: Player.score, Player.transform.position, Enemy.Rigidbody2D.velocity, GameManager.highScore, Time.time… Sayılar için küçük bir geçmiş çizgisi çizer. Inspector'daki script alanlarının yanındaki göz düğmesiyle de eklenir."],
                                ]} />
                                <Table head={["Kısayol", "Eylem"]} rows={[
                                    ["W / E / R", "Taşı / Döndür / Ölçekle gizmosu"],
                                    ["F", "Seçili nesneye odaklan"],
                                    ["Ctrl+Z · Ctrl+Y", "Geri al · Yinele"],
                                    ["Ctrl+D", "Çoğalt"],
                                    ["Ctrl+A", "Sahnedeki tüm nesneleri seç"],
                                    ["Ctrl / Shift + tık", "Seçime ekle · aralığı seç (hiyerarşide)"],
                                    ["Shift + sürükle", "Sahne görünümünde kutu ile seç (Ctrl ile seçime ekle)"],
                                    ["Ctrl+C · Ctrl+V", "Kopyala · Yapıştır"],
                                    ["Delete", "Sil"],
                                    ["F2", "Yeniden adlandır"],
                                    ["Ctrl+S", "Kaydet (kapak görseliyle)"],
                                    ["Ctrl+P", "Oynat / Durdur"],
                                    ["Esc", "Karo boyamayı bitir · seçimi kaldır"],
                                ]} />
                                <p>Birden çok nesne seçiliyken gizmo seçimin ortasına yerleşir ve hepsini birlikte taşır, döndürür ve ölçekler. Inspector ortak bileşenleri gösterir: nesnelerde farklı olan değerler &quot;—&quot; ya da <b>Farklı</b> olarak görünür; değiştirdiğiniz alan hepsine uygulanır, öteki alanlar korunur. Hiyerarşi aramasında <K>t:Camera</K>, <K>t:Rigidbody2D</K> ya da bir script sınıfının adı bileşene göre, <K>tag:Enemy</K> etikete göre süzer; <b>Sonuçların hepsini seç</b> bulunanları seçer.</p>
                                <p>Sayı alanlarının etiketini (X, Y, Z) yatay sürükleyerek değeri kaydırabilirsiniz; Shift ile 10 kat, Alt ile 0,1 kat hızlı. Alanlara <K>2*3</K> gibi ifadeler yazılabilir.</p>
                                <p>Üst araç çubuğundaki <b>mıknatıs</b> düğmesi gizmolarla düzenlerken ızgaraya yakalamayı açar; yanındaki ok menüsünden taşıma, döndürme ve ölçek adımları ayarlanır (varsayılan 0,5 birim, 15°, 0,1). Sahne görünümündeki ✨ düğmesi sis ve parlama gibi ekran efektlerini düzenlerken de gösterir. Oynatırken <b>İstatistikler</b> düğmesi oyun görünümünün köşesinde FPS, kare süresi, nesne, script, fizik gövdesi, tween/zamanlayıcı, parçacık, çizim çağrısı ve üçgen sayılarını gösterir.</p>
                            </Section>

                            <Section id="bilesenler" title="Nesneler ve bileşenler">
                                <p>Her nesne (GameObject) bir <b>Transform</b> ve ona eklenen bileşenlerden oluşur. Koordinat sistemi Unity ile aynıdır: X sağ, Y yukarı, Z ileri; açılar derece cinsindendir.</p>
                                <Table head={["Bileşen", "Açıklama"]} rows={[
                                    ["Transform", "Konum, dönüş ve ölçek. Ebeveyn-çocuk ilişkisi hiyerarşiden gelir."],
                                    ["Sprite Renderer", "2D şekil (kare, daire, üçgen, yuvarlatılmış kare, elmas, altıgen, yıldız) veya yüklenen görsel; renk, saydamlık, sıralama, çevirme. Görsel bir sprite sheet ise sütun × satır sayısı ve gösterilecek kare seçilir."],
                                    ["Mesh Renderer", "3D ilkel (küp, küre, düzlem, kapsül, silindir, koni, torus) ve PBR materyal: renk, metalik, pürüzlülük, ışıma, doku ve döşeme."],
                                    ["Camera", "Perspektif veya ortografik. Main Camera işaretli ve aktif olan kamera oyunu gösterir."],
                                    ["Light", "Yönlü, nokta veya spot ışık; renk, yoğunluk, menzil ve gölgeler."],
                                    ["Rigidbody / Rigidbody 2D", "Dinamik, kinematik veya statik gövde; kütle, yerçekimi, sürtünme, eksen kilitleme."],
                                    ["Collider", "Kutu, küre (3D) veya daire (2D) çarpıştırıcı; tetikleyici (Is Trigger), sürtünme ve sekme."],
                                    ["Script", "C# veya C++ MonoBehaviour sınıfı. Public alanlar Inspector'da düzenlenir."],
                                    ["Particle System", "GPU'da çizilen parçacıklar: oran, patlama, ömür, hız, koni açısı, boyut ve renk geçişi, yerçekimi."],
                                    ["Audio Source", "Hazır ses efektleri (coin, jump, hit, explosion, laser, powerup, click, blip, lose, win, step, shoot) ya da yüklenen WAV/MP3/OGG dosyaları; ses, perde ve döngü."],
                                    ["UI Text", "Ekrana sabitlenen metin (skor, can). 9 çapa noktası, ofset, yazı boyutu, gölge ve çizim sırası."],
                                    ["UI Button", "Tıklanabilir buton: yazı, renkler, köşe yuvarlaklığı, Tıklanınca (On Click) metodu ve kısayol tuşu."],
                                    ["UI Panel / Image", "Renkli veya görselli dikdörtgen; arka plan, menü kutusu ya da tam ekran karartma. Altındaki tıklamaları engelleyebilir."],
                                    ["UI Progress Bar", "Can, yükleme veya ilerleme çubuğu: değer, en küçük/en büyük, yön, renkler ve yüzde etiketi."],
                                    ["Tilemap", "Karo ızgarası: palet, karo başına çarpışma, tetikleyici modu ve doku atlası. Sahnede fırçayla boyanır."],
                                    ["Animation", "Anahtar kare klipleri: konum, dönüş, ölçek, renk, saydamlık ve sprite karesi; yumuşatma eğrileri ve tekrar modları."],
                                    ["Character Controller 2D", "Hazır platform karakteri: koşma, çift zıplama, coyote süresi, zıplama tamponu, eğimler ve hareketli platformlar."],
                                    ["Camera Follow", "Kamerayı bir hedefin peşinden yumuşakça götürür; ölü bölge, ileri bakış ve sınırlar."],
                                    ["Nav Agent 2D", "Duvarların etrafından A* yoluyla bir hedefe ya da noktaya yürür."],
                                    ["Distance / Spring Joint", "İki nesneyi sabit mesafede ya da yayla bağlar."],
                                    ["UI Slider · UI Toggle · UI Input Field", "Sürüklenen kaydırıcı, açma-kapama anahtarı ve gerçek metin kutusu."],
                                ]} />
                            </Section>

                            <Section id="csharp" title="C# ile script yazma">
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

                            <Section id="cpp" title="C++ ile script yazma">
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
                                <p>Lambda&apos;lar <K>Timer</K>, <K>Tween</K> ve buton dinleyicilerine verilebilir. Yakalama listesi (<K>[this]</K>, <K>[&amp;]</K>) yazılabilir ama gerekmez; lambda tanımlandığı yerdeki değişkenleri görür.</p>
                                <Code language="C++">{`Timer::Every(1.0f, [this]() { gold += workers; });
Tween::Value(0.0f, 1.0f, 0.5f, [&](float v) { bar->value = v; });
button->onClick.AddListener([this]() { Debug::Log("Tıklandı"); });`}</Code>
                            </Section>

                            <Section id="yasam-dongusu" title="Yaşam döngüsü">
                                <Table head={["Metot", "Ne zaman çağrılır?"]} rows={[
                                    [<K key="a">Awake()</K>, "Nesne oluşturulduğunda (aktifse) bir kez, tüm nesnelerin script örnekleri hazırken."],
                                    [<K key="b">OnEnable()</K>, "Bileşen veya nesne her etkinleştirildiğinde."],
                                    [<K key="c">Start()</K>, "İlk Update'ten hemen önce bir kez. IEnumerator dönerse coroutine olarak çalışır."],
                                    [<K key="d">FixedUpdate()</K>, "Sabit fizik adımında (varsayılan 60 Hz), fizik hesaplamasından önce."],
                                    [<K key="e">Update()</K>, "Her karede. Girdi okuma ve oyun mantığı için."],
                                    [<K key="f">LateUpdate()</K>, "Tüm Update'lerden sonra. Kamera takibi için idealdir."],
                                    [<K key="g">OnDisable() / OnDestroy()</K>, "Bileşen devre dışı kalınca / nesne yok edilince."],
                                    [<K key="h">OnApplicationQuit()</K>, "Oyun durdurulurken."],
                                    [<K key="i">OnAnimationComplete(string clip)</K>, "Nesnedeki Animation bileşeninde \"Bir kez\" oynayan bir klip bittiğinde."],
                                ]} />
                                <p>Çarpışma ve fare olayları: <K>OnCollisionEnter/Stay/Exit</K>, <K>OnTriggerEnter/Stay/Exit</K> (2D için sonuna <K>2D</K> ekleyin), <K>OnMouseDown/Up/Enter/Exit/Over/Drag</K>.</p>
                            </Section>

                            <Section id="girdi" title="Girdi, giriş eylemleri ve gamepad">
                                <Code>{`if (Input.GetKey(KeyCode.W)) { /* basılı tutuluyor */ }
if (Input.GetKeyDown(KeyCode.Space)) { /* bu karede basıldı */ }
float h = Input.GetAxis("Horizontal");     // A/D veya ←/→ (yumuşatılmış)
float v = Input.GetAxisRaw("Vertical");    // W/S veya ↑/↓ (-1, 0, 1)
if (Input.GetButtonDown("Jump")) { }       // Space
if (Input.GetMouseButton(0)) { }           // sol tık / dokunma
Vector3 mouse = Input.mousePosition;       // piksel, sol-alt köşe (0,0)
Vector3 world = Camera.main.ScreenToWorldPoint(mouse);`}</Code>
                                <p>V4 ile girdiler <b>giriş eylemleriyle</b> tanımlanır (Unity&apos;nin Input Manager&apos;ı gibi). <b>Ayarlar → Girdi</b> sekmesinde her eylemin klavye tuşlarını, fare düğmelerini ve gamepad düğmelerini ya da çubuğunu seçebilir, kendi eylemlerinizi ekleyebilirsiniz. Script eylemi adıyla okur: oyuncu klavye de kullansa gamepad de, kod aynı kalır.</p>
                                <Table head={["Eylem", "Varsayılan bağlar"]} rows={[
                                    ["Horizontal · Vertical", "A/D ve W/S, ok tuşları, d-pad, sol çubuk"],
                                    ["Jump", "Space, gamepad A"],
                                    ["Fire1 · Fire2 · Fire3", "Sol Ctrl / sol tık / RT, X · Sol Alt / sağ tık / LT · Sol Shift / orta tık / Y"],
                                    ["Submit · Cancel", "Enter, Space / A, Start · Esc / B, Back"],
                                    ["LookX · LookY", "Sağ çubuk"],
                                ]} />
                                <Code>{`float move = Input.GetAxis("Horizontal");   // klavyede yumuşak, çubukta anında
if (Input.GetButtonDown("Jump")) Jump();     // Space ya da gamepad A
if (Input.GetButton("Fire1")) Shoot();
if (Input.GetButtonDown("Dash")) Dash();     // Ayarlar → Girdi'de eklediğiniz eylem
string[] pads = Input.GetJoystickNames();    // bağlı gamepad'ler`}</Code>
                                <p>Gamepad&apos;ler tarayıcının Gamepad API&apos;siyle okunur (Xbox ve PlayStation düzeni); tarayıcı bir gamepad&apos;i ancak bir düğmesine basılınca bildirir. Çubukların <b>ölü bölgesi</b> Girdi sekmesinden ayarlanır. Mobilde, proje ayarlarında açıksa ekranda yön tuşları ve A/B düğmeleri gösterilir; bunlar gamepad&apos;in d-pad&apos;i ve A/X düğmeleri gibi davranır, eylemleri değiştirseniz de çalışmaya devam eder.</p>
                            </Section>

                            <Section id="fizik" title="Fizik ve çarpışmalar">
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
                                <p><K>collision.contacts</K> (veya <K>GetContacts</K>, <K>contactCount</K>) çarpışmanın tüm temas noktalarını verir; her noktanın <K>point</K>, <K>normal</K> ve <K>separation</K> değerleri vardır. Bir nesne aynı anda birkaç karoya değdiğinde tek bir çarpışma olayı ve karo başına bir temas noktası gelir.</p>
                                <Code>{`void OnCollisionStay2D(Collision2D collision)
{
    foreach (ContactPoint2D contact in collision.contacts)
    {
        if (contact.normal.y > 0.5f) grounded = true;   // ayağımızın altında
    }
}`}</Code>
                            </Section>

                            <Section id="karakter" title="Character Controller 2D">
                                <p>Platform oyunları için hazır karakter denetleyicisi. Nesnede <b>Dynamic bir Rigidbody 2D</b> ve bir <b>Collider 2D</b> olmalıdır (eksikse Inspector tek tıkla ekler). Koşma ve zıplama giriş eylemlerinden (<K>Horizontal</K>, <K>Jump</K>) okunur; klavye, dokunmatik düğmeler ve gamepad kendiliğinden çalışır.</p>
                                <Table head={["Ayar", "Ne yapar?"]} rows={[
                                    ["Move Speed · Acceleration · Deceleration", "En yüksek koşu hızı ve bu hıza ne kadar çabuk çıkılıp durulduğu."],
                                    ["Air Control", "Havadayken yön değiştirme gücü (0–1)."],
                                    ["Jump Height · Max Jumps", "Zıplama yüksekliği (birim) ve yere değmeden yapılabilecek zıplama sayısı (2: çift zıplama)."],
                                    ["Coyote Time", "Kenardan düştükten sonra zıplamanın hâlâ çalıştığı süre."],
                                    ["Jump Buffer", "Yere inmeden hemen önce basılan zıplamanın hatırlandığı süre."],
                                    ["Variable Jump · Fall Gravity", "Tuş erken bırakılınca kısa zıplama; düşerken artan yerçekimi."],
                                    ["Max Slope", "Hâlâ zemin sayılan en dik eğim. Hareketli platformlar karakteri kendiliğinden taşır."],
                                    ["Use Input", "Kapalıyken karakteri script Move, Jump ve CancelJump ile yönetir (yapay zekâ, ara sahne)."],
                                ]} />
                                <Code>{`CharacterController2D controller;

void Start() { controller = GetComponent<CharacterController2D>(); }

void Update()
{
    if (controller.isGrounded && controller.velocity.x != 0) Audio.Play("step", 0.2f);
}

// Denetleyici zıplayınca ve yere inince bu metotları çağırır.
void OnJump() { Audio.Play("jump"); }
void OnLand(float speed) { if (speed > 12f) Camera.Shake(0.2f, 0.2f); }`}</Code>
                                <Tip><b>Gök Kulesi</b> şablonu bu bileşenle yapılmış eksiksiz bir platform oyunudur: çift zıplama, hareketli platform, kontrol noktası ve ayarlar menüsü.</Tip>
                            </Section>

                            <Section id="kamera" title="Kamera takibi ve sarsıntı">
                                <p>Kameraya <b>Camera Follow</b> ekleyin ve <b>Target</b> alanında izlenecek nesneyi seçin (boşsa Player etiketli nesneyi izler). Kamera hedefe yumuşakça yetişir. <b>Dead Zone</b> hedefin kamerayı kımıldatmadan dolaşabildiği kutudur, <b>Look Ahead</b> hareket yönünde öne bakar, <b>Bounds</b> görüntüyü seviyenin içinde tutar. 3D&apos;de kamera hedefin arkasından ona bakar.</p>
                                <Code>{`CameraFollow follow = Camera.main.GetComponent<CameraFollow>();
follow.target = boss.transform;                 // hedefi değiştir
follow.SetBounds(new Vector2(-10, -5), new Vector2(60, 20));
follow.SnapToTarget();                          // yumuşatmadan hemen yetiş

Camera.Shake(0.3f, 0.25f);                      // güç, süre (saniye)`}</Code>
                                <p>Sarsıntı yalnızca çizilen görüntüyü kaydırır; kameranın konumu, <K>ScreenToWorldPoint</K> ve fizik etkilenmez. Oyununuzda bir &quot;Ekran sarsıntısı&quot; ayarı sunmak iyi bir alışkanlıktır (Gök Kulesi şablonundaki gibi).</p>
                            </Section>

                            <Section id="eklemler" title="Eklemler: Distance ve Spring">
                                <p><b>Bileşen ekle → Physics</b> menüsündeki eklemler iki nesneyi ya da bir nesneyi dünyadaki bir noktaya bağlar. <b>Distance Joint</b> mesafeyi sabit tutar: sarkaç, zincir, köprü. <b>Max Distance Only</b> açıkken ip gibi yalnızca gerilir. <b>Spring Joint</b> yay gibi geri çeker: <b>Frequency</b> sertliği, <b>Damping Ratio</b> zıplamayı belirler.</p>
                                <Code>{`SpringJoint2D spring = GetComponent<SpringJoint2D>();
spring.frequency = 3f;           // daha sert
spring.dampingRatio = 0.5f;
spring.connectedBody = hook;     // başka bir Rigidbody2D'ye bağla
spring.enabled = false;          // bırak: sapan gibi fırlar

DistanceJoint2D rope = gameObject.AddComponent<DistanceJoint2D>();
rope.connectedAnchor = new Vector2(0, 5);    // dünyadaki bir nokta
rope.maxDistanceOnly = true;`}</Code>
                                <p>Eklemin bir şeyi hareket ettirebilmesi için iki uçtan en az birinde Dynamic bir Rigidbody olmalı. Oynarken eklemler sahnede çizgiyle gösterilir (<b>Show Line</b>). <b>Sapan Ustası</b> şablonu bir sapan ve sallanan bir yıkım topuyla iki eklemi de kullanır.</p>
                            </Section>

                            <Section id="tilemap" title="Tilemap ve karo boyama">
                                <p>Tilemap, seviyeyi kare hücrelerden oluşan bir ızgaraya boyamanızı sağlar. Hiyerarşide <b>Oluştur → Tilemap</b> ile ekleyin (3D projelerde <b>Oluştur → 2D → Tilemap</b>), Inspector&apos;daki <b>Sahnede boya</b> düğmesine basın ve paletten bir karo seçin.</p>
                                <Table head={["Araç", "Kullanım"]} rows={[
                                    ["Fırça", "Sol tık veya dokunarak boyayın; sürükleyince kesintisiz çizgi çizer."],
                                    ["Dikdörtgen", "Sürükleyerek bir alanı doldurun."],
                                    ["Silgi", "Karoları siler. Fırçadayken Shift + tık da siler."],
                                    ["Damlalık", "Tıkladığınız karoyu palette seçer."],
                                ]} />
                                <p>Her palet karosunun bir karakteri, adı, rengi ve <b>Çarpışır / tetikler</b> ayarı vardır. Çarpışan karolar fizikte statik kutular gibi davranır; komşu karoların arasındaki iç yüzeyler yok sayıldığı için karakterler birleşim yerlerine takılmaz. Tilemap&apos;te <b>Is Trigger</b> açıksa bu karolar tetikleyici olur (diken, su, bitiş alanı). <b>Doku atlası</b> seçilirse karolar atlasın karelerinden çizilir; atlas karesi -1 olan karo düz renkte kalır.</p>
                                <Code>{`public Tilemap ground;     // Inspector'da Tilemap nesnesini seçin

void Start()
{
    ground.SetTile(4, 0, "Tuğla");                 // karo adı veya karakteri
    ground.SetTile(5, 0, null);                    // sil
    ground.FillRect(0, -2, 10, -1, "Toprak");      // dikdörtgen doldur
    string name = ground.GetTile(4, 0);            // "Tuğla" ya da null
    Vector3 cell = ground.WorldToCell(transform.position);
    Vector3 center = ground.GetCellCenterWorld((int)cell.x, (int)cell.y);
    Debug.Log(ground.CountTiles("Tuğla") + " tuğla");
}`}</Code>
                                <p>Hücre koordinatları Unity&apos;deki gibidir: X sağa, Y yukarı doğru artar. Bir tilemap en fazla 512 × 256 hücre ve 48 palet karosu içerebilir. Tilemap&apos;ler 2D oyunlar için tasarlanmıştır; 3D&apos;de nesnenin XY düzleminde çizilir.</p>
                            </Section>

                            <Section id="yol-bulma" title="Yol bulma ve Nav Agent 2D">
                                <p>2D projelerde motor, statik çarpıştırıcılardan ve katı karolardan bir gezinme ızgarası kurar ve A* algoritmasıyla duvarların etrafından en kısa yolu bulur. Karolar ya da engeller oyun sırasında değişince ızgara kendiliğinden güncellenir.</p>
                                <p><b>Nav Agent 2D</b> eklenen nesne hedefine bu yolla yürür. <b>Target</b> alanında bir nesne seçerseniz onu sürekli kovalar (<b>Repath Interval</b> aralıklarla yeni yol hesaplanır); boşsa <K>SetDestination</K> ile verilen noktaya gider. Rigidbody&apos;si varsa hızla, yoksa doğrudan hareket eder. <b>Show Path</b> oynarken yolu çizer.</p>
                                <Code>{`NavAgent2D agent = GetComponent<NavAgent2D>();
agent.SetDestination(new Vector2(8, 3));
agent.target = player;                  // kovala
agent.speed = 4f;
agent.isStopped = true;                 // dur; Resume() ile devam

// Hedefe varınca çağrılır.
void OnDestinationReached() { agent.SetDestination(nextPoint); }

// Yalnızca yol: köşe noktalarının listesi (yol yoksa boş).
var path = Pathfinding.FindPath(transform.position, target.position);
for (int i = 1; i < path.Count; i++) Debug.DrawLine(path[i - 1], path[i], Color.yellow, 1f);
bool open = Pathfinding.IsWalkable(point);`}</Code>
                                <Tip><b>Labirent Avı</b> şablonunda üç hayalet aynı bileşeni farklı kullanır: biri oyuncuyu kovalar, biri önünü keser, biri köşeler arasında devriye gezer.</Tip>
                            </Section>

                            <Section id="prefab" title="Prefab, Instantiate ve Destroy">
                                <p>Hiyerarşide bir nesneye sağ tıklayıp <b>Prefab oluştur</b> deyin. Script&apos;te <K>public GameObject prefab;</K> alanına Inspector&apos;dan prefab&apos;ı seçin ve çalışma sırasında çoğaltın:</p>
                                <Code>{`GameObject enemy = Instantiate(enemyPrefab, new Vector3(0, 5, 0), Quaternion.identity);
enemy.GetComponent<Enemy>().speed = 4f;
Destroy(enemy, 3f);                  // 3 saniye sonra yok et
Destroy(gameObject);                 // bu nesneyi yok et
GameObject p = Resources.Load<GameObject>("Bullet"); // prefab'ı adıyla yükle`}</Code>
                                <p>Unity&apos;deki gibi, yok edilen bir nesne ya da betik <K>null</K> ile karşılaştırıldığında eşit sayılır: <K>if (hedef != null)</K> kontrolü, hedef <K>Destroy</K> ile silindiyse <K>false</K> döner. Başka bir betikten çağırdığınız metodun içinde başlattığınız <K>Timer</K> ve <K>Tween</K>&apos;ler o metodun betiğine aittir; çağıran nesne yok olsa da çalışmaya devam ederler.</p>
                            </Section>

                            <Section id="coroutine" title="Coroutine ve Invoke">
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

                            <Section id="animasyon" title="Animasyon, Tween ve Timer">
                                <p><b>Animation</b> bileşeni anahtar karelerden oluşan klipler oynatır. Inspector&apos;da hazır bir klip (süzülme, dönme, nabız, sarsıntı, solma, yanıp sönme, sprite kareleri) ekleyip düzenleyebilir ya da boş bir klibe kanal ekleyebilirsiniz. Konum ve dönüş anahtarları nesnenin o anki pozuna eklenir, ölçek anahtarları onu çarpar; renk, saydamlık ve sprite karesi doğrudan uygulanır. Her anahtar karenin kendi yumuşatma eğrisi vardır; klipler bir kez, döngüde veya git-gel oynar.</p>
                                <Code>{`Animation anim = GetComponent<Animation>();
anim.Play("Zıpla");                  // klibi baştan oynat
anim.Stop();                         // durdur ve pozu geri al
if (!anim.IsPlaying("Koş")) anim.CrossFade("Koş");
anim.speed = 2f;

// "Bir kez" oynayan klip bitince çağrılır.
void OnAnimationComplete(string clip)
{
    if (clip == "Ölüm") gameObject.SetActive(false);
}`}</Code>
                                <p><b>Tween</b> kodla yumuşak hareket içindir. Her çağrı, ayarları zincirlenebilen bir tween döndürür:</p>
                                <Code>{`Tween.Move(transform, new Vector3(0, 3, 0), 0.5f).SetEase(Ease.OutBack);
Tween.Scale(transform, 1.2f, 0.3f).SetLoops(-1, LoopType.Yoyo);   // sonsuz git-gel
Tween.Fade(gameObject, 0f, 1f).OnComplete(() => Destroy(gameObject));
Tween.Color(sprite, Color.red, 0.2f);
Tween.Value(0f, 100f, 2f, v => scoreText.text = Mathf.RoundToInt(v).ToString());
Tween.PunchScale(button, 0.15f, 0.3f);                           // buton tepkisi
Tween.Shake(Camera.main.transform, 0.3f, 0.4f);                  // kamera sarsıntısı
yield return Tween.Rotate(transform, new Vector3(0, 0, 180), 1f).WaitForCompletion();`}</Code>
                                <p>Yumuşatma eğrileri: <K>Linear</K>, <K>InQuad</K>, <K>OutQuad</K>, <K>InOutQuad</K>, <K>InCubic</K>, <K>OutCubic</K>, <K>InOutCubic</K>, <K>InSine</K>, <K>OutSine</K>, <K>InOutSine</K>, <K>InBack</K>, <K>OutBack</K>, <K>InOutBack</K>, <K>InElastic</K>, <K>OutElastic</K>, <K>InBounce</K>, <K>OutBounce</K> ve <K>Step</K>. <K>Tween.Kill(nesne)</K> bir nesnenin tween&apos;lerini durdurur, <K>Tween.IsTweening(nesne)</K> sorgular. <b>Timer</b> ise gecikmeli veya tekrarlı işler içindir:</p>
                                <Code>{`Timer.After(2f, () => HUD.Show("Hazır!", 1f));
var income = Timer.Every(1f, () => gold += workers);   // her saniye
income.Cancel();
Timer.CancelAll();                                     // bu script'in tüm zamanlayıcıları`}</Code>
                                <p>Tween&apos;ler ve zamanlayıcılar oyun zamanıyla ilerler; <K>Time.timeScale = 0</K> iken dururlar. Script&apos;in nesnesi yok edilince zamanlayıcıları da iptal edilir.</p>
                            </Section>

                            <Section id="sahneler" title="Sahneler">
                                <p>Proje panelinden yeni sahne ekleyin; <b>Başlangıç sahnesi</b> oyunun açıldığı sahnedir. Sahne değiştirmek için:</p>
                                <Code>{`SceneManager.LoadScene("Level2");          // adıyla
SceneManager.LoadScene(1);                 // sırasıyla
SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex); // yeniden başlat
SceneManager.ReloadScene();                // aynısı, daha kısa
SceneManager.FadeToScene("Level2", 0.5f);  // ekranı karartarak geç
SceneManager.FadeToScene(0, 0.8f, Color.white);
DontDestroyOnLoad(gameObject);             // sahneler arası koru`}</Code>
                                <p>Statik alanlar sahne değişince korunur (Unity ile aynı). <K>FadeToScene</K> geçişi oyun duraklatılmış olsa bile (<K>Time.timeScale = 0</K>) çalışır.</p>
                            </Section>

                            <Section id="ui-ses" title="UI, HUD ve ses">
                                <p>Arayüz öğeleri ekrana sabitlenir ve pencere boyutuyla ölçeklenir (540 piksel yükseklik için tasarlanır). Hepsinde 9 noktalı <b>çapa</b>, ofset, boyut ve <b>çizim sırası</b> vardır; sırası büyük olan üstte çizilir ve tıklamayı önce alır. Hiyerarşide <b>Oluştur → UI</b> menüsünden eklenirler.</p>
                                <Table head={["Bileşen", "Script türü"]} rows={[
                                    ["UI Text", <K key="t">Text</K>],
                                    ["UI Button", <K key="b">Button</K>],
                                    ["UI Panel / Image", <K key="p">Image</K>],
                                    ["UI Progress Bar", <K key="s">ProgressBar · Slider</K>],
                                    ["UI Slider · UI Toggle · UI Input Field", <K key="v">Slider · Toggle · InputField</K>],
                                ]} />
                                <p>Butona tıklanınca Inspector&apos;daki <b>Tıklanınca</b> alanında seçilen hedef nesnenin script&apos;lerinde, yazılan adlı metot çalışır (Unity&apos;deki On Click listesi gibi). Kodla dinleyici de eklenebilir. Butona bir <b>kısayol tuşu</b> atanırsa tuşa basmak tıklamakla aynı işi yapar.</p>
                                <Code>{`public Text scoreText;       // Inspector'da bir UI Text nesnesi seçin
public Button buyButton;
public Slider healthBar;

void Start()
{
    buyButton.onClick.AddListener(Buy);
    buyButton.onClick.AddListener(() => Audio.Play("click"));
    healthBar.maxValue = 100;
    healthBar.value = 75;               // en küçük/en büyük arasında tutulur
}

void Update()
{
    scoreText.text = "Skor: " + score;
    buyButton.interactable = coins >= 10;
    buyButton.text = "Satın al (" + coins + ")";
    if (UI.IsPointerOverUI()) return;   // fare bir arayüz öğesinin üstünde
}`}</Code>
                                <p>Tam ekran bir panel, altındaki butonlara ve nesnelere tıklamayı engeller (<b>Tıklamaları engeller</b>); duraklatma menüleri için idealdir. Menünün butonlarını panelin çocuğu yaparsanız <K>pauseMenu.SetActive(false)</K> hepsini birlikte gizler. Arayüz nesnelerinde Transform ölçeği ve dönüşü de uygulanır; bu sayede <K>Tween.Scale</K>, <K>Tween.PunchScale</K> ve <K>Tween.Fade</K> arayüzde de çalışır.</p>
                                <Code>{`HUD.Show("Seviye tamamlandı!", 2f, Color.yellow);   // ekranın ortasında mesaj
Audio.Play("coin");                                  // hazır ses efekti
GetComponent<AudioSource>().Play();`}</Code>
                            </Section>

                            <Section id="ui-kontroller" title="Kaydırıcı, anahtar ve metin kutusu">
                                <p><b>Oluştur → UI</b> menüsünde üç kontrol daha var. Oyuncu fareyle ya da parmakla kullanır; değer değişince Inspector&apos;daki olay alanında seçilen metot çalışır (Unity&apos;deki On Value Changed gibi). Kodla dinleyici de eklenebilir.</p>
                                <Table head={["Bileşen", "Script türü ve olaylar"]} rows={[
                                    ["UI Slider", <span key="s"><K>Slider</K> · value, minValue, maxValue, wholeNumbers · onValueChanged(float)</span>],
                                    ["UI Toggle", <span key="t"><K>Toggle</K> · isOn · onValueChanged(bool); anahtar ya da onay kutusu görünümü</span>],
                                    ["UI Input Field", <span key="i"><K>InputField</K> · text, characterLimit, contentType · onValueChanged, onEndEdit, onSubmit (string)</span>],
                                ]} />
                                <Code>{`public Slider volume;
public Toggle shake;
public InputField playerName;

void Start()
{
    volume.onValueChanged.AddListener(v => Audio.SetMusicVolume(v));
    shake.SetIsOnWithoutNotify(PlayerPrefs.GetBool("shake", true));   // olay tetiklemeden
    playerName.onEndEdit.AddListener(name => PlayerPrefs.SetString("name", name));
    playerName.ActivateInputField();      // yazmaya başlat (telefonda klavye açılır)
}`}</Code>
                                <p>Metin kutusu gerçek bir yazı alanıdır: telefonda ekran klavyesi açılır, yazarken oyunun tuşları çalışmaz, Enter yazmayı bitirir. <b>Content Type</b> yalnızca rakam, harf ve rakam ya da e-posta gibi sınırlar koyar (<K>IntegerNumber</K>, <K>Alphanumeric</K>, <K>EmailAddress</K>…). Eski projelerdeki Progress Bar da script&apos;te <K>Slider</K> olarak bulunur; V4 kurallarıyla <K>AddComponent&lt;Slider&gt;()</K> gerçek bir kaydırıcı ekler.</p>
                            </Section>

                            <Section id="ses-dosyalari" title="Ses dosyaları ve müzik">
                                <p>Proje panelindeki <b>Sesler</b> grubuna WAV, MP3 ya da OGG dosyası yükleyin (dosya başına en fazla 300 KB, projede en fazla 40 dosya). Giriş yaptıysanız dosyalar hesabınızın <b>ses kitaplığına</b> kaydedilir ve planınızın ses depolama alanına sayılır (Ücretsiz 5 MB, Plus 25 MB, Pro 100 MB; aynı dosya birden çok projede bir kez sayılır). Misafir projelerinin sesleri bu tarayıcıda saklanır.</p>
                                <Code>{`Audio.Play("Patlama");                  // yüklenen dosya, adıyla
Audio.Play("coin");                     // hazır ses efekti
Audio.PlayMusic("Tema", 0.7f, 1f);      // döngüyle çalan müzik: ses, geçiş süresi
Audio.StopMusic(0.5f);
Audio.musicVolume = 0.5f;               // müzik ve efektlerin sesi ayrı ayrı
Audio.sfxVolume = 0.8f;

public AudioClip hit;                   // Inspector'da bir ses seçin
void OnCollisionEnter2D(Collision2D c) { Audio.Play(hit); }

AudioSource source = GetComponent<AudioSource>();
source.clip = "Rüzgâr";                 // yüklenen dosyanın adı
source.loop = true;
source.Play();`}</Code>
                                <p><b>Audio Source</b> bileşeninin <b>Clip</b> listesinde hazır sesler ve yüklenen dosyalar birlikte görünür; yüklenen bir dosya için <b>Loop</b> açılabilir. Hazır bir sesle aynı adı taşıyan dosya o sesin yerine çalar (ör. <K>coin</K> adıyla yüklenen bir dosya). Arcade&apos;de yayınlanan oyunların sesleri yayınla birlikte saklanır; <b>Oynanabilir HTML</b> sesleri dosyanın içine koyar ve internetsiz de çalar.</p>
                                <Tip>Yalnızca kullanma hakkınız olan sesleri yükleyin: kendi kayıtlarınız ya da lisansı buna izin veren müzik ve efektler. Kitaplığınızı Sesler grubundaki kitaplık düğmesinden yönetebilir, kullanmadığınız dosyaları silip yer açabilirsiniz.</Tip>
                            </Section>

                            <Section id="ortam" title="Ortam ve ekran efektleri">
                                <p><b>Ayarlar → Sahne ayarları</b> penceresinde her sahnenin arka planı (düz renk veya gökyüzü geçişi), ortam ışığı, sisi ve ekran efektleri ayarlanır.</p>
                                <Table head={["Ayar", "Etkisi"]} rows={[
                                    ["Sis: doğrusal", "Başlangıç ve bitiş mesafeleri arasında giderek koyulaşır."],
                                    ["Sis: üstel", "Yoğunluğa bağlı olarak mesafeyle hızla artar; sonsuz koşu gibi açık alanlarda doğal görünür."],
                                    ["Parlama (bloom)", "Eşiği aşan parlak pikseller (ör. ışıma değeri yüksek materyaller) çevresine ışık saçar. Güç, eşik ve yarıçap ayarlanır."],
                                    ["Vinyet", "Ekran kenarlarını karartarak gözü ortaya çeker."],
                                    ["Pozlama", "Tüm görüntünün parlaklığı."],
                                ]} />
                                <Tip>Sis rengini gökyüzü geçişinin alt rengiyle aynı yapın; uzaktaki nesneler ufka karışır. Sahne görünümündeki ✨ düğmesi efektleri düzenlerken de gösterir.</Tip>
                            </Section>

                            <Section id="kayit" title="Kayıt (PlayerPrefs)">
                                <Code>{`int best = PlayerPrefs.GetInt("best", 0);
if (score > best) PlayerPrefs.SetInt("best", score);
PlayerPrefs.SetString("name", "Han");
PlayerPrefs.SetBool("muted", true);
bool muted = PlayerPrefs.GetBool("muted", false);
PlayerPrefs.DeleteKey("name");`}</Code>
                                <p>Değerler oyunu oynayan kişinin tarayıcısında, her proje için ayrı saklanır (en fazla 64 KB).</p>
                            </Section>

                            <Section id="yayinlama" title="Yayınlama ve dışa aktarma">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li><b>Arcade&apos;de yayınla:</b> Bulut projeleri için. Oyun derlenir ve güvenlik taramasından geçer; herkese açık bağlantı oluşur. Oyuncular oynayabilir ve beğenebilir; <b>Remikslemelere izin ver</b>&apos;i açarsanız kopyasını alıp kendi sürümlerini de yapabilirler (remiksin sayfasında oyununuza bağlantı görünür). Oyun kartında oyunun yapıldığı motor sürümü (ör. V4) görünür; oyunun ses dosyaları yayınla birlikte saklanır. İstediğiniz zaman yayından kaldırabilirsiniz.</li>
                                    <li><b>Oynanabilir HTML:</b> Oyunu, motoru ve ses dosyalarını tek bir .html dosyasına paketler; internet olmadan açılır, istediğiniz yerde barındırabilirsiniz.</li>
                                    <li><b>Proje dosyası (.json):</b> Yedekleme ve başka hesaba/tarayıcıya taşıma için.</li>
                                </ul>
                            </Section>

                            <Section id="api" title="API referansı">
                                <p>Aşağıdaki üyeler kod editöründe otomatik tamamlanır.</p>
                                <ApiReference />
                            </Section>

                            <Section id="farklar" title="Unity'den farklar">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li>Hazır ses efektleri prosedüreldir (<K>Audio.Play(&quot;coin&quot;)</K>); kendi seslerinizi WAV, MP3 ya da OGG olarak yükleyebilirsiniz. <K>AudioClip</K> bir ses adı gibi çalışır ve konumsal (3D) ses yoktur.</li>
                                    <li>Kapsül/mesh çarpıştırıcılar kutu olarak yaklaştırılır; açısal fizik basitleştirilmiştir (küreler görsel olarak yuvarlanır).</li>
                                    <li>Katman maskeleri (LayerMask) ve <K>IgnoreCollision</K> yok sayılır; bunun yerine etiket ve tetikleyici kullanın.</li>
                                    <li>UI olarak Text, Button, Panel/Image, Progress Bar, Slider, Toggle ve Input Field vardır; Canvas düzen bileşenleri (Layout Group, Scroll View, Dropdown) yoktur. Sahnedeki nesneleri tıklanabilir yapmak için <K>OnMouseDown</K> kullanın.</li>
                                    <li>NavMesh yerine 2D ızgarada A* kullanılır (Nav Agent 2D); 3D projelerde ajanlar hedefe düz çizgide yürür. Eklemlerden Distance ve Spring vardır; Hinge, Slider ve Wheel eklemleri yoktur.</li>
                                    <li>Animation bileşeni, Animator durum makinesi yerine basit bir klip oynatıcısıdır; <K>SetTrigger(&quot;Zıpla&quot;)</K> aynı adlı klibi oynatır.</li>
                                    <li>Scriptler gerçek .NET/C++ derleyicisi yerine güvenli bir yorumlayıcıda çalışır; ağ, dosya ve tarayıcı API&apos;lerine erişemez.</li>
                                </ul>
                            </Section>

                            <Section id="guvenlik" title="Güvenlik ve sınırlar">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li>Script yorumlayıcısı DOM&apos;a, ağa, çerezlere veya dosyalara erişemez; her çağrının komut bütçesi vardır. Sonsuz döngüler oyunu dondurmaz, ilgili script devre dışı bırakılır ve konsola yazılır.</li>
                                    <li>Proje içeriği en fazla 900 KB (dokular dahil), script başına 160 KB, 64 script, 24 sahne ve sahne başına 1000 nesne olabilir; bir tilemap en fazla 512 × 256 hücre içerir. Yüklenen görseller otomatik küçültülür.</li>
                                    <li>Ses dosyaları dosya başına en fazla 300 KB ve projede en fazla 40 dosya olabilir; hesabınızdaki toplam ses depolama alanı planınıza göredir (Ücretsiz 5 MB / 30 dosya, Plus 25 MB / 150 dosya, Pro 100 MB / 600 dosya).</li>
                                    <li>Arcade&apos;e yayınlanan oyunlar herkese açıktır. Kişisel veri, parola veya gizli anahtar paylaşmayın; kurallara aykırı içerik kaldırılır.</li>
                                </ul>
                            </Section>

                            <Section id="sorunlar" title="Sık karşılaşılan sorunlar">
                                <Table head={["Belirti", "Çözüm"]} rows={[
                                    ["Oynat'a basınca “Oyunu başlatmadan önce derleme hatalarını düzeltin.” yazıyor.", "Konsol'da Hatalar'ı açın; bir hataya tıklayınca script ilgili satırda açılır. Çoğu zaman eksik noktalı virgül, kapanmamış süslü parantez ya da yanlış yazılmış bir addır."],
                                    ["Script, Bileşen ekle menüsünde gri görünüyor.", "Dosyada MonoBehaviour'dan türeyen bir sınıf yok. Sınıf tanımı public class Ad : MonoBehaviour biçiminde olmalı."],
                                    ["OnTriggerEnter hiç çağrılmıyor.", "Çarpıştırıcıda Is Trigger açık olmalı ve iki nesneden en az birinde Rigidbody bulunmalı. Script, tetikleyiciye giren nesnede ya da tetikleyicinin kendisinde olabilir."],
                                    ["Karakter zeminin içinden düşüyor.", "Zeminde etkin bir çarpıştırıcı (ör. Box Collider 2D) olmalı. Zemine dinamik Rigidbody eklemeyin; eklerseniz o da düşer."],
                                    ["Konsolda “NullReferenceException: … null veya yok edilmiş bir nesneye erişildi.”", "Inspector'daki bir public alan boş kalmış ya da nesne Destroy ile silinmiş. Alanı Inspector'dan atayın veya kullanmadan önce if (hedef != null) ile kontrol edin."],
                                    ["“Script komut bütçesini aştı (olası sonsuz döngü).”", "Bir while ya da for döngüsü bitmiyor. Oyun donmaz, yalnızca o script devre dışı kalır. Döngünün çıkış koşulunu düzeltin; beklemek için coroutine (yield return) kullanın."],
                                    ["Ses çalmıyor.", "Tarayıcılar sesi sayfadaki ilk tıklamadan sonra açar; oyuna bir kez tıklayın. Yüklenen bir dosyayı adıyla çağırıyorsanız adı Proje panelindekiyle aynı yazın; bulunamayan adlar için Konsol'da “Ses bulunamadı” uyarısı görünür."],
                                    ["Gamepad algılanmıyor.", "Gamepad'i bağlayıp bir düğmesine basın; tarayıcılar gamepad'i ancak bir düğmeye basılınca bildirir. Ayarlar → Girdi'de eylemin gamepad bağlarını kontrol edin."],
                                    ["Tuşlar oyunda çalışmıyor.", "Odak bir yazı alanında (ör. script editöründe) olabilir. Oyun görünümüne bir kez tıklayın."],
                                    ["Arcade'de yayınla düğmesi kullanılamıyor.", "Yayınlamak için giriş yapıp projeyi buluta kaydetmeniz gerekir; misafir projeleri yalnızca bu tarayıcıda durur."],
                                    ["“Proje başka bir sekmede/cihazda değişti” uyarısı.", "Sayfayı yenileyip güncel sürümü yükleyin. Bu sekmedeki değişiklikleri kaybetmemek için önce Dışa aktar → Proje dosyası (.json) ile yedek alın."],
                                ]} />
                                <Tip>Çözüm bulamadınız mı? Hata mesajını <Link href="/ai" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Hanogt AI</Link>&apos;a yapıştırın ya da <Link href="/feedback" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Geri Bildirim ve Destek</Link> sayfasından bize yazın.</Tip>
                            </Section>
        </>
    );
}

function DocsEN() {
    return (
        <>
                            <Section id="yenilikler" title="What's new in V4">
                                <p>Hanogt Engine V4 brings input actions with gamepad support, a ready-made character controller, camera follow, A* path finding, joints, new UI controls, audio files and music, multi-selection and the Watch panel. Projects saved with earlier versions are migrated to the V4 format when you open them and none of your data is lost; where behavior changed (for example the warning for unknown sound names, or <K>AddComponent&lt;Slider&gt;()</K>), older games keep running with the V3 rules.</p>
                                <WhatsNewList tr={false} />
                                <h3 className="pt-4 text-[13px] font-black uppercase tracking-wider text-zinc-500">Shipped with V3</h3>
                                <WhatsNewList tr={false} items={V3_FEATURES} />
                            </Section>

                            <Section id="baslarken" title="Getting started">
                                <ol className="list-decimal space-y-2 ps-5">
                                    <li>Open the <Link href="/game-engine" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">Game Engine</Link> page and pick a template: Sky Tower, Maze Hunt and Slingshot Master from V4; Neon Run, Flap, Pong, Snake (C++), Little Adventure, Obstacle Course, Castle Defense and Neon Arena (C++); Tilemap Adventure, Clicker Factory and Foggy Runner from V3; or 2D Platformer, 3D Roll-a-Ball, Space Shooter, Brick Breaker or an empty project.</li>
                                    <li>When you are signed in, the project is saved to your account (cloud); projects created as a guest are stored in this browser (IndexedDB).</li>
                                    <li>The <b>▶ Play</b> button at the top (Ctrl+P) runs the game inside the editor. When you stop, the scene returns to how it was before you pressed Play.</li>
                                    <li>Double-click a script to open the code editor; changes are compiled automatically and errors are shown line by line.</li>
                                    <li>When you are ready, send it to the Arcade with <b>Publish</b>, or download a single-file game with <b>Export → Playable HTML</b>.</li>
                                </ol>
                                <Tip>Every template script is written like a Unity tutorial and explained with comments. The fastest way to learn is to open a template and start changing values.</Tip>
                                <Tip>Stuck? Ask <Link href="/ai" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">Hanogt AI</Link>: it writes C# or C++ scripts for Hanogt Engine and explains error messages, and in Agent mode it can even create a game project from a template with your permission.</Tip>
                            </Section>

                            <Section id="ilk-oyun" title="Your first game, step by step">
                                <p>In about 10 minutes you will build a small platformer: a character that walks with the arrow keys, jumps with Space and collects coins. Every step uses the engine&apos;s real menus.</p>
                                <ol className="list-decimal space-y-3 ps-5">
                                    <li><b>Create the project.</b> On the <Link href="/game-engine" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">Game Engine</Link> page pick the <b>Empty 2D Project</b> template and press <b>Create project</b>. The scene only has a Main Camera.</li>
                                    <li><b>Add the player.</b> In the Hierarchy choose <b>Create → Sprite (Square)</b>. In the Inspector name it <K>{FIRST_GAME.scriptName.en}</K>, set its position to <K>({FIRST_GAME.player.x}, {FIRST_GAME.player.y})</K> and add <b>Add component → Physics → Rigidbody 2D</b>. The square comes with a <b>Box Collider 2D</b>.</li>
                                    <li><b>Add the ground.</b> <b>Create → Sprite (Square)</b> again: name it <K>Ground</K>, position <K>({FIRST_GAME.ground.x}, {FIRST_GAME.ground.y})</K>, scale X <K>{FIRST_GAME.ground.scaleX}</K>. Don&apos;t give the ground a Rigidbody; colliders without one stay where they are.</li>
                                    <li><b>Write the script.</b> With the player selected choose <b>Add component → New script…</b>, type <K>{FIRST_GAME.scriptName.en}</K> as the name and pick <b>C#</b>. Replace everything in the code editor that opens with the code below; the script compiles automatically.</li>
                                    <li><b>Place the coins.</b> <b>Create → Sprite (Circle)</b>: name it <K>Coin</K>, type <K>Coin</K> in the <b>Tag</b> field and turn on <b>Is Trigger</b> in its <b>Circle Collider 2D</b>. Put it at <K>({FIRST_GAME.coins[0].x}, {FIRST_GAME.coins[0].y})</K>, then press Ctrl+D twice and move the copies to <K>({FIRST_GAME.coins[1].x}, {FIRST_GAME.coins[1].y})</K> and <K>({FIRST_GAME.coins[2].x}, {FIRST_GAME.coins[2].y})</K>.</li>
                                    <li><b>Play.</b> Press <b>▶ Play</b> (Ctrl+P): walk with ← →, jump with Space. For the coin in the air, jump and move right.</li>
                                </ol>
                                <Code>{FIRST_GAME.script.en}</Code>
                                <Table head={["Part", "What it does"]} rows={[
                                    [<K key="a">GetComponent&lt;Rigidbody2D&gt;()</K>, "Finds the physics body once; the velocity is written to it every frame."],
                                    [<K key="b">Input.GetAxisRaw(&quot;Horizontal&quot;)</K>, "Gives -1, 0 or 1 while ← → or A/D are held."],
                                    [<K key="c">OnCollisionStay2D</K>, "Called while touching the ground; when the collision normal points up, the player is grounded and may jump."],
                                    [<K key="d">OnTriggerEnter2D</K>, "Called when entering a collider with Is Trigger on; the object tagged Coin is destroyed and the score goes up."],
                                    [<K key="e">SceneManager.ReloadScene()</K>, "Restarts the scene when the player falls off the world."],
                                ]} />
                                <Tip>Now add your own ideas: to show the score, add <b>Create → UI → Text</b>, put <K>using UnityEngine.UI;</K> at the top of the script and <K>public Text scoreText;</K> in the class, assign the field in the Inspector and write <K>scoreText.text = &quot;Score: &quot; + score;</K> when a coin is collected. See <a href="#fizik" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Physics</a> for enemies and <a href="#tilemap" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Tilemaps</a> for levels; when you are ready, save with Ctrl+S and <a href="#yayinlama" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">publish it on the Arcade</a>.</Tip>
                            </Section>

                            <Section id="editor" title="The editor">
                                <Table head={["Panel", "What is it for?"]} rows={[
                                    ["Hierarchy", "The tree of objects in the scene. Drag and drop to re-parent and reorder, right-click menu (create, duplicate, make prefab, delete), search, and the eye icon to toggle active state."],
                                    ["Scene view", "The WebGL viewport. Click to select, then edit with the move/rotate/scale gizmos. In 3D, left-drag orbits, right-drag pans and the wheel zooms. You can drag prefabs and images in here."],
                                    ["Game view", "The scene as seen from the main camera. The game runs here while playing."],
                                    ["Inspector", "Edits the components of the selected object. Public fields of your scripts show up here automatically."],
                                    ["Project (Assets)", "Scenes, scripts, prefabs and textures. Upload images, create new C#/C++ scripts and new scenes."],
                                    ["Console", "Debug.Log output, warnings, runtime errors and compile errors. Clicking the source opens the matching line."],
                                    ["Watch", "Shows values live while the game runs: Player.score, Player.transform.position, Enemy.Rigidbody2D.velocity, GameManager.highScore, Time.time… Numbers get a small history line. You can also add one with the eye button next to script fields in the Inspector."],
                                ]} />
                                <Table head={["Shortcut", "Action"]} rows={[
                                    ["W / E / R", "Move / Rotate / Scale gizmo"],
                                    ["F", "Focus the selected object"],
                                    ["Ctrl+Z · Ctrl+Y", "Undo · Redo"],
                                    ["Ctrl+D", "Duplicate"],
                                    ["Ctrl+A", "Select every object in the scene"],
                                    ["Ctrl / Shift + click", "Add to the selection · select a range (hierarchy)"],
                                    ["Shift + drag", "Box select in the Scene view (Ctrl adds to the selection)"],
                                    ["Ctrl+C · Ctrl+V", "Copy · Paste"],
                                    ["Delete", "Delete"],
                                    ["F2", "Rename"],
                                    ["Ctrl+S", "Save (with a cover image)"],
                                    ["Ctrl+P", "Play / Stop"],
                                    ["Esc", "Stop painting tiles · clear the selection"],
                                ]} />
                                <p>With several objects selected, the gizmo sits on their center and moves, rotates and scales them together. The Inspector shows the components they share: values that differ show as &quot;—&quot; or <b>Mixed</b>, and a field you change is applied to all of them while their other fields stay as they are. In the hierarchy search, <K>t:Camera</K>, <K>t:Rigidbody2D</K> or a script class name filters by component and <K>tag:Enemy</K> by tag; <b>Select all results</b> selects what was found.</p>
                                <p>Drag the label of a number field (X, Y, Z) sideways to scrub its value; hold Shift for 10× and Alt for 0.1× speed. Fields also accept expressions such as <K>2*3</K>.</p>
                                <p>The <b>magnet</b> button in the top toolbar turns on grid snapping for the gizmos; the arrow next to it sets the move, rotate and scale steps (0.5 units, 15° and 0.1 by default). The ✨ button in the Scene view shows screen effects such as fog and bloom while you edit. While playing, the <b>Stats</b> button shows FPS, frame time and the number of objects, scripts, physics bodies, tweens/timers, particles, draw calls and triangles in the corner of the Game view.</p>
                            </Section>

                            <Section id="bilesenler" title="Objects and components">
                                <p>Every object (GameObject) is made of a <b>Transform</b> plus the components attached to it. The coordinate system matches Unity: X is right, Y is up, Z is forward, and angles are in degrees.</p>
                                <Table head={["Component", "Description"]} rows={[
                                    ["Transform", "Position, rotation and scale. Parent-child relationships come from the hierarchy."],
                                    ["Sprite Renderer", "A 2D shape (square, circle, triangle, rounded square, diamond, hexagon, star) or an uploaded image; color, opacity, sorting order and flipping. When the image is a sprite sheet, set its columns × rows and pick the frame to show."],
                                    ["Mesh Renderer", "A 3D primitive (cube, sphere, plane, capsule, cylinder, cone, torus) with a PBR material: color, metallic, roughness, emission, texture and tiling."],
                                    ["Camera", "Perspective or orthographic. The active camera marked Main Camera shows the game."],
                                    ["Light", "Directional, point or spot light; color, intensity, range and shadows."],
                                    ["Rigidbody / Rigidbody 2D", "Dynamic, kinematic or static body; mass, gravity, drag and axis constraints."],
                                    ["Collider", "Box, sphere (3D) or circle (2D) collider; trigger (Is Trigger), friction and bounciness."],
                                    ["Script", "A C# or C++ MonoBehaviour class. Public fields are edited in the Inspector."],
                                    ["Particle System", "GPU-drawn particles: rate, bursts, lifetime, speed, cone angle, size and color over lifetime, gravity."],
                                    ["Audio Source", "Built-in sound effects (coin, jump, hit, explosion, laser, powerup, click, blip, lose, win, step, shoot) or uploaded WAV/MP3/OGG files; volume, pitch and looping."],
                                    ["UI Text", "Text pinned to the screen (score, lives). 9 anchor points, offset, font size, shadow and draw order."],
                                    ["UI Button", "A clickable button: label, colors, corner radius, an On Click method and a hotkey."],
                                    ["UI Panel / Image", "A colored or textured rectangle: backgrounds, menu boxes or a full-screen dim. It can block clicks to whatever is below."],
                                    ["UI Progress Bar", "Health, loading or progress bars: value, min/max, direction, colors and a percentage label."],
                                    ["Tilemap", "A grid of tiles: palette, per-tile collision, trigger mode and a texture atlas. Painted with a brush in the scene."],
                                    ["Animation", "Keyframe clips for position, rotation, scale, color, opacity and sprite frame, with easing curves and wrap modes."],
                                    ["Character Controller 2D", "A ready-made platformer character: running, double jump, coyote time, jump buffering, slopes and moving platforms."],
                                    ["Camera Follow", "Moves the camera after a target smoothly, with a dead zone, look-ahead and bounds."],
                                    ["Nav Agent 2D", "Walks to a target or a point along an A* path around walls."],
                                    ["Distance / Spring Joint", "Ties two objects at a fixed distance or with a spring."],
                                    ["UI Slider · UI Toggle · UI Input Field", "A draggable slider, an on/off switch and a real text box."],
                                ]} />
                            </Section>

                            <Section id="csharp" title="Scripting in C#">
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

                            <Section id="cpp" title="Scripting in C++">
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
                                <p>Lambdas can be passed to <K>Timer</K>, <K>Tween</K> and button listeners. A capture list (<K>[this]</K>, <K>[&amp;]</K>) is allowed but not needed: a lambda sees the variables of the place where it is defined.</p>
                                <Code language="C++">{`Timer::Every(1.0f, [this]() { gold += workers; });
Tween::Value(0.0f, 1.0f, 0.5f, [&](float v) { bar->value = v; });
button->onClick.AddListener([this]() { Debug::Log("Clicked"); });`}</Code>
                            </Section>

                            <Section id="yasam-dongusu" title="Lifecycle">
                                <Table head={["Method", "When is it called?"]} rows={[
                                    [<K key="a">Awake()</K>, "Once when the object is created (if active), after every object's script instances are ready."],
                                    [<K key="b">OnEnable()</K>, "Every time the component or object is enabled."],
                                    [<K key="c">Start()</K>, "Once, right before the first Update. Runs as a coroutine if it returns IEnumerator."],
                                    [<K key="d">FixedUpdate()</K>, "On every fixed physics step (60 Hz by default), before the physics simulation."],
                                    [<K key="e">Update()</K>, "Every frame. Use it for reading input and game logic."],
                                    [<K key="f">LateUpdate()</K>, "After all Updates. Ideal for camera follow."],
                                    [<K key="g">OnDisable() / OnDestroy()</K>, "When the component is disabled / the object is destroyed."],
                                    [<K key="h">OnApplicationQuit()</K>, "When the game is stopped."],
                                    [<K key="i">OnAnimationComplete(string clip)</K>, "When a clip that plays \"Once\" in the object's Animation component finishes."],
                                ]} />
                                <p>Collision and mouse events: <K>OnCollisionEnter/Stay/Exit</K>, <K>OnTriggerEnter/Stay/Exit</K> (add <K>2D</K> at the end for 2D), <K>OnMouseDown/Up/Enter/Exit/Over/Drag</K>.</p>
                            </Section>

                            <Section id="girdi" title="Input, input actions and gamepads">
                                <Code>{`if (Input.GetKey(KeyCode.W)) { /* held down */ }
if (Input.GetKeyDown(KeyCode.Space)) { /* pressed this frame */ }
float h = Input.GetAxis("Horizontal");     // A/D or ←/→ (smoothed)
float v = Input.GetAxisRaw("Vertical");    // W/S or ↑/↓ (-1, 0, 1)
if (Input.GetButtonDown("Jump")) { }       // Space
if (Input.GetMouseButton(0)) { }           // left click / touch
Vector3 mouse = Input.mousePosition;       // pixels, bottom-left is (0,0)
Vector3 world = Camera.main.ScreenToWorldPoint(mouse);`}</Code>
                                <p>In V4, input is defined with <b>input actions</b> (like Unity&apos;s Input Manager). In <b>Settings → Input</b> you choose the keys, mouse buttons and gamepad buttons or sticks of each action and add your own actions. Scripts read an action by its name, so the same code works whether the player uses a keyboard or a gamepad.</p>
                                <Table head={["Action", "Default bindings"]} rows={[
                                    ["Horizontal · Vertical", "A/D and W/S, arrow keys, d-pad, left stick"],
                                    ["Jump", "Space, gamepad A"],
                                    ["Fire1 · Fire2 · Fire3", "Left Ctrl / left click / RT, X · Left Alt / right click / LT · Left Shift / middle click / Y"],
                                    ["Submit · Cancel", "Enter, Space / A, Start · Esc / B, Back"],
                                    ["LookX · LookY", "Right stick"],
                                ]} />
                                <Code>{`float move = Input.GetAxis("Horizontal");   // smoothed on keys, immediate on sticks
if (Input.GetButtonDown("Jump")) Jump();     // Space or gamepad A
if (Input.GetButton("Fire1")) Shoot();
if (Input.GetButtonDown("Dash")) Dash();     // an action you added in Settings → Input
string[] pads = Input.GetJoystickNames();    // connected gamepads`}</Code>
                                <p>Gamepads are read with the browser&apos;s Gamepad API (Xbox and PlayStation layouts); browsers only report a gamepad once one of its buttons is pressed. The sticks&apos; <b>dead zone</b> is set in the Input tab. On phones, when enabled in the project settings, on-screen arrow keys and A/B buttons are shown; they act as the gamepad&apos;s d-pad and A/X buttons and keep working when you change the actions.</p>
                            </Section>

                            <Section id="fizik" title="Physics and collisions">
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
                                <p><K>collision.contacts</K> (or <K>GetContacts</K> and <K>contactCount</K>) lists every contact point of a collision, each with a <K>point</K>, a <K>normal</K> and a <K>separation</K>. When an object touches several tiles at once you get a single collision event with one contact point per tile.</p>
                                <Code>{`void OnCollisionStay2D(Collision2D collision)
{
    foreach (ContactPoint2D contact in collision.contacts)
    {
        if (contact.normal.y > 0.5f) grounded = true;   // under our feet
    }
}`}</Code>
                            </Section>

                            <Section id="karakter" title="Character Controller 2D">
                                <p>A ready-made character controller for platformers. The object needs a <b>Dynamic Rigidbody 2D</b> and a <b>Collider 2D</b> (the Inspector adds them with one click when they are missing). Running and jumping read the input actions (<K>Horizontal</K>, <K>Jump</K>), so the keyboard, the touch buttons and gamepads work out of the box.</p>
                                <Table head={["Setting", "What it does"]} rows={[
                                    ["Move Speed · Acceleration · Deceleration", "Top running speed and how quickly it is reached and lost."],
                                    ["Air Control", "How much the character can steer in the air (0–1)."],
                                    ["Jump Height · Max Jumps", "Jump height in units and how many jumps are allowed before landing (2: double jump)."],
                                    ["Coyote Time", "How long a jump still works after walking off a ledge."],
                                    ["Jump Buffer", "How long a jump pressed just before landing is remembered."],
                                    ["Variable Jump · Fall Gravity", "Letting go early makes a short hop; falling uses stronger gravity."],
                                    ["Max Slope", "The steepest slope that still counts as ground. Moving platforms carry the character."],
                                    ["Use Input", "When off, a script drives the character with Move, Jump and CancelJump (AI, cutscenes)."],
                                ]} />
                                <Code>{`CharacterController2D controller;

void Start() { controller = GetComponent<CharacterController2D>(); }

void Update()
{
    if (controller.isGrounded && controller.velocity.x != 0) Audio.Play("step", 0.2f);
}

// The controller calls these when it jumps and when it lands.
void OnJump() { Audio.Play("jump"); }
void OnLand(float speed) { if (speed > 12f) Camera.Shake(0.2f, 0.2f); }`}</Code>
                                <Tip>The <b>Sky Tower</b> template is a complete platformer built with this component: double jump, a moving platform, a checkpoint and a settings menu.</Tip>
                            </Section>

                            <Section id="kamera" title="Camera follow and shake">
                                <p>Add <b>Camera Follow</b> to the camera and pick what to follow in <b>Target</b> (when empty it follows the object tagged Player). The camera catches up smoothly. <b>Dead Zone</b> is the box the target can move in without moving the camera, <b>Look Ahead</b> leads in the direction of movement and <b>Bounds</b> keeps the view inside the level. In 3D the camera looks at the target from behind.</p>
                                <Code>{`CameraFollow follow = Camera.main.GetComponent<CameraFollow>();
follow.target = boss.transform;                 // follow something else
follow.SetBounds(new Vector2(-10, -5), new Vector2(60, 20));
follow.SnapToTarget();                          // catch up without smoothing

Camera.Shake(0.3f, 0.25f);                      // strength, seconds`}</Code>
                                <p>Shake only moves the rendered view; the camera&apos;s position, <K>ScreenToWorldPoint</K> and physics are not affected. Offering a &quot;Screen shake&quot; setting in your game is good practice (as the Sky Tower template does).</p>
                            </Section>

                            <Section id="eklemler" title="Joints: Distance and Spring">
                                <p>The joints in <b>Add component → Physics</b> tie two objects together, or an object to a point in the world. A <b>Distance Joint</b> keeps the distance fixed: pendulums, chains, bridges. With <b>Max Distance Only</b> it only goes taut, like a rope. A <b>Spring Joint</b> pulls back like a spring: <b>Frequency</b> sets the stiffness and <b>Damping Ratio</b> the bounce.</p>
                                <Code>{`SpringJoint2D spring = GetComponent<SpringJoint2D>();
spring.frequency = 3f;           // stiffer
spring.dampingRatio = 0.5f;
spring.connectedBody = hook;     // tie it to another Rigidbody2D
spring.enabled = false;          // let go: it flies like a slingshot

DistanceJoint2D rope = gameObject.AddComponent<DistanceJoint2D>();
rope.connectedAnchor = new Vector2(0, 5);    // a point in the world
rope.maxDistanceOnly = true;`}</Code>
                                <p>For a joint to move anything, at least one of its ends needs a Dynamic Rigidbody. While playing, joints are drawn as lines in the scene (<b>Show Line</b>). The <b>Slingshot Master</b> template uses both joints for a slingshot and a swinging wrecking ball.</p>
                            </Section>

                            <Section id="tilemap" title="Tilemaps and tile painting">
                                <p>A tilemap lets you paint a level onto a grid of square cells. Add one with <b>Create → Tilemap</b> in the Hierarchy (<b>Create → 2D → Tilemap</b> in 3D projects), press <b>Paint in scene</b> in the Inspector and pick a tile from the palette.</p>
                                <Table head={["Tool", "How to use it"]} rows={[
                                    ["Brush", "Left-click or touch to paint; dragging draws a continuous line."],
                                    ["Rectangle", "Drag to fill an area."],
                                    ["Eraser", "Removes tiles. Shift + click erases with the brush as well."],
                                    ["Picker", "Selects the clicked tile in the palette."],
                                ]} />
                                <p>Each palette tile has a key character, a name, a color and a <b>Collides / triggers</b> setting. Colliding tiles behave like static boxes in physics; the faces between neighbouring tiles are ignored, so characters never snag on the seams. When the tilemap is an <b>Is Trigger</b> tilemap, those tiles become triggers instead (spikes, water, finish zones). Pick a <b>Texture atlas</b> to draw tiles from the atlas cells; a tile with atlas cell -1 keeps its plain color.</p>
                                <Code>{`public Tilemap ground;     // pick the Tilemap object in the Inspector

void Start()
{
    ground.SetTile(4, 0, "Brick");                 // tile name or key
    ground.SetTile(5, 0, null);                    // erase
    ground.FillRect(0, -2, 10, -1, "Dirt");        // fill a rectangle
    string name = ground.GetTile(4, 0);            // "Brick" or null
    Vector3 cell = ground.WorldToCell(transform.position);
    Vector3 center = ground.GetCellCenterWorld((int)cell.x, (int)cell.y);
    Debug.Log(ground.CountTiles("Brick") + " bricks");
}`}</Code>
                                <p>Cell coordinates work like Unity&apos;s: X grows to the right and Y grows upwards. A tilemap can hold up to 512 × 256 cells and 48 palette tiles. Tilemaps are made for 2D games; in 3D they are drawn on the object&apos;s XY plane.</p>
                            </Section>

                            <Section id="yol-bulma" title="Path finding and Nav Agent 2D">
                                <p>In 2D projects the engine builds a navigation grid from static colliders and solid tiles and finds the shortest way around walls with the A* algorithm. When tiles or obstacles change during the game, the grid updates by itself.</p>
                                <p>An object with a <b>Nav Agent 2D</b> walks to its destination along that path. Pick an object in <b>Target</b> and it keeps chasing it (a new path is found every <b>Repath Interval</b>); when empty it goes to the point given with <K>SetDestination</K>. With a Rigidbody it moves by velocity, otherwise directly. <b>Show Path</b> draws the path while playing.</p>
                                <Code>{`NavAgent2D agent = GetComponent<NavAgent2D>();
agent.SetDestination(new Vector2(8, 3));
agent.target = player;                  // chase
agent.speed = 4f;
agent.isStopped = true;                 // stop; Resume() goes on

// Called when the destination is reached.
void OnDestinationReached() { agent.SetDestination(nextPoint); }

// Just the path: a list of corner points (empty when there is none).
var path = Pathfinding.FindPath(transform.position, target.position);
for (int i = 1; i < path.Count; i++) Debug.DrawLine(path[i - 1], path[i], Color.yellow, 1f);
bool open = Pathfinding.IsWalkable(point);`}</Code>
                                <Tip>In the <b>Maze Hunt</b> template three ghosts use the same component in different ways: one chases the player, one cuts them off and one patrols the corners.</Tip>
                            </Section>

                            <Section id="prefab" title="Prefabs, Instantiate and Destroy">
                                <p>Right-click an object in the Hierarchy and choose <b>Create prefab</b>. Pick the prefab in the Inspector for a <K>public GameObject prefab;</K> field of your script, then spawn it at runtime:</p>
                                <Code>{`GameObject enemy = Instantiate(enemyPrefab, new Vector3(0, 5, 0), Quaternion.identity);
enemy.GetComponent<Enemy>().speed = 4f;
Destroy(enemy, 3f);                  // destroy after 3 seconds
Destroy(gameObject);                 // destroy this object
GameObject p = Resources.Load<GameObject>("Bullet"); // load a prefab by name`}</Code>
                                <p>As in Unity, a destroyed object or script compares equal to <K>null</K>: <K>if (target != null)</K> is <K>false</K> once the target was removed with <K>Destroy</K>. A <K>Timer</K> or <K>Tween</K> started inside a method that another script calls belongs to that method&apos;s script, so it keeps running even if the caller is destroyed.</p>
                            </Section>

                            <Section id="coroutine" title="Coroutines and Invoke">
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

                            <Section id="animasyon" title="Animation, Tween and Timer">
                                <p>The <b>Animation</b> component plays clips made of keyframes. In the Inspector, add a ready-made clip (bob, spin, pulse, shake, fade out, flash, sprite frames) and tweak it, or add tracks to an empty clip. Position and rotation keys are added to the object&apos;s current pose and scale keys multiply it; color, opacity and sprite frame are applied as they are. Every keyframe has its own easing curve, and clips play once, loop or ping-pong.</p>
                                <Code>{`Animation anim = GetComponent<Animation>();
anim.Play("Jump");                   // play a clip from the start
anim.Stop();                         // stop and undo the pose
if (!anim.IsPlaying("Run")) anim.CrossFade("Run");
anim.speed = 2f;

// Called when a clip that plays "Once" finishes.
void OnAnimationComplete(string clip)
{
    if (clip == "Death") gameObject.SetActive(false);
}`}</Code>
                                <p><b>Tween</b> is for smooth motion from code. Every call returns a tween whose settings can be chained:</p>
                                <Code>{`Tween.Move(transform, new Vector3(0, 3, 0), 0.5f).SetEase(Ease.OutBack);
Tween.Scale(transform, 1.2f, 0.3f).SetLoops(-1, LoopType.Yoyo);   // ping-pong forever
Tween.Fade(gameObject, 0f, 1f).OnComplete(() => Destroy(gameObject));
Tween.Color(sprite, Color.red, 0.2f);
Tween.Value(0f, 100f, 2f, v => scoreText.text = Mathf.RoundToInt(v).ToString());
Tween.PunchScale(button, 0.15f, 0.3f);                           // button feedback
Tween.Shake(Camera.main.transform, 0.3f, 0.4f);                  // camera shake
yield return Tween.Rotate(transform, new Vector3(0, 0, 180), 1f).WaitForCompletion();`}</Code>
                                <p>Easing curves: <K>Linear</K>, <K>InQuad</K>, <K>OutQuad</K>, <K>InOutQuad</K>, <K>InCubic</K>, <K>OutCubic</K>, <K>InOutCubic</K>, <K>InSine</K>, <K>OutSine</K>, <K>InOutSine</K>, <K>InBack</K>, <K>OutBack</K>, <K>InOutBack</K>, <K>InElastic</K>, <K>OutElastic</K>, <K>InBounce</K>, <K>OutBounce</K> and <K>Step</K>. <K>Tween.Kill(target)</K> stops the tweens of an object and <K>Tween.IsTweening(target)</K> asks about them. <b>Timer</b> handles delayed and repeating work:</p>
                                <Code>{`Timer.After(2f, () => HUD.Show("Ready!", 1f));
var income = Timer.Every(1f, () => gold += workers);   // every second
income.Cancel();
Timer.CancelAll();                                     // every timer of this script`}</Code>
                                <p>Tweens and timers run on game time, so they pause while <K>Time.timeScale = 0</K>. A script&apos;s timers are cancelled when its object is destroyed.</p>
                            </Section>

                            <Section id="sahneler" title="Scenes">
                                <p>Add new scenes from the Project panel; the <b>Start scene</b> is the one the game opens with. To switch scenes:</p>
                                <Code>{`SceneManager.LoadScene("Level2");          // by name
SceneManager.LoadScene(1);                 // by index
SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex); // restart
SceneManager.ReloadScene();                // the same, shorter
SceneManager.FadeToScene("Level2", 0.5f);  // fade the screen out and in
SceneManager.FadeToScene(0, 0.8f, Color.white);
DontDestroyOnLoad(gameObject);             // keep across scenes`}</Code>
                                <p>Static fields survive scene changes (same as Unity). <K>FadeToScene</K> also works while the game is paused (<K>Time.timeScale = 0</K>).</p>
                            </Section>

                            <Section id="ui-ses" title="UI, HUD and sound">
                                <p>UI elements are pinned to the screen and scale with the window (they are designed for a 540 px tall screen). Each one has a 9-point <b>anchor</b>, an offset, a size and a <b>draw order</b>: higher orders draw on top and get clicks first. Add them from <b>Create → UI</b> in the Hierarchy.</p>
                                <Table head={["Component", "Script type"]} rows={[
                                    ["UI Text", <K key="t">Text</K>],
                                    ["UI Button", <K key="b">Button</K>],
                                    ["UI Panel / Image", <K key="p">Image</K>],
                                    ["UI Progress Bar", <K key="s">ProgressBar · Slider</K>],
                                    ["UI Slider · UI Toggle · UI Input Field", <K key="v">Slider · Toggle · InputField</K>],
                                ]} />
                                <p>When a button is clicked, the method named in its <b>On Click</b> field runs on the scripts of the chosen target object (like Unity&apos;s On Click list). You can add listeners from code too. Give a button a <b>hotkey</b> and pressing that key does the same as clicking it.</p>
                                <Code>{`public Text scoreText;       // pick a UI Text object in the Inspector
public Button buyButton;
public Slider healthBar;

void Start()
{
    buyButton.onClick.AddListener(Buy);
    buyButton.onClick.AddListener(() => Audio.Play("click"));
    healthBar.maxValue = 100;
    healthBar.value = 75;               // kept between min and max
}

void Update()
{
    scoreText.text = "Score: " + score;
    buyButton.interactable = coins >= 10;
    buyButton.text = "Buy (" + coins + ")";
    if (UI.IsPointerOverUI()) return;   // the mouse is over a UI element
}`}</Code>
                                <p>A full-screen panel blocks clicks to the buttons and objects below it (<b>Blocks clicks</b>), which is ideal for pause menus. Make the menu buttons children of the panel and <K>pauseMenu.SetActive(false)</K> hides them all at once. The Transform scale and rotation of UI objects are applied too, so <K>Tween.Scale</K>, <K>Tween.PunchScale</K> and <K>Tween.Fade</K> work on UI as well.</p>
                                <Code>{`HUD.Show("Level complete!", 2f, Color.yellow);   // message in the middle of the screen
Audio.Play("coin");                               // built-in sound effect
GetComponent<AudioSource>().Play();`}</Code>
                            </Section>

                            <Section id="ui-kontroller" title="Sliders, toggles and input fields">
                                <p><b>Create → UI</b> has three more controls. Players use them with the mouse or a finger; when the value changes, the method chosen in the Inspector&apos;s event field runs (like Unity&apos;s On Value Changed). Listeners can be added in code too.</p>
                                <Table head={["Component", "Script type and events"]} rows={[
                                    ["UI Slider", <span key="s"><K>Slider</K> · value, minValue, maxValue, wholeNumbers · onValueChanged(float)</span>],
                                    ["UI Toggle", <span key="t"><K>Toggle</K> · isOn · onValueChanged(bool); switch or checkbox style</span>],
                                    ["UI Input Field", <span key="i"><K>InputField</K> · text, characterLimit, contentType · onValueChanged, onEndEdit, onSubmit (string)</span>],
                                ]} />
                                <Code>{`public Slider volume;
public Toggle shake;
public InputField playerName;

void Start()
{
    volume.onValueChanged.AddListener(v => Audio.SetMusicVolume(v));
    shake.SetIsOnWithoutNotify(PlayerPrefs.GetBool("shake", true));   // without firing the event
    playerName.onEndEdit.AddListener(name => PlayerPrefs.SetString("name", name));
    playerName.ActivateInputField();      // start typing (phones open their keyboard)
}`}</Code>
                                <p>The input field is a real text box: phones open their on-screen keyboard, game keys pause while typing and Enter finishes editing. <b>Content Type</b> limits what can be typed (<K>IntegerNumber</K>, <K>Alphanumeric</K>, <K>EmailAddress</K>…). The Progress Bar of older projects is also found as a <K>Slider</K> in scripts; under V4 rules <K>AddComponent&lt;Slider&gt;()</K> adds a real slider.</p>
                            </Section>

                            <Section id="ses-dosyalari" title="Audio files and music">
                                <p>Upload WAV, MP3 or OGG files to the <b>Audio</b> group of the Project panel (up to 300 KB each and 40 per project). When you are signed in, files are saved to your account&apos;s <b>audio library</b> and count against your plan&apos;s audio storage (Free 5 MB, Plus 25 MB, Pro 100 MB; a file used in several projects counts once). Guest projects keep their sounds in this browser.</p>
                                <Code>{`Audio.Play("Explosion1");               // an uploaded file, by name
Audio.Play("coin");                     // a built-in sound effect
Audio.PlayMusic("Theme", 0.7f, 1f);     // looping music: volume, fade time
Audio.StopMusic(0.5f);
Audio.musicVolume = 0.5f;               // separate music and effect volumes
Audio.sfxVolume = 0.8f;

public AudioClip hit;                   // pick a sound in the Inspector
void OnCollisionEnter2D(Collision2D c) { Audio.Play(hit); }

AudioSource source = GetComponent<AudioSource>();
source.clip = "Wind";                   // an uploaded file's name
source.loop = true;
source.Play();`}</Code>
                                <p>The <b>Clip</b> list of an <b>Audio Source</b> shows the built-in sounds and your uploaded files together; <b>Loop</b> can be turned on for an uploaded file. A file with the same name as a built-in sound plays instead of it (for example a file uploaded as <K>coin</K>). The sounds of games published on the Arcade are kept with the publication, and <b>Playable HTML</b> puts them inside the file so they play offline.</p>
                                <Tip>Only upload sounds you have the right to use: your own recordings, or music and effects whose license allows it. Manage your library with the library button of the Audio group and delete files you don&apos;t use to free space.</Tip>
                            </Section>

                            <Section id="ortam" title="Environment and screen effects">
                                <p>Under <b>Settings → Scene settings</b> you set each scene&apos;s background (a solid color or a sky gradient), ambient light, fog and screen effects.</p>
                                <Table head={["Setting", "Effect"]} rows={[
                                    ["Fog: linear", "Thickens gradually between the near and far distances."],
                                    ["Fog: exponential", "Grows quickly with distance based on its density; looks natural in open spaces such as endless runners."],
                                    ["Bloom", "Pixels brighter than the threshold (for example strongly emissive materials) spill light around them. Intensity, threshold and radius are adjustable."],
                                    ["Vignette", "Darkens the edges of the screen to pull the eye to the center."],
                                    ["Exposure", "The brightness of the whole image."],
                                ]} />
                                <Tip>Give the fog the same color as the bottom of the sky gradient so far-away objects melt into the horizon. The ✨ button in the Scene view shows the effects while you edit.</Tip>
                            </Section>

                            <Section id="kayit" title="Saving (PlayerPrefs)">
                                <Code>{`int best = PlayerPrefs.GetInt("best", 0);
if (score > best) PlayerPrefs.SetInt("best", score);
PlayerPrefs.SetString("name", "Han");
PlayerPrefs.SetBool("muted", true);
bool muted = PlayerPrefs.GetBool("muted", false);
PlayerPrefs.DeleteKey("name");`}</Code>
                                <p>Values are stored in the player&apos;s browser, separately for each project (up to 64 KB).</p>
                            </Section>

                            <Section id="yayinlama" title="Publishing and exporting">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li><b>Publish on the Arcade:</b> for cloud projects. The game is compiled and goes through a security scan, and a public link is created. Players can play and like it, and remix it if you turn on <b>Allow remixes</b>. The game card shows the engine version it was made with (for example V4), and the game&apos;s audio files are kept with the publication. You can unpublish it any time.</li>
                                    <li><b>Playable HTML:</b> packs the game, the engine and its audio files into a single .html file that opens without an internet connection; host it anywhere you like.</li>
                                    <li><b>Project file (.json):</b> for backups and for moving a project to another account or browser.</li>
                                </ul>
                            </Section>

                            <Section id="api" title="API reference">
                                <p>The members below are auto-completed in the code editor.</p>
                                <ApiReference />
                            </Section>

                            <Section id="farklar" title="Differences from Unity">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li>The built-in sound effects are procedural (<K>Audio.Play(&quot;coin&quot;)</K>); you can upload your own sounds as WAV, MP3 or OGG files. An <K>AudioClip</K> works like the name of a sound, and there is no positional (3D) audio.</li>
                                    <li>Capsule/mesh colliders are approximated as boxes, and angular physics is simplified (spheres roll visually).</li>
                                    <li>Layer masks (LayerMask) and <K>IgnoreCollision</K> are ignored; use tags and triggers instead.</li>
                                    <li>The UI has Text, Button, Panel/Image, Progress Bar, Slider, Toggle and Input Field components; there are no Canvas layout components (Layout Group, Scroll View, Dropdown). Use <K>OnMouseDown</K> to make scene objects clickable.</li>
                                    <li>Path finding uses A* on a 2D grid instead of a NavMesh (Nav Agent 2D); in 3D projects agents walk to their target in a straight line. Distance and Spring joints are available; Hinge, Slider and Wheel joints are not.</li>
                                    <li>The Animation component is a simple clip player rather than an Animator state machine; <K>SetTrigger(&quot;Jump&quot;)</K> plays the clip with the same name.</li>
                                    <li>Scripts run in a safe interpreter instead of a real .NET/C++ compiler; they cannot reach the network, files or browser APIs.</li>
                                </ul>
                            </Section>

                            <Section id="guvenlik" title="Security and limits">
                                <ul className="list-disc space-y-2 ps-5">
                                    <li>The script interpreter cannot reach the DOM, the network, cookies or files, and every call has an instruction budget. Infinite loops don&apos;t freeze the game: the script is disabled and the problem is logged to the console.</li>
                                    <li>Project content can be up to 900 KB (including textures), 160 KB per script, 64 scripts, 24 scenes and 1000 objects per scene; a tilemap holds up to 512 × 256 cells. Uploaded images are downscaled automatically.</li>
                                    <li>Audio files can be up to 300 KB each and 40 per project; your account&apos;s total audio storage depends on your plan (Free 5 MB / 30 files, Plus 25 MB / 150 files, Pro 100 MB / 600 files).</li>
                                    <li>Games published on the Arcade are public. Don&apos;t share personal data, passwords or secret keys; content that breaks the rules is removed.</li>
                                </ul>
                            </Section>

                            <Section id="sorunlar" title="Troubleshooting">
                                <Table head={["Symptom", "Fix"]} rows={[
                                    ["Pressing Play says “Fix compile errors before playing.”", "Open Errors in the Console; clicking an error opens the script at that line. It is usually a missing semicolon, an unclosed brace or a misspelt name."],
                                    ["A script is greyed out in the Add component menu.", "The file has no class deriving from MonoBehaviour. Declare it as public class Name : MonoBehaviour."],
                                    ["OnTriggerEnter is never called.", "The collider needs Is Trigger turned on, and at least one of the two objects needs a Rigidbody. The script can be on the object entering the trigger or on the trigger itself."],
                                    ["The character falls through the ground.", "The ground needs an enabled collider (for example a Box Collider 2D). Don't give the ground a dynamic Rigidbody, or it falls too."],
                                    ["The Console shows a NullReferenceException.", "A public field in the Inspector is empty, or the object was removed with Destroy. Assign the field in the Inspector or check it with if (target != null) before using it."],
                                    ["The Console says the script exceeded its instruction budget (possible infinite loop).", "A while or for loop never ends. The game doesn't freeze; only that script is disabled. Fix the loop's exit condition, and use a coroutine (yield return) to wait."],
                                    ["No sound plays.", "Browsers only turn sound on after the first click on the page; click the game once. When you play an uploaded file by name, write the name exactly as in the Project panel; names that can't be found show a “Ses bulunamadı” (sound not found) warning in the Console."],
                                    ["The gamepad isn't detected.", "Connect it and press one of its buttons; browsers only report a gamepad once a button is pressed. Check the action's gamepad bindings in Settings → Input."],
                                    ["Keys don't work in the game.", "The focus may be in a text field (such as the script editor). Click the game view once."],
                                    ["Publish to Arcade is unavailable.", "Sign in and save the project to the cloud to publish it; guest projects only live in this browser."],
                                    ["“This project changed in another tab or on another device.”", "Reload to get the latest version. To keep the changes made in this tab, first back them up with Export → Project file (.json)."],
                                ]} />
                                <Tip>Still stuck? Paste the error into <Link href="/ai" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Hanogt AI</Link> or write to us from the <Link href="/feedback" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Feedback and Support</Link> page.</Tip>
                            </Section>
        </>
    );
}

/** The table of contents with a filter that searches the section texts too. */
function Contents({ tr, active, onNavigate }: { tr: boolean; active: string; onNavigate?: () => void }) {
    const [query, setQuery] = useState("");
    const [matches, setMatches] = useState<string[] | null>(null);
    // Reads the rendered sections when the query changes, so it searches exactly what is on the page.
    const search = (value: string) => {
        setQuery(value);
        const words = fold(value).split(/\s+/).filter(Boolean);
        if (!words.length) {
            setMatches(null);
            return;
        }
        setMatches(SECTIONS.filter((section) => {
            const text = fold(`${section.tr} ${section.en} ${document.getElementById(section.id)?.textContent ?? ""}`);
            return words.every((word) => text.includes(word));
        }).map((section) => section.id));
    };
    const shown = matches ? SECTIONS.filter((section) => matches.includes(section.id)) : SECTIONS;
    return (
        <div>
            <label className="relative block">
                <span className="sr-only">{tr ? "Belgelerde ara" : "Search the docs"}</span>
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => search(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") search("");
                    }}
                    placeholder={tr ? "Ara: Rigidbody, Tween…" : "Search: Rigidbody, Tween…"}
                    maxLength={60}
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white ps-9 pe-3 text-[13.5px] text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
                />
            </label>
            {matches ? <p className="mt-2 px-1 text-[12px] text-zinc-500 dark:text-zinc-400" aria-live="polite">{tr ? `${matches.length} bölüm bulundu` : `${matches.length} ${matches.length === 1 ? "section" : "sections"} found`}</p> : null}
            <ol className="mt-3 space-y-0.5">
                {shown.map((section) => {
                    const index = SECTIONS.indexOf(section);
                    const current = section.id === active;
                    return (
                        <li key={section.id}>
                            <a
                                href={`#${section.id}`}
                                onClick={onNavigate}
                                aria-current={current ? "location" : undefined}
                                className={`block rounded-lg px-3 py-1.5 text-[13.5px] transition ${current ? "bg-indigo-500/10 font-semibold text-indigo-700 dark:text-indigo-300" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"}`}
                            >
                                <span className="me-2 text-zinc-400">{index + 1}.</span>{tr ? section.tr : section.en}
                            </a>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

export default function EngineDocs() {
    const { language, dir } = useI18n();
    // Same rule as the engine UI: Turkish (and Azerbaijani) readers get the Turkish guide, everyone else English.
    const tr = engineLocale(language) === "tr";
    const [active, setActive] = useState(SECTIONS[0].id);
    const mobileContents = useRef<HTMLDetailsElement>(null);

    // Highlights the section being read: the last one whose heading passed the sticky header.
    useEffect(() => {
        let frame = 0;
        const update = () => {
            frame = 0;
            let current = SECTIONS[0].id;
            for (const section of SECTIONS) {
                const element = document.getElementById(section.id);
                if (element && element.getBoundingClientRect().top <= 120) current = section.id;
            }
            setActive(current);
        };
        const onScroll = () => {
            if (!frame) frame = window.requestAnimationFrame(update);
        };
        frame = window.requestAnimationFrame(update);
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, [tr]);

    return (
        <TurkishDocs.Provider value={tr}>
        <div className="min-h-dvh bg-white dark:bg-zinc-950" dir={dir === "rtl" ? "ltr" : undefined} lang={tr ? "tr" : "en"}>
            <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-zinc-950/80">
                <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
                    <Link href="/game-engine" className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5" aria-label={tr ? "Motora dön" : "Back to the engine"}><ArrowLeft className="h-4 w-4" /></Link>
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><BookOpen className="h-4 w-4" /></div>
                        <span className="truncate font-black text-zinc-900 dark:text-white">{tr ? "Hanogt Engine Belgeleri" : "Hanogt Engine Docs"}</span>
                    </div>
                    <div className="flex-1" />
                    <Link href="/arcade" className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5 sm:inline-flex"><Rocket className="h-4 w-4" />Arcade</Link>
                    <Link href="/game-engine" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-semibold text-white dark:bg-white dark:text-zinc-900"><Gamepad2 className="h-4 w-4" />{tr ? "Motoru aç" : "Open the engine"}</Link>
                </div>
            </header>
            <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[260px_1fr]">
                <nav className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] overflow-y-auto py-8 lg:block" aria-label={tr ? "İçindekiler" : "Contents"}>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400">{tr ? "İçindekiler" : "Contents"}</p>
                    <Contents tr={tr} active={active} />
                </nav>
                <main id="main-content" className="min-w-0 pb-24">
                    <div className="border-b border-zinc-200/70 py-12 dark:border-white/[0.06]">
                        <p className="text-[13px] font-semibold text-indigo-600 dark:text-indigo-400">{tr ? `Kılavuz · V${ENGINE_VERSION}` : `Guide · V${ENGINE_VERSION}`}</p>
                        <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-5xl">{tr ? "Tarayıcıda gerçek bir oyun motoru" : "A real game engine in your browser"}</h1>
                        <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {tr
                                ? "Hanogt Engine; Unity'ye benzeyen editörü, GameObject/Component mimarisi, C# ve C++ script desteği, fizik motoru, tilemap'ler, arayüz bileşenleri, animasyon sistemi, WebGL render'ı ve Arcade yayınlamasıyla tarayıcıda çalışan bir 2D/3D oyun motorudur. Kurulum gerekmez; projeleriniz buluta veya tarayıcınıza kaydedilir."
                                : "Hanogt Engine is a 2D/3D game engine that runs in your browser, with a Unity-like editor, a GameObject/Component architecture, C# and C++ scripting, a physics engine, tilemaps, UI components, an animation system, WebGL rendering and Arcade publishing. Nothing to install; your projects are saved to the cloud or to your browser."}
                        </p>
                        <div className="mt-6 flex flex-wrap gap-2">
                            <a href="#ilk-oyun" className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-[14px] font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-500"><Rocket className="h-4 w-4" />{tr ? "İlk oyununu 10 dakikada yap" : "Build your first game in 10 minutes"}</a>
                            <a href="#api" className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-4 text-[14px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">{tr ? "API referansı" : "API reference"}<ArrowRight className="h-4 w-4" /></a>
                        </div>
                    </div>
                    <details ref={mobileContents} className="group mt-6 rounded-xl border border-zinc-200 dark:border-white/10 lg:hidden">
                        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[14px] font-bold text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
                            <ListTree className="h-4 w-4 text-indigo-500" />
                            {tr ? "İçindekiler ve arama" : "Contents and search"}
                            <span className="ms-auto text-[12px] font-semibold text-zinc-400 transition group-open:rotate-180">▾</span>
                        </summary>
                        <div className="border-t border-zinc-200 p-3 dark:border-white/10">
                            <Contents tr={tr} active={active} onNavigate={() => { if (mobileContents.current) mobileContents.current.open = false; }} />
                        </div>
                    </details>
                    {tr ? <DocsTR /> : <DocsEN />}
                </main>
            </div>
        </div>
        </TurkishDocs.Provider>
    );
}
