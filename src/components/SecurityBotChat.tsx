"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Send, ShieldCheck, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import OptimizedImage from "@/components/OptimizedImage";
import { useI18n, type Copy } from "@/lib/i18n";
import { botReply, TOPICS } from "@/lib/security/bot-brain";

type ChatMessage = { id: string; role: "user" | "bot"; text: string; time: string; suggestions?: string[] };

const STORAGE_KEY = "hanogt-security-bot:chat";
const MAX_MESSAGES = 60;

const QUICK: Array<{ label: Copy; prompt: Copy }> = [
    { label: { TR: "🔐 Parola güvenliği", EN: "🔐 Password safety" }, prompt: { TR: "Parolam nasıl korunuyor?", EN: "How is my password protected?" } },
    { label: { TR: "🔗 Bağlantı kontrolü", EN: "🔗 Check a link" }, prompt: { TR: "Şüpheli bir bağlantıya tıkladım", EN: "I clicked a suspicious link" } },
    { label: { TR: "🧪 Kodumu tara", EN: "🧪 Scan my code" }, prompt: { TR: "Kodum güvenli mi, nasıl tararım?", EN: "Is my code secure, how do I scan it?" } },
    { label: { TR: "🚨 Hesabım çalındı", EN: "🚨 I was hacked" }, prompt: { TR: "Hesabım ele geçirildi galiba", EN: "I think my account was hacked" } },
    { label: { TR: "🛡️ Engellendim", EN: "🛡️ I was blocked" }, prompt: { TR: "Kodum neden engellendi, itiraz edebilir miyim?", EN: "Why was my code blocked, can I appeal?" } },
];

const time = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

let messageCounter = 0;
function nextMessageId() {
    messageCounter += 1;
    return `${Date.now().toString(36)}-${messageCounter}`;
}

function loadHistory(): ChatMessage[] | null {
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) as unknown : null;
        if (!Array.isArray(parsed)) return null;
        return parsed.filter((entry): entry is ChatMessage => Boolean(entry && typeof entry === "object" && typeof (entry as ChatMessage).text === "string" && ((entry as ChatMessage).role === "user" || (entry as ChatMessage).role === "bot"))).slice(-MAX_MESSAGES);
    } catch {
        return null;
    }
}

