import { listIncomingCalls } from "@/lib/server/calls";
import { requireSocialUser, socialJson } from "@/lib/social/server";
import { assertBurst, callErrorResponse } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Calls ringing for the signed-in user, with the caller's name card. Browsers
 * without the Firebase bridge poll this (every few seconds while the tab is
 * visible); with the bridge, a realtime listener on calls/ does the same.
 */
export async function GET() {
    try {
        const user = await requireSocialUser();
        // Polled on every page by browsers without the bridge: the shared limiter is consulted rarely.
        await assertBurst(`calls:incoming:${user.email}`, 1, 6, 300, 30_000);
        return socialJson(await listIncomingCalls(user));
    } catch (error) {
        return callErrorResponse(error);
    }
}
