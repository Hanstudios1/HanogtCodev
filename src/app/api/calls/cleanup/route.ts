import type { NextRequest } from "next/server";
import { deleteCall } from "@/lib/server/calls";
import { SocialApiError, assertRateLimit, assertSameOrigin, requireSocialUser, socialJson } from "@/lib/social/server";
import { callErrorResponse } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deletes a call (participants only) with the candidate subcollections older
 * clients wrote. Same as POST /api/calls { action: "end" }; kept for
 * navigator.sendBeacon when a tab closes mid-call (the body is text/plain
 * JSON) and for tabs still running older code.
 */
export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireSocialUser();
        await assertRateLimit(`call-cleanup:${user.email}`, 120, 60 * 60_000);
        let body: { callId?: unknown } = {};
        try {
            body = JSON.parse((await request.text()).slice(0, 2_000)) as { callId?: unknown };
        } catch {
            throw new SocialApiError(400, "invalid_request", "Geçersiz istek.");
        }
        return socialJson(await deleteCall(user.email, body?.callId));
    } catch (error) {
        return callErrorResponse(error);
    }
}
