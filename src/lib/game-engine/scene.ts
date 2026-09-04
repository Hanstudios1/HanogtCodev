import { createEngineId, nowIso } from "./ids";
import { composeTransformMatrix, identityMatrix4, matrixPosition, multiplyMatrix4, type Matrix4 } from "./math";
import type {
  ComponentOfType,
  ComponentType,
  GameComponent,
  GameDimension,
  GameEntity,
  GameProjectDocument,
  SceneDocument,
  TransformComponent,
  Vector3,
} from "./types";
import { GAME_ENGINE_SCHEMA_VERSION, SUPPORTED_SCRIPT_LANGUAGES } from "./types";

export function cloneScene(scene: SceneDocument): SceneDocument {
  return JSON.parse(JSON.stringify(scene)) as SceneDocument;
}

export function cloneProject(project: GameProjectDocument): GameProjectDocument {
  return JSON.parse(JSON.stringify(project)) as GameProjectDocument;
}

export function createTransform(overrides: Partial<Omit<TransformComponent, "type">> = {}): TransformComponent {
  return {
    id: overrides.id ?? createEngineId("component"),
    type: "transform",
    enabled: overrides.enabled ?? true,
    position: { x: 0, y: 0, z: 0, ...overrides.position },
    rotation: { x: 0, y: 0, z: 0, ...overrides.rotation },
    scale: { x: 1, y: 1, z: 1, ...overrides.scale },
  };
}

export function createEntity(name = "Yeni Nesne", components: GameComponent[] = []): GameEntity {
  const transform = components.find((component) => component.type === "transform");
  const remaining = components.filter((component) => component.type !== "transform");
  return {
    id: createEngineId("entity"),
    name,
    parentId: null,
    active: true,
    components: [transform ?? createTransform(), ...remaining],
  };
}

export function createScene(name: string, dimension: GameDimension, templateId: string | null = null): SceneDocument {
  const timestamp = nowIso();
  return {
    version: GAME_ENGINE_SCHEMA_VERSION,
    id: createEngineId("scene"),
    name,
    dimension,
    objects: [],
    settings: {
      backgroundColor: dimension === "2d" ? "#111827" : "#0b1020",
      ambientLight: dimension === "2d" ? 1 : 0.35,
      physics: {
        gravity: { x: 0, y: -9.81, z: 0 },
        fixedTimeStep: 1 / 60,
        maxSubSteps: 5,
        worldBounds: {
          enabled: false,
          min: { x: -100, y: -100, z: -100 },
          max: { x: 100, y: 100, z: 100 },
        },
      },
    },
    metadata: { createdAt: timestamp, updatedAt: timestamp, templateId },
  };
}

export function createProject(name: string, dimension: GameDimension, initialScene?: SceneDocument): GameProjectDocument {
  const scene = initialScene ? cloneScene(initialScene) : createScene("Ana Sahne", dimension);
  if (scene.dimension !== dimension) {
    throw new Error("Proje ve sahne boyutu aynı olmalıdır.");
  }
  const timestamp = nowIso();
  return {
    version: GAME_ENGINE_SCHEMA_VERSION,
    id: createEngineId("game-project"),
    name,
    dimension,
    activeSceneId: scene.id,
    scenes: [scene],
    supportedScriptLanguages: [...SUPPORTED_SCRIPT_LANGUAGES],
    metadata: { createdAt: timestamp, updatedAt: timestamp },
  };
}

export function getComponent<T extends ComponentType>(entity: GameEntity, type: T): ComponentOfType<T> | undefined {
  return entity.components.find((component): component is ComponentOfType<T> => component.type === type);
}

export function getComponents<T extends ComponentType>(entity: GameEntity, type: T): ComponentOfType<T>[] {
  return entity.components.filter((component): component is ComponentOfType<T> => component.type === type);
}

export function getTransform(entity: GameEntity): TransformComponent {
  const transform = getComponent(entity, "transform");
  if (!transform) {
    throw new Error(`Nesne transform bileşeni içermiyor: ${entity.id}`);
  }
  return transform;
}

export function findEntity(scene: SceneDocument, entityId: string): GameEntity | undefined {
  return scene.objects.find((entity) => entity.id === entityId);
}

export function getChildren(scene: SceneDocument, parentId: string | null): GameEntity[] {
  return scene.objects.filter((entity) => entity.parentId === parentId);
}

export function getDescendantIds(scene: SceneDocument, entityId: string): string[] {
  const descendants: string[] = [];
  const queue = [entityId];
  const visited = new Set<string>([entityId]);
  while (queue.length > 0) {
    const parentId = queue.shift() as string;
    for (const child of getChildren(scene, parentId)) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      descendants.push(child.id);
      queue.push(child.id);
    }
  }
  return descendants;
}

function withUpdatedTimestamp(scene: SceneDocument): SceneDocument {
  scene.metadata.updatedAt = nowIso();
  return scene;
}

