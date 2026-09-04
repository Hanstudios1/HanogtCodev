import { createEngineId } from "./ids";
import type {
  CameraComponent,
  ColliderComponent,
  LightComponent,
  MeshRendererComponent,
  RigidBodyComponent,
  ScriptComponent,
  ScriptLanguage,
  SpriteRendererComponent,
} from "./types";

export function createSpriteRenderer(overrides: Partial<Omit<SpriteRendererComponent, "type">> = {}): SpriteRendererComponent {
  return {
    id: overrides.id ?? createEngineId("component"),
    type: "spriteRenderer",
    enabled: overrides.enabled ?? true,
    assetId: overrides.assetId ?? null,
    color: overrides.color ?? "#ffffff",
    opacity: overrides.opacity ?? 1,
    pixelsPerUnit: overrides.pixelsPerUnit ?? 100,
    sortingLayer: overrides.sortingLayer ?? 0,
    flipX: overrides.flipX ?? false,
    flipY: overrides.flipY ?? false,
  };
}

export function createMeshRenderer(overrides: Partial<Omit<MeshRendererComponent, "type">> = {}): MeshRendererComponent {
  return {
    id: overrides.id ?? createEngineId("component"),
    type: "meshRenderer",
    enabled: overrides.enabled ?? true,
    mesh: overrides.mesh ?? { kind: "primitive", primitive: "cube" },
    material: {
      color: "#ffffff",
      metallic: 0,
      roughness: 0.65,
      opacity: 1,
      textureAssetId: null,
      ...overrides.material,
    },
    castShadows: overrides.castShadows ?? true,
    receiveShadows: overrides.receiveShadows ?? true,
  };
}

export function createCamera(overrides: Partial<Omit<CameraComponent, "type">> = {}): CameraComponent {
  return {
    id: overrides.id ?? createEngineId("component"),
    type: "camera",
    enabled: overrides.enabled ?? true,
    projection: overrides.projection ?? "perspective",
    fieldOfView: overrides.fieldOfView ?? 60,
    orthographicSize: overrides.orthographicSize ?? 5,
    nearClip: overrides.nearClip ?? 0.1,
    farClip: overrides.farClip ?? 1_000,
    clearColor: overrides.clearColor ?? "#0b1020",
    primary: overrides.primary ?? true,
  };
}

export function createLight(overrides: Partial<Omit<LightComponent, "type">> = {}): LightComponent {
  return {
    id: overrides.id ?? createEngineId("component"),
    type: "light",
    enabled: overrides.enabled ?? true,
    lightType: overrides.lightType ?? "directional",
    color: overrides.color ?? "#ffffff",
    intensity: overrides.intensity ?? 1,
    range: overrides.range ?? 10,
    spotAngle: overrides.spotAngle ?? 45,
    castShadows: overrides.castShadows ?? true,
  };
}

export function createRigidBody(overrides: Partial<Omit<RigidBodyComponent, "type">> = {}): RigidBodyComponent {
  return {
    id: overrides.id ?? createEngineId("component"),
    type: "rigidBody",
    enabled: overrides.enabled ?? true,
    bodyType: overrides.bodyType ?? "dynamic",
    mass: overrides.mass ?? 1,
    useGravity: overrides.useGravity ?? true,
    gravityScale: overrides.gravityScale ?? 1,
    velocity: { x: 0, y: 0, z: 0, ...overrides.velocity },
    angularVelocity: { x: 0, y: 0, z: 0, ...overrides.angularVelocity },
    linearDamping: overrides.linearDamping ?? 0.05,
    restitution: overrides.restitution ?? 0.1,
    freezePosition: { x: false, y: false, z: false, ...overrides.freezePosition },
  };
}

export function createCollider(overrides: Partial<Omit<ColliderComponent, "type">> = {}): ColliderComponent {
  return {
    id: overrides.id ?? createEngineId("component"),
    type: "collider",
    enabled: overrides.enabled ?? true,
    shape: overrides.shape ?? "box",
    size: { x: 1, y: 1, z: 1, ...overrides.size },
    radius: overrides.radius ?? 0.5,
    offset: { x: 0, y: 0, z: 0, ...overrides.offset },
    isTrigger: overrides.isTrigger ?? false,
  };
}

function safeScriptBaseName(fileName: string): string {
  const withoutPath = fileName.replace(/\\/g, "/").split("/").at(-1) ?? "NewScript";
  return withoutPath.replace(/[^\p{L}\p{N}_.-]/gu, "_").slice(0, 100) || "NewScript";
}

export function createScriptComponent(language: ScriptLanguage, requestedFileName = "NewScript"): ScriptComponent {
  const extension = language === "csharp" ? ".cs" : ".cpp";
  const baseName = safeScriptBaseName(requestedFileName).replace(/\.(cs|cpp|cc|cxx|h|hpp)$/i, "");
  const fileName = `${baseName}${extension}`;
  const className = baseName.replace(/[^\p{L}\p{N}_]/gu, "_").replace(/^\d/, "_$&") || "NewScript";
  const source = language === "csharp"
    ? `public sealed class ${className}\n{\n    // Harici C# araç zincirinde derlenir; web önizlemesi bu kodu çalıştırmaz.\n    public void Update(float deltaTime)\n    {\n    }\n}\n`
    : `// Harici C++ araç zincirinde derlenir; web önizlemesi bu kodu çalıştırmaz.\nclass ${className}\n{\npublic:\n    void Update(float deltaTime)\n    {\n    }\n};\n`;
  return {
    id: createEngineId("script"),
    type: "script",
    enabled: true,
    language,
    fileName,
    entryClass: className,
    source,
    sourceKind: "plain-text",
    executionPolicy: "external-toolchain-required",
    compileState: "not-compiled",
  };
}

/** Backwards-friendly alias that still produces non-executable metadata. */
export const createScriptMetadata = createScriptComponent;
