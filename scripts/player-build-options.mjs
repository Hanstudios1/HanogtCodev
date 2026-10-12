// esbuild settings of the standalone game player (public/engine/player.js),
// shared by scripts/build-player.mjs and the engine tests so both build the same bundle.
//
// Target ES2020: the player needs WebGL 2 (three.js r163+), and every browser
// with WebGL 2 that is still in use runs ES2020, so optional chaining and `??`
// stay as they are instead of being expanded (about 18 KiB smaller). The site
// itself targets far newer browsers.
import path from "node:path";

export const PLAYER_TARGET = "es2020";

/** Size budget of player.js in KiB (the engine tests check it). */
export const PLAYER_BUDGET_KIB = 1300;

export function playerBuildOptions(root) {
    return {
        entryPoints: [path.join(root, "src", "lib", "game-engine", "player", "standalone.ts")],
        bundle: true,
        minify: true,
        format: "iife",
        target: [PLAYER_TARGET],
        platform: "browser",
        legalComments: "none",
        define: { "process.env.NODE_ENV": '"production"' },
    };
}
