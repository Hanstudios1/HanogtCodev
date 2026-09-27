import { NextRequest } from "next/server";
import { nowIso } from "@/lib/game-engine/ids";
import { compileScripts } from "@/lib/game-engine/script/compiler";
import { MAX_ARCADE_GAME_BYTES, type ArcadeRecord } from "@/lib/server/arcade";
import { commitServerMutations, getServerDocument, listServerCollection, runServerQuery } from "@/lib/server/firebase-rest";
import { scanUntrustedCode } from "@/lib/server/security-scanner";
import {
    apiError,
    apiJson,
    assembleProject,
    assertOnlyKeys,
    assertProjectId,
    authorizeGameRequest,
    GameApiError,
    loadOwnedProject,
    rateHeaders,
    readJsonBody,
    readText,
    readThumbnail,
    type GameScriptRecord,
} from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const { email, session, user, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const projectId = assertProjectId((await context.params).projectId);
        const body = await readJsonBody(request, 200 * 1024);
        assertOnlyKeys(body, ["title", "description", "thumbnail"]);
        const record = await loadOwnedProject(projectId, email);
        const scripts = (await listServerCollection<GameScriptRecord>(`game_projects/${projectId}/scripts`, 200)).filter((script) => script.ownerEmail === email);
        const project = assembleProject(record, projectId, scripts);
        const title = readText(body.title, "Başlık", 80, { required: true, min: 2 })!;
        const description = readText(body.description, "Açıklama", 500) || "";
        const thumbnail = readThumbnail(body.thumbnail) ?? (typeof record.thumbnail === "string" ? record.thumbnail : null);

        const program = compileScripts(project.scripts);
        if (!program.ok) {
            const first = program.diagnostics.find((item) => item.severity === "error");
            throw new GameApiError(400, `Derleme hataları varken yayınlanamaz${first ? ` (${first.scriptName}:${first.line} — ${first.message})` : ""}.`);
        }
        // Published scripts run in other people's browsers (inside the sandboxed VM);
        // reject obvious secrets or malicious payloads anyway.
        for (const script of project.scripts) {
            const scan = scanUntrustedCode(script.content);
            const blocking = scan.findings.filter((finding) => finding.severity === "critical");
            if (blocking.length) throw new GameApiError(400, `${script.name} güvenlik taramasından geçemedi: ${blocking[0].message}.`);
        }

        project.name = title;
        project.description = description;
        const game = JSON.stringify(project);
        if (Buffer.byteLength(game, "utf8") > MAX_ARCADE_GAME_BYTES) throw new GameApiError(413, "Oyun Arcade için çok büyük (900 KB). Büyük dokuları küçültün veya kaldırın.");

        const existing = await getServerDocument<ArcadeRecord>(`arcade_games/${projectId}`);
        if (existing && existing.ownerEmail !== email) throw new GameApiError(409, "Bu oyun başka bir hesaba ait.");
        const now = nowIso();
        const languages = [...new Set(project.scripts.map((script) => (script.language === "cpp" ? "C++" : "C#")))];
        const profile = user as { username?: string; avatarUrl?: string; nickname?: string };
        const data: ArcadeRecord = {
            ownerEmail: email,
            projectId,
            title,
            description,
            dimension: project.dimension,
            thumbnail,
            authorName: String(profile.nickname || profile.username || session?.user?.name || email.split("@")[0]).slice(0, 40),
            authorImage: typeof profile.avatarUrl === "string" && profile.avatarUrl.startsWith("https://") ? profile.avatarUrl : null,
            game,
            templateId: project.scenes[0]?.metadata.templateId ?? null,
            languages,
            plays: Number(existing?.plays || 0),
            likes: Number(existing?.likes || 0),
            createdAt: existing?.createdAt || now,
            updatedAt: now,
        };
        await commitServerMutations([{ type: existing ? "update" : "create", path: `arcade_games/${projectId}`, data: data as Record<string, unknown>, ...(existing ? { updateTime: existing._updateTime } : {}) }]);
        return apiJson({ success: true, arcadeId: projectId }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun yayınlanamadı.");
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const projectId = assertProjectId((await context.params).projectId);
        const existing = await getServerDocument<ArcadeRecord>(`arcade_games/${projectId}`);
        if (!existing || existing.ownerEmail !== email) throw new GameApiError(404, "Yayınlanmış oyun bulunamadı.");
        const likes = await runServerQuery<{ gameId?: string }>({ collectionId: "arcade_likes", where: [{ field: "gameId", op: "EQUAL", value: projectId }], select: ["gameId"], limit: 450 }).catch(() => []);
        await commitServerMutations([
            { type: "delete", path: `arcade_games/${projectId}` },
            ...likes.map((like) => ({ type: "delete" as const, path: like._path })),
        ]);
        return apiJson({ success: true }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Yayından kaldırılamadı.");
    }
}
