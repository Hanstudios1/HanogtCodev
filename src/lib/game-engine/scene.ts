import {
    createAudioSource,
    createCamera,
    createCollider,
    createLight,
    createMeshRenderer,
    createParticleSystem,
    createSpriteRenderer,
    createTilemap,
    createTransform,
    createUIButton,
    createUIPanel,
    createUIProgressBar,
    createUIText,
} from "./components";
import { createEngineId, nowIso } from "./ids";
import { combineTRS, IDENTITY_TRS, quatFromEulerDeg, type TRS } from "./math";
import { cloneJson, defaultSceneSettings } from "./schema";
import {
    GAME_ENGINE_SCHEMA_VERSION,
    type ComponentOfType,
    type ComponentType,
    type GameComponent,
    type GameDimension,
    type GameEntity,
    type GameProjectDocument,
    type PrefabAsset,
    type SceneDocument,
    type TransformComponent,
    type Vector3,
} from "./types";

export function getComponent<T extends ComponentType>(entity: Pick<GameEntity, "components">, type: T): ComponentOfType<T> | undefined {
    return entity.components.find((component): component is ComponentOfType<T> => component.type === type);
}

export function getComponents<T extends ComponentType>(entity: Pick<GameEntity, "components">, type: T): ComponentOfType<T>[] {
    return entity.components.filter((component): component is ComponentOfType<T> => component.type === type);
}

export function getTransform(entity: Pick<GameEntity, "components">): TransformComponent {
    const transform = getComponent(entity, "transform");
    if (!transform) throw new Error("Nesnede Transform bileşeni yok.");
    return transform;
}

export function localTRS(entity: Pick<GameEntity, "components">): TRS {
    const transform = getTransform(entity);
    return { position: transform.position, rotation: quatFromEulerDeg(transform.rotation), scale: transform.scale };
}

export function buildEntityIndex(entities: GameEntity[]) {
    const byId = new Map<string, GameEntity>();
    const children = new Map<string | null, GameEntity[]>();
    for (const entity of entities) {
        byId.set(entity.id, entity);
        const key = entity.parentId && entities.some((candidate) => candidate.id === entity.parentId) ? entity.parentId : null;
        const list = children.get(key) ?? [];
        list.push(entity);
        children.set(key, list);
    }
    return { byId, children };
}

/** World transform of an entity (walks parents; cycles were removed by the schema). */
export function worldTRS(entity: GameEntity, byId: Map<string, GameEntity>): TRS {
    const chain: GameEntity[] = [];
    let cursor: GameEntity | undefined = entity;
    let guard = 0;
    while (cursor && guard < 128) {
        chain.push(cursor);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
        guard += 1;
    }
    let result: TRS = IDENTITY_TRS;
    for (let index = chain.length - 1; index >= 0; index -= 1) result = combineTRS(result, localTRS(chain[index]));
    return result;
}

export function isActiveInHierarchy(entity: GameEntity, byId: Map<string, GameEntity>): boolean {
    let cursor: GameEntity | undefined = entity;
    let guard = 0;
    while (cursor && guard < 128) {
        if (!cursor.active) return false;
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
        guard += 1;
    }
    return true;
}

export function getDescendantIds(entities: GameEntity[], rootId: string): string[] {
    const { children } = buildEntityIndex(entities);
    const output: string[] = [];
    const queue = [rootId];
    while (queue.length) {
        const current = queue.shift() as string;
        for (const child of children.get(current) ?? []) {
            output.push(child.id);
            queue.push(child.id);
        }
    }
    return output;
}

/** Ordered subtree (root first) — used for duplicate, copy/paste and prefabs. */
export function collectSubtree(entities: GameEntity[], rootId: string): GameEntity[] {
    const ids = new Set([rootId, ...getDescendantIds(entities, rootId)]);
    return entities.filter((entity) => ids.has(entity.id));
}

