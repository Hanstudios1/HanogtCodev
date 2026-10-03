"use client";

import { Mic, MicOff, Send, Smile, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useVoiceRecorder, type MicErrorCode } from "@/components/Groups/workspace/hooks";
import { Spinner, cx } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import { DM_STICKERS, SOCIAL_LIMITS, type DmMessage } from "@/lib/social/model";

const C = {
    placeholder: { TR: "@{name} kişisine mesaj gönder", EN: "Message @{name}" },
    label: { TR: "{name} kişisine mesaj", EN: "Message to {name}" },
    send: { TR: "Gönder", EN: "Send" },
    stickers: { TR: "Çıkartma gönder", EN: "Send a sticker" },
    stickerList: { TR: "Çıkartmalar", EN: "Stickers" },
    record: { TR: "Sesli mesaj kaydet", EN: "Record a voice message" },
    stopRecord: { TR: "Kaydı bitir ve gönder", EN: "Stop and send" },
    recording: { TR: "Kaydediliyor {seconds}/{limit} sn", EN: "Recording {seconds}/{limit}s" },
    discard: { TR: "Vazgeç", EN: "Discard" },
    replying: { TR: "{name} kişisine yanıt veriliyor", EN: "Replying to {name}" },
    cancelReply: { TR: "Yanıtı iptal et", EN: "Cancel reply" },
    chars: { TR: "{count}/{max}", EN: "{count}/{max}" },
    typing: { TR: "{name} yazıyor…", EN: "{name} is typing…" },
} satisfies Record<string, Copy>;

type ComposerProps = {
    partnerName: string;
    /** When set, the composer is replaced by this notice (not friends, blocked…). */
    disabled: ReactNode;
    typing: boolean;
    replyTo: DmMessage | null;
    replyAuthor: string;
    onCancelReply: () => void;
    onSend: (text: string) => Promise<boolean>;
    onSticker: (emoji: string) => void;
    onVoice: (blob: Blob, mimeType: string, seconds: number) => void;
    /** The microphone couldn't be used (denied, missing or busy). */
    onVoiceError: (code: MicErrorCode) => void;
    onTyping: (text: string) => void;
    /** ArrowUp in an empty box edits the last own message (like Discord). */
    onEditLast: () => void;
    focusNonce: number;
};

