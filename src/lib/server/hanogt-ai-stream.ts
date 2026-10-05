import "server-only";

import { encodeAgentTrailer, stripTrailerMark, type AgentTrailerCall } from "@/lib/ai/agent-protocol";
import { AGENT_CALL_ID_PATTERN, AGENT_MAX_CALLS, sanitizeAgentCall } from "@/lib/ai/agent-tools";
import { encodeWireEvent, type EndReason, type WireEvent } from "@/lib/ai/stream-protocol";
import { createThinkingSplitter, reasoningOf, type ThinkingPart, type ThinkingStep } from "@/lib/ai/thinking";

/*
 * The model's server-sent events (OpenAI chat-completions chunks) re-told to
 * the browser by /api/ai: thinking and answer text apart (src/lib/ai/
 * thinking.ts), agent tool calls validated against the registry, and how the
 * answer ended. Version 2 (src/lib/ai/stream-protocol.ts) is a line of JSON
 * per event; version 1, for tabs opened before it, is the plain answer text
 * with the agent trailer and no thinking. Free of next/server so the
 * plain-Node tests can drive it.
 */

const MAX_TOOL_ARGUMENT_CHARS = 120_000;

export type ToolCallDelta = { index?: number; id?: string; function?: { name?: string; arguments?: string } };
export type CallAccumulator = Map<number, { id: string; name: string; args: string }>;

/** Adds streamed pieces of tool calls to `target` (by index; ids, names and arguments arrive in parts). */
export function collectToolCalls(target: CallAccumulator, parts: ToolCallDelta[] | undefined) {
    if (!Array.isArray(parts)) return;
    for (const part of parts) {
        const index = typeof part.index === "number" ? part.index : target.size;
        if (index < 0 || index >= AGENT_MAX_CALLS) continue;
        const entry = target.get(index) ?? { id: "", name: "", args: "" };
        if (typeof part.id === "string" && part.id) entry.id = part.id;
        const name = part.function?.name;
        // Most providers send the name once; some repeat it in every chunk.
        if (typeof name === "string" && name) entry.name = !entry.name || name === entry.name ? name : `${entry.name}${name}`;
        const args = part.function?.arguments;
        if (typeof args === "string" && entry.args.length + args.length <= MAX_TOOL_ARGUMENT_CHARS) entry.args += args;
        target.set(index, entry);
    }
}

