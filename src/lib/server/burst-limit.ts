import "server-only";

import { enforceRateLimitWithFallback } from "./rate-limit";

export type BurstLimitResult = { allowed: boolean; retryAfterSeconds: number };

const buckets = new Map<string, { tokens: number; at: number }>();
const samples = new Map<string, { checkedAt: number; blockedUntil: number }>();

function prune(now: number) {
    if (buckets.size > 10_000) for (const [key, bucket] of buckets) if (now - bucket.at > 60_000) buckets.delete(key);
    if (samples.size > 10_000) for (const [key, sample] of samples) if (now - sample.checkedAt > 3_600_000 && sample.blockedUntil < now) samples.delete(key);
}

/**
 * Rate limit for endpoints a browser polls every second or two (call
 * signalling). The shared limiter writes one Firestore document per call,
 * which is too slow and costly at that rate, so each server instance keeps a
 * token bucket per key and consults the shared limiter at most every five
 * seconds per key (`sampleEveryMs`): spreading requests over many instances
 * still runs into `sampledPerHour`. Same approach as the live-collaboration
 * endpoints.
 */
export async function burstLimit(key: string, perSecond: number, burst: number, sampledPerHour: number, sampleEveryMs = 5_000): Promise<BurstLimitResult> {
    const now = Date.now();
    prune(now);
    const bucket = buckets.get(key) ?? { tokens: burst, at: now };
    bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * perSecond);
    bucket.at = now;
    buckets.set(key, bucket);
    if (bucket.tokens < 1) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / perSecond)) };
    bucket.tokens -= 1;
    const sample = samples.get(key);
    if (sample && sample.blockedUntil > now) return { allowed: false, retryAfterSeconds: Math.ceil((sample.blockedUntil - now) / 1000) };
    if (!sample || now - sample.checkedAt >= sampleEveryMs) {
        samples.set(key, { checkedAt: now, blockedUntil: 0 });
        const result = await enforceRateLimitWithFallback(`${key}:sampled`, sampledPerHour, 3_600_000).catch(() => null);
        if (result && !result.allowed) {
            samples.set(key, { checkedAt: now, blockedUntil: now + result.retryAfterSeconds * 1000 });
            return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
        }
    }
    return { allowed: true, retryAfterSeconds: 0 };
}
