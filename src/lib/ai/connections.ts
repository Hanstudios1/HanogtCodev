/**
 * Hanogt AI connections: people on Plus and Pro connect their own AI provider
 * accounts to Hanogt AI with their own API keys (PLAN_AI_CONNECTIONS).
 * Only the providers below can be used and their addresses are fixed here,
 * so a connection can never point the server at another host. Every one of
 * them speaks the OpenAI chat-completions protocol that /api/ai already uses.
 * Client-safe: storage, encryption and key checks live in
 * src/lib/server/ai-connections.ts, the API in /api/ai/connections.
 */
import type { Copy } from "@/lib/i18n";
import { PLAN_AI_CONNECTIONS, type PlanId } from "@/lib/plans";

export { PLAN_AI_CONNECTIONS };

export const AI_PROVIDER_IDS = ["openai", "anthropic", "gemini", "mistral", "openrouter", "deepseek", "xai", "together"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

/**
 * Providers that can no longer be connected. Connections people made with
 * them are still listed ("no longer supported") so they can be deleted, but
 * they are never used and don't take up the plan's allowance.
 */
export const RETIRED_PROVIDER_IDS = ["groq"] as const;
export type RetiredProviderId = (typeof RETIRED_PROVIDER_IDS)[number];
/** A provider a stored connection may name: a current one or a retired one. */
export type StoredProviderId = AiProviderId | RetiredProviderId;
const RETIRED_NAMES: Record<RetiredProviderId, string> = { groq: "Groq" };

/**
 * How a key is checked before it is stored:
 * - `models`: GET {baseUrl}/models with a Bearer token (the list fills the model picker);
 * - `anthropic`: Anthropic's native GET /v1/models with `x-api-key` and `anthropic-version`;
 * - `openrouter`: GET {baseUrl}/key (older accounts: /auth/key), then the public model list.
 */
export type AiKeyCheck = "models" | "anthropic" | "openrouter";

export type AiProvider = {
    id: AiProviderId;
    name: string;
    /** OpenAI-compatible base URL; chat goes to `${baseUrl}/chat/completions`. */
    baseUrl: string;
    check: AiKeyCheck;
    /** Where the person creates a key. */
    keyUrl: string;
    /** Placeholder of the key field (never a real key). */
    keyPlaceholder: string;
    /** What a key of this provider looks like. */
    keyFormat: Copy;
    /** A model id shown as an example when the model is typed by hand. */
    exampleModel: string;
    /** Prefix the provider's model list puts before ids that chat requests don't need. */
    modelPrefix?: string;
};

export const AI_PROVIDERS: readonly AiProvider[] = [
    {
        id: "openai",
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        check: "models",
        keyUrl: "https://platform.openai.com/api-keys",
        keyPlaceholder: "sk-…",
        keyFormat: { TR: "sk- ile başlar", EN: "Starts with sk-" },
        exampleModel: "gpt-4o-mini",
    },
    {
        id: "anthropic",
        name: "Anthropic Claude",
        // Anthropic's OpenAI SDK compatibility endpoint.
        baseUrl: "https://api.anthropic.com/v1",
        check: "anthropic",
        keyUrl: "https://console.anthropic.com/settings/keys",
        keyPlaceholder: "sk-ant-…",
        keyFormat: { TR: "sk-ant- ile başlar", EN: "Starts with sk-ant-" },
        exampleModel: "claude-sonnet-4-5",
    },
    {
        id: "gemini",
        name: "Google Gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        check: "models",
        keyUrl: "https://aistudio.google.com/app/apikey",
        keyPlaceholder: "AIza…",
        keyFormat: { TR: "AIza ile başlar", EN: "Starts with AIza" },
        exampleModel: "gemini-2.5-flash",
        modelPrefix: "models/",
    },
    {
        id: "mistral",
        name: "Mistral AI",
        baseUrl: "https://api.mistral.ai/v1",
        check: "models",
        keyUrl: "https://console.mistral.ai/api-keys",
        keyPlaceholder: "",
        keyFormat: { TR: "32 karakterlik, ön eksiz bir anahtar", EN: "A 32-character key without a prefix" },
        exampleModel: "mistral-large-latest",
    },
    {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        check: "openrouter",
        keyUrl: "https://openrouter.ai/settings/keys",
        keyPlaceholder: "sk-or-…",
        keyFormat: { TR: "sk-or- ile başlar", EN: "Starts with sk-or-" },
        exampleModel: "openai/gpt-4o-mini",
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        check: "models",
        keyUrl: "https://platform.deepseek.com/api_keys",
        keyPlaceholder: "sk-…",
        keyFormat: { TR: "sk- ile başlar", EN: "Starts with sk-" },
        exampleModel: "deepseek-chat",
    },
    {
        id: "xai",
        name: "xAI Grok",
        baseUrl: "https://api.x.ai/v1",
        check: "models",
        keyUrl: "https://console.x.ai",
        keyPlaceholder: "xai-…",
        keyFormat: { TR: "xai- ile başlar", EN: "Starts with xai-" },
        exampleModel: "grok-4",
    },
    {
        id: "together",
        name: "Together AI",
        baseUrl: "https://api.together.xyz/v1",
        check: "models",
        keyUrl: "https://api.together.ai/settings/api-keys",
        keyPlaceholder: "",
        keyFormat: { TR: "Together AI panelindeki API anahtarı", EN: "The API key from your Together AI dashboard" },
        exampleModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    },
];

/** Anthropic's native model list (the OpenAI-compatible layer has no key check of its own). */
export const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
export const ANTHROPIC_VERSION = "2023-06-01";

export function isAiProviderId(value: unknown): value is AiProviderId {
    return typeof value === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isRetiredProviderId(value: unknown): value is RetiredProviderId {
    return typeof value === "string" && (RETIRED_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isStoredProviderId(value: unknown): value is StoredProviderId {
    return isAiProviderId(value) || isRetiredProviderId(value);
}

/** A provider's display name, retired ones included. */
export function providerName(id: StoredProviderId): string {
    return isRetiredProviderId(id) ? RETIRED_NAMES[id] : aiProvider(id).name;
}

export function aiProvider(id: AiProviderId): AiProvider {
    return AI_PROVIDERS.find((provider) => provider.id === id) ?? AI_PROVIDERS[0];
}

/** At most this many connections are ever stored for one account (the largest plan allowance). */
export const MAX_STORED_AI_CONNECTIONS = Math.max(...Object.values(PLAN_AI_CONNECTIONS));

export const CONNECTION_LABEL_MAX = 60;
export const CONNECTION_MODEL_MAX = 200;
export const API_KEY_MIN = 8;
export const API_KEY_MAX = 512;
/** Model ids returned by a key check. */
export const MODEL_LIST_MAX = 500;

/** Value of the X-Hanogt-AI-Connection header when Hanogt AI's own model answered. */
export const DEFAULT_CONNECTION = "hanogt";

/** Connection ids are random UUIDs. */
export function isConnectionId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

/** API keys are printable ASCII without spaces; anything else is a paste mistake. */
export function isPlausibleApiKey(value: unknown): value is string {
    return typeof value === "string" && value.length >= API_KEY_MIN && value.length <= API_KEY_MAX && /^[\x21-\x7e]+$/.test(value);
}

/** The only part of a key that is ever shown again: its last four characters. */
export function keyHintOf(key: string) {
    return `…${key.slice(-4)}`;
}

// Model ids: no whitespace, quotes, angle brackets or control characters.
const MODEL_PATTERN = /^[^\s"'`\\<>\u0000-\u001f\u007f]+$/;

/** A model id as stored and sent (Gemini's "models/" prefix removed); "" when unusable. */
export function normalizeModelId(provider: StoredProviderId, value: unknown): string {
    if (typeof value !== "string") return "";
    let model = value.trim();
    const prefix = isAiProviderId(provider) ? aiProvider(provider).modelPrefix : undefined;
    if (prefix && model.startsWith(prefix)) model = model.slice(prefix.length);
    return model.length > 0 && model.length <= CONNECTION_MODEL_MAX && MODEL_PATTERN.test(model) ? model : "";
}

/** A label without control characters or runs of spaces; the fallback when empty. */
export function normalizeConnectionLabel(value: unknown, fallback: string): string {
    const label = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, CONNECTION_LABEL_MAX).trim() : "";
    return label || fallback;
}

// Embedding, speech, image, video, moderation and other non-chat models that model lists include.
const NON_CHAT_MODEL = /(?:embed|whisper|tts|dall-e|moderation|transcribe|imagen|veo-|rerank|aqa|sora|gpt-image|realtime|-audio|computer-use|babbage|davinci|guard|-ocr)/i;

/** Hides models that can't answer chat messages from the picker (they can still be typed by hand). */
export function isLikelyChatModel(id: string) {
    return !NON_CHAT_MODEL.test(id);
}

/** OpenAI's reasoning models take max_completion_tokens and only their default temperature. */
function isOpenAiReasoningModel(model: string) {
    return /^(?:o\d|gpt-5)/i.test(model);
}

/**
 * Sampling and length settings of an own-key chat request. OpenAI replaced
 * `max_tokens` with `max_completion_tokens` (its reasoning models reject the
 * old name and any non-default temperature); the others take `max_tokens`.
 * The person pays for their own tokens, so answers may be longer than Hanogt
 * AI's own (reasoning models also spend part of the budget thinking).
 */
export function ownKeyRequestParams(provider: AiProviderId, model: string, temperature: number): Record<string, number> {
    if (provider === "openai") {
        return isOpenAiReasoningModel(model) ? { max_completion_tokens: 8_000 } : { max_completion_tokens: 4_000, temperature };
    }
    // Anthropic's newer models reject a temperature next to their own sampling defaults: none is sent.
    if (provider === "anthropic") return { max_tokens: 4_000 };
    return { max_tokens: 4_000, temperature };
}

// ---------------------------------------------------------------------------
// API shapes (/api/ai/connections)
// ---------------------------------------------------------------------------

/** Why the last message through a connection failed (never the provider's own text). */
export const CONNECTION_ERRORS = ["invalid_key", "quota", "model_not_found", "rate_limited", "provider_error", "unreachable", "key_unreadable"] as const;
export type AiConnectionError = (typeof CONNECTION_ERRORS)[number];

export function isConnectionError(value: unknown): value is AiConnectionError {
    return typeof value === "string" && (CONNECTION_ERRORS as readonly string[]).includes(value);
}

export type AiProviderInfo = Pick<AiProvider, "id" | "name" | "keyUrl" | "keyPlaceholder" | "keyFormat" | "exampleModel">;

export function providerInfo(provider: AiProvider): AiProviderInfo {
    const { id, name, keyUrl, keyPlaceholder, keyFormat, exampleModel } = provider;
    return { id, name, keyUrl, keyPlaceholder, keyFormat, exampleModel };
}

/** A connection as the browser sees it: never the key, only its last four characters. */
export type AiConnectionView = {
    id: string;
    /** A retired provider's connection (RETIRED_PROVIDER_IDS) is listed only so it can be deleted. */
    provider: StoredProviderId;
    label: string;
    model: string;
    keyHint: string;
    createdAt: string;
    lastUsedAt: string | null;
    lastError: AiConnectionError | null;
    /** When the person gave explicit consent to sending their messages to this provider (KVKK m.9/6-a). */
    consentAt: string | null;
    /** Within the plan's allowance (the oldest connections first); inactive ones are kept but can't be used. */
    active: boolean;
    /** Its provider is no longer supported: it can only be deleted, and it doesn't count toward the plan's allowance. */
    retired: boolean;
};

/** GET /api/ai/connections and the result of add, update and delete. */
export type AiConnectionsState = {
    plan: PlanId;
    /** Connections the plan allows (PLAN_AI_CONNECTIONS). */
    limit: number;
    /** False when the server has no key to encrypt API keys with; nothing can be added then. */
    canStore: boolean;
    providers: AiProviderInfo[];
    items: AiConnectionView[];
};

export type AiKeyTestFailure = "invalid_key" | "provider_error" | "unreachable";
export type AiKeyTestResult = { ok: true; models: string[] } | { ok: false; reason: AiKeyTestFailure };

export type AiConnectionsErrorCode =
    | "plan_required" | "limit_reached" | "invalid_key" | "provider_error" | "unreachable" | "not_found" | "invalid_request" | "encryption_unavailable"
    | "consent_required" | "auth_required" | "forbidden_origin" | "rate_limited" | "conflict" | "unavailable";

export function isConnectionsState(value: unknown): value is AiConnectionsState {
    const state = value as AiConnectionsState | null;
    return Boolean(state && typeof state === "object" && typeof state.plan === "string" && typeof state.limit === "number" && Array.isArray(state.items) && Array.isArray(state.providers));
}
