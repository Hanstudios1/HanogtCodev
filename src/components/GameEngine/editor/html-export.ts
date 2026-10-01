"use client";

/**
 * Builds a single self-contained HTML file that plays the project offline.
 * The player runtime (public/engine/player.js, built from
 * src/lib/game-engine/player/standalone.ts) is inlined into the page.
 */
import { ENGINE_VERSION, ENGINE_VERSION_LABEL, GAME_ENGINE_SCHEMA_VERSION, type GameProjectDocument } from "@/lib/game-engine/types";
import { SITE_URL } from "@/lib/site";
import { downloadBlob, safeFileName } from "./persistence";

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}

/** JSON that is safe to embed inside a <script> element. */
function embedJson(value: unknown) {
    return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export async function buildStandaloneHtml(project: GameProjectDocument): Promise<string> {
    const response = await fetch("/engine/player.js", { cache: "no-cache" });
    if (!response.ok) throw new Error("Oynatıcı paketi indirilemedi. Sayfayı yenileyip tekrar deneyin.");
    const runtime = (await response.text()).replace(/<\/script/gi, "<\\/script");
    const title = escapeHtml(project.name);
    return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="Hanogt Engine ${ENGINE_VERSION}">
<title>${title}</title>
<style>
html,body{margin:0;height:100%;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
#game{position:fixed;inset:0}
#start{position:fixed;inset:0;display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,#312e81 0,#09090b 70%);z-index:10}
#start .card{text-align:center;padding:24px}
#start h1{font-size:clamp(24px,5vw,44px);margin:0 0 8px;font-weight:900;letter-spacing:-.02em}
#start p{margin:0 0 22px;color:#c7d2fe;opacity:.85}
#start button{font:inherit;font-weight:800;font-size:18px;padding:14px 34px;border:0;border-radius:999px;background:linear-gradient(90deg,#6366f1,#a855f7);color:#fff;cursor:pointer;box-shadow:0 12px 40px rgba(99,102,241,.45)}
#badge{position:fixed;right:10px;bottom:10px;z-index:11;font-size:11px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.55);color:#a5b4fc;text-decoration:none}
</style>
</head>
<body>
<div id="game"></div>
<div id="start"><div class="card"><h1>${title}</h1><p>${ENGINE_VERSION_LABEL} ile yapıldı</p><button type="button" id="play">▶ Oyna</button></div></div>
<a id="badge" href="${escapeHtml(SITE_URL)}/arcade" target="_blank" rel="noopener">Made with ${ENGINE_VERSION_LABEL}</a>
<script type="application/json" id="hanogt-game">${embedJson({ format: "hanogt-engine-project", version: GAME_ENGINE_SCHEMA_VERSION, project })}</script>
<script>${runtime}</script>
</body>
</html>`;
}

export async function exportStandaloneHtml(project: GameProjectDocument) {
    const html = await buildStandaloneHtml(project);
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${safeFileName(project.name)}.html`);
}
