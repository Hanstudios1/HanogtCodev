import {
    GAME_ENGINE_SCHEMA_VERSION,
    type CameraComponent,
    type ColliderComponent,
    type GameComponent,
    type GameDimension,
    type GameEntity,
    type GameProjectDocument,
    type LightComponent,
    type MeshRendererComponent,
    type SceneDocument,
    type SpriteRendererComponent,
    type TransformComponent,
    type Vector3,
} from "@/lib/game-engine/types";
import { createEngineId, nowIso } from "@/lib/game-engine/ids";

export type GameObjectKind = "empty" | "sprite" | "cube" | "sphere" | "plane" | "camera" | "light";

const vector = (x = 0, y = 0, z = 0): Vector3 => ({ x, y, z });

export function createTransform(parentId: string | null = null, position = vector()): TransformComponent {
    void parentId;
    return {
        id: createEngineId("cmp"),
        type: "transform",
        enabled: true,
        position,
        rotation: vector(),
        scale: vector(1, 1, 1),
    };
}

function spriteRenderer(color: string): SpriteRendererComponent {
    return {
        id: createEngineId("cmp"),
        type: "spriteRenderer",
        enabled: true,
        assetId: null,
        color,
        opacity: 1,
        pixelsPerUnit: 100,
        sortingLayer: 0,
        flipX: false,
        flipY: false,
    };
}

function meshRenderer(primitive: "cube" | "sphere" | "plane", color: string): MeshRendererComponent {
    return {
        id: createEngineId("cmp"),
        type: "meshRenderer",
        enabled: true,
        mesh: { kind: "primitive", primitive },
        material: {
            color,
            metallic: 0.08,
            roughness: 0.58,
            opacity: 1,
            textureAssetId: null,
        },
        castShadows: true,
        receiveShadows: true,
    };
}

function collider(shape: "box" | "sphere" | "circle"): ColliderComponent {
    return {
        id: createEngineId("cmp"),
        type: "collider",
        enabled: true,
        shape,
        size: vector(1, 1, 1),
        radius: 0.5,
        offset: vector(),
        isTrigger: false,
    };
}

function camera(dimension: GameDimension): CameraComponent {
    return {
        id: createEngineId("cmp"),
        type: "camera",
        enabled: true,
        projection: dimension === "2d" ? "orthographic" : "perspective",
        fieldOfView: 60,
        orthographicSize: 5,
        nearClip: 0.1,
        farClip: 1000,
        clearColor: "#111827",
        primary: true,
    };
}

function light(): LightComponent {
    return {
        id: createEngineId("cmp"),
        type: "light",
        enabled: true,
        lightType: "directional",
        color: "#fff7d6",
        intensity: 1,
        range: 10,
        spotAngle: 35,
        castShadows: true,
    };
}

export function createEntity(
    kind: GameObjectKind,
    dimension: GameDimension,
    index = 0,
    parentId: string | null = null,
): GameEntity {
    const palette = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f97316", "#22c55e"];
    const color = palette[index % palette.length];
    const position = dimension === "2d"
        ? vector((index % 4) * 1.3 - 1.8, Math.floor(index / 4) * -1.2 + 0.5, 0)
        : vector((index % 4) * 1.5 - 2, kind === "plane" ? -1 : 0, Math.floor(index / 4) * 1.5);
    const components: GameComponent[] = [createTransform(parentId, position)];
    let name = "GameObject";

    if (kind === "sprite") {
        name = "Sprite";
        components.push(spriteRenderer(color), collider("box"));
    } else if (kind === "cube" || kind === "sphere" || kind === "plane") {
        name = kind === "cube" ? "Cube" : kind === "sphere" ? "Sphere" : "Plane";
        components.push(meshRenderer(kind, kind === "plane" ? "#334155" : color));
        if (kind !== "plane") components.push(collider(kind === "sphere" ? "sphere" : "box"));
    } else if (kind === "camera") {
        name = "Main Camera";
        components.push(camera(dimension));
    } else if (kind === "light") {
        name = "Directional Light";
        components.push(light());
    } else if (kind === "empty") {
        name = "Empty Object";
    }

    return {
        id: createEngineId("entity"),
        name,
        parentId,
        active: true,
        components,
    };
}

export function createStarterProject(
    id = createEngineId("game"),
    name = "Yeni Oyun",
    dimension: GameDimension = "3d",
): GameProjectDocument {
    const timestamp = nowIso();
    const cameraEntity = createEntity("camera", dimension, 0);
    const cameraTransform = getTransform(cameraEntity);
    if (cameraTransform) cameraTransform.position = dimension === "2d" ? vector(0, 0, -10) : vector(5, 4, -7);

    const entities = dimension === "2d"
        ? [cameraEntity, createEntity("sprite", dimension, 1)]
        : [cameraEntity, createEntity("light", dimension, 1), createEntity("cube", dimension, 2), createEntity("plane", dimension, 3)];
    const sceneId = createEngineId("scene");
    const scene: SceneDocument = {
        version: GAME_ENGINE_SCHEMA_VERSION,
        id: sceneId,
        name: "Main Scene",
        dimension,
        objects: entities,
        settings: {
            backgroundColor: dimension === "2d" ? "#111827" : "#0f172a",
            ambientLight: 0.4,
            physics: {
                gravity: vector(0, -9.81, 0),
                fixedTimeStep: 1 / 60,
                maxSubSteps: 4,
                worldBounds: { enabled: false, min: vector(-100, -100, -100), max: vector(100, 100, 100) },
            },
        },
        metadata: { createdAt: timestamp, updatedAt: timestamp, templateId: null },
    };

    return {
        version: GAME_ENGINE_SCHEMA_VERSION,
        id,
        name,
        dimension,
        activeSceneId: sceneId,
        scenes: [scene],
        supportedScriptLanguages: ["csharp", "cpp"],
        metadata: { createdAt: timestamp, updatedAt: timestamp },
    };
}

