import { NextRequest, NextResponse } from "next/server";
import { assertAudioHash, readGameAudio, releaseGameAudio } from "@/lib/server/game-assets";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, jsonSecurityHeaders } from "@/lib/server/request-security";
import { apiJson, authorizeGameRequest, rateHeaders } from "../../game-projects/_shared";
import { assetError } from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ hash: string }> };

/**
 * The bytes of an audio file. Public: published games load their sounds for
 * anyone, and a file is only reachable by its (unguessable) SHA-256. Files
 * never change, so browsers and CDNs may keep them for a year.
 */
export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const hash = assertAudioHash((await context.params).hash);
        const rate = await enforceRateLimit(`game-assets:read:${getClientKey(request)}`, 240, 60_000);
        if (!rate.allowed) return NextResponse.json({ error: "Çok fazla istek." }, { status: 429, headers: jsonSecurityHeaders({ "Retry-After": String(rate.retryAfterSeconds) }) });
        if (request.headers.get("if-none-match") === `"${hash}"`) {
            return new NextResponse(null, { status: 304, headers: { ETag: `"${hash}"`, "Cache-Control": "public, max-age=31536000, immutable" } });
        }
        const { bytes, contentType } = await readGameAudio(hash);
        return new NextResponse(Buffer.from(bytes), {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(bytes.byteLength),
                "Cache-Control": "public, max-age=31536000, immutable",
                ETag: `"${hash}"`,
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; sandbox",
                "Cross-Origin-Resource-Policy": "same-site",
            },
        });
    } catch (error) {
        return assetError(error, "Ses dosyası yüklenemedi.");
    }
}

/** Removes a file from the signed-in account's library (published games keep their copies). */
export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const result = await releaseGameAudio(email, (await context.params).hash);
        return apiJson(result, 200, rateHeaders(rate));
    } catch (error) {
        return assetError(error, "Ses dosyası silinemedi.");
    }
}
