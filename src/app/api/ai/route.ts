import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const { messages } = await req.json();

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: "Sen bir kodlama uzmanısın. Kullanıcıların kod sorularına yardımcı ol, hataları düzelt ve kod önerileri sun. Yanıtlarını Türkçe ver. Kısa ve öz cevaplar ver. Kod örnekleri verirken açıklamalar ekle.",
                    },
                    ...messages.map((m: any) => ({
                        role: m.role === "ai" ? "assistant" : "user",
                        content: m.text,
                    })),
                ],
                temperature: 0.7,
                max_tokens: 1024,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Groq API Error:", data);
            return NextResponse.json({
                error: `API Hatası: ${data.error?.message || JSON.stringify(data)}`
            }, { status: response.status });
        }

        const aiMessage = data.choices?.[0]?.message?.content || "Yanıt alınamadı.";

        return NextResponse.json({ message: aiMessage });
    } catch (error: any) {
        console.error("AI Error:", error);
        return NextResponse.json({ error: `Bağlantı hatası: ${error.message}` }, { status: 500 });
    }
}
