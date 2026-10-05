/**
 * Hanogt AI's visible thinking: what the model reasons before it answers,
 * shown in a "Thinking… / Thought for N s" panel (src/components/HanogtAI/
 * ThinkingPanel.tsx) and never sent back to the model as part of the history.
 *
 * Models report it in one of three ways, all handled here:
 *   • a separate field of the streamed delta: `reasoning_content` (vLLM with a
 *     reasoning parser, DeepSeek, most providers) or `reasoning` (others);
 *   • a <think>…</think> block at the start of the content (Qwen3 served
 *     without a reasoning parser);
 *   • content that starts inside the block and only closes it (templates that
 *     open <think> themselves; HANOGT_AI_THINKING=preopened). That thinking is
 *     only tentative until the block closes: when a separate reasoning field
 *     arrives instead, the content is the answer, and when the answer ends
 *     normally without closing the block, the model didn't think after all
 *     and everything sent as thinking was the answer ("unthink").
 * Client-safe and dependency-free so the route, the developer API and the
 * tests share it.
 */

export type ThinkingSetting = "auto" | "on" | "off";
export const THINKING_SETTINGS: readonly ThinkingSetting[] = ["auto", "on", "off"];

/** Whether the model should think before answering this message. "auto": in code and security work, and for long questions. */
export function wantsThinking(setting: ThinkingSetting, request: { mode: string; message: string }): boolean {
    if (setting === "on") return true;
    if (setting === "off") return false;
    return request.mode === "code" || request.mode === "security" || request.message.length >= 400;
}

/**
 * One piece of a streamed answer: thinking, answer text, or "unthink": what
 * was sent as thinking was the answer after all (a block the template opened
 * never closed), so the reader drops its thinking and shows this as the answer.
 */
export type ThinkingPart = { kind: "think" | "text" | "unthink"; text: string };

const OPEN = "<think>";
const CLOSE = "</think>";

/** How many characters at the end of `text` could be the start of `tag` (kept back until the next chunk). */
function partialTagLength(text: string, tag: string) {
    for (let length = Math.min(tag.length - 1, text.length); length > 0; length -= 1) {
        if (tag.startsWith(text.slice(text.length - length))) return length;
    }
    return 0;
}

/**
 * Splits a streamed answer into thinking and answer text, chunk by chunk.
 * Tags split across chunks are held back until they are complete; once the
 * answer has started, a literal "<think>" in it is just text.
 */
export function createThinkingSplitter(options: { preopened?: boolean } = {}) {
    let state: "start" | "thinking" | "answer" = options.preopened ? "thinking" : "start";
    let buffer = "";
    let thought = false;
    // A block the template opened: thinking until it closes (or a reasoning field shows the content is the answer).
    let tentative = Boolean(options.preopened);
    let tentativeText = "";
    let contentSeen = false;
    const think = (parts: ThinkingPart[], text: string) => {
        parts.push({ kind: "think", text });
        thought = true;
        if (tentative) tentativeText += text;
    };

    const content = (chunk: string): ThinkingPart[] => {
        const parts: ThinkingPart[] = [];
        buffer += chunk;
        for (;;) {
            if (state === "start") {
                const trimmed = buffer.replace(/^\s+/, "");
                if (!trimmed) return parts;
                if (trimmed.startsWith(OPEN)) {
                    state = "thinking";
                    buffer = trimmed.slice(OPEN.length);
                    continue;
                }
                // "<thi" might still become "<think>": wait for more.
                if (OPEN.startsWith(trimmed)) return parts;
                state = "answer";
                continue;
            }
            if (state === "thinking") {
                const end = buffer.indexOf(CLOSE);
                if (end === -1) {
                    const keep = partialTagLength(buffer, CLOSE);
                    const text = buffer.slice(0, buffer.length - keep);
                    if (text) think(parts, text);
                    buffer = buffer.slice(buffer.length - keep);
                    return parts;
                }
                const text = buffer.slice(0, end);
                if (text) think(parts, text);
                buffer = buffer.slice(end + CLOSE.length).replace(/^\s+/, "");
                state = "answer";
                tentative = false;
                tentativeText = "";
                continue;
            }
            if (buffer) parts.push({ kind: "text", text: buffer });
            buffer = "";
            return parts;
        }
    };

    return {
        /** A delta of the stream: its reasoning field (if any) and its content. */
        push(delta: { reasoning?: string | null; content?: string | null }): ThinkingPart[] {
            const parts: ThinkingPart[] = [];
            if (delta.reasoning) {
                parts.push({ kind: "think", text: delta.reasoning });
                thought = true;
                // The thinking has its own field (a server with a reasoning parser): the content is the answer.
                if (tentative && !contentSeen) {
                    tentative = false;
                    state = "answer";
                }
            }
            if (delta.content) {
                contentSeen = true;
                parts.push(...content(delta.content));
            }
            return merge(parts);
        },
        /**
         * The end of the stream: whatever was held back. `complete` is false
         * when the answer was cut (length, time limit, error): a block that is
         * still open then stays thinking.
         */
        end(options: { complete?: boolean } = {}): ThinkingPart[] {
            const rest = buffer;
            buffer = "";
            if (state === "thinking" && tentative && options.complete !== false) {
                // The template opened a block the model never closed, and the answer ended normally: it was the answer.
                const text = tentativeText + rest;
                tentativeText = "";
                tentative = false;
                thought = false;
                return text ? [{ kind: "unthink", text }] : [];
            }
            if (!rest) return [];
            // Ended inside the block: it was all thinking. A held-back "<thi" at the start was text after all.
            return [{ kind: state === "thinking" ? "think" : "text", text: rest }];
        },
        /** Some thinking was seen. */
        get thought() {
            return thought;
        },
    };
}

