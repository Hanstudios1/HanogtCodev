import type { NextRequest } from "next/server";
import type { AdminSecurityEvent, AdminSecurityEventsResponse, SecurityRisk } from "@/components/Admin/types";
import { adminFailure, adminJson, authorizeAdminRequest, numberOr, stringOr, toIso } from "@/lib/server/admin";
import { runServerQuery } from "@/lib/server/firebase-rest";

export const runtime = "nodejs";

const RISKS: readonly SecurityRisk[] = ["low", "medium", "high", "critical"];
const KNOWN_FIELDS = new Set(["actor", "action", "risk", "findingIds", "codeHash", "codeLength", "fileCount", "reviewStatus", "createdAt"]);

type EventRecord = Record<string, unknown> & { _id: string };

/** Small scalar extras only: events never expose code or large payloads. */
function extraDetails(record: EventRecord) {
    const details: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(record)) {
        if (KNOWN_FIELDS.has(key) || key.startsWith("_") || Object.keys(details).length >= 8) continue;
        if (typeof value === "string" && value.length <= 200) details[key] = value;
        else if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") details[key] = value;
    }
    return details;
}

function toAdminEvent(record: EventRecord): AdminSecurityEvent {
    const codeLength = numberOr(record.codeLength, Number.NaN);
    const fileCount = numberOr(record.fileCount, Number.NaN);
    return {
        id: record._id,
        action: stringOr(record.action, "unknown", 60),
        actor: stringOr(record.actor, "", 254),
        risk: (RISKS as readonly unknown[]).includes(record.risk) ? record.risk as SecurityRisk : "unknown",
        findingIds: Array.isArray(record.findingIds)
            ? record.findingIds.filter((item): item is string => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 60))
            : [],
        codeLength: Number.isFinite(codeLength) ? codeLength : null,
        fileCount: Number.isFinite(fileCount) ? fileCount : null,
        codeHash: typeof record.codeHash === "string" ? record.codeHash.slice(0, 12) : null,
        reviewStatus: typeof record.reviewStatus === "string" ? record.reviewStatus.slice(0, 30) : null,
        createdAt: toIso(record.createdAt),
        details: extraDetails(record),
    };
}

/** Newest security events (read-only). `?limit=` 1–200, default 200. */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const requested = Number(request.nextUrl.searchParams.get("limit"));
        const limit = Number.isInteger(requested) && requested >= 1 && requested <= 200 ? requested : 200;
        const records = await runServerQuery<Record<string, unknown>>({
            collectionId: "security_events",
            orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
            limit,
        });
        const payload: AdminSecurityEventsResponse = { events: records.map(toAdminEvent) };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "security-events:get");
    }
}
