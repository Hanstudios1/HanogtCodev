import { NextResponse, type NextRequest } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { commitServerMutations, countServerQuery, getServerDocument, isFirebaseServerConfigured, isWriteConflict } from "@/lib/server/firebase-rest";
import { projectLimitFor } from "@/lib/server/plans";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";

const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;

function json(payload: unknown, status = 200) {
    return NextResponse.json(payload, { status, headers: jsonSecurityHeaders() });
}

/**
 * POST /api/projects { id, name } — creates a cloud code project; the editor
 * then writes its files directly (firestore.rules lets owners update but not
 * create projects). Creating checks the plan's project limit
 * (src/lib/plans.ts PLAN_PROJECT_LIMITS): 403 { error: "project_limit", limit, plan }.
 * An existing project of the same person is fine (200, created: false).
 */
export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return json({ error: "forbidden_origin" }, 403);
    if (!isFirebaseServerConfigured()) return json({ error: "unavailable" }, 503);
    const active = await getActiveSession();
    if (!active) return json({ error: "unauthorized" }, 401);
    const rate = await enforceRateLimitWithFallback(`projects-create:${active.email}`, 30, 60_000);
    if (!rate.allowed) return json({ error: "rate_limited" }, 429);
    const body = await readJsonBody<{ id?: unknown; name?: unknown }>(request, 2_000);
    const id = typeof body?.id === "string" && PROJECT_ID.test(body.id) ? body.id : null;
    const name = typeof body?.name === "string" ? body.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) : "";
    if (!id || !name) return json({ error: "invalid_request" }, 400);

    const path = `projects/${id}`;
    try {
        const existing = await getServerDocument<{ email?: unknown }>(path);
        if (existing) return existing.email === active.email ? json({ ok: true, created: false }) : json({ error: "forbidden" }, 403);

        const { plan, limit } = await projectLimitFor(active.email, "code");
        if (limit !== null) {
            const count = await countServerQuery({ collectionId: "projects", where: [{ field: "email", op: "EQUAL", value: active.email }], upTo: limit + 1 });
            if (typeof count === "number" && count >= limit) return json({ error: "project_limit", plan, limit }, 403);
        }
        const now = new Date();
        await commitServerMutations([{
            type: "create",
            path,
            data: { id, name, email: active.email, schemaVersion: 2, fileCount: 0, createdAt: now, updatedAt: now },
        }]);
        return json({ ok: true, created: true }, 201);
    } catch (error) {
        if (isWriteConflict(error)) {
            // Created by another tab in the meantime.
            const existing = await getServerDocument<{ email?: unknown }>(path).catch(() => null);
            if (existing?.email === active.email) return json({ ok: true, created: false });
            return json({ error: "forbidden" }, 403);
        }
        console.error("[projects:create]", error instanceof Error ? error.message : error);
        return json({ error: "unavailable" }, 503);
    }
}
