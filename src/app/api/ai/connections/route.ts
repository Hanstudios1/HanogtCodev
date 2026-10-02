import { NextResponse, type NextRequest } from "next/server";
import { isAiProviderId, isPlausibleApiKey, type AiConnectionsErrorCode } from "@/lib/ai/connections";
import { getActiveSession } from "@/lib/server/active-session";
import { addConnection, canAddConnection, deleteConnection, listConnections, testKey, updateConnection } from "@/lib/server/ai-connections";
import { isWriteConflict } from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

/**
 * The person's own AI provider connections for Hanogt AI (Plus and Pro).
 * GET: plan allowance, providers and connections (never keys).
 * POST { action }: "test" (check a key, get its models), "add" (requires
 * `consent: true`: explicit consent to sending messages to the provider
 * abroad), "update" (label, model) and "delete". API keys arrive only in test
 * and add bodies, are checked with the provider, stored encrypted and never
 * sent back.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A key check may take up to 10 s, and adding one checks the key again.
export const maxDuration = 30;

const MESSAGES: Record<AiConnectionsErrorCode, string> = {
    plan_required: "Kendi API anahtarınızla bağlantı eklemek için Plus ya da Pro plan gerekir.",
    limit_reached: "Planınızdaki bağlantı sınırına ulaştınız.",
    invalid_key: "Sağlayıcı bu API anahtarını kabul etmedi.",
    provider_error: "Sağlayıcı şu anda anahtarı doğrulayamadı. Biraz sonra tekrar deneyin.",
    unreachable: "Sağlayıcıya ulaşılamadı. Biraz sonra tekrar deneyin.",
    not_found: "Bağlantı bulunamadı.",
    invalid_request: "Geçersiz istek.",
    encryption_unavailable: "API anahtarları bu sunucuda güvenle saklanamıyor; şifreleme anahtarı yapılandırılmamış.",
    consent_required: "Bağlantı eklemek için mesajlarınızın seçtiğiniz sağlayıcıya (yurt dışındaki sunucularına) gönderilmesine açık rıza vermeniz gerekir.",
    auth_required: "Etkin oturum gerekli.",
    forbidden_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    conflict: "Bağlantılar aynı anda başka bir yerde değişti. Tekrar deneyin.",
    unavailable: "Bağlantılar şu anda kullanılamıyor. Biraz sonra tekrar deneyin.",
};

const STATUS: Record<AiConnectionsErrorCode, number> = {
    plan_required: 403,
    limit_reached: 409,
    invalid_key: 422,
    provider_error: 502,
    unreachable: 504,
    not_found: 404,
    invalid_request: 400,
    encryption_unavailable: 503,
    consent_required: 400,
    auth_required: 401,
    forbidden_origin: 403,
    rate_limited: 429,
    conflict: 409,
    unavailable: 503,
};

function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders(headers) });
}

function fail(code: AiConnectionsErrorCode, headers: Record<string, string> = {}) {
    return json({ error: MESSAGES[code], code }, STATUS[code], headers);
}

export async function GET() {
    const active = await getActiveSession();
    if (!active) return fail("auth_required");
    try {
        return json(await listConnections(active.email));
    } catch (error) {
        console.error("[ai:connections] list", error instanceof Error ? error.message : "unknown error");
        return fail("unavailable");
    }
}

type Action = "test" | "add" | "update" | "delete";
const ACTIONS: readonly Action[] = ["test", "add", "update", "delete"];

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return fail("forbidden_origin");
    const active = await getActiveSession();
    if (!active) return fail("auth_required");
    const { email } = active;

    const body = await readJsonBody(request, 4_000);
    const action = body && typeof body.action === "string" && (ACTIONS as readonly string[]).includes(body.action) ? body.action as Action : null;
    if (!body || !action) return fail("invalid_request");

    // Key checks reach out to the provider: 10 a minute; changes 30 a minute.
    const checksKey = action === "test" || action === "add";
    const rate = await enforceRateLimitWithFallback(checksKey ? `ai-connections-key:${email}` : `ai-connections:${email}`, checksKey ? 10 : 30, 60_000);
    if (!rate.allowed) return fail("rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });

    try {
        switch (action) {
            case "test": {
                const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
                if (!isAiProviderId(body.provider) || !isPlausibleApiKey(apiKey)) return fail("invalid_request");
                const allowed = await canAddConnection(email);
                if (!allowed.ok) return fail(allowed.code);
                const result = await testKey(body.provider, apiKey);
                return result.ok ? json({ ok: true, models: result.models }) : fail(result.reason);
            }
            case "add": {
                // Explicit consent (KVKK m.9/6-a) must come with the request itself: `consent: true`.
                const result = await addConnection(email, { provider: body.provider, apiKey: body.apiKey, model: body.model, label: body.label, consent: body.consent });
                return result.ok ? json({ ...result.state, addedId: result.id }) : fail(result.code);
            }
            case "update": {
                const result = await updateConnection(email, body.id, { label: body.label, model: body.model });
                return result.ok ? json(result.state) : fail(result.code);
            }
            case "delete": {
                const result = await deleteConnection(email, body.id);
                return result.ok ? json(result.state) : fail(result.code);
            }
        }
    } catch (error) {
        if (isWriteConflict(error)) return fail("conflict");
        // Firestore messages name the operation and status only, never the key.
        console.error(`[ai:connections] ${action}`, error instanceof Error ? error.message : "unknown error");
        return fail("unavailable");
    }
}
