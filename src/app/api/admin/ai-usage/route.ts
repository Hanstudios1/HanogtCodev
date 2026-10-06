import type { NextRequest } from "next/server";
import type { ActivityRange, AdminAiUsageResponse } from "@/components/Admin/types";
import { adminError, adminFailure, adminJson, authorizeAdminRequest } from "@/lib/server/admin";
import { isActivityRange } from "@/lib/server/admin-activity";
import { buildAiUsage } from "@/lib/server/admin-insights";

export const runtime = "nodejs";

/* Hanogt AI's daily totals for the admin panel: ?range=7|30|90 (lib/server/admin-insights.ts). */

const CACHE_TTL_MS = 60_000;
const cache = new Map<ActivityRange, { at: number; payload: AdminAiUsageResponse }>();

export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    const range = Number(request.nextUrl.searchParams.get("range") ?? 30);
    if (!isActivityRange(range)) return adminError(400, "invalid_query");
    try {
        const cached = cache.get(range);
        if (request.nextUrl.searchParams.get("fresh") !== "1" && cached && Date.now() - cached.at < CACHE_TTL_MS) return adminJson(cached.payload);
        const payload = await buildAiUsage(range);
        cache.set(range, { at: Date.now(), payload });
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "admin:ai-usage");
    }
}
