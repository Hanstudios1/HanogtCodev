import { after, type NextRequest } from "next/server";
import { wantsThinking } from "@/lib/ai/thinking";
import { touchApiKey } from "@/lib/server/ai-api-keys";
import { refundHanogtAi, type QuotaPass } from "@/lib/server/ai-usage";
import { hanogtRequestBody, knowledgeNotes, providerConfig, systemPrompt, toolNotes } from "@/lib/server/hanogt-ai";
import { completionBody, completionStream, countApiRequest, newCompletionId, parseCompletionRequest } from "@/lib/server/hanogt-ai-api";
import { PLAN_AI_FEATURES } from "@/lib/plans";
import { readJsonBody } from "@/lib/server/validate";
import { API_HEADERS, apiError, apiJson, callerOf, unavailable } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Room for 100,000 characters of messages (up to four bytes each in UTF-8) and the JSON around them. */
const BODY_MAX_BYTES = 600_000;

/** A Paddle check that outlives the request keeps running after the answer. */
function keepRunning(work: Promise<unknown>) {
    after(() => work.then(() => undefined, () => undefined));
}

/**
 * POST /api/v1/chat/completions: OpenAI's chat completions for the model
 * "hanogt-ai", with an hnk_ key (docs/HANOGT_AI_API.md). The request is
 * checked before it is counted (one Hanogt AI message, in the same window as
 * the chat) and given back when the model answers nothing. Hanogt AI's rules
 * come first in the prompt and the developer's system text follows them as
 * data. With include_reasoning the model thinks first and its thinking comes
 * back as reasoning_content.
 */
export async function POST(request: NextRequest) {
    const { caller, refusal } = await callerOf(request);
    if (!caller) return refusal;
    if (Number(request.headers.get("content-length") || 0) > BODY_MAX_BYTES) {
        return apiError({ status: 413, code: "context_length_exceeded", message: "The request body is too large.", param: "messages" });
    }
    const parsed = parseCompletionRequest(await readJsonBody(request, BODY_MAX_BYTES), caller.plan);
    if (!parsed.ok) return apiError(parsed.failure);
    const config = providerConfig();
    if (!config) return unavailable("Hanogt AI isn't configured on this server.");

    let rate: Record<string, string>;
    let pass: QuotaPass;
    try {
        const counted = await countApiRequest(caller, { onLate: keepRunning });
        if (!counted.ok) return apiError(counted.failure);
        rate = counted.headers;
        pass = counted.pass;
    } catch (error) {
        console.error("[hanogt-ai-api:count]", error instanceof Error ? error.message : error);
        return unavailable();
    }
    after(() => touchApiKey(caller.key).then(() => undefined, () => undefined));

    const input = parsed.request;
    const latest = input.messages[input.messages.length - 1].content;
    const { notes } = knowledgeNotes(latest, input.language === "TR");
    const prompt = systemPrompt({ audience: "api", language: input.language, mode: input.mode, knowledge: notes, tools: toolNotes(latest), developer: input.system || null });

    // The model thinks when the developer asks for its reasoning, or as the chat would ("auto").
    const thinking = input.includeReasoning || wantsThinking("auto", { mode: input.mode, message: latest });
    const preopened = (process.env.HANOGT_AI_THINKING || "").trim().toLowerCase() === "preopened";
    const features = PLAN_AI_FEATURES[caller.plan];
    const upstreamAbort = new AbortController();
    const timeout = setTimeout(() => upstreamAbort.abort(), 55_000);
    request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true });
    const send = (withThinking: boolean) => fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(hanogtRequestBody(config.extraBody, {
            model: config.model,
            messages: [{ role: "system", content: prompt }, ...input.messages],
            temperature: input.temperature ?? (thinking ? 0.6 : input.mode === "code" ? 0.25 : 0.45),
            // Thinking gets its own budget on top of the answer's.
            max_tokens: input.maxTokens + (thinking ? features.thinkingTokens : 0),
            stream: input.stream,
            ...(input.topP !== null ? { top_p: input.topP } : thinking ? { top_p: 0.95 } : {}),
            ...(input.stop ? { stop: input.stop } : {}),
        }, withThinking ? thinking : null)),
        signal: upstreamAbort.signal,
        cache: "no-store",
    });
    const giveBack = () => refundHanogtAi(pass);
    let upstream: Response;
    try {
        upstream = await send(true);
        // A server that doesn't know chat_template_kwargs: once more without it.
        if (upstream.status === 400) {
            await upstream.body?.cancel().catch(() => undefined);
            upstream = await send(false);
        }
    } catch (error) {
        clearTimeout(timeout);
        const aborted = error instanceof Error && error.name === "AbortError";
        await giveBack();
        return apiError({ status: 503, code: "service_unavailable", message: aborted ? "The model took too long to answer." : "The model couldn't be reached. Try again in a moment." }, rate);
    }

    if (!upstream.ok || !upstream.body) {
        clearTimeout(timeout);
        // Never pass the provider's error on (it can echo request details).
        await upstream.body?.cancel().catch(() => undefined);
        console.warn(`[hanogt-ai-api] provider status ${upstream.status}`);
        await giveBack();
        if (upstream.status === 429) return apiError({ status: 429, code: "rate_limit_exceeded", message: "Hanogt AI is busy right now. Try again in a moment.", headers: { "Retry-After": "5" } }, rate);
        return apiError({ status: 424, code: "upstream_error", message: "The model couldn't complete the request." }, rate);
    }

    const meta = { id: newCompletionId(), created: Math.floor(Date.now() / 1000) };
    if (!input.stream) {
        const data = await upstream.json().catch(() => null);
        clearTimeout(timeout);
        const completion = completionBody(data, meta, { includeReasoning: input.includeReasoning, preopened });
        if (!completion) {
            await giveBack();
            return apiError({ status: 424, code: "upstream_error", message: "The model sent an empty answer. Try again." }, rate);
        }
        return apiJson(completion, 200, rate);
    }
    const stream = completionStream(upstream.body, meta, {
        includeReasoning: input.includeReasoning,
        preopened,
        onEnd: async ({ answered }) => {
            clearTimeout(timeout);
            if (!answered) await giveBack();
        },
        onCancel: () => {
            upstreamAbort.abort();
            clearTimeout(timeout);
        },
    });
    return new Response(stream, {
        headers: { ...API_HEADERS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", ...rate },
    });
}
