import "server-only";

import type { PaddleEnvironment } from "@/lib/paddle";

/*
 * Paddle credentials come only from environment variables (see
 * docs/ENVIRONMENT.md and .env.example); nothing is hard-coded. The
 * environment (sandbox or live) follows the key prefixes, so moving to live
 * means replacing the variables, not the code.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const API_BASES: Record<PaddleEnvironment, string> = {
    sandbox: "https://sandbox-api.paddle.com",
    production: "https://api.paddle.com",
};

export type PaddleConfigWarning =
    /** The API key and the client-side token belong to different environments. */
    | "key_token_mismatch"
    /** NEXT_PUBLIC_PADDLE_ENV disagrees with the keys (the keys win). */
    | "environment_override_ignored"
    /** A secret was put in a NEXT_PUBLIC_ variable, which ships it to every browser. */
    | "public_secret"
    /** The client-side token looks like an API key. */
    | "token_is_api_key"
    | "api_key_format"
    | "client_token_format"
    | "webhook_secret_format";

export type PaddleConfig = {
    apiKey: string | null;
    clientToken: string | null;
    webhookSecret: string | null;
    environment: PaddleEnvironment;
    apiBase: string;
    warnings: PaddleConfigWarning[];
};

export type Env = Record<string, string | undefined>;

/** Trims whitespace and the quotes people paste around values in dashboards. */
export function cleanValue(value: string | undefined | null) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
    return trimmed || null;
}

function firstOf(env: Env, names: readonly string[]) {
    for (const name of names) {
        const value = cleanValue(env[name]);
        if (value) return value;
    }
    return null;
}

function keyEnvironment(apiKey: string | null): PaddleEnvironment | null {
    if (!apiKey) return null;
    if (apiKey.startsWith("pdl_sdbx_")) return "sandbox";
    if (apiKey.startsWith("pdl_live_")) return "production";
    return null;
}

function tokenEnvironment(token: string | null): PaddleEnvironment | null {
    if (!token) return null;
    if (token.startsWith("test_")) return "sandbox";
    if (token.startsWith("live_")) return "production";
    return null;
}

function explicitEnvironment(env: Env): PaddleEnvironment | null {
    const value = firstOf(env, ["NEXT_PUBLIC_PADDLE_ENV", "PADDLE_ENVIRONMENT", "PADDLE_ENV"])?.toLowerCase();
    if (value === "sandbox" || value === "test") return "sandbox";
    if (value === "production" || value === "live" || value === "prod") return "production";
    return null;
}

/** Loopback-only override of the API address, for tests and local end-to-end runs. */
function apiBaseOverride(env: Env) {
    const value = cleanValue(env.PADDLE_API_BASE_URL);
    if (!value) return null;
    try {
        const url = new URL(value);
        const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
        return loopback && (url.protocol === "http:" || url.protocol === "https:") ? url.origin : null;
    } catch {
        return null;
    }
}

export function getPaddleConfig(env: Env = process.env): PaddleConfig {
    const apiKey = firstOf(env, ["PADDLE_API_KEY", "PADDLE_SECRET_KEY"]);
    const clientToken = firstOf(env, ["NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "PADDLE_CLIENT_TOKEN", "NEXT_PUBLIC_PADDLE_TOKEN"]);
    const webhookSecret = firstOf(env, ["PADDLE_WEBHOOK_SECRET", "PADDLE_NOTIFICATION_WEBHOOK_SECRET", "PADDLE_WEBHOOK_SECRET_KEY"]);
    const fromKey = keyEnvironment(apiKey);
    const fromToken = tokenEnvironment(clientToken);
    const explicit = explicitEnvironment(env);
    const environment = fromKey ?? fromToken ?? explicit ?? "production";

    const warnings: PaddleConfigWarning[] = [];
    if (fromKey && fromToken && fromKey !== fromToken) warnings.push("key_token_mismatch");
    if (explicit && (fromKey ?? fromToken) && explicit !== (fromKey ?? fromToken)) warnings.push("environment_override_ignored");
    if (cleanValue(env.NEXT_PUBLIC_PADDLE_API_KEY) || cleanValue(env.NEXT_PUBLIC_PADDLE_WEBHOOK_SECRET)) warnings.push("public_secret");
    if (clientToken?.startsWith("pdl_")) warnings.push("token_is_api_key");
    if (apiKey && !/^pdl_(sdbx|live)_apikey_[A-Za-z0-9_]{20,}$/.test(apiKey) && !/^[a-z0-9]{50}$/.test(apiKey)) warnings.push("api_key_format");
    if (clientToken && !clientToken.startsWith("pdl_") && !/^(test|live)_[A-Za-z0-9]{10,}$/.test(clientToken)) warnings.push("client_token_format");
    if (webhookSecret && !webhookSecret.startsWith("pdl_ntfset_")) warnings.push("webhook_secret_format");

    return { apiKey, clientToken, webhookSecret, environment, apiBase: apiBaseOverride(env) ?? API_BASES[environment], warnings };
}

/** Checkouts need the server key and the browser token. */
export function isPaddleConfigured(config: PaddleConfig = getPaddleConfig()) {
    return Boolean(config.apiKey && config.clientToken && !config.clientToken.startsWith("pdl_"));
}

/** Paddle's own dashboard, for links in the Admin Panel. */
export function paddleDashboardUrl(environment: PaddleEnvironment, path: string) {
    return `${environment === "sandbox" ? "https://sandbox-vendors.paddle.com" : "https://vendors.paddle.com"}${path}`;
}

/** The environment the configured keys belong to (sandbox data is ignored in live and vice versa). */
export function currentPaddleEnvironment(env: Env = process.env): PaddleEnvironment {
    return getPaddleConfig(env).environment;
}
