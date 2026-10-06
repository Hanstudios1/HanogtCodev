/**
 * Input actions (V4): named buttons and axes bound to keys, mouse buttons and
 * gamepad controls, like Unity's Input Manager. Scripts read them with
 * Input.GetButton / GetButtonDown / GetButtonUp / GetAxis / GetAxisRaw.
 */
import { isKeyCode } from "./key-codes";
import type { PlayerInputComponent } from "./types";

/** Standard Gamepad API button order (index = position in this list). */
export const GAMEPAD_BUTTONS = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start", "LS", "RS", "DpadUp", "DpadDown", "DpadLeft", "DpadRight"] as const;
export type GamepadButtonName = (typeof GAMEPAD_BUTTONS)[number];

/** Standard Gamepad API axes (index = position in this list); Y axes point down. */
export const GAMEPAD_AXES = ["LeftStickX", "LeftStickY", "RightStickX", "RightStickY"] as const;
export type GamepadAxisName = (typeof GAMEPAD_AXES)[number];

export interface InputAction {
    name: string;
    kind: "button" | "axis";
    /** Keys (KeyCode names, Mouse0–Mouse2) that press the button or push the axis to +1. */
    positive: string[];
    /** Keys that push the axis to −1 (axes only). */
    negative: string[];
    /** Gamepad buttons that press the button or push the axis to +1. */
    gamepadPositive: GamepadButtonName[];
    /** Gamepad buttons that push the axis to −1 (axes only). */
    gamepadNegative: GamepadButtonName[];
    /** Analog stick axis of an axis action. */
    gamepadAxis: GamepadAxisName | null;
    /** Flips the stick axis (gamepad Y axes point down; Unity's point up). */
    invert: boolean;
}

export interface InputSettings {
    actions: InputAction[];
    /** Stick values below this count as zero. */
    deadZone: number;
}

export const INPUT_LIMITS = { maxActions: 32, maxBindings: 8, nameLength: 32 } as const;
export const ACTION_NAME = /^[A-Za-z][A-Za-z0-9 _]{0,31}$/;

function action(name: string, kind: InputAction["kind"], bindings: Partial<Omit<InputAction, "name" | "kind">>): InputAction {
    return { name, kind, positive: [], negative: [], gamepadPositive: [], gamepadNegative: [], gamepadAxis: null, invert: false, ...bindings };
}

/** Unity's default axes and buttons, plus a right-stick "look" pair. */
export function defaultInputSettings(): InputSettings {
    return {
        deadZone: 0.2,
        actions: [
            action("Horizontal", "axis", { positive: ["D", "RightArrow"], negative: ["A", "LeftArrow"], gamepadPositive: ["DpadRight"], gamepadNegative: ["DpadLeft"], gamepadAxis: "LeftStickX" }),
            action("Vertical", "axis", { positive: ["W", "UpArrow"], negative: ["S", "DownArrow"], gamepadPositive: ["DpadUp"], gamepadNegative: ["DpadDown"], gamepadAxis: "LeftStickY", invert: true }),
            action("Jump", "button", { positive: ["Space"], gamepadPositive: ["A"] }),
            action("Fire1", "button", { positive: ["LeftControl", "Mouse0"], gamepadPositive: ["RT", "X"] }),
            action("Fire2", "button", { positive: ["LeftAlt", "Mouse1"], gamepadPositive: ["LT"] }),
            action("Fire3", "button", { positive: ["LeftShift", "Mouse2"], gamepadPositive: ["Y"] }),
            action("Submit", "button", { positive: ["Return", "KeypadEnter", "Space"], gamepadPositive: ["A", "Start"] }),
            action("Cancel", "button", { positive: ["Escape"], gamepadPositive: ["B", "Back"] }),
            action("LookX", "axis", { gamepadAxis: "RightStickX" }),
            action("LookY", "axis", { gamepadAxis: "RightStickY", invert: true }),
        ],
    };
}

const isKey = (value: unknown): value is string => isKeyCode(value) && value !== "None";
const isPadButton = (value: unknown): value is GamepadButtonName => typeof value === "string" && (GAMEPAD_BUTTONS as readonly string[]).includes(value);
const isPadAxis = (value: unknown): value is GamepadAxisName => typeof value === "string" && (GAMEPAD_AXES as readonly string[]).includes(value);

function list<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(guard))].slice(0, INPUT_LIMITS.maxBindings);
}

/** Clamps untrusted input settings; missing settings get the defaults. */
export function normalizeInputSettings(value: unknown): InputSettings {
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaultInputSettings();
    const source = value as Record<string, unknown>;
    const deadZone = typeof source.deadZone === "number" && Number.isFinite(source.deadZone) ? Math.min(0.9, Math.max(0, source.deadZone)) : 0.2;
    if (!Array.isArray(source.actions)) return { ...defaultInputSettings(), deadZone };
    const names = new Set<string>();
    const actions: InputAction[] = [];
    for (const raw of source.actions) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const item = raw as Record<string, unknown>;
        const name = typeof item.name === "string" ? item.name.trim() : "";
        if (!ACTION_NAME.test(name) || names.has(name.toLowerCase())) continue;
        names.add(name.toLowerCase());
        const kind = item.kind === "axis" ? "axis" : "button";
        actions.push({
            name,
            kind,
            positive: list(item.positive, isKey),
            negative: kind === "axis" ? list(item.negative, isKey) : [],
            gamepadPositive: list(item.gamepadPositive, isPadButton),
            gamepadNegative: kind === "axis" ? list(item.gamepadNegative, isPadButton) : [],
            gamepadAxis: kind === "axis" && isPadAxis(item.gamepadAxis) ? item.gamepadAxis : null,
            invert: kind === "axis" && item.invert === true,
        });
        if (actions.length >= INPUT_LIMITS.maxActions) break;
    }
    return { actions, deadZone };
}

