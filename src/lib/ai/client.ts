/**
 * Browser client of Hanogt AI: streams answers from /api/ai (large language
 * model) and reports when the caller should fall back to the offline core.
 * The answer comes as the version 2 stream (src/lib/ai/stream-protocol.ts):
 * the steps taken, the model's thinking, the answer, agent tool calls and how
 * it ended. A server from before that version answers in plain text with an
 * agent trailer (agent-protocol.ts), which is still read.
 */
import { splitAgentStream, type AgentTrailerCall, type WireMessage } from "./agent-protocol";
import { DEFAULT_CONNECTION, isConnectionId } from "./connections";
import type { AiContext, AiMode } from "./local-engine";
import { createWireDecoder, WIRE_HEADER, WIRE_VERSION, type EndReason } from "./stream-protocol";
import type { ThinkingStep } from "./thinking";
import { limitDetailsOf, quotaFromHeaders, type LimitDetails, type WindowQuota } from "./usage";

export type AiFailure =
    | "auth_required" | "not_configured" | "rate_limited" | "usage_limit" | "network" | "timeout" | "upstream" | "aborted"
    // The person's own provider connection (src/lib/ai/connections.ts):
    | "connection_invalid" | "connection_unavailable" | "connection_quota" | "connection_model" | "connection_rate_limited";

/** Error codes of /api/ai that name their failure directly. */
const CODE_FAILURES = new Map<string, AiFailure>([
    ["auth_required", "auth_required"],
    ["not_configured", "not_configured"],
    ["usage_limit", "usage_limit"],
    // What servers before the weekly windows sent.
    ["daily_limit", "usage_limit"],
    ["connection_invalid", "connection_invalid"],
    ["connection_unavailable", "connection_unavailable"],
    ["connection_quota", "connection_quota"],
    ["connection_model", "connection_model"],
    // Servers before 0.3.24 had a separate day for own connections; it is Hanogt AI's window now.
    ["connection_daily_limit", "usage_limit"],
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
    /** The window the message counted in (X-Hanogt-AI-Window-* headers), for the usage meter. */
    quota?: WindowQuota;
    /** A limit refused the message: the limit, when it resets and which plan raises it. */
    limit?: LimitDetails;
    /** What the model thought before answering (version 2 stream, when the person shows it). */
    thinking?: string;
    /** The steps the server took before the answer. */
    steps?: ThinkingStep[];
    /** The answer stopped early: it hit its length, the time limit or an error. */
    cut?: Exclude<EndReason, "stop">;
    /** The model answered nothing and the message was given back. */
    refunded?: boolean;
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
    /** The thinking so far, while the model thinks. */
    onThinking?: (thinkingSoFar: string) => void;
    /** The steps so far. */
    onSteps?: (steps: ThinkingStep[]) => void;
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
                wire: WIRE_VERSION,
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

    // A message that was counted reports its window, also when the model then failed (and it was given back).
    const quota = quotaFromHeaders(response.headers) ?? undefined;
    if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { code?: string; refunded?: unknown };
        const retryAfter = Number(response.headers.get("Retry-After")) || undefined;
        const code = typeof payload.code === "string" ? payload.code : "";
        const failure: AiFailure = CODE_FAILURES.get(code)
            ?? (response.status === 429 ? (options.connectionId && code === "upstream_rate_limited" ? "connection_rate_limited" : "rate_limited")
                : response.status === 504 || code === "timeout" ? "timeout"
                    : response.status === 401 ? "auth_required" : "upstream");
        return { ok: false, text: "", failure, retryAfterSeconds: retryAfter, quota, limit: limitDetailsOf(payload) ?? undefined, refunded: payload.refunded === true, ...empty };
    }

    const sources = parseSources(response.headers.get("X-Hanogt-AI-Sources"));
    const model = decodeURIComponent(response.headers.get("X-Hanogt-AI-Model") || "") || undefined;
    const agent = agentStatus(response.headers.get("X-Hanogt-AI-Agent"));
    const answeredBy = response.headers.get("X-Hanogt-AI-Connection");
    const connectionId = answeredBy && answeredBy !== DEFAULT_CONNECTION && isConnectionId(answeredBy) ? answeredBy : undefined;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const meta = { sources, model, connectionId, agent, quota };

    if (response.headers.get(WIRE_HEADER) === String(WIRE_VERSION)) {
        const wire = createWireDecoder();
        let text = "";
        let thinking = "";
        const steps: ThinkingStep[] = [];
        let toolCalls: AgentTrailerCall[] = [];
        let end: EndReason | null = null;
        let error: { code: string; refunded: boolean } | null = null;
        const apply = (events: ReturnType<typeof wire.push>) => {
            for (const event of events) {
                if (event.t === "text") {
                    text += event.d;
                    options.onToken(text);
                } else if (event.t === "think") {
                    thinking += event.d;
                    options.onThinking?.(thinking);
                } else if (event.t === "think_reset") {
                    // It was the answer after all; it follows as text.
                    thinking = "";
                    options.onThinking?.("");
                } else if (event.t === "step") {
                    steps.push(event.step);
                    options.onSteps?.([...steps]);
                } else if (event.t === "tools") toolCalls = event.calls;
                else if (event.t === "end") end = event.reason;
                else if (event.t === "error") error = { code: event.code, refunded: event.refunded };
            }
        };
        const extra = () => ({ ...(thinking.trim() ? { thinking } : {}), ...(steps.length ? { steps } : {}) });
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                apply(wire.push(decoder.decode(value, { stream: true })));
            }
            apply(wire.push(decoder.decode()));
            apply(wire.end());
        } catch (caught) {
            const aborted = caught instanceof DOMException && caught.name === "AbortError";
            return { ok: text.length > 0, text, failure: aborted ? "aborted" : "network", toolCalls: [], ...meta, ...extra(), ...(text ? { cut: "error" as const } : {}) };
        }
        const failedEnd = error as { code: string; refunded: boolean } | null;
        if (!text.trim() && !toolCalls.length) {
            return { ok: false, text: "", failure: failedEnd?.code === "timeout" ? "timeout" : "upstream", toolCalls: [], ...meta, ...extra(), refunded: failedEnd?.refunded === true };
        }
        const reason = end as EndReason | null;
        return { ok: true, text, toolCalls, ...meta, ...extra(), ...(reason && reason !== "stop" ? { cut: reason } : {}) };
    }

    // A server from before the version 2 stream: plain text with the agent trailer.
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
        return { ok: partial.length > 0, text: partial, failure: aborted ? "aborted" : "network", toolCalls: [], ...meta };
    }
    const { text, trailer } = splitAgentStream(raw);
    const toolCalls = trailer?.toolCalls ?? [];
    if (!text.trim() && !toolCalls.length) return { ok: false, text: "", failure: "upstream", toolCalls: [], ...meta };
    return { ok: true, text, toolCalls, ...meta };
}
