"use client";

import { Bot, Code2, Cpu, MessageSquarePlus, PanelLeftClose, Pencil, Search, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CORE_INFO } from "@/lib/ai/local-engine";
import type { AiConversation } from "@/lib/ai/conversations";
import { useI18n, type Copy } from "@/lib/i18n";
import { AiAvatar, cx, ICON_BUTTON } from "./ui";

const C = {
    newChat: { TR: "Yeni sohbet", EN: "New chat" },
    search: { TR: "Sohbetlerde ara", EN: "Search chats" },
    chats: { TR: "Sohbetler", EN: "Chats" },
    empty: { TR: "Henüz sohbet yok.", EN: "No chats yet." },
    noMatch: { TR: "Eşleşen sohbet yok.", EN: "No matching chats." },
    untitled: { TR: "Yeni sohbet", EN: "New chat" },
    rename: { TR: "Yeniden adlandır", EN: "Rename" },
    renameLabel: { TR: "Sohbet adı", EN: "Chat name" },
    remove: { TR: "Sil", EN: "Delete" },
    confirmDelete: { TR: "Bu sohbet silinsin mi?", EN: "Delete this chat?" },
    confirmDeleteAll: { TR: "Tüm sohbetler silinsin mi?", EN: "Delete all chats?" },
    deleteAll: { TR: "Tüm sohbetleri sil", EN: "Delete all chats" },
    collapse: { TR: "Kenar çubuğunu gizle", EN: "Hide sidebar" },
    close: { TR: "Kapat", EN: "Close" },
    local: { TR: "Sohbetlerin yalnızca bu tarayıcıda saklanır.", EN: "Your chats are stored only in this browser." },
    core: { TR: "Çekirdek modeli: {intents} niyet, test doğruluğu %{accuracy}", EN: "Core model: {intents} intents, {accuracy}% test accuracy" },
    groups: {
        today: { TR: "Bugün", EN: "Today" },
        yesterday: { TR: "Dün", EN: "Yesterday" },
        week: { TR: "Önceki 7 gün", EN: "Previous 7 days" },
        older: { TR: "Daha eski", EN: "Older" },
    } satisfies Record<string, Copy>,
};

type DateGroup = keyof typeof C.groups;

function dateGroup(timestamp: number): DateGroup {
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(timestamp).setHours(0, 0, 0, 0)) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days <= 7) return "week";
    return "older";
}

const MODE_ICONS = { general: Sparkles, code: Code2, security: ShieldCheck } as const;

/**
 * Conversation history, Claude-style: new chat, search and chats grouped by
 * date (today, yesterday, previous 7 days, older) with rename and delete.
 */
