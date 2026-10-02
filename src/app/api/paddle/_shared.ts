import { NextResponse, type NextRequest } from "next/server";
import type { BillingErrorCode } from "@/lib/paddle";
import { getActiveSession } from "@/lib/server/active-session";
import { isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { PaddleApiError, getPaddleConfig, isPaddleConfigured } from "@/lib/server/paddle";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export function billingJson(payload: unknown, status = 200) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders() });
}

export function billingError(status: number, error: BillingErrorCode, extra: Record<string, unknown> = {}) {
    return billingJson({ error, ...extra }, status);
}

/** Paddle refused or couldn't be reached; the code helps support without exposing anything secret. */
export function paddleFailure(error: unknown, context: string) {
    if (error instanceof PaddleApiError) {
        console.error(`[paddle:${context}]`, error.status || "network", error.code);
        return billingError(502, "paddle_error", { code: error.code });
    }
    console.error(`[paddle:${context}]`, error instanceof Error ? error.message : error);
    return billingError(503, "unavailable");
}

/**
 * Common checks for the signed-in billing routes: same origin, Paddle and
 * the database configured, an active account and a per-account rate limit.
 */
export async function billingGuard(request: NextRequest, bucket: string, limit: number) {
    if (!isSameOrigin(request)) return { ok: false as const, response: billingError(403, "forbidden_origin") };
    if (!isFirebaseServerConfigured() || !isPaddleConfigured(getPaddleConfig())) return { ok: false as const, response: billingError(503, "billing_unavailable") };
    const active = await getActiveSession();
    if (!active) return { ok: false as const, response: billingError(401, "unauthorized") };
    const rate = await enforceRateLimitWithFallback(`paddle-${bucket}:${active.email}`, limit, 60_000);
    if (!rate.allowed) return { ok: false as const, response: billingError(429, "rate_limited") };
    return { ok: true as const, email: active.email };
}
