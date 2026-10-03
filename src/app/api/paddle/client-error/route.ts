import { NextResponse, type NextRequest } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { browserLabel, normalizeClientErrorReport, recordPaddleClientError } from "@/lib/server/paddle";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";
import { billingError, billingJson } from "../_shared";

export const runtime = "nodejs";

/** Reports per account and hour: enough for every stage of a few attempts, too few to flood the list. */
const REPORTS_PER_HOUR = 10;

/**
 * POST /api/paddle/client-error { stage, message, blockedUrl?, code? }: the
 * Plans page reports why Paddle.js couldn't take someone through a checkout
 * (script blocked, Paddle.js missing or failing to start or open, or an error
 * event from Paddle's checkout). The newest ten land in
 * site_config/paddle_status.clientErrors for Admin › Subscriptions with the
 * browser's name and the environment, but nothing about who sent them.
 * The page doesn't wait for the answer.
 */
export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return billingError(403, "forbidden_origin");
    // Nowhere to keep it; not worth a log line either.
    if (!isFirebaseServerConfigured()) return billingError(503, "unavailable");
    const active = await getActiveSession();
    if (!active) return billingError(401, "unauthorized");
    const rate = await enforceRateLimitWithFallback(`paddle-client-error:${active.email}`, REPORTS_PER_HOUR, 60 * 60_000);
    if (!rate.allowed) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: jsonSecurityHeaders({ "Retry-After": String(rate.retryAfterSeconds) }) });
    }
    const report = normalizeClientErrorReport(await readJsonBody(request, 4_000));
    if (!report) return billingError(400, "invalid_request");
    try {
        await recordPaddleClientError({ ...report, browser: browserLabel(request.headers.get("user-agent")) });
        return billingJson({ ok: true });
    } catch (error) {
        console.error("[paddle:client-error]", error instanceof Error ? error.message : error);
        return billingError(503, "unavailable");
    }
}
