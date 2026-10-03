import type { NextRequest } from "next/server";
import { API_MODEL_ID } from "@/lib/ai/api-keys";
import { apiModel } from "@/lib/server/hanogt-ai-api";
import { apiError, apiJson, callerOf } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/models/hanogt-ai: the model (OpenAI's models.retrieve). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ model: string }> }) {
    const { caller, refusal } = await callerOf(request);
    if (!caller) return refusal;
    const { model } = await params;
    if (model !== API_MODEL_ID) return apiError({ status: 404, code: "model_not_found", message: `The model "${model.slice(0, 60)}" doesn't exist. Use "${API_MODEL_ID}".`, param: "model" });
    return apiJson(apiModel());
}
