import { NextRequest } from "next/server";
import { nowIso } from "@/lib/game-engine/ids";
import { removeArcadeGame } from "@/lib/server/arcade-scores";
import { commitServerMutations, getServerDocument, listServerCollection } from "@/lib/server/firebase-rest";
import {
    apiError,
    apiJson,
    assembleProject,
    assertOnlyKeys,
    assertProjectId,
    assertRevision,
    authorizeGameRequest,
    GameApiError,
    loadOwnedProject,
    projectDocumentFields,
    rateHeaders,
    readJsonBody,
    readText,
    readThumbnail,
    scriptRecord,
    validateProject,
    type GameScriptRecord,
} from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

async function routeProjectId(context: RouteContext) {
    const { projectId } = await context.params;
    return assertProjectId(projectId);
}

async function ownedScripts(projectId: string, email: string) {
    const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 200);
    return scripts.filter((script) => script.ownerEmail === email && script.projectId === projectId);
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        const projectId = await routeProjectId(context);
        const [record, scripts, arcade] = await Promise.all([
            loadOwnedProject(projectId, email),
            ownedScripts(projectId, email),
            getServerDocument<{ ownerEmail?: string }>(`arcade_games/${projectId}`).catch(() => null),
        ]);
        const project = assembleProject(record, projectId, scripts);
        return apiJson({
            project,
            revision: record._updateTime ?? null,
            arcadeId: arcade && arcade.ownerEmail === email ? projectId : null,
            schemaVersion: record.schemaVersion ?? 1,
        }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projesi şu anda yüklenemiyor.", 503);
    }
}

/** Saves the whole project: document content + changed/new/removed scripts in one atomic commit. */
export async function PUT(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const projectId = await routeProjectId(context);
        const body = await readJsonBody(request);
        assertOnlyKeys(body, ["project", "revision", "thumbnail"]);
        const record = await loadOwnedProject(projectId, email);
        assertRevision(request, record, body.revision);
        // A tab still running an older engine would silently drop newer components; make it reload instead.
        const incoming = body.project && typeof body.project === "object" ? Number((body.project as { version?: unknown }).version) || 1 : 1;
        if (Number(record.schemaVersion ?? 1) > incoming) throw new GameApiError(409, "Bu proje Hanogt Engine'in daha yeni bir sürümüyle kaydedilmiş. Değişikliklerin kaybolmaması için sayfayı yenileyin.");
        const project = validateProject(body.project, projectId);
        const thumbnail = readThumbnail(body.thumbnail);
        const existingScripts = await ownedScripts(projectId, email);
        const now = nowIso();
        const fields = projectDocumentFields(project);
        const data: Record<string, unknown> = { ...fields, updatedAt: now };
        if (thumbnail !== undefined) data.thumbnail = thumbnail;
        if (!record.createdAt) data.createdAt = project.metadata.createdAt || now;

        const byId = new Map(existingScripts.map((script) => [script._id, script]));
        const keep = new Set(project.scripts.map((script) => script.id));
        const scriptWrites = project.scripts.flatMap((script, order) => {
            const previous = byId.get(script.id);
            if (previous && previous.content === script.content && previous.name === script.name && previous.language === script.language && Number(previous.order || 0) === order) return [];
            return [{
                type: "update" as const,
                path: `game_projects/${projectId}/scripts/${script.id}`,
                data: scriptRecord(script, projectId, email, order, now, previous?.createdAt),
            }];
        });
        const scriptDeletes = existingScripts
            .filter((script) => !keep.has(script._id))
            .map((script) => ({ type: "delete" as const, path: script._path }));
        if (scriptWrites.length + scriptDeletes.length > 450) throw new GameApiError(413, "Tek seferde çok fazla script değişikliği var.");

        const result = await commitServerMutations([
            { type: "update", path: `game_projects/${projectId}`, data, updateFields: Object.keys(data), updateTime: record._updateTime },
            ...scriptWrites,
            ...scriptDeletes,
        ]);
        return apiJson({ success: true, revision: result.writeResults[0]?.updateTime ?? null, updatedAt: now }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projesi kaydedilemedi.");
    }
}

/** Quick metadata edits (rename, description) used by the dashboard. */
export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const projectId = await routeProjectId(context);
        const body = await readJsonBody(request, 16 * 1024);
        assertOnlyKeys(body, ["name", "description", "revision"]);
        const record = await loadOwnedProject(projectId, email);
        assertRevision(request, record, body.revision);
        const update: Record<string, unknown> = {};
        if (body.name !== undefined) update.name = readText(body.name, "Proje adı", 80, { required: true, min: 1 });
        if (body.description !== undefined) update.description = readText(body.description, "Proje açıklaması", 500) || "";
        if (!Object.keys(update).length) throw new GameApiError(400, "Güncellenecek alan yok.");
        update.updatedAt = nowIso();
        const result = await commitServerMutations([{ type: "update", path: `game_projects/${projectId}`, data: update, updateFields: Object.keys(update), updateTime: record._updateTime }]);
        return apiJson({ success: true, revision: result.writeResults[0]?.updateTime ?? null }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projesi güncellenemedi.");
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const projectId = await routeProjectId(context);
        const record = await loadOwnedProject(projectId, email);
        const scripts = await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 500);
        const arcade = await getServerDocument<{ ownerEmail?: string }>(`arcade_games/${projectId}`, { fields: ["ownerEmail"] });
        // The published game goes first, with its likes, scores and unlocks; a failure keeps the project for a retry.
        if (arcade && arcade.ownerEmail === email) await removeArcadeGame(projectId);
        for (let index = 0; index < scripts.length; index += 400) {
            await commitServerMutations(scripts.slice(index, index + 400).map((script) => ({ type: "delete" as const, path: script._path })));
        }
        await commitServerMutations([{ type: "delete", path: `game_projects/${projectId}`, updateTime: record._updateTime }]);
        return apiJson({ success: true }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun projesi silinemedi.");
    }
}
