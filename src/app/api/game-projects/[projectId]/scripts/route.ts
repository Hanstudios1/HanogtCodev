import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
    commitServerPatches,
    listServerCollection,
} from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    assertOnlyKeys,
    assertProjectId,
    authorizeGameRequest,
    defaultScene,
    GameApiError,
    GameScriptRecord,
    loadOwnedProject,
    MAX_SCRIPTS_PER_PROJECT,
    normalizeAttachedObjectIds,
    normalizeScene,
    normalizeScriptContent,
    normalizeScriptName,
    rateHeaders,
    readJsonBody,
    readScriptLanguage,
    serializeScript,
} from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        const { projectId: rawProjectId } = await context.params;
        const projectId = assertProjectId(rawProjectId);
        await loadOwnedProject(projectId, email);
        const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 100);
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

export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const { projectId: rawProjectId } = await context.params;
        const projectId = assertProjectId(rawProjectId);
        const body = await readJsonBody(request, 220 * 1024);
        assertOnlyKeys(body, ["name", "language", "content", "enabled", "attachedObjectIds"]);
        const project = await loadOwnedProject(projectId, email);
        const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 100);
        if (scripts.length >= MAX_SCRIPTS_PER_PROJECT) {
            throw new GameApiError(409, `Bir oyun projesinde en fazla ${MAX_SCRIPTS_PER_PROJECT} betik bulunabilir.`);
        }

        const language = readScriptLanguage(body.language);
        const name = normalizeScriptName(body.name, language);
        if (scripts.some((script) => String(script.name || "").toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) {
            throw new GameApiError(409, "Bu ada sahip bir betik zaten var.");
        }
        if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
            throw new GameApiError(400, "Betik etkinliği doğru/yanlış değeri olmalıdır.");
        }
        const dimension = project.dimension === "2d" ? "2d" : "3d";
        const scene = normalizeScene(project.scene || defaultScene(dimension), dimension);
        const attachedObjectIds = normalizeAttachedObjectIds(body.attachedObjectIds, scene);
        const content = normalizeScriptContent(body.content, language, name);
        const scriptId = randomUUID();
        const now = new Date().toISOString();
        const scriptData = {
            projectId,
            ownerEmail: email,
            name,
            language,
            content,
            enabled: body.enabled !== false,
            attachedObjectIds,
            compilerTarget: language === "cpp" ? "c++20" : "dotnet-8",
            sourceKind: "plain-text",
            executionPolicy: "external-toolchain-required",
            order: scripts.length,
            createdAt: now,
            updatedAt: now,
        };

        await commitServerPatches([
            {
                path: `game_projects/${projectId}/scripts/${scriptId}`,
                data: scriptData,
                exists: false,
            },
            {
                path: `game_projects/${projectId}`,
                data: {
                    scriptCount: scripts.length + 1,
                    updatedAt: now,
                },
                updateFields: ["scriptCount", "updatedAt"],
                updateTime: project._updateTime,
            },
        ]);
        return apiJson({ success: true, script: serializeScript(scriptData, scriptId) }, 201, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun betiği oluşturulamadı.");
    }
}