/** Deep-clones entities with fresh entity and component ids, keeping internal parent links. */
export function cloneEntitiesWithNewIds(entities: GameEntity[], rootParentId: string | null = null): GameEntity[] {
    const idMap = new Map<string, string>();
    for (const entity of entities) idMap.set(entity.id, createEngineId("entity"));
    return entities.map((entity) => {
        const copy = cloneJson(entity);
        copy.id = idMap.get(entity.id) as string;
        copy.parentId = entity.parentId && idMap.has(entity.parentId)
            ? idMap.get(entity.parentId) as string
            : rootParentId;
        copy.components = copy.components.map((component) => {
            const cloned = { ...component, id: createEngineId("cmp") } as GameComponent;
            if (cloned.type === "uiButton" && cloned.onClick.targetId && idMap.has(cloned.onClick.targetId)) {
                cloned.onClick = { ...cloned.onClick, targetId: idMap.get(cloned.onClick.targetId) as string };
            }
            if (cloned.type === "script") {
                // Entity references inside the subtree follow the clone.
                const fields = { ...cloned.fields };
                for (const [key, value] of Object.entries(fields)) {
                    if (value && typeof value === "object" && "ref" in value && value.ref === "entity" && value.id && idMap.has(value.id)) {
                        fields[key] = { ref: "entity", id: idMap.get(value.id) as string };
                    }
                }
                cloned.fields = fields;
            }
            return cloned;
        });
        return copy;
    });
}

