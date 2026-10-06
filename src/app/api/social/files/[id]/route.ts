import { NextResponse, type NextRequest } from "next/server";
import { burstLimit } from "@/lib/server/burst-limit";
import { FileApiError, openMessageFile } from "@/lib/server/message-files";
import { jsonSecurityHeaders } from "@/lib/server/request-security";
import { SocialApiError, requireSocialUser, socialErrorResponse } from "@/lib/social/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * A file of a Hanogt Social message, for people who can see the message
 * (lib/server/message-files.ts). Pictures, video and sound open in the page
 * (one byte range on request, so players can seek); everything else, and
 * anything asked for with ?download=1, is a download. Nothing is ever run:
 * the type comes from the file's bytes, `nosniff` keeps it, and the page's
 * own policy is a sandbox without scripts.
 */

/** Content-Disposition with an ASCII fallback and the real (UTF-8) name for current browsers. */
function disposition(kind: "inline" | "attachment", name: string) {
    const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]/g, "_") || "dosya";
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const user = await requireSocialUser();
        const limit = await burstLimit(`social:file-read:${user.email}`, 4, 30, 2_400);
        if (!limit.allowed) throw new SocialApiError(429, "rate_limited", "Çok fazla istek. Biraz sonra tekrar deneyin.", { "Retry-After": String(limit.retryAfterSeconds) });
        const opened = await openMessageFile(user.email, id, request.headers.get("range"));
        const { attachment } = opened;
        const playable = attachment.kind === "image" || attachment.kind === "video" || attachment.kind === "audio";
        const inline = playable && request.nextUrl.searchParams.get("download") !== "1";
        const headers = new Headers({
            "Content-Type": attachment.contentType,
            "Content-Length": String(opened.body.byteLength),
            "Content-Disposition": disposition(inline ? "inline" : "attachment", attachment.name),
            // A file never changes; who may see it can (the reader's copy stays private to the browser).
            "Cache-Control": "private, max-age=3600",
            "Accept-Ranges": "bytes",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
            "Cross-Origin-Resource-Policy": "same-origin",
        });
        if (opened.contentRange) headers.set("Content-Range", opened.contentRange);
        return new Response(opened.status === 416 ? null : opened.body, { status: opened.status, headers });
    } catch (error) {
        if (error instanceof FileApiError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders() });
        }
        return socialErrorResponse(error, "social/files");
    }
}
