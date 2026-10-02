import { after, type NextRequest } from "next/server";
import { isValidYjsUpdate } from "@/lib/collab/doc";
import { COLLAB_LIMITS, fromBase64, isClientId, isCollabSessionId, isOwnAwarenessUpdate, readAccess, roleOf, writeAccess, type CollabAccess } from "@/lib/collab/protocol";
import {
    CollabApiError,
    appendUpdate,
    collabErrorResponse,
    collabJson,
    compactSession,
    deletePresence,
    hotLimit,
    loadLiveSession,
    onlyKeys,
    readCollabBody,
    requireCollabUser,
    writePresence,
} from "@/lib/collab/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * POST { client, update?, awareness?, leave? } — the hot path of a live session.
 * - update: a Yjs update (base64) of the caller's edits since the last request; stored as the next
 *   numbered update (collab_sessions/{id}/updates). Refused while the owner made the session read-only.
 * - awareness: the caller tab's y-protocols awareness update (cursor, open file, voice state).
 * - leave: true removes the tab's presence (sent with navigator.sendBeacon when the page closes).
 */

type RouteContext = { params: Promise<{ id: string }> };

function accessError(access: Exclude<CollabAccess, "ok">) {
    if (access === "ended") return new CollabApiError(410, "ended");
    if (access === "read_only") return new CollabApiError(403, "read_only");
    if (access === "frozen") return new CollabApiError(409, "frozen");
    return new CollabApiError(404, "not_found");
}

export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const { id } = await context.params;
        if (!isCollabSessionId(id)) throw new CollabApiError(404, "not_found");
        const user = await requireCollabUser(request, true);
        const body = await readCollabBody(request, COLLAB_LIMITS.maxUpdateChars + COLLAB_LIMITS.maxAwarenessChars + 1_000);
        // Every 64 KB of update data costs one more token: large pastes pass, floods of them don't.
        const size = typeof body.update === "string" ? body.update.length : 0;
        await hotLimit(`collab:sync:${user.email}`, 12, 40, 2_000, 1 + Math.floor(size / 65_536));
        onlyKeys(body, ["client", "update", "awareness", "leave"]);
        const client = body.client;
        if (!isClientId(client)) throw new CollabApiError(400, "invalid_request");
        const loaded = await loadLiveSession(id);
        const key = loaded.view.keys[user.email];

        if (body.leave === true) {
            if (key && roleOf(loaded.view, user.email)) await deletePresence(id, key, client);
            return collabJson({ ok: true, seq: null });
        }
        if (body.update === undefined && body.awareness === undefined) throw new CollabApiError(400, "invalid_request");
        const access = body.update !== undefined ? writeAccess(loaded.view, user.email) : readAccess(loaded.view, user.email);
        if (access !== "ok" || !key) throw accessError(access === "ok" ? "not_found" : access);

        let seq: number | null = null;
        if (body.update !== undefined) {
            const bytes = fromBase64(body.update, COLLAB_LIMITS.maxUpdateChars);
            if (!bytes || !isValidYjsUpdate(bytes)) throw new CollabApiError(400, "invalid_update");
            const compact = () => after(() => compactSession(id).catch((error) => console.error("[collab:compact]", error instanceof Error ? error.message : error)));
            try {
                seq = await appendUpdate(loaded, key, client, body.update as string);
            } catch (error) {
                // Too many updates wait for a compaction (an earlier one failed): start one; the client retries.
                if (error instanceof CollabApiError && error.code === "unavailable") compact();
                throw error;
            }
            if (seq - loaded.view.snapshotSeq >= COLLAB_LIMITS.compactEvery) compact();
        }
        if (body.awareness !== undefined) {
            const bytes = fromBase64(body.awareness, COLLAB_LIMITS.maxAwarenessChars);
            if (!bytes || !isOwnAwarenessUpdate(bytes, client)) throw new CollabApiError(400, "invalid_request");
            await writePresence(loaded, key, client, body.awareness as string);
        }
        return collabJson({ ok: true, seq });
    } catch (error) {
        return collabErrorResponse(error, "sync");
    }
}
