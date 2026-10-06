import type { Copy } from "@/lib/i18n";
import { COLLAB_LIMITS } from "@/lib/collab/protocol";
import { GROUP_LIMITS } from "@/lib/groups";
import { LIST_PRICES, PLAN_AI_CONNECTIONS, PLAN_AI_LIMITS, PLAN_COLLAB_LIMITS, PLAN_GROUP_FEATURES, PLAN_GROUP_LIMITS, PLAN_PROJECT_LIMITS } from "@/lib/plans";
import { STATUS_PREFERENCE_COPY } from "@/lib/presence";
import { BROWSER_LANGUAGES, LANGUAGE_STATS } from "@/lib/runtimes/languages";

/**
 * The pages of the Minecraft-style guide (/guide). The Hanogt AI knowledge
 * base indexes every titled page too (src/lib/ai/knowledge.ts), so keep the
 * facts here in step with the product. Limits and counts come from their
 * modules as {placeholders} with `vars`, so they can't go stale.
 *
 * Chapter ids are the URL hash (/guide#news); "media" still opens "social".
 * Hanogt News stays chapter 5: the landing page teaser says so in 50 languages.
 */
export type ChapterId = "start" | "editor" | "engine" | "arcade" | "news" | "ai" | "social" | "security" | "account" | "tips";

export interface Chapter {
    id: ChapterId;
    icon: string;
    title: Copy;
    /** Minecraft-style item name shown in the hotbar tooltip. */
    item: Copy;
    color: string;
}

export type Block =
    | { type: "p"; text: Copy }
    | { type: "list"; items: Copy[] }
    | { type: "steps"; items: Copy[] }
    | { type: "tip"; title: Copy; text: Copy }
    | { type: "item"; icon: string; name: Copy; text: Copy }
    | { type: "keys"; items: Array<{ keys: string; text: Copy }> }
    | { type: "code"; code: string }
    | { type: "link"; href: string; label: Copy }
    | { type: "toc" }
    | { type: "cover" };

export interface BookPage {
    chapter: ChapterId;
    title?: Copy;
    blocks: Block[];
}

/** Old hashes that still open a chapter. */
export const CHAPTER_ALIASES: Readonly<Record<string, ChapterId>> = { media: "social" };

export const CHAPTERS: Chapter[] = [
    { id: "start", icon: "🧭", title: { TR: "Başlangıç", EN: "Getting started" }, item: { TR: "Pusula", EN: "Compass" }, color: "#e11d48" },
    { id: "editor", icon: "⌨️", title: { TR: "Kod Editörü", EN: "Code Editor" }, item: { TR: "Kodlama Masası", EN: "Coding Table" }, color: "#2563eb" },
    { id: "engine", icon: "🧱", title: { TR: "Hanogt Engine", EN: "Hanogt Engine" }, item: { TR: "İnşa Bloğu", EN: "Building Block" }, color: "#7c3aed" },
    { id: "arcade", icon: "🕹️", title: { TR: "Arcade", EN: "Arcade" }, item: { TR: "Oyun Konsolu", EN: "Game Console" }, color: "#d97706" },
    { id: "news", icon: "📰", title: { TR: "Hanogt News", EN: "Hanogt News" }, item: { TR: "Gazete", EN: "Newspaper" }, color: "#dc2626" },
    { id: "ai", icon: "✨", title: { TR: "Hanogt AI", EN: "Hanogt AI" }, item: { TR: "Büyü Masası", EN: "Enchanting Table" }, color: "#9333ea" },
    { id: "social", icon: "💬", title: { TR: "Hanogt Social ve Media", EN: "Hanogt Social & Media" }, item: { TR: "Haberci Güvercin", EN: "Messenger Pigeon" }, color: "#0891b2" },
    { id: "security", icon: "🛡️", title: { TR: "Güvenlik", EN: "Security" }, item: { TR: "Büyülü Kalkan", EN: "Enchanted Shield" }, color: "#059669" },
    { id: "account", icon: "🗝️", title: { TR: "Hesap ve Gizlilik", EN: "Account & Privacy" }, item: { TR: "Anahtar", EN: "Key" }, color: "#ca8a04" },
    { id: "tips", icon: "💎", title: { TR: "Kısayollar ve Sırlar", EN: "Shortcuts & Secrets" }, item: { TR: "Elmas", EN: "Diamond" }, color: "#0ea5e9" },
];

const RUN = {
    browser: BROWSER_LANGUAGES.size,
    server: LANGUAGE_STATS.runnable - BROWSER_LANGUAGES.size,
    preview: LANGUAGE_STATS.preview,
};

