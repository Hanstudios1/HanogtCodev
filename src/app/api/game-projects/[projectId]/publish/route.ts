import { NextRequest } from "next/server";
import { nowIso } from "@/lib/game-engine/ids";
import { compileScripts } from "@/lib/game-engine/script/compiler";
import { ENGINE_VERSION } from "@/lib/game-engine/types";
import { MAX_ARCADE_GAME_BYTES, remixSourceOf, type ArcadeRecord } from "@/lib/server/arcade";
import { clearChangedBoards, removeArcadeGame } from "@/lib/server/arcade-scores";
import { commitServerMutations, getServerDocument, listServerCollection } from "@/lib/server/firebase-rest";
import { missingGameAudio, syncArcadeAudio } from "@/lib/server/game-assets";
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
        assertOnlyKeys(body, ["title", "description", "thumbnail", "allowRemix"]);
        if (body.allowRemix !== undefined && typeof body.allowRemix !== "boolean") throw new GameApiError(400, "Geçersiz remiks ayarı.");
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

        // Audio and model files must be in the store; the published game keeps its own copies of them.
        const files = [...project.audio, ...project.models];
        const assetHashes = files.map((asset) => asset.hash);
        const missing = await missingGameAudio(assetHashes);
        if (missing.length) {
            const names = files.filter((asset) => missing.includes(asset.hash)).map((asset) => asset.name);
            throw new GameApiError(400, `Bazı ses ya da model dosyaları sunucuda yok (${names.slice(0, 3).join(", ")}). Projeyi kaydedip tekrar deneyin ya da bu dosyaları yeniden yükleyin.`);
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
            engineVersion: ENGINE_VERSION,
            languages,
            plays: Number(existing?.plays || 0),
            likes: Number(existing?.likes || 0),
            // Remixing stays off unless the author turns it on; republishing keeps the last choice.
            allowRemix: typeof body.allowRemix === "boolean" ? body.allowRemix : existing?.allowRemix === true,
            remixOf: remixSourceOf(record.remixOf),
            // Leaderboards and achievements (V5): scores are checked against this copy without reading the game.
            arcade: project.settings.arcade,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
        };
        await commitServerMutations([{ type: existing ? "update" : "create", path: `arcade_games/${projectId}`, data: data as Record<string, unknown>, ...(existing ? { updateTime: existing._updateTime } : {}) }]);
        await syncArcadeAudio(projectId, assetHashes);
        // Boards that were removed, or now rank the other way, start empty.
        if (existing) {
            await clearChangedBoards(projectId, existing.arcade, project.settings.arcade).catch((error: unknown) => {
                console.warn("[arcade] stale leaderboard cleanup failed:", error instanceof Error ? error.message : error);
            });
        }
        return apiJson({ success: true, arcadeId: projectId }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Oyun yayınlanamadı.");
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const projectId = assertProjectId((await context.params).projectId);
        const existing = await getServerDocument<ArcadeRecord>(`arcade_games/${projectId}`, { fields: ["ownerEmail"] });
        if (!existing || existing.ownerEmail !== email) throw new GameApiError(404, "Yayınlanmış oyun bulunamadı.");
        // Likes, scores and unlocks go with the game, and its own copies of audio and model files are released.
        await removeArcadeGame(projectId);
        return apiJson({ success: true }, 200, rateHeaders(rate));
    } catch (error) {
        return apiError(error, "Yayından kaldırılamadı.");
    }
}
