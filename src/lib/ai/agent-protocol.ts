/**
 * Wire protocol between the Hanogt AI chat and /api/ai.
 *
 * Answers still stream as plain UTF-8 text. In agent mode a response that
 * ends with function calls gets a trailer: AGENT_TRAILER_MARK followed by JSON
 * ({ toolCalls }). The mark starts with U+001E, which the route strips from
 * model text, so older clients (which never ask for agent mode) never see it
 * and new clients can cut it off while streaming.
 *
 * The chat sends tool calls and results back in OpenAI format (an assistant
 * message with tool_calls, then one role "tool" message per call), and the
 * route re-validates every name and argument against the registry.
 */
import type { AiMessage } from "./conversations";
import {
    AGENT_CALL_ID_PATTERN, AGENT_MAX_CALLS, isAgentToolName, sanitizeAgentCall,
    type AgentArgError, type AgentProfileSummary, type AgentToolName,
} from "./agent-tools";

export const AGENT_TRAILER_MARK = "\u001eHANOGT_AGENT\u001e";
const MARK_START = "\u001e";

export interface WireToolCall {
    id: string;
    type: "function";
    function: { name: AgentToolName; arguments: string };
}

export type WireMessage =
    | { role: "user"; content: string }
    | { role: "assistant"; content: string; tool_calls?: WireToolCall[] }
    | { role: "tool"; tool_call_id: string; content: string };

export interface AgentTrailerCall {
    id: string;
    name: string;
    args: Record<string, unknown>;
    /** Set by the route when the call can't be shown (unknown tool, bad arguments…). */
    error?: AgentArgError;
}

export interface AgentTrailer {
    toolCalls: AgentTrailerCall[];
}

// ------------------------------------------------------------------ chat records
export type AgentCallStatus = "pending" | "running" | "done" | "error" | "denied" | "dismissed";

export interface AgentResultView {
    /** Where "Open" goes: the new group or project, the page or the editor. */
    href?: string;
    /** Name of what was created (user data, shown as is). */
    title?: string;
    profile?: AgentProfileSummary;
    /** Knowledge entry ids found by search_site. */
    hits?: string[];
}

export interface AgentCallRecord {
    id: string;
    name: AgentToolName;
    args: Record<string, unknown>;
    status: AgentCallStatus;
    /** AgentArgError or an execution error code (see agent-client.ts). */
    error?: string;
    /** The tool result told to the language model. */
    output?: string;
    view?: AgentResultView;
}

export interface AgentMessageState {
    /** Who proposed the calls: the language model (results go back to it) or the offline Core. */
    source: "llm" | "core";
    calls: AgentCallRecord[];
    /** Language model only: "waiting" until every call is settled, then the results are sent once. */
    followUp?: "waiting" | "sent";
    /** Tool rounds before this message within the same user turn. */
    round?: number;
}

export function isSettled(call: AgentCallRecord) {
    return call.status !== "pending" && call.status !== "running";
}

/** The tool result sent to the model for a call that didn't produce one itself. */
export function toolOutput(call: AgentCallRecord): string {
    if (call.output) return call.output;
    switch (call.status) {
        case "denied":
            return JSON.stringify({ status: "denied", note: "The user declined this action. Nothing was done." });
        case "error":
            return JSON.stringify({ status: "error", code: call.error ?? "failed", note: "The action failed. Nothing was changed." });
        default:
            return JSON.stringify({ status: "not_executed", note: "The user did not approve this action. Nothing was done." });
    }
}

// ------------------------------------------------------------------ trailer
export function encodeAgentTrailer(trailer: AgentTrailer): string {
    return `${AGENT_TRAILER_MARK}${JSON.stringify(trailer)}`;
}

/** Model text must never contain the mark's first character. */
export function stripTrailerMark(text: string): string {
    return text.includes(MARK_START) ? text.split(MARK_START).join("") : text;
}

