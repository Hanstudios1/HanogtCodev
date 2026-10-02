import { NextResponse, type NextRequest } from "next/server";
import { isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { PaddleApiError, getPaddleConfig, handlePaddleEvent, ipInCidrs, paddleWebhookCidrs, recordWebhookRejection, verifyPaddleSignature, type PaddleEvent } from "@/lib/server/paddle";
import { clientIpFromHeaders, jsonSecurityHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paddle notifications are a few kilobytes; anything far larger isn't one. */
const MAX_BYTES = 512 * 1024;

function json(payload: unknown, status = 200) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders({ "X-Robots-Tag": "noindex, nofollow" }) });
}

/**
 * POST /api/paddle/webhook — Paddle > Developer tools > Notifications sends
 * subscription and transaction events here. Only deliveries from Paddle's
 * published addresses ({api}/ips) with a valid signature are processed; any
 * other status than 2xx makes Paddle retry later.
 */
export async function POST(request: NextRequest) {
    const config = getPaddleConfig();
    if (!config.webhookSecret || !config.apiKey || !isFirebaseServerConfigured()) return json({ error: "not_configured" }, 503);

    let cidrs: string[];
    try {
        cidrs = await paddleWebhookCidrs(config);
    } catch (error) {
        // Without the list nothing can be checked: refuse, Paddle retries later.
        console.error("[paddle:webhook] ip list", error instanceof PaddleApiError ? `${error.status || "network"} ${error.code}` : error);
        return json({ error: "retry_later" }, 503);
    }
    if (!ipInCidrs(clientIpFromHeaders(request.headers), cidrs)) {
        await recordWebhookRejection("ip_not_allowed");
        return json({ error: "forbidden" }, 403);
    }
    const declared = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declared) && declared > MAX_BYTES) return json({ error: "payload_too_large" }, 413);
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return json({ error: "payload_too_large" }, 413);

    const signature = verifyPaddleSignature(raw, request.headers.get("paddle-signature"), config.webhookSecret);
    if (!signature.ok) {
        await recordWebhookRejection(`signature_${signature.reason}`);
        return json({ error: "invalid_signature", reason: signature.reason }, 401);
    }

    let event: PaddleEvent;
    try {
        event = JSON.parse(raw) as PaddleEvent;
    } catch {
        return json({ error: "invalid_json" }, 400);
    }
    if (!event || typeof event !== "object") return json({ error: "invalid_json" }, 400);

    try {
        const result = await handlePaddleEvent(event);
        return json({ ok: true, result });
    } catch (error) {
        const detail = error instanceof PaddleApiError ? `${error.status || "network"} ${error.code}` : error instanceof Error ? error.message : "failed";
        console.error("[paddle:webhook]", typeof event.event_type === "string" ? event.event_type : "?", detail);
        return json({ error: "retry_later" }, 500);
    }
}

export function GET() {
    return json({ error: "method_not_allowed" }, 405);
}