export function addEntity(scene: SceneDocument, entity: GameEntity, parentId: string | null = null): SceneDocument {
  if (findEntity(scene, entity.id)) {
    throw new Error(`Aynı kimliğe sahip bir nesne zaten var: ${entity.id}`);
  }
  if (parentId && !findEntity(scene, parentId)) {
    throw new Error(`Üst nesne bulunamadı: ${parentId}`);
  }
  const next = cloneScene(scene);
  const added = JSON.parse(JSON.stringify(entity)) as GameEntity;
  added.parentId = parentId;
  next.objects.push(added);
  return withUpdatedTimestamp(next);
}

export function removeEntity(scene: SceneDocument, entityId: string, removeDescendants = true): SceneDocument {
  const entity = findEntity(scene, entityId);
  if (!entity) return cloneScene(scene);
  const next = cloneScene(scene);
  const descendants = new Set(getDescendantIds(scene, entityId));
  if (removeDescendants) {
    next.objects = next.objects.filter((candidate) => candidate.id !== entityId && !descendants.has(candidate.id));
  } else {
    next.objects = next.objects.filter((candidate) => candidate.id !== entityId);
    for (const child of next.objects) {
      if (child.parentId === entityId) child.parentId = entity.parentId;
    }
  }
  return withUpdatedTimestamp(next);
}

export function setEntityParent(scene: SceneDocument, entityId: string, parentId: string | null): SceneDocument {
  const entity = findEntity(scene, entityId);
  if (!entity) throw new Error(`Nesne bulunamadı: ${entityId}`);
  if (parentId === entityId) throw new Error("Bir nesne kendisinin üst nesnesi olamaz.");
  if (parentId && !findEntity(scene, parentId)) throw new Error(`Üst nesne bulunamadı: ${parentId}`);
  if (parentId && getDescendantIds(scene, entityId).includes(parentId)) {
    throw new Error("Döngüsel transform hiyerarşisine izin verilmez.");
  }

  const next = cloneScene(scene);
  const nextEntity = findEntity(next, entityId) as GameEntity;
  nextEntity.parentId = parentId;
  return withUpdatedTimestamp(next);
}

export function updateEntity(scene: SceneDocument, entityId: string, updater: (entity: GameEntity) => void): SceneDocument {
  const next = cloneScene(scene);
  const entity = findEntity(next, entityId);
  if (!entity) throw new Error(`Nesne bulunamadı: ${entityId}`);
  updater(entity);
  return withUpdatedTimestamp(next);
}

export function addComponent(scene: SceneDocument, entityId: string, component: GameComponent): SceneDocument {
  return updateEntity(scene, entityId, (entity) => {
    if (entity.components.some((item) => item.id === component.id)) {
      throw new Error(`Bileşen kimliği zaten kullanılıyor: ${component.id}`);
    }
    if (component.type === "transform" && getComponent(entity, "transform")) {
      throw new Error("Bir nesnede yalnızca bir transform bileşeni olabilir.");
    }
    entity.components.push(JSON.parse(JSON.stringify(component)) as GameComponent);
  });
}

export function removeComponent(scene: SceneDocument, entityId: string, componentId: string): SceneDocument {
  return updateEntity(scene, entityId, (entity) => {
    const component = entity.components.find((item) => item.id === componentId);
    if (!component) return;
    if (component.type === "transform") throw new Error("Transform bileşeni kaldırılamaz.");
    entity.components = entity.components.filter((item) => item.id !== componentId);
  });
}

export function reorderEntity(scene: SceneDocument, entityId: string, targetIndex: number): SceneDocument {
  const next = cloneScene(scene);
  const currentIndex = next.objects.findIndex((entity) => entity.id === entityId);
  if (currentIndex < 0) throw new Error(`Nesne bulunamadı: ${entityId}`);
  const [entity] = next.objects.splice(currentIndex, 1);
  const safeIndex = Math.max(0, Math.min(targetIndex, next.objects.length));
  next.objects.splice(safeIndex, 0, entity);
  return withUpdatedTimestamp(next);
}

export function getWorldMatrix(scene: SceneDocument, entityId: string): Matrix4 {
  const visited = new Set<string>();
  const calculate = (id: string): Matrix4 => {
    if (visited.has(id)) throw new Error("Transform hiyerarşisinde döngü algılandı.");
    visited.add(id);
    const entity = findEntity(scene, id);
    if (!entity) throw new Error(`Nesne bulunamadı: ${id}`);
    const transform = getTransform(entity);
    const local = composeTransformMatrix(transform);
    const world = entity.parentId ? multiplyMatrix4(calculate(entity.parentId), local) : local;
    visited.delete(id);
    return world;
  };
  return calculate(entityId) ?? identityMatrix4();
}

export function getWorldPosition(scene: SceneDocument, entityId: string): Vector3 {
  return matrixPosition(getWorldMatrix(scene, entityId));
}
