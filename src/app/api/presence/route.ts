import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerDocument, isFirebaseServerConfigured, patchServerDocument } from "@/lib/server/firebase-rest";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { isPresenceChoice, publicPresence, type PresenceChoice } from "@/lib/presence";

export const dynamic = "force-dynamic";

/**
 * Presence heartbeat (POST) and the signed-in person's own status (GET).
 *
 * Runs on the server so presence works even when the browser's Firebase
 * connection can't be set up. The chosen status stays private on users/{email};
 * public_profiles/{email} gets only what others may see, honouring the "show
 * my online status" and "show last seen" settings.
 */

type Prefs = { choice: PresenceChoice; showOnline: boolean; showLastSeen: boolean; at: number };
const PREFS_TTL_MS = 2 * 60_000;
const prefsCache = new Map<string, Prefs>();
const hits = new Map<string, { count: number; startedAt: number }>();

function json(payload: unknown, status = 200) {
    return Response.json(payload, { status, headers: jsonSecurityHeaders() });
}

/** Heartbeats are cheap and only touch the caller's own documents; a per-instance window is enough. */
function allow(email: string) {
    const now = Date.now();
    const entry = hits.get(email);
    if (!entry || now - entry.startedAt > 60_000) {
        if (hits.size > 10_000) hits.clear();
        hits.set(email, { count: 1, startedAt: now });
        return true;
    }
    entry.count += 1;
    return entry.count <= 20;
}

async function sessionEmail() {
    const session = await getServerSession(authOptions).catch(() => null);
    return session?.user?.email?.toLowerCase() || null;
}

async function loadPrefs(email: string): Promise<Prefs | null> {
    const cached = prefsCache.get(email);
    if (cached && Date.now() - cached.at < PREFS_TTL_MS) return cached;
    const user = await getServerDocument<Record<string, unknown>>(`users/${email}`);
    if (!user || user.banned === true || user.suspended === true) return null;
    const prefs: Prefs = {
        choice: isPresenceChoice(user.presenceChoice) ? user.presenceChoice : user.dndMode === true ? "dnd" : "online",
        showOnline: user.showOnlineStatus !== false,
        showLastSeen: user.showLastSeen !== false,
        at: Date.now(),
    };
    if (prefsCache.size > 5_000) prefsCache.clear();
    prefsCache.set(email, prefs);
    return prefs;
}

export async function GET() {
    const email = await sessionEmail();
    if (!email) return json({ error: "auth_required" }, 401);
    if (!isFirebaseServerConfigured()) return json({ error: "unavailable" }, 503);
    try {
        prefsCache.delete(email);
        const prefs = await loadPrefs(email);
        if (!prefs) return json({ error: "not_found" }, 404);
        return json({ choice: prefs.choice, showOnline: prefs.showOnline });
    } catch {
        return json({ error: "unavailable" }, 503);
    }
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ error: "bad_origin" }, 403);
    const email = await sessionEmail();
    if (!email) return json({ error: "auth_required" }, 401);
    if (!isFirebaseServerConfigured()) return json({ error: "unavailable" }, 503);
    if (!allow(email)) return json({ error: "rate_limited" }, 429);

    // sendBeacon posts text/plain; parse the body ourselves.
    let body: { choice?: unknown; idle?: unknown; active?: unknown } = {};
    try {
        const text = await request.text();
        body = text ? JSON.parse(text) : {};
    } catch {
        return json({ error: "invalid_body" }, 400);
    }

    try {
        const prefs = await loadPrefs(email);
        if (!prefs) return json({ error: "not_found" }, 404);
        if (isPresenceChoice(body.choice) && body.choice !== prefs.choice) {
            prefs.choice = body.choice;
            prefsCache.set(email, { ...prefs, at: Date.now() });
        }
        const active = body.active !== false;
        const autoIdle = body.idle === true;
        const shown = publicPresence(prefs.choice, { active, autoIdle, showOnline: prefs.showOnline });
        const now = new Date().toISOString();

        const userWrite = patchServerDocument(`users/${email}`, {
            presenceChoice: prefs.choice,
            dndMode: prefs.choice === "dnd",
            isOnline: active,
            idle: active && autoIdle,
            presenceAt: now,
            lastSeenAt: now,
        }, { exists: true });
        const profileData: Record<string, unknown> = {
            isOnline: shown.isOnline,
            presence: shown.presence,
            presenceAt: now,
            dndMode: prefs.choice === "dnd",
        };
        if (prefs.showLastSeen && shown.isOnline) profileData.lastSeenAt = now;
        const profileWrite = patchServerDocument(`public_profiles/${email}`, profileData, { exists: true })
            // An account without a public profile yet simply isn't shown anywhere.
            .catch((error: Error & { status?: number }) => {
                if (error.status !== 404 && error.status !== 400 && error.status !== 412) throw error;
            });
        await Promise.all([userWrite, profileWrite]);
        return json({ choice: prefs.choice, presence: shown.presence });
    } catch (error) {
        console.warn("[presence] update failed:", error instanceof Error ? error.message : error);
        return json({ error: "unavailable" }, 503);
    }
}