/** Minimal, safe formatting: **bold**, bullet/numbered lines and internal [links](/path). */
function RichText({ text, onNavigate }: { text: string; onNavigate: () => void }) {
    const renderInline = (line: string, key: string) => {
        const parts: React.ReactNode[] = [];
        const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[A-Za-z0-9/#?=&_-]*)\)/g;
        let last = 0;
        let match: RegExpExecArray | null;
        let index = 0;
        while ((match = pattern.exec(line))) {
            if (match.index > last) parts.push(line.slice(last, match.index));
            if (match[1]) parts.push(<strong key={`${key}-b${index}`} className="font-bold">{match[1]}</strong>);
            else parts.push(<Link key={`${key}-l${index}`} href={match[3]} onClick={onNavigate} className="font-semibold text-emerald-600 underline decoration-emerald-500/40 underline-offset-2 hover:decoration-emerald-500 dark:text-emerald-400">{match[2]}</Link>);
            last = match.index + match[0].length;
            index += 1;
        }
        if (last < line.length) parts.push(line.slice(last));
        return parts;
    };
    return (
        <div className="space-y-1.5">
            {text.split("\n").map((line, index) => {
                const key = `l${index}`;
                if (/^•\s/.test(line)) return <p key={key} className="flex gap-1.5"><span className="text-emerald-500">•</span><span>{renderInline(line.slice(2), key)}</span></p>;
                const numbered = /^(\d+)\.\s(.*)$/.exec(line);
                if (numbered) return <p key={key} className="flex gap-1.5"><span className="font-bold text-emerald-600 dark:text-emerald-400">{numbered[1]}.</span><span>{renderInline(numbered[2], key)}</span></p>;
                return line ? <p key={key}>{renderInline(line, key)}</p> : <Fragment key={key} />;
            })}
        </div>
    );
}

export function SecurityBotChatWindow({ onClose }: { onClose: () => void }) {
    const { tx } = useI18n();
    const welcome = (): ChatMessage => ({
        id: "welcome",
        role: "bot",
        text: tx({
            TR: "Merhaba, ben **Hanogt Security Bot** v6. 🛡️\nGüvenlik önlemlerini açıklarım, şüpheli **bağlantıları** ve yapıştırdığın **kodu** anında incelerim. Mesajların bu tarayıcıdan çıkmaz. Hesap yaptırımı kararı vermem.",
            EN: "Hi, I'm **Hanogt Security Bot** v6. 🛡️\nI explain our safeguards and instantly inspect suspicious **links** and any **code** you paste. Your messages never leave this browser. I don't make account decisions.",
        }),
        time: time(),
        suggestions: ["password", "phishing", "advisor"],
    });
    const [messages, setMessages] = useState<ChatMessage[]>(() => (typeof window === "undefined" ? null : loadHistory()) ?? [welcome()]);
    const [input, setInput] = useState("");
    const [typing, setTyping] = useState(false);
    const [lastTopic, setLastTopic] = useState<string | null>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
        try {
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
        } catch {
            // History is a convenience only.
        }
    }, [messages, typing]);

    useEffect(() => {
        inputRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
    }, [onClose]);

    const ask = (raw: string) => {
        const value = raw.trim().slice(0, 4000);
        if (!value || typing) return;
        const stamp = nextMessageId();
        const userMessage: ChatMessage = { id: `user-${stamp}`, role: "user", text: value, time: time() };
        setMessages((current) => [...current, userMessage].slice(-MAX_MESSAGES));
        setInput("");
        setTyping(true);
        const reply = botReply(value, lastTopic);
        const delay = Math.min(1400, 450 + tx(reply.text).length * 2);
        timerRef.current = window.setTimeout(() => {
            setTyping(false);
            if (reply.topic) setLastTopic(reply.topic);
            const botMessage: ChatMessage = { id: `bot-${stamp}`, role: "bot", text: tx(reply.text), time: time(), suggestions: reply.suggestions };
            setMessages((current) => [...current, botMessage].slice(-MAX_MESSAGES));
        }, delay);
    };

    const lastBot = [...messages].reverse().find((message) => message.role === "bot");

    return (
        <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            role="dialog"
            aria-label="Hanogt Security Bot"
            className="fixed bottom-4 end-4 z-[120] flex h-[min(640px,calc(100dvh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl shadow-emerald-900/20 dark:border-white/10 dark:bg-zinc-900"
        >
            <header className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 p-4 text-white">
                <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                <div className="relative flex items-center gap-3">
                    <div className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-white/15"><OptimizedImage src="/hanogt-bot-logo.png" alt="" className="h-full w-full object-cover" /><span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-teal-700 bg-emerald-300" /></div>
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate font-bold">Hanogt Security Bot</h2>
                        <p className="text-[11.5px] text-emerald-50">v6 · {tx({ TR: "Güvenlik ve gizlilik rehberi", EN: "Security & privacy guide" })}</p>
                    </div>
                    <button type="button" onClick={() => { setMessages([welcome()]); setLastTopic(null); }} className="rounded-xl p-2 hover:bg-white/10" aria-label={tx({ TR: "Sohbeti temizle", EN: "Clear chat" })} title={tx({ TR: "Sohbeti temizle", EN: "Clear chat" })}><Trash2 className="h-4 w-4" /></button>
                    <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-white/10" aria-label={tx({ TR: "Kapat", EN: "Close" })}><X className="h-5 w-5" /></button>
                </div>
                <div className="relative mt-3 flex items-center gap-2 rounded-xl bg-black/10 px-3 py-2 text-[11px] text-emerald-50"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />{tx({ TR: "Bağlantı ve kod analizi yerel · Orantılı yaptırım · İtiraz yolu", EN: "Local link & code analysis · Proportionate sanctions · Appeals" })}</div>
            </header>

            <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-950/50" aria-live="polite">
                <AnimatePresence initial={false}>
                    {messages.map((message) => (
                        <motion.div key={message.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${message.role === "user" ? "rounded-br-md bg-emerald-600 text-white" : "rounded-bl-md border border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200"}`}>
                                {message.role === "user"
                                    ? <p className={`whitespace-pre-wrap break-words ${message.text.includes("\n") ? "font-mono text-[12px]" : ""}`}>{message.text.length > 600 ? `${message.text.slice(0, 600)}…` : message.text}</p>
                                    : <RichText text={message.text} onNavigate={onClose} />}
                                <span className={`mt-1 block text-[10px] ${message.role === "user" ? "text-emerald-100" : "text-zinc-400"}`}>{message.time}</span>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                {typing ? (
                    <div className="flex justify-start" aria-label={tx({ TR: "Yazıyor", EN: "Typing" })}>
                        <div className="flex gap-1 rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-800">
                            {[0, 1, 2].map((dot) => <motion.span key={dot} className="h-2 w-2 rounded-full bg-emerald-500" animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15 }} />)}
                        </div>
                    </div>
                ) : null}
                {!typing && lastBot?.suggestions?.length ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {lastBot.suggestions.map((id) => {
                            const topic = TOPICS.find((entry) => entry.id === id);
                            return topic ? <button key={id} type="button" onClick={() => ask(tx(topic.label))} className="rounded-full border border-emerald-500/30 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-500/10">{tx(topic.label)}</button> : null;
                        })}
                    </div>
                ) : null}
                <div ref={endRef} />
            </div>

            <div className="border-t border-zinc-200 p-3 dark:border-white/10">
                <div className="scrollbar-none mb-2 flex gap-1.5 overflow-x-auto pb-1">
                    {QUICK.map((quick) => <button key={quick.label.EN} type="button" onClick={() => ask(tx(quick.prompt))} className="whitespace-nowrap rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-emerald-500/10">{tx(quick.label)}</button>)}
                </div>
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        rows={1}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                ask(input);
                            }
                        }}
                        maxLength={4000}
                        placeholder={tx({ TR: "Sor, bağlantı ya da kod yapıştır…", EN: "Ask, or paste a link or code…" })}
                        className="scrollbar-thin max-h-32 min-h-[42px] min-w-0 flex-1 resize-none rounded-xl bg-zinc-100 px-3.5 py-2.5 text-[13.5px] text-zinc-800 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <button type="button" onClick={() => ask(input)} disabled={!input.trim() || typing} className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-40" aria-label={tx({ TR: "Gönder", EN: "Send" })}><Send className="h-4 w-4" /></button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-zinc-400">
                    <span>{tx({ TR: "Bilgilendirme aracıdır; kesin güvenlik hükmü vermez.", EN: "Informational only; not a definitive security verdict." })}</span>
                    <Link href="/security" onClick={onClose} className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-600 hover:underline dark:text-emerald-400">{tx({ TR: "Güvenlik Merkezi", EN: "Security Center" })}<ExternalLink className="h-3 w-3" /></Link>
                </div>
            </div>
        </motion.div>
    );
}

export default function SecurityBotChat() {
    return null;
}
