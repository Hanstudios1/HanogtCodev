import type { NextRequest } from "next/server";
import type { ActivityRange, AdminActivityResponse } from "@/components/Admin/types";
import { adminError, adminFailure, adminJson, authorizeAdminRequest } from "@/lib/server/admin";
import { buildActivity, isActivityRange } from "@/lib/server/admin-activity";

export const runtime = "nodejs";

/*
 * The overview's charts (lib/server/admin-activity.ts): ?range=7|30|90. Kept
 * for five minutes per range; ?fresh=1 (the Refresh button) counts again.
 */

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<ActivityRange, { at: number; payload: AdminActivityResponse }>();

export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    const range = Number(request.nextUrl.searchParams.get("range") ?? 30);
    if (!isActivityRange(range)) return adminError(400, "invalid_query");
    try {
        const cached = cache.get(range);
        if (request.nextUrl.searchParams.get("fresh") !== "1" && cached && Date.now() - cached.at < CACHE_TTL_MS) return adminJson(cached.payload);
        const payload = await buildActivity(range);
        cache.set(range, { at: Date.now(), payload });
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "admin:activity");
    }
}
