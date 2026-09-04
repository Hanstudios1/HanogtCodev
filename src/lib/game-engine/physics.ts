import { addVector3, clamp, scaleVector3 } from "./math";
import { getComponent, getTransform, getWorldPosition } from "./scene";
import type { ColliderComponent, CollisionEvent, GameEntity, RigidBodyComponent, SceneDocument, Vector3 } from "./types";

interface PhysicsObject {
  entity: GameEntity;
  body?: RigidBodyComponent;
  collider: ColliderComponent;
  center: Vector3;
  halfSize: Vector3;
}

export interface PhysicsStepResult {
  collisions: CollisionEvent[];
}

function effectiveHalfSize(entity: GameEntity, collider: ColliderComponent): Vector3 {
  const scale = getTransform(entity).scale;
  if (collider.shape === "sphere" || collider.shape === "circle") {
    const radius = collider.radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    return { x: radius, y: radius, z: collider.shape === "circle" ? 0.0005 : radius };
  }
  return {
    x: Math.abs(collider.size.x * scale.x) / 2,
    y: Math.abs(collider.size.y * scale.y) / 2,
    z: Math.abs(collider.size.z * scale.z) / 2,
  };
}

function buildPhysicsObjects(scene: SceneDocument): PhysicsObject[] {
  const output: PhysicsObject[] = [];
  for (const entity of scene.objects) {
    if (!entity.active) continue;
    const collider = getComponent(entity, "collider");
    if (!collider?.enabled) continue;
    const worldPosition = getWorldPosition(scene, entity.id);
    output.push({
      entity,
      body: getComponent(entity, "rigidBody"),
      collider,
      center: addVector3(worldPosition, collider.offset),
      halfSize: effectiveHalfSize(entity, collider),
    });
  }
  return output;
}

function moveEntity(entity: GameEntity, correction: Vector3): void {
  const transform = getTransform(entity);
  transform.position.x += correction.x;
  transform.position.y += correction.y;
  transform.position.z += correction.z;
}

function resolveVelocity(body: RigidBodyComponent, normal: Vector3): void {
  const normalVelocity = body.velocity.x * normal.x + body.velocity.y * normal.y + body.velocity.z * normal.z;
  if (normalVelocity >= 0) return;
  const impulse = -(1 + body.restitution) * normalVelocity;
  body.velocity.x += normal.x * impulse;
  body.velocity.y += normal.y * impulse;
  body.velocity.z += normal.z * impulse;
}

function detectAabbCollision(a: PhysicsObject, b: PhysicsObject, dimension: SceneDocument["dimension"]): { normal: Vector3; penetration: number } | null {
  const dx = b.center.x - a.center.x;
  const dy = b.center.y - a.center.y;
  const dz = b.center.z - a.center.z;
  const overlapX = a.halfSize.x + b.halfSize.x - Math.abs(dx);
  const overlapY = a.halfSize.y + b.halfSize.y - Math.abs(dy);
  const overlapZ = dimension === "2d" ? Number.POSITIVE_INFINITY : a.halfSize.z + b.halfSize.z - Math.abs(dz);
  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return null;
  if (overlapX <= overlapY && overlapX <= overlapZ) return { normal: { x: dx >= 0 ? -1 : 1, y: 0, z: 0 }, penetration: overlapX };
  if (overlapY <= overlapZ) return { normal: { x: 0, y: dy >= 0 ? -1 : 1, z: 0 }, penetration: overlapY };
  return { normal: { x: 0, y: 0, z: dz >= 0 ? -1 : 1 }, penetration: overlapZ };
}

function isDynamic(body: RigidBodyComponent | undefined): body is RigidBodyComponent {
  return Boolean(body?.enabled && body.bodyType === "dynamic");
}

function applyWorldBounds(scene: SceneDocument, entity: GameEntity, body: RigidBodyComponent): void {
  const bounds = scene.settings.physics.worldBounds;
  if (!bounds.enabled) return;
  const transform = getTransform(entity);
  const axes: (keyof Vector3)[] = scene.dimension === "2d" ? ["x", "y"] : ["x", "y", "z"];
  for (const axis of axes) {
    const clamped = clamp(transform.position[axis], bounds.min[axis], bounds.max[axis]);
    if (clamped !== transform.position[axis]) {
      transform.position[axis] = clamped;
      body.velocity[axis] *= -body.restitution;
    }
  }
}

/**
 * Advances basic rigid-body integration in-place. It is intentionally a small
 * editor preview, not a production physics engine. Colliders use axis-aligned
 * bounds and ignore rotation.
 */
export function stepPhysicsMutable(scene: SceneDocument, deltaTime: number): PhysicsStepResult {
  const dt = clamp(deltaTime, 0, 0.1);
  if (dt === 0) return { collisions: [] };
  const gravity = scene.settings.physics.gravity;

  for (const entity of scene.objects) {
    if (!entity.active) continue;
    const body = getComponent(entity, "rigidBody");
    if (!isDynamic(body)) continue;
    const transform = getTransform(entity);
    if (body.useGravity) body.velocity = addVector3(body.velocity, scaleVector3(gravity, body.gravityScale * dt));
    const damping = Math.max(0, 1 - body.linearDamping * dt);
    body.velocity = scaleVector3(body.velocity, damping);
    if (body.freezePosition.x) body.velocity.x = 0;
    if (body.freezePosition.y) body.velocity.y = 0;
    if (body.freezePosition.z || scene.dimension === "2d") body.velocity.z = 0;
    transform.position.x += body.velocity.x * dt;
    transform.position.y += body.velocity.y * dt;
    transform.position.z += body.velocity.z * dt;
    transform.rotation.x += body.angularVelocity.x * dt;
    transform.rotation.y += body.angularVelocity.y * dt;
    transform.rotation.z += body.angularVelocity.z * dt;
    if (scene.dimension === "2d") {
      transform.position.z = 0;
      transform.rotation.x = 0;
      transform.rotation.y = 0;
    }
    applyWorldBounds(scene, entity, body);
  }

  const collisions: CollisionEvent[] = [];
  const objects = buildPhysicsObjects(scene);
  for (let leftIndex = 0; leftIndex < objects.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < objects.length; rightIndex += 1) {
      const a = objects[leftIndex];
      const b = objects[rightIndex];
      const collision = detectAabbCollision(a, b, scene.dimension);
      if (!collision) continue;
      const trigger = a.collider.isTrigger || b.collider.isTrigger;
      collisions.push({
        entityAId: a.entity.id,
        entityBId: b.entity.id,
        trigger,
        normal: collision.normal,
        penetration: collision.penetration,
      });
      if (trigger) continue;
      const dynamicA = isDynamic(a.body);
      const dynamicB = isDynamic(b.body);
      if (!dynamicA && !dynamicB) continue;
      const shareA = dynamicA ? (dynamicB ? 0.5 : 1) : 0;
      const shareB = dynamicB ? (dynamicA ? 0.5 : 1) : 0;
      if (dynamicA) {
        moveEntity(a.entity, scaleVector3(collision.normal, collision.penetration * shareA));
        resolveVelocity(a.body as RigidBodyComponent, collision.normal);
      }
      if (dynamicB) {
        const opposite = scaleVector3(collision.normal, -1);
        moveEntity(b.entity, scaleVector3(opposite, collision.penetration * shareB));
        resolveVelocity(b.body as RigidBodyComponent, opposite);
      }
    }
  }
  return { collisions };
}
