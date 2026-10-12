/**
 * On-screen touch controls (V6): layout settings, the virtual joystick's math
 * and vibration (Input.Vibrate). The player's overlay draws the controls; the
 * input manager turns them into axes, keys and input actions.
 */
import { ACTION_NAME } from "./input-actions";
import type { TouchButtonSetting, TouchLayout } from "./types";

export const TOUCH_LIMITS = {
    maxButtons: 4,
    minSize: 80,
    maxSize: 220,
    labelLength: 6,
    maxDeadZone: 0.9,
    /** Longest vibration Input.Vibrate asks for. */
    maxVibrateMs: 5000,
} as const;

/** The controls of V5 and older projects: an arrow pad on the left, A (Space) and B (LeftControl) on the right. */
export function classicTouchLayout(): TouchLayout {
    return { stick: "dpad", side: "left", size: 130, deadZone: 0.15, buttons: [] };
}

/** New V6 projects: a joystick on the left, Jump and Fire1 buttons on the right. */
export function defaultTouchLayout(): TouchLayout {
    return { stick: "joystick", side: "left", size: 130, deadZone: 0.15, buttons: [{ action: "Jump", label: "A" }, { action: "Fire1", label: "B" }] };
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Short button text: printable, at most 6 characters. */
export function cleanTouchLabel(value: unknown, fallback: string): string {
    const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, TOUCH_LIMITS.labelLength) : "";
    return text || fallback;
}

/** Clamps untrusted settings; documents without them keep the V5 controls. */
export function normalizeTouchLayout(value: unknown): TouchLayout {
    if (!isRecord(value)) return classicTouchLayout();
    const number = (raw: unknown, fallback: number, min: number, max: number) => (typeof raw === "number" && Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback);
    const buttons: TouchButtonSetting[] = [];
    for (const raw of Array.isArray(value.buttons) ? value.buttons : []) {
        if (!isRecord(raw)) continue;
        const action = typeof raw.action === "string" ? raw.action.trim() : "";
        if (!ACTION_NAME.test(action)) continue;
        buttons.push({ action, label: cleanTouchLabel(raw.label, action.slice(0, TOUCH_LIMITS.labelLength)) });
        if (buttons.length >= TOUCH_LIMITS.maxButtons) break;
    }
    return {
        stick: value.stick === "joystick" ? "joystick" : "dpad",
        side: value.side === "right" ? "right" : "left",
        size: Math.round(number(value.size, 130, TOUCH_LIMITS.minSize, TOUCH_LIMITS.maxSize)),
        deadZone: number(value.deadZone, 0.15, 0, TOUCH_LIMITS.maxDeadZone),
        buttons,
    };
}

/**
 * The joystick's value for a finger `dx`, `dy` pixels from its centre (screen
 * y points down): x right, y up, length at most 1. Inside the dead zone it is
 * zero; past it the length starts again from 0, so small moves stay precise.
 */
export function joystickVector(dx: number, dy: number, radius: number, deadZone: number): { x: number; y: number } {
    const distance = Math.hypot(dx, dy);
    if (!(distance > 0)) return { x: 0, y: 0 };
    const zone = Math.min(TOUCH_LIMITS.maxDeadZone, Math.max(0, deadZone));
    const magnitude = Math.min(1, distance / Math.max(1, radius));
    if (magnitude <= zone) return { x: 0, y: 0 };
    const scaled = (magnitude - zone) / (1 - zone);
    return { x: (dx / distance) * scaled, y: (-dy / distance) * scaled };
}

// ---------------------------------------------------------------------------
// Vibration
// ---------------------------------------------------------------------------

interface HapticActuatorLike {
    playEffect?: (type: string, params: Record<string, number>) => unknown;
    pulse?: (value: number, duration: number) => unknown;
    reset?: () => unknown;
}

interface GamepadLike {
    connected?: boolean;
    vibrationActuator?: HapticActuatorLike | null;
    hapticActuators?: ArrayLike<HapticActuatorLike> | null;
}

/** The parts of `navigator` vibration uses (tests pass their own). */
export interface VibrationHost {
    getGamepads?: () => ArrayLike<GamepadLike | null>;
    vibrate?: (pattern: number | number[]) => boolean;
}

/** Swallows a rejected haptics promise (some browsers refuse without a user gesture). */
function settle(result: unknown) {
    if (result && typeof (result as Promise<unknown>).catch === "function") (result as Promise<unknown>).catch(() => undefined);
}

/**
 * Input.Vibrate: rumbles every connected gamepad that has a haptic actuator
 * (strength 0–1); without one, vibrates the phone with navigator.vibrate (its
 * strength can't be set). 0 ms stops a running vibration. Returns what was used.
 */
export function vibrate(host: VibrationHost | null | undefined, milliseconds: number, strength = 1): "gamepad" | "device" | "none" {
    if (!host) return "none";
    const duration = Math.round(Math.min(TOUCH_LIMITS.maxVibrateMs, Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0)));
    const power = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 1));
    const stop = duration <= 0 || power <= 0;
    let used = false;
    try {
        for (const pad of Array.from(host.getGamepads?.() ?? [])) {
            if (!pad || pad.connected === false) continue;
            const actuator = pad.vibrationActuator;
            if (actuator && typeof actuator.playEffect === "function") {
                settle(stop ? actuator.reset?.() : actuator.playEffect("dual-rumble", { startDelay: 0, duration, strongMagnitude: power, weakMagnitude: power }));
                used = true;
                continue;
            }
            const haptic = pad.hapticActuators?.[0];
            if (haptic && typeof haptic.pulse === "function") {
                settle(haptic.pulse(stop ? 0 : power, stop ? 0 : duration));
                used = true;
            }
        }
    } catch {
        // A browser without gamepad access (permissions policy) falls back to the device.
    }
    if (used) return "gamepad";
    if (typeof host.vibrate === "function") {
        try {
            if (host.vibrate(stop ? 0 : duration)) return "device";
        } catch {
            return "none";
        }
    }
    return "none";
}
