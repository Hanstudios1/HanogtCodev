import { isFiniteVector3 } from "./math";
import type {
  GameComponent,
  GameProjectDocument,
  SceneDocument,
  Vector3,
} from "./types";
import { GAME_ENGINE_SCHEMA_VERSION, MAX_SERIALIZED_SCENE_BYTES, SUPPORTED_SCRIPT_LANGUAGES } from "./types";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  issues: ValidationIssue[];
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const COMPONENT_TYPES = new Set([
  "transform",
  "spriteRenderer",
  "meshRenderer",
  "camera",
  "light",
  "rigidBody",
  "collider",
  "script",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(
  issues: ValidationIssue[],
  path: string,
  code: string,
  message: string,
  severity: ValidationSeverity = "error",
): void {
  issues.push({ path, code, message, severity });
}

function rejectUnsafeKeys(value: unknown, issues: ValidationIssue[], path = "$", depth = 0): void {
  if (depth > 32) {
    issue(issues, path, "MAX_DEPTH", "Belge izin verilen iç içe geçme sınırını aşıyor.");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectUnsafeKeys(item, issues, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      issue(issues, `${path}.${key}`, "UNSAFE_KEY", "Güvenli olmayan nesne anahtarı reddedildi.");
      continue;
    }
    rejectUnsafeKeys(value[key], issues, `${path}.${key}`, depth + 1);
  }
}

function expectString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options: { min?: number; max?: number; pattern?: RegExp } = {},
): value is string {
  if (typeof value !== "string") {
    issue(issues, path, "EXPECTED_STRING", "Metin değeri bekleniyordu.");
    return false;
  }
  const min = options.min ?? 0;
  const max = options.max ?? 10_000;
  if (value.length < min || value.length > max) {
    issue(issues, path, "STRING_LENGTH", `Metin uzunluğu ${min}-${max} karakter olmalıdır.`);
  }
  if (options.pattern && !options.pattern.test(value)) {
    issue(issues, path, "STRING_FORMAT", "Metin biçimi geçersiz.");
  }
  return true;
}

function expectNumber(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  min = -1_000_000,
  max = 1_000_000,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issue(issues, path, "EXPECTED_NUMBER", "Sonlu bir sayı bekleniyordu.");
    return false;
  }
  if (value < min || value > max) issue(issues, path, "NUMBER_RANGE", `Değer ${min}-${max} aralığında olmalıdır.`);
  return true;
}

function expectBoolean(value: unknown, path: string, issues: ValidationIssue[]): value is boolean {
  if (typeof value !== "boolean") {
    issue(issues, path, "EXPECTED_BOOLEAN", "Doğru/yanlış değeri bekleniyordu.");
    return false;
  }
  return true;
}

function validateVector3(value: unknown, path: string, issues: ValidationIssue[], min = -1_000_000, max = 1_000_000): value is Vector3 {
  if (!isRecord(value)) {
    issue(issues, path, "EXPECTED_VECTOR3", "Üç boyutlu vektör bekleniyordu.");
    return false;
  }
  const vector = value as unknown as Vector3;
  const valid = isFiniteVector3(vector);
  if (!valid) {
    issue(issues, path, "INVALID_VECTOR3", "Vektör eksenleri sonlu sayı olmalıdır.");
    return false;
  }
  expectNumber(vector.x, `${path}.x`, issues, min, max);
  expectNumber(vector.y, `${path}.y`, issues, min, max);
  expectNumber(vector.z, `${path}.z`, issues, min, max);
  return true;
}

function validateId(value: unknown, path: string, issues: ValidationIssue[]): value is string {
  return expectString(value, path, issues, { min: 1, max: 160, pattern: /^[\p{L}\p{N}._:-]+$/u });
}

function validateColor(value: unknown, path: string, issues: ValidationIssue[]): void {
  expectString(value, path, issues, { min: 4, max: 9, pattern: /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i });
}

