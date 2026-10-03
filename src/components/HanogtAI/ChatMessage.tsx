"use client";

import { motion } from "framer-motion";
import { Check, Copy as CopyIcon, Cpu, FileCode2, KeyRound, Pencil, RotateCcw, Sparkles, SquareArrowOutUpRight, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { AgentMode } from "@/lib/ai/agent-tools";
import type { AiMessage } from "@/lib/ai/conversations";
import { useI18n } from "@/lib/i18n";
import { languageDisplayName } from "@/lib/runtimes/languages";
import AgentCard from "./AgentCard";
import type { ChatArtifact } from "./artifacts";
import { CHAT_COPY } from "./chat-copy";
import Markdown from "./Markdown";
import { AiAvatar, cx, ICON_BUTTON } from "./ui";

const C = {
    typing: { TR: "Yazıyor", EN: "Typing" },
    copy: { TR: "Kopyala", EN: "Copy" },
    copied: { TR: "Kopyalandı", EN: "Copied" },
    helpful: { TR: "Faydalı", EN: "Helpful" },
    notHelpful: { TR: "Faydalı değil", EN: "Not helpful" },
    regenerate: { TR: "Yeniden oluştur", EN: "Regenerate" },
    openInEditor: { TR: "Editörde aç", EN: "Open in editor" },
    edit: { TR: "Mesajı düzenle", EN: "Edit message" },
    editLabel: { TR: "Mesajını düzenle", EN: "Edit your message" },
    save: { TR: "Gönder", EN: "Send" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    llm: { TR: "LLM", EN: "LLM" },
    core: { TR: "Çekirdek", EN: "Core" },
    llmTitle: { TR: "Sunucudaki büyük dil modeli", EN: "Large language model on the server" },
    llmModelTitle: { TR: "Sunucudaki büyük dil modeli: {model}", EN: "Large language model on the server: {model}" },
    own: { TR: "Bağlantın", EN: "Your connection" },
    ownTitle: { TR: "Kendi bağlantınla yanıtlandı: {name}", EN: "Answered through your own connection: {name}" },
    coreTitle: { TR: "Cihazında çalışan eğitilmiş Hanogt AI Çekirdeği", EN: "Trained Hanogt AI Core running on your device" },
    attached: { TR: "Ekli dosya: {name} ({language})", EN: "Attached file: {name} ({language})" },
};

export interface ChatMessageProps {
    message: AiMessage;
    /** Text streamed so far when this message is being written. */
    streamingText: string | null;
    variant: "panel" | "page";
    busy: boolean;
    isLastAssistant: boolean;
    isLastUser: boolean;
    agentMode: AgentMode;
    signedIn: boolean;
    onFeedback: (value: "up" | "down") => void;
    onRegenerate: () => void;
    onEdit: (text: string) => void;
    onApprove: (callId: string, args: Record<string, unknown>, remember: boolean) => void;
    onDeny: (callId: string) => void;
    onOpenInEditor: (language: string, code: string) => void;
    onOpenArtifact: (artifact: ChatArtifact) => void;
    onNavigate?: () => void;
}

function UserMessage({ message, editable, onEdit }: { message: AiMessage; editable: boolean; onEdit: (text: string) => void }) {
    const { tx } = useI18n();
    const [editing, setEditing] = useState<string | null>(null);
    const content = message.content.length > 4_000 ? `${message.content.slice(0, 4_000)}…` : message.content;
    if (editing !== null) {
        return (
            <div className="flex justify-end">
                <form
                    className="w-full max-w-[92%] rounded-3xl border border-violet-300 bg-white p-2 shadow-sm dark:border-violet-400/30 dark:bg-zinc-900"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!editing.trim()) return;
                        onEdit(editing);
                        setEditing(null);
                    }}
                >
                    <textarea
                        autoFocus
                        value={editing}
                        dir="auto"
                        rows={Math.min(8, Math.max(2, editing.split("\n").length))}
                        aria-label={tx(C.editLabel)}
                        onChange={(event) => setEditing(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") setEditing(null);
                            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                event.currentTarget.form?.requestSubmit();
                            }
                        }}
                        className="block w-full resize-none bg-transparent px-2 py-1.5 text-[14px] text-zinc-800 outline-none dark:text-zinc-100"
                    />
                    <div className="flex justify-end gap-2 px-1 pb-0.5 pt-1">
                        <button type="button" onClick={() => setEditing(null)} className="rounded-xl px-3 py-1.5 text-[12.5px] font-semibold text-zinc-600 hover:bg-zinc-900/[0.05] dark:text-zinc-300 dark:hover:bg-white/10">{tx(C.cancel)}</button>
                        <button type="submit" disabled={!editing.trim()} className="rounded-xl bg-zinc-900 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">{tx(C.save)}</button>
                    </div>
                </form>
            </div>
        );
    }
    return (
        <div className="group flex flex-col items-end gap-1">
            <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-3xl bg-zinc-100 px-4 py-2.5 text-[14px] leading-relaxed text-zinc-800 dark:bg-white/[0.07] dark:text-zinc-100" dir="auto">
                {content}
            </div>
            {message.attachment ? (
                <span className="inline-flex max-w-[88%] items-center gap-1.5 truncate rounded-lg bg-violet-500/10 px-2 py-1 text-[11.5px] font-semibold text-violet-700 dark:text-violet-300">
                    <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{tx(C.attached, { name: message.attachment.name, language: languageDisplayName(message.attachment.language) })}</span>
                </span>
            ) : null}
            {editable ? (
                <button type="button" onClick={() => setEditing(message.content)} className={cx(ICON_BUTTON, "opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100")} title={tx(C.edit)} aria-label={tx(C.edit)}>
                    <Pencil className="h-3.5 w-3.5" />
                </button>
            ) : null}
        </div>
    );
}

