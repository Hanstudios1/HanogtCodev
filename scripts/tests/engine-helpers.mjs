// Shared helpers of the Hanogt Engine tests: start a project the way the
// player does (normalize, compile, run frames) with virtual input.
import assert from "node:assert/strict";
import { load } from "./setup.mjs";

const { normalizeProject } = await load("lib/game-engine/schema.ts");
const { compileScripts } = await load("lib/game-engine/script/compiler.ts");
const { RuntimeWorld } = await load("lib/game-engine/runtime/world.ts");

export function memoryStorage() {
    const store = new Map();
    return { store, getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
}

/** Normalizes, compiles and starts a project the way the player does. */
export function startWorld(project, options = {}) {
    const normalized = normalizeProject(JSON.parse(JSON.stringify(project)));
    const program = compileScripts(normalized.scripts);
    const errors = program.diagnostics.filter((item) => item.severity === "error");
    assert.deepEqual(errors.map((item) => `${item.file ?? ""}:${item.line}: ${item.message}`), [], "scripts compile");
    const logs = [];
    const world = new RuntimeWorld({
        project: normalized,
        program,
        sceneId: options.sceneId ?? null,
        storage: options.storage ?? memoryStorage(),
        audio: options.audio,
        getScreenSize: () => ({ width: 960, height: 540 }),
        locale: options.locale,
        onLog: (entry, updated) => {
            if (!updated) logs.push(entry);
        },
    });
    world.start();
    const step = (frames = 1) => {
        for (let index = 0; index < frames; index += 1) world.step(1 / 60);
    };
    const find = (name) => [...world.entities.values()].find((item) => item.name === name);
    const findAll = (prefix) => [...world.entities.values()].filter((item) => item.name.startsWith(prefix));
    /** Presses a key for one frame and lets one more frame run. */
    const press = (key, frames = 1) => {
        world.input.setVirtualKey(key, true);
        step(frames);
        world.input.setVirtualKey(key, false);
        step(1);
    };
    const hold = (key, down) => world.input.setVirtualKey(key, down);
    const text = (name) => find(name)?.components.find((component) => component.type === "uiText")?.text;
    /** Live fields of the first script on an object (private ones too), e.g. fields("Snake").score. */
    const fields = (name, className) => find(name)?.behaviours.find((state) => !className || state.cls.name === className)?.object.fields;
    const messages = (level) => logs.filter((entry) => !level || entry.level === level).map((entry) => entry.message);
    const problems = () => logs.filter((entry) => entry.level === "error" || entry.level === "warning").map((entry) => entry.message);
    return { world, logs, step, find, findAll, press, hold, text, fields, messages, problems, project: normalized, program };
}
