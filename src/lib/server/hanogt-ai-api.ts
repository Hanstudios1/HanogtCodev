import "server-only";

import { randomBytes } from "node:crypto";
import { API_INPUT_CHARS_MAX, API_KEY_PATTERN, API_MESSAGES_MAX, API_MODEL_ID, API_SYSTEM_MAX, type ApiErrorCode } from "@/lib/ai/api-keys";
import { PLAN_AI_FEATURES, effectivePlan, type PlanId, type UserSubscription } from "@/lib/plans";
import { activeKeyIds, findApiKey, storedApiKeys } from "./ai-api-keys";
import { enforceApiRequests } from "./ai-usage";
import type { HealOptions } from "./entitlements";
import { featureAllowed } from "./features";
import { getServerDocument } from "./firebase-rest";
import type { AiAnswerMode } from "./hanogt-ai";
import { getSubscription } from "./plans";
import { memoryRateLimit } from "./rate-limit";
import { resolveUserRole } from "./roles";

/*
 * The Hanogt AI developer API (/api/v1), an OpenAI-compatible subset: who is
 * calling (an hnk_ key, never a session or cookie), what they may send, and
 * the answer in OpenAI's shapes (chat.completion, chat.completion.chunk
 * events ending with [DONE], { error: { message, type, code, param } }).
 * The routes stay thin; this module is free of next/server so the plain-Node
 * tests can load it.
 */

export type ApiErrorType = "invalid_request_error" | "authentication_error" | "permission_error" | "rate_limit_error" | "api_error";

export type ApiFailure = {
    status: number;
    code: ApiErrorCode;
    message: string;
    param?: string | null;
    headers?: Record<string, string>;
};

const ERROR_TYPES: Record<number, ApiErrorType> = { 400: "invalid_request_error", 401: "authentication_error", 403: "permission_error", 404: "invalid_request_error", 413: "invalid_request_error", 429: "rate_limit_error" };

/** OpenAI's error body, so SDKs raise their usual errors (AuthenticationError, RateLimitError…). */
export function apiErrorBody(failure: ApiFailure) {
    return { error: { message: failure.message, type: ERROR_TYPES[failure.status] ?? "api_error", code: failure.code, param: failure.param ?? null } };
}

const failure = (status: number, code: ApiErrorCode, message: string, extra: Partial<ApiFailure> = {}): { ok: false; failure: ApiFailure } => ({ ok: false, failure: { status, code, message, ...extra } });

// ---------------------------------------------------------------------------
// Who is calling
// ---------------------------------------------------------------------------

/** Requests one address may send a minute, whatever the keys (a first, cheap filter before any read). */
const IP_REQUESTS_PER_MINUTE = 300;

export type ApiCaller = {
    email: string;
    keyId: string;
    /** For noting when the key was last used. */
    key: { hash: string; lastUsedAt: string | null };
    plan: PlanId;
    staff: boolean;
    subscription: UserSubscription;
};

/**
 * Checks a request's key, cheapest first: its form (nothing is read for a
 * malformed one), the sending address, the key's index entry, then the
 * account (gone, suspended), its plan (Plus or Pro, the key within the
 * plan's allowance) and whether the team opened the API for it. Nothing is
 * counted here; reads that fail throw (the route answers 503).
 */
export async function authenticateApiCaller(authorization: string | null, ip: string): Promise<{ ok: true; caller: ApiCaller } | { ok: false; failure: ApiFailure }> {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
    if (!match) return failure(401, "missing_api_key", "No API key was sent. Send it in the header Authorization: Bearer hnk_…");
    const key = match[1];
    if (!API_KEY_PATTERN.test(key)) return failure(401, "invalid_api_key", "The API key is not valid. Hanogt AI keys start with hnk_.");

    const address = memoryRateLimit(`ai-api-ip:${ip}`, IP_REQUESTS_PER_MINUTE, 60_000);
    if (!address.allowed) return failure(429, "rate_limit_exceeded", "Too many requests from this address. Slow down and try again.", { headers: { "Retry-After": String(address.retryAfterSeconds) } });

    const found = await findApiKey(key);
    if (!found) return failure(401, "invalid_api_key", "The API key is not valid. It may have been revoked.");
    const [user, subscription, keys] = await Promise.all([
        getServerDocument<Record<string, unknown>>(`users/${found.email}`),
        getSubscription(found.email),
        storedApiKeys(found.email),
    ]);
    // A deleted account: its keys went with it.
    if (!user || !keys.some((stored) => stored.id === found.id)) return failure(401, "invalid_api_key", "The API key is not valid. It may have been revoked.");
    if (user.banned || user.suspended) return failure(403, "account_suspended", "The account this key belongs to is suspended.");
    const plan = effectivePlan(subscription);
    if (!PLAN_AI_FEATURES[plan].api) return failure(403, "plan_required", "The Hanogt AI API needs the Plus or Pro plan.");
    if (!activeKeyIds(keys, plan).has(found.id)) return failure(403, "key_inactive", "This key is outside your plan's key allowance. Use one of your older keys, revoke a key or upgrade your plan.");
    const staff = resolveUserRole(found.email, user.role) !== "user";
    if (!(await featureAllowed("ai_api", { staff, plan }))) return failure(403, "feature_unavailable", "The Hanogt AI API isn't open to this account yet.");
    return { ok: true, caller: { email: found.email, keyId: found.id, key: { hash: found.hash, lastUsedAt: found.lastUsedAt }, plan, staff, subscription } };
}

