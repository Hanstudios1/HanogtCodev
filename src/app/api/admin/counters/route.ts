import type { NextRequest } from "next/server";
import type { AdminCountersResponse } from "@/components/Admin/types";
import { adminFailure, adminJson, authorizeAdminRequest, countDocuments, countOpenFeedback } from "@/lib/server/admin";

export const runtime = "nodejs";

/*
 * The side bar's counters: open content reports, open support tickets and
 * feedback waiting for an answer. Three or four aggregation queries, counted
 * on every request so a badge is right as soon as a section changes it.
 */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const [reportsOpen, ticketsOpen, feedbackOpen] = await Promise.all([
            countDocuments("media_reports", [{ field: "status", op: "EQUAL", value: "open" }]).catch(() => null),
            countDocuments("support_tickets", [{ field: "status", op: "IN", value: ["open", "in_progress"] }]).catch(() => null),
            countOpenFeedback().catch(() => null),
        ]);
        const payload: AdminCountersResponse = { reportsOpen, ticketsOpen, feedbackOpen, generatedAt: new Date().toISOString() };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "admin:counters");
    }
}
