import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { WireMessage } from "@/lib/ai/agent-protocol";
import type { AgentToolSchema } from "@/lib/ai/agent-tools";
import type { EngineEffort } from "@/lib/ai/engine";

/*
 * The advanced code engine: Claude through the official SDK, streaming. The
 * chat route (src/app/api/ai/route.ts) picks it for code work when the server
 * has ANTHROPIC_API_KEY (src/lib/server/ai-engine.ts); everything else stays
 * on the standard engine.
 *
 * - Thinking is adaptive (always on for the default model); depth, speed and
 *   cost follow `output_config.effort`. Thinking counts toward max_tokens.
 * - A safety decline is retried server-side on the model Anthropic recommends
 *   for its category (`fallbacks: "default"`); a decline of the whole chain
 *   ends the answer with stop reason "refusal" and runs no tool.
 * - Agent tools are offered as Claude tools. Earlier tool rounds reach Claude
 *   as text and no thinking block is ever sent back, so nothing depends on
 *   replaying Claude's own blocks.
 * - The stable part of the system prompt is cached (it renders after the
 *   tools, so both are cached together); the per-message part isn't.
 * Kept free of next/server so the plain-Node tests can load it.
 */

export const CLAUDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Longest answer, thinking included, for each plan's answer length (Free 1,800 → 7,200 … Pro 4,000 → 16,000). */
export function claudeMaxTokens(planMaxTokens: number) {
    return Math.min(32_000, Math.max(4_096, planMaxTokens * 4));
}

export function claudeClient(config: { apiKey: string; baseURL?: string }, fetchImpl?: typeof fetch) {
    return new Anthropic({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
        // The route has its own deadline and falls back to the standard engine once.
        maxRetries: 0,
        timeout: 55_000,
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
}

/** The system prompt as two blocks: the stable rules (cached) and what changes with every message. */
export function claudeSystem(system: { stable: string; dynamic: string }): Anthropic.Beta.BetaTextBlockParam[] {
    const blocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: system.stable, cache_control: { type: "ephemeral" } }];
    if (system.dynamic.trim()) blocks.push({ type: "text", text: system.dynamic });
    return blocks;
}

/** The agent's OpenAI-style tools as Claude tools; inputs stream as they are written (validated by the route). */
export function claudeTools(tools: AgentToolSchema[]): Anthropic.Beta.BetaTool[] {
    return tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: { ...tool.function.parameters, type: "object" } as Anthropic.Beta.BetaTool.InputSchema,
        eager_input_streaming: true,
    }));
}

/**
 * The chat's OpenAI-style history as Claude messages, text only: a tool round
 * becomes the assistant's words plus a user-side note with what the action
 * was and what came back. Turns of the same role are joined, and the history
 * starts and ends with the user, as the Messages API wants.
 */
export function claudeMessages(messages: WireMessage[]): Anthropic.Beta.BetaMessageParam[] {
    const out: Array<{ role: "user" | "assistant"; content: string }> = [];
    const push = (role: "user" | "assistant", text: string) => {
        if (!text.trim()) return;
        const last = out[out.length - 1];
        if (last && last.role === role) last.content = `${last.content}\n\n${text}`;
        else out.push({ role, content: text });
    };
    const calls = new Map<string, { name: string; args: string }>();
    for (const message of messages) {
        if (message.role === "user") {
            push("user", message.content);
        } else if (message.role === "assistant") {
            for (const call of message.tool_calls ?? []) calls.set(call.id, { name: call.function.name, args: call.function.arguments });
            push("assistant", message.content);
        } else {
            const call = calls.get(message.tool_call_id);
            const label = call ? `name="${call.name}" arguments='${call.args.replace(/'/g, "&#39;")}'` : `id="${message.tool_call_id}"`;
            push("user", `<hanogt_action_result ${label}>\n${message.content}\n</hanogt_action_result>`);
        }
    }
    while (out.length && out[0].role !== "user") out.shift();
    while (out.length && out[out.length - 1].role !== "user") out.pop();
    return out;
}

export type ClaudeRequest = {
    model: string;
    effort: EngineEffort;
    system: { stable: string; dynamic: string };
    messages: WireMessage[];
    /** The agent's tools, or null when the agent is off. */
    tools: AgentToolSchema[] | null;
    /** "none" on the agent's last round: answer in text. */
    toolChoice: "auto" | "none";
    maxTokens: number;
};

