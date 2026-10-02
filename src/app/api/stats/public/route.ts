import { NextResponse, type NextRequest } from "next/server";
import { countServerQuery, isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getClientKey } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public site statistics for the landing page and /about. Unauthenticated and
 * deliberately boring: document totals per collection and nothing else, never
 * anything about a person. Every count is best effort (null when it fails).
 */
const COLLECTIONS = {
    users: "users",
    projects: "projects",
    gameProjects: "game_projects",
    arcadeGames: "arcade_games",
    mediaPosts: "media_posts",
    groups: "groups",
} as const;

type StatKey = keyof typeof COLLECTIONS;
type PublicStats = Record<StatKey, number | null> & { generatedAt: string };

const KEYS = Object.keys(COLLECTIONS) as StatKey[];
/** Per server instance; the CDN keeps its own copy for the same time (s-maxage). */
const CACHE_TTL_MS = 10 * 60_000;
/** After a failed count the next visitor retries soon instead of everyone seeing "unknown" for ten minutes. */
const RETRY_TTL_MS = 60_000;
/** COUNT() stops here (billed per 1000 index entries); far above anything the site has. */
const COUNT_CAP = 1_000_000;
/** The Firestore REST helper has no timeout of its own and this route must never hang. */
const COUNT_TIMEOUT_MS = 8_000;
const REQUESTS_PER_MINUTE = 30;
/** Hosts without trusted IP headers put every visitor into one bucket ("unknown"). */
const REQUESTS_PER_MINUTE_UNKNOWN_CLIENT = 240;

const CACHE_CONTROL_FULL = "public, s-maxage=600";
const CACHE_CONTROL_PARTIAL = "public, s-maxage=60";

type Snapshot = {
    at: number;
    /** How long this snapshot may be served before the next visitor recounts. */
    ttl: number;
    /** False when a count failed in this round (carried-over numbers don't make it complete). */
    complete: boolean;
    stats: PublicStats;
};

let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number) {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error: unknown) => { clearTimeout(timer); reject(error); },
        );
    });
}

async function countOrNull(key: StatKey) {
    try {
        const total = await withTimeout(countServerQuery({ collectionId: COLLECTIONS[key], upTo: COUNT_CAP }), COUNT_TIMEOUT_MS);
        return Number.isFinite(total) && total >= 0 ? Math.trunc(total) : null;
    } catch (error) {
        console.warn(`[stats:public] ${key} count failed:`, error instanceof Error ? error.message : error);
        return null;
    }
}

async function compute(): Promise<Snapshot> {
    const previous = cache?.stats ?? null;
    // Without server credentials every count would only log the same failure.
    const counts = isFirebaseServerConfigured() ? await Promise.all(KEYS.map(countOrNull)) : KEYS.map(() => null);
    const stats = { generatedAt: new Date().toISOString() } as PublicStats;
    let complete = true;
    KEYS.forEach((key, index) => {
        const fresh = counts[index];
        if (fresh === null) complete = false;
        // A count that fails now keeps the last good number instead of blanking the tile.
        stats[key] = fresh ?? previous?.[key] ?? null;
    });
    cache = { at: Date.now(), ttl: complete ? CACHE_TTL_MS : RETRY_TTL_MS, complete, stats };
    return cache;
}

/** Concurrent visitors on a cold cache share one round of counting. */
function currentSnapshot() {
    if (cache && Date.now() - cache.at < cache.ttl) return Promise.resolve(cache);
    if (!inflight) inflight = compute().finally(() => { inflight = null; });
    return inflight;
}

function ordered(stats: PublicStats) {
    return {
        users: stats.users,
        projects: stats.projects,
        gameProjects: stats.gameProjects,
        arcadeGames: stats.arcadeGames,
        mediaPosts: stats.mediaPosts,
        groups: stats.groups,
        generatedAt: stats.generatedAt,
    };
}

export async function GET(request: NextRequest) {
    const client = getClientKey(request);
    // Fails open: if the rate-limit store is down the landing page keeps its numbers.
    const rate = await enforceRateLimit(
        `stats-public:${client}`,
        client === "unknown" ? REQUESTS_PER_MINUTE_UNKNOWN_CLIENT : REQUESTS_PER_MINUTE,
        60_000,
    ).catch(() => null);
    if (rate && !rate.allowed) {
        return NextResponse.json({ error: "Çok fazla istek. Biraz sonra tekrar deneyin." }, {
            status: 429,
            headers: { "Cache-Control": "no-store", "Retry-After": String(rate.retryAfterSeconds), "X-Content-Type-Options": "nosniff" },
        });
    }
    try {
        const { stats, complete } = await currentSnapshot();
        return NextResponse.json(ordered(stats), {
            headers: { "Cache-Control": complete ? CACHE_CONTROL_FULL : CACHE_CONTROL_PARTIAL, "X-Content-Type-Options": "nosniff" },
        });
    } catch {
        return NextResponse.json({ error: "İstatistikler şu anda alınamıyor." }, {
            status: 503,
            headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
    }
}
