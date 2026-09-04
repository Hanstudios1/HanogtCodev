export const GAME_ENGINE_SCHEMA_VERSION = 1 as const;
export const MAX_SERIALIZED_SCENE_BYTES = 512 * 1024;

export const SUPPORTED_SCRIPT_LANGUAGES = ["csharp", "cpp"] as const;

export type GameDimension = "2d" | "3d";
export type ScriptLanguage = (typeof SUPPORTED_SCRIPT_LANGUAGES)[number];
export type EngineMode = "edit" | "playing" | "paused";

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 extends Vector2 {
  z: number;
}

export interface ComponentBase {
  id: string;
  enabled: boolean;
}

export interface TransformComponent extends ComponentBase {
  type: "transform";
  position: Vector3;
  /** Euler angles in degrees. */
  rotation: Vector3;
  scale: Vector3;
}

export interface SpriteRendererComponent extends ComponentBase {
  type: "spriteRenderer";
  assetId: string | null;
  color: string;
  opacity: number;
  pixelsPerUnit: number;
  sortingLayer: number;
  flipX: boolean;
  flipY: boolean;
}

export type PrimitiveMesh = "cube" | "sphere" | "plane" | "capsule" | "cylinder";

export interface MeshRendererComponent extends ComponentBase {
  type: "meshRenderer";
  mesh: { kind: "primitive"; primitive: PrimitiveMesh } | { kind: "asset"; assetId: string };
  material: {
    color: string;
    metallic: number;
    roughness: number;
    opacity: number;
    textureAssetId: string | null;
  };
  castShadows: boolean;
  receiveShadows: boolean;
}

export interface CameraComponent extends ComponentBase {
  type: "camera";
  projection: "perspective" | "orthographic";
  fieldOfView: number;
  orthographicSize: number;
  nearClip: number;
  farClip: number;
  clearColor: string;
  primary: boolean;
}

export interface LightComponent extends ComponentBase {
  type: "light";
  lightType: "directional" | "point" | "spot";
  color: string;
  intensity: number;
  range: number;
  spotAngle: number;
  castShadows: boolean;
}

export interface RigidBodyComponent extends ComponentBase {
  type: "rigidBody";
  bodyType: "static" | "dynamic" | "kinematic";
  mass: number;
  useGravity: boolean;
  gravityScale: number;
  velocity: Vector3;
  angularVelocity: Vector3;
  linearDamping: number;
  restitution: number;
  freezePosition: { x: boolean; y: boolean; z: boolean };
}

export interface ColliderComponent extends ComponentBase {
  type: "collider";
  shape: "box" | "sphere" | "circle";
  size: Vector3;
  radius: number;
  offset: Vector3;
  isTrigger: boolean;
}

/**
 * Script source is intentionally data only. The web runtime never evaluates,
 * transpiles or executes it. A separately configured, isolated toolchain must
 * compile C# or C++ source.
 */
export interface ScriptComponent extends ComponentBase {
  type: "script";
  language: ScriptLanguage;
  fileName: string;
  entryClass: string | null;
  source: string;
  sourceKind: "plain-text";
  executionPolicy: "external-toolchain-required";
  compileState: "not-compiled";
}

export type GameComponent =
  | TransformComponent
  | SpriteRendererComponent
  | MeshRendererComponent
  | CameraComponent
  | LightComponent
  | RigidBodyComponent
  | ColliderComponent
  | ScriptComponent;

export interface GameEntity {
  id: string;
  name: string;
  parentId: string | null;
  active: boolean;
  components: GameComponent[];
}

export interface ScenePhysicsSettings {
  gravity: Vector3;
  fixedTimeStep: number;
  maxSubSteps: number;
  worldBounds: {
    enabled: boolean;
    min: Vector3;
    max: Vector3;
  };
}

export interface SceneDocument {
  version: typeof GAME_ENGINE_SCHEMA_VERSION;
  id: string;
  name: string;
  dimension: GameDimension;
  objects: GameEntity[];
  settings: {
    backgroundColor: string;
    ambientLight: number;
    physics: ScenePhysicsSettings;
  };
  metadata: {
    createdAt: string;
    updatedAt: string;
    templateId: string | null;
  };
}

export interface GameProjectDocument {
  version: typeof GAME_ENGINE_SCHEMA_VERSION;
  id: string;
  name: string;
  dimension: GameDimension;
  activeSceneId: string;
  scenes: SceneDocument[];
  supportedScriptLanguages: ScriptLanguage[];
  metadata: {
    createdAt: string;
    updatedAt: string;
  };
}

export type ComponentType = GameComponent["type"];
export type ComponentOfType<T extends ComponentType> = Extract<GameComponent, { type: T }>;

export interface CollisionEvent {
  entityAId: string;
  entityBId: string;
  trigger: boolean;
  normal: Vector3;
  penetration: number;
}

export interface SimulationFrame {
  scene: SceneDocument;
  mode: EngineMode;
  deltaTime: number;
  elapsedTime: number;
  collisions: CollisionEvent[];
}
