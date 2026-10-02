"use client";

import { Plus, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/Groups/ui";
import PresenceAvatar from "@/components/PresenceAvatar";
import { useI18n, type Copy } from "@/lib/i18n";
import { dmChatId, dmHref, type DmSummary } from "@/lib/social/model";
import { useSocial } from "./context";
import { CountBadge, SectionLabel, SidebarLink } from "./ui";

const C = {
    find: { TR: "Sohbet bul veya başlat", EN: "Find or start a conversation" },
    shortcut: { TR: "Ctrl K", EN: "Ctrl K" },
    friends: { TR: "Arkadaşlar", EN: "Friends" },
    dms: { TR: "Direkt mesajlar", EN: "Direct messages" },
    newDm: { TR: "Direkt mesaj başlat", EN: "Start a direct message" },
    empty: { TR: "Henüz sohbet yok. Bir arkadaşına mesaj göndererek başla.", EN: "No conversations yet. Start by messaging a friend." },
    loading: { TR: "Sohbetler yükleniyor", EN: "Loading conversations" },
    you: { TR: "Sen: {text}", EN: "You: {text}" },
    deleted: { TR: "Mesaj silindi", EN: "Message deleted" },
    typing: { TR: "yazıyor…", EN: "typing…" },
    close: { TR: "{name} sohbetini listeden kaldır", EN: "Remove the conversation with {name} from the list" },
    unread: { TR: "{count} okunmamış mesaj", EN: "{count} unread messages" },
} satisfies Record<string, Copy>;

/** Second column on Home: search, the Friends entry and the direct-message list. */
export default function HomeSidebar() {
    const { tx } = useI18n();
    const { route, friends, dms, ui, me } = useSocial();
    const activeChat = route.kind === "dm" ? dmChatId(me.email, route.email) : "";
    const close = () => ui.setNavOpen(false);

    return (
        <>
            <div className="flex h-12 shrink-0 items-center border-b border-zinc-200 px-2.5 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-black/50">
                <button
                    type="button"
                    onClick={() => { close(); ui.openSwitcher(); }}
                    className="flex h-8 w-full items-center gap-2 rounded-md bg-zinc-200/80 px-2 text-start text-[13px] text-zinc-500 transition hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-black/40 dark:text-zinc-400 dark:hover:text-zinc-200"
                    aria-keyshortcuts="Control+K Meta+K"
                >
                    <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{tx(C.find)}</span>
                    <kbd className="hidden shrink-0 rounded border border-zinc-300 px-1 font-sans text-[10px] text-zinc-400 md:inline dark:border-zinc-700">{tx(C.shortcut)}</kbd>
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                <SidebarLink href="/social" active={route.kind === "home"} icon={<Users className="h-5 w-5" aria-hidden />} label={tx(C.friends)} badge={friends.incoming.length} onClick={close} />
                <SectionLabel id="dm-list-title" action={(
                    <button type="button" onClick={() => { close(); ui.openSwitcher(); }} className="rounded p-0.5 text-zinc-500 transition hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:text-white" aria-label={tx(C.newDm)} title={tx(C.newDm)}>
                        <Plus className="h-4 w-4" aria-hidden />
                    </button>
                )}>
                    {tx(C.dms)}
                </SectionLabel>
                {!dms.loaded && !dms.visible.length ? (
                    <ul aria-busy="true" aria-label={tx(C.loading)} className="space-y-1 px-1">
                        {[0, 1, 2, 3].map((item) => (
                            <li key={item} className="flex items-center gap-3 px-1 py-1.5">
                                <span className="h-8 w-8 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                                <span className="h-3 flex-1 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                            </li>
                        ))}
                    </ul>
                ) : dms.visible.length === 0 ? (
                    <p className="px-2 py-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.empty)}</p>
                ) : (
                    <ul aria-labelledby="dm-list-title" className="space-y-0.5">
                        {dms.visible.map((dm) => <DmRow key={dm.chatId} dm={dm} active={dm.chatId === activeChat} onNavigate={close} onHide={() => dms.hide(dm.chatId, dm.lastMessageAt)} />)}
                    </ul>
                )}
            </div>
        </>
    );
}

function DmRow({ dm, active, onNavigate, onHide }: { dm: DmSummary; active: boolean; onNavigate: () => void; onHide: () => void }) {
    const { tx } = useI18n();
    const name = dm.partner.username;
    const preview = dm.typing
        ? tx(C.typing)
        : !dm.lastMessage ? tx(C.deleted) : dm.lastFromMe ? tx(C.you, { text: dm.lastMessage }) : dm.lastMessage;
    const unread = dm.unread > 0;
    return (
        <li className="group relative">
            <Link
                href={dmHref(dm.partner.email)}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={unread ? `${name}, ${tx(C.unread, { count: dm.unread })}` : undefined}
                className={cx(
                    "flex items-center gap-3 rounded-md px-2 py-1.5 pe-8 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                    active ? "bg-zinc-300/60 dark:bg-white/10" : "hover:bg-zinc-200/70 dark:hover:bg-white/[0.05]",
                )}
            >
                <PresenceAvatar
                    src={dm.partner.avatarUrl}
                    name={name}
                    status={dm.isFriend ? dm.partner.status : null}
                    size="sm"
                    ring={active ? "bg-zinc-300 dark:bg-zinc-800" : "bg-zinc-100 group-hover:bg-zinc-200 dark:bg-zinc-950 dark:group-hover:bg-zinc-900"}
                />
                <span className="min-w-0 flex-1">
                    <span className={cx("block truncate text-[15px] leading-5", unread || active ? "font-semibold text-zinc-900 dark:text-white" : "font-medium text-zinc-600 dark:text-zinc-400")}>{name}</span>
                    <span className={cx("block truncate text-xs leading-4", dm.typing ? "italic text-indigo-600 dark:text-indigo-300" : !dm.lastMessage ? "italic text-zinc-400" : unread ? "text-zinc-700 dark:text-zinc-200" : "text-zinc-500 dark:text-zinc-500")}>{preview}</span>
                </span>
                <CountBadge count={dm.unread} className="group-hover:hidden group-focus-within:hidden" />
            </Link>
            <button
                type="button"
                onClick={onHide}
                className={cx("absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 transition hover:text-zinc-900 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:text-white", "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100", active && "hidden")}
                aria-label={tx(C.close, { name })}
                title={tx(C.close, { name })}
            >
                <X className="h-4 w-4" aria-hidden />
            </button>
        </li>
    );
}
