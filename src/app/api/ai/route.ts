import { after, NextRequest, NextResponse } from "next/server";
import { encodeAgentTrailer, normalizeChatMessages, splitAgentStream, stripTrailerMark, type AgentTrailerCall, type WireMessage } from "@/lib/ai/agent-protocol";
import { AGENT_CALL_ID_PATTERN, AGENT_MAX_CALLS, agentToolSchemas, detectSensitiveRequest, isHowToQuestion, sanitizeAgentCall } from "@/lib/ai/agent-tools";
import { normalizeAiSettings } from "@/lib/ai/ai-settings";
import { DEFAULT_CONNECTION, isConnectionId, ownKeyRequestParams, type AiConnectionError } from "@/lib/ai/connections";
import { ENGINE_HEADERS, engineWindowHeaders, wantsAdvancedEngine, type AiEngineNote } from "@/lib/ai/engine";
import type { DayQuota, UsageWindow } from "@/lib/ai/usage";
import { PLAN_AI_FEATURES, type PlanId } from "@/lib/plans";
import { getActiveSession } from "@/lib/server/active-session";
import { classifyProviderFailure, markUsed, resolveConnectionForChat, shouldRecordUse, type ResolvedConnection } from "@/lib/server/ai-connections";
import { claudeConfig, getEngineSettings } from "@/lib/server/ai-engine";
import { enforceEngineQuota, enforceHanogtAi, enforceOwnKeys, quotaHeaders, refusalDetails, type QuotaRefusal } from "@/lib/server/ai-usage";
import { claudeClient, claudeMaxTokens, openClaudeStream, type ClaudeEvent } from "@/lib/server/claude-engine";
import { clip, knowledgeNotes, providerConfig, systemPrompt, systemPromptParts, toolNotes, type AgentStatus, type AiAnswerMode, type PromptOptions } from "@/lib/server/hanogt-ai";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOOL_ARGUMENT_CHARS = 120_000;

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

type ToolCallDelta = { index?: number; id?: string; function?: { name?: string; arguments?: string } };
type CallAccumulator = Map<number, { id: string; name: string; args: string }>;

function collectToolCalls(target: CallAccumulator, parts: ToolCallDelta[] | undefined) {
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

/** Said when the advanced engine (and its fallback) declined: in the answer's language, Turkish or English. */
const REFUSAL_NOTES = {
    TR: { empty: "Gelişmiş kod motoru bu isteğe güvenlik kuralları nedeniyle yanıt vermedi. İsteği farklı biçimde sorabilir ya da ne yapmak istediğini biraz daha anlatabilirsin.", cut: "\n\n_(Gelişmiş kod motoru yanıtı güvenlik kuralları nedeniyle burada kesti.)_" },
    EN: { empty: "The advanced code engine declined this request for safety reasons. You can ask in a different way or say a little more about what you're trying to do.", cut: "\n\n_(The advanced code engine stopped this answer here for safety reasons.)_" },
};

/** The advanced engine's answer in the chat's format: text, then the agent trailer when it asked for tools. */
function advancedOutput(events: AsyncGenerator<ClaudeEvent>, options: { tools: boolean; language: string; onDone: () => void; onCancel: () => void }) {
    const encoder = new TextEncoder();
    const notes = options.language === "TR" ? REFUSAL_NOTES.TR : REFUSAL_NOTES.EN;
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            const calls: CallAccumulator = new Map();
            let wrote = false;
            try {
                for await (const event of events) {
                    if (event.type === "text") {
                        const text = stripTrailerMark(event.text);
                        if (text) {
                            controller.enqueue(encoder.encode(text));
                            wrote = true;
                        }
                    } else if (event.type === "tool") {
                        if (options.tools && calls.size < AGENT_MAX_CALLS) calls.set(calls.size, { id: event.id, name: event.name, args: event.args });
                    } else if (event.stopReason === "refusal") {
                        controller.enqueue(encoder.encode(wrote ? notes.cut : notes.empty));
                    }
                }
                const toolCalls = trailerCalls(calls);
                if (toolCalls.length) controller.enqueue(encoder.encode(encodeAgentTrailer({ toolCalls })));
                controller.close();
            } catch (error) {
                console.warn("[hanogt-ai] advanced engine stream failed:", error instanceof Error ? error.name : "error");
                if (wrote) controller.close();
                else controller.error(error);
            } finally {
                options.onDone();
            }
        },
        cancel() {
            options.onCancel();
        },
    });
}

