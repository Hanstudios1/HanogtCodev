"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AiConversation } from "@/lib/ai/conversations";
import { useI18n, type Copy } from "@/lib/i18n";
import { cx } from "./ui";

const C = {
    switch: { TR: "Son sohbetler", EN: "Recent chats" },
    untitled: { TR: "Yeni sohbet", EN: "New chat" },
    all: { TR: "Tüm sohbetler", EN: "All chats" },
    none: { TR: "Henüz sohbet yok.", EN: "No chats yet." },
} satisfies Record<string, Copy>;

const SHOWN = 8;

/** The compact panel's title: the conversation's name, opening a list of recent chats to switch to. */
export default function RecentChats({ conversations, activeId, title, onSelect, onNavigate }: {
    conversations: AiConversation[];
    activeId: string | null;
    title: string;
    onSelect: (id: string) => void;
    /** Leaving for the full page (closes the panel on phones). */
    onNavigate?: () => void;
}) {
    const { tx } = useI18n();
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const listId = useId();
    const recent = useMemo(() => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, SHOWN), [conversations]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            // The panel closes on Escape too: only the list closes here.
            event.stopPropagation();
            setOpen(false);
            button.current?.focus();
        };
        window.addEventListener("pointerdown", onPointer);
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("pointerdown", onPointer);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [open]);

    return (
        <div ref={root} className="relative min-w-0 flex-1">
            <button
                ref={button}
                type="button"
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
                aria-controls={listId}
                title={tx(C.switch)}
                className="group flex max-w-full items-center gap-1 rounded-lg px-1.5 py-1 text-start transition hover:bg-ai-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30"
                data-ai-recent-chats
            >
                <span className="truncate text-[14.5px] font-bold tracking-tight text-ai-ink">{title}</span>
                <ChevronDown className={cx("h-4 w-4 shrink-0 text-ai-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
            </button>
            <AnimatePresence>
                {open ? (
                    <motion.div
                        id={listId}
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute start-0 top-full z-30 mt-1.5 w-[17rem] origin-top-left overflow-hidden rounded-2xl border border-ai-line bg-ai-surface p-1.5 shadow-xl shadow-black/10 rtl:origin-top-right"
                        role="dialog"
                        aria-label={tx(C.switch)}
                    >
                        <p className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-ai-muted">{tx(C.switch)}</p>
                        {recent.length ? (
                            <ul className="scrollbar-thin max-h-72 overflow-y-auto">
                                {recent.map((conversation, index) => {
                                    const selected = conversation.id === activeId;
                                    return (
                                        <motion.li key={conversation.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.025 }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onSelect(conversation.id);
                                                    setOpen(false);
                                                    button.current?.focus();
                                                }}
                                                aria-current={selected ? "true" : undefined}
                                                className={cx("flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-start text-[13px] transition", selected ? "bg-ai-ink/[0.06] font-semibold text-ai-ink" : "text-ai-ink/85 hover:bg-ai-ink/[0.04]")}
                                            >
                                                <span className="min-w-0 flex-1 truncate">{conversation.title || tx(C.untitled)}</span>
                                                {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-brand-green" aria-hidden /> : null}
                                            </button>
                                        </motion.li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="px-2.5 py-3 text-[12.5px] text-ai-muted">{tx(C.none)}</p>
                        )}
                        <div className="mx-2.5 my-1 h-px bg-ai-line" aria-hidden />
                        <Link href="/ai" onClick={onNavigate} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-ai-ink/80 transition hover:bg-ai-ink/[0.04] hover:text-ai-ink">
                            <MessagesSquare className="h-3.5 w-3.5" aria-hidden />{tx(C.all)}
                        </Link>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
