import { NextRequest } from "next/server";
import { getClientKey } from "@/lib/server/request-security";
import { joinLinkPreview, joinWithLink } from "../_join";
import {
    assertRateLimit,
    assertSameOrigin,
    groupErrorResponse,
    groupJson,
    readJsonBody,
    readToken,
    requireGroupUser,
} from "../_shared";

/*
 * Invite links (lib: ../_join.ts):
 *   GET  ?token=…   what the invitation page shows (the group, its rules, whether you can join)
 *   POST { token, acceptRules?, rulesVersion? }   joins; acceptRules: true also accepts the rules shown
 */

export async function GET(request: NextRequest) {
    try {
        const user = await requireGroupUser();
        await assertRateLimit(`groups:join-preview:${user.email}`, 30, 60_000);
        await assertRateLimit(`groups:join-preview-ip:${getClientKey(request)}`, 90, 60_000);
        const token = readToken(request.nextUrl.searchParams.get("token"));
        return groupJson({ preview: await joinLinkPreview(user, token) });
    } catch (error) {
        return groupErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireGroupUser();
        await assertRateLimit(`groups:join:${user.email}`, 10, 10 * 60_000);
        await assertRateLimit(`groups:join-ip:${getClientKey(request)}`, 40, 10 * 60_000);
        const body = await readJsonBody(request, 2048);
        const token = readToken(body.token);
        return groupJson(await joinWithLink(user, token, { acceptRules: body.acceptRules, rulesVersion: body.rulesVersion }));
    } catch (error) {
        return groupErrorResponse(error);
    }
}
