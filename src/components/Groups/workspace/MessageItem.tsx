"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock3, Copy as CopyIcon, CornerUpLeft, LoaderCircle, Mic, Pause, Pin, PinOff, Smile, Sparkles, Trash2 } from "lucide-react";
import { memo, useMemo, useState, type ReactNode } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    GROUP_REACTIONS,
    GROUP_SYSTEM_EVENT_COPY,
    SYSTEM_SENDER,
    getGroupTemplate,
    tokenizeMessage,
    type GroupReactionKey,
} from "@/lib/groups";
import { GroupTile, RoleBadge, UserAvatar, clockTime, cx, fullDateTime } from "../ui";
import { useWorkspace } from "./context";
import type { GroupChatMessage } from "./model";

const C = {
    react: { TR: "Tepki ver", EN: "React" },
    quote: { TR: "Alıntıla", EN: "Quote" },
    copy: { TR: "Metni kopyala", EN: "Copy text" },
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

/** Plain text with @mentions, #topics, links and "> " quote lines; nothing is rendered as HTML. */
export function RichText({ text, needle, onTopic, className }: { text: string; needle: string; onTopic: (topic: string) => void; className?: string }) {
    const { me, usernames } = useWorkspace();
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
    const ownName = me.username.toLocaleLowerCase();
    const render = (content: string) => tokenizeMessage(content, usernames).map((segment, index) => {
        if (segment.kind === "mention") {
            const own = segment.everyone || segment.username.toLocaleLowerCase() === ownName;
            return <span key={index} className={cx("rounded px-0.5 font-semibold", own ? "bg-amber-400/30 text-amber-900 dark:text-amber-200" : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300")}>{segment.text}</span>;
        }
        if (segment.kind === "topic") {
            return <button key={index} type="button" onClick={() => onTopic(segment.topic)} className="font-semibold text-fuchsia-600 hover:underline dark:text-fuchsia-400">{segment.text}</button>;
        }
        if (segment.kind === "link") {
            return <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-indigo-600 underline decoration-indigo-500/40 underline-offset-2 hover:decoration-indigo-500 dark:text-indigo-400">{segment.text}</a>;
        }
        return <Highlighted key={index} text={segment.text} needle={needle} />;
    });
    return (
        <div className={cx("break-words text-sm leading-6", className)}>
            {blocks.map((block, index) => block.quote
                ? <blockquote key={index} className="my-1 whitespace-pre-wrap border-s-2 border-zinc-300 ps-2.5 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">{render(block.lines.join("\n"))}</blockquote>
                : <p key={index} className="whitespace-pre-wrap">{render(block.lines.join("\n"))}</p>)}
        </div>
    );
}

export type ReactionOverrides = Map<string, boolean>;

type MessageItemProps = {
    message: GroupChatMessage;
    compact: boolean;
    pinned: boolean;
    mentionsMe: boolean;
    needle: string;
    active: boolean;
    playing: boolean;
    loadingVoice: boolean;
    reactionOverrides: ReactionOverrides;
    onActivate: (messageId: string) => void;
    onToggleVoice: (message: GroupChatMessage) => void;
    onReact: (message: GroupChatMessage, reaction: GroupReactionKey) => void;
    onTogglePin: (message: GroupChatMessage) => void;
    onDelete: (message: GroupChatMessage) => void;
    onQuote: (message: GroupChatMessage) => void;
    onCopy: (message: GroupChatMessage) => void;
    onTopic: (topic: string) => void;
};

function MessageItemView(props: MessageItemProps) {
    const { message, compact, pinned, mentionsMe, needle, active, playing, loadingVoice, reactionOverrides, onActivate, onToggleVoice, onReact, onTogglePin, onDelete, onQuote, onCopy, onTopic } = props;
    const { tx, locale } = useI18n();
    const { me, isManager, memberByKey, memberByEmail, group } = useWorkspace();
    const [picker, setPicker] = useState(false);
    const system = message.type === "system" || message.fromEmail === SYSTEM_SENDER;
    const mine = message.fromEmail === me.email;
    const author = memberByEmail.get(message.fromEmail);
    const canDelete = mine || isManager;
    const closePicker = () => setPicker(false);

    const reactions = GROUP_REACTIONS.map((reaction) => {
        const keys = (message.reactions[reaction.key] ?? []).filter((key) => memberByKey.has(key));
        const actual = keys.includes(me.key);
        const override = reactionOverrides.get(`${message.id}:${reaction.key}`);
        const mineNow = override ?? actual;
        const count = keys.length + (override === undefined || override === actual ? 0 : override ? 1 : -1);
        const names = keys.map((key) => memberByKey.get(key)?.username).filter((name): name is string => Boolean(name));
        return { ...reaction, count, mine: mineNow, names };
    }).filter((reaction) => reaction.count > 0);

    const toolbar = (
        <div
            className={cx("absolute -top-4 end-2 z-10 flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-white p-0.5 shadow-lg transition dark:border-white/10 dark:bg-zinc-800", active || picker ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100")}
            role="toolbar"
            aria-label={tx(C.actions)}
            onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setPicker(false); }}
        >
            <ToolButton label={tx(C.react)} onClick={() => setPicker((value) => !value)}><Smile className="h-4 w-4" aria-hidden /></ToolButton>
            {!system && <ToolButton label={tx(C.quote)} onClick={() => onQuote(message)}><CornerUpLeft className="h-4 w-4" aria-hidden /></ToolButton>}
            {message.type !== "voice" && <ToolButton label={tx(C.copy)} onClick={() => onCopy(message)}><CopyIcon className="h-4 w-4" aria-hidden /></ToolButton>}
            {isManager && <ToolButton label={tx(pinned ? C.unpin : C.pin)} onClick={() => onTogglePin(message)}>{pinned ? <PinOff className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}</ToolButton>}
            {canDelete && (!system || isManager) && <ToolButton danger label={tx(C.delete)} onClick={() => onDelete(message)}><Trash2 className="h-4 w-4" aria-hidden /></ToolButton>}
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
                    <div className="overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] via-violet-500/[0.06] to-fuchsia-500/[0.08] p-4">
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
                {isManager && toolbar}
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

    return (
        <div
            id={`msg-${message.id}`}
            className={cx(
                "group relative flex gap-3 px-3 scroll-mt-24 transition-colors",
                compact ? "py-0.5" : "pt-2.5 pb-0.5",
                mentionsMe ? "border-s-2 border-amber-500 bg-amber-500/[0.07]" : mine ? "bg-indigo-500/[0.035]" : "",
                active ? "bg-zinc-100/80 dark:bg-white/[0.04]" : "hover:bg-zinc-50 dark:hover:bg-white/[0.025]",
                message.pending && "opacity-70",
            )}
            onClick={(event) => {
                if (!(event.target instanceof Element) || !event.target.closest("a,button")) onActivate(message.id);
            }}
            onMouseLeave={closePicker}
        >
            {toolbar}
            <div className="w-9 shrink-0">
                {!compact && <UserAvatar name={message.author} src={author?.avatarUrl ?? message.authorAvatar} size="sm" className="mt-0.5" />}
            </div>
            <div className="min-w-0 flex-1">
                {!compact && (
                    <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="truncate text-sm font-bold">{author?.username ?? message.author}</span>
                        {author && <RoleBadge role={author.role} compact />}
                        <time className="text-[11px] text-zinc-400" dateTime={new Date(message.createdAt).toISOString()} title={fullDateTime(message.createdAt, locale)}>{clockTime(message.createdAt, locale)}</time>
                        {pinned && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"><Pin className="h-3 w-3" aria-hidden />{tx(C.pinned)}</span>}
                        {mentionsMe && <span className="sr-only">{tx(C.mentionedYou)}</span>}
                        {message.pending && <Clock3 className="h-3 w-3 text-zinc-400" aria-label={tx(C.sending)} />}
                    </div>
                )}
                {message.type === "voice" ? (
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
                ) : (
                    <RichText text={message.text} needle={needle} onTopic={onTopic} className="text-zinc-800 dark:text-zinc-100" />
                )}
                {reactionRow}
            </div>
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
