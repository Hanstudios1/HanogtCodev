import { NextRequest, NextResponse } from "next/server";

const AGENT_SYSTEM_PROMPT = `Sen bir AI kodlama asistanısın. Kullanıcının isteklerine göre kod düzenlemeleri yapabilirsin.

YANIT FORMATI: Her zaman aşağıdaki JSON formatında yanıt ver:

{
  "action": "EDIT_CODE" | "CREATE_TAB" | "DELETE_TAB" | "RENAME_TAB" | "EXPLAIN",
  "explanation": "Ne yaptığını açıkla (Türkçe)",
  "tabName": "Sekme adı (CREATE_TAB için)",
  "tabLang": "Dil (CREATE_TAB için: python, javascript, typescript, etc.)",
  "code": "Yeni veya düzenlenmiş kod",
  "newName": "Yeni isim (RENAME_TAB için)"
}

KURALLAR:
- Sadece JSON döndür, başka hiçbir şey yazma
- EDIT_CODE: Mevcut kodu düzenle
- CREATE_TAB: Yeni sekme oluştur
- DELETE_TAB: Sekme sil
- RENAME_TAB: Sekme adını değiştir
- EXPLAIN: Sadece açıklama yap (code alanı boş olabilir)
- Açıklamaları Türkçe yaz
- Kod temiz ve çalışır olsun`;

export async function POST(req: NextRequest) {
    const { messages, context } = await req.json();

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    // Build context message
    let contextMessage = "";
    if (context?.code) {
        contextMessage = `\n\nAKTİF SEKME KODU (${context.lang || "unknown"}):\n\`\`\`${context.lang || ""}\n${context.code}\n\`\`\``;
    }
    if (context?.tabName) {
        contextMessage += `\nAKTİF SEKME ADI: ${context.tabName}`;
    }

    // Add all tabs context
    if (context?.allTabs && Array.isArray(context.allTabs)) {
        contextMessage += `\n\nTÜM SEKMELER (${context.allTabs.length} adet):`;
        context.allTabs.forEach((tab: any, i: number) => {
            contextMessage += `\n--- ${i + 1}. ${tab.name} (${tab.lang}) ---\n${tab.code.substring(0, 500)}${tab.code.length > 500 ? "..." : ""}`;
        });
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
                        content: AGENT_SYSTEM_PROMPT,
                    },
                    ...messages.map((m: any, i: number) => {
                        let content = m.text;
                        // Add context to the last user message
                        if (m.role === "user" && i === messages.length - 1 && contextMessage) {
                            content += contextMessage;
                        }
                        return {
                            role: m.role === "ai" ? "assistant" : "user",
                            content,
                        };
                    }),
                ],
                temperature: 0.3,
                max_tokens: 4096,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Groq API Error:", data);
            return NextResponse.json({
                error: `API Hatası: ${data.error?.message || JSON.stringify(data)}`
            }, { status: response.status });
        }

        const aiMessage = data.choices?.[0]?.message?.content || "";

        // Try to parse as JSON action
        try {
            // Clean the response - remove markdown code blocks if present
            let cleanedMessage = aiMessage.trim();
            if (cleanedMessage.startsWith("```json")) {
                cleanedMessage = cleanedMessage.slice(7);
            } else if (cleanedMessage.startsWith("```")) {
                cleanedMessage = cleanedMessage.slice(3);
            }
            if (cleanedMessage.endsWith("```")) {
                cleanedMessage = cleanedMessage.slice(0, -3);
            }
            cleanedMessage = cleanedMessage.trim();

            const actionData = JSON.parse(cleanedMessage);
            return NextResponse.json({
                type: "action",
                action: actionData
            });
        } catch {
            // If not valid JSON, return as plain message
            return NextResponse.json({
                type: "message",
                message: aiMessage
            });
        }
    } catch (error: any) {
        console.error("AI Error:", error);
        return NextResponse.json({ error: `Bağlantı hatası: ${error.message}` }, { status: 500 });
    }
}
