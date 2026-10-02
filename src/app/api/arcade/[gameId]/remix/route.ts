import { NextRequest } from "next/server";
import { createEngineId, nowIso } from "@/lib/game-engine/ids";
import { arcadeProject, assertGameId, type ArcadeRecord, type RemixSource } from "@/lib/server/arcade";
import { commitServerMutations, getServerDocument, runServerQuery } from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    authorizeGameRequest,
    GameApiError,
    projectDocumentFields,
    rateHeaders,
    scriptRecord,
    validateProject,
    type GameProjectRecord,
} from "../../../game-projects/_shared";
import { projectLimitFor } from "@/lib/server/plans";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

/**
 * POST /api/arcade/{gameId}/remix: copies a published game into the caller's
 * cloud projects. Only games whose author turned on "Allow remixes" can be
 * remixed (authors can always copy their own), and the copy keeps the
 * original's title and author as attribution.
 */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) throw new GameApiError(400, "Geçersiz oyun.");
        const record = await getServerDocument<ArcadeRecord>(`arcade_games/${gameId}`);
        if (!record) throw new GameApiError(404, "Oyun bulunamadı veya yayından kaldırıldı.");
        const own = record.ownerEmail === email;
        if (!own && record.allowRemix !== true) throw new GameApiError(403, "Bu oyunun yapımcısı remikslemeye izin vermiyor.");

        // Free 10, Plus 40, Pro unlimited (src/lib/plans.ts PLAN_PROJECT_LIMITS).
        const { limit } = await projectLimitFor(email, "game");
        if (limit !== null) {
            const existing = await runServerQuery<GameProjectRecord>({
                collectionId: "game_projects",
                where: [{ field: "ownerEmail", op: "EQUAL", value: email }],
                select: ["ownerEmail"],
                limit: limit + 1,
            });
            if (existing.length >= limit) {
                throw new GameApiError(409, `Planının oyun projesi sınırına ulaştın (${limit}). Yer açmak için eski bir projeyi sil ya da planını yükselt: /plans`);
            }
        }

        const source = arcadeProject(record, gameId);
        const projectId = createEngineId("game").replace(/[^A-Za-z0-9_-]/g, "_");
        const project = validateProject(source, projectId, { name: `${(record.title || source.name).slice(0, 70)} (Remix)` });
        const now = nowIso();
        project.metadata = { createdAt: now, updatedAt: now };
        const remixOf: RemixSource | null = own ? null : {
            gameId,
            title: (record.title || source.name || "").slice(0, 80),
            authorName: (record.authorName || "").slice(0, 40),
        };
        const thumbnail = typeof record.thumbnail === "string" ? record.thumbnail : null;

        await commitServerMutations([
            {
                type: "create",
                path: `game_projects/${projectId}`,
                data: { ownerEmail: email, ...projectDocumentFields(project), thumbnail, remixOf, createdAt: now, updatedAt: now },
            },
            ...project.scripts.map((script, order) => ({
                type: "create" as const,
                path: `game_projects/${projectId}/scripts/${script.id}`,
                data: scriptRecord(script, projectId, email, order, now),
            })),
        ]);
        return apiJson({ success: true, projectId }, 201, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Remix oluşturulamadı.");
    }
}
