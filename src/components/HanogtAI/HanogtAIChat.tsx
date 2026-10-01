"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    Bot, Check, Code2, Copy as CopyIcon, Cpu, Maximize2, MessageSquarePlus, Paperclip, Pencil, RotateCcw, Search, Send, ShieldCheck, Sparkles,
    Square, ThumbsDown, ThumbsUp, Trash2, X, Menu as MenuIcon, SquareArrowOutUpRight,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamHanogtAI, type AiFailure } from "@/lib/ai/client";
import { useAiContext } from "@/lib/ai/context-store";
import {
    createId, setActiveConversation, titleFrom, useActiveConversationId, useConversationActions, useConversations,
    type AiConversation, type AiMessage,
} from "@/lib/ai/conversations";
import { answerLocally, CORE_INFO, type AiMode } from "@/lib/ai/local-engine";
import { useI18n, type Copy } from "@/lib/i18n";
import { useRawSession } from "@/components/Provider";
import Markdown from "./Markdown";

export interface ChatLaunch {
    prompt?: string;
    mode?: AiMode;
    send?: boolean;
    /** Changes on every launch so the same prompt can be sent twice. */
    nonce?: number;
}

const MAX_INPUT = 8_000;

const MODES: Array<{ id: AiMode; label: Copy; icon: typeof Sparkles }> = [
    { id: "general", label: { TR: "Genel", EN: "General" }, icon: Sparkles },
    { id: "code", label: { TR: "Kod", EN: "Code" }, icon: Code2 },
    { id: "security", label: { TR: "Güvenlik", EN: "Security" }, icon: ShieldCheck },
];

const STARTERS: Record<AiMode, Array<{ title: Copy; prompt: Copy }>> = {
    general: [
        { title: { TR: "Neler yapabilirsin?", EN: "What can you do?" }, prompt: { TR: "Neler yapabilirsin?", EN: "What can you do?" } },
        { title: { TR: "Oyun yapmaya başla", EN: "Start making a game" }, prompt: { TR: "Hanogt Engine ile ilk 2D oyunumu nasıl yaparım?", EN: "How do I make my first 2D game with Hanogt Engine?" } },
        { title: { TR: "Grup kur", EN: "Create a group" }, prompt: { TR: "Arkadaşlarımla bir çalışma grubu nasıl kurarım?", EN: "How do I set up a study group with my friends?" } },
        { title: { TR: "Hangi diller var?", EN: "Which languages?" }, prompt: { TR: "Editörde hangi programlama dillerini çalıştırabilirim?", EN: "Which programming languages can I run in the editor?" } },
    ],
    code: [
        { title: { TR: "Liste sıralama", EN: "Sort a list" }, prompt: { TR: "Python'da bir liste nasıl sıralanır?", EN: "How do I sort a list in Python?" } },
        { title: { TR: "Zıplama scripti", EN: "Jump script" }, prompt: { TR: "Hanogt Engine için C# zıplama kodu yaz", EN: "Write a C# jump script for Hanogt Engine" } },
        { title: { TR: "Hatayı açıkla", EN: "Explain an error" }, prompt: { TR: "TypeError: Cannot read properties of undefined ne demek?", EN: "What does TypeError: Cannot read properties of undefined mean?" } },
        { title: { TR: "Kodumu incele", EN: "Review my code" }, prompt: { TR: "Açık dosyamdaki kodu incele ve iyileştir.", EN: "Review and improve the code in my open file." } },
    ],
    security: [
        { title: { TR: "Bağlantı kontrolü", EN: "Check a link" }, prompt: { TR: "Bu bağlantı güvenli mi? https://", EN: "Is this link safe? https://" } },
        { title: { TR: "Parola gücü", EN: "Password strength" }, prompt: { TR: "\"Kedi2024!\" parolası güçlü mü?", EN: "Is the password \"Kitty2024!\" strong?" } },
        { title: { TR: "Hesabım çalındı", EN: "I was hacked" }, prompt: { TR: "Hesabım ele geçirildi galiba, ne yapmalıyım?", EN: "I think my account was hacked, what should I do?" } },
        { title: { TR: "2FA nasıl açılır?", EN: "Enable 2FA" }, prompt: { TR: "İki adımlı doğrulamayı nasıl açarım?", EN: "How do I turn on two-factor authentication?" } },
    ],
};

