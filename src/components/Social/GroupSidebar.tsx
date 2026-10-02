"use client";

import { Bell, BellOff, BellRing, ChevronDown, FolderOpen, Hash, LogOut, Pin, Rocket, Settings, UserPlus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cx } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import { setGroupNotifyLevel } from "@/lib/social/local-state";
import { badgeLabel, groupHref, type ChannelUnread, type GroupNotifyLevel } from "@/lib/social/model";
import { useSocial } from "./context";
import { useGroupNav } from "./group/nav";
import { DropdownMenu, SectionLabel } from "./ui";

const C = {
    menu: { TR: "{name} grubu menüsü", EN: "{name} group menu" },
    invite: { TR: "Davet et", EN: "Invite people" },
    settings: { TR: "Grup ayarları", EN: "Group settings" },
    info: { TR: "Grup bilgileri", EN: "Group info" },
    notifications: { TR: "Bildirimler", EN: "Notifications" },
    all: { TR: "Tüm mesajlar", EN: "All messages" },
    mentions: { TR: "Yalnızca @bahsetmeler", EN: "Only @mentions" },
    none: { TR: "Hiçbiri", EN: "Nothing" },
    allHint: { TR: "Okunmamış her mesaj için işaret", EN: "A marker for every unread message" },
    mentionsHint: { TR: "Yalnızca senden bahsedilince sayaç", EN: "A counter only when you're mentioned" },
    noneHint: { TR: "Grup sessize alınır", EN: "The group is muted" },
    leave: { TR: "Gruptan ayrıl", EN: "Leave group" },
    ownerLeave: { TR: "Önce sahipliği devretmelisin (Ayarlar → Gelişmiş)", EN: "Transfer ownership first (Settings → Advanced)" },
    textChannels: { TR: "Metin kanalları", EN: "Text channels" },
    more: { TR: "Grup", EN: "Group" },
    files: { TR: "Dosyalar", EN: "Files" },
    filesOffline: { TR: "Bulut bağlantısı gerekiyor", EN: "Needs the cloud connection" },
    pinned: { TR: "Sabitlenenler", EN: "Pinned messages" },
    guide: { TR: "Başlangıç rehberi", EN: "Getting started" },
    guideProgress: { TR: "{done}/{total} tamamlandı", EN: "{done} of {total} done" },
    loading: { TR: "Grup yükleniyor", EN: "Loading the group" },
    unreadChannel: { TR: "{name}, okunmamış mesajlar var", EN: "{name}, unread messages" },
    mentionChannel: { TR: "{name}, {count} bahsetme", EN: "{name}, {count} mentions" },
    gone: { TR: "Bu gruba artık erişimin yok.", EN: "You no longer have access to this group." },
} satisfies Record<string, Copy>;

const LEVELS: Array<{ id: GroupNotifyLevel; label: Copy; hint: Copy; icon: typeof Bell }> = [
    { id: "all", label: C.all, hint: C.allHint, icon: BellRing },
    { id: "mentions", label: C.mentions, hint: C.mentionsHint, icon: Bell },
    { id: "none", label: C.none, hint: C.noneHint, icon: BellOff },
];