/** The x-ratelimit-* headers of a counted request (OpenAI's names for the minute, ours for the day). */
export function apiRateHeaders(minute: { limit: number; remaining: number; resetsAt: string }, day: { limit: number; remaining: number; resetsAt: string | null }, now = Date.now()): Record<string, string> {
    const seconds = Math.max(0, Math.ceil((Date.parse(minute.resetsAt) - now) / 1000));
    return {
        "x-ratelimit-limit-requests": String(minute.limit),
        "x-ratelimit-remaining-requests": String(minute.remaining),
        "x-ratelimit-reset-requests": `${Number.isFinite(seconds) ? seconds : 60}s`,
        "x-hanogt-ratelimit-limit-day": String(day.limit),
        "x-hanogt-ratelimit-remaining-day": String(day.remaining),
        ...(day.resetsAt ? { "x-hanogt-ratelimit-reset-day": day.resetsAt } : {}),
    };
}

/** Counts one request in the account's minute and day windows (Plus 10 / 250, Pro 30 / 1,000). */
export async function countApiRequest(caller: ApiCaller, options: HealOptions = {}): Promise<{ ok: true; headers: Record<string, string> } | { ok: false; failure: ApiFailure }> {
    const counted = await enforceApiRequests(caller.email, caller.subscription, options);
    if (counted.ok) return { ok: true, headers: apiRateHeaders(counted.minute, counted.quota) };
    if (counted.code === "connection_unavailable") return failure(403, "plan_required", "The Hanogt AI API needs the Plus or Pro plan.");
    const perMinute = counted.code === "rate_limited";
    const message = perMinute
        ? `Rate limit reached: ${counted.limit} requests per minute on your plan. Try again in ${counted.retryAfterSeconds} s.`
        : `Daily limit reached: ${counted.limit} requests in 24 hours on your plan. It renews at ${counted.resetsAt}.`;
    return failure(429, "rate_limit_exceeded", message, { headers: { "Retry-After": String(counted.retryAfterSeconds) } });
}

// ---------------------------------------------------------------------------
// What may be sent
// ---------------------------------------------------------------------------

export type CompletionRequest = {
    /** The conversation, oldest first; it ends with the user's turn. */
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    /** The developer's system and developer messages, joined ("" without any). */
    system: string;
    stream: boolean;
    temperature: number | null;
    topP: number | null;
    stop: string[] | null;
    /** The longest answer: the request's own limit, never more than the plan's (Plus 3,000, Pro 4,000 tokens). */
    maxTokens: number;
    mode: AiAnswerMode;
    language: string;
};

/** Parameters that would need tools or several answers: refused rather than silently ignored. */
const UNSUPPORTED = ["tools", "functions", "function_call", "n", "audio", "modalities", "prediction"] as const;

function textOf(content: unknown): string | null {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return null;
    let text = "";
    for (const part of content) {
        if (!part || typeof part !== "object" || (part as { type?: unknown }).type !== "text" || typeof (part as { text?: unknown }).text !== "string") return null;
        text += (text ? "\n" : "") + (part as { text: string }).text;
    }
    return text;
}

/**
 * A chat.completions body, checked: model "hanogt-ai", text messages
 * (system/developer, user, assistant) ending with the user, at most 50
 * messages and 100,000 characters, the developer's system text at most
 * 4,000. Hanogt's own extras: `mode` (general, code, security) and
 * `language` (a two-letter code for the answer's language).
 */
