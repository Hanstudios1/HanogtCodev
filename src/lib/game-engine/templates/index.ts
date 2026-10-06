/**
 * Ready-to-play starter projects. Every template is a complete, working game
 * with scripts written like Unity scripts so they double as tutorials. The
 * games live next to this file; the catalog and the factory are here.
 */
import { createBlankProject, createDefaultScene } from "../scene";
import type { GameDimension, GameProjectDocument } from "../types";
import { arenaShooter, towerDefense } from "./action";
import { obstacleCourse, topDownRpg } from "./adventure";
import { flappy, pong, runner2d, snake } from "./arcade";
import { finishProject } from "./builders";
import { breakout, platformer, rollABall, spaceShooter } from "./classic";
import { clickerUi, runner3d, tilemapPlatformer } from "./v3";
import { mazeHunt, skyTower, slingshot } from "./v4";

export type TemplateId =
    | "sky-tower-2d"
    | "maze-hunt-2d"
    | "slingshot-2d"
    | "runner-2d"
    | "flappy-2d"
    | "pong-2d"
    | "snake-2d"
    | "rpg-topdown-2d"
    | "obstacle-course-3d"
    | "tower-defense-2d"
    | "arena-2d"
    | "tilemap-platformer-2d"
    | "clicker-ui-2d"
    | "runner-3d"
    | "platformer-2d"
    | "rollaball-3d"
    | "space-shooter-2d"
    | "breakout-2d"
    | "empty-2d"
    | "empty-3d";

export interface TemplateInfo {
    id: TemplateId;
    dimension: GameDimension;
    name: { tr: string; en: string };
    description: { tr: string; en: string };
    languages: Array<"C#" | "C++">;
    gradient: [string, string];
    emoji: string;
    difficulty: "starter" | "easy" | "medium";
    /** How the game is played (shown in the template details). */
    controls: { tr: string; en: string };
    /** Engine version that introduced the template (shown as a badge). */
    since?: 3 | 4;
    /** Added in the latest template update (shown as "Yeni"). */
    isNew?: boolean;
}

