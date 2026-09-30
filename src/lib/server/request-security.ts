import "server-only";

import type { NextRequest } from "next/server";

type HeaderSource = { get(name: string): string | null } | Record<string, unknown> | undefined | null;

function header(headers: HeaderSource, name: string) {
    if (!headers) return "";
    if (typeof (headers as { get?: unknown }).get === "function") return (headers as { get(name: string): string | null }).get(name) || "";
    const value = (headers as Record<string, unknown>)[name];
    return Array.isArray(value) ? String(value[0] ?? "") : typeof value === "string" ? value : "";
}

/**
 * Best-effort client IP for rate limiting. Platform headers set by the edge
 * (Vercel, Cloudflare, nginx's x-real-ip) are preferred over the first hop of
 * x-forwarded-for, which a client can prepend itself on other hosts.
 */
export function clientIpFromHeaders(headers: HeaderSource) {
    const candidates = [
        header(headers, "x-vercel-forwarded-for").split(",")[0],
        header(headers, "cf-connecting-ip"),
        header(headers, "x-real-ip"),
        header(headers, "x-forwarded-for").split(",")[0],
    ];
    for (const candidate of candidates) {
        const value = candidate?.trim();
        if (value && value.length <= 64 && /^[0-9A-Fa-f:.]+$/.test(value)) return value;
    }
    return "unknown";
}

export function getClientKey(request: NextRequest) {
    return clientIpFromHeaders(request.headers);
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
