import type { NextRequest } from "next/server";
import { collabLimitsFor, freeCollabLimits } from "@/lib/server/plans";
import {
    CollabApiError,
    collabErrorResponse,
    collabJson,
    createSession,
    listFriendCards,
    onlyKeys,
    readCollabBody,
    requireCollabUser,
    sharedLimit,
} from "@/lib/collab/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Live collaboration in the code editor ("Ekiple düzenle").
 * GET  ?view=friends  the caller's friends with presence (the invite picker)
 *                     and the plan's limits { plan, people, invites }.
 * POST                starts a session from the owner's open files:
 *                     { title, files: [{ id, name, lang, code }], invite: [e-mail] }
 *                     Only friends of the owner can be invited (users/{email}.friends).
 */

export async function GET(request: NextRequest) {
    try {
        if (request.nextUrl.searchParams.get("view") !== "friends") throw new CollabApiError(400, "invalid_request");
        const user = await requireCollabUser(request, false);
        await sharedLimit(`collab:friends:${user.email}`, 40, 600_000);
        // The plan's team-editing limits come along, so the invite picker stops at the right number.
        const [friends, limits] = await Promise.all([listFriendCards(user.friends), collabLimitsFor(user.email).catch(freeCollabLimits)]);
        return collabJson({ friends, limits });
    } catch (error) {
        return collabErrorResponse(error, "friends");
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireCollabUser(request, true);
        await sharedLimit(`collab:create:${user.email}`, 12, 3_600_000);
        // 1 000 000 characters of code at most; JSON escapes and UTF-8 make the body larger.
        const body = await readCollabBody(request, 4_000_000);
        onlyKeys(body, ["title", "files", "invite"]);
        const created = await createSession(user, { title: body.title, files: body.files, invite: body.invite ?? [] });
        return collabJson(created, 201);
    } catch (error) {
        return collabErrorResponse(error, "create");
    }
}
