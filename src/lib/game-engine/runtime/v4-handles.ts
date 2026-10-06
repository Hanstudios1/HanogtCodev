/** Script handles of the V4 components: CharacterController2D and CameraFollow. */
import { VMRef, type VMValue } from "../script/values";
import type { CameraFollowComponent, CharacterController2DComponent } from "../types";
import { ComponentHandle, liveEntityOf, toBool, toNumber, toVector, vec } from "./handles";

const clampNumber = (value: VMValue, min: number, max: number, what: string) => Math.min(max, Math.max(min, toNumber(value, what)));

export class CharacterController2DHandle extends ComponentHandle<CharacterController2DComponent> {
    readonly hostType = "CharacterController2D";

    protected typeNames(): string[] {
        return ["CharacterController2D", "Behaviour", "Component", "Object", "UnityEngine.Object"];
    }

    private get motor() {
        return this.world.motorOf(this.entity);
    }

    get(name: string): VMValue {
        const c = this.component;
        const motor = this.motor;
        const body = this.entity.body;
        switch (name) {
            case "isGrounded": return Boolean(motor?.grounded);
            case "velocity": return vec(body.velocity, true);
            case "isJumping": return Boolean(motor && !motor.grounded && body.velocity.y > 0.01);
            case "isFalling": return Boolean(motor && !motor.grounded && body.velocity.y < -0.01);
            case "facing": return motor?.facing ?? 1;
            case "moveInput": return motor?.move ?? 0;
            case "jumpsLeft": return motor?.jumpsLeft ?? c.maxJumps;
            case "moveSpeed": return c.moveSpeed;
            case "acceleration": return c.acceleration;
            case "deceleration": return c.deceleration;
            case "airControl": return c.airControl;
            case "jumpHeight": return c.jumpHeight;
            case "maxJumps": return c.maxJumps;
            case "coyoteTime": return c.coyoteTime;
            case "jumpBuffer": return c.jumpBuffer;
            case "variableJump": return c.variableJump;
            case "fallGravity": return c.fallGravity;
            case "maxFallSpeed": return c.maxFallSpeed;
            case "maxSlope": return c.maxSlope;
            case "useInput": return c.useInput;
            case "horizontalAction": return c.horizontalAction;
            case "jumpAction": return c.jumpAction;
            case "flipSprite": return c.flipSprite;
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "moveSpeed": c.moveSpeed = clampNumber(value, 0, 200, name); return;
            case "acceleration": c.acceleration = clampNumber(value, 0, 10_000, name); return;
            case "deceleration": c.deceleration = clampNumber(value, 0, 10_000, name); return;
            case "airControl": c.airControl = clampNumber(value, 0, 1, name); return;
            case "jumpHeight": c.jumpHeight = clampNumber(value, 0, 200, name); return;
            case "maxJumps": c.maxJumps = Math.trunc(clampNumber(value, 0, 10, name)); return;
            case "coyoteTime": c.coyoteTime = clampNumber(value, 0, 1, name); return;
            case "jumpBuffer": c.jumpBuffer = clampNumber(value, 0, 1, name); return;
            case "variableJump": c.variableJump = toBool(value); return;
            case "fallGravity": c.fallGravity = clampNumber(value, 0.1, 10, name); return;
            case "maxFallSpeed": c.maxFallSpeed = clampNumber(value, 0.5, 500, name); return;
            case "maxSlope": c.maxSlope = clampNumber(value, 0, 89, name); return;
            case "useInput": c.useInput = toBool(value); return;
            case "horizontalAction": c.horizontalAction = String(value ?? "Horizontal"); return;
            case "jumpAction": c.jumpAction = String(value ?? "Jump"); return;
            case "flipSprite": c.flipSprite = toBool(value); return;
            case "velocity": {
                const velocity = toVector(value, "velocity");
                this.entity.body.velocity = { x: velocity.x, y: velocity.y, z: 0 };
                return;
            }
            case "facing": {
                const motor = this.motor;
                if (motor) motor.facing = toNumber(value, "facing") < 0 ? -1 : 1;
                return;
            }
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        const motor = this.motor;
        switch (name) {
            case "Move":
                if (motor) {
                    const direction = args[0] === undefined ? 0 : typeof args[0] === "number" ? args[0] : toVector(args[0], "yön").x;
                    motor.scriptMove = Math.max(-1, Math.min(1, Number.isFinite(direction) ? direction : 0));
                    motor.scriptMoveFrame = this.world.frameCount;
                    motor.move = motor.scriptMove;
                }
                return undefined;
            case "Jump":
                motor?.pressJump(this.world.deltaTime, true);
                return undefined;
            case "CancelJump":
                if (motor) motor.scriptJumpHeld = false;
                return undefined;
            case "Stop":
                if (motor) {
                    motor.scriptMove = 0;
                    motor.scriptMoveFrame = this.world.frameCount;
                    motor.move = 0;
                }
                this.entity.body.velocity.x = 0;
                return undefined;
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }
}

export class CameraFollowHandle extends ComponentHandle<CameraFollowComponent> {
    readonly hostType = "CameraFollow";

    protected typeNames(): string[] {
        return ["CameraFollow", "CinemachineCamera", "CinemachineVirtualCamera", "Behaviour", "Component", "Object", "UnityEngine.Object"];
    }

    get(name: string): VMValue {
        const c = this.component;
        const is2D = this.world.is2D;
        switch (name) {
            case "target":
            case "Follow": {
                const target = c.targetId ? this.world.entities.get(c.targetId) : null;
                return target && !target.destroyed ? this.world.transformHandle(target) : null;
            }
            case "offset": return vec(c.offset, is2D);
            case "smoothTime": return c.smoothTime;
            case "deadZone": return vec({ x: c.deadZone.x, y: c.deadZone.y, z: 0 }, true);
            case "lookAhead": return c.lookAhead;
            case "followX": return c.followX;
            case "followY": return c.followY;
            case "useBounds": return c.useBounds;
            case "boundsMin": return vec({ x: c.boundsMin.x, y: c.boundsMin.y, z: 0 }, true);
            case "boundsMax": return vec({ x: c.boundsMax.x, y: c.boundsMax.y, z: 0 }, true);
            case "lookAtTarget": return c.lookAtTarget;
            default: {
                const common = this.componentGet(name);
                if (common !== undefined) return common;
                return this.unknown(name);
            }
        }
    }

    set(name: string, value: VMValue): void {
        const c = this.component;
        switch (name) {
            case "target":
            case "Follow": {
                const target = value === null || value === undefined ? null : liveEntityOf(value);
                c.targetId = target ? target.id : null;
                return;
            }
            case "offset": c.offset = toVector(value, "offset"); return;
            case "smoothTime": c.smoothTime = clampNumber(value, 0, 5, name); return;
            case "deadZone": {
                const size = toVector(value, "deadZone");
                c.deadZone = { x: Math.max(0, size.x), y: Math.max(0, size.y) };
                return;
            }
            case "lookAhead": c.lookAhead = clampNumber(value, 0, 100, name); return;
            case "followX": c.followX = toBool(value); return;
            case "followY": c.followY = toBool(value); return;
            case "useBounds": c.useBounds = toBool(value); return;
            case "boundsMin": {
                const point = toVector(value, "boundsMin");
                c.boundsMin = { x: point.x, y: point.y };
                return;
            }
            case "boundsMax": {
                const point = toVector(value, "boundsMax");
                c.boundsMax = { x: point.x, y: point.y };
                return;
            }
            case "lookAtTarget": c.lookAtTarget = toBool(value); return;
            default:
                if (this.componentSet(name, value)) return;
                this.unknown(name);
        }
    }

    call(name: string, args: VMValue[], typeArgs: string[], refs?: Array<VMRef | null>): VMValue {
        switch (name) {
            case "Shake":
                this.world.shaker.add(
                    args[0] === undefined ? 0.3 : toNumber(args[0], "güç"),
                    args[1] === undefined ? 0.3 : toNumber(args[1], "süre"),
                    args[2] === undefined ? 25 : toNumber(args[2], "frekans"),
                );
                return undefined;
            case "SnapToTarget":
                this.world.followerOf(this.entity)?.snap();
                return undefined;
            case "SetBounds": {
                const min = toVector(args[0], "min");
                const max = toVector(args[1], "max");
                this.component.boundsMin = { x: min.x, y: min.y };
                this.component.boundsMax = { x: max.x, y: max.y };
                this.component.useBounds = true;
                return undefined;
            }
            default:
                return super.call(name, args, typeArgs, refs);
        }
    }
}
