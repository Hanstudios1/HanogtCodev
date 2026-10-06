/**
 * Entry point of the standalone player bundle (public/engine/player.js) used
 * by exported HTML builds. Reads the embedded project and starts it after the
 * player presses "Play" (browsers only allow audio after a user gesture).
 */
import { registerEmbeddedAudio } from "../audio-store";
import { normalizeProject } from "../schema";
import { GamePlayer } from "./game-player";

function boot() {
    // Audio files travel inside the HTML file ({ hash: base64 }), so the game plays offline.
    try {
        const audio = JSON.parse(document.getElementById("hanogt-audio")?.textContent || "{}") as unknown;
        if (audio && typeof audio === "object" && !Array.isArray(audio)) {
            registerEmbeddedAudio(Object.fromEntries(Object.entries(audio as Record<string, unknown>).filter((entry): entry is [string, string] => /^[0-9a-f]{64}$/.test(entry[0]) && typeof entry[1] === "string")));
        }
    } catch {
        // A game without sounds still plays.
    }
    const data = document.getElementById("hanogt-game")?.textContent;
    const root = document.getElementById("game");
    if (!data || !root) return;
    let player: GamePlayer;
    try {
        const parsed = JSON.parse(data) as { project?: unknown };
        const project = normalizeProject(parsed.project ?? parsed);
        document.title = project.name;
        player = new GamePlayer(root, { project, touchControls: project.settings.touchControls ? "auto" : false });
    } catch (error) {
        root.textContent = error instanceof Error ? error.message : "Oyun yüklenemedi.";
        return;
    }
    const start = document.getElementById("start");
    const button = document.getElementById("play");
    const launch = () => {
        start?.remove();
        player.start();
    };
    if (button) button.addEventListener("click", launch, { once: true });
    else launch();
    window.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && document.getElementById("start")) launch();
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
