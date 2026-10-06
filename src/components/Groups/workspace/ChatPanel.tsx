"use client";

import { doc, getDoc } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ChevronUp, Hash, MessageSquare, Pin, PinOff, Timer, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BOT_LABEL, BotAvatar, EphemeralCard } from "@/components/Social/chat/bots";
import Composer, { type ComposerSuggestion } from "@/components/Social/chat/Composer";
import { useSocial } from "@/components/Social/context";
import { db } from "@/lib/firebase";
import { useI18n, type Copy } from "@/lib/i18n";
import { SocialRequestError, socialApi } from "@/lib/social/api";
import { AUTOMOD_BLOCKED_COPY, AUTOMOD_RULE_COPY, isAutoModRule } from "@/lib/social/automod-config";
import { formatDuration, type EphemeralReply } from "@/lib/social/bots";
import { suggestCommands } from "@/lib/social/commands";
import { rankByQuery, type ComposerTrigger } from "@/lib/social/composer";
import type { GifItem } from "@/lib/social/gif";
import { markGroupRead } from "@/lib/social/local-state";
import { messagePreview } from "@/lib/social/model";
import { CHAT_BACKGROUND_CLASS, MESSAGE_FONT_CLASS } from "@/lib/social/prefs";
import {
    BOT_NAMES,
    GROUP_LIMITS,
    GROUP_SYSTEM_EVENT_COPY,
    SYSTEM_SENDER,
    canModerate,
    channelKey,
    getGroupTemplate,
    mentionsUser,
    tokenizeMessage,
    type GroupReactionKey,
} from "@/lib/groups";
import { GroupRequestError, groupsApi } from "../api";
import { Spinner, UI_COPY, UserAvatar, clockTime, copyText, cx, dayKey } from "../ui";
import { useWorkspace } from "./context";
import { useVoicePlayer } from "./hooks";
import MessageItem, { RichText, type ReactionOverrides } from "./MessageItem";
import { messageFromData, type GroupChatMessage } from "./model";

const C = {
    loadOlder: { TR: "Daha eski mesajları yükle", EN: "Load older messages" },
    newMessages: { TR: "Yeni mesajlar", EN: "New messages" },
    jumpNew: { TR: "{count} yeni mesaj", EN: "{count} new messages" },
    emptyTitle: { TR: "Sohbeti başlat", EN: "Start the conversation" },
    emptyText: { TR: "İlk mesajı yaz; @ ile birinden bahset, # ile kanal seç, / ile komutları gör.", EN: "Write the first message; use @ to mention someone, # for a channel and / for commands." },
    noResults: { TR: "Eşleşen mesaj yok.", EN: "No matching messages." },
    placeholderChannel: { TR: "#{channel} kanalına mesaj gönder", EN: "Message #{channel}" },
    composerLabel: { TR: "#{channel} kanalına mesaj", EN: "Message to #{channel}" },
    voiceText: { TR: "Sesli mesaj ({seconds} sn)", EN: "Voice message ({seconds}s)" },
    typingOne: { TR: "yazıyor…", EN: "is typing…" },
    typingAnd: { TR: "ve", EN: "and" },
    typingTwo: { TR: "yazıyor…", EN: "are typing…" },
    typingMany: { TR: "Birkaç kişi yazıyor…", EN: "Several people are typing…" },
    everyoneHint: { TR: "Gruptaki herkese bildir", EN: "Notify everyone in the group" },
    aiHint: { TR: "Hanogt AI'a sor", EN: "Ask Hanogt AI" },
    botHint: { TR: "BOT", EN: "BOT" },
    customHint: { TR: "Grup", EN: "Group" },
    pinnedTitle: { TR: "Sabitlenen mesajlar", EN: "Pinned messages" },
    pinnedEmpty: { TR: "Henüz sabitlenen mesaj yok.", EN: "No pinned messages yet." },
    pinnedHint: { TR: "Moderatörler bir mesajın üzerine gelip 📌 simgesiyle onu buraya sabitleyebilir.", EN: "Moderators can hover a message and use 📌 to pin it here." },
    jumpTo: { TR: "Mesaja git", EN: "Go to message" },
    unpin: { TR: "Sabitlemeyi kaldır", EN: "Unpin" },
    pinnedToast: { TR: "Mesaj sabitlendi.", EN: "Message pinned." },
    unpinnedToast: { TR: "Sabitleme kaldırıldı.", EN: "Message unpinned." },
    deleteTitle: { TR: "Mesaj silinsin mi?", EN: "Delete this message?" },
    deleteBody: { TR: "Mesaj herkes için kalıcı olarak silinir.", EN: "The message is permanently deleted for everyone." },
    deleteConfirm: { TR: "Mesajı sil", EN: "Delete message" },
    deleted: { TR: "Mesaj silindi.", EN: "Message deleted." },
    copied: { TR: "Mesaj panoya kopyalandı.", EN: "Message copied to the clipboard." },
    notLoaded: { TR: "Bu mesaj sohbette yüklü değil; içeriğini sabitlenenler listesinden okuyabilirsin.", EN: "This message isn't loaded in the chat; you can read it in the pinned list." },
    voiceMessage: { TR: "🎤 Sesli mesaj", EN: "🎤 Voice message" },
    gifMessage: { TR: "GIF", EN: "GIF" },
    missing: { TR: "Bu mesaj silinmiş.", EN: "This message was deleted." },
    unavailable: { TR: "Bu mesaj şu anda yüklenemiyor.", EN: "This message can't be loaded right now." },
    slowmode: { TR: "Yavaş mod açık: iki mesaj arasında {duration}.", EN: "Slow mode is on: {duration} between two messages." },
} satisfies Record<string, Copy>;

