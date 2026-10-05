/**
 * The /api/ai answer stream, version 2 (the browser asks for it with
 * `wire: 2`; the answer says so in X-Hanogt-AI-Wire): one JSON event per line.
 *
 *   {"t":"step","step":{…}}        a step before the answer (src/lib/ai/thinking.ts ThinkingStep)
 *   {"t":"think","d":"…"}          a piece of the model's thinking
 *   {"t":"think_reset"}            what came as thinking was the answer after all (it follows as text)
 *   {"t":"text","d":"…"}           a piece of the answer
 *   {"t":"tools","calls":[…]}      agent tool calls (AgentTrailerCall, already validated)
 *   {"t":"end","reason":"stop"}    stop · length (the answer hit its limit) · timeout · error
 *   {"t":"error","code":"…","refunded":true}   the model answered nothing; the message was given back
 *
 * Unknown events are ignored, so the server can add new ones. Without
 * `wire: 2` (an old open tab) the answer is the old plain text with the
 * agent trailer, and thinking is left out.
 */
import type { AgentTrailerCall } from "./agent-protocol";
import { readThinkingStep, type ThinkingStep } from "./thinking";

export const WIRE_VERSION = 2;
export const WIRE_HEADER = "X-Hanogt-AI-Wire";
export const WIRE_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export type EndReason = "stop" | "length" | "timeout" | "error";

export type WireEvent =
    | { t: "step"; step: ThinkingStep }
    | { t: "think"; d: string }
    | { t: "think_reset" }
    | { t: "text"; d: string }
    | { t: "tools"; calls: AgentTrailerCall[] }
    | { t: "end"; reason: EndReason }
    | { t: "error"; code: string; refunded: boolean };

export function encodeWireEvent(event: WireEvent): string {
    return `${JSON.stringify(event)}\n`;
}

const END_REASONS = new Set<EndReason>(["stop", "length", "timeout", "error"]);

/** One line of the stream, checked; null for anything unknown or malformed. */
export function readWireEvent(line: string): WireEvent | null {
    let value: unknown;
    try {
        value = JSON.parse(line);
    } catch {
        return null;
    }
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    switch (event.t) {
        case "think":
        case "text":
            return typeof event.d === "string" ? { t: event.t, d: event.d } : null;
        case "think_reset":
            return { t: "think_reset" };
        case "step": {
            const step = readThinkingStep(event.step);
            return step ? { t: "step", step } : null;
        }
        case "tools":
            return Array.isArray(event.calls) ? { t: "tools", calls: event.calls as AgentTrailerCall[] } : null;
        case "end":
            return END_REASONS.has(event.reason as EndReason) ? { t: "end", reason: event.reason as EndReason } : null;
        case "error":
            return typeof event.code === "string" ? { t: "error", code: event.code.slice(0, 40), refunded: event.refunded === true } : null;
        default:
            return null;
    }
}

/** Splits incoming text into complete lines and reads them; a partial line waits for the next chunk. */
export function createWireDecoder() {
    let buffer = "";
    return {
        push(chunk: string): WireEvent[] {
            buffer += chunk;
            const events: WireEvent[] = [];
            let newline = buffer.indexOf("\n");
            while (newline >= 0) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                newline = buffer.indexOf("\n");
                if (!line) continue;
                const event = readWireEvent(line);
                if (event) events.push(event);
            }
            return events;
        },
        end(): WireEvent[] {
            const line = buffer.trim();
            buffer = "";
            const event = line ? readWireEvent(line) : null;
            return event ? [event] : [];
        },
    };
}
