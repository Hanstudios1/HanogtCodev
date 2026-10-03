import type { NextRequest } from "next/server";
import { apiModel } from "@/lib/server/hanogt-ai-api";
import { apiJson, callerOf } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/models: the one model the API serves (not counted as a request). */
export async function GET(request: NextRequest) {
    const { caller, refusal } = await callerOf(request);
    if (!caller) return refusal;
    return apiJson({ object: "list", data: [apiModel()] });
}
