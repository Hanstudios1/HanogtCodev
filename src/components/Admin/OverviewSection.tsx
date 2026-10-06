"use client";

import { motion } from "framer-motion";
import {
    ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, FileCode2, Flag, Gamepad2, LifeBuoy, MessageSquareText, MessagesSquare, Minus, Radio, RefreshCw, ShieldBan, Siren, Sparkles, UserPlus, Users, UsersRound,
    type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { ColumnChart, Sparkline, type ChartPoint } from "./charts";
import { COMMON, RISK_COPY, SECURITY_ACTION_COPY } from "./copy";
import { useCounters } from "./counters";
import { formatNumber, formatRelativeTime, useAdminResource, useNow, type AdminResource } from "./hooks";
import { RISK_TONES } from "./tones";
import type {
    ActivityRange, ActivitySeriesKey, AdminActivityResponse, AdminPermissions, AdminSectionId, AdminSecurityEventsResponse, AdminStatsResponse, StatCount, StatKey,
} from "./types";
import { Avatar, Badge, Button, EmptyState, ErrorNotice, FilterChips, FOCUS_RING, LoadingRows, Panel, RelativeTime, SectionHeader, cx } from "./ui";

/*
 * The panel's first page: how the platform moved over a range (sign-ups,
 * Hanogt AI messages, blocked requests, AutoMod), the work waiting in other
 * sections, the totals and the latest sign-ups and security events.
 */

type Series = {
    key: ActivitySeriesKey;
    icon: LucideIcon;
    label: Copy;
    /** Whether a rise is good news (null: neither). */
    upIsGood: boolean | null;
};

const SERIES: Series[] = [
    { key: "signups", icon: UserPlus, label: { TR: "Yeni kayıtlar", EN: "New sign-ups" }, upIsGood: true },
    { key: "aiMessages", icon: Sparkles, label: { TR: "Hanogt AI mesajları", EN: "Hanogt AI messages" }, upIsGood: true },
    { key: "securityEvents", icon: Siren, label: { TR: "Engellenen riskli istekler", EN: "Blocked risky requests" }, upIsGood: false },
    { key: "automodStops", icon: ShieldBan, label: { TR: "AutoMod'un durdurduğu mesajlar", EN: "Messages AutoMod stopped" }, upIsGood: null },
];

const RANGE_COPY: Record<ActivityRange, Copy> = {
    7: { TR: "Son 7 gün", EN: "Last 7 days" },
    30: { TR: "Son 30 gün", EN: "Last 30 days" },
    90: { TR: "Son 13 hafta", EN: "Last 13 weeks" },
};

const PREVIOUS_COPY: Record<ActivityRange, Copy> = {
    7: { TR: "önceki 7 güne göre", EN: "vs the 7 days before" },
    30: { TR: "önceki 30 güne göre", EN: "vs the 30 days before" },
    90: { TR: "önceki 13 haftaya göre", EN: "vs the 13 weeks before" },
};

type WaitingCard = { key: "reportsOpen" | "ticketsOpen" | "feedbackOpen"; icon: LucideIcon; label: Copy; target: AdminSectionId };

const WAITING: WaitingCard[] = [
    { key: "reportsOpen", icon: Flag, label: { TR: "Açık içerik bildirimleri", EN: "Open content reports" }, target: "moderation" },
    { key: "ticketsOpen", icon: LifeBuoy, label: { TR: "Açık destek talepleri", EN: "Open support tickets" }, target: "tickets" },
    { key: "feedbackOpen", icon: MessageSquareText, label: { TR: "Yanıt bekleyen geri bildirimler", EN: "Feedback waiting for an answer" }, target: "feedback" },
];

type TotalCard = { key: StatKey; icon: LucideIcon; label: Copy; target?: AdminSectionId };

const TOTALS: TotalCard[] = [
    { key: "users", icon: Users, label: { TR: "Kullanıcılar", EN: "Users" }, target: "users" },
    { key: "projects", icon: FileCode2, label: { TR: "Kod projeleri", EN: "Code projects" } },
    { key: "gameProjects", icon: Boxes, label: { TR: "Oyun projeleri", EN: "Game projects" } },
    { key: "arcadeGames", icon: Gamepad2, label: { TR: "Arcade oyunları", EN: "Arcade games" }, target: "moderation" },
    { key: "mediaPosts", icon: Radio, label: { TR: "Media gönderileri", EN: "Media posts" }, target: "moderation" },
    { key: "groups", icon: UsersRound, label: { TR: "Gruplar", EN: "Groups" }, target: "social" },
    { key: "newsComments", icon: MessagesSquare, label: { TR: "Haber yorumları", EN: "News comments" }, target: "moderation" },
];

export const SECTION_PERMISSION: Record<AdminSectionId, keyof AdminPermissions> = {
    overview: "viewStats",
    users: "manageUsers",
    moderation: "moderate",
    social: "moderate",
    ai: "viewStats",
    tickets: "tickets",
    feedback: "feedback",
    announcements: "manageAnnouncements",
    plans: "managePlans",
    security: "viewSecurityEvents",
    cloud: "cloudHealth",
    audit: "viewAuditLog",
};

function StatValue({ value }: { value: StatCount }) {
    const { tx, locale } = useI18n();
    if (!value) {
        return (
            <span title={tx(COMMON.unavailable)}>
                <span aria-hidden="true">—</span>
                <span className="sr-only">{tx(COMMON.unavailable)}</span>
            </span>
        );
    }
    return <>{formatNumber(value.count, locale)}{value.capped ? "+" : ""}</>;
}

/** The change against the period before: signed, with an arrow, colored only by whether it is good news. */
function Change({ total, previous, upIsGood, range }: { total: number | null; previous: number | null; upIsGood: boolean | null; range: ActivityRange }) {
    const { tx, locale } = useI18n();
    if (total === null || previous === null) return <span className="text-[11px] text-zinc-400">—</span>;
    const difference = total - previous;
    const Icon = difference > 0 ? ArrowUpRight : difference < 0 ? ArrowDownRight : Minus;
    const good = difference === 0 || upIsGood === null ? null : (difference > 0) === upIsGood;
    const text = previous === 0
        ? (difference === 0 ? "0" : `+${formatNumber(difference, locale)}`)
        : `${difference > 0 ? "+" : difference < 0 ? "−" : ""}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.abs((difference / previous) * 100))}%`;
    return (
        <span className="inline-flex flex-wrap items-center gap-x-1 text-[11px]">
            <span className={cx(
                "inline-flex items-center gap-0.5 font-bold tabular-nums",
                good === true ? "text-[#006300] dark:text-[#0ca30c]" : good === false ? "text-[#b42f2f] dark:text-[#e66767]" : "text-zinc-600 dark:text-zinc-300",
            )}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {text}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">{tx(PREVIOUS_COPY[range])}</span>
        </span>
    );
}

function dayFormats(locale: string) {
    const options = { timeZone: "Europe/Istanbul" } as const;
    return {
        axis: new Intl.DateTimeFormat(locale, { ...options, day: "numeric", month: "short" }),
        day: new Intl.DateTimeFormat(locale, { ...options, weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    };
}

/** The chart's points: a day labelled by its date, a week by its first and last day. */
function pointsOf(activity: AdminActivityResponse, key: ActivitySeriesKey, locale: string): ChartPoint[] {
    const format = dayFormats(locale);
    return activity.buckets.map((bucket) => {
        const start = new Date(bucket.start);
        const lastDay = new Date(Date.parse(bucket.end) - 1);
        return {
            label: format.axis.format(start),
            title: activity.unit === "week" ? `${format.axis.format(start)} – ${format.axis.format(lastDay)}` : format.day.format(start),
            value: bucket.values[key],
        };
    });
}

export default function OverviewSection({ stats, onRefreshStats, permissions, onNavigate }: {
    stats: AdminResource<AdminStatsResponse>;
    /** Counts the totals again on the server (the Refresh button). */
    onRefreshStats: () => void;
    permissions: AdminPermissions;
    onNavigate: (section: AdminSectionId, params?: Record<string, string>) => void;
}) {
    const { tx, locale } = useI18n();
    const now = useNow();
    const { counters, refresh: refreshCounters } = useCounters();
    const [range, setRange] = useState<ActivityRange>(30);
    const [selected, setSelected] = useState<ActivitySeriesKey>("signups");
    // A refresh asks the server to count again instead of answering from its five-minute copy.
    const [fresh, setFresh] = useState(0);
    const activity = useAdminResource<AdminActivityResponse>(`/api/admin/activity?range=${range}${fresh ? `&fresh=1&n=${fresh}` : ""}`);
    const events = useAdminResource<AdminSecurityEventsResponse>(permissions.viewSecurityEvents ? "/api/admin/security-events?limit=6" : null);
    const data = stats.data;
    const shown = activity.data;
    const updated = data ? formatRelativeTime(data.generatedAt, now, locale) : "";
    const canOpen = (section: AdminSectionId) => permissions[SECTION_PERMISSION[section]];
    const current = SERIES.find((series) => series.key === selected) ?? SERIES[0];

    const refresh = () => {
        onRefreshStats();
        events.reload();
        refreshCounters();
        setFresh((value) => value + 1);
    };

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Genel Bakış", EN: "Overview" })}
                description={tx({ TR: "Platformun gidişatı, bekleyen işler ve son hareketler.", EN: "How the platform is moving, pending work and recent activity." })}
                actions={(
                    <>
                        {updated ? <span className="text-[12px] text-zinc-500">{tx(COMMON.updatedAgo, { time: updated })}</span> : null}
                        <Button size="sm" icon={RefreshCw} busy={(stats.loading && Boolean(data)) || (activity.loading && Boolean(shown))} onClick={refresh}>{tx(COMMON.refresh)}</Button>
                    </>
                )}
            />

            {/* One filter row scopes the tiles and the chart below it. */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <FilterChips<`${ActivityRange}`>
                    label={tx({ TR: "Zaman aralığı", EN: "Time range" })}
                    value={`${range}`}
                    onChange={(value) => setRange(Number(value) as ActivityRange)}
                    options={([7, 30, 90] as const).map((value) => ({ value: `${value}`, label: tx(RANGE_COPY[value]) }))}
                />
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{tx({ TR: "Günler Türkiye saatine göre", EN: "Days in Türkiye time" })}</span>
            </div>

            {activity.error && !shown ? <ErrorNotice error={activity.error} onRetry={activity.reload} className="mb-4" /> : null}

            <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 xl:grid-cols-4" role="group" aria-label={tx({ TR: "Gösterge seç", EN: "Pick a measure" })}>
                {SERIES.map((series, index) => {
                    const Icon = series.icon;
                    const active = series.key === selected;
                    const total = shown?.totals[series.key] ?? null;
                    return (
                        <motion.button
                            key={series.key}
                            type="button"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.04 }}
                            onClick={() => setSelected(series.key)}
                            aria-pressed={active}
                            className={cx(
                                "flex min-w-0 flex-col rounded-2xl border bg-white p-4 text-start transition dark:bg-zinc-900/70",
                                active ? "border-zinc-900 shadow-sm dark:border-white/60" : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20",
                                activity.loading && shown && "opacity-60",
                                FOCUS_RING,
                            )}
                        >
                            <span className="flex items-center gap-2 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="truncate">{tx(series.label)}</span>
                            </span>
                            {shown ? (
                                <>
                                    <span className="mt-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-white">{total === null ? "—" : formatNumber(total, locale)}</span>
                                    <span className="mt-1 min-h-[18px]"><Change total={total} previous={shown.previous[series.key]} upIsGood={series.upIsGood} range={shown.range} /></span>
                                    <Sparkline className="mt-3" values={shown.buckets.map((bucket) => bucket.values[series.key])} />
                                </>
                            ) : (
                                <span className="mt-2 block h-[86px] animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.04]" aria-hidden="true" />
                            )}
                        </motion.button>
                    );
                })}
            </div>

            <Panel
                className="mt-4"
                icon={current.icon}
                title={tx(current.label)}
                description={shown ? tx(shown.unit === "week" ? { TR: "Hafta hafta, {range}", EN: "Week by week, {range}" } : { TR: "Gün gün, {range}", EN: "Day by day, {range}" }, { range: tx(RANGE_COPY[shown.range]).toLocaleLowerCase(locale) }) : undefined}
                bodyClassName="p-4"
            >
                {shown ? (
                    <ColumnChart
                        points={pointsOf(shown, current.key, locale)}
                        seriesLabel={tx(current.label)}
                        busy={activity.loading}
                        caption={current.key === "aiMessages"
                            ? tx({ TR: "Sohbet, kendi bağlantılar, API ve gruplar birlikte; ayrıntı Hanogt AI bölümünde.", EN: "Chat, own connections, the API and groups together; details in the Hanogt AI section." })
                            : current.key === "automodStops"
                                ? tx({ TR: "Grupların AutoMod kurallarına takılıp gönderilmeyen mesajlar.", EN: "Group messages that broke an AutoMod rule and weren't sent." })
                                : current.key === "securityEvents"
                                    ? tx({ TR: "Güvenlik taramasının engellediği kod çalıştırma ve yayın istekleri.", EN: "Code runs and publications the security scan blocked." })
                                    : tx({ TR: "Açılan yeni hesaplar.", EN: "New accounts opened." })}
                    />
                ) : activity.error ? (
                    <p className="py-10 text-center text-sm text-zinc-500">{tx(COMMON.unavailable)}</p>
                ) : (
                    <div className="h-[230px] animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.04]" aria-hidden="true" />
                )}
            </Panel>

            {stats.error && !data ? <ErrorNotice error={stats.error} onRetry={stats.reload} className="mt-4" /> : null}

            <h3 className="mt-8 text-[13px] font-bold text-zinc-900 dark:text-white">{tx({ TR: "Bekleyen işler", EN: "Waiting for you" })}</h3>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {WAITING.map((card) => {
                    const Icon = card.icon;
                    // The same live counters as the side bar.
                    const value = counters?.[card.key] ?? data?.counts[card.key] ?? null;
                    const waiting = Boolean(value && value.count > 0);
                    const open = canOpen(card.target);
                    const body = (
                        <>
                            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", waiting ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400")}>
                                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-xl font-black text-zinc-900 dark:text-white">{counters || data ? <StatValue value={value} /> : "…"}</span>
                                <span className="block truncate text-[12px] text-zinc-600 dark:text-zinc-400">{tx(card.label)}</span>
                            </span>
                            {open ? <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 rtl:rotate-180 dark:text-zinc-600" aria-hidden="true" /> : null}
                        </>
                    );
                    const className = cx(
                        "group flex items-center gap-3 rounded-2xl border bg-white p-3.5 text-start transition dark:bg-zinc-900/70",
                        waiting ? "border-amber-300 dark:border-amber-500/40" : "border-zinc-200 dark:border-white/10",
                        open && "hover:border-zinc-300 dark:hover:border-white/20",
                        FOCUS_RING,
                    );
                    return open
                        ? <button key={card.key} type="button" onClick={() => onNavigate(card.target)} className={className}>{body}</button>
                        : <div key={card.key} className={className}>{body}</div>;
                })}
            </div>

            <h3 className="mt-8 text-[13px] font-bold text-zinc-900 dark:text-white">{tx({ TR: "Toplamlar", EN: "Totals" })}</h3>
            <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-4 xl:grid-cols-7 dark:border-white/10 dark:bg-white/10">
                {TOTALS.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.key} className="bg-white p-3.5 dark:bg-zinc-900">
                            <dt className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{tx(card.label)}</span>
                            </dt>
                            <dd className="mt-1 text-lg font-black text-zinc-900 dark:text-white">{data ? <StatValue value={data.counts[card.key]} /> : "…"}</dd>
                        </div>
                    );
                })}
            </dl>
            {data ? (
                <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {tx({ TR: "Sayılar {cap} kayıtta durur; \"+\" en az bu kadar anlamına gelir.", EN: "Counts stop at {cap}; \"+\" means at least that many." }, { cap: formatNumber(data.countCap, locale) })}
                </p>
            ) : null}

            <div className="mt-8 grid gap-5 xl:grid-cols-2">
                <Panel
                    icon={UserPlus}
                    title={tx({ TR: "Yeni kayıtlar", EN: "Recent sign-ups" })}
                    description={tx({ TR: "En son katılan 10 hesap", EN: "The 10 newest accounts" })}
                    actions={permissions.manageUsers ? <Button size="sm" variant="ghost" onClick={() => onNavigate("users")}>{tx({ TR: "Tüm kullanıcılar", EN: "All users" })}</Button> : undefined}
                    bodyClassName="p-3"
                >
                    {!data ? (
                        stats.error ? <p className="p-3 text-sm text-zinc-500">{tx(COMMON.unavailable)}</p> : <LoadingRows rows={4} />
                    ) : data.recentSignups.length === 0 ? (
                        <EmptyState icon={UserPlus} title={tx({ TR: "Henüz kayıt yok", EN: "No sign-ups yet" })} description={tx({ TR: "Yeni hesaplar burada görünecek.", EN: "New accounts will show up here." })} />
                    ) : (
                        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                            {data.recentSignups.map((user) => (
                                <li key={user.email} className="flex items-center gap-3 px-2 py-2.5">
                                    <Avatar src={user.avatarUrl} name={user.username || user.email} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-zinc-900 dark:text-white">{user.username || user.email.split("@")[0]}</p>
                                        <p className="truncate text-[12px] text-zinc-500" dir="ltr">{user.email}</p>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                        {user.provider ? <Badge tone={user.provider === "google" ? "sky" : "zinc"}>{user.provider === "google" ? "Google" : tx({ TR: "E-posta", EN: "E-mail" })}</Badge> : null}
                                        <RelativeTime iso={user.createdAt} className="text-[11px] text-zinc-500" />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                {permissions.viewSecurityEvents ? (
                    <Panel
                        icon={Siren}
                        title={tx({ TR: "Son güvenlik olayları", EN: "Recent security events" })}
                        description={tx({ TR: "Engellenen riskli istekler ve hesap uyarıları", EN: "Blocked risky requests and account alerts" })}
                        actions={<Button size="sm" variant="ghost" onClick={() => onNavigate("security")}>{tx({ TR: "Tümünü gör", EN: "View all" })}</Button>}
                        bodyClassName="p-3"
                    >
                        {events.error && !events.data ? (
                            <ErrorNotice error={events.error} onRetry={events.reload} />
                        ) : !events.data ? (
                            <LoadingRows rows={4} />
                        ) : events.data.items.length === 0 ? (
                            <EmptyState icon={Siren} title={tx({ TR: "Kayıtlı olay yok", EN: "No recorded events" })} description={tx({ TR: "Güvenlik taraması bir isteği engellediğinde burada görünür.", EN: "Shown here when the security scanner blocks a request." })} />
                        ) : (
                            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                                {events.data.items.map((event) => (
                                    <li key={event.id} className="flex items-center gap-3 px-2 py-2.5">
                                        <Badge tone={RISK_TONES[event.risk]}>{tx(RISK_COPY[event.risk])}</Badge>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-zinc-900 dark:text-white">{SECURITY_ACTION_COPY[event.action] ? tx(SECURITY_ACTION_COPY[event.action]) : event.action}</p>
                                            <p className="truncate text-[12px] text-zinc-500" dir="ltr">{event.actor || "—"}</p>
                                        </div>
                                        <RelativeTime iso={event.createdAt} className="shrink-0 text-[11px] text-zinc-500" />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                ) : null}
            </div>
        </div>
    );
}
