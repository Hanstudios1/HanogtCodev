/**
 * CharacterController2D (V4): platformer movement on a dynamic Rigidbody 2D.
 *
 * Input is sampled once per frame (jump presses are buffered); the motor runs
 * every fixed step after FixedUpdate and before the physics step. It only
 * writes the body's velocity, so collisions stay with the physics engine.
 */
import type { CharacterController2DComponent, Vector3 } from "../types";
import type { BodyRuntime } from "./physics";

export interface MotorInputSource {
    axis(name: string): number;
    down(name: string): boolean;
    held(name: string): boolean;
}

export type MotorEvent = { kind: "jump" } | { kind: "land"; speed: number };

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };
/** Speed (units/s) that presses a grounded character into the ground so it follows slopes and steps down. */
const STICK = 1;

function moveTowards(current: number, target: number, maxDelta: number) {
    if (Math.abs(target - current) <= maxDelta) return target;
    return current + Math.sign(target - current) * maxDelta;
}

export class CharacterMotor {
    readonly component: CharacterController2DComponent;
    /** Seconds left in which a jump still counts as from the ground. */
    coyote = 0;
    /** Seconds the last jump press stays valid. */
    buffer = 0;
    jumpsUsed = 0;
    /** Rising from a jump (a released jump button cuts it short). */
    rising = false;
    private cut = false;
    facing: 1 | -1 = 1;
    /** Horizontal input of this frame, −1…1. */
    move = 0;
    jumpHeld = false;
    grounded = false;
    /** Move() from a script: replaces input until the next frame (or for good when useInput is off). */
    scriptMove: number | null = null;
    scriptMoveFrame = -1;
    /** Jump button state of scripted jumps (CancelJump releases it). */
    scriptJumpHeld = true;
    /** The buffered or current jump came from Jump() rather than the jump button. */
    private bufferedScripted = false;
    private scriptedJump = false;
    private fallSpeed = 0;
    readonly events: MotorEvent[] = [];

    constructor(component: CharacterController2DComponent) {
        this.component = component;
    }

    /** Reads input once per frame; presses are kept until a fixed step can use them. */
    sample(input: MotorInputSource | null, frame: number, frameDelta: number) {
        const c = this.component;
        if (c.useInput && input) {
            // Move() called in the previous frame's Update (or this frame) overrides the input.
            this.move = this.scriptMoveFrame >= frame - 1 && this.scriptMove !== null ? this.scriptMove : input.axis(c.horizontalAction);
            if (input.down(c.jumpAction)) this.pressJump(frameDelta, false);
            this.jumpHeld = input.held(c.jumpAction);
        } else {
            this.move = this.scriptMove ?? 0;
            this.jumpHeld = this.scriptJumpHeld;
        }
    }

    /** Remembers a jump press; scripted jumps rise fully unless CancelJump() is called. */
    pressJump(frameDelta: number, scripted: boolean) {
        // Without a buffer the press must still live until the next fixed step.
        this.buffer = Math.max(this.component.jumpBuffer, frameDelta + 1e-3);
        this.bufferedScripted = scripted;
        if (scripted) this.scriptJumpHeld = true;
    }

    /** Applies one fixed step of movement to the body's velocity. */
    fixedUpdate(dt: number, body: BodyRuntime, gravity: Vector3, gravityScale: number, useGravity: boolean) {
        const c = this.component;
        const g = useGravity ? { x: gravity.x * gravityScale, y: gravity.y * gravityScale } : { x: 0, y: 0 };
        const gMag = Math.hypot(gravity.x * gravityScale, gravity.y * gravityScale) || 9.81;
        const normal = body.groundNormal;
        const onGround = body.grounded && normal.y >= Math.cos((c.maxSlope * Math.PI) / 180) - 1e-6;
        const ground = onGround ? body.groundVelocity ?? ZERO : ZERO;
        const v = body.velocity;
        const relY = v.y - ground.y;

        if (onGround) {
            if (!this.grounded && this.fallSpeed > 1) this.events.push({ kind: "land", speed: this.fallSpeed });
            this.coyote = c.coyoteTime;
            this.fallSpeed = 0;
            if (!this.rising || relY <= 0.01) {
                this.jumpsUsed = 0;
                this.rising = false;
            }
        } else {
            this.coyote = Math.max(0, this.coyote - dt);
            // Walking off a ledge spends the ground jump once coyote time is over.
            if (this.coyote <= 0 && this.jumpsUsed === 0) this.jumpsUsed = 1;
            this.fallSpeed = Math.max(0, -v.y);
        }
        this.grounded = onGround;

        const input = Math.max(-1, Math.min(1, Number.isFinite(this.move) ? this.move : 0));
        if (Math.abs(input) > 0.01) this.facing = input > 0 ? 1 : -1;
        const target = input * c.moveSpeed;
        const rate = (Math.abs(input) > 0.01 ? c.acceleration : c.deceleration) * (onGround ? 1 : c.airControl);
        // Along the ground (relative to a moving platform) or plain horizontal in the air.
        const tangent = onGround ? { x: normal.y, y: -normal.x } : { x: 1, y: 0 };
        const current = onGround ? (v.x - ground.x) * tangent.x + relY * tangent.y : v.x;
        const speed = moveTowards(current, target, rate * dt);

        if (this.buffer > 0 && this.jumpsUsed < c.maxJumps) {
            const jumpSpeed = Math.sqrt(2 * gMag * Math.max(0, c.jumpHeight));
            v.x = onGround ? speed * tangent.x + ground.x : speed;
            // The physics step adds gravity once more; start this step at the full jump speed.
            v.y = jumpSpeed + Math.max(0, ground.y) - g.y * dt;
            this.jumpsUsed += 1;
            this.buffer = 0;
            this.coyote = 0;
            this.rising = true;
            this.cut = false;
            this.scriptedJump = this.bufferedScripted;
            this.grounded = false;
            this.events.push({ kind: "jump" });
            return;
        }
        this.buffer = Math.max(0, this.buffer - dt);

        if (onGround && !(this.rising && relY > 0.01)) {
            // Follow the slope and press lightly into the ground; cancel this step's gravity.
            v.x = tangent.x * speed + ground.x - normal.x * STICK - g.x * dt;
            v.y = tangent.y * speed + ground.y - normal.y * STICK - g.y * dt;
            return;
        }

        v.x = speed;
        const holding = this.scriptedJump ? this.scriptJumpHeld : this.jumpHeld;
        if (this.rising && v.y > 0 && c.variableJump && !holding && !this.cut) {
            v.y *= 0.5;
            this.cut = true;
        }
        if (v.y <= 0) this.rising = false;
        if (v.y < 0 && c.fallGravity !== 1) v.y += g.y * (c.fallGravity - 1) * dt;
        if (v.y + g.y * dt < -c.maxFallSpeed) v.y = -c.maxFallSpeed - g.y * dt;
    }

    /** Jumps left before landing again. */
    get jumpsLeft() {
        return Math.max(0, this.component.maxJumps - this.jumpsUsed);
    }
}
