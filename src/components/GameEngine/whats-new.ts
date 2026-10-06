/** Hanogt Engine V5, V4 and V3 feature lists and the October template update, shown in the hub and in the docs. */
import {
    Activity,
    ArrowRightLeft,
    Box,
    Clapperboard,
    CloudFog,
    Eye,
    Footprints,
    Gamepad2,
    Grid3x3,
    Languages,
    LayoutTemplate,
    Link2,
    MousePointerClick,
    Music,
    Navigation,
    PackageOpen,
    Save,
    ScrollText,
    SlidersHorizontal,
    Timer,
    Trophy,
    Tv,
    Users,
    Video,
    Waypoints,
    Workflow,
    type LucideIcon,
} from "lucide-react";
import type { Copy } from "@/lib/i18n";

export interface WhatsNewItem {
    icon: LucideIcon;
    title: Copy;
    text: Copy;
    /** Docs section that explains the feature. */
    section: string;
}

export const V5_FEATURES: WhatsNewItem[] = [
    {
        icon: Workflow,
        title: { TR: "Animator durum makinesi", EN: "Animator state machine" },
        text: {
            TR: "Durumlar, parametreler ve geçişlerle karakter animasyonu: Idle, Run, Jump… Betik yalnızca SetFloat, SetBool ve SetTrigger der; hangi klibin oynayacağını grafik seçer. Oyun çalışırken geçerli durum canlı vurgulanır.",
            EN: "Character animation with states, parameters and transitions: Idle, Run, Jump… Scripts only call SetFloat, SetBool and SetTrigger; the graph picks the clip. The current state lights up live while the game runs.",
        },
        section: "animator",
    },
    {
        icon: Trophy,
        title: { TR: "Skor tabloları ve başarımlar", EN: "Leaderboards and achievements" },
        text: {
            TR: "Leaderboard.Submit ve Achievements.Unlock ile Arcade'de oyuncu başına en iyi skor ve açılan başarımlar. Sınırlar, en kısa oynama süresi ve hız sınırı sunucuda denetlenir.",
            EN: "Leaderboard.Submit and Achievements.Unlock keep each player's best score and unlocked achievements in the Arcade. Bounds, a minimum play time and rate limits are checked on the server.",
        },
        section: "skor-tablolari",
    },
    {
        icon: Languages,
        title: { TR: "Oyununu çevir", EN: "Translate your game" },
        text: {
            TR: "Dil tablosu, Localization.Get ve UI öğelerinde dil anahtarı: oyun oyuncunun dilinde açılır. Çevirmenler için CSV ile dışa ve içe aktarma.",
            EN: "A string table, Localization.Get and localization keys on UI elements: the game opens in the player's language. CSV export and import for translators.",
        },
        section: "diller",
    },
    {
        icon: Users,
        title: { TR: "Yerel çok oyunculu", EN: "Local multiplayer" },
        text: {
            TR: "Aynı ekranda en fazla 4 oyuncu: Player Input ile klavyenin iki yarısı ve gamepad'ler. Her oyuncunun karakteri ve betikleri yalnızca kendi tuşlarını okur.",
            EN: "Up to 4 players on one screen: Player Input splits the keyboard in two halves and adds gamepads. Each player's character and scripts read only their own controls.",
        },
        section: "cok-oyunculu",
    },
    {
        icon: Save,
        title: { TR: "SaveSystem ve JsonUtility", EN: "SaveSystem and JsonUtility" },
        text: {
            TR: "Kendi sınıflarını tek satırla kaydet ve geri yükle: listeler, sözlükler ve vektörler dahil. 20 kayıt yuvası, kayıt zamanı ve son kayıt.",
            EN: "Save and load your own classes in one line, lists, dictionaries and vectors included. 20 save slots, save times and the latest save.",
        },
        section: "kayit",
    },
    {
        icon: Box,
        title: { TR: "3D modeller (GLB)", EN: "3D models (GLB)" },
        text: {
            TR: "Blender ya da başka araçlardan GLB modeller yükle; kendi malzemeleri ve dokularıyla sahnede, yayınlanan oyunda ve dışa aktarılan pakette görünür.",
            EN: "Upload GLB models from Blender or other tools; they show with their own materials and textures in the scene, in published games and in exported packages.",
        },
        section: "modeller",
    },
    {
        icon: Tv,
        title: { TR: "Ekran efektleri V2", EN: "Screen effects V2" },
        text: {
            TR: "Renk düzenleme, renk filtresi, kromatik sapma, pikselleştirme ve CRT ekran. ScreenEffects ile oyun sırasında değiştir; ScreenEffects.Reset() sahnenin ayarına döndürür.",
            EN: "Color grading, tint, chromatic aberration, pixelation and a CRT screen. Change them during the game with ScreenEffects; ScreenEffects.Reset() returns to the scene's own look.",
        },
        section: "ortam",
    },
    {
        icon: PackageOpen,
        title: { TR: "Web paketi (ZIP · PWA)", EN: "Web package (ZIP · PWA)" },
        text: {
            TR: "Oyununu kendi sitende yayınla: tek ZIP'te sayfa, oynatıcı, sesler, modeller, simgeler ve uygulama olarak yüklenebilen, çevrim dışı da açılan bir PWA.",
            EN: "Host your game on your own site: one ZIP with the page, player, sounds, models and icons, an installable PWA that also opens offline.",
        },
        section: "yayinlama",
    },
    {
        icon: LayoutTemplate,
        title: { TR: "Üç yeni şablon", EN: "Three new templates" },
        text: {
            TR: "Yıldız Düellosu (iki kişilik), Zindan Kaçışı ve Meteor Yağmuru: Türkçe ve İngilizce, skor tabloları ve başarımlarla V5 özelliklerini gösteren oyunlar.",
            EN: "Star Duel (two players), Dungeon Escape and Meteor Storm: games in Turkish and English, with leaderboards and achievements, that show off the V5 features.",
        },
        section: "baslarken",
    },
];