const NOTICES: Record<AiFailure, Copy> = {
    auth_required: { TR: "Oturumun yenilenmeli; bu yanıtı Hanogt AI Çekirdeği verdi.", EN: "Your session needs to be renewed; Hanogt AI Core answered this one." },
    not_configured: { TR: "Bu sunucuda dil modeli yapılandırılmamış; yanıtı Hanogt AI Çekirdeği verdi.", EN: "No language model is configured on this server; Hanogt AI Core answered." },
    rate_limited: { TR: "Dakikalık istek sınırı doldu; yanıtı Hanogt AI Çekirdeği verdi.", EN: "The per-minute limit was reached; Hanogt AI Core answered." },
    daily_limit: { TR: "Günlük dil modeli sınırın doldu; yarına kadar Hanogt AI Çekirdeği yanıt verecek.", EN: "Your daily language-model limit is used up; Hanogt AI Core answers until tomorrow." },
    network: { TR: "Dil modeline ulaşılamadı; yanıtı Hanogt AI Çekirdeği verdi.", EN: "The language model couldn't be reached; Hanogt AI Core answered." },
    timeout: { TR: "Dil modeli zamanında yanıt vermedi; yanıtı Hanogt AI Çekirdeği verdi.", EN: "The language model timed out; Hanogt AI Core answered." },
    upstream: { TR: "Dil modeli hizmeti hata verdi; yanıtı Hanogt AI Çekirdeği verdi.", EN: "The language model service failed; Hanogt AI Core answered." },
    aborted: { TR: "Durduruldu.", EN: "Stopped." },
};

function relativeDay(timestamp: number, locale: string, tx: (copy: Copy) => string) {
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(timestamp).setHours(0, 0, 0, 0)) / 86_400_000);
    if (days <= 0) return tx({ TR: "Bugün", EN: "Today" });
    if (days === 1) return tx({ TR: "Dün", EN: "Yesterday" });
    return new Date(timestamp).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function openCodeInEditor(language: string, code: string, router: ReturnType<typeof useRouter>, name?: string) {
    const id = createId();
    try {
        window.sessionStorage.setItem(`hanogt:editor-import:${id}`, JSON.stringify({ name: name || `hanogt-ai.${language}`, language, code: code.slice(0, 500_000) }));
        router.push(`/editor?import=${encodeURIComponent(id)}`);
    } catch {
        void navigator.clipboard?.writeText(code).catch(() => undefined);
    }
}

function AiAvatar({ size = "h-8 w-8" }: { size?: string }) {
    return (
        <span className={`${size} relative grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25`}>
            <Sparkles className="h-[55%] w-[55%]" />
        </span>
    );
}

