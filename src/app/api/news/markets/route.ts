import { NextRequest, NextResponse } from "next/server";
import { getMarketsSnapshot } from "@/lib/server/news";
import { getClientKey } from "@/lib/server/request-security";

export const runtime = "nodejs";

// Public read of an already cached response (five minutes in memory, five on the CDN), so a cheap
// per-instance window per client address is enough. A shared Firestore window would cost two
// document operations per request to protect something that never reaches the upstream providers.
const WINDOW_MS = 60_000;
const LIMIT_PER_CLIENT = 60;
/** Requests without a usable client address all share one bucket, so it gets a larger allowance. */
const LIMIT_UNKNOWN_CLIENT = 600;
const MAX_TRACKED_CLIENTS = 5_000;

const windows = new Map<string, { count: number; startedAt: number }>();

function takeToken(key: string, now: number): { allowed: boolean; retryAfterSeconds: number } {
    if (windows.size >= MAX_TRACKED_CLIENTS) {
        for (const [entryKey, entry] of windows) if (now - entry.startedAt >= WINDOW_MS) windows.delete(entryKey);
        // Under a flood of distinct addresses forget everybody rather than grow without bound.
        if (windows.size >= MAX_TRACKED_CLIENTS) windows.clear();
    }
    const current = windows.get(key);
    const window = current && now - current.startedAt < WINDOW_MS ? current : { count: 0, startedAt: now };
    const retryAfterSeconds = Math.max(1, Math.ceil((window.startedAt + WINDOW_MS - now) / 1000));
    const allowed = window.count < (key === "unknown" ? LIMIT_UNKNOWN_CLIENT : LIMIT_PER_CLIENT);
    if (allowed) window.count += 1;
    windows.set(key, window);
    return { allowed, retryAfterSeconds };
}

export async function GET(request: NextRequest) {
    const rate = takeToken(getClientKey(request), Date.now());
    if (!rate.allowed) {
        return NextResponse.json(
            { items: [], generatedAt: new Date().toISOString(), error: "Çok fazla istek." },
            { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
        );
    }
    try {
        const snapshot = await getMarketsSnapshot();
        return NextResponse.json(snapshot, {
            headers: {
                // An empty snapshot (every provider down) must not be pinned on the CDN for five minutes.
                "Cache-Control": snapshot.items.length ? "public, s-maxage=300, stale-while-revalidate=300" : "public, s-maxage=30",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch {
        return NextResponse.json(
            { items: [], generatedAt: new Date().toISOString(), error: "Piyasa verileri şu anda alınamıyor." },
            { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
        );
    }
}
