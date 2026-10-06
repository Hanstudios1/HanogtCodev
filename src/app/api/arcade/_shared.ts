import { NextResponse, type NextRequest } from "next/server";
import { ArcadeError } from "@/lib/server/arcade-scores";
import { jsonSecurityHeaders } from "@/lib/server/request-security";

/** JSON answer of the Arcade routes (with the security headers). */
export function arcadeJson(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders(headers) });
}

/** An ArcadeError keeps its status, code and wait time; anything else is a 503 with `fallback`. */
export function arcadeFailure(error: unknown, fallback: string) {
    if (error instanceof ArcadeError) {
        return arcadeJson(
            { error: error.message, code: error.code, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) },
            error.status,
            error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {},
        );
    }
    console.warn("[arcade]", error instanceof Error ? error.message : error);
    return arcadeJson({ error: fallback, code: "unavailable" }, 503);
}

export function tooManyRequests(retryAfterSeconds: number) {
    return arcadeJson({ error: "Çok fazla istek. Biraz sonra tekrar deneyin.", code: "rate_limited", retryAfterSeconds }, 429, { "Retry-After": String(retryAfterSeconds) });
}

/** A small JSON object body with only the `allowed` keys. */
export async function readArcadeBody(request: NextRequest, allowed: readonly string[], maxBytes = 2048): Promise<Record<string, unknown>> {
    const declared = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declared) && declared > maxBytes) throw new ArcadeError(413, "too_large", "İstek gövdesi çok büyük.");
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new ArcadeError(413, "too_large", "İstek gövdesi çok büyük.");
    let body: unknown;
    try {
        body = JSON.parse(raw || "{}");
    } catch {
        throw new ArcadeError(400, "invalid_body", "Geçerli bir JSON gövdesi gönderin.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ArcadeError(400, "invalid_body", "JSON gövdesi bir nesne olmalı.");
    const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
    if (unexpected) throw new ArcadeError(400, "invalid_body", `Desteklenmeyen alan: ${unexpected.slice(0, 40)}`);
    return body as Record<string, unknown>;
}