export default function HanogtAIChat({ variant, onClose, launch }: { variant: "panel" | "page"; onClose?: () => void; launch?: ChatLaunch }) {
    const { tx, language, locale, dir } = useI18n();
    const router = useRouter();
    // The language model only needs the NextAuth session, not the Firebase
    // bridge, so the raw session is used: it is known sooner after a page load.
    const { status } = useRawSession();
    const signedIn = status === "authenticated";
    // While the session is still loading, try the model anyway: the server
    // knows whether this browser is signed in, and the core answers otherwise.
    const tryModel = status !== "unauthenticated";
    const conversations = useConversations();
    const activeId = useActiveConversationId();
    const { create, update, remove, clearAll } = useConversationActions();
    const editorContext = useAiContext();
    const active = useMemo(() => conversations.find((conversation) => conversation.id === activeId) ?? null, [conversations, activeId]);
    const [draftMode, setDraftMode] = useState<AiMode>("general");
    const mode = active?.mode ?? draftMode;
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState<{ conversationId: string; messageId: string; text: string } | null>(null);
    const [attachFile, setAttachFile] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const stickToBottom = useRef(true);
    const lastLaunch = useRef<number | undefined>(undefined);

    const hasFile = Boolean(editorContext?.code?.trim());
    const busy = Boolean(streaming);
    const engineLabel = signedIn
        ? tx({ TR: "Dil modeli + Hanogt bilgi tabanı", EN: "Language model + Hanogt knowledge" })
        : tx({ TR: "Çekirdek · çevrimdışı · giriş yapınca dil modeli", EN: "Core · offline · sign in for the language model" });

    // Keep the newest message in view unless the user scrolled up.
    useEffect(() => {
        const list = listRef.current;
        if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
    }, [active?.messages.length, streaming?.text]);

    const onScroll = () => {
        const list = listRef.current;
        if (list) stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    };

    const finish = useCallback((conversationId: string, messageId: string, patch: Partial<AiMessage>) => {
        update(conversationId, (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
        }));
    }, [update]);

    const ask = useCallback(async (raw: string, history?: AiMessage[]) => {
        const text = raw.trim().slice(0, MAX_INPUT);
        if (!text || controllerRef.current) return;
        let conversation: AiConversation | null = active;
        if (!conversation) conversation = create(draftMode, titleFrom(text));
        const conversationId = conversation.id;
        const userMessage: AiMessage = { id: createId(), role: "user", content: text, createdAt: Date.now() };
        const assistantId = createId();
        const base = history ?? conversation.messages;
        update(conversationId, (current) => ({
            ...current,
            title: current.title || titleFrom(text),
            messages: [...base, userMessage, { id: assistantId, role: "assistant", content: "", createdAt: Date.now() }],
        }));
        setInput("");
        stickToBottom.current = true;
        setStreaming({ conversationId, messageId: assistantId, text: "" });

        const currentMode = conversation.mode;
        const context = hasFile && attachFile && editorContext ? editorContext : editorContext ? { path: editorContext.path } : { path: window.location.pathname };
        const runCore = async (failure?: AiFailure, retryAfterSeconds?: number) => {
            const reply = await answerLocally(text, { tx, locale, mode: currentMode, signedIn, context: context ?? undefined });
            const notice = failure && failure !== "aborted"
                ? `${tx(NOTICES[failure])}${failure === "rate_limited" && retryAfterSeconds ? ` ${tx({ TR: "{seconds} sn sonra tekrar dene.", EN: "Try again in {seconds} s." }, { seconds: retryAfterSeconds })}` : ""}`
                : undefined;
            finish(conversationId, assistantId, { content: reply.text, engine: "core", sources: reply.sources, code: reply.code, notice });
        };

        try {
            if (!tryModel) {
                await new Promise((resolve) => window.setTimeout(resolve, 280));
                await runCore();
                return;
            }
            const controller = new AbortController();
            controllerRef.current = controller;
            const turns = [...base, userMessage]
                .filter((message) => message.content.trim() && !message.error)
                .slice(-16)
                .map((message) => ({ role: message.role, content: message.content }));
            let frame = 0;
            const result = await streamHanogtAI({
                messages: turns,
                mode: currentMode,
                language,
                context: context && "code" in context ? context : { path: context?.path },
                signal: controller.signal,
                onToken: (soFar) => {
                    cancelAnimationFrame(frame);
                    frame = requestAnimationFrame(() => setStreaming((current) => (current && current.messageId === assistantId ? { ...current, text: soFar } : current)));
                },
            });
            cancelAnimationFrame(frame);
            if (result.ok) {
                finish(conversationId, assistantId, { content: result.text, engine: "llm", sources: result.sources, notice: result.failure === "aborted" ? tx(NOTICES.aborted) : undefined });
            } else if (result.failure === "aborted") {
                if (result.text) finish(conversationId, assistantId, { content: result.text, engine: "llm", notice: tx(NOTICES.aborted) });
                else update(conversationId, (current) => ({ ...current, messages: current.messages.filter((message) => message.id !== assistantId) }));
            } else {
                // A signed-out visitor asking during session loading needs no "session expired" notice.
                await runCore(result.failure === "auth_required" && !signedIn ? undefined : result.failure, result.retryAfterSeconds);
            }
        } catch {
            finish(conversationId, assistantId, { content: tx({ TR: "Bir şeyler ters gitti. Lütfen tekrar dene.", EN: "Something went wrong. Please try again." }), error: true });
        } finally {
            controllerRef.current = null;
            setStreaming(null);
        }
    }, [active, attachFile, create, draftMode, editorContext, finish, hasFile, language, locale, signedIn, tryModel, tx, update]);

    // Launch requests (e.g. "Ask Hanogt AI" buttons elsewhere on the site).
    // Local state is adjusted while rendering; store writes and sending happen in the effect.
    const askRef = useRef(ask);
    useEffect(() => {
        askRef.current = ask;
    }, [ask]);
    const [handledLaunch, setHandledLaunch] = useState<number | undefined>(undefined);
    if (launch?.nonce !== undefined && launch.nonce !== handledLaunch) {
        setHandledLaunch(launch.nonce);
        if (launch.mode && !active) setDraftMode(launch.mode);
        if (launch.prompt && !launch.send) setInput(launch.prompt);
    }
    useEffect(() => {
        if (launch?.nonce === undefined || launch.nonce === lastLaunch.current) return;
        lastLaunch.current = launch.nonce;
        if (launch.mode && active && launch.mode !== active.mode) {
            if (active.messages.length) create(launch.mode);
            else update(active.id, (conversation) => ({ ...conversation, mode: launch.mode! }));
        }
        const prompt = launch.prompt;
        const timer = window.setTimeout(() => {
            if (prompt && launch.send) void askRef.current(prompt);
            inputRef.current?.focus();
        }, 80);
        return () => window.clearTimeout(timer);
        // Runs once per launch; `active`, `create` and `update` are read at that moment on purpose.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [launch?.nonce]);

    useEffect(() => {
        inputRef.current?.focus();
    }, [activeId]);

    const stop = () => controllerRef.current?.abort();

    const newChat = () => {
        stop();
        setActiveConversation(null);
        setDraftMode(mode);
        setInput("");
        setSidebarOpen(false);
        window.setTimeout(() => inputRef.current?.focus(), 30);
    };

    const switchMode = (next: AiMode) => {
        if (busy || next === mode) return;
        if (active && active.messages.length) {
            create(next);
        } else if (active) {
            update(active.id, (conversation) => ({ ...conversation, mode: next }));
        } else {
            setDraftMode(next);
        }
    };

    const regenerate = () => {
        if (!active || busy) return;
        const lastUserIndex = [...active.messages].map((message) => message.role).lastIndexOf("user");
        if (lastUserIndex < 0) return;
        const prompt = active.messages[lastUserIndex].content;
        void ask(prompt, active.messages.slice(0, lastUserIndex));
    };

    const copyMessage = async (message: AiMessage) => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopiedId(message.id);
            window.setTimeout(() => setCopiedId(null), 1500);
        } catch {
            setCopiedId(null);
        }
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void ask(input);
        } else if (event.key === "Escape") {
            if (busy) stop();
            else if (variant === "panel") onClose?.();
        }
    };

    // Auto-grow the composer.
    useEffect(() => {
        const element = inputRef.current;
        if (!element) return;
        element.style.height = "0px";
        element.style.height = `${Math.min(element.scrollHeight, variant === "page" ? 240 : 160)}px`;
    }, [input, variant]);

    const messages = active?.messages ?? [];
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    const filtered = conversations.filter((conversation) => !search.trim() || conversation.title.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
    const openEditor = (languageId: string, code: string) => {
        openCodeInEditor(languageId, code, router);
        onClose?.();
    };

    const modeSwitch = (
        <div className="flex gap-1 rounded-xl bg-zinc-900/[0.05] p-1 dark:bg-white/[0.06]" role="tablist" aria-label={tx({ TR: "Hanogt AI modu", EN: "Hanogt AI mode" })}>
            {MODES.map((entry) => {
                const Icon = entry.icon;
                const selected = mode === entry.id;
                return (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        disabled={busy}
                        onClick={() => switchMode(entry.id)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition disabled:opacity-60 ${selected ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
                    >
                        <Icon className="h-3.5 w-3.5" />{tx(entry.label)}
                    </button>
                );
            })}
        </div>
    );

    const emptyState = (
        <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
                <AiAvatar size="h-14 w-14" />
            </motion.div>
            <h2 className="mt-4 text-xl font-black tracking-tight text-zinc-900 dark:text-white">{tx({ TR: "Merhaba, ben Hanogt AI", EN: "Hi, I'm Hanogt AI" })}</h2>
            <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {mode === "code"
                    ? tx({ TR: "Kod yazar, açıklar ve hataları birlikte ayıklarız. Hata mesajını ya da kodunu yapıştır.", EN: "We'll write, explain and debug code together. Paste an error message or your code." })
                    : mode === "security"
                        ? tx({ TR: "Şüpheli bağlantıları ve kodu incelerim, hesabını korumana yardım ederim.", EN: "I inspect suspicious links and code and help you protect your account." })
                        : tx({ TR: "Kod, oyun geliştirme, güvenlik ya da Hanogt'u kullanmak hakkında her şeyi sor.", EN: "Ask me anything about code, game development, security or using Hanogt." })}
            </p>
            <div className={`mt-6 grid w-full gap-2 ${variant === "page" ? "max-w-2xl sm:grid-cols-2" : "max-w-sm"}`}>
                {STARTERS[mode].map((starter) => (
                    <button
                        key={starter.title.EN}
                        type="button"
                        onClick={() => void ask(tx(starter.prompt).endsWith("https://") ? "" : tx(starter.prompt))}
                        onMouseDown={(event) => {
                            if (tx(starter.prompt).endsWith("https://")) {
                                event.preventDefault();
                                setInput(tx(starter.prompt));
                                window.setTimeout(() => inputRef.current?.focus(), 0);
                            }
                        }}
                        className="group rounded-2xl border border-zinc-200 bg-white p-3 text-start transition hover:-translate-y-0.5 hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-violet-400/40"
                    >
                        <span className="block text-[13px] font-bold text-zinc-900 dark:text-white">{tx(starter.title)}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-zinc-500 dark:text-zinc-400">{tx(starter.prompt)}</span>
                    </button>
                ))}
            </div>
            {!signedIn && status !== "loading" ? (
                <p className="mt-5 max-w-sm rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] leading-snug text-amber-800 dark:text-amber-200">
                    {tx({ TR: "Şu an cihazında çalışan Hanogt AI Çekirdeği yanıt veriyor. Tam dil modeli için", EN: "Hanogt AI Core is answering on your device. For the full language model," })}{" "}
                    <Link href="/login?callbackUrl=/ai" onClick={onClose} className="font-bold underline">{tx({ TR: "giriş yap", EN: "sign in" })}</Link>.
                </p>
            ) : null}
        </div>
    );

    const messageList = (
        <div ref={listRef} onScroll={onScroll} className={`scrollbar-thin min-h-0 flex-1 overflow-y-auto ${variant === "page" ? "px-4 py-6 sm:px-8" : "px-3.5 py-4"}`} role="log" aria-live="polite" aria-busy={busy}>
            {messages.length === 0 ? emptyState : (
                <div className={`mx-auto space-y-5 ${variant === "page" ? "max-w-3xl" : ""}`}>
                    <AnimatePresence initial={false}>
                        {messages.map((message) => {
                            const isStreaming = streaming?.messageId === message.id;
                            const content = isStreaming ? streaming.text : message.content;
                            if (message.role === "user") {
                                return (
                                    <motion.div key={message.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                                        <div className="max-w-[86%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-gradient-to-br from-indigo-600 to-violet-600 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white shadow-md shadow-indigo-600/20">
                                            {content.length > 1_200 ? `${content.slice(0, 1_200)}…` : content}
                                        </div>
                                    </motion.div>
                                );
                            }
                            return (
                                <motion.div key={message.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5">
                                    <AiAvatar size="h-7 w-7" />
                                    <div className="min-w-0 flex-1">
                                        {message.notice ? <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[11.5px] font-semibold text-amber-700 dark:text-amber-300"><Cpu className="h-3 w-3" />{message.notice}</p> : null}
                                        <div className={`text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-200 ${message.error ? "text-red-600 dark:text-red-400" : ""}`}>
                                            {content ? <Markdown text={content} onNavigate={onClose} onOpenInEditor={openEditor} /> : (
                                                <span className="inline-flex gap-1 py-2" aria-label={tx({ TR: "Yazıyor", EN: "Typing" })}>
                                                    {[0, 1, 2].map((dot) => <motion.span key={dot} className="h-2 w-2 rounded-full bg-violet-500" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15 }} />)}
                                                </span>
                                            )}
                                            {isStreaming && content ? <span className="ms-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-violet-500 align-text-bottom" /> : null}
                                        </div>
                                        {!isStreaming && content ? (
                                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${message.engine === "llm" ? "bg-violet-500/10 text-violet-600 dark:text-violet-300" : "bg-zinc-500/10 text-zinc-500"}`} title={message.engine === "llm" ? tx({ TR: "Sunucudaki büyük dil modeli", EN: "Large language model on the server" }) : tx({ TR: "Cihazında çalışan eğitilmiş Hanogt AI Çekirdeği", EN: "Trained Hanogt AI Core running on your device" })}>
                                                    {message.engine === "llm" ? <Sparkles className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
                                                    {message.engine === "llm" ? "LLM" : tx({ TR: "Çekirdek", EN: "Core" })}
                                                </span>
                                                {message.sources?.map((source) => (
                                                    <Link key={source.href} href={source.href} onClick={onClose} className="rounded-full border border-zinc-200 px-2 py-0.5 font-semibold text-zinc-500 transition hover:border-violet-400 hover:text-violet-600 dark:border-white/10 dark:hover:text-violet-300">{source.title}</Link>
                                                ))}
                                                <span className="ms-auto flex items-center gap-0.5">
                                                    {message.code ? (
                                                        <button type="button" onClick={() => openEditor(message.code!.language, message.code!.code)} className="rounded-md p-1.5 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200" title={tx({ TR: "Editörde aç", EN: "Open in editor" })} aria-label={tx({ TR: "Editörde aç", EN: "Open in editor" })}><SquareArrowOutUpRight className="h-3.5 w-3.5" /></button>
                                                    ) : null}
                                                    <button type="button" onClick={() => void copyMessage(message)} className="rounded-md p-1.5 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200" title={tx({ TR: "Kopyala", EN: "Copy" })} aria-label={tx({ TR: "Kopyala", EN: "Copy" })}>{copiedId === message.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <CopyIcon className="h-3.5 w-3.5" />}</button>
                                                    <button type="button" onClick={() => active && update(active.id, (conversation) => ({ ...conversation, messages: conversation.messages.map((entry) => entry.id === message.id ? { ...entry, feedback: entry.feedback === "up" ? undefined : "up" } : entry) }))} className={`rounded-md p-1.5 transition hover:bg-zinc-100 dark:hover:bg-white/10 ${message.feedback === "up" ? "text-emerald-500" : "hover:text-zinc-700 dark:hover:text-zinc-200"}`} aria-label={tx({ TR: "Faydalı", EN: "Helpful" })} aria-pressed={message.feedback === "up"}><ThumbsUp className="h-3.5 w-3.5" /></button>
                                                    <button type="button" onClick={() => active && update(active.id, (conversation) => ({ ...conversation, messages: conversation.messages.map((entry) => entry.id === message.id ? { ...entry, feedback: entry.feedback === "down" ? undefined : "down" } : entry) }))} className={`rounded-md p-1.5 transition hover:bg-zinc-100 dark:hover:bg-white/10 ${message.feedback === "down" ? "text-red-500" : "hover:text-zinc-700 dark:hover:text-zinc-200"}`} aria-label={tx({ TR: "Faydalı değil", EN: "Not helpful" })} aria-pressed={message.feedback === "down"}><ThumbsDown className="h-3.5 w-3.5" /></button>
                                                    {message.id === lastAssistant?.id ? (
                                                        <button type="button" onClick={regenerate} disabled={busy} className="rounded-md p-1.5 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-zinc-200" title={tx({ TR: "Yeniden oluştur", EN: "Regenerate" })} aria-label={tx({ TR: "Yeniden oluştur", EN: "Regenerate" })}><RotateCcw className="h-3.5 w-3.5" /></button>
                                                    ) : null}
                                                </span>
                                            </div>
                                        ) : null}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );

    const composer = (
        <div className={`border-t border-zinc-200/80 bg-white/80 backdrop-blur dark:border-white/[0.06] dark:bg-zinc-900/80 ${variant === "page" ? "px-4 pb-4 pt-3 sm:px-8" : "p-3"}`}>
            <div className={`mx-auto ${variant === "page" ? "max-w-3xl" : ""}`}>
                {hasFile ? (
                    <button type="button" onClick={() => setAttachFile((value) => !value)} className={`mb-2 inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-semibold transition ${attachFile ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "bg-zinc-500/10 text-zinc-500 line-through"}`} aria-pressed={attachFile} title={tx({ TR: "Açık dosyayı soruya ekle", EN: "Attach the open file to your question" })}>
                        <Paperclip className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{editorContext?.fileName || tx({ TR: "Açık dosya", EN: "Open file" })}</span>
                    </button>
                ) : null}
                <div className="flex items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-950/60">
                    <textarea
                        ref={inputRef}
                        value={input}
                        rows={1}
                        dir="auto"
                        maxLength={MAX_INPUT}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={mode === "code" ? tx({ TR: "Kod, hata mesajı ya da soru yaz…", EN: "Type code, an error message or a question…" }) : mode === "security" ? tx({ TR: "Bağlantı, kod ya da güvenlik sorusu yapıştır…", EN: "Paste a link, code or a security question…" }) : tx({ TR: "Hanogt AI'a bir şey sor…", EN: "Ask Hanogt AI anything…" })}
                        aria-label={tx({ TR: "Mesaj", EN: "Message" })}
                        className="scrollbar-thin max-h-60 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-[14px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                    />
                    {busy ? (
                        <button type="button" onClick={stop} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900" aria-label={tx({ TR: "Durdur", EN: "Stop" })} title={tx({ TR: "Durdur", EN: "Stop" })}><Square className="h-4 w-4 fill-current" /></button>
                    ) : (
                        <button type="button" onClick={() => void ask(input)} disabled={!input.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white shadow-md shadow-violet-600/25 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none" aria-label={tx({ TR: "Gönder", EN: "Send" })}><Send className={`h-4 w-4 ${dir === "rtl" ? "-scale-x-100" : ""}`} /></button>
                    )}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[10.5px] text-zinc-400">
                    <span className="truncate">{tx({ TR: "Hanogt AI hata yapabilir; önemli bilgileri doğrula. Gizli bilgi paylaşma.", EN: "Hanogt AI can make mistakes; verify important information. Don't share secrets." })}</span>
                    {input.length > MAX_INPUT * 0.8 ? <span className="shrink-0 tabular-nums">{input.length}/{MAX_INPUT}</span> : <span className="hidden shrink-0 sm:inline">{tx({ TR: "Enter: gönder · Shift+Enter: yeni satır", EN: "Enter: send · Shift+Enter: new line" })}</span>}
                </div>
            </div>
        </div>
    );

    if (variant === "panel") {
        return (
            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                role="dialog"
                aria-label="Hanogt AI"
                className="fixed bottom-3 end-3 z-[120] flex h-[min(680px,calc(100dvh-5rem))] w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl shadow-violet-900/20 dark:border-white/10 dark:bg-zinc-900"
            >
                <header className="relative overflow-hidden border-b border-zinc-200/80 px-3.5 pb-3 pt-3.5 dark:border-white/[0.06]">
                    <div className="pointer-events-none absolute -end-10 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 blur-2xl" />
                    <div className="relative flex items-center gap-2.5">
                        <AiAvatar size="h-10 w-10" />
                        <div className="min-w-0 flex-1">
                            <h2 className="flex items-center gap-1.5 font-black tracking-tight text-zinc-900 dark:text-white">Hanogt AI<span className={`h-2 w-2 rounded-full ${signedIn ? "bg-emerald-500" : "bg-amber-500"}`} /></h2>
                            <p className="truncate text-[11.5px] text-zinc-500 dark:text-zinc-400">{engineLabel}</p>
                        </div>
                        <button type="button" onClick={newChat} className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white" title={tx({ TR: "Yeni sohbet", EN: "New chat" })} aria-label={tx({ TR: "Yeni sohbet", EN: "New chat" })}><MessageSquarePlus className="h-4.5 w-4.5" /></button>
                        <Link href="/ai" onClick={onClose} className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white" title={tx({ TR: "Tam ekran aç", EN: "Open full screen" })} aria-label={tx({ TR: "Tam ekran aç", EN: "Open full screen" })}><Maximize2 className="h-4.5 w-4.5" /></Link>
                        <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white" aria-label={tx({ TR: "Kapat", EN: "Close" })}><X className="h-5 w-5" /></button>
                    </div>
                    <div className="relative mt-3">{modeSwitch}</div>
                </header>
                {messageList}
                {composer}
            </motion.div>
        );
    }

    // ------------------------------------------------------------------ full page
    const sidebar = (
        <aside className="flex h-full w-72 shrink-0 flex-col border-e border-zinc-200 bg-zinc-50/80 dark:border-white/[0.06] dark:bg-zinc-950/60">
            <div className="p-3">
                <button type="button" onClick={newChat} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-3 py-2.5 text-[13.5px] font-bold text-white shadow-lg shadow-violet-600/20 transition hover:brightness-110"><MessageSquarePlus className="h-4 w-4" />{tx({ TR: "Yeni sohbet", EN: "New chat" })}</button>
                <label className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-[13px] dark:border-white/10 dark:bg-white/[0.03]">
                    <Search className="h-3.5 w-3.5 text-zinc-400" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx({ TR: "Sohbetlerde ara", EN: "Search chats" })} className="min-w-0 flex-1 bg-transparent outline-none" />
                </label>
            </div>
            <nav className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3" aria-label={tx({ TR: "Sohbetler", EN: "Chats" })}>
                {filtered.length === 0 ? <p className="px-3 py-6 text-center text-[12.5px] text-zinc-400">{tx({ TR: "Henüz sohbet yok.", EN: "No chats yet." })}</p> : null}
                {filtered.map((conversation, index) => {
                    const ModeIcon = MODES.find((entry) => entry.id === conversation.mode)?.icon ?? Sparkles;
                    const day = relativeDay(conversation.updatedAt, locale, tx);
                    const previousDay = index > 0 ? relativeDay(filtered[index - 1].updatedAt, locale, tx) : null;
                    return (
                        <div key={conversation.id}>
                            {day !== previousDay ? <p className="px-3 pb-1 pt-3 text-[10.5px] font-black uppercase tracking-wider text-zinc-400">{day}</p> : null}
                            <div className={`group flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] transition ${conversation.id === activeId ? "bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-white/[0.07] dark:ring-white/10" : "hover:bg-white/70 dark:hover:bg-white/[0.04]"}`}>
                                <ModeIcon className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                                {renaming?.id === conversation.id ? (
                                    <input
                                        autoFocus
                                        value={renaming.title}
                                        onChange={(event) => setRenaming({ id: conversation.id, title: event.target.value.slice(0, 80) })}
                                        onBlur={() => { update(conversation.id, (current) => ({ ...current, title: renaming.title.trim() || current.title })); setRenaming(null); }}
                                        onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") setRenaming(null); }}
                                        className="min-w-0 flex-1 rounded-md bg-white px-1 outline-none ring-2 ring-violet-400 dark:bg-zinc-900"
                                    />
                                ) : (
                                    <button type="button" onClick={() => { setActiveConversation(conversation.id); setSidebarOpen(false); }} className="min-w-0 flex-1 truncate text-start font-semibold text-zinc-700 dark:text-zinc-200">{conversation.title || tx({ TR: "Yeni sohbet", EN: "New chat" })}</button>
                                )}
                                <button type="button" onClick={() => setRenaming({ id: conversation.id, title: conversation.title })} className="rounded-md p-1 text-zinc-400 opacity-0 transition hover:text-zinc-700 group-hover:opacity-100 focus:opacity-100 dark:hover:text-zinc-200" aria-label={tx({ TR: "Yeniden adlandır", EN: "Rename" })}><Pencil className="h-3.5 w-3.5" /></button>
                                <button type="button" onClick={() => { if (window.confirm(tx({ TR: "Bu sohbet silinsin mi?", EN: "Delete this chat?" }))) remove(conversation.id); }} className="rounded-md p-1 text-zinc-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100 focus:opacity-100" aria-label={tx({ TR: "Sil", EN: "Delete" })}><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                        </div>
                    );
                })}
            </nav>
            <div className="space-y-2 border-t border-zinc-200 p-3 text-[11.5px] text-zinc-500 dark:border-white/[0.06] dark:text-zinc-400">
                <p className="flex items-start gap-1.5"><Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />{tx({ TR: "Sohbetlerin yalnızca bu tarayıcıda saklanır.", EN: "Your chats are stored only in this browser." })}</p>
                <p className="flex items-start gap-1.5"><Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />{tx({ TR: "Çekirdek modeli: {intents} niyet, test doğruluğu %{accuracy}", EN: "Core model: {intents} intents, {accuracy}% test accuracy" }, { intents: CORE_INFO.intents, accuracy: CORE_INFO.quantizedTestAccuracy })}</p>
                {conversations.length ? <button type="button" onClick={() => { if (window.confirm(tx({ TR: "Tüm sohbetler silinsin mi?", EN: "Delete all chats?" }))) clearAll(); }} className="font-semibold text-red-500 hover:underline">{tx({ TR: "Tüm sohbetleri sil", EN: "Delete all chats" })}</button> : null}
            </div>
        </aside>
    );

    return (
        <div className="flex h-[calc(100dvh-4rem)] overflow-hidden">
            <div className="hidden lg:flex">{sidebar}</div>
            <AnimatePresence>
                {sidebarOpen ? (
                    <motion.div className="fixed inset-0 z-50 flex bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)}>
                        <motion.div initial={{ x: dir === "rtl" ? 300 : -300 }} animate={{ x: 0 }} exit={{ x: dir === "rtl" ? 300 : -300 }} transition={{ type: "spring", stiffness: 340, damping: 34 }} onClick={(event) => event.stopPropagation()} className="h-full bg-white dark:bg-zinc-950">{sidebar}</motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
            <section className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900/40">
                <div className="flex items-center gap-3 border-b border-zinc-200/80 px-4 py-3 dark:border-white/[0.06] sm:px-6">
                    <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-xl p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden dark:text-zinc-300 dark:hover:bg-white/10" aria-label={tx({ TR: "Sohbetler", EN: "Chats" })}><MenuIcon className="h-5 w-5" /></button>
                    <AiAvatar size="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate font-black tracking-tight text-zinc-900 dark:text-white">{active?.title || "Hanogt AI"}</h1>
                        <p className="flex items-center gap-1.5 truncate text-[11.5px] text-zinc-500 dark:text-zinc-400"><span className={`h-1.5 w-1.5 rounded-full ${signedIn ? "bg-emerald-500" : "bg-amber-500"}`} />{engineLabel}</p>
                    </div>
                    <div className="hidden w-80 sm:block">{modeSwitch}</div>
                </div>
                <div className="border-b border-zinc-200/80 px-4 py-2 sm:hidden dark:border-white/[0.06]">{modeSwitch}</div>
                {messageList}
                {composer}
            </section>
        </div>
    );
}
