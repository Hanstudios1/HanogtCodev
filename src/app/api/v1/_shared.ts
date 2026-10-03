import type { NextRequest } from "next/server";
import { apiErrorBody, authenticateApiCaller, type ApiFailure } from "@/lib/server/hanogt-ai-api";
import { getClientKey } from "@/lib/server/request-security";

/*
 * Shared by the /api/v1 routes (the Hanogt AI developer API): answers in
 * OpenAI's shapes, never cached, no CORS headers (keys belong on servers, so
 * browsers on other sites are left to their same-origin policy).
 */

export const API_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

export function apiJson(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return Response.json(payload, { status, headers: { ...API_HEADERS, ...headers } });
}

export function apiError(failure: ApiFailure, headers: Record<string, string> = {}) {
    return apiJson(apiErrorBody(failure), failure.status, { ...failure.headers, ...headers });
}

export const unavailable = (message = "Hanogt AI is unavailable right now. Try again in a moment.") => apiError({ status: 503, code: "service_unavailable", message });

/** The caller of a request, or the answer that refuses it (a failed read is a 503, never a 5xx from Next). */
export async function callerOf(request: NextRequest) {
    try {
        const auth = await authenticateApiCaller(request.headers.get("authorization"), getClientKey(request));
        return auth.ok ? { caller: auth.caller, refusal: null } : { caller: null, refusal: apiError(auth.failure) };
    } catch (error) {
        console.error("[hanogt-ai-api:auth]", error instanceof Error ? error.message : error);
        return { caller: null, refusal: unavailable() };
    }
}
