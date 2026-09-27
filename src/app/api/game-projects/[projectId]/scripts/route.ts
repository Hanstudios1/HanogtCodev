import { NextRequest } from "next/server";
import { createEngineId, nowIso } from "@/lib/game-engine/ids";
import { commitServerMutations, listServerCollection } from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    assertOnlyKeys,
    assertProjectId,
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
} from "../../_shared";

export const runtime = "nodejs";

const MAX_SCRIPTS_PER_PROJECT = 64;

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        const projectId = assertProjectId((await context.params).projectId);
        await loadOwnedProject(projectId, email);
        const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 200);
        return apiJson({
            scripts: scripts
                .filter((script) => script.ownerEmail === email && script.projectId === projectId)
                .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
                .map((script) => serializeScript(script, script._id)),
        }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun betikleri şu anda yüklenemiyor.", 503);
    }
}

/** Creates a script (used by the code editor's "save to game project"). */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const projectId = assertProjectId((await context.params).projectId);
        const body = await readJsonBody(request, 220 * 1024);
        assertOnlyKeys(body, ["name", "language", "content", "enabled", "attachedObjectIds"]);
        const project = await loadOwnedProject(projectId, email);
        const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 200);
        if (scripts.length >= MAX_SCRIPTS_PER_PROJECT) throw new GameApiError(409, `Bir oyun projesinde en fazla ${MAX_SCRIPTS_PER_PROJECT} betik bulunabilir.`);
        const language = readScriptLanguage(body.language);
        const name = normalizeScriptName(body.name, language);
        if (scripts.some((script) => script.name?.toLowerCase() === name.toLowerCase())) throw new GameApiError(409, "Bu projede aynı adlı bir betik zaten var.");
        const content = normalizeScriptContent(body.content);
        const scriptId = createEngineId("script").replace(/[^A-Za-z0-9_-]/g, "_");
        const now = nowIso();
        const record = { projectId, ownerEmail: email, name, language, content, order: scripts.length, createdAt: now, updatedAt: now };
        const result = await commitServerMutations([
            { type: "create", path: `game_projects/${projectId}/scripts/${scriptId}`, data: record },
            { type: "update", path: `game_projects/${projectId}`, data: { scriptCount: scripts.length + 1, updatedAt: now }, updateFields: ["scriptCount", "updatedAt"], updateTime: project._updateTime },
        ]);
        return apiJson({ success: true, script: serializeScript({ ...record, _updateTime: result.writeResults[0]?.updateTime }, scriptId) }, 201, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun betiği oluşturulamadı.");
    }
}
