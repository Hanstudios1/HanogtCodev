/**
 * Camera Follow and camera shake (V4).
 *
 * The follower runs after LateUpdate: it keeps a dead-zone focus point on the
 * target, leads in the direction of movement, eases with SmoothDamp and stays
 * inside optional bounds. Shakes only offset the rendered camera, so
 * ScreenToWorldPoint and the camera's transform stay steady.
 */
import { quatLookRotation, type Quat } from "../math";
import type { CameraFollowComponent, Vector3 } from "../types";

/** Unity's Mathf.SmoothDamp for one axis; `state.velocity` carries over between frames. */
export function smoothDamp(current: number, target: number, state: { velocity: number }, smoothTime: number, dt: number): number {
    if (dt <= 0) return current;
    const time = Math.max(0.0001, smoothTime);
    const omega = 2 / time;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = current - target;
    const temp = (state.velocity + omega * change) * dt;
    state.velocity = (state.velocity - omega * temp) * exp;
    let output = target + (change + temp) * exp;
    // Don't overshoot.
    if (target - current > 0 === output > target) {
        output = target;
        state.velocity = 0;
    }
    return output;
}

export interface FollowView {
    /** Half width and height the camera sees (orthographic), used to keep the view inside the bounds. */
    halfExtents: { x: number; y: number } | null;
}

export class CameraFollower {
    readonly component: CameraFollowComponent;
    private readonly velocity = { x: { velocity: 0 }, y: { velocity: 0 }, z: { velocity: 0 } };
    private focus: Vector3 | null = null;
    private lastTarget: Vector3 | null = null;
    private ahead = { x: 0, z: 0 };
    private aheadGoal = { x: 0, z: 0 };
    private snapped = false;

    constructor(component: CameraFollowComponent) {
        this.component = component;
    }

    /** Jumps straight to the target on the next update. */
    snap() {
        this.snapped = false;
        this.focus = null;
        this.lastTarget = null;
        this.ahead = { x: 0, z: 0 };
        this.aheadGoal = { x: 0, z: 0 };
        this.velocity.x.velocity = this.velocity.y.velocity = this.velocity.z.velocity = 0;
    }

    /** New camera position (and rotation in 3D when looking at the target). */
    update(dt: number, camera: Vector3, target: Vector3, is2D: boolean, view: FollowView): { position: Vector3; rotation: Quat | null } {
        const c = this.component;
        const moved = this.lastTarget && dt > 0
            ? { x: (target.x - this.lastTarget.x) / dt, z: ((is2D ? 0 : target.z) - (is2D ? 0 : this.lastTarget.z)) / dt }
            : { x: 0, z: 0 };
        this.lastTarget = { ...target };
        if (c.lookAhead > 0) {
            if (is2D) {
                if (Math.abs(moved.x) > 0.5) this.aheadGoal.x = Math.sign(moved.x) * c.lookAhead;
            } else {
                const speed = Math.hypot(moved.x, moved.z);
                if (speed > 0.5) this.aheadGoal = { x: (moved.x / speed) * c.lookAhead, z: (moved.z / speed) * c.lookAhead };
            }
            const ease = this.snapped ? Math.min(1, dt * 2.5) : 1;
            this.ahead.x += (this.aheadGoal.x - this.ahead.x) * ease;
            this.ahead.z += (this.aheadGoal.z - this.ahead.z) * ease;
        } else {
            this.ahead = { x: 0, z: 0 };
        }

        // The focus point only moves when the target leaves the dead zone (2D).
        if (!this.focus || !is2D) this.focus = { ...target };
        else {
            const halfX = Math.max(0, c.deadZone.x) / 2;
            const halfY = Math.max(0, c.deadZone.y) / 2;
            if (target.x > this.focus.x + halfX) this.focus.x = target.x - halfX;
            else if (target.x < this.focus.x - halfX) this.focus.x = target.x + halfX;
            if (target.y > this.focus.y + halfY) this.focus.y = target.y - halfY;
            else if (target.y < this.focus.y - halfY) this.focus.y = target.y + halfY;
        }

        const goal: Vector3 = is2D
            ? { x: this.focus.x + c.offset.x + this.ahead.x, y: this.focus.y + c.offset.y, z: camera.z }
            : { x: this.focus.x + c.offset.x + this.ahead.x, y: this.focus.y + c.offset.y, z: this.focus.z + c.offset.z + this.ahead.z };
        if (!c.followX) {
            goal.x = camera.x;
            if (!is2D) goal.z = camera.z;
        }
        if (!c.followY) goal.y = camera.y;
        this.clamp(goal, is2D, view);

        let position: Vector3;
        if (!this.snapped || c.smoothTime <= 0) {
            position = goal;
            this.snapped = true;
        } else {
            position = {
                x: smoothDamp(camera.x, goal.x, this.velocity.x, c.smoothTime, dt),
                y: smoothDamp(camera.y, goal.y, this.velocity.y, c.smoothTime, dt),
                z: is2D ? camera.z : smoothDamp(camera.z, goal.z, this.velocity.z, c.smoothTime, dt),
            };
            this.clamp(position, is2D, view);
        }
        let rotation: Quat | null = null;
        if (!is2D && c.lookAtTarget) {
            const direction = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
            if (Math.hypot(direction.x, direction.y, direction.z) > 1e-4) rotation = quatLookRotation(direction);
        }
        return { position, rotation };
    }

