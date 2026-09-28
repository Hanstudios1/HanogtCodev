/** Builds render frames from scene documents (editor view, previews and thumbnails). */
import { buildEntityIndex, isActiveInHierarchy, worldTRS } from "../scene";
import type { GameDimension, SceneDocument } from "../types";
import type { RenderEntity, RenderFrame } from "./renderer";

export function sceneRenderEntities(scene: SceneDocument): RenderEntity[] {
    const { byId } = buildEntityIndex(scene.objects);
    return scene.objects.map((entity) => ({
        id: entity.id,
        name: entity.name,
        tag: entity.tag,
        visible: isActiveInHierarchy(entity, byId),
        world: worldTRS(entity, byId),
        components: entity.components,
        version: 0,
        emitter: null,
    }));
}

export function sceneFrame(scene: SceneDocument, dimension: GameDimension): RenderFrame {
    return { dimension, settings: scene.settings, entities: sceneRenderEntities(scene) };
}
