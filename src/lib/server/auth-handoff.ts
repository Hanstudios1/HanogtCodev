import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { AUTH_HANDOFF_COOKIE, AUTH_HANDOFF_NONCE } from "@/lib/auth-client";
import { readStepUpClaim, type StepUpClaim } from "@/lib/step-up";

/**
 * Session hand-off between our own domains.
 *
 * Google only returns to the host in NEXTAUTH_URL (e.g. hanogtcodev.vercel.app),
 * so people who started on www.hanogtcodev.com used to finish signed in on the
 * other host and looked signed out when they came back. After the Google step
 * the auth host now issues a short-lived signed token that only the original
 * site can redeem, and only in the browser that started the sign-in (the token
 * carries a nonce that must match a cookie set there). The token also carries
 * what the sign-in proved (src/lib/step-up.ts): a step-up still pending on the
 * auth host stays pending on the other site, so the hand-off can't skip it.
 */

const TOKEN_TTL_SECONDS = 120;

export type HandoffUser = { email: string; name: string | null; picture: string | null; id: string };
/** The session token's sign-in fields, carried over to the other site. */
export type HandoffClaims = { authTime: number; provider: string; authVersion: number; stepUp: StepUpClaim | null };
type HandoffPayload = { v: 1; aud: string; nonce: string; next: string; user: HandoffUser; claims: HandoffClaims; exp: number };

function signingKey() {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("NEXTAUTH_SECRET is not configured");
    return createHmac("sha256", secret).update("hanogt:auth-handoff:v1").digest();
}

function originOf(value: string) {
    try {
        const url = new URL(value.includes("://") ? value : `https://${value}`);
        const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
        return url;
    } catch {
        return null;
    }
}

/** Our own sites: NEXTAUTH_URL, the public site (apex and www) and AUTH_HANDOFF_ORIGINS. */
export function allowedHandoffOrigins() {
    const origins = new Set<string>();
    const add = (value: string | undefined, withTwin: boolean) => {
        const url = value ? originOf(value.trim()) : null;
        if (!url) return;
        origins.add(url.origin);
        if (withTwin && !url.hostname.endsWith(".vercel.app") && url.hostname.includes(".")) {
            const twin = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
            origins.add(`${url.protocol}//${twin}${url.port ? `:${url.port}` : ""}`);
        }
    };
    add(process.env.NEXTAUTH_URL, true);
    add(process.env.NEXT_PUBLIC_SITE_URL || "https://hanogtcodev.com", true);
    for (const entry of (process.env.AUTH_HANDOFF_ORIGINS || "").split(",")) add(entry, false);
    return origins;
}

/** Origin of this request as the browser sees it. */
export function requestOrigin(request: NextRequest) {
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || request.nextUrl.host;
    const protocol = (request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
    return `${protocol === "http" ? "http" : "https"}://${host}`;
}

export function signHandoff(payload: Omit<HandoffPayload, "v" | "exp">) {
    const body = Buffer.from(JSON.stringify({ v: 1, ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })).toString("base64url");
    const signature = createHmac("sha256", signingKey()).update(body).digest("base64url");
    return `${body}.${signature}`;
}

function sameText(left: string, right: string) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}

/** Returns the payload when the token is authentic, unexpired, meant for `audience` and bound to `nonce`. */
export function verifyHandoff(token: string, audience: string, nonce: string): HandoffPayload | null {
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra !== undefined || !AUTH_HANDOFF_NONCE.test(nonce)) return null;
    const expected = createHmac("sha256", signingKey()).update(body).digest("base64url");
    if (!sameText(signature, expected)) return null;
    let payload: HandoffPayload;
    try {
        payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HandoffPayload;
    } catch {
        return null;
    }
    if (payload?.v !== 1 || typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    if (payload.aud !== audience || typeof payload.nonce !== "string" || !sameText(payload.nonce, nonce)) return null;
    if (typeof payload.next !== "string" || !/^\/(?![/\\])/.test(payload.next) || /[\u0000-\u001f\u007f\\]/.test(payload.next)) return null;
    if (!payload.user || typeof payload.user.email !== "string" || !payload.user.email.includes("@")) return null;
    // Without the sign-in fields a hand-off could drop a pending step-up: refused.
    const claims = payload.claims as Partial<HandoffClaims> | undefined;
    if (!claims || typeof claims.authTime !== "number" || typeof claims.provider !== "string" || typeof claims.authVersion !== "number") return null;
    if (claims.stepUp !== null && !readStepUpClaim(claims.stepUp)) return null;
    return payload;
}

export { AUTH_HANDOFF_COOKIE };
