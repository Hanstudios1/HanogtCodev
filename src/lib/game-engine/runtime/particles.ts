/**
 * CPU particle simulation; the renderer draws the resulting buffers.
 *
 * V6 (Particles V2): emission shapes, repeating timed bursts, a colour
 * gradient and a size curve over lifetime, and deaths that a sub-emitter
 * turns into new particles. A V5 system (point shape, no bursts, no stops,
 * no middle size) emits, moves and looks exactly as before.
 */
import { rotateVec3, type TRS } from "../math";
import type { ParticleSystemComponent, Vector3 } from "../types";

/** sRGB hex → linear RGB (what three.js Color.set does), so evaluated colours match the V5 renderer. */
function srgbToLinear(value: number) {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

const hexCache = new Map<string, [number, number, number]>();

export function linearColor(hex: string): [number, number, number] {
    let rgb = hexCache.get(hex);
    if (!rgb) {
        const value = Number.parseInt(hex.slice(1, 7), 16) || 0;
        rgb = [srgbToLinear(((value >> 16) & 255) / 255), srgbToLinear(((value >> 8) & 255) / 255), srgbToLinear((value & 255) / 255)];
        if (hexCache.size > 512) hexCache.clear();
        hexCache.set(hex, rgb);
    }
    return rgb;
}

/**
 * Colour (linear RGB) and opacity of a particle at `t` (0 = born, 1 = dies):
 * the gradient's stops, else start → end colour fading out like V5.
 */
export function particleColorAt(component: Pick<ParticleSystemComponent, "colorStops" | "startColor" | "endColor">, t: number, out: Float32Array | number[], offset = 0) {
    const stops = component.colorStops;
    if (stops.length < 2) {
        const start = linearColor(component.startColor);
        const end = linearColor(component.endColor);
        out[offset] = start[0] + (end[0] - start[0]) * t;
        out[offset + 1] = start[1] + (end[1] - start[1]) * t;
        out[offset + 2] = start[2] + (end[2] - start[2]) * t;
        out[offset + 3] = 1 - t * t;
        return;
    }
    let index = 0;
    while (index < stops.length - 1 && stops[index + 1].time < t) index += 1;
    const a = stops[index];
    const b = stops[Math.min(stops.length - 1, index + 1)];
    const span = b.time - a.time;
    const f = t <= a.time ? 0 : t >= b.time || span <= 1e-6 ? 1 : (t - a.time) / span;
    const from = linearColor(a.color);
    const to = linearColor(b.color);
    out[offset] = from[0] + (to[0] - from[0]) * f;
    out[offset + 1] = from[1] + (to[1] - from[1]) * f;
    out[offset + 2] = from[2] + (to[2] - from[2]) * f;
    out[offset + 3] = a.alpha + (b.alpha - a.alpha) * f;
}

/**
 * Size of a particle at `t`: start → end in a straight line (V5), or a smooth
 * curve through start, middle and end that never overshoots them (a monotone
 * cubic, so a size never dips below zero).
 */
export function particleSizeAt(component: Pick<ParticleSystemComponent, "startSize" | "endSize" | "midSize">, t: number): number {
    const start = component.startSize;
    const end = component.endSize;
    const mid = component.midSize;
    if (mid === null || mid === undefined) return start + (end - start) * t;
    // Hermite segments over [0, 0.5] and [0.5, 1] with Fritsch–Carlson slopes.
    const d0 = (mid - start) / 0.5;
    const d1 = (end - mid) / 0.5;
    const slopeMid = d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1);
    const slopeStart = d0;
    const slopeEnd = d1;
    const segment = t < 0.5 ? { y0: start, y1: mid, m0: slopeStart, m1: slopeMid, u: t / 0.5 } : { y0: mid, y1: end, m0: slopeMid, m1: slopeEnd, u: (t - 0.5) / 0.5 };
    const u = segment.u;
    const u2 = u * u;
    const u3 = u2 * u;
    const value = (2 * u3 - 3 * u2 + 1) * segment.y0 + (u3 - 2 * u2 + u) * 0.5 * segment.m0 + (-2 * u3 + 3 * u2) * segment.y1 + (u3 - u2) * 0.5 * segment.m1;
    return Math.max(0, value);
}

export class ParticleEmitter {
    readonly capacity: number;
    count = 0;
    /** x, y, z per particle (world space when worldSpace, else emitter-local). */
    readonly positions: Float32Array;
    readonly velocities: Float32Array;
    /** age, lifetime per particle */
    readonly ages: Float32Array;
    /** 1 for particles a parent system's death emitted (V6): their own deaths emit nothing. */
    readonly fromParent: Uint8Array;
    /** World positions (x, y, z) of this frame's deaths, for the sub-emitter (V6). */
    readonly deaths: number[] = [];
    playing = false;
    private emitAccumulator = 0;
    private elapsed = 0;
    private burstDone = false;
    /** Cycles fired and the next time of each timed burst (V6), per loop. */
    private burstFired: number[] = [];
    private burstNext: number[] = [];
    private seed = Math.random() * 1000;