function merge(parts: ThinkingPart[]): ThinkingPart[] {
    const merged: ThinkingPart[] = [];
    for (const part of parts) {
        const last = merged[merged.length - 1];
        if (last && last.kind === part.kind) last.text += part.text;
        else merged.push({ ...part });
    }
    return merged;
}

/** The reasoning field of a delta or message: reasoning_content, else reasoning (never both). */
export function reasoningOf(value: { reasoning_content?: unknown; reasoning?: unknown } | null | undefined): string {
    if (!value) return "";
    if (typeof value.reasoning_content === "string" && value.reasoning_content) return value.reasoning_content;
    return typeof value.reasoning === "string" ? value.reasoning : "";
}

/** A whole (non-streamed) answer split into its thinking and its text; `complete` is false for an answer that was cut. */
export function splitThinkingText(content: string, reasoning = "", options: { preopened?: boolean; complete?: boolean } = {}): { thinking: string; text: string } {
    const splitter = createThinkingSplitter(options);
    const parts = [...splitter.push({ reasoning, content }), ...splitter.end({ complete: options.complete })];
    const unthought = parts.some((part) => part.kind === "unthink");
    return {
        thinking: unthought ? "" : parts.filter((part) => part.kind === "think").map((part) => part.text).join("").trim(),
        text: parts.filter((part) => part.kind !== "think").map((part) => part.text).join("").trim(),
    };
}

/** An assistant turn of the history without a leading thinking block (thinking is never sent back to the model). */
export function stripThinkBlocks(text: string): string {
    return text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, "");
}

/** A step the server took before the model answered, shown in the thinking panel. */
export type ThinkingStep =
    | { kind: "knowledge"; titles: string[] }
    | { kind: "analyzer"; id: "link" | "error" | "code" }
    | { kind: "file"; name: string }
    | { kind: "agent"; state: "tools" | "unsupported" };

const ANALYZERS = new Set(["link", "error", "code"]);

/** A step as it arrives from the server (or from storage), checked; null when malformed. */
export function readThinkingStep(value: unknown): ThinkingStep | null {
    if (!value || typeof value !== "object") return null;
    const step = value as Record<string, unknown>;
    if (step.kind === "knowledge" && Array.isArray(step.titles)) {
        const titles = step.titles.filter((title): title is string => typeof title === "string").map((title) => title.slice(0, 120)).slice(0, 4);
        return titles.length ? { kind: "knowledge", titles } : null;
    }
    if (step.kind === "analyzer" && typeof step.id === "string" && ANALYZERS.has(step.id)) return { kind: "analyzer", id: step.id as "link" | "error" | "code" };
    if (step.kind === "file" && typeof step.name === "string" && step.name) return { kind: "file", name: step.name.slice(0, 80) };
    if (step.kind === "agent" && (step.state === "tools" || step.state === "unsupported")) return { kind: "agent", state: step.state };
    return null;
}