// ---------------------------------------------------------------------------
// Split keyboard (local multiplayer, V5)
// ---------------------------------------------------------------------------

export type KeyboardHalf = "left" | "right";

const LEFT_KEYS = new Set([
    "Q", "W", "E", "R", "T", "A", "S", "D", "F", "G", "Z", "X", "C", "V", "B",
    "Alpha1", "Alpha2", "Alpha3", "Alpha4", "Alpha5", "Space", "LeftShift", "LeftControl", "LeftAlt", "Tab", "CapsLock", "BackQuote",
    // The player on the left keeps the mouse.
    "Mouse0", "Mouse1", "Mouse2",
]);

const RIGHT_KEYS = new Set([
    "Y", "U", "I", "O", "P", "H", "J", "K", "L", "N", "M",
    "Alpha6", "Alpha7", "Alpha8", "Alpha9", "Alpha0", "UpArrow", "DownArrow", "LeftArrow", "RightArrow",
    "RightShift", "RightControl", "RightAlt", "Return", "KeypadEnter", "Backspace", "Insert", "Delete", "Home", "End", "PageUp", "PageDown",
    "Minus", "Equals", "LeftBracket", "RightBracket", "Backslash", "Semicolon", "Quote", "Comma", "Period", "Slash",
    "Keypad0", "Keypad1", "Keypad2", "Keypad3", "Keypad4", "Keypad5", "Keypad6", "Keypad7", "Keypad8", "Keypad9",
    "KeypadPlus", "KeypadMinus", "KeypadMultiply", "KeypadDivide", "KeypadPeriod",
]);

/** Keys that stand in on the other half when an action has none there (WASD ↔ arrows, Space ↔ Enter…). */
const MIRROR: Record<string, string> = {
    W: "UpArrow", A: "LeftArrow", S: "DownArrow", D: "RightArrow", Space: "Return",
    LeftShift: "RightShift", LeftControl: "RightControl", LeftAlt: "RightAlt",
    UpArrow: "W", LeftArrow: "A", DownArrow: "S", RightArrow: "D", Return: "Space", KeypadEnter: "Space",
    RightShift: "LeftShift", RightControl: "LeftControl", RightAlt: "LeftAlt",
};

/** The half of the keyboard a key is on; null for keys both players share (Escape, F1…). */
export function keyboardHalfOf(key: string): KeyboardHalf | null {
    return LEFT_KEYS.has(key) ? "left" : RIGHT_KEYS.has(key) ? "right" : null;
}

/**
 * The keys a split-keyboard player presses for a binding: those on its half
 * (and shared ones); when the binding has none there, the mirrored keys.
 */
export function keysForHalf(keys: readonly string[], half: KeyboardHalf): string[] {
    const own = keys.filter((key) => {
        const side = keyboardHalfOf(key);
        return side === half || side === null;
    });
    if (own.length || !keys.length) return own;
    return [...new Set(keys.map((key) => MIRROR[key]).filter((key): key is string => Boolean(key) && keyboardHalfOf(key) === half))];
}

/** Which devices a player's input comes from (local multiplayer, V5). */
export interface InputSourceSpec {
    /** Keyboard keys the player reads: all, one half of the keyboard, or none. */
    keyboard: "all" | KeyboardHalf | "none";
    mouse: boolean;
    /** The on-screen touch buttons. */
    touch: boolean;
    /** Gamepad slot 0–3, or null. */
    pad: number | null;
}

/** The devices of a Player Input component's scheme. */
export function inputSourceOf(component: Pick<PlayerInputComponent, "player" | "scheme" | "gamepad">): InputSourceSpec {
    const pad = Math.max(0, Math.min(4, Math.trunc(component.gamepad) || 1) - 1);
    switch (component.scheme) {
        case "keyboard": return { keyboard: "all", mouse: true, touch: true, pad };
        case "keyboardLeft": return { keyboard: "left", mouse: true, touch: component.player === 1, pad: null };
        case "keyboardRight": return { keyboard: "right", mouse: false, touch: false, pad: null };
        case "gamepad": return { keyboard: "none", mouse: false, touch: false, pad };
        case "auto":
        default:
            // Player 1 keeps everything single-player games use; the others get their gamepad.
            return component.player === 1 ? { keyboard: "all", mouse: true, touch: true, pad } : { keyboard: "none", mouse: false, touch: false, pad };
    }
}

/** The keys of a binding a player presses (a split keyboard keeps its half, mirroring when needed). */
export function playerKeys(keys: readonly string[], spec: InputSourceSpec): string[] {
    const usable = spec.keyboard === "all" ? [...keys] : spec.keyboard === "none" ? keys.filter((key) => key.startsWith("Mouse")) : keysForHalf(keys, spec.keyboard);
    return spec.mouse ? usable : usable.filter((key) => !key.startsWith("Mouse"));
}
