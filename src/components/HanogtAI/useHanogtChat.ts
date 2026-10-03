"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRawSession } from "@/components/Provider";
import { executeAgentCall } from "@/lib/ai/agent-client";
import { buildWireMessages, isSettled, type AgentCallRecord, type AgentMessageState } from "@/lib/ai/agent-protocol";
import { agentUserKey, setAgentMode, useAgentGrants, useAgentMode } from "@/lib/ai/agent-settings";
import { AGENT_MAX_ROUNDS, agentDecision, approvalGrantsSession, isAgentToolName, sanitizeAgentCall, type AgentCallInput, type AgentMode } from "@/lib/ai/agent-tools";
import { streamHanogtAI, type AiFailure, type AiStreamResult } from "@/lib/ai/client";
import { isConnectionId } from "@/lib/ai/connections";
import { openHanogtAI, useAiContext } from "@/lib/ai/context-store";
import {
    createId, setActiveConversation, titleFrom, useActiveConversationId, useConversationActions, useConversations,
    type AiConversation, type AiMessage,
} from "@/lib/ai/conversations";
import { answerLocally, proposeActionsLocally, type AiContext, type AiMode } from "@/lib/ai/local-engine";
import { formatResetTime, type LimitDetails } from "@/lib/ai/usage";
import { PLAN_AI_FEATURES } from "@/lib/plans";
import { languageFromFileName } from "@/lib/runtimes/languages";
import { useI18n } from "@/lib/i18n";
import { CHAT_COPY, CONNECTION_FAILURES, MAX_ATTACHMENT_BYTES, MAX_INPUT, NOTICES } from "./chat-copy";
import { useAiConnections } from "./connections-store";
import { useAiSettings } from "./ai-settings-store";
import { useAiUsage } from "./usage-store";

export interface ChatLaunch {
    prompt?: string;
    mode?: AiMode;
    send?: boolean;
    /** Changes on every launch so the same prompt can be sent twice. */
    nonce?: number;
}

export interface FileAttachment {
    name: string;
    language: string;
    code: string;
}

type Streaming = { conversationId: string; messageId: string; text: string };

/** Cards that were still waiting when the user moved on: nothing was done for them. */
function dismissPending(message: AiMessage): AiMessage {
    if (!message.agent?.calls.some((call) => call.status === "pending")) return message;
    return { ...message, agent: { ...message.agent, calls: message.agent.calls.map((call) => (call.status === "pending" ? { ...call, status: "dismissed" as const } : call)) } };
}

function coreAgentState(actions: AgentCallInput[]): AgentMessageState {
    return { source: "core", calls: actions.map((action) => ({ id: `core-${createId()}`, name: action.name, args: action.args as Record<string, unknown>, status: "pending" as const })) };
}

function llmAgentState(result: AiStreamResult, round: number): AgentMessageState | undefined {
    const calls: AgentCallRecord[] = [];
    for (const call of result.toolCalls) {
        if (!isAgentToolName(call.name)) continue;
        calls.push({ id: call.id, name: call.name, args: call.args, status: call.error ? "error" : "pending", ...(call.error ? { error: call.error } : {}) });
    }
    return calls.length ? { source: "llm", calls, followUp: "waiting", round } : undefined;
}

/**
 * Everything the Hanogt AI chat does, for both the floating panel and the
 * /ai page: conversations, streaming from the language model with the
 * offline Core as fallback, attachments, and the agent loop (permission
 * cards, execution with the user's own session, tool results back to the
 * model in follow-up rounds).
 */