const FLASH_CLASSES = ["ring-2", "ring-indigo-500/60", "bg-indigo-500/10"];
const GROUPING_WINDOW_MS = 5 * 60_000;

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

function hasTopic(text: string, topic: string) {
    return text.includes("#") && tokenizeMessage(text, []).some((segment) => segment.kind === "topic" && segment.topic === topic);
}

let localSerial = 0;
/** A local id for a message on its way (server ids never contain "~"). */
const localId = () => `pending~${Date.now().toString(36)}${(localSerial += 1).toString(36)}`;

/** Pin toggle shared by the chat and the pinned list (moderators and up). */
function usePinToggle() {
    const { tx } = useI18n();
    const { groupId, group, notify, errorText } = useWorkspace();
    const pinnedIds = group.pinnedMessageIds;
    return useCallback(async (messageId: string) => {
        const pinned = pinnedIds.includes(messageId);
        try {
            await groupsApi.chat({ action: pinned ? "unpin" : "pin", groupId, messageId });
            notify(tx(pinned ? C.unpinnedToast : C.pinnedToast), "success");
        } catch (error) {
            notify(errorText(error), "error");
        }
    }, [errorText, groupId, notify, pinnedIds, tx]);
}

type Ephemeral = { id: string; reply: EphemeralReply; channel: string };

type ChatPanelProps = {
    messages: GroupChatMessage[];
    loaded: boolean;
    hasMore: boolean;
    onLoadOlder: () => void;
    lastReadAt: number;
    visible: boolean;
    typingNames: string[];
    onTyping: (text: string) => void;
    onStopTyping: () => void;
    focusNonce: number;
    jumpTarget: { id: string; nonce: number } | null;
    /** The open channel: a #topic, or "" for the main one. */
    topic: string;
    onTopicChange: (topic: string) => void;
    search: string;
    /** Name of the main channel (e.g. "genel"). */
    channelName: string;
    /** Called after a change went through the server (the list then re-reads at once without the live connection). */
    onServerChange?: () => void;
    /** Clicking an avatar or a name opens the person's profile card. */
    onOpenUser?: (email: string, trigger: HTMLElement) => void;
};

/**
 * A group channel of Hanogt Social: the messages (Markdown, GIFs, voice,
 * bots, reactions, replies, pins and stars), what only you see from the
 * bots, and the message box. Every message goes through the server, so it
 * shows at once as "sending" and the bots' answers arrive with it.
 */
