import { NextRequest, NextResponse } from "next/server";
import { createFirebaseCustomToken, getFirebaseProjectId, getServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonSecurityHeaders } from "@/lib/server/request-security";

export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail?: string };

// Each report touches Firestore, so identical requests reuse a recent result.
let cached: { at: number; host: string; body: Record<string, unknown> } | null = null;
const CACHE_MS = 30_000;

async function check(task: () => Promise<string | void>): Promise<Check> {
    try {
        const detail = await task();
        return detail ? { ok: true, detail } : { ok: true };
    } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message.slice(0, 200) : "unknown error" };
    }
}

function hostOf(value: string | undefined) {
    if (!value) return null;
    try {
        return new URL(value).host;
    } catch {
        return "invalid";
    }
}

/**
 * Sign-in diagnostics without secrets: which settings exist and whether the
 * services login depends on (session secret, Google, Firestore, Firebase
 * tokens) actually answer from this deployment. Opened in a browser when
 * "login fails" needs a precise cause.
 */
export async function GET(request: NextRequest) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    if (cached && cached.host === host && Date.now() - cached.at < CACHE_MS) {
        return NextResponse.json(cached.body, { headers: jsonSecurityHeaders() });
    }

    const nextAuthHost = hostOf(process.env.NEXTAUTH_URL);
    const credentials = await check(async () => getFirebaseProjectId());
    const firestore = credentials.ok ? await check(async () => { await getServerDocument("security_health/ping"); }) : { ok: false, detail: "skipped" };
    const rateLimit = credentials.ok
        ? await check(async () => { await enforceRateLimit("health-check", 1_000_000, 60_000); })
        : { ok: false, detail: "skipped" };
    const customToken = credentials.ok
        ? await check(async () => { await createFirebaseCustomToken("health-check@hanogtcodev.invalid"); })
        : { ok: false, detail: "skipped" };

    const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
    const clientConfigured = Boolean(
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY
        && process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
        && clientProjectId
        && process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    );
    const serverProjectId = credentials.ok ? credentials.detail ?? null : null;
    const secret = Boolean(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET);
    const google = { clientId: Boolean(process.env.GOOGLE_CLIENT_ID), clientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET) };

    const problems: string[] = [];
    if (!secret) problems.push("NEXTAUTH_SECRET is missing");
    if (nextAuthHost === "invalid") problems.push("NEXTAUTH_URL is not a valid URL");
    else if (nextAuthHost && nextAuthHost !== host) problems.push(`NEXTAUTH_URL points to ${nextAuthHost}, but this request came to ${host}`);
    if (!google.clientId || !google.clientSecret) problems.push("Google client ID/secret missing");
    if (!credentials.ok) problems.push(`Firebase server credentials: ${credentials.detail}`);
    else {
        if (!firestore.ok) problems.push(`Firestore read failed: ${firestore.detail}`);
        if (!rateLimit.ok) problems.push(`Rate-limit store failed: ${rateLimit.detail}`);
        if (!customToken.ok) problems.push(`Firebase custom token failed: ${customToken.detail}`);
    }
    if (!clientConfigured) problems.push("NEXT_PUBLIC_FIREBASE_* client settings missing");
    else if (serverProjectId && clientProjectId !== serverProjectId) problems.push(`Firebase project mismatch: client ${clientProjectId}, server ${serverProjectId}`);

    const body = {
        ok: problems.length === 0,
        problems,
        checkedAt: new Date().toISOString(),
        deployment: {
            env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
            commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        },
        host,
        nextAuth: { secret, urlHost: nextAuthHost },
        google,
        firebaseServer: { credentials: credentials.ok, projectId: serverProjectId, firestore, rateLimit, customToken },
        firebaseClient: { configured: clientConfigured, projectId: clientProjectId },
    };
    cached = { at: Date.now(), host, body };
    return NextResponse.json(body, { headers: jsonSecurityHeaders() });
}
