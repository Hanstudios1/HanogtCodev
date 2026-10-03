import "server-only";

import { DEFAULT_FEATURE_FLAGS, audienceAllows, normalizeFeatureFlags, type FeatureAudience, type FeatureFlags, type FeatureId, type FeatureViewer } from "@/lib/features";
import { getServerDocument } from "./firebase-rest";

/*
 * The team's feature audiences (site_config/features = { audiences, updatedAt,
 * updatedBy }), read like the plan catalog: cached for a minute, defaults when
 * nothing is stored. Who is staff is passed in, so this module stays free of
 * the admin session code and the plain-Node tests can load it.
 */

export const FEATURES_PATH = "site_config/features";
const CACHE_MS = 60_000;

let cache: { flags: FeatureFlags; at: number } | null = null;

export async function getFeatureFlags(fresh = false): Promise<FeatureFlags> {
    if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.flags;
    try {
        const record = await getServerDocument<{ audiences?: unknown }>(FEATURES_PATH);
        const flags = normalizeFeatureFlags(record?.audiences);
        cache = { flags, at: Date.now() };
        return flags;
    } catch (error) {
        // Unreadable: the last flags known, else the defaults.
        console.warn("[features]", error instanceof Error ? error.message : error);
        return cache?.flags ?? DEFAULT_FEATURE_FLAGS;
    }
}

export function forgetFeatureCache() {
    cache = null;
}

/** Whether `id` is open to the viewer (null: signed out). */
export async function featureAllowed(id: FeatureId, viewer: FeatureViewer | null): Promise<boolean> {
    return audienceAllows((await getFeatureFlags())[id], viewer);
}

/** The write that sets one feature's audience (committed by the admin route with its audit entry). */
export function featureAudienceWrite(id: FeatureId, audience: FeatureAudience, by: string, now = new Date()) {
    return {
        type: "update" as const,
        path: FEATURES_PATH,
        data: { audiences: { [id]: audience }, updatedAt: now, updatedBy: by },
        updateFields: [`audiences.${id}`, "updatedAt", "updatedBy"],
    };
}
