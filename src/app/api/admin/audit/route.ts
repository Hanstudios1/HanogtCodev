import type { NextRequest } from "next/server";
import type { AdminAuditEntry, AdminAuditResponse, AuditDetailValue } from "@/components/Admin/types";
import { adminFailure, adminJson, authorizeAdminRequest, stringOr, toIso } from "@/lib/server/admin";
import { runServerQuery } from "@/lib/server/firebase-rest";

export const runtime = "nodejs";

function details(value: unknown) {
    const result: Record<string, AuditDetailValue> = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 16)) {
        if (typeof item === "string") result[key] = item.slice(0, 300);
        else if (typeof item === "number" || typeof item === "boolean" || item === null) result[key] = item;
    }
    return result;
}

function toAuditEntry(record: Record<string, unknown> & { _id: string }): AdminAuditEntry {
    return {
        id: record._id,
        actor: stringOr(record.actor, "", 254),
        action: stringOr(record.action, "", 60),
        target: stringOr(record.target, "", 300),
        details: details(record.details),
        createdAt: toIso(record.createdAt),
    };
}

/** The 200 newest audit entries (read-only; entries are written by the admin routes). */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const records = await runServerQuery<Record<string, unknown>>({
            collectionId: "admin_audit_log",
            orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
            limit: 200,
        });
        const payload: AdminAuditResponse = { entries: records.map(toAuditEntry) };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "audit:get");
    }
}
