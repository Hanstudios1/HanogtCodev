import type { NextRequest } from "next/server";
import type { AdminSocialResponse } from "@/components/Admin/types";
import { adminFailure, adminJson, authorizeAdminRequest } from "@/lib/server/admin";
import { buildSocialOverview } from "@/lib/server/admin-insights";

export const runtime = "nodejs";

/* Hanogt Social in numbers for the admin panel (lib/server/admin-insights.ts): totals only, never a message or a person. */

const CACHE_TTL_MS = 60_000;
let cache: { at: number; payload: AdminSocialResponse } | null = null;

export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        if (request.nextUrl.searchParams.get("fresh") !== "1" && cache && Date.now() - cache.at < CACHE_TTL_MS) return adminJson(cache.payload);
        const payload = await buildSocialOverview();
        cache = { at: Date.now(), payload };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "admin:social");
    }
}
