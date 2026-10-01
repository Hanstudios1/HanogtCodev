/**
 * Keyframe animation math shared by the Animation component, the Tween API
 * and the editor: easing curves, clip time wrapping and track sampling.
 */
import { EASINGS, type AnimationClip, type AnimationProperty, type AnimationTrack, type AnimationValue, type Easing, type GameDimension, type Vector3 } from "./types";

const C1 = 1.70158;
const C2 = C1 * 1.525;
const C3 = C1 + 1;
const C4 = (2 * Math.PI) / 3;

function bounceOut(x: number): number {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/** Maps 0…1 progress through an easing curve (Back and Elastic overshoot on purpose). */
export function ease(easing: Easing, t: number): number {
    const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
    switch (easing) {
        case "linear": return x;
        case "inQuad": return x * x;
        case "outQuad": return 1 - (1 - x) * (1 - x);
        case "inOutQuad": return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        case "inCubic": return x * x * x;
        case "outCubic": return 1 - Math.pow(1 - x, 3);
        case "inOutCubic": return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
        case "inSine": return 1 - Math.cos((x * Math.PI) / 2);
        case "outSine": return Math.sin((x * Math.PI) / 2);
        case "inOutSine": return -(Math.cos(Math.PI * x) - 1) / 2;
        case "inBack": return C3 * x * x * x - C1 * x * x;
        case "outBack": return 1 + C3 * Math.pow(x - 1, 3) + C1 * Math.pow(x - 1, 2);
        case "inOutBack":
            return x < 0.5
                ? (Math.pow(2 * x, 2) * ((C2 + 1) * 2 * x - C2)) / 2
                : (Math.pow(2 * x - 2, 2) * ((C2 + 1) * (x * 2 - 2) + C2) + 2) / 2;
        case "inElastic": return x === 0 || x === 1 ? x : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * C4);
        case "outElastic": return x === 0 || x === 1 ? x : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * C4) + 1;
        case "inBounce": return 1 - bounceOut(1 - x);
        case "outBounce": return bounceOut(x);
        case "step": return x < 1 ? 0 : 1;
    }
}

/** "OutQuad", "Ease.OutQuad" and "outQuad" all name the same curve. */
export function easingFromName(value: unknown, fallback: Easing = "linear"): Easing {
    if (typeof value !== "string") return fallback;
    const name = value.trim().replace(/^Ease\./, "").toLowerCase();
    return EASINGS.find((easing) => easing.toLowerCase() === name) ?? fallback;
}

/** Converts elapsed clip time into time inside the clip. */
export function wrapClipTime(clip: Pick<AnimationClip, "duration" | "wrap">, time: number): { time: number; finished: boolean } {
    const duration = Math.max(1e-4, clip.duration);
    const elapsed = Math.max(0, time);
    switch (clip.wrap) {
        case "loop": return { time: elapsed % duration, finished: false };
        case "pingPong": {
            const cycle = elapsed % (duration * 2);
            return { time: cycle <= duration ? cycle : duration * 2 - cycle, finished: false };
        }
        default: return { time: Math.min(elapsed, duration), finished: elapsed >= duration };
    }
}