export default function DmComposer(props: ComposerProps) {
    const { partnerName, disabled, typing, replyTo, replyAuthor, onCancelReply, onSend, onSticker, onVoice, onVoiceError, onTyping, onEditLast, focusNonce } = props;
    const { tx } = useI18n();
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [stickers, setStickers] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const stickerRef = useRef<HTMLDivElement | null>(null);

    const recorder = useVoiceRecorder({
        onRecorded: (blob, mimeType, seconds) => onVoice(blob, mimeType, seconds),
        onError: (code) => onVoiceError(code),
    });

    useEffect(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
    }, [draft]);

    useEffect(() => {
        if (focusNonce) textareaRef.current?.focus();
    }, [focusNonce]);

    useEffect(() => {
        if (!stickers) return;
        const onPointer = (event: PointerEvent) => {
            if (stickerRef.current && event.target instanceof Node && !stickerRef.current.contains(event.target)) setStickers(false);
        };
        document.addEventListener("pointerdown", onPointer);
        return () => document.removeEventListener("pointerdown", onPointer);
    }, [stickers]);

    const send = async () => {
        const text = draft.trim();
        if (!text || sending) return;
        setSending(true);
        setDraft("");
        const sent = await onSend(text.slice(0, SOCIAL_LIMITS.messageMax));
        if (!sent) setDraft(text);
        setSending(false);
        window.requestAnimationFrame(() => textareaRef.current?.focus());
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Escape" && replyTo) {
            event.preventDefault();
            event.stopPropagation();
            onCancelReply();
            return;
        }
        if (event.key === "ArrowUp" && !draft) {
            event.preventDefault();
            onEditLast();
            return;
        }
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            // On touch keyboards Enter inserts a new line; the send button sends.
            if (window.matchMedia("(pointer: coarse)").matches) return;
            event.preventDefault();
            void send();
        }
    };

    if (disabled) {
        return <div className="shrink-0 px-4 pb-4 pt-1"><div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">{disabled}</div></div>;
    }

    return (
        <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
            <p className="mb-1 h-4 truncate px-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400" aria-live="polite">
                {typing && <><span className="me-1 inline-flex gap-0.5 align-middle" aria-hidden>{[0, 150, 300].map((delay) => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${delay}ms` }} />)}</span>{tx(C.typing, { name: partnerName })}</>}
            </p>
            {replyTo && (
                <div className="flex items-center gap-2 rounded-t-xl border border-b-0 border-zinc-200 bg-zinc-100 px-3 py-2 text-[13px] text-zinc-600 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">
                    <span className="min-w-0 flex-1 truncate">{tx(C.replying, { name: replyAuthor })} <span className="text-zinc-400">— {replyTo.text.slice(0, 80)}</span></span>
                    <button type="button" onClick={onCancelReply} className="rounded-full p-0.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.cancelReply)}><X className="h-4 w-4" aria-hidden /></button>
                </div>
            )}
            {recorder.recording ? (
                <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2">
                    <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" /></span>
                    <span className="flex-1 text-sm font-bold tabular-nums text-red-700 dark:text-red-300" role="status">{tx(C.recording, { seconds: recorder.seconds, limit: recorder.limit })}</span>
                    <button type="button" onClick={() => recorder.stop(true)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800"><Trash2 className="me-1 inline h-4 w-4" aria-hidden />{tx(C.discard)}</button>
                    <button type="button" onClick={() => recorder.stop(false)} className="rounded-lg bg-red-600 p-2.5 text-white hover:bg-red-500" aria-label={tx(C.stopRecord)} title={tx(C.stopRecord)}><MicOff className="h-5 w-5" aria-hidden /></button>
                </div>
            ) : (
                <div className={cx("relative flex items-end gap-1 border border-zinc-200 bg-zinc-100 px-1.5 py-1.5 dark:border-white/10 dark:bg-zinc-950", replyTo ? "rounded-b-xl" : "rounded-xl")}>
                    <div ref={stickerRef} className="relative">
                        <button type="button" onClick={() => setStickers((value) => !value)} aria-expanded={stickers} aria-haspopup="true" className={cx("rounded-lg p-2 transition", stickers ? "text-indigo-600 dark:text-indigo-300" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white")} aria-label={tx(C.stickers)} title={tx(C.stickers)}>
                            <Smile className="h-5 w-5" aria-hidden />
                        </button>
                        {stickers && (
                            <div role="group" aria-label={tx(C.stickerList)} className="absolute bottom-full start-0 z-30 mb-2 grid w-[min(20rem,calc(100vw-3rem))] grid-cols-8 gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-white/10 dark:bg-zinc-900" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setStickers(false); } }}>
                                {DM_STICKERS.map((emoji) => (
                                    <button key={emoji} type="button" onClick={() => { setStickers(false); onSticker(emoji); }} className="rounded-lg p-1.5 text-xl leading-none transition hover:scale-110 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={emoji}>{emoji}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    <textarea
                        ref={textareaRef}
                        value={draft}
                        rows={1}
                        maxLength={SOCIAL_LIMITS.messageMax}
                        onChange={(event) => { setDraft(event.target.value); onTyping(event.target.value); }}
                        onKeyDown={onKeyDown}
                        placeholder={tx(C.placeholder, { name: partnerName })}
                        aria-label={tx(C.label, { name: partnerName })}
                        className="max-h-[200px] min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-6 outline-none placeholder:text-zinc-400"
                    />
                    {draft.trim() ? (
                        <button type="button" onClick={() => void send()} disabled={sending} className="rounded-lg bg-indigo-600 p-2 text-white transition hover:bg-indigo-500 disabled:opacity-50" aria-label={tx(C.send)} title={tx(C.send)}>
                            {sending ? <Spinner className="h-5 w-5" /> : <Send className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}
                        </button>
                    ) : (
                        <button type="button" onClick={() => void recorder.start()} className="rounded-lg p-2 text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white" aria-label={tx(C.record)} title={tx(C.record)}>
                            <Mic className="h-5 w-5" aria-hidden />
                        </button>
                    )}
                </div>
            )}
            {draft.length > SOCIAL_LIMITS.messageMax - 500 && <p className="mt-1 text-end text-[11px] tabular-nums text-amber-600">{tx(C.chars, { count: draft.length, max: SOCIAL_LIMITS.messageMax })}</p>}
        </div>
    );
}
