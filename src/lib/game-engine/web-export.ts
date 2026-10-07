/**
 * The web package of a game (V5): a folder any static host can serve
 * (GitHub Pages, Netlify, itch.io…) that installs as an app and plays offline.
 *
 *   index.html            start screen; loads the player and registers sw.js
 *   player.js             the standalone player (public/engine/player.js)
 *   game.json             { format, version, project, files: { hash: path } }
 *   assets/<hash>.<ext>   uploaded sounds and models, as real files
 *   manifest.webmanifest  name, icons, colours, orientation (installing)
 *   sw.js                 caches every file of the package (offline play)
 *   icons/                192 and 512 px icons, and a maskable 512 px one
 *   README.txt            how to publish and test it
 *
 * Everything here is pure (strings and file lists) so the plain-Node tests can
 * check it; the editor collects the bytes and zips them.
 */
import { ENGINE_VERSION, ENGINE_VERSION_LABEL, GAME_ENGINE_SCHEMA_VERSION, type AudioAsset, type GameProjectDocument, type ModelAsset, type ProjectSettings } from "./types";

export const WEB_PACKAGE_FORMAT = "hanogt-engine-project";
export const WEB_ICON_SIZES = [192, 512] as const;
export const WEB_ICONS = ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"] as const;
const BACKGROUND = "#09090b";
const THEME = "#6366f1";

const AUDIO_EXTENSIONS: Record<AudioAsset["contentType"], string> = { "audio/wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg" };

/** Where a sound or model lives in the package. */
export function assetPath(asset: Pick<AudioAsset, "hash" | "contentType"> | Pick<ModelAsset, "hash">): string {
    const extension = "contentType" in asset ? AUDIO_EXTENSIONS[asset.contentType] ?? "bin" : "glb";
    return `assets/${asset.hash}.${extension}`;
}

/** Every sound and model of the project once, by hash → path. */
export function packageAssets(project: Pick<GameProjectDocument, "audio" | "models">): Record<string, string> {
    const files: Record<string, string> = {};
    for (const asset of [...(project.audio ?? []), ...(project.models ?? [])]) {
        if (/^[0-9a-f]{64}$/.test(asset.hash) && !files[asset.hash]) files[asset.hash] = assetPath(asset);
    }
    return files;
}

/** The page language: the game's start language, else its first language, else Turkish. */
export function packageLanguage(project: Pick<GameProjectDocument, "settings">): string {
    const localization = project.settings.localization;
    return (localization.startLanguage !== "auto" ? localization.startLanguage : localization.languages[0]) ?? "tr";
}

export function orientationOf(aspect: ProjectSettings["aspect"]): "portrait" | "landscape" | "any" {
    if (aspect === "9:16") return "portrait";
    if (aspect === "16:9" || aspect === "4:3") return "landscape";
    return "any";
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}

/** A short name for the home screen (12 characters reads well under an icon). */
function shortName(name: string) {
    const trimmed = name.trim() || "Hanogt Game";
    return trimmed.length <= 12 ? trimmed : `${trimmed.slice(0, 11).trimEnd()}…`;
}

/** `badge: false` leaves out "Made with Hanogt Engine" (Plus and Pro, PLAN_UNBRANDED_EXPORT). */
export type ExportBranding = { badge?: boolean };

