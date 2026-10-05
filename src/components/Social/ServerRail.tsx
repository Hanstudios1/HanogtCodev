"use client";

import { LayoutDashboard, Link2, Plus } from "lucide-react";
import Link from "next/link";
import { useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { cx } from "@/components/Groups/ui";
import ProductLogo from "@/components/ProductLogo";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_COLORS } from "@/lib/groups";
import { badgeLabel, groupHref, railBadge } from "@/lib/social/model";
import { useSocial } from "./context";

const C = {
    rail: { TR: "Hanogt Social ve grupların", EN: "Hanogt Social and your groups" },
    home: { TR: "Direkt mesajlar ve arkadaşlar", EN: "Direct messages and friends" },
    groups: { TR: "Grupların", EN: "Your groups" },
    create: { TR: "Grup oluştur", EN: "Create a group" },
    join: { TR: "Davet bağlantısıyla katıl", EN: "Join with an invite link" },
    dashboard: { TR: "Panele dön", EN: "Back to the dashboard" },
    unread: { TR: "{name}, okunmamış mesajlar var", EN: "{name}, unread messages" },
    mentions: { TR: "{name}, {count} bahsetme", EN: "{name}, {count} mentions" },
    pending: { TR: "{label} ({count} bekleyen)", EN: "{label} ({count} pending)" },
} satisfies Record<string, Copy>;

type Tip = { label: string; top: number; left: number } | null;

/**
 * The far-left server rail: Home (direct messages and friends), one round
 * icon per group (a rounded square on hover and when open, a pill on the left
 * for the open group and for unread messages, a red mention count), then
 * "create" and "join". Tooltips are drawn at fixed positions because the rail
 * scrolls (a scrolling box would clip them).
 */
export default function ServerRail() {
    const { tx } = useI18n();
    const { route, groups, homeBadge, ui } = useSocial();
    const [tip, setTip] = useState<Tip>(null);

    const showTip = (label: string) => (event: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 14 });
    };
    const hideTip = () => setTip(null);
    const tipProps = (label: string) => ({ onPointerEnter: showTip(label), onPointerLeave: hideTip, onFocus: showTip(label), onBlur: hideTip });

    const homeActive = route.kind !== "group";
    const homeLabel = homeBadge > 0 ? tx(C.pending, { label: tx(C.home), count: homeBadge }) : tx(C.home);

    return (
        <nav aria-label={tx(C.rail)} className="flex h-full w-[72px] shrink-0 flex-col items-center bg-zinc-200 dark:bg-black">
            <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onScroll={hideTip}>
                <RailEntry active={homeActive} dot={false} {...tipProps("Hanogt Social")}>
                    <Link
                        href="/social"
                        aria-label={homeLabel}
                        aria-current={homeActive ? "page" : undefined}
                        className={cx(
                            "relative flex h-12 w-12 items-center justify-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:focus-visible:ring-offset-black",
                            homeActive ? "rounded-2xl bg-indigo-600" : "rounded-[24px] bg-white hover:rounded-2xl hover:bg-indigo-600 dark:bg-zinc-800",
                        )}
                    >
                        <ProductLogo product="social" size={32} />
                        <Badge count={homeBadge} />
                    </Link>
                </RailEntry>

                <div className="h-0.5 w-8 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-800" aria-hidden />

                <ul aria-label={tx(C.groups)} className="flex w-full flex-col items-center gap-2">
                    {groups.list.map((group) => {
                        const active = route.kind === "group" && route.groupId === group.id;
                        const badge = railBadge(groups.unread[group.id], groups.levels[group.id]);
                        const palette = GROUP_COLORS[group.color] ?? GROUP_COLORS.indigo;
                        const label = badge.count > 0 ? tx(C.mentions, { name: group.name, count: badge.count }) : badge.dot ? tx(C.unread, { name: group.name }) : group.name;
                        return (
                            <li key={group.id} className="w-full">
                                <RailEntry active={active} dot={badge.dot || badge.count > 0} {...tipProps(group.name)}>
                                    <Link
                                        href={groupHref(group.id)}
                                        aria-label={label}
                                        aria-current={active ? "page" : undefined}
                                        className={cx(
                                            "relative flex h-12 w-12 select-none items-center justify-center bg-gradient-to-br text-2xl text-white shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:focus-visible:ring-offset-black",
                                            palette.gradient,
                                            active ? "rounded-2xl" : "rounded-[24px] hover:rounded-2xl",
                                        )}
                                    >
                                        <span aria-hidden className="drop-shadow-sm">{group.emoji}</span>
                                        <Badge count={badge.count} />
                                    </Link>
                                </RailEntry>
                            </li>
                        );
                    })}
                </ul>

                <RailEntry active={false} dot={false} {...tipProps(tx(C.create))}>
                    <button type="button" onClick={ui.openCreateGroup} aria-label={tx(C.create)} className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-white text-emerald-600 transition-all duration-200 hover:rounded-2xl hover:bg-emerald-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-zinc-800 dark:text-emerald-400 dark:hover:bg-emerald-600 dark:hover:text-white">
                        <Plus className="h-6 w-6" aria-hidden />
                    </button>
                </RailEntry>
                <RailEntry active={false} dot={false} {...tipProps(tx(C.join))}>
                    <button type="button" onClick={ui.openJoin} aria-label={tx(C.join)} className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-white text-emerald-600 transition-all duration-200 hover:rounded-2xl hover:bg-emerald-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-zinc-800 dark:text-emerald-400 dark:hover:bg-emerald-600 dark:hover:text-white">
                        <Link2 className="h-5 w-5" aria-hidden />
                    </button>
                </RailEntry>
            </div>
            <div className="w-full shrink-0 border-t border-zinc-300/70 py-2 dark:border-white/5">
                <RailEntry active={false} dot={false} {...tipProps(tx(C.dashboard))}>
                    <Link href="/dashboard" aria-label={tx(C.dashboard)} className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-white text-zinc-600 transition-all duration-200 hover:rounded-2xl hover:bg-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-zinc-800 dark:text-zinc-300">
                        <LayoutDashboard className="h-5 w-5" aria-hidden />
                    </Link>
                </RailEntry>
            </div>
            {tip && (
                <span role="tooltip" className="pointer-events-none fixed z-[70] -translate-y-1/2 whitespace-nowrap rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-semibold text-white shadow-xl dark:bg-zinc-800" style={{ top: tip.top, left: tip.left }}>
                    {tip.label}
                </span>
            )}
        </nav>
    );
}

/** One rail slot with the pill indicator on its left edge. */
function RailEntry({ active, dot, children, ...events }: { active: boolean; dot: boolean; children: ReactNode } & Pick<React.HTMLAttributes<HTMLDivElement>, "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur">) {
    return (
        <div className="group relative flex w-full justify-center" {...events}>
            <span
                aria-hidden
                className={cx(
                    "absolute start-0 top-1/2 w-1 -translate-y-1/2 rounded-e-full bg-zinc-900 transition-all duration-200 dark:bg-white",
                    active ? "h-10" : dot ? "h-2 group-hover:h-5" : "h-0 group-hover:h-5",
                )}
            />
            {children}
        </div>
    );
}

function Badge({ count }: { count: number }) {
    if (count <= 0) return null;
    return (
        <span aria-hidden className="absolute -bottom-1 -end-1 min-w-[20px] rounded-full bg-red-500 px-1 text-center text-[11px] font-bold leading-5 tabular-nums text-white ring-4 ring-zinc-200 dark:ring-black">
            {badgeLabel(count)}
        </span>
    );
}
