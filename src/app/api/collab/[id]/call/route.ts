import { after, type NextRequest } from "next/server";
import { COLLAB_LIMITS, isClientId, isCollabSessionId, isParticipantKey, isSignalId, isSignalKind, readAccess } from "@/lib/collab/protocol";
import {
    CollabApiError,
    acknowledgeSignals,
    collabErrorResponse,
    collabJson,
    hotLimit,
    loadLiveSession,
    onlyKeys,
    pruneSignals,
    readCollabBody,
    requireCollabUser,
    sendSignals,
    type OutgoingSignal,
} from "@/lib/collab/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * WebRTC signalling for the session's voice chat (a small mesh: everyone
 * connects to everyone, 2–5 people). Audio never passes through the server;
 * TURN credentials come from /api/calls/ice.
 * POST { client, signals?: [{ to, toClient, kind, data }], ack?: [signal ids] }
 * - signals go to other participants' inboxes (collab_sessions/{id}/inbox/{key}/signals);
 *   the sender is taken from the session, never from the request.
 * - ack deletes signals the caller has read, from the caller's own inbox only.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const { id } = await context.params;
        if (!isCollabSessionId(id)) throw new CollabApiError(404, "not_found");
        const user = await requireCollabUser(request, true);
        await hotLimit(`collab:call:${user.email}`, 10, 40, 1_500);
        const body = await readCollabBody(request, COLLAB_LIMITS.maxSignalsPerRequest * (COLLAB_LIMITS.maxSignalChars + 200) + 6_000);
        onlyKeys(body, ["client", "signals", "ack"]);
        if (!isClientId(body.client)) throw new CollabApiError(400, "invalid_request");
        const client = body.client;
        const loaded = await loadLiveSession(id);
        const access = readAccess(loaded.view, user.email);
        const key = loaded.view.keys[user.email];
        if (access === "ended") throw new CollabApiError(410, "ended");
        if (access !== "ok" || !key) throw new CollabApiError(404, "not_found");

        const present = new Set(loaded.view.participants.map((email) => loaded.view.keys[email]).filter(Boolean));
        const signals: OutgoingSignal[] = [];
        if (body.signals !== undefined) {
            if (!Array.isArray(body.signals) || body.signals.length > COLLAB_LIMITS.maxSignalsPerRequest) throw new CollabApiError(400, "invalid_request");
            for (const entry of body.signals) {
                const signal = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
                if (!isParticipantKey(signal.to) || !present.has(signal.to) || !isClientId(signal.toClient) || !isSignalKind(signal.kind)) throw new CollabApiError(400, "invalid_request");
                if (typeof signal.data !== "string" || signal.data.length > COLLAB_LIMITS.maxSignalChars) throw new CollabApiError(413, "payload_too_large");
                if (signal.to === key && signal.toClient === client) throw new CollabApiError(400, "invalid_request");
                signals.push({ to: signal.to, toClient: signal.toClient, kind: signal.kind, data: signal.data });
            }
        }
        const acks: string[] = [];
        if (body.ack !== undefined) {
            if (!Array.isArray(body.ack) || body.ack.length > COLLAB_LIMITS.maxAcksPerRequest || body.ack.some((value) => !isSignalId(value))) throw new CollabApiError(400, "invalid_request");
            acks.push(...(body.ack as string[]));
        }
        if (signals.length) await sendSignals(loaded, key, client, signals);
        if (acks.length) await acknowledgeSignals(id, key, acks);
        if (Math.random() < 0.05) after(() => pruneSignals(id, key).catch(() => undefined));
        return collabJson({ ok: true });
    } catch (error) {
        return collabErrorResponse(error, "call");
    }
}
