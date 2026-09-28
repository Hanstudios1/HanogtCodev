// Bundles the standalone game player used by "Export → Playable HTML" into
// public/engine/player.js (served from our own origin, inlined into exports).
import path from "node:path";
import fs from "node:fs";
import { build } from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outfile = path.join(root, "public", "engine", "player.js");
fs.mkdirSync(path.dirname(outfile), { recursive: true });

const started = Date.now();
await build({
    entryPoints: [path.join(root, "src", "lib", "game-engine", "player", "standalone.ts")],
    outfile,
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2019"],
    platform: "browser",
    legalComments: "none",
    logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
});
const size = fs.statSync(outfile).size;
console.log(`Hanogt oyun oynatıcısı derlendi: public/engine/player.js (${Math.round(size / 1024)} KB, ${Date.now() - started} ms).`);