/** Validates the model's calls against the registry before the browser sees them. */
export function trailerCalls(calls: CallAccumulator): AgentTrailerCall[] {
    return [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .filter(([, call]) => call.name)
        .map(([index, call]) => {
            const id = AGENT_CALL_ID_PATTERN.test(call.id) ? call.id : `call_${index}_${crypto.randomUUID().slice(0, 8)}`;
            const sanitized = sanitizeAgentCall(call.name, call.args);
            return sanitized.ok
                ? { id, name: sanitized.call.name, args: sanitized.call.args as Record<string, unknown> }
                : { id, name: call.name.slice(0, 64), args: {}, error: sanitized.error };
        });
}

export type ChatStreamOptions = {
    /** 2: JSON lines with thinking and steps · 1: plain text and the agent trailer. */
    wire: 1 | 2;
    /** Agent mode: collect the model's tool calls. */
    tools: boolean;
    /** Steps the server took (knowledge, analyzers, file, agent), sent first (version 2, when thinking is shown). */
    steps: ThinkingStep[];
    /** Send the model's thinking (version 2 and the person's "show thinking" setting). */
    forwardThinking: boolean;
    /** The model's template opens the thinking block itself (HANOGT_AI_THINKING=preopened). */
    preopened?: boolean;
    /** The route's time limit fired (the upstream was aborted for it). */
    isTimedOut: () => boolean;
    /** Nothing was answered (no text, no tool call): give the message back; resolves to whether it was. */
    onNoAnswer: () => Promise<boolean>;
    /** The stream is over (any way): clear the route's timer. */
    onClose: () => void;
    /** The browser went away: stop the upstream. */
    onCancel: () => void;
};

export function chatOutputStream(upstream: ReadableStream<Uint8Array>, options: ChatStreamOptions): ReadableStream<Uint8Array> {
    const reader = upstream.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const splitter = createThinkingSplitter({ preopened: options.preopened });
    const calls: CallAccumulator = new Map();
    let finish: string | null = null;
    let answered = false;
    let closed = false;

    const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: WireEvent) => {
        if (options.wire === 2) controller.enqueue(encoder.encode(encodeWireEvent(event)));
        else if (event.t === "text") controller.enqueue(encoder.encode(event.d));
    };
    const emit = (controller: ReadableStreamDefaultController<Uint8Array>, parts: ThinkingPart[]) => {
        for (const part of parts) {
            if (part.kind === "think") {
                if (options.wire === 2 && options.forwardThinking) send(controller, { t: "think", d: part.text });
                continue;
            }
            // What was sent as thinking was the answer: the browser drops it, and it follows as text.
            if (part.kind === "unthink" && options.wire === 2 && options.forwardThinking) send(controller, { t: "think_reset" });
            const text = stripTrailerMark(part.text);
            if (!text) continue;
            if (text.trim()) answered = true;
            send(controller, { t: "text", d: text });
        }
    };
    const finishStream = async (controller: ReadableStreamDefaultController<Uint8Array>, reason: EndReason) => {
        if (closed) return;
        emit(controller, splitter.end({ complete: reason === "stop" }));
        const toolCalls = options.tools ? trailerCalls(calls) : [];
        if (toolCalls.length) {
            answered = true;
            if (options.wire === 2) send(controller, { t: "tools", calls: toolCalls });
            else controller.enqueue(encoder.encode(encodeAgentTrailer({ toolCalls })));
        }
        if (!answered) {
            const refunded = await options.onNoAnswer().catch(() => false);
            send(controller, { t: "error", code: reason === "timeout" ? "timeout" : "empty_answer", refunded });
        }
        send(controller, { t: "end", reason: answered ? reason : "error" });
        closed = true;
        controller.close();
        options.onClose();
    };

    return new ReadableStream<Uint8Array>({
        start(controller) {
            if (options.wire === 2 && options.forwardThinking) for (const step of options.steps) send(controller, { t: "step", step });
        },
        async pull(controller) {
            let buffer = "";
            try {
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let newline = buffer.indexOf("\n");
                    while (newline >= 0) {
                        const line = buffer.slice(0, newline).trim();
                        buffer = buffer.slice(newline + 1);
                        newline = buffer.indexOf("\n");
                        if (!line.startsWith("data:")) continue;
                        const payload = line.slice(5).trim();
                        if (payload === "[DONE]") continue;
                        try {
                            const chunk = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string | null; reasoning_content?: unknown; reasoning?: unknown; tool_calls?: ToolCallDelta[] }; finish_reason?: unknown }> };
                            const choice = chunk.choices?.[0];
                            const delta = choice?.delta;
                            if (delta) emit(controller, splitter.push({ reasoning: reasoningOf(delta), content: typeof delta.content === "string" ? delta.content : null }));
                            if (options.tools) collectToolCalls(calls, delta?.tool_calls);
                            if (typeof choice?.finish_reason === "string") finish = choice.finish_reason;
                        } catch {
                            // Keep-alive comments and partial frames are skipped.
                        }
                    }
                }
                await finishStream(controller, finish === "length" ? "length" : "stop");
            } catch (error) {
                const aborted = error instanceof Error && error.name === "AbortError";
                if (aborted && !options.isTimedOut()) {
                    // The browser stopped reading: nothing more to send.
                    if (!closed) {
                        closed = true;
                        try {
                            controller.close();
                        } catch {
                            // Already cancelled.
                        }
                        options.onClose();
                    }
                    return;
                }
                await finishStream(controller, aborted ? "timeout" : "error");
            }
        },
        cancel() {
            closed = true;
            options.onCancel();
            options.onClose();
            void reader.cancel().catch(() => undefined);
        },
    });
}
