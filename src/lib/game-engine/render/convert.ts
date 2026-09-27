/**
 * Hanogt Engine uses Unity's left-handed convention (x right, y up, z forward);
 * three.js is right-handed (z towards the viewer). Mirroring the z axis maps one
 * onto the other: p' = (x, y, -z) and q' = (-x, -y, z, w).
 */
import * as THREE from "three";
import type { Quat, TRS } from "../math";
import type { Vector3 } from "../types";

export function toThreePosition(v: Vector3, target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(v.x, v.y, -v.z);
}

export function toThreeQuaternion(q: Quat, target = new THREE.Quaternion()): THREE.Quaternion {
    return target.set(-q.x, -q.y, q.z, q.w);
}

export function fromThreePosition(v: THREE.Vector3): Vector3 {
    return { x: v.x, y: v.y, z: -v.z };
}

export function fromThreeQuaternion(q: THREE.Quaternion): Quat {
    return { x: -q.x, y: -q.y, z: q.z, w: q.w };
}

export function applyTRS(object: THREE.Object3D, trs: TRS) {
    toThreePosition(trs.position, object.position);
    toThreeQuaternion(trs.rotation, object.quaternion);
    object.scale.set(
        Math.abs(trs.scale.x) < 1e-6 ? 1e-6 : trs.scale.x,
        Math.abs(trs.scale.y) < 1e-6 ? 1e-6 : trs.scale.y,
        Math.abs(trs.scale.z) < 1e-6 ? 1e-6 : trs.scale.z,
    );
}

export function readTRS(object: THREE.Object3D): TRS {
    return {
        position: fromThreePosition(object.position),
        rotation: fromThreeQuaternion(object.quaternion),
        scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
    };
}
