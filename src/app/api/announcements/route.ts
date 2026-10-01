import { NextResponse } from "next/server";
import { MAX_ACTIVE_ANNOUNCEMENTS, type AdminAnnouncement, type PublicAnnouncementsResponse } from "@/components/Admin/types";
import { compareAnnouncements, isAnnouncementLive, normalizeAnnouncement, toPublicAnnouncement } from "@/lib/server/admin";
import { isFirebaseServerConfigured, runServerQuery } from "@/lib/server/firebase-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;
const CACHE_HEADER = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";
const FAILURE_CACHE_HEADER = "public, max-age=30, s-maxage=30";

// Announcements with the active flag, per server instance; the time window is
// checked on every request so scheduled ones appear and expire on time.
let cache: { at: number; records: AdminAnnouncement[] } | null = null;

function respond(payload: PublicAnnouncementsResponse, cacheControl = CACHE_HEADER) {
    return NextResponse.json(payload, { headers: { "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" } });
}

/** Public, unauthenticated: the currently live site-wide announcements, most important first. */
export async function GET() {
    // Fails soft: a missing or broken database must never break page chrome.
    if (!isFirebaseServerConfigured()) return respond({ announcements: [] }, FAILURE_CACHE_HEADER);
    try {
        if (!cache || Date.now() - cache.at >= CACHE_TTL_MS) {
            const records = await runServerQuery<Record<string, unknown>>({
                collectionId: "site_announcements",
                where: [{ field: "active", op: "EQUAL", value: true }],
                limit: 20,
            });
            cache = {
                at: Date.now(),
                records: records.map(normalizeAnnouncement).filter((item): item is AdminAnnouncement => Boolean(item)),
            };
        }
        const now = Date.now();
        const announcements = cache.records
            .filter((item) => isAnnouncementLive(item, now))
            .sort(compareAnnouncements)
            .slice(0, MAX_ACTIVE_ANNOUNCEMENTS)
            .map(toPublicAnnouncement);
        return respond({ announcements });
    } catch (error) {
        console.warn("[announcements] unavailable:", error instanceof Error ? error.message : error);
        return respond({ announcements: [] }, FAILURE_CACHE_HEADER);
    }
}