export function parseCompletionRequest(body: Record<string, unknown> | null, plan: PlanId): { ok: true; request: CompletionRequest } | { ok: false; failure: ApiFailure } {
    if (!body) return failure(400, "invalid_request", "The body must be a JSON object.");
    if (body.model !== undefined && body.model !== API_MODEL_ID) return failure(404, "model_not_found", `The model "${String(body.model).slice(0, 60)}" doesn't exist. Use "${API_MODEL_ID}".`, { param: "model" });
    for (const name of UNSUPPORTED) {
        const value = body[name];
        if (value === undefined || value === null || (name === "n" && value === 1) || (Array.isArray(value) && !value.length)) continue;
        return failure(400, "unsupported_parameter", `"${name}" isn't supported: Hanogt AI answers with one text message.`, { param: name });
    }
    if (body.tool_choice !== undefined && body.tool_choice !== null && body.tool_choice !== "none") return failure(400, "unsupported_parameter", "\"tool_choice\" isn't supported.", { param: "tool_choice" });
    const format = body.response_format as { type?: unknown } | undefined;
    if (format !== undefined && format !== null && (typeof format !== "object" || format.type !== "text")) return failure(400, "unsupported_parameter", "Only the text response format is supported.", { param: "response_format" });
    if (body.stream !== undefined && typeof body.stream !== "boolean") return failure(400, "invalid_request", "\"stream\" must be true or false.", { param: "stream" });

    const number = (name: string, min: number, max: number) => {
        const value = body[name];
        if (value === undefined || value === null) return { ok: true as const, value: null };
        return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? { ok: true as const, value } : { ok: false as const };
    };
    const temperature = number("temperature", 0, 2);
    if (!temperature.ok) return failure(400, "invalid_request", "\"temperature\" must be a number from 0 to 2.", { param: "temperature" });
    const topP = number("top_p", 0, 1);
    if (!topP.ok) return failure(400, "invalid_request", "\"top_p\" must be a number from 0 to 1.", { param: "top_p" });
    const planMax = PLAN_AI_FEATURES[plan].maxTokens;
    const tokenParam = body.max_completion_tokens !== undefined && body.max_completion_tokens !== null ? "max_completion_tokens" : "max_tokens";
    const tokens = number(tokenParam, 1, 1_000_000);
    if (!tokens.ok || (tokens.value !== null && !Number.isInteger(tokens.value))) return failure(400, "invalid_request", `"${tokenParam}" must be a positive whole number.`, { param: tokenParam });

    let stop: string[] | null = null;
    if (body.stop !== undefined && body.stop !== null) {
        const list = typeof body.stop === "string" ? [body.stop] : body.stop;
        if (!Array.isArray(list) || list.length > 4 || list.some((entry) => typeof entry !== "string" || !entry || entry.length > 100)) return failure(400, "invalid_request", "\"stop\" must be a string or up to 4 strings.", { param: "stop" });
        stop = list as string[];
    }
    const mode = body.mode === undefined || body.mode === null ? "general" : body.mode;
    if (mode !== "general" && mode !== "code" && mode !== "security") return failure(400, "invalid_request", "\"mode\" must be general, code or security.", { param: "mode" });
    const language = body.language === undefined || body.language === null ? "EN" : typeof body.language === "string" && /^[A-Za-z]{2}$/.test(body.language) ? body.language.toUpperCase() : null;
    if (!language) return failure(400, "invalid_request", "\"language\" must be a two-letter language code such as en or tr.", { param: "language" });

    if (!Array.isArray(body.messages) || !body.messages.length) return failure(400, "invalid_request", "\"messages\" must be a non-empty array.", { param: "messages" });
    if (body.messages.length > API_MESSAGES_MAX) return failure(400, "invalid_request", `At most ${API_MESSAGES_MAX} messages can be sent.`, { param: "messages" });
    const system: string[] = [];
    const messages: CompletionRequest["messages"] = [];
    let characters = 0;
    for (const [index, entry] of body.messages.entries()) {
        const message = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
        const role = message?.role;
        if (role === "tool" || role === "function" || (role === "assistant" && message?.tool_calls)) return failure(400, "unsupported_parameter", "Tool messages aren't supported.", { param: `messages[${index}]` });
        const text = message ? textOf(message.content) : null;
        if ((role !== "system" && role !== "developer" && role !== "user" && role !== "assistant") || text === null) {
            return failure(400, "invalid_request", "Every message needs a role (system, developer, user or assistant) and text content.", { param: `messages[${index}]` });
        }
        const clean = text.replace(/\0/g, "");
        characters += clean.length;
        if (role === "system" || role === "developer") system.push(clean.trim());
        else messages.push({ role, content: clean });
    }
    if (characters > API_INPUT_CHARS_MAX) return failure(413, "context_length_exceeded", `The messages are longer than ${API_INPUT_CHARS_MAX.toLocaleString("en-US")} characters.`, { param: "messages" });
    const systemText = system.filter(Boolean).join("\n\n");
    if (systemText.length > API_SYSTEM_MAX) return failure(413, "context_length_exceeded", `The system text is longer than ${API_SYSTEM_MAX.toLocaleString("en-US")} characters.`, { param: "messages" });
    if (!messages.length || messages[messages.length - 1].role !== "user" || !messages[messages.length - 1].content.trim()) {
        return failure(400, "invalid_request", "The last message must be the user's, with text.", { param: "messages" });
    }
    return {
        ok: true,
        request: {
            messages,
            system: systemText,
            stream: body.stream === true,
            temperature: temperature.value,
            topP: topP.value,
            stop,
            maxTokens: Math.min(tokens.value ?? planMax, planMax),
            mode,
            language,
        },
    };
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/** When the model was published (models.list wants a creation time). */
const MODEL_CREATED = Math.floor(Date.parse("2026-10-03T00:00:00Z") / 1000);

export function apiModel() {
    return { id: API_MODEL_ID, object: "model", created: MODEL_CREATED, owned_by: "hanogt" };
}

export function newCompletionId() {
    return `chatcmpl-${randomBytes(12).toString("hex")}`;
}

type FinishReason = "stop" | "length" | "content_filter";
const finishReasonOf = (value: unknown): FinishReason => (value === "length" || value === "content_filter" ? value : "stop");

/** Token counts from the provider, when it sent sensible ones. */
function usageOf(value: unknown) {
    const usage = value && typeof value === "object" ? value as Record<string, unknown> : null;
    const count = (name: string) => (typeof usage?.[name] === "number" && Number.isInteger(usage[name]) && (usage[name] as number) >= 0 ? usage[name] as number : null);
    const prompt = count("prompt_tokens");
    const completion = count("completion_tokens");
    return prompt === null || completion === null ? null : { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

/** A non-streamed answer from the provider's JSON, in OpenAI's chat.completion shape; null when it holds no text. */
export function completionBody(upstream: unknown, meta: { id: string; created: number }) {
    const data = upstream && typeof upstream === "object" ? upstream as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>; usage?: unknown } : null;
    const choice = data?.choices?.[0];
    const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
    if (!content.trim()) return null;
    const usage = usageOf(data?.usage);
    return {
        id: meta.id,
        object: "chat.completion",
        created: meta.created,
        model: API_MODEL_ID,
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReasonOf(choice?.finish_reason) }],
        ...(usage ? { usage } : {}),
    };
}