export function uniqueName(base: string, existing: Iterable<string>): string {
    const names = new Set(existing);
    if (!names.has(base)) return base;
    const stem = base.replace(/\s\(\d+\)$/, "");
    for (let index = 1; index < 10_000; index += 1) {
        const candidate = `${stem} (${index})`;
        if (!names.has(candidate)) return candidate;
    }
    return `${stem} ${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Entity presets for the "Create" menu
// ---------------------------------------------------------------------------

export type EntityPreset =
    | "empty"
    | "sprite"
    | "circleSprite"
    | "cube"
    | "sphere"
    | "plane"
    | "capsule"
    | "cylinder"
    | "cone"
    | "torus"
    | "camera"
    | "directionalLight"
    | "pointLight"
    | "spotLight"
    | "particles"
    | "text"
    | "button"
    | "panel"
    | "progressBar"
    | "tilemap"
    | "audio";

const PALETTE = ["#6366f1", "#22c55e", "#f97316", "#06b6d4", "#ec4899", "#eab308", "#8b5cf6"];

export function createEntityFromPreset(preset: EntityPreset, dimension: GameDimension, position: Vector3 = { x: 0, y: 0, z: 0 }, seed = 0): GameEntity {
    const color = PALETTE[Math.abs(seed) % PALETTE.length];
    const transform = createTransform({ position });
    const entity = (name: string, components: GameComponent[], tag = "Untagged"): GameEntity => ({
        id: createEngineId("entity"),
        name,
        tag,
        parentId: null,
        active: true,
        components: [transform, ...components],
    });
    const collider2d = () => createCollider({ shape: "box" });

    switch (preset) {
        case "empty":
            return entity("GameObject", []);
        case "sprite":
            return entity("Sprite", [createSpriteRenderer({ color }), collider2d()]);
        case "circleSprite":
            return entity("Circle", [createSpriteRenderer({ color, shape: "circle" }), createCollider({ shape: "circle", radius: 0.5 })]);
        case "cube":
            return entity("Cube", [createMeshRenderer({ mesh: "cube", material: { color } }), createCollider({ shape: "box" })]);
        case "sphere":
            return entity("Sphere", [createMeshRenderer({ mesh: "sphere", material: { color } }), createCollider({ shape: "sphere", radius: 0.5 })]);
        case "plane": {
            transform.scale = { x: 10, y: 1, z: 10 };
            return entity("Plane", [createMeshRenderer({ mesh: "plane", material: { color: "#64748b", roughness: 0.9 } }), createCollider({ shape: "box", size: { x: 1, y: 0.02, z: 1 } })], "Ground");
        }
        case "capsule":
            return entity("Capsule", [createMeshRenderer({ mesh: "capsule", material: { color } }), createCollider({ shape: "box", size: { x: 1, y: 2, z: 1 } })]);
        case "cylinder":
            return entity("Cylinder", [createMeshRenderer({ mesh: "cylinder", material: { color } }), createCollider({ shape: "box", size: { x: 1, y: 2, z: 1 } })]);
        case "cone":
            return entity("Cone", [createMeshRenderer({ mesh: "cone", material: { color } })]);
        case "torus":
            return entity("Torus", [createMeshRenderer({ mesh: "torus", material: { color } })]);
        case "camera": {
            if (dimension === "2d") transform.position = { x: position.x, y: position.y, z: -10 };
            return entity("Camera", [createCamera(dimension === "2d" ? { projection: "orthographic", primary: false } : { primary: false })], "MainCamera");
        }
        case "directionalLight":
            transform.rotation = { x: 50, y: -30, z: 0 };
            return entity("Directional Light", [createLight({ lightType: "directional", intensity: 1.4 })]);
        case "pointLight":
            return entity("Point Light", [createLight({ lightType: "point", intensity: 2, range: 10, color: "#fde68a", castShadows: false })]);
        case "spotLight":
            transform.rotation = { x: 90, y: 0, z: 0 };
            return entity("Spot Light", [createLight({ lightType: "spot", intensity: 3, range: 18, spotAngle: 35 })]);
        case "particles":
            transform.rotation = dimension === "2d" ? { x: -90, y: 0, z: 0 } : { x: -90, y: 0, z: 0 };
            return entity("Particle System", [createParticleSystem()]);
        case "text":
            return entity("UI Text", [createUIText({ text: "Skor: 0" })]);
        case "button":
            return entity("Button", [createUIButton({ text: "Oyna" })]);
        case "panel":
            return entity("Panel", [createUIPanel()]);
        case "progressBar":
            return entity("Progress Bar", [createUIProgressBar()]);
        case "tilemap":
            // A small strip of ground so the new tilemap is visible right away.
            return entity("Tilemap", [createTilemap({ origin: { x: -5, y: -4 }, rows: ["##########", "=========="] })], "Ground");
        case "audio":
            return entity("Audio Source", [createAudioSource()]);
    }
}

// ---------------------------------------------------------------------------
// Scenes & projects
// ---------------------------------------------------------------------------

export function createEmptyScene(name: string, dimension: GameDimension, templateId: string | null = null): SceneDocument {
    const timestamp = nowIso();
    return {
        version: GAME_ENGINE_SCHEMA_VERSION,
        id: createEngineId("scene"),
        name,
        dimension,
        objects: [],
        settings: defaultSceneSettings(dimension),
        metadata: { createdAt: timestamp, updatedAt: timestamp, templateId },
    };
}

/** New scene with a camera (and a light for 3D) — what "New Scene" creates. */
export function createDefaultScene(name: string, dimension: GameDimension): SceneDocument {
    const scene = createEmptyScene(name, dimension);
    if (dimension === "2d") {
        const camera = createEntityFromPreset("camera", "2d");
        camera.name = "Main Camera";
        (getComponent(camera, "camera") as ComponentOfType<"camera">).primary = true;
        scene.objects.push(camera);
    } else {
        const camera = createEntityFromPreset("camera", "3d", { x: 0, y: 4, z: -9 });
        camera.name = "Main Camera";
        getTransform(camera).rotation = { x: 18, y: 0, z: 0 };
        (getComponent(camera, "camera") as ComponentOfType<"camera">).primary = true;
        const light = createEntityFromPreset("directionalLight", "3d", { x: 0, y: 8, z: 0 });
        const ground = createEntityFromPreset("plane", "3d", { x: 0, y: 0, z: 0 });
        ground.name = "Ground";
        scene.objects.push(camera, light, ground);
    }
    return scene;
}

export function createBlankProject(name: string, dimension: GameDimension, id = createEngineId("game")): GameProjectDocument {
    const scene = createDefaultScene("Main Scene", dimension);
    const timestamp = nowIso();
    return {
        version: GAME_ENGINE_SCHEMA_VERSION,
        id,
        name,
        description: "",
        dimension,
        activeSceneId: scene.id,
        scenes: [scene],
        prefabs: [],
        textures: [],
        scripts: [],
        settings: {
            startSceneId: scene.id,
            aspect: "free",
            shadows: true,
            antialias: true,
            pixelArt: false,
            showFps: false,
            touchControls: true,
        },
        metadata: { createdAt: timestamp, updatedAt: timestamp },
    };
}

export function getActiveScene(project: GameProjectDocument): SceneDocument {
    return project.scenes.find((scene) => scene.id === project.activeSceneId) ?? project.scenes[0];
}

export function prefabFromEntities(entities: GameEntity[], name: string): PrefabAsset {
    const cloned = cloneEntitiesWithNewIds(entities, null);
    cloned[0].parentId = null;
    const rootTransform = getTransform(cloned[0]);
    rootTransform.position = { x: 0, y: 0, z: 0 };
    return { id: createEngineId("prefab"), name, entities: cloned };
}

export function findPrimaryCamera(entities: GameEntity[]): GameEntity | undefined {
    const { byId } = buildEntityIndex(entities);
    const cameras = entities.filter((entity) => {
        const camera = getComponent(entity, "camera");
        return camera?.enabled && isActiveInHierarchy(entity, byId);
    });
    return cameras.find((entity) => getComponent(entity, "camera")?.primary) ?? cameras[0];
}
