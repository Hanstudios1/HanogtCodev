import type { TransformComponent, Vector3 } from "./types";

/** Column-major 4x4 matrix, compatible with WebGL conventions. */
export type Matrix4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export const ZERO_VECTOR3: Readonly<Vector3> = Object.freeze({ x: 0, y: 0, z: 0 });
export const ONE_VECTOR3: Readonly<Vector3> = Object.freeze({ x: 1, y: 1, z: 1 });

export function vector3(x = 0, y = 0, z = 0): Vector3 {
  return { x, y, z };
}

export function addVector3(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtractVector3(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scaleVector3(value: Vector3, scalar: number): Vector3 {
  return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

export function lengthVector3(value: Vector3): number {
  return Math.hypot(value.x, value.y, value.z);
}

export function normalizeVector3(value: Vector3): Vector3 {
  const length = lengthVector3(value);
  return length > Number.EPSILON ? scaleVector3(value, 1 / length) : vector3();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function identityMatrix4(): Matrix4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

export function multiplyMatrix4(a: Matrix4, b: Matrix4): Matrix4 {
  const output = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return output as unknown as Matrix4;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function composeTransformMatrix(transform: Pick<TransformComponent, "position" | "rotation" | "scale">): Matrix4 {
  const halfX = degreesToRadians(transform.rotation.x) / 2;
  const halfY = degreesToRadians(transform.rotation.y) / 2;
  const halfZ = degreesToRadians(transform.rotation.z) / 2;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);

  // XYZ Euler order represented as a normalized quaternion.
  const qx = sx * cy * cz + cx * sy * sz;
  const qy = cx * sy * cz - sx * cy * sz;
  const qz = cx * cy * sz + sx * sy * cz;
  const qw = cx * cy * cz - sx * sy * sz;
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  return [
    (1 - (yy + zz)) * transform.scale.x,
    (xy + wz) * transform.scale.x,
    (xz - wy) * transform.scale.x,
    0,
    (xy - wz) * transform.scale.y,
    (1 - (xx + zz)) * transform.scale.y,
    (yz + wx) * transform.scale.y,
    0,
    (xz + wy) * transform.scale.z,
    (yz - wx) * transform.scale.z,
    (1 - (xx + yy)) * transform.scale.z,
    0,
    transform.position.x,
    transform.position.y,
    transform.position.z,
    1,
  ];
}

export function transformPoint(matrix: Matrix4, point: Vector3): Vector3 {
  return {
    x: matrix[0] * point.x + matrix[4] * point.y + matrix[8] * point.z + matrix[12],
    y: matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z + matrix[13],
    z: matrix[2] * point.x + matrix[6] * point.y + matrix[10] * point.z + matrix[14],
  };
}

export function matrixPosition(matrix: Matrix4): Vector3 {
  return { x: matrix[12], y: matrix[13], z: matrix[14] };
}

export function isFiniteVector3(value: Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}
