"use client";

import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, AtSign, ChevronUp, Hash, MessageSquare, Mic, MicOff, Pin, PinOff, Search, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { db } from "@/lib/firebase";
import { useI18n, type Copy } from "@/lib/i18n";
import { SocialRequestError, socialApi } from "@/lib/social/api";
import { markGroupRead, useAudioDevices } from "@/lib/social/local-state";
import {
    GROUP_LIMITS,
    GROUP_SYSTEM_EVENT_COPY,
    SYSTEM_SENDER,
    getGroupTemplate,
    mentionsUser,
    tokenizeMessage,
    type GroupReactionKey,
} from "@/lib/groups";
import { groupsApi } from "../api";
import { Spinner, UI_COPY, UserAvatar, clockTime, copyText, cx, dayKey } from "../ui";
import { useWorkspace } from "./context";
import { useVoicePlayer, useVoiceRecorder } from "./hooks";
import MessageItem, { RichText, type ReactionOverrides } from "./MessageItem";
import { messageFromData, type GroupChatMessage } from "./model";

const C = {
    chat: { TR: "Sohbet", EN: "Chat" },
    search: { TR: "Mesajlarda ara", EN: "Search messages" },
    searchPlaceholder: { TR: "Mesajlarda ara…", EN: "Search messages…" },
    closeSearch: { TR: "Aramayı kapat", EN: "Close search" },
    results: { TR: "{count} sonuç", EN: "{count} results" },
    allTopics: { TR: "Tümü", EN: "All" },
    topicFilter: { TR: "Konuya göre filtrele", EN: "Filter by topic" },
    loadOlder: { TR: "Daha eski mesajları yükle", EN: "Load older messages" },
    newMessages: { TR: "Yeni mesajlar", EN: "New messages" },
    jumpNew: { TR: "{count} yeni mesaj", EN: "{count} new messages" },
    jumpLatest: { TR: "En yeniye git", EN: "Jump to latest" },
    emptyTitle: { TR: "Sohbeti başlat", EN: "Start the conversation" },
    emptyText: { TR: "İlk mesajı yaz; @ ile birinden bahset, # ile konu etiketle.", EN: "Write the first message; use @ to mention someone and # to tag a topic." },
    noResults: { TR: "Eşleşen mesaj yok.", EN: "No matching messages." },
    placeholder: { TR: "Mesaj yaz… (@ bahset, # konu)", EN: "Write a message… (@ mention, # topic)" },
    placeholderTopic: { TR: "#{topic} konusuna yaz…", EN: "Write in #{topic}…" },
    placeholderChannel: { TR: "#{channel} kanalına mesaj gönder", EN: "Message #{channel}" },
    composerLabel: { TR: "Mesaj", EN: "Message" },
    send: { TR: "Gönder", EN: "Send" },
    record: { TR: "Sesli mesaj kaydet", EN: "Record a voice message" },
    stopRecord: { TR: "Kaydı bitir ve gönder", EN: "Stop and send" },
    recording: { TR: "Kaydediliyor {seconds}/{limit} sn", EN: "Recording {seconds}/{limit}s" },
    discard: { TR: "Vazgeç", EN: "Discard" },
    voiceText: { TR: "Sesli mesaj ({seconds} sn)", EN: "Voice message ({seconds}s)" },
    typingOne: { TR: "yazıyor…", EN: "is typing…" },
    typingAnd: { TR: "ve", EN: "and" },
    typingTwo: { TR: "yazıyor…", EN: "are typing…" },
    typingMany: { TR: "Birkaç kişi yazıyor…", EN: "Several people are typing…" },
    replying: { TR: "{name} kişisine yanıt veriliyor", EN: "Replying to {name}" },
    cancelReply: { TR: "Yanıtı iptal et", EN: "Cancel reply" },
    everyoneHint: { TR: "Gruptaki herkese bildir", EN: "Notify everyone in the group" },
    mentionList: { TR: "Bahsedilecek üye", EN: "Member to mention" },
    pinnedTitle: { TR: "Sabitlenen mesajlar", EN: "Pinned messages" },
    pinnedEmpty: { TR: "Henüz sabitlenen mesaj yok.", EN: "No pinned messages yet." },
    pinnedHint: { TR: "Yöneticiler bir mesajın üzerine gelip 📌 simgesiyle onu buraya sabitleyebilir.", EN: "Admins can hover a message and use 📌 to pin it here." },
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
    missing: { TR: "Bu mesaj silinmiş.", EN: "This message was deleted." },
    unavailable: { TR: "Bu mesaj şu anda yüklenemiyor.", EN: "This message can't be loaded right now." },
    chars: { TR: "{count}/{max}", EN: "{count}/{max}" },
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

/** Pin toggle shared by the chat toolbar and the pinned list. */
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
    onShowPinned: () => void;
    /**
     * false: embedded as a Hanogt Social channel; the screen around it shows
     * the title, search and channels, and passes `topic` and `search` in.
     */
    chrome?: boolean;
    /** Controlled topic filter (the selected #channel); the panel keeps its own when omitted. */
    topic?: string;
    onTopicChange?: (topic: string) => void;
    /** Controlled search text (with chrome = false). */
    search?: string;
    /** Name of the main channel for the composer placeholder (e.g. "genel"). */
    channelName?: string;
    /** Called after a message, reaction or deletion went through the server (the list then re-reads at once). */
    onServerChange?: () => void;
    /** Clicking an avatar or a name opens the person's profile card. */
    onOpenUser?: (email: string, trigger: HTMLElement) => void;
};