export const V4_FEATURES: WhatsNewItem[] = [
    {
        icon: Gamepad2,
        title: { TR: "Giriş eylemleri ve gamepad", EN: "Input actions and gamepads" },
        text: {
            TR: "Zıpla, Ateş et gibi eylemleri tuşlara, fare düğmelerine ve gamepad'e bağla; Input.GetButton ve GetAxis hepsini birlikte okur. Ölü bölge, ters eksen ve kendi eylemlerin Ayarlar → Girdi'de.",
            EN: "Bind actions such as Jump and Fire to keys, mouse buttons and gamepads; Input.GetButton and GetAxis read them all. Dead zone, inverted axes and your own actions are in Settings → Input.",
        },
        section: "girdi",
    },
    {
        icon: Footprints,
        title: { TR: "Character Controller 2D", EN: "Character Controller 2D" },
        text: {
            TR: "Kod yazmadan platform karakteri: hızlanma, çift zıplama, coyote süresi, zıplama tamponu, kısa zıplama, eğimler ve hareketli platformlar. OnJump ve OnLand olaylarıyla.",
            EN: "A platformer character without code: acceleration, double jump, coyote time, jump buffering, short hops, slopes and moving platforms, with OnJump and OnLand events.",
        },
        section: "karakter",
    },
    {
        icon: Video,
        title: { TR: "Kamera takibi ve sarsıntı", EN: "Camera follow and shake" },
        text: {
            TR: "Camera Follow hedefi yumuşakça izler: ölü bölge, ileri bakış ve seviye sınırları. Camera.Shake ile çarpışmalara ve patlamalara his kat.",
            EN: "Camera Follow tracks a target smoothly, with a dead zone, look-ahead and level bounds. Camera.Shake adds punch to hits and explosions.",
        },
        section: "kamera",
    },
    {
        icon: Navigation,
        title: { TR: "Yol bulma ve Nav Agent 2D", EN: "Path finding and Nav Agent 2D" },
        text: {
            TR: "Düşmanlar duvarların etrafından A* ile en kısa yolu bulur. Nav Agent 2D bir hedefi kovalar ya da SetDestination ile gider; Pathfinding.FindPath yolu kendin kullanman için verir.",
            EN: "Enemies find the shortest way around walls with A*. Nav Agent 2D chases a target or goes where SetDestination says; Pathfinding.FindPath hands you the path itself.",
        },
        section: "yol-bulma",
    },
    {
        icon: Link2,
        title: { TR: "Distance ve Spring eklemleri", EN: "Distance and Spring joints" },
        text: {
            TR: "Sarkaçlar, ipler, zincirler, yaylar ve sapanlar: iki nesneyi sabit mesafede ya da yayla bağla.",
            EN: "Pendulums, ropes, chains, springs and slingshots: tie two objects at a fixed distance or with a spring.",
        },
        section: "eklemler",
    },
    {
        icon: SlidersHorizontal,
        title: { TR: "Kaydırıcı, anahtar ve metin kutusu", EN: "Slider, toggle and input field" },
        text: {
            TR: "Ayarlar menüleri ve skor tabloları için yeni arayüz kontrolleri; onValueChanged ve onEndEdit olayları, telefonda ekran klavyesi.",
            EN: "New UI controls for settings menus and high score tables, with onValueChanged and onEndEdit events and the on-screen keyboard on phones.",
        },
        section: "ui-kontroller",
    },
    {
        icon: Music,
        title: { TR: "Ses dosyaları ve müzik", EN: "Audio files and music" },
        text: {
            TR: "WAV, MP3 ve OGG yükle; Audio.Play ile efekt, Audio.PlayMusic ile geçişli müzik çal. Müzik ve efekt sesleri ayrı, Audio Source döngüyle çalabilir.",
            EN: "Upload WAV, MP3 and OGG files; play effects with Audio.Play and music with fades with Audio.PlayMusic. Music and effects have separate volumes and Audio Sources can loop.",
        },
        section: "ses-dosyalari",
    },
    {
        icon: Eye,
        title: { TR: "Çoklu seçim ve İzle paneli", EN: "Multi-select and the Watch panel" },
        text: {
            TR: "Birden çok nesneyi birlikte taşı ve düzenle, Shift ile kutu seçimi yap, hiyerarşide t:Tür ile ara. İzle paneli oyun çalışırken değerleri canlı gösterir.",
            EN: "Move and edit several objects together, box-select with Shift and search the hierarchy with t:Type. The Watch panel shows values live while the game runs.",
        },
        section: "editor",
    },
    {
        icon: LayoutTemplate,
        title: { TR: "Üç yeni şablon", EN: "Three new templates" },
        text: {
            TR: "Gök Kulesi, Labirent Avı ve Sapan Ustası: V4 özellikleriyle yapılmış, baştan sona oynanabilir oyunlar.",
            EN: "Sky Tower, Maze Hunt and Slingshot Master: games built with the V4 features, playable end to end.",
        },
        section: "baslarken",
    },
];

