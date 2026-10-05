"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AtSign, Hash, MicOff, Mic, Send, Smile, Sticker, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Spinner, UserAvatar, cx } from "@/components/Groups/ui";
import { useVoiceRecorder, type MicErrorCode } from "@/components/Groups/workspace/hooks";
import { useI18n, type Copy } from "@/lib/i18n";
import { applySuggestion, findTrigger, type ComposerTrigger } from "@/lib/social/composer";
import { searchEmoji } from "@/lib/social/emoji";
import type { GifItem } from "@/lib/social/gif";
import { useAudioDevices } from "@/lib/social/local-state";
import { VOICE_BITRATE, enterAction, type SocialPrefs } from "@/lib/social/prefs";
import ExpressionPicker, { rememberEmoji, type ExpressionTab } from "./ExpressionPicker";

const C = {
    send: { TR: "Gönder", EN: "Send" },
    emoji: { TR: "Emoji ekle", EN: "Add emoji" },
    gif: { TR: "GIF gönder", EN: "Send a GIF" },
    sticker: { TR: "Çıkartma gönder", EN: "Send a sticker" },
    record: { TR: "Sesli mesaj kaydet", EN: "Record a voice message" },
    stopRecord: { TR: "Kaydı bitir ve gönder", EN: "Stop and send" },
    recording: { TR: "Kaydediliyor {seconds}/{limit} sn", EN: "Recording {seconds}/{limit}s" },
    discard: { TR: "Vazgeç", EN: "Discard" },
    replying: { TR: "{name} kişisine yanıt veriliyor", EN: "Replying to {name}" },
    cancelReply: { TR: "Yanıtı iptal et", EN: "Cancel reply" },
    chars: { TR: "{count}/{max}", EN: "{count}/{max}" },
    tooLong: { TR: "Mesaj çok uzun: en fazla {max} karakter.", EN: "The message is too long: {max} characters at most." },
    people: { TR: "Üyeler", EN: "Members" },
    channels: { TR: "Kanallar", EN: "Channels" },
    commands: { TR: "Komutlar", EN: "Commands" },
    emojiMatches: { TR: "\":{query}\" ile eşleşen emojiler", EN: "Emoji matching \":{query}\"" },
    suggestions: { TR: "Öneriler", EN: "Suggestions" },
    ctrlEnter: { TR: "Göndermek için Ctrl+Enter", EN: "Ctrl+Enter to send" },
} satisfies Record<string, Copy>;

export type ComposerSuggestion = {
    key: string;
    kind: "person" | "bot" | "everyone" | "channel" | "command" | "emoji";
    /** What the list shows. */
    label: string;
    /** What replaces the typed trigger (e.g. "@Ali", "#genel", "/sustur"). */
    insert: string;
    hint?: string;
    /** A second line (commands: their usage and description). */
    detail?: string;
    avatar?: string | null;
    icon?: ReactNode;
};

export type ComposerProps = {
    placeholder: string;
    label: string;
    maxLength: number;
    /** When set, the box is replaced by this notice (not friends, muted…). */
    disabled?: ReactNode;
    /** The line above the box (who is typing). */
    status?: ReactNode;
    /** Shown under the box (slow mode, a command's usage…). */
    footer?: ReactNode;
    reply?: { author: string; excerpt: string } | null;
    onCancelReply?: () => void;
    /** Resolves to false when the text should go back into the box (not sent). */
    onSend: (text: string) => Promise<boolean>;
    onGif: (gif: GifItem) => void;
    /** Direct messages: big emoji stickers. */
    onSticker?: (emoji: string) => void;
    onVoice?: (blob: Blob, mimeType: string, seconds: number) => void;
    onVoiceError?: (code: MicErrorCode) => void;
    onTyping: (text: string) => void;
    /** ArrowUp in an empty box edits the last own message (like Discord). */
    onEditLast: () => void;
    focusNonce: number;
    prefs: Pick<SocialPrefs, "enterToSend" | "gifAutoplay" | "voiceMsgQuality">;
    /** Suggestions for "@", "#" and "/" at the caret (":" emoji are built in). */
    suggest?: (trigger: ComposerTrigger) => ComposerSuggestion[];
    /** Keeps an unsent text per conversation while Hanogt Social is open. */
    draftKey: string;
};

const drafts = new Map<string, string>();

