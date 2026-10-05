"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock3, Copy as CopyIcon, CornerUpLeft, CornerUpRight, Forward, LoaderCircle, Mic, Pause, Pencil, Pin, PinOff, Smile, Sparkles, Star, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BOT_LABEL, BotAvatar, BotTag, ThinkingDots, customCommandLine, noticeOf } from "@/components/Social/chat/bots";
import { ChatMarkdown } from "@/components/Social/chat/ChatMarkdown";
import GifView from "@/components/Social/chat/GifView";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    BOT_NAMES,
    GROUP_REACTIONS,
    GROUP_SYSTEM_EVENT_COPY,
    SYSTEM_SENDER,
    canModerate,
    getGroupTemplate,
    isManagerRole,
    outranks,
    tokenizeMessage,
    type GroupReactionKey,
} from "@/lib/groups";
import { BOT_EVENT_COPY } from "@/lib/social/bots";
import { GroupTile, RoleBadge, Spinner, UserAvatar, clockTime, cx, fullDateTime } from "../ui";
import { useWorkspace } from "./context";
import type { GroupChatMessage } from "./model";

const C = {
    react: { TR: "Tepki ver", EN: "React" },
    reply: { TR: "Yanıtla", EN: "Reply" },
    edit: { TR: "Düzenle", EN: "Edit" },
    edited: { TR: "(düzenlendi)", EN: "(edited)" },
    editLabel: { TR: "Mesajı düzenle", EN: "Edit message" },
    editHint: { TR: "Kaydetmek için Enter, vazgeçmek için Esc", EN: "Enter to save, Esc to cancel" },
    save: { TR: "Kaydet", EN: "Save" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    original: { TR: "Yanıtlanan mesaja git", EN: "Go to the replied message" },
    quoteDeleted: { TR: "Bu mesaj silindi.", EN: "This message was deleted." },
    openProfile: { TR: "{name} profil kartını aç", EN: "Open {name}'s profile card" },
    copy: { TR: "Metni kopyala", EN: "Copy text" },
    forward: { TR: "İlet", EN: "Forward" },
    forwarded: { TR: "İletildi", EN: "Forwarded" },
    star: { TR: "Yıldızla", EN: "Star" },
    unstar: { TR: "Yıldızı kaldır", EN: "Unstar" },
    pin: { TR: "Sabitle", EN: "Pin" },
    unpin: { TR: "Sabitlemeyi kaldır", EN: "Unpin" },
    delete: { TR: "Sil", EN: "Delete" },
    pinned: { TR: "Sabitlendi", EN: "Pinned" },
    sending: { TR: "Gönderiliyor", EN: "Sending" },
    voice: { TR: "Sesli mesaj, {seconds} sn", EN: "Voice message, {seconds}s" },
    play: { TR: "Sesli mesajı oynat", EN: "Play voice message" },
    stop: { TR: "Durdur", EN: "Stop" },
    reactedBy: { TR: "{names} tepki verdi", EN: "{names} reacted" },
    actions: { TR: "Mesaj işlemleri", EN: "Message actions" },
    system: { TR: "Hanogt", EN: "Hanogt" },
    mentionedYou: { TR: "Senden bahsedildi", EN: "You were mentioned" },
} satisfies Record<string, Copy>;

function Highlighted({ text, needle }: { text: string; needle: string }) {
    const lower = text.toLocaleLowerCase();
    // Some letters change length when lower-cased (e.g. "İ"); highlighting is skipped rather than misaligned.
    if (!needle || lower.length !== text.length) return <>{text}</>;
    const parts: ReactNode[] = [];
    let cursor = 0;
    let index = lower.indexOf(needle);
    while (index >= 0 && needle) {
        if (index > cursor) parts.push(text.slice(cursor, index));
        parts.push(<mark key={index} className="rounded bg-amber-300/70 px-0.5 text-inherit dark:bg-amber-400/40">{text.slice(index, index + needle.length)}</mark>);
        cursor = index + needle.length;
        index = lower.indexOf(needle, cursor);
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return <>{parts}</>;
}

/**
 * A message's text with the chat's Markdown, @mentions (yours highlighted),
 * #topics, links and search highlights; nothing is rendered as HTML.
 */
export function RichText({ text, needle, onTopic, className }: { text: string; needle: string; onTopic: (topic: string) => void; className?: string }) {
    const { me, usernames } = useWorkspace();
    const ownName = me.username.toLocaleLowerCase();
    const renderText = useCallback((content: string, key: string) => tokenizeMessage(content, [...usernames, BOT_NAMES.ai]).map((segment, index) => {
        const id = `${key}-${index}`;
        if (segment.kind === "mention") {
            const own = segment.everyone || segment.username.toLocaleLowerCase() === ownName;
            return <span key={id} className={cx("rounded px-0.5 font-semibold", own ? "bg-amber-400/30 text-amber-900 dark:text-amber-200" : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300")}>{segment.text}</span>;
        }
        if (segment.kind === "topic") {
            return <button key={id} type="button" onClick={() => onTopic(segment.topic)} className="font-semibold text-fuchsia-600 hover:underline dark:text-fuchsia-400">{segment.text}</button>;
        }
        if (segment.kind === "link") {
            return <a key={id} href={segment.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-indigo-600 underline decoration-indigo-500/40 underline-offset-2 hover:decoration-indigo-500 dark:text-indigo-400">{segment.text}</a>;
        }
        return <Highlighted key={id} text={segment.text} needle={needle} />;
    }), [needle, onTopic, ownName, usernames]);
    return <ChatMarkdown text={text} renderText={renderText} className={cx("text-sm leading-6", className)} />;
}

export type ReactionOverrides = Map<string, boolean>;

type MessageItemProps = {
    message: GroupChatMessage;
    compact: boolean;
    pinned: boolean;
    starred: boolean;
    mentionsMe: boolean;
    needle: string;
    active: boolean;
    playing: boolean;
    loadingVoice: boolean;
    reactionOverrides: ReactionOverrides;
    /** Message text size and line height from the messaging settings. */
    fontClass: string;
    gifAutoplay: boolean;
    onActivate: (messageId: string) => void;
    onToggleVoice: (message: GroupChatMessage) => void;
    onReact: (message: GroupChatMessage, reaction: GroupReactionKey) => void;
    onTogglePin: (message: GroupChatMessage) => void;
    onToggleStar: (message: GroupChatMessage) => void;
    onForward: (message: GroupChatMessage) => void;
    onDelete: (message: GroupChatMessage) => void;
    onReply: (message: GroupChatMessage) => void;
    onCopy: (message: GroupChatMessage) => void;
    onTopic: (topic: string) => void;
    /** Inline editing of an own text message. */
    editing: boolean;
    onStartEdit: (message: GroupChatMessage) => void;
    onCancelEdit: () => void;
    onSaveEdit: (message: GroupChatMessage, text: string) => Promise<void>;
    /** Scrolls to the message a reply points to. */
    onJump: (messageId: string) => void;
    /** Who wrote the message this one replies to ("" when it isn't loaded). */
    replyAuthor: string;
    /** Clicking an avatar or a name opens the person's profile card. */
    onOpenUser?: (email: string, trigger: HTMLElement) => void;
};

const ROLE_NAME = { owner: "text-amber-600 dark:text-amber-400", admin: "text-indigo-600 dark:text-indigo-300", moderator: "text-emerald-600 dark:text-emerald-400", member: "text-zinc-900 dark:text-white" } as const;

function MessageItemView(props: MessageItemProps) {
    const { message, compact, pinned, starred, mentionsMe, needle, active, playing, loadingVoice, reactionOverrides, fontClass, gifAutoplay, onActivate, onToggleVoice, onReact, onTogglePin, onDelete, onReply, onCopy, onTopic, editing, onOpenUser } = props;
    const { tx, locale, language } = useI18n();
    const { me, role, memberByKey, memberByEmail, group } = useWorkspace();
    const [picker, setPicker] = useState(false);
    const system = message.type === "system" || message.fromEmail === SYSTEM_SENDER;
    const bot = message.bot;
    const mine = message.fromEmail === me.email;
    const author = memberByEmail.get(message.fromEmail);
    const moderator = canModerate(role);
    const manager = isManagerRole(role);
    // Authors delete their own messages; moderators those of lower ranks and the bots'; owners and admins any.
    const canDelete = !message.pending && (mine || manager || (moderator && !system && (Boolean(bot) || !author || outranks(role, author.role))));
    const canEdit = mine && message.type === "text" && !message.pending && !bot;
    const canForward = !message.pending && !system && (message.type === "text" || message.type === "gif") && message.botState !== "thinking";
    const closePicker = () => setPicker(false);
    const reply = message.replyTo;
    const replyName = props.replyAuthor;
    const lang = language === "TR" ? "TR" : "EN";

    const reactions = GROUP_REACTIONS.map((reaction) => {
        const keys = (message.reactions[reaction.key] ?? []).filter((key) => memberByKey.has(key));
        const actual = keys.includes(me.key);
        const override = reactionOverrides.get(`${message.id}:${reaction.key}`);
        const mineNow = override ?? actual;
        const count = keys.length + (override === undefined || override === actual ? 0 : override ? 1 : -1);
        const names = keys.map((key) => memberByKey.get(key)?.username).filter((name): name is string => Boolean(name));
        return { ...reaction, count, mine: mineNow, names };
    }).filter((reaction) => reaction.count > 0);

    const toolbar = !message.pending && (
        <div
            className={cx("absolute -top-4 end-2 z-10 flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-white p-0.5 shadow-lg transition dark:border-white/10 dark:bg-zinc-800", active || picker ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100")}
            role="toolbar"
            aria-label={tx(C.actions)}
            onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setPicker(false); }}
        >
            <ToolButton label={tx(C.react)} onClick={() => setPicker((value) => !value)}><Smile className="h-4 w-4" aria-hidden /></ToolButton>
            {!system && <ToolButton label={tx(C.reply)} onClick={() => onReply(message)}><CornerUpLeft className="h-4 w-4" aria-hidden /></ToolButton>}
            {canForward && <ToolButton label={tx(C.forward)} onClick={() => props.onForward(message)}><CornerUpRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden /></ToolButton>}
            {canEdit && <ToolButton label={tx(C.edit)} onClick={() => props.onStartEdit(message)}><Pencil className="h-4 w-4" aria-hidden /></ToolButton>}
            {(message.type === "text" || system) && message.botState !== "thinking" && <ToolButton label={tx(C.copy)} onClick={() => onCopy(message)}><CopyIcon className="h-4 w-4" aria-hidden /></ToolButton>}
            {!system && <ToolButton label={tx(starred ? C.unstar : C.star)} onClick={() => props.onToggleStar(message)}><Star className={cx("h-4 w-4", starred && "fill-amber-400 text-amber-500")} aria-hidden /></ToolButton>}
            {moderator && <ToolButton label={tx(pinned ? C.unpin : C.pin)} onClick={() => onTogglePin(message)}>{pinned ? <PinOff className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}</ToolButton>}
            {canDelete && <ToolButton danger label={tx(C.delete)} onClick={() => onDelete(message)}><Trash2 className="h-4 w-4" aria-hidden /></ToolButton>}
            <AnimatePresence>
                {picker && (
                    <motion.div initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.96 }} transition={{ duration: 0.12 }} className="absolute end-0 top-full mt-1 flex gap-0.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-zinc-800">
                        {GROUP_REACTIONS.map((reaction) => (
                            <button key={reaction.key} type="button" onClick={() => { setPicker(false); onReact(message, reaction.key); }} className="rounded-lg p-1.5 text-lg leading-none transition hover:scale-125 hover:bg-zinc-100 dark:hover:bg-zinc-700" aria-label={tx(reaction.label)} title={tx(reaction.label)}>{reaction.emoji}</button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    const reactionRow = reactions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
            {reactions.map((reaction) => (
                <button key={reaction.key} type="button" onClick={() => onReact(message, reaction.key)} aria-pressed={reaction.mine} title={reaction.names.length ? tx(C.reactedBy, { names: reaction.names.join(", ") }) : tx(reaction.label)} className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition", reaction.mine ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300")}>
                    <span className="text-sm leading-none">{reaction.emoji}</span>{reaction.count}
                </button>
            ))}
        </div>
    );

    if (system) {
        if (message.event === "welcome") {
            const template = message.template ? getGroupTemplate(message.template) : null;
            return (
                <div id={`msg-${message.id}`} className="group relative mx-3 my-2 scroll-mt-24" onClick={() => onActivate(message.id)} onMouseLeave={closePicker}>
                    {toolbar}
                    <div className="overflow-hidden rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] p-4">
                        <div className="flex items-center gap-2">
                            <GroupTile emoji={group.emoji} color={group.color} size="xs" />
                            <span className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{tx(C.system)}</span>
                            {pinned && <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300"><Pin className="h-3 w-3" aria-hidden />{tx(C.pinned)}</span>}
                        </div>
                        <RichText className="mt-2 text-zinc-700 dark:text-zinc-200" text={template ? tx(template.welcome, { group: group.name }) : message.text} needle={needle} onTopic={onTopic} />
                        {reactionRow}
                    </div>
                </div>
            );
        }
        const copy = message.event ? GROUP_SYSTEM_EVENT_COPY[message.event] : null;
        return (
            <div id={`msg-${message.id}`} className="group relative my-2 flex justify-center px-3 scroll-mt-24" onClick={() => onActivate(message.id)} onMouseLeave={closePicker}>
                {manager && toolbar}
                <div className="flex max-w-full flex-col items-center">
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />
                        <span className="truncate">{copy ? tx(copy, { name: message.vars.name || "—" }) : message.text}</span>
                        <time className="shrink-0 text-[10px] text-zinc-400" dateTime={new Date(message.createdAt).toISOString()}>{clockTime(message.createdAt, locale)}</time>
                    </span>
                    {reactionRow}
                </div>
            </div>
        );
    }

    const openUser = (event: { currentTarget: HTMLElement }) => onOpenUser?.(message.fromEmail, event.currentTarget);
    const name = bot ? tx(BOT_LABEL[bot]) : author?.username ?? message.author;
    const notice = bot ? noticeOf(message, tx, lang) : null;

    let body: ReactNode;
    if (editing) {
        body = <EditBox message={message} onCancel={props.onCancelEdit} onSave={props.onSaveEdit} />;
    } else if (message.type === "voice") {
        body = (
            <button type="button" onClick={() => onToggleVoice(message)} className={cx("mt-1 inline-flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-sm transition", playing ? "border-indigo-500/50 bg-indigo-500/10" : "border-zinc-200 bg-white hover:border-indigo-500/40 dark:border-white/10 dark:bg-zinc-900")} aria-label={playing ? tx(C.stop) : tx(C.play)}>
                <span className={cx("flex h-8 w-8 items-center justify-center rounded-full text-white", playing ? "bg-indigo-600" : "bg-zinc-900 dark:bg-zinc-700")}>
                    {loadingVoice ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : playing ? <Pause className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
                </span>
                <span className="flex h-6 items-end gap-0.5" aria-hidden>
                    {[0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8, 0.55, 0.95, 0.5].map((height, index) => (
                        <span key={index} className={cx("w-1 rounded-full bg-indigo-500/70", playing && "animate-pulse")} style={{ height: `${Math.round(height * 100)}%`, animationDelay: `${index * 80}ms` }} />
                    ))}
                </span>
                <span className="tabular-nums text-xs font-semibold text-zinc-500 dark:text-zinc-400">{tx(C.voice, { seconds: message.voiceDuration || 0 })}</span>
            </button>
        );
    } else if (message.type === "gif" && message.gif) {
        body = <GifView gif={message.gif} autoplay={gifAutoplay} />;
    } else if (message.botState === "thinking") {
        body = <div className="mt-0.5"><ThinkingDots /></div>;
    } else if (message.botState === "failed" || message.botEvent === "ai_failed") {
        body = <p className={cx("italic text-zinc-500 dark:text-zinc-400", fontClass)}>{tx(BOT_EVENT_COPY.ai_failed)}</p>;
    } else if (notice) {
        body = <p className={cx("whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-200", fontClass)}>{notice}</p>;
    } else {
        body = (
            <>
                {message.botEvent === "custom" && <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{customCommandLine(message.vars, tx)}</p>}
                <RichText text={message.text} needle={needle} onTopic={onTopic} className={cx("text-zinc-800 dark:text-zinc-100", fontClass)} />
                {message.edited && <span className="text-[11px] text-zinc-400">{tx(C.edited)}</span>}
            </>
        );
    }

    const avatar = bot
        ? <BotAvatar bot={bot} size={36} className="mt-0.5" />
        : onOpenUser ? (
            <button type="button" onClick={openUser} className="mt-0.5 rounded-full transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label={tx(C.openProfile, { name })}>
                <UserAvatar name={message.author} src={author?.avatarUrl ?? message.authorAvatar} size="sm" />
            </button>
        ) : <UserAvatar name={message.author} src={author?.avatarUrl ?? message.authorAvatar} size="sm" className="mt-0.5" />;

    return (
        <div
            id={`msg-${message.id}`}
            className={cx(
                "group relative px-3 scroll-mt-24 transition-colors",
                compact ? "py-0.5" : "pt-2.5 pb-0.5",
                mentionsMe ? "border-s-2 border-amber-500 bg-amber-500/[0.07]" : "",
                active || editing ? "bg-zinc-100/80 dark:bg-white/[0.04]" : "hover:bg-zinc-50 dark:hover:bg-white/[0.025]",
                message.pending && "opacity-70",
            )}
            onClick={(event) => {
                if (!(event.target instanceof Element) || !event.target.closest("a,button,textarea")) onActivate(message.id);
            }}
            onMouseLeave={closePicker}
        >
            {!editing && toolbar}
            {reply && (
                <button type="button" onClick={() => props.onJump(reply.id)} className="relative mb-0.5 ms-12 flex max-w-[calc(100%-3rem)] items-center gap-1.5 text-start text-[13px] text-zinc-500 before:absolute before:-start-7 before:top-1/2 before:h-3 before:w-6 before:rounded-ss-md before:border-s-2 before:border-t-2 before:border-zinc-300 hover:text-zinc-800 dark:text-zinc-400 dark:before:border-zinc-600 dark:hover:text-zinc-200" aria-label={tx(C.original)}>
                    {replyName && <span className="shrink-0 font-semibold">@{replyName}</span>}
                    <span className={cx("truncate", reply.deleted && "italic")}>{reply.deleted ? tx(C.quoteDeleted) : reply.text}</span>
                </button>
            )}
            <div className="flex gap-3">
                <div className="w-9 shrink-0">
                    {!compact ? avatar : (
                        <time dateTime={new Date(message.createdAt).toISOString()} title={fullDateTime(message.createdAt, locale)} className="hidden pt-0.5 text-end text-[10px] leading-5 text-zinc-400 group-hover:block">{clockTime(message.createdAt, locale)}</time>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    {!compact && (
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            {bot
                                ? <span className={cx("truncate text-sm font-bold", bot === "security" ? "text-emerald-700 dark:text-emerald-400" : "text-indigo-600 dark:text-indigo-300")}>{name}</span>
                                : onOpenUser
                                    ? <button type="button" onClick={openUser} className={cx("truncate text-sm font-bold hover:underline focus-visible:underline focus-visible:outline-none", ROLE_NAME[author?.role ?? "member"])}>{name}</button>
                                    : <span className={cx("truncate text-sm font-bold", ROLE_NAME[author?.role ?? "member"])}>{name}</span>}
                            {bot ? <BotTag /> : author && <RoleBadge role={author.role} compact />}
                            <time className="text-[11px] text-zinc-400" dateTime={new Date(message.createdAt).toISOString()} title={fullDateTime(message.createdAt, locale)}>{clockTime(message.createdAt, locale)}</time>
                            {pinned && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"><Pin className="h-3 w-3" aria-hidden />{tx(C.pinned)}</span>}
                            {starred && <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-label={tx(C.unstar)} />}
                            {mentionsMe && <span className="sr-only">{tx(C.mentionedYou)}</span>}
                            {message.pending && <Clock3 className="h-3 w-3 text-zinc-400" aria-label={tx(C.sending)} />}
                        </div>
                    )}
                    {message.forwarded && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold italic text-zinc-500 dark:text-zinc-400"><Forward className="h-3 w-3 rtl:-scale-x-100" aria-hidden />{tx(C.forwarded)}</p>
                    )}
                    <div className={cx(message.forwarded && "border-s-2 border-zinc-300 ps-2.5 dark:border-zinc-600")}>{body}</div>
                    {compact && message.pending && <Clock3 className="h-3 w-3 text-zinc-400" aria-label={tx(C.sending)} />}
                    {reactionRow}
                </div>
            </div>
        </div>
    );
}

/** Inline editor of an own message (Enter saves, Escape cancels; like Discord). */
function EditBox({ message, onCancel, onSave }: { message: GroupChatMessage; onCancel: () => void; onSave: (message: GroupChatMessage, text: string) => Promise<void> }) {
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
                maxLength={4000}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={onKeyDown}
                aria-label={tx(C.editLabel)}
                className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950"
            />
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span>{tx(C.editHint)}</span>
                <button type="button" onClick={onCancel} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{tx(C.cancel)}</button>
                <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-300">{busy && <Spinner className="h-3 w-3" />}{tx(C.save)}</button>
            </p>
        </div>
    );
}

function ToolButton({ label, onClick, danger = false, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
    return (
        <button type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} className={cx("rounded-lg p-1.5 transition", danger ? "text-red-500 hover:bg-red-500/10" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-white")} aria-label={label} title={label}>
            {children}
        </button>
    );
}

const MessageItem = memo(MessageItemView);
export default MessageItem;
