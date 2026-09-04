import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

type ClientMessage = { role?: unknown; text?: unknown };

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;

    const rate = await enforceRateLimit(`ai:${email}`, 12, 60_000);
    if (!rate.allowed) {
        return NextResponse.json({ error: "İstek sınırına ulaştınız. Biraz sonra tekrar deneyin." }, {
            status: 429,
            headers: jsonSecurityHeaders({ "Retry-After": String(rate.retryAfterSeconds) }),
        });
    }

    const body = await request.json() as { messages?: unknown };
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 20) {
        return NextResponse.json({ error: "Mesaj dizisi 1–20 öğe içermelidir." }, { status: 400 });
    }
    const messages = (body.messages as ClientMessage[]).map((message) => ({
        role: message.role === "ai" || message.role === "assistant" ? "assistant" : "user",
        content: typeof message.text === "string" ? message.text.trim().slice(0, 4_000) : "",
    })).filter((message) => message.content);
    if (!messages.length || messages.reduce((sum, message) => sum + message.content.length, 0) > 20_000) {
        return NextResponse.json({ error: "Mesaj içeriği geçersiz veya çok uzun." }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Yapay zekâ hizmeti yapılandırılmamış." }, { status: 503 });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: "Kodlama sorularına güvenli ve kısa yanıt veren bir asistansın. Gizli anahtar, kimlik bilgisi veya zararlı kod üretme; gerektiğinde güvenli alternatif sun. Kullanıcının dilinde yanıt ver.",
                }, ...messages],
                temperature: 0.4,
                max_tokens: 1024,
            }),
            signal: controller.signal,
            cache: "no-store",
        });
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        if (!response.ok) return NextResponse.json({ error: "Yapay zekâ hizmeti isteği tamamlayamadı." }, { status: 502 });
        return NextResponse.json({ message: data.choices?.[0]?.message?.content || "Yanıt alınamadı." }, {
            headers: jsonSecurityHeaders({ "X-RateLimit-Remaining": String(rate.remaining) }),
        });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error && error.name === "AbortError" ? "İstek zaman aşımına uğradı." : "Yapay zekâ hizmetine bağlanılamadı." }, { status: 503 });
    } finally {
        clearTimeout(timeout);
    }
}
