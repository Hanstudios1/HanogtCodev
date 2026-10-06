/**
 * Entry point of the standalone player bundle (public/engine/player.js) used
 * by exported games: a single HTML file carries the project and its files
 * inside the page; a web package (V5) has them next to it (game.json and
 * assets/). Starts the game after the player presses "Play" (browsers only
 * allow audio after a user gesture).
 */
import { registerEmbeddedAudio, registerPackagedFiles } from "../audio-store";
import { normalizeProject } from "../schema";
import { GamePlayer } from "./game-player";

const HASH = /^[0-9a-f]{64}$/;
/** Paths a web package may list for its files (nothing outside assets/). */
const PACKAGE_PATH = /^assets\/[0-9a-f]{64}\.(?:wav|mp3|ogg|glb|bin)$/;

function hashMap(value: unknown, keep: (path: string) => boolean): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => HASH.test(entry[0]) && typeof entry[1] === "string" && keep(entry[1])));
}

/** The project of the page: embedded in a single-file export, or game.json of a web package. */
async function readGame(): Promise<unknown> {
    // Audio files travel inside the HTML file ({ hash: base64 }), so the game plays offline.
    try {
        registerEmbeddedAudio(hashMap(JSON.parse(document.getElementById("hanogt-audio")?.textContent || "{}"), () => true));
    } catch {
        // A game without sounds still plays.
    }
    const embedded = document.getElementById("hanogt-game")?.textContent;
    if (embedded) return JSON.parse(embedded);
    const response = await fetch("game.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`game.json (${response.status})`);
    const parsed = await response.json() as { files?: unknown };
    registerPackagedFiles(hashMap(parsed.files, (path) => PACKAGE_PATH.test(path)));
    return parsed;
}

async function boot() {
    const root = document.getElementById("game");
    if (!root) return;
    let player: GamePlayer;
    try {
        const parsed = await readGame() as { project?: unknown };
        const project = normalizeProject(parsed.project ?? parsed);
        document.title = project.name;
        player = new GamePlayer(root, { project, touchControls: project.settings.touchControls ? "auto" : false });
    } catch (error) {
        const fallback = (window as unknown as { HANOGT_LOAD_FAILED?: string }).HANOGT_LOAD_FAILED || "Oyun yüklenemedi.";
        const note = document.getElementById("note");
        // A web package opened from disk already says how to serve it; that note stays.
        if (note && location.protocol === "file:") return;
        if (note) note.textContent = fallback;
        else root.textContent = error instanceof Error ? `${fallback} ${error.message}` : fallback;
        return;
    }
    const start = document.getElementById("start");
    const button = document.getElementById("play");
    const launch = () => {
        start?.remove();
        player.start();
    };
    // A web package shows Play disabled until its game.json has loaded.
    if (button instanceof HTMLButtonElement) button.disabled = false;
    if (button) button.addEventListener("click", launch, { once: true });
    else launch();
    window.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && document.getElementById("start")) launch();
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
else void boot();
