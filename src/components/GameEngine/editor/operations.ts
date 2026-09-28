/**
 * Pure document operations used by the editor. They receive immer drafts (or
 * plain objects) and mutate them in place.
 */
import { createComponentOfType, createScriptComponent } from "@/lib/game-engine/components";
import { createEngineId, nowIso } from "@/lib/game-engine/ids";
import {
    combineTRS,
    conjugateQuat,
    eulerDegFromQuat,
    mulQuat,
    normalizeQuat,
    worldToLocalPoint,
    type TRS,
} from "@/lib/game-engine/math";
import {
    buildEntityIndex,
    cloneEntitiesWithNewIds,
    collectSubtree,
    createDefaultScene,
    createEntityFromPreset,
    getDescendantIds,
    getTransform,
    localTRS,
    prefabFromEntities,
    uniqueName,
    worldTRS,
    type EntityPreset,
} from "@/lib/game-engine/scene";
import { cloneJson } from "@/lib/game-engine/schema";
import { newScriptSource } from "@/lib/game-engine/templates";
import {
    UNIQUE_COMPONENT_TYPES,
    type ComponentType,
    type GameComponent,
    type GameEntity,
    type GameProjectDocument,
    type SceneDocument,
    type ScriptLanguage,
    type TextureAsset,
    type Vector3,
} from "@/lib/game-engine/types";

export function activeScene(project: GameProjectDocument): SceneDocument {
    return project.scenes.find((scene) => scene.id === project.activeSceneId) ?? project.scenes[0];
}

