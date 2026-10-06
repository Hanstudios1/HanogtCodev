/**
 * Plays the clips of an Animation component on a live entity.
 *
 * Position and rotation keys are applied as deltas on top of whatever the
 * object is doing (scripts, physics), so a bobbing coin can also be moved by
 * code. Scale multiplies the pose captured when playback started; color,
 * opacity and sprite frames are absolute.
 */
import { lerpColor, sampleClip, wrapClipTime } from "../animation";
import { conjugateQuat, mulQuat, normalizeQuat, quatFromEulerDeg, type Quat } from "../math";
import type { AnimationClip, AnimationComponent, GameComponent, Vector3 } from "../types";

/** The parts of a runtime entity an animation (or tween) may change. */
export interface AnimatedTarget {
    localPosition: Vector3;
    localRotation: Quat;
    localScale: Vector3;
    components: GameComponent[];
    renderVersion: number;
    /** Runtime opacity of UI components (not saved). */
    uiAlpha: number;
    setLocalPosition(position: Vector3): void;
    setLocalRotation(rotation: Quat): void;
    setLocalScale(scale: Vector3): void;
}

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };
const ONE: Vector3 = { x: 1, y: 1, z: 1 };

function isVector(value: unknown): value is Vector3 {
    return typeof value === "object" && value !== null;
}

function sameVector(a: Vector3, b: Vector3) {
    return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
}

/** The pose a blend starts from (CrossFade): offsets, scale, color and opacity when it began. */
interface Fade {
    duration: number;
    elapsed: number;
    position: Vector3;
    rotation: Vector3;
    scale: Vector3;
    color: string | null;
    opacity: number;
}

/** Writes a color to every visual component of the target. */
export function applyColor(target: AnimatedTarget, color: string) {
    for (const component of target.components) {
        switch (component.type) {
            case "spriteRenderer":
            case "uiText":
            case "uiButton":
            case "uiPanel":
                component.color = color;
                break;
            case "meshRenderer":
                component.material.color = color;
                break;
            case "uiProgressBar":
                component.fillColor = color;
                break;
        }
    }
    target.renderVersion += 1;
}

/** Writes opacity (0…1) to every visual component of the target. */
export function applyOpacity(target: AnimatedTarget, opacity: number) {
    const value = Math.min(1, Math.max(0, opacity));
    for (const component of target.components) {
        if (component.type === "spriteRenderer") component.opacity = value;
        else if (component.type === "meshRenderer") component.material.opacity = value;
    }
    target.uiAlpha = value;
    target.renderVersion += 1;
}

/** Current opacity of the target's main visual (used as a tween start value). */
export function readOpacity(target: AnimatedTarget): number {
    for (const component of target.components) {
        if (component.type === "spriteRenderer") return component.opacity;
        if (component.type === "meshRenderer") return component.material.opacity;
    }
    return target.uiAlpha;
}

export function readColor(target: AnimatedTarget): string | null {
    for (const component of target.components) {
        switch (component.type) {
            case "spriteRenderer":
            case "uiText":
            case "uiButton":
            case "uiPanel":
                return component.color;
            case "meshRenderer":
                return component.material.color;
            case "uiProgressBar":
                return component.fillColor;
        }
    }
    return null;
}

export class AnimationPlayer {
    readonly component: AnimationComponent;
    clip: AnimationClip | null = null;
    time = 0;
    playing = false;
    /** Multiplier set from scripts (Animation.speed); the component speed applies too. */
    speed = 1;
    /** "Play On Start" already happened (re-activating the object doesn't restart the clip). */
    autoPlayed = false;
    /**
     * Set by an Animator (V5): what a clip doesn't animate goes back to rest
     * (no offset, the base scale), so leaving a bobbing state stops the bob.
     */
    ownsPose = false;
    /** Speed of the Animator state that plays the clip (times the Animator's speed). */
    stateSpeed = 1;
    private appliedPosition: Vector3 = ZERO;
    private appliedRotation: Vector3 = ZERO;
    private appliedScale: Vector3 = ONE;
    private baseScale: Vector3 | null = null;
    private fade: Fade | null = null;

    constructor(component: AnimationComponent) {
        this.component = component;
    }

    findClip(name: string | null | undefined): AnimationClip | null {
        const clips = this.component.clips;
        if (!name) return clips.find((clip) => clip.name === this.component.defaultClip) ?? clips[0] ?? null;
        return clips.find((clip) => clip.name === name) ?? clips.find((clip) => clip.name.toLowerCase() === name.toLowerCase()) ?? null;
    }

    /** Plays so far, in clip lengths (1 = played once; keeps growing while looping). */
    get normalizedTime() {
        return this.clip ? this.time / Math.max(1e-4, this.clip.duration) : 0;
    }

    /** A CrossFade blend is still running. */
    get blending() {
        return this.fade !== null;
    }

    /** Starts (or restarts) a clip; false when there is no such clip. */
    play(target: AnimatedTarget, name?: string | null): boolean {
        const clip = this.findClip(name);
        if (!clip) return false;
        if (!this.baseScale) this.baseScale = { ...target.localScale };
        this.clip = clip;
        this.time = 0;
        this.playing = true;
        this.fade = null;
        this.apply(target, 0);
        return true;
    }

