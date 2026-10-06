import { NextResponse, type NextRequest } from "next/server";
import { burstLimit } from "@/lib/server/burst-limit";
import { VoiceApiError, exchangeVoiceSignals, heartbeatVoice, joinVoice, leaveVoice, readVoiceRoom } from "@/lib/server/group-voice";
import { jsonSecurityHeaders } from "@/lib/server/request-security";
import { GroupApiError, assertRateLimit, assertSameOrigin, groupErrorResponse, groupJson, readJsonBody, requireGroupUser } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Group voice channels (lib/server/group-voice.ts): who is in a group's
 * channel and the WebRTC signalling between them. Audio never passes here.
 *   GET  ?groupId=&tab=   the channel (and this tab's waiting signals while it is in it)
 *   POST { action: "join" | "heartbeat" | "leave", groupId, tab, muted?, deafened? }
 *        { action: "signal", groupId, tab, signals?: [{ to, kind, data }], ack?: [signal ids] }
 */

function voiceErrorResponse(error: unknown) {
    if (error instanceof VoiceApiError) {
        return NextResponse.json({ ...error.extra, error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders() });
    }
    return groupErrorResponse(error);
}

/** Per-user limit for requests a joined tab makes every second or two. */
async function assertBurst(key: string, perSecond: number, size: number, sampledPerHour: number) {
    const result = await burstLimit(key, perSecond, size, sampledPerHour);
    if (!result.allowed) throw new GroupApiError(429, "rate_limited", "Çok fazla istek. Biraz sonra tekrar deneyin.", {}, { "Retry-After": String(result.retryAfterSeconds) });
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireGroupUser();
        await assertBurst(`voice:poll:${user.email}`, 3, 10, 2_400);
        const params = request.nextUrl.searchParams;
        return groupJson(await readVoiceRoom(params.get("groupId"), user.email, params.get("tab")));
    } catch (error) {
        return voiceErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireGroupUser();
        // A batch of offers or candidates is a few kilobytes each.
        const body = await readJsonBody(request, 220_000);
        switch (body.action) {
            case "join":
                await assertRateLimit(`voice:join:${user.email}`, 20, 60_000);
                return groupJson(await joinVoice(body.groupId, user.email, body));
            case "heartbeat":
                await assertBurst(`voice:beat:${user.email}`, 1, 6, 900);
                return groupJson(await heartbeatVoice(body.groupId, user.email, body));
            case "leave":
                await assertBurst(`voice:leave:${user.email}`, 2, 8, 600);
                return groupJson(await leaveVoice(body.groupId, user.email, body));
            case "signal":
                await assertBurst(`voice:signal:${user.email}`, 6, 30, 3_000);
                return groupJson(await exchangeVoiceSignals(body.groupId, user.email, body));
            default:
                throw new GroupApiError(400, "invalid_request", "Geçersiz işlem.");
        }
    } catch (error) {
        return voiceErrorResponse(error);
    }
}