/** Splits streamed text into the visible answer and the agent trailer (null until it is complete). */
export function splitAgentStream(raw: string): { text: string; trailer: AgentTrailer | null } {
    const at = raw.indexOf(MARK_START);
    if (at < 0) return { text: raw, trailer: null };
    const text = raw.slice(0, at);
    const rest = raw.slice(at);
    if (!rest.startsWith(AGENT_TRAILER_MARK)) return { text, trailer: null };
    try {
        const parsed = JSON.parse(rest.slice(AGENT_TRAILER_MARK.length)) as { toolCalls?: unknown };
        const calls = Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [];
        const toolCalls: AgentTrailerCall[] = [];
        for (const entry of calls.slice(0, AGENT_MAX_CALLS)) {
            if (!entry || typeof entry !== "object") continue;
            const call = entry as Record<string, unknown>;
            if (typeof call.id !== "string" || !AGENT_CALL_ID_PATTERN.test(call.id) || typeof call.name !== "string") continue;
            const args = call.args && typeof call.args === "object" && !Array.isArray(call.args) ? call.args as Record<string, unknown> : {};
            toolCalls.push({ id: call.id, name: call.name.slice(0, 64), args, ...(typeof call.error === "string" ? { error: call.error as AgentArgError } : {}) });
        }
        return { text, trailer: { toolCalls } };
    } catch {
        return { text, trailer: null };
    }
}

// ------------------------------------------------------------------ server: incoming history
export const CHAT_LIMITS = {
    /** Raw entries read from the request (tool messages make turns longer). */
    entries: 40,
    messageChars: 8_000,
    toolResultChars: 6_000,
    totalChars: 28_000,
    /** Code of earlier editor calls is shortened in the history; the model wrote it already. */
    historyCodeChars: 4_000,
} as const;

function clipHistoryArgs(name: AgentToolName, args: Record<string, unknown>) {
    if (name === "open_editor_with_code" && typeof args.code === "string" && args.code.length > CHAT_LIMITS.historyCodeChars) {
        return { ...args, code: `${args.code.slice(0, CHAT_LIMITS.historyCodeChars)}\n…` };
    }
    return args;
}

function readText(entry: Record<string, unknown>) {
    const value = typeof entry.content === "string" ? entry.content : typeof entry.text === "string" ? entry.text : "";
    return value.replace(/\0/g, "").trim();
}