export const PROJECT_TEMPLATES: TemplateInfo[] = [
    {
        id: "sky-tower-2d",
        dimension: "2d",
        name: { tr: "Gök Kulesi", en: "Sky Tower" },
        description: { tr: "V4 platform oyunu: Character Controller 2D ile çift zıplama, coyote süresi ve zıplama tamponu; seni izleyen Camera Follow, ekran sarsıntısı, hareketli platform, kontrol noktası ve kaydırıcıyla anahtarlı ayarlar menüsü.", en: "A V4 platformer: double jump, coyote time and jump buffering with Character Controller 2D, a Camera Follow that tracks you, screen shake, a moving platform, a checkpoint and a settings menu with a slider and a toggle." },
        languages: ["C#"],
        gradient: ["#a855f7", "#f59e0b"],
        emoji: "🗼",
        difficulty: "easy",
        controls: { tr: "← → / A D / sol çubuk: koş  •  Space / gamepad A: zıpla (havada bir kez daha)  •  Esc: ayarlar", en: "← → / A D / left stick: run  •  Space / gamepad A: jump (once more in the air)  •  Esc: settings" },
        since: 4,
        isNew: true,
    },
    {
        id: "maze-hunt-2d",
        dimension: "2d",
        name: { tr: "Labirent Avı", en: "Maze Hunt" },
        description: { tr: "Gem'leri topla, hayaletlerden kaç: Nav Agent 2D hayaletler A* yol bulmayla seni kovalar, pusu kurar ya da devriye gezer; kristal onları kaçırır. İpucu tuşu en yakın gem'e en kısa yolu çizer.", en: "Collect the gems and dodge the ghosts: Nav Agent 2D ghosts chase you with A* path finding, lie in wait or patrol, and a crystal sends them running. The hint button draws the shortest path to the nearest gem." },
        languages: ["C#"],
        gradient: ["#4c1d95", "#facc15"],
        emoji: "👻",
        difficulty: "medium",
        controls: { tr: "WASD / ok tuşları / sol çubuk: yürü  •  H / gamepad Y: ipucu", en: "WASD / arrow keys / left stick: walk  •  H / gamepad Y: hint" },
        since: 4,
        isNew: true,
    },
    {
        id: "slingshot-2d",
        dimension: "2d",
        name: { tr: "Sapan Ustası", en: "Slingshot Master" },
        description: { tr: "Fizik bulmacası: topu geri çek, Spring Joint 2D bırakınca fırlatır. Distance Joint 2D'ye asılı yıkım topu, kasalar, güç kaydırıcısı, nişan çizgisi anahtarı ve adını yazdığın rekor tablosu.", en: "A physics puzzle: pull the ball back and a Spring Joint 2D launches it. A wrecking ball on a Distance Joint 2D, crates, a power slider, an aim line toggle and a high score table you sign with your name." },
        languages: ["C#"],
        gradient: ["#f43f5e", "#7c3aed"],
        emoji: "💥",
        difficulty: "easy",
        controls: { tr: "Fare / parmak: topu geri çek ve bırak  •  R: yeniden başla", en: "Mouse / finger: pull the ball back and let go  •  R: restart" },
        since: 4,
        isNew: true,
    },
    {
        id: "runner-2d",
        dimension: "2d",
        name: { tr: "Neon Koşu", en: "Neon Run" },
        description: { tr: "Ana sayfadaki mini oyunun gerçek projesi: coyote süresi, zıplama tamponu, çift zıplama, paralaks tepeler, hızlanan dünya ve rekor.", en: "The landing page's mini game as a real project: coyote time, jump buffering, double jump, parallax hills, a speeding world and a high score." },
        languages: ["C#"],
        gradient: ["#a855f7", "#ec4899"],
        emoji: "🏃‍♀️",
        difficulty: "starter",
        controls: { tr: "Space / ↑ / tıkla: zıpla, havada bir kez daha", en: "Space / ↑ / click: jump, once more in the air" },
        isNew: true,
    },
    {
        id: "flappy-2d",
        dimension: "2d",
        name: { tr: "Kanat Çırp", en: "Flap" },
        description: { tr: "Tek tuşlu oyun: kanat çırp, boruların arasından geç. Durum makinesi (enum), prefab boru çiftleri ve daralan boşluk.", en: "A one-button game: flap through the pipes. An enum state machine, prefab pipe pairs and a narrowing gap." },
        languages: ["C#"],
        gradient: ["#0ea5e9", "#f59e0b"],
        emoji: "🐤",
        difficulty: "starter",
        controls: { tr: "Space / ↑ / tıkla: kanat çırp", en: "Space / ↑ / click: flap" },
        isNew: true,
    },
    {
        id: "pong-2d",
        dimension: "2d",
        name: { tr: "Pong", en: "Pong" },
        description: { tr: "Bir ya da iki oyuncu: vuruş yerine göre açılanan top, hızlanan ralliler ve ok tuşlarına basılmazsa oynayan bilgisayar.", en: "One or two players: angled returns, speeding rallies and a computer opponent until someone takes the arrow keys." },
        languages: ["C#"],
        gradient: ["#6366f1", "#ec4899"],
        emoji: "🏓",
        difficulty: "starter",
        controls: { tr: "W / S: sol raket  •  ↑ / ↓: ikinci oyuncu", en: "W / S: left paddle  •  ↑ / ↓: second player" },
        isNew: true,
    },
    {
        id: "snake-2d",
        dimension: "2d",
        name: { tr: "Yılan (C++)", en: "Snake (C++)" },
        description: { tr: "C++ ile klasik yılan: std::vector ile gövde, ızgarada adım adım hareket, hızlanan oyun ve kayıtlı rekor.", en: "Classic snake in C++: a std::vector body, step-by-step grid movement, a speeding game and a saved high score." },
        languages: ["C++"],
        gradient: ["#16a34a", "#f59e0b"],
        emoji: "🐍",
        difficulty: "easy",
        controls: { tr: "Ok tuşları / WASD: yön", en: "Arrow keys / WASD: steer" },
        isNew: true,
    },
    {
        id: "rpg-topdown-2d",
        dimension: "2d",
        name: { tr: "Küçük Macera", en: "Little Adventure" },
        description: { tr: "Yukarıdan bakışlı RPG: köylüyle konuş, balçıklarla kılıçla savaş, anahtarı bul, kapıyı aç ve hazineye ulaş.", en: "A top-down RPG: talk to the villager, fight slimes with your sword, find the key, open the gate and reach the treasure." },
        languages: ["C#"],
        gradient: ["#16a34a", "#a855f7"],
        emoji: "🗡️",
        difficulty: "medium",
        controls: { tr: "WASD: yürü  •  Space: kılıç  •  E: konuş", en: "WASD: walk  •  Space: sword  •  E: talk" },
        isNew: true,
    },
    {
        id: "obstacle-course-3d",
        dimension: "3d",
        name: { tr: "Engel Parkuru", en: "Obstacle Course" },
        description: { tr: "3D parkur: hareketli platformlar, dönen süpürgeler, kaybolan karolar, kontrol noktaları ve en iyi süre.", en: "A 3D course: moving platforms, spinning sweepers, vanishing tiles, checkpoints and a best time." },
        languages: ["C#"],
        gradient: ["#ec4899", "#6366f1"],
        emoji: "🏁",
        difficulty: "medium",
        controls: { tr: "WASD: koş  •  Space: zıpla", en: "WASD: run  •  Space: jump" },
        isNew: true,
    },
    {
        id: "tower-defense-2d",
        dimension: "2d",
        name: { tr: "Kale Savunması", en: "Castle Defense" },
        description: { tr: "Kule savunması: fareyle kule kur ve yükselt, yol noktalarını izleyen düşman dalgalarını durdur, dev dalgalarına hazır ol.", en: "Tower defense: build and upgrade towers with the mouse and stop enemy waves that follow waypoints, giants included." },
        languages: ["C#"],
        gradient: ["#84cc16", "#7c3aed"],
        emoji: "🏰",
        difficulty: "medium",
        controls: { tr: "Fare: kule kur ve yükselt  •  Space: dalgayı başlat", en: "Mouse: build and upgrade towers  •  Space: start the wave" },
        isNew: true,
    },
    {
        id: "arena-2d",
        dimension: "2d",
        name: { tr: "Neon Arena (C++)", en: "Neon Arena (C++)" },
        description: { tr: "İkiz çubuk nişancı: WASD ile kaç, fareyle ya da ok tuşlarıyla ateş et. Oyuncu ve düşmanlar C++, yönetici C#.", en: "A twin-stick shooter: dodge with WASD, shoot with the mouse or arrow keys. Player and enemies in C++, the manager in C#." },
        languages: ["C++", "C#"],
        gradient: ["#db2777", "#4c1d95"],
        emoji: "🎯",
        difficulty: "medium",
        controls: { tr: "WASD: hareket  •  Fare ya da ok tuşları: ateş", en: "WASD: move  •  Mouse or arrow keys: shoot" },
        isNew: true,
    },
    {
        id: "tilemap-platformer-2d",
        dimension: "2d",
        name: { tr: "Tilemap Macerası", en: "Tilemap Adventure" },
        description: { tr: "Karo boyanmış iki seviye, dikenler, anahtarla kurulan köprü, duraklatma menüsü ve sahne geçişleri.", en: "Two tile-painted levels, spikes, a bridge built by keys, a pause menu and scene fades." },
        languages: ["C#"],
        gradient: ["#16a34a", "#0ea5e9"],
        emoji: "🗺️",
        difficulty: "easy",
        controls: { tr: "← →: koş  •  Space: zıpla  •  P: duraklat", en: "← →: run  •  Space: jump  •  P: pause" },
        since: 3,
    },
    {
        id: "clicker-ui-2d",
        dimension: "2d",
        name: { tr: "Tıklama Fabrikası", en: "Clicker Factory" },
        description: { tr: "Butonlar, ilerleme çubuğu, yükseltmeler, Timer ile pasif gelir, Tween efektleri ve kayıtlı ilerleme.", en: "Buttons, a progress bar, upgrades, passive income with Timer, tween effects and saved progress." },
        languages: ["C#"],
        gradient: ["#f59e0b", "#db2777"],
        emoji: "🏭",
        difficulty: "starter",
        controls: { tr: "Fare ya da Space: üret  •  1 / 2: satın al", en: "Mouse or Space: produce  •  1 / 2: buy" },
        since: 3,
    },
    {
        id: "runner-3d",
        dimension: "3d",
        name: { tr: "Sisli Koşu", en: "Foggy Runner" },
        description: { tr: "Üç şeritli sonsuz koşu: sis, parlama (bloom), vinyet, dönen elmaslar ve rekor kaydı.", en: "Three-lane endless runner with fog, bloom, vignette, spinning gems and a saved high score." },
        languages: ["C#"],
        gradient: ["#4c1d95", "#0891b2"],
        emoji: "💨",
        difficulty: "easy",
        controls: { tr: "← →: şerit değiştir  •  Space: zıpla", en: "← →: change lanes  •  Space: jump" },
        since: 3,
    },
    {
        id: "platformer-2d",
        dimension: "2d",
        name: { tr: "2D Platform Oyunu", en: "2D Platformer" },
        description: { tr: "Çift zıplama, düşman ezme, coin toplama, kamera takibi ve bitiş bayrağı.", en: "Double jump, enemy stomping, coins, camera follow and a goal flag." },
        languages: ["C#"],
        gradient: ["#f59e0b", "#ef4444"],
        emoji: "🏃",
        difficulty: "easy",
        controls: { tr: "← →: koş  •  Space: zıpla (iki kez)", en: "← →: run  •  Space: jump (twice)" },
    },
    {
        id: "rollaball-3d",
        dimension: "3d",
        name: { tr: "3D Top Yuvarlama", en: "3D Roll-a-Ball" },
        description: { tr: "Unity'nin klasik ilk dersi: kuvvetle topu yuvarla, dönen küpleri topla.", en: "Unity's classic first tutorial: roll the ball with forces and collect spinning cubes." },
        languages: ["C#"],
        gradient: ["#6366f1", "#06b6d4"],
        emoji: "🎱",
        difficulty: "starter",
        controls: { tr: "WASD / ok tuşları: topu yuvarla", en: "WASD / arrow keys: roll the ball" },
    },
    {
        id: "space-shooter-2d",
        dimension: "2d",
        name: { tr: "Uzay Nişancısı", en: "Space Shooter" },
        description: { tr: "C++ ve C# birlikte: ateş et, düşman dalgalarını patlat, yıldız alanında hayatta kal.", en: "C++ and C# together: shoot, blow up enemy waves and survive in a starfield." },
        languages: ["C++", "C#"],
        gradient: ["#8b5cf6", "#ec4899"],
        emoji: "🚀",
        difficulty: "medium",
        controls: { tr: "Ok tuşları / WASD: hareket  •  Space ya da tıkla: ateş", en: "Arrow keys / WASD: move  •  Space or click: shoot" },
    },
    {
        id: "breakout-2d",
        dimension: "2d",
        name: { tr: "Tuğla Kırma", en: "Breakout" },
        description: { tr: "Raket, sekme fiziği, prefab ile oluşturulan tuğla ızgarası, can ve skor sistemi.", en: "Paddle, bounce physics, a prefab-built brick grid, lives and score." },
        languages: ["C#"],
        gradient: ["#22c55e", "#0ea5e9"],
        emoji: "🧱",
        difficulty: "easy",
        controls: { tr: "← → / A D: raket  •  Space ya da tıkla: topu fırlat", en: "← → / A D: paddle  •  Space or click: launch the ball" },
    },
    {
        id: "empty-3d",
        dimension: "3d",
        name: { tr: "Boş 3D Proje", en: "Empty 3D Project" },
        description: { tr: "Kamera, ışık ve zemin ile temiz bir başlangıç.", en: "A clean start with a camera, a light and a ground plane." },
        languages: ["C#", "C++"],
        gradient: ["#334155", "#64748b"],
        emoji: "🧊",
        difficulty: "starter",
        controls: { tr: "Kontrolleri sen tasarlarsın", en: "You design the controls" },
    },
    {
        id: "empty-2d",
        dimension: "2d",
        name: { tr: "Boş 2D Proje", en: "Empty 2D Project" },
        description: { tr: "Ortografik kameralı boş bir 2D sahne.", en: "An empty 2D scene with an orthographic camera." },
        languages: ["C#", "C++"],
        gradient: ["#475569", "#94a3b8"],
        emoji: "🟦",
        difficulty: "starter",
        controls: { tr: "Kontrolleri sen tasarlarsın", en: "You design the controls" },
    },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createProjectFromTemplate(templateId: TemplateId, name?: string): GameProjectDocument {
    const info = PROJECT_TEMPLATES.find((template) => template.id === templateId) ?? PROJECT_TEMPLATES[PROJECT_TEMPLATES.length - 1];
    const projectName = (name?.trim() || info.name.tr).slice(0, 80);
    switch (info.id) {
        case "sky-tower-2d": return skyTower(projectName);
        case "maze-hunt-2d": return mazeHunt(projectName);
        case "slingshot-2d": return slingshot(projectName);
        case "runner-2d": return runner2d(projectName);
        case "flappy-2d": return flappy(projectName);
        case "pong-2d": return pong(projectName);
        case "snake-2d": return snake(projectName);
        case "rpg-topdown-2d": return topDownRpg(projectName);
        case "obstacle-course-3d": return obstacleCourse(projectName);
        case "tower-defense-2d": return towerDefense(projectName);
        case "arena-2d": return arenaShooter(projectName);
        case "tilemap-platformer-2d": return tilemapPlatformer(projectName);
        case "clicker-ui-2d": return clickerUi(projectName);
        case "runner-3d": return runner3d(projectName);
        case "platformer-2d": return platformer(projectName);
        case "rollaball-3d": return rollABall(projectName);
        case "space-shooter-2d": return spaceShooter(projectName);
        case "breakout-2d": return breakout(projectName);
        case "empty-2d":
        case "empty-3d": {
            const project = createBlankProject(projectName, info.dimension);
            const scene = createDefaultScene("Main Scene", info.dimension);
            return finishProject(project, scene, info.id);
        }
    }
}

/** Script file templates offered by "Create → Script". */
export function newScriptSource(className: string, language: "csharp" | "cpp"): string {
    const name = className.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]+/, "") || "NewBehaviour";
    if (language === "cpp") {
        return `#include <hanogt.h>

// ${name}: nesneye eklenen C++ davranışı.
class ${name} : public MonoBehaviour {
public:
    float speed = 5.0f;

    // İlk karede bir kez çalışır.
    void Start() {
        Debug::Log("${name} başladı!");
    }

    // Her karede çalışır.
    void Update() {
        // Örnek: transform->Rotate(0, speed * 10 * Time::deltaTime, 0);
    }
};
`;
    }
    return `using UnityEngine;

public class ${name} : MonoBehaviour
{
    public float speed = 5f;

    // İlk karede bir kez çalışır.
    void Start()
    {
        Debug.Log("${name} başladı!");
    }

    // Her karede çalışır.
    void Update()
    {
        // Örnek: transform.Rotate(0, speed * 10 * Time.deltaTime, 0);
    }
}
`;
}