    /** Keeps the view (2D) or the camera (3D, on X and Z) inside the bounds. */
    private clamp(point: Vector3, is2D: boolean, view: FollowView) {
        const c = this.component;
        if (!c.useBounds) return;
        const half = is2D ? view.halfExtents ?? { x: 0, y: 0 } : { x: 0, y: 0 };
        const fit = (value: number, min: number, max: number, margin: number) => {
            const low = Math.min(min, max) + margin;
            const high = Math.max(min, max) - margin;
            return low > high ? (min + max) / 2 : Math.min(high, Math.max(low, value));
        };
        point.x = fit(point.x, c.boundsMin.x, c.boundsMax.x, half.x);
        if (is2D) point.y = fit(point.y, c.boundsMin.y, c.boundsMax.y, half.y);
        else point.z = fit(point.z, c.boundsMin.y, c.boundsMax.y, 0);
    }
}

interface Shake {
    amplitude: number;
    duration: number;
    frequency: number;
    elapsed: number;
    seed: number;
}

const MAX_SHAKES = 8;

/** Screen shakes: decaying, smooth noise added to the rendered camera. */
export class CameraShaker {
    private shakes: Shake[] = [];
    private seed = 0;

    add(amplitude: number, duration: number, frequency: number) {
        const shake: Shake = {
            amplitude: Math.min(5, Math.max(0, Number.isFinite(amplitude) ? amplitude : 0)),
            duration: Math.min(10, Math.max(0.01, Number.isFinite(duration) ? duration : 0.3)),
            frequency: Math.min(80, Math.max(1, Number.isFinite(frequency) ? frequency : 25)),
            elapsed: 0,
            seed: (this.seed = (this.seed + 1.618) % 97),
        };
        if (shake.amplitude <= 0) return;
        this.shakes.push(shake);
        if (this.shakes.length > MAX_SHAKES) this.shakes.shift();
    }

    stop() {
        this.shakes = [];
    }

    get active() {
        return this.shakes.length > 0;
    }

    update(dt: number) {
        for (const shake of this.shakes) shake.elapsed += dt;
        this.shakes = this.shakes.filter((shake) => shake.elapsed < shake.duration);
    }

    /** Camera-space offset in world units and a roll in degrees, or null when still. */
    offset(): { x: number; y: number; roll: number } | null {
        if (!this.shakes.length) return null;
        let x = 0;
        let y = 0;
        let roll = 0;
        for (const shake of this.shakes) {
            const decay = (1 - shake.elapsed / shake.duration) ** 2;
            const t = shake.elapsed * shake.frequency;
            const noise = (phase: number) => Math.sin(t + shake.seed * phase) * 0.6 + Math.sin(t * 2.3 + shake.seed * phase * 1.7) * 0.3 + Math.sin(t * 4.1 + phase) * 0.1;
            x += shake.amplitude * decay * noise(1);
            y += shake.amplitude * decay * noise(2.7);
            roll += shake.amplitude * decay * noise(5.3) * 2.5;
        }
        const limit = 3;
        return { x: Math.max(-limit, Math.min(limit, x)), y: Math.max(-limit, Math.min(limit, y)), roll: Math.max(-8, Math.min(8, roll)) };
    }
}
