import { NextRequest } from "next/server";
import {
    commitServerMutations,
    getServerDocument,
    listServerCollection,
    patchServerDocument,
} from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    assertOnlyKeys,
    assertProjectId,
    assertRevision,
    authorizeGameRequest,
    GameApiError,
    GameProjectRecord,
    GameScriptRecord,
    loadOwnedProject,
    normalizeScene,
    rateHeaders,
    readDimension,
    readJsonBody,
    readText,
    serializeProject,
    serializeScript,
} from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

async function routeProjectId(context: RouteContext) {
    const { projectId } = await context.params;
    return assertProjectId(projectId);
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        const projectId = await routeProjectId(context);
        const project = await loadOwnedProject(projectId, email);
        const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 100);
        return apiJson({
            project: serializeProject(project, projectId, true),
            scripts: scripts
                .filter((script) => script.ownerEmail === email && script.projectId === projectId)
                .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
                .map((script) => serializeScript(script, script._id)),
        }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projesi şu anda yüklenemiyor.", 503);
    }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const projectId = await routeProjectId(context);
        const body = await readJsonBody(request);
        assertOnlyKeys(body, [
            "name",
            "description",
            "dimension",
            "scene",
            "scenes",
            "activeSceneId",
            "version",
            "schemaVersion",
            "supportedScriptLanguages",
            "metadata",
            "revision",
        ]);
        const project = await loadOwnedProject(projectId, email);
        assertRevision(request, project, body.revision);

        if ((body.version !== undefined && body.version !== 1) || (body.schemaVersion !== undefined && body.schemaVersion !== 1)) {
            throw new GameApiError(400, "Desteklenmeyen proje şema sürümü.");
        }
        if (body.supportedScriptLanguages !== undefined) {
            if (!Array.isArray(body.supportedScriptLanguages)
                || body.supportedScriptLanguages.length !== 2
                || !body.supportedScriptLanguages.includes("csharp")
                || !body.supportedScriptLanguages.includes("cpp")) {
                throw new GameApiError(400, "Oyun projesi yalnızca C# ve C++ betik dillerini destekler.");
            }
        }
        if (body.metadata !== undefined && (!body.metadata || typeof body.metadata !== "object" || Array.isArray(body.metadata))) {
            throw new GameApiError(400, "Proje meta verisi geçersiz.");
        }

        const update: Record<string, unknown> = {};
        const dimension = readDimension(body.dimension, project.dimension === "2d" ? "2d" : "3d");
        if (body.name !== undefined) update.name = readText(body.name, "Proje adı", 80, { required: true, min: 2 });
        if (body.description !== undefined) update.description = readText(body.description, "Proje açıklaması", 500) || "";
        if (body.dimension !== undefined) update.dimension = dimension;

        let sceneInput = body.scene;
        if (sceneInput === undefined && body.scenes !== undefined) {
            if (!Array.isArray(body.scenes) || body.scenes.length !== 1) {
                throw new GameApiError(400, "Oyun motorunun bu sürümü tam olarak bir aktif sahneyi kalıcılaştırır.");
            }
            const activeSceneId = typeof body.activeSceneId === "string" ? body.activeSceneId : "";
            sceneInput = body.scenes.find((candidate) => (
                candidate && typeof candidate === "object" && "id" in candidate && candidate.id === activeSceneId
            )) || body.scenes[0];
        }
        if (sceneInput !== undefined) {
            const scene = normalizeScene(sceneInput, dimension);
            const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 100);
            const objectIds = new Set(scene.objects.map((object) => object.id));
            if (scripts.some((script) => (script.attachedObjectIds || []).some((objectId) => !objectIds.has(objectId)))) {
                throw new GameApiError(409, "Silinen nesnelere bağlı betikler var. Önce betik bağlantılarını kaldırın.");
            }
            update.scene = scene;
        } else if (body.dimension !== undefined && project.scene) {
            update.scene = normalizeScene({ ...project.scene, dimension }, dimension);
        }

        if (!Object.keys(update).length) throw new GameApiError(400, "Güncellenecek proje alanı gönderilmedi.");
        update.updatedAt = new Date().toISOString();
        await patchServerDocument(`game_projects/${projectId}`, update, {
            updateFields: Object.keys(update),
            updateTime: project._updateTime,
        });
        const updated = await getServerDocument<GameProjectRecord>(`game_projects/${projectId}`);
        if (!updated) throw new GameApiError(409, "Proje güncellemeden sonra bulunamadı.");
        return apiJson({ success: true, project: serializeProject(updated, projectId, true) }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projesi güncellenemedi.");
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const projectId = await routeProjectId(context);
        const project = await loadOwnedProject(projectId, email);
        assertRevision(request, project);
        const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 500);

        if (scripts.length <= 400) {
            await commitServerMutations([
                ...scripts.map((script) => ({
                    type: "delete" as const,
                    path: script._path,
                    updateTime: script._updateTime,
                })),
                { type: "delete", path: `game_projects/${projectId}`, updateTime: project._updateTime },
            ]);
        } else {
            for (let index = 0; index < scripts.length; index += 400) {
                await commitServerMutations(scripts.slice(index, index + 400).map((script) => ({
                    type: "delete" as const,
                    path: script._path,
                    updateTime: script._updateTime,
                })));
            }
            await commitServerMutations([{ type: "delete", path: `game_projects/${projectId}`, updateTime: project._updateTime }]);
        }
        return apiJson({ success: true }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projesi silinemedi.");
    }
}
