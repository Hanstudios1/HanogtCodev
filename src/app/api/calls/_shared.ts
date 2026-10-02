import "server-only";

import { NextResponse } from "next/server";
import { burstLimit } from "@/lib/server/burst-limit";
import { CallApiError } from "@/lib/server/calls";
import { jsonSecurityHeaders } from "@/lib/server/request-security";
import { SocialApiError, socialErrorResponse } from "@/lib/social/server";

export function callErrorResponse(error: unknown) {
    if (error instanceof CallApiError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders() });
    }
    return socialErrorResponse(error, "calls");
}

/** Per-user limit for endpoints polled every second or two (see burstLimit). */
export async function assertBurst(key: string, perSecond: number, size: number, sampledPerHour: number, sampleEveryMs?: number) {
    const result = await burstLimit(key, perSecond, size, sampledPerHour, sampleEveryMs);
    if (!result.allowed) {
        throw new SocialApiError(429, "rate_limited", "Çok fazla istek. Biraz sonra tekrar deneyin.", { "Retry-After": String(result.retryAfterSeconds) });
    }
}