/** Second column inside a group: the group menu, the channel list (#genel and the group's topics), files and pins. */
export default function GroupSidebar() {
    const { tx } = useI18n();
    const params = useSearchParams();
    const { route, groups, ui } = useSocial();
    const { nav } = useGroupNav();
    const groupId = route.kind === "group" ? route.groupId : "";
    const summary = groups.list.find((group) => group.id === groupId) ?? null;
    const current = nav && nav.groupId === groupId ? nav : null;
    const group = current?.group ?? null;
    const name = group?.name ?? summary?.name ?? "";
    const topic = params.get("topic") || "";
    const view = params.get("view") === "files" ? "files" : "chat";
    const level = groups.levels[groupId] ?? "all";
    const mainChannel = group?.contentLanguage === "en" ? "general" : "genel";
    const topics = (group?.topics ?? []).filter((entry) => entry !== "genel" && entry !== "general");
    const close = () => ui.setNavOpen(false);
    // Muted groups show no channel markers; "mentions only" shows just the red counts.
    const markers = (channel: string, active: boolean): ChannelUnread | null => {
        const state = current?.channelUnread[channel];
        if (!state || active || level === "none") return null;
        return level === "mentions" ? (state.mentions ? { unread: false, mentions: state.mentions } : null) : state;
    };

    const menuItems = current?.group ? [
        ...(current.canInvite ? [{ id: "invite", label: tx(C.invite), icon: <UserPlus className="h-4 w-4" aria-hidden />, onSelect: current.openInvite }] : []),
        { id: "settings", label: tx(current.isManager ? C.settings : C.info), icon: <Settings className="h-4 w-4" aria-hidden />, onSelect: () => current.openSettings("general") },
        ...LEVELS.map((entry, index) => ({
            id: `notify-${entry.id}`,
            label: tx(entry.label),
            hint: tx(entry.hint),
            icon: <entry.icon className="h-4 w-4" aria-hidden />,
            checked: level === entry.id,
            heading: index === 0 ? tx(C.notifications) : undefined,
            onSelect: () => setGroupNotifyLevel(groupId, entry.id),
        })),
        {
            id: "leave",
            label: tx(C.leave),
            icon: <LogOut className="h-4 w-4" aria-hidden />,
            danger: true,
            disabled: current.role === "owner",
            hint: current.role === "owner" ? tx(C.ownerLeave) : undefined,
            separator: true,
            onSelect: current.leave,
        },
    ] : [];

    return (
        <>
            <div className="flex h-12 shrink-0 items-center border-b border-zinc-200 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-black/50">
                {menuItems.length ? (
                    <div className="w-full px-1.5">
                        <DropdownMenu
                            label={tx(C.menu, { name })}
                            align="start"
                            menuClassName="w-[13.5rem]"
                            triggerClassName="flex h-10 w-full items-center gap-2 rounded-md px-2.5 text-start font-bold text-zinc-900 transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-white dark:hover:bg-white/[0.06]"
                            trigger={<><span aria-hidden className="text-lg leading-none">{group?.emoji ?? summary?.emoji}</span><span className="min-w-0 flex-1 truncate">{name}</span><ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden /></>}
                            items={menuItems}
                        />
                    </div>
                ) : (
                    <p className="flex min-w-0 items-center gap-2 px-4 font-bold">
                        <span aria-hidden className="text-lg leading-none">{summary?.emoji}</span>
                        <span className="truncate">{name || "…"}</span>
                    </p>
                )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {current?.phase === "gone" ? (
                    <p className="px-2 py-3 text-sm text-zinc-500 dark:text-zinc-400">{tx(C.gone)}</p>
                ) : !group ? (
                    <ul aria-busy="true" aria-label={tx(C.loading)} className="space-y-2 px-2 pt-3">
                        {[0, 1, 2, 3].map((item) => <li key={item} className="h-4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" style={{ width: `${70 - item * 10}%` }} />)}
                    </ul>
                ) : (
                    <>
                        {current?.guide.show && (
                            <button
                                type="button"
                                onClick={() => { current.toggleGuide(); close(); }}
                                aria-pressed={current.guide.open}
                                className="mb-2 w-full rounded-lg border border-indigo-500/25 bg-indigo-500/[0.07] px-2.5 py-2 text-start transition hover:bg-indigo-500/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                <span className="flex items-center gap-2 text-[13px] font-bold text-indigo-700 dark:text-indigo-300"><Rocket className="h-4 w-4" aria-hidden />{tx(C.guide)}</span>
                                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-indigo-500/15" aria-hidden><span className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${Math.round((current.guide.done / Math.max(1, current.guide.total)) * 100)}%` }} /></span>
                                <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">{tx(C.guideProgress, { done: current.guide.done, total: current.guide.total })}</span>
                            </button>
                        )}
                        <SectionLabel id="group-channels">{tx(C.textChannels)}</SectionLabel>
                        <ul aria-labelledby="group-channels" className="space-y-0.5">
                            <li><ChannelLink href={groupHref(groupId)} active={view === "chat" && !topic} label={mainChannel} onClick={close} state={markers("", view === "chat" && !topic)} /></li>
                            {topics.map((entry) => (
                                <li key={entry}><ChannelLink href={groupHref(groupId, { topic: entry })} active={view === "chat" && topic === entry} label={entry} onClick={close} state={markers(entry.toLocaleLowerCase(), view === "chat" && topic === entry)} /></li>
                            ))}
                        </ul>
                        <SectionLabel>{tx(C.more)}</SectionLabel>
                        <ul className="space-y-0.5">
                            <li>
                                <Link
                                    href={groupHref(groupId, { view: "files" })}
                                    onClick={close}
                                    aria-current={view === "files" ? "page" : undefined}
                                    className={cx("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[15px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500", view === "files" ? "bg-zinc-300/60 text-zinc-900 dark:bg-white/10 dark:text-white" : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100")}
                                >
                                    <FolderOpen className="h-5 w-5 shrink-0" aria-hidden />
                                    <span className="min-w-0 flex-1 truncate">{tx(C.files)}</span>
                                    {current?.filesAvailable ? <span className="rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold tabular-nums text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{current.fileCount}</span> : <span className="truncate text-[10px] text-zinc-400" title={tx(C.filesOffline)}>{tx(C.filesOffline)}</span>}
                                </Link>
                            </li>
                            <li>
                                <button type="button" onClick={() => { current?.showPinned(); close(); }} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-[15px] font-medium text-zinc-600 transition hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100">
                                    <Pin className="h-5 w-5 shrink-0" aria-hidden />
                                    <span className="min-w-0 flex-1 truncate">{tx(C.pinned)}</span>
                                    {(current?.pinnedCount ?? 0) > 0 && <span className="rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold tabular-nums text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{current?.pinnedCount}</span>}
                                </button>
                            </li>
                        </ul>
                    </>
                )}
            </div>
        </>
    );
}

/** A text channel; unread ones are bold with a pill on the left, mentions add a red count (like Discord). */
function ChannelLink({ href, active, label, onClick, state }: { href: string; active: boolean; label: string; onClick: () => void; state: ChannelUnread | null }) {
    const { tx } = useI18n();
    const unread = Boolean(state?.unread);
    const mentions = state?.mentions ?? 0;
    return (
        <Link
            href={href}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            aria-label={mentions ? tx(C.mentionChannel, { name: label, count: mentions }) : unread ? tx(C.unreadChannel, { name: label }) : undefined}
            className={cx(
                "relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[15px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                active ? "bg-zinc-300/60 font-medium text-zinc-900 dark:bg-white/10 dark:text-white"
                    : unread || mentions ? "font-semibold text-zinc-900 hover:bg-zinc-200/70 dark:text-white dark:hover:bg-white/[0.05]"
                        : "font-medium text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100",
            )}
        >
            {(unread || mentions > 0) && !active && <span aria-hidden className="absolute -start-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-e-full bg-zinc-900 dark:bg-white" />}
            <Hash className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {mentions > 0 && <span className="inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-[18px] tabular-nums text-white">{badgeLabel(mentions)}</span>}
        </Link>
    );
}
