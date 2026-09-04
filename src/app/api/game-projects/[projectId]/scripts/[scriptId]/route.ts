import { NextRequest } from "next/server";
import {
    commitServerMutations,
    commitServerPatches,
    getServerDocument,
    listServerCollection,
} from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    assertOnlyKeys,
    assertProjectId,
    assertRevision,
    assertScriptId,
    authorizeGameRequest,
    defaultScene,
    GameApiError,
    GameScriptRecord,
    loadOwnedProject,
    normalizeAttachedObjectIds,
    normalizeScene,
    normalizeScriptContent,
    normalizeScriptName,
    rateHeaders,
    readJsonBody,
    readScriptLanguage,
    serializeScript,
} from "../../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string; scriptId: string }> };

async function loadRouteRecords(context: RouteContext, email: string) {
    const params = await context.params;
    const projectId = assertProjectId(params.projectId);
    const scriptId = assertScriptId(params.scriptId);
    const project = await loadOwnedProject(projectId, email);
    const script = await getServerDocument<GameScriptRecord>(`game_projects/${projectId}/scripts/${scriptId}`);
    if (!script || script.projectId !== projectId || script.ownerEmail !== email) {
        throw new GameApiError(404, "Oyun betiği bulunamadı veya erişiminiz yok.");
    }
    return { projectId, scriptId, project, script };
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        const { scriptId, script } = await loadRouteRecords(context, email);
        return apiJson({ script: serializeScript(script, scriptId) }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun betiği şu anda yüklenemiyor.", 503);
    }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const { projectId, scriptId, project, script } = await loadRouteRecords(context, email);
        const body = await readJsonBody(request, 220 * 1024);
        assertOnlyKeys(body, ["name", "language", "content", "enabled", "attachedObjectIds", "revision"]);
        assertRevision(request, script, body.revision);

        const language = body.language === undefined
            ? (script.language === "cpp" ? "cpp" : "csharp")
            : readScriptLanguage(body.language);
        let nameInput: unknown = body.name === undefined ? script.name || "Script" : body.name;
        if (body.language !== undefined && body.name === undefined && typeof nameInput === "string") {
            nameInput = nameInput.replace(/\.(cs|cpp|cc|cxx|h|hpp)$/i, "");
        }
        const name = normalizeScriptName(nameInput, language);
        if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
            throw new GameApiError(400, "Betik etkinliği doğru/yanlış değeri olmalıdır.");
        }
        const dimension = project.dimension === "2d" ? "2d" : "3d";
        const scene = normalizeScene(project.scene || defaultScene(dimension), dimension);
        const attachedObjectIds = body.attachedObjectIds === undefined
            ? (Array.isArray(script.attachedObjectIds) ? script.attachedObjectIds : [])
            : normalizeAttachedObjectIds(body.attachedObjectIds, scene);
        const content = body.content === undefined
            ? String(script.content || "")
            : normalizeScriptContent(body.content, language, name);

        const scripts = (body.name !== undefined || body.language !== undefined)
            ? await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 100)
            : [];
        if (scripts.some((candidate) => candidate._id !== scriptId && String(candidate.name || "").toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) {
            throw new GameApiError(409, "Bu ada sahip bir betik zaten var.");
        }

        const now = new Date().toISOString();
        const scriptUpdate: Record<string, unknown> = {
            name,
            language,
            content,
            enabled: body.enabled === undefined ? script.enabled !== false : body.enabled,
            attachedObjectIds,
            compilerTarget: language === "cpp" ? "c++20" : "dotnet-8",
            sourceKind: "plain-text",
            executionPolicy: "external-toolchain-required",
            updatedAt: now,
        };
        const projectUpdate: Record<string, unknown> = { updatedAt: now };

        await commitServerPatches([
            {
                path: `game_projects/${projectId}/scripts/${scriptId}`,
                data: scriptUpdate,
                updateFields: Object.keys(scriptUpdate),
                updateTime: script._updateTime,
            },
            {
                path: `game_projects/${projectId}`,
                data: projectUpdate,
                updateFields: Object.keys(projectUpdate),
                updateTime: project._updateTime,
            },
        ]);
        const updated = await getServerDocument<GameScriptRecord>(`game_projects/${projectId}/scripts/${scriptId}`);
        if (!updated) throw new GameApiError(409, "Betik güncellemeden sonra bulunamadı.");
        return apiJson({ success: true, script: serializeScript(updated, scriptId) }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun betiği güncellenemedi.");
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const { projectId, scriptId, project, script } = await loadRouteRecords(context, email);
        assertRevision(request, script);
        const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 100);
        const now = new Date().toISOString();
        await commitServerMutations([
            {
                type: "delete",
                path: `game_projects/${projectId}/scripts/${scriptId}`,
                updateTime: script._updateTime,
            },
            {
                type: "update",
                path: `game_projects/${projectId}`,
                data: {
                    scriptCount: Math.max(0, scripts.length - 1),
                    updatedAt: now,
                },
                updateFields: ["scriptCount", "updatedAt"],
                updateTime: project._updateTime,
            },
        ]);
        return apiJson({ success: true }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun betiği silinemedi.");
    }
}