    component: ParticleSystemComponent;
    constructor(component: ParticleSystemComponent) {
        this.component = component;
        this.capacity = Math.max(1, Math.min(4000, component.maxParticles));
        this.positions = new Float32Array(this.capacity * 3);
        this.velocities = new Float32Array(this.capacity * 3);
        this.ages = new Float32Array(this.capacity * 2);
        this.fromParent = new Uint8Array(this.capacity);
        this.playing = component.playOnStart && component.enabled;
    }

    play() {
        this.playing = true;
        this.elapsed = 0;
        this.burstDone = false;
        this.resetBursts();
    }

    stop(clear = false) {
        this.playing = false;
        if (clear) this.count = 0;
    }

    clear() {
        this.count = 0;
    }

    private resetBursts() {
        const bursts = this.component.bursts ?? [];
        this.burstFired = bursts.map(() => 0);
        this.burstNext = bursts.map((burst) => burst.time);
    }

    private random() {
        // Cheap deterministic-ish noise per emitter to avoid Math.random hot path costs.
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed % 100000) / 100000;
    }

    /** A random direction inside the cone of `spread` degrees around local +Z (Unity particle systems emit along +Z). */
    private coneDirection(spreadDegrees: number): Vector3 {
        const spread = Math.min(180, Math.max(0, spreadDegrees)) * Math.PI / 180;
        const theta = this.random() * Math.PI * 2;
        const cosSpread = Math.cos(spread);
        const z = cosSpread + (1 - cosSpread) * this.random();
        const radius = Math.sqrt(Math.max(0, 1 - z * z));
        return { x: radius * Math.cos(theta), y: radius * Math.sin(theta), z };
    }

    /** Local start offset and direction of one particle for the system's shape. */
    private shapeSample(): { offset: Vector3; direction: Vector3 } {
        const c = this.component;
        switch (c.shape) {
            case "circle": {
                const angle = this.random() * Math.max(0, Math.min(360, c.arc)) * Math.PI / 180;
                // Uniform over the ring band between (1 - thickness) × radius and the radius.
                const inner = 1 - Math.max(0, Math.min(1, c.radiusThickness));
                const distance = c.shapeRadius * Math.sqrt(inner * inner + (1 - inner * inner) * this.random());
                const radial = { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
                return { offset: { x: radial.x * distance, y: radial.y * distance, z: 0 }, direction: radial };
            }
            case "cone": {
                const angle = this.random() * Math.PI * 2;
                const inner = 1 - Math.max(0, Math.min(1, c.radiusThickness));
                const share = Math.sqrt(inner * inner + (1 - inner * inner) * this.random());
                const distance = c.shapeRadius * share;
                // Like Unity's cone: the further out a particle starts, the more it tilts outwards.
                const tilt = Math.min(89, Math.max(0, c.spread)) * Math.PI / 180 * (c.shapeRadius > 0 ? share : this.random());
                const radial = { x: Math.cos(angle), y: Math.sin(angle) };
                return {
                    offset: { x: radial.x * distance, y: radial.y * distance, z: 0 },
                    direction: { x: radial.x * Math.sin(tilt), y: radial.y * Math.sin(tilt), z: Math.cos(tilt) },
                };
            }
            case "box": {
                const size = c.boxSize;
                return {
                    offset: { x: (this.random() - 0.5) * size.x, y: (this.random() - 0.5) * size.y, z: (this.random() - 0.5) * size.z },
                    direction: this.coneDirection(c.spread),
                };
            }
            case "edge":
                return { offset: { x: (this.random() - 0.5) * c.edgeLength, y: 0, z: 0 }, direction: this.coneDirection(c.spread) };
            default:
                return { offset: { x: 0, y: 0, z: 0 }, direction: this.coneDirection(c.spread) };
        }
    }

    /**
     * Emits `amount` particles from the shape of the emitter; `at` (world
     * space) starts them there instead (a parent system's particle died).
     */
    emit(amount: number, emitter: TRS, at?: Vector3, fromParent = false) {
        const c = this.component;
        for (let n = 0; n < amount; n += 1) {
            if (this.count >= this.capacity) return;
            const index = this.count;
            this.count += 1;
            const { offset, direction: localDirection } = this.shapeSample();
            const direction = c.worldSpace ? rotateVec3(emitter.rotation, localDirection) : localDirection;
            const speed = c.startSpeed * (0.75 + this.random() * 0.5);
            let x: number;
            let y: number;
            let z: number;
            if (c.worldSpace) {
                const scaled = { x: offset.x * emitter.scale.x, y: offset.y * emitter.scale.y, z: offset.z * emitter.scale.z };
                const world = rotateVec3(emitter.rotation, scaled);
                const origin = at ?? emitter.position;
                x = origin.x + world.x;
                y = origin.y + world.y;
                z = origin.z + world.z;
            } else if (at) {
                // A local-space sub-emitter: the death point in the emitter's own space.
                const local = worldToLocal(emitter, at);
                x = local.x + offset.x;
                y = local.y + offset.y;
                z = local.z + offset.z;
            } else {
                x = offset.x;
                y = offset.y;
                z = offset.z;
            }
            this.positions[index * 3] = x;
            this.positions[index * 3 + 1] = y;
            this.positions[index * 3 + 2] = z;
            this.velocities[index * 3] = direction.x * speed;
            this.velocities[index * 3 + 1] = direction.y * speed;
            this.velocities[index * 3 + 2] = direction.z * speed;
            this.ages[index * 2] = 0;
            this.ages[index * 2 + 1] = c.lifetime * (0.8 + this.random() * 0.4);
            this.fromParent[index] = fromParent ? 1 : 0;
        }
    }

    update(dt: number, emitter: TRS, gravity: Vector3, is2D: boolean) {
        const c = this.component;
        this.deaths.length = 0;
        if (this.playing && c.enabled) {
            if (!this.burstDone) {
                if (c.burstCount > 0) this.emit(c.burstCount, emitter);
                this.burstDone = true;
                if (this.burstFired.length !== (c.bursts?.length ?? 0)) this.resetBursts();
            }
            this.elapsed += dt;
            this.emitAccumulator += c.emissionRate * dt;
            const whole = Math.floor(this.emitAccumulator);
            if (whole > 0) {
                this.emit(whole, emitter);
                this.emitAccumulator -= whole;
            }
            this.runBursts(emitter);
            if (this.elapsed >= c.duration) {
                if (c.loop) {
                    this.elapsed = 0;
                    if (c.burstCount > 0) this.burstDone = false;
                    this.resetBursts();
                } else {
                    this.playing = false;
                }
            }
        }
        const gx = gravity.x * c.gravityModifier;
        const gy = gravity.y * c.gravityModifier;
        const gz = gravity.z * c.gravityModifier;
        const recordDeaths = Boolean(c.subEmitterId);
        let index = 0;
        while (index < this.count) {
            const age = this.ages[index * 2] + dt;
            const life = this.ages[index * 2 + 1];
            if (age >= life) {
                if (recordDeaths && !this.fromParent[index]) this.recordDeath(index, emitter);
                // Swap-remove.
                const last = this.count - 1;
                if (index !== last) {
                    this.positions.copyWithin(index * 3, last * 3, last * 3 + 3);
                    this.velocities.copyWithin(index * 3, last * 3, last * 3 + 3);
                    this.ages.copyWithin(index * 2, last * 2, last * 2 + 2);
                    this.fromParent[index] = this.fromParent[last];
                }
                this.count -= 1;
                continue;
            }
            this.ages[index * 2] = age;
            this.velocities[index * 3] += gx * dt;
            this.velocities[index * 3 + 1] += gy * dt;
            this.velocities[index * 3 + 2] += gz * dt;
            this.positions[index * 3] += this.velocities[index * 3] * dt;
            this.positions[index * 3 + 1] += this.velocities[index * 3 + 1] * dt;
            this.positions[index * 3 + 2] += is2D ? 0 : this.velocities[index * 3 + 2] * dt;
            index += 1;
        }
    }

    /** Timed bursts due by now in this loop (several cycles may fall in one frame). */
    private runBursts(emitter: TRS) {
        const bursts = this.component.bursts;
        if (!bursts?.length) return;
        if (this.burstFired.length !== bursts.length) this.resetBursts();
        for (let index = 0; index < bursts.length; index += 1) {
            const burst = bursts[index];
            let guard = 0;
            while (this.elapsed >= this.burstNext[index] && (burst.cycles === 0 || this.burstFired[index] < burst.cycles) && guard < 64) {
                this.emit(burst.count, emitter);
                this.burstFired[index] += 1;
                this.burstNext[index] += Math.max(0.01, burst.interval);
                guard += 1;
            }
        }
    }

    private recordDeath(index: number, emitter: TRS) {
        if (this.deaths.length >= 3 * 256) return;
        const x = this.positions[index * 3];
        const y = this.positions[index * 3 + 1];
        const z = this.positions[index * 3 + 2];
        if (this.component.worldSpace) {
            this.deaths.push(x, y, z);
            return;
        }
        const scaled = { x: x * emitter.scale.x, y: y * emitter.scale.y, z: z * emitter.scale.z };
        const world = rotateVec3(emitter.rotation, scaled);
        this.deaths.push(emitter.position.x + world.x, emitter.position.y + world.y, emitter.position.z + world.z);
    }

    get isAlive() {
        return this.playing || this.count > 0;
    }
}

/** A world point in the emitter's local space (its rotation and scale undone). */
function worldToLocal(emitter: TRS, point: Vector3): Vector3 {
    const relative = { x: point.x - emitter.position.x, y: point.y - emitter.position.y, z: point.z - emitter.position.z };
    const q = emitter.rotation;
    const local = rotateVec3({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, relative);
    return {
        x: emitter.scale.x ? local.x / emitter.scale.x : 0,
        y: emitter.scale.y ? local.y / emitter.scale.y : 0,
        z: emitter.scale.z ? local.z / emitter.scale.z : 0,
    };
}
