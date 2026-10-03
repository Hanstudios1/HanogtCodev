import type { NextRequest } from "next/server";
import { adminError, adminFailure, adminJson, authorizeAdminRequest, readAdminBody, requireEnum, writeAuditLog } from "@/lib/server/admin";
import { deployBundledRules, runCloudHealthChecks, type CloudDeployResponse, type CloudHealthReport } from "@/lib/server/cloud-health";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The diagnosis calls several Google APIs; some run one after another.
export const maxDuration = 60;

const CHECKS_PER_TEN_MINUTES = 30;
const DEPLOYS_PER_HOUR = 5;

/** The site address visitors use; the browser simulation sends it as Referer/Origin. */
function siteOrigin(request: NextRequest) {
    const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
    const protocol = (request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
    if (/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host) && /^https?$/.test(protocol)) return `${protocol}://${host}`;
    try {
        return new URL(process.env.NEXTAUTH_URL || "").origin;
    } catch {
        return request.nextUrl.origin;
    }
}

/** Owners only: the report maps the whole deployment (projects, service account, rules). */
async function authorizeOwner(request: NextRequest, mutation: boolean) {
    const guard = await authorizeAdminRequest(request, { minRole: "admin", mutation });
    if (!guard.ok) return guard;
    if (guard.admin.role !== "owner") return { ok: false as const, response: adminError(403, "forbidden") };
    return guard;
}

export async function GET(request: NextRequest) {
    const guard = await authorizeOwner(request, false);
    if (!guard.ok) return guard.response;
    const rate = await enforceRateLimitWithFallback(`admin:cloud-check:${guard.admin.email}`, CHECKS_PER_TEN_MINUTES, 10 * 60_000);
    if (!rate.allowed) return adminError(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });
    try {
        const report: CloudHealthReport = await runCloudHealthChecks({ ownerEmail: guard.admin.email, origin: siteOrigin(request) });
        return adminJson(report);
    } catch (error) {
        return adminFailure(error, "cloud:get");
    }
}

/** `{ action: "deployRules" }`: publishes the repository's firestore.rules and storage.rules. */
export async function POST(request: NextRequest) {
    const guard = await authorizeOwner(request, true);
    if (!guard.ok) return guard.response;
    const actor = guard.admin.email;
    try {
        const body = await readAdminBody(request, ["action"], 1_024);
        requireEnum(body.action, ["deployRules"] as const, "invalid_action");
        const rate = await enforceRateLimitWithFallback(`admin:cloud-deploy:${actor}`, DEPLOYS_PER_HOUR, 60 * 60_000);
        if (!rate.allowed) return adminError(429, "rate_limited", { "Retry-After": String(rate.retryAfterSeconds) });

        let deployment: CloudDeployResponse;
        try {
            deployment = await deployBundledRules();
        } catch (error) {
            console.error("[admin:cloud:deploy]", error instanceof Error ? error.message : error);
            // 424, not 502: Cloudflare replaces 502 answers with its own page.
            return adminError(424, "deploy_failed");
        }
        const [firestore, storage] = deployment.results;
        // Every attempt is recorded, including failed ones.
        await writeAuditLog(actor, "cloud.deploy_rules", deployment.projectId, {
            firestore: firestore?.status,
            firestoreDetail: firestore?.detail,
            storage: storage?.status,
            storageDetail: storage?.detail,
        }).catch((error: unknown) => {
            console.warn("[admin:cloud:deploy] audit log failed:", error instanceof Error ? error.message : error);
        });
        return adminJson(deployment);
    } catch (error) {
        return adminFailure(error, "cloud:deploy");
    }
}
