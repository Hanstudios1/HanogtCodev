import { after, type NextRequest } from "next/server";
import { COLLAB_LIMITS, isClientId, isCollabSessionId, publicMeta } from "@/lib/collab/protocol";
import {
    CollabApiError,
    collabErrorResponse,
    collabJson,
    finalizeSession,
    hotLimit,
    inviteToSession,
    joinSession,
    leaveSession,
    loadLiveSession,
    onlyKeys,
    ownerInvites,
    pollSession,
    pruneStalePresence,
    readCollabBody,
    removeFromSession,
    requireCollabUser,
    sessionInfo,
    setReadOnly,
    sharedLimit,
} from "@/lib/collab/server";
import { collabLimitsFor } from "@/lib/server/plans";
import { normalizeEmail } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * One live session.
 * GET ?view=info                          invitees and participants: title, owner, people (before joining)
 * GET ?after=<seq>&chat=<ms>&signals=0|1&client=<id>
 *                                         participants: what changed since the last poll (browsers without
 *                                         the Firebase connection poll this about every 700 ms)
 * POST { action: "join" }                 invited friends of the owner (the owner's plan: Free 2, Plus 5, Pro 30 people)
 * POST { action: "leave" }                participants (the owner ends the session instead)
 * POST { action: "invite", emails }       owner: invite friends (a notification each)
 * POST { action: "remove", email }        owner: withdraw an invitation or remove a participant
 * POST { action: "readOnly", value }      owner: allow or stop editing by the others
 * POST { action: "end" }                  owner: end the session (everyone can keep a copy for 24 hours)
 */

type RouteContext = { params: Promise<{ id: string }> };

async function sessionId(context: RouteContext) {
    const { id } = await context.params;
    if (!isCollabSessionId(id)) throw new CollabApiError(404, "not_found");
    return id;
}

function integer(value: string | null, fallback: number, min: number, max: number) {
    if (value === null || !/^-?\d{1,15}$/.test(value)) return fallback;
    const number = Number(value);
    return number >= min && number <= max ? number : fallback;
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const id = await sessionId(context);
        const user = await requireCollabUser(request, false);
        const params = request.nextUrl.searchParams;
        if (params.get("view") === "info") {
            await sharedLimit(`collab:info:${user.email}`, 60, 600_000);
            const loaded = await loadLiveSession(id);
            const ownerLimits = await collabLimitsFor(loaded.view.owner).catch(() => null);
            return collabJson(sessionInfo(id, loaded.view, user.email, ownerLimits));
        }
        await hotLimit(`collab:poll:${user.email}`, 4, 12, 2_000);
        const clientParam = params.get("client");
        const client = clientParam !== null && /^\d{1,10}$/.test(clientParam) && isClientId(Number(clientParam)) ? Number(clientParam) : null;
        const loaded = await loadLiveSession(id);
        const response = await pollSession(loaded, user.email, {
            after: integer(params.get("after"), -1, -1, 1e12),
            chat: integer(params.get("chat"), 0, 0, 8.64e15),
            signals: params.get("signals") === "1",
            client,
        });
        // Presence of tabs that closed without saying goodbye.
        if (Math.random() < 0.03) after(() => pruneStalePresence(id).catch(() => undefined));
        return collabJson(response);
    } catch (error) {
        return collabErrorResponse(error, "poll");
    }
}

export async function POST(request: NextRequest, context: RouteContext) {
    try {
        const id = await sessionId(context);
        const user = await requireCollabUser(request, true);
        await sharedLimit(`collab:action:${user.email}`, 60, 600_000);
        const body = await readCollabBody(request, 8_000);
        switch (body.action) {
            case "join": {
                onlyKeys(body, ["action"]);
                const view = await joinSession(id, user);
                return collabJson({ ok: true, meta: publicMeta(id, view) });
            }
            case "leave": {
                onlyKeys(body, ["action"]);
                await leaveSession(id, user.email);
                return collabJson({ ok: true });
            }
            case "invite": {
                onlyKeys(body, ["action", "emails"]);
                if (!Array.isArray(body.emails) || !body.emails.length || body.emails.length > COLLAB_LIMITS.maxInvites) throw new CollabApiError(400, "invalid_request");
                const emails = body.emails.map(normalizeEmail);
                if (emails.some((email) => !email)) throw new CollabApiError(400, "invalid_request");
                const view = await inviteToSession(id, user, emails);
                return collabJson({ ok: true, invited: ownerInvites(view) });
            }
            case "remove": {
                onlyKeys(body, ["action", "email"]);
                const target = normalizeEmail(body.email);
                if (!target) throw new CollabApiError(400, "invalid_request");
                const view = await removeFromSession(id, user, target);
                return collabJson({ ok: true, invited: ownerInvites(view), meta: publicMeta(id, view) });
            }
            case "readOnly": {
                onlyKeys(body, ["action", "value"]);
                if (typeof body.value !== "boolean") throw new CollabApiError(400, "invalid_request");
                const view = await setReadOnly(id, user, body.value);
                return collabJson({ ok: true, meta: publicMeta(id, view) });
            }
            case "end": {
                onlyKeys(body, ["action"]);
                const loaded = await loadLiveSession(id);
                if (!loaded.view.participants.includes(user.email)) throw new CollabApiError(404, "not_found");
                if (loaded.view.owner !== user.email) throw new CollabApiError(403, "forbidden");
                const view = await finalizeSession(id, "owner");
                return collabJson({ ok: true, meta: view ? publicMeta(id, view) : null });
            }
            default:
                throw new CollabApiError(400, "invalid_request");
        }
    } catch (error) {
        return collabErrorResponse(error, "action");
    }
}