export type ClaudeEvent =
    | { type: "text"; text: string }
    /** A complete tool call (arguments as JSON text), only when the answer ended normally. */
    | { type: "tool"; id: string; name: string; args: string }
    | { type: "end"; stopReason: string | null; model: string; fallback: boolean };

export type ClaudeOpen =
    | { ok: true; model: string; events: AsyncGenerator<ClaudeEvent> }
    | { ok: false; status: number; reason: "auth" | "rate_limited" | "bad_request" | "unavailable" };

function failureOf(error: unknown): Extract<ClaudeOpen, { ok: false }> {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return { ok: false, status: error.status, reason: "auth" };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, status: 429, reason: "rate_limited" };
    if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) return { ok: false, status: error.status, reason: "bad_request" };
    if (error instanceof Anthropic.APIError && typeof error.status === "number") return { ok: false, status: error.status, reason: "unavailable" };
    return { ok: false, status: 0, reason: "unavailable" };
}

/**
 * Starts a streamed answer. Resolves once Claude has accepted the request (so
 * a failure here can still go to the standard engine) with the events of the
 * answer; never throws.
 */
export async function openClaudeStream(client: Anthropic, request: ClaudeRequest, signal: AbortSignal): Promise<ClaudeOpen> {
    let stream: AsyncIterable<Anthropic.Beta.BetaRawMessageStreamEvent>;
    try {
        stream = await client.beta.messages.create({
            model: request.model,
            max_tokens: request.maxTokens,
            system: claudeSystem(request.system),
            messages: claudeMessages(request.messages),
            output_config: { effort: request.effort },
            betas: [CLAUDE_FALLBACK_BETA],
            fallbacks: "default",
            ...(request.tools?.length ? { tools: claudeTools(request.tools), tool_choice: request.toolChoice === "none" ? { type: "none" as const } : { type: "auto" as const } } : {}),
            stream: true,
        }, { signal });
    } catch (error) {
        return failureOf(error);
    }
    return { ok: true, model: request.model, events: claudeEvents(stream, request.model) };
}

function isAbort(error: unknown) {
    return error instanceof Anthropic.APIUserAbortError || (error instanceof Error && error.name === "AbortError");
}

/** The raw stream as text, complete tool calls and the end; tools are held back until the stop reason allows them. */
async function* claudeEvents(stream: AsyncIterable<Anthropic.Beta.BetaRawMessageStreamEvent>, requestedModel: string): AsyncGenerator<ClaudeEvent> {
    const blocks = new Map<number, { id: string; name: string; json: string }>();
    const tools: Array<{ id: string; name: string; args: string }> = [];
    let model = requestedModel;
    let stopReason: string | null = null;
    let fallback = false;
    try {
        for await (const event of stream) {
            if (event.type === "message_start") {
                model = event.message.model || model;
            } else if (event.type === "content_block_start") {
                if (event.content_block.type === "tool_use") blocks.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: "" });
                // A declined part was continued by the fallback model.
                if (event.content_block.type === "fallback") fallback = true;
            } else if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta" && event.delta.text) {
                    yield { type: "text", text: event.delta.text };
                } else if (event.delta.type === "input_json_delta") {
                    const block = blocks.get(event.index);
                    if (block && block.json.length + event.delta.partial_json.length <= 120_000) block.json += event.delta.partial_json;
                }
            } else if (event.type === "content_block_stop") {
                const block = blocks.get(event.index);
                if (block) {
                    tools.push({ id: block.id, name: block.name, args: block.json.trim() || "{}" });
                    blocks.delete(event.index);
                }
            } else if (event.type === "message_delta") {
                stopReason = event.delta.stop_reason ?? stopReason;
            }
        }
    } catch (error) {
        // The browser stopped or the route's deadline passed: the answer ends where it is, without tools.
        if (isAbort(error)) {
            yield { type: "end", stopReason: "aborted", model, fallback };
            return;
        }
        throw error;
    }
    // A refusal can cut a call off mid-input and max_tokens can truncate one: no tool runs then.
    if (stopReason === "tool_use" || stopReason === "end_turn") {
        for (const tool of tools) yield { type: "tool", ...tool };
    }
    yield { type: "end", stopReason, model, fallback };
}
