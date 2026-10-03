import "server-only";

import type { NextRequest } from "next/server";

type HeaderSource = { get(name: string): string | null } | Record<string, unknown> | undefined | null;

function header(headers: HeaderSource, name: string) {
    if (!headers) return "";
    if (typeof (headers as { get?: unknown }).get === "function") return (headers as { get(name: string): string | null }).get(name) || "";
    const value = (headers as Record<string, unknown>)[name];
    return Array.isArray(value) ? String(value[0] ?? "") : typeof value === "string" ? value : "";
}

// ---------------------------------------------------------------------------
// IP addresses and CIDR blocks (IPv4 and IPv6)
// ---------------------------------------------------------------------------

type ParsedIp = { version: 4 | 6; value: bigint };

function parseIpv4(ip: string): bigint | null {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    let value = BigInt(0);
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
        value = (value << BigInt(8)) + BigInt(Number(part));
    }
    return value;
}

function parseIpv6(ip: string): bigint | null {
    if (!/^[0-9a-f:.]+$/i.test(ip) || ip.length > 45) return null;
    const halves = ip.split("::");
    if (halves.length > 2) return null;
    const words = (part: string) => {
        if (!part) return [] as number[];
        const groups = part.split(":");
        const out: number[] = [];
        for (const [index, group] of groups.entries()) {
            // An embedded IPv4 address ends the address (::ffff:1.2.3.4).
            if (group.includes(".") && index === groups.length - 1) {
                const v4 = parseIpv4(group);
                if (v4 === null) return null;
                out.push(Number(v4 >> BigInt(16)), Number(v4 & BigInt(0xffff)));
                continue;
            }
            if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
            out.push(parseInt(group, 16));
        }
        return out;
    };
    const head = words(halves[0]);
    const tail = halves.length === 2 ? words(halves[1]) : [];
    if (!head || !tail) return null;
    const missing = 8 - head.length - tail.length;
    if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
    let value = BigInt(0);
    for (const word of [...head, ...Array<number>(Math.max(0, missing)).fill(0), ...tail]) value = (value << BigInt(16)) + BigInt(word);
    return value;
}

/** An IPv4 or IPv6 address as a number; IPv4-mapped IPv6 (::ffff:a.b.c.d) counts as IPv4. */
function parseIp(ip: string): ParsedIp | null {
    const text = ip.trim();
    if (!text || text.length > 64) return null;
    const v4 = parseIpv4(text);
    if (v4 !== null) return { version: 4, value: v4 };
    const v6 = parseIpv6(text);
    if (v6 === null) return null;
    if (v6 >> BigInt(32) === BigInt(0xffff)) return { version: 4, value: v6 & BigInt(0xffffffff) };
    return { version: 6, value: v6 };
}

function parseCidr(cidr: string): (ParsedIp & { bits: number }) | null {
    const [address, prefix, extra] = cidr.trim().split("/");
    if (extra !== undefined || !address) return null;
    const ip = parseIp(address);
    const width = ip?.version === 4 ? 32 : 128;
    if (!ip || (prefix !== undefined && !/^\d{1,3}$/.test(prefix))) return null;
    const bits = prefix === undefined ? width : Number(prefix);
    return bits <= width ? { ...ip, bits } : null;
}

/** True for a well-formed IPv4 or IPv6 CIDR block. */
export function isCidr(cidr: unknown) {
    return typeof cidr === "string" && parseCidr(cidr) !== null;
}

/** True when the address is inside one of the blocks (IPv4 or IPv6; an IPv4-mapped IPv6 address counts as IPv4). */
export function ipInCidrs(ip: string | null | undefined, cidrs: readonly string[]) {
    const address = ip ? parseIp(ip) : null;
    if (!address) return false;
    return cidrs.some((cidr) => {
        const block = parseCidr(cidr);
        if (!block || block.version !== address.version) return false;
        const shift = BigInt((address.version === 4 ? 32 : 128) - block.bits);
        return address.value >> shift === block.value >> shift;
    });
}

/**
 * Cloudflare's published address ranges (https://www.cloudflare.com/ips/,
 * last changed 2023-09-28). hanogtcodev.com is served through Cloudflare, so
 * Vercel sees one of these as the client and the visitor's own address
 * arrives in CF-Connecting-IP.
 */
export const CLOUDFLARE_CIDRS: readonly string[] = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

function validIp(value: string | undefined) {
    const text = value?.trim() ?? "";
    return text && text.length <= 64 && /^[0-9A-Fa-f:.]+$/.test(text) && parseIp(text) ? text : "";
}

/**
 * The visitor's IP address, for rate limits and the Paddle webhook's address
 * check. The platform's own headers come first: Vercel's x-vercel-forwarded-for
 * (it overwrites x-forwarded-for), then x-real-ip, then the first hop of
 * x-forwarded-for. When that address is one of Cloudflare's, the request came
 * through Cloudflare and CF-Connecting-IP names the visitor; from anywhere else
 * CF-Connecting-IP is ignored (anyone can send it straight to *.vercel.app).
 */
export function clientIpFromHeaders(headers: HeaderSource) {
    const platform = [
        header(headers, "x-vercel-forwarded-for").split(",")[0],
        header(headers, "x-real-ip"),
        header(headers, "x-forwarded-for").split(",")[0],
    ].map(validIp).find(Boolean);
    if (!platform) return "unknown";
    const visitor = validIp(header(headers, "cf-connecting-ip"));
    return visitor && ipInCidrs(platform, CLOUDFLARE_CIDRS) ? visitor : platform;
}

export function getClientKey(request: NextRequest) {
    return clientIpFromHeaders(request.headers);
}

/**
 * The visitor's country (ISO 3166 alpha-2) for localized prices. Behind
 * Cloudflare, Vercel locates Cloudflare's own address, so its
 * x-vercel-ip-country names the country of a Cloudflare server (often the US,
 * which priced a Turkish visitor in dollars without VAT); Cloudflare's
 * CF-IPCountry names the visitor's. That header is believed only when the
 * request really came through Cloudflare (as in clientIpFromHeaders). XX
 * (unknown) and T1 (Tor) count as unknown.
 */
export function visitorCountryFromHeaders(headers: HeaderSource): string | null {
    const platform = [
        header(headers, "x-vercel-forwarded-for").split(",")[0],
        header(headers, "x-real-ip"),
        header(headers, "x-forwarded-for").split(",")[0],
    ].map(validIp).find(Boolean);
    const viaCloudflare = Boolean(platform && ipInCidrs(platform, CLOUDFLARE_CIDRS));
    const raw = (viaCloudflare ? header(headers, "cf-ipcountry") : header(headers, "x-vercel-ip-country")).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(raw) && raw !== "XX" && raw !== "T1" ? raw : null;
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
