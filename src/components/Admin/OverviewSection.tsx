"use client";

import { motion } from "framer-motion";
import {
    ArrowRight, Boxes, FileCode2, Flag, Gamepad2, MessageSquareText, MessagesSquare, Radio, RefreshCw, Siren, UserPlus, Users, UsersRound,
    type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { COMMON, RISK_COPY, SECURITY_ACTION_COPY } from "./copy";
import { formatNumber, formatRelativeTime, useAdminResource, useNow, type AdminResource } from "./hooks";
import { RISK_TONES } from "./tones";
import type { AdminPermissions, AdminSectionId, AdminSecurityEventsResponse, AdminStatsResponse, StatCount, StatKey } from "./types";
import { Avatar, Badge, Button, EmptyState, ErrorNotice, FOCUS_RING, LoadingRows, Panel, RelativeTime, SectionHeader, cx, type Tone } from "./ui";

type StatCard = {
    key: StatKey;
    icon: LucideIcon;
    label: Copy;
    hint?: Copy;
    tone: Tone;
    target?: AdminSectionId;
    /** Highlighted while the count is above zero (work waiting). */
    attention?: boolean;
};

const STAT_CARDS: StatCard[] = [
    { key: "reportsOpen", icon: Flag, label: { TR: "Açık bildirimler", EN: "Open reports" }, hint: { TR: "Media moderasyon kuyruğu", EN: "Media moderation queue" }, tone: "amber", target: "moderation", attention: true },
    { key: "feedbackOpen", icon: MessageSquareText, label: { TR: "Açık geri bildirimler", EN: "Open feedback" }, hint: { TR: "Yanıt bekleyenler", EN: "Waiting for an answer" }, tone: "fuchsia", target: "feedback", attention: true },
    { key: "securityEvents7d", icon: Siren, label: { TR: "Güvenlik olayları", EN: "Security events" }, hint: { TR: "Son 7 gün", EN: "Last 7 days" }, tone: "red", target: "security" },
    { key: "users", icon: Users, label: { TR: "Kullanıcılar", EN: "Users" }, hint: { TR: "Kayıtlı hesaplar", EN: "Registered accounts" }, tone: "indigo", target: "users" },
    { key: "newsComments", icon: MessagesSquare, label: { TR: "Haber yorumları", EN: "News comments" }, tone: "sky", target: "moderation" },
    { key: "projects", icon: FileCode2, label: { TR: "Kod projeleri", EN: "Code projects" }, tone: "sky" },
    { key: "gameProjects", icon: Boxes, label: { TR: "Oyun projeleri", EN: "Game projects" }, tone: "violet" },
    { key: "mediaPosts", icon: Radio, label: { TR: "Media gönderileri", EN: "Media posts" }, tone: "fuchsia" },
    { key: "arcadeGames", icon: Gamepad2, label: { TR: "Arcade oyunları", EN: "Arcade games" }, tone: "emerald", target: "moderation" },
    { key: "groups", icon: UsersRound, label: { TR: "Gruplar", EN: "Groups" }, tone: "indigo" },
];

const ICON_TONES: Record<Tone, string> = {
    zinc: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
    indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    fuchsia: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    red: "bg-red-500/10 text-red-600 dark:text-red-300",
};

const SECTION_PERMISSION: Record<AdminSectionId, keyof AdminPermissions> = {
    overview: "viewStats",
    users: "manageUsers",
    moderation: "moderate",
    feedback: "feedback",
    announcements: "manageAnnouncements",
    security: "viewSecurityEvents",
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

function StatTile({ card, value, onOpen }: { card: StatCard; value: StatCount; onOpen?: () => void }) {
    const { tx } = useI18n();
    const Icon = card.icon;
    const waiting = Boolean(card.attention && value && value.count > 0);
    const body: ReactNode = (
        <>
            <div className="flex items-start justify-between gap-3">
                <span className={cx("grid h-10 w-10 place-items-center rounded-xl", ICON_TONES[card.tone])}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {waiting ? <span className="mt-1 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" /> : null}
                {onOpen && !waiting ? (
                    <ArrowRight className="h-4 w-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 dark:text-zinc-600" aria-hidden="true" />
                ) : null}
            </div>
            <p className="mt-4 text-3xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white"><StatValue value={value} /></p>
            <p className="mt-1 text-[13px] font-bold text-zinc-700 dark:text-zinc-200">{tx(card.label)}</p>
            {card.hint ? <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{tx(card.hint)}</p> : null}
        </>
    );
    const className = cx(
        "group relative flex h-full flex-col rounded-2xl border bg-white p-4 text-start shadow-sm transition dark:bg-zinc-900/70",
        waiting ? "border-amber-300 dark:border-amber-500/40" : "border-zinc-200 dark:border-white/10",
        onOpen && "hover:-translate-y-0.5 hover:shadow-lg",
        FOCUS_RING,
    );
    return onOpen ? <button type="button" onClick={onOpen} className={className}>{body}</button> : <div className={className}>{body}</div>;
}

export default function OverviewSection({ stats, permissions, onNavigate }: {
    stats: AdminResource<AdminStatsResponse>;
    permissions: AdminPermissions;
    onNavigate: (section: AdminSectionId) => void;
}) {
    const { tx, locale } = useI18n();
    const now = useNow();
    const events = useAdminResource<AdminSecurityEventsResponse>("/api/admin/security-events?limit=6");
    const data = stats.data;
    const updated = data ? formatRelativeTime(data.generatedAt, now, locale) : "";

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Genel Bakış", EN: "Overview" })}
                description={tx({ TR: "Platformun anlık durumu, bekleyen işler ve son hareketler.", EN: "The platform at a glance: pending work and recent activity." })}
                actions={(
                    <>
                        {updated ? <span className="text-[12px] text-zinc-500">{tx(COMMON.updatedAgo, { time: updated })}</span> : null}
                        <Button size="sm" icon={RefreshCw} busy={stats.loading && Boolean(data)} onClick={() => { stats.reload(); events.reload(); }}>{tx(COMMON.refresh)}</Button>
                    </>
                )}
            />

            {stats.error && !data ? <ErrorNotice error={stats.error} onRetry={stats.reload} className="mb-5" /> : null}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {STAT_CARDS.map((card, index) => (
                    <motion.div key={card.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                        {data ? (
                            <StatTile
                                card={card}
                                value={data.counts[card.key]}
                                onOpen={card.target && permissions[SECTION_PERMISSION[card.target]] ? () => onNavigate(card.target as AdminSectionId) : undefined}
                            />
                        ) : (
                            <div className="h-[148px] animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900/70" aria-hidden="true" />
                        )}
                    </motion.div>
                ))}
            </div>
            {data ? (
                <p className="mt-3 text-[12px] text-zinc-500 dark:text-zinc-400">
                    {tx({ TR: "Sayılar {cap} kayıtta durur; \"+\" en az bu kadar anlamına gelir.", EN: "Counts stop at {cap}; \"+\" means at least that many." }, { cap: formatNumber(data.countCap, locale) })}
                </p>
            ) : null}

            <div className="mt-6 grid gap-5 xl:grid-cols-2">
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

                <Panel
                    icon={Siren}
                    title={tx({ TR: "Son güvenlik olayları", EN: "Recent security events" })}
                    description={tx({ TR: "Engellenen riskli istekler", EN: "Blocked risky requests" })}
                    actions={<Button size="sm" variant="ghost" onClick={() => onNavigate("security")}>{tx({ TR: "Tümünü gör", EN: "View all" })}</Button>}
                    bodyClassName="p-3"
                >
                    {events.error && !events.data ? (
                        <ErrorNotice error={events.error} onRetry={events.reload} />
                    ) : !events.data ? (
                        <LoadingRows rows={4} />
                    ) : events.data.events.length === 0 ? (
                        <EmptyState icon={Siren} title={tx({ TR: "Kayıtlı olay yok", EN: "No recorded events" })} description={tx({ TR: "Güvenlik taraması bir isteği engellediğinde burada görünür.", EN: "Shown here when the security scanner blocks a request." })} />
                    ) : (
                        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                            {events.data.events.map((event) => (
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
            </div>
        </div>
    );
}
