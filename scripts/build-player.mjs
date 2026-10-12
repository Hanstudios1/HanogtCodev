// Bundles the standalone game player used by "Export → Playable HTML" into
// public/engine/player.js (served from our own origin, inlined into exports).
// Editor-only code (camera controls, gizmos, picking) lives in
// render/editor-renderer.ts, which the player never imports.
import path from "node:path";
import fs from "node:fs";
import { build } from "esbuild";
import { playerBuildOptions } from "./player-build-options.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outfile = path.join(root, "public", "engine", "player.js");
fs.mkdirSync(path.dirname(outfile), { recursive: true });

const started = Date.now();
await build({ ...playerBuildOptions(root), outfile, logLevel: "warning" });
const size = fs.statSync(outfile).size;
console.log(`Hanogt oyun oynatıcısı derlendi: public/engine/player.js (${Math.round(size / 1024)} KB, ${Date.now() - started} ms).`);
