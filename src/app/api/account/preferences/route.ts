import { NextResponse, type NextRequest } from "next/server";
import { parseAccountEditorSettings, type AccountEditorSettings } from "@/lib/editor-settings";
import { getActiveSession } from "@/lib/server/active-session";
import { isMissingDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * The account copy of the code editor settings (users/{email}.editorSettings).
 * The editor itself keeps reading localStorage, so it also works offline; the
 * Editor Settings page saves here as well and offers newer copies on other
 * devices.
 */

type PreferencesErrorCode = "unauthorized" | "bad_origin" | "rate_limited" | "invalid_body" | "unknown_field" | "invalid_settings" | "unavailable";

const BODY_MAX_BYTES = 16_000;
const WRITES_PER_MINUTE = 20;

const MESSAGES: Record<PreferencesErrorCode, string> = {
    unauthorized: "Etkin oturum gerekli.",
    bad_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    invalid_body: "Geçerli bir JSON nesnesi gönderilmelidir.",
    unknown_field: "İstek desteklenmeyen bir alan içeriyor.",
    invalid_settings: "Editör ayarları geçersiz.",
    unavailable: "Ayar hizmeti şu anda kullanılamıyor.",
};

function errorResponse(status: number, code: PreferencesErrorCode, headers: Record<string, string> = {}) {
    return NextResponse.json({ error: MESSAGES[code], code }, { status, headers: jsonSecurityHeaders(headers) });
}

function isoOrNull(value: unknown) {
    const time = typeof value === "string" ? Date.parse(value) : value instanceof Date ? value.getTime() : Number.NaN;
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export async function GET() {
    const active = await getActiveSession();
    if (!active) return errorResponse(401, "unauthorized");
    // getActiveSession has just read users/{email}; no second read is needed.
    const user = active.user as Record<string, unknown>;
    const editorSettings = parseAccountEditorSettings(user.editorSettings);
    const payload: AccountEditorSettings = { editorSettings, updatedAt: editorSettings ? isoOrNull(user.editorSettingsUpdatedAt) : null };
    return NextResponse.json(payload, { headers: jsonSecurityHeaders() });
}

export async function PUT(request: NextRequest) {
    if (!isSameOrigin(request)) return errorResponse(403, "bad_origin");
    const active = await getActiveSession();
    if (!active) return errorResponse(401, "unauthorized");
    const { email } = active;

    let rate: Awaited<ReturnType<typeof enforceRateLimit>>;
    try {
        rate = await enforceRateLimit(`account-preferences:${email}`, WRITES_PER_MINUTE, 60_000);
    } catch (error) {
        console.error("[account-preferences] rate limit", error instanceof Error ? error.message : error);
        return errorResponse(503, "unavailable");
    }
    if (!rate.allowed) return errorResponse(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });

    const body = await readJsonBody(request, BODY_MAX_BYTES);
    if (!body) return errorResponse(400, "invalid_body");
    if (Object.keys(body).some((key) => key !== "editorSettings")) return errorResponse(400, "unknown_field");
    // Same validation as imported settings files: complete, clamped values only.
    const editorSettings = parseAccountEditorSettings(body.editorSettings);
    if (!editorSettings) return errorResponse(400, "invalid_settings");

    try {
        const now = new Date();
        // Only while the account exists: a deleted account's open tab must not bring its document back.
        await patchServerDocument(`users/${email}`, { editorSettings, editorSettingsUpdatedAt: now }, { updateFields: ["editorSettings", "editorSettingsUpdatedAt"], exists: true });
        const payload: AccountEditorSettings = { editorSettings, updatedAt: now.toISOString() };
        return NextResponse.json(payload, { headers: jsonSecurityHeaders() });
    } catch (error) {
        if (isMissingDocument(error)) return errorResponse(401, "unauthorized");
        console.error("[account-preferences:put]", error instanceof Error ? error.message : error);
        return errorResponse(503, "unavailable");
    }
}