export const V3_FEATURES: WhatsNewItem[] = [
    {
        icon: Grid3x3,
        title: { TR: "Tilemap ve karo boyama", EN: "Tilemaps and tile painting" },
        text: {
            TR: "2D seviyeleri sahnede fırça, dikdörtgen, silgi ve damlalıkla boya. Karo başına çarpışma, atlas görselleri ve script'ten Tilemap.SetTile.",
            EN: "Paint 2D levels right in the scene with brush, rectangle, eraser and picker tools. Per-tile collision, atlas images and Tilemap.SetTile from scripts.",
        },
        section: "tilemap",
    },
    {
        icon: MousePointerClick,
        title: { TR: "Butonlar, paneller ve ilerleme çubukları", EN: "Buttons, panels and progress bars" },
        text: {
            TR: "Çapalı arayüz öğeleri. On Click ile Inspector'dan metot bağla ya da onClick.AddListener kullan; butonlara kısayol tuşu ata.",
            EN: "Anchored UI elements. Wire methods in the Inspector with On Click or use onClick.AddListener, and give buttons keyboard shortcuts.",
        },
        section: "ui-ses",
    },
    {
        icon: Clapperboard,
        title: { TR: "Animation bileşeni", EN: "Animation component" },
        text: {
            TR: "Konum, dönüş, ölçek, renk, saydamlık ve sprite sheet kareleri için anahtar kareler; 18 yumuşatma eğrisi, döngü, ping-pong ve hazır klipler.",
            EN: "Keyframes for position, rotation, scale, color, opacity and sprite sheet frames, with 18 easing curves, looping, ping-pong and ready-made clips.",
        },
        section: "animasyon",
    },
    {
        icon: Timer,
        title: { TR: "Tween ve Timer", EN: "Tween and Timer" },
        text: {
            TR: "Tween.Move, Scale, Fade ve Value; zincirleme SetEase, SetLoops ve OnComplete. Timer.After ve Timer.Every ile lambda zamanlayıcılar (C# ve C++).",
            EN: "Tween.Move, Scale, Fade and Value with chained SetEase, SetLoops and OnComplete. Lambda timers with Timer.After and Timer.Every (C# and C++).",
        },
        section: "animasyon",
    },
    {
        icon: ArrowRightLeft,
        title: { TR: "Sahne geçişleri ve kayıt", EN: "Scene transitions and saving" },
        text: {
            TR: "SceneManager.FadeToScene ile kararan geçişler, ReloadScene ve PlayerPrefs.GetBool / SetBool.",
            EN: "Fading transitions with SceneManager.FadeToScene, ReloadScene and PlayerPrefs.GetBool / SetBool.",
        },
        section: "sahneler",
    },
    {
        icon: CloudFog,
        title: { TR: "Ortam ve ekran efektleri", EN: "Environment and screen effects" },
        text: {
            TR: "Doğrusal veya üstel sis, bloom (parlama), vinyet ve pozlama ayarıyla atmosferik sahneler.",
            EN: "Atmospheric scenes with linear or exponential fog, bloom, vignette and exposure.",
        },
        section: "ortam",
    },
    {
        icon: Waypoints,
        title: { TR: "Daha akıllı fizik", EN: "Smarter physics" },
        text: {
            TR: "Çarpışmalarda tüm temas noktaları (collision.contacts), karoların arasında takılmadan kayma ve nesne başına tek ışın isabeti.",
            EN: "Every contact point of a collision (collision.contacts), smooth sliding across tiles and one raycast hit per object.",
        },
        section: "fizik",
    },
    {
        icon: Activity,
        title: { TR: "Editör iyileştirmeleri", EN: "Editor improvements" },
        text: {
            TR: "Taşıma, dönüş ve ölçekte ızgaraya yakalama; oynatırken FPS, nesne ve çizim istatistikleri; sprite sheet kare seçimi.",
            EN: "Grid snapping for move, rotate and scale, live FPS, object and draw-call stats while playing, and sprite sheet frame picking.",
        },
        section: "editor",
    },
    {
        icon: LayoutTemplate,
        title: { TR: "Üç yeni şablon", EN: "Three new templates" },
        text: {
            TR: "Tilemap Macerası, Tıklama Fabrikası ve Sisli Koşu: V3 özelliklerini kullanan, hemen oynanabilir projeler.",
            EN: "Tilemap Adventure, Clicker Factory and Foggy Runner: ready-to-play projects built with the V3 features.",
        },
        section: "baslarken",
    },
];

