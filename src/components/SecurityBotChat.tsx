"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Trash2, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ChatMessage {
    id: string;
    role: "user" | "bot";
    text: string;
    time: string;
}

// Security Bot knowledge base - rules, policies, and FAQ
const BOT_KNOWLEDGE: { keywords: string[]; answer: string; answerEN: string }[] = [
    {
        keywords: ["kural", "rules", "kurallar", "policy", "politika"],
        answer: "🛡️ **Hanogt Codev Kuralları:**\n\n1. Zararlı kod çalıştırmak yasaktır (SQL Injection, XSS, Reverse Shell vb.)\n2. Diğer kullanıcılara saldırmak yasaktır\n3. Platform kaynaklarını kötüye kullanmak yasaktır\n4. Spam ve reklam içerikli mesajlar yasaktır\n5. Telif hakkı ihlali yasaktır\n\n⚠️ Kuralları ihlal edenler **sonsuza kadar** banlanır.",
        answerEN: "🛡️ **Hanogt Codev Rules:**\n\n1. Running malicious code is prohibited (SQL Injection, XSS, Reverse Shell, etc.)\n2. Attacking other users is prohibited\n3. Abusing platform resources is prohibited\n4. Spam and advertising messages are prohibited\n5. Copyright infringement is prohibited\n\n⚠️ Violators will be **permanently** banned.",
    },
    {
        keywords: ["ban", "yasak", "engel", "banned", "banlan"],
        answer: "🚫 **Ban Politikası:**\n\nHanogt Security Bot zararlı kod tespit ettiğinde hesabınız **sonsuza kadar** engellenir. Bu karar kesindir ve geri alınamaz.\n\nTespit edilen tehditler: SQL Injection, XSS, Command Injection, Reverse Shell, Fork Bomb, Fileless Malware, DNS Exfiltration ve daha fazlası.",
        answerEN: "🚫 **Ban Policy:**\n\nWhen Hanogt Security Bot detects malicious code, your account is **permanently** banned. This decision is final and irreversible.\n\nDetected threats: SQL Injection, XSS, Command Injection, Reverse Shell, Fork Bomb, Fileless Malware, DNS Exfiltration and more.",
    },
    {
        keywords: ["güvenlik", "security", "koruma", "protection", "tehdit", "threat"],
        answer: "🔒 **Güvenlik Sistemi v3.0:**\n\n• 18+ tehdit kategorisi algılama\n• Shannon Entropy analizi\n• Polimorfik kod tespiti\n• Saldırı zinciri tespiti\n• Unicode/Homoglyph saldırı tespiti\n• Davranış analizi\n• 4 geçişli derin tarama\n• Base64/Hex deobfuscation\n\nTüm kodlar çalıştırılmadan önce taranır.",
        answerEN: "🔒 **Security System v3.0:**\n\n• 18+ threat category detection\n• Shannon Entropy analysis\n• Polymorphic code detection\n• Attack chain detection\n• Unicode/Homoglyph attack detection\n• Behavioral analysis\n• 4-pass deep scanning\n• Base64/Hex deobfuscation\n\nAll code is scanned before execution.",
    },
    {
        keywords: ["ne yapabilirim", "what can i do", "özellik", "feature", "neler var"],
        answer: "✨ **Hanogt Codev Özellikleri:**\n\n• 16 programlama dili desteği\n• 20 arayüz dili\n• Gerçek zamanlı kod çalıştırma\n• AI kodlama asistanı\n• Proje kaydetme ve paylaşma\n• Mesajlaşma sistemi\n• Arkadaşlık sistemi\n• Masaüstü uygulaması\n• %100 ücretsiz",
        answerEN: "✨ **Hanogt Codev Features:**\n\n• 16 programming language support\n• 20 interface languages\n• Real-time code execution\n• AI coding assistant\n• Project saving and sharing\n• Messaging system\n• Friend system\n• Desktop application\n• 100% free",
    },
    {
        keywords: ["dil", "language", "çeviri", "translation", "hangi diller"],
        answer: "🌍 **Desteklenen Diller:**\n\nTürkçe, İngilizce, Rusça, Azerbaycanca, İspanyolca, Kazakça, Japonca, Çince, Korece, Hintçe, Almanca, Nijeryaca, Fransızca, Belçikaca, Hollandaca, Lehçe, Norveççe, Fince, İsveççe, Yunanca\n\nToplam: 20 dil",
        answerEN: "🌍 **Supported Languages:**\n\nTurkish, English, Russian, Azerbaijani, Spanish, Kazakh, Japanese, Chinese, Korean, Hindi, German, Nigerian Pidgin, French, Belgian, Dutch, Polish, Norwegian, Finnish, Swedish, Greek\n\nTotal: 20 languages",
    },
    {
        keywords: ["merhaba", "hello", "selam", "hi", "hey", "nasıl"],
        answer: "👋 Merhaba! Ben **Hanogt Security Bot**. Size kurallar, güvenlik politikaları ve platform özellikleri hakkında yardımcı olabilirim.\n\nSorabileceğiniz konular:\n• 📋 Kurallar\n• 🛡️ Güvenlik sistemi\n• 🚫 Ban politikası\n• ✨ Özellikler\n• 🌍 Dil desteği\n• 📝 Geri bildirim",
        answerEN: "👋 Hello! I'm **Hanogt Security Bot**. I can help you with rules, security policies, and platform features.\n\nTopics you can ask about:\n• 📋 Rules\n• 🛡️ Security system\n• 🚫 Ban policy\n• ✨ Features\n• 🌍 Language support\n• 📝 Feedback",
    },
    {
        keywords: ["feedback", "geri bildirim", "şikayet", "complaint", "rapor", "report"],
        answer: "📝 **Geri Bildirim:**\n\nGeri bildirim göndermek için ana menüden **Geri Bildirim** sayfasına gidin. Orada:\n• Soru sorabilir\n• Hata bildirebilir\n• Öneri yapabilir\n• Şikayet iletebilirsiniz\n\nTüm geri bildirimler dikkate alınır.",
        answerEN: "📝 **Feedback:**\n\nTo send feedback, go to the **Feedback** page from the main menu. There you can:\n• Ask questions\n• Report bugs\n• Make suggestions\n• Submit complaints\n\nAll feedback is taken into consideration.",
    },
    {
        keywords: ["hesap", "account", "profil", "profile", "ayar", "setting"],
        answer: "⚙️ **Hesap Ayarları:**\n\nHesap ayarlarından yapabilecekleriniz:\n• Profil fotoğrafı ve banner değiştirme\n• Kullanıcı adı ve bio düzenleme\n• Sosyal medya bağlantıları ekleme\n• Gizlilik ayarları\n• Bildirim tercihleri\n• Mesajlaşma ayarları\n• Veri dışa aktarma\n• Hesap dondurma/silme",
        answerEN: "⚙️ **Account Settings:**\n\nWhat you can do in account settings:\n• Change profile photo and banner\n• Edit username and bio\n• Add social media links\n• Privacy settings\n• Notification preferences\n• Messaging settings\n• Data export\n• Freeze/delete account",
    },
];