const SECTION_TITLE: Record<ComposerTrigger["kind"], keyof typeof C> = { mention: "people", channel: "channels", command: "commands", emoji: "emojiMatches" };

function SuggestionIcon({ suggestion }: { suggestion: ComposerSuggestion }) {
    if (suggestion.icon) return <span className="flex h-7 w-7 shrink-0 items-center justify-center">{suggestion.icon}</span>;
    if (suggestion.kind === "person") return <UserAvatar name={suggestion.label} src={suggestion.avatar} size="xs" />;
    if (suggestion.kind === "everyone") return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600"><AtSign className="h-3.5 w-3.5" aria-hidden /></span>;
    if (suggestion.kind === "channel") return <Hash className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />;
    if (suggestion.kind === "emoji") return <span className="w-6 shrink-0 text-center text-lg leading-none">{suggestion.label.split(" ")[0]}</span>;
    return null;
}

/**
 * The message box of direct messages and group channels: Discord's
 * suggestions for @people, #channels, /commands and :emoji:, the emoji, GIF
 * and sticker picker, voice messages, replies, the Enter-to-send setting
 * and a draft per conversation.
 */
export default function Composer(props: ComposerProps) {
    const { placeholder, label, maxLength, disabled, status, footer, reply, onCancelReply, onSend, onGif, onSticker, onVoice, onVoiceError, onTyping, onEditLast, focusNonce, prefs, suggest, draftKey } = props;
    const { tx } = useI18n();
    const [draft, setDraftState] = useState(() => drafts.get(draftKey) ?? "");
    const [sending, setSending] = useState(false);
    const [trigger, setTrigger] = useState<ComposerTrigger | null>(null);
    const [selected, setSelected] = useState(0);
    const [picker, setPicker] = useState<{ open: boolean; tab: ExpressionTab }>({ open: false, tab: "emoji" });
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const caretRef = useRef<number | null>(null);
    const listId = useId();
    const coarseRef = useRef(false);

    const setDraft = useCallback((value: string) => {
        setDraftState(value);
        if (value) drafts.set(draftKey, value);
        else drafts.delete(draftKey);
    }, [draftKey]);

    useEffect(() => {
        coarseRef.current = window.matchMedia("(pointer: coarse)").matches;
    }, []);

    const devices = useAudioDevices();
    const recorder = useVoiceRecorder({
        onRecorded: (blob, mimeType, seconds) => onVoice?.(blob, mimeType, seconds),
        onError: (code) => onVoiceError?.(code),
        deviceId: devices.input,
        bitsPerSecond: VOICE_BITRATE[prefs.voiceMsgQuality],
    });

    useLayoutEffect(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
        if (caretRef.current !== null) {
            element.setSelectionRange(caretRef.current, caretRef.current);
            caretRef.current = null;
        }
    }, [draft]);

    useEffect(() => {
        if (focusNonce) textareaRef.current?.focus();
    }, [focusNonce]);

    const suggestions = useMemo<ComposerSuggestion[]>(() => {
        if (!trigger) return [];
        if (trigger.kind === "emoji") {
            return searchEmoji(trigger.query, 8).map((entry) => ({ key: entry.char, kind: "emoji" as const, label: `${entry.char} :${entry.name}:`, insert: entry.char }));
        }
        return suggest ? suggest(trigger) : [];
    }, [suggest, trigger]);
    const open = suggestions.length > 0;
    const active = open ? Math.min(selected, suggestions.length - 1) : 0;

    const refreshTrigger = (value: string, caret: number) => {
        const next = findTrigger(value, caret);
        setTrigger(next);
        if (next?.kind !== trigger?.kind || next?.query !== trigger?.query) setSelected(0);
    };

    const pick = (suggestion: ComposerSuggestion) => {
        if (!trigger) return;
        if (suggestion.kind === "emoji") rememberEmoji(suggestion.insert);
        const result = applySuggestion(draft, trigger, suggestion.insert);
        caretRef.current = result.caret;
        setDraft(result.value);
        setTrigger(null);
        onTyping(result.value);
        textareaRef.current?.focus();
    };

    const insertText = (text: string) => {
        const element = textareaRef.current;
        const start = element?.selectionStart ?? draft.length;
        const end = element?.selectionEnd ?? draft.length;
        const next = `${draft.slice(0, start)}${text}${draft.slice(end)}`;
        caretRef.current = start + text.length;
        setDraft(next);
        onTyping(next);
        element?.focus();
    };

    const send = async () => {
        const text = draft.trim();
        if (!text || sending || text.length > maxLength) return;
        setSending(true);
        setDraft("");
        setTrigger(null);
        const sent = await onSend(text).catch(() => false);
        // A failed send gives the text back, unless something new was typed meanwhile.
        if (!sent) setDraftState((current) => {
            if (current) return current;
            drafts.set(draftKey, text);
            return text;
        });
        setSending(false);
        window.requestAnimationFrame(() => textareaRef.current?.focus());
    };

    const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        if (open) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setSelected((active + step + suggestions.length) % suggestions.length);
                return;
            }
            if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                event.preventDefault();
                pick(suggestions[active]);
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setTrigger(null);
                return;
            }
        }
        if (event.key === "Escape" && reply && onCancelReply) {
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
        const action = enterAction({ key: event.key, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, isComposing: event.nativeEvent.isComposing }, prefs.enterToSend, coarseRef.current);
        if (action === "send") {
            event.preventDefault();
            void send();
        }
    };

    const togglePicker = (tab: ExpressionTab) => setPicker((current) => ({ open: !(current.open && current.tab === tab), tab }));
    const closePicker = useCallback(() => setPicker((current) => ({ ...current, open: false })), []);

    if (disabled) {
        return <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4"><div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">{disabled}</div></div>;
    }

    const tooLong = draft.trim().length > maxLength;
    const hasText = Boolean(draft.trim());

    return (
        <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
            <div className="mb-1 h-4 truncate px-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400" aria-live="polite">{status}</div>
            <div className="relative">
                <AnimatePresence>
                    {open && (
                        <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.12 }}
                            className="absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-800"
                        >
                            <p className="px-3 pb-1 pt-2 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C[SECTION_TITLE[trigger?.kind ?? "mention"]], { query: trigger?.query ?? "" })}</p>
                            <ul id={listId} role="listbox" aria-label={tx(C.suggestions)} className="max-h-72 overflow-y-auto pb-1">
                                {suggestions.map((suggestion, index) => (
                                    <li key={suggestion.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            onMouseDown={(event) => { event.preventDefault(); pick(suggestion); }}
                                            onMouseEnter={() => setSelected(index)}
                                            className={cx("flex w-full items-center gap-2.5 px-3 py-1.5 text-start text-sm", index === active ? "bg-indigo-500/10 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200" : "text-zinc-700 dark:text-zinc-200")}
                                        >
                                            <SuggestionIcon suggestion={suggestion} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-semibold">{suggestion.kind === "emoji" ? suggestion.label.split(" ").slice(1).join(" ") : suggestion.label}</span>
                                                {suggestion.detail && <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">{suggestion.detail}</span>}
                                            </span>
                                            {suggestion.hint && <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">{suggestion.hint}</span>}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    )}
                </AnimatePresence>
                <ExpressionPicker
                    open={picker.open}
                    tab={picker.tab}
                    onTab={(tab) => setPicker({ open: true, tab })}
                    onClose={closePicker}
                    onEmoji={(char) => insertText(char)}
                    onGif={(gif) => { closePicker(); onGif(gif); }}
                    onSticker={onSticker ? (emoji) => { closePicker(); onSticker(emoji); } : undefined}
                    gifAutoplay={prefs.gifAutoplay}
                />
                {reply && (
                    <div className="flex items-center gap-2 rounded-t-xl border border-b-0 border-zinc-200 bg-zinc-100 px-3 py-2 text-[13px] text-zinc-600 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">
                        <span className="min-w-0 flex-1 truncate">{tx(C.replying, { name: reply.author })} <span className="text-zinc-400">— {reply.excerpt}</span></span>
                        {onCancelReply && <button type="button" onClick={onCancelReply} className="rounded-full p-0.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.cancelReply)}><X className="h-4 w-4" aria-hidden /></button>}
                    </div>
                )}
                {recorder.recording ? (
                    <div className={cx("flex items-center gap-2 bg-red-500/10 px-3 py-2", reply ? "rounded-b-xl" : "rounded-xl")}>
                        <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" /></span>
                        <span className="flex-1 text-sm font-bold tabular-nums text-red-700 dark:text-red-300" role="status">{tx(C.recording, { seconds: recorder.seconds, limit: recorder.limit })}</span>
                        <button type="button" onClick={() => recorder.stop(true)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800"><Trash2 className="me-1 inline h-4 w-4" aria-hidden />{tx(C.discard)}</button>
                        <button type="button" onClick={() => recorder.stop(false)} className="rounded-lg bg-red-600 p-2.5 text-white hover:bg-red-500" aria-label={tx(C.stopRecord)} title={tx(C.stopRecord)}><MicOff className="h-5 w-5" aria-hidden /></button>
                    </div>
                ) : (
                    <div className={cx("flex items-end gap-0.5 border bg-zinc-100 px-1.5 py-1.5 transition focus-within:border-indigo-400 dark:bg-zinc-950 dark:focus-within:border-indigo-400/60", tooLong ? "border-red-400" : "border-zinc-200 dark:border-white/10", reply ? "rounded-b-xl" : "rounded-xl")}>
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            rows={1}
                            role="combobox"
                            aria-expanded={open}
                            aria-controls={open ? listId : undefined}
                            aria-activedescendant={open ? `${listId}-${active}` : undefined}
                            aria-autocomplete="list"
                            aria-label={label}
                            aria-invalid={tooLong || undefined}
                            onChange={(event) => {
                                setDraft(event.target.value);
                                refreshTrigger(event.target.value, event.target.selectionStart ?? event.target.value.length);
                                onTyping(event.target.value);
                            }}
                            onKeyDown={onKeyDown}
                            onClick={(event) => refreshTrigger(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
                            onBlur={() => window.setTimeout(() => setTrigger(null), 150)}
                            placeholder={placeholder}
                            className="max-h-[220px] min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-zinc-400"
                        />
                        <div className="flex shrink-0 items-center">
                            <PickerButton label={tx(C.gif)} active={picker.open && picker.tab === "gif"} onClick={() => togglePicker("gif")}>
                                <span className="rounded border-2 border-current px-0.5 text-[9px] font-black leading-[12px]">GIF</span>
                            </PickerButton>
                            {onSticker && <span className="hidden sm:contents"><PickerButton label={tx(C.sticker)} active={picker.open && picker.tab === "sticker"} onClick={() => togglePicker("sticker")}><Sticker className="h-5 w-5" aria-hidden /></PickerButton></span>}
                            <PickerButton label={tx(C.emoji)} active={picker.open && picker.tab === "emoji"} onClick={() => togglePicker("emoji")}><Smile className="h-5 w-5" aria-hidden /></PickerButton>
                            {hasText || !onVoice ? (
                                <button type="button" onClick={() => void send()} disabled={sending || !hasText || tooLong} className="ms-0.5 rounded-lg bg-indigo-600 p-2 text-white transition hover:bg-indigo-500 disabled:opacity-50" aria-label={tx(C.send)} title={prefs.enterToSend ? tx(C.send) : tx(C.ctrlEnter)}>
                                    {sending ? <Spinner className="h-5 w-5" /> : <Send className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}
                                </button>
                            ) : (
                                <button type="button" onClick={() => void recorder.start()} className="ms-0.5 rounded-lg p-2 text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white" aria-label={tx(C.record)} title={tx(C.record)}>
                                    <Mic className="h-5 w-5" aria-hidden />
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {(draft.length > maxLength - 300 || footer) && (
                <div className="mt-1 flex items-center gap-2 px-1 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-zinc-500 dark:text-zinc-400">{tooLong ? <span className="font-semibold text-red-600 dark:text-red-400">{tx(C.tooLong, { max: maxLength })}</span> : footer}</span>
                    {draft.length > maxLength - 300 && <span className={cx("shrink-0 tabular-nums", tooLong ? "font-bold text-red-600 dark:text-red-400" : "text-amber-600")}>{tx(C.chars, { count: draft.trim().length, max: maxLength })}</span>}
                </div>
            )}
        </div>
    );
}

function PickerButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            data-expression-toggle
            onClick={onClick}
            aria-expanded={active}
            aria-haspopup="dialog"
            className={cx("rounded-lg p-2 transition", active ? "text-indigo-600 dark:text-indigo-300" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white")}
            aria-label={label}
            title={label}
        >
            {children}
        </button>
    );
}
