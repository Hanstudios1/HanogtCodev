import type { NextRequest } from "next/server";
import type { AdminAuditEntry, AdminAuditResponse, AuditDetailValue } from "@/components/Admin/types";
import { AdminHttpError, adminFailure, adminJson, authorizeAdminRequest, stringOr, toIso } from "@/lib/server/admin";
import { matchesSearch, newestPage, readPageCursor, readSearch } from "@/lib/server/admin-pages";

export const runtime = "nodejs";

const PAGE_SIZE = 50;
const ACTION = /^[a-z0-9_.-]{1,60}$/;

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

/**
 * Audit entries, newest first (read-only; the admin routes write them), a
 * page at a time (`?cursor=`). `?action=` keeps one kind and `?q=` searches
 * the staff member, the target and the details.
 */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const params = request.nextUrl.searchParams;
        const cursor = readPageCursor(params, "admin_audit_log");
        const needle = readSearch(params);
        const rawAction = params.get("action");
        const action = rawAction && rawAction !== "all" ? rawAction : null;
        if (action && !ACTION.test(action)) throw new AdminHttpError(400, "invalid_query");
        const page = await newestPage<Record<string, unknown>>({
            collectionId: "admin_audit_log",
            field: "createdAt",
            limit: PAGE_SIZE,
            cursor,
            ...(action || needle ? {
                keep: (record: Record<string, unknown> & { _id: string }) => {
                    const entry = toAuditEntry(record);
                    return (!action || entry.action === action)
                        && (!needle || matchesSearch(needle, [entry.actor, entry.target, ...Object.values(entry.details).map((value) => (value === null ? null : String(value)))]));
                },
            } : {}),
        });
        const payload: AdminAuditResponse = { items: page.items.map(toAuditEntry), nextCursor: page.nextCursor };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "audit:get");
    }
}
