import { after, NextRequest, NextResponse } from "next/server";
import { normalizeChatMessages, stripTrailerMark, type WireMessage } from "@/lib/ai/agent-protocol";
import { agentToolSchemas, detectSensitiveRequest, isHowToQuestion } from "@/lib/ai/agent-tools";
import { normalizeAiSettings } from "@/lib/ai/ai-settings";
import { DEFAULT_CONNECTION, isConnectionId, ownKeyRequestParams, type AiConnectionError } from "@/lib/ai/connections";
import { WIRE_CONTENT_TYPE, WIRE_HEADER, WIRE_VERSION } from "@/lib/ai/stream-protocol";
import { reasoningOf, splitThinkingText, stripThinkBlocks, wantsThinking, type ThinkingStep } from "@/lib/ai/thinking";
import type { WindowQuota } from "@/lib/ai/usage";
import { PLAN_AI_FEATURES, type PlanId } from "@/lib/plans";
import { languageDisplayName } from "@/lib/runtimes/languages";
import { getActiveSession } from "@/lib/server/active-session";
import { classifyProviderFailure, markUsed, resolveConnectionForChat, shouldRecordUse, type ResolvedConnection } from "@/lib/server/ai-connections";
import { enforceHanogtAi, enforceOwnKeys, quotaHeaders, refundHanogtAi, refusalDetails, type QuotaPass, type QuotaRefusal } from "@/lib/server/ai-usage";
import { LANGUAGE_NAMES, analyzeMessage, clip, hanogtRequestBody, knowledgeNotes, providerConfig, systemPrompt, type AgentStatus, type AiAnswerMode, type PersonalPreferences, type PromptOptions } from "@/lib/server/hanogt-ai";
import { chatOutputStream, collectToolCalls, trailerCalls, type CallAccumulator, type ToolCallDelta } from "@/lib/server/hanogt-ai-stream";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** What answers from Hanogt AI's own model say about the model: never the upstream id or provider. */
const OWN_MODEL_NAME = "hanogt-ai";

function errorResponse(status: number, code: string, error: string, extra: Record<string, string> = {}) {
    return NextResponse.json({ error, code }, { status, headers: jsonSecurityHeaders(extra) });
}

/** A limit refused the message: 429 with the limit, when it resets and which plan raises it. */
function limitResponse(refusal: QuotaRefusal, error: string) {
    return NextResponse.json({ error, code: refusal.code, ...refusalDetails(refusal) }, { status: 429, headers: jsonSecurityHeaders({ "Retry-After": String(refusal.retryAfterSeconds) }) });
}

/** A Paddle check that outlives the request keeps running after the answer. */
function keepRunning(work: Promise<unknown>) {
    after(() => work.then(() => undefined, () => undefined));
}

/**
 * How a failed request through the person's own connection is reported (never
 * with the provider's text). A provider's failure is 424, never 502/504:
 * Cloudflare replaces those answers with its own page and the code is lost.
 */
const CONNECTION_FAILURES: Record<AiConnectionError, { status: number; code: string; error: string }> = {
    invalid_key: { status: 424, code: "connection_invalid", error: "Sağlayıcı bağlantınızın API anahtarını kabul etmedi. Bağlantı ayarlarından anahtarınızı kontrol edin." },
    quota: { status: 402, code: "connection_quota", error: "Sağlayıcı hesabınızın kotası ya da kredisi doldu." },
    model_not_found: { status: 424, code: "connection_model", error: "Seçilen model sağlayıcıda bulunamadı. Bağlantı ayarlarından modeli değiştirin." },
    rate_limited: { status: 429, code: "upstream_rate_limited", error: "Sağlayıcının istek sınırına ulaşıldı. Biraz sonra tekrar deneyin." },
    provider_error: { status: 424, code: "upstream_error", error: "Dil modeli isteği tamamlayamadı." },
    unreachable: { status: 503, code: "upstream_unreachable", error: "Dil modeli hizmetine bağlanılamadı." },
    key_unreadable: { status: 409, code: "connection_unavailable", error: "Bu bağlantı kullanılamıyor." },
};