export function getActiveScene(project: GameProjectDocument): SceneDocument {
    return project.scenes.find((scene) => scene.id === project.activeSceneId) ?? project.scenes[0];
}

export function getTransform(entity: GameEntity): TransformComponent | undefined {
    return entity.components.find((component): component is TransformComponent => component.type === "transform");
}

export function getEntityColor(entity: GameEntity): string {
    const renderer = entity.components.find((component) => component.type === "meshRenderer" || component.type === "spriteRenderer");
    if (renderer?.type === "meshRenderer") return renderer.material.color;
    if (renderer?.type === "spriteRenderer") return renderer.color;
    if (entity.components.some((component) => component.type === "light")) return "#facc15";
    if (entity.components.some((component) => component.type === "camera")) return "#a78bfa";
    return "#94a3b8";
}

export function cloneProject(project: GameProjectDocument): GameProjectDocument {
    return structuredClone(project);
}

type ApiObject = {
    id?: string;
    name?: string;
    type?: string;
    parentId?: string | null;
    active?: boolean;
    transform?: Partial<Pick<TransformComponent, "position" | "rotation" | "scale">>;
    components?: GameComponent[];
};

type ApiProject = {
    id?: string;
    name?: string;
    dimension?: GameDimension;
    scene?: {
        entities?: GameEntity[];
        objects?: ApiObject[];
        settings?: { backgroundColor?: string; gravity?: Vector3 };
    };
    scenes?: SceneDocument[];
    activeSceneId?: string;
    createdAt?: string;
    updatedAt?: string;
};

export function projectFromApi(value: unknown, fallbackId: string): GameProjectDocument {
    const raw = (value && typeof value === "object" && "project" in value
        ? (value as { project?: ApiProject }).project
        : value) as ApiProject | undefined;
    if (!raw) return createStarterProject(fallbackId);

    const dimension: GameDimension = raw.dimension === "2d" ? "2d" : "3d";
    if (Array.isArray(raw.scenes) && raw.scenes.length > 0) {
        return {
            version: GAME_ENGINE_SCHEMA_VERSION,
            id: String(raw.id || fallbackId),
            name: String(raw.name || "Oyun Projesi"),
            dimension,
            activeSceneId: String(raw.activeSceneId || raw.scenes[0].id),
            scenes: raw.scenes,
            supportedScriptLanguages: ["csharp", "cpp"],
            metadata: {
                createdAt: String(raw.createdAt || nowIso()),
                updatedAt: String(raw.updatedAt || nowIso()),
            },
        };
    }

    const project = createStarterProject(String(raw.id || fallbackId), String(raw.name || "Oyun Projesi"), dimension);
    const scene = getActiveScene(project);
    if (Array.isArray(raw.scene?.entities)) {
        scene.objects = raw.scene.entities;
    } else if (Array.isArray(raw.scene?.objects)) {
        scene.objects = raw.scene.objects.map((object, index) => {
            const inferredKind: GameObjectKind = object.type === "camera" || object.type === "light" || object.type === "sprite" || object.type === "sphere" || object.type === "plane"
                ? object.type
                : "cube";
            const entity = createEntity(inferredKind, dimension, index, object.parentId ?? null);
            entity.id = String(object.id || entity.id);
            entity.name = String(object.name || entity.name);
            entity.active = object.active !== false;
            if (Array.isArray(object.components) && object.components.length > 0) entity.components = object.components;
            const transform = getTransform(entity);
            if (transform && object.transform) {
                transform.position = { ...transform.position, ...object.transform.position };
                transform.rotation = { ...transform.rotation, ...object.transform.rotation };
                transform.scale = { ...transform.scale, ...object.transform.scale };
                entity.parentId = object.parentId ?? null;
            }
            return entity;
        });
    }
    if (raw.scene?.settings?.backgroundColor) scene.settings.backgroundColor = raw.scene.settings.backgroundColor;
    if (raw.scene?.settings?.gravity) scene.settings.physics.gravity = raw.scene.settings.gravity;
    return project;
}

export function projectToApi(project: GameProjectDocument) {
    const scene = getActiveScene(project);
    return {
        name: project.name,
        dimension: project.dimension,
        scene: {
            version: GAME_ENGINE_SCHEMA_VERSION,
            dimension: project.dimension,
            objects: scene.objects.map((entity) => {
                const transform = getTransform(entity);
                return {
                    id: entity.id,
                    name: entity.name,
                    type: entity.components.some((component) => component.type === "camera")
                        ? "camera"
                        : entity.components.some((component) => component.type === "light")
                            ? "light"
                            : entity.components.some((component) => component.type === "spriteRenderer")
                                ? "sprite"
                                : entity.components.find((component) => component.type === "meshRenderer")?.type === "meshRenderer"
                                    ? (entity.components.find((component) => component.type === "meshRenderer") as MeshRendererComponent).mesh.kind === "primitive"
                                        ? ((entity.components.find((component) => component.type === "meshRenderer") as MeshRendererComponent).mesh as { kind: "primitive"; primitive: string }).primitive
                                        : "mesh"
                                    : "empty",
                    parentId: entity.parentId,
                    active: entity.active,
                    transform: transform ? { position: transform.position, rotation: transform.rotation, scale: transform.scale } : undefined,
                    components: entity.components,
                    scriptIds: entity.components.filter((component) => component.type === "script").map((component) => component.id),
                };
            }),
            settings: {
                backgroundColor: scene.settings.backgroundColor,
                gravity: scene.settings.physics.gravity,
            },
        },
    };
}
