import type { Copy } from "@/lib/i18n";
import { LANGUAGE_STATS } from "@/lib/runtimes/languages";

export type ChapterId = "start" | "editor" | "engine" | "arcade" | "news" | "media" | "security" | "account" | "tips";

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

export const CHAPTERS: Chapter[] = [
    { id: "start", icon: "🧭", title: { TR: "Başlangıç", EN: "Getting started" }, item: { TR: "Pusula", EN: "Compass" }, color: "#e11d48" },
    { id: "editor", icon: "⌨️", title: { TR: "Kod Editörü", EN: "Code Editor" }, item: { TR: "Kodlama Masası", EN: "Coding Table" }, color: "#2563eb" },
    { id: "engine", icon: "🧱", title: { TR: "Hanogt Engine", EN: "Hanogt Engine" }, item: { TR: "İnşa Bloğu", EN: "Building Block" }, color: "#7c3aed" },
    { id: "arcade", icon: "🕹️", title: { TR: "Arcade", EN: "Arcade" }, item: { TR: "Oyun Konsolu", EN: "Game Console" }, color: "#d97706" },
    { id: "news", icon: "📰", title: { TR: "Hanogt News", EN: "Hanogt News" }, item: { TR: "Gazete", EN: "Newspaper" }, color: "#dc2626" },
    { id: "media", icon: "💬", title: { TR: "Media ve Gruplar", EN: "Media & Groups" }, item: { TR: "Haberci Güvercin", EN: "Messenger Pigeon" }, color: "#0891b2" },
    { id: "security", icon: "🛡️", title: { TR: "Güvenlik", EN: "Security" }, item: { TR: "Büyülü Kalkan", EN: "Enchanted Shield" }, color: "#059669" },
    { id: "account", icon: "🗝️", title: { TR: "Hesap ve Gizlilik", EN: "Account & Privacy" }, item: { TR: "Anahtar", EN: "Key" }, color: "#ca8a04" },
    { id: "tips", icon: "💎", title: { TR: "Kısayollar ve Sırlar", EN: "Shortcuts & Secrets" }, item: { TR: "Elmas", EN: "Diamond" }, color: "#0ea5e9" },
];

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
            { type: "item", icon: "🧭", name: { TR: "Üst menü", EN: "Top menu" }, text: { TR: "Hanogt AI, Haberler, Arcade, Oyun Motoru, Media ve Kılavuz. Giriş yapınca Panel de gelir.", EN: "Hanogt AI, News, Arcade, Game Engine, Media and Guide. Dashboard appears once you sign in." } },
            { type: "item", icon: "✨", name: { TR: "Yenilikler", EN: "What's new" }, text: { TR: "Son güncellemelerin günlüğü.", EN: "The log of recent updates." } },
            { type: "item", icon: "✨", name: { TR: "Hanogt AI", EN: "Hanogt AI" }, text: { TR: "Mor ışıltı simgesi: kod, oyun motoru, hata ayıklama, güvenlik ve site hakkında sorularını yanıtlayan yapay zeka asistanı.", EN: "The purple sparkle icon: the AI assistant that answers questions about code, the game engine, debugging, security and the site." } },
            { type: "item", icon: "🌐", name: { TR: "Dil ve tema", EN: "Language & theme" }, text: { TR: "Sağdan sola Arapça, Farsça, İbranice ve Urduca dahil 50 arayüz dili, açık ve koyu tema. Telefonda hepsi ☰ menüde.", EN: "50 interface languages including right-to-left Arabic, Persian, Hebrew and Urdu, light and dark themes. On phones everything lives in the ☰ menu." } },
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
            { type: "p", text: { TR: "Yeşil ▶ RUN düğmesine bas ya da Ctrl+Enter kullan. Çıktı ve hatalar alttaki panelde görünür.", EN: "Press the green ▶ RUN button or use Ctrl+Enter. Output and errors appear in the panel below." } },
            { type: "tip", title: { TR: "Nasıl çalışır?", EN: "How it works" }, text: { TR: "Kodun, yöneticinin yapılandırdığı izole bir çalıştırıcıda süre, bellek ve ağ sınırlarıyla çalışır. Çalıştırıcı yoksa özellik güvenli biçimde kapalı kalır; herkese açık yedek servislere düşülmez.", EN: "Code runs in an administrator-configured isolated runner with time, memory and network limits. With no runner the feature stays safely off; it never falls back to public services." } },
            { type: "p", text: { TR: "Her istek sunucuda Hanogt Security denetiminden geçer.", EN: "Every request passes a Hanogt Security check on the server." } },
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
                    { TR: "Çoklu sekme ve dosya adlandırma.", EN: "Multiple tabs and file naming." },
                    { TR: "Yapay zeka asistanı paneli: sor, açıklat, düzelt.", EN: "AI assistant panel: ask, explain, fix." },
                    { TR: "İndir: tek dosya ya da çok sekmede ZIP.", EN: "Download: a single file, or a ZIP for multiple tabs." },
                    { TR: "Ayarlar: yazı tipi, boyut, mini harita, tema ve daha fazlası.", EN: "Settings: font, size, minimap, theme and more." },
                ],
            },
            { type: "keys", items: [{ keys: "Ctrl + S", text: { TR: "Kaydet", EN: "Save" } }, { keys: "Ctrl + Enter", text: { TR: "Çalıştır", EN: "Run" } }] },
        ],
    },

    // ------------------------------------------------------------------ Hanogt Engine
    {
        chapter: "engine",
        title: { TR: "Oyun motoru", EN: "The game engine" },
        blocks: [
            { type: "p", text: { TR: "Hanogt Engine, tarayıcıda çalışan Unity benzeri bir 2D/3D oyun motorudur. Dünyan sahnelerden, sahneler GameObject'lerden, onlar da bileşenlerden oluşur.", EN: "Hanogt Engine is a Unity-like 2D/3D engine in your browser. Your world is made of scenes, scenes of GameObjects, and those of components." } },
            { type: "p", text: { TR: "Oyun Motoru sayfasında bir şablonla başla:", EN: "Start from a template on the Game Engine page:" } },
            {
                type: "list",
                items: [
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
        title: { TR: "Kaydet ve yayınla", EN: "Save & publish" },
        blocks: [
            { type: "p", text: { TR: "Ctrl+S ile kaydet. Giriş yaptıysan proje buluta, yapmadıysan tarayıcına kaydedilir.", EN: "Save with Ctrl+S. Signed in, the project goes to the cloud; otherwise it stays in your browser." } },
            { type: "item", icon: "📄", name: { TR: "HTML olarak dışa aktar", EN: "Export as HTML" }, text: { TR: "Oyunun tek bir dosyada; istediğin yerde çalışır.", EN: "Your game in one file that runs anywhere." } },
            { type: "item", icon: "🚀", name: { TR: "Arcade'de yayınla", EN: "Publish to the Arcade" }, text: { TR: "Başlık ve açıklama yaz; güvenlik kontrolünden sonra herkes oynayabilir.", EN: "Add a title and description; after a security check everyone can play." } },
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
                    { TR: "Remiksle: oyunun kopyasını kendi projene al, değiştir, yeniden yayınla.", EN: "Remix: copy a game into your projects, change it, republish." },
                ],
            },
        ],
    },

    // ------------------------------------------------------------------ Hanogt News
    {
        chapter: "news",
        title: { TR: "Hanogt News nedir?", EN: "What is Hanogt News?" },
        blocks: [
            { type: "p", text: { TR: "Yapay zeka, yazılım, oyun, uygulama ve bilim dünyasından güncel haberlerin tek akışta toplandığı canlı bir bölüm.", EN: "A live section gathering the latest from AI, software, games, apps and science in one stream." } },
            { type: "item", icon: "🔴", name: { TR: "Canlı nokta", EN: "Live dot" }, text: { TR: "Menüdeki kırmızı nokta: akış kendiliğinden yenilenir.", EN: "The red dot in the menu: the feed refreshes itself." } },
            { type: "item", icon: "🔗", name: { TR: "Orijinal kaynak", EN: "Original source" }, text: { TR: "Her kart haberin yayıncısına bağlantı verir; haberin tamamı orada okunur.", EN: "Every card links to the publisher, where the full story is read." } },
        ],
    },
    {
        chapter: "news",
        title: { TR: "Haberler nereden gelir?", EN: "Where do stories come from?" },
        blocks: [
            { type: "p", text: { TR: "Sunucumuz 20'yi aşkın yayıncının herkese açık RSS/Atom akışlarını okur: OpenAI, Google AI, Hugging Face, TechCrunch, The Verge, GitHub Blog, Hacker News, IGN, PC Gamer, NASA, Webtekno, ShiftDelete.Net, DonanımHaber ve dahası.", EN: "Our server reads the public RSS/Atom feeds of 20+ publishers: OpenAI, Google AI, Hugging Face, TechCrunch, The Verge, GitHub Blog, Hacker News, IGN, PC Gamer, NASA, Webtekno, ShiftDelete.Net, DonanımHaber and more." } },
            {
                type: "list",
                items: [
                    { TR: "Yalnızca başlık, kısa özet, görsel bağlantısı ve tarih alınır.", EN: "Only the headline, a short excerpt, the image link and the date are taken." },
                    { TR: "HTML temizlenir, düz metne çevrilir.", EN: "HTML is stripped to plain text." },
                    { TR: "Aynı haber iki kaynaktan gelirse bir kez gösterilir.", EN: "A story from two sources is shown once." },
                    { TR: "Son 21 günün en yeni 180 haberi tutulur.", EN: "The newest 180 stories of the last 21 days are kept." },
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
            { type: "item", icon: "🏷️", name: { TR: "Kategoriler", EN: "Categories" }, text: { TR: "Yapay Zeka, Yazılım, Oyun, Uygulama & Teknoloji, Bilim & Uzay.", EN: "AI, Software, Games, Apps & Tech, Science & Space." } },
            { type: "item", icon: "🔎", name: { TR: "Dil ve arama", EN: "Language & search" }, text: { TR: "Hepsi / TR / EN; aramak için \"/\" tuşuna bas.", EN: "All / TR / EN; press \"/\" to search." } },
            { type: "item", icon: "🔥", name: { TR: "Gündem konuları", EN: "Trending topics" }, text: { TR: "Başlıklarda en sık geçen kelimelerden otomatik hesaplanır.", EN: "Computed automatically from the most frequent words in headlines." } },
            { type: "item", icon: "🔖", name: { TR: "Sonra oku", EN: "Read later" }, text: { TR: "Kaydettiklerin yalnızca bu cihazda saklanır.", EN: "Saved stories stay on this device only." } },
            { type: "item", icon: "🟢", name: { TR: "Kaynak durumu", EN: "Source status" }, text: { TR: "Yeşil nokta: kaynağa şu an ulaşılabiliyor.", EN: "Green dot: the source is reachable right now." } },
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

    // ------------------------------------------------------------------ Media & Gruplar
    {
        chapter: "media",
        title: { TR: "Media, gruplar, mesajlar", EN: "Media, groups, messages" },
        blocks: [
            { type: "item", icon: "📣", name: { TR: "Hanogt Media", EN: "Hanogt Media" }, text: { TR: "Kodunu ve projelerini paylaş; beğen, yorum yap, bildir. Paylaşımlar güvenlik ön elemesinden geçer.", EN: "Share code and projects; like, comment, report. Posts pass a security pre-check." } },
            { type: "item", icon: "👥", name: { TR: "Gruplar", EN: "Groups" }, text: { TR: "Süreli davet bağlantıları, roller ve grup sohbeti.", EN: "Expiring invite links, roles and group chat." } },
            { type: "item", icon: "🤝", name: { TR: "Arkadaşlar", EN: "Friends" }, text: { TR: "İstek gönder, kabul et, çevrimiçi olanları gör.", EN: "Send and accept requests, see who is online." } },
            { type: "item", icon: "📞", name: { TR: "Sesli arama", EN: "Voice calls" }, text: { TR: "WebRTC ile eşten eşe; Hanogt tarafından kaydedilmez.", EN: "Peer-to-peer via WebRTC; never recorded by Hanogt." } },
        ],
    },

    // ------------------------------------------------------------------ Güvenlik
    {
        chapter: "security",
        title: { TR: "Güvenlik Merkezi", EN: "Security Center" },
        blocks: [
            { type: "p", text: { TR: "Menüdeki Güvenlik sayfası, cihazından hiçbir şey göndermeden çalışan araçlar sunar:", EN: "The Security page offers tools that run without sending anything off your device:" } },
            { type: "item", icon: "🧪", name: { TR: "Kod Danışmanı", EN: "Code Advisor" }, text: { TR: "Kodunu yapıştır: sızmış anahtarları, enjeksiyon risklerini ve zayıf kriptoyu satır satır gösterir.", EN: "Paste code: it points out leaked keys, injection risks and weak crypto line by line." } },
            { type: "item", icon: "🔐", name: { TR: "Parola Ölçer", EN: "Password Meter" }, text: { TR: "Parolanın kırılma süresini tahmin eder.", EN: "Estimates how long a password would resist cracking." } },
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
                    { TR: "Açık bulursan Geri Bildirim'den sorumlu biçimde bildir; gerçek parola ya da anahtar ekleme.", EN: "Found a flaw? Report it responsibly via Feedback; never include real passwords or keys." },
                ],
            },
            { type: "link", href: "/security", label: { TR: "Güvenlik Merkezi'ni aç", EN: "Open the Security Center" } },
        ],
    },

    // ------------------------------------------------------------------ Hesap & Gizlilik
    {
        chapter: "account",
        title: { TR: "Hesabın senin", EN: "Your account is yours" },
        blocks: [
            { type: "item", icon: "⚙️", name: { TR: "Hesap Ayarları", EN: "Account Settings" }, text: { TR: "Profil, avatar, takma ad, bildirimler, gizlilik ve editör ayarları.", EN: "Profile, avatar, nickname, notifications, privacy and editor settings." } },
            { type: "item", icon: "📥", name: { TR: "Verilerimi indir", EN: "Download my data" }, text: { TR: "Hesabına bağlı verilerin bir kopyası.", EN: "A copy of the data tied to your account." } },
            { type: "item", icon: "🗑️", name: { TR: "Hesabı sil", EN: "Delete account" }, text: { TR: "Projeler, oyunlar, yorumlar ve mesajlar kalıcı olarak silinir.", EN: "Projects, games, comments and messages are deleted permanently." } },
            { type: "p", text: { TR: "Ayrıntılar Gizlilik Politikası, Kullanım Şartları ve KVKK Aydınlatma Metni'nde.", EN: "Details are in the Privacy Policy, Terms of Use and KVKK Notice." } },
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
                    { keys: "1 – 9", text: { TR: "Kitapta bölüme atla", EN: "Jump to a chapter" } },
                    { keys: "/", text: { TR: "Haberlerde ara", EN: "Search the news" } },
                    { keys: "Ctrl + Enter", text: { TR: "Kodu çalıştır", EN: "Run code" } },
                    { keys: "Ctrl + S", text: { TR: "Kaydet", EN: "Save" } },
                    { keys: "Ctrl + P", text: { TR: "Motorda oynat/durdur", EN: "Play/stop in the engine" } },
                    { keys: "W E R", text: { TR: "Taşı, döndür, ölçekle", EN: "Move, rotate, scale" } },
                    { keys: "Ctrl + D", text: { TR: "Nesneyi çoğalt", EN: "Duplicate object" } },
                    { keys: "F / F2", text: { TR: "Odakla / yeniden adlandır", EN: "Focus / rename" } },
                    { keys: "Ctrl + Z / Y", text: { TR: "Geri al / yinele", EN: "Undo / redo" } },
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
