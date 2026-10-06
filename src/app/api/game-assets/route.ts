import { after, NextRequest } from "next/server";
import { GameAssetError, listGameAudio, uploadGameAudio } from "@/lib/server/game-assets";
import { readLimitedBody } from "@/lib/server/social-voice";
import { GAME_AUDIO_MAX_BYTES } from "@/lib/plans";
import { apiJson, authorizeGameRequest, rateHeaders } from "../game-projects/_shared";
import { assetError } from "./_shared";

export const runtime = "nodejs";

/** The signed-in account's uploaded game audio and models, and its plan's storage for them. */
export async function GET(request: NextRequest) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: false, bucket: "read" });
        return apiJson(await listGameAudio(email), 200, rateHeaders(rate));
    } catch (error) {
        return assetError(error, "Dosyalar yüklenemedi.");
    }
}

/** Uploads one audio file or GLB model (the raw bytes; the name in ?name=). */
export async function POST(request: NextRequest) {
    try {
        const { email, rate } = await authorizeGameRequest(request, { mutation: true, bucket: "write" });
        const name = request.nextUrl.searchParams.get("name") ?? "";
        const declared = Number(request.headers.get("content-length") || 0);
        let bytes: Uint8Array;
        try {
            bytes = await readLimitedBody(request.body, GAME_AUDIO_MAX_BYTES, Number.isFinite(declared) ? declared : 0);
        } catch {
            throw new GameAssetError(413, "too_large", `Ses ve model dosyaları en fazla ${Math.round(GAME_AUDIO_MAX_BYTES / 1024)} KB olabilir.`);
        }
        const uploaded = await uploadGameAudio(email, bytes, name, { onLate: (work) => after(work) });
        return apiJson(uploaded, uploaded.duplicate ? 200 : 201, rateHeaders(rate));
    } catch (error) {
        return assetError(error, "Dosya yüklenemedi.");
    }
}