    /** Switches to a clip, blending from the current pose over `duration` seconds. */
    crossFade(target: AnimatedTarget, name: string | null, duration: number): boolean {
        if (duration <= 0 || !this.clip) return this.play(target, name);
        const clip = this.findClip(name);
        if (!clip) return false;
        if (!this.baseScale) this.baseScale = { ...target.localScale };
        this.fade = {
            duration,
            elapsed: 0,
            position: { ...this.appliedPosition },
            rotation: { ...this.appliedRotation },
            scale: { ...this.appliedScale },
            color: readColor(target),
            opacity: readOpacity(target),
        };
        this.clip = clip;
        this.time = 0;
        this.playing = true;
        this.apply(target, 0);
        return true;
    }

    pause() {
        this.playing = false;
    }

    resume() {
        if (this.clip) this.playing = true;
    }

    /** Stops and removes the pose offsets the clip added (colors stay as they are). */
    stop(target: AnimatedTarget) {
        this.playing = false;
        this.time = 0;
        if (this.appliedPosition !== ZERO) {
            const p = target.localPosition;
            target.setLocalPosition({ x: p.x - this.appliedPosition.x, y: p.y - this.appliedPosition.y, z: p.z - this.appliedPosition.z });
        }
        if (this.appliedRotation !== ZERO) {
            target.setLocalRotation(normalizeQuat(mulQuat(target.localRotation, conjugateQuat(quatFromEulerDeg(this.appliedRotation)))));
        }
        if (this.baseScale) target.setLocalScale(this.baseScale);
        this.appliedPosition = ZERO;
        this.appliedRotation = ZERO;
        this.appliedScale = ONE;
        this.baseScale = null;
        this.fade = null;
    }

    /** Advances playback; returns the name of a clip that just finished (wrap "once"). */
    update(target: AnimatedTarget, deltaTime: number): string | null {
        if (!this.playing || !this.clip) return null;
        this.time += deltaTime * this.speed * this.stateSpeed * this.component.speed;
        if (this.fade) this.fade.elapsed += deltaTime;
        const { time, finished } = wrapClipTime(this.clip, this.time);
        this.apply(target, time);
        if (this.fade && this.fade.elapsed >= this.fade.duration) this.fade = null;
        if (!finished) return null;
        this.playing = false;
        this.fade = null;
        return this.clip.name;
    }

    private apply(target: AnimatedTarget, time: number) {
        if (!this.clip) return;
        const sample = sampleClip(this.clip, time);
        const fade = this.fade;
        const weight = fade ? Math.min(1, fade.elapsed / Math.max(1e-6, fade.duration)) : 1;
        const blend = (from: Vector3, to: Vector3): Vector3 => ({ x: from.x + (to.x - from.x) * weight, y: from.y + (to.y - from.y) * weight, z: from.z + (to.z - from.z) * weight });
        const position = isVector(sample.position) ? sample.position : this.ownsPose ? ZERO : null;
        if (position) {
            const offset = fade ? blend(fade.position, position) : position;
            if (!sameVector(offset, this.appliedPosition)) {
                const p = target.localPosition;
                target.setLocalPosition({ x: p.x + offset.x - this.appliedPosition.x, y: p.y + offset.y - this.appliedPosition.y, z: p.z + offset.z - this.appliedPosition.z });
                this.appliedPosition = { ...offset };
            }
        }
        const rotation = isVector(sample.rotation) ? sample.rotation : this.ownsPose ? ZERO : null;
        if (rotation) {
            const euler = fade ? blend(fade.rotation, rotation) : rotation;
            if (!sameVector(euler, this.appliedRotation)) {
                const undo = conjugateQuat(quatFromEulerDeg(this.appliedRotation));
                target.setLocalRotation(normalizeQuat(mulQuat(mulQuat(target.localRotation, undo), quatFromEulerDeg(euler))));
                this.appliedRotation = { ...euler };
            }
        }
        const scale = isVector(sample.scale) ? sample.scale : this.ownsPose ? ONE : null;
        if (scale) {
            const multiplier = fade ? blend(fade.scale, scale) : scale;
            // A scale track wins over scripts every frame; going back to rest only writes when something changes.
            if (isVector(sample.scale) || !sameVector(multiplier, this.appliedScale)) {
                const base = this.baseScale ?? target.localScale;
                this.baseScale = base;
                target.setLocalScale({ x: base.x * multiplier.x, y: base.y * multiplier.y, z: base.z * multiplier.z });
            }
            this.appliedScale = { ...multiplier };
        }
        if (typeof sample.color === "string") applyColor(target, fade?.color ? lerpColor(fade.color, sample.color, weight) : sample.color);
        if (typeof sample.opacity === "number") applyOpacity(target, fade ? fade.opacity + (sample.opacity - fade.opacity) * weight : sample.opacity);
        if (typeof sample.frame === "number") {
            for (const component of target.components) {
                if (component.type === "spriteRenderer" && component.frame !== sample.frame) {
                    component.frame = sample.frame;
                    target.renderVersion += 1;
                }
            }
        }
    }
}