function validateScript(component: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  if (!SUPPORTED_SCRIPT_LANGUAGES.includes(component.language as "csharp" | "cpp")) {
    issue(issues, `${path}.language`, "SCRIPT_LANGUAGE", "Yalnızca C# ve C++ betik metadatası desteklenir.");
  }
  const expectedExtension = component.language === "csharp" ? /\.cs$/i : /\.(cpp|cc|cxx|h|hpp)$/i;
  expectString(component.fileName, `${path}.fileName`, issues, { min: 1, max: 120, pattern: expectedExtension });
  if (component.entryClass !== null) expectString(component.entryClass, `${path}.entryClass`, issues, { max: 160 });
  expectString(component.source, `${path}.source`, issues, { max: 250_000 });
  if (component.sourceKind !== "plain-text") {
    issue(issues, `${path}.sourceKind`, "SCRIPT_SOURCE_KIND", "Betikler yalnızca düz metin olarak saklanabilir.");
  }
  if (component.executionPolicy !== "external-toolchain-required") {
    issue(issues, `${path}.executionPolicy`, "SCRIPT_POLICY", "Tarayıcı içi betik yürütme politikası desteklenmiyor.");
  }
  if (component.compileState !== "not-compiled") {
    issue(issues, `${path}.compileState`, "SCRIPT_COMPILE_STATE", "Web çekirdeği derleme sonucu beyan edemez.");
  }
}

function validateComponent(value: unknown, path: string, issues: ValidationIssue[], componentIds: Set<string>): void {
  if (!isRecord(value)) {
    issue(issues, path, "EXPECTED_COMPONENT", "Bileşen nesnesi bekleniyordu.");
    return;
  }
  if (!validateId(value.id, `${path}.id`, issues)) return;
  if (componentIds.has(value.id)) issue(issues, `${path}.id`, "DUPLICATE_COMPONENT_ID", "Bileşen kimliği benzersiz olmalıdır.");
  componentIds.add(value.id);
  expectBoolean(value.enabled, `${path}.enabled`, issues);
  if (typeof value.type !== "string" || !COMPONENT_TYPES.has(value.type)) {
    issue(issues, `${path}.type`, "COMPONENT_TYPE", "Desteklenmeyen bileşen türü.");
    return;
  }

  switch (value.type as GameComponent["type"]) {
    case "transform":
      validateVector3(value.position, `${path}.position`, issues);
      validateVector3(value.rotation, `${path}.rotation`, issues, -360_000, 360_000);
      if (validateVector3(value.scale, `${path}.scale`, issues, -10_000, 10_000)) {
        const scale = value.scale as unknown as Vector3;
        if (Math.abs(scale.x) < 0.000001 || Math.abs(scale.y) < 0.000001 || Math.abs(scale.z) < 0.000001) {
          issue(issues, `${path}.scale`, "ZERO_SCALE", "Sıfır ölçek dönüşüm hesabını kararsız hale getirir.", "warning");
        }
      }
      break;
    case "spriteRenderer":
      if (value.assetId !== null) validateId(value.assetId, `${path}.assetId`, issues);
      validateColor(value.color, `${path}.color`, issues);
      expectNumber(value.opacity, `${path}.opacity`, issues, 0, 1);
      expectNumber(value.pixelsPerUnit, `${path}.pixelsPerUnit`, issues, 0.001, 100_000);
      expectNumber(value.sortingLayer, `${path}.sortingLayer`, issues, -10_000, 10_000);
      expectBoolean(value.flipX, `${path}.flipX`, issues);
      expectBoolean(value.flipY, `${path}.flipY`, issues);
      break;
    case "meshRenderer": {
      if (!isRecord(value.mesh) || (value.mesh.kind !== "primitive" && value.mesh.kind !== "asset")) {
        issue(issues, `${path}.mesh`, "MESH_REFERENCE", "Geçerli bir primitive veya varlık ağı bekleniyordu.");
      } else if (value.mesh.kind === "asset") {
        validateId(value.mesh.assetId, `${path}.mesh.assetId`, issues);
      } else if (!["cube", "sphere", "plane", "capsule", "cylinder"].includes(String(value.mesh.primitive))) {
        issue(issues, `${path}.mesh.primitive`, "PRIMITIVE_MESH", "Desteklenmeyen primitive ağ türü.");
      }
      if (!isRecord(value.material)) {
        issue(issues, `${path}.material`, "MATERIAL", "Malzeme nesnesi bekleniyordu.");
      } else {
        validateColor(value.material.color, `${path}.material.color`, issues);
        expectNumber(value.material.metallic, `${path}.material.metallic`, issues, 0, 1);
        expectNumber(value.material.roughness, `${path}.material.roughness`, issues, 0, 1);
        expectNumber(value.material.opacity, `${path}.material.opacity`, issues, 0, 1);
        if (value.material.textureAssetId !== null) validateId(value.material.textureAssetId, `${path}.material.textureAssetId`, issues);
      }
      expectBoolean(value.castShadows, `${path}.castShadows`, issues);
      expectBoolean(value.receiveShadows, `${path}.receiveShadows`, issues);
      break;
    }
    case "camera":
      if (value.projection !== "perspective" && value.projection !== "orthographic") issue(issues, `${path}.projection`, "CAMERA_PROJECTION", "Kamera izdüşümü geçersiz.");
      expectNumber(value.fieldOfView, `${path}.fieldOfView`, issues, 1, 179);
      expectNumber(value.orthographicSize, `${path}.orthographicSize`, issues, 0.001, 100_000);
      expectNumber(value.nearClip, `${path}.nearClip`, issues, 0.0001, 100_000);
      expectNumber(value.farClip, `${path}.farClip`, issues, 0.001, 1_000_000);
      validateColor(value.clearColor, `${path}.clearColor`, issues);
      expectBoolean(value.primary, `${path}.primary`, issues);
      break;
    case "light":
      if (!["directional", "point", "spot"].includes(String(value.lightType))) issue(issues, `${path}.lightType`, "LIGHT_TYPE", "Işık türü geçersiz.");
      validateColor(value.color, `${path}.color`, issues);
      expectNumber(value.intensity, `${path}.intensity`, issues, 0, 100_000);
      expectNumber(value.range, `${path}.range`, issues, 0, 1_000_000);
      expectNumber(value.spotAngle, `${path}.spotAngle`, issues, 1, 179);
      expectBoolean(value.castShadows, `${path}.castShadows`, issues);
      break;
    case "rigidBody":
      if (!["static", "dynamic", "kinematic"].includes(String(value.bodyType))) issue(issues, `${path}.bodyType`, "BODY_TYPE", "Fizik gövde türü geçersiz.");
      expectNumber(value.mass, `${path}.mass`, issues, 0.0001, 1_000_000);
      expectBoolean(value.useGravity, `${path}.useGravity`, issues);
      expectNumber(value.gravityScale, `${path}.gravityScale`, issues, -100, 100);
      validateVector3(value.velocity, `${path}.velocity`, issues);
      validateVector3(value.angularVelocity, `${path}.angularVelocity`, issues);
      expectNumber(value.linearDamping, `${path}.linearDamping`, issues, 0, 100);
      expectNumber(value.restitution, `${path}.restitution`, issues, 0, 1);
      if (!isRecord(value.freezePosition)) issue(issues, `${path}.freezePosition`, "FREEZE_AXES", "Eksen kilitleri bekleniyordu.");
      else {
        expectBoolean(value.freezePosition.x, `${path}.freezePosition.x`, issues);
        expectBoolean(value.freezePosition.y, `${path}.freezePosition.y`, issues);
        expectBoolean(value.freezePosition.z, `${path}.freezePosition.z`, issues);
      }
      break;
    case "collider":
      if (!["box", "sphere", "circle"].includes(String(value.shape))) issue(issues, `${path}.shape`, "COLLIDER_SHAPE", "Çarpışma şekli geçersiz.");
      validateVector3(value.size, `${path}.size`, issues, 0.0001, 1_000_000);
      expectNumber(value.radius, `${path}.radius`, issues, 0.0001, 1_000_000);
      validateVector3(value.offset, `${path}.offset`, issues);
      expectBoolean(value.isTrigger, `${path}.isTrigger`, issues);
      break;
    case "script":
      validateScript(value, path, issues);
      break;
  }
}

