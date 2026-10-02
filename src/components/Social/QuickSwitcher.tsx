"use client";

import { Hash, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { GroupTile, Modal, cx } from "@/components/Groups/ui";
import PresenceAvatar from "@/components/PresenceAvatar";
import { useI18n, type Copy } from "@/lib/i18n";
import { toMillis, type GroupColor } from "@/lib/groups";
import type { PresenceStatus } from "@/lib/presence";
import { badgeLabel, dmHref, formatFriendTag, groupHref, rankSwitcher, type SwitcherItem } from "@/lib/social/model";
import { useSocial } from "./context";

const C = {
    title: { TR: "Hızlı geçiş", EN: "Quick switcher" },
    placeholder: { TR: "Nereye gitmek istersin?", EN: "Where would you like to go?" },
    label: { TR: "Arkadaş, sohbet veya grup ara", EN: "Search friends, conversations or groups" },
    noResults: { TR: "Eşleşen bir şey bulunamadı.", EN: "Nothing matches." },
    hint: { TR: "↑↓ ile gez, Enter ile aç, Esc ile kapat", EN: "↑↓ to move, Enter to open, Esc to close" },
    dm: { TR: "Direkt mesaj", EN: "Direct message" },
    friend: { TR: "Arkadaş", EN: "Friend" },
    group: { TR: "Grup", EN: "Group" },
    members: { TR: "{count} üye", EN: "{count} members" },
} satisfies Record<string, Copy>;

/** Ctrl/⌘+K: jump to a friend, a conversation or a group by typing. */
export default function QuickSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { tx } = useI18n();
    const router = useRouter();
    const { friends, dms, groups, isFriend } = useSocial();
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const listId = useId();

    const { items, visuals } = useMemo(() => {
        const visualMap = new Map<string, { avatar: string | null; status: PresenceStatus | null; emoji?: string; color?: GroupColor; name: string }>();
        const list: SwitcherItem[] = [];
        for (const dm of dms.list) {
            const href = dmHref(dm.partner.email);
            list.push({ id: `dm:${dm.chatId}`, kind: "dm", label: dm.partner.username, hint: formatFriendTag(dm.partner.nickname, dm.partner.nicknameTag), href, recent: dm.lastMessageAt, unread: dm.unread });
            visualMap.set(href, { avatar: dm.partner.avatarUrl, status: isFriend(dm.partner.email) ? dm.partner.status : null, name: dm.partner.username });
        }
        for (const friend of friends.list) {
            const href = dmHref(friend.email);
            list.push({ id: `friend:${friend.email}`, kind: "friend", label: friend.username, hint: formatFriendTag(friend.nickname, friend.nicknameTag), href, recent: 0, unread: 0 });
            if (!visualMap.has(href)) visualMap.set(href, { avatar: friend.avatarUrl, status: friend.status, name: friend.username });
        }
        for (const group of groups.list) {
            const href = groupHref(group.id);
            list.push({ id: `group:${group.id}`, kind: "group", label: group.name, hint: tx(C.members, { count: group.memberCount }), href, recent: toMillis(group.lastMessageAt), unread: groups.unread[group.id]?.unread ?? 0 });
            visualMap.set(href, { avatar: null, status: null, emoji: group.emoji, color: group.color, name: group.name });
        }
        return { items: list, visuals: visualMap };
    }, [dms.list, friends.list, groups.list, groups.unread, isFriend, tx]);

    const results = useMemo(() => rankSwitcher(items, query, 12), [items, query]);
    const active = Math.min(index, Math.max(0, results.length - 1));

    // Keeps the highlighted option visible while moving with the arrow keys.
    useEffect(() => {
        if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
    }, [active, listId, open]);

    const go = (item: SwitcherItem | undefined) => {
        if (!item) return;
        onClose();
        router.push(item.href);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!results.length) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setIndex((active + step + results.length) % results.length);
        } else if (event.key === "Enter") {
            event.preventDefault();
            go(results[active]);
        }
    };

    const kindLabel = (kind: SwitcherItem["kind"]) => tx(kind === "group" ? C.group : kind === "dm" ? C.dm : C.friend);

    return (
        <Modal open={open} onClose={onClose} labelledBy="quick-switcher-title" size="md">
            <div className="p-4 sm:p-5">
                <h2 id="quick-switcher-title" className="text-lg font-black">{tx(C.title)}</h2>
                <div className="relative mt-3">
                    <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" aria-hidden />
                    <input
                        data-autofocus
                        value={query}
                        onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
                        onKeyDown={onKeyDown}
                        role="combobox"
                        aria-expanded
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
                        aria-label={tx(C.label)}
                        placeholder={tx(C.placeholder)}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pe-3 ps-11 text-base outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950"
                    />
                </div>
                {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-zinc-500" role="status">{tx(C.noResults)}</p>}
                <ul id={listId} role="listbox" aria-label={tx(C.label)} className={cx("max-h-[50dvh] space-y-0.5 overflow-y-auto", results.length > 0 && "mt-3")}>
                    {results.map((item, position) => {
                        const visual = visuals.get(item.href);
                        return (
                            <li
                                key={item.id}
                                id={`${listId}-${position}`}
                                role="option"
                                aria-selected={position === active}
                                onPointerMove={() => { if (position !== active) setIndex(position); }}
                                onClick={() => go(item)}
                                className={cx("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2", position === active ? "bg-indigo-500/10 text-indigo-900 dark:bg-indigo-400/15 dark:text-white" : "text-zinc-700 dark:text-zinc-200")}
                            >
                                {item.kind === "group"
                                    ? <GroupTile emoji={visual?.emoji ?? "👥"} color={visual?.color ?? "indigo"} size="xs" />
                                    : <PresenceAvatar src={visual?.avatar} name={item.label} status={visual?.status ?? null} size="sm" ring={position === active ? "bg-indigo-50 dark:bg-zinc-800" : "bg-white dark:bg-zinc-900"} />}
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1 truncate text-sm font-semibold">{item.kind === "group" && <Hash className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />}{item.label}</span>
                                    {item.hint && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{item.hint}</span>}
                                </span>
                                {item.unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-[18px] text-white">{badgeLabel(item.unread)}</span>}
                                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{kindLabel(item.kind)}</span>
                            </li>
                        );
                    })}
                </ul>
                <p className="mt-3 text-center text-[11px] text-zinc-400">{tx(C.hint)}</p>
            </div>
        </Modal>
    );
}
