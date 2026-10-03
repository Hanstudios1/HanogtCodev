import { NextRequest, after } from "next/server";
import { createEngineId, nowIso } from "@/lib/game-engine/ids";
import { createProjectFromTemplate } from "@/lib/game-engine/templates";
import { commitServerMutations, runServerQuery } from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    assertOnlyKeys,
    authorizeGameRequest,
    gameLimitError,
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
import { planQuota } from "@/lib/server/entitlements";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        const [projects, published] = await Promise.all([
            runServerQuery<GameProjectRecord>({
                collectionId: "game_projects",
                where: [{ field: "ownerEmail", op: "EQUAL", value: email }],
                select: SUMMARY_FIELDS,
                // Pro has no project limit; this only bounds one response.
                limit: 1000,
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

        // Free 10, Plus 40, Pro unlimited (src/lib/plans.ts PLAN_PROJECT_LIMITS); a purchase Paddle
        // hasn't reported yet is looked up before refusing (entitlements.ts).
        const quota = await planQuota(email, "game", async (upTo) => (await runServerQuery<GameProjectRecord>({
            collectionId: "game_projects",
            where: [{ field: "ownerEmail", op: "EQUAL", value: email }],
            select: ["ownerEmail"],
            limit: upTo,
        })).length, { onLate: (work) => after(() => work.then(() => undefined, () => undefined)) });
        if (!quota.allowed) throw gameLimitError(quota.plan, quota.limit);

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
