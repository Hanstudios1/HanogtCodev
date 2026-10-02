import { NextResponse, type NextRequest } from "next/server";
import {
    isPresenceActivity,
    isPresenceTabId,
    presenceWrites,
    readPresenceReport,
    readStatusPreference,
    resolvePresence,
    supersedes,
    type PresenceApiResponse,
} from "@/lib/presence";
import { getActiveSession } from "@/lib/server/active-session";
import { firestoreStatus } from "@/lib/server/admin";
import { commitServerPatches } from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Presence heartbeat (Provider.tsx): a browser tab reports whether the
 * person is active, idle or leaving; the server combines it with the status
 * preference and the privacy settings in users/{email} and publishes the
 * result to public_profiles/{email}.presence (lib/presence.ts). It runs with
 * the service account, so presence works without the browser's Firebase
 * connection, and the presence fields stay server-only in the rules.
 */

/** Active tabs report every 45 s; this leaves room for a second device and status changes. */
const REPORTS_PER_MINUTE = 6;
/** The same report again within this time is not written (focus and visibility events together). */
const REPEAT_MS = 15_000;

type ErrorCode = "unauthorized" | "bad_origin" | "rate_limited" | "invalid_request" | "unavailable";

const MESSAGES: Record<ErrorCode, string> = {
    unauthorized: "Etkin oturum gerekli.",
    bad_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    invalid_request: "Geçersiz istek.",
    unavailable: "Durum şu anda güncellenemiyor.",
};

function errorResponse(status: number, code: ErrorCode, headers: Record<string, string> = {}) {
    return NextResponse.json({ error: MESSAGES[code], code }, { status, headers: jsonSecurityHeaders(headers) });
}

function json(payload: PresenceApiResponse) {
    return NextResponse.json(payload, { headers: jsonSecurityHeaders() });
}

/**
 * `{ activity: "active" | "idle" | "offline", tab }`. The body may arrive as
 * text/plain: navigator.sendBeacon sends the "offline" report on pagehide.
 */
export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return errorResponse(403, "bad_origin");
    const active = await getActiveSession();
    if (!active) return errorResponse(401, "unauthorized");
    const { email } = active;
    try {
        const rate = await enforceRateLimitWithFallback(`presence:${email}`, REPORTS_PER_MINUTE, 60_000);
        if (!rate.allowed) return errorResponse(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });
        const body = await readJsonBody(request, 512);
        if (!body || Object.keys(body).some((key) => key !== "activity" && key !== "tab") || !isPresenceActivity(body.activity) || !isPresenceTabId(body.tab)) {
            return errorResponse(400, "invalid_request");
        }

        const user = active.user as Record<string, unknown>;
        const preference = readStatusPreference(user.statusPreference, user.dndMode, user.presenceChoice);
        const showOnlineStatus = user.showOnlineStatus !== false;
        const previous = readPresenceReport(user.presenceState);
        const now = Date.now();
        const next = { activity: body.activity, tab: body.tab };
        // A more present tab or device keeps the status while its report is fresh.
        if (previous && !supersedes(previous, next, now)) return json({ status: previous.status, preference, accepted: false });

        const status = resolvePresence(preference, body.activity, showOnlineStatus);
        if (previous && previous.tab === next.tab && previous.activity === next.activity && previous.status === status && now - previous.at < REPEAT_MS) {
            return json({ status, preference, accepted: true });
        }
        const writes = presenceWrites({
            report: { ...next, at: now, status },
            invisible: preference === "invisible" || !showOnlineStatus,
            showLastSeen: user.showLastSeen !== false,
            previousStatus: previous?.status ?? null,
        });
        // `exists`: a deleted account's open tab must not bring its documents back.
        const userWrite = { path: `users/${email}`, data: writes.user.data, updateFields: writes.user.mask, exists: true };
        if (!writes.profile) {
            await commitServerPatches([userWrite]);
        } else {
            try {
                await commitServerPatches([userWrite, { path: `public_profiles/${email}`, data: writes.profile.data, updateFields: writes.profile.mask, exists: true }]);
            } catch (error) {
                // No public profile yet (it is created when the profile is first loaded): keep the private part.
                if (firestoreStatus(error) !== 404) throw error;
                await commitServerPatches([userWrite]);
            }
        }
        return json({ status, preference, accepted: true });
    } catch (error) {
        console.error("[presence:post]", error instanceof Error ? error.message : error);
        return errorResponse(503, "unavailable");
    }
}
