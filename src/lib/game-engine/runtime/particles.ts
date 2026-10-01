/** CPU particle simulation; the renderer draws the resulting buffers. */
import { rotateVec3, type TRS } from "../math";
import type { ParticleSystemComponent, Vector3 } from "../types";

export class ParticleEmitter {
    readonly capacity: number;
    count = 0;
    /** x, y, z per particle (world space when worldSpace, else emitter-local). */
    readonly positions: Float32Array;
    readonly velocities: Float32Array;
    /** age, lifetime per particle */
    readonly ages: Float32Array;
    playing = false;
    private emitAccumulator = 0;
    private elapsed = 0;
    private burstDone = false;
    private seed = Math.random() * 1000;

    component: ParticleSystemComponent;
    constructor(component: ParticleSystemComponent) {
        this.component = component;
        this.capacity = Math.max(1, Math.min(4000, component.maxParticles));
        this.positions = new Float32Array(this.capacity * 3);
        this.velocities = new Float32Array(this.capacity * 3);
        this.ages = new Float32Array(this.capacity * 2);
        this.playing = component.playOnStart && component.enabled;
    }

    play() {
        this.playing = true;
        this.elapsed = 0;
        this.burstDone = false;
    }

    stop(clear = false) {
        this.playing = false;
        if (clear) this.count = 0;
    }

    clear() {
        this.count = 0;
    }

    private random() {
        // Cheap deterministic-ish noise per emitter to avoid Math.random hot path costs.
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed % 100000) / 100000;
    }

    emit(amount: number, emitter: TRS) {
        const c = this.component;
        const spread = Math.min(180, Math.max(0, c.spread)) * Math.PI / 180;
        for (let n = 0; n < amount; n += 1) {
            if (this.count >= this.capacity) return;
            const index = this.count;
            this.count += 1;
            // Random direction inside a cone around local +Z (Unity particle systems emit along +Z).
            const theta = this.random() * Math.PI * 2;
            const cosSpread = Math.cos(spread);
            const z = cosSpread + (1 - cosSpread) * this.random();
            const radius = Math.sqrt(Math.max(0, 1 - z * z));
            const localDirection: Vector3 = { x: radius * Math.cos(theta), y: radius * Math.sin(theta), z };
            const direction = c.worldSpace ? rotateVec3(emitter.rotation, localDirection) : localDirection;
            const speed = c.startSpeed * (0.75 + this.random() * 0.5);
            const origin = c.worldSpace ? emitter.position : { x: 0, y: 0, z: 0 };
            this.positions[index * 3] = origin.x;
            this.positions[index * 3 + 1] = origin.y;
            this.positions[index * 3 + 2] = origin.z;
            this.velocities[index * 3] = direction.x * speed;
            this.velocities[index * 3 + 1] = direction.y * speed;
            this.velocities[index * 3 + 2] = direction.z * speed;
            this.ages[index * 2] = 0;
            this.ages[index * 2 + 1] = c.lifetime * (0.8 + this.random() * 0.4);
        }
    }

    update(dt: number, emitter: TRS, gravity: Vector3, is2D: boolean) {
        const c = this.component;
        if (this.playing && c.enabled) {
            if (!this.burstDone) {
                if (c.burstCount > 0) this.emit(c.burstCount, emitter);
                this.burstDone = true;
            }
            this.elapsed += dt;
            this.emitAccumulator += c.emissionRate * dt;
            const whole = Math.floor(this.emitAccumulator);
            if (whole > 0) {
                this.emit(whole, emitter);
                this.emitAccumulator -= whole;
            }
            if (this.elapsed >= c.duration) {
                if (c.loop) {
                    this.elapsed = 0;
                    if (c.burstCount > 0) this.burstDone = false;
                } else {
                    this.playing = false;
                }
            }
        }
        const gx = gravity.x * c.gravityModifier;
        const gy = gravity.y * c.gravityModifier;
        const gz = gravity.z * c.gravityModifier;
        let index = 0;
        while (index < this.count) {
            const age = this.ages[index * 2] + dt;
            const life = this.ages[index * 2 + 1];
            if (age >= life) {
                // Swap-remove.
                const last = this.count - 1;
                if (index !== last) {
                    this.positions.copyWithin(index * 3, last * 3, last * 3 + 3);
                    this.velocities.copyWithin(index * 3, last * 3, last * 3 + 3);
                    this.ages.copyWithin(index * 2, last * 2, last * 2 + 2);
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

    get isAlive() {
        return this.playing || this.count > 0;
    }
}