export function webManifest(project: Pick<GameProjectDocument, "name" | "description" | "settings">, branding: ExportBranding = {}) {
    return {
        name: project.name.trim() || "Hanogt Game",
        short_name: shortName(project.name),
        description: project.description.trim().slice(0, 300) || (branding.badge === false ? project.name.trim() || "Hanogt Game" : `Made with ${ENGINE_VERSION_LABEL}`),
        lang: packageLanguage(project),
        start_url: "./",
        scope: "./",
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        orientation: orientationOf(project.settings.aspect),
        background_color: BACKGROUND,
        theme_color: THEME,
        categories: ["games", "entertainment"],
        icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}

/** The game data the player reads (`files` maps each sound and model to its path). */
export function packageGameJson(project: GameProjectDocument) {
    return { format: WEB_PACKAGE_FORMAT, version: GAME_ENGINE_SCHEMA_VERSION, project, files: packageAssets(project) };
}

/** Files the service worker keeps for offline play: the page, the player, the game, its files and the icons. */
export function packageFiles(project: Pick<GameProjectDocument, "audio" | "models">): string[] {
    return ["./", "index.html", "player.js", "game.json", "manifest.webmanifest", ...WEB_ICONS, ...Object.values(packageAssets(project))];
}

/**
 * The service worker: it caches the whole package when installed (a new
 * version, named by `version`, replaces the old one) and answers from the
 * cache first, so the game plays without a connection.
 */
export function serviceWorkerSource(projectId: string, version: string, files: readonly string[]): string {
    const prefix = `hanogt-game-${projectId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60)}-`;
    return `// Hanogt Engine ${ENGINE_VERSION}: keeps this game playable offline.
const PREFIX = ${JSON.stringify(prefix)};
const CACHE = PREFIX + ${JSON.stringify(version.replace(/[^A-Za-z0-9]/g, "").slice(0, 32))};
const FILES = ${JSON.stringify(files)};

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    // Older versions of this game go; other games on the same site keep theirs.
    event.waitUntil(caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    // Only this game's own files: other pages of the same site are left alone.
    if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
    event.respondWith(caches.open(CACHE).then((cache) => cache.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok && response.type === "basic") cache.put(request, response.clone());
        return response;
    }))));
});
`;
}

export function webIndexHtml(project: Pick<GameProjectDocument, "name" | "description" | "settings">, siteUrl: string, branding: ExportBranding = {}): string {
    const badge = branding.badge !== false;
    const language = packageLanguage(project);
    const turkish = language === "tr" || language === "az";
    const title = escapeHtml(project.name.trim() || "Hanogt Game");
    const description = escapeHtml(project.description.trim().slice(0, 300));
    const text = turkish
        ? { made: `${ENGINE_VERSION_LABEL} ile yapıldı`, play: "▶ Oyna", install: "Uygulama olarak yükle", offline: "Bir kez açıldıktan sonra internetsiz de oynanır.", file: "Bu oyunu bir web sunucusundan açın: dosyaya çift tıklayınca tarayıcılar oyunun dosyalarını yüklemez. Nasıl yapılacağı README.txt dosyasında.", failed: "Oyun yüklenemedi." }
        : { made: `Made with ${ENGINE_VERSION_LABEL}`, play: "▶ Play", install: "Install as an app", offline: "Once opened, it also plays offline.", file: "Open this game from a web server: browsers don't load a game's files when you double-click the page. README.txt explains how.", failed: "The game couldn't be loaded." };
    return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="Hanogt Engine ${ENGINE_VERSION}">
<meta name="theme-color" content="${THEME}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
${description ? `<meta name="description" content="${description}">\n` : ""}<title>${title}</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<style>
html,body{margin:0;height:100%;background:${BACKGROUND};color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
#game{position:fixed;inset:0}
#start{position:fixed;inset:0;display:grid;place-items:center;background:${BACKGROUND};z-index:10;padding:24px;box-sizing:border-box}
#start .card{text-align:center;max-width:520px}
#start img{width:96px;height:96px;border-radius:24px;margin-bottom:18px}
#start h1{font-size:clamp(24px,5vw,44px);margin:0 0 8px;font-weight:900;letter-spacing:-.02em}
#start p{margin:0 0 22px;color:#c7d2fe;opacity:.85;line-height:1.5}
#start button{font:inherit;font-weight:800;font-size:18px;padding:14px 34px;border:0;border-radius:999px;background:${THEME};color:#fff;cursor:pointer}
#start button:disabled{opacity:.5;cursor:progress}
#start #install{display:none;margin:14px auto 0;font-size:14px;padding:9px 18px;background:transparent;border:1px solid rgba(255,255,255,.25)}
#start small{display:block;margin-top:16px;color:#a1a1aa}
#badge{position:fixed;right:10px;bottom:10px;z-index:11;font-size:11px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.55);color:#a5b4fc;text-decoration:none}
</style>
</head>
<body>
<div id="game"></div>
<div id="start"><div class="card"><img src="icons/icon-192.png" alt=""><h1>${title}</h1>${badge ? `<p>${text.made}</p>` : description ? `<p>${description}</p>` : ""}<button type="button" id="play" disabled>${text.play}</button><button type="button" id="install">${text.install}</button><small id="note">${text.offline}</small></div></div>
${badge ? `<a id="badge" href="${escapeHtml(siteUrl)}/arcade" target="_blank" rel="noopener">Made with ${ENGINE_VERSION_LABEL}</a>\n` : ""}
<script>
(function () {
    var note = document.getElementById("note");
    window.HANOGT_LOAD_FAILED = ${JSON.stringify(text.failed)};
    if (location.protocol === "file:") {
        note.textContent = ${JSON.stringify(text.file)};
        return;
    }
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
    }
    var installButton = document.getElementById("install");
    var prompt = null;
    window.addEventListener("beforeinstallprompt", function (event) {
        event.preventDefault();
        prompt = event;
        installButton.style.display = "block";
    });
    installButton.addEventListener("click", function () {
        if (!prompt) return;
        prompt.prompt();
        prompt = null;
        installButton.style.display = "none";
    });
})();
</script>
<script src="player.js" defer></script>
</body>
</html>
`;
}

export function webReadme(project: Pick<GameProjectDocument, "name">): string {
    const name = project.name.trim() || "Hanogt Game";
    return `${name} — ${ENGINE_VERSION_LABEL}

TÜRKÇE
Bu klasör oyunun web sürümüdür:
  index.html            Oyun sayfası
  player.js             Hanogt Engine oynatıcısı
  game.json             Sahneler, betikler ve ayarlar
  assets/               Sesler ve 3D modeller
  manifest.webmanifest  Uygulama bilgileri (ana ekrana ekleme)
  sw.js                 Çevrimdışı oynama (service worker)
  icons/                Uygulama simgeleri

Yayınlamak: klasörün tamamını bir statik web sunucusuna yükleyin (GitHub Pages,
Netlify, Cloudflare Pages…). itch.io'da yeni bir "HTML" oyunu açıp bu ZIP
dosyasını yükleyebilirsiniz.
Kendi bilgisayarınızda denemek: bu klasörde bir sunucu başlatın, örneğin
"npx serve ." ya da "python3 -m http.server", sonra gösterilen adresi açın.
index.html'e çift tıklamak işe yaramaz: tarayıcılar dosyadan (file://)
açılan sayfaların oyun dosyalarını yüklemesine izin vermez.
HTTPS üzerinden açılan oyun bir kez yüklendikten sonra internetsiz de oynanır
ve "Uygulama olarak yükle" ile ana ekrana eklenebilir.
Skor tabloları ve başarımlar yalnızca Hanogt Arcade'de kaydedilir.

ENGLISH
This folder is the web version of the game:
  index.html            The game page
  player.js             The Hanogt Engine player
  game.json             Scenes, scripts and settings
  assets/               Sounds and 3D models
  manifest.webmanifest  App details (adding to the home screen)
  sw.js                 Offline play (service worker)
  icons/                App icons

To publish it, upload the whole folder to a static web host (GitHub Pages,
Netlify, Cloudflare Pages…). On itch.io, create an "HTML" game and upload
this ZIP file.
To try it on your computer, start a server in this folder, for example
"npx serve ." or "python3 -m http.server", and open the address it shows.
Double-clicking index.html doesn't work: browsers don't let pages opened from
a file (file://) load the game's files.
Served over HTTPS, the game plays offline once it has loaded and can be added
to the home screen with "Install as an app".
Leaderboards and achievements are only saved on the Hanogt Arcade.
`;
}

// ---------------------------------------------------------------------------
// Building the package
// ---------------------------------------------------------------------------

export class WebPackageError extends Error {
    readonly code: "missing_files" | "missing_icons";
    readonly names: string[];
    constructor(code: WebPackageError["code"], names: string[]) {
        super(`${code}: ${names.join(", ")}`);
        this.name = "WebPackageError";
        this.code = code;
        this.names = names;
    }
}

export type WebPackageInput = {
    project: GameProjectDocument;
    /** public/engine/player.js */
    playerJs: string;
    /** The bytes of every sound and model, by hash. */
    assets: ReadonlyMap<string, ArrayBuffer | Uint8Array>;
    /** PNG bytes of WEB_ICONS, by path. */
    icons: ReadonlyMap<string, ArrayBuffer | Uint8Array>;
    siteUrl: string;
    /** false: no "Made with Hanogt Engine" badge (Plus and Pro). */
    badge?: boolean;
};

const asBytes = (value: ArrayBuffer | Uint8Array) => (value instanceof Uint8Array ? value : new Uint8Array(value));

async function sha256(text: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Every file of the package by path. The service worker's cache is named after the game and the player, so a new export replaces the old cache. */
export async function webPackageFiles(input: WebPackageInput): Promise<Map<string, string | Uint8Array>> {
    const { project } = input;
    const assets = packageAssets(project);
    const missing = [...project.audio, ...project.models].filter((asset) => !input.assets.has(asset.hash)).map((asset) => asset.name);
    if (missing.length) throw new WebPackageError("missing_files", [...new Set(missing)]);
    const missingIcons = WEB_ICONS.filter((path) => !input.icons.has(path));
    if (missingIcons.length) throw new WebPackageError("missing_icons", [...missingIcons]);
    const game = JSON.stringify(packageGameJson(project));
    const version = (await sha256(`${game}\n${input.playerJs}`)).slice(0, 16);
    const files = new Map<string, string | Uint8Array>([
        ["index.html", webIndexHtml(project, input.siteUrl, { badge: input.badge })],
        ["player.js", input.playerJs],
        ["game.json", game],
        ["manifest.webmanifest", `${JSON.stringify(webManifest(project, { badge: input.badge }), null, 2)}\n`],
        ["sw.js", serviceWorkerSource(project.id, version, packageFiles(project))],
        ["README.txt", webReadme(project)],
    ]);
    for (const [hash, path] of Object.entries(assets)) files.set(path, asBytes(input.assets.get(hash) as ArrayBuffer | Uint8Array));
    for (const path of WEB_ICONS) files.set(path, asBytes(input.icons.get(path) as ArrayBuffer | Uint8Array));
    return files;
}

/** The package as a ZIP (index.html at the top, as itch.io and static hosts expect). */
export async function zipWebPackage(files: ReadonlyMap<string, string | Uint8Array>): Promise<Uint8Array> {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const date = new Date();
    for (const [path, content] of files) zip.file(path, content, { date });
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
