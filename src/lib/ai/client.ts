/**
 * Browser client of Hanogt AI: streams answers from /api/ai (large language
 * model) and reports when the caller should fall back to the offline core.
 * In agent mode a response can end with a trailer of tool calls (see
 * agent-protocol.ts); it is cut off before the text reaches the UI.
 */
import { splitAgentStream, type AgentTrailerCall, type WireMessage } from "./agent-protocol";
import type { AiContext, AiMode } from "./local-engine";

export type AiFailure = "auth_required" | "not_configured" | "rate_limited" | "daily_limit" | "network" | "timeout" | "upstream" | "aborted";

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
    /** Tool calls the model asked for (agent mode only). */
    toolCalls: AgentTrailerCall[];
    agent: AiAgentStatus;
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
                context: options.context ? { ...options.context, code: options.context.code?.slice(0, 12_000) } : undefined,
            }),
            signal: options.signal,
        });
    } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        return { ok: false, text: "", failure: aborted ? "aborted" : "network", ...empty };
    }

    if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { code?: string };
        const retryAfter = Number(response.headers.get("Retry-After")) || undefined;
        const code = payload.code;
        const failure: AiFailure = code === "auth_required" ? "auth_required"
            : code === "not_configured" ? "not_configured"
                : code === "daily_limit" ? "daily_limit"
                    : response.status === 429 ? "rate_limited"
                        : response.status === 504 || code === "timeout" ? "timeout"
                            : response.status === 401 ? "auth_required" : "upstream";
        return { ok: false, text: "", failure, retryAfterSeconds: retryAfter, ...empty };
    }

    const sources = parseSources(response.headers.get("X-Hanogt-AI-Sources"));
    const model = decodeURIComponent(response.headers.get("X-Hanogt-AI-Model") || "") || undefined;
    const agent = agentStatus(response.headers.get("X-Hanogt-AI-Agent"));
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
        return { ok: partial.length > 0, text: partial, failure: aborted ? "aborted" : "network", sources, model, toolCalls: [], agent };
    }
    const { text, trailer } = splitAgentStream(raw);
    const toolCalls = trailer?.toolCalls ?? [];
    if (!text.trim() && !toolCalls.length) return { ok: false, text: "", failure: "upstream", sources, model, toolCalls: [], agent };
    return { ok: true, text, sources, model, toolCalls, agent };
}