function chunk(meta: { id: string; created: number }, delta: Record<string, string>, finishReason: FinishReason | null) {
    return `data: ${JSON.stringify({ id: meta.id, object: "chat.completion.chunk", created: meta.created, model: API_MODEL_ID, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
}

/**
 * The provider's server-sent events re-told as our own chat.completion.chunk
 * events (never the provider's ids, model name or extra fields): a first
 * chunk with the role, one per piece of text, a last one with the finish
 * reason, then `data: [DONE]`. A provider failure midway becomes an error
 * event before [DONE], as OpenAI's SDKs expect.
 */
export function completionStream(upstream: ReadableStream<Uint8Array>, meta: { id: string; created: number }, hooks: { onEnd?: () => void; onCancel?: () => void } = {}): ReadableStream<Uint8Array> {
    const reader = upstream.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let started = false;
    let finish: FinishReason = "stop";
    let buffer = "";
    let ended = false;
    const end = (controller: ReadableStreamDefaultController<Uint8Array>, tail: string) => {
        if (ended) return;
        ended = true;
        controller.enqueue(encoder.encode(`${tail}data: [DONE]\n\n`));
        controller.close();
        hooks.onEnd?.();
    };
    return new ReadableStream<Uint8Array>({
        start(controller) {
            started = true;
            controller.enqueue(encoder.encode(chunk(meta, { role: "assistant", content: "" }, null)));
        },
        // Every pull sends something (or ends the stream): a pull that sends nothing isn't called again.
        async pull(controller) {
            try {
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) {
                        end(controller, chunk(meta, {}, finish));
                        return;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    let out = "";
                    let newline = buffer.indexOf("\n");
                    while (newline >= 0) {
                        const line = buffer.slice(0, newline).trim();
                        buffer = buffer.slice(newline + 1);
                        newline = buffer.indexOf("\n");
                        if (!line.startsWith("data:")) continue;
                        const payload = line.slice(5).trim();
                        if (payload === "[DONE]") continue;
                        try {
                            const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }> };
                            const choice = parsed.choices?.[0];
                            if (typeof choice?.delta?.content === "string" && choice.delta.content) out += chunk(meta, { content: choice.delta.content }, null);
                            if (choice?.finish_reason) finish = finishReasonOf(choice.finish_reason);
                        } catch {
                            // Keep-alive comments and partial frames are skipped.
                        }
                    }
                    if (out) {
                        controller.enqueue(encoder.encode(out));
                        return;
                    }
                }
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                    end(controller, "");
                    return;
                }
                const body = apiErrorBody({ status: 424, code: "upstream_error", message: "The model stopped answering. Try again." });
                end(controller, `data: ${JSON.stringify(body)}\n\n`);
            }
        },
        cancel() {
            if (started) hooks.onCancel?.();
            void reader.cancel().catch(() => undefined);
        },
    });
}
