import type { AdminMeResponse } from "@/components/Admin/types";
import { adminError, adminJson, adminPermissions, getStaffSession, syncStaffRoleBadgeThrottled } from "@/lib/server/admin";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { getSignedInSession } from "@/lib/server/active-session";

export const runtime = "nodejs";

/** Whether the caller is staff. Everyone else gets a plain `{ isAdmin: false }`. */
export async function GET() {
    // Signed-out visitors are answered without touching the database.
    const session = await getSignedInSession();
    const sessionEmail = session?.user?.email?.trim().toLowerCase();
    if (!sessionEmail) return adminJson({ isAdmin: false } satisfies AdminMeResponse);
    // Per account, not per IP: behind a shared address (or on a host without
    // forwarding headers) everyone shared one window, and a 429 hid the panel link.
    const rate = await enforceRateLimitWithFallback(`admin:me:${sessionEmail}`, 60, 60_000);
    if (!rate.allowed) return adminError(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });
    const staff = await getStaffSession();
    if (staff) {
        // Staff badge on the public profile: owners come from configuration and
        // roles may predate the badge, so it is repaired here when it differs.
        await syncStaffRoleBadgeThrottled(staff.email, staff.role).catch((error: unknown) => {
            console.warn("[admin:me] staff badge sync failed:", error instanceof Error ? error.message : error);
        });
    }
    const payload: AdminMeResponse = staff
        ? { isAdmin: true, email: staff.email, role: staff.role, permissions: adminPermissions(staff.role) }
        : { isAdmin: false };
    return adminJson(payload);
}
