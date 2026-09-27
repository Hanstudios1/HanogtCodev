import type { Vector3 } from "./types";

/** Quaternion as a plain object (x, y, z, w). */
export interface Quat {
    x: number;
    y: number;
    z: number;
    w: number;
}

/** Row-major 3x3 rotation matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const EPSILON = 1e-9;

export const vec3 = (x = 0, y = 0, z = 0): Vector3 => ({ x, y, z });
export const cloneVec3 = (v: Vector3): Vector3 => ({ x: v.x, y: v.y, z: v.z });
export const addVec3 = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const subVec3 = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scaleVec3 = (a: Vector3, s: number): Vector3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const mulVec3 = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x * b.x, y: a.y * b.y, z: a.z * b.z });
export const dotVec3 = (a: Vector3, b: Vector3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const crossVec3 = (a: Vector3, b: Vector3): Vector3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});
export const lengthVec3 = (a: Vector3): number => Math.hypot(a.x, a.y, a.z);
export const lengthSqVec3 = (a: Vector3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const distanceVec3 = (a: Vector3, b: Vector3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function normalizeVec3(a: Vector3): Vector3 {
    const length = lengthVec3(a);
    return length > EPSILON ? { x: a.x / length, y: a.y / length, z: a.z / length } : { x: 0, y: 0, z: 0 };
}

export function lerpVec3(a: Vector3, b: Vector3, t: number): Vector3 {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function isFiniteVec3(value: Vector3): boolean {
    return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

// ---------------------------------------------------------------------------
// Quaternions. Euler angles use YXZ order (yaw → pitch → roll), which is what
// Unity uses and what feels natural for cameras and characters.
// ---------------------------------------------------------------------------

export const IDENTITY_QUAT: Readonly<Quat> = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export function quatFromEulerDeg(euler: Vector3): Quat {
    const c1 = Math.cos(euler.x * DEG2RAD * 0.5), s1 = Math.sin(euler.x * DEG2RAD * 0.5);
    const c2 = Math.cos(euler.y * DEG2RAD * 0.5), s2 = Math.sin(euler.y * DEG2RAD * 0.5);
    const c3 = Math.cos(euler.z * DEG2RAD * 0.5), s3 = Math.sin(euler.z * DEG2RAD * 0.5);
    return {
        x: s1 * c2 * c3 + c1 * s2 * s3,
        y: c1 * s2 * c3 - s1 * c2 * s3,
        z: c1 * c2 * s3 - s1 * s2 * c3,
        w: c1 * c2 * c3 + s1 * s2 * s3,
    };
}

export function mulQuat(a: Quat, b: Quat): Quat {
    return {
        x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
        y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
        z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
}

export function conjugateQuat(q: Quat): Quat {
    return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function normalizeQuat(q: Quat): Quat {
    const length = Math.hypot(q.x, q.y, q.z, q.w);
    return length > EPSILON ? { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length } : { x: 0, y: 0, z: 0, w: 1 };
}

export function rotateVec3(q: Quat, v: Vector3): Vector3 {
    // v' = v + 2w(q×v) + 2q×(q×v)
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    return {
        x: v.x + q.w * tx + (q.y * tz - q.z * ty),
        y: v.y + q.w * ty + (q.z * tx - q.x * tz),
        z: v.z + q.w * tz + (q.x * ty - q.y * tx),
    };
}

export function mat3FromQuat(q: Quat): Mat3 {
    const x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
    const xx = q.x * x2, xy = q.x * y2, xz = q.x * z2;
    const yy = q.y * y2, yz = q.y * z2, zz = q.z * z2;
    const wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
    return [
        1 - (yy + zz), xy - wz, xz + wy,
        xy + wz, 1 - (xx + zz), yz - wx,
        xz - wy, yz + wx, 1 - (xx + yy),
    ];
}

/** Euler YXZ (degrees) from a rotation quaternion. */
export function eulerDegFromQuat(q: Quat): Vector3 {
    const m = mat3FromQuat(normalizeQuat(q));
    const m11 = m[0], m13 = m[2];
    const m21 = m[3], m22 = m[4], m23 = m[5];
    const m31 = m[6], m33 = m[8];
    const x = Math.asin(-clamp(m23, -1, 1));
    let y: number;
    let z: number;
    if (Math.abs(m23) < 0.9999999) {
        y = Math.atan2(m13, m33);
        z = Math.atan2(m21, m22);
    } else {
        y = Math.atan2(-m31, m11);
        z = 0;
    }
    const clean = (value: number) => {
        const degrees = value * RAD2DEG;
        return Math.abs(degrees) < 1e-9 ? 0 : degrees;
    };
    return { x: clean(x), y: clean(y), z: clean(z) };
}

