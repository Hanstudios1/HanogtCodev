import { NextResponse, after, type NextRequest } from "next/server";
import type { BillingErrorCode } from "@/lib/paddle";
import { getActiveSessionState } from "@/lib/server/active-session";
import { getStaffSession } from "@/lib/server/admin";
import { isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { billingAnswer, describeBillingFailure, getPaddleConfig, isBillingTester, isPaddleConfigured, recordPaddleServerError } from "@/lib/server/paddle";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export function billingJson(payload: unknown, status = 200) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders() });
}

export function billingError(status: number, error: BillingErrorCode, extra: Record<string, unknown> = {}) {
    return billingJson({ error, ...extra }, status);
}

/**
 * The answer of a billing route that failed: Paddle refused or couldn't be
 * reached (424 paddle_error), or our side failed (500 unavailable, code
 * database_error or internal_error). Not 502/504: Cloudflare replaces those
 * with its own page, and the reason with them. It names the step (billingStep) and how
 * long the request ran, so the Plans page can tell people more than "try
 * again"; the team (staff, testers, anyone in the sandbox) also gets the
 * detail. The failure is logged and kept for Admin › Subscriptions.
 */
export async function billingFailure(error: unknown, context: { route: string; email: string; startedAt: number }) {
    // A declined card or a customer that can't be linked is an answer for the person, not a failure.
    const answer = billingAnswer(error);
    if (answer) return billingError(answer.status, answer.error);
    const failure = describeBillingFailure(error);
    const ms = Date.now() - context.startedAt;
    console.error(`[paddle:${context.route}]`, failure.step ?? "-", failure.paddleStatus ?? failure.status, failure.code, `${ms}ms`, failure.detail);
    after(() => recordPaddleServerError({ route: context.route, step: failure.step, status: failure.status, paddleStatus: failure.paddleStatus, code: failure.code, detail: failure.detail, ms })
        .catch((recordError: unknown) => console.error("[paddle:server-error]", recordError instanceof Error ? recordError.message : recordError)));
    const reveal = getPaddleConfig().environment === "sandbox" || isBillingTester(context.email, Boolean(await getStaffSession().catch(() => null)));
    return billingError(failure.status, failure.error, {
        code: failure.code,
        step: failure.step,
        ...(failure.paddleStatus === null ? {} : { paddleStatus: failure.paddleStatus }),
        ms,
        ...(reveal && failure.detail ? { detail: failure.detail } : {}),
    });
}

/**
 * Common checks for the signed-in billing routes: same origin, Paddle and
 * the database configured, an active account (503 when the database can't
 * tell) and a per-account rate limit.
 */
export async function billingGuard(request: NextRequest, bucket: string, limit: number) {
    if (!isSameOrigin(request)) return { ok: false as const, response: billingError(403, "forbidden_origin") };
    if (!isFirebaseServerConfigured() || !isPaddleConfigured(getPaddleConfig())) return { ok: false as const, response: billingError(503, "billing_unavailable") };
    const session = await getActiveSessionState();
    // The database didn't answer: not a sign-out (the Plans page keeps following a payment on 503).
    if (session.state === "error") return { ok: false as const, response: billingError(503, "unavailable", { code: "database_error" }) };
    if (session.state === "none") return { ok: false as const, response: billingError(401, "unauthorized") };
    const { active } = session;
    const rate = await enforceRateLimitWithFallback(`paddle-${bucket}:${active.email}`, limit, 60_000);
    if (!rate.allowed) return { ok: false as const, response: billingError(429, "rate_limited") };
    return { ok: true as const, email: active.email, user: active.user };
}
