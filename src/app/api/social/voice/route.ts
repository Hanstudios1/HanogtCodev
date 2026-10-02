import { NextResponse, type NextRequest } from "next/server";
import { burstLimit } from "@/lib/server/burst-limit";
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
 *   GET  ?with=<e-mail>|group=<id>&message=<id>   streams the recording
 * Same-origin, so the page's media-src 'self' covers playback.
 */

function voiceErrorResponse(error: unknown) {
    if (error instanceof VoiceApiError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders() });
    }
    return socialErrorResponse(error, "social/voice");
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
        return socialJson({ success: true, message: sent.message }, 201);
    } catch (error) {
        return voiceErrorResponse(error);
    }
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireSocialUser();
        const limit = await burstLimit(`social:voice-read:${user.email}`, 3, 20, 1_500);
        if (!limit.allowed) throw new SocialApiError(429, "rate_limited", "Çok fazla istek. Biraz sonra tekrar deneyin.", { "Retry-After": String(limit.retryAfterSeconds) });
        const params = request.nextUrl.searchParams;
        const target = readVoiceTarget(params, user.email);
        const { response, contentType } = await openVoiceMessage(user, target, params.get("message"), request.headers.get("range"));
        const headers = new Headers({
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=600",
            "Accept-Ranges": "bytes",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            // Stored files are audio only (checked on upload); this keeps it so if one is opened directly.
            "Content-Security-Policy": "default-src 'none'; sandbox",
        });
        // fetch() decodes a compressed body, so its length is only passed on for plain ones.
        for (const name of response.headers.has("content-encoding") ? ["content-range"] : ["content-length", "content-range"]) {
            const value = response.headers.get(name);
            if (value) headers.set(name, value);
        }
        return new Response(response.body, { status: response.status === 206 ? 206 : 200, headers });
    } catch (error) {
        return voiceErrorResponse(error);
    }
}
