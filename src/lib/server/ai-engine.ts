import "server-only";

import { DEFAULT_ENGINE_SETTINGS, isEngineEffort, isEngineModel, normalizeEngineSettings, type AiEngineSettings } from "@/lib/ai/engine";
import type { PlanId } from "@/lib/plans";
import { getServerDocument } from "./firebase-rest";

/*
 * The advanced code engine's settings (site_config/ai_engine = { settings,
 * updatedAt, updatedBy }), read like the feature flags: cached for a minute.
 * The environment gives the defaults (HANOGT_AI_CLAUDE_MODEL,
 * HANOGT_AI_CLAUDE_EFFORT) and the key (ANTHROPIC_API_KEY); without the key
 * the standard engine answers everything. Kept free of next/server so the
 * plain-Node tests can load it.
 */

export const AI_ENGINE_PATH = "site_config/ai_engine";
const CACHE_MS = 60_000;

let cache: { settings: AiEngineSettings; at: number } | null = null;

/** The built-in defaults with the environment's model and effort over them (when valid). */
export function engineDefaults(): AiEngineSettings {
    const model = (process.env.HANOGT_AI_CLAUDE_MODEL || "").trim();
    const effort = (process.env.HANOGT_AI_CLAUDE_EFFORT || "").trim();
    return {
        ...DEFAULT_ENGINE_SETTINGS,
        ...(isEngineModel(model) ? { model } : {}),
        ...(isEngineEffort(effort) ? { effort } : {}),
    };
}

export async function getEngineSettings(fresh = false): Promise<AiEngineSettings> {
    if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.settings;
    try {
        const record = await getServerDocument<{ settings?: unknown }>(AI_ENGINE_PATH);
        const settings = normalizeEngineSettings(record?.settings, engineDefaults());
        cache = { settings, at: Date.now() };
        return settings;
    } catch (error) {
        // Unreadable: the last settings known, else the defaults.
        console.warn("[ai-engine]", error instanceof Error ? error.message : error);
        return cache?.settings ?? engineDefaults();
    }
}

export function forgetEngineCache() {
    cache = null;
}

/** Claude's key and address; null when the server has no key (or an address that isn't https or this machine). */
export function claudeConfig(): { apiKey: string; baseURL?: string } | null {
    const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!apiKey) return null;
    const base = (process.env.ANTHROPIC_BASE_URL || "").trim().replace(/\/+$/, "");
    if (!base) return { apiKey };
    try {
        const url = new URL(base);
        const local = url.protocol === "http:" && /^(?:127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname);
        return url.protocol === "https:" || local ? { apiKey, baseURL: base } : null;
    } catch {
        return null;
    }
}

/** Each plan's advanced answers a day when the server has the engine and it is on (the usage lists); null otherwise. */
export async function engineAllowances(): Promise<Record<PlanId, number> | null> {
    if (!claudeConfig()) return null;
    const settings = await getEngineSettings().catch(() => null);
    return settings?.enabled ? settings.daily : null;
}

/** The admin's write (committed by the admin route with its audit entry). */
export function engineSettingsWrite(settings: AiEngineSettings, by: string, now = new Date()) {
    return {
        type: "update" as const,
        path: AI_ENGINE_PATH,
        data: { settings, updatedAt: now, updatedBy: by },
        updateFields: ["settings", "updatedAt", "updatedBy"],
    };
}

/** What Admin › Subscriptions shows: the settings, whether the server has a key, and the last change. */
export async function engineOverview() {
    const record = await getServerDocument<{ settings?: unknown; updatedAt?: unknown; updatedBy?: unknown }>(AI_ENGINE_PATH).catch(() => null);
    const updatedAt = record?.updatedAt instanceof Date ? record.updatedAt.toISOString() : typeof record?.updatedAt === "string" ? record.updatedAt : null;
    return {
        settings: normalizeEngineSettings(record?.settings, engineDefaults()),
        configured: claudeConfig() !== null,
        updatedAt,
        updatedBy: typeof record?.updatedBy === "string" ? record.updatedBy : null,
    };
}
