/**
 * Features the Hanogt team opens step by step. Each has an audience: "off",
 * "staff" (the Hanogt team only), "early" (early access: Pro and staff) or
 * "all". The defaults live here (the API and plan badges for everyone, voice
 * in early access); the team changes them in Admin ›
 * Subscriptions › Features and early access (site_config/features). The
 * server decides (src/lib/server/features.ts); the browser learns the result
 * from GET /api/features. Client-safe.
 */
import type { Copy } from "@/lib/i18n";
import type { PlanId } from "@/lib/plans";

export const FEATURE_IDS = ["ai_api", "plan_badge", "ai_voice"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export const FEATURE_AUDIENCES = ["off", "staff", "early", "all"] as const;
export type FeatureAudience = (typeof FEATURE_AUDIENCES)[number];

export type FeatureFlags = Record<FeatureId, FeatureAudience>;

export const FEATURES: Record<FeatureId, { defaultAudience: FeatureAudience; title: Copy; description: Copy }> = {
    ai_api: {
        defaultAudience: "all",
        title: { TR: "Hanogt AI API", EN: "Hanogt AI API" },
        description: { TR: "Plus ve Pro'da geliştirici API anahtarları ve /api/v1 uç noktaları.", EN: "Developer API keys and the /api/v1 endpoints on Plus and Pro." },
    },
    plan_badge: {
        defaultAudience: "all",
        title: { TR: "Plan rozeti", EN: "Plan badge" },
        description: { TR: "Plus ve Pro abonelerinin profilinde rozet.", EN: "A badge on Plus and Pro subscribers' profiles." },
    },
    ai_voice: {
        defaultAudience: "early",
        title: { TR: "Hanogt AI'da sesle yazma ve sesli dinleme", EN: "Dictation and read-aloud in Hanogt AI" },
        description: { TR: "Sesle yazma ve yanıtı sesli okuma (tarayıcının konuşma özelliği).", EN: "Dictation and reading answers aloud (the browser's speech features)." },
    },
};

export const FEATURE_AUDIENCE_COPY: Record<FeatureAudience, Copy> = {
    off: { TR: "Kapalı", EN: "Off" },
    staff: { TR: "Yalnızca ekip", EN: "Staff only" },
    early: { TR: "Erken erişim (Pro ve ekip)", EN: "Early access (Pro and staff)" },
    all: { TR: "Herkes", EN: "Everyone" },
};

export const DEFAULT_FEATURE_FLAGS = Object.fromEntries(FEATURE_IDS.map((id) => [id, FEATURES[id].defaultAudience])) as FeatureFlags;

export function isFeatureId(value: unknown): value is FeatureId {
    return typeof value === "string" && (FEATURE_IDS as readonly string[]).includes(value);
}

export function isFeatureAudience(value: unknown): value is FeatureAudience {
    return typeof value === "string" && (FEATURE_AUDIENCES as readonly string[]).includes(value);
}

/** Stored audiences; anything missing or unknown keeps its default. */
export function normalizeFeatureFlags(value: unknown): FeatureFlags {
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return Object.fromEntries(FEATURE_IDS.map((id) => [id, isFeatureAudience(record[id]) ? record[id] : DEFAULT_FEATURE_FLAGS[id]])) as FeatureFlags;
}

/** Who is asking: the Hanogt team or not, and the plan whose benefits apply (null: signed out). */
export type FeatureViewer = { staff: boolean; plan: PlanId };

/** Whether an audience includes the viewer. */
export function audienceAllows(audience: FeatureAudience, viewer: FeatureViewer | null): boolean {
    if (audience === "all") return true;
    if (!viewer || audience === "off") return false;
    if (audience === "staff") return viewer.staff;
    return viewer.staff || viewer.plan === "pro";
}

/** Which features are open to the viewer. */
export function allowedFeatures(flags: FeatureFlags, viewer: FeatureViewer | null): Record<FeatureId, boolean> {
    return Object.fromEntries(FEATURE_IDS.map((id) => [id, audienceAllows(flags[id], viewer)])) as Record<FeatureId, boolean>;
}

/**
 * Features still being opened step by step (staff only or early access):
 * what an "early access" list shows. Features opened to everyone are plain
 * plan benefits by then, and switched-off ones aren't announced.
 */
export function rolloutFeatures(flags: FeatureFlags): FeatureId[] {
    return FEATURE_IDS.filter((id) => flags[id] === "staff" || flags[id] === "early");
}

/** GET /api/features: what is open to the caller, and which features are still in a staged rollout. */
export type FeaturesResponse = { features: Record<FeatureId, boolean>; rollout: FeatureId[] };
