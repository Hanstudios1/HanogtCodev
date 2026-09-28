import { NextRequest } from "next/server";
import { createEngineId, nowIso } from "@/lib/game-engine/ids";
import { createProjectFromTemplate } from "@/lib/game-engine/templates";
import { commitServerMutations, runServerQuery } from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    assertOnlyKeys,
    authorizeGameRequest,
    GameApiError,
    MAX_PROJECTS_PER_USER,
    projectDocumentFields,
    rateHeaders,
    readDimension,
    readJsonBody,
    readText,
    readThumbnail,
    scriptRecord,
    summarizeRecord,
    SUMMARY_FIELDS,
    validateProject,
    type GameProjectRecord,
} from "./_shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        const [projects, published] = await Promise.all([
            runServerQuery<GameProjectRecord>({
                collectionId: "game_projects",
                where: [{ field: "ownerEmail", op: "EQUAL", value: email }],
                select: SUMMARY_FIELDS,
                limit: 100,
            }),
            runServerQuery<{ ownerEmail?: string }>({
                collectionId: "arcade_games",
                where: [{ field: "ownerEmail", op: "EQUAL", value: email }],
                select: ["ownerEmail"],
                limit: 100,
            }).catch(() => []),
        ]);
        const arcadeIds = new Set(published.map((item) => item._id));
        return apiJson({
            projects: projects
                .map((project) => summarizeRecord(project, project._id, arcadeIds))
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projeleri şu anda yüklenemiyor.", 503);
    }
}

export async function POST(request: NextRequest) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const body = await readJsonBody(request);
        assertOnlyKeys(body, ["project", "thumbnail", "name", "description", "dimension", "templateId"]);

        const existing = await runServerQuery<GameProjectRecord>({
            collectionId: "game_projects",
            where: [{ field: "ownerEmail", op: "EQUAL", value: email }],
            select: ["ownerEmail"],
            limit: MAX_PROJECTS_PER_USER + 1,
        });
        if (existing.length >= MAX_PROJECTS_PER_USER) {
            throw new GameApiError(409, `Bir hesap en fazla ${MAX_PROJECTS_PER_USER} oyun projesi oluşturabilir. Eski projeleri silerek yer açın.`);
        }

        const projectId = createEngineId("game").replace(/[^A-Za-z0-9_-]/g, "_");
        let source: unknown = body.project;
        if (source === undefined) {
            // Legacy dashboard form: name + description + dimension.
            const name = readText(body.name, "Proje adı", 80, { required: true, min: 2 })!;
            const dimension = readDimension(body.dimension, "3d");
            const templateId = typeof body.templateId === "string" ? body.templateId : dimension === "2d" ? "empty-2d" : "empty-3d";
            const template = createProjectFromTemplate(templateId as Parameters<typeof createProjectFromTemplate>[0], name);
            template.description = readText(body.description, "Proje açıklaması", 500) || "";
            source = template;
        }
        const project = validateProject(source, projectId);
        if (project.name.length < 1) project.name = "Yeni Oyun";
        const thumbnail = readThumbnail(body.thumbnail) ?? null;
        const now = nowIso();
        project.metadata = { createdAt: now, updatedAt: now };

        const result = await commitServerMutations([
            {
                type: "create",
                path: `game_projects/${projectId}`,
                data: { ownerEmail: email, ...projectDocumentFields(project), thumbnail, createdAt: now, updatedAt: now },
            },
            ...project.scripts.map((script, order) => ({
                type: "create" as const,
                path: `game_projects/${projectId}/scripts/${script.id}`,
                data: scriptRecord(script, projectId, email, order, now),
            })),
        ]);
        const revision = result.writeResults[0]?.updateTime ?? null;
        return apiJson({
            success: true,
            revision,
            project: summarizeRecord({ ...projectDocumentFields(project), thumbnail, createdAt: now, updatedAt: now }, projectId, new Set()),
        }, 201, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projesi oluşturulamadı.");
    }
}
