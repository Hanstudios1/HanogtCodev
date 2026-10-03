import { NextResponse, type NextRequest } from "next/server";
import { normalizeAiSettings, parseAiSettingsInput, type AiSettingsResponse } from "@/lib/ai/ai-settings";
import { FREE_SUBSCRIPTION, PLAN_AI_FEATURES, effectivePlan } from "@/lib/plans";
import { getActiveSession } from "@/lib/server/active-session";
import { isMissingDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { getSubscription } from "@/lib/server/plans";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Hanogt AI settings of the signed-in account (users/{email}.aiSettings,
 * src/lib/ai/ai-settings.ts). The chat reads them from the user document it
 * already has; browsers can't write the field themselves (firestore.rules).
 * GET → AiSettingsResponse; PUT { settings } saves them (instructions must
 * fit the plan: 500, 1,500 or 3,000 characters).
 */

function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders({ "Cache-Control": "no-store", ...headers }) });
}

const updatedAtOf = (value: unknown) => {
    const time = typeof value === "string" ? Date.parse(value) : value instanceof Date ? value.getTime() : Number.NaN;
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

export async function GET() {
    const active = await getActiveSession();
    if (!active) return json({ error: "Giriş yapın.", code: "unauthorized" }, 401);
    const plan = effectivePlan(await getSubscription(active.email).catch(() => FREE_SUBSCRIPTION));
    const user = active.user as Record<string, unknown>;
    return json({
        settings: normalizeAiSettings(user.aiSettings, plan),
        instructionsLimit: PLAN_AI_FEATURES[plan].instructionsChars,
        plan,
        updatedAt: updatedAtOf(user.aiSettingsUpdatedAt),
    } satisfies AiSettingsResponse);
}

export async function PUT(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ error: "Geçersiz istek kaynağı.", code: "bad_origin" }, 403);
    const active = await getActiveSession();
    if (!active) return json({ error: "Giriş yapın.", code: "unauthorized" }, 401);
    const rate = await enforceRateLimit(`ai-settings:${active.email}`, 20, 60_000).catch(() => null);
    if (!rate) return json({ error: "Ayarlar şu anda kaydedilemiyor.", code: "unavailable" }, 503);
    if (!rate.allowed) return json({ error: "Çok sık kaydedildi.", code: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfterSeconds) });

    const body = await readJsonBody(request, 20_000);
    if (!body || Object.keys(body).some((key) => key !== "settings")) return json({ error: "Geçersiz istek.", code: "invalid_value" }, 400);
    const plan = effectivePlan(await getSubscription(active.email).catch(() => FREE_SUBSCRIPTION));
    const parsed = parseAiSettingsInput(body.settings, plan);
    if (!parsed.ok) return json({ error: "Ayarlar geçersiz.", code: parsed.code, field: parsed.field ?? null, limit: parsed.limit ?? null }, 400);

    const now = new Date();
    try {
        // Only the account's own fields, and only while the account exists (a deleted one never comes back).
        await patchServerDocument(`users/${active.email}`, { aiSettings: parsed.settings, aiSettingsUpdatedAt: now }, { updateFields: ["aiSettings", "aiSettingsUpdatedAt"], exists: true });
    } catch (error) {
        if (isMissingDocument(error)) return json({ error: "Giriş yapın.", code: "unauthorized" }, 401);
        console.error("[ai-settings:put]", error instanceof Error ? error.message : error);
        return json({ error: "Ayarlar şu anda kaydedilemiyor.", code: "unavailable" }, 503);
    }
    return json({ settings: parsed.settings, instructionsLimit: PLAN_AI_FEATURES[plan].instructionsChars, plan, updatedAt: now.toISOString() } satisfies AiSettingsResponse);
}
