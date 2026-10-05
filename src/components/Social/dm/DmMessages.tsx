"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Check, CheckCheck, ChevronUp, Clock3, Copy as CopyIcon, CornerUpLeft, CornerUpRight, Forward, LoaderCircle, Mic, Pause, Pencil, Pin, PinOff, Smile, Star, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Spinner, UI_COPY, clockTime, cx, dayKey, fullDateTime } from "@/components/Groups/ui";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge from "@/components/StaffBadge";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_REACTIONS, tokenizeMessage, type GroupReactionKey } from "@/lib/groups";
import { SOCIAL_LIMITS, formatFriendTag, reactionSummary, type DmMessage, type SocialPerson } from "@/lib/social/model";
import { ChatMarkdown } from "../chat/ChatMarkdown";
import GifView from "../chat/GifView";

const C = {
    start: { TR: "Bu, {name} ile direkt mesaj geçmişinin başlangıcı.", EN: "This is the beginning of your direct message history with {name}." },
    loadOlder: { TR: "Daha eski mesajları yükle", EN: "Load older messages" },
    newMessages: { TR: "Yeni mesajlar", EN: "New messages" },
    jumpLatest: { TR: "En yeniye git", EN: "Jump to latest" },
    react: { TR: "Tepki ver", EN: "React" },
    reply: { TR: "Yanıtla", EN: "Reply" },
    forward: { TR: "İlet", EN: "Forward" },
    forwarded: { TR: "İletildi", EN: "Forwarded" },
    star: { TR: "Yıldızla", EN: "Star" },
    unstar: { TR: "Yıldızı kaldır", EN: "Unstar" },
    pin: { TR: "Sabitle", EN: "Pin" },
    unpin: { TR: "Sabitlemeyi kaldır", EN: "Unpin" },
    pinned: { TR: "Sabitlendi", EN: "Pinned" },
    edit: { TR: "Düzenle", EN: "Edit" },
    delete: { TR: "Sil", EN: "Delete" },
    copy: { TR: "Metni kopyala", EN: "Copy text" },
    actions: { TR: "Mesaj işlemleri", EN: "Message actions" },
    edited: { TR: "(düzenlendi)", EN: "(edited)" },
    deleted: { TR: "Bu mesaj silindi.", EN: "This message was deleted." },
    sending: { TR: "Gönderiliyor", EN: "Sending" },
    sent: { TR: "Gönderildi", EN: "Sent" },
    read: { TR: "Görüldü", EN: "Seen" },
    voice: { TR: "Sesli mesaj, {time}", EN: "Voice message, {time}" },
    play: { TR: "Sesli mesajı oynat", EN: "Play voice message" },
    stop: { TR: "Durdur", EN: "Stop" },
    original: { TR: "Yanıtlanan mesaja git", EN: "Go to the replied message" },
    editLabel: { TR: "Mesajı düzenle", EN: "Edit message" },
    editHint: { TR: "Kaydetmek için Enter, vazgeçmek için Esc", EN: "Enter to save, Esc to cancel" },
    save: { TR: "Kaydet", EN: "Save" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    empty: { TR: "Henüz mesaj yok. İlk mesajı gönder!", EN: "No messages yet. Send the first one!" },
    openProfile: { TR: "{name} profil kartını aç", EN: "Open {name}'s profile card" },
    reactedBy: { TR: "{names} tepki verdi", EN: "{names} reacted" },
    you: { TR: "Sen", EN: "You" },
} satisfies Record<string, Copy>;

const GROUPING_WINDOW_MS = 7 * 60_000;
const FLASH = ["ring-2", "ring-indigo-500/60", "bg-indigo-500/10"];

export function formatDuration(seconds: number) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function dayLabel(ms: number, now: number, locale: string, tx: (copy: Copy) => string) {
    if (dayKey(ms) === dayKey(now)) return tx(UI_COPY.today);
    if (dayKey(ms) === dayKey(now - 86_400_000)) return tx(UI_COPY.yesterday);
    try {
        const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
        return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: sameYear ? undefined : "numeric" }).format(ms);
    } catch {
        return new Date(ms).toLocaleDateString();
    }
}

