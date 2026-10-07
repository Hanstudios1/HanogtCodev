"use client";

import { LayoutGroup, motion } from "framer-motion";
import { Bot, Check, CircleDashed, Code2, Cpu, EyeOff, FileDiff, KeyRound, ListTodo, Loader2, MessageSquarePlus, MessagesSquare, PanelLeftClose, Pencil, Search, Settings2, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { CORE_INFO } from "@/lib/ai/local-engine";
import type { AiConversation } from "@/lib/ai/conversations";
import { useI18n, type Copy } from "@/lib/i18n";
import { taskOf, type ChatTask, type TaskState } from "./proposals";
import { AiAvatar, cx, ICON_BUTTON } from "./ui";

const C = {
    newChat: { TR: "Yeni sohbet", EN: "New chat" },
    privateChat: { TR: "Gizli sohbet (kaydedilmez)", EN: "Private chat (not saved)" },
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
    settings: { TR: "Hanogt AI ayarları", EN: "Hanogt AI settings" },
    api: { TR: "API ve bağlantılar", EN: "API and connections" },
    collapse: { TR: "Kenar çubuğunu gizle", EN: "Hide sidebar" },
    tabs: { TR: "Görünüm", EN: "View" },
    tasks: { TR: "Görevler", EN: "Tasks" },
    tasksEmpty: { TR: "Editörde açık bir dosya hakkında sorduğunda, Hanogt AI'ın üzerinde çalıştığı değişiklikler burada görev olarak listelenir.", EN: "When you ask about a file open in the editor, the changes Hanogt AI works on are listed here as tasks." },
    noMatchingTask: { TR: "Eşleşen görev yok.", EN: "No matching tasks." },
    readyCount: { TR: "{count} değişiklik bekliyor", EN: "{count} changes waiting" },
    state: {
        working: { TR: "Çalışıyor", EN: "Working" },
        ready: { TR: "Hazır", EN: "Ready" },
        applied: { TR: "Uygulandı", EN: "Applied" },
        dismissed: { TR: "Yoksayıldı", EN: "Dismissed" },
        answered: { TR: "Yanıtlandı", EN: "Answered" },
    } satisfies Record<TaskState, Copy>,
    changed: { TR: "{added} satır eklendi, {removed} satır silindi", EN: "{added} lines added, {removed} removed" },
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
type View = "chats" | "tasks";

// The time, in whole minutes (0 while rendering on the server), for "5 min ago".
function subscribeMinutes(callback: () => void) {
    const timer = window.setInterval(callback, 30_000);
    return () => window.clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverNow = () => 0;

function relativeTime(timestamp: number, now: number, locale: string) {
    if (!now) return "";
    const minutes = Math.round((timestamp - now) / 60_000);
    const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
    if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return format.format(hours, "hour");
    return format.format(Math.round(hours / 24), "day");
}

const STATE_ICON: Record<TaskState, typeof Check> = { working: Loader2, ready: FileDiff, applied: Check, dismissed: X, answered: CircleDashed };
const STATE_TONE: Record<TaskState, string> = {
    working: "text-blue-600 dark:text-blue-400",
    ready: "text-violet-600 dark:text-violet-400",
    applied: "text-brand-green",
    dismissed: "text-ai-muted",
    answered: "text-ai-muted",
};

/** A task: the conversation's title, its file and when, and where it stands (Codex-style). */
function TaskRow({ task, selected, now, onSelect }: { task: ChatTask; selected: boolean; now: number; onSelect: () => void }) {
    const { tx, locale } = useI18n();
    const Icon = STATE_ICON[task.state];
    return (
        <li>
            <button
                type="button"
                onClick={onSelect}
                aria-current={selected ? "page" : undefined}
                className={cx("relative flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-start transition", selected ? "" : "hover:bg-ai-ink/[0.04]")}
                data-ai-task={task.state}
            >
                {selected ? <motion.span layoutId="ai-sidebar-active" className="absolute inset-0 rounded-xl bg-ai-ink/[0.07]" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden /> : null}
                <Icon className={cx("relative mt-0.5 h-4 w-4 shrink-0", STATE_TONE[task.state], task.state === "working" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ai-ink/90">{task.conversation.title || tx(C.untitled)}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ai-muted">
                        <span className="truncate font-mono">{task.fileName}</span>
                        {now ? <><span aria-hidden>·</span><span className="shrink-0">{relativeTime(task.conversation.updatedAt, now, locale)}</span></> : null}
                    </span>
                </span>
                <span className="relative shrink-0 pt-0.5 text-[11px] font-semibold">
                    {task.state === "ready" ? (
                        <span className="font-mono tabular-nums" title={tx(C.changed, { added: task.added, removed: task.removed })}>
                            <span className="text-brand-green">+{task.added}</span> <span className="text-rose-600 dark:text-rose-400">−{task.removed}</span>
                        </span>
                    ) : (
                        <span className={STATE_TONE[task.state]}>{tx(C.state[task.state])}</span>
                    )}
                </span>
            </button>
        </li>
    );
}

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
 * date (today, yesterday, previous 7 days, older) with rename and delete;
 * and Codex-style tasks: the conversations about an editor file, with what
 * they would change (+/- lines) or whether the change was applied.
 */
export default function ChatSidebar({ conversations, activeId, streamingId, onSelect, onNew, onRename, onDelete, onClearAll, onCollapse, onClose }: {
    conversations: AiConversation[];
    activeId: string | null;
    /** The answer being written, if any (its task shows "Working"). */
    streamingId: string | null;
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
    const [view, setView] = useState<View>("chats");

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

    const now = useSyncExternalStore(subscribeMinutes, minuteNow, serverNow);
    // Conversations about an editor file, newest first.
    const tasks = useMemo(() => {
        const query = search.trim().toLocaleLowerCase(locale);
        const list = conversations
            .map((conversation) => taskOf(conversation, streamingId))
            .filter((task): task is ChatTask => task !== null)
            .filter((task) => !query || task.conversation.title.toLocaleLowerCase(locale).includes(query) || task.fileName.toLocaleLowerCase(locale).includes(query))
            .sort((a, b) => b.conversation.updatedAt - a.conversation.updatedAt);
        return list;
    }, [conversations, locale, search, streamingId]);
    const ready = tasks.filter((task) => task.state === "ready").length;

    const commitRename = () => {
        if (renaming) onRename(renaming.id, renaming.title);
        setRenaming(null);
    };

    return (
        <aside className="flex h-full w-[17.5rem] shrink-0 flex-col border-e border-ai-line bg-ai-sidebar" aria-label={tx(C.chats)}>
            <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                <AiAvatar size={28} />
                <span className="flex-1 truncate text-[15px] font-black tracking-tight text-ai-ink">Hanogt <span className="text-gradient">AI</span></span>
                {onCollapse ? <button type="button" onClick={onCollapse} className={ICON_BUTTON} title={tx(C.collapse)} aria-label={tx(C.collapse)}><PanelLeftClose className="h-4.5 w-4.5" /></button> : null}
                {onClose ? <button type="button" onClick={onClose} className={ICON_BUTTON} title={tx(C.close)} aria-label={tx(C.close)}><X className="h-5 w-5" /></button> : null}
            </div>
            <div className="space-y-2 px-3 pb-2">
                <button type="button" onClick={onNew} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[13.5px] font-semibold text-brand-green transition hover:bg-brand-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-ai-ink text-ai-paper"><MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /></span>
                    {tx(C.newChat)}
                </button>
                <label className="flex items-center gap-2 rounded-xl border border-ai-line bg-ai-surface px-2.5 py-1.5 text-[13px] focus-within:border-ai-ink/30">
                    <Search className="h-3.5 w-3.5 shrink-0 text-ai-muted" aria-hidden />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx(C.search)} aria-label={tx(C.search)} className="min-w-0 flex-1 bg-transparent text-ai-ink outline-none placeholder:text-ai-muted/80" />
                </label>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-ai-ink/[0.05] p-1" role="tablist" aria-label={tx(C.tabs)}>
                    {(["chats", "tasks"] as const).map((id) => {
                        const selected = view === id;
                        const Icon = id === "chats" ? MessagesSquare : ListTodo;
                        return (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                aria-controls={`ai-sidebar-${id}`}
                                onClick={() => setView(id)}
                                className={cx("relative inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30", selected ? "text-ai-ink" : "text-ai-muted hover:text-ai-ink")}
                                data-ai-sidebar-tab={id}
                            >
                                {selected ? <motion.span layoutId="ai-sidebar-tab" className="absolute inset-0 rounded-lg bg-ai-surface shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} aria-hidden /> : null}
                                <Icon className="relative h-3.5 w-3.5" aria-hidden />
                                <span className="relative">{tx(id === "chats" ? C.chats : C.tasks)}</span>
                                {id === "tasks" && ready ? <span className="relative grid h-4 min-w-4 place-items-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white dark:bg-violet-500" title={tx(C.readyCount, { count: ready })}>{ready}</span> : null}
                            </button>
                        );
                    })}
                </div>
            </div>
            <LayoutGroup>
            {view === "tasks" ? (
                <nav id="ai-sidebar-tasks" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1" aria-label={tx(C.tasks)} role="tabpanel">
                    {tasks.length ? (
                        <ul className="space-y-px">
                            {tasks.map((task) => <TaskRow key={task.conversation.id} task={task} now={now} selected={task.conversation.id === activeId} onSelect={() => onSelect(task.conversation.id)} />)}
                        </ul>
                    ) : (
                        <p className="px-3 py-6 text-center text-[12.5px] leading-relaxed text-ai-muted">{tx(search.trim() ? C.noMatchingTask : C.tasksEmpty)}</p>
                    )}
                </nav>
            ) : (
            <nav id="ai-sidebar-chats" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label={tx(C.chats)} role="tabpanel">
                {!groups.length ? <p className="px-3 py-6 text-center text-[12.5px] text-ai-muted">{tx(search.trim() ? C.noMatch : C.empty)}</p> : null}
                {groups.map(({ group, items }) => (
                    <div key={group} className="pt-2">
                        <p className="px-2.5 pb-1 text-[11px] font-semibold text-ai-muted">{tx(C.groups[group])}</p>
                        <ul className="space-y-px">
                            {items.map((conversation) => {
                                const Icon = MODE_ICONS[conversation.mode] ?? Sparkles;
                                const selected = conversation.id === activeId;
                                return (
                                    <li key={conversation.id} className={cx("group relative flex items-center gap-1 rounded-xl px-2 py-1.5 text-[13px] transition", !selected && "hover:bg-ai-ink/[0.04]")}>
                                        {selected ? <motion.span layoutId="ai-sidebar-active" className="absolute inset-0 rounded-xl bg-ai-ink/[0.07]" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden /> : null}
                                        <Icon className="relative h-3.5 w-3.5 shrink-0 text-ai-muted" aria-hidden />
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
                                                className="relative min-w-0 flex-1 rounded-md bg-ai-surface px-1.5 py-0.5 outline-none ring-2 ring-ai-ink/30"
                                            />
                                        ) : (
                                            <button type="button" onClick={() => onSelect(conversation.id)} aria-current={selected ? "page" : undefined} className="relative flex min-w-0 flex-1 items-center gap-1.5 px-1 py-0.5 text-start text-ai-ink/85">
                                                {conversation.ephemeral ? <EyeOff className="h-3.5 w-3.5 shrink-0 text-ai-muted" role="img" aria-label={tx(C.privateChat)} /> : null}
                                                <span className="truncate">{conversation.title || tx(C.untitled)}</span>
                                            </button>
                                        )}
                                        <button type="button" onClick={() => setRenaming({ id: conversation.id, title: conversation.title })} className={cx(ICON_BUTTON, "relative p-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100")} title={tx(C.rename)} aria-label={tx(C.rename)}><Pencil className="h-3.5 w-3.5" /></button>
                                        <button type="button" onClick={() => { if (window.confirm(tx(C.confirmDelete))) onDelete(conversation.id); }} className={cx(ICON_BUTTON, "relative p-1 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100")} title={tx(C.remove)} aria-label={tx(C.remove)}><Trash2 className="h-3.5 w-3.5" /></button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>
            )}
            </LayoutGroup>
            <div className="space-y-1.5 border-t border-ai-line p-3 text-[11.5px] text-ai-muted">
                <p className="flex items-start gap-1.5"><Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-green" aria-hidden />{tx(C.local)}</p>
                <p className="flex items-start gap-1.5"><Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-green" aria-hidden />{tx(C.core, { intents: CORE_INFO.intents, accuracy: CORE_INFO.quantizedTestAccuracy })}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href="/ai/settings" className="inline-flex items-center gap-1 font-semibold text-brand-green hover:underline" data-ai-settings-link><Settings2 className="h-3.5 w-3.5" aria-hidden />{tx(C.settings)}</Link>
                    <Link href="/ai/api" className="inline-flex items-center gap-1 font-semibold text-brand-green hover:underline" data-ai-api-link><KeyRound className="h-3.5 w-3.5" aria-hidden />{tx(C.api)}</Link>
                    {conversations.length ? <button type="button" onClick={() => { if (window.confirm(tx(C.confirmDeleteAll))) onClearAll(); }} className="font-semibold text-red-500 hover:underline">{tx(C.deleteAll)}</button> : null}
                </div>
            </div>
        </aside>
    );
}