function round(value: number, digits = 4) {
    const factor = 10 ** digits;
    const rounded = Math.round(value * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function roundVec(v: Vector3, digits = 4): Vector3 {
    return { x: round(v.x, digits), y: round(v.y, digits), z: round(v.z, digits) };
}

export function touch(project: GameProjectDocument) {
    project.metadata.updatedAt = nowIso();
    const scene = activeScene(project);
    scene.metadata.updatedAt = project.metadata.updatedAt;
}

/** Converts a world TRS into the local TRS under `parentId` and writes it to the entity transform. */
export function setWorldTransform(scene: SceneDocument, entityId: string, world: TRS, is2D: boolean) {
    const { byId } = buildEntityIndex(scene.objects);
    const entity = byId.get(entityId);
    if (!entity) return;
    const parent = entity.parentId ? byId.get(entity.parentId) : undefined;
    const parentWorld = parent ? worldTRS(parent, byId) : null;
    const position = parentWorld ? worldToLocalPoint(parentWorld, world.position) : world.position;
    const rotation = parentWorld ? normalizeQuat(mulQuat(conjugateQuat(parentWorld.rotation), world.rotation)) : world.rotation;
    const scale = parentWorld
        ? { x: parentWorld.scale.x ? world.scale.x / parentWorld.scale.x : world.scale.x, y: parentWorld.scale.y ? world.scale.y / parentWorld.scale.y : world.scale.y, z: parentWorld.scale.z ? world.scale.z / parentWorld.scale.z : world.scale.z }
        : world.scale;
    const transform = getTransform(entity);
    const euler = eulerDegFromQuat(rotation);
    transform.position = roundVec(is2D ? { ...position, z: round(position.z, 3) } : position);
    transform.rotation = roundVec(is2D ? { x: 0, y: 0, z: euler.z } : euler, 3);
    transform.scale = roundVec(scale);
}

export function addEntity(project: GameProjectDocument, preset: EntityPreset, position: Vector3, parentId: string | null = null): GameEntity {
    const scene = activeScene(project);
    const created = createEntityFromPreset(preset, project.dimension, position, scene.objects.length);
    created.name = uniqueName(created.name, scene.objects.map((entity) => entity.name));
    if (preset === "camera" && !scene.objects.some((entity) => entity.components.some((component) => component.type === "camera"))) {
        const camera = created.components.find((component) => component.type === "camera");
        if (camera?.type === "camera") camera.primary = true;
    }
    if (parentId && scene.objects.some((entity) => entity.id === parentId)) {
        created.parentId = parentId;
        const transform = getTransform(created);
        transform.position = { x: 0, y: 0, z: 0 };
    }
    scene.objects.push(created);
    touch(project);
    return created;
}

export function deleteEntities(project: GameProjectDocument, ids: string[]) {
    const scene = activeScene(project);
    const doomed = new Set<string>();
    for (const id of ids) {
        doomed.add(id);
        for (const child of getDescendantIds(scene.objects, id)) doomed.add(child);
    }
    scene.objects = scene.objects.filter((entity) => !doomed.has(entity.id));
    touch(project);
}

export function duplicateEntities(project: GameProjectDocument, ids: string[]): string[] {
    const scene = activeScene(project);
    const roots = ids.filter((id) => {
        const { byId } = buildEntityIndex(scene.objects);
        let cursor = byId.get(id)?.parentId ?? null;
        while (cursor) {
            if (ids.includes(cursor)) return false;
            cursor = byId.get(cursor)?.parentId ?? null;
        }
        return byId.has(id);
    });
    const created: string[] = [];
    for (const id of roots) {
        const source = scene.objects.find((entity) => entity.id === id);
        if (!source) continue;
        const subtree = collectSubtree(scene.objects, id);
        const clones = cloneEntitiesWithNewIds(cloneJson(subtree), source.parentId);
        clones[0].name = uniqueName(source.name, scene.objects.map((entity) => entity.name));
        const index = scene.objects.findIndex((entity) => entity.id === id);
        const lastIndex = Math.max(index, ...subtree.map((entity) => scene.objects.findIndex((candidate) => candidate.id === entity.id)));
        scene.objects.splice(lastIndex + 1, 0, ...clones);
        created.push(clones[0].id);
    }
    touch(project);
    return created;
}

/** Paste entities copied from the clipboard (JSON of a subtree list). */
export function pasteEntities(project: GameProjectDocument, groups: GameEntity[][]): string[] {
    const scene = activeScene(project);
    const created: string[] = [];
    for (const group of groups) {
        if (!group.length) continue;
        const clones = cloneEntitiesWithNewIds(cloneJson(group), null);
        clones[0].parentId = null;
        clones[0].name = uniqueName(clones[0].name, scene.objects.map((entity) => entity.name));
        scene.objects.push(...clones);
        created.push(clones[0].id);
    }
    touch(project);
    return created;
}

export function reparent(project: GameProjectDocument, id: string, newParentId: string | null, beforeId: string | null = null) {
    const scene = activeScene(project);
    const { byId } = buildEntityIndex(scene.objects);
    const entity = byId.get(id);
    if (!entity) return;
    if (newParentId && (newParentId === id || getDescendantIds(scene.objects, id).includes(newParentId))) return;
    if (entity.parentId !== newParentId) {
        const world = worldTRS(entity, byId);
        entity.parentId = newParentId;
        setWorldTransform(scene, id, world, project.dimension === "2d");
    }
    // Keep the subtree contiguous and place it before `beforeId` (or at the end of the siblings).
    const subtreeIds = new Set([id, ...getDescendantIds(scene.objects, id)]);
    const moving = scene.objects.filter((candidate) => subtreeIds.has(candidate.id));
    const rest = scene.objects.filter((candidate) => !subtreeIds.has(candidate.id));
    let insertAt = rest.length;
    if (beforeId) {
        const index = rest.findIndex((candidate) => candidate.id === beforeId);
        if (index >= 0) insertAt = index;
    } else if (newParentId) {
        const parentSubtree = new Set([newParentId, ...getDescendantIds(rest, newParentId)]);
        let last = -1;
        rest.forEach((candidate, index) => {
            if (parentSubtree.has(candidate.id)) last = index;
        });
        insertAt = last + 1;
    }
    scene.objects = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
    touch(project);
}

export function findEntity(project: GameProjectDocument, id: string): GameEntity | undefined {
    return activeScene(project).objects.find((entity) => entity.id === id);
}

export function updateComponent<T extends GameComponent>(project: GameProjectDocument, entityId: string, componentId: string, recipe: (component: T) => void) {
    const entity = findEntity(project, entityId);
    const component = entity?.components.find((candidate) => candidate.id === componentId) as T | undefined;
    if (!component) return;
    recipe(component);
    touch(project);
}

export function addComponent(project: GameProjectDocument, entityId: string, type: Exclude<ComponentType, "script" | "transform">): GameComponent | null {
    const entity = findEntity(project, entityId);
    if (!entity) return null;
    if (UNIQUE_COMPONENT_TYPES.has(type) && entity.components.some((component) => component.type === type)) return null;
    const component = createComponentOfType(type, project.dimension);
    if (component.type === "collider") {
        // Fit the collider to the renderer shape.
        const sprite = entity.components.find((candidate) => candidate.type === "spriteRenderer");
        const mesh = entity.components.find((candidate) => candidate.type === "meshRenderer");
        if (sprite?.type === "spriteRenderer" && sprite.shape === "circle") {
            component.shape = "circle";
            component.radius = 0.5;
        } else if (mesh?.type === "meshRenderer") {
            if (mesh.mesh === "sphere") {
                component.shape = "sphere";
                component.radius = 0.5;
            } else if (mesh.mesh === "capsule" || mesh.mesh === "cylinder") {
                component.size = { x: 1, y: 2, z: 1 };
            } else if (mesh.mesh === "plane") {
                component.size = { x: 1, y: 0.02, z: 1 };
            }
        }
    }
    if (component.type === "camera") {
        const scene = activeScene(project);
        component.primary = !scene.objects.some((candidate) => candidate.components.some((item) => item.type === "camera" && item.primary));
    }
    entity.components.push(component);
    touch(project);
    return component;
}

export function addScriptComponent(project: GameProjectDocument, entityId: string, scriptId: string, className: string | null) {
    const entity = findEntity(project, entityId);
    if (!entity) return null;
    const component = createScriptComponent(scriptId, className);
    entity.components.push(component);
    touch(project);
    return component;
}

export function removeComponent(project: GameProjectDocument, entityId: string, componentId: string) {
    const entity = findEntity(project, entityId);
    if (!entity) return;
    entity.components = entity.components.filter((component) => component.id !== componentId || component.type === "transform");
    touch(project);
}

export function moveComponent(project: GameProjectDocument, entityId: string, componentId: string, direction: -1 | 1) {
    const entity = findEntity(project, entityId);
    if (!entity) return;
    const index = entity.components.findIndex((component) => component.id === componentId);
    const target = index + direction;
    if (index <= 0 || target <= 0 || target >= entity.components.length) return;
    const [component] = entity.components.splice(index, 1);
    entity.components.splice(target, 0, component);
    touch(project);
}

// ---------------------------------------------------------------------------
// Prefabs
// ---------------------------------------------------------------------------

export function createPrefabFromEntity(project: GameProjectDocument, entityId: string): string | null {
    const scene = activeScene(project);
    const subtree = collectSubtree(scene.objects, entityId);
    if (!subtree.length) return null;
    const prefab = prefabFromEntities(cloneJson(subtree), uniqueName(subtree[0].name, project.prefabs.map((item) => item.name)));
    project.prefabs.push(prefab);
    touch(project);
    return prefab.id;
}

export function instantiatePrefab(project: GameProjectDocument, prefabId: string, position: Vector3): string | null {
    const prefab = project.prefabs.find((item) => item.id === prefabId);
    if (!prefab || !prefab.entities.length) return null;
    const scene = activeScene(project);
    const clones = cloneEntitiesWithNewIds(cloneJson(prefab.entities), null);
    clones[0].parentId = null;
    clones[0].name = uniqueName(prefab.name, scene.objects.map((entity) => entity.name));
    getTransform(clones[0]).position = { ...position };
    scene.objects.push(...clones);
    touch(project);
    return clones[0].id;
}

/** Overwrites a prefab with the current state of a scene instance. */
export function applyPrefab(project: GameProjectDocument, prefabId: string, entityId: string) {
    const prefab = project.prefabs.find((item) => item.id === prefabId);
    const scene = activeScene(project);
    const subtree = collectSubtree(scene.objects, entityId);
    if (!prefab || !subtree.length) return;
    const updated = prefabFromEntities(cloneJson(subtree), prefab.name);
    prefab.entities = updated.entities;
    touch(project);
}

export function deletePrefab(project: GameProjectDocument, prefabId: string) {
    project.prefabs = project.prefabs.filter((item) => item.id !== prefabId);
    const clear = (entities: GameEntity[]) => {
        for (const entity of entities) {
            for (const component of entity.components) {
                if (component.type !== "script") continue;
                for (const [key, value] of Object.entries(component.fields)) {
                    if (value && typeof value === "object" && "ref" in value && value.ref === "prefab" && value.id === prefabId) component.fields[key] = { ref: "prefab", id: null };
                }
            }
        }
    };
    for (const scene of project.scenes) clear(scene.objects);
    for (const prefab of project.prefabs) clear(prefab.entities);
    touch(project);
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

export function scriptClassName(name: string) {
    return name.replace(/\.(cs|cpp|cc|cxx|h|hpp)$/i, "").replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]+/, "") || "NewBehaviour";
}

export function createScript(project: GameProjectDocument, baseName: string, language: ScriptLanguage): string {
    const extension = language === "cpp" ? ".cpp" : ".cs";
    const className = scriptClassName(baseName);
    const existing = new Set(project.scripts.map((script) => script.name.toLowerCase()));
    let name = `${className}${extension}`;
    let counter = 1;
    while (existing.has(name.toLowerCase())) {
        name = `${className}${counter}${extension}`;
        counter += 1;
    }
    const id = createEngineId("script");
    project.scripts.push({ id, name, language, content: newScriptSource(scriptClassName(name), language) });
    touch(project);
    return id;
}

export function deleteScript(project: GameProjectDocument, scriptId: string) {
    project.scripts = project.scripts.filter((script) => script.id !== scriptId);
    const strip = (entities: GameEntity[]) => {
        for (const entity of entities) entity.components = entity.components.filter((component) => component.type !== "script" || component.scriptId !== scriptId);
    };
    for (const scene of project.scenes) strip(scene.objects);
    for (const prefab of project.prefabs) strip(prefab.entities);
    touch(project);
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

export function deleteTexture(project: GameProjectDocument, textureId: string) {
    project.textures = project.textures.filter((texture) => texture.id !== textureId);
    const clear = (entities: GameEntity[]) => {
        for (const entity of entities) {
            for (const component of entity.components) {
                if (component.type === "spriteRenderer" && component.textureId === textureId) component.textureId = null;
                if (component.type === "meshRenderer" && component.material.textureId === textureId) component.material.textureId = null;
            }
        }
    };
    for (const scene of project.scenes) clear(scene.objects);
    for (const prefab of project.prefabs) clear(prefab.entities);
    touch(project);
}

/** Decodes, downsizes (max 512 px) and re-encodes an image so it fits the project limits. */
export async function textureFromFile(file: File, maxDataUrlLength = 340_000): Promise<TextureAsset> {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Yalnızca PNG, JPG, WEBP veya GIF görselleri yüklenebilir.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Görsel 8 MB'den büyük olamaz.");
    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("Görsel okunamadı."));
            element.src = url;
        });
        const pixelArt = image.naturalWidth <= 128 && image.naturalHeight <= 128;
        let max = 512;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
            const width = Math.max(1, Math.round(image.naturalWidth * scale));
            const height = Math.max(1, Math.round(image.naturalHeight * scale));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d") as CanvasRenderingContext2D;
            context.imageSmoothingEnabled = !pixelArt;
            context.drawImage(image, 0, 0, width, height);
            let dataUrl = canvas.toDataURL("image/png");
            if (dataUrl.length > maxDataUrlLength) dataUrl = canvas.toDataURL("image/webp", 0.86);
            if (dataUrl.length <= maxDataUrlLength) {
                return {
                    id: createEngineId("texture"),
                    name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Texture",
                    dataUrl,
                    width,
                    height,
                    filter: pixelArt ? "nearest" : "linear",
                };
            }
            max = Math.round(max * 0.72);
        }
        throw new Error("Görsel çok büyük; daha küçük bir görsel deneyin.");
    } finally {
        URL.revokeObjectURL(url);
    }
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

