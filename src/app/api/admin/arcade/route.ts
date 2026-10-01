import type { NextRequest } from "next/server";
import { nowIso } from "@/lib/game-engine/ids";
import type { AdminArcadeActionResponse, AdminArcadeGame, AdminArcadeResponse } from "@/components/Admin/types";
import {
    AdminHttpError,
    adminFailure,
    adminJson,
    auditLogMutation,
    auditLogPatch,
    authorizeAdminRequest,
    deleteDocumentsInChunks,
    httpsUrlOrNull,
    numberOr,
    readAdminBody,
    readText,
    requireEnum,
    stringOr,
    toIso,
} from "@/lib/server/admin";
import { assertGameId, type ArcadeRecord } from "@/lib/server/arcade";
import { commitServerMutations, commitServerPatches, getServerDocument, runServerQuery } from "@/lib/server/firebase-rest";

export const runtime = "nodejs";

type AdminArcadeRecord = ArcadeRecord & { featured?: unknown };

const ACTIONS = ["unpublish", "feature", "unfeature"] as const;
const LIST_FIELDS = ["title", "description", "dimension", "thumbnail", "authorName", "ownerEmail", "plays", "likes", "featured", "createdAt", "updatedAt"];
const THUMBNAIL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const LIKE_BATCH = 400;

function thumbnail(value: unknown) {
    if (typeof value !== "string" || value.length > 80_000) return null;
    return THUMBNAIL.test(value) ? value : httpsUrlOrNull(value);
}

function toAdminGame(record: AdminArcadeRecord & { _id: string }): AdminArcadeGame {
    return {
        id: record._id,
        title: stringOr(record.title, "", 80),
        description: stringOr(record.description, "", 500),
        dimension: record.dimension === "2d" ? "2d" : "3d",
        thumbnail: thumbnail(record.thumbnail),
        authorName: stringOr(record.authorName, "", 60),
        ownerEmail: stringOr(record.ownerEmail, "", 254),
        plays: numberOr(record.plays),
        likes: numberOr(record.likes),
        featured: record.featured === true,
        createdAt: toIso(record.createdAt),
        updatedAt: toIso(record.updatedAt),
    };
}

/** The most recently published or updated Arcade games (without game content). */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const records = await runServerQuery<AdminArcadeRecord>({
            collectionId: "arcade_games",
            select: LIST_FIELDS,
            orderBy: [{ field: "updatedAt", direction: "DESCENDING" }],
            limit: 60,
        });
        const payload: AdminArcadeResponse = { games: records.map(toAdminGame) };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "arcade:get");
    }
}

/**
 * "feature"/"unfeature" toggle the `featured` flag the gallery can highlight.
 * "unpublish" removes the game from the Arcade the same way its owner would
 * (the game record and its likes); the owner's engine project stays intact.
 */
export async function POST(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator", mutation: true });
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    try {
        const body = await readAdminBody(request, ["action", "gameId", "reason"]);
        const action = requireEnum(body.action, ACTIONS, "invalid_action");
        const gameId = assertGameId(body.gameId);
        if (!gameId) throw new AdminHttpError(400, "invalid_id");
        if (action !== "unpublish" && body.reason !== undefined) throw new AdminHttpError(400, "unknown_field");
        const reason = readText(body.reason, { max: 500, multiline: true });
        const path = `arcade_games/${gameId}`;
        const record = await getServerDocument<AdminArcadeRecord>(path);
        if (!record) throw new AdminHttpError(404, "not_found");
        const summary = { title: stringOr(record.title, "", 80), ownerEmail: stringOr(record.ownerEmail, "", 254) };

        if (action === "feature" || action === "unfeature") {
            const featured = action === "feature";
            if ((record.featured === true) === featured) {
                const unchanged: AdminArcadeActionResponse = { gameId, featured, changed: false };
                return adminJson(unchanged);
            }
            await commitServerPatches([
                {
                    path,
                    data: featured ? { featured: true, featuredAt: nowIso() } : { featured: false },
                    updateFields: ["featured", "featuredAt"],
                    exists: true,
                },
                auditLogPatch(actor, featured ? "arcade.feature" : "arcade.unfeature", path, summary),
            ]);
            const response: AdminArcadeActionResponse = { gameId, featured, changed: true };
            return adminJson(response);
        }

        const likes = await runServerQuery<{ gameId?: string }>({
            collectionId: "arcade_likes",
            where: [{ field: "gameId", op: "EQUAL", value: gameId }],
            select: ["gameId"],
            limit: 1_000,
        }).catch(() => []);
        const likePaths = likes.map((like) => like._path);
        await commitServerMutations([
            { type: "delete", path },
            ...likePaths.slice(0, LIKE_BATCH).map((likePath) => ({ type: "delete" as const, path: likePath })),
            auditLogMutation(actor, "arcade.unpublish", path, {
                ...summary,
                plays: numberOr(record.plays),
                likes: numberOr(record.likes),
                reason: reason || null,
            }),
        ]);
        if (likePaths.length > LIKE_BATCH) {
            await deleteDocumentsInChunks(likePaths.slice(LIKE_BATCH)).catch((error: unknown) => {
                console.warn("[admin:arcade] like cleanup failed:", error instanceof Error ? error.message : error);
            });
        }
        const response: AdminArcadeActionResponse = { gameId, unpublished: true, changed: true };
        return adminJson(response);
    } catch (error) {
        return adminFailure(error, "arcade:post");
    }
}
