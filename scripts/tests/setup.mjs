// Registers the TypeScript resolution hooks; import this first, then load
// project modules with `await import(...)` (static imports resolve too early).
import { register } from "node:module";

register("./ts-hooks.mjs", import.meta.url);

/** Imports a module from src/ (e.g. "lib/runtimes/brainfuck.ts"). */
export function load(path) {
    return import(new URL(`../../src/${path}`, import.meta.url).href);
}

export const ROOT = new URL("../../", import.meta.url);
