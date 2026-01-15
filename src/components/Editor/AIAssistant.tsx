"use client";

import { useState } from "react";
import { Bot, X, Send, Loader2, Check, XCircle, Plus, Trash2, Pencil, Code, Undo2 } from "lucide-react";

type Message = {
    role: "user" | "ai";
    text: string;
    action?: AIAction;
    actions?: AIAction[];  // Multi-action support
    status?: "pending" | "approved" | "rejected";
    previousCode?: string;  // For undo
};

type AIAction = {
    action: "EDIT_CODE" | "CREATE_TAB" | "DELETE_TAB" | "RENAME_TAB" | "EXPLAIN";
    explanation: string;
    code?: string;
    tabName?: string;
    tabLang?: string;
    newName?: string;
};

type TabInfo = {
    id: string;
    name: string;
    lang: string;
    code: string;
};

interface AIAssistantProps {
    currentCode: string;
    currentLang: string;
    currentTabName: string;
    allTabs: TabInfo[];  // All tabs context
    onApplyAction: (action: AIAction) => void;
    onUndoAction: (previousCode: string) => void;  // Undo support
}

export default function AIAssistant({
    currentCode,
    currentLang,
    currentTabName,
    allTabs,
    onApplyAction,
    onUndoAction
}: AIAssistantProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: "ai", text: "Merhaba! Ben AI Agent. Kodlarını düzenleyebilir, yeni sekmeler oluşturabilir ve daha fazlasını yapabilirim. Ne yapmamı istersin?" },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showDiff, setShowDiff] = useState<number | null>(null);

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
                body: JSON.stringify({
                    messages: newMessages.filter(m => !m.action || m.status !== "rejected"),
                    context: {
                        code: currentCode,
                        lang: currentLang,
                        tabName: currentTabName,
                        allTabs: allTabs.map(t => ({
                            name: t.name,
                            lang: t.lang,
                            code: t.code.substring(0, 2000)  // Limit to prevent token overflow
                        }))
                    }
                }),
            });

            const data = await response.json();

            if (data.error) {
                setMessages(prev => [...prev, { role: "ai", text: `Hata: ${data.error}` }]);
            } else if (data.type === "action") {
                setMessages(prev => [...prev, {
                    role: "ai",
                    text: data.action.explanation,
                    action: data.action,
                    status: "pending",
                    previousCode: currentCode  // Store for undo
                }]);
            } else {
                setMessages(prev => [...prev, { role: "ai", text: data.message }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: "ai", text: "Bağlantı hatası oluştu. Lütfen tekrar deneyin." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApprove = (index: number) => {
        const message = messages[index];
        if (message.action) {
            onApplyAction(message.action);
            setMessages(prev => prev.map((m, i) =>
                i === index ? { ...m, status: "approved" as const } : m
            ));
        }
    };

    const handleReject = (index: number) => {
        setMessages(prev => prev.map((m, i) =>
            i === index ? { ...m, status: "rejected" as const } : m
        ));
    };

    const handleUndo = (index: number) => {
        const message = messages[index];
        if (message.previousCode && message.status === "approved") {
            onUndoAction(message.previousCode);
            setMessages(prev => prev.map((m, i) =>
                i === index ? { ...m, status: "rejected" as const } : m
            ));
        }
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case "EDIT_CODE": return <Code className="w-4 h-4" />;
            case "CREATE_TAB": return <Plus className="w-4 h-4" />;
            case "DELETE_TAB": return <Trash2 className="w-4 h-4" />;
            case "RENAME_TAB": return <Pencil className="w-4 h-4" />;
            default: return <Bot className="w-4 h-4" />;
        }
    };

    const getActionLabel = (action: string) => {
        switch (action) {
            case "EDIT_CODE": return "Kod Düzenle";
            case "CREATE_TAB": return "Sekme Oluştur";
            case "DELETE_TAB": return "Sekme Sil";
            case "RENAME_TAB": return "Sekme Adını Değiştir";
            case "EXPLAIN": return "Açıklama";
            default: return action;
        }
    };

    // Simple diff visualization
    const renderDiff = (oldCode: string, newCode: string) => {
        const oldLines = oldCode.split("\n");
        const newLines = newCode.split("\n");

        return (
            <div className="text-xs font-mono max-h-60 overflow-auto">
                <div className="mb-2 text-red-400 bg-red-900/20 p-2 rounded">
                    <div className="text-xs font-bold mb-1 text-red-300">- ESKİ KOD:</div>
                    <pre className="whitespace-pre-wrap">{oldCode.substring(0, 800)}{oldCode.length > 800 ? "..." : ""}</pre>
                </div>
                <div className="text-green-400 bg-green-900/20 p-2 rounded">
                    <div className="text-xs font-bold mb-1 text-green-300">+ YENİ KOD:</div>
                    <pre className="whitespace-pre-wrap">{newCode.substring(0, 800)}{newCode.length > 800 ? "..." : ""}</pre>
                </div>
            </div>
        );
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
                        AI Agent
                    </span>
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 w-[500px] h-[650px] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-10 fade-in">

                    {/* Header */}
                    <div className="flex justify-between items-center p-4 border-b border-zinc-200 dark:border-zinc-700 bg-gradient-to-r from-blue-600 to-purple-600">
                        <h3 className="font-bold flex items-center gap-2 text-white">
                            <Bot className="w-5 h-5" />
                            AI Agent
                            <span className="text-xs opacity-70">({allTabs.length} sekme)</span>
                        </h3>
                        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-lg text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div className={`max-w-[95%] ${msg.role === "user" ? "" : ""}`}>
                                    {/* Action Card */}
                                    {msg.action && msg.role === "ai" ? (
                                        <div className={`rounded-xl border overflow-hidden ${msg.status === "approved"
                                                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                                : msg.status === "rejected"
                                                    ? "border-red-500 bg-red-50 dark:bg-red-900/20 opacity-50"
                                                    : "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                            }`}>
                                            {/* Action Header */}
                                            <div className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${msg.status === "approved"
                                                    ? "bg-green-500 text-white"
                                                    : msg.status === "rejected"
                                                        ? "bg-red-500 text-white"
                                                        : "bg-blue-500 text-white"
                                                }`}>
                                                {getActionIcon(msg.action.action)}
                                                {getActionLabel(msg.action.action)}
                                                {msg.status === "approved" && <span className="ml-auto">✓ Onaylandı</span>}
                                                {msg.status === "rejected" && <span className="ml-auto">✗ Reddedildi</span>}
                                            </div>

                                            {/* Explanation */}
                                            <div className="p-3 text-sm text-zinc-700 dark:text-zinc-300">
                                                {msg.action.explanation}
                                            </div>

                                            {/* Diff Toggle Button */}
                                            {msg.action.action === "EDIT_CODE" && msg.action.code && msg.previousCode && (
                                                <div className="px-3 pb-2">
                                                    <button
                                                        onClick={() => setShowDiff(showDiff === i ? null : i)}
                                                        className="text-xs text-blue-500 hover:underline"
                                                    >
                                                        {showDiff === i ? "Diff'i Gizle" : "Diff'i Göster (Eski vs Yeni)"}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Diff View */}
                                            {showDiff === i && msg.previousCode && msg.action.code && (
                                                <div className="border-t border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-900">
                                                    {renderDiff(msg.previousCode, msg.action.code)}
                                                </div>
                                            )}

                                            {/* Code Preview (if not showing diff) */}
                                            {msg.action.code && showDiff !== i && (
                                                <div className="border-t border-zinc-200 dark:border-zinc-700">
                                                    <div className="px-3 py-1 text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800">
                                                        {msg.action.tabLang || currentLang}
                                                    </div>
                                                    <pre className="p-3 text-xs overflow-x-auto bg-zinc-900 text-green-400 max-h-32">
                                                        <code>{msg.action.code.substring(0, 400)}{msg.action.code.length > 400 ? "..." : ""}</code>
                                                    </pre>
                                                </div>
                                            )}

                                            {/* New Tab Info */}
                                            {msg.action.action === "CREATE_TAB" && msg.action.tabName && (
                                                <div className="px-3 py-2 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-700">
                                                    <strong>Sekme:</strong> {msg.action.tabName} ({msg.action.tabLang})
                                                </div>
                                            )}

                                            {/* Approve/Reject/Undo Buttons */}
                                            {msg.status === "pending" && (
                                                <div className="flex gap-2 p-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                                                    <button
                                                        onClick={() => handleApprove(i)}
                                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                        Onayla
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(i)}
                                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                        Reddet
                                                    </button>
                                                </div>
                                            )}

                                            {/* Undo Button for approved actions */}
                                            {msg.status === "approved" && msg.previousCode && msg.action.action === "EDIT_CODE" && (
                                                <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                                                    <button
                                                        onClick={() => handleUndo(i)}
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
                                                    >
                                                        <Undo2 className="w-4 h-4" />
                                                        Geri Al
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div
                                            className={`px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap ${msg.role === "user"
                                                ? "bg-blue-600 text-white rounded-br-sm"
                                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm"
                                                }`}
                                        >
                                            {msg.text}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-2xl rounded-bl-sm flex items-center gap-2 text-zinc-500">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    AI düşünüyor...
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
                                placeholder="Ne yapmamı istersin?"
                                className="flex-1 px-4 py-2 rounded-full border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