export const PAGES: BookPage[] = [
    // ------------------------------------------------------------------ Başlangıç
    { chapter: "start", blocks: [{ type: "cover" }] },
    { chapter: "start", title: { TR: "İçindekiler", EN: "Contents" }, blocks: [{ type: "toc" }] },
    {
        chapter: "start",
        title: { TR: "Hesap aç", EN: "Create an account" },
        blocks: [
            {
                type: "steps",
                items: [
                    { TR: "Sağ üstteki \"Kayıt Ol\" düğmesine bas.", EN: "Press \"Sign up\" in the top-right corner." },
                    { TR: "Google hesabınla ya da e-posta ve güçlü bir parolayla kaydol.", EN: "Sign up with Google or with an e-mail and a strong password." },
                    { TR: "Gizlilik Politikası ve Kullanım Şartları'nı oku, onayla.", EN: "Read and accept the Privacy Policy and Terms of Use." },
                    { TR: "Panel'e ışınlanırsın. Macera başlasın!", EN: "You are teleported to your Dashboard. Let the adventure begin!" },
                ],
            },
            { type: "tip", title: { TR: "Büyülü bilgi", EN: "Enchanted lore" }, text: { TR: "Parolan açık hâliyle saklanmaz: sunucuda benzersiz tuz ve scrypt ile tek yönlü karmalanır.", EN: "Your password is never stored in plain text: the server hashes it one-way with scrypt and a unique salt." } },
        ],
    },
    {
        chapter: "start",
        title: { TR: "Haritayı tanı", EN: "Know the map" },
        blocks: [
            { type: "item", icon: "🧭", name: { TR: "Üst menü", EN: "Top menu" }, text: { TR: "Hanogt AI, Haberler, Arcade, Oyun Motoru, Media ve Kılavuz. Giriş yapınca Panel ve Hanogt Social profil menünde; telefonda hepsi ☰ menüde.", EN: "Hanogt AI, News, Arcade, Game Engine, Media and Guide. Once you sign in, the Dashboard and Hanogt Social live in your profile menu; on phones everything is in the ☰ menu." } },
            { type: "item", icon: "✨", name: { TR: "Hanogt AI", EN: "Hanogt AI" }, text: { TR: "Mor ışıltı simgesi: kod, oyun motoru, hata ayıklama, güvenlik ve site hakkında sorularını yanıtlayan yapay zeka asistanı.", EN: "The purple sparkle icon: the AI assistant that answers questions about code, the game engine, debugging, security and the site." } },
            { type: "item", icon: "🔔", name: { TR: "Bildirimler", EN: "Notifications" }, text: { TR: "Zil simgesi: arkadaşlık istekleri, ekiple düzenleme davetleri ve destek yanıtları burada toplanır.", EN: "The bell: friend requests, team editing invites and support replies gather here." } },
            { type: "item", icon: "📜", name: { TR: "Yenilikler", EN: "What's new" }, text: { TR: "Son güncellemelerin günlüğü.", EN: "The log of recent updates." } },
            { type: "item", icon: "🌐", name: { TR: "Dil ve tema", EN: "Language & theme" }, text: { TR: "Sağdan sola Arapça, Farsça, İbranice ve Urduca dahil 50 arayüz dili, açık ve koyu tema. Telefonda hepsi ☰ menüde.", EN: "50 interface languages including right-to-left Arabic, Persian, Hebrew and Urdu, light and dark themes. On phones everything lives in the ☰ menu." } },
        ],
    },
    {
        chapter: "start",
        title: { TR: "Panel: üssün", EN: "The Dashboard: your base" },
        blocks: [
            { type: "p", text: { TR: "Panel, giriş yaptıktan sonra döndüğün üstür. Tüm çalışmaların burada iki sandıkta durur:", EN: "The Dashboard is the base you return to after signing in. All your work is kept here in two chests:" } },
            { type: "item", icon: "📁", name: { TR: "Kod projeleri", EN: "Code projects" }, text: { TR: "Kod Editörü'nde yazdığın, buluta kaydedilen projeler.", EN: "Projects you write in the Code Editor, saved to the cloud." } },
            { type: "item", icon: "🎮", name: { TR: "Oyun projeleri", EN: "Game projects" }, text: { TR: "Hanogt Engine ile yaptığın 2D ve 3D oyunlar.", EN: "The 2D and 3D games you build with Hanogt Engine." } },
            { type: "list", items: [{ TR: "Projelerde ara; son düzenlenene ya da ada göre sırala.", EN: "Search your projects; sort by last edited or by name." }, { TR: "\"Yeni Proje Oluştur\" ile kod ya da oyun projesi başlat.", EN: "Start a code or game project with \"Create New Project\"." }] },
        ],
    },

    // ------------------------------------------------------------------ Kod Editörü
    {
        chapter: "editor",
        title: { TR: "İlk projen", EN: "Your first project" },
        blocks: [
            {
                type: "steps",
                items: [
                    { TR: "Panel'de \"Yeni Proje Oluştur\"a bas.", EN: "Press \"Create New Project\" on the Dashboard." },
                    { TR: "Açılan pencerede \"Kod projesi\"ni seç.", EN: "Choose \"Code project\" in the window that opens." },
                    { TR: "{count} dilden birini seç: Python, C#, C++, Java, JavaScript, TypeScript, Go, Rust, Kotlin, Swift, PHP, Ruby, Lua, SQL, HTML, CSS ve daha fazlası.", EN: "Pick one of {count} languages: Python, C#, C++, Java, JavaScript, TypeScript, Go, Rust, Kotlin, Swift, PHP, Ruby, Lua, SQL, HTML, CSS and more.", vars: { count: LANGUAGE_STATS.usable } },
                    { TR: "Projene bir ad ver. Editör açılır ve ilk kodun hazırdır.", EN: "Name your project. The editor opens with your first code ready." },
                ],
            },
            { type: "p", text: { TR: "Projelerin hesabına bağlı olarak buluta kaydedilir; başka bir cihazdan giriş yaptığında seni bekler.", EN: "Projects are saved to the cloud under your account and wait for you on any device." } },
        ],
    },
    {
        chapter: "editor",
        title: { TR: "Kodu çalıştır", EN: "Run your code" },
        blocks: [
            { type: "p", text: { TR: "Yeşil ▶ Çalıştır düğmesine bas ya da Ctrl+Enter kullan. Çıktı ve hatalar alttaki konsolda görünür; dosya:satır bağlantıları seni hatalı satıra götürür.", EN: "Press the green ▶ Run button or use Ctrl+Enter. Output and errors appear in the console below; file:line links take you to the faulty line." } },
            { type: "item", icon: "🌐", name: { TR: "Tarayıcıda: {count} dil", EN: "In your browser: {count} languages", vars: { count: RUN.browser } }, text: { TR: "JavaScript, TypeScript, Python, SQL, Lua ve daha fazlası cihazında, ayrı bir Web Worker içinde çalışır. Giriş gerekmez, kod sunucuya gitmez.", EN: "JavaScript, TypeScript, Python, SQL, Lua and more run on your device in a separate Web Worker. No sign-in needed, and the code never leaves your device." } },
            { type: "item", icon: "🏭", name: { TR: "Derleyici hizmetinde: {count} dil", EN: "On the compiler service: {count} languages", vars: { count: RUN.server } }, text: { TR: "C, C++, C#, Java, Go, Rust, Kotlin ve diğerleri giriş gerektirir. Kod önce Hanogt Security ile taranır, sonra izole bir derleyici hizmetinde çalışır; dakikada 20 çalıştırma.", EN: "C, C++, C#, Java, Go, Rust, Kotlin and others need a sign-in. Code is scanned by Hanogt Security first, then runs on an isolated compiler service; 20 runs a minute." } },
            { type: "item", icon: "👁️", name: { TR: "Önizleme: {count} dil", EN: "Preview: {count} languages", vars: { count: RUN.preview } }, text: { TR: "HTML, CSS, Markdown, SVG, Mermaid ve LaTeX güvenli önizleme panelinde canlı görünür.", EN: "HTML, CSS, Markdown, SVG, Mermaid and LaTeX show up live in a safe preview panel." } },
            { type: "tip", title: { TR: "Girdi büyüsü", EN: "Input enchantment" }, text: { TR: "input(), Scanner, cin ve io.read() okumaları Girdi sekmesine yazdığın metinden gelir.", EN: "input(), Scanner, cin and io.read() read the text you type in the Input tab." } },
        ],
    },
    {
        chapter: "editor",
        title: { TR: "Editörün güçleri", EN: "Editor powers" },
        blocks: [
            {
                type: "list",
                items: [
                    { TR: "VS Code'un kalbi Monaco: renklendirme, otomatik tamamlama, hata altı çizgileri.", EN: "Monaco, the heart of VS Code: highlighting, autocomplete, error squiggles." },
                    { TR: "Çoklu sekme: farklı dillerdeki dosyaları \"Tümünü çalıştır\" ile birlikte çalıştır.", EN: "Multiple tabs: run files in different languages together with \"Run all\"." },
                    { TR: "Ctrl/⌘+K komut paleti; yapay zeka paneliyle sor, açıklat, düzelt.", EN: "Ctrl/⌘+K command palette; ask, explain and fix with the AI panel." },
                    { TR: "Şablon galerisi, ZIP içe ve dışa aktarma, Media'da yayınlama.", EN: "Template gallery, ZIP import and export, publishing to Media." },
                    { TR: "Ayarlar: yazı tipi, boyut, mini harita, tema ve daha fazlası.", EN: "Settings: font, size, minimap, theme and more." },
                ],
            },
            { type: "keys", items: [{ keys: "Ctrl + S", text: { TR: "Kaydet", EN: "Save" } }, { keys: "Ctrl + Enter", text: { TR: "Çalıştır", EN: "Run" } }, { keys: "Ctrl + K", text: { TR: "Komut paleti", EN: "Command palette" } }] },
        ],
    },
    {
        chapter: "editor",
        title: { TR: "Ekiple düzenle", EN: "Edit as a team" },
        blocks: [
            {
                type: "steps",
                items: [
                    { TR: "Editörün araç çubuğunda \"Ekiple düzenle\"ye bas (giriş gerekir).", EN: "Press \"Edit with your team\" in the editor toolbar (sign-in required)." },
                    { TR: "Oturuma ad ver ve paylaşılacak dosyaları seç (en fazla {files} dosya).", EN: "Name the session and pick the files to share (up to {files} files).", vars: { files: COLLAB_LIMITS.maxFiles } },
                    { TR: "Arkadaşlarını davet et: bildirim alırlar, davet bağlantısıyla da katılabilirler. Bir oturumda kaç kişi olabileceği oturumu başlatanın planına bağlı (sen dahil): Ücretsiz {free}, Plus {plus}, Pro {pro} kişi. Sesli sohbete aynı anda en fazla 5 kişi katılır.", EN: "Invite your friends: they get a notification and can also join with the invite link. How many people a session holds depends on the plan of whoever starts it (you included): Free {free}, Plus {plus}, Pro {pro}. Up to 5 people can talk in voice at once.", vars: { free: PLAN_COLLAB_LIMITS.free.people, plus: PLAN_COLLAB_LIMITS.plus.people, pro: PLAN_COLLAB_LIMITS.pro.people } },
                    { TR: "Herkesin imlecini canlı görürsün; Ekip panelinden yazışır, sesli sohbete katılırsın.", EN: "You see everyone's cursor live; chat and join the voice chat from the Team panel." },
                ],
            },
            { type: "tip", title: { TR: "Ortak sandık", EN: "Shared chest" }, text: { TR: "Kod, oturum sahibinin projesine kaydedilir. Ses kaydedilmez; oturum bitince sohbet ve canlı veriler silinir.", EN: "The code is saved to the session owner's project. Voice is never recorded; chat and live data are deleted when the session ends." } },
        ],
    },

    // ------------------------------------------------------------------ Hanogt Engine
    {
        chapter: "engine",
        title: { TR: "Oyun motoru", EN: "The game engine" },
        blocks: [
            { type: "p", text: { TR: "Hanogt Engine V3, tarayıcıda çalışan Unity benzeri bir 2D/3D oyun motorudur. Dünyan sahnelerden, sahneler GameObject'lerden, onlar da bileşenlerden oluşur.", EN: "Hanogt Engine V3 is a Unity-like 2D/3D engine in your browser. Your world is made of scenes, scenes of GameObjects, and those of components." } },
            { type: "p", text: { TR: "Oyun Motoru sayfasında bir şablonla başla:", EN: "Start from a template on the Game Engine page:" } },
            {
                type: "list",
                items: [
                    { TR: "Tilemap Macerası, Tıklama Fabrikası ve Sisli Koşu (V3 ile yeni)", EN: "Tilemap Adventure, Clicker Factory and Foggy Runner (new in V3)" },
                    { TR: "2D Platform Oyunu", EN: "2D Platformer" },
                    { TR: "3D Top Yuvarlama", EN: "3D Roll-a-Ball" },
                    { TR: "Uzay Nişancısı (C++ ve C#)", EN: "Space Shooter (C++ and C#)" },
                    { TR: "Tuğla Kırma", EN: "Breakout" },
                    { TR: "Boş 2D ya da 3D proje", EN: "Empty 2D or 3D project" },
                ],
            },
        ],
    },
    {
        chapter: "engine",
        title: { TR: "Editör pencereleri", EN: "Editor windows" },
        blocks: [
            { type: "item", icon: "🌳", name: { TR: "Hiyerarşi", EN: "Hierarchy" }, text: { TR: "Sahnedeki nesnelerin ağacı. Sürükle, grupla, yeniden adlandır.", EN: "The tree of objects in the scene. Drag, group, rename." } },
            { type: "item", icon: "🎬", name: { TR: "Sahne", EN: "Scene" }, text: { TR: "Nesneleri taşı (W), döndür (E), ölçekle (R).", EN: "Move (W), rotate (E), scale (R) objects." } },
            { type: "item", icon: "🔍", name: { TR: "Inspector", EN: "Inspector" }, text: { TR: "Seçili nesnenin bileşenleri ve script alanları.", EN: "Components and script fields of the selection." } },
            { type: "item", icon: "📦", name: { TR: "Proje ve Konsol", EN: "Project & Console" }, text: { TR: "Scriptler, prefablar, dokular; Debug.Log çıktıları.", EN: "Scripts, prefabs, textures; Debug.Log output." } },
            { type: "item", icon: "▶️", name: { TR: "Oyun", EN: "Game" }, text: { TR: "Oynat, duraklat, adım adım ilerlet (Ctrl+P).", EN: "Play, pause, step (Ctrl+P)." } },
        ],
    },
    {
        chapter: "engine",
        title: { TR: "İlk büyün: script", EN: "Your first spell: a script" },
        blocks: [
            { type: "code", code: "public class Spin : MonoBehaviour\n{\n    public float speed = 90f;\n\n    void Update()\n    {\n        transform.Rotate(0, speed * Time.deltaTime, 0);\n    }\n}" },
            { type: "p", text: { TR: "Scripti bir nesnenin üzerine sürükle ve ▶ bas: nesne dönmeye başlar. Aynı API'yi C++ ile de yazabilirsin.", EN: "Drag the script onto an object and press ▶: it starts spinning. You can write the same API in C++ too." } },
        ],
    },
    {
        chapter: "engine",
        title: { TR: "Fizik ve etkileşim", EN: "Physics & interaction" },
        blocks: [
            {
                type: "list",
                items: [
                    { TR: "Rigidbody ve Collider: yerçekimi, çarpışma, sekme.", EN: "Rigidbody and Collider: gravity, collisions, bounce." },
                    { TR: "Tetikleyiciler: OnTriggerEnter ile coin topla.", EN: "Triggers: collect coins with OnTriggerEnter." },
                    { TR: "Input: klavye, fare, dokunmatik ve eksenler.", EN: "Input: keyboard, mouse, touch and axes." },
                    { TR: "Coroutine, Invoke, Raycast, Instantiate, Destroy.", EN: "Coroutines, Invoke, Raycast, Instantiate, Destroy." },
                    { TR: "PlayerPrefs ile en yüksek skoru sakla.", EN: "Keep the high score with PlayerPrefs." },
                ],
            },
            { type: "link", href: "/game-engine/docs", label: { TR: "Tüm script API'si: Motor Belgeleri", EN: "Full script API: Engine Docs" } },
        ],
    },
    {
        chapter: "engine",
        title: { TR: "V3'ün yeni blokları", EN: "The new blocks of V3" },
        blocks: [
            { type: "item", icon: "🧱", name: { TR: "Tilemap", EN: "Tilemap" }, text: { TR: "Paletten karo seç ve ızgaraya fırçayla boya. Katı karolar çarpışır; tetikleyici karolar diken ya da bitiş çizgisi olur.", EN: "Pick a tile from the palette and paint the grid with a brush. Solid tiles collide; trigger tiles become spikes or finish lines." } },
            { type: "item", icon: "🎞️", name: { TR: "Animasyon", EN: "Animation" }, text: { TR: "Anahtar kareli klipler ve 18 yumuşatma eğrisi; scriptten Tween ve Timer.", EN: "Keyframed clips and 18 easing curves; Tween and Timer from scripts." } },
            { type: "item", icon: "🖲️", name: { TR: "Arayüz", EN: "UI" }, text: { TR: "UI Button, Panel, Progress Bar ve Text ile menüler, can barları ve skor tabelaları.", EN: "Menus, health bars and scoreboards with UI Button, Panel, Progress Bar and Text." } },
            { type: "item", icon: "🌫️", name: { TR: "Ekran efektleri", EN: "Screen effects" }, text: { TR: "Sis, parlama (bloom), vinyet ve pozlama.", EN: "Fog, bloom, vignette and exposure." } },
            { type: "link", href: "/game-engine/docs#yenilikler", label: { TR: "V3'te yenilikler", EN: "What's new in V3" } },
        ],
    },
    {
        chapter: "engine",
        title: { TR: "İlk oyununu yap", EN: "Build your first game" },
        blocks: [
            {
                type: "steps",
                items: [
                    { TR: "Oyun Motoru'nda \"Boş 2D Proje\" oluştur.", EN: "Create an \"Empty 2D Project\" in the Game Engine." },
                    { TR: "Hiyerarşi → Oluştur → Sprite (Kare) ile bir oyuncu ekle ve ona Rigidbody 2D ver.", EN: "Add a player with Hierarchy → Create → Sprite (Square) and give it a Rigidbody 2D." },
                    { TR: "Altına geniş bir Sprite (Kare) koy: bu senin zeminin.", EN: "Put a wide Sprite (Square) below it: that's your ground." },
                    { TR: "Oyuncuya yürüme ve zıplama scripti yaz.", EN: "Write a walk-and-jump script for the player." },
                    { TR: "Sprite (Daire) ile coin ekle: Is Trigger aç, etiketini Coin yap.", EN: "Add a coin with Sprite (Circle): turn on Is Trigger and tag it Coin." },
                    { TR: "▶ Oynat'a bas ve coinleri topla!", EN: "Press ▶ Play and collect the coins!" },
                ],
            },
            { type: "link", href: "/game-engine/docs#ilk-oyun", label: { TR: "Adım adım anlatım ve hazır kod", EN: "Step-by-step walkthrough with ready code" } },
        ],
    },
    {
        chapter: "engine",
        title: { TR: "Kaydet ve yayınla", EN: "Save & publish" },
        blocks: [
            { type: "p", text: { TR: "Ctrl+S ile kaydet. Giriş yaptıysan proje buluta, yapmadıysan tarayıcına kaydedilir.", EN: "Save with Ctrl+S. Signed in, the project goes to the cloud; otherwise it stays in your browser." } },
            { type: "item", icon: "📄", name: { TR: "HTML olarak dışa aktar", EN: "Export as HTML" }, text: { TR: "Oyunun tek bir dosyada; istediğin yerde çalışır.", EN: "Your game in one file that runs anywhere." } },
            { type: "item", icon: "🚀", name: { TR: "Arcade'de yayınla", EN: "Publish to the Arcade" }, text: { TR: "Başlık ve açıklama yaz; güvenlik taramasından sonra herkes oynayabilir. \"Remikslemelere izin ver\"i açarsan başkaları da kopyasını alıp geliştirebilir.", EN: "Add a title and description; after a security scan everyone can play. Turn on \"Allow remixes\" and others can copy it and build on it too." } },
        ],
    },

    // ------------------------------------------------------------------ Arcade
    {
        chapter: "arcade",
        title: { TR: "Arcade salonu", EN: "The Arcade hall" },
        blocks: [
            { type: "p", text: { TR: "Topluluğun Hanogt Engine ile yaptığı oyunlar burada. İndirme yok: tıkla ve oyna.", EN: "Games the community built with Hanogt Engine live here. No downloads: click and play." } },
            {
                type: "list",
                items: [
                    { TR: "Sırala: Yeni, Popüler, En beğenilen.", EN: "Sort: New, Popular, Most liked." },
                    { TR: "Filtrele: 2D / 3D; oyun ya da geliştirici ara.", EN: "Filter: 2D / 3D; search games or developers." },
                    { TR: "❤️ Beğen (giriş gerekir) ve oynanma sayısını gör.", EN: "❤️ Like (sign-in required) and see play counts." },
                    { TR: "Tam ekran oyna; oyun destekliyorsa telefonda dokunmatik kontroller çıkar.", EN: "Play full screen; on phones, touch controls appear when the game supports them." },
                    { TR: "Remiksle: \"Remikslenebilir\" rozetli oyunların kopyasını kendi projene al, değiştir, yeniden yayınla.", EN: "Remix: copy games with the \"Remixable\" badge into your projects, change them, republish." },
                ],
            },
        ],
    },
    {
        chapter: "arcade",
        title: { TR: "Remiks kuralları", EN: "Remix rules" },
        blocks: [
            {
                type: "list",
                items: [
                    { TR: "Yayınlarken \"Remikslemelere izin ver\" anahtarını sen seçersin; varsayılan olarak kapalıdır.", EN: "You choose the \"Allow remixes\" switch when publishing; it is off by default." },
                    { TR: "İzin yoksa oyun yalnızca oynanır, kopyalanamaz.", EN: "Without permission a game can only be played, not copied." },
                    { TR: "Remiksin sayfasında asıl oyuna ve yapımcısına bağlantı görünür.", EN: "A remix's page links back to the original game and its maker." },
                    { TR: "Kendi oyununu her zaman remiksleyebilirsin. İzni sonradan kapatırsan önceden yapılmış remiksler silinmez.", EN: "You can always remix your own game. Turning permission off later doesn't delete remixes made before." },
                ],
            },
            { type: "tip", title: { TR: "Zanaatkâr onuru", EN: "Crafter's honour" }, text: { TR: "Remiks yaparken asıl yapımcıyı an ve oyunu kendi fikirlerinle geliştir.", EN: "When you remix, credit the original maker and improve the game with your own ideas." } },
            { type: "link", href: "/arcade", label: { TR: "Arcade'i aç", EN: "Open the Arcade" } },
        ],
    },

    // ------------------------------------------------------------------ Hanogt News
    {
        chapter: "news",
        title: { TR: "Hanogt News nedir?", EN: "What is Hanogt News?" },
        blocks: [
            { type: "p", text: { TR: "Yapay zeka, yazılım, oyun, uygulama, bilim ve finans dünyasından güncel haberlerin tek akışta toplandığı canlı bir bölüm.", EN: "A live section gathering the latest from AI, software, games, apps, science and finance in one stream." } },
            { type: "item", icon: "🔴", name: { TR: "Canlı nokta", EN: "Live dot" }, text: { TR: "Menüdeki kırmızı nokta: akış kendiliğinden yenilenir.", EN: "The red dot in the menu: the feed refreshes itself." } },
            { type: "item", icon: "🔗", name: { TR: "Orijinal kaynak", EN: "Original source" }, text: { TR: "Her kart haberin yayıncısına bağlantı verir; haberin tamamı orada okunur.", EN: "Every card links to the publisher, where the full story is read." } },
        ],
    },
    {
        chapter: "news",
        title: { TR: "Haberler nereden gelir?", EN: "Where do stories come from?" },
        blocks: [
            { type: "p", text: { TR: "Sunucumuz 40'ı aşkın yayıncının herkese açık RSS/Atom akışlarını okur: OpenAI, Google AI, Hugging Face, TechCrunch, The Verge, GitHub Blog, IGN, NASA, Webtekno, AA, Bloomberg HT, CNBC ve dahası.", EN: "Our server reads the public RSS/Atom feeds of 40+ publishers: OpenAI, Google AI, Hugging Face, TechCrunch, The Verge, GitHub Blog, IGN, NASA, Webtekno, AA, Bloomberg HT, CNBC and more." } },
            {
                type: "list",
                items: [
                    { TR: "Yalnızca başlık, kısa özet, görsel bağlantısı ve tarih alınır.", EN: "Only the headline, a short excerpt, the image link and the date are taken." },
                    { TR: "HTML temizlenir, düz metne çevrilir.", EN: "HTML is stripped to plain text." },
                    { TR: "Aynı haber iki kaynaktan gelirse bir kez gösterilir.", EN: "A story from two sources is shown once." },
                    { TR: "Canlı akışta son 21 günün en yeni 240 haberi durur; daha eskileri arşivde saklanır ve \"Daha eski haberleri yükle\" ile okunur.", EN: "The live feed holds the newest 240 stories of the last 21 days; older ones are kept in the archive and read with \"Load older stories\"." },
                ],
            },
        ],
    },
    {
        chapter: "news",
        title: { TR: "Ne sıklıkla yenilenir?", EN: "How often does it refresh?" },
        blocks: [
            {
                type: "steps",
                items: [
                    { TR: "Sunucu akışları en çok 3 dakikada bir toplar; her kaynağa 7 saniye tanınır.", EN: "The server collects feeds at most every 3 minutes, giving each source 7 seconds." },
                    { TR: "Sayfa açıkken 75 saniyede bir kontrol edilir.", EN: "While the page is open it checks every 75 seconds." },
                    { TR: "Yeni haberler \"YENİ\" rozeti ve animasyonla en üste düşer.", EN: "New stories drop in at the top with a \"NEW\" badge and animation." },
                    { TR: "Aşağıdaysan \"↑ yeni haber\" düğmesi çıkar; sekme arka plandayken yenileme durur.", EN: "If you scrolled down, a \"↑ new stories\" button appears; refreshing pauses in background tabs." },
                ],
            },
            { type: "tip", title: { TR: "Dayanıklılık büyüsü", EN: "Resilience enchantment" }, text: { TR: "Bir kaynak çökerse diğerleri çalışmaya devam eder. Hepsi düşerse son kaydedilen akış gösterilir.", EN: "If one source fails the rest keep working. If all fail, the last saved feed is shown." } },
        ],
    },
    {
        chapter: "news",
        title: { TR: "Filtreler ve araçlar", EN: "Filters & tools" },
        blocks: [
            { type: "item", icon: "🏷️", name: { TR: "Kategoriler", EN: "Categories" }, text: { TR: "Yapay Zeka, Yazılım, Oyun, Uygulama & Teknoloji, Bilim & Uzay, Finans & Ekonomi.", EN: "AI, Software, Games, Apps & Tech, Science & Space, Finance & Economy." } },
            { type: "item", icon: "🔎", name: { TR: "Dil ve arama", EN: "Language & search" }, text: { TR: "Hepsi / TR / EN; aramak için \"/\" tuşuna bas.", EN: "All / TR / EN; press \"/\" to search." } },
            { type: "item", icon: "🔥", name: { TR: "Gündem konuları", EN: "Trending topics" }, text: { TR: "Başlıklarda en sık geçen kelimelerden otomatik hesaplanır.", EN: "Computed automatically from the most frequent words in headlines." } },
            { type: "item", icon: "🔖", name: { TR: "Sonra oku", EN: "Read later" }, text: { TR: "Kaydettiklerin yalnızca bu cihazda saklanır.", EN: "Saved stories stay on this device only." } },
            { type: "item", icon: "🟢", name: { TR: "Kaynak durumu", EN: "Source status" }, text: { TR: "Yeşil nokta: kaynağa şu an ulaşılabiliyor.", EN: "Green dot: the source is reachable right now." } },
        ],
    },
    {
        chapter: "news",
        title: { TR: "Piyasa bandı", EN: "The market strip" },
        blocks: [
            { type: "p", text: { TR: "\"Tümü\" ve Finans kategorilerinin üstündeki bant dolar, euro ve sterlin kurlarını, gram ve ons altını, BIST 100, S&P 500 ve Bitcoin'i gösterir. Finans kategorisinde büyük hâliyle açılır.", EN: "The strip above the \"All\" and Finance categories shows the dollar, euro and pound rates, gram and ounce gold, BIST 100, S&P 500 and Bitcoin. In the Finance category it opens in its large form." } },
            {
                type: "list",
                items: [
                    { TR: "Rakamlar yalnızca veri sağlayıcılarından okunur; hiçbir değer tahmin edilmez, eksik veri gösterilmez.", EN: "Figures are only read from data providers; nothing is estimated, and missing data is left out." },
                    { TR: "Her değerin kaynağı ve saati yazılır; bant 5 dakikada bir yenilenir.", EN: "Every value shows its source and time; the strip refreshes every 5 minutes." },
                ],
            },
            { type: "tip", title: { TR: "Tüccar uyarısı", EN: "Trader's warning" }, text: { TR: "Bant bilgi amaçlıdır, yatırım tavsiyesi değildir.", EN: "The strip is for information only; it is not investment advice." } },
        ],
    },
    {
        chapter: "news",
        title: { TR: "Yorumlar", EN: "Comments" },
        blocks: [
            {
                type: "list",
                items: [
                    { TR: "Giriş yapan herkes 💬 simgesiyle yorum yazabilir (2–1000 karakter).", EN: "Anyone signed in can comment via 💬 (2–1000 characters)." },
                    { TR: "Dakikada en fazla 8 yorum, yorum başına en fazla 2 bağlantı.", EN: "At most 8 comments a minute and 2 links per comment." },
                    { TR: "Hakaret, spam ve kişisel veri (telefon, e-posta, T.C. kimlik, kart, IBAN) otomatik engellenir.", EN: "Insults, spam and personal data (phone, e-mail, national ID, card, IBAN) are blocked automatically." },
                    { TR: "Kendi yorumunu silebilirsin; yorumlar herkese açıktır.", EN: "You can delete your own comments; comments are public." },
                    { TR: "Haber akıştan düşünce yeni yoruma kapanır.", EN: "Once a story leaves the feed it closes to new comments." },
                ],
            },
        ],
    },
    {
        chapter: "news",
        title: { TR: "Yapay zeka sıralamaları", EN: "AI leaderboards" },
        blocks: [
            { type: "item", icon: "⚔️", name: { TR: "Topluluk Arenası", EN: "Community Arena" }, text: { TR: "Kategori seç (Kod, Sohbet, Yaratıcı yazı, Türkçe), iki asistanı kapıştır, kazananı ya da beraberliği seç. Puanlar yalnızca oylardan Elo ile (K=24, başlangıç 1000) hesaplanır.", EN: "Pick a category (Coding, Chat, Creative, Turkish), pit two assistants, choose the winner or a tie. Ratings come only from votes via Elo (K=24, start 1000)." } },
            { type: "item", icon: "📡", name: { TR: "Dış kaynaklar", EN: "External sources" }, text: { TR: "OpenRouter kataloğuna eklenen en yeni modeller ve yapılandırılmışsa benchmark endeksleri; kaynak ve güncelleme zamanı her zaman yazılır.", EN: "The newest models on the OpenRouter catalog and, when configured, benchmark indexes; the source and update time are always shown." } },
            { type: "tip", title: { TR: "Dürüstlük yemini", EN: "Oath of honesty" }, text: { TR: "Uydurma puan yok. Aynı ikiliye günde bir oy, saatte en çok 30 oy. Arena resmi bir benchmark değildir.", EN: "No made-up scores. One vote per pair per day, 30 votes an hour at most. The arena is not an official benchmark." } },
        ],
    },

    // ------------------------------------------------------------------ Hanogt AI
    {
        chapter: "ai",
        title: { TR: "Hanogt AI ile tanış", EN: "Meet Hanogt AI" },
        blocks: [
            { type: "p", text: { TR: "Hanogt AI; kod, oyun geliştirme, güvenlik ve site hakkındaki sorularını yanıtlar. /ai sayfasında tam ekran sohbet eder ya da her sayfadaki mor ışıltı simgesiyle yan panelde açarsın; ikisi aynı sohbetleri paylaşır.", EN: "Hanogt AI answers your questions about code, game development, security and the site. Chat full screen on the /ai page or open the side panel with the purple sparkle on any page; both share the same conversations." } },
            { type: "item", icon: "🧠", name: { TR: "İki katman", EN: "Two layers" }, text: { TR: "Giriş yaptığında sunucudaki büyük dil modeli yanıtlar. Model yoksa ya da sınır dolarsa cihazında çalışan Hanogt AI Çekirdeği devreye girer.", EN: "When you're signed in, the large language model on the server answers. Without it, or once a limit is reached, the Hanogt AI Core on your device takes over." } },
            { type: "item", icon: "🎛️", name: { TR: "Yanıt modları", EN: "Answer modes" }, text: { TR: "Genel, Kod ve Güvenlik. Her mod kendi örnek sorularıyla gelir.", EN: "General, Code and Security. Each mode comes with its own sample questions." } },
            { type: "item", icon: "🗂️", name: { TR: "Sohbetler", EN: "Conversations" }, text: { TR: "Kenar çubuğunda ara, yeniden adlandır, sil. Sohbetlerin yalnızca bu tarayıcıda saklanır.", EN: "Search, rename and delete them in the sidebar. Your conversations are stored in this browser only." } },
            { type: "link", href: "/ai", label: { TR: "Hanogt AI'ı aç", EN: "Open Hanogt AI" } },
        ],
    },
    {
        chapter: "ai",
        title: { TR: "Kod ve önizleme", EN: "Code & preview" },
        blocks: [
            {
                type: "list",
                items: [
                    { TR: "Yazdığı kod sağdaki panelde açılır: kopyala ya da \"Editörde aç\" ile Kod Editörü'ne gönder.", EN: "The code it writes opens in the panel on the right: copy it or send it to the Code Editor with \"Open in editor\"." },
                    { TR: "Web sayfalarını Önizleme sekmesinde dene; sayfa ağ erişimi olmayan korumalı bir çerçevede çalışır.", EN: "Try web pages in the Preview tab; the page runs in a protected frame without network access." },
                    { TR: "Kod dosyası ekle (en fazla 200 KB) ya da editörde açık dosyayı soruna ekle.", EN: "Attach a code file (up to 200 KB) or add the file open in the editor to your question." },
                ],
            },
            { type: "keys", items: [{ keys: "Enter", text: { TR: "Gönder", EN: "Send" } }, { keys: "Shift + Enter", text: { TR: "Yeni satır", EN: "New line" } }] },
        ],
    },
    {
        chapter: "ai",
        title: { TR: "Ajan modu", EN: "Agent mode" },
        blocks: [
            { type: "p", text: { TR: "Ajan modunda Hanogt AI izin verdiğin işleri senin yerine yapar: grup kurar, profilini özetler, kodu editörde açar, şablondan oyun projesi oluşturur, sayfa açar.", EN: "In Agent mode Hanogt AI does the things you allow for you: it creates groups, summarises your profile, opens code in the editor, creates game projects from templates and opens pages." } },
            {
                type: "list",
                items: [
                    { TR: "Kapalı: yalnızca nasıl yapacağını anlatır.", EN: "Off: it only explains how to do it." },
                    { TR: "Her seferinde sor (varsayılan): her işlemden önce bir onay kartı gösterir.", EN: "Ask every time (default): it shows a confirmation card before every action." },
                    { TR: "Güvenli işlemlerde otomatik: sayfa ve editör açmayı sormadan yapar, oluşturmadan önce yine sorar.", EN: "Automatic for safe actions: it opens pages and the editor without asking, and still asks before creating anything." },
                ],
            },
            { type: "tip", title: { TR: "Asla dokunmadıkları", EN: "Things it never touches" }, text: { TR: "Silme, parola, iki adımlı doğrulama, yönetici işlemleri ve başkalarına mesaj göndermek hiçbir modda yapılmaz.", EN: "Deleting, passwords, two-step verification, admin actions and messaging other people are never done in any mode." } },
        ],
    },
    {
        chapter: "ai",
        title: { TR: "Sınırlar", EN: "Limits" },
        blocks: [
            {
                type: "list",
                items: [
                    { TR: "Hanogt AI'ı kullanmak için giriş yapman gerekir.", EN: "You need to sign in to use Hanogt AI." },
                    { TR: "Ücretsiz planda {days} günde {count}, dakikada {minute} mesaj. Pencere ilk mesajınla başlar.", EN: "{count} messages every {days} days and {minute} a minute on the Free plan. The window starts with your first message.", vars: { count: PLAN_AI_LIMITS.free.perWindow, days: PLAN_AI_LIMITS.free.windowDays, minute: PLAN_AI_LIMITS.free.perMinute } },
                    { TR: "Plus'ta {plusDays} günde {plus}, Pro'da {proDays} günde {pro} mesaj. Geliştirici API'si de aynı haktan düşer.", EN: "{plus} messages every {plusDays} days on Plus and {pro} every {proDays} days on Pro. The developer API uses the same allowance.", vars: { plus: PLAN_AI_LIMITS.plus.perWindow, plusDays: PLAN_AI_LIMITS.plus.windowDays, pro: PLAN_AI_LIMITS.pro.perWindow, proDays: PLAN_AI_LIMITS.pro.windowDays } },
                    { TR: "Model hiç yanıt veremezse mesaj hakkın geri verilir.", EN: "If the model can't answer at all, the message is given back." },
                    { TR: "Sınır dolunca yanıtı cihazındaki Hanogt AI Çekirdeği verir.", EN: "Once you hit the limit, the Hanogt AI Core on your device answers." },
                    { TR: "Kalan hakkını Planlar sayfasında görürsün.", EN: "You can see what's left on the Plans page." },
                ],
            },
            { type: "tip", title: { TR: "Bilge sözü", EN: "Words of the wise" }, text: { TR: "Hanogt AI hata yapabilir; önemli bilgileri doğrula ve gizli bilgi paylaşma.", EN: "Hanogt AI can make mistakes; double-check important facts and never share secrets." } },
            { type: "link", href: "/plans", label: { TR: "Fiyatlandırma", EN: "Pricing" } },
        ],
    },

    // ------------------------------------------------------------------ Hanogt Social ve Media
    {
        chapter: "social",
        title: { TR: "Hanogt Social", EN: "Hanogt Social" },
        blocks: [
            { type: "p", text: { TR: "Arkadaşlar, direkt mesajlar ve gruplar Discord benzeri tek bir yerde: solda grup rayı, yanında sohbetler, sağda üye listesi.", EN: "Friends, direct messages and groups in one Discord-like place: the group rail on the left, chats next to it and the member list on the right." } },
            { type: "item", icon: "🤝", name: { TR: "Arkadaşlar", EN: "Friends" }, text: { TR: "TakmaAd#1234 biçiminde ekle; Çevrimiçi, Tümü, Bekleyen ve Engellenen sekmeleri.", EN: "Add people as Nickname#1234; Online, All, Pending and Blocked tabs." } },
            { type: "item", icon: "✉️", name: { TR: "Direkt mesajlar", EN: "Direct messages" }, text: { TR: "Metin, çıkartma ve 60 saniyelik sesli mesaj; yanıtla, düzenle, sil. Yalnızca arkadaşlarınla yazışırsın.", EN: "Text, stickers and 60-second voice messages; reply, edit, delete. You only chat with your friends." } },
            { type: "item", icon: "⚡", name: { TR: "Hızlı geçiş", EN: "Quick switcher" }, text: { TR: "Ctrl/⌘+K ile bir sohbete ya da gruba atla.", EN: "Jump to a chat or group with Ctrl/⌘+K." } },
            { type: "link", href: "/social", label: { TR: "Hanogt Social'ı aç", EN: "Open Hanogt Social" } },
        ],
    },
    {
        chapter: "social",
        title: { TR: "Gruplar", EN: "Groups" },
        blocks: [
            {
                type: "steps",
                items: [
                    { TR: "Soldaki rayda \"Grup oluştur\"a bas ve bir şablon seç: Boş grup, Çalışma grubu, Game jam, Açık kaynak proje, Sınıf ya da Hackathon takımı.", EN: "Press \"Create group\" on the left rail and pick a template: Blank group, Study group, Game jam, Open-source project, Classroom or Hackathon team." },
                    { TR: "Arkadaşlarını davet et ya da süreli, kullanım sınırlı bir davet bağlantısı paylaş.", EN: "Invite your friends or share an expiring, use-limited invite link." },
                    { TR: "Kanallarda yazış; Dosyalar'da ortak dosyaları birlikte düzenle ve editörde aç.", EN: "Chat in channels; edit shared files together under Files and open them in the editor." },
                ],
            },
            { type: "p", text: { TR: "Roller: sahip, yönetici, moderatör ve üye. Grup başına {files} dosya. Grubun büyüklüğü sahibinin planına göredir: Ücretsiz {free}, Plus {plus}, Pro {pro} üye.", EN: "Roles: owner, admin, moderator and member. {files} files per group. A group's size follows its owner's plan: {free} members on Free, {plus} on Plus, {pro} on Pro.", vars: { files: GROUP_LIMITS.filesMax, free: PLAN_GROUP_FEATURES.free.members, plus: PLAN_GROUP_FEATURES.plus.members, pro: PLAN_GROUP_FEATURES.pro.members } } },
        ],
    },
    {
        chapter: "social",
        title: { TR: "Durum noktaları", EN: "Status dots" },
        blocks: [
            { type: "item", icon: "🟢", name: STATUS_PREFERENCE_COPY.auto.label, text: STATUS_PREFERENCE_COPY.auto.hint },
            { type: "item", icon: "🌙", name: STATUS_PREFERENCE_COPY.idle.label, text: STATUS_PREFERENCE_COPY.idle.hint },
            { type: "item", icon: "⛔", name: STATUS_PREFERENCE_COPY.dnd.label, text: STATUS_PREFERENCE_COPY.dnd.hint },
            { type: "item", icon: "⚪", name: STATUS_PREFERENCE_COPY.invisible.label, text: STATUS_PREFERENCE_COPY.invisible.hint },
            { type: "p", text: { TR: "Durumunu ve özel durum mesajını profil menünden, Social'daki kullanıcı panelinden ya da Hesap Ayarları → Durum'dan değiştir.", EN: "Change your status and custom status message from the profile menu, the user panel in Social or Account Settings → Status." } },
        ],
    },
    {
        chapter: "social",
        title: { TR: "Sesli arama", EN: "Voice calls" },
        blocks: [
            {
                type: "list",
                items: [
                    { TR: "Arkadaşını direkt mesaj ekranından, grup üyelerini grup sohbetinden ara.", EN: "Call a friend from the direct message screen and group members from the group chat." },
                    { TR: "Tarayıcı mikrofon izni ister; adres çubuğundaki kilit simgesinden kontrol edebilirsin.", EN: "The browser asks for microphone access; you can check it from the lock icon in the address bar." },
                ],
            },
            { type: "item", icon: "📞", name: { TR: "Sesli arama", EN: "Voice calls" }, text: { TR: "WebRTC ile eşten eşe; Hanogt tarafından kaydedilmez.", EN: "Peer-to-peer via WebRTC; never recorded by Hanogt." } },
        ],
    },
    {
        chapter: "social",
        title: { TR: "Hanogt Media", EN: "Hanogt Media" },
        blocks: [
            { type: "item", icon: "📣", name: { TR: "Paylaş", EN: "Share" }, text: { TR: "Kod projelerini başlık, en fazla 6 etiket ve lisansla (MIT, Apache-2.0, GPL-3.0 ya da Tüm hakları saklı) yayınla.", EN: "Publish code projects with a title, up to 6 tags and a license (MIT, Apache-2.0, GPL-3.0 or All rights reserved)." } },
            { type: "item", icon: "🛡️", name: { TR: "Güvenlik ön elemesi", EN: "Security pre-check" }, text: { TR: "Yayınlar taramadan geçer; gizli anahtar içeren kod yayınlanmaz.", EN: "Posts are scanned first; code containing secret keys is not published." } },
            { type: "item", icon: "❤️", name: { TR: "Keşfet", EN: "Discover" }, text: { TR: "Beğen, yorumla, ZIP olarak indir, editörde aç; uygunsuz içeriği bildir.", EN: "Like, comment, download as ZIP, open in the editor; report inappropriate content." } },
        ],
    },

    // ------------------------------------------------------------------ Güvenlik
    {
        chapter: "security",
        title: { TR: "Güvenlik Merkezi", EN: "Security Center" },
        blocks: [
            { type: "p", text: { TR: "Menüdeki Güvenlik sayfası, cihazından hiçbir şey göndermeden çalışan araçlar sunar:", EN: "The Security page offers tools that run without sending anything off your device:" } },
            { type: "item", icon: "🧪", name: { TR: "Kod Danışmanı", EN: "Code Advisor" }, text: { TR: "Kodunu yapıştır: sızmış anahtarları, enjeksiyon risklerini ve zayıf kriptoyu satır satır gösterir.", EN: "Paste code: it points out leaked keys, injection risks and weak crypto line by line." } },
            { type: "item", icon: "🔐", name: { TR: "Parola Laboratuvarı", EN: "Password Lab" }, text: { TR: "Kırılma süresini tahmin eder, k-anonimlikle sızıntılarda arar, güçlü parola üretir.", EN: "Estimates cracking time, checks breaches with k-anonymity and generates strong passwords." } },
            { type: "item", icon: "🔗", name: { TR: "Bağlantı Kontrolü", EN: "Link Check" }, text: { TR: "Taklit alan adları ve şüpheli bağlantı işaretlerini bulur.", EN: "Spots lookalike domains and suspicious link signs." } },
        ],
    },
    {
        chapter: "security",
        title: { TR: "Kalkanın katmanları", EN: "Layers of the shield" },
        blocks: [
            {
                type: "list",
                items: [
                    { TR: "Kod çalıştırma, yayınlama ve paylaşım istekleri sunucuda denetlenir.", EN: "Code runs, publishing and posts are checked on the server." },
                    { TR: "Hız sınırları kötüye kullanımı yavaşlatır.", EN: "Rate limits slow down abuse." },
                    { TR: "Otomatik bir eşleşme hesabını kalıcı olarak kapatmaz; itiraz yolu açıktır.", EN: "An automated match never permanently closes an account; you can appeal." },
                    { TR: "Açık bulursan destek talebinde \"Güvenlik Açığı\" kategorisini seç; gerçek parola ya da anahtar ekleme.", EN: "Found a flaw? Choose the \"Security vulnerability\" category in a support ticket; never include real passwords or keys." },
                ],
            },
            { type: "link", href: "/security", label: { TR: "Güvenlik Merkezi'ni aç", EN: "Open the Security Center" } },
        ],
    },
    {
        chapter: "security",
        title: { TR: "İki adımlı doğrulama", EN: "Two-step verification" },
        blocks: [
            {
                type: "steps",
                items: [
                    { TR: "Hesap Ayarları → Gizlilik ve Güvenlik → İki adımlı doğrulama.", EN: "Account Settings → Privacy & Security → Two-step verification." },
                    { TR: "QR kodu Google Authenticator, Microsoft Authenticator, Aegis ya da 1Password ile tara.", EN: "Scan the QR code with Google Authenticator, Microsoft Authenticator, Aegis or 1Password." },
                    { TR: "Uygulamadaki 6 haneli kodu gir.", EN: "Enter the 6-digit code from the app." },
                    { TR: "Kurtarma kodlarını indir ve güvenli bir yere sakla; her biri yalnızca bir kez çalışır.", EN: "Download the recovery codes and keep them somewhere safe; each one works only once." },
                ],
            },
            { type: "tip", title: { TR: "Çift kilit", EN: "Double lock" }, text: { TR: "E-posta ve parolayla giriş yapan hesaplar içindir. Google ile giriyorsan Google hesabının iki adımlı doğrulamasını aç.", EN: "This is for accounts that sign in with an e-mail and password. If you sign in with Google, turn on two-step verification for your Google account." } },
        ],
    },

    // ------------------------------------------------------------------ Hesap & Gizlilik
    {
        chapter: "account",
        title: { TR: "Hesabın senin", EN: "Your account is yours" },
        blocks: [
            { type: "item", icon: "⚙️", name: { TR: "Hesap Ayarları", EN: "Account Settings" }, text: { TR: "Hesabım, Profil, Durum, Gizlilik ve Güvenlik, Bildirimler, Mesajlaşma, Görünüm, Editör ve Veri bölümleri.", EN: "My Account, Profile, Status, Privacy & Security, Notifications, Messaging, Appearance, Editor and Data sections." } },
            { type: "item", icon: "📥", name: { TR: "Verilerimi indir", EN: "Download my data" }, text: { TR: "Hesabına bağlı verilerin bir kopyası.", EN: "A copy of the data tied to your account." } },
            { type: "item", icon: "🗑️", name: { TR: "Hesabı sil", EN: "Delete account" }, text: { TR: "Projeler, oyunlar, yorumlar ve mesajlar kalıcı olarak silinir.", EN: "Projects, games, comments and messages are deleted permanently." } },
            { type: "p", text: { TR: "Ayrıntılar Gizlilik Politikası, Kullanım Şartları ve KVKK Aydınlatma Metni'nde.", EN: "Details are in the Privacy Policy, Terms of Use and KVKK Notice." } },
            { type: "link", href: "/account-settings", label: { TR: "Hesap Ayarları", EN: "Account Settings" } },
        ],
    },
    {
        chapter: "account",
        title: { TR: "Destek ve geri bildirim", EN: "Support & feedback" },
        blocks: [
            { type: "item", icon: "💡", name: { TR: "Herkese açık pano", EN: "Public board" }, text: { TR: "Öneri ve soru paylaş, diğerlerinin önerilerini beğen ve yorumla.", EN: "Share ideas and questions, like and comment on other people's ideas." } },
            { type: "item", icon: "🎫", name: { TR: "Destek talebi", EN: "Support ticket" }, text: { TR: "Şikayet, İstek, Güvenlik Açığı, Ban Kaldırma İsteği, Soru ya da Geri Bildirim. Talebini yalnızca Hanogt ekibi görür.", EN: "Complaint, Request, Security vulnerability, Unban request, Question or Feedback. Only the Hanogt team sees your ticket." } },
            { type: "item", icon: "📬", name: { TR: "Talep durumu", EN: "Ticket status" }, text: { TR: "Açık → İnceleniyor → Yanıtlandı → Çözüldü ya da Kapatıldı. Yanıt gelince zil simgesine bildirim düşer.", EN: "Open → In review → Answered → Resolved or Closed. A notification lands on the bell when the team replies." } },
            { type: "link", href: "/feedback", label: { TR: "Geri Bildirim ve SSS", EN: "Feedback & FAQ" } },
        ],
    },
    {
        chapter: "account",
        title: { TR: "Planlar", EN: "Plans" },
        blocks: [
            { type: "p", text: { TR: "Hanogt Codev ücretsizdir. Daha fazlasını isteyenler için Plus ve Pro var; ödemeleri Kayıtlı Satıcımız Paddle alır, kart bilgin bize ulaşmaz.", EN: "Hanogt Codev is free. Plus and Pro are there for people who want more; Paddle, our Merchant of Record, takes the payments and your card details never reach us." } },
            {
                type: "list",
                items: [
                    { TR: "Ücretsiz: {days} günde {ai} Hanogt AI mesajı, {code} kod ve {game} oyun projesi, {groups} grup.", EN: "Free: {ai} Hanogt AI messages every {days} days, {code} code and {game} game projects, {groups} groups.", vars: { ai: PLAN_AI_LIMITS.free.perWindow, days: PLAN_AI_LIMITS.free.windowDays, code: PLAN_PROJECT_LIMITS.free.code ?? 0, game: PLAN_PROJECT_LIMITS.free.game ?? 0, groups: PLAN_GROUP_LIMITS.free ?? 0 } },
                    { TR: "Plus (aylık {price} $): {days} günde {ai} mesaj, {code} + {game} proje, {groups} grup, kendi API anahtarınla {connections} yapay zekâ bağlantısı, destekte öncelik.", EN: "Plus (${price} a month): {ai} messages every {days} days, {code} + {game} projects, {groups} groups, {connections} AI connections with your own API keys, priority support.", vars: { price: LIST_PRICES.plus.monthly, ai: PLAN_AI_LIMITS.plus.perWindow, days: PLAN_AI_LIMITS.plus.windowDays, code: PLAN_PROJECT_LIMITS.plus.code ?? 0, game: PLAN_PROJECT_LIMITS.plus.game ?? 0, groups: PLAN_GROUP_LIMITS.plus ?? 0, connections: PLAN_AI_CONNECTIONS.plus } },
                    { TR: "Pro (aylık {price} $): {days} günde {ai} mesaj, sınırsız proje ve grup, {connections} yapay zekâ bağlantısı, destekte öncelik.", EN: "Pro (${price} a month): {ai} messages every {days} days, unlimited projects and groups, {connections} AI connections, priority support.", vars: { price: LIST_PRICES.pro.monthly, ai: PLAN_AI_LIMITS.pro.perWindow, days: PLAN_AI_LIMITS.pro.windowDays, connections: PLAN_AI_CONNECTIONS.pro } },
                ],
            },
            { type: "p", text: { TR: "Yıllık ödemede 10 ayın ücreti alınır. Aboneliğini Planlar sayfasındaki \"Aboneliği yönet\"ten değiştirebilir ya da iptal edebilirsin; ilk ödemeden sonraki 14 gün içinde iade isteyebilirsin.", EN: "Yearly billing costs 10 months. Change or cancel your subscription with \"Manage subscription\" on the Plans page; you can ask for a refund within 14 days of the first payment." } },
            { type: "link", href: "/plans", label: { TR: "Fiyatlandırma", EN: "Pricing" } },
            { type: "link", href: "/refund-policy", label: { TR: "İade Politikası", EN: "Refund Policy" } },
        ],
    },

    // ------------------------------------------------------------------ Kısayollar
    {
        chapter: "tips",
        title: { TR: "Kısayol büyüleri", EN: "Shortcut spells" },
        blocks: [
            {
                type: "keys",
                items: [
                    { keys: "← →", text: { TR: "Bu kitapta sayfa çevir", EN: "Turn pages in this book" } },
                    { keys: "1 – 9, 0", text: { TR: "Kitapta bölüme atla", EN: "Jump to a chapter" } },
                    { keys: "/", text: { TR: "Haberlerde ara", EN: "Search the news" } },
                    { keys: "Ctrl + K", text: { TR: "Editörde komut paleti, Social'da hızlı geçiş", EN: "Command palette in the editor, quick switcher in Social" } },
                    { keys: "Ctrl + Enter", text: { TR: "Kodu çalıştır", EN: "Run code" } },
                    { keys: "Ctrl + S", text: { TR: "Kaydet", EN: "Save" } },
                    { keys: "Ctrl + F", text: { TR: "Editörde bul", EN: "Find in the editor" } },
                ],
            },
            { type: "p", text: { TR: "Mac'te Ctrl yerine ⌘ kullan.", EN: "On a Mac, use ⌘ instead of Ctrl." } },
        ],
    },
    {
        chapter: "tips",
        title: { TR: "Motor kısayolları", EN: "Engine shortcuts" },
        blocks: [
            {
                type: "keys",
                items: [
                    { keys: "Ctrl + P", text: { TR: "Motorda oynat/durdur", EN: "Play/stop in the engine" } },
                    { keys: "W E R", text: { TR: "Taşı, döndür, ölçekle", EN: "Move, rotate, scale" } },
                    { keys: "Ctrl + D", text: { TR: "Nesneyi çoğalt", EN: "Duplicate object" } },
                    { keys: "Ctrl + C / V", text: { TR: "Kopyala / yapıştır", EN: "Copy / paste" } },
                    { keys: "F / F2", text: { TR: "Odakla / yeniden adlandır", EN: "Focus / rename" } },
                    { keys: "Ctrl + Z / Y", text: { TR: "Geri al / yinele", EN: "Undo / redo" } },
                    { keys: "Esc", text: { TR: "Karo boyamayı bitir, seçimi kaldır", EN: "Stop tile painting, clear the selection" } },
                ],
            },
        ],
    },
    {
        chapter: "tips",
        title: { TR: "Son sayfa", EN: "The last page" },
        blocks: [
            { type: "p", text: { TR: "Ana sayfadaki kod penceresinin altında küçük bir koşucu oyunu saklı: tıkla ya da Space'e bas ve coinleri topla.", EN: "Below the code window on the home page hides a tiny runner game: click or press Space and collect coins." } },
            { type: "p", text: { TR: "Kitabın sonuna geldin. Artık bir Hanogt ustasısın! Bir sorun olursa Geri Bildirim sayfası her zaman açık.", EN: "You reached the end of the book. You are now a Hanogt master! If anything goes wrong, the Feedback page is always open." } },
            { type: "link", href: "/feedback", label: { TR: "Geri Bildirim ve SSS", EN: "Feedback & FAQ" } },
        ],
    },
];

export function chapterStartPage(id: ChapterId) {
    return Math.max(0, PAGES.findIndex((page) => page.chapter === id));
}

/** Plain text of a block for the in-book search (TR and EN). */
export function blockCopies(block: Block): Copy[] {
    switch (block.type) {
        case "p": return [block.text];
        case "list":
        case "steps": return block.items;
        case "tip": return [block.title, block.text];
        case "item": return [block.name, block.text];
        case "keys": return block.items.map((item) => item.text);
        case "link": return [block.label];
        default: return [];
    }
}
