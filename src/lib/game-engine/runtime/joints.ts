/**
 * Distance and spring joints (V4). Joints change linear velocity only (like
 * collisions in this engine): they pull the anchor points along the line
 * between them. Springs are explicit (they keep bouncing when undamped) up to
 * the stiffness the step can carry and soft constraints above it; distance
 * joints add a position correction after the physics step.
 */
import type { JointComponent, Vector3 } from "../types";

export interface JointEnd {
    /** World position of the attachment point. */
    point: Vector3;
    velocity: Vector3;
    /** 0 for objects the joint can't move (no dynamic body, or a point in the world). */
    invMass: number;
}

/** Strength of the velocity-level length correction of distance joints (per step). */
const BAUMGARTE = 0.3;

function axis(a: JointEnd, b: JointEnd, is2D: boolean) {
    const dx = b.point.x - a.point.x;
    const dy = b.point.y - a.point.y;
    const dz = is2D ? 0 : b.point.z - a.point.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return null;
    return { length, n: { x: dx / length, y: dy / length, z: dz / length } };
}

/**
 * Velocity step, before the physics step moves the bodies. Returns the impulse applied along
 * the joint (negative pulls the ends together).
 */
export function solveJointVelocity(joint: JointComponent, a: JointEnd, b: JointEnd, rest: number, dt: number, is2D: boolean): number {
    const invSum = a.invMass + b.invMass;
    if (invSum <= 0 || dt <= 0) return 0;
    const line = axis(a, b, is2D);
    if (!line) return 0;
    const error = line.length - rest;
    if (joint.kind === "distance" && joint.maxDistanceOnly && error <= 0) return 0;
    const { n } = line;
    const relative = (b.velocity.x - a.velocity.x) * n.x + (b.velocity.y - a.velocity.y) * n.y + (b.velocity.z - a.velocity.z) * n.z;
    let impulse: number;
    if (joint.kind === "spring") {
        const omega = 2 * Math.PI * Math.max(0.01, joint.frequency);
        if (omega * dt <= 1) {
            // Explicit spring (symplectic with the physics step): an undamped spring keeps bouncing.
            const zeta = Math.min(Math.max(0, joint.dampingRatio), 0.9 / (omega * dt));
            impulse = (-(omega * omega * error + 2 * zeta * omega * relative) * dt) / invSum;
        } else {
            // Very stiff springs: soft constraint, stable at any frequency.
            const mass = 1 / invSum;
            const k = mass * omega * omega;
            const c = 2 * mass * Math.max(0, joint.dampingRatio) * omega;
            const gamma = 1 / (dt * (c + dt * k));
            const bias = error * dt * k * gamma;
            impulse = -(relative + bias) / (invSum + gamma);
        }
    } else {
        impulse = -(relative + (BAUMGARTE * error) / dt) / invSum;
        // A rope only pulls.
        if (joint.maxDistanceOnly) impulse = Math.min(0, impulse);
    }
    a.velocity.x -= n.x * impulse * a.invMass;
    a.velocity.y -= n.y * impulse * a.invMass;
    a.velocity.z -= is2D ? 0 : n.z * impulse * a.invMass;
    b.velocity.x += n.x * impulse * b.invMass;
    b.velocity.y += n.y * impulse * b.invMass;
    b.velocity.z += is2D ? 0 : n.z * impulse * b.invMass;
    return impulse;
}

/** Position step of distance joints after the physics step: how far to move each end (along the joint). */
export function jointCorrection(joint: JointComponent, a: JointEnd, b: JointEnd, rest: number, is2D: boolean): { a: Vector3; b: Vector3 } | null {
    if (joint.kind !== "distance") return null;
    const invSum = a.invMass + b.invMass;
    if (invSum <= 0) return null;
    const line = axis(a, b, is2D);
    if (!line) return null;
    const error = line.length - rest;
    if (Math.abs(error) < 1e-4 || (joint.maxDistanceOnly && error <= 0)) return null;
    const amount = error * 0.8;
    const { n } = line;
    const shareA = (amount * a.invMass) / invSum;
    const shareB = (amount * b.invMass) / invSum;
    return {
        a: { x: n.x * shareA, y: n.y * shareA, z: is2D ? 0 : n.z * shareA },
        b: { x: -n.x * shareB, y: -n.y * shareB, z: is2D ? 0 : -n.z * shareB },
    };
}
