import "server-only";

import { createHash } from "node:crypto";
import { deleteServerDocument, getServerDocument, isWriteConflict, patchServerDocument } from "./firebase-rest";

export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
    /** When the counted window opened (ms): what releaseFromWindow needs to give a count back to the same window. */
    windowStartedAt: number;
    /** Counted in this instance's memory because Firestore was unavailable. */
    memory?: boolean;
};

/**
 * Counts `cost` (1 by default: one request) in a fixed window that starts
 * with the first use; refused when it would go past `limit`. A cost above 1
 * counts several things at once (e.g. the files of one run).
 */
export async function enforceRateLimit(key: string, limit: number, windowMs: number, cost = 1): Promise<RateLimitResult> {
    const path = rateLimitPath(key);
    const amount = Math.max(1, Math.floor(cost));

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const now = Date.now();
        const current = await getServerDocument<{ count?: number; windowStartedAt?: number }>(path);
        const active = current?.windowStartedAt && now - current.windowStartedAt < windowMs;
        const count = active ? Number(current?.count || 0) : 0;
        const startedAt = active ? Number(current!.windowStartedAt) : now;
        const retryAfterSeconds = Math.max(1, Math.ceil((startedAt + windowMs - now) / 1000));

        if (count + amount > limit) return { allowed: false, remaining: Math.max(0, limit - count), retryAfterSeconds, windowStartedAt: startedAt };

        try {
            await patchServerDocument(path, {
                count: count + amount,
                windowStartedAt: startedAt,
                expiresAt: new Date(startedAt + windowMs * 2),
            }, current?._updateTime ? { updateTime: current._updateTime } : { exists: false });
            return { allowed: true, remaining: Math.max(0, limit - count - amount), retryAfterSeconds, windowStartedAt: startedAt };
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
export async function enforceRateLimitWithFallback(key: string, limit: number, windowMs: number, cost = 1): Promise<RateLimitResult> {
    try {
        return await enforceRateLimit(key, limit, windowMs, cost);
    } catch (error) {
        console.warn("[rate-limit] Firestore unavailable, using in-memory window:", error instanceof Error ? error.message : error);
    }
    return memoryRateLimit(key, limit, windowMs, cost);
}

/**
 * A window kept only in this server instance's memory: a cheap guard for
 * read-only routes that shouldn't cost a database write per request (each
 * instance counts on its own), and the fallback above.
 */
export function memoryRateLimit(key: string, limit: number, windowMs: number, cost = 1): RateLimitResult {
    const now = Date.now();
    const amount = Math.max(1, Math.floor(cost));
    if (memoryWindows.size > 5_000) {
        for (const [entryKey, entry] of memoryWindows) if (now - entry.startedAt >= windowMs) memoryWindows.delete(entryKey);
    }
    const current = memoryWindows.get(key);
    const window = current && now - current.startedAt < windowMs ? current : { count: 0, startedAt: now };
    const retryAfterSeconds = Math.max(1, Math.ceil((window.startedAt + windowMs - now) / 1000));
    if (window.count + amount > limit) return { allowed: false, remaining: Math.max(0, limit - window.count), retryAfterSeconds, windowStartedAt: window.startedAt, memory: true };
    window.count += amount;
    memoryWindows.set(key, window);
    return { allowed: true, remaining: Math.max(0, limit - window.count), retryAfterSeconds, windowStartedAt: window.startedAt, memory: true };
}

/**
 * Gives `amount` back to a window (a message the model never answered),
 * only while it is the same window that counted it (`startedAt`) and never
 * below zero; nothing is created when no window is open. Best effort:
 * returns whether something was given back.
 */
export async function releaseFromWindow(key: string, windowMs: number, startedAt: number, amount = 1, memory = false): Promise<boolean> {
    const value = Math.max(1, Math.floor(amount));
    if (memory) {
        const window = memoryWindows.get(key);
        if (!window || window.startedAt !== startedAt || Date.now() - window.startedAt >= windowMs) return false;
        window.count = Math.max(0, window.count - value);
        return true;
    }
    const path = rateLimitPath(key);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await getServerDocument<{ count?: number; windowStartedAt?: number }>(path);
        if (!current?._updateTime || Number(current.windowStartedAt) !== startedAt || Date.now() - startedAt >= windowMs) return false;
        const count = Number(current.count || 0);
        if (count <= 0) return false;
        try {
            await patchServerDocument(path, { count: Math.max(0, count - value), windowStartedAt: startedAt, expiresAt: new Date(startedAt + windowMs * 2) }, { updateTime: current._updateTime });
            return true;
        } catch (error) {
            if (isWriteConflict(error) && attempt < 2) continue;
            throw error;
        }
    }
    return false;
}

/** Document of one rate-limit window (keys are hashed so the stored ids reveal nothing). */
function rateLimitPath(key: string) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET;
    if (!salt) throw new Error("Rate-limit anahtarı yapılandırılmamış.");
    return `security_rate_limits/${createHash("sha256").update(`${salt}:${key}`).digest("hex")}`;
}

/** How much of a window is used right now (staff screens); null when no window is open. */
export async function readRateLimit(key: string, windowMs: number): Promise<{ count: number; resetsAt: string } | null> {
    const current = await getServerDocument<{ count?: number; windowStartedAt?: number }>(rateLimitPath(key));
    if (!current?.windowStartedAt || Date.now() - current.windowStartedAt >= windowMs) return null;
    return { count: Number(current.count || 0), resetsAt: new Date(current.windowStartedAt + windowMs).toISOString() };
}

/** Starts a key's window afresh (e.g. staff resetting someone's Hanogt AI limit). */
export async function resetRateLimit(key: string) {
    memoryWindows.delete(key);
    await deleteServerDocument(rateLimitPath(key));
}