export function quatFromAxisAngle(axis: Vector3, radians: number): Quat {
    const n = normalizeVec3(axis);
    const s = Math.sin(radians / 2);
    return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(radians / 2) };
}

/** Quaternion rotating +Z (forward) to look along `direction` with `up` as reference. */
export function quatLookRotation(direction: Vector3, up: Vector3 = { x: 0, y: 1, z: 0 }): Quat {
    const forward = normalizeVec3(direction);
    if (lengthSqVec3(forward) < EPSILON) return { ...IDENTITY_QUAT };
    let right = crossVec3(up, forward);
    if (lengthSqVec3(right) < EPSILON) right = crossVec3({ x: 1, y: 0, z: 0 }, forward);
    right = normalizeVec3(right);
    const newUp = crossVec3(forward, right);
    // Columns are right, up, forward.
    const m00 = right.x, m01 = newUp.x, m02 = forward.x;
    const m10 = right.y, m11 = newUp.y, m12 = forward.y;
    const m20 = right.z, m21 = newUp.z, m22 = forward.z;
    const trace = m00 + m11 + m22;
    let q: Quat;
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1);
        q = { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s };
    } else if (m00 > m11 && m00 > m22) {
        const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
        q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
    } else if (m11 > m22) {
        const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
        q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
    } else {
        const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
        q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
    }
    return normalizeQuat(q);
}

// ---------------------------------------------------------------------------
// Rigid transforms (position, rotation quaternion, scale)
// ---------------------------------------------------------------------------

export interface TRS {
    position: Vector3;
    rotation: Quat;
    scale: Vector3;
}

export const IDENTITY_TRS: Readonly<TRS> = Object.freeze({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
});

/** Composes parent ∘ child (non-uniform scale is approximated per axis, like most engines). */
export function combineTRS(parent: TRS, child: TRS): TRS {
    const scaled = mulVec3(child.position, parent.scale);
    return {
        position: addVec3(parent.position, rotateVec3(parent.rotation, scaled)),
        rotation: normalizeQuat(mulQuat(parent.rotation, child.rotation)),
        scale: mulVec3(parent.scale, child.scale),
    };
}

/** Converts a world position into the local space of `parent`. */
export function worldToLocalPoint(parent: TRS, world: Vector3): Vector3 {
    const relative = rotateVec3(conjugateQuat(parent.rotation), subVec3(world, parent.position));
    return {
        x: Math.abs(parent.scale.x) > EPSILON ? relative.x / parent.scale.x : 0,
        y: Math.abs(parent.scale.y) > EPSILON ? relative.y / parent.scale.y : 0,
        z: Math.abs(parent.scale.z) > EPSILON ? relative.z / parent.scale.z : 0,
    };
}

export function localToWorldPoint(transform: TRS, local: Vector3): Vector3 {
    return addVec3(transform.position, rotateVec3(transform.rotation, mulVec3(local, transform.scale)));
}

export function localToWorldDirection(transform: TRS, direction: Vector3): Vector3 {
    return rotateVec3(transform.rotation, direction);
}
