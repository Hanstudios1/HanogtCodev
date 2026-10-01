import type { NextRequest } from "next/server";
import type { AdminStatsResponse, RecentSignup, StatCount, StatKey } from "@/components/Admin/types";
import {
    COUNT_CAP,
    adminError,
    adminFailure,
    adminJson,
    authorizeAdminRequest,
    countDocuments,
    httpsUrlOrNull,
    stringOr,
    toIso,
} from "@/lib/server/admin";
import { runServerQuery } from "@/lib/server/firebase-rest";

export const runtime = "nodejs";

const CACHE_TTL_MS = 30_000;
let cache: { at: number; payload: AdminStatsResponse } | null = null;

/** Feedback without a status field predates the admin panel and counts as open. */
async function countOpenFeedback() {
    const items = await runServerQuery<{ status?: unknown }>({ collectionId: "feedback", select: ["status"], limit: COUNT_CAP });
    const open = items.filter((item) => item.status === undefined || item.status === null || item.status === "open").length;
    return { count: open, capped: items.length >= COUNT_CAP };
}

async function recentSignups(): Promise<RecentSignup[]> {
    // Only timestamp-typed createdAt values (every current sign-up path writes one).
    const users = await runServerQuery<Record<string, unknown>>({
        collectionId: "users",
        where: [{ field: "createdAt", op: "GREATER_THAN", value: new Date(0) }],
        orderBy: [{ field: "createdAt", direction: "DESCENDING" }],
        select: ["email", "username", "avatarUrl", "provider", "createdAt"],
        limit: 10,
    });
    return users.map((user) => ({
        email: stringOr(user.email, user._id, 254),
        username: stringOr(user.username, "", 100),
        avatarUrl: httpsUrlOrNull(user.avatarUrl),
        provider: typeof user.provider === "string" ? user.provider.slice(0, 30) : null,
        createdAt: toIso(user.createdAt),
    }));
}

export async function GET(request: NextRequest) {
    const guard = await authorizeAdminRequest(request, { minRole: "moderator" });
    if (!guard.ok) return guard.response;
    try {
        if (cache && Date.now() - cache.at < CACHE_TTL_MS) return adminJson(cache.payload);

        const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
        const tasks: Record<StatKey, () => Promise<StatCount>> = {
            users: () => countDocuments("users"),
            projects: () => countDocuments("projects"),
            mediaPosts: () => countDocuments("media_posts"),
            arcadeGames: () => countDocuments("arcade_games"),
            groups: () => countDocuments("groups"),
            feedbackOpen: countOpenFeedback,
            reportsOpen: () => countDocuments("media_reports", [{ field: "status", op: "EQUAL", value: "open" }]),
            newsComments: () => countDocuments("news_comments"),
            gameProjects: () => countDocuments("game_projects"),
            securityEvents7d: () => countDocuments("security_events", [{ field: "createdAt", op: "GREATER_THAN_OR_EQUAL", value: since }]),
        };
        const keys = Object.keys(tasks) as StatKey[];
        const [values, signups] = await Promise.all([
            Promise.all(keys.map((key) => tasks[key]().catch((error: unknown) => {
                console.warn(`[admin:stats] ${key} count failed:`, error instanceof Error ? error.message : error);
                return null;
            }))),
            recentSignups().catch(() => [] as RecentSignup[]),
        ]);
        if (values.every((value) => value === null)) return adminError(503, "unavailable");

        const payload: AdminStatsResponse = {
            counts: Object.fromEntries(keys.map((key, index) => [key, values[index]])) as Record<StatKey, StatCount>,
            recentSignups: signups,
            countCap: COUNT_CAP,
            generatedAt: new Date().toISOString(),
        };
        cache = { at: Date.now(), payload };
        return adminJson(payload);
    } catch (error) {
        return adminFailure(error, "stats");
    }
}
