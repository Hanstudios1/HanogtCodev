import type { NextRequest } from "next/server";
import type { AdminMeResponse } from "@/components/Admin/types";
import { adminError, adminJson, adminPermissions, getStaffSession } from "@/lib/server/admin";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { getClientKey } from "@/lib/server/request-security";

export const runtime = "nodejs";

/** Whether the caller is staff. Everyone else gets a plain `{ isAdmin: false }`. */
export async function GET(request: NextRequest) {
    const rate = await enforceRateLimitWithFallback(`admin:me:${getClientKey(request)}`, 60, 60_000);
    if (!rate.allowed) return adminError(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });
    const staff = await getStaffSession();
    const payload: AdminMeResponse = staff
        ? { isAdmin: true, email: staff.email, role: staff.role, permissions: adminPermissions(staff.role) }
        : { isAdmin: false };
    return adminJson(payload);
}
