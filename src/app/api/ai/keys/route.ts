import { NextResponse, type NextRequest } from "next/server";
import type { ApiKeyCreated, ApiKeysErrorCode, ApiKeysState } from "@/lib/ai/api-keys";
import { effectivePlan } from "@/lib/plans";
import { getActiveSession } from "@/lib/server/active-session";
import { ApiKeyError, apiKeysStateFor, createApiKey, revokeApiKey, type ApiKeyErrorCode } from "@/lib/server/ai-api-keys";
import { featureAllowed } from "@/lib/server/features";
import { getSubscription } from "@/lib/server/plans";
import { enforceRateLimit, memoryRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { resolveUserRole } from "@/lib/server/roles";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * The signed-in account's Hanogt AI API keys (src/lib/server/ai-api-keys.ts).
 *   GET                                  ApiKeysState
 *   POST { action: "create", name? }     ApiKeyCreated (the key is shown this once)
 *   POST { action: "revoke", id }        ApiKeysState
 * Same origin only; making keys needs Plus or Pro and the ai_api feature.
 */

function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders({ "Cache-Control": "no-store", ...headers }) });
}

function failure(status: number, code: ApiKeysErrorCode, error: string, headers: Record<string, string> = {}) {
    return json({ error, code }, status, headers);
}

const KEY_ERRORS: Record<ApiKeyErrorCode, { status: number; error: string }> = {
    plan_required: { status: 409, error: "Hanogt AI API anahtarı için Plus ya da Pro plan gerekir." },
    limit_reached: { status: 409, error: "Planındaki anahtar sınırına ulaştın; yenisi için önce birini iptal et." },
    not_found: { status: 404, error: "Bu anahtar artık yok." },
    conflict: { status: 409, error: "Anahtarların aynı anda başka bir yerde değişti. Tekrar dene." },
};

export async function GET() {
    const active = await getActiveSession();
    if (!active) return failure(401, "auth_required", "Giriş yapın.");
    const rate = memoryRateLimit(`ai-keys:read:${active.email}`, 30, 60_000);
    if (!rate.allowed) return failure(429, "rate_limited", "Çok sık istendi.", { "Retry-After": String(rate.retryAfterSeconds) });
    try {
        const staff = resolveUserRole(active.email, active.user.role) !== "user";
        return json(await apiKeysStateFor(active.email, staff) satisfies ApiKeysState);
    } catch (error) {
        console.error("[ai-keys:get]", error instanceof Error ? error.message : error);
        return failure(503, "unavailable", "Anahtarlar şu anda okunamadı.");
    }
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return failure(403, "bad_origin", "Geçersiz istek kaynağı.");
    const active = await getActiveSession();
    if (!active) return failure(401, "auth_required", "Giriş yapın.");
    const { email } = active;
    const rate = await enforceRateLimit(`ai-keys:${email}`, 20, 60_000).catch(() => null);
    if (!rate) return failure(503, "unavailable", "Anahtarlar şu anda değiştirilemiyor.");
    if (!rate.allowed) return failure(429, "rate_limited", "Çok fazla deneme yaptın.", { "Retry-After": String(rate.retryAfterSeconds) });

    const body = await readJsonBody(request, 2_000);
    if (!body || (body.action !== "create" && body.action !== "revoke")) return failure(400, "invalid_request", "Geçersiz istek.");
    const staff = resolveUserRole(email, active.user.role) !== "user";
    try {
        if (body.action === "revoke") {
            await revokeApiKey(email, body.id);
            return json(await apiKeysStateFor(email, staff) satisfies ApiKeysState);
        }
        if (body.name !== undefined && typeof body.name !== "string") return failure(400, "invalid_request", "Geçersiz anahtar adı.");
        const plan = effectivePlan(await getSubscription(email));
        if (!(await featureAllowed("ai_api", { staff, plan }))) return failure(403, "feature_unavailable", "Hanogt AI API'si hesabında henüz açık değil.");
        const created = await createApiKey(email, plan, body.name);
        return json({ ...created, state: await apiKeysStateFor(email, staff) } satisfies ApiKeyCreated, 201);
    } catch (error) {
        if (error instanceof ApiKeyError) {
            const known = KEY_ERRORS[error.code];
            return failure(known.status, error.code, known.error);
        }
        console.error("[ai-keys:post]", error instanceof Error ? error.message : error);
        return failure(503, "unavailable", "Anahtarlar şu anda değiştirilemiyor.");
    }
}
