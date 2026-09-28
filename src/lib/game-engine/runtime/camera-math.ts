/**
 * Camera math shared by the runtime (Camera.ScreenToWorldPoint & co.) and the
 * renderer. Unity conventions: the camera looks along its local +Z, screen
 * coordinates are pixels with the origin at the bottom-left, viewport
 * coordinates go from 0 to 1.
 */
import { addVec3, conjugateQuat, normalizeVec3, rotateVec3, subVec3, type TRS } from "../math";
import type { CameraComponent, Vector3 } from "../types";

export interface CameraView {
    /** World transform of the camera entity (scale is ignored). */
    trs: TRS;
    camera: Pick<CameraComponent, "projection" | "fieldOfView" | "orthographicSize" | "nearClip" | "farClip">;
    width: number;
    height: number;
}

export interface WorldRay {
    origin: Vector3;
    direction: Vector3;
}

const DEG2RAD = Math.PI / 180;

function extents(view: CameraView) {
    const aspect = view.width > 0 && view.height > 0 ? view.width / view.height : 16 / 9;
    if (view.camera.projection === "orthographic") {
        const halfHeight = Math.max(0.01, view.camera.orthographicSize);
        return { aspect, halfWidth: halfHeight * aspect, halfHeight, tan: 0 };
    }
    const tan = Math.tan(Math.max(1, Math.min(179, view.camera.fieldOfView)) * DEG2RAD * 0.5);
    return { aspect, halfWidth: 0, halfHeight: 0, tan };
}

export function forwardOf(trs: TRS): Vector3 {
    return rotateVec3(trs.rotation, { x: 0, y: 0, z: 1 });
}

export function screenToViewport(view: CameraView, point: Vector3): Vector3 {
    return {
        x: view.width > 0 ? point.x / view.width : 0,
        y: view.height > 0 ? point.y / view.height : 0,
        z: point.z,
    };
}

export function viewportToScreen(view: CameraView, point: Vector3): Vector3 {
    return { x: point.x * view.width, y: point.y * view.height, z: point.z };
}

/** Viewport point (0..1) at `depth` units in front of the camera → world position. */
export function viewportToWorld(view: CameraView, point: Vector3): Vector3 {
    const nx = point.x * 2 - 1;
    const ny = point.y * 2 - 1;
    const depth = point.z;
    const e = extents(view);
    const local = view.camera.projection === "orthographic"
        ? { x: nx * e.halfWidth, y: ny * e.halfHeight, z: depth }
        : { x: nx * e.tan * e.aspect * depth, y: ny * e.tan * depth, z: depth };
    return addVec3(view.trs.position, rotateVec3(view.trs.rotation, local));
}

/** World position → viewport (x, y in 0..1, z = distance in front of the camera). */
export function worldToViewport(view: CameraView, world: Vector3): Vector3 {
    const local = rotateVec3(conjugateQuat(view.trs.rotation), subVec3(world, view.trs.position));
    const e = extents(view);
    if (view.camera.projection === "orthographic") {
        return { x: (local.x / e.halfWidth + 1) / 2, y: (local.y / e.halfHeight + 1) / 2, z: local.z };
    }
    const depth = Math.abs(local.z) < 1e-6 ? 1e-6 : local.z;
    return {
        x: (local.x / (depth * e.tan * e.aspect) + 1) / 2,
        y: (local.y / (depth * e.tan) + 1) / 2,
        z: local.z,
    };
}

export function screenToWorld(view: CameraView, point: Vector3): Vector3 {
    return viewportToWorld(view, screenToViewport(view, point));
}

export function worldToScreen(view: CameraView, world: Vector3): Vector3 {
    return viewportToScreen(view, worldToViewport(view, world));
}

export function viewportRay(view: CameraView, point: { x: number; y: number }): WorldRay {
    const near = Math.max(0.001, view.camera.nearClip);
    if (view.camera.projection === "orthographic") {
        return { origin: viewportToWorld(view, { x: point.x, y: point.y, z: near }), direction: normalizeVec3(forwardOf(view.trs)) };
    }
    const origin = viewportToWorld(view, { x: point.x, y: point.y, z: near });
    const far = viewportToWorld(view, { x: point.x, y: point.y, z: near + 1 });
    return { origin, direction: normalizeVec3(subVec3(far, origin)) };
}

export function screenRay(view: CameraView, point: { x: number; y: number }): WorldRay {
    return viewportRay(view, { x: view.width > 0 ? point.x / view.width : 0, y: view.height > 0 ? point.y / view.height : 0 });
}
