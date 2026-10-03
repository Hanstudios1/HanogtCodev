/**
 * Browser client of Hanogt AI: streams answers from /api/ai (large language
 * model) and reports when the caller should fall back to the offline core.
 * In agent mode a response can end with a trailer of tool calls (see
 * agent-protocol.ts); it is cut off before the text reaches the UI.
 */
import { splitAgentStream, type AgentTrailerCall, type WireMessage } from "./agent-protocol";
import { DEFAULT_CONNECTION, isConnectionId } from "./connections";
import { readEngineHeaders, type AiEngineId, type AiEngineNote } from "./engine";
import type { AiContext, AiMode } from "./local-engine";
import { limitDetailsOf, quotaFromHeaders, type DayQuota, type LimitDetails, type UsageWindow } from "./usage";

export type AiFailure =
    | "auth_required" | "not_configured" | "rate_limited" | "daily_limit" | "network" | "timeout" | "upstream" | "aborted"
    // The person's own provider connection (src/lib/ai/connections.ts):
    | "connection_invalid" | "connection_unavailable" | "connection_quota" | "connection_model" | "connection_rate_limited" | "connection_daily_limit";

/** Error codes of /api/ai that name their failure directly. */
const CODE_FAILURES = new Map<string, AiFailure>([
    ["auth_required", "auth_required"],
    ["not_configured", "not_configured"],
    ["daily_limit", "daily_limit"],
    ["connection_invalid", "connection_invalid"],
    ["connection_unavailable", "connection_unavailable"],
    ["connection_quota", "connection_quota"],
    ["connection_model", "connection_model"],
    ["connection_daily_limit", "connection_daily_limit"],
]);

/** "tools": the model may call tools · "unsupported": the provider rejected tools (the Core proposes actions instead) · "off": not requested. */
export type AiAgentStatus = "tools" | "unsupported" | "off";

export interface AiTurn {
    role: "user" | "assistant";
    content: string;
}

export interface AiStreamResult {
    ok: boolean;
    text: string;
    failure?: AiFailure;
    retryAfterSeconds?: number;
    sources: Array<{ title: string; href: string }>;
    model?: string;
    /** The person's connection that answered; undefined when Hanogt AI's own model did. */
    connectionId?: string;
    /** Tool calls the model asked for (agent mode only). */
    toolCalls: AgentTrailerCall[];
    agent: AiAgentStatus;
    /** The day window the message counted in (X-Hanogt-AI-* headers), for the usage meter. */
    quota?: DayQuota;
    /** A daily limit refused the message: the limit, when it resets and which plan raises it. */
    limit?: LimitDetails;
    /** Which engine wrote the answer (src/lib/ai/engine.ts). */
    engine?: AiEngineId;
    /** Why the standard engine answered although the advanced one was wanted. */
    engineNote?: AiEngineNote;
    /** The advanced engine's 24-hour window after this answer, for the usage meter. */
    engineWindow?: UsageWindow;
}

function parseSources(header: string | null) {
    if (!header) return [];
    try {
        const parsed = JSON.parse(decodeURIComponent(header)) as unknown;
        return Array.isArray(parsed)
            ? parsed.filter((item): item is { title: string; href: string } => Boolean(item && typeof item.title === "string" && typeof item.href === "string" && item.href.startsWith("/"))).slice(0, 4)
            : [];
    } catch {
        return [];
    }
}

function agentStatus(header: string | null): AiAgentStatus {
    return header === "tools" || header === "unsupported" ? header : "off";
}

export async function streamHanogtAI(options: {
    messages: Array<AiTurn | WireMessage>;
    mode: AiMode;
    language: string;
    context?: AiContext | null;
    signal?: AbortSignal;
    /** Let the model call agent tools. */
    agent?: boolean;
    /** Last tool round: the model must answer in text. */
    agentFinal?: boolean;
    /** Answer with the person's own provider connection instead of Hanogt AI's model. */
    connectionId?: string | null;
    /** Characters of the attached file to send: the plan's allowance (the server clips to it too). */
    contextChars?: number;
    onToken: (textSoFar: string) => void;
}): Promise<AiStreamResult> {
    const empty = { sources: [], toolCalls: [], agent: "off" as const };
    let response: Response;
    try {
        response = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: options.messages,
                mode: options.mode,
                language: options.language,
                stream: true,
                ...(options.agent ? { agent: true, agentFinal: options.agentFinal === true } : {}),
                ...(options.connectionId ? { connectionId: options.connectionId } : {}),
                context: options.context ? { ...options.context, code: options.context.code?.slice(0, options.contextChars ?? 12_000) } : undefined,
            }),
            signal: options.signal,
        });
    } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        return { ok: false, text: "", failure: aborted ? "aborted" : "network", ...empty };
    }

    // A message that was counted reports its day window, also when the model then failed.
    const quota = quotaFromHeaders(response.headers) ?? undefined;
    if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { code?: string };
        const retryAfter = Number(response.headers.get("Retry-After")) || undefined;
        const code = typeof payload.code === "string" ? payload.code : "";
        const failure: AiFailure = CODE_FAILURES.get(code)
            ?? (response.status === 429 ? (options.connectionId && code === "upstream_rate_limited" ? "connection_rate_limited" : "rate_limited")
                : response.status === 504 || code === "timeout" ? "timeout"
                    : response.status === 401 ? "auth_required" : "upstream");
        return { ok: false, text: "", failure, retryAfterSeconds: retryAfter, quota, limit: limitDetailsOf(payload) ?? undefined, ...empty };
    }

    const sources = parseSources(response.headers.get("X-Hanogt-AI-Sources"));
    const model = decodeURIComponent(response.headers.get("X-Hanogt-AI-Model") || "") || undefined;
    const agent = agentStatus(response.headers.get("X-Hanogt-AI-Agent"));
    const answeredBy = response.headers.get("X-Hanogt-AI-Connection");
    const connectionId = answeredBy && answeredBy !== DEFAULT_CONNECTION && isConnectionId(answeredBy) ? answeredBy : undefined;
    const engineInfo = readEngineHeaders(response.headers);
    const engine = { engine: engineInfo.engine, ...(engineInfo.note ? { engineNote: engineInfo.note } : {}), ...(engineInfo.window ? { engineWindow: engineInfo.window } : {}) };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            raw += decoder.decode(value, { stream: true });
            options.onToken(splitAgentStream(raw).text);
        }
        raw += decoder.decode();
    } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        const partial = splitAgentStream(raw).text;
        return { ok: partial.length > 0, text: partial, failure: aborted ? "aborted" : "network", sources, model, connectionId, toolCalls: [], agent, quota, ...engine };
    }
    const { text, trailer } = splitAgentStream(raw);
    const toolCalls = trailer?.toolCalls ?? [];
    if (!text.trim() && !toolCalls.length) return { ok: false, text: "", failure: "upstream", sources, model, connectionId, toolCalls: [], agent, quota, ...engine };
    return { ok: true, text, sources, model, connectionId, toolCalls, agent, quota, ...engine };
}