/** A provider's Retry-After in seconds, when it sent a sensible one. */
function retryAfterOf(response: Response): Record<string, string> {
    const seconds = Number(response.headers.get("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 && seconds <= 3_600 ? { "Retry-After": String(Math.ceil(seconds)) } : {};
}

/** Thinking never goes back to the model: an assistant turn of the history loses a leading <think> block. */
function withoutThinking(messages: WireMessage[]): WireMessage[] {
    return messages.map((message) => (message.role === "assistant" && typeof message.content === "string" ? { ...message, content: stripThinkBlocks(message.content) } : message));
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return errorResponse(403, "forbidden_origin", "Geçersiz istek kaynağı.");
    const activeSession = await getActiveSession();
    if (!activeSession) return errorResponse(401, "auth_required", "Hanogt AI'ı kullanmak için giriş yapın ya da kaydolun.");
    const { email } = activeSession;

    const body = await readJsonBody(request, 300_000);
    if (!body) return errorResponse(400, "bad_request", "Geçersiz istek gövdesi.");
    // The person's own provider connection (Plus/Pro); absent or empty means Hanogt AI's model.
    const connectionId = body.connectionId === undefined || body.connectionId === null || body.connectionId === "" ? null : body.connectionId;
    if (connectionId !== null && !isConnectionId(connectionId)) return errorResponse(400, "bad_request", "Geçersiz bağlantı.");

    // The request is checked before anything is counted: a malformed one never uses up a message.
    const agentRequested = body.agent === true;
    const normalized = normalizeChatMessages(body.messages, { tools: agentRequested });
    if (!normalized) return errorResponse(400, "bad_request", "Mesajlar geçersiz.");
    const messages = withoutThinking(normalized);
    const mode: AiAnswerMode = body.mode === "code" || body.mode === "security" ? body.mode : "general";
    const language = typeof body.language === "string" && /^[A-Z]{2}$/.test(body.language) ? body.language : "TR";
    const stream = body.stream !== false;
    // Browsers that know the version 2 stream (thinking, steps, how the answer ended) ask for it.
    const wire: 1 | 2 = body.wire === WIRE_VERSION ? 2 : 1;
    // The browser sets agentFinal on the last allowed tool round so the model answers in text.
    const toolChoice = body.agentFinal === true ? "none" : "auto";
    const context = body.context && typeof body.context === "object" ? body.context as Record<string, unknown> : {};
    const path = typeof context.path === "string" && /^\/[\w\-/#?=&.%]{0,200}$/.test(context.path) ? context.path : "";
    // The open file is clipped to the plan's length once the plan is known (Free 12,000, Plus 24,000, Pro 40,000 characters).
    const contextCode = typeof context.code === "string" ? context.code.replace(/\0/g, "") : "";
    const fileName = typeof context.fileName === "string" ? context.fileName.replace(/[^\w.\- ]/g, "").slice(0, 80) || "main" : "main";
    const fileLanguage = typeof context.language === "string" ? context.language.replace(/[^\w#+-]/g, "").slice(0, 20) : "text";
    // With the open file only: the errors of its last run and the names of the project's other files.
    const consoleErrors = typeof context.consoleErrors === "string" ? context.consoleErrors.replace(/\0/g, "").slice(-6_000) : "";
    const projectFiles = Array.isArray(context.projectFiles) ? context.projectFiles.filter((name): name is string => typeof name === "string").slice(0, 50) : [];

    let target: { apiKey: string; baseUrl: string; model: string; connection: ResolvedConnection | null; extraBody: Record<string, unknown> };
    // The window this message was counted in; every answer reports it (X-Hanogt-AI-Window-*) for the usage meter.
    let quota: WindowQuota;
    // The plan the message was counted under: it sets the answer's length and how much of the file is read.
    let plan: PlanId;
    // What refund needs to give the message back when nothing was answered.
    let hanogtPass: QuotaPass | null = null;
    if (connectionId) {
        // Own connections (Plus and Pro) count in Hanogt AI's window like any other message.
        const counted = await enforceOwnKeys(email, { onLate: keepRunning });
        if (!counted.ok) {
            if (counted.code === "connection_unavailable") return errorResponse(409, "connection_unavailable", "Bu bağlantı kullanılamıyor: silinmiş olabilir ya da planınız kapsamıyor olabilir.");
            const error = counted.code === "usage_limit" ? "Hanogt AI mesaj hakkınız doldu; kendi bağlantılarınızla gönderdiğiniz mesajlar da bu haktan düşer." : "Çok hızlı mesaj gönderiyorsunuz. Biraz sonra tekrar deneyin.";
            return limitResponse(counted, error);
        }
        hanogtPass = counted;
        quota = counted.quota;
        plan = counted.plan;
        /** The connection can't be used: the message is given back, then the error. */
        const unusable = async (status: number, code: string, error: string) => {
            const refunded = await refundHanogtAi(counted);
            return NextResponse.json({ error, code, refunded }, { status, headers: jsonSecurityHeaders(quotaHeaders(counted.quota)) });
        };
        let connection: ResolvedConnection | null;
        try {
            connection = await resolveConnectionForChat(email, connectionId, plan);
        } catch {
            return unusable(503, "unavailable", "Bağlantı bilgileri şu anda okunamadı. Biraz sonra tekrar deneyin.");
        }
        if (!connection) return unusable(409, "connection_unavailable", "Bu bağlantı kullanılamıyor: silinmiş olabilir ya da planınız kapsamıyor olabilir.");
        target = { apiKey: connection.apiKey, baseUrl: connection.baseUrl, model: connection.model, connection, extraBody: {} };
    } else {
        const config = providerConfig();
        // Nothing is counted: the browser's Hanogt AI Core answers instead.
        if (!config) return errorResponse(503, "not_configured", "Hanogt AI'ın modeli bu sunucuda yapılandırılmamış.");
        // Plans, staff grants and a purchase Paddle hasn't reported yet (asked before refusing) set the limits.
        const counted = await enforceHanogtAi(email, { source: "chat", onLate: keepRunning });
        if (!counted.ok) {
            const error = counted.code === "usage_limit" ? "Hanogt AI mesaj hakkınız doldu." : "Çok hızlı mesaj gönderiyorsunuz. Biraz sonra tekrar deneyin.";
            return limitResponse(counted, error);
        }
        hanogtPass = counted;
        quota = counted.quota;
        plan = counted.plan;
        target = { ...config, connection: null };
    }
    const features = PLAN_AI_FEATURES[plan];
    // The person's Hanogt AI settings, from the user document the session check has read (cut to the plan).
    const settings = normalizeAiSettings(activeSession.user.aiSettings, plan);
    const answerLanguage = settings.language === "site" ? language : settings.language;
    const personal: PersonalPreferences = {
        about: settings.about,
        style: settings.style,
        tone: settings.tone,
        length: settings.length,
        expertise: settings.expertise,
        commentLanguage: settings.commentLanguage === "site" ? "" : LANGUAGE_NAMES[settings.commentLanguage] ?? "",
        codeStyle: settings.codeStyle,
        preferredLanguages: settings.preferredLanguages.map((id) => languageDisplayName(id)),
        codeOutput: settings.codeOutput,
    };
    const fileCode = contextCode ? clip(contextCode, features.contextChars) : "";
    const file = fileCode.trim() ? { name: fileName, language: fileLanguage, code: fileCode } : null;
    const counted = quotaHeaders(quota);
    const ownConnection = target.connection;
    /** Notes the outcome on the connection after the response (best effort, at most once a minute per outcome). */
    const recordUse = (error: AiConnectionError | null) => {
        if (ownConnection && shouldRecordUse(ownConnection, error)) after(() => markUsed(email, ownConnection.id, error));
    };
    /** Gives the message back to Hanogt AI's window when nothing was answered (by its model or the person's connection). */
    const refund = async () => (hanogtPass ? refundHanogtAi(hanogtPass) : false);
    /** A failure before any answer: the message is given back, then the error. */
    const failed = async (status: number, code: string, error: string, extra: Record<string, string> = {}) => {
        const refunded = await refund();
        return NextResponse.json({ error, code, refunded }, { status, headers: jsonSecurityHeaders({ ...counted, ...extra }) });
    };

    // Follow-up rounds end with tool results; knowledge and analyzers use the user's own words.
    const userTurns = messages.filter((turn): turn is Extract<WireMessage, { role: "user" }> => turn.role === "user");
    const latest = userTurns[userTurns.length - 1]?.content ?? "";
    const previousUser = userTurns[userTurns.length - 2]?.content ?? "";
    const { notes, titles, sources } = knowledgeNotes(`${latest} ${previousUser.slice(0, 300)}`, answerLanguage === "TR");
    const sensitiveRequest = detectSensitiveRequest(latest);
    const sensitive = sensitiveRequest && !isHowToQuestion(latest) ? sensitiveRequest : null;
    const analyses = analyzeMessage(latest);
    const promptOptions = (agent: AgentStatus | "requested"): PromptOptions => ({ language: answerLanguage, mode, path, knowledge: notes, tools: analyses.map((item) => item.note), file, consoleErrors: file ? consoleErrors : null, projectFiles: file ? projectFiles : null, agent, sensitive, personal, personalMax: features.instructionsChars });
    const promptFor = (agent: AgentStatus | "requested") => systemPrompt(promptOptions(agent));

    // Thinking first: the person's setting decides for Hanogt AI's own model; own connections think as their model does.
    const thinking = ownConnection ? null : wantsThinking(settings.thinking, { mode, message: latest });
    const forwardThinking = wire === 2 && settings.showThinking;
    const preopened = !ownConnection && (process.env.HANOGT_AI_THINKING || "").trim().toLowerCase() === "preopened";

    const upstreamAbort = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        upstreamAbort.abort();
    }, 55_000);
    request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true });

    const baseTemperature = agentRequested ? 0.3 : mode === "code" ? 0.25 : 0.45;
    // Hanogt AI's own model answers at most the plan's length (Free 1,800, Plus 3,000, Pro 4,000 tokens), plus a
    // thinking budget when it thinks; Qwen3's recommended sampling for thinking. Own keys are the person's own.
    const sampling = ownConnection
        ? ownKeyRequestParams(ownConnection.provider, target.model, baseTemperature)
        : thinking
            ? { temperature: 0.6, top_p: 0.95, max_tokens: features.maxTokens + features.thinkingTokens }
            : { temperature: baseTemperature, max_tokens: features.maxTokens };
    const send = (payload: Record<string, unknown>, withThinking: boolean) => {
        const fields = { model: target.model, ...sampling, stream, ...payload };
        const requestBody = ownConnection ? fields : hanogtRequestBody(target.extraBody, fields, withThinking ? thinking : null);
        return fetch(`${target.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.apiKey}` },
            body: JSON.stringify(requestBody),
            signal: upstreamAbort.signal,
            cache: "no-store",
            // Own keys only go to the provider's fixed address, never where a redirect points.
            ...(ownConnection ? { redirect: "error" as const } : {}),
        });
    };

    let agentStatus: AgentStatus = agentRequested ? "tools" : "off";
    let upstream: Response;
    try {
        const plainMessages = () => normalizeChatMessages(body.messages, { tools: false });
        let payload: Record<string, unknown> = agentRequested
            ? { messages: [{ role: "system", content: promptFor("requested") }, ...messages], tools: agentToolSchemas(), tool_choice: toolChoice }
            : { messages: [{ role: "system", content: promptFor("off") }, ...messages] };
        let withThinking = thinking !== null;
        upstream = await send(payload, withThinking);
        // A server that doesn't know chat_template_kwargs: once more without it.
        if (upstream.status === 400 && withThinking) {
            await upstream.body?.cancel().catch(() => undefined);
            withThinking = false;
            upstream = await send(payload, withThinking);
        }
        if (agentRequested && upstream.status === 400) {
            // The provider or model rejected function calling (or produced a malformed call):
            // answer without tools; the browser maps the request to an action with Hanogt AI Core.
            await upstream.body?.cancel().catch(() => undefined);
            const plain = plainMessages();
            if (plain) {
                agentStatus = "unsupported";
                payload = { messages: [{ role: "system", content: promptFor("off") }, ...withoutThinking(plain)] };
                upstream = await send(payload, withThinking);
            }
        }
    } catch (error) {
        clearTimeout(timeout);
        const aborted = error instanceof Error && error.name === "AbortError";
        // A stop in the browser is not the connection's fault.
        if (!request.signal.aborted) recordUse("unreachable");
        return failed(503, aborted ? "timeout" : "upstream_unreachable", aborted ? "Yanıt zaman aşımına uğradı." : "Dil modeli hizmetine bağlanılamadı.");
    }

    if (!upstream.ok || !upstream.body) {
        clearTimeout(timeout);
        // Never forward the provider's error body (it can echo request details).
        console.warn(`[hanogt-ai] provider status ${upstream.status}${ownConnection ? ` (own connection, ${ownConnection.provider})` : ""}`);
        if (ownConnection) {
            const failure = upstream.ok ? "provider_error" : await classifyProviderFailure(upstream);
            if (upstream.ok) await upstream.body?.cancel().catch(() => undefined);
            recordUse(failure);
            const reply = CONNECTION_FAILURES[failure];
            // The provider answered nothing: the message is given back to Hanogt AI's window.
            return failed(reply.status, reply.code, reply.error, failure === "rate_limited" ? retryAfterOf(upstream) : {});
        }
        await upstream.body?.cancel().catch(() => undefined);
        const code = upstream.status === 429 ? "upstream_rate_limited" : upstream.status === 401 || upstream.status === 403 ? "not_configured" : "upstream_error";
        return failed(upstream.status === 429 ? 429 : 424, code, "Dil modeli isteği tamamlayamadı.");
    }
    recordUse(null);

    const modelName = ownConnection ? target.model : OWN_MODEL_NAME;
    const meta: Record<string, string> = {
        "X-Hanogt-AI-Model": encodeURIComponent(modelName),
        "X-Hanogt-AI-Sources": encodeURIComponent(JSON.stringify(sources)),
        "X-Hanogt-AI-Agent": agentStatus,
        "X-Hanogt-AI-Thinking": thinking ? "on" : "off",
        // Which connection answered: its id, or "hanogt" for Hanogt AI's own model.
        "X-Hanogt-AI-Connection": ownConnection ? ownConnection.id : DEFAULT_CONNECTION,
        ...(ownConnection ? { "X-Hanogt-AI-Provider": ownConnection.provider } : {}),
        // The window this message counted in (usage meter); see src/lib/ai/usage.ts.
        ...counted,
    };

    if (!stream) {
        clearTimeout(timeout);
        type Completion = { choices?: Array<{ message?: { content?: string | null; reasoning_content?: unknown; reasoning?: unknown; tool_calls?: Array<ToolCallDelta & { function?: { name?: string; arguments?: string } }> }; finish_reason?: unknown }> };
        const data = await upstream.json().catch(() => null) as Completion | null;
        const choice = data?.choices?.[0]?.message;
        const { thinking: thought, text } = splitThinkingText(choice?.content ?? "", reasoningOf(choice), { preopened, complete: data?.choices?.[0]?.finish_reason !== "length" });
        const message = stripTrailerMark(text);
        const calls: CallAccumulator = new Map();
        if (agentStatus === "tools") collectToolCalls(calls, choice?.tool_calls?.map((call, index) => ({ ...call, index })));
        const toolCalls = trailerCalls(calls);
        if (!message && !toolCalls.length) return failed(424, "upstream_error", "Dil modeli boş yanıt verdi.");
        return NextResponse.json({ message, ...(settings.showThinking && thought ? { thinking: thought } : {}), toolCalls, sources, model: modelName, connection: ownConnection ? ownConnection.id : DEFAULT_CONNECTION, agent: agentStatus }, { headers: jsonSecurityHeaders(meta) });
    }

    // The steps taken before the answer, shown in the thinking panel.
    const steps: ThinkingStep[] = [
        ...(titles.length ? [{ kind: "knowledge" as const, titles: titles.slice(0, 4) }] : []),
        ...analyses.map((item) => ({ kind: "analyzer" as const, id: item.id })),
        ...(file ? [{ kind: "file" as const, name: file.name }] : []),
        ...(agentStatus !== "off" ? [{ kind: "agent" as const, state: agentStatus }] : []),
    ];
    const output = chatOutputStream(upstream.body, {
        wire,
        tools: agentStatus === "tools",
        steps,
        forwardThinking,
        preopened,
        isTimedOut: () => timedOut,
        onNoAnswer: refund,
        onClose: () => clearTimeout(timeout),
        onCancel: () => upstreamAbort.abort(),
    });
    return new Response(output, {
        headers: {
            "Content-Type": wire === 2 ? WIRE_CONTENT_TYPE : "text/plain; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            "X-Content-Type-Options": "nosniff",
            "X-Accel-Buffering": "no",
            ...(wire === 2 ? { [WIRE_HEADER]: String(WIRE_VERSION) } : {}),
            ...meta,
        },
    });
}
