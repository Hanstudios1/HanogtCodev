import type { NextRequest } from "next/server";
import type { AdminSecurityEvent, AdminSecurityEventsResponse, SecurityEventCounts, SecurityRisk } from "@/components/Admin/types";
import { AdminHttpError, adminFailure, adminJson, authorizeAdminRequest, numberOr, stringOr, toIso } from "@/lib/server/admin";
import { matchesSearch, newestPage, readPageCursor, readSearch } from "@/lib/server/admin-pages";
import { countServerQuery } from "@/lib/server/firebase-rest";

export const runtime = "nodejs";

const RISKS: readonly SecurityRisk[] = ["low", "medium", "high", "critical"];
const PAGE_SIZE = 50;
const ACTION = /^[a-z0-9_.-]{1,60}$/;
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

/** How many events there are in all and by risk (anything else is "unknown"). */
async function eventCounts(): Promise<SecurityEventCounts> {
    const [all, ...byRisk] = await Promise.all([
        countServerQuery({ collectionId: "security_events" }),
        ...RISKS.map((risk) => countServerQuery({ collectionId: "security_events", where: [{ field: "risk", op: "EQUAL", value: risk }] })
            .then((count) => [risk, count] as const)),
    ]);
    const counts = { all, low: 0, medium: 0, high: 0, critical: 0, unknown: all } as SecurityEventCounts;
    for (const [risk, count] of byRisk) {
        counts[risk] = count;
        counts.unknown -= count;
    }
    counts.unknown = Math.max(0, counts.unknown);
    return counts;
}

/**
 * Security events, newest first (read-only), a page at a time (`?cursor=`;
 * `?limit=` 1–100, default 50). `?risk=` and `?action=` filter them and `?q=`
 * searches the account, the findings and the code fingerprint; the counts by
 * risk come with the first page.
 */
export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        const params = request.nextUrl.searchParams;
        const requested = Number(params.get("limit"));
        const limit = Number.isInteger(requested) && requested >= 1 && requested <= 100 ? requested : PAGE_SIZE;
        const cursor = readPageCursor(params, "security_events");
        const needle = readSearch(params);
        const rawRisk = params.get("risk");
        const risk = rawRisk && rawRisk !== "all" ? rawRisk : null;
        if (risk && risk !== "unknown" && !(RISKS as readonly string[]).includes(risk)) throw new AdminHttpError(400, "invalid_query");
        const rawAction = params.get("action");
        const action = rawAction && rawAction !== "all" ? rawAction : null;
        if (action && !ACTION.test(action)) throw new AdminHttpError(400, "invalid_query");
        const [page, counts] = await Promise.all([
            newestPage<Record<string, unknown>>({
                collectionId: "security_events",
                field: "createdAt",
                limit,
                cursor,
                ...(risk || action || needle ? {
                    keep: (record: EventRecord) => {
                        const event = toAdminEvent(record);
                        return (!risk || event.risk === risk)
                            && (!action || event.action === action)
                            && (!needle || matchesSearch(needle, [event.actor, event.codeHash, ...event.findingIds]));
                    },
                } : {}),
            }),
            cursor || params.has("limit") ? Promise.resolve(null) : eventCounts().catch(() => null),
        ]);
        const payload: AdminSecurityEventsResponse = { items: page.items.map(toAdminEvent), nextCursor: page.nextCursor, counts };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "security-events:get");
    }
}
