"use client";

import { ArrowDown, Check, CheckCheck, ChevronUp, Clock3, Copy as CopyIcon, CornerUpLeft, LoaderCircle, Mic, Pause, Pencil, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Spinner, UI_COPY, clockTime, cx, dayKey, fullDateTime } from "@/components/Groups/ui";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge from "@/components/StaffBadge";
import { useI18n, type Copy } from "@/lib/i18n";
import { tokenizeMessage } from "@/lib/groups";
import { SOCIAL_LIMITS, formatFriendTag, type DmMessage, type SocialPerson } from "@/lib/social/model";

const C = {
    start: { TR: "Bu, {name} ile direkt mesaj geçmişinin başlangıcı.", EN: "This is the beginning of your direct message history with {name}." },
    loadOlder: { TR: "Daha eski mesajları yükle", EN: "Load older messages" },
    newMessages: { TR: "Yeni mesajlar", EN: "New messages" },
    jumpLatest: { TR: "En yeniye git", EN: "Jump to latest" },
    reply: { TR: "Yanıtla", EN: "Reply" },
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
    repliedTo: { TR: "{name} kişisine yanıt", EN: "Replying to {name}" },
    original: { TR: "Yanıtlanan mesaja git", EN: "Go to the replied message" },
    editLabel: { TR: "Mesajı düzenle", EN: "Edit message" },
    editHint: { TR: "Kaydetmek için Enter, vazgeçmek için Esc", EN: "Enter to save, Esc to cancel" },
    save: { TR: "Kaydet", EN: "Save" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    empty: { TR: "Henüz mesaj yok. İlk mesajı gönder!", EN: "No messages yet. Send the first one!" },
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

/** Plain text with clickable http(s) links and "> " quote lines; nothing is rendered as HTML. */
function MessageText({ text }: { text: string }) {
    const blocks = useMemo(() => {
        const result: Array<{ quote: boolean; lines: string[] }> = [];
        for (const line of text.split("\n")) {
            const quote = line.startsWith("> ");
            const last = result[result.length - 1];
            if (last && last.quote === quote) last.lines.push(quote ? line.slice(2) : line);
            else result.push({ quote, lines: [quote ? line.slice(2) : line] });
        }
        return result;
    }, [text]);
    const render = (content: string) => tokenizeMessage(content, []).map((segment, index) => (segment.kind === "link"
        ? <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-indigo-600 underline decoration-indigo-500/40 underline-offset-2 hover:decoration-indigo-500 dark:text-indigo-400">{segment.text}</a>
        : <span key={index}>{segment.text}</span>));
    return (
        <div className="break-words text-[15px] leading-[1.375rem] text-zinc-800 dark:text-zinc-100">
            {blocks.map((block, index) => block.quote
                ? <blockquote key={index} className="my-0.5 whitespace-pre-wrap border-s-4 border-zinc-300 ps-2.5 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">{render(block.lines.join("\n"))}</blockquote>
                : <p key={index} className="whitespace-pre-wrap">{render(block.lines.join("\n"))}</p>)}
        </div>
    );
}

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
    playingId: string;
    loadingVoiceId: string;
    onToggleVoice: (message: DmMessage) => void;
    /** Shown above the conversation start (Discord's "This is the beginning…" card). */
    intro: ReactNode;
};

/**
 * The conversation, Discord style: day dividers, a "new messages" line,
 * grouped messages from the same person, a hover toolbar (reply, edit,
 * delete, copy), replies, read receipts and voice messages.
 */
export default function DmMessages(props: DmMessagesProps) {
    const { chatId, me, partner, messages, loaded, hasMore, onLoadOlder, now, intro } = props;
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
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (message.fromEmail === me.email) return message.read ? message.id : "";
        }
        return "";
    }, [me.email, messages]);

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
        if (!element) return;
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        element.classList.add(...FLASH);
        window.setTimeout(() => element.classList.remove(...FLASH), 1600);
    }, []);

    const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
    const activate = useCallback((id: string) => setActiveId((current) => (current === id ? "" : id)), []);

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
        const compact = Boolean(previous && previous.fromEmail === message.fromEmail && !message.replyTo
            && message.createdAt - previous.createdAt < GROUPING_WINDOW_MS && dayKey(previous.createdAt) === dayKey(message.createdAt) && message.id !== dividerId);
        const author = message.fromEmail === me.email ? me : partner;
        rows.push(
            <DmMessageRow
                key={message.id}
                message={message}
                author={author}
                mine={message.fromEmail === me.email}
                compact={compact}
                replied={message.replyTo ? byId.get(message.replyTo.id) ?? null : null}
                replyAuthor={message.replyTo ? (message.replyTo.fromEmail === me.email ? me.username : partner.username) : ""}
                seen={message.id === lastOwnRead}
                active={activeId === message.id}
                editing={props.editingId === message.id}
                playing={props.playingId === message.id}
                loadingVoice={props.loadingVoiceId === message.id}
                onActivate={activate}
                onJump={jumpTo}
                onReply={props.onReply}
                onStartEdit={props.onStartEdit}
                onCancelEdit={props.onCancelEdit}
                onSaveEdit={props.onSaveEdit}
                onDelete={props.onDelete}
                onCopy={props.onCopy}
                onToggleVoice={props.onToggleVoice}
            />,
        );
        previous = message;
    }

    return (
        <div className="relative min-h-0 flex-1">
            <div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain pb-4" aria-live="polite" aria-relevant="additions" onKeyDown={(event) => { if (event.key === "Escape") setActiveId(""); }}>
                {loaded && !hasMore && intro}
                {hasMore && (
                    <div className="flex justify-center p-3">
                        <button type="button" onClick={loadOlder} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"><ChevronUp className="h-3.5 w-3.5" aria-hidden />{tx(C.loadOlder)}</button>
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
    mine: boolean;
    compact: boolean;
    replied: DmMessage | null;
    replyAuthor: string;
    seen: boolean;
    active: boolean;
    editing: boolean;
    playing: boolean;
    loadingVoice: boolean;
    onActivate: (id: string) => void;
    onJump: (id: string) => void;
    onReply: (message: DmMessage) => void;
    onStartEdit: (message: DmMessage) => void;
    onCancelEdit: () => void;
    onSaveEdit: (message: DmMessage, text: string) => Promise<void>;
    onDelete: (message: DmMessage) => void;
    onCopy: (message: DmMessage) => void;
    onToggleVoice: (message: DmMessage) => void;
};

function RowView(props: RowProps) {
    const { message, author, mine, compact, replied, replyAuthor, seen, active, editing, playing, loadingVoice } = props;
    const { tx, locale } = useI18n();
    const time = clockTime(message.createdAt, locale);
    const iso = message.createdAt ? new Date(message.createdAt).toISOString() : undefined;
    const reply = message.replyTo;
    const canEdit = mine && message.type === "text" && !message.deleted && !message.pending;

    const toolbar = !message.deleted && !editing && (
        <div
            role="toolbar"
            aria-label={tx(C.actions)}
            className={cx("absolute -top-3.5 end-3 z-10 flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 shadow-md transition dark:border-white/10 dark:bg-zinc-800", active ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100")}
        >
            <Tool label={tx(C.reply)} onClick={() => props.onReply(message)}><CornerUpLeft className="h-4 w-4" aria-hidden /></Tool>
            {canEdit && <Tool label={tx(C.edit)} onClick={() => props.onStartEdit(message)}><Pencil className="h-4 w-4" aria-hidden /></Tool>}
            {message.type !== "voice" && <Tool label={tx(C.copy)} onClick={() => props.onCopy(message)}><CopyIcon className="h-4 w-4" aria-hidden /></Tool>}
            {mine && <Tool label={tx(C.delete)} danger onClick={() => props.onDelete(message)}><Trash2 className="h-4 w-4" aria-hidden /></Tool>}
        </div>
    );

    const receipt = mine && !message.deleted && (
        message.pending
            ? <Clock3 className="h-3 w-3 text-zinc-400" aria-label={tx(C.sending)} />
            : message.read ? <CheckCheck className="h-3.5 w-3.5 text-indigo-500" aria-label={tx(C.read)} /> : <Check className="h-3.5 w-3.5 text-zinc-400" aria-label={tx(C.sent)} />
    );

    let body: ReactNode;
    if (message.deleted) {
        body = <p className="text-[15px] italic text-zinc-400 dark:text-zinc-500">{tx(C.deleted)}</p>;
    } else if (editing) {
        body = <EditBox message={message} onCancel={props.onCancelEdit} onSave={props.onSaveEdit} />;
    } else if (message.type === "sticker") {
        body = <p className="text-5xl leading-tight" role="img" aria-label={message.text}>{message.text}</p>;
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
        body = <MessageText text={message.text} />;
    }

    return (
        <div
            id={`dm-${message.id}`}
            className={cx("group relative px-4 transition-colors scroll-mt-24", compact ? "py-0.5" : "mt-3 pt-0.5 pb-0.5", active ? "bg-zinc-100 dark:bg-white/[0.04]" : "hover:bg-zinc-50 dark:hover:bg-white/[0.025]", message.pending && "opacity-70")}
            onClick={(event) => {
                if (!(event.target instanceof Element) || !event.target.closest("a,button,textarea")) props.onActivate(message.id);
            }}
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
                        <PresenceAvatar src={author.avatarUrl} name={author.username} size="md" className="mt-0.5" />
                    ) : (
                        <time dateTime={iso} title={fullDateTime(message.createdAt, locale)} className="hidden pt-1 text-end text-[10px] leading-5 text-zinc-400 group-hover:block">{time}</time>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    {!compact && (
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-semibold text-zinc-900 dark:text-white">{author.username}</span>
                            <StaffBadge role={author.staffRole} size="sm" compactOnMobile />
                            <time dateTime={iso} title={fullDateTime(message.createdAt, locale)} className="text-xs text-zinc-400">{time}</time>
                        </div>
                    )}
                    {body}
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

