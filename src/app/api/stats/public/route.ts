import { NextResponse } from "next/server";
import { countServerQuery, isFirebaseServerConfigured } from "@/lib/server/firebase-rest";
import type { PublicStats } from "@/lib/site";

export const runtime = "nodejs";

// Public totals for the About page; counts are cheap aggregations but still cached.
const CACHE_TTL_MS = 10 * 60_000;
const COUNT_CAP = 10_000_000;
const COLLECTIONS: Record<Exclude<keyof PublicStats, "generatedAt">, string> = {
    users: "users",
    projects: "projects",
    games: "arcade_games",
    posts: "media_posts",
};

let cache: { at: number; payload: PublicStats } | null = null;
let inflight: Promise<PublicStats> | null = null;

async function collect(): Promise<PublicStats> {
    const keys = Object.keys(COLLECTIONS) as Array<keyof typeof COLLECTIONS>;
    const values = await Promise.all(keys.map((key) => countServerQuery({ collectionId: COLLECTIONS[key], upTo: COUNT_CAP }).catch(() => null)));
    return { ...Object.fromEntries(keys.map((key, index) => [key, values[index]])) as Omit<PublicStats, "generatedAt">, generatedAt: new Date().toISOString() };
}

const unavailable = () => NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });

export async function GET() {
    if (!isFirebaseServerConfigured()) return unavailable();
    if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
        inflight ??= collect().finally(() => {
            inflight = null;
        });
        const payload = await inflight;
        // Don't keep a failed round; the next request tries again.
        if (Object.values(payload).filter((value) => typeof value === "number").length === 0) return unavailable();
        cache = { at: Date.now(), payload };
    }
    return NextResponse.json(cache.payload, {
        headers: {
            "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