export function useHanogtChat({ variant, onClose, launch }: { variant: "panel" | "page"; onClose?: () => void; launch?: ChatLaunch }) {
    const { tx, language, locale } = useI18n();
    const router = useRouter();
    // The language model only needs the NextAuth session, not the Firebase
    // bridge, so the raw session is used: it is known sooner after a page load.
    const { data: session, status } = useRawSession();
    const signedIn = status === "authenticated";
    // While the session is still loading, try the model anyway: the server
    // knows whether this browser is signed in, and the core answers otherwise.
    const tryModel = status !== "unauthenticated";
    const userName = session?.user?.name?.trim() || null;
    // The account's Hanogt AI settings: defaults for this device until it makes its own choice.
    const aiSettings = useAiSettings(signedIn ? session?.user?.email ?? null : null);
    const accountDefaults = aiSettings.data?.settings ?? null;
    const agentMode = useAgentMode(accountDefaults?.agentMode);
    const { granted, grant, revokeAll } = useAgentGrants(agentUserKey(session?.user?.email ?? null));
    // The person's own provider connections (Plus/Pro) and the one chosen on this device.
    const connections = useAiConnections(signedIn ? session?.user?.email ?? null : null, accountDefaults?.defaultModel ?? null);
    const { items: connectionItems, refresh: refreshConnections, select: selectConnection, selectedId: selectedConnection } = connections;
    // Messages used today (the usage meter); every answer updates it from its headers.
    const usage = useAiUsage(signedIn ? session?.user?.email ?? null : null);
    const { applyQuota, applyLimit, applyEngine } = usage;
    // How much of the open file goes with a question: the plan's allowance (Free until the plan is known).
    const contextChars = PLAN_AI_FEATURES[usage.usage?.plan ?? "free"].contextChars;

    const conversations = useConversations();
    const activeId = useActiveConversationId();
    const { create, update, remove, clearAll } = useConversationActions();
    const editorContext = useAiContext();
    const active = useMemo(() => conversations.find((conversation) => conversation.id === activeId) ?? null, [conversations, activeId]);
    // A new chat starts in the account's default mode until one is picked here.
    const [pickedMode, setDraftMode] = useState<AiMode | null>(null);
    const draftMode: AiMode = pickedMode ?? accountDefaults?.defaultMode ?? "general";
    const mode = active?.mode ?? draftMode;
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState<Streaming | null>(null);
    const [attachChoice, setAttachEditorFile] = useState<boolean | null>(null);
    const attachEditorFile = attachChoice ?? accountDefaults?.attachEditorFile ?? true;
    const [attachment, setAttachment] = useState<FileAttachment | null>(null);
    const [attachError, setAttachError] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const runningCalls = useRef(new Set<string>());
    const followUps = useRef(new Set<string>());
    // Values the async agent loop reads after awaits.
    const latest = useRef({ agentMode, granted });
    useEffect(() => {
        latest.current = { agentMode, granted };
    }, [agentMode, granted]);

    const hasEditorFile = Boolean(editorContext?.code?.trim());
    const busy = Boolean(streaming);

    const finish = useCallback((conversationId: string, messageId: string, patch: Partial<AiMessage>) => {
        update(conversationId, (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
        }));
    }, [update]);

    const patchCall = useCallback((conversationId: string, messageId: string, callId: string, patch: Partial<AgentCallRecord>) => {
        update(conversationId, (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) => (message.id !== messageId || !message.agent ? message : {
                ...message,
                agent: { ...message.agent, calls: message.agent.calls.map((call) => (call.id === callId ? { ...call, ...patch } : call)) },
            })),
        }));
    }, [update]);

    const navigate = useCallback((href: string) => {
        // Leaving /ai: the floating panel opens on the next page with the same conversation.
        if (variant === "page") openHanogtAI();
        router.push(href);
        if (variant === "panel" && window.matchMedia("(max-width: 639px)").matches) onClose?.();
    }, [onClose, router, variant]);

    /** Runs one call: after the user approved it, or right away when the agent mode allows it. */
    const runCall = useCallback(async (conversationId: string, messageId: string, record: AgentCallRecord, options: { args?: Record<string, unknown>; remember?: boolean; approved: boolean }) => {
        const key = `${messageId}:${record.id}`;
        if (runningCalls.current.has(key) || latest.current.agentMode === "off") return;
        runningCalls.current.add(key);
        try {
            const sanitized = sanitizeAgentCall(record.name, options.args ?? record.args);
            if (!sanitized.ok) {
                patchCall(conversationId, messageId, record.id, { status: "error", error: sanitized.error });
                return;
            }
            patchCall(conversationId, messageId, record.id, { status: "running", args: sanitized.call.args as Record<string, unknown>, error: undefined });
            if (options.approved && approvalGrantsSession(record.name, options.remember === true)) grant(record.name);
            const result = await executeAgentCall(sanitized.call, { navigate, language, signedIn });
            patchCall(conversationId, messageId, record.id, result.ok ? { status: "done", output: result.output, view: result.view } : { status: "error", error: result.error });
        } finally {
            runningCalls.current.delete(key);
        }
    }, [grant, language, navigate, patchCall, signedIn]);

    const autoRun = useCallback((conversationId: string, messageId: string, state: AgentMessageState | undefined) => {
        if (!state) return;
        for (const call of state.calls) {
            if (call.status !== "pending") continue;
            const decision = agentDecision(call.name, { mode: latest.current.agentMode, granted: latest.current.granted.includes(call.name) });
            if (decision === "run") void runCall(conversationId, messageId, call, { approved: false });
        }
    }, [runCall]);

    /** What an answer records about the model that wrote it. */
    const answeredBy = useCallback((result: AiStreamResult): Partial<AiMessage> => {
        const model = result.model?.slice(0, 200);
        const engine: Partial<AiMessage> = { ...(result.engine === "advanced" ? { advanced: true } : {}), ...(result.engineNote ? { engineNote: result.engineNote } : {}) };
        if (!result.connectionId) return { ...(model ? { model } : {}), ...engine };
        const label = connectionItems.find((item) => item.id === result.connectionId)?.label;
        return { ...(model ? { model } : {}), connectionId: result.connectionId, ...(label ? { connectionLabel: label } : {}) };
    }, [connectionItems]);

    /** After a connection failed: show its state again, and go back to Hanogt AI when it can't be used any more. */
    const connectionFailed = useCallback((failure: AiFailure | undefined) => {
        if (!failure || !CONNECTION_FAILURES.has(failure)) return;
        if (failure === "connection_unavailable") selectConnection(null);
        refreshConnections();
    }, [refreshConnections, selectConnection]);

    const buildContext = useCallback((): AiContext => {
        if (attachment) return { code: attachment.code, language: attachment.language, fileName: attachment.name, path: window.location.pathname };
        if (hasEditorFile && attachEditorFile && editorContext) return editorContext;
        return { path: editorContext?.path ?? window.location.pathname };
    }, [attachEditorFile, attachment, editorContext, hasEditorFile]);

    const ask = useCallback(async (raw: string, history?: AiMessage[]) => {
        const text = raw.trim().slice(0, MAX_INPUT);
        if (!text || controllerRef.current) return;
        let conversation: AiConversation | null = active;
        if (!conversation) conversation = create(draftMode, titleFrom(text));
        const conversationId = conversation.id;
        const context = buildContext();
        const sentAttachment = attachment;
        const userMessage: AiMessage = {
            id: createId(),
            role: "user",
            content: text,
            createdAt: Date.now(),
            ...(sentAttachment ? { attachment: { name: sentAttachment.name, language: sentAttachment.language } } : {}),
        };
        const assistantId = createId();
        // A new message answers any card that was still waiting.
        const base = (history ?? conversation.messages).map(dismissPending);
        update(conversationId, (current) => ({
            ...current,
            title: current.title || titleFrom(text),
            messages: [...base, userMessage, { id: assistantId, role: "assistant", content: "", createdAt: Date.now() }],
        }));
        setInput("");
        setAttachment(null);
        setAttachError(null);
        setStreaming({ conversationId, messageId: assistantId, text: "" });

        const currentMode = conversation.mode;
        const agentOn = latest.current.agentMode !== "off";
        const connectionId = selectedConnection;
        const runCore = async (failure?: AiFailure, retryAfterSeconds?: number, limit?: LimitDetails) => {
            const reply = await answerLocally(text, { tx, locale, mode: currentMode, signedIn, context, agentMode: latest.current.agentMode });
            const retryable = failure === "rate_limited" || failure === "connection_rate_limited";
            // A daily limit says when it renews (24 hours after the first message), and how to get more.
            const dailyLimit = limit && (failure === "daily_limit" || failure === "connection_daily_limit") ? limit : null;
            const notice = !failure || failure === "aborted" ? undefined
                : dailyLimit ? tx(dailyLimit.quota === "own" ? CHAT_COPY.ownDailyLimitAt : CHAT_COPY.dailyLimitAt, { limit: dailyLimit.limit.toLocaleString(locale), time: dailyLimit.resetsAt ? formatResetTime(dailyLimit.resetsAt, locale) : "—" })
                    : [tx(NOTICES[failure]), retryable && retryAfterSeconds ? tx(CHAT_COPY.retryIn, { seconds: retryAfterSeconds }) : ""].filter(Boolean).join(" ");
            const agent = reply.actions?.length ? coreAgentState(reply.actions) : undefined;
            finish(conversationId, assistantId, { content: reply.text, engine: "core", sources: reply.sources, code: reply.code, notice, noticeAction: dailyLimit?.upgrade ? "plans" : undefined, agent });
            autoRun(conversationId, assistantId, agent);
        };

        try {
            if (!tryModel) {
                await new Promise((resolve) => window.setTimeout(resolve, 280));
                await runCore();
                return;
            }
            const controller = new AbortController();
            controllerRef.current = controller;
            let frame = 0;
            const result = await streamHanogtAI({
                messages: buildWireMessages([...base, userMessage], { tools: agentOn }),
                mode: currentMode,
                language,
                context,
                agent: agentOn,
                connectionId,
                contextChars,
                signal: controller.signal,
                onToken: (soFar) => {
                    cancelAnimationFrame(frame);
                    frame = requestAnimationFrame(() => setStreaming((current) => (current && current.messageId === assistantId ? { ...current, text: soFar } : current)));
                },
            });
            cancelAnimationFrame(frame);
            applyQuota(result.quota);
            applyLimit(result.limit);
            applyEngine(result.engineWindow, result.engineNote);
            if (result.ok) {
                let agent = llmAgentState(result, 0);
                // The provider can't call tools: the Core proposes the same actions.
                if (!agent && result.agent === "unsupported" && agentOn) {
                    const actions = await proposeActionsLocally(text, { tx, context });
                    if (actions.length) agent = coreAgentState(actions);
                }
                finish(conversationId, assistantId, { content: result.text, engine: "llm", sources: result.sources, notice: result.failure === "aborted" ? tx(NOTICES.aborted) : undefined, agent, ...answeredBy(result) });
                autoRun(conversationId, assistantId, agent);
            } else if (result.failure === "aborted") {
                if (result.text) finish(conversationId, assistantId, { content: result.text, engine: "llm", notice: tx(NOTICES.aborted), ...answeredBy(result) });
                else update(conversationId, (current) => ({ ...current, messages: current.messages.filter((message) => message.id !== assistantId) }));
            } else {
                connectionFailed(result.failure);
                // A signed-out visitor asking during session loading needs no "session expired" notice.
                await runCore(result.failure === "auth_required" && !signedIn ? undefined : result.failure, result.retryAfterSeconds, result.limit);
            }
        } catch {
            finish(conversationId, assistantId, { content: tx(CHAT_COPY.somethingWrong), error: true });
        } finally {
            controllerRef.current = null;
            setStreaming(null);
        }
    }, [active, answeredBy, applyEngine, applyLimit, applyQuota, attachment, autoRun, buildContext, connectionFailed, contextChars, create, draftMode, finish, language, locale, selectedConnection, signedIn, tryModel, tx, update]);

    /** Sends the tool results back to the model once every card of its message is settled. */
    const continueAfterTools = useCallback(async (conversation: AiConversation, source: AiMessage) => {
        if (controllerRef.current || !source.agent) return;
        const conversationId = conversation.id;
        const round = (source.agent.round ?? 0) + 1;
        const final = round >= AGENT_MAX_ROUNDS;
        const assistantId = createId();
        update(conversationId, (current) => ({
            ...current,
            messages: [
                ...current.messages.map((message) => (message.id === source.id && message.agent ? { ...message, agent: { ...message.agent, followUp: "sent" as const } } : message)),
                { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
            ],
        }));
        setStreaming({ conversationId, messageId: assistantId, text: "" });
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
            let frame = 0;
            const result = await streamHanogtAI({
                messages: buildWireMessages(conversation.messages, { tools: true }),
                mode: conversation.mode,
                language,
                agent: true,
                agentFinal: final,
                // The tool results go back to the model that asked for them.
                connectionId: isConnectionId(source.connectionId) ? source.connectionId : null,
                signal: controller.signal,
                onToken: (soFar) => {
                    cancelAnimationFrame(frame);
                    frame = requestAnimationFrame(() => setStreaming((current) => (current && current.messageId === assistantId ? { ...current, text: soFar } : current)));
                },
            });
            cancelAnimationFrame(frame);
            applyQuota(result.quota);
            applyLimit(result.limit);
            applyEngine(result.engineWindow, result.engineNote);
            if (result.ok) {
                const agent = final ? undefined : llmAgentState(result, round);
                finish(conversationId, assistantId, { content: result.text, engine: "llm", sources: result.sources, agent, ...answeredBy(result) });
                autoRun(conversationId, assistantId, agent);
            } else if (result.failure === "aborted") {
                if (result.text) finish(conversationId, assistantId, { content: result.text, engine: "llm", notice: tx(NOTICES.aborted), ...answeredBy(result) });
                else update(conversationId, (current) => ({ ...current, messages: current.messages.filter((message) => message.id !== assistantId) }));
            } else {
                connectionFailed(result.failure);
                finish(conversationId, assistantId, { content: tx(CHAT_COPY.followUpFailed), engine: "core" });
            }
        } catch {
            finish(conversationId, assistantId, { content: tx(CHAT_COPY.somethingWrong), error: true });
        } finally {
            controllerRef.current = null;
            setStreaming(null);
        }
    }, [answeredBy, applyEngine, applyLimit, applyQuota, autoRun, connectionFailed, finish, language, tx, update]);

    // The follow-up starts when the last message's cards are all settled.
    useEffect(() => {
        if (!active || streaming) return;
        const last = active.messages[active.messages.length - 1];
        const state = last?.role === "assistant" ? last.agent : undefined;
        if (!state || state.source !== "llm" || state.followUp !== "waiting" || !state.calls.every(isSettled)) return;
        // Answered by a newer message: nothing to report.
        if (followUps.current.has(last.id) || state.calls.some((call) => call.status === "dismissed")) return;
        const timer = window.setTimeout(() => {
            if (followUps.current.has(last.id)) return;
            followUps.current.add(last.id);
            void continueAfterTools(active, last);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [active, continueAfterTools, streaming]);

    const approve = useCallback((messageId: string, callId: string, args: Record<string, unknown>, remember: boolean) => {
        const record = active?.messages.find((message) => message.id === messageId)?.agent?.calls.find((call) => call.id === callId);
        if (!active || !record || record.status !== "pending") return;
        void runCall(active.id, messageId, record, { args, remember, approved: true });
    }, [active, runCall]);

    const deny = useCallback((messageId: string, callId: string) => {
        if (active) patchCall(active.id, messageId, callId, { status: "denied" });
    }, [active, patchCall]);

    // Launch requests (e.g. "Ask Hanogt AI" buttons elsewhere on the site).
    // Local state is adjusted while rendering; store writes and sending happen in the effect.
    const askRef = useRef(ask);
    useEffect(() => {
        askRef.current = ask;
    }, [ask]);
    const lastLaunch = useRef<number | undefined>(undefined);
    const [handledLaunch, setHandledLaunch] = useState<number | undefined>(undefined);
    if (launch?.nonce !== undefined && launch.nonce !== handledLaunch) {
        setHandledLaunch(launch.nonce);
        if (launch.mode && !active) setDraftMode(launch.mode);
        if (launch.prompt && !launch.send) setInput(launch.prompt);
    }
    useEffect(() => {
        if (launch?.nonce === undefined || launch.nonce === lastLaunch.current) return;
        lastLaunch.current = launch.nonce;
        if (launch.mode && active && launch.mode !== active.mode) {
            if (active.messages.length) create(launch.mode);
            else update(active.id, (conversation) => ({ ...conversation, mode: launch.mode! }));
        }
        const prompt = launch.prompt;
        const timer = window.setTimeout(() => {
            if (prompt && launch.send) void askRef.current(prompt);
        }, 80);
        return () => window.clearTimeout(timer);
        // Runs once per launch; `active`, `create` and `update` are read at that moment on purpose.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [launch?.nonce]);

    const stop = useCallback(() => controllerRef.current?.abort(), []);

    const newChat = useCallback(() => {
        controllerRef.current?.abort();
        setActiveConversation(null);
        // A new chat starts in the default mode (the account's Hanogt AI settings, else General).
        setDraftMode(null);
        setInput("");
        setAttachment(null);
        setAttachError(null);
    }, []);

    const switchMode = useCallback((next: AiMode) => {
        if (busy || next === mode) return;
        if (active && active.messages.length) create(next);
        else if (active) update(active.id, (conversation) => ({ ...conversation, mode: next }));
        else setDraftMode(next);
    }, [active, busy, create, mode, update]);

    const regenerate = useCallback(() => {
        if (!active || busy) return;
        const lastUserIndex = active.messages.map((message) => message.role).lastIndexOf("user");
        if (lastUserIndex < 0) return;
        void ask(active.messages[lastUserIndex].content, active.messages.slice(0, lastUserIndex));
    }, [active, ask, busy]);

    /** Replaces the last question and answers it again. */
    const editLast = useCallback((text: string) => {
        if (!active || busy || !text.trim()) return;
        const lastUserIndex = active.messages.map((message) => message.role).lastIndexOf("user");
        if (lastUserIndex < 0) return;
        void ask(text, active.messages.slice(0, lastUserIndex));
    }, [active, ask, busy]);

    const setFeedback = useCallback((messageId: string, value: "up" | "down") => {
        if (!active) return;
        update(active.id, (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) => (message.id === messageId ? { ...message, feedback: message.feedback === value ? undefined : value } : message)),
        }));
    }, [active, update]);

    const rename = useCallback((id: string, title: string) => {
        update(id, (conversation) => ({ ...conversation, title: title.trim().slice(0, 80) || conversation.title }));
    }, [update]);

    const attachFile = useCallback(async (file: File) => {
        setAttachError(null);
        if (file.size > MAX_ATTACHMENT_BYTES) {
            setAttachError(tx(CHAT_COPY.attachTooLarge));
            return;
        }
        try {
            const code = await file.text();
            if (code.includes("\u0000")) throw new Error("binary");
            setAttachment({ name: file.name.slice(0, 120), language: languageFromFileName(file.name)?.id ?? "plaintext", code });
        } catch {
            setAttachError(tx(CHAT_COPY.attachUnreadable));
        }
    }, [tx]);

    return {
        // identity
        signedIn, status, userName,
        // conversations
        conversations, active, activeId, messages: active?.messages ?? [], selectConversation: setActiveConversation, rename, remove, clearAll,
        // composer
        mode, switchMode, input, setInput, busy, streaming, ask, stop, newChat, regenerate, editLast, setFeedback,
        editorContext, hasEditorFile, attachEditorFile, setAttachEditorFile, attachment, setAttachment, attachFile, attachError,
        // agent
        agent: { mode: agentMode, setMode: setAgentMode as (mode: AgentMode) => void, granted, revokeAll, approve, deny },
        // own provider connections
        connections,
        // messages used today
        usage,
        navigate,
    };
}

export type HanogtChat = ReturnType<typeof useHanogtChat>;
