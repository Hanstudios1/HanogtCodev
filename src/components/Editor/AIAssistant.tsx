"use client";

import { useState } from "react";
import { Bot, X, Send, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Message = { role: "user" | "ai"; text: string };

export default function AIAssistant() {
    const { tx } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    // The greeting is rendered separately so it follows the active language and isn't sent to the API.
    const [messages, setMessages] = useState<Message[]>([]);
    const greeting = tx({ TR: "Merhaba! Ben AI Asistan. Kodlama sorularında sana yardımcı olabilirim. Ne sormak istersin?", EN: "Hi! I'm the AI Assistant. I can help with your coding questions. What would you like to ask?" });
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { role: "user", text: input };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        try {
            const response = await fetch("/api/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: newMessages }),
            });

            const data = await response.json();

            if (data.error) {
                setMessages(prev => [...prev, { role: "ai", text: `${tx({ TR: "Hata", EN: "Error" })}: ${data.error}` }]);
            } else {
                setMessages(prev => [...prev, { role: "ai", text: data.message }]);
            }
        } catch {
            setMessages(prev => [...prev, { role: "ai", text: tx({ TR: "Bağlantı hatası oluştu. Lütfen tekrar deneyin.", EN: "A connection error occurred. Please try again." }) }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 p-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full shadow-2xl transition-all hover:scale-110 z-50 flex items-center gap-2 group"
                >
                    <Bot className="w-6 h-6" />
                    <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-bold whitespace-nowrap">
                        {tx({ TR: "AI Asistan", EN: "AI Assistant" })}
                    </span>
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 flex flex-col z-50 overflow-hidden">

                    {/* Header */}
                    <div className="flex justify-between items-center p-4 border-b border-zinc-200 dark:border-zinc-700 bg-gradient-to-r from-blue-600 to-purple-600">
                        <h3 className="font-bold flex items-center gap-2 text-white">
                            <Bot className="w-5 h-5" />
                            {tx({ TR: "AI Asistan", EN: "AI Assistant" })}
                        </h3>
                        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-lg text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div className="flex justify-start">
                            <div className="max-w-[80%] px-4 py-2 rounded-2xl rounded-bl-sm text-sm whitespace-pre-wrap bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                                {greeting}
                            </div>
                        </div>
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap ${msg.role === "user"
                                        ? "bg-blue-600 text-white rounded-br-sm"
                                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm"
                                        }`}
                                >
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-2xl rounded-bl-sm flex items-center gap-2 text-zinc-500">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {tx({ TR: "Düşünüyorum...", EN: "Thinking..." })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                placeholder={tx({ TR: "Bir soru sor...", EN: "Ask a question..." })}
                                className="flex-1 px-4 py-2 rounded-2xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                disabled={isLoading}
                            />
                            <button
                                onClick={handleSend}
                                disabled={isLoading}
                                className="p-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 text-white rounded-full transition-all"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