function readToolCalls(value: unknown): WireToolCall[] {
    if (!Array.isArray(value)) return [];
    const calls: WireToolCall[] = [];
    for (const item of value.slice(0, AGENT_MAX_CALLS)) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        const fn = entry.function && typeof entry.function === "object" ? entry.function as Record<string, unknown> : entry;
        const id = typeof entry.id === "string" ? entry.id : "";
        const name = fn.name;
        if (!AGENT_CALL_ID_PATTERN.test(id) || !isAgentToolName(name)) continue;
        const sanitized = sanitizeAgentCall(name, fn.arguments ?? fn.args ?? entry.args);
        const args = sanitized.ok ? clipHistoryArgs(name, sanitized.call.args as Record<string, unknown>) : {};
        calls.push({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
    }
    return calls;
}

function flatten(messages: WireMessage[]): WireMessage[] {
    const out: WireMessage[] = [];
    for (const message of messages) {
        if (message.role === "tool") {
            const previous = out[out.length - 1];
            const note = `[Result: ${message.content.slice(0, 600)}]`;
            if (previous && previous.role === "assistant") previous.content = `${previous.content}\n${note}`.trim();
            continue;
        }
        if (message.role === "assistant" && message.tool_calls?.length) {
            const actions = message.tool_calls.map((call) => `[Hanogt AI action: ${call.function.name} ${call.function.arguments.slice(0, 300)}]`).join("\n");
            out.push({ role: "assistant", content: `${message.content}\n${actions}`.trim() });
            continue;
        }
        out.push({ ...message });
    }
    return out;
}

function size(message: WireMessage) {
    return message.content.length + (message.role === "assistant" ? (message.tool_calls ?? []).reduce((sum, call) => sum + call.function.arguments.length + 40, 0) : 0);
}

/**
 * Validates the history sent by the browser. With `tools`, assistant tool
 * calls and their results are kept in OpenAI order (unknown tools and orphan
 * results are dropped; unanswered calls get a "not executed" result);
 * without, they are folded into the assistant text. The result starts with a
 * user message and ends with a user message (or, with tools, a tool result).
 */
export function normalizeChatMessages(raw: unknown, options: { tools: boolean }): WireMessage[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const parsed: WireMessage[] = [];
    for (const item of raw.slice(-CHAT_LIMITS.entries)) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        if (entry.role === "tool") {
            const id = typeof entry.tool_call_id === "string" ? entry.tool_call_id : "";
            const content = readText(entry).slice(0, CHAT_LIMITS.toolResultChars);
            if (AGENT_CALL_ID_PATTERN.test(id)) parsed.push({ role: "tool", tool_call_id: id, content: content || "{}" });
            continue;
        }
        const assistant = entry.role === "assistant" || entry.role === "ai" || entry.role === "bot";
        const content = readText(entry).slice(0, CHAT_LIMITS.messageChars);
        if (assistant) {
            const calls = readToolCalls(entry.tool_calls);
            if (content || calls.length) parsed.push(calls.length ? { role: "assistant", content, tool_calls: calls } : { role: "assistant", content });
        } else if (content) {
            parsed.push({ role: "user", content });
        }
    }

    // Pair every result with a call of the assistant message right before it.
    const paired: WireMessage[] = [];
    let pending: string[] = [];
    const closePending = () => {
        for (const id of pending) paired.push({ role: "tool", tool_call_id: id, content: JSON.stringify({ status: "not_executed" }) });
        pending = [];
    };
    for (const message of parsed) {
        if (message.role === "tool") {
            const index = pending.indexOf(message.tool_call_id);
            if (index < 0) continue;
            pending.splice(index, 1);
            paired.push(message);
            continue;
        }
        closePending();
        paired.push(message);
        if (message.role === "assistant" && message.tool_calls) pending = message.tool_calls.map((call) => call.id);
    }
    closePending();

    let messages = options.tools ? paired : flatten(paired);

    // Keep the newest turns within the budget, cutting only before a user message.
    let total = 0;
    let start = messages.length;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        total += size(messages[index]);
        if (total > CHAT_LIMITS.totalChars && start < messages.length) break;
        if (messages[index].role === "user") start = index;
    }
    messages = messages.slice(start);
    if (!messages.length || messages[0].role !== "user") return null;
    const last = messages[messages.length - 1];
    if (last.role === "user" || (options.tools && last.role === "tool")) return messages;
    return null;
}

// ------------------------------------------------------------------ browser: outgoing history
/** Builds the request history from stored chat messages. */
export function buildWireMessages(messages: readonly AiMessage[], options: { tools: boolean; limit?: number }): WireMessage[] {
    const out: WireMessage[] = [];
    for (const message of messages) {
        if (message.error) continue;
        if (message.role === "user") {
            if (message.content.trim()) out.push({ role: "user", content: message.content });
            continue;
        }
        const agent = message.agent;
        if (agent?.source === "llm" && agent.calls.length && options.tools) {
            out.push({
                role: "assistant",
                content: message.content,
                tool_calls: agent.calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(clipHistoryArgs(call.name, call.args)) } })),
            });
            for (const call of agent.calls) out.push({ role: "tool", tool_call_id: call.id, content: toolOutput(call) });
            continue;
        }
        // Core proposals (and calls when tools are off) are context for the model, as text.
        const notes = agent?.calls.map((call) => `[Hanogt AI action ${call.name}: ${call.status === "done" ? toolOutput(call).slice(0, 400) : call.status}]`).join("\n") ?? "";
        const content = `${message.content}${notes ? `\n${notes}` : ""}`.trim();
        if (content) out.push({ role: "assistant", content });
    }
    const limit = options.limit ?? 24;
    let start = Math.max(0, out.length - limit);
    while (start < out.length && out[start].role !== "user") start += 1;
    return out.slice(start);
}
