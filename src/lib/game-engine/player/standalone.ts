/**
 * Entry point of the standalone player bundle (public/engine/player.js) used
 * by exported HTML builds. Reads the embedded project and starts it after the
 * player presses "Play" (browsers only allow audio after a user gesture).
 */
import { normalizeProject } from "../schema";
import { GamePlayer } from "./game-player";

function boot() {
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
