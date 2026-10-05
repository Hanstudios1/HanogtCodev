import "server-only";

import { reasoningOf, splitThinkingText } from "@/lib/ai/thinking";
import { PLAN_AI_FEATURES, type PlanId } from "@/lib/plans";
import { hanogtRequestBody, knowledgeNotes, providerConfig, systemPrompt, toolNotes } from "./hanogt-ai";

/*
 * Hanogt AI in Hanogt Social groups (/ai or @Hanogt AI): one short,
 * non-streamed answer from Hanogt AI's own model, with the group's latest
 * messages as data. Counting and giving back the person's allowance happen
 * where the question is handled (src/app/api/groups/_bots.ts).
 */

/** Group answers stay short: at most this many tokens (or the plan's own limit when lower). */
export const GROUP_AI_MAX_TOKENS = 1_200;
/** How many of the channel's latest messages go with the question. */
export const GROUP_AI_HISTORY = 12;
const ANSWER_MAX = 4_000;
const TIMEOUT_MS = 45_000;

export type GroupAiFailure = "not_configured" | "timeout" | "unreachable" | "upstream" | "empty";
export type GroupAiAnswer = { ok: true; text: string } | { ok: false; reason: GroupAiFailure };

type Completion = { choices?: Array<{ message?: { content?: string | null; reasoning_content?: unknown; reasoning?: unknown }; finish_reason?: unknown }> };

/** "Name: text" lines of the latest messages, oldest first, for the prompt. */
export function groupHistoryText(messages: ReadonlyArray<{ author: string; text: string }>) {
    return messages
        .map((message) => `${message.author.replace(/[\r\n:]+/g, " ").trim().slice(0, 40) || "?"}: ${message.text.replace(/\s+/g, " ").trim().slice(0, 400)}`)
        .filter((line) => !line.endsWith(": "))
        .join("\n");
}

export async function askGroupModel(input: { question: string; history: string; language: "TR" | "EN"; plan: PlanId; timeoutMs?: number }): Promise<GroupAiAnswer> {
    const config = providerConfig();
    if (!config) return { ok: false, reason: "not_configured" };
    const question = input.question.trim().slice(0, 2_000);
    const prompt = systemPrompt({
        language: input.language,
        mode: "general",
        knowledge: knowledgeNotes(question, input.language === "TR").notes,
        tools: toolNotes(question),
        audience: "group",
        groupHistory: input.history,
    });
    const fields = {
        model: config.model,
        messages: [{ role: "system", content: prompt }, { role: "user", content: question }],
        max_tokens: Math.min(PLAN_AI_FEATURES[input.plan].maxTokens, GROUP_AI_MAX_TOKENS),
        temperature: 0.45,
        stream: false,
    };
    const signal = AbortSignal.timeout(input.timeoutMs ?? TIMEOUT_MS);
    const send = (thinking: boolean | null) => fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        // No thinking in groups: the answer should come quickly.
        body: JSON.stringify(hanogtRequestBody(config.extraBody, fields, thinking)),
        signal,
        cache: "no-store",
    });
    let response: Response;
    try {
        response = await send(false);
        // A server that doesn't know chat_template_kwargs: once more without it.
        if (response.status === 400) {
            await response.body?.cancel().catch(() => undefined);
            response = await send(null);
        }
    } catch (error) {
        return { ok: false, reason: error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "unreachable" };
    }
    if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        console.warn(`[groups/ai] provider status ${response.status}`);
        return { ok: false, reason: "upstream" };
    }
    const data = await response.json().catch(() => null) as Completion | null;
    const choice = data?.choices?.[0];
    const { text } = splitThinkingText(choice?.message?.content ?? "", reasoningOf(choice?.message), { complete: choice?.finish_reason !== "length" });
    const answer = text.trim().slice(0, ANSWER_MAX);
    return answer ? { ok: true, text: answer } : { ok: false, reason: "empty" };
}