export function validateScene(value: unknown): ValidationResult<SceneDocument> {
  const issues: ValidationIssue[] = [];
  rejectUnsafeKeys(value, issues);
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    if (bytes > MAX_SERIALIZED_SCENE_BYTES) issue(issues, "$", "SCENE_SIZE", `Sahne ${MAX_SERIALIZED_SCENE_BYTES} bayt sınırını aşıyor.`);
  } catch {
    issue(issues, "$", "NOT_SERIALIZABLE", "Sahne güvenli JSON olarak serileştirilemiyor.");
  }
  if (!isRecord(value)) {
    issue(issues, "$", "EXPECTED_SCENE", "Sahne belgesi bekleniyordu.");
    return { valid: false, issues };
  }
  if (value.version !== GAME_ENGINE_SCHEMA_VERSION) issue(issues, "$.version", "SCHEMA_VERSION", "Desteklenmeyen sahne şema sürümü.");
  validateId(value.id, "$.id", issues);
  expectString(value.name, "$.name", issues, { min: 1, max: 120 });
  if (value.dimension !== "2d" && value.dimension !== "3d") issue(issues, "$.dimension", "DIMENSION", "Sahne 2d veya 3d olmalıdır.");
  if (!Array.isArray(value.objects)) {
    issue(issues, "$.objects", "EXPECTED_ENTITIES", "Nesne listesi bekleniyordu.");
  } else if (value.objects.length > 5_000) {
    issue(issues, "$.objects", "ENTITY_LIMIT", "Bir sahnede en fazla 5000 nesne bulunabilir.");
  }

  const entityIds = new Set<string>();
  const componentIds = new Set<string>();
  const parents = new Map<string, string | null>();
  if (Array.isArray(value.objects)) {
    value.objects.forEach((entityValue, index) => {
      const path = `$.objects[${index}]`;
      if (!isRecord(entityValue)) {
        issue(issues, path, "EXPECTED_ENTITY", "Nesne kaydı bekleniyordu.");
        return;
      }
      if (validateId(entityValue.id, `${path}.id`, issues)) {
        if (entityIds.has(entityValue.id)) issue(issues, `${path}.id`, "DUPLICATE_ENTITY_ID", "Nesne kimliği benzersiz olmalıdır.");
        entityIds.add(entityValue.id);
      }
      expectString(entityValue.name, `${path}.name`, issues, { min: 1, max: 120 });
      if (entityValue.parentId !== null) validateId(entityValue.parentId, `${path}.parentId`, issues);
      expectBoolean(entityValue.active, `${path}.active`, issues);
      if (!Array.isArray(entityValue.components)) {
        issue(issues, `${path}.components`, "EXPECTED_COMPONENTS", "Bileşen listesi bekleniyordu.");
        return;
      }
      if (entityValue.components.length > 64) issue(issues, `${path}.components`, "COMPONENT_LIMIT", "Bir nesnede en fazla 64 bileşen bulunabilir.");
      const transforms = entityValue.components.filter((component) => isRecord(component) && component.type === "transform");
      if (transforms.length !== 1) issue(issues, `${path}.components`, "TRANSFORM_COUNT", "Her nesnede tam olarak bir transform olmalıdır.");
      entityValue.components.forEach((component, componentIndex) => validateComponent(component, `${path}.components[${componentIndex}]`, issues, componentIds));
      if (typeof entityValue.id === "string") {
        parents.set(entityValue.id, typeof entityValue.parentId === "string" ? entityValue.parentId : null);
      }
    });
  }

  for (const [entityId, parentId] of parents) {
    if (parentId && !entityIds.has(parentId)) issue(issues, `$.objects.${entityId}.parentId`, "MISSING_PARENT", "Üst nesne sahnede bulunamadı.");
    const visited = new Set<string>([entityId]);
    let cursor = parentId;
    let depth = 0;
    while (cursor) {
      if (visited.has(cursor)) {
        issue(issues, `$.objects.${entityId}.parentId`, "HIERARCHY_CYCLE", "Transform hiyerarşisi döngü içeremez.");
        break;
      }
      visited.add(cursor);
      cursor = parents.get(cursor) ?? null;
      depth += 1;
      if (depth > 128) {
        issue(issues, `$.objects.${entityId}.parentId`, "HIERARCHY_DEPTH", "Transform hiyerarşisi 128 seviyeyi aşamaz.");
        break;
      }
    }
  }

  if (!isRecord(value.settings)) issue(issues, "$.settings", "SETTINGS", "Sahne ayarları bekleniyordu.");
  else {
    validateColor(value.settings.backgroundColor, "$.settings.backgroundColor", issues);
    expectNumber(value.settings.ambientLight, "$.settings.ambientLight", issues, 0, 10);
    if (!isRecord(value.settings.physics)) issue(issues, "$.settings.physics", "PHYSICS_SETTINGS", "Fizik ayarları bekleniyordu.");
    else {
      validateVector3(value.settings.physics.gravity, "$.settings.physics.gravity", issues, -1_000, 1_000);
      expectNumber(value.settings.physics.fixedTimeStep, "$.settings.physics.fixedTimeStep", issues, 1 / 1000, 1 / 10);
      expectNumber(value.settings.physics.maxSubSteps, "$.settings.physics.maxSubSteps", issues, 1, 20);
      if (!isRecord(value.settings.physics.worldBounds)) issue(issues, "$.settings.physics.worldBounds", "WORLD_BOUNDS", "Dünya sınırları bekleniyordu.");
      else {
        expectBoolean(value.settings.physics.worldBounds.enabled, "$.settings.physics.worldBounds.enabled", issues);
        validateVector3(value.settings.physics.worldBounds.min, "$.settings.physics.worldBounds.min", issues);
        validateVector3(value.settings.physics.worldBounds.max, "$.settings.physics.worldBounds.max", issues);
      }
    }
  }
  if (!isRecord(value.metadata)) issue(issues, "$.metadata", "METADATA", "Sahne metadatası bekleniyordu.");
  else {
    expectString(value.metadata.createdAt, "$.metadata.createdAt", issues, { min: 20, max: 40 });
    expectString(value.metadata.updatedAt, "$.metadata.updatedAt", issues, { min: 20, max: 40 });
    if (value.metadata.templateId !== null) expectString(value.metadata.templateId, "$.metadata.templateId", issues, { min: 1, max: 80 });
  }

  const valid = !issues.some((item) => item.severity === "error");
  return { valid, value: valid ? (value as unknown as SceneDocument) : undefined, issues };
}

