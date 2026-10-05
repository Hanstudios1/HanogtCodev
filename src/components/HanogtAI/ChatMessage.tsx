"use client";

import { motion } from "framer-motion";
import { Check, Copy as CopyIcon, Cpu, FileCode2, KeyRound, Pencil, Play, RotateCcw, Scissors, Sparkles, Square, SquareArrowOutUpRight, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { AgentMode } from "@/lib/ai/agent-tools";
import type { AiMessage } from "@/lib/ai/conversations";
import type { ApplyStatus } from "@/lib/ai/editor-apply";
import type { ThinkingStep } from "@/lib/ai/thinking";
import { useI18n } from "@/lib/i18n";
import { languageDisplayName } from "@/lib/runtimes/languages";
import AgentCard from "./AgentCard";
import type { ChatArtifact } from "./artifacts";
import ChangesCard from "./ChangesCard";
import { CHAT_COPY } from "./chat-copy";
import Markdown from "./Markdown";
import { proposalOf } from "./proposals";
import ThinkingPanel from "./ThinkingPanel";
import { AiAvatar, cx, ICON_BUTTON } from "./ui";
import { useSpeech, useVoice, type SpeechOptions } from "./voice";

const C = {
    typing: { TR: "Yazıyor", EN: "Typing" },
    copy: { TR: "Kopyala", EN: "Copy" },
    copied: { TR: "Kopyalandı", EN: "Copied" },
    helpful: { TR: "Faydalı", EN: "Helpful" },
    notHelpful: { TR: "Faydalı değil", EN: "Not helpful" },
    regenerate: { TR: "Yeniden oluştur", EN: "Regenerate" },
    readAloud: { TR: "Sesli oku (erken erişim)", EN: "Read aloud (early access)" },
    stopReading: { TR: "Okumayı durdur", EN: "Stop reading" },
    codeBlock: { TR: "Kod bloğu.", EN: "Code block." },
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
    cutLength: { TR: "Yanıt uzunluk sınırına ulaştığı için burada kesildi.", EN: "The answer stopped here because it reached its length limit." },
    cutTimeout: { TR: "Yanıt süre sınırına ulaştığı için burada kesildi.", EN: "The answer stopped here because it ran out of time." },
    cutError: { TR: "Yanıt bir bağlantı hatası yüzünden yarıda kaldı.", EN: "The answer was interrupted by a connection error." },
    continue: { TR: "Devam et", EN: "Continue" },
    continueHint: { TR: "Kaldığı yerden devam eder (1 mesaj sayılır).", EN: "Picks up where it stopped (counts as 1 message)." },
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
    /** Continues an answer that was cut (only the last answer). */
    onContinue?: () => void;
    /** While this answer streams: the model's thinking and the steps so far. */
    live?: { text: string; steps: ThinkingStep[]; seconds: number | null };
    /** An editor with the file is on this page ("Apply to editor"). */
    editorPresent?: boolean;
    onApplyEdit?: (force: boolean) => ApplyStatus | "none";
    onDismissEdit?: () => void;
    /** Answers in a serif (paper) or a sans-serif face. */
    answerFont?: "serif" | "sans";
    /** How answers are read aloud. */
    speechOptions?: SpeechOptions;
}

function UserMessage({ message, editable, onEdit }: { message: AiMessage; editable: boolean; onEdit: (text: string) => void }) {
    const { tx } = useI18n();
    const [editing, setEditing] = useState<string | null>(null);
    const content = message.content.length > 4_000 ? `${message.content.slice(0, 4_000)}…` : message.content;
    if (editing !== null) {
        return (
            <div className="flex justify-end">
                <form
                    className="w-full max-w-[92%] rounded-3xl border border-ai-line bg-ai-surface p-2 shadow-sm"
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
                        className="block w-full resize-none bg-transparent px-2 py-1.5 text-[14px] text-ai-ink outline-none"
                    />
                    <div className="flex justify-end gap-2 px-1 pb-0.5 pt-1">
                        <button type="button" onClick={() => setEditing(null)} className="rounded-xl px-3 py-1.5 text-[12.5px] font-semibold text-ai-ink/75 hover:bg-ai-ink/[0.05]">{tx(C.cancel)}</button>
                        <button type="submit" disabled={!editing.trim()} className="rounded-xl bg-ai-ink px-3 py-1.5 text-[12.5px] font-semibold text-ai-paper hover:opacity-90 disabled:opacity-40">{tx(C.save)}</button>
                    </div>
                </form>
            </div>
        );
    }
    return (
        <div className="group flex flex-col items-end gap-1">
            <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl bg-ai-ink/[0.06] px-4 py-2.5 text-[14px] leading-relaxed text-ai-ink" dir="auto">
                {content}
            </div>
            {message.attachment ? (
                <span className="inline-flex max-w-[88%] items-center gap-1.5 truncate rounded-lg bg-brand-green/10 px-2 py-1 text-[11.5px] font-semibold text-brand-green">
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

/**
 * One message of the conversation: questions in a soft bubble; answers as
 * plain text on the paper (no bubble, no avatar), their work steps and
 * thinking above them, the change they propose for the open file, and a quiet
 * action row that starts with the logo under the newest answer.
 */
export default function ChatMessage(props: ChatMessageProps) {
    const { message, streamingText, variant, busy, isLastAssistant, isLastUser, agentMode, signedIn } = props;
    const { tx, language } = useI18n();
    const [copied, setCopied] = useState(false);
    const voice = useVoice();
    const speech = useSpeech();

    if (message.role === "user") {
        return (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <UserMessage message={message} editable={isLastUser && !busy} onEdit={props.onEdit} />
            </motion.div>
        );
    }

    const isStreaming = streamingText !== null;
    const content = isStreaming ? streamingText : message.content;
    // An answer about a file: the change it proposes (once it's complete), for the "Changes" card.
    const edit = message.edit;
    const proposal = !isStreaming && edit ? proposalOf(message) : null;
    // Which model answered (stored values are re-checked: they come from localStorage).
    const model = typeof message.model === "string" ? message.model : "";
    const viaConnection = message.engine === "llm" && typeof message.connectionId === "string";
    const connectionName = [typeof message.connectionLabel === "string" ? message.connectionLabel : "", model].filter(Boolean).join(" · ");
    const badgeTitle = viaConnection
        ? tx(C.ownTitle, { name: connectionName || tx(C.own) })
        : message.engine === "llm" ? (model ? tx(C.llmModelTitle, { model }) : tx(C.llmTitle)) : tx(C.coreTitle);
    const cutNote = !isStreaming && message.cut ? (message.cut === "length" ? C.cutLength : message.cut === "timeout" ? C.cutTimeout : C.cutError) : null;
    const live = isStreaming && props.live ? { ...props.live, answering: Boolean(content) } : undefined;
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
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group" data-ai-answer>
            <div className="min-w-0 space-y-3">
                {message.notice ? (
                    <p className="w-fit max-w-full rounded-lg bg-amber-500/10 px-2 py-1 text-[11.5px] font-semibold leading-relaxed text-amber-700 dark:text-amber-300" data-ai-notice>
                        <Cpu className="me-1.5 inline h-3 w-3 align-[-1px]" aria-hidden />
                        {message.notice}
                        {message.noticeAction === "plans" ? <> <Link href="/plans" onClick={props.onNavigate} className="whitespace-nowrap font-bold text-brand-green underline underline-offset-2" data-notice-plans>{tx(CHAT_COPY.upgrade)}</Link></> : null}
                        {message.noticeAction === "signin" ? <> <Link href="/login?callbackUrl=%2Fai" onClick={props.onNavigate} className="whitespace-nowrap font-bold text-brand-green underline underline-offset-2" data-notice-signin>{tx(CHAT_COPY.signIn)}</Link></> : null}
                    </p>
                ) : null}
                <ThinkingPanel thinking={isStreaming ? undefined : message.thinking} live={live} variant={variant} />
                {content || !isStreaming || live ? (
                    <div className={cx("leading-relaxed text-ai-ink", props.answerFont === "sans" ? (variant === "page" ? "text-[15px]" : "text-[13.5px]") : cx("font-serif", variant === "page" ? "text-[16.5px]" : "text-[14.5px]"), message.error && "text-red-600 dark:text-red-400")} data-answer-font={props.answerFont ?? "serif"}>
                        {content ? <Markdown text={content} onNavigate={props.onNavigate} onOpenInEditor={props.onOpenInEditor} onOpenArtifact={props.onOpenArtifact} /> : null}
                        {isStreaming && content ? <span className="ms-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-ai-ink/70 align-text-bottom motion-reduce:animate-none" aria-hidden /> : null}
                    </div>
                ) : (
                    <span className="inline-flex items-center gap-2 py-1.5 text-[12.5px] text-ai-muted" role="status" aria-label={tx(C.typing)}>
                        <span className="animate-pulse motion-reduce:animate-none"><AiAvatar size={22} /></span>
                    </span>
                )}
                {cutNote ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/[0.07] px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200" data-ai-cut={message.cut}>
                        <Scissors className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">{tx(cutNote)}</span>
                        {isLastAssistant && props.onContinue ? (
                            <button type="button" onClick={props.onContinue} disabled={busy} title={tx(C.continueHint)} className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 font-bold text-amber-900 transition hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-100" data-ai-continue>
                                <Play className="h-3 w-3" aria-hidden />{tx(C.continue)}
                            </button>
                        ) : null}
                    </div>
                ) : null}
                {edit && proposal && props.onApplyEdit && props.onDismissEdit ? (
                    <ChangesCard edit={edit} proposal={proposal} editorPresent={props.editorPresent === true} onApply={props.onApplyEdit} onDismiss={props.onDismissEdit} onOpenInEditor={props.onOpenInEditor} />
                ) : null}
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
                    <div className="flex flex-wrap items-center gap-1 text-[11px] text-ai-muted">
                        {isLastAssistant ? <span className="me-1.5" aria-hidden><AiAvatar size={20} /></span> : null}
                        <span className={cx("me-1 inline-flex max-w-[14rem] items-center gap-1 rounded-full px-2 py-0.5 font-bold", viaConnection ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : message.engine === "llm" ? "bg-brand-green/10 text-brand-green" : "bg-ai-ink/[0.06] text-ai-muted")} title={badgeTitle} data-ai-engine={message.engine === "llm" && !viaConnection ? "hanogt" : undefined}>
                            {viaConnection ? <KeyRound className="h-3 w-3 shrink-0" aria-hidden /> : message.engine === "llm" ? <Sparkles className="h-3 w-3 shrink-0" aria-hidden /> : <Cpu className="h-3 w-3 shrink-0" aria-hidden />}
                            <span className="truncate">{viaConnection ? model || tx(C.own) : tx(message.engine === "llm" ? C.llm : C.core)}</span>
                        </span>
                        {message.sources?.map((source) => (
                            <Link key={source.href} href={source.href} onClick={props.onNavigate} className="rounded-full border border-ai-line px-2 py-0.5 font-semibold text-ai-muted transition hover:border-ai-ink/30 hover:text-ai-ink">{source.title}</Link>
                        ))}
                        <span className={cx("ms-auto flex items-center gap-0.5 transition", !isLastAssistant && "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100")}>
                            {message.code ? (
                                <button type="button" onClick={() => props.onOpenInEditor(message.code!.language, message.code!.code)} className={ICON_BUTTON} title={tx(C.openInEditor)} aria-label={tx(C.openInEditor)}><SquareArrowOutUpRight className="h-3.5 w-3.5" /></button>
                            ) : null}
                            <button type="button" onClick={() => void copy()} className={ICON_BUTTON} title={tx(copied ? C.copied : C.copy)} aria-label={tx(copied ? C.copied : C.copy)}>{copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <CopyIcon className="h-3.5 w-3.5" />}</button>
                            {voice.speech ? (
                                <button
                                    type="button"
                                    onClick={() => (speech.speakingId === message.id ? speech.stop() : speech.speak(message.id, message.content, language, tx(C.codeBlock), props.speechOptions))}
                                    className={cx(ICON_BUTTON, speech.speakingId === message.id && "text-brand-green")}
                                    title={tx(speech.speakingId === message.id ? C.stopReading : C.readAloud)}
                                    aria-label={tx(speech.speakingId === message.id ? C.stopReading : C.readAloud)}
                                    aria-pressed={speech.speakingId === message.id}
                                    data-ai-read-aloud={speech.speakingId === message.id ? "speaking" : "idle"}
                                >
                                    {speech.speakingId === message.id ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                                </button>
                            ) : null}
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
