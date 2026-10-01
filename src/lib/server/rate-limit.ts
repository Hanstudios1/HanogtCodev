import "server-only";

import { createHash } from "node:crypto";
import { getServerDocument, isWriteConflict, patchServerDocument } from "./firebase-rest";

type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export async function enforceRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET;
    if (!salt) throw new Error("Rate-limit anahtarı yapılandırılmamış.");
    const id = createHash("sha256").update(`${salt}:${key}`).digest("hex");
    const path = `security_rate_limits/${id}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const now = Date.now();
        const current = await getServerDocument<{ count?: number; windowStartedAt?: number }>(path);
        const active = current?.windowStartedAt && now - current.windowStartedAt < windowMs;
        const count = active ? Number(current?.count || 0) : 0;
        const startedAt = active ? Number(current!.windowStartedAt) : now;
        const retryAfterSeconds = Math.max(1, Math.ceil((startedAt + windowMs - now) / 1000));

        if (count >= limit) return { allowed: false, remaining: 0, retryAfterSeconds };

        try {
            await patchServerDocument(path, {
                count: count + 1,
                windowStartedAt: startedAt,
                expiresAt: new Date(startedAt + windowMs * 2),
            }, current?._updateTime ? { updateTime: current._updateTime } : { exists: false });
            return { allowed: true, remaining: Math.max(0, limit - count - 1), retryAfterSeconds };
        } catch (error) {
            // A parallel request updated the window first: read it again.
            if (isWriteConflict(error) && attempt < 2) continue;
            throw error;
        }
    }
    throw new Error("Rate-limit durumu güncellenemedi.");
}

const memoryWindows = new Map<string, { count: number; startedAt: number }>();

/**
 * Same limit as enforceRateLimit, but falls back to a per-instance in-memory
 * window when Firestore is not configured or unreachable, so a database outage
 * slows abuse down instead of switching the feature off for everyone.
 */
export async function enforceRateLimitWithFallback(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    try {
        return await enforceRateLimit(key, limit, windowMs);
    } catch (error) {
        console.warn("[rate-limit] Firestore unavailable, using in-memory window:", error instanceof Error ? error.message : error);
    }
    const now = Date.now();
    if (memoryWindows.size > 5_000) {
        for (const [entryKey, entry] of memoryWindows) if (now - entry.startedAt >= windowMs) memoryWindows.delete(entryKey);
    }
    const current = memoryWindows.get(key);
    const window = current && now - current.startedAt < windowMs ? current : { count: 0, startedAt: now };
    const retryAfterSeconds = Math.max(1, Math.ceil((window.startedAt + windowMs - now) / 1000));
    if (window.count >= limit) return { allowed: false, remaining: 0, retryAfterSeconds };
    window.count += 1;
    memoryWindows.set(key, window);
    return { allowed: true, remaining: Math.max(0, limit - window.count), retryAfterSeconds };
}