function hexToRgb(hex: string): [number, number, number] {
    const clean = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? "ffffff";
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

export function lerpColor(from: string, to: string, t: number): string {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    const channel = (index: number) => Math.round(Math.min(255, Math.max(0, a[index] + (b[index] - a[index]) * t))).toString(16).padStart(2, "0");
    return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function asVector(value: AnimationValue): Vector3 {
    return typeof value === "object" && value !== null ? value : { x: 0, y: 0, z: 0 };
}

function interpolate(property: AnimationProperty, from: AnimationValue, to: AnimationValue, t: number): AnimationValue {
    switch (property) {
        case "position":
        case "rotation":
        case "scale": {
            const a = asVector(from);
            const b = asVector(to);
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
        }
        case "color":
            return lerpColor(String(from), String(to), t);
        case "frame":
            return from;
        default: {
            const a = Number(from) || 0;
            const b = Number(to) || 0;
            return a + (b - a) * t;
        }
    }
}

/** Value of a track at a time inside the clip (keys are sorted by time). */
export function sampleTrack(track: AnimationTrack, time: number): AnimationValue | null {
    const keys = track.keys;
    if (!keys.length) return null;
    if (time <= keys[0].time) return keys[0].value;
    const last = keys[keys.length - 1];
    if (time >= last.time) return last.value;
    let index = 0;
    while (index < keys.length - 2 && keys[index + 1].time <= time) index += 1;
    const from = keys[index];
    const to = keys[index + 1];
    const span = to.time - from.time;
    const t = span > 1e-9 ? (time - from.time) / span : 1;
    return interpolate(track.property, from.value, to.value, ease(from.easing, t));
}

export type ClipSample = Partial<Record<AnimationProperty, AnimationValue>>;

export function sampleClip(clip: AnimationClip, time: number): ClipSample {
    const output: ClipSample = {};
    for (const track of clip.tracks) {
        const value = sampleTrack(track, time);
        if (value !== null) output[track.property] = value;
    }
    return output;
}

// ---------------------------------------------------------------------------
// Editor presets
// ---------------------------------------------------------------------------

export const ANIMATION_PRESETS = ["bob", "spin", "pulse", "shake", "fadeOut", "flash", "frames"] as const;
export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];

/** Ready-made clips offered by the Inspector ("Add clip → Bob", …). */
export function animationPreset(kind: AnimationPreset, dimension: GameDimension, frames = 4, fps = 8): AnimationClip {
    const v = (x: number, y: number, z: number): Vector3 => ({ x, y, z });
    switch (kind) {
        case "bob":
            return { name: "Bob", duration: 0.8, wrap: "pingPong", tracks: [{ property: "position", keys: [{ time: 0, value: v(0, 0, 0), easing: "inOutSine" }, { time: 0.8, value: v(0, 0.25, 0), easing: "linear" }] }] };
        case "spin":
            return { name: "Spin", duration: 2, wrap: "loop", tracks: [{ property: "rotation", keys: [{ time: 0, value: v(0, 0, 0), easing: "linear" }, { time: 2, value: dimension === "2d" ? v(0, 0, -360) : v(0, 360, 0), easing: "linear" }] }] };
        case "pulse":
            return { name: "Pulse", duration: 0.5, wrap: "pingPong", tracks: [{ property: "scale", keys: [{ time: 0, value: v(1, 1, 1), easing: "inOutSine" }, { time: 0.5, value: v(1.15, 1.15, 1.15), easing: "linear" }] }] };
        case "shake": {
            const keys = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map((time, index) => ({ time, value: v(index === 0 || index === 6 ? 0 : (index % 2 ? 0.12 : -0.12) * (1 - index / 7), 0, 0), easing: "linear" as Easing }));
            return { name: "Shake", duration: 0.3, wrap: "once", tracks: [{ property: "position", keys }] };
        }
        case "fadeOut":
            return { name: "FadeOut", duration: 0.6, wrap: "once", tracks: [{ property: "opacity", keys: [{ time: 0, value: 1, easing: "outQuad" }, { time: 0.6, value: 0, easing: "linear" }] }] };
        case "flash":
            return { name: "Flash", duration: 0.3, wrap: "once", tracks: [{ property: "color", keys: [{ time: 0, value: "#ffffff", easing: "linear" }, { time: 0.15, value: "#ef4444", easing: "linear" }, { time: 0.3, value: "#ffffff", easing: "linear" }] }] };
        case "frames": {
            const count = Math.max(1, Math.min(64, Math.round(frames)));
            const rate = Math.max(1, Math.min(60, fps));
            const keys = Array.from({ length: count }, (_, index) => ({ time: Math.round((index / rate) * 1000) / 1000, value: index, easing: "step" as Easing }));
            return { name: "Frames", duration: Math.round((count / rate) * 1000) / 1000, wrap: "loop", tracks: [{ property: "frame", keys }] };
        }
    }
}
