/**
 * The Hanogt AI developer API as the browser and the docs see it: key views,
 * the /api/ai/keys state, the OpenAI-compatible endpoints under /api/v1 and
 * their error codes. Client-safe; keys are made, stored and checked in
 * src/lib/server/ai-api-keys.ts and src/lib/server/hanogt-ai-api.ts.
 */
import type { UsageWindow } from "@/lib/ai/usage";
import { PLAN_AI_FEATURES, isPlanId, type AiPlanLimits, type PlanId } from "@/lib/plans";

/** The only model the API serves (Hanogt AI's own model, whatever runs it). */
export const API_MODEL_ID = "hanogt-ai";
/** Endpoints live under this path of the site. */
export const API_BASE_PATH = "/api/v1";
/** A key's name as the person gives it. */
export const API_KEY_NAME_MAX = 40;
/** The most keys an account keeps, whatever its plan (Pro's allowance). */
export const API_KEYS_MAX_STORED = PLAN_AI_FEATURES.pro.api?.keys ?? 5;
/** A key: "hnk_" and 43 URL-safe base64 characters (32 random bytes). */
export const API_KEY_PATTERN = /^hnk_[A-Za-z0-9_-]{43}$/;
/** The developer's own system text in a request, at most. */
export const API_SYSTEM_MAX = 4_000;
/** Messages and characters a request may carry. */
export const API_MESSAGES_MAX = 50;
export const API_INPUT_CHARS_MAX = 100_000;

/** A key as its owner sees it: never the key itself or its hash. */
export type ApiKeyView = {
    id: string;
    name: string;
    /** The first eight characters ("hnk_" and four more) and the last four, to tell keys apart. */
    start: string;
    last4: string;
    createdAt: string | null;
    lastUsedAt: string | null;
    /** Within the plan's key allowance (the oldest keys stay active after a downgrade). */
    active: boolean;
};

/** GET /api/ai/keys and every change there. */
export type ApiKeysState = {
    plan: PlanId;
    /** Keys the plan allows (Free 0, Plus 2, Pro 5). */
    limit: number;
    /** Hanogt AI messages the plan allows (the API shares them with the chat); null on Free. */
    limits: AiPlanLimits | null;
    keys: ApiKeyView[];
    /** Messages counted in the current minute and window (chat and API together); null on Free. */
    usage: { minute: UsageWindow; window: UsageWindow; windowDays: number } | null;
    /** The team opened the API for this account (the ai_api feature). */
    allowed: boolean;
};

/** The answer to creating a key: the only time the key itself is shown. */
export type ApiKeyCreated = { key: string; item: ApiKeyView; state: ApiKeysState };

export function isApiKeysState(value: unknown): value is ApiKeysState {
    const state = value as ApiKeysState | null;
    return Boolean(state && typeof state === "object" && isPlanId(state.plan) && typeof state.limit === "number" && Array.isArray(state.keys) && typeof state.allowed === "boolean");
}

/** Error codes of /api/ai/keys (management, with a session). */
export type ApiKeysErrorCode = "auth_required" | "bad_origin" | "rate_limited" | "invalid_request" | "plan_required" | "limit_reached" | "feature_unavailable" | "not_found" | "conflict" | "unavailable";

/**
 * Error codes of /api/v1 (`error.code` in OpenAI's error shape); the docs
 * page lists them with their HTTP status.
 */
export const API_ERROR_CODES = [
    { code: "missing_api_key", status: 401 },
    { code: "invalid_api_key", status: 401 },
    { code: "account_suspended", status: 403 },
    { code: "plan_required", status: 403 },
    { code: "key_inactive", status: 403 },
    { code: "feature_unavailable", status: 403 },
    { code: "invalid_request", status: 400 },
    { code: "unsupported_parameter", status: 400 },
    { code: "model_not_found", status: 404 },
    { code: "context_length_exceeded", status: 413 },
    { code: "rate_limit_exceeded", status: 429 },
    { code: "upstream_error", status: 424 },
    { code: "service_unavailable", status: 503 },
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]["code"];
