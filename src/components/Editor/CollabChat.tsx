"use client";

import { LoaderCircle, MessageSquareText, Send } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { COLLAB_LIMITS, collabColor, type CollabChatMessage, type CollabMeta } from "@/lib/collab/protocol";
import type { CollabSession } from "@/lib/collab/session-client";
import { useCollabValue } from "@/lib/collab/use-editor-collab";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    title: { TR: "Sohbet", EN: "Chat" },
    log: { TR: "Oturum sohbeti", EN: "Session chat" },
    empty: { TR: "Henüz mesaj yok. Bir şey sor, fikrini yaz ya da kodun bir satırını göster.", EN: "No messages yet. Ask something, share an idea or point at a line." },
    placeholder: { TR: "Mesaj yaz… (Enter gönderir, Shift+Enter yeni satır)", EN: "Write a message… (Enter sends, Shift+Enter adds a line)" },
    label: { TR: "Mesaj", EN: "Message" },
    send: { TR: "Gönder", EN: "Send" },
    you: { TR: "Sen", EN: "You" },
    left: { TR: "{count} karakter kaldı", EN: "{count} characters left" },
    cleared: { TR: "Mesajlar oturum bitince silinir.", EN: "Messages are deleted when the session ends." },
} satisfies Record<string, Copy>;

const NO_MESSAGES: CollabChatMessage[] = [];

/** The session's chat: messages with author and time, stored until the session ends. */
export default function CollabChat({ session, visible }: { session: CollabSession; visible: boolean }) {
    const { tx, locale } = useI18n();
    const messages = useCollabValue(session, (state) => state.chat, NO_MESSAGES);
    const meta: CollabMeta | null = useCollabValue(session, (state) => state.meta, null);
    const myKey = useCollabValue(session, (state) => state.me?.key ?? "", "");
    const pending = useCollabValue(session, (state) => state.chatPending, 0);
    const active = useCollabValue(session, (state) => state.meta?.status === "active", false);
    const [draft, setDraft] = useState("");
    const logRef = useRef<HTMLDivElement>(null);
    const stickRef = useRef(true);
    const inputId = useId();
    const time = useMemo(() => {
        try {
            return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
        } catch {
            return null;
        }
    }, [locale]);
    const colors = useMemo(() => new Map((meta?.participants ?? []).map((person) => [person.key, collabColor(person.color)])), [meta]);

    // Unread counting stops while the chat is on screen.
    useEffect(() => {
        session.setChatVisible(visible);
        return () => session.setChatVisible(false);
    }, [session, visible]);

    // New messages scroll into view unless the reader scrolled up.
    useEffect(() => {
        const log = logRef.current;
        if (log && stickRef.current) log.scrollTop = log.scrollHeight;
    }, [messages, visible]);

    const send = async () => {
        const text = draft.trim();
        if (!text || !active) return;
        setDraft("");
        stickRef.current = true;
        const ok = await session.sendChat(text);
        if (!ok) setDraft((current) => current || text);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send();
        }
    };

    const remaining = COLLAB_LIMITS.maxChatChars - draft.length;
    return (
        <section className="flex min-h-[14rem] flex-1 flex-col" aria-labelledby={`${inputId}-title`}>
            <h3 id={`${inputId}-title`} className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <MessageSquareText className="h-3.5 w-3.5" aria-hidden />{tx(C.title)}
            </h3>
            <div
                ref={logRef}
                role="log"
                aria-label={tx(C.log)}
                aria-live="polite"
                tabIndex={0}
                onScroll={(event) => {
                    const target = event.currentTarget;
                    stickRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 48;
                }}
                className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
            >
                {messages.length === 0 && <p className="py-6 text-center text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.empty)}</p>}
                {messages.map((message) => {
                    const mine = message.by === myKey;
                    const at = message.at && time ? time.format(new Date(message.at)) : "";
                    return (
                        <div key={message.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                            <div className="flex items-baseline gap-1.5 px-1 text-[11px]">
                                <span className="font-semibold" style={{ color: colors.get(message.by) ?? undefined }} dir="auto">{mine ? tx(C.you) : message.name}</span>
                                {at && <time dateTime={new Date(message.at).toISOString()} className="text-zinc-400">{at}</time>}
                            </div>
                            <p dir="auto" className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm leading-5 ${mine ? "rounded-ee-md bg-indigo-600 text-white" : "rounded-es-md bg-zinc-100 text-zinc-800 dark:bg-white/[0.08] dark:text-zinc-100"}`}>
                                {message.text}
                            </p>
                        </div>
                    );
                })}
            </div>
            <form
                className="border-t border-zinc-200 p-2 dark:border-white/10"
                onSubmit={(event) => {
                    event.preventDefault();
                    void send();
                }}
            >
                <label htmlFor={inputId} className="sr-only">{tx(C.label)}</label>
                <div className="flex items-end gap-2">
                    <textarea
                        id={inputId}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value.slice(0, COLLAB_LIMITS.maxChatChars))}
                        onKeyDown={onKeyDown}
                        rows={2}
                        disabled={!active}
                        maxLength={COLLAB_LIMITS.maxChatChars}
                        placeholder={tx(C.placeholder)}
                        className="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                    />
                    <button
                        type="submit"
                        disabled={!draft.trim() || !active}
                        aria-label={tx(C.send)}
                        title={tx(C.send)}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-zinc-950"
                    >
                        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
                    </button>
                </div>
                <p className="mt-1 flex justify-between gap-2 px-1 text-[10px] text-zinc-400">
                    <span>{tx(C.cleared)}</span>
                    {remaining < 200 && <span aria-live="polite">{tx(C.left, { count: remaining })}</span>}
                </p>
            </form>
        </section>
    );
}