export default function ChatPanel({ messages, loaded, hasMore, onLoadOlder, lastReadAt, visible, typingNames, onTyping, onStopTyping, focusNonce, jumpTarget, topic, onTopicChange, search, channelName, onServerChange, onOpenUser }: ChatPanelProps) {
    const { tx, locale, language } = useI18n();
    const { groupId, group, me, role, members, usernames, now, notify, confirm, errorText, live } = useWorkspace();
    const social = useSocial();
    const { prefs } = social;
    const lang = language === "TR" ? "TR" : "EN";
    const [activeMessage, setActiveMessage] = useState("");
    const [replyTo, setReplyTo] = useState<GroupChatMessage | null>(null);
    const [editingId, setEditingId] = useState("");
    const [overrides, setOverrides] = useState<Record<string, boolean>>({});
    const [seenUntil, setSeenUntil] = useState(lastReadAt);
    const [outbox, setOutbox] = useState<GroupChatMessage[]>([]);
    const [ephemerals, setEphemerals] = useState<Ephemeral[]>([]);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const atBottomRef = useRef(true);
    const restoreRef = useRef<{ height: number; top: number; count: number; at: number } | null>(null);
    const initialDoneRef = useRef(false);
    const lastIdRef = useRef("");
    const pinToggle = usePinToggle();
    const { playingId, loadingId, toggle: toggleVoicePlayback } = useVoicePlayer({ groupId, onError: (code) => notify(errorText(code), "error") });
    const channel = channelKey(topic);
    const moderator = canModerate(role);

    const pinnedIds = group.pinnedMessageIds;
    const needle = search.trim().toLocaleLowerCase();
    const filtering = Boolean(needle || topic);

    // Messages on their way stay until the list (live or polled) has the server's copy.
    const knownIds = useMemo(() => new Set(messages.map((message) => message.id)), [messages]);
    const allMessages = useMemo(() => {
        const waiting = outbox.filter((message) => !knownIds.has(message.id));
        return waiting.length ? [...messages, ...waiting].sort((a, b) => a.createdAt - b.createdAt) : messages;
    }, [knownIds, messages, outbox]);
    const latestTime = allMessages.length ? allMessages[allMessages.length - 1].createdAt : 0;

    const renderedText = useCallback((message: GroupChatMessage) => {
        if (message.event === "welcome" && message.template) return tx(getGroupTemplate(message.template).welcome, { group: group.name });
        if (message.event && message.event !== "welcome") return tx(GROUP_SYSTEM_EVENT_COPY[message.event], { name: message.vars.name || "" });
        return message.text;
    }, [group.name, tx]);

    const visibleMessages = useMemo(() => allMessages.filter((message) => {
        if (topic && !hasTopic(message.text, topic)) return false;
        if (!needle) return true;
        return renderedText(message).toLocaleLowerCase().includes(needle) || message.author.toLocaleLowerCase().includes(needle);
    }), [allMessages, needle, renderedText, topic]);

    const dividerId = useMemo(() => {
        if (filtering || !lastReadAt) return "";
        return messages.find((message) => message.createdAt > lastReadAt && message.fromEmail !== me.email && message.type !== "system")?.id ?? "";
    }, [filtering, lastReadAt, me.email, messages]);

    const unseen = useMemo(() => messages.filter((message) => message.createdAt > seenUntil && message.fromEmail !== me.email && message.type !== "system").length, [me.email, messages, seenUntil]);

    const reactionOverrides: ReactionOverrides = useMemo(() => new Map(Object.entries(overrides)), [overrides]);

    const scrollToBottom = useCallback((smooth: boolean) => {
        const element = containerRef.current;
        if (element) element.scrollTo({ top: element.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    }, []);

    const onScroll = () => {
        const element = containerRef.current;
        if (!element) return;
        atBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        if (atBottomRef.current && latestTime > seenUntil) setSeenUntil(latestTime);
    };

    const channelEphemerals = ephemerals.filter((entry) => entry.channel === channel);
    const lastEphemeral = channelEphemerals[channelEphemerals.length - 1]?.id ?? "";

    useLayoutEffect(() => {
        const element = containerRef.current;
        if (!element || !loaded || !visible) return;
        const restore = restoreRef.current;
        if (restore && performance.now() - restore.at > 8000) restoreRef.current = null;
        else if (restore && allMessages.length !== restore.count) {
            // Older messages were prepended: keep the same messages under the reader's eyes.
            element.scrollTop = element.scrollHeight - restore.height + restore.top;
            restoreRef.current = null;
            lastIdRef.current = allMessages[allMessages.length - 1]?.id ?? "";
            return;
        }
        const last = allMessages[allMessages.length - 1];
        const lastKey = `${last?.id ?? ""}|${lastEphemeral}`;
        if (!initialDoneRef.current) {
            initialDoneRef.current = true;
            const divider = dividerId ? document.getElementById(`msg-${dividerId}`) : null;
            if (divider) divider.scrollIntoView({ block: "center" });
            else element.scrollTop = element.scrollHeight;
        } else if (atBottomRef.current || (last && last.fromEmail === me.email && lastKey !== lastIdRef.current)) {
            scrollToBottom(true);
        }
        lastIdRef.current = lastKey;
        // Without a scrollbar no scroll event arrives, so everything on screen counts as seen.
        if (element.scrollHeight <= element.clientHeight + 4) {
            const frame = window.requestAnimationFrame(() => setSeenUntil((value) => Math.max(value, last?.createdAt ?? 0)));
            return () => window.cancelAnimationFrame(frame);
        }
    }, [allMessages, dividerId, lastEphemeral, loaded, me.email, scrollToBottom, visible]);

    // Having the chat on screen counts as reading it (the unread badges in Hanogt Social use this).
    useEffect(() => {
        if (!latestTime || !visible) return;
        if (document.visibilityState === "visible") {
            markGroupRead(groupId, latestTime);
            return;
        }
        const onVisible = () => {
            if (document.visibilityState === "visible") markGroupRead(groupId, latestTime);
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [groupId, latestTime, visible]);

    useEffect(() => {
        if (!jumpTarget) return;
        const element = document.getElementById(`msg-${jumpTarget.id}`);
        if (!element) {
            const timer = window.setTimeout(() => notify(tx(C.notLoaded), "info"), 0);
            return () => window.clearTimeout(timer);
        }
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        element.classList.add(...FLASH_CLASSES);
        const timer = window.setTimeout(() => element.classList.remove(...FLASH_CLASSES), 1800);
        return () => {
            window.clearTimeout(timer);
            element.classList.remove(...FLASH_CLASSES);
        };
    }, [jumpTarget, notify, tx]);

    /* ------------------------------ sending ------------------------------ */

    const authorName = useCallback((message: GroupChatMessage) => {
        if (message.bot) return tx(BOT_LABEL[message.bot]);
        return message.fromEmail === SYSTEM_SENDER ? "Hanogt" : members.find((member) => member.email === message.fromEmail)?.username ?? message.author;
    }, [members, tx]);

    const addEphemeral = useCallback((reply: EphemeralReply) => {
        setEphemerals((current) => [...current.slice(-5), { id: localId(), reply, channel }]);
        atBottomRef.current = true;
    }, [channel]);

    const sendFailed = useCallback((error: unknown) => {
        if (error instanceof GroupRequestError && error.code === "automod_blocked") {
            const rule = error.vars.rule;
            notify(isAutoModRule(rule) ? tx(AUTOMOD_BLOCKED_COPY, { rule: tx(AUTOMOD_RULE_COPY[rule]) }) : errorText(error), "error");
            return;
        }
        notify(error instanceof GroupRequestError ? errorText(error) : errorText("message_failed"), "error");
    }, [errorText, notify, tx]);

    /** Sends through the server; the message shows at once as "sending" (commands wait for their answer). */
    const deliver = useCallback(async (body: { text: string; gif?: GifItem | null }, reply: GroupChatMessage | null) => {
        const command = !body.gif && body.text.startsWith("/");
        const local: GroupChatMessage | null = command ? null : {
            id: localId(),
            fromEmail: me.email,
            author: me.username,
            authorAvatar: me.avatarUrl || null,
            type: body.gif ? "gif" : "text",
            text: body.text,
            voicePath: null,
            voiceDuration: 0,
            createdAt: Date.now(),
            pending: true,
            event: null,
            vars: {},
            template: null,
            reactions: {},
            replyTo: reply ? { id: reply.id, text: messagePreview(renderedText(reply), 120) } : null,
            edited: false,
            gif: body.gif ?? null,
            bot: null,
            botEvent: null,
            botState: null,
            forwarded: false,
        };
        // Copies the list already has are dropped on the way.
        setOutbox((current) => [...current.filter((entry) => !knownIds.has(entry.id)), ...(local ? [local] : [])]);
        atBottomRef.current = true;
        try {
            const result = await groupsApi.send({
                groupId,
                text: body.text,
                ...(body.gif ? { type: "gif", gif: body.gif } : {}),
                ...(reply ? { replyTo: { id: reply.id } } : {}),
                language: lang,
            });
            const stored = result.message && typeof result.message.id === "string" ? messageFromData(result.message.id, result.message, true, Date.now()) : null;
            setOutbox((current) => {
                const rest = local ? current.filter((entry) => entry.id !== local.id) : current;
                return stored ? [...rest, stored] : rest;
            });
            if (result.ephemeral) addEphemeral(result.ephemeral);
            if (!live) onServerChange?.();
            return true;
        } catch (error) {
            if (local) setOutbox((current) => current.filter((entry) => entry.id !== local.id));
            sendFailed(error);
            return false;
        }
    }, [addEphemeral, groupId, knownIds, lang, live, me.avatarUrl, me.email, me.username, onServerChange, renderedText, sendFailed]);

    const sendText = useCallback(async (value: string) => {
        let text = value.slice(0, GROUP_LIMITS.messageMax);
        // In a #topic channel the message carries the topic (that is what puts it in the channel).
        if (topic && !text.startsWith("/") && !hasTopic(text, topic)) text = `#${topic} ${text}`.slice(0, GROUP_LIMITS.messageMax);
        onStopTyping();
        const reply = replyTo;
        setReplyTo(null);
        const sent = await deliver({ text }, reply);
        if (!sent) setReplyTo(reply);
        return sent;
    }, [deliver, onStopTyping, replyTo, topic]);

    const sendGif = useCallback((gif: GifItem) => {
        const reply = replyTo;
        setReplyTo(null);
        void deliver({ text: topic ? `#${topic}` : "", gif }, reply).then((sent) => { if (!sent) setReplyTo(reply); });
    }, [deliver, replyTo, topic]);

    // Through POST /api/social/voice: the server stores the recording and writes the message.
    const sendVoice = useCallback(async (blob: Blob, mimeType: string, seconds: number) => {
        try {
            const label = tx(C.voiceText, { seconds });
            await socialApi.sendGroupVoice(groupId, blob, { seconds, label: topic ? `#${topic} ${label}` : label, type: mimeType });
            atBottomRef.current = true;
            if (!live) onServerChange?.();
        } catch (error) {
            const code = error instanceof SocialRequestError ? error.code : "";
            notify(errorText(code === "voice_too_large" || code === "voice_format" || code === "rate_limited" || code === "network" || code === "not_found" || code === "unauthorized" || code === "muted" ? code : "voice_failed"), "error");
        }
    }, [errorText, groupId, live, notify, onServerChange, topic, tx]);

    /* ---------------------------- suggestions ---------------------------- */

    const aiOn = group.aiBot !== false;
    const suggest = useCallback((trigger: ComposerTrigger): ComposerSuggestion[] => {
        if (trigger.kind === "mention") {
            // @everyone/@herkes are keywords, not translated text.
            const everyoneWord = lang === "TR" ? "herkes" : "everyone";
            const people = rankByQuery(members.filter((member) => member.email !== me.email), trigger.query, (member) => member.username, 8)
                .map((member): ComposerSuggestion => ({ key: member.email, kind: "person", label: member.username, insert: `@${member.username}`, avatar: member.avatarUrl, detail: member.nickname || undefined }));
            const bots: ComposerSuggestion[] = aiOn && rankByQuery([BOT_NAMES.ai], trigger.query, (name) => name).length
                ? [{ key: "bot:ai", kind: "bot", label: BOT_NAMES.ai, insert: `@${BOT_NAMES.ai}`, hint: tx(C.botHint), detail: tx(C.aiHint), icon: <BotAvatar bot="ai" size={24} /> }]
                : [];
            const everyone: ComposerSuggestion[] = everyoneWord.startsWith(trigger.query.toLocaleLowerCase(lang === "TR" ? "tr" : "en")) ? [{ key: "everyone", kind: "everyone", label: `@${everyoneWord}`, insert: `@${everyoneWord}`, detail: tx(C.everyoneHint) }] : [];
            return [...bots, ...people, ...everyone];
        }
        if (trigger.kind === "channel") {
            return rankByQuery([channelName, ...group.topics.filter((entry) => entry !== channelName)], trigger.query, (name) => name, 10)
                .map((name) => ({ key: `channel:${name}`, kind: "channel", label: name, insert: `#${name}` }));
        }
        if (trigger.kind === "command") {
            return suggestCommands(trigger.query, role, lang, group.customCommands)
                .filter((command) => command.bot !== "ai" || aiOn)
                .map((command) => ({
                    key: `command:${command.kind}:${command.name}`,
                    kind: "command",
                    label: `/${command.name}`,
                    insert: `/${command.name}`,
                    detail: `${command.usage === `/${command.name}` ? "" : `${command.usage} — `}${command.description}`,
                    hint: command.bot === "custom" ? tx(C.customHint) : command.bot === "ai" ? "AI" : "Security",
                    icon: command.bot === "custom" ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-black text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300">/</span> : <BotAvatar bot={command.bot} size={24} />,
                }));
        }
        return [];
    }, [aiOn, channelName, group.customCommands, group.topics, lang, me.email, members, role, tx]);

    /* ---------------------------- message actions ---------------------------- */

    const react = useCallback(async (message: GroupChatMessage, reaction: GroupReactionKey) => {
        const key = `${message.id}:${reaction}`;
        const actual = (message.reactions[reaction] ?? []).includes(me.key);
        setOverrides((current) => ({ ...current, [key]: !(current[key] ?? actual) }));
        try {
            await groupsApi.chat({ action: "react", groupId, messageId: message.id, reaction });
            if (!live) onServerChange?.();
            window.setTimeout(() => setOverrides((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            }), 2500);
        } catch (error) {
            setOverrides((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
            notify(errorText(error), "error");
        }
    }, [errorText, groupId, live, me.key, notify, onServerChange]);

    const removeMessage = useCallback(async (message: GroupChatMessage) => {
        const approved = await confirm({ title: tx(C.deleteTitle), body: tx(C.deleteBody), confirmLabel: tx(C.deleteConfirm), tone: "danger" });
        if (!approved) return;
        try {
            await groupsApi.chat({ action: "delete-message", groupId, messageId: message.id });
            setOutbox((current) => current.filter((entry) => entry.id !== message.id));
            if (!live) onServerChange?.();
            notify(tx(C.deleted), "success");
        } catch (error) {
            notify(errorText(error), "error");
        }
    }, [confirm, errorText, groupId, live, notify, onServerChange, tx]);

    const reply = useCallback((message: GroupChatMessage) => {
        if (message.fromEmail === SYSTEM_SENDER) return;
        setReplyTo(message);
        setEditingId("");
    }, []);

    const startEdit = useCallback((message: GroupChatMessage) => setEditingId(message.id), []);
    const cancelEdit = useCallback(() => setEditingId(""), []);
    const saveEdit = useCallback(async (message: GroupChatMessage, text: string) => {
        try {
            await groupsApi.chat({ action: "edit", groupId, messageId: message.id, text: text.slice(0, GROUP_LIMITS.messageMax) });
            if (!live) onServerChange?.();
            setEditingId("");
        } catch (error) {
            sendFailed(error);
        }
    }, [groupId, live, onServerChange, sendFailed]);

    const editLast = useCallback(() => {
        const last = [...allMessages].reverse().find((message) => message.fromEmail === me.email && message.type === "text" && !message.pending && !message.bot);
        if (last) setEditingId(last.id);
    }, [allMessages, me.email]);

    const jumpToMessage = useCallback((messageId: string) => {
        const element = document.getElementById(`msg-${messageId}`);
        if (!element) {
            notify(tx(C.notLoaded), "info");
            return;
        }
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        element.classList.add(...FLASH_CLASSES);
        window.setTimeout(() => element.classList.remove(...FLASH_CLASSES), 1600);
    }, [notify, tx]);

    const copyMessage = useCallback(async (message: GroupChatMessage) => {
        notify(await copyText(renderedText(message)) ? tx(C.copied) : errorText("clipboard_failed"), "info");
    }, [errorText, notify, renderedText, tx]);

    const activate = useCallback((messageId: string) => setActiveMessage((current) => (current === messageId ? "" : messageId)), []);
    const togglePin = useCallback((message: GroupChatMessage) => void pinToggle(message.id), [pinToggle]);
    const toggleVoice = useCallback((message: GroupChatMessage) => void toggleVoicePlayback(message), [toggleVoicePlayback]);
    const onReact = useCallback((message: GroupChatMessage, reaction: GroupReactionKey) => void react(message, reaction), [react]);
    const onDelete = useCallback((message: GroupChatMessage) => void removeMessage(message), [removeMessage]);
    const onCopy = useCallback((message: GroupChatMessage) => void copyMessage(message), [copyMessage]);
    const onTopic = useCallback((value: string) => onTopicChange(topic === value ? "" : value), [onTopicChange, topic]);
    const toggleStar = social.stars.toggle;
    const onToggleStar = useCallback((message: GroupChatMessage) => void toggleStar("group", groupId, message.id), [groupId, toggleStar]);
    const forward = social.forward;
    const onForward = useCallback((message: GroupChatMessage) => forward({ text: message.text, type: message.type === "gif" ? "gif" : "text", gif: message.gif, author: authorName(message) }), [authorName, forward]);
    const renderRules = useCallback((text: string) => <RichText text={text} needle="" onTopic={onTopic} />, [onTopic]);

    const loadOlder = () => {
        const element = containerRef.current;
        if (element) restoreRef.current = { height: element.scrollHeight, top: element.scrollTop, count: allMessages.length, at: performance.now() };
        onLoadOlder();
    };

    // Discord's typing line: bouncing dots, names in bold ("Typing indicator" off shows nothing).
    const shownTyping = prefs.typingIndicator ? typingNames : [];
    const typingLine: ReactNode = shownTyping.length === 0 ? null : shownTyping.length === 1
        ? <><b className="font-bold text-zinc-700 dark:text-zinc-200">{shownTyping[0]}</b> {tx(C.typingOne)}</>
        : shownTyping.length === 2
            ? <><b className="font-bold text-zinc-700 dark:text-zinc-200">{shownTyping[0]}</b> {tx(C.typingAnd)} <b className="font-bold text-zinc-700 dark:text-zinc-200">{shownTyping[1]}</b> {tx(C.typingTwo)}</>
            : tx(C.typingMany);
    const status = typingLine && <><span className="me-1 inline-flex gap-0.5 align-middle" aria-hidden>{[0, 150, 300].map((delay) => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${delay}ms` }} />)}</span>{typingLine}</>;

    const slowSeconds = group.slowmode[channel] ?? 0;
    const footer = slowSeconds > 0 && !moderator ? <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" aria-hidden />{tx(C.slowmode, { duration: formatDuration(slowSeconds * 1000, lang) })}</span> : null;

    const fontClass = MESSAGE_FONT_CLASS[prefs.msgFontSize];
    const byId = new Map(allMessages.map((message) => [message.id, message]));
    const rows: ReactNode[] = [];
    let previous: GroupChatMessage | null = null;
    for (const message of visibleMessages) {
        if (!previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)) {
            rows.push(
                <div key={`day-${message.id}`} className="sticky top-0 z-[5] my-2 flex justify-center px-3" role="separator">
                    <span className="rounded-full border border-zinc-200 bg-white/90 px-3 py-0.5 text-[11px] font-bold text-zinc-500 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-900/90 dark:text-zinc-400">{dayLabel(message.createdAt, now, locale, tx)}</span>
                </div>,
            );
        }
        if (message.id === dividerId) {
            rows.push(
                <div key="new-divider" className="my-2 flex items-center gap-2 px-3" role="separator" aria-label={tx(C.newMessages)}>
                    <span className="h-px flex-1 bg-red-500/60" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">{tx(C.newMessages)}</span>
                    <span className="h-px flex-1 bg-red-500/60" />
                </div>,
            );
        }
        const compact = Boolean(previous && previous.fromEmail === message.fromEmail && previous.type !== "system" && message.type !== "system" && !message.replyTo && !message.forwarded
            && message.createdAt - previous.createdAt < GROUPING_WINDOW_MS && dayKey(previous.createdAt) === dayKey(message.createdAt) && message.id !== dividerId);
        const replied = message.replyTo ? byId.get(message.replyTo.id) : undefined;
        rows.push(
            <MessageItem
                key={message.id}
                message={message}
                compact={compact}
                pinned={pinnedIds.includes(message.id)}
                starred={social.stars.has("group", groupId, message.id)}
                mentionsMe={(message.type === "text" || message.type === "gif") && !message.bot && message.fromEmail !== me.email && mentionsUser(message.text, me.username, usernames)}
                needle={needle}
                active={activeMessage === message.id}
                playing={playingId === message.id}
                loadingVoice={loadingId === message.id}
                reactionOverrides={reactionOverrides}
                fontClass={fontClass}
                gifAutoplay={prefs.gifAutoplay}
                onActivate={activate}
                onToggleVoice={toggleVoice}
                onReact={onReact}
                onTogglePin={togglePin}
                onToggleStar={onToggleStar}
                onForward={onForward}
                onDelete={onDelete}
                onReply={reply}
                onCopy={onCopy}
                onTopic={onTopic}
                editing={editingId === message.id}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onSaveEdit={saveEdit}
                onJump={jumpToMessage}
                replyAuthor={replied ? authorName(replied) : ""}
                onOpenUser={onOpenUser}
            />,
        );
        previous = message;
    }

    const shownChannel = topic || channelName;
    return (
        <div className="flex h-full min-h-0 w-full flex-col" onKeyDown={(event) => { if (event.key === "Escape") setActiveMessage(""); }}>
            <div className="relative min-h-0 flex-1">
                <div ref={containerRef} onScroll={onScroll} className={cx("h-full overflow-y-auto overscroll-contain pb-3", CHAT_BACKGROUND_CLASS[prefs.chatBackground])} aria-live="polite" aria-relevant="additions">
                    {hasMore && !filtering && (
                        <div className="flex justify-center p-2">
                            <button type="button" onClick={loadOlder} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"><ChevronUp className="h-3.5 w-3.5" aria-hidden />{tx(C.loadOlder)}</button>
                        </div>
                    )}
                    {!loaded ? (
                        <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6 text-indigo-500" /></div>
                    ) : rows.length ? rows : needle ? (
                        <p className="px-4 py-10 text-center text-sm text-zinc-500">{tx(C.noResults)}</p>
                    ) : (
                        <div className="flex min-h-[60%] flex-col items-center justify-center px-6 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{topic ? <Hash className="h-6 w-6" aria-hidden /> : <MessageSquare className="h-6 w-6" aria-hidden />}</span>
                            <p className="mt-3 font-bold">{tx(C.emptyTitle)}</p>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{tx(C.emptyText)}</p>
                        </div>
                    )}
                    {loaded && channelEphemerals.map((entry) => (
                        <EphemeralCard
                            key={entry.id}
                            reply={entry.reply}
                            rank={role}
                            customCommands={group.customCommands}
                            rules={group.rules}
                            renderRules={renderRules}
                            onDismiss={() => setEphemerals((current) => current.filter((item) => item.id !== entry.id))}
                        />
                    ))}
                </div>
                <AnimatePresence>
                    {unseen > 0 && !filtering && (
                        <motion.button type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} onClick={() => scrollToBottom(true)} className="absolute bottom-3 start-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 rtl:translate-x-1/2">
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />{tx(C.jumpNew, { count: unseen })}
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
            <Composer
                draftKey={`group:${groupId}:${channel}`}
                placeholder={tx(C.placeholderChannel, { channel: shownChannel })}
                label={tx(C.composerLabel, { channel: shownChannel })}
                maxLength={GROUP_LIMITS.messageMax}
                status={status}
                footer={footer}
                reply={replyTo ? { author: authorName(replyTo), excerpt: replyTo.type === "voice" ? "🎤" : replyTo.type === "gif" ? "GIF" : messagePreview(renderedText(replyTo), 80) } : null}
                onCancelReply={() => setReplyTo(null)}
                onSend={sendText}
                onGif={sendGif}
                onVoice={(blob, mimeType, seconds) => void sendVoice(blob, mimeType, seconds)}
                onVoiceError={(code) => notify(errorText(code), "error")}
                onTyping={prefs.typingIndicator ? onTyping : () => undefined}
                onEditLast={editLast}
                focusNonce={focusNonce}
                prefs={prefs}
                suggest={suggest}
            />
        </div>
    );
}

/** Pinned messages (newest pin first); messages outside the loaded window are fetched one by one. */
export function PinnedPanel({ messages, onJump, onClose }: { messages: GroupChatMessage[]; onJump: (messageId: string) => void; onClose?: () => void }) {
    const { tx, locale } = useI18n();
    const { groupId, group, role, memberByEmail, now, live, limits } = useWorkspace();
    const pinToggle = usePinToggle();
    const [extra, setExtra] = useState<Record<string, GroupChatMessage | null>>({});
    const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
    const missingKey = group.pinnedMessageIds.filter((id) => !byId.has(id) && !(id in extra)).join(",");

    useEffect(() => {
        if (!missingKey || !live) return;
        let active = true;
        Promise.all(missingKey.split(",").map(async (id) => {
            const snapshot = await getDoc(doc(db, "groups", groupId, "messages", id)).catch(() => null);
            return [id, snapshot?.exists() ? messageFromData(id, snapshot.data({ serverTimestamps: "estimate" }), false, 0) : null] as const;
        })).then((entries) => {
            if (active) setExtra((current) => ({ ...current, ...Object.fromEntries(entries) }));
        });
        return () => { active = false; };
    }, [groupId, live, missingKey]);

    const pinned = group.pinnedMessageIds.map((id) => ({ id, message: byId.get(id) ?? extra[id] ?? null, loaded: byId.has(id) }));

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/10">
                <h2 className="flex items-center gap-2 text-sm font-black"><Pin className="h-4 w-4 text-amber-500" aria-hidden />{tx(C.pinnedTitle)}<span className="text-xs font-semibold text-zinc-400">{pinned.length}/{limits.pinned}</span>
                    {onClose && <button type="button" onClick={onClose} className="ms-auto rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(UI_COPY.close)}><X className="h-4 w-4" aria-hidden /></button>}
                </h2>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {!pinned.length && (
                    <div className="flex flex-col items-center px-4 py-10 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><Pin className="h-6 w-6" aria-hidden /></span>
                        <p className="mt-3 text-sm font-bold">{tx(C.pinnedEmpty)}</p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.pinnedHint)}</p>
                    </div>
                )}
                {pinned.map(({ id, message, loaded: inChat }) => {
                    const author = message ? memberByEmail.get(message.fromEmail) : undefined;
                    const isSystem = message?.type === "system" || message?.fromEmail === SYSTEM_SENDER;
                    const welcome = message?.event === "welcome" && message.template ? tx(getGroupTemplate(message.template).welcome, { group: group.name }) : "";
                    return (
                        <article key={id} className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
                            {message ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        {message.bot ? <BotAvatar bot={message.bot} size={24} /> : isSystem ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-black text-white">H</span> : <UserAvatar name={message.author} src={author?.avatarUrl ?? message.authorAvatar} size="xs" />}
                                        <span className="truncate text-xs font-bold">{message.bot ? tx(BOT_LABEL[message.bot]) : isSystem ? "Hanogt" : author?.username ?? message.author}</span>
                                        <time className="ms-auto shrink-0 text-[10px] text-zinc-400">{dayLabel(message.createdAt, now, locale, tx)} {clockTime(message.createdAt, locale)}</time>
                                    </div>
                                    {message.type === "voice"
                                        ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{tx(C.voiceMessage)}</p>
                                        : message.type === "gif"
                                            ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{tx(C.gifMessage)}{message.gif?.title ? ` · ${message.gif.title}` : ""}</p>
                                            : <RichText className="mt-1.5 line-clamp-6 text-zinc-700 dark:text-zinc-200" text={welcome || message.text} needle="" onTopic={() => undefined} />}
                                </>
                            ) : (
                                <p className="text-sm italic text-zinc-500">{id in extra ? tx(C.missing) : !live ? tx(C.unavailable) : <Spinner className="h-4 w-4" />}</p>
                            )}
                            <div className="mt-2 flex items-center justify-end gap-1">
                                {message && inChat && <button type="button" onClick={() => onJump(id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300">{tx(C.jumpTo)}</button>}
                                {canModerate(role) && <button type="button" onClick={() => void pinToggle(id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><PinOff className="h-3.5 w-3.5" aria-hidden />{tx(C.unpin)}</button>}
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}

