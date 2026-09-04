import "server-only";

import type { NextRequest } from "next/server";

export function getClientKey(request: NextRequest) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function isSameOrigin(request: NextRequest) {
    const origin = request.headers.get("origin");
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto") || (request.nextUrl.protocol.replace(":", ""));
    if (origin && forwardedHost) {
        try {
            const parsed = new URL(origin);
            return parsed.host === forwardedHost && parsed.protocol === `${protocol}:`;
        } catch {
            return false;
        }
    }
    const fetchSite = request.headers.get("sec-fetch-site");
    return fetchSite === "same-origin" || fetchSite === "same-site";
}

export function jsonSecurityHeaders(extra: Record<string, string> = {}) {
    return {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        ...extra,
    };
}
