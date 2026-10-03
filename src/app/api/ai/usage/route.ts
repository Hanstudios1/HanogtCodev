import { NextResponse, after } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { aiUsageFor } from "@/lib/server/ai-usage";
import { refreshSubscriptionFromPaddle } from "@/lib/server/paddle-sync";
import { getSubscription } from "@/lib/server/plans";
import { memoryRateLimit } from "@/lib/server/rate-limit";
import { jsonSecurityHeaders } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A Paddle check now and then (6 s at most) on top of a few database reads.
export const maxDuration = 20;

function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders({ "Cache-Control": "no-store", ...headers }) });
}

/**
 * GET /api/ai/usage → AiUsage (src/lib/ai/usage.ts): the signed-in person's
 * plan and Hanogt AI windows (messages today and this minute, a staff grant,
 * their own connections' allowance). The Hanogt AI usage meter reads it when
 * it opens and when the tab comes back; every /api/ai answer then updates it
 * from its headers. A purchase Paddle never reported is looked up here too
 * (throttled), so someone who pays and comes straight to Hanogt AI sees the
 * new plan. Only reads: no database write per request, a per-instance guard.
 */
export async function GET() {
    const active = await getActiveSession();
    if (!active) return json({ error: "Giriş yapın.", code: "auth_required" }, 401);
    const rate = memoryRateLimit(`ai-usage:${active.email}`, 30, 60_000);
    if (!rate.allowed) return json({ error: "Çok sık istendi.", code: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
    try {
        const stored = await getSubscription(active.email);
        const subscription = await refreshSubscriptionFromPaddle(active.email, stored, { onLate: (work) => after(() => work.then(() => undefined, () => undefined)) });
        return json(await aiUsageFor(active.email, subscription));
    } catch {
        return json({ error: "Kullanım bilgisi şu anda okunamadı.", code: "unavailable" }, 503);
    }
}
