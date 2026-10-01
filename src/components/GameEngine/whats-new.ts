/** Hanogt Engine V3 feature list shown in the hub and in the docs. */
import {
    Activity,
    ArrowRightLeft,
    Clapperboard,
    CloudFog,
    Grid3x3,
    LayoutTemplate,
    MousePointerClick,
    Timer,
    Waypoints,
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