function getBotResponse(userMsg: string, lang: string): string {
    const msg = userMsg.toLowerCase();
    for (const entry of BOT_KNOWLEDGE) {
        if (entry.keywords.some(kw => msg.includes(kw))) {
            return lang === "EN" ? entry.answerEN : entry.answer;
        }
    }
    return lang === "EN"
        ? "🤔 I'm not sure about that. Try asking about:\n• Rules\n• Security\n• Ban policy\n• Features\n• Languages\n• Feedback\n• Account settings"
        : "🤔 Bu konuda bilgim yok. Şunları sorabilirsiniz:\n• Kurallar\n• Güvenlik\n• Ban politikası\n• Özellikler\n• Diller\n• Geri bildirim\n• Hesap ayarları";
}

export default function SecurityBotChat() {
    const { t, language } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            // Welcome message
            setMessages([{
                id: `bot-${Date.now()}`,
                role: "bot",
                text: language === "EN"
                    ? "👋 Hello! I'm **Hanogt Security Bot**. Ask me about rules, security, or platform features!"
                    : "👋 Merhaba! Ben **Hanogt Security Bot**. Kurallar, güvenlik veya platform özellikleri hakkında soru sorabilirsiniz!",
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            }]);
        }
    }, [isOpen]);

    const handleSend = () => {
        if (!input.trim()) return;
        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            text: input.trim(),
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsTyping(true);

        // Simulate typing delay
        setTimeout(() => {
            const botResponse: ChatMessage = {
                id: `bot-${Date.now()}`,
                role: "bot",
                text: getBotResponse(userMsg.text, language),
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };
            setMessages(prev => [...prev, botResponse]);
            setIsTyping(false);
        }, 800 + Math.random() * 700);
    };

    const handleDelete = (id: string) => {
        setMessages(prev => prev.filter(m => m.id !== id));
    };

    const handleEditSave = () => {
        if (!editingId || !editText.trim()) return;
        setMessages(prev => prev.map(m => m.id === editingId ? { ...m, text: editText.trim() } : m));
        setEditingId(null);
        setEditText("");
    };

    // Render markdown-like bold text
    const renderText = (text: string) => {
        return text.split("\n").map((line, i) => {
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
                <span key={i}>
                    {parts.map((part, j) => {
                        if (part.startsWith("**") && part.endsWith("**")) {
                            return <strong key={j} className="font-bold">{part.slice(2, -2)}</strong>;
                        }
                        return <span key={j}>{part}</span>;
                    })}
                    {i < text.split("\n").length - 1 && <br />}
                </span>
            );
        });
    };

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed top-4 right-4 z-[80] w-11 h-11 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border-2 ${isOpen ? "border-green-500 ring-2 ring-green-500/30" : "border-zinc-300 dark:border-zinc-600 hover:border-blue-500"}`}
                title="Hanogt Security Bot"
            >
                <img src="/hanogt-bot-logo.png" alt="Security Bot" className="w-full h-full object-cover" />
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed top-16 right-4 z-[80] w-[380px] h-[520px] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-emerald-600 to-green-700 text-white">
                        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30 flex-shrink-0">
                            <img src="/hanogt-bot-logo.png" alt="Bot" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm">Hanogt Security Bot</h3>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                                <span className="text-xs text-green-100">{t("online") || "Çevrimiçi"}</span>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-zinc-50 dark:bg-zinc-950">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} group`}>
                                {/* Bot avatar */}
                                {msg.role === "bot" && (
                                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mr-2 mt-1 border border-zinc-200 dark:border-zinc-700">
                                        <img src="/hanogt-bot-logo.png" alt="Bot" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <div className={`max-w-[75%] relative ${msg.role === "user" ? "order-1" : ""}`}>
                                    {editingId === msg.id ? (
                                        <div className="flex flex-col gap-1">
                                            <input
                                                value={editText}
                                                onChange={e => setEditText(e.target.value)}
                                                onKeyDown={e => e.key === "Enter" && handleEditSave()}
                                                className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-white"
                                                autoFocus
                                            />
                                            <div className="flex gap-1">
                                                <button onClick={handleEditSave} className="text-[10px] text-blue-500 font-semibold">{t("save") || "Kaydet"}</button>
                                                <button onClick={() => setEditingId(null)} className="text-[10px] text-zinc-400">{t("cancel") || "İptal"}</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${msg.role === "user"
                                            ? "bg-blue-600 text-white rounded-br-md"
                                            : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-md border border-zinc-100 dark:border-zinc-700"
                                        }`}>
                                            {renderText(msg.text)}
                                        </div>
                                    )}
                                    <div className={`flex items-center gap-1.5 mt-0.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                        <span className="text-[10px] text-zinc-400">{msg.time}</span>
                                        {msg.role === "user" && editingId !== msg.id && (
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                <button
                                                    onClick={() => { setEditingId(msg.id); setEditText(msg.text); }}
                                                    className="text-[10px] text-zinc-400 hover:text-blue-500"
                                                >✏️</button>
                                                <button
                                                    onClick={() => handleDelete(msg.id)}
                                                    className="text-[10px] text-zinc-400 hover:text-red-500"
                                                >🗑️</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {isTyping && (
                            <div className="flex items-start gap-2">
                                <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 border border-zinc-200 dark:border-zinc-700">
                                    <img src="/hanogt-bot-logo.png" alt="Bot" className="w-full h-full object-cover" />
                                </div>
                                <div className="bg-white dark:bg-zinc-800 px-4 py-3 rounded-2xl rounded-bl-md border border-zinc-100 dark:border-zinc-700">
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleSend()}
                                placeholder={t("ask_security_bot") || "Güvenlik botu ile sohbet et..."}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim()}
                                className="p-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white transition-all shadow-md hover:shadow-lg disabled:shadow-none"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1.5 text-center">
                            <ShieldCheck className="w-3 h-3 inline mr-1" />
                            Hanogt Security Bot v3.0
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
