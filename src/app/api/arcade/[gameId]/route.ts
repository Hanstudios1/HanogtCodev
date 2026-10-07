import { NextRequest, NextResponse } from "next/server";
import { isArcadeGenre } from "@/lib/arcade-genres";
import { arcadeProject, arcadeSummary, assertGameId, creatorIdOf, likeDocumentId, likerHash, type ArcadeRecord } from "@/lib/server/arcade";
import { readArcadeRating } from "@/lib/server/arcade-ratings";
import { getServerDocument, isMissingDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback, memoryRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { getActiveSession, getSignedInSession } from "@/lib/server/active-session";
import { arcadeFailure, arcadeJson, readArcadeBody, tooManyRequests } from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return NextResponse.json({ error: "Geçersiz oyun." }, { status: 400, headers: jsonSecurityHeaders() });
        // Reading is limited in memory: a stored counter would cost a database write per visit.
        const rate = memoryRateLimit(`arcade:game:${getClientKey(request)}`, 90, 60_000);
        if (!rate.allowed) return NextResponse.json({ error: "Çok fazla istek." }, { status: 429, headers: jsonSecurityHeaders({ "Retry-After": String(rate.retryAfterSeconds) }) });
        const record = await getServerDocument<ArcadeRecord>(`arcade_games/${gameId}`);
        if (!record) return NextResponse.json({ error: "Oyun bulunamadı veya yayından kaldırıldı." }, { status: 404, headers: jsonSecurityHeaders() });
        const session = await getSignedInSession();
        const email = session?.user?.email?.toLowerCase();
        const [liked, myRating] = email
            ? await Promise.all([
                getServerDocument(`arcade_likes/${likeDocumentId(gameId, email)}`, { fields: ["gameId"] }).then(Boolean, () => false),
                readArcadeRating(gameId, email).catch(() => null),
            ])
            : [false, null];
        const isOwner = Boolean(email && record.ownerEmail === email);
        const summary = arcadeSummary(record, gameId);
        return NextResponse.json({
            game: {
                ...summary,
                // A game from before creator pages links to its creator too (the gallery gives it the stored id once).
                creatorId: summary.creatorId ?? (record.ownerEmail ? creatorIdOf(record.ownerEmail) : null),
                isOwner,
                liked,
                myRating,
                canRate: Boolean(email) && !isOwner,
            },
            project: arcadeProject(record, gameId),
        }, { headers: jsonSecurityHeaders() });
    } catch {
        return NextResponse.json({ error: "Oyun yüklenemedi." }, { status: 503, headers: jsonSecurityHeaders() });
    }
}

/** The author changes the game's genre ({ genre }) without publishing it again. */
export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        if (!isSameOrigin(request)) return arcadeJson({ error: "Geçersiz istek kaynağı.", code: "origin" }, 403);
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return arcadeJson({ error: "Geçersiz oyun.", code: "invalid_game" }, 400);
        const active = await getActiveSession();
        if (!active) return arcadeJson({ error: "Giriş yapın.", code: "sign_in" }, 401);
        const body = await readArcadeBody(request, ["genre"]);
        if (!isArcadeGenre(body.genre)) return arcadeJson({ error: "Geçersiz oyun türü.", code: "invalid_genre" }, 400);
        const rate = await enforceRateLimitWithFallback(`arcade:edit:${likerHash(active.email)}`, 30, 10 * 60_000);
        if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);
        const record = await getServerDocument<ArcadeRecord>(`arcade_games/${gameId}`, { fields: ["ownerEmail", "genre"] });
        if (!record) return arcadeJson({ error: "Oyun bulunamadı.", code: "not_found" }, 404);
        if (record.ownerEmail !== active.email) return arcadeJson({ error: "Oyunun türünü yalnızca yapımcısı değiştirebilir.", code: "forbidden" }, 403);
        if (record.genre !== body.genre) {
            try {
                await patchServerDocument(`arcade_games/${gameId}`, { genre: body.genre }, { updateFields: ["genre"], exists: true });
            } catch (error) {
                if (isMissingDocument(error)) return arcadeJson({ error: "Oyun bulunamadı.", code: "not_found" }, 404);
                throw error;
            }
        }
        return arcadeJson({ genre: body.genre });
    } catch (error) {
        return arcadeFailure(error, "Oyun türü kaydedilemedi.");
    }
}