/** Links in a message's text pieces (direct messages have no mentions or topics). */
const renderLinks = (content: string, key: string): ReactNode => tokenizeMessage(content, []).map((segment, index) => (segment.kind === "link"
    ? <a key={`${key}-${index}`} href={segment.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-indigo-600 underline decoration-indigo-500/40 underline-offset-2 hover:decoration-indigo-500 dark:text-indigo-400">{segment.text}</a>
    : <span key={`${key}-${index}`}>{segment.text}</span>));

export type DmMessagesProps = {
    chatId: string;
    me: SocialPerson;
    partner: SocialPerson;
    messages: DmMessage[];
    loaded: boolean;
    hasMore: boolean;
    onLoadOlder: () => void;
    now: number;
    editingId: string;
    onStartEdit: (message: DmMessage) => void;
    onCancelEdit: () => void;
    onSaveEdit: (message: DmMessage, text: string) => Promise<void>;
    onReply: (message: DmMessage) => void;
    onDelete: (message: DmMessage) => void;
    onCopy: (message: DmMessage) => void;
    onReact: (message: DmMessage, reaction: GroupReactionKey) => void;
    onTogglePin: (message: DmMessage) => void;
    onToggleStar: (message: DmMessage) => void;
    onForward: (message: DmMessage) => void;
    pinnedIds: readonly string[];
    starredIds: ReadonlySet<string>;
    playingId: string;
    loadingVoiceId: string;
    onToggleVoice: (message: DmMessage) => void;
    /** Clicking an avatar or a name opens the person's profile card. */
    onOpenProfile: (email: string, trigger: HTMLElement) => void;
    /** Shown above the conversation start (Discord's "This is the beginning…" card). */
    intro: ReactNode;
    /** "Read receipts" in the messaging settings: off hides "Seen" (the partner doesn't get yours either). */
    showReceipts: boolean;
    fontClass: string;
    backgroundClass: string;
    gifAutoplay: boolean;
    /** Scroll to this message (a star or a pin); a new nonce scrolls again. */
    jumpTarget: { id: string; nonce: number } | null;
    onJumpMissing: () => void;
};

/**
 * The conversation, Discord style: day dividers, a "new messages" line,
 * grouped messages from the same person, a hover toolbar (react, reply,
 * forward, edit, star, pin, delete, copy), Markdown, GIFs, replies, read
 * receipts and voice messages.
 */
export default function DmMessages(props: DmMessagesProps) {
    const { chatId, me, partner, messages, loaded, hasMore, onLoadOlder, now, intro, showReceipts, backgroundClass, jumpTarget, onJumpMissing } = props;
    const { tx, locale } = useI18n();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const atBottomRef = useRef(true);
    const restoreRef = useRef<{ height: number; top: number; count: number } | null>(null);
    const initialDoneRef = useRef(false);
    const lastIdRef = useRef("");
    const [activeId, setActiveId] = useState("");
    const [showJump, setShowJump] = useState(false);

    // Where the unread messages started when the conversation was opened (kept while reading).
    const [divider, setDivider] = useState<{ chatId: string; id: string } | null>(null);
    if (loaded && divider?.chatId !== chatId) {
        setDivider({ chatId, id: messages.find((message) => message.fromEmail === partner.email && !message.read && !message.deleted)?.id ?? "" });
    }
    const dividerId = divider?.chatId === chatId ? divider.id : "";

    const lastOwnRead = useMemo(() => {
        if (!showReceipts) return "";
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (message.fromEmail === me.email) return message.read ? message.id : "";
        }
        return "";
    }, [me.email, messages, showReceipts]);

    const scrollToBottom = useCallback((smooth: boolean) => {
        const element = containerRef.current;
        if (element) element.scrollTo({ top: element.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    }, []);

    const onScroll = () => {
        const element = containerRef.current;
        if (!element) return;
        atBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        setShowJump(!atBottomRef.current);
    };

    useLayoutEffect(() => {
        const element = containerRef.current;
        if (!element || !loaded) return;
        const restore = restoreRef.current;
        if (restore && messages.length !== restore.count) {
            // Older messages were prepended: keep the same messages under the reader's eyes.
            element.scrollTop = element.scrollHeight - restore.height + restore.top;
            restoreRef.current = null;
            lastIdRef.current = messages[messages.length - 1]?.id ?? "";
            return;
        }
        const last = messages[messages.length - 1];
        if (!initialDoneRef.current) {
            initialDoneRef.current = true;
            const target = dividerId ? document.getElementById(`dm-${dividerId}`) : null;
            if (target) target.scrollIntoView({ block: "center" });
            else element.scrollTop = element.scrollHeight;
        } else if (atBottomRef.current || (last && last.fromEmail === me.email && last.id !== lastIdRef.current)) {
            scrollToBottom(lastIdRef.current !== "");
        }
        lastIdRef.current = last?.id ?? "";
    }, [dividerId, loaded, me.email, messages, scrollToBottom]);

    const loadOlder = () => {
        const element = containerRef.current;
        if (element) restoreRef.current = { height: element.scrollHeight, top: element.scrollTop, count: messages.length };
        onLoadOlder();
    };

    const jumpTo = useCallback((id: string) => {
        const element = document.getElementById(`dm-${id}`);
        if (!element) return false;
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        element.classList.add(...FLASH);
        window.setTimeout(() => element.classList.remove(...FLASH), 1600);
        return true;
    }, []);

    // A star or a pin asked for a message: scroll to it once the messages are there.
    const jumpRef = useRef({ jumpTo, onJumpMissing, id: jumpTarget?.id ?? "" });
    useEffect(() => {
        jumpRef.current = { jumpTo, onJumpMissing, id: jumpTarget?.id ?? "" };
    });
    const jumpKey = loaded && jumpTarget ? `${jumpTarget.id}:${jumpTarget.nonce}` : "";
    useEffect(() => {
        if (!jumpKey) return;
        const timer = window.setTimeout(() => {
            const { jumpTo: jump, onJumpMissing: missing, id } = jumpRef.current;
            if (id && !jump(id)) missing();
        }, 60);
        return () => window.clearTimeout(timer);
    }, [jumpKey]);

    const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
    const activate = useCallback((id: string) => setActiveId((current) => (current === id ? "" : id)), []);
    const onJump = useCallback((id: string) => void jumpTo(id), [jumpTo]);

    const rows: ReactNode[] = [];
    let previous: DmMessage | null = null;
    for (const message of messages) {
        if (!previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)) {
            rows.push(
                <div key={`day-${message.id}`} className="my-3 flex items-center gap-3 px-4" role="separator" aria-label={dayLabel(message.createdAt, now, locale, tx)}>
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                    <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{dayLabel(message.createdAt, now, locale, tx)}</span>
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                </div>,
            );
        }
        if (message.id === dividerId) {
            rows.push(
                <div key="new-divider" className="my-2 flex items-center gap-2 px-4" role="separator" aria-label={tx(C.newMessages)}>
                    <span className="h-px flex-1 bg-red-500/70" />
                    <span className="rounded bg-red-500 px-1.5 text-[10px] font-black uppercase tracking-wide text-white">{tx(C.newMessages)}</span>
                </div>,
            );
        }
        const compact = Boolean(previous && previous.fromEmail === message.fromEmail && !message.replyTo && !message.forwarded
            && message.createdAt - previous.createdAt < GROUPING_WINDOW_MS && dayKey(previous.createdAt) === dayKey(message.createdAt) && message.id !== dividerId);
        const author = message.fromEmail === me.email ? me : partner;
        rows.push(
            <DmMessageRow
                key={message.id}
                message={message}
                author={author}
                me={me.email}
                mine={message.fromEmail === me.email}
                compact={compact}
                replied={message.replyTo ? byId.get(message.replyTo.id) ?? null : null}
                replyAuthor={message.replyTo ? (message.replyTo.fromEmail === me.email ? me.username : partner.username) : ""}
                seen={message.id === lastOwnRead}
                showReceipts={showReceipts}
                pinned={props.pinnedIds.includes(message.id)}
                starred={props.starredIds.has(message.id)}
                active={activeId === message.id}
                editing={props.editingId === message.id}
                playing={props.playingId === message.id}
                loadingVoice={props.loadingVoiceId === message.id}
                fontClass={props.fontClass}
                gifAutoplay={props.gifAutoplay}
                partnerName={partner.username}
                onActivate={activate}
                onJump={onJump}
                onReply={props.onReply}
                onStartEdit={props.onStartEdit}
                onCancelEdit={props.onCancelEdit}
                onSaveEdit={props.onSaveEdit}
                onDelete={props.onDelete}
                onCopy={props.onCopy}
                onReact={props.onReact}
                onTogglePin={props.onTogglePin}
                onToggleStar={props.onToggleStar}
                onForward={props.onForward}
                onToggleVoice={props.onToggleVoice}
                onOpenProfile={props.onOpenProfile}
            />,
        );
        previous = message;
    }

    return (
        <div className="relative min-h-0 flex-1">
            <div ref={containerRef} onScroll={onScroll} className={cx("h-full overflow-y-auto overscroll-contain pb-4", backgroundClass)} aria-live="polite" aria-relevant="additions" onKeyDown={(event) => { if (event.key === "Escape") setActiveId(""); }}>
                {loaded && !hasMore && intro}
                {hasMore && (
                    <div className="flex justify-center p-3">
                        <button type="button" onClick={loadOlder} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"><ChevronUp className="h-3.5 w-3.5" aria-hidden />{tx(C.loadOlder)}</button>
                    </div>
                )}
                {!loaded ? (
                    <div className="flex h-full items-center justify-center"><Spinner className="h-7 w-7 text-indigo-500" /></div>
                ) : rows.length ? rows : (
                    <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{tx(C.empty)}</p>
                )}
            </div>
            {showJump && (
                <button type="button" onClick={() => scrollToBottom(true)} className="absolute bottom-3 end-4 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500">
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />{tx(C.jumpLatest)}
                </button>
            )}
        </div>
    );
}

type RowProps = {
    message: DmMessage;
    author: SocialPerson;
    me: string;
    mine: boolean;
    compact: boolean;
    replied: DmMessage | null;
    replyAuthor: string;
    seen: boolean;
    showReceipts: boolean;
    pinned: boolean;
    starred: boolean;
    active: boolean;
    editing: boolean;
    playing: boolean;
    loadingVoice: boolean;
    fontClass: string;
    gifAutoplay: boolean;
    partnerName: string;
    onActivate: (id: string) => void;
    onJump: (id: string) => void;
    onReply: (message: DmMessage) => void;
    onStartEdit: (message: DmMessage) => void;
    onCancelEdit: () => void;
    onSaveEdit: (message: DmMessage, text: string) => Promise<void>;
    onDelete: (message: DmMessage) => void;
    onCopy: (message: DmMessage) => void;
    onReact: (message: DmMessage, reaction: GroupReactionKey) => void;
    onTogglePin: (message: DmMessage) => void;
    onToggleStar: (message: DmMessage) => void;
    onForward: (message: DmMessage) => void;
    onToggleVoice: (message: DmMessage) => void;
    onOpenProfile: (email: string, trigger: HTMLElement) => void;
};

function RowView(props: RowProps) {
    const { message, author, me, mine, compact, replied, replyAuthor, seen, showReceipts, pinned, starred, active, editing, playing, loadingVoice, fontClass, gifAutoplay, partnerName } = props;
    const { tx, locale } = useI18n();
    const [picker, setPicker] = useState(false);
    const time = clockTime(message.createdAt, locale);
    const iso = message.createdAt ? new Date(message.createdAt).toISOString() : undefined;
    const reply = message.replyTo;
    const canEdit = mine && message.type === "text" && !message.deleted && !message.pending;
    const canForward = !message.pending && !message.deleted && (message.type === "text" || message.type === "gif" || message.type === "sticker");
    const reactions = reactionSummary(message.reactions, me);

    const toolbar = !message.deleted && !editing && !message.pending && (
        <div
            role="toolbar"
            aria-label={tx(C.actions)}
            onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setPicker(false); }}
            className={cx("absolute -top-3.5 end-3 z-10 flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 shadow-md transition dark:border-white/10 dark:bg-zinc-800", active || picker ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100")}
        >
            <Tool label={tx(C.react)} onClick={() => setPicker((value) => !value)}><Smile className="h-4 w-4" aria-hidden /></Tool>
            <Tool label={tx(C.reply)} onClick={() => props.onReply(message)}><CornerUpLeft className="h-4 w-4" aria-hidden /></Tool>
            {canForward && <Tool label={tx(C.forward)} onClick={() => props.onForward(message)}><CornerUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden /></Tool>}
            {canEdit && <Tool label={tx(C.edit)} onClick={() => props.onStartEdit(message)}><Pencil className="h-4 w-4" aria-hidden /></Tool>}
            {message.type === "text" && <Tool label={tx(C.copy)} onClick={() => props.onCopy(message)}><CopyIcon className="h-4 w-4" aria-hidden /></Tool>}
            <Tool label={tx(starred ? C.unstar : C.star)} onClick={() => props.onToggleStar(message)}><Star className={cx("h-4 w-4", starred && "fill-amber-400 text-amber-500")} aria-hidden /></Tool>
            <Tool label={tx(pinned ? C.unpin : C.pin)} onClick={() => props.onTogglePin(message)}>{pinned ? <PinOff className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}</Tool>
            {mine && <Tool label={tx(C.delete)} danger onClick={() => props.onDelete(message)}><Trash2 className="h-4 w-4" aria-hidden /></Tool>}
            <AnimatePresence>
                {picker && (
                    <motion.div initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.96 }} transition={{ duration: 0.12 }} className="absolute end-0 top-full mt-1 flex gap-0.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-zinc-800">
                        {GROUP_REACTIONS.map((reaction) => (
                            <button key={reaction.key} type="button" onClick={(event) => { event.stopPropagation(); setPicker(false); props.onReact(message, reaction.key); }} className="rounded-lg p-1.5 text-lg leading-none transition hover:scale-125 hover:bg-zinc-100 dark:hover:bg-zinc-700" aria-label={tx(reaction.label)} title={tx(reaction.label)}>{reaction.emoji}</button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    const receipt = mine && !message.deleted && (
        message.pending
            ? <Clock3 className="h-3 w-3 text-zinc-400" aria-label={tx(C.sending)} />
            : showReceipts && message.read ? <CheckCheck className="h-3.5 w-3.5 text-indigo-500" aria-label={tx(C.read)} /> : <Check className="h-3.5 w-3.5 text-zinc-400" aria-label={tx(C.sent)} />
    );

    let body: ReactNode;
    if (message.deleted) {
        body = <p className="text-[15px] italic text-zinc-400 dark:text-zinc-500">{tx(C.deleted)}</p>;
    } else if (editing) {
        body = <EditBox message={message} onCancel={props.onCancelEdit} onSave={props.onSaveEdit} />;
    } else if (message.type === "sticker") {
        body = <p className="text-5xl leading-tight" role="img" aria-label={message.text}>{message.text}</p>;
    } else if (message.type === "gif" && message.gif) {
        body = <GifView gif={message.gif} autoplay={gifAutoplay} />;
    } else if (message.type === "voice") {
        body = (
            <button type="button" onClick={() => props.onToggleVoice(message)} className={cx("mt-0.5 inline-flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-sm transition", playing ? "border-indigo-500/50 bg-indigo-500/10" : "border-zinc-200 bg-white hover:border-indigo-500/40 dark:border-white/10 dark:bg-zinc-950")} aria-label={playing ? tx(C.stop) : `${tx(C.play)} (${formatDuration(message.voiceDuration)})`}>
                <span className={cx("flex h-8 w-8 items-center justify-center rounded-full text-white", playing ? "bg-indigo-600" : "bg-zinc-900 dark:bg-zinc-700")}>
                    {loadingVoice ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : playing ? <Pause className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
                </span>
                <span className="flex h-6 items-end gap-0.5" aria-hidden>
                    {[0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8, 0.55, 0.95, 0.5].map((height, index) => (
                        <span key={index} className={cx("w-1 rounded-full bg-indigo-500/70", playing && "animate-pulse")} style={{ height: `${Math.round(height * 100)}%`, animationDelay: `${index * 80}ms` }} />
                    ))}
                </span>
                <span className="text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">{tx(C.voice, { time: formatDuration(message.voiceDuration) })}</span>
            </button>
        );
    } else {
        body = <ChatMarkdown text={message.text} renderText={renderLinks} className={cx("text-zinc-800 dark:text-zinc-100", fontClass)} />;
    }

    const reactionRow = reactions.length > 0 && !message.deleted && (
        <div className="mt-1.5 flex flex-wrap gap-1">
            {reactions.map((reaction) => (
                <button key={reaction.key} type="button" onClick={() => props.onReact(message, reaction.key)} aria-pressed={reaction.mine} title={tx(C.reactedBy, { names: (message.reactions[reaction.key] ?? []).map((email) => (email === me ? tx(C.you) : partnerName)).join(", ") })} className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition", reaction.mine ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300")}>
                    <span className="text-sm leading-none">{reaction.emoji}</span>{reaction.count}
                </button>
            ))}
        </div>
    );

    return (
        <div
            id={`dm-${message.id}`}
            className={cx("group relative px-4 transition-colors scroll-mt-24", compact ? "py-0.5" : "mt-3 pt-0.5 pb-0.5", active ? "bg-zinc-100 dark:bg-white/[0.04]" : "hover:bg-zinc-50/80 dark:hover:bg-white/[0.025]", message.pending && "opacity-70")}
            onClick={(event) => {
                if (!(event.target instanceof Element) || !event.target.closest("a,button,textarea")) props.onActivate(message.id);
            }}
            onMouseLeave={() => setPicker(false)}
        >
            {toolbar}
            {reply && !message.deleted && (
                <button type="button" onClick={() => props.onJump(reply.id)} className="relative mb-0.5 ms-[52px] flex max-w-full items-center gap-1.5 text-start text-[13px] text-zinc-500 before:absolute before:-start-8 before:top-1/2 before:h-3 before:w-7 before:rounded-ss-md before:border-s-2 before:border-t-2 before:border-zinc-300 hover:text-zinc-800 dark:text-zinc-400 dark:before:border-zinc-600 dark:hover:text-zinc-200" aria-label={tx(C.original)}>
                    <span className="shrink-0 font-semibold">@{replyAuthor}</span>
                    <span className="truncate">{replied?.deleted ? tx(C.deleted) : replied?.text || reply.text}</span>
                </button>
            )}
            <div className="flex gap-4">
                <div className="w-10 shrink-0">
                    {!compact ? (
                        <button type="button" onClick={(event) => props.onOpenProfile(author.email, event.currentTarget)} className="mt-0.5 rounded-full transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label={tx(C.openProfile, { name: author.username })}>
                            <PresenceAvatar src={author.avatarUrl} name={author.username} size="md" />
                        </button>
                    ) : (
                        <time dateTime={iso} title={fullDateTime(message.createdAt, locale)} className="hidden pt-1 text-end text-[10px] leading-5 text-zinc-400 group-hover:block">{time}</time>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    {!compact && (
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            <button type="button" onClick={(event) => props.onOpenProfile(author.email, event.currentTarget)} className="font-semibold text-zinc-900 hover:underline focus-visible:underline focus-visible:outline-none dark:text-white">{author.username}</button>
                            <StaffBadge role={author.staffRole} size="sm" compactOnMobile />
                            <time dateTime={iso} title={fullDateTime(message.createdAt, locale)} className="text-xs text-zinc-400">{time}</time>
                            {pinned && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"><Pin className="h-3 w-3" aria-hidden />{tx(C.pinned)}</span>}
                            {starred && <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-label={tx(C.unstar)} />}
                        </div>
                    )}
                    {message.forwarded && !message.deleted && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold italic text-zinc-500 dark:text-zinc-400"><Forward className="h-3 w-3 rtl:-scale-x-100" aria-hidden />{tx(C.forwarded)}</p>
                    )}
                    <div className={cx(message.forwarded && !message.deleted && "border-s-2 border-zinc-300 ps-2.5 dark:border-zinc-600")}>{body}</div>
                    {reactionRow}
                    {(message.edited && !message.deleted) || receipt || seen ? (
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                            {message.edited && !message.deleted && <span>{tx(C.edited)}</span>}
                            {receipt}
                            {seen && <span className="font-semibold text-indigo-500">{tx(C.read)}</span>}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

const DmMessageRow = memo(RowView);

function Tool({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
    return (
        <button type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} className={cx("rounded-md p-1.5 transition", danger ? "text-red-500 hover:bg-red-500/10" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-white")} aria-label={label} title={label}>
            {children}
        </button>
    );
}

function EditBox({ message, onCancel, onSave }: { message: DmMessage; onCancel: () => void; onSave: (message: DmMessage, text: string) => Promise<void> }) {
    const { tx } = useI18n();
    const [value, setValue] = useState(message.text);
    const [busy, setBusy] = useState(false);
    const ref = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(element.value.length, element.value.length);
    }, []);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
    }, [value]);

    const save = async () => {
        const text = value.trim();
        if (!text || busy) return;
        if (text === message.text) {
            onCancel();
            return;
        }
        setBusy(true);
        try {
            await onSave(message, text);
        } finally {
            setBusy(false);
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
        } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void save();
        }
    };

    return (
        <div className="mt-1">
            <textarea
                ref={ref}
                value={value}
                rows={1}
                maxLength={SOCIAL_LIMITS.messageMax}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={onKeyDown}
                aria-label={tx(C.editLabel)}
                className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[15px] leading-6 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950"
            />
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span>{tx(C.editHint)}</span>
                <button type="button" onClick={onCancel} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{tx(C.cancel)}</button>
                <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-300">{busy && <Spinner className="h-3 w-3" />}{tx(C.save)}</button>
            </p>
        </div>
    );
}

/** The card at the very top of a conversation. */
export function ConversationIntro({ partner, children }: { partner: SocialPerson; children?: ReactNode }) {
    const { tx } = useI18n();
    const tag = formatFriendTag(partner.nickname, partner.nicknameTag);
    return (
        <div className="px-4 pb-2 pt-8">
            <PresenceAvatar src={partner.avatarUrl} name={partner.username} size="xl" />
            <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-3xl">{partner.username}</h2>
            {tag && <p className="mt-0.5 font-mono text-sm text-zinc-500 dark:text-zinc-400">{tag}</p>}
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{tx(C.start, { name: partner.username })}</p>
            {children}
        </div>
    );
}