export default function ChatSidebar({ conversations, activeId, onSelect, onNew, onRename, onDelete, onClearAll, onCollapse, onClose }: {
    conversations: AiConversation[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
    onClearAll: () => void;
    /** Desktop: hide the sidebar. */
    onCollapse?: () => void;
    /** Mobile drawer: close it. */
    onClose?: () => void;
}) {
    const { tx, locale } = useI18n();
    const [search, setSearch] = useState("");
    const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

    const groups = useMemo(() => {
        const query = search.trim().toLocaleLowerCase(locale);
        const filtered = conversations
            .filter((conversation) => !query || conversation.title.toLocaleLowerCase(locale).includes(query) || conversation.messages.some((message) => message.content.slice(0, 2_000).toLocaleLowerCase(locale).includes(query)))
            .sort((a, b) => b.updatedAt - a.updatedAt);
        const order: DateGroup[] = ["today", "yesterday", "week", "older"];
        return order
            .map((group) => ({ group, items: filtered.filter((conversation) => dateGroup(conversation.updatedAt) === group) }))
            .filter((entry) => entry.items.length);
    }, [conversations, locale, search]);

    const commitRename = () => {
        if (renaming) onRename(renaming.id, renaming.title);
        setRenaming(null);
    };

    return (
        <aside className="flex h-full w-[17.5rem] shrink-0 flex-col border-e border-zinc-200/80 bg-[#f7f6f3] dark:border-white/[0.06] dark:bg-zinc-950" aria-label={tx(C.chats)}>
            <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                <AiAvatar size="h-7 w-7" />
                <span className="flex-1 truncate text-[15px] font-black tracking-tight text-zinc-900 dark:text-white">Hanogt AI</span>
                {onCollapse ? <button type="button" onClick={onCollapse} className={ICON_BUTTON} title={tx(C.collapse)} aria-label={tx(C.collapse)}><PanelLeftClose className="h-4.5 w-4.5" /></button> : null}
                {onClose ? <button type="button" onClick={onClose} className={ICON_BUTTON} title={tx(C.close)} aria-label={tx(C.close)}><X className="h-5 w-5" /></button> : null}
            </div>
            <div className="space-y-2 px-3 pb-2">
                <button type="button" onClick={onNew} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[13.5px] font-semibold text-violet-700 transition hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:text-violet-300">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-violet-600 text-white"><MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /></span>
                    {tx(C.newChat)}
                </button>
                <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] focus-within:border-violet-400 dark:border-white/10 dark:bg-white/[0.03]">
                    <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx(C.search)} aria-label={tx(C.search)} className="min-w-0 flex-1 bg-transparent text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100" />
                </label>
            </div>
            <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label={tx(C.chats)}>
                {!groups.length ? <p className="px-3 py-6 text-center text-[12.5px] text-zinc-400">{tx(search.trim() ? C.noMatch : C.empty)}</p> : null}
                {groups.map(({ group, items }) => (
                    <div key={group} className="pt-2">
                        <p className="px-2.5 pb-1 text-[11px] font-semibold text-zinc-400">{tx(C.groups[group])}</p>
                        <ul className="space-y-px">
                            {items.map((conversation) => {
                                const Icon = MODE_ICONS[conversation.mode] ?? Sparkles;
                                const selected = conversation.id === activeId;
                                return (
                                    <li key={conversation.id} className={cx("group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[13px] transition", selected ? "bg-zinc-900/[0.07] dark:bg-white/[0.08]" : "hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.04]")}>
                                        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                                        {renaming?.id === conversation.id ? (
                                            <input
                                                autoFocus
                                                value={renaming.title}
                                                aria-label={tx(C.renameLabel)}
                                                onChange={(event) => setRenaming({ id: conversation.id, title: event.target.value.slice(0, 80) })}
                                                onBlur={commitRename}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter") commitRename();
                                                    if (event.key === "Escape") setRenaming(null);
                                                }}
                                                className="min-w-0 flex-1 rounded-md bg-white px-1.5 py-0.5 outline-none ring-2 ring-violet-400 dark:bg-zinc-900"
                                            />
                                        ) : (
                                            <button type="button" onClick={() => onSelect(conversation.id)} aria-current={selected ? "page" : undefined} className="min-w-0 flex-1 truncate px-1 py-0.5 text-start text-zinc-700 dark:text-zinc-200">
                                                {conversation.title || tx(C.untitled)}
                                            </button>
                                        )}
                                        <button type="button" onClick={() => setRenaming({ id: conversation.id, title: conversation.title })} className={cx(ICON_BUTTON, "p-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100")} title={tx(C.rename)} aria-label={tx(C.rename)}><Pencil className="h-3.5 w-3.5" /></button>
                                        <button type="button" onClick={() => { if (window.confirm(tx(C.confirmDelete))) onDelete(conversation.id); }} className={cx(ICON_BUTTON, "p-1 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100")} title={tx(C.remove)} aria-label={tx(C.remove)}><Trash2 className="h-3.5 w-3.5" /></button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>
            <div className="space-y-1.5 border-t border-zinc-200/80 p-3 text-[11.5px] text-zinc-500 dark:border-white/[0.06] dark:text-zinc-400">
                <p className="flex items-start gap-1.5"><Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />{tx(C.local)}</p>
                <p className="flex items-start gap-1.5"><Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />{tx(C.core, { intents: CORE_INFO.intents, accuracy: CORE_INFO.quantizedTestAccuracy })}</p>
                {conversations.length ? <button type="button" onClick={() => { if (window.confirm(tx(C.confirmDeleteAll))) onClearAll(); }} className="font-semibold text-red-500 hover:underline">{tx(C.deleteAll)}</button> : null}
            </div>
        </aside>
    );
}
