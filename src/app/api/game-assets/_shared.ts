import { GameAssetError } from "@/lib/server/game-assets";
import { apiError, apiJson } from "../game-projects/_shared";

/** JSON error of the asset routes (with the machine-readable code and quota details). */
export function assetError(error: unknown, fallback: string) {
    if (error instanceof GameAssetError) return apiJson({ ...error.extra, code: error.code, error: error.message }, error.status);
    return apiError(error, fallback);
}