/** Validates the model's calls against the registry before the browser sees them. */
function trailerCalls(calls: CallAccumulator): AgentTrailerCall[] {
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

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return errorResponse(403, "forbidden_origin", "Geçersiz istek kaynağı.");
    const activeSession = await getActiveSession();
    if (!activeSession) return errorResponse(401, "auth_required", "Hanogt AI'ın büyük dil modeli için giriş yapın.");
    const { email } = activeSession;

    const body = await readJsonBody(request, 300_000);
    if (!body) return errorResponse(400, "bad_request", "Geçersiz istek gövdesi.");
    // The person's own provider connection (Plus/Pro); absent or empty means Hanogt AI's model.
    const connectionId = body.connectionId === undefined || body.connectionId === null || body.connectionId === "" ? null : body.connectionId;
    if (connectionId !== null && !isConnectionId(connectionId)) return errorResponse(400, "bad_request", "Geçersiz bağlantı.");

    // The request is checked before anything is counted: a malformed one never uses up a message.
    const agentRequested = body.agent === true;
    const messages = normalizeChatMessages(body.messages, { tools: agentRequested });
    if (!messages) return errorResponse(400, "bad_request", "Mesajlar geçersiz.");
    const mode: AiAnswerMode = body.mode === "code" || body.mode === "security" ? body.mode : "general";
    const language = typeof body.language === "string" && /^[A-Z]{2}$/.test(body.language) ? body.language : "TR";
    const stream = body.stream !== false;
    // The browser sets agentFinal on the last allowed tool round so the model answers in text.
    const toolChoice = body.agentFinal === true ? "none" : "auto";
    const context = body.context && typeof body.context === "object" ? body.context as Record<string, unknown> : {};
    const path = typeof context.path === "string" && /^\/[\w\-/#?=&.%]{0,200}$/.test(context.path) ? context.path : "";
    // The open file is clipped to the plan's length once the plan is known (Free 12,000, Plus 24,000, Pro 40,000 characters).
    const contextCode = typeof context.code === "string" ? context.code.replace(/\0/g, "") : "";
    const fileName = typeof context.fileName === "string" ? context.fileName.replace(/[^\w.\- ]/g, "").slice(0, 80) || "main" : "main";
    const fileLanguage = typeof context.language === "string" ? context.language.replace(/[^\w#+-]/g, "").slice(0, 20) : "text";

    let target: { apiKey: string; baseUrl: string; model: string; connection: ResolvedConnection | null; extraBody: Record<string, unknown> };
    // The day window this message was counted in; every answer reports it (X-Hanogt-AI-*) for the usage meter.
    let quota: DayQuota;
    // The plan the message was counted under: it sets the answer's length and how much of the file is read.
    let plan: PlanId;
    if (connectionId) {
        // Own keys have their own allowance and never use the Hanogt AI daily quota.
        const counted = await enforceOwnKeys(email, { onLate: keepRunning });
        if (!counted.ok) {
            if (counted.code === "connection_unavailable") return errorResponse(409, "connection_unavailable", "Bu bağlantı kullanılamıyor: silinmiş olabilir ya da planınız kapsamıyor olabilir.");
            return limitResponse(counted, "Kendi bağlantılarınızla istek sınırına ulaştınız. Biraz sonra tekrar deneyin.");
        }
        quota = counted.quota;
        plan = counted.plan;
        let connection: ResolvedConnection | null;
        try {
            connection = await resolveConnectionForChat(email, connectionId, plan);
        } catch {
            return errorResponse(503, "unavailable", "Bağlantı bilgileri şu anda okunamadı. Biraz sonra tekrar deneyin.", quotaHeaders(quota));
        }
        if (!connection) return errorResponse(409, "connection_unavailable", "Bu bağlantı kullanılamıyor: silinmiş olabilir ya da planınız kapsamıyor olabilir.", quotaHeaders(quota));
        target = { apiKey: connection.apiKey, baseUrl: connection.baseUrl, model: connection.model, connection, extraBody: {} };
    } else {
        const config = providerConfig();
        if (!config) return errorResponse(503, "not_configured", "Hanogt AI dil modeli bu sunucuda yapılandırılmamış.");
        // Plans, staff grants and a purchase Paddle hasn't reported yet (asked before refusing) set the limits.
        const counted = await enforceHanogtAi(email, { onLate: keepRunning });
        if (!counted.ok) return limitResponse(counted, "Hanogt AI istek sınırına ulaştınız. Biraz sonra tekrar deneyin.");
        quota = counted.quota;
        plan = counted.plan;
        target = { ...config, connection: null };
    }
    const features = PLAN_AI_FEATURES[plan];
    // The person's Hanogt AI settings, from the user document the session check has read (cut to the plan).
    const settings = normalizeAiSettings(activeSession.user.aiSettings, plan);
    const answerLanguage = settings.language === "site" ? language : settings.language;
    const personal = { about: settings.about, style: settings.style, tone: settings.tone, length: settings.length };
    const fileCode = contextCode ? clip(contextCode, features.contextChars) : "";
    const file = fileCode.trim() ? { name: fileName, language: fileLanguage, code: fileCode } : null;
    const counted = quotaHeaders(quota);
    const ownConnection = target.connection;
    /** Notes the outcome on the connection after the response (best effort, at most once a minute per outcome). */
    const recordUse = (error: AiConnectionError | null) => {
        if (ownConnection && shouldRecordUse(ownConnection, error)) after(() => markUsed(email, ownConnection.id, error));
    };

    // Follow-up rounds end with tool results; knowledge and analyzers use the user's own words.
    const userTurns = messages.filter((turn): turn is Extract<WireMessage, { role: "user" }> => turn.role === "user");
    const latest = userTurns[userTurns.length - 1]?.content ?? "";
    const previousUser = userTurns[userTurns.length - 2]?.content ?? "";
    const { notes, sources } = knowledgeNotes(`${latest} ${previousUser.slice(0, 300)}`, answerLanguage === "TR");
    const sensitiveRequest = detectSensitiveRequest(latest);
    const sensitive = sensitiveRequest && !isHowToQuestion(latest) ? sensitiveRequest : null;
    const analyses = toolNotes(latest);
    const promptOptions = (agent: AgentStatus | "requested"): PromptOptions => ({ language: answerLanguage, mode, path, knowledge: notes, tools: analyses, file, agent, sensitive, personal, personalMax: features.instructionsChars });
    const promptFor = (agent: AgentStatus | "requested") => systemPrompt(promptOptions(agent));

    const upstreamAbort = new AbortController();
    const timeout = setTimeout(() => upstreamAbort.abort(), 55_000);
    request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true });

    // The advanced code engine (Claude): Hanogt AI's own model only (never an own connection), for code work,
    // within the plan's daily allowance. If it can't be used, the standard engine answers and says why.
    let engineNote: AiEngineNote | null = null;
    const claude = ownConnection ? null : claudeConfig();
    const engine = claude ? await getEngineSettings().catch(() => null) : null;
    if (claude && engine?.enabled && wantsAdvancedEngine({ scope: engine.scope, mode, hasFile: Boolean(file), message: latest })) {
        const allowance = await enforceEngineQuota(email, engine.daily[plan]).catch(() => null);
        if (allowance?.ok) {
            const opened = await openClaudeStream(claudeClient(claude), {
                model: engine.model,
                effort: engine.effort,
                system: systemPromptParts(promptOptions(agentRequested ? "requested" : "off")),
                messages,
                tools: agentRequested ? agentToolSchemas() : null,
                toolChoice,
                maxTokens: claudeMaxTokens(features.maxTokens),
            }, upstreamAbort.signal);
            if (opened.ok) return advancedResponse(opened.model, opened.events, allowance.window);
            console.warn(`[hanogt-ai] advanced engine refused the request (${opened.status} ${opened.reason}); the standard engine answers`);
            engineNote = "unavailable";
        } else {
            engineNote = allowance ? "quota" : "unavailable";
        }
    }

    function advancedResponse(model: string, events: AsyncGenerator<ClaudeEvent>, window: UsageWindow) {
        const headers: Record<string, string> = {
            "X-Hanogt-AI-Model": encodeURIComponent(model),
            "X-Hanogt-AI-Sources": encodeURIComponent(JSON.stringify(sources)),
            "X-Hanogt-AI-Agent": agentRequested ? "tools" : "off",
            "X-Hanogt-AI-Connection": DEFAULT_CONNECTION,
            [ENGINE_HEADERS.engine]: "advanced",
            ...engineWindowHeaders(window),
            ...counted,
        };
        const output = advancedOutput(events, {
            tools: agentRequested,
            language: answerLanguage,
            onDone: () => clearTimeout(timeout),
            onCancel: () => {
                upstreamAbort.abort();
                clearTimeout(timeout);
            },
        });
        if (stream) {
            return new Response(output, {
                headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff", "X-Accel-Buffering": "no", ...headers },
            });
        }
        // Without streaming: the same answer collected (the trailer split off again).
        return new Response(output).text().then((raw) => {
            const { text, trailer } = splitAgentStream(raw);
            const message = text.trim();
            const toolCalls: AgentTrailerCall[] = trailer?.toolCalls ?? [];
            if (!message && !toolCalls.length) return errorResponse(424, "upstream_error", "Dil modeli boş yanıt verdi.", counted);
            return NextResponse.json({ message, toolCalls, sources, model, connection: DEFAULT_CONNECTION, agent: agentRequested ? "tools" : "off", engine: "advanced" }, { headers: jsonSecurityHeaders(headers) });
        }, () => errorResponse(424, "upstream_error", "Dil modeli isteği tamamlayamadı.", counted));
    }

    const temperature = agentRequested ? 0.3 : mode === "code" ? 0.25 : 0.45;
    // Hanogt AI's own model answers at most the plan's length (Free 1,800, Plus 3,000, Pro 4,000 tokens); own keys are the person's own.
    const sampling = ownConnection ? ownKeyRequestParams(ownConnection.provider, target.model, temperature) : { temperature, max_tokens: features.maxTokens };
    const send = (payload: Record<string, unknown>) => fetch(`${target.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.apiKey}` },
        body: JSON.stringify({
            // Options for a self-hosted model (HANOGT_AI_EXTRA_BODY) first: the request's own fields win.
            ...target.extraBody,
            model: target.model,
            ...sampling,
            stream,
            ...payload,
        }),
        signal: upstreamAbort.signal,
        cache: "no-store",
        // Own keys only go to the provider's fixed address, never where a redirect points.
        ...(ownConnection ? { redirect: "error" as const } : {}),
    });

    let agentStatus: AgentStatus = agentRequested ? "tools" : "off";
    let upstream: Response;
    try {
        upstream = await send(agentRequested
            ? { messages: [{ role: "system", content: promptFor("requested") }, ...messages], tools: agentToolSchemas(), tool_choice: toolChoice }
            : { messages: [{ role: "system", content: promptFor("off") }, ...messages] });
        if (agentRequested && upstream.status === 400) {
            // The provider or model rejected function calling (or produced a malformed call):
            // answer without tools; the browser maps the request to an action with Hanogt AI Core.
            await upstream.body?.cancel().catch(() => undefined);
            const plain = normalizeChatMessages(body.messages, { tools: false });
            if (plain) {
                agentStatus = "unsupported";
                upstream = await send({ messages: [{ role: "system", content: promptFor("off") }, ...plain] });
            }
        }
    } catch (error) {
        clearTimeout(timeout);
        const aborted = error instanceof Error && error.name === "AbortError";
        // A stop in the browser is not the connection's fault.
        if (!request.signal.aborted) recordUse("unreachable");
        return errorResponse(503, aborted ? "timeout" : "upstream_unreachable", aborted ? "Yanıt zaman aşımına uğradı." : "Dil modeli hizmetine bağlanılamadı.", counted);
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
            return errorResponse(reply.status, reply.code, reply.error, { ...counted, ...(failure === "rate_limited" ? retryAfterOf(upstream) : {}) });
        }
        await upstream.body?.cancel().catch(() => undefined);
        const code = upstream.status === 429 ? "upstream_rate_limited" : upstream.status === 401 || upstream.status === 403 ? "not_configured" : "upstream_error";
        return errorResponse(upstream.status === 429 ? 429 : 424, code, "Dil modeli isteği tamamlayamadı.", counted);
    }
    recordUse(null);

    const meta: Record<string, string> = {
        "X-Hanogt-AI-Model": encodeURIComponent(target.model),
        "X-Hanogt-AI-Sources": encodeURIComponent(JSON.stringify(sources)),
        "X-Hanogt-AI-Agent": agentStatus,
        // Which connection answered: its id, or "hanogt" for Hanogt AI's own model.
        "X-Hanogt-AI-Connection": ownConnection ? ownConnection.id : DEFAULT_CONNECTION,
        ...(ownConnection ? { "X-Hanogt-AI-Provider": ownConnection.provider } : {}),
        // The standard engine answered; the note says why when the advanced one was wanted.
        [ENGINE_HEADERS.engine]: "standard",
        ...(engineNote ? { [ENGINE_HEADERS.note]: engineNote } : {}),
        // The day window this message counted in (usage meter); see src/lib/ai/usage.ts.
        ...counted,
    };

    if (!stream) {
        clearTimeout(timeout);
        type Completion = { choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<ToolCallDelta & { function?: { name?: string; arguments?: string } }> } }> };
        const data = await upstream.json().catch(() => null) as Completion | null;
        const choice = data?.choices?.[0]?.message;
        const message = stripTrailerMark(choice?.content?.trim() ?? "");
        const calls: CallAccumulator = new Map();
        if (agentStatus === "tools") collectToolCalls(calls, choice?.tool_calls?.map((call, index) => ({ ...call, index })));
        const toolCalls = trailerCalls(calls);
        if (!message && !toolCalls.length) return errorResponse(424, "upstream_error", "Dil modeli boş yanıt verdi.", counted);
        return NextResponse.json({ message, toolCalls, sources, model: target.model, connection: ownConnection ? ownConnection.id : DEFAULT_CONNECTION, agent: agentStatus }, { headers: jsonSecurityHeaders(meta) });
    }

    // Server-sent events from the provider → plain UTF-8 text chunks for the browser,
    // plus the agent trailer when the model asked for tools.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const calls: CallAccumulator = new Map();
    const output = new ReadableStream<Uint8Array>({
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
                            const chunk = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string | null; tool_calls?: ToolCallDelta[] } }> };
                            const delta = chunk.choices?.[0]?.delta;
                            const text = delta?.content;
                            if (text) controller.enqueue(encoder.encode(stripTrailerMark(text)));
                            if (agentStatus === "tools") collectToolCalls(calls, delta?.tool_calls);
                        } catch {
                            // Keep-alive comments and partial frames are skipped.
                        }
                    }
                }
                const toolCalls = trailerCalls(calls);
                if (toolCalls.length) controller.enqueue(encoder.encode(encodeAgentTrailer({ toolCalls })));
                controller.close();
            } catch (error) {
                if (!(error instanceof Error && error.name === "AbortError")) controller.error(error);
                else controller.close();
            } finally {
                clearTimeout(timeout);
            }
        },
        cancel() {
            upstreamAbort.abort();
            clearTimeout(timeout);
        },
    });

    return new Response(output, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            "X-Content-Type-Options": "nosniff",
            "X-Accel-Buffering": "no",
            ...meta,
        },
    });
}