/** One message of the conversation, Claude-style: questions in a soft bubble, answers as plain text with a quiet action row. */
export default function ChatMessage(props: ChatMessageProps) {
    const { message, streamingText, variant, busy, isLastAssistant, isLastUser, agentMode, signedIn } = props;
    const { tx } = useI18n();
    const [copied, setCopied] = useState(false);

    if (message.role === "user") {
        return (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <UserMessage message={message} editable={isLastUser && !busy} onEdit={props.onEdit} />
            </motion.div>
        );
    }

    const isStreaming = streamingText !== null;
    const content = isStreaming ? streamingText : message.content;
    // Which model answered (stored values are re-checked: they come from localStorage).
    const model = typeof message.model === "string" ? message.model : "";
    const viaConnection = message.engine === "llm" && typeof message.connectionId === "string";
    const connectionName = [typeof message.connectionLabel === "string" ? message.connectionLabel : "", model].filter(Boolean).join(" · ");
    const badgeTitle = viaConnection
        ? tx(C.ownTitle, { name: connectionName || tx(C.own) })
        : message.engine === "llm" ? (model ? tx(C.llmModelTitle, { model }) : tx(C.llmTitle)) : tx(C.coreTitle);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group flex gap-3">
            <div className="pt-0.5"><AiAvatar size={variant === "page" ? "h-7 w-7" : "h-6 w-6"} /></div>
            <div className="min-w-0 flex-1 space-y-3">
                {message.notice ? (
                    <p className="w-fit max-w-full rounded-lg bg-amber-500/10 px-2 py-1 text-[11.5px] font-semibold leading-relaxed text-amber-700 dark:text-amber-300" data-ai-notice>
                        <Cpu className="me-1.5 inline h-3 w-3 align-[-1px]" aria-hidden />
                        {message.notice}
                        {message.noticeAction === "plans" ? <> <Link href="/plans" onClick={props.onNavigate} className="whitespace-nowrap font-bold text-violet-700 underline underline-offset-2 dark:text-violet-300" data-notice-plans>{tx(CHAT_COPY.upgrade)}</Link></> : null}
                    </p>
                ) : null}
                {content || !isStreaming ? (
                    <div className={cx("leading-relaxed text-zinc-800 dark:text-zinc-100", variant === "page" ? "text-[15px]" : "text-[13.5px]", message.error && "text-red-600 dark:text-red-400")}>
                        {content ? <Markdown text={content} onNavigate={props.onNavigate} onOpenInEditor={props.onOpenInEditor} onOpenArtifact={props.onOpenArtifact} /> : null}
                        {isStreaming && content ? <span className="ms-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-violet-500 align-text-bottom" aria-hidden /> : null}
                    </div>
                ) : (
                    <span className="inline-flex gap-1 py-2" role="status" aria-label={tx(C.typing)}>
                        {[0, 1, 2].map((dot) => <motion.span key={dot} className="h-2 w-2 rounded-full bg-violet-500" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15 }} />)}
                    </span>
                )}
                {message.agent?.calls.length ? (
                    <div className="space-y-2">
                        {message.agent.calls.map((call) => (
                            <AgentCard
                                key={call.id}
                                call={call}
                                agentMode={agentMode}
                                signedIn={signedIn}
                                onApprove={(args, remember) => props.onApprove(call.id, args, remember)}
                                onDeny={() => props.onDeny(call.id)}
                                onNavigate={props.onNavigate}
                            />
                        ))}
                    </div>
                ) : null}
                {!isStreaming && message.content ? (
                    <div className="flex flex-wrap items-center gap-1 text-[11px] text-zinc-400">
                        <span className={cx("me-1 inline-flex max-w-[14rem] items-center gap-1 rounded-full px-2 py-0.5 font-bold", viaConnection ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : message.engine === "llm" ? "bg-violet-500/10 text-violet-600 dark:text-violet-300" : "bg-zinc-500/10 text-zinc-500")} title={badgeTitle}>
                            {viaConnection ? <KeyRound className="h-3 w-3 shrink-0" aria-hidden /> : message.engine === "llm" ? <Sparkles className="h-3 w-3 shrink-0" aria-hidden /> : <Cpu className="h-3 w-3 shrink-0" aria-hidden />}
                            <span className="truncate">{viaConnection ? model || tx(C.own) : tx(message.engine === "llm" ? C.llm : C.core)}</span>
                        </span>
                        {message.sources?.map((source) => (
                            <Link key={source.href} href={source.href} onClick={props.onNavigate} className="rounded-full border border-zinc-200 px-2 py-0.5 font-semibold text-zinc-500 transition hover:border-violet-400 hover:text-violet-600 dark:border-white/10 dark:hover:text-violet-300">{source.title}</Link>
                        ))}
                        <span className={cx("ms-auto flex items-center gap-0.5 transition", !isLastAssistant && "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100")}>
                            {message.code ? (
                                <button type="button" onClick={() => props.onOpenInEditor(message.code!.language, message.code!.code)} className={ICON_BUTTON} title={tx(C.openInEditor)} aria-label={tx(C.openInEditor)}><SquareArrowOutUpRight className="h-3.5 w-3.5" /></button>
                            ) : null}
                            <button type="button" onClick={() => void copy()} className={ICON_BUTTON} title={tx(copied ? C.copied : C.copy)} aria-label={tx(copied ? C.copied : C.copy)}>{copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <CopyIcon className="h-3.5 w-3.5" />}</button>
                            <button type="button" onClick={() => props.onFeedback("up")} className={cx(ICON_BUTTON, message.feedback === "up" && "text-emerald-500 dark:text-emerald-400")} title={tx(C.helpful)} aria-label={tx(C.helpful)} aria-pressed={message.feedback === "up"}><ThumbsUp className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => props.onFeedback("down")} className={cx(ICON_BUTTON, message.feedback === "down" && "text-red-500 dark:text-red-400")} title={tx(C.notHelpful)} aria-label={tx(C.notHelpful)} aria-pressed={message.feedback === "down"}><ThumbsDown className="h-3.5 w-3.5" /></button>
                            {isLastAssistant ? (
                                <button type="button" onClick={props.onRegenerate} disabled={busy} className={ICON_BUTTON} title={tx(C.regenerate)} aria-label={tx(C.regenerate)}><RotateCcw className="h-3.5 w-3.5" /></button>
                            ) : null}
                        </span>
                    </div>
                ) : null}
            </div>
        </motion.div>
    );
}