export default function ChatPanel({ messages, loaded, hasMore, onLoadOlder, lastReadAt, visible, typingNames, onTyping, onStopTyping, focusNonce, jumpTarget, onShowPinned, chrome = true, topic: topicProp, onTopicChange, search: searchProp, channelName, onServerChange, onOpenUser }: ChatPanelProps) {
    const { tx, locale, language } = useI18n();
    const { groupId, group, me, members, usernames, now, notify, confirm, errorText, live } = useWorkspace();
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [ownSearch, setSearch] = useState("");
    const [ownTopic, setOwnTopic] = useState("");
    const topic = topicProp ?? ownTopic;
    const search = searchProp ?? ownSearch;
    const setTopic = useCallback((value: string | ((current: string) => string)) => {
        const next = typeof value === "function" ? value(topicProp ?? ownTopic) : value;
        if (onTopicChange) onTopicChange(next);
        else setOwnTopic(next);
    }, [onTopicChange, ownTopic, topicProp]);
    const [activeMessage, setActiveMessage] = useState("");
    const [replyTo, setReplyTo] = useState<GroupChatMessage | null>(null);
    const [editingId, setEditingId] = useState("");
    const [overrides, setOverrides] = useState<Record<string, boolean>>({});
    const [mention, setMention] = useState<{ query: string; start: number; index: number } | null>(null);
    const [seenUntil, setSeenUntil] = useState(lastReadAt);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const atBottomRef = useRef(true);
    const restoreRef = useRef<{ height: number; top: number; count: number; at: number } | null>(null);
    const initialDoneRef = useRef(false);
    const lastIdRef = useRef("");
    const pinToggle = usePinToggle();
    const { playingId, loadingId, toggle: toggleVoicePlayback } = useVoicePlayer({ groupId, onError: (code) => notify(errorText(code), "error") });

    const pinnedIds = group.pinnedMessageIds;
    const needle = search.trim().toLocaleLowerCase();
    const filtering = Boolean(needle || topic);
    const latestTime = messages.length ? messages[messages.length - 1].createdAt : 0;

    const renderedText = useCallback((message: GroupChatMessage) => {
        if (message.event === "welcome" && message.template) return tx(getGroupTemplate(message.template).welcome, { group: group.name });
        if (message.event && message.event !== "welcome") return tx(GROUP_SYSTEM_EVENT_COPY[message.event], { name: message.vars.name || "" });
        return message.text;
    }, [group.name, tx]);

    const visibleMessages = useMemo(() => messages.filter((message) => {
        if (topic && !hasTopic(message.text, topic)) return false;
        if (!needle) return true;
        return renderedText(message).toLocaleLowerCase().includes(needle) || message.author.toLocaleLowerCase().includes(needle);
    }), [messages, needle, renderedText, topic]);

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

    useLayoutEffect(() => {
        const element = containerRef.current;
        if (!element || !loaded || !visible) return;
        const restore = restoreRef.current;
        if (restore && performance.now() - restore.at > 8000) restoreRef.current = null;
        else if (restore && messages.length !== restore.count) {
            // Older messages were prepended: keep the same messages under the reader's eyes.
            element.scrollTop = element.scrollHeight - restore.height + restore.top;
            restoreRef.current = null;
            lastIdRef.current = messages[messages.length - 1]?.id ?? "";
            return;
        }
        const last = messages[messages.length - 1];
        if (!initialDoneRef.current) {
            initialDoneRef.current = true;
            const divider = dividerId ? document.getElementById(`msg-${dividerId}`) : null;
            if (divider) divider.scrollIntoView({ block: "center" });
            else element.scrollTop = element.scrollHeight;
        } else if (atBottomRef.current || (last && last.fromEmail === me.email && last.id !== lastIdRef.current)) {
            scrollToBottom(true);
        }
        lastIdRef.current = last?.id ?? "";
        // Without a scrollbar no scroll event arrives, so everything on screen counts as seen.
        if (element.scrollHeight <= element.clientHeight + 4) {
            const frame = window.requestAnimationFrame(() => setSeenUntil((value) => Math.max(value, last?.createdAt ?? 0)));
            return () => window.cancelAnimationFrame(frame);
        }
    }, [dividerId, loaded, me.email, messages, scrollToBottom, visible]);

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
        if (focusNonce) textareaRef.current?.focus();
    }, [focusNonce]);

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

    useEffect(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${Math.min(element.scrollHeight, 168)}px`;
    }, [draft]);

    const mentionOptions = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.toLocaleLowerCase();
        // @everyone/@herkes are keywords, not translated text.
        const everyoneWord = language === "TR" ? "herkes" : "everyone";
        const people = members
            .filter((member) => member.email !== me.email && member.username.toLocaleLowerCase().includes(query))
            .slice(0, 6)
            .map((member) => ({ key: member.email, label: member.username, avatar: member.avatarUrl, hint: "" }));
        const everyone = everyoneWord.startsWith(query) ? [{ key: "everyone", label: everyoneWord, avatar: null, hint: tx(C.everyoneHint) }] : [];
        return [...people, ...everyone];
    }, [language, me.email, members, mention, tx]);

    const updateMention = (value: string, caret: number) => {
        const match = /(?:^|\s)@([^\s@]{0,24})$/.exec(value.slice(0, caret));
        setMention(match ? { query: match[1], start: caret - match[1].length - 1, index: 0 } : null);
    };

    const insertMention = (label: string) => {
        const element = textareaRef.current;
        if (!mention || !element) return;
        const caret = element.selectionStart ?? draft.length;
        const next = `${draft.slice(0, mention.start)}@${label} ${draft.slice(caret)}`;
        const position = mention.start + label.length + 2;
        setDraft(next);
        setMention(null);
        window.requestAnimationFrame(() => {
            element.focus();
            element.setSelectionRange(position, position);
        });
    };

    const send = async () => {
        let text = draft.trim();
        if (!text || sending) return;
        if (topic && !hasTopic(text, topic)) text = `#${topic} ${text}`;
        text = text.slice(0, GROUP_LIMITS.messageMax);
        setSending(true);
        setDraft("");
        setMention(null);
        onStopTyping();
        const reply = replyTo;
        setReplyTo(null);
        try {
            if (reply) {
                // Replies are written by the server (it copies the quoted message; browsers may not write that field).
                await groupsApi.chat({ action: "send", groupId, text, replyTo: { id: reply.id } });
                if (!live) onServerChange?.();
            } else if (live) {
                await addDoc(collection(db, "groups", groupId, "messages"), {
                    fromEmail: me.email,
                    author: me.username,
                    authorAvatar: me.avatarUrl || null,
                    type: "text",
                    text,
                    createdAt: serverTimestamp(),
                });
            } else {
                await groupsApi.chat({ action: "send", groupId, text });
                onServerChange?.();
            }
            atBottomRef.current = true;
        } catch {
            setDraft(text);
            setReplyTo(reply);
            notify(errorText("message_failed"), "error");
        } finally {
            setSending(false);
        }
    };

    // Through POST /api/social/voice: the server stores the recording and writes the message,
    // so voice messages work without the Firebase bridge and whatever the Storage rules allow.
    const sendVoice = async (blob: Blob, mimeType: string, seconds: number) => {
        try {
            await socialApi.sendGroupVoice(groupId, blob, { seconds, label: tx(C.voiceText, { seconds }), type: mimeType });
            atBottomRef.current = true;
            if (!live) onServerChange?.();
        } catch (error) {
            const code = error instanceof SocialRequestError ? error.code : "";
            notify(errorText(code === "voice_too_large" || code === "rate_limited" || code === "network" || code === "not_found" || code === "unauthorized" ? code : "voice_failed"), "error");
        }
    };

    const devices = useAudioDevices();
    const recorder = useVoiceRecorder({
        onRecorded: (blob, mimeType, seconds) => void sendVoice(blob, mimeType, seconds),
        onError: (code) => notify(errorText(code), "error"),
        deviceId: devices.input,
    });

    const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        if (mention && mentionOptions.length) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setMention({ ...mention, index: (mention.index + step + mentionOptions.length) % mentionOptions.length });
                return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                insertMention(mentionOptions[mention.index]?.label ?? mentionOptions[0].label);
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                setMention(null);
                return;
            }
        }
        if (event.key === "Escape" && replyTo) {
            event.preventDefault();
            event.stopPropagation();
            setReplyTo(null);
            return;
        }
        if (event.key === "ArrowUp" && !draft) {
            // Like Discord: ArrowUp in an empty box edits your last message.
            const last = [...messages].reverse().find((message) => message.fromEmail === me.email && message.type === "text" && !message.pending);
            if (last) {
                event.preventDefault();
                setEditingId(last.id);
            }
            return;
        }
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            // On touch keyboards Enter inserts a new line; the send button sends.
            if (window.matchMedia("(pointer: coarse)").matches) return;
            event.preventDefault();
            void send();
        }
    };

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
        window.requestAnimationFrame(() => textareaRef.current?.focus());
    }, []);

    const startEdit = useCallback((message: GroupChatMessage) => setEditingId(message.id), []);
    const cancelEdit = useCallback(() => {
        setEditingId("");
        window.requestAnimationFrame(() => textareaRef.current?.focus());
    }, []);
    const saveEdit = useCallback(async (message: GroupChatMessage, text: string) => {
        try {
            await groupsApi.chat({ action: "edit", groupId, messageId: message.id, text: text.slice(0, GROUP_LIMITS.messageMax) });
            if (!live) onServerChange?.();
            setEditingId("");
            window.requestAnimationFrame(() => textareaRef.current?.focus());
        } catch (error) {
            notify(errorText(error), "error");
        }
    }, [errorText, groupId, live, notify, onServerChange]);

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
        notify(await copyText(message.text) ? tx(C.copied) : errorText("clipboard_failed"), "info");
    }, [errorText, notify, tx]);

    const activate = useCallback((messageId: string) => setActiveMessage((current) => (current === messageId ? "" : messageId)), []);
    const togglePin = useCallback((message: GroupChatMessage) => void pinToggle(message.id), [pinToggle]);
    const toggleVoice = useCallback((message: GroupChatMessage) => void toggleVoicePlayback(message), [toggleVoicePlayback]);
    const onReact = useCallback((message: GroupChatMessage, reaction: GroupReactionKey) => void react(message, reaction), [react]);
    const onDelete = useCallback((message: GroupChatMessage) => void removeMessage(message), [removeMessage]);
    const onCopy = useCallback((message: GroupChatMessage) => void copyMessage(message), [copyMessage]);
    const onTopic = useCallback((value: string) => setTopic((current) => (current === value ? "" : value)), [setTopic]);

    const loadOlder = () => {
        const element = containerRef.current;
        if (element) restoreRef.current = { height: element.scrollHeight, top: element.scrollTop, count: messages.length, at: performance.now() };
        onLoadOlder();
    };

    // Discord's typing line: bouncing dots, names in bold.
    const typingLine: ReactNode = typingNames.length === 0 ? null : typingNames.length === 1
        ? <><b className="font-bold text-zinc-700 dark:text-zinc-200">{typingNames[0]}</b> {tx(C.typingOne)}</>
        : typingNames.length === 2
            ? <><b className="font-bold text-zinc-700 dark:text-zinc-200">{typingNames[0]}</b> {tx(C.typingAnd)} <b className="font-bold text-zinc-700 dark:text-zinc-200">{typingNames[1]}</b> {tx(C.typingTwo)}</>
            : tx(C.typingMany);

    const usernamesForMentions = usernames;
    const byId = new Map(messages.map((message) => [message.id, message]));
    const authorName = (message: GroupChatMessage) => (message.fromEmail === SYSTEM_SENDER ? "Hanogt" : members.find((member) => member.email === message.fromEmail)?.username ?? message.author);
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
                    <span className="h-px flex-1 bg-fuchsia-500/50" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">{tx(C.newMessages)}</span>
                    <span className="h-px flex-1 bg-fuchsia-500/50" />
                </div>,
            );
        }
        const compact = Boolean(previous && previous.fromEmail === message.fromEmail && previous.type !== "system" && message.type !== "system" && !message.replyTo
            && message.createdAt - previous.createdAt < GROUPING_WINDOW_MS && dayKey(previous.createdAt) === dayKey(message.createdAt) && message.id !== dividerId);
        const replied = message.replyTo ? byId.get(message.replyTo.id) : undefined;
        rows.push(
            <MessageItem
                key={message.id}
                message={message}
                compact={compact}
                pinned={pinnedIds.includes(message.id)}
                mentionsMe={message.type === "text" && message.fromEmail !== me.email && mentionsUser(message.text, me.username, usernamesForMentions)}
                needle={needle}
                active={activeMessage === message.id}
                playing={playingId === message.id}
                loadingVoice={loadingId === message.id}
                reactionOverrides={reactionOverrides}
                onActivate={activate}
                onToggleVoice={toggleVoice}
                onReact={onReact}
                onTogglePin={togglePin}
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

    return (
        <div className="flex h-full min-h-0 w-full flex-col" onKeyDown={(event) => { if (event.key === "Escape") setActiveMessage(""); }}>
            {chrome && <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-white/10">
                {searchOpen ? (
                    <label className="relative flex flex-1 items-center">
                        <span className="sr-only">{tx(C.search)}</span>
                        <Search className="pointer-events-none absolute start-2.5 h-4 w-4 text-zinc-400" aria-hidden />
                        <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setSearch(""); setSearchOpen(false); } }} placeholder={tx(C.searchPlaceholder)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pe-20 ps-8 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-950" />
                        {needle && <span className="pointer-events-none absolute end-9 text-[11px] font-semibold text-zinc-400">{tx(C.results, { count: visibleMessages.length })}</span>}
                        <button type="button" onClick={() => { setSearch(""); setSearchOpen(false); }} className="absolute end-1 rounded-lg p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white" aria-label={tx(C.closeSearch)}><X className="h-4 w-4" aria-hidden /></button>
                    </label>
                ) : (
                    <>
                        <h2 className="flex flex-1 items-center gap-2 text-sm font-black"><MessageSquare className="h-4 w-4 text-indigo-500" aria-hidden />{tx(C.chat)}</h2>
                        <button type="button" onClick={() => setSearchOpen(true)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.search)} title={tx(C.search)}><Search className="h-4 w-4" aria-hidden /></button>
                        <button type="button" onClick={onShowPinned} className="inline-flex items-center gap-1 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.pinnedTitle)} title={tx(C.pinnedTitle)}><Pin className="h-4 w-4" aria-hidden />{pinnedIds.length > 0 && <span className="text-xs font-bold tabular-nums">{pinnedIds.length}</span>}</button>
                    </>
                )}
            </div>}
            {chrome && group.topics.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-200 px-3 py-2 dark:border-white/10" role="group" aria-label={tx(C.topicFilter)}>
                    <button type="button" onClick={() => setTopic("")} aria-pressed={!topic} className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition", !topic ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300")}>{tx(C.allTopics)}</button>
                    {group.topics.map((entry) => (
                        <button key={entry} type="button" onClick={() => onTopic(entry)} aria-pressed={topic === entry} className={cx("inline-flex shrink-0 items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold transition", topic === entry ? "bg-fuchsia-600 text-white" : "bg-fuchsia-500/10 text-fuchsia-700 hover:bg-fuchsia-500/20 dark:text-fuchsia-300")}><Hash className="h-3 w-3" aria-hidden />{entry}</button>
                    ))}
                </div>
            )}

            <div className="relative min-h-0 flex-1">
                <div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain pb-3" aria-live="polite" aria-relevant="additions">
                    {hasMore && !filtering && (
                        <div className="flex justify-center p-2">
                            <button type="button" onClick={loadOlder} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"><ChevronUp className="h-3.5 w-3.5" aria-hidden />{tx(C.loadOlder)}</button>
                        </div>
                    )}
                    {!loaded ? (
                        <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6 text-indigo-500" /></div>
                    ) : rows.length ? rows : filtering ? (
                        <p className="px-4 py-10 text-center text-sm text-zinc-500">{tx(C.noResults)}</p>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><MessageSquare className="h-6 w-6" aria-hidden /></span>
                            <p className="mt-3 font-bold">{tx(C.emptyTitle)}</p>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{tx(C.emptyText)}</p>
                        </div>
                    )}
                </div>
                <AnimatePresence>
                    {unseen > 0 && !filtering && (
                        <motion.button type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} onClick={() => scrollToBottom(true)} className="absolute bottom-3 start-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 rtl:translate-x-1/2">
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />{tx(C.jumpNew, { count: unseen })}
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            <div className="border-t border-zinc-200 p-3 dark:border-white/10">
                <p className="mb-1 h-4 truncate px-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400" aria-live="polite">
                    {typingLine && <><span className="me-1 inline-flex gap-0.5 align-middle" aria-hidden>{[0, 150, 300].map((delay) => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${delay}ms` }} />)}</span>{typingLine}</>}
                </p>
                {recorder.recording ? (
                    <div className="flex items-center gap-2 rounded-2xl bg-red-500/10 px-3 py-2">
                        <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" /></span>
                        <span className="flex-1 text-sm font-bold tabular-nums text-red-700 dark:text-red-300">{tx(C.recording, { seconds: recorder.seconds, limit: recorder.limit })}</span>
                        <button type="button" onClick={() => recorder.stop(true)} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800"><Trash2 className="me-1 inline h-4 w-4" aria-hidden />{tx(C.discard)}</button>
                        <button type="button" onClick={() => recorder.stop(false)} className="rounded-xl bg-red-600 p-2.5 text-white hover:bg-red-500" aria-label={tx(C.stopRecord)} title={tx(C.stopRecord)}><MicOff className="h-5 w-5" aria-hidden /></button>
                    </div>
                ) : (
                    <div className="relative">
                        <AnimatePresence>
                            {mention && mentionOptions.length > 0 && (
                                <motion.ul initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.12 }} className="absolute bottom-full start-0 z-20 mb-2 w-full max-w-xs overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-zinc-800" role="listbox" aria-label={tx(C.mentionList)}>
                                    {mentionOptions.map((option, index) => (
                                        <li key={option.key} role="option" aria-selected={index === mention.index}>
                                            <button type="button" onMouseDown={(event) => { event.preventDefault(); insertMention(option.label); }} className={cx("flex w-full items-center gap-2 px-3 py-2 text-start text-sm", index === mention.index ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "hover:bg-zinc-100 dark:hover:bg-zinc-700")}>
                                                {option.key === "everyone" ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-600"><AtSign className="h-3.5 w-3.5" aria-hidden /></span> : <UserAvatar name={option.label} src={option.avatar} size="xs" />}
                                                <span className="truncate font-semibold">{option.label}</span>
                                                {option.hint && <span className="ms-auto truncate text-[11px] text-zinc-400">{option.hint}</span>}
                                            </button>
                                        </li>
                                    ))}
                                </motion.ul>
                            )}
                        </AnimatePresence>
                        {topic && chrome && (
                            <div className="mb-2 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-600 px-2.5 py-0.5 text-xs font-semibold text-white"><Hash className="h-3 w-3" aria-hidden />{topic}<button type="button" onClick={() => setTopic("")} className="ms-0.5 rounded-full hover:bg-white/20" aria-label={tx(C.allTopics)}><X className="h-3 w-3" aria-hidden /></button></span>
                            </div>
                        )}
                        {replyTo && (
                            <div className="mb-2 flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-1.5 text-[13px] text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
                                <span className="min-w-0 flex-1 truncate">{tx(C.replying, { name: authorName(replyTo) })} <span className="text-zinc-400">— {replyTo.type === "voice" ? "🎤" : replyTo.text.slice(0, 80)}</span></span>
                                <button type="button" onClick={() => setReplyTo(null)} className="rounded-full p-0.5 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.cancelReply)}><X className="h-4 w-4" aria-hidden /></button>
                            </div>
                        )}
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={textareaRef}
                                value={draft}
                                rows={1}
                                maxLength={GROUP_LIMITS.messageMax}
                                onChange={(event) => {
                                    setDraft(event.target.value);
                                    updateMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
                                    onTyping(event.target.value);
                                }}
                                onKeyDown={onKeyDown}
                                onClick={(event) => updateMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
                                onBlur={() => window.setTimeout(() => setMention(null), 120)}
                                placeholder={topic ? (chrome ? tx(C.placeholderTopic, { topic }) : tx(C.placeholderChannel, { channel: topic })) : channelName ? tx(C.placeholderChannel, { channel: channelName }) : tx(C.placeholder)}
                                aria-label={tx(C.composerLabel)}
                                className="max-h-[168px] min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm leading-6 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950 dark:focus:bg-zinc-950"
                            />
                            {draft.trim() ? (
                                <button type="button" onClick={() => void send()} disabled={sending} className="rounded-2xl bg-indigo-600 p-3 text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50" aria-label={tx(C.send)} title={tx(C.send)}>
                                    {sending ? <Spinner className="h-5 w-5" /> : <Send className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}
                                </button>
                            ) : (
                                <button type="button" onClick={() => void recorder.start()} className="rounded-2xl bg-zinc-100 p-3 text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white" aria-label={tx(C.record)} title={tx(C.record)}>
                                    <Mic className="h-5 w-5" aria-hidden />
                                </button>
                            )}
                        </div>
                        {draft.length > GROUP_LIMITS.messageMax - 500 && <p className="mt-1 text-end text-[11px] tabular-nums text-amber-600">{tx(C.chars, { count: draft.length, max: GROUP_LIMITS.messageMax })}</p>}
                    </div>
                )}
            </div>
        </div>
    );
}

/** Pinned messages (newest pin first); messages outside the loaded window are fetched one by one. */
export function PinnedPanel({ messages, onJump, onClose }: { messages: GroupChatMessage[]; onJump: (messageId: string) => void; onClose?: () => void }) {
    const { tx, locale } = useI18n();
    const { groupId, group, isManager, memberByEmail, now, live } = useWorkspace();
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
                <h2 className="flex items-center gap-2 text-sm font-black"><Pin className="h-4 w-4 text-amber-500" aria-hidden />{tx(C.pinnedTitle)}<span className="text-xs font-semibold text-zinc-400">{pinned.length}/{GROUP_LIMITS.pinnedMax}</span>
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
                                        {isSystem ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-[10px] font-black text-white">H</span> : <UserAvatar name={message.author} src={author?.avatarUrl ?? message.authorAvatar} size="xs" />}
                                        <span className="truncate text-xs font-bold">{isSystem ? "Hanogt" : author?.username ?? message.author}</span>
                                        <time className="ms-auto shrink-0 text-[10px] text-zinc-400">{dayLabel(message.createdAt, now, locale, tx)} {clockTime(message.createdAt, locale)}</time>
                                    </div>
                                    {message.type === "voice" ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{tx(C.voiceMessage)}</p> : <RichText className="mt-1.5 line-clamp-6 text-zinc-700 dark:text-zinc-200" text={welcome || message.text} needle="" onTopic={() => undefined} />}
                                </>
                            ) : (
                                <p className="text-sm italic text-zinc-500">{id in extra ? tx(C.missing) : !live ? tx(C.unavailable) : <Spinner className="h-4 w-4" />}</p>
                            )}
                            <div className="mt-2 flex items-center justify-end gap-1">
                                {message && inChat && <button type="button" onClick={() => onJump(id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300">{tx(C.jumpTo)}</button>}
                                {isManager && <button type="button" onClick={() => void pinToggle(id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><PinOff className="h-3.5 w-3.5" aria-hidden />{tx(C.unpin)}</button>}
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
