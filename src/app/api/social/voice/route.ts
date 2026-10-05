import { NextResponse, after, type NextRequest } from "next/server";
import { burstLimit } from "@/lib/server/burst-limit";
import { notifyDirectMessage } from "@/lib/server/social-notify";
import { dmChatId } from "@/lib/social/model";
import { jsonSecurityHeaders } from "@/lib/server/request-security";
import { VOICE_LIMITS, VoiceApiError, openVoiceMessage, readLimitedBody, readVoiceTarget, sendVoiceMessage } from "@/lib/server/social-voice";
import { SocialApiError, assertRateLimit, assertSameOrigin, requireSocialUser, socialErrorResponse, socialJson } from "@/lib/social/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Voice messages of direct conversations and group chats, without the
 * browser's Firebase connection:
 *   POST ?with=<e-mail>|group=<id>&duration=<s>&label=<preview text>
 *        body: the recording itself (Content-Type audio/*, at most 3 MB)
 *   GET  ?with=<e-mail>|group=<id>&message=<id>   serves the recording (one byte range on request)
 * Same-origin, so the page's media-src 'self' covers playback.
 */

/** Why an unexpected failure happened, for the server log (never the recording or the message text). */
function failureReason(error: unknown) {
    if (!(error instanceof Error)) return "unknown error";
    const { reason } = error as Error & { reason?: unknown };
    const cause = error.cause instanceof Error ? ` (cause: ${error.cause.message})` : "";
    return `${error.message}${typeof reason === "string" ? ` [${reason}]` : ""}${cause}`;
}

function voiceErrorResponse(error: unknown, action: "send" | "play") {
    if (error instanceof VoiceApiError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders() });
    }
    if (action === "play" || error instanceof SocialApiError) return socialErrorResponse(error, "social/voice");
    // Firestore, network…: the reason goes to the server log, the browser gets a stable code.
    console.error("[social/voice] sending failed:", failureReason(error));
    return NextResponse.json({ error: "Sesli mesaj gönderilemedi. Lütfen tekrar deneyin.", code: "voice_failed" }, { status: 500, headers: jsonSecurityHeaders() });
}

export async function POST(request: NextRequest) {
    try {
        assertSameOrigin(request);
        const user = await requireSocialUser();
        await assertRateLimit(`social:voice:${user.email}`, 12);
        await assertRateLimit(`social:voice-hour:${user.email}`, 80, 3_600_000);
        const type = (request.headers.get("content-type") || "").toLowerCase();
        if (!type.startsWith("audio/")) throw new VoiceApiError(415, "voice_format", "Bu ses biçimi desteklenmiyor.");
        const params = request.nextUrl.searchParams;
        const target = readVoiceTarget(params, user.email);
        const bytes = await readLimitedBody(request.body, VOICE_LIMITS.maxBytes, Number(request.headers.get("content-length") || 0));
        const sent = await sendVoiceMessage(user, target, { bytes, seconds: params.get("duration"), label: params.get("label") });
        if (target.kind === "dm") after(() => notifyDirectMessage(target.partner, user.email, dmChatId(user.email, target.partner), "🎤 Sesli mesaj"));
        return socialJson({ success: true, message: sent.message }, 201);
    } catch (error) {
        return voiceErrorResponse(error, "send");
    }
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireSocialUser();
        const limit = await burstLimit(`social:voice-read:${user.email}`, 3, 20, 1_500);
        if (!limit.allowed) throw new SocialApiError(429, "rate_limited", "Çok fazla istek. Biraz sonra tekrar deneyin.", { "Retry-After": String(limit.retryAfterSeconds) });
        const params = request.nextUrl.searchParams;
        const target = readVoiceTarget(params, user.email);
        const playback = await openVoiceMessage(user, target, params.get("message"), request.headers.get("range"));
        const headers = new Headers({
            "Content-Type": playback.contentType,
            "Cache-Control": "private, max-age=600",
            "Accept-Ranges": "bytes",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            // Stored recordings are audio only (checked on upload); this keeps it so if one is opened directly.
            "Content-Security-Policy": "default-src 'none'; sandbox",
        });
        if (playback.source === "clip") {
            headers.set("Content-Length", String(playback.body.byteLength));
            if (playback.contentRange) headers.set("Content-Range", playback.contentRange);
            return new Response(playback.status === 416 ? null : playback.body, { status: playback.status, headers });
        }
        // A recording from before voice_clips, streamed from Storage. fetch() decodes a compressed
        // body, so its length is only passed on for plain ones.
        const { response } = playback;
        for (const name of response.headers.has("content-encoding") ? ["content-range"] : ["content-length", "content-range"]) {
            const value = response.headers.get(name);
            if (value) headers.set(name, value);
        }
        return new Response(response.body, { status: playback.status, headers });
    } catch (error) {
        return voiceErrorResponse(error, "play");
    }
}
