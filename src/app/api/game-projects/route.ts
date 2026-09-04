import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
    commitServerPatches,
    listServerCollection,
    queryServerCollection,
} from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    assertOnlyKeys,
    assertProjectId,
    authorizeGameRequest,
    defaultScene,
    defaultScriptContent,
    GameProjectRecord,
    GameScriptRecord,
    loadOwnedProject,
    MAX_PROJECTS_PER_USER,
    normalizeScene,
    normalizeScriptName,
    rateHeaders,
    readDimension,
    readJsonBody,
    readScriptLanguage,
    readText,
    serializeProject,
    serializeScript,
} from "./_shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        const requestedId = request.nextUrl.searchParams.get("id");
        if (requestedId) {
            const id = assertProjectId(requestedId);
            const project = await loadOwnedProject(id, email);
            const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${id}/scripts`, 100);
            return apiJson({
                project: serializeProject(project, id, true),
                scripts: scripts
                    .filter((script) => script.ownerEmail === email && script.projectId === id)
                    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
                    .map((script) => serializeScript(script, script._id)),
            }, 200, rateHeaders(rate));
        }

        const projects = await queryServerCollection<GameProjectRecord>(
            "game_projects",
            "ownerEmail",
            "EQUAL",
            email,
            { limit: 100 },
        );
        return apiJson({
            projects: projects
                .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
                .map((project) => serializeProject(project, project._id, false)),
        }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projeleri şu anda yüklenemiyor.", 503);
    }
}

export async function POST(request: NextRequest) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const body = await readJsonBody(request);
        assertOnlyKeys(body, ["name", "description", "dimension", "scene", "starterLanguage"]);

        const currentProjects = await queryServerCollection<GameProjectRecord>(
            "game_projects",
            "ownerEmail",
            "EQUAL",
            email,
            { limit: MAX_PROJECTS_PER_USER + 1 },
        );
        if (currentProjects.length >= MAX_PROJECTS_PER_USER) {
            return apiJson({ error: `Bir hesap en fazla ${MAX_PROJECTS_PER_USER} oyun projesi oluşturabilir.` }, 409, rateHeaders(rate));
        }

        const name = readText(body.name, "Proje adı", 80, { required: true, min: 2 })!;
        const description = readText(body.description, "Proje açıklaması", 500) || "";
        const dimension = readDimension(body.dimension);
        const scene = body.scene === undefined ? defaultScene(dimension) : normalizeScene(body.scene, dimension);
        const starterLanguage = body.starterLanguage === undefined ? undefined : readScriptLanguage(body.starterLanguage);
        const projectId = randomUUID();
        const scriptId = starterLanguage ? randomUUID() : null;
        const now = new Date().toISOString();
        const starterName = starterLanguage ? normalizeScriptName("GameController", starterLanguage) : "";

        await commitServerPatches([
            {
                path: `game_projects/${projectId}`,
                data: {
                    ownerEmail: email,
                    name,
                    description,
                    dimension,
                    scene,
                    scriptCount: starterLanguage ? 1 : 0,
                    schemaVersion: 1,
                    createdAt: now,
                    updatedAt: now,
                },
                exists: false,
            },
            ...(starterLanguage && scriptId ? [{
                path: `game_projects/${projectId}/scripts/${scriptId}`,
                data: {
                    projectId,
                    ownerEmail: email,
                    name: starterName,
                    language: starterLanguage,
                    content: defaultScriptContent(starterLanguage, starterName),
                    enabled: true,
                    attachedObjectIds: [],
                    compilerTarget: starterLanguage === "cpp" ? "c++20" : "dotnet-8",
                    sourceKind: "plain-text",
                    executionPolicy: "external-toolchain-required",
                    order: 0,
                    createdAt: now,
                    updatedAt: now,
                },
                exists: false,
            }] : []),
        ]);

        const project: GameProjectRecord = {
            name,
            description,
            dimension,
            scene,
            scriptCount: starterLanguage ? 1 : 0,
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
        };
        const script: GameScriptRecord | null = starterLanguage && scriptId ? {
            name: starterName,
            language: starterLanguage,
            content: defaultScriptContent(starterLanguage, starterName),
            enabled: true,
            attachedObjectIds: [],
            compilerTarget: starterLanguage === "cpp" ? "c++20" : "dotnet-8",
            order: 0,
            createdAt: now,
            updatedAt: now,
        } : null;

        return apiJson({
            success: true,
            project: serializeProject(project, projectId, true),
            script: script && scriptId ? serializeScript(script, scriptId) : null,
        }, 201, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projesi oluşturulamadı.");
    }
}