export function addScene(project: GameProjectDocument, name: string): string {
    const scene = createDefaultScene(uniqueName(name || "New Scene", project.scenes.map((item) => item.name)), project.dimension);
    project.scenes.push(scene);
    project.activeSceneId = scene.id;
    touch(project);
    return scene.id;
}

export function duplicateScene(project: GameProjectDocument, sceneId: string): string | null {
    const source = project.scenes.find((scene) => scene.id === sceneId);
    if (!source) return null;
    const copy = cloneJson(source);
    copy.id = createEngineId("scene");
    copy.name = uniqueName(source.name, project.scenes.map((item) => item.name));
    // Internal parent links and entity references are remapped to the new ids.
    copy.objects = cloneEntitiesWithNewIds(copy.objects, null);
    project.scenes.push(copy);
    touch(project);
    return copy.id;
}

export function deleteScene(project: GameProjectDocument, sceneId: string) {
    if (project.scenes.length <= 1) return;
    project.scenes = project.scenes.filter((scene) => scene.id !== sceneId);
    if (project.activeSceneId === sceneId) project.activeSceneId = project.scenes[0].id;
    if (project.settings.startSceneId === sceneId) project.settings.startSceneId = project.scenes[0].id;
    touch(project);
}

export function moveScene(project: GameProjectDocument, sceneId: string, direction: -1 | 1) {
    const index = project.scenes.findIndex((scene) => scene.id === sceneId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= project.scenes.length) return;
    const [scene] = project.scenes.splice(index, 1);
    project.scenes.splice(target, 0, scene);
    touch(project);
}

/** Local transform of an entity as TRS (for the inspector's world/local display). */
export function entityLocalTRS(entity: GameEntity): TRS {
    return localTRS(entity);
}

export function entityWorldTRS(scene: SceneDocument, entity: GameEntity): TRS {
    const { byId } = buildEntityIndex(scene.objects);
    return worldTRS(entity, byId);
}

export { combineTRS };