export function assertValidScene(value: unknown): asserts value is SceneDocument {
  const result = validateScene(value);
  if (!result.valid) {
    const detail = result.issues.filter((item) => item.severity === "error").slice(0, 8).map((item) => `${item.path}: ${item.message}`).join("; ");
    throw new Error(`Geçersiz oyun sahnesi: ${detail}`);
  }
}

export function validateProject(value: unknown): ValidationResult<GameProjectDocument> {
  const issues: ValidationIssue[] = [];
  rejectUnsafeKeys(value, issues);
  if (!isRecord(value)) {
    issue(issues, "$", "EXPECTED_PROJECT", "Oyun projesi bekleniyordu.");
    return { valid: false, issues };
  }
  if (value.version !== GAME_ENGINE_SCHEMA_VERSION) issue(issues, "$.version", "SCHEMA_VERSION", "Desteklenmeyen proje şema sürümü.");
  validateId(value.id, "$.id", issues);
  expectString(value.name, "$.name", issues, { min: 1, max: 120 });
  if (value.dimension !== "2d" && value.dimension !== "3d") issue(issues, "$.dimension", "DIMENSION", "Proje 2d veya 3d olmalıdır.");
  validateId(value.activeSceneId, "$.activeSceneId", issues);
  const scriptLanguages = Array.isArray(value.supportedScriptLanguages) ? value.supportedScriptLanguages : [];
  if (scriptLanguages.length !== 2 || !SUPPORTED_SCRIPT_LANGUAGES.every((language) => scriptLanguages.includes(language))) {
    issue(issues, "$.supportedScriptLanguages", "SCRIPT_LANGUAGES", "Oyun projesi C# ve C++ metadatasını desteklediğini açıkça belirtmelidir.");
  }
  if (!Array.isArray(value.scenes) || value.scenes.length === 0 || value.scenes.length > 100) {
    issue(issues, "$.scenes", "SCENE_COUNT", "Projede 1-100 sahne bulunmalıdır.");
  } else {
    const sceneIds = new Set<string>();
    value.scenes.forEach((sceneValue, index) => {
      const sceneResult = validateScene(sceneValue);
      for (const sceneIssue of sceneResult.issues) issues.push({ ...sceneIssue, path: `$.scenes[${index}]${sceneIssue.path.slice(1)}` });
      if (isRecord(sceneValue) && typeof sceneValue.id === "string") {
        if (sceneIds.has(sceneValue.id)) issue(issues, `$.scenes[${index}].id`, "DUPLICATE_SCENE_ID", "Sahne kimliği benzersiz olmalıdır.");
        sceneIds.add(sceneValue.id);
        if (sceneValue.dimension !== value.dimension) issue(issues, `$.scenes[${index}].dimension`, "PROJECT_DIMENSION", "Sahne boyutu proje boyutuyla aynı olmalıdır.");
      }
    });
    if (typeof value.activeSceneId === "string" && !sceneIds.has(value.activeSceneId)) issue(issues, "$.activeSceneId", "ACTIVE_SCENE", "Etkin sahne projede bulunamadı.");
  }
  if (!isRecord(value.metadata)) issue(issues, "$.metadata", "METADATA", "Proje metadatası bekleniyordu.");
  else {
    expectString(value.metadata.createdAt, "$.metadata.createdAt", issues, { min: 20, max: 40 });
    expectString(value.metadata.updatedAt, "$.metadata.updatedAt", issues, { min: 20, max: 40 });
  }
  const valid = !issues.some((item) => item.severity === "error");
  return { valid, value: valid ? (value as unknown as GameProjectDocument) : undefined, issues };
}

export function assertValidProject(value: unknown): asserts value is GameProjectDocument {
  const result = validateProject(value);
  if (!result.valid) {
    const detail = result.issues.filter((item) => item.severity === "error").slice(0, 8).map((item) => `${item.path}: ${item.message}`).join("; ");
    throw new Error(`Geçersiz oyun projesi: ${detail}`);
  }
}
