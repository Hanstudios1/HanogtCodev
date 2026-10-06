import type { NextRequest } from "next/server";
import { auditLogMutation } from "@/lib/server/admin";
import { assertGameId, likerHash } from "@/lib/server/arcade";
import { arcadeGameRules, arcadePlayerName, ArcadeError, listArcadeScores, removeArcadeScores, removeOwnArcadeScore, submitArcadeScore } from "@/lib/server/arcade-scores";
import { getActiveSession } from "@/lib/server/active-session";
import { commitServerMutations } from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback, memoryRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, isSameOrigin } from "@/lib/server/request-security";
import { resolveUserRole } from "@/lib/server/roles";
import { arcadeFailure, arcadeJson, readArcadeBody, tooManyRequests } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ gameId: string }> };

const isStaff = (email: string, role: unknown) => resolveUserRole(email, role) !== "user";

/** A board's best entries (?board=id; the first board when left out), with the viewer's own entry. */
export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return arcadeJson({ error: "Geçersiz oyun.", code: "invalid_game" }, 400);
        const rate = memoryRateLimit(`arcade:scores:${getClientKey(request)}`, 120, 60_000);
        if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);
        const rules = await arcadeGameRules(gameId);
        const active = await getActiveSession();
        const canModerate = Boolean(active && (active.email === rules.ownerEmail || isStaff(active.email, active.user.role)));
        const page = await listArcadeScores(gameId, request.nextUrl.searchParams.get("board"), { viewer: active?.email ?? null, withEntryIds: canModerate, rules });
        return arcadeJson({ ...page, canModerate });
    } catch (error) {
        return arcadeFailure(error, "Skor tablosu yüklenemedi.");
    }
}

/** Sends the signed-in player's score ({ token, board, score }); only a new best is kept. */
export async function POST(request: NextRequest, context: RouteContext) {
    try {
        if (!isSameOrigin(request)) return arcadeJson({ error: "Geçersiz istek kaynağı.", code: "origin" }, 403);
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return arcadeJson({ error: "Geçersiz oyun.", code: "invalid_game" }, 400);
        const active = await getActiveSession();
        if (!active) return arcadeJson({ error: "Skorların kaydedilmesi için giriş yapın.", code: "sign_in" }, 401);
        const body = await readArcadeBody(request, ["token", "board", "score"]);
        const rate = await enforceRateLimitWithFallback(`arcade:score:${likerHash(active.email)}`, 60, 10 * 60_000);
        if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);
        const result = await submitArcadeScore({
            gameId,
            email: active.email,
            name: arcadePlayerName(active.user as Record<string, unknown>),
            token: body.token,
            board: body.board,
            score: body.score,
        });
        return arcadeJson(result);
    } catch (error) {
        return arcadeFailure(error, "Skor kaydedilemedi.");
    }
}

/**
 * A player removes their own entry ({ board, mine: true }); the author (or
 * staff) removes any entry ({ board, entryId }) or clears a board ({ board, all: true }).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        if (!isSameOrigin(request)) return arcadeJson({ error: "Geçersiz istek kaynağı.", code: "origin" }, 403);
        const gameId = assertGameId((await context.params).gameId);
        if (!gameId) return arcadeJson({ error: "Geçersiz oyun.", code: "invalid_game" }, 400);
        const active = await getActiveSession();
        if (!active) return arcadeJson({ error: "Giriş yapın.", code: "sign_in" }, 401);
        const body = await readArcadeBody(request, ["board", "entryId", "all", "mine"]);
        const rules = await arcadeGameRules(gameId);
        const board = rules.settings.leaderboards.find((item) => item.id === body.board);
        if (!board) throw new ArcadeError(404, "unknown_board", "Bu oyunda böyle bir skor tablosu yok.");
        const targets = [body.mine === true, body.all === true, typeof body.entryId === "string"].filter(Boolean).length;
        if (targets !== 1) throw new ArcadeError(400, "invalid_body", "Kendi kaydınızı (mine), bir kaydı (entryId) ya da bütün tabloyu (all) seçin.");
        const rate = await enforceRateLimitWithFallback(`arcade:score-remove:${likerHash(active.email)}`, 60, 10 * 60_000);
        if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);
        if (body.mine === true) return arcadeJson({ removed: await removeOwnArcadeScore(gameId, board.id, active.email) });
        const owner = active.email === rules.ownerEmail;
        if (!owner && !isStaff(active.email, active.user.role)) return arcadeJson({ error: "Skor tablosunu yalnızca oyunun yapımcısı düzenleyebilir.", code: "forbidden" }, 403);
        const removed = await removeArcadeScores(gameId, board.id, body.all === true ? { all: true } : { entryId: body.entryId as string });
        // Staff removing entries from someone else's game leaves a trace in the audit log.
        if (!owner) {
            await commitServerMutations([auditLogMutation(active.email, "arcade.remove_scores", `arcade_games/${gameId}`, { board: board.id, removed, all: body.all === true })]).catch((error: unknown) => {
                console.warn("[arcade] audit entry failed:", error instanceof Error ? error.message : error);
            });
        }
        return arcadeJson({ removed });
    } catch (error) {
        return arcadeFailure(error, "Kayıt silinemedi.");
    }
}
