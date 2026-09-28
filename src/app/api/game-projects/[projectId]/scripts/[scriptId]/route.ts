import { NextRequest } from "next/server";
import { nowIso } from "@/lib/game-engine/ids";
import { commitServerMutations, getServerDocument, listServerCollection } from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    assertOnlyKeys,
    assertProjectId,
    assertRevision,
    assertScriptId,
    authorizeGameRequest,
    GameApiError,
    loadOwnedProject,
    normalizeScriptContent,
    normalizeScriptName,
    rateHeaders,
    readJsonBody,
    readScriptLanguage,
    serializeScript,
    type GameScriptRecord,
} from "../../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string; scriptId: string }> };

async function loadScript(context: RouteContext, email: string) {
    const params = await context.params;
    const projectId = assertProjectId(params.projectId);
    const scriptId = assertScriptId(params.scriptId);
    const project = await loadOwnedProject(projectId, email);
    const script = await getServerDocument<GameScriptRecord>(`game_projects/${projectId}/scripts/${scriptId}`);
    if (!script || script.ownerEmail !== email || script.projectId !== projectId) throw new GameApiError(404, "Oyun betiği bulunamadı.");
    return { projectId, scriptId, project, script };
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        const { scriptId, script } = await loadScript(context, email);
        return apiJson({ script: serializeScript(script, scriptId) }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun betiği yüklenemedi.", 503);
    }
}

async function update(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const body = await readJsonBody(request, 220 * 1024);
        assertOnlyKeys(body, ["name", "language", "content", "revision", "enabled", "attachedObjectIds"]);
        const { projectId, scriptId, script } = await loadScript(context, email);
        assertRevision(request, script, body.revision);
        const language = body.language === undefined ? (script.language === "cpp" ? "cpp" : "csharp") : readScriptLanguage(body.language);
        const data: Record<string, unknown> = { updatedAt: nowIso(), language };
        if (body.name !== undefined) {
            const name = normalizeScriptName(body.name, language);
            const siblings = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 200);
            if (siblings.some((item) => item._id !== scriptId && item.name?.toLowerCase() === name.toLowerCase())) throw new GameApiError(409, "Bu projede aynı adlı bir betik zaten var.");
            data.name = name;
        }
        if (body.content !== undefined) data.content = normalizeScriptContent(body.content);
        const result = await commitServerMutations([{ type: "update", path: `game_projects/${projectId}/scripts/${scriptId}`, data, updateFields: Object.keys(data), updateTime: script._updateTime }]);
        return apiJson({ success: true, script: serializeScript({ ...script, ...data, _updateTime: result.writeResults[0]?.updateTime }, scriptId) }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun betiği kaydedilemedi.");
    }
}

export const PATCH = update;
export const PUT = update;

export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const { projectId, scriptId, project } = await loadScript(context, email);
        await commitServerMutations([
            { type: "delete", path: `game_projects/${projectId}/scripts/${scriptId}` },
            { type: "update", path: `game_projects/${projectId}`, data: { scriptCount: Math.max(0, Number(project.scriptCount || 1) - 1), updatedAt: nowIso() }, updateFields: ["scriptCount", "updatedAt"] },
        ]);
        return apiJson({ success: true }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun betiği silinemedi.");
    }
}
