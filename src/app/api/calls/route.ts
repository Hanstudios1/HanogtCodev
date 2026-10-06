import type { NextRequest } from "next/server";
import { addCandidates, answerCall, declineCall, deleteCall, readCall, setCallMuted, setCallSharing, startCall } from "@/lib/server/calls";
import { SocialApiError, assertRateLimit, assertSameOrigin, readBody, requireSocialUser, socialJson } from "@/lib/social/server";
import { assertBurst, callErrorResponse } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Signalling of 1:1 voice calls through the server, so calls work without the
 * browser's Firebase bridge (the bridge, when it works, only adds a realtime
 * listener on calls/{id}). Audio never passes through here.
 *   GET  ?id=<call>&have=<n>  the call as the participant sees it (remote ICE candidates from n on)
 *   POST { action: "start", callee, offer }        rings a friend
 *        { action: "answer", callId, answer }      the callee takes the call
 *        { action: "candidates", callId, candidates }
 *        { action: "decline", callId, reason }     declined / busy / unavailable (callee)
 *        { action: "end", callId }                 hang up or cancel (either side; deletes the call)
 *        { action: "mute", callId, muted }         microphone switched off/on (the other side shows it)
 *        { action: "share", callId, sharing }      screen sharing started/stopped (the video flows peer to peer)
 * "start" and "answer" take `video: true` when the description reserves a video track for screen sharing.
 */

export async function GET(request: NextRequest) {
    try {
        const user = await requireSocialUser();
        await assertBurst(`calls:poll:${user.email}`, 4, 12, 1_500);
        const params = request.nextUrl.searchParams;
        const have = Number(params.get("have"));
        return socialJson(await readCall(user, params.get("id"), Number.isFinite(have) ? have : 0));
    } catch (error) {
        return callErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireSocialUser();
        // An offer or answer is a few kilobytes; a batch of candidates far less.
        const body = await readBody(request, 64_000);
        switch (body.action) {
            case "start":
                await assertRateLimit(`calls:start:${user.email}`, 10);
                await assertRateLimit(`calls:start-hour:${user.email}`, 60, 3_600_000);
                return socialJson(await startCall(user, body), 201);
            case "answer":
                await assertRateLimit(`calls:state:${user.email}`, 40);
                return socialJson(await answerCall(user, body));
            case "decline":
                await assertRateLimit(`calls:state:${user.email}`, 40);
                return socialJson(await declineCall(user, body));
            case "end":
                await assertRateLimit(`calls:state:${user.email}`, 40);
                return socialJson(await deleteCall(user.email, body.callId));
            case "mute":
                await assertBurst(`calls:mute:${user.email}`, 2, 10, 600);
                return socialJson(await setCallMuted(user, body));
            case "share":
                await assertBurst(`calls:share:${user.email}`, 2, 10, 600);
                return socialJson(await setCallSharing(user, body));
            case "candidates":
                await assertBurst(`calls:ice:${user.email}`, 5, 20, 1_500);
                return socialJson(await addCandidates(user, body));
            default:
                throw new SocialApiError(400, "invalid_request", "Geçersiz işlem.");
        }
    } catch (error) {
        return callErrorResponse(error);
    }
}