/** The October 2026 template update on top of V3: eight new games and the script fixes they brought. */
export const TEMPLATE_UPDATE: WhatsNewItem[] = [
    {
        icon: Gamepad2,
        title: { TR: "Sekiz yeni oyun şablonu", EN: "Eight new game templates" },
        text: {
            TR: "Neon Koşu, Kanat Çırp, Pong, Yılan (C++), Küçük Macera, Engel Parkuru, Kale Savunması ve Neon Arena (C++). Hepsi baştan sona oynanabilir ve yorumlu kodla gelir.",
            EN: "Neon Run, Flap, Pong, Snake (C++), Little Adventure, Obstacle Course, Castle Defense and Neon Arena (C++). Each is playable end to end and comes with commented code.",
        },
        section: "baslarken",
    },
    {
        icon: ScrollText,
        title: { TR: "Unity'ye daha yakın betikler", EN: "Scripts closer to Unity" },
        text: {
            TR: "Yok edilen bir betik artık null ile eşit sayılır; başka bir betikten çağrılan metodun başlattığı Timer ve Tween o metodun betiğine ait olur; C++'ta std::vector<GameObject*> alanları boş başlar.",
            EN: "A destroyed script now compares equal to null; Timers and Tweens started by a method another script calls belong to that method's script; std::vector<GameObject*> fields start empty in C++.",
        },
        section: "prefab",
    },
];
