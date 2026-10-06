import type { NextRequest } from "next/server";
import { adminError, adminFailure, adminJson, authorizeAdminRequest, readAdminBody, requireEnum, writeAuditLog } from "@/lib/server/admin";
import { MANUAL_PURGE_BUDGET, purgeOldNews } from "@/lib/server/news-retention";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { buildStorageReport, purgeExpiredRecords } from "@/lib/server/storage-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cleanup click deletes up to a few thousand documents in commits of 400.
export const maxDuration = 60;

const REPORTS_PER_TEN_MINUTES = 30;
const CLEANUPS_PER_TEN_MINUTES = 20;

/** Owners only, like Cloud Health: the report covers the whole database. */
async function authorizeOwner(request: NextRequest, mutation: boolean) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin", mutation });
    if (!guard.ok) return guard;
    if (guard.admin.role !== "owner") return { ok: false as const, response: adminError(403, "forbidden") };
    return guard;
}

export async function GET(request: NextRequest) {
    const guard = await authorizeOwner(request, false);
    if (!guard.ok) return guard.response;
    const rate = await enforceRateLimitWithFallback(`admin:storage-report:${guard.admin.email}`, REPORTS_PER_TEN_MINUTES, 10 * 60_000);
    if (!rate.allowed) return adminError(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });
    try {
        return adminJson(await buildStorageReport());
    } catch (error) {
        return adminFailure(error, "storage:get");
    }
}

/** `{ action: "purgeNews" }` deletes what Hanogt News no longer keeps; `{ action: "purgeExpired" }` deletes expired records. */
export async function POST(request: NextRequest) {
    const guard = await authorizeOwner(request, true);
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    try {
        const body = await readAdminBody(request, ["action"], 1_024);
        const action = requireEnum(body.action, ["purgeNews", "purgeExpired"] as const, "invalid_action");
        const rate = await enforceRateLimitWithFallback(`admin:storage-cleanup:${actor}`, CLEANUPS_PER_TEN_MINUTES, 10 * 60_000);
        if (!rate.allowed) return adminError(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });
        if (action === "purgeNews") {
            const result = await purgeOldNews({ budget: MANUAL_PURGE_BUDGET });
            await writeAuditLog(actor, "storage.purge_news", "news", { archive: result.archive, comments: result.comments, counters: result.counters, done: result.done });
            return adminJson({ action, news: result });
        }
        const result = await purgeExpiredRecords();
        const total = Object.values(result.deleted).reduce((sum, value) => sum + value, 0);
        await writeAuditLog(actor, "storage.purge_expired", "expired", { deleted: total, skipped: result.skipped.join(",").slice(0, 300), done: result.done });
        return adminJson({ action, expired: result });
    } catch (error) {
        return adminFailure(error, "storage:cleanup");
    }
}
