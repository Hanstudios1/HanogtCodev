import { after, type NextRequest } from "next/server";
import { cleanChatText, isCollabSessionId, readAccess } from "@/lib/collab/protocol";
import {
    CollabApiError,
    collabErrorResponse,
    collabJson,
    loadLiveSession,
    onlyKeys,
    postChat,
    pruneChat,
    readCollabBody,
    requireCollabUser,
    sharedLimit,
} from "@/lib/collab/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { text }: a chat message to everyone in the session (participants only).
 * Messages are deleted when the session ends; the newest 200 are kept meanwhile.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const { id } = await context.params;
        if (!isCollabSessionId(id)) throw new CollabApiError(404, "not_found");
        const user = await requireCollabUser(request, true);
        await sharedLimit(`collab:chat:${user.email}`, 30, 60_000);
        const body = await readCollabBody(request, 8_000);
        onlyKeys(body, ["text"]);
        const text = cleanChatText(body.text);
        if (!text) throw new CollabApiError(400, "invalid_request");
        const loaded = await loadLiveSession(id);
        const access = readAccess(loaded.view, user.email);
        const key = loaded.view.keys[user.email];
        if (access === "ended") throw new CollabApiError(410, "ended");
        if (access !== "ok" || !key) throw new CollabApiError(404, "not_found");
        const message = await postChat(loaded, key, text);
        if (Math.random() < 0.1) after(() => pruneChat(id).catch(() => undefined));
        return collabJson({ message }, 201);
    } catch (error) {
        return collabErrorResponse(error, "chat");
    }
}
