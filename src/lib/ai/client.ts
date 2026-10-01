/**
 * Browser client of Hanogt AI: streams answers from /api/ai (large language
 * model) and reports when the caller should fall back to the offline core.
 */
import type { AiContext, AiMode } from "./local-engine";

export type AiFailure = "auth_required" | "not_configured" | "rate_limited" | "daily_limit" | "network" | "timeout" | "upstream" | "aborted";

export interface AiTurn {
    role: "user" | "assistant";
    content: string;
}

export interface AiStreamResult {
    ok: boolean;
    text: string;
    failure?: AiFailure;
    retryAfterSeconds?: number;
    sources: Array<{ title: string; href: string }>;
    model?: string;
}

function parseSources(header: string | null) {
    if (!header) return [];
    try {
        const parsed = JSON.parse(decodeURIComponent(header)) as unknown;
        return Array.isArray(parsed)
            ? parsed.filter((item): item is { title: string; href: string } => Boolean(item && typeof item.title === "string" && typeof item.href === "string" && item.href.startsWith("/"))).slice(0, 4)
            : [];
    } catch {
        return [];
    }
}

export async function streamHanogtAI(options: {
    messages: AiTurn[];
    mode: AiMode;
    language: string;
    context?: AiContext | null;
    signal?: AbortSignal;
    onToken: (textSoFar: string) => void;
}): Promise<AiStreamResult> {
    let response: Response;
    try {
        response = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: options.messages,
                mode: options.mode,
                language: options.language,
                stream: true,
                context: options.context ? { ...options.context, code: options.context.code?.slice(0, 12_000) } : undefined,
            }),
            signal: options.signal,
        });
    } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        return { ok: false, text: "", failure: aborted ? "aborted" : "network", sources: [] };
    }

    if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { code?: string };
        const retryAfter = Number(response.headers.get("Retry-After")) || undefined;
        const code = payload.code;
        const failure: AiFailure = code === "auth_required" ? "auth_required"
            : code === "not_configured" ? "not_configured"
                : code === "daily_limit" ? "daily_limit"
                    : response.status === 429 ? "rate_limited"
                        : response.status === 504 || code === "timeout" ? "timeout"
                            : response.status === 401 ? "auth_required" : "upstream";
        return { ok: false, text: "", failure, retryAfterSeconds: retryAfter, sources: [] };
    }

    const sources = parseSources(response.headers.get("X-Hanogt-AI-Sources"));
    const model = decodeURIComponent(response.headers.get("X-Hanogt-AI-Model") || "") || undefined;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            options.onToken(text);
        }
        text += decoder.decode();
    } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        return { ok: text.length > 0, text, failure: aborted ? "aborted" : "network", sources, model };
    }
    if (!text.trim()) return { ok: false, text: "", failure: "upstream", sources, model };
    return { ok: true, text, sources, model };
}
